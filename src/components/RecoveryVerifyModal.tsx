import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, ShieldQuestion, CheckCircle2, XCircle, Shuffle, Lock } from 'lucide-react';

/**
 * Ocean — Recovery Phrase Verification Modal
 * ------------------------------------------
 * Proves ownership of a 12-word recovery phrase without revealing it: three
 * random word positions are shown as numbered chips and the user must type the
 * matching word for each. Matching is case-insensitive + trimmed.
 * Calls onVerified() once every challenged word matches.
 */

interface RecoveryVerifyModalProps {
  open: boolean;
  onClose: () => void;
  /** The full recovery phrase words (1-indexed positions internally). */
  phrase: string[];
  /** Called after all challenged words are verified. */
  onVerified: () => void;
}

const CHALLENGE_COUNT = 3;
const SUCCESS_DELAY_MS = 700;

/** Fisher–Yates shuffle, then return the first `count` indices sorted ascending. */
function pickIndices(count: number, max: number): number[] {
  const n = Math.min(count, max);
  const pool = Array.from({ length: max }, (_, i) => i);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, n).sort((a, b) => a - b);
}

export default function RecoveryVerifyModal({ open, onClose, phrase, onVerified }: RecoveryVerifyModalProps) {
  /** 0-based indices into `phrase` currently being challenged. */
  const [challenges, setChallenges] = useState<number[]>([]);
  /** User-typed answer per challenge, aligned with `challenges`. */
  const [answers, setAnswers] = useState<string[]>([]);
  /** Whether the user pressed "Verify phrase" (enables error states). */
  const [attempted, setAttempted] = useState(false);
  /** Set once every answer matches; fires onVerified after a short success beat. */
  const [passing, setPassing] = useState(false);

  const successTimer = useRef<number | null>(null);

  const clearTimer = useCallback(() => {
    if (successTimer.current) {
      window.clearTimeout(successTimer.current);
      successTimer.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    const idx = pickIndices(CHALLENGE_COUNT, Math.min(phrase.length, 12));
    setChallenges(idx);
    setAnswers(idx.map(() => ''));
    setAttempted(false);
    setPassing(false);
    clearTimer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phrase]);

  useEffect(() => {
    if (open) reset();
  }, [open, reset]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => () => clearTimer(), [clearTimer]);

  const norm = (s: string) => s.trim().toLowerCase();

  const isMatch = (i: number) =>
    norm(answers[i] || '') === norm(phrase[challenges[i]] || '') && (answers[i] || '').trim() !== '';

  const allMatch = challenges.length > 0 && challenges.every((_, i) => isMatch(i));

  const verify = () => {
    setAttempted(true);
    if (allMatch) {
      setPassing(true);
      clearTimer();
      successTimer.current = window.setTimeout(() => onVerified(), SUCCESS_DELAY_MS);
    }
  };

  const randomize = () => {
    if (passing) return;
    reset();
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => { if (!passing) onClose(); }}
        >
          <motion.div
            initial={{ scale: 0.94, y: 12 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.94, y: 12 }}
            transition={{ duration: 0.18 }}
            className="bg-[#fcfaf4] dark:bg-zinc-900 rounded-[1.75rem] p-6 w-full max-w-md border-2 border-[#ebdcca] dark:border-zinc-800 space-y-4 shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between">
              <h3 className="font-display font-bold text-[#3a342a] dark:text-zinc-100 flex items-center gap-2">
                <ShieldQuestion className="text-amber-800 dark:text-amber-400" size={16} />
                Verify Recovery Phrase
              </h3>
              <button
                onClick={onClose}
                disabled={passing}
                className="text-[#8a8172] hover:text-[#3a342a] dark:hover:text-zinc-100 disabled:opacity-40 transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            <p className="text-xs text-[#5c5446] dark:text-zinc-300 leading-relaxed">
              Prove you hold this account by typing the <b>3 words</b> below from your
              recovery phrase. Words are matched case-insensitively — your phrase is never
              shown in full.
            </p>

            {/* Challenge rows */}
            <div className="space-y-3">
              {challenges.map((idx, i) => {
                const position = idx + 1;
                const correct = isMatch(i);
                const error = attempted && !correct;
                return (
                  <div key={idx}>
                    <div className="flex items-center gap-2">
                      <span className="w-10 h-10 shrink-0 rounded-full bg-amber-800/10 dark:bg-amber-400/10 border border-amber-200 dark:border-amber-400/20 flex items-center justify-center font-mono text-[10px] font-bold text-amber-800 dark:text-amber-400">
                        #{position}
                      </span>
                      <input
                        value={answers[i] || ''}
                        onChange={e => {
                          const next = [...answers];
                          next[i] = e.target.value;
                          setAnswers(next);
                        }}
                        placeholder={`Word #${position}`}
                        autoComplete="off"
                        autoCorrect="off"
                        autoCapitalize="off"
                        spellCheck={false}
                        disabled={passing}
                        className={`flex-1 bg-white dark:bg-zinc-800 border rounded-xl px-3 py-2 text-sm text-[#3a342a] dark:text-zinc-100 outline-none focus:border-amber-400 disabled:opacity-60 transition-colors ${
                          correct
                            ? 'border-emerald-400 dark:border-emerald-500'
                            : error
                              ? 'border-red-400 dark:border-red-500'
                              : 'border-[#ebdcca] dark:border-zinc-700'
                        }`}
                      />
                      <span className="w-5 shrink-0 flex items-center justify-center">
                        {correct ? (
                          <CheckCircle2 className="text-emerald-600 dark:text-emerald-400" size={16} />
                        ) : error ? (
                          <XCircle className="text-red-500 dark:text-red-400" size={16} />
                        ) : (
                          <Lock className="text-[#ebdcca] dark:text-zinc-700" size={13} />
                        )}
                      </span>
                    </div>
                    {error && (
                      <p className="ml-12 mt-1 text-[10px] text-red-600 dark:text-red-400">
                        That word doesn't match position #{position}.
                      </p>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Success note */}
            {passing && (
              <motion.div
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                className="rounded-xl border border-emerald-300/60 dark:border-emerald-800 bg-emerald-50/60 dark:bg-emerald-950/30 p-3 text-xs text-emerald-700 dark:text-emerald-300 flex items-center gap-2"
              >
                <CheckCircle2 size={14} />
                Phrase verified. Almost there…
              </motion.div>
            )}

            {/* Actions */}
            <button
              onClick={verify}
              disabled={passing || challenges.length === 0}
              className="w-full font-mono text-[10px] uppercase font-bold tracking-wider py-2.5 rounded-xl bg-amber-800 text-white dark:bg-amber-400 dark:text-zinc-900 hover:bg-amber-900 dark:hover:bg-amber-500 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
            >
              {passing ? <CheckCircle2 size={14} /> : <Lock size={14} />}
              {passing ? 'Verified' : 'Verify phrase'}
            </button>

            <button
              onClick={randomize}
              disabled={passing}
              className="mx-auto flex items-center gap-1 font-mono text-[9px] uppercase tracking-wider text-amber-800 dark:text-amber-400 hover:underline disabled:opacity-40 transition-opacity"
            >
              <Shuffle size={11} /> Try different words
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
