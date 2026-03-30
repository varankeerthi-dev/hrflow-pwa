import React, { useState, useEffect } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { db } from '../../lib/firebase'
import { doc, getDoc } from 'firebase/firestore'
import { formatINR, numberToWords } from '../../lib/salaryUtils'
import { Wallet, Download } from 'lucide-react'
import { Document, Page, StyleSheet, Text, View, pdf } from '@react-pdf/renderer'

const dashIfZero = (val) => (!val || val === 0 || val === '0') ? '-' : formatINR(val)

const pdfStyles = StyleSheet.create({
  page: { padding: 28, fontSize: 10, fontFamily: 'Helvetica', color: '#0f172a' },
  header: { borderBottomWidth: 2, borderBottomColor: '#0f172a', paddingBottom: 14, marginBottom: 20, flexDirection: 'row', justifyContent: 'space-between' },
  title: { fontSize: 20, fontWeight: 'bold', textTransform: 'uppercase' },
  subhead: { fontSize: 8, color: '#4f46e5', marginTop: 4, letterSpacing: 1.2 },
  infoGrid: { flexDirection: 'row', gap: 20, marginBottom: 20 },
  infoCol: { flex: 1 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  infoLabel: { fontSize: 9, color: '#64748b', fontWeight: 'bold' },
  infoValue: { fontSize: 9, color: '#0f172a', fontWeight: 'bold' },
  sectionWrap: { borderWidth: 1, borderColor: '#0f172a', borderRadius: 8, overflow: 'hidden', marginBottom: 20 },
  sectionHead: { flexDirection: 'row', backgroundColor: '#0f172a', color: '#ffffff' },
  sectionTitle: { flex: 1, padding: 8, fontSize: 8, fontWeight: 'bold', letterSpacing: 1 },
  sectionBody: { flexDirection: 'row' },
  sectionCol: { flex: 1 },
  sectionColBorder: { flex: 1, borderRightWidth: 1, borderRightColor: '#e2e8f0' },
  moneyRow: { flexDirection: 'row', justifyContent: 'space-between', padding: 8, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  moneyLabel: { fontSize: 9, color: '#475569' },
  moneyValue: { fontSize: 9, fontWeight: 'bold', color: '#0f172a' },
  totalRowWrap: { flexDirection: 'row', backgroundColor: '#0f172a', borderTopWidth: 1, borderTopColor: '#0f172a' },
  totalRow: { flex: 1, flexDirection: 'row', justifyContent: 'space-between', padding: 8 },
  totalBorder: { borderRightWidth: 1, borderRightColor: '#334155' },
  totalLabel: { fontSize: 8, fontWeight: 'bold', color: '#94a3b8' },
  totalValue: { fontSize: 8, fontWeight: 'bold', color: '#ffffff' },
  netWrap: { textAlign: 'center', paddingTop: 18, borderTopWidth: 1, borderTopColor: '#e2e8f0', borderStyle: 'dashed' },
  netLabel: { fontSize: 8, color: '#64748b', fontWeight: 'bold', marginBottom: 4, letterSpacing: 1 },
  netValue: { fontSize: 16, fontWeight: 'bold', color: '#0f172a', marginBottom: 6 },
  netWords: { fontSize: 9, fontWeight: 'bold', color: '#0f172a', textTransform: 'uppercase' },
})

const EmployeeSlipPDF = ({ slipData, orgName }) => (
  <Document>
    <Page size="A4" style={pdfStyles.page}>
      <View style={pdfStyles.header}>
        <View>
          <Text style={pdfStyles.title}>{orgName || 'ORGANISATION'}</Text>
          <Text style={pdfStyles.subhead}>REMUNERATION ADVICE</Text>
        </View>
        <View style={{ textAlign: 'right' }}>
          <Text style={{ fontSize: 14, fontWeight: 'bold', color: '#0f172a' }}>PAYSLIP</Text>
          <Text style={{ fontSize: 8, color: '#64748b', marginTop: 4 }}>
            {slipData?.month ? new Date(slipData.month + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : '-'}
          </Text>
        </View>
      </View>

      <View style={pdfStyles.infoGrid}>
        <View style={pdfStyles.infoCol}>
          <View style={pdfStyles.infoRow}><Text style={pdfStyles.infoLabel}>Name of the Employee</Text><Text style={pdfStyles.infoValue}>{slipData.employee?.name || '-'}</Text></View>
          <View style={pdfStyles.infoRow}><Text style={pdfStyles.infoLabel}>Employee No</Text><Text style={pdfStyles.infoValue}>{slipData.employee?.empCode || '-'}</Text></View>
          <View style={pdfStyles.infoRow}><Text style={pdfStyles.infoLabel}>Designation</Text><Text style={pdfStyles.infoValue}>{slipData.employee?.designation || '-'}</Text></View>
          <View style={pdfStyles.infoRow}><Text style={pdfStyles.infoLabel}>DOB</Text><Text style={pdfStyles.infoValue}>{slipData.employee?.dob || '-'}</Text></View>
          <View style={pdfStyles.infoRow}><Text style={pdfStyles.infoLabel}>DOJ</Text><Text style={pdfStyles.infoValue}>{slipData.employee?.doj || '-'}</Text></View>
          <View style={pdfStyles.infoRow}><Text style={pdfStyles.infoLabel}>Total No. of Days</Text><Text style={pdfStyles.infoValue}>{slipData.totalMonthDays}</Text></View>
        </View>
        <View style={pdfStyles.infoCol}>
          <View style={pdfStyles.infoRow}><Text style={pdfStyles.infoLabel}>No. of Working Days</Text><Text style={pdfStyles.infoValue}>{slipData.workedDaysCount}</Text></View>
          <View style={pdfStyles.infoRow}><Text style={pdfStyles.infoLabel}>Worked Holidays</Text><Text style={pdfStyles.infoValue}>{slipData.holidayWorkedCount || 0}</Text></View>
          <View style={pdfStyles.infoRow}><Text style={pdfStyles.infoLabel}>No. of Holidays</Text><Text style={pdfStyles.infoValue}>{slipData.sundayCount || 0}</Text></View>
          <View style={pdfStyles.infoRow}><Text style={pdfStyles.infoLabel}>No. of Leave Taken</Text><Text style={pdfStyles.infoValue}>{slipData.lopDays || 0}</Text></View>
          <View style={pdfStyles.infoRow}><Text style={pdfStyles.infoLabel}>No. of days Paid</Text><Text style={pdfStyles.infoValue}>{slipData.paidDays || 0}</Text></View>
        </View>
      </View>

      <View style={{flexDirection:'row', justifyContent:'center', gap:40, marginBottom:16, paddingVertical:12, backgroundColor:'#f8fafc', borderRadius:8}}>
        <View style={{alignItems:'center'}}>
          <Text style={{fontSize:8, fontFamily:'Helvetica', color:'#64748b', fontWeight:'bold', marginBottom:2}}>BASIC</Text>
          <Text style={{fontSize:11, fontFamily:'Helvetica', color:'#0f172a', fontWeight:'bold'}}>{formatINR(slipData.basic || 0)}</Text>
        </View>
        <View style={{alignItems:'center'}}>
          <Text style={{fontSize:8, fontFamily:'Helvetica', color:'#64748b', fontWeight:'bold', marginBottom:2}}>HRA</Text>
          <Text style={{fontSize:11, fontFamily:'Helvetica', color:'#0f172a', fontWeight:'bold'}}>{formatINR(slipData.hra || 0)}</Text>
        </View>
        <View style={{alignItems:'center'}}>
          <Text style={{fontSize:8, fontFamily:'Helvetica', color:'#64748b', fontWeight:'bold', marginBottom:2}}>SALARY</Text>
          <Text style={{fontSize:11, fontFamily:'Helvetica', color:'#0f172a', fontWeight:'bold'}}>{formatINR((slipData.basic || 0) + (slipData.hra || 0))}</Text>
        </View>
      </View>

      <View style={pdfStyles.sectionWrap}>
        <View style={pdfStyles.sectionHead}>
          <Text style={pdfStyles.sectionTitle}>EARNINGS</Text>
          <Text style={pdfStyles.sectionTitle}>DEDUCTIONS</Text>
        </View>
        <View style={pdfStyles.sectionBody}>
          <View style={pdfStyles.sectionColBorder}>
            <View style={pdfStyles.moneyRow}><Text style={pdfStyles.moneyLabel}>Basic Salary</Text><Text style={pdfStyles.moneyValue}>{formatINR(slipData.basic)}</Text></View>
            <View style={pdfStyles.moneyRow}><Text style={pdfStyles.moneyLabel}>Allowances (HRA)</Text><Text style={pdfStyles.moneyValue}>{formatINR(slipData.hra)}</Text></View>
            <View style={pdfStyles.moneyRow}><Text style={pdfStyles.moneyLabel}>Expense</Text><Text style={pdfStyles.moneyValue}>{dashIfZero(slipData.expenseReimbursement)}</Text></View>
            <View style={pdfStyles.moneyRow}><Text style={pdfStyles.moneyLabel}>Sunday Worked</Text><Text style={pdfStyles.moneyValue}>{dashIfZero(slipData.sundayPay)}</Text></View>
            <View style={{ ...pdfStyles.moneyRow, borderBottomWidth: 0 }}><Text style={pdfStyles.moneyLabel}>OT</Text><Text style={pdfStyles.moneyValue}>{dashIfZero(slipData.otPay)}</Text></View>
          </View>
          <View style={pdfStyles.sectionCol}>
            <View style={pdfStyles.moneyRow}><Text style={pdfStyles.moneyLabel}>PF</Text><Text style={pdfStyles.moneyValue}>{dashIfZero(slipData.pf)}</Text></View>
            <View style={pdfStyles.moneyRow}><Text style={pdfStyles.moneyLabel}>ESI</Text><Text style={pdfStyles.moneyValue}>{dashIfZero(slipData.esi || 0)}</Text></View>
            <View style={pdfStyles.moneyRow}><Text style={pdfStyles.moneyLabel}>Advance Recovery</Text><Text style={pdfStyles.moneyValue}>{dashIfZero(slipData.advanceDeduction)}</Text></View>
            <View style={pdfStyles.moneyRow}><Text style={pdfStyles.moneyLabel}>Loan Recovery</Text><Text style={pdfStyles.moneyValue}>{dashIfZero(slipData.loanEMI)}</Text></View>
            <View style={{ ...pdfStyles.moneyRow, borderBottomWidth: 0 }}><Text style={pdfStyles.moneyLabel}>Fine / Penalties</Text><Text style={pdfStyles.moneyValue}>{dashIfZero(slipData.fineAmount)}</Text></View>
          </View>
        </View>
        <View style={pdfStyles.totalRowWrap}>
          <View style={{ ...pdfStyles.totalRow, ...pdfStyles.totalBorder }}><Text style={pdfStyles.totalLabel}>Gross Earnings</Text><Text style={pdfStyles.totalValue}>{formatINR(slipData.grossEarnings)}</Text></View>
          <View style={pdfStyles.totalRow}><Text style={pdfStyles.totalLabel}>Total Deductions</Text><Text style={pdfStyles.totalValue}>{formatINR(slipData.totalDeductions)}</Text></View>
        </View>
      </View>

      <View style={pdfStyles.netWrap}>
        <Text style={pdfStyles.netLabel}>FINAL DISBURSEMENT VALUE</Text>
        <Text style={pdfStyles.netValue}>{formatINR(slipData.netPay)}</Text>
        <Text style={pdfStyles.netWords}>{numberToWords(slipData.netPay)} Only</Text>
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

export default function EmployeeSalarySlipTab() {
  const { user } = useAuth()
  const [month, setMonth] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })
  const [status, setStatus] = useState('checking')
  const [slipData, setSlipData] = useState(null)
  const [exportingPdf, setExportingPdf] = useState(false)

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

  const handleExportPdf = async () => {
    if (!slipData || exportingPdf) return

    try {
      setExportingPdf(true)
      const blob = await pdf(<EmployeeSlipPDF slipData={slipData} orgName={user?.orgName || 'Organization'} />).toBlob()
      const fileName = `SalarySlip_${(user?.name || 'Employee').replace(/\s+/g, '_')}_${month}.pdf`
      downloadPdfBlob(blob, fileName)
    } catch (error) {
      console.error('Employee salary slip export failed', error)
      alert('Failed to export PDF. Please try again.')
    } finally {
      setExportingPdf(false)
    }
  }

  return (
    <div className="flex flex-col h-full bg-[#fbfbfb] -m-6 font-inter text-gray-900 overflow-hidden">
      <div className="bg-white border-b border-gray-200 p-4 flex justify-between items-center shrink-0">
        <div>
          <h1 className="text-xl font-black text-gray-900 font-google-sans tracking-tight uppercase leading-none">My Payslip</h1>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-[13px] font-black text-slate-400 uppercase tracking-widest">Period:</span>
            <input
              type="month"
              value={month}
              onChange={e => setMonth(e.target.value)}
              className="border-none p-0 text-[13px] font-black text-indigo-600 bg-transparent cursor-pointer outline-none uppercase"
            />
          </div>
        </div>
        {status === 'available' && slipData && (
          <button
            onClick={handleExportPdf}
            disabled={exportingPdf}
            className="h-9 px-5 bg-indigo-600 text-white font-black rounded-xl text-[13px] uppercase tracking-widest shadow-lg shadow-indigo-600/20 flex items-center gap-2 hover:bg-indigo-700 active:scale-95 transition-all"
          >
            <Download size={14} />
            {exportingPdf ? 'Preparing PDF...' : 'Export PDF'}
          </button>
        )}
      </div>

      {status === 'checking' && (
        <div className="flex-1 flex items-center justify-center">
          <Spinner />
        </div>
      )}

      {status === 'unavailable' && (
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="bg-white border border-gray-100 shadow-xl rounded-[24px] p-10 text-center max-w-sm">
            <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center mx-auto mb-6 border border-slate-100">
              <Wallet size={32} className="text-slate-300" />
            </div>
            <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight mb-2">No Statement</h3>
            <p className="text-[13px] text-slate-500 mt-2 leading-relaxed font-medium">Your remuneration statement for {month} is not yet available.</p>
          </div>
        </div>
      )}

      {status === 'available' && slipData && (
        <div className="flex-1 overflow-hidden flex flex-col items-center justify-center p-4">
          <div
            className="bg-white rounded-[24px] border-2 border-black shadow-2xl p-8 w-full max-w-4xl max-h-full overflow-auto relative"
            style={{ fontFamily: "'Inter', sans-serif" }}
          >
            <div className="absolute top-0 left-0 right-0 h-1.5 bg-indigo-600"></div>
            
            <div className="border-b-2 border-slate-900 pb-4 mb-6 flex justify-between items-end">
              <div>
                <h1 className="text-3xl font-black text-slate-900 uppercase tracking-tighter leading-none font-google-sans">
                  {user?.orgName || 'ORGANISATION'}
                </h1>
                <p className="text-[13px] text-indigo-600 font-black uppercase tracking-[0.2em] mt-3 flex items-center gap-2">
                  <span className="w-6 h-0.5 bg-indigo-600"></span>
                  Remuneration Advice
                </p>
              </div>
              <div className="text-right">
                <h2 className="text-xl font-black text-slate-900 tracking-tight uppercase font-google-sans italic leading-none">Payslip</h2>
                <p className="text-[13px] font-black text-slate-400 uppercase tracking-wide mt-2 bg-slate-50 px-2 py-0.5 rounded border border-slate-100 inline-block">
                  {new Date(slipData.month + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-x-12 gap-y-1 mb-8 relative z-10 px-2">
              <div className="flex justify-between border-b border-slate-100 py-1.5">
                <span className="text-[13px] font-black text-slate-400 uppercase tracking-tight">Name of the Employee</span>
                <span className="text-[13px] font-bold text-slate-900 uppercase">{slipData.employee?.name}</span>
              </div>
              <div className="flex justify-between border-b border-slate-100 py-1.5">
                <span className="text-[13px] font-black text-slate-400 uppercase tracking-tight">No.of Working Days</span>
                <span className="text-[13px] font-bold text-slate-900">{slipData.workedDaysCount}</span>
              </div>
              <div className="flex justify-between border-b border-slate-100 py-1.5">
                <span className="text-[13px] font-black text-slate-400 uppercase tracking-tight">Employee N0</span>
                <span className="text-[13px] font-bold text-slate-900 uppercase">{slipData.employee?.empCode}</span>
              </div>
              <div className="flex justify-between border-b border-slate-100 py-1.5">
                <span className="text-[13px] font-black text-slate-400 uppercase tracking-tight">Worked Holidays</span>
                <span className="text-[13px] font-bold text-slate-900">{slipData.holidayWorkedCount || 0}</span>
              </div>
              <div className="flex justify-between border-b border-slate-100 py-1.5">
                <span className="text-[13px] font-black text-slate-400 uppercase tracking-tight">Designation</span>
                <span className="text-[13px] font-bold text-slate-900 uppercase">{slipData.employee?.designation || '-'}</span>
              </div>
              <div className="flex justify-between border-b border-slate-100 py-1.5">
                <span className="text-[13px] font-black text-slate-400 uppercase tracking-tight">No.of Holidays</span>
                <span className="text-[13px] font-bold text-slate-900">{slipData.sundayCount}</span>
              </div>
              <div className="flex justify-between border-b border-slate-100 py-1.5">
                <span className="text-[13px] font-black text-slate-400 uppercase tracking-tight">DOB</span>
                <span className="text-[13px] font-bold text-slate-900">{slipData.employee?.dob || '-'}</span>
              </div>
              <div className="flex justify-between border-b border-slate-100 py-1.5">
                <span className="text-[13px] font-black text-slate-400 uppercase tracking-tight">No. of Leave Taken</span>
                <span className="text-[13px] font-bold text-slate-900">{slipData.lopDays}</span>
              </div>
              <div className="flex justify-between border-b border-slate-100 py-1.5">
                <span className="text-[13px] font-black text-slate-400 uppercase tracking-tight">DOJ</span>
                <span className="text-[13px] font-bold text-slate-900">{slipData.employee?.doj || '-'}</span>
              </div>
              <div className="flex justify-between border-b border-slate-100 py-1.5">
                <span className="text-[13px] font-black text-slate-400 uppercase tracking-tight">No. of days Paid</span>
                <span className="text-[13px] font-bold text-slate-900">{slipData.paidDays}</span>
              </div>
              <div className="flex justify-between border-b border-slate-100 py-1.5">
                <span className="text-[13px] font-black text-slate-400 uppercase tracking-tight">Total No. of Days</span>
                <span className="text-[13px] font-bold text-slate-900">{slipData.totalMonthDays}</span>
              </div>
            </div>

            <div className="border border-slate-200 rounded-[24px] overflow-hidden mb-8 shadow-sm bg-slate-50/30">
              <div className="grid grid-cols-2 bg-slate-950 divide-x divide-slate-800">
                <div className="flex justify-between p-4 font-black text-[13px] uppercase tracking-[0.16em] text-white">
                  <span className="flex items-center gap-2"><span className="w-1.5 h-1.5 bg-indigo-500 rounded-full"></span> Earnings</span>
                  <span className="text-slate-500">INR</span>
                </div>
                <div className="flex justify-between p-4 font-black text-[13px] uppercase tracking-[0.16em] text-white">
                  <span className="flex items-center gap-2"><span className="w-1.5 h-1.5 bg-rose-500 rounded-full"></span> Deductions</span>
                  <span className="text-slate-500">INR</span>
                </div>
              </div>
              <div className="grid grid-cols-2 divide-x divide-slate-200">
                <div className="p-1 space-y-0.5 bg-white">
                  <div className="flex justify-between p-3 rounded-xl hover:bg-slate-50 transition-colors text-[13px] font-medium text-slate-600">
                    <span>Basic Remuneration</span>
                    <span className="font-bold text-slate-900">{formatINR(slipData.basic)}</span>
                  </div>
                  <div className="flex justify-between p-3 rounded-xl hover:bg-slate-50 transition-colors text-[13px] font-medium text-slate-600">
                    <span>HRA (Allowances)</span>
                    <span className="font-bold text-slate-900">{formatINR(slipData.hra)}</span>
                  </div>
                  <div className="flex justify-between p-3 rounded-xl hover:bg-slate-50 transition-colors text-[13px] font-medium text-slate-600">
                    <span>Expense</span>
                    <span className="font-bold text-slate-900">{dashIfZero(slipData.expenseReimbursement)}</span>
                  </div>
                  <div className="flex justify-between p-3 rounded-xl hover:bg-slate-50 transition-colors text-[13px] font-medium text-slate-600">
                    <span>Sunday Worked</span>
                    <span className="font-bold text-slate-900">{dashIfZero(slipData.sundayPay)}</span>
                  </div>
                  <div className="flex justify-between p-3 rounded-xl hover:bg-slate-50 transition-colors text-[13px] font-medium text-slate-600">
                    <span>OT</span>
                    <span className="font-bold text-slate-900">{dashIfZero(slipData.otPay)}</span>
                  </div>
                </div>
                <div className="p-1 space-y-0.5 bg-white">
                  <div className="flex justify-between p-3 rounded-xl hover:bg-slate-50 transition-colors text-[13px] font-medium text-slate-600">
                    <span>PF</span>
                    <span className="font-bold text-slate-900">{dashIfZero(slipData.pf)}</span>
                  </div>
                  <div className="flex justify-between p-3 rounded-xl hover:bg-slate-50 transition-colors text-[13px] font-medium text-slate-600">
                    <span>ESI</span>
                    <span className="font-bold text-slate-900">{dashIfZero(slipData.esi || 0)}</span>
                  </div>
                  <div className="flex justify-between p-3 rounded-xl hover:bg-slate-50 transition-colors text-[13px] font-medium text-slate-600">
                    <span>Advance Recovery</span>
                    <span className="font-bold text-slate-900">{dashIfZero(slipData.advanceDeduction)}</span>
                  </div>
                  <div className="flex justify-between p-3 rounded-xl hover:bg-slate-50 transition-colors text-[13px] font-medium text-slate-600">
                    <span>Loan Recovery</span>
                    <span className="font-bold text-slate-900">{dashIfZero(slipData.loanEMI)}</span>
                  </div>
                  <div className="flex justify-between p-3 rounded-xl hover:bg-slate-50 transition-colors text-[13px] font-medium text-slate-600">
                    <span>Fine / Penalties</span>
                    <span className="font-bold text-slate-900">{dashIfZero(slipData.fineAmount)}</span>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 divide-x divide-slate-950 bg-slate-950 border-t border-slate-800 font-black">
                <div className="flex justify-between p-4 text-[13px] uppercase text-white tracking-wide">
                  <span className="text-slate-400">Gross Payout</span>
                  <span>{formatINR(slipData.grossEarnings)}</span>
                </div>
                <div className="flex justify-between p-4 text-[13px] uppercase text-white tracking-wide">
                  <span className="text-slate-400">Total Retained</span>
                  <span className="text-rose-400">{formatINR(slipData.totalDeductions)}</span>
                </div>
              </div>
            </div>

            <div className="text-center pt-2">
              <p className="text-[13px] font-bold text-slate-500 uppercase tracking-wide mb-3">
                NET DISBURSEMENT
              </p>
              <div className="bg-slate-950 text-white rounded-xl p-4 inline-block min-w-[350px] shadow-xl">
                <p className="text-[14px] font-black tracking-tight text-white mb-1">{formatINR(slipData.netPay)}</p>
                <p className="text-[13px] font-black text-white italic tracking-tight uppercase">
                  {numberToWords(slipData.netPay)} Only
                </p>
              </div>
              <p className="text-[8px] text-slate-300 mt-8 font-black uppercase tracking-[0.5em] opacity-50">
                System Generated Digital Artifact • System Authenticated
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Spinner() {
  return (
    <div className="flex flex-col items-center gap-4">
      <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Processing...</p>
    </div>
  )
}
