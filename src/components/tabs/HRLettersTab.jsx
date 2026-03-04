import { useState } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { useEmployees } from '../../hooks/useEmployees'
import { FileText, Award, BadgeInfo, AlertTriangle, UserMinus, Download, Printer, Search } from 'lucide-react'
import Modal from '../ui/Modal'

export default function HRLettersTab() {
  const { user } = useAuth()
  const { employees } = useEmployees(user?.orgId)
  const [activeSub, setActiveSub] = useState('promotion')
  const [selectedEmp, setSelectedEmp] = useState('')
  const [showPreview, setShowPreview] = useState(false)
  
  const letterTypes = [
    { id: 'promotion', label: 'Promotion Letter', icon: <Award size={14} />, color: 'green' },
    { id: 'bonafide', label: 'Bonafide Letter', icon: <BadgeInfo size={14} />, color: 'blue' },
    { id: 'notice', label: 'Notice Period', icon: <AlertTriangle size={14} />, color: 'amber' },
    { id: 'termination', label: 'Termination', icon: <UserMinus size={14} />, color: 'red' }
  ]

  const currentEmp = employees.find(e => e.id === selectedEmp)

  const renderPreview = () => {
    if (!currentEmp) return <div className="p-10 text-center text-gray-400 italic">Select an employee to preview the letter</div>
    
    return (
      <div className="bg-white p-12 shadow-2xl border border-gray-100 max-w-2xl mx-auto min-h-[600px] font-serif text-gray-800 leading-relaxed">
        <div className="text-center mb-10">
          <h2 className="text-2xl font-bold uppercase tracking-widest">{user?.orgName}</h2>
          <p className="text-[10px] uppercase font-bold text-gray-400 mt-1">Official Document</p>
        </div>
        
        <div className="flex justify-between mb-8">
          <div>
            <p className="font-bold">Date: {new Date().toLocaleDateString()}</p>
            <p className="font-bold">Ref: HR/{activeSub.toUpperCase()}/{currentEmp.empCode}</p>
          </div>
        </div>

        <div className="mb-8">
          <p className="font-bold">To,</p>
          <p className="font-bold">{currentEmp.name}</p>
          <p>{currentEmp.department} Department</p>
          <p>Employee ID: {currentEmp.empCode}</p>
        </div>

        <h3 className="text-center font-bold underline mb-8 uppercase tracking-wide">
          Subject: {letterTypes.find(t => t.id === activeSub).label}
        </h3>

        <div className="space-y-4 text-sm">
          {activeSub === 'promotion' && (
            <p>We are pleased to inform you that you have been promoted. Your performance has been exemplary and we value your contribution to {user?.orgName}.</p>
          )}
          {activeSub === 'bonafide' && (
            <p>This is to certify that {currentEmp.name} is a bonafide employee of {user?.orgName} working as {currentEmp.department} personnel since {currentEmp.joinedDate || 'joining'}.</p>
          )}
          {activeSub === 'notice' && (
            <p>This letter serves as formal notice regarding your notice period requirements as per company policy.</p>
          )}
          {activeSub === 'termination' && (
            <p>We regret to inform you that your employment with {user?.orgName} is being terminated effective immediately.</p>
          )}
          <p>We wish you the very best in your future endeavors.</p>
        </div>

        <div className="mt-20">
          <p className="font-bold">For {user?.orgName},</p>
          <div className="h-12"></div>
          <p className="font-bold underline">Authorized Signatory</p>
          <p className="text-[10px] text-gray-400 italic">This is a system generated letter.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 font-inter">
      <div className="flex bg-gray-50 p-1 rounded-xl border border-gray-200 w-fit shadow-sm">
        {letterTypes.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveSub(t.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${activeSub === t.id ? 'bg-white shadow-sm text-gray-900 border border-gray-100' : 'text-gray-400 hover:text-gray-600'}`}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-4 items-end bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
        <div className="flex-1 min-w-[250px]">
          <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 px-1">Select Employee</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
            <select 
              value={selectedEmp} 
              onChange={e => setSelectedEmp(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 border rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500 bg-gray-50/50"
            >
              <option value="">Search Employee...</option>
              {employees.map(e => <option key={e.id} value={e.id}>{e.name} ({e.empCode})</option>)}
            </select>
          </div>
        </div>
        <button 
          onClick={() => setShowPreview(true)}
          disabled={!selectedEmp}
          className="bg-indigo-600 text-white font-black px-8 py-2.5 rounded-xl uppercase tracking-widest text-[10px] shadow-lg hover:bg-indigo-700 disabled:opacity-50 transition-all flex items-center gap-2"
        >
          <FileText size={14} /> Preview Letter
        </button>
      </div>

      {showPreview && (
        <div className="space-y-4">
          <div className="flex justify-end gap-2">
            <button onClick={() => window.print()} className="bg-gray-100 text-gray-600 px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest flex items-center gap-2 hover:bg-gray-200 transition-all">
              <Printer size={14} /> Print
            </button>
            <button className="bg-indigo-50 text-indigo-600 px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest flex items-center gap-2 hover:bg-indigo-100 transition-all">
              <Download size={14} /> Download PDF
            </button>
          </div>
          {renderPreview()}
        </div>
      )}
    </div>
  )
}
