import React, { useState, useEffect, useRef } from 'react';

export default function TimePicker({ value, onChange, onClose }) {
  // value is in 24h format "HH:mm" — internally uses 12h display, saves 24h
  const [hour, setHour] = useState('05');
  const [minute, setMinute] = useState('00');
  const [period, setPeriod] = useState('AM');

  const pickerRef = useRef(null);
  const hourRef = useRef(null);
  const minuteRef = useRef(null);

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
    scrollToSelected(hourRef, hour);
  }, [hour]);

  useEffect(() => {
    scrollToSelected(minuteRef, minute);
  }, [minute]);

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

  // Build display string for header input preview
  const displayTime = `${hour}:${minute} ${period}`;

  return (
    <div
      ref={pickerRef}
      className="absolute top-[calc(100%+4px)] left-1/2 -translate-x-1/2 z-[9999] bg-white rounded-[10px] shadow-[0_8px_24px_rgba(0,0,0,0.15)] border border-gray-100 font-inter animate-in fade-in slide-in-from-top-2 duration-150"
      style={{ width: '170px', minWidth: '170px' }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header preview */}
      <div className="px-2.5 pt-2.5 pb-1.5 border-b border-gray-100">
        <div className="bg-gray-50 rounded-md px-2 py-1 text-[11px] font-semibold text-gray-700 border border-gray-200 text-center">
          {displayTime}
        </div>
      </div>

      {/* Scroll columns */}
      <div className="flex px-1.5 py-1.5 gap-0.5">
        {/* Hours column */}
        <div
          ref={hourRef}
          className="flex-1 overflow-y-auto max-h-[130px] rounded-md scroll-smooth"
          style={{ scrollbarWidth: 'none' }}
        >
          {hours.map(h => (
            <div
              key={h}
              data-val={h}
              onClick={() => setHour(h)}
              className={`text-center py-1 text-[11px] font-semibold rounded cursor-pointer transition-all select-none
                ${hour === h ? 'bg-blue-100 text-blue-700 font-bold' : 'text-gray-500 hover:bg-gray-50'}`}
            >
              {h}
            </div>
          ))}
        </div>

        {/* Minutes column */}
        <div
          ref={minuteRef}
          className="flex-1 overflow-y-auto max-h-[130px] rounded-md scroll-smooth"
          style={{ scrollbarWidth: 'none' }}
        >
          {minutes.map(m => (
            <div
              key={m}
              data-val={m}
              onClick={() => setMinute(m)}
              className={`text-center py-1 text-[11px] font-semibold rounded cursor-pointer transition-all select-none
                ${minute === m ? 'bg-blue-100 text-blue-700 font-bold' : 'text-gray-500 hover:bg-gray-50'}`}
            >
              {m}
            </div>
          ))}
        </div>

        {/* AM/PM column */}
        <div className="flex flex-col gap-1 justify-start pt-0.5">
          {['AM', 'PM'].map(p => (
            <div
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-2 py-1.5 rounded text-[10px] font-bold cursor-pointer transition-all select-none text-center
                ${period === p ? 'bg-blue-600 text-white shadow-sm' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
            >
              {p}
            </div>
          ))}
        </div>
      </div>

      {/* Footer: Now + OK */}
      <div className="flex items-center justify-between px-2.5 pb-2.5 pt-1 border-t border-gray-100">
        <button
          onClick={handleNow}
          className="text-[10px] font-semibold text-gray-500 hover:text-gray-800 transition-colors"
        >
          Now
        </button>
        <button
          onClick={handleOK}
          className="bg-blue-600 text-white text-[10px] font-bold px-3 py-1 rounded-md hover:bg-blue-700 transition-colors shadow-sm"
        >
          OK
        </button>
      </div>
    </div>
  );
}
