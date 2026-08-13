import { useEffect, useRef, useState } from 'react';
import { X, Mic, MicOff, ClipboardCopy, ListChecks, Square } from 'lucide-react';

/**
 * Ocean — Local/Client-Side Audio Transcriber & Summarizer (Feature 146)
 * ----------------------------------------------------------------------
 * Fully in-browser: Web Speech API transcribes speech to text (no backend,
 * no upload), and an extractive summarizer picks the highest-value sentences.
 */
interface LocalTranscriberProps {
  token: string | null;
  currentUser: { id: string; name: string } | null;
  onClose: () => void;
}

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'of', 'to', 'in', 'on', 'for', 'with', 'at', 'by',
  'from', 'is', 'are', 'was', 'were', 'this', 'that', 'it', 'be', 'as', 'i', 'you', 'he',
  'she', 'we', 'they', 'me', 'him', 'her', 'us', 'them', 'my', 'your', 'his', 'their',
  'our', 'its', 'not', 'no', 'so', 'if', 'do', 'does', 'did', 'can', 'could', 'will',
  'would', 'should', 'has', 'have', 'had', 'about', 'just', 'very', 'really', 'like',
  'get', 'got', 'go', 'went', 'please', 'ok', 'okay', 'um', 'uh', 'also', 'even', 'still',
]);

/** Extractive summarizer: sentence scoring by keyword frequency. */
function summarize(transcript: string): string[] {
  // Lookahead-only sentence split (lookbehind breaks older Safari).
  const sentences = transcript
    .split(/[.!?](?=\s|$)/)
    .map((s) => s.trim())
    .filter((s) => s.split(/\s+/).length >= 6);
  if (sentences.length === 0) return [];
  const freq = new Map<string, number>();
  transcript.toLowerCase().replace(/[^a-z0-9À-ÿ ]+/g, ' ').split(/\s+/).forEach((w) => {
    if (w.length >= 4 && !STOP_WORDS.has(w)) freq.set(w, (freq.get(w) || 0) + 1);
  });
  const scored = sentences.map((s) => {
    const words = s.toLowerCase().split(/\s+/);
    let score = 0;
    words.forEach((w) => {
      if (freq.has(w)) score += freq.get(w)!;
    });
    return { s, score: score + words.length / 20 };
  });
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((x) => x.s);
}

export default function LocalTranscriber({ currentUser, onClose }: LocalTranscriberProps) {
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interim, setInterim] = useState('');
  const [supported] = useState(() => {
    const w: any = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
    return !!w;
  });
  const recRef = useRef<any>(null);
  const finalRef = useRef('');

  const stop = () => {
    try { recRef.current?.stop(); } catch { /* noop */ }
    setListening(false);
  };

  const start = () => {
    const w: any = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
    if (!w) return;
    finalRef.current = '';
    const rec = new w();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = 'en-US';
    rec.onresult = (e: any) => {
      let interimText = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalRef.current += t + ' ';
        else interimText += t;
      }
      setTranscript(finalRef.current);
      setInterim(interimText);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recRef.current = rec;
    rec.start();
    setListening(true);
  };

  useEffect(() => () => stop(), []);

  const keyPoints = summarize(transcript);
  const wordCount = transcript.trim() ? transcript.trim().split(/\s+/).length : 0;

  const copy = (text: string) => {
    navigator.clipboard?.writeText(text).catch(() => { /* noop */ });
  };

  return (
    <div className="fixed inset-0 z-[115] bg-[#f6f1e7]/97 dark:bg-zinc-950/97 backdrop-blur-sm overflow-y-auto py-6 px-4">
      <div className="max-w-xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Mic size={18} className="text-amber-800 dark:text-amber-400" />
            <h2 className="font-display font-bold text-lg text-[#3a342a] dark:text-zinc-100 tracking-tight">Local Transcriber</h2>
            <span className="font-mono text-[9px] uppercase tracking-widest text-[#8a8172] dark:text-zinc-400">Feature 146</span>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-white/80 dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 flex items-center justify-center text-[#5c5446] dark:text-zinc-300 hover:bg-[#ebdcca]/50 transition-all" aria-label="Close">
            <X size={16} />
          </button>
        </div>

        {!supported ? (
          <div className="rounded-2xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 p-4 text-[11px] text-amber-800 dark:text-amber-300">
            Your browser doesn't expose the Web Speech API (try Chrome/Edge). This feature is fully local — nothing is uploaded.
          </div>
        ) : (
          <>
            <div className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-[#fcfaf4] dark:bg-zinc-900 p-4 mb-3">
              <p className="text-[11px] text-[#5c5446] dark:text-zinc-300 leading-relaxed mb-3">
                Speak — transcription runs <strong>entirely in your browser</strong> via the Web Speech API. No audio ever leaves
                your device, and the summarizer is local too.
              </p>
              <div className="flex gap-2">
                {!listening ? (
                  <button onClick={start} className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-600 to-amber-800 text-white font-bold text-[12px] py-3 hover:brightness-110 transition-all">
                    <Mic size={15} /> Start transcribing
                  </button>
                ) : (
                  <button onClick={stop} className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-rose-600 text-white font-bold text-[12px] py-3 hover:brightness-110 transition-all animate-pulse">
                    <Square size={13} /> Stop
                  </button>
                )}
              </div>
              {listening && <p className="text-center text-[10px] text-rose-500 font-bold mt-2">● Listening…</p>}
            </div>

            <div className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-[#fcfaf4] dark:bg-zinc-900 p-4 mb-3">
              <div className="flex items-center justify-between mb-2">
                <p className="font-mono text-[9px] uppercase tracking-widest text-[#8a8172] dark:text-zinc-500">
                  Transcript {wordCount > 0 && `· ${wordCount} words`}
                </p>
                {transcript && (
                  <button onClick={() => copy(transcript)} className="flex items-center gap-1 text-[10px] font-bold text-amber-700 dark:text-amber-400 hover:underline">
                    <ClipboardCopy size={11} /> Copy
                  </button>
                )}
              </div>
              <div className="min-h-24 rounded-xl border border-[#ebdcca] dark:border-zinc-800 bg-white dark:bg-zinc-950 p-3 text-[12px] text-[#3a342a] dark:text-zinc-100 leading-relaxed">
                {transcript}
                {interim && <span className="text-[#b9a98c] dark:text-zinc-500">{interim}</span>}
                {!transcript && !interim && <span className="text-[#b9a98c] dark:text-zinc-500 italic">Your words will appear here…</span>}
              </div>
            </div>

            {keyPoints.length > 0 && (
              <div className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-[#fcfaf4] dark:bg-zinc-900 p-4">
                <p className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-widest text-[#8a8172] dark:text-zinc-500 mb-2">
                  <ListChecks size={12} className="text-amber-600" /> Key points (local extractive summary)
                </p>
                <ul className="space-y-1.5">
                  {keyPoints.map((k, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-[11px] text-[#5c5446] dark:text-zinc-300">
                      <span className="font-mono text-amber-700 dark:text-amber-400 font-bold">•</span> {k}
                    </li>
                  ))}
                </ul>
                <button onClick={() => copy(keyPoints.join('\n'))} className="mt-2 text-[10px] font-bold text-amber-700 dark:text-amber-400 hover:underline flex items-center gap-1">
                  <ClipboardCopy size={11} /> Copy key points
                </button>
              </div>
            )}

            {!currentUser && (
              <p className="text-[9px] text-[#8a8172] dark:text-zinc-500 mt-2">
                Works without an account — nothing is stored server-side.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
