import React, { useState } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { useEmployees } from '../../hooks/useEmployees'
import { FileText, Award, BadgeInfo, AlertTriangle, UserMinus, Download, Printer, Search, ChevronRight } from 'lucide-react'
import Modal from '../ui/Modal'

export default function HRLettersTab() {
  const { user } = useAuth()
  const { employees } = useEmployees(user?.orgId)
  const [activeSub, setActiveSub] = useState('promotion')
  const [selectedEmp, setSelectedEmp] = useState('')
  const [showPreview, setShowPreview] = useState(false)
  
  const letterTypes = [
    { id: 'promotion', label: 'Promotion', icon: <Award size={16} />, color: 'green' },
    { id: 'bonafide', label: 'Bonafide', icon: <BadgeInfo size={16} />, color: 'blue' },
    { id: 'notice', label: 'Notice Period', icon: <AlertTriangle size={16} />, color: 'amber' },
    { id: 'termination', label: 'Termination', icon: <UserMinus size={16} />, color: 'red' }
  ]

  const currentEmp = employees.find(e => e.id === selectedEmp)

  const renderPreview = () => {
    if (!currentEmp) return <div className="py-20 text-center text-gray-300 font-medium uppercase tracking-widest text-lg opacity-40 italic font-inter">Resource selection required for rendering</div>
    
    return (
      <div className="bg-white p-16 shadow-2xl rounded-sm border border-gray-100 max-w-3xl mx-auto min-h-[842px] font-serif text-gray-800 leading-relaxed relative animate-in fade-in zoom-in-95 duration-500">
        <div className="absolute top-0 left-0 w-full h-2 bg-indigo-600"></div>
        
        <div className="flex justify-between items-start mb-16">
          <div>
            <h2 className="text-2xl font-black uppercase tracking-tighter text-gray-900 font-inter">{user?.orgName}</h2>
            <p className="text-[10px] uppercase font-bold text-indigo-500 mt-1 tracking-widest font-inter">Human Resources Division</p>
          </div>
          <div className="text-right text-[11px] font-bold text-gray-400 uppercase tracking-widest font-inter">
            <p>Confidential</p>
            <p>Ref: HR/{activeSub.toUpperCase()}/{currentEmp.empCode}</p>
          </div>
        </div>
        
        <div className="flex justify-between mb-12">
          <p className="font-bold text-gray-900">Dated: {new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}</p>
        </div>

        <div className="mb-12 space-y-1">
          <p className="font-black text-gray-400 uppercase text-[10px] mb-2 tracking-widest font-inter">Recipient</p>
          <p className="font-bold text-gray-900 uppercase text-lg leading-none">{currentEmp.name}</p>
          <p className="font-medium text-gray-600">{currentEmp.department} Department</p>
          <p className="font-medium text-gray-600">Employee Code: {currentEmp.empCode}</p>
        </div>

        <h3 className="text-center font-black underline mb-12 uppercase tracking-widest text-gray-900 decoration-indigo-500 decoration-2 underline-offset-8">
          Subject: {letterTypes.find(t => t.id === activeSub).label} Directive
        </h3>

        <div className="space-y-6 text-[15px] text-gray-700 text-justify">
          {activeSub === 'promotion' && (
            <p>We are extremely pleased to formally communicate your promotion within the organization. This decision comes as a direct result of your exemplary performance, dedication, and the significant impact you have made on the {currentEmp.department} department. We look forward to your continued success in this new capacity.</p>
          )}
          {activeSub === 'bonafide' && (
            <p>This is to formally certify that Mr./Ms. {currentEmp.name} is a bonafide permanent employee of {user?.orgName}. They have been associated with the organization as a {currentEmp.department} professional since their commencement on {currentEmp.joinedDate || 'the original joining date'}. Their conduct during this tenure has been satisfactory.</p>
          )}
          {activeSub === 'notice' && (
            <p>This document serves as an official communication regarding your resignation/termination notice period. As per the established organizational policy, you are required to serve the stipulated notice duration. Please coordinate with the HR department for the formal handover process and exit formalities.</p>
          )}
          {activeSub === 'termination' && (
            <p>We regret to inform you that your employment agreement with {user?.orgName} is being terminated effective immediately. This decision has been reached following a comprehensive review of performance/conduct parameters. You are requested to return all company assets and complete the clearance process by the end of the business day.</p>
          )}
          <p>We extend our best wishes for your future professional endeavors and appreciate the time dedicated to the organization.</p>
        </div>

        <div className="mt-24 pt-8 border-t border-gray-50 font-inter">
          <p className="font-black text-gray-900 uppercase tracking-widest">For {user?.orgName},</p>
          <div className="h-20"></div>
          <p className="font-bold text-gray-900 uppercase border-b-2 border-gray-900 inline-block">Authorized HR Signatory</p>
          <p className="text-[10px] text-gray-400 font-bold uppercase mt-4 tracking-tighter italic">This document is digitally authenticated and system-generated.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8 font-inter">
      {/* Category Selection Card */}
      <div className="bg-white p-6 rounded-[12px] shadow-sm border border-gray-100 flex justify-between items-center">
        <div className="flex bg-gray-100 p-1 rounded-lg">
          {letterTypes.map(t => (
            <button
              key={t.id}
              onClick={() => { setActiveSub(t.id); setShowPreview(false); }}
              className={`flex items-center gap-2 px-5 py-2 rounded-md text-[13px] font-bold transition-all ${activeSub === t.id ? 'bg-white shadow-sm text-gray-900' : 'text-gray-400 hover:text-gray-600'}`}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>
        <div className="h-8 w-px bg-gray-100"></div>
        <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">Letter Generator v2.0</p>
      </div>

      <div className="bg-white p-8 rounded-[12px] border border-gray-100 shadow-sm flex flex-wrap gap-8 items-end no-print">
        <div className="flex-1 min-w-[300px]">
          <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-2 px-1">Resource Search</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <select 
              value={selectedEmp} 
              onChange={e => { setSelectedEmp(e.target.value); setShowPreview(false); }}
              className="w-full h-[44px] pl-10 pr-4 border border-gray-200 rounded-lg text-sm font-bold bg-gray-50 focus:ring-2 focus:ring-indigo-500 outline-none cursor-pointer transition-all"
            >
              <option value="">Search employee roster...</option>
              {employees.map(e => <option key={e.id} value={e.id}>{e.name} ({e.empCode})</option>)}
            </select>
          </div>
        </div>
        <button 
          onClick={() => setShowPreview(true)}
          disabled={!selectedEmp}
          className="h-[44px] px-8 bg-indigo-600 text-white font-black rounded-lg uppercase tracking-widest text-[12px] shadow-lg hover:bg-indigo-700 disabled:opacity-50 transition-all flex items-center gap-3"
        >
          <FileText size={18} /> Generate Draft
        </button>
      </div>

      {showPreview && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="flex justify-center gap-4 no-print pb-4">
            <button onClick={() => window.print()} className="h-[40px] px-6 bg-white border border-gray-200 text-gray-600 rounded-lg text-[12px] font-black uppercase tracking-widest flex items-center gap-2 hover:bg-gray-50 transition-all shadow-sm">
              <Printer size={16} /> Hard Copy
            </button>
            <button className="h-[40px] px-6 bg-indigo-50 text-indigo-600 rounded-lg text-[12px] font-black uppercase tracking-widest flex items-center gap-2 hover:bg-indigo-100 transition-all shadow-sm">
              <Download size={16} /> Digital PDF
            </button>
          </div>
          <div className="pb-20">
            {renderPreview()}
          </div>
        </div>
      )}
    </div>
  )
}
