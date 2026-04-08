import React, { useState, useEffect, useRef, useMemo } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { useEmployees } from '../../hooks/useEmployees'
import { useSalarySlab } from '../../hooks/useSalarySlab'
import { useAttendance } from '../../hooks/useAttendance'
import { db } from '../../lib/firebase'
import { collection, query, where, getDocs, orderBy, limit, addDoc, serverTimestamp, setDoc, doc, getDoc, updateDoc, deleteDoc } from 'firebase/firestore'
import { formatINR, numberToWords } from '../../lib/salaryUtils'
import Spinner from '../ui/Spinner'
import { Wallet, Search, Download, Plus, History, Settings, AlertCircle, Info, X, CheckCircle2, Edit2, Trash2, Banknote, Clock, ChevronLeft, ChevronRight, FileText, Calendar as CalendarIcon, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react'
import { Document, Page, Text, View, StyleSheet, PDFDownloadLink, Image, Font, pdf } from '@react-pdf/renderer'
import { logActivity } from '../../hooks/useActivityLog'
import { useQuery } from '@tanstack/react-query'
import { useReactTable, getCoreRowModel, flexRender } from '@tanstack/react-table'

// Use standard fonts for maximum compatibility
const dashIfZero = (val) => (!val || val === 0 || val === '0') ? '-' : formatINR(val);

// Helper function to format date as DD/MM/YYYY
const formatDateDDMMYYYY = (dateStr) => {
  if (!dateStr || dateStr === '-') return '-';
  // Handle YYYY-MM-DD format
  if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
    const [year, month, day] = dateStr.split('-');
    return `${day}/${month}/${year}`;
  }
  // Handle Date object or other formats
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  } catch {
    return dateStr;
  }
};

// Helper function to format month as MM/YYYY
const formatMonthDisplay = (monthStr) => {
  if (!monthStr) return '-';
  // Handle YYYY-MM format
  if (monthStr.match(/^\d{4}-\d{2}$/)) {
    const [year, month] = monthStr.split('-');
    return `${month}/${year}`;
  }
  return monthStr;
};

const s = StyleSheet.create({
  p: { padding: 30, fontSize: 9, fontFamily: 'Helvetica', color: '#0f172a' },
  h: { borderBottomWidth: 2, borderBottomColor: '#4f46e5', paddingBottom: 15, marginBottom: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  t: { fontSize: 20, fontWeight: 'bold', textTransform: 'uppercase', color: '#0f172a' },
  row: { flexDirection: 'row', marginBottom: 2 },
  label: { width: 120, color: '#64748b', fontWeight: 'bold', fontSize: 10 },
  value: { flex: 1, fontWeight: 'bold', color: '#1e293b', fontSize: 10 }
})

const SalarySlipPDF = ({ data, orgName, orgLogo }) => (
  <Document><Page size="A4" style={s.p}>
    <View style={s.h}>
      <View style={{flexDirection:'row', alignItems:'center'}}>
        {orgLogo && <Image src={orgLogo} style={{width:40,height:40,marginRight:10}}/>}
        <View>
          <Text style={s.t}>{orgName}</Text>
          <Text style={{fontSize:7, color:'#3b82f6', fontWeight: 'bold', marginTop:2, letterSpacing:1}}>PAYROLL STATEMENT</Text>
        </View>
      </View>
      <View style={{textAlign:'right'}}>
        <Text style={{fontSize:12, fontWeight: 'bold', color:'#0f172a'}}>PAYSLIP</Text>
        <Text style={{fontSize:8, color:'#64748b', marginTop:2}}>{data?.month ? formatMonthDisplay(data.month) : '-'}</Text>
      </View>
    </View>
    
    <View style={{flexDirection:'row', justifyContent:'space-between', marginBottom:20}}>
      <View style={{flex: 1}}>
        <View style={s.row}><Text style={s.label}>Name of the Employee</Text><Text style={s.value}>: {data.employee?.name}</Text></View>
        <View style={s.row}><Text style={s.label}>Employee N0</Text><Text style={s.value}>: {data.employee?.empCode}</Text></View>
        <View style={s.row}><Text style={s.label}>Designation</Text><Text style={s.value}>: {data.employee?.designation || '-'}</Text></View>
        <View style={s.row}><Text style={s.label}>DOB</Text><Text style={s.value}>: {formatDateDDMMYYYY(data.employee?.dob) || '-'}</Text></View>
        <View style={s.row}><Text style={s.label}>DOJ</Text><Text style={s.value}>: {formatDateDDMMYYYY(data.employee?.doj) || '-'}</Text></View>
        <View style={s.row}><Text style={s.label}>Total No. of Days</Text><Text style={s.value}>: {data.totalMonthDays}</Text></View>
      </View>
      <View style={{flex: 1, paddingLeft: 20}}>
        <View style={s.row}><Text style={s.label}>No.of Working Days</Text><Text style={s.value}>: {data.workedDaysCount}</Text></View>
        <View style={s.row}><Text style={s.label}>Worked Holidays</Text><Text style={s.value}>: {data.holidayWorkedCount || 0}</Text></View>
        <View style={s.row}><Text style={s.label}>No.of Holidays</Text><Text style={s.value}>: {data.sundayCount || 0}</Text></View>
        <View style={s.row}><Text style={s.label}>No. of Leave Taken</Text><Text style={s.value}>: {data.lopDays || 0}</Text></View>
        <View style={s.row}><Text style={s.label}>No. of days Paid</Text><Text style={s.value}>: {data.paidDays}</Text></View>
      </View>
    </View>

    <View style={{flexDirection:'row', justifyContent:'center', marginBottom:16, paddingVertical:12, backgroundColor:'#f8fafc', borderRadius:8}}>
      <View style={{alignItems:'center', marginHorizontal:20}}>
        <Text style={{fontSize:8, fontFamily:'Helvetica', color:'#64748b', fontWeight:'bold', marginBottom:2}}>BASIC</Text>
        <Text style={{fontSize:11, fontFamily:'Helvetica', color:'#0f172a', fontWeight:'bold'}}>{formatINR(data.basic || 0)}</Text>
      </View>
      <View style={{alignItems:'center', marginHorizontal:20}}>
        <Text style={{fontSize:8, fontFamily:'Helvetica', color:'#64748b', fontWeight:'bold', marginBottom:2}}>HRA</Text>
        <Text style={{fontSize:11, fontFamily:'Helvetica', color:'#0f172a', fontWeight:'bold'}}>{formatINR(data.hra || 0)}</Text>
      </View>
      <View style={{alignItems:'center', marginHorizontal:20}}>
        <Text style={{fontSize:8, fontFamily:'Helvetica', color:'#64748b', fontWeight:'bold', marginBottom:2}}>SALARY</Text>
        <Text style={{fontSize:11, fontFamily:'Helvetica', color:'#0f172a', fontWeight:'bold'}}>{formatINR((data.basic || 0) + (data.hra || 0))}</Text>
      </View>
    </View>

    <View style={{borderWidth:1, borderColor:'#0f172a', borderRadius:8, overflow:'hidden', marginBottom:20}}>
      <View style={{flexDirection:'row', backgroundColor:'#0f172a', color:'white', padding:8}}>
        <Text style={{flex:1, fontSize:8, fontWeight:'bold', letterSpacing:1}}>EARNINGS</Text>
        <Text style={{flex:1, textAlign:'right', fontSize:8, fontWeight:'bold', letterSpacing:1}}>DEDUCTIONS</Text>
      </View>
      <View style={{flexDirection:'row'}}>
        <View style={{flex:1, borderRightWidth:1, borderColor:'#e2e8f0'}}>
          <View style={{flexDirection:'row', justifyContent:'space-between', padding:8, borderBottomWidth:1, borderColor:'#f1f5f9'}}><Text style={{color:'#64748b'}}>Basic Salary</Text><Text style={{fontWeight:'bold'}}>{formatINR(data.basic)}</Text></View>
          <View style={{flexDirection:'row', justifyContent:'space-between', padding:8, borderBottomWidth:1, borderColor:'#f1f5f9'}}><Text style={{color:'#64748b'}}>HRA</Text><Text style={{fontWeight:'bold'}}>{formatINR(data.hra)}</Text></View>
          <View style={{flexDirection:'row', justifyContent:'space-between', padding:8, borderBottomWidth:1, borderColor:'#f1f5f9'}}><Text style={{color:'#64748b'}}>Expense</Text><Text style={{fontWeight:'bold'}}>{dashIfZero(data.expenseReimbursement)}</Text></View>
          <View style={{flexDirection:'row', justifyContent:'space-between', padding:8, borderBottomWidth:1, borderColor:'#f1f5f9'}}><Text style={{color:'#64748b'}}>Sunday Worked</Text><Text style={{fontWeight:'bold'}}>{dashIfZero(data.sundayPay)}</Text></View>
          <View style={{flexDirection:'row', justifyContent:'space-between', padding:8}}><Text style={{color:'#64748b'}}>OT</Text><Text style={{fontWeight:'bold'}}>{dashIfZero(data.otPay)}</Text></View>
        </View>
        <View style={{flex:1}}>
          <View style={{flexDirection:'row', justifyContent:'space-between', padding:8, borderBottomWidth:1, borderColor:'#f1f5f9'}}><Text style={{color:'#64748b'}}>PF</Text><Text style={{fontWeight:'bold'}}>{dashIfZero(data.pf)}</Text></View>
          <View style={{flexDirection:'row', justifyContent:'space-between', padding:8, borderBottomWidth:1, borderColor:'#f1f5f9'}}><Text style={{color:'#64748b'}}>ESI</Text><Text style={{fontWeight:'bold'}}>{dashIfZero(data.esi || 0)}</Text></View>
          <View style={{flexDirection:'row', justifyContent:'space-between', padding:8, borderBottomWidth:1, borderColor:'#f1f5f9'}}><Text style={{color:'#64748b'}}>Advance</Text><Text style={{fontWeight:'bold'}}>{dashIfZero(data.advanceDeduction)}</Text></View>
          <View style={{flexDirection:'row', justifyContent:'space-between', padding:8, borderBottomWidth:1, borderColor:'#f1f5f9'}}><Text style={{color:'#64748b'}}>Loan</Text><Text style={{fontWeight:'bold'}}>{dashIfZero(data.loanEMI)}</Text></View>
          <View style={{flexDirection:'row', justifyContent:'space-between', padding:8}}><Text style={{color:'#64748b'}}>Fine</Text><Text style={{fontWeight:'bold'}}>{dashIfZero(data.fineAmount)}</Text></View>
        </View>
      </View>
      <View style={{flexDirection:'row', backgroundColor:'#f8fafc', borderTopWidth:1, borderColor:'#0f172a'}}>
        <View style={{flex:1, flexDirection:'row', justifyContent:'space-between', padding:8, borderRightWidth:1, borderColor:'#0f172a'}}><Text style={{fontWeight:'bold', fontSize:8}}>GROSS PAY</Text><Text style={{fontWeight:'bold', fontSize:8}}>{formatINR(data.grossEarnings)}</Text></View>
        <View style={{flex:1, flexDirection:'row', justifyContent:'space-between', padding:8}}><Text style={{fontWeight:'bold', fontSize:8}}>TOTAL DED.</Text><Text style={{fontWeight:'bold', fontSize:8}}>{formatINR(data.totalDeductions)}</Text></View>
      </View>
    </View>

    <View style={{textAlign:'center', paddingTop:20, borderTopWidth:1, borderColor:'#e2e8f0', borderStyle:'dashed'}}>
      <Text style={{fontSize:7, color:'#94a3b8', marginBottom:3, fontWeight:'bold'}}>NET DISBURSEMENT</Text>
      <Text style={{fontSize:16, fontWeight:'bold', color:'#0f172a', marginBottom:5}}>{formatINR(data.netPay)}</Text>
      <Text style={{fontSize:7, color:'#94a3b8', marginBottom:3, fontWeight:'bold'}}>AMOUNT IN WORDS</Text>
      <Text style={{fontSize:9, fontWeight:'bold', color:'#0f172a', textTransform:'uppercase'}}>Indian Rupee {numberToWords(data.netPay)} Only</Text>
      <Text style={{fontSize:6, color:'#cbd5e1', marginTop:20, letterSpacing:2}}>-- SYSTEM GENERATED DIGITAL RECEIPT --</Text>
    </View>
  </Page></Document>
)

const AttendanceSummaryPDF = ({ data, month, orgName }) => (
  <Document>
    <Page size="A4" orientation="landscape" style={{ padding: 20, fontSize: 7, fontFamily: 'Helvetica' }}>
      <View style={{ marginBottom: 15, borderBottom: 2, borderColor: '#000', paddingBottom: 5, flexDirection: 'row', justifyContent: 'space-between' }}>
        <View>
          <Text style={{ fontSize: 14, fontWeight: 'bold' }}>{orgName}</Text>
          <Text style={{ fontSize: 8, marginTop: 2 }}>ATTENDANCE SUMMARY - {new Date(month + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</Text>
        </View>
      </View>
      <View style={{ borderWidth: 1, borderColor: '#000' }}>
        <View style={{ flexDirection: 'row', backgroundColor: '#f3f4f6', fontWeight: 'bold', borderBottomWidth: 1 }}>
          <Text style={{ width: 25, padding: 3, borderRightWidth: 1 }}>S.No</Text>
          <Text style={{ flex: 2, padding: 3, borderRightWidth: 1 }}>Employee Name</Text>
          <Text style={{ width: 45, padding: 3, borderRightWidth: 1 }}>Emp ID</Text>
          <Text style={{ width: 30, padding: 3, borderRightWidth: 1 }}>Days</Text>
          <Text style={{ width: 35, padding: 3, borderRightWidth: 1 }}>Worked</Text>
          <Text style={{ width: 90, padding: 3, borderRightWidth: 1, textAlign: 'center' }}>HOLIDAYS</Text>
          <Text style={{ width: 60, padding: 3, borderRightWidth: 1, textAlign: 'center' }}>LEAVE</Text>
          <Text style={{ width: 30, padding: 3, borderRightWidth: 1 }}>OT</Text>
          <Text style={{ width: 70, padding: 3, borderRightWidth: 1, textAlign: 'center' }}>HOL. WK</Text>
          <Text style={{ width: 45, padding: 3 }}>PAY DAYS</Text>
        </View>
        {data.map((row, i) => (
          <View key={i} style={{ flexDirection: 'row', borderBottomWidth: 1 }}>
            <Text style={{ width: 25, padding: 3, borderRightWidth: 1 }}>{row.sno}</Text>
            <Text style={{ flex: 2, padding: 3, borderRightWidth: 1 }}>{row.name}</Text>
            <Text style={{ width: 45, padding: 3, borderRightWidth: 1 }}>{row.empId}</Text>
            <Text style={{ width: 30, padding: 3, borderRightWidth: 1 }}>{row.totalDays}</Text>
            <Text style={{ width: 35, padding: 3, borderRightWidth: 1 }}>{row.worked}</Text>
            <Text style={{ width: 90, padding: 3, borderRightWidth: 1, textAlign: 'center' }}>{row.sunday} / {row.holidays} / {row.totalHolidays}</Text>
            <Text style={{ width: 60, padding: 3, borderRightWidth: 1, textAlign: 'center' }}>{row.leave} / {row.lop}</Text>
            <Text style={{ width: 30, padding: 3, borderRightWidth: 1 }}>{row.ot}</Text>
            <Text style={{ width: 70, padding: 3, borderRightWidth: 1, textAlign: 'center' }}>{row.sunW} / {row.holW}</Text>
            <Text style={{ width: 45, padding: 3 }}>{row.totalWorkingDays}</Text>
          </View>
        ))}
      </View>
    </Page>
  </Document>
)

const downloadPdfBlob = (blob, fileName) => {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export default function SalarySlipTab() {
  const { user } = useAuth(), { employees } = useEmployees(user?.orgId, true), { slabs, increments } = useSalarySlab(user?.orgId), { fetchByDate } = useAttendance(user?.orgId)
  const isAdmin = user?.role?.toLowerCase() === 'admin'
  const [activeTab, setActiveTab] = useState('salary-summary'), [selectedEmp, setSelectedEmp] = useState(''), [selectedMonth, setSelectedMonth] = useState(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` })
  const [summaryMonth, setSummaryMonth] = useState(selectedMonth)
  const [loading, setLoading] = useState(false), [slipData, setSlipData] = useState(null), [advExpRows, setAdvExpRows] = useState([]), [genErr, setGenErr] = useState(''), [orgLogo, setOrgLogo] = useState(''), [orgData, setOrgData] = useState(null)
  const [loans, setLoans] = useState([]), [loanForm, setEditLoanForm] = useState({ employeeId: '', totalAmount: '', emiAmount: '', startMonth: '', remarks: '' }), [editingLoanId, setEditingLoanId] = useState(null), [selectedLoan, setSelectedLoan] = useState(null), [overrideForm, setOverrideForm] = useState({ month: '', amount: 0, reason: '', skip: false }), [loanActivities, setLoanActivities] = useState([])
  const [isAttendanceSummaryOpen, setIsAttendanceSummaryOpen] = useState(true)
  const [summaryEmpDetail, setSummaryEmpDetail] = useState(null)
  const [isDetailPanelOpen, setIsDetailPanelOpen] = useState(false)
  const [exportingSlipPdf, setExportingSlipPdf] = useState(false)
  const monthInputRef = useRef(null)

  const sortedEmployees = useMemo(() => {
    if (!employees.length) return []
    const savedOrder = orgData?.employeeRowOrder || []
    if (!savedOrder.length) return employees

    return [...employees].sort((a, b) => {
      const idxA = savedOrder.indexOf(a.id)
      const idxB = savedOrder.indexOf(b.id)
      if (idxA === -1 && idxB === -1) return 0
      if (idxA === -1) return 1
      if (idxB === -1) return -1
      return idxA - idxB
    })
  }, [employees, orgData])
  
  // Loan UI State
  const [loanActiveModule, setLoanActiveModule] = useState('Active Schedules')

  const calcEMI = (l, m) => { if (l.status !== 'Active' || l.remainingAmount <= 0 || l.startMonth > m) return 0; const o = l.monthOverrides?.[m]; if (o) return o.skip ? 0 : Math.min(o.amount, l.remainingAmount); return Math.min(l.emiAmount, l.remainingAmount) }

  const computeAdvExpRows = ({ activeRequests, advDocs, selectedMonth, y, m }) => {
    const monthPrefix = selectedMonth
    const activeRequestIds = new Set(activeRequests.map((r) => r.id))

    // ADVANCES: show only linked Advance requests whose request date falls in `selectedMonth`
    const advancesByRequestId = new Map()
    for (const advDoc of advDocs) {
      if (advDoc?.status === 'Recovered') continue

      const linkedId = advDoc?.linkedRequestId
      if (linkedId && !activeRequestIds.has(linkedId)) continue

      const req = linkedId ? activeRequests.find((r) => r.id === linkedId) : null
      if (!req || req.type !== 'Advance') continue
      if (!req.date?.startsWith(monthPrefix)) continue

      const amount = Number(advDoc?.amount || 0)
      advancesByRequestId.set(linkedId, (advancesByRequestId.get(linkedId) || 0) + amount)
    }

    const advRows = Array.from(advancesByRequestId.entries()).map(([requestId, amount]) => {
      const req = activeRequests.find((r) => r.id === requestId)
      return {
        date: req?.date || selectedMonth,
        type: 'Advance',
        amount
      }
    })

    // EXPENSES: use the same inclusion logic as `reimb` calculation in `handleGenerate`
    const expRows = []
    for (const req of activeRequests) {
      if (req.type !== 'Expense') continue

      const isPaidThisMonth = req.paymentStatus === 'Paid' && req.paidAt?.toDate &&
        req.paidAt.toDate().getFullYear() === y &&
        (req.paidAt.toDate().getMonth() + 1) === m

      const isWithSalaryApproved = req.payoutMethod === 'With Salary' &&
        req.status === 'Approved' &&
        req.paymentStatus !== 'Paid' &&
        req.date?.startsWith(selectedMonth)

      if (!isPaidThisMonth && !isWithSalaryApproved) continue

      // Keep "Date" aligned to request date (like the rest of the slip UI uses `date`)
      const date = req.date || selectedMonth
      const amount = Number(req.partialAmount || req.amount || 0)

      expRows.push({
        date,
        type: 'Expense',
        amount
      })
    }

    return [...advRows, ...expRows].sort((a, b) => (a.date || '').localeCompare(b.date || ''))
  }

  const { data: attendanceSummaryData = [], isLoading: isAttendanceLoading, refetch: refetchSummary } = useQuery({
    queryKey: ['attendanceSummary', user?.orgId, summaryMonth, orgData?.employeeRowOrder],
    queryFn: async () => {
      if (!user?.orgId || !sortedEmployees.length) return []
      const [y, m] = summaryMonth.split('-').map(Number)
      const daysInMonth = new Date(y, m, 0).getDate()
      const sd = `${summaryMonth}-01`, ed = `${summaryMonth}-${daysInMonth}`
      
      // Use simpler queries to avoid index requirements
      const [aSnap, slabSnap, loanSnap, advSnap, fineSnap] = await Promise.all([
        getDocs(collection(db, 'organisations', user.orgId, 'attendance')),
        getDocs(collection(db, 'organisations', user.orgId, 'salaryIncrements')),
        getDocs(query(collection(db, 'organisations', user.orgId, 'loans'), where('status', '==', 'Active'))),
        getDocs(collection(db, 'organisations', user.orgId, 'advances_expenses')),
        getDocs(collection(db, 'organisations', user.orgId, 'fines'))
      ])
      
      const allAttendance = aSnap.docs.map(d => d.data()).filter(a => a.date >= sd && a.date <= ed)
      const allIncrements = slabSnap.docs.map(d => d.data())
      const allLoans = loanSnap.docs.map(d => ({ id: d.id, ...d.data() }))
      const allAdvExp = advSnap.docs.map(d => d.data()).filter(a => a.date >= sd && a.date <= ed)
      const allFines = fineSnap.docs.map(d => d.data()).filter(f => f.date >= sd && f.date <= ed)
      
      return sortedEmployees.filter(e => e.includeInSalary !== false).map((emp, idx) => {
        const empAtt = allAttendance.filter(a => a.employeeId === emp.id)
        let worked = 0, sun = 0, hol = 0, leave = 0, lop = 0, otH = 0, sunW = 0, holW = 0
        for (let i = 1; i <= daysInMonth; i++) {
          const dateStr = `${summaryMonth}-${String(i).padStart(2, '0')}`, d = new Date(y, m - 1, i), isSunday = d.getDay() === 0, r = empAtt.find(a => a.date === dateStr)
          if (isSunday) sun++
          if (r) { if (r.isAbsent) lop++; else if (r.sundayWorked) { sunW++; worked++ } else if (r.holidayWorked) { holW++; worked++ } else if (r.sundayHoliday) hol++; else worked++; if (r.otHours) { const [h, mi] = r.otHours.split(':').map(Number); otH += (h || 0) + (mi || 0) / 60 } }
          else if (!isSunday) lop++
        }
        const slab = allIncrements.filter(i => i.employeeId === emp.id && i.effectiveFrom <= summaryMonth).sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0] || slabs[emp.id] || { totalSalary: 0, basicPercent: 40, hraPercent: 20, incomeTaxPercent: 0, pfPercent: 0, esiPercent: 0 }
        const ts = Number(slab.totalSalary) || 0, minH = Number(emp.minDailyHours) || 8, paidDays = daysInMonth - lop
        const dailyRate = ts / daysInMonth
        const fullBasic = ts * (slab.basicPercent / 100), fullHra = ts * (slab.hraPercent / 100)
        const basic = fullBasic * (paidDays / daysInMonth), hra = fullHra * (paidDays / daysInMonth), pf = ts * (slab.pfPercent / 100), it = ts * (slab.incomeTaxPercent / 100), esi = 0, otPay = otH * (dailyRate / minH)
        const sunPay = sunW * dailyRate * 1, holPay = holW * dailyRate * 2
        const loanE = allLoans.filter(l => l.employeeId === emp.id).reduce((s, l) => s + calcEMI(l, summaryMonth), 0), adv = allAdvExp.filter(a => a.employeeId === emp.id && a.type === 'Advance').reduce((s, a) => s + Number(a.amount), 0), reimb = allAdvExp.filter(a => a.employeeId === emp.id && a.type === 'Expense' && a.hrApproval === 'Approved').reduce((s, a) => s + Number(a.amount), 0), fine = allFines.filter(f => f.employeeId === emp.id).reduce((s, f) => s + Number(f.amount), 0)
        const earnings = [{ label: 'Basic', value: basic }, { label: 'HRA', value: hra }, { label: 'Sun Pay', value: sunPay }, { label: 'Hol Pay', value: holPay }, { label: 'OT Est.', value: otPay }, { label: 'Reimb.', value: reimb }].filter(e => e.value > 0)
        const deductions = [{ label: 'PF', value: pf }, { label: 'IT', value: it }, { label: 'ESI', value: esi }, { label: 'Loan', value: loanE }, { label: 'Adv.', value: adv }, { label: 'Fine', value: fine }].filter(d => d.value > 0)
        const net = earnings.reduce((s, e) => s + e.value, 0) - deductions.reduce((s, d) => s + d.value, 0)
        const vrAdv = adv - reimb
        return { sno: idx + 1, id: emp.id, name: emp.name, empId: emp.empCode || emp.id.slice(0, 5), designation: emp.designation || '-', totalDays: daysInMonth, worked, sunday: sun, holidays: hol, totalHolidays: sun + hol, leave, lop, ot: otH.toFixed(2), sunW, holW, totalWorkingDays: Math.max(0, paidDays), salary: { earnings, deductions, net }, advanceAmount: adv, expenseAmount: reimb, vrAdvance: vrAdv, sunPay, holPay, dailyRate, basic, hra, pf, esi, it, loanE, fine, totalEarnings: earnings.reduce((s, e) => s + e.value, 0), totalDeductions: deductions.reduce((s, d) => s + d.value, 0), fullBasic, fullHra }
      })
    },
    enabled: !!user?.orgId && employees.length > 0 && activeTab === 'salary-summary'
  })

  const columns = useMemo(() => [
    { 
      header: 'Basic Info',
      columns: [
        { accessorKey: 'sno', header: 'S.No', size: 15, cell: info => <div className="text-center text-[10px] font-roboto">{info.getValue()}</div> },
        { accessorKey: 'name', header: 'Employee Name', size: 150, cell: info => <button onClick={() => { setSummaryEmpDetail(info.row.original); setIsDetailPanelOpen(true); }} className="text-left font-semibold text-indigo-600 hover:text-indigo-800 px-1 truncate w-full text-[11px] block font-roboto">{info.getValue()}</button> },
        { accessorKey: 'worked', header: 'Worked', size: 20, cell: info => <div className="text-center text-[10px] font-roboto">{info.getValue()}</div> },
      ]
    },
    { accessorKey: 'totalDays', header: 'Total\nDays', size: 18, cell: info => <div className="text-center text-[10px] font-roboto">{info.getValue()}</div> },
    { 
      header: 'Holiday',
      columns: [
        { accessorKey: 'sunday', header: 'Sunday', size: 30, cell: info => <div className="text-center text-[10px] font-roboto">{info.getValue()}</div> },
        { accessorKey: 'holidays', header: 'Holiday', size: 30, cell: info => <div className="text-center text-[10px] font-roboto">{info.getValue()}</div> },
        { accessorKey: 'totalHolidays', header: 'Tot', size: 22, cell: info => <div className="text-center text-[10px] font-roboto">{info.getValue()}</div> },
      ]
    },
    { 
      header: 'LEAVE',
      columns: [
        { accessorKey: 'leave', header: 'Approved', size: 30, cell: info => <div className="text-center text-[10px] font-roboto">{info.getValue()}</div> },
        { accessorKey: 'lop', header: 'LOP', size: 25, cell: info => <div className="text-center text-[10px] text-red-600 font-roboto">{info.getValue()}</div> },
      ]
    },
    { accessorKey: 'ot', header: 'OT', size: 25, cell: info => <div className="text-center text-[10px] font-roboto">{info.getValue()}</div> },
    { 
      header: 'Holiday worked',
      columns: [
        { accessorKey: 'sunW', header: 'SUN', size: 28, cell: info => <div className="text-center text-[10px] font-roboto">{info.getValue()}</div> },
        { accessorKey: 'holW', header: 'HOL', size: 28, cell: info => <div className="text-center text-[10px] font-roboto">{info.getValue()}</div> },
      ]
    },
    { accessorKey: 'totalWorkingDays', header: 'PAY DAYS', size: 30, cell: info => <div className="text-center font-bold text-[10px] text-emerald-600 font-roboto">{info.getValue()}</div> },
  ], [])

  const table = useReactTable({ 
    data: attendanceSummaryData, 
    columns, 
    getCoreRowModel: getCoreRowModel(),
    getHeaderGroups: () => table.getHeaderGroups()
  })

  useEffect(() => { 
    if (!user?.orgId) return; 
    getDoc(doc(db, 'organisations', user.orgId)).then(snap => { 
      if (snap.exists()) {
        const data = snap.data();
        setOrgData(data);
        setOrgLogo(data.logoURL || '');
      }
    }); 
    fetchLoans() 
  }, [user?.orgId])
  
  const fetchLoans = async () => { try { const q = query(collection(db, 'organisations', user.orgId, 'loans'), orderBy('createdAt', 'desc')); const snap = await getDocs(q); setLoans(snap.docs.map(d => ({ id: d.id, ...d.data() }))); const actSnap = await getDocs(query(collection(db, 'organisations', user.orgId, 'activityLogs'), where('module', '==', 'Loans'), orderBy('timestamp', 'desc'), limit(5))); setLoanActivities(actSnap.docs.map(d => ({ id: d.id, ...d.data() }))) } catch (e) { console.error(e) } }
  const handleCreateLoan = async () => { if (!loanForm.employeeId || !loanForm.totalAmount || !loanForm.emiAmount) return alert('Fill fields'); setLoading(true); try { const emp = employees.find(e => e.id === loanForm.employeeId); const docD = { ...loanForm, employeeName: emp?.name || 'Unknown', totalAmount: Number(loanForm.totalAmount), emiAmount: Number(loanForm.emiAmount), updatedAt: serverTimestamp() }; if (editingLoanId) { await updateDoc(doc(db, 'organisations', user.orgId, 'loans', editingLoanId), docD); await logActivity(user.orgId, user, { module: 'Loans', action: 'Updated', detail: `Updated for ${emp?.name}` }) } else { await addDoc(collection(db, 'organisations', user.orgId, 'loans'), { ...docD, remainingAmount: docD.totalAmount, status: 'Active', monthOverrides: {}, createdAt: serverTimestamp(), createdBy: user.uid }); await logActivity(user.orgId, user, { module: 'Loans', action: 'Created', detail: `Created ₹${docD.totalAmount} for ${emp?.name}` }) }; setEditLoanForm({ employeeId: '', totalAmount: '', emiAmount: '', startMonth: '', remarks: '' }); setEditingLoanId(null); setSlipData(null); fetchLoans(); alert('Success'); setLoanActiveModule('Active Schedules'); } catch (e) { alert(e.message) } finally { setLoading(false) } }
  const handleEditLoan = (l) => { setEditingLoanId(l.id); setEditLoanForm({ employeeId: l.employeeId, totalAmount: l.totalAmount, emiAmount: l.emiAmount, startMonth: l.startMonth, remarks: l.remarks || '' }); setLoanActiveModule('Configuration'); }
  const handleDeleteLoan = async (id, name) => { if (!isAdmin || !confirm(`Delete for ${name}?`)) return; try { await deleteDoc(doc(db, 'organisations', user.orgId, 'loans', id)); await logActivity(user.orgId, user, { module: 'Loans', action: 'Deleted', detail: `Deleted for ${name}` }); setSlipData(null); fetchLoans(); alert('Deleted') } catch (e) { alert(e.message) } }
  const handleUpdateOverride = async (id) => { if (!overrideForm.month) return alert('Select month'); try { const r = doc(db, 'organisations', user.orgId, 'loans', id), s = await getDoc(r); await updateDoc(r, { monthOverrides: { ...(s.data()?.monthOverrides || {}), [overrideForm.month]: { amount: overrideForm.skip ? 0 : Number(overrideForm.amount), skip: overrideForm.skip, reason: overrideForm.reason } } }); fetchLoans(); setOverrideForm({ month: '', amount: 0, reason: '', skip: false }); setSelectedLoan(null); } catch (e) { alert(e.message) } }

  const handleExportSalarySlipPdf = async () => {
    if (!slipData || exportingSlipPdf) return

    const fileName = `SalarySlip_${(slipData.employee?.name || 'Employee').replace(/\s+/g, '_')}.pdf`

    try {
      setExportingSlipPdf(true)
      let blob

      try {
        blob = await pdf(<SalarySlipPDF data={slipData} orgName={user?.orgName || 'Organization'} orgLogo={orgLogo} />).toBlob()
      } catch (logoError) {
        console.warn('Salary slip export with logo failed, retrying without logo', logoError)
        blob = await pdf(<SalarySlipPDF data={slipData} orgName={user?.orgName || 'Organization'} orgLogo="" />).toBlob()
      }

      downloadPdfBlob(blob, fileName)
    } catch (error) {
      console.error('Salary slip export failed:', error)
      alert('Failed to export PDF: ' + (error?.message || error?.toString() || 'Unknown error'))
    } finally {
      setExportingSlipPdf(false)
    }
  }

  const handleGenerate = async () => {
    if (!selectedEmp || !selectedMonth) {
      alert('Please select an employee and month');
      return;
    }
    setLoading(true); setGenErr(''); setAdvExpRows([])
    try {
      const emp = employees.find(e => e.id === selectedEmp); 
      if (!emp) {
        alert('Employee data not found');
        setLoading(false);
        return;
      }

      const [y, m] = selectedMonth.split('-').map(Number), end = new Date(y, m, 0).getDate(), sd = `${selectedMonth}-01`, ed = `${selectedMonth}-${end}`
      
      // Revert to simple query to avoid index requirements, filter in memory
      const aDataSnap = await getDocs(query(
        collection(db, 'organisations', user.orgId, 'attendance'), 
        where('employeeId', '==', selectedEmp)
      ));
      const aData = aDataSnap.docs.map(d => d.data()).filter(a => a.date >= sd && a.date <= ed);

      const slab = increments.filter(i => i.employeeId === selectedEmp && i.effectiveFrom <= selectedMonth).sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0] || slabs[selectedEmp] || { totalSalary: 0, basicPercent: 40, hraPercent: 20, incomeTaxPercent: 0, pfPercent: 0 }
      const ts = Number(slab.totalSalary) || 0, minH = Number(emp.minDailyHours) || 8
      let paid = 0, lop = 0, aOT = 0, sun = 0, sunW = 0, holW = 0, grid = []
      
      for (let i = 1; i <= end; i++) {
        const d = new Date(y, m - 1, i), ds = d.toISOString().split('T')[0], isS = d.getDay() === 0, r = aData.find(a => a.date === ds);
        let t = isS ? 'Sunday' : 'Absent'; if (isS) sun++
        if (r) { if (r.isAbsent) t = 'Absent'; else if (r.sundayWorked) { t = 'Sunday Working'; sunW++ } else if (r.sundayHoliday) { t = 'Sunday Holiday'; holW++ } else t = 'Working'; if (r.otHours) { const [h, mi] = r.otHours.split(':').map(Number); aOT += (h || 0) + (mi || 0) / 60 } }
        if (t === 'Absent') lop++; else paid++; grid.push({ date: i, type: t, ds })
      }

      // Parallel data fetching - removed complex where clauses requiring indexes
      const [otSRes, advSnap, loanSnap, fSnapRes, requestSnap, deletedAdvSnap, deletedExpSnap] = await Promise.all([
        getDocs(query(collection(db, 'organisations', user.orgId, 'otApprovals'), where('employeeId', '==', selectedEmp))),
        getDocs(query(collection(db, 'organisations', user.orgId, 'advances'), where('employeeId', '==', selectedEmp))),
        getDocs(query(collection(db, 'organisations', user.orgId, 'loans'), where('employeeId', '==', selectedEmp), where('status', '==', 'Active'))),
        getDocs(query(collection(db, 'organisations', user.orgId, 'fines'), where('employeeId', '==', selectedEmp))),
        getDocs(query(collection(db, 'organisations', user.orgId, 'advances_expenses'), where('employeeId', '==', selectedEmp))),
        getDocs(query(collection(db, 'organisations', user.orgId, 'deleted_advances_expenses'), where('employeeId', '==', selectedEmp)))
      ])

      const activeRequests = requestSnap.docs.map(d => ({ id: d.id, ...d.data() }))
      const deletedIds = new Set([...deletedAdvSnap.docs.map(d => d.id)])

      const activeRequestIds = new Set(activeRequests.map(item => item.id))
      const advDocs = advSnap.docs
        .map(d => d.data())
        .filter(a => a.status !== 'Recovered')
        .filter(a => !a.deleted)
        .filter(a => !a.isDeleted)
        .filter(a => !deletedIds.has(a.id))
        .filter(a => !a.linkedRequestId || activeRequestIds.has(a.linkedRequestId))
      const advExpRowsComputed = computeAdvExpRows({ activeRequests: activeRequests.filter(i => !deletedIds.has(i.id)), advDocs, selectedMonth, y, m })
      setAdvExpRows(advExpRowsComputed)

      const adv = advDocs
        .reduce((s, c) => s + Number(c.amount), 0)
      const emi = loanSnap.docs.map(d => d.data()).filter(l => !l.deleted && !l.isDeleted).reduce((s, l) => s + calcEMI(l, selectedMonth), 0)
      const sunP = sunW * (ts / end)
      const fineA = fSnapRes.docs.map(d => d.data()).filter(f => f.date >= sd && f.date <= ed).filter(f => !f.deleted && !f.isDeleted).reduce((s, d) => s + Number(d.amount || 0), 0)
      const otP = aOT * ((ts / end) / minH)

      const allExpenses = activeRequests.filter(item => item.type === 'Expense').filter(i => !deletedIds.has(i.id))
      const reimb = allExpenses.filter(i => {
        const isPaidThisMonth = i.paymentStatus === 'Paid' && i.paidAt?.toDate && 
                               i.paidAt.toDate().getFullYear() === y && 
                               (i.paidAt.toDate().getMonth() + 1) === m
        const isWithSalaryApproved = i.payoutMethod === 'With Salary' && 
                                    i.status === 'Approved' && 
                                    i.paymentStatus !== 'Paid' &&
                                    i.date?.startsWith(selectedMonth)
        return isPaidThisMonth || isWithSalaryApproved
      }).reduce((s, c) => s + Number(c.partialAmount || c.amount), 0)

      const b = ts * (slab.basicPercent / 100) * (paid / end), h = ts * (slab.hraPercent / 100) * (paid / end), p = ts * (slab.pfPercent / 100)
      const bFull = ts * (slab.basicPercent / 100)
      const hFull = ts * (slab.hraPercent / 100)
      // Removal of IT logic but keeping calculation consistency
      const de = p + adv + emi + fineA
      const g = b + h + otP + reimb + sunP
      
      setSlipData({ 
        employee: emp, 
        month: selectedMonth, 
        slab, 
        grid, 
        paidDays: paid, 
        lopDays: lop, 
        autoOTHours: aOT, 
        finalOT: aOT, 
        otPay: otP, 
        basic: b, 
        hra: h, 
        basicFull: bFull,
        hraFull: hFull,
        expenseReimbursement: reimb, 
        sundayPay: sunP, 
        grossEarnings: g, 
        pf: p, 
        esi: 0, // Placeholder for requested field
        it: 0, 
        advanceDeduction: adv, 
        loanEMI: emi, 
        fineAmount: fineA, 
        totalDeductions: de, 
        netPay: Math.max(0, g - de), 
        sundayCount: sun, 
        sundayWorkedCount: sunW, 
        holidayWorkedCount: holW,
        workedDaysCount: paid - sun, // Basic logic for "Working Days"
        totalMonthDays: end
      })    
    } catch (e) { 
      console.error('Generation Error:', e);
      setGenErr(e.message);
      alert('Generation failed: ' + e.message);
    } finally { setLoading(false) }
  }

  const handleFinalizeSlip = async () => {
    if (!slipData) return; setLoading(true)
    try {
      const sid = `${slipData.employee.id}_${slipData.month}`; 
      await setDoc(doc(db, 'organisations', user.orgId, 'salarySlips', sid), { ...slipData, finalizedAt: serverTimestamp(), finalizedBy: user.uid })
      
      const expSnap = await getDocs(query(
        collection(db, 'organisations', user.orgId, 'advances_expenses'),
        where('employeeId', '==', slipData.employee.id),
        where('payoutMethod', '==', 'With Salary'),
        where('status', '==', 'Approved'),
        where('paymentStatus', '!=', 'Paid')
      ))
      
      for (const edoc of expSnap.docs) {
        const data = edoc.data()
        if (data.date?.startsWith(slipData.month)) {
          await updateDoc(edoc.ref, {
            paymentStatus: 'Paid',
            paidAt: serverTimestamp(),
            paidBy: user.uid,
            salarySlipId: sid,
            updatedAt: serverTimestamp()
          })
        }
      }

      if (slipData.loanEMI > 0) {
        const lS = await getDocs(query(collection(db, 'organisations', user.orgId, 'loans'), where('employeeId', '==', slipData.employee.id), where('status', '==', 'Active')))
        for (const ld of lS.docs) {
          const d = ld.data(), de = calcEMI(d, slipData.month)
          if (de > 0) { const nr = Math.max(0, d.remainingAmount - de); await updateDoc(ld.ref, { remainingAmount: nr, status: nr <= 0 ? 'Closed' : 'Active', updatedAt: serverTimestamp() }); await logActivity(user.orgId, user, { module: 'Loans', action: 'EMI Deducted', detail: `₹${de} for ${slipData.employee.name}` }) }
        }
      }
      alert('Recorded'); fetchLoans()
    } catch (e) { alert(e.message) } finally { setLoading(false) }
  }

  return (
      <div className="flex h-full bg-white font-roboto text-gray-900 overflow-hidden flex-col">
      {/* Horizontal Sub-tabs at top */}
      <div className="bg-white border-b border-gray-200 px-6 py-3 shrink-0 shadow-sm">
        <div className="flex items-center gap-2">
          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mr-4">Payroll Engine</div>
          <nav className="flex items-center gap-2">
            {[
              {id:'salary-slip', icon:<Banknote size={16}/>, label:'Slip'}, 
              {id:'salary-summary', icon:<FileText size={16}/>, label:'Summary'}, 
              {id:'loan', icon:<Wallet size={16}/>, label:'Loans'}
            ].map(t => (
              <button 
                key={t.id} 
                onClick={() => setActiveTab(t.id)} 
                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all duration-200 whitespace-nowrap ${
                  activeTab === t.id 
                    ? 'bg-indigo-600 text-white shadow-md' 
                    : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <span className={activeTab === t.id ? 'text-white' : 'text-slate-400'}>{t.icon}</span>
                <span className="text-[13px] font-semibold tracking-tight whitespace-nowrap">{t.label}</span>
              </button>
            ))}
          </nav>
        </div>
      </div>
      <div className="flex-1 min-w-0 p-6 h-full overflow-hidden flex flex-col">
        {activeTab === 'salary-slip' && (
          <div className="max-w-6xl mx-auto space-y-4 flex flex-col h-full overflow-hidden p-2 w-full">
            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-wrap gap-4 items-end shrink-0">
              <div className="w-[240px] max-w-full font-google-sans uppercase text-[15px] font-bold text-gray-400">
                Target Employee
                <select
                  value={selectedEmp}
                  onChange={e => setSelectedEmp(e.target.value)}
                  className="w-full h-9 border border-gray-200 rounded-lg px-3 text-[15px] font-semibold bg-white outline-none mt-1 text-gray-900 normal-case"
                  style={{ fontFamily: "'Inter', sans-serif" }}
                >
                  <option value="">Select Employee</option>
                  {sortedEmployees.filter(e => {
                    if (e.includeInSalary === false) return false
                    if (e.status === 'Inactive' && e.inactiveFrom) {
                      return e.inactiveFrom.startsWith(selectedMonth) || e.inactiveFrom < selectedMonth
                    }
                    return true
                  }).map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
              </div>
              <div className="w-[170px] font-google-sans uppercase text-[15px] font-bold text-gray-400">
                Pay Period
                <input
                  type="month"
                  value={selectedMonth}
                  onChange={e => setSelectedMonth(e.target.value)}
                  className="w-full h-9 border border-gray-200 rounded-lg px-3 text-[15px] font-bold mt-1 text-gray-900 normal-case"
                  style={{ fontFamily: "'Inter', sans-serif" }}
                />
              </div>
              <div className="flex flex-col items-start gap-2">
                <button onClick={handleGenerate} disabled={loading || !selectedEmp} className="h-9 px-6 bg-gray-900 text-white font-bold rounded-lg uppercase tracking-[0.1em] text-[15px] shadow-lg hover:bg-black transition-all disabled:opacity-60">Generate</button>
                {loading && (
                  <div className="flex items-center gap-2 text-[15px] font-medium text-slate-500">
                    <span className="h-3.5 w-3.5 rounded-full border-2 border-slate-300 border-t-slate-900 animate-spin" />
                    Generating slip...
                  </div>
                )}
              </div>
            </div>
            
            {slipData ? (
              <div className="flex-1 overflow-hidden flex gap-4 p-2">
                <div className="flex-1 min-w-0 overflow-hidden flex flex-col items-center">
                  <div className="bg-white border-2 border-black shadow-2xl rounded-[24px] overflow-hidden relative flex flex-col w-full h-full print-area" style={{ fontFamily: "'Inter', sans-serif" }}>
                  <div className="flex justify-end gap-2 p-3 bg-slate-50 border-b border-slate-100 no-print shrink-0">
                    <button onClick={() => window.print()} className="h-8 bg-white border border-slate-200 text-slate-700 px-3 rounded-lg text-[10px] font-black uppercase tracking-widest flex items-center gap-2 hover:bg-slate-50 transition-all shadow-sm">
                      <Download size={12} />
                      Print
                    </button>
                    <button onClick={handleExportSalarySlipPdf} disabled={exportingSlipPdf} className="h-8 bg-white border border-slate-200 text-slate-700 px-3 rounded-lg text-[10px] font-black uppercase tracking-widest flex items-center gap-2 hover:bg-slate-50 transition-all shadow-sm disabled:opacity-60">
                      <Download size={12} />
                      {exportingSlipPdf ? 'Preparing...' : 'Export PDF'}
                    </button>
                    <button onClick={handleFinalizeSlip} className="h-8 bg-indigo-600 text-white px-4 rounded-lg text-[10px] font-black uppercase tracking-widest shadow-lg shadow-indigo-600/20 flex items-center gap-2 hover:bg-indigo-700 active:scale-95 transition-all">
                      <CheckCircle2 size={12} /> Finalize
                    </button>
                  </div>
                  
                  <div className="p-8 bg-white relative overflow-auto flex-1">
                    <div className="absolute top-0 right-0 w-48 h-48 bg-indigo-50 rounded-full -mr-24 -mt-24 blur-3xl opacity-50"></div>
                    
                    <div className="border-b border-slate-900 pb-4 mb-6 flex justify-between items-start relative z-10">
                      <div className="flex items-center gap-4">
                        {orgLogo && <img src={orgLogo} alt="Logo" className="w-12 h-12 object-contain rounded-lg shadow-sm bg-slate-50 p-1.5" />}
                        <div>
                          <h1 className="text-2xl font-black text-slate-900 uppercase font-google-sans tracking-tighter leading-none">{user?.orgName}</h1>
                          <p className="text-[8px] text-indigo-600 font-black uppercase tracking-[0.4em] mt-2 flex items-center gap-2">
                            <span className="w-4 h-0.5 bg-indigo-600"></span>
                            Payroll Advice
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <h2 className="text-lg font-black text-slate-900 uppercase font-google-sans tracking-tight italic">Statement</h2>
                        <p className="text-[9px] font-black text-slate-500 mt-1 bg-slate-100 px-2 py-0.5 rounded border border-slate-200 uppercase tracking-widest">
                          {formatMonthDisplay(slipData.month)}
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-x-12 gap-y-1 mb-8 relative z-10 px-2">
                      <div className="flex justify-between border-b border-slate-100 py-1.5">
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-tight">Name of the Employee</span>
                        <span className="text-[9px] font-bold text-slate-900 uppercase">{slipData.employee?.name}</span>
                      </div>
                      <div className="flex justify-between border-b border-slate-100 py-1.5">
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-tight">No.of Working Days</span>
                        <span className="text-[9px] font-bold text-slate-900">{slipData.workedDaysCount}</span>
                      </div>
                      <div className="flex justify-between border-b border-slate-100 py-1.5">
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-tight">Employee N0</span>
                        <span className="text-[9px] font-bold text-slate-900 uppercase">{slipData.employee?.empCode}</span>
                      </div>
                      <div className="flex justify-between border-b border-slate-100 py-1.5">
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-tight">Worked Holidays</span>
                        <span className="text-[9px] font-bold text-slate-900">{slipData.holidayWorkedCount || 0}</span>
                      </div>
                      <div className="flex justify-between border-b border-slate-100 py-1.5">
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-tight">Designation</span>
                        <span className="text-[9px] font-bold text-slate-900 uppercase">{slipData.employee?.designation || '-'}</span>
                      </div>
                      <div className="flex justify-between border-b border-slate-100 py-1.5">
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-tight">No.of Holidays</span>
                        <span className="text-[9px] font-bold text-slate-900">{slipData.sundayCount}</span>
                      </div>
                      <div className="flex justify-between border-b border-slate-100 py-1.5">
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-tight">DOB</span>
                        <span className="text-[9px] font-bold text-slate-900">{formatDateDDMMYYYY(slipData.employee?.dob) || '-'}</span>
                      </div>
                      <div className="flex justify-between border-b border-slate-100 py-1.5">
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-tight">No. of Leave Taken</span>
                        <span className="text-[9px] font-bold text-slate-900">{slipData.lopDays}</span>
                      </div>
                      <div className="flex justify-between border-b border-slate-100 py-1.5">
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-tight">DOJ</span>
                        <span className="text-[9px] font-bold text-slate-900">{formatDateDDMMYYYY(slipData.employee?.doj) || '-'}</span>
                      </div>
                      <div className="flex justify-between border-b border-slate-100 py-1.5">
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-tight">No. of days Paid</span>
                        <span className="text-[9px] font-bold text-slate-900">{slipData.paidDays}</span>
                      </div>
                      <div className="flex justify-between border-b border-slate-100 py-1.5">
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-tight">Total No. of Days</span>
                        <span className="text-[9px] font-bold text-slate-900">{slipData.totalMonthDays}</span>
                      </div>
                    </div>

                    <div className="flex justify-center gap-16 mb-6 py-4 bg-slate-50 rounded-xl px-4">
                      <div className="text-center">
                        <p className="text-[9px] font-black text-slate-500 uppercase tracking-wider mb-1">Basic</p>
                        <p className="text-base font-black text-slate-900">{formatINR(slipData.basicFull)}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-[9px] font-black text-slate-500 uppercase tracking-wider mb-1">HRA</p>
                        <p className="text-base font-black text-slate-900">{formatINR(slipData.hraFull)}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-[9px] font-black text-slate-500 uppercase tracking-wider mb-1">Salary</p>
                        <p className="text-base font-black text-indigo-600">{formatINR(slipData.basicFull + slipData.hraFull)}</p>
                      </div>
                    </div>

                    <div className="border border-slate-200 rounded-[20px] overflow-hidden mb-6 shadow-sm relative z-10">
                      <div className="grid grid-cols-2 bg-slate-100 font-google-sans font-black text-[9px] uppercase tracking-widest text-slate-900 border-b border-slate-200">
                        <div className="p-3 flex justify-between items-center border-r border-slate-200">
                          <span className="flex items-center gap-2"><span className="w-1.5 h-1.5 bg-indigo-500 rounded-full"></span> Earnings</span>
                          <span className="text-slate-500">Amount</span>
                        </div>
                        <div className="p-3 flex justify-between items-center">
                          <span className="flex items-center gap-2"><span className="w-1.5 h-1.5 bg-rose-500 rounded-full"></span> Deductions</span>
                          <span className="text-slate-500">Amount</span>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-2 divide-x divide-slate-200 bg-white">
                        <div className="p-1 space-y-0.5">
                          <div className="flex justify-between p-2.5 rounded-xl hover:bg-slate-50 transition-colors text-[11px] font-medium text-slate-600">
                            Basic Salary<span className="font-bold text-slate-900">{formatINR(slipData.basic)}</span>
                          </div>
                          <div className="flex justify-between p-2.5 rounded-xl hover:bg-slate-50 transition-colors text-[11px] font-medium text-slate-600">
                            Allowances (HRA)<span className="font-bold text-slate-900">{formatINR(slipData.hra)}</span>
                          </div>
                          <div className="flex justify-between p-2.5 rounded-xl hover:bg-slate-50 transition-colors text-[11px] font-medium text-slate-600">
                            Expense<span className="font-bold text-slate-900">{dashIfZero(slipData.expenseReimbursement)}</span>
                          </div>
                          <div className="flex justify-between p-2.5 rounded-xl hover:bg-slate-50 transition-colors text-[11px] font-medium text-slate-600">
                            Sunday Worked<span className="font-bold text-slate-900">{dashIfZero(slipData.sundayPay)}</span>
                          </div>
                          <div className="flex justify-between p-2.5 rounded-xl hover:bg-slate-50 transition-colors text-[11px] font-medium text-slate-600">
                            OT<span className="font-bold text-slate-900">{dashIfZero(slipData.otPay)}</span>
                          </div>
                        </div>
                        <div className="p-1 space-y-0.5">
                          <div className="flex justify-between p-2.5 rounded-xl hover:bg-slate-50 transition-colors text-[11px] font-medium text-slate-600">
                            PF<span className="font-bold text-slate-900">{dashIfZero(slipData.pf)}</span>
                          </div>
                          <div className="flex justify-between p-2.5 rounded-xl hover:bg-slate-50 transition-colors text-[11px] font-medium text-slate-600">
                            ESI<span className="font-bold text-slate-900">{dashIfZero(slipData.esi || 0)}</span>
                          </div>
                          <div className="flex justify-between p-2.5 rounded-xl hover:bg-slate-50 transition-colors text-[11px] font-medium text-slate-600">
                            Advance<span className="font-bold text-slate-900">{dashIfZero(slipData.advanceDeduction)}</span>
                          </div>
                          <div className="flex justify-between p-2.5 rounded-xl hover:bg-slate-50 transition-colors text-[11px] font-medium text-slate-600">
                            Loan<span className="font-bold text-slate-900">{dashIfZero(slipData.loanEMI)}</span>
                          </div>
                          <div className="flex justify-between p-2.5 rounded-xl hover:bg-slate-50 transition-colors text-[11px] font-medium text-slate-600">
                            Fine<span className="font-bold text-slate-900">{dashIfZero(slipData.fineAmount)}</span>
                          </div>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-2 divide-x divide-slate-200 bg-slate-100 border-t border-slate-200 font-black font-google-sans uppercase text-[10px] text-slate-900 tracking-widest">
                        <div className="p-4 flex justify-between items-center">
                          <span className="text-slate-500">Gross Earnings</span>
                          <span className="text-sm tracking-tighter">{formatINR(slipData.grossEarnings)}</span>
                        </div>
                        <div className="p-4 flex justify-between items-center">
                          <span className="text-slate-500">Total Deductions</span>
                          <span className="text-sm tracking-tighter text-rose-500">{formatINR(slipData.totalDeductions)}</span>
                        </div>
                      </div>
                    </div>

                    <div className="text-center pt-4 border-t border-dashed border-slate-200 relative z-10">
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Final Disbursement Value</p>
                      <div className="bg-white border-2 border-slate-200 text-slate-900 rounded-xl p-4 inline-block min-w-[300px] shadow-xl">
                        <p className="text-[14px] font-black tracking-tight text-slate-900 mb-1">{formatINR(slipData.netPay)}</p>
                        <p className="text-[9px] font-black italic tracking-tight uppercase text-slate-500">
                          {numberToWords(slipData.netPay)} Only
                        </p>
                      </div>
                      <p className="text-[8px] text-slate-400 mt-6 font-black uppercase tracking-[0.4em] font-google-sans italic">
                        Confidential • HRFlow Intelligence
                      </p>
                    </div>
                  </div>
                </div>
              </div>
              <div className="w-[340px] shrink-0 overflow-hidden">
                <div className="bg-white border border-gray-100 shadow-sm rounded-[24px] overflow-hidden relative flex flex-col h-full" style={{ fontFamily: "'Inter', sans-serif" }}>
                  <div className="p-4 bg-slate-50 border-b border-slate-100 shrink-0">
                    <div className="text-[12px] font-black text-slate-900 uppercase tracking-widest">Advances & Expenses</div>
                    <div className="text-[9px] font-black text-indigo-600 uppercase tracking-[0.3em] mt-2">
                      {formatMonthDisplay(slipData.month)}
                    </div>
                  </div>
                  <div className="p-3 overflow-auto flex-1">
                    <table className="w-full border-collapse text-left text-[10px]">
                      <thead>
                        <tr>
                          <th className="pb-2 pr-2 font-black text-slate-400 uppercase tracking-widest">Date</th>
                          <th className="pb-2 pr-2 font-black text-slate-400 uppercase tracking-widest">Type</th>
                          <th className="pb-2 font-black text-slate-400 uppercase tracking-widest text-right">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {advExpRows.length === 0 ? (
                          <tr>
                            <td colSpan={3} className="py-10 text-center text-[11px] font-medium text-slate-400">No applied items</td>
                          </tr>
                        ) : (
                          advExpRows.map((row, i) => (
                            <tr key={`${row.type}_${row.date}_${i}`} className="border-t border-slate-100">
                              <td className="py-2 pr-2 font-bold text-slate-700">{formatDateDDMMYYYY(row.date)}</td>
                              <td className="py-2 pr-2">
                                <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-tight ${row.type === 'Advance' ? 'bg-amber-50 text-amber-700 border border-amber-100' : 'bg-indigo-50 text-indigo-700 border border-indigo-100'}`}>
                                  {row.type}
                                </span>
                              </td>
                              <td className="py-2 text-right font-black text-indigo-600 tabular-nums">{formatINR(row.amount)}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
            ) : (
              <div className="flex-1 flex items-center justify-center border-2 border-dashed border-slate-200 rounded-3xl bg-slate-50/50">
                <div className="text-center space-y-4">
                  <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center mx-auto shadow-sm border border-slate-100">
                    <FileText size={32} className="text-slate-300" />
                  </div>
                  <div>
                    <p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em]">Select Employee to preview statement</p>
                    <p className="text-[9px] text-slate-400 mt-1 font-medium">Statements generate automatically based on attendance data.</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'salary-summary' && (
          <div className="max-w-full space-y-4 flex flex-col h-full overflow-hidden">
            <div className="flex justify-between items-center gap-4 bg-white p-2 rounded-lg border border-gray-200 shadow-sm shrink-0">
              <div className="flex items-center gap-2">
                <div className="flex items-center bg-gray-100 rounded-md p-1.5"><button onClick={() => { const [y, m] = summaryMonth.split('-').map(Number); const d = new Date(y, m - 2, 1); setSummaryMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`) }} className="p-1.5 hover:bg-white hover:shadow-sm rounded transition-all text-gray-600"><ChevronLeft size={14} /></button><div className="px-2 py-0.5 font-bold text-gray-900 text-[11px] min-w-[100px] text-center uppercase tracking-tighter">{new Date(summaryMonth + '-01').toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}</div><button onClick={() => monthInputRef.current?.showPicker()} className="p-1.5 hover:bg-white hover:shadow-sm rounded transition-all text-indigo-600 relative"><CalendarIcon size={14} /><input ref={monthInputRef} type="month" value={summaryMonth} onChange={e => setSummaryMonth(e.target.value)} className="absolute inset-0 opacity-0 cursor-pointer pointer-events-none" /></button><button onClick={() => { const [y, m] = summaryMonth.split('-').map(Number); const d = new Date(y, m, 1); setSummaryMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`) }} className="p-1.5 hover:bg-white hover:shadow-sm rounded transition-all text-gray-600"><ChevronRight size={14} /></button></div>
                <div className="h-4 w-px bg-gray-200 mx-0.5" /><button onClick={() => refetchSummary()} className="h-8 px-4 bg-gray-900 text-white font-bold rounded text-[8px] uppercase tracking-widest shadow hover:bg-black transition-all active:scale-95">Submit</button>
              </div>
              <div className="text-right pr-2"><h1 className="text-[9px] font-black text-gray-900 font-google-sans tracking-tight uppercase leading-none">Salary Summary</h1><p className="text-[7px] text-gray-400 font-bold uppercase tracking-widest mt-0.5">Analytics Engine</p></div>
            </div>
            <div className="flex gap-2 flex-1 min-h-0 items-start overflow-hidden relative">
              <div className="flex-1 min-w-0 flex flex-col gap-2 h-full overflow-hidden">
                <div className="flex flex-col h-1/2 min-h-0 space-y-1">
                  <button onClick={() => setIsAttendanceSummaryOpen(!isAttendanceSummaryOpen)} className="flex justify-between items-center bg-white px-2 py-1 rounded border border-gray-200 shadow-sm shrink-0 hover:border-indigo-200 transition-all group w-[50px] h-10"><div className="flex items-center gap-2"><div className="w-5 h-5 rounded bg-gray-900 flex items-center justify-center text-white group-hover:bg-indigo-600 transition-colors"><Clock size={10} /></div><p className="text-[8px] font-bold text-gray-900 uppercase font-google-sans tracking-tight">Summary</p></div><div className="flex items-center gap-1"><button onClick={(e) => { e.stopPropagation(); setIsDetailPanelOpen(!isDetailPanelOpen); }} className={`p-0.5 rounded transition-all ${isDetailPanelOpen ? 'bg-indigo-100 text-indigo-600' : 'hover:bg-gray-100 text-gray-400'}`} title={isDetailPanelOpen ? "Close Details" : "Open Details"}><Info size={10} /></button>{isAttendanceSummaryOpen ? <ChevronUp size={10} className="text-gray-400" /> : <ChevronDown size={10} className="text-gray-400" />}</div></button>
                  <div className={`bg-white border border-gray-300 overflow-hidden flex-col flex-1 min-h-0 ${!isAttendanceSummaryOpen ? 'hidden' : 'flex'}`} style={{ fontFamily: 'Roboto, sans-serif' }}><div className="overflow-auto flex-1">
                    <table className="w-full border-collapse text-[11px] table-auto">
                      <thead className="sticky top-0 z-10">
                        {table.getHeaderGroups().map((headerGroup) => (
                          <tr key={headerGroup.id} style={{ height: '21px' }} className="bg-white">
                            {headerGroup.headers.map(header => (
                              <th 
                                key={header.id} 
                                colSpan={header.colSpan} 
                                rowSpan={header.rowSpan || 1}
                                className={`px-2 py-1 border border-gray-300 text-gray-700 font-semibold text-center bg-white`}
                                style={{ fontSize: '10px', height: header.colSpan > 1 ? '21px' : '21px' }}
                              >
                                {flexRender(header.column.columnDef.header, header.getContext())}
                              </th>
                            ))}
                          </tr>
                        ))}
                      </thead>
                      <tbody>
                        {isAttendanceLoading ? (<tr><td colSpan={13} className="p-10 text-center"><Spinner /></td></tr>) : (
                          table.getRowModel().rows.map(row => (
                            <tr key={row.id} style={{ height: '21px' }} className={`hover:bg-gray-50 ${summaryEmpDetail?.id === row.original.id ? 'bg-gray-100' : 'bg-white'}`}>
                              {row.getVisibleCells().map(cell => (<td key={cell.id} className="px-1 py-0.5 border border-gray-200 text-gray-800 text-center whitespace-nowrap">{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>))}
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div></div>
                </div>
                
                {/* Detailed Salary Summary Table - Spreadsheet Style with Horizontal Scroll */}
                <div className="flex flex-col h-1/2 min-h-0 space-y-1">
                  <div className="flex justify-between items-center bg-white px-2 py-1 rounded border border-gray-200 shadow-sm shrink-0">
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 rounded bg-indigo-600 flex items-center justify-center text-white">
                        <Wallet size={10} />
                      </div>
                      <p className="text-[10px] font-bold text-gray-900 uppercase tracking-tight">Detailed Salary Summary</p>
                    </div>
                    <span className="text-[9px] text-gray-500">Comprehensive Payroll Breakdown</span>
                  </div>
                  <div className="bg-white border border-gray-300 overflow-hidden flex-col flex-1 min-h-0" style={{ fontFamily: 'Roboto, sans-serif' }}>
                    <div className="flex-1 overflow-hidden">
                      <table className="w-full border-collapse text-[11px]">
                        <thead className="sticky top-0 z-10">
                          <tr style={{ height: '28px' }} className="bg-gray-50">
                            <th className="px-1.5 py-1.5 border-b-2 border-gray-300 text-gray-700 font-bold text-[9px] text-center bg-gray-100 uppercase tracking-wider">S.No</th>
                            <th className="px-1.5 py-1.5 border-b-2 border-gray-300 text-gray-700 font-bold text-[9px] text-left bg-gray-100 uppercase tracking-wider">Emp No</th>
                            <th className="px-1.5 py-1.5 border-b-2 border-gray-300 text-gray-700 font-bold text-[9px] text-left bg-gray-100 uppercase tracking-wider">Name</th>
                            <th className="px-1.5 py-1.5 border-b-2 border-gray-300 text-gray-700 font-bold text-[9px] text-left bg-gray-100 uppercase tracking-wider">Desig</th>
                            <th className="px-1.5 py-1.5 border-b-2 border-gray-300 text-gray-700 font-bold text-[9px] text-right bg-gray-100 uppercase tracking-wider">Basic</th>
                            <th className="px-1.5 py-1.5 border-b-2 border-gray-300 text-gray-700 font-bold text-[9px] text-right bg-gray-100 uppercase tracking-wider">HRA</th>
                            <th className="px-1.5 py-1.5 border-b-2 border-gray-300 text-gray-700 font-bold text-[9px] text-right bg-gray-100 uppercase tracking-wider">Sal</th>
                            <th className="px-1.5 py-1.5 border-b-2 border-gray-300 text-gray-700 font-bold text-[9px] text-center bg-gray-100 uppercase tracking-wider">Days</th>
                            <th className="px-1.5 py-1.5 border-b-2 border-gray-300 text-gray-700 font-bold text-[9px] text-center bg-gray-100 uppercase tracking-wider">Wrk</th>
                            <th className="px-1.5 py-1.5 border-b-2 border-gray-300 text-gray-700 font-bold text-[9px] text-center bg-gray-100 uppercase tracking-wider">Sun</th>
                            <th className="px-1.5 py-1.5 border-b-2 border-gray-300 text-gray-700 font-bold text-[9px] text-center bg-gray-100 uppercase tracking-wider">Hol</th>
                            <th className="px-1.5 py-1.5 border-b-2 border-gray-300 text-gray-700 font-bold text-[9px] text-center bg-gray-100 uppercase tracking-wider">Lve</th>
                            <th className="px-1.5 py-1.5 border-b-2 border-gray-300 text-gray-700 font-bold text-[9px] text-center bg-gray-100 uppercase tracking-wider">Paid</th>
                            <th className="px-1.5 py-1.5 border-b-2 border-gray-300 text-gray-700 font-bold text-[9px] text-right bg-gray-100 uppercase tracking-wider">Basic</th>
                            <th className="px-1.5 py-1.5 border-b-2 border-gray-300 text-gray-700 font-bold text-[9px] text-right bg-gray-100 uppercase tracking-wider">HRA</th>
                            <th className="px-1.5 py-1.5 border-b-2 border-gray-300 text-gray-700 font-bold text-[9px] text-right bg-gray-100 uppercase tracking-wider">Sal</th>
                            <th className="px-1.5 py-1.5 border-b-2 border-gray-300 text-gray-700 font-bold text-[9px] text-right bg-gray-100 uppercase tracking-wider">Sun</th>
                            <th className="px-1.5 py-1.5 border-b-2 border-gray-300 text-gray-700 font-bold text-[9px] text-right bg-gray-100 uppercase tracking-wider">OT</th>
                            <th className="px-1.5 py-1.5 border-b-2 border-gray-300 text-gray-700 font-bold text-[9px] text-right bg-gray-100 uppercase tracking-wider">Earn</th>
                            <th className="px-1.5 py-1.5 border-b-2 border-gray-300 text-gray-700 font-bold text-[9px] text-right bg-gray-100 uppercase tracking-wider">PF</th>
                            <th className="px-1.5 py-1.5 border-b-2 border-gray-300 text-gray-700 font-bold text-[9px] text-right bg-gray-100 uppercase tracking-wider">ESI</th>
                            <th className="px-1.5 py-1.5 border-b-2 border-gray-300 text-gray-700 font-bold text-[9px] text-right bg-gray-100 uppercase tracking-wider">Adv</th>
                            <th className="px-1.5 py-1.5 border-b-2 border-gray-300 text-gray-700 font-bold text-[9px] text-right bg-gray-100 uppercase tracking-wider">VR</th>
                            <th className="px-1.5 py-1.5 border-b-2 border-gray-300 text-gray-700 font-bold text-[9px] text-right bg-gray-100 uppercase tracking-wider">Ded</th>
                            <th className="px-1.5 py-1.5 border-b-2 border-gray-300 text-gray-700 font-bold text-[9px] text-right bg-gray-100 uppercase tracking-wider">Tot Ded</th>
                            <th className="px-1.5 py-1.5 border-b-2 border-gray-300 text-gray-700 font-bold text-[9px] text-right bg-gray-100 uppercase tracking-wider">Net</th>
                          </tr>
                        </thead>
                        <tbody>
                          {isAttendanceLoading ? (
                            <tr><td colSpan={25} className="p-4 text-center"><Spinner /></td></tr>
                          ) : attendanceSummaryData.length === 0 ? (
                            <tr><td colSpan={25} className="py-8 text-center text-gray-400 text-[11px]">No data available</td></tr>
                          ) : (
                            attendanceSummaryData.map((emp, idx) => {
                              const otherDeductions = emp.fine || 0
                              const it = emp.salary.deductions.find(d => d.label === 'IT')?.value || 0
                              
                              return (
                                <tr key={emp.id} style={{ height: '24px' }} className={`hover:bg-indigo-50/50 transition-colors ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}>
                                  <td className="px-1.5 py-0.5 border-b border-gray-100 text-gray-600 text-center text-[10px] font-medium">{emp.sno}</td>
                                  <td className="px-1.5 py-0.5 border-b border-gray-100 text-gray-600 text-[10px] font-mono">{emp.empId}</td>
                                  <td className="px-1.5 py-0.5 border-b border-gray-100 text-gray-900 font-semibold text-[10px] truncate max-w-[80px]">{emp.name}</td>
                                  <td className="px-1.5 py-0.5 border-b border-gray-100 text-gray-500 text-[10px] truncate max-w-[60px]">{emp.designation}</td>
                                  <td className="px-1.5 py-0.5 border-b border-gray-100 text-gray-700 text-right text-[10px] tabular-nums font-medium">₹{(emp.fullBasic/1000).toFixed(1)}k</td>
                                  <td className="px-1.5 py-0.5 border-b border-gray-100 text-gray-700 text-right text-[10px] tabular-nums font-medium">₹{(emp.fullHra/1000).toFixed(1)}k</td>
                                  <td className="px-1.5 py-0.5 border-b border-gray-100 text-gray-900 text-right text-[10px] tabular-nums font-bold">₹{Math.round(emp.fullBasic + emp.fullHra).toLocaleString('en-IN')}</td>
                                  <td className="px-1.5 py-0.5 border-b border-gray-100 text-gray-700 text-center text-[10px] font-medium">{emp.totalDays}</td>
                                  <td className="px-1.5 py-0.5 border-b border-gray-100 text-gray-700 text-center text-[10px] font-medium">{emp.worked}</td>
                                  <td className="px-1.5 py-0.5 border-b border-gray-100 text-gray-700 text-center text-[10px] font-medium">{emp.sunW}</td>
                                  <td className="px-1.5 py-0.5 border-b border-gray-100 text-gray-700 text-center text-[10px] font-medium">{emp.holW}</td>
                                  <td className="px-1.5 py-0.5 border-b border-gray-100 text-gray-700 text-center text-[10px] font-medium">{emp.leave}</td>
                                  <td className="px-1.5 py-0.5 border-b border-gray-100 text-gray-700 text-center text-[10px] font-medium">{emp.totalWorkingDays}</td>
                                  <td className="px-1.5 py-0.5 border-b border-gray-100 text-gray-700 text-right text-[10px] tabular-nums font-medium">₹{Math.round(emp.basic).toLocaleString('en-IN')}</td>
                                  <td className="px-1.5 py-0.5 border-b border-gray-100 text-gray-700 text-right text-[10px] tabular-nums font-medium">₹{Math.round(emp.hra).toLocaleString('en-IN')}</td>
                                  <td className="px-1.5 py-0.5 border-b border-gray-100 text-gray-900 text-right text-[10px] tabular-nums font-bold">₹{Math.round(emp.basic + emp.hra).toLocaleString('en-IN')}</td>
                                  <td className="px-1.5 py-0.5 border-b border-gray-100 text-amber-600 text-right text-[10px] tabular-nums font-medium">₹{Math.round(emp.sunPay + emp.holPay).toLocaleString('en-IN')}</td>
                                  <td className="px-1.5 py-0.5 border-b border-gray-100 text-blue-600 text-right text-[10px] tabular-nums font-medium">₹{Math.round(emp.salary.earnings.find(e => e.label === 'OT Est.')?.value || 0).toLocaleString('en-IN')}</td>
                                  <td className="px-1.5 py-0.5 border-b border-gray-100 text-emerald-600 font-semibold text-right text-[10px] tabular-nums font-bold">₹{Math.round(emp.totalEarnings).toLocaleString('en-IN')}</td>
                                  <td className="px-1.5 py-0.5 border-b border-gray-100 text-red-600 text-right text-[10px] tabular-nums font-medium">₹{Math.round(emp.pf).toLocaleString('en-IN')}</td>
                                  <td className="px-1.5 py-0.5 border-b border-gray-100 text-gray-400 text-right text-[10px] tabular-nums">-</td>
                                  <td className="px-1.5 py-0.5 border-b border-gray-100 text-red-600 text-right text-[10px] tabular-nums font-medium">₹{Math.round(emp.loanE + emp.advanceAmount).toLocaleString('en-IN')}</td>
                                  <td className="px-1.5 py-0.5 border-b border-gray-100 text-purple-600 text-right text-[10px] tabular-nums font-medium">₹{Math.round(emp.vrAdvance).toLocaleString('en-IN')}</td>
                                  <td className="px-1.5 py-0.5 border-b border-gray-100 text-red-600 text-right text-[10px] tabular-nums font-medium">₹{Math.round(otherDeductions).toLocaleString('en-IN')}</td>
                                  <td className="px-1.5 py-0.5 border-b border-gray-100 text-red-600 font-semibold text-right text-[10px] tabular-nums font-bold">₹{Math.round(emp.totalDeductions).toLocaleString('en-IN')}</td>
                                  <td className="px-1.5 py-0.5 border-b border-gray-100 text-emerald-700 font-bold text-right text-[10px] tabular-nums font-bold">₹{Math.round(emp.salary.net).toLocaleString('en-IN')}</td>
                                </tr>
                              )
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
              
              {isDetailPanelOpen && (
                <div className="w-[200px] bg-white rounded-lg border border-gray-200 shadow-xl flex flex-col shrink-0 overflow-hidden h-full animate-in slide-in-from-right duration-300">
                  <div className="p-2.5 border-b border-gray-100 flex justify-between items-center bg-gray-50/50 shrink-0">{summaryEmpDetail ? (<div><h3 className="font-black text-gray-900 uppercase font-google-sans text-[9px] tracking-tight truncate w-[140px]">{summaryEmpDetail.name}</h3><p className="text-[7px] text-gray-400 font-bold uppercase tracking-widest">{summaryEmpDetail.empId}</p></div>) : (<div><h3 className="font-black text-gray-300 uppercase font-google-sans text-[9px] tracking-tight">Details</h3><p className="text-[7px] text-gray-300 font-bold uppercase tracking-widest">No Selection</p></div>)}<button onClick={() => setIsDetailPanelOpen(false)} className="p-1 hover:bg-gray-200 rounded-full transition-all text-gray-400"><X size={10} /></button></div>
                  <div className="p-2.5 font-inter flex-1 overflow-hidden flex flex-col">
                    {!summaryEmpDetail ? (<div className="h-full flex flex-col items-center justify-center space-y-2 opacity-10 py-10"><FileText size={32} strokeWidth={1} /><p className="text-[7px] font-bold uppercase tracking-widest text-center px-4">Select record</p></div>) : (
                      <div className="space-y-3 flex-1 flex flex-col">
                        <div className="space-y-3 flex-1 overflow-auto">
                          <div className="space-y-1.5">
                            <div className="flex items-center gap-1 text-indigo-600 font-black uppercase text-[7px] tracking-widest"><FileText size={8} /> Earnings</div>
                            <div className="bg-indigo-50/30 rounded border border-indigo-100 p-2 space-y-1">
                              {summaryEmpDetail.salary.earnings.map((e, i) => (<div key={i} className="flex justify-between text-[9px] font-medium text-gray-600">{e.label} <span className="font-bold text-gray-900">{formatINR(e.value)}</span></div>))}
                            </div>
                          </div>
                          <div className="space-y-1.5">
                            <div className="flex items-center gap-1 text-red-600 font-black uppercase text-[7px] tracking-widest"><AlertCircle size={8} /> Deductions</div>
                            <div className="bg-red-50/30 rounded border border-red-100 p-2 space-y-1">
                              {summaryEmpDetail.salary.deductions.map((d, i) => (<div key={i} className="flex justify-between text-[9px] font-medium text-gray-600">{d.label} <span className="font-bold text-gray-900">{formatINR(d.value)}</span></div>))}
                            </div>
                          </div>
                        </div>
                        <div className="pt-2 border-t border-dashed border-gray-200 shrink-0">
                          <div className="bg-gray-900 text-white rounded-lg p-2.5 text-center shadow-lg">
                            <p className="text-[6px] font-bold text-gray-400 uppercase tracking-widest mb-0.5">Net Payout (Est.)</p>
                            <p className="text-base font-black font-google-sans tracking-tighter">{formatINR(summaryEmpDetail.salary.net)}</p>
                          </div>
                          <button onClick={() => { setActiveTab('salary-slip'); setSelectedEmp(summaryEmpDetail.id); }} className="w-full mt-2 py-1.5 bg-indigo-50 text-indigo-700 font-black rounded text-[7px] uppercase tracking-widest hover:bg-indigo-600 hover:text-white transition-all shadow-sm">Go to Generator</button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'loan' && (
          <div className="max-w-full space-y-4 flex flex-col h-full overflow-hidden">
            <div className="flex border-b border-gray-200 overflow-x-auto shrink-0 bg-white">
              {['Configuration', 'Active Schedules', 'Activity'].map(mod => {
                const isActive = loanActiveModule === mod
                return (
                  <button
                    key={mod}
                    onClick={() => setLoanActiveModule(mod)}
                    className={`whitespace-nowrap px-6 py-3 text-[11px] font-black uppercase tracking-widest transition-all ${
                      isActive ? 'border-b-2 border-indigo-600 text-indigo-700 bg-indigo-50/50' : 'text-gray-500 hover:text-gray-800 hover:bg-gray-50'
                    }`}
                  >
                    {mod}
                  </button>
                )
              })}
            </div>

            <div className="flex-1 overflow-auto p-4">
              {loanActiveModule === 'Configuration' && (
                <div className="max-w-2xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
                  <div className="bg-white rounded-3xl border border-gray-200 shadow-xl overflow-hidden">
                    <div className="p-6 bg-slate-100 text-slate-900 flex justify-between items-center border-b border-slate-200">
                      <div>
                        <h3 className="text-lg font-black uppercase font-google-sans tracking-tight">Loan Setup</h3>
                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">Lifecycle tracking for advances</p>
                      </div>
                      <Settings className="text-indigo-500" size={24} />
                    </div>
                    <div className="p-8 space-y-6">
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Target Employee</label>
                        <select value={loanForm.employeeId} onChange={e => setEditLoanForm({...loanForm, employeeId: e.target.value})} className="w-full h-12 border border-gray-200 rounded-2xl px-4 bg-slate-50 focus:ring-2 focus:ring-indigo-500 outline-none font-bold text-slate-800 transition-all">
                          <option value="">Choose Employee...</option>
                          {employees.filter(e => e.includeInSalary !== false).map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                        </select>
                      </div>
                      <div className="grid grid-cols-2 gap-6">
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Principal Amount (₹)</label>
                          <input type="number" value={loanForm.totalAmount} onChange={e => setEditLoanForm({...loanForm, totalAmount: e.target.value})} className="w-full h-12 border border-gray-200 rounded-2xl px-4 font-black bg-slate-50 focus:ring-2 focus:ring-indigo-500 outline-none text-indigo-600 text-lg" placeholder="0.00" />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Monthly EMI (₹)</label>
                          <input type="number" value={loanForm.emiAmount} onChange={e => setEditLoanForm({...loanForm, emiAmount: e.target.value})} className="w-full h-12 border border-gray-200 rounded-2xl px-4 font-black bg-slate-50 focus:ring-2 focus:ring-indigo-500 outline-none text-slate-800 text-lg" placeholder="0.00" />
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Recovery Remarks</label>
                        <input type="text" value={loanForm.remarks} onChange={e => setEditLoanForm({...loanForm, remarks: e.target.value})} className="w-full h-12 border border-gray-200 rounded-2xl px-4 bg-slate-50 focus:ring-2 focus:ring-indigo-500 outline-none font-medium text-slate-600" placeholder="Reason for loan..." />
                      </div>
                      <div className="pt-4 flex gap-4">
                        <button onClick={() => { setEditLoanForm({ employeeId: '', totalAmount: '', emiAmount: '', startMonth: '', remarks: '' }); setEditingLoanId(null); setLoanActiveModule('Active Schedules'); }} className="flex-1 h-12 bg-slate-100 text-slate-600 font-black rounded-2xl uppercase text-[11px] tracking-widest hover:bg-slate-200 transition-all">Cancel</button>
                        <button onClick={handleCreateLoan} disabled={loading} className="flex-2 h-12 bg-indigo-600 text-white font-black rounded-2xl uppercase text-[11px] tracking-widest shadow-lg shadow-indigo-600/20 hover:bg-indigo-700 active:scale-95 transition-all">
                          {editingLoanId ? 'Update Recovery Plan' : 'Activate Loan Schedule'}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {loanActiveModule === 'Active Schedules' && (
                <div className="space-y-6 animate-in fade-in duration-500">
                  <div className="bg-white rounded-[32px] border border-gray-200 shadow-xl overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse font-inter">
                        <thead>
                          <tr className="bg-slate-100 text-[10px] font-black uppercase tracking-widest text-slate-600 h-14 border-b border-slate-200">
                            <th className="px-8 border-r border-slate-200">Employee</th>
                            <th className="px-8 border-r border-slate-200 text-right">Remaining Principal</th>
                            <th className="px-8 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {loans.length === 0 ? (
                            <tr><td colSpan={3} className="px-8 py-20 text-center text-slate-300 font-black uppercase tracking-widest italic opacity-50">No active recovery schedules</td></tr>
                          ) : loans.map(l => (
                            <tr key={l.id} className="hover:bg-slate-50/50 transition-colors h-16 group">
                              <td className="px-8 border-r border-slate-50 font-black text-slate-900 text-sm uppercase">{l.employeeName}</td>
                              <td className="px-8 border-r border-slate-50 text-right font-black text-emerald-600 text-base tabular-nums">{formatINR(l.remainingAmount)}</td>
                              <td className="px-8 text-right">
                                <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-all">
                                  <button onClick={() => handleEditLoan(l)} className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl hover:bg-indigo-600 hover:text-white transition-all shadow-sm" title="Edit Schedule"><Edit2 size={16}/></button>
                                  <button onClick={() => setSelectedLoan(l)} className="p-2.5 bg-amber-50 text-amber-600 rounded-xl hover:bg-amber-600 hover:text-white transition-all shadow-sm" title="Manual Override"><RefreshCw size={16}/></button>
                                  <button onClick={() => handleDeleteLoan(l.id, l.employeeName)} className="p-2.5 bg-rose-50 text-rose-600 rounded-xl hover:bg-rose-600 hover:text-white transition-all shadow-sm" title="Delete Plan"><Trash2 size={16}/></button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {selectedLoan && (
                    <div className="bg-white rounded-[32px] border-2 border-amber-400 p-8 shadow-2xl animate-in slide-in-from-top-4 duration-500 max-w-4xl mx-auto">
                      <div className="flex justify-between items-center mb-6">
                        <div className="flex items-center gap-3">
                          <div className="p-3 bg-amber-100 rounded-2xl text-amber-700"><Info size={24}/></div>
                          <div>
                            <h3 className="font-black text-slate-900 uppercase font-google-sans tracking-tight">Manual Override</h3>
                            <p className="text-[10px] text-amber-600 font-bold uppercase tracking-widest">Adjusting: {selectedLoan.employeeName}</p>
                          </div>
                        </div>
                        <button onClick={() => setSelectedLoan(null)} className="p-2 hover:bg-slate-100 rounded-full text-slate-400 transition-all"><X size={20}/></button>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 items-end">
                        <div className="space-y-1.5">
                          <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Target Month</label>
                          <input type="month" value={overrideForm.month} onChange={e => setOverrideForm({...overrideForm, month: e.target.value})} className="w-full h-12 border border-slate-200 rounded-2xl px-4 font-black text-slate-800 bg-slate-50 focus:ring-2 focus:ring-amber-500 outline-none"/>
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Override EMI (₹)</label>
                          <input type="number" disabled={overrideForm.skip} value={overrideForm.amount} onChange={e => setOverrideForm({...overrideForm, amount: e.target.value})} className="w-full h-12 border border-slate-200 rounded-2xl px-4 font-black text-indigo-600 bg-slate-50 focus:ring-2 focus:ring-amber-500 outline-none disabled:opacity-50"/>
                        </div>
                        <div className="flex items-center gap-3 h-12 bg-amber-50 px-4 rounded-2xl border border-amber-100">
                          <input type="checkbox" id="skipEMI" checked={overrideForm.skip} onChange={e => setOverrideForm({...overrideForm, skip: e.target.checked})} className="w-5 h-5 rounded-lg text-amber-600 border-amber-300 focus:ring-amber-500 transition-all"/>
                          <label htmlFor="skipEMI" className="text-[11px] font-black text-amber-700 uppercase cursor-pointer">Skip EMI</label>
                        </div>
                        <button onClick={() => handleUpdateOverride(selectedLoan.id)} className="h-12 bg-amber-600 text-white font-black rounded-2xl uppercase text-[11px] tracking-widest shadow-lg shadow-amber-600/20 hover:bg-amber-700 active:scale-95 transition-all">Apply Adjustment</button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {loanActiveModule === 'Activity' && (
                <div className="max-w-3xl mx-auto space-y-4 animate-in fade-in duration-500">
                  <div className="bg-white rounded-[32px] border border-gray-200 shadow-xl overflow-hidden p-8">
                    <div className="flex items-center gap-3 mb-8">
                      <div className="p-3 bg-indigo-50 rounded-2xl text-indigo-600"><History size={24}/></div>
                      <h3 className="text-xl font-black text-slate-900 uppercase font-google-sans tracking-tight">Recent Activity</h3>
                    </div>
                    <div className="space-y-6 relative">
                      <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-slate-100"></div>
                      {loanActivities.map((act, i) => (
                        <div key={act.id} className="relative pl-10">
                          <div className={`absolute left-2.5 top-1.5 w-3.5 h-3.5 rounded-full border-2 border-white shadow-sm transition-colors ${
                            act.action === 'Deleted' ? 'bg-rose-500' : act.action === 'Updated' ? 'bg-amber-500' : 'bg-emerald-500'
                          }`}></div>
                          <div className="bg-slate-50/50 rounded-2xl p-4 border border-slate-100 hover:border-indigo-200 transition-all">
                            <div className="flex justify-between items-start gap-4">
                              <span className="text-[13px] font-bold text-slate-800 leading-relaxed">{act.detail}</span>
                              <span className="text-[9px] font-black text-slate-400 uppercase whitespace-nowrap bg-white px-2 py-1 rounded-lg border border-slate-100 shadow-sm">
                                {act.timestamp?.toDate ? act.timestamp.toDate().toLocaleDateString('en-US', { day: '2-digit', month: 'short' }) : 'Just now'}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
