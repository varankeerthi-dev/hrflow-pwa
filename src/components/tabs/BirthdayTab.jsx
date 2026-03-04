import { useState, useEffect, useMemo } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { useEmployees } from '../../hooks/useEmployees'
import { Cake, Search, Mail, Gift, ChevronRight } from 'lucide-react'

export default function BirthdayTab() {
  const { user } = useAuth()
  const { employees } = useEmployees(user?.orgId)
  const [searchTerm, setSearchTerm] = useState('')

  const birthdayEmployees = useMemo(() => {
    return employees.filter(e => e.dob).map(e => {
      const dob = new Date(e.dob)
      const today = new Date()
      const nextBday = new Date(today.getFullYear(), dob.getMonth(), dob.getDate())
      if (nextBday < today) nextBday.setFullYear(today.getFullYear() + 1)
      
      return {
        ...e,
        nextBday,
        isToday: nextBday.getMonth() === today.getMonth() && nextBday.getDate() === today.getDate(),
        month: dob.toLocaleString('default', { month: 'long' }),
        day: dob.getDate()
      }
    }).sort((a, b) => a.nextBday - b.nextBday)
  }, [employees])

  const filtered = birthdayEmployees.filter(e => e.name.toLowerCase().includes(searchTerm.toLowerCase()))

  return (
    <div className="space-y-8 font-inter">
      {/* Search Header Card */}
      <div className="bg-white p-6 rounded-[12px] shadow-sm border border-gray-100 flex justify-between items-center">
        <div className="flex items-center gap-3 text-indigo-600">
          <Cake size={20} />
          <h3 className="text-sm font-bold text-gray-800 uppercase tracking-tight">Celebration Calendar</h3>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
          <input 
            type="text" 
            placeholder="Search employee roster..." 
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="h-[42px] pl-10 pr-4 border border-gray-200 rounded-lg text-sm font-semibold outline-none focus:ring-2 focus:ring-indigo-500 w-[280px] bg-gray-50/50 shadow-inner"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {filtered.map(emp => (
          <div key={emp.id} className={`group p-8 rounded-[12px] border transition-all relative overflow-hidden ${emp.isToday ? 'bg-indigo-600 border-indigo-700 shadow-xl shadow-indigo-200 scale-105 z-10' : 'bg-white border-gray-100 shadow-sm hover:shadow-lg'}`}>
            {emp.isToday && (
              <div className="absolute -top-4 -right-4 w-20 h-20 bg-white/10 rounded-full blur-2xl animate-pulse"></div>
            )}
            
            <div className="flex justify-between items-start mb-6">
              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-2xl shadow-inner border ${emp.isToday ? 'bg-white/20 border-white/30 text-white' : 'bg-gray-50 border-gray-100 text-gray-400'}`}>
                {emp.isToday ? '🎂' : '🎈'}
              </div>
              {emp.isToday && (
                <span className="bg-white text-indigo-600 text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-[0.2em] shadow-lg animate-bounce">Live</span>
              )}
            </div>
            
            <h4 className={`font-black uppercase tracking-tight truncate text-sm ${emp.isToday ? 'text-white' : 'text-gray-900'}`}>{emp.name}</h4>
            <div className="flex items-center gap-2 mt-2">
              <span className={`text-[10px] font-bold uppercase tracking-widest ${emp.isToday ? 'text-indigo-100' : 'text-gray-400'}`}>{emp.month} {emp.day}</span>
              <ChevronRight size={12} className={emp.isToday ? 'text-indigo-200' : 'text-gray-200'} />
            </div>
            
            <div className={`mt-8 pt-6 border-t flex gap-3 ${emp.isToday ? 'border-white/20' : 'border-gray-50'}`}>
              <button className={`flex-1 h-[36px] rounded-lg text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${emp.isToday ? 'bg-white text-indigo-600 hover:bg-gray-100' : 'bg-gray-50 text-gray-600 hover:bg-indigo-600 hover:text-white'}`}>
                <Mail size={14} /> Send Wish
              </button>
              {!emp.isToday && (
                <button className="w-[36px] h-[36px] bg-indigo-50 text-indigo-600 rounded-lg flex items-center justify-center hover:bg-indigo-100 transition-colors">
                  <Gift size={14} />
                </button>
              )}
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="col-span-full py-24 text-center text-gray-300 font-medium uppercase tracking-widest text-2xl opacity-40 italic">No celebratory records found</div>
        )}
      </div>
    </div>
  )
}
