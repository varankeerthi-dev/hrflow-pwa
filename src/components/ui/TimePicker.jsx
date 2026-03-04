import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';

export default function TimePicker({ value, onChange, onClose }) {
  // value is in 24h format "HH:mm"
  const [hour, setHour] = useState('12');
  const [minute, setMinute] = useState('00');
  const [period, setPeriod] = useState('AM');

  useEffect(() => {
    if (value && value.includes(':')) {
      const [h24, m] = value.split(':').map(Number);
      const p = h24 >= 12 ? 'PM' : 'AM';
      const h12 = h24 % 12 || 12;
      setHour(String(h12).padStart(2, '0'));
      setMinute(String(m).padStart(2, '0'));
      setPeriod(p);
    }
  }, [value]);

  const hours = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));
  const minutes = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));
  const periods = ['AM', 'PM'];

  const handleSave = () => {
    let h = Number(hour);
    if (period === 'PM' && h !== 12) h += 12;
    if (period === 'AM' && h === 12) h = 0;
    const time24 = `${String(h).padStart(2, '0')}:${minute}`;
    onChange(time24);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[320px] overflow-hidden font-inter">
        <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
          <h3 className="text-sm font-bold text-gray-800 uppercase tracking-widest">Select Time</h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-200 rounded-full transition-colors">
            <X size={18} className="text-gray-500" />
          </button>
        </div>

        <div className="p-6 flex justify-center gap-4 bg-white">
          {/* Hours */}
          <div className="flex flex-col items-center gap-2">
            <span className="text-[10px] font-black text-gray-400 uppercase">Hour</span>
            <select 
              value={hour} 
              onChange={(e) => setHour(e.target.value)}
              className="h-[120px] w-16 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 p-2 text-lg font-bold text-gray-700 appearance-none bg-gray-50 text-center"
              size={5}
            >
              {hours.map(h => <option key={h} value={h}>{h}</option>)}
            </select>
          </div>

          {/* Minutes */}
          <div className="flex flex-col items-center gap-2">
            <span className="text-[10px] font-black text-gray-400 uppercase">Min</span>
            <select 
              value={minute} 
              onChange={(e) => setMinute(e.target.value)}
              className="h-[120px] w-16 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 p-2 text-lg font-bold text-gray-700 appearance-none bg-gray-50 text-center"
              size={5}
            >
              {minutes.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>

          {/* Period */}
          <div className="flex flex-col items-center gap-2">
            <span className="text-[10px] font-black text-gray-400 uppercase">AM/PM</span>
            <div className="flex flex-col gap-2 h-[120px] justify-center">
              {periods.map(p => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={`w-14 py-2 rounded-lg text-xs font-black transition-all ${period === p ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200' : 'bg-gray-100 text-gray-400 hover:bg-gray-200'}`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="p-4 bg-gray-50 border-t border-gray-100">
          <button
            onClick={handleSave}
            className="w-full h-[44px] bg-indigo-600 text-white font-black rounded-xl shadow-xl hover:bg-indigo-700 transition-all uppercase tracking-[0.1em] text-xs"
          >
            Confirm Time
          </button>
        </div>
      </div>
    </div>
  );
}
