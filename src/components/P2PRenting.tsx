import { useEffect, useState } from 'react';

interface P2PRentingProps {
  token: string | null;
  currentUser: { id: string; name: string } | null;
  onClose: () => void;
}

interface Rental {
  id: string;
  item: string;
  description: string;
  ownerId: string;
  ownerName: string;
  hourlyRate: number;
  deposit: number;
  status: 'available' | 'rented';
  rentedBy: string | null;
  createdAt: number;
}

export default function P2PRenting({ token, currentUser, onClose }: P2PRentingProps) {
  const [rentals, setRentals] = useState<Rental[]>([]);
  const [item, setItem] = useState('');
  const [desc, setDesc] = useState('');
  const [rate, setRate] = useState('');
  const [deposit, setDeposit] = useState('');
  const [msg, setMsg] = useState('');
  const [hours, setHours] = useState<Record<string, string>>({});

  const headers = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  async function api(path: string, opts: RequestInit = {}) { const r = await fetch(path, { ...opts, headers }); return r.json(); }
  async function refresh() { const d = await api('/api/rentals'); setRentals(d.rentals || []); }
  useEffect(() => { refresh(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  async function list() {
    setMsg('');
    const d = await api('/api/rentals', { method: 'POST', body: JSON.stringify({ item, description: desc, hourlyRate: Number(rate), deposit: Number(deposit) }) });
    if (d.error) return setMsg(`⚠️ ${d.error}`);
    setMsg(`✅ Listed "${d.rental.item}" at ${d.rental.hourlyRate} BDT/hr.`);
    setItem(''); setDesc(''); setRate(''); setDeposit('');
    refresh();
  }

  async function rent(r: Rental) {
    const h = Number(hours[r.id]) || 1;
    const d = await api(`/api/rentals/${r.id}/rent`, { method: 'POST', body: JSON.stringify({ hours: h }) });
    if (d.error) return setMsg(`⚠️ ${d.error}`);
    setMsg(`✅ Rented for ${h}h — paid ${d.fee} BDT, ${d.depositHeld} BDT deposit held. Balance ${d.balance} BDT.`);
    refresh();
  }

  async function ret(r: Rental) {
    const d = await api(`/api/rentals/${r.id}/return`, { method: 'POST', body: '{}' });
    if (d.error) return setMsg(`⚠️ ${d.error}`);
    setMsg(`✅ Returned — deposit ${d.depositRefunded} BDT refunded.`);
    refresh();
  }

  const mine = currentUser?.id;

  return (
    <div className="fixed inset-0 z-[120] bg-[#f6f1e7]/98 dark:bg-zinc-950/98 backdrop-blur-sm overflow-y-auto py-6 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-display font-bold text-lg text-[#3a342a] dark:text-zinc-100">P2P Asset Renting</h2>
            <p className="text-[10px] text-[#8a8172] dark:text-zinc-400">Feature 172 — rent tools & gear by the hour; deposit refunded on return</p>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-white/80 dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 flex items-center justify-center text-[#5c5446] dark:text-zinc-300 hover:bg-[#ebdcca]/50" aria-label="Close">✕</button>
        </div>

        <div className="mb-4 p-4 rounded-2xl border border-[#ebdcca] dark:bg-zinc-800 bg-[#fcfaf4] dark:bg-zinc-900 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <input value={item} onChange={(e) => setItem(e.target.value)} placeholder="Item (e.g. DSLR camera)" className="col-span-2 px-3 py-2 rounded-xl bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 text-sm" />
            <input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Description" className="col-span-2 px-3 py-2 rounded-xl bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 text-sm" />
            <input value={rate} onChange={(e) => setRate(e.target.value)} type="number" min="1" placeholder="BDT / hour" className="px-3 py-2 rounded-xl bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 text-sm" />
            <input value={deposit} onChange={(e) => setDeposit(e.target.value)} type="number" min="0" placeholder="Deposit (BDT)" className="px-3 py-2 rounded-xl bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 text-sm" />
          </div>
          <button onClick={list} className="w-full py-2 rounded-xl bg-emerald-700 dark:bg-emerald-600 hover:bg-emerald-800 text-white text-sm font-bold transition-all">List item for rent</button>
          {msg && <div className="text-[11px] text-[#5c5446] dark:text-zinc-300">{msg}</div>}
        </div>

        <div className="space-y-2">
          {rentals.length === 0 && <div className="text-center text-[11px] text-[#8a8172] py-8">Nothing for rent yet — list the first item.</div>}
          {rentals.map((r) => (
            <div key={r.id} className="p-3 rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-[#fcfaf4] dark:bg-zinc-900">
              <div className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-[12px] text-[#3a342a] dark:text-zinc-100 truncate">{r.item} <span className="text-[9px] text-[#8a8172] font-mono">by {r.ownerName}</span></div>
                  {r.description && <div className="text-[10px] text-[#8a8172] truncate">{r.description}</div>}
                  <div className="text-[10px] text-[#8a8172] font-mono">🪙 {r.hourlyRate} BDT/hr · deposit {r.deposit} BDT</div>
                </div>
                {r.status === 'available' ? (
                  <div className="flex items-center gap-1">
                    <input value={hours[r.id] || ''} onChange={(e) => setHours({ ...hours, [r.id]: e.target.value })} type="number" min="1" placeholder="hrs" className="w-14 px-2 py-1.5 rounded-lg bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 text-[11px]" />
                    <button onClick={() => rent(r)} disabled={r.ownerId === mine} className="px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 disabled:opacity-40 text-white text-[11px] font-bold">Rent</button>
                  </div>
                ) : (
                  <button onClick={() => ret(r)} disabled={r.rentedBy !== mine} className="px-3 py-1.5 rounded-lg bg-amber-700 hover:bg-amber-800 disabled:opacity-40 text-white text-[11px] font-bold">Return</button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
