/**
 * Ocean — Mini App Viewer (#253)
 * -------------------------------
 * Runs a registered mini app inside a sandboxed iframe with a postMessage API:
 *   ocean:ready → parent sends ocean:manifest
 *   ocean:pay    → wallet purchase (70/30 split via /api/miniapps/:id/purchase)
 *   ocean:event  → relay to backend event buffer
 *   ocean:storage→ sandboxed localStorage (scoped per app)
 * Optionally mounts Qiankun micro-frontends (qiankun-ready bundles only) via
 * dynamic import — iframes remain the default so any https URL works.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { X, Blocks, Coins, ShieldCheck } from 'lucide-react';
import { toast, authHeaders } from './FeatureShell';

interface MiniApp {
  id: string; name: string; icon: string; bundleUrl: string; developerName: string;
}

async function api<T>(path: string, token: string | null, body?: unknown, method?: string): Promise<T> {
  const res = await fetch(path, { method: method || (body ? 'POST' : 'GET'), headers: authHeaders(token), body: body ? JSON.stringify(body) : undefined });
  if (!res.ok) throw new Error(((await res.json().catch(() => ({}))).error) || 'Request failed');
  return res.json() as Promise<T>;
}

interface RelayEvent { id: number; to: 'parent' | 'app'; type: string; payload: unknown }

export default function MiniAppViewer({ app, token, onClose }: { app: MiniApp; token: string | null; onClose: () => void }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const lastEventRef = useRef(0);
  const [mode, setMode] = useState<'iframe' | 'qiankun'>('iframe');
  const [qkStatus, setQkStatus] = useState<'idle' | 'loading' | 'running' | 'error'>('idle');
  const [balance, setBalance] = useState<number | null>(null);
  const qkAppRef = useRef<{ unmount?: () => void } | null>(null);

  const postToApp = useCallback((msg: unknown) => {
    try { iframeRef.current?.contentWindow?.postMessage(msg, '*'); } catch { /* sandbox */ }
  }, []);

  const purchase = useCallback(async (amount: number, productId?: string | null) => {
    const d = await api<{ ok: boolean; balance: number; developerShare: number; platformCommission: number }>(`/api/miniapps/${app.id}/purchase`, token, { amount, productId });
    setBalance(d.balance);
    toast(`💳 ${amount} coins — ${d.developerShare} to developer · ${d.platformCommission} platform (30% cut)`);
    return d;
  }, [app.id, token]);

  // ── postMessage bridge ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!app) return;
    lastEventRef.current = 0;
    const poll = setInterval(async () => {
      try {
        const d = await api<{ events: RelayEvent[] }>(`/api/miniapps/${app.id}/events?after=${lastEventRef.current}`, token);
        for (const ev of d.events) {
          lastEventRef.current = Math.max(lastEventRef.current, ev.id);
          postToApp({ type: 'ocean:' + ev.type, payload: ev.payload });
        }
      } catch { /* noop */ }
    }, 1500);

    const onMsg = (e: MessageEvent) => {
      const data = e.data as Record<string, unknown> | undefined;
      if (!data || typeof data.type !== 'string') return;
      const type = String(data.type);
      if (type === 'ocean:ready') {
        api<{ manifest: { name: string; permissions: string[] } }>(`/api/miniapps/${app.id}`, token)
          .then((d) => postToApp({ type: 'ocean:manifest', manifest: d.manifest })).catch(() => {});
        return;
      }
      if (type === 'ocean:pay') {
        const amount = Number((data as any).amount) || 0;
        const productId = (data as any).productId || null;
        purchase(amount, productId)
          .then((d) => postToApp({ type: 'ocean:payment', ok: true, balance: d.balance, amount }))
          .catch((err) => postToApp({ type: 'ocean:payment', ok: false, error: err.message }));
        return;
      }
      if (type === 'ocean:event') {
        api(`/api/miniapps/${app.id}/events`, token, { to: 'parent', type: (data as any).event || 'event', payload: (data as any).payload ?? null }).catch(() => {});
        return;
      }
      if (type === 'ocean:storage' && (data as any).op) {
        const key = `miniapp:${app.id}:${(data as any).key || 'default'}`;
        if ((data as any).op === 'get') postToApp({ type: 'ocean:storage', op: 'get', key: (data as any).key, value: localStorage.getItem(key) });
        if ((data as any).op === 'set') { localStorage.setItem(key, String((data as any).value || '')); postToApp({ type: 'ocean:storage', op: 'set', key: (data as any).key, ok: true }); }
      }
    };
    window.addEventListener('message', onMsg);
    return () => { clearInterval(poll); window.removeEventListener('message', onMsg); qkAppRef.current?.unmount?.(); qkAppRef.current = null; };
  }, [app.id, token, postToApp, purchase]);

  // ── Qiankun micro-frontend (optional) ───────────────────────────────────────
  const launchQiankun = async () => {
    if (qkStatus !== 'idle') return;
    setQkStatus('loading');
    try {
      const qiankun = await import('qiankun');
      qkAppRef.current = qiankun.loadMicroApp({
        name: `miniapp-${app.id}`,
        entry: app.bundleUrl,
        container: '#ocean-qk-container',
        props: {
          ocean: {
            pay: (amount: number, productId?: string) => purchase(amount, productId).catch(() => ({ ok: false })),
            event: (type: string, payload?: unknown) => api(`/api/miniapps/${app.id}/events`, token, { to: 'parent', type, payload: payload ?? null }).catch(() => {}),
            getToken: () => token,
          },
        },
      });
      setQkStatus('running');
      toast('🚀 Qiankun micro-app mounted');
    } catch (e: any) {
      setQkStatus('error');
      toast(`⛔ Qiankun launch failed (bundle must expose mount/unmount): ${e?.message || e}`);
    }
  };

  if (!app) return null;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="fixed inset-0 z-[130] bg-black/95 flex flex-col">
      <div className="flex items-center gap-2 px-4 py-2 border-b border-zinc-800">
        <span className="text-lg">{app.icon}</span>
        <p className="text-white text-[12px] font-bold flex-1 truncate">{app.name} <span className="text-[8px] text-zinc-500 font-mono">by {app.developerName}</span></p>
        {balance !== null && (
          <span className="flex items-center gap-1 rounded-lg bg-amber-900/40 px-2 py-1 text-[9px] font-bold text-amber-300"><Coins size={10} /> {balance.toLocaleString()}</span>
        )}
        <div className="flex rounded-lg overflow-hidden border border-zinc-700">
          <button onClick={() => { setMode('iframe'); setQkStatus('idle'); }} className={`px-2 py-1 text-[8px] font-bold ${mode === 'iframe' ? 'bg-indigo-600 text-white' : 'text-zinc-400'}`}>iframe</button>
          <button onClick={() => { setMode('qiankun'); launchQiankun(); }} className={`px-2 py-1 text-[8px] font-bold ${mode === 'qiankun' ? 'bg-indigo-600 text-white' : 'text-zinc-400'}`}>qiankun</button>
        </div>
        <button onClick={onClose} className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-300 hover:bg-zinc-700"><X size={14} /></button>
      </div>

      {mode === 'qiankun' ? (
        <div className="flex-1 w-full bg-white relative overflow-hidden">
          <div id="ocean-qk-container" className="absolute inset-0" />
          {qkStatus !== 'running' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-zinc-950 text-zinc-400 text-[10px]">
              <Blocks size={20} className="text-indigo-400" />
              {qkStatus === 'loading' ? 'Mounting Qiankun micro-app…' : qkStatus === 'error' ? 'Qiankun failed — switch to iframe mode.' : 'Qiankun micro-frontend mode'}
              {qkStatus === 'idle' && <button onClick={launchQiankun} className="rounded-lg bg-indigo-600 text-white px-3 py-1.5 text-[10px] font-bold">Mount micro-app</button>}
            </div>
          )}
        </div>
      ) : (
        <iframe
          ref={iframeRef} src={app.bundleUrl}
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
          className="flex-1 w-full bg-white"
          title={app.name}
        />
      )}
      <div className="px-4 py-2 text-[8px] text-zinc-500 flex items-center gap-1.5">
        <ShieldCheck size={10} className="text-emerald-500" />
        Sandboxed iframe + window.postMessage: ocean:ready · ocean:pay · ocean:event · ocean:storage. Purchases are relayed through your coin wallet (30% platform commission).
      </div>
    </motion.div>
  );
}
