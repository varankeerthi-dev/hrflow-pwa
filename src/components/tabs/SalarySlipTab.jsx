import React, { useState, useEffect, useRef, useMemo } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { useEmployees } from '../../hooks/useEmployees'
import { useSalarySlab } from '../../hooks/useSalarySlab'
import { db } from '../../lib/firebase'
import { collection, query, where, getDocs, orderBy, limit, addDoc, serverTimestamp, setDoc, doc, getDoc, updateDoc, deleteDoc } from 'firebase/firestore'
import { formatINR, numberToWords } from '../../lib/salaryUtils'
import Spinner from '../ui/Spinner'
import { Wallet, Search, Download, Plus, Minus, History, Settings, AlertCircle, Info, X, CheckCircle2, Edit2, Trash2, Banknote, Clock, ChevronLeft, ChevronRight, FileText, Calendar as CalendarIcon, ChevronDown, ChevronUp, RefreshCw, ArrowUpRight, ArrowRight, Save, Table, RotateCcw } from 'lucide-react'
import { Document, Page, Text, View, StyleSheet, PDFDownloadLink, Image, Font, pdf } from '@react-pdf/renderer'
import SummaryTab from './SummaryTab'
import { logActivity } from '../../hooks/useActivityLog'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useReactTable, getCoreRowModel, flexRender } from '@tanstack/react-table'
import { useSidebar } from '../../contexts/SidebarContext'
import JSZip from 'jszip'
import { usePayrollRuns } from '../../hooks/usePayrollRuns'
import { isPeriodLocked } from '../../lib/payrollLock'

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

const formatMonthShort = (monthStr) => {
  if (!monthStr) return '-';
  if (monthStr.match(/^\d{4}-\d{2}$/)) {
    const [year, month] = monthStr.split('-');
    const date = new Date(year, parseInt(month) - 1);
    return date.toLocaleDateString('en-US', { month: 'long' });
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

const DetailedSalarySummaryPDF = ({ data, month, orgName, visibleColumns, visibleGroups }) => {
  // Filter to only visible columns and groups
  const activeColumns = visibleColumns;
  const activeGroups = visibleGroups.filter(g =>
    g.columns.some(id => activeColumns.some(c => c.id === id))
  );

  // Calculate total table width based on visible columns
  const colWidth = (id) => {
    const c = activeColumns.find(col => col.id === id);
    if (!c) return 0;
    return c.width * 0.55; // Scale factor for PDF units
  };

  // Calculate total width of all visible columns
  const totalWidth = activeColumns.reduce((sum, c) => sum + colWidth(c.id), 0);

  // Auto-orient: If total width > 550 use A3 landscape, else A4 landscape
  // If it fits in A4 portrait (under 480) use A4 portrait
  let pageSize = 'A4';
  let orientation = 'landscape';
  if (totalWidth > 700) {
    pageSize = 'A3';
    orientation = 'landscape';
  } else if (totalWidth <= 480) {
    pageSize = 'A4';
    orientation = 'portrait';
  } else {
    pageSize = 'A4';
    orientation = 'landscape';
  }

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
  };

  // Determine text alignment per column type
  const getAlignment = (colId) => {
    if (colId === 'name' || colId === 'designation') return 'left';
    if (['sno', 'empNo', 'days', 'worked', 'sundays', 'sunWorked', 'holidayWorked', 'otH', 'hd', 'lop', 'paidDays'].includes(colId)) return 'center';
    return 'right'; // All currency values right-aligned
  };

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
      <Page size={pageSize} orientation={orientation} style={{ padding: 12, fontSize: 6, fontFamily: 'Helvetica', color: '#0f172a' }}>
        {/* Header */}
        <View style={{ marginBottom: 10, borderBottomWidth: 1, borderColor: '#0f172a', paddingBottom: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <View>
            <Text style={{ fontSize: 14, fontWeight: 'bold' }}>{orgName}</Text>
            <Text style={{ fontSize: 8, marginTop: 2, textTransform: 'uppercase', letterSpacing: 1 }}>MASTER PAYROLL RECONCILIATION - {formatMonthDisplay(month)}</Text>
          </View>
          <View style={{ textAlign: 'right' }}>
            <Text style={{ fontSize: 6, color: '#64748b' }}>Generated on {new Date().toLocaleDateString()} | {pageSize} {orientation} | {data.length} employees</Text>
          </View>
        </View>

        {/* Table */}
        <View style={{ borderWidth: 0.5, borderColor: '#0f172a' }}>
          {/* Group Headers Row */}
          <View style={{ flexDirection: 'row', backgroundColor: '#f1f5f9', fontWeight: 'bold', borderBottomWidth: 0.5, borderColor: '#0f172a' }}>
            {activeGroups.map(g => {
               const width = g.columns.filter(id => activeColumns.some(c => c.id === id)).reduce((sum, id) => sum + colWidth(id), 0);
               if (width === 0) return null;
               return (
                 <Text key={g.id} style={{ width, padding: 3, borderRightWidth: 0.5, borderColor: '#0f172a', textAlign: 'center', backgroundColor: getGroupColor(g.color), color: g.color === 'green' ? '#ffffff' : '#0f172a', fontSize: 6 }}>
                   {g.label.toUpperCase()}
                 </Text>
               );
            })}
          </View>

          {/* Column Headers Row */}
          <View style={{ flexDirection: 'row', backgroundColor: '#ffffff', fontWeight: 'bold', borderBottomWidth: 0.5, borderColor: '#0f172a' }}>
            {activeColumns.map(c => (
              <Text key={c.id} style={{ width: colWidth(c.id), padding: 2.5, borderRightWidth: 0.5, borderColor: '#cbd5e1', textAlign: getAlignment(c.id), backgroundColor: c.id === 'net' ? '#22c55e' : '#ffffff', color: c.id === 'net' ? '#ffffff' : '#475569', fontSize: 5.5 }}>
                {c.label.replace('\n', ' ').toUpperCase()}
              </Text>
            ))}
          </View>

          {/* Data Rows */}
          {data.map((row, i) => (
            <View key={i} style={{ flexDirection: 'row', borderBottomWidth: 0.5, borderColor: '#e2e8f0', backgroundColor: i % 2 === 0 ? '#ffffff' : '#f8fafc' }}>
              {activeColumns.map(c => (
                <Text key={c.id} style={{ width: colWidth(c.id), padding: 2, borderRightWidth: 0.5, borderColor: '#e2e8f0', textAlign: getAlignment(c.id), fontWeight: c.id === 'name' || c.id === 'net' ? 'bold' : 'normal', backgroundColor: c.id === 'net' ? '#dcfce7' : 'transparent', color: c.id === 'net' ? '#15803d' : '#0f172a' }}>
                  {getPdfVal(c.id, row)}
                </Text>
              ))}
            </View>
          ))}
        </View>

        {/* Footer */}
        <View style={{ marginTop: 8, paddingTop: 6, borderTopWidth: 0.5, borderColor: '#cbd5e1', flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={{ fontSize: 6, color: '#64748b' }}>HRFlow PWA • Confidential Payroll Document</Text>
          <Text style={{ fontSize: 6, color: '#64748b' }}>Page 1 of 1</Text>
        </View>
      </Page>
    </Document>
  )
}

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
  return (<div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
    <div className="bg-white rounded-lg shadow-[0_4px_24px_rgba(0,0,0,0.15)] w-full max-w-2xl flex flex-col max-h-[80vh] overflow-hidden border border-[#e5e5e5]">
      {showSuccess && (
        <div className="absolute inset-0 z-[110] bg-white/90 backdrop-blur-sm flex flex-col items-center justify-center animate-in fade-in duration-300">
          <div className="bg-emerald-100 text-emerald-600 p-4 rounded-full mb-4">
            <CheckCircle2 size={40} />
          </div>
          <h3 className="text-lg font-semibold text-[#171717]">OT Escalation Saved!</h3>
          <p className="text-sm text-[#525252]">Attendance records have been updated.</p>
        </div>
      )}
      <div className="flex items-center justify-between px-5 py-4 border-b border-[#e5e5e5]">
        <div>
          <h2 className="text-sm font-semibold text-[#171717]">OT Escalation</h2>
          <p className="text-[11px] text-[#525252]">{formatMonthDisplay(month)}</p>
        </div>
        <button onClick={onClose} className="p-1 text-[#525252] hover:bg-[#f5f5f5] rounded-md transition-colors">
          <X size={18} />
        </button>
      </div>
      <div className="flex-1 overflow-auto">
        <table className="w-full text-left border-collapse">
          <thead className="sticky top-0 bg-white z-10">
            <tr className="h-10 bg-white border-b border-[#e5e5e5]">
              <th className="px-4 font-semibold text-[12px] text-[#525252]">Staff Member</th>
              <th className="px-4 font-semibold text-[12px] text-[#525252] text-center">Actual (Hrs)</th>
              <th className="px-4 font-semibold text-[12px] text-[#525252] text-center">Adjustment</th>
              <th className="px-4 font-semibold text-[12px] text-[#525252] text-right">Final (Hrs)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#e5e5e5]">
            {employees.map(emp => (
              <tr key={emp.id} className="group h-12 hover:bg-[#f5f5f5] bg-white transition-colors">
                <td className="px-4">
                  <div className="flex flex-col">
                    <span className="text-[14px] font-semibold text-[#171717]">{emp.name}</span>
                  </div>
                </td>
                <td className="px-4 text-center text-[13px] text-[#525252] font-medium">{Number(emp.ot || 0).toFixed(2)}</td>
                <td className="px-4">
                  <div className="flex items-center justify-center gap-1">
                    <button onClick={()=>handleAdjust(emp.id, -0.5)} className="h-6 w-6 flex items-center justify-center border border-[#d4d4d4] rounded hover:bg-[#f5f5f5] text-[#525252] transition-colors">-</button>
                    <input type="number" step="0.5" className="w-12 text-center text-xs border border-[#d4d4d4] rounded py-1 focus:ring-1 focus:border-[#171717] outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:hidden [&::-webkit-inner-spin-button]:hidden" value={adjustments[emp.id] || 0} onChange={e => setAdjustments({...adjustments, [emp.id]: e.target.value})}/>
                    <button onClick={()=>handleAdjust(emp.id, 0.5)} className="h-6 w-6 flex items-center justify-center border border-[#d4d4d4] rounded hover:bg-[#f5f5f5] text-[#525252] transition-colors">+</button>
                  </div>
                </td>
                <td className="px-4 text-right text-[13px] font-semibold text-[#171717] relative">
                  <div className="flex items-center justify-end gap-2">
                    {(Number(emp.ot || 0) + (Number(adjustments[emp.id]) || 0)).toFixed(2)}
                    <button 
                      onClick={() => setAdjustments({...adjustments, [emp.id]: -Number(emp.ot || 0)})}
                      className="p-1.5 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-all opacity-0 group-hover:opacity-100"
                      title="Reset OT to Zero"
                    >
                      <RotateCcw size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="px-5 py-4 border-t border-[#e5e5e5] bg-white flex justify-end gap-3">
        <button onClick={onClose} className="px-4 py-2 text-xs font-medium text-[#525252] hover:bg-[#f5f5f5] rounded-md border border-[#d4d4d4] transition-colors">Cancel</button>
        <button onClick={() => saveMutation.mutate(adjustments)} disabled={saveMutation.isPending || showSuccess} className="px-4 py-2 bg-[#171717] text-white rounded-md text-xs font-medium hover:bg-black transition-colors flex items-center gap-1.5">
          {saveMutation.isPending && <RefreshCw size={12} className="animate-spin" />}
          Save Changes
        </button>
      </div>
    </div>
  </div>)
}

const EmployeeSearchableDropdown = ({ employees, selectedId, onSelect }) => {
  const [searchTerm, setSearchTerm] = useState(''); const [isOpen, setIsOpen] = useState(false); const dropdownRef = useRef(null);
  const filtered = useMemo(() => employees.filter(e => e.name.toLowerCase().includes(searchTerm.toLowerCase())), [employees, searchTerm]);
  useEffect(() => { const handleClickOutside = (e) => { if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setIsOpen(false); }; document.addEventListener('mousedown', handleClickOutside); return () => document.removeEventListener('mousedown', handleClickOutside); }, []);
  return (<div className="relative w-full" ref={dropdownRef}><div className="w-full h-7 border border-zinc-200 rounded-sm px-2 flex items-center justify-between bg-zinc-50 cursor-pointer hover:bg-indigo-50 hover:border-indigo-200 transition-colors" onClick={() => setIsOpen(!isOpen)}><span className="text-[11px] font-semibold text-zinc-900 capitalize">{employees.find(e => e.id === selectedId)?.name?.toLowerCase() || 'Search staff...'}</span><ChevronDown size={10} className="text-zinc-400" /></div>{isOpen && (<div className="absolute top-full left-0 right-0 mt-1 bg-white border border-zinc-200 rounded-lg shadow-2xl z-[100] p-2 animate-in fade-in zoom-in-95 duration-150"><input autoFocus type="text" className="w-full h-8 border border-zinc-100 rounded-md px-2 text-[11px] mb-1 focus:outline-none focus:ring-1 focus:ring-zinc-200" placeholder="Type name..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} /><div className="max-h-60 overflow-auto">{filtered.map(e => (<button key={e.id} className="w-full text-left px-3 py-1.5 text-[11px] hover:bg-indigo-50 hover:text-indigo-700 rounded-md capitalize font-medium text-zinc-700 transition-colors" onClick={() => { onSelect(e.id); setIsOpen(false); }}>{e.name.toLowerCase()}</button>))}</div></div>)}</div>)
}

// --- MAIN COMPONENT ---

export default function SalarySlipTab() {
  const { user } = useAuth(); const { employees } = useEmployees(user?.orgId, true); const { slabs, increments } = useSalarySlab(user?.orgId);
  const { isCollapsed, setIsCollapsed, setIsAutoCollapsed, isAutoCollapsed } = useSidebar();
  const queryClient = useQueryClient();
  const isAdmin = user?.role?.toLowerCase() === 'admin'
  const [activeTab, setActiveTab] = useState('salary-summary')

  // --- PAYROLL RUNS WORKFLOW ---
  const payrollRuns = usePayrollRuns(user?.orgId);
  const [payrollSubTab, setPayrollSubTab] = useState('current'); // 'current' | 'history'
  
  // Fetch active run for the selected summaryMonth
  const { data: activeRun, isLoading: isActiveRunLoading, refetch: refetchActiveRun } = useQuery({
    queryKey: ['activePayrollRun', user?.orgId, summaryMonth],
    queryFn: () => payrollRuns.fetchRun(summaryMonth),
    enabled: !!user?.orgId && !!summaryMonth
  });

  // Fetch slips if the active run exists
  const { data: runSlips = [], isLoading: isSlipsLoading, refetch: refetchRunSlips } = useQuery({
    queryKey: ['payrollRunSlips', user?.orgId, summaryMonth],
    queryFn: () => payrollRuns.fetchRunSlips(summaryMonth),
    enabled: !!user?.orgId && !!summaryMonth && !!activeRun
  });

  // Fetch all runs for the History tab
  const { data: allRuns = [], isLoading: isAllRunsLoading, refetch: refetchAllRuns } = useQuery({
    queryKey: ['allPayrollRuns', user?.orgId],
    queryFn: () => payrollRuns.fetchAllRuns(),
    enabled: !!user?.orgId && payrollSubTab === 'history'
  });

  // State to track a selected past run for detailed viewing
  const [selectedPastRunId, setSelectedPastRunId] = useState(null);
  const { data: pastRunSlips = [], isLoading: isPastSlipsLoading } = useQuery({
    queryKey: ['pastPayrollRunSlips', user?.orgId, selectedPastRunId],
    queryFn: () => payrollRuns.fetchRunSlips(selectedPastRunId),
    enabled: !!user?.orgId && !!selectedPastRunId
  });

  const selectedPastRun = useMemo(() => {
    return allRuns.find(r => r.id === selectedPastRunId);
  }, [allRuns, selectedPastRunId]);

  const handleInitiateRun = async () => {
    if (!attendanceSummaryData.length) {
      alert('Cannot initiate payroll: No calculated employee data for this month.');
      return;
    }
    const [y, m] = summaryMonth.split('-').map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    const startDate = `${summaryMonth}-01`;
    const endDate = `${summaryMonth}-${String(lastDay).padStart(2, '0')}`;
    
    if (window.confirm(`Initiate Draft Payroll Run for ${formatMonthDisplay(summaryMonth)} (${startDate} to ${endDate})?`)) {
      try {
        setLoading(true);
        await payrollRuns.initiatePayrollRun({
          month: summaryMonth,
          startDate,
          endDate,
          createdBy: user.uid,
          userName: user.name,
          employeeSlips: attendanceSummaryData
        });
        alert('Payroll run initiated successfully!');
        refetchActiveRun();
      } catch (err) {
        alert('Failed to initiate run: ' + err.message);
      } finally {
        setLoading(false);
      }
    }
  };

  const handleResync = async () => {
    if (!activeRun) return;
    if (activeRun.status !== 'draft') {
      alert('Cannot re-sync: Only draft runs can be re-synced.');
      return;
    }
    if (window.confirm('Re-sync payroll calculations with live database? This will reload attendance, leaves, advances, and expenses.')) {
      try {
        setLoading(true);
        await refetchSummary();
        await payrollRuns.resyncPayrollRun(summaryMonth, attendanceSummaryData, user.uid);
        alert('Payroll run re-synced successfully!');
        refetchActiveRun();
        refetchRunSlips();
      } catch (err) {
        alert('Failed to re-sync: ' + err.message);
      } finally {
        setLoading(false);
      }
    }
  };

  const handleStatusChange = async (newStatus, actionLabel) => {
    if (!activeRun) return;
    const note = newStatus === 'draft' ? window.prompt('Enter reason for unlocking/reverting:') : '';
    if (newStatus === 'draft' && note === null) return;
    
    if (window.confirm(`Are you sure you want to change payroll status to ${newStatus}?`)) {
      try {
        setLoading(true);
        if (newStatus === 'locked') {
          await refetchSummary();
          await payrollRuns.resyncPayrollRun(summaryMonth, attendanceSummaryData, user.uid);
        }
        await payrollRuns.updateRunStatus(summaryMonth, newStatus, {
          action: actionLabel,
          performedBy: user.name,
          userId: user.uid,
          note
        });
        alert(`Payroll status updated to ${newStatus}!`);
        refetchActiveRun();
        refetchRunSlips();
        refetchAllRuns();
      } catch (err) {
        alert('Failed to update status: ' + err.message);
      } finally {
        setLoading(false);
      }
    }
  };
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
  const [isOtModalOpen, setIsOtModalOpen] = useState(false)
  const [variablePayData, setVariablePayData] = useState({})
  const [variableEntryDate, setVariableEntryDate] = useState(() => new Date().toISOString().split('T')[0])
  const [showAddVariable, setShowAddVariable] = useState(false)
  const [newVariable, setNewVariable] = useState({ employeeId: '', date: '', endDate: '', isRange: false, food: '', convenience: '', bonus: '', isSettled: false, selectedEmps: [], selectedAll: false, empData: {} })
  const [variableSearchTerm, setVariableSearchTerm] = useState('')
  const [variableDateFilter, setVariableDateFilter] = useState('')
  const [variableViewGroup, setVariableViewGroup] = useState('individual') // 'individual' | 'staff' | 'date'
  const [expandedVariableGroups, setExpandedVariableGroups] = useState(new Set())
  const [variableDrafts, setVariableDrafts] = useState({}) // { docId: { food, convenience, bonus, isSettled } }
  const [editingVariable, setEditingVariable] = useState(null)
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

  // --- LOAN STATES ---
  const [loanActiveModule, setLoanActiveModule] = useState('Active Schedules')
  const [loanForm, setEditLoanForm] = useState({ employeeId: '', totalAmount: '', emiAmount: '', remarks: '' })
  const [editingLoanId, setEditingLoanId] = useState(null)
  const [selectedLoan, setSelectedLoan] = useState(null)
  const [overrideForm, setOverrideForm] = useState({ month: new Date().toISOString().slice(0, 7), amount: '', skip: false })

  // --- LOAN QUERIES ---
  const { data: loans = [], refetch: refetchLoans } = useQuery({
    queryKey: ['loans', user?.orgId],
    queryFn: async () => {
      const q = query(collection(db, 'organisations', user.orgId, 'loans'), where('status', '==', 'Active'))
      const snap = await getDocs(q)
      return snap.docs.map(d => ({ id: d.id, ...d.data() }))
    },
    enabled: !!user?.orgId
  })

  const { data: loanActivities = [] } = useQuery({
    queryKey: ['loanActivities', user?.orgId],
    queryFn: async () => {
      // Fetch latest logs without where clause to avoid index requirement
      const q = query(collection(db, 'organisations', user.orgId, 'activityLogs'), orderBy('timestamp', 'desc'), limit(100))
      const snap = await getDocs(q)
      // Filter for 'Loan' module in memory
      return snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(act => act.module === 'Loan')
        .slice(0, 15)
    },
    enabled: !!user?.orgId
  })

  const { data: loanOverrides = [] } = useQuery({
    queryKey: ['loanOverrides', user?.orgId],
    queryFn: async () => {
      const snap = await getDocs(collection(db, 'organisations', user.orgId, 'loanOverrides'))
      return snap.docs.map(d => ({ id: d.id, ...d.data() }))
    },
    enabled: !!user?.orgId
  })

  // Pre-populate override form when loan is selected
  useEffect(() => {
    if (selectedLoan && loanOverrides) {
      const thisMonth = new Date().toISOString().slice(0, 7)
      const existingOverride = loanOverrides.find(o => o.loanId === selectedLoan.id && o.month === thisMonth)
      setOverrideForm({
        month: thisMonth,
        amount: existingOverride ? existingOverride.amount : (selectedLoan.emiAmount || ''),
        skip: existingOverride ? existingOverride.skip : false
      })
    }
  }, [selectedLoan, loanOverrides])

  const [loanHistoryFilter, setLoanHistoryFilter] = useState({ employeeId: '', month: '' })

  const handleCreateLoan = async () => {
    if (!loanForm.employeeId || !loanForm.totalAmount || !loanForm.emiAmount) return alert('Fill required fields')
    setLoading(true)
    try {
      const emp = employees.find(e => e.id === loanForm.employeeId)
      const payload = {
        ...loanForm,
        employeeName: emp?.name,
        remainingAmount: Number(loanForm.totalAmount),
        status: 'Active',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      }
      if (editingLoanId) {
        await updateDoc(doc(db, 'organisations', user.orgId, 'loans', editingLoanId), payload)
        await logActivity(user.orgId, user, { module: 'Loan', action: 'Updated', detail: `Updated loan schedule for ${emp.name}` })
      } else {
        await addDoc(collection(db, 'organisations', user.orgId, 'loans'), payload)
        await logActivity(user.orgId, user, { module: 'Loan', action: 'Created', detail: `Activated new loan for ${emp.name} - ₹${loanForm.totalAmount}` })
      }
      alert('Loan schedule saved!')
      setEditLoanForm({ employeeId: '', totalAmount: '', emiAmount: '', remarks: '' })
      setEditingLoanId(null)
      setLoanActiveModule('Active Schedules')
      refetchLoans()
    } catch (e) { alert(e.message) } finally { setLoading(false) }
  }

  const handleEditLoan = (l) => {
    setEditLoanForm({ employeeId: l.employeeId, totalAmount: l.totalAmount, emiAmount: l.emiAmount, remarks: l.remarks })
    setEditingLoanId(l.id)
    setLoanActiveModule('Configuration')
  }

  const handleDeleteLoan = async (id, name) => {
    if (!window.confirm(`Delete loan schedule for ${name}?`)) return
    try {
      await updateDoc(doc(db, 'organisations', user.orgId, 'loans', id), { status: 'Deleted', updatedAt: serverTimestamp() })
      await logActivity(user.orgId, user, { module: 'Loan', action: 'Deleted', detail: `Cancelled loan recovery for ${name}` })
      refetchLoans()
    } catch (e) { alert(e.message) }
  }

  const handleUpdateOverride = async (loanId) => {
    if (!overrideForm.month || (!overrideForm.skip && !overrideForm.amount)) return alert('Fill adjustment details')
    if (await isPeriodLocked(user.orgId, overrideForm.month)) {
      alert(`Cannot apply adjustment: The period for ${formatMonthDisplay(overrideForm.month)} is locked under a finalized Payroll run.`);
      return;
    }
    try {
      const docId = `${loanId}_${overrideForm.month}`
      await setDoc(doc(db, 'organisations', user.orgId, 'loanOverrides', docId), {
        loanId,
        month: overrideForm.month,
        amount: overrideForm.skip ? 0 : Number(overrideForm.amount),
        skip: overrideForm.skip,
        updatedAt: serverTimestamp()
      })
      alert('Adjustment applied!')
      setSelectedLoan(null)
      setOverrideForm({ month: new Date().toISOString().slice(0, 7), amount: '', skip: false })
    } catch (e) { alert(e.message) }
  }

  const { data: orgData } = useQuery({
    queryKey: ['organisation', user?.orgId],
    queryFn: async () => {
      const snap = await getDoc(doc(db, 'organisations', user.orgId));
      return snap.exists() ? snap.data() : {};
    },
    enabled: !!user?.orgId
  });

  useEffect(() => {
    if (!user?.orgId || !user?.uid) return
    const fetchUserSettings = async () => {
      try {
        const userPrefSnap = await getDoc(doc(db, 'organisations', user.orgId, 'userPreferences', user.uid));
        
        if (orgData) {
          if (orgData.employeeRowOrder) setEmployeeRowOrder(orgData.employeeRowOrder)
          if (orgData.logoURL) setOrgLogo(orgData.logoURL)
        }

        if (userPrefSnap.exists()) {
          const data = userPrefSnap.data()
          if (data.detailedSummaryColumns) setSelectedDetailedColumns(data.detailedSummaryColumns)
        } else {
          if (orgData?.detailedSummaryColumns) setSelectedDetailedColumns(orgData.detailedSummaryColumns)
        }
      } catch (err) { console.error('Error fetching settings:', err) }
    }
    fetchUserSettings()
  }, [user?.orgId, user?.uid, orgData])

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
      return snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(v => v.food || v.convenience || v.bonus);
    },
    enabled: !!user?.orgId
  });

  const saveVariablesMutation = useMutation({
    mutationFn: async (data) => {
      const batch = [];
      const getDatesInRange = (startDate, endDate) => {
        const dates = [];
        let curr = new Date(startDate);
        const end = new Date(endDate);
        while (curr <= end) {
          dates.push(curr.toISOString().split('T')[0]);
          curr.setDate(curr.getDate() + 1);
        }
        return dates;
      };

      for (const [empId, values] of Object.entries(data)) {
        const emp = sortedEmployees.find(e => e.id === empId);
        const dates = (newVariable.isRange && newVariable.endDate) 
          ? getDatesInRange(values.date || variableEntryDate, newVariable.endDate)
          : [values.date || variableEntryDate];

        for (const entryDate of dates) {
          const currentMonth = entryDate.substring(0, 7);
          if (await isPeriodLocked(user.orgId, currentMonth)) {
            throw new Error(`Cannot save variable pay: The period for ${formatMonthDisplay(currentMonth)} is locked under a finalized Payroll run.`);
          }
          const docId = `${entryDate}_${empId}`;
          batch.push(setDoc(doc(db, 'organisations', user.orgId, 'variablePayLogs', docId), {
            employeeId: empId,
            employeeName: emp?.name || values.employeeName || '',
            date: entryDate,
            month: currentMonth,
            food: Number(values.food || 0),
            convenience: Number(values.convenience || 0),
            bonus: Number(values.bonus || 0),
            isSettled: !!values.isSettled,
            updatedAt: serverTimestamp(),
            updatedBy: user.uid
          }, { merge: true }));
        }
      }
      await Promise.all(batch);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['dailyVariablePay']);
      queryClient.invalidateQueries(['monthlyVariableSums']);
      queryClient.invalidateQueries(['attendanceSummary']);
      alert('Variable pay records processed successfully!');
    },
    onError: (err) => alert('Failed to save: ' + err.message)
  });

  const deleteVariableMutation = useMutation({
    mutationFn: async (docId) => {
      const entryDate = docId.split('_')[0];
      const currentMonth = entryDate.substring(0, 7);
      if (await isPeriodLocked(user.orgId, currentMonth)) {
        throw new Error(`Cannot delete variable pay: The period for ${formatMonthDisplay(currentMonth)} is locked under a finalized Payroll run.`);
      }
      await deleteDoc(doc(db, 'organisations', user.orgId, 'variablePayLogs', docId));
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['monthlyVariableSums']);
      queryClient.invalidateQueries(['attendanceSummary']);
    },
    onError: (err) => alert('Failed to delete: ' + err.message)
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

  const monthInputRef = useRef(null)

  useEffect(() => { setDetectedSandwiches([]); setSelectedSandwichDays(new Set()); }, [summaryMonth])

  useEffect(() => { 
    if (activeTab === 'salary-summary' && summarySubTab === 'detailed') { 
      if (!isCollapsed) { 
        setIsCollapsed(true); 
        setIsAutoCollapsed(true); 
      } 
    } else { 
      if (isAutoCollapsed) { 
        setIsCollapsed(false); 
        setIsAutoCollapsed(false); 
      } 
    } 
  }, [activeTab, summarySubTab])

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
      const payrollVersion = orgData?.payrollVersions?.[summaryMonth] || 'legacy';
      
      // Aggregate variable pay logs for the month (only if not settled separately)
      const allVariables = {};
      varSnap.docs.forEach(d => {
        const row = d.data();
        if (row.isSettled) return; // Skip if paid via GPay/Cash separately
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
        const holDatesList = []
        const lopDatesList = []
        const sunWDatesList = []
        const holWDatesList = []
        const otDatesList = []
        const appliedForThisEmp = appliedSandwiches.filter(s => s.employeeId === emp.id);

        const normalizedJoined = normalizeDate(emp.joinedDate)
        const normalizedInactive = normalizeDate(emp.inactiveFrom)

        for (let i = 1; i <= end; i++) {
          const dateStr = `${summaryMonth}-${String(i).padStart(2, '0')}`, d = new Date(y, m - 1, i), isS = d.getDay() === 0, isSat = d.getDay() === 6, isH = holidayDates.has(dateStr) && !isS, r = attByDate.get(dateStr), status = String(r?.status || '').toLowerCase()
          
          if (normalizedJoined && dateStr < normalizedJoined) {
            lop++; lopDatesList.push(i);
            continue;
          }
          if (normalizedInactive && dateStr > normalizedInactive) {
            lop++; lopDatesList.push(i);
            continue;
          }
          
          if (isS) sunCount++
          if (isH) { holCount++; holDatesList.push(i); }

          // Sandwich Rule
          if (!emp.hideInAttendance && (isS || isH || (isSat && isSaturdayHoliday))) {
            if (appliedForThisEmp.some(s => s.date === dateStr)) {
              lop++; lopDatesList.push(i);
              if (payrollVersion === 'v2') {
                if (isS) sunCount--;
                else if (isH) holCount--;
              }
              continue; 
            }
          }
          
          const isPresent = isWorkedAttendanceRecord(r) || r?.sundayWorked || r?.holidayWorked || status === 'sunworked'
          const isHD = status === 'half-day' || r?.isHalfDay

          if (status === 'absent' || r?.isAbsent || status === 'leave') { 
            lop++; lopDatesList.push(i); 
            if (payrollVersion === 'v2') {
              if (isS) sunCount--;
              else if (isH) holCount--;
            }
          }
          else if (isHD) { 
            hd++; lop += 0.5; lopDatesList.push(i);
            if (isS) { 
              sunW += 0.5; sunWDatesList.push(i); 
              if (payrollVersion === 'v2') sunCount -= 0.5;
            } 
            else if (isH) { 
              holW += 0.5; holWDatesList.push(i); 
              if (payrollVersion === 'v2') holCount -= 0.5;
            } 
            else worked += 0.5;
          } 
          else if (isS) { if (isPresent) { sunW++; sunWDatesList.push(i); } }
          else if (isH) { if (isPresent) { holW++; holWDatesList.push(i); } }
          else if (isPresent) worked++; 
          else if (!isS && !isH) { lop++; lopDatesList.push(i); }

          if (r?.otHours) { 
            const [h, mi] = r.otHours.split(':').map(Number); 
            const totalMins = (h || 0) * 60 + (mi || 0);
            const roundedMins = Math.ceil(totalMins / 5) * 5;
            const otHrs = roundedMins / 60;
            otH += otHrs;
            if (otHrs > 0) otDatesList.push({ date: i, hours: otHrs.toFixed(2) });
          }
        }

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
        return { sno: idx + 1, id: emp.id, name: emp.name, empId: emp.empCode || emp.id.slice(0, 5), designation: emp.designation || '-', totalDays: end, worked, sundays: sunCount, holidays: holCount, holidayDates: holDatesList, lopDates: lopDatesList, sunWDates: sunWDatesList, holWDates: holWDatesList, otDates: otDatesList, sunW, holW, leave, hd, lop, paidDays, fullBasic, fullHra, basic, hra, sunPay, holPay, otPay, ot: otH, otAdjustment: otAdjs[emp.id] || 0, totalEarnings, pf, esi, loanE, fine, advanceAmount: adv, expenseAmount: reimb, totalDeductions, netAdvanceExpense, salary: { net: finalNet }, appliedSandwichDays: appliedForThisEmp, food: foodP, convenience: convP, bonus: bonusP }
      })
    }, enabled: !!user?.orgId && sortedEmployees.length > 0 && activeTab === 'salary-summary'
  })

  // --- PAYROLL DATA ARCHIVE AND STATUS SNAPSHOT MAPS ---
  const displayData = useMemo(() => {
    // If viewing a past run from history
    if (payrollSubTab === 'history' && selectedPastRunId && pastRunSlips?.length > 0) {
      return pastRunSlips.map(s => s.rawRowData || {
        sno: s.sno || 1,
        id: s.employeeId,
        name: s.employeeName,
        empId: s.employeeId.slice(0, 5),
        designation: s.designation,
        totalDays: s.totalDays,
        worked: s.worked,
        sundays: s.sundayWorked,
        holidays: s.holidayWorked,
        lop: s.lop,
        paidDays: s.paidDays,
        fullBasic: s.fullBasic,
        fullHra: s.fullHra,
        basic: s.basicPaid,
        hra: s.hraPaid,
        ot: s.otHours,
        otPay: s.otPay,
        sunW: s.sundayWorked,
        sunPay: s.sundayPay,
        holW: s.holidayWorked,
        holPay: s.holidayPay,
        totalEarnings: s.totalEarnings,
        pf: s.pf,
        esi: s.esi,
        loanE: s.loan,
        fine: s.fine,
        advanceAmount: s.advanceAmount,
        expenseAmount: s.expenseAmount,
        netAdvanceExpense: s.advanceAmount - s.expenseAmount,
        salary: { net: s.netPayout }
      });
    }

    // If active run is review, approved, or locked (snapshots preferred over live computations)
    if (payrollSubTab === 'current' && activeRun && (activeRun.status === 'locked' || activeRun.status === 'approved' || activeRun.status === 'review') && runSlips?.length > 0) {
      return runSlips.map(s => s.rawRowData || {
        sno: s.sno || 1,
        id: s.employeeId,
        name: s.employeeName,
        empId: s.employeeId.slice(0, 5),
        designation: s.designation,
        totalDays: s.totalDays,
        worked: s.worked,
        sundays: s.sundayWorked,
        holidays: s.holidayWorked,
        lop: s.lop,
        paidDays: s.paidDays,
        fullBasic: s.fullBasic,
        fullHra: s.fullHra,
        basic: s.basicPaid,
        hra: s.hraPaid,
        ot: s.otHours,
        otPay: s.otPay,
        sunW: s.sundayWorked,
        sunPay: s.sundayPay,
        holW: s.holidayWorked,
        holPay: s.holidayPay,
        totalEarnings: s.totalEarnings,
        pf: s.pf,
        esi: s.esi,
        loanE: s.loan,
        fine: s.fine,
        advanceAmount: s.advanceAmount,
        expenseAmount: s.expenseAmount,
        netAdvanceExpense: s.advanceAmount - s.expenseAmount,
        salary: { net: s.netPayout }
      });
    }

    // Default to computed live records
    return attendanceSummaryData;
  }, [payrollSubTab, selectedPastRunId, pastRunSlips, activeRun, runSlips, attendanceSummaryData]);

  const filteredAttendanceSummaryData = useMemo(() => summaryFilterEmpId ? displayData.filter(e => e.id === summaryFilterEmpId) : displayData, [displayData, summaryFilterEmpId])
  
  const dynamicNameWidth = useMemo(() => {
    if (!filteredAttendanceSummaryData.length) return 140;
    const maxChars = Math.max(...filteredAttendanceSummaryData.map(e => (e.name || '').length), 10);
    return Math.min(Math.max(maxChars * 7.5 + 20, 120), 300);
  }, [filteredAttendanceSummaryData]);

  const visibleDetailedSummaryColumns = useMemo(() => {
    let currentLeft = 0;
    const stickyIds = ['sno', 'empNo', 'name', 'designation'];
    
    return DETAILED_SUMMARY_COLUMNS
      .filter(c => selectedDetailedColumns.includes(c.id))
      .map(c => {
        const colWidth = c.id === 'name' ? dynamicNameWidth : c.width;
        const isSticky = stickyIds.includes(c.id);
        const leftOffset = isSticky ? currentLeft : undefined;
        
        if (isSticky) {
          currentLeft += colWidth;
        }
        
        return { ...c, width: colWidth, leftOffset };
      });
  }, [selectedDetailedColumns, dynamicNameWidth]);
  
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
      case 'name': return <span className="font-bold text-gray-900">{emp.name}</span>;
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
      if (color === 'blue') return 'bg-blue-50/30';
      if (color === 'purple') return 'bg-purple-50/30';
      if (color === 'amber') return 'bg-amber-50/30';
      if (color === 'emerald') return 'bg-emerald-50/30';
      if (color === 'red') return 'bg-red-50/30';
      if (color === 'green') return 'bg-green-600';
      return '';
    }
    if (type === 'border') {
      if (color === 'blue') return 'border-blue-100/50';
      if (color === 'purple') return 'border-purple-100/50';
      if (color === 'amber') return 'border-amber-100/50';
      if (color === 'emerald') return 'border-emerald-100/50';
      if (color === 'red') return 'border-red-100/50';
      return 'border-zinc-100';
    }
    if (type === 'text') {
      if (color === 'green') return 'text-white';
      if (color === 'emerald') return 'text-emerald-900';
      if (color === 'red') return 'text-rose-600';
      if (color === 'purple') return 'text-purple-900';
      if (color === 'blue') return 'text-blue-900';
      return 'text-zinc-700';
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
    
    // Check if the payroll period is locked (either the current run is locked or we're looking at a history run)
    const isLocked = (activeRun?.status === 'locked' && selectedMonth === summaryMonth) || (selectedPastRunId === selectedMonth);
    
    if (isLocked) {
      setLoading(true); setSlipData(null); setAdvExpRows([]);
      try {
        const targetSlips = selectedPastRunId === selectedMonth ? pastRunSlips : runSlips;
        const matched = targetSlips.find(s => s.employeeId === selectedEmp);
        if (matched && matched.rawRowData) {
          setSlipData(matched.rawRowData);
          setGenerated(true);
          const allAE = [];
          if (matched.rawRowData.advanceAmount > 0) {
            allAE.push({ date: `${selectedMonth}-01`, type: 'Advance', amount: matched.rawRowData.advanceAmount });
          }
          if (matched.rawRowData.expenseAmount > 0) {
            allAE.push({ date: `${selectedMonth}-01`, type: 'Expense', amount: matched.rawRowData.expenseAmount });
          }
          setAdvExpRows(allAE);
          setPaySummaryDates({
            sundays: matched.rawRowData.sunWDates || [],
            holidays: matched.rawRowData.holWDates || [],
            leaves: matched.rawRowData.lopDates || []
          });
          return;
        } else {
          throw new Error('Slip snapshot not found for selected staff in this period');
        }
      } catch (err) {
        alert('Failed to load snapshot slip: ' + err.message);
      } finally {
        setLoading(false);
      }
      return;
    }
    
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
      // Use simpler queries to avoid missing index errors
      const [aDataSnap, aeSnap, loanSnap, fineSnap, otAdjSnap, orgSnap, varLogsSnap, sandwichSnap] = await Promise.all([
        getDocs(collection(db, 'organisations', user.orgId, 'attendance')),
        getDocs(collection(db, 'organisations', user.orgId, 'advances_expenses')), 
        getDocs(query(collection(db, 'organisations', user.orgId, 'loans'), where('status', '==', 'Active'))), 
        getDocs(collection(db, 'organisations', user.orgId, 'fines')), 
        getDoc(doc(db, 'organisations', user.orgId, 'otAdjustments', `${selectedMonth}_${selectedEmp}`)),
        getDoc(doc(db, 'organisations', user.orgId)),
        getDocs(collection(db, 'organisations', user.orgId, 'variablePayLogs')),
        getDocs(query(collection(db, 'organisations', user.orgId, 'sandwichDeductions'), where('month', '==', selectedMonth)))
      ]);

      console.log('Data fetched. Processing...');
      
      const appliedSandwiches = sandwichSnap.docs.map(d => d.data());
      const appliedForThisEmp = appliedSandwiches.filter(s => s.employeeId === selectedEmp);

      // Filter attendance in memory
      const aData = aDataSnap.docs
        .map(d => d.data())
        .filter(a => a.employeeId === selectedEmp && a.date >= sd && a.date <= ed);
      const attByDate = new Map(aData.map(a => [a.date, a]));

      const orgData = orgSnap.exists() ? orgSnap.data() : {};
      const holidayList = Array.isArray(orgData.holidays) ? orgData.holidays : [];
      const holidayDates = new Set(holidayList.map(h => h.date).filter(Boolean));
      const saturdayType = orgData.saturdayType || 'working';
      const isSaturdayHoliday = saturdayType !== 'working';

      // Aggregate variable pay logs in memory (only if not settled separately)
      let foodP = 0, convP = 0, bonusP = 0;
      varLogsSnap.docs.forEach(d => {
        const row = d.data();
        if (row.employeeId === selectedEmp && row.month === selectedMonth && !row.isSettled) {
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
        const isSat = d.getDay() === 6;
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

        // Sandwich Rule logic
        if (!emp.hideInAttendance && (isS || isH || (isSat && isSaturdayHoliday))) {
          if (appliedForThisEmp.some(s => s.date === ds)) {
            lop++; leaveDates.push(i);
            if (isS) sunCount--;
            else if (isH) holCount--;
            continue;
          }
        }
        
        const isPresent = isWorkedAttendanceRecord(r) || r?.sundayWorked || r?.holidayWorked || status === 'sunworked';
        const isHD = status === 'half-day' || r?.isHalfDay;

        if (status === 'absent' || r?.isAbsent || status === 'leave') {
          lop++;
          leaveDates.push(i);
          if (isS) sunCount--;
          else if (isH) holCount--;
        }
        else if (isHD) { 
          hd++; lop += 0.5; 
          if (isS) { sunW += 0.5; sunDates.push(i); sunCount -= 0.5; } 
          else if (isH) { holW += 0.5; holDates.push(i); holCount -= 0.5; } 
          else worked += 0.5;
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
        visibleGroups={visibleGroups}
      />).toBlob(); 
      downloadPdfBlob(blob, `Summary_${summaryMonth}.pdf`); 
    } finally { 
      setExportingDetailedPdf(false); 
    } 
  }
  const handleExportSalarySlipPdf = async () => { if (!slipData) return; setExportingSlipPdf(true); try { const blob = await pdf(<SalarySlipPDF data={slipData} orgName={user?.orgName} orgLogo={orgLogo} />).toBlob(); downloadPdfBlob(blob, `Slip_${slipData.employee.name}.pdf`); } finally { setExportingSlipPdf(false); } }

  const handleDownloadAllZipped = async () => {
    if (!displayData.length) return;
    setDownloadAllLoading(true);
    try {
      const zip = new JSZip();
      for (const empSummary of displayData) {
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

  const handleOpenGmail = () => {
    window.open('https://mail.google.com', '_blank');
  }

  const [selectedSandwichDays, setSelectedSandwichDays] = useState(new Set());
  const [processingSandwich, setProcessingSandwich] = useState(false);
  const [sandwichHistoryFilterEmp, setSandwichHistoryFilterEmp] = useState('');
  const [showFallbackModal, setShowFallbackModal] = useState(false);
  const [selectedHistoryItem, setSelectedHistoryItem] = useState(null);
  const [detectedSandwiches, setDetectedSandwiches] = useState([]);
  const [detectingSandwiches, setDetectingSandwiches] = useState(false);
  const [sandwichIncludeFuture, setSandwichIncludeFuture] = useState(false);
  const [showManualSandwichModal, setShowManualSandwichModal] = useState(false);
  const [manualSandwichEntry, setManualSandwichEntry] = useState({ employeeId: '', date: '', type: 'Sunday' });

  const addManualSandwichMutation = useMutation({
    mutationFn: async () => {
      const { employeeId, date, type } = manualSandwichEntry;
      if (!employeeId || !date) {
        throw new Error('Please select employee and date');
      }
      const emp = employees.find(e => e.id === employeeId);
      const entryDate = date;
      const currentMonth = entryDate.substring(0, 7);
      const docId = `${currentMonth}_${employeeId}_${entryDate}`;
      await setDoc(doc(db, 'organisations', user.orgId, 'sandwichDeductions', docId), {
        employeeId,
        employeeName: emp?.name || '',
        month: currentMonth,
        date: entryDate,
        type,
        isManual: true,
        appliedAt: serverTimestamp(),
        appliedBy: user.uid
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['attendanceSummary']);
      queryClient.invalidateQueries(['sandwichHistory']);
      setShowManualSandwichModal(false);
      setManualSandwichEntry({ employeeId: '', date: '', type: 'Sunday' });
      alert('Sandwich rule added successfully!');
    },
    onError: (err) => alert('Failed to add: ' + err.message)
  });
  
  const detectSandwiches = async () => {
    if (!user?.orgId || !attendanceSummaryData.length) return;
    setDetectingSandwiches(true);
    try {
      const [y, m] = summaryMonth.split('-').map(Number);
      const end = new Date(y, m, 0).getDate();
      const today = new Date();
      const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      const orgDoc = await getDoc(doc(db, 'organisations', user.orgId));
      const orgData = orgDoc.exists() ? orgDoc.data() : {};
      const holidayList = Array.isArray(orgData.holidays) ? orgData.holidays : [];
      const holidayDates = new Set(holidayList.map(h => h.date).filter(Boolean));
      const saturdayType = orgData.saturdayType || 'working';
      const isSaturdayHoliday = saturdayType !== 'working';

      const attSnap = await getDocs(collection(db, 'organisations', user.orgId, 'attendance'));
      const allAtt = attSnap.docs.map(d => d.data()).filter(a => a.date >= `${summaryMonth}-01` && a.date <= `${summaryMonth}-${String(end).padStart(2, '0')}`);
      const appliedSnap = await getDocs(query(collection(db, 'organisations', user.orgId, 'sandwichDeductions'), where('month', '==', summaryMonth)));
      const appliedSandwiches = appliedSnap.docs.map(d => d.data());

      const normalizeDate = (dateStr) => {
        if (!dateStr || dateStr === '-') return null;
        const parts = dateStr.split(/[-/]/);
        if (parts.length === 3) {
          if (parts[0].length === 4) return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
          return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
        }
        return dateStr;
      };

      const results = [];
      attendanceSummaryData.forEach(emp => {
        if (emp.hideInAttendance) return;
        const empAtt = allAtt.filter(a => a.employeeId === emp.id);
        const attByDate = new Map(empAtt.map(a => [normalizeDate(a.date), a]));
        const appliedForThisEmp = appliedSandwiches.filter(s => s.employeeId === emp.id);

        const isDateAHoliday = (dateObj) => {
          const ds = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}`;
          const day = dateObj.getDay();
          if (day === 0) return true;
          if (day === 6 && isSaturdayHoliday) return true;
          if (holidayDates.has(ds)) return true;
          return false;
        };

        for (let i = 1; i <= end; i++) {
          const dateStr = `${summaryMonth}-${String(i).padStart(2, '0')}`;
          const d = new Date(y, m - 1, i);
          const isS = d.getDay() === 0;
          const isSat = d.getDay() === 6;
          const isH = holidayDates.has(dateStr) && !isS;
          const r = attByDate.get(dateStr);

          if (!sandwichIncludeFuture && dateStr > todayStr) continue;
          if (!isDateAHoliday(d) || isWorkedAttendanceRecord(r)) continue;

          let prevWorkingDay = new Date(y, m - 1, i - 1);
          while (prevWorkingDay.getDate() > 0 && isDateAHoliday(prevWorkingDay)) prevWorkingDay.setDate(prevWorkingDay.getDate() - 1);
          let nextWorkingDay = new Date(y, m - 1, i + 1);
          while (nextWorkingDay.getDate() <= end && isDateAHoliday(nextWorkingDay)) nextWorkingDay.setDate(nextWorkingDay.getDate() + 1);

          const prevDS = `${prevWorkingDay.getFullYear()}-${String(prevWorkingDay.getMonth() + 1).padStart(2, '0')}-${String(prevWorkingDay.getDate()).padStart(2, '0')}`;
          const nextDS = `${nextWorkingDay.getFullYear()}-${String(nextWorkingDay.getMonth() + 1).padStart(2, '0')}-${String(nextWorkingDay.getDate()).padStart(2, '0')}`;
          const rPrev = attByDate.get(prevDS);
          const rNext = attByDate.get(nextDS);
          const isPrevAbsent = (!rPrev || rPrev.status?.toLowerCase() === 'absent' || rPrev.isAbsent);
          const isNextAbsent = (!rNext || rNext.status?.toLowerCase() === 'absent' || rNext.isAbsent);

          if (isPrevAbsent && isNextAbsent) {
            const isAlreadyApplied = appliedForThisEmp.some(s => s.date === dateStr);
            if (!isAlreadyApplied) {
              const typeLabel = isS ? 'Sunday' : (isSat ? 'Saturday' : 'Holiday');
              results.push({ date: dateStr, type: typeLabel, empId: emp.id, empName: emp.name });
            }
          }
        }
      });

      setDetectedSandwiches(results);
      setSelectedSandwichDays(new Set());
    } finally {
      setDetectingSandwiches(false);
    }
  };

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
      setDetectedSandwiches(prev => prev.filter(s => !selectedSandwichDays.has(`${s.empId}_${s.date}`)));
      alert('Sandwich deductions applied successfully!');
    },
    onError: (err) => alert('Failed to apply: ' + err.message)
  });

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

  const renderHistoryTab = () => {
    if (isAllRunsLoading) return <div className="py-12 text-center"><Spinner /></div>;
    const lockedRuns = allRuns.filter(r => r.status === 'locked');
    return (
      <div className="space-y-4 flex-1 flex flex-col min-h-0 bg-white p-6 rounded-2xl m-4 shadow-sm border border-slate-200 overflow-hidden animate-in fade-in duration-200">
        <div className="flex justify-between items-center shrink-0 mb-2">
          <div>
            <h2 className="text-sm font-black uppercase text-slate-800 tracking-tight">Locked Payroll Archives</h2>
            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-tight">Review locked calculations, audit trials, and print past slips.</p>
          </div>
        </div>
        
        <div className="flex-1 overflow-auto border border-zinc-200 rounded-lg shadow-sm">
          <table className="w-full text-left border-collapse text-[11px]">
            <thead>
              <tr className="bg-slate-50 h-10 border-b border-zinc-200 font-semibold text-slate-600">
                <th className="px-4 py-2 uppercase tracking-wider">Payroll Period</th>
                <th className="px-4 py-2 uppercase tracking-wider">Date Range</th>
                <th className="px-4 py-2 uppercase tracking-wider text-center">Headcount</th>
                <th className="px-4 py-2 uppercase tracking-wider text-right">Total Net Payout</th>
                <th className="px-4 py-2 uppercase tracking-wider text-center">Locked By</th>
                <th className="px-4 py-2 uppercase tracking-wider text-center">Locked Date</th>
                <th className="px-4 py-2 uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200">
              {lockedRuns.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-16 text-center text-slate-400 font-bold uppercase tracking-widest text-[10px]">
                    No locked payroll runs in history.
                  </td>
                </tr>
              ) : lockedRuns.map(run => {
                const lockHistory = run.history?.find(h => h.action === 'locked') || {};
                return (
                  <tr key={run.id} className="hover:bg-slate-50 transition-colors h-12">
                    <td className="px-4 font-bold text-slate-900">{formatMonthDisplay(run.month)}</td>
                    <td className="px-4 text-slate-600">{formatDateDDMMYYYY(run.startDate)} to {formatDateDDMMYYYY(run.endDate)}</td>
                    <td className="px-4 text-center font-bold text-slate-700">{run.totalHeadcount}</td>
                    <td className="px-4 text-right font-black text-slate-900">{formatINR(run.totalNet)}</td>
                    <td className="px-4 text-center font-bold text-indigo-600">{lockHistory.performedBy || 'System'}</td>
                    <td className="px-4 text-center text-slate-400">
                      {lockHistory.timestamp?.toDate 
                        ? new Date(lockHistory.timestamp.toDate()).toLocaleDateString()
                        : (lockHistory.timestamp ? new Date(lockHistory.timestamp).toLocaleDateString() : '-')}
                    </td>
                    <td className="px-4 text-right">
                      <button 
                        onClick={() => {
                          setSelectedPastRunId(run.id);
                          setSummaryMonth(run.month);
                          setPayrollSubTab('current');
                        }}
                        className="px-3 py-1.5 bg-slate-900 text-white font-bold rounded-lg text-[9px] uppercase tracking-wider hover:bg-black active:scale-95 transition-all shadow"
                      >
                        Inspect Sheet
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

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
                className={`flex items-center gap-2.5 px-4 py-2 rounded-lg text-[12px] font-bold tracking-tight transition-all duration-200 hover:scale-105 active:scale-95 ${
                  activeTab === t.id 
                    ? 'text-indigo-600 bg-white shadow-[0_2px_8px_rgba(0,0,0,0.08)] border border-indigo-100/50' 
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
          <div className="w-full space-y-4 h-full flex flex-col overflow-hidden">
            <div className="flex gap-4 items-end shrink-0 mb-2 mt-1">
              <div className="flex-1 max-w-xs">
                <EmployeeSearchableDropdown employees={sortedEmployees} selectedId={selectedEmp} onSelect={setSelectedEmp} />
              </div>
              <div className="w-32">
                <input type="month" value={selectedMonth} onChange={e=>setSelectedMonth(e.target.value)} className="w-full h-7 border-b border-gray-200 text-sm font-normal focus:border-blue-600 outline-none bg-transparent"/>
              </div>
              <div className="flex gap-2">
                <button onClick={handleGenerate} disabled={loading || !selectedEmp} className="h-7 px-4 bg-zinc-800 text-white rounded-sm text-[10px] font-bold uppercase tracking-widest hover:bg-green-600 active:scale-95 transition-all flex items-center gap-2">
                  {loading ? <RefreshCw size={12} className="animate-spin" /> : (generated && <CheckCircle2 size={12} />)}
                  {loading ? 'Generating...' : (generated ? 'Advice Generated' : 'Generate')}
                </button>
                <button onClick={handleDownloadAllZipped} disabled={downloadAllLoading || !attendanceSummaryData.length} className="h-7 px-4 border border-zinc-200 bg-white text-zinc-900 rounded-sm text-[10px] font-bold uppercase tracking-widest hover:bg-zinc-50 active:scale-95 transition-all flex items-center gap-2">
                  {downloadAllLoading ? <RefreshCw size={12} className="animate-spin" /> : <Download size={12} />}
                  {downloadAllLoading ? 'Processing...' : 'Download All (ZIP)'}
                </button>
                <button onClick={handleOpenGmail} className="h-7 px-4 border border-red-100 bg-red-50 text-red-600 rounded-sm text-[10px] font-bold uppercase tracking-widest hover:bg-red-100 active:scale-95 transition-all flex items-center gap-2">
                  <Plus size={12} className="rotate-45" /> Send to Mail
                </button>
              </div>
            </div>
            {slipData && (
              <div className="flex-1 overflow-hidden flex gap-4 animate-in fade-in slide-in-from-bottom-2">
                <div className="flex-1 min-w-0 bg-white rounded-[24px] overflow-hidden flex flex-col h-full print-area" style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}>
                  <div className="flex justify-end gap-2 p-3 no-print shrink-0"><button onClick={() => window.print()} className="h-7 bg-white border border-zinc-200 px-3 rounded-lg text-[10px] font-normal uppercase flex items-center gap-2 hover:bg-zinc-50"><Download size={12}/> Print</button><button onClick={handleExportSalarySlipPdf} disabled={exportingSlipPdf} className="h-7 bg-white border border-zinc-200 px-3 rounded-lg text-[10px] font-normal uppercase flex items-center gap-2 hover:bg-zinc-50"><Download size={12}/> PDF</button></div>
                  <div className="p-8 bg-white overflow-auto flex-1 border-[3px] border-zinc-900 rounded-[24px] m-4">
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
                    <div className="text-center pt-4 border-t border-dashed border-zinc-200"><p className="text-[9px] font-normal text-slate-400 uppercase mb-2">Net Disbursement</p><div className="bg-zinc-50 border border-zinc-100 rounded-xl p-4 inline-block shadow-sm font-normal text-[18px] text-zinc-900">{formatINR(slipData.netPay)}</div><p className="text-[10px] italic text-zinc-500 mt-3 uppercase tracking-tight">Indian Rupee {numberToWords(slipData.netPay)} Only</p></div>
                  </div>
                </div>
                <div className="w-[340px] shrink-0 bg-white border border-zinc-200 rounded-[24px] overflow-hidden flex flex-col h-full shadow-sm">
                  <div className="p-4 bg-zinc-50 border-b border-zinc-100 font-bold uppercase text-[11px] tracking-[0.1em] text-zinc-600">Period Summary</div>
                  <div className="p-5 flex-1 overflow-auto space-y-8">
                    <div className="space-y-4">
                      <div className="flex flex-col gap-1.5 p-3 bg-indigo-50/50 rounded-xl border border-indigo-100/50">
                        <span className="text-[10px] font-black uppercase text-indigo-400 tracking-wider">Sunday Worked (Dates)</span>
                        <div className="flex flex-wrap gap-1">
                          {paySummaryDates.sundays.length > 0 ? paySummaryDates.sundays.map(d => (
                            <span key={d} className="bg-white border border-indigo-200 text-indigo-700 font-bold text-[10px] w-6 h-6 flex items-center justify-center rounded-md shadow-sm">{d}</span>
                          )) : <span className="text-[10px] italic text-slate-400">None</span>}
                        </div>
                      </div>
                      <div className="flex flex-col gap-1.5 p-3 bg-amber-50/50 rounded-xl border border-amber-100/50">
                        <span className="text-[10px] font-black uppercase text-amber-500 tracking-wider">Holiday Worked (Dates)</span>
                        <div className="flex flex-wrap gap-1">
                          {paySummaryDates.holidays.length > 0 ? paySummaryDates.holidays.map(d => (
                            <span key={d} className="bg-white border border-amber-200 text-amber-700 font-bold text-[10px] w-6 h-6 flex items-center justify-center rounded-md shadow-sm">{d}</span>
                          )) : <span className="text-[10px] italic text-slate-400">None</span>}
                        </div>
                      </div>
                      <div className="flex flex-col gap-1.5 p-3 bg-rose-50/50 rounded-xl border border-rose-100/50">
                        <span className="text-[10px] font-black uppercase text-rose-500 tracking-wider">Leave Dates</span>
                        <div className="text-[11px] font-bold text-rose-700">
                          {paySummaryDates.leaves?.length > 0 ? paySummaryDates.leaves.join(', ') : <span className="text-[10px] italic text-slate-400 font-normal">None</span>}
                        </div>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Monthly Vouchers</span>
                      <div className="border border-zinc-100 rounded-xl overflow-hidden shadow-sm">
                        <table className="w-full text-left text-[10px]">
                          <thead>
                            <tr className="bg-zinc-50/50 text-slate-400 uppercase font-black tracking-tighter border-b border-zinc-100">
                              <th className="p-2.5 font-bold">Date</th>
                              <th className="p-2.5 font-bold">Type</th>
                              <th className="p-2.5 text-right font-bold">Amount</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-zinc-50 bg-white">
                            {advExpRows.length === 0 ? (
                              <tr><td colSpan={3} className="py-8 text-center text-slate-300 uppercase font-bold text-[9px] tracking-widest italic bg-white">No vouchers found</td></tr>
                            ) : (
                              advExpRows.map((r, i) => (
                                <tr key={i} className="hover:bg-zinc-50 transition-colors">
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
              </div>
            )}
          </div>
        )}
        {activeTab === 'salary-summary' && (
          <div className="flex-1 flex flex-col min-h-0">
            <div className="flex justify-between items-center py-2 border-b shrink-0 bg-white z-50 px-2">
              <div className="flex gap-4 items-center">
                {/* Current / History Toggle */}
                <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200/60">
                  <button 
                    onClick={() => {
                      setPayrollSubTab('current');
                      setSelectedPastRunId(null);
                    }}
                    className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all uppercase tracking-wider ${
                      payrollSubTab === 'current' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-900'
                    }`}
                  >
                    Active Run
                  </button>
                  <button 
                    onClick={() => {
                      setPayrollSubTab('history');
                      setSelectedPastRunId(null);
                    }}
                    className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all uppercase tracking-wider ${
                      payrollSubTab === 'history' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-900'
                    }`}
                  >
                    History
                  </button>
                </div>

                {payrollSubTab === 'current' && (
                  <>
                    <div className="h-6 w-px bg-slate-200"></div>
                    <div className="flex bg-slate-100/85 p-1.5 rounded-2xl border border-slate-200/60 gap-1">
                      {[
                        {id:'overview',l:'Overview'},
                        {id:'detailed',l:'Detailed Summary'},
                        {id:'variable',l:'Vouchers'},
                        {id:'sandwich',l:'Sandwich Rule'}
                      ].map(t=>(
                        <button 
                          key={t.id} 
                          onClick={()=>setSummarySubTab(t.id)} 
                          className={`px-6 py-2.5 text-[12px] font-black uppercase tracking-wider rounded-xl transition-all duration-200 hover:scale-105 active:scale-95 ${
                            summarySubTab===t.id
                              ? 'bg-white text-indigo-600 shadow-md border border-indigo-100/50'
                              : 'text-slate-500 hover:text-slate-900 hover:bg-white/60'
                          }`}
                        >
                          {t.l}
                        </button>
                      ))}
                    </div>
                  </>
                )}

                {payrollSubTab === 'current' && (
                  <div className="flex items-center bg-gray-100 rounded-md p-1 border border-gray-200">
                    <button onClick={() => { const [y, m] = summaryMonth.split('-').map(Number); const d = new Date(y, m - 2, 1); setSummaryMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`) }} className="p-1 hover:bg-white hover:shadow-sm rounded transition-all text-gray-600"><ChevronLeft size={14} /></button>
                    <input type="month" value={summaryMonth} onChange={e=>setSummaryMonth(e.target.value)} className="h-6 bg-transparent border-0 text-[10px] font-black uppercase outline-none focus:ring-0 w-24 text-center cursor-pointer"/>
                    <button onClick={() => { const [y, m] = summaryMonth.split('-').map(Number); const d = new Date(y, m, 1); setSummaryMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`) }} className="p-1 hover:bg-white hover:shadow-sm rounded transition-all text-gray-600"><ChevronRight size={14} /></button>
                  </div>
                )}

                {payrollSubTab === 'current' && isAdmin && !selectedPastRunId && activeRun && activeRun.status === 'draft' && (
                  <button onClick={handleResync} className="h-7 px-3 bg-indigo-50 text-indigo-700 rounded-lg text-[10px] font-black uppercase tracking-[0.1em] shadow-sm hover:bg-indigo-600 hover:text-white active:scale-95 transition-all">Re-sync Calculations</button>
                )}
                {payrollSubTab === 'current' && isAdmin && !selectedPastRunId && activeRun && (
                  <div className="flex items-center gap-1.5 ml-2">
                    <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Workflow:</span>
                    <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase border ${
                      activeRun.status === 'draft' ? 'bg-zinc-50 text-zinc-500 border-zinc-200' :
                      activeRun.status === 'review' ? 'bg-amber-50 text-amber-600 border-amber-200' :
                      activeRun.status === 'approved' ? 'bg-blue-50 text-blue-600 border-blue-200' :
                      'bg-emerald-50 text-emerald-600 border-emerald-200'
                    }`}>{activeRun.status}</span>
                    {activeRun.status === 'draft' && (
                      <button onClick={() => handleStatusChange('review', 'submitted')} className="h-7 px-3 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-[10px] font-black uppercase tracking-wider shadow-sm transition-all">Submit for Review</button>
                    )}
                    {activeRun.status === 'review' && (
                      <>
                        <button onClick={() => handleStatusChange('approved', 'approved')} className="h-7 px-3 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-[10px] font-black uppercase tracking-wider shadow-sm transition-all">Approve</button>
                        <button onClick={() => handleStatusChange('draft', 'rejected')} className="h-7 px-3 bg-rose-500 hover:bg-rose-600 text-white rounded-lg text-[10px] font-black uppercase tracking-wider shadow-sm transition-all">Reject / Revert</button>
                      </>
                    )}
                    {activeRun.status === 'approved' && (
                      <>
                        <button onClick={() => handleStatusChange('locked', 'locked')} className="h-7 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[10px] font-black uppercase tracking-wider shadow-sm transition-all">Lock & Pay</button>
                        <button onClick={() => handleStatusChange('draft', 'rejected')} className="h-7 px-3 bg-rose-500 hover:bg-rose-600 text-white rounded-lg text-[10px] font-black uppercase tracking-wider shadow-sm transition-all">Revert to Draft</button>
                      </>
                    )}
                    {activeRun.status === 'locked' && (
                      <button onClick={() => handleStatusChange('draft', 'unlocked')} className="h-7 px-3 bg-rose-100 hover:bg-rose-200 text-rose-600 rounded-lg text-[10px] font-black uppercase tracking-wider shadow-sm transition-all">Unlock Run</button>
                    )}
                  </div>
                )}
                {payrollSubTab === 'current' && isAdmin && !selectedPastRunId && activeRun && activeRun.status !== 'locked' && activeRun.status !== 'approved' && (
                  <button onClick={() => setIsOtModalOpen(true)} className="h-7 px-3 bg-indigo-50 text-indigo-700 rounded-lg text-[10px] font-black uppercase tracking-[0.1em] shadow-sm hover:bg-indigo-600 hover:text-white active:scale-95 transition-all">OT Escalation</button>
                )}
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
              {payrollSubTab === 'history' && !selectedPastRunId ? (
                renderHistoryTab()
              ) : payrollSubTab === 'current' && !activeRun && !selectedPastRunId ? (
                // Banner for initiating run
                <div className="flex-1 flex flex-col items-center justify-center p-8 bg-slate-50 border-2 border-dashed border-slate-200 rounded-3xl m-4 animate-in fade-in duration-200">
                  <CalendarIcon size={48} className="text-indigo-400 mb-4 opacity-75 animate-bounce" />
                  <h3 className="text-lg font-bold text-slate-800 uppercase tracking-tight">Payroll Not Started</h3>
                  <p className="text-sm text-slate-500 max-w-md text-center mt-2">
                    The payroll run for {formatMonthDisplay(summaryMonth)} has not been initiated yet.
                  </p>
                  {isAdmin && (
                    <button 
                      onClick={handleInitiateRun} 
                      className="mt-6 h-10 px-6 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-md transition-all active:scale-95 flex items-center gap-2"
                    >
                      <Plus size={14} />
                      Initiate Draft Run
                    </button>
                  )}
                </div>
              ) : (
                <>
                  {selectedPastRunId && (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex justify-between items-center mb-4 text-xs font-semibold text-amber-800 m-4 shadow-sm animate-in slide-in-from-top-1">
                      <div className="flex items-center gap-2">
                        <Info size={16} className="text-amber-600" />
                        <span>Viewing archived payroll snapshot for <strong>{formatMonthDisplay(selectedPastRunId)}</strong>. (Read-only)</span>
                      </div>
                      <button 
                        onClick={() => {
                          setSelectedPastRunId(null);
                          setPayrollSubTab('history');
                        }}
                        className="px-3 py-1 bg-white border border-amber-300 hover:bg-amber-100 rounded-lg text-[10px] font-bold uppercase text-amber-700 tracking-wider shadow-sm transition-all"
                      >
                        Exit Archive View
                      </button>
                    </div>
                  )}
                  {summarySubTab==='overview' ? (
                    <div className="h-full overflow-auto premium-overview-scroll">
                    <table className="w-full text-sm border-separate border-spacing-0 bg-white border border-zinc-200 shadow-sm rounded-xl overflow-hidden">
                  <thead className="sticky top-0 z-40 font-raleway">
                    {/* Group Headers Row */}
                    <tr className="h-[48px]">
                      <th colSpan={2} className="px-5 text-left border-r border-b-2 border-zinc-200/60 font-black uppercase text-[10px] text-blue-900 tracking-widest bg-blue-50/90 sticky left-0 z-50 backdrop-blur-sm shadow-[2px_0_10px_-2px_rgba(0,0,0,0.05)]">Staff Profile</th>
                      <th colSpan={3} className="px-4 text-center border-r border-b-2 border-zinc-200/60 font-black uppercase text-[10px] text-orange-900 tracking-widest bg-orange-50/90 backdrop-blur-sm">Period Status</th>
                      <th colSpan={5} className="px-4 text-center border-r border-b-2 border-zinc-200/60 font-black uppercase text-[10px] text-zinc-700 tracking-widest bg-zinc-100/90 backdrop-blur-sm">Performance</th>
                      <th colSpan={1} className="px-4 text-center border-r border-b-2 border-zinc-200/60 font-black uppercase text-[10px] text-indigo-900 tracking-widest bg-indigo-50/90 backdrop-blur-sm">Overtime</th>
                      <th colSpan={2} className="px-4 text-center border-r border-b-2 border-zinc-200/60 font-black uppercase text-[10px] text-emerald-900 tracking-widest bg-emerald-50/90 backdrop-blur-sm">Sunday/Holiday</th>
                      <th colSpan={3} className="px-4 text-center border-b-2 border-green-600 font-black uppercase text-[10px] text-white tracking-widest bg-green-600/95 backdrop-blur-sm">Summary & Payout</th>
                      <th className="w-12 bg-zinc-50 border-b-2 border-zinc-200"></th>
                    </tr>
                    {/* Primary Header Row */}
                    <tr className="bg-white/95 backdrop-blur-md text-[9px] uppercase font-black text-zinc-400 tracking-[0.15em] h-[44px] border-b border-zinc-200">
                      <th className="px-3 text-center border-r border-zinc-100 w-10 sticky left-0 bg-inherit z-50 shadow-[2px_0_10px_-2px_rgba(0,0,0,0.05)]">#</th>
                      <th className="px-5 text-left border-r border-zinc-100 w-56 sticky left-10 bg-inherit z-50 shadow-[2px_0_10px_-2px_rgba(0,0,0,0.05)]">Employee Name</th>
                      <th className="px-2 text-center border-r border-zinc-100 w-24 text-orange-700/60">Total Days</th>
                      <th className="px-2 text-center border-r border-zinc-100 w-20 text-orange-700/60">Sunday</th>
                      <th className="px-2 text-center border-r border-zinc-100 w-20 text-orange-700/60">Holiday</th>
                      <th className="px-2 text-center border-r border-zinc-100 w-24">Worked</th>
                      <th className="px-2 text-center border-r border-zinc-100 w-20">HD</th>
                      <th className="px-2 text-center border-r border-zinc-100 w-20">Leave</th>
                      <th className="px-2 text-center border-r border-zinc-100 w-24 text-rose-500/70">LOP</th>
                      <th className="px-2 text-center border-r border-zinc-100 w-24 text-emerald-600/80">Paid Days</th>
                      <th className="px-2 text-center border-r border-zinc-100 w-24 text-indigo-600/70">OT (Actual)</th>
                      <th className="px-2 text-center border-r border-zinc-100 w-28 text-emerald-600/70">Sunday Wk</th>
                      <th className="px-2 text-center border-r border-zinc-100 w-28 text-emerald-600/70">Holiday Wk</th>
                      <th className="px-5 text-right border-r border-zinc-100 w-48 bg-green-50/20 text-green-700">Net Payout</th>
                      <th className="px-2 text-center border-r border-zinc-100 w-24 text-green-700">Status</th>
                      <th className="px-2 text-center border-r border-zinc-100 w-32 text-green-600">Sync</th>
                      <th className="w-12"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {isAttendanceLoading ? (
                       <tr><td colSpan={17} className="py-20 text-center"><Spinner /></td></tr>
                    ) : filteredAttendanceSummaryData.map((e, idx)=>{
                      return (
                      <tr key={e.id} className={`hover:bg-indigo-50/50 transition-all duration-200 h-[48px] group ${idx%2===0?'bg-white':'bg-zinc-50/40'}`}>
                        <td className="px-3 text-center border-r border-zinc-50 text-zinc-400 text-[12px] font-bold font-inter sticky left-0 z-20 bg-inherit group-hover:bg-indigo-50 shadow-[1px_0_0_0_#f4f4f5]">{idx + 1}</td>
                        <td className="px-4 border-r border-zinc-100 text-zinc-800 text-[12px] font-bold tracking-tight truncate w-52 font-inter sticky left-10 z-20 bg-inherit group-hover:bg-indigo-50 shadow-[1px_0_0_0_#f4f4f5]">{e.name}</td>
                        <td className="px-2 text-center border-r border-zinc-50 text-zinc-500 text-[12px] font-inter">{e.totalDays}</td>
                        <td className="px-2 text-center border-r border-zinc-50 text-zinc-400 text-[12px] font-inter">{e.sundays}</td>
                        <td className="px-2 text-center border-r border-zinc-50 text-zinc-400 text-[12px] font-inter" title={e.holidayDates?.length ? `Holidays: ${e.holidayDates.join(', ')}` : ''}>{e.holidays}</td>
                        <td className="px-2 text-center border-r border-zinc-50 font-black text-zinc-700 text-[12px] font-inter">{e.worked}</td>
                        <td className="px-2 text-center border-r border-zinc-50 font-bold text-zinc-600 text-[12px] font-inter">{e.hd}</td>
                        <td className="px-2 text-center border-r border-zinc-50 text-zinc-500 text-[12px] font-inter">{e.leave}</td>
                        <td className="px-2 text-center border-r border-zinc-50 font-black text-rose-600 bg-rose-50/20 text-[12px] font-inter relative group/tooltip">
                          {e.lop}
                          {e.lopDates?.length > 0 && (
                            <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 bg-zinc-900 text-white text-[10px] rounded-lg opacity-0 group-hover/tooltip:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50 shadow-xl border border-white/10">
                              <span className="text-red-400 font-black uppercase tracking-tighter mr-1">{formatMonthShort(summaryMonth)}:</span> {e.lopDates.join(', ')}
                            </span>
                          )}
                        </td>
                        <td className="px-2 text-center border-r border-zinc-50 font-black text-emerald-600 bg-emerald-50/10 text-[12px] font-inter">
                          {e.paidDays}
                        </td>
                        <td className="px-2 text-center border-r border-zinc-50 font-bold text-indigo-600/80 text-[12px] font-inter relative group/tooltip">
                          {Number(e.ot || 0).toFixed(2)}
                          {e.otAdjustment !== 0 && (
                            <span className="text-indigo-400 ml-1 font-black text-[9px]">({(Number(e.ot || 0) + Number(e.otAdjustment || 0)).toFixed(2)})</span>
                          )}
                        </td>
                        <td className="px-2 text-center border-r border-zinc-50 font-black text-emerald-600 bg-emerald-50/10 text-[12px] font-inter relative group/tooltip">
                          {e.sunW}
                          {e.sunWDates?.length > 0 && (
                            <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 bg-zinc-900 text-white text-[10px] rounded-lg opacity-0 group-hover/tooltip:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50 shadow-xl border border-white/10">
                              <span className="text-emerald-400 font-black uppercase tracking-tighter mr-1">{formatMonthShort(summaryMonth)}:</span> {e.sunWDates.join(', ')}
                            </span>
                          )}
                        </td>
                        <td className="px-2 text-center border-r border-zinc-100 font-black text-emerald-600 bg-emerald-50/10 text-[12px] font-inter relative group/tooltip">
                          {e.holW}
                          {e.holWDates?.length > 0 && (
                            <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 bg-zinc-900 text-white text-[10px] rounded-lg opacity-0 group-hover/tooltip:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50 shadow-xl border border-white/10">
                              <span className="text-emerald-400 font-black uppercase tracking-tighter mr-1">{formatMonthShort(summaryMonth)}:</span> {e.holWDates.join(', ')}
                            </span>
                          )}
                        </td>
                        <td className="px-4 text-right border-r border-zinc-100 font-black text-green-700 bg-green-50/30 text-[12px] font-inter tracking-tight pr-5">{(e.salary?.net || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</td>
                        <td className="px-2 text-center border-r border-zinc-50 text-[12px] font-inter">
                          <span className="px-2.5 py-0.5 rounded-full bg-zinc-100 text-zinc-400 text-[9px] font-black uppercase tracking-tighter">Draft</span>
                        </td>
                        <td className="px-2 text-center border-r border-zinc-50">
                           <div className="flex justify-center"><div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)] animate-pulse"></div></div>
                        </td>
                        <td className="px-2 text-center font-inter">
                          <button onClick={()=>{setSelectedEmp(e.id);setActiveTab('salary-slip');handleGenerate();}} className="p-2 hover:bg-zinc-900 hover:text-white rounded-xl transition-all text-zinc-300 active:scale-90">
                            <ArrowUpRight size={16}/>
                          </button>
                        </td>
                      </tr>
                    )})}
                  </tbody>
                </table>
                </div>
              ) : summarySubTab === 'variable' ? (
                <div className="h-full flex flex-col bg-white p-6">
                  <div className="flex justify-between items-start mb-6 border-b border-[#e5e5e5] pb-4">
                    <div>
                      <h2 className="text-base font-semibold text-[#171717]">Variable Pay Entry</h2>
                      <p className="text-[11px] text-[#525252] mt-0.5">Add Food, Convenience & Bonus allowances for specific employees & dates</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex bg-gray-100 rounded-lg p-1 border border-gray-200 gap-2">
                        <div className="relative">
                          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                          <input 
                            type="text" 
                            placeholder="Search staff..." 
                            value={variableSearchTerm}
                            onChange={e => setVariableSearchTerm(e.target.value)}
                            className="h-8 pl-8 pr-3 bg-white border border-gray-200 rounded-md text-[11px] font-medium outline-none focus:border-indigo-500 w-48 transition-all"
                          />
                        </div>
                        <input 
                          type="date" 
                          value={variableDateFilter}
                          onChange={e => setVariableDateFilter(e.target.value)}
                          className="h-8 px-2 bg-white border border-gray-200 rounded-md text-[11px] font-medium outline-none focus:border-indigo-500 transition-all"
                        />
                        {(variableSearchTerm || variableDateFilter) && (
                          <button 
                            onClick={() => { setVariableSearchTerm(''); setVariableDateFilter(''); }}
                            className="p-1.5 hover:bg-white rounded-md text-gray-400 hover:text-red-500 transition-all"
                            title="Clear Filters"
                          >
                            <X size={14} />
                          </button>
                        )}
                      </div>

                      <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200 gap-0.5">
                        {[
                          {id:'individual', l:'Individual'},
                          {id:'staff', l:'By Staff'},
                          {id:'date', l:'By Date'}
                        ].map(g => (
                          <button 
                            key={g.id}
                            onClick={() => setVariableViewGroup(g.id)}
                            className={`px-3 py-1 text-[10px] font-bold uppercase rounded-md transition-all ${
                              variableViewGroup === g.id 
                                ? 'bg-white text-indigo-600 shadow-sm border border-indigo-100' 
                                : 'text-slate-500 hover:text-slate-900'
                            }`}
                          >
                            {g.l}
                          </button>
                        ))}
                      </div>

                      {Object.keys(variableDrafts).length > 0 && (
                        <button 
                          onClick={() => {
                            const dataToSave = {};
                            Object.entries(variableDrafts).forEach(([docId, vals]) => {
                              const [date, empId] = docId.split('_');
                              dataToSave[empId] = { ...vals, date };
                            });
                            saveVariablesMutation.mutate(dataToSave);
                            setVariableDrafts({});
                          }}
                          disabled={saveVariablesMutation.isPending}
                          className="h-9 px-4 bg-emerald-600 text-white rounded-md text-xs font-bold uppercase hover:bg-emerald-700 shadow-md transition-all flex items-center gap-2 animate-in zoom-in-95"
                        >
                          <Save size={14} />
                          Save ({Object.keys(variableDrafts).length})
                        </button>
                      )}

                      <button onClick={() => setShowAddVariable(true)} className="h-9 px-4 bg-[#171717] text-white rounded-md text-xs font-medium hover:bg-black transition-colors flex items-center gap-1.5">
                        <Plus size={14} /> Add Entry
                      </button>
                    </div>
                  </div>
                  
                  <div className="flex-1 overflow-auto">
                    <table className="w-full text-left border-collapse">
                      <thead className="sticky top-0 bg-white z-10 border-b border-[#e5e5e5]">
                        <tr className="h-10">
                          {variableViewGroup === 'individual' ? (
                            <>
                              <th className="px-4 font-semibold text-[11px] text-[#525252]">Employee</th>
                              <th className="px-4 font-semibold text-[11px] text-[#525252]">Date</th>
                              <th className="px-4 font-semibold text-[11px] text-[#525252] text-right">Food (₹)</th>
                              <th className="px-4 font-semibold text-[11px] text-[#525252] text-right">Convenience (₹)</th>
                              <th className="px-4 font-semibold text-[11px] text-[#525252] text-right">Bonus (₹)</th>
                              <th className="px-4 font-semibold text-[11px] text-[#525252] text-right">Total (₹)</th>
                              <th className="px-4 font-semibold text-[11px] text-emerald-600 text-center">Settled?</th>
                              <th className="px-4 font-semibold text-[11px] text-[#525252] text-right">Actions</th>
                            </>
                          ) : variableViewGroup === 'staff' ? (
                            <>
                              <th className="px-4 font-semibold text-[11px] text-[#525252]">Employee Name</th>
                              <th className="px-4 font-semibold text-[11px] text-[#525252] text-center">Entries</th>
                              <th className="px-4 font-semibold text-[11px] text-[#525252] text-right text-emerald-600">Outside Payroll (₹)</th>
                              <th className="px-4 font-semibold text-[11px] text-[#525252] text-right text-indigo-600">In Salary (₹)</th>
                              <th className="px-4 font-semibold text-[11px] text-[#525252] text-right font-black">Grand Total (₹)</th>
                            </>
                          ) : (
                            <>
                              <th className="px-4 font-semibold text-[11px] text-[#525252]">Date</th>
                              <th className="px-4 font-semibold text-[11px] text-[#525252] text-center">Staff Count</th>
                              <th className="px-4 font-semibold text-[11px] text-[#525252] text-right text-emerald-600">Outside Payroll (₹)</th>
                              <th className="px-4 font-semibold text-[11px] text-[#525252] text-right text-indigo-600">In Salary (₹)</th>
                              <th className="px-4 font-semibold text-[11px] text-[#525252] text-right font-black">Daily Total (₹)</th>
                            </>
                          )}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#e5e5e5]">
                        {(() => {
                          const filtered = (monthlyVariableSums || [])
                            .filter(v => {
                              const matchName = v.employeeName?.toLowerCase().includes(variableSearchTerm.toLowerCase());
                              const matchDate = !variableDateFilter || v.date === variableDateFilter;
                              return matchName && matchDate;
                            });

                          if (variableViewGroup === 'staff') {
                            const staffGroups = {};
                            filtered.forEach(v => {
                              if (!staffGroups[v.employeeId]) staffGroups[v.employeeId] = { name: v.employeeName, count: 0, settled: 0, inSalary: 0 };
                              staffGroups[v.employeeId].count++;
                              const total = Number(v.food||0) + Number(v.convenience||0) + Number(v.bonus||0);
                              if (v.isSettled) staffGroups[v.employeeId].settled += total;
                              else staffGroups[v.employeeId].inSalary += total;
                              if (!staffGroups[v.employeeId].entries) staffGroups[v.employeeId].entries = [];
                              staffGroups[v.employeeId].entries.push(v);
                            });
                            return Object.entries(staffGroups).map(([id, g]) => {
                              const isExpanded = expandedVariableGroups.has(id);
                              const toggle = () => {
                                const next = new Set(expandedVariableGroups);
                                if (isExpanded) next.delete(id); else next.add(id);
                                setExpandedVariableGroups(next);
                              };
                              return (
                                <React.Fragment key={id}>
                                  <tr className="hover:bg-[#f5f5f5] cursor-pointer group" onClick={toggle}>
                                    <td className="px-4 py-3 font-semibold text-[#171717]">
                                      <div className="flex items-center gap-2">
                                        <div className={`transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}>
                                          <ChevronRight size={14} className="text-slate-400 group-hover:text-indigo-600" />
                                        </div>
                                        {g.name}
                                      </div>
                                    </td>
                                    <td className="px-4 text-center text-xs text-slate-500 font-bold">{g.count} logs</td>
                                    <td className="px-4 text-right text-[12px] font-bold text-emerald-600 bg-emerald-50/20">{g.settled.toLocaleString('en-IN')}</td>
                                    <td className="px-4 text-right text-[12px] font-bold text-indigo-600 bg-indigo-50/20">{g.inSalary.toLocaleString('en-IN')}</td>
                                    <td className="px-4 text-right text-[13px] font-black text-slate-900">{(g.settled + g.inSalary).toLocaleString('en-IN')}</td>
                                  </tr>
                                  {isExpanded && g.entries.sort((a,b) => b.date.localeCompare(a.date)).map(v => (
                                    <tr key={v.id} className="bg-slate-50/50 border-l-2 border-indigo-200 animate-in slide-in-from-top-1 duration-200">
                                      <td className="px-10 py-2 text-[11px] text-slate-500 font-medium italic">Entry Detail</td>
                                      <td className="px-4 text-[12px] text-slate-600 font-mono">{formatDateDDMMYYYY(v.date)}</td>
                                      <td className={`px-4 text-right text-[11px] font-bold ${v.isSettled ? 'text-emerald-600' : 'text-slate-300'}`}>{v.isSettled ? (Number(v.food||0)+Number(v.convenience||0)+Number(v.bonus||0)).toLocaleString('en-IN') : '-'}</td>
                                      <td className={`px-4 text-right text-[11px] font-bold ${!v.isSettled ? 'text-indigo-600' : 'text-slate-300'}`}>{!v.isSettled ? (Number(v.food||0)+Number(v.convenience||0)+Number(v.bonus||0)).toLocaleString('en-IN') : '-'}</td>
                                      <td className="px-4 text-right text-[11px] font-bold text-slate-400">{(Number(v.food||0)+Number(v.convenience||0)+Number(v.bonus||0)).toLocaleString('en-IN')}</td>
                                    </tr>
                                  ))}
                                </React.Fragment>
                              );
                            });
                          }

                          if (variableViewGroup === 'date') {
                            const dateGroups = {};
                            filtered.forEach(v => {
                              if (!dateGroups[v.date]) dateGroups[v.date] = { date: v.date, count: 0, settled: 0, inSalary: 0, entries: [] };
                              dateGroups[v.date].count++;
                              const total = Number(v.food||0) + Number(v.convenience||0) + Number(v.bonus||0);
                              if (v.isSettled) dateGroups[v.date].settled += total;
                              else dateGroups[v.date].inSalary += total;
                              dateGroups[v.date].entries.push(v);
                            });
                            return Object.entries(dateGroups).sort((a, b) => b[0].localeCompare(a[0])).map(([d, g]) => {
                              const isExpanded = expandedVariableGroups.has(d);
                              const toggle = () => {
                                const next = new Set(expandedVariableGroups);
                                if (isExpanded) next.delete(d); else next.add(id);
                                setExpandedVariableGroups(next);
                              };
                              return (
                                <React.Fragment key={d}>
                                  <tr className="hover:bg-[#f5f5f5] cursor-pointer group" onClick={toggle}>
                                    <td className="px-4 py-3 font-semibold text-[#171717]">
                                      <div className="flex items-center gap-2">
                                        <div className={`transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}>
                                          <ChevronRight size={14} className="text-slate-400 group-hover:text-indigo-600" />
                                        </div>
                                        {formatDateDDMMYYYY(g.date)}
                                      </div>
                                    </td>
                                    <td className="px-4 text-center text-xs text-slate-500 font-bold">{g.count} staff</td>
                                    <td className="px-4 text-right text-[12px] font-bold text-emerald-600 bg-emerald-50/20">{g.settled.toLocaleString('en-IN')}</td>
                                    <td className="px-4 text-right text-[12px] font-bold text-indigo-600 bg-indigo-50/20">{g.inSalary.toLocaleString('en-IN')}</td>
                                    <td className="px-4 text-right text-[13px] font-black text-slate-900">{(g.settled + g.inSalary).toLocaleString('en-IN')}</td>
                                  </tr>
                                  {isExpanded && g.entries.sort((a,b) => a.employeeName.localeCompare(b.employeeName)).map(v => (
                                    <tr key={v.id} className="bg-slate-50/50 border-l-2 border-indigo-200 animate-in slide-in-from-top-1 duration-200">
                                      <td className="px-10 py-2 text-[12px] text-slate-900 font-semibold">{v.employeeName}</td>
                                      <td className="px-4 text-[11px] text-slate-400 uppercase font-bold italic text-center">Individual Log</td>
                                      <td className={`px-4 text-right text-[11px] font-bold ${v.isSettled ? 'text-emerald-600' : 'text-slate-300'}`}>{v.isSettled ? (Number(v.food||0)+Number(v.convenience||0)+Number(v.bonus||0)).toLocaleString('en-IN') : '-'}</td>
                                      <td className={`px-4 text-right text-[11px] font-bold ${!v.isSettled ? 'text-indigo-600' : 'text-slate-300'}`}>{!v.isSettled ? (Number(v.food||0)+Number(v.convenience||0)+Number(v.bonus||0)).toLocaleString('en-IN') : '-'}</td>
                                      <td className="px-4 text-right text-[11px] font-bold text-slate-400">{(Number(v.food||0)+Number(v.convenience||0)+Number(v.bonus||0)).toLocaleString('en-IN')}</td>
                                    </tr>
                                  ))}
                                </React.Fragment>
                              );
                            });
                          }

                          return filtered.length > 0 ? filtered.map(v => {
                            const docId = `${v.date}_${v.employeeId}`;
                            const draft = variableDrafts[docId] || {};
                            const food = draft.food ?? v.food;
                            const convenience = draft.convenience ?? v.convenience;
                            const bonus = draft.bonus ?? v.bonus;
                            const isSettled = draft.isSettled ?? v.isSettled;

                            const handleCellEdit = (field, value) => {
                              setVariableDrafts(prev => ({
                                ...prev,
                                [docId]: {
                                  ...(prev[docId] || { food: v.food, convenience: v.convenience, bonus: v.bonus, isSettled: v.isSettled }),
                                  [field]: value
                                }
                              }));
                            };

                            return (
                              <tr key={v.id} className={`hover:bg-[#f5f5f5] ${Object.keys(draft).length > 0 ? 'bg-amber-50/50' : ''}`}>
                                <td className="px-4 py-2">
                                  <span className="text-[13px] font-semibold text-[#171717]">{v.employeeName}</span>
                                </td>
                                <td className="px-4">
                                  <span className="text-[12px] text-[#525252] font-mono">{formatDateDDMMYYYY(v.date)}</span>
                                </td>
                                <td className="px-4 text-right">
                                  <input 
                                    type="number" 
                                    value={food} 
                                    onChange={e => handleCellEdit('food', e.target.value)}
                                    className="w-20 h-7 text-right text-xs border border-transparent hover:border-gray-200 focus:border-indigo-500 rounded bg-transparent px-1 font-bold outline-none"
                                  />
                                </td>
                                <td className="px-4 text-right">
                                  <input 
                                    type="number" 
                                    value={convenience} 
                                    onChange={e => handleCellEdit('convenience', e.target.value)}
                                    className="w-20 h-7 text-right text-xs border border-transparent hover:border-gray-200 focus:border-indigo-500 rounded bg-transparent px-1 font-bold outline-none"
                                  />
                                </td>
                                <td className="px-4 text-right">
                                  <input 
                                    type="number" 
                                    value={bonus} 
                                    onChange={e => handleCellEdit('bonus', e.target.value)}
                                    className="w-20 h-7 text-right text-xs border border-transparent hover:border-gray-200 focus:border-indigo-500 rounded bg-transparent px-1 font-bold outline-none"
                                  />
                                </td>
                                <td className="px-4 text-right text-[12px] font-bold text-indigo-600">{(Number(food||0) + Number(convenience||0) + Number(bonus||0)).toLocaleString('en-IN')}</td>
                                <td className="px-4 text-center">
                                  <button 
                                    onClick={() => handleCellEdit('isSettled', !isSettled)}
                                    className={`px-2.5 py-1 rounded-full text-[8px] font-black uppercase tracking-tighter transition-all duration-300 border ${
                                      isSettled 
                                        ? 'bg-emerald-50 text-emerald-600 border-emerald-200 hover:bg-emerald-600 hover:text-white shadow-sm' 
                                        : 'bg-indigo-50 text-indigo-600 border-indigo-200 hover:bg-indigo-600 hover:text-white shadow-sm'
                                    }`}
                                  >
                                    {isSettled ? 'Paid GPay' : 'In Salary'}
                                  </button>
                                </td>
                                <td className="px-4 text-right">
                                  <div className="flex justify-end gap-2">
                                    <button 
                                      onClick={() => setEditingVariable(v)}
                                      className="p-1 text-[#525252] hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors"
                                    >
                                      <Edit2 size={14} />
                                    </button>
                                    <button onClick={() => {
                                      if (confirm('Delete this entry?')) {
                                        deleteVariableMutation.mutate(v.id)
                                      }
                                    }} className="p-1 text-[#525252] hover:text-red-600 hover:bg-red-50 rounded transition-colors">
                                      <Trash2 size={14} />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            )
                          }) : (
                            <tr>
                              <td colSpan={8} className="px-4 py-12 text-center text-[12px] text-[#525252]">
                                No variable pay entries yet. Click "Add Entry" to add Food, Convenience or Bonus for employees.
                              </td>
                            </tr>
                          );
                        })()}
                      </tbody>
                    </table>
                  </div>

                  {editingVariable && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
                      <div className="bg-white rounded-lg shadow-xl w-full max-w-md border border-[#e5e5e5] overflow-hidden">
                        <div className="flex items-center justify-between px-5 py-4 border-b border-[#e5e5e5] bg-indigo-50">
                          <div>
                            <h3 className="text-sm font-black uppercase text-[#171717] tracking-tight">Edit Variable Entry</h3>
                            <p className="text-[10px] text-indigo-600 font-bold uppercase">{editingVariable.employeeName} • {formatDateDDMMYYYY(editingVariable.date)}</p>
                          </div>
                          <button onClick={() => setEditingVariable(null)} className="p-1 text-[#525252] hover:bg-white rounded"><X size={16} /></button>
                        </div>
                        <div className="p-5 space-y-4">
                          <div className="grid grid-cols-1 gap-4">
                            <div className="space-y-1">
                              <label className="block text-[10px] font-black uppercase text-slate-400 tracking-wider">Food Allowance (₹)</label>
                              <input 
                                type="number" 
                                value={editingVariable.food}
                                onChange={e => setEditingVariable({...editingVariable, food: e.target.value})}
                                className="w-full h-10 px-3 border border-[#d4d4d4] rounded-lg text-sm font-bold focus:outline-none focus:border-indigo-500"
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="block text-[10px] font-black uppercase text-slate-400 tracking-wider">Convenience (₹)</label>
                              <input 
                                type="number" 
                                value={editingVariable.convenience}
                                onChange={e => setEditingVariable({...editingVariable, convenience: e.target.value})}
                                className="w-full h-10 px-3 border border-[#d4d4d4] rounded-lg text-sm font-bold focus:outline-none focus:border-indigo-500"
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="block text-[10px] font-black uppercase text-slate-400 tracking-wider">Bonus (₹)</label>
                              <input 
                                type="number" 
                                value={editingVariable.bonus}
                                onChange={e => setEditingVariable({...editingVariable, bonus: e.target.value})}
                                className="w-full h-10 px-3 border border-[#d4d4d4] rounded-lg text-sm font-bold focus:outline-none focus:border-indigo-500"
                              />
                            </div>
                            <div className="pt-4 border-t border-gray-100">
                              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-1.5 flex gap-1.5 shadow-inner">
                                <button 
                                  onClick={() => setEditingVariable({...editingVariable, isSettled: false})}
                                  className={`flex-1 flex flex-col items-center justify-center rounded-xl py-2 transition-all duration-300 ${
                                    !editingVariable.isSettled 
                                      ? 'bg-indigo-600 text-white shadow-lg scale-[1.02]' 
                                      : 'text-slate-400 hover:text-slate-600 hover:bg-white'
                                  }`}
                                >
                                  <span className="text-[9px] font-black uppercase tracking-wider">Include in</span>
                                  <span className="text-[11px] font-bold leading-none mt-0.5">Monthly Salary</span>
                                </button>
                                <button 
                                  onClick={() => setEditingVariable({...editingVariable, isSettled: true})}
                                  className={`flex-1 flex flex-col items-center justify-center rounded-xl py-2 transition-all duration-300 ${
                                    editingVariable.isSettled 
                                      ? 'bg-emerald-600 text-white shadow-lg scale-[1.02]' 
                                      : 'text-slate-400 hover:text-slate-600 hover:bg-white'
                                  }`}
                                >
                                  <span className="text-[9px] font-black uppercase tracking-wider">Paid via</span>
                                  <span className="text-[11px] font-bold leading-none mt-0.5">GPay / Cash</span>
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                        <div className="px-5 py-4 border-t border-[#e5e5e5] bg-gray-50 flex justify-end gap-3">
                          <button onClick={() => setEditingVariable(null)} className="px-4 py-2 text-[10px] font-black uppercase text-[#525252] hover:bg-gray-100 rounded-md border border-[#d4d4d4]">Cancel</button>
                          <button 
                            onClick={() => {
                              saveVariablesMutation.mutate({ [editingVariable.employeeId]: editingVariable });
                              setEditingVariable(null);
                            }}
                            className="px-6 py-2 bg-indigo-600 text-white rounded-md text-[10px] font-black uppercase hover:bg-indigo-700 shadow-md transition-all active:scale-95"
                          >
                            Save Changes
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {showAddVariable && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
                      <div className="bg-white rounded-lg shadow-[0_4px_24px_rgba(0,0,0,0.15)] w-full max-w-3xl border border-[#e5e5e5] max-h-[90vh] flex flex-col">
                        <div className="flex items-center justify-between px-5 py-4 border-b border-[#e5e5e5] shrink-0">
                          <div>
                            <h3 className="text-sm font-semibold text-[#171717]">Variable Pay Entry</h3>
                            <p className="text-[11px] text-[#525252] mt-0.5">Add Food, Convenience & Bonus for multiple employees</p>
                          </div>
                          <button onClick={() => setShowAddVariable(false)} className="p-1 text-[#525252] hover:bg-[#f5f5f5] rounded"><X size={16} /></button>
                        </div>
                        
                        <div className="px-5 py-4 border-b border-[#e5e5e5] bg-gray-50 shrink-0 space-y-4">
                          {/* Row 1: Date Selection */}
                          <div className="flex gap-6 items-end">
                            <div className="w-44">
                              <label className="block text-[10px] font-black uppercase text-slate-400 mb-1.5 tracking-wider">Start Date</label>
                              <input 
                                type="date" 
                                value={newVariable.date}
                                onChange={e => setNewVariable({...newVariable, date: e.target.value})}
                                className="w-full h-9 px-3 border border-[#d4d4d4] rounded-lg text-[13px] text-[#171717] focus:outline-none focus:border-indigo-500 font-bold shadow-sm"
                              />
                            </div>
                            <div className="flex items-center gap-2 h-9 pb-1">
                              <input 
                                type="checkbox" 
                                id="isRangeToggle"
                                checked={newVariable.isRange}
                                onChange={e => setNewVariable({...newVariable, isRange: e.target.checked})}
                                className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                              />
                              <label htmlFor="isRangeToggle" className="text-[10px] font-black uppercase text-indigo-600 cursor-pointer tracking-wider hover:text-indigo-700 transition-colors">Multiple Days?</label>
                            </div>
                            {newVariable.isRange && (
                              <div className="w-44 animate-in zoom-in-95 fade-in slide-in-from-left-4 duration-200">
                                <label className="block text-[10px] font-black uppercase text-slate-400 mb-1.5 tracking-wider flex items-center gap-1.5">
                                  Till Date <ArrowRight size={10} className="text-indigo-300" />
                                </label>
                                <input 
                                  type="date" 
                                  value={newVariable.endDate}
                                  onChange={e => setNewVariable({...newVariable, endDate: e.target.value})}
                                  className="w-full h-9 px-3 border border-indigo-200 rounded-lg text-[13px] text-[#171717] focus:outline-none focus:border-indigo-500 font-bold bg-indigo-50/30 shadow-sm"
                                />
                              </div>
                            )}
                          </div>

                          {/* Row 2: Common Amounts & Settlement */}
                          <div className="pt-2 border-t border-gray-200/60 flex gap-4 items-end">
                            <div className="flex-1 space-y-2">
                              <label className="block text-[10px] font-black uppercase text-slate-500 tracking-wider flex items-center gap-2">
                                <div className="w-1.5 h-1.5 rounded-full bg-indigo-500"></div>
                                Common Amount (Auto-applied to selected staff)
                              </label>
                              <div className="flex gap-3">
                                <div className="flex-1 relative">
                                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">₹</span>
                                  <input 
                                    type="number" 
                                    value={newVariable.food}
                                    onChange={e => setNewVariable({...newVariable, food: e.target.value})}
                                    className="w-full h-9 pl-6 pr-3 border border-[#d4d4d4] rounded-lg text-[13px] text-[#171717] focus:outline-none focus:border-indigo-500 font-bold bg-white"
                                    placeholder="Food"
                                  />
                                  <div className="absolute -top-1.5 left-2 px-1 bg-gray-50 text-[8px] font-black text-gray-400 uppercase">Food</div>
                                </div>
                                <div className="flex-1 relative">
                                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">₹</span>
                                  <input 
                                    type="number" 
                                    value={newVariable.convenience}
                                    onChange={e => setNewVariable({...newVariable, convenience: e.target.value})}
                                    className="w-full h-9 pl-6 pr-3 border border-[#d4d4d4] rounded-lg text-[13px] text-[#171717] focus:outline-none focus:border-indigo-500 font-bold bg-white"
                                    placeholder="Conv."
                                  />
                                  <div className="absolute -top-1.5 left-2 px-1 bg-gray-50 text-[8px] font-black text-gray-400 uppercase">Conv.</div>
                                </div>
                                <div className="flex-1 relative">
                                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">₹</span>
                                  <input 
                                    type="number" 
                                    value={newVariable.bonus}
                                    onChange={e => setNewVariable({...newVariable, bonus: e.target.value})}
                                    className="w-full h-9 pl-6 pr-3 border border-[#d4d4d4] rounded-lg text-[13px] text-[#171717] focus:outline-none focus:border-indigo-500 font-bold bg-white"
                                    placeholder="Bonus"
                                  />
                                  <div className="absolute -top-1.5 left-2 px-1 bg-gray-50 text-[8px] font-black text-gray-400 uppercase">Bonus</div>
                                </div>
                              </div>
                            </div>
                            <div className="w-56 bg-white border border-gray-200 rounded-xl p-1 flex shadow-sm self-stretch">
                              <button 
                                onClick={() => setNewVariable({...newVariable, isSettled: false})}
                                className={`flex-1 flex flex-col items-center justify-center rounded-lg py-1 transition-all duration-200 ${
                                  !newVariable.isSettled 
                                    ? 'bg-indigo-600 text-white shadow-md' 
                                    : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'
                                }`}
                              >
                                <span className="text-[8px] font-black uppercase tracking-tighter">Include in</span>
                                <span className="text-[10px] font-bold leading-none">Salary</span>
                              </button>
                              <button 
                                onClick={() => setNewVariable({...newVariable, isSettled: true})}
                                className={`flex-1 flex flex-col items-center justify-center rounded-lg py-1 transition-all duration-200 ${
                                  newVariable.isSettled 
                                    ? 'bg-emerald-600 text-white shadow-md' 
                                    : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'
                                }`}
                              >
                                <span className="text-[8px] font-black uppercase tracking-tighter">Paid via</span>
                                <span className="text-[10px] font-bold leading-none">GPay/Cash</span>
                              </button>
                            </div>
                          </div>
                        </div>

                        <div className="flex-1 overflow-auto p-5">
                          <table className="w-full text-left border-collapse">
                            <thead className="sticky top-0 bg-white z-10 border-b border-[#e5e5e5]">
                              <tr className="h-9">
                                <th className="px-3 font-semibold text-[11px] text-[#525252] w-8">
                                  <input 
                                    type="checkbox" 
                                    checked={newVariable.selectedAll}
                                    onChange={e => setNewVariable({
                                      ...newVariable, 
                                      selectedAll: e.target.checked,
                                      selectedEmps: e.target.checked ? sortedEmployees.map(e => e.id) : []
                                    })}
                                    className="rounded border-gray-300"
                                  />
                                </th>
                                <th className="px-3 font-semibold text-[11px] text-[#525252]">Employee</th>
                                <th className="px-3 font-semibold text-[11px] text-[#525252] text-right">Food (₹)</th>
                                <th className="px-3 font-semibold text-[11px] text-[#525252] text-right">Convenience (₹)</th>
                                <th className="px-3 font-semibold text-[11px] text-[#525252] text-right">Bonus (₹)</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-[#e5e5e5]">
                              {sortedEmployees.map(emp => (
                                <tr key={emp.id} className="hover:bg-[#f5f5f5]">
                                  <td className="px-3 py-2">
                                    <input 
                                      type="checkbox" 
                                      checked={newVariable.selectedEmps?.includes(emp.id)}
                                      onChange={e => {
                                        const selected = newVariable.selectedEmps || []
                                        const updated = e.target.checked 
                                          ? [...selected, emp.id]
                                          : selected.filter(id => id !== emp.id)
                                        setNewVariable({...newVariable, selectedEmps: updated, selectedAll: updated.length === sortedEmployees.length})
                                      }}
                                      className="rounded border-gray-300"
                                    />
                                  </td>
                                  <td className="px-3 py-2 text-[13px] font-medium text-[#171717]">{emp.name}</td>
                                  <td className="px-3 py-2 text-right">
                                    <input 
                                      type="number" 
                                      value={newVariable.empData?.[emp.id]?.food ?? newVariable.food}
                                      onChange={e => setNewVariable({
                                        ...newVariable,
                                        empData: {...newVariable.empData, [emp.id]: {...newVariable.empData?.[emp.id], food: e.target.value}}
                                      })}
                                      className="w-20 h-7 px-2 text-right text-[12px] border border-[#d4d4d4] rounded focus:outline-none focus:border-[#171717]"
                                      placeholder={newVariable.food || '0'}
                                    />
                                  </td>
                                  <td className="px-3 py-2 text-right">
                                    <input 
                                      type="number" 
                                      value={newVariable.empData?.[emp.id]?.convenience ?? newVariable.convenience}
                                      onChange={e => setNewVariable({
                                        ...newVariable,
                                        empData: {...newVariable.empData, [emp.id]: {...newVariable.empData?.[emp.id], convenience: e.target.value}}
                                      })}
                                      className="w-20 h-7 px-2 text-right text-[12px] border border-[#d4d4d4] rounded focus:outline-none focus:border-[#171717]"
                                      placeholder={newVariable.convenience || '0'}
                                    />
                                  </td>
                                  <td className="px-3 py-2 text-right">
                                    <input 
                                      type="number" 
                                      value={newVariable.empData?.[emp.id]?.bonus ?? newVariable.bonus}
                                      onChange={e => setNewVariable({
                                        ...newVariable,
                                        empData: {...newVariable.empData, [emp.id]: {...newVariable.empData?.[emp.id], bonus: e.target.value}}
                                      })}
                                      className="w-20 h-7 px-2 text-right text-[12px] border border-[#d4d4d4] rounded focus:outline-none focus:border-[#171717]"
                                      placeholder={newVariable.bonus || '0'}
                                    />
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>

                        <div className="px-5 py-4 border-t border-[#e5e5e5] bg-gray-50 flex justify-between items-center shrink-0">
                          <span className="text-[11px] text-[#525252]">
                            {newVariable.selectedEmps?.length || 0} employees selected
                          </span>
                          <div className="flex gap-3">
                            <button onClick={() => {
                              setShowAddVariable(false)
                              setNewVariable({ employeeId: '', date: '', food: '', convenience: '', bonus: '', selectedEmps: [], selectedAll: false, empData: {} })
                            }} className="px-4 py-2 text-xs font-medium text-[#525252] hover:bg-gray-100 rounded-md border border-[#d4d4d4]">Cancel</button>
                            <button 
                              onClick={() => {
                                if (!newVariable.date) {
                                  alert('Please select a date')
                                  return
                                }
                                if (!newVariable.selectedEmps?.length) {
                                  alert('Please select at least one employee')
                                  return
                                }
                                const dataToSave = {}
                                newVariable.selectedEmps.forEach(empId => {
                                  const emp = sortedEmployees.find(e => e.id === empId)
                                  const empSpecific = newVariable.empData?.[empId]
                                  dataToSave[empId] = {
                                    food: empSpecific?.food ?? newVariable.food,
                                    convenience: empSpecific?.convenience ?? newVariable.convenience,
                                    bonus: empSpecific?.bonus ?? newVariable.bonus,
                                    employeeName: emp?.name,
                                    date: newVariable.date
                                  }
                                })
                                saveVariablesMutation.mutate(dataToSave)
                                setShowAddVariable(false)
                                setNewVariable({ employeeId: '', date: '', food: '', convenience: '', bonus: '', selectedEmps: [], selectedAll: false, empData: {} })
                              }}
                              disabled={saveVariablesMutation.isPending}
                              className="px-4 py-2 bg-[#171717] text-white rounded-md text-xs font-medium hover:bg-black"
                            >
                              {saveVariablesMutation.isPending ? 'Saving...' : 'Save for Selected'}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ) : summarySubTab === 'sandwich' ? (
                <div className="h-full overflow-auto bg-white p-4 flex flex-col">
                  {/* Detection Section */}
                  <div className="mb-6">
                    <div className="mb-4 flex justify-between items-end">
                      <div>
                        <h2 className="text-sm font-black uppercase text-slate-800 tracking-tight font-['Raleway']">Sandwich Rule</h2>
                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-tight">Detect Sundays/Holidays sandwiched between absences, then apply manually.</p>
                        <label className="inline-flex items-center gap-1.5 mt-2 cursor-pointer">
                          <input type="checkbox" checked={sandwichIncludeFuture} onChange={e => setSandwichIncludeFuture(e.target.checked)} className="w-3 h-3 rounded border-zinc-300 text-indigo-600" />
                          <span className="text-[10px] font-bold text-slate-500 uppercase">Include future dates</span>
                        </label>
                      </div>
                      <div className="flex gap-2">
                        <button 
                          onClick={() => setShowManualSandwichModal(true)}
                          className="h-7 px-3 bg-amber-500 text-white rounded-lg text-[10px] font-black uppercase tracking-widest shadow-md hover:bg-amber-600 transition-all flex items-center gap-1.5"
                        >
                          <Plus size={12} />
                          Add Manual
                        </button>
                        <button 
                          onClick={detectSandwiches}
                          disabled={detectingSandwiches}
                          className="h-7 px-4 bg-indigo-600 text-white rounded-lg text-[10px] font-black uppercase tracking-widest shadow-md hover:bg-indigo-700 disabled:opacity-50 transition-all flex items-center gap-2"
                        >
                          {detectingSandwiches ? <RefreshCw size={12} className="animate-spin" /> : <Search size={12} />}
                          {detectedSandwiches.length > 0 ? `Re-detect (${detectedSandwiches.length})` : 'Detect'}
                        </button>
                        {detectedSandwiches.length > 0 && (
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
                    </div>
                    {detectingSandwiches ? (
                      <div className="py-12 text-center"><Spinner /></div>
                    ) : detectedSandwiches.length === 0 ? (
                      <div className="py-12 text-center bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
                        <Search size={48} className="mx-auto text-slate-300 mb-4 opacity-30" />
                        <p className="text-[11px] font-black uppercase tracking-widest text-slate-400">Click "Detect" to find sandwich days</p>
                      </div>
                    ) : (
                      <div className="border border-zinc-200 rounded-sm overflow-hidden shadow-sm">
                        <table className="w-full border-collapse">
                          <thead className="bg-zinc-50 font-['Raleway']">
                            <tr className="h-8 border-b border-zinc-200">
                              <th className="px-3 border-r border-zinc-200 text-left w-10 bg-zinc-50"><input type="checkbox" checked={selectedSandwichDays.size === detectedSandwiches.length} onChange={(e) => {
                                if (e.target.checked) setSelectedSandwichDays(new Set(detectedSandwiches.map(s => `${s.empId}_${s.date}`)));
                                else setSelectedSandwichDays(new Set());
                              }} className="w-3 h-3 rounded border-zinc-300" /></th>
                              <th className="px-3 border-r border-zinc-200 text-left text-[10px] font-black uppercase text-emerald-600 tracking-widest">Staff Name</th>
                              <th className="px-3 border-r border-zinc-200 text-center text-[10px] font-black uppercase text-emerald-600 tracking-widest w-32">Sandwich Date</th>
                              <th className="px-3 border-r border-zinc-200 text-center text-[10px] font-black uppercase text-emerald-600 tracking-widest w-32">Type</th>
                              <th className="px-3 text-center text-[10px] font-black uppercase text-emerald-600 tracking-widest w-32">Financial Impact</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-zinc-200 bg-white">
                            {detectedSandwiches.map(s => (
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

                  {/* Manual Add Modal */}
                  {showManualSandwichModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
                      <div className="bg-white rounded-lg shadow-xl w-full max-w-md border border-zinc-200">
                        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-200 bg-amber-50 rounded-t-lg">
                          <h3 className="text-sm font-black uppercase text-slate-800 tracking-tight">Add Sandwich Rule</h3>
                          <button onClick={() => setShowManualSandwichModal(false)} className="p-1 hover:bg-zinc-100 rounded"><X size={16} className="text-zinc-500" /></button>
                        </div>
                        <div className="p-4 space-y-4">
                          <div>
                            <label className="block text-[10px] font-bold uppercase text-zinc-500 mb-1">Employee</label>
                            <select 
                              value={manualSandwichEntry.employeeId}
                              onChange={e => setManualSandwichEntry({...manualSandwichEntry, employeeId: e.target.value})}
                              className="w-full h-9 px-3 border border-zinc-300 rounded-md text-xs font-medium text-slate-800 focus:outline-none focus:border-amber-500"
                            >
                              <option value="">Select Employee</option>
                              {sortedEmployees.map(emp => (
                                <option key={emp.id} value={emp.id}>{emp.name}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold uppercase text-zinc-500 mb-1">Date</label>
                            <input 
                              type="date" 
                              value={manualSandwichEntry.date}
                              onChange={e => setManualSandwichEntry({...manualSandwichEntry, date: e.target.value})}
                              className="w-full h-9 px-3 border border-zinc-300 rounded-md text-xs font-medium text-slate-800 focus:outline-none focus:border-amber-500"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold uppercase text-zinc-500 mb-1">Type</label>
                            <div className="flex gap-3">
                              <label className="flex items-center gap-2 cursor-pointer">
                                <input 
                                  type="radio" 
                                  name="sandwichType" 
                                  value="Sunday"
                                  checked={manualSandwichEntry.type === 'Sunday'}
                                  onChange={e => setManualSandwichEntry({...manualSandwichEntry, type: e.target.value})}
                                  className="w-3 h-3 text-indigo-600"
                                />
                                <span className="text-xs font-medium text-slate-700">Sunday</span>
                              </label>
                              <label className="flex items-center gap-2 cursor-pointer">
                                <input 
                                  type="radio" 
                                  name="sandwichType" 
                                  value="Holiday"
                                  checked={manualSandwichEntry.type === 'Holiday'}
                                  onChange={e => setManualSandwichEntry({...manualSandwichEntry, type: e.target.value})}
                                  className="w-3 h-3 text-amber-600"
                                />
                                <span className="text-xs font-medium text-slate-700">Holiday</span>
                              </label>
                            </div>
                          </div>
                        </div>
                        <div className="px-4 py-3 border-t border-zinc-200 bg-zinc-50 rounded-b-lg flex justify-end gap-2">
                          <button 
                            onClick={() => setShowManualSandwichModal(false)}
                            className="px-4 py-2 text-xs font-bold uppercase text-zinc-600 hover:bg-zinc-100 rounded-md"
                          >
                            Cancel
                          </button>
                          <button 
                            onClick={() => addManualSandwichMutation.mutate()}
                            disabled={addManualSandwichMutation.isPending || !manualSandwichEntry.employeeId || !manualSandwichEntry.date}
                            className="px-4 py-2 bg-amber-500 text-white text-xs font-bold uppercase rounded-md hover:bg-amber-600 disabled:opacity-50"
                          >
                            {addManualSandwichMutation.isPending ? 'Saving...' : 'Save'}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

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
                              <th className="px-3 border-r border-zinc-200 text-center text-[10px] font-black uppercase text-emerald-600 tracking-widest w-24">Type</th>
                              <th className="px-3 border-r border-zinc-200 text-center text-[10px] font-black uppercase text-emerald-600 tracking-widest w-40">Applied On</th>
                              <th className="px-3 text-center text-[10px] font-black uppercase text-emerald-600 tracking-widest w-16">Action</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-zinc-200 bg-white">
                            {filteredHistory.length === 0 ? (
                              <tr><td colSpan={5} className="py-20 text-center text-slate-300 font-black uppercase tracking-widest text-[10px]">No records found</td></tr>
                            ) : filteredHistory.map(h => (
                              <tr key={h.id} className="h-[32px] hover:bg-sky-50/30 transition-colors">
                                <td className="px-3 border-r border-zinc-100 font-bold text-slate-900 uppercase text-[11px]">{(() => {
                                  const emp = employees.find(e => e.id === h.employeeId);
                                  return emp?.name || h.employeeName || 'Unknown staff';
                                })()}</td>
                                <td className="px-3 border-r border-zinc-100 text-center font-mono text-[11px] font-bold text-zinc-600">{formatDateDDMMYYYY(h.date)}</td>
                                <td className="px-3 border-r border-zinc-100 text-center">
                                  {(() => {
                                    const dateObj = h.date ? new Date(h.date) : null;
                                    const isSunday = dateObj && dateObj.getDay() === 0;
                                    const type = h.type || (isSunday ? 'Sunday' : 'Holiday');
                                    return (
                                      <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase border ${type === 'Sunday' ? 'bg-indigo-50 text-indigo-700 border-indigo-100' : 'bg-amber-50 text-amber-700 border-amber-100'}`}>
                                        {type}
                                        {h.isManual && <span className="ml-1 text-[8px]">(M)</span>}
                                      </span>
                                    );
                                  })()}
                                </td>
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
                  <table className="w-full text-[11px] border-collapse detailed-summary-table bg-white">
                    <thead className="sticky top-0 z-40 font-raleway">
                      <tr className="h-[55px] border-b-2 border-gray-950">
                        {visibleGroups.map(g=>(
                          <th key={g.id} colSpan={g.visibleCount} className={`px-2 border-r-2 ${getColumnColorClass(g.columns[0], 'border')} text-center font-black uppercase tracking-[0.15em] text-[11px] ${
                            g.id === 'basic' ? 'sticky left-0 z-50 border-b-blue-200' : ''
                          } ${
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
                          <th key={c.id} style={{ 
                            width: c.width, 
                            minWidth: c.width,
                            left: c.leftOffset
                          }} className={`px-2 border-r-2 ${getColumnColorClass(c.id, 'border')} text-center font-bold text-[10px] uppercase tracking-[-0.05em] whitespace-pre-line ${
                            c.leftOffset !== undefined ? 'sticky z-50 bg-white' : ''
                          } ${c.id === 'net' ? 'bg-green-500 text-white border-green-700' : 'bg-white text-gray-500'}`}>
                            {c.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredAttendanceSummaryData.map((e, idx)=>(
                        <tr key={e.id} className={`border-b border-slate-200 h-[36px] transition-colors hover:bg-blue-50/50 group`}>
                          {visibleDetailedSummaryColumns.map(c=>(
                            <td key={c.id} style={{
                              left: c.leftOffset
                            }} className={`px-2 border-r-2 ${getColumnColorClass(c.id, 'bg')} ${getColumnColorClass(c.id, 'border')} ${
                              ['sno', 'empNo', 'days', 'worked', 'sundays', 'sunWorked', 'holidayWorked', 'hd', 'lop', 'paidDays'].includes(c.id) ? 'text-center' : 
                              ['name', 'designation'].includes(c.id) ? 'text-left' : 'text-right'
                            } ${
                              c.leftOffset !== undefined ? 'sticky z-20 bg-inherit group-hover:bg-blue-50' : ''
                            } ${getColumnColorClass(c.id, 'text')} ${c.id === 'net' ? 'bg-green-600 text-white font-black text-[12px] shadow-inner' : (c.id === 'earnings' ? 'font-black' : 'font-medium')}`}>
                              {c.id === 'name' ? (
                                <div className="truncate w-full" title={e.name}>{renderDetailedCell(c.id, e)}</div>
                              ) : renderDetailedCell(c.id, e)}
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
            </>
          )}
        </div>
          </div>
        )}
        {activeTab === 'loan' && (
          <div className="flex flex-col h-full overflow-hidden bg-white">
            <div className="flex border-b border-[#e5e5e5] overflow-x-auto shrink-0 px-4">
              {['Configuration', 'Active Schedules', 'History'].map(mod => {
                const isActive = loanActiveModule === mod
                return (
                  <button
                    key={mod}
                    onClick={() => setLoanActiveModule(mod)}
                    className={`whitespace-nowrap px-4 py-3 text-[12px] font-medium transition-all border-b-2 ${
                      isActive ? 'border-[#525252] text-[#171717]' : 'border-transparent text-[#737373] hover:text-[#171717]'
                    }`}
                  >
                    {mod}
                  </button>
                )
              })}
            </div>

            <div className="flex-1 overflow-auto p-6">
              {loanActiveModule === 'Configuration' && (
                <div className="max-w-2xl mx-auto">      
                  <div className="bg-white rounded-lg border border-[#e5e5e5] shadow-sm overflow-hidden">       
                    <div className="px-5 py-4 border-b border-[#e5e5e5] bg-[#fafafa] flex justify-between items-center">
                      <div>
                        <h3 className="text-base font-semibold text-[#171717]">Loan Setup</h3>
                        <p className="text-[11px] text-[#525252] mt-0.5">Create and manage loan recovery schedules</p>
                      </div>
                    </div>
                    <div className="p-5 space-y-4">
                      <div className="space-y-1.5">
                        <label className="text-[11px] font-medium text-[#525252]">Target Employee</label>
                        <select value={loanForm.employeeId} onChange={e => setEditLoanForm({...loanForm, employeeId: e.target.value})} className="w-full h-9 border border-[#d4d4d4] rounded-md px-3 bg-white focus:outline-none focus:border-[#171717] text-[13px] text-[#171717]">
                          <option value="">Choose Employee...</option>
                          {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                        </select>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <label className="text-[11px] font-medium text-[#525252]">Principal Amount (₹)</label>
                          <input type="number" value={loanForm.totalAmount} onChange={e => setEditLoanForm({...loanForm, totalAmount: e.target.value})} className="w-full h-9 border border-[#d4d4d4] rounded-md px-3 bg-white focus:outline-none focus:border-[#171717] text-[13px] font-medium text-[#171717]" placeholder="0.00" />    
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[11px] font-medium text-[#525252]">Monthly EMI (₹)</label>
                          <input type="number" value={loanForm.emiAmount} onChange={e => setEditLoanForm({...loanForm, emiAmount: e.target.value})} className="w-full h-9 border border-[#d4d4d4] rounded-md px-3 bg-white focus:outline-none focus:border-[#171717] text-[13px] font-medium text-[#171717]" placeholder="0.00" />
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[11px] font-medium text-[#525252]">Recovery Remarks</label>
                        <input type="text" value={loanForm.remarks} onChange={e => setEditLoanForm({...loanForm, remarks: e.target.value})} className="w-full h-9 border border-[#d4d4d4] rounded-md px-3 bg-white focus:outline-none focus:border-[#171717] text-[13px] font-medium text-[#171717]" placeholder="Reason for loan..." />
                      </div>
                      <div className="pt-2 flex gap-3">
                        <button onClick={() => { setEditLoanForm({ employeeId: '', totalAmount: '', emiAmount: '', remarks: '' }); setEditingLoanId(null); setLoanActiveModule('Active Schedules'); }} className="flex-1 h-9 border border-[#d4d4d4] rounded-md bg-white text-[13px] font-medium text-[#525252] hover:bg-[#f5f5f5] transition-all">Cancel</button>
                        <button onClick={handleCreateLoan} disabled={loading} className="flex-1 h-9 bg-[#171717] text-white rounded-md text-[13px] font-medium hover:bg-black transition-all">
                          {editingLoanId ? 'Update Schedule' : 'Activate Loan'}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {loanActiveModule === 'Active Schedules' && (
                <div className="space-y-4">
                  <div className="bg-white rounded-lg border border-[#e5e5e5] shadow-sm overflow-hidden">    
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-[#fafafa] text-[11px] font-medium text-[#525252] h-10 border-b border-[#e5e5e5]">
                            <th className="px-4 border-r border-[#e5e5e5]">Employee</th>
                            <th className="px-4 border-r border-[#e5e5e5] text-right">Principal (₹)</th>
                            <th className="px-4 border-r border-[#e5e5e5] text-right">EMI (₹)</th>
                            <th className="px-4 border-r border-[#e5e5e5] text-center">This Month</th>
                            <th className="px-4 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#e5e5e5]">
                          {loans.length === 0 ? (
                            <tr><td colSpan={5} className="px-4 py-16 text-center text-[12px] text-[#525252]">No active loan schedules</td></tr>
                          ) : loans.map(l => (
                            <tr key={l.id} className="hover:bg-[#f5f5f5] transition-colors h-12 group">       
                              <td className="px-4 border-r border-[#e5e5e5] text-[13px] font-medium text-[#171717]">{l.employeeName}</td>
                              <td className="px-4 border-r border-[#e5e5e5] text-right text-[13px] font-medium text-[#171717]">{Number(l.totalAmount || 0).toLocaleString('en-IN')}</td>
                              <td className="px-4 border-r border-[#e5e5e5] text-right text-[13px] font-medium text-emerald-600">{Number(l.emiAmount || 0).toLocaleString('en-IN')}</td>
                              <td className="px-4 text-right">
                                <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-all">
                                  <button onClick={() => handleEditLoan(l)} className="p-1.5 text-[#525252] hover:bg-white rounded border border-transparent hover:border-[#d4d4d4] transition-all" title="Edit"><Edit2 size={14}/></button>
                                  <button onClick={() => setSelectedLoan(l)} className="p-1.5 text-[#525252] hover:bg-white rounded border border-transparent hover:border-[#d4d4d4] transition-all" title="Override"><RefreshCw size={14}/></button>
                                  <button onClick={() => handleDeleteLoan(l.id, l.employeeName)} className="p-1.5 text-[#525252] hover:bg-red-50 hover:text-red-600 rounded border border-transparent hover:border-red-200 transition-all" title="Delete"><Trash2 size={14}/></button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {selectedLoan && (
                    <div className="bg-white rounded-lg border border-amber-300 p-5 shadow-sm max-w-3xl mx-auto">
                      <div className="flex justify-between items-center mb-4">
                        <div>
                          <h3 className="text-sm font-semibold text-[#171717]">Manual Override</h3>
                          <p className="text-[11px] text-amber-600">Adjusting: {selectedLoan.employeeName}</p>
                        </div>
                        <button onClick={() => setSelectedLoan(null)} className="p-1 text-[#525252] hover:bg-[#f5f5f5] rounded"><X size={16}/></button>
                      </div>
                      <div className="grid grid-cols-3 gap-4 items-end">
                        <div className="space-y-1">
                          <label className="text-[10px] font-medium text-[#525252]">Target Month</label>
                          <input type="month" value={overrideForm.month} onChange={e => setOverrideForm({...overrideForm, month: e.target.value})} className="w-full h-9 border border-[#d4d4d4] rounded-md px-3 text-[13px] text-[#171717] focus:outline-none focus:border-[#171717]"/>
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-medium text-[#525252]">Override EMI (₹)</label>
                          <input type="number" disabled={overrideForm.skip} value={overrideForm.amount} onChange={e => setOverrideForm({...overrideForm, amount: e.target.value})} className="w-full h-9 border border-[#d4d4d4] rounded-md px-3 text-[13px] font-medium text-[#171717] focus:outline-none focus:border-[#171717] disabled:opacity-50"/>
                        </div>
                        <div className="flex items-center gap-2 h-9">
                          <input type="checkbox" id="skipEMI" checked={overrideForm.skip} onChange={e => setOverrideForm({...overrideForm, skip: e.target.checked})} className="w-4 h-4 rounded border-[#d4d4d4] text-[#171717]"/>
                          <label htmlFor="skipEMI" className="text-[12px] font-medium text-[#525252]">Skip EMI</label>
                        </div>
                      </div>
                      <div className="mt-4 flex justify-end">
                        <button onClick={() => handleUpdateOverride(selectedLoan.id)} className="h-9 px-5 bg-amber-500 text-white rounded-md text-[13px] font-medium hover:bg-amber-600 transition-all">Apply</button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {loanActiveModule === 'History' && (
                <div className="space-y-4">
                  {/* Filters */}
                  <div className="flex gap-4 items-center">
                    <div className="w-64">
                      <select 
                        value={loanHistoryFilter.employeeId}
                        onChange={e => setLoanHistoryFilter({...loanHistoryFilter, employeeId: e.target.value})}
                        className="w-full h-9 border border-[#d4d4d4] rounded-md px-3 text-[13px] text-[#171717] focus:outline-none focus:border-[#171717]"
                      >
                        <option value="">All Employees</option>
{loans.map(l => {
                              const thisMonth = new Date().toISOString().slice(0, 7)
                              const monthOverride = loanOverrides.find(o => o.loanId === l.id && o.month === thisMonth)
                              return (
                            <tr key={l.id} className="hover:bg-[#f5f5f5] transition-colors h-12 group">       
                              <td className="px-4 border-r border-[#e5e5e5] text-[13px] font-medium text-[#171717]">{l.employeeName}</td>
                              <td className="px-4 border-r border-[#e5e5e5] text-right text-[13px] font-medium text-[#171717]">{Number(l.totalAmount || 0).toLocaleString('en-IN')}</td>
                              <td className="px-4 border-r border-[#e5e5e5] text-right text-[13px] font-medium text-emerald-600">{Number(l.emiAmount || 0).toLocaleString('en-IN')}</td>
                              <td className="px-4 border-r border-[#e5e5e5] text-center">
                                {monthOverride ? (
                                  monthOverride.skip ? (
                                    <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-700">Skipped</span>
                                  ) : (
                                    <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-medium bg-blue-100 text-blue-700">Custom</span>
                                  )
                                ) : (
                                  <span className="text-[10px] text-[#a3a3a3]">—</span>
                                )}
                              </td>
                              <td className="px-4 text-right">
                                <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-all">
                                  <button onClick={() => handleEditLoan(l)} className="p-1.5 text-[#525252] hover:bg-white rounded border border-transparent hover:border-[#d4d4d4] transition-all" title="Edit"><Edit2 size={14}/></button>
                                  <button onClick={() => setSelectedLoan(l)} className="p-1.5 text-[#525252] hover:bg-white rounded border border-transparent hover:border-[#d4d4d4] transition-all" title="Override"><RefreshCw size={14}/></button>
                                  <button onClick={() => handleDeleteLoan(l.id, l.employeeName)} className="p-1.5 text-[#525252] hover:bg-red-50 hover:text-red-600 rounded border border-transparent hover:border-red-200 transition-all" title="Delete"><Trash2 size={14}/></button>
                                </div>
                              </td>
                            </tr>
                          )})}
                      </select>
                    </div>
                    <div className="w-40">
                      <input 
                        type="month" 
                        value={loanHistoryFilter.month}
                        onChange={e => setLoanHistoryFilter({...loanHistoryFilter, month: e.target.value})}
                        className="w-full h-9 border border-[#d4d4d4] rounded-md px-3 text-[13px] text-[#171717] focus:outline-none focus:border-[#171717]"
                      />
                    </div>
                    {(loanHistoryFilter.employeeId || loanHistoryFilter.month) && (
                      <button 
                        onClick={() => setLoanHistoryFilter({ employeeId: '', month: '' })}
                        className="text-[12px] text-[#525252] hover:text-[#171717]"
                      >
                        Clear filters
                      </button>
                    )}
                  </div>

                  {/* History Table */}
                  <div className="bg-white rounded-lg border border-[#e5e5e5] shadow-sm overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-[#fafafa] text-[11px] font-medium text-[#525252] h-10 border-b border-[#e5e5e5]">
                            <th className="px-4 border-r border-[#e5e5e5]">Employee</th>
                            <th className="px-4 border-r border-[#e5e5e5]">Month</th>
                            <th className="px-4 border-r border-[#e5e5e5] text-right">Scheduled EMI</th>
                            <th className="px-4 border-r border-[#e5e5e5] text-right">Paid Amount</th>
                            <th className="px-4 border-r border-[#e5e5e5] text-center">Status</th>
                            <th className="px-4 text-right">Remaining</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#e5e5e5]">
                          {loans.length === 0 ? (
                            <tr><td colSpan={6} className="px-4 py-12 text-center text-[12px] text-[#525252]">No loans found</td></tr>
                          ) : (
                            loans
                              .filter(l => !loanHistoryFilter.employeeId || l.employeeId === loanHistoryFilter.employeeId)
                              .map(l => {
                                const overrides = loanOverrides.filter(o => o.loanId === l.id)
                                const monthlyEMI = Number(l.emiAmount || 0)
                                const totalPaid = overrides.filter(o => !o.skip).reduce((s, o) => s + (o.amount || monthlyEMI), 0)
                                const remaining = Number(l.totalAmount || 0) - totalPaid
                                const skippedCount = overrides.filter(o => o.skip).length
                                
                                // Generate monthly breakdown
                                const months = []
                                const startDate = l.createdAt?.toDate ? l.createdAt.toDate() : new Date()
                                const currentDate = new Date()
                                let balance = Number(l.totalAmount || 0)
                                
                                for (let d = new Date(startDate); d <= currentDate; d.setMonth(d.getMonth() + 1)) {
                                  const monthStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
                                  const override = overrides.find(o => o.month === monthStr)
                                  const isCurrentMonth = monthStr === loanHistoryFilter.month
                                  
                                  if (!loanHistoryFilter.month || monthStr === loanHistoryFilter.month) {
                                    months.push({
                                      month: monthStr,
                                      override,
                                      isCurrentMonth
                                    })
                                  }
                                }

                                return months.map((m, idx) => {
                                  const paid = m.override ? (m.override.skip ? 0 : m.override.amount) : (idx < months.length - 1 ? monthlyEMI : 0)
                                  balance -= paid
                                  const showRow = !loanHistoryFilter.month || m.month === loanHistoryFilter.month
                                  
                                  if (!showRow) return null
                                  
                                  return (
                                    <tr key={`${l.id}_${m.month}`} className={`h-11 hover:bg-[#f5f5f5] ${m.isCurrentMonth ? 'bg-amber-50' : ''}`}>
                                      <td className="px-4 border-r border-[#e5e5e5] text-[13px] font-medium text-[#171717]">{l.employeeName}</td>
                                      <td className="px-4 border-r border-[#e5e5e5] text-[12px] text-[#525252]">{m.month}</td>
                                      <td className="px-4 border-r border-[#e5e5e5] text-right text-[13px] text-[#525252]">{monthlyEMI.toLocaleString('en-IN')}</td>
                                      <td className="px-4 border-r border-[#e5e5e5] text-right text-[13px] font-medium text-[#171717]">{paid.toLocaleString('en-IN')}</td>
                                      <td className="px-4 border-r border-[#e5e5e5] text-center">
                                        {m.override?.skip ? (
                                          <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-700">Skipped</span>
                                        ) : m.override?.amount && m.override.amount !== monthlyEMI ? (
                                          <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-medium bg-blue-100 text-blue-700">Custom</span>
                                        ) : paid > 0 ? (
                                          <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-100 text-emerald-700">Paid</span>
                                        ) : (
                                          <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-500">Pending</span>
                                        )}
                                      </td>
                                      <td className="px-4 text-right text-[13px] font-semibold text-[#171717]">{Math.max(0, balance).toLocaleString('en-IN')}</td>
                                    </tr>
                                  )
                                })
                              }).flat()
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </div>
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
