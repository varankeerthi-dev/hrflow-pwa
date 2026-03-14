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
            className="bg-white rounded-2xl border border-gray-100 shadow-xl p-10 max-w-4xl mx-auto"
            style={{ fontFamily: 'Roboto, sans-serif' }}
          >
            <div className="border-b-4 border-gray-900 pb-6 mb-8 flex justify-between items-start">
              <div>
                <h1 className="text-3xl font-black text-gray-900 uppercase tracking-tighter leading-none">
                  {user?.orgName || 'ORGANISATION'}
                </h1>
                <p className="text-[11px] text-gray-400 font-bold uppercase tracking-[0.2em] mt-3">
                  Personnel Remuneration Advice
                </p>
              </div>
              <div className="text-right">
                <h2 className="text-xl font-black text-gray-800 tracking-tight uppercase">Monthly Payslip</h2>
                <p className="text-sm font-black text-indigo-600 uppercase mt-1 px-3 py-1 bg-indigo-50 rounded-full inline-block">
                  {slipData.month}
                </p>
              </div>
            </div>

            <div className="flex justify-between items-start mb-10">
              <div className="space-y-2 text-[13px]">
                <p className="font-black text-gray-900 uppercase tracking-widest text-[10px] mb-4 border-b-2 border-indigo-100 pb-1 inline-block">
                  STAFF IDENTIFICATION
                </p>
                <div className="flex gap-6">
                  <span className="w-36 text-gray-400 font-bold uppercase text-[10px]">Staff Name</span>
                  <span className="font-bold text-gray-800 uppercase">: {slipData.employee.name}</span>
                </div>
                <div className="flex gap-6">
                  <span className="w-36 text-gray-400 font-bold uppercase text-[10px]">Employee ID</span>
                  <span className="font-bold text-gray-800 uppercase">: {slipData.employee.empCode}</span>
                </div>
                <div className="flex gap-6">
                  <span className="w-36 text-gray-400 font-bold uppercase text-[10px]">Department</span>
                  <span className="font-bold text-gray-800 uppercase">: {slipData.employee.department}</span>
                </div>
                <div className="flex gap-6">
                  <span className="w-36 text-gray-400 font-bold uppercase text-[10px]">Pay Period</span>
                  <span className="font-bold text-gray-800 uppercase">: {slipData.month}</span>
                </div>
              </div>

              <div className="border-2 border-green-600 rounded-2xl p-6 text-center min-w-[240px] bg-green-50/20 shadow-xl shadow-green-900/5">
                <p className="text-[10px] font-black text-green-700 uppercase tracking-widest mb-2">
                  FINAL NET PAYABLE
                </p>
                <p className="text-4xl font-black text-green-800 tracking-tighter">{formatINR(slipData.netPay)}</p>
                <div className="mt-6 pt-4 border-t border-green-200/50 flex justify-between text-[11px] font-black text-green-700 uppercase">
                  <span>Paid: {slipData.paidDays}d</span>
                  <span>LOP: {slipData.lopDays}d</span>
                </div>
              </div>
            </div>

            <div className="border-2 border-gray-900 rounded-2xl overflow-hidden mb-10">
              <div className="grid grid-cols-2 bg-gray-900 divide-x-2 divide-gray-800">
                <div className="flex justify-between p-4 font-black text-[11px] uppercase tracking-[0.2em] text-white">
                  <span>EARNINGS</span>
                  <span>INR (₹)</span>
                </div>
                <div className="flex justify-between p-4 font-black text-[11px] uppercase tracking-[0.2em] text-white">
                  <span>DEDUCTIONS</span>
                  <span>INR (₹)</span>
                </div>
              </div>
              <div className="grid grid-cols-2 divide-x-2 divide-gray-900">
                <div className="p-0">
                  <div className="flex justify-between p-4 border-b border-gray-50 text-[13px] font-medium text-gray-600 italic">
                    <span>Basic Component</span>
                    <span className="font-bold text-gray-900 not-italic">{formatINR(slipData.basic)}</span>
                  </div>
                  <div className="flex justify-between p-4 border-b border-gray-50 text-[13px] font-medium text-gray-600 italic">
                    <span>H.R.A (Allowances)</span>
                    <span className="font-bold text-gray-900 not-italic">{formatINR(slipData.hra)}</span>
                  </div>
                  {slipData.otPay > 0 && (
                    <div className="flex justify-between p-4 border-b border-gray-50 text-[13px] font-bold text-indigo-600 bg-indigo-50/30">
                      <span>Overtime ({slipData.finalOT}h)</span>
                      <span>{formatINR(slipData.otPay)}</span>
                    </div>
                  )}
                </div>
                <div className="p-0">
                  <div className="flex justify-between p-4 border-b border-gray-50 text-[13px] font-medium text-gray-600 italic">
                    <span>Statutory Tax (IT)</span>
                    <span className="font-bold text-gray-900 not-italic">{formatINR(slipData.it)}</span>
                  </div>
                  <div className="flex justify-between p-4 border-b border-gray-50 text-[13px] font-medium text-gray-600 italic">
                    <span>Provident Fund (PF)</span>
                    <span className="font-bold text-gray-900 not-italic">{formatINR(slipData.pf)}</span>
                  </div>
                  {slipData.advanceDeduction > 0 && (
                    <div className="flex justify-between p-4 border-b border-gray-50 text-[13px] font-bold text-red-600 bg-red-50/30">
                      <span>Advance Recovery</span>
                      <span>{formatINR(slipData.advanceDeduction)}</span>
                    </div>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 divide-x-2 divide-gray-900 bg-gray-50 border-t-2 border-gray-900 font-black">
                <div className="flex justify-between p-4 text-[13px] uppercase text-gray-900">
                  <span>Gross Earnings</span>
                  <span>{formatINR(slipData.grossEarnings)}</span>
                </div>
                <div className="flex justify-between p-4 text-[13px] uppercase text-gray-900">
                  <span>Total Deductions</span>
                  <span>{formatINR(slipData.totalDeductions)}</span>
                </div>
              </div>
            </div>

            <div className="bg-gray-900 text-white rounded-2xl p-6 flex justify-between items-center mb-10 shadow-2xl">
              <div>
                <h3 className="text-xl font-black uppercase tracking-[0.25em]">TOTAL NET DISBURSEMENT</h3>
                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1">
                  Calculated as: Gross - Deductions
                </p>
              </div>
              <div className="text-4xl font-black tracking-tighter text-white">{formatINR(slipData.netPay)}</div>
            </div>

            <div className="text-center text-[12px] font-bold text-gray-700 italic border-t-2 border-dashed border-gray-100 pt-10">
              Amount In Words:{' '}
              <span className="uppercase text-gray-900 not-italic">
                Indian Rupee {numberToWords(slipData.netPay)} Only
              </span>
              <p className="text-[9px] text-gray-400 mt-6 not-italic font-black uppercase tracking-[0.3em] opacity-50">
                -- System Authenticated Document --
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

