import { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, CalendarHeart, Plus, Loader2, MapPin, Clock, Users, Megaphone } from 'lucide-react';

/**
 * Ocean — Religious Event Coordination (Feature 227)
 * -----------------------------------------------------
 * Publish events tagged by religious/cultural category, RSVP, and get updates
 * from organizers. Backed by /api/events.
 */

interface ReligiousEventsProps {
  token: string | null;
  currentUser: { id: string; name: string } | null;
  onClose: () => void;
}

interface EventItem {
  id: string; title: string; category: string; venue: string; at: number; desc: string;
  organizerName: string; organizerId: string; rsvps: { userId: string }[]; rsvped: boolean;
  updates: { text: string; at: number }[];
}

export default function ReligiousEvents({ token, currentUser, onClose }: ReligiousEventsProps) {
  const [visible, setVisible] = useState(true);
  const [list, setList] = useState<EventItem[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [filter, setFilter] = useState('');
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('Eid');
  const [venue, setVenue] = useState('');
  const [at, setAt] = useState('');
  const [desc, setDesc] = useState('');
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
      if (filter) params.set('category', filter);
      const d = await api(`/api/events?${params.toString()}`, 'GET');
      setList(d.events || []);
      setCategories(d.categories || []);
    } catch { /* ignore */ }
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  const publish = async () => {
    if (!title.trim()) return toast('Event title is required.');
    if (!at) return toast('Pick an event time.');
    setBusy(true);
    try {
      await api('/api/events', 'POST', { title, category, venue, at: new Date(at).getTime(), desc });
      toast('Event published.');
      setTitle(''); setVenue(''); setDesc(''); setAt('');
      await load();
    } catch (e: any) { toast(e.message || 'Failed.', 'destructive'); } finally { setBusy(false); }
  };

  const rsvp = async (id: string) => {
    try {
      await api(`/api/events/${id}/rsvp`, 'POST');
      await load();
    } catch (e: any) { toast(e.message, 'destructive'); }
  };

  const update = async (id: string) => {
    const text = window.prompt('Announcement to attendees:');
    if (!text) return;
    try {
      await api(`/api/events/${id}/update`, 'POST', { text });
      toast('Update posted.');
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
              <span className="font-mono text-[10px] uppercase tracking-widest text-[#8a8172] dark:text-zinc-400">Religious events</span>
              <button onClick={() => setVisible(false)} className="w-9 h-9 rounded-full bg-white/80 dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 flex items-center justify-center text-[#5c5446] dark:text-zinc-300 hover:bg-[#ebdcca]/50 transition-all" aria-label="Close">
                <X size={16} />
              </button>
            </div>

            <div className={card}>
              <div className="flex items-center gap-2">
                <span className="w-9 h-9 rounded-full bg-emerald-800/10 dark:bg-emerald-400/10 flex items-center justify-center">
                  <CalendarHeart className="text-emerald-800 dark:text-emerald-400" size={17} />
                </span>
                <div className="flex-1">
                  <h2 className="font-display text-lg font-bold text-[#3a342a] dark:text-zinc-100">Religious Events</h2>
                  <p className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-400">RSVP · coordination · organizer updates</p>
                </div>
              </div>

              {currentUser && (
                <div className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 p-3 space-y-2">
                  <div className="font-mono text-[9px] uppercase font-bold tracking-wider text-[#5c5446] dark:text-zinc-300"><Plus size={11} className="inline" /> Publish an event</div>
                  <div className="grid grid-cols-2 gap-2">
                    <input className={input} value={title} onChange={e => setTitle(e.target.value)} placeholder="Event title" />
                    <select className={input} value={category} onChange={e => setCategory(e.target.value)}>
                      {(categories.length ? categories : ['Eid', 'Milad', 'Quran', 'Hadith', 'Puja', 'Christmas', 'Community Iftar', 'Other']).map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <input className={input} value={venue} onChange={e => setVenue(e.target.value)} placeholder="Venue" />
                    <input className={input} type="datetime-local" value={at} onChange={e => setAt(e.target.value)} />
                  </div>
                  <input className={input} value={desc} onChange={e => setDesc(e.target.value)} placeholder="Details" />
                  <button onClick={publish} disabled={busy} className={`${btnPrimary} w-full justify-center`}>
                    {busy ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />} Publish
                  </button>
                </div>
              )}

              <div className="flex gap-1.5 flex-wrap">
                <button onClick={() => setFilter('')} className={`px-2 py-1 rounded-full text-[9px] font-mono uppercase transition-all ${!filter ? 'bg-[#3a342a] text-[#f4f1ea]' : 'bg-white border border-[#ebdcca] dark:border-zinc-700 text-[#8a8172]'}`}>All</button>
                {categories.map(c => (
                  <button key={c} onClick={() => setFilter(c)} className={`px-2 py-1 rounded-full text-[9px] font-mono uppercase transition-all ${filter === c ? 'bg-[#3a342a] text-[#f4f1ea]' : 'bg-white border border-[#ebdcca] dark:border-zinc-700 text-[#8a8172]'}`}>{c}</button>
                ))}
              </div>

              <div className="space-y-2">
                {list.length === 0 && <p className="text-center text-[10px] text-[#8a8172] dark:text-zinc-500 py-4">No events yet.</p>}
                {list.map(e => (
                  <div key={e.id} className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 p-3 bg-white/60 dark:bg-zinc-950/40">
                    <div className="flex items-center gap-2">
                      <span className="flex-1 font-bold text-xs text-[#3a342a] dark:text-zinc-100">{e.title}</span>
                      <span className="font-mono text-[8px] uppercase px-1.5 py-0.5 rounded-full bg-emerald-800/10 text-emerald-700 dark:text-emerald-300">{e.category}</span>
                    </div>
                    <div className="flex flex-wrap gap-2 mt-1 text-[9px] font-mono uppercase text-[#8a8172] dark:text-zinc-500">
                      <span className="flex items-center gap-0.5"><Clock size={9} /> {new Date(e.at).toLocaleString()}</span>
                      {e.venue && <span className="flex items-center gap-0.5"><MapPin size={9} /> {e.venue}</span>}
                      <span className="flex items-center gap-0.5"><Users size={9} /> {e.rsvps.length} going</span>
                    </div>
                    {e.desc && <p className="text-[10px] text-[#5c5446] dark:text-zinc-300 mt-1 line-clamp-2">{e.desc}</p>}
                    {e.updates.length > 0 && (
                      <div className="mt-1.5 space-y-0.5 rounded-xl bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 p-2">
                        {e.updates.slice(-2).map((u, i) => (
                          <div key={i} className="flex items-start gap-1.5 text-[9px] text-[#5c5446] dark:text-zinc-300">
                            <Megaphone size={9} className="text-emerald-700 dark:text-emerald-300 mt-0.5 shrink-0" /> {u.text}
                          </div>
                        ))}
                      </div>
                    )}
                    {currentUser && (
                      <div className="flex gap-1.5 mt-2">
                        <button onClick={() => rsvp(e.id)} className={`${btnPrimary} ${e.rsvped ? '!bg-emerald-700' : ''}`}>
                          <Users size={11} /> {e.rsvped ? 'Going' : 'RSVP'}
                        </button>
                        {e.organizerId === currentUser.id && (
                          <button onClick={() => update(e.id)} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-[#cfcac0] dark:border-zinc-700 text-[10px] font-mono uppercase font-bold text-[#3a342a] dark:text-zinc-100 hover:bg-[#ebdcca]/40">
                            <Megaphone size={11} /> Announce
                          </button>
                        )}
                      </div>
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
