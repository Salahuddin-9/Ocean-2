import { useState } from 'react';
import { Mic, Wand2, Sparkles } from 'lucide-react';
import FeatureShell, { toast, authHeaders } from './FeatureShell';

interface Props {
  token: string | null;
  currentUser: { id: string; name: string } | null;
  onClose: () => void;
}

const SAMPLES = [
  { label: 'Meeting notes', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3' },
];

export default function VoiceSummary({ token, currentUser, onClose }: Props) {
  const [audioUrl, setAudioUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    transcript: string;
    summary: string;
    keyPoints: string[];
    source: 'gemini' | 'extractive';
    cached: boolean;
  } | null>(null);

  const summarize = async (url?: string) => {
    const target = (url ?? audioUrl).trim();
    if (!target) { toast('⛔ Paste a voice note audio URL first'); return; }
    setLoading(true);
    try {
      // Try the cache first — no payload needed.
      const cachedRes = await fetch(`/api/ai/voice-summary?audioUrl=${encodeURIComponent(target)}`, { headers: authHeaders(token) });
      if (cachedRes.ok) {
        const data = await cachedRes.json();
        setResult({ ...data, cached: true });
        toast('🗒 Cached summary loaded');
        setLoading(false);
        return;
      }
      const res = await fetch('/api/ai/voice-summary', {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({ audioUrl: target }),
      });
      const data = await res.json();
      if (res.ok) {
        setResult(data);
        toast(data.source === 'gemini' ? '✨ Gemini summary ready' : '🧩 Summary generated (extractive fallback)');
      } else {
        toast(`⛔ ${data.error || 'Could not summarize audio'}`);
      }
    } catch {
      toast('⛔ Network error');
    }
    setLoading(false);
  };

  return (
    <FeatureShell title="Voice Note Summarizer" badge="5" icon={<Mic size={18} className="text-violet-700 dark:text-violet-400" />} onClose={onClose}>
      <div className="bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-2xl p-4 mb-4">
        <span className="font-mono text-[9px] font-bold text-[#8a8172] uppercase tracking-wider">Transcribe + summarize</span>
        <div className="flex gap-2 mt-2">
          <input value={audioUrl} onChange={(e) => setAudioUrl(e.target.value)} placeholder="Paste a voice note / audio URL…"
            className="flex-1 bg-white dark:bg-zinc-800 border border-[#cfcac0] dark:border-zinc-700 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-violet-500" />
          <button onClick={() => summarize()} disabled={loading}
            className="flex items-center gap-1.5 px-4 rounded-lg bg-violet-800 hover:bg-violet-700 text-white text-[10px] font-bold uppercase tracking-wider transition-all disabled:opacity-40">
            <Wand2 size={12} /> {loading ? 'Working…' : 'Summarize'}
          </button>
        </div>
        <div className="flex gap-2 mt-2">
          {SAMPLES.map((s) => (
            <button key={s.label} onClick={() => { setAudioUrl(s.url); summarize(s.url); }} disabled={loading}
              className="text-[9px] font-bold text-violet-700 dark:text-violet-400 border border-violet-200 dark:border-violet-800 rounded-full px-2.5 py-1 hover:bg-violet-50 dark:hover:bg-violet-900/30 transition-all disabled:opacity-40">
              Try: {s.label}
            </button>
          ))}
        </div>
      </div>

      {result && (
        <div className="space-y-3">
          <div className="bg-gradient-to-br from-violet-800 to-violet-950 rounded-2xl p-4 text-[#f4f1ea]">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[9px] uppercase tracking-widest text-violet-200/70 flex items-center gap-1"><Sparkles size={11} /> Summary</span>
              <span className="font-mono text-[8px] text-violet-200/70">{result.source === 'gemini' ? 'Gemini' : 'Extractive'} {result.cached && '· cached'}</span>
            </div>
            <p className="text-[12px] leading-relaxed mt-2">{result.summary}</p>
            {result.keyPoints.length > 0 && (
              <div className="mt-3 space-y-1">
                {result.keyPoints.map((k, i) => (
                  <p key={i} className="text-[10px] text-violet-100/90">• {k}</p>
                ))}
              </div>
            )}
          </div>
          <div className="bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-2xl p-4">
            <span className="font-mono text-[9px] font-bold text-[#8a8172] uppercase tracking-wider">Full transcript</span>
            <p className="text-[11px] text-[#3a342a] dark:text-zinc-200 leading-relaxed mt-2 whitespace-pre-wrap max-h-64 overflow-y-auto">{result.transcript}</p>
          </div>
        </div>
      )}
    </FeatureShell>
  );
}
