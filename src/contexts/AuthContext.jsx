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
  sendPasswordResetEmail,
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
        
        // Default to 'admin' permissions (all modules/actions true) as requested
        // This will be used unless a specific role with permissions is assigned
        const defaultPermissions = {}
        const modules = [
          'Attendance', 'Correction', 'Leave', 'Approvals', 'Summary', 'HRLetters',
          'SalarySlip', 'AdvanceExpense', 'Fine', 'Engagement', 'Birthday',
          'EmployeePortal', 'Settings', 'Employees', 'Roles', 'Shifts',
          'Recruitment', 'AssetManagement', 'PerformanceReview', 'Training',
          'ExitManagement', 'DocumentManagement', 'Helpdesk', 'Projects', 'TimeTracking', 'Tasks'
        ]
        
        modules.forEach(m => {
          defaultPermissions[m] = { view: true, create: true, edit: true, delete: true, approve: true, export: true, full: true }
        })

        if (userData.role) {
          const rolesQuery = collection(db, 'organisations', userData.orgId, 'roles')
          const rolesSnap = await getDocs(rolesQuery)
          const roleDoc = rolesSnap.docs.find(d => d.data().name.toLowerCase() === userData.role.toLowerCase())
          if (roleDoc) {
            userData.permissions = roleDoc.data().permissions || defaultPermissions
            console.log('readUserDoc: Cached permissions for role:', userData.role)
          } else {
            userData.permissions = defaultPermissions
            console.log('readUserDoc: Role not found, using minimal permissions')
          }
        } else {
          userData.permissions = defaultPermissions
          console.log('readUserDoc: No role, using minimal permissions')
        }

        // Sync to Firestore user doc for rules - wrap in try-catch to avoid blocking auth
        try {
          if (JSON.stringify(snap.data().permissions) !== JSON.stringify(userData.permissions)) {
            await setDoc(userRef, { permissions: userData.permissions }, { merge: true })
            console.log('readUserDoc: Synced permissions to Firestore user doc')
          }
        } catch (syncErr) {
          console.warn('readUserDoc: Could not sync permissions (probably rules restriction):', syncErr)
        }
      } catch (err) {
        console.warn('readUserDoc: Could not read org or roles:', err)
        // Fallback to admin permissions if org fetch fails
        userData.permissions = defaultPermissions
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
      setLoading(true) // Ensure loading is true while we fetch userData
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
            role: null,
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
      const orgSnap = await getDoc(doc(db, 'organisations', resolvedOrgId))
      if (!orgSnap.exists()) throw new Error('Organisation code not found.')
    }

    const userDoc = {
      email,
      name,
      orgId: resolvedOrgId,
      role: resolvedOrgId ? 'admin' : null,
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
          role: null,
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
    console.log('createOrganisation: currentUser=', currentUser)
    if (currentUser?.orgId && currentUser?.role !== 'admin') {
      throw new Error('You are already part of an organisation.')
    }

    const slug = orgName.trim().toLowerCase().replace(/\s+/g, '-')
    const code = `${slug}-${Date.now().toString(36)}`
    console.log('createOrganisation: generated code=', code)

    const orgData = {
      name: orgName.trim(),
      code,
      adminUids: [firebaseUser.uid],
      createdAt: new Date().toISOString(),
    }

    const updatedFields = {
      orgId: code,
      role: 'admin',
    }

    try {
      console.log('createOrganisation: Attempting to create org document for code:', code)
      // Check for current user auth state explicitly
      if (!auth.currentUser) throw new Error('Session expired. Please log in again.')
      
      await setDoc(doc(db, 'organisations', code), orgData)
      console.log('createOrganisation: Org document created successfully')
      
      console.log('createOrganisation: Attempting to update user doc for uid:', firebaseUser.uid)
      await setDoc(doc(db, 'users', firebaseUser.uid), updatedFields, { merge: true })
      console.log('createOrganisation: User document updated successfully')
      
      // Update local state to reflect new org and role 'admin'
      setUser(prev => ({ ...prev, ...updatedFields }))
      
      // We return the code first; the modal should trigger a refresh or user can click 'Get Started'
      return code
    } catch (err) {
      console.error('createOrganisation: Permission or system error during creation process:', err)
      if (err.code === 'permission-denied') {
        throw new Error('Permission denied. Please ensure you are logged in correctly and have rights to create an organisation.')
      }
      throw err
    }
  }

  const joinOrganisation = async (code) => {
    const firebaseUser = auth.currentUser
    if (!firebaseUser) throw new Error('Not authenticated.')

    const currentUser = await readUserDoc(firebaseUser.uid)
    if (currentUser?.orgId) {
      throw new Error('You are already part of an organisation. Please logout to join a different one.')
    }

    try {
      console.log('joinOrganisation: Attempting to find organisation...')
      const orgSnap = await getDoc(doc(db, 'organisations', code.trim()))
      if (!orgSnap.exists()) throw new Error('Organisation not found.')

      const updates = { orgId: code.trim(), role: 'employee' }
      console.log('joinOrganisation: Attempting to update user document...')
      await setDoc(doc(db, 'users', firebaseUser.uid), updates, { merge: true })
      console.log('joinOrganisation: User document updated successfully')
      
      // Similarly to createOrganisation, return success instead of updating setUser immediately
      // if we want to show success UI first. If not, setUser is fine. 
      // Most of the time joinOrganisation doesn't have its own success screen.
      setUser((prev) => ({ ...prev, ...updates }))
    } catch (err) {
      console.error('joinOrganisation: Error joining organisation:', err)
      throw err
    }
  }

  const logout = () => signOut(auth)

  const resetPassword = async (email) => {
    await sendPasswordResetEmail(auth, email)
  }

  const value = {
    user,
    loading,
    login,
    register,
    loginWithGoogle,
    linkGoogleToEmail,
    createOrganisation,
    resetPassword,
    joinOrganisation,
    logout
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}
