import React, { useState, useMemo, useEffect } from 'react'
import { Search, Check, X, Users, User, ChevronDown } from 'lucide-react'

export default function AssignUserPicker({
  assignedTo = [],
  onChange,
  employees = [],
  disabled = false,
  isPersonal = false,
  currentUserId
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [activeTab, setActiveTab] = useState('users') // 'users' | 'teams'
  const [search, setSearch] = useState('')
  const [tempAssigned, setTempAssigned] = useState(assignedTo || [])

  // Sync tempAssigned when assignedTo changes or modal opens
  useEffect(() => {
    setTempAssigned(assignedTo || [])
  }, [assignedTo, isOpen])

  // Extract unique teams/departments
  const teams = useMemo(() => {
    const map = new Map()
    employees.forEach(emp => {
      const dept = emp.department?.trim() || 'General'
      if (!map.has(dept)) {
        map.set(dept, [])
      }
      map.get(dept).push(emp)
    })
    return Array.from(map.entries()).map(([name, members]) => ({
      name,
      members,
      memberIds: members.map(m => m.id)
    }))
  }, [employees])

  // Filtered employees
  const filteredEmployees = useMemo(() => {
    if (!search.trim()) return employees
    const q = search.toLowerCase().trim()
    return employees.filter(emp => 
      (emp.name && emp.name.toLowerCase().includes(q)) ||
      (emp.email && emp.email.toLowerCase().includes(q)) ||
      (emp.phone && emp.phone.toLowerCase().includes(q)) ||
      (emp.designation && emp.designation.toLowerCase().includes(q)) ||
      (emp.department && emp.department.toLowerCase().includes(q))
    )
  }, [employees, search])

  // Filtered teams
  const filteredTeams = useMemo(() => {
    if (!search.trim()) return teams
    const q = search.toLowerCase().trim()
    return teams.filter(t => t.name.toLowerCase().includes(q))
  }, [teams, search])

  const toggleUser = (empId) => {
    setTempAssigned(prev => 
      prev.includes(empId) ? prev.filter(id => id !== empId) : [...prev, empId]
    )
  }

  const toggleTeam = (memberIds) => {
    const allSelected = memberIds.every(id => tempAssigned.includes(id))
    if (allSelected) {
      // Unselect team members
      setTempAssigned(prev => prev.filter(id => !memberIds.includes(id)))
    } else {
      // Select all team members
      setTempAssigned(prev => Array.from(new Set([...prev, ...memberIds])))
    }
  }

  const handleApply = () => {
    onChange?.(tempAssigned)
    setIsOpen(false)
  }

  const handleRemoveAll = () => {
    setTempAssigned([])
  }

  const getInitials = (name) => {
    if (!name) return '?'
    const parts = name.trim().split(' ')
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
    return name.slice(0, 2).toUpperCase()
  }

  // Find assigned employee objects for display
  const selectedEmployees = useMemo(() => {
    return (assignedTo || [])
      .map(id => employees.find(e => e.id === id))
      .filter(Boolean)
  }, [assignedTo, employees])

  if (isPersonal) {
    return (
      <div>
        <label className="block text-xs font-semibold text-slate-700 mb-1.5 font-heading">
          Assign User*
        </label>
        <div className="h-10 w-full rounded-lg border border-blue-200 bg-blue-50/60 px-3.5 flex items-center gap-2.5 text-xs text-blue-800 font-body">
          <User size={15} className="text-blue-600 shrink-0" />
          <span>Personal task — automatically assigned to you.</span>
        </div>
      </div>
    )
  }

  return (
    <div className="relative">
      <label className="block text-xs font-semibold text-slate-700 mb-1.5 font-heading">
        Assign User<span className="text-rose-500">*</span>
      </label>

      {/* Trigger Button/Field */}
      <div
        onClick={() => !disabled && setIsOpen(true)}
        className={`h-10 w-full rounded-lg border border-slate-200 bg-white px-3 flex items-center justify-between cursor-pointer hover:border-slate-300 transition-all shadow-2xs font-body ${
          disabled ? 'opacity-50 cursor-not-allowed' : ''
        }`}
      >
        <div className="flex items-center gap-2 overflow-hidden flex-1 min-w-0 pr-2">
          {selectedEmployees.length === 0 ? (
            <span className="text-xs text-slate-400 font-body">Select User</span>
          ) : (
            <div className="flex items-center gap-1.5 overflow-hidden flex-wrap max-h-8">
              {selectedEmployees.slice(0, 3).map(emp => (
                <span
                  key={emp.id}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-medium"
                >
                  <span className="w-3.5 h-3.5 rounded-full bg-emerald-600 text-white text-[8px] font-bold flex items-center justify-center font-mono">
                    {emp.name?.[0] || 'U'}
                  </span>
                  <span className="truncate max-w-[80px]">{emp.name.split(' ')[0]}</span>
                </span>
              ))}
              {selectedEmployees.length > 3 && (
                <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                  +{selectedEmployees.length - 3} more
                </span>
              )}
            </div>
          )}
        </div>

        <div className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center shrink-0 text-slate-500">
          <User size={13} />
        </div>
      </div>

      {/* Dropdown / Modal Popover (matches Image 1) */}
      {isOpen && (
        <div className="fixed inset-0 z-[1100] bg-black/40 backdrop-blur-2xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-[85vh]">
            
            {/* Header Tabs: Assign Users | Assign Teams */}
            <div className="flex border-b border-slate-200 bg-white px-2 pt-2 shrink-0">
              <button
                type="button"
                onClick={() => setActiveTab('users')}
                className={`flex-1 py-2.5 text-xs font-bold text-center transition-all border-b-2 cursor-pointer font-heading ${
                  activeTab === 'users'
                    ? 'border-emerald-600 text-emerald-700'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                Assign Users
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('teams')}
                className={`flex-1 py-2.5 text-xs font-bold text-center transition-all border-b-2 cursor-pointer font-heading ${
                  activeTab === 'teams'
                    ? 'border-emerald-600 text-emerald-700'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                Assign Teams
              </button>
            </div>

            {/* Search Box */}
            <div className="p-3.5 pb-2 shrink-0">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search by name, phone, email o..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  autoFocus
                  className="h-9 w-full rounded-lg border border-emerald-500/80 bg-white pl-9 pr-8 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-body shadow-2xs"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
                  >
                    <X size={13} />
                  </button>
                )}
              </div>

              {/* Selected Count & Remove All */}
              <div className="flex items-center justify-between mt-2.5 px-0.5">
                <span className="text-xs text-slate-600 font-medium font-body">
                  Selected: <strong className="text-slate-900">{tempAssigned.length}</strong> users
                </span>
                {tempAssigned.length > 0 && (
                  <button
                    type="button"
                    onClick={handleRemoveAll}
                    className="text-xs font-semibold text-rose-500 hover:text-rose-600 transition-colors cursor-pointer font-heading"
                  >
                    Remove All
                  </button>
                )}
              </div>
            </div>

            {/* List Body */}
            <div className="p-3.5 pt-1 overflow-y-auto flex-1 space-y-1.5 font-body">
              {activeTab === 'users' ? (
                filteredEmployees.length > 0 ? (
                  filteredEmployees.map(emp => {
                    const isSelected = tempAssigned.includes(emp.id)
                    return (
                      <div
                        key={emp.id}
                        onClick={() => toggleUser(emp.id)}
                        className={`flex items-center gap-3 p-2.5 rounded-xl border transition-all cursor-pointer select-none ${
                          isSelected
                            ? 'bg-emerald-50 border-emerald-300 shadow-2xs'
                            : 'bg-white border-slate-100 hover:bg-slate-50'
                        }`}
                      >
                        {/* Green Checkbox */}
                        <div
                          className={`w-5 h-5 rounded-md flex items-center justify-center border transition-all ${
                            isSelected
                              ? 'bg-emerald-600 border-emerald-600 text-white shadow-2xs'
                              : 'border-slate-300 bg-white text-transparent'
                          }`}
                        >
                          <Check size={12} strokeWidth={3} />
                        </div>

                        {/* Name & Role */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-bold text-slate-900 font-heading truncate">
                              {emp.name}
                            </span>
                            <span className="w-4 h-4 rounded-full bg-rose-500 text-white text-[9px] font-bold flex items-center justify-center font-mono shrink-0">
                              {emp.role === 'admin' ? 'A' : (emp.name?.[0] || 'U')}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500 font-body truncate mt-0.5">
                            {emp.designation || emp.role || emp.department || 'Employee'}
                          </p>
                        </div>
                      </div>
                    )
                  })
                ) : (
                  <p className="text-xs text-slate-400 italic py-4 text-center">No users found</p>
                )
              ) : (
                /* Teams Tab */
                filteredTeams.length > 0 ? (
                  filteredTeams.map(t => {
                    const allSelected = t.memberIds.length > 0 && t.memberIds.every(id => tempAssigned.includes(id))
                    const someSelected = t.memberIds.some(id => tempAssigned.includes(id)) && !allSelected
                    return (
                      <div
                        key={t.name}
                        onClick={() => toggleTeam(t.memberIds)}
                        className={`flex items-center gap-3 p-2.5 rounded-xl border transition-all cursor-pointer select-none ${
                          allSelected
                            ? 'bg-emerald-50 border-emerald-300 shadow-2xs'
                            : someSelected
                            ? 'bg-emerald-50/40 border-emerald-200'
                            : 'bg-white border-slate-100 hover:bg-slate-50'
                        }`}
                      >
                        {/* Checkbox */}
                        <div
                          className={`w-5 h-5 rounded-md flex items-center justify-center border transition-all ${
                            allSelected
                              ? 'bg-emerald-600 border-emerald-600 text-white'
                              : someSelected
                              ? 'bg-emerald-100 border-emerald-500 text-emerald-700'
                              : 'border-slate-300 bg-white text-transparent'
                          }`}
                        >
                          <Check size={12} strokeWidth={3} />
                        </div>

                        <div className="flex-1 min-w-0">
                          <span className="text-xs font-bold text-slate-900 font-heading block truncate">
                            {t.name} Team
                          </span>
                          <p className="text-[11px] text-slate-500 font-body mt-0.5">
                            {t.members.length} member{t.members.length === 1 ? '' : 's'}
                          </p>
                        </div>
                      </div>
                    )
                  })
                ) : (
                  <p className="text-xs text-slate-400 italic py-4 text-center">No teams found</p>
                )
              )}
            </div>

            {/* Bottom Actions (Cancel / Assign) */}
            <div className="p-3 border-t border-slate-200 bg-slate-50/50 flex gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="flex-1 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer font-heading"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleApply}
                className="flex-1 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm transition-colors cursor-pointer font-heading"
              >
                Assign
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  )
}
