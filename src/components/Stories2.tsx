import { useCallback, useEffect, useRef, useState } from 'react';
import type * as React from 'react';
import { Sparkles, Plus, MessageCircle } from 'lucide-react';
import FeatureShell, { toast, authHeaders } from './FeatureShell';
import StoriesBar, { type Story as BarStory } from './StoriesBar';

interface Props {
  token: string | null;
  currentUser: { id: string; name: string } | null;
  onClose: () => void;
}

interface StoryPoll { question: string; options: string[]; votes: number[]; votedBy: string[] }
interface StoryQA { text: string; answers: { id: string; text: string; by: string; byName?: string; at: number }[] }

export interface Story extends BarStory {}

async function api<T>(path: string, token: string | null, body?: unknown, method?: string): Promise<T> {
  const res = await fetch(path, {
    method: method || (body ? 'POST' : 'GET'),
    headers: authHeaders(token),
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(((await res.json().catch(() => ({}))).error) || 'Request failed');
  return res.json() as Promise<T>;
}

async function uploadFile(token: string | null, file: Blob): Promise<string> {
  const fd = new FormData();
  fd.append('file', file, `story-${Date.now()}.${file.type.includes('video') ? 'mp4' : 'jpg'}`);
  const res = await fetch('/api/upload', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd });
  const data = await res.json();
  if (!res.ok || !data.url) throw new Error(data.error || 'Upload failed');
  return data.url;
}

// ─── Composer: camera capture + story options ─────────────────────────────────
function Composer({ token, onDone }: { token: string | null; onDone: (s: Story) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [captured, setCaptured] = useState<string | null>(null);
  const [camOn, setCamOn] = useState(false);
  const [recording, setRecording] = useState(false);
  const [caption, setCaption] = useState('');
  const [closeFriends, setCloseFriends] = useState(false);
  const [musicId, setMusicId] = useState('');
  const [pollQ, setPollQ] = useState('');
  const [pollOpts, setPollOpts] = useState('Chicken biryani\nFried rice');
  const [question, setQuestion] = useState('');
  const [saving, setSaving] = useState(false);
  const [music, setMusic] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    api<{ music: { id: string; name: string }[] }>('/api/stories/music', token).then((d) => setMusic(d.music)).catch(() => {});
    return () => { streamRef.current?.getTracks().forEach((t) => t.stop()); };
  }, [token]);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: 720 }, audio: false });
      streamRef.current = stream;
      setCamOn(true);
      setTimeout(() => { if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play().catch(() => {}); } }, 50);
    } catch { toast('⛔ Camera permission denied — use the file picker instead.'); }
  };

  const stopCamera = () => { streamRef.current?.getTracks().forEach((t) => t.stop()); streamRef.current = null; setCamOn(false); };

  const capturePhoto = () => {
    const v = videoRef.current;
    if (!v) return;
    const c = document.createElement('canvas');
    c.width = v.videoWidth || 720; c.height = v.videoHeight || 1280;
    c.getContext('2d')!.drawImage(v, 0, 0);
    setCaptured(c.toDataURL('image/jpeg', 0.9));
    stopCamera();
  };

  const recordVideo = () => {
    const v = videoRef.current;
    if (!v || recording || !streamRef.current) return;
    const rec = new MediaRecorder(streamRef.current);
    const chunks: BlobPart[] = [];
    rec.ondataavailable = (e) => chunks.push(e.data);
    rec.onstop = () => {
      setCaptured(URL.createObjectURL(new Blob(chunks, { type: 'video/webm' })));
      stopCamera();
    };
    rec.start(); setRecording(true);
    setTimeout(() => { try { rec.stop(); } catch { /* noop */ } setRecording(false); }, 5000);
  };

  const publish = async (mediaUrl: string, kind: 'image' | 'video') => {
    setSaving(true);
    try {
      const story = await api<{ story: Story }>('/api/stories', token, {
        mediaUrl, kind, caption, closeFriends,
        musicId: musicId || undefined,
        poll: pollQ.trim() && pollOpts.split('\n').filter(Boolean).length >= 2
          ? { question: pollQ.trim(), options: pollOpts.split('\n').filter(Boolean) } : undefined,
        question: question.trim() ? { text: question.trim() } : undefined,
      });
      toast('✅ Story posted — visible for 24 hours');
      onDone(story.story);
    } catch (e: any) { toast(`⛔ ${e.message}`); }
    setSaving(false);
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const kind: 'image' | 'video' = f.type.startsWith('video') ? 'video' : 'image';
    const url = await uploadFile(token, f);
    publish(url, kind);
  };

  const publishCaptured = async () => {
    if (!captured) return;
    const isVideo = captured.startsWith('blob:');
    // Always upload the raw bytes first: the backend only accepts /uploads/ URLs,
    // so a data-URL photo must be pushed through /api/upload before publishing.
    const blob = await fetch(captured).then((r) => r.blob());
    const url = await uploadFile(token, blob);
    publish(url, isVideo ? 'video' : 'image');
  };

  return (
    <div className="bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-2xl p-3 mb-3">
      <p className="font-mono text-[9px] font-bold uppercase tracking-wider text-[#8a8172] mb-2">New story</p>

      {captured ? (
        <div className="relative rounded-xl overflow-hidden aspect-[9/14] max-h-72 mx-auto bg-black">
          {captured.startsWith('blob:') ? <video src={captured} className="w-full h-full object-cover" autoPlay muted loop /> : <img src={captured} className="w-full h-full object-cover" alt="capture" />}
          <button onClick={() => setCaptured(null)} className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 text-white flex items-center justify-center">✕</button>
        </div>
      ) : camOn ? (
        <div className="relative rounded-xl overflow-hidden aspect-[9/14] max-h-72 mx-auto bg-black">
          <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
          {recording && <span className="absolute top-2 left-2 flex items-center gap-1 text-red-400 text-[10px] font-bold"><span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" /> REC</span>}
          <div className="absolute bottom-3 inset-x-0 flex items-center justify-center gap-3">
            <button onClick={capturePhoto} className="w-11 h-11 rounded-full border-4 border-white/80 bg-black/40 flex items-center justify-center text-white">📷</button>
            <button onClick={recordVideo} className={`w-12 h-12 rounded-full border-4 border-white/80 flex items-center justify-center ${recording ? 'bg-red-500' : 'bg-black/40'}`}>
              <span className={`w-4 h-4 rounded ${recording ? 'bg-white' : 'bg-red-500'}`} />
            </button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <button onClick={startCamera} className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-fuchsia-600 hover:bg-fuchsia-500 text-white text-[11px] font-bold uppercase tracking-wider py-2.5 transition-all">
            📷 Camera (getUserMedia)
          </button>
          <label className="flex-1 flex items-center justify-center gap-1.5 rounded-xl border border-[#ebdcca] dark:border-zinc-700 text-[11px] font-bold uppercase tracking-wider py-2.5 cursor-pointer hover:border-fuchsia-400 transition-all">
            <Plus size={13} /> Pick file
            <input type="file" accept="image/*,video/*" className="hidden" onChange={onFile} />
          </label>
        </div>
      )}

      <input value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Add a caption…" className="mt-2 w-full rounded-xl border border-[#ebdcca] dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-[12px] outline-none focus:border-fuchsia-400" />

      <div className="mt-2 grid grid-cols-2 gap-2">
        <button onClick={() => setCloseFriends(!closeFriends)}
          className={`flex items-center gap-1.5 rounded-xl border px-2.5 py-2 text-[10px] font-bold transition-all ${closeFriends ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300' : 'border-[#ebdcca] dark:border-zinc-700 text-[#8a8172]'}`}>
          ⭐ Close friends only
        </button>
        <select value={musicId} onChange={(e) => setMusicId(e.target.value)} className="rounded-xl border border-[#ebdcca] dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2.5 py-2 text-[10px] outline-none">
          <option value="">🎵 No music</option>
          {music.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      </div>

      <details className="mt-2 rounded-xl border border-[#ebdcca] dark:border-zinc-700 px-3 py-2">
        <summary className="text-[10px] font-bold text-[#8a8172] cursor-pointer">📊 Add a poll</summary>
        <input value={pollQ} onChange={(e) => setPollQ(e.target.value)} placeholder="Poll question…" className="mt-2 w-full rounded-lg border border-[#ebdcca] dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2.5 py-1.5 text-[11px] outline-none" />
        <textarea value={pollOpts} onChange={(e) => setPollOpts(e.target.value)} placeholder="One option per line (min 2)" rows={2} className="mt-1.5 w-full rounded-lg border border-[#ebdcca] dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2.5 py-1.5 text-[11px] outline-none resize-none" />
      </details>
      <details className="mt-2 rounded-xl border border-[#ebdcca] dark:border-zinc-700 px-3 py-2">
        <summary className="text-[10px] font-bold text-[#8a8172] cursor-pointer">❓ Ask a question</summary>
        <input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Question for viewers…" className="mt-2 w-full rounded-lg border border-[#ebdcca] dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2.5 py-1.5 text-[11px] outline-none" />
      </details>

      {captured && (
        <button onClick={publishCaptured} disabled={saving} className="mt-3 w-full rounded-xl bg-fuchsia-600 hover:bg-fuchsia-500 text-white text-[11px] font-bold uppercase tracking-wider py-2.5 transition-all disabled:opacity-40">
          {saving ? 'Posting…' : 'Publish story'}
        </button>
      )}
    </div>
  );
}

// ─── Main: StoriesBar + hub shell ─────────────────────────────────────────────
export default function Stories2({ token, currentUser, onClose }: Props) {
  const [stories, setStories] = useState<Story[]>([]);
  const [composing, setComposing] = useState(false);
  const [expired, setExpired] = useState(0);

  const load = useCallback(async () => {
    try {
      const d = await api<{ stories: Story[] }>('/api/stories', token);
      setStories(d.stories);
      setExpired(Math.max(0, d.stories.filter((s) => Date.now() > s.expiresAt).length));
    } catch { /* offline */ }
  }, [token]);

  useEffect(() => { load(); const iv = setInterval(load, 20000); return () => clearInterval(iv); }, [load]);

  return (
    <FeatureShell title="Ocean Stories 2.0" badge="249 · 24h" icon={<Sparkles size={18} className="text-fuchsia-700 dark:text-fuchsia-400" />} onClose={onClose}>
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-[11px] font-bold text-[#3a342a] dark:text-zinc-100">Stories bar</p>
          <p className="text-[9px] text-[#8a8172]">24h ephemeral photos & clips from friends. Camera capture, polls, Q&A, music.</p>
        </div>
        <button onClick={() => setComposing(!composing)}
          className="px-3 py-1.5 rounded-lg bg-fuchsia-600 hover:bg-fuchsia-500 text-white text-[10px] font-bold uppercase tracking-wider transition-all">
          <Plus size={11} className="inline mr-1" />New story
        </button>
      </div>

      {composing && <Composer token={token} onDone={() => { setComposing(false); load(); }} />}

      <StoriesBar stories={stories} currentUser={currentUser} token={token} onCompose={() => setComposing(true)} />

      {expired > 0 && <p className="text-[8px] text-[#8a8172] mt-2">{expired} expired story(ies) auto-cleaned.</p>}
      <p className="text-[8px] text-[#8a8172] mt-3 flex items-center gap-1"><MessageCircle size={9} /> Viewers are only visible to you. Reactions are anonymous-ish (shown per-user to the author).</p>
    </FeatureShell>
  );
}
