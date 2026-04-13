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
  if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
    const [year, month, day] = dateStr.split('-');
    return `${day}/${month}/${year}`;
  }
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

const formatMonthDisplay = (monthStr) => {
  if (!monthStr) return '-';
  if (monthStr.match(/^\d{4}-\d{2}$/)) {
    const [year, month] = monthStr.split('-');
    return `${month}/${year}`;
  }
  return monthStr;
};

const formatSummaryCurrency = (value) => `₹${Math.round(Number(value) || 0).toLocaleString('en-IN')}`

const DETAILED_SUMMARY_COLUMNS = [
  { id: 'sno', label: 'S.No', index: 1 },
  { id: 'empNo', label: 'Emp No', index: 2 },
  { id: 'name', label: 'Name', index: 3, mandatory: true },
  { id: 'designation', label: 'Designation', index: 4, mandatory: true },
  { id: 'basicCtc', label: 'Basic (CTC)', index: 5, mandatory: true },
  { id: 'hraCtc', label: 'HRA (CTC)', index: 6, mandatory: true },
  { id: 'salaryCtc', label: 'Salary (CTC)', index: 7, mandatory: true },
  { id: 'days', label: 'Days', index: 8 },
  { id: 'worked', label: 'Worked', index: 9 },
  { id: 'sunWorked', label: 'Sun Worked', index: 10 },
  { id: 'holidayWorked', label: 'Holiday Worked', index: 11 },
  { id: 'leave', label: 'Leave', index: 12 },
  { id: 'paidDays', label: 'Paid', index: 13 },
  { id: 'basicPaid', label: 'Basic (Paid)', index: 14 },
  { id: 'hraPaid', label: 'HRA (Paid)', index: 15 },
  { id: 'salaryPaid', label: 'Salary (Paid)', index: 16 },
  { id: 'sundayPay', label: 'Sun Pay', index: 17 },
  { id: 'otPay', label: 'OT', index: 18 },
  { id: 'earnings', label: 'Earn', index: 19 },
  { id: 'pf', label: 'PF', index: 20 },
  { id: 'esi', label: 'ESI', index: 21 },
  { id: 'advance', label: 'Adv', index: 22 },
  { id: 'vr', label: 'VR', index: 23 },
  { id: 'ded', label: 'Ded', index: 24 },
  { id: 'totalDed', label: 'Tot Ded', index: 25 },
  { id: 'net', label: 'Net', index: 26 },
]

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

const DetailedSalarySummaryPDF = ({ data, month, orgName }) => (
  <Document>
    <Page size="A4" orientation="landscape" style={{ padding: 15, fontSize: 6, fontFamily: 'Helvetica' }}>
      <View style={{ marginBottom: 10, borderBottom: 1, borderColor: '#000', paddingBottom: 5, flexDirection: 'row', justifyContent: 'space-between' }}>
        <View>
          <Text style={{ fontSize: 12, fontWeight: 'bold' }}>{orgName}</Text>
          <Text style={{ fontSize: 7, marginTop: 2 }}>DETAILED PAYROLL SUMMARY - {new Date(month + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</Text>
        </View>
      </View>
      <View style={{ borderWidth: 0.5, borderColor: '#000' }}>
        <View style={{ flexDirection: 'row', backgroundColor: '#f3f4f6', fontWeight: 'bold', borderBottomWidth: 0.5 }}>
          <Text style={{ width: 20, padding: 2, borderRightWidth: 0.5 }}>SNo</Text>
          <Text style={{ width: 35, padding: 2, borderRightWidth: 0.5 }}>ID</Text>
          <Text style={{ flex: 1.5, padding: 2, borderRightWidth: 0.5 }}>Name</Text>
          <Text style={{ width: 35, padding: 2, borderRightWidth: 0.5, textAlign: 'right' }}>Basic</Text>
          <Text style={{ width: 35, padding: 2, borderRightWidth: 0.5, textAlign: 'right' }}>HRA</Text>
          <Text style={{ width: 35, padding: 2, borderRightWidth: 0.5, textAlign: 'right' }}>CTC</Text>
          <Text style={{ width: 20, padding: 2, borderRightWidth: 0.5, textAlign: 'center' }}>Pd</Text>
          <Text style={{ width: 35, padding: 2, borderRightWidth: 0.5, textAlign: 'right' }}>Basic.P</Text>
          <Text style={{ width: 35, padding: 2, borderRightWidth: 0.5, textAlign: 'right' }}>HRA.P</Text>
          <Text style={{ width: 35, padding: 2, borderRightWidth: 0.5, textAlign: 'right' }}>Earn</Text>
          <Text style={{ width: 35, padding: 2, borderRightWidth: 0.5, textAlign: 'right' }}>PF</Text>
          <Text style={{ width: 35, padding: 2, borderRightWidth: 0.5, textAlign: 'right' }}>Adv</Text>
          <Text style={{ width: 35, padding: 2, borderRightWidth: 0.5, textAlign: 'right' }}>Loan</Text>
          <Text style={{ width: 35, padding: 2, borderRightWidth: 0.5, textAlign: 'right' }}>TotDed</Text>
          <Text style={{ width: 45, padding: 2, textAlign: 'right' }}>Net</Text>
        </View>
        {data.map((row, i) => (
          <View key={i} style={{ flexDirection: 'row', borderBottomWidth: 0.5 }}>
            <Text style={{ width: 20, padding: 2, borderRightWidth: 0.5 }}>{row.sno}</Text>
            <Text style={{ width: 35, padding: 2, borderRightWidth: 0.5 }}>{row.empId}</Text>
            <Text style={{ flex: 1.5, padding: 2, borderRightWidth: 0.5 }}>{row.name}</Text>
            <Text style={{ width: 35, padding: 2, borderRightWidth: 0.5, textAlign: 'right' }}>{Math.round(row.fullBasic)}</Text>
            <Text style={{ width: 35, padding: 2, borderRightWidth: 0.5, textAlign: 'right' }}>{Math.round(row.fullHra)}</Text>
            <Text style={{ width: 35, padding: 2, borderRightWidth: 0.5, textAlign: 'right' }}>{Math.round(row.fullBasic + row.fullHra)}</Text>
            <Text style={{ width: 20, padding: 2, borderRightWidth: 0.5, textAlign: 'center' }}>{row.totalWorkingDays}</Text>
            <Text style={{ width: 35, padding: 2, borderRightWidth: 0.5, textAlign: 'right' }}>{Math.round(row.basic)}</Text>
            <Text style={{ width: 35, padding: 2, borderRightWidth: 0.5, textAlign: 'right' }}>{Math.round(row.hra)}</Text>
            <Text style={{ width: 35, padding: 2, borderRightWidth: 0.5, textAlign: 'right' }}>{Math.round(row.totalEarnings)}</Text>
            <Text style={{ width: 35, padding: 2, borderRightWidth: 0.5, textAlign: 'right' }}>{Math.round(row.pf)}</Text>
            <Text style={{ width: 35, padding: 2, borderRightWidth: 0.5, textAlign: 'right' }}>{Math.round(row.advanceAmount)}</Text>
            <Text style={{ width: 35, padding: 2, borderRightWidth: 0.5, textAlign: 'right' }}>{Math.round(row.loanE)}</Text>
            <Text style={{ width: 35, padding: 2, borderRightWidth: 0.5, textAlign: 'right' }}>{Math.round(row.totalDeductions)}</Text>
            <Text style={{ width: 45, padding: 2, textAlign: 'right', fontWeight: 'bold' }}>{Math.round(row.salary.net)}</Text>
          </View>
        ))}
        <View style={{ flexDirection: 'row', backgroundColor: '#ef4444', color: '#fff', fontWeight: 'bold' }}>
          <Text style={{ flex: 1, padding: 3, textAlign: 'right' }}>GRAND TOTAL NET PAYOUT:</Text>
          <Text style={{ width: 45, padding: 3, textAlign: 'right' }}>{Math.round(data.reduce((sum, r) => sum + r.salary.net, 0)).toLocaleString('en-IN')}</Text>
        </View>
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
  const [exportingDetailedPdf, setExportingDetailedPdf] = useState(false)
  const [selectedDetailedColumns, setSelectedDetailedColumns] = useState(() => DETAILED_SUMMARY_COLUMNS.map((column) => column.id))
  const [showDetailedColumnPicker, setShowDetailedColumnPicker] = useState(false)
  const [isSavingPreferences, setIsSavingPreferences] = useState(false)
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
  
  const [loanActiveModule, setLoanActiveModule] = useState('Active Schedules')
  const mandatoryDetailedColumnIds = useMemo(
    () => DETAILED_SUMMARY_COLUMNS.filter((column) => column.mandatory).map((column) => column.id),
    []
  )
  const visibleDetailedSummaryColumns = useMemo(() => {
    const selectedSet = new Set([...selectedDetailedColumns, ...mandatoryDetailedColumnIds])
    return DETAILED_SUMMARY_COLUMNS.filter((column) => selectedSet.has(column.id))
  }, [selectedDetailedColumns, mandatoryDetailedColumnIds])
  const hiddenDetailedSummaryColumnIndexes = useMemo(() => {
    const visibleSet = new Set(visibleDetailedSummaryColumns.map((column) => column.id))
    return DETAILED_SUMMARY_COLUMNS.filter((column) => !visibleSet.has(column.id)).map((column) => column.index)
  }, [visibleDetailedSummaryColumns])
  const detailedSummaryColumnStyles = useMemo(() => (
    hiddenDetailedSummaryColumnIndexes
      .map((index) => `.detailed-summary-table th:nth-child(${index}), .detailed-summary-table td:nth-child(${index}) { display: none; }`)
      .join('\n')
  ), [hiddenDetailedSummaryColumnIndexes])

  const toggleDetailedSummaryColumn = (columnId) => {
    if (mandatoryDetailedColumnIds.includes(columnId)) return
    setSelectedDetailedColumns((currentColumns) => (
      currentColumns.includes(columnId)
        ? currentColumns.filter((id) => id !== columnId)
        : [...currentColumns, columnId]
    ))
  }

  const handleSaveColumnPreferences = async () => {
    if (!user?.orgId) return
    
    setIsSavingPreferences(true)
    try {
      await updateDoc(doc(db, 'organisations', user.orgId), {
        salarySummaryColumnPreferences: selectedDetailedColumns,
        updatedAt: serverTimestamp()
      })
      
      // Show success feedback
      alert('Column preferences saved successfully!')
    } catch (error) {
      console.error('Error saving column preferences:', error)
      alert('Failed to save column preferences. Please try again.')
    } finally {
      setIsSavingPreferences(false)
    }
  }

  const handleRecalculateHistoricalData = async () => {
    if (!user?.orgId || !isAdmin) {
      alert('Only administrators can recalculate historical data.')
      return
    }

    const confirmed = confirm(
      'This will recalculate all historical payroll data with the corrected Sunday work logic.\n\n' +
      'This action cannot be undone and may affect financial records.\n\n' +
      'Are you sure you want to proceed?'
    )

    if (!confirmed) return

    setLoading(true)
    try {
      // Get all attendance records
      const attendanceSnap = await getDocs(collection(db, 'organisations', user.orgId, 'attendance'))
      const allAttendance = attendanceSnap.docs.map(d => ({ id: d.id, ...d.data() }))

      // Get all salary records that need recalculation
      const salaryRecordsSnap = await getDocs(collection(db, 'organisations', user.orgId, 'salaryRecords'))
      const salaryRecords = salaryRecordsSnap.docs.map(d => ({ id: d.id, ...d.data() }))

      let updatedCount = 0
      const errors = []

      for (const salaryRecord of salaryRecords) {
        try {
          const { month, employeeId } = salaryRecord
          if (!month || !employeeId) continue

          // Recalculate using the corrected logic
          const [y, m] = month.split('-').map(Number)
          const daysInMonth = new Date(y, m, 0).getDate()
          const sd = `${month}-01`, ed = `${month}-${daysInMonth}`

          // Get attendance for this employee and month
          const empAttendance = allAttendance.filter(a => 
            a.employeeId === employeeId && a.date >= sd && a.date <= ed
          )
          const attendanceByDate = new Map(empAttendance.map(a => [a.date, a]))

          // Apply corrected Sunday work calculation
          let worked = 0, sunW = 0, holW = 0, leave = 0, lop = 0
          const saturdayType = orgData?.saturdayType || 'working'
          const isSaturdayHoliday = ['holiday1x', 'holiday2x', 'alternative'].includes(saturdayType)
          const configuredHolidayDates = new Set(orgData?.holidays || [])

          for (let i = 1; i <= daysInMonth; i++) {
            const dateStr = `${month}-${String(i).padStart(2, '0')}`
            const d = new Date(y, m - 1, i)
            const dayOfWeek = d.getDay()
            const isSunday = dayOfWeek === 0
            const isSaturday = dayOfWeek === 6
            const isConfiguredHoliday = configuredHolidayDates.has(dateStr) && !isSunday
            const r = attendanceByDate.get(dateStr)

            // Apply corrected Sunday work logic
            const sundayWorkedFromRecord = Boolean(r?.sundayWorked)
            const prevDate = new Date(y, m - 1, i - 1).toISOString().split('T')[0]
            const prevDayRecord = attendanceByDate.get(prevDate)
            const prevDayIsSaturday = new Date(y, m - 1, i - 1).getDay() === 6
            const saturdayWorkedSupport = isSunday && prevDayIsSaturday && isWorkedAttendanceRecord(prevDayRecord)
            const sundayWorkedFromSaturday = Boolean(!sundayWorkedFromRecord && saturdayWorkedSupport)
            const sundayWorked = sundayWorkedFromRecord || sundayWorkedFromSaturday

            // Recalculate counts
            if (r?.isAbsent) {
              lop++
            } else if (isSunday) {
              if (sundayWorked) {
                sunW++
                worked++
              }
            } else if (isConfiguredHoliday) {
              const holidayWorked = Boolean(r?.holidayWorked) || (isConfiguredHoliday && isWorkedAttendanceRecord(r))
              if (holidayWorked) {
                holW++
                worked++
              }
            } else if (r) {
              worked++
            } else if (!isSunday && !isConfiguredHoliday) {
              lop++
            }
          }

          // Update the salary record with corrected values
          const updatedSalary = {
            ...salaryRecord,
            sundayWorked: sunW,
            holidayWorked: holW,
            workedDays: worked,
            recalculatedAt: serverTimestamp(),
            recalculationReason: 'Sunday work logic correction'
          }

          await updateDoc(doc(db, 'organisations', user.orgId, 'salaryRecords', salaryRecord.id), updatedSalary)
          updatedCount++

        } catch (error) {
          errors.push(`Failed to update record for ${salaryRecord.employeeId} - ${salaryRecord.month}: ${error.message}`)
        }
      }

      alert(
        `Recalculation completed!\n\n` +
        `Updated: ${updatedCount} records\n` +
        `Errors: ${errors.length} records\n` +
        (errors.length > 0 ? `\nErrors:\n${errors.slice(0, 3).join('\n')}` : '')
      )

    } catch (error) {
      console.error('Error recalculation historical data:', error)
      alert('Failed to recalculate historical data. Please check console for details.')
    } finally {
      setLoading(false)
      // Refresh the data
      refetchSummary()
    }
  }

  const calcEMI = (l, m) => { if (l.status !== 'Active' || l.remainingAmount <= 0 || l.startMonth > m) return 0; const o = l.monthOverrides?.[m]; if (o) return o.skip ? 0 : Math.min(o.amount, l.remainingAmount); return Math.min(l.emiAmount, l.remainingAmount) }

  const computeAdvExpRows = ({ activeRequests, advDocs, selectedMonth, y, m }) => {
    const monthPrefix = selectedMonth
    const activeRequestIds = new Set(activeRequests.map((r) => r.id))
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
      return { date: req?.date || selectedMonth, type: 'Advance', amount }
    })
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
      const date = req.date || selectedMonth
      const amount = Number(req.partialAmount || req.amount || 0)
      expRows.push({ date, type: 'Expense', amount })
    }
    return [...advRows, ...expRows].sort((a, b) => (a.date || '').localeCompare(b.date || ''))
  }

  const configuredHolidayDates = useMemo(() => {
    const holidayList = Array.isArray(orgData?.holidays) ? orgData.holidays : []
    return new Set(
      holidayList
        .map(h => (typeof h?.date === 'string' ? h.date : ''))
        .filter(date => /^\d{4}-\d{2}-\d{2}$/.test(date))
    )
  }, [orgData?.holidays])

  const isWorkedAttendanceRecord = (record) => {
    if (!record || record.isAbsent) return false
    if (record.sundayHoliday) return false
    const status = String(record.status || '').toLowerCase()
    if (status === 'absent' || status === 'sunholiday') return false
    return true
  }

  const { data: attendanceSummaryData = [], isLoading: isAttendanceLoading, refetch: refetchSummary } = useQuery({
    queryKey: ['attendanceSummary', user?.orgId, summaryMonth, orgData?.employeeRowOrder, orgData?.holidays],
    queryFn: async () => {
      if (!user?.orgId || !sortedEmployees.length) return []
      const [y, m] = summaryMonth.split('-').map(Number)
      const daysInMonth = new Date(y, m, 0).getDate()
      const sd = `${summaryMonth}-01`, ed = `${summaryMonth}-${daysInMonth}`
      
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
        const attendanceByDate = new Map(empAtt.map(a => [a.date, a]))
        let worked = 0, sun = 0, hol = 0, leave = 0, lop = 0, otH = 0, sunW = 0, holW = 0
        const saturdayType = orgData?.saturdayType || 'working'
        const isSaturdayHoliday = ['holiday1x', 'holiday2x', 'alternative'].includes(saturdayType)
        
        for (let i = 1; i <= daysInMonth; i++) {
          const dateStr = `${summaryMonth}-${String(i).padStart(2, '0')}`
          const d = new Date(y, m - 1, i)
          const dayOfWeek = d.getDay()
          const isSunday = dayOfWeek === 0
          const isSaturday = dayOfWeek === 6
          const isConfiguredHoliday = configuredHolidayDates.has(dateStr) && !isSunday
          const isSaturdayConfiguredHoliday = isSaturday && isConfiguredHoliday
          const isHoliday = isSunday || isConfiguredHoliday
          const r = attendanceByDate.get(dateStr)

          // Count total Sundays and configured holidays (not including Saturday as holiday when it's working day)
          if (isSunday) sun++
          if (isConfiguredHoliday) hol++

          // Check if worked on Saturday (only counts if Saturday is holiday type and has worked attendance)
          const saturdayWorked = isSaturday && isSaturdayHoliday && isWorkedAttendanceRecord(r)
          
          // Check Sunday worked - either directly marked or Saturday support (Saturday workers working Sunday)
          const sundayWorkedFromRecord = Boolean(r?.sundayWorked)
          const prevDate = new Date(y, m - 1, i - 1).toISOString().split('T')[0]
          const prevDayRecord = attendanceByDate.get(prevDate)
          const prevDayIsSaturday = new Date(y, m - 1, i - 1).getDay() === 6
          const saturdayWorkedSupport = isSunday && prevDayIsSaturday && isWorkedAttendanceRecord(prevDayRecord)
          const sundayWorkedFromSaturday = Boolean(!sundayWorkedFromRecord && saturdayWorkedSupport)
          const sundayWorked = sundayWorkedFromRecord || sundayWorkedFromSaturday
          
          // Check configured holiday worked (not including Saturday - handled separately)
          const holidayWorked = Boolean(r?.holidayWorked) || (isConfiguredHoliday && isWorkedAttendanceRecord(r))

          if (r?.isAbsent) {
            // Absent counts as LOP
            lop++
          } else if (isSunday) {
            // Sunday handling
            if (sundayWorked) {
              // Sunday worked - either marked as Sunday worked or Saturday workers support
              sunW++
              worked++
            }
            // If not worked on Sunday, doesn't count as worked (but not LOP for holiday)
          } else if (isConfiguredHoliday) {
            // Configured holiday (not Sunday)
            if (holidayWorked) {
              holW++
              worked++
            }
            // If not worked on holiday, doesn't count as worked
          } else if (isSaturday && isSaturdayHoliday) {
            // Saturday as holiday type
            if (saturdayWorked) {
              holW++
              worked++
            }
          } else if (r) {
            // Regular working day with attendance
            worked++
          } else if (!isSunday && !isConfiguredHoliday && !(isSaturday && isSaturdayHoliday)) {
            // Regular day with no attendance = LOP
            lop++
          }
          // Note: Sundays and holidays without attendance are NOT counted as LOP

          if (r?.otHours) {
            const [h, mi] = r.otHours.split(':').map(Number)
            otH += (h || 0) + (mi || 0) / 60
          }
        }
        const slab = allIncrements.filter(i => i.employeeId === emp.id && i.effectiveFrom <= summaryMonth).sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0] || slabs[emp.id] || { totalSalary: 0, basicPercent: 40, hraPercent: 20, incomeTaxPercent: 0, pfPercent: 0, esiPercent: 0 }
        const ts = Number(slab.totalSalary) || 0, minH = Number(emp.minDailyHours) || 8, paidDays = daysInMonth - lop
        const dailyRate = ts / daysInMonth
        const fullBasic = ts * (slab.basicPercent / 100), fullHra = ts * (slab.hraPercent / 100)
        const basic = fullBasic * (paidDays / daysInMonth), hra = fullHra * (paidDays / daysInMonth), pf = ts * (slab.pfPercent / 100), it = ts * (slab.incomeTaxPercent / 100), esi = 0, otPay = otH * (dailyRate / minH)
        const satPayMultiplier = saturdayType === 'holiday2x' || saturdayType === 'alternative' ? 2 : 1
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
        { accessorKey: 'sno', header: 'S.No', size: 60, cell: info => <div className="text-center text-sm font-medium text-gray-900 py-2 px-1 hover:bg-blue-50 transition-colors duration-200">{info.getValue()}</div> },
        { accessorKey: 'name', header: 'Employee Name', size: 200, cell: info => <button onClick={() => { setSummaryEmpDetail(info.row.original); setIsDetailPanelOpen(true); setIsAttendanceSummaryOpen(false); }} className="text-left font-medium text-blue-600 hover:text-blue-800 hover:bg-blue-50 px-3 py-2 truncate w-full text-sm transition-all duration-200 rounded-md group">{info.getValue()}</button> },
        { accessorKey: 'worked', header: 'Worked', size: 80, cell: info => <div className="text-center text-sm font-medium text-gray-900 py-2 px-1 hover:bg-gray-50 transition-colors duration-200">{info.getValue()}</div> },
      ]
    },
    { accessorKey: 'totalDays', header: 'Total Days', size: 80, cell: info => <div className="text-center text-sm font-medium text-gray-900 py-2 px-1 hover:bg-gray-50 transition-colors duration-200">{info.getValue()}</div> },
    { 
      header: 'Holiday',
      columns: [
        { accessorKey: 'sunday', header: 'Sunday', size: 80, cell: info => <div className="text-center text-sm font-medium text-gray-900 py-2 px-1 hover:bg-gray-50 transition-colors duration-200">{info.getValue()}</div> },
        { accessorKey: 'holidays', header: 'Holiday', size: 80, cell: info => <div className="text-center text-sm font-medium text-gray-900 py-2 px-1 hover:bg-gray-50 transition-colors duration-200">{info.getValue()}</div> },
        { accessorKey: 'totalHolidays', header: 'Total', size: 80, cell: info => <div className="text-center text-sm font-semibold text-gray-900 py-2 px-1 bg-blue-50">{info.getValue()}</div> },
      ]
    },
    { 
      header: 'Leave',
      columns: [
        { accessorKey: 'leave', header: 'Approved', size: 80, cell: info => <div className="text-center text-sm font-medium text-gray-900 py-2 px-1 hover:bg-gray-50 transition-colors duration-200">{info.getValue()}</div> },
        { accessorKey: 'lop', header: 'Loss of Pay', size: 100, cell: info => <div className="text-center text-sm font-medium text-red-600 py-2 px-1 bg-red-50 hover:bg-red-100 transition-colors duration-200 font-semibold">{info.getValue()}</div> },
      ]
    },
    { accessorKey: 'ot', header: 'OT Hours', size: 80, cell: info => <div className="text-center text-sm font-medium text-gray-900 py-2 px-1 hover:bg-gray-50 transition-colors duration-200">{info.getValue()}</div> },
    { 
      header: 'Holiday Worked',
      columns: [
        { accessorKey: 'sunW', header: 'Sunday', size: 80, cell: info => <div className="text-center text-sm font-medium text-gray-900 py-2 px-1 hover:bg-gray-50 transition-colors duration-200">{info.getValue()}</div> },
        { accessorKey: 'holW', header: 'Holiday', size: 80, cell: info => <div className="text-center text-sm font-medium text-gray-900 py-2 px-1 hover:bg-gray-50 transition-colors duration-200">{info.getValue()}</div> },
      ]
    },
    { accessorKey: 'totalWorkingDays', header: 'Pay Days', size: 80, cell: info => <div className="text-center text-sm font-semibold text-green-700 py-2 px-1 bg-green-50 hover:bg-green-100 transition-colors duration-200">{info.getValue()}</div> },
  ], [])

  const table = useReactTable({ 
    data: attendanceSummaryData, 
    columns, 
    getCoreRowModel: getCoreRowModel(),
  })

  useEffect(() => { 
    if (!user?.orgId) return; 
    getDoc(doc(db, 'organisations', user.orgId)).then(snap => { 
      if (snap.exists()) {
        const data = snap.data();
        setOrgData(data);
        setOrgLogo(data.logoURL || '');
        
        // Load saved column preferences
        if (data.salarySummaryColumnPreferences && Array.isArray(data.salarySummaryColumnPreferences)) {
          // Ensure all mandatory columns are included
          const savedColumns = data.salarySummaryColumnPreferences.filter(id => 
            DETAILED_SUMMARY_COLUMNS.some(col => col.id === id)
          );
          const mandatoryColumns = DETAILED_SUMMARY_COLUMNS.filter(col => col.mandatory).map(col => col.id);
          const finalColumns = [...new Set([...mandatoryColumns, ...savedColumns])];
          setSelectedDetailedColumns(finalColumns);
        }
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
        blob = await pdf(<SalarySlipPDF data={slipData} orgName={user?.orgName || 'Organization'} orgLogo="" />).toBlob()
      }
      downloadPdfBlob(blob, fileName)
    } catch (error) {
      alert('Failed to export PDF: ' + (error?.message || 'Unknown error'))
    } finally {
      setExportingSlipPdf(false)
    }
  }

  const handleExportDetailedSummaryPdf = async () => {
    if (!attendanceSummaryData.length || exportingDetailedPdf) return
    const fileName = `DetailedSalarySummary_${summaryMonth}.pdf`
    try {
      setExportingDetailedPdf(true)
      const blob = await pdf(<DetailedSalarySummaryPDF data={attendanceSummaryData} month={summaryMonth} orgName={user?.orgName || 'Organization'} />).toBlob()
      downloadPdfBlob(blob, fileName)
    } catch (error) {
      alert('Failed to export PDF: ' + error.message)
    } finally {
      setExportingDetailedPdf(false)
    }
  }

  const handleGenerate = async () => {
    if (!selectedEmp || !selectedMonth) return alert('Please select an employee and month');
    setLoading(true); setGenErr(''); setAdvExpRows([])
    try {
      const emp = employees.find(e => e.id === selectedEmp); 
      if (!emp) { setLoading(false); return alert('Employee data not found'); }
      const [y, m] = selectedMonth.split('-').map(Number), end = new Date(y, m, 0).getDate(), sd = `${selectedMonth}-01`, ed = `${selectedMonth}-${end}`
      const aDataSnap = await getDocs(query(collection(db, 'organisations', user.orgId, 'attendance'), where('employeeId', '==', selectedEmp)));
      const aData = aDataSnap.docs.map(d => d.data()).filter(a => a.date >= sd && a.date <= ed);
      const attendanceByDate = new Map(aData.map(a => [a.date, a]))
      const slab = increments.filter(i => i.employeeId === selectedEmp && i.effectiveFrom <= selectedMonth).sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0] || slabs[selectedEmp] || { totalSalary: 0, basicPercent: 40, hraPercent: 20, incomeTaxPercent: 0, pfPercent: 0 }
      const ts = Number(slab.totalSalary) || 0, minH = Number(emp.minDailyHours) || 8
      let paid = 0, lop = 0, aOT = 0, sun = 0, hol = 0, sunW = 0, holW = 0, grid = []
      const saturdayType = orgData?.saturdayType || 'working'
      const isSaturdayHoliday = ['holiday1x', 'holiday2x', 'alternative'].includes(saturdayType)
      for (let i = 1; i <= end; i++) {
        const d = new Date(y, m - 1, i)
        const ds = d.toISOString().split('T')[0]
        const dayOfWeek = d.getDay()
        const isS = dayOfWeek === 0
        const isSaturday = dayOfWeek === 6
        const isConfiguredHoliday = configuredHolidayDates.has(ds) && !isS
        const isConfiguredHolidayOrSunday = isS || isConfiguredHoliday
        const r = attendanceByDate.get(ds)

        if (isS) sun++
        if (isConfiguredHoliday) hol++

        // Saturday worked check (only for holiday type)
        const saturdayWorked = isSaturday && isSaturdayHoliday && isWorkedAttendanceRecord(r)
        
        // Sunday worked logic
        const sundayWorkedFromRecord = Boolean(r?.sundayWorked)
        const prevDate = new Date(y, m - 1, i - 1).toISOString().split('T')[0]
        const saturdayWorkedSupport = isS && isWorkedAttendanceRecord(attendanceByDate.get(prevDate))
        const sundayWorkedFromSaturday = Boolean(!sundayWorkedFromRecord && saturdayWorkedSupport)
        const sundayWorked = sundayWorkedFromRecord || sundayWorkedFromSaturday
        
        // Holiday worked (excluding Saturday - handled separately)
        const holidayWorked = Boolean(r?.holidayWorked) || (isConfiguredHoliday && isWorkedAttendanceRecord(r))

        let t = isConfiguredHolidayOrSunday ? (isS ? 'Sunday' : 'Holiday') : (isSaturday && isSaturdayHoliday ? 'Saturday' : 'Absent')

        if (r?.isAbsent) {
          t = 'Absent'
          lop++
        } else if (isS) {
          // Sunday handling
          if (sundayWorked) {
            t = sundayWorkedFromRecord ? 'Sunday Working' : 'Sunday Working (Sat)'
            sunW++
            paid++
          } else if (r?.sundayHoliday) {
            t = 'Sunday Holiday'
            paid++
          }
        } else if (isConfiguredHoliday) {
          // Configured holiday
          if (holidayWorked) {
            t = 'Holiday Working'
            holW++
            paid++
          }
        } else if (isSaturday && isSaturdayHoliday) {
          // Saturday as holiday
          if (saturdayWorked) {
            t = 'Saturday Working'
            holW++
            paid++
          }
        } else if (r) {
          // Regular working day
          t = 'Working'
          paid++
        } else {
          // No attendance on regular day
          t = 'Absent'
          lop++
        }

        if (r?.otHours) {
          const [h, mi] = r.otHours.split(':').map(Number)
          aOT += (h || 0) + (mi || 0) / 60
        }

        grid.push({ date: i, type: t, ds })
      }
      const [otSRes, advSnap, loanSnap, fSnapRes, requestSnap, deletedAdvSnap] = await Promise.all([
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
      const advDocs = advSnap.docs.map(d => d.data()).filter(a => a.status !== 'Recovered').filter(a => !a.deleted && !a.isDeleted && !deletedIds.has(a.id)).filter(a => !a.linkedRequestId || activeRequestIds.has(a.linkedRequestId))
      const advExpRowsComputed = computeAdvExpRows({ activeRequests: activeRequests.filter(i => !deletedIds.has(i.id)), advDocs, selectedMonth, y, m })
      setAdvExpRows(advExpRowsComputed)
      const adv = advDocs.reduce((s, c) => s + Number(c.amount), 0)
      const emi = loanSnap.docs.map(d => d.data()).filter(l => !l.deleted && !l.isDeleted).reduce((s, l) => s + calcEMI(l, selectedMonth), 0)
      const sunP = sunW * (ts / end)
      const fineA = fSnapRes.docs.map(d => d.data()).filter(f => f.date >= sd && f.date <= ed).filter(f => !f.deleted && !f.isDeleted).reduce((s, d) => s + Number(d.amount || 0), 0)
      const otP = aOT * ((ts / end) / minH)
      const reimb = activeRequests.filter(i => i.type === 'Expense' && !deletedIds.has(i.id)).filter(i => {
        const isPaidThisMonth = i.paymentStatus === 'Paid' && i.paidAt?.toDate && i.paidAt.toDate().getFullYear() === y && (i.paidAt.toDate().getMonth() + 1) === m
        const isWithSalaryApproved = i.payoutMethod === 'With Salary' && i.status === 'Approved' && i.paymentStatus !== 'Paid' && i.date?.startsWith(selectedMonth)
        return isPaidThisMonth || isWithSalaryApproved
      }).reduce((s, c) => s + Number(c.partialAmount || c.amount), 0)
      const b = ts * (slab.basicPercent / 100) * (paid / end), h = ts * (slab.hraPercent / 100) * (paid / end), p = ts * (slab.pfPercent / 100)
      const de = p + adv + emi + fineA, g = b + h + otP + reimb + sunP
      setSlipData({ employee: emp, month: selectedMonth, slab, grid, paidDays: paid, lopDays: lop, autoOTHours: aOT, finalOT: aOT, otPay: otP, basic: b, hra: h, basicFull: ts * (slab.basicPercent / 100), hraFull: ts * (slab.hraPercent / 100), expenseReimbursement: reimb, sundayPay: sunP, grossEarnings: g, pf: p, esi: 0, it: 0, advanceDeduction: adv, loanEMI: emi, fineAmount: fineA, totalDeductions: de, netPay: Math.max(0, g - de), sundayCount: sun + hol, sundayWorkedCount: sunW, holidayWorkedCount: holW, workedDaysCount: paid - (sun + hol), totalMonthDays: end })    
    } catch (e) { alert('Generation failed: ' + e.message); } finally { setLoading(false) }
  }

  const handleFinalizeSlip = async () => {
    if (!slipData) return; setLoading(true)
    try {
      const sid = `${slipData.employee.id}_${slipData.month}`; 
      await setDoc(doc(db, 'organisations', user.orgId, 'salarySlips', sid), { ...slipData, finalizedAt: serverTimestamp(), finalizedBy: user.uid })
      const expSnap = await getDocs(query(collection(db, 'organisations', user.orgId, 'advances_expenses'), where('employeeId', '==', slipData.employee.id), where('payoutMethod', '==', 'With Salary'), where('status', '==', 'Approved'), where('paymentStatus', '!=', 'Paid')))
      for (const edoc of expSnap.docs) { if (edoc.data().date?.startsWith(slipData.month)) await updateDoc(edoc.ref, { paymentStatus: 'Paid', paidAt: serverTimestamp(), paidBy: user.uid, salarySlipId: sid, updatedAt: serverTimestamp() }) }
      if (slipData.loanEMI > 0) {
        const lS = await getDocs(query(collection(db, 'organisations', user.orgId, 'loans'), where('employeeId', '==', slipData.employee.id), where('status', '==', 'Active')))
        for (const ld of lS.docs) { const d = ld.data(), de = calcEMI(d, slipData.month); if (de > 0) { const nr = Math.max(0, d.remainingAmount - de); await updateDoc(ld.ref, { remainingAmount: nr, status: nr <= 0 ? 'Closed' : 'Active', updatedAt: serverTimestamp() }); await logActivity(user.orgId, user, { module: 'Loans', action: 'EMI Deducted', detail: `₹${de} for ${slipData.employee.name}` }) } }
      }
      alert('Recorded'); fetchLoans()
    } catch (e) { alert(e.message) } finally { setLoading(false) }
  }

  return (
    <div className="flex h-full bg-white font-roboto text-gray-900 overflow-hidden flex-col">
      <div className="bg-white border-b border-gray-200 px-6 py-3 shrink-0 shadow-sm">
        <div className="flex items-center gap-2">
          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mr-4">Payroll</div>
          <nav className="flex items-center gap-2">
            {[{id:'salary-slip', icon:<Banknote size={16}/>, label:'Slip'}, {id:'salary-summary', icon:<FileText size={16}/>, label:'Summary'}, {id:'loan', icon:<Wallet size={16}/>, label:'Loans'}].map(t => (
              <button key={t.id} onClick={() => setActiveTab(t.id)} className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all duration-200 whitespace-nowrap ${activeTab === t.id ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'}`}><span className={activeTab === t.id ? 'text-white' : 'text-slate-400'}>{t.icon}</span><span className="text-[13px] font-semibold tracking-tight whitespace-nowrap">{t.label}</span></button>
            ))}
          </nav>
        </div>
      </div>
      <div className="flex-1 min-w-0 p-6 h-full overflow-hidden flex flex-col">
        {activeTab === 'salary-slip' && (
          <div className="max-w-6xl mx-auto space-y-4 flex flex-col h-full overflow-hidden p-2 w-full">
            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-wrap gap-4 items-end shrink-0">
              <div className="w-[240px] max-w-full font-google-sans uppercase text-[15px] font-bold text-gray-400">Target Employee<select value={selectedEmp} onChange={e => setSelectedEmp(e.target.value)} className="w-full h-9 border border-gray-200 rounded-lg px-3 text-[15px] font-semibold bg-white outline-none mt-1 text-gray-900 normal-case" style={{ fontFamily: "'Inter', sans-serif" }}><option value="">Select Employee</option>{sortedEmployees.filter(e => e.includeInSalary !== false).map(e => <option key={e.id} value={e.id}>{e.name}</option>)}</select></div>
              <div className="w-[170px] font-google-sans uppercase text-[15px] font-bold text-gray-400">Pay Period<input type="month" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} className="w-full h-9 border border-gray-200 rounded-lg px-3 text-[15px] font-bold mt-1 text-gray-900 normal-case" style={{ fontFamily: "'Inter', sans-serif" }}/></div>
              <div className="flex flex-col items-start gap-2"><button onClick={handleGenerate} disabled={loading || !selectedEmp} className="h-9 px-6 bg-gray-900 text-white font-bold rounded-lg uppercase tracking-[0.1em] text-[15px] shadow-lg hover:bg-black transition-all disabled:opacity-60">Generate</button></div>
            </div>
            {slipData ? (
              <div className="flex-1 overflow-hidden flex gap-4 p-2">
                <div className="flex-1 min-w-0 overflow-hidden flex flex-col items-center">
                  <div className="bg-white border-2 border-black shadow-2xl rounded-[24px] overflow-hidden relative flex flex-col w-full h-full print-area" style={{ fontFamily: "'Inter', sans-serif" }}>
                    <div className="flex justify-end gap-2 p-3 bg-slate-50 border-b border-slate-100 no-print shrink-0">
                      <button onClick={() => window.print()} className="h-8 bg-white border border-slate-200 text-slate-700 px-3 rounded-lg text-[10px] font-black uppercase tracking-widest flex items-center gap-2 hover:bg-slate-50 transition-all shadow-sm"><Download size={12} /> Print</button>
                      <button onClick={handleExportSalarySlipPdf} disabled={exportingSlipPdf} className="h-8 bg-white border border-slate-200 text-slate-700 px-3 rounded-lg text-[10px] font-black uppercase tracking-widest flex items-center gap-2 hover:bg-slate-50 transition-all shadow-sm disabled:opacity-60"><Download size={12} /> {exportingSlipPdf ? 'Preparing...' : 'Export PDF'}</button>
                      <button onClick={handleFinalizeSlip} className="h-8 bg-indigo-600 text-white px-4 rounded-lg text-[10px] font-black uppercase tracking-widest shadow-lg shadow-indigo-600/20 flex items-center gap-2 hover:bg-indigo-700 active:scale-95 transition-all"><CheckCircle2 size={12} /> Finalize</button>
                    </div>
                    <div className="p-8 bg-white relative overflow-auto flex-1">
                      <div className="border-b border-slate-900 pb-4 mb-6 flex justify-between items-start">
                        <div className="flex items-center gap-4">
                          {orgLogo && <img src={orgLogo} alt="Logo" className="w-12 h-12 object-contain rounded-lg shadow-sm bg-slate-50 p-1.5" />}
                          <div><h1 className="text-2xl font-black text-slate-900 uppercase font-google-sans tracking-tighter leading-none">{user?.orgName}</h1><p className="text-[8px] text-indigo-600 font-black uppercase tracking-[0.4em] mt-2 flex items-center gap-2"><span className="w-4 h-0.5 bg-indigo-600"></span>Payroll Advice</p></div>
                        </div>
                        <div className="text-right"><h2 className="text-lg font-black text-slate-900 uppercase font-google-sans tracking-tight italic">Statement</h2><p className="text-[9px] font-black text-slate-500 mt-1 bg-slate-100 px-2 py-0.5 rounded border border-slate-200 uppercase tracking-widest">{formatMonthDisplay(slipData.month)}</p></div>
                      </div>
                      <div className="grid grid-cols-2 gap-x-12 gap-y-1 mb-8 relative z-10 px-2">
                        <div className="flex justify-between border-b border-slate-100 py-1.5"><span className="text-[12px] font-black text-slate-400 uppercase tracking-tight">Name of the Employee</span><span className="text-[12px] font-bold text-slate-900 uppercase">{slipData.employee?.name}</span></div>
                        <div className="flex justify-between border-b border-slate-100 py-1.5"><span className="text-[12px] font-black text-slate-400 uppercase tracking-tight">No.of Working Days</span><span className="text-[12px] font-bold text-slate-900">{slipData.workedDaysCount}</span></div>
                        <div className="flex justify-between border-b border-slate-100 py-1.5"><span className="text-[12px] font-black text-slate-400 uppercase tracking-tight">Employee N0</span><span className="text-[12px] font-bold text-slate-900 uppercase">{slipData.employee?.empCode}</span></div>
                        <div className="flex justify-between border-b border-slate-100 py-1.5"><span className="text-[12px] font-black text-slate-400 uppercase tracking-tight">Worked Holidays</span><span className="text-[12px] font-bold text-slate-900">{slipData.holidayWorkedCount || 0}</span></div>
                        <div className="flex justify-between border-b border-slate-100 py-1.5"><span className="text-[12px] font-black text-slate-400 uppercase tracking-tight">Designation</span><span className="text-[12px] font-bold text-slate-900 uppercase">{slipData.employee?.designation || '-'}</span></div>
                        <div className="flex justify-between border-b border-slate-100 py-1.5"><span className="text-[12px] font-black text-slate-400 uppercase tracking-tight">No.of Holidays</span><span className="text-[12px] font-bold text-slate-900">{slipData.sundayCount}</span></div>
                        <div className="flex justify-between border-b border-slate-100 py-1.5"><span className="text-[12px] font-black text-slate-400 uppercase tracking-tight">DOB</span><span className="text-[12px] font-bold text-slate-900">{formatDateDDMMYYYY(slipData.employee?.dob) || '-'}</span></div>
                        <div className="flex justify-between border-b border-slate-100 py-1.5"><span className="text-[12px] font-black text-slate-400 uppercase tracking-tight">No. of Leave Taken</span><span className="text-[12px] font-bold text-slate-900">{slipData.lopDays}</span></div>
                        <div className="flex justify-between border-b border-slate-100 py-1.5"><span className="text-[12px] font-black text-slate-400 uppercase tracking-tight">DOJ</span><span className="text-[12px] font-bold text-slate-900">{formatDateDDMMYYYY(slipData.employee?.doj) || '-'}</span></div>
                        <div className="flex justify-between border-b border-slate-100 py-1.5"><span className="text-[12px] font-black text-slate-400 uppercase tracking-tight">No. of days Paid</span><span className="text-[12px] font-bold text-slate-900">{slipData.paidDays}</span></div>
                        <div className="flex justify-between border-b border-slate-100 py-1.5"><span className="text-[12px] font-black text-slate-400 uppercase tracking-tight">Total No. of Days</span><span className="text-[12px] font-bold text-slate-900">{slipData.totalMonthDays}</span></div>
                      </div>
                      <div className="flex justify-center gap-16 mb-6 py-4 bg-slate-50 rounded-xl px-4">
                        <div className="text-center"><p className="text-[9px] font-black text-slate-500 uppercase tracking-wider mb-1">Basic</p><p className="text-base font-black text-slate-900">{formatINR(slipData.basicFull)}</p></div>
                        <div className="text-center"><p className="text-[9px] font-black text-slate-500 uppercase tracking-wider mb-1">HRA</p><p className="text-base font-black text-slate-900">{formatINR(slipData.hraFull)}</p></div>
                        <div className="text-center"><p className="text-[9px] font-black text-slate-500 uppercase tracking-wider mb-1">Salary</p><p className="text-base font-black text-indigo-600">{formatINR(slipData.basicFull + slipData.hraFull)}</p></div>
                      </div>
                      <div className="border border-slate-200 rounded-[20px] overflow-hidden mb-6 shadow-sm relative z-10">
                        <div className="grid grid-cols-2 bg-slate-100 font-google-sans font-black text-[9px] uppercase tracking-widest text-slate-900 border-b border-slate-200"><div className="p-3 flex justify-between items-center border-r border-slate-200"><span>Earnings</span><span>Amount</span></div><div className="p-3 flex justify-between items-center"><span>Deductions</span><span>Amount</span></div></div>
                        <div className="grid grid-cols-2 divide-x divide-slate-200 bg-white">
                          <div className="p-1 space-y-0.5">
                            <div className="flex justify-between p-2.5 text-[11px]">Basic Salary<span className="font-bold">{formatINR(slipData.basic)}</span></div>
                            <div className="flex justify-between p-2.5 text-[11px]">Allowances (HRA)<span className="font-bold">{formatINR(slipData.hra)}</span></div>
                            <div className="flex justify-between p-2.5 text-[11px]">Expense<span className="font-bold">{dashIfZero(slipData.expenseReimbursement)}</span></div>
                            <div className="flex justify-between p-2.5 text-[11px]">Sunday Worked<span className="font-bold">{dashIfZero(slipData.sundayPay)}</span></div>
                            <div className="flex justify-between p-2.5 text-[11px]">OT<span className="font-bold">{dashIfZero(slipData.otPay)}</span></div>
                          </div>
                          <div className="p-1 space-y-0.5">
                            <div className="flex justify-between p-2.5 text-[11px]">PF<span className="font-bold">{dashIfZero(slipData.pf)}</span></div>
                            <div className="flex justify-between p-2.5 text-[11px]">ESI<span className="font-bold">{dashIfZero(slipData.esi || 0)}</span></div>
                            <div className="flex justify-between p-2.5 text-[11px]">Advance<span className="font-bold">{dashIfZero(slipData.advanceDeduction)}</span></div>
                            <div className="flex justify-between p-2.5 text-[11px]">Loan<span className="font-bold">{dashIfZero(slipData.loanEMI)}</span></div>
                            <div className="flex justify-between p-2.5 text-[11px]">Fine<span className="font-bold">{dashIfZero(slipData.fineAmount)}</span></div>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 divide-x divide-slate-200 bg-slate-100 border-t border-slate-200 font-black text-[10px] uppercase tracking-widest"><div className="p-4 flex justify-between"><span>Gross Earnings</span><span>{formatINR(slipData.grossEarnings)}</span></div><div className="p-4 flex justify-between"><span>Total Deductions</span><span className="text-rose-500">{formatINR(slipData.totalDeductions)}</span></div></div>
                      </div>
                      <div className="text-center pt-4 border-t border-dashed border-slate-200"><p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Final Disbursement Value</p><div className="bg-white border-2 border-slate-200 rounded-xl p-4 inline-block min-w-[300px] shadow-xl"><p className="text-[14px] font-black text-slate-900 mb-1">{formatINR(slipData.netPay)}</p><p className="text-[9px] font-black italic uppercase text-slate-500">{numberToWords(slipData.netPay)} Only</p></div></div>
                    </div>
                  </div>
                </div>
                <div className="w-[340px] shrink-0"><div className="bg-white border border-gray-100 shadow-sm rounded-[24px] overflow-hidden flex flex-col h-full"><div className="p-4 bg-slate-50 border-b border-slate-100 shrink-0"><div className="text-[12px] font-black text-slate-900 uppercase tracking-widest">Advances & Expenses</div></div><div className="p-3 overflow-auto flex-1"><table className="w-full text-left text-[10px]"><thead><tr><th className="pb-2 font-black text-slate-400 uppercase">Date</th><th className="pb-2 font-black text-slate-400 uppercase">Type</th><th className="pb-2 font-black text-slate-400 uppercase text-right">Amount</th></tr></thead><tbody>{advExpRows.length === 0 ? (<tr><td colSpan={3} className="py-10 text-center text-slate-400">No applied items</td></tr>) : (advExpRows.map((row, i) => (<tr key={i} className="border-t border-slate-100"><td className="py-2 font-bold text-slate-700">{formatDateDDMMYYYY(row.date)}</td><td className="py-2"><span className="inline-flex px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 uppercase font-black">{row.type}</span></td><td className="py-2 text-right font-black text-indigo-600">{formatINR(row.amount)}</td></tr>)))}</tbody></table></div></div></div>
              </div>
            ) : (<div className="flex-1 flex items-center justify-center border-2 border-dashed border-slate-200 rounded-3xl bg-slate-50/50"><div className="text-center"><p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em]">Select Employee to preview statement</p></div></div>)}
          </div>
        )}

        {activeTab === 'salary-summary' && (
          <div className="max-w-full space-y-4 flex flex-col h-full overflow-hidden">
            <div className="flex justify-between items-center gap-4 bg-white p-2 rounded-lg border border-gray-200 shadow-sm shrink-0">
              <div className="flex items-center gap-2">
                <div className="flex items-center bg-gray-100 rounded-md p-1.5"><button onClick={() => { const [y, m] = summaryMonth.split('-').map(Number); const d = new Date(y, m - 2, 1); setSummaryMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`) }} className="p-1.5 hover:bg-white hover:shadow-sm rounded transition-all text-gray-600"><ChevronLeft size={14} /></button><div className="px-2 py-0.5 font-bold text-gray-900 text-[11px] min-w-[100px] text-center uppercase tracking-tighter">{new Date(summaryMonth + '-01').toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}</div><button onClick={() => monthInputRef.current?.showPicker()} className="p-1.5 hover:bg-white hover:shadow-sm rounded transition-all text-indigo-600 relative"><CalendarIcon size={14} /><input ref={monthInputRef} type="month" value={summaryMonth} onChange={e => setSummaryMonth(e.target.value)} className="absolute inset-0 opacity-0 cursor-pointer pointer-events-none" /></button><button onClick={() => { const [y, m] = summaryMonth.split('-').map(Number); const d = new Date(y, m, 1); setSummaryMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`) }} className="p-1.5 hover:bg-white hover:shadow-sm rounded transition-all text-gray-600"><ChevronRight size={14} /></button></div>
                <div className="h-4 w-px bg-gray-200 mx-0.5" /><button onClick={() => refetchSummary()} className="h-8 px-4 bg-gray-900 text-white font-bold rounded text-[8px] uppercase tracking-widest shadow hover:bg-black transition-all active:scale-95">Submit</button>
                {isAdmin && (
                  <>
                    <div className="h-4 w-px bg-gray-200 mx-0.5" />
                    <button 
                      onClick={handleRecalculateHistoricalData}
                      disabled={loading}
                      className="h-8 px-3 bg-amber-600 text-white font-bold rounded text-[8px] uppercase tracking-widest shadow hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-95 flex items-center gap-1"
                      title="Recalculate all historical payroll data with corrected Sunday work logic"
                    >
                      <RefreshCw size={10} className={loading ? 'animate-spin' : ''} />
                      Fix History
                    </button>
                  </>
                )}
              </div>
              <div className="text-right pr-2"><h1 className="text-[9px] font-black text-gray-900 font-google-sans tracking-tight uppercase leading-none">Salary Summary</h1><p className="text-[7px] text-gray-400 font-bold uppercase tracking-widest mt-0.5">Analytics Engine</p></div>
            </div>
            <div className="flex gap-2 flex-1 min-h-0 items-start overflow-hidden relative">
              <div className={`${isAttendanceSummaryOpen ? 'flex-1 min-w-0' : 'w-0 overflow-hidden'} flex flex-col gap-2 h-full overflow-hidden transition-all duration-300`}>
                <div className={`${isAttendanceSummaryOpen ? 'flex flex-col h-1/2 min-h-0' : 'hidden'} space-y-1`}>
                  <div className="flex justify-between items-center bg-white px-2 py-1 rounded border border-gray-200 shadow-sm shrink-0">
                    <div className="flex items-center gap-2"><div className="w-5 h-5 rounded bg-gray-900 flex items-center justify-center text-white"><Clock size={10} /></div><p className="text-[8px] font-bold text-gray-900 uppercase font-google-sans tracking-tight">Summary</p></div>
                    <div className="flex items-center gap-1"><button onClick={() => setIsDetailPanelOpen(!isDetailPanelOpen)} className={`p-0.5 rounded transition-all ${isDetailPanelOpen ? 'bg-indigo-100 text-indigo-600' : 'hover:bg-gray-100 text-gray-400'}`}><Info size={10} /></button></div>
                  </div>
                  <div className="bg-white border border-gray-200 rounded-lg overflow-hidden flex-col flex-1 min-h-0 shadow-sm">
                    <div className="overflow-auto flex-1">
                      <table className="w-full border-collapse text-sm">
                        <thead className="sticky top-0 z-10 bg-gray-50">
                          {table.getHeaderGroups().map((headerGroup) => (
                            <tr key={headerGroup.id} className="border-b border-gray-200">
                              {headerGroup.headers.map(header => (
                                <th 
                                  key={header.id} 
                                  colSpan={header.colSpan} 
                                  className="px-4 py-3 border-r border-gray-200 text-left font-semibold text-gray-900 bg-gray-50 text-xs uppercase tracking-wider transition-colors hover:bg-gray-100"
                                >
                                  {flexRender(header.column.columnDef.header, header.getContext())}
                                </th>
                              ))}
                            </tr>
                          ))}
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {isAttendanceLoading ? (
                            <tr>
                              <td colSpan={13} className="p-8 text-center text-gray-500">
                                <div className="flex items-center justify-center gap-2">
                                  <Spinner size="sm" />
                                  <span className="text-sm">Loading data...</span>
                                </div>
                              </td>
                            </tr>
                          ) : (
                            table.getRowModel().rows.map((row, index) => (
                              <tr 
                                key={row.id} 
                                className={`border-b border-gray-100 transition-all duration-200 ${
                                  summaryEmpDetail?.id === row.original.id 
                                    ? 'bg-blue-50 border-blue-200' 
                                    : index % 2 === 0 
                                    ? 'bg-white hover:bg-gray-50' 
                                    : 'bg-gray-50 hover:bg-gray-100'
                                }`}
                              >
                                {row.getVisibleCells().map(cell => (
                                  <td 
                                    key={cell.id} 
                                    className="px-4 py-2 border-r border-gray-200 text-center text-gray-900 transition-colors duration-200"
                                  >
                                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                  </td>
                                ))}
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                  </div></div>
                </div>
                <div className={`${isAttendanceSummaryOpen ? 'flex-1 min-w-0' : 'flex-1'} flex flex-col h-1/2 min-h-0 space-y-1 transition-all duration-300`}>
                  <div className="flex justify-between items-center bg-white px-2 py-1 rounded border border-gray-200 shadow-sm shrink-0 relative">
                    <div className="flex items-center gap-2"><div className="w-5 h-5 rounded bg-indigo-600 flex items-center justify-center text-white"><Wallet size={10} /></div><p className="text-[10px] font-bold text-gray-900 uppercase tracking-tight">Detailed Salary Summary</p><button onClick={handleExportDetailedSummaryPdf} disabled={exportingDetailedPdf || attendanceSummaryData.length === 0} className="ml-2 p-1 bg-indigo-50 text-indigo-600 rounded hover:bg-indigo-100 disabled:opacity-50 transition-colors" title="Download Detailed Summary PDF"><Download size={12} /></button></div>
                    <div className="flex items-center gap-2"><button onClick={() => setShowDetailedColumnPicker(v => !v)} className="h-6 px-2.5 rounded border border-indigo-200 bg-indigo-50 text-indigo-700 text-[9px] font-black uppercase tracking-wider hover:bg-indigo-100 transition-colors">Columns</button><span className="text-[9px] text-gray-500">Comprehensive Payroll Breakdown</span></div>
                    {showDetailedColumnPicker && (
                      <div className="absolute right-2 top-9 z-20 w-[290px] max-h-[320px] overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl">
                        <div className="px-3 py-2 border-b border-gray-100 bg-gray-50">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-[9px] font-black uppercase tracking-wider text-gray-600">Visible Columns</p>
                              <p className="text-[9px] text-gray-500 mt-0.5">Name, Designation, Basic, HRA and Salary are mandatory.</p>
                            </div>
                            <button 
                              onClick={handleSaveColumnPreferences}
                              disabled={isSavingPreferences}
                              className="px-3 py-1.5 bg-indigo-600 text-white text-[9px] font-black uppercase tracking-wider rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm"
                            >
                              {isSavingPreferences ? 'Saving...' : 'Save Default'}
                            </button>
                          </div>
                        </div>
                        <div className="p-2 max-h-[250px] overflow-auto space-y-1">
                          {DETAILED_SUMMARY_COLUMNS.map((column) => {
                            const isMandatory = Boolean(column.mandatory)
                            const isChecked = visibleDetailedSummaryColumns.some((visibleColumn) => visibleColumn.id === column.id)
                            return (
                              <label key={column.id} className={`flex items-center justify-between rounded px-2 py-1.5 border ${isMandatory ? 'border-emerald-200 bg-emerald-50/70' : 'border-gray-200 hover:bg-gray-50'} cursor-pointer`}>
                                <div className="flex items-center gap-2">
                                  <input type="checkbox" checked={isChecked} disabled={isMandatory} onChange={() => toggleDetailedSummaryColumn(column.id)} className="h-3.5 w-3.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 disabled:opacity-60" />
                                  <span className="text-[10px] font-semibold text-gray-700 uppercase tracking-wide">{column.label}</span>
                                </div>
                                {isMandatory && <span className="text-[8px] font-black uppercase tracking-wider text-emerald-700">Must</span>}
                              </label>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="bg-white border border-gray-300 overflow-hidden flex-col flex-1 min-h-0 flex" style={{ fontFamily: 'Roboto, sans-serif' }}>
                    <div className="flex-1 overflow-auto">
                      <style>{detailedSummaryColumnStyles}</style>
                      <table className="detailed-summary-table w-full border-collapse text-sm">
                        <thead className="sticky top-0 z-10">
                          <tr className="bg-gradient-to-r from-gray-50 to-gray-100 border-b-2 border-gray-300">
                            {/* Basic Info Column Group */}
                            <th className="px-3 py-3 border-r-2 border-blue-200 text-left font-semibold text-gray-900 text-xs uppercase tracking-wider bg-blue-50">
                              <div className="flex items-center gap-1">
                                <div className="w-1 h-4 bg-blue-500 rounded"></div>
                                S.No
                              </div>
                            </th>
                            <th className="px-3 py-3 border-r-2 border-blue-200 text-left font-semibold text-gray-900 text-xs uppercase tracking-wider bg-blue-50">Emp No</th>
                            <th className="px-3 py-3 border-r-2 border-blue-200 text-left font-semibold text-gray-900 text-xs uppercase tracking-wider bg-blue-50">Name</th>
                            <th className="px-3 py-3 border-r-2 border-blue-200 text-left font-semibold text-gray-900 text-xs uppercase tracking-wider bg-blue-50">Designation</th>
                            
                            {/* Salary Structure Column Group */}
                            <th className="px-3 py-3 border-r-2 border-purple-200 text-right font-semibold text-gray-900 text-xs uppercase tracking-wider bg-purple-50">
                              <div className="flex items-center justify-end gap-1">
                                Basic
                                <div className="w-1 h-4 bg-purple-500 rounded"></div>
                              </div>
                            </th>
                            <th className="px-3 py-3 border-r-2 border-purple-200 text-right font-semibold text-gray-900 text-xs uppercase tracking-wider bg-purple-50">HRA</th>
                            <th className="px-3 py-3 border-r-2 border-purple-200 text-right font-semibold text-gray-900 text-xs uppercase tracking-wider bg-purple-50">CTC</th>
                            
                            {/* Attendance Column Group */}
                            <th className="px-3 py-3 border-r-2 border-green-200 text-center font-semibold text-gray-900 text-xs uppercase tracking-wider bg-green-50">
                              <div className="flex items-center justify-center gap-1">
                                <div className="w-1 h-4 bg-green-500 rounded"></div>
                                Days
                              </div>
                            </th>
                            <th className="px-3 py-3 border-r-2 border-green-200 text-center font-semibold text-gray-900 text-xs uppercase tracking-wider bg-green-50">Worked</th>
                            <th className="px-3 py-3 border-r-2 border-green-200 text-center font-semibold text-gray-900 text-xs uppercase tracking-wider bg-green-50">Sunday</th>
                            <th className="px-3 py-3 border-r-2 border-green-200 text-center font-semibold text-gray-900 text-xs uppercase tracking-wider bg-green-50">Holiday</th>
                            <th className="px-3 py-3 border-r-2 border-green-200 text-center font-semibold text-gray-900 text-xs uppercase tracking-wider bg-green-50">Leave</th>
                            <th className="px-3 py-3 border-r-2 border-green-200 text-center font-semibold text-gray-900 text-xs uppercase tracking-wider bg-green-50">Paid</th>
                            
                            {/* Earnings Column Group */}
                            <th className="px-3 py-3 border-r-2 border-emerald-200 text-right font-semibold text-gray-900 text-xs uppercase tracking-wider bg-emerald-50">
                              <div className="flex items-center justify-end gap-1">
                                Basic
                                <div className="w-1 h-4 bg-emerald-500 rounded"></div>
                              </div>
                            </th>
                            <th className="px-3 py-3 border-r-2 border-emerald-200 text-right font-semibold text-gray-900 text-xs uppercase tracking-wider bg-emerald-50">HRA</th>
                            <th className="px-3 py-3 border-r-2 border-emerald-200 text-right font-semibold text-gray-900 text-xs uppercase tracking-wider bg-emerald-50">Earned</th>
                            
                            {/* Deductions Column Group */}
                            <th className="px-3 py-3 border-r-2 border-red-200 text-right font-semibold text-gray-900 text-xs uppercase tracking-wider bg-red-50">
                              <div className="flex items-center justify-end gap-1">
                                PF
                                <div className="w-1 h-4 bg-red-500 rounded"></div>
                              </div>
                            </th>
                            <th className="px-3 py-3 border-r-2 border-red-200 text-right font-semibold text-gray-900 text-xs uppercase tracking-wider bg-red-50">Advance</th>
                            <th className="px-3 py-3 border-r-2 border-red-200 text-right font-semibold text-gray-900 text-xs uppercase tracking-wider bg-red-50">Loan</th>
                            <th className="px-3 py-3 border-r-2 border-red-200 text-right font-semibold text-gray-900 text-xs uppercase tracking-wider bg-red-50">Total Ded</th>
                            
                            {/* Net Pay Column */}
                            <th className="px-3 py-3 text-r-0 text-right font-semibold text-gray-900 text-xs uppercase tracking-wider bg-gradient-to-r from-green-600 to-green-700 text-white">
                              <div className="flex items-center justify-end gap-1">
                                Net
                                <div className="w-1 h-4 bg-white rounded"></div>
                              </div>
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {isAttendanceLoading ? (
                            <tr>
                              <td colSpan={visibleDetailedSummaryColumns.length} className="p-8 text-center text-gray-500">
                                <div className="flex items-center justify-center gap-3">
                                  <Spinner size="md" />
                                  <span className="text-sm font-medium">Loading payroll data...</span>
                                </div>
                              </td>
                            </tr>
                          ) : attendanceSummaryData.length === 0 ? (
                            <tr>
                              <td colSpan={visibleDetailedSummaryColumns.length} className="py-12 text-center text-gray-500">
                                <div className="flex flex-col items-center gap-3">
                                  <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-3">
                                    <FileText size={24} className="text-gray-400" />
                                  </div>
                                  <p className="text-lg font-medium text-gray-600">No payroll data available</p>
                                  <p className="text-sm text-gray-400">Select a month to view detailed summary</p>
                                </div>
                              </td>
                            </tr>
                          ) : (
                            <>
                              {attendanceSummaryData.map((emp, idx) => (
                                <tr 
                                  key={emp.id} 
                                  className={`border-b border-gray-100 transition-all duration-200 ${
                                    idx % 2 === 0 
                                      ? 'bg-white hover:bg-blue-50' 
                                      : 'bg-gray-50 hover:bg-gray-100'
                                  }`}
                                >
                                  <td className="px-3 py-2 text-center text-gray-900 font-medium border-r-2 border-blue-100 bg-blue-50/30">{emp.sno}</td>
                                  <td className="px-3 py-2 font-mono text-gray-700 border-r-2 border-blue-100 bg-blue-50/30">{emp.empId}</td>
                                  <td className="px-3 py-2 font-medium text-gray-900 truncate max-w-xs border-r-2 border-blue-100 bg-blue-50/30" title={emp.name}>{emp.name}</td>
                                  <td className="px-3 py-2 text-gray-600 truncate max-w-xs border-r-2 border-blue-100 bg-blue-50/30" title={emp.designation}>{emp.designation}</td>
                                  <td className="px-3 py-2 text-right font-medium text-gray-900 border-r-2 border-purple-100 bg-purple-50/30">{(emp.fullBasic/1000).toFixed(1)}k</td>
                                  <td className="px-3 py-2 text-right font-medium text-gray-900 border-r-2 border-purple-100 bg-purple-50/30">{(emp.fullHra/1000).toFixed(1)}k</td>
                                  <td className="px-3 py-2 text-right font-semibold text-blue-600 border-r-2 border-purple-100 bg-purple-50/30">{Math.round(emp.fullBasic + emp.fullHra).toLocaleString('en-IN')}</td>
                                  <td className="px-3 py-2 text-center font-medium text-gray-900 border-r-2 border-green-100 bg-green-50/30">{emp.totalDays}</td>
                                  <td className="px-3 py-2 text-center font-medium text-gray-900 border-r-2 border-green-100 bg-green-50/30">{emp.worked}</td>
                                  <td className="px-3 py-2 text-center font-medium text-gray-900 border-r-2 border-green-100 bg-green-50/30">{emp.sunW}</td>
                                  <td className="px-3 py-2 text-center font-medium text-gray-900 border-r-2 border-green-100 bg-green-50/30">{emp.holW}</td>
                                  <td className="px-3 py-2 text-center font-medium text-gray-900 border-r-2 border-green-100 bg-green-50/30">{emp.leave}</td>
                                  <td className="px-3 py-2 text-center font-medium text-gray-900 border-r-2 border-green-100 bg-green-50/30">{emp.totalWorkingDays}</td>
                                  <td className="px-3 py-2 text-right font-medium text-gray-900 border-r-2 border-emerald-100 bg-emerald-50/30">₹{Math.round(emp.basic).toLocaleString('en-IN')}</td>
                                  <td className="px-3 py-2 text-right font-medium text-gray-900 border-r-2 border-emerald-100 bg-emerald-50/30">₹{Math.round(emp.hra).toLocaleString('en-IN')}</td>
                                  <td className="px-3 py-2 text-right font-semibold text-green-600 border-r-2 border-emerald-100 bg-emerald-50/30">₹{Math.round(emp.basic + emp.hra).toLocaleString('en-IN')}</td>
                                  <td className="px-3 py-2 text-right font-medium text-amber-600 border-r-2 border-emerald-100 bg-emerald-50/30">₹{Math.round(emp.sunPay + emp.holPay).toLocaleString('en-IN')}</td>
                                  <td className="px-3 py-2 text-right font-medium text-blue-600 border-r-2 border-emerald-100 bg-emerald-50/30">₹{Math.round(emp.salary.earnings.find(e => e.label === 'OT Est.')?.value || 0).toLocaleString('en-IN')}</td>
                                  <td className="px-3 py-2 text-right font-semibold text-green-600 border-r-2 border-emerald-100 bg-emerald-50/30">₹{Math.round(emp.totalEarnings).toLocaleString('en-IN')}</td><td className="px-1.5 border-b text-red-600 text-right tabular-nums">₹{Math.round(emp.pf).toLocaleString('en-IN')}</td><td className="px-1.5 border-b text-gray-400 text-right">-</td><td className="px-1.5 border-b text-red-600 text-right tabular-nums">₹{Math.round(emp.loanE + emp.advanceAmount).toLocaleString('en-IN')}</td><td className="px-1.5 border-b text-purple-600 text-right tabular-nums">₹{Math.round(emp.vrAdvance).toLocaleString('en-IN')}</td><td className="px-1.5 border-b text-red-600 text-right tabular-nums">₹{Math.round(emp.fine || 0).toLocaleString('en-IN')}</td><td className="px-1.5 border-b text-red-600 text-right font-bold">₹{Math.round(emp.totalDeductions).toLocaleString('en-IN')}</td><td className="px-1.5 border-b text-emerald-700 text-right font-bold">₹{Math.round(emp.salary.net).toLocaleString('en-IN')}</td></tr>))}
                              <tr className="bg-gradient-to-r from-green-600 to-green-700 text-white font-semibold">
                                <td colSpan={visibleDetailedSummaryColumns.length} className="px-4 py-3 text-right">
                                  <div className="flex items-center justify-between">
                                    <span className="text-sm uppercase tracking-wider">Grand Total Net Payout:</span>
                                    <span className="text-lg font-bold">{formatSummaryCurrency(attendanceSummaryData.reduce((sum, emp) => sum + (Number(emp.salary?.net) || 0), 0))}</span>
                                  </div>
                                </td>
                              </tr>
                            </>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
              {isDetailPanelOpen && (
                <div className="w-[200px] bg-white rounded-lg border border-gray-200 shadow-xl flex flex-col shrink-0 overflow-hidden h-1/2 animate-in slide-in-from-right duration-300">
                  <div className="p-2.5 border-b border-gray-100 flex justify-between items-center bg-gray-50/50 shrink-0">{summaryEmpDetail ? (<div><h3 className="font-black text-gray-900 uppercase font-google-sans text-[9px] tracking-tight truncate w-[140px]">{summaryEmpDetail.name}</h3><p className="text-[7px] text-gray-400 font-bold uppercase tracking-widest">{summaryEmpDetail.empId}</p></div>) : (<div><h3 className="font-black text-gray-300 uppercase font-google-sans text-[9px] tracking-tight">Details</h3><p className="text-[7px] text-gray-300 font-bold uppercase tracking-widest">No Selection</p></div>)}<button onClick={() => setIsDetailPanelOpen(false)} className="p-1 hover:bg-gray-200 rounded-full transition-all text-gray-400"><X size={10} /></button></div>
                  <div className="p-2.5 font-inter flex-1 overflow-hidden flex flex-col">{!summaryEmpDetail ? (<div className="h-full flex flex-col items-center justify-center space-y-2 opacity-10 py-10"><FileText size={32} strokeWidth={1} /><p className="text-[7px] font-bold uppercase tracking-widest text-center px-4">Select record</p></div>) : (
                    <div className="space-y-3 flex-1 flex flex-col"><div className="space-y-3 flex-1 overflow-auto"><div className="space-y-1.5"><div className="flex items-center gap-1 text-indigo-600 font-black uppercase text-[7px] tracking-widest"><FileText size={8} /> Earnings</div><div className="bg-indigo-50/30 rounded border border-indigo-100 p-2 space-y-1">{summaryEmpDetail.salary.earnings.map((e, i) => (<div key={i} className="flex justify-between text-[9px] font-medium text-gray-600">{e.label} <span className="font-bold text-gray-900">{formatINR(e.value)}</span></div>))}</div></div><div className="space-y-1.5"><div className="flex items-center gap-1 text-red-600 font-black uppercase text-[7px] tracking-widest"><AlertCircle size={8} /> Deductions</div><div className="bg-red-50/30 rounded border border-red-100 p-2 space-y-1">{summaryEmpDetail.salary.deductions.map((d, i) => (<div key={i} className="flex justify-between text-[9px] font-medium text-gray-600">{d.label} <span className="font-bold text-gray-900">{formatINR(d.value)}</span></div>))}</div></div></div><div className="pt-2 border-t border-dashed border-gray-200 shrink-0"><div className="bg-gray-900 text-white rounded-lg p-2.5 text-center shadow-lg"><p className="text-[6px] font-bold text-gray-400 uppercase tracking-widest mb-0.5">Net Payout (Est.)</p><p className="text-base font-black font-google-sans tracking-tighter">{formatINR(summaryEmpDetail.salary.net)}</p></div><button onClick={() => { setActiveTab('salary-slip'); setSelectedEmp(summaryEmpDetail.id); }} className="w-full mt-2 py-1.5 bg-indigo-50 text-indigo-700 font-black rounded text-[7px] uppercase tracking-widest hover:bg-indigo-600 hover:text-white transition-all shadow-sm">Go to Generator</button></div></div>
                  )}</div>
                </div>
              )}
            </div>
          </div>
        )}
        {activeTab === 'loan' && (
          <div className="max-w-full space-y-4 flex flex-col h-full overflow-hidden">
            <div className="flex border-b border-gray-200 overflow-x-auto shrink-0 bg-white">{['Configuration', 'Active Schedules', 'Activity'].map(mod => (<button key={mod} onClick={() => setLoanActiveModule(mod)} className={`whitespace-nowrap px-6 py-3 text-[11px] font-black uppercase tracking-widest transition-all ${loanActiveModule === mod ? 'border-b-2 border-indigo-600 text-indigo-700 bg-indigo-50/50' : 'text-gray-500 hover:text-gray-800 hover:bg-gray-50'}`}>{mod}</button>))}</div>
            <div className="flex-1 overflow-auto p-4">
              {loanActiveModule === 'Configuration' && (
                <div className="max-w-2xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500"><div className="bg-white rounded-3xl border border-gray-200 shadow-xl overflow-hidden"><div className="p-6 bg-slate-100 text-slate-900 flex justify-between items-center border-b border-slate-200"><div><h3 className="text-lg font-black uppercase font-google-sans tracking-tight">Loan Setup</h3><p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">Lifecycle tracking for advances</p></div><Settings className="text-indigo-500" size={24} /></div><div className="p-8 space-y-6"><div className="space-y-1.5"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Target Employee</label><select value={loanForm.employeeId} onChange={e => setEditLoanForm({...loanForm, employeeId: e.target.value})} className="w-full h-12 border border-gray-200 rounded-2xl px-4 bg-slate-50 focus:ring-2 focus:ring-indigo-500 outline-none font-bold text-slate-800 transition-all"><option value="">Choose Employee...</option>{employees.filter(e => e.includeInSalary !== false).map(e => <option key={e.id} value={e.id}>{e.name}</option>)}</select></div><div className="grid grid-cols-2 gap-6"><div className="space-y-1.5"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Principal Amount (₹)</label><input type="number" value={loanForm.totalAmount} onChange={e => setEditLoanForm({...loanForm, totalAmount: e.target.value})} className="w-full h-12 border border-gray-200 rounded-2xl px-4 font-black bg-slate-50 focus:ring-2 focus:ring-indigo-500 outline-none text-indigo-600 text-lg" placeholder="0.00" /></div><div className="space-y-1.5"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Monthly EMI (₹)</label><input type="number" value={loanForm.emiAmount} onChange={e => setEditLoanForm({...loanForm, emiAmount: e.target.value})} className="w-full h-12 border border-gray-200 rounded-2xl px-4 font-black bg-slate-50 focus:ring-2 focus:ring-indigo-500 outline-none text-slate-800 text-lg" placeholder="0.00" /></div></div><div className="space-y-1.5"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Recovery Remarks</label><input type="text" value={loanForm.remarks} onChange={e => setEditLoanForm({...loanForm, remarks: e.target.value})} className="w-full h-12 border border-gray-200 rounded-2xl px-4 bg-slate-50 focus:ring-2 focus:ring-indigo-500 outline-none font-medium text-slate-600" placeholder="Reason for loan..." /></div><div className="pt-4 flex gap-4"><button onClick={() => { setEditLoanForm({ employeeId: '', totalAmount: '', emiAmount: '', startMonth: '', remarks: '' }); setEditingLoanId(null); setLoanActiveModule('Active Schedules'); }} className="flex-1 h-12 bg-slate-100 text-slate-600 font-black rounded-2xl uppercase text-[11px] tracking-widest hover:bg-slate-200 transition-all">Cancel</button><button onClick={handleCreateLoan} disabled={loading} className="flex-2 h-12 bg-indigo-600 text-white font-black rounded-2xl uppercase text-[11px] tracking-widest shadow-lg shadow-indigo-600/20 hover:bg-indigo-700 active:scale-95 transition-all">{editingLoanId ? 'Update Recovery Plan' : 'Activate Loan Schedule'}</button></div></div></div></div>
              )}
              {loanActiveModule === 'Active Schedules' && (
                <div className="space-y-6 animate-in fade-in duration-500"><div className="bg-white rounded-[32px] border border-gray-200 shadow-xl overflow-hidden"><div className="overflow-x-auto"><table className="w-full text-left border-collapse font-inter"><thead><tr className="bg-slate-100 text-[10px] font-black uppercase tracking-widest text-slate-600 h-14 border-b border-slate-200"><th className="px-8 border-r border-slate-200">Employee</th><th className="px-8 border-r border-slate-200 text-right">Remaining Principal</th><th className="px-8 text-right">Actions</th></tr></thead><tbody className="divide-y divide-slate-100">{loans.length === 0 ? (<tr><td colSpan={3} className="px-8 py-20 text-center text-slate-300 font-black uppercase tracking-widest italic opacity-50">No active recovery schedules</td></tr>) : loans.map(l => (<tr key={l.id} className="hover:bg-slate-50/50 transition-colors h-16 group"><td className="px-8 border-r border-slate-50 font-black text-slate-900 text-sm uppercase">{l.employeeName}</td><td className="px-8 border-r border-slate-50 text-right font-black text-emerald-600 text-base tabular-nums">{formatINR(l.remainingAmount)}</td><td className="px-8 text-right"><div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-all"><button onClick={() => handleEditLoan(l)} className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl hover:bg-indigo-600 hover:text-white transition-all shadow-sm" title="Edit Schedule"><Edit2 size={16}/></button><button onClick={() => setSelectedLoan(l)} className="p-2.5 bg-amber-50 text-amber-600 rounded-xl hover:bg-amber-600 hover:text-white transition-all shadow-sm" title="Manual Override"><RefreshCw size={16}/></button><button onClick={() => handleDeleteLoan(l.id, l.employeeName)} className="p-2.5 bg-rose-50 text-rose-600 rounded-xl hover:bg-rose-600 hover:text-white transition-all shadow-sm" title="Delete Plan"><Trash2 size={16}/></button></div></td></tr>))}</tbody></table></div></div>{selectedLoan && (<div className="bg-white rounded-[32px] border-2 border-amber-400 p-8 shadow-2xl animate-in slide-in-from-top-4 duration-500 max-w-4xl mx-auto"><div className="flex justify-between items-center mb-6"><div className="flex items-center gap-3"><div className="p-3 bg-amber-100 rounded-2xl text-amber-700"><Info size={24}/></div><div><h3 className="font-black text-slate-900 uppercase font-google-sans tracking-tight">Manual Override</h3><p className="text-[10px] text-amber-600 font-bold uppercase tracking-widest">Adjusting: {selectedLoan.employeeName}</p></div></div><button onClick={() => setSelectedLoan(null)} className="p-2 hover:bg-slate-100 rounded-full text-slate-400 transition-all"><X size={20}/></button></div><div className="grid grid-cols-1 md:grid-cols-4 gap-6 items-end"><div className="space-y-1.5"><label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Target Month</label><input type="month" value={overrideForm.month} onChange={e => setOverrideForm({...overrideForm, month: e.target.value})} className="w-full h-12 border border-slate-200 rounded-2xl px-4 font-black text-slate-800 bg-slate-50 focus:ring-2 focus:ring-amber-500 outline-none"/></div><div className="space-y-1.5"><label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Override EMI (₹)</label><input type="number" disabled={overrideForm.skip} value={overrideForm.amount} onChange={e => setOverrideForm({...overrideForm, amount: e.target.value})} className="w-full h-12 border border-slate-200 rounded-2xl px-4 font-black text-indigo-600 bg-slate-50 focus:ring-2 focus:ring-amber-500 outline-none disabled:opacity-50"/></div><div className="flex items-center gap-3 h-12 bg-amber-50 px-4 rounded-2xl border border-amber-100"><input type="checkbox" id="skipEMI" checked={overrideForm.skip} onChange={e => setOverrideForm({...overrideForm, skip: e.target.checked})} className="w-5 h-5 rounded-lg text-amber-600 border-amber-300 focus:ring-amber-500 transition-all"/><label htmlFor="skipEMI" className="text-[11px] font-black text-amber-700 uppercase cursor-pointer">Skip EMI</label></div><button onClick={() => handleUpdateOverride(selectedLoan.id)} className="h-12 bg-amber-600 text-white font-black rounded-2xl uppercase text-[11px] tracking-widest shadow-lg shadow-amber-600/20 hover:bg-amber-700 active:scale-95 transition-all">Apply Adjustment</button></div></div>)}</div>
              )}
              {loanActiveModule === 'Activity' && (
                <div className="max-w-4xl mx-auto space-y-4 animate-in fade-in duration-500">
                  <div className="bg-white rounded-xl border border-gray-200 shadow-lg overflow-hidden">
                    <div className="p-6 bg-gradient-to-r from-indigo-50 to-blue-50 border-b border-gray-200">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-indigo-600 rounded-lg flex items-center justify-center">
                            <History size={20} className="text-white" />
                          </div>
                          <h3 className="text-xl font-bold text-gray-900 tracking-tight">Recent Activity</h3>
                        </div>
                        <div className="text-sm text-gray-500 font-medium">Latest loan management actions</div>
                      </div>
                    </div>
                    <div className="p-6">
                      <div className="space-y-4 relative">
                        {loanActivities.length === 0 ? (
                          <div className="text-center py-12">
                            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                              <History size={24} className="text-gray-400" />
                            </div>
                            <div>
                              <p className="text-lg font-medium text-gray-600">No recent activity</p>
                              <p className="text-sm text-gray-400">Loan activities will appear here</p>
                            </div>
                          </div>
                        ) : (
                          loanActivities.map((act, i) => (
                            <div key={act.id} className="relative pl-10 group">
                              <div className={`absolute left-3 top-2 w-4 h-4 rounded-full border-2 border-white shadow-sm transition-all duration-200 ${
                                act.action === 'Deleted' ? 'bg-red-500' : 
                                act.action === 'Updated' ? 'bg-amber-500' : 
                                'bg-emerald-500'
                              }`}>
                                <div className="w-2 h-2 rounded-full bg-white"></div>
                              </div>
                              <div className="bg-white rounded-lg border border-gray-200 p-4 ml-8 hover:shadow-md transition-all duration-200 group-hover:border-indigo-300">
                                <div className="flex justify-between items-start gap-4">
                                  <div className="flex-1">
                                    <p className="text-sm font-semibold text-gray-900 leading-relaxed">{act.detail}</p>
                                    <p className="text-xs text-gray-500 mt-1">
                                      {act.action === 'Deleted' && 'Loan schedule removed'}
                                      {act.action === 'Updated' && 'Loan details modified'}
                                      {act.action === 'Created' && 'New loan schedule created'}
                                    </p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-gray-400 whitespace-nowrap bg-gray-100 px-2 py-1 rounded-md border border-gray-200">
                                    {act.timestamp?.toDate ? act.timestamp.toDate().toLocaleDateString('en-US', { 
                                      day: '2-digit', 
                                      month: 'short', 
                                      year: 'numeric',
                                      hour: '2-digit',
                                      minute: '2-digit'
                                    }) : 'Just now'}
                                  </span>
                                </div>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
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
