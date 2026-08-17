import { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Gem, Plus, Loader2, MapPin, ArrowUp } from 'lucide-react';

/**
 * Ocean — Hidden Gem Location Drops (Feature 229)
 * --------------------------------------------------
 * Community pins of scenic spots with GPS, tags and upvotes.
 * Backed by /api/gems.
 */

interface HiddenGemsProps {
  token: string | null;
  currentUser: { id: string; name: string } | null;
  onClose: () => void;
}

interface Gem { id: string; name: string; lat: number; lng: number; tags: string[]; desc: string; userName: string; upvotes: string[]; createdAt: number }

export default function HiddenGems({ token, currentUser, onClose }: HiddenGemsProps) {
  const [visible, setVisible] = useState(true);
  const [gems, setGems] = useState<Gem[]>([]);
  const [filter, setFilter] = useState('');
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [tags, setTags] = useState('');
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [busy, setBusy] = useState(false);

  const toast = (message: string, variant?: string) =>
    window.dispatchEvent(new CustomEvent('show-toast', { detail: { message, variant } }));

  const authToken = token || localStorage.getItem('secure_auth_token');
  const api = async (path: string, method = 'GET', body?: unknown) => {
    const res = await fetch(path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error((err as any).error || `Request failed (${res.status})`);
    }
    return res.json();
  };

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (filter) params.set('tag', filter);
      const d = await api(`/api/gems?${params.toString()}`, 'GET');
      setGems(d.gems || []);
    } catch { /* ignore */ }
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  const useMyLocation = () => {
    if (!('geolocation' in navigator)) return toast('Geolocation not supported.');
    navigator.geolocation.getCurrentPosition((pos) => {
      setLat(pos.coords.latitude.toFixed(5));
      setLng(pos.coords.longitude.toFixed(5));
      toast('Location captured.');
    }, () => toast('Location denied.', 'destructive'));
  };

  const create = async () => {
    if (!name.trim()) return toast('Name is required.');
    setBusy(true);
    try {
      await api('/api/gems', 'POST', { name, desc, tags: tags.split(',').map(t => t.trim()).filter(Boolean), lat: Number(lat), lng: Number(lng) });
      toast('Gem dropped — others can find it.');
      setName(''); setDesc(''); setTags(''); setLat(''); setLng('');
      await load();
    } catch (e: any) { toast(e.message || 'Failed.', 'destructive'); } finally { setBusy(false); }
  };

  const upvote = async (id: string) => {
    try {
      await api(`/api/gems/${id}/upvote`, 'POST');
      await load();
    } catch (e: any) { toast(e.message, 'destructive'); }
  };

  const shell = 'fixed inset-0 z-[115] bg-[#141b2b]/55 dark:bg-[#05060c]/85 backdrop-blur-sm overflow-y-auto py-6 px-4';
  const card = 'bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-3xl p-5 md:p-6 space-y-4 shadow-xs';
  const btnPrimary = 'flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#3a342a] text-[#f4f1ea] text-[10px] font-mono uppercase font-bold hover:bg-[#52493b] disabled:opacity-50';
  const input = 'w-full bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 rounded-xl px-3 py-2 text-xs text-[#3a342a] dark:text-zinc-100 placeholder-[#8a8172]/60 outline-none focus:border-amber-400 transition-colors';

  return (
    <AnimatePresence onExitComplete={() => onClose()}>
      {visible && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className={shell}>
          <div className="max-w-xl mx-auto">
            <div className="flex items-center justify-between mb-4">
              <span className="font-mono text-[10px] uppercase tracking-widest text-[#8a8172] dark:text-zinc-400">Hidden gems</span>
              <button onClick={() => setVisible(false)} className="w-9 h-9 rounded-full bg-white/80 dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 flex items-center justify-center text-[#5c5446] dark:text-zinc-300 hover:bg-[#ebdcca]/50 transition-all" aria-label="Close">
                <X size={16} />
              </button>
            </div>

            <div className={card}>
              <div className="flex items-center gap-2">
                <span className="w-9 h-9 rounded-full bg-fuchsia-800/10 dark:bg-fuchsia-400/10 flex items-center justify-center">
                  <Gem className="text-fuchsia-800 dark:text-fuchsia-400" size={17} />
                </span>
                <div className="flex-1">
                  <h2 className="font-display text-lg font-bold text-[#3a342a] dark:text-zinc-100">Hidden Gem Drops</h2>
                  <p className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-400">Scenic spots, dropped with GPS</p>
                </div>
              </div>

              {currentUser && (
                <div className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 p-3 space-y-2">
                  <div className="font-mono text-[9px] uppercase font-bold tracking-wider text-[#5c5446] dark:text-zinc-300"><Plus size={11} className="inline" /> Drop a gem</div>
                  <input className={input} value={name} onChange={e => setName(e.target.value)} placeholder="Place name" />
                  <div className="grid grid-cols-2 gap-2">
                    <input className={input} value={lat} onChange={e => setLat(e.target.value)} placeholder="Latitude" />
                    <input className={input} value={lng} onChange={e => setLng(e.target.value)} placeholder="Longitude" />
                  </div>
                  <button onClick={useMyLocation} className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-[#cfcac0] dark:border-zinc-700 text-[10px] font-mono uppercase font-bold text-[#3a342a] dark:text-zinc-100 hover:bg-[#ebdcca]/40">
                    <MapPin size={11} /> Use my location
                  </button>
                  <input className={input} value={tags} onChange={e => setTags(e.target.value)} placeholder="Tags (e.g. sunset, waterfall, tea garden)" />
                  <input className={input} value={desc} onChange={e => setDesc(e.target.value)} placeholder="Why is it special?" />
                  <button onClick={create} disabled={busy} className={`${btnPrimary} w-full justify-center`}>
                    {busy ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />} Drop gem
                  </button>
                </div>
              )}

              <input className={input} value={filter} onChange={e => setFilter(e.target.value)} placeholder="Filter by tag" />

              <div className="space-y-2">
                {gems.length === 0 && <p className="text-center text-[10px] text-[#8a8172] dark:text-zinc-500 py-4">No gems dropped yet.</p>}
                {gems.map(g => (
                  <div key={g.id} className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 p-3 bg-white/60 dark:bg-zinc-950/40">
                    <div className="flex items-center gap-2">
                      <Gem size={13} className="text-fuchsia-700 dark:text-fuchsia-300 shrink-0" />
                      <span className="flex-1 font-bold text-xs text-[#3a342a] dark:text-zinc-100">{g.name}</span>
                      <span className="font-mono text-[9px] text-[#8a8172]">{g.upvotes.length} 💎</span>
                    </div>
                    <div className="flex items-center gap-1 text-[9px] font-mono uppercase text-[#8a8172] dark:text-zinc-500 mt-0.5">
                      <MapPin size={9} /> {g.lat}, {g.lng} · by {g.userName}
                    </div>
                    {g.desc && <p className="text-[10px] text-[#5c5446] dark:text-zinc-300 mt-1 line-clamp-2">{g.desc}</p>}
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {g.tags.map(t => (
                        <button key={t} onClick={() => setFilter(t)} className="px-1.5 py-0.5 rounded-full bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 text-[8px] font-mono uppercase text-[#8a8172] hover:border-fuchsia-400">#{t}</button>
                      ))}
                    </div>
                    {currentUser && (
                      <button onClick={() => upvote(g.id)} className={`${btnPrimary} mt-2 ${g.upvotes.includes(currentUser.id) ? '!bg-fuchsia-700' : ''}`}>
                        <ArrowUp size={11} /> {g.upvotes.includes(currentUser.id) ? 'Gemmed' : 'Gem it'}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
