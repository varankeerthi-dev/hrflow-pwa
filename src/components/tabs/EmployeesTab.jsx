import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useEmployees } from '../../hooks/useEmployees';
import { useLeaves } from '../../hooks/useLeaves';
import { useAttendance } from '../../hooks/useAttendance';
import { useLogs } from '../../hooks/useActivityLog';
import { db } from '../../lib/firebase';
import { collection, query, where, orderBy, getDocs } from 'firebase/firestore';
import { useQuery } from '@tanstack/react-query';
import { Search, ChevronDown, Calendar, Clock, FileText, Wallet, Gavel, Gift, User, Briefcase, Mail, Phone, MapPin, BadgeCheck, Circle, Activity, Users, List, UserCheck, Cake, ChevronRight, ClipboardCheck } from 'lucide-react';
import EmployeeDirectoryTab from './EmployeeDirectoryTab';
import EmployeeProfileUpdatesTab from './EmployeeProfileUpdatesTab';
import { FleetSecondaryTabs } from '../ui/FleetSecondaryTabs';
const formatDate = d => d ? new Date(d).toLocaleDateString('en-IN', {
  day: '2-digit',
  month: 'short',
  year: 'numeric'
}) : '—';
const formatMonth = ym => {
  if (!ym) return '';
  const [y, m] = ym.split('-');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[parseInt(m) - 1]} ${y}`;
};
function useEmployeeFines(orgId, employeeId) {
  return useQuery({
    queryKey: ['employeeFines', orgId, employeeId],
    queryFn: async () => {
      if (!orgId || !employeeId) return [];
      const q = query(collection(db, 'organisations', orgId, 'fines'), where('employeeId', '==', employeeId), orderBy('date', 'desc'));
      const snap = await getDocs(q);
      return snap.docs.map(d => ({
        id: d.id,
        ...d.data()
      }));
    },
    enabled: !!orgId && !!employeeId
  });
}
function useEmployeeAdvances(orgId, employeeId) {
  return useQuery({
    queryKey: ['employeeAdvances', orgId, employeeId],
    queryFn: async () => {
      if (!orgId || !employeeId) return [];
      const q = query(collection(db, 'organisations', orgId, 'advances_expenses'), where('employeeId', '==', employeeId), orderBy('date', 'desc'));
      const snap = await getDocs(q);
      return snap.docs.map(d => ({
        id: d.id,
        ...d.data()
      }));
    },
    enabled: !!orgId && !!employeeId
  });
}
function useEmployeeBonus(orgId, employeeId) {
  return useQuery({
    queryKey: ['employeeBonus', orgId, employeeId],
    queryFn: async () => {
      if (!orgId || !employeeId) return [];
      const q = query(collection(db, 'organisations', orgId, 'variablePayLogs'), where('employeeId', '==', employeeId), orderBy('month', 'desc'));
      const snap = await getDocs(q);
      return snap.docs.map(d => ({
        id: d.id,
        ...d.data()
      }));
    },
    enabled: !!orgId && !!employeeId
  });
}
function useEmployeeAttendanceSummary(orgId, employeeId, month) {
  return useQuery({
    queryKey: ['employeeAttendanceSummary', orgId, employeeId, month],
    queryFn: async () => {
      if (!orgId || !employeeId || !month) return null;
      const [y, m] = month.split('-').map(Number);
      const lastDay = new Date(y, m, 0).getDate();
      const start = `${month}-01`;
      const end = `${month}-${String(lastDay).padStart(2, '0')}`;
      const q = query(collection(db, 'organisations', orgId, 'attendance'), where('employeeId', '==', employeeId), where('date', '>=', start), where('date', '<=', end));
      const snap = await getDocs(q);
      const records = snap.docs.map(d => d.data());
      const summary = {
        present: 0,
        absent: 0,
        late: 0,
        halfDay: 0,
        holiday: 0,
        sunday: 0,
        totalOt: 0
      };
      records.forEach(r => {
        const s = (r.status || '').toLowerCase();
        if (s === 'present' || s === 'worked') summary.present++;else if (s === 'absent') summary.absent++;else if (s === 'half-day' || r.isHalfDay) summary.halfDay++;
        if (r.otHours) {
          const [h, min] = (r.otHours || '0:00').split(':').map(Number);
          summary.totalOt += h + (min || 0) / 60;
        }
        if (r.status === 'SunWorked') summary.sunday++;
      });
      return summary;
    },
    enabled: !!orgId && !!employeeId && !!month
  });
}
function useEmployeeLeaves(orgId, employeeId, from, to) {
  return useQuery({
    queryKey: ['employeeLeaves', orgId, employeeId, from, to],
    queryFn: async () => {
      if (!orgId || !employeeId) return [];
      const constraints = [where('employeeId', '==', employeeId), where('type', '==', 'Leave'), orderBy('fromDate', 'desc')];
      const q = query(collection(db, 'organisations', orgId, 'requests'), ...constraints);
      const snap = await getDocs(q);
      let leaves = snap.docs.map(d => ({
        id: d.id,
        ...d.data()
      }));
      if (from) leaves = leaves.filter(l => l.fromDate >= from);
      if (to) leaves = leaves.filter(l => l.fromDate <= to);
      return leaves;
    },
    enabled: !!orgId && !!employeeId
  });
}
const statusColor = s => {
  const map = {
    Active: '#09CE99',
    Inactive: '#EF4444',
    Rejoined: '#F59E0B'
  };
  return map[s] || '#9CA3AF';
};
function CollapsibleSection({
  title,
  icon,
  defaultOpen,
  children,
  count
}) {
  const [open, setOpen] = useState(defaultOpen);
  return <div className="rounded-xl border border-[#E9ECF0] bg-white overflow-hidden">      <button onClick={() => setOpen(!open)} className="flex items-center gap-3 w-full px-5 py-3.5 bg-white hover:bg-[#F7F8FA] transition-colors text-left">        <span className="text-[#6B7280] shrink-0">{icon}</span>        <span className="text-[13px] font-semibold text-[#1A1D26] flex-1">{title}</span>        {count !== undefined && <span className="text-[11px] font-medium text-[#6B7280] bg-[#F3F4F6] px-2.5 py-0.5 rounded-full">{count}</span>}        <ChevronDown size={15} className={`text-[#9CA3AF] transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />      </button>      <div className={`transition duration-200 overflow-hidden ${open ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0'}`}>        <div className="px-5 pb-4 pt-1 border-t border-[#E9ECF0]">          {children}        </div>      </div>    </div>;
}
function LeaveSection({
  orgId,
  employeeId
}) {
  const today = new Date();
  const defaultFrom = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState('');
  const {
    data: leaves,
    isLoading,
    isError,
    error
  } = useEmployeeLeaves(orgId, employeeId, from, to);
  const summary = useMemo(() => {
    if (!leaves) return {
      approved: 0,
      pending: 0,
      rejected: 0,
      lop: 0,
      total: 0
    };
    return leaves.reduce((acc, l) => {
      acc.total += l.duration || 1;
      if (l.hrApproval === 'Approved' || l.status === 'Approved') acc.approved += l.duration || 1;else if (l.hrApproval === 'Pending' || l.status === 'Pending') acc.pending += l.duration || 1;else if (l.hrApproval === 'Rejected' || l.status === 'Rejected') acc.rejected += l.duration || 1;
      if (l.leaveType === 'LOP') acc.lop += l.duration || 1;
      return acc;
    }, {
      approved: 0,
      pending: 0,
      rejected: 0,
      lop: 0,
      total: 0
    });
  }, [leaves]);
  return <div className="space-y-4">      <div className="flex items-center gap-3">        <div className="flex items-center gap-2">          <label className="text-[11px] font-medium text-[#6B7280]">From</label>          <input type="month" value={from} onChange={e => setFrom(e.target.value)} className="h-8 px-2.5 text-[12px] border border-[#E9ECF0] rounded-lg bg-white text-[#1A1D26] outline-none focus:border-[#09CE99]" />        </div>        <div className="flex items-center gap-2">          <label className="text-[11px] font-medium text-[#6B7280]">To</label>          <input type="month" value={to} onChange={e => setTo(e.target.value)} className="h-8 px-2.5 text-[12px] border border-[#E9ECF0] rounded-lg bg-white text-[#1A1D26] outline-none focus:border-[#09CE99]" />        </div>        {to && <button onClick={() => {
        setFrom(defaultFrom);
        setTo('');
      }} className="text-[11px] text-[#09CE99] hover:text-[#07B888] font-medium">Clear</button>}      </div>      {isLoading ? <div className="flex items-center gap-2 py-3 text-[#9CA3AF] text-[12px]">          <div className="w-3.5 h-3.5 border-2 border-[#E9ECF0] border-t-[#09CE99] rounded-full animate-spin" />          Loading...        </div> : isError ? <div className="flex flex-col items-center gap-2 py-4 text-center">          <p className="text-[12px] text-[#EF4444]">Failed to load leave data</p>          <button onClick={() => window.location.reload()} className="text-[11px] text-[#09CE99] font-medium hover:text-[#07B888]">Retry</button>        </div> : <>          <div className="grid grid-cols-5 gap-3">            {[{
          label: 'Approved',
          value: summary.approved,
          color: '#09CE99'
        }, {
          label: 'Pending',
          value: summary.pending,
          color: '#F59E0B'
        }, {
          label: 'Rejected',
          value: summary.rejected,
          color: '#EF4444'
        }, {
          label: 'LOP',
          value: summary.lop,
          color: '#8B5CF6'
        }, {
          label: 'Total',
          value: summary.total,
          color: '#1A1D26'
        }].map(stat => <div key={stat.label} className="text-center py-2.5 px-2 rounded-lg bg-[#F7F8FA]">                <div className="text-[18px] font-bold" style={{
            color: stat.color
          }}>{stat.value}</div>                <div className="text-[9px] font-medium text-[#6B7280] uppercase tracking-wider mt-0.5">{stat.label}</div>              </div>)}          </div>          {leaves?.length > 0 ? <div className="space-y-1.5 max-h-48 overflow-y-auto">              {leaves.slice(0, 10).map(l => <div key={l.id} className="flex items-center justify-between py-1.5 px-3 rounded-lg hover:bg-[#F7F8FA] text-[12px] transition-colors">                  <div className="flex items-center gap-2.5">                    <span className={`w-1.5 h-1.5 rounded-full ${l.hrApproval === 'Approved' ? 'bg-[#09CE99]' : l.hrApproval === 'Rejected' ? 'bg-[#EF4444]' : 'bg-[#F59E0B]'}`} />                    <span className="text-[#1A1D26] font-medium">{formatDate(l.fromDate)}</span>                    <span className="text-[#9CA3AF]">—</span>                    <span className="text-[#1A1D26]">{formatDate(l.toDate)}</span>                  </div>                  <div className="flex items-center gap-3">                    <span className="text-[#6B7280]">{l.duration || 1}d</span>                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${l.hrApproval === 'Approved' ? 'bg-[#09CE99]/10 text-[#09CE99]' : l.hrApproval === 'Rejected' ? 'bg-[#EF4444]/10 text-[#EF4444]' : 'bg-[#F59E0B]/10 text-[#F59E0B]'}`}>{l.hrApproval}</span>                  </div>                </div>)}            </div> : <p className="text-[12px] text-[#9CA3AF] py-2 text-center">No leave records 

for this period</p>}        </>}    </div>;
}
function AttendanceSection({
  orgId,
  employeeId
}) {
  const today = new Date();
  const defaultMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  const [month, setMonth] = useState(defaultMonth);
  const {
    data: summary,
    isLoading,
    isError
  } = useEmployeeAttendanceSummary(orgId, employeeId, month);
  const stats = summary || {
    present: 0,
    absent: 0,
    late: 0,
    halfDay: 0,
    sunday: 0,
    totalOt: 0
  };
  return <div className="space-y-4">      <div className="flex items-center gap-3">        <input type="month" value={month} onChange={e => setMonth(e.target.value)} className="h-8 px-2.5 text-[12px] border border-[#E9ECF0] rounded-lg bg-white text-[#1A1D26] outline-none focus:border-[#09CE99]" />      </div>      {isLoading ? <div className="flex items-center gap-2 py-3 text-[#9CA3AF] text-[12px]">          <div className="w-3.5 h-3.5 border-2 border-[#E9ECF0] border-t-[#09CE99] rounded-full animate-spin" />          Loading...        </div> : isError ? <div className="flex flex-col items-center gap-2 py-4 text-center">          <p className="text-[12px] text-[#EF4444]">Failed to load attendance</p>          <button onClick={() => window.location.reload()} className="text-[11px] text-[#09CE99] font-medium hover:text-[#07B888]">Retry</button>        </div> : <div className="grid grid-cols-3 gap-3">          {[{
        label: 'Present',
        value: stats.present,
        color: '#09CE99'
      }, {
        label: 'Absent',
        value: stats.absent,
        color: '#EF4444'
      }, {
        label: 'Half-Day',
        value: stats.halfDay,
        color: '#F59E0B'
      }, {
        label: 'Late',
        value: stats.late,
        color: '#8B5CF6'
      }, {
        label: 'Sunday',
        value: stats.sunday,
        color: '#3B82F6'
      }, {
        label: 'OT (hrs)',
        value: stats.totalOt?.toFixed(1),
        color: '#1A1D26'
      }].map(stat => <div key={stat.label} className="text-center py-2.5 px-2 rounded-lg bg-[#F7F8FA]">              <div className="text-[18px] font-bold" style={{
          color: stat.color
        }}>{stat.value}</div>              <div className="text-[9px] font-medium text-[#6B7280] uppercase tracking-wider mt-0.5">{stat.label}</div>            </div>)}        </div>}    </div>;
}
function FinesSection({
  orgId,
  employeeId
}) {
  const {
    data: fines,
    isLoading,
    isError
  } = useEmployeeFines(orgId, employeeId);
  const totalAmount = useMemo(() => fines?.reduce((s, f) => s + (f.amount || 0), 0) || 0, [fines]);
  return <div className="space-y-3">      {isLoading ? <div className="flex items-center gap-2 py-3 text-[#9CA3AF] text-[12px]">          <div className="w-3.5 h-3.5 border-2 border-[#E9ECF0] border-t-[#09CE99] rounded-full animate-spin" />          Loading...        </div> : isError ? <div className="flex flex-col items-center gap-2 py-4 text-center">          <p className="text-[12px] text-[#EF4444]">Failed to load fines</p>          <button onClick={() => window.location.reload()} className="text-[11px] text-[#09CE99] font-medium hover:text-[#07B888]">Retry</button>        </div> : fines?.length > 0 ? <>          <div className="text-center py-2.5 px-2 rounded-lg bg-[#F7F8FA]">            <div className="text-[18px] font-bold text-[#EF4444]">₹{totalAmount.toLocaleString()}</div>            <div className="text-[9px] font-medium text-[#6B7280] uppercase tracking-wider mt-0.5">Total Fines</div>          </div>          <div className="space-y-1.5 max-h-48 overflow-y-auto">            {fines.slice(0, 10).map(f => <div key={f.id} className="flex items-center justify-between py-1.5 px-3 rounded-lg hover:bg-[#F7F8FA] text-[12px] transition-colors">                <div className="flex items-center gap-2.5">                  <span className="w-1.5 h-1.5 rounded-full bg-[#EF4444]" />                  <span className="text-[#1A1D26] font-medium">{formatDate(f.date)}</span>                  <span className="text-[#6B7280] truncate max-w-[160px]">{f.reason}</span>                </div>                <span className="font-semibold text-[#EF4444]">₹{f.amount}</span>              </div>)}          </div>        </> : <p className="text-[12px] text-[#9CA3AF] py-2 text-center">No fines recorded</p>}    </div>;
}
function AdvancesSection({
  orgId,
  employeeId
}) {
  const {
    data: advances,
    isLoading,
    isError
  } = useEmployeeAdvances(orgId, employeeId);
  const totalAmount = useMemo(() => advances?.reduce((s, a) => s + (a.amount || 0), 0) || 0, [advances]);
  return <div className="space-y-3">      {isLoading ? <div className="flex items-center gap-2 py-3 text-[#9CA3AF] text-[12px]">          <div className="w-3.5 h-3.5 border-2 border-[#E9ECF0] border-t-[#09CE99] rounded-full animate-spin" />          Loading...        </div> : isError ? <div className="flex flex-col items-center gap-2 py-4 text-center">          <p className="text-[12px] text-[#EF4444]">Failed to load advances</p>          <button onClick={() => window.location.reload()} className="text-[11px] text-[#09CE99] font-medium hover:text-[#07B888]">Retry</button>        </div> : advances?.length > 0 ? <>          <div className="grid grid-cols-2 gap-3">            <div className="text-center py-2.5 px-2 rounded-lg bg-[#F7F8FA]">              <div className="text-[18px] font-bold text-[#F59E0B]">₹{totalAmount.toLocaleString()}</div>              <div className="text-[9px] font-medium text-[#6B7280] uppercase tracking-wider mt-0.5">Total Amount</div>            </div>            <div className="text-center py-2.5 px-2 rounded-lg bg-[#F7F8FA]">              <div className="text-[18px] font-bold text-[#1A1D26]">{advances.length}</div>              <div className="text-[9px] font-medium text-[#6B7280] uppercase tracking-wider mt-0.5">Entries</div>            </div>          </div>          <div className="space-y-1.5 max-h-48 overflow-y-auto">            {advances.slice(0, 10).map(a => <div key={a.id} className="flex items-center justify-between py-1.5 px-3 rounded-lg hover:bg-[#F7F8FA] text-[12px] transition-colors">                <div className="flex items-center gap-2.5">                  <span className={`w-1.5 h-1.5 rounded-full ${a.type === 'Advance' ? 'bg-[#F59E0B]' : 'bg-[#3B82F6]'}`} />                  <span className="text-[#1A1D26] font-medium">{formatDate(a.date)}</span>                  <span className="text-[#6B7280] truncate max-w-[120px]">{a.category || a.type}</span>                </div>                <div className="flex items-center gap-3">                  <span className="font-semibold text-[#1A1D26]">₹{a.amount}</span>                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${a.status === 'Approved' ? 'bg-[#09CE99]/10 text-[#09CE99]' : a.status === 'Rejected' ? 'bg-[#EF4444]/10 text-[#EF4444]' : 'bg-[#F59E0B]/10 text-[#F59E0B]'}`}>{a.status}</span>                </div>              </div>)}          </div>        </> : <p className="text-[12px] text-[#9CA3AF] py-2 text-center">No advances or expenses</p>}    </div>;
}
function BonusSection({
  orgId,
  employeeId
}) {
  const {
    data: bonuses,
    isLoading,
    isError
  } = useEmployeeBonus(orgId, employeeId);
  const totalBonus = useMemo(() => bonuses?.reduce((s, b) => s + (b.bonus || 0), 0) || 0, [bonuses]);
  const totalFood = useMemo(() => bonuses?.reduce((s, b) => s + (b.food || 0), 0) || 0, [bonuses]);
  const totalConv = useMemo(() => bonuses?.reduce((s, b) => s + (b.convenience || 0), 0) || 0, [bonuses]);
  return <div className="space-y-3">      {isLoading ? <div className="flex items-center gap-2 py-3 text-[#9CA3AF] text-[12px]">          <div className="w-3.5 h-3.5 border-2 border-[#E9ECF0] border-t-[#09CE99] rounded-full animate-spin" />          Loading...        </div> : isError ? <div className="flex flex-col items-center gap-2 py-4 text-center">          <p className="text-[12px] text-[#EF4444]">Failed to load variable pay</p>          <button onClick={() => window.location.reload()} className="text-[11px] text-[#09CE99] font-medium hover:text-[#07B888]">Retry</button>        </div> : bonuses?.length > 0 ? <>          <div className="grid grid-cols-3 gap-3">            {[{
          label: 'Bonus',
          value: totalBonus,
          color: '#8B5CF6'
        }, {
          label: 'Food',
          value: totalFood,
          color: '#09CE99'
        }, {
          label: 'Convenience',
          value: totalConv,
          color: '#F59E0B'
        }].map(stat => <div key={stat.label} className="text-center py-2.5 px-2 rounded-lg bg-[#F7F8FA]">                <div className="text-[18px] font-bold" style={{
            color: stat.color
          }}>₹{stat.value.toLocaleString()}</div>                <div className="text-[9px] font-medium text-[#6B7280] uppercase tracking-wider mt-0.5">{stat.label}</div>              </div>)}          </div>          <div className="space-y-1.5 max-h-48 overflow-y-auto">            {bonuses.slice(0, 10).map(b => <div key={b.id} className="flex items-center justify-between py-1.5 px-3 rounded-lg hover:bg-[#F7F8FA] text-[12px] transition-colors">                <span className="text-[#1A1D26] font-medium">{formatMonth(b.month)}</span>                <div className="flex items-center gap-4">                  {b.bonus > 0 && <span className="text-[#8B5CF6]">B: ₹{b.bonus}</span>}                  {b.food > 0 && <span className="text-[#09CE99]">F: ₹{b.food}</span>}                  {b.convenience > 0 && <span className="text-[#F59E0B]">C: ₹{b.convenience}</span>}                </div>              </div>)}          </div>        </> : <p className="text-[12px] text-[#9CA3AF] py-2 text-center">No variable pay records</p>}    </div>;
}
function EmployeeListPanel({
  employees,
  selectedId,
  onSelect,
  search,
  onSearchChange,
  statusFilter,
  onStatusFilterChange
}) {
  const filtered = useMemo(() => {
    return employees.filter(e => {
      const matchSearch = !search || e.name?.toLowerCase().includes(search.toLowerCase()) || e.empCode?.toLowerCase().includes(search.toLowerCase());
      const matchStatus = statusFilter === 'All' || e.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [employees, search, statusFilter]);
  const counts = useMemo(() => ({
    All: employees.length,
    Active: employees.filter(e => e.status === 'Active').length,
    Inactive: employees.filter(e => e.status === 'Inactive' || e.status === 'Rejoined').length
  }), [employees]);
  return <div className="h-full flex flex-col bg-white rounded-2xl border border-[#E9ECF0] overflow-hidden">      <div className="p-4 pb-3 border-b border-[#E9ECF0]">        <div className="relative">          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9CA3AF]" />          <input type="text" placeholder="Search employees..." value={search} onChange={e => onSearchChange(e.target.value)} className="w-full h-9 pl-9 pr-3 text-[13px] bg-[#F7F8FA] border border-[#E9ECF0] rounded-xl text-[#1A1D26] outline-none placeholder:text-[#9CA3AF] focus:border-[#09CE99] focus:bg-white transition-colors" />        </div>      </div>      <div className="flex gap-1.5 px-4 py-2.5 border-b border-[#E9ECF0] bg-[#FAFBFC]">        {['All', 'Active', 'Inactive'].map(f => <button key={f} onClick={() => onStatusFilterChange(f)} className={`text-[11px] font-medium px-3 py-1.5 rounded-lg transition-colors ${statusFilter === f ? 'bg-[#09CE99] text-white' : 'text-[#6B7280] hover:bg-[#E9ECF0]'}`}>            {f} <span className={statusFilter === f ? 'text-white/70' : 'text-[#9CA3AF]'}>({counts[f]})</span>          </button>)}      </div>      <div className="flex-1 overflow-y-auto">        {filtered.length === 0 ? <div className="flex flex-col items-center justify-center py-12 px-4 text-center">            <Search size={24} className="text-[#D1D5DB] mb-2" />            <p className="text-[13px] text-[#9CA3AF]">No employees found</p>          </div> : filtered.map(e => <button key={e.id} onClick={() => onSelect(e.id)} className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[#F7F8FA] border-b border-[#E9ECF0]/60 last:border-0 ${selectedId === e.id ? 'bg-[#09CE99]/5 border-l-2 border-l-[#09CE99]' : ''}`}>            <div className="w-9 h-9 rounded-full flex items-center justify-center text-[12px] font-bold text-white shrink-0" style={{
          backgroundColor: statusColor(e.status)
        }}>              {(e.name || '?').charAt(0).toUpperCase()}            </div>            <div className="flex-1 min-w-0">              <div className="text-[13px] font-semibold text-[#1A1D26] truncate">{e.name}</div>              <div className="text-[11px] text-[#6B7280] truncate">{e.designation || e.department || '—'}</div>            </div>            <div className={`w-2 h-2 rounded-full shrink-0 ${e.status === 'Active' ? 'bg-[#09CE99]' : e.status === 'Inactive' ? 'bg-[#EF4444]' : 'bg-[#F59E0B]'}`} />          </button>)}      </div>      <div className="px-4 py-2.5 border-t border-[#E9ECF0] text-[11px] text-[#9CA3AF] text-center">        {filtered.length} of {employees.length} employees      </div>    </div>;
}
function EmployeeDetailsPanel({
  employee,
  onBack,
  onShowActivity
}) {
  const {
    user
  } = useAuth();
  const orgId = user?.orgId;
  if (!employee) {
    return <div className="h-full flex flex-col items-center justify-center bg-white rounded-2xl border border-[#E9ECF0]">        <User size={40} className="text-[#D1D5DB] mb-3" />        <p className="text-[14px] font-medium text-[#9CA3AF]">Select an employee</p>        <p className="text-[12px] text-[#D1D5DB] mt-1">Choose from the list to view details</p>      </div>;
  }
  const fields = [{
    label: 'Employee ID',
    value: employee.empCode,
    icon: <Briefcase size={14} />
  }, {
    label: 'Department',
    value: employee.department,
    icon: <Briefcase size={14} />
  }, {
    label: 'Designation',
    value: employee.designation,
    icon: <Briefcase size={14} />
  }, {
    label: 'Email',
    value: employee.email,
    icon: <Mail size={14} />
  }, {
    label: 'Phone',
    value: employee.mobileNo || employee.contactNo || employee.phone,
    icon: <Phone size={14} />
  }, {
    label: 'Address',
    value: employee.address,
    icon: <MapPin size={14} />
  }, {
    label: 'Date of Joining',
    value: formatDate(employee.joinedDate || employee.doj),
    icon: <Calendar size={14} />
  }, {
    label: 'Date of Birth',
    value: formatDate(employee.dob),
    icon: <Calendar size={14} />
  }, {
    label: 'Blood Group',
    value: employee.bloodGroup,
    icon: <Activity size={14} />
  }, {
    label: 'Aadhar',
    value: employee.aadharNo,
    icon: <BadgeCheck size={14} />
  }, {
    label: 'PAN',
    value: employee.panNo,
    icon: <BadgeCheck size={14} />
  }, {
    label: 'PF No',
    value: employee.pfNo,
    icon: <FileText size={14} />
  }, {
    label: 'ESI No',
    value: employee.esiNo,
    icon: <FileText size={14} />
  }].filter(f => f.value);
  return <div className="h-full flex flex-col bg-white rounded-2xl border border-[#E9ECF0] overflow-hidden">      <div className="p-5 pb-4 border-b border-[#E9ECF0] space-y-3">        <div className="flex items-center justify-between lg:hidden">          <button onClick={onBack} className="flex items-center gap-1.5 text-[12px] font-medium text-[#6B7280] hover:text-[#1A1D26] transition-colors">            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5" /><polyline points="12 19 5 12 12 5" /></svg>            Back          </button>          <button onClick={onShowActivity} className="flex items-center gap-1.5 text-[12px] font-medium text-[#6B7280] hover:text-[#09CE99] transition-colors">            <Activity size={14} />            Activity          </button>        </div>        <div className="flex items-center gap-4">          <div className="w-12 h-12 rounded-full flex items-center justify-center text-[18px] font-bold text-white shrink-0" style={{
          backgroundColor: statusColor(employee.status)
        }}>            {(employee.name || '?').charAt(0).toUpperCase()}          </div>          <div className="flex-1 min-w-0">            <div className="flex items-center gap-2.5">              <h2 className="text-[18px] font-bold text-[#1A1D26] truncate">{employee.name}</h2>              <span className={`text-[10px] font-semibold px-2.5 py-0.5 rounded-full ${employee.status === 'Active' ? 'bg-[#09CE99]/10 text-[#09CE99]' : employee.status === 'Inactive' ? 'bg-[#EF4444]/10 text-[#EF4444]' : 'bg-[#F59E0B]/10 text-[#F59E0B]'}`}>{employee.status}</span>            </div>            <p className="text-[12px] text-[#6B7280] mt-0.5">{employee.designation || employee.department || ''}</p>          </div>        </div>      </div>      <div className="flex-1 overflow-y-auto p-5 pt-4 space-y-5">        <div className="grid grid-cols-2 gap-x-6 gap-y-3">          {fields.map(f => <div key={f.label} className="flex items-start gap-2.5">              <span className="text-[#9CA3AF] mt-0.5 shrink-0">{f.icon}</span>              <div className="min-w-0">                <div className="text-[10px] font-medium text-[#9CA3AF] uppercase tracking-wider">{f.label}</div>                <div className="text-[13px] font-medium text-[#1A1D26] truncate mt-0.5">{f.value}</div>              </div>            </div>)}        </div>        {employee.personalBank?.accountNo && <div className="bg-[#F7F8FA] rounded-xl p-4">            <div className="text-[10px] font-medium text-[#9CA3AF] uppercase tracking-wider mb-2">Bank Account</div>            <div className="grid grid-cols-2 gap-3 text-[12px]">              <div><span className="text-[#6B7280]">Bank:</span> <span className="text-[#1A1D26] font-medium">{employee.personalBank.bankName}</span></div>              <div><span className="text-[#6B7280]">Acct:</span> <span className="text-[#1A1D26] font-medium">{employee.personalBank.accountNo}</span></div>              <div><span className="text-[#6B7280]">IFSC:</span> <span className="text-[#1A1D26] font-medium">{employee.personalBank.ifsc}</span></div>              <div><span className="text-[#6B7280]">Holder:</span> <span className="text-[#1A1D26] font-medium">{employee.personalBank.holderName}</span></div>            </div>          </div>}        <div className="space-y-3">          <CollapsibleSection title="Leave Summary" defaultOpen={false} icon={<Calendar size={15} />}>            <LeaveSection orgId={orgId} employeeId={employee.id} />          </CollapsibleSection>          <CollapsibleSection title="Attendance" defaultOpen={false} icon={<Clock size={15} />}>            <AttendanceSection orgId={orgId} employeeId={employee.id} />          </CollapsibleSection>          <CollapsibleSection title="Fines" defaultOpen={false} icon={<Gavel size={15} />}>            <FinesSection orgId={orgId} employeeId={employee.id} />          </CollapsibleSection>          <CollapsibleSection title="Advances & Expenses" defaultOpen={false} icon={<Wallet size={15} />}>            <AdvancesSection orgId={orgId} employeeId={employee.id} />          </CollapsibleSection>          <CollapsibleSection title="Bonus & Variable Pay" defaultOpen={false} icon={<Gift size={15} />}>            <BonusSection orgId={orgId} employeeId={employee.id} />          </CollapsibleSection>        </div>      </div>    </div>;
}
function ActivityLogPanel({
  employee,
  onBack
}) {
  const {
    user
  } = useAuth();
  const {
    data: logs,
    isLoading
  } = useLogs(user?.orgId);
  const employeeLogs = useMemo(() => {
    if (!logs || !employee) return [];
    const empId = employee.id;
    const empUid = employee.uid;
    const empCode = employee.empCode;
    return logs.filter(l => {
      if (l.userId === empId || l.userId === empUid) return true;
      if (empCode && l.detail?.includes?.(empCode)) return true;
      if (l.module === 'Employee' && l.employeeId === empId) return true;
      return false;
    }).slice(0, 30);
  }, [logs, employee]);
  if (!employee) {
    return <div className="h-full flex flex-col items-center justify-center bg-white rounded-2xl border border-[#E9ECF0]">        <Activity size={32} className="text-[#D1D5DB] mb-2" />        <p className="text-[12px] text-[#9CA3AF]">Select an employee</p>      </div>;
  }
  return <div className="h-full flex flex-col bg-white rounded-2xl border border-[#E9ECF0] overflow-hidden">      <div className="p-4 pb-3 border-b border-[#E9ECF0]">        <div className="flex items-center justify-between">          <h3 className="text-[12px] font-semibold text-[#1A1D26] flex items-center gap-2">            <Activity size={14} className="text-[#09CE99]" />            Activity Log          </h3>          <button onClick={onBack} className="lg:hidden flex items-center gap-1 text-[11px] font-medium text-[#6B7280] hover:text-[#1A1D26] transition-colors">            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5" /><polyline points="12 19 5 12 12 5" /></svg>            Back          </button>        </div>      </div>      <div className="flex-1 overflow-y-auto">        {isLoading ? <div className="flex items-center justify-center gap-2 py-8 text-[#9CA3AF] text-[12px]">            <div className="w-3.5 h-3.5 border-2 border-[#E9ECF0] border-t-[#09CE99] rounded-full animate-spin" />            Loading...          </div> : employeeLogs.length === 0 ? <div className="flex flex-col items-center justify-center py-12 px-4 text-center">            <Activity size={20} className="text-[#D1D5DB] mb-2" />            <p className="text-[12px] text-[#9CA3AF]">No recent activity</p>          </div> : <div className="relative py-3">            <div className="absolute left-[21px] top-0 bottom-0 w-px bg-[#E9ECF0]" />            <div className="space-y-0">              {employeeLogs.map((log, i) => <div key={log.id || i} className="relative flex items-start gap-3 px-4 py-2.5 hover:bg-[#F7F8FA] transition-colors">                  <div className="w-2.5 h-2.5 rounded-full bg-[#09CE99] border-2 border-white mt-1.5 shrink-0 relative z-10" />                  <div className="flex-1 min-w-0">                    <p className="text-[12px] text-[#1A1D26] leading-snug">{log.action || log.detail || '—'}</p>                    <p className="text-[10px] text-[#9CA3AF] mt-0.5">                      {log.createdAt?.toDate?.() ? formatDate(log.createdAt.toDate()) : log.createdAt || ''}                      {log.userName ? ` · ${log.userName}` : ''}                    </p>                  </div>                  {log.module && <span className="text-[9px] font-medium text-[#9CA3AF] bg-[#F3F4F6] px-2 py-0.5 rounded-full shrink-0 self-start mt-0.5">{log.module}</span>}                </div>)}            </div>          </div>}      </div>    </div>;
}
function BirthdayView() {
  const {
    user
  } = useAuth();
  const {
    employees,
    loading
  } = useEmployees(user?.orgId);
  const birthdayData = useMemo(() => {
    const now = new Date();
    return employees.filter(e => e.dob).map(e => {
      const d = new Date(e.dob);
      return {
        ...e,
        birthMonth: d.getMonth(),
        birthDay: d.getDate(),
        age: now.getFullYear() - d.getFullYear()
      };
    }).sort((a, b) => a.birthMonth !== b.birthMonth ? a.birthMonth - b.birthMonth : a.birthDay - b.birthDay);
  }, [employees]);
  const thisMonthBirthdays = useMemo(() => {
    const month = new Date().getMonth();
    return birthdayData.filter(e => e.birthMonth === month).sort((a, b) => a.birthDay - b.birthDay);
  }, [birthdayData]);
  const upcomingBirthdays = useMemo(() => {
    const now = new Date();
    const month = now.getMonth();
    const day = now.getDate();
    return birthdayData.filter(e => e.birthMonth > month || e.birthMonth === month && e.birthDay > day).slice(0, 5);
  }, [birthdayData]);
  const formatBDay = dob => {
    const d = new Date(dob);
    return d.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short'
    });
  };
  if (loading) {
    return <div className="flex items-center justify-center h-[50vh]">        <div className="flex flex-col items-center gap-3">          <div className="w-8 h-8 border-2 border-[#E9ECF0] border-t-[#09CE99] rounded-full animate-spin" />          <p className="text-[13px] text-[#9CA3AF]">Loading...</p>        </div>      </div>;
  }
  return <div className="flex-1 min-h-0 grid grid-cols-1 xl:grid-cols-[1fr_280px] gap-5">      <div className="bg-white rounded-2xl border border-[#E9ECF0] overflow-hidden flex flex-col">        <div className="px-5 py-4 border-b border-[#E9ECF0] flex items-center justify-between">          <div>            <h2 className="text-[15px] font-bold text-[#1A1D26]">All Birthdays</h2>            <p className="text-[11px] text-[#6B7280] mt-0.5">{birthdayData.length} employees</p>          </div>        </div>        <div className="flex-1 overflow-y-auto">          <div className="grid grid-cols-[1fr_100px_80px] gap-0 px-5 py-2.5 text-[10px] font-semibold text-[#9CA3AF] uppercase tracking-wider bg-[#FAFBFC] border-b border-[#E9ECF0]">            <span>Employee</span>            <span>Birthday</span>            <span>Age</span>          </div>          <div className="divide-y divide-[#E9ECF0]/60">            {birthdayData.map(e => <div key={e.id} className="grid grid-cols-[1fr_100px_80px] gap-0 px-5 py-3 hover:bg-[#F7F8FA] transition-colors items-center">                <div className="flex items-center gap-3">                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0" style={{
                backgroundColor: statusColor(e.status)
              }}>                    {(e.name || '?').charAt(0).toUpperCase()}                  </div>                  <div className="min-w-0">                    <div className="text-[13px] font-medium text-[#1A1D26] truncate">{e.name}</div>                    <div className="text-[11px] text-[#6B7280] truncate">{e.designation || e.department || ''}</div>                  </div>                </div>                <div className="text-[13px] text-[#1A1D26] font-medium">{formatBDay(e.dob)}</div>                <div className="text-[13px] text-[#6B7280]">{e.age}</div>              </div>)}          </div>        </div>      </div>      <div className="flex flex-col gap-4">        <div className="bg-white rounded-2xl border border-[#E9ECF0] overflow-hidden">          <div className="px-4 py-3 border-b border-[#E9ECF0]">            <div className="flex items-center gap-2">              <Cake size={14} className="text-[#09CE99]" />              <span className="text-[12px] font-semibold text-[#1A1D26]">This Month</span>            </div>          </div>          <div className="px-4 py-3">            {thisMonthBirthdays.length === 0 ? <p className="text-[12px] text-[#9CA3AF] text-center py-4">No birthdays this month</p> : <div className="space-y-3">                {thisMonthBirthdays.map(e => <div key={e.id} className="flex items-center gap-3">                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0" style={{
                backgroundColor: statusColor(e.status)
              }}>                      {(e.name || '?').charAt(0).toUpperCase()}                    </div>                    <div className="flex-1 min-w-0">                      <div className="text-[12px] font-medium text-[#1A1D26] truncate">{e.name}</div>                      <div className="text-[10px] text-[#6B7280]">{formatBDay(e.dob)} · Turns {e.age}</div>                    </div>                  </div>)}              </div>}          </div>        </div>        <div className="bg-white rounded-2xl border border-[#E9ECF0] overflow-hidden">          <div className="px-4 py-3 border-b border-[#E9ECF0]">            <div className="flex items-center gap-2">              <ChevronRight size={14} className="text-[#F59E0B]" />              <span className="text-[12px] font-semibold text-[#1A1D26]">Upcoming</span>            </div>          </div>          <div className="px-4 py-3">            {upcomingBirthdays.length === 0 ? <p className="text-[12px] text-[#9CA3AF] text-center py-4">No upcoming birthdays</p> : <div className="space-y-3">                {upcomingBirthdays.map(e => <div key={e.id} className="flex items-center gap-3">                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0" style={{
                backgroundColor: statusColor(e.status)
              }}>                      {(e.name || '?').charAt(0).toUpperCase()}                    </div>                    <div className="flex-1 min-w-0">                      <div className="text-[12px] font-medium text-[#1A1D26] truncate">{e.name}</div>                      <div className="text-[10px] text-[#6B7280]">{formatBDay(e.dob)} · Turns {e.age}</div>                    </div>                  </div>)}              </div>}          </div>        </div>      </div>    </div>;
}
export default function EmployeesTab() {
  const {
    user
  } = useAuth();
  const [activeEmployeeTab, setActiveEmployeeTab] = useState('directory');
  const employeeSubTabs = [{
    id: 'directory',
    label: 'Directory',
    icon: <List size={15} />
  }, {
    id: 'details',
    label: 'Details',
    icon: <UserCheck size={15} />
  }, {
    id: 'birthday',
    label: 'Birthday',
    icon: <Cake size={15} />
  }, {
    id: 'profile_updates',
    label: 'Data approvals',
    icon: <ClipboardCheck size={15} />
  }];
  return <div className="flex flex-col h-full" style={{
    fontFamily: 'Figtree, system-ui, sans-serif'
  }}>
      <FleetSecondaryTabs
        tabs={employeeSubTabs}
        activeTabId={activeEmployeeTab}
        onTabChange={(tab) => setActiveEmployeeTab(tab.id)}
        ariaLabel="Employee workspace sections"
      />
      {activeEmployeeTab === 'directory' && <EmployeeDirectoryTab />}
      {activeEmployeeTab === 'details' && <DetailsView />}
      {activeEmployeeTab === 'birthday' && <BirthdayView />}
      {activeEmployeeTab === 'profile_updates' && <EmployeeProfileUpdatesTab />}
    </div>;
}
function DetailsView() {
  const {
    user
  } = useAuth();
  const {
    employees,
    loading: empLoading
  } = useEmployees(user?.orgId);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('Active');
  const [selectedId, setSelectedId] = useState(null);
  const [mobileView, setMobileView] = useState('list');
  useEffect(() => {
    if (employees?.length > 0 && !selectedId) {
      const first = employees.find(e => e.status === 'Active') || employees[0];
      setSelectedId(first.id);
    }
  }, [employees, selectedId]);
  const selectedEmployee = useMemo(() => employees.find(e => e.id === selectedId), [employees, selectedId]);
  const handleSelectEmployee = id => {
    setSelectedId(id);
    setMobileView('details');
  };
  if (empLoading) {
    return <div className="flex items-center justify-center h-[70vh]">        <div className="flex flex-col items-center gap-3">          <div className="w-8 h-8 border-2 border-[#E9ECF0] border-t-[#09CE99] rounded-full animate-spin" />          <p className="text-[13px] text-[#9CA3AF]">Loading employees...</p>        </div>      </div>;
  }
  return <div className="flex-1 min-h-0">      <div className="h-full lg:grid lg:grid-cols-[280px_1fr_280px] xl:grid-cols-[300px_1fr_300px] lg:gap-4">        <div className={`h-full lg:block ${mobileView === 'list' ? 'block' : 'hidden'}`}>          <EmployeeListPanel employees={employees} selectedId={selectedId} onSelect={handleSelectEmployee} search={search} onSearchChange={setSearch} statusFilter={statusFilter} onStatusFilterChange={setStatusFilter} />        </div>        <div className={`h-full lg:block ${mobileView === 'details' ? 'block' : 'hidden'}`}>          <EmployeeDetailsPanel employee={selectedEmployee} onBack={() => setMobileView('list')} onShowActivity={() => setMobileView('activity')} />        </div>        <div className={`h-full lg:block ${mobileView === 'activity' ? 'block' : 'hidden'}`}>          <ActivityLogPanel employee={selectedEmployee} onBack={() => setMobileView('details')} />        </div>      </div>    </div>;
}
