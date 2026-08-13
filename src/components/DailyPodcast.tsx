import { useEffect, useState } from 'react';
import { X, Podcast, Play, Square, RefreshCw, History, Volume2 } from 'lucide-react';

/**
 * Ocean — Personal Daily Podcast (Feature 147)
 * Top 5 from your network + trending, read as a script. Playback uses the
 * browser's speechSynthesis — fully local, no audio uploads.
 */
interface DailyPodcastProps {
  token: string | null;
  currentUser: { id: string; name: string } | null;
  onClose: () => void;
}

interface PodcastLine {
  speaker: 'host' | 'outro';
  text: string;
}

interface PodcastItem {
  postId: string;
  type: string;
  title: string;
  by: string;
  reason: string;
}

interface DailyPodcast {
  id: string;
  date: string;
  title: string;
  script: PodcastLine[];
  items: PodcastItem[];
  createdAt: number;
}

export default function DailyPodcast({ token, currentUser, onClose }: DailyPodcastProps) {
  const [podcast, setPodcast] = useState<DailyPodcast | null>(null);
  const [history, setHistory] = useState<DailyPodcast[]>([]);
  const [playing, setPlaying] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const headers = token ? { Authorization: `Bearer ${token}` } : {};

  const load = async () => {
    if (!token) return;
    setBusy(true);
    setError('');
    try {
      const [t, h] = await Promise.all([
        fetch('/api/podcast/today', { headers }),
        fetch('/api/podcast/history', { headers }),
      ]);
      const td = await t.json();
      const hd = await h.json();
      if (!t.ok) throw new Error(td.error || 'Failed');
      setPodcast(td.podcast);
      setHistory(hd.podcasts || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const regenerate = async () => {
    if (!token) return;
    setBusy(true);
    try {
      const r = await fetch('/api/podcast/generate', { method: 'POST', headers });
      const d = await r.json();
      setPodcast(d.podcast);
    } catch (e: any) {
      setError(e.message || 'Failed');
    } finally {
      setBusy(false);
    }
  };

  const stopSpeech = () => {
    window.speechSynthesis?.cancel();
    setPlaying(false);
  };

  const playSpeech = () => {
    if (!podcast || !('speechSynthesis' in window)) return;
    stopSpeech();
    const full = podcast.script.map((l) => l.text).join(' ');
    const u = new SpeechSynthesisUtterance(full);
    u.rate = 1.02;
    u.pitch = 1;
    u.onend = () => setPlaying(false);
    u.onerror = () => setPlaying(false);
    window.speechSynthesis.speak(u);
    setPlaying(true);
  };

  return (
    <div className="fixed inset-0 z-[115] bg-[#f6f1e7]/97 dark:bg-zinc-950/97 backdrop-blur-sm overflow-y-auto py-6 px-4">
      <div className="max-w-xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Podcast size={18} className="text-amber-800 dark:text-amber-400" />
            <h2 className="font-display font-bold text-lg text-[#3a342a] dark:text-zinc-100 tracking-tight">Daily Podcast</h2>
            <span className="font-mono text-[9px] uppercase tracking-widest text-[#8a8172] dark:text-zinc-400">Feature 147</span>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-white/80 dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 flex items-center justify-center text-[#5c5446] dark:text-zinc-300 hover:bg-[#ebdcca]/50 transition-all" aria-label="Close">
            <X size={16} />
          </button>
        </div>

        {error && <p className="text-[10px] text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-xl p-2.5 mb-3">{error}</p>}
        {!currentUser && <p className="text-[11px] text-[#8a8172] dark:text-zinc-400 rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-[#fcfaf4] dark:bg-zinc-900 p-4 mb-3">Log in to get your personal daily digest.</p>}

        {podcast && (
          <div className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-[#fcfaf4] dark:bg-zinc-900 p-4 mb-3">
            <div className="flex items-center gap-2 mb-2">
              <Volume2 size={14} className="text-amber-700 dark:text-amber-400" />
              <p className="font-bold text-[12px] text-[#3a342a] dark:text-zinc-100">{podcast.title}</p>
              <div className="ml-auto flex gap-1.5">
                {playing ? (
                  <button onClick={stopSpeech} className="flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-rose-600 text-white text-[10px] font-bold hover:brightness-110 transition-all"><Square size={10} /> Stop</button>
                ) : (
                  <button onClick={playSpeech} className="flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-amber-800 dark:bg-amber-400 text-white dark:text-zinc-950 text-[10px] font-bold hover:brightness-110 transition-all"><Play size={10} /> Listen</button>
                )}
                <button onClick={regenerate} disabled={busy} className="flex items-center gap-1 px-2.5 py-1.5 rounded-full border border-[#ebdcca] dark:border-zinc-700 text-[#5c5446] dark:text-zinc-300 text-[10px] font-bold hover:border-amber-400 transition-all"><RefreshCw size={10} className={busy ? 'animate-spin' : ''} /> Rebuild</button>
              </div>
            </div>
            <p className="text-[9px] text-[#8a8172] dark:text-zinc-500 mb-3">Playback via browser speech synthesis — nothing is uploaded.</p>

            <div className="rounded-xl border border-[#ebdcca] dark:border-zinc-800 bg-white dark:bg-zinc-950 p-3 mb-3 max-h-44 overflow-y-auto">
              {podcast.script.map((l, i) => (
                <p key={i} className={`text-[11px] leading-relaxed mb-1.5 ${l.speaker === 'outro' ? 'text-[#8a8172] dark:text-zinc-500 italic' : 'text-[#3a342a] dark:text-zinc-100'}`}>
                  {l.text}
                </p>
              ))}
            </div>

            <p className="font-mono text-[8px] uppercase tracking-widest text-[#8a8172] dark:text-zinc-500 mb-1.5">In this episode</p>
            <div className="space-y-1.5">
              {podcast.items.map((it, i) => (
                <div key={it.postId} className="flex items-start gap-2 rounded-xl border border-[#ebdcca] dark:border-zinc-800 p-2.5">
                  <span className="font-mono text-[10px] font-black text-amber-700 dark:text-amber-400 w-4 mt-0.5">{i + 1}</span>
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold text-[#3a342a] dark:text-zinc-100 truncate">“{it.title}”</p>
                    <p className="text-[9px] text-[#8a8172] dark:text-zinc-500">
                      {it.type} by {it.by} · {it.reason}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {history.length > 0 && (
          <div className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-[#fcfaf4] dark:bg-zinc-900 p-4">
            <p className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-widest text-[#8a8172] dark:text-zinc-500 mb-2">
              <History size={12} className="text-amber-600" /> Past episodes
            </p>
            <div className="space-y-1">
              {history.map((h) => (
                <button key={h.id} onClick={() => setPodcast(h)} className="w-full text-left rounded-xl border border-[#ebdcca] dark:border-zinc-800 p-2.5 hover:border-amber-400 transition-all">
                  <p className="text-[11px] font-bold text-[#3a342a] dark:text-zinc-100">{h.title}</p>
                  <p className="text-[9px] text-[#8a8172] dark:text-zinc-500">{h.items.length} stories · {new Date(h.createdAt).toLocaleString()}</p>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
