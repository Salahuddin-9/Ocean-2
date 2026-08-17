/**
 * Ocean — Metabase embed (features #255 / #260)
 * ----------------------------------------------
 * Embeds Metabase dashboards two ways:
 *   1. signedUrl — the Metabase Embedding SDK (`@metabase/embedding-sdk-react`)
 *      with an InteractiveDashboard, when VITE_METABASE_SDK=1 and a server-minted
 *      signed URL is available;
 *   2. classic iframe — `{site}/embed/dashboard/{token}` from /api/metabase/token.
 * When Metabase isn't configured (no METABASE_SITE_URL/SECRET_KEY), renders the
 * `fallback` custom chart so the app never breaks.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { BarChart3, ExternalLink, Loader2, Settings2 } from 'lucide-react';
import { toast, authHeaders } from './FeatureShell';

interface Props {
  dashboardId: number;
  token: string | null;
  title?: string;
  fallback?: ReactNode;
}

type Phase = 'loading' | 'ready' | 'unconfigured' | 'error';

export default function MetabaseEmbed({ dashboardId, token, title, fallback }: Props) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [embedUrl, setEmbedUrl] = useState('');
  const [site, setSite] = useState(() => localStorage.getItem('ocean.metabase.url') || (import.meta as any).env?.VITE_METABASE_SITE_URL || '');
  const [sdk, setSdk] = useState<'off' | 'on' | 'failed'>('off');
  const [sdkEl, setSdkEl] = useState<ReactNode>(null);

  useEffect(() => {
    if (!site.trim()) { setPhase('unconfigured'); return; }
    let live = true;
    (async () => {
      try {
        const res = await fetch(`/api/metabase/token?dashboard=${dashboardId}`, { headers: authHeaders(token) });
        const d = await res.json();
        if (!res.ok || !d.embedUrl) { if (live) setPhase('error'); return; }
        if (live) { setEmbedUrl(d.embedUrl); setPhase('ready'); }
      } catch { if (live) setPhase('error'); }
    })();
    return () => { live = false; };
  }, [site, dashboardId, token]);

  // ── Metabase Embedding SDK (optional, opt-in) ──────────────────────────────
  const enableSdk = async () => {
    setSdk('on');
    try {
      const { MetabaseProvider, InteractiveDashboard } = await import('@metabase/embedding-sdk-react');
      const authConfig: any = {
        authType: 'signedUrl' as const,
        getSignedUrl: async ({ resource }: any) => {
          const id = resource?.dashboard || dashboardId;
          const res = await fetch(`/api/metabase/token?dashboard=${id}`, { headers: authHeaders(token) });
          const d = await res.json();
          return d.embedUrl?.split('#')[0] || '';
        },
      };
      setSdkEl(
        <MetabaseProvider authConfig={authConfig} theme={{}}>
          <InteractiveDashboard dashboardId={dashboardId} />
        </MetabaseProvider>
      );
    } catch (e: any) {
      setSdk('failed');
      toast(`⛔ Metabase SDK failed (${e?.message || e}) — using iframe embed`);
    }
  };

  const saveSite = () => {
    localStorage.setItem('ocean.metabase.url', site.trim());
    setPhase('loading');
    toast('💾 Metabase URL saved');
  };

  return (
    <div className="bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-2xl p-3">
      <div className="flex items-center gap-2 mb-2">
        <BarChart3 size={13} className="text-amber-600 dark:text-amber-400" />
        <p className="text-[11px] font-bold text-[#3a342a] dark:text-zinc-100 flex-1 truncate">{title || `Metabase dashboard #${dashboardId}`}</p>
        {phase === 'ready' && (
          <>
            <a href={embedUrl} target="_blank" rel="noreferrer" className="text-[8px] text-[#8a8172] flex items-center gap-0.5 hover:text-amber-600"><ExternalLink size={9} />open</a>
            <button onClick={sdk === 'off' ? enableSdk : () => setSdk('off')} className={`text-[8px] rounded-lg px-2 py-0.5 font-bold transition-all ${sdk === 'on' ? 'bg-amber-600 text-white' : 'border border-[#ebdcca] dark:border-zinc-700 text-[#8a8172]'}`}>
              {sdk === 'on' ? 'SDK on' : sdk === 'failed' ? 'SDK failed' : 'Embedding SDK'}
            </button>
          </>
        )}
      </div>

      {phase === 'unconfigured' && (
        <div>
          {fallback}
          <div className="mt-2 rounded-xl bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800/60 p-2.5">
            <p className="text-[9px] text-amber-800 dark:text-amber-300 font-bold">📊 Connect Metabase to see live dashboards</p>
            <p className="text-[8px] text-[#8a8172] mt-1 leading-relaxed">Set <b>METABASE_SITE_URL</b> + <b>METABASE_SECRET_KEY</b> on the server (Admin → Embedding → JWT) and paste your site URL below — dashboards render inside the app.</p>
            <div className="flex gap-1.5 mt-1.5">
              <input value={site} onChange={(e) => setSite(e.target.value)} placeholder="https://analytics.yourco.com" className="flex-1 rounded-lg border border-[#ebdcca] dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2 py-1.5 text-[10px] outline-none" />
              <button onClick={saveSite} className="rounded-lg bg-amber-600 hover:bg-amber-500 text-white px-2.5 text-[10px] font-bold flex items-center gap-1"><Settings2 size={10} /> Save</button>
            </div>
          </div>
        </div>
      )}

      {phase === 'loading' && (
        <div className="h-40 flex flex-col items-center justify-center gap-2 text-[10px] text-[#8a8172]">
          <Loader2 size={18} className="animate-spin text-amber-500" /> Signing Metabase embed token…
        </div>
      )}

      {phase === 'error' && (
        <div className="h-32 flex flex-col items-center justify-center gap-2 text-[10px] text-[#8a8172]">
          <p>⚠️ Could not reach the Metabase instance.</p>
          <button onClick={() => { localStorage.removeItem('ocean.metabase.url'); setSite(''); setPhase('unconfigured'); }} className="text-[9px] text-amber-600 font-bold">Reset Metabase URL</button>
        </div>
      )}

      {phase === 'ready' && sdk !== 'on' && (
        <iframe src={embedUrl} title={title || `metabase-${dashboardId}`} className="w-full h-72 rounded-xl border border-[#ebdcca] dark:border-zinc-700 bg-white" allow="fullscreen" />
      )}
      {phase === 'ready' && sdk === 'on' && (
        <div className="rounded-xl overflow-hidden border border-[#ebdcca] dark:border-zinc-700 bg-white min-h-72">{sdkEl}</div>
      )}
    </div>
  );
}
