import { initializeApp } from 'firebase/app'
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth'
import { getFirestore, collection, doc, setDoc, serverTimestamp } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: "AIzaSyAuIJ4rON_RWKADbYjV7AfaX4MZoUMfcJo",
  authDomain: "attendance-108ba.firebaseapp.com",
  projectId: "attendance-108ba",
  storageBucket: "attendance-108ba.firebasestorage.app",
  messagingSenderId: "583226584419",
  appId: "1:583226584419:web:875278b298151a52ef7756",
}

const app = initializeApp(firebaseConfig)
const auth = getAuth(app)
const db = getFirestore(app)

const employees = [
  { name: 'Arjun Sharma', empCode: 'TC001', department: 'Engineering', role: 'employee', shiftId: 'day', workHours: 9, site: 'Site-A', employmentType: 'Full-time', monthlySalary: 85000, status: 'Active', joinedDate: '2024-01-15' },
  { name: 'Priya Nair', empCode: 'TC002', department: 'Engineering', role: 'employee', shiftId: 'day', workHours: 9, site: 'Site-A', employmentType: 'Full-time', monthlySalary: 120000, status: 'Active', joinedDate: '2023-06-01' },
  { name: 'Meena Pillai', empCode: 'TC003', department: 'HR', role: 'employee', shiftId: 'night', workHours: 8, site: 'Site-B', employmentType: 'Full-time', monthlySalary: 95000, status: 'Active', joinedDate: '2024-02-20' },
  { name: 'Kiran Rao', empCode: 'TC004', department: 'Finance', role: 'employee', shiftId: 'day', workHours: 9, site: 'Site-B', employmentType: 'Full-time', monthlySalary: 72000, status: 'Active', joinedDate: '2023-09-10' },
  { name: 'Deepa Menon', empCode: 'TC005', department: 'Engineering', role: 'employee', shiftId: 'day', workHours: 8, site: 'Site-A', employmentType: 'Full-time', monthlySalary: 75000, status: 'Active', joinedDate: '2024-03-05' },
  { name: 'Rohit Verma', empCode: 'TC006', department: 'Sales', role: 'employee', shiftId: 'night', workHours: 8, site: 'Site-C', employmentType: 'Full-time', monthlySalary: 60000, status: 'Active', joinedDate: '2024-01-22' },
  { name: 'Sunita Das', empCode: 'TC007', department: 'Sales', role: 'employee', shiftId: 'day', workHours: 9, site: 'Site-C', employmentType: 'Full-time', monthlySalary: 110000, status: 'Active', joinedDate: '2023-11-08' },
  { name: 'Ankit Joshi', empCode: 'TC008', department: 'Marketing', role: 'employee', shiftId: 'day', workHours: 9, site: 'Site-A', employmentType: 'Full-time', monthlySalary: 50000, status: 'Active', joinedDate: '2024-04-01' },
]

const orgId = 'techcorp'

async function seed() {
  console.log('🔐 Signing in...')
  await signInWithEmailAndPassword(auth, 'demo@hrflow.com', 'demo123')
  console.log('✅ Signed in')

  console.log('🌱 Seeding Firestore...')

  await setDoc(doc(db, 'organisations', orgId), {
    name: 'TechCorp India',
    slug: 'techcorp',
    color: '#6366f1',
    logo: null,
    createdAt: serverTimestamp(),
  })
  console.log('✓ Created organisation')

  await setDoc(doc(db, 'organisations', orgId, 'shifts', 'day'), {
    name: 'Day Shift',
    type: 'Day',
    startTime: '09:00',
    endTime: '18:00',
    workHours: 9,
    createdAt: serverTimestamp(),
  })

  await setDoc(doc(db, 'organisations', orgId, 'shifts', 'night'), {
    name: 'Night Shift',
    type: 'Overnight',
    startTime: '21:00',
    endTime: '06:00',
    workHours: 9,
    createdAt: serverTimestamp(),
  })
  console.log('✓ Created 2 shifts')

  for (const emp of employees) {
    await setDoc(doc(db, 'organisations', orgId, 'employees', emp.empCode), {
      ...emp,
      createdAt: serverTimestamp(),
    })
  }
  console.log('✓ Created 8 employees')

  console.log('✅ Seeded successfully')
}

seed().catch(console.error)
