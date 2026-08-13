import { useState } from 'react';
import { X, BadgeCheck, ShieldQuestion, Ban, CircleHelp, SearchCheck } from 'lucide-react';

/**
 * Ocean — AI Semantic Fact-Checker (Feature 144)
 * Splits text into claims and renders a "Fact Context" verdict box.
 */
interface FactCheckerProps {
  token: string | null;
  currentUser: { id: string; name: string } | null;
  onClose: () => void;
}

interface FactClaim {
  text: string;
  verdict: string;
  reason: string;
}

interface FactCheck {
  id: string;
  postId: string | null;
  text: string;
  verdict: string;
  confidence: number;
  claims: FactClaim[];
  mode: string;
  createdAt: number;
}

const verdictMeta: Record<string, { icon: any; cls: string; label: string }> = {
  verified: { icon: BadgeCheck, cls: 'text-emerald-700 dark:text-emerald-400 border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40', label: 'Verified' },
  disputed: { icon: ShieldQuestion, cls: 'text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40', label: 'Disputed' },
  false: { icon: Ban, cls: 'text-rose-700 dark:text-rose-400 border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40', label: 'False' },
  unverified: { icon: CircleHelp, cls: 'text-[#8a8172] dark:text-zinc-400 border-[#ebdcca] dark:border-zinc-700 bg-[#f6f1e7] dark:bg-zinc-800', label: 'Unverified' },
};

const claimCls = (v: string) =>
  v === 'likely_false' ? 'text-rose-700 dark:text-rose-400'
    : v === 'disputed' ? 'text-amber-700 dark:text-amber-400'
      : v === 'likely_true' ? 'text-emerald-700 dark:text-emerald-400'
        : 'text-[#8a8172] dark:text-zinc-400';

export default function FactChecker({ token, currentUser, onClose }: FactCheckerProps) {
  const [text, setText] = useState('BREAKING: A miracle cure for COVID has been discovered and doctors hate it. 100% guaranteed. Share before it is deleted!');
  const [check, setCheck] = useState<FactCheck | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const headers = token ? { Authorization: `Bearer ${token}` } : {};

  const run = async () => {
    if (!text.trim()) return setError('Enter some text to check.');
    setBusy(true);
    setError('');
    try {
      const r = await fetch('/api/factcheck/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ text }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Check failed');
      setCheck(d.check);
    } catch (e: any) {
      setError(e.message || 'Check failed');
    } finally {
      setBusy(false);
    }
  };

  const meta = check ? verdictMeta[check.verdict] || verdictMeta.unverified : null;

  return (
    <div className="fixed inset-0 z-[115] bg-[#f6f1e7]/97 dark:bg-zinc-950/97 backdrop-blur-sm overflow-y-auto py-6 px-4">
      <div className="max-w-xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <SearchCheck size={18} className="text-amber-800 dark:text-amber-400" />
            <h2 className="font-display font-bold text-lg text-[#3a342a] dark:text-zinc-100 tracking-tight">AI Semantic Fact-Checker</h2>
            <span className="font-mono text-[9px] uppercase tracking-widest text-[#8a8172] dark:text-zinc-400">Feature 144</span>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-white/80 dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 flex items-center justify-center text-[#5c5446] dark:text-zinc-300 hover:bg-[#ebdcca]/50 transition-all" aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-[#fcfaf4] dark:bg-zinc-900 p-4 mb-3">
          <p className="text-[11px] text-[#5c5446] dark:text-zinc-300 leading-relaxed mb-3">
            Paste a viral post. Ocean splits it into <strong>individual claims</strong>, flags known false-claim patterns and
            marks what's actually verifiable. The result attaches to the post as a <strong>Fact Context</strong> box.
          </p>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            className="w-full px-3 py-2.5 rounded-xl border border-[#ebdcca] dark:border-zinc-700 bg-white dark:bg-zinc-950 text-[12px] text-[#3a342a] dark:text-zinc-100 focus:outline-none focus:border-amber-500 resize-none mb-2"
          />
          <button onClick={run} disabled={busy} className="w-full rounded-xl bg-gradient-to-r from-amber-600 to-amber-800 text-white font-bold text-[12px] py-2.5 hover:brightness-110 transition-all disabled:opacity-40">
            {busy ? 'Checking claims…' : 'Run fact-check'}
          </button>
          {error && <p className="text-[10px] text-rose-600 dark:text-rose-400 mt-2">{error}</p>}
        </div>

        {check && meta && (
          <div className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-[#fcfaf4] dark:bg-zinc-900 p-4">
            <div className={`flex items-center gap-2 rounded-xl border p-3 mb-3 ${meta.cls}`}>
              <meta.icon size={18} />
              <div>
                <p className="font-bold text-[12px] uppercase tracking-wide">{meta.label}</p>
                <p className="text-[10px] opacity-80">Confidence {check.confidence}% · {check.mode === 'llm' ? 'LLM reviewed' : 'pattern-based'} · {new Date(check.createdAt).toLocaleTimeString()}</p>
              </div>
            </div>
            <p className="font-mono text-[8px] uppercase tracking-widest text-[#8a8172] dark:text-zinc-500 mb-2">Claims ({check.claims.length})</p>
            <div className="space-y-1.5">
              {check.claims.map((c, i) => (
                <div key={i} className="rounded-xl border border-[#ebdcca] dark:border-zinc-800 p-2.5">
                  <p className="text-[11px] text-[#3a342a] dark:text-zinc-100">“{c.text}”</p>
                  <p className={`text-[9px] font-bold uppercase tracking-wider mt-0.5 ${claimCls(c.verdict)}`}>
                    {c.verdict.replace('_', ' ')}
                  </p>
                  <p className="text-[9px] text-[#8a8172] dark:text-zinc-500">{c.reason}</p>
                </div>
              ))}
            </div>
            <p className="text-[9px] text-[#8a8172] dark:text-zinc-500 mt-3">
              Fact-checking is heuristic — treat verdicts as a starting point, not a final ruling.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
