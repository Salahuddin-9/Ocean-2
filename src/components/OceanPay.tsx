import { useEffect, useState } from 'react';
import { Coins, Send, ArrowDownLeft, ArrowUpRight, Search, User } from 'lucide-react';
import FeatureShell, { toast, authHeaders } from './FeatureShell';

interface Props {
  token: string | null;
  currentUser: { id: string; name: string } | null;
  onClose: () => void;
}

interface Tx {
  id: string;
  direction: 'sent' | 'received';
  amount: number;
  otherName: string;
  note: string;
  at: number;
  kind: string;
}

export default function OceanPay({ token, currentUser, onClose }: Props) {
  const [balance, setBalance] = useState<number | null>(null);
  const [sent, setSent] = useState(0);
  const [received, setReceived] = useState(0);
  const [txs, setTxs] = useState<Tx[]>([]);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [toUser, setToUser] = useState<any | null>(null);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [allUsers, setAllUsers] = useState<any[]>([]);

  const load = async () => {
    try {
      const [balRes, txRes] = await Promise.all([
        fetch('/api/wallet/balance', { headers: authHeaders(token) }),
        fetch('/api/wallet/transactions', { headers: authHeaders(token) }),
      ]);
      if (balRes.ok) {
        const b = await balRes.json();
        setBalance(b.balance);
        setSent(b.sent);
        setReceived(b.received);
      }
      if (txRes.ok) {
        const t = await txRes.json();
        setTxs(t.transactions || []);
      }
    } catch { /* offline */ }
  };

  useEffect(() => { load(); }, [token]);

  useEffect(() => {
    if (!allUsers.length) {
      fetch('/api/creators', { headers: authHeaders(token) })
        .then((r) => r.json())
        .then((data) => {
          const list = Array.isArray(data) ? data : data?.creators || data?.users || [];
          setAllUsers(list);
        })
        .catch(() => {});
    }
  }, [token, allUsers.length]);

  useEffect(() => {
    const term = q.trim().toLowerCase();
    if (!term) { setResults([]); return; }
    setResults(allUsers.filter((u: any) => (u.name || u.username || '').toLowerCase().includes(term)).slice(0, 6));
  }, [q, allUsers]);

  const sendCoins = async () => {
    if (!toUser || !amount) return;
    setSending(true);
    try {
      const res = await fetch('/api/wallet/transfer', {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({ toUserId: toUser.id, amount: Number(amount), note }),
      });
      const data = await res.json();
      if (res.ok) {
        toast(data.message || `✅ ${amount} coins sent`);
        setAmount('');
        setNote('');
        setToUser(null);
        setQ('');
        load();
      } else {
        toast(`⛔ ${data.error || 'Transfer failed'}`);
      }
    } catch { toast('⛔ Network error'); }
    setSending(false);
  };

  return (
    <FeatureShell title="Ocean Pay" badge="19" icon={<Coins size={18} className="text-amber-700 dark:text-amber-400" />} onClose={onClose}>
      <div className="grid md:grid-cols-2 gap-4">
        <div className="bg-gradient-to-br from-amber-800 to-amber-950 rounded-2xl p-5 text-[#f4f1ea]">
          <p className="font-mono text-[9px] uppercase tracking-widest text-amber-200/70">Wallet balance</p>
          <p className="text-4xl font-bold mt-1">{balance === null ? '…' : balance.toLocaleString()} <span className="text-lg font-semibold text-amber-200/80">coins</span></p>
          <div className="flex gap-4 mt-3 text-[11px]">
            <span className="flex items-center gap-1"><ArrowUpRight size={12} /> Sent {sent.toLocaleString()}</span>
            <span className="flex items-center gap-1"><ArrowDownLeft size={12} /> Received {received.toLocaleString()}</span>
          </div>
          <p className="text-[10px] mt-3 text-amber-200/70 leading-relaxed">Use <code className="bg-amber-900/60 px-1 rounded">/pay @user 50</code> in any chat to send coins inline.</p>
        </div>

        <div className="bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-2xl p-4">
          <span className="font-mono text-[9px] font-bold text-[#8a8172] uppercase tracking-wider">Send coins</span>
          <div className="relative mt-2">
            <Search size={12} className="absolute left-2.5 top-2.5 text-[#8a8172]" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search recipient by name…"
              className="w-full bg-white dark:bg-zinc-800 border border-[#cfcac0] dark:border-zinc-700 rounded-lg pl-8 pr-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-amber-600" />
            {results.length > 0 && (
              <div className="absolute z-10 mt-1 w-full bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 rounded-lg shadow-lg overflow-hidden">
                {results.map((u: any) => (
                  <button key={u.id} onClick={() => { setToUser(u); setQ(u.name || u.username); setResults([]); }}
                    className="w-full text-left px-3 py-2 text-[11px] hover:bg-amber-50 dark:hover:bg-zinc-700 flex items-center gap-2">
                    <User size={12} className="text-amber-700" /> {u.name || u.username}
                  </button>
                ))}
              </div>
            )}
          </div>
          {toUser && (
            <div className="mt-2 text-[10px] text-emerald-700 dark:text-emerald-400 font-semibold">→ Paying {toUser.name || toUser.username}</div>
          )}
          <div className="flex gap-2 mt-2">
            <input value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))} placeholder="Amount" inputMode="numeric"
              className="w-1/2 bg-white dark:bg-zinc-800 border border-[#cfcac0] dark:border-zinc-700 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-amber-600" />
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)"
              className="w-1/2 bg-white dark:bg-zinc-800 border border-[#cfcac0] dark:border-zinc-700 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-amber-600" />
          </div>
          <button onClick={sendCoins} disabled={sending || !toUser || !amount}
            className="mt-2 w-full flex items-center justify-center gap-1.5 rounded-xl bg-amber-800 hover:bg-amber-700 text-[#f4f1ea] text-[11px] font-bold uppercase tracking-wider py-2 transition-all disabled:opacity-40">
            <Send size={12} /> {sending ? 'Sending…' : 'Send coins'}
          </button>
        </div>
      </div>

      <div className="mt-4 bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-2xl p-4">
        <span className="font-mono text-[9px] font-bold text-[#8a8172] uppercase tracking-wider">Transaction history</span>
        <div className="mt-2 space-y-1.5">
          {txs.length === 0 && <p className="text-[10px] text-[#8a8172] italic">No transactions yet — try sending coins to a friend.</p>}
          {txs.map((t) => (
            <div key={t.id} className="flex items-center gap-2 bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 rounded-lg px-3 py-2">
              {t.direction === 'sent' ? <ArrowUpRight size={13} className="text-rose-500" /> : <ArrowDownLeft size={13} className="text-emerald-600" />}
              <div className="flex-1 min-w-0">
                <p className="text-[11px] text-[#3a342a] dark:text-zinc-100 truncate">{t.direction === 'sent' ? `To ${t.otherName}` : `From ${t.otherName}`} <span className="text-[#8a8172]">· {t.kind.replace('_', ' ')}</span></p>
                <p className="text-[9px] text-[#8a8172] truncate">{t.note} · {new Date(t.at).toLocaleString()}</p>
              </div>
              <span className={`text-xs font-bold ${t.direction === 'sent' ? 'text-rose-500' : 'text-emerald-600'}`}>{t.direction === 'sent' ? '−' : '+'}{t.amount}</span>
            </div>
          ))}
        </div>
      </div>
    </FeatureShell>
  );
}
