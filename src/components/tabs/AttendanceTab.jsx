import React, { useState, useEffect, useMemo, useRef } from 'react'
import DatePicker from 'react-datepicker'
import 'react-datepicker/dist/react-datepicker.css'
import { format, parseISO } from 'date-fns'
import { useAuth } from '../../hooks/useAuth'
import { useEmployees } from '../../hooks/useEmployees'
import { useAttendance, calcOT } from '../../hooks/useAttendance'
import { db } from '../../lib/firebase'
import { doc, getDoc, updateDoc, arrayUnion } from 'firebase/firestore'
import Spinner from '../ui/Spinner'
import Modal from '../ui/Modal'
import TimePicker from '../ui/TimePicker'
import RemarksDropdown from '../ui/RemarksDropdown'
import { isEmployeeActiveStatus } from '../../lib/employeeStatus'
import { getEligibleAllowanceCategories, getAllowanceAmount } from '../../lib/allowanceRules'
import { useAllowanceCategories, useAllowanceClaims, fetchAllowanceApprovalMode } from '../../hooks/useAllowances'
import SalarySlipTab from './SalarySlipTab'
import { SubTabsNav } from '../ui/SubTabsNav'
import { ChevronLeft, ChevronRight, Check, Copy, X, Plus, ArrowRight, RefreshCw, Trash2, Calendar, FileText, Search, Download, AlertCircle, CalendarX, LayoutGrid, List } from 'lucide-react'
import { logActivity } from '../../hooks/useActivityLog'
import { Document, Page, Text, View, StyleSheet, PDFDownloadLink } from '@react-pdf/renderer'

// PDF Styles
const pdfStyles = StyleSheet.create({
  page: { padding: 30, fontSize: 10, fontFamily: 'Helvetica' },
  header: { marginBottom: 20, textAlign: 'center' },
  title: { fontSize: 18, fontWeight: 'bold', marginBottom: 5 },
  subtitle: { fontSize: 12, color: '#666', marginBottom: 15 },
  table: { display: 'table', width: 'auto', borderStyle: 'solid', borderWidth: 1, borderRightWidth: 0, borderBottomWidth: 0 },
  tableRow: { margin: 'auto', flexDirection: 'row' },
  tableColHeader: { width: '16.6%', borderStyle: 'solid', borderWidth: 1, borderLeftWidth: 0, borderTopWidth: 0, backgroundColor: '#f3f4f6', padding: 5 },
  tableCol: { width: '16.6%', borderStyle: 'solid', borderWidth: 1, borderLeftWidth: 0, borderTopWidth: 0, padding: 5 },
  tableCellHeader: { fontWeight: 'bold' },
  tableCell: { margin: 'auto', marginTop: 5, fontSize: 8 }
})

// PDF Component
const AttendancePDF = ({ data, startDate, endDate, orgName }) => (
  <Document>
    <Page size="A4" style={pdfStyles.page}>
      <View style={pdfStyles.header}>
        <Text style={pdfStyles.title}>{orgName || 'Attendance Report'}</Text>
        <Text style={pdfStyles.subtitle}>Period: {displayDate(startDate)} to {displayDate(endDate)}</Text>
      </View>
      <View style={pdfStyles.table}>
        <View style={pdfStyles.tableRow}>
          <View style={pdfStyles.tableColHeader}><Text style={pdfStyles.tableCellHeader}>Date</Text></View>
          <View style={pdfStyles.tableColHeader}><Text style={pdfStyles.tableCellHeader}>Name</Text></View>
          <View style={pdfStyles.tableColHeader}><Text style={pdfStyles.tableCellHeader}>Shift</Text></View>
          <View style={pdfStyles.tableColHeader}><Text style={pdfStyles.tableCellHeader}>In</Text></View>
          <View style={pdfStyles.tableColHeader}><Text style={pdfStyles.tableCellHeader}>Out</Text></View>
          <View style={pdfStyles.tableColHeader}><Text style={pdfStyles.tableCellHeader}>Status</Text></View>
        </View>
        {data.map((row, i) => (
          <View key={i} style={pdfStyles.tableRow}>
            <View style={pdfStyles.tableCol}><Text style={pdfStyles.tableCell}>{displayDate(row.date)}</Text></View>
            <View style={pdfStyles.tableCol}><Text style={pdfStyles.tableCell}>{row.name}</Text></View>
            <View style={pdfStyles.tableCol}><Text style={pdfStyles.tableCell}>{row.shiftType}</Text></View>
            <View style={pdfStyles.tableCol}><Text style={pdfStyles.tableCell}>{row.inTime || '-'}</Text></View>
            <View style={pdfStyles.tableCol}><Text style={pdfStyles.tableCell}>{row.outTime || '-'}</Text></View>
            <View style={pdfStyles.tableCol}><Text style={pdfStyles.tableCell}>{row.status}</Text></View>
          </View>
        ))}
      </View>
    </Page>
  </Document>
)

// Excel PDF Styles
const pdfExcelStyles = StyleSheet.create({
  page: { padding: 20, fontSize: 8, fontFamily: 'Helvetica' },
  header: { marginBottom: 15, textAlign: 'center' },
  title: { fontSize: 16, fontWeight: 'bold', marginBottom: 5 },
  subtitle: { fontSize: 10, color: '#666', marginBottom: 10 },
  table: { display: 'table', width: 'auto', borderStyle: 'solid', borderWidth: 1, borderColor: '#cbd5e1', borderRightWidth: 0, borderBottomWidth: 0 },
  tableRow: { margin: 'auto', flexDirection: 'row' },
  tableColHeaderName: { width: '16%', borderStyle: 'solid', borderWidth: 1, borderColor: '#cbd5e1', borderLeftWidth: 0, borderTopWidth: 0, backgroundColor: '#f1f5f9', padding: 4 },
  tableColHeaderDate: { width: '10%', borderStyle: 'solid', borderWidth: 1, borderColor: '#cbd5e1', borderLeftWidth: 0, borderTopWidth: 0, backgroundColor: '#f1f5f9', padding: 4 },
  tableColHeader: { width: '10.57%', borderStyle: 'solid', borderWidth: 1, borderColor: '#cbd5e1', borderLeftWidth: 0, borderTopWidth: 0, backgroundColor: '#f1f5f9', padding: 4 },
  tableColName: { width: '16%', borderStyle: 'solid', borderWidth: 1, borderColor: '#cbd5e1', borderLeftWidth: 0, borderTopWidth: 0, padding: 4 },
  tableColDate: { width: '10%', borderStyle: 'solid', borderWidth: 1, borderColor: '#cbd5e1', borderLeftWidth: 0, borderTopWidth: 0, padding: 4 },
  tableCol: { width: '10.57%', borderStyle: 'solid', borderWidth: 1, borderColor: '#cbd5e1', borderLeftWidth: 0, borderTopWidth: 0, padding: 4 },
  tableCellHeader: { fontWeight: 'bold', fontSize: 7, textAlign: 'center' },
  tableCell: { margin: 'auto', marginTop: 2, fontSize: 7, textAlign: 'center' }
})

// Detailed Excel PDF Component
const AttendanceExcelPDF = ({ data, startDate, endDate, orgName, employees }) => {
  const parseTimeToMinutes = (time24) => {
    if (!time24 || !time24.includes(':')) return null
    const [h, m] = time24.split(':').map(Number)
    if (Number.isNaN(h) || Number.isNaN(m)) return null
    return (h * 60) + m
  }
  const displayDate = (isoDate) => {
    if (!isoDate) return ''
    const parts = isoDate.split('-')
    if (parts.length < 3) return isoDate
    const [y, m, d] = parts.map(Number)
    const dObj = new Date(y, m - 1, d)
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
    return `${String(d).padStart(2, '0')}-${months[dObj.getMonth()]}`
  }

  const pdfRows = data.map(row => {
    const emp = employees.find(e => e.id === row.employeeId) || {}
    const minHours = Number(row.minDailyHours || emp.minDailyHours || 8)
    const inM = parseTimeToMinutes(row.inTime)
    const outM = parseTimeToMinutes(row.outTime)
    
    let totalWorkingMins = 0
    if (inM != null && outM != null) {
      let endM = outM
      if (endM < inM) endM += 24 * 60
      totalWorkingMins = Math.max(0, endM - inM)
    }
    const totalWorkingHrs = totalWorkingMins / 60
    
    const shift = row.shiftType || 'Day'
    let stdInM = 9 * 60 + 30
    if (shift === 'Night') stdInM = 21 * 60 + 30
    const stdOutM = stdInM + (minHours * 60)
    
    let lateInHrs = 0
    let earlyInHrs = 0
    if (inM != null) {
      if (inM > stdInM) lateInHrs = (inM - stdInM) / 60
      else earlyInHrs = (stdInM - inM) / 60
    }
    
    let lateOutHrs = 0
    let earlyOutHrs = 0
    if (outM != null) {
      let actualOutM = outM
      let targetOutM = stdOutM
      if (shift === 'Night' && actualOutM < 12 * 60) actualOutM += 24 * 60
      if (actualOutM > targetOutM) lateOutHrs = (actualOutM - targetOutM) / 60
      else earlyOutHrs = (targetOutM - actualOutM) / 60
    }
    
    const isAbsent = row.isAbsent || (row.status || '').toLowerCase() === 'absent'

    return {
      date: displayDate(row.date),
      name: row.name || emp.name || '-',
      inTime: isAbsent ? 'Absent' : (row.inTime || '-'),
      outTime: isAbsent ? 'Absent' : (row.outTime || '-'),
      lateInHrs: isAbsent ? '0.00' : lateInHrs.toFixed(2),
      lateOutHrs: isAbsent ? '0.00' : lateOutHrs.toFixed(2),
      earlyInHrs: isAbsent ? '0.00' : earlyInHrs.toFixed(2),
      earlyOutHrs: isAbsent ? '0.00' : earlyOutHrs.toFixed(2),
      actualWorkedHrs: isAbsent ? '0.00' : totalWorkingHrs.toFixed(2)
    }
  })

  return (
    <Document>
      <Page size="A4" orientation="landscape" style={pdfExcelStyles.page}>
        <View style={pdfExcelStyles.header}>
          <Text style={pdfExcelStyles.title}>{orgName || 'Attendance Report'} - Detailed Excel Sheet</Text>
          <Text style={pdfExcelStyles.subtitle}>Period: {displayDate(startDate)} to {displayDate(endDate)}</Text>
        </View>
        <View style={pdfExcelStyles.table}>
          <View style={pdfExcelStyles.tableRow}>
            <View style={pdfExcelStyles.tableColHeaderDate}><Text style={pdfExcelStyles.tableCellHeader}>Date</Text></View>
            <View style={pdfExcelStyles.tableColHeaderName}><Text style={pdfExcelStyles.tableCellHeader}>Employee Name</Text></View>
            <View style={pdfExcelStyles.tableColHeader}><Text style={pdfExcelStyles.tableCellHeader}>In Time</Text></View>
            <View style={pdfExcelStyles.tableColHeader}><Text style={pdfExcelStyles.tableCellHeader}>Out Time</Text></View>
            <View style={pdfExcelStyles.tableColHeader}><Text style={pdfExcelStyles.tableCellHeader}>Late In (h)</Text></View>
            <View style={pdfExcelStyles.tableColHeader}><Text style={pdfExcelStyles.tableCellHeader}>Late Out (h)</Text></View>
            <View style={pdfExcelStyles.tableColHeader}><Text style={pdfExcelStyles.tableCellHeader}>Early In (h)</Text></View>
            <View style={pdfExcelStyles.tableColHeader}><Text style={pdfExcelStyles.tableCellHeader}>Early Out (h)</Text></View>
            <View style={pdfExcelStyles.tableColHeader}><Text style={pdfExcelStyles.tableCellHeader}>Worked Hrs</Text></View>
          </View>
          {pdfRows.map((row, i) => (
            <View key={i} style={pdfExcelStyles.tableRow}>
              <View style={pdfExcelStyles.tableColDate}><Text style={pdfExcelStyles.tableCell}>{row.date}</Text></View>
              <View style={pdfExcelStyles.tableColName}><Text style={pdfExcelStyles.tableCell}>{row.name}</Text></View>
              <View style={pdfExcelStyles.tableCol}><Text style={pdfExcelStyles.tableCell}>{row.inTime}</Text></View>
              <View style={pdfExcelStyles.tableCol}><Text style={pdfExcelStyles.tableCell}>{row.outTime}</Text></View>
              <View style={pdfExcelStyles.tableCol}><Text style={pdfExcelStyles.tableCell}>{row.lateInHrs}</Text></View>
              <View style={pdfExcelStyles.tableCol}><Text style={pdfExcelStyles.tableCell}>{row.lateOutHrs}</Text></View>
              <View style={pdfExcelStyles.tableCol}><Text style={pdfExcelStyles.tableCell}>{row.earlyInHrs}</Text></View>
              <View style={pdfExcelStyles.tableCol}><Text style={pdfExcelStyles.tableCell}>{row.earlyOutHrs}</Text></View>
              <View style={pdfExcelStyles.tableCol}><Text style={pdfExcelStyles.tableCell}>{row.actualWorkedHrs}</Text></View>
            </View>
          ))}
        </View>
      </Page>
    </Document>
  )
}

function getInitials(name) {
  return name?.split(' ').map(n => n[0]).join('').toUpperCase() || '??'
}

function getAvatarColor(id) {
  let hash = 0
  for (let i = 0; i < (id || '').length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash)
  const h = hash % 360
  return `hsl(${h}, 70%, 50%)`
}

function formatDate(date) {
  const d = new Date(date)
  const days = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY']
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
  return `${days[d.getDay()]} ${String(d.getDate()).padStart(2, '0')} ${months[d.getMonth()]} ${d.getFullYear()}`
}

function formatDateForInput(date) {
  const d = new Date(date)
  return d.toISOString().split('T')[0]
}

// Display date as DD-MM-YYYY
function displayDate(isoDate) {
  if (!isoDate) return ''
  const [y, m, d] = isoDate.split('-')
  return `${d}-${m}-${y}`
}

function displayDateDDMMMM(isoDate) {
  if (!isoDate) return ''
  const parts = isoDate.split('-')
  if (parts.length < 3) return isoDate
  const [y, m, d] = parts.map(Number)
  const dObj = new Date(y, m - 1, d)
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
  return `${String(d).padStart(2, '0')}-${months[dObj.getMonth()]}`
}

// Display date as Mmm Dd (e.g., "Mar 10")
function displayShortDate(isoDate) {
  if (!isoDate) return ''
  const d = new Date(isoDate)
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${months[d.getMonth()]} ${d.getDate()}`
}

function getDateRange(start, end) {
  if (!start || !end) return []
  let s = new Date(`${start}T00:00:00`)
  let e = new Date(`${end}T00:00:00`)
  if (s > e) [s, e] = [e, s]
  const days = []
  while (s <= e) {
    days.push(s.toISOString().split('T')[0])
    s.setDate(s.getDate() + 1)
  }
  return days
}

function parseTimeToMinutes(time24) {
  if (!time24 || !time24.includes(':')) return null
  const [h, m] = time24.split(':').map(Number)
  if (Number.isNaN(h) || Number.isNaN(m)) return null
  return (h * 60) + m
}

function calcWorkMinutes(row) {
  if (!row?.inTime || !row?.outTime) return 0
  const inM = parseTimeToMinutes(row.inTime)
  const outM = parseTimeToMinutes(row.outTime)
  if (inM == null || outM == null) return 0
  let end = outM
  if (end < inM) end += 24 * 60
  return Math.max(0, end - inM)
}

function classifyAttendanceRow(row, empObj = {}) {
  if (!row) return 'none'
  const status = (row.status || '').toLowerCase()
  if (status === 'absent') return 'absent'
  if (status === 'late') return 'late'
  const remarks = row.remarks || ''
  if (/\b(remote|wfh|work from home)\b/i.test(remarks)) return 'remote'
  if (row.otHours) {
    const [h, m] = row.otHours.split(':').map(Number)
    if (((h || 0) * 60 + (m || 0)) >= 60) return 'overtime'
  }
  const inM = parseTimeToMinutes(row.inTime)
  
  let stdInM = 9 * 60 + 30
  if (empObj.regularInTime && empObj.regularInTime.includes(':')) {
    const [h, m] = empObj.regularInTime.split(':').map(Number)
    if (!Number.isNaN(h) && !Number.isNaN(m)) stdInM = (h * 60) + m
  } else if ((row.shiftType || 'Day') === 'Night') {
    stdInM = 21 * 60 + 30
  }
  
  if (inM != null && inM >= stdInM) return 'late'
  return 'present'
}

function calculateExcelMetrics(row, employees) {
  const emp = employees?.find(e => e.id === row.employeeId) || {}
  const minHours = Number(row.minDailyHours || emp.minDailyHours || 8)
  
  const inM = parseTimeToMinutes(row.inTime)
  const outM = parseTimeToMinutes(row.outTime)
  
  let totalWorkingMins = 0
  if (inM != null && outM != null) {
    let endM = outM
    if (endM < inM) endM += 24 * 60
    totalWorkingMins = Math.max(0, endM - inM)
  }
  const totalWorkingHrs = totalWorkingMins / 60
  
  const shift = row.shiftType || 'Day'
  let stdInM = 9 * 60 + 30
  if (emp.regularInTime && emp.regularInTime.includes(':')) {
    const [h, m] = emp.regularInTime.split(':').map(Number)
    if (!Number.isNaN(h) && !Number.isNaN(m)) stdInM = (h * 60) + m
  } else if (shift === 'Night') {
    stdInM = 21 * 60 + 30
  }
  
  let stdOutM = stdInM + (minHours * 60)
  if (emp.regularOutTime && emp.regularOutTime.includes(':')) {
    const [h, m] = emp.regularOutTime.split(':').map(Number)
    if (!Number.isNaN(h) && !Number.isNaN(m)) stdOutM = (h * 60) + m
  }
  
  let lateInHrs = 0
  let earlyInHrs = 0
  if (inM != null) {
    if (inM > stdInM) {
      lateInHrs = (inM - stdInM) / 60
    } else {
      earlyInHrs = (stdInM - inM) / 60
    }
  }
  
  let lateOutHrs = 0
  let earlyOutHrs = 0
  if (outM != null) {
    let actualOutM = outM
    let targetOutM = stdOutM
    if (shift === 'Night' && actualOutM < 12 * 60) {
      actualOutM += 24 * 60
    }
    
    if (actualOutM > targetOutM) {
      lateOutHrs = (actualOutM - targetOutM) / 60
    } else {
      earlyOutHrs = (targetOutM - actualOutM) / 60
    }
  }
  
  const actualWorkedHrs = totalWorkingHrs
  const isShortOfStandard = actualWorkedHrs < minHours && inM != null && outM != null

  return {
    totalWorkingHrs,
    lateInHrs,
    lateOutHrs,
    earlyInHrs,
    earlyOutHrs,
    actualWorkedHrs,
    isShortOfStandard,
    minHours
  }
}

function getStatusColor(status) {
  switch (status) {
    case 'present':
      return 'bg-emerald-500'
    case 'late':
      return 'bg-amber-400'
    case 'absent':
      return 'bg-gray-300'
    case 'remote':
      return 'bg-blue-500'
    case 'overtime':
      return 'bg-violet-500'
    default:
      return 'bg-gray-100'
  }
}

// Helper for time formatting
function formatTimeDisplay(time24) {
  if (!time24) return '';
  const [h, m] = time24.split(':').map(Number);
  const p = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${p}`;
}

function ShiftToggle({ value, onChange, disabled, employeeName }) {
  const shift = value === 'Night' || value === 'DN' ? value : 'Day'
  const options = [
    { value: 'Day', title: 'Day shift', zone: 'left-0' },
    { value: 'DN', title: 'Day-night shift', zone: 'left-[28px]' },
    { value: 'Night', title: 'Night shift', zone: 'left-[56px]' },
  ]
  const tone = shift === 'DN' ? 'bg-indigo-600' : shift === 'Night' ? 'bg-slate-700' : 'bg-emerald-500'
  const knobPosition = shift === 'DN' ? 'left-[29px]' : shift === 'Night' ? 'left-[57px]' : 'left-0.5'
  const labelPosition = shift === 'DN' || shift === 'Night' ? 'left-2.5' : 'right-2.5'

  return (
    <div className={`relative h-7 w-[84px] shrink-0 rounded-full p-0.5 shadow-sm transition-colors ${tone} ${disabled ? 'opacity-50' : ''}`} role="radiogroup" aria-label={`${employeeName} shift`}>
      {options.map((option) => (
        <button key={option.value} type="button" role="radio" aria-checked={shift === option.value} aria-label={option.title} title={option.title} disabled={disabled} onClick={() => onChange(option.value)} className={`absolute top-0 z-20 h-full w-[28px] cursor-pointer disabled:cursor-not-allowed ${option.zone}`} />
      ))}
      <span className={`pointer-events-none absolute top-0.5 z-10 h-6 w-[26px] rounded-full bg-white shadow-sm transition-all duration-200 ${knobPosition}`} />
      <span className={`pointer-events-none absolute top-[7px] z-10 text-[8px] font-black tracking-tight text-white ${labelPosition}`}>{shift === 'Night' ? 'NIGHT' : shift === 'DN' ? 'D+N' : 'DAY'}</span>
    </div>
  )
}

// Shorthand conversion logic
function convertShorthand(val, period) {
  const digits = val.replace(/\D/g, '');
  let h, m;
  if (digits.length === 3) {
    h = parseInt(digits[0]);
    m = parseInt(digits.slice(1));
  } else if (digits.length === 4) {
    h = parseInt(digits.slice(0, 2));
    m = parseInt(digits.slice(2));
  } else if (digits.length === 2) {
    // If 2 digits could be hour (e.g., "10a" -> "10"), treat as hour:00
    const num = parseInt(digits);
    if (num <= 12) {
      h = num;
      m = 0;
    } else {
      h = new Date().getHours() % 12 || 12;
      m = num > 59 ? 50 : num;
    }
  } else if (digits.length === 1) {
    h = parseInt(digits);
    m = 0;
  } else {
    return null;
  }

  if (h > 12) h = 12;
  if (m > 59) m = 59;

  let h24 = h;
  if (period === 'PM' && h24 !== 12) h24 += 12;
  if (period === 'AM' && h24 === 12) h24 = 0;
  
  return `${String(h24).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

const TimeEditableCell = ({ value, onChange, onShowPicker, disabled, backgroundColor, rowIdx, field, placeholder, extra, error, scope = 'desktop' }) => {
  const [tempValue, setTempValue] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    if (!isEditing) {
      setTempValue(value ? formatTimeDisplay(value) : '');
    }
  }, [value, isEditing]);

  const handleKeyDown = (e) => {
    if (disabled) return;
    const key = e.key.toLowerCase();
    if (key === 'a' || key === 'p') {
      e.preventDefault();
      const period = key === 'a' ? 'AM' : 'PM';
      const time24 = convertShorthand(tempValue, period);
      if (time24) {
        onChange(time24);
        setIsEditing(false);
        // Auto-advance
        setTimeout(() => {
          let nextField = field === 'inTime' ? 'outTime' : 'inTime';
          let nextRowIdx = field === 'outTime' ? rowIdx + 1 : rowIdx;
          const nextInput = document.querySelector(`[data-row="${scope}-${nextRowIdx}"][data-field="${nextField}"]`);
          if (nextInput) {
            nextInput.focus();
          }
        }, 50);
      }
    }
  };

  return (
    <div className="relative flex flex-col w-full gap-1">
      <div 
        onMouseEnter={() => !disabled && setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className={`relative flex items-center rounded-md border min-h-[32px] transition-all ${
          error 
            ? 'border-red-500 shadow-[0_0_0_1px_rgba(239,68,68,0.2)]' 
            : isHovered && !isEditing
              ? 'border-gray-400 shadow-[0_1px_3px_rgba(0,0,0,0.05)]' 
              : 'border-gray-200'
        }`}
        style={{ 
          backgroundColor: disabled 
            ? '#f9fafb' 
            : isHovered && !isEditing
              ? '#f3f4f6' 
              : backgroundColor 
        }}
      >
        <div 
          className="flex-1 flex flex-col items-center min-w-0 py-0.5 cursor-text"
        >
          <div className="relative group w-full">
            <input
              type="text"
              value={tempValue}
              onChange={(e) => { setTempValue(e.target.value); setIsEditing(true); }}
              onFocus={(e) => { 
              setIsEditing(true); 
              e.target.select();
            }}
            onBlur={() => {
              setTimeout(() => setIsEditing(false), 200);
            }}
            onKeyDown={handleKeyDown}
            disabled={disabled}
            data-row={`${scope}-${rowIdx}`}
            data-field={field}
            className="w-full bg-transparent border-none outline-none px-2 text-[13px] font-medium text-center font-['Roboto',sans-serif] text-gray-800 placeholder-gray-400/20 outline-none disabled:text-gray-400 h-7 cursor-text"
            placeholder={placeholder || "--:--"}
            />
            <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[10px] text-gray-500 bg-gray-800/50 text-white px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50">
              Type 08a for 08:00 AM, 1210p for 12:10 PM
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); if (!disabled) onShowPicker(); }}
          disabled={disabled}
          className="pr-2 text-gray-400 hover:text-indigo-600 cursor-pointer text-xs"
          title="Open time picker"
        >
          🕐
        </button>
      </div>
      {error && <span className="text-[9px] text-red-500 font-bold uppercase leading-none text-center animate-in fade-in duration-300">{error}</span>}
    </div>
  );
};

function CompactAttendanceRow({ row, idx, employees, rows, handleEmployeeSelect, handleClearRow, updateRow, showInTimePicker, setShowInTimePicker, showOutTimePicker, setShowOutTimePicker, validationErrors, allowanceCategories, allowanceSelections, toggleAllowance, remarksOptions, handleAddRemarkOption, handleStatusChange, isSunday, isConfiguredHoliday }) {
  const eligible = row.employeeId && !row.isAbsent ? getEligibleAllowanceCategories(allowanceCategories, { employeeId: row.employeeId, outTime: row.outTime }) : []
  const selectedAllowances = allowanceSelections[row.employeeId] || []
  const statusOptions = [{ id: 'Present', label: 'Present' }, { id: 'Absent', label: 'Absent' }, ...(isSunday ? [{ id: 'SunWorked', label: 'Worked' }, { id: 'SunHoliday', label: 'Holiday' }] : []), ...(isConfiguredHoliday ? [{ id: 'Worked', label: 'Worked' }, { id: 'Holiday', label: 'Holiday' }] : [])]
  const disabled = row.isAbsent || row.status === 'SunHoliday'

  if (!row.employeeId) {
    return (
      <div className="flex items-center gap-2 px-1 py-2">
        <select value="" onChange={(e) => handleEmployeeSelect(idx, e.target.value)} className="h-9 min-w-0 flex-1 rounded-md bg-gray-50 px-2 text-xs font-medium outline-none focus:ring-2 focus:ring-indigo-500">
          <option value="">Select employee…</option>
          {employees.filter(e => !e.hideInAttendance && !rows.some(r => r.employeeId === e.id)).map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
        <button onClick={() => handleClearRow(row.employeeId)} disabled={!row.employeeId} className="h-8 w-8 shrink-0 text-gray-400 disabled:opacity-30" aria-label="Clear attendance row"><X size={15} /></button>
      </div>
    )
  }

	  return (
	    <div className={`px-1 py-2 ${row.isAbsent ? 'bg-red-50/40' : ''}`}>
	              <div className="relative flex items-center gap-1.5 min-w-0">
	        <div className="min-w-0 flex-1 truncate text-sm font-semibold text-gray-900">{row.name}</div>
	        <ShiftToggle value={row.shiftType} onChange={(shiftType) => updateRow(row.employeeId, 'shiftType', shiftType)} disabled={disabled} employeeName={row.name} />
	        <select aria-label={`${row.name} attendance status`} value={row.status || 'Present'} onChange={(e) => handleStatusChange(row.employeeId, e.target.value)} className={`h-8 w-[72px] shrink-0 rounded-md px-1.5 text-[10px] font-semibold outline-none ${row.status === 'Absent' ? 'bg-red-50 text-red-700' : row.status === 'SunHoliday' || row.status === 'Holiday' ? 'bg-indigo-50 text-indigo-700' : row.status === 'SunWorked' || row.status === 'Worked' ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>
          {statusOptions.map(st => <option key={st.id} value={st.id}>{st.label}</option>)}
        </select>
        <button onClick={() => handleClearRow(row.employeeId)} className="h-8 w-7 shrink-0 text-gray-400 active:text-red-500" aria-label="Clear attendance row"><X size={14} /></button>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.45fr)] items-start gap-1.5 pt-1.5">
        <div className="relative min-w-0"><TimeEditableCell value={row.inTime} onChange={(time) => updateRow(row.employeeId, 'inTime', time)} onShowPicker={() => setShowInTimePicker(showInTimePicker === row.employeeId ? null : row.employeeId)} disabled={disabled} backgroundColor="#e8f4f8" rowIdx={idx} field="inTime" scope="compact-mobile" error={validationErrors[row.employeeId]} />{showInTimePicker === row.employeeId && <TimePicker variant="attendance" value={row.inTime || '09:00'} onChange={(time) => updateRow(row.employeeId, 'inTime', time)} onClose={() => setShowInTimePicker(null)} />}</div>
        <div className="relative min-w-0"><TimeEditableCell value={row.outTime} onChange={(time) => updateRow(row.employeeId, 'outTime', time)} onShowPicker={() => setShowOutTimePicker(showOutTimePicker === row.employeeId ? null : row.employeeId)} disabled={disabled} backgroundColor="#fff4e8" rowIdx={idx} field="outTime" scope="compact-mobile" placeholder="09:00 PM" error={validationErrors[row.employeeId]} />{showOutTimePicker === row.employeeId && <TimePicker variant="attendance" value={row.outTime || '21:00'} onChange={(time) => updateRow(row.employeeId, 'outTime', time)} onClose={() => setShowOutTimePicker(null)} />}</div>
        <RemarksDropdown value={row.remarks || ''} onChange={val => updateRow(row.employeeId, 'remarks', val)} onAddOption={handleAddRemarkOption} options={remarksOptions} disabled={row.isAbsent} className="w-full" />
      </div>
      {eligible.length > 0 && <div className="flex items-center gap-1.5 overflow-x-auto pt-1.5 pb-0.5">{eligible.map(cat => <label key={cat.id} className="inline-flex min-h-6 shrink-0 items-center gap-1 bg-emerald-50 px-1.5 text-[10px] text-emerald-800"><input type="checkbox" checked={selectedAllowances.includes(cat.id)} onChange={() => toggleAllowance(row.employeeId, cat.id)} className="h-3 w-3 rounded border-gray-300 text-indigo-600" /><span>{cat.name}</span><span className="font-semibold">₹{getAllowanceAmount(cat)}</span></label>)}</div>}
    </div>
  )
}

// ─── Dropdown Copy Picker ───────────────────────────────────────────────────
function CopyToDropdown({ activeEmployees, copyConfig, setCopyConfig, selectedEmps, setSelectedEmps, onApply, onClose }) {
  const dropdownRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  return (
    <div
      ref={dropdownRef}
      className="absolute top-0 left-full ml-2 z-[1000] bg-white rounded-[10px] shadow-[0_8px_24px_rgba(0,0,0,0.12)] border border-gray-100 p-2.5 w-[210px] font-inter animate-in fade-in slide-in-from-left-2 duration-200"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="pb-1.5 border-b border-gray-100 mb-2">
        <p className="text-[10px] font-black text-indigo-600 uppercase tracking-[0.08em]">Copy to</p>
      </div>

      <div className="flex gap-2 mb-2 bg-indigo-50/50 p-1.5 rounded-lg border border-indigo-100">
        <label className="flex items-center gap-1.5 cursor-pointer flex-1">
          <input type="checkbox" checked={copyConfig.inTime} onChange={e => setCopyConfig(c => ({ ...c, inTime: e.target.checked }))} className="w-3 h-3 rounded text-indigo-600" />
          <span className="text-[9px] font-bold text-indigo-700 uppercase">In Time</span>
        </label>
        <label className="flex items-center gap-1.5 cursor-pointer flex-1">
          <input type="checkbox" checked={copyConfig.outTime} onChange={e => setCopyConfig(c => ({ ...c, outTime: e.target.checked }))} className="w-3 h-3 rounded text-indigo-600" />
          <span className="text-[9px] font-bold text-indigo-700 uppercase">Out Time</span>
        </label>
      </div>

      <div className="max-h-[150px] overflow-y-auto border border-gray-100 rounded-lg mb-2.5 bg-gray-50/30">
        {activeEmployees.map(emp => (
          <label key={emp.id} className="flex items-center gap-2 px-3 py-1.5 hover:bg-white cursor-pointer border-b border-gray-100 last:border-0 transition-colors group">
            <input
              type="checkbox"
              checked={selectedEmps.includes(emp.id)}
              onChange={e => {
                if (e.target.checked) setSelectedEmps(p => [...p, emp.id])
                else setSelectedEmps(p => p.filter(id => id !== emp.id))
              }}
              className="w-3 h-3 rounded text-indigo-600"
            />
            <span className="text-[10px] font-semibold text-gray-600 uppercase truncate group-hover:text-gray-900">{emp.name}</span>
          </label>
        ))}
      </div>

      <button
        onClick={onApply}
        className="h-[28px] w-full bg-indigo-600 text-white font-bold rounded-lg text-[10px] shadow-sm uppercase tracking-widest hover:bg-indigo-700 transition-all flex items-center justify-center gap-1.5"
      >
        <Copy size={12} /> Apply
      </button>
    </div>
  );
}

export default function AttendanceTab({ defaultSubTab, onSubTabChange, onConfigAllowance, onDirtyChange, onOpenHolidaySettings, onReviewEmployees }) {
  const { user } = useAuth()
  const { employees, loading: empLoading } = useEmployees(user?.orgId, false)
  const { fetchByDate, upsertAttendance, deleteByDate, loading: attLoading, fetchRange, deleteIndividualAttendance } = useAttendance(user?.orgId)

  const [activeSubTab, setActiveSubTab] = useState(defaultSubTab === 'reports' || defaultSubTab === 'grid' ? defaultSubTab : 'attendance') // 'attendance' | 'grid' | 'reports'

  useEffect(() => {
    if (defaultSubTab && (defaultSubTab === 'reports' || defaultSubTab === 'grid' || defaultSubTab === 'attendance')) {
      setActiveSubTab(defaultSubTab)
    }
  }, [defaultSubTab])

  useEffect(() => {
    if (onSubTabChange) {
      onSubTabChange(activeSubTab)
    }
  }, [activeSubTab, onSubTabChange])
  const [reportsView, setReportsView] = useState('timeline') // 'timeline' or 'excel'
  const [compactMode, setCompactMode] = useState(false)
  const [selectedDate, setSelectedDate] = useState(formatDateForInput(new Date()))
  const [remarksOptions, setRemarksOptions] = useState([])

  const handleAddRemarkOption = async (newOption) => {
    if (!user?.orgId) return
    const trimmed = newOption.trim()
    if (!trimmed || remarksOptions.includes(trimmed)) return
    
    // Optimistic update
    setRemarksOptions(prev => [...prev, trimmed])
    
    try {
      await updateDoc(doc(db, 'organisations', user.orgId), {
        remarksOptions: arrayUnion(trimmed)
      })
    } catch (err) {
      console.error('Error adding remark option:', err)
      // Rollback optimistic update
      setRemarksOptions(prev => prev.filter(o => o !== trimmed))
    }
  }

  useEffect(() => {
    const fetchOrgSettings = async () => {
      if (!user?.orgId) return
      const snap = await getDoc(doc(db, 'organisations', user.orgId))
      if (snap.exists()) {
        setRemarksOptions(snap.data().remarksOptions || [])
      }
    }
    fetchOrgSettings()
  }, [user?.orgId])
  
  // Reports Filter States
  const [filterStartDate, setFilterStartDate] = useState(formatDateForInput(new Date(new Date().getFullYear(), new Date().getMonth(), 1)))
  const [filterEndDate, setFilterEndDate] = useState(formatDateForInput(new Date()))
  const [filterMonth, setFilterMonth] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  })

  const handleMonthChange = (monthStr) => {
    if (!monthStr) return
    const [y, m] = monthStr.split('-').map(Number)
    const lastDay = new Date(y, m, 0).getDate()
    setFilterStartDate(`${monthStr}-01`)
    setFilterEndDate(`${monthStr}-${String(lastDay).padStart(2, '0')}`)
  }
  
  const [filterCategory, setFilterCategory] = useState('')
  const [filterName, setFilterName] = useState('')
  const [reportData, setFilterReportData] = useState([])
  const [reportLoading, setReportLoading] = useState(false)

  const reportDays = useMemo(() => getDateRange(filterStartDate, filterEndDate), [filterStartDate, filterEndDate])

  const reportByEmployee = useMemo(() => {
    const map = new Map()
    reportData.forEach((row, idx) => {
      const key = row.employeeId || row.name || `row-${idx}`
      
      // Filter out hidden employees from reports
      const emp = employees.find(e => e.id === row.employeeId)
      if (emp?.hideInAttendance) return

      if (!map.has(key)) {
        map.set(key, {
          id: row.employeeId || key,
          name: row.name || 'Unknown',
          department: row.department || row.designation || row.role || row.site || 'General',
          regularInTime: emp?.regularInTime || '',
          regularOutTime: emp?.regularOutTime || '',
          rows: {}
        })
      }
      map.get(key).rows[row.date] = row
    })
    return Array.from(map.values()).sort((a, b) => (a.name || '').localeCompare(b.name || ''))
  }, [reportData, employees])

  const reportSummaryRows = useMemo(() => {
    return reportByEmployee.map(emp => {
      let present = 0
      let absent = 0
      let late = 0
      let totalMinutes = 0
      reportDays.forEach(day => {
        const row = emp.rows[day]
        if (!row) return
        const status = classifyAttendanceRow(row, emp)
        if (status === 'absent') absent += 1
        else present += 1
        if (status === 'late') late += 1
        totalMinutes += calcWorkMinutes(row)
      })
      const totalCount = present + absent
      const attendancePct = totalCount ? Math.round((present / totalCount) * 1000) / 10 : 0
      return {
        id: emp.id,
        name: emp.name,
        department: emp.department,
        present,
        absent,
        late,
        totalHours: totalMinutes ? `${(totalMinutes / 60).toFixed(1)}h` : '0h',
        attendancePct
      }
    })
  }, [reportByEmployee, reportDays])

  const reportTotals = useMemo(() => {
    const todayRows = reportData.filter(r => r.date === filterEndDate)
    const presentToday = todayRows.filter(r => (r.status || '').toLowerCase() !== 'absent').length
    const absentToday = todayRows.filter(r => (r.status || '').toLowerCase() === 'absent').length
    const totalMinutes = todayRows.reduce((sum, row) => sum + calcWorkMinutes(row), 0)
    const avgWorkingHours = todayRows.length ? (totalMinutes / 60 / todayRows.length) : 0
    return {
      totalEmployees: reportByEmployee.length,
      presentToday,
      absentToday,
      avgWorkingHours
    }
  }, [reportByEmployee.length, reportData, filterEndDate])

  const sortedReportRows = useMemo(() => {
    return [...reportData].sort((a, b) => {
      const dateCompare = (b.date || '').localeCompare(a.date || '')
      if (dateCompare !== 0) return dateCompare
      return (a.name || '').localeCompare(b.name || '')
    })
  }, [reportData])

  const [rows, setRows] = useState([])
  const [hasGenerated, setHasGenerated] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [orgData, setOrgData] = useState(null)
  const [existingRecords, setExistingRecords] = useState([])
  const [attendanceFollowUp, setAttendanceFollowUp] = useState({ loading: false, incompleteDays: [], employeeGaps: [] })

  // Dirty tracking: warn user when leaving with unsaved attendance edits
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    onDirtyChange?.(dirty)
  }, [dirty, onDirtyChange])

  useEffect(() => {
    if (!dirty) return
    const handler = (e) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty])

  // Allowance support: rule-based allowance claims raised from the attendance sheet
  const { categories: allowanceCategories } = useAllowanceCategories(user?.orgId)
  const { claims: allowanceClaims, upsertClaimsForAttendance } = useAllowanceClaims(user?.orgId)
  // Per-employee map of selected category ids for the current date: { [employeeId]: [categoryId, ...] }
  const [allowanceSelections, setAllowanceSelections] = useState({})

  const toggleAllowance = (employeeId, categoryId) => {
    setDirty(true)
    setAllowanceSelections(prev => {
      const current = prev[employeeId] || []
      const next = current.includes(categoryId)
        ? current.filter(id => id !== categoryId)
        : [...current, categoryId]
      return { ...prev, [employeeId]: next }
    })
  }

  // Initialize with 5 empty placeholder rows
  useEffect(() => {
    if (activeSubTab === 'attendance' && rows.length === 0 && !hasGenerated) {
      const emptyRows = Array(5).fill(null).map((_, idx) => ({
        employeeId: '',
        name: '',
        date: selectedDate,
        inDate: selectedDate,
        inTime: '',
        outDate: selectedDate,
        outTime: '',
        otHours: '00:00',
        remarks: '',
        isAbsent: false,
        sundayWorked: false,
        sundayHoliday: false,
        shiftType: 'Day',
        status: 'Present',
        isPlaceholder: true,
        isNew: true,
        minDailyHours: 8,
        id: `placeholder-${idx}`
      }))
      setRows(emptyRows)
    }
  }, [activeSubTab, selectedDate, hasGenerated])

  const [showWarning, setShowWarning] = useState(false)
  const [showResetWarning, setShowResetWarning] = useState(false)
  const [pendingRemoval, setPendingRemoval] = useState(null)
  const removalTimerRef = useRef(null)
  const [copyData, setCopyData] = useState(null)
  const [showCopyModal, setShowCopyModal] = useState(false)
  const [activeCopyEmpId, setActiveCopyEmpId] = useState(null);

  useEffect(() => () => {
    if (removalTimerRef.current) clearTimeout(removalTimerRef.current)
  }, [])
  const [rowOrder, setRowOrder] = useState([])
  const [remarksLabel, setRemarksLabel] = useState('Remarks')

  const [copyConfig, setCopyConfig] = useState({ inTime: false, outTime: true })
  const [selectedEmps, setSelectedEmps] = useState([])
  const [showInTimePicker, setShowInTimePicker] = useState(null)
  const [showOutTimePicker, setShowOutTimePicker] = useState(null)
  const inTimeCellRef = useRef(null)
  const outTimeCellRef = useRef(null)
  const [validationErrors, setValidationErrors] = useState({})

  const [fixingHistory, setFixingHistory] = useState(false)

  const handleFixHistory = async () => {
    if (!user?.orgId || !reportData.length) return
    if (!window.confirm("This will mark all records before an employee's joining date OR after their inactive date as 'Absent' in the CURRENT report range. Continue?")) return
    
    const normalizeDate = (dateStr) => {
      if (!dateStr || dateStr === '-') return null;
      // If already YYYY-MM-DD
      if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
      
      const parts = dateStr.split(/[-/]/);
      if (parts.length === 3) {
        let y, m, d;
        if (parts[0].length === 4) {
          // YYYY-MM-DD or YYYY-M-D
          y = parts[0]; m = parts[1]; d = parts[2];
        } else {
          // DD-MM-YYYY or D-M-YYYY
          d = parts[0]; m = parts[1]; y = parts[2];
        }
        return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
      }
      
      try {
        const date = new Date(dateStr);
        if (!isNaN(date.getTime())) {
          return date.toISOString().split('T')[0];
        }
      } catch (e) {}
      
      return null;
    };

    setFixingHistory(true)
    try {
      const { upsertAttendance, deleteIndividualAttendance } = useAttendance(user.orgId)
      const updates = []
      const deletes = []

      for (const row of reportData) {
        const emp = employees.find(e => e.id === row.employeeId)
        if (emp) {
          const normalizedRowDate = normalizeDate(row.date)
          const normalizedJoined = normalizeDate(emp.joinedDate)
          const normalizedInactive = normalizeDate(emp.inactiveFrom)
          
          const isBeforeJoined = normalizedJoined && normalizedRowDate < normalizedJoined
          const isAfterInactive = !isEmployeeActiveStatus(emp.status) && normalizedInactive && normalizedRowDate > normalizedInactive
          
          const shouldBeAbsent = isBeforeJoined || isAfterInactive
          
          if (shouldBeAbsent && row.status !== 'Absent') {
            updates.push({
              ...row,
              status: 'Absent',
              isAbsent: true,
              inTime: '',
              outTime: '',
              otHours: '00:00',
              checkIn: null,
              checkOut: null
            });
          } else if (!shouldBeAbsent && row.status === 'Absent') {
            // This record shouldn't be absent based on current joining/inactive dates.
            if (row.inTime || row.checkIn) {
              // If there's time data, just restore the status to Present
              updates.push({
                ...row,
                status: 'Present',
                isAbsent: false
              });
            } else {
              // If there's NO time data, this was likely created by the bug.
              // We should delete it to "undo" the mistake.
              deletes.push({ date: row.date, employeeId: row.employeeId });
            }
          }
        }
      }
      
      if (updates.length > 0) {
        await upsertAttendance(updates)
      }
      
      if (deletes.length > 0) {
        const deleteBatch = deletes.map(d => deleteIndividualAttendance(d.date, d.employeeId))
        await Promise.all(deleteBatch)
      }

      // Log activity for tracking who made the change
      if (updates.length > 0 || deletes.length > 0) {
        const affectedEmployees = new Set([
          ...updates.map(u => u.employeeId),
          ...deletes.map(d => d.employeeId)
        ])
        
        await logActivity(user.orgId, user, {
          module: 'Attendance',
          action: 'Fix Joining History',
          detail: `Fixed ${updates.length} records and cleaned up ${deletes.length} mistaken absences for ${affectedEmployees.size} employee(s). Updates: ${updates.length} marked as Absent/Restored, Deletes: ${deletes.length} removed.`,
          affectedEmployees: Array.from(affectedEmployees),
          updatesCount: updates.length,
          deletesCount: deletes.length,
          dateRange: { from: reportData[0]?.date, to: reportData[reportData.length - 1]?.date }
        })
        
        alert(`Successfully fixed ${updates.length} records and cleaned up ${deletes.length} mistaken absences.`)
        handleFilterSubmit()
      } else {
        alert("No records found that need fixing in the current report range.")
      }
    } catch (err) {
      console.error('Error fixing history:', err)
      alert("Error fixing history: " + err.message)
    } finally {
      setFixingHistory(false)
    }
  }

  const handleFixFutureAbsences = async () => {
    if (!user?.orgId) return
    if (!window.confirm("This will remove auto-created 'Absent' records for FUTURE dates (after today) for employees who are currently Active. Continue?")) return

    setFixingHistory(true)
    try {
      const today = new Date()
      const end = new Date()
      end.setDate(end.getDate() + 90)
      const from = formatDateForInput(today)
      const to = formatDateForInput(end)
      const future = await fetchRange(from, to)

      const updates = []
      const deletes = []
      for (const row of future) {
        const emp = employees.find(e => e.id === row.employeeId)
        if (!emp || !isEmployeeActiveStatus(emp.status)) continue
        if (row.status === 'Absent' || row.isAbsent) {
          if (row.inTime || row.checkIn) {
            updates.push({ ...row, status: 'Present', isAbsent: false })
          } else {
            deletes.push({ date: row.date, employeeId: row.employeeId })
          }
        }
      }

      if (updates.length > 0) {
        await upsertAttendance(updates)
      }
      if (deletes.length > 0) {
        await Promise.all(deletes.map(d => deleteIndividualAttendance(d.date, d.employeeId)))
      }

      if (updates.length > 0 || deletes.length > 0) {
        const affectedEmployees = [...new Set([
          ...updates.map(u => u.employeeId),
          ...deletes.map(d => d.employeeId)
        ])]

        await logActivity(user.orgId, user, {
          module: 'Attendance',
          action: 'Fix Future Absences',
          detail: `Restored ${updates.length} and removed ${deletes.length} future absences for ${affectedEmployees.length} active employee(s).`,
          affectedEmployees,
          updatesCount: updates.length,
          deletesCount: deletes.length,
          dateRange: { from, to }
        })

        alert(`Successfully restored ${updates.length} records and removed ${deletes.length} future absences.`)
        handleFilterSubmit()
      } else {
        alert("No future 'Absent' records found for currently-active employees.")
      }
    } catch (err) {
      console.error('Error fixing future absences:', err)
      alert("Error fixing future absences: " + err.message)
    } finally {
      setFixingHistory(false)
    }
  }

  const handleFilterSubmit = async () => {
    setReportLoading(true)
    try {
      const data = await fetchRange(filterStartDate, filterEndDate)
      let filtered = data
      if (filterCategory) {
        filtered = filtered.filter(r => r.remarks?.toLowerCase().includes(filterCategory.toLowerCase()))
      }
      if (filterName) {
        filtered = filtered.filter(r => r.name?.toLowerCase().includes(filterName.toLowerCase()))
      }
      setFilterReportData(filtered)
    } catch (error) {
      console.error('Filter error:', error)
    } finally {
      setReportLoading(false)
    }
  }

  const sortedEmployees = useMemo(() => {
    const [y, m] = selectedDate.split('-').map(Number)
    const selectedMonth = `${y}-${String(m).padStart(2, '0')}`
    
    const active = employees.filter(e => {
      if (e.hideInAttendance) return false
      
      // Basic check: is the employee status 'Active' or 'Rejoined'?
      if (isEmployeeActiveStatus(e.status)) return true
      
      // If employee is Inactive, check if they became inactive in the selected month
      // or if they were active at any point during this month.
      if (e.status === 'Inactive' && e.inactiveFrom) {
        return e.inactiveFrom.startsWith(selectedMonth) || e.inactiveFrom > selectedMonth
      }
      
      return false
    })

    if (!Array.isArray(rowOrder) || !rowOrder.length) return active
    return [...active].sort((a, b) => {
      const idxA = rowOrder.indexOf(a.id)
      const idxB = rowOrder.indexOf(b.id)
      if (idxA === -1 && idxB === -1) return 0
      if (idxA === -1) return 1
      if (idxB === -1) return -1
      return idxA - idxB
    })
  }, [employees, rowOrder, selectedDate])

  const activeEmployees = useMemo(() => sortedEmployees, [sortedEmployees])
  const isSunday = new Date(selectedDate).getDay() === 0
  const isDayShift = orgData?.shiftStrategy === 'Day'
  
  // Check if selected date is a configured holiday from settings
  const configuredHolidays = useMemo(() => {
    const holidayList = Array.isArray(orgData?.holidays) ? orgData.holidays : []
    return new Set(
      holidayList
        .map(h => (typeof h?.date === 'string' ? h.date : ''))
        .filter(date => /^\d{4}-\d{2}-\d{2}$/.test(date))
    )
  }, [orgData?.holidays])
  const isConfiguredHoliday = configuredHolidays.has(selectedDate) && !isSunday
  const dayTypeLabel = isSunday ? 'Sunday' : isConfiguredHoliday ? 'Holiday' : ''

  const isHolidayDate = (date) => {
    const d = new Date(date)
    const day = d.getDay()
    const dateStr = formatDateForInput(d)
    if (day === 0 && orgData?.sundayType && orgData.sundayType !== 'working') return true
    if (configuredHolidays.has(dateStr)) return true
    if (day === 6 && orgData?.saturdayType && orgData.saturdayType !== 'working') return true
    return false
  }

  const previousWorkdays = useMemo(() => {
    if (!selectedDate) return []
    const days = []
    const cursor = new Date(`${selectedDate}T12:00:00`)
    cursor.setDate(cursor.getDate() - 1)
    let safety = 0
    while (days.length < 10 && safety < 40) {
      const date = formatDateForInput(cursor)
      const dayOfWeek = cursor.getDay()
      const isSundayOff = dayOfWeek === 0 && orgData?.sundayType && orgData.sundayType !== 'working'
      const isSaturdayOff = dayOfWeek === 6 && orgData?.saturdayType && orgData.saturdayType !== 'working'
      if (!isSundayOff && !isSaturdayOff && !configuredHolidays.has(date)) days.push(date)
      cursor.setDate(cursor.getDate() - 1)
      safety += 1
    }
    return days
  }, [selectedDate, configuredHolidays, orgData?.saturdayType, orgData?.sundayType])

  useEffect(() => {
    if (!user?.orgId || !previousWorkdays.length || !employees.length) {
      setAttendanceFollowUp({ loading: false, incompleteDays: [], employeeGaps: [] })
      return
    }

    let cancelled = false
    const isEmployeeExpectedOn = (employee, date) => {
      if (employee.hideInAttendance) return false
      const joinedDate = employee.joinedDate || employee.joiningDate || employee.dateOfJoining || ''
      if (joinedDate && date < joinedDate) return false
      if (employee.inactiveFrom && date >= employee.inactiveFrom) return false
      return isEmployeeActiveStatus(employee.status) || (employee.status === 'Inactive' && employee.inactiveFrom > date)
    }

    const loadFollowUp = async () => {
      setAttendanceFollowUp((current) => ({ ...current, loading: true }))
      const records = await fetchRange(previousWorkdays[previousWorkdays.length - 1], previousWorkdays[0])
      if (cancelled) return

      const recordedEmployeesByDay = records.reduce((map, record) => {
        if (!record?.date || !record?.employeeId) return map
        if (!map.has(record.date)) map.set(record.date, new Set())
        map.get(record.date).add(record.employeeId)
        return map
      }, new Map())

      const incompleteDays = previousWorkdays
        .map((date) => {
          const expectedEmployees = employees.filter((employee) => isEmployeeExpectedOn(employee, date))
          const recordedEmployees = recordedEmployeesByDay.get(date) || new Set()
          const missingCount = expectedEmployees.filter((employee) => !recordedEmployees.has(employee.id)).length
          return { date, missingCount, expectedCount: expectedEmployees.length, recordedCount: recordedEmployees.size }
        })
        .filter((day) => day.expectedCount > 0 && day.recordedCount === 0)

      const employeeGaps = employees
        .map((employee) => {
          const missingDates = previousWorkdays.filter((date) => isEmployeeExpectedOn(employee, date) && !(recordedEmployeesByDay.get(date) || new Set()).has(employee.id))
          return { employee, missingDates }
        })
        .filter((entry) => entry.missingDates.length >= 3)
        .sort((a, b) => b.missingDates.length - a.missingDates.length || (a.employee.name || '').localeCompare(b.employee.name || ''))
        .slice(0, 3)

      setAttendanceFollowUp({ loading: false, incompleteDays, employeeGaps })
    }

    loadFollowUp()
    return () => { cancelled = true }
  }, [employees, fetchRange, previousWorkdays, user?.orgId])

  const isFutureDate = (date) => {
    return false
  }

  useEffect(() => {
    if (!user?.orgId || !selectedDate) return
    getDoc(doc(db, 'organisations', user.orgId)).then(snap => {
      if (snap.exists()) {
        const data = snap.data()
        setOrgData(data)
        if (data.employeeRowOrder) {
          setRowOrder(data.employeeRowOrder)
        }
        if (data.remarksLabel) {
          setRemarksLabel(data.remarksLabel)
        }
      }
    })
  }, [user?.orgId])

  useEffect(() => {
    if (!user?.orgId || !selectedDate) return
    fetchByDate(selectedDate).then(records => {
      setExistingRecords(records)
      if (records.length > 0) {
        // Enrich existing records with current employee data (e.g., minDailyHours)
        const enrichedRecords = records.map(record => {
          const emp = employees.find(e => e.id === record.employeeId)
          return {
            ...record,
            minDailyHours: record.minDailyHours || emp?.minDailyHours || 8
          }
        })

        const sortedRecords = [...(enrichedRecords || [])].sort((a, b) => {
          if (!a || !b) return 0
          if (!Array.isArray(rowOrder) || !rowOrder.length) return String(a.name || '').localeCompare(String(b.name || ''))
          const idxA = rowOrder.indexOf(a.employeeId)
          const idxB = rowOrder.indexOf(b.employeeId)
          if (idxA === -1 && idxB === -1) return String(a.name || '').localeCompare(String(b.name || ''))
          if (idxA === -1) return 1
          if (idxB === -1) return -1
          return idxA - idxB
        })
        setRows(sortedRecords)
      } else {
        setRows([])
      }
      setDirty(false)
    })
  }, [user?.orgId, selectedDate, rowOrder])

  // Pre-populate allowance selections from existing claims for the selected date,
  // and clear selections whenever the date changes.
  useEffect(() => {
    setAllowanceSelections({})
    if (!user?.orgId) return
    const dateClaims = (allowanceClaims || []).filter(c => c.date === selectedDate && c.status !== 'Rejected')
    const map = {}
    dateClaims.forEach(c => {
      if (!map[c.employeeId]) map[c.employeeId] = []
      if (!map[c.employeeId].includes(c.categoryId)) map[c.employeeId].push(c.categoryId)
    })
    setAllowanceSelections(map)
  }, [user?.orgId, selectedDate, allowanceClaims])

  // Effect to load fonts
  useEffect(() => {
    const link = document.createElement('link')
    link.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Roboto:wght@400;500;700&display=swap'
    link.rel = 'stylesheet'
    document.head.appendChild(link)
    
    // Add font classes to body
    document.body.style.fontFamily = "'Inter', sans-serif"
    
    return () => {
      document.head.removeChild(link)
    }
  }, [])

  if (empLoading || attLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-64">
        <Spinner size="lg" />
        <p className="mt-4 text-gray-500 font-medium">Loading attendance data...</p>
      </div>
    )
  }

  const handleGenerate = () => {
    if (isFutureDate(selectedDate)) {
      alert('Attendance cannot be generated for future dates.')
      return
    }
    if (!activeEmployees.length) return
    
    // Create a map of existing records for easy lookup
    const existingMap = new Map(existingRecords.map(r => [r.employeeId, r]))
    
    // Map through ALL active employees to ensure everyone is included
    const mergedRows = activeEmployees.map(emp => {
      // If we have an existing record, use it (enriched with latest emp data)
      if (existingMap.has(emp.id)) {
        const record = existingMap.get(emp.id)
        return {
          ...record,
          minDailyHours: record.minDailyHours || emp?.minDailyHours || 8
        }
      }
      
      // Otherwise, generate a fresh row for this active employee
      const isBeforeJoined = emp.joinedDate && selectedDate < emp.joinedDate;
      const isAfterInactive = !isEmployeeActiveStatus(emp.status) && emp.inactiveFrom && selectedDate > emp.inactiveFrom;
      const isAbsentState = isBeforeJoined || isAfterInactive;

      return {
        employeeId: emp.id,
        name: emp.name,
        date: selectedDate,
        inDate: selectedDate,
        inTime: '',
        outDate: selectedDate,
        outTime: '',
        otHours: '00:00',
        remarks: emp.site || '',
        isAbsent: isAbsentState,
        sundayWorked: false,
        sundayHoliday: false,
        shiftType: 'Day',
        status: isAbsentState ? 'Absent' : 'Present',
        minDailyHours: emp.minDailyHours || 8,
        isNew: true // Mark as new so it can be saved
      };
    })

    // Sort the merged result
    const sortedRows = [...mergedRows].sort((a, b) => {
      if (!a || !b) return 0
      const idA = a.employeeId || ''
      const idB = b.employeeId || ''
      if (!Array.isArray(rowOrder) || !rowOrder.length) return String(a.name || '').localeCompare(String(b.name || ''))
      const idxA = rowOrder.indexOf(idA)
      const idxB = rowOrder.indexOf(idB)
      if (idxA === -1 && idxB === -1) return String(a.name || '').localeCompare(String(b.name || ''))
      if (idxA === -1) return 1
      if (idxB === -1) return -1
      return idxA - idxB
    })

    setRows(sortedRows)
    setHasGenerated(true)
  }

  const handleAddRow = () => {
    if (isFutureDate(selectedDate)) {
      alert('Attendance cannot be created for future dates.')
      return
    }
    const newRow = {
      employeeId: '',
      name: '',
      date: selectedDate,
      inDate: selectedDate,
      inTime: '',
      outDate: selectedDate,
      outTime: '',
      otHours: '00:00',
      remarks: '',
      isAbsent: false,
      sundayWorked: false,
      sundayHoliday: false,
      shiftType: 'Day',
      status: 'Present',
      isNew: true,
      minDailyHours: 8
    }
    setRows(prev => [...prev, newRow])
  }

  const handleClearRow = (empId) => {
    const rowIndex = rows.findIndex(row => row.employeeId === empId)
    const removedRow = rowIndex >= 0 ? rows[rowIndex] : null
    if (!removedRow) return
    if (removalTimerRef.current) clearTimeout(removalTimerRef.current)
    setDirty(true)
    setRows(prev => prev.filter(row => row.employeeId !== empId))
    setPendingRemoval({ row: removedRow, index: rowIndex })
    removalTimerRef.current = setTimeout(() => setPendingRemoval(null), 5000)
  }

  const handleUndoClearRow = () => {
    if (!pendingRemoval) return
    if (removalTimerRef.current) clearTimeout(removalTimerRef.current)
    setRows(prev => {
      const restoreIndex = Math.min(pendingRemoval.index, prev.length)
      const nextRows = [...prev]
      nextRows.splice(restoreIndex, 0, pendingRemoval.row)
      return nextRows
    })
    setPendingRemoval(null)
  }

  const handleEmployeeSelect = (rowIndex, empId) => {
    const emp = employees.find(e => e.id === empId)
    if (!emp) return
    setRows(prev => prev.map((r, idx) => {
      if (idx !== rowIndex) return r
      return {
        ...r,
        employeeId: emp.id,
        name: emp.name,
        date: selectedDate,
        inDate: selectedDate,
        inTime: '',
        outDate: selectedDate,
        outTime: '',
        otHours: '00:00',
        remarks: emp.site || '',
        isAbsent: false,
        sundayWorked: false,
        sundayHoliday: false,
        shiftType: 'Day',
        status: 'Present',
        isNew: false,
        isPlaceholder: false,
        minDailyHours: emp.minDailyHours || 8
      }
    }))
  }

  const updateRow = (empId, field, value) => {
    setDirty(true)
    setRows(prev => prev.map(r => {
      if (r.employeeId !== empId) return r
      const updated = { ...r, [field]: value }
      if (field === 'inDate' && isDayShift) updated.outDate = value
      
      // Auto-set outDate based on shift type
      if (field === 'shiftType') {
        const inDate = new Date(updated.inDate)
        if (value === 'Night' || value === 'DN') {
          inDate.setDate(inDate.getDate() + 1)
          updated.outDate = inDate.toISOString().split('T')[0]
        } else {
          updated.outDate = updated.inDate
        }
      }

      if (['inTime', 'outTime', 'inDate', 'outDate'].includes(field)) {
        updated.otHours = calcOT(updated.inTime, updated.outTime, updated.inDate, updated.outDate, r.minDailyHours || 8)
        if (field === 'outTime' && value) {
          setCopyData({ inTime: updated.inTime, outTime: updated.outTime, inDate: updated.inDate, outDate: updated.outDate })
          setShowCopyModal(true)
          setActiveCopyEmpId(empId)
        }
      }
      return updated
    }))
  }

  const handleStatusChange = (empId, newStatus) => {
    setDirty(true)
    setRows(prev => prev.map(r => {
      if (r.employeeId !== empId) return r
      const updated = { ...r, status: newStatus }
      updated.isAbsent = newStatus === 'Absent'
      updated.sundayWorked = newStatus === 'SunWorked'
      updated.sundayHoliday = newStatus === 'SunHoliday' || newStatus === 'Holiday'
      updated.holidayWorked = newStatus === 'Worked'
      if (updated.isAbsent || updated.sundayHoliday || updated.holidayWorked === false) {
        updated.inTime = ''; updated.outTime = ''; updated.otHours = '00:00'
        if (updated.isAbsent) {
          updated.remarks = ''
          updated.checkIn = null
          updated.checkOut = null
        }
      }
      return updated
    }))
  }

  const handleSubmit = async () => {
    if (!rows.length) return
    if (isFutureDate(selectedDate)) {
      alert('Attendance cannot be submitted for future dates.')
      return
    }

    // Validation: At least one time (In or Out) is mandatory for 'Present', 'SunWorked', or 'Worked' status
    const newErrors = {}
    rows.forEach(r => {
      if ((r.status === 'Present' || r.status === 'SunWorked' || r.status === 'Worked') && !r.inTime && !r.outTime) {
        newErrors[r.employeeId] = 'In or Out time is mandatory'
      }
    })

    if (Object.keys(newErrors).length > 0) {
      setValidationErrors(newErrors)
      return
    }

    setValidationErrors({}) // Clear errors if valid
    const hasOverlap = rows.some(row => existingRecords.some(ex => ex.employeeId === row.employeeId))
    if (hasOverlap && !showWarning) {
      setShowWarning(true)
      return
    }
    if (pendingRemoval) {
      if (removalTimerRef.current) clearTimeout(removalTimerRef.current)
      setPendingRemoval(null)
    }
    setSaving(true)
    try {
      await upsertAttendance(rows)
      await logActivity(user?.orgId, user, {
        module: 'Attendance',
        action: `Attendance submitted for ${rows.length} employee(s) on ${selectedDate}`,
        detail: rows.map(r => r.name).join(', ')
      })

      // Raise allowance claims for any checked allowance categories
      const approvalMode = await fetchAllowanceApprovalMode(user?.orgId)
      for (const row of rows) {
        if (!row.employeeId || row.isAbsent) continue
        const selected = allowanceSelections[row.employeeId] || []
        if (selected.length === 0) continue
        const emp = employees.find(e => e.id === row.employeeId)
        if (!emp) continue
        await upsertClaimsForAttendance({
          employee: emp,
          date: row.date || row.inDate || selectedDate,
          outTime: row.outTime,
          selectedCategoryIds: selected,
          user,
          autoApproved: !approvalMode,
          existingClaims: allowanceClaims,
        })
      }
      
      // Refresh existing records after save
      const updatedRecords = await fetchByDate(selectedDate)
      setExistingRecords(updatedRecords)
      
      // Enrich updated rows to keep minDailyHours for OT calculation
      const enrichedUpdated = updatedRecords.map(record => {
        const emp = employees.find(e => e.id === record.employeeId)
        return {
          ...record,
          minDailyHours: record.minDailyHours || emp?.minDailyHours || 8
        }
      })
      
      // Re-sort the enriched updated records
      const sortedUpdated = [...(enrichedUpdated || [])].sort((a, b) => {
        if (!a || !b) return 0
        if (!Array.isArray(rowOrder) || !rowOrder.length) return String(a.name || '').localeCompare(String(b.name || ''))
        const idxA = rowOrder.indexOf(a.employeeId)
        const idxB = rowOrder.indexOf(b.employeeId)
        if (idxA === -1 && idxB === -1) return String(a.name || '').localeCompare(String(b.name || ''))
        if (idxA === -1) return 1
        if (idxB === -1) return -1
        return idxA - idxB
      })

      setRows(sortedUpdated)
      setSaved(true)
      setShowWarning(false)
      setDirty(false)
      setTimeout(() => setSaved(false), 3000)
    } catch (error) {
      console.error('Error saving attendance:', error)
      alert('Failed to save attendance. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const handleCopySubmit = () => {
    setDirty(true)
    setRows(prev => prev.map(r => {
      if (selectedEmps.includes(r.employeeId)) {
        const updated = { ...r }
        if (copyConfig.inTime) updated.inTime = copyData.inTime
        if (copyConfig.outTime) updated.outTime = copyData.outTime
        updated.otHours = calcOT(updated.inTime, updated.outTime, updated.inDate, updated.outDate, r.minDailyHours || 8)
        return updated
      }
      return r
    }))
    setShowCopyModal(false); setSelectedEmps([]); setActiveCopyEmpId(null);
  }

  const handleMarkAllHoliday = async () => {
    if (!rows.length) return
    if (isFutureDate(selectedDate)) {
      alert('Attendance cannot be modified for future dates.')
      return
    }
    setSaving(true)
    try {
      const status = isSunday ? 'SunHoliday' : 'Holiday'
      const updatedRows = rows.map(r => {
        if (!r.employeeId) return r;
        return {
          ...r,
          status: status,
          isAbsent: false,
          sundayWorked: false,
          sundayHoliday: true,
          holidayWorked: false,
          inTime: '',
          outTime: '',
          otHours: '00:00'
        }
      })
      
      const toUpsert = updatedRows.filter(r => r.employeeId && !r.isPlaceholder)
      if (toUpsert.length > 0) {
        await upsertAttendance(toUpsert)
        await logActivity(user?.orgId, user, {
          module: 'Attendance',
          action: `Marked all as ${status} for ${selectedDate}`,
          detail: `${toUpsert.length} records updated`
        })
      }

      const updatedRecords = await fetchByDate(selectedDate)
      setExistingRecords(updatedRecords)
      
      const enrichedUpdated = updatedRecords.map(record => {
        const emp = employees.find(e => e.id === record.employeeId)
        return {
          ...record,
          minDailyHours: record.minDailyHours || emp?.minDailyHours || 8
        }
      })
      
      const sortedUpdated = [...(enrichedUpdated || [])].sort((a, b) => {
        if (!a || !b) return 0
        if (!Array.isArray(rowOrder) || !rowOrder.length) return String(a.name || '').localeCompare(String(b.name || ''))
        const idxA = rowOrder.indexOf(a.employeeId)
        const idxB = rowOrder.indexOf(b.employeeId)
        if (idxA === -1 && idxB === -1) return String(a.name || '').localeCompare(String(b.name || ''))
        if (idxA === -1) return 1
        if (idxB === -1) return -1
        return idxA - idxB
      })

      setRows(sortedUpdated)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (error) {
      console.error('Error marking all as holiday:', error)
    } finally {
      setSaving(false)
    }
  }

  // Handle Reset All
  const handleResetAll = async () => {
    if (!rows.length) {
      setShowResetWarning(false)
      return
    }
    if (isFutureDate(selectedDate)) {
      alert('Attendance cannot be reset for future dates.')
      setShowResetWarning(false)
      return
    }
    setSaving(true)
    try {
      await deleteByDate(selectedDate)
      await logActivity(user?.orgId, user, {
        module: 'Attendance',
        action: `All attendance records reset for ${selectedDate}`,
        detail: `Deleted ${rows.length} records`
      })
      setRows([])
      setExistingRecords([])
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (error) {
      console.error('Error resetting attendance:', error)
      alert('Failed to reset attendance. Please try again.')
    } finally {
      setSaving(false)
      setShowResetWarning(false)
    }
  }

  const renderAttendanceFollowUp = ({ compact = false } = {}) => {
    const backlogDays = attendanceFollowUp.incompleteDays
    const oldestIncompleteDay = backlogDays[backlogDays.length - 1]
    const firstEmployeeGap = attendanceFollowUp.employeeGaps[0]
    const hasBacklog = backlogDays.length > 0
    const backlogDayLabel = `${backlogDays.length} recent workday${backlogDays.length === 1 ? '' : 's'}`
    const message = attendanceFollowUp.loading
      ? 'Checking the recent attendance trail…'
      : hasBacklog
        ? `${backlogDayLabel} ${backlogDays.length === 1 ? 'is' : 'are'} not filled in the attendance register.`
        : 'Planning a closure? Add it to the holiday calendar before generating attendance.'

    if (compact) {
      return (
        <div className={`flex min-w-0 flex-1 items-center gap-3 rounded-[12px] border px-3 py-2 ${hasBacklog ? 'border-amber-200 bg-amber-50/80' : 'border-slate-200 bg-slate-50/80'}`}>
          <div className="min-w-0 flex-1">
            <p className={`text-[9px] font-bold uppercase tracking-widest ${hasBacklog ? 'text-amber-700' : 'text-slate-500'}`}>Reminder</p>
            <p className={`truncate text-[11px] leading-4 ${hasBacklog ? 'font-semibold text-amber-900' : 'text-slate-600'}`}>{message}</p>
            {firstEmployeeGap && !attendanceFollowUp.loading && <p className="truncate text-[10px] text-slate-500">{firstEmployeeGap.employee.name}: attendance not filled for {firstEmployeeGap.missingDates.length} recent workdays — review attendance or inactive status.</p>}
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {hasBacklog && oldestIncompleteDay && <button type="button" onClick={() => setSelectedDate(oldestIncompleteDay.date)} className="h-8 rounded-lg border border-amber-200 bg-white px-2.5 text-[10px] font-semibold text-amber-800 transition hover:bg-amber-100">Open {displayShortDate(oldestIncompleteDay.date)}</button>}
            {onOpenHolidaySettings && <button type="button" onClick={onOpenHolidaySettings} className="h-8 rounded-lg border border-slate-200 bg-white px-2.5 text-[10px] font-semibold text-slate-700 transition hover:bg-slate-100">Holiday settings</button>}
            {firstEmployeeGap && onReviewEmployees && <button type="button" onClick={onReviewEmployees} className="h-8 rounded-lg bg-indigo-600 px-2.5 text-[10px] font-semibold text-white transition hover:bg-indigo-700">Review employee</button>}
          </div>
        </div>
      )
    }

    return (
      <div className={`rounded-[12px] border p-3 shadow-sm ${hasBacklog ? 'border-amber-200 bg-amber-50/70' : 'border-slate-100 bg-slate-50/70'}`}>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <p className={`text-[10px] font-bold uppercase tracking-widest ${hasBacklog ? 'text-amber-700' : 'text-slate-500'}`}>Reminder</p>
            <p className={`mt-1 text-xs leading-5 ${hasBacklog ? 'font-medium text-amber-900' : 'text-slate-600'}`}>{message}</p>
            {firstEmployeeGap && !attendanceFollowUp.loading && (
              <p className="mt-1 text-[11px] leading-5 text-slate-600"><span className="font-semibold text-slate-800">{firstEmployeeGap.employee.name}</span> has attendance not filled for {firstEmployeeGap.missingDates.length} recent workdays. Fill the attendance, or review whether the employee is inactive.</p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {hasBacklog && oldestIncompleteDay && <button type="button" onClick={() => setSelectedDate(oldestIncompleteDay.date)} className="min-h-9 rounded-lg border border-amber-200 bg-white px-3 text-[11px] font-semibold text-amber-800 transition hover:bg-amber-100">Open {displayShortDate(oldestIncompleteDay.date)}</button>}
            {onOpenHolidaySettings && <button type="button" onClick={onOpenHolidaySettings} className="min-h-9 rounded-lg border border-slate-200 bg-white px-3 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-100">Holiday settings</button>}
            {firstEmployeeGap && onReviewEmployees && <button type="button" onClick={onReviewEmployees} className="min-h-9 rounded-lg bg-indigo-600 px-3 text-[11px] font-semibold text-white transition hover:bg-indigo-700">Review employee</button>}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="module-layout-root flex flex-col h-full gap-3 pb-20" style={{ fontFamily: "'Roboto', sans-serif" }}>
      {activeSubTab === 'grid' ? (
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-white rounded-xl border border-gray-100 p-4">
          <SalarySlipTab attendanceMonthlySummaryOnly />
        </div>
      ) : (
        <>
          {activeSubTab !== 'reports' && <div className="md:hidden flex flex-col gap-3">
            <div className="bg-white border border-gray-200 rounded-xl p-3 shadow-sm">
              <div className="flex items-center gap-2">
                <button onClick={() => setSelectedDate(d => { const nd = new Date(d); nd.setDate(nd.getDate() - 1); return formatDateForInput(nd); })} className="h-11 w-11 shrink-0 rounded-lg border border-gray-200 bg-gray-50 text-gray-500 flex items-center justify-center" aria-label="Previous day"><ChevronLeft size={18} /></button>
                <DatePicker selected={parseISO(selectedDate)} onChange={(date) => { if (date) setSelectedDate(formatDateForInput(date)) }} dateFormat="dd MMM yyyy" popperClassName="z-[99999]" popperProps={{ strategy: 'fixed', placement: 'bottom-start' }} dayStyle={(date) => isHolidayDate(date) ? { color: '#dc2626' } : {}} customInput={<button type="button" className="h-11 flex-1 min-w-0 rounded-lg border border-gray-200 bg-gray-50 px-3 text-sm font-semibold text-gray-800 text-left">{format(parseISO(selectedDate), 'dd MMM yyyy')}</button>} />
                <button onClick={() => setSelectedDate(d => { const nd = new Date(d); nd.setDate(nd.getDate() + 1); return formatDateForInput(nd); })} className="h-11 w-11 shrink-0 rounded-lg border border-gray-200 bg-gray-50 text-gray-500 flex items-center justify-center" aria-label="Next day"><ChevronRight size={18} /></button>
                <span className="shrink-0 text-sm font-bold text-indigo-600">{formatDate(selectedDate).split(' ')[0]}</span>
              </div>
              {(isSunday || isConfiguredHoliday) && <div className="flex items-center justify-end gap-3 pt-3"><span className={`text-[11px] font-semibold uppercase tracking-wide ${isSunday ? 'text-orange-600' : 'text-purple-600'}`}>{isSunday ? 'Sunday' : 'Holiday'}</span><button onClick={handleMarkAllHoliday} disabled={saving || !rows.length} className="min-h-10 px-3 rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-700 text-[11px] font-semibold disabled:opacity-50">{saving ? 'Marking…' : 'Mark all holiday'}</button></div>}
            </div>
            {renderAttendanceFollowUp()}
            <div className="grid grid-cols-2 gap-2"><button onClick={handleAddRow} className="min-h-11 rounded-lg border border-gray-200 bg-white text-gray-700 text-xs font-semibold flex items-center justify-center gap-2"><Plus size={15} /> Add row</button><button onClick={handleGenerate} className="min-h-11 rounded-lg bg-indigo-600 text-white text-xs font-semibold flex items-center justify-center gap-2">Generate active</button></div>
            <div className="grid grid-cols-3 gap-2"><div className="rounded-lg bg-green-50 px-2 py-2 text-center"><div className="text-[10px] uppercase tracking-wide text-green-700">Present</div><div className="text-lg font-bold text-green-800">{rows.filter(r => !r.isAbsent && !r.sundayHoliday && !r.isPlaceholder).length}</div></div><div className="rounded-lg bg-red-50 px-2 py-2 text-center"><div className="text-[10px] uppercase tracking-wide text-red-700">Absent</div><div className="text-lg font-bold text-red-800">{rows.filter(r => r.isAbsent && !r.isPlaceholder).length}</div></div><div className="rounded-lg bg-gray-100 px-2 py-2 text-center"><div className="text-[10px] uppercase tracking-wide text-gray-600">Total</div><div className="text-lg font-bold text-gray-800">{rows.filter(r => !r.isPlaceholder).length}</div></div></div>
            <div className="flex items-center justify-between gap-3 rounded-lg bg-gray-100/80 p-1"><span className="pl-2 text-[10px] font-semibold uppercase tracking-wider text-gray-500">Roster view</span><div className="flex items-center gap-1"><button type="button" onClick={() => setCompactMode(false)} className={`flex min-h-8 items-center gap-1 rounded-md px-2.5 text-[10px] font-semibold ${!compactMode ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-500'}`} aria-pressed={!compactMode}><LayoutGrid size={13} /> Cards</button><button type="button" onClick={() => setCompactMode(true)} className={`flex min-h-8 items-center gap-1 rounded-md px-2.5 text-[10px] font-semibold ${compactMode ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-500'}`} aria-pressed={compactMode}><List size={13} /> Compact</button></div></div>
            <div className={compactMode ? 'divide-y divide-gray-100' : 'flex flex-col gap-3'}>{empLoading ? <div className="bg-white rounded-xl border border-gray-200 py-16 flex justify-center"><Spinner /></div> : rows.length === 0 ? <div className="bg-white rounded-xl border border-dashed border-gray-300 py-16 text-center text-sm text-gray-400">Generate active employees to begin.</div> : rows.map((row, idx) => {
              if (compactMode) return <CompactAttendanceRow key={row.id || row.employeeId || `compact-mobile-${idx}`} row={row} idx={idx} employees={employees} rows={rows} handleEmployeeSelect={handleEmployeeSelect} handleClearRow={handleClearRow} updateRow={updateRow} showInTimePicker={showInTimePicker} setShowInTimePicker={setShowInTimePicker} showOutTimePicker={showOutTimePicker} setShowOutTimePicker={setShowOutTimePicker} validationErrors={validationErrors} allowanceCategories={allowanceCategories} allowanceSelections={allowanceSelections} toggleAllowance={toggleAllowance} remarksOptions={remarksOptions} handleAddRemarkOption={handleAddRemarkOption} handleStatusChange={handleStatusChange} isSunday={isSunday} isConfiguredHoliday={isConfiguredHoliday} />
              const mobileStatusOptions = [{ id: 'Present', label: 'Present', color: 'green' }, { id: 'Absent', label: 'Absent', color: 'red' }, ...(isSunday ? [{ id: 'SunWorked', label: 'Worked', color: 'amber' }, { id: 'SunHoliday', label: 'Holiday', color: 'indigo' }] : []), ...(isConfiguredHoliday ? [{ id: 'Worked', label: 'Worked', color: 'amber' }, { id: 'Holiday', label: 'Holiday', color: 'indigo' }] : [])]
              const eligible = row.employeeId && !row.isAbsent ? getEligibleAllowanceCategories(allowanceCategories, { employeeId: row.employeeId, outTime: row.outTime }) : []
              const selectedAllowances = allowanceSelections[row.employeeId] || []
              return <div key={row.id || row.employeeId || `mobile-${idx}`} className={`bg-white rounded-xl border border-gray-200 p-3 shadow-sm ${row.isAbsent ? 'border-red-200 bg-red-50/30' : ''}`}>
                <div className="flex items-start justify-between gap-3"><div className="flex min-w-0 flex-1 items-center gap-2">{row.employeeId ? <><div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold text-gray-900">{row.name}</div></div><ShiftToggle value={row.shiftType} onChange={(shiftType) => updateRow(row.employeeId, 'shiftType', shiftType)} disabled={row.isAbsent || row.status === 'SunHoliday'} employeeName={row.name} /></> : <select value="" onChange={(e) => handleEmployeeSelect(idx, e.target.value)} className="h-11 w-full rounded-lg border border-gray-200 bg-gray-50 px-3 text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-500"><option value="">Select employee…</option>{employees.filter(e => !e.hideInAttendance && !rows.some(r => r.employeeId === e.id)).map(e => <option key={e.id} value={e.id}>{e.name}</option>)}</select>}</div><button onClick={() => handleClearRow(row.employeeId)} disabled={!row.employeeId} className="h-10 w-10 shrink-0 rounded-lg text-gray-400 flex items-center justify-center active:bg-red-50 active:text-red-500 disabled:opacity-30" aria-label="Clear attendance row"><X size={16} /></button></div>
                {row.employeeId && <><div className="grid grid-cols-2 gap-2 pt-3"><div><div className="pb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-500">In time</div><TimeEditableCell value={row.inTime} onChange={(time) => updateRow(row.employeeId, 'inTime', time)} onShowPicker={() => setShowInTimePicker(showInTimePicker === row.employeeId ? null : row.employeeId)} disabled={row.isAbsent || row.status === 'SunHoliday'} backgroundColor="#e8f4f8" rowIdx={idx} field="inTime" scope="mobile" error={validationErrors[row.employeeId]} />{showInTimePicker === row.employeeId && <TimePicker variant="attendance" value={row.inTime || '09:00'} onChange={(time) => updateRow(row.employeeId, 'inTime', time)} onClose={() => setShowInTimePicker(null)} />}</div><div><div className="pb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-500">Out time</div><TimeEditableCell value={row.outTime} onChange={(time) => updateRow(row.employeeId, 'outTime', time)} onShowPicker={() => setShowOutTimePicker(showOutTimePicker === row.employeeId ? null : row.employeeId)} disabled={row.isAbsent || row.status === 'SunHoliday'} backgroundColor="#fff4e8" rowIdx={idx} field="outTime" scope="mobile" placeholder="09:00 PM" error={validationErrors[row.employeeId]} />{showOutTimePicker === row.employeeId && <TimePicker variant="attendance" value={row.outTime || '21:00'} onChange={(time) => updateRow(row.employeeId, 'outTime', time)} onClose={() => setShowOutTimePicker(null)} />}</div></div><div className="pt-3"><div className="pb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-500">Remarks</div><RemarksDropdown value={row.remarks || ''} onChange={val => updateRow(row.employeeId, 'remarks', val)} onAddOption={handleAddRemarkOption} options={remarksOptions} disabled={!row.employeeId || row.isAbsent} className="w-full" /></div>{eligible.length > 0 && <div className="pt-3"><div className="pb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-500">Allowances</div><div className="grid grid-cols-1 gap-1.5">{eligible.map(cat => <label key={cat.id} className="min-h-10 flex items-center gap-2 rounded-lg bg-emerald-50 px-3 text-xs text-gray-700"><input type="checkbox" checked={selectedAllowances.includes(cat.id)} onChange={() => toggleAllowance(row.employeeId, cat.id)} className="h-4 w-4 rounded border-gray-300 text-indigo-600" /><span className="min-w-0 flex-1 truncate">{cat.name}</span><span className="font-semibold text-emerald-700">₹{getAllowanceAmount(cat)}</span></label>)}</div></div>}<div className="pt-3"><div className="pb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-500">Attendance status</div><div className="flex flex-wrap gap-2">{mobileStatusOptions.map(st => <button key={st.id} onClick={() => handleStatusChange(row.employeeId, st.id)} className={`min-h-10 rounded-lg px-3 text-xs font-semibold border ${row.status === st.id ? st.color === 'green' ? 'bg-green-100 text-green-700 border-green-200' : st.color === 'red' ? 'bg-red-100 text-red-700 border-red-200' : st.color === 'amber' ? 'bg-amber-100 text-amber-700 border-amber-200' : 'bg-indigo-100 text-indigo-700 border-indigo-200' : 'bg-gray-50 text-gray-500 border-gray-200'}`}>{row.status === st.id ? '✓ ' : ''}{st.label}</button>)}</div></div></>}
              </div>
            })}</div>
            {pendingRemoval && <div className="fixed inset-x-3 bottom-[78px] z-[90] flex items-center justify-between gap-3 rounded-lg bg-gray-900 px-3 py-2.5 text-white shadow-xl md:hidden" role="status" aria-live="polite"><span className="min-w-0 truncate text-xs">Removed {pendingRemoval.row.name || 'attendance row'}</span><button type="button" onClick={handleUndoClearRow} className="shrink-0 rounded-md bg-white/15 px-3 py-1.5 text-xs font-semibold text-white active:bg-white/25">Undo</button></div>}
            <div className="sticky bottom-2 z-30 rounded-xl border border-gray-200 bg-white/95 backdrop-blur-sm p-3 shadow-lg"><div className="flex items-center justify-between gap-3"><div className="min-w-0 text-[11px] text-gray-500 truncate">{hasGenerated ? 'Records ready to submit' : 'Generate active employees first'}</div>{rows.length > 0 && <button onClick={handleSubmit} disabled={saving || rows.length === 0} className="min-h-11 shrink-0 rounded-lg bg-emerald-600 px-4 text-xs font-semibold text-white disabled:opacity-50">{saving ? 'Processing…' : 'Submit records'}</button>}</div>{saved && <div className="flex items-center gap-1.5 pt-2 text-xs font-medium text-green-600"><Check size={14} /> Successfully submitted</div>}</div>
          </div>}
          <div className="hidden md:flex flex-1 min-h-0 flex-col gap-3">
          {/* Date & Action Bar */}
          <div className="sticky top-0 z-50 flex items-center gap-4 bg-white/95 backdrop-blur-sm">
            <div className="flex shrink-0 items-center gap-4">
              <div className="flex items-center bg-gray-50 rounded-lg p-1 pl-4 border border-gray-200">
                <button 
                  onClick={() => setSelectedDate(d => { const nd = new Date(d); nd.setDate(nd.getDate() - 1); return formatDateForInput(nd); })} 
                  className="p-1.5 hover:bg-white hover:shadow-sm rounded-md text-gray-500 transition-all"
                >
                  <ChevronLeft size={16} />
                </button>
                
                <DatePicker
                  selected={parseISO(selectedDate)}
                  onChange={(date) => {
                    if (date) setSelectedDate(formatDateForInput(date))
                  }}
                  dateFormat="dd MMM yyyy"
                  popperClassName="z-[99999]"
                  popperProps={{ strategy: 'fixed', placement: 'bottom-start' }}
                  dayStyle={(date) => isHolidayDate(date) ? { color: '#dc2626' } : {}}
                  customInput={
                    <div className="font-semibold text-sm text-gray-700 h-[32px] flex items-center px-3 cursor-pointer select-none hover:bg-white hover:shadow-sm rounded-md transition-all relative z-50">
                      {format(parseISO(selectedDate), 'dd MMM yyyy')}
                    </div>
                  }
                />

                <button 
                  onClick={() => setSelectedDate(d => { const nd = new Date(d); nd.setDate(nd.getDate() + 1); return formatDateForInput(nd); })} 
                  className="p-1.5 hover:bg-white hover:shadow-sm rounded-md text-gray-500 transition-all"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
              <div className="flex flex-col">
                <span className="text-lg font-bold leading-tight text-indigo-600">
                  {formatDate(selectedDate).split(' ')[0]}
                </span>
                {(isSunday || isConfiguredHoliday) && (
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-semibold uppercase tracking-wide flex items-center gap-1 ${isSunday ? 'text-orange-600' : 'text-purple-600'}`}>
                      {isSunday ? '★ Sunday' : '★ Holiday'}
                    </span>
                    <button
                      onClick={handleMarkAllHoliday}
                      disabled={saving || !rows.length}
                      className="h-[15px] px-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 text-[9px] font-bold uppercase tracking-wider rounded border border-indigo-200 flex items-center gap-1 transition-all disabled:opacity-50"
                    >
                      {saving ? <Spinner size="w-2 h-2" color="border-t-indigo-600" /> : <Check size={10} />}
                      Mark All as Holiday
                    </button>
                  </div>
                )}
              </div>
            </div>
            {renderAttendanceFollowUp({ compact: true })}
            
            <div className="flex shrink-0 items-center gap-2">
              {/* Card for Reset and Add Row */}
              <div className="flex items-center gap-2 bg-[#361f1b] p-1 rounded-lg shadow-sm border border-[#4a2b26]">
                <button 
                  onClick={() => setShowResetWarning(true)} 
                  disabled={!rows.length || saving}
                  className="h-8 px-3 text-red-200 font-medium rounded-md text-[11px] hover:bg-red-900/30 transition-all flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed" 
                  style={{ fontFamily: "'Roboto', sans-serif" }}
                >
                  <Trash2 size={13} /> Reset All
                </button>
                <div className="w-[1px] h-4 bg-[#4a2b26]"></div>
                <button 
                  onClick={handleAddRow} 
                  className="h-8 px-3 text-gray-200 font-medium rounded-md text-[11px] hover:bg-white/10 transition-all flex items-center gap-1.5" 
                  style={{ fontFamily: "'Roboto', sans-serif" }}
                >
                  <Plus size={13} /> Add Row
                </button>
              </div>
              <button onClick={handleGenerate} className="h-9 px-4 bg-indigo-600 text-white font-medium rounded-lg text-xs shadow-sm hover:bg-indigo-700 transition-all" style={{ fontFamily: "'Roboto', sans-serif" }}>Generate Active</button>
            </div>
          </div>

          {/* Main Table Card */}
          <div className="flex-1 bg-white rounded-xl border border-gray-100 shadow-sm overflow-visible flex flex-col">
            <div className="overflow-x-visible pb-[400px] isolate">
              <table className="w-full border-separate border-spacing-0 text-left">
                <thead className="relative z-40 isolate">
                  <tr className="h-10 border-b border-gray-200 bg-orange-50">
                    <th className="sticky top-[100px] z-40 w-[220px] border-b border-gray-200 bg-orange-50 px-2 text-left text-xs font-semibold uppercase tracking-wider shadow-[0_2px_0_rgba(229,231,235,1)]" style={{ color: '#da7025' }}>Employee Name</th>
                    <th className="sticky top-[100px] z-40 w-[95px] border-b border-gray-200 bg-orange-50 px-2 text-center text-xs font-semibold uppercase tracking-wider shadow-[0_2px_0_rgba(229,231,235,1)]" style={{ color: '#da7025' }}>In Time</th>
                    <th className="sticky top-[100px] z-40 w-[95px] border-b border-gray-200 bg-orange-50 px-2 text-center text-xs font-semibold uppercase tracking-wider shadow-[0_2px_0_rgba(229,231,235,1)]" style={{ color: '#da7025' }}>Out Time</th>
                    <th className="sticky top-[100px] z-40 w-[50px] border-b border-gray-200 bg-orange-50 px-2 text-center text-xs font-semibold uppercase tracking-wider shadow-[0_2px_0_rgba(229,231,235,1)]" style={{ color: '#da7025' }}>OT</th>
                    <th className="sticky top-[100px] z-40 w-[120px] border-b border-gray-200 bg-orange-50 px-0 text-center text-xs font-semibold uppercase tracking-wider shadow-[0_2px_0_rgba(229,231,235,1)]" style={{ color: '#da7025' }}>{remarksLabel}</th>
                    <th className="sticky top-[100px] z-40 w-[110px] border-b border-gray-200 bg-orange-50 px-1 text-center text-xs font-semibold uppercase tracking-wider shadow-[0_2px_0_rgba(229,231,235,1)]" style={{ color: '#da7025' }}>
                      <button
                        type="button"
                        onClick={onConfigAllowance}
                        className="group relative inline-flex items-center justify-center gap-1 w-full"
                      >
                        <span>Allowance</span>
                        <span className="pointer-events-none absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-gray-900 text-white text-[10px] font-medium px-2 py-1 opacity-0 group-hover:opacity-100 transition-opacity z-50 shadow-lg">
                          Click to Configure
                        </span>
                      </button>
                    </th>
                    <th className="sticky top-[100px] z-40 w-[100px] border-b border-gray-200 bg-orange-50 px-0 text-center text-xs font-semibold uppercase tracking-wider shadow-[0_2px_0_rgba(229,231,235,1)]" style={{ color: '#da7025' }}>Status</th>
                    <th className="sticky top-[100px] z-40 w-[36px] border-b border-gray-200 bg-orange-50 px-1 text-xs font-semibold uppercase tracking-wider shadow-[0_2px_0_rgba(229,231,235,1)]" style={{ color: '#da7025' }}></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {empLoading ? (
                    <tr><td colSpan={8} className="text-center py-12"><Spinner /></td></tr>
                  ) : rows.length === 0 ? (
                    <tr><td colSpan={8} className="text-center py-20 text-gray-300 font-medium text-lg">Ready to generate attendance</td></tr>
                  ) : (
                    rows.map((row, idx) => (
                      <tr key={row.id || row.employeeId || `new-${idx}`} className={`transition-colors hover:bg-gray-50 ${row.isAbsent ? 'bg-red-50/30' : ''} ${(row.shiftType === 'Night' || row.shiftType === 'DN') && row.outTime ? 'h-[56px]' : 'h-[40px]'}`}>
                        <td className="px-4 min-w-[220px]">
                          {row.employeeId ? (
                            <div className="flex items-center gap-2">
                              <span className="min-w-0 flex-1 truncate font-medium text-gray-800 text-sm" style={{ fontFamily: "'Inter', sans-serif" }}>{row.name}</span>
                              <ShiftToggle value={row.shiftType} onChange={(shiftType) => updateRow(row.employeeId, 'shiftType', shiftType)} disabled={row.isAbsent || row.status === 'SunHoliday'} employeeName={row.name} />
                            </div>
                          ) : (
                            <select
                              value=""
                              onChange={(e) => handleEmployeeSelect(idx, e.target.value)}
                              className="w-full h-8 border border-gray-200 rounded-lg px-2 text-xs font-medium bg-gray-50 focus:ring-2 focus:ring-indigo-500 outline-none"
                              style={{ fontFamily: "'Inter', sans-serif" }}
                            >
                              <option value="">Select Employee...</option>
                              {employees.filter(e => !e.hideInAttendance && !rows.some(r => r.employeeId === e.id)).map(e => (
                                <option key={e.id} value={e.id}>{e.name}</option>
                              ))}
                            </select>
                          )}
                        </td>
                        <td className="px-3 text-center">
                          <div className="flex items-center justify-center relative">
                            <TimeEditableCell
                              value={row.inTime}
                              onChange={(time) => updateRow(row.employeeId, 'inTime', time)}
                              onShowPicker={() => setShowInTimePicker(showInTimePicker === row.employeeId ? null : row.employeeId)}
                              disabled={row.isAbsent || row.status === 'SunHoliday' || !row.employeeId}
                              backgroundColor="#e8f4f8"
                              rowIdx={idx}
                              field="inTime"
                              error={validationErrors[row.employeeId]}
                            />
                            {showInTimePicker === row.employeeId && (
                              <TimePicker
                                variant="attendance"
                                value={row.inTime || '09:00'}
                                onChange={(time) => updateRow(row.employeeId, 'inTime', time)}
                                onClose={() => setShowInTimePicker(null)}
                              />
                            )}
                          </div>
                        </td>
                        <td className="px-3 text-center align-top">
                          <div className="flex items-center justify-center relative flex-col">
                            <TimeEditableCell
                              value={row.outTime}
                              onChange={(time) => updateRow(row.employeeId, 'outTime', time)}
                              onShowPicker={() => setShowOutTimePicker(showOutTimePicker === row.employeeId ? null : row.employeeId)}
                              disabled={row.isAbsent || row.status === 'SunHoliday' || !row.employeeId}
                              backgroundColor="#fff4e8"
                              rowIdx={idx}
                              field="outTime"
                              placeholder="09:00 PM"
                              error={validationErrors[row.employeeId]}
                            />
                            {(row.shiftType === 'Night' || row.shiftType === 'DN') && (
                              <div className="flex items-center gap-1 text-[9px] text-orange-600/70 font-bold whitespace-nowrap mt-0.5">
                                <ArrowRight size={8} />
                                <span>{displayShortDate(row.outDate)}</span>
                              </div>
                            )}
                            {showOutTimePicker === row.employeeId && (
                              <TimePicker
                                variant="attendance"
                                value={row.outTime || '21:00'}
                                onChange={(time) => updateRow(row.employeeId, 'outTime', time)}
                                onClose={() => setShowOutTimePicker(null)}
                              />
                            )}
                            {showCopyModal && activeCopyEmpId === row.employeeId && (
                              <CopyToDropdown
                                activeEmployees={activeEmployees.filter(e => e.id !== row.employeeId)}
                                copyConfig={copyConfig}
                                setCopyConfig={setCopyConfig}
                                selectedEmps={selectedEmps}
                                setSelectedEmps={setSelectedEmps}
                                onApply={handleCopySubmit}
                                onClose={() => { setShowCopyModal(false); setActiveCopyEmpId(null); }}
                              />
                            )}
                          </div>
                        </td>
                        <td className="px-3 text-center font-medium text-gray-900 text-sm" style={{ fontFamily: "'Roboto', sans-serif" }}>
                          {(() => {
                            if (!row.otHours || row.otHours === '00:00') return ''
                            const [h, m] = row.otHours.split(':').map(Number)
                            const totalMins = (h || 0) * 60 + (m || 0)
                            return totalMins >= 30 ? row.otHours : ''
                          })()}
                        </td>
                        <td className="px-3">
                          <RemarksDropdown
                            value={row.remarks || ''}
                            onChange={val => updateRow(row.employeeId, 'remarks', val)}
                            onAddOption={handleAddRemarkOption}
                            options={remarksOptions}
                            disabled={!row.employeeId || row.isAbsent}
                          />
                        </td>
                        <td className="px-2 align-top">
                          {(() => {
                            if (!row.employeeId || row.isAbsent) return null
                            const eligible = getEligibleAllowanceCategories(allowanceCategories, {
                              employeeId: row.employeeId,
                              outTime: row.outTime,
                            })
                            if (eligible.length === 0) return (
                              <span className="text-[10px] text-gray-300 italic">—</span>
                            )
                            const selected = allowanceSelections[row.employeeId] || []
                            return (
                              <div className="flex flex-col gap-1">
                                {eligible.map(cat => {
                                  const checked = selected.includes(cat.id)
                                  const amount = getAllowanceAmount(cat)
                                  return (
                                    <label key={cat.id} className="flex items-center gap-1.5 cursor-pointer rounded px-1 py-0.5 hover:bg-indigo-50/60 transition-colors">
                                      <input
                                        type="checkbox"
                                        checked={checked}
                                        onChange={() => toggleAllowance(row.employeeId, cat.id)}
                                        className="w-3 h-3 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                      />
                                      <span className="text-[10px] font-medium text-gray-700 whitespace-nowrap">
                                        {cat.name}
                                      </span>
                                      <span className="text-[10px] font-bold text-emerald-600 tabular-nums">
                                        ₹{amount}
                                      </span>
                                    </label>
                                  )
                                })}
                              </div>
                            )
                          })()}
                        </td>
                        <td className="px-4">
                          <div className="flex items-center gap-2 justify-end">
                            {!row.isPlaceholder && [
                              { id: 'Present', label: 'Present', color: 'green' },
                              { id: 'Absent', label: 'Absent', color: 'red' },
                              ...(isSunday ? [
                                { id: 'SunWorked', label: 'Worked (1x)', color: 'amber' },
                                { id: 'SunHoliday', label: 'Holiday', color: 'indigo' }
                              ] : []),
                              ...(isConfiguredHoliday ? [
                                { id: 'Worked', label: 'Holiday Worked (2x)', color: 'amber' },
                                { id: 'Holiday', label: 'Holiday', color: 'indigo' }
                              ] : [])
                            ].map(st => (
                              <button
                                key={st.id}
                                onClick={() => handleStatusChange(row.employeeId, st.id)}
                                className={`px-3 py-1 rounded-full text-[11px] font-medium transition-all ${
                                  row.status === st.id
                                    ? st.color === 'green' ? 'bg-green-100 text-green-700 border border-green-200'
                                      : st.color === 'red' ? 'bg-red-100 text-red-700 border border-red-200'
                                        : st.color === 'amber' ? 'bg-amber-100 text-amber-700 border border-amber-200'
                                          : 'bg-indigo-100 text-indigo-700 border border-indigo-200'
                                    : 'bg-gray-100 text-gray-400 border border-gray-200 hover:bg-gray-200'
                                }`}
                                style={{ fontFamily: "'Inter', sans-serif" }}
                              >
                                {row.status === st.id && st.color === 'green' && <span className="mr-1">✓</span>}
                                {row.status === st.id && st.color === 'red' && <span className="mr-1">✕</span>}
                                {st.label}
                              </button>
                            ))}
                            {row.isPlaceholder && (
                              <span className="text-xs text-gray-400 italic">Select employee</span>
                            )}
                          </div>
                        </td>
                        <td className="px-2 text-center">
                          <button
                            onClick={() => handleClearRow(row.employeeId)}
                            disabled={!row.employeeId}
                            className="p-1 rounded hover:bg-red-50 text-gray-300 hover:text-red-500 transition-colors disabled:opacity-30"
                            title="Clear row"
                          >
                            <X size={14} />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Bottom Footer Card - Stats and Submit Button */}
          <div className="fixed left-1/2 bottom-4 -translate-x-1/2 bg-white border border-gray-200 shadow-lg flex justify-between items-center z-50" style={{ width: '1168px', height: '53.6px', paddingLeft: '100px', paddingRight: '16px', borderRadius: '14px' }}>
            <div className="flex gap-6">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                <span className="text-xs font-medium text-gray-600" style={{ fontFamily: "'Inter', sans-serif" }}>Present: {rows.filter(r => !r.isAbsent && !r.sundayHoliday && !r.isPlaceholder).length}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                <span className="text-xs font-medium text-gray-600" style={{ fontFamily: "'Inter', sans-serif" }}>Absent: {rows.filter(r => r.isAbsent && !r.isPlaceholder).length}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
                <span className="text-xs font-medium text-gray-600" style={{ fontFamily: "'Inter', sans-serif" }}>Total: {rows.filter(r => !r.isPlaceholder).length}</span>
              </div>
            </div>
            <div className="flex items-center gap-4 min-w-[280px]">
              <div className="text-xs text-gray-400 italic">
                {hasGenerated ? 'Records ready to submit' : 'Click "Generate Active" to populate'}
              </div>
              {rows.length > 0 && (
                <div className="flex items-center gap-3">
                  {saved && (
                    <div className="flex items-center gap-1.5 text-green-600 text-xs font-medium" style={{ fontFamily: "'Inter', sans-serif" }}>
                      <Check size={14} /> Successfully submitted
                    </div>
                  )}
                  <button 
                    onClick={handleSubmit} 
                    disabled={saving || rows.length === 0} 
                    className="h-9 px-5 bg-emerald-600 text-white font-medium rounded-lg text-xs shadow-md hover:bg-emerald-700 transition-all disabled:opacity-50" 
                    style={{ fontFamily: "'Inter', sans-serif" }}
                  >
                    {saving ? 'Processing...' : 'Submit Records'}
                  </button>
                </div>
              )}
            </div>
          </div>
          </div>
        </>
      )}

      {activeSubTab === 'reports' && (
        <div className="flex flex-1 gap-4 overflow-hidden">
          <div className="flex-1 flex flex-col gap-4 overflow-hidden">
            {/* Header */}
            <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm">
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold text-gray-900" style={{ fontFamily: "'Roboto', sans-serif" }}>Attendance Dashboard</h2>
                  <p className="text-sm text-gray-500">Monitor employee attendance and working patterns</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => {
                      const end = new Date()
                      const start = new Date()
                      start.setDate(end.getDate() - 29)
                      const nextStart = formatDateForInput(start)
                      const nextEnd = formatDateForInput(end)
                      setFilterStartDate(nextStart)
                      setFilterEndDate(nextEnd)
                      setTimeout(() => handleFilterSubmit(), 0)
                    }}
                    className="h-9 px-3 bg-gray-100 text-gray-700 rounded-lg text-xs font-semibold uppercase tracking-wider hover:bg-gray-200 transition-all flex items-center gap-2"
                  >
                    <Calendar size={14} /> Last 30 Days
                  </button>
                  {/* 
                  <button
                    onClick={handleFixHistory}
                    disabled={reportLoading || fixingHistory || !reportData.length}
                    className="h-9 px-3 bg-red-50 text-red-600 border border-red-100 rounded-lg text-xs font-semibold uppercase tracking-wider hover:bg-red-100 transition-all flex items-center gap-2"
                  >
                    {fixingHistory ? <Spinner size="w-3 h-3" color="text-red-600" /> : <AlertCircle size={14} />}
                    Fix Joining History
                  </button>
                  <button
                    onClick={handleFixFutureAbsences}
                    disabled={reportLoading || fixingHistory}
                    className="h-9 px-3 bg-amber-50 text-amber-600 border border-amber-100 rounded-lg text-xs font-semibold uppercase tracking-wider hover:bg-amber-100 transition-all flex items-center gap-2"
                  >
                    {fixingHistory ? <Spinner size="w-3 h-3" color="text-amber-600" /> : <CalendarX size={14} />}
                    Fix Future Absences
                  </button>
                  */}
                  <button
                    onClick={handleFilterSubmit}
                    disabled={reportLoading}
                    className="h-9 px-3 bg-white border border-gray-200 rounded-lg text-xs font-semibold uppercase tracking-wider hover:border-indigo-300 hover:text-indigo-600 transition-all flex items-center gap-2"
                  >
                    {reportLoading ? <Spinner size="w-3 h-3" /> : <RefreshCw size={14} />}
                    Filter
                  </button>
                  <PDFDownloadLink
                    document={
                      reportsView === 'excel' ? (
                        <AttendanceExcelPDF data={reportData} startDate={filterStartDate} endDate={filterEndDate} orgName={user?.orgName} employees={employees} />
                      ) : (
                        <AttendancePDF data={reportData} startDate={filterStartDate} endDate={filterEndDate} orgName={user?.orgName} />
                      )
                    }
                    fileName={
                      reportsView === 'excel'
                        ? `attendance_excel_report_${filterStartDate}_to_${filterEndDate}.pdf`
                        : `attendance_report_${filterStartDate}_to_${filterEndDate}.pdf`
                    }
                    className={`h-9 px-3 bg-emerald-600 text-white rounded-lg text-xs font-semibold uppercase tracking-wider shadow-sm hover:bg-emerald-700 transition-all flex items-center gap-2 ${!reportData.length ? 'opacity-50 pointer-events-none' : ''}`}
                  >
                    {({ loading }) => (
                      <>
                        {loading ? <Spinner size="w-3 h-3" color="text-white" /> : <Download size={14} />}
                        Export
                      </>
                    )}
                  </PDFDownloadLink>
                </div>
              </div>
              
              {/* Secondary Sub-tab Navigation */}
              <div className="flex items-center gap-2 border-t border-gray-100 pt-3">
                <button
                  onClick={() => setReportsView('timeline')}
                  className={`h-8 px-4 rounded-lg text-xs font-semibold tracking-wider transition-all ${
                    reportsView === 'timeline'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'bg-zinc-50 text-zinc-600 hover:bg-zinc-100'
                  }`}
                >
                  Summary Timeline
                </button>
                <button
                  onClick={() => setReportsView('excel')}
                  className={`h-8 px-4 rounded-lg text-xs font-semibold tracking-wider transition-all ${
                    reportsView === 'excel'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'bg-zinc-50 text-zinc-600 hover:bg-zinc-100'
                  }`}
                >
                  Detailed Sheet (Excel)
                </button>
              </div>
            </div>

            {/* Filters */}
            <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm">
              <div className="grid grid-cols-1 md:grid-cols-6 gap-4 items-end">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Select Month</label>
                  <input
                    type="month"
                    value={filterMonth}
                    onChange={e => {
                      setFilterMonth(e.target.value)
                      handleMonthChange(e.target.value)
                    }}
                    className="w-full h-10 border border-gray-200 rounded-lg px-3 text-sm font-medium focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Start Date</label>
                  <input
                    type="date"
                    value={filterStartDate}
                    onChange={e => setFilterStartDate(e.target.value)}
                    className="w-full h-10 border border-gray-200 rounded-lg px-3 text-sm font-medium focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase text-gray-400 tracking-widest">End Date</label>
                  <input
                    type="date"
                    value={filterEndDate}
                    onChange={e => setFilterEndDate(e.target.value)}
                    className="w-full h-10 border border-gray-200 rounded-lg px-3 text-sm font-medium focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Name</label>
                  <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Search employee..."
                      value={filterName}
                      onChange={e => setFilterName(e.target.value)}
                      className="w-full h-10 border border-gray-200 rounded-lg pl-9 pr-3 text-sm font-medium focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Category / Remark</label>
                  <input
                    type="text"
                    placeholder="e.g. site, remote, remark..."
                    value={filterCategory}
                    onChange={e => setFilterCategory(e.target.value)}
                    className="w-full h-10 border border-gray-200 rounded-lg px-3 text-sm font-medium focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
                <button
                  onClick={handleFilterSubmit}
                  disabled={reportLoading}
                  className="h-10 bg-indigo-600 text-white font-bold rounded-lg text-xs uppercase tracking-widest shadow-md hover:bg-indigo-700 transition-all flex items-center justify-center gap-2"
                >
                  {reportLoading ? <Spinner size="w-4 h-4" color="text-white" /> : <RefreshCw size={14} />}
                  Generate
                </button>
              </div>
            </div>

            {reportsView === 'excel' ? (
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden flex flex-col flex-1">
                <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900">Detailed Attendance Sheet</h3>
                    <p className="text-xs text-gray-500">Excel-style chronological daily attendance log</p>
                  </div>
                  <span className="text-[10px] font-bold bg-zinc-100 text-zinc-600 px-2.5 py-1 rounded-md uppercase">
                    {sortedReportRows.length} Records
                  </span>
                </div>
                <div className="overflow-auto flex-1">
                  {reportLoading ? (
                    <div className="py-16 flex items-center justify-center"><Spinner /></div>
                  ) : reportByEmployee.length === 0 ? (
                    <div className="py-16 text-center text-zinc-400 font-medium">No report data. Select filters and click Generate.</div>
                  ) : (
                    <table className="w-full text-left border-collapse min-w-[1200px]">
                      <thead className="sticky top-0 bg-[#f8fafc] z-10 border-b border-zinc-200">
                        <tr className="h-10 text-zinc-600 text-xs select-none">
                          <th className="border-r border-zinc-200 px-4 font-semibold text-center w-28 bg-[#f8fafc] sticky left-0 z-20" rowSpan={2}>
                            Date
                          </th>
                          {reportByEmployee.map(emp => (
                            <th 
                              key={emp.id} 
                              colSpan={8} 
                              className="border-r border-zinc-200 px-4 font-bold text-center bg-indigo-50/50 text-indigo-900 border-b border-zinc-200 capitalize text-[11px]"
                            >
                              {emp.name.toLowerCase()}
                            </th>
                          ))}
                        </tr>
                        <tr className="h-8 text-zinc-500 text-[9px] select-none bg-[#fafafa]">
                          {reportByEmployee.map(emp => (
                            <React.Fragment key={`sub-${emp.id}`}>
                              <th className="border-r border-zinc-200 px-2 font-semibold text-center w-20">In Time</th>
                              <th className="border-r border-zinc-200 px-2 font-semibold text-center w-20">Out Time</th>
                              <th className="border-r border-zinc-200 px-2 font-semibold text-center w-16">Late In</th>
                              <th className="border-r border-zinc-200 px-2 font-semibold text-center w-16">Late Out</th>
                              <th className="border-r border-zinc-200 px-2 font-semibold text-center w-16">Early In</th>
                              <th className="border-r border-zinc-200 px-2 font-semibold text-center w-16">Early Out</th>
                              <th className="border-r border-zinc-200 px-2 font-semibold text-center w-16">Actual Worked</th>
                              <th className="border-r border-zinc-200 px-3 font-semibold text-left w-32">Remarks</th>
                            </React.Fragment>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-100">
                        {reportDays.map(day => (
                          <tr key={day} className="h-10 hover:bg-zinc-50 transition-colors">
                            <td className="border-r border-zinc-100 px-4 text-xs font-mono font-medium text-zinc-500 sticky left-0 bg-white z-10 shadow-[2px_0_5px_rgba(0,0,0,0.02)]">
                              {displayDateDDMMMM(day)}
                            </td>
                            {reportByEmployee.map(emp => {
                              const row = emp.rows[day]
                              if (!row) {
                                return (
                                  <React.Fragment key={`${emp.id}-${day}`}>
                                    <td className="border-r border-zinc-100 px-2 text-center text-zinc-300">-</td>
                                    <td className="border-r border-zinc-100 px-2 text-center text-zinc-300">-</td>
                                    <td className="border-r border-zinc-100 px-2 text-center text-zinc-300">-</td>
                                    <td className="border-r border-zinc-100 px-2 text-center text-zinc-300">-</td>
                                    <td className="border-r border-zinc-100 px-2 text-center text-zinc-300">-</td>
                                    <td className="border-r border-zinc-100 px-2 text-center text-zinc-300">-</td>
                                    <td className="border-r border-zinc-100 px-2 text-center text-zinc-300">-</td>
                                    <td className="border-r border-zinc-100 px-3 text-zinc-300">-</td>
                                  </React.Fragment>
                                )
                              }

                              const metrics = calculateExcelMetrics(row, employees)
                              const isAbsent = row.isAbsent || (row.status || '').toLowerCase() === 'absent'
                              const isShort = !isAbsent && metrics.totalWorkingHrs < metrics.minHours && row.inTime != null && row.outTime != null

                              return (
                                <React.Fragment key={`${emp.id}-${day}`}>
                                  <td className="border-r border-zinc-100 px-2 text-xs text-center font-medium text-zinc-600">
                                    {isAbsent ? (
                                      <span className="text-red-500 font-bold bg-red-50 border border-red-100 rounded px-1 py-0.5 text-[8px] uppercase">Abs</span>
                                    ) : (row.inTime ? formatTimeDisplay(row.inTime) : '-')}
                                  </td>
                                  <td className="border-r border-zinc-100 px-2 text-xs text-center font-medium text-zinc-600">
                                    {isAbsent ? (
                                      <span className="text-red-500 font-bold bg-red-50 border border-red-100 rounded px-1 py-0.5 text-[8px] uppercase">Abs</span>
                                    ) : (row.outTime ? formatTimeDisplay(row.outTime) : '-')}
                                  </td>
                                  <td className={`border-r border-zinc-100 px-2 text-xs font-mono text-center ${metrics.lateInHrs > 0 ? 'text-amber-600 font-bold bg-amber-50/20' : 'text-zinc-300'}`}>
                                    {metrics.lateInHrs > 0 ? `${metrics.lateInHrs.toFixed(2)}` : '-'}
                                  </td>
                                  <td className={`border-r border-zinc-100 px-2 text-xs font-mono text-center ${metrics.lateOutHrs > 0 ? 'text-indigo-600 font-bold bg-indigo-50/20' : 'text-zinc-300'}`}>
                                    {metrics.lateOutHrs > 0 ? `${metrics.lateOutHrs.toFixed(2)}` : '-'}
                                  </td>
                                  <td className={`border-r border-zinc-100 px-2 text-xs font-mono text-center ${metrics.earlyInHrs > 0 ? 'text-emerald-600 font-bold bg-emerald-50/20' : 'text-zinc-300'}`}>
                                    {metrics.earlyInHrs > 0 ? `${metrics.earlyInHrs.toFixed(2)}` : '-'}
                                  </td>
                                  <td className={`border-r border-zinc-100 px-2 text-xs font-mono text-center ${metrics.earlyOutHrs > 0 ? 'text-rose-500 font-bold bg-rose-50/20' : 'text-zinc-300'}`}>
                                    {metrics.earlyOutHrs > 0 ? `${metrics.earlyOutHrs.toFixed(2)}` : '-'}
                                  </td>
                                  <td className={`border-r border-zinc-100 px-2 text-xs font-mono text-center ${isShort ? 'text-rose-600 font-bold bg-rose-50/40' : 'text-zinc-800 font-bold'}`}>
                                    {isAbsent ? '0.00' : `${metrics.actualWorkedHrs.toFixed(2)}`}
                                  </td>
                                  <td className="border-r border-zinc-100 px-3 text-xs text-zinc-500 truncate" title={row.remarks}>
                                    {row.remarks || '-'}
                                  </td>
                                </React.Fragment>
                              )
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            ) : (
              <>
                {/* Timeline */}
                <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden flex flex-col">
                  <div className="px-5 py-4 border-b border-gray-100">
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900">30-Day Attendance Timeline</h3>
                    <p className="text-xs text-gray-500">
                      {filterStartDate && filterEndDate ? `${displayShortDate(filterStartDate)} - ${displayShortDate(filterEndDate)}` : 'Select a range'}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-[10px] font-semibold text-gray-500">
                    {[
                      { label: 'Present', color: 'bg-emerald-500' },
                      { label: 'Late', color: 'bg-amber-400' },
                      { label: 'Absent', color: 'bg-gray-300' },
                      { label: 'Remote', color: 'bg-blue-500' },
                      { label: 'Overtime', color: 'bg-violet-500' }
                    ].map(item => (
                      <div key={item.label} className="flex items-center gap-1.5">
                        <span className={`w-2 h-2 rounded-full ${item.color}`}></span>
                        {item.label}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="overflow-auto">
                {reportLoading ? (
                  <div className="py-16 flex items-center justify-center"><Spinner /></div>
                ) : reportByEmployee.length === 0 ? (
                  <div className="py-16 text-center text-gray-300 font-medium">No report data. Select filters and click Generate.</div>
                ) : (
                  <table className="min-w-[900px] w-full text-left border-collapse">
                    <thead className="sticky top-0 z-10 bg-gray-50 border-b border-gray-200">
                      <tr className="h-10">
                        <th className="px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider sticky left-0 bg-gray-50 z-20">Employee</th>
                        {reportDays.map(day => {
                          const d = new Date(day)
                          const wd = ['S', 'M', 'T', 'W', 'T', 'F', 'S'][d.getDay()]
                          return (
                            <th key={day} className="px-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wide text-center">
                              <div className="leading-none">{wd}</div>
                              <div className="text-[9px] text-gray-500">{d.getDate()}</div>
                            </th>
                          )
                        })}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {reportByEmployee.map(emp => (
                        <tr key={emp.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-2 sticky left-0 bg-white z-10">
                            <div className="text-[12px] font-semibold text-gray-800">{emp.name}</div>
                            <div className="text-[10px] text-gray-400">{emp.department}</div>
                          </td>
                          {reportDays.map(day => {
                            const row = emp.rows[day]
                            const status = classifyAttendanceRow(row, emp)
                            const color = getStatusColor(status)
                            return (
                              <td key={`${emp.id}-${day}`} className="px-1 py-2 text-center">
                                <div
                                  className={`w-4 h-4 rounded-md ${color} ${status === 'none' ? 'border border-gray-100' : ''}`}
                                  title={row ? `${displayDate(day)} - ${row.status || 'Present'}` : `${displayDate(day)} - No data`}
                                ></div>
                              </td>
                            )
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            {/* Employee Statistics */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden flex flex-col">
              <div className="px-5 py-4 border-b border-gray-100">
                <h3 className="text-sm font-semibold text-gray-900">Employee Statistics ({reportDays.length || 0} Days)</h3>
              </div>
              <div className="overflow-x-auto">
<table className="w-full min-w-[1100px] text-left border-collapse">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr className="h-10">
                      <th className="px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Employee</th>
                      <th className="px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Department</th>
                      <th className="px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider text-center">Days Present</th>
                      <th className="px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider text-center">Late Arrivals</th>
                      <th className="px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider text-center">Absences</th>
                      <th className="px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider text-center">Total Hours</th>
                      <th className="px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider text-center">Attendance %</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {reportSummaryRows.length === 0 ? (
                      <tr><td colSpan={7} className="text-center py-12 text-gray-300 font-medium">No statistics yet.</td></tr>
                    ) : (
                      reportSummaryRows.map(row => (
                        <tr key={row.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-3 text-[12px] font-semibold text-gray-900">{row.name}</td>
                          <td className="px-4 py-3 text-[12px] text-gray-500">{row.department}</td>
                          <td className="px-4 py-3 text-[12px] text-gray-700 text-center">{row.present}</td>
                          <td className="px-4 py-3 text-[12px] text-amber-600 text-center">{row.late}</td>
                          <td className="px-4 py-3 text-[12px] text-red-600 text-center">{row.absent}</td>
                          <td className="px-4 py-3 text-[12px] text-gray-700 text-center">{row.totalHours}</td>
                          <td className="px-4 py-3 text-[12px] text-center">
                            <span className="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 text-[10px] font-bold">
                              {row.attendancePct}%
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>

          {/* Right Sidebar */}
          {reportsView !== 'excel' && (
            <div className="hidden xl:flex w-[280px] shrink-0 flex-col gap-4">
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Total Employees</p>
                <div className="mt-2 text-2xl font-semibold text-gray-900">{reportTotals.totalEmployees || 0}</div>
                <div className="text-[10px] text-gray-500 font-semibold mt-1">Active in range</div>
              </div>
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Present Today</p>
                <div className="mt-2 text-2xl font-semibold text-gray-900">{reportTotals.presentToday || 0}</div>
                <div className="text-[10px] text-indigo-600 font-semibold mt-1">
                  {reportTotals.totalEmployees ? `${Math.round((reportTotals.presentToday / reportTotals.totalEmployees) * 1000) / 10}%` : '0%'}
                </div>
              </div>
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Absent Today</p>
                <div className="mt-2 text-2xl font-semibold text-gray-900">{reportTotals.absentToday || 0}</div>
                <div className="text-[10px] text-gray-500 font-semibold mt-1">Based on {displayShortDate(filterEndDate)}</div>
              </div>
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Avg Working Hours</p>
                <div className="mt-2 text-2xl font-semibold text-gray-900">
                  {reportTotals.avgWorkingHours ? `${reportTotals.avgWorkingHours.toFixed(1)}h` : '0h'}
                </div>
                <div className="text-[10px] text-gray-500 font-semibold mt-1">Standard Shift</div>
              </div>
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-gray-900">Team</p>
                  <span className="text-[10px] text-gray-400 font-bold uppercase">{activeEmployees.slice(0, 4).length} online</span>
                </div>
                <div className="mt-3 space-y-3">
                  {activeEmployees.slice(0, 4).map(emp => (
                    <div key={emp.id} className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full text-white text-[10px] font-bold flex items-center justify-center" style={{ backgroundColor: getAvatarColor(emp.id) }}>
                        {getInitials(emp.name)}
                      </div>
                      <div className="min-w-0">
                        <div className="text-[12px] font-semibold text-gray-800 truncate">{emp.name}</div>
                        <div className="text-[10px] text-gray-400 truncate">{emp.role || emp.designation || 'Employee'}</div>
                      </div>
                    </div>
                  ))}
                </div>
                <button className="mt-4 w-full h-9 bg-emerald-600 text-white rounded-lg text-xs font-bold uppercase tracking-widest hover:bg-emerald-700 transition-all">
                  + Invite Member
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Reset Warning Modal */}
      <Modal isOpen={showResetWarning} onClose={() => setShowResetWarning(false)} title="⚠️ Reset All Records">
        <div className="p-6">
          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Trash2 size={28} className="text-red-600" />
            </div>
            <h3 className="text-lg font-bold text-gray-800 mb-2">Delete All Records?</h3>
            <p className="text-sm text-gray-500">
              This will permanently delete all {rows.length} attendance records for <strong>{formatDate(selectedDate)}</strong>.
            </p>
            <p className="text-xs text-red-500 mt-2 font-medium">This action cannot be undone.</p>
          </div>
          <div className="flex gap-3">
            <button 
              onClick={() => setShowResetWarning(false)} 
              className="flex-1 h-10 border border-gray-300 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50 transition-all"
            >
              Cancel
            </button>
            <button 
              onClick={handleResetAll} 
              disabled={saving}
              className="flex-1 h-10 bg-red-600 text-white rounded-lg text-sm font-medium shadow-md hover:bg-red-700 transition-all disabled:opacity-50"
            >
              {saving ? 'Deleting...' : 'Yes, Delete All'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Warning Modal */}
      <Modal isOpen={showWarning} onClose={() => setShowWarning(false)} title="Conflict Detected">
        <div className="p-6 text-center">
          <div className="text-4xl mb-4">⚠️</div>
          <h3 className="text-lg font-semibold text-gray-800 mb-2">Records Already Exist</h3>
          <p className="text-sm text-gray-500 mb-6">Some employees already have attendance data for this date. Overwriting will replace their current logs.</p>
          <div className="flex gap-3">
            <button onClick={() => setShowWarning(false)} className="flex-1 h-10 border border-gray-200 rounded-lg text-sm font-medium text-gray-500 hover:bg-gray-50">Abort</button>
            <button onClick={() => { setShowWarning(false); handleSubmit(); }} className="flex-1 h-10 bg-indigo-600 text-white rounded-lg text-sm font-medium shadow-md hover:bg-indigo-700">Overwrite</button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
