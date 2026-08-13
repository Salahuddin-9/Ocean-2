import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Radio, Gift, Target, Trophy, Coins, Play, X, UserMinus, Ban, Plus, PartyPopper } from 'lucide-react';
import FeatureShell, { toast, authHeaders } from './FeatureShell';
import GiftFly from './GiftFly';
import { giftSpec, type GiftAnimSpec } from '../lib/lottieGifts';

interface Props {
  token: string | null;
  currentUser: { id: string; name: string } | null;
  onClose: () => void;
}

interface GiftDef { id: string; name: string; emoji: string; cost: number; animated: string }
interface RecentGift { id: string; fromName: string; toName: string; giftName: string; emoji: string; cost: number; at: number }
interface LiveRoom { id: string; hostId: string; hostName: string; title: string; category: string; viewers: string[]; banned: string[]; kicked: string[]; viewerCount: number }
interface Leader { id: string; name: string; total: number; count: number }
interface Goal { id: string; title: string; target: number; raised: number; expiresAt: number }

export default function LiveEcosystem({ token, currentUser, onClose }: Props) {
  const [tab, setTab] = useState<'gifts' | 'rooms' | 'goals' | 'board'>('gifts');
  const [balance, setBalance] = useState<number | null>(null);
  const [catalog, setCatalog] = useState<GiftDef[]>([]);
  const [rooms, setRooms] = useState<LiveRoom[]>([]);
  const [recipient, setRecipient] = useState('');
  const [fly, setFly] = useState<{ spec: GiftAnimSpec; from: string; gift: string } | null>(null);
  const [recent, setRecent] = useState<RecentGift[]>([]);
  const [goal, setGoal] = useState<Goal | null>(null);
  const [goalTitle, setGoalTitle] = useState('');
  const [goalTarget, setGoalTarget] = useState(500);
  const [roomTitle, setRoomTitle] = useState('');
  const [roomCat, setRoomCat] = useState('chat');
  const [board, setBoard] = useState<{ streamers: Leader[]; gifters: Leader[]; giftCount: number } | null>(null);

  const load = useCallback(async () => {
    try {
      const [gifts, roomsRes, goals, boardRes] = await Promise.all([
        fetch('/api/live/gifts', { headers: authHeaders(token) }),
        fetch('/api/live/rooms', { headers: authHeaders(token) }),
        fetch('/api/live/goals', { headers: authHeaders(token) }),
        fetch('/api/live/leaderboard', { headers: authHeaders(token) }),
      ]);
      if (gifts.ok) { const g = await gifts.json(); setCatalog(g.catalog); catalogRef.current = g.catalog; setBalance(g.balance); }
      if (roomsRes.ok) setRooms((await roomsRes.json()).rooms || []);
      if (goals.ok) setGoal((await goals.json()).goal || null);
      if (boardRes.ok) setBoard(await boardRes.json());
      const rec = await fetch('/api/live/gifts/recent', { headers: authHeaders(token) });
      if (rec.ok) setRecent((await rec.json()).recent || []);
    } catch { /* offline */ }
  }, [token]);

  useEffect(() => { load(); const iv = setInterval(load, 8000); return () => clearInterval(iv); }, [load]);

  // ── Real-time gift events over the existing /ws/chat channel (feature #252) ────────
  // The server broadcasts { type:'live_gift', gift } on every send; we prepend to the
  // live feed and animate the fly-in when a gift is addressed to us. Polling above stays
  // as an offline fallback. `catalog` is read through a ref so the 8s poll (which changes
  // its identity) never tears down + reopens this socket.
  const catalogRef = useRef<GiftDef[]>([]);
  useEffect(() => {
    if (!token || !currentUser?.id) return;
    let sock: WebSocket | null = null;
    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      sock = new WebSocket(`${protocol}//${window.location.host}/ws/chat`);
    } catch { return; }
    sock.onopen = () => {
      if (sock && sock.readyState === WebSocket.OPEN) {
        sock.send(JSON.stringify({ type: 'auth', token, userId: currentUser.id, name: currentUser.name }));
      }
    };
    sock.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg?.type !== 'live_gift' || !msg.gift) return;
        setRecent((prev) => [msg.gift as RecentGift, ...prev].slice(0, 15));
        if (currentUser.id && msg.gift.to === currentUser.id) {
          const def = catalogRef.current.find((g) => g.id === msg.gift.giftId);
          setFly({ spec: giftSpec(def?.animated || 'heart'), from: msg.gift.fromName, gift: msg.gift.giftName });
          toast(`🎁 ${msg.gift.fromName} sent ${msg.gift.giftName} — you earned ${msg.gift.cost} coins`);
        }
      } catch { /* ignore malformed frames */ }
    };
    return () => { try { sock?.close(); } catch { /* noop */ } };
  }, [token, currentUser?.id, currentUser?.name]);

  const sendGift = async (g: GiftDef) => {
    if (!recipient) { toast('⛔ Pick a live streamer to gift'); return; }
    const res = await fetch('/api/live/gifts/send', {
      method: 'POST', headers: authHeaders(token), body: JSON.stringify({ toUserId: recipient, giftId: g.id }),
    });
    const d = await res.json();
    if (!res.ok) return toast(`⛔ ${d.error}`);
    setBalance(d.balance);
    setFly({ spec: giftSpec(g.animated || g.id), from: d.gift.fromName, gift: g.name });
    toast(`🎁 ${d.gift.fromName} sent ${g.name} — streamer earned ${g.cost} coins`);
    load();
  };

  const roomAction = async (id: string, action: 'join' | 'leave' | 'end') => {
    const res = await fetch(`/api/live/rooms/${id}/${action}`, { method: 'POST', headers: authHeaders(token) });
    const d = await res.json();
    if (!res.ok) return toast(`⛔ ${d.error}`);
    load();
    if (action === 'join') toast(`✅ Joined (${d.viewerCount} viewers)`);
  };

  const modAction = async (roomId: string, userId: string, action: 'kick' | 'ban') => {
    const res = await fetch(`/api/live/rooms/${roomId}/${action}`, {
      method: 'POST', headers: authHeaders(token), body: JSON.stringify({ userId }),
    });
    const d = await res.json();
    if (!res.ok) return toast(`⛔ ${d.error}`);
    toast(`🚫 ${action === 'kick' ? 'Kicked' : 'Banned'} viewer`);
    load();
  };

  const setMyGoal = async () => {
    if (!goalTitle.trim()) { toast('⛔ Goal title required'); return; }
    const res = await fetch('/api/live/goals', { method: 'POST', headers: authHeaders(token), body: JSON.stringify({ title: goalTitle, target: goalTarget }) });
    const d = await res.json();
    if (!res.ok) return toast(`⛔ ${d.error}`);
    setGoal(d.goal);
    toast('🎯 Goal set!');
  };

  const startRoom = async () => {
    if (!roomTitle.trim()) { toast('⛔ Room title required'); return; }
    const res = await fetch('/api/live/rooms', { method: 'POST', headers: authHeaders(token), body: JSON.stringify({ title: roomTitle, category: roomCat }) });
    const d = await res.json();
    if (!res.ok) return toast(`⛔ ${d.error}`);
    setRoomTitle('');
    toast('📡 You are live!');
    load();
  };

  const myRooms = rooms.filter((r) => r.hostId === currentUser?.id);

  return (
    <FeatureShell title="Live Gifts + Live Ecosystem" badge="252 · wallet" icon={<Radio size={18} className="text-rose-700 dark:text-rose-400" />} onClose={onClose}>
      <div className="flex items-center gap-1.5 mb-3 flex-wrap">
        {([['gifts', 'Gifts', <Gift key="g" size={11} />], ['rooms', 'Live rooms', <Radio key="r" size={11} />], ['goals', 'Goals', <Target key="t" size={11} />], ['board', 'Leaderboard', <Trophy key="l" size={11} />]] as const).map(([id, label, icon]) => (
          <button key={id} onClick={() => setTab(id)}
            className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[10px] font-bold transition-all ${tab === id ? 'bg-rose-600 text-white' : 'bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 text-[#8a8172]'}`}>
            {icon} {label}
          </button>
        ))}
        {balance !== null && (
          <span className="ml-auto flex items-center gap-1 rounded-lg bg-amber-100 dark:bg-amber-900/30 px-2.5 py-1.5 text-[10px] font-bold text-amber-800 dark:text-amber-300">
            <Coins size={11} /> {balance.toLocaleString()}
          </span>
        )}
      </div>

      <AnimatePresence mode="wait">
        {fly && (
          <motion.div key={fly.spec.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <GiftFly spec={fly.spec} fromName={fly.from} giftName={fly.gift} onDone={() => setFly(null)} />
          </motion.div>
        )}
      </AnimatePresence>

      {tab === 'gifts' && (
        <div className="bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-2xl p-3">
          <p className="font-mono text-[9px] font-bold uppercase tracking-wider text-[#8a8172] mb-2">Gift a live streamer</p>
          {rooms.length === 0 ? (
            <p className="text-[10px] text-[#8a8172] italic">No live rooms right now — start one or wait for a streamer to go live.</p>
          ) : (
            <div className="flex gap-1.5 flex-wrap mb-3">
              {rooms.map((r) => (
                <button key={r.id} onClick={() => setRecipient(r.hostId)}
                  className={`rounded-xl px-2.5 py-1.5 text-[10px] font-bold transition-all ${recipient === r.hostId ? 'bg-rose-600 text-white' : 'border border-[#ebdcca] dark:border-zinc-700 text-[#8a8172]'}`}>
                  {r.hostName} · {r.viewerCount} 👀
                </button>
              ))}
            </div>
          )}
          <div className="grid grid-cols-5 gap-2">
            {catalog.map((g) => (
              <button key={g.id} onClick={() => sendGift(g)} disabled={!recipient}
                className="flex flex-col items-center gap-0.5 rounded-xl border border-[#ebdcca] dark:border-zinc-700 py-2 hover:border-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/10 transition-all disabled:opacity-40 group">
                <span className="text-xl group-hover:scale-125 transition-transform">{g.emoji}</span>
                <span className="text-[8px] font-bold text-[#3a342a] dark:text-zinc-200">{g.name}</span>
                <span className="text-[8px] text-amber-600 dark:text-amber-400 font-mono">{g.cost} 🪙</span>
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5 mt-2 flex-wrap">
            <span className="text-[8px] text-[#8a8172] font-mono uppercase tracking-wider">💫 Lottie animation plays on send (lottie-web)</span>
            <button onClick={() => catalog.length && setFly({ spec: giftSpec(catalog[0].animated), from: currentUser?.name || 'You', gift: catalog[0].name })}
              className="ml-auto text-[8px] rounded-lg border border-[#ebdcca] dark:border-zinc-700 px-2 py-1 font-bold text-[#8a8172] hover:border-rose-400">Preview</button>
          </div>

          {recent.length > 0 && (
            <div className="mt-2 rounded-xl bg-rose-50/70 dark:bg-rose-900/10 border border-rose-100 dark:border-rose-900/40 p-2">
              <p className="text-[8px] font-mono uppercase tracking-wider text-rose-500 font-bold mb-1">🔴 Live gift feed (polled)</p>
              <div className="space-y-1 max-h-36 overflow-y-auto pr-1">
                {recent.map((r) => (
                  <div key={r.id} className="flex items-center gap-1.5 text-[9px] text-[#3a342a] dark:text-zinc-300">
                    <span>{r.emoji}</span>
                    <b>{r.fromName}</b> → <b className="text-rose-600 dark:text-rose-400">{r.toName}</b>
                    <span className="text-[#8a8172]">{r.giftName}</span>
                    <span className="ml-auto font-mono text-amber-600 dark:text-amber-400">{r.cost} 🪙</span>
                    <span className="font-mono text-[#8a8172]">{new Date(r.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <p className="text-[8px] text-[#8a8172] mt-2">Gifts come straight out of your coin wallet (community.json) and credit the streamer instantly.</p>
        </div>
      )}

      {tab === 'rooms' && (
        <div className="space-y-3">
          <div className="bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-2xl p-3">
            <p className="font-mono text-[9px] font-bold uppercase tracking-wider text-[#8a8172] mb-2">Start a live room</p>
            <div className="flex gap-1.5">
              <input value={roomTitle} onChange={(e) => setRoomTitle(e.target.value)} placeholder="Stream title…" className="flex-1 rounded-xl border border-[#ebdcca] dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2.5 py-2 text-[11px] outline-none" />
              <select value={roomCat} onChange={(e) => setRoomCat(e.target.value)} className="rounded-xl border border-[#ebdcca] dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2 py-2 text-[11px] outline-none">
                {['chat', 'music', 'gaming', 'cooking', 'study', 'sports'].map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <button onClick={startRoom} className="px-3 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-[10px] font-bold"><Plus size={12} /></button>
            </div>
          </div>

          {rooms.map((r) => {
            const isHost = r.hostId === currentUser?.id;
            const joined = r.viewers.includes(currentUser?.id || '');
            return (
              <div key={r.id} className="bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-2xl p-3">
                <div className="flex items-center gap-2">
                  <span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75" /><span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500" /></span>
                  <p className="text-[12px] font-bold text-[#3a342a] dark:text-zinc-100">{r.title}</p>
                  <span className="text-[8px] uppercase font-mono text-[#8a8172] bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 rounded px-1.5 py-0.5">{r.category}</span>
                  <span className="ml-auto text-[9px] text-[#8a8172] font-mono">{r.viewerCount} watching</span>
                </div>
                <p className="text-[9px] text-[#8a8172] mt-1">Host: {r.hostName}</p>
                <div className="flex gap-1.5 mt-2">
                  {!isHost && (joined
                    ? <button onClick={() => roomAction(r.id, 'leave')} className="rounded-lg border border-[#ebdcca] dark:border-zinc-700 px-3 py-1.5 text-[10px] font-bold text-[#8a8172]"><X size={11} className="inline mr-1" />Leave</button>
                    : <button onClick={() => roomAction(r.id, 'join')} className="rounded-lg bg-rose-600 hover:bg-rose-500 px-3 py-1.5 text-[10px] font-bold text-white"><Play size={11} className="inline mr-1" />Join</button>)}
                  {isHost && (
                    <>
                      <button onClick={() => roomAction(r.id, 'end')} className="rounded-lg bg-zinc-800 hover:bg-zinc-700 px-3 py-1.5 text-[10px] font-bold text-white">End stream</button>
                      <span className="text-[9px] text-[#8a8172] self-center">Mod tools:</span>
                      {r.viewers.filter((v) => v !== currentUser?.id).map((v) => (
                        <span key={v} className="flex items-center gap-1 rounded-lg bg-zinc-100 dark:bg-zinc-800 px-2 py-1 text-[9px] text-[#5c5446] dark:text-zinc-300">
                          {v.slice(0, 12)}
                          <button onClick={() => modAction(r.id, v, 'kick')} title="Kick" className="text-amber-600 hover:text-amber-500"><UserMinus size={11} /></button>
                          <button onClick={() => modAction(r.id, v, 'ban')} title="Ban" className="text-rose-600 hover:text-rose-500"><Ban size={11} /></button>
                        </span>
                      ))}
                    </>
                  )}
                </div>
              </div>
            );
          })}
          {rooms.length === 0 && <p className="text-[10px] text-[#8a8172] italic">No live rooms.</p>}
        </div>
      )}

      {tab === 'goals' && (
        <div className="bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-2xl p-3">
          <p className="font-mono text-[9px] font-bold uppercase tracking-wider text-[#8a8172] mb-2">Stream goal</p>
          <div className="flex gap-1.5">
            <input value={goalTitle} onChange={(e) => setGoalTitle(e.target.value)} placeholder="Goal title (e.g. New mic 🎤)" className="flex-1 rounded-xl border border-[#ebdcca] dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2.5 py-2 text-[11px] outline-none" />
            <input type="number" min={10} value={goalTarget} onChange={(e) => setGoalTarget(Number(e.target.value))} className="w-24 rounded-xl border border-[#ebdcca] dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2.5 py-2 text-[11px] outline-none" />
            <button onClick={setMyGoal} className="px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold">Set</button>
          </div>
          {goal && (
            <div className="mt-3 rounded-xl bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 p-3">
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-[11px] font-bold text-[#3a342a] dark:text-zinc-100">{goal.title}</p>
                <p className="text-[9px] font-mono text-[#8a8172]">{goal.raised.toLocaleString()} / {goal.target.toLocaleString()} 🪙</p>
              </div>
              <div className="h-2.5 rounded-full bg-zinc-200 dark:bg-zinc-700 overflow-hidden">
                <motion.div initial={{ width: 0 }} animate={{ width: `${Math.min(100, (goal.raised / goal.target) * 100)}%` }}
                  className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full" />
              </div>
              {goal.raised >= goal.target && <p className="text-[10px] text-emerald-600 font-bold mt-1.5">🎉 Goal reached!</p>}
            </div>
          )}
          {!goal && <p className="text-[10px] text-[#8a8172] italic mt-2">Set a goal and every gift you receive fills the bar automatically.</p>}
        </div>
      )}

      {tab === 'board' && (
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-2xl p-3">
            <p className="font-mono text-[9px] font-bold uppercase tracking-wider text-[#8a8172] mb-2 flex items-center gap-1"><Trophy size={11} /> Top streamers</p>
            {(board?.streamers || []).map((s, i) => (
              <div key={s.id} className="flex items-center gap-2 py-1.5 border-b border-[#ebdcca]/60 dark:border-zinc-800 last:border-0">
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold ${i === 0 ? 'bg-amber-400 text-amber-900' : i === 1 ? 'bg-zinc-300 text-zinc-700' : i === 2 ? 'bg-orange-300 text-orange-900' : 'bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 text-[#8a8172]'}`}>{i + 1}</span>
                <span className="text-[11px] font-semibold text-[#3a342a] dark:text-zinc-100 flex-1 truncate">{s.name}</span>
                <span className="text-[10px] font-mono text-amber-600 dark:text-amber-400">{s.total.toLocaleString()} 🪙</span>
              </div>
            ))}
            {(board?.streamers || []).length === 0 && <p className="text-[10px] text-[#8a8172] italic">No gifts sent yet.</p>}
          </div>
          <div className="bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-2xl p-3">
            <p className="font-mono text-[9px] font-bold uppercase tracking-wider text-[#8a8172] mb-2 flex items-center gap-1"><Gift size={11} /> Top gifters ({board?.giftCount || 0} total)</p>
            {(board?.gifters || []).map((s, i) => (
              <div key={s.id} className="flex items-center gap-2 py-1.5 border-b border-[#ebdcca]/60 dark:border-zinc-800 last:border-0">
                <span className="text-[11px] font-semibold text-[#3a342a] dark:text-zinc-100 flex-1 truncate">{s.name}</span>
                <span className="text-[9px] text-[#8a8172]">{s.count} gifts</span>
                <span className="text-[10px] font-mono text-amber-600 dark:text-amber-400">{s.total.toLocaleString()} 🪙</span>
              </div>
            ))}
            {(board?.gifters || []).length === 0 && <p className="text-[10px] text-[#8a8172] italic">Be the first to gift!</p>}
          </div>
        </div>
      )}
    </FeatureShell>
  );
}
