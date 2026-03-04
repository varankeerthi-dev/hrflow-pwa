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
  EmailAuthProvider,
  updateProfile,
} from 'firebase/auth'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { auth, db } from '../lib/firebase'

// Convert Firebase error codes to human-readable messages
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
      return 'Google sign-in was closed before completing. Please try again.'
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

export function useAuth() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid))
        if (userDoc.exists()) {
          setUser({ uid: firebaseUser.uid, ...userDoc.data() })
        } else {
          // New user — will be prompted to join an org
          setUser({ uid: firebaseUser.uid, email: firebaseUser.email, name: firebaseUser.displayName, orgId: null, role: 'employee' })
        }
      } else {
        setUser(null)
      }
      setLoading(false)
    })
    return unsubscribe
  }, [])

  // Email/password sign-in
  const login = async (email, password) => {
    const result = await signInWithEmailAndPassword(auth, email, password)
    return result.user
  }

  // Register new user with email, password, and optional org code
  const register = async (name, email, password, orgId = 'general') => {
    const result = await createUserWithEmailAndPassword(auth, email, password)
    const firebaseUser = result.user
    // Set display name
    await updateProfile(firebaseUser, { displayName: name })
    // Write Firestore user doc
    await setDoc(doc(db, 'users', firebaseUser.uid), {
      email,
      name,
      orgId: orgId.trim() || 'general',
      role: 'employee',
      createdAt: new Date().toISOString(),
    })
    return firebaseUser
  }

  // Google sign-in — auto-links if same email exists with email/password
  const loginWithGoogle = async () => {
    const provider = new GoogleAuthProvider()
    try {
      const result = await signInWithPopup(auth, provider)
      const firebaseUser = result.user
      // Ensure user doc exists in Firestore
      const userRef = doc(db, 'users', firebaseUser.uid)
      const userDoc = await getDoc(userRef)
      if (!userDoc.exists()) {
        // New Google user — leave orgId null so the app prompts org joining
        await setDoc(userRef, {
          email: firebaseUser.email,
          name: firebaseUser.displayName,
          orgId: null,
          role: 'employee',
          createdAt: new Date().toISOString(),
        })
      }
      return firebaseUser
    } catch (err) {
      // Account exists with different credential (email/password) — link them
      if (err.code === 'auth/account-exists-with-different-credential') {
        const email = err.customData?.email
        if (email) {
          const methods = await fetchSignInMethodsForEmail(auth, email)
          if (methods.includes('password')) {
            // Return special signal so Login UI can prompt for password to link
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

  // Link Google credential to existing email/password account
  const linkGoogleToEmail = async (email, password, googleCredential) => {
    const result = await signInWithEmailAndPassword(auth, email, password)
    await linkWithCredential(result.user, googleCredential)
    return result.user
  }

  // Update a user's orgId after joining an organisation
  const joinOrganisation = async (orgId) => {
    if (!auth.currentUser) return
    await setDoc(doc(db, 'users', auth.currentUser.uid), { orgId: orgId.trim() }, { merge: true })
    setUser((prev) => ({ ...prev, orgId: orgId.trim() }))
  }

  const logout = () => signOut(auth)

  return { user, loading, login, register, loginWithGoogle, linkGoogleToEmail, joinOrganisation, logout }
}
