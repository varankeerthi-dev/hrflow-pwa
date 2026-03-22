import React, { useState, useEffect, useRef, useMemo } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { useEmployees } from '../../hooks/useEmployees'
import { useSalarySlab } from '../../hooks/useSalarySlab'
import { useAttendance } from '../../hooks/useAttendance'
import { db } from '../../lib/firebase'
import { collection, query, where, getDocs, orderBy, limit, addDoc, serverTimestamp, setDoc, doc, getDoc, updateDoc, deleteDoc } from 'firebase/firestore'
import { formatINR, numberToWords } from '../../lib/salaryUtils'
import Spinner from '../ui/Spinner'
import { Wallet, Search, Download, Plus, History, Settings, AlertCircle, Info, X, CheckCircle2, Edit2, Trash2, Banknote, Clock } from 'lucide-react'
import { Document, Page, Text, View, StyleSheet, PDFDownloadLink, Image, Font } from '@react-pdf/renderer'
import { logActivity } from '../../hooks/useActivityLog'

// Register fonts for PDF
Font.register({ 
  family: 'Inter', 
  src: 'https://fonts.gstatic.com/s/inter/v12/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyfAZ9hiA.woff2' 
})

// FIXED: Complete PDF styles with all required definitions
const pdfStyles = StyleSheet.create({
  page: { 
    padding: 40, 
    fontSize: 10, 
    fontFamily: 'Inter', 
    color: '#111827' 
  },
  header: { 
    borderBottomWidth: 3, 
    borderBottomColor: '#111827', 
    paddingBottom: 15, 
    marginBottom: 20, 
    flexDirection: 'row', 
    justifyContent: 'space-between' 
  },
  title: { 
    fontSize: 24, 
    fontFamily: 'Inter', 
    fontWeight: 'bold', 
    textTransform: 'uppercase',
    color: '#111827'
  },
  logoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  logo: {
    width: 50,
    height: 50
  },
  payslipBadge: {
    textAlign: 'right'
  },
  payslipTitle: {
    fontSize: 16,
    fontFamily: 'Inter',
    fontWeight: 'bold',
    marginBottom: 4
  },
  identificationSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20
  },
  identificationDetails: {
    gap: 6
  },
  identificationRow: {
    flexDirection: 'row',
    fontSize: 10
  },
  netPayableBox: {
    width: 180,
    border: 2,
    borderColor: '#059669',
    borderRadius: 8,
    padding: 10,
    textAlign: 'center',
    backgroundColor: '#F0FDF4'
  },
  netPayableLabel: {
    fontSize: 8,
    fontWeight: 'bold',
    color: '#047857',
    marginBottom: 4
  },
  netPayableAmount: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#065F46'
  },
  salaryTable: {
    border: 2,
    borderColor: '#111827',
    borderRadius: 8,
    overflow: 'hidden',
    marginBottom: 20
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#111827',
    color: 'white',
    padding: 10
  },
  tableHeaderText: {
    flex: 1,
    fontWeight: 'bold',
    fontSize: 10
  },
  tableBody: {
    flexDirection: 'row'
  },
  tableColumn: {
    flex: 1
  },
  tableDivider: {
    borderRightWidth: 1,
    borderRightColor: '#111827'
  },
  tableRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F9FAFB'
  },
  tableRowLast: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 10
  },
  tableRowHighlight: {
    backgroundColor: '#FEF2F2',
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 10
  },
  footer: {
    textAlign: 'center',
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    borderStyle: 'dashed'
  }
})

// FIXED: Complete PDF component with proper structure
const SalarySlipPDF = ({ data, orgName, orgLogo }) => (
  <Document>
    <Page size="A4" style={pdfStyles.page}>
      {/* Header */}
      <View style={pdfStyles.header}>
        <View style={pdfStyles.logoContainer}>
          {orgLogo && <Image src={orgLogo} style={pdfStyles.logo} />}
          <Text style={pdfStyles.title}>{orgName}</Text>
        </View>
        <View style={pdfStyles.payslipBadge}>
          <Text style={pdfStyles.payslipTitle}>PAYSLIP</Text>
          <Text>{data.month}</Text>
        </View>
      </View>

      {/* Identification Section */}
      <View style={pdfStyles.identificationSection}>
        <View style={pdfStyles.identificationDetails}>
          <View style={pdfStyles.identificationRow}>
            <Text>Name: {data.employee.name}</Text>
          </View>
          <View style={pdfStyles.identificationRow}>
            <Text>Code: {data.employee.empCode}</Text>
          </View>
        </View>
        <View style={pdfStyles.netPayableBox}>
          <Text style={pdfStyles.netPayableLabel}>NET PAYABLE</Text>
          <Text style={pdfStyles.netPayableAmount}>{formatINR(data.netPay)}</Text>
        </View>
      </View>

      {/* Salary Table */}
      <View style={pdfStyles.salaryTable}>
        {/* Table Header */}
        <View style={pdfStyles.tableHeader}>
          <Text style={pdfStyles.tableHeaderText}>EARNINGS</Text>
          <Text style={[pdfStyles.tableHeaderText, { textAlign: 'right' }]}>DEDUCTIONS</Text>
        </View>

        {/* Table Body */}
        <View style={pdfStyles.tableBody}>
          {/* Earnings Column */}
          <View style={[pdfStyles.tableColumn, pdfStyles.tableDivider]}>
            <View style={pdfStyles.tableRow}>
              <Text>Basic</Text>
              <Text>{formatINR(data.basic)}</Text>
            </View>
            <View style={pdfStyles.tableRowLast}>
              <Text>HRA</Text>
              <Text>{formatINR(data.hra)}</Text>
            </View>
          </View>

          {/* Deductions Column */}
          <View style={pdfStyles.tableColumn}>
            <View style={pdfStyles.tableRow}>
              <Text>IT/Tax</Text>
              <Text>{formatINR(data.it)}</Text>
            </View>
            <View style={pdfStyles.tableRowLast}>
              <Text>PF</Text>
              <Text>{formatINR(data.pf)}</Text>
            </View>
            {data.loanEMI > 0 && (
              <View style={pdfStyles.tableRowHighlight}>
                <Text>Loan Recovery</Text>
                <Text>{formatINR(data.loanEMI)}</Text>
              </View>
            )}
          </View>
        </View>
      </View>

      {/* Footer */}
      <View style={pdfStyles.footer}>
        <Text>In Words: Indian Rupee {numberToWords(data.netPay)} Only</Text>
      </View>
    </Page>
  </Document>
)

export default function SalarySlipTab() {
  const { user } = useAuth()
  const { employees } = useEmployees(user?.orgId, true)
  const { slabs, increments } = useSalarySlab(user?.orgId)
  const { fetchByDate } = useAttendance(user?.orgId)
  const isAdmin = user?.role?.toLowerCase() === 'admin'
  
  const [activeTab, setActiveTab] = useState('salary-slip')
  const [selectedEmp, setSelectedEmp] = useState('')
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })
  
  const [loading, setLoading] = useState(false)
  const [slipData, setSlipData] = useState(null)
  const [genErr, setGenErr] = useState('')
  const [orgLogo, setOrgLogo] = useState('')
  
  const [loans, setLoans] = useState([])
  const [loanForm, setEditLoanForm] = useState({
    employeeId: '',
    totalAmount: '',
    emiAmount: '',
    startMonth: '',
    remarks: ''
  })
  const [editingLoanId, setEditingLoanId] = useState(null)
  const [selectedLoan, setSelectedLoan] = useState(null)
  const [overrideForm, setOverrideForm] = useState({
    month: '',
    amount: 0,
    reason: '',
    skip: false
  })
  const [loanActivities, setLoanActivities] = useState([])

  useEffect(() => {
    if (!user?.orgId) return
    getDoc(doc(db, 'organisations', user.orgId)).then(snap => {
      if (snap.exists()) setOrgLogo(snap.data().logoURL || '')
    })
    fetchLoans()
  }, [user?.orgId])

  const fetchLoans = async () => {
    try {
      const q = query(
        collection(db, 'organisations', user.orgId, 'loans'),
        orderBy('createdAt', 'desc')
      )
      const snap = await getDocs(q)
      setLoans(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      
      const actQ = query(
        collection(db, 'organisations', user.orgId, 'activityLogs'),
        where('module', '==', 'Loans'),
        orderBy('timestamp', 'desc'),
        limit(5)
      )
      const actSnap = await getDocs(actQ)
      setLoanActivities(actSnap.docs.map(d => ({ id: d.id, ...d.data() })))
    } catch (e) {
      console.error(e)
    }
  }

  const handleCreateLoan = async () => {
    if (!loanForm.employeeId || !loanForm.totalAmount || !loanForm.emiAmount) {
      return alert('Fill all required fields')
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
          module: 'Loans',
          action: 'Updated',
          detail: `Updated for ${emp?.name}`
        })
      } else {
        await addDoc(collection(db, 'organisations', user.orgId, 'loans'), {
          ...docData,
          remainingAmount: docData.totalAmount,
          status: 'Active',
          monthOverrides: {},
          createdAt: serverTimestamp(),
          createdBy: user.uid
        })
        await logActivity(user.orgId, user, {
          module: 'Loans',
          action: 'Created',
          detail: `Created ₹${docData.totalAmount} for ${emp?.name}`
        })
      }
      
      setEditLoanForm({
        employeeId: '',
        totalAmount: '',
        emiAmount: '',
        startMonth: '',
        remarks: ''
      })
      setEditingLoanId(null)
      setSlipData(null)
      fetchLoans()
      alert('Success')
    } catch (e) {
      alert(e.message)
    } finally {
      setLoading(false)
    }
  }

  const handleEditLoan = (l) => {
    setEditingLoanId(l.id)
    setEditLoanForm({
      employeeId: l.employeeId,
      totalAmount: l.totalAmount,
      emiAmount: l.emiAmount,
      startMonth: l.startMonth,
      remarks: l.remarks || ''
    })
  }

  const handleDeleteLoan = async (id, name) => {
    if (!isAdmin) return alert('No permission')
    if (!confirm(`Delete loan for ${name}?`)) return
    try {
      await deleteDoc(doc(db, 'organisations', user.orgId, 'loans', id))
      await logActivity(user.orgId, user, {
        module: 'Loans',
        action: 'Deleted',
        detail: `Deleted for ${name}`
      })
      setSlipData(null)
      fetchLoans()
      alert('Deleted')
    } catch (e) {
      alert(e.message)
    }
  }

  const handleUpdateOverride = async (id) => {
    if (!overrideForm.month) return alert('Select month')
    try {
      const ref = doc(db, 'organisations', user.orgId, 'loans', id)
      const snap = await getDoc(ref)
      const newOverrides = {
        ...(snap.data()?.monthOverrides || {}),
        [overrideForm.month]: {
          amount: overrideForm.skip ? 0 : Number(overrideForm.amount),
          skip: overrideForm.skip,
          reason: overrideForm.reason
        }
      }
      await updateDoc(ref, { monthOverrides: newOverrides })
      fetchLoans()
      setOverrideForm({ month: '', amount: 0, reason: '', skip: false })
    } catch (e) {
      alert(e.message)
    }
  }

  const calcEMI = (loan, month) => {
    if (loan.status !== 'Active' || loan.remainingAmount <= 0 || loan.startMonth > month) {
      return 0
    }
    const override = loan.monthOverrides?.[month]
    if (override) {
      return override.skip ? 0 : Math.min(override.amount, loan.remainingAmount)
    }
    return Math.min(loan.emiAmount, loan.remainingAmount)
  }

  const handleGenerate = async () => {
    if (!selectedEmp || !selectedMonth) return
    setLoading(true)
    setGenErr('')
    
    try {
      const slipId = `${selectedEmp}_${selectedMonth}`
      const slipSnap = await getDoc(doc(db, 'organisations', user.orgId, 'salarySlips', slipId))
      
      if (slipSnap.exists()) {
        setSlipData(slipSnap.data())
        setLoading(false)
        return
      }

      const emp = employees.find(e => e.id === selectedEmp)
      if (!emp) return setLoading(false)

      const [year, month] = selectedMonth.split('-').map(Number)
      const endDay = new Date(year, month, 0).getDate()
      const startDate = `${selectedMonth}-01`
      const endDate = `${selectedMonth}-${endDay}`

      // Fetch attendance
      const attSnap = await getDocs(query(
        collection(db, 'organisations', user.orgId, 'attendance'),
        where('employeeId', '==', selectedEmp)
      ))
      const attData = attSnap.docs
        .map(d => d.data())
        .filter(a => a.date >= startDate && a.date <= endDate)

      // Get salary slab
      const slab = increments
        .filter(i => i.employeeId === selectedEmp && i.effectiveFrom <= selectedMonth)
        .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0] || 
        slabs[selectedEmp] || {
          totalSalary: 0,
          basicPercent: 40,
          hraPercent: 20,
          incomeTaxPercent: 0,
          pfPercent: 0
        }

      const totalSalary = Number(slab.totalSalary) || 0
      const minHours = Number(emp.minDailyHours) || 8

      let paidDays = 0
      let lopDays = 0
      let autoOT = 0
      let sundayCount = 0
      let sundayWorked = 0
      let holidayWorked = 0
      let grid = []

      for (let i = 1; i <= endDay; i++) {
        const date = new Date(year, month - 1, i)
        const dateStr = date.toISOString().split('T')[0]
        const isSunday = date.getDay() === 0
        const record = attData.find(a => a.date === dateStr)

        let type = isSunday ? 'Sunday' : 'Absent'
        if (isSunday) sundayCount++

        if (record) {
          if (record.isAbsent) {
            type = 'Absent'
          } else if (record.sundayWorked) {
            type = 'Sunday Working'
            sundayWorked++
          } else if (record.sundayHoliday) {
            type = 'Sunday Holiday'
            holidayWorked++
          } else {
            type = 'Working'
          }

          if (record.otHours) {
            const [h, mi] = record.otHours.split(':').map(Number)
            autoOT += (h || 0) + (mi || 0) / 60
          }
        }

        if (type === 'Absent') {
          lopDays++
        } else {
          paidDays++
        }

        grid.push({ date: i, type, dateStr })
      }

      // Get approved OT
      const otSnap = await getDocs(query(
        collection(db, 'organisations', user.orgId, 'otApprovals'),
        where('employeeId', '==', selectedEmp),
        where('month', '==', selectedMonth)
      ))
      const finalOT = otSnap.docs
        .map(d => d.data())
        .find(o => o.status === 'approved')?.finalOTHours || autoOT

      // Calculate OT pay
      const otPay = finalOT * ((totalSalary / endDay) / minHours)

      // Get advances
      const advSnap = await getDocs(query(
        collection(db, 'organisations', user.orgId, 'advances'),
        where('employeeId', '==', selectedEmp)
      ))
      const advanceDeduction = advSnap.docs
        .map(d => d.data())
        .filter(a => a.status !== 'Recovered')
        .reduce((sum, curr) => sum + Number(curr.amount), 0)

      // Get loans
      const loanSnap = await getDocs(query(
        collection(db, 'organisations', user.orgId, 'loans'),
        where('employeeId', '==', selectedEmp),
        where('status', '==', 'Active')
      ))
      const emi = loanSnap.docs
        .map(d => d.data())
        .reduce((sum, loan) => sum + calcEMI(loan, selectedMonth), 0)

      // Get expense reimbursements
      const expSnap = await getDocs(query(
        collection(db, 'organisations', user.orgId, 'advances_expenses'),
        where('employeeId', '==', selectedEmp),
        where('paymentStatus', '==', 'Paid'),
        where('type', '==', 'Expense')
      ))
      const reimbursement = expSnap.docs
        .map(d => d.data())
        .filter(item => {
          const paidDate = item.paidAt?.toDate ? item.paidAt.toDate() : null
          return paidDate && 
                 paidDate.getFullYear() === year && 
                 (paidDate.getMonth() + 1) === month
        })
        .reduce((sum, curr) => sum + Number(curr.partialAmount || curr.amount), 0)

      // Calculate salary components
      const basic = totalSalary * (slab.basicPercent / 100) * (paidDays / endDay)
      const hra = totalSalary * (slab.hraPercent / 100) * (paidDays / endDay)
      const pf = totalSalary * (slab.pfPercent / 100)
      const it = totalSalary * (slab.incomeTaxPercent / 100)

      const grossEarnings = basic + hra + otPay + reimbursement
      const totalDeductions = pf + it + advanceDeduction + emi
      const netPay = Math.max(0, grossEarnings - totalDeductions)

      setSlipData({
        employee: emp,
        month: selectedMonth,
        slab,
        grid,
        paidDays,
        lopDays,
        autoOTHours: autoOT,
        finalOT,
        otPay,
        basic,
        hra,
        expenseReimbursement: reimbursement,
        grossEarnings,
        pf,
        it,
        advanceDeduction,
        loanEMI: emi,
        totalDeductions,
        netPay,
        sundayCount,
        sundayWorkedCount: sundayWorked,
        holidayWorkedCount: holidayWorked
      })
    } catch (e) {
      setGenErr(e.message)
    } finally {
      setLoading(false)
    }
  }

  const handleFinalizeSlip = async () => {
    if (!slipData) return
    setLoading(true)
    try {
      const slipId = `${slipData.employee.id}_${slipData.month}`
      await setDoc(doc(db, 'organisations', user.orgId, 'salarySlips', slipId), {
        ...slipData,
        finalizedAt: serverTimestamp(),
        finalizedBy: user.uid
      })

      if (slipData.loanEMI > 0) {
        const loanSnap = await getDocs(query(
          collection(db, 'organisations', user.orgId, 'loans'),
          where('employeeId', '==', slipData.employee.id),
          where('status', '==', 'Active')
        ))
        
        for (const loanDoc of loanSnap.docs) {
          const loanData = loanDoc.data()
          const deduction = calcEMI(loanData, slipData.month)
          if (deduction > 0) {
            const newRemaining = Math.max(0, loanData.remainingAmount - deduction)
            await updateDoc(loanDoc.ref, {
              remainingAmount: newRemaining,
              status: newRemaining <= 0 ? 'Closed' : 'Active',
              updatedAt: serverTimestamp()
            })
            await logActivity(user.orgId, user, {
              module: 'Loans',
              action: 'EMI Deducted',
              detail: `₹${deduction} for ${slipData.employee.name}`
            })
          }
        }
      }

      alert('Salary slip finalized successfully')
      fetchLoans()
    } catch (e) {
      alert(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex h-full bg-gray-50 -m-6">
      {/* IMPROVED: Sidebar */}
      <div className="w-64 bg-white border-r border-gray-200 flex flex-col pt-8">
        <div className="px-6 mb-8">
          <h2 className="text-sm font-semibold text-gray-500">Payroll Engine</h2>
        </div>
        
        <nav className="flex-1 space-y-1 px-4">
          <button
            onClick={() => setActiveTab('salary-slip')}
            className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all ${
              activeTab === 'salary-slip'
                ? 'bg-primary-600 text-white shadow-elevated'
                : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            <Banknote size={18} />
            <span className="text-sm font-medium">Salary Slip</span>
          </button>
          
          <button
            onClick={() => setActiveTab('loan')}
            className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all ${
              activeTab === 'loan'
                ? 'bg-primary-600 text-white shadow-elevated'
                : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            <Wallet size={18} />
            <span className="text-sm font-medium">Loan Management</span>
          </button>
        </nav>
      </div>

      {/* IMPROVED: Main Content */}
      <div className="flex-1 overflow-auto p-10">
        {activeTab === 'salary-slip' ? (
          <div className="max-w-6xl mx-auto space-y-8">
            {/* IMPROVED: Selection Panel */}
            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-card">
              <div className="flex flex-wrap gap-6 items-end">
                <div className="flex-1 min-w-[280px]">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Target Employee
                  </label>
                  <select
                    value={selectedEmp}
                    onChange={e => setSelectedEmp(e.target.value)}
                    className="w-full h-11 border border-gray-200 rounded-lg px-4 text-sm font-normal bg-white outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors"
                  >
                    <option value="">Select employee...</option>
                    {employees.map(e => (
                      <option key={e.id} value={e.id}>{e.name}</option>
                    ))}
                  </select>
                </div>

                <div className="w-[200px]">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Pay Period
                  </label>
                  <input
                    type="month"
                    value={selectedMonth}
                    onChange={e => setSelectedMonth(e.target.value)}
                    className="w-full h-11 border border-gray-200 rounded-lg px-4 text-sm font-normal outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors"
                  />
                </div>

                <button
                  onClick={handleGenerate}
                  disabled={loading || !selectedEmp}
                  className="h-11 px-8 bg-primary-600 text-white font-medium rounded-lg text-sm shadow-elevated hover:bg-primary-700 active:bg-primary-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? 'Generating...' : 'Generate'}
                </button>
              </div>
            </div>

            {/* IMPROVED: Salary Slip Display */}
            {slipData && (
              <div className="bg-white border border-gray-200 shadow-xl rounded-2xl overflow-hidden">
                {/* IMPROVED: Action Bar */}
                <div className="flex justify-end gap-3 p-5 bg-gray-50 border-b border-gray-200">
                  <PDFDownloadLink
                    key={`${slipData.employee.id}_${slipData.month}`}
                    document={
                      <SalarySlipPDF
                        data={slipData}
                        orgName={user?.orgName || 'Organization'}
                        orgLogo={orgLogo}
                      />
                    }
                    fileName={`SalarySlip_${slipData.employee.name.replace(/\s+/g, '_')}_${slipData.month}.pdf`}
                    className="h-10 bg-white border border-gray-200 text-gray-700 px-4 rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-gray-50 transition-colors"
                  >
                    {({ loading: pdfLoading }) => (
                      <>
                        <Download size={16} />
                        {pdfLoading ? 'Preparing...' : 'Export PDF'}
                      </>
                    )}
                  </PDFDownloadLink>

                  <button
                    onClick={handleFinalizeSlip}
                    disabled={loading}
                    className="h-10 bg-primary-600 text-white px-6 rounded-lg text-sm font-medium shadow-elevated flex items-center gap-2 hover:bg-primary-700 active:bg-primary-800 transition-all disabled:opacity-50"
                  >
                    <CheckCircle2 size={16} />
                    Confirm & Save
                  </button>
                </div>

                {/* IMPROVED: Salary Slip Content */}
                <div className="p-16 bg-white">
                  {/* Header */}
                  <div className="border-b-4 border-gray-900 pb-8 mb-10 flex justify-between items-start">
                    <div className="flex items-center gap-6">
                      {orgLogo && (
                        <img
                          src={orgLogo}
                          alt="Logo"
                          className="w-20 h-20 object-contain"
                        />
                      )}
                      <div>
                        <h1 className="text-4xl font-bold text-gray-900">
                          {user?.orgName || 'Organization'}
                        </h1>
                        <p className="text-xs text-gray-500 font-medium mt-3">
                          Employee Remuneration Advice
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <h2 className="text-2xl font-bold text-gray-800">
                        Payslip
                      </h2>
                      <p className="text-sm font-medium text-gray-600 mt-2">
                        {new Date(slipData.month + '-01').toLocaleDateString('en-US', {
                          month: 'long',
                          year: 'numeric'
                        })}
                      </p>
                    </div>
                  </div>

                  {/* Employee Details & Net Pay */}
                  <div className="flex justify-between items-start mb-12">
                    <div className="space-y-3">
                      <h3 className="text-sm font-semibold text-gray-900 border-b-2 border-gray-900 pb-1 inline-block">
                        Identification
                      </h3>
                      <div className="space-y-2 text-sm">
                        <div className="flex gap-8">
                          <span className="w-40 text-gray-500 font-medium">Name</span>
                          <span className="font-semibold text-gray-900">
                            : {slipData.employee.name}
                          </span>
                        </div>
                        <div className="flex gap-8">
                          <span className="w-40 text-gray-500 font-medium">Code</span>
                          <span className="font-semibold text-gray-900">
                            : {slipData.employee.empCode}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="bg-gradient-to-br from-primary-600 to-primary-700 text-white rounded-xl p-6 text-center min-w-[220px] shadow-2xl">
                      <p className="text-xs font-medium text-primary-100 mb-2">
                        Net Payable (INR)
                      </p>
                      <p className="text-3xl font-bold">
                        {formatINR(slipData.netPay)}
                      </p>
                    </div>
                  </div>

                  {/* IMPROVED: Earnings & Deductions Table */}
                  <div className="border-2 border-gray-900 rounded-xl overflow-hidden mb-12">
                    {/* Table Header */}
                    <div className="grid grid-cols-2 bg-gray-900 text-white">
                      <div className="p-5 flex justify-between items-center font-semibold text-sm">
                        <span>Earnings</span>
                        <span>INR</span>
                      </div>
                      <div className="p-5 flex justify-between items-center border-l border-gray-700 font-semibold text-sm">
                        <span>Deductions</span>
                        <span>INR</span>
                      </div>
                    </div>

                    {/* Table Body */}
                    <div className="grid grid-cols-2 divide-x-2 divide-gray-900">
                      {/* Earnings Column */}
                      <div className="divide-y divide-gray-100">
                        <div className="flex justify-between p-5 text-sm">
                          <span className="text-gray-600 font-medium">Basic Salary</span>
                          <span className="font-semibold text-gray-900">
                            {formatINR(slipData.basic)}
                          </span>
                        </div>
                        <div className="flex justify-between p-5 text-sm">
                          <span className="text-gray-600 font-medium">HRA</span>
                          <span className="font-semibold text-gray-900">
                            {formatINR(slipData.hra)}
                          </span>
                        </div>
                        {slipData.otPay > 0 && (
                          <div className="flex justify-between p-5 text-sm bg-blue-50 text-blue-700">
                            <span className="font-medium">Overtime</span>
                            <span className="font-semibold">
                              {formatINR(slipData.otPay)}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Deductions Column */}
                      <div className="divide-y divide-gray-100">
                        <div className="flex justify-between p-5 text-sm">
                          <span className="text-gray-600 font-medium">Tax / IT</span>
                          <span className="font-semibold text-gray-900">
                            {formatINR(slipData.it)}
                          </span>
                        </div>
                        <div className="flex justify-between p-5 text-sm">
                          <span className="text-gray-600 font-medium">Provident Fund</span>
                          <span className="font-semibold text-gray-900">
                            {formatINR(slipData.pf)}
                          </span>
                        </div>
                        {slipData.loanEMI > 0 && (
                          <div className="flex justify-between p-5 text-sm bg-red-50 text-red-700">
                            <span className="font-medium">Loan Recovery</span>
                            <span className="font-semibold">
                              {formatINR(slipData.loanEMI)}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Table Footer */}
                    <div className="grid grid-cols-2 divide-x-2 divide-gray-900 bg-gray-50 border-t-2 border-gray-900">
                      <div className="p-5 flex justify-between font-semibold text-sm text-gray-900">
                        <span>Total Earnings</span>
                        <span>{formatINR(slipData.grossEarnings)}</span>
                      </div>
                      <div className="p-5 flex justify-between font-semibold text-sm text-gray-900">
                        <span>Total Deductions</span>
                        <span>{formatINR(slipData.totalDeductions)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Footer */}
                  <div className="text-center pt-12 border-t-2 border-dashed border-gray-200">
                    <p className="text-sm font-medium text-gray-700">
                      Amount in words:{' '}
                      <span className="text-gray-900 font-semibold">
                        Indian Rupee {numberToWords(slipData.netPay)} Only
                      </span>
                    </p>
                    <p className="text-xs text-gray-400 mt-10 font-medium opacity-60">
                      System Authenticated Document
                    </p>
                  </div>
                </div>
              </div>
            )}

            {genErr && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm font-medium">
                {genErr}
              </div>
            )}
          </div>
        ) : (
          /* IMPROVED: Loan Management Tab */
          <div className="max-w-6xl mx-auto space-y-8">
            {/* Header */}
            <div className="flex justify-between items-center border-b border-gray-200 pb-6">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Loan Management</h1>
                <p className="text-sm text-gray-500 font-medium mt-1">
                  Lifecycle tracking for employee advances
                </p>
              </div>
              <button
                onClick={() => {
                  setEditingLoanId(null)
                  setEditLoanForm({
                    employeeId: '',
                    totalAmount: '',
                    emiAmount: '',
                    startMonth: selectedMonth,
                    remarks: ''
                  })
                }}
                className="h-10 px-6 bg-primary-600 text-white font-medium rounded-lg text-sm shadow-elevated flex items-center gap-2 hover:bg-primary-700 active:bg-primary-800 transition-all"
              >
                <Plus size={16} />
                New Loan
              </button>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
              {/* Left Column - Form & Activity */}
              <div className="space-y-6">
                {/* IMPROVED: Loan Form */}
                <div className="bg-white rounded-xl border border-gray-200 shadow-card p-6">
                  <div className="flex items-center gap-2 text-gray-900 mb-6 font-semibold text-sm">
                    <Settings size={18} />
                    Configuration
                  </div>

                  <div className="space-y-5">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Employee
                      </label>
                      <select
                        value={loanForm.employeeId}
                        onChange={e => setEditLoanForm({ ...loanForm, employeeId: e.target.value })}
                        className="w-full h-10 border border-gray-200 rounded-lg px-3 text-sm font-normal bg-gray-50 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-colors"
                      >
                        <option value="">Select employee...</option>
                        {employees.map(e => (
                          <option key={e.id} value={e.id}>{e.name}</option>
                        ))}
                      </select>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Principal
                        </label>
                        <input
                          type="number"
                          value={loanForm.totalAmount}
                          onChange={e => setEditLoanForm({ ...loanForm, totalAmount: e.target.value })}
                          className="w-full h-10 border border-gray-200 rounded-lg px-3 text-sm font-normal bg-gray-50 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-colors"
                          placeholder="0.00"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          EMI Amount
                        </label>
                        <input
                          type="number"
                          value={loanForm.emiAmount}
                          onChange={e => setEditLoanForm({ ...loanForm, emiAmount: e.target.value })}
                          className="w-full h-10 border border-gray-200 rounded-lg px-3 text-sm font-normal bg-gray-50 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-colors"
                          placeholder="0.00"
                        />
                      </div>
                    </div>

                    <button
                      onClick={handleCreateLoan}
                      disabled={loading}
                      className="w-full h-11 bg-primary-600 text-white font-medium rounded-lg text-sm shadow-elevated hover:bg-primary-700 active:bg-primary-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {editingLoanId ? 'Update Loan' : 'Activate Loan'}
                    </button>
                  </div>
                </div>

                {/* IMPROVED: Activity Log */}
                <div className="bg-white rounded-xl border border-gray-200 shadow-card p-6">
                  <div className="flex items-center gap-2 text-gray-900 mb-6 font-semibold text-sm">
                    <History size={18} />
                    Recent Activity
                  </div>
                  <div className="space-y-4">
                    {loanActivities.length === 0 ? (
                      <p className="text-sm text-gray-400 text-center py-4">
                        No recent activity
                      </p>
                    ) : (
                      loanActivities.map(act => (
                        <div
                          key={act.id}
                          className="flex gap-3 border-l-2 border-gray-200 pl-4 py-1"
                        >
                          <div className="flex-1 text-sm font-medium text-gray-700">
                            {act.detail}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              {/* Right Column - Loan Table */}
              <div className="xl:col-span-2 space-y-6">
                <div className="bg-white rounded-xl border border-gray-200 shadow-card overflow-hidden">
                  <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
                    <h3 className="font-semibold text-sm text-gray-900">
                      Active Loan Schedules
                    </h3>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-100">
                          <th className="px-6 py-4 text-xs font-semibold text-gray-600 uppercase tracking-wider">
                            Employee
                          </th>
                          <th className="px-6 py-4 text-xs font-semibold text-gray-600 uppercase tracking-wider text-right">
                            Remaining
                          </th>
                          <th className="px-6 py-4 text-xs font-semibold text-gray-600 uppercase tracking-wider text-right">
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {loans.length === 0 ? (
                          <tr>
                            <td colSpan={3} className="px-6 py-12 text-center text-sm text-gray-400">
                              No active loans
                            </td>
                          </tr>
                        ) : (
                          loans.map(loan => (
                            <tr key={loan.id} className="hover:bg-gray-50 transition-colors">
                              <td className="px-6 py-4 font-semibold text-sm text-gray-900">
                                {loan.employeeName}
                              </td>
                              <td className="px-6 py-4 text-right font-bold text-sm text-primary-600">
                                {formatINR(loan.remainingAmount)}
                              </td>
                              <td className="px-6 py-4">
                                <div className="flex justify-end gap-1">
                                  <button
                                    onClick={() => handleEditLoan(loan)}
                                    className="p-2 hover:bg-gray-100 rounded-lg transition-all"
                                    title="Edit"
                                  >
                                    <Edit2 size={16} className="text-gray-600" />
                                  </button>
                                  <button
                                    onClick={() => setSelectedLoan(loan)}
                                    className="p-2 hover:bg-amber-50 rounded-lg transition-all"
                                    title="Override EMI"
                                  >
                                    <AlertCircle size={16} className="text-amber-600" />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteLoan(loan.id, loan.employeeName)}
                                    className="p-2 hover:bg-red-50 rounded-lg transition-all"
                                    title="Delete"
                                  >
                                    <Trash2 size={16} className="text-red-600" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* IMPROVED: Override Panel */}
                {selectedLoan && (
                  <div className="bg-white rounded-xl border-2 border-amber-200 p-6 space-y-5 shadow-lg">
                    <div className="flex justify-between items-center border-b border-amber-100 pb-4">
                      <div className="flex items-center gap-2 text-amber-700 font-semibold text-sm">
                        <Info size={18} />
                        Override EMI: {selectedLoan.employeeName}
                      </div>
                      <button
                        onClick={() => setSelectedLoan(null)}
                        className="text-gray-400 hover:text-gray-900 transition-colors"
                      >
                        <X size={18} />
                      </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Month
                        </label>
                        <input
                          type="month"
                          value={overrideForm.month}
                          onChange={e => setOverrideForm({ ...overrideForm, month: e.target.value })}
                          className="w-full h-10 border border-gray-200 rounded-lg px-3 text-sm font-normal outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500 transition-colors"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          EMI Amount (₹)
                        </label>
                        <input
                          type="number"
                          disabled={overrideForm.skip}
                          value={overrideForm.amount}
                          onChange={e => setOverrideForm({ ...overrideForm, amount: e.target.value })}
                          className="w-full h-10 border border-gray-200 rounded-lg px-3 text-sm font-normal outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                          placeholder="0.00"
                        />
                      </div>

                      <div className="flex items-center gap-2 h-10">
                        <input
                          type="checkbox"
                          checked={overrideForm.skip}
                          onChange={e => setOverrideForm({ ...overrideForm, skip: e.target.checked })}
                          className="w-4 h-4 rounded text-amber-600 focus:ring-amber-500 cursor-pointer"
                        />
                        <label className="text-sm font-medium text-amber-700 cursor-pointer">
                          Skip Month
                        </label>
                      </div>

                      <button
                        onClick={() => handleUpdateOverride(selectedLoan.id)}
                        className="h-10 bg-amber-600 text-white font-medium rounded-lg text-sm shadow-elevated hover:bg-amber-700 active:bg-amber-800 transition-all"
                      >
                        Apply Override
                      </button>
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