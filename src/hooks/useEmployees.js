import { useState, useEffect } from 'react'
import { getDocs, query, where, addDoc, updateDoc, serverTimestamp, doc, getDoc } from 'firebase/firestore'
import { employeesCol, employeeDoc, shiftsCol } from '../lib/firestore'

export function useEmployees(orgId) {
  const [employees, setEmployees] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchEmployees = async () => {
    if (!orgId) return
    setLoading(true)
    try {
      const q = query(employeesCol(orgId), where('status', '==', 'Active'))
      const snapshot = await getDocs(q)

      // Fetch all shifts once to avoid N+1 queries
      const shiftsSnap = await getDocs(shiftsCol(orgId))
      const shiftMap = {}
      shiftsSnap.forEach(s => { shiftMap[s.id] = s.data() })

      const emps = snapshot.docs.map(d => {
        const data = d.data()
        return {
          id: d.id,
          ...data,
          shift: data.shiftId ? shiftMap[data.shiftId] : null
        }
      })
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

    // Optimistically update or at least refresh after add
    fetchEmployees()
    return docRef.id
  }

  const updateEmployee = async (empId, payload) => {
    await updateDoc(employeeDoc(orgId, empId), payload)
  }

  const deactivateEmployee = async (empId) => {
    await updateDoc(employeeDoc(orgId, empId), { status: 'Inactive' })
  }

  useEffect(() => {
    fetchEmployees()
  }, [orgId])

  return { employees, loading, error, fetchEmployees, addEmployee, updateEmployee, deactivateEmployee }
}
