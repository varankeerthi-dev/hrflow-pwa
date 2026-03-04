import { useState, useEffect, useMemo } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { useEmployees } from '../../hooks/useEmployees'
import { Cake, Search, Mail, Gift } from 'lucide-react'

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
    <div className="space-y-6 font-inter">
      <div className="flex justify-between items-center">
        <h3 className="text-sm font-black text-gray-800 uppercase tracking-tight">Birthday Calendar</h3>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
          <input 
            type="text" 
            placeholder="Search employee..." 
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="pl-9 pr-4 py-2 border rounded-xl text-xs outline-none focus:ring-2 focus:ring-indigo-500 w-64 shadow-sm"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {filtered.map(emp => (
          <div key={emp.id} className={`p-5 rounded-2xl border transition-all ${emp.isToday ? 'bg-indigo-50 border-indigo-200 shadow-indigo-100 ring-4 ring-indigo-50' : 'bg-white border-gray-100 shadow-sm hover:shadow-md'}`}>
            <div className="flex justify-between items-start mb-4">
              <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center text-xl shadow-inner">
                {emp.isToday ? '🎂' : '🎈'}
              </div>
              {emp.isToday && (
                <span className="bg-indigo-600 text-white text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest animate-bounce">Today</span>
              )}
            </div>
            
            <h4 className="font-bold text-gray-900 uppercase tracking-tight truncate">{emp.name}</h4>
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1">{emp.month} {emp.day}</p>
            
            <div className="mt-4 pt-4 border-t border-gray-50 flex gap-2">
              <button className="flex-1 bg-gray-50 text-gray-600 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-gray-100 transition-colors flex items-center justify-center gap-2">
                <Mail size={12} /> Wish
              </button>
              <button className="p-2 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100 transition-colors">
                <Gift size={12} />
              </button>
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="col-span-full py-20 text-center text-gray-300 font-black uppercase tracking-widest opacity-20 text-2xl italic">No Birthdays Found</div>
        )}
      </div>
    </div>
  )
}
