import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Terminal, Plus, LogOut, Loader2, Users, Copy } from 'lucide-react';

/**
 * Ocean — Coding Pair-Sessions with Shared Terminal (Feature 195)
 * -----------------------------------------------------------------
 * A shared terminal room: create a room (get a 6-char code), share the code
 * with a peer, then type into the SAME live buffer and run shell commands
 * together. The room live-polls (≈1.2s) so both developers see the other's
 * keystrokes and the shared transcript in near real-time.
 * Backed by /api/pair/rooms/*.
 */

interface PairCodingProps {
  token: string | null;
  currentUser: { id: string; name: string } | null;
  onClose: () => void;
}

interface Entry { byName: string; cmd: string; out: string }
interface Room {
  code: string; title: string; members: string[]; log: Entry[]; cursor: string;
  buffer: { text: string; byName: string; byId: string; at: number } | null;
}

export default function PairCoding({ token, currentUser, onClose }: PairCodingProps) {
  const [visible, setVisible] = useState(true);
  const [room, setRoom] = useState<Room | null>(null);
  const [title, setTitle] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [command, setCommand] = useState('');
  const [liveText, setLiveText] = useState('');
  const [busy, setBusy] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const logRef = useRef<HTMLDivElement | null>(null);
  const bufferTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const toast = (message: string, variant?: string) =>
    window.dispatchEvent(new CustomEvent('show-toast', { detail: { message, variant } }));

  const authToken = token || localStorage.getItem('secure_auth_token');
  const api = async (path: string, method = 'GET', body?: unknown) => {
    const res = await fetch(path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error((err as any).error || `Request failed (${res.status})`);
    }
    return res.json();
  };

  const join = useCallback(async (code: string) => {
    setBusy(true);
    try {
      const d = await api(`/api/pair/rooms/${code}`, 'GET');
      setRoom(d.room);
      startPoll(code);
    } catch (e: any) { toast(e.message || 'Room not found.', 'destructive'); } finally { setBusy(false); }
  }, []);

  const create = async () => {
    setBusy(true);
    try {
      const d = await api('/api/pair/rooms', 'POST', { title });
      setRoom(d.room);
      startPoll(d.code);
      navigator.clipboard?.writeText(d.code).catch(() => {});
      toast(`Room created — share code ${d.code}`);
    } catch (e: any) { toast(e.message || 'Failed.', 'destructive'); } finally { setBusy(false); }
  };

  const startPoll = (code: string) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const d = await api(`/api/pair/rooms/${code}`, 'GET');
        setRoom((prev) => {
          const sameLog = prev && d.room.log.length === prev.log.length;
          const sameBuffer = prev && prev.buffer?.text === d.room.buffer?.text;
          return prev && sameLog && sameBuffer ? prev : d.room;
        });
      } catch { /* room gone */ }
    }, 1200);
  };

  // Debounced live-buffer sync: every keystroke lands in the shared room so
  // the peer sees you typing in near real-time.
  const syncBuffer = (text: string) => {
    if (!room) return;
    if (bufferTimer.current) clearTimeout(bufferTimer.current);
    bufferTimer.current = setTimeout(() => {
      api(`/api/pair/rooms/${room.code}/buffer`, 'POST', { text }).catch(() => {});
    }, 350);
  };

  const send = async () => {
    if (!command.trim() || !room) return;
    try {
      await api(`/api/pair/rooms/${room.code}/command`, 'POST', { command });
      setCommand('');
      setLiveText('');
      await api(`/api/pair/rooms/${room.code}/buffer`, 'POST', { text: '' });
    } catch (e: any) { toast(e.message, 'destructive'); }
  };

  // Stop syncing when leaving / unmounting.
  useEffect(() => () => { if (bufferTimer.current) clearTimeout(bufferTimer.current); }, []);

  const sendLive = async () => {
    if (!liveText.trim() || !room) return;
    const cmd = liveText.trim();
    setLiveText('');
    await api(`/api/pair/rooms/${room.code}/buffer`, 'POST', { text: '' }).catch(() => {});
    try {
      await api(`/api/pair/rooms/${room.code}/command`, 'POST', { command: cmd });
    } catch (e: any) { toast(e.message, 'destructive'); }
  };

  const leave = async () => {
    if (room) { try { await api(`/api/pair/rooms/${room.code}/leave`, 'POST'); } catch { /* ignore */ } }
    if (pollRef.current) clearInterval(pollRef.current);
    setRoom(null);
  };

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [room?.log.length]);

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  const shell = 'fixed inset-0 z-[115] bg-[#141b2b]/55 dark:bg-[#05060c]/85 backdrop-blur-sm overflow-y-auto py-6 px-4';
  const card = 'bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-3xl p-5 md:p-6 space-y-4 shadow-xs';
  const btnPrimary = 'flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#3a342a] text-[#f4f1ea] text-[10px] font-mono uppercase font-bold hover:bg-[#52493b] disabled:opacity-50';
  const input = 'w-full bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 rounded-xl px-3 py-2 text-xs text-[#3a342a] dark:text-zinc-100 placeholder-[#8a8172]/60 outline-none focus:border-amber-400 transition-colors font-mono';

  return (
    <AnimatePresence onExitComplete={() => onClose()}>
      {visible && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className={shell}>
          <div className="max-w-xl mx-auto">
            <div className="flex items-center justify-between mb-4">
              <span className="font-mono text-[10px] uppercase tracking-widest text-[#8a8172] dark:text-zinc-400">Pair coding</span>
              <button onClick={() => setVisible(false)} className="w-9 h-9 rounded-full bg-white/80 dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 flex items-center justify-center text-[#5c5446] dark:text-zinc-300 hover:bg-[#ebdcca]/50 transition-all" aria-label="Close">
                <X size={16} />
              </button>
            </div>

            <div className={card}>
              <div className="flex items-center gap-2">
                <span className="w-9 h-9 rounded-full bg-zinc-800/10 dark:bg-zinc-400/10 flex items-center justify-center">
                  <Terminal className="text-zinc-800 dark:text-zinc-300" size={17} />
                </span>
                <div className="flex-1">
                  <h2 className="font-display text-lg font-bold text-[#3a342a] dark:text-zinc-100">Pair Terminal</h2>
                  <p className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-400">Shared shell · relayed commands</p>
                </div>
                {room && (
                  <span className="flex items-center gap-1 px-2 py-1 rounded-full bg-zinc-800/10 dark:bg-zinc-400/10 font-mono text-[10px] font-bold text-zinc-700 dark:text-zinc-300">
                    <Users size={11} /> {room.members.length}
                  </span>
                )}
              </div>

              {!room ? (
                <div className="space-y-3">
                  <p className="text-xs text-[#5c5446] dark:text-zinc-300 leading-relaxed">
                    Create a room, share the 6-character code with a peer, and run commands together.
                    Every command is broadcast to the shared transcript.
                  </p>
                  <input className={input} value={title} onChange={e => setTitle(e.target.value)} placeholder="Session title (optional)" />
                  <button onClick={create} disabled={busy} className={`${btnPrimary} w-full justify-center`}>
                    {busy ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />} Create room
                  </button>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 border-t border-[#ebdcca] dark:border-zinc-800" />
                    <span className="font-mono text-[8px] uppercase tracking-widest text-[#8a8172] dark:text-zinc-500">or join</span>
                    <div className="flex-1 border-t border-[#ebdcca] dark:border-zinc-800" />
                  </div>
                  <div className="flex gap-2">
                    <input className={`${input} flex-1 uppercase tracking-[0.2em]`} value={joinCode} onChange={e => setJoinCode(e.target.value.toUpperCase().slice(0, 6))} placeholder="CODE" onKeyDown={e => { if (e.key === 'Enter' && joinCode.length === 6) join(joinCode); }} />
                    <button onClick={() => join(joinCode)} disabled={busy || joinCode.length !== 6} className={btnPrimary}>
                      <Terminal size={11} /> Join
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10px] font-bold bg-zinc-800/10 dark:bg-zinc-400/10 px-2 py-1 rounded-lg text-zinc-700 dark:text-zinc-300 tracking-[0.2em]">{room.code}</span>
                    <button onClick={() => { navigator.clipboard?.writeText(room.code); toast('Code copied.'); }} className="text-[#8a8172] hover:text-[#3a342a] dark:hover:text-zinc-100" aria-label="Copy code"><Copy size={13} /></button>
                    <div className="flex-1" />
                    <button onClick={leave} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-[#cfcac0] dark:border-zinc-700 text-[10px] font-mono uppercase font-bold text-[#3a342a] dark:text-zinc-100 hover:bg-[#ebdcca]/40">
                      <LogOut size={11} /> Leave
                    </button>
                  </div>
                  <div ref={logRef} className="h-64 overflow-y-auto rounded-2xl bg-zinc-950 dark:bg-black border border-zinc-800 p-3 font-mono text-[11px] leading-relaxed space-y-2">
                    {room.log.map((e, i) => (
                      <div key={i} className="whitespace-pre-wrap">
                        {e.cmd && (
                          <div><span className="text-emerald-400">[{e.byName}]</span> <span className="text-zinc-100">$ {e.cmd}</span></div>
                        )}
                        {e.out && e.out !== '__CLEAR__' && (
                          <div className={e.byName === 'system' ? 'text-zinc-500' : 'text-zinc-300'}>{e.out}</div>
                        )}
                        {e.out === '__CLEAR__' && <div className="text-zinc-600">— screen cleared —</div>}
                      </div>
                    ))}
                    <div className="text-zinc-500">$ {room.cursor}<span className="inline-block w-2 h-3.5 bg-emerald-400 animate-pulse align-middle ml-0.5" /></div>
                  </div>
                  <div className="rounded-xl border border-cyan-800/30 dark:border-cyan-400/20 bg-cyan-50/70 dark:bg-cyan-950/20 p-2.5">
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="font-mono text-[8px] uppercase tracking-widest text-cyan-800 dark:text-cyan-300 font-bold">Live shared buffer</span>
                      {room.buffer && room.buffer.byId !== (currentUser?.id || '') && Date.now() - room.buffer.at < 6000 && (
                        <span className="font-mono text-[8px] uppercase text-cyan-700 dark:text-cyan-300 animate-pulse">· {room.buffer.byName} is typing…</span>
                      )}
                    </div>
                    {room.buffer && room.buffer.byId !== (currentUser?.id || '') && Date.now() - room.buffer.at < 6000 && room.buffer.text && (
                      <div className="mb-1 rounded-lg bg-white/60 dark:bg-zinc-900/60 border border-cyan-800/20 dark:border-cyan-400/10 px-2 py-1.5">
                        <span className="font-mono text-[8px] uppercase text-cyan-800 dark:text-cyan-300">{room.buffer.byName}:</span>{' '}
                        <span className="font-mono text-[11px] text-[#3a342a] dark:text-zinc-200 whitespace-pre-wrap break-all">{room.buffer.text}</span>
                      </div>
                    )}
                    <textarea
                      className="w-full bg-transparent outline-none resize-none font-mono text-[11px] text-[#3a342a] dark:text-zinc-200 placeholder-[#8a8172]/50"
                      rows={2}
                      value={liveText}
                      onChange={(e) => { setLiveText(e.target.value); syncBuffer(e.target.value); }}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); sendLive(); } }}
                      placeholder="Both developers type here — the buffer syncs live between you."
                    />
                    <div className="flex items-center gap-2 mt-1">
                      <button onClick={sendLive} className="text-[9px] font-mono uppercase font-bold text-cyan-800 dark:text-cyan-300 hover:underline">Run as command</button>
                      <button onClick={() => { setLiveText(''); syncBuffer(''); }} className="text-[9px] font-mono uppercase text-[#8a8172] hover:underline">Clear</button>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <input className={`${input} flex-1`} value={command} onChange={e => setCommand(e.target.value)} placeholder="Type a command… (help, ls, node 1+1, echo hi)" onKeyDown={e => { if (e.key === 'Enter') send(); }} />
                    <button onClick={send} className={btnPrimary}><Terminal size={11} /> Run</button>
                  </div>
                  <p className="font-mono text-[8px] uppercase tracking-wide text-[#8a8172] dark:text-zinc-500">
                    Live buffer syncs keystrokes between members · Try: help · whoami · ls · cat index.js · node 1+1 · echo hello · clear
                  </p>
                </div>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
