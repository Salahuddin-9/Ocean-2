import { useCallback, useEffect, useState } from 'react';
import { BrainCircuit, BarChart3, Database, Zap, Trash2, Download, Eye, MousePointerClick, ThumbsUp, Share2, FileSpreadsheet } from 'lucide-react';
import FeatureShell, { toast, authHeaders } from './FeatureShell';
import MetabaseEmbed from './MetabaseEmbed';

interface Props {
  token: string | null;
  currentUser: { id: string; name: string } | null;
  onClose: () => void;
}

interface BrainEvent { id: number; type: string; itemId?: string; itemType?: string; at: number }
interface Stats { total: number; byType: Record<string, number>; days: { day: string; count: number }[]; topItems: { item: string; count: number }[] }
interface CreatorAnalytics { creatorId: string; posts: number; totalLikes: number; totalComments: number; storyViews: number; storyReactions: number; tips: number; gifts: number; engagementPerPost: number; walletBalance: number; perPost: { id: string; content: string; likes: number; comments: number }[] }
interface WarehouseExport { id: string; file: string; size: number; at: number }

async function api<T>(path: string, token: string | null, body?: unknown, method?: string): Promise<T> {
  const res = await fetch(path, { method: method || (body ? 'POST' : 'GET'), headers: authHeaders(token), body: body ? JSON.stringify(body) : undefined });
  if (!res.ok) throw new Error(((await res.json().catch(() => ({}))).error) || 'Request failed');
  return res.json() as Promise<T>;
}

const LOG_TYPES = ['view', 'reaction', 'impression', 'click', 'share', 'story_view'];

export default function DataBrain({ token, currentUser, onClose }: Props) {
  const [tab, setTab] = useState<'obs' | 'creator' | 'export'>('obs');
  const [events, setEvents] = useState<BrainEvent[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [analytics, setAnalytics] = useState<CreatorAnalytics | null>(null);
  const [creatorId, setCreatorId] = useState(currentUser?.id || '');
  const [warehouse, setWarehouse] = useState<WarehouseExport[]>([]);
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    try {
      const [ev, st] = await Promise.all([
        api<{ events: BrainEvent[] }>('/api/data/brain/events?limit=30', token),
        api<{ total: number; byType: Record<string, number>; days: { day: string; count: number }[]; topItems: { item: string; count: number }[] }>('/api/data/brain/stats', token),
      ]);
      setEvents(ev.events); setStats(st);
    } catch { /* offline */ }
  }, [token]);

  const loadAnalytics = useCallback(async () => {
    try { setAnalytics(await api<CreatorAnalytics>(`/api/analytics/creators?userId=${creatorId}`, token)); } catch { /* noop */ }
  }, [creatorId, token]);

  const loadWarehouse = useCallback(async () => {
    try { setWarehouse((await api<{ exports: WarehouseExport[] }>('/api/data/warehouse', token)).exports); } catch { /* noop */ }
  }, [token]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadAnalytics(); }, [loadAnalytics]);
  useEffect(() => { loadWarehouse(); }, [loadWarehouse]);

  const logEvent = async (type: string) => {
    try {
      const itemId = `post-${Date.now()}`;
      await api('/api/data/brain/events', token, { type, itemId, itemType: 'post', meta: { source: 'databrain-demo', timeOnScreen: Math.floor(Math.random() * 30000) } });
      toast(`📡 ${type} event logged (${itemId})`);
      load();
    } catch (e: any) { toast(`⛔ ${e.message}`); }
  };

  const doExport = async () => {
    setExporting(true);
    try {
      const res = await fetch('/api/data/export', { method: 'POST', headers: authHeaders(token) });
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `ocean-export-${Date.now()}.json`;
      a.click();
      toast('✅ Export downloaded + stored in the warehouse');
      loadWarehouse();
    } catch (e: any) { toast(`⛔ ${e.message}`); }
    setExporting(false);
  };

  const maxDay = Math.max(1, ...(stats?.days.map((d) => d.count) || [1]));
  const byType = (stats?.byType || {}) as Record<string, number>;
  const maxType = Object.values(byType).reduce((a, b) => Math.max(a, b), 1);

  const exportCsv = () => {
    const rows: string[][] = [['section', 'key', 'value']];
    if (stats) {
      rows.push(['events', 'total', String(stats.total)]);
      Object.entries(stats.byType).forEach(([k, v]) => rows.push(['events', `type_${k}`, String(v)]));
      stats.days.forEach((d) => rows.push(['events', `day_${d.day}`, String(d.count)]));
    }
    if (analytics) {
      [['posts', analytics.posts], ['likes', analytics.totalLikes], ['comments', analytics.totalComments], ['story_views', analytics.storyViews], ['story_reactions', analytics.storyReactions], ['tips', analytics.tips], ['gifts', analytics.gifts], ['engagement_per_post', analytics.engagementPerPost], ['wallet_balance', analytics.walletBalance]].forEach(([k, v]) => rows.push(['creator', k, String(v)]));
      analytics.perPost.forEach((p) => rows.push(['post', p.id, `${p.likes}:${p.comments}`]));
    }
    if (rows.length === 1) return toast('⛔ Nothing to export yet');
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `ocean-analytics-${Date.now()}.csv`;
    a.click();
    toast('📄 CSV exported — open in Excel/Sheets');
  };

  const tabs = [
    ['obs', 'Observability', <Zap key="z" size={11} />],
    ['creator', 'Creator Analytics', <BarChart3 key="b" size={11} />],
    ['export', 'Warehouse', <Database key="d" size={11} />],
  ] as const;

  return (
    <FeatureShell title="Ocean Data + AI Brain" badge="260 · observability" icon={<BrainCircuit size={18} className="text-cyan-700 dark:text-cyan-400" />} onClose={onClose}>
      <div className="flex items-center gap-1.5 mb-3">
        {tabs.map(([id, label, icon]) => (
          <button key={id} onClick={() => setTab(id)}
            className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[10px] font-bold transition-all ${tab === id ? 'bg-cyan-600 text-white' : 'bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 text-[#8a8172]'}`}>
            {icon} {label}
          </button>
        ))}
        <button onClick={() => { api('/api/data/brain/events', token, undefined, 'DELETE').then(() => { toast('🧹 Events cleared'); load(); }); }}
          className="ml-auto flex items-center gap-1 rounded-lg border border-[#ebdcca] dark:border-zinc-700 px-2.5 py-1.5 text-[9px] font-bold text-rose-500 hover:border-rose-400">
          <Trash2 size={10} /> Clear my events
        </button>
      </div>

      {tab === 'obs' && (
        <div className="grid md:grid-cols-2 gap-3">
          <div className="space-y-3">
            <div className="bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-2xl p-3">
              <p className="font-mono text-[9px] font-bold uppercase tracking-wider text-[#8a8172] mb-2 flex items-center gap-1"><Zap size={11} /> Live event sink</p>
              <div className="grid grid-cols-3 gap-1.5">
                {LOG_TYPES.map((t) => (
                  <button key={t} onClick={() => logEvent(t)}
                    className="flex items-center justify-center gap-1 rounded-lg border border-[#ebdcca] dark:border-zinc-700 py-2 text-[9px] font-bold text-[#8a8172] hover:border-cyan-400 hover:bg-cyan-50 dark:hover:bg-cyan-900/10 transition-all">
                    {t === 'view' ? <Eye size={10} /> : t === 'click' ? <MousePointerClick size={10} /> : t === 'reaction' ? <ThumbsUp size={10} /> : t === 'share' ? <Share2 size={10} /> : <Zap size={10} />} {t}
                  </button>
                ))}
              </div>
              <p className="text-[8px] text-[#8a8172] mt-1.5">These are the same events the ranking pipeline logs — feed them into your experiments (#259) for A/B metrics.</p>
            </div>

            <div className="bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-2xl p-3">
              <p className="font-mono text-[9px] font-bold uppercase tracking-wider text-[#8a8172] mb-2">Last 7 days</p>
              <div className="flex items-end gap-1 h-20">
                {stats?.days.map((d) => (
                  <div key={d.day} className="flex-1 flex flex-col items-center gap-0.5">
                    <div className="w-full rounded-t bg-gradient-to-t from-cyan-600 to-cyan-400 transition-all" style={{ height: `${Math.max(4, (d.count / maxDay) * 64)}px` }} />
                    <span className="text-[7px] font-mono text-[#8a8172]">{d.day.slice(5)}</span>
                  </div>
                ))}
              </div>
              <p className="text-[9px] text-[#8a8172] mt-1.5">{stats?.total ?? 0} total events · top: {stats?.topItems[0]?.item || '—'} ({stats?.topItems[0]?.count || 0})</p>
            </div>
          </div>

          <div className="space-y-3">
            <div className="bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-2xl p-3">
              <p className="font-mono text-[9px] font-bold uppercase tracking-wider text-[#8a8172] mb-2">By type</p>
              {Object.entries(byType).map(([type, count]) => (
                <div key={type} className="flex items-center gap-2 py-1">
                  <span className="text-[9px] font-mono text-[#8a8172] w-20">{type}</span>
                  <div className="flex-1 h-2.5 rounded-full bg-zinc-200 dark:bg-zinc-700 overflow-hidden">
                    <div className="h-full bg-cyan-500 rounded-full" style={{ width: `${(count / maxType) * 100}%` }} />
                  </div>
                  <span className="text-[9px] font-mono text-[#3a342a] dark:text-zinc-200 w-8 text-right">{count}</span>
                </div>
              ))}
              {Object.keys(stats?.byType || {}).length === 0 && <p className="text-[9px] text-[#8a8172] italic">No events yet.</p>}
            </div>

            <div className="bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-2xl p-3">
              <p className="font-mono text-[9px] font-bold uppercase tracking-wider text-[#8a8172] mb-2">Recent events</p>
              <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
                {events.map((e) => (
                  <div key={e.id} className="flex items-center gap-2 py-1 border-b border-[#ebdcca]/50 dark:border-zinc-800 last:border-0">
                    <span className="text-[8px] font-mono bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300 rounded px-1.5 py-0.5">{e.type}</span>
                    <span className="text-[9px] text-[#8a8172] flex-1 truncate">{e.itemType}:{e.itemId}</span>
                    <span className="text-[8px] font-mono text-[#8a8172]">{new Date(e.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                  </div>
                ))}
                {events.length === 0 && <p className="text-[9px] text-[#8a8172] italic">No events — click a sink button to generate real observability data.</p>}
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === 'creator' && (
        <div className="space-y-3">
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] text-[#8a8172] font-bold">Creator:</span>
            <input value={creatorId} onChange={(e) => setCreatorId(e.target.value)} className="rounded-lg border border-[#ebdcca] dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2.5 py-1.5 text-[10px] font-mono outline-none w-48" />
            <button onClick={loadAnalytics} className="rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-[10px] font-bold px-3 py-1.5">Analyze</button>
            <button onClick={exportCsv} className="flex items-center gap-1 rounded-lg border border-[#ebdcca] dark:border-zinc-700 px-2.5 py-1.5 text-[9px] font-bold text-[#8a8172] hover:border-cyan-400">
              <FileSpreadsheet size={10} /> CSV
            </button>
          </div>
          <MetabaseEmbed
            dashboardId={2}
            token={token}
            title="Creator analytics 2.0 (Metabase)"
            fallback={analytics ? (
              <div className="rounded-xl bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 p-2.5">
                <p className="text-[9px] text-[#8a8172] mb-1.5">Live engagement snapshot (no Metabase configured)</p>
                <div className="grid grid-cols-4 gap-1.5">
                  {[['Posts', analytics.posts, 'bg-cyan-500'], ['Likes', analytics.totalLikes, 'bg-rose-500'], ['Views', analytics.storyViews, 'bg-amber-500'], ['Gifts', analytics.gifts, 'bg-violet-500']].map(([label, val, cls]) => (
                    <div key={String(label)} className="text-center rounded-lg border border-[#ebdcca] dark:border-zinc-700 p-2">
                      <div className={`mx-auto w-2 h-2 rounded-full ${cls} mb-1`} />
                      <p className="text-[10px] font-bold text-[#3a342a] dark:text-zinc-100">{Number(val).toLocaleString()}</p>
                      <p className="text-[7px] uppercase font-mono text-[#8a8172]">{label}</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : undefined}
          />
          {analytics && (
            <>
              <div className="grid grid-cols-4 gap-1.5">
                {[['Posts', analytics.posts], ['Likes', analytics.totalLikes], ['Comments', analytics.totalComments], ['Story views', analytics.storyViews], ['Story reacts', analytics.storyReactions], ['Tips 🪙', analytics.tips], ['Gifts 🎁', analytics.gifts], ['Engagement/post', analytics.engagementPerPost]].map(([label, val]) => (
                  <div key={String(label)} className="bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-2xl p-2.5 text-center">
                    <p className="text-[8px] uppercase tracking-wider font-mono text-[#8a8172]">{label}</p>
                    <p className="text-sm font-bold text-[#3a342a] dark:text-zinc-100 mt-0.5">{Number(val).toLocaleString()}</p>
                  </div>
                ))}
              </div>
              <div className="grid md:grid-cols-2 gap-3">
                <div className="bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-2xl p-3">
                  <p className="font-mono text-[9px] font-bold uppercase tracking-wider text-[#8a8172] mb-2">Per-post performance (last {analytics.perPost.length})</p>
                  <div className="space-y-1.5">
                    {analytics.perPost.map((p) => (
                      <div key={p.id}>
                        <p className="text-[8px] text-[#8a8172] truncate">{p.content || p.id}</p>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 rounded-full bg-zinc-200 dark:bg-zinc-700 overflow-hidden">
                            <div className="h-full bg-cyan-500" style={{ width: `${Math.min(100, (p.likes / Math.max(1, ...analytics.perPost.map((x) => x.likes))) * 100)}%` }} />
                          </div>
                          <span className="text-[8px] font-mono text-[#8a8172]">❤️{p.likes} 💬{p.comments}</span>
                        </div>
                      </div>
                    ))}
                    {analytics.perPost.length === 0 && <p className="text-[9px] text-[#8a8172] italic">No posts.</p>}
                  </div>
                </div>
                <div className="bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-2xl p-3">
                  <p className="font-mono text-[9px] font-bold uppercase tracking-wider text-[#8a8172] mb-2">Snapshot</p>
                  <p className="text-[10px] text-[#8a8172] leading-relaxed">Wallet balance: <b className="text-[#3a342a] dark:text-zinc-100">{analytics.walletBalance.toLocaleString()} 🪙</b></p>
                  <p className="text-[10px] text-[#8a8172] mt-1 leading-relaxed">Engagement is computed live from database.json posts (likes + comments), stories.json views/reactions, community.json tips and liveeco.json gifts — no simulated numbers.</p>
                  <div className="mt-2 rounded-xl bg-cyan-50 dark:bg-cyan-900/10 border border-cyan-200 dark:border-cyan-800 p-2.5">
                    <p className="text-[9px] text-cyan-800 dark:text-cyan-300">💡 Pair with #255 (Creator Monetization) for the revenue side and #259 (OS Layer) for experiment-based growth tests.</p>
                  </div>
                </div>
              </div>
            </>
          )}
          {!analytics && <p className="text-[10px] text-[#8a8172] italic">Analyze a creator to see deep metrics.</p>}
        </div>
      )}

      {tab === 'export' && (
        <div className="grid md:grid-cols-2 gap-3">
          <div className="bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-2xl p-3">
            <p className="font-mono text-[9px] font-bold uppercase tracking-wider text-[#8a8172] mb-2">Data warehouse export</p>
            <p className="text-[9px] text-[#8a8172] mb-2">Packages your profile, wallet, interaction events, posts and stories into a single JSON file (also stored in the warehouse).</p>
            <button onClick={doExport} disabled={exporting}
              className="w-full flex items-center justify-center gap-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-[11px] font-bold uppercase tracking-wider py-2.5 transition-all disabled:opacity-40">
              <Download size={13} /> {exporting ? 'Packaging…' : 'Export my data (JSON)'}
            </button>
            <button onClick={exportCsv}
              className="mt-1.5 w-full flex items-center justify-center gap-1.5 rounded-xl border border-cyan-300 dark:border-cyan-800 text-cyan-700 dark:text-cyan-300 text-[10px] font-bold py-2 transition-all hover:border-cyan-400">
              <FileSpreadsheet size={12} /> Export analytics as CSV
            </button>
          </div>
          <div className="bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-2xl p-3">
            <p className="font-mono text-[9px] font-bold uppercase tracking-wider text-[#8a8172] mb-2 flex items-center gap-1"><Database size={11} /> Warehouse ({warehouse.length})</p>
            {warehouse.map((w) => (
              <div key={w.id} className="flex items-center gap-2 py-1.5 border-b border-[#ebdcca]/60 dark:border-zinc-800 last:border-0">
                <Database size={11} className="text-[#8a8172]" />
                <span className="text-[10px] font-mono text-[#3a342a] dark:text-zinc-200 flex-1 truncate">{w.file}</span>
                <span className="text-[8px] text-[#8a8172]">{(w.size / 1024).toFixed(1)} KB</span>
                <span className="text-[8px] font-mono text-[#8a8172]">{new Date(w.at).toLocaleDateString()}</span>
              </div>
            ))}
            {warehouse.length === 0 && <p className="text-[9px] text-[#8a8172] italic">No exports yet.</p>}
          </div>
        </div>
      )}
    </FeatureShell>
  );
}
