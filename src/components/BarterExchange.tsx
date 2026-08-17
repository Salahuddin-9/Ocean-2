import { useEffect, useState } from 'react';

interface BarterExchangeProps {
  token: string | null;
  currentUser: { id: string; name: string } | null;
  onClose: () => void;
}

interface Barter {
  id: string;
  offerText: string;
  wantText: string;
  offeredById: string;
  offeredByName: string;
  status: 'open' | 'matched';
  interest: { userId: string; note: string; at: number }[];
  createdAt: number;
}

export default function BarterExchange({ token, currentUser, onClose }: BarterExchangeProps) {
  const [barters, setBarters] = useState<Barter[]>([]);
  const [offer, setOffer] = useState('');
  const [want, setWant] = useState('');
  const [msg, setMsg] = useState('');
  const [notes, setNotes] = useState<Record<string, string>>({});

  const headers = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  async function api(path: string, opts: RequestInit = {}) { const r = await fetch(path, { ...opts, headers }); return r.json(); }
  async function refresh() { const d = await api('/api/barter'); setBarters(d.barters || []); }
  useEffect(() => { refresh(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  async function post() {
    setMsg('');
    const d = await api('/api/barter', { method: 'POST', body: JSON.stringify({ offer, want }) });
    if (d.error) return setMsg(`⚠️ ${d.error}`);
    setMsg('✅ Offer posted.');
    setOffer(''); setWant('');
    refresh();
  }

  async function interest(b: Barter) {
    const note = notes[b.id] || '';
    const d = await api(`/api/barter/${b.id}/interest`, { method: 'POST', body: JSON.stringify({ note }) });
    if (d.error) return setMsg(`⚠️ ${d.error}`);
    setMsg(`✅ Interest sent — ${d.interested} people interested.`);
    refresh();
  }

  async function match(b: Barter, userId: string) {
    const d = await api(`/api/barter/${b.id}/match`, { method: 'POST', body: JSON.stringify({ userId }) });
    if (d.error) return setMsg(`⚠️ ${d.error}`);
    setMsg(`✅ ${d.note}`);
    refresh();
  }

  const mine = currentUser?.id;

  return (
    <div className="fixed inset-0 z-[120] bg-[#141b2b]/65 dark:bg-[#05060c]/85 backdrop-blur-sm overflow-y-auto py-6 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-display font-bold text-lg text-[#3a342a] dark:text-zinc-100">Barter Exchange</h2>
            <p className="text-[10px] text-[#8a8172] dark:text-zinc-400">Feature 173 — swap skills & items, no coins needed</p>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-white/80 dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 flex items-center justify-center text-[#5c5446] dark:text-zinc-300 hover:bg-[#ebdcca]/50" aria-label="Close">✕</button>
        </div>

        <div className="mb-4 p-4 rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-[#fcfaf4] dark:bg-zinc-900 space-y-2">
          <input value={offer} onChange={(e) => setOffer(e.target.value)} placeholder="I offer… (e.g. 2h of design work)" className="w-full px-3 py-2 rounded-xl bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 text-sm" />
          <input value={want} onChange={(e) => setWant(e.target.value)} placeholder="I want… (e.g. Bengali proofreading)" className="w-full px-3 py-2 rounded-xl bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 text-sm" />
          <button onClick={post} className="w-full py-2 rounded-xl bg-emerald-700 dark:bg-emerald-600 hover:bg-emerald-800 text-white text-sm font-bold transition-all">Post barter offer</button>
          {msg && <div className="text-[11px] text-[#5c5446] dark:text-zinc-300">{msg}</div>}
        </div>

        <div className="space-y-2">
          {barters.length === 0 && <div className="text-center text-[11px] text-[#8a8172] py-8">No open offers — start the first swap.</div>}
          {barters.map((b) => (
            <div key={b.id} className="p-3 rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-[#fcfaf4] dark:bg-zinc-900">
              <div className="text-[12px] text-[#3a342a] dark:text-zinc-100"><b>Offers:</b> {b.offerText}</div>
              <div className="text-[12px] text-[#5c5446] dark:text-zinc-300"><b>Wants:</b> {b.wantText}</div>
              <div className="text-[10px] text-[#8a8172] mt-1">by {b.offeredByName} · {b.interest.length} interested</div>
              {b.status === 'open' && b.offeredById !== mine && (
                <div className="mt-2 flex gap-1">
                  <input value={notes[b.id] || ''} onChange={(e) => setNotes({ ...notes, [b.id]: e.target.value })} placeholder="Quick note…" className="flex-1 px-3 py-1.5 rounded-lg bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 text-[11px]" />
                  <button onClick={() => interest(b)} className="px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-[11px] font-bold">Interested</button>
                </div>
              )}
              {b.status === 'open' && b.offeredById === mine && b.interest.length > 0 && (
                <div className="mt-2 space-y-1">
                  <div className="text-[10px] text-[#8a8172] font-bold">Interested people — pick one to match:</div>
                  {b.interest.map((i) => (
                    <div key={i.userId} className="flex items-center gap-2">
                      <span className="flex-1 text-[11px] text-[#3a342a] dark:text-zinc-200 truncate">{i.userId.slice(0, 12)}… {i.note && `· "${i.note}"`}</span>
                      <button onClick={() => match(b, i.userId)} className="px-3 py-1 rounded-lg bg-amber-700 hover:bg-amber-800 text-white text-[10px] font-bold">Match</button>
                    </div>
                  ))}
                </div>
              )}
              {b.status === 'matched' && <div className="mt-1 text-[10px] text-emerald-700 dark:text-emerald-400 font-bold">✓ Matched — swap in chat</div>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
