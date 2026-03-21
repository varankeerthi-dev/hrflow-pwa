import React, { useState, useEffect, useRef, useMemo } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { useEmployees } from '../../hooks/useEmployees'
import { useSalarySlab } from '../../hooks/useSalarySlab'
import { useAttendance } from '../../hooks/useAttendance'
import { db } from '../../lib/firebase'
import { collection, query, where, getDocs, orderBy, limit, addDoc, serverTimestamp, setDoc, doc, getDoc, updateDoc } from 'firebase/firestore'
import { formatINR, numberToWords } from '../../lib/salaryUtils'
import Spinner from '../ui/Spinner'
import Modal from '../ui/Modal'
import { 
  Wallet, Search, Download, Printer, Save, Clock, Banknote, 
  FileText, ChevronRight, ChevronLeft, Calendar, Plus, 
  History, Settings, User, AlertCircle, Info, X, MessageSquare, CheckCircle2
} from 'lucide-react'
import { Document, Page, Text, View, StyleSheet, PDFDownloadLink, Image } from '@react-pdf/renderer'
import { logActivity } from '../../hooks/useActivityLog'

// PDF Styles
const pdfStyles = StyleSheet.create({
  page: { padding: 40, fontSize: 10, fontFamily: 'Helvetica', color: '#111827' },
  header: { borderBottomWidth: 3, borderBottomColor: '#111827', paddingBottom: 15, marginBottom: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logo: { width: 50, height: 50, objectFit: 'contain' },
  orgTitle: { fontSize: 24, fontWeight: 'bold', textTransform: 'uppercase' },
  headerSubtitle: { fontSize: 9, color: '#9CA3AF', fontWeight: 'bold', marginTop: 5, letterSpacing: 1 },
  headerRight: { textAlign: 'right' },
  payslipTitle: { fontSize: 16, fontWeight: 'bold', textTransform: 'uppercase' },
  periodBadge: { marginTop: 5, backgroundColor: '#EEF2FF', color: '#4F46E5', padding: '4 8', borderRadius: 10, fontSize: 10, fontWeight: 'bold' },
  identificationSection: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
  idGrid: { width: '60%' },
  idRow: { flexDirection: 'row', marginBottom: 4, fontSize: 9 },
  idLabel: { width: 100, color: '#9CA3AF', fontWeight: 'bold', textTransform: 'uppercase' },
  idValue: { fontWeight: 'bold' },
  netPayBadge: { width: 180, border: 2, borderColor: '#059669', borderRadius: 8, padding: 10, textAlign: 'center', backgroundColor: '#F0FDF4' },
  netPayLabel: { fontSize: 8, fontWeight: 'bold', color: '#047857', marginBottom: 2 },
  netPayAmount: { fontSize: 18, fontWeight: 'bold', color: '#065F46' },
  summaryGrid: { flexDirection: 'row', gap: 8, marginBottom: 20 },
  summaryBox: { flex: 1, backgroundColor: '#F9FAFB', border: 1, borderColor: '#F3F4F6', borderRadius: 8, padding: 8, textAlign: 'center' },
  summaryLabel: { fontSize: 7, fontWeight: 'bold', color: '#9CA3AF', textTransform: 'uppercase', marginBottom: 2 },
  summaryValue: { fontSize: 12, fontWeight: 'bold' },
  earningsDeductionsContainer: { border: 2, borderColor: '#111827', borderRadius: 8, overflow: 'hidden', marginBottom: 20 },
  tableHeader: { flexDirection: 'row', backgroundColor: '#111827', color: 'white', fontWeight: 'bold', fontSize: 9, padding: 8 },
  tableBody: { flexDirection: 'row' },
  tableCol: { flex: 1, borderRightWidth: 1, borderRightColor: '#111827' },
  tableRow: { flexDirection: 'row', justifyContent: 'space-between', padding: 8, borderBottomWidth: 1, borderBottomColor: '#F9FAFB', fontSize: 9 },
  rowLabel: { color: '#4B5563' },
  rowValue: { fontWeight: 'bold' },
  highlightGreen: { backgroundColor: '#F0FDF4', color: '#059669', fontWeight: 'bold' },
  highlightRed: { backgroundColor: '#FEF2F2', color: '#DC2626', fontWeight: 'bold' },
  totalRow: { flexDirection: 'row', backgroundColor: '#F9FAFB', borderTopWidth: 2, borderTopColor: '#111827', padding: 8, fontWeight: 'bold', fontSize: 10 },
  wordsSection: { textAlign: 'center', paddingTop: 20, borderTopWidth: 1, borderTopColor: '#F3F4F6', borderTopStyle: 'dashed' },
  wordsText: { fontSize: 10, fontWeight: 'bold', color: '#374151', fontStyle: 'italic' },
  wordsAmount: { fontWeight: 'bold', textTransform: 'uppercase', color: '#111827' },
  footerTag: { fontSize: 8, color: '#9CA3AF', marginTop: 15, fontWeight: 'bold', letterSpacing: 2 }
})

// PDF Component
const SalarySlipPDF = ({ data, orgName, orgLogo }) => (
  <Document>
    <Page size="A4" style={pdfStyles.page}>
      <View style={pdfStyles.header}>
        <View style={pdfStyles.headerLeft}>
          {orgLogo && <Image src={orgLogo} style={pdfStyles.logo} />}
          <View>
            <Text style={pdfStyles.orgTitle}>{orgName || 'ORGANISATION'}</Text>
            <Text style={pdfStyles.headerSubtitle}>Personnel Remuneration Advice</Text>
          </View>
        </View>
        <View style={pdfStyles.headerRight}>
          <Text style={pdfStyles.payslipTitle}>Monthly Payslip</Text>
          <Text style={pdfStyles.periodBadge}>
            {new Date(data.month + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
          </Text>
        </View>
      </View>

      <View style={pdfStyles.identificationSection}>
        <View style={pdfStyles.idGrid}>
          <Text style={{ fontSize: 8, fontWeight: 'bold', color: '#111827', marginBottom: 10 }}>STAFF IDENTIFICATION</Text>
          <View style={pdfStyles.idRow}><Text style={pdfStyles.idLabel}>Staff Name</Text><Text style={pdfStyles.idValue}>: {data.employee.name}</Text></View>
          <View style={pdfStyles.idRow}><Text style={pdfStyles.idLabel}>Employee ID</Text><Text style={pdfStyles.idValue}>: {data.employee.empCode}</Text></View>
          <View style={pdfStyles.idRow}><Text style={pdfStyles.idLabel}>Department</Text><Text style={pdfStyles.idValue}>: {data.employee.department}</Text></View>
          <View style={pdfStyles.idRow}><Text style={pdfStyles.idLabel}>Pay Period</Text><Text style={pdfStyles.idValue}>: {data.month}</Text></View>
        </View>
        <View style={pdfStyles.netPayBadge}>
          <Text style={pdfStyles.netPayLabel}>FINAL NET PAYABLE</Text>
          <Text style={pdfStyles.netPayAmount}>{formatINR(data.netPay)}</Text>
          <Text style={{ fontSize: 7, color: '#047857', marginTop: 5 }}>Paid: {data.paidDays}d | LOP: {data.lopDays}d</Text>
        </View>
      </View>

      <View style={pdfStyles.summaryGrid}>
        <View style={pdfStyles.summaryBox}><Text style={pdfStyles.summaryLabel}>Worked</Text><Text style={pdfStyles.summaryValue}>{data.paidDays}d</Text></View>
        <View style={pdfStyles.summaryBox}><Text style={pdfStyles.summaryLabel}>OT Hours</Text><Text style={pdfStyles.summaryValue}>{data.autoOTHours.toFixed(1)}h</Text></View>
        <View style={pdfStyles.summaryBox}><Text style={pdfStyles.summaryLabel}>Advance</Text><Text style={pdfStyles.summaryValue}>{formatINR(data.advanceDeduction || 0)}</Text></View>
        <View style={pdfStyles.summaryBox}><Text style={pdfStyles.summaryLabel}>Loan EMI</Text><Text style={pdfStyles.summaryValue}>{formatINR(data.loanEMI || 0)}</Text></View>
        <View style={pdfStyles.summaryBox}><Text style={pdfStyles.summaryLabel}>Leave</Text><Text style={pdfStyles.summaryValue}>{data.lopDays}</Text></View>
      </View>

      <View style={pdfStyles.earningsDeductionsContainer}>
        <View style={pdfStyles.tableHeader}>
          <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'space-between', paddingRight: 10 }}><Text>EARNINGS</Text><Text>INR (₹)</Text></View>
          <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'space-between', paddingLeft: 10 }}><Text>DEDUCTIONS</Text><Text>INR (₹)</Text></View>
        </View>
        
        <View style={pdfStyles.tableBody}>
          <View style={pdfStyles.tableCol}>
            <View style={pdfStyles.tableRow}><Text style={pdfStyles.rowLabel}>Basic Component</Text><Text style={pdfStyles.rowValue}>{formatINR(data.basic)}</Text></View>
            <View style={pdfStyles.tableRow}><Text style={pdfStyles.rowLabel}>H.R.A (Allowances)</Text><Text style={pdfStyles.rowValue}>{formatINR(data.hra)}</Text></View>
            {data.expenseReimbursement > 0 && <View style={[pdfStyles.tableRow, pdfStyles.highlightGreen]}><Text>Expense Reimb.</Text><Text>{formatINR(data.expenseReimbursement)}</Text></View>}
            {data.otPay > 0 && <View style={[pdfStyles.tableRow, { color: '#4F46E5', fontWeight: 'bold' }]}><Text>Overtime ({data.finalOT}h)</Text><Text>{formatINR(data.otPay)}</Text></View>}
          </View>
          
          <View style={{ flex: 1 }}>
            <View style={pdfStyles.tableRow}><Text style={pdfStyles.rowLabel}>Statutory Tax (IT)</Text><Text style={pdfStyles.rowValue}>{formatINR(data.it)}</Text></View>
            <View style={pdfStyles.tableRow}><Text style={pdfStyles.rowLabel}>Provident Fund (PF)</Text><Text style={pdfStyles.rowValue}>{formatINR(data.pf)}</Text></View>
            {data.advanceDeduction > 0 && <View style={[pdfStyles.tableRow, pdfStyles.highlightRed]}><Text>Advance Recovery</Text><Text>{formatINR(data.advanceDeduction)}</Text></View>}
            {data.loanEMI > 0 && <View style={[pdfStyles.tableRow, pdfStyles.highlightRed]}><Text>Loan EMI Recovery</Text><Text>{formatINR(data.loanEMI)}</Text></View>}
          </View>
        </View>

        <View style={pdfStyles.totalRow}>
          <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'space-between', paddingRight: 10 }}><Text>GROSS EARNINGS</Text><Text>{formatINR(data.grossEarnings)}</Text></View>
          <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'space-between', paddingLeft: 10 }}><Text>TOTAL DEDUCTIONS</Text><Text>{formatINR(data.totalDeductions)}</Text></View>
        </View>
      </View>

      <View style={{ backgroundColor: '#111827', borderRadius: 12, padding: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <View>
          <Text style={{ color: 'white', fontSize: 14, fontWeight: 'bold', letterSpacing: 2 }}>TOTAL NET DISBURSEMENT</Text>
          <Text style={{ color: '#9CA3AF', fontSize: 8, marginTop: 4 }}>Calculated as: Gross - Deductions</Text>
        </View>
        <Text style={{ color: 'white', fontSize: 24, fontWeight: 'bold' }}>{formatINR(data.netPay)}</Text>
      </View>

      <View style={pdfStyles.wordsSection}>
        <Text style={pdfStyles.wordsText}>
          Amount In Words: <Text style={pdfStyles.wordsAmount}>Indian Rupee {numberToWords(data.netPay)} Only</Text>
        </Text>
        <Text style={pdfStyles.footerTag}>-- SYSTEM AUTHENTICATED DOCUMENT --</Text>
      </View>
    </Page>
  </Document>
)

export default function SalarySlipTab() {
  const { user } = useAuth()
  const { employees, loading: empLoading } = useEmployees(user?.orgId)
  const { slabs, increments, loading: slabLoading } = useSalarySlab(user?.orgId)
  const { fetchByDate } = useAttendance(user?.orgId)

  const [activeTab, setActiveTab] = useState('salary-slip') // 'salary-slip' or 'loan'
  const [selectedEmp, setSelectedEmp] = useState('')
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })

  const [loading, setLoading] = useState(false)
  const [slipData, setSlipData] = useState(null)
  const [generateError, setGenerateError] = useState('')
  const [orgLogo, setOrgLogo] = useState('')

  // Loan Management States
  const [loans, setLoans] = useState([])
  const [loanForm, setEditLoanForm] = useState({ employeeId: '', totalAmount: '', emiAmount: '', startMonth: '', remarks: '' })
  const [selectedLoan, setSelectedLoan] = useState(null)
  const [overrideForm, setOverrideForm] = useState({ month: '', amount: 0, reason: '', skip: false })

  const [advances, setAdvances] = useState([])
  const [newAdvance, setNewAdvance] = useState({ type: 'Advance', amount: 0, date: '', reason: '' })
  const [otRequest, setOtRequest] = useState(null)
  const [revisedOT, setRevisedOT] = useState(0)
  const [otNote, setOtNote] = useState('')
  const [activeBottomTab, setActiveBottomTab] = useState('ot')
  const [continuousLeaveRule, setContinuousLeaveRule] = useState(false)

  useEffect(() => {
    if (!user?.orgId) return
    getDoc(doc(db, 'organisations', user.orgId)).then(snap => {
      if (snap.exists()) setOrgLogo(snap.data().logoURL || '')
    })
    fetchLoans()
  }, [user?.orgId])

  const [editingLoanId, setEditingLoanId] = useState(null)

  const fetchLoans = async () => {
    try {
      const q = query(collection(db, 'organisations', user.orgId, 'loans'), orderBy('createdAt', 'desc'))
      const snap = await getDocs(q)
      setLoans(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    } catch (err) {
      console.error('Error fetching loans:', err)
    }
  }

  const handleCreateLoan = async () => {
    if (!loanForm.employeeId || !loanForm.totalAmount || !loanForm.emiAmount || !loanForm.startMonth) {
      alert('Please fill all required fields')
      return
    }
    setLoading(true)
    try {
      const emp = employees.find(e => e.id === loanForm.employeeId)
      const docData = {
        ...loanForm,
        employeeName: emp?.name || 'Unknown',
        totalAmount: Number(loanForm.totalAmount),
        emiAmount: Number(loanForm.emiAmount),
        updatedAt: serverTimestamp()
      }

      if (editingLoanId) {
        await updateDoc(doc(db, 'organisations', user.orgId, 'loans', editingLoanId), docData)
        await logActivity(user.orgId, user, {
          module: 'Loans', action: 'Updated', detail: `Loan details updated for ${emp?.name}`
        })
        alert('Loan updated successfully')
      } else {
        const newData = {
          ...docData,
          remainingAmount: Number(loanForm.totalAmount),
          status: 'Active',
          monthOverrides: {},
          createdAt: serverTimestamp(),
          createdBy: user.uid
        }
        await addDoc(collection(db, 'organisations', user.orgId, 'loans'), newData)
        await logActivity(user.orgId, user, {
          module: 'Loans', action: 'Created', detail: `Loan of ${loanForm.totalAmount} created for ${emp?.name}`
        })
        alert('Loan added successfully')
      }
      
      setEditLoanForm({ employeeId: '', totalAmount: '', emiAmount: '', startMonth: '', remarks: '' })
      setEditingLoanId(null)
      fetchLoans()
    } catch (err) {
      alert('Failed: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleEditLoan = (loan) => {
    setEditingLoanId(loan.id)
    setEditLoanForm({
      employeeId: loan.employeeId,
      totalAmount: loan.totalAmount,
      emiAmount: loan.emiAmount,
      startMonth: loan.startMonth,
      remarks: loan.remarks || ''
    })
  }

  const handleUpdateOverride = async (loanId) => {
    if (!overrideForm.month) return alert('Select month')
    try {
      const loanRef = doc(db, 'organisations', user.orgId, 'loans', loanId)
      const snap = await getDoc(loanRef)
      const current = snap.data()?.monthOverrides || {}
      const newOverrides = {
        ...current,
        [overrideForm.month]: { 
          amount: overrideForm.skip ? 0 : Number(overrideForm.amount), 
          skip: overrideForm.skip,
          reason: overrideForm.reason 
        }
      }
      await updateDoc(loanRef, { monthOverrides: newOverrides })
      alert('Special case recorded')
      fetchLoans()
      setOverrideForm({ month: '', amount: 0, reason: '', skip: false })
    } catch (err) {
      alert('Failed: ' + err.message)
    }
  }

  const calculateMonthlyLoanEMI = (loan, targetMonth) => {
    if (loan.status !== 'Active' || loan.remainingAmount <= 0) return 0
    if (loan.startMonth > targetMonth) return 0
    const override = loan.monthOverrides?.[targetMonth]
    if (override) {
      if (override.skip) return 0
      return Math.min(override.amount, loan.remainingAmount)
    }
    return Math.min(loan.emiAmount, loan.remainingAmount)
  }

  const handleGenerate = async () => {
    if (!selectedEmp || !selectedMonth) return
    setLoading(true)
    setGenerateError('')
    try {
      const slipId = `${selectedEmp}_${selectedMonth}`
      const savedSlipSnap = await getDoc(doc(db, 'organisations', user.orgId, 'salarySlips', slipId))
      if (savedSlipSnap.exists()) {
        setSlipData(savedSlipSnap.data())
        setLoading(false)
        return
      }

      const emp = employees.find(e => e.id === selectedEmp)
      if (!emp) { setLoading(false); return }

      const [year, month] = selectedMonth.split('-').map(Number)
      const endDay = new Date(year, month, 0).getDate()
      const startDate = `${selectedMonth}-01`
      const endDate = `${selectedMonth}-${endDay}`

      const attQ = query(collection(db, 'organisations', user.orgId, 'attendance'), where('employeeId', '==', selectedEmp))
      const attSnap = await getDocs(attQ)
      const attData = attSnap.docs.map(d => d.data()).filter(a => a.date >= startDate && a.date <= endDate)

      const applicableIncrements = increments.filter(i => i.employeeId === selectedEmp && i.effectiveFrom <= selectedMonth).sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))
      const activeSlab = applicableIncrements[0] || slabs[selectedEmp] || { totalSalary: 0, basicPercent: 40, hraPercent: 20, incomeTaxPercent: 0, pfPercent: 0 }

      const totalSalary = Number(activeSlab.totalSalary) || 0
      const minDailyHours = Number(emp.minDailyHours) || 8

      let paidDays = 0, lopDays = 0, autoOTHours = 0, sundayCount = 0, sundayWorkedCount = 0, holidayWorkedCount = 0
      const grid = []
      for (let i = 1; i <= endDay; i++) {
        const d = new Date(year, month - 1, i)
        const dStr = d.toISOString().split('T')[0]
        const isSunday = d.getDay() === 0
        const rec = attData.find(a => a.date === dStr)
        let type = isSunday ? 'Sunday' : 'Absent'
        if (isSunday) sundayCount++
        if (rec) {
          if (rec.isAbsent) type = 'Absent'
          else if (rec.sundayWorked) { type = 'Sunday Working'; sundayWorkedCount++ }
          else if (rec.sundayHoliday) { type = 'Sunday Holiday'; holidayWorkedCount++ }
          else type = 'Working'
          if (rec.otHours) {
            const [h, m] = rec.otHours.split(':').map(Number)
            autoOTHours += (h || 0) + (m || 0) / 60
          }
        }
        if (type === 'Absent') lopDays++
        else paidDays++
        grid.push({ date: i, type, dStr })
      }

      const otQ = query(collection(db, 'organisations', user.orgId, 'otApprovals'), where('employeeId', '==', selectedEmp), where('month', '==', selectedMonth))
      const otSnap = await getDocs(otQ)
      const existingOT = otSnap.docs.map(d => d.data()).find(o => o.status === 'approved')
      const finalOT = existingOT ? Number(existingOT.finalOTHours) : autoOTHours
      const otPay = finalOT * ((totalSalary / endDay) / minDailyHours)

      const advQ = query(collection(db, 'organisations', user.orgId, 'advances'), where('employeeId', '==', selectedEmp))
      const advSnap = await getDocs(advQ)
      const allAdv = advSnap.docs.map(d => ({ id: d.id, ...d.data() }))
      setAdvances(allAdv)
      const pendingAdvances = allAdv.filter(a => a.status !== 'Recovered').reduce((acc, curr) => acc + Number(curr.amount), 0)

      const empLoansQ = query(collection(db, 'organisations', user.orgId, 'loans'), where('employeeId', '==', selectedEmp), where('status', '==', 'Active'))
      const empLoansSnap = await getDocs(empLoansQ)
      const loanEMI = empLoansSnap.docs.map(d => d.data()).reduce((sum, l) => sum + calculateMonthlyLoanEMI(l, selectedMonth), 0)

      const basic = totalSalary * (activeSlab.basicPercent / 100) * (paidDays / endDay)
      const hra = totalSalary * (activeSlab.hraPercent / 100) * (paidDays / endDay)
      const pf = totalSalary * (activeSlab.pfPercent / 100)
      const it = totalSalary * (activeSlab.incomeTaxPercent / 100)
      
      const grossEarnings = basic + hra + otPay
      const totalDeductions = pf + it + pendingAdvances + loanEMI
      const netPay = Math.max(0, grossEarnings - totalDeductions)

      setSlipData({
        employee: emp, month: selectedMonth, slab: activeSlab, grid, paidDays, lopDays, autoOTHours, finalOT, otPay, basic, hra, grossEarnings, pf, it, advanceDeduction: pendingAdvances, loanEMI, totalDeductions, netPay, sundayCount, sundayWorkedCount, holidayWorkedCount
      })
    } catch (err) {
      setGenerateError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleSaveAdvance = async () => {
    if (!newAdvance.amount || !newAdvance.date) return alert('Enter amount and date')
    try {
      await addDoc(collection(db, 'organisations', user.orgId, 'advances'), { ...newAdvance, employeeId: selectedEmp, status: 'Pending', createdAt: serverTimestamp() })
      alert('Deduction added')
      setNewAdvance({ type: 'Advance', amount: 0, date: '', reason: '' })
      handleGenerate()
    } catch (err) { alert(err.message) }
  }

  const handleSubmitOT = async () => {
    try {
      await addDoc(collection(db, 'organisations', user.orgId, 'otApprovals'), {
        employeeId: selectedEmp, month: selectedMonth, autoOTHours: slipData.autoOTHours, revisedOTHours: Number(revisedOT), finalOTHours: slipData.autoOTHours + Number(revisedOT), note: otNote, status: 'pending', createdAt: serverTimestamp()
      })
      alert('OT request submitted')
      setRevisedOT(0); setOtNote('')
      handleGenerate()
    } catch (err) { alert(err.message) }
  }

  const handleFinalizeSlip = async () => {
    if (!slipData) return
    setLoading(true)
    try {
      const slipId = `${slipData.employee.id}_${slipData.month}`
      
      // 1. Save the slip
      await setDoc(doc(db, 'organisations', user.orgId, 'salarySlips', slipId), {
        ...slipData,
        finalizedAt: serverTimestamp(),
        finalizedBy: user.uid
      })

      // 2. Reduce loan balances
      if (slipData.loanEMI > 0) {
        const empLoansQ = query(collection(db, 'organisations', user.orgId, 'loans'), where('employeeId', '==', slipData.employee.id), where('status', '==', 'Active'))
        const empLoansSnap = await getDocs(empLoansQ)
        
        for (const loanDoc of empLoansSnap.docs) {
          const lData = loanDoc.data()
          const deductedForThisLoan = calculateMonthlyLoanEMI(lData, slipData.month)
          
          if (deductedForThisLoan > 0) {
            const newRemaining = Math.max(0, lData.remainingAmount - deductedForThisLoan)
            await updateDoc(loanDoc.ref, {
              remainingAmount: newRemaining,
              status: newRemaining <= 0 ? 'Closed' : 'Active',
              updatedAt: serverTimestamp()
            })
            
            await logActivity(user.orgId, user, {
              module: 'Loans',
              action: 'EMI Deducted',
              detail: `₹${deductedForThisLoan} deducted from ${slipData.employee.name}'s loan. Remaining: ₹${newRemaining}`
            })
          }
        }
      }

      await logActivity(user.orgId, user, {
        module: 'Payroll',
        action: 'Slip Finalized',
        detail: `Salary slip for ${slipData.employee.name} finalized for ${slipData.month}`
      })

      alert('Salary slip finalized and recorded. Loan balances updated.')
      fetchLoans()
    } catch (err) {
      alert('Finalization failed: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex h-full bg-gray-50/50 -m-6">
      <div className="w-[240px] bg-white border-r border-gray-200 flex flex-col pt-6">
        <div className="px-6 mb-8"><h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400">Payroll Engine</h2></div>
        <nav className="flex-1 space-y-1 px-3">
          <button onClick={() => setActiveTab('salary-slip')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'salary-slip' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100' : 'text-gray-500 hover:bg-gray-50'}`}><Banknote size={18} /><span className="text-sm font-bold tracking-tight">Salary Slip</span></button>
          <button onClick={() => setActiveTab('loan')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'loan' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100' : 'text-gray-500 hover:bg-gray-50'}`}><Wallet size={18} /><span className="text-sm font-bold tracking-tight">Loan Management</span></button>
        </nav>
      </div>

      <div className="flex-1 overflow-auto p-8">
        {activeTab === 'salary-slip' ? (
          <div className="space-y-6">
            <div className="bg-white p-6 rounded-[12px] shadow-sm flex flex-wrap gap-6 items-end border border-gray-100">
              <div className="flex-1 min-w-[240px]">
                <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-2">Select Employee</label>
                <select value={selectedEmp} onChange={e => setSelectedEmp(e.target.value)} className="w-full h-[42px] border border-gray-200 rounded-lg px-4 text-sm font-semibold bg-gray-50/50 focus:ring-2 focus:ring-indigo-500 outline-none">
                  <option value="">Choose Employee...</option>
                  {employees.map(e => <option key={e.id} value={e.id}>{e.name} ({e.empCode})</option>)}
                </select>
              </div>
              <div className="w-[180px]"><label className="block text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-2">Pay Period</label><input type="month" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} className="w-full h-[42px] border border-gray-200 rounded-lg px-4 text-sm font-bold bg-gray-50/50 outline-none" /></div>
              <button onClick={handleGenerate} disabled={loading || !selectedEmp || !selectedMonth} className="h-[40px] px-8 bg-indigo-600 text-white font-bold rounded-lg uppercase tracking-widest text-[11px] shadow-lg hover:bg-indigo-700 disabled:opacity-50 transition-all">{loading ? 'Crunching...' : 'Generate Slip'}</button>
            </div>

            {slipData && (
              <div className="flex gap-8">
                <div className="flex-1 max-w-4xl bg-white border border-gray-100 shadow-2xl rounded-2xl overflow-hidden relative mx-auto" style={{ minWidth: '850px' }}>
                  <div className="flex justify-end gap-3 p-4 bg-gray-50/50 border-b border-gray-100 no-print">
                    {slipData.employee && (
                      <PDFDownloadLink 
                        key={`${slipData.employee.id}_${slipData.month}`}
                        document={<SalarySlipPDF data={slipData} orgName={user?.orgName} orgLogo={orgLogo} />} 
                        fileName={`SalarySlip_${slipData.employee.name.replace(/\s+/g, '_')}_${slipData.month}.pdf`} 
                        className="h-[36px] bg-indigo-50 text-indigo-600 px-4 rounded-lg text-[11px] font-bold uppercase tracking-widest hover:bg-indigo-100 flex items-center gap-2"
                      >
                        {({ loading }) => <><Download size={14} />{loading ? 'Preparing...' : 'Download PDF'}</>}
                      </PDFDownloadLink>
                    )}
                    <button onClick={handleFinalizeSlip} disabled={loading} className="h-[36px] bg-gray-900 text-white px-6 rounded-lg text-[11px] font-black uppercase tracking-[0.2em] shadow-lg hover:bg-black flex items-center gap-2 transition-all">
                      <CheckCircle2 size={14} /> Confirm & Record
                    </button>
                  </div>
                  <div className="p-12 bg-white" style={{ fontFamily: 'Roboto, sans-serif' }}>
                    <div className="border-b-4 border-gray-900 pb-6 mb-8 flex justify-between items-start">
                      <div className="flex items-center gap-4">{orgLogo && <img src={orgLogo} alt="Logo" className="w-16 h-16 object-contain" />}<div><h1 className="text-3xl font-black text-gray-900 uppercase tracking-tighter leading-none">{user?.orgName || 'ORGANISATION'}</h1><p className="text-[11px] text-gray-400 font-bold uppercase tracking-[0.2em] mt-3">Personnel Remuneration Advice</p></div></div>
                      <div className="text-right"><h2 className="text-xl font-black text-gray-800 tracking-tight uppercase">Monthly Payslip</h2><p className="text-sm font-black text-indigo-600 uppercase mt-1 px-3 py-1 bg-indigo-50 rounded-full inline-block">{new Date(slipData.month + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</p></div>
                    </div>
                    <div className="flex justify-between items-start mb-10">
                      <div className="space-y-2 text-[13px]"><p className="font-black text-gray-900 uppercase tracking-widest text-[10px] mb-4 border-b-2 border-indigo-100 pb-1 inline-block">STAFF IDENTIFICATION</p>
                        <div className="flex gap-6"><span className="w-36 text-gray-400 font-bold uppercase text-[10px]">Staff Name</span><span className="font-bold text-gray-800 uppercase">: {slipData.employee.name}</span></div>
                        <div className="flex gap-6"><span className="w-36 text-gray-400 font-bold uppercase text-[10px]">Employee ID</span><span className="font-bold text-gray-800 uppercase">: {slipData.employee.empCode}</span></div>
                        <div className="flex gap-6"><span className="w-36 text-gray-400 font-bold uppercase text-[10px]">Department</span><span className="font-bold text-gray-800 uppercase">: {slipData.employee.department}</span></div>
                      </div>
                      <div className="border-2 border-green-600 rounded-xl p-4 text-center min-w-[180px] bg-green-50/20 shadow-lg"><p className="text-[9px] font-black text-green-700 uppercase tracking-widest mb-1">FINAL NET PAYABLE</p><p className="text-2xl font-black text-green-800">{formatINR(slipData.netPay)}</p><div className="mt-3 pt-2 border-t border-green-200/50 flex justify-between text-[9px] font-black text-green-700 uppercase"><span>Paid: {slipData.paidDays}d</span><span>LOP: {slipData.lopDays}d</span></div></div>
                    </div>
                    <div className="border-2 border-gray-900 rounded-2xl overflow-hidden mb-10">
                      <div className="grid grid-cols-2 bg-gray-900 divide-x-2 divide-gray-800"><div className="flex justify-between p-4 font-black text-[11px] uppercase tracking-[0.2em] text-white"><span>EARNINGS</span><span>INR (₹)</span></div><div className="flex justify-between p-4 font-black text-[11px] uppercase tracking-[0.2em] text-white"><span>DEDUCTIONS</span><span>INR (₹)</span></div></div>
                      <div className="grid grid-cols-2 divide-x-2 divide-gray-900">
                        <div className="p-0">
                          <div className="flex justify-between p-4 border-b border-gray-50 text-[13px] font-medium text-gray-600 italic"><span>Basic Component</span><span className="font-bold text-gray-900 not-italic">{formatINR(slipData.basic)}</span></div>
                          <div className="flex justify-between p-4 border-b border-gray-50 text-[13px] font-medium text-gray-600 italic"><span>H.R.A (Allowances)</span><span className="font-bold text-gray-900 not-italic">{formatINR(slipData.hra)}</span></div>
                          {slipData.otPay > 0 && <div className="flex justify-between p-4 border-b border-gray-50 text-[13px] font-bold text-indigo-600 bg-indigo-50/30"><span>Overtime ({slipData.finalOT}h)</span><span>{formatINR(slipData.otPay)}</span></div>}
                        </div>
                        <div className="p-0">
                          <div className="flex justify-between p-4 border-b border-gray-50 text-[13px] font-medium text-gray-600 italic"><span>Statutory Tax (IT)</span><span className="font-bold text-gray-900 not-italic">{formatINR(slipData.it)}</span></div>
                          <div className="flex justify-between p-4 border-b border-gray-50 text-[13px] font-medium text-gray-600 italic"><span>Provident Fund (PF)</span><span className="font-bold text-gray-900 not-italic">{formatINR(slipData.pf)}</span></div>
                          {slipData.advanceDeduction > 0 && <div className="flex justify-between p-4 border-b border-gray-50 text-[13px] font-bold text-red-600 bg-red-50/30"><span>Advance Recovery</span><span>{formatINR(slipData.advanceDeduction)}</span></div>}
                          {slipData.loanEMI > 0 && <div className="flex justify-between p-4 border-b border-gray-50 text-[13px] font-bold text-red-600 bg-red-50/30"><span>Loan EMI Recovery</span><span>{formatINR(slipData.loanEMI)}</span></div>}
                        </div>
                      </div>
                      <div className="grid grid-cols-2 divide-x-2 divide-gray-900 bg-gray-50 border-t-2 border-gray-900 font-black"><div className="flex justify-between p-4 text-[13px] uppercase text-gray-900"><span>Gross Earnings</span><span>{formatINR(slipData.grossEarnings)}</span></div><div className="flex justify-between p-4 text-[13px] uppercase text-gray-900"><span>Total Deductions</span><span>{formatINR(slipData.totalDeductions)}</span></div></div>
                    </div>
                    <div className="bg-gray-900 text-white rounded-2xl p-6 flex justify-between items-center shadow-2xl"><h3 className="text-xl font-black uppercase tracking-[0.25em]">TOTAL NET DISBURSEMENT</h3><div className="text-4xl font-black tracking-tighter text-white">{formatINR(slipData.netPay)}</div></div>
                  </div>
                </div>
                <div className="w-[320px] flex flex-col gap-6 no-print">
                  <div className="bg-gray-100 p-1 rounded-xl flex shadow-sm border border-gray-200">
                    <button onClick={() => setActiveBottomTab('ot')} className={`flex-1 py-2.5 rounded-lg text-[11px] font-black uppercase tracking-widest transition-all ${activeBottomTab === 'ot' ? 'bg-white text-indigo-600 shadow-md' : 'text-gray-400 hover:text-gray-600'}`}>OT Review</button>
                    <button onClick={() => setActiveBottomTab('advances')} className={`flex-1 py-2.5 rounded-lg text-[11px] font-black uppercase tracking-widest transition-all ${activeBottomTab === 'advances' ? 'bg-white text-indigo-600 shadow-md' : 'text-gray-400 hover:text-gray-600'}`}>Recovery</button>
                  </div>
                  {activeBottomTab === 'ot' && <div className="bg-white rounded-[12px] p-6 border border-gray-100 shadow-sm space-y-4"><div className="flex items-center gap-2 text-indigo-600 font-black uppercase text-sm"><Clock size={18} /> OT Escalation</div><div className="bg-gray-50 p-4 rounded-xl"><p className="text-[10px] font-bold text-gray-400 uppercase mb-1">Calculated</p><p className="text-2xl font-black">{slipData.autoOTHours.toFixed(2)}h</p></div><input type="number" value={revisedOT} onChange={e => setRevisedOT(e.target.value)} className="w-full h-[42px] border border-gray-200 rounded-lg px-4 text-sm font-bold bg-gray-50/50" placeholder="+ / - hours" /><button onClick={handleSubmitOT} className="w-full h-[40px] bg-indigo-600 text-white font-black rounded-lg uppercase text-[11px] shadow-lg">Submit</button></div>}
                  {activeBottomTab === 'advances' && <div className="bg-white rounded-[12px] p-6 border border-gray-100 shadow-sm space-y-4"><div className="flex items-center gap-2 text-red-600 font-black uppercase text-sm"><Banknote size={18} /> Recovery</div><input type="number" placeholder="Value (₹)" value={newAdvance.amount || ''} onChange={e => setNewAdvance(s => ({ ...s, amount: e.target.value }))} className="w-full h-[42px] border border-gray-200 rounded-lg px-4 text-sm font-black bg-gray-50/50" /><input type="date" value={newAdvance.date} onChange={e => setNewAdvance(s => ({ ...s, date: e.target.value }))} className="w-full h-[42px] border border-gray-200 rounded-lg px-4 text-sm font-bold bg-gray-50/50" /><button onClick={handleSaveAdvance} className="w-full h-[40px] bg-red-600 text-white font-black rounded-lg uppercase text-[11px] shadow-lg">Add</button></div>}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="h-full space-y-8 animate-in fade-in duration-500">
            <div className="flex justify-between items-center">
              <div><h1 className="text-2xl font-black text-gray-900 tracking-tight">Loan Management</h1><p className="text-sm text-gray-500 font-medium mt-1">Configure employee loans and monthly recovery overrides.</p></div>
              <button onClick={() => setEditLoanForm({ employeeId: '', totalAmount: '', emiAmount: '', startMonth: selectedMonth, remarks: '' })} className="h-[42px] px-6 bg-indigo-600 text-white font-black rounded-xl text-[11px] uppercase tracking-widest shadow-lg flex items-center gap-2 transition-all hover:bg-indigo-700"><Plus size={16} /> New Application</button>
            </div>
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
              <div className="xl:col-span-1 bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-6">
                <div className="flex items-center gap-2 text-indigo-600"><Settings size={18} /><h3 className="font-black uppercase text-sm tracking-widest">Configuration</h3></div>
                <div className="space-y-4">
                  <div><label className="block text-[10px] font-black text-gray-400 uppercase mb-2 px-1">Employee</label><select value={loanForm.employeeId} onChange={e => setEditLoanForm({...loanForm, employeeId: e.target.value})} className="w-full h-[42px] border border-gray-200 rounded-xl px-4 text-sm font-bold bg-gray-50/50 outline-none focus:ring-2 focus:ring-indigo-500"><option value="">Select...</option>{employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}</select></div>
                  <div className="grid grid-cols-2 gap-4"><div><label className="block text-[10px] font-black text-gray-400 uppercase mb-2 px-1">Total (₹)</label><input type="number" value={loanForm.totalAmount} onChange={e => setEditLoanForm({...loanForm, totalAmount: e.target.value})} className="w-full h-[42px] border border-gray-200 rounded-xl px-4 font-bold bg-gray-50/50" /></div><div><label className="block text-[10px] font-black text-gray-400 uppercase mb-2 px-1">EMI (₹)</label><input type="number" value={loanForm.emiAmount} onChange={e => setEditLoanForm({...loanForm, emiAmount: e.target.value})} className="w-full h-[42px] border border-gray-200 rounded-xl px-4 font-bold bg-gray-50/50" /></div></div>
                  <div><label className="block text-[10px] font-black text-gray-400 uppercase mb-2 px-1">Starts From</label><input type="month" value={loanForm.startMonth} onChange={e => setEditLoanForm({...loanForm, startMonth: e.target.value})} className="w-full h-[42px] border border-gray-200 rounded-xl px-4 font-bold bg-gray-50/50" /></div>
                  <button onClick={handleCreateLoan} disabled={loading} className="w-full h-[46px] bg-gray-900 text-white font-black rounded-xl text-xs uppercase tracking-[0.2em] shadow-xl hover:bg-black transition-all">
                    {editingLoanId ? 'Update Loan Details' : 'Activate Loan Schedule'}
                  </button>
                </div>
              </div>
              <div className="xl:col-span-2 space-y-6">
                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                  <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/30"><h3 className="font-black uppercase text-sm tracking-widest flex items-center gap-2"><History size={18} className="text-gray-400" /> Active Schedules</h3></div>
                  <div className="overflow-x-auto"><table className="w-full text-left border-collapse"><thead><tr className="bg-gray-50/50 text-[10px] font-black uppercase text-gray-400 tracking-widest border-b border-gray-100"><th className="px-6 py-4">Employee</th><th className="px-6 py-4 text-right">Total</th><th className="px-6 py-4 text-right">Remaining</th><th className="px-6 py-4 text-center">EMI</th><th className="px-6 py-4 text-right">Actions</th></tr></thead><tbody className="divide-y divide-gray-50">
                    {loans.length === 0 ? (<tr><td colSpan={5} className="px-6 py-12 text-center text-gray-400 italic font-medium">No active loans</td></tr>) : loans.map(l => (
                      <tr key={l.id} className="group hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4">
                          <p className="text-sm font-bold text-gray-900">{l.employeeName}</p>
                          <p className="text-[10px] text-gray-400 font-medium">{l.remarks}</p>
                        </td>
                        <td className="px-6 py-4 text-right font-bold text-gray-600">{formatINR(l.totalAmount)}</td>
                        <td className="px-6 py-4 text-right font-black text-indigo-600">{formatINR(l.remainingAmount)}</td>
                        <td className="px-6 py-4 text-center"><span className="bg-gray-100 px-2 py-1 rounded text-[10px] font-bold">{formatINR(l.emiAmount)}</span></td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex justify-end gap-1">
                            <button onClick={() => handleEditLoan(l)} className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all" title="Edit Loan Details"><Edit2 size={16} /></button>
                            <button onClick={() => setSelectedLoan(l)} className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all" title="Special Case Adjustment"><AlertCircle size={18} /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody></table></div>
                </div>
                {selectedLoan && (
                  <div className="bg-amber-50 rounded-2xl border border-amber-200 p-6 space-y-4 animate-in slide-in-from-top-4 duration-300">
                    <div className="flex justify-between items-center"><div className="flex items-center gap-2 text-amber-700 font-black uppercase text-xs tracking-widest"><Info size={18} /> Special Case Adjustment: {selectedLoan.employeeName}</div><button onClick={() => setSelectedLoan(null)} className="text-amber-400 hover:text-amber-600"><X size={18} /></button></div>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                      <div className="space-y-1"><label className="text-[9px] font-black text-amber-600 uppercase tracking-widest">Target Month</label><input type="month" value={overrideForm.month} onChange={e => setOverrideForm({...overrideForm, month: e.target.value})} className="w-full h-[38px] border border-amber-200 rounded-lg px-3 font-bold" /></div>
                      <div className="space-y-1"><label className="text-[9px] font-black text-amber-600 uppercase tracking-widest">Override EMI (₹)</label><input type="number" disabled={overrideForm.skip} value={overrideForm.amount} onChange={e => setOverrideForm({...overrideForm, amount: e.target.value})} className="w-full h-[38px] border border-amber-200 rounded-lg px-3 font-bold disabled:opacity-50" /></div>
                      <div className="flex items-center gap-2 h-[38px] mb-1"><input type="checkbox" checked={overrideForm.skip} onChange={e => setOverrideForm({...overrideForm, skip: e.target.checked})} className="w-4 h-4 rounded text-amber-600" /><label className="text-[10px] font-black text-amber-700 uppercase">Skip Month</label></div>
                      <button onClick={() => handleUpdateOverride(selectedLoan.id)} className="h-[38px] bg-amber-600 text-white font-black rounded-lg text-[10px] uppercase tracking-widest shadow-md hover:bg-amber-700">Record Case</button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
