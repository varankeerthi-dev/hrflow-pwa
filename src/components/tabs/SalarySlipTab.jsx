import React, { useState, useEffect, useRef, useMemo } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { useEmployees } from '../../hooks/useEmployees'
import { useSalarySlab } from '../../hooks/useSalarySlab'
import { db } from '../../lib/firebase'
import { collection, query, where, getDocs, orderBy, limit, addDoc, serverTimestamp, setDoc, doc, getDoc, updateDoc, deleteDoc } from 'firebase/firestore'
import { formatINR, numberToWords } from '../../lib/salaryUtils'
import Spinner from '../ui/Spinner'
import { Wallet, Search, Download, Plus, Minus, History, Settings, AlertCircle, Info, X, CheckCircle2, Edit2, Trash2, Banknote, Clock, ChevronLeft, ChevronRight, FileText, Calendar as CalendarIcon, ChevronDown, ChevronUp, RefreshCw, ArrowUpRight, ArrowRight, Save, Table } from 'lucide-react'
import { Document, Page, Text, View, StyleSheet, PDFDownloadLink, Image, Font, pdf } from '@react-pdf/renderer'
import SummaryTab from './SummaryTab'
import { logActivity } from '../../hooks/useActivityLog'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useReactTable, getCoreRowModel, flexRender } from '@tanstack/react-table'
import { useSidebar } from '../../contexts/SidebarContext'
import JSZip from 'jszip'

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
  { id: 'sundays', label: 'Sunday', width: 45 },
  { id: 'sunWorked', label: 'Sunday worked', width: 45 },
  { id: 'holidayWorked', label: 'Holiday worked', width: 45 },
  { id: 'otH', label: 'OT hours', width: 45 },
  { id: 'hd', label: 'Half days', width: 45 },
  { id: 'lop', label: 'Leave', width: 45 },
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

const DetailedSalarySummaryPDF = ({ data, month, orgName, visibleColumns, visibleGroupsGroup }) => {
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
      case 'sundays': return row.sundays || 0;
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
            {visibleGroupsGroup.map(g => {
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
    <View style={{ border: '2pt solid #0f172a', padding: 20, flex: 1 }}>
      <View style={{ borderBottomWidth: 2, borderBottomColor: '#3b82f6', paddingBottom: 15, marginBottom: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <View style={{flexDirection:'row', alignItems:'center'}}>
          {orgLogo && <Image src={orgLogo} style={{width:40,height:40,marginRight:10}}/>}
          <View><Text style={{ fontSize: 20, fontWeight: 'bold', textTransform: 'uppercase', color: '#3b82f6', fontFamily: 'Helvetica' }}>{orgName}</Text><Text style={{fontSize:7, color:'#64748b', fontWeight: 'bold', marginTop:2}}>PAYROLL STATEMENT</Text></View>
        </View>
        <View style={{textAlign:'right'}}><Text style={{fontSize:12, fontWeight: 'bold', color:'#0f172a'}}>PAYSLIP</Text><Text style={{fontSize:8, color:'#64748b', marginTop:2}}>{formatMonthDisplay(data.month)}</Text></View>
      </View>
      <View style={{flexDirection:'row', justifyContent:'space-between', marginBottom:12}}>
        <View style={{flex: 1}}>
          <View style={{ flexDirection: 'row', marginBottom: 1 }}><Text style={{ color: '#1e293b', fontWeight: 'bold', fontSize: 9 }}>Staff Name : {data.employee?.name}</Text></View>
          <View style={{ flexDirection: 'row', marginBottom: 1 }}><Text style={{ color: '#1e293b', fontWeight: 'bold', fontSize: 9 }}>Employee ID : {data.employee?.empCode}</Text></View>
          <View style={{ flexDirection: 'row', marginBottom: 1 }}><Text style={{ color: '#1e293b', fontWeight: 'bold', fontSize: 9 }}>Designation : {data.employee?.designation || '-'}</Text></View>
          <View style={{ flexDirection: 'row', marginBottom: 1 }}><Text style={{ color: '#1e293b', fontWeight: 'bold', fontSize: 9 }}>DOJ : {formatDateDDMMYYYY(data.employee?.joinedDate)}</Text></View>
          <View style={{ flexDirection: 'row', marginBottom: 1 }}><Text style={{ color: '#1e293b', fontWeight: 'bold', fontSize: 9 }}>Total days : {data.totalMonthDays}</Text></View>
          <View style={{ flexDirection: 'row', marginBottom: 1 }}><Text style={{ color: '#1e293b', fontWeight: 'bold', fontSize: 9 }}>Net Payout : {formatINR(data.netPay)}</Text></View>
        </View>
        <View style={{flex: 1, marginLeft: 20}}>
          <View style={{ flexDirection: 'row', marginBottom: 1 }}><Text style={{ color: '#1e293b', fontWeight: 'bold', fontSize: 9 }}>Total worked days : {data.workedDaysCount}</Text></View>
          <View style={{ flexDirection: 'row', marginBottom: 1 }}><Text style={{ color: '#1e293b', fontWeight: 'bold', fontSize: 9 }}>Leave : {data.lopDays || 0}</Text></View>
          <View style={{ flexDirection: 'row', marginBottom: 1 }}><Text style={{ color: '#1e293b', fontWeight: 'bold', fontSize: 9 }}>No. of Holidays : {data.holidayCount || 0}</Text></View>
          <View style={{ flexDirection: 'row', marginBottom: 1 }}><Text style={{ color: '#1e293b', fontWeight: 'bold', fontSize: 9 }}>Sunday Worked : {data.sundayWorkedCount || 0}</Text></View>
          <View style={{ flexDirection: 'row', marginBottom: 1 }}><Text style={{ color: '#1e293b', fontWeight: 'bold', fontSize: 9 }}>Holiday Worked : {data.holidayWorkedCount || 0}</Text></View>
          <View style={{ flexDirection: 'row', marginBottom: 1 }}><Text style={{ color: '#1e293b', fontWeight: 'bold', fontSize: 9 }}>Total Pay days : {data.paidDays}</Text></View>
          <View style={{ flexDirection: 'row', marginBottom: 1 }}><Text style={{ color: '#1e293b', fontWeight: 'bold', fontSize: 9 }}>OT hours : {Number(data.otHoursTotal || 0).toFixed(2)}</Text></View>
        </View>
      </View>
      <View style={{borderWidth:1, borderColor:'#0f172a', borderRadius:4, overflow:'hidden'}}>
        <View style={{flexDirection:'row'}}>
          <View style={{flex:5, backgroundColor:'#dcfce7', color:'#166534', paddingVertical:6, paddingHorizontal:8, borderRightWidth:1, borderColor:'#0f172a', flexDirection:'row', justifyContent:'space-between'}}><Text style={{fontSize:8, fontWeight:'bold'}}>EARNINGS (CREDIT)</Text><Text style={{fontSize:8, fontWeight:'bold'}}>AMOUNT</Text></View>
          <View style={{flex:4, backgroundColor:'#fee2e2', color:'#991b1b', paddingVertical:6, paddingHorizontal:8, borderRightWidth:1, borderColor:'#0f172a', flexDirection:'row', justifyContent:'space-between'}}><Text style={{fontSize:8, fontWeight:'bold'}}>DEDUCTIONS (DEBIT)</Text><Text style={{fontSize:8, fontWeight:'bold'}}>AMOUNT</Text></View>
          <View style={{flex:3, backgroundColor:'#f0fdf4', color:'#475569', paddingVertical:6, paddingHorizontal:8, flexDirection:'row', justifyContent:'space-between'}}><Text style={{fontSize:8, fontWeight:'bold'}}>ADVANCE/EXPENSE</Text><Text style={{fontSize:8, fontWeight:'bold'}}>AMOUNT</Text></View>
        </View>
        <View style={{flexDirection:'row'}}>
          <View style={{flex:5, borderRightWidth:1, borderColor:'#e2e8f0'}}>
            <View style={{flexDirection:'row', justifyContent:'space-between', paddingVertical:4, paddingHorizontal:8, borderBottomWidth:1, borderColor:'#f1f5f9'}}><Text style={{fontWeight:'bold'}}>Basic Salary</Text><Text>{formatINR(data.basic)}</Text></View>
            <View style={{flexDirection:'row', justifyContent:'space-between', paddingVertical:4, paddingHorizontal:8, borderBottomWidth:1, borderColor:'#f1f5f9'}}><Text style={{fontWeight:'bold'}}>HRA</Text><Text>{formatINR(data.hra)}</Text></View>
            <View style={{flexDirection:'row', justifyContent:'space-between', paddingVertical:4, paddingHorizontal:8, borderBottomWidth:1, borderColor:'#f1f5f9'}}><Text style={{fontWeight:'bold'}}>Sunday Worked</Text><Text>{formatINR(data.sundayPay)}</Text></View>
            <View style={{flexDirection:'row', justifyContent:'space-between', paddingVertical:4, paddingHorizontal:8, borderBottomWidth:1, borderColor:'#f1f5f9'}}><Text style={{fontWeight:'bold'}}>Holiday Pay</Text><Text>{formatINR(data.holidayPay)}</Text></View>
            <View style={{flexDirection:'row', justifyContent:'space-between', paddingVertical:4, paddingHorizontal:8, borderBottomWidth:1, borderColor:'#f1f5f9'}}><Text style={{fontWeight:'bold'}}>OT Pay</Text><Text>{formatINR(data.otPay)}</Text></View>
            {data.food > 0 && <View style={{flexDirection:'row', justifyContent:'space-between', paddingVertical:4, paddingHorizontal:8, borderBottomWidth:1, borderColor:'#f1f5f9'}}><Text style={{fontWeight:'bold'}}>Food Allowance</Text><Text>{formatINR(data.food)}</Text></View>}
            {data.convenience > 0 && <View style={{flexDirection:'row', justifyContent:'space-between', paddingVertical:4, paddingHorizontal:8, borderBottomWidth:1, borderColor:'#f1f5f9'}}><Text style={{fontWeight:'bold'}}>Convenience</Text><Text>{formatINR(data.convenience)}</Text></View>}
            {data.bonus > 0 && <View style={{flexDirection:'row', justifyContent:'space-between', paddingVertical:4, paddingHorizontal:8, borderBottomWidth:1, borderColor:'#f1f5f9'}}><Text style={{fontWeight:'bold'}}>Bonus</Text><Text>{formatINR(data.bonus)}</Text></View>}
          </View>
          <View style={{flex:4, borderRightWidth:1, borderColor:'#e2e8f0'}}>
            <View style={{flexDirection:'row', justifyContent:'space-between', paddingVertical:4, paddingHorizontal:8, borderBottomWidth:1, borderColor:'#f1f5f9'}}><Text style={{fontWeight:'bold'}}>PF</Text><Text>{dashIfZero(data.pf)}</Text></View>
            <View style={{flexDirection:'row', justifyContent:'space-between', paddingVertical:4, paddingHorizontal:8, borderBottomWidth:1, borderColor:'#f1f5f9'}}><Text style={{fontWeight:'bold'}}>ESI</Text><Text>{dashIfZero(data.esi || 0)}</Text></View>
            <View style={{flexDirection:'row', justifyContent:'space-between', paddingVertical:4, paddingHorizontal:8, borderBottomWidth:1, borderColor:'#f1f5f9'}}><Text style={{fontWeight:'bold'}}>Loan Recovery</Text><Text>{dashIfZero(data.loanEMI)}</Text></View>
            <View style={{flexDirection:'row', justifyContent:'space-between', paddingVertical:4, paddingHorizontal:8, borderBottomWidth:1, borderColor:'#f1f5f9'}}><Text style={{fontWeight:'bold'}}>Fine / Penalties</Text><Text>{dashIfZero(data.fineAmount)}</Text></View>
          </View>
          <View style={{flex:3, backgroundColor:'#fafafa'}}>
            <View style={{flexDirection:'row', justifyContent:'space-between', paddingVertical:3, paddingHorizontal:8, borderBottomWidth:1, borderColor:'#e2e8f0'}}>
              <Text style={{fontSize:7, fontWeight:'bold', color:'#065f46'}}>Expense</Text>
              <Text style={{fontSize:7, fontWeight:'bold', color:'#065f46'}}>{formatINR(data.expenseReimbursement)}</Text>
            </View>
            <View style={{flexDirection:'row', justifyContent:'space-between', paddingVertical:3, paddingHorizontal:8, borderBottomWidth:1, borderColor:'#e2e8f0'}}>
              <Text style={{fontSize:7, fontWeight:'bold', color:'#991b1b'}}>Advance</Text>
              <Text style={{fontSize:7, fontWeight:'bold', color:'#991b1b'}}>{formatINR(data.advanceDeduction)}</Text>
            </View>
          </View>
        </View>
        <View style={{flexDirection:'row', borderTopWidth:1, borderColor:'#0f172a'}}>
          <View style={{flex:5, flexDirection:'row', justifyContent:'space-between', paddingVertical:6, paddingHorizontal:8, borderRightWidth:1, borderColor:'#e2e8f0', backgroundColor:'#f0fdf4'}}>
            <Text style={{fontSize:8, fontWeight:'bold', color:'#166534'}}>TOTAL EARNINGS</Text>
            <Text style={{fontSize:8, fontWeight:'bold', color:'#166534'}}>{formatINR((data.basic || 0) + (data.hra || 0) + (data.sundayPay || 0) + (data.holidayPay || 0) + (data.otPay || 0) + (data.food || 0) + (data.convenience || 0) + (data.bonus || 0))}</Text>
          </View>
          <View style={{flex:4, flexDirection:'row', justifyContent:'space-between', paddingVertical:6, paddingHorizontal:8, borderRightWidth:1, borderColor:'#e2e8f0', backgroundColor:'#fef2f2'}}>
            <Text style={{fontSize:8, fontWeight:'bold', color:'#991b1b'}}>TOTAL DEDUCTIONS</Text>
            <Text style={{fontSize:8, fontWeight:'bold', color:'#991b1b'}}>{formatINR((data.pf || 0) + (data.esi || 0) + (data.loanEMI || 0) + (data.fineAmount || 0))}</Text>
          </View>
          <View style={{flex:3, flexDirection:'row', justifyContent:'space-between', paddingVertical:6, paddingHorizontal:8, backgroundColor:'#f3f4f6'}}>
            <Text style={{fontSize:8, fontWeight:'bold', color:'#475569'}}>NET</Text>
            <Text style={{fontSize:8, fontWeight:'bold', color:'#475569'}}>{formatINR((data.advanceDeduction || 0) - (data.expenseReimbursement || 0))}</Text>
          </View>
        </View>
        <View style={{flexDirection:'row', borderTopWidth:1, borderColor:'#0f172a'}}>
          <View style={{flex:1, flexDirection:'row', justifyContent:'space-between', padding:8, borderRightWidth:1, borderColor:'#0f172a', backgroundColor:'#f0fdf4'}}>
            <Text style={{fontWeight:'bold', color:'#166534'}}>GROSS PAY</Text>
            <Text style={{fontWeight:'bold', color:'#166534'}}>{formatINR(data.grossEarnings)}</Text>
          </View>
          <View style={{flex:1, flexDirection:'row', justifyContent:'space-between', padding:8, backgroundColor:'#fef2f2'}}>
            <Text style={{fontWeight:'bold', color:'#991b1b'}}>TOTAL DED.</Text>
            <Text style={{fontWeight:'bold', color:'#991b1b'}}>{formatINR(data.totalDeductions)}</Text>
          </View>
        </View>
      </View>
      <View style={{textAlign:'center', marginTop:20, borderTopWidth:1, borderColor:'#e2e8f0', borderStyle:'dashed', paddingTop:10}}>
        <Text style={{fontSize:16, fontWeight:'bold'}}>{formatINR(data.netPay)}</Text>
        <Text style={{fontSize:8, color:'#64748b', marginTop:4, textTransform:'uppercase', fontStyle:'italic'}}>Indian Rupee {numberToWords(data.netPay)} Only</Text>
      </View>
    </View>
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
    <div className="px-6 py-4 border-b flex justify-between items-center"><div><h2 className="text-base font-normal">OT Escalation</h2><p className="text-[11px] text-slate-500">{formatMonthDisplay(month)}</p></div><button onClick={onClose}><X size={18} /></button></div><div className="flex-1 overflow-auto p-6"><table className="w-full text-sm"><thead><tr className="text-[10px] uppercase text-slate-400 border-b"><th className="pb-2 text-left font-normal">Employee</th><th className="pb-2 text-center font-normal">Actual</th><th className="pb-2 text-center font-normal">Adjustment</th><th className="pb-2 text-right font-normal">Final</th></tr></thead><tbody className="divide-y">{employees.map(emp => (<tr key={emp.id} className="h-14 hover:bg-slate-50"><td><p className="font-normal">{emp.name}</p></td><td className="text-center font-normal">{Number(emp.ot || 0).toFixed(2)}</td><td className="text-center flex items-center justify-center gap-2 py-2"><button onClick={()=>handleAdjust(emp.id, -1)} className="h-5 w-5 flex items-center justify-center border rounded hover:bg-slate-100 transition-colors"><Minus size={10}/></button><input type="number" step="0.5" className="w-12 text-center font-normal border-0 focus:ring-0" value={adjustments[emp.id] || 0} onChange={e => setAdjustments({...adjustments, [emp.id]: e.target.value})}/><button onClick={()=>handleAdjust(emp.id, 1)} className="h-5 w-5 flex items-center justify-center border rounded hover:bg-slate-100 transition-colors"><Plus size={10}/></button></td><td className="text-right font-normal">{(Number(emp.ot || 0) + (Number(adjustments[emp.id]) || 0)).toFixed(2)}</td></tr>))}</tbody></table></div><div className="p-4 border-t bg-slate-50 flex justify-end gap-3"><button onClick={onClose} className="px-4 py-2 text-xs font-normal">Cancel</button><button onClick={() => saveMutation.mutate(adjustments)} disabled={saveMutation.isPending || showSuccess} className="px-6 py-2 bg-indigo-600 text-white rounded-lg text-xs font-normal shadow-md flex items-center gap-2">
      {saveMutation.isPending ? <RefreshCw size={14} className="animate-spin" /> : null}
      {saveMutation.isPending ? 'Saving...' : 'Save Changes'}
    </button></div></div></div>)
}

const EmployeeSearchableDropdown = ({ employees, selectedId, onSelect }) => {
  const [searchTerm, setSearchTerm] = useState(''); const [isOpen, setIsOpen] = useState(false); const dropdownRef = useRef(null);
  const filtered = useMemo(() => employees.filter(e => e.name.toLowerCase().includes(searchTerm.toLowerCase())), [employees, searchTerm]);
  useEffect(() => { const handleClickOutside = (e) => { if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setIsOpen(false); }; document.addEventListener('mousedown', handleClickOutside); return () => document.removeEventListener('mousedown', handleClickOutside); }, []);
  return (<div className="relative w-full" ref={dropdownRef}><div className="w-full h-7 border border-zinc-200 rounded-sm px-2 flex items-center justify-between bg-zinc-50 cursor-pointer" onClick={() => setIsOpen(!isOpen)}><span className="text-[11px] font-semibold text-zinc-900 capitalize">{employees.find(e => e.id === selectedId)?.name?.toLowerCase() || 'Search staff...'}</span><ChevronDown size={10} className="text-zinc-400" /></div>{isOpen && (<div className="absolute top-full left-0 right-0 mt-1 bg-white border border-zinc-200 rounded-lg shadow-2xl z-[100] p-2 animate-in fade-in zoom-in-95 duration-150"><input autoFocus type="text" className="w-full h-8 border border-zinc-100 rounded-md px-2 text-[11px] mb-1 focus:outline-none focus:ring-1 focus:ring-zinc-200" placeholder="Type name..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} /><div className="max-h-60 overflow-auto">{filtered.map(e => (<button key={e.id} className="w-full text-left px-3 py-1.5 text-[11px] hover:bg-zinc-50 rounded-md capitalize font-medium text-zinc-700" onClick={() => { onSelect(e.id); setIsOpen(false); }}>{e.name.toLowerCase()}</button>))}</div></div>)}</div>)
}

// --- MAIN COMPONENT ---

export default function SalarySlipTab() {
  const { user } = useAuth(); const { employees } = useEmployees(user?.orgId, true); const { slabs, increments } = useSalarySlab(user?.orgId);
  const { isCollapsed, setIsCollapsed, setIsAutoCollapsed, isAutoCollapsed } = useSidebar();
  const queryClient = useQueryClient();
  const isAdmin = user?.role?.toLowerCase() === 'admin'
  const [activeTab, setActiveTab] = useState('salary-summary')
  const [selectedEmp, setSelectedEmp] = useState('')
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  })
  const [summaryMonth, setSummaryMonth] = useState(selectedMonth)
  
  useEffect(() => {
    setSummaryMonth(selectedMonth);
    if (selectedEmp) {
      handleGenerate();
    }
  }, [selectedMonth]);

  const [summarySubTab, setSummarySubTab] = useState('overview')
  const [summaryFilterEmpId, setSummaryFilterEmpId] = useState('')
  const [loading, setLoading] = useState(false)
  const [generated, setGenerated] = useState(false)
  const [slipData, setSlipData] = useState(null)
  const [isOtModalOpen, setIsOtModalOpen] = useState(false)
  const [variablePayData, setVariablePayData] = useState({})
  const [variableEntryDate, setVariableEntryDate] = useState(() => new Date().toISOString().split('T')[0])
  const [paymentDetails, setPaymentDetails] = useState({})
  const [downloadAllLoading, setDownloadAllLoading] = useState(false)
  const [exportingSlipPdf, setExportingSlipPdf] = useState(false)
  const [exportingDetailedPdf, setExportingDetailedPdf] = useState(false)
  const [orgLogo, setOrgLogo] = useState('')
  const [employeeRowOrder, setEmployeeRowOrder] = useState([])
  const [selectedDetailedColumns, setSelectedDetailedColumns] = useState(() => DETAILED_SUMMARY_COLUMNS.map(c => c.id))
  const [showDetailedColumnPicker, setShowDetailedColumnPicker] = useState(false)
  const columnPickerRef = useRef(null)
  const [advExpRows, setAdvExpRows] = useState([])
  const [paySummaryDates, setPaySummaryDates] = useState({ sundays: [], holidays: [], leaves: [] })

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

  const toggleDetailedSummaryColumn = (id) => {
    setSelectedDetailedColumns(prev => prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]);
  };

  // Query for daily variable pay entries (for the specific entry date)
  const { data: dailyVariables, isLoading: isDailyVarsLoading } = useQuery({
    queryKey: ['dailyVariablePay', user?.orgId, variableEntryDate],
    queryFn: async () => {
      const q = query(collection(db, 'organisations', user.orgId, 'variablePayLogs'), where('date', '==', variableEntryDate));
      const snap = await getDocs(q);
      const data = {};
      snap.docs.forEach(d => {
        data[d.data().employeeId] = d.data();
      });
      return data;
    },
    enabled: !!user?.orgId && summarySubTab === 'variable'
  });

  useEffect(() => {
    if (dailyVariables) {
      setVariablePayData(dailyVariables);
    } else {
      setVariablePayData({});
    }
  }, [dailyVariables]);

  // Query for monthly variable pay sums (for the salary calculations)
  const { data: monthlyVariableSums } = useQuery({
    queryKey: ['monthlyVariableSums', user?.orgId, summaryMonth],
    queryFn: async () => {
      const q = query(collection(db, 'organisations', user.orgId, 'variablePayLogs'), where('month', '==', summaryMonth));
      const snap = await getDocs(q);
      const sums = {};
      snap.docs.forEach(d => {
        const row = d.data();
        if (!sums[row.employeeId]) sums[row.employeeId] = { food: 0, convenience: 0, bonus: 0 };
        sums[row.employeeId].food += Number(row.food || 0);
        sums[row.employeeId].convenience += Number(row.convenience || 0);
        sums[row.employeeId].bonus += Number(row.bonus || 0);
      });
      return sums;
    },
    enabled: !!user?.orgId
  });

  const saveVariablesMutation = useMutation({
    mutationFn: async (data) => {
      const batch = [];
      const currentMonth = variableEntryDate.substring(0, 7); // YYYY-MM
      for (const [empId, values] of Object.entries(data)) {
        const docId = `${variableEntryDate}_${empId}`;
        batch.push(setDoc(doc(db, 'organisations', user.orgId, 'variablePayLogs', docId), {
          employeeId: empId,
          date: variableEntryDate,
          month: currentMonth,
          food: Number(values.food || 0),
          convenience: Number(values.convenience || 0),
          bonus: Number(values.bonus || 0),
          updatedAt: serverTimestamp(),
          updatedBy: user.uid
        }, { merge: true }));
      }
      await Promise.all(batch);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['dailyVariablePay']);
      queryClient.invalidateQueries(['monthlyVariableSums']);
      queryClient.invalidateQueries(['attendanceSummary']);
      alert('Variable pay logs saved successfully!');
    },
    onError: (err) => alert('Failed to save logs: ' + err.message)
  });

  const handleVariableChange = (empId, field, value) => {
    setVariablePayData(prev => ({
      ...prev,
      [empId]: {
        ...prev[empId],
        [field]: value
      }
    }));
  };

  const { data: salaryPayments = {}, isLoading: isPaymentsLoading } = useQuery({
    queryKey: ['salaryPayments', user?.orgId, summaryMonth],
    queryFn: async () => {
      const q = query(collection(db, 'organisations', user.orgId, 'salaryPayments'), where('month', '==', summaryMonth));
      const snap = await getDocs(q);
      const data = {};
      snap.docs.forEach(d => {
        data[d.data().employeeId] = d.data();
      });
      return data;
    },
    enabled: !!user?.orgId && (summarySubTab === 'payment' || summarySubTab === 'overview')
  });

  useEffect(() => {
    if (salaryPayments) {
      setPaymentDetails(salaryPayments);
    }
  }, [salaryPayments]);

  const savePaymentsMutation = useMutation({
    mutationFn: async (data) => {
      const batch = [];
      for (const [empId, values] of Object.entries(data)) {
        const docId = `${summaryMonth}_${empId}`;
        batch.push(setDoc(doc(db, 'organisations', user.orgId, 'salaryPayments', docId), {
          employeeId: empId,
          month: summaryMonth,
          paidAmount: Number(values.paidAmount || 0),
          paymentDate: values.paymentDate || '',
          paymentMode: values.paymentMode || 'Bank Transfer',
          updatedAt: serverTimestamp(),
          updatedBy: user.uid
        }, { merge: true }));
      }
      await Promise.all(batch);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['salaryPayments']);
      alert('Payment details saved successfully!');
    },
    onError: (err) => alert('Failed to save payments: ' + err.message)
  });

  const handlePaymentChange = (empId, field, value) => {
    setPaymentDetails(prev => ({
      ...prev,
      [empId]: {
        ...prev[empId],
        [field]: value
      }
    }));
  };

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
      const [aSnap, loanSnap, aeSnap, fineSnap, otAdjSnap, orgSnap, sandwichSnap, varSnap] = await Promise.all([
        getDocs(collection(db, 'organisations', user.orgId, 'attendance')), 
        getDocs(query(collection(db, 'organisations', user.orgId, 'loans'), where('status', '==', 'Active'))), 
        getDocs(collection(db, 'organisations', user.orgId, 'advances_expenses')), 
        getDocs(collection(db, 'organisations', user.orgId, 'fines')), 
        getDocs(query(collection(db, 'organisations', user.orgId, 'otAdjustments'), where('month', '==', summaryMonth))),
        getDoc(doc(db, 'organisations', user.orgId)),
        getDocs(query(collection(db, 'organisations', user.orgId, 'sandwichDeductions'), where('month', '==', summaryMonth))),
        getDocs(query(collection(db, 'organisations', user.orgId, 'variablePayLogs'), where('month', '==', summaryMonth)))
      ])
      const orgData = orgSnap.exists() ? orgSnap.data() : {}
      const holidayList = Array.isArray(orgData.holidays) ? orgData.holidays : []
      const holidayDates = new Set(holidayList.map(h => h.date).filter(Boolean))
      const saturdayType = orgData.saturdayType || 'working'; // 'working' | 'holiday1x' | 'holiday2x' | 'alternative'
      const isSaturdayHoliday = saturdayType !== 'working';
      
      const appliedSandwiches = sandwichSnap.docs.map(d => d.data());
      
      // Aggregate variable pay logs for the month
      const allVariables = {};
      varSnap.docs.forEach(d => {
        const row = d.data();
        if (!allVariables[row.employeeId]) allVariables[row.employeeId] = { food: 0, convenience: 0, bonus: 0 };
        allVariables[row.employeeId].food += Number(row.food || 0);
        allVariables[row.employeeId].convenience += Number(row.convenience || 0);
        allVariables[row.employeeId].bonus += Number(row.bonus || 0);
      });

      const allAtt = aSnap.docs.map(d => d.data()).filter(a => a.date >= sd && a.date <= ed), allLoans = loanSnap.docs.map(d => d.data()), allAE = aeSnap.docs.map(d => d.data()).filter(a => a.date >= sd && a.date <= ed), allFines = fineSnap.docs.map(d => d.data()).filter(f => f.date >= sd && f.date <= ed), otAdjs = otAdjSnap.docs.reduce((acc, d) => { acc[d.data().employeeId] = d.data().adjustment; return acc; }, {})
      
      return sortedEmployees.map((emp, idx) => {
        const normalizeDate = (dateStr) => {
          if (!dateStr || dateStr === '-') return null;
          const parts = dateStr.split(/[-/]/);
          if (parts.length === 3) {
            if (parts[0].length === 4) return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
            return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
          }
          return dateStr;
        };

        const empAtt = allAtt.filter(a => a.employeeId === emp.id);
        const attByDate = new Map(empAtt.map(a => [normalizeDate(a.date), a]));
        
        let worked = 0, sunW = 0, holW = 0, leave = 0, lop = 0, hd = 0, otH = 0, sunCount = 0, holCount = 0
        const potentialSandwichDays = [];
        const appliedForThisEmp = appliedSandwiches.filter(s => s.employeeId === emp.id);

        const normalizedJoined = normalizeDate(emp.joinedDate)
        const normalizedInactive = normalizeDate(emp.inactiveFrom)

        const isDateAHoliday = (dateObj) => {
          const ds = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}`;
          const day = dateObj.getDay(); // 0: Sun, 6: Sat
          if (day === 0) return true;
          if (day === 6 && isSaturdayHoliday) return true;
          if (holidayDates.has(ds)) return true;
          return false;
        };

        for (let i = 1; i <= end; i++) {
          const dateStr = `${summaryMonth}-${String(i).padStart(2, '0')}`, d = new Date(y, m - 1, i), isS = d.getDay() === 0, isSat = d.getDay() === 6, isH = holidayDates.has(dateStr) && !isS, r = attByDate.get(dateStr), status = String(r?.status || '').toLowerCase()
          
          if (normalizedJoined && dateStr < normalizedJoined) {
            lop++;
            continue;
          }
          if (normalizedInactive && dateStr > normalizedInactive) {
            lop++;
            continue;
          }
          
          if (isS) sunCount++
          if (isH) holCount++

          // Sandwich Detection
          // Skip if employee is marked as hidden (MD/Partner)
          if (!emp.hideInAttendance && (isS || isH || (isSat && isSaturdayHoliday)) && !isWorkedAttendanceRecord(r)) {
            // Find last working day before
            let prevWorkingDay = new Date(y, m - 1, i - 1);
            while (prevWorkingDay.getDate() > 0 && isDateAHoliday(prevWorkingDay)) {
              prevWorkingDay.setDate(prevWorkingDay.getDate() - 1);
            }
            
            // Find next working day after
            let nextWorkingDay = new Date(y, m - 1, i + 1);
            while (nextWorkingDay.getDate() <= end && isDateAHoliday(nextWorkingDay)) {
              nextWorkingDay.setDate(nextWorkingDay.getDate() + 1);
            }

            const prevDS = `${prevWorkingDay.getFullYear()}-${String(prevWorkingDay.getMonth()+1).padStart(2, '0')}-${String(prevWorkingDay.getDate()).padStart(2, '0')}`;
            const nextDS = `${nextWorkingDay.getFullYear()}-${String(nextWorkingDay.getMonth()+1).padStart(2, '0')}-${String(nextWorkingDay.getDate()).padStart(2, '0')}`;
            
            const rPrev = attByDate.get(prevDS);
            const rNext = attByDate.get(nextDS);
            
            // If they are absent on both the previous actual working day AND the next actual working day
            const isPrevAbsent = (!rPrev || rPrev.status?.toLowerCase() === 'absent' || rPrev.isAbsent);
            const isNextAbsent = (!rNext || rNext.status?.toLowerCase() === 'absent' || rNext.isAbsent);

            if (isPrevAbsent && isNextAbsent) {
              const typeLabel = isS ? 'Sunday' : (isSat ? 'Saturday' : 'Holiday');
              potentialSandwichDays.push({ date: dateStr, type: typeLabel });
              // If already applied, add to LOP
              if (appliedForThisEmp.some(s => s.date === dateStr)) {
                lop++;
                continue;
              }
            }
          }
          
          const isPresent = isWorkedAttendanceRecord(r) || r?.sundayWorked || r?.holidayWorked || status === 'sunworked'
          const isHD = status === 'half-day' || r?.isHalfDay

          if (status === 'absent' || r?.isAbsent || status === 'leave') lop++; 
          else if (isHD) { 
            hd++; lop += 0.5; 
            if (isS) sunW += 0.5; else if (isH) holW += 0.5; else worked += 0.5;
          } 
          else if (isS) { if (isPresent) sunW++; }
          else if (isH) { if (isPresent) holW++; }
          else if (isPresent) worked++; 
          else if (!isS && !isH) lop++;

          if (r?.otHours) { 
            const [h, mi] = r.otHours.split(':').map(Number); 
            const totalMins = (h || 0) * 60 + (mi || 0);
            const roundedMins = Math.ceil(totalMins / 5) * 5;
            otH += roundedMins / 60;
          }
        }
        // Calculate sandwich Sundays count
        const sandwichSundays = appliedForThisEmp.filter(s => {
          const date = new Date(s.date);
          return date.getDay() === 0; // Sunday
        }).length;
        
        const slab = increments?.filter(i => i.employeeId === emp.id && i.effectiveFrom <= summaryMonth).sort((a, b) => (b.effectiveFrom || '').localeCompare(a.effectiveFrom || ''))[0] || slabs[emp.id] || { totalSalary: 0, basicPercent: 40, hraPercent: 20 };
        const ts = Number(slab.totalSalary) || 0, paidDays = end - lop, dailyRate = ts / end, fullBasic = ts * (slab.basicPercent / 100), fullHra = ts * (slab.hraPercent / 100)
        const shiftH = Number(emp.minDailyHours) || 8
        const basic = fullBasic * (paidDays / end), hra = fullHra * (paidDays / end), sunPay = sunW * dailyRate, holPay = holW * dailyRate, otPay = (otH + (otAdjs[emp.id] || 0)) * (dailyRate / shiftH)
        
        const empVar = allVariables[emp.id] || {};
        const foodP = Number(empVar.food || 0), convP = Number(empVar.convenience || 0), bonusP = Number(empVar.bonus || 0);

        const loanE = allLoans.filter(l => l.employeeId === emp.id).reduce((s, l) => s + calcEMI(l, summaryMonth), 0), adv = allAE.filter(a => a.employeeId === emp.id && a.type === 'Advance').reduce((s, a) => s + Number(a.amount), 0), reimb = allAE.filter(a => a.employeeId === emp.id && a.type === 'Expense' && a.hrApproval === 'Approved').reduce((s, a) => s + Number(a.amount), 0), fine = allFines.filter(f => f.employeeId === emp.id).reduce((s, f) => s + Number(f.amount), 0)
        const pf = ts * (slab.pfPercent || 0) / 100, esi = ts * (slab.esiPercent || 0) / 100
        const netAdvanceExpense = adv - reimb // Net: Advance - Expense (positive = deduction, negative = addition)
        const totalEarnings = basic + hra + sunPay + holPay + otPay + foodP + convP + bonusP, totalDeductions = pf + esi + loanE + fine + adv
        const finalNet = totalEarnings - totalDeductions + reimb // Net: Gross - Deductions + Expense
        return { sno: idx + 1, id: emp.id, name: emp.name, empId: emp.empCode || emp.id.slice(0, 5), designation: emp.designation || '-', totalDays: end, worked, sundays: Math.max(0, sunCount - sandwichSundays), holidays: holCount, sunW, holW, leave, hd, lop, paidDays, fullBasic, fullHra, basic, hra, sunPay, holPay, otPay, ot: otH, otAdjustment: otAdjs[emp.id] || 0, totalEarnings, pf, esi, loanE, fine, advanceAmount: adv, expenseAmount: reimb, totalDeductions, netAdvanceExpense, salary: { net: finalNet }, potentialSandwichDays, appliedSandwichDays: appliedForThisEmp, sandwichSundays, food: foodP, convenience: convP, bonus: bonusP }
      })
    }, enabled: !!user?.orgId && sortedEmployees.length > 0 && activeTab === 'salary-summary'
  })

  const filteredAttendanceSummaryData = useMemo(() => summaryFilterEmpId ? attendanceSummaryData.filter(e => e.id === summaryFilterEmpId) : attendanceSummaryData, [attendanceSummaryData, summaryFilterEmpId])
  
  const dynamicNameWidth = useMemo(() => {
    if (!filteredAttendanceSummaryData.length) return 140;
    const maxChars = Math.max(...filteredAttendanceSummaryData.map(e => (e.name || '').length), 10);
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
      { id: 'attendance', label: 'Attendance', color: 'amber', columns: ['days', 'worked', 'sundays', 'sunWorked', 'holidayWorked', 'otH', 'hd', 'lop', 'paidDays'] },
      { id: 'earnings', label: 'Earnings (PAID)', color: 'emerald', columns: ['basicPaid', 'hraPaid', 'salaryPaid', 'sundayPay', 'holidayPay', 'otPay', 'earnings'] },
      { id: 'genDeductions', label: 'Deductions & Vouchers', color: 'red', columns: ['pf', 'esi', 'loan', 'ded', 'advance', 'reimb', 'netAdj'] },
      { id: 'summary', label: 'Payout Summary', color: 'green', columns: ['totalDed', 'net'] }
    ];
    return groups.map(g => ({ ...g, visibleCount: visibleDetailedSummaryColumns.filter(c => g.columns.includes(c.id)).length })).filter(g => g.visibleCount > 0);
  }, [visibleDetailedSummaryColumns]);

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
      case 'sundays': return emp.sundays || 0;
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
      case 'holidayPay': return dashIfZero(emp.holidayPay);
      case 'otPay': return dashIfZero(emp.otPay);
      case 'earnings': return Math.round(emp.totalEarnings).toLocaleString('en-IN');
      case 'pf': return dashIfZero(emp.pf);
      case 'esi': return dashIfZero(emp.esi);
      case 'loan': return dashIfZero(emp.loanE);
      case 'ded': return dashIfZero(emp.fine);
      case 'advance': return dashIfZero(emp.advanceAmount);
      case 'reimb': return dashIfZero(emp.expenseAmount);
      case 'netAdj': {
        const val = emp.netAdvanceExpense || 0;
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
    if (!user?.orgId) return alert('Organisation context missing. Please re-login.');
    
    console.log('Generating payslip for:', selectedEmp, 'Month:', selectedMonth);
    setLoading(true); setSlipData(null); setAdvExpRows([])
    
    try {
      const emp = employees.find(e => e.id === selectedEmp);
      if (!emp) throw new Error('Staff data not found in local state');

      const [y, m] = selectedMonth.split('-').map(Number);
      const end = new Date(y, m, 0).getDate();
      const sd = `${selectedMonth}-01`;
      const ed = `${selectedMonth}-${end}`;

      console.log('Fetching related data...');
      const [aDataSnap, aeSnap, loanSnap, fineSnap, otAdjSnap, orgSnap, varLogsSnap] = await Promise.all([
        getDocs(collection(db, 'organisations', user.orgId, 'attendance')),
        getDocs(collection(db, 'organisations', user.orgId, 'advances_expenses')), 
        getDocs(query(collection(db, 'organisations', user.orgId, 'loans'), where('status', '==', 'Active'))), 
        getDocs(collection(db, 'organisations', user.orgId, 'fines')), 
        getDoc(doc(db, 'organisations', user.orgId, 'otAdjustments', `${selectedMonth}_${selectedEmp}`)),
        getDoc(doc(db, 'organisations', user.orgId)),
        getDocs(collection(db, 'organisations', user.orgId, 'variablePayLogs'))
      ]);

      console.log('Data fetched. Processing...');
      
      const aData = aDataSnap.docs
        .map(d => d.data())
        .filter(a => a.employeeId === selectedEmp && a.date >= sd && a.date <= ed);
      const attByDate = new Map(aData.map(a => [a.date, a]));

      const orgData = orgSnap.exists() ? orgSnap.data() : {};
      const holidayList = Array.isArray(orgData.holidays) ? orgData.holidays : [];
      const holidayDates = new Set(holidayList.map(h => h.date).filter(Boolean));

      let foodP = 0, convP = 0, bonusP = 0;
      varLogsSnap.docs.forEach(d => {
        const row = d.data();
        if (row.employeeId === selectedEmp && row.month === selectedMonth) {
          foodP += Number(row.food || 0);
          convP += Number(row.convenience || 0);
          bonusP += Number(row.bonus || 0);
        }
      });

      const allAE = aeSnap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(a => a.employeeId === selectedEmp && a.date >= sd && a.date <= ed);
      
      setAdvExpRows(allAE.map(a => ({ date: a.date, type: a.type, amount: Number(a.amount) })));
      
      const adv = allAE.filter(a => a.type === 'Advance').reduce((s, a) => s + Number(a.amount), 0);
      const reimb = allAE.filter(a => a.type === 'Expense' && a.hrApproval === 'Approved').reduce((s, a) => s + Number(a.amount), 0);
      
      let worked = 0, sunW = 0, holW = 0, leave = 0, lop = 0, hd = 0, aOT = 0, sunCount = 0, holCount = 0;
      const sunDates = [], holDates = [], leaveDates = [];

      for (let i = 1; i <= end; i++) {
        const ds = `${selectedMonth}-${String(i).padStart(2, '0')}`;
        const d = new Date(y, m - 1, i);
        const isS = d.getDay() === 0;
        const isH = holidayDates.has(ds) && !isS;
        const r = attByDate.get(ds);
        const status = String(r?.status || '').toLowerCase();
        
        if (emp.joinedDate && ds < emp.joinedDate) {
          lop++;
          continue;
        }
        if (emp.inactiveFrom && ds > emp.inactiveFrom) {
          lop++;
          continue;
        }
        
        if (isS) sunCount++;
        if (isH) holCount++;
        
        const isPresent = isWorkedAttendanceRecord(r) || r?.sundayWorked || r?.holidayWorked || status === 'sunworked';
        const isHD = status === 'half-day' || r?.isHalfDay;

        if (status === 'absent' || r?.isAbsent || status === 'leave') {
          lop++;
          leaveDates.push(i);
        }
        else if (isHD) { 
          hd++; lop += 0.5; 
          if (isS) { sunW += 0.5; sunDates.push(i); } else if (isH) { holW += 0.5; holDates.push(i); } else worked += 0.5;
        } 
        else if (isS) { if (isPresent) { sunW++; sunDates.push(i); } }
        else if (isH) { if (isPresent) { holW++; holDates.push(i); } }
        else if (isPresent) worked++; 
        else if (!isS && !isH) {
          lop++;
          leaveDates.push(i);
        }

        if (r?.otHours) { 
          const [h, mi] = r.otHours.split(':').map(Number); 
          const totalMins = (h || 0) * 60 + (mi || 0);
          const roundedMins = Math.ceil(totalMins / 5) * 5;
          aOT += roundedMins / 60;
        }
      }

      setPaySummaryDates({ sundays: sunDates, holidays: holDates, leaves: leaveDates });

      const slab = increments?.filter(i => i.employeeId === selectedEmp && i.effectiveFrom <= selectedMonth).sort((a, b) => (b.effectiveFrom || '').localeCompare(a.effectiveFrom || ''))[0] || slabs[selectedEmp] || { totalSalary: 0, basicPercent: 40, hraPercent: 20, pfPercent: 0, esiPercent: 0 };
      const ts = Number(slab.totalSalary) || 0;
      const paidDaysValue = end - lop;
      const emi = loanSnap.docs.map(d => d.data()).filter(l => l.employeeId === selectedEmp).reduce((s, l) => s + calcEMI(l, selectedMonth), 0);
      const fineA = fineSnap.docs.map(d => d.data()).filter(f => f.employeeId === selectedEmp && f.date >= sd && f.date <= ed).reduce((s, f) => s + Number(f.amount || 0), 0);
      const shiftH = Number(emp.minDailyHours) || 8;
      const otAdj = otAdjSnap.exists() ? Number(otAdjSnap.data().adjustment || 0) : 0;
      const dailyRate = ts / end;
      const otP = (aOT + otAdj) * (dailyRate / shiftH);
      const fullBasic = ts * (Number(slab.basicPercent || 0) / 100);
      const fullHra = ts * (Number(slab.hraPercent || 0) / 100);
      const b = fullBasic * (paidDaysValue / end);
      const h = fullHra * (paidDaysValue / end);
      const hP = ts * (Number(slab.pfPercent || 0) / 100);
      const esiV = ts * (Number(slab.esiPercent || 0) / 100);
      const holP = holW * dailyRate;
      const gross = (b || 0) + (h || 0) + (sunW * dailyRate) + (holP || 0) + (otP || 0) + foodP + convP + bonusP;
      const ded = (hP || 0) + (esiV || 0) + (emi || 0) + (fineA || 0) + (adv || 0);
      const finalNet = Math.max(0, (gross || 0) - (ded || 0) + (reimb || 0));

      console.log('Calculation complete. Setting slip data.');
      setSlipData({ 
        employee: emp, month: selectedMonth, slab, 
        paidDays: paidDaysValue, lopDays: lop, 
        otPay: otP || 0, otHoursTotal: (aOT + otAdj) || 0,
        basic: b || 0, hra: h || 0, basicFull: fullBasic || 0, hraFull: fullHra || 0, 
        expenseReimbursement: reimb || 0, 
        sundayPay: (sunW * dailyRate) || 0, sundayWorkedCount: sunW || 0,
        holidayPay: holP || 0, holidayWorkedCount: holW || 0, 
        food: foodP, convenience: convP, bonus: bonusP,
        grossEarnings: gross || 0, pf: hP || 0, esi: esiV || 0, advanceDeduction: adv || 0, 
        loanEMI: emi || 0, fineAmount: fineA || 0, totalDeductions: ded || 0, 
        netPay: finalNet, 
        sundayCount: sunCount || 0, holidayCount: holCount || 0,
        totalMonthDays: end, workedDaysCount: worked || 0,
        leaveCount: leave || 0
      });
      setGenerated(true);
    } catch (e) { 
      console.error('Payslip Generation Error:', e);
      alert('Error: ' + e.message); 
    } finally { 
      setLoading(false); 
    }
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
        visibleGroupsGroup={visibleGroups}
      />).toBlob(); 
      downloadPdfBlob(blob, `Summary_${summaryMonth}.pdf`); 
    } finally { 
      setExportingDetailedPdf(false); 
    } 
  }
  const handleExportSalarySlipPdf = async () => { if (!slipData) return; setExportingSlipPdf(true); try { const blob = await pdf(<SalarySlipPDF data={slipData} orgName={user?.orgName} orgLogo={orgLogo} />).toBlob(); downloadPdfBlob(blob, `Slip_${slipData.employee.name}.pdf`); } finally { setExportingSlipPdf(false); } }

  const handleDownloadAllZipped = async () => {
    if (!attendanceSummaryData.length) return;
    setDownloadAllLoading(true);
    try {
      const zip = new JSZip();
      for (const empSummary of attendanceSummaryData) {
        const emp = employees.find(e => e.id === empSummary.id);
        const slab = increments?.filter(i => i.employeeId === emp.id && i.effectiveFrom <= summaryMonth).sort((a, b) => (b.effectiveFrom || '').localeCompare(a.effectiveFrom || ''))[0] || slabs[emp.id] || { totalSalary: 0, basicPercent: 40, hraPercent: 20, pfPercent: 0, esiPercent: 0 };
        
        const data = {
          employee: emp, month: summaryMonth, slab,
          paidDays: empSummary.paidDays, lopDays: empSummary.lop,
          otPay: empSummary.otPay, otHoursTotal: (empSummary.ot + empSummary.otAdjustment),
          basic: empSummary.basic, hra: empSummary.hra, basicFull: empSummary.fullBasic, hraFull: empSummary.fullHra,
          expenseReimbursement: empSummary.expenseAmount,
          sundayPay: empSummary.sunPay, sundayWorkedCount: empSummary.sunW,
          holidayPay: empSummary.holPay, holidayWorkedCount: empSummary.holW,
          food: empSummary.food, convenience: empSummary.convenience, bonus: empSummary.bonus,
          grossEarnings: empSummary.totalEarnings, pf: empSummary.pf, esi: empSummary.esi, advanceDeduction: empSummary.advanceAmount,
          loanEMI: empSummary.loanE, fineAmount: empSummary.fine, totalDeductions: empSummary.totalDeductions,
          netPay: empSummary.salary.net,
          sundayCount: empSummary.sunday, holidayCount: empSummary.holidays,
          totalMonthDays: empSummary.totalDays, workedDaysCount: empSummary.worked,
          leaveCount: empSummary.leave
        };

        const blob = await pdf(<SalarySlipPDF data={data} orgName={user?.orgName} orgLogo={orgLogo} />).toBlob();
        zip.file(`SalarySlip_${emp.name.replace(/\s+/g, '_')}_${summaryMonth}.pdf`, blob);
      }
      const content = await zip.generateAsync({ type: 'blob' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(content);
      link.download = `SalarySlips_${user?.orgName}_${summaryMonth}.zip`;
      link.click();
    } catch (e) { console.error(e); alert('Error generating ZIP'); } finally { setDownloadAllLoading(false); }
  }

  const [bulkGenerating, setBulkGenerating] = useState(false)
  const [bulkSlips, setBulkSlips] = useState([])

  const handleBulkGenerate = async () => {
    if (!attendanceSummaryData.length) return alert('No summary data available for this month');
    setBulkGenerating(true);
    try {
      const slips = attendanceSummaryData.map(empSummary => {
        const emp = employees.find(e => e.id === empSummary.id);
        const slab = increments?.filter(i => i.employeeId === emp.id && i.effectiveFrom <= summaryMonth).sort((a, b) => (b.effectiveFrom || '').localeCompare(a.effectiveFrom || ''))[0] || slabs[emp.id] || { totalSalary: 0, basicPercent: 40, hraPercent: 20, pfPercent: 0, esiPercent: 0 };
        
        return {
          employeeId: emp.id,
          employee: emp,
          month: summaryMonth,
          slab,
          paidDays: empSummary.paidDays,
          lopDays: empSummary.lop,
          otPay: empSummary.otPay,
          otHoursTotal: (empSummary.ot + empSummary.otAdjustment),
          basic: empSummary.basic,
          hra: empSummary.hra, basicFull: empSummary.fullBasic, hraFull: empSummary.fullHra,
          expenseReimbursement: empSummary.expenseAmount,
          sundayPay: empSummary.sunPay, sundayWorkedCount: empSummary.sunW,
          holidayPay: empSummary.holPay, holidayWorkedCount: empSummary.holW,
          food: empSummary.food, convenience: empSummary.convenience, bonus: empSummary.bonus,
          grossEarnings: empSummary.totalEarnings, pf: empSummary.pf, esi: empSummary.esi, advanceDeduction: empSummary.advanceAmount,
          loanEMI: empSummary.loanE, fineAmount: empSummary.fine, totalDeductions: empSummary.totalDeductions,
          netPay: empSummary.salary.net,
          sundayCount: empSummary.sunday, holidayCount: empSummary.holidays,
          totalMonthDays: empSummary.totalDays, workedDaysCount: empSummary.worked,
          leaveCount: empSummary.leave
        };
      });
      setBulkSlips(slips);
      if (slips.length > 0) {
        setSelectedEmp(slips[0].employeeId);
        setSlipData(slips[0]);
        setGenerated(true);
      }
    } catch (e) {
      console.error(e);
      alert('Error during bulk generation');
    } finally {
      setBulkGenerating(false);
    }
  }

  const handleOpenGmail = () => {
    window.open('https://mail.google.com', '_blank');
  }

  const [selectedSandwichDays, setSelectedSandwichDays] = useState(new Set());
  const [processingSandwich, setProcessingSandwich] = useState(false);
  const [sandwichHistoryFilterEmp, setSandwichHistoryFilterEmp] = useState('');
  const [showFallbackModal, setShowFallbackModal] = useState(false);
  const [selectedHistoryItem, setSelectedHistoryItem] = useState(null);
  
  const processSandwichMutation = useMutation({
    mutationFn: async (selectedDays) => {
      const batch = [];
      selectedDays.forEach(key => {
        const [empId, date] = key.split('_');
        const docId = `${summaryMonth}_${empId}_${date}`;
        batch.push(setDoc(doc(db, 'organisations', user.orgId, 'sandwichDeductions', docId), {
          employeeId: empId,
          month: summaryMonth,
          date: date,
          appliedAt: serverTimestamp(),
          appliedBy: user.uid
        }));
      });
      await Promise.all(batch);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['attendanceSummary']);
      queryClient.invalidateQueries(['sandwichHistory']);
      setSelectedSandwichDays(new Set());
      alert('Sandwich deductions applied successfully!');
    },
    onError: (err) => alert('Failed to apply: ' + err.message)
  });

  const allPotentialSandwiches = useMemo(() => {
    const list = [];
    attendanceSummaryData.forEach(emp => {
      (emp.potentialSandwichDays || []).forEach(day => {
        const isApplied = (emp.appliedSandwichDays || []).some(s => s.date === day.date);
        if (!isApplied) {
          list.push({ ...day, empId: emp.id, empName: emp.name });
        }
      });
    });
    return list;
  }, [attendanceSummaryData]);

  const { data: sandwichHistory = [], isLoading: isHistoryLoading } = useQuery({
    queryKey: ['sandwichHistory', user?.orgId, summaryMonth],
    queryFn: async () => {
      const q = query(collection(db, 'organisations', user.orgId, 'sandwichDeductions'), where('month', '==', summaryMonth));
      const snap = await getDocs(q);
      return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    },
    enabled: !!user?.orgId && summarySubTab === 'sandwich'
  });

  const filteredHistory = useMemo(() => {
    return sandwichHistoryFilterEmp 
      ? sandwichHistory.filter(h => h.employeeId === sandwichHistoryFilterEmp)
      : sandwichHistory;
  }, [sandwichHistory, sandwichHistoryFilterEmp]);

  return (
    <div className="flex h-full bg-white font-roboto text-gray-900 overflow-hidden flex-col">
      <div className="bg-white border-b px-6 py-3 flex items-center justify-between shadow-sm shrink-0">
        <div className="flex items-center gap-2">
          <div className="text-[10px] font-black uppercase text-slate-400 mr-6 tracking-[0.2em] select-none">Payroll</div>
          <nav className="flex p-1 bg-slate-100/50 rounded-xl border border-slate-200/60 gap-1">
            {[
              {id:'salary-summary', i:<FileText size={15}/>, l:'Summary'},
              {id:'salary-slip', i:<Banknote size={15}/>, l:'Pay Slip'},
              {id:'loan', i:<Wallet size={15}/>, l:'Loans'},
              {id:'full-summary', i:<Table size={15}/>, l:'Full Summary'}
            ].map(t => (
              <button 
                key={t.id} 
                onClick={() => setActiveTab(t.id)} 
                className={`flex items-center gap-2.5 px-4 py-2 rounded-lg text-[12px] font-bold tracking-tight transition-all duration-200 ${
                  activeTab === t.id 
                    ? 'text-indigo-600 bg-white shadow-[0_2px_8px_rgba(0,0,0,0.08)] border border-indigo-100/50 scale-[1.02]' 
                    : 'text-slate-500 hover:text-slate-900 hover:bg-white/50'
                }`}
              >
                <span className={`${activeTab === t.id ? 'text-indigo-600' : 'text-slate-400'}`}>{t.i}</span>
                {t.l}
              </button>
            ))}
          </nav>
        </div>
      </div>
      <div className="flex-1 p-6 overflow-hidden flex flex-col">
        {activeTab === 'full-summary' && (
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-white rounded-xl shadow-sm border border-gray-200 p-4">
            <SummaryTab defaultSubTab="monthlyView" hideMainTabs={true} />
          </div>
        )}
        {activeTab === 'salary-slip' && (
          <div className="max-w-7xl mx-auto w-full h-full flex flex-col overflow-hidden">
            <div className="flex gap-4 items-end shrink-0 mb-4 bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
              <div className="flex-1">
                <div className="text-[10px] font-black uppercase text-indigo-600 tracking-[0.2em] mb-1 ml-1">Calculation Period</div>
                <div className="flex items-center bg-gray-50 rounded-lg p-1 border border-gray-200 w-fit">
                  <button onClick={() => { const [y, m] = selectedMonth.split('-').map(Number); const d = new Date(y, m - 2, 1); setSelectedMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`) }} className="p-1.5 hover:bg-white hover:shadow-sm rounded transition-all text-gray-600"><ChevronLeft size={14} /></button>
                  <input type="month" value={selectedMonth} onChange={e=>setSelectedMonth(e.target.value)} className="h-7 bg-transparent border-0 text-[11px] font-black uppercase outline-none focus:ring-0 w-32 text-center cursor-pointer"/>
                  <button onClick={() => { const [y, m] = selectedMonth.split('-').map(Number); const d = new Date(y, m, 1); setSelectedMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`) }} className="p-1.5 hover:bg-white hover:shadow-sm rounded transition-all text-gray-600"><ChevronRight size={14} /></button>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={handleBulkGenerate} disabled={bulkGenerating || !attendanceSummaryData.length} className="h-9 px-6 bg-indigo-600 text-white rounded-xl text-[11px] font-black uppercase tracking-widest hover:bg-indigo-700 active:scale-95 transition-all flex items-center gap-2 shadow-lg shadow-indigo-100">
                  {bulkGenerating ? <RefreshCw size={14} className="animate-spin" /> : <Table size={14} />}
                  {bulkGenerating ? 'Processing...' : 'Auto-Generate All Staff'}
                </button>
                <button onClick={handleDownloadAllZipped} disabled={downloadAllLoading || !attendanceSummaryData.length} className="h-9 px-6 border border-zinc-200 bg-white text-zinc-900 rounded-xl text-[11px] font-black uppercase tracking-widest hover:bg-zinc-50 active:scale-95 transition-all flex items-center gap-2">
                  {downloadAllLoading ? <RefreshCw size={14} className="animate-spin" /> : <Download size={14} />}
                  {downloadAllLoading ? 'Zipping...' : 'Download All (ZIP)'}
                </button>
              </div>
            </div>

            <div className="flex-1 flex gap-4 overflow-hidden">
              {/* Staff List Sidebar */}
              <div className="w-64 shrink-0 bg-white rounded-2xl border border-gray-100 shadow-sm flex flex-col overflow-hidden">
                <div className="p-4 border-b border-gray-50 flex justify-between items-center bg-gray-50/50">
                  <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Staff ({attendanceSummaryData.length})</span>
                  <div className="flex items-center gap-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
                    <span className="text-[8px] font-bold text-emerald-600 uppercase">Live</span>
                  </div>
                </div>
                <div className="flex-1 overflow-auto p-2 space-y-1">
                  {attendanceSummaryData.map((empSummary) => (
                    <button
                      key={empSummary.id}
                      onClick={() => {
                        setSelectedEmp(empSummary.id);
                        const slip = bulkSlips.find(s => s.employeeId === empSummary.id);
                        if (slip) {
                          setSlipData(slip);
                          setGenerated(true);
                        } else {
                          handleGenerate();
                        }
                      }}
                      className={`w-full text-left p-2.5 rounded-xl transition-all border ${
                        selectedEmp === empSummary.id 
                          ? 'bg-indigo-600 border-indigo-700 shadow-lg shadow-indigo-100' 
                          : 'bg-white border-transparent hover:bg-gray-50 hover:border-gray-100'
                      }`}
                    >
                      <div className="flex justify-between items-start mb-0.5">
                        <span className={`text-[11px] font-bold uppercase truncate max-w-[110px] ${selectedEmp === empSummary.id ? 'text-white' : 'text-slate-700'}`}>
                          {empSummary.name}
                        </span>
                        <span className={`text-[9px] font-black ${selectedEmp === empSummary.id ? 'text-indigo-200' : 'text-slate-400'}`}>
                          ₹{Math.round(empSummary.salary?.net || 0).toLocaleString()}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-[8px] font-bold uppercase ${selectedEmp === empSummary.id ? 'text-indigo-100' : 'text-slate-400'}`}>
                          {empSummary.paidDays} Days
                        </span>
                        {empSummary.ot > 0 && (
                          <span className={`text-[8px] font-bold uppercase flex items-center gap-0.5 ${selectedEmp === empSummary.id ? 'text-indigo-100' : 'text-amber-600'}`}>
                            <Clock size={8} /> {empSummary.ot.toFixed(1)}h
                          </span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Main Preview Area */}
              <div className="flex-1 flex flex-col overflow-hidden min-w-0 bg-white rounded-2xl border border-gray-100 shadow-sm relative">
                {!selectedEmp ? (
                  <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
                    <div className="w-16 h-16 bg-indigo-50 rounded-[24px] flex items-center justify-center mb-6">
                      <Banknote size={32} className="text-indigo-600" />
                    </div>
                    <h3 className="text-md font-black text-slate-800 uppercase tracking-tight mb-2">Select Staff</h3>
                    <p className="text-[12px] text-slate-500 max-w-xs mx-auto leading-relaxed">
                      Choose an employee to view their detailed monthly advice.
                    </p>
                  </div>
                ) : loading ? (
                  <div className="flex-1 flex items-center justify-center bg-white/80 backdrop-blur-sm z-50">
                    <div className="flex flex-col items-center gap-4">
                      <Spinner />
                      <span className="text-[10px] font-black uppercase text-indigo-600 tracking-[0.2em] animate-pulse">Computing Payroll...</span>
                    </div>
                  </div>
                ) : slipData ? (
                  <div className="flex-1 flex flex-col overflow-hidden animate-in fade-in duration-500">
                    <div className="p-3 border-b border-gray-50 flex justify-between items-center bg-gray-50/30 shrink-0">
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white shadow-lg">
                          <span className="text-[12px] font-black uppercase">{slipData.employee?.name?.[0]}</span>
                        </div>
                        <div>
                          <h2 className="text-[11px] font-black uppercase text-slate-800 tracking-tight">{slipData.employee?.name}</h2>
                          <p className="text-[9px] text-indigo-600 font-bold uppercase tracking-widest">{formatMonthDisplay(slipData.month)}</p>
                        </div>
                      </div>
                      <div className="flex gap-1.5">
                        <button onClick={() => window.print()} className="h-7 px-3 bg-white border border-gray-200 rounded-lg text-[9px] font-black uppercase tracking-widest hover:bg-gray-50 transition-all flex items-center gap-2">
                          <Download size={12} /> Print
                        </button>
                        <button onClick={handleExportSalarySlipPdf} disabled={exportingSlipPdf} className="h-7 px-3 bg-slate-900 text-white rounded-lg text-[9px] font-black uppercase tracking-widest hover:bg-black transition-all flex items-center gap-2 shadow-lg">
                          {exportingSlipPdf ? <RefreshCw size={12} className="animate-spin" /> : <Download size={12} />}
                          PDF
                        </button>
                      </div>
                    </div>
                    
                    <div className="flex-1 overflow-auto bg-gray-50/50 p-4">
                      <div className="max-w-4xl mx-auto">
                        {/* RESTORED DETAILED SALARY SLIP PREVIEW */}
                        <div className="bg-white rounded-[24px] shadow-2xl m-4 p-8 print-area overflow-hidden relative border-[3px] border-zinc-900" style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}>
                          <div className="border-b border-zinc-200 pb-4 mb-6 flex justify-between items-start">
                            <div className="flex items-center gap-4">
                              {orgLogo && <img src={orgLogo} alt="Logo" className="w-12 h-12 object-contain" />}
                              <h1 className="text-2xl font-black uppercase tracking-tight text-blue-600">{user?.orgName}</h1>
                            </div>
                            <div className="text-right">
                              <h2 className="text-lg font-normal uppercase italic text-zinc-500">Salary Slip</h2>
                              <p className="text-[9px] font-normal text-zinc-600 bg-zinc-50 px-2 py-0.5 rounded border border-zinc-100 uppercase mt-1">{formatMonthDisplay(slipData.month)}</p>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-x-12 gap-y-0.5 mb-6">
                            <div className="space-y-0.5">
                              {[{l:'Staff Name',v:slipData.employee?.name},{l:'Employee ID',v:slipData.employee?.empCode},{l:'Designation',v:slipData.employee?.designation || '-'},{l:'DOJ',v:formatDateDDMMYYYY(slipData.employee?.joinedDate)},{l:'Total days',v:slipData.totalMonthDays},{l:'Net Payout',v:formatINR(slipData.netPay)}].map((r,i)=>(<div key={i} className="flex justify-between border-b border-zinc-100 py-0.5"><span className="text-[12px] font-bold text-slate-700 uppercase tracking-tight">{r.l}</span><span className="text-[12px] font-normal text-zinc-900 uppercase">{r.v}</span></div>))}
                            </div>
                            <div className="space-y-0.5">
                              {[{l:'Total worked days',v:slipData.workedDaysCount},{l:'Leave',v:slipData.lopDays || 0},{l:'No. of Holidays',v:slipData.holidayCount || 0},{l:'Sunday Worked',v:slipData.sundayWorkedCount},{l:'Holiday Worked',v:slipData.holidayWorkedCount},{l:'Total Pay days',v:slipData.paidDays},{l:'OT hours',v:slipData.otHoursTotal.toFixed(2)}].map((r,i)=>(<div key={i} className="flex justify-between border-b border-zinc-100 py-0.5"><span className="text-[12px] font-bold text-slate-700 uppercase tracking-tight">{r.l}</span><span className="text-[12px] font-normal text-zinc-900 uppercase">{r.v}</span></div>))}
                            </div>
                          </div>

                          <div className="border border-zinc-900 rounded-lg overflow-hidden mb-6">
                            <div className="grid grid-cols-12 font-black text-[9px] uppercase tracking-widest border-b border-zinc-900">
                              <div className="col-span-5 p-3 border-r border-zinc-900 bg-green-50 text-green-800 flex justify-between"><span>Earnings (Credit)</span><span>Amount</span></div>
                              <div className="col-span-4 p-3 border-r border-zinc-900 bg-red-50 text-red-800 flex justify-between"><span>Deductions (Debit)</span><span>Amount</span></div>
                              <div className="col-span-3 p-3 bg-gradient-to-r from-emerald-50 to-rose-50 text-slate-800 flex justify-between"><span>Advance/Expense</span><span>Amount</span></div>
                            </div>
                            <div className="grid grid-cols-12 divide-x divide-zinc-900 bg-white">
                              <div className="col-span-5 p-1 space-y-0.5">
                                <div className="flex justify-between py-1 px-3 text-[11px] font-normal"><span className="font-bold">Basic Salary</span><span>{formatINR(slipData.basic)}</span></div>
                                <div className="flex justify-between py-1 px-3 text-[11px] font-normal"><span className="font-bold">HRA</span><span>{formatINR(slipData.hra)}</span></div>
                                <div className="flex justify-between py-1 px-3 text-[11px] font-normal"><span className="font-bold">Sunday Worked</span><span>{formatINR(slipData.sundayPay)}</span></div>
                                <div className="flex justify-between py-1 px-3 text-[11px] font-normal"><span className="font-bold">Holiday Pay</span><span>{formatINR(slipData.holidayPay)}</span></div>
                                <div className="flex justify-between py-1 px-3 text-[11px] font-normal"><span className="font-bold">OT Pay</span><span>{formatINR(slipData.otPay)}</span></div>
                                {slipData.food > 0 && <div className="flex justify-between py-1 px-3 text-[11px] font-normal"><span className="font-bold">Food Allowance</span><span>{formatINR(slipData.food)}</span></div>}
                                {slipData.convenience > 0 && <div className="flex justify-between py-1 px-3 text-[11px] font-normal"><span className="font-bold">Convenience</span><span>{formatINR(slipData.convenience)}</span></div>}
                                {slipData.bonus > 0 && <div className="flex justify-between py-1 px-3 text-[11px] font-normal"><span className="font-bold">Bonus</span><span>{formatINR(slipData.bonus)}</span></div>}
                              </div>
                              <div className="col-span-4 p-1 space-y-0.5">
                                <div className="flex justify-between py-1 px-3 text-[11px] font-normal"><span className="font-bold">PF Contribution</span><span>{dashIfZero(slipData.pf)}</span></div>
                                <div className="flex justify-between py-1 px-3 text-[11px] font-normal"><span className="font-bold">ESI Contribution</span><span>{dashIfZero(slipData.esi)}</span></div>
                                <div className="flex justify-between py-1 px-3 text-[11px] font-normal"><span className="font-bold">Loan</span><span>{dashIfZero(slipData.loanEMI)}</span></div>
                                <div className="flex justify-between py-1 px-3 text-[11px] font-normal"><span className="font-bold">Fine</span><span>{dashIfZero(slipData.fineAmount)}</span></div>
                              </div>
                              <div className="col-span-3 p-1 space-y-0.5 bg-gradient-to-b from-slate-50 to-white">
                                <div className="flex justify-between py-1 px-2 text-[10px] font-normal border-b border-slate-200">
                                  <span className="font-bold text-emerald-700">Expense</span>
                                  <span className="text-emerald-700 font-bold">{formatINR(slipData.expenseReimbursement)}</span>
                                </div>
                                <div className="flex justify-between py-1 px-2 text-[10px] font-normal border-b border-slate-200">
                                  <span className="font-bold text-rose-700">Advance</span>
                                  <span className="text-rose-700 font-bold">{formatINR(slipData.advanceDeduction)}</span>
                                </div>
                              </div>
                            </div>
                            <div className="grid grid-cols-12 border-t border-zinc-900">
                              <div className="col-span-5 flex justify-between p-3 bg-green-50 border-r border-zinc-900">
                                <span className="text-[10px] font-bold text-green-800 uppercase">Total Earnings</span>
                                <span className="text-[12px] font-bold text-green-800">{formatINR((slipData.basic || 0) + (slipData.hra || 0) + (slipData.sundayPay || 0) + (slipData.holidayPay || 0) + (slipData.otPay || 0) + (slipData.food || 0) + (slipData.convenience || 0) + (slipData.bonus || 0))}</span>
                              </div>
                              <div className="col-span-4 flex justify-between p-3 bg-red-50 border-r border-zinc-900">
                                <span className="text-[10px] font-bold text-red-800 uppercase">Total Deductions</span>
                                <span className="text-[12px] font-bold text-red-800">{formatINR((slipData.pf || 0) + (slipData.esi || 0) + (slipData.loanEMI || 0) + (slipData.fineAmount || 0))}</span>
                              </div>
                              <div className="col-span-3 flex justify-between p-3 bg-slate-100">
                                <span className="text-[10px] font-bold text-slate-800 uppercase">NET</span>
                                <span className="text-[12px] font-bold text-slate-800">{formatINR((slipData.advanceDeduction || 0) - (slipData.expenseReimbursement || 0))}</span>
                              </div>
                            </div>
                          </div>
                          <div className="text-center pt-4 border-t border-dashed border-zinc-200">
                            <p className="text-[9px] font-normal text-slate-400 uppercase mb-2">Net Disbursement</p>
                            <div className="bg-zinc-50 border border-zinc-100 rounded-xl p-4 inline-block shadow-sm font-normal text-[18px] text-zinc-900">{formatINR(slipData.netPay)}</div>
                            <p className="text-[10px] italic text-zinc-500 mt-3 uppercase tracking-tight">Indian Rupee {numberToWords(slipData.netPay)} Only</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>

              {/* Restored Right Summary Sidebar */}
              {selectedEmp && (
                <div className="w-80 shrink-0 bg-white border border-gray-100 rounded-2xl overflow-hidden flex flex-col h-full shadow-sm animate-in fade-in slide-in-from-right-4">
                  <div className="p-4 bg-gray-50/50 border-b border-gray-50 font-black uppercase text-[10px] tracking-widest text-slate-400">Period Audit Log</div>
                  <div className="p-5 flex-1 overflow-auto space-y-6">
                    <div className="space-y-3">
                      <div className="flex flex-col gap-1.5 p-3 bg-indigo-50/50 rounded-xl border border-indigo-100/50">
                        <span className="text-[9px] font-black uppercase text-indigo-400 tracking-wider">Sunday Worked (Dates)</span>
                        <div className="flex flex-wrap gap-1">
                          {paySummaryDates.sundays.length > 0 ? paySummaryDates.sundays.map(d => (
                            <span key={d} className="bg-white border border-indigo-200 text-indigo-700 font-bold text-[10px] w-6 h-6 flex items-center justify-center rounded-md shadow-sm">{d}</span>
                          )) : <span className="text-[10px] italic text-slate-300">None</span>}
                        </div>
                      </div>
                      <div className="flex flex-col gap-1.5 p-3 bg-amber-50/50 rounded-xl border border-amber-100/50">
                        <span className="text-[9px] font-black uppercase text-amber-500 tracking-wider">Holiday Worked (Dates)</span>
                        <div className="flex flex-wrap gap-1">
                          {paySummaryDates.holidays.length > 0 ? paySummaryDates.holidays.map(d => (
                            <span key={d} className="bg-white border border-amber-200 text-amber-700 font-bold text-[10px] w-6 h-6 flex items-center justify-center rounded-md shadow-sm">{d}</span>
                          )) : <span className="text-[10px] italic text-slate-300">None</span>}
                        </div>
                      </div>
                      <div className="flex flex-col gap-1.5 p-3 bg-rose-50/50 rounded-xl border border-rose-100/50">
                        <span className="text-[9px] font-black uppercase text-rose-500 tracking-wider">Leave Dates</span>
                        <div className="text-[11px] font-bold text-rose-700">
                          {paySummaryDates.leaves?.length > 0 ? paySummaryDates.leaves.join(', ') : <span className="text-[10px] italic text-slate-300 font-normal">None</span>}
                        </div>
                      </div>
                    </div>

                    <div className="space-y-3 pt-2">
                      <span className="text-[9px] font-black uppercase text-slate-400 tracking-wider ml-1">Monthly Vouchers</span>
                      <div className="border border-gray-100 rounded-xl overflow-hidden shadow-sm">
                        <table className="w-full text-left text-[10px]">
                          <thead>
                            <tr className="bg-gray-50 text-slate-400 uppercase font-black tracking-tighter border-b border-gray-100">
                              <th className="p-2.5 font-bold">Date</th>
                              <th className="p-2.5 font-bold">Type</th>
                              <th className="p-2.5 text-right font-bold">Amount</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-50 bg-white">
                            {advExpRows.length === 0 ? (
                              <tr><td colSpan={3} className="py-8 text-center text-slate-300 uppercase font-bold text-[9px] tracking-widest italic">No vouchers found</td></tr>
                            ) : (
                              advExpRows.map((r, i) => (
                                <tr key={i} className="hover:bg-gray-50 transition-colors">
                                  <td className="p-2.5 font-medium text-slate-500">{formatDateDDMMYYYY(r.date)}</td>
                                  <td className="p-2.5"><span className={`px-1.5 py-0.5 rounded-full text-[8px] font-black uppercase border ${r.type==='Advance'?'bg-red-50 text-red-600 border-red-100':'bg-green-50 text-green-600 border-green-100'}`}>{r.type}</span></td>
                                  <td className="p-2.5 text-right font-black text-zinc-900">{formatINR(r.amount)}</td>
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
            </div>
          </div>
        )}

        {activeTab === 'salary-summary' && (
          <div className="flex-1 flex flex-col min-h-0">
            <div className="flex justify-between items-center py-2 border-b shrink-0 bg-white z-50">
              <div className="flex gap-2 items-center">
                <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                  {[
                    {id:'overview',l:'Overview'},
                    {id:'variable',l:'Variable Pay'},
                    {id:'payment',l:'Payment Details'},
                    {id:'detailed',l:'Full Summary'},
                    {id:'sandwich',l:'Sandwich Rule'}
                  ].map(t=>(<button key={t.id} onClick={()=>setSummarySubTab(t.id)} className={`px-3 py-1 text-[10px] font-black uppercase tracking-wider rounded-md transition-all ${summarySubTab===t.id?'bg-white text-indigo-600 shadow-sm border border-indigo-100':'text-slate-500 hover:text-slate-900'}`}>{t.l}</button>))}
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
                      <th colSpan={4} className="px-4 text-center border-r border-zinc-200 font-black uppercase text-[10px] text-black tracking-widest bg-gray-500">Performance</th>
                      <th colSpan={1} className="px-4 text-center border-r border-zinc-200 font-black uppercase text-[10px] text-indigo-900 tracking-widest bg-indigo-100">Overtime</th>
                      <th colSpan={2} className="px-4 text-center border-r border-zinc-200 font-black uppercase text-[10px] text-emerald-900 tracking-widest bg-emerald-100">Holiday Worked</th>
                      <th colSpan={3} className="px-4 text-center font-black uppercase text-[10px] text-white tracking-widest bg-green-600">Summary & Payment</th>
                      <th className="w-12 bg-zinc-100"></th>
                    </tr>
                    {/* Primary Header Row */}
                    <tr className="bg-white text-[10px] uppercase font-bold text-zinc-500 tracking-tighter h-[35px] border-b-2 border-zinc-300">
                      <th className="px-3 text-center border-r border-zinc-200 w-10">#</th>
                      <th className="px-4 text-left border-r border-zinc-200 w-40">Employee Name</th>
                      <th className="px-2 text-center border-r border-zinc-200 w-24">Total Days</th>
                      <th className="px-2 text-center border-r border-zinc-200 w-20">Sunday</th>
                      <th className="px-2 text-center border-r border-zinc-200 w-20">Holiday</th>
                      <th className="px-2 text-center border-r border-zinc-200 w-24">Worked</th>
                      <th className="px-2 text-center border-r border-zinc-200 w-[50px] whitespace-pre-line">HALF{"\n"}DAY</th>
                      <th className="px-2 text-center border-r border-zinc-200 w-20">Leave</th>
                      <th className="px-2 text-center border-r border-zinc-200 w-20 text-rose-500">Loss of pay</th>
                      <th className="px-2 text-center border-r border-zinc-200 w-24">OT (Hrs)</th>
                      <th className="px-2 text-center border-r border-zinc-100 w-24 font-bold text-emerald-600 bg-emerald-50/10">Sunday Wk</th>
                      <th className="px-2 text-center border-r border-zinc-200 w-24 font-bold text-emerald-600 bg-emerald-50/10">Holiday Wk</th>
                      <th className="px-2 text-center border-r border-zinc-200 w-28 bg-green-50/50 text-green-700 font-black">Net Payout</th>
                      <th className="px-2 text-center border-r border-zinc-200 w-24 text-indigo-600 font-black">Status</th>
                      <th className="px-2 text-center border-r border-zinc-200 w-32 text-slate-400">Details</th>
                      <th className="w-12"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200">
                    {isAttendanceLoading ? (
                       <tr><td colSpan={16} className="py-20 text-center"><Spinner /></td></tr>
                    ) : filteredAttendanceSummaryData.map((e, idx)=>{
                      const payment = salaryPayments[e.id] || {};
                      const isPaid = Number(payment.paidAmount || 0) >= Number(e.salary?.net || 0) && Number(e.salary?.net || 0) > 0;
                      const isPartial = Number(payment.paidAmount || 0) > 0 && !isPaid;

                      return (
                      <tr key={e.id} className={`hover:bg-zinc-50/80 transition-colors h-[32px] group ${idx%2===0?'bg-white':'bg-zinc-50/30'}`}>
                        <td className="px-2 text-center border-r border-zinc-100 text-zinc-400 font-mono text-[10px]">{idx + 1}</td>
                        <td className="px-4 border-r border-zinc-200 font-black text-zinc-900 uppercase text-[11px] tracking-tight truncate w-40">{e.name}</td>
                        <td className="px-2 text-center border-r border-zinc-100 text-zinc-600 font-semibold">{e.totalDays}</td>
                        <td className="px-2 text-center border-r border-zinc-100 text-zinc-400">{e.sundays}</td>
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
                        <td className="px-2 text-center border-r border-zinc-200 font-black text-green-700 bg-green-50/20 text-[12px]">{formatINR(e.salary?.net)}</td>
                        <td className="px-2 text-center border-r border-zinc-200">
                          {isPaid ? (
                            <span className="px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-[8px] font-black uppercase">Paid</span>
                          ) : isPartial ? (
                            <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[8px] font-black uppercase">Partial</span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-400 text-[8px] font-black uppercase">Pending</span>
                          )}
                        </td>
                        <td className="px-2 text-center border-r border-zinc-200 text-[9px] font-bold text-slate-500 italic">
                          {payment.paymentDate ? `${formatDateDDMMYYYY(payment.paymentDate)} (${payment.paymentMode})` : '-'}
                        </td>
                        <td className="px-2 text-center">
                          <button onClick={()=>{setSelectedEmp(e.id);setActiveTab('salary-slip');handleGenerate();}} className="p-1 hover:bg-zinc-900 hover:text-white rounded transition-all text-zinc-400">
                            <ArrowRight size={14}/>
                          </button>
                        </td>
                      </tr>
                    )})}
                  </tbody>
                </table>
                </div>
              ) : summarySubTab === 'variable' ? (
                <div className="h-full flex flex-col bg-white p-6">
                  <div className="flex justify-between items-end mb-6">
                    <div className="flex items-end gap-6">
                      <div>
                        <h2 className="text-sm font-black uppercase text-slate-800 tracking-tight font-raleway">Variable Pay Management</h2>
                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-tight">Log Food, Convenience, and Bonus for specific dates.</p>
                      </div>
                      
                      <div className="flex flex-col gap-1">
                        <span className="text-[9px] font-black text-indigo-600 uppercase tracking-widest ml-1">Entry Date</span>
                        <div className="flex items-center bg-gray-50 rounded-lg p-1 border border-gray-200">
                          <button 
                            onClick={() => setVariableEntryDate(d => { const nd = new Date(d); nd.setDate(nd.getDate() - 1); return nd.toISOString().split('T')[0]; })} 
                            className="p-1 hover:bg-white hover:shadow-sm rounded text-gray-500 transition-all"
                          >
                            <ChevronLeft size={14} />
                          </button>
                          <input 
                            type="date" 
                            value={variableEntryDate} 
                            onChange={e => setVariableEntryDate(e.target.value)}
                            className="bg-transparent border-0 text-[10px] font-black uppercase outline-none focus:ring-0 w-28 text-center cursor-pointer"
                          />
                          <button 
                            onClick={() => setVariableEntryDate(d => { const nd = new Date(d); nd.setDate(nd.getDate() + 1); return nd.toISOString().split('T')[0]; })} 
                            className="p-1 hover:bg-white hover:shadow-sm rounded text-gray-500 transition-all"
                          >
                            <ChevronRight size={14} />
                          </button>
                        </div>
                      </div>
                    </div>

                    <button 
                      onClick={() => saveVariablesMutation.mutate(variablePayData)}
                      disabled={saveVariablesMutation.isPending || isDailyVarsLoading}
                      className="h-9 px-6 bg-indigo-600 text-white rounded-xl text-[11px] font-black uppercase tracking-widest shadow-lg shadow-indigo-200 hover:bg-indigo-700 active:scale-95 transition-all flex items-center gap-2"
                    >
                      {saveVariablesMutation.isPending ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
                      Save for {formatDateDDMMYYYY(variableEntryDate)}
                    </button>
                  </div>
                  <div className="flex-1 overflow-auto border border-zinc-200 rounded-2xl shadow-sm relative">
                    {isDailyVarsLoading && (
                      <div className="absolute inset-0 bg-white/50 backdrop-blur-[1px] z-20 flex items-center justify-center">
                        <Spinner />
                      </div>
                    )}
                    <table className="w-full border-collapse">
                      <thead className="sticky top-0 bg-slate-50 z-10 border-b border-zinc-200">
                        <tr className="h-10">
                          <th className="px-4 text-left text-[10px] font-black uppercase text-slate-500 tracking-widest border-r border-zinc-100">Employee Name</th>
                          <th className="px-4 text-center text-[10px] font-black uppercase text-indigo-600 tracking-widest border-r border-zinc-100 w-40">Food Allowance</th>
                          <th className="px-4 text-center text-[10px] font-black uppercase text-indigo-600 tracking-widest border-r border-zinc-100 w-40">Convenience</th>
                          <th className="px-4 text-center text-[10px] font-black uppercase text-indigo-600 tracking-widest w-40">Bonus / Other</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-100 bg-white">
                        {sortedEmployees.map(emp => (
                          <tr key={emp.id} className="h-12 hover:bg-slate-50 transition-colors">
                            <td className="px-4 border-r border-zinc-50 font-bold text-slate-900 uppercase text-[11px]">{emp.name}</td>
                            <td className="px-4 border-r border-zinc-50">
                              <input 
                                type="number" 
                                className="w-full h-8 text-center font-bold text-indigo-600 bg-indigo-50/30 rounded-lg border-0 focus:ring-2 focus:ring-indigo-500 text-[11px]" 
                                value={variablePayData[emp.id]?.food || ''} 
                                onChange={e => handleVariableChange(emp.id, 'food', e.target.value)}
                                placeholder="0"
                              />
                            </td>
                            <td className="px-4 border-r border-zinc-50">
                              <input 
                                type="number" 
                                className="w-full h-8 text-center font-bold text-indigo-600 bg-indigo-50/30 rounded-lg border-0 focus:ring-2 focus:ring-indigo-500 text-[11px]" 
                                value={variablePayData[emp.id]?.convenience || ''} 
                                onChange={e => handleVariableChange(emp.id, 'convenience', e.target.value)}
                                placeholder="0"
                              />
                            </td>
                            <td className="px-4">
                              <input 
                                type="number" 
                                className="w-full h-8 text-center font-bold text-indigo-600 bg-indigo-50/30 rounded-lg border-0 focus:ring-2 focus:ring-indigo-500 text-[11px]" 
                                value={variablePayData[emp.id]?.bonus || ''} 
                                onChange={e => handleVariableChange(emp.id, 'bonus', e.target.value)}
                                placeholder="0"
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : summarySubTab === 'payment' ? (
                <div className="h-full flex flex-col bg-white p-6">
                  <div className="flex justify-between items-end mb-6">
                    <div>
                      <h2 className="text-sm font-black uppercase text-slate-800 tracking-tight font-raleway">Payment Disbursement Log</h2>
                      <p className="text-[10px] text-slate-500 font-bold uppercase tracking-tight">Record actual payments done to staff for {formatMonthDisplay(summaryMonth)}.</p>
                    </div>
                    <button 
                      onClick={() => savePaymentsMutation.mutate(paymentDetails)}
                      disabled={savePaymentsMutation.isPending}
                      className="h-9 px-6 bg-emerald-600 text-white rounded-xl text-[11px] font-black uppercase tracking-widest shadow-lg shadow-emerald-200 hover:bg-emerald-700 active:scale-95 transition-all flex items-center gap-2"
                    >
                      {savePaymentsMutation.isPending ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
                      Save Payment Records
                    </button>
                  </div>
                  <div className="flex-1 overflow-auto border border-zinc-200 rounded-2xl shadow-sm">
                    <table className="w-full border-collapse">
                      <thead className="sticky top-0 bg-slate-50 z-10 border-b border-zinc-200">
                        <tr className="h-10">
                          <th className="px-4 text-left text-[10px] font-black uppercase text-slate-500 tracking-widest border-r border-zinc-100">Employee Name</th>
                          <th className="px-4 text-center text-[10px] font-black uppercase text-indigo-600 tracking-widest border-r border-zinc-100 w-40">Net Payout</th>
                          <th className="px-4 text-center text-[10px] font-black uppercase text-emerald-600 tracking-widest border-r border-zinc-100 w-48">Paid Amount</th>
                          <th className="px-4 text-center text-[10px] font-black uppercase text-emerald-600 tracking-widest border-r border-zinc-100 w-48">Payment Date</th>
                          <th className="px-4 text-center text-[10px] font-black uppercase text-emerald-600 tracking-widest w-48">Ref / Mode</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-100 bg-white">
                        {isAttendanceLoading ? (
                          <tr><td colSpan={5} className="py-20 text-center"><Spinner /></td></tr>
                        ) : attendanceSummaryData.map(emp => (
                          <tr key={emp.id} className="h-12 hover:bg-slate-50 transition-colors">
                            <td className="px-4 border-r border-zinc-50 font-bold text-slate-900 uppercase text-[11px]">{emp.name}</td>
                            <td className="px-4 border-r border-zinc-50 text-center font-black text-slate-400 text-[11px] bg-slate-50/30">
                              {formatINR(emp.salary?.net)}
                            </td>
                            <td className="px-4 border-r border-zinc-50">
                              <div className="relative">
                                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-emerald-600">₹</span>
                                <input 
                                  type="number" 
                                  className="w-full h-8 pl-5 text-right font-black text-emerald-600 bg-emerald-50/30 rounded-lg border-0 focus:ring-2 focus:ring-emerald-500 text-[11px]" 
                                  value={paymentDetails[emp.id]?.paidAmount || ''} 
                                  onChange={e => handlePaymentChange(emp.id, 'paidAmount', e.target.value)}
                                  placeholder="0"
                                />
                              </div>
                            </td>
                            <td className="px-4 border-r border-zinc-50">
                              <input 
                                type="date" 
                                className="w-full h-8 px-2 font-bold text-slate-600 bg-slate-50 rounded-lg border-0 focus:ring-2 focus:ring-indigo-500 text-[10px] uppercase" 
                                value={paymentDetails[emp.id]?.paymentDate || ''} 
                                onChange={e => handlePaymentChange(emp.id, 'paymentDate', e.target.value)}
                              />
                            </td>
                            <td className="px-4">
                              <select 
                                className="w-full h-8 px-2 font-bold text-slate-600 bg-slate-50 rounded-lg border-0 focus:ring-2 focus:ring-indigo-500 text-[10px] uppercase appearance-none cursor-pointer"
                                value={paymentDetails[emp.id]?.paymentMode || 'Bank Transfer'}
                                onChange={e => handlePaymentChange(emp.id, 'paymentMode', e.target.value)}
                              >
                                <option value="Bank Transfer">Bank Transfer</option>
                                <option value="Cash">Cash</option>
                                <option value="UPI">UPI / GPay</option>
                                <option value="Cheque">Cheque</option>
                                <option value="Adjustment">Adjustment</option>
                              </select>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : summarySubTab === 'sandwich' ? (
                <div className="h-full overflow-auto bg-white p-4 flex flex-col">
                  {/* Detection Section */}
                  <div className="mb-6">
                    <div className="mb-4 flex justify-between items-end">
                      <div>
                        <h2 className="text-sm font-black uppercase text-slate-800 tracking-tight font-['Raleway']">Sandwich Detection</h2>
                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-tight">Detected Sundays/Holidays sandwiched between absences.</p>
                      </div>
                      {allPotentialSandwiches.length > 0 && (
                        <button 
                          onClick={() => processSandwichMutation.mutate(selectedSandwichDays)} 
                          disabled={selectedSandwichDays.size === 0 || processSandwichMutation.isPending}
                          className="h-7 px-4 bg-emerald-600 text-white rounded-lg text-[10px] font-black uppercase tracking-widest shadow-md hover:bg-emerald-700 disabled:opacity-50 transition-all flex items-center gap-2"
                        >
                          {processSandwichMutation.isPending ? <RefreshCw size={12} className="animate-spin" /> : <Save size={12} />}
                          Apply Selected ({selectedSandwichDays.size})
                        </button>
                      )}
                    </div>
                    {allPotentialSandwiches.length === 0 ? (
                      <div className="py-12 text-center bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
                        <CheckCircle2 size={48} className="mx-auto text-emerald-500 mb-4 opacity-20" />
                        <p className="text-[11px] font-black uppercase tracking-widest text-slate-400">No potential sandwiches detected</p>
                      </div>
                    ) : (
                      <div className="border border-zinc-200 rounded-sm overflow-hidden shadow-sm">
                        <table className="w-full border-collapse">
                          <thead className="bg-zinc-50 font-['Raleway']">
                            <tr className="h-8 border-b border-zinc-200">
                              <th className="px-3 border-r border-zinc-200 text-left w-10 bg-zinc-50"><input type="checkbox" checked={selectedSandwichDays.size === allPotentialSandwiches.length} onChange={(e) => {
                                if (e.target.checked) setSelectedSandwichDays(new Set(allPotentialSandwiches.map(s => `${s.empId}_${s.date}`)));
                                else setSelectedSandwichDays(new Set());
                              }} className="w-3 h-3 rounded border-zinc-300" /></th>
                              <th className="px-3 border-r border-zinc-200 text-left text-[10px] font-black uppercase text-emerald-600 tracking-widest">Staff Name</th>
                              <th className="px-3 border-r border-zinc-200 text-center text-[10px] font-black uppercase text-emerald-600 tracking-widest w-32">Sandwich Date</th>
                              <th className="px-3 border-r border-zinc-200 text-center text-[10px] font-black uppercase text-emerald-600 tracking-widest w-32">Type</th>
                              <th className="px-3 text-center text-[10px] font-black uppercase text-emerald-600 tracking-widest w-32">Financial Impact</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-zinc-200 bg-white">
                            {allPotentialSandwiches.map(s => (
                              <tr key={`${s.empId}_${s.date}`} className="h-[32px] hover:bg-sky-50/30 transition-colors">
                                <td className="px-3 border-r border-zinc-100"><input type="checkbox" checked={selectedSandwichDays.has(`${s.empId}_${s.date}`)} onChange={() => {
                                  const next = new Set(selectedSandwichDays);
                                  if (next.has(`${s.empId}_${s.date}`)) next.delete(`${s.empId}_${s.date}`);
                                  else next.add(`${s.empId}_${s.date}`);
                                  setSelectedSandwichDays(next);
                                }} className="w-3 h-3 rounded border-zinc-300" /></td>
                                <td className="px-3 border-r border-zinc-100 font-bold text-slate-900 uppercase text-[11px]">{s.empName}</td>
                                <td className="px-3 border-r border-zinc-100 text-center font-mono text-[11px] font-bold text-zinc-600">{formatDateDDMMYYYY(s.date)}</td>
                                <td className="px-3 border-r border-zinc-100 text-center"><span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase border ${s.type === 'Sunday' ? 'bg-indigo-50 text-indigo-700 border-indigo-100' : 'bg-amber-50 text-amber-700 border-amber-100'}`}>{s.type}</span></td>
                                <td className="px-3 text-center text-rose-600 font-black text-[11px]">+1 Day LOP</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  {/* History Section */}
                  <div className="flex-1 flex flex-col">
                    <div className="flex justify-between items-center mb-4">
                      <div>
                        <h2 className="text-sm font-black uppercase text-slate-800 tracking-tight font-['Raleway']">Applied History</h2>
                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-tight">Record of processed sandwich deductions.</p>
                      </div>
                      <div className="w-64">
                        <EmployeeSearchableDropdown employees={employees} selectedId={sandwichHistoryFilterEmp} onSelect={setSandwichHistoryFilterEmp} />
                      </div>
                    </div>
                    {isHistoryLoading || !employees.length ? <div className="py-20 text-center"><Spinner /></div> : (
                      <div className="flex-1 overflow-auto border border-zinc-200 rounded-sm shadow-sm">
                        <table className="w-full border-collapse">
                          <thead className="sticky top-0 bg-zinc-50 font-['Raleway'] shadow-sm z-10">
                            <tr className="h-8 border-b border-zinc-200">
                              <th className="px-3 border-r border-zinc-200 text-left text-[10px] font-black uppercase text-emerald-600 tracking-widest">Staff Name</th>
                              <th className="px-3 border-r border-zinc-200 text-center text-[10px] font-black uppercase text-emerald-600 tracking-widest w-32">Date</th>
                              <th className="px-3 border-r border-zinc-200 text-center text-[10px] font-black uppercase text-emerald-600 tracking-widest w-48">Applied On</th>
                              <th className="px-3 text-center text-[10px] font-black uppercase text-emerald-600 tracking-widest w-20">Action</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-zinc-200 bg-white">
                            {filteredHistory.length === 0 ? (
                              <tr><td colSpan={4} className="py-20 text-center text-slate-300 font-black uppercase tracking-widest text-[10px]">No records found</td></tr>
                            ) : filteredHistory.map(h => (
                              <tr key={h.id} className="h-[32px] hover:bg-sky-50/30 transition-colors">
                                <td className="px-3 border-r border-zinc-100 font-bold text-slate-900 uppercase text-[11px]">{(() => {
                                  const emp = employees.find(e => e.id === h.employeeId);
                                  return emp?.name || 'Unknown staff';
                                })()}</td>
                                <td className="px-3 border-r border-zinc-100 text-center font-mono text-[11px] font-bold text-zinc-600">{formatDateDDMMYYYY(h.date)}</td>
                                <td className="px-3 border-r border-zinc-100 text-center text-slate-400 text-[10px] font-bold uppercase">{h.appliedAt?.toDate ? h.appliedAt.toDate().toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' }) : '-'}</td>
                                <td className="px-3 text-center">
                                  <button 
                                    onClick={() => {
                                      setSelectedHistoryItem(h);
                                      setShowFallbackModal(true);
                                    }}
                                    className="p-1 text-zinc-300 hover:text-rose-600 transition-all"
                                  >
                                    <Trash2 size={12} />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
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
                              ['sno', 'empNo', 'days', 'worked', 'sundays', 'sunWorked', 'holidayWorked', 'hd', 'lop', 'paidDays'].includes(c.id) ? 'text-center' : 
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
      
      {/* OT Escalation Modal */}
      <OTEscalationModal 
        isOpen={isOtModalOpen} 
        onClose={() => setIsOtModalOpen(false)} 
        month={summaryMonth} 
        employees={attendanceSummaryData} 
        initialAdjustments={attendanceSummaryData.reduce((acc, e) => ({ ...acc, [e.id]: e.otAdjustment }), {})} 
        orgId={user?.orgId}
      />

      {/* Fallback Status Selection Modal */}
      {showFallbackModal && selectedHistoryItem && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[200]">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4 shadow-2xl">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Choose Fallback Status</h3>
            <p className="text-sm text-gray-600 mb-6">
              When deleting this sandwich deduction for {employees.find(e => e.id === selectedHistoryItem.employeeId)?.name || 'Unknown staff'} on {formatDateDDMMYYYY(selectedHistoryItem.date)}, 
              what status should be applied to this day?
            </p>
            <div className="space-y-3">
              <button
                onClick={async () => {
                  try {
                    await deleteDoc(doc(db, 'organisations', user.orgId, 'sandwichDeductions', selectedHistoryItem.id));
                    const attendanceQuery = query(
                      collection(db, 'organisations', user.orgId, 'attendance'),
                      where('employeeId', '==', selectedHistoryItem.employeeId),
                      where('date', '==', selectedHistoryItem.date)
                    );
                    const attendanceSnap = await getDocs(attendanceQuery);
                    if (!attendanceSnap.empty) {
                      await updateDoc(doc(db, 'organisations', user.orgId, 'attendance', attendanceSnap.docs[0].id), {
                        status: 'Holiday',
                        isAbsent: false
                      });
                    }
                    queryClient.invalidateQueries(['sandwichHistory']);
                    queryClient.invalidateQueries(['attendanceSummary']);
                    setShowFallbackModal(false);
                    setSelectedHistoryItem(null);
                    alert('Deduction deleted and marked as Holiday!');
                  } catch (err) { alert('Error: ' + err.message); }
                }}
                className="w-full px-4 py-3 bg-amber-600 text-white rounded-lg font-semibold hover:bg-amber-700 transition-colors"
              >
                Mark as Holiday
              </button>
              <button
                onClick={async () => {
                  try {
                    await deleteDoc(doc(db, 'organisations', user.orgId, 'sandwichDeductions', selectedHistoryItem.id));
                    const attendanceQuery = query(
                      collection(db, 'organisations', user.orgId, 'attendance'),
                      where('employeeId', '==', selectedHistoryItem.employeeId),
                      where('date', '==', selectedHistoryItem.date)
                    );
                    const attendanceSnap = await getDocs(attendanceQuery);
                    if (!attendanceSnap.empty) {
                      await updateDoc(doc(db, 'organisations', user.orgId, 'attendance', attendanceSnap.docs[0].id), {
                        status: 'Present',
                        isAbsent: false
                      });
                    }
                    queryClient.invalidateQueries(['sandwichHistory']);
                    queryClient.invalidateQueries(['attendanceSummary']);
                    setShowFallbackModal(false);
                    setSelectedHistoryItem(null);
                    alert('Deduction deleted and marked as Worked!');
                  } catch (err) { alert('Error: ' + err.message); }
                }}
                className="w-full px-4 py-3 bg-emerald-600 text-white rounded-lg font-semibold hover:bg-emerald-700 transition-colors"
              >
                Mark as Worked (1x)
              </button>
              <button
                onClick={() => { setShowFallbackModal(false); setSelectedHistoryItem(null); }}
                className="w-full px-4 py-3 bg-gray-200 text-gray-800 rounded-lg font-semibold hover:bg-gray-300 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
