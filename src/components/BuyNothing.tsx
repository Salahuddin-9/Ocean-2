import { useEffect, useState } from 'react';

interface BuyNothingProps {
  token: string | null;
  currentUser: { id: string; name: string } | null;
  onClose: () => void;
}

interface BuyNothingItem {
  id: string;
  kind: 'give' | 'want';
  title: string;
  details: string;
  area: string;
  postedById: string;
  postedByName: string;
  status: 'open' | 'claimed';
  createdAt: number;
}

export default function BuyNothing({ token, currentUser, onClose }: BuyNothingProps) {
  const [items, setItems] = useState<BuyNothingItem[]>([]);
  const [kind, setKind] = useState<'give' | 'want'>('give');
  const [title, setTitle] = useState('');
  const [details, setDetails] = useState('');
  const [area, setArea] = useState('');
  const [tab, setTab] = useState<'give' | 'want'>('give');
  const [msg, setMsg] = useState('');

  const headers = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  async function api(path: string, opts: RequestInit = {}) { const r = await fetch(path, { ...opts, headers }); return r.json(); }
  async function refresh() { const d = await api(`/api/buynothing?kind=${tab}`); setItems(d.items || []); }
  useEffect(() => { refresh(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [tab]);

  async function post() {
    setMsg('');
    const d = await api('/api/buynothing', { method: 'POST', body: JSON.stringify({ kind, title, details, area }) });
    if (d.error) return setMsg(`⚠️ ${d.error}`);
    setMsg(`✅ Posted as ${kind === 'give' ? 'a giveaway' : 'a request'}.`);
    setTitle(''); setDetails(''); setArea('');
    refresh();
  }

  async function claim(i: BuyNothingItem) {
    const d = await api(`/api/buynothing/${i.id}/claim`, { method: 'POST', body: '{}' });
    if (d.error) return setMsg(`⚠️ ${d.error}`);
    setMsg(`✅ ${d.note}`);
    refresh();
  }

  const mine = currentUser?.id;

  return (
    <div className="fixed inset-0 z-[120] bg-[#f6f1e7]/98 dark:bg-zinc-950/98 backdrop-blur-sm overflow-y-auto py-6 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-display font-bold text-lg text-[#3a342a] dark:text-zinc-100">Buy-Nothing Group</h2>
            <p className="text-[10px] text-[#8a8172] dark:text-zinc-400">Feature 176 — give it away or ask for it, 0 BDT always</p>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-white/80 dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 flex items-center justify-center text-[#5c5446] dark:text-zinc-300 hover:bg-[#ebdcca]/50" aria-label="Close">✕</button>
        </div>

        <div className="mb-4 p-4 rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-[#fcfaf4] dark:bg-zinc-900 space-y-2">
          <div className="flex gap-2">
            {(['give', 'want'] as const).map((k) => (
              <button key={k} onClick={() => setKind(k)} className={`flex-1 py-2 rounded-xl text-sm font-bold border transition-all ${kind === k ? 'bg-emerald-700 border-emerald-700 text-white' : 'border-[#ebdcca] dark:border-zinc-700 text-[#5c5446] dark:text-zinc-300'}`}>{k === 'give' ? '🎁 Giving away' : '🙋 Asking for'}</button>
            ))}
          </div>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={kind === 'give' ? 'What are you giving away?' : 'What do you need?'} className="w-full px-3 py-2 rounded-xl bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 text-sm" />
          <div className="grid grid-cols-3 gap-2">
            <input value={details} onChange={(e) => setDetails(e.target.value)} placeholder="Details" className="col-span-2 px-3 py-2 rounded-xl bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 text-sm" />
            <input value={area} onChange={(e) => setArea(e.target.value)} placeholder="Area" className="px-3 py-2 rounded-xl bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 text-sm" />
          </div>
          <button onClick={post} className="w-full py-2 rounded-xl bg-emerald-700 dark:bg-emerald-600 hover:bg-emerald-800 text-white text-sm font-bold transition-all">Post for free</button>
          {msg && <div className="text-[11px] text-[#5c5446] dark:text-zinc-300">{msg}</div>}
        </div>

        <div className="mb-3 flex gap-2">
          {(['give', 'want'] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} className={`px-3 py-1.5 rounded-lg text-[11px] font-bold border transition-all ${tab === t ? 'bg-emerald-700 border-emerald-700 text-white' : 'border-[#ebdcca] dark:border-zinc-700 text-[#5c5446] dark:text-zinc-300'}`}>{t === 'give' ? '🎁 Giveaways' : '🙋 Requests'}</button>
          ))}
        </div>

        <div className="space-y-2">
          {items.length === 0 && <div className="text-center text-[11px] text-[#8a8172] py-8">Nothing here yet.</div>}
          {items.map((i) => (
            <div key={i.id} className="p-3 rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-[#fcfaf4] dark:bg-zinc-900 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="font-bold text-[12px] text-[#3a342a] dark:text-zinc-100 truncate">{i.title}</div>
                {i.details && <div className="text-[10px] text-[#8a8172] truncate">{i.details}</div>}
                <div className="text-[10px] text-[#8a8172] font-mono">📍 {i.area} · by {i.postedByName}</div>
              </div>
              {i.status === 'open' && i.postedById !== mine && (
                <button onClick={() => claim(i)} className="px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-[11px] font-bold">{i.kind === 'give' ? 'Claim' : 'I can help'}</button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
