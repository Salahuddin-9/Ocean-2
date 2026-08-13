import { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Repeat, Plus, Loader2, Sparkles, Trash2 } from 'lucide-react';

/**
 * Ocean — Skill Exchange Network (Feature 247)
 * ----------------------------------------------
 * Swap skills, not money: list what you teach and what you want to learn; the
 * matcher surfaces complementary offers. Backed by /api/skills.
 */

interface SkillExchangeProps {
  token: string | null;
  currentUser: { id: string; name: string } | null;
  onClose: () => void;
}

interface Offer { id: string; userId: string; name: string; offers: string[]; wants: string[]; bio: string; at: number }

export default function SkillExchange({ token, currentUser, onClose }: SkillExchangeProps) {
  const [visible, setVisible] = useState(true);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [matches, setMatches] = useState<Offer[]>([]);
  const [mine, setMine] = useState<Offer | null>(null);
  const [offerText, setOfferText] = useState('');
  const [wantText, setWantText] = useState('');
  const [bio, setBio] = useState('');
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
      const [all, m] = await Promise.all([
        api('/api/skills', 'GET'),
        api('/api/skills/match').catch(() => ({ matches: [], scored: [] })),
      ]);
      setOffers(all.offers || []);
      setMatches(m.matches || []);
      setMine(currentUser ? (all.offers || []).find((o: Offer) => o.userId === currentUser.id) || null : null);
    } catch { /* ignore */ }
  }, [currentUser]);

  useEffect(() => { load(); }, [load]);

  const publish = async () => {
    if (!offerText.trim() && !wantText.trim()) return toast('List at least one skill you offer or want.');
    setBusy(true);
    try {
      await api('/api/skills', 'POST', {
        offers: offerText.split(',').map(x => x.trim()).filter(Boolean),
        wants: wantText.split(',').map(x => x.trim()).filter(Boolean),
        bio,
      });
      toast('Skill offer published — matcher is live.');
      setOfferText(''); setWantText(''); setBio('');
      await load();
    } catch (e: any) { toast(e.message, 'destructive'); } finally { setBusy(false); }
  };

  const remove = async (id: string) => {
    try {
      await api(`/api/skills/${id}`, 'DELETE');
      await load();
    } catch (e: any) { toast(e.message, 'destructive'); }
  };

  const chip = (list: string[], cls: string) =>
    list.length > 0 && (
      <div className="flex gap-1 flex-wrap mt-1.5">
        {list.map(x => <span key={x} className={`font-mono text-[8px] uppercase px-1.5 py-0.5 rounded-full ${cls}`}>{x}</span>)}
      </div>
    );

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
              <span className="font-mono text-[10px] uppercase tracking-widest text-[#8a8172] dark:text-zinc-400">Skill exchange</span>
              <button onClick={() => setVisible(false)} className="w-9 h-9 rounded-full bg-white/80 dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 flex items-center justify-center text-[#5c5446] dark:text-zinc-300 hover:bg-[#ebdcca]/50 transition-all" aria-label="Close">
                <X size={16} />
              </button>
            </div>

            <div className={card}>
              <div className="flex items-center gap-2">
                <span className="w-9 h-9 rounded-full bg-orange-800/10 dark:bg-orange-400/10 flex items-center justify-center">
                  <Repeat className="text-orange-800 dark:text-orange-400" size={17} />
                </span>
                <div className="flex-1">
                  <h2 className="font-display text-lg font-bold text-[#3a342a] dark:text-zinc-100">Skill Exchange</h2>
                  <p className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-400">Teach, learn, swap · feature 247</p>
                </div>
              </div>

              {currentUser && (
                <div className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 p-3 space-y-2">
                  <div className="font-mono text-[9px] uppercase font-bold tracking-wider text-[#5c5446] dark:text-zinc-300"><Plus size={11} className="inline" /> {mine ? 'Update my offer' : 'Publish an offer'}</div>
                  <div className="grid grid-cols-2 gap-2">
                    <input className={input} value={offerText} onChange={e => setOfferText(e.target.value)} placeholder="I can teach: Bangla, Excel, Guitar" />
                    <input className={input} value={wantText} onChange={e => setWantText(e.target.value)} placeholder="I want to learn: Coding, English" />
                  </div>
                  <input className={input} value={bio} onChange={e => setBio(e.target.value)} placeholder="Short bio (availability, level…)" />
                  <button onClick={publish} disabled={busy} className={`${btnPrimary} w-full justify-center`}>
                    {busy ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />} Publish
                  </button>
                </div>
              )}

              {matches.length > 0 && (
                <div>
                  <div className="font-mono text-[9px] uppercase font-bold tracking-wider text-[#8a8172] dark:text-zinc-500 mb-2 flex items-center gap-1"><Sparkles size={10} /> Best matches for you</div>
                  <div className="space-y-2">
                    {matches.slice(0, 5).map(o => (
                      <div key={o.id} className="rounded-2xl border border-amber-400/40 dark:border-amber-400/30 p-3 bg-white/60 dark:bg-zinc-950/40">
                        <div className="font-mono text-[10px] font-bold text-[#3a342a] dark:text-zinc-200">{o.name}</div>
                        {chip(o.offers, 'bg-emerald-800/10 text-emerald-700 dark:text-emerald-300')}
                        {chip(o.wants, 'bg-sky-800/10 text-sky-700 dark:text-sky-300')}
                        {o.bio && <p className="text-[9px] text-[#8a8172] mt-1">{o.bio}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <div className="font-mono text-[9px] uppercase font-bold tracking-wider text-[#8a8172] dark:text-zinc-500">All offers ({offers.length})</div>
                {offers.length === 0 && <p className="text-center text-[10px] text-[#8a8172] dark:text-zinc-500 py-3">No offers yet — be the first.</p>}
                {offers.map(o => (
                  <div key={o.id} className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 p-3 bg-white/60 dark:bg-zinc-950/40">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[10px] font-bold text-[#3a342a] dark:text-zinc-200">{o.name}</span>
                      {mine && o.id === mine.id && (
                        <button onClick={() => remove(o.id)} className="ml-auto text-[#8a8172] hover:text-red-600 transition-colors" aria-label="Remove">
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                    {chip(o.offers, 'bg-emerald-800/10 text-emerald-700 dark:text-emerald-300')}
                    {chip(o.wants, 'bg-sky-800/10 text-sky-700 dark:text-sky-300')}
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
