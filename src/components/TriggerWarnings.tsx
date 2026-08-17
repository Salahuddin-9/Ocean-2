import { useState } from 'react';
import { X, ShieldAlert, Eye, EyeOff, ScanText } from 'lucide-react';

/**
 * Ocean — Trigger Warning Auto-Blur (Feature 139)
 * Scans text for sensitive triggers; content that matches gets blurred by default
 * with a "Show content" gate. Also demo-blurs any scanned snippet.
 */
interface TriggerWarningsProps {
  token: string | null;
  currentUser: { id: string; name: string } | null;
  onClose: () => void;
}

interface Warning {
  category: string;
  label: string;
  keywords: string[];
  severity: 'mild' | 'moderate' | 'severe';
}

const sevColor = (s: string) =>
  s === 'severe' ? 'bg-rose-100 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 border-rose-300 dark:border-rose-800'
    : s === 'moderate' ? 'bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-800'
      : 'bg-zinc-100 dark:bg-zinc-800 text-[#5c5446] dark:text-zinc-300 border-[#ebdcca] dark:border-zinc-700';

export default function TriggerWarnings({ token, onClose }: TriggerWarningsProps) {
  const [postId, setPostId] = useState('');
  const [text, setText] = useState('');
  const [warnings, setWarnings] = useState<Warning[]>([]);
  const [severity, setSeverity] = useState('none');
  const [blurred, setBlurred] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [demoText, setDemoText] = useState('The video shows the aftermath of a shooting and includes graphic images of blood.');

  const headers = token ? { Authorization: `Bearer ${token}` } : {};

  const scanPost = async () => {
    if (!postId.trim()) return setError('Enter a post ID.');
    setBusy(true);
    setError('');
    try {
      const r = await fetch('/api/posts/trigger-scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ postId: postId.trim() }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Scan failed');
      setWarnings(d.scan.warnings || []);
      setSeverity(d.scan.severity);
    } catch (e: any) {
      setError(e.message || 'Scan failed');
    } finally {
      setBusy(false);
    }
  };

  const scanText = async () => {
    if (!demoText.trim()) return;
    setBusy(true);
    setError('');
    try {
      const r = await fetch('/api/posts/trigger-scan-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: demoText }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Scan failed');
      setWarnings(d.warnings || []);
      setSeverity(d.severity);
      setBlurred(true);
    } catch (e: any) {
      setError(e.message || 'Scan failed');
    } finally {
      setBusy(false);
    }
  };

  const needsGate = severity !== 'none';

  return (
    <div className="fixed inset-0 z-[115] bg-[#141b2b]/60 dark:bg-[#05060c]/85 backdrop-blur-sm overflow-y-auto py-6 px-4">
      <div className="max-w-xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <ShieldAlert size={18} className="text-amber-800 dark:text-amber-400" />
            <h2 className="font-display font-bold text-lg text-[#3a342a] dark:text-zinc-100 tracking-tight">Trigger Warning Auto-Blur</h2>
            <span className="font-mono text-[9px] uppercase tracking-widest text-[#8a8172] dark:text-zinc-400">Feature 139</span>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-white/80 dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 flex items-center justify-center text-[#5c5446] dark:text-zinc-300 hover:bg-[#ebdcca]/50 transition-all" aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-[#fcfaf4] dark:bg-zinc-900 p-4 mb-3">
          <p className="text-[11px] text-[#5c5446] dark:text-zinc-300 leading-relaxed mb-3">
            Posts containing violence, self-harm, phobia triggers or graphic content are <strong>blurred by default</strong>
            with a "Show content" gate. Matches are deterministic keywords — no match means the post is never blocked (fail-open).
          </p>
          <div className="flex gap-2 mb-3">
            <input
              value={postId}
              onChange={(e) => setPostId(e.target.value)}
              placeholder="Post ID to scan (optional)"
              className="flex-1 px-3 py-2.5 rounded-xl border border-[#ebdcca] dark:border-zinc-700 bg-white dark:bg-zinc-950 text-[12px] text-[#3a342a] dark:text-zinc-100 focus:outline-none focus:border-amber-500"
            />
            <button onClick={scanPost} disabled={busy} className="px-4 rounded-xl bg-amber-800 dark:bg-amber-400 text-white dark:text-zinc-950 font-bold text-[11px] hover:brightness-110 transition-all disabled:opacity-40">
              Scan post
            </button>
          </div>
          {error && <p className="text-[10px] text-rose-600 dark:text-rose-400 mb-2">{error}</p>}
        </div>

        <div className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-[#fcfaf4] dark:bg-zinc-900 p-4 mb-3">
          <p className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-widest text-[#8a8172] dark:text-zinc-500 mb-2">
            <ScanText size={12} className="text-amber-600" /> Live text demo
          </p>
          <textarea
            value={demoText}
            onChange={(e) => setDemoText(e.target.value)}
            rows={2}
            className="w-full px-3 py-2.5 rounded-xl border border-[#ebdcca] dark:border-zinc-700 bg-white dark:bg-zinc-950 text-[12px] text-[#3a342a] dark:text-zinc-100 focus:outline-none focus:border-amber-500 resize-none mb-2"
          />
          <button onClick={scanText} disabled={busy} className="w-full rounded-xl border border-amber-700/40 dark:border-amber-400/40 text-amber-800 dark:text-amber-300 font-bold text-[11px] py-2 hover:bg-amber-50 dark:hover:bg-amber-950/40 transition-all">
            {busy ? 'Scanning…' : 'Scan this text'}
          </button>
        </div>

        {needsGate && (
          <div className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-[#fcfaf4] dark:bg-zinc-900 p-4 mb-3">
            <div className="flex flex-wrap gap-1.5 mb-3">
              {warnings.map((w) => (
                <span key={w.category} className={`px-2 py-1 rounded-full border text-[9px] font-bold uppercase tracking-wider ${sevColor(w.severity)}`}>
                  {w.label} {w.severity !== 'mild' && `· ${w.severity}`}
                </span>
              ))}
            </div>
            <p className="text-[10px] text-[#8a8172] dark:text-zinc-400 mb-2">The scanner found {warnings.length} trigger categor{warnings.length === 1 ? 'y' : 'ies'}. This post would be gated:</p>
            <div className="relative rounded-xl overflow-hidden border border-[#ebdcca] dark:border-zinc-700">
              {blurred && (
                <div className="absolute inset-0 z-10 backdrop-blur-xl bg-white/30 dark:bg-zinc-950/40 flex items-center justify-center">
                  <span className="font-mono text-[8px] uppercase tracking-widest text-[#3a342a] dark:text-zinc-200 bg-white/80 dark:bg-zinc-900/80 px-3 py-1.5 rounded-full border border-[#ebdcca] dark:border-zinc-700">Blurred · {warnings[0]?.label || 'sensitive'}</span>
                </div>
              )}
              <div className="p-4">
                <div className="h-28 rounded-lg bg-gradient-to-br from-amber-100 to-amber-200 dark:from-zinc-800 dark:to-zinc-700 mb-2 flex items-center justify-center">
                  <span className="text-[10px] font-mono text-[#8a8172] dark:text-zinc-400">[media preview]</span>
                </div>
                <p className="text-[11px] text-[#5c5446] dark:text-zinc-300">{demoText || 'Scanned content…'}</p>
              </div>
              <button
                onClick={() => setBlurred((b) => !b)}
                className={`absolute bottom-2 right-2 z-20 flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[10px] font-bold transition-all ${
                  blurred ? 'bg-amber-800 text-white hover:brightness-110' : 'bg-white/90 dark:bg-zinc-900 text-[#5c5446] dark:text-zinc-200 border border-[#ebdcca] dark:border-zinc-700'
                }`}
              >
                {blurred ? <><EyeOff size={11} /> Show content</> : <><Eye size={11} /> Re-blur</>}
              </button>
            </div>
          </div>
        )}

        {!needsGate && severity === 'none' && (
          <div className="rounded-2xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 p-4 text-[11px] text-emerald-700 dark:text-emerald-300">
            No triggers detected — content stays fully visible.
          </div>
        )}
      </div>
    </div>
  );
}
