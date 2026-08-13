import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Upload, Scissors, Gauge, Music, Loader2, Download } from 'lucide-react';

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

interface OceanCutVideoProps {
  open: boolean;
  onClose: () => void;
  onExport: (blob: Blob) => void;
}

/* -------------------------------------------------------------------------- */
/*  Component                                                                 */
/* -------------------------------------------------------------------------- */

export default function OceanCutVideo({ open, onClose, onExport }: OceanCutVideoProps) {
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const videoDurationRef = useRef<number>(0);

  const [startSec, setStartSec] = useState(0);
  const [durationSec, setDurationSec] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [audioFile, setAudioFile] = useState<File | null>(null);

  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [wasmLoading, setWasmLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const videoInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);

  /* ---- Video selection ---- */
  const handleVideoSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setVideoFile(file);
    setAudioFile(null);
    setSpeed(1);
    setStartSec(0);
    setDurationSec(0);
    const url = URL.createObjectURL(file);
    setVideoUrl(url);
  }, []);

  const handleVideoLoaded = useCallback((e: React.SyntheticEvent<HTMLVideoElement>) => {
    const dur = e.currentTarget.duration;
    videoDurationRef.current = isFinite(dur) ? dur : 0;
    setDurationSec(Math.floor(dur) || 10);
  }, []);

  /* ---- Audio selection ---- */
  const handleAudioSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setAudioFile(file);
  }, []);

  /* ---- Export ---- */
  const handleExport = useCallback(async () => {
    if (!videoFile) return;
    setProcessing(true);
    setProgress(0);
    setError(null);

    try {
      const engine = await import('../../lib/editors/ffmpeg/ffmpegEngine');

      let blob: Blob;
      const doTrim = durationSec > 0 && (startSec > 0 || durationSec < videoDurationRef.current - 0.5);
      const doSpeed = speed !== 1;
      const doAudio = !!audioFile;

      // Sequence: trim → speed → audio merge
      if (doTrim) {
        blob = await engine.trimVideo(videoFile, { startSec, durationSec }, (p) => setProgress(p * 0.4));
      } else {
        const data = await (await import('@ffmpeg/util')).fetchFile(videoFile);
        blob = new Blob([data.buffer], { type: 'video/mp4' });
      }

      if (doSpeed) {
        const intermediate = new File([blob], 'intermediate.mp4', { type: 'video/mp4' });
        blob = await engine.changeSpeed(intermediate, speed, (p) => setProgress(0.4 + p * 0.4));
      }

      if (doAudio && blob) {
        const intermediate = new File([blob], 'intermediate.mp4', { type: 'video/mp4' });
        blob = await engine.mergeAudio(intermediate, audioFile!, (p) => setProgress(0.8 + p * 0.2));
      } else {
        setProgress(1);
      }

      onExport(blob);
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Video processing failed.');
    } finally {
      setProcessing(false);
      setProgress(0);
    }
  }, [videoFile, startSec, durationSec, speed, audioFile, onExport, onClose]);

  /* ---- Cleanup ---- */
  useEffect(() => {
    return () => {
      if (videoUrl) URL.revokeObjectURL(videoUrl);
    };
  }, [videoUrl]);

  useEffect(() => {
    if (!open) {
      setVideoFile(null);
      setVideoUrl(null);
      setAudioFile(null);
      setStartSec(0);
      setDurationSec(0);
      setSpeed(1);
      setProcessing(false);
      setProgress(0);
      setError(null);
      setWasmLoading(false);
    }
  }, [open]);

  /* ---- Escape to close ---- */
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  /* ---- Body scroll lock ---- */
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = ''; };
    }
  }, [open]);

  /* ---- Render ---- */
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={(e) => { if (e.target === e.currentTarget && !processing) onClose(); }}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="bg-white/95 rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden flex flex-col max-h-[90vh]"
          >
            {/* Top bar */}
            <div className="flex items-center justify-between p-4 border-b border-[#ebdcca]">
              <h2 className="text-sm font-bold text-[#3a342a] font-mono uppercase tracking-wider flex items-center gap-2">
                <Scissors size={16} /> Ocean Cut Video
              </h2>
              <button
                onClick={onClose}
                disabled={processing}
                className="text-[#8a8172] hover:text-[#3a342a] p-1 rounded-lg hover:bg-[#ebdcca]/20 transition-colors disabled:opacity-40"
              >
                <X size={18} />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* Video pick / preview */}
              {!videoUrl ? (
                <label
                  onClick={() => videoInputRef.current?.click()}
                  className="flex flex-col items-center justify-center h-48 border-2 border-dashed border-[#ebdcca] rounded-2xl cursor-pointer hover:border-[#8a8172] hover:bg-[#f9f7f2]/50 transition-colors"
                >
                  <Upload size={32} className="text-[#8a8172] mb-2" />
                  <span className="text-xs font-mono text-[#8a8172]">Drop video here or click to browse</span>
                  <span className="text-[10px] text-[#b0a797] mt-1">MP4, WebM, MOV — max 200MB</span>
                </label>
              ) : (
                <div className="space-y-3">
                  <video
                    src={videoUrl}
                    controls
                    onLoadedMetadata={handleVideoLoaded}
                    className="w-full rounded-xl max-h-48 object-contain bg-black/10"
                  />
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono text-[#8a8172] truncate max-w-[70%]">
                      {videoFile?.name}
                    </span>
                    <button
                      onClick={() => { setVideoFile(null); setVideoUrl(null); }}
                      className="text-[10px] text-red-600 hover:text-red-800 font-mono"
                      disabled={processing}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              )}

              {/* Controls (only when video selected) */}
              {videoUrl && (
                <div className="space-y-3">
                  <hr className="border-[#ebdcca]" />

                  {/* Trim */}
                  <div>
                    <label className="text-[10px] font-mono font-bold text-[#8a8172] uppercase tracking-wider mb-1.5 flex items-center gap-1">
                      <Scissors size={12} /> Trim
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <span className="text-[9px] text-[#b0a797] block mb-0.5">Start (s)</span>
                        <input
                          type="number"
                          min={0}
                          max={videoDurationRef.current}
                          step={0.1}
                          value={startSec}
                          onChange={(e) => setStartSec(Math.max(0, parseFloat(e.target.value) || 0))}
                          className="w-full border border-[#ebdcca] rounded-xl p-2 text-sm bg-white text-[#3a342a] focus:outline-none focus:ring-2 focus:ring-amber-900/30"
                          disabled={processing}
                        />
                      </div>
                      <div>
                        <span className="text-[9px] text-[#b0a797] block mb-0.5">Duration (s)</span>
                        <input
                          type="number"
                          min={1}
                          max={videoDurationRef.current}
                          step={0.1}
                          value={durationSec}
                          onChange={(e) => setDurationSec(Math.max(1, parseFloat(e.target.value) || 1))}
                          className="w-full border border-[#ebdcca] rounded-xl p-2 text-sm bg-white text-[#3a342a] focus:outline-none focus:ring-2 focus:ring-amber-900/30"
                          disabled={processing}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Speed */}
                  <div>
                    <label className="text-[10px] font-mono font-bold text-[#8a8172] uppercase tracking-wider mb-1.5 flex items-center gap-1">
                      <Gauge size={12} /> Speed
                    </label>
                    <div className="flex gap-1.5">
                      {[0.5, 1, 2].map((s) => (
                        <button
                          key={s}
                          onClick={() => setSpeed(s)}
                          disabled={processing}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${
                            speed === s
                              ? 'bg-amber-900 text-[#fcfaf4] border-amber-900'
                              : 'bg-[#f9f7f2] text-[#3a342a] border-[#ebdcca] hover:bg-[#ebdcca]/40'
                          } disabled:opacity-40`}
                        >
                          {s}×
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Audio merge */}
                  <div>
                    <label className="text-[10px] font-mono font-bold text-[#8a8172] uppercase tracking-wider mb-1.5 flex items-center gap-1">
                      <Music size={12} /> Audio Merge (optional)
                    </label>
                    <button
                      onClick={() => audioInputRef.current?.click()}
                      disabled={processing}
                      className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold bg-[#f9f7f2] text-[#3a342a] border border-[#ebdcca] hover:bg-[#ebdcca]/40 transition-all disabled:opacity-40"
                    >
                      <Music size={14} />
                      {audioFile ? audioFile.name : 'Add audio file'}
                    </button>
                    <input
                      ref={audioInputRef}
                      type="file"
                      accept="audio/*"
                      className="hidden"
                      onChange={handleAudioSelect}
                    />
                  </div>

                  <hr className="border-[#ebdcca]" />
                </div>
              )}

              {/* Progress */}
              {processing && (
                <div className="space-y-1">
                  <div className="w-full h-2 bg-[#ebdcca]/40 rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.round(progress * 100)}%` }}
                      className="h-full bg-amber-900 rounded-full"
                    />
                  </div>
                  <span className="text-[10px] font-mono text-[#8a8172] text-center block">
                    Processing… {Math.round(progress * 100)}%
                  </span>
                </div>
              )}

              {/* Error */}
              {error && (
                <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl p-2 text-center">{error}</p>
              )}
            </div>

            {/* Bottom */}
            <div className="p-4 border-t border-[#ebdcca] flex items-center justify-between">
              <span className="text-[10px] text-[#b0a797] font-mono">
                {videoFile ? `${(videoFile.size / (1024 * 1024)).toFixed(1)} MB` : 'No file selected'}
              </span>
              <button
                onClick={handleExport}
                disabled={!videoFile || processing}
                className="bg-amber-900 text-[#fcfaf4] px-6 py-2 rounded-xl text-sm font-bold hover:bg-amber-800 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 transition-all"
              >
                {processing ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                {processing ? 'Processing…' : 'Export MP4'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
