import { useEffect, useState } from 'react';

interface FarmLiveProps {
  token: string | null;
  currentUser: { id: string; name: string } | null;
  onClose: () => void;
}

interface FarmStream {
  id: string; farmerId: string; farmerName: string; title: string; crop: string;
  location: string; pricePerKg: number; status: 'live' | 'ended';
  viewers: string[]; viewerCount?: number; createdAt: number;
}

export default function FarmLive({ token, currentUser, onClose }: FarmLiveProps) {
  const [streams, setStreams] = useState<FarmStream[]>([]);
  const [title, setTitle] = useState('');
  const [crop, setCrop] = useState('');
  const [location, setLocation] = useState('');
  const [price, setPrice] = useState('');
  const [qty, setQty] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState('');

  const headers = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  async function api(path: string, opts: RequestInit = {}) { const r = await fetch(path, { ...opts, headers }); return r.json(); }
  async function refresh() { const d = await api('/api/agri/farm-streams'); setStreams(d.streams || []); }
  useEffect(() => { refresh(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  async function goLive() {
    setMsg('');
    const d = await api('/api/agri/farm-streams', { method: 'POST', body: JSON.stringify({ title, crop, location, pricePerKg: Number(price) }) });
    if (d.error) return setMsg(`⚠️ ${d.error}`);
    setMsg(`✅ You're live! ${d.stream.title} @ ${d.stream.pricePerKg} BDT/kg.`);
    setTitle(''); setCrop(''); setLocation(''); setPrice('');
    refresh();
  }

  async function join(s: FarmStream) {
    await api(`/api/agri/farm-streams/${s.id}/join`, { method: 'POST', body: '{}' });
    refresh();
  }

  async function order(s: FarmStream) {
    const q = Number(qty[s.id]) || 1;
    const d = await api(`/api/agri/farm-streams/${s.id}/order`, { method: 'POST', body: JSON.stringify({ qtyKg: q }) });
    if (d.error) return setMsg(`⚠️ ${d.error}`);
    setMsg(`✅ ${d.note} ${d.order.total} BDT total.`);
    refresh();
  }

  async function end(s: FarmStream) {
    const d = await api(`/api/agri/farm-streams/${s.id}/end`, { method: 'POST', body: '{}' });
    if (d.error) return setMsg(`⚠️ ${d.error}`);
    setMsg(`✅ Stream ended — ${d.orders.length} order(s) placed.`);
    refresh();
  }

  const mine = currentUser?.id;

  return (
    <div className="fixed inset-0 z-[120] bg-[#f6f1e7]/98 dark:bg-zinc-950/98 backdrop-blur-sm overflow-y-auto py-6 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-display font-bold text-lg text-[#3a342a] dark:text-zinc-100">Farmer-to-Consumer Live</h2>
            <p className="text-[10px] text-[#8a8172] dark:text-zinc-400">Feature 185 — buy straight from the field, no middleman</p>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-white/80 dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 flex items-center justify-center text-[#5c5446] dark:text-zinc-300 hover:bg-[#ebdcca]/50" aria-label="Close">✕</button>
        </div>

        <div className="mb-4 p-4 rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-[#fcfaf4] dark:bg-zinc-900 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Stream title (e.g. Today's harvest, Dhanmondi)" className="col-span-2 px-3 py-2 rounded-xl bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 text-sm" />
            <input value={crop} onChange={(e) => setCrop(e.target.value)} placeholder="Crop (e.g. brinjal)" className="px-3 py-2 rounded-xl bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 text-sm" />
            <input value={price} onChange={(e) => setPrice(e.target.value)} type="number" min="1" placeholder="BDT/kg" className="px-3 py-2 rounded-xl bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 text-sm" />
            <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Farm location" className="col-span-2 px-3 py-2 rounded-xl bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 text-sm" />
          </div>
          <button onClick={goLive} className="w-full py-2 rounded-xl bg-emerald-700 dark:bg-emerald-600 hover:bg-emerald-800 text-white text-sm font-bold transition-all">📡 Go live from the field</button>
          {msg && <div className="text-[11px] text-[#5c5446] dark:text-zinc-300">{msg}</div>}
        </div>

        <div className="space-y-2">
          {streams.length === 0 && <div className="text-center text-[11px] text-[#8a8172] py-8">No farmers live right now — go live above!</div>}
          {streams.map((s) => (
            <div key={s.id} className="p-3 rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-[#fcfaf4] dark:bg-zinc-900">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center text-lg shrink-0">🧑‍🌾</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                    <span className="font-bold text-[12px] text-[#3a342a] dark:text-zinc-100 truncate">{s.title}</span>
                  </div>
                  <div className="text-[10px] text-[#8a8172]">{s.crop} · {s.location} · {s.pricePerKg} BDT/kg</div>
                  <div className="text-[10px] text-[#8a8172]">by {s.farmerName} · 👁 {s.viewerCount} watching</div>
                </div>
                <div className="flex flex-col gap-1">
                  {s.farmerId !== mine && (
                    <>
                      <button onClick={() => join(s)} className="px-3 py-1 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-[10px] font-bold">Watch</button>
                      <div className="flex items-center gap-1">
                        <input value={qty[s.id] || ''} onChange={(e) => setQty({ ...qty, [s.id]: e.target.value })} type="number" min="0.5" step="0.5" placeholder="kg" className="w-14 px-2 py-1 rounded-lg bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 text-[10px]" />
                        <button onClick={() => order(s)} className="px-3 py-1 rounded-lg bg-amber-700 hover:bg-amber-800 text-white text-[10px] font-bold">Order</button>
                      </div>
                    </>
                  )}
                  {s.farmerId === mine && (
                    <button onClick={() => end(s)} className="px-3 py-1 rounded-lg bg-rose-700 hover:bg-rose-800 text-white text-[10px] font-bold">End stream</button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
