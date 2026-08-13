import { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, TrendingUp, Plus, Loader2, MapPin, ArrowUp } from 'lucide-react';

/**
 * Ocean — Civic Issue Escalation Ladder (Feature 215)
 * -----------------------------------------------------
 * Report civic issues; they auto-escalate (1 pothole → 2 ward → 3
 * municipality → 4 ombudsman) with age and community upvotes.
 * Backed by /api/civic/issues.
 */

interface CivicEscalationProps {
  token: string | null;
  currentUser: { id: string; name: string } | null;
  onClose: () => void;
}

interface Issue {
  id: string; userName: string; category: string; title: string; desc: string;
  location: string; level: number; upvotes: string[]; status: string; createdAt: number;
}

const LEVELS = ['Reported', 'Ward office', 'Municipality', 'Ombudsman'];

export default function CivicEscalation({ token, currentUser, onClose }: CivicEscalationProps) {
  const [visible, setVisible] = useState(true);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [category, setCategory] = useState('');
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [location, setLocation] = useState('');
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
      const d = await api('/api/civic/issues', 'GET');
      setIssues(d.issues || []);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { load(); }, [load]);

  const report = async () => {
    if (!title.trim()) return toast('Title is required.');
    setBusy(true);
    try {
      await api('/api/civic/issues', 'POST', { category, title, desc, location });
      toast('Issue reported — it will escalate as the community engages.');
      setCategory(''); setTitle(''); setDesc(''); setLocation('');
      await load();
    } catch (e: any) { toast(e.message || 'Failed.', 'destructive'); } finally { setBusy(false); }
  };

  const upvote = async (id: string) => {
    try {
      await api(`/api/civic/issues/${id}/upvote`, 'POST');
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
              <span className="font-mono text-[10px] uppercase tracking-widest text-[#8a8172] dark:text-zinc-400">Civic issues</span>
              <button onClick={() => setVisible(false)} className="w-9 h-9 rounded-full bg-white/80 dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 flex items-center justify-center text-[#5c5446] dark:text-zinc-300 hover:bg-[#ebdcca]/50 transition-all" aria-label="Close">
                <X size={16} />
              </button>
            </div>

            <div className={card}>
              <div className="flex items-center gap-2">
                <span className="w-9 h-9 rounded-full bg-orange-800/10 dark:bg-orange-400/10 flex items-center justify-center">
                  <TrendingUp className="text-orange-800 dark:text-orange-400" size={17} />
                </span>
                <div className="flex-1">
                  <h2 className="font-display text-lg font-bold text-[#3a342a] dark:text-zinc-100">Civic Escalation</h2>
                  <p className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-400">Reported → ward → municipality → ombudsman</p>
                </div>
              </div>

              {currentUser && (
                <div className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 p-3 space-y-2">
                  <div className="font-mono text-[9px] uppercase font-bold tracking-wider text-[#5c5446] dark:text-zinc-300"><Plus size={11} className="inline" /> Report an issue</div>
                  <div className="grid grid-cols-2 gap-2">
                    <input className={input} value={title} onChange={e => setTitle(e.target.value)} placeholder="Title (e.g. Broken streetlight)" />
                    <input className={input} value={category} onChange={e => setCategory(e.target.value)} placeholder="Category (e.g. Road, Drain)" />
                  </div>
                  <input className={input} value={location} onChange={e => setLocation(e.target.value)} placeholder="Location (e.g. Road 12, Dhanmondi)" />
                  <input className={input} value={desc} onChange={e => setDesc(e.target.value)} placeholder="Details" />
                  <button onClick={report} disabled={busy} className={`${btnPrimary} w-full justify-center`}>
                    {busy ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />} Report
                  </button>
                </div>
              )}

              <div className="space-y-2">
                {issues.length === 0 && <p className="text-center text-[10px] text-[#8a8172] dark:text-zinc-500 py-4">No issues reported yet.</p>}
                {issues.map(i => (
                  <div key={i.id} className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 p-3 bg-white/60 dark:bg-zinc-950/40">
                    <div className="flex items-center gap-2">
                      <span className="flex-1 font-bold text-xs text-[#3a342a] dark:text-zinc-100">{i.title}</span>
                      <span className="font-mono text-[8px] uppercase px-1.5 py-0.5 rounded-full bg-orange-800/10 text-orange-700 dark:text-orange-300">L{i.level}</span>
                    </div>
                    <div className="text-[9px] font-mono uppercase text-[#8a8172] dark:text-zinc-500 mt-0.5">
                      {LEVELS[i.level - 1] || LEVELS[3]} · {i.category}{i.status === 'resolved' ? ' · resolved' : ''}
                    </div>
                    {i.location && <div className="flex items-center gap-1 text-[9px] text-[#8a8172] dark:text-zinc-500 mt-0.5"><MapPin size={9} /> {i.location}</div>}
                    {i.desc && <p className="text-[10px] text-[#5c5446] dark:text-zinc-300 mt-1 line-clamp-2">{i.desc}</p>}
                    {currentUser && i.status === 'open' && (
                      <button onClick={() => upvote(i.id)} className={`${btnPrimary} mt-2 ${i.upvotes.includes(currentUser.id) ? '!bg-orange-700' : ''}`}>
                        <ArrowUp size={11} /> {i.upvotes.length} {i.upvotes.includes(currentUser.id) ? 'Upvoted' : 'Upvote'}
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <p className="font-mono text-[8px] uppercase tracking-wide text-[#8a8172] dark:text-zinc-500">
                Auto-escalation: level 2 after 3 days / 20 upvotes, level 3 after 7 days, level 4 after 14 days.
              </p>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
