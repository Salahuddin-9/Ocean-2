import { useCallback, useEffect, useState } from 'react';
import { motion } from 'motion/react';
import {
  Sparkles, X, ScanSearch, Flag, MessageSquareText, Reply, History, Check,
  Loader2, ShieldAlert, TrendingUp, AlertTriangle, Settings, RefreshCw,
  FileText, Users, Copy, Send, Trash2, Activity,
} from 'lucide-react';

/**
 * Ocean — Smart Community (FEATURE 118 — AI-powered community management)
 * ------------------------------------------------------------------------
 * Three-tab panel backed by /api/community/smart/*:
 *   Scan & Report   — run the heuristic scan, browse detections grouped by tag
 *                     (spam/bot/misleading/harmful) with the fired-signal list,
 *                     manual flags, and tuning settings.
 *   Summaries       — auto-generate an AI (or template) summary of a post thread.
 *   Reply Assistant — smart reply suggestions with one-tap copy.
 */

interface SmartCommunityProps {
  token: string | null;
  currentUser: { id: string; name: string } | null;
  onClose: () => void;
}

type Tag = 'spam' | 'bot' | 'misleading' | 'harmful';
type Tab = 'scan' | 'summaries' | 'replies';

interface Detection {
  id: string;
  targetType: string;
  targetId: string;
  authorId: string;
  signals: string[];
  score: number;
  scoreByTag?: Partial<Record<Tag, number>>;
  tags: Tag[];
  createdAt: number;
  text?: string;
}

interface FlagItem {
  id: string;
  targetType: string;
  targetId: string;
  reason: string;
  flaggedBy?: string;
  flaggedByName?: string;
  auto?: boolean;
  createdAt: number;
}

interface ThreadSummaryResult {
  postId: string;
  summary: string;
  topics: string[];
  sentiment: 'positive' | 'neutral' | 'mixed' | 'negative';
  topCommenters: { id: string; name: string; count: number }[];
  mode: 'llm' | 'template';
  createdAt: number;
}

interface Suggestion {
  kind: 'agree' | 'empathize' | 'clarify' | 'praise';
  text: string;
}

interface SmartSettings {
  spamThreshold: number;
  misleadingThreshold: number;
  harmfulThreshold: number;
  autoFlagMode: 'off' | 'notify' | 'auto';
}

interface InactiveGroup {
  id: string;
  name: string;
  emoji: string;
  memberCount: number;
  lastActivityAt: number | null;
  idleDays: number | null;
  reactivationPrompt: string;
}

interface ReportData {
  detections: Detection[];
  countByTag: Record<Tag, number>;
  flaggedPosts: Detection[];
  flags: FlagItem[];
  inactiveGroups?: InactiveGroup[];
  lastScanAt: number | null;
  settings: SmartSettings;
  viewerId?: string | null;
}

const TAG_META: Record<Tag, { label: string; chip: string; badge: string }> = {
  spam: {
    label: 'Spam',
    chip: 'bg-amber-50 text-amber-700 border-amber-200/70 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900',
    badge: 'text-amber-700 dark:text-amber-300',
  },
  bot: {
    label: 'Bot',
    chip: 'bg-emerald-50 text-emerald-700 border-emerald-200/70 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900',
    badge: 'text-emerald-700 dark:text-emerald-300',
  },
  misleading: {
    label: 'Misleading',
    chip: 'bg-orange-50 text-orange-700 border-orange-200/70 dark:bg-orange-950/40 dark:text-orange-300 dark:border-orange-900',
    badge: 'text-orange-700 dark:text-orange-300',
  },
  harmful: {
    label: 'Harmful',
    chip: 'bg-rose-50 text-rose-700 border-rose-200/70 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900',
    badge: 'text-rose-700 dark:text-rose-300',
  },
};

const SENTIMENT_COLOR: Record<string, string> = {
  positive: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
  neutral: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300',
  mixed: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
  negative: 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300',
};

const KIND_LABEL: Record<string, string> = {
  agree: 'Agree', empathize: 'Empathize', clarify: 'Clarify', praise: 'Praise',
};

function timeAgo(ts: number): string {
  if (!ts) return 'never';
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export default function SmartCommunity({ token, currentUser, onClose }: SmartCommunityProps) {
  // ---- tabs + scan/report state ------------------------------------------
  const [tab, setTab] = useState<Tab>('scan');
  const [report, setReport] = useState<ReportData | null>(null);
  const [loadingReport, setLoadingReport] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanMessage, setScanMessage] = useState('');
  const [flagForm, setFlagForm] = useState({ targetType: 'post' as 'post' | 'comment', targetId: '', reason: '' });
  const [flagging, setFlagging] = useState(false);
  const [settingsForm, setSettingsForm] = useState<SmartSettings | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);

  // ---- summaries state ----------------------------------------------------
  const [postIdInput, setPostIdInput] = useState('');
  const [summarizing, setSummarizing] = useState(false);
  const [summaryResult, setSummaryResult] = useState<ThreadSummaryResult | null>(null);
  const [summaryHistory, setSummaryHistory] = useState<ThreadSummaryResult[]>([]);

  // ---- reply assistant state ---------------------------------------------
  const [contextText, setContextText] = useState('');
  const [generating, setGenerating] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [copied, setCopied] = useState<number | null>(null);

  const toast = (msg: string, variant?: string) => {
    window.dispatchEvent(new CustomEvent('show-toast', { detail: { message: msg, variant } }));
  };

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

  const loadReport = useCallback(async () => {
    setLoadingReport(true);
    try {
      const data = await api('/api/community/smart/report');
      setReport(data);
      setSettingsForm((prev) => prev ?? { ...data.settings });
    } catch (e: any) {
      console.error('Failed to load smart community report:', e);
    } finally {
      setLoadingReport(false);
    }
  }, [api]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  // ---- auth gate (after all hooks so render order stays stable) ----------
  if (!token) {
    return (
      <div className="fixed inset-0 z-[115] bg-[#141b2b]/55 dark:bg-[#05060c]/85 backdrop-blur-sm overflow-y-auto py-6 px-4">
        <div className="max-w-xl mx-auto">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-lg font-bold text-[#3a342a] dark:text-zinc-100 flex items-center gap-2">
              <Sparkles size={18} className="text-violet-600" /> Smart Community
            </h2>
            <button onClick={onClose} className="w-9 h-9 rounded-full bg-white/80 dark:bg-zinc-800 flex items-center justify-center text-[#3a342a] dark:text-zinc-200 hover:bg-white">
              <X size={16} />
            </button>
          </div>
          <div className="bg-[#fcfaf4] border border-[#ebdcca] rounded-3xl p-8 text-center space-y-3">
            <ShieldAlert className="mx-auto text-[#8a8172]" size={28} />
            <p className="font-display text-base font-bold text-[#3a342a] dark:text-zinc-100">Log in to manage your community</p>
            <p className="text-xs text-[#8a8172] max-w-xs mx-auto">
              Smart Community scans posts and comments, summarizes threads and suggests
              replies. Log in first, then come back here.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ---- actions --------------------------------------------------------------
  const runScan = async () => {
    if (scanning) return;
    setScanning(true);
    setScanMessage('');
    try {
      const data = await api('/api/community/smart/scan', 'POST');
      setScanMessage(
        `Scanned ${data.scanned || 0} items — ${(data.detections || []).length} detection${data.detections?.length === 1 ? '' : 's'}.`
      );
      await loadReport();
    } catch (e: any) {
      toast(e.message || 'Scan failed.', 'destructive');
    } finally {
      setScanning(false);
    }
  };

  const submitFlag = async () => {
    if (!flagForm.targetId.trim() || !flagForm.reason.trim()) {
      return toast('targetId and reason are required.');
    }
    setFlagging(true);
    try {
      await api('/api/community/smart/flag', 'POST', {
        targetType: flagForm.targetType,
        targetId: flagForm.targetId.trim(),
        reason: flagForm.reason.trim(),
      });
      toast('Content flagged.');
      setFlagForm({ targetType: 'post', targetId: '', reason: '' });
      await loadReport();
    } catch (e: any) {
      toast(e.message || 'Flag failed.', 'destructive');
    } finally {
      setFlagging(false);
    }
  };

  const clearItem = async (id: string, label: string) => {
    try {
      const data = await api('/api/community/smart/clear', 'POST', { id });
      toast(data.cleared === 'none' ? 'Nothing to clear.' : `${label} dismissed.`);
      await loadReport();
    } catch (e: any) {
      toast(e.message || 'Clear failed.', 'destructive');
    }
  };

  const saveSettings = async () => {
    if (!settingsForm) return;
    setSavingSettings(true);
    try {
      await api('/api/community/smart/settings', 'POST', settingsForm);
      toast('Settings saved.');
      await loadReport();
    } catch (e: any) {
      toast(e.message || 'Could not save settings.', 'destructive');
    } finally {
      setSavingSettings(false);
    }
  };

  const runSummarize = async (postId?: string) => {
    const target = (postId ?? postIdInput).trim();
    if (!target) return toast('Enter a postId.');
    setSummarizing(true);
    try {
      const data = await api('/api/community/smart/summarize', 'POST', { postId: target });
      const s = data.summary as ThreadSummaryResult;
      setSummaryResult(s);
      setPostIdInput(target);
      setSummaryHistory((prev) => {
        const next = [s, ...prev.filter((x) => x.postId !== s.postId)];
        return next.slice(0, 5);
      });
    } catch (e: any) {
      toast(e.message || 'Summarize failed.', 'destructive');
    } finally {
      setSummarizing(false);
    }
  };

  const generateReplies = async () => {
    if (generating) return;
    setGenerating(true);
    try {
      const data = await api('/api/community/smart/replies', 'POST', { contextText: contextText.trim() });
      setSuggestions(data.suggestions || []);
    } catch (e: any) {
      toast(e.message || 'Could not generate replies.', 'destructive');
    } finally {
      setGenerating(false);
    }
  };

  const copyText = async (text: string, index: number) => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopied(index);
      window.setTimeout(() => setCopied(null), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  const countByTag = report?.countByTag ?? { spam: 0, bot: 0, misleading: 0, harmful: 0 };
  const tagOrder: Tag[] = ['spam', 'bot', 'misleading', 'harmful'];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[115] bg-[#141b2b]/55 dark:bg-[#05060c]/85 backdrop-blur-sm overflow-y-auto py-6 px-4"
    >
      <div className="max-w-3xl mx-auto space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-9 h-9 rounded-full bg-violet-600/10 flex items-center justify-center">
              <Sparkles className="text-violet-600" size={18} />
            </span>
            <div>
              <h2 className="font-display text-lg font-bold text-[#3a342a] dark:text-zinc-100">Smart Community</h2>
              <p className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-400">
                AI-powered community management
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-white/80 dark:bg-zinc-800 flex items-center justify-center text-[#3a342a] dark:text-zinc-200 hover:bg-white"
          >
            <X size={16} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-2">
          {(
            [
              ['scan', 'Scan & Report'],
              ['summaries', 'Summaries'],
              ['replies', 'Reply Assistant'],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`font-mono text-[9px] uppercase font-bold tracking-wider py-1.5 px-3 rounded-full transition-all ${
                tab === k
                  ? 'bg-[#3a342a] text-[#f4f1ea] dark:bg-[#3a342a] dark:text-[#f4f1ea]'
                  : 'bg-white/70 dark:bg-zinc-800 text-[#5c5446] dark:text-zinc-400 border border-[#ebdcca] dark:border-zinc-700 hover:bg-[#ebdcca]/50'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* ============ SCAN & REPORT TAB ============ */}
        {tab === 'scan' && (
          <div className="space-y-5">
            {/* Run scan */}
            <div className="bg-[#fcfaf4] border border-[#ebdcca] rounded-3xl p-6 space-y-3">
              <div className="flex items-center gap-2">
                <span className="w-8 h-8 rounded-full bg-amber-600/10 flex items-center justify-center">
                  <ScanSearch className="text-amber-600" size={15} />
                </span>
                <div>
                  <h3 className="font-display text-sm font-bold text-[#3a342a] dark:text-zinc-100">Community scan</h3>
                  <p className="font-mono text-[8px] uppercase tracking-wider text-[#8a8172]">
                    Deterministic heuristics — spam / bot / misleading / harmful
                  </p>
                </div>
              </div>
              <p className="text-xs text-[#5c5446] dark:text-zinc-300 leading-relaxed">
                Runs locally with explainable rules (no external AI for detection): posting velocity,
                near-duplicate text, link-heavy &amp; keyword-stuffed captions, sensational / clickbait /
                unverifiable-claim phrasing, toxicity, threats and dox-ish patterns.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={runScan}
                  disabled={scanning}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#3a342a] text-[#f4f1ea] text-[10px] font-mono uppercase font-bold hover:bg-[#52493b] disabled:opacity-50"
                >
                  {scanning ? <Loader2 size={13} className="animate-spin" /> : <ScanSearch size={13} />}
                  Run scan
                </button>
                <button
                  onClick={loadReport}
                  disabled={loadingReport}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-[#cfcac0] text-xs text-[#3a342a] hover:bg-[#f6f1e7] disabled:opacity-50"
                >
                  <RefreshCw size={12} className={loadingReport ? 'animate-spin' : ''} /> Refresh
                </button>
                {scanMessage && (
                  <span className="font-mono text-[9px] uppercase tracking-wider text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
                    <Check size={11} /> {scanMessage}
                  </span>
                )}
              </div>
              <p className="font-mono text-[8px] uppercase tracking-wider text-[#8a8172]">
                Last scan: {timeAgo(report?.lastScanAt ?? 0)}
              </p>
            </div>

            {/* Report summary chips */}
            {report && (
              <div className="bg-[#fcfaf4] border border-[#ebdcca] rounded-3xl p-5 space-y-3">
                <h3 className="font-display text-sm font-bold text-[#3a342a] dark:text-zinc-100 flex items-center gap-2">
                  <TrendingUp size={15} className="text-amber-600" /> Report summary
                </h3>
                <div className="flex flex-wrap gap-2">
                  {tagOrder.map((tag) => (
                    <span key={tag} className={`flex items-center gap-1.5 text-[9px] font-mono uppercase font-bold px-2.5 py-1 rounded-full border ${TAG_META[tag].chip}`}>
                      {countByTag[tag]} {TAG_META[tag].label}
                    </span>
                  ))}
                  <span className="flex items-center gap-1.5 text-[9px] font-mono uppercase font-bold px-2.5 py-1 rounded-full border bg-white text-[#5c5446] border-[#ebdcca] dark:bg-zinc-800 dark:border-zinc-700">
                    {report.flags.length} manual flags
                  </span>
                </div>
                {report.flaggedPosts.length > 0 && (
                  <p className="text-[10px] text-[#8a8172]">
                    <b className="text-rose-600">{report.flaggedPosts.length}</b> detection
                    {report.flaggedPosts.length === 1 ? '' : 's'} above threshold
                    {report.settings.autoFlagMode === 'auto' ? ' (auto-flag ON — promoted to flags)' : ' (threshold only)'}.
                  </p>
                )}
              </div>
            )}

            {/* Inactive community groups (group inactivity detection) */}
            {report && report.inactiveGroups && report.inactiveGroups.length > 0 && (
              <div className="bg-[#fcfaf4] border border-[#ebdcca] rounded-3xl p-5 space-y-3">
                <h3 className="font-display text-sm font-bold text-[#3a342a] dark:text-zinc-100 flex items-center gap-2">
                  <Activity size={15} className="text-violet-600" /> Inactive groups ({report.inactiveGroups.length})
                </h3>
                <div className="space-y-3">
                  {report.inactiveGroups.map((g) => (
                    <div key={g.id} className="rounded-2xl border border-[#ebdcca]/70 dark:border-zinc-800 bg-white/60 dark:bg-zinc-900/60 p-3 space-y-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-sm">{g.emoji || '👥'}</span>
                        <span className="font-display text-xs font-bold text-[#3a342a] dark:text-zinc-100 flex-1 truncate">{g.name}</span>
                        <span className="font-mono text-[8px] uppercase font-bold px-1.5 py-0.5 rounded-full bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300">
                          {g.idleDays === null ? 'idle' : `${g.idleDays}d idle`}
                        </span>
                      </div>
                      <p className="text-[10px] text-[#5c5446] dark:text-zinc-400">
                        {g.memberCount} member{g.memberCount === 1 ? '' : 's'}
                        {g.lastActivityAt ? ` · last activity ${timeAgo(g.lastActivityAt)}` : ' · no posts yet'}
                      </p>
                      <p className="text-[10px] italic text-[#8a8172] dark:text-zinc-500 leading-relaxed">💡 {g.reactivationPrompt}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Detections grouped by tag */}
            {report && (
              <div className="space-y-4">
                {tagOrder.map((tag) => {
                  const items = report.detections.filter((d) => d.tags.includes(tag));
                  if (items.length === 0) return null;
                  return (
                    <div key={tag} className="bg-[#fcfaf4] border border-[#ebdcca] rounded-3xl p-5 space-y-3">
                      <div className="flex items-center justify-between">
                        <h3 className={`font-display text-sm font-bold flex items-center gap-2 ${TAG_META[tag].badge}`}>
                          {TAG_META[tag].label}
                          <span className="font-mono text-[9px] uppercase text-[#8a8172]">({items.length})</span>
                        </h3>
                        <span className="font-mono text-[8px] uppercase tracking-wider text-[#8a8172]">score ≥ {tagThresholdFor(tag, report.settings)}</span>
                      </div>
                      <div className="space-y-3">
                        {items.map((d) => (
                          <div key={d.id} className="rounded-2xl border border-[#ebdcca]/70 dark:border-zinc-800 bg-white/60 dark:bg-zinc-900/60 p-3 space-y-2">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-[8px] uppercase font-bold bg-[#ebdcca]/50 dark:bg-zinc-800 text-[#5c5446] dark:text-zinc-300 px-1.5 py-0.5 rounded-full">
                                {d.targetType}
                              </span>
                              <span className="font-mono text-[8px] text-[#8a8172] truncate flex-1">{d.targetId}</span>
                              <span
                                className={`font-mono text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                                  d.score >= (d.tags.includes('harmful') ? report.settings.harmfulThreshold : report.settings.spamThreshold)
                                    ? 'bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-300'
                                    : 'bg-[#ebdcca]/40 text-[#5c5446] dark:bg-zinc-800 dark:text-zinc-300'
                                }`}
                              >
                                {d.score}
                              </span>
                              <button
                                onClick={() => clearItem(d.id, 'Detection')}
                                title="Dismiss"
                                className="text-[#8a8172] hover:text-rose-600 transition-colors"
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                            {d.text && (
                              <p className="text-[11px] text-[#3a342a] dark:text-zinc-200 leading-relaxed line-clamp-2">{d.text}</p>
                            )}
                            <ul className="space-y-0.5">
                              {d.signals.map((s) => (
                                <li key={s} className="flex items-start gap-1.5 text-[10px] text-[#5c5446] dark:text-zinc-400">
                                  <AlertTriangle size={10} className={`mt-0.5 shrink-0 ${TAG_META[tag].badge}`} />
                                  {s}
                                </li>
                              ))}
                            </ul>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
                {report.detections.length === 0 && (
                  <div className="bg-[#fcfaf4] border border-[#ebdcca] rounded-3xl p-8 text-center space-y-2">
                    <Check className="mx-auto text-emerald-600" size={26} />
                    <p className="font-display text-sm text-[#5c5446] dark:text-zinc-300">No detections yet.</p>
                    <p className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172]">Run a scan to start monitoring</p>
                  </div>
                )}
              </div>
            )}

            {/* Manual flag */}
            <div className="bg-[#fcfaf4] border border-[#ebdcca] rounded-3xl p-5 space-y-3">
              <h3 className="font-display text-sm font-bold text-[#3a342a] dark:text-zinc-100 flex items-center gap-2">
                <Flag size={15} className="text-rose-600" /> Manual flags
              </h3>
              <div className="flex flex-wrap gap-2">
                <select
                  value={flagForm.targetType}
                  onChange={(e) => setFlagForm({ ...flagForm, targetType: e.target.value as 'post' | 'comment' })}
                  className="bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 rounded-xl px-2 py-2 text-xs capitalize text-[#3a342a] dark:text-zinc-100 outline-none"
                >
                  <option value="post">post</option>
                  <option value="comment">comment</option>
                </select>
                <input
                  value={flagForm.targetId}
                  onChange={(e) => setFlagForm({ ...flagForm, targetId: e.target.value })}
                  placeholder="targetId"
                  className="flex-1 min-w-[120px] bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 rounded-xl px-3 py-2 text-xs text-[#3a342a] dark:text-zinc-100 outline-none focus:border-amber-400"
                />
                <input
                  value={flagForm.reason}
                  onChange={(e) => setFlagForm({ ...flagForm, reason: e.target.value })}
                  placeholder="reason"
                  className="flex-1 min-w-[140px] bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 rounded-xl px-3 py-2 text-xs text-[#3a342a] dark:text-zinc-100 outline-none focus:border-amber-400"
                />
                <button
                  onClick={submitFlag}
                  disabled={flagging}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-rose-600 text-white text-[10px] font-mono uppercase font-bold hover:bg-rose-700 disabled:opacity-50"
                >
                  {flagging ? <Loader2 size={13} className="animate-spin" /> : <Flag size={13} />} Flag
                </button>
              </div>
              {report && report.flags.length > 0 && (
                <div className="space-y-2 pt-1">
                  {report.flags.slice(0, 20).map((f) => (
                    <div key={f.id} className="rounded-xl border border-[#ebdcca]/70 dark:border-zinc-800 bg-white/60 dark:bg-zinc-900/60 p-3 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[8px] uppercase font-bold bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-300 px-1.5 py-0.5 rounded-full">
                          {f.targetType}
                        </span>
                        <span className="font-mono text-[8px] text-[#8a8172] truncate flex-1">{f.targetId}</span>
                        {f.auto && <span className="font-mono text-[8px] uppercase text-violet-600 dark:text-violet-400">auto</span>}
                        <span className="font-mono text-[8px] text-[#8a8172]">{timeAgo(f.createdAt)}</span>
                        <button onClick={() => clearItem(f.id, 'Flag')} className="text-[#8a8172] hover:text-rose-600" title="Clear flag">
                          <Trash2 size={12} />
                        </button>
                      </div>
                      <p className="text-[11px] text-[#5c5446] dark:text-zinc-300">
                        {f.reason} {f.flaggedByName && f.flaggedByName !== 'Smart Community' && (
                          <span className="text-[#8a8172]">— by {f.flaggedByName}</span>
                        )}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Settings */}
            <div className="bg-[#fcfaf4] border border-[#ebdcca] rounded-3xl p-5 space-y-3">
              <h3 className="font-display text-sm font-bold text-[#3a342a] dark:text-zinc-100 flex items-center gap-2">
                <Settings size={15} className="text-violet-600" /> Detection settings
              </h3>
              {settingsForm && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <label className="block">
                    <span className="font-mono text-[8px] uppercase tracking-wider text-[#8a8172]">Spam / Bot threshold</span>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={settingsForm.spamThreshold}
                      onChange={(e) => setSettingsForm({ ...settingsForm, spamThreshold: Number(e.target.value) })}
                      className="w-full mt-1 bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 rounded-xl px-3 py-2 text-sm text-[#3a342a] dark:text-zinc-100 outline-none focus:border-amber-400"
                    />
                  </label>
                  <label className="block">
                    <span className="font-mono text-[8px] uppercase tracking-wider text-[#8a8172]">Misleading threshold</span>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={settingsForm.misleadingThreshold}
                      onChange={(e) => setSettingsForm({ ...settingsForm, misleadingThreshold: Number(e.target.value) })}
                      className="w-full mt-1 bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 rounded-xl px-3 py-2 text-sm text-[#3a342a] dark:text-zinc-100 outline-none focus:border-amber-400"
                    />
                  </label>
                  <label className="block">
                    <span className="font-mono text-[8px] uppercase tracking-wider text-[#8a8172]">Harmful threshold</span>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={settingsForm.harmfulThreshold}
                      onChange={(e) => setSettingsForm({ ...settingsForm, harmfulThreshold: Number(e.target.value) })}
                      className="w-full mt-1 bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 rounded-xl px-3 py-2 text-sm text-[#3a342a] dark:text-zinc-100 outline-none focus:border-amber-400"
                    />
                  </label>
                  <label className="block sm:col-span-2">
                    <span className="font-mono text-[8px] uppercase tracking-wider text-[#8a8172]">Auto-flag mode</span>
                    <select
                      value={settingsForm.autoFlagMode}
                      onChange={(e) => setSettingsForm({ ...settingsForm, autoFlagMode: e.target.value as SmartSettings['autoFlagMode'] })}
                      className="w-full mt-1 bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 rounded-xl px-2 py-2 text-sm capitalize text-[#3a342a] dark:text-zinc-100 outline-none"
                    >
                      <option value="off">Off — detection only</option>
                      <option value="notify">Notify — threshold only</option>
                      <option value="auto">Auto — promote to flags</option>
                    </select>
                  </label>
                  <div className="flex items-end">
                    <button
                      onClick={saveSettings}
                      disabled={savingSettings}
                      className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-[#3a342a] text-[#f4f1ea] text-[10px] font-mono uppercase font-bold hover:bg-[#52493b] disabled:opacity-50"
                    >
                      {savingSettings ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Save
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ============ SUMMARIES TAB ============ */}
        {tab === 'summaries' && (
          <div className="space-y-5">
            <div className="bg-[#fcfaf4] border border-[#ebdcca] rounded-3xl p-6 space-y-3">
              <div className="flex items-center gap-2">
                <span className="w-8 h-8 rounded-full bg-violet-600/10 flex items-center justify-center">
                  <FileText className="text-violet-600" size={15} />
                </span>
                <div>
                  <h3 className="font-display text-sm font-bold text-[#3a342a] dark:text-zinc-100">Thread summary</h3>
                  <p className="font-mono text-[8px] uppercase tracking-wider text-[#8a8172]">
                    LLM when a key is set, deterministic template otherwise
                  </p>
                </div>
              </div>
              <p className="text-xs text-[#5c5446] dark:text-zinc-300 leading-relaxed">
                Reads the post and its comment thread and produces a 2-3 sentence summary,
                topic keywords, sentiment and the most active commenters.
              </p>
              <div className="flex gap-2">
                <input
                  value={postIdInput}
                  onChange={(e) => setPostIdInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') runSummarize(); }}
                  placeholder="postId (e.g. post-...)"
                  className="flex-1 bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 rounded-xl px-3 py-2 text-sm text-[#3a342a] dark:text-zinc-100 outline-none focus:border-amber-400"
                />
                <button
                  onClick={() => runSummarize()}
                  disabled={summarizing}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#3a342a] text-[#f4f1ea] text-[10px] font-mono uppercase font-bold hover:bg-[#52493b] disabled:opacity-50"
                >
                  {summarizing ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />} Summarize
                </button>
              </div>
            </div>

            {summaryResult && (
              <div className="bg-[#fcfaf4] border border-[#ebdcca] rounded-3xl p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <MessageSquareText size={15} className="text-violet-600" />
                    <span className="font-display text-sm font-bold text-[#3a342a] dark:text-zinc-100">Summary</span>
                    <span className="font-mono text-[8px] uppercase text-[#8a8172]">#{summaryResult.postId}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-[8px] font-mono uppercase font-bold px-2 py-0.5 rounded-full ${SENTIMENT_COLOR[summaryResult.sentiment] || SENTIMENT_COLOR.neutral}`}>
                      {summaryResult.sentiment}
                    </span>
                    <span className="font-mono text-[8px] uppercase text-[#8a8172]">
                      {summaryResult.mode === 'llm' ? 'LLM' : 'template'}
                    </span>
                  </div>
                </div>
                <p className="text-sm text-[#3a342a] dark:text-zinc-200 leading-relaxed">{summaryResult.summary}</p>
                {summaryResult.topics.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {summaryResult.topics.map((t) => (
                      <span key={t} className="flex items-center gap-0.5 text-[8px] font-mono uppercase text-[#5c5446] dark:text-zinc-300 bg-[#ebdcca]/50 dark:bg-zinc-800 px-1.5 py-0.5 rounded-full">
                        {t}
                      </span>
                    ))}
                  </div>
                )}
                {summaryResult.topCommenters.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="font-mono text-[8px] uppercase tracking-wider text-[#8a8172] flex items-center gap-1">
                      <Users size={10} /> Top commenters
                    </p>
                    {summaryResult.topCommenters.map((c) => (
                      <div key={c.id} className="flex items-center justify-between text-[11px] text-[#5c5446] dark:text-zinc-300">
                        <span className="truncate">{c.name}</span>
                        <span className="font-mono text-[9px] text-[#8a8172]">{c.count} comment{c.count === 1 ? '' : 's'}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {summaryHistory.length > 0 && (
              <div className="bg-[#fcfaf4] border border-[#ebdcca] rounded-3xl p-5 space-y-2">
                <h3 className="font-display text-sm font-bold text-[#3a342a] dark:text-zinc-100 flex items-center gap-2">
                  <History size={15} className="text-[#8a8172]" /> Recent summaries
                </h3>
                <div className="space-y-1.5">
                  {summaryHistory.map((s) => (
                    <button
                      key={s.createdAt}
                      onClick={() => { setSummaryResult(s); setPostIdInput(s.postId); }}
                      className="w-full text-left flex items-center gap-2 text-[11px] text-[#5c5446] dark:text-zinc-300 bg-white/60 dark:bg-zinc-900/60 border border-[#ebdcca]/70 dark:border-zinc-800 rounded-xl px-3 py-2 hover:bg-[#ebdcca]/30 transition-colors"
                    >
                      <span className="font-mono text-[8px] text-[#8a8172] shrink-0">#{s.postId}</span>
                      <span className="truncate flex-1">{s.summary}</span>
                      <span className={`text-[8px] font-mono uppercase font-bold px-1.5 py-0.5 rounded-full shrink-0 ${SENTIMENT_COLOR[s.sentiment] || SENTIMENT_COLOR.neutral}`}>
                        {s.sentiment}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ============ REPLY ASSISTANT TAB ============ */}
        {tab === 'replies' && (
          <div className="space-y-5">
            <div className="bg-[#fcfaf4] border border-[#ebdcca] rounded-3xl p-6 space-y-3">
              <div className="flex items-center gap-2">
                <span className="w-8 h-8 rounded-full bg-emerald-600/10 flex items-center justify-center">
                  <Reply className="text-emerald-600" size={15} />
                </span>
                <div>
                  <h3 className="font-display text-sm font-bold text-[#3a342a] dark:text-zinc-100">Reply Assistant</h3>
                  <p className="font-mono text-[8px] uppercase tracking-wider text-[#8a8172]">
                    4 quick suggestions — LLM enhanced when a key is set
                  </p>
                </div>
              </div>
              <textarea
                value={contextText}
                onChange={(e) => setContextText(e.target.value)}
                placeholder="Paste the comment / message you want to reply to (optional)…"
                rows={3}
                className="w-full bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 rounded-xl px-3 py-2 text-sm text-[#3a342a] dark:text-zinc-100 outline-none focus:border-amber-400 resize-none"
              />
              <button
                onClick={generateReplies}
                disabled={generating}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#3a342a] text-[#f4f1ea] text-[10px] font-mono uppercase font-bold hover:bg-[#52493b] disabled:opacity-50"
              >
                {generating ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />} Generate suggestions
              </button>
            </div>

            {suggestions.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {suggestions.map((s, i) => (
                  <motion.div
                    key={`${s.kind}-${i}`}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className="bg-[#fcfaf4] border border-[#ebdcca] rounded-2xl p-4 space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[8px] uppercase font-bold text-violet-600 dark:text-violet-400">
                        {KIND_LABEL[s.kind] || s.kind}
                      </span>
                      <button
                        onClick={() => copyText(s.text, i)}
                        className="flex items-center gap-1 text-[8px] font-mono uppercase font-bold text-[#5c5446] dark:text-zinc-300 hover:text-amber-800 dark:hover:text-amber-400 transition-colors"
                      >
                        {copied === i ? <Check size={10} className="text-emerald-600" /> : <Copy size={10} />}
                        {copied === i ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                    <p className="text-[13px] text-[#3a342a] dark:text-zinc-200 leading-relaxed">{s.text}</p>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}

/** Threshold used to color a detection's score, per its primary tag. */
function tagThresholdFor(tag: Tag, s: SmartSettings): number {
  if (tag === 'harmful') return s.harmfulThreshold;
  if (tag === 'misleading') return s.misleadingThreshold;
  return s.spamThreshold;
}
