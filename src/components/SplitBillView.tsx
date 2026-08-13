import { useEffect, useState } from 'react';
import { Receipt, Plus, Trash2, HandCoins, Wallet } from 'lucide-react';
import FeatureShell, { toast, authHeaders } from './FeatureShell';

interface Props {
  token: string | null;
  currentUser: { id: string; name: string } | null;
  onClose: () => void;
}

interface Split {
  id: string;
  chatId: string;
  chatName: string;
  title: string;
  createdByName: string;
  createdAt: number;
  participants: { userId: string; name: string }[];
  items: { id: string; name: string; amount: number; payers: string[]; paidBy: string }[];
  balances: Record<string, number>;
  settled: boolean;
}

export default function SplitBillView({ token, currentUser, onClose }: Props) {
  const [splits, setSplits] = useState<Split[]>([]);
  const [conversations, setConversations] = useState<any[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [chatId, setChatId] = useState('');
  const [title, setTitle] = useState('');
  const [items, setItems] = useState<{ name: string; amount: string }[]>([{ name: '', amount: '' }]);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const res = await fetch('/api/split/mine', { headers: authHeaders(token) });
      if (res.ok) setSplits((await res.json()).splits || []);
      const convRes = await fetch('/api/chat/conversations', { headers: authHeaders(token) });
      if (convRes.ok) {
        const data = await convRes.json();
        const list = Array.isArray(data) ? data : data.conversations || [];
        setConversations(list.filter((c: any) => c.type === 'group' || c.isGroup));
      }
    } catch { /* offline */ }
  };

  useEffect(() => { load(); }, [token]);

  const createBill = async () => {
    if (!chatId || !title.trim()) { toast('⛔ Pick a group chat and enter a title'); return; }
    const valid = items.filter((i) => i.name.trim() && Number(i.amount) > 0).map((i) => ({ name: i.name, amount: Number(i.amount) }));
    if (!valid.length) { toast('⛔ Add at least one item'); return; }
    setBusy(true);
    const res = await fetch(`/api/chats/${chatId}/split`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ title, items: valid }),
    });
    const data = await res.json();
    setBusy(false);
    if (res.ok) {
      toast('✅ Split bill created');
      setShowCreate(false);
      setTitle('');
      setItems([{ name: '', amount: '' }]);
      load();
    } else {
      toast(`⛔ ${data.error || 'Could not create split'}`);
    }
  };

  const settle = async (split: Split, fromUserId: string, toUserId: string, amount: number, method: 'coins' | 'cash') => {
    setBusy(true);
    const res = await fetch(`/api/splits/${split.id}/settle`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ fromUserId, toUserId, amount, method }),
    });
    const data = await res.json();
    setBusy(false);
    if (res.ok) {
      toast(data.message || 'Settlement recorded');
      load();
    } else {
      toast(`⛔ ${data.error || 'Settlement failed'}`);
    }
  };

  const deleteSplit = async (id: string) => {
    const res = await fetch(`/api/splits/${id}/delete`, { method: 'POST', headers: authHeaders(token) });
    if (res.ok) { toast('🗑 Split deleted'); load(); }
    else toast('⛔ Only the creator can delete');
  };

  const nameOf = (split: Split, id: string) => split.participants.find((p) => p.userId === id)?.name || 'User';

  return (
    <FeatureShell title="Split Bill in Chat" badge="4" icon={<Receipt size={18} className="text-rose-700 dark:text-rose-400" />} onClose={onClose}>
      <div className="flex items-center justify-between mb-3">
        <p className="text-[10px] text-[#8a8172]">Itemized bills in group chats · settle with Ocean Coins — try <code className="bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 rounded px-1">/split</code> in chat.</p>
        <button onClick={() => setShowCreate(!showCreate)}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-rose-800 hover:bg-rose-700 text-white text-[10px] font-bold uppercase tracking-wider transition-all">
          <Plus size={12} /> New bill
        </button>
      </div>

      {showCreate && (
        <div className="bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-2xl p-4 mb-4">
          <select value={chatId} onChange={(e) => setChatId(e.target.value)} className="w-full bg-white dark:bg-zinc-800 border border-[#cfcac0] dark:border-zinc-700 rounded-lg px-3 py-2 text-xs mb-2">
            <option value="">Select a group chat…</option>
            {conversations.map((c) => <option key={c.id} value={c.id}>{c.name || 'Group chat'}</option>)}
          </select>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Bill title (e.g. Dinner at Karwan Bazar)" className="w-full bg-white dark:bg-zinc-800 border border-[#cfcac0] dark:border-zinc-700 rounded-lg px-3 py-2 text-xs mb-2" />
          <div className="space-y-1.5">
            {items.map((it, idx) => (
              <div key={idx} className="flex gap-1.5">
                <input value={it.name} onChange={(e) => setItems(items.map((x, i) => (i === idx ? { ...x, name: e.target.value } : x)))} placeholder="Item (e.g. Biryani)"
                  className="flex-1 bg-white dark:bg-zinc-800 border border-[#cfcac0] dark:border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs" />
                <input value={it.amount} onChange={(e) => setItems(items.map((x, i) => (i === idx ? { ...x, amount: e.target.value.replace(/\D/g, '') } : x)))} placeholder="৳" inputMode="numeric"
                  className="w-20 bg-white dark:bg-zinc-800 border border-[#cfcac0] dark:border-zinc-700 rounded-lg px-2 py-1.5 text-xs" />
                <button onClick={() => setItems(items.filter((_, i) => i !== idx))} className="text-[#8a8172] hover:text-rose-600"><Trash2 size={13} /></button>
              </div>
            ))}
          </div>
          <button onClick={() => setItems([...items, { name: '', amount: '' }])} className="mt-2 text-[10px] font-bold text-rose-700 dark:text-rose-400">+ Add item</button>
          <button onClick={createBill} disabled={busy} className="mt-2 w-full rounded-xl bg-rose-800 hover:bg-rose-700 text-white text-[11px] font-bold uppercase tracking-wider py-2 transition-all disabled:opacity-40">
            {busy ? 'Creating…' : 'Create split bill'}
          </button>
        </div>
      )}

      <div className="space-y-3">
        {splits.length === 0 && !showCreate && (
          <p className="text-[11px] text-[#8a8172] italic bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-2xl p-4">
            No split bills yet. Create one for a group chat, or type <code className="bg-white dark:bg-zinc-800 rounded px-1">/split</code> in chat to split the next expense equally.
          </p>
        )}
        {splits.map((split) => (
          <div key={split.id} className="bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-2xl p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[12px] font-bold text-[#3a342a] dark:text-zinc-100">{split.title}</p>
                <p className="text-[9px] text-[#8a8172] font-mono">{split.chatName} · by {split.createdByName} · {new Date(split.createdAt).toLocaleDateString()}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${split.settled ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300' : 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300'}`}>
                  {split.settled ? '✓ Settled' : 'Open'}
                </span>
                <button onClick={() => deleteSplit(split.id)} className="text-[#8a8172] hover:text-rose-600"><Trash2 size={12} /></button>
              </div>
            </div>

            <div className="mt-2 grid sm:grid-cols-2 gap-2">
              <div className="bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 rounded-xl p-2.5">
                <p className="text-[8px] font-mono uppercase text-[#8a8172]">Items</p>
                {split.items.map((it) => (
                  <div key={it.id} className="flex justify-between text-[10px] py-0.5">
                    <span className="text-[#3a342a] dark:text-zinc-200 truncate">{it.name}</span>
                    <span className="font-semibold text-[#3a342a] dark:text-zinc-200">৳{it.amount}</span>
                  </div>
                ))}
              </div>
              <div className="bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 rounded-xl p-2.5">
                <p className="text-[8px] font-mono uppercase text-[#8a8172]">Balances</p>
                {split.participants.map((p) => {
                  const bal = split.balances[p.userId] ?? 0;
                  return (
                    <div key={p.userId} className="flex justify-between text-[10px] py-0.5">
                      <span className="text-[#3a342a] dark:text-zinc-200 truncate">{p.name}</span>
                      <span className={`font-bold ${bal > 0.004 ? 'text-emerald-600' : bal < -0.004 ? 'text-rose-500' : 'text-[#8a8172]'}`}>
                        {bal > 0.004 ? `+৳${bal.toFixed(0)}` : bal < -0.004 ? `−৳${Math.abs(bal).toFixed(0)}` : '—'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {!split.settled && (
              <div className="mt-3 flex flex-wrap gap-2">
                {split.participants
                  .filter((p) => (split.balances[p.userId] ?? 0) < -0.004 && p.userId !== currentUser?.id)
                  .map((debtor) => {
                    const amt = Math.ceil(Math.abs(split.balances[debtor.userId] ?? 0));
                    return (
                      <button key={debtor.userId} disabled={busy}
                        onClick={() => settle(split, debtor.userId, currentUser!.id, amt, 'cash')}
                        title="Records that this person paid you in cash (off-wallet). Coin debits require the payer's own confirmation."
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 text-[9px] font-bold uppercase tracking-wider text-[#3a342a] dark:text-zinc-200 hover:border-amber-500 transition-all disabled:opacity-40">
                        <HandCoins size={11} /> {nameOf(split, debtor.userId)} paid you in cash
                      </button>
                    );
                  })}
                {split.participants
                  .filter((p) => (split.balances[p.userId] ?? 0) > 0.004 && p.userId === currentUser?.id)
                  .map((creditor) => {
                    const amt = Math.floor(split.balances[creditor.userId] ?? 0);
                    return (
                      <button key={creditor.userId} disabled={busy}
                        onClick={() => settle(split, currentUser!.id, creditor.userId, amt, 'coins')}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-800 hover:bg-emerald-700 text-white text-[9px] font-bold uppercase tracking-wider transition-all disabled:opacity-40">
                        <Wallet size={11} /> You owe ৳{amt} → pay now
                      </button>
                    );
                  })}
                {!split.participants.some((p) => (split.balances[p.userId] ?? 0) < -0.004) &&
                  !split.participants.some((p) => (split.balances[p.userId] ?? 0) > 0.004) && (
                    <span className="text-[10px] text-emerald-700 dark:text-emerald-400 font-semibold">All even 🎉</span>
                  )}
              </div>
            )}
          </div>
        ))}
      </div>
    </FeatureShell>
  );
}
