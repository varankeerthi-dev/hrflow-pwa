import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

export default function TimePicker({ value, onChange, onClose, anchorEl }) {
  // value is in 24h format "HH:mm" — internally uses 12h display, saves 24h
  const [hour, setHour] = useState('09');
  const [minute, setMinute] = useState('00');
  const [period, setPeriod] = useState('AM');
  const [coords, setCoords] = useState({ top: 0, left: 0, origin: 'top' });

  const pickerRef = useRef(null);
  const hourRef = useRef(null);
  const minuteRef = useRef(null);

  // Calculate position relative to anchorEl
  useEffect(() => {
    if (anchorEl) {
      const rect = anchorEl.getBoundingClientRect();
      
      // Determine if it should open above or below
      let top = rect.bottom + 4;
      let left = rect.left + (rect.width / 2) - 85; // 85 is half of picker width (170)
      let origin = 'top';

      // Prevent going off screen right
      if (left + 170 > window.innerWidth) left = window.innerWidth - 180;
      if (left < 10) left = 10;

      // If near bottom, open above
      if (top + 250 > window.innerHeight) {
        top = rect.top - 240;
        origin = 'bottom';
      }

      setCoords({ top, left, origin });
    }
  }, [anchorEl]);

  // Parse incoming 24h value to 12h state
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

  // Scroll selected item into view
  useEffect(() => {
    const timer = setTimeout(() => {
      scrollToSelected(hourRef, hour);
      scrollToSelected(minuteRef, minute);
    }, 50);
    return () => clearTimeout(timer);
  }, [hour, minute]);

  function scrollToSelected(ref, val) {
    if (!ref.current) return;
    const el = ref.current.querySelector(`[data-val="${val}"]`);
    if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  // Click outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (pickerRef.current && !pickerRef.current.contains(event.target)) {
        onClose();
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  const hours = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));
  const minutes = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));

  const handleOK = (e) => {
    e.stopPropagation();
    let h = Number(hour);
    if (period === 'PM' && h !== 12) h += 12;
    if (period === 'AM' && h === 12) h = 0;
    const time24 = `${String(h).padStart(2, '0')}:${minute}`;
    onChange(time24);
    onClose();
  };

  const handleNow = (e) => {
    e.stopPropagation();
    const now = new Date();
    const h24 = now.getHours();
    const m = now.getMinutes();
    const p = h24 >= 12 ? 'PM' : 'AM';
    const h12 = h24 % 12 || 12;
    setHour(String(h12).padStart(2, '0'));
    setMinute(String(m).padStart(2, '0'));
    setPeriod(p);
  };

  const pickerContent = (
    <div
      ref={pickerRef}
      className={`fixed z-[9999] bg-white rounded-xl shadow-[0_20px_60px_rgba(0,0,0,0.35)] border border-zinc-200 font-['Roboto',sans-serif] animate-in fade-in zoom-in-95 duration-200 origin-${coords.origin}`}
      style={{ 
        width: '170px', 
        top: coords.top, 
        left: coords.left 
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header preview */}
      <div className="px-3 pt-3 pb-2 border-b border-zinc-100">
        <div className="bg-zinc-900 text-white rounded-lg px-2 py-1.5 text-[12px] font-black text-center shadow-inner tracking-wider">
          {hour}:{minute} {period}
        </div>
      </div>

      {/* Scroll columns */}
      <div className="flex px-1.5 py-1.5 gap-1">
        {/* Hours column */}
        <div ref={hourRef} className="flex-1 overflow-y-auto h-[160px] rounded-lg custom-scrollbar">
          {hours.map(h => (
            <div key={h} data-val={h} onClick={() => setHour(h)} className={`text-center py-1.5 text-[11px] font-bold rounded cursor-pointer mb-0.5 transition-all ${hour === h ? 'bg-indigo-600 text-white shadow-md' : 'text-zinc-500 hover:bg-zinc-100'}`}>
              {h}
            </div>
          ))}
        </div>

        {/* Minutes column */}
        <div ref={minuteRef} className="flex-1 overflow-y-auto h-[160px] rounded-lg custom-scrollbar">
          {minutes.map(m => (
            <div key={m} data-val={m} onClick={() => setMinute(m)} className={`text-center py-1.5 text-[11px] font-bold rounded cursor-pointer mb-0.5 transition-all ${minute === m ? 'bg-indigo-600 text-white shadow-md' : 'text-zinc-500 hover:bg-zinc-100'}`}>
              {m}
            </div>
          ))}
        </div>

        {/* AM/PM column */}
        <div className="flex flex-col gap-1.5 pt-1">
          {['AM', 'PM'].map(p => (
            <div key={p} onClick={() => setPeriod(p)} className={`w-8 h-8 flex items-center justify-center rounded-lg text-[10px] font-black cursor-pointer transition-all shadow-sm ${period === p ? 'bg-zinc-800 text-white' : 'bg-zinc-100 text-zinc-400 hover:bg-zinc-200'}`}>
              {p}
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-3 pb-3 pt-2 border-t border-zinc-100 bg-zinc-50/50 rounded-b-xl">
        <button onClick={handleNow} className="text-[10px] font-black text-zinc-400 hover:text-zinc-900 uppercase tracking-widest transition-colors">Now</button>
        <button onClick={handleOK} className="bg-emerald-600 text-white text-[10px] font-black px-4 py-1.5 rounded-lg hover:bg-emerald-700 transition-all shadow-md uppercase tracking-wider">OK</button>
      </div>
    </div>
  );

  return createPortal(pickerContent, document.body);
}
