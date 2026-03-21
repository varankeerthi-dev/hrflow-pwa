import React, { useState, useEffect, useRef, useMemo } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { useEmployees } from '../../hooks/useEmployees'
import { useSalarySlab } from '../../hooks/useSalarySlab'
import { useAttendance } from '../../hooks/useAttendance'
import { db } from '../../lib/firebase'
import { collection, query, where, getDocs, orderBy, limit, addDoc, serverTimestamp, setDoc, doc, getDoc } from 'firebase/firestore'
import { formatINR, numberToWords } from '../../lib/salaryUtils'
import Spinner from '../ui/Spinner'
import Modal from '../ui/Modal'
import { Wallet, Search, Download, Printer, Save, Clock, Banknote, FileText } from 'lucide-react'
import { Document, Page, Text, View, StyleSheet, PDFDownloadLink, Image } from '@react-pdf/renderer'

// PDF Styles
const pdfStyles = StyleSheet.create({
  page: { padding: 40, fontSize: 10, fontFamily: 'Helvetica', color: '#111827' },
  header: { borderBottomWidth: 3, borderBottomColor: '#111827', paddingBottom: 15, marginBottom: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logo: { width: 50, height: 50, objectFit: 'contain' },
  orgTitle: { fontSize: 24, fontWeight: 'black', textTransform: 'uppercase' },
  headerSubtitle: { fontSize: 9, color: '#9CA3AF', fontWeight: 'bold', marginTop: 5, letterSpacing: 1 },
  headerRight: { textAlign: 'right' },
  payslipTitle: { fontSize: 16, fontWeight: 'black', textTransform: 'uppercase' },
  periodBadge: { marginTop: 5, backgroundColor: '#EEF2FF', color: '#4F46E5', padding: '4 8', borderRadius: 10, fontSize: 10, fontWeight: 'bold' },
  
  identificationSection: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
  idGrid: { width: '60%' },
  idRow: { flexDirection: 'row', marginBottom: 4, fontSize: 9 },
  idLabel: { width: 100, color: '#9CA3AF', fontWeight: 'bold', textTransform: 'uppercase' },
  idValue: { fontWeight: 'bold' },
  
  netPayBadge: { width: 180, border: 2, borderColor: '#059669', borderRadius: 8, padding: 10, textAlign: 'center', backgroundColor: '#F0FDF4' },
  netPayLabel: { fontSize: 8, fontWeight: 'black', color: '#047857', marginBottom: 2 },
  netPayAmount: { fontSize: 18, fontWeight: 'black', color: '#065F46' },
  
  summaryGrid: { flexDirection: 'row', gap: 8, marginBottom: 20 },
  summaryBox: { flex: 1, backgroundColor: '#F9FAFB', border: 1, borderColor: '#F3F4F6', borderRadius: 8, padding: 8, textAlign: 'center' },
  summaryLabel: { fontSize: 7, fontWeight: 'black', color: '#9CA3AF', textTransform: 'uppercase', marginBottom: 2 },
  summaryValue: { fontSize: 12, fontWeight: 'black' },
  
  earningsDeductionsContainer: { border: 2, borderColor: '#111827', borderRadius: 8, overflow: 'hidden', marginBottom: 20 },
  tableHeader: { flexDirection: 'row', backgroundColor: '#111827', color: 'white', fontWeight: 'black', fontSize: 9, padding: 8 },
  tableBody: { flexDirection: 'row' },
  tableCol: { flex: 1, borderRightWidth: 1, borderRightColor: '#111827' },
  tableRow: { flexDirection: 'row', justifyContent: 'space-between', padding: 8, borderBottomWidth: 1, borderBottomColor: '#F9FAFB', fontSize: 9 },
  rowLabel: { color: '#4B5563' },
  rowValue: { fontWeight: 'bold' },
  highlightGreen: { backgroundColor: '#F0FDF4', color: '#059669', fontWeight: 'bold' },
  highlightRed: { backgroundColor: '#FEF2F2', color: '#DC2626', fontWeight: 'bold' },
  
  totalRow: { flexDirection: 'row', backgroundColor: '#F9FAFB', borderTopWidth: 2, borderTopColor: '#111827', padding: 8, fontWeight: 'black', fontSize: 10 },
  
  wordsSection: { textAlign: 'center', paddingTop: 20, borderTopWidth: 1, borderTopColor: '#F3F4F6', borderTopStyle: 'dashed' },
  wordsText: { fontSize: 10, fontWeight: 'bold', color: '#374151', fontStyle: 'italic' },
  wordsAmount: { fontWeight: 'black', textTransform: 'uppercase', color: '#111827' },
  footerTag: { fontSize: 8, color: '#9CA3AF', marginTop: 15, fontWeight: 'black', letterSpacing: 2 }
})

// PDF Component
const SalarySlipPDF = ({ data, orgName, orgLogo }) => (
  <Document>
    <Page size="A4" style={pdfStyles.page}>
      {/* Header */}
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

      {/* Staff Identification */}
      <View style={pdfStyles.identificationSection}>
        <View style={pdfStyles.idGrid}>
          <Text style={{ fontSize: 8, fontWeight: 'black', color: '#111827', marginBottom: 10 }}>STAFF IDENTIFICATION</Text>
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

      {/* Summary Grid */}
      <View style={pdfStyles.summaryGrid}>
        <View style={pdfStyles.summaryBox}><Text style={pdfStyles.summaryLabel}>Worked</Text><Text style={pdfStyles.summaryValue}>{data.paidDays}d</Text></View>
        <View style={pdfStyles.summaryBox}><Text style={pdfStyles.summaryLabel}>Sunday</Text><Text style={pdfStyles.summaryValue}>{data.sundayCount || 0}</Text></View>
        <View style={pdfStyles.summaryBox}><Text style={pdfStyles.summaryLabel}>Sun Work</Text><Text style={pdfStyles.summaryValue}>{data.sundayWorkedCount || 0}</Text></View>
        <View style={pdfStyles.summaryBox}><Text style={pdfStyles.summaryLabel}>Holi Work</Text><Text style={pdfStyles.summaryValue}>{data.holidayWorkedCount || 0}</Text></View>
        <View style={pdfStyles.summaryBox}><Text style={pdfStyles.summaryLabel}>OT Hours</Text><Text style={pdfStyles.summaryValue}>{data.autoOTHours.toFixed(1)}h</Text></View>
        <View style={pdfStyles.summaryBox}><Text style={pdfStyles.summaryLabel}>Advance</Text><Text style={pdfStyles.summaryValue}>{formatINR(data.advanceDeduction || 0)}</Text></View>
        <View style={pdfStyles.summaryBox}><Text style={pdfStyles.summaryLabel}>Leave</Text><Text style={pdfStyles.summaryValue}>{data.lopDays}</Text></View>
      </View>

      {/* Earnings & Deductions Table */}
      <View style={pdfStyles.earningsDeductionsContainer}>
        <View style={pdfStyles.tableHeader}>
          <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'space-between', paddingRight: 10 }}><Text>EARNINGS</Text><Text>INR (₹)</Text></View>
          <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'space-between', paddingLeft: 10 }}><Text>DEDUCTIONS</Text><Text>INR (₹)</Text></View>
        </View>
        
        <View style={pdfStyles.tableBody}>
          {/* Earnings Col */}
          <View style={pdfStyles.tableCol}>
            <View style={pdfStyles.tableRow}><Text style={pdfStyles.rowLabel}>Basic Component</Text><Text style={pdfStyles.rowValue}>{formatINR(data.basic)}</Text></View>
            <View style={pdfStyles.tableRow}><Text style={pdfStyles.rowLabel}>H.R.A (Allowances)</Text><Text style={pdfStyles.rowValue}>{formatINR(data.hra)}</Text></View>
            {data.expenseReimbursement > 0 && <View style={[pdfStyles.tableRow, pdfStyles.highlightGreen]}><Text>Expense Reimb.</Text><Text>{formatINR(data.expenseReimbursement)}</Text></View>}
            {data.otPay > 0 && <View style={[pdfStyles.tableRow, { color: '#4F46E5', fontWeight: 'bold' }]}><Text>Overtime ({data.finalOT}h)</Text><Text>{formatINR(data.otPay)}</Text></View>}
          </View>
          
          {/* Deductions Col */}
          <View style={{ flex: 1 }}>
            <View style={pdfStyles.tableRow}><Text style={pdfStyles.rowLabel}>Statutory Tax (IT)</Text><Text style={pdfStyles.rowValue}>{formatINR(data.it)}</Text></View>
            <View style={pdfStyles.tableRow}><Text style={pdfStyles.rowLabel}>Provident Fund (PF)</Text><Text style={pdfStyles.rowValue}>{formatINR(data.pf)}</Text></View>
            {data.advanceDeduction > 0 && <View style={[pdfStyles.tableRow, pdfStyles.highlightRed]}><Text>Advance Recovery</Text><Text>{formatINR(data.advanceDeduction)}</Text></View>}
          </View>
        </View>

        <View style={pdfStyles.totalRow}>
          <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'space-between', paddingRight: 10 }}><Text>GROSS EARNINGS</Text><Text>{formatINR(data.grossEarnings)}</Text></View>
          <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'space-between', paddingLeft: 10 }}><Text>TOTAL DEDUCTIONS</Text><Text>{formatINR(data.totalDeductions)}</Text></View>
        </View>
      </View>

      {/* Net Disbursement */}
      <View style={{ backgroundColor: '#111827', borderRadius: 12, padding: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <View>
          <Text style={{ color: 'white', fontSize: 14, fontWeight: 'black', letterSpacing: 2 }}>TOTAL NET DISBURSEMENT</Text>
          <Text style={{ color: '#9CA3AF', fontSize: 8, marginTop: 4 }}>Calculated as: Gross - Deductions</Text>
        </View>
        <Text style={{ color: 'white', fontSize: 24, fontWeight: 'black' }}>{formatINR(data.netPay)}</Text>
      </View>

      {/* Footer */}
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

  const [selectedEmp, setSelectedEmp] = useState('')
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })

  const [loading, setLoading] = useState(false)
  const [slipData, setSlipData] = useState(null)
  const [generateError, setGenerateError] = useState('')

  const [advances, setAdvances] = useState([])
  const [newAdvance, setNewAdvance] = useState({ type: 'Advance', amount: 0, date: '', reason: '' })

  const [otRequest, setOtRequest] = useState(null)
  const [revisedOT, setRevisedOT] = useState(0)
  const [otNote, setOtNote] = useState('')

  const [activeBottomTab, setActiveBottomTab] = useState('ot') // 'ot' or 'advances'
  const [continuousLeaveRule, setContinuousLeaveRule] = useState(false)
  const [orgLogo, setOrgLogo] = useState('')
  const slipRef = useRef(null)

  // Fetch organization logo
  useEffect(() => {
    if (!user?.orgId) return
    getDoc(doc(db, 'organisations', user.orgId)).then(snap => {
      if (snap.exists()) {
        setOrgLogo(snap.data().logoURL || '')
      }
    })
  }, [user?.orgId])

  const formatMonthYear = (monthStr) => {
    const [year, month] = monthStr.split('-')
    const date = new Date(year, parseInt(month) - 1)
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
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

      const startDate = `${selectedMonth}-01`
      const [year, month] = selectedMonth.split('-')
      const endDay = new Date(year, month, 0).getDate()
      const endDate = `${selectedMonth}-${endDay}`

      const attQ = query(collection(db, 'organisations', user.orgId, 'attendance'), where('employeeId', '==', selectedEmp))
      const attSnap = await getDocs(attQ)
      const allAttData = attSnap.docs.map(d => d.data())
      const attData = allAttData.filter(a => a.date >= startDate && a.date <= endDate)

      const applicableIncrements = increments.filter(i => i.employeeId === selectedEmp && i.effectiveFrom <= selectedMonth).sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))
      const activeSlab = applicableIncrements[0] || slabs[selectedEmp] || { totalSalary: 0, basicPercent: 40, hraPercent: 20, incomeTaxPercent: 0, pfPercent: 0 }

      const totalSalary = Number(activeSlab.totalSalary) || 0
      const minDailyHours = Number(emp.minDailyHours) || 8

      let paidDays = 0
      let lopDays = 0
      let autoOTHours = 0
      let sundayCount = 0
      let sundayWorkedCount = 0
      let holidayWorkedCount = 0

      const grid = []
      for (let i = 1; i <= endDay; i++) {
        const d = new Date(year, month - 1, i)
        const dStr = d.toISOString().split('T')[0]
        const isSunday = d.getDay() === 0
        const rec = attData.find(a => a.date === dStr)

        let type = 'Normal'
        if (isSunday) {
          type = 'Sunday'
          sundayCount++
        }
        if (rec) {
          if (rec.isAbsent) type = 'Absent'
          else if (rec.sundayWorked) {
            type = 'Sunday Working'
            sundayWorkedCount++
          }
          else if (rec.sundayHoliday) {
            type = 'Sunday Holiday'
            holidayWorkedCount++
          }
          else type = 'Working'
          if (rec.otHours) {
            const [h, m] = rec.otHours.split(':').map(Number)
            autoOTHours += (h || 0) + (m || 0) / 60
          }
        } else if (isSunday) type = 'Sunday'
        else type = 'Absent'

        if (type === 'Absent') lopDays++
        else paidDays++
        grid.push({ date: i, type, dStr })
      }

      if (continuousLeaveRule) {
        grid.forEach((day, idx) => {
          if (day.type === 'Sunday' || day.type === 'Sunday Holiday') {
            let leftAbsent = false
            let rightAbsent = false
            for (let i = idx - 1; i >= 0; i--) {
              if (grid[i].type === 'Absent') { leftAbsent = true; break; }
              if (grid[i].type === 'Working') break;
            }
            for (let i = idx + 1; i < grid.length; i++) {
              if (grid[i].type === 'Absent') { rightAbsent = true; break; }
              if (grid[i].type === 'Working') break;
            }
            if (leftAbsent && rightAbsent) {
              day.isUnpaidSunday = true
              lopDays++
              paidDays--
            }
          }
        })
      }

      const perDaySalary = totalSalary / endDay
      const otRate = perDaySalary / minDailyHours

      const otQ = query(collection(db, 'organisations', user.orgId, 'otApprovals'), where('employeeId', '==', selectedEmp), where('month', '==', selectedMonth))
      const otSnap = await getDocs(otQ)
      const allOT = otSnap.docs.map(d => ({ id: d.id, ...d.data() }))
      const existingOT = allOT.find(o => o.status === 'approved') || allOT[0] || null
      setOtRequest(existingOT)

      const finalOT = existingOT?.status === 'approved' ? Number(existingOT.finalOTHours) : autoOTHours
      const otPay = finalOT * otRate

      // Advances & Expenses
      const advQ = query(collection(db, 'organisations', user.orgId, 'advances'), where('employeeId', '==', selectedEmp))
      const advSnap = await getDocs(advQ)
      const allAdv = advSnap.docs.map(d => ({ id: d.id, ...d.data() }))
      setAdvances(allAdv)
      
      // Deduction: All pending advances (legacy logic) + maybe filter by month if needed
      // For now keeping legacy logic but adding expense reimbursement
      const pendingAdvances = allAdv.filter(a => a.status !== 'Recovered').reduce((acc, curr) => acc + Number(curr.amount), 0)

      // Expense Reimbursement: Fetch paid expenses for this month
      const advExpQ = query(
        collection(db, 'organisations', user.orgId, 'advances_expenses'),
        where('employeeId', '==', selectedEmp),
        where('paymentStatus', '==', 'Paid'),
        where('type', '==', 'Expense')
      )
      const advExpSnap = await getDocs(advExpQ)
      const [selYear, selMonthNum] = selectedMonth.split('-').map(Number)
      const expenseReimbursement = advExpSnap.docs
        .map(d => d.data())
        .filter(item => {
          const paidDate = item.paidAt?.toDate ? item.paidAt.toDate() : null
          return paidDate && paidDate.getFullYear() === selYear && (paidDate.getMonth() + 1) === selMonthNum
        })
        .reduce((acc, curr) => acc + Number(curr.partialAmount || curr.amount), 0)

      const basic = totalSalary * (activeSlab.basicPercent / 100) * (paidDays / endDay)
      const hra = totalSalary * (activeSlab.hraPercent / 100) * (paidDays / endDay)
      const grossEarnings = basic + hra + otPay + expenseReimbursement

      const pf = totalSalary * (activeSlab.pfPercent / 100)
      const it = totalSalary * (activeSlab.incomeTaxPercent / 100)
      const totalDeductions = pf + it + pendingAdvances

      const netPay = Math.max(0, grossEarnings - totalDeductions)

      setSlipData({
        employee: emp, month: selectedMonth, slab: activeSlab, grid, paidDays, lopDays, autoOTHours, finalOT, otPay, basic, hra, expenseReimbursement, grossEarnings, pf, it, advanceDeduction: pendingAdvances, totalDeductions, netPay, sundayCount, sundayWorkedCount, holidayWorkedCount
      })
    } catch (err) {
      console.error('SalarySlip generate error:', err)
      setGenerateError(err.message || 'Unknown error during generation.')
    } finally {
      setLoading(false)
    }
  }

  const handleSaveAdvance = async () => {
    if (!newAdvance.amount || !newAdvance.date) {
      alert('Please enter amount and date')
      return
    }
    setLoading(true)
    try {
      await addDoc(collection(db, 'organisations', user.orgId, 'advances'), {
        ...newAdvance, employeeId: selectedEmp, status: 'Pending', createdAt: serverTimestamp()
      })
      alert('Deduction added successfully')
      setNewAdvance({ type: 'Advance', amount: 0, date: '', reason: '' })
      handleGenerate()
    } catch (err) {
      console.error('Error adding advance:', err)
      alert('Failed to add deduction: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleSubmitOT = async () => {
    const final = slipData.autoOTHours + Number(revisedOT)
    setLoading(true)
    try {
      await addDoc(collection(db, 'organisations', user.orgId, 'otApprovals'), {
        employeeId: selectedEmp, month: selectedMonth, autoOTHours: slipData.autoOTHours, revisedOTHours: Number(revisedOT), finalOTHours: final, note: otNote, status: 'pending', createdAt: serverTimestamp()
      })
      alert('OT request submitted for review. It will appear in Approvals tab for manager approval.')
      setRevisedOT(0)
      setOtNote('')
      handleGenerate()
    } catch (err) {
      console.error('Error submitting OT:', err)
      alert('Failed to submit OT request: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="h-full flex flex-col font-inter space-y-6">
      <div className="bg-white p-6 rounded-[12px] shadow-sm flex flex-wrap gap-6 items-end no-print border border-gray-100">
        <div className="flex-1 min-w-[240px]">
          <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-2 px-1">Select Employee</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
            <select value={selectedEmp} onChange={e => setSelectedEmp(e.target.value)} className="w-full h-[42px] border border-gray-200 rounded-lg pl-10 pr-4 text-sm font-semibold bg-gray-50/50 focus:ring-2 focus:ring-indigo-500 outline-none">
              <option value="">Choose Employee...</option>
              {employees.map(e => <option key={e.id} value={e.id}>{e.name} ({e.empCode})</option>)}
            </select>
          </div>
        </div>
        <div className="w-[180px]">
          <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-2 px-1">Pay Period</label>
          <input type="month" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} className="w-full h-[42px] border border-gray-200 rounded-lg px-4 text-sm font-bold bg-gray-50/50 focus:ring-2 focus:ring-indigo-500 outline-none" />
        </div>
        <div className="flex items-center gap-3 h-[42px]">
          <input type="checkbox" id="cont-rule" checked={continuousLeaveRule} onChange={e => setContinuousLeaveRule(e.target.checked)} className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500" />
          <label htmlFor="cont-rule" className="text-[11px] font-black text-gray-500 uppercase tracking-tighter cursor-pointer">Deduct Sandwich Sundays</label>
        </div>
        <button onClick={handleGenerate} disabled={loading || empLoading || !selectedEmp || !selectedMonth} className="h-[40px] px-8 bg-indigo-600 text-white font-bold rounded-lg uppercase tracking-widest text-[11px] shadow-lg hover:bg-indigo-700 disabled:opacity-50 transition-all">
          {loading ? 'Crunching...' : 'Generate Slip'}
        </button>
      </div>

      {generateError && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2.5 rounded-xl text-[12px] font-semibold flex items-center gap-2">
          ⚠️ {generateError}
        </div>
      )}

      {slipData && (
        <div className="flex-1 overflow-auto flex gap-8 pb-10">
          <div className="flex-1 max-w-4xl bg-white border border-gray-100 shadow-2xl rounded-2xl overflow-hidden relative mx-auto" style={{ minWidth: '850px' }}>
            <div className="flex justify-end gap-3 p-4 bg-gray-50/50 border-b border-gray-100 no-print">
              <PDFDownloadLink
                document={<SalarySlipPDF data={slipData} orgName={user?.orgName} orgLogo={orgLogo} />}
                fileName={`SalarySlip_${slipData.employee.name.replace(/\s+/g, '_')}_${slipData.month}.pdf`}
                className="h-[36px] bg-indigo-50 text-indigo-600 px-4 rounded-lg text-[11px] font-bold uppercase tracking-widest hover:bg-indigo-100 flex items-center gap-2"
              >
                {({ loading }) => (
                  <>
                    <Download size={14} />
                    {loading ? 'Preparing PDF...' : 'Download PDF'}
                  </>
                )}
              </PDFDownloadLink>
              <button onClick={() => window.print()} className="h-[36px] bg-purple-50 text-purple-600 px-4 rounded-lg text-[11px] font-bold uppercase tracking-widest hover:bg-purple-100 flex items-center gap-2"><Printer size={14} /> Print</button>
            </div>

            <div ref={slipRef} className="p-12 bg-white" style={{ fontFamily: 'Roboto, sans-serif' }}>
              <div className="border-b-4 border-gray-900 pb-6 mb-8 flex justify-between items-start">
                <div className="flex items-center gap-4">
                  {orgLogo && <img src={orgLogo} alt="Logo" className="w-16 h-16 object-contain" />}
                  <div>
                    <h1 className="text-3xl font-black text-gray-900 uppercase tracking-tighter leading-none">{user?.orgName || 'ORGANISATION'}</h1>
                    <p className="text-[11px] text-gray-400 font-bold uppercase tracking-[0.2em] mt-3">Personnel Remuneration Advice</p>
                  </div>
                </div>
                <div className="text-right">
                  <h2 className="text-xl font-black text-gray-800 tracking-tight uppercase">Monthly Payslip</h2>
                  <p className="text-sm font-black text-indigo-600 uppercase mt-1 px-3 py-1 bg-indigo-50 rounded-full inline-block">{formatMonthYear(slipData.month)}</p>
                </div>
              </div>

              <div className="flex justify-between items-start mb-10">
                <div className="space-y-2 text-[13px]">
                  <p className="font-black text-gray-900 uppercase tracking-widest text-[10px] mb-4 border-b-2 border-indigo-100 pb-1 inline-block">STAFF IDENTIFICATION</p>
                  <div className="flex gap-6"><span className="w-36 text-gray-400 font-bold uppercase text-[10px]">Staff Name</span><span className="font-bold text-gray-800 uppercase">: {slipData.employee.name}</span></div>
                  <div className="flex gap-6"><span className="w-36 text-gray-400 font-bold uppercase text-[10px]">Employee ID</span><span className="font-bold text-gray-800 uppercase">: {slipData.employee.empCode}</span></div>
                  <div className="flex gap-6"><span className="w-36 text-gray-400 font-bold uppercase text-[10px]">Department</span><span className="font-bold text-gray-800 uppercase">: {slipData.employee.department}</span></div>
                  <div className="flex gap-6"><span className="w-36 text-gray-400 font-bold uppercase text-[10px]">Pay Period</span><span className="font-bold text-gray-800 uppercase">: {slipData.month}</span></div>
                </div>

                <div className="border-2 border-green-600 rounded-xl p-4 text-center min-w-[180px] bg-green-50/20 shadow-lg">
                  <p className="text-[9px] font-black text-green-700 uppercase tracking-widest mb-1">FINAL NET PAYABLE</p>
                  <p className="text-2xl font-black text-green-800">{formatINR(slipData.netPay)}</p>
                  <div className="mt-3 pt-2 border-t border-green-200/50 flex justify-between text-[9px] font-black text-green-700 uppercase">
                    <span>Paid: {slipData.paidDays}d</span>
                    <span>LOP: {slipData.lopDays}d</span>
                  </div>
                </div>
              </div>

              <div className="mb-8">
                <div className="grid grid-cols-7 gap-3">
                  <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-center">
                    <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-1">Total Worked Days</p>
                    <p className="text-2xl font-black text-blue-600">{slipData.paidDays}</p>
                  </div>
                  <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 text-center">
                    <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-1">Sunday</p>
                    <p className="text-2xl font-black text-indigo-600">{slipData.sundayCount || 0}</p>
                  </div>
                  <div className="bg-green-50 border border-green-100 rounded-xl p-4 text-center">
                    <p className="text-[10px] font-black text-green-400 uppercase tracking-widest mb-1">Sunday Worked</p>
                    <p className="text-2xl font-black text-green-600">{slipData.sundayWorkedCount || 0}</p>
                  </div>
                  <div className="bg-purple-50 border border-purple-100 rounded-xl p-4 text-center">
                    <p className="text-[10px] font-black text-purple-400 uppercase tracking-widest mb-1">Holiday Worked</p>
                    <p className="text-2xl font-black text-purple-600">{slipData.holidayWorkedCount || 0}</p>
                  </div>
                  <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 text-center">
                    <p className="text-[10px] font-black text-amber-400 uppercase tracking-widest mb-1">OT</p>
                    <p className="text-2xl font-black text-amber-600">{slipData.autoOTHours.toFixed(1)}h</p>
                  </div>
                  <div className="bg-red-50 border border-red-100 rounded-xl p-4 text-center overflow-hidden">
                    <p className="text-[10px] font-black text-red-400 uppercase tracking-widest mb-1">Advance</p>
                    <p className="text-xl font-black text-red-600 truncate" title={formatINR(slipData.advanceDeduction || 0)}>{formatINR(slipData.advanceDeduction || 0)}</p>
                  </div>
                  <div className="bg-gray-50 border border-gray-100 rounded-xl p-4 text-center overflow-hidden">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Leave</p>
                    <p className="text-xl font-black text-gray-600 truncate">{slipData.lopDays}</p>
                  </div>
                </div>
              </div>

              <div className="mb-10 bg-gray-50/50 p-4 rounded-xl border border-gray-100">
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">Attendance Visual Summary</p>
                <div className="flex flex-wrap gap-1.5">
                  {slipData.grid.map(day => (
                    <div key={day.date} className={`w-7 h-7 flex items-center justify-center text-[10px] font-black rounded-lg shadow-sm border ${day.type === 'Working' ? 'bg-green-500 text-white border-green-600' : day.type === 'Absent' ? 'bg-red-500 text-white border-red-600' : day.type.includes('Sunday') ? (day.isUnpaidSunday ? 'bg-gray-200 text-gray-400 border-gray-300' : 'bg-indigo-500 text-white border-indigo-600') : 'bg-white text-gray-400 border-gray-100'}`} title={day.type}>
                      {day.date}
                    </div>
                  ))}
                </div>
              </div>

              <div className="border-2 border-gray-900 rounded-2xl overflow-hidden mb-10">
                <div className="grid grid-cols-2 bg-gray-900 divide-x-2 divide-gray-800">
                  <div className="flex justify-between p-4 font-black text-[11px] uppercase tracking-[0.2em] text-white"><span>EARNINGS</span><span>INR (₹)</span></div>
                  <div className="flex justify-between p-4 font-black text-[11px] uppercase tracking-[0.2em] text-white"><span>DEDUCTIONS</span><span>INR (₹)</span></div>
                </div>
                <div className="grid grid-cols-2 divide-x-2 divide-gray-900">
                  <div className="p-0">
                    <div className="flex justify-between p-4 border-b border-gray-50 text-[13px] font-medium text-gray-600 italic"><span>Basic Component</span><span className="font-bold text-gray-900 not-italic">{formatINR(slipData.basic)}</span></div>
                    <div className="flex justify-between p-4 border-b border-gray-50 text-[13px] font-medium text-gray-600 italic"><span>H.R.A (Allowances)</span><span className="font-bold text-gray-900 not-italic">{formatINR(slipData.hra)}</span></div>
                    {slipData.expenseReimbursement > 0 && <div className="flex justify-between p-4 border-b border-gray-50 text-[13px] font-bold text-emerald-600 bg-emerald-50/30"><span>Expense Reimbursement</span><span>{formatINR(slipData.expenseReimbursement)}</span></div>}
                    {slipData.otPay > 0 && <div className="flex justify-between p-4 border-b border-gray-50 text-[13px] font-bold text-indigo-600 bg-indigo-50/30"><span>Overtime ({slipData.finalOT}h)</span><span>{formatINR(slipData.otPay)}</span></div>}
                  </div>
                  <div className="p-0">
                    <div className="flex justify-between p-4 border-b border-gray-50 text-[13px] font-medium text-gray-600 italic"><span>Statutory Tax (IT)</span><span className="font-bold text-gray-900 not-italic">{formatINR(slipData.it)}</span></div>
                    <div className="flex justify-between p-4 border-b border-gray-50 text-[13px] font-medium text-gray-600 italic"><span>Provident Fund (PF)</span><span className="font-bold text-gray-900 not-italic">{formatINR(slipData.pf)}</span></div>
                    {slipData.advanceDeduction > 0 && <div className="flex justify-between p-4 border-b border-gray-50 text-[13px] font-bold text-red-600 bg-red-50/30"><span>Advance Recovery</span><span>{formatINR(slipData.advanceDeduction)}</span></div>}
                  </div>
                </div>
                <div className="grid grid-cols-2 divide-x-2 divide-gray-900 bg-gray-50 border-t-2 border-gray-900 font-black">
                  <div className="flex justify-between p-4 text-[13px] uppercase text-gray-900"><span>Gross Earnings</span><span>{formatINR(slipData.grossEarnings)}</span></div>
                  <div className="flex justify-between p-4 text-[13px] uppercase text-gray-900"><span>Total Deductions</span><span>{formatINR(slipData.totalDeductions)}</span></div>
                </div>
              </div>

              <div className="bg-gray-900 text-white rounded-2xl p-6 flex justify-between items-center mb-10 shadow-2xl">
                <div>
                  <h3 className="text-xl font-black uppercase tracking-[0.25em]">TOTAL NET DISBURSEMENT</h3>
                  <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1">Calculated as: Gross - Deductions</p>
                </div>
                <div className="text-4xl font-black tracking-tighter text-white">{formatINR(slipData.netPay)}</div>
              </div>

              <div className="text-center text-[12px] font-bold text-gray-700 italic border-t-2 border-dashed border-gray-100 pt-10">
                Amount In Words: <span className="uppercase text-gray-900 not-italic">Indian Rupee {numberToWords(slipData.netPay)} Only</span>
                <p className="text-[9px] text-gray-400 mt-6 not-italic font-black uppercase tracking-[0.3em] opacity-50">-- System Authenticated Document --</p>
              </div>
            </div>
          </div>

          <div className="w-[320px] flex flex-col gap-6 no-print">
            <div className="bg-gray-100 p-1 rounded-xl flex shadow-sm border border-gray-200">
              <button onClick={() => setActiveBottomTab('ot')} className={`flex-1 py-2.5 rounded-lg text-[11px] font-black uppercase tracking-widest transition-all ${activeBottomTab === 'ot' ? 'bg-white text-indigo-600 shadow-md' : 'text-gray-400 hover:text-gray-600'}`}>OT Review</button>
              <button onClick={() => setActiveBottomTab('advances')} className={`flex-1 py-2.5 rounded-lg text-[11px] font-black uppercase tracking-widest transition-all ${activeBottomTab === 'advances' ? 'bg-white text-indigo-600 shadow-md' : 'text-gray-400 hover:text-gray-600'}`}>Recovery</button>
            </div>

            {activeBottomTab === 'ot' && (
              <div className="bg-white rounded-[12px] p-6 border border-gray-100 shadow-sm flex flex-col gap-6">
                <div className="flex items-center gap-2 text-indigo-600"><Clock size={18} /><h4 className="text-sm font-black uppercase">OT Escalation</h4></div>
                <div className="space-y-4">
                  <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">System Calculated</p>
                    <p className="text-2xl font-black text-gray-800">{slipData.autoOTHours.toFixed(2)}h</p>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 px-1">Manual Adjustment</label>
                    <input type="number" value={revisedOT} onChange={e => setRevisedOT(e.target.value)} className="w-full h-[42px] border border-gray-200 rounded-lg px-4 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500 bg-gray-50/50" placeholder="+ / - hours" />
                  </div>
                  <div className="bg-indigo-600 p-4 rounded-xl shadow-lg shadow-indigo-200">
                    <p className="text-[10px] font-bold text-indigo-200 uppercase tracking-widest mb-1">Requested Total</p>
                    <p className="text-2xl font-black text-white">{(slipData.autoOTHours + Number(revisedOT)).toFixed(2)}h</p>
                  </div>
                  <textarea value={otNote} onChange={e => setOtNote(e.target.value)} placeholder="Revision justification..." className="w-full h-[100px] border border-gray-200 rounded-lg p-4 text-[13px] font-medium outline-none focus:ring-2 focus:ring-indigo-500 bg-gray-50/50" />
                  <button onClick={handleSubmitOT} disabled={loading} className="w-full h-[40px] bg-indigo-600 text-white font-black rounded-lg uppercase tracking-widest text-[11px] shadow-lg hover:bg-indigo-700 transition-all disabled:opacity-50">Submit for Review</button>
                </div>
              </div>
            )}

            {activeBottomTab === 'advances' && (
              <div className="bg-white rounded-[12px] p-6 border border-gray-100 shadow-sm flex flex-col gap-6">
                <div className="flex items-center gap-2 text-red-600"><Banknote size={18} /><h4 className="text-sm font-black uppercase">Debit Adjustments</h4></div>
                <div className="space-y-3">
                  <select value={newAdvance.type} onChange={e => setNewAdvance(s => ({ ...s, type: e.target.value }))} className="w-full h-[42px] border border-gray-200 rounded-lg px-4 text-sm font-bold bg-gray-50/50">
                    <option>Advance</option>
                    <option>Loan</option>
                  </select>
                  <input type="number" placeholder="Value (₹)" value={newAdvance.amount || ''} onChange={e => setNewAdvance(s => ({ ...s, amount: e.target.value }))} className="w-full h-[42px] border border-gray-200 rounded-lg px-4 text-sm font-black bg-gray-50/50" />
                  <input type="date" value={newAdvance.date} onChange={e => setNewAdvance(s => ({ ...s, date: e.target.value }))} className="w-full h-[42px] border border-gray-200 rounded-lg px-4 text-sm font-bold bg-gray-50/50" />
                  <button onClick={handleSaveAdvance} disabled={loading} className="w-full h-[40px] bg-red-600 text-white font-black rounded-lg uppercase tracking-widest text-[11px] shadow-lg hover:bg-red-700 disabled:opacity-50">Add Deduction</button>
                </div>

                <div className="flex-1 overflow-auto border border-gray-100 rounded-xl bg-gray-50/30">
                  <div className="p-3 border-b border-gray-100 bg-white/50 sticky top-0 font-bold text-[9px] text-gray-400 uppercase tracking-widest">Employee Ledger</div>
                  {advances.map(a => (
                    <div key={a.id} className="p-4 border-b border-gray-100 last:border-0 hover:bg-white transition-colors">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-[10px] font-black uppercase text-gray-500">{a.type}</span>
                        <span className={`text-[9px] font-black px-2 py-0.5 rounded-full ${a.status === 'Recovered' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>{a.status}</span>
                      </div>
                      <p className="text-lg font-black text-gray-800 truncate" title={formatINR(a.amount)}>{formatINR(a.amount)}</p>
                      <p className="text-[10px] text-gray-400 font-bold uppercase mt-1">{a.date}</p>
                    </div>
                  ))}
                  {advances.length === 0 && <p className="text-[11px] text-center text-gray-300 font-bold uppercase py-10 opacity-50 italic">No entries</p>}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
