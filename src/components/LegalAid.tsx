import { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Gavel, Send, Loader2, History, PhoneCall } from 'lucide-react';

/**
 * Ocean — AI Legal First-Aid (Feature 209)
 * ------------------------------------------
 * Ask common legal questions (tenant, domestic, cyber, labour, consumer,
 * traffic) and get cautious first-aid guidance + helplines. Knowledge-base
 * answers are LLM-enhanced when a key is present.
 * Backed by /api/legal/ask.
 */

interface LegalAidProps {
  token: string | null;
  currentUser: { id: string; name: string } | null;
  onClose: () => void;
}

interface QaEntry { id: string; question: string; answer: string; helpline?: string; urgent?: boolean; at: number }

export default function LegalAid({ token, currentUser, onClose }: LegalAidProps) {
  const [visible, setVisible] = useState(true);
  const [question, setQuestion] = useState('');
  const [current, setCurrent] = useState<QaEntry | null>(null);
  const [log, setLog] = useState<QaEntry[]>([]);
  const [showLog, setShowLog] = useState(false);
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

  const loadLog = useCallback(async () => {
    if (!currentUser) return;
    try {
      const d = await api('/api/legal/log', 'GET');
      setLog(d.log || []);
    } catch { /* ignore */ }
  }, [currentUser]);

  useEffect(() => { loadLog(); }, [loadLog]);

  const ask = async () => {
    if (!question.trim()) return toast('Type your legal question.');
    setBusy(true);
    try {
      const d = await api('/api/legal/ask', 'POST', { question });
      setCurrent(d);
      await loadLog();
    } catch (e: any) { toast(e.message || 'Failed.', 'destructive'); } finally { setBusy(false); }
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
              <span className="font-mono text-[10px] uppercase tracking-widest text-[#8a8172] dark:text-zinc-400">Legal first-aid</span>
              <button onClick={() => setVisible(false)} className="w-9 h-9 rounded-full bg-white/80 dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 flex items-center justify-center text-[#5c5446] dark:text-zinc-300 hover:bg-[#ebdcca]/50 transition-all" aria-label="Close">
                <X size={16} />
              </button>
            </div>

            <div className={card}>
              <div className="flex items-center gap-2">
                <span className="w-9 h-9 rounded-full bg-slate-800/10 dark:bg-slate-400/10 flex items-center justify-center">
                  <Gavel className="text-slate-800 dark:text-slate-300" size={17} />
                </span>
                <div className="flex-1">
                  <h2 className="font-display text-lg font-bold text-[#3a342a] dark:text-zinc-100">AI Legal First-Aid</h2>
                  <p className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-400">Quick guidance · helplines · caution</p>
                </div>
                {currentUser && (
                  <button onClick={() => setShowLog(v => !v)} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-[#cfcac0] dark:border-zinc-700 text-[10px] font-mono uppercase font-bold text-[#3a342a] dark:text-zinc-100 hover:bg-[#ebdcca]/40">
                    <History size={11} /> {showLog ? 'Ask' : 'History'}
                  </button>
                )}
              </div>

              {showLog ? (
                <div className="space-y-1.5">
                  {log.length === 0 && <p className="text-[10px] text-[#8a8172] dark:text-zinc-500 py-4 text-center">No questions yet.</p>}
                  {log.map(e => (
                    <button key={e.id} onClick={() => { setCurrent(e); setShowLog(false); }}
                      className="w-full text-left rounded-xl bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 px-2.5 py-2 hover:border-slate-400 transition-colors">
                      <div className="text-[11px] font-bold text-[#3a342a] dark:text-zinc-100 line-clamp-1">{e.question}</div>
                      <div className="text-[9px] text-[#8a8172] font-mono uppercase">{new Date(e.at).toLocaleDateString()}</div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-1.5">
                    {['tenant / landlord eviction', 'domestic violence help', 'fake profile / cyber blackmail', 'wage not paid', 'refund defective product'].map(s => (
                      <button key={s} onClick={() => setQuestion(s)}
                        className="px-2 py-1 rounded-full bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 text-[9px] font-mono uppercase text-[#8a8172] hover:border-slate-400 transition-colors">
                        {s}
                      </button>
                    ))}
                  </div>
                  <textarea className={`${input} resize-none`} rows={3} value={question} onChange={e => setQuestion(e.target.value)} placeholder="Describe your situation in a sentence or two…" />
                  <button onClick={ask} disabled={busy || !question.trim()} className={`${btnPrimary} w-full justify-center`}>
                    {busy ? <Loader2 size={11} className="animate-spin" /> : <Send size={11} />} Ask
                  </button>

                  {current && (
                    <div className={`rounded-2xl p-4 space-y-2 border ${current.urgent ? 'bg-rose-800/5 border-rose-300/60 dark:border-rose-800/40' : 'bg-slate-800/5 border-slate-200/60 dark:border-zinc-800'}`}>
                      <div className="text-[10px] font-mono uppercase tracking-wider text-[#8a8172] dark:text-zinc-400">Answer</div>
                      <p className="text-xs text-[#3a342a] dark:text-zinc-100 leading-relaxed whitespace-pre-wrap">{current.answer}</p>
                      {current.helpline && (
                        <p className="flex items-center gap-1.5 text-[10px] font-mono uppercase text-emerald-700 dark:text-emerald-300">
                          <PhoneCall size={10} /> {current.helpline}
                        </p>
                      )}
                    </div>
                  )}
                  <p className="font-mono text-[8px] uppercase tracking-wide text-[#8a8172] dark:text-zinc-500">
                    General information only — for urgent matters call 999. For your case, use Pro-Bono Lawyers.
                  </p>
                </div>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
