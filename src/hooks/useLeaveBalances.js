import { useCallback, useEffect, useMemo, useState } from 'react'
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { calculateLeaveBalance, getConfiguredLeaveTypes, normalizeLeaveTypeCode } from '../lib/leaveEntitlements'

export function useLeaveBalances(orgId, employeeId) {
  const [orgData, setOrgData] = useState({})
  const [ledgerEntries, setLedgerEntries] = useState([])
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [refreshIndex, setRefreshIndex] = useState(0)
  const [loadedScope, setLoadedScope] = useState('')
  const scopeKey = orgId && employeeId ? `${orgId}:${employeeId}` : ''
  const refresh = useCallback(() => setRefreshIndex((index) => index + 1), [])

  useEffect(() => {
    let cancelled = false
    if (!orgId || !employeeId) {
      setOrgData({})
      setLedgerEntries([])
      setRequests([])
      setLoadedScope('')
      return undefined
    }
    const load = async () => {
      setLoading(true)
      setError('')
      try {
        const [orgSnap, ledgerSnap, requestSnap] = await Promise.all([
          getDoc(doc(db, 'organisations', orgId)),
          getDocs(collection(db, 'organisations', orgId, 'employees', employeeId, 'leave_ledger')),
          getDocs(query(collection(db, 'organisations', orgId, 'requests'), where('employeeId', '==', employeeId))),
        ])
        if (cancelled) return
        setOrgData(orgSnap.exists() ? orgSnap.data() : {})
        setLedgerEntries(ledgerSnap.docs
          .filter((entry) => !entry.id.startsWith('__balance__') && entry.data()?.isBalanceState !== true)
          .map((entry) => ({ id: entry.id, ...entry.data() })))
        setRequests(requestSnap.docs.map((request) => ({ id: request.id, ...request.data() })).filter((request) => request.type === 'Leave'))
        setLoadedScope(scopeKey)
      } catch (loadError) {
        if (!cancelled) setError(loadError?.message || 'Leave balances could not be loaded.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [orgId, employeeId, refreshIndex, scopeKey])

  const leaveTypes = useMemo(() => getConfiguredLeaveTypes(orgData), [orgData])
  const balances = useMemo(() => {
    if (!orgData || !employeeId || loadedScope !== scopeKey) return []
    const known = new Map(leaveTypes.map((type) => [type.code, type.name]))
    ledgerEntries.forEach((entry) => {
      const value = String(entry.leaveType || entry.leaveTypeCode || '').trim()
      const code = normalizeLeaveTypeCode(entry.leaveTypeCode || value, leaveTypes)
      if (value && !known.has(code)) known.set(code, value)
    })
    requests.forEach((request) => {
      const value = String(request.leaveType || request.leaveTypeCode || '').trim()
      if (!value) return
      const code = normalizeLeaveTypeCode(request.leaveTypeCode || value, leaveTypes)
      if (!known.has(code)) known.set(code, value)
    })
    return [...known.values()].map((leaveType) => calculateLeaveBalance({
      orgData,
      leaveType,
      ledgerEntries,
      requests,
      asOf: new Date().toISOString().slice(0, 10),
    }))
  }, [employeeId, leaveTypes, ledgerEntries, loadedScope, orgData, requests, scopeKey])

  const balanceByCode = useMemo(() => Object.fromEntries(balances.map((balance) => [balance.leaveTypeCode, balance])), [balances])

  return { orgData, leaveTypes, ledgerEntries, requests, balances, balanceByCode, loading, error, refresh }
}
