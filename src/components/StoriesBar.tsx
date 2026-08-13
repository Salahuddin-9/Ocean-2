/**
 * Ocean — Stories 2.0 StoriesBar (#249)
 * --------------------------------------
 * Horizontal stories bar + fullscreen viewer powered by `react-insta-stories`.
 * Wires to the turtleStoriesBackend API (views, reactions, polls, Q&A).
 * If the library can't load (offline), falls back to a built-in viewer.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Camera, Plus, X, Star, Users, Music, MessageCircle, Send } from 'lucide-react';
import { toast, authHeaders } from './FeatureShell';

interface Props {
  token: string | null;
  currentUser: { id: string; name: string } | null;
  stories: Story[];
  onCompose: () => void;
}

export interface Story {
  id: string; userId: string; userName: string; userAvatar?: string;
  mediaUrl: string; kind: 'image' | 'video'; caption?: string; closeFriends: boolean;
  private: boolean; recipientIds: string[];
  music?: { id: string; name: string; url?: string };
  poll?: { question: string; options: string[]; votes: number[]; votedBy: string[] };
  question?: { text: string; answers: { id: string; text: string; by: string; byName?: string; at: number }[] };
  viewers: { userId: string; at: number }[];
  reactions: { userId: string; type: string; at: number }[];
  createdAt: number; expiresAt: number;
  viewed?: boolean; viewersCount?: number; reactionsCount?: number; isMine?: boolean;
}

const REACTIONS = ['❤️', '😂', '😮', '😢', '🔥', '👍', '🎉'];

async function api<T>(path: string, token: string | null, body?: unknown, method?: string): Promise<T> {
  const res = await fetch(path, { method: method || (body ? 'POST' : 'GET'), headers: authHeaders(token), body: body ? JSON.stringify(body) : undefined });
  if (!res.ok) throw new Error(((await res.json().catch(() => ({}))).error) || 'Request failed');
  return res.json() as Promise<T>;
}

/** Group stories per user for the bar. */
export function groupStories(stories: Story[], meId?: string) {
  const groups: { userId: string; userName: string; userAvatar?: string; unseen: number; stories: Story[] }[] = [];
  for (const s of stories) {
    let g = groups.find((x) => x.userId === s.userId);
    if (!g) { g = { userId: s.userId, userName: s.userName, userAvatar: s.userAvatar, unseen: 0, stories: [] }; groups.push(g); }
    g.stories.push(s);
    if (s.userId !== meId && !s.viewed) g.unseen += 1;
  }
  return groups;
}

// ─── Fullscreen viewer (react-insta-stories) ─────────────────────────────────
function InstaViewer({ group, token, onClose }: { group: { userId: string; userName: string; userAvatar?: string; stories: Story[] }; token: string | null; onClose: () => void }) {
  const [Lib, setLib] = useState<any | null>(null); // react-insta-stories default export
  const [libFailed, setLibFailed] = useState(false);
  const [viewersCount, setViewersCount] = useState(group.stories[0]?.viewersCount || 0);
  const [reacted, setReacted] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let live = true;
    import('react-insta-stories')
      .then((m) => { if (live) setLib(m.default); })
      .catch(() => { if (live) setLibFailed(true); });
    return () => { live = false; };
  }, []);

  const markView = useCallback((s: Story) => {
    api(`/api/stories/${s.id}/view`, token, undefined, 'POST').then((d: any) => setViewersCount(d.viewersCount)).catch(() => {});
  }, [token]);

  const react = async (s: Story, type: string) => {
    setReacted((r) => ({ ...r, [type]: true }));
    setTimeout(() => setReacted((r) => ({ ...r, [type]: false })), 1400);
    try { await api<{ reactionsCount: number }>(`/api/stories/${s.id}/react`, token, { type }); } catch { /* offline */ }
  };

  const toInstaStory = (s: Story) => {
    if (s.poll || s.question) {
      return {
        duration: 20000,
        content: (props: any) => (
          <InteractiveStory story={s} token={token} isPaused={props.isPaused} onNext={() => props.action('next')} />
        ),
      };
    }
    return {
      url: s.mediaUrl,
      type: s.kind === 'video' ? 'video' : 'image',
      duration: s.kind === 'image' ? 6000 : undefined,
      header: {
        heading: s.userName,
        subheading: `${new Date(s.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · ${Math.max(1, Math.round((Date.now() - s.createdAt) / 3600000))}h ago`,
        profileImage: s.userAvatar,
      },
    };
  };

  const items = group.stories.map(toInstaStory);

  /* ---- fallback viewer (lib unavailable) ---- */
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    if (!libFailed || group.stories.length === 0) return;
    const s = group.stories[idx];
    markView(s);
    if (s.kind === 'image') {
      const t = setTimeout(() => setIdx((i) => (i + 1 < group.stories.length ? i + 1 : -1)), 6000);
      return () => clearTimeout(t);
    }
  }, [libFailed, idx]);

  if (group.stories.length === 0) return null;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[130] bg-black flex items-center justify-center">
      <div className="relative w-full max-w-md h-full max-h-[92vh] bg-zinc-900 overflow-hidden">
        {libFailed ? (
          /* fallback: simple auto-advancing viewer */
          <div className="absolute inset-0">
            {idx >= 0 && group.stories[idx] && (() => {
              const s = group.stories[idx];
              return s.kind === 'video'
                ? <video key={s.id} src={s.mediaUrl} autoPlay playsInline className="w-full h-full object-contain" onEnded={() => setIdx((i) => (i + 1 < group.stories.length ? i + 1 : -1))} />
                : <img key={s.id} src={s.mediaUrl} className="w-full h-full object-contain" alt="story" />;
            })()}
            <div className="absolute top-4 inset-x-3 flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-fuchsia-400 to-rose-500 flex items-center justify-center text-[10px] font-bold text-white">{group.userName.slice(0, 1).toUpperCase()}</div>
              <p className="text-white text-[11px] font-bold">{group.userName}</p>
              <button onClick={onClose} className="ml-auto w-7 h-7 rounded-full bg-black/40 flex items-center justify-center text-white"><X size={14} /></button>
            </div>
            <div className="absolute bottom-4 inset-x-3 z-20 flex items-center justify-center gap-1.5 bg-black/40 backdrop-blur rounded-full py-1.5 px-3 mx-auto w-fit">
              {REACTIONS.map((r) => (
                <button key={r} onClick={() => idx >= 0 && react(group.stories[idx], r)} className={`text-lg hover:scale-125 transition-transform ${reacted[r] ? 'scale-125' : ''}`}>{r}</button>
              ))}
            </div>
          </div>
        ) : Lib ? (
          <div className="absolute inset-0">
            <Lib
              stories={items}
              defaultInterval={6000}
              width="100%"
              height="100%"
              loop={false}
              keyboardNavigation
              onAllStoriesEnd={onClose}
              onStoryStart={(i: number) => { const s = group.stories[i]; if (s) markView(s); }}
            />
            {/* floating reaction bar overlay */}
            <div className="absolute bottom-4 inset-x-0 z-20 flex items-center justify-center gap-1.5 bg-black/40 backdrop-blur rounded-full py-1.5 px-3 mx-auto w-fit pointer-events-auto">
              {REACTIONS.map((r) => (
                <button key={r} onClick={() => { const s = group.stories[group.stories.length - 1]; if (s) react(s, r); }} className={`text-lg hover:scale-125 transition-transform ${reacted[r] ? 'scale-125' : ''}`} title={r}>{r}</button>
              ))}
            </div>
            {group.stories[0]?.isMine && (
              <button onClick={async () => {
                const d = await api<{ viewers: { userId: string; name: string; at: number }[] }>(`/api/stories/${group.stories[0].id}/viewers`, token).catch(() => ({ viewers: [] }));
                toast(`👀 ${d.viewers.length} viewer(s)`);
              }} className="absolute top-4 right-12 z-20 flex items-center gap-1 px-2 py-1 rounded-lg bg-white/15 text-white text-[9px] font-bold">
                <Users size={10} /> {viewersCount}
              </button>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-zinc-400 text-[11px]">Loading viewer…</div>
        )}
      </div>
    </motion.div>
  );
}

// ─── Interactive story content (poll / Q&A / music / caption) ────────────────
function InteractiveStory({ story, token, isPaused, onNext }: { story: Story; token: string | null; isPaused?: boolean; onNext: () => void }) {
  const [pollVote, setPollVote] = useState<number | null>(null);
  const [answer, setAnswer] = useState('');
  const [cur, setCur] = useState<Story>(story);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => { if (videoRef.current) { if (isPaused) videoRef.current.pause(); else videoRef.current.play().catch(() => {}); } }, [isPaused]);

  const vote = async (i: number) => {
    setPollVote(i);
    try {
      const d = await api<{ poll: Story['poll'] }>(`/api/stories/${story.id}/poll`, token, { vote: i });
      setCur((c) => ({ ...c, poll: d.poll }));
      setTimeout(onNext, 1200);
    } catch (e: any) { toast(`⛔ ${e.message}`); }
  };

  const sendAnswer = async () => {
    if (!answer.trim()) return;
    try {
      const d = await api<{ question: Story['question'] }>(`/api/stories/${story.id}/question`, token, { answer: answer.trim() });
      setCur((c) => ({ ...c, question: d.question }));
      setAnswer('');
      setTimeout(onNext, 1200);
    } catch (e: any) { toast(`⛔ ${e.message}`); }
  };

  return (
    <div className="absolute inset-0 bg-black">
      {story.kind === 'video' && <video ref={videoRef} src={story.mediaUrl} autoPlay muted={false} loop playsInline className="w-full h-full object-contain" />}
      {story.kind === 'image' && <img src={story.mediaUrl} className="w-full h-full object-contain" alt="story" />}
      <div className="absolute top-8 inset-x-3 flex items-center gap-2 z-10">
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-400 to-rose-500 flex items-center justify-center text-[10px] font-bold text-white">{story.userName.slice(0, 1).toUpperCase()}</div>
        <div>
          <p className="text-white text-[11px] font-bold leading-tight flex items-center gap-1">{story.userName}{story.closeFriends && <Star size={10} className="text-emerald-400" />}</p>
          <p className="text-[8px] text-white/60">{Math.max(1, Math.round((Date.now() - story.createdAt) / 3600000))}h ago</p>
        </div>
      </div>

      {story.music && story.music.url && <audio src={story.music.url} autoPlay loop className="hidden" />}
      {story.music && (
        <p className="absolute bottom-20 left-3 z-10 inline-flex items-center gap-1 text-[9px] text-white/80 bg-black/40 rounded-full px-2 py-0.5"><Music size={9} /> {story.music.name}</p>
      )}
      {story.caption && <p className="absolute bottom-14 left-3 right-3 z-10 text-white text-[12px] font-medium drop-shadow">{story.caption}</p>}

      {cur.poll && (
        <div className="absolute bottom-8 inset-x-3 z-10 bg-black/60 backdrop-blur rounded-2xl p-3">
          <p className="text-white text-[12px] font-bold mb-2">{cur.poll.question}</p>
          {cur.poll.options.map((opt, i) => {
            const total = cur.poll!.votes.reduce((a, b) => a + b, 0) || 1;
            const pct = Math.round((cur.poll!.votes[i] / total) * 100);
            return (
              <button key={i} onClick={() => vote(i)} disabled={pollVote !== null}
                className="relative w-full mb-1.5 rounded-xl bg-white/10 px-3 py-2 text-left text-[11px] text-white overflow-hidden disabled:opacity-90">
                {pollVote !== null && <span className="absolute inset-y-0 left-0 bg-emerald-500/40 transition-all" style={{ width: `${pct}%` }} />}
                <span className="relative flex justify-between"><span>{opt}</span>{pollVote !== null && <span className="font-bold">{pct}%</span>}{pollVote === i && <span className="ml-1">✓</span>}</span>
              </button>
            );
          })}
        </div>
      )}

      {cur.question && (
        <div className="absolute bottom-8 inset-x-3 z-10 bg-black/60 backdrop-blur rounded-2xl p-3 max-h-52 overflow-y-auto">
          <p className="text-white text-[12px] font-bold">{cur.question.text}</p>
          <div className="mt-1.5 space-y-1">
            {cur.question.answers.map((a) => <p key={a.id} className="text-[10px] text-white/80"><b>{a.byName || a.by}:</b> {a.text}</p>)}
          </div>
          <div className="mt-2 flex gap-1.5">
            <input value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="Write an answer…" className="flex-1 rounded-lg bg-white/15 px-2.5 py-1.5 text-[11px] text-white outline-none placeholder:text-white/40" />
            <button onClick={sendAnswer} className="px-2.5 rounded-lg bg-amber-500 text-white"><Send size={12} /></button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── The stories bar ──────────────────────────────────────────────────────────
export default function StoriesBar({ stories, currentUser, token, onCompose }: Props) {
  const [openGroup, setOpenGroup] = useState<{ userId: string; userName: string; userAvatar?: string; stories: Story[] } | null>(null);
  const groups = groupStories(stories, currentUser?.id);
  const myGroup = groups.find((g) => g.userId === currentUser?.id);

  const open = (userId: string) => {
    const g = groups.find((x) => x.userId === userId);
    if (g) setOpenGroup(g);
  };

  return (
    <div>
      <AnimatePresence>
        {openGroup && <InstaViewer group={openGroup} token={token} onClose={() => setOpenGroup(null)} />}
      </AnimatePresence>

      <div className="flex gap-2.5 overflow-x-auto pb-3 -mx-1 px-1">
        <button onClick={onCompose} className="flex flex-col items-center gap-1 shrink-0 group">
          <div className="w-16 h-16 rounded-full border-2 border-dashed border-[#8a8172] dark:border-zinc-600 flex items-center justify-center bg-white dark:bg-zinc-800 group-hover:border-fuchsia-500 transition-all">
            {currentUser?.name ? <span className="text-lg font-bold text-fuchsia-600">{currentUser.name.slice(0, 1).toUpperCase()}</span> : <Camera size={20} className="text-[#8a8172]" />}
          </div>
          <span className="text-[9px] text-[#8a8172] font-semibold">Your story</span>
        </button>
        {groups.filter((g) => g.userId !== currentUser?.id).map((g) => (
          <button key={g.userId} onClick={() => open(g.userId)} className="flex flex-col items-center gap-1 shrink-0">
            <div className={`w-16 h-16 rounded-full p-[2.5px] ${g.unseen > 0 ? 'bg-gradient-to-tr from-fuchsia-500 via-rose-400 to-amber-400' : 'bg-zinc-300 dark:bg-zinc-700'}`}>
              <div className="w-full h-full rounded-full bg-white dark:bg-zinc-800 flex items-center justify-center overflow-hidden">
                {g.userAvatar ? <img src={g.userAvatar} className="w-full h-full rounded-full object-cover" alt={g.userName} /> : <span className="text-lg font-bold text-[#3a342a] dark:text-zinc-100">{g.userName.slice(0, 1).toUpperCase()}</span>}
              </div>
            </div>
            <span className="text-[9px] text-[#8a8172] font-semibold max-w-16 truncate">{g.userName}</span>
          </button>
        ))}
        {groups.filter((g) => g.userId !== currentUser?.id).length === 0 && (
          <p className="text-[10px] text-[#8a8172] italic py-4">No stories yet — post your first one! Stories from your friends appear here for 24 hours.</p>
        )}
      </div>

      {/* my stories quick grid */}
      {myGroup && myGroup.stories.length > 0 && (
        <div className="mt-2 bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-2xl p-3">
          <p className="font-mono text-[9px] font-bold uppercase tracking-wider text-[#8a8172] flex items-center gap-1 mb-2"><MessageCircle size={11} /> Your active stories ({myGroup.stories.length})</p>
          <div className="grid grid-cols-4 gap-2">
            {myGroup.stories.map((s) => (
              <button key={s.id} onClick={() => open(s.userId)} className="relative aspect-[9/16] rounded-xl overflow-hidden bg-black group">
                {s.closeFriends && <Star size={11} className="absolute top-1 left-1 text-emerald-400" />}
                <img src={s.mediaUrl} className="w-full h-full object-cover group-hover:scale-105 transition-transform" alt="" />
                <span className="absolute bottom-1 inset-x-1 text-center text-[8px] text-white bg-black/50 rounded">{Math.floor((s.expiresAt - Date.now()) / 3600000)}h left</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
