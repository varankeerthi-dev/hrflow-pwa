import React, { useState, useEffect, useRef } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { db } from '../../lib/firebase'
import { doc, getDoc } from 'firebase/firestore'
import { formatINR, numberToWords } from '../../lib/salaryUtils'
import html2canvas from 'html2canvas'
import jsPDF from 'jspdf'
import { Wallet, Download } from 'lucide-react'

export default function EmployeeSalarySlipTab() {
  const { user } = useAuth()
  const [month, setMonth] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })
  const [status, setStatus] = useState('checking') // checking | not_released | available
  const [slipData, setSlipData] = useState(null)
  const slipRef = useRef(null)

  useEffect(() => {
    const checkWindowAndSlip = async () => {
      if (!user?.orgId || !user?.employeeId) return
      setStatus('checking')
      setSlipData(null)

      const windowSnap = await getDoc(doc(db, 'organisations', user.orgId, 'salarySlipWindows', month))
      if (!windowSnap.exists()) {
        setStatus('unavailable')
        return
      }
      const { viewFrom, viewUntil } = windowSnap.data()
      const today = new Date().toISOString().split('T')[0]
      if (!viewFrom || !viewUntil || today < viewFrom || today > viewUntil) {
        setStatus('unavailable')
        return
      }

      const slipId = `${user.employeeId}_${month}`
      const slipSnap = await getDoc(doc(db, 'organisations', user.orgId, 'salarySlips', slipId))
      if (!slipSnap.exists()) {
        setStatus('unavailable')
        return
      }
      setSlipData(slipSnap.data())
      setStatus('available')
    }
    checkWindowAndSlip()
  }, [user?.orgId, user?.employeeId, month])

  const handleDownloadPDF = async () => {
    if (!slipRef.current) return
    const canvas = await html2canvas(slipRef.current, { 
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff'
    })
    const imgData = canvas.toDataURL('image/png')
    const pdf = new jsPDF('p', 'mm', 'a4')
    const pdfWidth = pdf.internal.pageSize.getWidth()
    const pdfHeight = (canvas.height * pdfWidth) / canvas.width
    pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight)
    pdf.save(`SalarySlip_${user?.name?.replace(/\s+/g, '_')}_${month}.pdf`)
  }

  const dashIfZero = (val) => (!val || val === 0 || val === '0') ? '-' : formatINR(val);

  return (
    <div className="flex flex-col h-full bg-[#fbfbfb] -m-6 font-inter text-gray-900 overflow-hidden">
      <div className="bg-white border-b border-gray-200 p-6 flex justify-between items-center shrink-0">
        <div>
          <h1 className="text-2xl font-black text-gray-900 font-google-sans tracking-tight uppercase leading-none">My Payslip</h1>
          <div className="flex items-center gap-2 mt-2">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Target Period:</span>
            <input
              type="month"
              value={month}
              onChange={e => setMonth(e.target.value)}
              className="border-none p-0 text-[11px] font-black text-indigo-600 bg-transparent cursor-pointer outline-none uppercase"
            />
          </div>
        </div>
        {status === 'available' && slipData && (
          <button
            onClick={handleDownloadPDF}
            className="h-10 px-6 bg-indigo-600 text-white font-black rounded-xl text-[11px] uppercase tracking-widest shadow-lg shadow-indigo-600/20 flex items-center gap-2 hover:bg-indigo-700 active:scale-95 transition-all"
          >
            <Download size={16} /> Export PDF
          </button>
        )}
      </div>

      {status === 'checking' && (
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Retrieving Statement...</p>
          </div>
        </div>
      )}

      {status === 'unavailable' && (
        <div className="flex-1 flex items-center justify-center p-10 overflow-auto">
          <div className="bg-white border border-gray-100 shadow-xl rounded-[32px] p-12 text-center max-w-md">
            <div className="w-20 h-20 bg-slate-50 rounded-3xl flex items-center justify-center mx-auto mb-8 border border-slate-100">
              <Wallet size={40} className="text-slate-300" />
            </div>
            <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight mb-2">No Statement</h3>
            <p className="text-[12px] text-slate-500 mt-4 leading-relaxed font-medium">Your remuneration statement for this period ({month}) is not yet released or finalized by HR.</p>
          </div>
        </div>
      )}

      {status === 'available' && slipData && (
        <div className="flex-1 overflow-auto p-10">
          <div
            ref={slipRef}
            className="bg-white rounded-[32px] border border-gray-100 shadow-2xl p-12 max-w-4xl mx-auto overflow-hidden relative"
            style={{ fontFamily: "'Inter', sans-serif" }}
          >
            <div className="absolute top-0 left-0 right-0 h-2 bg-indigo-600"></div>
            
            <div className="border-b-2 border-slate-900 pb-8 mb-10 flex justify-between items-end">
              <div>
                <h1 className="text-4xl font-black text-slate-900 uppercase tracking-tighter leading-none font-google-sans">
                  {user?.orgName || 'ORGANISATION'}
                </h1>
                <p className="text-[11px] text-indigo-600 font-black uppercase tracking-[0.3em] mt-4 flex items-center gap-2">
                  <span className="w-8 h-px bg-indigo-600"></span>
                  Remuneration Advice
                </p>
              </div>
              <div className="text-right">
                <h2 className="text-2xl font-black text-slate-900 tracking-tight uppercase font-google-sans italic">Payslip</h2>
                <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest mt-2 bg-slate-50 px-3 py-1 rounded-lg inline-block border border-slate-100">
                  {new Date(slipData.month + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
              <div className="md:col-span-2 space-y-4">
                <p className="font-black text-slate-900 uppercase tracking-widest text-[10px] mb-6 flex items-center gap-3">
                  <span className="bg-indigo-600 text-white px-2 py-0.5 rounded text-[8px]">ID</span>
                  Employee Particulars
                </p>
                <div className="grid grid-cols-2 gap-y-6 gap-x-8">
                  <div className="flex flex-col border-l-2 border-slate-100 pl-4">
                    <span className="text-slate-400 font-black uppercase text-[9px] tracking-widest mb-1">Full Name</span>
                    <span className="font-bold text-slate-800 text-sm uppercase">{slipData.employee?.name}</span>
                  </div>
                  <div className="flex flex-col border-l-2 border-slate-100 pl-4">
                    <span className="text-slate-400 font-black uppercase text-[9px] tracking-widest mb-1">Staff Code</span>
                    <span className="font-bold text-slate-800 text-sm uppercase">{slipData.employee?.empCode}</span>
                  </div>
                  <div className="flex flex-col border-l-2 border-slate-100 pl-4">
                    <span className="text-slate-400 font-black uppercase text-[9px] tracking-widest mb-1">Department</span>
                    <span className="font-bold text-slate-800 text-sm uppercase">{slipData.employee?.department || 'Operations'}</span>
                  </div>
                  <div className="flex flex-col border-l-2 border-slate-100 pl-4">
                    <span className="text-slate-400 font-black uppercase text-[9px] tracking-widest mb-1">Pay Period</span>
                    <span className="font-bold text-slate-800 text-sm uppercase">{slipData.month}</span>
                  </div>
                </div>
              </div>

              <div className="bg-slate-950 text-white rounded-[32px] p-8 flex flex-col justify-between shadow-2xl shadow-indigo-900/30 relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-600/20 rounded-full -mr-12 -mt-12 blur-2xl transition-all"></div>
                <div className="relative z-10">
                  <p className="text-[9px] font-black text-indigo-400 uppercase tracking-[0.2em] mb-4">
                    Net Disbursement
                  </p>
                  <p className="text-4xl font-black tracking-tighter font-google-sans text-white">
                    {formatINR(slipData.netPay)}
                  </p>
                </div>
                <div className="mt-8 pt-4 border-t border-slate-800 flex justify-between text-[10px] font-black text-slate-400 uppercase tracking-widest relative z-10">
                  <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> {slipData.paidDays} Days</span>
                  <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span> {slipData.lopDays} LOP</span>
                </div>
              </div>
            </div>

            <div className="border border-slate-200 rounded-[32px] overflow-hidden mb-12 shadow-sm bg-slate-50/30">
              <div className="grid grid-cols-2 bg-slate-950 divide-x divide-slate-800">
                <div className="flex justify-between p-5 font-black text-[11px] uppercase tracking-[0.2em] text-white">
                  <span className="flex items-center gap-2"><span className="w-1.5 h-1.5 bg-indigo-500 rounded-full"></span> Earnings</span>
                  <span className="text-slate-500">INR</span>
                </div>
                <div className="flex justify-between p-5 font-black text-[11px] uppercase tracking-[0.2em] text-white">
                  <span className="flex items-center gap-2"><span className="w-1.5 h-1.5 bg-rose-500 rounded-full"></span> Deductions</span>
                  <span className="text-slate-500">INR</span>
                </div>
              </div>
              <div className="grid grid-cols-2 divide-x divide-slate-200">
                <div className="p-2 space-y-1 bg-white">
                  <div className="flex justify-between p-4 rounded-2xl hover:bg-slate-50 transition-colors text-[13px] font-medium text-slate-600">
                    <span>Basic Remuneration</span>
                    <span className="font-bold text-slate-900">{formatINR(slipData.basic)}</span>
                  </div>
                  <div className="flex justify-between p-4 rounded-2xl hover:bg-slate-50 transition-colors text-[13px] font-medium text-slate-600">
                    <span>HRA (Allowances)</span>
                    <span className="font-bold text-slate-900">{formatINR(slipData.hra)}</span>
                  </div>
                  <div className="flex justify-between p-4 rounded-2xl hover:bg-slate-50 transition-colors text-[13px] font-medium text-slate-600">
                    <span>Expense</span>
                    <span className="font-bold text-slate-900">{dashIfZero(slipData.expenseReimbursement)}</span>
                  </div>
                  <div className="flex justify-between p-4 rounded-2xl hover:bg-slate-50 transition-colors text-[13px] font-medium text-slate-600">
                    <span>Sunday Worked</span>
                    <span className="font-bold text-slate-900">{dashIfZero(slipData.sundayPay)}</span>
                  </div>
                  <div className="flex justify-between p-4 rounded-2xl hover:bg-slate-50 transition-colors text-[13px] font-medium text-slate-600">
                    <span>OT</span>
                    <span className="font-bold text-slate-900">{dashIfZero(slipData.otPay)}</span>
                  </div>
                </div>
                <div className="p-2 space-y-1 bg-white">
                  <div className="flex justify-between p-4 rounded-2xl hover:bg-slate-50 transition-colors text-[13px] font-medium text-slate-600">
                    <span>Advance Recovery</span>
                    <span className="font-bold text-slate-900">{dashIfZero(slipData.advanceDeduction)}</span>
                  </div>
                  <div className="flex justify-between p-4 rounded-2xl hover:bg-slate-50 transition-colors text-[13px] font-medium text-slate-600">
                    <span>Loan Recovery</span>
                    <span className="font-bold text-slate-900">{dashIfZero(slipData.loanEMI)}</span>
                  </div>
                  <div className="flex justify-between p-4 rounded-2xl hover:bg-slate-50 transition-colors text-[13px] font-medium text-slate-600">
                    <span>Fine / Penalties</span>
                    <span className="font-bold text-slate-900">{dashIfZero(slipData.fineAmount)}</span>
                  </div>
                  <div className="flex justify-between p-4 rounded-2xl hover:bg-slate-50 transition-colors text-[13px] font-medium text-slate-600">
                    <span>Professional Tax / IT</span>
                    <span className="font-bold text-slate-900">{formatINR(slipData.it)}</span>
                  </div>
                  <div className="flex justify-between p-4 rounded-2xl hover:bg-slate-50 transition-colors text-[13px] font-medium text-slate-600">
                    <span>Provident Fund (PF)</span>
                    <span className="font-bold text-slate-900">{formatINR(slipData.pf)}</span>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 divide-x divide-slate-950 bg-slate-950 border-t border-slate-800 font-black">
                <div className="flex justify-between p-5 text-[12px] uppercase text-white tracking-widest">
                  <span className="text-slate-400">Gross Payout</span>
                  <span>{formatINR(slipData.grossEarnings)}</span>
                </div>
                <div className="flex justify-between p-5 text-[12px] uppercase text-white tracking-widest">
                  <span className="text-slate-400">Total Retained</span>
                  <span className="text-rose-400">{formatINR(slipData.totalDeductions)}</span>
                </div>
              </div>
            </div>

            <div className="text-center">
              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-4">
                Remuneration in Words
              </p>
              <div className="bg-slate-950 text-white rounded-2xl p-6 inline-block min-w-[400px] shadow-xl">
                <p className="text-sm font-black text-white italic tracking-tight uppercase">
                  {numberToWords(slipData.netPay)} Only
                </p>
              </div>
              <p className="text-[9px] text-slate-300 mt-12 font-black uppercase tracking-[0.5em] opacity-50">
                System Generated Digital Receipt • System Authenticated
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
