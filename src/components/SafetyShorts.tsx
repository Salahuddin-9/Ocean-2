import { useCallback, useEffect, useState } from 'react';
import { motion } from 'motion/react';
import {
  X, ShieldCheck, Loader2, Clock3, Heart, Plus,
  GraduationCap, KeyRound, Send, BadgeCheck,
} from 'lucide-react';

/**
 * Ocean — Self-Defense Tutorial Shorts (FEATURE 126)
 * ----------------------------------------------------
 * Curated 30-second self-defence micro-lessons in the "Safety" category:
 * filter by tag / level, read the follow-along steps, upvote useful ones, and
 * submit community drills. Deliberately lightweight — no video pipeline.
 */

interface SafetyShortsProps {
  token: string | null;
  currentUser: { id: string; name: string } | null;
  onClose: () => void;
}

interface SafetyShort {
  id: string;
  title: string;
  instructor: string;
  durationSec: number;
  level: 'beginner' | 'intermediate' | 'advanced';
  tags: string[];
  steps: string[];
  source: 'curated' | 'community';
  submittedByName?: string;
  upvoteCount: number;
  upvotedByMe: boolean;
}

const LEVELS = ['beginner', 'intermediate', 'advanced'];
const LEVEL_COLORS: Record<string, string> = {
  beginner: 'text-emerald-700 dark:text-emerald-400 bg-emerald-600/10',
  intermediate: 'text-amber-700 dark:text-amber-400 bg-amber-600/10',
  advanced: 'text-rose-700 dark:text-rose-400 bg-rose-600/10',
};

export default function SafetyShorts({ token, currentUser, onClose }: SafetyShortsProps) {
  const [shorts, setShorts] = useState<SafetyShort[]>([]);
  const [tags, setTags] = useState<{ tag: string; count: number }[]>([]);
  const [activeTag, setActiveTag] = useState('');
  const [activeLevel, setActiveLevel] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // submit form
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [stepsText, setStepsText] = useState('');
  const [tagText, setTagText] = useState('');
  const [level, setLevel] = useState('beginner');
  const [submitting, setSubmitting] = useState(false);
  const [formMsg, setFormMsg] = useState('');

  const api = useCallback(
    async (path: string, method = 'GET', body?: unknown) => {
      const res = await fetch(path, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Request failed (${res.status})`);
      }
      return res.json();
    },
    [token]
  );

  const load = useCallback(
    async (tag = activeTag, lvl = activeLevel) => {
      try {
        const qs = new URLSearchParams();
        if (tag) qs.set('tag', tag);
        if (lvl) qs.set('level', lvl);
        const data = await api(`/api/safety/shorts${qs.toString() ? `?${qs}` : ''}`);
        setShorts(data.shorts || []);
      } catch (e: any) {
        setError(e.message || 'Could not load shorts.');
      } finally {
        setLoading(false);
      }
    },
    [api, activeTag, activeLevel]
  );

  const loadTags = useCallback(async () => {
    try {
      const data = await api('/api/safety/tags');
      setTags(data.tags || []);
    } catch {
      /* tags are non-critical */
    }
  }, [api]);

  useEffect(() => {
    if (token) {
      load();
      loadTags();
    }
  }, [token, load, loadTags]);

  if (!token) {
    return (
      <div className="fixed inset-0 z-[115] bg-[#f6f1e7]/95 dark:bg-zinc-950/95 backdrop-blur-sm overflow-y-auto py-6 px-4">
        <div className="max-w-xl mx-auto">
          <Header onClose={onClose} />
          <div className="bg-[#fcfaf4] border border-[#ebdcca] rounded-3xl p-8 text-center space-y-3">
            <KeyRound className="mx-auto text-[#8a8172]" size={28} />
            <p className="font-display text-base font-bold text-[#3a342a] dark:text-zinc-100">Log in to practise</p>
            <p className="text-xs text-[#8a8172] max-w-xs mx-auto">
              Upvoting and community drills need a session. The curated library is the same for everyone.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Filter changes re-trigger the load effect below (activeTag/activeLevel are
  // deps of `load`, which is a dep of the effect) — no explicit refetch needed.
  const pickTag = (tag: string) => setActiveTag(activeTag === tag ? '' : tag);
  const pickLevel = (lvl: string) => setActiveLevel(activeLevel === lvl ? '' : lvl);

  const upvote = async (id: string) => {
    try {
      const data = await api(`/api/safety/shorts/${id}/upvote`, 'POST');
      setShorts((prev) => prev.map((s) => (s.id === id ? { ...s, upvoteCount: data.upvoteCount, upvotedByMe: data.upvotedByMe } : s)));
    } catch (e: any) {
      setError(e.message || 'Upvote failed.');
    }
  };

  const submit = async () => {
    if (submitting) return;
    setSubmitting(true);
    setFormMsg('');
    try {
      const steps = stepsText.split('\n').map((s) => s.trim()).filter(Boolean);
      const tagsArr = tagText.split(',').map((s) => s.trim()).filter(Boolean);
      await api('/api/safety/shorts/submit', 'POST', { title, steps, tags: tagsArr, level });
      setFormMsg('Submitted — thank you for helping the community.');
      setTitle('');
      setStepsText('');
      setTagText('');
      setShowForm(false);
      load();
      loadTags();
    } catch (e: any) {
      setFormMsg(e.message || 'Submission failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[115] bg-[#f6f1e7]/95 dark:bg-zinc-950/95 backdrop-blur-sm overflow-y-auto py-6 px-4">
      <div className="max-w-3xl mx-auto space-y-5">
        <Header onClose={onClose} />

        {/* Safety banner */}
        <div className="bg-[#fcfaf4] border border-[#ebdcca] rounded-3xl p-5 flex items-start gap-3">
          <span className="w-9 h-9 rounded-full bg-rose-600/10 flex items-center justify-center shrink-0">
            <ShieldCheck className="text-rose-600" size={17} />
          </span>
          <div className="space-y-1">
            <h3 className="font-display text-sm font-bold text-[#3a342a] dark:text-zinc-100">Safety first, always</h3>
            <p className="text-[11px] leading-relaxed text-[#5c5446] dark:text-zinc-300">
              These 30-second drills build muscle memory for the first chaotic seconds of an attack. In a real threat,{' '}
              <b>escape, yell and reach people — never stay to fight</b>. For immediate danger call your local emergency number.
            </p>
          </div>
        </div>

        {/* Filters */}
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {tags.slice(0, 12).map((t) => (
              <button
                key={t.tag}
                onClick={() => pickTag(t.tag)}
                className={`text-[9px] font-mono uppercase tracking-wide px-2.5 py-1 rounded-full transition-colors ${
                  activeTag === t.tag
                    ? 'bg-[#3a342a] text-[#f4f1ea]'
                    : 'bg-[#ebdcca]/40 dark:bg-zinc-800 text-[#5c5446] dark:text-zinc-300 hover:bg-[#ebdcca]/70 dark:hover:bg-zinc-700'
                }`}
              >
                {t.tag} · {t.count}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            <GraduationCap size={12} className="text-[#8a8172]" />
            {LEVELS.map((l) => (
              <button
                key={l}
                onClick={() => pickLevel(l)}
                className={`text-[9px] font-mono uppercase px-2.5 py-1 rounded-full transition-colors ${
                  activeLevel === l
                    ? 'bg-[#3a342a] text-[#f4f1ea]'
                    : 'bg-white border border-[#cfcac0] text-[#5c5446] hover:bg-[#f6f1e7]'
                }`}
              >
                {l}
              </button>
            ))}
          </div>
        </div>

        {/* Submit toggle */}
        <button
          onClick={() => setShowForm((v) => !v)}
          className="flex items-center gap-1.5 text-[10px] font-mono uppercase font-bold text-amber-800 dark:text-amber-400 hover:underline"
        >
          <Plus size={12} /> {showForm ? 'Hide' : 'Submit a community drill'}
        </button>
        {showForm && (
          <div className="bg-[#fcfaf4] border border-[#ebdcca] rounded-3xl p-5 space-y-3">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Drill title (e.g. 'Umbrella defence')"
              className="w-full px-3 py-2.5 rounded-xl bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 text-xs outline-none focus:border-amber-400"
            />
            <textarea
              value={stepsText}
              onChange={(e) => setStepsText(e.target.value)}
              placeholder={'One step per line:\n1. Step in, then…'}
              rows={4}
              className="w-full px-3 py-2.5 rounded-xl bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 text-xs outline-none focus:border-amber-400 resize-none"
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input
                value={tagText}
                onChange={(e) => setTagText(e.target.value)}
                placeholder="Tags, comma separated (women, students)"
                className="px-3 py-2.5 rounded-xl bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 text-xs outline-none focus:border-amber-400"
              />
              <select
                value={level}
                onChange={(e) => setLevel(e.target.value)}
                className="px-3 py-2.5 rounded-xl bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 text-xs outline-none focus:border-amber-400"
              >
                {LEVELS.map((l) => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={submit}
                disabled={submitting || title.trim().length < 5}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#3a342a] text-[#f4f1ea] text-[10px] font-mono uppercase font-bold hover:bg-[#52493b] disabled:opacity-40"
              >
                {submitting ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                Submit drill
              </button>
              {formMsg && <span className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172]">{formMsg}</span>}
            </div>
          </div>
        )}

        {/* Shorts grid */}
        {loading ? (
          <div className="py-12 text-center">
            <Loader2 className="mx-auto text-[#8a8172] animate-spin" size={24} />
          </div>
        ) : error ? (
          <div className="py-10 text-center font-mono text-[10px] uppercase tracking-wider text-rose-500">{error}</div>
        ) : shorts.length === 0 ? (
          <div className="py-10 text-center space-y-2">
            <ShieldCheck className="mx-auto text-[#8a8172]" size={26} />
            <p className="font-display text-sm text-[#5c5446] dark:text-zinc-300">No drills for this filter.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {shorts.map((s, i) => (
              <motion.div
                key={s.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.03, 0.3) }}
                className="bg-[#fcfaf4] border border-[#ebdcca] rounded-2xl overflow-hidden"
              >
                <div className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h4 className="text-[12px] font-bold text-[#3a342a] dark:text-zinc-100 leading-snug">{s.title}</h4>
                      <p className="font-mono text-[8px] uppercase tracking-wider text-[#8a8172] mt-0.5">
                        {s.instructor}
                        {s.source === 'community' && s.submittedByName ? ` · by ${s.submittedByName}` : ''}
                      </p>
                    </div>
                    <span className={`shrink-0 text-[8px] font-mono uppercase font-bold px-1.5 py-0.5 rounded-full ${LEVEL_COLORS[s.level]}`}>
                      {s.level}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="flex items-center gap-1 text-[8px] font-mono uppercase text-[#5c5446] dark:text-zinc-400 bg-[#ebdcca]/50 dark:bg-zinc-800 px-1.5 py-0.5 rounded-full">
                      <Clock3 size={8} /> {s.durationSec}s
                    </span>
                    {s.tags.slice(0, 3).map((t) => (
                      <button
                        key={t}
                        onClick={() => pickTag(t)}
                        className="text-[8px] font-mono uppercase text-amber-800 dark:text-amber-400 bg-amber-600/10 px-1.5 py-0.5 rounded-full hover:underline"
                      >
                        #{t}
                      </button>
                    ))}
                    {s.source === 'curated' && (
                      <span className="flex items-center gap-0.5 text-[8px] font-mono uppercase text-emerald-700 dark:text-emerald-400 bg-emerald-600/10 px-1.5 py-0.5 rounded-full">
                        <BadgeCheck size={8} /> curated
                      </span>
                    )}
                  </div>

                  <ol className="space-y-1.5">
                    {s.steps.map((step, idx) => (
                      <li key={idx} className="flex gap-2 text-[11px] leading-relaxed text-[#5c5446] dark:text-zinc-300">
                        <span className="font-mono text-[9px] text-[#8a8172] shrink-0 mt-0.5">{idx + 1}.</span>
                        <span>{step}</span>
                      </li>
                    ))}
                  </ol>

                  <div className="flex items-center justify-between pt-1">
                    <button
                      onClick={() => upvote(s.id)}
                      className={`flex items-center gap-1 text-[9px] font-mono uppercase font-bold transition-colors ${
                        s.upvotedByMe ? 'text-rose-600' : 'text-[#8a8172] hover:text-rose-600'
                      }`}
                    >
                      <Heart size={11} fill={s.upvotedByMe ? 'currentColor' : 'none'} />
                      {s.upvoteCount}
                    </button>
                    {s.durationSec <= 30 && (
                      <span className="text-[8px] font-mono uppercase tracking-wider text-[#8a8172]">30s drill ✓</span>
                    )}
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Header({ onClose }: { onClose: () => void }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-2">
        <span className="w-9 h-9 rounded-full bg-rose-600/10 flex items-center justify-center">
          <ShieldCheck className="text-rose-600" size={18} />
        </span>
        <div>
          <h2 className="font-display text-lg font-bold text-[#3a342a] dark:text-zinc-100">Self-Defense Shorts</h2>
          <p className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172]">30-second drills · safety category · 126</p>
        </div>
      </div>
      <button
        onClick={onClose}
        className="w-9 h-9 rounded-full bg-white/80 dark:bg-zinc-800 flex items-center justify-center text-[#3a342a] dark:text-zinc-200 hover:bg-white"
        aria-label="Close"
      >
        <X size={16} />
      </button>
    </div>
  );
}
