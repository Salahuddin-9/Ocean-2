import React, { useRef, useState, useEffect } from 'react';
import { Play, Pause, Volume2, VolumeX, Sparkles, X } from 'lucide-react';

interface VoiceSummaryData {
  transcript: string;
  summary: string;
  keyPoints: string[];
  source: 'gemini' | 'extractive';
}

interface VoiceNotePlaybackProps {
  audioUrl: string;
  postId?: string;
  theme?: 'light' | 'dark';
}

export default function VoiceNotePlayback({ audioUrl, postId = 'default', theme = 'light' }: VoiceNotePlaybackProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  // Feature 5 — Voice Note Summarizer: transcript + summary cached per post.
  const [summary, setSummary] = useState<VoiceSummaryData | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);

  useEffect(() => {
    try {
      const cached = localStorage.getItem(`voice_summary_${postId}`);
      if (cached) setSummary(JSON.parse(cached));
    } catch { /* ignore */ }
  }, [postId]);

  const summarize = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (summaryLoading) return;
    setSummaryLoading(true);
    const token = localStorage.getItem('secure_auth_token');
    try {
      const cachedRes = await fetch(`/api/ai/voice-summary?audioUrl=${encodeURIComponent(audioUrl)}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      if (cachedRes.ok) {
        const data = await cachedRes.json();
        setSummary(data);
        localStorage.setItem(`voice_summary_${postId}`, JSON.stringify(data));
      } else {
        const res = await fetch('/api/ai/voice-summary', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify({ audioUrl })
        });
        const data = await res.json();
        if (res.ok) {
          setSummary(data);
          localStorage.setItem(`voice_summary_${postId}`, JSON.stringify(data));
        } else {
          window.dispatchEvent(new CustomEvent('show-toast', { detail: { message: `⛔ ${data.error || 'Could not summarize this voice note'}` } }));
        }
      }
    } catch {
      window.dispatchEvent(new CustomEvent('show-toast', { detail: { message: '⛔ Summarize failed — are you online?' } }));
    }
    setSummaryLoading(false);
  };

  // Generate a deterministic elegant waveform shape based on postId or audioUrl string
  const barCount = 36;
  const waveformHeights = React.useMemo(() => {
    const seed = postId + audioUrl;
    const heights: number[] = [];
    for (let i = 0; i < barCount; i++) {
      // Deterministic pseudo-random height between 10% and 100%
      let charCodeSum = 0;
      for (let j = 0; j < seed.length; j++) {
        charCodeSum += seed.charCodeAt((j + i) % seed.length);
      }
      const val = ((charCodeSum * (i + 7)) % 80) + 20; // 20% to 100%
      heights.push(val);
    }
    // smooth out heights to look more like a real natural waveform envelope
    const smoothed: number[] = [];
    for (let i = 0; i < barCount; i++) {
      const prev = heights[i - 1] || heights[i] || 30;
      const curr = heights[i];
      const next = heights[i + 1] || heights[i] || 30;
      smoothed.push(Math.round((prev + curr * 2 + next) / 4));
    }
    return smoothed;
  }, [postId, audioUrl]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };
    const onLoadedMetadata = () => {
      setDuration(audio.duration || 0);
    };
    const onEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('ended', onEnded);

    // Initial load check if duration is already available
    if (audio.duration) {
      setDuration(audio.duration);
    }

    return () => {
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('ended', onEnded);
    };
  }, [audioUrl]);

  const togglePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      // Pause all other audios on the page to behave nicely
      const allAudios = document.querySelectorAll('audio');
      allAudios.forEach(aud => {
        if (aud !== audioRef.current) {
          aud.pause();
        }
      });
      audioRef.current.play().catch(err => console.warn("Playback error:", err));
    }
  };

  const handleSeek = (index: number) => {
    if (!audioRef.current || duration === 0) return;
    const clickRatio = index / barCount;
    audioRef.current.currentTime = clickRatio * duration;
    setCurrentTime(clickRatio * duration);
  };

  const toggleMute = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!audioRef.current) return;
    audioRef.current.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  const formatTime = (secs: number) => {
    if (isNaN(secs)) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const isDark = theme === 'dark';

  return (
    <>
    <div className={`w-full flex items-center gap-3 p-3.5 rounded-xl border ${
      isDark 
        ? 'bg-[#1a1610] border-white/10 text-white' 
        : 'bg-[#fdfbf7] border-[#ebdcca]/50 text-[#3a342a]'
    } shadow-sm transition-all relative overflow-hidden select-none`}>
      <audio ref={audioRef} src={audioUrl || null} preload="metadata" />
      
      {/* Decorative pulse glow when playing */}
      {isPlaying && (
        <div className={`absolute inset-0 pointer-events-none opacity-30 animate-pulse duration-[3000ms] ${
          isDark ? 'bg-amber-500/5' : 'bg-amber-700/5'
        }`} />
      )}

      {/* Circle Play/Pause Button */}
      <button
        onClick={togglePlay}
        className={`w-9 h-9 rounded-full flex items-center justify-center transition-all duration-300 ${
          isPlaying 
            ? 'bg-amber-700 text-white shadow-md scale-105 hover:bg-amber-800' 
            : 'bg-[#ebdcca]/30 text-amber-800 hover:bg-[#ebdcca]/50 active:scale-95'
        }`}
        title={isPlaying ? "Pause" : "Play voice note"}
      >
        {isPlaying ? (
          <Pause size={15} fill="currentColor" strokeWidth={1} />
        ) : (
          <Play size={15} className="ml-0.5" fill="currentColor" strokeWidth={1} />
        )}
      </button>

      {/* Waveform Visualization & Seek Control */}
      <div className="flex-1 flex flex-col justify-center min-w-0">
        <div className="h-8 flex items-center gap-[3px] px-1 cursor-pointer">
          {waveformHeights.map((pct, idx) => {
            const barProgress = idx / barCount;
            const currentProgress = duration > 0 ? currentTime / duration : 0;
            const isPlayed = barProgress <= currentProgress;
            
            // Highlight color based on playback position
            let barColor = isDark 
              ? 'bg-white/15' 
              : 'bg-[#ebdcca]/70';

            if (isPlayed) {
              barColor = 'bg-amber-700';
            } else if (isPlaying && Math.abs(barProgress - currentProgress) < 0.08) {
              barColor = 'bg-amber-600/60';
            }

            // Waveform animation height adjustment when audio is actively playing
            const activeHeightMultiplier = isPlaying ? 1 + Math.sin(Date.now() / 150 + idx * 0.4) * 0.15 : 1;
            const computedHeight = Math.max(8, Math.round(pct * activeHeightMultiplier * 0.35));

            return (
              <div
                key={idx}
                onClick={(e) => {
                  e.stopPropagation();
                  handleSeek(idx);
                }}
                className={`flex-1 rounded-full ${barColor} transition-colors duration-150 relative group`}
                style={{ height: `${computedHeight}px` }}
                title={`Seek to ${Math.round(barProgress * 100)}%`}
              >
                {/* Micro tooltip indicator */}
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 bg-black text-white text-[7px] px-1 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 whitespace-nowrap">
                  {formatTime(barProgress * (duration || 0))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Timestamps Row */}
        <div className="flex items-center justify-between px-1 mt-1 font-mono text-[8px] uppercase tracking-wider text-[#8a8172]">
          <span>{formatTime(currentTime)}</span>
          <span className="flex items-center gap-1">
            {duration > 0 ? formatTime(duration) : 'Voice note'}
          </span>
        </div>
      </div>

      {/* Mini Volume Mute Control */}
      <button
        onClick={toggleMute}
        className="p-1.5 rounded-full hover:bg-black/5 text-[#8a8172] hover:text-[#3a342a] transition-colors"
        title={isMuted ? "Unmute" : "Mute"}
      >
        {isMuted ? (
          <VolumeX size={12} className="text-red-600/80" />
        ) : (
          <Volume2 size={12} />
        )}
      </button>
      </div>

      {/* Feature 5 — Summarize button + AI summary under the player */}
      <div className={`mt-1.5 ${isDark ? 'text-zinc-200' : 'text-[#3a342a]'}`}>
        {!summary ? (
          <button
            onClick={summarize}
            disabled={summaryLoading}
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[9px] font-bold uppercase tracking-wider transition-all disabled:opacity-50 ${isDark ? 'bg-violet-600 hover:bg-violet-500 text-white' : 'bg-violet-700 hover:bg-violet-600 text-white'}`}
          >
            <Sparkles size={11} /> {summaryLoading ? 'Summarizing…' : 'Summarize voice note'}
          </button>
        ) : (
          <div className={`rounded-xl border p-2.5 ${isDark ? 'bg-violet-950/40 border-violet-500/30' : 'bg-violet-50 border-violet-200'}`}>
            <div className="flex items-center justify-between">
              <span className={`font-mono text-[8px] uppercase tracking-widest ${isDark ? 'text-violet-300' : 'text-violet-700'}`}>
                ✨ AI summary · {summary.source === 'gemini' ? 'Gemini' : 'extractive'}
              </span>
              <button onClick={(e) => { e.stopPropagation(); setSummary(null); localStorage.removeItem(`voice_summary_${postId}`); }} className="opacity-60 hover:opacity-100">
                <X size={11} />
              </button>
            </div>
            <p className="text-[11px] leading-relaxed mt-1">{summary.summary}</p>
            {summary.keyPoints.length > 0 && (
              <div className="mt-1 space-y-0.5">
                {summary.keyPoints.map((k, i) => (
                  <p key={i} className={`text-[9px] ${isDark ? 'text-zinc-400' : 'text-[#8a8172]'}`}>• {k}</p>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
