import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Radio, X, MessageSquareText, Users, RefreshCw, UserRound, Loader2 } from 'lucide-react';

/**
 * Ocean — Random Text DM
 * -----------------------
 * Omegle-style anonymous TEXT chat with a random stranger (ported from the
 * base44 random text DM flow). Backed by POST /api/chat/random-match which
 * pairs the current user with a random online user and returns a stable
 * conversation. "Open chat" hands the conversation over to the main chat via
 * the window 'open-chat' custom event ({ conversationId }).
 */

interface RandomTextDmViewProps {
  token: string | null;
  onClose: () => void;
}

interface MatchResult {
  matched: boolean;
  conversation?: { id: string };
  stranger?: { id: string; name: string; avatarUrl: string };
}

type Phase = 'idle' | 'searching' | 'matched' | 'empty';

export default function RandomTextDmView({ token, onClose }: RandomTextDmViewProps) {
  const [visible, setVisible] = useState(true);
  const [phase, setPhase] = useState<Phase>('idle');
  const [stranger, setStranger] = useState<{ id: string; name: string; avatarUrl: string } | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const toast = (message: string, variant?: string) => {
    window.dispatchEvent(new CustomEvent('show-toast', { detail: { message, variant } }));
  };

  const authToken = token || localStorage.getItem('secure_auth_token');

  const findStranger = async () => {
    setBusy(true);
    setPhase('searching');
    setStranger(null);
    setConversationId(null);
    try {
      const res = await fetch('/api/chat/random-match', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { Authorization: 'Bearer ' + authToken } : {}),
        },
      });
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const data: MatchResult = await res.json();

      if (data.matched && data.conversation && data.stranger) {
        setStranger(data.stranger);
        setConversationId(data.conversation.id);
        setPhase('matched');
        toast(`Matched with ${data.stranger.name || 'a stranger'}.`);
      } else {
        setPhase('empty');
      }
    } catch (e: any) {
      setPhase('idle');
      toast(e?.message || 'Could not reach the matchmaking service.', 'destructive');
    } finally {
      setBusy(false);
    }
  };

  const openChat = () => {
    if (!conversationId) return;
    window.dispatchEvent(new CustomEvent('open-chat', { detail: { conversationId } }));
    setVisible(false);
  };

  return (
    <AnimatePresence onExitComplete={() => onClose()}>
      {visible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[120] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setVisible(false)}
        >
          <motion.div
            initial={{ scale: 0.94, y: 16 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.94, y: 16 }}
            transition={{ type: 'spring', damping: 26, stiffness: 300 }}
            className="w-full max-w-sm bg-[#fcfaf4] dark:bg-zinc-900 border-2 border-[#ebdcca] dark:border-zinc-800 rounded-[1.75rem] p-6 space-y-5 shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2.5">
                <span className="w-10 h-10 rounded-full bg-amber-800/10 dark:bg-amber-400/10 flex items-center justify-center">
                  <Radio className="text-amber-800 dark:text-amber-400" size={18} />
                </span>
                <div>
                  <h2 className="font-display text-lg font-bold text-[#3a342a] dark:text-zinc-100">Random Text DM</h2>
                  <p className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-400">
                    Anon chat with a stranger
                  </p>
                </div>
              </div>
              <button
                onClick={() => setVisible(false)}
                className="text-[#8a8172] dark:text-zinc-400 hover:text-[#3a342a] dark:hover:text-zinc-100 transition-colors"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            {/* Body */}
            {phase === 'idle' && (
              <div className="space-y-4 text-center">
                <div className="flex items-center justify-center gap-3 text-[#8a8172] dark:text-zinc-500">
                  <MessageSquareText size={18} />
                  <span className="font-mono text-[9px] uppercase tracking-wider">No sign-up · no names · just talk</span>
                </div>
                <button
                  onClick={findStranger}
                  className="w-full font-mono text-[11px] uppercase font-bold tracking-wider py-3 rounded-xl bg-amber-800 text-white dark:bg-amber-400 dark:text-zinc-900 hover:bg-amber-900 dark:hover:bg-amber-300 transition-all flex items-center justify-center gap-2 shadow-xs"
                >
                  <Users size={14} /> Find a stranger
                </button>
                <p className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-500">
                  Be nice — anonymous doesn't mean invisible.
                </p>
              </div>
            )}

            {phase === 'searching' && (
              <div className="space-y-4 text-center py-4">
                <div className="relative w-20 h-20 mx-auto flex items-center justify-center">
                  <motion.span
                    className="absolute inset-0 rounded-full bg-amber-400/30 dark:bg-amber-400/20"
                    animate={{ scale: [1, 1.6], opacity: [0.6, 0] }}
                    transition={{ duration: 1.4, repeat: Infinity, ease: 'easeOut' }}
                  />
                  <motion.span
                    className="absolute inset-2 rounded-full bg-amber-500/20 dark:bg-amber-500/20"
                    animate={{ scale: [1, 1.5], opacity: [0.5, 0] }}
                    transition={{ duration: 1.4, repeat: Infinity, ease: 'easeOut', delay: 0.35 }}
                  />
                  <span className="relative w-14 h-14 rounded-full bg-[#fcfaf4] dark:bg-zinc-800 border-2 border-amber-800/40 dark:border-amber-400/40 flex items-center justify-center">
                    <Loader2 size={22} className="text-amber-800 dark:text-amber-400 animate-spin" />
                  </span>
                </div>
                <p className="font-display text-sm font-bold text-[#3a342a] dark:text-zinc-100">Finding a stranger…</p>
                <p className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-500">
                  Scanning online users
                </p>
                <button
                  onClick={() => setPhase('idle')}
                  className="font-mono text-[9px] uppercase font-bold tracking-wider py-2 px-4 rounded-lg bg-[#ebdcca]/40 dark:bg-zinc-800 text-[#5c5446] dark:text-zinc-300 hover:bg-[#ebdcca]/70 transition-all"
                >
                  Cancel
                </button>
              </div>
            )}

            {phase === 'matched' && stranger && (
              <div className="space-y-4">
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-2xl border-2 border-[#ebdcca] dark:border-zinc-800 bg-white/60 dark:bg-zinc-950/30 p-4 flex items-center gap-3"
                >
                  {stranger.avatarUrl ? (
                    <img
                      src={stranger.avatarUrl}
                      alt={stranger.name}
                      className="w-12 h-12 rounded-full object-cover border-2 border-[#ebdcca] dark:border-zinc-700"
                    />
                  ) : (
                    <span className="w-12 h-12 rounded-full bg-[#ebdcca]/50 dark:bg-zinc-800 flex items-center justify-center">
                      <UserRound size={22} className="text-amber-800 dark:text-amber-400" />
                    </span>
                  )}
                  <div className="min-w-0">
                    <p className="font-display font-bold text-sm text-[#3a342a] dark:text-zinc-100 truncate">
                      {stranger.name || 'Anonymous stranger'}
                    </p>
                    <p className="font-mono text-[9px] uppercase tracking-wider text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Online &amp; matched
                    </p>
                  </div>
                </motion.div>

                <button
                  onClick={openChat}
                  className="w-full font-mono text-[11px] uppercase font-bold tracking-wider py-3 rounded-xl bg-amber-800 text-white dark:bg-amber-400 dark:text-zinc-900 hover:bg-amber-900 dark:hover:bg-amber-300 transition-all flex items-center justify-center gap-2 shadow-xs"
                >
                  <MessageSquareText size={14} /> Open chat
                </button>

                <button
                  onClick={findStranger}
                  disabled={busy}
                  className="w-full font-mono text-[10px] uppercase font-bold tracking-wider py-2.5 rounded-xl bg-[#ebdcca]/40 dark:bg-zinc-800 text-[#5c5446] dark:text-zinc-300 hover:bg-[#ebdcca]/70 dark:hover:bg-zinc-700 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
                >
                  <RefreshCw size={12} className={busy ? 'animate-spin' : ''} /> Next →
                </button>
              </div>
            )}

            {phase === 'empty' && (
              <div className="space-y-4 text-center py-2">
                <div className="w-14 h-14 mx-auto rounded-full bg-[#ebdcca]/50 dark:bg-zinc-800 flex items-center justify-center">
                  <Users size={22} className="text-[#8a8172] dark:text-zinc-400" />
                </div>
                <div className="space-y-1">
                  <p className="font-display font-bold text-sm text-[#3a342a] dark:text-zinc-100">
                    No one is around right now.
                  </p>
                  <p className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-500">
                    Try again in a moment — someone may hop online.
                  </p>
                </div>
                <button
                  onClick={findStranger}
                  disabled={busy}
                  className="w-full font-mono text-[10px] uppercase font-bold tracking-wider py-2.5 rounded-xl bg-amber-800 text-white dark:bg-amber-400 dark:text-zinc-900 hover:bg-amber-900 dark:hover:bg-amber-300 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
                >
                  <RefreshCw size={12} className={busy ? 'animate-spin' : ''} /> Try again
                </button>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
