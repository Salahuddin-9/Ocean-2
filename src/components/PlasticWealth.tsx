import { useEffect, useState } from 'react';

interface PlasticWealthProps {
  token: string | null;
  currentUser: { id: string; name: string } | null;
  onClose: () => void;
}

interface Point { id: string; name: string; location: string; accepts: string }
interface Collection { id: string; userId: string; userName: string; pointId: string | null; kg: number; status: 'pending' | 'verified'; earned: number; at: number }

export default function PlasticWealth({ token, currentUser, onClose }: PlasticWealthProps) {
  const [points, setPoints] = useState<Point[]>([]);
  const [mine, setMine] = useState<Collection[]>([]);
  const [stats, setStats] = useState({ verifiedKg: 0, totalEarned: 0 });
  const [pointId, setPointId] = useState('');
  const [kg, setKg] = useState('');
  const [msg, setMsg] = useState('');

  const headers = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  async function api(path: string, opts: RequestInit = {}) { const r = await fetch(path, { ...opts, headers }); return r.json(); }
  async function refresh() { const d = await api('/api/agri/plastic'); setPoints(d.points || []); setMine(d.mine || []); setStats(d.stats || { verifiedKg: 0, totalEarned: 0 }); }
  useEffect(() => { refresh(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  async function report() {
    setMsg('');
    const d = await api('/api/agri/plastic', { method: 'POST', body: JSON.stringify({ pointId: pointId || undefined, kg: Number(kg) }) });
    if (d.error) return setMsg(`⚠️ ${d.error}`);
    setMsg(`✅ ${d.note}`);
    setKg('');
    refresh();
  }

  async function verify(c: Collection) {
    const d = await api(`/api/agri/plastic/${c.id}/verify`, { method: 'POST', body: '{}' });
    if (d.error) return setMsg(`⚠️ ${d.error}`);
    setMsg(`✅ ${d.note} Balance ${d.balance} BDT.`);
    refresh();
  }

  const mineId = currentUser?.id;

  return (
    <div className="fixed inset-0 z-[120] bg-[#141b2b]/65 dark:bg-[#05060c]/85 backdrop-blur-sm overflow-y-auto py-6 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-display font-bold text-lg text-[#3a342a] dark:text-zinc-100">Plastic Waste-to-Wealth</h2>
            <p className="text-[10px] text-[#8a8172] dark:text-zinc-400">Feature 191 — collect plastic, earn 5 BDT per verified kg</p>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-white/80 dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 flex items-center justify-center text-[#5c5446] dark:text-zinc-300 hover:bg-[#ebdcca]/50" aria-label="Close">✕</button>
        </div>

        <div className="mb-3 grid grid-cols-2 gap-2">
          <div className="p-3 rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-[#fcfaf4] dark:bg-zinc-900 text-center">
            <div className="font-mono text-lg text-[#3a342a] dark:text-zinc-100">{stats.verifiedKg} kg</div>
            <div className="text-[9px] text-[#8a8172] uppercase tracking-wider">Verified recycled</div>
          </div>
          <div className="p-3 rounded-2xl border border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 text-center">
            <div className="font-mono text-lg text-emerald-700 dark:text-emerald-400">🪙 {stats.totalEarned}</div>
            <div className="text-[9px] text-[#8a8172] uppercase tracking-wider">BDT earned by community</div>
          </div>
        </div>

        <div className="mb-4 p-4 rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-[#fcfaf4] dark:bg-zinc-900 space-y-2">
          <select value={pointId} onChange={(e) => setPointId(e.target.value)} className="w-full px-3 py-2 rounded-xl bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 text-sm">
            <option value="">Drop at any point / doorstep pickup</option>
            {points.map((p) => <option key={p.id} value={p.id}>{p.name} — {p.location}</option>)}
          </select>
          <input value={kg} onChange={(e) => setKg(e.target.value)} type="number" min="0.1" step="0.1" placeholder="Plastic collected (kg)" className="w-full px-3 py-2 rounded-xl bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 text-sm" />
          <button onClick={report} className="w-full py-2 rounded-xl bg-emerald-700 dark:bg-emerald-600 hover:bg-emerald-800 text-white text-sm font-bold transition-all">Report collection</button>
          {msg && <div className="text-[11px] text-[#5c5446] dark:text-zinc-300">{msg}</div>}
        </div>

        <div className="mb-3 flex flex-wrap gap-1.5">
          {points.map((p) => (
            <div key={p.id} className="px-2.5 py-1.5 rounded-xl border border-[#ebdcca] dark:border-zinc-800 bg-[#fcfaf4] dark:bg-zinc-900 text-[9px] text-[#5c5446] dark:text-zinc-300">
              <b>{p.name}</b> · {p.location}<br />{p.accepts}
            </div>
          ))}
        </div>

        <div className="space-y-2">
          {mine.length === 0 && <div className="text-center text-[11px] text-[#8a8172] py-6">No collections yet — report your first kg above.</div>}
          {mine.map((c) => (
            <div key={c.id} className="p-3 rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-[#fcfaf4] dark:bg-zinc-900 flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-teal-100 dark:bg-teal-900/40 flex items-center justify-center text-base shrink-0">♻️</div>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-[12px] text-[#3a342a] dark:text-zinc-100">{c.kg} kg plastic</div>
                <div className="text-[10px] text-[#8a8172]">{new Date(c.at).toLocaleDateString()} · earns {c.earned} BDT</div>
                <div className={`text-[10px] font-bold ${c.status === 'verified' ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                  {c.status === 'verified' ? '✓ Paid to wallet' : '⏳ Awaiting pickup verification'}
                </div>
              </div>
              {c.status === 'pending' && c.userId === mineId && (
                <button onClick={() => verify(c)} className="px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-[11px] font-bold">Confirm pickup</button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
