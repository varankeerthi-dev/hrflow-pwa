import { initializeApp } from 'firebase/app'
import { getAuth, setPersistence, browserLocalPersistence } from 'firebase/auth'
import { initializeFirestore, enableIndexedDbPersistence } from 'firebase/firestore'
import { getStorage } from 'firebase/storage'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyAuIJ4rON_RWKADbYjV7AfaX4MZoUMfcJo",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "attendance-108ba.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "attendance-108ba",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "attendance-108ba.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "583226584419",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:583226584419:web:875278b298151a52ef7756",
}

export const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)
// Set auth persistence to local (survives browser close)
setPersistence(auth, browserLocalPersistence).catch(err => {
  console.warn('Auth persistence warning:', err)
})
// Prefer Firestore's automatic transport detection. It falls back to long polling only when the network requires it.
export const db = initializeFirestore(app, {
  experimentalAutoDetectLongPolling: true,
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
