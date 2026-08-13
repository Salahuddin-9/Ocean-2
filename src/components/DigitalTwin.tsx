import { useEffect, useState } from 'react';
import { X, Bot, GraduationCap, Power, Send, MessageCircle } from 'lucide-react';

/**
 * Ocean — Digital Twin Auto-Responder (Feature 149)
 * Train a bot on your message style, toggle it on, and test replies.
 */
interface DigitalTwinProps {
  token: string | null;
  currentUser: { id: string; name: string } | null;
  onClose: () => void;
}

interface TwinStyle {
  avgLength: number;
  emojiRate: number;
  capsRate: number;
  topPhrases: string[];
  sampleCount: number;
}

interface Twin {
  enabled: boolean;
  tone: string;
  style: TwinStyle;
  trainedAt: number | null;
}

export default function DigitalTwin({ token, currentUser, onClose }: DigitalTwinProps) {
  const [twin, setTwin] = useState<Twin | null>(null);
  const [incoming, setIncoming] = useState('Hey! are you free tomorrow?');
  const [reply, setReply] = useState('');
  const [mode, setMode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const headers = token ? { Authorization: `Bearer ${token}` } : {};

  const load = async () => {
    if (!token) return;
    try {
      const r = await fetch('/api/twin/status', { headers });
      const d = await r.json();
      setTwin(d.twin);
    } catch { /* non-fatal */ }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const act = async (path: string, body?: any) => {
    setBusy(true);
    setError('');
    try {
      const r = await fetch(path, {
        method: 'POST',
        headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers },
        body: body ? JSON.stringify(body) : undefined,
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Request failed');
      return d;
    } catch (e: any) {
      setError(e.message);
      return null;
    } finally {
      setBusy(false);
    }
  };

  const train = async () => {
    const d = await act('/api/twin/train');
    if (d) setTwin(d.twin);
  };

  const toggle = async (enabled: boolean) => {
    const d = await act('/api/twin/enable', { enabled });
    if (d) setTwin(d.twin);
  };

  const setTone = async (tone: string) => {
    const d = await act('/api/twin/enable', { tone });
    if (d) setTwin(d.twin);
  };

  const askTwin = async () => {
    const d = await act('/api/twin/reply', { text: incoming });
    if (d) {
      setReply(d.reply);
      setMode(d.mode);
    }
  };

  return (
    <div className="fixed inset-0 z-[115] bg-[#f6f1e7]/97 dark:bg-zinc-950/97 backdrop-blur-sm overflow-y-auto py-6 px-4">
      <div className="max-w-xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Bot size={18} className="text-amber-800 dark:text-amber-400" />
            <h2 className="font-display font-bold text-lg text-[#3a342a] dark:text-zinc-100 tracking-tight">Digital Twin</h2>
            <span className="font-mono text-[9px] uppercase tracking-widest text-[#8a8172] dark:text-zinc-400">Feature 149</span>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-white/80 dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 flex items-center justify-center text-[#5c5446] dark:text-zinc-300 hover:bg-[#ebdcca]/50 transition-all" aria-label="Close">
            <X size={16} />
          </button>
        </div>

        {error && <p className="text-[10px] text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-xl p-2.5 mb-3">{error}</p>}
        {!currentUser && <p className="text-[11px] text-[#8a8172] dark:text-zinc-400 rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-[#fcfaf4] dark:bg-zinc-900 p-4 mb-3">Log in to build your digital twin.</p>}

        <div className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-[#fcfaf4] dark:bg-zinc-900 p-4 mb-3">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="font-bold text-[12px] text-[#3a342a] dark:text-zinc-100 flex items-center gap-1.5">
                <MessageCircle size={13} className="text-amber-700 dark:text-amber-400" />
                Twin status
              </p>
              <p className="text-[9px] text-[#8a8172] dark:text-zinc-500">
                {twin ? `Trained on ${twin.style.sampleCount} messages${twin.trainedAt ? ` · ${new Date(twin.trainedAt).toLocaleDateString()}` : ''}` : 'Not trained yet'}
              </p>
            </div>
            <button
              onClick={() => twin && toggle(!twin.enabled)}
              disabled={!twin || busy}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-bold transition-all disabled:opacity-40 ${
                twin?.enabled ? 'bg-emerald-600 text-white' : 'bg-[#ebdcca] dark:bg-zinc-800 text-[#5c5446] dark:text-zinc-300'
              }`}
            >
              <Power size={11} /> {twin?.enabled ? 'On' : 'Off'}
            </button>
          </div>

          <div className="flex gap-2 mb-3">
            <button onClick={train} disabled={busy} className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-amber-800 dark:bg-amber-400 text-white dark:text-zinc-950 font-bold text-[11px] py-2.5 hover:brightness-110 transition-all disabled:opacity-40">
              <GraduationCap size={13} /> Train on my messages
            </button>
            <div className="flex rounded-xl border border-[#ebdcca] dark:border-zinc-700 overflow-hidden">
              {['casual', 'formal', 'witty'].map((t) => (
                <button
                  key={t}
                  onClick={() => setTone(t)}
                  disabled={!twin || busy}
                  className={`px-2.5 text-[10px] font-bold transition-all disabled:opacity-40 ${twin?.tone === t ? 'bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-300' : 'bg-white dark:bg-zinc-950 text-[#8a8172]'}`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {twin && (
            <div className="grid grid-cols-3 gap-1.5">
              {[
                ['Avg length', `${twin.style.avgLength} words`],
                ['Emoji use', `${Math.round(twin.style.emojiRate * 100)}%`],
                ['Excited endings', `${Math.round(twin.style.capsRate * 100)}%`],
              ].map(([label, val]) => (
                <div key={label} className="rounded-xl bg-[#f6f1e7] dark:bg-zinc-800 p-2 text-center">
                  <p className="font-display font-black text-sm text-[#3a342a] dark:text-zinc-100">{val}</p>
                  <p className="font-mono text-[7px] uppercase tracking-widest text-[#8a8172] dark:text-zinc-500">{label}</p>
                </div>
              ))}
              {twin.style.topPhrases.length > 0 && (
                <div className="col-span-3 rounded-xl border border-[#ebdcca] dark:border-zinc-800 p-2">
                  <p className="font-mono text-[7px] uppercase tracking-widest text-[#8a8172] dark:text-zinc-500 mb-1">Your common openings</p>
                  <div className="flex flex-wrap gap-1">
                    {twin.style.topPhrases.map((p) => (
                      <span key={p} className="px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-950/50 text-[8px] font-bold text-amber-800 dark:text-amber-300">“{p}”</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-[#fcfaf4] dark:bg-zinc-900 p-4">
          <p className="font-mono text-[9px] uppercase tracking-widest text-[#8a8172] dark:text-zinc-500 mb-2">Test your twin</p>
          <input
            value={incoming}
            onChange={(e) => setIncoming(e.target.value)}
            placeholder="Message someone might send you…"
            className="w-full px-3 py-2.5 rounded-xl border border-[#ebdcca] dark:border-zinc-700 bg-white dark:bg-zinc-950 text-[12px] text-[#3a342a] dark:text-zinc-100 focus:outline-none focus:border-amber-500 mb-2"
          />
          <button onClick={askTwin} disabled={busy || !twin} className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-800 dark:bg-amber-400 text-white dark:text-zinc-950 font-bold text-[11px] hover:brightness-110 transition-all disabled:opacity-40">
            <Send size={12} /> Reply as me
          </button>
          {reply && (
            <div className="mt-3 rounded-xl border border-[#ebdcca] dark:border-zinc-800 bg-white dark:bg-zinc-950 p-3">
              <p className="text-[10px] font-bold text-[#3a342a] dark:text-zinc-100">“{reply}”</p>
              <p className="font-mono text-[8px] uppercase tracking-widest text-[#8a8172] dark:text-zinc-500 mt-1">
                {mode === 'llm' ? 'LLM phrased · style-clamped' : 'Style engine'} · replies automatically when you're offline
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
