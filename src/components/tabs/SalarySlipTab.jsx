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
  History, Settings, User, AlertCircle, Info, X, MessageSquare, CheckCircle2, Edit2, Trash2
} from 'lucide-react'
import { Document, Page, Text, View, StyleSheet, PDFDownloadLink, Image } from '@react-pdf/renderer'
import { logActivity } from '../../hooks/useActivityLog'

// PDF Styles
const pdfStyles = StyleSheet.create({
  page: { padding: 40, fontSize: 10, fontFamily: 'Inter', color: '#111827' },
  header: { borderBottomWidth: 3, borderBottomColor: '#111827', paddingBottom: 15, marginBottom: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logo: { width: 50, height: 50, objectFit: 'contain' },
  orgTitle: { fontSize: 24, fontFamily: 'Product Sans', fontWeight: 'bold', textTransform: 'uppercase' },
  headerSubtitle: { fontSize: 9, color: '#9CA3AF', fontWeight: 'bold', marginTop: 5, letterSpacing: 1 },
  headerRight: { textAlign: 'right' },
  payslipTitle: { fontSize: 16, fontFamily: 'Product Sans', fontWeight: 'bold', textTransform: 'uppercase' },
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

// Register Fonts for PDF
import { Font } from '@react-pdf/renderer'
Font.register({
  family: 'Inter',
  src: 'https://fonts.gstatic.com/s/inter/v12/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyfAZ9hiA.woff2'
})
Font.register({
  family: 'Product Sans',
  src: 'https://fonts.gstatic.com/s/productsans/v5/HYvgU2fE2nRJfc-7eS3JBrS_WRA.woff2'
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
  const { employees, loading: empLoading } = useEmployees(user?.orgId, true)
  const { slabs, increments, loading: slabLoading } = useSalarySlab(user?.orgId)
  const { fetchByDate } = useAttendance(user?.orgId)

  const isAdmin = user?.role?.toLowerCase() === 'admin'
  const isAccountant = user?.role?.toLowerCase() === 'accountant' || user?.permissions?.isAccountant === true
  const isMD = user?.role?.toLowerCase() === 'md'
  const isHR = user?.role?.toLowerCase() === 'hr'

  const [activeTab, setActiveTab] = useState('salary-slip') // 'salary-slip' or 'loan'
  const [loanActivities, setLoanActivities] = useState([])

  const fetchLoans = async () => {
    try {
      const q = query(collection(db, 'organisations', user.orgId, 'loans'), orderBy('createdAt', 'desc'))
      const snap = await getDocs(q)
      setLoans(snap.docs.map(d => ({ id: d.id, ...d.data() })))

      // Fetch recent loan activities
      const actQ = query(
        collection(db, 'organisations', user.orgId, 'activityLogs'),
        where('module', '==', 'Loans'),
        orderBy('timestamp', 'desc'),
        limit(5)
      )
      const actSnap = await getDocs(actQ)
      setLoanActivities(actSnap.docs.map(d => ({ id: d.id, ...d.data() })))
    } catch (err) {
      console.error('Error fetching loans/activities:', err)
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
          module: 'Loans', action: 'Created', detail: `Loan of ₹${loanForm.totalAmount} created for ${emp?.name}`
        })
      }
      
      setEditLoanForm({ employeeId: '', totalAmount: '', emiAmount: '', startMonth: '', remarks: '' })
      setEditingLoanId(null)
      setSlipData(null) // Force re-gen
      await fetchLoans()
      alert('Success!')
    } catch (err) {
      alert('Error: ' + err.message)
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

  const handleDeleteLoan = async (loanId, empName) => {
    if (!isAdmin) return alert('Only admins can delete loans')
    if (!confirm(`Permanently delete loan for ${empName}? This will stop all future deductions.`)) return
    
    setLoading(true)
    try {
      await deleteDoc(doc(db, 'organisations', user.orgId, 'loans', loanId))
      await logActivity(user.orgId, user, {
        module: 'Loans', action: 'Deleted', detail: `Loan record for ${empName} was deleted`
      })
      
      setSlipData(null) // Recalculate
      await fetchLoans()
      alert('Loan deleted and contributions updated.')
    } catch (err) {
      alert('Delete failed: ' + err.message)
    } finally {
      setLoading(false)
    }
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
    <div className="flex h-full bg-[#fbfbfb] -m-6 font-inter">
      {/* Shadcn-inspired Sidebar */}
      <div className="w-[260px] bg-white border-r border-gray-200 flex flex-col pt-8">
        <div className="px-8 mb-10">
          <h2 className="text-[11px] font-bold uppercase tracking-[0.2em] text-gray-400 font-google-sans">Payroll Engine</h2>
        </div>
        
        <nav className="flex-1 space-y-1 px-4">
          <button 
            onClick={() => setActiveTab('salary-slip')}
            className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg transition-all duration-200 ${
              activeTab === 'salary-slip' 
                ? 'bg-gray-900 text-white shadow-md shadow-gray-200' 
                : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
            }`}
          >
            <Banknote size={16} strokeWidth={2.5} />
            <span className="text-[13px] font-semibold tracking-tight">Salary Slip</span>
          </button>
          
          <button 
            onClick={() => setActiveTab('loan')}
            className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg transition-all duration-200 ${
              activeTab === 'loan' 
                ? 'bg-gray-900 text-white shadow-md shadow-gray-200' 
                : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
            }`}
          >
            <Wallet size={16} strokeWidth={2.5} />
            <span className="text-[13px] font-semibold tracking-tight">Loan Management</span>
          </button>
        </nav>

        <div className="p-6 mt-auto border-t border-gray-100 bg-gray-50/30">
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-gray-400">
              <Info size={12} />
              <span className="text-[10px] font-bold uppercase tracking-wider">System Status</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
              <span className="text-[11px] font-medium text-gray-600">Calculations Online</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-auto p-10">
        {activeTab === 'salary-slip' ? (
          <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in duration-500">
            {/* Top Filter Bar */}
            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm flex flex-wrap gap-8 items-end">
              <div className="flex-1 min-w-[280px]">
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2.5 px-1 font-google-sans">Target Employee</label>
                <div className="relative">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
                  <select 
                    value={selectedEmp} 
                    onChange={e => setSelectedEmp(e.target.value)} 
                    className="w-full h-11 border border-gray-200 rounded-lg pl-10 pr-4 text-[13px] font-semibold bg-white focus:ring-2 focus:ring-gray-900 focus:border-transparent outline-none transition-all shadow-sm"
                  >
                    <option value="">Choose Employee...</option>
                    {employees.map(e => <option key={e.id} value={e.id}>{e.name} ({e.empCode})</option>)}
                  </select>
                </div>
              </div>
              
              <div className="w-[200px]">
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2.5 px-1 font-google-sans">Pay Period</label>
                <input 
                  type="month" 
                  value={selectedMonth} 
                  onChange={e => setSelectedMonth(e.target.value)} 
                  className="w-full h-11 border border-gray-200 rounded-lg px-4 text-[13px] font-bold bg-white focus:ring-2 focus:ring-gray-900 outline-none transition-all shadow-sm" 
                />
              </div>

              <div className="flex items-center gap-3 h-11 border border-gray-200 rounded-lg px-4 bg-white shadow-sm">
                <input 
                  type="checkbox" 
                  id="cont-rule" 
                  checked={continuousLeaveRule} 
                  onChange={e => setContinuousLeaveRule(e.target.checked)} 
                  className="w-4 h-4 rounded border-gray-300 text-gray-900 focus:ring-gray-900" 
                />
                <label htmlFor="cont-rule" className="text-[10px] font-bold text-gray-500 uppercase tracking-tight cursor-pointer font-google-sans">Sandwich Rule</label>
              </div>

              <button 
                onClick={handleGenerate} 
                disabled={loading || !selectedEmp || !selectedMonth} 
                className="h-11 px-10 bg-gray-900 text-white font-bold rounded-lg uppercase tracking-[0.15em] text-[10px] shadow-lg hover:bg-black active:scale-[0.98] transition-all disabled:opacity-50"
              >
                {loading ? 'Processing...' : 'Generate Report'}
              </button>
            </div>

            {slipData && (
              <div className="flex flex-col gap-8">
                <div className="bg-white border border-gray-200 shadow-xl rounded-2xl overflow-hidden relative mx-auto" style={{ width: '100%', minWidth: '850px' }}>
                  <div className="flex justify-end gap-3 p-4 bg-gray-50 border-b border-gray-200 no-print">
                    {slipData.employee && (
                      <PDFDownloadLink 
                        key={`${slipData.employee.id}_${slipData.month}`}
                        document={<SalarySlipPDF data={slipData} orgName={user?.orgName} orgLogo={orgLogo} />} 
                        fileName={`SalarySlip_${slipData.employee.name.replace(/\s+/g, '_')}_${slipData.month}.pdf`} 
                        className="h-9 bg-white border border-gray-200 text-gray-700 px-4 rounded-lg text-[11px] font-bold uppercase tracking-widest hover:bg-gray-50 flex items-center gap-2 transition-all"
                      >
                        {({ loading }) => <><Download size={14} />{loading ? 'Wait...' : 'Export PDF'}</>}
                      </PDFDownloadLink>
                    )}
                    <button 
                      onClick={handleFinalizeSlip} 
                      disabled={loading} 
                      className="h-9 bg-gray-900 text-white px-6 rounded-lg text-[11px] font-bold uppercase tracking-[0.15em] shadow-lg hover:bg-black flex items-center gap-2 transition-all active:scale-95"
                    >
                      <CheckCircle2 size={14} /> Confirm & Commit
                    </button>
                  </div>
                  
                  {/* Visual Preview */}
                  <div className="p-16 bg-white shadow-inner">
                    {/* (Standard PDF Mockup Content Here) */}
                    <div className="border-b-4 border-gray-900 pb-8 mb-10 flex justify-between items-start">
                      <div className="flex items-center gap-6">
                        {orgLogo && <img src={orgLogo} alt="Logo" className="w-20 h-20 object-contain" />}
                        <div>
                          <h1 className="text-4xl font-bold text-gray-900 uppercase tracking-tighter leading-none font-google-sans">{user?.orgName || 'ORGANISATION'}</h1>
                          <p className="text-[12px] text-gray-400 font-bold uppercase tracking-[0.2em] mt-4">Employee Remuneration Advice</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <h2 className="text-2xl font-bold text-gray-800 tracking-tight uppercase font-google-sans">Payslip</h2>
                        <p className="text-[13px] font-bold text-gray-500 uppercase mt-2">{new Date(slipData.month + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</p>
                      </div>
                    </div>
                    {/* ... rest of the preview stays similar but with cleaned typography ... */}
                    <div className="flex justify-between items-start mb-12">
                      <div className="space-y-3 text-[14px]">
                        <p className="font-bold text-gray-900 uppercase tracking-widest text-[11px] mb-6 border-b-2 border-gray-900 pb-1 inline-block font-google-sans">STAFF IDENTIFICATION</p>
                        <div className="flex gap-8"><span className="w-40 text-gray-400 font-bold uppercase text-[11px]">Employee Name</span><span className="font-bold text-gray-800 uppercase">: {slipData.employee.name}</span></div>
                        <div className="flex gap-8"><span className="w-40 text-gray-400 font-bold uppercase text-[11px]">Staff Code</span><span className="font-bold text-gray-800 uppercase">: {slipData.employee.empCode}</span></div>
                        <div className="flex gap-8"><span className="w-40 text-gray-400 font-bold uppercase text-[11px]">Primary Department</span><span className="font-bold text-gray-800 uppercase">: {slipData.employee.department}</span></div>
                      </div>
                      <div className="bg-gray-900 text-white rounded-xl p-6 text-center min-w-[220px] shadow-2xl">
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">NET PAYABLE (INR)</p>
                        <p className="text-3xl font-bold tracking-tighter font-google-sans">{formatINR(slipData.netPay)}</p>
                        <div className="mt-4 pt-3 border-t border-gray-800 flex justify-between text-[10px] font-bold text-gray-400 uppercase">
                          <span>DAYS PAID: {slipData.paidDays}</span>
                          <span>LOP: {slipData.lopDays}</span>
                        </div>
                      </div>
                    </div>

                    <div className="border-2 border-gray-900 rounded-2xl overflow-hidden mb-12">
                      <div className="grid grid-cols-2 bg-gray-900 divide-x-2 divide-gray-800">
                        <div className="flex justify-between p-5 font-bold text-[12px] uppercase tracking-[0.2em] text-white font-google-sans"><span>EARNINGS</span><span>₹</span></div>
                        <div className="flex justify-between p-5 font-bold text-[12px] uppercase tracking-[0.2em] text-white font-google-sans"><span>DEDUCTIONS</span><span>₹</span></div>
                      </div>
                      <div className="grid grid-cols-2 divide-x-2 divide-gray-900">
                        <div className="p-0">
                          <div className="flex justify-between p-5 border-b border-gray-50 text-[14px] font-medium text-gray-600"><span>Basic Salary</span><span className="font-bold text-gray-900">{formatINR(slipData.basic)}</span></div>
                          <div className="flex justify-between p-5 border-b border-gray-50 text-[14px] font-medium text-gray-600"><span>House Rent Allowance</span><span className="font-bold text-gray-900">{formatINR(slipData.hra)}</span></div>
                          {slipData.otPay > 0 && <div className="flex justify-between p-5 border-b border-gray-50 text-[14px] font-bold text-indigo-600 bg-indigo-50/30"><span>Overtime Pay ({slipData.finalOT}h)</span><span>{formatINR(slipData.otPay)}</span></div>}
                        </div>
                        <div className="p-0">
                          <div className="flex justify-between p-5 border-b border-gray-50 text-[14px] font-medium text-gray-600"><span>Professional Tax / IT</span><span className="font-bold text-gray-900">{formatINR(slipData.it)}</span></div>
                          <div className="flex justify-between p-5 border-b border-gray-50 text-[14px] font-medium text-gray-600"><span>Provident Fund</span><span className="font-bold text-gray-900">{formatINR(slipData.pf)}</span></div>
                          {slipData.advanceDeduction > 0 && <div className="flex justify-between p-5 border-b border-gray-50 text-[14px] font-bold text-red-600 bg-red-50/30"><span>Advance Recovery</span><span>{formatINR(slipData.advanceDeduction)}</span></div>}
                          {slipData.loanEMI > 0 && <div className="flex justify-between p-5 border-b border-gray-50 text-[14px] font-bold text-red-600 bg-red-50/30"><span>Loan EMI Recovery</span><span>{formatINR(slipData.loanEMI)}</span></div>}
                        </div>
                      </div>
                      <div className="grid grid-cols-2 divide-x-2 divide-gray-900 bg-gray-50 border-t-2 border-gray-900">
                        <div className="flex justify-between p-5 text-[14px] font-bold text-gray-900 uppercase font-google-sans"><span>Total Earnings</span><span>{formatINR(slipData.grossEarnings)}</span></div>
                        <div className="flex justify-between p-5 text-[14px] font-bold text-gray-900 uppercase font-google-sans"><span>Total Deductions</span><span>{formatINR(slipData.totalDeductions)}</span></div>
                      </div>
                    </div>
                    
                    <div className="text-center pt-12 border-t-2 border-dashed border-gray-100">
                      <p className="text-[13px] font-medium text-gray-700 italic">
                        Amount in words: <span className="uppercase text-gray-900 not-italic font-bold tracking-tight">Indian Rupee {numberToWords(slipData.netPay)} Only</span>
                      </p>
                      <p className="text-[10px] text-gray-400 mt-10 font-bold uppercase tracking-[0.4em] opacity-40">System Authenticated Documents</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="max-w-6xl mx-auto space-y-10 animate-in fade-in duration-500">
            <div className="flex justify-between items-center border-b border-gray-200 pb-6">
              <div>
                <h1 className="text-2xl font-bold text-gray-900 tracking-tight font-google-sans">Loan Management</h1>
                <p className="text-[13px] text-gray-500 font-medium mt-1">Lifecycle management for employee advances and multi-month loans.</p>
              </div>
              <button 
                onClick={() => { setEditingLoanId(null); setEditLoanForm({ employeeId: '', totalAmount: '', emiAmount: '', startMonth: selectedMonth, remarks: '' }); }} 
                className="h-10 px-6 bg-gray-900 text-white font-bold rounded-lg text-[11px] uppercase tracking-widest shadow-lg flex items-center gap-2 hover:bg-black transition-all active:scale-95"
              >
                <Plus size={14} /> New Schedule
              </button>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-10">
              {/* Minimalist Form */}
              <div className="xl:col-span-1 space-y-6">
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
                  <div className="flex items-center gap-2 text-gray-900 mb-6">
                    <Settings size={16} />
                    <h3 className="font-bold uppercase text-[11px] tracking-[0.15em] font-google-sans">Configuration</h3>
                  </div>
                  
                  <div className="space-y-5">
                    <div>
                      <label className="block text-[10px] font-bold text-gray-400 uppercase mb-2 px-1 font-google-sans">Select Employee</label>
                      <select value={loanForm.employeeId} onChange={e => setEditLoanForm({...loanForm, employeeId: e.target.value})} className="w-full h-10 border border-gray-200 rounded-lg px-3 text-[13px] font-semibold bg-gray-50/50 outline-none focus:ring-2 focus:ring-gray-900 transition-all">
                        <option value="">Choose...</option>
                        {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                      </select>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[10px] font-bold text-gray-400 uppercase mb-2 px-1 font-google-sans">Principal (₹)</label>
                        <input type="number" value={loanForm.totalAmount} onChange={e => setEditLoanForm({...loanForm, totalAmount: e.target.value})} className="w-full h-10 border border-gray-200 rounded-lg px-3 font-bold bg-gray-50/50" placeholder="0" />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-gray-400 uppercase mb-2 px-1 font-google-sans">EMI (₹)</label>
                        <input type="number" value={loanForm.emiAmount} onChange={e => setEditLoanForm({...loanForm, emiAmount: e.target.value})} className="w-full h-10 border border-gray-200 rounded-lg px-3 font-bold bg-gray-50/50" placeholder="0" />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-gray-400 uppercase mb-2 px-1 font-google-sans">Start Month</label>
                      <input type="month" value={loanForm.startMonth} onChange={e => setEditLoanForm({...loanForm, startMonth: e.target.value})} className="w-full h-10 border border-gray-200 rounded-lg px-3 font-bold bg-gray-50/50" />
                    </div>

                    <button 
                      onClick={handleCreateLoan} 
                      disabled={loading} 
                      className="w-full h-11 bg-gray-900 text-white font-bold rounded-lg text-[11px] uppercase tracking-[0.2em] shadow-xl hover:bg-black transition-all mt-4"
                    >
                      {editingLoanId ? 'Update Loan' : 'Activate Loan'}
                    </button>
                  </div>
                </div>

                {/* Recent Activity Section */}
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 overflow-hidden">
                  <div className="flex items-center gap-2 text-gray-900 mb-6">
                    <History size={16} />
                    <h3 className="font-bold uppercase text-[11px] tracking-[0.15em] font-google-sans">Recent Activity</h3>
                  </div>
                  <div className="space-y-4">
                    {loanActivities.length === 0 ? (
                      <p className="text-xs text-gray-400 italic">No recent logs</p>
                    ) : (
                      loanActivities.map(act => (
                        <div key={act.id} className="flex gap-3 border-l-2 border-gray-100 pl-4 py-1">
                          <div className="flex-1">
                            <p className="text-[11px] font-bold text-gray-800">{act.detail}</p>
                            <p className="text-[9px] text-gray-400 uppercase font-bold mt-1">
                              {act.timestamp?.toDate ? new Date(act.timestamp.toDate()).toLocaleString() : 'Just now'}
                            </p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              {/* Data Table */}
              <div className="xl:col-span-2 space-y-6">
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                  <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/30 flex items-center justify-between">
                    <h3 className="font-bold uppercase text-[11px] tracking-widest flex items-center gap-2 font-google-sans">
                      Active Loan Schedules
                    </h3>
                    <span className="text-[10px] font-bold text-gray-400 uppercase">Live Database Sync</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-gray-50/50 text-[10px] font-bold uppercase text-gray-400 tracking-widest border-b border-gray-100">
                          <th className="px-6 py-4">Employee</th>
                          <th className="px-6 py-4 text-right">Remaining</th>
                          <th className="px-6 py-4 text-center">EMI</th>
                          <th className="px-6 py-4 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {loans.length === 0 ? (
                          <tr><td colSpan={4} className="px-6 py-12 text-center text-gray-400 italic font-medium">No active records</td></tr>
                        ) : (
                          loans.map(l => (
                            <tr key={l.id} className="group hover:bg-gray-50 transition-colors">
                              <td className="px-6 py-4">
                                <p className="text-[13px] font-bold text-gray-900">{l.employeeName}</p>
                                <p className="text-[10px] text-gray-400 font-medium truncate max-w-[180px]">{l.remarks}</p>
                              </td>
                              <td className="px-6 py-4 text-right font-bold text-indigo-600">{formatINR(l.remainingAmount)}</td>
                              <td className="px-6 py-4 text-center">
                                <span className="text-[11px] font-bold text-gray-700 bg-gray-100 px-2 py-1 rounded">{formatINR(l.emiAmount)}</span>
                              </td>
                              <td className="px-6 py-4 text-right">
                                <div className="flex justify-end gap-1">
                                  <button onClick={() => handleEditLoan(l)} className="p-2 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-all"><Edit2 size={14} /></button>
                                  <button onClick={() => setSelectedLoan(l)} className="p-2 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-all"><AlertCircle size={14} /></button>
                                  <button onClick={() => handleDeleteLoan(l.id, l.employeeName)} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"><Trash2 size={14} /></button>
                                </div>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {selectedLoan && (
                  <div className="bg-white rounded-xl border-2 border-amber-200 p-6 space-y-5 animate-in slide-in-from-top-4 duration-300">
                    <div className="flex justify-between items-center border-b border-amber-100 pb-4">
                      <div className="flex items-center gap-2 text-amber-700 font-bold uppercase text-[11px] tracking-widest font-google-sans">
                        <Info size={16} /> Override for {selectedLoan.employeeName}
                      </div>
                      <button onClick={() => setSelectedLoan(null)} className="text-gray-400 hover:text-gray-900"><X size={16} /></button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-6 items-end">
                      <div className="space-y-2">
                        <label className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">Target Month</label>
                        <input type="month" value={overrideForm.month} onChange={e => setOverrideForm({...overrideForm, month: e.target.value})} className="w-full h-10 border border-gray-200 rounded-lg px-3 font-bold text-[13px]" />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">Special EMI (₹)</label>
                        <input type="number" disabled={overrideForm.skip} value={overrideForm.amount} onChange={e => setOverrideForm({...overrideForm, amount: e.target.value})} className="w-full h-10 border border-gray-200 rounded-lg px-3 font-bold text-[13px] disabled:opacity-50" />
                      </div>
                      <div className="flex items-center gap-2 h-10 mb-0.5">
                        <input type="checkbox" checked={overrideForm.skip} onChange={e => setOverrideForm({...overrideForm, skip: e.target.checked})} className="w-4 h-4 rounded text-amber-600 focus:ring-amber-500" />
                        <label className="text-[10px] font-bold text-amber-700 uppercase font-google-sans">Skip Recov.</label>
                      </div>
                      <button onClick={() => handleUpdateOverride(selectedLoan.id)} className="h-10 bg-amber-600 text-white font-bold rounded-lg text-[10px] uppercase tracking-widest shadow-md hover:bg-amber-700 active:scale-95 transition-all">Submit Adjust.</button>
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
