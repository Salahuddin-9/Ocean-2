import { useEffect, useState } from 'react';

interface GigRadarProps {
  token: string | null;
  currentUser: { id: string; name: string } | null;
  onClose: () => void;
}

interface Gig {
  id: string;
  title: string;
  pay: number;
  location: string;
  radiusKm: number;
  postedById: string;
  postedByName: string;
  status: 'open' | 'filled';
  applicants: { userId: string; note: string; at: number }[];
  createdAt: number;
}

export default function GigRadar({ token, currentUser, onClose }: GigRadarProps) {
  const [gigs, setGigs] = useState<Gig[]>([]);
  const [title, setTitle] = useState('');
  const [pay, setPay] = useState('');
  const [location, setLocation] = useState('');
  const [radius, setRadius] = useState('10');
  const [maxDist, setMaxDist] = useState('50');
  const [msg, setMsg] = useState('');
  const [notes, setNotes] = useState<Record<string, string>>({});

  const headers = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  async function api(path: string, opts: RequestInit = {}) { const r = await fetch(path, { ...opts, headers }); return r.json(); }
  async function refresh(dist?: string) { const d = await api(`/api/gigs?maxDistance=${dist ?? maxDist}`); setGigs(d.gigs || []); }
  useEffect(() => { refresh(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  async function post() {
    setMsg('');
    const d = await api('/api/gigs', { method: 'POST', body: JSON.stringify({ title, pay: Number(pay), location, radiusKm: Number(radius) }) });
    if (d.error) return setMsg(`⚠️ ${d.error}`);
    setMsg(`✅ Gig posted — ${d.gig.pay} BDT.`);
    setTitle(''); setPay(''); setLocation('');
    refresh();
  }

  async function apply(g: Gig) {
    const note = notes[g.id] || '';
    const d = await api(`/api/gigs/${g.id}/apply`, { method: 'POST', body: JSON.stringify({ note }) });
    if (d.error) return setMsg(`⚠️ ${d.error}`);
    setMsg(`✅ Application sent — ${d.applicants} applicants so far.`);
    refresh();
  }

  async function fill(g: Gig, userId: string) {
    const d = await api(`/api/gigs/${g.id}/fill`, { method: 'POST', body: JSON.stringify({ userId }) });
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
            <h2 className="font-display font-bold text-lg text-[#3a342a] dark:text-zinc-100">Gig Radar</h2>
            <p className="text-[10px] text-[#8a8172] dark:text-zinc-400">Feature 174 — quick cash jobs near you</p>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-white/80 dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 flex items-center justify-center text-[#5c5446] dark:text-zinc-300 hover:bg-[#ebdcca]/50" aria-label="Close">✕</button>
        </div>

        <div className="mb-4 p-4 rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-[#fcfaf4] dark:bg-zinc-900 space-y-2">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Gig (e.g. carry 10kg parcel, 2km)" className="w-full px-3 py-2 rounded-xl bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 text-sm" />
          <div className="grid grid-cols-3 gap-2">
            <input value={pay} onChange={(e) => setPay(e.target.value)} type="number" min="0" placeholder="Pay BDT" className="px-3 py-2 rounded-xl bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 text-sm" />
            <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Area" className="px-3 py-2 rounded-xl bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 text-sm" />
            <input value={radius} onChange={(e) => setRadius(e.target.value)} type="number" min="1" placeholder="Radius km" className="px-3 py-2 rounded-xl bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 text-sm" />
          </div>
          <button onClick={post} className="w-full py-2 rounded-xl bg-emerald-700 dark:bg-emerald-600 hover:bg-emerald-800 text-white text-sm font-bold transition-all">Post gig</button>
          {msg && <div className="text-[11px] text-[#5c5446] dark:text-zinc-300">{msg}</div>}
        </div>

        <div className="mb-3 flex items-center gap-2">
          <span className="text-[10px] text-[#8a8172] font-bold">Radar range:</span>
          {['10', '25', '50', '100'].map((km) => (
            <button key={km} onClick={() => { setMaxDist(km); refresh(km); }} className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-all ${maxDist === km ? 'bg-emerald-700 border-emerald-700 text-white' : 'border-[#ebdcca] dark:border-zinc-700 text-[#5c5446] dark:text-zinc-300'}`}>{km} km</button>
          ))}
        </div>

        <div className="space-y-2">
          {gigs.length === 0 && <div className="text-center text-[11px] text-[#8a8172] py-8">No gigs in range — post one above.</div>}
          {gigs.map((g) => (
            <div key={g.id} className="p-3 rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-[#fcfaf4] dark:bg-zinc-900">
              <div className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-[12px] text-[#3a342a] dark:text-zinc-100 truncate">{g.title}</div>
                  <div className="text-[10px] text-[#8a8172] font-mono">🪙 {g.pay} BDT · 📍 {g.location} · within {g.radiusKm} km · by {g.postedByName}</div>
                </div>
                {g.status === 'open' && g.postedById !== mine && (
                  <div className="flex items-center gap-1">
                    <input value={notes[g.id] || ''} onChange={(e) => setNotes({ ...notes, [g.id]: e.target.value })} placeholder="note" className="w-24 px-2 py-1.5 rounded-lg bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 text-[10px]" />
                    <button onClick={() => apply(g)} className="px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-[11px] font-bold">Apply</button>
                  </div>
                )}
              </div>
              {g.status === 'open' && g.postedById === mine && g.applicants.length > 0 && (
                <div className="mt-2 space-y-1">
                  <div className="text-[10px] text-[#8a8172] font-bold">{g.applicants.length} applicant(s):</div>
                  {g.applicants.map((a) => (
                    <div key={a.userId} className="flex items-center gap-2">
                      <span className="flex-1 text-[11px] text-[#3a342a] dark:text-zinc-200 truncate">{a.userId.slice(0, 12)}… {a.note && `· "${a.note}"`}</span>
                      <button onClick={() => fill(g, a.userId)} className="px-3 py-1 rounded-lg bg-amber-700 hover:bg-amber-800 text-white text-[10px] font-bold">Hire</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
