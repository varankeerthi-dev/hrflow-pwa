import { useState, useEffect } from 'react'
import { getDocs, addDoc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore'
import { employeesCol, employeeDoc, shiftsCol } from '../lib/firestore'
import { isEmployeeActiveStatus } from '../lib/employeeStatus'

export function useEmployees(orgId, activeOnly = false) {
  const [employees, setEmployees] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchEmployees = async () => {
    if (!orgId) {
      setEmployees([])
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const snapshot = await getDocs(employeesCol(orgId))

      // Fetch all shifts once to avoid N+1 queries
      const shiftsSnap = await getDocs(shiftsCol(orgId))
      const shiftMap = {}
      shiftsSnap.forEach(s => { shiftMap[s.id] = s.data() })

      let emps = snapshot.docs.map(d => {
        const data = d.data()
        return {
          id: d.id,
          ...data,
          shift: data.shiftId ? shiftMap[data.shiftId] : null
        }
      })

      if (activeOnly) {
        emps = emps.filter(emp => isEmployeeActiveStatus(emp.status))
      }

      setEmployees(emps)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const addEmployee = async (payload) => {
    const data = {
      ...payload,
      createdAt: serverTimestamp(),
    }
    const docRef = await addDoc(employeesCol(orgId), data)
    fetchEmployees()
    return docRef.id
  }

  const updateEmployee = async (empId, payload) => {
    if (!orgId) throw new Error('Organization ID not found. Please log in again.')
    await updateDoc(employeeDoc(orgId, empId), {
      ...payload,
      updatedAt: serverTimestamp(),
    })
    fetchEmployees()
  }

  const deactivateEmployee = async (empId) => {
    if (!orgId) throw new Error('Organization ID not found. Please log in again.')
    await updateDoc(employeeDoc(orgId, empId), { status: 'Inactive' })
    fetchEmployees()
  }

  const deleteEmployee = async (empId) => {
    if (!orgId) throw new Error('Organization ID not found. Please log in again.')
    await deleteDoc(employeeDoc(orgId, empId))
    fetchEmployees()
  }

  useEffect(() => {
    fetchEmployees()
  }, [orgId, activeOnly])

  return { employees, loading, error, fetchEmployees, addEmployee, updateEmployee, deactivateEmployee, deleteEmployee }
}
