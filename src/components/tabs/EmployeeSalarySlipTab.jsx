import React, { useState, useEffect, useRef } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { db } from '../../lib/firebase'
import { doc, getDoc } from 'firebase/firestore'
import { formatINR, numberToWords } from '../../lib/salaryUtils'
import html2canvas from 'html2canvas'
import jsPDF from 'jspdf'

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
        setStatus('not_released')
        return
      }
      const { viewFrom, viewUntil } = windowSnap.data()
      const today = new Date().toISOString().split('T')[0]
      if (!viewFrom || !viewUntil || today < viewFrom || today > viewUntil) {
        setStatus('not_released')
        return
      }

      const slipId = `${user.employeeId}_${month}`
      const slipSnap = await getDoc(doc(db, 'organisations', user.orgId, 'salarySlips', slipId))
      if (!slipSnap.exists()) {
        setStatus('not_released')
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
      onclone: (clonedDoc) => {
        const elements = clonedDoc.querySelectorAll('*')
        elements.forEach(el => {
          const computedStyle = window.getComputedStyle(el)
          el.style.color = computedStyle.color
          el.style.backgroundColor = computedStyle.backgroundColor
          el.style.borderColor = computedStyle.borderColor
          el.style.fill = computedStyle.fill
          el.style.stroke = computedStyle.stroke
        })
      }
    })
    const imgData = canvas.toDataURL('image/png')
    const pdf = new jsPDF('p', 'mm', 'a4')
    const pdfWidth = pdf.internal.pageSize.getWidth()
    const pdfHeight = (canvas.height * pdfWidth) / canvas.width
    pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight)
    pdf.save(`Payslip_${month}.pdf`)
  }

  return (
    <div className="h-full flex flex-col gap-6 font-inter">
      <div className="bg-white p-5 rounded-[12px] shadow-sm flex items-center justify-between border border-gray-100">
        <div>
          <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">Salary Slip</p>
          <p className="text-sm text-gray-700 mt-1">
            {status === 'available'
              ? 'Status: Available'
              : status === 'checking'
              ? 'Checking release window...'
              : 'Status: Not Released'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="month"
            value={month}
            onChange={e => setMonth(e.target.value)}
            className="h-[40px] border border-gray-200 rounded-lg px-3 text-sm font-bold bg-gray-50/50 outline-none focus:ring-2 focus:ring-indigo-500"
          />
          {status === 'available' && (
            <button
              onClick={handleDownloadPDF}
              className="h-[40px] px-5 bg-indigo-600 text-white rounded-lg text-[11px] font-black uppercase tracking-[0.15em] shadow-lg hover:bg-indigo-700"
            >
              Download PDF
            </button>
          )}
        </div>
      </div>

      {status === 'not_released' && (
        <div className="bg-amber-50 border border-amber-200 text-amber-700 px-4 py-3 rounded-xl text-[13px] max-w-xl">
          <p className="font-semibold">Salary slip is not available yet.</p>
          <p className="text-[12px] mt-1">Please check after the release date.</p>
        </div>
      )}

      {status === 'available' && slipData && (
        <div className="flex-1 overflow-auto">
          <div
            ref={slipRef}
            className="bg-white rounded-2xl border border-gray-100 shadow-2xl p-10 max-w-4xl mx-auto overflow-hidden relative"
            style={{ fontFamily: "'Inter', sans-serif" }}
          >
            {/* Top accent bar */}
            <div className="absolute top-0 left-0 right-0 h-2 bg-indigo-600"></div>
            
            <div className="border-b border-slate-200 pb-8 mb-10 flex justify-between items-end">
              <div>
                <h1 className="text-4xl font-black text-slate-900 uppercase tracking-tighter leading-none font-google-sans">
                  {user?.orgName || 'ORGANISATION'}
                </h1>
                <p className="text-[11px] text-indigo-600 font-black uppercase tracking-[0.3em] mt-4 flex items-center gap-2">
                  <span className="w-8 h-px bg-indigo-600"></span>
                  Remuneration Statement
                </p>
              </div>
              <div className="text-right">
                <h2 className="text-2xl font-black text-slate-900 tracking-tight uppercase font-google-sans italic">Payslip</h2>
                <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest mt-2 bg-slate-50 px-3 py-1 rounded-md inline-block border border-slate-100">
                  {new Date(slipData.month + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
              <div className="md:col-span-2 space-y-4">
                <p className="font-black text-slate-900 uppercase tracking-widest text-[10px] mb-6 flex items-center gap-3">
                  <span className="bg-indigo-600 text-white px-2 py-0.5 rounded text-[8px]">ID</span>
                  Employee Details
                </p>
                <div className="grid grid-cols-2 gap-y-4 gap-x-8">
                  <div className="flex flex-col border-l-2 border-slate-100 pl-4">
                    <span className="text-slate-400 font-black uppercase text-[9px] tracking-widest mb-1">Full Name</span>
                    <span className="font-bold text-slate-800 text-sm uppercase">{slipData.employee.name}</span>
                  </div>
                  <div className="flex flex-col border-l-2 border-slate-100 pl-4">
                    <span className="text-slate-400 font-black uppercase text-[9px] tracking-widest mb-1">Employee ID</span>
                    <span className="font-bold text-slate-800 text-sm uppercase">{slipData.employee.empCode}</span>
                  </div>
                  <div className="flex flex-col border-l-2 border-slate-100 pl-4">
                    <span className="text-slate-400 font-black uppercase text-[9px] tracking-widest mb-1">Department</span>
                    <span className="font-bold text-slate-800 text-sm uppercase">{slipData.employee.department || 'N/A'}</span>
                  </div>
                  <div className="flex flex-col border-l-2 border-slate-100 pl-4">
                    <span className="text-slate-400 font-black uppercase text-[9px] tracking-widest mb-1">Pay Period</span>
                    <span className="font-bold text-slate-800 text-sm uppercase">{slipData.month}</span>
                  </div>
                </div>
              </div>

              <div className="bg-slate-950 text-white rounded-3xl p-8 flex flex-col justify-between shadow-2xl shadow-indigo-900/20 relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-600/20 rounded-full -mr-12 -mt-12 blur-2xl transition-all group-hover:bg-indigo-600/40"></div>
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

            <div className="border border-slate-200 rounded-3xl overflow-hidden mb-12 shadow-sm bg-slate-50/30">
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
                <div className="p-2 space-y-1">
                  <div className="flex justify-between p-4 rounded-2xl hover:bg-white transition-colors text-[13px] font-medium text-slate-600">
                    <span>Basic Remuneration</span>
                    <span className="font-bold text-slate-900">{formatINR(slipData.basic)}</span>
                  </div>
                  <div className="flex justify-between p-4 rounded-2xl hover:bg-white transition-colors text-[13px] font-medium text-slate-600">
                    <span>House Rent Allowance</span>
                    <span className="font-bold text-slate-900">{formatINR(slipData.hra)}</span>
                  </div>
                  {slipData.otPay > 0 && (
                    <div className="flex justify-between p-4 rounded-2xl bg-indigo-50/50 text-[13px] font-bold text-indigo-700">
                      <span className="flex items-center gap-2">Overtime <span className="text-[10px] font-black px-1.5 py-0.5 bg-indigo-100 rounded text-indigo-600">{slipData.finalOT}H</span></span>
                      <span>{formatINR(slipData.otPay)}</span>
                    </div>
                  )}
                </div>
                <div className="p-2 space-y-1">
                  <div className="flex justify-between p-4 rounded-2xl hover:bg-white transition-colors text-[13px] font-medium text-slate-600">
                    <span>Professional Tax / IT</span>
                    <span className="font-bold text-slate-900">{formatINR(slipData.it)}</span>
                  </div>
                  <div className="flex justify-between p-4 rounded-2xl hover:bg-white transition-colors text-[13px] font-medium text-slate-600">
                    <span>Provident Fund (PF)</span>
                    <span className="font-bold text-slate-900">{formatINR(slipData.pf)}</span>
                  </div>
                  {slipData.advanceDeduction > 0 && (
                    <div className="flex justify-between p-4 rounded-2xl bg-rose-50/50 text-[13px] font-bold text-rose-700">
                      <span>Advance Recovery</span>
                      <span>{formatINR(slipData.advanceDeduction)}</span>
                    </div>
                  )}
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
                Amount in words
              </p>
              <div className="bg-slate-50 rounded-2xl p-6 border border-slate-100 inline-block min-w-[300px]">
                <p className="text-sm font-black text-slate-900 italic tracking-tight uppercase">
                  {numberToWords(slipData.netPay)} Only
                </p>
              </div>
              <p className="text-[9px] text-slate-300 mt-12 font-black uppercase tracking-[0.5em] opacity-50">
                System Generated Digital Receipt
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

