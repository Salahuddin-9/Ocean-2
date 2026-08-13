import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { History, X, Sparkles, WifiOff } from 'lucide-react';

/**
 * Ocean — "While you were away" card
 * ----------------------------------
 * On mount POSTs the missed-update items to /api/ai/summary and renders the
 * LLM digest (or the server's heuristic fallback). Shows a shimmer while
 * awaiting, an "AI ✨" badge for LLM summaries, "Offline digest" for the
 * fallback, and a dismiss (X) button that animates the card out before
 * calling onDismiss. Renders nothing when the summary is empty.
 */

export interface AwaySummaryItem {
  kind: string;
  text: string;
  time: number;
}

interface AwaySummaryCardProps {
  token: string | null;
  items: AwaySummaryItem[];
  onDismiss: () => void;
}

export default function AwaySummaryCard({ token, items, onDismiss }: AwaySummaryCardProps) {
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState('');
  const [mode, setMode] = useState<'llm' | 'fallback' | ''>('');
  const [leaving, setLeaving] = useState(false);

  const authToken = token ?? (() => {
    try { return localStorage.getItem('secure_auth_token'); } catch { return null; }
  })();

  useEffect(() => {
    let cancelled = false;
    if (!items.length) {
      setSummary('');
      setLoading(false);
      return;
    }
    (async () => {
      setLoading(true);
      try {
        const res = await fetch('/api/ai/summary', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
          },
          body: JSON.stringify({ items }),
        });
        if (!res.ok) throw new Error(`Summary request failed (${res.status})`);
        const data = await res.json();
        if (cancelled) return;
        setSummary(typeof data?.summary === 'string' ? data.summary : '');
        setMode(data?.mode === 'llm' ? 'llm' : data?.mode === 'fallback' ? 'fallback' : '');
      } catch {
        if (!cancelled) setSummary('');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDismiss = () => {
    if (leaving) return;
    setLeaving(true);
    window.setTimeout(onDismiss, 240);
  };

  // Nothing to show: no summary (empty response / error) and not awaiting.
  if (!loading && !summary) return null;

  const llm = mode === 'llm';

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={leaving ? { opacity: 0, y: -10, scale: 0.98 } : { opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className="bg-[#fcfaf4] dark:bg-zinc-900 border-2 border-[#ebdcca] dark:border-zinc-800 rounded-[1.5rem] p-5 space-y-3 shadow-xs"
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="w-8 h-8 rounded-full bg-amber-800/10 dark:bg-amber-400/10 flex items-center justify-center shrink-0">
            <History className="text-amber-800 dark:text-amber-400" size={15} />
          </span>
          <div>
            <h3 className="font-display text-sm font-bold text-[#3a342a] dark:text-zinc-100">While you were away</h3>
            <p className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-400">
              Digest of your missed updates
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Dismiss summary"
          className="text-[#8a8172] dark:text-zinc-500 hover:text-[#3a342a] dark:hover:text-zinc-200 transition-colors shrink-0 p-1 rounded-lg hover:bg-[#ebdcca]/40 dark:hover:bg-zinc-800"
        >
          <X size={16} />
        </button>
      </div>

      {!loading && (
        <span
          className={`inline-flex items-center gap-1 font-mono text-[9px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full ${
            llm
              ? 'bg-amber-800/10 dark:bg-amber-400/10 text-amber-800 dark:text-amber-400'
              : 'bg-[#ebdcca]/40 dark:bg-zinc-800 text-[#5c5446] dark:text-zinc-300'
          }`}
        >
          {llm ? <Sparkles size={10} /> : <WifiOff size={10} />}
          {llm ? 'AI ✨' : 'Offline digest'}
        </span>
      )}

      <AnimatePresence mode="wait" initial={false}>
        {loading ? (
          <motion.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-2 pt-1"
            aria-busy="true"
            aria-label="Generating summary"
          >
            <div className="h-3 w-4/5 rounded-full bg-[#ebdcca]/70 dark:bg-zinc-800 animate-pulse" />
            <div className="h-3 w-full rounded-full bg-[#ebdcca]/70 dark:bg-zinc-800 animate-pulse" />
            <div className="h-3 w-3/5 rounded-full bg-[#ebdcca]/70 dark:bg-zinc-800 animate-pulse" />
          </motion.div>
        ) : (
          <motion.p
            key="summary"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="text-sm text-[#5c5446] dark:text-zinc-300 leading-relaxed"
          >
            {summary}
          </motion.p>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
