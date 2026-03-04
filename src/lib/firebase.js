import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: "AIzaSyAuIJ4rON_RWKADbYjV7AfaX4MZoUMfcJo",
  authDomain: "attendance-108ba.firebaseapp.com",
  projectId: "attendance-108ba",
  storageBucket: "attendance-108ba.firebasestorage.app",
  messagingSenderId: "583226584419",
  appId: "1:583226584419:web:875278b298151a52ef7756",
}

export const app  = initializeApp(firebaseConfig)
export const auth = getAuth(app)
export const db   = getFirestore(app)
