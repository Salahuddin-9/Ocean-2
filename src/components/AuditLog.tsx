import { useEffect, useState } from 'react';
import { X, ScrollText, LogIn, Trash2 } from 'lucide-react';

/**
 * Ocean — Algorithmic Audit Log (Feature 152)
 * "Why did I see this?" — the full decision trail for your personalized feed.
 */
interface AuditLogProps {
  token: string | null;
  currentUser: { id: string; name: string } | null;
  onClose: () => void;
}

interface Reason {
  signal: string;
  label: string;
  value: number;
  detail: string;
}

interface Entry {
  id: string;
  postId: string;
  postSnippet: string;
  reasons: Reason[];
  topReason: string;
  createdAt: number;
}

export default function AuditLog({ token, currentUser, onClose }: AuditLogProps) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [openId, setOpenId] = useState('');
  const [busy, setBusy] = useState(false);

  const headers = token ? { Authorization: `Bearer ${token}` } : {};

  const load = async () => {
    if (!token) return;
    setBusy(true);
    try {
      const r = await fetch('/api/algo/audit', { headers });
      const d = await r.json();
      setEntries(d.entries || []);
    } catch { /* non-fatal */ }
    finally { setBusy(false); }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const explainOne = async (postId: string) => {
    setBusy(true);
    try {
      await fetch('/api/algo/audit/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ postId }),
      });
      load();
    } catch { /* non-fatal */ }
  };

  return (
    <div className="fixed inset-0 z-[115] bg-[#141b2b]/60 dark:bg-[#05060c]/85 backdrop-blur-sm overflow-y-auto py-6 px-4">
      <div className="max-w-xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <ScrollText size={18} className="text-amber-800 dark:text-amber-400" />
            <h2 className="font-display font-bold text-lg text-[#3a342a] dark:text-zinc-100 tracking-tight">Algorithmic Audit Log</h2>
            <span className="font-mono text-[9px] uppercase tracking-widest text-[#8a8172] dark:text-zinc-400">Feature 152</span>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-white/80 dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 flex items-center justify-center text-[#5c5446] dark:text-zinc-300 hover:bg-[#ebdcca]/50 transition-all" aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-[#fcfaf4] dark:bg-zinc-900 p-4 mb-3">
          <p className="text-[11px] text-[#5c5446] dark:text-zinc-300 leading-relaxed mb-2">
            Every item your personalized feed serves (and every "Why did I see this?" you ask) is recorded here —
            signals, scores, timestamps. No black boxes.
          </p>
          <div className="flex gap-2">
            <input
              id="audit-post"
              placeholder="Post ID to explain & log…"
              className="flex-1 px-3 py-2.5 rounded-xl border border-[#ebdcca] dark:border-zinc-700 bg-white dark:bg-zinc-950 text-[12px] text-[#3a342a] dark:text-zinc-100 focus:outline-none focus:border-amber-500"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.target as HTMLInputElement).value.trim()) {
                  explainOne((e.target as HTMLInputElement).value.trim());
                  (e.target as HTMLInputElement).value = '';
                }
              }}
            />
            <button
              onClick={() => {
                const el = document.getElementById('audit-post') as HTMLInputElement;
                if (el?.value.trim()) { explainOne(el.value.trim()); el.value = ''; }
              }}
              disabled={busy}
              className="flex items-center gap-1 px-4 rounded-xl bg-amber-800 dark:bg-amber-400 text-white dark:text-zinc-950 font-bold text-[11px] hover:brightness-110 transition-all disabled:opacity-40"
            >
              <LogIn size={12} /> Log
            </button>
          </div>
        </div>

        {!currentUser && <p className="text-[11px] text-[#8a8172] dark:text-zinc-400 rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-[#fcfaf4] dark:bg-zinc-900 p-4 mb-3">Log in to see your audit trail.</p>}

        {entries.length === 0 && currentUser && (
          <div className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-[#fcfaf4] dark:bg-zinc-900 p-6 text-center text-[11px] text-[#8a8172] dark:text-zinc-400">
            No decisions logged yet — open the Algo Panel (151) to generate a personalized feed, and every choice lands here.
          </div>
        )}

        <div className="space-y-2">
          {entries.map((e) => (
            <div key={e.id} className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-[#fcfaf4] dark:bg-zinc-900 p-3.5">
              <button onClick={() => setOpenId(openId === e.id ? '' : e.id)} className="w-full text-left">
                <div className="flex items-center gap-2">
                  <p className="text-[11px] font-semibold text-[#3a342a] dark:text-zinc-100 truncate flex-1">“{e.postSnippet}”</p>
                  <span className="font-mono text-[8px] text-[#8a8172] dark:text-zinc-500 shrink-0">{new Date(e.createdAt).toLocaleString()}</span>
                </div>
                <p className="font-mono text-[8px] uppercase tracking-widest text-amber-700 dark:text-amber-400 mt-0.5">top signal: {e.topReason}</p>
              </button>
              {openId === e.id && (
                <div className="mt-2 space-y-1.5 border-t border-[#f0e8da] dark:border-zinc-800 pt-2">
                  {e.reasons.map((r) => (
                    <div key={r.signal} className="flex items-center gap-2 text-[10px]">
                      <span className="w-24 shrink-0 font-bold text-[#5c5446] dark:text-zinc-300">{r.label}</span>
                      <div className="flex-1 h-1.5 rounded-full bg-[#ebdcca] dark:bg-zinc-800 overflow-hidden">
                        <div className={`h-full ${r.signal === e.topReason ? 'bg-amber-600 dark:bg-amber-400' : 'bg-[#b9a98c] dark:bg-zinc-600'}`} style={{ width: `${r.value}%` }} />
                      </div>
                      <span className="font-mono text-[8px] text-[#8a8172] shrink-0">{r.detail}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        {entries.length > 0 && (
          <p className="flex items-center justify-center gap-1 text-[9px] text-[#8a8172] dark:text-zinc-500 mt-3">
            <Trash2 size={10} /> Oldest entries rotate out automatically (max 200 per user)
          </p>
        )}
      </div>
    </div>
  );
}
