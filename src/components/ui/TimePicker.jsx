import React, { useState, useEffect, useRef } from 'react';

export default function TimePicker({ value, onChange, onClose, variant = 'default' }) {
  // value is in 24h format "HH:mm" — internally uses 12h display, saves 24h
  const [hour, setHour] = useState('09');
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
  const isAttendancePicker = variant === 'attendance';

  const formatTime24 = (nextHour = hour, nextMinute = minute, nextPeriod = period) => {
    let h = Number(nextHour);
    if (nextPeriod === 'PM' && h !== 12) h += 12;
    if (nextPeriod === 'AM' && h === 12) h = 0;
    return `${String(h).padStart(2, '0')}:${nextMinute}`;
  };

  const handleOK = (e) => {
    e.stopPropagation();
    onChange(formatTime24());
    setTimeout(onClose, 0);
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

  if (isAttendancePicker) {
    return (
      <div
        ref={pickerRef}
        className="absolute top-full left-1/2 z-50 mt-2 w-[286px] -translate-x-1/2 overflow-hidden rounded-[12px] border border-gray-100 bg-white font-inter shadow-[0_12px_30px_rgba(15,23,42,0.14)] animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Select time</p>
            <p className="mt-0.5 text-sm font-semibold text-slate-900">{hour}:{minute} {period}</p>
          </div>
          <div className="rounded-lg bg-indigo-50 px-2.5 py-1 text-[11px] font-semibold text-indigo-700">{period}</div>
        </div>

        <div className="grid grid-cols-[1fr_1fr_60px] gap-2 px-3 py-3">
          <div>
            <p className="px-1 pb-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">Hour</p>
            <div ref={hourRef} role="listbox" aria-label="Hour" className="h-[168px] overflow-y-auto rounded-[10px] border border-slate-100 bg-slate-50 p-1 custom-scrollbar">
              {hours.map(h => (
                <button type="button" key={h} data-val={h} onClick={() => setHour(h)} aria-pressed={hour === h} className={`mb-0.5 block min-h-8 w-full rounded-lg text-center text-[12px] font-semibold transition last:mb-0 ${hour === h ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:bg-white hover:text-slate-950'}`}>
                  {h}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="px-1 pb-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">Minute</p>
            <div ref={minuteRef} role="listbox" aria-label="Minute" className="h-[168px] overflow-y-auto rounded-[10px] border border-slate-100 bg-slate-50 p-1 custom-scrollbar">
              {minutes.map(m => (
                <button type="button" key={m} data-val={m} onClick={() => setMinute(m)} aria-pressed={minute === m} className={`mb-0.5 block min-h-8 w-full rounded-lg text-center text-[12px] font-semibold transition last:mb-0 ${minute === m ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:bg-white hover:text-slate-950'}`}>
                  {m}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="px-1 pb-1.5 text-center text-[10px] font-bold uppercase tracking-widest text-slate-400">Period</p>
            <div className="flex h-[168px] flex-col gap-2 rounded-[10px] border border-slate-100 bg-slate-50 p-1">
              {['AM', 'PM'].map(p => (
                <button type="button" key={p} onClick={() => setPeriod(p)} aria-pressed={period === p} className={`flex min-h-0 flex-1 items-center justify-center rounded-lg text-[11px] font-bold transition ${period === p ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-500 hover:bg-white hover:text-slate-900'}`}>
                  {p}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/80 px-4 py-3">
          <button type="button" onClick={handleNow} className="text-[11px] font-semibold text-slate-500 transition-colors hover:text-slate-900">Now</button>
          <button type="button" onClick={handleOK} className="rounded-lg bg-emerald-600 px-4 py-2 text-[11px] font-semibold text-white transition-colors hover:bg-emerald-700">Apply time</button>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={pickerRef}
      className="absolute top-full left-1/2 -translate-x-1/2 mt-1 z-50 bg-white rounded-xl shadow-lg border border-zinc-200 font-['Roboto',sans-serif] animate-in fade-in zoom-in-95 duration-200"
      style={{ width: '170px' }}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* Header preview */}
      <div className="px-3 pt-3 pb-2 border-b border-zinc-100">
        <div className="bg-zinc-900 text-white rounded-lg px-2 py-1.5 text-[12px] font-black text-center shadow-inner tracking-wider">
          {hour}:{minute} {period}
        </div>
      </div>

      {/* Scroll columns */}
      <div className="flex px-1 py-1 gap-0.5">
        {/* Hours column */}
        <div ref={hourRef} className="flex-1 overflow-y-auto h-[120px] rounded-lg custom-scrollbar">
          {hours.map(h => (
              <button type="button" key={h} data-val={h} onClick={() => setHour(h)} aria-pressed={hour === h} className={`block w-full text-center py-0.5 text-[11px] font-bold rounded cursor-pointer transition ${hour === h ? 'bg-indigo-600 text-white shadow-md' : 'text-zinc-500 hover:bg-zinc-100'}`}>
                {h}
              </button>
          ))}
        </div>

        {/* Minutes column */}
        <div ref={minuteRef} className="flex-1 overflow-y-auto h-[120px] rounded-lg custom-scrollbar">
          {minutes.map(m => (
              <button type="button" key={m} data-val={m} onClick={() => setMinute(m)} aria-pressed={minute === m} className={`block w-full text-center py-0.5 text-[11px] font-bold rounded cursor-pointer transition ${minute === m ? 'bg-indigo-600 text-white shadow-md' : 'text-zinc-500 hover:bg-zinc-100'}`}>
                {m}
              </button>
          ))}
        </div>

        {/* AM/PM column */}
        <div className="flex flex-col gap-1.5 pt-1">
          {['AM', 'PM'].map(p => (
            <button type="button" key={p} onClick={() => setPeriod(p)} aria-pressed={period === p} className={`w-8 h-8 flex items-center justify-center rounded-lg text-[10px] font-black cursor-pointer transition shadow-sm ${period === p ? 'bg-zinc-800 text-white' : 'bg-zinc-100 text-zinc-400 hover:bg-zinc-200'}`}>
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-3 pb-3 pt-2 border-t border-zinc-100 bg-zinc-50/50 rounded-b-xl">
        <button type="button" onClick={handleNow} className="text-[10px] font-black text-zinc-400 hover:text-zinc-900 uppercase tracking-widest transition-colors">Now</button>
        <button type="button" onClick={handleOK} className="bg-emerald-600 text-white text-[10px] font-black px-4 py-1.5 rounded-lg hover:bg-emerald-700 transition shadow-md uppercase tracking-wider">OK</button>
      </div>
    </div>
  );
}
