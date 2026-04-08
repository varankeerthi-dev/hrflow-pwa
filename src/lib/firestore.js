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

export const attendanceFinalCol = (orgId) =>
  collection(db, 'organisations', orgId, 'attendance_final')

export const attendanceDocId = (date, empId) => `${date}_${empId}`

export const attendanceDoc = (orgId, date, empId) =>
  doc(db, 'organisations', orgId, 'attendance', `${date}_${empId}`)

export const attendanceFinalDoc = (orgId, date, empId) =>
  doc(db, 'organisations', orgId, 'attendance_final', `${date}_${empId}`)

export const sitesCol = (orgId) =>
  collection(db, 'organisations', orgId, 'sites')

export const siteDoc = (orgId, siteId) =>
  doc(db, 'organisations', orgId, 'sites', siteId)

export const pendingAttendanceCol = (orgId) =>
  collection(db, 'organisations', orgId, 'pending_attendance')

export const pendingAttendanceDoc = (orgId, pendingId) =>
  doc(db, 'organisations', orgId, 'pending_attendance', pendingId)

export const employeePortalCol = (orgId) =>
  collection(db, 'organisations', orgId, 'employee_portal')

export const employeePortalDoc = (orgId, employeeId) =>
  doc(db, 'organisations', orgId, 'employee_portal', employeeId)

export const employeePortalAttendanceLogsCol = (orgId, employeeId) =>
  collection(db, 'organisations', orgId, 'employee_portal', employeeId, 'attendance_logs')

export const employeePortalAttendanceLogDoc = (orgId, employeeId, logId) =>
  doc(db, 'organisations', orgId, 'employee_portal', employeeId, 'attendance_logs', logId)

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

export const tasksCol = (orgId) =>
  collection(db, 'organisations', orgId, 'tasks')

export const taskDoc = (orgId, taskId) =>
  doc(db, 'organisations', orgId, 'tasks', taskId)

export const chatsCol = (orgId) =>
  collection(db, 'organisations', orgId, 'chats')

export const messagesCol = (orgId, chatId) =>
  collection(db, 'organisations', orgId, 'chats', chatId, 'messages')
