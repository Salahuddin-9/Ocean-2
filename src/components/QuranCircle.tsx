import { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, BookOpen, Plus, Loader2, Users, MicOff, Send, Video } from 'lucide-react';

/**
 * Ocean — Quran/Hadith Circle Voice Rooms (Feature 226)
 * --------------------------------------------------------
 * Voice study circles with a moderator, Jitsi voice link and a moderated
 * discussion log. Moderators can mute participants. Backed by /api/quran-circles.
 */

interface QuranCircleProps {
  token: string | null;
  currentUser: { id: string; name: string } | null;
  onClose: () => void;
}

interface Circle {
  id: string; name: string; topic: string; moderatorId: string; moderatorName: string;
  members: { id: string; name: string }[]; muted: string[]; meetUrl: string;
  log: { by: string; text: string; at: number }[]; joined: boolean; mutedByMod: boolean;
}

export default function QuranCircle({ token, currentUser, onClose }: QuranCircleProps) {
  const [visible, setVisible] = useState(true);
  const [circles, setCircles] = useState<Circle[]>([]);
  const [selected, setSelected] = useState<Circle | null>(null);
  const [name, setName] = useState('');
  const [topic, setTopic] = useState('');
  const [note, setNote] = useState('');
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
      const d = await api('/api/quran-circles', 'GET');
      setCircles(d.circles || []);
      setSelected((sel) => sel ? d.circles.find((c: Circle) => c.id === sel.id) || null : null);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { load(); }, [load]);

  const create = async () => {
    if (!name.trim()) return toast('Circle name is required.');
    setBusy(true);
    try {
      const d = await api('/api/quran-circles', 'POST', { name, topic });
      toast('Circle created — share the Jitsi link.');
      setName(''); setTopic('');
      await load();
      setSelected(d.circle);
    } catch (e: any) { toast(e.message || 'Failed.', 'destructive'); } finally { setBusy(false); }
  };

  const toggleJoin = async (id: string) => {
    try {
      await api(`/api/quran-circles/${id}/join`, 'POST');
      await load();
    } catch (e: any) { toast(e.message, 'destructive'); }
  };

  const postNote = async () => {
    if (!note.trim() || !selected) return;
    try {
      const d = await api(`/api/quran-circles/${selected.id}/note`, 'POST', { text: note });
      setSelected({ ...selected, log: d.log });
      setNote('');
    } catch (e: any) { toast(e.message, 'destructive'); }
  };

  const mute = async (memberId: string) => {
    try {
      await api(`/api/quran-circles/${selected!.id}/mute`, 'POST', { memberId });
      await load();
    } catch (e: any) { toast(e.message, 'destructive'); }
  };

  const shell = 'fixed inset-0 z-[115] bg-[#f6f1e7]/95 dark:bg-zinc-950/95 backdrop-blur-sm overflow-y-auto py-6 px-4';
  const card = 'bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-3xl p-5 md:p-6 space-y-4 shadow-xs';
  const btnPrimary = 'flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#3a342a] text-[#f4f1ea] text-[10px] font-mono uppercase font-bold hover:bg-[#52493b] disabled:opacity-50';
  const input = 'w-full bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 rounded-xl px-3 py-2 text-xs text-[#3a342a] dark:text-zinc-100 placeholder-[#8a8172]/60 outline-none focus:border-amber-400 transition-colors';

  return (
    <AnimatePresence onExitComplete={() => onClose()}>
      {visible && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className={shell}>
          <div className="max-w-xl mx-auto">
            <div className="flex items-center justify-between mb-4">
              <span className="font-mono text-[10px] uppercase tracking-widest text-[#8a8172] dark:text-zinc-400">Quran circles</span>
              <button onClick={() => setVisible(false)} className="w-9 h-9 rounded-full bg-white/80 dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 flex items-center justify-center text-[#5c5446] dark:text-zinc-300 hover:bg-[#ebdcca]/50 transition-all" aria-label="Close">
                <X size={16} />
              </button>
            </div>

            <div className={card}>
              <div className="flex items-center gap-2">
                <span className="w-9 h-9 rounded-full bg-emerald-800/10 dark:bg-emerald-400/10 flex items-center justify-center">
                  <BookOpen className="text-emerald-800 dark:text-emerald-400" size={17} />
                </span>
                <div className="flex-1">
                  <h2 className="font-display text-lg font-bold text-[#3a342a] dark:text-zinc-100">Quran / Hadith Circles</h2>
                  <p className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-400">Voice rooms · moderated discussion</p>
                </div>
              </div>

              {selected ? (
                <div className="space-y-3">
                  <button onClick={() => setSelected(null)} className="text-[10px] font-mono uppercase text-[#8a8172] hover:text-[#3a342a] dark:hover:text-zinc-100">← All circles</button>
                  <div className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 p-4 bg-white/60 dark:bg-zinc-950/40">
                    <div className="flex items-center gap-2">
                      <div className="flex-1">
                        <div className="font-display font-bold text-sm text-[#3a342a] dark:text-zinc-100">{selected.name}</div>
                        <div className="text-[10px] text-[#8a8172] dark:text-zinc-400">{selected.topic || 'Open study circle'} · moderator: {selected.moderatorName}</div>
                      </div>
                      {currentUser && (
                        <button onClick={() => toggleJoin(selected.id)} className={`${btnPrimary} shrink-0`}>
                          <Users size={11} /> {selected.joined ? 'Joined' : 'Join'}
                        </button>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {selected.members.map(m => (
                        <span key={m.id} className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 text-[9px] font-mono uppercase text-[#5c5446] dark:text-zinc-300">
                          {selected.muted.includes(m.id) && <MicOff size={9} className="text-rose-500" />}
                          {m.name}
                        </span>
                      ))}
                    </div>
                    <a href={selected.meetUrl} target="_blank" rel="noreferrer" className={`${btnPrimary} mt-3 inline-flex`}>
                      <Video size={11} /> Join voice room
                    </a>
                  </div>

                  <div className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 p-3 space-y-1.5 max-h-56 overflow-y-auto">
                    {selected.log.map((l, i) => (
                      <div key={i} className="text-[10px] text-[#5c5446] dark:text-zinc-300">
                        <b className="text-emerald-800 dark:text-emerald-300">{l.by}:</b> {l.text}
                      </div>
                    ))}
                  </div>
                  {currentUser && (
                    <div className="flex gap-1.5">
                      <input className={`${input} flex-1`} value={note} onChange={e => setNote(e.target.value)} placeholder={selected.mutedByMod ? 'You are muted…' : 'Discussion note / ayah reference…'} disabled={selected.mutedByMod} onKeyDown={e => { if (e.key === 'Enter') postNote(); }} />
                      <button onClick={postNote} disabled={busy || selected.mutedByMod} className={btnPrimary}><Send size={11} /></button>
                    </div>
                  )}
                  {currentUser && selected.moderatorId === currentUser.id && (
                    <div className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 p-3">
                      <div className="font-mono text-[9px] uppercase font-bold tracking-wider text-[#5c5446] dark:text-zinc-300 mb-1.5">Moderator — mute/unmute</div>
                      {selected.members.filter(m => m.id !== selected.moderatorId).map(m => (
                        <button key={m.id} onClick={() => mute(m.id)} className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[9px] font-mono uppercase font-bold mr-1.5 mb-1.5 transition-all ${selected.muted.includes(m.id) ? 'bg-rose-800/10 text-rose-700 dark:text-rose-300' : 'bg-white border border-[#ebdcca] dark:border-zinc-700 text-[#8a8172]'}`}>
                          <MicOff size={10} /> {m.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  {currentUser && (
                    <div className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 p-3 space-y-2">
                      <div className="font-mono text-[9px] uppercase font-bold tracking-wider text-[#5c5446] dark:text-zinc-300"><Plus size={11} className="inline" /> Create a circle</div>
                      <input className={input} value={name} onChange={e => setName(e.target.value)} placeholder="Circle name (e.g. Surah Kahf Fridays)" />
                      <input className={input} value={topic} onChange={e => setTopic(e.target.value)} placeholder="Topic / weekly focus" />
                      <button onClick={create} disabled={busy} className={`${btnPrimary} w-full justify-center`}>
                        {busy ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />} Create circle
                      </button>
                    </div>
                  )}
                  {circles.length === 0 && <p className="text-center text-[10px] text-[#8a8172] dark:text-zinc-500 py-4">No circles yet.</p>}
                  {circles.map(c => (
                    <button key={c.id} onClick={() => setSelected(c)}
                      className="w-full text-left rounded-2xl border border-[#ebdcca] dark:border-zinc-800 p-3 bg-white/60 dark:bg-zinc-950/40 hover:border-emerald-400 hover:bg-emerald-50/40 dark:hover:bg-zinc-800/60 transition-all">
                      <div className="flex items-center gap-2">
                        <span className="flex-1 min-w-0 font-bold text-xs text-[#3a342a] dark:text-zinc-100 truncate">{c.name}</span>
                        {c.joined && <span className="font-mono text-[8px] uppercase bg-emerald-800/10 text-emerald-700 dark:text-emerald-300 px-1.5 py-0.5 rounded-full">Joined</span>}
                      </div>
                      <div className="text-[10px] text-[#8a8172] dark:text-zinc-400 mt-0.5">{c.topic || 'Open study'} · {c.members.length} member{c.members.length === 1 ? '' : 's'}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
