import { useEffect, useState } from 'react';

interface AfforestationProps {
  token: string | null;
  currentUser: { id: string; name: string } | null;
  onClose: () => void;
}

interface Planting {
  id: string; userId: string; userName: string; species: string; count: number;
  lat: number; lng: number; status: 'pending' | 'verified'; plantedAt: number;
  eligible?: boolean; daysLeft?: number;
}

export default function Afforestation({ token, currentUser, onClose }: AfforestationProps) {
  const [plantings, setPlantings] = useState<Planting[]>([]);
  const [verifiedTrees, setVerifiedTrees] = useState(0);
  const [species, setSpecies] = useState('');
  const [count, setCount] = useState('10');
  const [msg, setMsg] = useState('');

  const headers = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  async function api(path: string, opts: RequestInit = {}) { const r = await fetch(path, { ...opts, headers }); return r.json(); }
  async function refresh() { const d = await api('/api/agri/plantings'); setPlantings(d.plantings || []); setVerifiedTrees(d.verifiedTrees || 0); }
  useEffect(() => { refresh(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  async function plant() {
    setMsg('');
    const d = await api('/api/agri/plantings', { method: 'POST', body: JSON.stringify({ species, count: Number(count), lat: Math.random() * 0.8 + 0.1, lng: Math.random() * 0.8 + 0.1 }) });
    if (d.error) return setMsg(`⚠️ ${d.error}`);
    setMsg(`✅ ${d.note}`);
    setSpecies(''); setCount('10');
    refresh();
  }

  async function verify(p: Planting) {
    const d = await api(`/api/agri/plantings/${p.id}/verify`, { method: 'POST', body: '{}' });
    if (d.error) return setMsg(`⚠️ ${d.error}`);
    setMsg(`✅ ${d.note} +${d.reward} BDT (balance ${d.balance}).`);
    refresh();
  }

  const mine = currentUser?.id;

  return (
    <div className="fixed inset-0 z-[120] bg-[#141b2b]/65 dark:bg-[#05060c]/85 backdrop-blur-sm overflow-y-auto py-6 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-display font-bold text-lg text-[#3a342a] dark:text-zinc-100">Micro-Afforestation</h2>
            <p className="text-[10px] text-[#8a8172] dark:text-zinc-400">Feature 190 — plant, verify growth, earn coins per tree</p>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-white/80 dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 flex items-center justify-center text-[#5c5446] dark:text-zinc-300 hover:bg-[#ebdcca]/50" aria-label="Close">✕</button>
        </div>

        <div className="mb-3 p-3 rounded-2xl border border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 flex items-center gap-2">
          <span className="text-xl">🌳</span>
          <div className="text-[11px] text-[#3a342a] dark:text-zinc-200"><b>{verifiedTrees}</b> verified trees in the community ledger</div>
        </div>

        <div className="mb-4 p-4 rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-[#fcfaf4] dark:bg-zinc-900 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <input value={species} onChange={(e) => setSpecies(e.target.value)} placeholder="Species (e.g. neem)" className="px-3 py-2 rounded-xl bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 text-sm" />
            <input value={count} onChange={(e) => setCount(e.target.value)} type="number" min="1" placeholder="How many" className="px-3 py-2 rounded-xl bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 text-sm" />
          </div>
          <button onClick={plant} className="w-full py-2 rounded-xl bg-emerald-700 dark:bg-emerald-600 hover:bg-emerald-800 text-white text-sm font-bold transition-all">Register planting (+2 BDT/tree when verified)</button>
          {msg && <div className="text-[11px] text-[#5c5446] dark:text-zinc-300">{msg}</div>}
        </div>

        <div className="space-y-2">
          {plantings.length === 0 && <div className="text-center text-[11px] text-[#8a8172] py-8">No plantings yet — register the first trees.</div>}
          {plantings.map((p) => (
            <div key={p.id} className="p-3 rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-[#fcfaf4] dark:bg-zinc-900 flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center text-base shrink-0">🌱</div>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-[12px] text-[#3a342a] dark:text-zinc-100 truncate">{p.count} × {p.species}</div>
                <div className="text-[10px] text-[#8a8172]">by {p.userName} · planted {new Date(p.plantedAt).toLocaleDateString()}</div>
                <div className={`text-[10px] font-bold ${p.status === 'verified' ? 'text-emerald-700 dark:text-emerald-400' : p.eligible ? 'text-amber-600 dark:text-amber-400' : 'text-[#8a8172]'}`}>
                  {p.status === 'verified' ? '✓ Verified — reward paid' : p.eligible ? '🛰 Ready for satellite verification' : `⏳ Growth window: ${p.daysLeft} day(s) left`}
                </div>
              </div>
              {p.status === 'pending' && p.eligible && p.userId === mine && (
                <button onClick={() => verify(p)} className="px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-[11px] font-bold">Verify</button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
