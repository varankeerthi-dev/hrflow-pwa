import React, { useState, useEffect, useRef } from 'react';
import { X } from 'lucide-react';

export default function TimePicker({ value, onChange, onClose }) {
  // value is in 24h format "HH:mm"
  const [hour, setHour] = useState('12');
  const [minute, setMinute] = useState('00');
  const [period, setPeriod] = useState('AM');
  const pickerRef = useRef(null);

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

  // Handle click outside to close
  useEffect(() => {
    function handleClickOutside(event) {
      if (pickerRef.current && !pickerRef.current.contains(event.target)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  const hours = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));
  const minutes = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));
  const periods = ['AM', 'PM'];

  const handleSave = (e) => {
    e.stopPropagation();
    let h = Number(hour);
    if (period === 'PM' && h !== 12) h += 12;
    if (period === 'AM' && h === 12) h = 0;
    const time24 = `${String(h).padStart(2, '0')}:${minute}`;
    onChange(time24);
    onClose();
  };

  return (
    <div 
      ref={pickerRef}
      className="absolute top-full left-0 mt-[6px] z-[1000] bg-white rounded-[12px] shadow-[0_10px_30px_rgba(0,0,0,0.12)] border border-gray-100 p-3 w-[260px] font-inter animate-in fade-in slide-in-from-top-2 duration-200"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex justify-center gap-2 mb-3">
        {/* Hours */}
        <div className="flex flex-col items-center gap-1">
          <span className="text-[9px] font-black text-gray-400 uppercase">Hr</span>
          <select 
            value={hour} 
            onChange={(e) => setHour(e.target.value)}
            className="h-[100px] w-14 border border-gray-100 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 p-1 text-[15px] font-bold text-gray-700 appearance-none bg-gray-50 text-center cursor-pointer"
            size={4}
          >
            {hours.map(h => <option key={h} value={h}>{h}</option>)}
          </select>
        </div>

        {/* Minutes */}
        <div className="flex flex-col items-center gap-1">
          <span className="text-[9px] font-black text-gray-400 uppercase">Min</span>
          <select 
            value={minute} 
            onChange={(e) => setMinute(e.target.value)}
            className="h-[100px] w-14 border border-gray-100 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 p-1 text-[15px] font-bold text-gray-700 appearance-none bg-gray-50 text-center cursor-pointer"
            size={4}
          >
            {minutes.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>

        {/* Period */}
        <div className="flex flex-col items-center gap-1">
          <span className="text-[9px] font-black text-gray-400 uppercase">AM/PM</span>
          <div className="flex flex-col gap-1 h-[100px] justify-center">
            {periods.map(p => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`w-12 py-1.5 rounded-lg text-[10px] font-black transition-all ${period === p ? 'bg-indigo-600 text-white shadow-md' : 'bg-gray-100 text-gray-400 hover:bg-gray-200'}`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      </div>

      <button
        onClick={handleSave}
        className="w-full h-[36px] bg-indigo-600 text-white font-black rounded-lg shadow-lg hover:bg-indigo-700 transition-all uppercase tracking-widest text-[10px]"
      >
        Confirm
      </button>
    </div>
  );
}
