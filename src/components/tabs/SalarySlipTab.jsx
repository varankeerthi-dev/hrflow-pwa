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
    <View style={s.identificationSection}><View><Text>Name: {data.employee.name}</Text><Text>Code: {data.employee.empCode}</Text></View><View style={{width:180,border:2,borderColor:'#059669',borderRadius:8,padding:10,textAlign:'center',backgroundColor:'#F0FDF4'}}><Text style={{fontSize:8,fontWeight:'bold',color:'#047857'}}>NET PAYABLE</Text><Text style={{fontSize:18,fontWeight:'bold',color:'#065F46'}}>{formatINR(data.netPay)}</Text></View></View>
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
          <Text style={{ width: 30, padding: 4, borderRight: 1 }}>S.No</Text>
          <Text style={{ flex: 2, padding: 4, borderRight: 1 }}>Employee Name</Text>
          <Text style={{ width: 50, padding: 4, borderRight: 1 }}>Emp ID</Text>
          <Text style={{ width: 40, padding: 4, borderRight: 1 }}>Total</Text>
          <Text style={{ width: 40, padding: 4, borderRight: 1 }}>Worked</Text>
          <Text style={{ width: 120, padding: 4, borderRight: 1, textAlign: 'center' }}>HOLIDAYS (Sun/Hol/Tot)</Text>
          <Text style={{ width: 80, padding: 4, borderRight: 1, textAlign: 'center' }}>LEAVE (Appr/LOP)</Text>
          <Text style={{ width: 40, padding: 4, borderRight: 1 }}>OT</Text>
          <Text style={{ width: 60, padding: 4, borderRight: 1 }}>S/H Wk</Text>
          <Text style={{ width: 60, padding: 4 }}>Total Pay</Text>
        </View>
        {data.map((row, i) => (
          <View key={i} style={{ flexDirection: 'row', borderBottom: 1 }}>
            <Text style={{ width: 30, padding: 4, borderRight: 1 }}>{row.sno}</Text>
            <Text style={{ flex: 2, padding: 4, borderRight: 1 }}>{row.name}</Text>
            <Text style={{ width: 50, padding: 4, borderRight: 1 }}>{row.empId}</Text>
            <Text style={{ width: 40, padding: 4, borderRight: 1 }}>{row.totalDays}</Text>
            <Text style={{ width: 40, padding: 4, borderRight: 1 }}>{row.worked}</Text>
            <Text style={{ width: 120, padding: 4, borderRight: 1, textAlign: 'center' }}>{row.sunday} / {row.holidays} / {row.totalHolidays}</Text>
            <Text style={{ width: 80, padding: 4, borderRight: 1, textAlign: 'center' }}>{row.leave} / {row.lop}</Text>
            <Text style={{ width: 40, padding: 4, borderRight: 1 }}>{row.ot}</Text>
            <Text style={{ width: 60, padding: 4, borderRight: 1 }}>{row.sunHolW}</Text>
            <Text style={{ width: 60, padding: 4 }}>{row.totalWorkingDays}</Text>
          </View>
        ))}
      </View>
    </Page>
  </Document>
)

export default function SalarySlipTab() {
  const { user } = useAuth(), { employees } = useEmployees(user?.orgId, true), { slabs, increments } = useSalarySlab(user?.orgId), { fetchByDate } = useAttendance(user?.orgId)
  const isAdmin = user?.role?.toLowerCase() === 'admin'
  const [activeTab, setActiveTab] = useState('salary-slip'), [selectedEmp, setSelectedEmp] = useState(''), [selectedMonth, setSelectedMonth] = useState(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` })
  const [summaryMonth, setSummaryMonth] = useState(selectedMonth)
  const [loading, setLoading] = useState(false), [slipData, setSlipData] = useState(null), [genErr, setGenErr] = useState(''), [orgLogo, setOrgLogo] = useState('')
  const [loans, setLoans] = useState([]), [loanForm, setEditLoanForm] = useState({ employeeId: '', totalAmount: '', emiAmount: '', startMonth: '', remarks: '' }), [editingLoanId, setEditingLoanId] = useState(null), [selectedLoan, setSelectedLoan] = useState(null), [overrideForm, setOverrideForm] = useState({ month: '', amount: 0, reason: '', skip: false }), [loanActivities, setLoanActivities] = useState([])
  const [advances, setAdvances] = useState([]), [newAdvance, setNewAdvance] = useState({ type: 'Advance', amount: 0, date: '', reason: '' }), [revisedOT, setRevisedOT] = useState(0), [otNote, setOtNote] = useState(''), [contRule, setContinuousLeaveRule] = useState(false)
  const [isAttendanceSummaryOpen, setIsAttendanceSummaryOpen] = useState(true)
  const monthInputRef = useRef(null)

  const { data: attendanceSummaryData = [], isLoading: isAttendanceLoading, refetch: refetchSummary } = useQuery({
    queryKey: ['attendanceSummary', user?.orgId, summaryMonth],
    queryFn: async () => {
      if (!user?.orgId || !employees.length) return []
      const [y, m] = summaryMonth.split('-').map(Number)
      const daysInMonth = new Date(y, m, 0).getDate()
      const sd = `${summaryMonth}-01`, ed = `${summaryMonth}-${daysInMonth}`
      
      const aSnap = await getDocs(query(collection(db, 'organisations', user.orgId, 'attendance'), where('date', '>=', sd), where('date', '<=', ed)))
      const allAttendance = aSnap.docs.map(d => d.data())
      
      return employees.map((emp, idx) => {
        const empAtt = allAttendance.filter(a => a.employeeId === emp.id)
        let worked = 0, sun = 0, hol = 0, leave = 0, lop = 0, otH = 0, sunHolW = 0
        
        for (let i = 1; i <= daysInMonth; i++) {
          const dateStr = `${summaryMonth}-${String(i).padStart(2, '0')}`
          const d = new Date(y, m - 1, i), isSunday = d.getDay() === 0
          const r = empAtt.find(a => a.date === dateStr)
          
          if (isSunday) sun++
          if (r) {
            if (r.isAbsent) lop++
            else if (r.sundayWorked || r.holidayWorked) { sunHolW++; worked++ }
            else if (r.sundayHoliday) hol++
            else worked++
            
            if (r.otHours) {
              const [h, mi] = r.otHours.split(':').map(Number)
              otH += (h || 0) + (mi || 0) / 60
            }
          } else {
            if (!isSunday) lop++
          }
        }
        
        return {
          sno: idx + 1,
          name: emp.name,
          empId: emp.empCode || emp.id.slice(0, 5),
          totalDays: daysInMonth,
          worked,
          sunday: sun,
          holidays: hol,
          totalHolidays: sun + hol,
          leave,
          lop,
          ot: otH.toFixed(2),
          sunHolW,
          totalWorkingDays: worked + sun + hol - lop
        }
      })
    },
    enabled: !!user?.orgId && employees.length > 0 && activeTab === 'salary-summary'
  })

  const columns = useMemo(() => [
    { accessorKey: 'sno', header: 'S.No' },
    { accessorKey: 'name', header: 'Name of the Employee' },
    { accessorKey: 'empId', header: 'Emp ID' },
    { accessorKey: 'totalDays', header: 'TOTAL DAYS' },
    { accessorKey: 'worked', header: 'No. of days worked' },
    {
      id: 'holidays_group',
      header: 'HOLIDAYS',
      columns: [
        { accessorKey: 'sunday', header: 'Sunday' },
        { accessorKey: 'holidays', header: 'Holidays' },
        { accessorKey: 'totalHolidays', header: 'Total' },
      ]
    },
    {
      id: 'leave_group',
      header: 'LEAVE',
      columns: [
        { accessorKey: 'leave', header: 'Approved' },
        { accessorKey: 'lop', header: 'LOP' },
      ]
    },
    { accessorKey: 'ot', header: 'OT/HRS' },
    { accessorKey: 'sunHolW', header: 'SUNDAY & Holiday Worked' },
    { accessorKey: 'totalWorkingDays', header: 'TOTAL WORKING DAYS' },
  ], [])

  const table = useReactTable({
    data: attendanceSummaryData,
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  useEffect(() => { if (!user?.orgId) return; getDoc(doc(db, 'organisations', user.orgId)).then(snap => { if (snap.exists()) setOrgLogo(snap.data().logoURL || '') }); fetchLoans() }, [user?.orgId])
  
  const fetchLoans = async () => { 
    try { 
      const q = query(collection(db, 'organisations', user.orgId, 'loans'), orderBy('createdAt', 'desc')); 
      const snap = await getDocs(q); 
      setLoans(snap.docs.map(d => ({ id: d.id, ...d.data() }))); 
      const actQ = query(collection(db, 'organisations', user.orgId, 'activityLogs'), where('module', '==', 'Loans'), orderBy('timestamp', 'desc'), limit(5)); 
      const actSnap = await getDocs(actQ); 
      setLoanActivities(actSnap.docs.map(d => ({ id: d.id, ...d.data() }))) 
    } catch (e) { console.error(e) } 
  }

  const handleCreateLoan = async () => { 
    if (!loanForm.employeeId || !loanForm.totalAmount || !loanForm.emiAmount) return alert('Fill fields'); 
    setLoading(true); 
    try { 
      const emp = employees.find(e => e.id === loanForm.employeeId);
      const docD = { ...loanForm, employeeName: emp?.name || 'Unknown', totalAmount: Number(loanForm.totalAmount), emiAmount: Number(loanForm.emiAmount), updatedAt: serverTimestamp() }; 
      if (editingLoanId) { 
        await updateDoc(doc(db, 'organisations', user.orgId, 'loans', editingLoanId), docD); 
        await logActivity(user.orgId, user, { module: 'Loans', action: 'Updated', detail: `Updated for ${emp?.name}` }) 
      } else { 
        await addDoc(collection(db, 'organisations', user.orgId, 'loans'), { ...docD, remainingAmount: docD.totalAmount, status: 'Active', monthOverrides: {}, createdAt: serverTimestamp(), createdBy: user.uid }); 
        await logActivity(user.orgId, user, { module: 'Loans', action: 'Created', detail: `Created ₹${docD.totalAmount} for ${emp?.name}` }) 
      }; 
      setEditLoanForm({ employeeId: '', totalAmount: '', emiAmount: '', startMonth: '', remarks: '' }); 
      setEditingLoanId(null); setSlipData(null); fetchLoans(); alert('Success') 
    } catch (e) { alert(e.message) } finally { setLoading(false) } 
  }

  const handleEditLoan = (l) => { setEditingLoanId(l.id); setEditLoanForm({ employeeId: l.employeeId, totalAmount: l.totalAmount, emiAmount: l.emiAmount, startMonth: l.startMonth, remarks: l.remarks || '' }) }
  
  const handleDeleteLoan = async (id, name) => { 
    if (!isAdmin) return alert('No permission'); 
    if (!confirm(`Delete for ${name}?`)) return; 
    try { 
      await deleteDoc(doc(db, 'organisations', user.orgId, 'loans', id)); 
      await logActivity(user.orgId, user, { module: 'Loans', action: 'Deleted', detail: `Deleted for ${name}` }); 
      setSlipData(null); fetchLoans(); alert('Deleted') 
    } catch (e) { alert(e.message) } 
  }

  const handleUpdateOverride = async (id) => { 
    if (!overrideForm.month) return alert('Select month'); 
    try { 
      const r = doc(db, 'organisations', user.orgId, 'loans', id), s = await getDoc(r); 
      const newO = { ...(s.data()?.monthOverrides || {}), [overrideForm.month]: { amount: overrideForm.skip ? 0 : Number(overrideForm.amount), skip: overrideForm.skip, reason: overrideForm.reason } }; 
      await updateDoc(r, { monthOverrides: newO }); 
      fetchLoans(); setOverrideForm({ month: '', amount: 0, reason: '', skip: false }) 
    } catch (e) { alert(e.message) } 
  }

  const calcEMI = (l, m) => { 
    if (l.status !== 'Active' || l.remainingAmount <= 0 || l.startMonth > m) return 0; 
    const o = l.monthOverrides?.[m]; 
    if (o) return o.skip ? 0 : Math.min(o.amount, l.remainingAmount); 
    return Math.min(l.emiAmount, l.remainingAmount) 
  }

  const handleGenerate = async () => {
    if (!selectedEmp || !selectedMonth) return; setLoading(true); setGenErr('')
    try {
      const sid = `${selectedEmp}_${selectedMonth}`, sSnap = await getDoc(doc(db, 'organisations', user.orgId, 'salarySlips', sid));
      if (sSnap.exists()) { setSlipData(sSnap.data()); setLoading(false); return };
      const emp = employees.find(e => e.id === selectedEmp); if (!emp) return setLoading(false);
      const [y, m] = selectedMonth.split('-').map(Number), end = new Date(y, m, 0).getDate(), sd = `${selectedMonth}-01`, ed = `${selectedMonth}-${end}`
      const aSnap = await getDocs(query(collection(db, 'organisations', user.orgId, 'attendance'), where('employeeId', '==', selectedEmp))), aData = aSnap.docs.map(d => d.data()).filter(a => a.date >= sd && a.date <= ed)
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
      const otP = fOT * ((ts / end) / minH), advS = await getDocs(query(collection(db, 'organisations', user.orgId, 'advances'), where('employeeId', '==', selectedEmp))), adv = advS.docs.map(d => d.data()).filter(a => a.status !== 'Recovered').reduce((s, c) => s + Number(c.amount), 0)
      const lS = await getDocs(query(collection(db, 'organisations', user.orgId, 'loans'), where('employeeId', '==', selectedEmp), where('status', '==', 'Active'))), emi = lS.docs.map(d => d.data()).reduce((s, l) => s + calcEMI(l, selectedMonth), 0)
      const exS = await getDocs(query(collection(db, 'organisations', user.orgId, 'advances_expenses'), where('employeeId', '==', selectedEmp), where('paymentStatus', '==', 'Paid'), where('type', '==', 'Expense'))), reimb = exS.docs.map(d => d.data()).filter(i => { const pd = i.paidAt?.toDate ? i.paidAt.toDate() : null; return pd && pd.getFullYear() === y && (pd.getMonth() + 1) === m }).reduce((s, c) => s + Number(c.partialAmount || c.amount), 0)
      const b = ts * (slab.basicPercent / 100) * (paid / end), h = ts * (slab.hraPercent / 100) * (paid / end), p = ts * (slab.pfPercent / 100), it = ts * (slab.incomeTaxPercent / 100)
      const g = b + h + otP + reimb, de = p + it + adv + emi
      setSlipData({ employee: emp, month: selectedMonth, slab, grid, paidDays: paid, lopDays: lop, autoOTHours: aOT, finalOT: fOT, otPay: otP, basic: b, hra: h, expenseReimbursement: reimb, grossEarnings: g, pf: p, it, advanceDeduction: adv, loanEMI: emi, totalDeductions: de, netPay: Math.max(0, g - de), sundayCount: sun, sundayWorkedCount: sunW, holidayWorkedCount: holW })
    } catch (e) { setGenErr(e.message) } finally { setLoading(false) }
  }

  const handleFinalizeSlip = async () => {
    if (!slipData) return; setLoading(true)
    try {
      const sid = `${slipData.employee.id}_${slipData.month}`; await setDoc(doc(db, 'organisations', user.orgId, 'salarySlips', sid), { ...slipData, finalizedAt: serverTimestamp(), finalizedBy: user.uid })
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
    <div className="flex h-full bg-[#fbfbfb] -m-6 font-inter text-gray-900">
      <div className="w-[260px] bg-white border-r border-gray-200 flex flex-col pt-8">
        <div className="px-8 mb-10 font-google-sans text-[11px] font-bold uppercase tracking-widest text-gray-400">Payroll Engine</div>
        <nav className="flex-1 space-y-1 px-4">
          <button onClick={() => setActiveTab('salary-slip')} className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg transition-all ${activeTab === 'salary-slip' ? 'bg-gray-900 text-white shadow-md' : 'text-gray-500 hover:bg-gray-50'}`}><Banknote size={16} /><span className="text-[13px] font-semibold">Salary Slip</span></button>
          <button onClick={() => setActiveTab('salary-summary')} className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg transition-all ${activeTab === 'salary-summary' ? 'bg-gray-900 text-white shadow-md' : 'text-gray-500 hover:bg-gray-50'}`}><FileText size={16} /><span className="text-[13px] font-semibold">Salary Summary</span></button>
          <button onClick={() => setActiveTab('loan')} className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg transition-all ${activeTab === 'loan' ? 'bg-gray-900 text-white shadow-md' : 'text-gray-500 hover:bg-gray-50'}`}><Wallet size={16} /><span className="text-[13px] font-semibold">Loan Management</span></button>
        </nav>
      </div>
      <div className="flex-1 overflow-auto p-10">
        {activeTab === 'salary-slip' && (
          <div className="max-w-6xl mx-auto space-y-8">
            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm flex flex-wrap gap-8 items-end">
              <div className="flex-1 min-w-[280px] font-google-sans uppercase text-[10px] font-bold text-gray-400">Target Employee<select value={selectedEmp} onChange={e => setSelectedEmp(e.target.value)} className="w-full h-11 border border-gray-200 rounded-lg px-4 text-[13px] font-semibold bg-white outline-none mt-2 text-gray-900 normal-case">{employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}</select></div>
              <div className="w-[200px] font-google-sans uppercase text-[10px] font-bold text-gray-400">Pay Period<input type="month" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} className="w-full h-11 border border-gray-200 rounded-lg px-4 text-[13px] font-bold mt-2 text-gray-900 normal-case" /></div>
              <button onClick={handleGenerate} disabled={loading || !selectedEmp} className="h-11 px-10 bg-gray-900 text-white font-bold rounded-lg uppercase tracking-[0.15em] text-[10px] shadow-lg hover:bg-black transition-all">Generate</button>
            </div>
            {slipData && (
              <div className="bg-white border border-gray-200 shadow-xl rounded-2xl overflow-hidden relative mx-auto" style={{ width: '100%', minWidth: '850px' }}>
                <div className="flex justify-end gap-3 p-4 bg-gray-50 border-b border-gray-100 no-print">
                  <PDFDownloadLink key={`${slipData.employee.id}_${slipData.month}`} document={<SalarySlipPDF data={slipData} orgName={user?.orgName} orgLogo={orgLogo} />} fileName={`SalarySlip_${slipData.employee.name.replace(/\s+/g, '_')}.pdf`} className="h-9 bg-white border border-gray-200 text-gray-700 px-4 rounded-lg text-[11px] font-bold uppercase flex items-center gap-2 hover:bg-gray-50">{({ loading }) => <><Download size={14} />{loading ? 'Wait...' : 'Export'}</>}</PDFDownloadLink>
                  <button onClick={handleFinalizeSlip} className="h-9 bg-gray-900 text-white px-6 rounded-lg text-[11px] font-bold uppercase tracking-[0.15em] shadow-lg flex items-center gap-2 active:scale-95"><CheckCircle2 size={14} /> Confirm</button>
                </div>
                <div className="p-16 bg-white shadow-inner">
                  <div className="border-b-4 border-gray-900 pb-8 mb-10 flex justify-between items-start">
                    <div className="flex items-center gap-6">{orgLogo && <img src={orgLogo} alt="Logo" className="w-20 h-20 object-contain" />}<div><h1 className="text-4xl font-bold text-gray-900 uppercase font-google-sans tracking-tighter leading-none">{user?.orgName}</h1><p className="text-[12px] text-gray-400 font-bold uppercase tracking-[0.2em] mt-4">Employee Remuneration Advice</p></div></div>
                    <div className="text-right"><h2 className="text-2xl font-bold text-gray-800 uppercase font-google-sans tracking-tight">Payslip</h2><p className="text-[13px] font-bold text-gray-500 mt-2">{new Date(slipData.month + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</p></div>
                  </div>
                  <div className="flex justify-between items-start mb-12">
                    <div className="space-y-3 text-[14px] font-google-sans uppercase text-[11px] font-bold text-gray-900 border-b-2 border-gray-900 pb-1 inline-block">Identification<div className="flex gap-8 mt-4 text-gray-800 normal-case tracking-normal font-inter"><span className="w-40 text-gray-400 font-bold uppercase text-[11px]">Name</span><span className="font-bold">: {slipData.employee.name}</span></div><div className="flex gap-8 text-gray-800 normal-case tracking-normal font-inter"><span className="w-40 text-gray-400 font-bold uppercase text-[11px]">Code</span><span className="font-bold">: {slipData.employee.empCode}</span></div></div>
                    <div className="bg-gray-900 text-white rounded-xl p-6 text-center min-w-[220px] shadow-2xl"><p className="text-[10px] font-bold text-gray-400 uppercase mb-2 font-google-sans">Net Payable (INR)</p><p className="text-3xl font-bold font-google-sans tracking-tighter">{formatINR(slipData.netPay)}</p></div>
                  </div>
                  <div className="border-2 border-gray-900 rounded-2xl overflow-hidden mb-12 font-inter">
                    <div className="grid grid-cols-2 bg-gray-900 font-google-sans font-bold text-[12px] uppercase text-white"><div className="p-5 flex justify-between">Earnings<span>INR</span></div><div className="p-5 flex justify-between border-l border-gray-800">Deductions<span>INR</span></div></div>
                    <div className="grid grid-cols-2 divide-x-2 divide-gray-900">
                      <div className="p-0 text-gray-600 font-medium text-[14px]"><div className="flex justify-between p-5 border-b border-gray-50">Basic Salary<span className="font-bold text-gray-900">{formatINR(slipData.basic)}</span></div><div className="flex justify-between p-5 border-b border-gray-50">HRA<span className="font-bold text-gray-900">{formatINR(slipData.hra)}</span></div>{slipData.otPay > 0 && <div className="flex justify-between p-5 text-indigo-600 font-bold bg-indigo-50/20 font-google-sans uppercase text-[11px] tracking-widest">Overtime<span className="font-bold">{formatINR(slipData.otPay)}</span></div>}</div>
                      <div className="p-0 text-gray-600 font-medium text-[14px]"><div className="flex justify-between p-5 border-b border-gray-50">Tax / IT<span className="font-bold text-gray-900">{formatINR(slipData.it)}</span></div><div className="flex justify-between p-5 border-b border-gray-50">Provident Fund<span className="font-bold text-gray-900">{formatINR(slipData.pf)}</span></div>{slipData.loanEMI > 0 && <div className="flex justify-between p-5 text-red-600 font-bold bg-red-50/20 font-google-sans uppercase text-[11px] tracking-widest">Loan Recovery<span className="font-bold">{formatINR(slipData.loanEMI)}</span></div>}</div>
                    </div>
                    <div className="grid grid-cols-2 divide-x-2 divide-gray-900 bg-gray-50 border-t-2 border-gray-900 font-bold font-google-sans uppercase text-[12px] text-gray-900"><div className="p-5 flex justify-between">Total Earnings<span>{formatINR(slipData.grossEarnings)}</span></div><div className="p-5 flex justify-between">Total Deductions<span>{formatINR(slipData.totalDeductions)}</span></div></div>
                  </div>
                  <div className="text-center pt-12 border-t-2 border-dashed border-gray-100"><p className="text-[13px] font-medium text-gray-700 italic font-inter">Amount in words: <span className="uppercase text-gray-900 not-italic font-bold tracking-tight">Indian Rupee {numberToWords(slipData.netPay)} Only</span></p><p className="text-[10px] text-gray-400 mt-10 font-bold uppercase tracking-[0.4em] opacity-40 font-google-sans">System Authenticated Document</p></div>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'salary-summary' && (
          <div className="max-w-full space-y-6">
            <div className="flex justify-between items-start gap-8 bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
              <div className="flex items-center gap-4">
                <div className="flex items-center bg-gray-100 rounded-lg p-1">
                  <button 
                    onClick={() => {
                      const [y, m] = summaryMonth.split('-').map(Number)
                      const d = new Date(y, m - 2, 1)
                      setSummaryMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
                    }}
                    className="p-2 hover:bg-white hover:shadow-sm rounded-md transition-all text-gray-600"
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <div className="px-4 py-2 font-bold text-gray-900 text-sm min-w-[140px] text-center">
                    {new Date(summaryMonth + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                  </div>
                  <button 
                    onClick={() => monthInputRef.current?.showPicker()}
                    className="p-2 hover:bg-white hover:shadow-sm rounded-md transition-all text-indigo-600 relative"
                  >
                    <CalendarIcon size={18} />
                    <input 
                      ref={monthInputRef}
                      type="month" 
                      value={summaryMonth} 
                      onChange={e => setSummaryMonth(e.target.value)}
                      className="absolute inset-0 opacity-0 cursor-pointer pointer-events-none"
                    />
                  </button>
                  <button 
                    onClick={() => {
                      const [y, m] = summaryMonth.split('-').map(Number)
                      const d = new Date(y, m, 1)
                      setSummaryMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
                    }}
                    className="p-2 hover:bg-white hover:shadow-sm rounded-md transition-all text-gray-600"
                  >
                    <ChevronRight size={18} />
                  </button>
                </div>
                
                <div className="h-10 w-px bg-gray-200 mx-2" />
                
                <button 
                  onClick={() => refetchSummary()}
                  className="h-10 px-6 bg-gray-900 text-white font-bold rounded-lg text-[10px] uppercase tracking-widest shadow-lg hover:bg-black transition-all active:scale-95"
                >
                  Submit
                </button>
              </div>

              <div className="text-right">
                <h1 className="text-xl font-bold text-gray-900 font-google-sans tracking-tight uppercase leading-tight">Salary Summary</h1>
                <p className="text-[11px] text-gray-400 font-bold uppercase tracking-widest mt-1">Monthly payroll overview and statistics</p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex justify-between items-center bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-gray-900 flex items-center justify-center text-white">
                    <Clock size={16} />
                  </div>
                  <p className="text-[12px] font-bold text-gray-900 uppercase font-google-sans tracking-tight">Attendance Summary</p>
                </div>
                <PDFDownloadLink 
                  document={<AttendanceSummaryPDF data={attendanceSummaryData} month={summaryMonth} orgName={user?.orgName} />} 
                  fileName={`Attendance_Summary_${summaryMonth}.pdf`}
                  className="h-9 bg-indigo-600 text-white px-4 rounded-lg text-[10px] font-bold uppercase tracking-widest flex items-center gap-2 hover:bg-indigo-700 shadow-md transition-all active:scale-95"
                >
                  {({ loading }) => <><Download size={14} /> {loading ? 'Preparing...' : 'Export PDF'}</>}
                </PDFDownloadLink>
              </div>

              <div className="bg-white rounded-xl border border-gray-200 shadow-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-[10px] font-inter table-fixed">
                    <thead>
                      {table.getHeaderGroups().map(headerGroup => (
                        <tr key={headerGroup.id}>
                          {headerGroup.headers.map(header => (
                            <th 
                              key={header.id} 
                              colSpan={header.colSpan}
                              className={`px-2 py-1.5 border border-gray-300 bg-gray-100 text-gray-700 font-black uppercase text-center whitespace-normal break-words leading-tight`}
                            >
                              {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                            </th>
                          ))}
                        </tr>
                      ))}
                    </thead>
                    <tbody>
                      {isAttendanceLoading ? (
                        <tr><td colSpan={13} className="p-10 text-center"><Spinner /></td></tr>
                      ) : attendanceSummaryData.length === 0 ? (
                        <tr><td colSpan={13} className="p-10 text-center text-gray-400 font-bold uppercase tracking-widest text-[10px]">No data available for this month</td></tr>
                      ) : (
                        table.getRowModel().rows.map(row => (
                          <tr key={row.id} className="hover:bg-indigo-50/30 transition-colors odd:bg-gray-50/30">
                            {row.getVisibleCells().map(cell => (
                              <td key={cell.id} className="px-2 py-1.5 border border-gray-200 text-gray-600 font-semibold text-center truncate">
                                {flexRender(cell.column.columnDef.cell, cell.getContext())}
                              </td>
                            ))}
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'loan' && (
          <div className="max-w-6xl mx-auto space-y-10 font-inter">
            <div className="flex justify-between items-center border-b border-gray-200 pb-6"><div><h1 className="text-2xl font-bold text-gray-900 font-google-sans tracking-tight">Loan Management</h1><p className="text-[13px] text-gray-500 font-medium mt-1">Lifecycle tracking for advances.</p></div><button onClick={() => { setEditingLoanId(null); setEditLoanForm({ employeeId: '', totalAmount: '', emiAmount: '', startMonth: selectedMonth, remarks: '' }); }} className="h-10 px-6 bg-gray-900 text-white font-bold rounded-lg text-[11px] uppercase tracking-widest shadow-lg flex items-center gap-2 hover:bg-black active:scale-95"><Plus size={14} /> New Schedule</button></div>
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-10">
              <div className="space-y-6">
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6"><div className="flex items-center gap-2 text-gray-900 mb-6 font-bold uppercase text-[11px] font-google-sans tracking-widest"><Settings size={16} /> Configuration</div><div className="space-y-5">
                  <div className="uppercase text-[10px] font-bold text-gray-400 font-google-sans">Employee<select value={loanForm.employeeId} onChange={e => setEditLoanForm({...loanForm, employeeId: e.target.value})} className="w-full h-10 border border-gray-200 rounded-lg px-3 bg-gray-50/50 mt-2 text-gray-900 font-semibold">{employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}</select></div>
                  <div className="grid grid-cols-2 gap-4"><div className="uppercase text-[10px] font-bold text-gray-400 font-google-sans">Principal<input type="number" value={loanForm.totalAmount} onChange={e => setEditLoanForm({...loanForm, totalAmount: e.target.value})} className="w-full h-10 border border-gray-200 rounded-lg px-3 font-bold bg-gray-50/50 mt-2 text-gray-900" /></div><div className="uppercase text-[10px] font-bold text-gray-400 font-google-sans">EMI<input type="number" value={loanForm.emiAmount} onChange={e => setEditLoanForm({...loanForm, emiAmount: e.target.value})} className="w-full h-10 border border-gray-200 rounded-lg px-3 font-bold bg-gray-50/50 mt-2 text-gray-900" /></div></div>
                  <button onClick={handleCreateLoan} disabled={loading} className="w-full h-11 bg-gray-900 text-white font-bold rounded-lg uppercase text-[11px] shadow-xl hover:bg-black transition-all active:scale-[0.98]">{editingLoanId ? 'Update' : 'Activate'}</button>
                </div></div>
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6"><div className="flex items-center gap-2 text-gray-900 mb-6 font-bold uppercase text-[11px] font-google-sans tracking-widest"><History size={16} /> Activity</div><div className="space-y-4">{loanActivities.map(act => (<div key={act.id} className="flex gap-3 border-l-2 border-gray-100 pl-4 py-1"><div className="flex-1 text-[11px] font-bold text-gray-800">{act.detail}</div></div>))}</div></div>
              </div>
              <div className="xl:col-span-2 space-y-6"><div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden"><div className="px-6 py-4 border-b border-gray-100 bg-gray-50/30 font-google-sans font-bold uppercase text-[11px] tracking-widest text-gray-900">Active Schedules</div><div className="overflow-x-auto"><table className="w-full text-left border-collapse font-inter"><thead><tr className="bg-gray-50/50 text-[10px] font-bold uppercase text-gray-400 border-b border-gray-100"><th className="px-6 py-4">Employee</th><th className="px-6 py-4 text-right">Remaining</th><th className="px-6 py-4 text-right">Actions</th></tr></thead><tbody className="divide-y divide-gray-50">
                {loans.map(l => (<tr key={l.id} className="hover:bg-gray-50 transition-colors"><td className="px-6 py-4 font-bold text-gray-900 text-[13px]">{l.employeeName}</td><td className="px-6 py-4 text-right font-bold text-indigo-600 font-google-sans">{formatINR(l.remainingAmount)}</td><td className="px-6 py-4 text-right"><div className="flex justify-end gap-1"><button onClick={() => handleEditLoan(l)} className="p-2 hover:bg-gray-100 rounded-lg transition-all"><Edit2 size={14} /></button><button onClick={() => setSelectedLoan(l)} className="p-2 hover:bg-amber-50 text-amber-600 rounded-lg transition-all"><AlertCircle size={14} /></button><button onClick={() => handleDeleteLoan(l.id, l.employeeName)} className="p-2 hover:bg-red-50 text-red-600 rounded-lg transition-all"><Trash2 size={14} /></button></div></td></tr>))}
              </tbody></table></div></div>
              {selectedLoan && (
                <div className="bg-white rounded-xl border-2 border-amber-200 p-6 space-y-5 shadow-lg animate-in slide-in-from-top-4 duration-300 font-inter"><div className="flex justify-between items-center border-b border-amber-100 pb-4 font-google-sans"><div className="flex items-center gap-2 text-amber-700 font-bold uppercase text-[11px] tracking-widest"><Info size={16} /> Override: {selectedLoan.employeeName}</div><button onClick={() => setSelectedLoan(null)} className="text-gray-400 hover:text-gray-900"><X size={16} /></button></div>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-6 items-end">
                    <div className="uppercase text-[9px] font-bold text-gray-400">Month<input type="month" value={overrideForm.month} onChange={e => setOverrideForm({...overrideForm, month: e.target.value})} className="w-full h-10 border border-gray-200 rounded-lg px-3 font-bold mt-2 text-gray-900 outline-none" /></div>
                    <div className="uppercase text-[9px] font-bold text-gray-400">EMI (₹)<input type="number" disabled={overrideForm.skip} value={overrideForm.amount} onChange={e => setOverrideForm({...overrideForm, amount: e.target.value})} className="w-full h-10 border border-gray-200 rounded-lg px-3 font-bold mt-2 text-gray-900 disabled:opacity-50 outline-none" /></div>
                    <div className="flex items-center gap-2 h-10 mb-0.5"><input type="checkbox" checked={overrideForm.skip} onChange={e => setOverrideForm({...overrideForm, skip: e.target.checked})} className="w-4 h-4 rounded text-amber-600 focus:ring-amber-500" /><label className="text-[10px] font-bold text-amber-700 uppercase font-google-sans">Skip</label></div>
                    <button onClick={() => handleUpdateOverride(selectedLoan.id)} className="h-10 bg-amber-600 text-white font-bold rounded-lg text-[10px] uppercase tracking-widest shadow-md hover:bg-amber-700 active:scale-95 transition-all">Submit</button>
                  </div>
                </div>
              )}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
