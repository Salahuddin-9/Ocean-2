import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Satellite, Send, WifiOff, CheckCircle2, Inbox, Loader2, CloudOff } from 'lucide-react';
import {
  queueEmergencyMessage,
  flushSatQueue,
  readSatQueue,
  clearSatQueueLocal,
  listenDelivered,
  type QueuedEmergency,
} from '../lib/satQueue';
import SimulationModeBadge from './SimulationModeBadge';

/**
 * Ocean — Offline Emergency Relay (Feature 239)
 * -------------------------------------------------------
 * Messages composed while offline are queued (IndexedDB via the /sw.js service
 * worker + a localStorage mirror) and delivered automatically as soon as the
 * network returns, through the same relay contract a satellite/IoT gateway
 * would use (/api/sat/relay). No actual satellite is contacted — this is the
 * realistic offline-queue half of the satellite-fallback feature.
 */

interface SatelliteFallbackProps {
  token: string | null;
  currentUser: { id: string; name: string } | null;
  onClose: () => void;
}

interface Relay { id: string; fromId: string; fromName: string; payload: string; status: string; at: number }

export default function SatelliteFallback({ token, currentUser, onClose }: SatelliteFallbackProps) {
  const [visible, setVisible] = useState(true);
  const [online, setOnline] = useState(navigator.onLine);
  const [queue, setQueue] = useState<QueuedEmergency[]>([]);
  const [relays, setRelays] = useState<Relay[]>([]);
  const [to, setTo] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

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

  const toast = (message: string, variant?: string) =>
    window.dispatchEvent(new CustomEvent('show-toast', { detail: { message, variant } }));

  useEffect(() => {
    setQueue(readSatQueue());
    const on = () => { setOnline(true); flushSatQueue().then(loadRelays).catch(() => {}); };
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    const unsub = listenDelivered((ids) => {
      // Always clean the localStorage mirror on delivery (even when a manual
      // flush raced the SW and timed out) so the UI never shows delivered
      // messages as still queued.
      clearSatQueueLocal(ids);
      setQueue(readSatQueue());
      loadRelays();
    });
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); unsub(); };
  }, []);

  const loadRelays = async () => {
    try {
      const d = await api('/api/sat/relays', 'GET');
      setRelays(d.relays || []);
    } catch { /* ignore */ }
  };

  useEffect(() => { loadRelays(); }, []);

  const enqueue = async () => {
    if (!to.trim() || !text.trim()) return toast('Recipient and message are required.');
    setBusy(true);
    try {
      await queueEmergencyMessage(to.trim(), text.trim(), authToken);
      setQueue(readSatQueue());
      toast(online ? 'Queued for offline relay — will deliver on the next network window.' : 'Offline — queued; the service worker will auto-deliver when you reconnect.');
      setTo(''); setText('');
    } finally { setBusy(false); }
  };

  const flush = async () => {
    if (queue.length === 0) return;
    setBusy(true);
    try {
      const delivered = await flushSatQueue();
      if (delivered.length === 0 && !('serviceWorker' in navigator)) {
        // No SW (insecure context) — fall back to direct API delivery.
        for (const m of queue) await api('/api/sat/relay', 'POST', { toId: m.toId, payload: m.payload });
        clearSatQueueLocal();
        setQueue([]);
      } else {
        setQueue((q) => q.filter((m) => !delivered.includes(m.id)));
      }
      await loadRelays();
      toast('Offline queue flushed — queued messages delivered.');
    } catch (e: any) { toast(e.message, 'destructive'); } finally { setBusy(false); }
  };

  const shell = 'fixed inset-0 z-[115] bg-[#141b2b]/55 dark:bg-[#05060c]/85 backdrop-blur-sm overflow-y-auto py-6 px-4';
  const card = 'bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-3xl p-5 md:p-6 space-y-4 shadow-xs';
  const btnPrimary = 'flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#3a342a] text-[#f4f1ea] text-[10px] font-mono uppercase font-bold hover:bg-[#52493b] disabled:opacity-50';
  const input = 'w-full bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 rounded-xl px-3 py-2 text-xs text-[#3a342a] dark:text-zinc-100 placeholder-[#8a8172]/60 outline-none focus:border-amber-400 transition-colors';

  return (
    <AnimatePresence onExitComplete={() => onClose()}>
      {visible && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className={shell}>
          <div className="max-w-xl mx-auto">
            <div className="flex items-center justify-between mb-4">
              <span className="font-mono text-[10px] uppercase tracking-widest text-[#8a8172] dark:text-zinc-400">Offline emergency relay</span>
              <button onClick={() => setVisible(false)} className="w-9 h-9 rounded-full bg-white/80 dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 flex items-center justify-center text-[#5c5446] dark:text-zinc-300 hover:bg-[#ebdcca]/50 transition-all" aria-label="Close">
                <X size={16} />
              </button>
            </div>

            <div className={card}>
              <div className="flex items-center gap-2">
                <span className="w-9 h-9 rounded-full bg-sky-800/10 dark:bg-sky-400/10 flex items-center justify-center">
                  <Satellite className="text-sky-800 dark:text-sky-400" size={17} />
                </span>
                <div className="flex-1">
                  <h2 className="font-display text-lg font-bold text-[#3a342a] dark:text-zinc-100">Offline Emergency Relay</h2>
                  <p className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-400">Queue now · deliver on reconnect · feature 239</p>
                </div>
                {online
                  ? <span className="flex items-center gap-1 font-mono text-[9px] uppercase text-emerald-700 dark:text-emerald-400"><CheckCircle2 size={11} /> online</span>
                  : <span className="flex items-center gap-1 font-mono text-[9px] uppercase text-rose-700 dark:text-rose-400"><WifiOff size={11} /> offline</span>}
              </div>

              <SimulationModeBadge
                title="No satellite hardware — offline queue only"
                detail="Messages are stored on this device and auto-delivered over the internet when the network returns. A real satellite/IoT uplink (e.g. Iridium, Starlink Direct-to-Cell) requires hardware + a paid sat-com provider; this build wires the same relay contract (/api/sat/relay) so a hardware gateway can be dropped in without app changes."
              />

              <div className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 p-3 space-y-2">
                <div className="font-mono text-[9px] uppercase font-bold tracking-wider text-[#5c5446] dark:text-zinc-300"><Send size={11} className="inline" /> Compose emergency message (queued if offline)</div>
                <input className={input} value={to} onChange={e => setTo(e.target.value)} placeholder="Recipient" />
                <textarea className={`${input} min-h-[70px] resize-none`} value={text} onChange={e => setText(e.target.value)} placeholder="Message — queued offline and delivered on reconnect" />
                <button onClick={enqueue} disabled={busy} className={`${btnPrimary} w-full justify-center`}>
                  <Send size={11} /> {online ? 'Queue for relay' : 'Queue offline'}
                </button>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="font-mono text-[9px] uppercase font-bold tracking-wider text-[#8a8172] dark:text-zinc-500">Offline queue ({queue.length})</span>
                  {queue.length > 0 && (
                    <button onClick={flush} disabled={busy} className={btnPrimary}>{busy ? <Loader2 size={11} className="animate-spin" /> : <CloudOff size={11} />} Flush now</button>
                  )}
                </div>
                <div className="space-y-2">
                  {queue.length === 0 && <p className="text-center text-[10px] text-[#8a8172] dark:text-zinc-500 py-3">Queue empty.</p>}
                  {queue.map(m => (
                    <div key={m.id} className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 p-3 bg-white/60 dark:bg-zinc-950/40">
                      <div className="font-mono text-[9px] uppercase text-[#8a8172] dark:text-zinc-500">to {m.toId} · {new Date(m.at).toLocaleTimeString()} · auto-deliver on reconnect</div>
                      <p className="text-[11px] text-[#3a342a] dark:text-zinc-200 mt-1">{m.payload}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <div className="font-mono text-[9px] uppercase font-bold tracking-wider text-[#8a8172] dark:text-zinc-500 mb-2 flex items-center gap-1"><Inbox size={10} /> Relay inbox ({relays.length})</div>
                <div className="space-y-2">
                  {relays.length === 0 && <p className="text-center text-[10px] text-[#8a8172] dark:text-zinc-500 py-3">No relayed messages yet.</p>}
                  {relays.filter(r => r.fromId !== (currentUser?.id || '')).slice(0, 8).map(r => (
                    <div key={r.id} className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 p-3 bg-white/60 dark:bg-zinc-950/40">
                      <div className="flex items-center gap-2">
                        <Satellite size={11} className="text-sky-700 dark:text-sky-400" />
                        <span className="font-mono text-[9px] uppercase text-[#8a8172] dark:text-zinc-500">{r.fromName} · {new Date(r.at).toLocaleTimeString()}</span>
                        <span className="ml-auto font-mono text-[8px] uppercase text-emerald-700 dark:text-emerald-400">{r.status}</span>
                      </div>
                      <p className="text-[11px] text-[#3a342a] dark:text-zinc-200 mt-1">{r.payload}</p>
                    </div>
                  ))}
                </div>
              </div>

              <p className="font-mono text-[8px] uppercase tracking-wide text-[#8a8172] dark:text-zinc-500 leading-relaxed">
                Offline messages are stored on this device and delivered automatically when the network returns — the same relay contract a satellite/IoT gateway would use in production.
              </p>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
