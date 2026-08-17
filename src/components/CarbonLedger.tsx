import { useEffect, useState } from 'react';

interface CarbonLedgerProps {
  token: string | null;
  currentUser: { id: string; name: string } | null;
  onClose: () => void;
}

interface CarbonLog { id: string; category: string; amount: number; co2Kg: number; note: string; date: string }
interface FactorDef { factor: number; unit: string; label: string }
type Factors = Record<string, FactorDef>;

export default function CarbonLedger({ token, currentUser, onClose }: CarbonLedgerProps) {
  const [logs, setLogs] = useState<CarbonLog[]>([]);
  const [factors, setFactors] = useState<Factors>({});
  const [week, setWeek] = useState(0);
  const [month, setMonth] = useState(0);
  const [total, setTotal] = useState(0);
  const [trees, setTrees] = useState(0);
  const [category, setCategory] = useState('car_km');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [msg, setMsg] = useState('');

  const headers = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  async function api(path: string, opts: RequestInit = {}) { const r = await fetch(path, { ...opts, headers }); return r.json(); }
  async function refresh() {
    const d = await api('/api/carbon');
    setLogs(d.logs || []); setFactors(d.factors || {}); setWeek(d.weekKg || 0); setMonth(d.monthKg || 0); setTotal(d.totalKg || 0); setTrees(d.treesNeeded || 0);
  }
  useEffect(() => { refresh(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  async function log() {
    setMsg('');
    const d = await api('/api/carbon/log', { method: 'POST', body: JSON.stringify({ category, amount: Number(amount), note }) });
    if (d.error) return setMsg(`⚠️ ${d.error}`);
    setMsg(`✅ ${d.def.label}: ${d.co2Kg} kg CO₂ logged.`);
    setAmount(''); setNote('');
    refresh();
  }

  return (
    <div className="fixed inset-0 z-[120] bg-[#141b2b]/65 dark:bg-[#05060c]/85 backdrop-blur-sm overflow-y-auto py-6 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-display font-bold text-lg text-[#3a342a] dark:text-zinc-100">Carbon Ledger</h2>
            <p className="text-[10px] text-[#8a8172] dark:text-zinc-400">Feature 189 — know your footprint, offset it with trees</p>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-white/80 dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 flex items-center justify-center text-[#5c5446] dark:text-zinc-300 hover:bg-[#ebdcca]/50" aria-label="Close">✕</button>
        </div>

        <div className="mb-4 grid grid-cols-3 gap-2">
          <div className="p-3 rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-[#fcfaf4] dark:bg-zinc-900 text-center">
            <div className="font-mono text-lg text-[#3a342a] dark:text-zinc-100">{week} kg</div>
            <div className="text-[9px] text-[#8a8172] uppercase tracking-wider">This week</div>
          </div>
          <div className="p-3 rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-[#fcfaf4] dark:bg-zinc-900 text-center">
            <div className="font-mono text-lg text-[#3a342a] dark:text-zinc-100">{month} kg</div>
            <div className="text-[9px] text-[#8a8172] uppercase tracking-wider">This month</div>
          </div>
          <div className="p-3 rounded-2xl border border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 text-center">
            <div className="font-mono text-lg text-emerald-700 dark:text-emerald-400">🌳 {trees}</div>
            <div className="text-[9px] text-[#8a8172] uppercase tracking-wider">Trees to offset</div>
          </div>
        </div>

        <div className="mb-4 p-4 rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-[#fcfaf4] dark:bg-zinc-900 space-y-2">
          <select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full px-3 py-2 rounded-xl bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 text-sm">
            {(Object.entries(factors) as [string, FactorDef][]).map(([k, v]) => <option key={k} value={k}>{v.label} ({v.factor} kg/{v.unit})</option>)}
          </select>
          <div className="grid grid-cols-2 gap-2">
            <input value={amount} onChange={(e) => setAmount(e.target.value)} type="number" min="0" step="0.1" placeholder={`Amount (${factors[category]?.unit || ''})`} className="px-3 py-2 rounded-xl bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 text-sm" />
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" className="px-3 py-2 rounded-xl bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 text-sm" />
          </div>
          <button onClick={log} className="w-full py-2 rounded-xl bg-emerald-700 dark:bg-emerald-600 hover:bg-emerald-800 text-white text-sm font-bold transition-all">Log activity</button>
          {msg && <div className="text-[11px] text-[#5c5446] dark:text-zinc-300">{msg}</div>}
        </div>

        <div className="space-y-1">
          {logs.length === 0 && <div className="text-center text-[11px] text-[#8a8172] py-6">No activity logged yet — start with today's commute.</div>}
          {logs.slice(0, 25).map((l) => (
            <div key={l.id} className="flex items-center gap-2 p-2 rounded-xl border border-[#ebdcca] dark:border-zinc-800 bg-[#fcfaf4] dark:bg-zinc-900">
              <span className="text-sm">{factors[l.category]?.label.split(' ')[0] || '🌿'}</span>
              <div className="flex-1 min-w-0">
                <span className="text-[11px] text-[#3a342a] dark:text-zinc-100">{factors[l.category]?.label || l.category}</span>
                {l.note && <span className="text-[9px] text-[#8a8172]"> · {l.note}</span>}
              </div>
              <span className={`font-mono text-[11px] ${l.co2Kg < 0 ? 'text-emerald-600' : 'text-[#3a342a] dark:text-zinc-200'}`}>{l.co2Kg} kg</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
