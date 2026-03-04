import { useState, useMemo } from 'react'
import { useLogs } from '../../hooks/useActivityLog'
import { X, Clock, Filter, RotateCcw } from 'lucide-react'

function formatTs(ts) {
    if (!ts) return '—'
    const d = ts.toDate ? ts.toDate() : new Date(ts)
    const dd = String(d.getDate()).padStart(2, '0')
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const yyyy = d.getFullYear()
    const hh = String(d.getHours()).padStart(2, '0')
    const min = String(d.getMinutes()).padStart(2, '0')
    return { date: `${dd}/${mm}/${yyyy}`, time: `${hh}:${min}` }
}

const MODULE_COLORS = {
    Attendance: 'bg-green-100 text-green-700',
    Correction: 'bg-amber-100 text-amber-700',
    Salary: 'bg-purple-100 text-purple-700',
    Leave: 'bg-blue-100 text-blue-700',
    System: 'bg-gray-100 text-gray-500',
}

export default function ActivityLogSidebar({ orgId, onClose }) {
    const { logs, loading } = useLogs(orgId)
    const [filterModule, setFilterModule] = useState('All')
    const [filterDate, setFilterDate] = useState('')

    const modules = ['All', 'Attendance', 'Correction', 'Salary', 'Leave', 'System']

    const filtered = useMemo(() => {
        return logs.filter(log => {
            if (filterModule !== 'All' && log.module !== filterModule) return false
            if (filterDate) {
                if (!log.createdAt) return false
                const d = log.createdAt.toDate ? log.createdAt.toDate() : new Date(log.createdAt)
                const iso = d.toISOString().split('T')[0]
                if (iso !== filterDate) return false
            }
            return true
        })
    }, [logs, filterModule, filterDate])

    return (
        <div className="fixed right-0 top-0 h-full w-[320px] bg-white border-l border-gray-200 shadow-2xl z-50 flex flex-col font-inter animate-in slide-in-from-right duration-300">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50 shrink-0">
                <div className="flex items-center gap-2">
                    <Clock size={15} className="text-indigo-600" />
                    <span className="text-[12px] font-black text-gray-800 uppercase tracking-widest">Activity Log</span>
                </div>
                <button onClick={onClose} className="p-1.5 hover:bg-gray-200 rounded-lg text-gray-400 transition-colors">
                    <X size={15} />
                </button>
            </div>

            {/* Filters */}
            <div className="px-3 py-2.5 border-b border-gray-100 shrink-0 space-y-2">
                {/* Module filter */}
                <div className="flex gap-1 flex-wrap">
                    {modules.map(m => (
                        <button
                            key={m}
                            onClick={() => setFilterModule(m)}
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold border transition-all ${filterModule === m
                                    ? 'bg-indigo-600 text-white border-indigo-600'
                                    : 'bg-white text-gray-400 border-gray-200 hover:border-gray-300'
                                }`}
                        >
                            {m}
                        </button>
                    ))}
                </div>
                {/* Date filter */}
                <div className="flex items-center gap-2">
                    <Filter size={12} className="text-gray-400 shrink-0" />
                    <input
                        type="date"
                        value={filterDate}
                        onChange={e => setFilterDate(e.target.value)}
                        className="flex-1 h-[28px] border border-gray-200 rounded-lg px-2 text-[11px] font-medium focus:ring-2 focus:ring-indigo-500 outline-none bg-gray-50"
                    />
                    {filterDate && (
                        <button onClick={() => setFilterDate('')} className="p-1 hover:bg-gray-100 rounded text-gray-400">
                            <RotateCcw size={11} />
                        </button>
                    )}
                </div>
            </div>

            {/* Log entries */}
            <div className="flex-1 overflow-y-auto">
                {loading ? (
                    <div className="text-center py-12 text-gray-300 text-[11px] font-bold uppercase">Loading...</div>
                ) : filtered.length === 0 ? (
                    <div className="text-center py-16 text-gray-300 text-[11px] font-bold uppercase italic">No activity found</div>
                ) : (
                    filtered.map(log => {
                        const ts = formatTs(log.createdAt)
                        const color = MODULE_COLORS[log.module] || MODULE_COLORS.System
                        return (
                            <div key={log.id} className="px-4 py-3 border-b border-gray-50 hover:bg-gray-50 transition-colors">
                                <div className="flex items-start justify-between gap-2 mb-1">
                                    <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded ${color}`}>
                                        {log.module || 'System'}
                                    </span>
                                    <div className="text-right shrink-0">
                                        <div className="text-[10px] font-bold text-gray-500">{ts.date}</div>
                                        <div className="text-[10px] text-gray-400">{ts.time}</div>
                                    </div>
                                </div>
                                <p className="text-[11px] font-semibold text-gray-700 leading-snug">{log.action}</p>
                                {log.detail && <p className="text-[10px] text-gray-400 mt-0.5 truncate">{log.detail}</p>}
                                <p className="text-[9px] text-gray-300 font-bold uppercase mt-1">{log.userName}</p>
                            </div>
                        )
                    })
                )}
            </div>

            <div className="px-4 py-2 border-t border-gray-100 bg-gray-50 shrink-0">
                <p className="text-[9px] text-gray-300 font-bold uppercase text-center">{filtered.length} entries</p>
            </div>
        </div>
    )
}
