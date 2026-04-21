import React, { useState, useMemo, useEffect, useRef } from 'react';
import { X, Plus, Trash2, Save, AlertTriangle, ChevronDown, Clock, Calendar, Search, Users, User, ArrowRight } from 'lucide-react';
import { z } from 'zod';
import Modal from '../ui/Modal';
import Spinner from '../ui/Spinner';
import TimePicker from '../ui/TimePicker';
import { useAttendance, calcOT } from '../../hooks/useAttendance';
import { formatTimeTo12Hour } from '../../lib/salaryUtils';

const attendanceRowSchema = z.object({
  date: z.string().min(1, "Date is required"),
  employeeId: z.string().min(1, "Employee is required"),
  inTime: z.string().optional(),
  outTime: z.string().optional(),
  remarks: z.string().optional(),
  status: z.enum(['Present', 'Absent', 'Worked', 'Holiday', 'SunWorked', 'SunHoliday', 'Half-Day']),
});

const EmployeeSearchableDropdown = ({ employees, selectedId, onSelect, placeholder = 'Select Staff...', disabled = false }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  const filtered = useMemo(() => 
    employees.filter(e => e.name.toLowerCase().includes(searchTerm.toLowerCase())), 
    [employees, searchTerm]
  );

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedName = employees.find(e => e.id === selectedId)?.name;

  return (
    <div className={`relative w-full h-full ${disabled ? 'pointer-events-none' : ''}`} ref={dropdownRef}>
      <div 
        className={`w-full h-full min-h-[28px] px-2 flex items-center justify-between transition-all ${disabled ? 'bg-zinc-50 opacity-60' : 'bg-white cursor-pointer hover:bg-zinc-50'}`} 
        onClick={() => !disabled && setIsOpen(!isOpen)}
      >
        <span className={`text-[11px] font-bold truncate capitalize ${selectedName ? 'text-zinc-800' : 'text-zinc-400'}`}>
          {selectedName ? selectedName.toLowerCase() : placeholder.toLowerCase()}
        </span>
        {!disabled && <ChevronDown size={10} className="text-zinc-400 shrink-0 ml-1" />}
      </div>
      
      {isOpen && !disabled && (
        <div className="absolute top-full left-0 right-0 mt-0.5 bg-white border border-zinc-200 rounded-lg shadow-2xl z-[110] p-1.5 animate-in fade-in zoom-in-95 duration-150">
          <div className="relative mb-1.5">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input 
              autoFocus 
              type="text" 
              className="w-full h-8 border-none rounded-md pl-8 pr-2 text-[11px] focus:outline-none focus:ring-0 bg-zinc-50 font-medium" 
              placeholder="Search..." 
              value={searchTerm} 
              onChange={e => setSearchTerm(e.target.value)} 
            />
          </div>
          <div className="max-h-56 overflow-y-auto custom-scrollbar">
            {filtered.length === 0 ? (
              <div className="text-[10px] text-zinc-400 text-center py-6 font-bold uppercase tracking-widest">no results</div>
            ) : filtered.map(e => (
              <button 
                key={e.id} 
                className="w-full text-left px-3 py-2 text-[11px] hover:bg-[#3e2723] hover:text-white rounded-md capitalize font-bold transition-all mb-0.5 last:mb-0" 
                onClick={() => { onSelect(e.id); setIsOpen(false); setSearchTerm(''); }}
              >
                {e.name.toLowerCase()}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const BulkAttendanceModal = ({ isOpen, onClose, employees, orgId }) => {
  const { upsertAttendance, fetchByDate } = useAttendance(orgId);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showInTimePicker, setShowInTimePicker] = useState(null);
  const [showOutTimePicker, setShowOutTimePicker] = useState(null);
  const [errors, setErrors] = useState({});
  const [showOverwriteWarning, setShowOverwriteWarning] = useState(false);
  
  const [mode, setMode] = useState('multiple');
  const [bulkConfig, setBulkConfig] = useState({
    employeeId: '',
    startDate: new Date().toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
  });

  useEffect(() => {
    if (isOpen && rows.length === 0 && mode === 'multiple') {
      addEmptyRow();
    }
  }, [isOpen, mode]);

  const addEmptyRow = () => {
    const today = new Date().toISOString().split('T')[0];
    setRows(prev => [...prev, {
      id: Math.random().toString(36).substr(2, 9),
      date: today,
      employeeId: '',
      inTime: '09:00',
      outTime: '18:00',
      otHours: '00:00',
      remarks: '',
      status: 'Present',
    }]);
  };

  const generateBulkRows = () => {
    if (!bulkConfig.employeeId || !bulkConfig.startDate || !bulkConfig.endDate) {
      alert("Please select an employee and date range first.");
      return;
    }
    
    const start = new Date(bulkConfig.startDate);
    const end = new Date(bulkConfig.endDate);
    
    if (end < start) {
      alert("End date cannot be before start date.");
      return;
    }

    const newRows = [];
    let current = new Date(start);
    
    while (current <= end) {
      const dateStr = current.toISOString().split('T')[0];
      newRows.push({
        id: Math.random().toString(36).substr(2, 9),
        date: dateStr,
        employeeId: bulkConfig.employeeId,
        inTime: '09:00',
        outTime: '18:00',
        otHours: '00:00',
        remarks: '',
        status: 'Present',
        isLocked: true
      });
      current.setDate(current.getDate() + 1);
    }
    
    setRows(newRows);
  };

  const removeRow = (id) => {
    if (rows.length === 1) {
      addEmptyRow();
      setRows(prev => prev.filter(r => r.id !== id));
    } else {
      setRows(prev => prev.filter(r => r.id !== id));
    }
    const newErrors = { ...errors };
    delete newErrors[id];
    setErrors(newErrors);
  };

  const updateRow = (id, field, value) => {
    setRows(prev => prev.map(r => {
      if (r.id !== id) return r;
      const updated = { ...r, [field]: value };

      if (['inTime', 'outTime', 'date', 'status'].includes(field)) {
        if (updated.status === 'Absent' || updated.status === 'Holiday') {
          updated.otHours = '00:00';
        } else {
          const emp = employees.find(e => e.id === updated.employeeId);
          updated.otHours = calcOT(updated.inTime, updated.outTime, updated.date, updated.date, emp?.minDailyHours || 8);
        }
      }
      return updated;
    }));
  };

  const validate = () => {
    const newErrors = {};
    const seen = new Set();

    rows.forEach((row) => {
      const result = attendanceRowSchema.safeParse(row);
      if (!result.success) {
        newErrors[row.id] = result.error.flatten().fieldErrors;
      }

      const key = `${row.employeeId}-${row.date}`;
      if (row.employeeId && row.date) {
        if (seen.has(key)) {
          newErrors[row.id] = { ...newErrors[row.id], employeeId: ['Duplicate entry'] };
        }
        seen.add(key);
      }
    });

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async (force = false) => {
    if (rows.length === 0) return;
    if (!validate()) return;

    setLoading(true);
    try {
      if (!force) {
        const uniqueDates = Array.from(new Set(rows.map(r => r.date)));
        let existingCount = 0;
        for (const d of uniqueDates) {
          const existing = await fetchByDate(d);
          const empIdsOnDate = rows.filter(r => r.date === d).map(r => r.employeeId);
          existingCount += existing.filter(ex => empIdsOnDate.includes(ex.employeeId)).length;
        }
        if (existingCount > 0) {
          setShowOverwriteWarning(true);
          setLoading(false);
          return;
        }
      }

      const attendanceData = rows.map(r => {
        const emp = employees.find(e => e.id === r.employeeId);
        return {
          employeeId: r.employeeId,
          name: emp?.name || '',
          date: r.date,
          inDate: r.date,
          outDate: r.date,
          inTime: (r.status === 'Absent' || r.status === 'Holiday') ? '' : r.inTime,
          outTime: (r.status === 'Absent' || r.status === 'Holiday') ? '' : r.outTime,
          otHours: r.otHours,
          remarks: r.remarks,
          status: r.status,
          isAbsent: r.status === 'Absent',
          sundayWorked: r.status === 'SunWorked',
          sundayHoliday: r.status === 'SunHoliday',
          holidayWorked: r.status === 'Worked',
          shiftType: 'Day',
        };
      });

      await upsertAttendance(attendanceData);
      onClose();
      setRows([]);
    } catch (err) {
      alert('Error: ' + err.message);
    } finally {
      setLoading(false);
      setShowOverwriteWarning(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Bulk Attendance Entry" maxWidth="max-w-7xl">
      <div className="flex flex-col h-[85vh] font-['Roboto',sans-serif]">
        <style>{`
          input[type="date"]::-webkit-inner-spin-button,
          input[type="date"]::-webkit-calendar-picker-indicator { display: none; -webkit-appearance: none; }
          .sheet-grid td, .sheet-grid th { border: 1px solid #e5e7eb; }
          .sheet-grid input:focus { background: #f0f9ff; outline: 1px solid #0ea5e9; outline-offset: -1px; }
        `}</style>

        {/* Setup Section */}
        <div className="px-6 py-3 border-b border-zinc-200 bg-white">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex bg-zinc-100 p-1 rounded-lg border border-zinc-200 w-fit">
              <button onClick={() => setMode('single')} className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-[10px] font-bold uppercase transition-all ${mode === 'single' ? 'bg-white text-indigo-600 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'}`}>
                <User size={12} /> Single Staff
              </button>
              <button onClick={() => { setMode('multiple'); setRows([]); }} className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-[10px] font-bold uppercase transition-all ${mode === 'multiple' ? 'bg-white text-indigo-600 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'}`}>
                <Users size={12} /> Multiple Staff
              </button>
            </div>

            {mode === 'single' && (
              <div className="flex items-end gap-2 animate-in slide-in-from-top-1 duration-200">
                <div className="w-[200px]">
                  <p className="text-[9px] font-black uppercase text-zinc-400 mb-0.5">Select Staff</p>
                  <EmployeeSearchableDropdown employees={employees.filter(e => !e.hideInAttendance)} selectedId={bulkConfig.employeeId} onSelect={id => setBulkConfig(c => ({...c, employeeId: id}))} placeholder="search staff..." />
                </div>
                <div>
                  <p className="text-[9px] font-black uppercase text-zinc-400 mb-0.5">Date Range</p>
                  <div className="flex items-center gap-2 h-8 border border-zinc-200 bg-white rounded-md px-2 shadow-sm">
                    <input type="date" value={bulkConfig.startDate} onChange={e => setBulkConfig(c => ({...c, startDate: e.target.value}))} onClick={e => e.currentTarget.showPicker()} className="text-[10px] font-bold outline-none bg-transparent cursor-pointer w-[80px]" />
                    <ArrowRight size={10} className="text-zinc-300" />
                    <input type="date" value={bulkConfig.endDate} onChange={e => setBulkConfig(c => ({...c, endDate: e.target.value}))} onClick={e => e.currentTarget.showPicker()} className="text-[10px] font-bold outline-none bg-transparent cursor-pointer w-[80px]" />
                  </div>
                </div>
                <button onClick={generateBulkRows} className="h-8 px-4 bg-emerald-600 text-white rounded-md text-[10px] font-bold uppercase tracking-widest hover:bg-emerald-700 shadow-sm">Generate</button>
              </div>
            )}

            {mode === 'multiple' && (
              <button onClick={addEmptyRow} className="h-8 px-3 bg-zinc-800 text-white rounded-md text-[10px] font-bold uppercase hover:bg-black transition-all flex items-center gap-1.5 shadow-sm self-end">
                <Plus size={12} strokeWidth={3} /> Add Staff Row
              </button>
            )}
          </div>
        </div>

        {/* Sheet Grid */}
        <div className="flex-1 overflow-auto bg-white custom-scrollbar">
          <table className="w-full border-collapse sheet-grid">
            <thead className="sticky top-0 z-20 bg-zinc-50 shadow-sm">
              <tr>
                <th className="px-2 py-2 text-left text-[10px] font-black uppercase text-emerald-600 tracking-widest w-[100px] font-['Raleway'] bg-zinc-50">Date</th>
                <th className="px-2 py-2 text-left text-[10px] font-black uppercase text-emerald-600 tracking-widest w-[300px] font-['Raleway'] bg-zinc-50">Staff Name</th>
                <th className="px-2 py-2 text-center text-[10px] font-black uppercase text-emerald-600 tracking-widest w-[160px] font-['Raleway'] bg-zinc-50">In Time</th>
                <th className="px-2 py-2 text-center text-[10px] font-black uppercase text-emerald-600 tracking-widest w-[160px] font-['Raleway'] bg-zinc-50">Out Time</th>
                <th className="px-2 py-2 text-center text-[10px] font-black uppercase text-emerald-600 tracking-widest w-[60px] font-['Raleway'] bg-zinc-50">OT</th>
                <th className="px-2 py-2 text-left text-[10px] font-black uppercase text-emerald-600 tracking-widest font-['Raleway'] bg-zinc-50">Remarks</th>
                <th className="px-2 py-2 text-center text-[10px] font-black uppercase text-emerald-600 tracking-widest w-[200px] font-['Raleway'] bg-zinc-50">Action</th>
                <th className="px-2 py-2 text-center text-[10px] font-black uppercase text-emerald-600 tracking-widest w-[30px] font-['Raleway'] bg-zinc-50"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200">
              {rows.length === 0 ? (
                <tr><td colSpan={8} className="py-20 text-center"><p className="text-[10px] font-bold text-zinc-300 uppercase tracking-widest italic">Grid Empty</p></td></tr>
              ) : rows.map((row) => (
                <tr key={row.id} className="hover:bg-sky-50/30 transition-colors">
                  <td className="p-0 h-[32px]">
                    <input 
                      type="date" 
                      value={row.date}
                      onChange={e => updateRow(row.id, 'date', e.target.value)}
                      onClick={(e) => e.currentTarget.showPicker()}
                      className={`w-full h-full px-2 bg-transparent border-none outline-none text-[11px] font-bold text-zinc-600 cursor-pointer ${errors[row.id]?.date ? 'text-red-600' : ''}`}
                    />
                  </td>
                  <td className="p-0 h-[32px]">
                    <EmployeeSearchableDropdown 
                      employees={employees.filter(e => !e.hideInAttendance)} 
                      selectedId={row.employeeId}
                      onSelect={val => updateRow(row.id, 'employeeId', val)}
                      disabled={row.isLocked}
                    />
                  </td>
                  <td className="p-0 h-[32px] text-center">
                    <div className="relative w-full h-full">
                      <button 
                        onClick={(e) => setShowInTimePicker({ id: row.id, anchor: e.currentTarget })}
                        disabled={row.status === 'Absent' || row.status === 'Holiday'}
                        className={`w-full h-full px-4 text-[11px] font-black flex items-center justify-between transition-all ${
                          row.status === 'Absent' || row.status === 'Holiday' ? 'bg-zinc-50 text-zinc-300' : 'bg-white text-emerald-600 hover:bg-emerald-50/50'
                        }`}
                      >
                        <span>{formatTimeTo12Hour(row.inTime)}</span>
                        <Clock size={10} className="opacity-30" />
                      </button>
                      {showInTimePicker?.id === row.id && (
                        <TimePicker 
                          value={row.inTime} 
                          onChange={val => updateRow(row.id, 'inTime', val)} 
                          onClose={() => setShowInTimePicker(null)} 
                          anchorEl={showInTimePicker.anchor}
                        />
                      )}
                    </div>
                  </td>
                  <td className="p-0 h-[32px] text-center">
                    <div className="relative w-full h-full">
                      <button 
                        onClick={(e) => setShowOutTimePicker({ id: row.id, anchor: e.currentTarget })}
                        disabled={row.status === 'Absent' || row.status === 'Holiday'}
                        className={`w-full h-full px-4 text-[11px] font-black flex items-center justify-between transition-all ${
                          row.status === 'Absent' || row.status === 'Holiday' ? 'bg-zinc-50 text-zinc-300' : 'bg-white text-red-600 hover:bg-red-50/50'
                        }`}
                      >
                        <span>{formatTimeTo12Hour(row.outTime)}</span>
                        <Clock size={10} className="opacity-30" />
                      </button>
                      {showOutTimePicker?.id === row.id && (
                        <TimePicker 
                          value={row.outTime} 
                          onChange={val => updateRow(row.id, 'outTime', val)} 
                          onClose={() => setShowOutTimePicker(null)} 
                          anchorEl={showOutTimePicker.anchor}
                        />
                      )}
                    </div>
                  </td>
                  <td className="p-0 h-[32px] text-center bg-zinc-50/30">
                    <span className="text-[11px] font-black text-indigo-600">{row.otHours === '00:00' ? '-' : row.otHours}</span>
                  </td>
                  <td className="p-0 h-[32px]">
                    <input 
                      type="text" 
                      value={row.remarks}
                      onChange={e => updateRow(row.id, 'remarks', e.target.value)}
                      placeholder="..."
                      className="w-full h-full px-2 bg-transparent border-none outline-none text-[11px] font-medium text-zinc-500"
                    />
                  </td>
                  <td className="p-[2px] h-[32px]">
                    <div className="flex h-full bg-zinc-100 rounded border border-zinc-200 p-[1px]">
                      {[
                        { id: 'Present', label: 'PR', color: 'text-green-600' },
                        { id: 'Absent', label: 'AB', color: 'text-red-600' },
                        { id: 'Worked', label: 'W(2x)', color: 'text-amber-600' },
                        { id: 'Holiday', label: 'HO', color: 'text-indigo-600' }
                      ].map(st => (
                        <button key={st.id} onClick={() => updateRow(row.id, 'status', st.id)} className={`flex-1 h-full text-[9px] font-black uppercase rounded transition-all ${row.status === st.id ? 'bg-white shadow-sm ' + st.color : 'text-zinc-400 hover:text-zinc-600'}`}>{st.label}</button>
                      ))}
                    </div>
                  </td>
                  <td className="p-0 h-[32px] text-center">
                    <button onClick={() => removeRow(row.id)} className="w-full h-full flex items-center justify-center text-zinc-300 hover:text-red-500 transition-all"><Trash2 size={12} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-zinc-200 flex justify-between items-center bg-zinc-50">
          <div className="flex gap-4">
            <span className="text-[9px] font-black text-zinc-400 uppercase tracking-widest">Grid Rows: {rows.length}</span>
            {Object.keys(errors).length > 0 && <span className="text-[9px] font-black text-red-500 uppercase tracking-widest animate-pulse">Errors: {Object.keys(errors).length}</span>}
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="h-8 px-5 border border-zinc-300 text-zinc-600 rounded text-[10px] font-black uppercase tracking-widest hover:bg-white transition-all font-['Raleway']">Cancel</button>
            <button onClick={() => handleSave()} disabled={loading || rows.length === 0} className="h-8 px-6 bg-[#3e2723] text-white rounded text-[10px] font-black uppercase tracking-widest hover:bg-black shadow-md transition-all flex items-center gap-2 disabled:opacity-50 font-['Raleway']">
              {loading ? <Spinner size="w-3 h-3" color="text-white" /> : <Save size={14} />} {loading ? 'Saving...' : 'Save Bulk Grid'}
            </button>
          </div>
        </div>

        {showOverwriteWarning && (
          <div className="absolute inset-0 z-[120] bg-zinc-900/60 backdrop-blur-sm flex items-center justify-center p-6"><div className="bg-white rounded-xl shadow-2xl p-8 max-w-sm text-center"><div className="w-12 h-12 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mx-auto mb-4"><AlertTriangle size={24} /></div><h3 className="text-sm font-black text-zinc-900 mb-2 uppercase font-['Raleway']">Overwrite?</h3><p className="text-[11px] text-zinc-500 mb-6 font-bold uppercase tracking-tight">Records already exist for these staff. Replace them?</p><div className="flex gap-2"><button onClick={() => setShowOverwriteWarning(false)} className="flex-1 h-9 border border-zinc-200 text-zinc-600 rounded text-[10px] font-black uppercase font-['Raleway']">No, Stop</button><button onClick={() => handleSave(true)} className="flex-1 h-9 bg-amber-500 text-white rounded text-[10px] font-black uppercase shadow-md font-['Raleway']">Yes, Replace</button></div></div></div>
        )}
      </div>
    </Modal>
  );
};

export default BulkAttendanceModal;