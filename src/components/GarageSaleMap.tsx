import { useEffect, useState } from 'react';

interface GarageSaleMapProps {
  token: string | null;
  currentUser: { id: string; name: string } | null;
  onClose: () => void;
}

interface GarageSale {
  id: string;
  title: string;
  description: string;
  lat: number;
  lng: number;
  address: string;
  date: number;
  postedByName: string;
}

export default function GarageSaleMap({ token, currentUser, onClose }: GarageSaleMapProps) {
  const [sales, setSales] = useState<GarageSale[]>([]);
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [address, setAddress] = useState('');
  const [msg, setMsg] = useState('');
  const [selected, setSelected] = useState<GarageSale | null>(null);

  const headers = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  async function api(path: string, opts: RequestInit = {}) { const r = await fetch(path, { ...opts, headers }); return r.json(); }
  async function refresh() { const d = await api('/api/garagesales'); setSales(d.sales || []); }
  useEffect(() => { refresh(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  async function post() {
    setMsg('');
    // Pseudo-random stable position for demo purposes; a real client would send GPS.
    const lat = Math.random() * 0.9 + 0.05;
    const lng = Math.random() * 0.9 + 0.05;
    const d = await api('/api/garagesales', { method: 'POST', body: JSON.stringify({ title, description: desc, address, lat, lng }) });
    if (d.error) return setMsg(`⚠️ ${d.error}`);
    setMsg(`✅ Sale posted for ${new Date(d.sale.date).toDateString()}.`);
    setTitle(''); setDesc(''); setAddress('');
    refresh();
  }

  const fmtDate = (n: number) => new Date(n).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

  return (
    <div className="fixed inset-0 z-[120] bg-[#141b2b]/65 dark:bg-[#05060c]/85 backdrop-blur-sm overflow-y-auto py-6 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-display font-bold text-lg text-[#3a342a] dark:text-zinc-100">Garage Sale Map</h2>
            <p className="text-[10px] text-[#8a8172] dark:text-zinc-400">Feature 177 — see weekend sales around your neighborhood</p>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-white/80 dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 flex items-center justify-center text-[#5c5446] dark:text-zinc-300 hover:bg-[#ebdcca]/50" aria-label="Close">✕</button>
        </div>

        <div className="mb-4 p-4 rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-[#fcfaf4] dark:bg-zinc-900 space-y-2">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Sale (e.g. household sale, 8am–2pm)" className="w-full px-3 py-2 rounded-xl bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 text-sm" />
          <div className="grid grid-cols-2 gap-2">
            <input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="What's for sale?" className="px-3 py-2 rounded-xl bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 text-sm" />
            <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Address / area" className="px-3 py-2 rounded-xl bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 text-sm" />
          </div>
          <button onClick={post} className="w-full py-2 rounded-xl bg-emerald-700 dark:bg-emerald-600 hover:bg-emerald-800 text-white text-sm font-bold transition-all">Pin sale on map</button>
          {msg && <div className="text-[11px] text-[#5c5446] dark:text-zinc-300">{msg}</div>}
        </div>

        <div className="relative h-64 rounded-2xl border border-[#ebdcca] dark:border-zinc-800 overflow-hidden bg-[#e8e2d2] dark:bg-zinc-900">
          {/* faux map grid */}
          <div className="absolute inset-0 opacity-60" style={{ backgroundImage: 'linear-gradient(#d8d0bc33 1px, transparent 1px), linear-gradient(90deg, #d8d0bc33 1px, transparent 1px)', backgroundSize: '32px 32px' }} />
          <div className="absolute top-2 left-3 text-[9px] font-mono text-[#8a8172] uppercase tracking-widest">Local map</div>
          {sales.map((s) => (
            <button
              key={s.id}
              onClick={() => setSelected(s)}
              className="absolute w-4 h-4 -ml-2 -mt-2 rounded-full bg-emerald-600 border-2 border-white dark:border-zinc-950 shadow hover:scale-125 transition-transform"
              style={{ left: `${s.lng * 100}%`, top: `${s.lat * 100}%` }}
              title={s.title}
            />
          ))}
          {selected && (
            <div className="absolute bottom-2 left-2 right-2 p-2 rounded-xl bg-white/95 dark:bg-zinc-800/95 border border-[#ebdcca] dark:border-zinc-700 text-[10px] text-[#3a342a] dark:text-zinc-100 shadow-lg">
              <b>{selected.title}</b> · {fmtDate(selected.date)}<br />
              <span className="text-[#8a8172]">{selected.address}{selected.description ? ` — ${selected.description}` : ''}</span>
            </div>
          )}
        </div>

        <div className="mt-3 space-y-2">
          {sales.length === 0 && <div className="text-center text-[11px] text-[#8a8172] py-4">No sales yet — pin the first one.</div>}
          {sales.map((s) => (
            <div key={s.id} className="flex items-center gap-2 p-2 rounded-xl border border-[#ebdcca] dark:border-zinc-800 bg-[#fcfaf4] dark:bg-zinc-900">
              <span className="w-6 h-6 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center text-[11px]">🏷️</span>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-[11px] text-[#3a342a] dark:text-zinc-100 truncate">{s.title}</div>
                <div className="text-[9px] text-[#8a8172]">{fmtDate(s.date)} · {s.address} · by {s.postedByName}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
