import { useState, useEffect, useRef, useMemo } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { useEmployees } from '../../hooks/useEmployees'
import { useSalarySlab } from '../../hooks/useSalarySlab'
import { useAttendance } from '../../hooks/useAttendance'
import { db } from '../../lib/firebase'
import { collection, query, where, getDocs, orderBy, limit, addDoc, serverTimestamp, setDoc, doc } from 'firebase/firestore'
import { formatINR, numberToWords } from '../../lib/salaryUtils'
import Spinner from '../ui/Spinner'
import Modal from '../ui/Modal'
import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'

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
  
  const [advances, setAdvances] = useState([])
  const [newAdvance, setNewAdvance] = useState({ type: 'Advance', amount: 0, date: '', reason: '' })
  
  const [otRequest, setOtRequest] = useState(null)
  const [revisedOT, setRevisedOT] = useState(0)
  const [otNote, setOtNote] = useState('')
  
  const [activeBottomTab, setActiveBottomTab] = useState('ot') // 'ot' or 'advances'
  const [continuousLeaveRule, setContinuousLeaveRule] = useState(false)
  const slipRef = useRef(null)

  const handleGenerate = async () => {
    console.log('handleGenerate: starting', { selectedEmp, selectedMonth })
    if (!selectedEmp || !selectedMonth) return
    setLoading(true)
    try {
      // Check if already saved
      const slipId = `${selectedEmp}_${selectedMonth}`
      console.log('handleGenerate: checking for saved slip', slipId)
      const savedSlipSnap = await getDoc(doc(db, 'organisations', user.orgId, 'salarySlips', slipId))
      if (savedSlipSnap.exists()) {
        console.log('handleGenerate: saved slip found')
        setSlipData(savedSlipSnap.data())
        setLoading(false)
        return
      }

      const emp = employees.find(e => e.id === selectedEmp)
      console.log('handleGenerate: emp found', emp?.name)
      if (!emp) {
        console.error('handleGenerate: employee not found in employees list')
        setLoading(false)
        return
      }
      
      // Get attendance
      const startDate = `${selectedMonth}-01`
      const [year, month] = selectedMonth.split('-')
      const endDay = new Date(year, month, 0).getDate()
      const endDate = `${selectedMonth}-${endDay}`
      console.log('handleGenerate: dates', { startDate, endDate, endDay })
      
      const attQ = query(collection(db, 'organisations', user.orgId, 'attendance'), where('employeeId', '==', selectedEmp), where('date', '>=', startDate), where('date', '<=', endDate))
      const attSnap = await getDocs(attQ)
      const attData = attSnap.docs.map(d => d.data())
      console.log('handleGenerate: attendance data fetched', attData.length, 'records')
      
      // Determine applicable slab
      const applicableIncrements = increments.filter(i => i.employeeId === selectedEmp && i.effectiveFrom <= selectedMonth).sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))
      const activeSlab = applicableIncrements[0] || slabs[selectedEmp] || { totalSalary: 0, basicPercent: 40, hraPercent: 20, incomeTaxPercent: 0, pfPercent: 0 }
      console.log('handleGenerate: active slab', activeSlab)
      
      const totalSalary = Number(activeSlab.totalSalary) || 0
      const minDailyHours = Number(emp.minDailyHours) || 8
      const permissionHrsAllowed = Number(emp.permissionHours) || 2
      
      // Build Grid
      let paidDays = 0
      let lopDays = 0
      let autoOTHours = 0
      
      const grid = []
      for (let i = 1; i <= endDay; i++) {
        const d = new Date(year, month - 1, i)
        const dStr = d.toISOString().split('T')[0]
        const isSunday = d.getDay() === 0
        const rec = attData.find(a => a.date === dStr)
        
        let type = 'Normal'
        if (isSunday) type = 'Sunday'
        if (rec) {
          if (rec.isAbsent) type = 'Absent'
          else if (rec.sundayWorked) type = 'Sunday Working'
          else if (rec.sundayHoliday) type = 'Sunday Holiday'
          else type = 'Working'
          
          if (rec.otHours) {
            const [h, m] = rec.otHours.split(':').map(Number)
            autoOTHours += (h || 0) + (m || 0) / 60
          }
        } else if (isSunday) {
           type = 'Sunday'
        } else {
           type = 'Absent'
        }
        
        // Compute LOP
        if (type === 'Absent') lopDays++
        else paidDays++
        
        grid.push({ date: i, type, dStr })
      }
      console.log('handleGenerate: grid built', { paidDays, lopDays, autoOTHours })
      
      // Apply Continuous Leave Rule for Sundays
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
      
      // Check existing OT Request
      const otQ = query(collection(db, 'organisations', user.orgId, 'otRequests'), where('employeeId', '==', selectedEmp), where('month', '==', selectedMonth))
      const otSnap = await getDocs(otQ)
      const existingOT = otSnap.docs[0] ? { id: otSnap.docs[0].id, ...otSnap.docs[0].data() } : null
      setOtRequest(existingOT)
      
      const finalOT = existingOT?.status === 'approved' ? existingOT.finalOTHours : autoOTHours
      const otPay = finalOT * otRate
      
      // Calculate Earnings
      const basic = totalSalary * (activeSlab.basicPercent / 100) * (paidDays / endDay)
      const hra = totalSalary * (activeSlab.hraPercent / 100) * (paidDays / endDay)
      const grossEarnings = basic + hra + otPay
      
      // Fetch Advances
      const advQ = query(collection(db, 'organisations', user.orgId, 'advances'), where('employeeId', '==', selectedEmp))
      const advSnap = await getDocs(advQ)
      const allAdv = advSnap.docs.map(d => ({ id: d.id, ...d.data() }))
      setAdvances(allAdv)
      const pendingAdvances = allAdv.filter(a => a.status !== 'Recovered').reduce((acc, curr) => acc + Number(curr.amount), 0)
      
      // Deductions
      const pf = totalSalary * (activeSlab.pfPercent / 100)
      const it = totalSalary * (activeSlab.incomeTaxPercent / 100)
      const totalDeductions = pf + it + pendingAdvances
      
      const netPay = Math.max(0, grossEarnings - totalDeductions)
      
      const finalData = {
        employee: emp,
        month: selectedMonth,
        slab: activeSlab,
        grid,
        paidDays,
        lopDays,
        autoOTHours,
        finalOT,
        otPay,
        basic,
        hra,
        grossEarnings,
        pf,
        it,
        advanceDeduction: pendingAdvances,
        totalDeductions,
        netPay
      }
      console.log('handleGenerate: success, finalData set', finalData)
      setSlipData(finalData)
      
    } catch (err) {
      console.error('handleGenerate: CRITICAL ERROR', err)
      alert('Error generating slip: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleDownloadPDF = async () => {
    if (!slipRef.current) return
    const canvas = await html2canvas(slipRef.current, { scale: 2 })
    const imgData = canvas.toDataURL('image/png')
    const pdf = new jsPDF('p', 'mm', 'a4')
    const pdfWidth = pdf.internal.pageSize.getWidth()
    const pdfHeight = (canvas.height * pdfWidth) / canvas.width
    pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight)
    pdf.save(`Payslip_${slipData.employee.name}_${selectedMonth}.pdf`)
  }

  const handleSaveSlip = async () => {
    if (!slipData) return
    setLoading(true)
    try {
      const slipId = `${selectedEmp}_${selectedMonth}`
      await setDoc(doc(db, 'organisations', user.orgId, 'salarySlips', slipId), {
        ...slipData,
        employee: { id: slipData.employee.id, name: slipData.employee.name, empCode: slipData.employee.empCode, department: slipData.employee.department }, // Store minimal employee data
        status: 'saved',
        generatedAt: serverTimestamp()
      })
      alert('Slip saved and frozen successfully.')
    } catch (err) {
      console.error('Save failed:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleSaveAdvance = async () => {
    if (!newAdvance.amount || !newAdvance.date) return
    await addDoc(collection(db, 'organisations', user.orgId, 'advances'), {
      ...newAdvance,
      employeeId: selectedEmp,
      status: 'Pending',
      createdAt: serverTimestamp()
    })
    setNewAdvance({ type: 'Advance', amount: 0, date: '', reason: '' })
    handleGenerate()
  }

  const handleSubmitOT = async () => {
    const final = slipData.autoOTHours + Number(revisedOT)
    await addDoc(collection(db, 'organisations', user.orgId, 'otRequests'), {
      employeeId: selectedEmp,
      month: selectedMonth,
      autoOTHours: slipData.autoOTHours,
      revisedOTHours: Number(revisedOT),
      finalOTHours: final,
      note: otNote,
      status: 'pending',
      createdAt: serverTimestamp()
    })
    handleGenerate()
  }

  return (
    <div className="h-full flex flex-col font-roboto space-y-6">
      <div className="bg-white p-5 rounded-2xl border shadow-sm flex flex-wrap gap-4 items-end no-print">
        <div className="flex-1 min-w-[200px]">
          <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Select Employee</label>
          <select value={selectedEmp} onChange={e => setSelectedEmp(e.target.value)} className="w-full border rounded-xl px-4 py-2.5 text-xs font-bold bg-gray-50 focus:ring-2 focus:ring-indigo-500 outline-none">
            <option value="">Choose...</option>
            {employees.map(e => <option key={e.id} value={e.id}>{e.name} ({e.empCode || 'No ID'})</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Pay Period</label>
          <input type="month" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} className="w-full border rounded-xl px-4 py-2.5 text-xs font-bold bg-gray-50 focus:ring-2 focus:ring-indigo-500 outline-none" />
        </div>
        <div>
          <label className="flex items-center gap-2 cursor-pointer h-full pt-6">
            <input type="checkbox" checked={continuousLeaveRule} onChange={e => setContinuousLeaveRule(e.target.checked)} className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500" />
            <span className="text-[10px] font-bold text-gray-600 uppercase tracking-tight">Deduct Sunday if surrounded by leaves</span>
          </label>
        </div>
        <button onClick={handleGenerate} disabled={loading || !selectedEmp || !selectedMonth} className="bg-indigo-600 text-white font-black px-6 py-2.5 rounded-xl uppercase tracking-widest text-[10px] shadow-lg hover:bg-indigo-700 disabled:opacity-50 transition-all">
          {loading ? 'GENERATING...' : 'GENERATE SLIP'}
        </button>
      </div>
      
      {slipData && (
        <div className="flex-1 overflow-auto flex gap-6">
          <div className="flex-1 max-w-4xl bg-white border border-gray-200 shadow-2xl p-0 relative mx-auto" style={{ minWidth: '800px' }}>
            {/* Action Bar */}
            <div className="flex justify-end gap-2 p-4 bg-gray-50 border-b border-gray-200 no-print">
              <button onClick={handleSaveSlip} disabled={loading} className="bg-green-50 text-green-700 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-widest hover:bg-green-100 transition-colors disabled:opacity-50">Save Slip</button>
              <button onClick={handleDownloadPDF} className="bg-indigo-50 text-indigo-600 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-widest hover:bg-indigo-100 transition-colors">Download PDF</button>
              <button onClick={() => window.print()} className="bg-purple-50 text-purple-600 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-widest hover:bg-purple-100 transition-colors">Print Slip</button>
            </div>

            {/* SLIP RENDER TARGET */}
            <div ref={slipRef} className="p-10 bg-white" style={{ fontFamily: 'Roboto, sans-serif' }}>
              <div className="border-b-2 border-gray-800 pb-4 mb-6 flex justify-between items-end">
                <div>
                  <h1 className="text-2xl font-black text-gray-900 uppercase tracking-tighter">{user?.orgName || 'COMPANY NAME'}</h1>
                  <p className="text-xs text-gray-500 font-medium mt-1">System Generated Payroll Document</p>
                </div>
                <div className="text-right">
                  <h2 className="text-xl font-bold text-gray-800 tracking-tight">Payslip For the Month</h2>
                  <p className="text-sm font-black text-indigo-600 uppercase">{slipData.month}</p>
                </div>
              </div>

              <div className="flex justify-between items-start mb-8">
                <div className="space-y-1 text-sm">
                  <p className="font-bold text-gray-800 uppercase tracking-widest text-xs mb-3 border-b pb-1 inline-block">EMPLOYEE SUMMARY</p>
                  <div className="flex gap-4"><span className="w-32 text-gray-500 font-medium">Employee Name</span><span className="font-bold text-gray-900 uppercase">:{' '}{slipData.employee.name}</span></div>
                  <div className="flex gap-4"><span className="w-32 text-gray-500 font-medium">Employee ID</span><span className="font-bold text-gray-900 uppercase">:{' '}{slipData.employee.empCode || '-'}</span></div>
                  <div className="flex gap-4"><span className="w-32 text-gray-500 font-medium">Department</span><span className="font-bold text-gray-900 uppercase">:{' '}{slipData.employee.department || '-'}</span></div>
                  <div className="flex gap-4"><span className="w-32 text-gray-500 font-medium">Pay Period</span><span className="font-bold text-gray-900 uppercase">:{' '}{slipData.month}</span></div>
                  <div className="flex gap-4"><span className="w-32 text-gray-500 font-medium">Pay Date</span><span className="font-bold text-gray-900 uppercase">:{' '}{new Date().toISOString().split('T')[0]}</span></div>
                </div>
                
                <div className="border-2 border-green-600 rounded-xl p-5 text-center min-w-[200px] shadow-sm bg-green-50/30">
                  <p className="text-[10px] font-black text-green-700 uppercase tracking-widest mb-1">TOTAL NET PAY</p>
                  <p className="text-2xl font-black text-green-800 tracking-tighter">{formatINR(slipData.netPay)}</p>
                  <div className="mt-4 pt-4 border-t border-green-200/50 flex justify-between text-xs font-bold text-green-800">
                    <span>Paid Days: {slipData.paidDays}</span>
                    <span>LOP: {slipData.lopDays}</span>
                  </div>
                </div>
              </div>

              {/* Attendance Grid Mini */}
              <div className="mb-6">
                 <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Attendance Summary Grid</p>
                 <div className="flex flex-wrap gap-1">
                   {slipData.grid.map(day => (
                     <div key={day.date} className={`w-6 h-6 flex items-center justify-center text-[8px] font-black rounded ${day.type === 'Working' ? 'bg-green-100 text-green-700' : day.type === 'Absent' ? 'bg-red-100 text-red-700' : day.type.includes('Sunday') ? (day.isUnpaidSunday ? 'bg-gray-200 text-gray-400 line-through' : 'bg-blue-100 text-blue-700') : 'bg-gray-100 text-gray-600'}`} title={day.type}>
                       {day.date}
                     </div>
                   ))}
                 </div>
              </div>

              <div className="border-2 border-gray-800 rounded-xl overflow-hidden mb-6">
                <div className="grid grid-cols-2 bg-gray-100 border-b-2 border-gray-800 divide-x-2 divide-gray-800">
                  <div className="flex justify-between p-3 font-black text-xs uppercase tracking-widest text-gray-800"><span>EARNINGS</span><span>AMOUNT</span></div>
                  <div className="flex justify-between p-3 font-black text-xs uppercase tracking-widest text-gray-800"><span>DEDUCTIONS</span><span>AMOUNT</span></div>
                </div>
                <div className="grid grid-cols-2 divide-x-2 divide-gray-800">
                  <div className="p-0">
                    <div className="flex justify-between p-3 border-b border-gray-100 text-sm"><span className="text-gray-600 font-medium">Basic Pay</span><span className="font-bold text-gray-900">{formatINR(slipData.basic)}</span></div>
                    <div className="flex justify-between p-3 border-b border-gray-100 text-sm"><span className="text-gray-600 font-medium">House Rent Allowance</span><span className="font-bold text-gray-900">{formatINR(slipData.hra)}</span></div>
                    {slipData.otPay > 0 && <div className="flex justify-between p-3 border-b border-gray-100 text-sm"><span className="text-gray-600 font-medium">Overtime ({slipData.finalOT} hrs)</span><span className="font-bold text-gray-900">{formatINR(slipData.otPay)}</span></div>}
                  </div>
                  <div className="p-0">
                    <div className="flex justify-between p-3 border-b border-gray-100 text-sm"><span className="text-gray-600 font-medium">Income Tax</span><span className="font-bold text-gray-900">{formatINR(slipData.it)}</span></div>
                    <div className="flex justify-between p-3 border-b border-gray-100 text-sm"><span className="text-gray-600 font-medium">Provident Fund</span><span className="font-bold text-gray-900">{formatINR(slipData.pf)}</span></div>
                    {slipData.advanceDeduction > 0 && <div className="flex justify-between p-3 border-b border-gray-100 text-sm"><span className="text-gray-600 font-medium">Advance Recovery</span><span className="font-bold text-gray-900">{formatINR(slipData.advanceDeduction)}</span></div>}
                  </div>
                </div>
                <div className="grid grid-cols-2 divide-x-2 divide-gray-800 bg-gray-50 border-t-2 border-gray-800">
                  <div className="flex justify-between p-3 font-black text-sm uppercase tracking-tight text-gray-900"><span>Gross Earnings</span><span>{formatINR(slipData.grossEarnings)}</span></div>
                  <div className="flex justify-between p-3 font-black text-sm uppercase tracking-tight text-gray-900"><span>Total Deductions</span><span>{formatINR(slipData.totalDeductions)}</span></div>
                </div>
              </div>

              <div className="bg-gray-900 text-white rounded-xl p-4 flex justify-between items-center mb-6">
                <div>
                  <h3 className="text-lg font-black uppercase tracking-widest">TOTAL NET PAYABLE</h3>
                  <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Gross Earnings - Total Deductions</p>
                </div>
                <div className="text-3xl font-black tracking-tighter">{formatINR(slipData.netPay)}</div>
              </div>

              <div className="text-center text-sm font-bold text-gray-700 italic border-t-2 border-dashed border-gray-200 pt-6">
                Amount In Words: Indian Rupee {numberToWords(slipData.netPay)} Only
                <p className="text-[10px] text-gray-400 mt-4 not-italic font-medium">-- This is a system-generated document. --</p>
              </div>
            </div>
          </div>
          
          {/* Right Side Panels */}
          <div className="w-80 flex flex-col space-y-4 no-print">
            <div className="flex bg-white rounded-xl border shadow-sm p-1">
              <button onClick={() => setActiveBottomTab('ot')} className={`flex-1 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${activeBottomTab === 'ot' ? 'bg-indigo-600 text-white' : 'text-gray-500'}`}>OT Review</button>
              <button onClick={() => setActiveBottomTab('advances')} className={`flex-1 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${activeBottomTab === 'advances' ? 'bg-indigo-600 text-white' : 'text-gray-500'}`}>Advances</button>
            </div>
            
            {activeBottomTab === 'ot' && (
              <div className="bg-white rounded-2xl p-5 border shadow-sm flex-1">
                 <h4 className="font-black text-gray-800 uppercase tracking-tight mb-4">Overtime Processing</h4>
                 <div className="space-y-4">
                   <div className="bg-gray-50 p-3 rounded-xl border">
                     <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Auto-Calculated</p>
                     <p className="text-lg font-black text-gray-800">{slipData.autoOTHours.toFixed(2)} Hrs</p>
                   </div>
                   <div>
                     <label className="block text-[9px] font-black text-gray-400 uppercase mb-1">Revised Adjustment (+ or -)</label>
                     <input type="number" value={revisedOT} onChange={e => setRevisedOT(e.target.value)} className="w-full border rounded-xl px-3 py-2 text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500" />
                   </div>
                   <div className="bg-indigo-50 p-3 rounded-xl border border-indigo-100">
                     <p className="text-[9px] font-black text-indigo-400 uppercase tracking-widest">Final Request</p>
                     <p className="text-lg font-black text-indigo-700">{(slipData.autoOTHours + Number(revisedOT)).toFixed(2)} Hrs</p>
                   </div>
                   <div>
                     <textarea value={otNote} onChange={e => setOtNote(e.target.value)} placeholder="Revision Note..." className="w-full border rounded-xl px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-indigo-500 h-20" />
                   </div>
                   <button onClick={handleSubmitOT} className="w-full bg-indigo-600 text-white font-black py-3 rounded-xl uppercase tracking-widest text-[10px] shadow-lg">Submit for Approval</button>
                 </div>
                 {otRequest && (
                   <div className="mt-4 p-3 rounded-xl border border-amber-200 bg-amber-50">
                     <p className="text-[9px] font-black text-amber-600 uppercase tracking-widest">Current Status</p>
                     <p className="text-xs font-bold text-amber-800 mt-1 uppercase">{otRequest.status}</p>
                   </div>
                 )}
              </div>
            )}
            
            {activeBottomTab === 'advances' && (
              <div className="bg-white rounded-2xl p-5 border shadow-sm flex-1 flex flex-col">
                 <h4 className="font-black text-gray-800 uppercase tracking-tight mb-4">Add Entry</h4>
                 <div className="space-y-3 mb-6">
                   <select value={newAdvance.type} onChange={e => setNewAdvance(s => ({...s, type: e.target.value}))} className="w-full border rounded-xl px-3 py-2 text-xs font-bold outline-none bg-gray-50">
                     <option>Advance</option>
                     <option>Loan</option>
                   </select>
                   <input type="number" placeholder="Amount (₹)" value={newAdvance.amount || ''} onChange={e => setNewAdvance(s => ({...s, amount: e.target.value}))} className="w-full border rounded-xl px-3 py-2 text-xs font-bold outline-none" />
                   <input type="date" value={newAdvance.date} onChange={e => setNewAdvance(s => ({...s, date: e.target.value}))} className="w-full border rounded-xl px-3 py-2 text-xs font-bold outline-none" />
                   <input type="text" placeholder="Reason" value={newAdvance.reason} onChange={e => setNewAdvance(s => ({...s, reason: e.target.value}))} className="w-full border rounded-xl px-3 py-2 text-xs outline-none" />
                   <button onClick={handleSaveAdvance} className="w-full bg-indigo-600 text-white font-black py-2.5 rounded-xl uppercase tracking-widest text-[10px] shadow-lg">Add Entry</button>
                 </div>
                 
                 <h4 className="font-black text-gray-800 uppercase tracking-tight mb-2">History</h4>
                 <div className="flex-1 overflow-auto border rounded-xl bg-gray-50">
                   {advances.map(a => (
                     <div key={a.id} className="p-3 border-b last:border-b-0">
                       <div className="flex justify-between items-center mb-1">
                         <span className="text-[10px] font-black uppercase text-gray-600">{a.type}</span>
                         <span className={`text-[8px] font-black px-1.5 py-0.5 rounded ${a.status === 'Recovered' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>{a.status}</span>
                       </div>
                       <p className="text-xs font-bold text-gray-800 mb-0.5">₹{a.amount}</p>
                       <p className="text-[9px] text-gray-400">{a.date}</p>
                     </div>
                   ))}
                   {advances.length === 0 && <p className="text-[10px] text-center text-gray-400 py-4">No records</p>}
                 </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
