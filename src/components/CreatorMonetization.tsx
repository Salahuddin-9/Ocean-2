import { useCallback, useEffect, useState } from 'react';
import { Wallet, Handshake, Link2, Users, Crown, Plus, Coins, CheckCircle2, TrendingUp, Copy } from 'lucide-react';
import FeatureShell, { toast, authHeaders } from './FeatureShell';
import MetabaseEmbed from './MetabaseEmbed';

interface Props {
  token: string | null;
  currentUser: { id: string; name: string } | null;
  onClose: () => void;
}

interface Dashboard { earnings: Record<string, number>; walletBalance: number; fans: { unique: number; notes: number; tierSubscribers: number }; recentTransactions: { id: string; source: string; amount: number; note?: string; at: number }[] }
interface Deal { id: string; brandId: string; brandName: string; title: string; description: string; budget: number; niche: string; status: string; applicants: { id: string; name: string; at: number }[]; applied?: boolean }
interface AffLink { id: string; label: string; code: string; clicks: number; conversions: number; revenue: number }
interface Fan { id: string; fanId: string; fanName: string; note: string; tier: string }
interface Tier { id: string; creatorId: string; name: string; price: number; perks: string[]; subscribers: string[] }

async function api<T>(path: string, token: string | null, body?: unknown, method?: string): Promise<T> {
  const res = await fetch(path, { method: method || (body ? 'POST' : 'GET'), headers: authHeaders(token), body: body ? JSON.stringify(body) : undefined });
  if (!res.ok) throw new Error(((await res.json().catch(() => ({}))).error) || 'Request failed');
  return res.json() as Promise<T>;
}

export default function CreatorMonetization({ token, currentUser, onClose }: Props) {
  const [tab, setTab] = useState<'dash' | 'deals' | 'aff' | 'fans' | 'tiers'>('dash');
  const [dash, setDash] = useState<Dashboard | null>(null);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [myDeals, setMyDeals] = useState<Deal[]>([]);
  const [aff, setAff] = useState<AffLink[]>([]);
  const [fans, setFans] = useState<Fan[]>([]);
  const [tiers, setTiers] = useState<{ mine: Tier[]; others: Tier[] }>({ mine: [], others: [] });
  const [dealForm, setDealForm] = useState({ title: '', description: '', budget: 500, niche: 'general' });
  const [affLabel, setAffLabel] = useState('');
  const [fanForm, setFanForm] = useState({ fanId: '', note: '', tier: 'fan' });
  const [tierForm, setTierForm] = useState({ name: '', price: 50, perks: '' });

  const load = useCallback(async () => {
    try {
      const [d, dl, m, a, f, t] = await Promise.all([
        api<Dashboard>('/api/creator/dashboard', token),
        api<{ deals: Deal[] }>('/api/creator/deals', token),
        api<{ deals: Deal[] }>('/api/creator/deals/mine', token),
        api<{ links: AffLink[] }>('/api/creator/affiliate', token),
        api<{ fans: Fan[] }>('/api/creator/fans', token),
        api<{ mine: Tier[]; others: Tier[] }>('/api/creator/tiers', token),
      ]);
      setDash(d); setDeals(dl.deals); setMyDeals(m.deals); setAff(a.links); setFans(f.fans); setTiers(t);
    } catch { /* offline */ }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const act = async (path: string, body: unknown, okMsg: string) => {
    try { await api(path, token, body); toast(okMsg); load(); }
    catch (e: any) { toast(`⛔ ${e.message}`); }
  };

  const earn = dash?.earnings || {};
  const total = earn.total || 0;

  const tabs = [
    ['dash', 'Dashboard', <TrendingUp key="d" size={11} />],
    ['deals', 'Deals', <Handshake key="m" size={11} />],
    ['aff', 'Affiliate', <Link2 key="a" size={11} />],
    ['fans', 'Fan CRM', <Users key="f" size={11} />],
    ['tiers', 'Tiers', <Crown key="t" size={11} />],
  ] as const;

  return (
    <FeatureShell title="Creator Monetization Engine" badge="255 · revenue" icon={<Wallet size={18} className="text-amber-700 dark:text-amber-400" />} onClose={onClose}>
      <div className="flex items-center gap-1.5 mb-3 flex-wrap">
        {tabs.map(([id, label, icon]) => (
          <button key={id} onClick={() => setTab(id)}
            className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[10px] font-bold transition-all ${tab === id ? 'bg-amber-600 text-white' : 'bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 text-[#8a8172]'}`}>
            {icon} {label}
          </button>
        ))}
        <span className="ml-auto flex items-center gap-1 rounded-lg bg-amber-100 dark:bg-amber-900/30 px-2.5 py-1.5 text-[10px] font-bold text-amber-800 dark:text-amber-300">
          <Coins size={11} /> {dash?.walletBalance?.toLocaleString() ?? '…'}
        </span>
      </div>

      {tab === 'dash' && (
        <>
          <MetabaseEmbed
            dashboardId={1}
            token={token}
            title="Revenue dashboard (Metabase)"
            fallback={(
              <div className="rounded-xl bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 p-2.5">
                <p className="text-[9px] text-[#8a8172] mb-1.5">Custom revenue mix (live wallet data)</p>
                <div className="flex items-end gap-1.5 h-20">
                  {[['Tips', earn.tips || 0, 'bg-emerald-500'], ['Gifts', earn.gifts || 0, 'bg-rose-500'], ['Affiliate', earn.affiliate || 0, 'bg-sky-500'], ['Deals', earn.deals || 0, 'bg-amber-500'], ['Subs', earn.subscriptions || 0, 'bg-violet-500']].map(([label, val, cls]) => {
                    const v = Number(val);
                    return (
                      <div key={String(label)} className="flex-1 flex flex-col items-center gap-1">
                        <div className={`w-full rounded-t ${cls} transition-all`} style={{ height: `${total ? Math.max(4, (v / total) * 64) : 4}px` }} />
                        <span className="text-[7px] font-mono text-[#8a8172] truncate">{label}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          />
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5 mb-3">
            {[['Tips', earn.tips || 0], ['Gifts', earn.gifts || 0], ['Affiliate', earn.affiliate || 0], ['Deals', earn.deals || 0], ['Subs', earn.subscriptions || 0], ['Total', total]].map(([label, val]) => (
              <div key={String(label)} className="bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-2xl p-2.5 text-center">
                <p className="text-[8px] uppercase tracking-wider font-mono text-[#8a8172]">{label}</p>
                <p className="text-sm font-bold text-[#3a342a] dark:text-zinc-100 mt-0.5">{Number(val).toLocaleString()} 🪙</p>
              </div>
            ))}
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-2xl p-3">
              <p className="font-mono text-[9px] font-bold uppercase tracking-wider text-[#8a8172] mb-2">Audience</p>
              <p className="text-[12px] font-bold text-[#3a342a] dark:text-zinc-100">{dash?.fans.unique || 0} unique fans</p>
              <p className="text-[10px] text-[#8a8172] mt-1">{dash?.fans.notes || 0} CRM notes · {dash?.fans.tierSubscribers || 0} tier subscribers</p>
              <p className="text-[8px] text-[#8a8172] mt-2">Aggregated live from tips (community.json), gifts (#252 liveeco.json), deal payments, affiliate revenue and tier subscriptions.</p>
            </div>
            <div className="bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-2xl p-3">
              <p className="font-mono text-[9px] font-bold uppercase tracking-wider text-[#8a8172] mb-2">Recent income</p>
              {(dash?.recentTransactions || []).length === 0 && <p className="text-[10px] text-[#8a8172] italic">No income yet — get tipped, gift a live stream, or land a brand deal.</p>}
              {(dash?.recentTransactions || []).map((t) => (
                <div key={t.id} className="flex items-center gap-2 py-1.5 border-b border-[#ebdcca]/60 dark:border-zinc-800 last:border-0">
                  <span className="text-[11px] text-[#3a342a] dark:text-zinc-200 flex-1 truncate">{t.note || t.source}</span>
                  <span className="text-[9px] font-mono text-[#8a8172] uppercase">{t.source}</span>
                  <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">+{t.amount}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {tab === 'deals' && (
        <div className="grid md:grid-cols-2 gap-3">
          <div>
            <div className="bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-2xl p-3 mb-3">
              <p className="font-mono text-[9px] font-bold uppercase tracking-wider text-[#8a8172] mb-2">Post a brand deal</p>
              <input value={dealForm.title} onChange={(e) => setDealForm({ ...dealForm, title: e.target.value })} placeholder="Deal title (e.g. 30s promo for Chai Cafe)" className="w-full rounded-lg border border-[#ebdcca] dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2.5 py-1.5 text-[11px] outline-none mb-1.5" />
              <input value={dealForm.description} onChange={(e) => setDealForm({ ...dealForm, description: e.target.value })} placeholder="What creators should do…" className="w-full rounded-lg border border-[#ebdcca] dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2.5 py-1.5 text-[11px] outline-none mb-1.5" />
              <div className="flex gap-1.5">
                <input type="number" min={10} value={dealForm.budget} onChange={(e) => setDealForm({ ...dealForm, budget: Number(e.target.value) })} className="w-28 rounded-lg border border-[#ebdcca] dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2.5 py-1.5 text-[11px] outline-none" />
                <select value={dealForm.niche} onChange={(e) => setDealForm({ ...dealForm, niche: e.target.value })} className="flex-1 rounded-lg border border-[#ebdcca] dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2.5 py-1.5 text-[11px] outline-none">
                  {['general', 'food', 'tech', 'fashion', 'travel', 'fitness', 'gaming'].map((n) => <option key={n}>{n}</option>)}
                </select>
                <button onClick={() => { if (dealForm.title.trim()) { act('/api/creator/deals', dealForm, '📢 Deal posted!'); setDealForm({ title: '', description: '', budget: 500, niche: 'general' }); } }} className="rounded-lg bg-amber-600 hover:bg-amber-500 text-white px-3 text-[10px] font-bold"><Plus size={12} /></button>
              </div>
            </div>
            <p className="font-mono text-[9px] font-bold uppercase tracking-wider text-[#8a8172] mb-1.5">My deals (brand view)</p>
            <div className="space-y-1.5">
              {myDeals.map((d) => (
                <div key={d.id} className="bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-2xl p-2.5">
                  <p className="text-[11px] font-bold text-[#3a342a] dark:text-zinc-100">{d.title} <span className="text-[8px] font-mono text-[#8a8172]">· {d.budget}🪙 · {d.status}</span></p>
                  {d.status === 'open' && d.applicants.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {d.applicants.map((a) => (
                        <button key={a.id} onClick={() => act(`/api/creator/deals/${d.id}/accept`, { applicantId: a.id }, `✅ Paid ${d.budget} coins to ${a.name}`)}
                          className="rounded-full bg-emerald-100 dark:bg-emerald-900/30 border border-emerald-300 dark:border-emerald-800 px-2 py-0.5 text-[9px] font-bold text-emerald-700 dark:text-emerald-300 hover:bg-emerald-200">
                          <CheckCircle2 size={9} className="inline mr-1" />{a.name}
                        </button>
                      ))}
                    </div>
                  )}
                  {d.applicants.length === 0 && <p className="text-[8px] text-[#8a8172] mt-1">No applicants yet.</p>}
                </div>
              ))}
              {myDeals.length === 0 && <p className="text-[9px] text-[#8a8172] italic">No deals posted.</p>}
            </div>
          </div>
          <div>
            <p className="font-mono text-[9px] font-bold uppercase tracking-wider text-[#8a8172] mb-1.5">Open deals for you</p>
            <div className="space-y-1.5">
              {deals.map((d) => (
                <div key={d.id} className="bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-2xl p-2.5">
                  <div className="flex items-center gap-1.5">
                    <p className="text-[11px] font-bold text-[#3a342a] dark:text-zinc-100 flex-1 truncate">{d.title}</p>
                    <span className="text-[8px] font-mono uppercase text-amber-600 dark:text-amber-400">{d.budget} 🪙</span>
                  </div>
                  <p className="text-[9px] text-[#8a8172] mt-0.5">{d.description} · by {d.brandName} · #{d.niche}</p>
                  <button onClick={() => act(`/api/creator/deals/${d.id}/apply`, {}, '📨 Application sent!')} disabled={d.applied}
                    className="mt-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:bg-zinc-300 dark:disabled:bg-zinc-700 text-white text-[9px] font-bold px-2.5 py-1 transition-all">
                    {d.applied ? 'Applied ✓' : 'Apply'}
                  </button>
                </div>
              ))}
              {deals.length === 0 && <p className="text-[9px] text-[#8a8172] italic">No open deals.</p>}
            </div>
          </div>
        </div>
      )}

      {tab === 'aff' && (
        <div className="grid md:grid-cols-2 gap-3">
          <div className="bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-2xl p-3">
            <p className="font-mono text-[9px] font-bold uppercase tracking-wider text-[#8a8172] mb-2">Create a trackable link</p>
            <div className="flex gap-1.5">
              <input value={affLabel} onChange={(e) => setAffLabel(e.target.value)} placeholder="Label (e.g. My shop)" className="flex-1 rounded-lg border border-[#ebdcca] dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2.5 py-1.5 text-[11px] outline-none" />
              <button onClick={() => { if (affLabel.trim()) { act('/api/creator/affiliate', { label: affLabel }, '🔗 Link created!'); setAffLabel(''); } }} className="rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white px-3 text-[10px] font-bold">Create</button>
            </div>
          </div>
          <div className="bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-2xl p-3">
            <p className="font-mono text-[9px] font-bold uppercase tracking-wider text-[#8a8172] mb-2">My links ({aff.length})</p>
            {aff.map((l) => (
              <div key={l.id} className="flex items-center gap-2 py-1.5 border-b border-[#ebdcca]/60 dark:border-zinc-800 last:border-0">
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-bold text-[#3a342a] dark:text-zinc-100 truncate">{l.label}</p>
                  <p className="text-[8px] font-mono text-[#8a8172]">ocean.app/r/{l.code}</p>
                </div>
                <span className="text-[9px] text-[#8a8172]">{l.clicks} clicks · {l.conversions} conv</span>
                <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">{l.revenue}🪙</span>
                <button onClick={() => { navigator.clipboard?.writeText(`https://ocean.app/r/${l.code}`).then(() => toast('🔗 Link copied')).catch(() => toast(`🔗 https://ocean.app/r/${l.code}`)); }} className="text-[9px] text-[#8a8172] hover:text-amber-600 font-bold" title="Copy redirect link"><Copy size={10} className="inline mr-0.5" />copy</button>
                <button onClick={() => act(`/api/creator/affiliate/${l.id}/click`, { conversion: true, revenue: Math.floor(l.clicks * 0.3) + 10 }, '💰 Conversion recorded')} className="text-[9px] text-amber-600 hover:text-amber-500 font-bold">+conv</button>
              </div>
            ))}
            {aff.length === 0 && <p className="text-[9px] text-[#8a8172] italic">No links yet.</p>}
          </div>
        </div>
      )}

      {tab === 'fans' && (
        <div className="grid md:grid-cols-2 gap-3">
          <div className="bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-2xl p-3">
            <p className="font-mono text-[9px] font-bold uppercase tracking-wider text-[#8a8172] mb-2">Add a fan note</p>
            <input value={fanForm.fanId} onChange={(e) => setFanForm({ ...fanForm, fanId: e.target.value })} placeholder="User id (from profile)" className="w-full rounded-lg border border-[#ebdcca] dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2.5 py-1.5 text-[11px] outline-none mb-1.5" />
            <input value={fanForm.note} onChange={(e) => setFanForm({ ...fanForm, note: e.target.value })} placeholder="Note (birthday, preference, collab idea…)" className="w-full rounded-lg border border-[#ebdcca] dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2.5 py-1.5 text-[11px] outline-none mb-1.5" />
            <div className="flex gap-1.5">
              <select value={fanForm.tier} onChange={(e) => setFanForm({ ...fanForm, tier: e.target.value })} className="flex-1 rounded-lg border border-[#ebdcca] dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2.5 py-1.5 text-[11px] outline-none">
                {['fan', 'superfan', 'vip', 'collaborator'].map((t) => <option key={t}>{t}</option>)}
              </select>
              <button onClick={() => { if (fanForm.fanId.trim()) { act('/api/creator/fans', fanForm, '📇 Fan saved'); setFanForm({ fanId: '', note: '', tier: 'fan' }); } }} className="rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white px-3 text-[10px] font-bold">Save</button>
            </div>
          </div>
          <div className="bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-2xl p-3">
            <p className="font-mono text-[9px] font-bold uppercase tracking-wider text-[#8a8172] mb-2">Fan CRM ({fans.length})</p>
            {fans.map((f) => (
              <div key={f.id} className="py-1.5 border-b border-[#ebdcca]/60 dark:border-zinc-800 last:border-0">
                <p className="text-[11px] font-bold text-[#3a342a] dark:text-zinc-100 flex items-center gap-1">{f.fanName} <span className="text-[8px] font-mono uppercase bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 rounded px-1">{f.tier}</span></p>
                <p className="text-[9px] text-[#8a8172]">{f.note || '—'}</p>
              </div>
            ))}
            {fans.length === 0 && <p className="text-[9px] text-[#8a8172] italic">No notes yet. Add fan ids to grow your CRM.</p>}
          </div>
        </div>
      )}

      {tab === 'tiers' && (
        <div className="grid md:grid-cols-2 gap-3">
          <div>
            <div className="bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-2xl p-3 mb-3">
              <p className="font-mono text-[9px] font-bold uppercase tracking-wider text-[#8a8172] mb-2">Create a sponsorship tier</p>
              <input value={tierForm.name} onChange={(e) => setTierForm({ ...tierForm, name: e.target.value })} placeholder="Tier name (e.g. Ocean Insider)" className="w-full rounded-lg border border-[#ebdcca] dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2.5 py-1.5 text-[11px] outline-none mb-1.5" />
              <input type="number" min={5} value={tierForm.price} onChange={(e) => setTierForm({ ...tierForm, price: Number(e.target.value) })} className="w-28 rounded-lg border border-[#ebdcca] dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2.5 py-1.5 text-[11px] outline-none mb-1.5" />
              <input value={tierForm.perks} onChange={(e) => setTierForm({ ...tierForm, perks: e.target.value })} placeholder="Perks (comma separated)" className="w-full rounded-lg border border-[#ebdcca] dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2.5 py-1.5 text-[11px] outline-none" />
              <button onClick={() => { if (tierForm.name.trim()) { act('/api/creator/tiers', { name: tierForm.name, price: tierForm.price, perks: tierForm.perks.split(',').map((p) => p.trim()).filter(Boolean) }, '👑 Tier created'); setTierForm({ name: '', price: 50, perks: '' }); } }} className="mt-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-[10px] font-bold px-3 py-1.5">Create</button>
            </div>
            <p className="font-mono text-[9px] font-bold uppercase tracking-wider text-[#8a8172] mb-1.5">My tiers</p>
            <div className="space-y-1.5">
              {tiers.mine.map((t) => (
                <div key={t.id} className="bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-2xl p-2.5">
                  <p className="text-[11px] font-bold text-[#3a342a] dark:text-zinc-100">{t.name} <span className="text-[9px] font-mono text-amber-600">{t.price}🪙/mo</span></p>
                  <p className="text-[9px] text-[#8a8172]">{t.perks.join(' · ') || 'no perks'} · {t.subscribers.length} subscribers</p>
                </div>
              ))}
              {tiers.mine.length === 0 && <p className="text-[9px] text-[#8a8172] italic">No tiers yet.</p>}
            </div>
          </div>
          <div>
            <p className="font-mono text-[9px] font-bold uppercase tracking-wider text-[#8a8172] mb-1.5">Support other creators</p>
            <div className="space-y-1.5">
              {tiers.others.map((t) => (
                <div key={t.id} className="bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-2xl p-2.5">
                  <div className="flex items-center gap-1.5">
                    <p className="text-[11px] font-bold text-[#3a342a] dark:text-zinc-100 flex-1 truncate">{t.name}</p>
                    <span className="text-[9px] font-mono text-amber-600">{t.price}🪙</span>
                    <button onClick={() => act(`/api/creator/tiers/${t.id}/subscribe`, {}, `💛 Subscribed! ${t.price} coins sent`)}
                      className="rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[9px] font-bold px-2.5 py-1">Subscribe</button>
                  </div>
                  <p className="text-[9px] text-[#8a8172] mt-0.5">{t.perks.join(' · ') || 'no perks'}</p>
                </div>
              ))}
              {tiers.others.length === 0 && <p className="text-[9px] text-[#8a8172] italic">No tiers from other creators.</p>}
            </div>
          </div>
        </div>
      )}
    </FeatureShell>
  );
}
