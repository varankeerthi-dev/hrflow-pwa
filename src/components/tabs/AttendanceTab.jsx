import React, { useState, useEffect, useMemo, useRef } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { useEmployees } from '../../hooks/useEmployees'
import { useAttendance, calcOT } from '../../hooks/useAttendance'
import { db } from '../../lib/firebase'
import { doc, getDoc } from 'firebase/firestore'
import Spinner from '../ui/Spinner'
import Modal from '../ui/Modal'
import TimePicker from '../ui/TimePicker'
import { ChevronLeft, ChevronRight, Check, Copy, X, Plus, ArrowRight, RefreshCw, Trash2, Calendar, FileText, Search, Download } from 'lucide-react'
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

// Display date as Mmm Dd (e.g., "Mar 10")
function displayShortDate(isoDate) {
  if (!isoDate) return ''
  const d = new Date(isoDate)
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${months[d.getMonth()]} ${d.getDate()}`
}

// Helper for time formatting
function formatTimeDisplay(time24) {
  if (!time24) return '';
  const [h, m] = time24.split(':').map(Number);
  const p = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${p}`;
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
    // Current hour context
    h = new Date().getHours() % 12 || 12;
    m = parseInt(digits);
    if (m > 59) m = 50;
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

const TimeEditableCell = ({ value, onChange, onShowPicker, disabled, backgroundColor, rowIdx, field, placeholder, extra, error }) => {
  const [tempValue, setTempValue] = useState('');
  const [isEditing, setIsEditing] = useState(false);

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
          const nextInput = document.querySelector(`[data-row="${nextRowIdx}"][data-field="${nextField}"]`);
          if (nextInput) {
            nextInput.focus();
          }
        }, 50);
      }
    }
  };

  return (
    <div className="flex flex-col w-full gap-1">
      <div 
        className={`relative flex items-center rounded-md border min-h-[32px] transition-all overflow-hidden ${error ? 'border-red-500 shadow-[0_0_0_1px_rgba(239,68,68,0.2)]' : 'border-gray-200'}`}
        style={{ backgroundColor: disabled ? '#f9fafb' : backgroundColor }}
      >
        <div className="flex-1 flex flex-col items-center min-w-0 py-0.5">
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
            data-row={rowIdx}
            data-field={field}
            className="w-full bg-transparent border-none outline-none px-2 text-[13px] font-medium text-center font-['Roboto',sans-serif] text-gray-800 placeholder-gray-400/20 outline-none disabled:text-gray-400 h-7"
            placeholder={placeholder || "--:--"}
          />
          {extra}
        </div>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onShowPicker(); }}
          disabled={disabled}
          className="pr-2 text-[14px] cursor-pointer hover:scale-125 transition-transform disabled:opacity-30 disabled:cursor-not-allowed"
          title="Open time picker"
        >
          🕐
        </button>
      </div>
      {error && <span className="text-[9px] text-red-500 font-bold uppercase leading-none text-center animate-in fade-in duration-300">{error}</span>}
    </div>
  );
};

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

export default function AttendanceTab() {
  const { user } = useAuth()
  const { employees, loading: empLoading } = useEmployees(user?.orgId, true)
  const { fetchByDate, upsertAttendance, deleteByDate, loading: attLoading, fetchRange } = useAttendance(user?.orgId)

  const [activeSubTab, setActiveSubTab] = useState('daily') // 'daily' or 'reports'
  const [selectedDate, setSelectedDate] = useState(formatDateForInput(new Date()))
  
  // Reports Filter States
  const [filterStartDate, setFilterStartDate] = useState(formatDateForInput(new Date(new Date().getFullYear(), new Date().getMonth(), 1)))
  const [filterEndDate, setFilterEndDate] = useState(formatDateForInput(new Date()))
  const [filterCategory, setFilterCategory] = useState('')
  const [filterName, setFilterName] = useState('')
  const [reportData, setFilterReportData] = useState([])
  const [reportLoading, setReportLoading] = useState(false)

  const [rows, setRows] = useState([])
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [orgData, setOrgData] = useState(null)
  const [existingRecords, setExistingRecords] = useState([])

  const [showWarning, setShowWarning] = useState(false)
  const [showResetWarning, setShowResetWarning] = useState(false)
  const [copyData, setCopyData] = useState(null)
  const [showCopyModal, setShowCopyModal] = useState(false)
  const [activeCopyEmpId, setActiveCopyEmpId] = useState(null);
  const [rowOrder, setRowOrder] = useState([])

  const [copyConfig, setCopyConfig] = useState({ inTime: false, outTime: true })
  const [selectedEmps, setSelectedEmps] = useState([])
  const [showInTimePicker, setShowInTimePicker] = useState(null)
  const [showOutTimePicker, setShowOutTimePicker] = useState(null)
  const [validationErrors, setValidationErrors] = useState({})

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
    const active = employees.filter(e => e.status === 'Active')
    if (!Array.isArray(rowOrder) || !rowOrder.length) return active
    return [...active].sort((a, b) => {
      const idxA = rowOrder.indexOf(a.id)
      const idxB = rowOrder.indexOf(b.id)
      if (idxA === -1 && idxB === -1) return 0
      if (idxA === -1) return 1
      if (idxB === -1) return -1
      return idxA - idxB
    })
  }, [employees, rowOrder])

  const activeEmployees = useMemo(() => sortedEmployees, [sortedEmployees])
  const isSunday = new Date(selectedDate).getDay() === 0
  const isDayShift = orgData?.shiftStrategy === 'Day'

  useEffect(() => {
    if (!user?.orgId || !selectedDate) return
    getDoc(doc(db, 'organisations', user.orgId)).then(snap => {
      if (snap.exists()) {
        setOrgData(snap.data())
        if (snap.data().employeeRowOrder) {
          setRowOrder(snap.data().employeeRowOrder)
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

        const sortedRecords = [...enrichedRecords].sort((a, b) => {
          if (!Array.isArray(rowOrder) || !rowOrder.length) return a.name.localeCompare(b.name)
          const idxA = rowOrder.indexOf(a.employeeId)
          const idxB = rowOrder.indexOf(b.employeeId)
          if (idxA === -1 && idxB === -1) return a.name.localeCompare(b.name)
          if (idxA === -1) return 1
          if (idxB === -1) return -1
          return idxA - idxB
        })
        setRows(sortedRecords)
      } else {
        setRows([])
      }
    })
  }, [user?.orgId, selectedDate, rowOrder])

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
    if (!activeEmployees.length) return
    const newRows = activeEmployees.map(emp => ({
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
      minDailyHours: emp.minDailyHours || 8
    }))
    setRows(newRows)
  }

  const handleAddRow = () => {
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
    setRows(prev => prev.filter(r => r.employeeId !== empId))
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
        minDailyHours: emp.minDailyHours || 8
      }
    }))
  }

  const updateRow = (empId, field, value) => {
    setRows(prev => prev.map(r => {
      if (r.employeeId !== empId) return r
      const updated = { ...r, [field]: value }
      if (field === 'inDate' && isDayShift) updated.outDate = value
      if (field === 'shiftType' && value === 'Night') {
        const inDate = new Date(updated.inDate)
        inDate.setDate(inDate.getDate() + 1)
        updated.outDate = inDate.toISOString().split('T')[0]
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
    setRows(prev => prev.map(r => {
      if (r.employeeId !== empId) return r
      const updated = { ...r, status: newStatus }
      updated.isAbsent = newStatus === 'Absent'
      updated.sundayWorked = newStatus === 'SunWorked'
      updated.sundayHoliday = newStatus === 'SunHoliday'
      if (updated.isAbsent || updated.sundayHoliday) {
        updated.inTime = ''; updated.outTime = ''; updated.otHours = '00:00'
      }
      return updated
    }))
  }

  const handleSubmit = async () => {
    if (!rows.length) return

    // Validation: At least one time (In or Out) is mandatory for 'Present' or 'SunWorked' status
    const newErrors = {}
    rows.forEach(r => {
      if ((r.status === 'Present' || r.status === 'SunWorked') && !r.inTime && !r.outTime) {
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
    setSaving(true)
    try {
      await upsertAttendance(rows)
      await logActivity(user?.orgId, user, {
        module: 'Attendance',
        action: `Attendance submitted for ${rows.length} employee(s) on ${selectedDate}`,
        detail: rows.map(r => r.name).join(', ')
      })
      
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
      const sortedUpdated = [...enrichedUpdated].sort((a, b) => {
        if (!Array.isArray(rowOrder) || !rowOrder.length) return a.name.localeCompare(b.name)
        const idxA = rowOrder.indexOf(a.employeeId)
        const idxB = rowOrder.indexOf(b.employeeId)
        if (idxA === -1 && idxB === -1) return a.name.localeCompare(b.name)
        if (idxA === -1) return 1
        if (idxB === -1) return -1
        return idxA - idxB
      })

      setRows(sortedUpdated)
      setSaved(true)
      setShowWarning(false)
      setTimeout(() => setSaved(false), 3000)
    } catch (error) {
      console.error('Error saving attendance:', error)
      alert('Failed to save attendance. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const handleCopySubmit = () => {
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

  // Handle Reset All
  const handleResetAll = async () => {
    if (!rows.length) {
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

  return (
    <div className="flex flex-col h-full gap-3" style={{ fontFamily: "'Roboto', sans-serif" }}>
      {/* Title Header - Sticky */}
      <div className="bg-white px-6 py-4 rounded-xl border border-gray-100 shadow-sm flex items-center sticky top-0 z-10 gap-[40px]">
        <div className="flex items-center gap-6">
          <h1 className="text-2xl font-normal text-gray-900" style={{ fontFamily: "'Roboto', sans-serif" }}>Attendance</h1>
          <div className="flex bg-gray-100 p-1 rounded-lg">
            <button 
              onClick={() => setActiveSubTab('daily')}
              className={`px-4 py-1.5 text-[11px] font-black uppercase tracking-widest rounded-md transition-all ${activeSubTab === 'daily' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              Daily Entry
            </button>
            <button 
              onClick={() => setActiveSubTab('reports')}
              className={`px-4 py-1.5 text-[11px] font-black uppercase tracking-widest rounded-md transition-all ${activeSubTab === 'reports' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              Reports
            </button>
          </div>
        </div>
        
        {/* Date & Action Bar moved here */}
        {activeSubTab === 'daily' ? (
          <div className="flex flex-1 justify-between items-center">
            <div className="flex items-center gap-4">
              <div className="flex items-center bg-gray-50 rounded-lg p-1 border border-gray-200">
                <button onClick={() => setSelectedDate(d => { const nd = new Date(d); nd.setDate(nd.getDate() - 1); return formatDateForInput(nd); })} className="p-1.5 hover:bg-white hover:shadow-sm rounded-md text-gray-500 transition-all"><ChevronLeft size={16} /></button>
                <div className="relative flex items-center">
                  <input 
                    type="date" 
                    value={selectedDate} 
                    onChange={e => setSelectedDate(e.target.value)} 
                    className="font-semibold bg-transparent border-none outline-none px-3 text-sm text-gray-700 h-[32px] cursor-pointer opacity-0 absolute w-full left-0 top-0" 
                  />
                  <div 
                    className="font-semibold text-sm text-gray-700 h-[32px] flex items-center px-3 cursor-pointer select-none gap-2"
                    onClick={(e) => {
                      const input = e.currentTarget.parentElement.querySelector('input[type="date"]');
                      input?.showPicker?.();
                    }}
                  >
                    <Calendar size={14} className="text-gray-400" />
                    {new Date(selectedDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </div>
                </div>
                <button onClick={() => setSelectedDate(d => { const nd = new Date(d); nd.setDate(nd.getDate() + 1); return formatDateForInput(nd); })} className="p-1.5 hover:bg-white hover:shadow-sm rounded-md text-gray-500 transition-all"><ChevronRight size={16} /></button>
              </div>
              <div className="flex flex-col">
                <span className="text-lg font-bold leading-tight">
                  <span className="text-indigo-600">{formatDate(selectedDate).split(' ')[0]}</span>
                  <span className="text-gray-600"> {formatDate(selectedDate).split(' ').slice(1).join(' ')}</span>
                </span>
                {isSunday && <span className="text-xs font-semibold text-orange-600 uppercase tracking-wide flex items-center gap-1">Sunday Routine</span>}
              </div>
            </div>
            
            <div className="flex items-center gap-2">
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
        ) : (
          <div className="flex flex-1 justify-end">
            <PDFDownloadLink
              document={<AttendancePDF data={reportData} startDate={filterStartDate} endDate={filterEndDate} orgName={user?.orgName} />}
              fileName={`attendance_report_${filterStartDate}_to_${filterEndDate}.pdf`}
              className={`h-9 px-4 bg-emerald-600 text-white font-medium rounded-lg text-xs shadow-sm hover:bg-emerald-700 transition-all flex items-center gap-2 ${!reportData.length ? 'opacity-50 pointer-events-none' : ''}`}
            >
              {({ loading }) => (
                <>
                  {loading ? <Spinner size="w-3 h-3" color="text-white" /> : <Download size={14} />}
                  Export PDF
                </>
              )}
            </PDFDownloadLink>
          </div>
        )}
      </div>

      {activeSubTab === 'daily' ? (
        <>
          {/* Main Table Card */}
          <div className="flex-1 bg-white rounded-xl border border-gray-100 shadow-sm overflow-visible flex flex-col">
            <div className="overflow-x-visible">
              <table className="w-full text-left border-collapse">
                <thead className="sticky top-[73px] z-10 bg-gray-50">
                  <tr className="h-10 border-b border-gray-200">
                    <th className="px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider w-[22%]">Employee Name</th>
                    <th className="px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider text-center w-[80px]">Shift</th>
                    <th className="px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider text-center w-[100px]">In Time</th>
                    <th className="px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider text-center w-[100px]">Out Time</th>
                    <th className="px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider text-center w-[60px]">OT</th>
                    <th className="px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider w-[15%]">Remarks</th>
                    <th className="px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right w-[120px]">Status</th>
                    <th className="px-2 text-xs font-semibold text-gray-500 uppercase tracking-wider w-[40px]"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {empLoading ? (
                    <tr><td colSpan={8} className="text-center py-12"><Spinner /></td></tr>
                  ) : rows.length === 0 ? (
                    <tr><td colSpan={8} className="text-center py-20 text-gray-300 font-medium text-lg">Ready to generate attendance</td></tr>
                  ) : (
                    rows.map((row, idx) => (
                      <tr key={row.employeeId || `new-${idx}`} className={`transition-colors hover:bg-gray-50 ${row.isAbsent ? 'bg-red-50/30' : ''} ${row.shiftType === 'Night' && row.outTime ? 'h-[48px]' : 'h-[40px]'}`}>
                        <td className="px-4">
                          {row.employeeId ? (
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-gray-800 text-sm" style={{ fontFamily: "'Inter', sans-serif" }}>{row.name}</span>
                            </div>
                          ) : (
                            <select
                              value=""
                              onChange={(e) => handleEmployeeSelect(idx, e.target.value)}
                              className="w-full h-8 border border-gray-200 rounded-lg px-2 text-xs font-medium bg-gray-50 focus:ring-2 focus:ring-indigo-500 outline-none"
                              style={{ fontFamily: "'Inter', sans-serif" }}
                            >
                              <option value="">Select Employee...</option>
                              {employees.filter(e => !rows.some(r => r.employeeId === e.id)).map(e => (
                                <option key={e.id} value={e.id}>{e.name}</option>
                              ))}
                            </select>
                          )}
                        </td>
                        <td className="px-3 text-center">
                          <button
                            onClick={() => updateRow(row.employeeId, 'shiftType', row.shiftType === 'Night' ? 'Day' : 'Night')}
                            disabled={row.isAbsent || row.status === 'SunHoliday'}
                            className={`relative w-[58px] h-5 rounded-full transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed ${row.shiftType === 'Night' ? 'bg-slate-700' : 'bg-emerald-500'}`}
                          >
                            <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-all duration-200 ${row.shiftType === 'Night' ? 'left-[36px]' : 'left-0.5'}`}></span>
                            <span className={`absolute top-0.5 text-[7px] font-bold ${row.shiftType === 'Night' ? 'left-2 text-white' : 'right-2 text-white'}`} style={{ fontFamily: "'Inter', sans-serif" }}>
                              {row.shiftType === 'Night' ? 'NIGHT' : 'DAY'}
                            </span>
                          </button>
                        </td>
                        <td className="px-3 text-center">
                          <div className="flex items-center justify-center relative">
                            <TimeEditableCell
                              value={row.inTime}
                              onChange={(time) => updateRow(row.employeeId, 'inTime', time)}
                              onShowPicker={() => setShowInTimePicker(showInTimePicker === row.employeeId ? null : row.employeeId)}
                              disabled={row.isAbsent || row.status === 'SunHoliday'}
                              backgroundColor="#e8f4f8"
                              rowIdx={idx}
                              field="inTime"
                              error={validationErrors[row.employeeId]}
                            />
                            {showInTimePicker === row.employeeId && (
                              <TimePicker
                                value={row.inTime || '09:00'}
                                onChange={(time) => updateRow(row.employeeId, 'inTime', time)}
                                onClose={() => setShowInTimePicker(null)}
                              />
                            )}
                          </div>
                        </td>
                        <td className="px-3 text-center">
                          <div className="flex items-center justify-center relative flex-col">
                            <TimeEditableCell
                              value={row.outTime}
                              onChange={(time) => updateRow(row.employeeId, 'outTime', time)}
                              onShowPicker={() => setShowOutTimePicker(showOutTimePicker === row.employeeId ? null : row.employeeId)}
                              disabled={row.isAbsent || row.status === 'SunHoliday'}
                              backgroundColor="#fff4e8"
                              rowIdx={idx}
                              field="outTime"
                              placeholder="09:00 PM"
                              error={validationErrors[row.employeeId]}
                              extra={row.shiftType === 'Night' && row.outTime && (
                                <div className="flex items-center gap-1 text-[9px] text-orange-600/70 font-bold whitespace-nowrap pr-1">
                                  <ArrowRight size={8} />
                                  <span>{displayShortDate(row.outDate)}</span>
                                </div>
                              )}
                            />
                            {showOutTimePicker === row.employeeId && (
                              <TimePicker
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
                          <div className="bg-gray-50 border border-gray-100 rounded-md px-2 py-1">
                            <input
                              type="text"
                              value={row.remarks || ''}
                              onChange={e => updateRow(row.employeeId, 'remarks', e.target.value)}
                              className="border-none bg-transparent p-0 text-xs focus:ring-0 text-gray-600 w-full placeholder-gray-300"
                              placeholder="..."
                              style={{ fontFamily: "'Inter', sans-serif" }}
                            />
                          </div>
                        </td>
                        <td className="px-4">
                          <div className="flex items-center gap-2 justify-end">
                            {[
                              { id: 'Present', label: 'Present', color: 'green' },
                              { id: 'Absent', label: 'Absent', color: 'red' },
                              ...(isSunday ? [
                                { id: 'SunWorked', label: 'Worked', color: 'amber' },
                                { id: 'SunHoliday', label: 'Holiday', color: 'indigo' }
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
                          </div>
                        </td>
                        <td className="px-2 text-center">
                          <button
                            onClick={() => handleClearRow(row.employeeId)}
                            className="p-1 rounded hover:bg-red-50 text-gray-300 hover:text-red-500 transition-colors"
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

          {/* Bottom Footer Card */}
          <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex justify-between items-center sticky bottom-0">
            <div className="flex gap-6 px-4">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                <span className="text-xs font-medium text-gray-600" style={{ fontFamily: "'Inter', sans-serif" }}>Present: {rows.filter(r => !r.isAbsent && !r.sundayHoliday).length}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                <span className="text-xs font-medium text-gray-600" style={{ fontFamily: "'Inter', sans-serif" }}>Absent: {rows.filter(r => r.isAbsent).length}</span>
              </div>
            </div>
            <div className="flex items-center gap-4">
              {saved && <div className="flex items-center gap-1.5 text-green-600 text-xs font-medium" style={{ fontFamily: "'Inter', sans-serif" }}><Check size={14} /> Changes Synced</div>}
              <button onClick={handleSubmit} disabled={saving || rows.length === 0} className="h-10 px-6 bg-indigo-600 text-white font-medium rounded-lg text-sm shadow-md hover:bg-indigo-700 transition-all disabled:opacity-50" style={{ fontFamily: "'Inter', sans-serif" }}>
                {saving ? 'Processing...' : 'Submit Records'}
              </button>
            </div>
          </div>
        </>
      ) : (
        <div className="flex flex-col flex-1 gap-4 overflow-hidden">
          {/* Filters */}
          <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
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
                <label className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Name / Category</label>
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input 
                    type="text" 
                    placeholder="Search name or remark..." 
                    value={filterName}
                    onChange={e => setFilterName(e.target.value)}
                    className="w-full h-10 border border-gray-200 rounded-lg pl-9 pr-3 text-sm font-medium focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
              </div>
              <button 
                onClick={handleFilterSubmit}
                disabled={reportLoading}
                className="h-10 bg-indigo-600 text-white font-bold rounded-lg text-xs uppercase tracking-widest shadow-md hover:bg-indigo-700 transition-all flex items-center justify-center gap-2"
              >
                {reportLoading ? <Spinner size="w-4 h-4" color="text-white" /> : <RefreshCw size={14} />}
                Generate Report
              </button>
            </div>
          </div>

          {/* Results Table */}
          <div className="flex-1 bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden flex flex-col">
            <div className="overflow-y-auto">
              <table className="w-full text-left border-collapse">
                <thead className="sticky top-0 z-10 bg-gray-50 border-b border-gray-200">
                  <tr className="h-10">
                    <th className="px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Date</th>
                    <th className="px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Employee</th>
                    <th className="px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Shift</th>
                    <th className="px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">In</th>
                    <th className="px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Out</th>
                    <th className="px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Remarks</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {reportLoading ? (
                    <tr><td colSpan={7} className="text-center py-12"><Spinner /></td></tr>
                  ) : reportData.length === 0 ? (
                    <tr><td colSpan={7} className="text-center py-20 text-gray-300 font-medium italic">No report data. Select filters and click Generate.</td></tr>
                  ) : (
                    reportData.map((row, i) => (
                      <tr key={i} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 text-[12px] font-medium text-gray-500 whitespace-nowrap">{displayDate(row.date)}</td>
                        <td className="px-4 py-3 text-[13px] font-bold text-gray-900 whitespace-nowrap">{row.name}</td>
                        <td className="px-4 py-3 text-[12px] font-medium text-gray-600">{row.shiftType}</td>
                        <td className="px-4 py-3 text-[12px] font-medium text-gray-800">{row.inTime || '-'}</td>
                        <td className="px-4 py-3 text-[12px] font-medium text-gray-800">{row.outTime || '-'}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${row.status === 'Present' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                            {row.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-[12px] text-gray-500 truncate max-w-[150px]" title={row.remarks}>{row.remarks || '-'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Warning Modal */}
