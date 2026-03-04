import React, { createContext, useState, useEffect, useContext } from 'react'
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
  EmailAuthProvider,
} from 'firebase/auth'

import { doc, getDoc, setDoc, collection, query, where, getDocs } from 'firebase/firestore'
import { auth, db } from '../lib/firebase'

const AuthContext = createContext()

export function useAuthContext() {
  return useContext(AuthContext)
}

// ── Helper: read Firestore user doc ──────────────────────────────────────────
async function readUserDoc(uid) {
  try {
    const userRef = doc(db, 'users', uid)
    const snap = await getDoc(userRef)
    if (!snap.exists()) {
      console.warn('readUserDoc: No user doc for uid:', uid)
      return null
    }
    const userData = snap.data()
    console.log('readUserDoc: Found user data:', userData)
    
    if (userData.orgId) {
      try {
        const orgSnap = await getDoc(doc(db, 'organisations', userData.orgId))
        if (orgSnap.exists()) {
          userData.orgName = orgSnap.data().name
        }
      } catch (err) {
        console.warn('readUserDoc: Could not read org doc:', err)
      }
    }
    return { uid, ...userData }
  } catch (err) {
    console.error('readUserDoc: Error reading user doc:', err)
    return null
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    console.log('AuthProvider: Setting up onAuthStateChanged')
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      console.log('AuthProvider: onAuthStateChanged firebaseUser=', firebaseUser?.uid)
      if (firebaseUser) {
        const userData = await readUserDoc(firebaseUser.uid)
        if (userData) {
          console.log('AuthProvider: Setting user to', userData)
          setUser(userData)
        } else {
          console.log('AuthProvider: No user doc, setting minimal user')
          setUser({
            uid: firebaseUser.uid,
            email: firebaseUser.email,
            name: firebaseUser.displayName || '',
            orgId: null,
            orgName: '',
            role: 'employee',
          })
        }
      } else {
        console.log('AuthProvider: No firebaseUser, setting user to null')
        setUser(null)
      }
      setLoading(false)
    })
    return unsubscribe
  }, [])

  const login = async (email, password) => {
    const result = await signInWithEmailAndPassword(auth, email, password)
    const userData = await readUserDoc(result.user.uid)
    if (userData) setUser(userData)
    return result.user
  }

  const register = async (name, email, password, orgId) => {
    const result = await createUserWithEmailAndPassword(auth, email, password)
    const firebaseUser = result.user
    await updateProfile(firebaseUser, { displayName: name })

    const resolvedOrgId = orgId?.trim() || null

    if (resolvedOrgId) {
      const q = query(collection(db, 'organisations'), where('code', '==', resolvedOrgId))
      const snap = await getDocs(q)
      if (snap.empty) throw new Error('Organisation code not found.')
    }

    const userDoc = {
      email,
      name,
      orgId: resolvedOrgId,
      role: 'employee',
      createdAt: new Date().toISOString(),
    }
    await setDoc(doc(db, 'users', firebaseUser.uid), userDoc)
    setUser({ uid: firebaseUser.uid, ...userDoc })
    return firebaseUser
  }

  const loginWithGoogle = async () => {
    const provider = new GoogleAuthProvider()
    try {
      const result = await signInWithPopup(auth, provider)
      const firebaseUser = result.user

      let userData = await readUserDoc(firebaseUser.uid)
      if (!userData) {
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
        const credential = GoogleAuthProvider.credentialFromError(err)
        const linkError = new Error('LINK_REQUIRED')
        linkError.email = email
        linkError.googleCredential = credential
        throw linkError
      }
      throw err
    }
  }

  const linkGoogleToEmail = async (email, password, googleCredential) => {
    try {
      const credential = EmailAuthProvider.credential(email, password)
      const result = await signInWithEmailAndPassword(auth, email, password)
      await linkWithCredential(result.user, googleCredential)
      const userData = await readUserDoc(result.user.uid)
      if (userData) setUser(userData)
      return result.user
    } catch (err) {
      throw err
    }
  }

  const createOrganisation = async (orgName) => {

    const firebaseUser = auth.currentUser
    if (!firebaseUser) throw new Error('Not authenticated.')

    const currentUser = await readUserDoc(firebaseUser.uid)
    if (currentUser?.orgId && currentUser?.role !== 'admin') {
      throw new Error('You are already part of an organisation.')
    }

    const slug = orgName.trim().toLowerCase().replace(/\s+/g, '-')
    const code = `${slug}-${Date.now().toString(36)}`

    const orgData = {
      name: orgName.trim(),
      code,
      adminUids: [firebaseUser.uid],
      createdAt: new Date().toISOString(),
    }

    const updatedFields = {
      orgId: currentUser?.orgId || code,
      role: 'admin',
    }
    await setDoc(doc(db, 'users', firebaseUser.uid), updatedFields, { merge: true })
    setUser((prev) => ({ ...prev, ...updatedFields }))
    await setDoc(doc(db, 'organisations', code), orgData)

    return code
  }

  const joinOrganisation = async (code) => {
    const firebaseUser = auth.currentUser
    if (!firebaseUser) throw new Error('Not authenticated.')

    const q = query(collection(db, 'organisations'), where('code', '==', code.trim()))
    const snap = await getDocs(q)
    if (snap.empty) throw new Error('Organisation not found.')

    const updates = { orgId: code.trim(), role: 'employee' }
    await setDoc(doc(db, 'users', firebaseUser.uid), updates, { merge: true })
    setUser((prev) => ({ ...prev, ...updates }))
  }

  const logout = () => signOut(auth)

  const value = {
    user,
    loading,
    login,
    register,
    loginWithGoogle,
    linkGoogleToEmail,
    createOrganisation,

    joinOrganisation,
    logout
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}
