import { useEffect, useState } from 'react';

interface DataMarketplaceProps {
  token: string | null;
  currentUser: { id: string; name: string } | null;
  onClose: () => void;
}

interface Listing {
  id: string; title: string; description: string; datatype: string; price: number;
  listedById: string; status: 'active' | 'purchased'; createdAt: number;
}

const DATATYPES = ['interests', 'location_aggregate', 'usage_patterns', 'community_activity'];
const LABELS: Record<string, string> = {
  interests: 'Interests (tags only)', location_aggregate: 'Location aggregate (grid cells)', usage_patterns: 'Usage patterns (anonymized)', community_activity: 'Community activity (counts)',
};

export default function DataMarketplace({ token, currentUser, onClose }: DataMarketplaceProps) {
  const [listings, setListings] = useState<Listing[]>([]);
  const [pool, setPool] = useState<Record<string, number>>({});
  const [totalOptIns, setTotalOptIns] = useState(0);
  const [optIns, setOptIns] = useState<string[]>([]);
  const [title, setTitle] = useState('');
  const [datatype, setDatatype] = useState('interests');
  const [price, setPrice] = useState('');
  const [msg, setMsg] = useState('');

  const headers = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  async function api(path: string, opts: RequestInit = {}) { const r = await fetch(path, { ...opts, headers }); return r.json(); }

  async function refresh() {
    const d = await api('/api/datamarket');
    setListings(d.listings || []);
    setPool(d.pool || {});
    setTotalOptIns(d.totalOptIns || 0);
    const o = await api('/api/datamarket/optins');
    setOptIns(o.optIns || []);
  }
  useEffect(() => { refresh(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  async function toggle(type: string) {
    const enabled = !optIns.includes(type);
    const d = await api('/api/datamarket/optin', { method: 'POST', body: JSON.stringify({ datatype: type, enabled }) });
    if (d.enabledTypes) setOptIns(d.enabledTypes);
    refresh();
  }

  async function list() {
    setMsg('');
    const d = await api('/api/datamarket', { method: 'POST', body: JSON.stringify({ title, datatype, price: Number(price) }) });
    if (d.error) return setMsg(`⚠️ ${d.error}`);
    setMsg(`✅ Dataset listed at ${d.listing.price} BDT.`);
    setTitle(''); setPrice('');
    refresh();
  }

  async function buy(l: Listing) {
    const d = await api(`/api/datamarket/${l.id}/buy`, { method: 'POST', body: '{}' });
    if (d.error) return setMsg(`⚠️ ${d.error}`);
    setMsg(`✅ Purchased! ${d.contributorsRewarded} contributors rewarded ${d.contributorReward} BDT each. Balance ${d.balance} BDT.`);
    refresh();
  }

  return (
    <div className="fixed inset-0 z-[120] bg-[#f6f1e7]/98 dark:bg-zinc-950/98 backdrop-blur-sm overflow-y-auto py-6 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-display font-bold text-lg text-[#3a342a] dark:text-zinc-100">Data Marketplace</h2>
            <p className="text-[10px] text-[#8a8172] dark:text-zinc-400">Feature 182 — opt in to anonymized pools, researchers buy aggregates</p>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-white/80 dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 flex items-center justify-center text-[#5c5446] dark:text-zinc-300 hover:bg-[#ebdcca]/50" aria-label="Close">✕</button>
        </div>

        <div className="mb-3 p-3 rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-[#fcfaf4] dark:bg-zinc-900">
          <div className="font-bold text-[11px] text-[#3a342a] dark:text-zinc-100 mb-1">Your opt-ins (never stores raw data — only counts)</div>
          {DATATYPES.map((t) => (
            <button key={t} onClick={() => toggle(t)} className={`mr-1.5 mb-1 px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-all ${optIns.includes(t) ? 'bg-violet-700 border-violet-700 text-white' : 'border-[#ebdcca] dark:border-zinc-700 text-[#5c5446] dark:text-zinc-300'}`}>
              {LABELS[t]} {pool[t] ? `(${pool[t]})` : ''}
            </button>
          ))}
          <div className="text-[9px] text-[#8a8172] mt-1">🔒 {totalOptIns} anonymous contributions in the pool.</div>
        </div>

        <div className="mb-4 p-4 rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-[#fcfaf4] dark:bg-zinc-900 space-y-2">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Dataset title (e.g. Q3 interest trends, Dhaka)" className="w-full px-3 py-2 rounded-xl bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 text-sm" />
          <div className="grid grid-cols-2 gap-2">
            <select value={datatype} onChange={(e) => setDatatype(e.target.value)} className="px-3 py-2 rounded-xl bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 text-sm">
              {DATATYPES.map((t) => <option key={t} value={t}>{LABELS[t]}</option>)}
            </select>
            <input value={price} onChange={(e) => setPrice(e.target.value)} type="number" min="1" placeholder="Price BDT" className="px-3 py-2 rounded-xl bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 text-sm" />
          </div>
          <button onClick={list} className="w-full py-2 rounded-xl bg-emerald-700 dark:bg-emerald-600 hover:bg-emerald-800 text-white text-sm font-bold transition-all">List dataset</button>
          {msg && <div className="text-[11px] text-[#5c5446] dark:text-zinc-300">{msg}</div>}
        </div>

        <div className="space-y-2">
          {listings.length === 0 && <div className="text-center text-[11px] text-[#8a8172] py-8">No datasets on sale yet.</div>}
          {listings.map((l) => (
            <div key={l.id} className="p-3 rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-[#fcfaf4] dark:bg-zinc-900 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="font-bold text-[12px] text-[#3a342a] dark:text-zinc-100 truncate">{l.title}</div>
                <div className="text-[10px] text-[#8a8172] truncate">{LABELS[l.datatype] || l.datatype} · {pool[l.datatype] || 0} contributors</div>
                <div className="text-[10px] text-[#8a8172] font-mono">🪙 {l.price} BDT · 90% to contributors</div>
              </div>
              <button onClick={() => buy(l)} className="px-3 py-1.5 rounded-lg bg-violet-700 hover:bg-violet-800 text-white text-[11px] font-bold">Buy</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
