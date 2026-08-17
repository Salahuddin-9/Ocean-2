import { useEffect, useState } from 'react';
import { X, Gavel, ShieldAlert, Plus, Trash2, ListChecks } from 'lucide-react';

/**
 * Ocean — AI Community Moderator (Feature 143)
 * Configurable rules auto-warn / delete / mute flagged content.
 */
interface AIModeratorProps {
  token: string | null;
  currentUser: { id: string; name: string } | null;
  onClose: () => void;
}

interface Rule {
  id: string;
  name: string;
  category: string;
  threshold: number;
  action: string;
  enabled: boolean;
}

interface Action {
  id: string;
  targetType: string;
  targetId: string;
  ruleName: string;
  action: string;
  message: string;
  signals: string[];
  severity: number;
  createdAt: number;
}

const actionColor = (a: string) =>
  a === 'delete' ? 'text-rose-700 dark:text-rose-400'
    : a === 'mute' ? 'text-violet-700 dark:text-violet-400'
      : a === 'warn' ? 'text-amber-700 dark:text-amber-400'
        : 'text-emerald-700 dark:text-emerald-400';

export default function AIModerator({ token, currentUser, onClose }: AIModeratorProps) {
  const [tab, setTab] = useState<'review' | 'rules' | 'log'>('review');
  const [text, setText] = useState('Sign up now!! free prize for everyone who clicks this link and follows @spam_account');
  const [verdict, setVerdict] = useState<Action | null>(null);
  const [rules, setRules] = useState<Rule[]>([]);
  const [actions, setActions] = useState<Action[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [newRule, setNewRule] = useState({ name: '', category: 'harmful', threshold: 60, action: 'warn' });

  const headers = token ? { Authorization: `Bearer ${token}` } : {};

  const loadAll = async () => {
    try {
      const [r, a] = await Promise.all([
        fetch('/api/moderation/rules', { headers }),
        fetch('/api/moderation/actions', { headers }),
      ]);
      const rd = await r.json();
      const ad = await a.json();
      setRules(rd.rules || []);
      setActions(ad.actions || []);
    } catch { /* non-fatal */ }
  };

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const review = async () => {
    if (!text.trim()) return;
    setBusy(true);
    setError('');
    try {
      const r = await fetch('/api/moderation/auto-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ targetType: 'message', targetId: `msg-${Date.now()}`, text, authorId: currentUser?.id }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Review failed');
      setVerdict(d);
      loadAll();
    } catch (e: any) {
      setError(e.message || 'Review failed');
    } finally {
      setBusy(false);
    }
  };

  const addRule = async () => {
    if (newRule.name.trim().length < 3) return setError('Rule name too short.');
    setBusy(true);
    setError('');
    try {
      const r = await fetch('/api/moderation/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(newRule),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Failed');
      setRules(d.rules || []);
      setNewRule({ name: '', category: 'harmful', threshold: 60, action: 'warn' });
    } catch (e: any) {
      setError(e.message || 'Failed');
    } finally {
      setBusy(false);
    }
  };

  const deleteRule = async (id: string) => {
    try {
      await fetch(`/api/moderation/rules/${id}`, { method: 'DELETE', headers });
      loadAll();
    } catch { /* non-fatal */ }
  };

  return (
    <div className="fixed inset-0 z-[115] bg-[#141b2b]/60 dark:bg-[#05060c]/85 backdrop-blur-sm overflow-y-auto py-6 px-4">
      <div className="max-w-xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Gavel size={18} className="text-amber-800 dark:text-amber-400" />
            <h2 className="font-display font-bold text-lg text-[#3a342a] dark:text-zinc-100 tracking-tight">AI Community Moderator</h2>
            <span className="font-mono text-[9px] uppercase tracking-widest text-[#8a8172] dark:text-zinc-400">Feature 143</span>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-white/80 dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 flex items-center justify-center text-[#5c5446] dark:text-zinc-300 hover:bg-[#ebdcca]/50 transition-all" aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="flex gap-1.5 mb-3">
          {(['review', 'rules', 'log'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all ${
                tab === t
                  ? 'bg-amber-800 text-white dark:bg-amber-400 dark:text-zinc-950'
                  : 'bg-white/70 dark:bg-zinc-900 text-[#8a8172] dark:text-zinc-400 border border-[#ebdcca] dark:border-zinc-800'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {tab === 'review' && (
          <>
            <div className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-[#fcfaf4] dark:bg-zinc-900 p-4 mb-3">
              <p className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-widest text-[#8a8172] dark:text-zinc-500 mb-2">
                <ShieldAlert size={12} className="text-amber-600" /> Content to auto-review
              </p>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={3}
                className="w-full px-3 py-2.5 rounded-xl border border-[#ebdcca] dark:border-zinc-700 bg-white dark:bg-zinc-950 text-[12px] text-[#3a342a] dark:text-zinc-100 focus:outline-none focus:border-amber-500 resize-none mb-2"
              />
              <button onClick={review} disabled={busy || !currentUser} className="w-full rounded-xl bg-gradient-to-r from-amber-600 to-amber-800 text-white font-bold text-[12px] py-2.5 hover:brightness-110 transition-all disabled:opacity-40">
                {busy ? 'Reviewing…' : 'Run moderation review'}
              </button>
              {error && <p className="text-[10px] text-rose-600 dark:text-rose-400 mt-2">{error}</p>}
            </div>

            {verdict && (
              <div className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-[#fcfaf4] dark:bg-zinc-900 p-4">
                <p className="flex items-center gap-2 mb-1">
                  <ShieldAlert size={14} className={actionColor(verdict.action)} />
                  <span className={`font-bold text-[12px] uppercase tracking-wide ${actionColor(verdict.action)}`}>{verdict.action}</span>
                  <span className="ml-auto font-mono text-[10px] text-[#8a8172] dark:text-zinc-400">severity {verdict.severity}/100</span>
                </p>
                <p className="text-[11px] text-[#5c5446] dark:text-zinc-300 mb-2">{verdict.message}</p>
                {verdict.signals.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {verdict.signals.map((s, i) => (
                      <span key={i} className="px-1.5 py-0.5 rounded bg-[#f6f1e7] dark:bg-zinc-800 text-[8px] font-mono text-[#8a8172] dark:text-zinc-400">{s}</span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {tab === 'rules' && (
          <div className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-[#fcfaf4] dark:bg-zinc-900 p-4 mb-3">
            <p className="font-mono text-[9px] uppercase tracking-widest text-[#8a8172] dark:text-zinc-500 mb-2">Active rules</p>
            <div className="space-y-1.5 mb-3">
              {rules.map((r) => (
                <div key={r.id} className="flex items-center gap-2 rounded-xl border border-[#ebdcca] dark:border-zinc-800 p-2.5 text-[10px]">
                  <span className={`font-bold ${actionColor(r.action)}`}>{r.action}</span>
                  <span className="font-bold text-[#3a342a] dark:text-zinc-100">{r.name}</span>
                  <span className="text-[#8a8172]">{r.category} ≥ {r.threshold}</span>
                  <span className={`ml-auto px-1.5 py-0.5 rounded-full text-[8px] font-bold ${r.enabled ? 'bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500'}`}>
                    {r.enabled ? 'on' : 'off'}
                  </span>
                  <button onClick={() => deleteRule(r.id)} className="text-[#8a8172] hover:text-rose-600 transition-colors"><Trash2 size={12} /></button>
                </div>
              ))}
            </div>

            <p className="font-mono text-[9px] uppercase tracking-widest text-[#8a8172] dark:text-zinc-500 mb-2">New rule</p>
            <div className="grid grid-cols-2 gap-2 mb-2">
              <input
                value={newRule.name}
                onChange={(e) => setNewRule({ ...newRule, name: e.target.value })}
                placeholder="Rule name"
                className="col-span-2 px-3 py-2 rounded-xl border border-[#ebdcca] dark:border-zinc-700 bg-white dark:bg-zinc-950 text-[11px] text-[#3a342a] dark:text-zinc-100 focus:outline-none focus:border-amber-500"
              />
              <select value={newRule.category} onChange={(e) => setNewRule({ ...newRule, category: e.target.value })} className="px-2 py-2 rounded-xl border border-[#ebdcca] dark:border-zinc-700 bg-white dark:bg-zinc-950 text-[11px]">
                {['harmful', 'spam', 'misleading', 'bot'].map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <select value={newRule.action} onChange={(e) => setNewRule({ ...newRule, action: e.target.value })} className="px-2 py-2 rounded-xl border border-[#ebdcca] dark:border-zinc-700 bg-white dark:bg-zinc-950 text-[11px]">
                {['warn', 'delete', 'mute'].map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
              <input
                type="number"
                value={newRule.threshold}
                onChange={(e) => setNewRule({ ...newRule, threshold: Number(e.target.value) })}
                min={0}
                max={100}
                className="col-span-2 px-3 py-2 rounded-xl border border-[#ebdcca] dark:border-zinc-700 bg-white dark:bg-zinc-950 text-[11px]"
                placeholder="Threshold (0–100)"
              />
            </div>
            <button onClick={addRule} disabled={busy} className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-800 dark:bg-amber-400 text-white dark:text-zinc-950 font-bold text-[11px] hover:brightness-110 transition-all disabled:opacity-40">
              <Plus size={13} /> Add rule
            </button>
          </div>
        )}

        {tab === 'log' && (
          <div className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-[#fcfaf4] dark:bg-zinc-900 p-4">
            <p className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-widest text-[#8a8172] dark:text-zinc-500 mb-2">
              <ListChecks size={12} className="text-amber-600" /> Moderation log
            </p>
            {actions.length === 0 && <p className="text-[10px] text-[#8a8172] dark:text-zinc-500">No actions yet.</p>}
            <div className="space-y-1.5">
              {actions.map((a) => (
                <div key={a.id} className="rounded-xl border border-[#ebdcca] dark:border-zinc-800 p-2.5 text-[10px]">
                  <div className="flex items-center gap-2">
                    <span className={`font-bold uppercase ${actionColor(a.action)}`}>{a.action}</span>
                    <span className="text-[#8a8172]">{a.ruleName}</span>
                    <span className="ml-auto font-mono text-[8px] text-[#8a8172]">{new Date(a.createdAt).toLocaleTimeString()}</span>
                  </div>
                  <p className="text-[#5c5446] dark:text-zinc-300 mt-0.5">{a.message}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
