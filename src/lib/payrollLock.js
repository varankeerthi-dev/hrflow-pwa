import { doc, getDoc } from 'firebase/firestore'
import { db } from './firebase'

/**
 * Checks if a specific date or month is part of a locked payroll run.
 * @param {string} orgId - The organization ID.
 * @param {string} dateOrMonth - Date string ("YYYY-MM-DD") or month string ("YYYY-MM").
 * @returns {Promise<boolean>} - True if period is locked, false otherwise.
 */
export async function isPeriodLocked(orgId, dateOrMonth) {
  if (!orgId || !dateOrMonth) return false
  
  // Extract month ("YYYY-MM") from the input string
  const month = dateOrMonth.substring(0, 7)
  
  try {
    const runRef = doc(db, 'organisations', orgId, 'payroll_runs', month)
    const snap = await getDoc(runRef)
    if (snap.exists()) {
      return snap.data().status === 'locked'
    }
  } catch (err) {
    console.error('Error checking payroll lock period:', err)
  }
  
  return false
}
