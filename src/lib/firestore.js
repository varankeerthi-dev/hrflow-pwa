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

export const salarySlipWindowsCol = (orgId) =>
  collection(db, 'organisations', orgId, 'salarySlipWindows')

export const jobsCol = (orgId) =>
  collection(db, 'organisations', orgId, 'jobs')

export const jobDoc = (orgId, jobId) =>
  doc(db, 'organisations', orgId, 'jobs', jobId)

export const applicantsCol = (orgId) =>
  collection(db, 'organisations', orgId, 'applicants')

export const applicantDoc = (orgId, applicantId) =>
  doc(db, 'organisations', orgId, 'applicants', applicantId)

export const documentsCol = (orgId) =>
  collection(db, 'organisations', orgId, 'documents')

export const documentDoc = (orgId, docId) =>
  doc(db, 'organisations', orgId, 'documents', docId)
