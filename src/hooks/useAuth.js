import { useState, useEffect } from 'react'
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  GoogleAuthProvider,
  signInWithPopup,
  fetchSignInMethodsForEmail,
  linkWithCredential,
  updateProfile,
} from 'firebase/auth'
import { doc, getDoc, setDoc, collection, query, where, getDocs } from 'firebase/firestore'
import { auth, db } from '../lib/firebase'

// ── Human-readable error messages ─────────────────────────────────────────────
export function formatAuthError(err) {
  const code = err?.code || ''
  switch (code) {
    case 'auth/unauthorized-domain':
      return 'This domain is not authorised in Firebase. Go to Firebase Console → Authentication → Authorized domains and add your domain.'
    case 'auth/user-not-found':
      return 'No account found with this email.'
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'Incorrect email or password.'
    case 'auth/email-already-in-use':
      return 'An account with this email already exists. Try signing in instead.'
    case 'auth/weak-password':
      return 'Password must be at least 6 characters.'
    case 'auth/invalid-email':
      return 'Please enter a valid email address.'
    case 'auth/popup-closed-by-user':
      return 'Google sign-in was closed. Please try again.'
    case 'auth/popup-blocked':
      return 'Popup was blocked by your browser. Please allow popups for this site.'
    case 'auth/too-many-requests':
      return 'Too many failed attempts. Please try again later.'
    case 'auth/network-request-failed':
      return 'Network error. Please check your internet connection.'
    default:
      return err?.message || 'An unexpected error occurred. Please try again.'
  }
}

// ── Helper: read Firestore user doc ──────────────────────────────────────────
async function readUserDoc(uid) {
  const snap = await getDoc(doc(db, 'users', uid))
  return snap.exists() ? { uid, ...snap.data() } : null
}

// ── Hook ──────────────────────────────────────────────────────────────────────
export function useAuth() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        const userData = await readUserDoc(firebaseUser.uid)
        if (userData) {
          setUser(userData)
        } else {
          // Doc not yet written (race on first register/google login) — keep minimal state
          setUser({
            uid: firebaseUser.uid,
            email: firebaseUser.email,
            name: firebaseUser.displayName || '',
            orgId: null,
            role: 'employee',
          })
        }
      } else {
        setUser(null)
      }
      setLoading(false)
    })
    return unsubscribe
  }, [])

  // ── Email/password sign-in ─────────────────────────────────────────────────
  const login = async (email, password) => {
    const result = await signInWithEmailAndPassword(auth, email, password)
    // Re-read doc to ensure latest state (avoids stale cache)
    const userData = await readUserDoc(result.user.uid)
    if (userData) setUser(userData)
    return result.user
  }

  // ── Register new user ──────────────────────────────────────────────────────
  // orgId may come from Create Account form (blank = null, prompts org join modal)
  const register = async (name, email, password, orgId) => {
    const result = await createUserWithEmailAndPassword(auth, email, password)
    const firebaseUser = result.user
    await updateProfile(firebaseUser, { displayName: name })

    const resolvedOrgId = orgId?.trim() || null

    // If org code supplied, validate it exists in Firestore
    if (resolvedOrgId) {
      const orgSnap = await queryOrgByCode(resolvedOrgId)
      if (!orgSnap) throw new Error('Organisation code not found. Please check and try again.')
    }

    const userDoc = {
      email,
      name,
      orgId: resolvedOrgId,
      role: 'employee',
      createdAt: new Date().toISOString(),
    }
    await setDoc(doc(db, 'users', firebaseUser.uid), userDoc)
    // Manually set state to avoid race with onAuthStateChanged
    setUser({ uid: firebaseUser.uid, ...userDoc })
    return firebaseUser
  }

  // ── Google sign-in (with account linking if same email) ───────────────────
  const loginWithGoogle = async () => {
    const provider = new GoogleAuthProvider()
    try {
      const result = await signInWithPopup(auth, provider)
      const firebaseUser = result.user

      let userData = await readUserDoc(firebaseUser.uid)
      if (!userData) {
        // New Google user — write minimal doc, prompt org join
        const newDoc = {
          email: firebaseUser.email,
          name: firebaseUser.displayName || '',
          orgId: null,
          role: 'employee',
          createdAt: new Date().toISOString(),
        }
        await setDoc(doc(db, 'users', firebaseUser.uid), newDoc)
        userData = { uid: firebaseUser.uid, ...newDoc }
      }
      setUser(userData)
      return firebaseUser
    } catch (err) {
      if (err.code === 'auth/account-exists-with-different-credential') {
        const email = err.customData?.email
        if (email) {
          const methods = await fetchSignInMethodsForEmail(auth, email)
          if (methods.includes('password')) {
            const linkError = new Error('LINK_REQUIRED')
            linkError.email = email
            linkError.googleCredential = GoogleAuthProvider.credentialFromError(err)
            throw linkError
          }
        }
      }
      throw err
    }
  }

  // ── Link Google credential to existing email/password account ─────────────
  const linkGoogleToEmail = async (email, password, googleCredential) => {
    const result = await signInWithEmailAndPassword(auth, email, password)
    await linkWithCredential(result.user, googleCredential)
    const userData = await readUserDoc(result.user.uid)
    if (userData) setUser(userData)
    return result.user
  }

  // ── Query organisation by code ─────────────────────────────────────────────
  const queryOrgByCode = async (code) => {
    const q = query(collection(db, 'organisations'), where('code', '==', code.trim()))
    const snap = await getDocs(q)
    return snap.empty ? null : snap.docs[0]
  }

  // ── Create a new organisation (sets user as admin) ────────────────────────
  const createOrganisation = async (orgName) => {
    const firebaseUser = auth.currentUser
    if (!firebaseUser) throw new Error('Not authenticated.')

    const currentUser = await readUserDoc(firebaseUser.uid)

    // If user already belongs to an org AND is not an admin → block
    if (currentUser?.orgId && currentUser?.role !== 'admin') {
      throw new Error('You are already part of an organisation. Only admins can create additional organisations.')
    }

    // Generate unique org code from name
    const slug = orgName.trim().toLowerCase().replace(/\s+/g, '-')
    const code = `${slug}-${Date.now().toString(36)}`

    const orgData = {
      name: orgName.trim(),
      code,
      adminUids: [firebaseUser.uid],
      createdAt: new Date().toISOString(),
    }

    // ⚠️ IMPORTANT ORDER: Update the user to admin+orgId FIRST so that
    // Firestore rules (isAdmin() && getUserOrgId() == orgId) pass when
    // we then write the org document.
    const updatedFields = {
      orgId: currentUser?.orgId || code,  // keep existing primary org if already set
      role: 'admin',
    }
    await setDoc(doc(db, 'users', firebaseUser.uid), updatedFields, { merge: true })
    setUser((prev) => ({ ...prev, ...updatedFields }))

    // NOW create the org doc — rules pass because user is now admin with matching orgId
    await setDoc(doc(db, 'organisations', code), orgData)

    return code  // return the join code so admin can share it
  }

  // ── Join an existing organisation by code ─────────────────────────────────
  const joinOrganisation = async (code) => {
    const firebaseUser = auth.currentUser
    if (!firebaseUser) throw new Error('Not authenticated.')

    const orgDoc = await queryOrgByCode(code)
    if (!orgDoc) throw new Error('Organisation not found. Please check the code and try again.')

    const updates = { orgId: code.trim(), role: 'employee' }
    await setDoc(doc(db, 'users', firebaseUser.uid), updates, { merge: true })
    setUser((prev) => ({ ...prev, ...updates }))
  }

  const logout = () => signOut(auth)

  return { user, loading, login, register, loginWithGoogle, linkGoogleToEmail, createOrganisation, joinOrganisation, logout }
}
