import { useEffect, useState } from 'react';

interface SavingCircleProps {
  token: string | null;
  currentUser: { id: string; name: string } | null;
  onClose: () => void;
}

interface SavingMember { userId: string; name: string; contributed: number }
interface Circle {
  id: string; name: string; goal: string; targetAmount: number; members: SavingMember[];
  createdAt: number; pooled?: number; memberCount?: number;
}

export default function SavingCircle({ token, currentUser, onClose }: SavingCircleProps) {
  const [circles, setCircles] = useState<Circle[]>([]);
  const [name, setName] = useState('');
  const [goal, setGoal] = useState('');
  const [target, setTarget] = useState('1000');
  const [amount, setAmount] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState('');

  const headers = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  async function api(path: string, opts: RequestInit = {}) { const r = await fetch(path, { ...opts, headers }); return r.json(); }
  async function refresh() { const d = await api('/api/savingcircle'); setCircles(d.circles || []); }
  useEffect(() => { refresh(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  async function create() {
    setMsg('');
    const d = await api('/api/savingcircle', { method: 'POST', body: JSON.stringify({ name, goal, targetAmount: Number(target) }) });
    if (d.error) return setMsg(`⚠️ ${d.error}`);
    setMsg(`✅ Circle "${d.circle.name}" created — goal ${d.circle.targetAmount} BDT.`);
    setName(''); setGoal(''); setTarget('1000');
    refresh();
  }

  async function join(c: Circle) {
    const d = await api(`/api/savingcircle/${c.id}/join`, { method: 'POST', body: '{}' });
    if (d.error) return setMsg(`⚠️ ${d.error}`);
    setMsg('✅ Joined the circle.');
    refresh();
  }

  async function contribute(c: Circle) {
    const a = Number(amount[c.id]) || 0;
    if (a <= 0) return setMsg('⚠️ Enter a positive amount.');
    const d = await api(`/api/savingcircle/${c.id}/contribute`, { method: 'POST', body: JSON.stringify({ amount: a }) });
    if (d.error) return setMsg(`⚠️ ${d.error}`);
    setMsg(`✅ Contributed ${d.contributed} BDT — pooled ${d.pooled} BDT. Balance ${d.balance} BDT.`);
    refresh();
  }

  const mine = currentUser?.id;
  const pct = (c: Circle) => Math.min(100, Math.round(((c.pooled || 0) / c.targetAmount) * 100));

  return (
    <div className="fixed inset-0 z-[120] bg-[#f6f1e7]/98 dark:bg-zinc-950/98 backdrop-blur-sm overflow-y-auto py-6 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-display font-bold text-lg text-[#3a342a] dark:text-zinc-100">Saving Circle</h2>
            <p className="text-[10px] text-[#8a8172] dark:text-zinc-400">Feature 180 — a small group saves toward a shared goal</p>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-white/80 dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 flex items-center justify-center text-[#5c5446] dark:text-zinc-300 hover:bg-[#ebdcca]/50" aria-label="Close">✕</button>
        </div>

        <div className="mb-4 p-4 rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-[#fcfaf4] dark:bg-zinc-900 space-y-2">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Circle name (e.g. Startup Seed Pot)" className="w-full px-3 py-2 rounded-xl bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 text-sm" />
          <div className="grid grid-cols-2 gap-2">
            <input value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="Goal (e.g. buy a 3D printer)" className="px-3 py-2 rounded-xl bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 text-sm" />
            <input value={target} onChange={(e) => setTarget(e.target.value)} type="number" min="100" placeholder="Target BDT" className="px-3 py-2 rounded-xl bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 text-sm" />
          </div>
          <button onClick={create} className="w-full py-2 rounded-xl bg-emerald-700 dark:bg-emerald-600 hover:bg-emerald-800 text-white text-sm font-bold transition-all">Start circle</button>
          {msg && <div className="text-[11px] text-[#5c5446] dark:text-zinc-300">{msg}</div>}
        </div>

        <div className="space-y-2">
          {circles.length === 0 && <div className="text-center text-[11px] text-[#8a8172] py-8">No circles yet — start one above.</div>}
          {circles.map((c) => {
            const isMember = c.members.some((m) => m.userId === mine);
            return (
              <div key={c.id} className="p-3 rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-[#fcfaf4] dark:bg-zinc-900">
                <div className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-[12px] text-[#3a342a] dark:text-zinc-100 truncate">{c.name}</div>
                    <div className="text-[10px] text-[#8a8172] truncate">🎯 {c.goal} · {c.memberCount} member(s)</div>
                    <div className="text-[10px] text-[#8a8172] font-mono">{c.pooled || 0} / {c.targetAmount} BDT</div>
                    <div className="mt-1 h-1.5 rounded-full bg-[#ebdcca] dark:bg-zinc-700 overflow-hidden">
                      <div className={`h-full rounded-full ${pct(c) >= 100 ? 'bg-emerald-600' : 'bg-violet-500'}`} style={{ width: `${pct(c)}%` }} />
                    </div>
                  </div>
                  {!isMember ? (
                    <button onClick={() => join(c)} className="px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-[11px] font-bold">Join</button>
                  ) : (
                    <div className="flex items-center gap-1">
                      <input value={amount[c.id] || ''} onChange={(e) => setAmount({ ...amount, [c.id]: e.target.value })} type="number" min="1" placeholder="BDT" className="w-16 px-2 py-1.5 rounded-lg bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 text-[11px]" />
                      <button onClick={() => contribute(c)} className="px-3 py-1.5 rounded-lg bg-violet-700 hover:bg-violet-800 text-white text-[11px] font-bold">Save</button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
