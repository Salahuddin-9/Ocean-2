import { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, FileText, Plus, Loader2, Copy, Clock } from 'lucide-react';

/**
 * Ocean — RTI Auto-Filer (Feature 211)
 * --------------------------------------
 * Generate a Right to Information application letter, file it, and track the
 * statutory 30-day response window. Backed by /api/rti.
 */

interface RTIFilerProps {
  token: string | null;
  currentUser: { id: string; name: string } | null;
  onClose: () => void;
}

interface RtiRequest {
  id: string; authority: string; question: string; letter: string;
  status: string; filedAt: number; deadlineAt: number; response?: string;
}

export default function RTIFiler({ token, currentUser, onClose }: RTIFilerProps) {
  const [visible, setVisible] = useState(true);
  const [list, setList] = useState<RtiRequest[]>([]);
  const [authority, setAuthority] = useState('');
  const [question, setQuestion] = useState('');
  const [address, setAddress] = useState('');
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);

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
    if (!currentUser) return;
    try {
      const d = await api('/api/rti', 'GET');
      setList(d.requests || []);
    } catch { /* ignore */ }
  }, [currentUser]);

  useEffect(() => { load(); }, [load]);

  const file = async (filed: boolean) => {
    if (!authority.trim() || !question.trim()) return toast('Authority and question are required.');
    setBusy(true);
    try {
      const d = await api('/api/rti', 'POST', { authority, question, address, filed });
      setPreview(d.request.letter);
      toast(filed ? 'RTI filed — 30-day window started.' : 'Draft saved — file it when ready.');
      setAuthority(''); setQuestion(''); setAddress('');
      await load();
    } catch (e: any) { toast(e.message || 'Failed.', 'destructive'); } finally { setBusy(false); }
  };

  const respond = async (id: string) => {
    const response = window.prompt('Record the response you received:');
    if (!response) return;
    try {
      await api(`/api/rti/${id}/respond`, 'POST', { response });
      toast('Response recorded.');
      await load();
    } catch (e: any) { toast(e.message, 'destructive'); }
  };

  const daysLeft = (r: RtiRequest) => Math.max(0, Math.ceil((r.deadlineAt - Date.now()) / 86400000));

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
              <span className="font-mono text-[10px] uppercase tracking-widest text-[#8a8172] dark:text-zinc-400">RTI filer</span>
              <button onClick={() => setVisible(false)} className="w-9 h-9 rounded-full bg-white/80 dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 flex items-center justify-center text-[#5c5446] dark:text-zinc-300 hover:bg-[#ebdcca]/50 transition-all" aria-label="Close">
                <X size={16} />
              </button>
            </div>

            <div className={card}>
              <div className="flex items-center gap-2">
                <span className="w-9 h-9 rounded-full bg-blue-800/10 dark:bg-blue-400/10 flex items-center justify-center">
                  <FileText className="text-blue-800 dark:text-blue-400" size={17} />
                </span>
                <div className="flex-1">
                  <h2 className="font-display text-lg font-bold text-[#3a342a] dark:text-zinc-100">RTI Auto-Filer</h2>
                  <p className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-400">Generate · file · track 30-day responses</p>
                </div>
              </div>

              <div className="space-y-2">
                <input className={input} value={authority} onChange={e => setAuthority(e.target.value)} placeholder="Authority / information officer" />
                <textarea className={`${input} resize-none`} rows={2} value={question} onChange={e => setQuestion(e.target.value)} placeholder="What information do you need?" />
                <input className={input} value={address} onChange={e => setAddress(e.target.value)} placeholder="Mailing address (optional)" />
                <div className="flex gap-2">
                  <button onClick={() => file(false)} disabled={busy} className="flex-1 justify-center flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-[#cfcac0] dark:border-zinc-700 text-[10px] font-mono uppercase font-bold text-[#3a342a] dark:text-zinc-100 hover:bg-[#ebdcca]/40">
                    Save draft
                  </button>
                  <button onClick={() => file(true)} disabled={busy} className={`${btnPrimary} flex-1 justify-center`}>
                    {busy ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />} Generate &amp; file
                  </button>
                </div>
              </div>

              {preview && (
                <div className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 p-3 bg-white dark:bg-zinc-950/60">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-mono text-[9px] uppercase font-bold tracking-wider text-[#5c5446] dark:text-zinc-300">Letter preview</span>
                    <button onClick={() => { navigator.clipboard?.writeText(preview); toast('Letter copied.'); }} className="flex items-center gap-1 text-[9px] font-mono uppercase text-[#8a8172] hover:text-[#3a342a] dark:hover:text-zinc-100">
                      <Copy size={10} /> Copy
                    </button>
                  </div>
                  <pre className="text-[10px] text-[#5c5446] dark:text-zinc-300 whitespace-pre-wrap font-sans leading-relaxed">{preview}</pre>
                </div>
              )}

              <div className="space-y-1.5">
                <div className="font-mono text-[9px] uppercase font-bold tracking-wider text-[#5c5446] dark:text-zinc-300">My requests ({list.length})</div>
                {list.length === 0 && <p className="text-[10px] text-[#8a8172] dark:text-zinc-500">No requests yet.</p>}
                {list.map(r => (
                  <div key={r.id} className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 p-3 bg-white/60 dark:bg-zinc-950/40">
                    <div className="flex items-center gap-2">
                      <span className="flex-1 min-w-0 text-[11px] font-bold text-[#3a342a] dark:text-zinc-100 truncate">{r.question}</span>
                      <span className={`font-mono text-[8px] uppercase px-1.5 py-0.5 rounded-full ${r.status === 'filed' ? 'bg-blue-800/10 text-blue-700 dark:text-blue-300' : r.status === 'responded' ? 'bg-emerald-800/10 text-emerald-700 dark:text-emerald-300' : 'bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'}`}>{r.status}</span>
                    </div>
                    <div className="text-[9px] text-[#8a8172] dark:text-zinc-500 mt-0.5">{r.authority}</div>
                    {r.status === 'filed' && (
                      <div className="flex items-center gap-1 text-[9px] font-mono uppercase text-blue-700 dark:text-blue-300 mt-1">
                        <Clock size={9} /> {daysLeft(r)} days left
                      </div>
                    )}
                    {r.status === 'filed' && (
                      <button onClick={() => respond(r.id)} className={`${btnPrimary} mt-2`}>Log response</button>
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
