import { useEffect, useState } from 'react';

interface GroupBuyProps {
  token: string | null;
  currentUser: { id: string; name: string } | null;
  onClose: () => void;
}

interface GroupBuyItem {
  id: string;
  title: string;
  unitPrice: number;
  targetQty: number;
  raisedQty: number;
  status: 'open' | 'active' | 'done';
  organizerId: string;
  organizerName: string;
  participants: { userId: string; qty: number; paid: number }[];
  createdAt: number;
}

export default function GroupBuy({ token, currentUser, onClose }: GroupBuyProps) {
  const [items, setItems] = useState<GroupBuyItem[]>([]);
  const [title, setTitle] = useState('');
  const [price, setPrice] = useState('');
  const [target, setTarget] = useState('10');
  const [qty, setQty] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState('');

  const headers = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  async function api(path: string, opts: RequestInit = {}) { const r = await fetch(path, { ...opts, headers }); return r.json(); }
  async function refresh() { const d = await api('/api/groupbuy'); setItems(d.groupBuys || []); }
  useEffect(() => { refresh(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  async function start() {
    setMsg('');
    const d = await api('/api/groupbuy', { method: 'POST', body: JSON.stringify({ title, unitPrice: Number(price), targetQty: Number(target) }) });
    if (d.error) return setMsg(`⚠️ ${d.error}`);
    setMsg(`✅ Group buy started — target ${d.groupBuy.targetQty} units @ ${d.groupBuy.unitPrice} BDT.`);
    setTitle(''); setPrice(''); setTarget('10');
    refresh();
  }

  async function join(g: GroupBuyItem) {
    const q = Number(qty[g.id]) || 1;
    const d = await api(`/api/groupbuy/${g.id}/join`, { method: 'POST', body: JSON.stringify({ qty: q }) });
    if (d.error) return setMsg(`⚠️ ${d.error}`);
    setMsg(`✅ Joined with ${q} unit(s) — paid ${d.paid} BDT. Balance ${d.balance} BDT.`);
    refresh();
  }

  async function done(g: GroupBuyItem) {
    const d = await api(`/api/groupbuy/${g.id}/done`, { method: 'POST', body: '{}' });
    if (d.error) return setMsg(`⚠️ ${d.error}`);
    setMsg('✅ Group buy closed.');
    refresh();
  }

  const mine = currentUser?.id;
  const pct = (g: GroupBuyItem) => Math.min(100, Math.round((g.raisedQty / g.targetQty) * 100));

  return (
    <div className="fixed inset-0 z-[120] bg-[#f6f1e7]/98 dark:bg-zinc-950/98 backdrop-blur-sm overflow-y-auto py-6 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-display font-bold text-lg text-[#3a342a] dark:text-zinc-100">Group Buying Power</h2>
            <p className="text-[10px] text-[#8a8172] dark:text-zinc-400">Feature 175 — pool quantities to unlock bulk prices</p>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-white/80 dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 flex items-center justify-center text-[#5c5446] dark:text-zinc-300 hover:bg-[#ebdcca]/50" aria-label="Close">✕</button>
        </div>

        <div className="mb-4 p-4 rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-[#fcfaf4] dark:bg-zinc-900 space-y-2">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What are we buying in bulk? (e.g. rice 25kg sacks)" className="w-full px-3 py-2 rounded-xl bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 text-sm" />
          <div className="grid grid-cols-2 gap-2">
            <input value={price} onChange={(e) => setPrice(e.target.value)} type="number" min="1" placeholder="Unit price BDT" className="px-3 py-2 rounded-xl bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 text-sm" />
            <input value={target} onChange={(e) => setTarget(e.target.value)} type="number" min="2" placeholder="Target quantity" className="px-3 py-2 rounded-xl bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 text-sm" />
          </div>
          <button onClick={start} className="w-full py-2 rounded-xl bg-emerald-700 dark:bg-emerald-600 hover:bg-emerald-800 text-white text-sm font-bold transition-all">Start group buy</button>
          {msg && <div className="text-[11px] text-[#5c5446] dark:text-zinc-300">{msg}</div>}
        </div>

        <div className="space-y-2">
          {items.length === 0 && <div className="text-center text-[11px] text-[#8a8172] py-8">No group buys — start one above.</div>}
          {items.map((g) => (
            <div key={g.id} className="p-3 rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-[#fcfaf4] dark:bg-zinc-900">
              <div className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-[12px] text-[#3a342a] dark:text-zinc-100 truncate">{g.title}</div>
                  <div className="text-[10px] text-[#8a8172] font-mono">{g.unitPrice} BDT/unit · {g.raisedQty}/{g.targetQty} units · {g.participants.length} participant(s)</div>
                  <div className="mt-1 h-1.5 rounded-full bg-[#ebdcca] dark:bg-zinc-700 overflow-hidden">
                    <div className={`h-full rounded-full ${pct(g) >= 100 ? 'bg-emerald-600' : 'bg-amber-500'}`} style={{ width: `${pct(g)}%` }} />
                  </div>
                </div>
                {g.status === 'open' && (
                  <div className="flex items-center gap-1">
                    <input value={qty[g.id] || ''} onChange={(e) => setQty({ ...qty, [g.id]: e.target.value })} type="number" min="1" placeholder="qty" className="w-14 px-2 py-1.5 rounded-lg bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 text-[11px]" />
                    <button onClick={() => join(g)} className="px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-[11px] font-bold">Join</button>
                  </div>
                )}
                {g.status === 'active' && <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400">✓ Target reached!</span>}
                {g.status === 'open' && g.organizerId === mine && (
                  <button onClick={() => done(g)} className="px-3 py-1.5 rounded-lg bg-amber-700 hover:bg-amber-800 text-white text-[11px] font-bold">Close</button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
