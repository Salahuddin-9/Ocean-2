import { useEffect, useState } from 'react';

interface SubscriptionManagerProps {
  token: string | null;
  currentUser: { id: string; name: string } | null;
  onClose: () => void;
}

interface SubMember { userId: string; name: string; paidShare: boolean }
interface Sub {
  id: string; service: string; monthlyCost: number; ownerId: string; ownerName: string;
  members: SubMember[]; createdAt: number;
}

export default function SubscriptionManager({ token, currentUser, onClose }: SubscriptionManagerProps) {
  const [subs, setSubs] = useState<Sub[]>([]);
  const [service, setService] = useState('');
  const [cost, setCost] = useState('');
  const [msg, setMsg] = useState('');

  const headers = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  async function api(path: string, opts: RequestInit = {}) { const r = await fetch(path, { ...opts, headers }); return r.json(); }
  async function refresh() { const d = await api('/api/sharedsubs'); setSubs(d.subs || []); }
  useEffect(() => { refresh(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  async function create() {
    setMsg('');
    const d = await api('/api/sharedsubs', { method: 'POST', body: JSON.stringify({ service, monthlyCost: Number(cost) }) });
    if (d.error) return setMsg(`⚠️ ${d.error}`);
    setMsg(`✅ "${d.sub.service}" tracked at ${d.sub.monthlyCost} BDT/month.`);
    setService(''); setCost('');
    refresh();
  }

  async function join(s: Sub) {
    const d = await api(`/api/sharedsubs/${s.id}/join`, { method: 'POST', body: '{}' });
    if (d.error) return setMsg(`⚠️ ${d.error}`);
    setMsg(`✅ Joined — your share is ${d.share} BDT/month.`);
    refresh();
  }

  async function pay(s: Sub) {
    const d = await api(`/api/sharedsubs/${s.id}/pay`, { method: 'POST', body: '{}' });
    if (d.error) return setMsg(`⚠️ ${d.error}`);
    setMsg(`✅ Marked your ${d.share} BDT share paid for this month.`);
    refresh();
  }

  async function settle(s: Sub, userId: string) {
    const d = await api(`/api/sharedsubs/${s.id}/settle`, { method: 'POST', body: JSON.stringify({ userId }) });
    if (d.error) return setMsg(`⚠️ ${d.error}`);
    setMsg(`✅ Collected ${d.collected} BDT from ${d.from} via wallet.`);
    refresh();
  }

  const mine = currentUser?.id;
  const share = (s: Sub) => Math.round(s.monthlyCost / Math.max(1, s.members.length));

  return (
    <div className="fixed inset-0 z-[120] bg-[#f6f1e7]/98 dark:bg-zinc-950/98 backdrop-blur-sm overflow-y-auto py-6 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-display font-bold text-lg text-[#3a342a] dark:text-zinc-100">Subscription Manager</h2>
            <p className="text-[10px] text-[#8a8172] dark:text-zinc-400">Feature 181 — split shared subscriptions fairly</p>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-white/80 dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 flex items-center justify-center text-[#5c5446] dark:text-zinc-300 hover:bg-[#ebdcca]/50" aria-label="Close">✕</button>
        </div>

        <div className="mb-4 p-4 rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-[#fcfaf4] dark:bg-zinc-900 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <input value={service} onChange={(e) => setService(e.target.value)} placeholder="Service (e.g. Spotify Family)" className="px-3 py-2 rounded-xl bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 text-sm" />
            <input value={cost} onChange={(e) => setCost(e.target.value)} type="number" min="1" placeholder="Monthly BDT" className="px-3 py-2 rounded-xl bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 text-sm" />
          </div>
          <button onClick={create} className="w-full py-2 rounded-xl bg-emerald-700 dark:bg-emerald-600 hover:bg-emerald-800 text-white text-sm font-bold transition-all">Track subscription</button>
          {msg && <div className="text-[11px] text-[#5c5446] dark:text-zinc-300">{msg}</div>}
        </div>

        <div className="space-y-2">
          {subs.length === 0 && <div className="text-center text-[11px] text-[#8a8172] py-8">No shared subscriptions — add one above.</div>}
          {subs.map((s) => {
            const isMember = s.members.some((m) => m.userId === mine);
            const myPaid = s.members.find((m) => m.userId === mine)?.paidShare;
            return (
              <div key={s.id} className="p-3 rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-[#fcfaf4] dark:bg-zinc-900">
                <div className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-[12px] text-[#3a342a] dark:text-zinc-100 truncate">{s.service}</div>
                    <div className="text-[10px] text-[#8a8172] font-mono">{s.monthlyCost} BDT/mo · {s.members.length} member(s) · share ≈ {share(s)} BDT</div>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {s.members.map((m) => (
                        <span key={m.userId} className={`text-[9px] px-1.5 py-0.5 rounded-full border ${m.paidShare ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-300 border-emerald-300' : 'bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 border-amber-300'}`}>
                          {m.name} {m.paidShare ? '✓' : '·'}
                        </span>
                      ))}
                    </div>
                  </div>
                  {!isMember ? (
                    <button onClick={() => join(s)} className="px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-[11px] font-bold">Join</button>
                  ) : myPaid ? (
                    <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400">✓ Paid</span>
                  ) : (
                    <button onClick={() => pay(s)} className="px-3 py-1.5 rounded-lg bg-amber-700 hover:bg-amber-800 text-white text-[11px] font-bold">Pay share</button>
                  )}
                </div>
                {s.ownerId === mine && s.members.some((m) => !m.paidShare && m.userId !== mine) && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {s.members.filter((m) => !m.paidShare && m.userId !== mine).map((m) => (
                      <button key={m.userId} onClick={() => settle(s, m.userId)} className="px-2 py-1 rounded-lg bg-violet-700 hover:bg-violet-800 text-white text-[9px] font-bold">
                        Collect {share(s)} BDT from {m.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
