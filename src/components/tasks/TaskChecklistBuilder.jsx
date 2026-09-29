import React, { useState } from 'react'
import DatePicker from 'react-datepicker'
import 'react-datepicker/dist/react-datepicker.css'
import {
  Bell,
  ClipboardCheck,
  RotateCw,
  Clock,
  Plus,
  Trash2,
  X,
  Check,
  CheckSquare,
  ChevronDown,
  ChevronUp,
  Video,
  Mic,
  Image as ImageIcon,
  FileText,
  Type,
  MapPin,
  Calendar as CalendarIcon,
  User,
  List
} from 'lucide-react'
import { createDefaultChecklistItem, createDefaultSubtask } from '../../lib/taskUtils'
export { createDefaultChecklistItem, createDefaultSubtask }

const getInitials = (name) => {
  if (!name) return '?'
  const parts = name.trim().split(' ')
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
  return name.slice(0, 2).toUpperCase()
}

export default function TaskChecklistBuilder({
  buzzer = false,
  onBuzzerChange,
  repeat = { enabled: false, frequency: 'daily', interval: 1, daysOfWeek: [], endDate: null },
  onRepeatChange,
  reminder = { enabled: false, timing: 'at_due_date', customDate: null, alertType: 'notification' },
  onReminderChange,
  checklists = [],
  onChecklistsChange,
  subtasks = [],
  onSubtasksChange,
  employees = []
}) {
  const [showRepeatPanel, setShowRepeatPanel] = useState(repeat?.enabled || false)
  const [showReminderPanel, setShowReminderPanel] = useState(reminder?.enabled || false)
  const [collapsedDropdowns, setCollapsedDropdowns] = useState({})

  // Toggle dropdown builder collapse
  const toggleDropdownCollapse = (checkId) => {
    setCollapsedDropdowns(prev => ({
      ...prev,
      [checkId]: !prev[checkId]
    }))
  }

  // --- CHECKLIST HANDLERS ---
  const handleAddChecklist = (initialTitle = '') => {
    const newItem = createDefaultChecklistItem(initialTitle)
    onChecklistsChange?.([...(checklists || []), newItem])
  }

  const handleRemoveChecklist = (checkId) => {
    onChecklistsChange?.((checklists || []).filter(item => item.id !== checkId))
  }

  const updateChecklist = (checkId, updates) => {
    onChecklistsChange?.(
      (checklists || []).map(item => (item.id === checkId ? { ...item, ...updates } : item))
    )
  }

  const handleToggleValidation = (checkId, key) => {
    const item = (checklists || []).find(i => i.id === checkId)
    if (!item) return
    const currentVal = !!item.validations?.[key]
    const updatedValidations = {
      ...(item.validations || {}),
      [key]: !currentVal
    }
    updateChecklist(checkId, { validations: updatedValidations })
  }

  const handleAddDropdownOption = (checkId) => {
    const item = (checklists || []).find(i => i.id === checkId)
    if (!item) return
    const currentOptions = item.dropdownConfig?.options || []
    const newOption = {
      id: 'opt_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
      label: `Option ${currentOptions.length + 1}`,
      points: ''
    }
    updateChecklist(checkId, {
      dropdownConfig: {
        ...(item.dropdownConfig || {}),
        options: [...currentOptions, newOption]
      }
    })
  }

  const handleRemoveDropdownOption = (checkId, optionId) => {
    const item = (checklists || []).find(i => i.id === checkId)
    if (!item) return
    const currentOptions = item.dropdownConfig?.options || []
    updateChecklist(checkId, {
      dropdownConfig: {
        ...(item.dropdownConfig || {}),
        options: currentOptions.filter(o => o.id !== optionId)
      }
    })
  }

  const handleUpdateDropdownOption = (checkId, optionId, field, value) => {
    const item = (checklists || []).find(i => i.id === checkId)
    if (!item) return
    const currentOptions = item.dropdownConfig?.options || []
    updateChecklist(checkId, {
      dropdownConfig: {
        ...(item.dropdownConfig || {}),
        options: currentOptions.map(o => (o.id === optionId ? { ...o, [field]: value } : o))
      }
    })
  }

  const handleToggleAllowMultiple = (checkId) => {
    const item = (checklists || []).find(i => i.id === checkId)
    if (!item) return
    const currentAllowMultiple = !!item.dropdownConfig?.allowMultiple
    updateChecklist(checkId, {
      dropdownConfig: {
        ...(item.dropdownConfig || {}),
        allowMultiple: !currentAllowMultiple
      }
    })
  }

  // --- SUB-TASKS HANDLERS ---
  const handleAddSubtask = (initialTitle = '') => {
    const newItem = createDefaultSubtask(initialTitle)
    onSubtasksChange?.([...(subtasks || []), newItem])
  }

  const handleRemoveSubtask = (subtaskId) => {
    onSubtasksChange?.((subtasks || []).filter(item => item.id !== subtaskId))
  }

  const updateSubtask = (subtaskId, updates) => {
    onSubtasksChange?.(
      (subtasks || []).map(item => (item.id === subtaskId ? { ...item, ...updates } : item))
    )
  }

  const handleAddSubtaskChecklist = (subtaskId) => {
    const item = (subtasks || []).find(s => s.id === subtaskId)
    if (!item) return
    const newChecklist = createDefaultChecklistItem()
    updateSubtask(subtaskId, {
      checklists: [...(item.checklists || []), newChecklist]
    })
  }

  const handleRemoveSubtaskChecklist = (subtaskId, checkId) => {
    const item = (subtasks || []).find(s => s.id === subtaskId)
    if (!item) return
    updateSubtask(subtaskId, {
      checklists: (item.checklists || []).filter(c => c.id !== checkId)
    })
  }

  const handleUpdateSubtaskChecklist = (subtaskId, checkId, updates) => {
    const item = (subtasks || []).find(s => s.id === subtaskId)
    if (!item) return
    updateSubtask(subtaskId, {
      checklists: (item.checklists || []).map(c => c.id === checkId ? { ...c, ...updates } : c)
    })
  }

  return (
    <div className="space-y-4 pt-2">
      {/* 1. Buzzer Card */}
      <div className="bg-slate-50/70 border border-slate-200/80 rounded-2xl p-4 flex items-center justify-between gap-4 transition-all">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-white border border-slate-200 flex items-center justify-center shrink-0 shadow-2xs">
            <Bell size={18} className="text-slate-700" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-bold text-slate-900 font-heading">Buzzer</h4>
            </div>
            <p className="text-xs text-slate-500 mt-0.5 font-body">
              Sends full screen alerts to user when a task is assigned to them
            </p>
          </div>
        </div>

        {/* Buzzer Toggle */}
        <label className="relative inline-flex items-center cursor-pointer shrink-0">
          <input
            type="checkbox"
            className="sr-only peer"
            checked={!!buzzer}
            onChange={(e) => onBuzzerChange?.(e.target.checked)}
          />
          <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600 shadow-xs"></div>
        </label>
      </div>

      {/* 2. Action Buttons */}
      <div className="space-y-2.5">
        <div className="flex items-center gap-2.5 flex-wrap sm:flex-nowrap">
          <button
            type="button"
            onClick={() => {
              if (!checklists || checklists.length === 0) {
                handleAddChecklist()
              }
            }}
            className={`h-10 px-4 rounded-xl border text-xs font-semibold flex items-center gap-2 transition-all font-heading cursor-pointer shadow-2xs ${
              checklists && checklists.length > 0
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-white border-slate-200 text-slate-800 hover:bg-slate-50'
            }`}
          >
            <ClipboardCheck size={16} />
            <span>Ask Validations</span>
            {checklists?.length > 0 && (
              <span className="w-4 h-4 rounded-full bg-white/20 text-white text-[10px] flex items-center justify-center font-mono">
                {checklists.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setShowRepeatPanel(!showRepeatPanel)}
            className={`h-10 px-4 rounded-xl border text-xs font-semibold flex items-center gap-2 transition-all font-heading cursor-pointer shadow-2xs ${
              repeat?.enabled || showRepeatPanel
                ? 'bg-blue-50 text-blue-700 border-blue-300'
                : 'bg-white border-slate-200 text-slate-800 hover:bg-slate-50'
            }`}
          >
            <Clock size={16} />
            <span>Repeat</span>
            {repeat?.enabled && (
              <span className="w-2 h-2 rounded-full bg-blue-600"></span>
            )}
          </button>
        </div>

        <div>
          <button
            type="button"
            onClick={() => setShowReminderPanel(!showReminderPanel)}
            className={`h-10 px-4 rounded-xl border text-xs font-semibold flex items-center gap-2 transition-all font-heading cursor-pointer shadow-2xs ${
              reminder?.enabled || showReminderPanel
                ? 'bg-amber-50 text-amber-700 border-amber-300'
                : 'bg-white border-slate-200 text-slate-800 hover:bg-slate-50'
            }`}
          >
            <Bell size={16} />
            <span>Reminder</span>
            {reminder?.enabled && (
              <span className="w-2 h-2 rounded-full bg-amber-500"></span>
            )}
          </button>
        </div>
      </div>

      {/* 2b. Expandable Repeat Configuration Panel */}
      {showRepeatPanel && (
        <div className="bg-slate-50/80 border border-slate-200 rounded-2xl p-4 space-y-3 animate-in fade-in slide-in-from-top-2 duration-150 font-body">
          <div className="flex items-center justify-between pb-2 border-b border-slate-200/70">
            <div className="flex items-center gap-2">
              <RotateCw size={14} className="text-blue-600" />
              <span className="text-xs font-bold text-slate-800 font-heading">Repeat Configuration</span>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={!!repeat?.enabled}
                onChange={(e) => onRepeatChange?.({ ...(repeat || {}), enabled: e.target.checked })}
              />
              <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">Frequency</label>
              <select
                value={repeat?.frequency || 'daily'}
                onChange={(e) => onRepeatChange?.({ ...(repeat || {}), frequency: e.target.value })}
                className="h-8 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-800 focus:outline-none focus:border-blue-500 cursor-pointer"
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="custom">Custom</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">Repeat Interval</label>
              <input
                type="number"
                min="1"
                value={repeat?.interval || 1}
                onChange={(e) => onRepeatChange?.({ ...(repeat || {}), interval: parseInt(e.target.value) || 1 })}
                className="h-8 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-800 focus:outline-none focus:border-blue-500"
                placeholder="e.g. 1"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">End Date</label>
              <div className="relative">
                <DatePicker
                  selected={repeat?.endDate ? (repeat.endDate.toDate ? repeat.endDate.toDate() : new Date(repeat.endDate)) : null}
                  onChange={(date) => onRepeatChange?.({ ...(repeat || {}), endDate: date })}
                  className="h-8 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-800 focus:outline-none focus:border-blue-500"
                  placeholderText="Never end"
                  dateFormat="MMM d, yyyy"
                />
                <CalendarIcon size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              </div>
            </div>
          </div>

          {repeat?.frequency === 'weekly' && (
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">Days of week</label>
              <div className="flex items-center gap-1.5 flex-wrap">
                {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => {
                  const isSelected = (repeat?.daysOfWeek || []).includes(day)
                  return (
                    <button
                      key={day}
                      type="button"
                      onClick={() => {
                        const current = repeat?.daysOfWeek || []
                        const updated = isSelected ? current.filter(d => d !== day) : [...current, day]
                        onRepeatChange?.({ ...(repeat || {}), daysOfWeek: updated })
                      }}
                      className={`h-7 px-2.5 rounded-md text-[11px] font-semibold transition-all border ${
                        isSelected
                          ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
                          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      {day}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 2c. Expandable Reminder Configuration Panel */}
      {showReminderPanel && (
        <div className="bg-slate-50/80 border border-slate-200 rounded-2xl p-4 space-y-3 animate-in fade-in slide-in-from-top-2 duration-150 font-body">
          <div className="flex items-center justify-between pb-2 border-b border-slate-200/70">
            <div className="flex items-center gap-2">
              <Bell size={14} className="text-amber-500" />
              <span className="text-xs font-bold text-slate-800 font-heading">Reminder Notification</span>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={!!reminder?.enabled}
                onChange={(e) => onReminderChange?.({ ...(reminder || {}), enabled: e.target.checked })}
              />
              <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-500"></div>
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">When to remind</label>
              <select
                value={reminder?.timing || 'at_due_date'}
                onChange={(e) => onReminderChange?.({ ...(reminder || {}), timing: e.target.value })}
                className="h-8 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-800 focus:outline-none focus:border-amber-500 cursor-pointer"
              >
                <option value="at_due_date">At Due Date & Time</option>
                <option value="15_min_before">15 minutes before</option>
                <option value="1_hour_before">1 hour before</option>
                <option value="1_day_before">1 day before</option>
                <option value="custom">Custom Date & Time</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">Alert Type</label>
              <select
                value={reminder?.alertType || 'notification'}
                onChange={(e) => onReminderChange?.({ ...(reminder || {}), alertType: e.target.value })}
                className="h-8 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-800 focus:outline-none focus:border-amber-500 cursor-pointer"
              >
                <option value="notification">Push Notification</option>
                <option value="sound">Sound Alert</option>
                <option value="both">Both (Notification + Sound)</option>
              </select>
            </div>
          </div>

          {reminder?.timing === 'custom' && (
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">Custom Reminder Date & Time</label>
              <DatePicker
                selected={reminder?.customDate ? (reminder.customDate.toDate ? reminder.customDate.toDate() : new Date(reminder.customDate)) : new Date()}
                onChange={(date) => onReminderChange?.({ ...(reminder || {}), customDate: date })}
                showTimeSelect
                dateFormat="MMM d, yyyy h:mm aa"
                className="h-8 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-800 focus:outline-none focus:border-amber-500"
              />
            </div>
          )}
        </div>
      )}

      {/* 3. CHECKLIST SECTION (Matching media_1790256178080.png) */}
      <div className="pt-2 border-t border-slate-200/80 space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-bold text-slate-900 font-heading flex items-center gap-1.5">
            <CheckSquare size={14} className="text-emerald-600" />
            <span>Checklist</span>
            {checklists?.length > 0 && (
              <span className="text-[10px] text-slate-400 font-mono">({checklists.length})</span>
            )}
          </h4>
          <button
            type="button"
            onClick={() => handleAddChecklist()}
            className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 transition-colors flex items-center gap-1 cursor-pointer font-heading"
          >
            <Plus size={14} />
            <span>Add Checklist</span>
          </button>
        </div>

        {/* Checklist Cards Container */}
        {checklists && checklists.length > 0 && (
          <div className="space-y-3.5">
            {checklists.map((item, index) => {
              const isDropdownActive = !!item.validations?.dropdown
              const isDropdownCollapsed = !!collapsedDropdowns[item.id]
              const options = item.dropdownConfig?.options || []

              return (
                <div
                  key={item.id}
                  className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-2xs space-y-3 relative transition-all"
                >
                  {/* Card Header: Checklist & Status Toggle & Trash Icon */}
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-800 font-heading">Checklist</span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => updateChecklist(item.id, { completed: !item.completed })}
                        className={`text-[10px] px-2 py-0.5 rounded font-semibold border transition-colors cursor-pointer ${
                          item.completed 
                            ? 'bg-emerald-100 text-emerald-700 border-emerald-200' 
                            : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                        }`}
                        title="Mark item checked or not checked"
                      >
                        {item.completed ? '✓ Checked' : '○ Not checked'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemoveChecklist(item.id)}
                        className="text-slate-400 hover:text-rose-600 p-1 rounded-md transition-colors cursor-pointer"
                        title="Delete checklist item"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>

                  {/* Required Toggle */}
                  <div className="flex items-center gap-2">
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        className="sr-only peer"
                        checked={!!item.required}
                        onChange={(e) => updateChecklist(item.id, { required: e.target.checked })}
                      />
                      <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600 shadow-2xs"></div>
                    </label>
                    <span className="text-xs font-semibold text-slate-800 font-heading">Required:</span>
                  </div>

                  {/* Field Title Input with Clear Button */}
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Enter field title here"
                      value={item.title || ''}
                      onChange={(e) => updateChecklist(item.id, { title: e.target.value })}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3.5 pr-8 py-2 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/20 shadow-2xs transition-all font-body"
                    />
                    {item.title && (
                      <button
                        type="button"
                        onClick={() => updateChecklist(item.id, { title: '' })}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
                        title="Clear title"
                      >
                        <X size={13} />
                      </button>
                    )}
                  </div>

                  {/* Validations Checkboxes Row */}
                  <div className="flex items-center gap-3 flex-wrap pt-0.5 text-xs text-slate-600 font-body">
                    <span className="text-xs font-medium text-slate-500">Validations:</span>

                    {/* Video */}
                    <label className="flex items-center gap-1.5 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        className="sr-only peer"
                        checked={!!item.validations?.video}
                        onChange={() => handleToggleValidation(item.id, 'video')}
                      />
                      <div className="w-4 h-4 rounded border border-slate-300 peer-checked:border-emerald-600 peer-checked:bg-emerald-600 flex items-center justify-center text-white transition-all shadow-2xs">
                        {item.validations?.video && <Check size={11} strokeWidth={3} />}
                      </div>
                      <span className="flex items-center gap-1 text-slate-700">
                        Video <Video size={13} className="text-slate-400" />
                      </span>
                    </label>

                    {/* Audio */}
                    <label className="flex items-center gap-1.5 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        className="sr-only peer"
                        checked={!!item.validations?.audio}
                        onChange={() => handleToggleValidation(item.id, 'audio')}
                      />
                      <div className="w-4 h-4 rounded border border-slate-300 peer-checked:border-emerald-600 peer-checked:bg-emerald-600 flex items-center justify-center text-white transition-all shadow-2xs">
                        {item.validations?.audio && <Check size={11} strokeWidth={3} />}
                      </div>
                      <span className="flex items-center gap-1 text-slate-700">
                        Audio <Mic size={13} className="text-slate-400" />
                      </span>
                    </label>

                    {/* Image */}
                    <label className="flex items-center gap-1.5 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        className="sr-only peer"
                        checked={!!item.validations?.image}
                        onChange={() => handleToggleValidation(item.id, 'image')}
                      />
                      <div className="w-4 h-4 rounded border border-slate-300 peer-checked:border-emerald-600 peer-checked:bg-emerald-600 flex items-center justify-center text-white transition-all shadow-2xs">
                        {item.validations?.image && <Check size={11} strokeWidth={3} />}
                      </div>
                      <span className="flex items-center gap-1 text-slate-700">
                        Image <ImageIcon size={13} className="text-slate-400" />
                      </span>
                    </label>

                    {/* File */}
                    <label className="flex items-center gap-1.5 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        className="sr-only peer"
                        checked={!!item.validations?.file}
                        onChange={() => handleToggleValidation(item.id, 'file')}
                      />
                      <div className="w-4 h-4 rounded border border-slate-300 peer-checked:border-emerald-600 peer-checked:bg-emerald-600 flex items-center justify-center text-white transition-all shadow-2xs">
                        {item.validations?.file && <Check size={11} strokeWidth={3} />}
                      </div>
                      <span className="flex items-center gap-1 text-slate-700">
                        File <FileText size={13} className="text-slate-400" />
                      </span>
                    </label>

                    {/* Text */}
                    <label className="flex items-center gap-1.5 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        className="sr-only peer"
                        checked={!!item.validations?.text}
                        onChange={() => handleToggleValidation(item.id, 'text')}
                      />
                      <div className="w-4 h-4 rounded border border-slate-300 peer-checked:border-emerald-600 peer-checked:bg-emerald-600 flex items-center justify-center text-white transition-all shadow-2xs">
                        {item.validations?.text && <Check size={11} strokeWidth={3} />}
                      </div>
                      <span className="flex items-center gap-1 text-slate-700">
                        Text <Type size={13} className="text-slate-400" />
                      </span>
                    </label>

                    {/* Dropdown */}
                    <div className="flex items-center gap-1">
                      <label className="flex items-center gap-1.5 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          className="sr-only peer"
                          checked={!!item.validations?.dropdown}
                          onChange={() => handleToggleValidation(item.id, 'dropdown')}
                        />
                        <div className="w-4 h-4 rounded border border-slate-300 peer-checked:border-emerald-600 peer-checked:bg-emerald-600 flex items-center justify-center text-white transition-all shadow-2xs">
                          {item.validations?.dropdown && <Check size={11} strokeWidth={3} />}
                        </div>
                        <span className="flex items-center gap-1 text-slate-700">
                          Dropdown <ChevronDown size={13} className="text-slate-400" />
                        </span>
                      </label>
                      {isDropdownActive && (
                        <button
                          type="button"
                          onClick={() => toggleDropdownCollapse(item.id)}
                          className="text-slate-400 hover:text-slate-600 p-0.5 rounded transition-colors cursor-pointer"
                          title={isDropdownCollapsed ? 'Expand options' : 'Collapse options'}
                        >
                          {isDropdownCollapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                        </button>
                      )}
                    </div>

                    {/* Geo Tag */}
                    <label className="flex items-center gap-1.5 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        className="sr-only peer"
                        checked={!!item.validations?.geoTag}
                        onChange={() => handleToggleValidation(item.id, 'geoTag')}
                      />
                      <div className="w-4 h-4 rounded border border-slate-300 peer-checked:border-emerald-600 peer-checked:bg-emerald-600 flex items-center justify-center text-white transition-all shadow-2xs">
                        {item.validations?.geoTag && <Check size={11} strokeWidth={3} />}
                      </div>
                      <span className="flex items-center gap-1 text-slate-700">
                        Geo Tag <MapPin size={13} className="text-slate-400" />
                      </span>
                    </label>
                  </div>

                  {/* Dropdown Options Builder */}
                  {isDropdownActive && !isDropdownCollapsed && (
                    <div className="mt-2.5 p-3.5 bg-slate-50/70 border border-slate-200/80 rounded-xl space-y-2 animate-in fade-in duration-150 font-body">
                      <div className="space-y-2">
                        {options.map((opt, optIdx) => (
                          <div key={opt.id || optIdx} className="flex items-center gap-2">
                            <input
                              type="text"
                              value={opt.label || ''}
                              onChange={(e) => handleUpdateDropdownOption(item.id, opt.id, 'label', e.target.value)}
                              placeholder={`Option ${optIdx + 1}`}
                              className="flex-1 h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/20 shadow-2xs"
                            />
                            <input
                              type="text"
                              value={opt.points || ''}
                              onChange={(e) => handleUpdateDropdownOption(item.id, opt.id, 'points', e.target.value)}
                              placeholder="Points"
                              className="w-24 h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/20 shadow-2xs text-center"
                            />
                            {options.length > 1 && (
                              <button
                                type="button"
                                onClick={() => handleRemoveDropdownOption(item.id, opt.id)}
                                className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-slate-200/50 rounded-lg transition-colors cursor-pointer"
                                title="Remove option"
                              >
                                <X size={14} />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>

                      {/* Dropdown Builder Footer */}
                      <div className="flex items-center justify-between pt-1.5 flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => handleAddDropdownOption(item.id)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100/70 text-xs font-medium text-slate-700 shadow-2xs transition-colors cursor-pointer"
                        >
                          <Plus size={13} />
                          <span>Add option</span>
                        </button>

                        <label className="inline-flex items-center gap-2 text-xs text-slate-600 font-medium cursor-pointer select-none">
                          <input
                            type="checkbox"
                            className="sr-only peer"
                            checked={!!item.dropdownConfig?.allowMultiple}
                            onChange={() => handleToggleAllowMultiple(item.id)}
                          />
                          <div className="w-4 h-4 rounded border border-slate-300 peer-checked:border-emerald-600 peer-checked:bg-emerald-600 flex items-center justify-center text-white transition-all shadow-2xs">
                            {item.dropdownConfig?.allowMultiple && <Check size={11} strokeWidth={3} />}
                          </div>
                          <span>Allow multiple selection</span>
                        </label>
                      </div>
                    </div>
                  )}

                  {/* + Add Field Button at bottom of card (matching media_1790256178080.png) */}
                  <div className="pt-1">
                    <button
                      type="button"
                      onClick={() => handleAddChecklist()}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 shadow-2xs transition-colors cursor-pointer font-heading"
                    >
                      <Plus size={13} />
                      <span>Add Field</span>
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* 4. SUB-TASKS SECTION (Directly below Checklist, matching media_1790256178080.png) */}
      <div className="pt-3 border-t border-slate-200/80 space-y-3">
        {(!subtasks || subtasks.length === 0) ? (
          <div>
            <button
              type="button"
              onClick={() => handleAddSubtask()}
              className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 transition-colors flex items-center gap-1.5 cursor-pointer font-heading"
            >
              <Plus size={16} />
              <span>Add Sub Task</span>
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-slate-900 font-heading flex items-center gap-1.5">
                <List size={14} className="text-blue-600" />
                <span>Sub Tasks</span>
                <span className="text-[10px] text-slate-400 font-mono">({subtasks.length})</span>
              </h4>
            </div>

            <div className="space-y-3">
              {subtasks.map((st, index) => {
                const subAssignees = Array.isArray(st.assignedTo) ? st.assignedTo : st.assignedTo ? [st.assignedTo] : []
                return (
                  <div
                    key={st.id}
                    className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-2xs space-y-3 relative transition-all"
                  >
                    {/* Header */}
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-800 font-heading">
                        Sub Task #{index + 1}
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => updateSubtask(st.id, { completed: !st.completed })}
                          className={`text-[10px] px-2 py-0.5 rounded font-semibold border transition-colors cursor-pointer ${
                            st.completed 
                              ? 'bg-emerald-100 text-emerald-700 border-emerald-200' 
                              : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                          }`}
                          title="Mark sub-task completed or to do"
                        >
                          {st.completed ? '✓ Completed' : 'To Do'}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemoveSubtask(st.id)}
                          className="text-slate-400 hover:text-rose-600 p-1 rounded-md transition-colors cursor-pointer"
                          title="Delete sub-task"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>

                    {/* Subtask Title */}
                    <div>
                      <input
                        type="text"
                        placeholder="Sub-task title: What needs to be done?"
                        value={st.title || ''}
                        onChange={(e) => updateSubtask(st.id, { title: e.target.value })}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 shadow-2xs transition-all font-body"
                      />
                    </div>

                    {/* Subtask Configuration Box: Assignee, Due Date & Reminder */}
                    <div className="space-y-2.5 pt-1 bg-slate-50/70 p-3 rounded-xl border border-slate-200/70">
                      {/* Subtask Assignee */}
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-[11px] font-semibold text-slate-700 font-heading flex items-center gap-1">
                            <User size={12} className="text-slate-500" />
                            <span>Assignee</span>
                          </label>
                          {subAssignees.length > 0 && (
                            <span className="text-[10px] text-blue-600 font-semibold">{subAssignees.length} selected</span>
                          )}
                        </div>

                        {/* Assignee Pills */}
                        <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto p-1 bg-white rounded-lg border border-slate-200">
                          {employees.map(emp => {
                            const isAssigned = subAssignees.includes(emp.id)
                            return (
                              <button
                                key={emp.id}
                                type="button"
                                onClick={() => {
                                  const updated = isAssigned
                                    ? subAssignees.filter(id => id !== emp.id)
                                    : [...subAssignees, emp.id]
                                  updateSubtask(st.id, { assignedTo: updated })
                                }}
                                className={`h-7 px-2 rounded-md text-[11px] font-medium transition-all flex items-center gap-1 border cursor-pointer ${
                                  isAssigned
                                    ? 'bg-blue-50 text-blue-700 border-blue-300 font-semibold'
                                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                                }`}
                              >
                                <div className={`w-4 h-4 rounded-full text-[8px] font-bold flex items-center justify-center shrink-0 ${
                                  isAssigned ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-700'
                                }`}>
                                  {getInitials(emp.name)}
                                </div>
                                <span className="truncate max-w-[100px]">{emp.name}</span>
                                {isAssigned && <Check size={10} className="text-blue-600 shrink-0" />}
                              </button>
                            )
                          })}
                          {employees.length === 0 && (
                            <span className="text-[10px] text-slate-400 italic p-1">No employees available</span>
                          )}
                        </div>
                      </div>

                      {/* Due Date & Reminder */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div>
                          <label className="text-[11px] font-semibold text-slate-700 font-heading block mb-1">
                            Due Date & Time
                          </label>
                          <div className="relative">
                            <DatePicker
                              selected={st.dueDate ? (st.dueDate.toDate ? st.dueDate.toDate() : new Date(st.dueDate)) : null}
                              onChange={(date) => updateSubtask(st.id, { dueDate: date })}
                              showTimeSelect
                              timeIntervals={15}
                              dateFormat="MMM d, yyyy h:mm aa"
                              wrapperClassName="w-full"
                              className="h-8 w-full rounded-lg border border-slate-200 bg-white px-2.5 pr-7 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-blue-500 cursor-pointer shadow-2xs"
                              placeholderText="Sub-task due date"
                            />
                            <CalendarIcon size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                          </div>
                        </div>

                        <div>
                          <label className="text-[11px] font-semibold text-slate-700 font-heading block mb-1">
                            Reminder
                          </label>
                          <div className="flex items-center gap-2 h-8 px-2.5 bg-white rounded-lg border border-slate-200 shadow-2xs">
                            <label className="relative inline-flex items-center cursor-pointer">
                              <input
                                type="checkbox"
                                className="sr-only peer"
                                checked={!!st.reminder?.enabled}
                                onChange={(e) => updateSubtask(st.id, {
                                  reminder: { ...(st.reminder || {}), enabled: e.target.checked }
                                })}
                              />
                              <div className="w-7 h-4 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-amber-500"></div>
                            </label>
                            <span className="text-[11px] text-slate-600 font-body">Alert assignee</span>
                          </div>
                        </div>
                      </div>

                      {/* Sub-task's Own Checklist */}
                      <div className="pt-1.5 border-t border-slate-200/70">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-[11px] font-semibold text-slate-700 font-heading flex items-center gap-1">
                            <CheckSquare size={12} className="text-emerald-600" />
                            <span>Sub-task Checklist ({st.checklists?.length || 0})</span>
                          </span>
                          <button
                            type="button"
                            onClick={() => handleAddSubtaskChecklist(st.id)}
                            className="text-[10px] font-semibold text-emerald-600 hover:text-emerald-700 flex items-center gap-0.5 cursor-pointer font-heading"
                          >
                            <Plus size={11} />
                            <span>Add item</span>
                          </button>
                        </div>

                        {st.checklists?.length > 0 && (
                          <div className="space-y-1.5">
                            {st.checklists.map((sc, scIdx) => (
                              <div key={sc.id || scIdx} className="flex items-center gap-2 bg-white p-1.5 rounded-lg border border-slate-200">
                                <input
                                  type="text"
                                  placeholder="Checklist item title..."
                                  value={sc.title || ''}
                                  onChange={(e) => handleUpdateSubtaskChecklist(st.id, sc.id, { title: e.target.value })}
                                  className="flex-1 text-xs text-slate-800 placeholder:text-slate-400 border-0 bg-transparent p-0 focus:ring-0"
                                />
                                <button
                                  type="button"
                                  onClick={() => handleRemoveSubtaskChecklist(st.id, sc.id)}
                                  className="text-slate-400 hover:text-rose-600 p-0.5 cursor-pointer"
                                >
                                  <X size={12} />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Single "+ Add another sub-task" button below the list */}
            <div className="pt-1">
              <button
                type="button"
                onClick={() => handleAddSubtask()}
                className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 transition-colors flex items-center gap-1.5 cursor-pointer font-heading"
              >
                <Plus size={15} />
                <span>Add another sub-task</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
