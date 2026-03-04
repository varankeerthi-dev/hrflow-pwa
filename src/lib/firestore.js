import { collection, doc } from 'firebase/firestore'
import { db } from './firebase'

export const orgDoc = (orgId) => doc(db, 'organisations', orgId)
export const userDoc = (uid) => doc(db, 'users', uid)

export const employeesCol = (orgId) =>
  collection(db, 'organisations', orgId, 'employees')

export const employeeDoc = (orgId, empId) =>
  doc(db, 'organisations', orgId, 'employees', empId)

export const shiftsCol = (orgId) =>
  collection(db, 'organisations', orgId, 'shifts')

export const attendanceCol = (orgId) =>
  collection(db, 'organisations', orgId, 'attendance')

export const attendanceDocId = (date, empId) => `${date}_${empId}`

export const attendanceDoc = (orgId, date, empId) =>
  doc(db, 'organisations', orgId, 'attendance', `${date}_${empId}`)

export const correctionsCol = (orgId) =>
  collection(db, 'organisations', orgId, 'corrections')

export const otApprovalsCol = (orgId) =>
  collection(db, 'organisations', orgId, 'otApprovals')

export const activityLogsCol = (orgId) =>
  collection(db, 'organisations', orgId, 'activityLogs')
