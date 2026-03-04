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
      const emps = await Promise.all(
        snapshot.docs.map(async (d) => {
          const data = d.data()
          let shift = null
          if (data.shiftId) {
            const shiftDoc = await getDoc(doc(d.ref.parent.parent, 'shifts', data.shiftId))
            shift = shiftDoc.exists() ? shiftDoc.data() : null
          }
          return { id: d.id, ...data, shift }
        })
      )
      setEmployees(emps)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const addEmployee = async (payload) => {
    const docRef = await addDoc(employeesCol(orgId), {
      ...payload,
      createdAt: serverTimestamp(),
    })
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
