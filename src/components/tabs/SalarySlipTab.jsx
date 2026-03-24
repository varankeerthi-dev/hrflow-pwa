import React, { useState, useEffect, useRef, useMemo } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { useEmployees } from '../../hooks/useEmployees'
import { useSalarySlab } from '../../hooks/useSalarySlab'
import { useAttendance } from '../../hooks/useAttendance'
import { db } from '../../lib/firebase'
import { collection, query, where, getDocs, orderBy, limit, addDoc, serverTimestamp, setDoc, doc, getDoc, updateDoc, deleteDoc } from 'firebase/firestore'
import { formatINR, numberToWords } from '../../lib/salaryUtils'
import Spinner from '../ui/Spinner'
import { Wallet, Search, Download, Plus, History, Settings, AlertCircle, Info, X, CheckCircle2, Edit2, Trash2, Banknote, Clock, ChevronLeft, ChevronRight, FileText, Calendar as CalendarIcon, ChevronDown, ChevronUp } from 'lucide-react'
import { Document, Page, Text, View, StyleSheet, PDFDownloadLink, Image, Font } from '@react-pdf/renderer'
import { logActivity } from '../../hooks/useActivityLog'
import { useQuery } from '@tanstack/react-query'
import { useReactTable, getCoreRowModel, flexRender } from '@tanstack/react-table'

Font.register({ family: 'Inter', src: 'https://fonts.gstatic.com/s/inter/v12/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyfAZ9hiA.woff2' })
Font.register({ family: 'Product Sans', src: 'https://fonts.gstatic.com/s/productsans/v5/HYvgU2fE2nRJfc-7eS3JBrS_WRA.woff2' })

const s = StyleSheet.create({
  p: { padding: 40, fontSize: 10, fontFamily: 'Inter', color: '#111827' },
  h: { borderBottomWidth: 3, borderBottomColor: '#111827', paddingBottom: 15, marginBottom: 20, flexDirection: 'row', justifyContent: 'space-between' },
  t: { fontSize: 24, fontFamily: 'Product Sans', fontWeight: 'bold', textTransform: 'uppercase' }
})

const SalarySlipPDF = ({ data, orgName, orgLogo }) => (
  <Document><Page size="A4" style={s.p}>
    <View style={s.h}><View style={{flexDirection:'row', alignItems:'center', gap:10}}>{orgLogo && <Image src={orgLogo} style={{width:50,height:50}}/>}<Text style={s.t}>{orgName}</Text></View><View style={{textAlign:'right'}}><Text style={{fontSize:16, fontFamily:'Product Sans', fontWeight:'bold'}}>PAYSLIP</Text><Text>{data.month}</Text></View></View>
    <View style={{flexDirection:'row', justifyContent:'space-between', marginBottom:20}}><View><Text>Name: {data.employee.name}</Text><Text>Code: {data.employee.empCode}</Text></View><View style={{width:180,border:2,borderColor:'#059669',borderRadius:8,padding:10,textAlign:'center',backgroundColor:'#F0FDF4'}}><Text style={{fontSize:8,fontWeight:'bold',color:'#047857'}}>NET PAYABLE</Text><Text style={{fontSize:18,fontWeight:'bold',color:'#065F46'}}>{formatINR(data.netPay)}</Text></View></View>
    <View style={{border:2,borderColor:'#111827',borderRadius:8,overflow:'hidden',marginBottom:20}}><View style={{flexDirection:'row',backgroundColor:'#111827',color:'white',padding:8}}><Text style={{flex:1}}>EARNINGS</Text><Text style={{flex:1,textAlign:'right'}}>DEDUCTIONS</Text></View><View style={{flexDirection:'row'}}><View style={{flex:1,borderRightWidth:1}}><View style={{flexDirection:'row',justifyContent:'space-between',padding:8,borderBottomWidth:1,borderColor:'#F9FAFB'}}><Text>Basic</Text><Text>{formatINR(data.basic)}</Text></View><View style={{flexDirection:'row',justifyContent:'space-between',padding:8}}><Text>HRA</Text><Text>{formatINR(data.hra)}</Text></View></View><View style={{flex:1}}><View style={{flexDirection:'row',justifyContent:'space-between',padding:8,borderBottomWidth:1,borderColor:'#F9FAFB'}}><Text>IT/Tax</Text><Text>{formatINR(data.it)}</Text></View><View style={{flexDirection:'row',justifyContent:'space-between',padding:8}}><Text>PF</Text><Text>{formatINR(data.pf)}</Text></View>{data.loanEMI>0 && <View style={{flexDirection:'row',justifyContent:'space-between',padding:8,backgroundColor:'#FEF2F2'}}><Text>Loan Recovery</Text><Text>{formatINR(data.loanEMI)}</Text></View>}</View></View></View>
    <View style={{textAlign:'center',paddingTop:20,borderTopWidth:1,borderColor:'#F3F4F6',borderStyle:'dashed'}}><Text>In Words: Indian Rupee {numberToWords(data.netPay)} Only</Text></View>
  </Page></Document>
)

const AttendanceSummaryPDF = ({ data, month, orgName }) => (
  <Document>
    <Page size="A4" orientation="landscape" style={{ padding: 30, fontSize: 8, fontFamily: 'Inter' }}>
      <View style={{ marginBottom: 20, borderBottom: 2, borderColor: '#000', paddingBottom: 10, flexDirection: 'row', justifyContent: 'space-between' }}>
        <View>
          <Text style={{ fontSize: 18, fontWeight: 'bold' }}>{orgName}</Text>
          <Text style={{ fontSize: 10, marginTop: 4 }}>ATTENDANCE SUMMARY - {new Date(month + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</Text>
        </View>
      </View>
      <View style={{ border: 1, borderColor: '#000' }}>
        <View style={{ flexDirection: 'row', backgroundColor: '#f3f4f6', fontWeight: 'bold', borderBottom: 1 }}>
          <Text style={{ width: 25, padding: 4, borderRight: 1 }}>S.No</Text>
          <Text style={{ flex: 2, padding: 4, borderRight: 1 }}>Employee Name</Text>
          <Text style={{ width: 45, padding: 4, borderRight: 1 }}>Emp ID</Text>
          <Text style={{ width: 30, padding: 4, borderRight: 1 }}>Days</Text>
          <Text style={{ width: 35, padding: 4, borderRight: 1 }}>Worked</Text>
          <Text style={{ width: 90, padding: 4, borderRight: 1, textAlign: 'center' }}>HOLIDAYS (Sun/Hol/Tot)</Text>
          <Text style={{ width: 60, padding: 4, borderRight: 1, textAlign: 'center' }}>LEAVE (Appr/LOP)</Text>
          <Text style={{ width: 30, padding: 4, borderRight: 1 }}>OT</Text>
          <Text style={{ width: 70, padding: 4, borderRight: 1, textAlign: 'center' }}>HOL. WK (Sun/Hol)</Text>
          <Text style={{ width: 45, padding: 4 }}>PAY DAYS</Text>
        </View>
        {data.map((row, i) => (
          <View key={i} style={{ flexDirection: 'row', borderBottom: 1 }}>
            <Text style={{ width: 25, padding: 4, borderRight: 1 }}>{row.sno}</Text>
            <Text style={{ flex: 2, padding: 4, borderRight: 1 }}>{row.name}</Text>
            <Text style={{ width: 45, padding: 4, borderRight: 1 }}>{row.empId}</Text>
            <Text style={{ width: 30, padding: 4, borderRight: 1 }}>{row.totalDays}</Text>
            <Text style={{ width: 35, padding: 4, borderRight: 1 }}>{row.worked}</Text>
            <Text style={{ width: 90, padding: 4, borderRight: 1, textAlign: 'center' }}>{row.sunday} / {row.holidays} / {row.totalHolidays}</Text>
            <Text style={{ width: 60, padding: 4, borderRight: 1, textAlign: 'center' }}>{row.leave} / {row.lop}</Text>
            <Text style={{ width: 30, padding: 4, borderRight: 1 }}>{row.ot}</Text>
            <Text style={{ width: 70, padding: 4, borderRight: 1, textAlign: 'center' }}>{row.sunW} / {row.holW}</Text>
            <Text style={{ width: 45, padding: 4 }}>{row.totalWorkingDays}</Text>
          </View>
        ))}
      </View>
    </Page>
  </Document>
)

export default function SalarySlipTab() {
  const { user } = useAuth(), { employees } = useEmployees(user?.orgId, true), { slabs, increments } = useSalarySlab(user?.orgId), { fetchByDate } = useAttendance(user?.orgId)
  const isAdmin = user?.role?.toLowerCase() === 'admin'
  const [activeTab, setActiveTab] = useState('salary-summary'), [selectedEmp, setSelectedEmp] = useState(''), [selectedMonth, setSelectedMonth] = useState(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` })
  const [summaryMonth, setSummaryMonth] = useState(selectedMonth)
  const [loading, setLoading] = useState(false), [slipData, setSlipData] = useState(null), [genErr, setGenErr] = useState(''), [orgLogo, setOrgLogo] = useState('')
  const [loans, setLoans] = useState([]), [loanForm, setEditLoanForm] = useState({ employeeId: '', totalAmount: '', emiAmount: '', startMonth: '', remarks: '' }), [editingLoanId, setEditingLoanId] = useState(null), [selectedLoan, setSelectedLoan] = useState(null), [overrideForm, setOverrideForm] = useState({ month: '', amount: 0, reason: '', skip: false }), [loanActivities, setLoanActivities] = useState([])
  const [isAttendanceSummaryOpen, setIsAttendanceSummaryOpen] = useState(true)
  const [summaryEmpDetail, setSummaryEmpDetail] = useState(null)
  const [isDetailPanelOpen, setIsDetailPanelOpen] = useState(false)
  const monthInputRef = useRef(null)

  const calcEMI = (l, m) => { if (l.status !== 'Active' || l.remainingAmount <= 0 || l.startMonth > m) return 0; const o = l.monthOverrides?.[m]; if (o) return o.skip ? 0 : Math.min(o.amount, l.remainingAmount); return Math.min(l.emiAmount, l.remainingAmount) }

  const { data: attendanceSummaryData = [], isLoading: isAttendanceLoading, refetch: refetchSummary } = useQuery({
    queryKey: ['attendanceSummary', user?.orgId, summaryMonth],
    queryFn: async () => {
      if (!user?.orgId || !employees.length) return []
      const [y, m] = summaryMonth.split('-').map(Number)
      const daysInMonth = new Date(y, m, 0).getDate()
      const sd = `${summaryMonth}-01`, ed = `${summaryMonth}-${daysInMonth}`
      const [aSnap, slabSnap, loanSnap, advSnap, fineSnap] = await Promise.all([
        getDocs(query(collection(db, 'organisations', user.orgId, 'attendance'), where('date', '>=', sd), where('date', '<=', ed))),
        getDocs(collection(db, 'organisations', user.orgId, 'salaryIncrements')),
        getDocs(query(collection(db, 'organisations', user.orgId, 'loans'), where('status', '==', 'Active'))),
        getDocs(query(collection(db, 'organisations', user.orgId, 'advances_expenses'), where('date', '>=', sd), where('date', '<=', ed))),
        getDocs(query(collection(db, 'organisations', user.orgId, 'fines'), where('date', '>=', sd), where('date', '<=', ed)))
      ])
      const allAttendance = aSnap.docs.map(d => d.data())
      const allIncrements = slabSnap.docs.map(d => d.data())
      const allLoans = loanSnap.docs.map(d => ({ id: d.id, ...d.data() }))
      const allAdvExp = advSnap.docs.map(d => d.data())
      const allFines = fineSnap.docs.map(d => d.data())
      
      return employees.map((emp, idx) => {
        const empAtt = allAttendance.filter(a => a.employeeId === emp.id)
        let worked = 0, sun = 0, hol = 0, leave = 0, lop = 0, otH = 0, sunW = 0, holW = 0
        for (let i = 1; i <= daysInMonth; i++) {
          const dateStr = `${summaryMonth}-${String(i).padStart(2, '0')}`, d = new Date(y, m - 1, i), isSunday = d.getDay() === 0, r = empAtt.find(a => a.date === dateStr)
          if (isSunday) sun++
          if (r) { if (r.isAbsent) lop++; else if (r.sundayWorked) { sunW++; worked++ } else if (r.holidayWorked) { holW++; worked++ } else if (r.sundayHoliday) hol++; else worked++; if (r.otHours) { const [h, mi] = r.otHours.split(':').map(Number); otH += (h || 0) + (mi || 0) / 60 } }
          else if (!isSunday) lop++
        }
        const slab = allIncrements.filter(i => i.employeeId === emp.id && i.effectiveFrom <= summaryMonth).sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0] || slabs[emp.id] || { totalSalary: 0, basicPercent: 40, hraPercent: 20, incomeTaxPercent: 0, pfPercent: 0 }
        const ts = Number(slab.totalSalary) || 0, minH = Number(emp.minDailyHours) || 8, paidDays = daysInMonth - lop
        const basic = ts * (slab.basicPercent / 100) * (paidDays / daysInMonth), hra = ts * (slab.hraPercent / 100) * (paidDays / daysInMonth), pf = ts * (slab.pfPercent / 100), it = ts * (slab.incomeTaxPercent / 100), otPay = otH * ((ts / daysInMonth) / minH)
        const loanE = allLoans.filter(l => l.employeeId === emp.id).reduce((s, l) => s + calcEMI(l, summaryMonth), 0), adv = allAdvExp.filter(a => a.employeeId === emp.id && a.type === 'Advance').reduce((s, a) => s + Number(a.amount), 0), reimb = allAdvExp.filter(a => a.employeeId === emp.id && a.type === 'Expense' && a.hrApproval === 'Approved').reduce((s, a) => s + Number(a.amount), 0), fine = allFines.filter(f => f.employeeId === emp.id).reduce((s, f) => s + Number(f.amount), 0)
        const earnings = [{ label: 'Basic', value: basic }, { label: 'HRA', value: hra }, { label: 'OT Est.', value: otPay }, { label: 'Reimb.', value: reimb }].filter(e => e.value > 0)
        const deductions = [{ label: 'PF', value: pf }, { label: 'IT', value: it }, { label: 'Loan', value: loanE }, { label: 'Adv.', value: adv }, { label: 'Fine', value: fine }].filter(d => d.value > 0)
        const net = earnings.reduce((s, e) => s + e.value, 0) - deductions.reduce((s, d) => s + d.value, 0)
        return { sno: idx + 1, id: emp.id, name: emp.name, empId: emp.empCode || emp.id.slice(0, 5), totalDays: daysInMonth, worked, sunday: sun, holidays: hol, totalHolidays: sun + hol, leave, lop, ot: otH.toFixed(2), sunW, holW, totalWorkingDays: Math.max(0, paidDays), salary: { earnings, deductions, net } }
      })
    },
    enabled: !!user?.orgId && employees.length > 0 && activeTab === 'salary-summary'
  })

  const columns = useMemo(() => [
    { accessorKey: 'sno', header: 'S.No', size: 15, cell: info => <div className="text-center">{info.getValue()}</div> },
    { accessorKey: 'name', header: 'Employee Name', cell: info => <button onClick={() => { setSummaryEmpDetail(info.row.original); setIsDetailPanelOpen(true); }} className="text-left font-bold text-indigo-600 hover:text-indigo-800 px-1 truncate w-[150px] block">{info.getValue()}</button> },
    { accessorKey: 'totalDays', header: 'Total\nDays', size: 18, cell: info => <div className="text-center font-bold" style={{ color: 'oklch(62.3% 0.214 259.815)' }}>{info.getValue()}</div> },
    { accessorKey: 'worked', header: 'Worked', size: 20, cell: info => <div className="text-center">{info.getValue()}</div> },
    { accessorKey: 'sunday', header: 'Sunday', size: 30 },
    { accessorKey: 'holidays', header: 'Holiday', size: 30 },
    { accessorKey: 'totalHolidays', header: 'Tot', size: 22 },
    { accessorKey: 'leave', header: 'Appro', size: 30 },
    { accessorKey: 'lop', header: 'LOP', size: 25 },
    { accessorKey: 'ot', header: 'OT', size: 25 },
    { accessorKey: 'sunW', header: 'SUN', size: 28 },
    { accessorKey: 'holW', header: 'HOL', size: 28 },
    { accessorKey: 'totalWorkingDays', header: 'PAY DAYS', size: 30 },
  ], [])

  const table = useReactTable({ data: attendanceSummaryData, columns, getCoreRowModel: getCoreRowModel() })

  useEffect(() => { if (!user?.orgId) return; getDoc(doc(db, 'organisations', user.orgId)).then(snap => { if (snap.exists()) setOrgLogo(snap.data().logoURL || '') }); fetchLoans() }, [user?.orgId])
  
  const fetchLoans = async () => { try { const q = query(collection(db, 'organisations', user.orgId, 'loans'), orderBy('createdAt', 'desc')); const snap = await getDocs(q); setLoans(snap.docs.map(d => ({ id: d.id, ...d.data() }))); const actSnap = await getDocs(query(collection(db, 'organisations', user.orgId, 'activityLogs'), where('module', '==', 'Loans'), orderBy('timestamp', 'desc'), limit(5))); setLoanActivities(actSnap.docs.map(d => ({ id: d.id, ...d.data() }))) } catch (e) { console.error(e) } }
  const handleCreateLoan = async () => { if (!loanForm.employeeId || !loanForm.totalAmount || !loanForm.emiAmount) return alert('Fill fields'); setLoading(true); try { const emp = employees.find(e => e.id === loanForm.employeeId); const docD = { ...loanForm, employeeName: emp?.name || 'Unknown', totalAmount: Number(loanForm.totalAmount), emiAmount: Number(loanForm.emiAmount), updatedAt: serverTimestamp() }; if (editingLoanId) { await updateDoc(doc(db, 'organisations', user.orgId, 'loans', editingLoanId), docD); await logActivity(user.orgId, user, { module: 'Loans', action: 'Updated', detail: `Updated for ${emp?.name}` }) } else { await addDoc(collection(db, 'organisations', user.orgId, 'loans'), { ...docD, remainingAmount: docD.totalAmount, status: 'Active', monthOverrides: {}, createdAt: serverTimestamp(), createdBy: user.uid }); await logActivity(user.orgId, user, { module: 'Loans', action: 'Created', detail: `Created \u20B9${docD.totalAmount} for ${emp?.name}` }) }; setEditLoanForm({ employeeId: '', totalAmount: '', emiAmount: '', startMonth: '', remarks: '' }); setEditingLoanId(null); setSlipData(null); fetchLoans(); alert('Success') } catch (e) { alert(e.message) } finally { setLoading(false) } }
  const handleEditLoan = (l) => { setEditingLoanId(l.id); setEditLoanForm({ employeeId: l.employeeId, totalAmount: l.totalAmount, emiAmount: l.emiAmount, startMonth: l.startMonth, remarks: l.remarks || '' }) }
  const handleDeleteLoan = async (id, name) => { if (!isAdmin || !confirm(`Delete for ${name}?`)) return; try { await deleteDoc(doc(db, 'organisations', user.orgId, 'loans', id)); await logActivity(user.orgId, user, { module: 'Loans', action: 'Deleted', detail: `Deleted for ${name}` }); setSlipData(null); fetchLoans(); alert('Deleted') } catch (e) { alert(e.message) } }
  const handleUpdateOverride = async (id) => { if (!overrideForm.month) return alert('Select month'); try { const r = doc(db, 'organisations', user.orgId, 'loans', id), s = await getDoc(r); await updateDoc(r, { monthOverrides: { ...(s.data()?.monthOverrides || {}), [overrideForm.month]: { amount: overrideForm.skip ? 0 : Number(overrideForm.amount), skip: overrideForm.skip, reason: overrideForm.reason } } }); fetchLoans(); setOverrideForm({ month: '', amount: 0, reason: '', skip: false }) } catch (e) { alert(e.message) } }

  const handleGenerate = async () => {
    if (!selectedEmp || !selectedMonth) return; setLoading(true); setGenErr('')
    try {
      const sid = `${selectedEmp}_${selectedMonth}`, sSnap = await getDoc(doc(db, 'organisations', user.orgId, 'salarySlips', sid));
      if (sSnap.exists()) { setSlipData(sSnap.data()); setLoading(false); return };
      const emp = employees.find(e => e.id === selectedEmp); if (!emp) return setLoading(false);
      const [y, m] = selectedMonth.split('-').map(Number), end = new Date(y, m, 0).getDate(), sd = `${selectedMonth}-01`, ed = `${selectedMonth}-${end}`
      const aData = (await getDocs(query(collection(db, 'organisations', user.orgId, 'attendance'), where('employeeId', '==', selectedEmp)))).docs.map(d => d.data()).filter(a => a.date >= sd && a.date <= ed)
      const slab = increments.filter(i => i.employeeId === selectedEmp && i.effectiveFrom <= selectedMonth).sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0] || slabs[selectedEmp] || { totalSalary: 0, basicPercent: 40, hraPercent: 20, incomeTaxPercent: 0, pfPercent: 0 }
      const ts = Number(slab.totalSalary) || 0, minH = Number(emp.minDailyHours) || 8
      let paid = 0, lop = 0, aOT = 0, sun = 0, sunW = 0, holW = 0, grid = []
      for (let i = 1; i <= end; i++) {
        const d = new Date(y, m - 1, i), ds = d.toISOString().split('T')[0], isS = d.getDay() === 0, r = aData.find(a => a.date === ds);
        let t = isS ? 'Sunday' : 'Absent'; if (isS) sun++
        if (r) { if (r.isAbsent) t = 'Absent'; else if (r.sundayWorked) { t = 'Sunday Working'; sunW++ } else if (r.sundayHoliday) { t = 'Sunday Holiday'; holW++ } else t = 'Working'; if (r.otHours) { const [h, mi] = r.otHours.split(':').map(Number); aOT += (h || 0) + (mi || 0) / 60 } }
        if (t === 'Absent') lop++; else paid++; grid.push({ date: i, type: t, ds })
      }
      const otS = await getDocs(query(collection(db, 'organisations', user.orgId, 'otApprovals'), where('employeeId', '==', selectedEmp), where('month', '==', selectedMonth))), fOT = otS.docs.map(d => d.data()).find(o => o.status === 'approved')?.finalOTHours || aOT
      const otP = fOT * ((ts / end) / minH), adv = (await getDocs(query(collection(db, 'organisations', user.orgId, 'advances'), where('employeeId', '==', selectedEmp)))).docs.map(d => d.data()).filter(a => a.status !== 'Recovered').reduce((s, c) => s + Number(c.amount), 0)
      const emi = (await getDocs(query(collection(db, 'organisations', user.orgId, 'loans'), where('employeeId', '==', selectedEmp), where('status', '==', 'Active')))).docs.map(d => d.data()).reduce((s, l) => s + calcEMI(l, selectedMonth), 0)

      // PHASE 3: Combined Expenses (Paid + Approved With Salary)
      const expSnap = await getDocs(query(
        collection(db, 'organisations', user.orgId, 'advances_expenses'), 
        where('employeeId', '==', selectedEmp), 
        where('type', '==', 'Expense')
      ))
      const allExpenses = expSnap.docs.map(d => d.data())

      const reimb = allExpenses.filter(i => {
        // 1. Immediate Payouts that were Paid in this month
        const isPaidThisMonth = i.paymentStatus === 'Paid' && i.paidAt?.toDate && 
                               i.paidAt.toDate().getFullYear() === y && 
                               (i.paidAt.toDate().getMonth() + 1) === m

        // 2. 'With Salary' items that are Approved and match the salary month
        const isWithSalaryApproved = i.payoutMethod === 'With Salary' && 
                                    i.status === 'Approved' && 
                                    i.paymentStatus !== 'Paid' &&
                                    i.date?.startsWith(selectedMonth)

        return isPaidThisMonth || isWithSalaryApproved
      }).reduce((s, c) => s + Number(c.partialAmount || c.amount), 0)

      const b = ts * (slab.basicPercent / 100) * (paid / end), h = ts * (slab.hraPercent / 100) * (paid / end), p = ts * (slab.pfPercent / 100), it = ts * (slab.incomeTaxPercent / 100), g = b + h + otP + reimb, de = p + it + adv + emi
      setSlipData({ employee: emp, month: selectedMonth, slab, grid, paidDays: paid, lopDays: lop, autoOTHours: aOT, finalOT: fOT, otPay: otP, basic: b, hra: h, expenseReimbursement: reimb, grossEarnings: g, pf: p, it, advanceDeduction: adv, loanEMI: emi, totalDeductions: de, netPay: Math.max(0, g - de), sundayCount: sun, sundayWorkedCount: sunW, holidayWorkedCount: holW })    } catch (e) { setGenErr(e.message) } finally { setLoading(false) }
  }

  const handleFinalizeSlip = async () => {
    if (!slipData) return; setLoading(true)
    try {
      const sid = `${slipData.employee.id}_${slipData.month}`; 
      await setDoc(doc(db, 'organisations', user.orgId, 'salarySlips', sid), { ...slipData, finalizedAt: serverTimestamp(), finalizedBy: user.uid })
      
      // PHASE 3: Auto-Settle 'With Salary' Expenses
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
          if (de > 0) { const nr = Math.max(0, d.remainingAmount - de); await updateDoc(ld.ref, { remainingAmount: nr, status: nr <= 0 ? 'Closed' : 'Active', updatedAt: serverTimestamp() }); await logActivity(user.orgId, user, { module: 'Loans', action: 'EMI Deducted', detail: `\u20B9${de} for ${slipData.employee.name}` }) }
        }
      }
      alert('Recorded'); fetchLoans()
    } catch (e) { alert(e.message) } finally { setLoading(false) }
  }

  return (
    <div className="flex h-full bg-[#fbfbfb] -m-6 font-inter text-gray-900 overflow-hidden">
      <div className="w-[160px] bg-white border-r border-gray-200 flex flex-col pt-8 shrink-0">
        <div className="px-4 mb-8 font-google-sans text-[8px] font-bold uppercase tracking-widest text-gray-400">Payroll Engine</div>
        <nav className="flex-1 space-y-1 px-2">
          {[{id:'salary-slip', icon:<Banknote size={12}/>, label:'Salary Slip'}, {id:'salary-summary', icon:<FileText size={12}/>, label:'Salary Summary'}, {id:'loan', icon:<Wallet size={12}/>, label:'Loan Management'}].map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)} className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg transition-all ${activeTab === t.id ? 'bg-emerald-600 text-white shadow-md' : 'text-gray-500 hover:bg-gray-50'}`}>{t.icon}<span className="text-[9px] font-bold">{t.label}</span></button>
          ))}
        </nav>
      </div>
      <div className="flex-1 min-w-0 p-3 h-full overflow-hidden flex flex-col">
        {activeTab === 'salary-slip' && (
          <div className="max-w-6xl mx-auto space-y-6 h-full overflow-auto p-4 w-full">
            <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex flex-wrap gap-6 items-end shrink-0">
              <div className="flex-1 min-w-[240px] font-google-sans uppercase text-[9px] font-bold text-gray-400">Target Employee<select value={selectedEmp} onChange={e => setSelectedEmp(e.target.value)} className="w-full h-10 border border-gray-200 rounded-lg px-3 text-[12px] font-semibold bg-white outline-none mt-1.5 text-gray-900 normal-case">{employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}</select></div>
              <div className="w-[180px] font-google-sans uppercase text-[9px] font-bold text-gray-400">Pay Period<input type="month" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} className="w-full h-10 border border-gray-200 rounded-lg px-3 text-[12px] font-bold mt-1.5 text-gray-900 normal-case" /></div>
              <button onClick={handleGenerate} disabled={loading || !selectedEmp} className="h-10 px-8 bg-gray-900 text-white font-bold rounded-lg uppercase tracking-[0.1em] text-[9px] shadow-lg hover:bg-black transition-all">Generate</button>
            </div>
            {slipData && (
              <div className="bg-white border border-gray-200 shadow-xl rounded-2xl overflow-hidden relative mx-auto flex-1 overflow-auto" style={{ width: '100%', minWidth: '850px' }}>
                <div className="flex justify-end gap-2 p-3 bg-gray-50 border-b border-gray-100 no-print sticky top-0 z-10"><PDFDownloadLink key={`${slipData.employee.id}_${slipData.month}`} document={<SalarySlipPDF data={slipData} orgName={user?.orgName} orgLogo={orgLogo} />} fileName={`SalarySlip_${slipData.employee.name.replace(/\s+/g, '_')}.pdf`} className="h-8 bg-white border border-gray-200 text-gray-700 px-3 rounded-lg text-[10px] font-bold uppercase flex items-center gap-1.5 hover:bg-gray-50">{({ loading }) => <><Download size={12} />{loading ? 'Wait...' : 'Export'}</>}</PDFDownloadLink><button onClick={handleFinalizeSlip} className="h-8 bg-gray-900 text-white px-5 rounded-lg text-[10px] font-bold uppercase tracking-[0.1em] shadow-lg flex items-center gap-1.5 active:scale-95"><CheckCircle2 size={12} /> Confirm</button></div>
                <div className="p-12 bg-white">
                  <div className="border-b-4 border-gray-900 pb-6 mb-8 flex justify-between items-start"><div className="flex items-center gap-5">{orgLogo && <img src={orgLogo} alt="Logo" className="w-16 h-16 object-contain" />}<div><h1 className="text-3xl font-bold text-gray-900 uppercase font-google-sans tracking-tighter leading-none">{user?.orgName}</h1><p className="text-[10px] text-gray-400 font-bold uppercase tracking-[0.2em] mt-3">Employee Remuneration Advice</p></div></div><div className="text-right"><h2 className="text-xl font-bold text-gray-800 uppercase font-google-sans tracking-tight">Payslip</h2><p className="text-[11px] font-bold text-gray-500 mt-1">{new Date(slipData.month + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</p></div></div>
                  <div className="flex justify-between items-start mb-8"><div className="space-y-2.5 text-[12px] font-google-sans uppercase text-[10px] font-bold text-gray-900 border-b-2 border-gray-900 pb-1 inline-block">Identification<div className="flex gap-6 mt-3 text-gray-800 normal-case tracking-normal font-inter"><span className="w-32 text-gray-400 font-bold uppercase text-[10px]">Name</span><span className="font-bold">: {slipData.employee.name}</span></div><div className="flex gap-6 text-gray-800 normal-case tracking-normal font-inter"><span className="w-32 text-gray-400 font-bold uppercase text-[10px]">Code</span><span className="font-bold">: {slipData.employee.empCode}</span></div></div><div className="bg-gray-900 text-white rounded-xl p-5 text-center min-w-[200px] shadow-2xl"><p className="text-[9px] font-bold text-gray-400 uppercase mb-1.5 font-google-sans">Net Payable (INR)</p><p className="text-2xl font-bold font-google-sans tracking-tighter">{formatINR(slipData.netPay)}</p></div></div>
                  <div className="border-2 border-gray-900 rounded-2xl overflow-hidden mb-8 font-inter"><div className="grid grid-cols-2 bg-gray-900 font-google-sans font-bold text-[11px] uppercase text-white"><div className="p-4 flex justify-between">Earnings<span>INR</span></div><div className="p-4 flex justify-between border-l border-gray-800">Deductions<span>INR</span></div></div><div className="grid grid-cols-2 divide-x-2 divide-gray-900"><div className="p-0 text-gray-600 font-medium text-[12px]"><div className="flex justify-between p-4 border-b border-gray-50">Basic Salary<span className="font-bold text-gray-900">{formatINR(slipData.basic)}</span></div><div className="flex justify-between p-4 border-b border-gray-50">HRA<span className="font-bold text-gray-900">{formatINR(slipData.hra)}</span></div>{slipData.otPay > 0 && <div className="flex justify-between p-4 text-indigo-600 font-bold bg-indigo-50/20 font-google-sans uppercase text-[10px] tracking-widest">Overtime<span className="font-bold">{formatINR(slipData.otPay)}</span></div>}</div><div className="p-0 text-gray-600 font-medium text-[12px]"><div className="flex justify-between p-4 border-b border-gray-50">Tax / IT<span className="font-bold text-gray-900">{formatINR(slipData.it)}</span></div><div className="flex justify-between p-4 border-b border-gray-50">Provident Fund<span className="font-bold text-gray-900">{formatINR(slipData.pf)}</span></div>{slipData.loanEMI > 0 && <div className="flex justify-between p-4 text-red-600 font-bold bg-red-50/20 font-google-sans uppercase text-[10px] tracking-widest">Loan Recovery<span className="font-bold">{formatINR(slipData.loanEMI)}</span></div>}</div></div><div className="grid grid-cols-2 divide-x-2 divide-gray-900 bg-gray-50 border-t-2 border-gray-900 font-bold font-google-sans uppercase text-[11px] text-gray-900"><div className="p-4 flex justify-between">Total Earnings<span>{formatINR(slipData.grossEarnings)}</span></div><div className="p-4 flex justify-between">Total Deductions<span>{formatINR(slipData.totalDeductions)}</span></div></div></div>
                  <div className="text-center pt-8 border-t-2 border-dashed border-gray-100"><p className="text-[12px] font-medium text-gray-700 italic font-inter">Amount in words: <span className="uppercase text-gray-900 not-italic font-bold tracking-tight">Indian Rupee {numberToWords(slipData.netPay)} Only</span></p><p className="text-[9px] text-gray-400 mt-8 font-bold uppercase tracking-[0.4em] opacity-40 font-google-sans">System Authenticated Document</p></div>
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
                  <button onClick={() => setIsAttendanceSummaryOpen(!isAttendanceSummaryOpen)} className="flex justify-between items-center bg-white p-2 rounded border border-gray-200 shadow-sm shrink-0 w-full hover:border-indigo-200 transition-all group"><div className="flex items-center gap-2"><div className="w-6 h-6 rounded bg-gray-900 flex items-center justify-center text-white group-hover:bg-indigo-600 transition-colors"><Clock size={12} /></div><p className="text-[10px] font-bold text-gray-900 uppercase font-google-sans tracking-tight">Attendance Summary</p></div><div className="flex items-center gap-2"><PDFDownloadLink document={<AttendanceSummaryPDF data={attendanceSummaryData} month={summaryMonth} orgName={user?.orgName} />} fileName={`Attendance_Summary_${summaryMonth}.pdf`} onClick={e => e.stopPropagation()} className="h-6 bg-indigo-600 text-white px-2 rounded text-[8px] font-bold uppercase tracking-widest flex items-center gap-1 hover:bg-indigo-700 shadow-sm transition-all active:scale-95">{({ loading }) => <><Download size={10} /> {loading ? '...' : 'Export'}</>}</PDFDownloadLink><div className="h-4 w-px bg-gray-200 mx-1" /><button onClick={(e) => { e.stopPropagation(); setIsDetailPanelOpen(!isDetailPanelOpen); }} className={`p-1 rounded transition-all ${isDetailPanelOpen ? 'bg-indigo-100 text-indigo-600' : 'hover:bg-gray-100 text-gray-400'}`} title={isDetailPanelOpen ? "Close Details" : "Open Details"}><Info size={14} /></button>{isAttendanceSummaryOpen ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}</div></button>
                  <div className={`bg-white rounded border border-gray-200 shadow-sm overflow-hidden flex-col flex-1 min-h-0 ${!isAttendanceSummaryOpen ? 'hidden' : 'flex'}`}><div className="overflow-auto flex-1">
                    <table className="w-full border-collapse text-[14px] font-inter table-auto">
                      <thead className="sticky top-0 z-10">
                        {table.getHeaderGroups().map((headerGroup) => (
                          <tr key={headerGroup.id}>
                            {headerGroup.headers.map(header => (
                              <th 
                                key={header.id} 
                                colSpan={header.colSpan} 
                                className="px-1 py-2 border border-gray-200 bg-gray-50 text-gray-700 font-black uppercase text-center whitespace-pre-line break-words leading-tight"
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
                            <tr key={row.id} className={`hover:bg-indigo-50/30 transition-colors odd:bg-gray-50/30 ${summaryEmpDetail?.id === row.original.id ? 'bg-indigo-50' : ''}`}>
                              {row.getVisibleCells().map(cell => (<td key={cell.id} className="px-1 py-1.5 border border-gray-100 text-gray-600 font-medium text-center whitespace-nowrap">{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>))}
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div></div>
                </div>
                <div className="flex-1 bg-white/40 rounded border-2 border-dashed border-gray-200 flex flex-col items-center justify-center text-gray-300 min-h-0"><div className="text-center"><Plus size={24} strokeWidth={1} className="mx-auto mb-1.5 opacity-20" /><p className="text-[8px] font-bold uppercase tracking-[0.2em]">Secondary Analysis Area</p></div></div>
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
          <div className="max-w-6xl mx-auto space-y-6 h-full overflow-auto font-inter p-4">
            <div className="flex justify-between items-center border-b border-gray-200 pb-4"><div><h1 className="text-xl font-bold text-gray-900 font-google-sans tracking-tight">Loan Management</h1><p className="text-[11px] text-gray-500 font-medium">Lifecycle tracking for advances.</p></div><button onClick={() => { setEditingLoanId(null); setEditLoanForm({ employeeId: '', totalAmount: '', emiAmount: '', startMonth: selectedMonth, remarks: '' }); }} className="h-9 px-5 bg-gray-900 text-white font-bold rounded-lg text-[10px] uppercase tracking-widest shadow-lg flex items-center gap-2 hover:bg-black active:scale-95"><Plus size={14} /> New Schedule</button></div>
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
              <div className="space-y-6"><div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5"><div className="flex items-center gap-2 text-gray-900 mb-5 font-bold uppercase text-[10px] font-google-sans tracking-widest"><Settings size={14} /> Configuration</div><div className="space-y-4"><div className="uppercase text-[9px] font-bold text-gray-400 font-google-sans">Employee<select value={loanForm.employeeId} onChange={e => setEditLoanForm({...loanForm, employeeId: e.target.value})} className="w-full h-9 border border-gray-200 rounded-lg px-3 bg-gray-50/50 mt-1.5 text-gray-900 font-semibold">{employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}</select></div><div className="grid grid-cols-2 gap-4"><div className="uppercase text-[9px] font-bold text-gray-400 font-google-sans">Principal<input type="number" value={loanForm.totalAmount} onChange={e => setEditLoanForm({...loanForm, totalAmount: e.target.value})} className="w-full h-9 border border-gray-200 rounded-lg px-3 font-bold bg-gray-50/50 mt-1.5 text-gray-900" /></div><div className="uppercase text-[9px] font-bold text-gray-400 font-google-sans">EMI<input type="number" value={loanForm.emiAmount} onChange={e => setEditLoanForm({...loanForm, emiAmount: e.target.value})} className="w-full h-9 border border-gray-200 rounded-lg px-3 font-bold bg-gray-50/50 mt-1.5 text-gray-900" /></div></div><button onClick={handleCreateLoan} disabled={loading} className="w-full h-10 bg-gray-900 text-white font-bold rounded-lg uppercase text-[10px] shadow-xl hover:bg-black active:scale-[0.98]">{editingLoanId ? 'Update' : 'Activate'}</button></div></div><div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5"><div className="flex items-center gap-2 text-gray-900 mb-5 font-bold uppercase text-[10px] font-google-sans tracking-widest"><History size={14} /> Activity</div><div className="space-y-3">{loanActivities.map(act => (<div key={act.id} className="flex gap-2 border-l-2 border-gray-100 pl-3 py-1"><div className="flex-1 text-[10px] font-bold text-gray-800">{act.detail}</div></div>))}</div></div></div>
              <div className="xl:col-span-2 space-y-6"><div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden"><div className="px-5 py-3 border-b border-gray-100 bg-gray-50/30 font-google-sans font-bold uppercase text-[10px] tracking-widest text-gray-900">Active Schedules</div><div className="overflow-x-auto"><table className="w-full text-left border-collapse font-inter"><thead><tr className="bg-gray-50/50 text-[9px] font-bold uppercase text-gray-400 border-b border-gray-100"><th className="px-5 py-3">Employee</th><th className="px-5 py-3 text-right">Remaining</th><th className="px-5 py-3 text-right">Actions</th></tr></thead><tbody className="divide-y divide-gray-50">{loans.map(l => (<tr key={l.id} className="hover:bg-gray-50 transition-colors"><td className="px-5 py-3 font-bold text-gray-900 text-[12px]">{l.employeeName}</td><td className="px-5 py-3 text-right font-bold text-emerald-600 font-google-sans">{formatINR(l.remainingAmount)}</td><td className="px-5 py-3 text-right"><div className="flex justify-end gap-1"><button onClick={() => handleEditLoan(l)} className="p-1.5 hover:bg-gray-100 rounded-lg transition-all"><Edit2 size={12}/></button><button onClick={() => setSelectedLoan(l)} className="p-1.5 hover:bg-amber-50 text-amber-600 rounded-lg transition-all"><AlertCircle size={12}/></button><button onClick={() => handleDeleteLoan(l.id, l.employeeName)} className="p-1.5 hover:bg-red-50 text-red-600 rounded-lg transition-all"><Trash2 size={12}/></button></div></td></tr>))}</tbody></table></div></div>
              {selectedLoan && (<div className="bg-white rounded-xl border-2 border-amber-200 p-5 space-y-4 shadow-lg animate-in slide-in-from-top-4 duration-300 font-inter"><div className="flex justify-between items-center border-b border-amber-100 pb-3 font-google-sans"><div className="flex items-center gap-2 text-amber-700 font-bold uppercase text-[10px] tracking-widest"><Info size={14}/> Override: {selectedLoan.employeeName}</div><button onClick={() => setSelectedLoan(null)} className="text-gray-400 hover:text-gray-900"><X size={14}/></button></div><div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end"><div className="uppercase text-[8px] font-bold text-gray-400">Month<input type="month" value={overrideForm.month} onChange={e => setOverrideForm({...overrideForm, month: e.target.value})} className="w-full h-9 border border-gray-200 rounded-lg px-2 font-bold mt-1 text-gray-900 outline-none"/></div><div className="uppercase text-[8px] font-bold text-gray-400">EMI (\u20B9)<input type="number" disabled={overrideForm.skip} value={overrideForm.amount} onChange={e => setOverrideForm({...overrideForm, amount: e.target.value})} className="w-full h-9 border border-gray-200 rounded-lg px-2 font-bold mt-1 text-gray-900 disabled:opacity-50 outline-none"/></div><div className="flex items-center gap-2 h-9 mb-0.5"><input type="checkbox" checked={overrideForm.skip} onChange={e => setOverrideForm({...overrideForm, skip: e.target.checked})} className="w-3.5 h-3.5 rounded text-amber-600 focus:ring-amber-500"/><label className="text-[9px] font-bold text-amber-700 uppercase font-google-sans">Skip</label></div><button onClick={() => handleUpdateOverride(selectedLoan.id)} className="h-9 bg-amber-600 text-white font-bold rounded-lg text-[9px] uppercase tracking-widest shadow-md hover:bg-amber-700 active:scale-95 transition-all">Submit</button></div></div>)}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
