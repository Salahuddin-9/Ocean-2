import { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, ClipboardList, Plus, Users, CalendarClock, FileText, StickyNote, Loader2 } from 'lucide-react';

/**
 * Ocean — Exam War Room (Feature 200)
 * -------------------------------------
 * Study rooms with a shared countdown, past papers and study notes.
 * Backed by /api/exam-rooms.
 */

interface ExamWarRoomProps {
  token: string | null;
  currentUser: { id: string; name: string } | null;
  onClose: () => void;
}

interface Room {
  id: string; name: string; subject: string; examDate: number;
  members: { id: string; name: string }[]; joined: boolean;
  papers: { id: string; title: string; year: string; url: string }[];
  notes: { id: string; userName: string; text: string; at: number }[];
  createdAt: number;
}

export default function ExamWarRoom({ token, currentUser, onClose }: ExamWarRoomProps) {
  const [visible, setVisible] = useState(true);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [selected, setSelected] = useState<Room | null>(null);
  const [name, setName] = useState('');
  const [subject, setSubject] = useState('');
  const [examDate, setExamDate] = useState('');
  const [paperTitle, setPaperTitle] = useState('');
  const [paperYear, setPaperYear] = useState('');
  const [paperUrl, setPaperUrl] = useState('');
  const [noteText, setNoteText] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());

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
    setLoading(true);
    try {
      const d = await api('/api/exam-rooms', 'GET');
      setRooms(d.rooms || []);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const create = async () => {
    if (!name.trim()) return toast('Room name is required.');
    setBusy(true);
    try {
      const d = await api('/api/exam-rooms', 'POST', {
        name, subject, examDate: examDate ? new Date(examDate + 'T23:59:59').getTime() : 0,
      });
      toast('War room created.');
      setName(''); setSubject(''); setExamDate('');
      await load();
      setSelected(d.room);
    } catch (e: any) { toast(e.message || 'Failed.', 'destructive'); } finally { setBusy(false); }
  };

  const toggleJoin = async (id: string) => {
    try {
      const d = await api(`/api/exam-rooms/${id}/join`, 'POST');
      toast(d.joined ? 'Joined the room.' : 'Left the room.');
      await load();
      if (selected?.id === id) {
        const fresh = (await api('/api/exam-rooms', 'GET')).rooms.find((r: Room) => r.id === id);
        setSelected(fresh);
      }
    } catch (e: any) { toast(e.message, 'destructive'); }
  };

  const addPaper = async () => {
    if (!paperTitle.trim() || !selected) return toast('Paper title is required.');
    setBusy(true);
    try {
      const d = await api(`/api/exam-rooms/${selected.id}/papers`, 'POST', { title: paperTitle, year: paperYear, url: paperUrl });
      setSelected({ ...selected, papers: d.papers });
      setPaperTitle(''); setPaperYear(''); setPaperUrl('');
      toast('Past paper added.');
    } catch (e: any) { toast(e.message || 'Failed.', 'destructive'); } finally { setBusy(false); }
  };

  const addNote = async () => {
    if (!noteText.trim() || !selected) return toast('Note is empty.');
    setBusy(true);
    try {
      const d = await api(`/api/exam-rooms/${selected.id}/notes`, 'POST', { text: noteText });
      setSelected({ ...selected, notes: d.notes });
      setNoteText('');
      toast('Note added.');
    } catch (e: any) { toast(e.message || 'Failed.', 'destructive'); } finally { setBusy(false); }
  };

  const countdown = (ts: number) => {
    if (!ts) return 'No exam date set';
    const diff = ts - now;
    if (diff <= 0) return 'Exam day! Good luck 🍀';
    const d = Math.floor(diff / 86400000);
    const h = Math.floor((diff % 86400000) / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    return `${d}d ${h}h ${m}m to go`;
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
              <span className="font-mono text-[10px] uppercase tracking-widest text-[#8a8172] dark:text-zinc-400">Exam war room</span>
              <button onClick={() => setVisible(false)} className="w-9 h-9 rounded-full bg-white/80 dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 flex items-center justify-center text-[#5c5446] dark:text-zinc-300 hover:bg-[#ebdcca]/50 transition-all" aria-label="Close">
                <X size={16} />
              </button>
            </div>

            <div className={card}>
              <div className="flex items-center gap-2">
                <span className="w-9 h-9 rounded-full bg-rose-800/10 dark:bg-rose-400/10 flex items-center justify-center">
                  <ClipboardList className="text-rose-800 dark:text-rose-400" size={17} />
                </span>
                <div className="flex-1">
                  <h2 className="font-display text-lg font-bold text-[#3a342a] dark:text-zinc-100">Exam War Room</h2>
                  <p className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-400">Countdown · past papers · study notes</p>
                </div>
              </div>

              {selected ? (
                <div className="space-y-3">
                  <button onClick={() => setSelected(null)} className="text-[10px] font-mono uppercase text-[#8a8172] hover:text-[#3a342a] dark:hover:text-zinc-100">← All rooms</button>
                  <div className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 p-4 bg-white/60 dark:bg-zinc-950/40">
                    <div className="flex items-center gap-2">
                      <div className="flex-1">
                        <div className="font-display font-bold text-sm text-[#3a342a] dark:text-zinc-100">{selected.name}</div>
                        <div className="text-[10px] text-[#8a8172] dark:text-zinc-400">{selected.subject || 'General'}</div>
                      </div>
                      {currentUser && (
                        <button onClick={() => toggleJoin(selected.id)} className={`${btnPrimary} shrink-0`}>
                          <Users size={11} /> {selected.joined ? 'Joined' : 'Join'}
                        </button>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 mt-2 text-[11px] font-mono text-rose-700 dark:text-rose-300">
                      <CalendarClock size={12} /> {countdown(selected.examDate)}
                    </div>
                    <div className="text-[9px] font-mono uppercase text-[#8a8172] dark:text-zinc-500 mt-1">{selected.members.length} member{selected.members.length === 1 ? '' : 's'}</div>
                  </div>

                  <div className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 p-3 space-y-2">
                    <div className="font-mono text-[9px] uppercase font-bold tracking-wider text-[#5c5446] dark:text-zinc-300"><FileText size={11} className="inline" /> Past papers ({selected.papers.length})</div>
                    {selected.papers.length === 0 && <p className="text-[10px] text-[#8a8172] dark:text-zinc-500">No papers yet.</p>}
                    {selected.papers.map(p => (
                      <div key={p.id} className="flex items-center gap-2 rounded-xl bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 px-2.5 py-1.5">
                        <FileText size={11} className="text-[#8a8172] shrink-0" />
                        <span className="flex-1 min-w-0 text-[11px] text-[#3a342a] dark:text-zinc-100 truncate">{p.title}</span>
                        {p.year && <span className="font-mono text-[9px] text-[#8a8172]">{p.year}</span>}
                        {p.url && <a href={p.url} target="_blank" rel="noreferrer" className="text-[9px] font-mono uppercase text-rose-700 dark:text-rose-300">open</a>}
                      </div>
                    ))}
                    {currentUser && selected.joined && (
                      <div className="grid grid-cols-3 gap-1.5 pt-1">
                        <input className={`${input} col-span-1`} value={paperTitle} onChange={e => setPaperTitle(e.target.value)} placeholder="Paper title" />
                        <input className={`${input} col-span-1`} value={paperYear} onChange={e => setPaperYear(e.target.value)} placeholder="Year" />
                        <button onClick={addPaper} disabled={busy} className={`${btnPrimary} justify-center`}><Plus size={11} /></button>
                        <input className={`${input} col-span-3`} value={paperUrl} onChange={e => setPaperUrl(e.target.value)} placeholder="File / drive URL" />
                      </div>
                    )}
                  </div>

                  <div className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 p-3 space-y-2">
                    <div className="font-mono text-[9px] uppercase font-bold tracking-wider text-[#5c5446] dark:text-zinc-300"><StickyNote size={11} className="inline" /> Study notes ({selected.notes.length})</div>
                    {selected.notes.length === 0 && <p className="text-[10px] text-[#8a8172] dark:text-zinc-500">No notes yet.</p>}
                    {selected.notes.slice().reverse().map(n => (
                      <div key={n.id} className="rounded-xl bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 px-2.5 py-1.5">
                        <div className="text-[10px] font-bold text-[#3a342a] dark:text-zinc-100">{n.userName}</div>
                        <div className="text-[11px] text-[#5c5446] dark:text-zinc-300 mt-0.5 whitespace-pre-wrap">{n.text}</div>
                      </div>
                    ))}
                    {currentUser && selected.joined && (
                      <div className="flex gap-1.5 pt-1">
                        <input className={`${input} flex-1`} value={noteText} onChange={e => setNoteText(e.target.value)} placeholder="Add a study note…" onKeyDown={e => { if (e.key === 'Enter') addNote(); }} />
                        <button onClick={addNote} disabled={busy} className={btnPrimary}><Plus size={11} /></button>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 p-3 space-y-2">
                    <div className="font-mono text-[9px] uppercase font-bold tracking-wider text-[#5c5446] dark:text-zinc-300"><Plus size={11} className="inline" /> Create a war room</div>
                    <div className="grid grid-cols-2 gap-2">
                      <input className={input} value={name} onChange={e => setName(e.target.value)} placeholder="Room name" />
                      <input className={input} value={subject} onChange={e => setSubject(e.target.value)} placeholder="Subject" />
                      <input className={input} type="date" value={examDate} onChange={e => setExamDate(e.target.value)} />
                    </div>
                    <button onClick={create} disabled={busy} className={`${btnPrimary} w-full justify-center`}>
                      {busy ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />} Create room
                    </button>
                  </div>
                  {loading ? (
                    <div className="py-8 text-center font-mono text-[10px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-400 flex items-center justify-center gap-2">
                      <Loader2 size={13} className="animate-spin" /> Loading…
                    </div>
                  ) : rooms.length === 0 ? (
                    <p className="text-center text-[10px] text-[#8a8172] dark:text-zinc-500 py-6">No war rooms yet.</p>
                  ) : (
                    rooms.map(r => (
                      <button key={r.id} onClick={() => setSelected(r)}
                        className="w-full text-left rounded-2xl border border-[#ebdcca] dark:border-zinc-800 p-3 bg-white/60 dark:bg-zinc-950/40 hover:border-rose-400 hover:bg-rose-50/40 dark:hover:bg-zinc-800/60 transition-all">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="font-bold text-xs text-[#3a342a] dark:text-zinc-100 truncate">{r.name}</div>
                            <div className="text-[10px] text-[#8a8172] dark:text-zinc-400">{r.subject || 'General'} · {r.members.length} members</div>
                          </div>
                          {r.joined && <span className="font-mono text-[8px] uppercase bg-emerald-800/10 text-emerald-700 dark:text-emerald-300 px-1.5 py-0.5 rounded-full">Joined</span>}
                        </div>
                        <div className="text-[10px] font-mono text-rose-700 dark:text-rose-300 mt-1.5 flex items-center gap-1">
                          <CalendarClock size={10} /> {countdown(r.examDate)}
                        </div>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
