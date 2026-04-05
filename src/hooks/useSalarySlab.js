import { useState, useEffect } from 'react'
import { getDocs, query, orderBy, addDoc, collection, serverTimestamp, getDoc, doc } from 'firebase/firestore'
import { db } from '../lib/firebase'

export function useSalarySlab(orgId) {
  const [slabs, setSlabs] = useState({})
  const [increments, setIncrements] = useState([])
  const [loading, setLoading] = useState(false)

  const fetchSlabs = async () => {
    if (!orgId) return
    setLoading(true)
    try {
      // In a real app we might fetch per employee. Here we fetch the latest slab per employee or from increments
      // Actually, increments collection will hold all historical and current. 
      // The most recent increment where effectiveFrom <= today is the current slab.
      const q = query(collection(db, 'organisations', orgId, 'salaryIncrements'), orderBy('effectiveFrom', 'desc'))
      const snap = await getDocs(q)
      const incs = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      
      setIncrements(incs)
      
      // Compute current slabs
      const latestSlabs = {}
      incs.forEach(inc => {
        if (!latestSlabs[inc.employeeId]) {
          latestSlabs[inc.employeeId] = inc
        }
      })
      setSlabs(latestSlabs)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const saveSlab = async (employeeId, payload) => {
    // payload: { totalSalary, basicPercent, hraPercent, incomeTaxPercent, pfPercent, esiPercent, effectiveFrom, reason }
    try {
      await addDoc(collection(db, 'organisations', orgId, 'salaryIncrements'), {
        employeeId,
        ...payload,
        createdAt: serverTimestamp()
      })
      // Wait for fetch to complete before returning
      await fetchSlabs()
      return { success: true }
    } catch (error) {
      console.error('Error saving slab:', error)
      throw error
    }
  }

  useEffect(() => {
    fetchSlabs()
  }, [orgId])

  return { slabs, increments, loading, fetchSlabs, saveSlab }
}
