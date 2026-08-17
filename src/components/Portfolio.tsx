import { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, BadgeCheck, Briefcase, Plus, Trash2, Loader2, UserRound } from 'lucide-react';

/**
 * Ocean — Verified Freelancer Portfolio (Feature 193)
 * ----------------------------------------------------
 * Build & publish a public portfolio. Verified badge unlocks at ≥3 items,
 * bio and an hourly rate (computed server-side).
 * Backed by /api/portfolio/*.
 */

interface PortfolioProps {
  token: string | null;
  currentUser: { id: string; name: string } | null;
  onClose: () => void;
}

interface Item { id: string; title: string; desc: string; link?: string; createdAt: number }
interface Portfolio {
  id: string; userId: string; name: string; headline?: string; bio?: string;
  skills: string[]; hourlyRate?: number; items: Item[]; verified: boolean;
}

export default function Portfolio({ token, currentUser, onClose }: PortfolioProps) {
  const [visible, setVisible] = useState(true);
  const [mine, setMine] = useState<Portfolio | null>(null);
  const [loading, setLoading] = useState(true);
  const [headline, setHeadline] = useState('');
  const [bio, setBio] = useState('');
  const [rate, setRate] = useState('');
  const [skills, setSkills] = useState('');
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [link, setLink] = useState('');
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
    setLoading(true);
    try {
      const d = await api(`/api/portfolio/${currentUser?.id || 'me'}`, 'GET');
      setMine(d.portfolio || null);
      if (d.portfolio) {
        setHeadline(d.portfolio.headline || '');
        setBio(d.portfolio.bio || '');
        setRate(d.portfolio.hourlyRate ? String(d.portfolio.hourlyRate) : '');
        setSkills((d.portfolio.skills || []).join(', '));
      }
    } catch { setMine(null); } finally { setLoading(false); }
  }, [currentUser]);

  useEffect(() => { load(); }, [load]);

  const saveProfile = async () => {
    setBusy(true);
    try {
      const d = await api('/api/portfolio', 'POST', {
        name: mine?.name, headline, bio,
        hourlyRate: rate ? Number(rate) : undefined,
        skills: skills.split(',').map(s => s.trim()).filter(Boolean),
      });
      setMine(d.portfolio);
      toast(d.portfolio.verified ? 'Portfolio saved — verified badge unlocked! 🎉' : 'Portfolio saved.');
    } catch (e: any) { toast(e.message || 'Save failed.', 'destructive'); } finally { setBusy(false); }
  };

  const addItem = async () => {
    if (!title.trim()) return toast('Item title is required.');
    setBusy(true);
    try {
      const d = await api('/api/portfolio/items', 'POST', { title, desc, link });
      setMine(d.portfolio);
      setTitle(''); setDesc(''); setLink('');
      toast(d.verified ? 'Item added — verified! 🎉' : 'Item added.');
    } catch (e: any) { toast(e.message || 'Failed.', 'destructive'); } finally { setBusy(false); }
  };

  const removeItem = async (id: string) => {
    try {
      const d = await api(`/api/portfolio/items/${id}`, 'DELETE');
      setMine(d.portfolio);
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
              <span className="font-mono text-[10px] uppercase tracking-widest text-[#8a8172] dark:text-zinc-400">Freelancer portfolio</span>
              <button onClick={() => setVisible(false)} className="w-9 h-9 rounded-full bg-white/80 dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 flex items-center justify-center text-[#5c5446] dark:text-zinc-300 hover:bg-[#ebdcca]/50 transition-all" aria-label="Close">
                <X size={16} />
              </button>
            </div>

            {!currentUser ? (
              <div className={card}>
                <p className="font-mono text-[10px] uppercase tracking-wide text-[#8a8172] dark:text-zinc-400 text-center py-8">Sign in to build a portfolio — public portfolios are visible to everyone.</p>
              </div>
            ) : loading ? (
              <div className={`${card} text-center py-10 flex items-center justify-center gap-2 font-mono text-[10px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-400`}>
                <Loader2 size={13} className="animate-spin" /> Loading…
              </div>
            ) : (
              <div className={card}>
                <div className="flex items-center gap-2">
                  <span className="w-9 h-9 rounded-full bg-emerald-800/10 dark:bg-emerald-400/10 flex items-center justify-center">
                    <Briefcase className="text-emerald-800 dark:text-emerald-400" size={17} />
                  </span>
                  <div className="flex-1">
                    <h2 className="font-display text-lg font-bold text-[#3a342a] dark:text-zinc-100">Freelancer Portfolio</h2>
                    <p className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-400">3+ items, bio &amp; rate → verified badge</p>
                  </div>
                  {mine?.verified && (
                    <span className="flex items-center gap-1 px-2 py-1 rounded-full bg-emerald-800/10 dark:bg-emerald-400/10 text-emerald-700 dark:text-emerald-300 font-mono text-[9px] uppercase font-bold">
                      <BadgeCheck size={12} /> Verified
                    </span>
                  )}
                </div>

                <div className="space-y-2">
                  <input className={input} value={headline} onChange={e => setHeadline(e.target.value)} placeholder="Headline (e.g. Full-stack developer, 5 yrs)" />
                  <textarea className={`${input} resize-none`} rows={2} value={bio} onChange={e => setBio(e.target.value)} placeholder="Bio / summary" />
                  <div className="grid grid-cols-2 gap-2">
                    <input className={input} type="number" min={0} value={rate} onChange={e => setRate(e.target.value)} placeholder="Hourly rate (Tk / coins)" />
                    <input className={input} value={skills} onChange={e => setSkills(e.target.value)} placeholder="Skills (comma separated)" />
                  </div>
                  <button onClick={saveProfile} disabled={busy} className={`${btnPrimary} justify-center w-full`}>
                    {busy ? <Loader2 size={11} className="animate-spin" /> : null} Save profile
                  </button>
                </div>

                <div className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 p-3 space-y-2">
                  <div className="font-mono text-[9px] uppercase font-bold tracking-wider text-[#5c5446] dark:text-zinc-300 flex items-center gap-1">
                    <Plus size={11} /> Add portfolio item
                  </div>
                  <input className={input} value={title} onChange={e => setTitle(e.target.value)} placeholder="Item title" />
                  <input className={input} value={desc} onChange={e => setDesc(e.target.value)} placeholder="Short description" />
                  <input className={input} value={link} onChange={e => setLink(e.target.value)} placeholder="Link (GitHub / live URL)" />
                  <button onClick={addItem} disabled={busy} className={`${btnPrimary} w-full justify-center`}><Plus size={11} /> Add item</button>
                </div>

                <div className="space-y-2">
                  <div className="font-mono text-[9px] uppercase font-bold tracking-wider text-[#5c5446] dark:text-zinc-300">Items ({mine?.items.length || 0})</div>
                  {mine?.items.length === 0 && <p className="text-[10px] text-[#8a8172] dark:text-zinc-500">No items yet — add 3 to unlock the verified badge.</p>}
                  {mine?.items.map(it => (
                    <div key={it.id} className="flex items-start gap-2 rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-white/60 dark:bg-zinc-950/40 px-3 py-2">
                      <UserRound size={13} className="text-[#8a8172] dark:text-zinc-500 mt-0.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-xs text-[#3a342a] dark:text-zinc-100 truncate">{it.title}</div>
                        {it.desc && <div className="text-[10px] text-[#8a8172] dark:text-zinc-400 line-clamp-2">{it.desc}</div>}
                        {it.link && <a href={it.link} target="_blank" rel="noreferrer" className="text-[10px] text-emerald-700 dark:text-emerald-300 underline break-all">{it.link}</a>}
                      </div>
                      <button onClick={() => removeItem(it.id)} className="text-[#8a8172] hover:text-rose-500 transition-colors" aria-label="Delete"><Trash2 size={13} /></button>
                    </div>
                  ))}
                </div>

                <p className="font-mono text-[8px] uppercase tracking-wide text-[#8a8172] dark:text-zinc-500">
                  Public page: /api/portfolio/{mine?.userId} — share the link to showcase your work.
                </p>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
