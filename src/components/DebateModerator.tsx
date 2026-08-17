import { useEffect, useState } from 'react';
import { X, Scale, Plus, Send, ShieldAlert, Users, Megaphone } from 'lucide-react';

/**
 * Ocean — AI Debate Moderator (Feature 150)
 * Structured debate rooms with auto-moderation and participation balancing.
 */
interface DebateModeratorProps {
  token: string | null;
  currentUser: { id: string; name: string } | null;
  onClose: () => void;
}

interface Session {
  id: string;
  topic: string;
  createdByName: string;
  status: string;
  commentCount?: number;
}

interface Comment {
  id: string;
  authorName: string;
  text: string;
  toxicity: number;
  createdAt: number;
}

interface Balance {
  participants: { id: string; name: string; count: number; share: number }[];
  flagged: number;
  hidden: number;
  nextSpeaker: string;
  suggestion: string;
  verdict: string;
}

export default function DebateModerator({ token, currentUser, onClose }: DebateModeratorProps) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeId, setActiveId] = useState('');
  const [active, setActive] = useState<{ session: Session; comments: Comment[]; moderation: any } | null>(null);
  const [balance, setBalance] = useState<Balance | null>(null);
  const [topic, setTopic] = useState('Should remote work replace the office?');
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const headers = token ? { Authorization: `Bearer ${token}` } : {};

  const loadSessions = async () => {
    try {
      const r = await fetch('/api/debate/sessions');
      const d = await r.json();
      setSessions(d.sessions || []);
    } catch { /* non-fatal */ }
  };

  useEffect(() => {
    loadSessions();
  }, []);

  const open = async (id: string) => {
    setActiveId(id);
    setBalance(null);
    try {
      const r = await fetch(`/api/debate/session/${id}`);
      const d = await r.json();
      setActive(d);
    } catch { /* non-fatal */ }
  };

  const create = async () => {
    if (topic.trim().length < 5) return setError('Topic too short.');
    setBusy(true);
    setError('');
    try {
      const r = await fetch('/api/debate/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ topic }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Failed');
      loadSessions();
      open(d.session.id);
    } catch (e: any) {
      setError(e.message || 'Failed');
    } finally {
      setBusy(false);
    }
  };

  const addComment = async () => {
    if (!comment.trim() || !activeId) return;
    setBusy(true);
    setError('');
    try {
      const r = await fetch(`/api/debate/session/${activeId}/comment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ text: comment }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Failed');
      setComment('');
      open(activeId);
    } catch (e: any) {
      setError(e.message || 'Failed');
    } finally {
      setBusy(false);
    }
  };

  const analyze = async () => {
    if (!activeId) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/debate/session/${activeId}/balance`, { method: 'POST', headers });
      const d = await r.json();
      setBalance(d.balance);
    } catch (e: any) {
      setError(e.message || 'Failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[115] bg-[#141b2b]/60 dark:bg-[#05060c]/85 backdrop-blur-sm overflow-y-auto py-6 px-4">
      <div className="max-w-xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Scale size={18} className="text-amber-800 dark:text-amber-400" />
            <h2 className="font-display font-bold text-lg text-[#3a342a] dark:text-zinc-100 tracking-tight">AI Debate Moderator</h2>
            <span className="font-mono text-[9px] uppercase tracking-widest text-[#8a8172] dark:text-zinc-400">Feature 150</span>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-white/80 dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 flex items-center justify-center text-[#5c5446] dark:text-zinc-300 hover:bg-[#ebdcca]/50 transition-all" aria-label="Close">
            <X size={16} />
          </button>
        </div>

        {error && <p className="text-[10px] text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-xl p-2.5 mb-3">{error}</p>}

        {!activeId && (
          <>
            <div className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-[#fcfaf4] dark:bg-zinc-900 p-4 mb-3">
              <div className="flex gap-2">
                <input
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="Debate topic"
                  className="flex-1 px-3 py-2.5 rounded-xl border border-[#ebdcca] dark:border-zinc-700 bg-white dark:bg-zinc-950 text-[12px] text-[#3a342a] dark:text-zinc-100 focus:outline-none focus:border-amber-500"
                />
                <button onClick={create} disabled={busy || !currentUser} className="flex items-center gap-1 px-4 rounded-xl bg-amber-800 dark:bg-amber-400 text-white dark:text-zinc-950 font-bold text-[11px] hover:brightness-110 transition-all disabled:opacity-40">
                  <Plus size={13} /> Start
                </button>
              </div>
            </div>
            <div className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-[#fcfaf4] dark:bg-zinc-900 p-4">
              <p className="font-mono text-[9px] uppercase tracking-widest text-[#8a8172] dark:text-zinc-500 mb-2">Open debates</p>
              {sessions.length === 0 && <p className="text-[10px] text-[#8a8172] dark:text-zinc-500">No open debates yet.</p>}
              <div className="space-y-1.5">
                {sessions.map((s) => (
                  <button key={s.id} onClick={() => open(s.id)} className="w-full text-left rounded-xl border border-[#ebdcca] dark:border-zinc-800 p-2.5 hover:border-amber-400 transition-all">
                    <p className="text-[11px] font-bold text-[#3a342a] dark:text-zinc-100">“{s.topic}”</p>
                    <p className="text-[9px] text-[#8a8172] dark:text-zinc-500">by {s.createdByName} · {s.commentCount ?? 0} comments</p>
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {activeId && active && (
          <>
            <div className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-[#fcfaf4] dark:bg-zinc-900 p-4 mb-3">
              <div className="flex items-center gap-2 mb-1">
                <button onClick={() => { setActiveId(''); setActive(null); }} className="text-[10px] font-bold text-[#8a8172] dark:text-zinc-400 hover:text-amber-700 transition-colors">← Rooms</button>
                <p className="font-bold text-[12px] text-[#3a342a] dark:text-zinc-100 truncate">“{active.session.topic}”</p>
              </div>
              <p className="text-[9px] text-[#8a8172] dark:text-zinc-500 mb-2">
                {active.moderation.total} comments · {active.moderation.hidden} auto-hidden · by {active.session.createdByName}
              </p>
              <div className="flex gap-1.5">
                <button onClick={analyze} disabled={busy} className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-amber-800 dark:bg-amber-400 text-white dark:text-zinc-950 text-[10px] font-bold hover:brightness-110 transition-all disabled:opacity-40">
                  <Users size={11} /> Balance check
                </button>
                {!balance && (
                  <div className="flex flex-1 gap-1.5">
                    <input
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && addComment()}
                      placeholder="Add your point…"
                      className="flex-1 px-3 py-1.5 rounded-full border border-[#ebdcca] dark:border-zinc-700 bg-white dark:bg-zinc-950 text-[11px] focus:outline-none focus:border-amber-500"
                    />
                    <button onClick={addComment} disabled={busy || !currentUser} className="flex items-center gap-1 px-3 py-1.5 rounded-full border border-amber-700/40 dark:border-amber-400/40 text-amber-800 dark:text-amber-300 text-[10px] font-bold hover:bg-amber-50 dark:hover:bg-amber-950/40 transition-all disabled:opacity-40">
                      <Send size={10} /> Post
                    </button>
                  </div>
                )}
              </div>
            </div>

            {balance && (
              <div className="rounded-2xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 p-4 mb-3">
                <p className="flex items-center gap-1.5 font-bold text-[12px] text-amber-800 dark:text-amber-300 mb-1">
                  <Megaphone size={13} /> {balance.verdict === 'healthy' ? 'Healthy debate' : balance.verdict === 'one_sided' ? 'One-sided' : 'Getting heated'}
                </p>
                <p className="text-[11px] text-[#5c5446] dark:text-zinc-300 mb-2">{balance.suggestion}</p>
                <div className="space-y-1">
                  {balance.participants.map((p) => (
                    <div key={p.id} className="flex items-center gap-2 text-[10px]">
                      <span className="w-24 truncate font-bold text-[#3a342a] dark:text-zinc-100">{p.name}</span>
                      <div className="flex-1 h-1.5 rounded-full bg-white dark:bg-zinc-800 overflow-hidden">
                        <div className="h-full bg-amber-600 dark:bg-amber-400" style={{ width: `${p.share}%` }} />
                      </div>
                      <span className="font-mono text-[8px] text-[#8a8172]">{p.count} · {p.share}%</span>
                    </div>
                  ))}
                </div>
                {balance.nextSpeaker && (
                  <p className="text-[10px] font-bold text-amber-800 dark:text-amber-300 mt-2">Next to speak: {balance.nextSpeaker}</p>
                )}
              </div>
            )}

            <div className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-[#fcfaf4] dark:bg-zinc-900 p-4">
              <div className="space-y-1.5">
                {active.comments.map((c) => (
                  <div key={c.id} className={`rounded-xl border p-2.5 ${c.toxicity >= 40 ? 'border-rose-200 dark:border-rose-800 bg-rose-50/50 dark:bg-rose-950/20' : 'border-[#ebdcca] dark:border-zinc-800'}`}>
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="font-bold text-[10px] text-[#3a342a] dark:text-zinc-100">{c.authorName}</span>
                      {c.toxicity >= 40 && <span className="flex items-center gap-0.5 text-[8px] font-bold text-rose-600 dark:text-rose-400 uppercase"><ShieldAlert size={9} /> flagged {c.toxicity}</span>}
                      <span className="ml-auto font-mono text-[8px] text-[#8a8172] dark:text-zinc-500">{new Date(c.createdAt).toLocaleTimeString()}</span>
                    </div>
                    <p className="text-[11px] text-[#5c5446] dark:text-zinc-300">{c.text}</p>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
