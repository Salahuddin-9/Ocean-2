import { useEffect, useState } from 'react';

interface ChitFundProps {
  token: string | null;
  currentUser: { id: string; name: string } | null;
  onClose: () => void;
}

interface ChitMember { userId: string; name: string; joinedAt: number; paidMonths: string[]; paidCash: number }
interface ChitFundItem {
  id: string; name: string; monthlyAmount: number; members: ChitMember[]; createdAt: number; memberCount?: number;
}

export default function ChitFund({ token, currentUser, onClose }: ChitFundProps) {
  const [funds, setFunds] = useState<ChitFundItem[]>([]);
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [msg, setMsg] = useState('');

  const headers = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  async function api(path: string, opts: RequestInit = {}) { const r = await fetch(path, { ...opts, headers }); return r.json(); }
  async function refresh() { const d = await api('/api/chitfund'); setFunds(d.funds || []); }
  useEffect(() => { refresh(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  async function create() {
    setMsg('');
    const d = await api('/api/chitfund', { method: 'POST', body: JSON.stringify({ name, monthlyAmount: Number(amount) }) });
    if (d.error) return setMsg(`⚠️ ${d.error}`);
    setMsg(`✅ Committee "${d.fund.name}" created — ${d.fund.monthlyAmount} BDT/month.`);
    setName(''); setAmount('');
    refresh();
  }

  async function join(f: ChitFundItem) {
    const d = await api(`/api/chitfund/${f.id}/join`, { method: 'POST', body: '{}' });
    if (d.error) return setMsg(`⚠️ ${d.error}`);
    setMsg('✅ Joined the committee.');
    refresh();
  }

  async function pay(f: ChitFundItem) {
    const d = await api(`/api/chitfund/${f.id}/pay`, { method: 'POST', body: '{}' });
    if (d.error) return setMsg(`⚠️ ${d.error}`);
    setMsg(`✅ Marked ${d.month} paid — total contributed ${d.totalPaid} BDT.`);
    refresh();
  }

  const mine = currentUser?.id;

  return (
    <div className="fixed inset-0 z-[120] bg-[#141b2b]/65 dark:bg-[#05060c]/85 backdrop-blur-sm overflow-y-auto py-6 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-display font-bold text-lg text-[#3a342a] dark:text-zinc-100">Chit Fund / Committee</h2>
            <p className="text-[10px] text-[#8a8172] dark:text-zinc-400">Feature 179 — rotating savings circles, payment tracker</p>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-white/80 dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 flex items-center justify-center text-[#5c5446] dark:text-zinc-300 hover:bg-[#ebdcca]/50" aria-label="Close">✕</button>
        </div>

        <div className="mb-4 p-4 rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-[#fcfaf4] dark:bg-zinc-900 space-y-2">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Committee name (e.g. Rickshaw Savings Circle)" className="w-full px-3 py-2 rounded-xl bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 text-sm" />
          <input value={amount} onChange={(e) => setAmount(e.target.value)} type="number" min="1" placeholder="Monthly amount (BDT)" className="w-full px-3 py-2 rounded-xl bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 text-sm" />
          <button onClick={create} className="w-full py-2 rounded-xl bg-emerald-700 dark:bg-emerald-600 hover:bg-emerald-800 text-white text-sm font-bold transition-all">Start committee</button>
          {msg && <div className="text-[11px] text-[#5c5446] dark:text-zinc-300">{msg}</div>}
        </div>

        <div className="space-y-2">
          {funds.length === 0 && <div className="text-center text-[11px] text-[#8a8172] py-8">No committees yet — start one above.</div>}
          {funds.map((f) => {
            const isMember = f.members.some((m) => m.userId === mine);
            const myMember = f.members.find((m) => m.userId === mine);
            const pool = f.members.reduce((s, m) => s + m.paidCash, 0);
            const collector = f.members.length ? f.members[new Date().getMonth() % f.members.length] : null;
            return (
              <div key={f.id} className="p-3 rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-[#fcfaf4] dark:bg-zinc-900">
                <div className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-[12px] text-[#3a342a] dark:text-zinc-100 truncate">{f.name}</div>
                    <div className="text-[10px] text-[#8a8172] font-mono">{f.monthlyAmount} BDT/mo · {f.members.length} member(s) · pool {pool} BDT</div>
                    {collector && <div className="text-[10px] text-[#8a8172]">This cycle's collector: <b className="text-[#3a342a] dark:text-zinc-200">{collector.name}</b></div>}
                    {isMember && myMember && (
                      <div className="text-[10px] text-emerald-700 dark:text-emerald-400">You've paid {myMember.paidMonths.length} month(s), {myMember.paidCash} BDT total.</div>
                    )}
                  </div>
                  {!isMember ? (
                    <button onClick={() => join(f)} className="px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-[11px] font-bold">Join</button>
                  ) : (
                    <button onClick={() => pay(f)} className="px-3 py-1.5 rounded-lg bg-amber-700 hover:bg-amber-800 text-white text-[11px] font-bold">Pay month</button>
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
