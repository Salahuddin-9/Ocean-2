import { useEffect, useState } from 'react';

interface IrrigationSchedulerProps {
  token: string | null;
  currentUser: { id: string; name: string } | null;
  onClose: () => void;
}

interface Field {
  id: string; name: string; crop: string; areaAcres: number; waterNeedMmPerDay: number;
  lastWateredAt: number | null; expectedRain: number; daysSinceWatered: number;
  daysUntilWater: number; nextWatering: string; dueSoon: boolean; overdue?: boolean;
}
interface DayForecast { date: string; rainMm: number; tempC: number; condition: string }

export default function IrrigationScheduler({ token, currentUser, onClose }: IrrigationSchedulerProps) {
  const [fields, setFields] = useState<Field[]>([]);
  const [forecast, setForecast] = useState<DayForecast[]>([]);
  const [name, setName] = useState('');
  const [crop, setCrop] = useState('');
  const [need, setNeed] = useState('5');
  const [msg, setMsg] = useState('');

  const headers = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  async function api(path: string, opts: RequestInit = {}) { const r = await fetch(path, { ...opts, headers }); return r.json(); }
  async function refresh() { const d = await api('/api/agri/irrigation'); setFields(d.fields || []); setForecast(d.forecast || []); }
  useEffect(() => { refresh(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  async function add() {
    setMsg('');
    const d = await api('/api/agri/irrigation', { method: 'POST', body: JSON.stringify({ name, crop, waterNeedMmPerDay: Number(need) }) });
    if (d.error) return setMsg(`⚠️ ${d.error}`);
    setMsg(`✅ Field "${d.field.name}" registered (${d.field.crop}).`);
    setName(''); setCrop(''); setNeed('5');
    refresh();
  }

  async function water(f: Field) {
    const d = await api(`/api/agri/irrigation/${f.id}/water`, { method: 'POST', body: '{}' });
    if (d.error) return setMsg(`⚠️ ${d.error}`);
    setMsg(`✅ ${d.note}`);
    refresh();
  }

  return (
    <div className="fixed inset-0 z-[120] bg-[#f6f1e7]/98 dark:bg-zinc-950/98 backdrop-blur-sm overflow-y-auto py-6 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-display font-bold text-lg text-[#3a342a] dark:text-zinc-100">Irrigation Scheduler</h2>
            <p className="text-[10px] text-[#8a8172] dark:text-zinc-400">Feature 187 — watering plan from crop need + rainfall</p>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-white/80 dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 flex items-center justify-center text-[#5c5446] dark:text-zinc-300 hover:bg-[#ebdcca]/50" aria-label="Close">✕</button>
        </div>

        <div className="mb-3 p-3 rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-[#fcfaf4] dark:bg-zinc-900">
          <div className="text-[10px] font-bold text-[#8a8172] uppercase tracking-wider mb-1.5">5-day forecast</div>
          <div className="flex gap-1.5 overflow-x-auto">
            {forecast.map((d) => (
              <div key={d.date} className="min-w-[64px] px-2 py-1.5 rounded-xl bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 text-center">
                <div className="text-[9px] text-[#8a8172]">{d.date.slice(5)}</div>
                <div className="text-[13px]">{d.condition === 'Rainy' ? '🌧️' : d.condition === 'Drizzle' ? '🌦️' : '☀️'}</div>
                <div className="text-[9px] font-mono text-[#3a342a] dark:text-zinc-200">{d.tempC}°C</div>
                {d.rainMm > 0 && <div className="text-[9px] font-mono text-blue-600 dark:text-blue-400">{d.rainMm}mm</div>}
              </div>
            ))}
          </div>
        </div>

        <div className="mb-4 p-4 rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-[#fcfaf4] dark:bg-zinc-900 space-y-2">
          <div className="grid grid-cols-3 gap-2">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Field name" className="px-3 py-2 rounded-xl bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 text-sm" />
            <input value={crop} onChange={(e) => setCrop(e.target.value)} placeholder="Crop" className="px-3 py-2 rounded-xl bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 text-sm" />
            <input value={need} onChange={(e) => setNeed(e.target.value)} type="number" min="1" max="20" placeholder="mm/day need" className="px-3 py-2 rounded-xl bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 text-sm" />
          </div>
          <button onClick={add} className="w-full py-2 rounded-xl bg-emerald-700 dark:bg-emerald-600 hover:bg-emerald-800 text-white text-sm font-bold transition-all">Register field</button>
          {msg && <div className="text-[11px] text-[#5c5446] dark:text-zinc-300">{msg}</div>}
        </div>

        <div className="space-y-2">
          {fields.length === 0 && <div className="text-center text-[11px] text-[#8a8172] py-8">No fields yet — register your first one above.</div>}
          {fields.map((f) => (
            <div key={f.id} className="p-3 rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-[#fcfaf4] dark:bg-zinc-900 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="font-bold text-[12px] text-[#3a342a] dark:text-zinc-100 truncate">{f.name} <span className="text-[9px] text-[#8a8172] font-normal">({f.crop})</span></div>
                <div className="text-[10px] text-[#8a8172] font-mono">{f.areaAcres} acre(s) · needs {f.waterNeedMmPerDay}mm/day · 🌧 {f.expectedRain}mm expected</div>
                <div className={`text-[10px] font-bold ${f.overdue ? 'text-rose-600 dark:text-rose-400' : f.dueSoon ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-700 dark:text-emerald-400'}`}>
                  {f.overdue ? '⚠️ Overdue — water today!' : `Next watering: ${f.nextWatering} (${f.daysUntilWater} day(s))`}
                </div>
              </div>
              <button onClick={() => water(f)} className="px-3 py-1.5 rounded-lg bg-sky-700 hover:bg-sky-800 text-white text-[11px] font-bold">💧 Watered</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
