import React, { useCallback, useEffect, useState } from 'react';
import { motion } from 'motion/react';
import {
  Radio, Users, UserPlus, Coins, Heart, Play, Square, Plus, X, Activity, SplitSquareHorizontal,
} from 'lucide-react';

/**
 * Ocean — Co-Streaming & Revenue Split
 * -------------------------------------
 * Two creators co-host a live session; tips sent during the stream are split
 * between host and co-host by a preset ratio (host% + co-host% always = 100).
 * Actual audio/video is out of scope — this panel manages session state +
 * revenue split. Backed by /api/live/* (see src/turtleCoStreamBackend.ts).
 */

interface LiveTip {
  from: string;
  fromName?: string;
  to: string;
  toName?: string;
  amount: number;
  at: number;
  split: { host: number; cohost: number };
}

interface LiveSession {
  id: string;
  title: string;
  hostId: string;
  hostName: string;
  coHostId: string | null;
  coHostName?: string;
  status: 'idle' | 'live' | 'ended';
  startedAt: number | null;
  endedAt: number | null;
  splitConfig: { ratioA: number; ratioB: number };
  tipTotal: number;
  tips: LiveTip[];
  viewers: string[];
}

interface LiveUser {
  id: string;
  name: string;
  username?: string;
  avatarUrl?: string;
}

interface CoStreamingProps {
  token: string | null;
  currentUser: { id: string; name: string } | null;
  onClose: () => void;
}

const STATUS_STYLE: Record<LiveSession['status'], string> = {
  idle: 'bg-zinc-100 text-zinc-500',
  live: 'bg-rose-50 text-rose-500',
  ended: 'bg-emerald-50 text-emerald-600',
};

function clockTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function initials(name: string): string {
  return (name || '?').trim().charAt(0).toUpperCase();
}

export default function CoStreaming({ token, currentUser, onClose }: CoStreamingProps) {
  const [sessions, setSessions] = useState<LiveSession[]>([]);
  const [users, setUsers] = useState<LiveUser[]>([]);
  const [detail, setDetail] = useState<LiveSession | null>(null);
  const [loading, setLoading] = useState(true);

  // Create form
  const [title, setTitle] = useState('');
  const [creating, setCreating] = useState(false);

  // Invite form
  const [coHostId, setCoHostId] = useState('');
  const [split, setSplit] = useState({ a: 50, b: 50 });

  // Tip form
  const [tipAmount, setTipAmount] = useState('');
  const [tipTo, setTipTo] = useState<'host' | 'cohost'>('host');
  const [tipping, setTipping] = useState(false);

  const toast = (msg: string, variant?: string) => {
    window.dispatchEvent(new CustomEvent('show-toast', { detail: { message: msg, variant } }));
  };

  const api = useCallback(async (path: string, method = 'GET', body?: unknown) => {
    const res = await fetch(path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Request failed (${res.status})`);
    }
    return res.json();
  }, [token]);

  const loadSessions = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api('/api/live/session');
      setSessions(data.sessions || []);
    } catch (e: any) {
      toast(e.message || 'Failed to load sessions.', 'destructive');
    } finally {
      setLoading(false);
    }
  }, [api, toast]);

  const loadUsers = useCallback(async () => {
    try {
      const data = await api('/api/live/users');
      setUsers(data.users || []);
    } catch (e) { /* non-fatal */ }
  }, [api]);

  const loadDetail = useCallback(async (id: string) => {
    try {
      const data = await api(`/api/live/session/${id}`);
      setDetail(data.session || null);
    } catch (e: any) {
      toast(e.message || 'Failed to load session.', 'destructive');
    }
  }, [api, toast]);

  useEffect(() => {
    loadSessions();
    loadUsers();
  }, [loadSessions, loadUsers]);

  useEffect(() => {
    if (detail) loadDetail(detail.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessions]);

  const createSession = async () => {
    setCreating(true);
    try {
      const data = await api('/api/live/session', 'POST', { title });
      setTitle('');
      toast('Live session created.');
      setDetail(data.session || null);
      loadSessions();
    } catch (e: any) {
      toast(e.message || 'Failed to create session.', 'destructive');
    } finally {
      setCreating(false);
    }
  };

  const inviteCoHost = async (session: LiveSession) => {
    if (!coHostId) return toast('Pick a co-host first.');
    try {
      const data = await api(`/api/live/session/${session.id}/cohost`, 'POST', {
        coHostId,
        ratioA: split.a,
        ratioB: split.b,
      });
      toast(`Co-host added · split ${split.a}/${split.b}.`);
      setCoHostId('');
      setDetail(data.session || null);
      loadSessions();
    } catch (e: any) {
      toast(e.message || 'Failed to invite co-host.', 'destructive');
    }
  };

  const startSession = async (session: LiveSession) => {
    try {
      const data = await api(`/api/live/session/${session.id}/start`, 'POST');
      setDetail(data.session || null);
      toast('Stream is live.');
      loadSessions();
    } catch (e: any) {
      toast(e.message || 'Failed to start.', 'destructive');
    }
  };

  const endSession = async (session: LiveSession) => {
    try {
      const data = await api(`/api/live/session/${session.id}/end`, 'POST');
      setDetail(data.session || null);
      toast('Stream ended.');
      loadSessions();
    } catch (e: any) {
      toast(e.message || 'Failed to end.', 'destructive');
    }
  };

  const joinSession = async (session: LiveSession) => {
    try {
      await api(`/api/live/session/${session.id}/join`, 'POST');
      toast('Joined as viewer.');
      loadSessions();
    } catch (e: any) {
      toast(e.message || 'Failed to join.', 'destructive');
    }
  };

  const sendTip = async (session: LiveSession) => {
    const amount = Math.floor(Number(tipAmount) || 0);
    if (amount <= 0) return toast('Enter a positive tip amount.');
    const to = tipTo === 'cohost' && session.coHostId ? session.coHostId : session.hostId;
    setTipping(true);
    try {
      const data = await api(`/api/live/session/${session.id}/tip`, 'POST', { amount, to });
      setTipAmount('');
      toast(`Tip sent · host +${data.split.host} · co-host +${data.split.cohost}`);
      setDetail(data.session || null);
      loadSessions();
    } catch (e: any) {
      toast(e.message || 'Failed to send tip.', 'destructive');
    } finally {
      setTipping(false);
    }
  };

  const me = currentUser;

  const isHost = (s: LiveSession) => me?.id === s.hostId;

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-9 h-9 rounded-full bg-[#3a342a]/10 dark:bg-zinc-800 flex items-center justify-center">
            <Radio className="text-[#3a342a] dark:text-zinc-200" size={18} />
          </span>
          <div>
            <h2 className="font-display text-lg font-bold text-[#3a342a] dark:text-zinc-100">Co-Streaming</h2>
            <p className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-400">Live with a co-host · split tips by ratio</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="w-9 h-9 rounded-full bg-white/80 dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 flex items-center justify-center text-[#8a8172] hover:text-[#3a342a] dark:hover:text-zinc-100"
        >
          <X size={16} />
        </button>
      </div>

      {/* Create session */}
      <div className="bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-3xl p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Plus size={14} className="text-[#8a8172] dark:text-zinc-400" />
          <span className="font-mono text-[10px] uppercase font-bold tracking-wider text-[#5c5446] dark:text-zinc-300">New live session</span>
        </div>
        <div className="flex gap-2">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && createSession()}
            placeholder="Stream title (e.g. Friday night jam)"
            className="flex-1 bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 rounded-xl px-3 py-2 text-sm text-[#3a342a] dark:text-zinc-100 outline-none focus:border-amber-400"
          />
          <button
            onClick={createSession}
            disabled={creating}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#3a342a] text-[#f4f1ea] text-[10px] font-mono uppercase font-bold hover:bg-[#52493b] disabled:opacity-50"
          >
            <Plus size={12} /> {creating ? 'Creating…' : 'Create'}
          </button>
        </div>
      </div>

      {/* Active console for the selected session */}
      {detail && (
        <LiveConsole
          session={detail}
          me={me}
          users={users}
          split={split}
          setSplit={setSplit}
          coHostId={coHostId}
          setCoHostId={setCoHostId}
          tipAmount={tipAmount}
          setTipAmount={setTipAmount}
          tipTo={tipTo}
          setTipTo={setTipTo}
          tipping={tipping}
          onInvite={inviteCoHost}
          onStart={startSession}
          onEnd={endSession}
          onTip={sendTip}
          onClose={() => setDetail(null)}
        />
      )}

      {/* Session list */}
      <div className="bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-3xl p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Activity size={14} className="text-[#8a8172] dark:text-zinc-400" />
          <span className="font-mono text-[10px] uppercase font-bold tracking-wider text-[#5c5446] dark:text-zinc-300">Sessions</span>
          <span className="ml-auto font-mono text-[9px] uppercase text-[#8a8172] dark:text-zinc-500">{sessions.length}</span>
        </div>

        {loading ? (
          <div className="py-10 text-center font-mono text-[10px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-400">Loading…</div>
        ) : sessions.length === 0 ? (
          <div className="py-10 text-center space-y-2">
            <Radio className="mx-auto text-[#8a8172] dark:text-zinc-500" size={26} />
            <p className="font-display text-sm text-[#5c5446] dark:text-zinc-300">No live or owned sessions yet.</p>
            <p className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-500">Create one to start streaming</p>
          </div>
        ) : (
          <div className="space-y-2">
            {sessions.map((s) => (
              <motion.div
                key={s.id}
                layout
                className={`rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-white/60 dark:bg-zinc-800/60 p-3 space-y-2 ${
                  detail?.id === s.id ? 'ring-1 ring-amber-400/50' : ''
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className={`font-mono text-[8px] px-1.5 py-0.5 rounded-full uppercase font-bold ${STATUS_STYLE[s.status]}`}>{s.status}</span>
                  <h4 className="font-display font-bold text-sm text-[#3a342a] dark:text-zinc-100 flex-1 truncate">{s.title}</h4>
                  <span className="font-mono text-[9px] uppercase text-[#8a8172] dark:text-zinc-400 flex items-center gap-1"><Coins size={11} /> {s.tipTotal || 0}</span>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-[10px] text-[#8a8172] dark:text-zinc-400 font-mono uppercase tracking-wide">
                  <span className="flex items-center gap-1"><span className="w-4 h-4 rounded-full bg-[#3a342a]/80 text-[#f4f1ea] flex items-center justify-center text-[8px]">{initials(s.hostName)}</span>{s.hostName} (host)</span>
                  {s.coHostId ? (
                    <span className="flex items-center gap-1"><span className="w-4 h-4 rounded-full bg-amber-700/80 text-white flex items-center justify-center text-[8px]">{initials(s.coHostName || 'C')}</span>{s.coHostName || 'Co-host'}</span>
                  ) : (
                    <span className="flex items-center gap-1 text-[#b7ae9d]"><Users size={11} /> no co-host yet</span>
                  )}
                  <span className="flex items-center gap-1"><SplitSquareHorizontal size={11} /> {s.splitConfig.ratioA}/{s.splitConfig.ratioB}</span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => { if (detail?.id === s.id) setDetail(null); else loadDetail(s.id); }}
                    className="font-mono text-[9px] uppercase font-bold tracking-wider py-1 px-2.5 rounded-lg bg-[#ebdcca]/40 dark:bg-zinc-800 text-[#5c5446] dark:text-zinc-300 hover:bg-[#ebdcca]/70"
                  >
                    {detail?.id === s.id ? 'Close' : 'Manage'}
                  </button>
                  {s.status !== 'ended' && !isHost(s) && (
                    <button
                      onClick={() => joinSession(s)}
                      className="font-mono text-[9px] uppercase font-bold tracking-wider py-1 px-2.5 rounded-lg bg-[#ebdcca]/40 dark:bg-zinc-800 text-[#5c5446] dark:text-zinc-300 hover:bg-[#ebdcca]/70 flex items-center gap-1"
                    >
                      <Users size={11} /> Join
                    </button>
                  )}
                  {isHost(s) && s.status !== 'live' && s.status !== 'ended' && (
                    <button
                      onClick={() => startSession(s)}
                      className="font-mono text-[9px] uppercase font-bold tracking-wider py-1 px-2.5 rounded-lg bg-rose-600 text-white hover:bg-rose-700 flex items-center gap-1"
                    >
                      <Play size={11} /> Start
                    </button>
                  )}
                  {isHost(s) && s.status === 'live' && (
                    <button
                      onClick={() => endSession(s)}
                      className="font-mono text-[9px] uppercase font-bold tracking-wider py-1 px-2.5 rounded-lg bg-emerald-700 text-white hover:bg-emerald-800 flex items-center gap-1"
                    >
                      <Square size={11} /> End
                    </button>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// LiveConsole — the "on air" panel: host + co-host cards, split sliders, tips
// ---------------------------------------------------------------------------

function LiveConsole({
  session, me, users, split, setSplit, coHostId, setCoHostId,
  tipAmount, setTipAmount, tipTo, setTipTo, tipping,
  onInvite, onStart, onEnd, onTip, onClose,
}: {
  session: LiveSession;
  me: { id: string; name: string } | null;
  users: LiveUser[];
  split: { a: number; b: number };
  setSplit: (v: { a: number; b: number }) => void;
  coHostId: string;
  setCoHostId: (v: string) => void;
  tipAmount: string;
  setTipAmount: (v: string) => void;
  tipTo: 'host' | 'cohost';
  setTipTo: (v: 'host' | 'cohost') => void;
  tipping: boolean;
  onInvite: (s: LiveSession) => void;
  onStart: (s: LiveSession) => void;
  onEnd: (s: LiveSession) => void;
  onTip: (s: LiveSession) => void;
  onClose: () => void;
}) {
  const isHost = me?.id === session.hostId;
  const isLive = session.status === 'live';
  const hasCohost = !!session.coHostId;
  const candidates = users.filter((u) => u.id !== me?.id);

  const moveA = (v: number) => setSplit({ a: v, b: 100 - v });
  const moveB = (v: number) => setSplit({ a: 100 - v, b: v });

  return (
    <motion.div layout className="bg-[#fcfaf4] dark:bg-zinc-900 border-2 border-[#ebdcca] dark:border-zinc-800 rounded-[2rem] p-5 space-y-4">
      {/* Console header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`w-2.5 h-2.5 rounded-full ${isLive ? 'bg-rose-500 animate-pulse' : 'bg-amber-400'}`} />
          <h3 className="font-display font-bold text-base text-[#3a342a] dark:text-zinc-100 truncate">{session.title}</h3>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-[9px] uppercase text-[#8a8172] dark:text-zinc-400">tips</span>
          <span className="font-mono text-sm font-bold text-[#3a342a] dark:text-zinc-100 flex items-center gap-1"><Coins size={13} /> {session.tipTotal || 0}</span>
          <button onClick={onClose} className="text-[#8a8172] hover:text-[#3a342a] dark:hover:text-zinc-100"><X size={16} /></button>
        </div>
      </div>

      {/* Host / co-host cards */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-[#ebdcca] dark:border-zinc-700 bg-white/70 dark:bg-zinc-800/70 p-3 space-y-1">
          <div className="flex items-center gap-2">
            <span className="w-8 h-8 rounded-full bg-[#3a342a]/80 text-[#f4f1ea] flex items-center justify-center font-mono text-xs">{initials(session.hostName)}</span>
            <div className="min-w-0">
              <div className="text-xs font-bold text-[#3a342a] dark:text-zinc-100 truncate">{session.hostName}</div>
              <div className="font-mono text-[8px] uppercase text-[#8a8172]">Host</div>
            </div>
          </div>
          <div className="font-mono text-[9px] uppercase text-[#8a8172]">Share {session.splitConfig.ratioA}%</div>
        </div>
        <div className={`rounded-2xl border p-3 space-y-1 ${hasCohost ? 'border-amber-300/60 dark:border-amber-700/50 bg-amber-50/50 dark:bg-amber-950/20' : 'border-dashed border-[#ebdcca] dark:border-zinc-700 bg-white/40 dark:bg-zinc-800/40'}`}>
          {hasCohost ? (
            <>
              <div className="flex items-center gap-2">
                <span className="w-8 h-8 rounded-full bg-amber-700/80 text-white flex items-center justify-center font-mono text-xs">{initials(session.coHostName || 'C')}</span>
                <div className="min-w-0">
                  <div className="text-xs font-bold text-[#3a342a] dark:text-zinc-100 truncate">{session.coHostName}</div>
                  <div className="font-mono text-[8px] uppercase text-[#8a8172]">Co-host</div>
                </div>
              </div>
              <div className="font-mono text-[9px] uppercase text-[#8a8172]">Share {session.splitConfig.ratioB}%</div>
            </>
          ) : (
            <div className="flex items-center justify-center text-[10px] text-[#8a8172] dark:text-zinc-500 font-mono uppercase tracking-wider">Invite a co-host</div>
          )}
        </div>
      </div>

      {/* Split controls (host only, before/while live) */}
      {isHost && session.status !== 'ended' && (
        <div className="rounded-2xl border border-[#ebdcca]/70 dark:border-zinc-700 p-3 space-y-2">
          <div className="font-mono text-[10px] uppercase font-bold tracking-wider text-[#5c5446] dark:text-zinc-300 flex items-center gap-1">
            <SplitSquareHorizontal size={12} /> Revenue split
          </div>
          {hasCohost ? (
            <>
              <div className="flex items-center gap-3 text-[10px] font-mono uppercase text-[#8a8172]">
                <span className="w-14">Host</span>
                <input
                  type="range" min={0} max={100} step={5} value={split.a}
                  onChange={(e) => moveA(Number(e.target.value))}
                  className="flex-1 accent-[#3a342a]"
                />
                <span className="w-10 text-right font-bold text-[#3a342a] dark:text-zinc-100">{split.a}%</span>
              </div>
              <div className="flex items-center gap-3 text-[10px] font-mono uppercase text-[#8a8172]">
                <span className="w-14">Co-host</span>
                <input
                  type="range" min={0} max={100} step={5} value={split.b}
                  onChange={(e) => moveB(Number(e.target.value))}
                  className="flex-1 accent-amber-600"
                />
                <span className="w-10 text-right font-bold text-[#3a342a] dark:text-zinc-100">{split.b}%</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => onInvite(session)}
                  className="font-mono text-[9px] uppercase font-bold tracking-wider py-1.5 px-3 rounded-lg bg-[#3a342a] text-[#f4f1ea] hover:bg-[#52493b]"
                >
                  Update split
                </button>
                <span className="font-mono text-[9px] uppercase text-[#8a8172]">must sum to 100 · {split.a + split.b}%</span>
              </div>
            </>
          ) : (
            <>
              <select
                value={coHostId}
                onChange={(e) => setCoHostId(e.target.value)}
                className="w-full bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 rounded-xl px-3 py-2 text-sm outline-none focus:border-amber-400"
              >
                <option value="">Choose a co-host…</option>
                {candidates.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}{u.username ? ` (@${u.username})` : ''}</option>
                ))}
              </select>
              <div className="flex items-center gap-3 text-[10px] font-mono uppercase text-[#8a8172]">
                <span className="w-14">Host</span>
                <input
                  type="range" min={0} max={100} step={5} value={split.a}
                  onChange={(e) => moveA(Number(e.target.value))}
                  className="flex-1 accent-[#3a342a]"
                />
                <span className="w-10 text-right font-bold text-[#3a342a] dark:text-zinc-100">{split.a}%</span>
              </div>
              <div className="flex items-center gap-3 text-[10px] font-mono uppercase text-[#8a8172]">
                <span className="w-14">Co-host</span>
                <input
                  type="range" min={0} max={100} step={5} value={split.b}
                  onChange={(e) => moveB(Number(e.target.value))}
                  className="flex-1 accent-amber-600"
                />
                <span className="w-10 text-right font-bold text-[#3a342a] dark:text-zinc-100">{split.b}%</span>
              </div>
              <button
                onClick={() => onInvite(session)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#3a342a] text-[#f4f1ea] text-[10px] font-mono uppercase font-bold hover:bg-[#52493b]"
              >
                <UserPlus size={12} /> Invite co-host
              </button>
            </>
          )}
        </div>
      )}

      {/* Start / End actions (host) */}
      {isHost && (
        <div className="flex gap-2">
          {!isLive && session.status !== 'ended' && (
            <button
              onClick={() => onStart(session)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-rose-600 text-white text-[10px] font-mono uppercase font-bold hover:bg-rose-700"
            >
              <Play size={12} /> Go live
            </button>
          )}
          {isLive && (
            <button
              onClick={() => onEnd(session)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-700 text-white text-[10px] font-mono uppercase font-bold hover:bg-emerald-800"
            >
              <Square size={12} /> End stream
            </button>
          )}
        </div>
      )}

      {/* Send a tip */}
      {isLive && !isHost && (
        <div className="rounded-2xl border border-[#ebdcca]/70 dark:border-zinc-700 p-3 space-y-2">
          <div className="font-mono text-[10px] uppercase font-bold tracking-wider text-[#5c5446] dark:text-zinc-300 flex items-center gap-1">
            <Heart size={12} className="text-rose-500" /> Send a tip
          </div>
          <div className="flex gap-2">
            <input
              type="number" min={1} value={tipAmount}
              onChange={(e) => setTipAmount(e.target.value)}
              placeholder="Amount"
              className="w-28 bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 rounded-xl px-3 py-2 text-sm outline-none focus:border-amber-400"
            />
            <select
              value={tipTo}
              onChange={(e) => setTipTo(e.target.value as 'host' | 'cohost')}
              className="flex-1 bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 rounded-xl px-3 py-2 text-sm outline-none"
            >
              <option value="host">For {session.hostName} (host)</option>
              {hasCohost && <option value="cohost">For {session.coHostName} (co-host)</option>}
            </select>
            <button
              onClick={() => onTip(session)}
              disabled={tipping}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-rose-600 text-white text-[10px] font-mono uppercase font-bold hover:bg-rose-700 disabled:opacity-50"
            >
              <Coins size={12} /> {tipping ? 'Sending…' : 'Tip'}
            </button>
          </div>
          <p className="text-[10px] text-[#8a8172] dark:text-zinc-400">
            Split {session.splitConfig.ratioA}/{session.splitConfig.ratioB} between host and co-host. Drawn from your Ocean wallet.
          </p>
        </div>
      )}

      {/* Tips history */}
      {session.tips && session.tips.length > 0 && (
        <div className="space-y-2">
          <div className="font-mono text-[10px] uppercase font-bold tracking-wider text-[#5c5446] dark:text-zinc-300">Tip history</div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left font-mono text-[8px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-400 border-b border-[#ebdcca] dark:border-zinc-700">
                  <th className="py-1.5 pr-2">From</th>
                  <th className="py-1.5 pr-2">Amount</th>
                  <th className="py-1.5 pr-2">Host</th>
                  <th className="py-1.5 pr-2">Co-host</th>
                  <th className="py-1.5">At</th>
                </tr>
              </thead>
              <tbody>
                {session.tips.slice().reverse().map((t, i) => (
                  <tr key={`${t.at}-${i}`} className="border-b border-[#ebdcca]/50 dark:border-zinc-800">
                    <td className="py-1.5 pr-2 text-[#3a342a] dark:text-zinc-200 font-medium">{t.fromName || t.from}</td>
                    <td className="py-1.5 pr-2 font-mono text-[#3a342a] dark:text-zinc-200">{t.amount}</td>
                    <td className="py-1.5 pr-2 font-mono text-[#8a8172]">+{t.split.host}</td>
                    <td className="py-1.5 pr-2 font-mono text-[#8a8172]">+{t.split.cohost}</td>
                    <td className="py-1.5 font-mono text-[9px] text-[#8a8172]">{clockTime(t.at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {(!session.tips || session.tips.length === 0) && (
        <p className="text-[10px] text-[#8a8172] dark:text-zinc-500 font-mono uppercase tracking-wider">No tips yet — the split math is ready when viewers are.</p>
      )}
    </motion.div>
  );
}
