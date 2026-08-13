import { useEffect, useState } from 'react';

interface FarmToolPoolProps {
  token: string | null;
  currentUser: { id: string; name: string } | null;
  onClose: () => void;
}

interface Tool {
  id: string; tool: string; description: string; ownerId: string; ownerName: string;
  ratePerDay: number; deposit: number; status: 'available' | 'rented';
  rentedBy: string | null; createdAt: number;
}

export default function FarmToolPool({ token, currentUser, onClose }: FarmToolPoolProps) {
  const [tools, setTools] = useState<Tool[]>([]);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [rate, setRate] = useState('');
  const [deposit, setDeposit] = useState('');
  const [days, setDays] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState('');

  const headers = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  async function api(path: string, opts: RequestInit = {}) { const r = await fetch(path, { ...opts, headers }); return r.json(); }
  async function refresh() { const d = await api('/api/agri/tools'); setTools(d.tools || []); }
  useEffect(() => { refresh(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  async function list() {
    setMsg('');
    const d = await api('/api/agri/tools', { method: 'POST', body: JSON.stringify({ tool: name, description: desc, ratePerDay: Number(rate), deposit: Number(deposit) }) });
    if (d.error) return setMsg(`⚠️ ${d.error}`);
    setMsg(`✅ "${d.tool.tool}" listed at ${d.tool.ratePerDay} BDT/day.`);
    setName(''); setDesc(''); setRate(''); setDeposit('');
    refresh();
  }

  async function rent(t: Tool) {
    const d = await api(`/api/agri/tools/${t.id}/rent`, { method: 'POST', body: JSON.stringify({ days: Number(days[t.id]) || 1 }) });
    if (d.error) return setMsg(`⚠️ ${d.error}`);
    setMsg(`✅ Rented for ${days[t.id] || 1} day(s) — paid ${d.fee} BDT, ${d.depositHeld} BDT deposit held. Balance ${d.balance} BDT.`);
    refresh();
  }

  async function ret(t: Tool) {
    const d = await api(`/api/agri/tools/${t.id}/return`, { method: 'POST', body: '{}' });
    if (d.error) return setMsg(`⚠️ ${d.error}`);
    setMsg(`✅ Returned — ${d.depositRefunded} BDT deposit refunded.`);
    refresh();
  }

  const mine = currentUser?.id;

  return (
    <div className="fixed inset-0 z-[120] bg-[#f6f1e7]/98 dark:bg-zinc-950/98 backdrop-blur-sm overflow-y-auto py-6 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-display font-bold text-lg text-[#3a342a] dark:text-zinc-100">Farm Equipment Pool</h2>
            <p className="text-[10px] text-[#8a8172] dark:text-zinc-400">Feature 188 — share tractors & tools, rent by the day</p>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-white/80 dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 flex items-center justify-center text-[#5c5446] dark:text-zinc-300 hover:bg-[#ebdcca]/50" aria-label="Close">✕</button>
        </div>

        <div className="mb-4 p-4 rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-[#fcfaf4] dark:bg-zinc-900 space-y-2">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Tool (e.g. power tiller)" className="w-full px-3 py-2 rounded-xl bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 text-sm" />
          <input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Description / condition" className="w-full px-3 py-2 rounded-xl bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 text-sm" />
          <div className="grid grid-cols-2 gap-2">
            <input value={rate} onChange={(e) => setRate(e.target.value)} type="number" min="1" placeholder="BDT / day" className="px-3 py-2 rounded-xl bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 text-sm" />
            <input value={deposit} onChange={(e) => setDeposit(e.target.value)} type="number" min="0" placeholder="Deposit (BDT)" className="px-3 py-2 rounded-xl bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 text-sm" />
          </div>
          <button onClick={list} className="w-full py-2 rounded-xl bg-emerald-700 dark:bg-emerald-600 hover:bg-emerald-800 text-white text-sm font-bold transition-all">List tool for the pool</button>
          {msg && <div className="text-[11px] text-[#5c5446] dark:text-zinc-300">{msg}</div>}
        </div>

        <div className="space-y-2">
          {tools.length === 0 && <div className="text-center text-[11px] text-[#8a8172] py-8">The pool is empty — list the first tool.</div>}
          {tools.map((t) => (
            <div key={t.id} className="p-3 rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-[#fcfaf4] dark:bg-zinc-900">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center text-lg shrink-0">🚜</div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-[12px] text-[#3a342a] dark:text-zinc-100 truncate">{t.tool}</div>
                  {t.description && <div className="text-[10px] text-[#8a8172] truncate">{t.description}</div>}
                  <div className="text-[10px] text-[#8a8172] font-mono">🪙 {t.ratePerDay} BDT/day · deposit {t.deposit} · by {t.ownerName}</div>
                </div>
                {t.status === 'available' ? (
                  <div className="flex items-center gap-1">
                    <input value={days[t.id] || ''} onChange={(e) => setDays({ ...days, [t.id]: e.target.value })} type="number" min="1" placeholder="days" className="w-14 px-2 py-1.5 rounded-lg bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 text-[11px]" />
                    <button onClick={() => rent(t)} disabled={t.ownerId === mine} className="px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 disabled:opacity-40 text-white text-[11px] font-bold">Rent</button>
                  </div>
                ) : (
                  <button onClick={() => ret(t)} disabled={t.rentedBy !== mine} className="px-3 py-1.5 rounded-lg bg-amber-700 hover:bg-amber-800 disabled:opacity-40 text-white text-[11px] font-bold">Return</button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
