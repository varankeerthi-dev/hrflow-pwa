import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { initializeFirestore, enableIndexedDbPersistence } from 'firebase/firestore'
import { getStorage } from 'firebase/storage'

const firebaseConfig = {
  apiKey: "AIzaSyAuIJ4rON_RWKADbYjV7AfaX4MZoUMfcJo",
  authDomain: "attendance-108ba.firebaseapp.com",
  projectId: "attendance-108ba",
  storageBucket: "attendance-108ba.firebasestorage.app",
  messagingSenderId: "583226584419",
  appId: "1:583226584419:web:875278b298151a52ef7756",
}

export const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)
// Initialize Firestore with long polling to prevent ERR_BLOCKED_BY_CLIENT errors from ad-blockers
export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
})
export const storage = getStorage(app)

// Enable offline persistence
enableIndexedDbPersistence(db).catch((err) => {
  if (err.code === 'failed-precondition') {
    // Multiple tabs open, persistence can only be enabled in one tab at a a time.
    console.warn('Firestore persistence failed-precondition')
  } else if (err.code === 'unimplemented') {
    // The current browser does not support all of the features required to enable persistence
    console.warn('Firestore persistence unimplemented')
  }
})

// Secondary app for creating accounts without logging out the current admin
const secondaryApp = initializeApp(firebaseConfig, 'SecondaryAccountCreator')
export const secondaryAuth = getAuth(secondaryApp)
