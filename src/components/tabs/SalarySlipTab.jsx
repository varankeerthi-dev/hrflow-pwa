import React, { useState, useEffect, useRef, useMemo } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { useEmployees } from '../../hooks/useEmployees'
import { useSalarySlab } from '../../hooks/useSalarySlab'
import { db } from '../../lib/firebase'
import { collection, query, where, getDocs, orderBy, limit, addDoc, serverTimestamp, setDoc, doc, getDoc, updateDoc, deleteDoc } from 'firebase/firestore'
import { formatINR, numberToWords } from '../../lib/salaryUtils'
import Spinner from '../ui/Spinner'
import { Wallet, Search, Download, Plus, Minus, History, Settings, AlertCircle, Info, X, CheckCircle2, Edit2, Trash2, Banknote, Clock, ChevronLeft, ChevronRight, FileText, Calendar as CalendarIcon, ChevronDown, ChevronUp, RefreshCw, ArrowUpRight, ArrowRight } from 'lucide-react'
import { Document, Page, Text, View, StyleSheet, PDFDownloadLink, Image, Font, pdf } from '@react-pdf/renderer'
import { logActivity } from '../../hooks/useActivityLog'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useReactTable, getCoreRowModel, flexRender } from '@tanstack/react-table'
import { useSidebar } from '../../contexts/SidebarContext'

// --- HELPERS ---
const dashIfZero = (val) => (!val || val === 0 || val === '0') ? '-' : Math.round(Number(val)).toLocaleString('en-IN');

const formatDateDDMMYYYY = (dateStr) => {
  if (!dateStr || dateStr === '-') return '-';
  if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) { const [y, m, d] = dateStr.split('-'); return `${d}/${m}/${y}`; }
  try { const date = new Date(dateStr); if (isNaN(date.getTime())) return dateStr; const d = String(date.getDate()).padStart(2, '0'); const m = String(date.getMonth() + 1).padStart(2, '0'); const y = date.getFullYear(); return `${d}/${m}/${y}`; } catch { return dateStr; }
};

const formatMonthDisplay = (monthStr) => {
  if (!monthStr) return '-';
  if (monthStr.match(/^\d{4}-\d{2}$/)) {
    const [year, month] = monthStr.split('-');
    const date = new Date(year, parseInt(month) - 1);
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }
  return monthStr;
};

const formatSummaryCurrency = (value) => `₹${Math.round(Number(value) || 0).toLocaleString('en-IN')}`

const downloadPdfBlob = (blob, fileName) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// --- CONSTANTS ---
const DETAILED_SUMMARY_COLUMNS = [
  { id: 'sno', label: 'S.No', width: 32, mandatory: true },
  { id: 'empNo', label: 'Employee ID', width: 80 },
  { id: 'name', label: 'Staff name', width: 140, mandatory: true },
  { id: 'designation', label: 'Designation', width: 100 },
  { id: 'basicCtc', label: 'Basic (CTC)', width: 70 },
  { id: 'hraCtc', label: 'HRA (CTC)', width: 70 },
  { id: 'salaryCtc', label: 'Total (CTC)', width: 80 },
  { id: 'days', label: 'Total days', width: 45 },
  { id: 'worked', label: 'Worked days', width: 45 },
  { id: 'sunWorked', label: 'Sunday worked', width: 45 },
  { id: 'holidayWorked', label: 'Holiday worked', width: 45 },
  { id: 'otH', label: 'OT hours', width: 45 },
  { id: 'hd', label: 'Half days', width: 45 },
  { id: 'lop', label: 'LOP days', width: 45 },
  { id: 'paidDays', label: 'Paid days', width: 45 },
  { id: 'basicPaid', label: 'Basic (Paid)', width: 60 },
  { id: 'hraPaid', label: 'HRA (Paid)', width: 60 },
  { id: 'salaryPaid', label: 'Earnings (Paid)', width: 60 },
  { id: 'sundayPay', label: 'Sunday\npay', width: 50 },
  { id: 'holidayPay', label: 'Holiday\npay', width: 50 },
  { id: 'otPay', label: 'OT\npay', width: 52 },
  { id: 'earnings', label: 'Gross earnings', width: 70 },
  { id: 'pf', label: 'PF', width: 45 },
  { id: 'esi', label: 'ESI', width: 45 },
  { id: 'loan', label: 'Loan', width: 50 },
  { id: 'ded', label: 'Fine', width: 50 },
  { id: 'advance', label: 'Advance', width: 55 },
  { id: 'reimb', label: 'Expense', width: 55 },
  { id: 'netAdj', label: 'Net\n(Adv-Exp)', width: 60 },
  { id: 'net', label: 'Net payout', width: 110, mandatory: true }
];

// --- PDF COMPONENTS ---

const DetailedSalarySummaryPDF = ({ data, month, orgName, visibleColumns, visibleGroups }) => {
  const pdfColWidth = (id) => {
    const c = visibleColumns.find(col => col.id === id);
    if (!c) return 0;
    return c.width * 0.55; 
  };

  const getPdfVal = (colId, row) => {
    switch (colId) {
      case 'sno': return row.sno;
      case 'empNo': return row.empId;
      case 'name': return row.name;
      case 'designation': return row.designation;
      case 'basicCtc': return Math.round(row.fullBasic).toLocaleString('en-IN');
      case 'hraCtc': return Math.round(row.fullHra).toLocaleString('en-IN');
      case 'salaryCtc': return Math.round(row.fullBasic + row.fullHra).toLocaleString('en-IN');
      case 'days': return row.totalDays;
      case 'worked': return row.worked;
      case 'sunWorked': return row.sunW || 0;
      case 'holidayWorked': return row.holW || 0;
      case 'otH': return (row.ot + row.otAdjustment).toFixed(2);
      case 'hd': return row.hd || 0;
      case 'lop': return row.lop || 0;
      case 'paidDays': return row.paidDays;
      case 'basicPaid': return Math.round(row.basic).toLocaleString('en-IN');
      case 'hraPaid': return Math.round(row.hra).toLocaleString('en-IN');
      case 'salaryPaid': return Math.round(row.basic + row.hra).toLocaleString('en-IN');
      case 'sundayPay': return Math.round(row.sunPay).toLocaleString('en-IN');
      case 'holidayPay': return Math.round(row.holPay).toLocaleString('en-IN');
      case 'otPay': return Math.round(row.otPay).toLocaleString('en-IN');
      case 'earnings': return Math.round(row.totalEarnings).toLocaleString('en-IN');
      case 'pf': return Math.round(row.pf).toLocaleString('en-IN');
      case 'esi': return Math.round(row.esi).toLocaleString('en-IN');
      case 'loan': return Math.round(row.loanE).toLocaleString('en-IN');
      case 'ded': return Math.round(row.fine).toLocaleString('en-IN');
      case 'advance': return Math.round(row.advanceAmount).toLocaleString('en-IN');
      case 'reimb': return Math.round(row.expenseAmount).toLocaleString('en-IN');
      case 'netAdj': return Math.round((row.advanceAmount || 0) - (row.expenseAmount || 0)).toLocaleString('en-IN');
      case 'net': return Math.round(row.salary?.net || 0).toLocaleString('en-IN');
      default: return '-';
    }
  }

  const getGroupColor = (color) => {
    switch(color) {
      case 'blue': return '#dbeafe';
      case 'purple': return '#f3e8ff';
      case 'amber': return '#fff7ed';
      case 'emerald': return '#dcfce7';
      case 'red': return '#fee2e2';
      case 'green': return '#059669';
      default: return '#f3f4f6';
    }
  };

  return (
    <Document>
      <Page size="A3" orientation="landscape" style={{ padding: 10, fontSize: 5, fontFamily: 'Helvetica' }}>
        <View style={{ marginBottom: 10, borderBottom: 1, borderColor: '#000', paddingBottom: 6, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <View>
            <Text style={{ fontSize: 14, fontWeight: 'bold' }}>{orgName}</Text>
            <Text style={{ fontSize: 8, marginTop: 2, textTransform: 'uppercase', letterSpacing: 1 }}>MASTER PAYROLL RECONCILIATION - {formatMonthDisplay(month)}</Text>
          </View>
          <View style={{ textAlign: 'right' }}>
            <Text style={{ fontSize: 6, color: '#666' }}>Engine v2.0 • Generated on {new Date().toLocaleString()}</Text>
          </View>
        </View>

        <View style={{ borderWidth: 0.5, borderColor: '#000' }}>
          <View style={{ flexDirection: 'row', backgroundColor: '#f3f4f6', fontWeight: 'bold', borderBottomWidth: 0.5 }}>
            {visibleGroups.map(g => {
               const width = g.columns.filter(id => visibleColumns.some(c => c.id === id)).reduce((sum, id) => sum + pdfColWidth(id), 0);
               if (width === 0) return null;
               return (
                 <Text key={g.id} style={{ width, padding: 2, borderRightWidth: 0.5, textAlign: 'center', backgroundColor: getGroupColor(g.color), color: g.color === 'green' ? '#fff' : '#000' }}>
                   {g.label.toUpperCase()}
                 </Text>
               );
            })}
          </View>

          <View style={{ flexDirection: 'row', backgroundColor: '#fff', fontWeight: 'bold', borderBottomWidth: 0.5 }}>
            {visibleColumns.map(c => (
              <Text key={c.id} style={{ width: pdfColWidth(c.id), padding: 1.5, borderRightWidth: 0.5, textAlign: c.id === 'name' ? 'left' : 'center', backgroundColor: c.id === 'net' ? '#22c55e' : '#fff', color: c.id === 'net' ? '#fff' : '#4b5563' }}>
                {c.label.replace('\n', ' ')}
              </Text>
            ))}
          </View>

          {data.map((row, i) => (
            <View key={i} style={{ flexDirection: 'row', borderBottomWidth: 0.5, backgroundColor: i % 2 === 0 ? '#fff' : '#fafafa' }}>
              {visibleColumns.map(c => (
                <Text key={c.id} style={{ width: pdfColWidth(c.id), padding: 1.5, borderRightWidth: 0.5, textAlign: ['name', 'designation'].includes(c.id) ? 'left' : (['sno', 'empNo', 'days', 'worked', 'sunWorked', 'holidayWorked', 'hd', 'lop', 'paidDays'].includes(c.id) ? 'center' : 'right'), fontWeight: c.id === 'name' || c.id === 'net' ? 'bold' : 'normal' }}>
                  {getPdfVal(c.id, row)}
                </Text>
              ))}
            </View>
          ))}

          <View style={{ flexDirection: 'row', backgroundColor: '#000', color: '#fff', fontWeight: 'bold' }}>
            <Text style={{ flex: 1, padding: 4, textAlign: 'right', fontSize: 7 }}>ORGANIZATION DISBURSEMENT TOTAL:</Text>
            <Text style={{ width: pdfColWidth('net'), padding: 4, textAlign: 'right', fontSize: 8, backgroundColor: '#16a34a' }}>
              {formatSummaryCurrency(data.reduce((sum, r) => sum + (r.salary?.net || 0), 0))}
            </Text>
          </View>
        </View>
      </Page>
    </Document>
  );
};

const SalarySlipPDF = ({ data, orgName, orgLogo }) => (
  <Document><Page size="A4" style={{ padding: 30, fontSize: 9, fontFamily: 'Helvetica', color: '#0f172a' }}>
    <View style={{ borderBottomWidth: 2, borderBottomColor: '#4f46e5', paddingBottom: 15, marginBottom: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
      <View style={{flexDirection:'row', alignItems:'center'}}>
        {orgLogo && <Image src={orgLogo} style={{width:40,height:40,marginRight:10}}/>}
        <View><Text style={{ fontSize: 20, fontWeight: 'bold', textTransform: 'uppercase', color: '#0f172a' }}>{orgName}</Text><Text style={{fontSize:7, color:'#3b82f6', fontWeight: 'bold', marginTop:2}}>PAYROLL STATEMENT</Text></View>
      </View>
      <View style={{textAlign:'right'}}><Text style={{fontSize:12, fontWeight: 'bold', color:'#0f172a'}}>PAYSLIP</Text><Text style={{fontSize:8, color:'#64748b', marginTop:2}}>{formatMonthDisplay(data.month)}</Text></View>
    </View>
    <View style={{flexDirection:'row', justifyContent:'space-between', marginBottom:20}}>
      <View style={{flex: 1}}>
        <View style={{ flexDirection: 'row', marginBottom: 2 }}><Text style={{ width: 120, color: '#64748b', fontWeight: 'bold', fontSize: 10 }}>Employee Name</Text><Text style={{ flex: 1, fontWeight: 'bold', color: '#1e293b', fontSize: 10 }}>: {data.employee?.name}</Text></View>
        <View style={{ flexDirection: 'row', marginBottom: 2 }}><Text style={{ width: 120, color: '#64748b', fontWeight: 'bold', fontSize: 10 }}>Employee ID</Text><Text style={{ flex: 1, fontWeight: 'bold', color: '#1e293b', fontSize: 10 }}>: {data.employee?.empCode}</Text></View>
        <View style={{ flexDirection: 'row', marginBottom: 2 }}><Text style={{ width: 120, color: '#64748b', fontWeight: 'bold', fontSize: 10 }}>Designation</Text><Text style={{ flex: 1, fontWeight: 'bold', color: '#1e293b', fontSize: 10 }}>: {data.employee?.designation || '-'}</Text></View>
        <View style={{ flexDirection: 'row', marginBottom: 2 }}><Text style={{ width: 120, color: '#64748b', fontWeight: 'bold', fontSize: 10 }}>No. of days Paid</Text><Text style={{ flex: 1, fontWeight: 'bold', color: '#1e293b', fontSize: 10 }}>: {data.paidDays}</Text></View>
        <View style={{ flexDirection: 'row', marginBottom: 2 }}><Text style={{ width: 120, color: '#64748b', fontWeight: 'bold', fontSize: 10 }}>Worked Holidays</Text><Text style={{ flex: 1, fontWeight: 'bold', color: '#1e293b', fontSize: 10 }}>: {data.holidayWorkedCount || 0}</Text></View>
      </View>
    </View>
    <View style={{borderWidth:1, borderColor:'#0f172a', borderRadius:8, overflow:'hidden'}}>
      <View style={{flexDirection:'row', backgroundColor:'#0f172a', color:'white', padding:8}}><Text style={{flex:1, fontSize:8, fontWeight:'bold'}}>EARNINGS</Text><Text style={{flex:1, textAlign:'right', fontSize:8, fontWeight:'bold'}}>DEDUCTIONS</Text></View>
      <View style={{flexDirection:'row'}}><View style={{flex:1, borderRightWidth:1, borderColor:'#e2e8f0'}}><View style={{flexDirection:'row', justifyContent:'space-between', padding:8, borderBottomWidth:1, borderColor:'#f1f5f9'}}><Text>Basic Salary</Text><Text>{formatINR(data.basic)}</Text></View><View style={{flexDirection:'row', justifyContent:'space-between', padding:8, borderBottomWidth:1, borderColor:'#f1f5f9'}}><Text>HRA</Text><Text>{formatINR(data.hra)}</Text></View><View style={{flexDirection:'row', justifyContent:'space-between', padding:8, borderBottomWidth:1, borderColor:'#f1f5f9'}}><Text>Sunday Worked</Text><Text>{formatINR(data.sundayPay)}</Text></View><View style={{flexDirection:'row', justifyContent:'space-between', padding:8}}><Text>Holiday Pay</Text><Text>{formatINR(data.holidayPay)}</Text></View></View><View style={{flex:1}}><View style={{flexDirection:'row', justifyContent:'space-between', padding:8, borderBottomWidth:1, borderColor:'#f1f5f9'}}><Text>PF</Text><Text>{dashIfZero(data.pf)}</Text></View><View style={{flexDirection:'row', justifyContent:'space-between', padding:8, borderBottomWidth:1, borderColor:'#f1f5f9'}}><Text>ESI</Text><Text>{dashIfZero(data.esi)}</Text></View><View style={{flexDirection:'row', justifyContent:'space-between', padding:8}}><Text>Advance Recovery</Text><Text>{dashIfZero(data.advanceDeduction)}</Text></View></View></View>
      <View style={{flexDirection:'row', backgroundColor:'#f8fafc', borderTopWidth:1, borderColor:'#0f172a'}}><View style={{flex:1, flexDirection:'row', justifyContent:'space-between', padding:8, borderRightWidth:1, borderColor:'#0f172a'}}><Text style={{fontWeight:'bold'}}>GROSS PAY</Text><Text style={{fontWeight:'bold'}}>{formatINR(data.grossEarnings)}</Text></View><View style={{flex:1, flexDirection:'row', justifyContent:'space-between', padding:8}}><Text style={{fontWeight:'bold'}}>TOTAL DED.</Text><Text style={{fontWeight:'bold'}}>{formatINR(data.totalDeductions)}</Text></View></View>
    </View>
    <View style={{textAlign:'center', marginTop:20, borderTopWidth:1, borderColor:'#e2e8f0', borderStyle:'dashed', paddingTop:10}}><Text style={{fontSize:16, fontWeight:'bold'}}>{formatINR(data.netPay)}</Text><Text style={{fontSize:8, color:'#64748b', marginTop:4, textTransform:'uppercase'}}>Indian Rupee {numberToWords(data.netPay)} Only</Text></View>
  </Page></Document>
)

// --- MODALS ---

const OTEscalationModal = ({ isOpen, onClose, month, employees, initialAdjustments, orgId }) => {
  const [adjustments, setAdjustments] = useState({});
  const [showSuccess, setShowSuccess] = useState(false);
  const queryClient = useQueryClient();
  useEffect(() => { if (isOpen) { setAdjustments(initialAdjustments || {}); setShowSuccess(false); } }, [isOpen, initialAdjustments]);
  const handleAdjust = (empId, delta) => { const current = Number(adjustments[empId]) || 0; setAdjustments({ ...adjustments, [empId]: current + delta }); };
  const saveMutation = useMutation({
    mutationFn: async (data) => {
      const batch = [];
      for (const [empId, adjust] of Object.entries(data)) {
        const docId = `${month}_${empId}`;
        batch.push(setDoc(doc(db, 'organisations', orgId, 'otAdjustments', docId), { employeeId: empId, month: month, adjustment: Number(adjust), updatedAt: serverTimestamp() }));
      }
      await Promise.all(batch);
    },
    onSuccess: () => { 
      queryClient.invalidateQueries(['attendanceSummary']); 
      setShowSuccess(true);
      setTimeout(() => {
        setShowSuccess(false);
        onClose();
      }, 1500);
    }
  });
  if (!isOpen) return null;
  return (<div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"><div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[85vh] overflow-hidden relative">
    {showSuccess && (
      <div className="absolute inset-0 z-[110] bg-white/90 backdrop-blur-sm flex flex-col items-center justify-center animate-in fade-in duration-300">
        <div className="bg-emerald-100 text-emerald-600 p-4 rounded-full mb-4">
          <CheckCircle2 size={40} />
        </div>
        <h3 className="text-xl font-bold text-slate-900">OT Escalation Saved!</h3>
        <p className="text-slate-500 text-sm">Attendance records have been updated.</p>
      </div>
    )}
    <div className="px-6 py-4 border-b flex justify-between items-center"><div><h2 className="text-base font-normal">OT Escalation</h2><p className="text-[11px] text-slate-500">{formatMonthDisplay(month)}</p></div><button onClick={onClose}><X size={18} /></button></div><div className="flex-1 overflow-auto p-6"><table className="w-full text-sm"><thead><tr className="text-[10px] uppercase text-slate-400 border-b"><th className="pb-2 text-left font-normal">Employee</th><th className="pb-2 text-center font-normal">Actual</th><th className="pb-2 text-center font-normal">Adjustment</th><th className="pb-2 text-right font-normal">Final</th></tr></thead><tbody className="divide-y">{employees.map(emp => (<tr key={emp.id} className="h-14 hover:bg-slate-50"><td><p className="font-normal">{emp.name}</p></td><td className="text-center font-normal">{Number(emp.ot || 0).toFixed(2)}</td><td className="text-center flex items-center justify-center gap-2 py-2"><button onClick={()=>handleAdjust(emp.id, -1)} className="h-5 w-5 flex items-center justify-center border rounded hover:bg-slate-100 transition-colors"><Minus size={10}/></button><input type="number" step="0.5" className="w-12 text-center font-normal border-0 focus:ring-0" value={adjustments[emp.id] || 0} onChange={e => setAdjustments({...adjustments, [emp.id]: e.target.value})}/><button onClick={()=>handleAdjust(emp.id, 1)} className="h-5 w-5 flex items-center justify-center border rounded hover:bg-slate-100 transition-colors"><Plus size={10}/></button></td><td className="text-right font-normal">{(Number(emp.ot || 0) + (Number(adjustments[emp.id]) || 0)).toFixed(2)}</td></tr>))}</tbody></table></div><div className="p-4 border-t bg-slate-50 flex justify-end gap-3"><button onClick={onClose} className="px-4 py-2 text-xs font-normal">Cancel</button><button onClick={() => saveMutation.mutate(adjustments)} disabled={saveMutation.isPending || showSuccess} className="px-6 py-2 bg-indigo-600 text-white rounded-lg text-xs font-normal shadow-lg flex items-center gap-2">
      {saveMutation.isPending ? <RefreshCw size={14} className="animate-spin" /> : null}
      {saveMutation.isPending ? 'Saving...' : 'Save Changes'}
    </button></div></div></div>)
}

const EmployeeSearchableDropdown = ({ employees, selectedId, onSelect }) => {
  const [searchTerm, setSearchTerm] = useState(''); const [isOpen, setIsOpen] = useState(false); const dropdownRef = useRef(null);
  const filtered = useMemo(() => employees.filter(e => e.name.toLowerCase().includes(searchTerm.toLowerCase())), [employees, searchTerm]);
  useEffect(() => { const handleClickOutside = (e) => { if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setIsOpen(false); }; document.addEventListener('mousedown', handleClickOutside); return () => document.removeEventListener('mousedown', handleClickOutside); }, []);
  return (<div className="relative w-full" ref={dropdownRef}><div className="w-full h-7 border rounded-sm px-2 flex items-center justify-between bg-white cursor-pointer" onClick={() => setIsOpen(!isOpen)}><span className="text-[11px] font-semibold">{employees.find(e => e.id === selectedId)?.name || 'Search Staff...'}</span><ChevronDown size={10} /></div>{isOpen && (<div className="absolute top-full left-0 right-0 mt-1 bg-white border rounded-sm shadow-2xl z-[100] p-2"><input autoFocus type="text" className="w-full h-8 border rounded px-2 text-xs mb-1" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />{filtered.map(e => (<button key={e.id} className="w-full text-left px-2 py-1 text-sm hover:bg-gray-100 uppercase font-bold text-[10px]" onClick={() => { onSelect(e.id); setIsOpen(false); }}>{e.name}</button>))}</div>)}</div>)
}

// --- MAIN COMPONENT ---

export default function SalarySlipTab() {
  const { user } = useAuth(); const { employees } = useEmployees(user?.orgId, true); const { slabs, increments } = useSalarySlab(user?.orgId);
  const { isCollapsed, setIsCollapsed, setIsAutoCollapsed, isAutoCollapsed } = useSidebar();
  const isAdmin = user?.role?.toLowerCase() === 'admin'
  const [activeTab, setActiveTab] = useState('salary-summary')
  const [selectedEmp, setSelectedEmp] = useState('')
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  })
  const [summaryMonth, setSummaryMonth] = useState(selectedMonth)
  const [summarySubTab, setSummarySubTab] = useState('overview')
  const [summaryFilterEmpId, setSummaryFilterEmpId] = useState('')
  const [loading, setLoading] = useState(false)
  const [generated, setGenerated] = useState(false)
  const [slipData, setSlipData] = useState(null)

  useEffect(() => { setGenerated(false); }, [selectedEmp, selectedMonth])

  const [advExpRows, setAdvExpRows] = useState([])
  const [orgLogo, setOrgLogo] = useState('')
  const [orgData, setOrgData] = useState(null)
  const [exportingSlipPdf, setExportingSlipPdf] = useState(false)
  const [exportingDetailedPdf, setExportingDetailedPdf] = useState(false)
  const [selectedDetailedColumns, setSelectedDetailedColumns] = useState(() => DETAILED_SUMMARY_COLUMNS.map(c => c.id))
  const [showDetailedColumnPicker, setShowDetailedColumnPicker] = useState(false)
  const [employeeRowOrder, setEmployeeRowOrder] = useState([])
  const columnPickerRef = useRef(null)

  useEffect(() => {
    if (!user?.orgId || !user?.uid) return
    const fetchUserSettings = async () => {
      try {
        const [userPrefSnap, orgSnap] = await Promise.all([
          getDoc(doc(db, 'organisations', user.orgId, 'userPreferences', user.uid)),
          getDoc(doc(db, 'organisations', user.orgId))
        ])
        
        if (orgSnap.exists()) {
          const orgData = orgSnap.data()
          if (orgData.employeeRowOrder) setEmployeeRowOrder(orgData.employeeRowOrder)
          if (orgData.logoURL) setOrgLogo(orgData.logoURL)
        }

        if (userPrefSnap.exists()) {
          const data = userPrefSnap.data()
          if (data.detailedSummaryColumns) setSelectedDetailedColumns(data.detailedSummaryColumns)
        } else {
          if (orgSnap.exists()) {
            const data = orgSnap.data()
            if (data.detailedSummaryColumns) setSelectedDetailedColumns(data.detailedSummaryColumns)
          }
        }
      } catch (err) { console.error('Error fetching settings:', err) }
    }
    fetchUserSettings()
  }, [user?.orgId, user?.uid])

  useEffect(() => {
    const handleClickOutside = (e) => { if (columnPickerRef.current && !columnPickerRef.current.contains(e.target)) setShowDetailedColumnPicker(false) }
    if (showDetailedColumnPicker) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showDetailedColumnPicker])

  const saveDetailedColumnDefaults = async () => {
    if (!user?.orgId || !user?.uid) return
    try {
      await setDoc(doc(db, 'organisations', user.orgId, 'userPreferences', user.uid), { detailedSummaryColumns: selectedDetailedColumns, updatedAt: serverTimestamp() }, { merge: true })
      alert('Preferences saved for your account!')
      setShowDetailedColumnPicker(false)
    } catch (err) { alert('Failed to save preferences') }
  }

  const toggleAllColumns = () => {
    if (selectedDetailedColumns.length === DETAILED_SUMMARY_COLUMNS.length) {
      setSelectedDetailedColumns(DETAILED_SUMMARY_COLUMNS.filter(c => c.mandatory).map(c => c.id))
    } else {
      setSelectedDetailedColumns(DETAILED_SUMMARY_COLUMNS.map(c => c.id))
    }
  }

  const [isOtModalOpen, setIsOtModalOpen] = useState(false)
  const monthInputRef = useRef(null)

  useEffect(() => { if (activeTab === 'salary-summary' && summarySubTab === 'detailed') { if (!isCollapsed) { setIsCollapsed(true); setIsAutoCollapsed(true); } } else { if (isAutoCollapsed) { setIsCollapsed(false); setIsAutoCollapsed(false); } } }, [activeTab, summarySubTab, isCollapsed, isAutoCollapsed])

  const sortedEmployees = useMemo(() => {
    const base = employees.filter(e => e.includeInSalary !== false);
    if (!employeeRowOrder || !employeeRowOrder.length) return base;
    return [...base].sort((a, b) => {
      const idxA = employeeRowOrder.indexOf(a.id);
      const idxB = employeeRowOrder.indexOf(b.id);
      if (idxA === -1 && idxB === -1) return 0;
      if (idxA === -1) return 1;
      if (idxB === -1) return -1;
      return idxA - idxB;
    });
  }, [employees, employeeRowOrder])

  const { data: attendanceSummaryData = [], isLoading: isAttendanceLoading, refetch: refetchSummary } = useQuery({
    queryKey: ['attendanceSummary', user?.orgId, summaryMonth],
    queryFn: async () => {
      if (!user?.orgId || !sortedEmployees.length) return []; const [y, m] = summaryMonth.split('-').map(Number), end = new Date(y, m, 0).getDate(), sd = `${summaryMonth}-01`, ed = `${summaryMonth}-${end}`
      const [aSnap, loanSnap, aeSnap, fineSnap, otAdjSnap, orgSnap] = await Promise.all([
        getDocs(collection(db, 'organisations', user.orgId, 'attendance')), 
        getDocs(query(collection(db, 'organisations', user.orgId, 'loans'), where('status', '==', 'Active'))), 
        getDocs(collection(db, 'organisations', user.orgId, 'advances_expenses')), 
        getDocs(collection(db, 'organisations', user.orgId, 'fines')), 
        getDocs(query(collection(db, 'organisations', user.orgId, 'otAdjustments'), where('month', '==', summaryMonth))),
        getDoc(doc(db, 'organisations', user.orgId))
      ])
      const orgData = orgSnap.exists() ? orgSnap.data() : {}
      const holidayList = Array.isArray(orgData.holidays) ? orgData.holidays : []
      const holidayDates = new Set(holidayList.map(h => h.date).filter(Boolean))

      const allAtt = aSnap.docs.map(d => d.data()).filter(a => a.date >= sd && a.date <= ed), allLoans = loanSnap.docs.map(d => d.data()), allAE = aeSnap.docs.map(d => d.data()).filter(a => a.date >= sd && a.date <= ed), allFines = fineSnap.docs.map(d => d.data()).filter(f => f.date >= sd && f.date <= ed), otAdjs = otAdjSnap.docs.reduce((acc, d) => { acc[d.data().employeeId] = d.data().adjustment; return acc; }, {})
      return sortedEmployees.map((emp, idx) => {
        const empAtt = allAtt.filter(a => a.employeeId === emp.id), attByDate = new Map(empAtt.map(a => [a.date, a]))
        let worked = 0, sunW = 0, holW = 0, leave = 0, lop = 0, hd = 0, otH = 0, sunCount = 0, holCount = 0
        for (let i = 1; i <= end; i++) {
          const dateStr = `${summaryMonth}-${String(i).padStart(2, '0')}`, d = new Date(y, m - 1, i), isS = d.getDay() === 0, isH = holidayDates.has(dateStr) && !isS, r = attByDate.get(dateStr), status = String(r?.status || '').toLowerCase()
          if (emp.joinedDate && dateStr < emp.joinedDate) continue;
          if (isS) sunCount++
          if (isH) holCount++
          
          const isPresent = isWorkedAttendanceRecord(r) || r?.sundayWorked || r?.holidayWorked || status === 'sunworked'
          const isHD = status === 'half-day' || r?.isHalfDay

          if (status === 'absent' || r?.isAbsent) lop++; 
          else if (isHD) { 
            hd++; lop += 0.5; 
            if (isS) sunW += 0.5; else if (isH) holW += 0.5; else worked += 0.5;
          } 
          else if (status === 'leave') leave++;
          else if (isS) { if (isPresent) sunW++; }
          else if (isH) { if (isPresent) holW++; }
          else if (isPresent) worked++; 
          else if (!isS && !isH) lop++;

          if (r?.otHours) { const [h, mi] = r.otHours.split(':').map(Number); otH += (h || 0) + (mi || 0) / 60 }
        }
        const slab = increments?.filter(i => i.employeeId === emp.id && i.effectiveFrom <= summaryMonth).sort((a, b) => (b.effectiveFrom || '').localeCompare(a.effectiveFrom || ''))[0] || slabs[emp.id] || { totalSalary: 0, basicPercent: 40, hraPercent: 20 };
        const ts = Number(slab.totalSalary) || 0, paidDays = end - lop, dailyRate = ts / end, fullBasic = ts * (slab.basicPercent / 100), fullHra = ts * (slab.hraPercent / 100)
        const basic = fullBasic * (paidDays / end), hra = fullHra * (paidDays / end), sunPay = sunW * dailyRate, holPay = holW * dailyRate, otPay = (otH + (otAdjs[emp.id] || 0)) * (dailyRate / 8)
        const loanE = allLoans.filter(l => l.employeeId === emp.id).reduce((s, l) => s + calcEMI(l, summaryMonth), 0), adv = allAE.filter(a => a.employeeId === emp.id && a.type === 'Advance').reduce((s, a) => s + Number(a.amount), 0), reimb = allAE.filter(a => a.employeeId === emp.id && a.type === 'Expense' && a.hrApproval === 'Approved').reduce((s, a) => s + Number(a.amount), 0), fine = allFines.filter(f => f.employeeId === emp.id).reduce((s, f) => s + Number(f.amount), 0)
        const pf = ts * (slab.pfPercent || 0) / 100, esi = ts * (slab.esiPercent || 0) / 100
        const totalEarnings = basic + hra + sunPay + holPay + otPay + reimb, totalDeductions = pf + esi + loanE + adv + fine
        return { sno: idx + 1, id: emp.id, name: emp.name, empId: emp.empCode || emp.id.slice(0, 5), designation: emp.designation || '-', totalDays: end, worked, sunday: sunCount, holidays: holCount, sunW, holW, leave, hd, lop, paidDays, fullBasic, fullHra, basic, hra, sunPay, holPay, otPay, ot: otH, otAdjustment: otAdjs[emp.id] || 0, totalEarnings, pf, esi, loanE, fine, advanceAmount: adv, expenseAmount: reimb, totalDeductions, salary: { net: totalEarnings - totalDeductions } }
      })
    }, enabled: !!user?.orgId && sortedEmployees.length > 0 && activeTab === 'salary-summary'
  })

  const filteredAttendanceSummaryData = useMemo(() => summaryFilterEmpId ? attendanceSummaryData.filter(e => e.id === summaryFilterEmpId) : attendanceSummaryData, [attendanceSummaryData, summaryFilterEmpId])
  
  const dynamicNameWidth = useMemo(() => {
    if (!filteredAttendanceSummaryData.length) return 140;
    const maxChars = Math.max(...filteredAttendanceSummaryData.map(e => (e.name || '').length), 10);
    // Approx 7.5px per char for 10px bold text, plus padding
    return Math.min(Math.max(maxChars * 7.5 + 20, 120), 300);
  }, [filteredAttendanceSummaryData]);

  const visibleDetailedSummaryColumns = useMemo(() => 
    DETAILED_SUMMARY_COLUMNS.filter(c => selectedDetailedColumns.includes(c.id)).map(c => 
      c.id === 'name' ? { ...c, width: dynamicNameWidth } : c
    ), 
  [selectedDetailedColumns, dynamicNameWidth])
  
  const visibleGroups = useMemo(() => {
    const groups = [
      { id: 'basic', label: 'Basic Info', color: 'blue', columns: ['sno', 'empNo', 'name', 'designation'] },
      { id: 'structure', label: 'Structure (CTC)', color: 'purple', columns: ['basicCtc', 'hraCtc', 'salaryCtc'] },
      { id: 'attendance', label: 'Attendance', color: 'amber', columns: ['days', 'worked', 'sunWorked', 'holidayWorked', 'otH', 'hd', 'lop', 'paidDays'] },
      { id: 'earnings', label: 'Earnings (PAID)', color: 'emerald', columns: ['basicPaid', 'hraPaid', 'salaryPaid', 'sundayPay', 'holidayPay', 'otPay', 'earnings'] },
      { id: 'genDeductions', label: 'Deductions & Vouchers', color: 'red', columns: ['pf', 'esi', 'loan', 'ded', 'advance', 'reimb', 'netAdj'] },
      { id: 'summary', label: 'Payout Summary', color: 'green', columns: ['totalDed', 'net'] }
    ];
    return groups.map(g => ({ ...g, visibleCount: visibleDetailedSummaryColumns.filter(c => g.columns.includes(c.id)).length })).filter(g => g.visibleCount > 0);
  }, [visibleDetailedSummaryColumns]);

  const toggleDetailedSummaryColumn = (id) => {
    setSelectedDetailedColumns(prev => prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]);
  };

  const renderDetailedCell = (colId, emp) => {
    switch (colId) {
      case 'sno': return emp.sno;
      case 'empNo': return <span className="font-mono text-[10px]">{emp.empId}</span>;
      case 'name': return <span className="font-bold text-gray-900 uppercase">{emp.name}</span>;
      case 'designation': return emp.designation;
      case 'basicCtc': return Math.round(emp.fullBasic).toLocaleString('en-IN');
      case 'hraCtc': return Math.round(emp.fullHra).toLocaleString('en-IN');
      case 'salaryCtc': return Math.round(emp.fullBasic + emp.fullHra).toLocaleString('en-IN');
      case 'days': return emp.totalDays;
      case 'worked': return emp.worked;
      case 'sunWorked': return emp.sunW;
      case 'holidayWorked': return emp.holW;
      case 'otH': return (emp.ot + emp.otAdjustment).toFixed(2);
      case 'hd': return emp.hd;
      case 'lop': return emp.lop;
      case 'paidDays': return emp.paidDays;
      case 'basicPaid': return dashIfZero(emp.basic);
      case 'hraPaid': return dashIfZero(emp.hra);
      case 'salaryPaid': return dashIfZero(emp.basic + emp.hra);
      case 'sundayPay': return dashIfZero(emp.sunPay);
      case 'holidayPay': return dashIfZero(emp.holPay);
      case 'otPay': return dashIfZero(emp.otPay);
      case 'earnings': return Math.round(emp.totalEarnings).toLocaleString('en-IN');
      case 'pf': return dashIfZero(emp.pf);
      case 'esi': return dashIfZero(emp.esi);
      case 'loan': return dashIfZero(emp.loanE);
      case 'ded': return dashIfZero(emp.fine);
      case 'advance': return dashIfZero(emp.advanceAmount);
      case 'reimb': return dashIfZero(emp.expenseAmount);
      case 'netAdj': {
        const val = (emp.advanceAmount || 0) - (emp.expenseAmount || 0);
        if (val === 0) return '-';
        return <span className={val < 0 ? 'text-green-600 font-bold' : 'text-rose-600 font-bold'}>{Math.round(val).toLocaleString('en-IN')}</span>;
      }
      case 'totalDed': return Math.round(emp.totalDeductions).toLocaleString('en-IN');
      case 'net': return <span className="font-bold">{Math.round(emp.salary?.net || 0).toLocaleString('en-IN')}</span>;
      default: return '-';
    }
  }

  const getColumnColorClass = (colId, type = 'bg') => {
    const group = visibleGroups.find(g => g.columns.includes(colId));
    if (!group) return '';
    const color = group.color;
    if (type === 'bg') {
      if (color === 'blue') return 'bg-blue-50/50';
      if (color === 'purple') return 'bg-purple-50/50';
      if (color === 'amber') return 'bg-amber-50/50';
      if (color === 'emerald') return 'bg-green-100';
      if (color === 'red') return 'bg-red-50/50';
      if (color === 'green') return 'bg-green-600';
      return '';
    }
    if (type === 'border') {
      if (color === 'blue') return 'border-blue-100';
      if (color === 'purple') return 'border-purple-100';
      if (color === 'amber') return 'border-amber-100';
      if (color === 'emerald') return 'border-green-200';
      if (color === 'red') return 'border-red-100';
      return 'border-gray-200';
    }
    if (type === 'text') {
      if (color === 'green') return 'text-white';
      if (color === 'emerald') return 'text-black';
      if (color === 'red') return 'text-red-600';
      if (color === 'purple') return 'text-purple-700';
      return 'text-gray-900';
    }
    return '';
  }

  const isWorkedAttendanceRecord = (r) => {
    if (!r) return false;
    const status = String(r.status || '').toLowerCase();
    return (status === 'worked' || status === 'present' || r.checkIn) && !r.isAbsent;
  }
  const calcEMI = (l, m) => { if (l.status !== 'Active' || l.remainingAmount <= 0) return 0; return Math.min(l.emiAmount, l.remainingAmount) }

  const handleGenerate = async () => {
    if (!selectedEmp || !selectedMonth) return alert('Please select staff and month');
    setLoading(true); setSlipData(null); setAdvExpRows([])
    try {
      const emp = employees.find(e => e.id === selectedEmp);
      if (!emp) throw new Error('Staff data not found');
      const [y, m] = selectedMonth.split('-').map(Number), end = new Date(y, m, 0).getDate(), sd = `${selectedMonth}-01`, ed = `${selectedMonth}-${end}`
      const aDataSnap = await getDocs(query(collection(db, 'organisations', user.orgId, 'attendance'), where('employeeId', '==', selectedEmp)));
      const aData = aDataSnap.docs.map(d => d.data()).filter(a => a.date >= sd && a.date <= ed);
      const attByDate = new Map(aData.map(a => [a.date, a]))
      const slab = increments?.filter(i => i.employeeId === selectedEmp && i.effectiveFrom <= selectedMonth).sort((a, b) => (b.effectiveFrom || '').localeCompare(a.effectiveFrom || ''))[0] || slabs[selectedEmp] || { totalSalary: 0, basicPercent: 40, hraPercent: 20, pfPercent: 0, esiPercent: 0 }
      const ts = Number(slab.totalSalary) || 0
      const [aeSnap, loanSnap, fineSnap, otAdjSnap, orgSnap] = await Promise.all([
        getDocs(query(collection(db, 'organisations', user.orgId, 'advances_expenses'), where('employeeId', '==', selectedEmp))), 
        getDocs(query(collection(db, 'organisations', user.orgId, 'loans'), where('employeeId', '==', selectedEmp), where('status', '==', 'Active'))), 
        getDocs(query(collection(db, 'organisations', user.orgId, 'fines'), where('employeeId', '==', selectedEmp))), 
        getDoc(doc(db, 'organisations', user.orgId, 'otAdjustments', `${selectedMonth}_${selectedEmp}`)),
        getDoc(doc(db, 'organisations', user.orgId))
      ])
      const orgData = orgSnap.exists() ? orgSnap.data() : {}
      const holidayList = Array.isArray(orgData.holidays) ? orgData.holidays : []
      const holidayDates = new Set(holidayList.map(h => h.date).filter(Boolean))

      const allAE = aeSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(a => a.date >= sd && a.date <= ed)
      setAdvExpRows(allAE.map(a => ({ date: a.date, type: a.type, amount: Number(a.amount) })))
      const adv = allAE.filter(a => a.type === 'Advance').reduce((s, a) => s + Number(a.amount), 0), reimb = allAE.filter(a => a.type === 'Expense' && a.hrApproval === 'Approved').reduce((s, a) => s + Number(a.amount), 0)
      
      let paid = 0, lop = 0, aOT = 0, sun = 0, sunW = 0, hol = 0, holW = 0
      for (let i = 1; i <= end; i++) {
        const ds = `${selectedMonth}-${String(i).padStart(2, '0')}`, d = new Date(y, m - 1, i), isS = d.getDay() === 0, isH = holidayDates.has(ds) && !isS, r = attByDate.get(ds), status = String(r?.status || '').toLowerCase()
        if (isS) sun++
        if (isH) hol++
        if (emp.joinedDate && ds < emp.joinedDate) continue;

        if (status === 'absent' || r?.isAbsent) lop++; 
        else if (status === 'half-day' || r?.isHalfDay) { lop += 0.5; paid += 0.5 } 
        else if (status === 'leave') paid++;
        else if (isS) { if (r?.sundayWorked || status === 'sunworked' || isWorkedAttendanceRecord(r)) { sunW++; paid++ } }
        else if (isH) { if (r?.holidayWorked || status === 'worked' || isWorkedAttendanceRecord(r)) { holW++; paid++ } }
        else if (r && (status === 'worked' || status === 'present' || r.checkIn)) paid++; 
        else if (!isS && !isH) lop++;

        if (r?.otHours) { const [h, mi] = r.otHours.split(':').map(Number); aOT += (h || 0) + (mi || 0) / 60 }
      }

      const emi = loanSnap.docs.map(d => d.data()).reduce((s, l) => s + calcEMI(l, selectedMonth), 0), fineA = fineSnap.docs.map(d => d.data()).filter(f => f.date >= sd && f.date <= ed).reduce((s, f) => s + Number(f.amount), 0)
      const otAdj = otAdjSnap.exists() ? Number(otAdjSnap.data().adjustment) : 0, dailyRate = ts / end, otP = (aOT + otAdj) * (dailyRate / 8), fullBasic = ts * (slab.basicPercent / 100), fullHra = ts * (slab.hraPercent / 100)
      const b = fullBasic * (paid / end), h = fullHra * (paid / end), p = ts * (slab.pfPercent / 100), e = ts * (slab.esiPercent / 100)
      const holP = holW * dailyRate
      const gross = b + h + (sunW * dailyRate) + holP + otP + reimb, ded = p + e + emi + adv + fineA
      const workedDaysRegular = paid - sunW - holW; 

      setSlipData({ 
        employee: emp, month: selectedMonth, slab, 
        paidDays: paid, lopDays: lop, 
        otPay: otP, otHoursTotal: (aOT + otAdj),
        basic: b, hra: h, basicFull: fullBasic, hraFull: fullHra, 
        expenseReimbursement: reimb, 
        sundayPay: sunW * dailyRate, sundayWorkedCount: sunW,
        holidayPay: holP, holidayWorkedCount: holW, 
        grossEarnings: gross, pf: p, esi: e, advanceDeduction: adv, 
        loanEMI: emi, fineAmount: fineA, totalDeductions: ded, 
        netPay: Math.max(0, gross - ded), 
        sundayCount: sun, holidayCount: hol,
        totalMonthDays: end, workedDaysCount: workedDaysRegular
      })
      setGenerated(true)
  }

  const handleExportDetailedSummaryPdf = async () => { 
    if (!attendanceSummaryData.length) return; 
    setExportingDetailedPdf(true); 
    try { 
      const blob = await pdf(<DetailedSalarySummaryPDF 
        data={attendanceSummaryData} 
        month={summaryMonth} 
        orgName={user?.orgName} 
        visibleColumns={visibleDetailedSummaryColumns}
        visibleGroups={visibleGroups}
      />).toBlob(); 
      downloadPdfBlob(blob, `Summary_${summaryMonth}.pdf`); 
    } finally { 
      setExportingDetailedPdf(false); 
    } 
  }
  const handleExportSalarySlipPdf = async () => { if (!slipData) return; setExportingSlipPdf(true); try { const blob = await pdf(<SalarySlipPDF data={slipData} orgName={user?.orgName} orgLogo={orgLogo} />).toBlob(); downloadPdfBlob(blob, `Slip_${slipData.employee.name}.pdf`); } finally { setExportingSlipPdf(false); } }

  return (
    <div className="flex h-full bg-white font-roboto text-gray-900 overflow-hidden flex-col">
      <div className="bg-white border-b px-6 py-3 flex items-center justify-between shadow-sm shrink-0">
        <div className="flex items-center gap-2"><div className="text-[10px] font-normal uppercase text-slate-400 mr-4 tracking-widest">Payroll</div>
          <nav className="flex gap-1">{[{id:'salary-summary',i:<FileText size={16}/>,l:'Summary'},{id:'salary-slip',i:<Banknote size={16}/>,l:'Generator'},{id:'loan',i:<Wallet size={16}/>,l:'Loans'}].map(t=>(<button key={t.id} onClick={()=>setActiveTab(t.id)} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-normal transition-all ${activeTab===t.id?'text-blue-600 bg-transparent':'text-slate-500 hover:bg-zinc-100'}`}>{t.i}{t.l}</button>))}</nav>
        </div>
      </div>
      <div className="flex-1 p-6 overflow-hidden flex flex-col">
        {activeTab === 'salary-slip' && (
          <div className="max-w-6xl mx-auto w-full space-y-4 h-full flex flex-col overflow-hidden">
            <div className="flex gap-6 items-end shrink-0 mb-2 mt-1">
              <div className="flex-1 max-w-xs">
                <EmployeeSearchableDropdown employees={sortedEmployees} selectedId={selectedEmp} onSelect={setSelectedEmp} />
              </div>
              <div className="w-32">
                <input type="month" value={selectedMonth} onChange={e=>setSelectedMonth(e.target.value)} className="w-full h-7 border-b border-gray-200 text-sm font-normal focus:border-blue-600 outline-none bg-transparent"/>
              </div>
              <button onClick={handleGenerate} disabled={loading || !selectedEmp} className="h-7 px-6 bg-zinc-800 text-white rounded-sm text-xs font-normal uppercase tracking-widest hover:bg-green-600 active:scale-95 transition-all flex items-center gap-2">
                {generated && <CheckCircle2 size={12} />}
                {generated ? 'Advice Generated' : 'Generate Advice'}
              </button>
            </div>
            {slipData && (
              <div className="flex-1 overflow-hidden flex gap-4 animate-in fade-in slide-in-from-bottom-2">
                <div className="flex-1 min-w-0 bg-white rounded-[24px] overflow-hidden flex flex-col h-full print-area" style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}>
                  <div className="flex justify-end gap-2 p-3 no-print shrink-0"><button onClick={() => window.print()} className="h-7 bg-white border border-zinc-200 px-3 rounded-lg text-[10px] font-normal uppercase flex items-center gap-2 hover:bg-zinc-50"><Download size={12}/> Print</button><button onClick={handleExportSalarySlipPdf} disabled={exportingSlipPdf} className="h-7 bg-white border border-zinc-200 px-3 rounded-lg text-[10px] font-normal uppercase flex items-center gap-2 hover:bg-zinc-50"><Download size={12}/> PDF</button></div>
                  <div className="p-8 bg-white overflow-auto flex-1">
                    <div className="border-b border-zinc-200 pb-4 mb-6 flex justify-between items-start">
                      <div className="flex items-center gap-4">
                        {orgLogo && <img src={orgLogo} alt="Logo" className="w-12 h-12 object-contain" />}
                        <h1 className="text-2xl font-normal uppercase tracking-tight text-zinc-900">{user?.orgName}</h1>
                      </div>
                      <div className="text-right">
                        <h2 className="text-lg font-normal uppercase italic text-zinc-500">Salary Slip</h2>
                        <p className="text-[9px] font-normal text-zinc-600 bg-zinc-50 px-2 py-0.5 rounded border border-zinc-100 uppercase mt-1">{formatMonthDisplay(slipData.month)}</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-x-12 gap-y-1 mb-8">
                      {[{l:'Staff Name',v:slipData.employee?.name},{l:'Paid Days',v:slipData.paidDays},{l:'Designation',v:slipData.employee?.designation || '-'},{l:'Worked Holidays',v:slipData.holidayWorkedCount || 0},{l:'Net Payout',v:formatINR(slipData.netPay)}].map((r,i)=>(<div key={i} className="flex justify-between border-b border-zinc-100 py-1.5"><span className="text-[12px] font-normal text-slate-400 uppercase tracking-tight">{r.l}</span><span className="text-[12px] font-normal text-zinc-900 uppercase">{r.v}</span></div>))}
                    </div>
                    <div className="border border-zinc-100 rounded-[20px] overflow-hidden mb-6"><div className="grid grid-cols-2 bg-zinc-50 font-normal text-[9px] uppercase tracking-widest text-zinc-900 border-b border-zinc-100"><div className="p-3 border-r border-zinc-100"><span>Earnings (Credit)</span></div><div className="p-3"><span>Deductions (Debit)</span></div></div><div className="grid grid-cols-2 divide-x divide-zinc-100 bg-white"><div className="p-1 space-y-0.5"><div className="flex justify-between p-2.5 text-[11px] font-normal">Basic Salary<span>{formatINR(slipData.basic)}</span></div><div className="flex justify-between p-2.5 text-[11px] font-normal">HRA<span>{formatINR(slipData.hra)}</span></div><div className="flex justify-between p-2.5 text-[11px] font-normal">Sunday Worked<span>{formatINR(slipData.sundayPay)}</span></div><div className="flex justify-between p-2.5 text-[11px] font-normal">Holiday Pay<span>{formatINR(slipData.holidayPay)}</span></div></div><div className="p-1 space-y-0.5"><div className="flex justify-between p-2.5 text-[11px] font-normal">PF Contribution<span>{dashIfZero(slipData.pf)}</span></div><div className="flex justify-between p-2.5 text-[11px] font-normal">ESI Contribution<span>{dashIfZero(slipData.esi)}</span></div><div className="flex justify-between p-2.5 text-[11px] font-normal">Advance Recovery<span className="text-zinc-900">{dashIfZero(slipData.advanceDeduction)}</span></div></div></div></div>
                    <div className="text-center pt-4 border-t border-dashed border-zinc-200"><p className="text-[9px] font-normal text-slate-400 uppercase mb-2">Net Disbursement</p><div className="bg-zinc-50 border border-zinc-100 rounded-xl p-4 inline-block shadow-sm font-normal text-[18px] text-zinc-900">{formatINR(slipData.netPay)}</div></div>
                  </div>
                </div>
                <div className="w-[340px] shrink-0 bg-white border border-zinc-100 rounded-[24px] overflow-hidden flex flex-col h-full shadow-sm"><div className="p-4 bg-zinc-50 border-b border-zinc-100 font-normal uppercase text-[12px] tracking-widest">Monthly Vouchers</div><div className="p-3 overflow-auto flex-1"><table className="w-full text-left text-[10px]"><thead><tr className="text-slate-400 uppercase font-normal"><th className="pb-2 font-normal">Date</th><th className="pb-2 font-normal">Type</th><th className="pb-2 text-right font-normal">Amount</th></tr></thead><tbody className="divide-y divide-zinc-50">{advExpRows.length===0?(<tr><td colSpan={3} className="py-10 text-center text-slate-300 uppercase italic">No records found</td></tr>):(advExpRows.map((r,i)=>(<tr key={i} className="hover:bg-zinc-50"><td className="py-2.5">{formatDateDDMMYYYY(r.date)}</td><td className="py-2.5 uppercase font-normal text-zinc-600">{r.type}</td><td className="py-2.5 text-right font-normal text-zinc-900">{formatINR(r.amount)}</td></tr>)))}</tbody></table></div></div>
              </div>
            )}
          </div>
        )}
        {activeTab === 'salary-summary' && (
          <div className="flex-1 flex flex-col min-h-0">
            <div className="flex justify-between items-center py-2 border-b shrink-0 bg-white z-50">
              <div className="flex gap-2 items-center">
                <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                  {[{id:'overview',l:'Overview'},{id:'detailed',l:'Full Summary'}].map(t=>(<button key={t.id} onClick={()=>setSummarySubTab(t.id)} className={`px-3 py-1 text-[10px] font-black uppercase tracking-wider rounded-md transition-all ${summarySubTab===t.id?'bg-white text-indigo-600 shadow-sm border border-indigo-100':'text-slate-500 hover:text-slate-900'}`}>{t.l}</button>))}
                </div>
                <div className="flex items-center bg-gray-100 rounded-md p-1 border border-gray-200">
                  <button onClick={() => { const [y, m] = summaryMonth.split('-').map(Number); const d = new Date(y, m - 2, 1); setSummaryMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`) }} className="p-1 hover:bg-white hover:shadow-sm rounded transition-all text-gray-600"><ChevronLeft size={14} /></button>
                  <input type="month" value={summaryMonth} onChange={e=>setSummaryMonth(e.target.value)} className="h-6 bg-transparent border-0 text-[10px] font-black uppercase outline-none focus:ring-0 w-24 text-center cursor-pointer"/>
                  <button onClick={() => { const [y, m] = summaryMonth.split('-').map(Number); const d = new Date(y, m, 1); setSummaryMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`) }} className="p-1 hover:bg-white hover:shadow-sm rounded transition-all text-gray-600"><ChevronRight size={14} /></button>
                </div>
                {isAdmin && <button onClick={()=>setIsOtModalOpen(true)} className="h-7 px-3 bg-indigo-50 text-indigo-700 rounded-lg text-[10px] font-black uppercase tracking-[0.1em] shadow-sm hover:bg-indigo-600 hover:text-white active:scale-95 transition-all">OT Escalation</button>}
              </div>
              <div className="flex gap-2">
                {summarySubTab==='detailed' && (
                  <div className="flex items-center gap-1.5 relative">
                    <button onClick={handleExportDetailedSummaryPdf} disabled={exportingDetailedPdf} className="h-7 px-3 border border-indigo-100 bg-indigo-50 text-indigo-600 rounded-lg text-[9px] font-black uppercase tracking-widest shadow-sm hover:bg-indigo-100 active:scale-95 transition-all flex items-center gap-2">
                      {exportingDetailedPdf ? <RefreshCw size={10} className="animate-spin"/> : <Download size={10}/>}
                      <span>Download</span>
                    </button>
                    <button onClick={() => setShowDetailedColumnPicker(!showDetailedColumnPicker)} className="h-7 px-3 bg-slate-900 text-white rounded-lg text-[9px] font-black uppercase tracking-widest shadow-lg hover:bg-black transition-all">Columns</button>
                    
                    {showDetailedColumnPicker && (
                      <div ref={columnPickerRef} className="absolute right-0 top-full mt-2 z-[110] bg-white border border-slate-200 shadow-2xl p-4 w-80 max-h-[500px] overflow-auto rounded-[24px] animate-in fade-in slide-in-from-top-2 border-2 border-black">
                        <div className="pb-3 border-b-2 border-slate-100 mb-3 flex justify-between items-center"><span className="text-[11px] font-black text-slate-900 uppercase tracking-widest">Visibility Grid</span><button onClick={()=>setShowDetailedColumnPicker(false)} className="p-1 hover:bg-slate-100 rounded-full"><X size={16}/></button></div>
                        
                        <div className="flex gap-2 mb-4">
                          <button onClick={toggleAllColumns} className="flex-1 h-7 bg-slate-100 text-slate-600 rounded-lg text-[9px] font-black uppercase tracking-wider hover:bg-slate-200">Toggle All</button>
                          <button onClick={saveDetailedColumnDefaults} className="flex-1 h-7 bg-indigo-600 text-white rounded-lg text-[9px] font-black uppercase tracking-wider hover:bg-indigo-700 shadow-sm">Save Default</button>
                        </div>

                        <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
                          {DETAILED_SUMMARY_COLUMNS.map(c => (
                            <label key={c.id} className={`flex items-center gap-2 p-1 hover:bg-indigo-50 rounded-lg cursor-pointer transition-all ${c.mandatory?'opacity-40 grayscale pointer-events-none':''}`}>
                              <input type="checkbox" checked={selectedDetailedColumns.includes(c.id)} disabled={c.mandatory} onChange={() => toggleDetailedSummaryColumn(c.id)} className="w-3 h-3 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 shadow-sm"/>
                              <span className="text-[10px] font-normal text-slate-700 truncate">{c.label}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
            <div className="flex-1 overflow-auto bg-zinc-50/30">
              {summarySubTab==='overview' ? (
                <div className="h-full overflow-auto">
                <table className="w-full text-sm border-collapse bg-white border border-zinc-200">
                  <thead className="sticky top-0 z-40 shadow-sm font-raleway">
                    {/* Group Headers Row */}
                    <tr className="h-[40px] border-b border-zinc-200">
                      <th colSpan={2} className="px-4 text-left border-r border-zinc-200 font-black uppercase text-[10px] text-blue-900 tracking-widest bg-blue-100">Staff Profile</th>
                      <th colSpan={3} className="px-4 text-center border-r border-zinc-200 font-black uppercase text-[10px] text-orange-900 tracking-widest bg-orange-100">Period Status</th>
                      <th colSpan={2} className="px-4 text-center border-r border-zinc-200 font-black uppercase text-[10px] text-black tracking-widest bg-gray-500">Performance</th>
                      <th colSpan={2} className="px-4 text-center border-r border-zinc-200 font-black uppercase text-[10px] text-rose-900 tracking-widest bg-rose-100">Leave</th>
                      <th colSpan={1} className="px-4 text-center border-r border-zinc-200 font-black uppercase text-[10px] text-indigo-900 tracking-widest bg-indigo-100">Overtime</th>
                      <th colSpan={2} className="px-4 text-center border-r border-zinc-200 font-black uppercase text-[10px] text-emerald-900 tracking-widest bg-emerald-100">Holiday Worked</th>
                      <th colSpan={1} className="px-4 text-center font-black uppercase text-[10px] text-white tracking-widest bg-green-600">Summary</th>
                      <th className="w-12 bg-zinc-100"></th>
                    </tr>
                    {/* Primary Header Row */}
                    <tr className="bg-white text-[10px] uppercase font-bold text-zinc-500 tracking-tighter h-[35px] border-b-2 border-zinc-300">
                      <th className="px-3 text-center border-r border-zinc-200 w-10">#</th>
                      <th className="px-4 text-left border-r border-zinc-200">Employee Name</th>
                      <th className="px-2 text-center border-r border-zinc-200 w-24">Total Days</th>
                      <th className="px-2 text-center border-r border-zinc-200 w-20">Sunday</th>
                      <th className="px-2 text-center border-r border-zinc-200 w-20">Holiday</th>
                      <th className="px-2 text-center border-r border-zinc-200 w-24">Worked</th>
                      <th className="px-2 text-center border-r border-zinc-200 w-[50px] whitespace-pre-line">HALF{"\n"}DAY</th>
                      <th className="px-2 text-center border-r border-zinc-200 w-20">Leave</th>
                      <th className="px-2 text-center border-r border-zinc-200 w-20 text-rose-500">LOP</th>
                      <th className="px-2 text-center border-r border-zinc-200 w-24">OT (Hrs)</th>
                      <th className="px-2 text-center border-r border-zinc-100 w-24 font-bold text-emerald-600 bg-emerald-50/10">Sunday Wk</th>
                      <th className="px-2 text-center border-r border-zinc-200 w-24 font-bold text-emerald-600 bg-emerald-50/10">Holiday Wk</th>
                      <th className="px-2 text-center border-r border-zinc-200 w-28 bg-green-50/50 text-green-700 font-black">Total Pay Days</th>
                      <th className="w-12"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200">
                    {isAttendanceLoading ? (
                       <tr><td colSpan={14} className="py-20 text-center"><Spinner /></td></tr>
                    ) : filteredAttendanceSummaryData.map((e, idx)=>(
                      <tr key={e.id} className={`hover:bg-zinc-50/80 transition-colors h-[32px] group ${idx%2===0?'bg-white':'bg-zinc-50/30'}`}>
                        <td className="px-2 text-center border-r border-zinc-100 text-zinc-400 font-mono text-[10px]">{idx + 1}</td>
                        <td className="px-4 border-r border-zinc-200 font-black text-zinc-900 uppercase text-[11px] tracking-tight">{e.name}</td>
                        <td className="px-2 text-center border-r border-zinc-100 text-zinc-600 font-semibold">{e.totalDays}</td>
                        <td className="px-2 text-center border-r border-zinc-100 text-zinc-400">{e.sunday}</td>
                        <td className="px-2 text-center border-r border-zinc-100 text-zinc-400">{e.holidays}</td>
                        <td className="px-2 text-center border-r border-zinc-200 font-bold text-zinc-800">{e.worked}</td>
                        <td className="px-2 text-center border-r border-zinc-200 font-bold text-zinc-800">{e.hd}</td>
                        <td className="px-2 text-center border-r border-zinc-100 text-zinc-600">{e.leave}</td>
                        <td className="px-2 text-center border-r border-zinc-200 font-bold text-rose-600">{e.lop}</td>
                        <td className="px-2 text-center border-r border-zinc-200 font-inter font-normal text-[11px]">
                          {Number(e.ot || 0).toFixed(2)}
                          {e.otAdjustment !== 0 && (
                            <span className="text-emerald-600 ml-1 font-bold">({(Number(e.ot || 0) + Number(e.otAdjustment || 0)).toFixed(2)})</span>
                          )}
                        </td>
                        <td className="px-2 text-center border-r border-zinc-100 font-bold text-emerald-600 bg-emerald-50/5">{e.sunW}</td>
                        <td className="px-2 text-center border-r border-zinc-200 font-bold text-emerald-600 bg-emerald-50/5">{e.holW}</td>
                        <td className="px-2 text-center border-r border-zinc-200 font-black text-green-700 bg-green-50/20 text-[12px]">{e.paidDays}</td>
                        <td className="px-2 text-center">
                          <button onClick={()=>{setSelectedEmp(e.id);setActiveTab('salary-slip');handleGenerate();}} className="p-1 hover:bg-zinc-900 hover:text-white rounded transition-all text-zinc-400">
                            <ArrowRight size={14}/>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              ) : (
                <div className="min-w-max h-full overflow-auto relative">
                  <table className="w-full text-[10px] border-collapse detailed-summary-table bg-white">
                    <thead className="sticky top-0 z-40 font-raleway">
                      <tr className="h-[55px] border-b-2 border-gray-950">
                        {visibleGroups.map(g=>(
                          <th key={g.id} colSpan={g.visibleCount} className={`px-2 border-r-2 ${getColumnColorClass(g.columns[0], 'border')} text-center font-black uppercase tracking-[0.15em] text-[11px] ${
                            g.color === 'blue' ? 'bg-blue-100 text-blue-900' : 
                            g.color === 'purple' ? 'bg-purple-100 text-purple-900' : 
                            g.color === 'amber' ? 'bg-amber-100 text-amber-900' : 
                            g.color === 'emerald' ? 'bg-emerald-100 text-emerald-900' : 
                            g.color === 'red' ? 'bg-red-100 text-red-900' : 
                            g.color === 'green' ? 'bg-green-600 text-white' : 'bg-gray-100'
                          }`}>
                            {g.label}
                          </th>
                        ))}
                      </tr>
                      <tr className="h-10 bg-white border-b-2 border-gray-900 shadow-sm">
                        {visibleDetailedSummaryColumns.map(c=>(
                          <th key={c.id} style={{ width: c.width, minWidth: c.width }} className={`px-2 border-r-2 ${getColumnColorClass(c.id, 'border')} text-center font-bold text-[9px] uppercase tracking-[-0.05em] whitespace-pre-line ${c.id === 'net' ? 'bg-green-500 text-white border-green-700' : 'bg-white text-gray-500'}`}>
                            {c.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredAttendanceSummaryData.map((e, idx)=>(
                        <tr key={e.id} className={`border-b border-slate-200 h-[32px] transition-colors hover:bg-indigo-50/50 group`}>
                          {visibleDetailedSummaryColumns.map(c=>(
                            <td key={c.id} className={`px-2 border-r-2 ${getColumnColorClass(c.id, 'bg')} ${getColumnColorClass(c.id, 'border')} ${
                              ['sno', 'empNo', 'days', 'worked', 'sunWorked', 'holidayWorked', 'hd', 'lop', 'paidDays'].includes(c.id) ? 'text-center' : 
                              ['name', 'designation'].includes(c.id) ? 'text-left' : 'text-right'
                            } ${getColumnColorClass(c.id, 'text')} ${c.id === 'net' ? 'bg-green-600 text-white font-black text-[11px] shadow-inner' : (c.id === 'earnings' ? 'font-black' : 'font-medium')}`}>
                              {renderDetailedCell(c.id, e)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="sticky bottom-0 z-30 font-raleway shadow-[0_-4px_12px_rgba(0,0,0,0.1)]">
                      <tr className="bg-zinc-900 text-white font-black h-12">
                        <td colSpan={visibleDetailedSummaryColumns.length - 1} className="px-6 text-right uppercase tracking-[0.3em] text-[11px] border-r-2 border-zinc-800">Gross Organization Payout for {formatMonthDisplay(summaryMonth)}</td>
                        <td className="px-2 text-right bg-green-600 text-[15px] tabular-nums border-l-2 border-green-700 font-black">{formatSummaryCurrency(attendanceSummaryData.reduce((sum, e) => sum + (e.salary?.net || 0), 0))}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
        {activeTab === 'loan' && (
          <div className="flex-1 overflow-auto flex flex-col items-center justify-center p-20 bg-slate-50/50">
            <div className="w-20 h-20 bg-slate-100 rounded-3xl border-2 border-slate-200 flex items-center justify-center mb-6 shadow-inner"><Wallet size={40} className="text-slate-300" /></div>
            <p className="text-[13px] font-black uppercase tracking-[0.2em] text-slate-400 text-center max-w-sm leading-relaxed">Loan Configuration & Recovery Module under development...</p>
          </div>
        )}
      </div>
      <OTEscalationModal isOpen={isOtModalOpen} onClose={()=>setIsOtModalOpen(false)} month={summaryMonth} employees={attendanceSummaryData} initialAdjustments={attendanceSummaryData.reduce((acc, e) => { acc[e.id] = e.otAdjustment; return acc; }, {})} orgId={user?.orgId} />
    </div>
  )
}
