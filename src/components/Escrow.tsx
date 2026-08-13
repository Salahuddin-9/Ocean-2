import { useEffect, useState } from 'react';

interface EscrowProps {
  token: string | null;
  currentUser: { id: string; name: string } | null;
  onClose: () => void;
}

interface EscrowItem {
  id: string;
  title: string;
  amount: number;
  payerId: string;
  payeeId: string | null;
  status: 'held' | 'released' | 'refunded';
  expiresAt: number;
  createdAt: number;
}

const fmt = (n: number) => new Date(n).toLocaleDateString();

export default function Escrow({ token, currentUser, onClose }: EscrowProps) {
  const [escrows, setEscrows] = useState<EscrowItem[]>([]);
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [payeeId, setPayeeId] = useState('');
  const [balance, setBalance] = useState<number | null>(null);
  const [msg, setMsg] = useState('');

  const headers = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };

  async function api(path: string, opts: RequestInit = {}) {
    const r = await fetch(path, { ...opts, headers });
    return r.json();
  }

  async function refresh() {
    const d = await api('/api/escrow');
    setEscrows(d.escrows || []);
    const c = await api('/api/community');
    const bal = c?.state?.balances?.[currentUser?.id ?? ''];
    if (typeof bal === 'number') setBalance(bal);
  }

  useEffect(() => { refresh(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  async function create() {
    setMsg('');
    const d = await api('/api/escrow', {
      method: 'POST',
      body: JSON.stringify({ title, amount: Number(amount), payeeId: payeeId.trim() || undefined }),
    });
    if (d.error) return setMsg(`⚠️ ${d.error}`);
    setMsg(`✅ Escrowed ${d.escrow.amount} BDT — ${d.escrow.status}. Balance now ${d.balance} BDT.`);
    setTitle(''); setAmount(''); setPayeeId('');
    refresh();
  }

  async function act(id: string, kind: 'release' | 'refund') {
    const d = await api(`/api/escrow/${id}/${kind}`, { method: 'POST', body: '{}' });
    if (d.error) return setMsg(`⚠️ ${d.error}`);
    setMsg(kind === 'release' ? `✅ Released ${d.refunded ?? d.escrow.amount} BDT to the payee.` : `✅ Refunded ${d.refunded} BDT to you.`);
    refresh();
  }

  const mine = currentUser?.id;

  return (
    <div className="fixed inset-0 z-[120] bg-[#f6f1e7]/98 dark:bg-zinc-950/98 backdrop-blur-sm overflow-y-auto py-6 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-display font-bold text-lg text-[#3a342a] dark:text-zinc-100">Time-Locked Escrow</h2>
            <p className="text-[10px] text-[#8a8172] dark:text-zinc-400">Feature 171 — coins held in your wallet, released or refunded on condition</p>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-white/80 dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 flex items-center justify-center text-[#5c5446] dark:text-zinc-300 hover:bg-[#ebdcca]/50" aria-label="Close">✕</button>
        </div>

        {typeof balance === 'number' && (
          <div className="mb-3 px-4 py-2 rounded-xl border border-[#ebdcca] dark:border-zinc-800 bg-[#fcfaf4] dark:bg-zinc-900 text-[11px] text-[#3a342a] dark:text-zinc-200 font-mono">
            Wallet balance: <b>{balance} BDT</b>
          </div>
        )}

        <div className="mb-4 p-4 rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-[#fcfaf4] dark:bg-zinc-900 space-y-2">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What is this escrow for?" className="w-full px-3 py-2 rounded-xl bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 text-sm text-[#3a342a] dark:text-zinc-100" />
          <div className="flex gap-2">
            <input value={amount} onChange={(e) => setAmount(e.target.value)} type="number" min="1" placeholder="Amount (BDT)" className="w-1/2 px-3 py-2 rounded-xl bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 text-sm" />
            <input value={payeeId} onChange={(e) => setPayeeId(e.target.value)} placeholder="Payee user ID (optional)" className="w-1/2 px-3 py-2 rounded-xl bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 text-sm" />
          </div>
          <button onClick={create} className="w-full py-2 rounded-xl bg-emerald-700 dark:bg-emerald-600 hover:bg-emerald-800 text-white text-sm font-bold transition-all">Lock coins in escrow</button>
          {msg && <div className="text-[11px] text-[#5c5446] dark:text-zinc-300">{msg}</div>}
        </div>

        <div className="space-y-2">
          {escrows.length === 0 && <div className="text-center text-[11px] text-[#8a8172] py-8">No escrows yet — lock coins above.</div>}
          {escrows.map((e) => (
            <div key={e.id} className="p-3 rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-[#fcfaf4] dark:bg-zinc-900 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="font-bold text-[12px] text-[#3a342a] dark:text-zinc-100 truncate">{e.title}</div>
                <div className="text-[10px] text-[#8a8172] font-mono">🪙 {e.amount} BDT · {e.payeeId ? `→ ${e.payeeId.slice(0, 10)}…` : 'no payee'} · created {fmt(e.createdAt)}</div>
                <div className="text-[10px] text-[#8a8172]">expires {fmt(e.expiresAt)} · <span className={e.status === 'held' ? 'text-amber-600' : 'text-emerald-600'}>{e.status}</span></div>
              </div>
              {e.status === 'held' && (
                <div className="flex gap-1">
                  {(mine === e.payeeId || !e.payeeId) && (
                    <button onClick={() => act(e.id, 'release')} className="px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-[11px] font-bold">Release</button>
                  )}
                  {mine === e.payerId && (
                    <button onClick={() => act(e.id, 'refund')} className="px-3 py-1.5 rounded-lg bg-amber-700 hover:bg-amber-800 text-white text-[11px] font-bold">Refund</button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
