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

import { doc, getDoc, setDoc, collection, query, where, getDocs, collectionGroup } from 'firebase/firestore'
import { auth, db } from '../lib/firebase'

const AuthContext = createContext()

export function useAuthContext() {
  return useContext(AuthContext)
}

// ── Helper: read Firestore user doc ──────────────────────────────────────────
async function readUserDoc(uid, targetOrgId = null) {
  try {
    const userRef = doc(db, 'users', uid)
    const snap = await getDoc(userRef)
    if (!snap.exists()) {
      console.warn('readUserDoc: No user doc for uid:', uid)
      return null
    }
    const userData = snap.data()
    
    // Resolve which organization is currently active
    // Order of priority: 1. Passed targetOrgId, 2. currentOrgId in doc, 3. First item in memberships, 4. Legacy orgId field
    let activeOrgId = targetOrgId || userData.currentOrgId || (userData.memberships?.length > 0 ? userData.memberships[0].orgId : userData.orgId)
    
    // Ensure activeOrgId is valid and user is actually a member
    const memberships = userData.memberships || []
    // If we have a legacy orgId but no memberships, migrate it
    if (userData.orgId && memberships.length === 0) {
      memberships.push({ orgId: userData.orgId, role: userData.role || 'admin', orgName: userData.orgName || 'My Organisation' })
    }

    if (activeOrgId) {
      try {
        const orgSnap = await getDoc(doc(db, 'organisations', activeOrgId))
        if (orgSnap.exists()) {
          userData.orgName = orgSnap.data().name
          userData.orgId = activeOrgId
        }
        
        // Find current role for this specific org
        const currentMembership = memberships.find(m => m.orgId === activeOrgId)
        const currentRole = currentMembership?.role || userData.role || 'employee'
        userData.role = currentRole

        // Default permissions (admin fallback)
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

        // Fetch role-based permissions from the specific organization's collection
        const rolesQuery = collection(db, 'organisations', activeOrgId, 'roles')
        const rolesSnap = await getDocs(rolesQuery)
        const roleDoc = rolesSnap.docs.find(d => d.data().name.toLowerCase() === currentRole.toLowerCase())
        
        if (userData.permissions && Object.keys(userData.permissions).length > 0) {
          // Use permissions directly from user doc if available
          console.log('readUserDoc: Using permissions from user doc')
        } else if (roleDoc) {
          userData.permissions = roleDoc.data().permissions || defaultPermissions
        } else if (currentRole.toLowerCase() === 'admin') {
          userData.permissions = defaultPermissions
        } else {
          // Minimal fallback for non-admin unknown roles
          userData.permissions = {}
        }

        // Sync currentOrgId back to Firestore if it changed or wasn't set
        if (userData.currentOrgId !== activeOrgId) {
          await setDoc(userRef, { currentOrgId: activeOrgId, memberships }, { merge: true })
        }
      } catch (err) {
        console.warn('readUserDoc: Error fetching org-specific data:', err)
      }
    }

    return { uid, ...userData, memberships }
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

  const loginAsAdmin = async (email, password) => {
    const result = await signInWithEmailAndPassword(auth, email, password)
    const userData = await readUserDoc(result.user.uid)
    
    const adminUser = {
      ...(userData || {}),
      uid: result.user.uid,
      email: result.user.email,
      role: 'admin',
      loginEnabled: true,
      onboardingComplete: true
    }
    
    // Force full permissions
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
    adminUser.permissions = defaultPermissions

    setUser(adminUser)
    return result.user
  }

  const register = async (name, email, password, orgId) => {
    const normalizedEmail = email.toLowerCase().trim()
    const result = await createUserWithEmailAndPassword(auth, normalizedEmail, password)
    const firebaseUser = result.user
    await updateProfile(firebaseUser, { displayName: name })

    let resolvedOrgId = orgId?.trim() || null
    let assignedRole = resolvedOrgId ? 'admin' : null
    let employeeId = null

    // CROSS-CHECK: If no orgId provided, search for this email in ALL employee collections
    if (!resolvedOrgId) {
      try {
        const q = query(collectionGroup(db, 'employees'), where('email', '==', normalizedEmail))
        const snap = await getDocs(q)
        if (!snap.empty) {
          // Found an invitation!
          const empDoc = snap.docs[0]
          employeeId = empDoc.id
          // The parent of 'employees' sub-collection is the organization document
          resolvedOrgId = empDoc.ref.parent.parent.id
          assignedRole = 'employee'
          console.log('register: Found existing invitation for org:', resolvedOrgId)
        }
      } catch (err) {
        console.warn('register: Error cross-checking employees (maybe collectionGroup index missing?):', err)
      }
    }

    if (resolvedOrgId && assignedRole === 'admin') {
      const orgSnap = await getDoc(doc(db, 'organisations', resolvedOrgId))
      if (!orgSnap.exists()) throw new Error('Organisation code not found.')
    }

    const userDoc = {
      email: normalizedEmail,
      name,
      orgId: resolvedOrgId,
      role: assignedRole,
      employeeId: employeeId,
      loginEnabled: true,
      onboardingComplete: false, // Flag to trigger onboarding UI
      createdAt: new Date().toISOString(),
    }
    await setDoc(doc(db, 'users', firebaseUser.uid), userDoc)
    
    // Read the full doc to get orgName etc if we just joined one
    const fullUser = await readUserDoc(firebaseUser.uid)
    setUser(fullUser || { uid: firebaseUser.uid, ...userDoc })
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
          loginEnabled: true,
          onboardingComplete: false,
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

  const switchOrganisation = async (orgId) => {
    if (!user?.uid) return
    setLoading(true)
    try {
      const updatedUser = await readUserDoc(user.uid, orgId)
      if (updatedUser) setUser(updatedUser)
    } catch (err) {
      console.error('switchOrganisation error:', err)
    } finally {
      setLoading(false)
    }
  }

  const createOrganisation = async (orgName) => {
    const firebaseUser = auth.currentUser
    if (!firebaseUser) throw new Error('Not authenticated.')

    const currentUser = await readUserDoc(firebaseUser.uid)
    const memberships = currentUser?.memberships || []

    const slug = orgName.trim().toLowerCase().replace(/\s+/g, '-')
    const code = `${slug}-${Date.now().toString(36)}`

    const orgData = {
      name: orgName.trim(),
      code,
      adminUids: [firebaseUser.uid],
      creatorId: firebaseUser.uid,
      createdAt: new Date().toISOString(),
    }

    const newMembership = { orgId: code, role: 'admin', orgName: orgName.trim() }
    const updatedMemberships = [...memberships, newMembership]

    try {
      if (!auth.currentUser) throw new Error('Session expired. Please log in again.')
      
      await setDoc(doc(db, 'organisations', code), orgData)
      await setDoc(doc(db, 'users', firebaseUser.uid), { 
        currentOrgId: code,
        memberships: updatedMemberships 
      }, { merge: true })
      
      const updatedUser = await readUserDoc(firebaseUser.uid, code)
      setUser(updatedUser)
      return code
    } catch (err) {
      console.error('createOrganisation error:', err)
      throw err
    }
  }

  const joinOrganisation = async (code) => {
    const firebaseUser = auth.currentUser
    if (!firebaseUser) throw new Error('Not authenticated.')

    const currentUser = await readUserDoc(firebaseUser.uid)
    const memberships = currentUser?.memberships || []

    try {
      const orgSnap = await getDoc(doc(db, 'organisations', code.trim()))
      if (!orgSnap.exists()) throw new Error('Organisation not found.')
      const orgData = orgSnap.data()

      // Check if already a member
      if (memberships.some(m => m.orgId === code.trim())) {
        throw new Error('You are already a member of this organisation.')
      }

      const newMembership = { orgId: code.trim(), role: 'employee', orgName: orgData.name }
      const updatedMemberships = [...memberships, newMembership]

      await setDoc(doc(db, 'users', firebaseUser.uid), { 
        currentOrgId: code.trim(),
        memberships: updatedMemberships 
      }, { merge: true })
      
      const updatedUser = await readUserDoc(firebaseUser.uid, code.trim())
      setUser(updatedUser)
    } catch (err) {
      console.error('joinOrganisation error:', err)
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
    switchOrganisation,
    logout
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}
