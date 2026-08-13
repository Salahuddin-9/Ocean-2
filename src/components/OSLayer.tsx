import { useCallback, useEffect, useState } from 'react';
import { FlaskConical, Flag, Globe2, Plus, Play, TrendingUp, MousePointerClick, Crown, Zap } from 'lucide-react';
import FeatureShell, { toast, authHeaders } from './FeatureShell';
import { growthbook, GrowthBookProvider, useGrowthBook, useFeatureIsOn, syncFlagsFromOS, identifyGBUser } from '../lib/growthbook';

interface Props {
  token: string | null;
  currentUser: { id: string; name: string } | null;
  onClose: () => void;
}

interface Variant { id: string; name: string; weight: number }
interface Experiment { id: string; name: string; description: string; variants: Variant[]; audiencePct: number; enabled: boolean; participantCount: number; stats: Record<string, Record<string, number>> }
interface Flag { id: string; name: string; description: string; enabled: boolean; rolloutPct: number; targetGroup: string; overrides: Record<string, boolean> }
interface MyAssign { experimentId: string; name: string; variantId: string; variantName: string }
interface FlagState { id: string; name: string; on: boolean; source: string }

async function api<T>(path: string, token: string | null, body?: unknown, method?: string, headers?: Record<string, string>): Promise<T> {
  const res = await fetch(path, { method: method || (body ? 'POST' : 'GET'), headers: { ...authHeaders(token), ...(headers || {}) }, body: body ? JSON.stringify(body) : undefined });
  if (!res.ok) throw new Error(((await res.json().catch(() => ({}))).error) || 'Request failed');
  return res.json() as Promise<T>;
}

/** GrowthBook SDK status + gating demo (must live under the Provider). */
function GrowthBookStatus({ flags, userId }: { flags: FlagState[]; userId?: string }) {
  const gb = useGrowthBook();
  useEffect(() => {
    identifyGBUser(userId);
    syncFlagsFromOS(flags);
    gb.refreshFeatures();
  }, [flags, userId, gb]);

  const demoKey = flags[0]?.id || 'demo-flag';
  const demoOn = useFeatureIsOn(demoKey);

  return (
    <div className="mt-3 bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-2xl p-3">
      <div className="flex items-center gap-2 mb-2">
        <Zap size={12} className="text-amber-500" />
        <p className="text-[11px] font-bold text-[#3a342a] dark:text-zinc-100 flex-1">GrowthBook SDK</p>
        <span className="flex items-center gap-1 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 px-2 py-0.5 text-[8px] font-bold text-emerald-700 dark:text-emerald-300">
          <span className={`w-1.5 h-1.5 rounded-full ${flags.length ? 'bg-emerald-500 animate-pulse' : 'bg-zinc-400'}`} />
          {flags.length} features synced
        </span>
      </div>
      <p className="text-[9px] text-[#8a8172] leading-relaxed mb-2">
        Every flag you create above is registered into the GrowthBook client (clientKey{' '}
        <code className="bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 rounded px-1">{((import.meta as any).env?.VITE_GROWTHBOOK_CLIENT_KEY) || 'sdk-ocean-local'}</code>)
        and evaluated through the real SDK with rollout %, target groups and per-user overrides.
      </p>
      <div className="flex items-center gap-2">
        <span className="text-[9px] text-[#8a8172]">Gating demo —</span>
        <code className="rounded-lg bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 px-2 py-1 text-[9px] font-mono text-[#3a342a] dark:text-zinc-200">{demoKey}</code>
        <span className={`flex items-center gap-1 rounded-lg px-2 py-1 text-[9px] font-bold ${demoOn ? 'bg-emerald-600 text-white' : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-500'}`}>
          <span className={`w-2 h-2 rounded-full ${demoOn ? 'bg-white' : 'bg-zinc-400'}`} /> {demoOn ? 'FEATURE ON' : 'feature off'}
        </span>
        <span className="text-[8px] text-[#8a8172]">useFeatureIsOn()</span>
      </div>
    </div>
  );
}

export default function OSLayer({ token, currentUser, onClose }: Props) {
  const [tab, setTab] = useState<'exp' | 'flags' | 'region'>('exp');
  const [exps, setExps] = useState<Experiment[]>([]);
  const [myAssign, setMyAssign] = useState<MyAssign[]>([]);
  const [flags, setFlags] = useState<Flag[]>([]);
  const [flagStates, setFlagStates] = useState<FlagState[]>([]);
  const [region, setRegion] = useState('auto');
  const [regionRes, setRegionRes] = useState<any>(null);
  const [expForm, setExpForm] = useState({ name: '', description: '', variants: 'Control\nTreatment', audience: 100 });
  const [flagForm, setFlagForm] = useState({ name: '', description: '', rollout: 100, group: 'everyone' });
  const [overrideId, setOverrideId] = useState('');
  const [overrideUser, setOverrideUser] = useState('');
  const [overrideVal, setOverrideVal] = useState(true);

  const load = useCallback(async () => {
    try {
      const [e, a, f, fs] = await Promise.all([
        api<{ experiments: Experiment[] }>('/api/os/experiments', token),
        api<{ assignments: MyAssign[] }>('/api/os/my-assignments', token),
        api<{ flags: Flag[] }>('/api/os/flags', token),
        api<{ flags: FlagState[] }>('/api/os/flags/evaluate', token),
      ]);
      setExps(e.experiments); setMyAssign(a.assignments); setFlags(f.flags); setFlagStates(fs.flags);
    } catch { /* likely not admin for experiments — that's fine */ }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const act = async (path: string, body: unknown, okMsg: string, then?: () => void) => {
    try { await api(path, token, body); toast(okMsg); then?.(); load(); }
    catch (e: any) { toast(`⛔ ${e.message}`); }
  };

  const createExp = () => {
    const variants = expForm.variants.split('\n').map((l) => l.split(':')).map(([name, weight]) => ({ name: name?.trim(), weight: Number(weight?.trim()) || 1 })).filter((v) => v.name);
    if (expForm.name.trim() && variants.length >= 2) {
      act('/api/os/experiments', { name: expForm.name, description: expForm.description, variants, audiencePct: expForm.audience }, '🧪 Experiment created');
      setExpForm({ name: '', description: '', variants: 'Control\nTreatment', audience: 100 });
    } else toast('⛔ Name + at least 2 variants required (one per line)');
  };

  const trackMetric = (expId: string, metric: string) => act(`/api/os/experiments/${expId}/metrics`, { metric }, `📊 ${metric} tracked`);

  const createFlag = () => {
    if (!flagForm.name.trim()) return toast('⛔ Flag name required');
    act('/api/os/flags', { name: flagForm.name, description: flagForm.description, rolloutPct: flagForm.rollout, targetGroup: flagForm.group }, '🚩 Flag created');
    setFlagForm({ name: '', description: '', rollout: 100, group: 'everyone' });
  };

  const tabs = [
    ['exp', 'A/B Experiments', <FlaskConical key="e" size={11} />],
    ['flags', 'Feature Flags', <Flag key="f" size={11} />],
    ['region', 'Multi-region', <Globe2 key="r" size={11} />],
  ] as const;

  return (
    <GrowthBookProvider growthbook={growthbook}>
    <FeatureShell title="Ocean OS Layer" badge="259 · infra" icon={<Crown size={18} className="text-amber-700 dark:text-amber-400" />} onClose={onClose}>
      <div className="flex items-center gap-1.5 mb-3 flex-wrap">
        {tabs.map(([id, label, icon]) => (
          <button key={id} onClick={() => setTab(id)}
            className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[10px] font-bold transition-all ${tab === id ? 'bg-amber-600 text-white' : 'bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 text-[#8a8172]'}`}>
            {icon} {label}
          </button>
        ))}
        <p className="ml-auto text-[8px] text-[#8a8172] font-mono uppercase tracking-wider">Admin-gated · deterministic hashing</p>
      </div>

      {tab === 'exp' && (
        <div className="grid md:grid-cols-2 gap-3">
          <div className="space-y-3">
            <div className="bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-2xl p-3">
              <p className="font-mono text-[9px] font-bold uppercase tracking-wider text-[#8a8172] mb-2 flex items-center gap-1"><Plus size={11} /> Create experiment (admin)</p>
              <input value={expForm.name} onChange={(e) => setExpForm({ ...expForm, name: e.target.value })} placeholder="Experiment name" className="w-full rounded-lg border border-[#ebdcca] dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2.5 py-1.5 text-[11px] outline-none mb-1.5" />
              <input value={expForm.description} onChange={(e) => setExpForm({ ...expForm, description: e.target.value })} placeholder="Hypothesis…" className="w-full rounded-lg border border-[#ebdcca] dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2.5 py-1.5 text-[11px] outline-none mb-1.5" />
              <textarea value={expForm.variants} onChange={(e) => setExpForm({ ...expForm, variants: e.target.value })} rows={2} placeholder="Variant name : weight (one per line)" className="w-full rounded-lg border border-[#ebdcca] dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2.5 py-1.5 text-[11px] outline-none resize-none mb-1.5" />
              <label className="flex items-center gap-2 text-[10px] text-[#8a8172] font-bold">
                Audience {expForm.audience}% <input type="range" min={5} max={100} step={5} value={expForm.audience} onChange={(e) => setExpForm({ ...expForm, audience: Number(e.target.value) })} className="flex-1" />
              </label>
              <button onClick={createExp} className="mt-2 w-full rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-[10px] font-bold py-2">Create experiment</button>
            </div>
            <div className="bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-2xl p-3">
              <p className="font-mono text-[9px] font-bold uppercase tracking-wider text-[#8a8172] mb-2">My assignments</p>
              {myAssign.map((a) => (
                <div key={a.experimentId} className="flex items-center gap-2 py-1.5 border-b border-[#ebdcca]/60 dark:border-zinc-800 last:border-0">
                  <span className="text-[11px] text-[#3a342a] dark:text-zinc-200 flex-1 truncate">{a.name}</span>
                  <span className="text-[9px] font-mono bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 rounded px-1.5 py-0.5 font-bold">{a.variantName}</span>
                </div>
              ))}
              {myAssign.length === 0 && <p className="text-[9px] text-[#8a8172] italic">Not assigned to any experiment yet — assign yourself below.</p>}
            </div>
          </div>

          <div className="bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-2xl p-3">
            <p className="font-mono text-[9px] font-bold uppercase tracking-wider text-[#8a8172] mb-2">Experiments ({exps.length})</p>
            <div className="space-y-2 max-h-[30rem] overflow-y-auto pr-1">
              {exps.map((e) => (
                <div key={e.id} className="rounded-xl border border-[#ebdcca] dark:border-zinc-700 p-2.5">
                  <div className="flex items-center gap-1.5">
                    <p className="text-[11px] font-bold text-[#3a342a] dark:text-zinc-100 flex-1 truncate">{e.name}</p>
                    <span className="text-[8px] font-mono text-[#8a8172]">{e.participantCount} users · {e.audiencePct}%</span>
                    <button onClick={() => act(`/api/os/experiments/${e.id}/assign`, {}, '🎲 Assigned!')} className="rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white px-2 py-1 text-[8px] font-bold"><Play size={8} className="inline mr-0.5" />Assign me</button>
                  </div>
                  <p className="text-[8px] text-[#8a8172] mt-0.5">{e.description} · variants: {e.variants.map((v) => `${v.name}(${v.weight})`).join(', ')}</p>
                  <div className="flex gap-1 mt-1.5">
                    {(['click', 'view', 'purchase'] as const).map((m) => (
                      <button key={m} onClick={() => trackMetric(e.id, m)} className="flex items-center gap-0.5 rounded-lg bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 px-2 py-1 text-[8px] font-bold text-[#8a8172] hover:border-amber-400">
                        {m === 'click' ? <MousePointerClick size={8} /> : m === 'view' ? <TrendingUp size={8} /> : <Crown size={8} />} {m}
                      </button>
                    ))}
                  </div>
                  {Object.keys(e.stats).length > 0 && (
                    <div className="mt-1.5 space-y-1">
                      {Object.entries(e.stats).map(([metric, byVariant]) => {
                        const max = Math.max(1, ...Object.values(byVariant));
                        return (
                          <div key={metric}>
                            <p className="text-[8px] font-mono uppercase text-[#8a8172]">{metric}</p>
                            {Object.entries(byVariant).map(([v, count]) => (
                              <div key={v} className="flex items-center gap-1.5">
                                <span className="text-[8px] text-[#8a8172] w-8">{v}</span>
                                <div className="flex-1 h-2 rounded-full bg-zinc-200 dark:bg-zinc-700 overflow-hidden">
                                  <div className="h-full bg-amber-500" style={{ width: `${(count / max) * 100}%` }} />
                                </div>
                                <span className="text-[8px] font-mono text-[#8a8172]">{count}</span>
                              </div>
                            ))}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
              {exps.length === 0 && <p className="text-[9px] text-[#8a8172] italic">No experiments (create requires admin).</p>}
            </div>
          </div>
        </div>
      )}

      {tab === 'flags' && (
        <div className="grid md:grid-cols-2 gap-3">
          <div className="space-y-3">
            <div className="bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-2xl p-3">
              <p className="font-mono text-[9px] font-bold uppercase tracking-wider text-[#8a8172] mb-2">Create flag (admin)</p>
              <input value={flagForm.name} onChange={(e) => setFlagForm({ ...flagForm, name: e.target.value })} placeholder="Flag name (e.g. new-feed-v2)" className="w-full rounded-lg border border-[#ebdcca] dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2.5 py-1.5 text-[11px] outline-none mb-1.5" />
              <input value={flagForm.description} onChange={(e) => setFlagForm({ ...flagForm, description: e.target.value })} placeholder="Description" className="w-full rounded-lg border border-[#ebdcca] dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2.5 py-1.5 text-[11px] outline-none mb-1.5" />
              <label className="flex items-center gap-2 text-[10px] text-[#8a8172] font-bold">
                Rollout {flagForm.rollout}% <input type="range" min={0} max={100} step={5} value={flagForm.rollout} onChange={(e) => setFlagForm({ ...flagForm, rollout: Number(e.target.value) })} className="flex-1" />
              </label>
              <div className="flex gap-1.5 mt-1.5">
                <select value={flagForm.group} onChange={(e) => setFlagForm({ ...flagForm, group: e.target.value })} className="rounded-lg border border-[#ebdcca] dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2 py-1.5 text-[10px] outline-none">
                  {['everyone', 'admins', 'beta'].map((g) => <option key={g}>{g}</option>)}
                </select>
                <button onClick={createFlag} className="flex-1 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-[10px] font-bold py-1.5">Create flag</button>
              </div>
            </div>
            <div className="bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-2xl p-3">
              <p className="font-mono text-[9px] font-bold uppercase tracking-wider text-[#8a8172] mb-2">My evaluated flags</p>
              {flagStates.map((f) => (
                <div key={f.id} className="flex items-center gap-2 py-1.5 border-b border-[#ebdcca]/60 dark:border-zinc-800 last:border-0">
                  <span className={`w-2 h-2 rounded-full ${f.on ? 'bg-emerald-500' : 'bg-zinc-400'}`} />
                  <span className="text-[11px] text-[#3a342a] dark:text-zinc-200 flex-1 truncate">{f.name}</span>
                  <span className="text-[8px] font-mono text-[#8a8172]">{f.on ? 'ON' : 'OFF'} · {f.source}</span>
                </div>
              ))}
              {flagStates.length === 0 && <p className="text-[9px] text-[#8a8172] italic">No flags.</p>}
            </div>
          </div>

          <div className="bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-2xl p-3">
            <p className="font-mono text-[9px] font-bold uppercase tracking-wider text-[#8a8172] mb-2">Flags ({flags.length})</p>
            <div className="space-y-1.5 max-h-[26rem] overflow-y-auto pr-1">
              {flags.map((f) => (
                <div key={f.id} className="rounded-xl border border-[#ebdcca] dark:border-zinc-700 p-2.5">
                  <div className="flex items-center gap-1.5">
                    <p className="text-[11px] font-bold text-[#3a342a] dark:text-zinc-100 flex-1 truncate">{f.name}</p>
                    <button onClick={() => act('/api/os/flags', { id: f.id, name: f.name, description: f.description, enabled: !f.enabled, rolloutPct: f.rolloutPct, targetGroup: f.targetGroup }, f.enabled ? '🔴 Flag disabled' : '🟢 Flag enabled')}
                      className={`relative w-9 h-5 rounded-full transition-colors ${f.enabled ? 'bg-emerald-600' : 'bg-zinc-300 dark:bg-zinc-700'}`}>
                      <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${f.enabled ? 'left-[18px]' : 'left-0.5'}`} />
                    </button>
                  </div>
                  <p className="text-[8px] text-[#8a8172] mt-0.5">{f.description} · group: {f.targetGroup} · rollout {f.rolloutPct}% · {Object.keys(f.overrides).length} overrides</p>
                  <div className="flex gap-1 mt-1.5 items-center">
                    <input value={overrideId} onChange={(e) => setOverrideId(e.target.value)} placeholder="user id" className="flex-1 rounded-lg border border-[#ebdcca] dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2 py-1 text-[9px] outline-none" />
                    <select value={overrideVal ? '1' : '0'} onChange={(e) => setOverrideVal(e.target.value === '1')} className="rounded-lg border border-[#ebdcca] dark:border-zinc-700 bg-white dark:bg-zinc-800 px-1.5 py-1 text-[9px] outline-none">
                      <option value="1">ON</option><option value="0">OFF</option>
                    </select>
                    <button onClick={() => { if (overrideId.trim()) { act(`/api/os/flags/${f.id}/override`, { userId: overrideId.trim(), value: overrideVal }, '🎯 Override set'); setOverrideId(''); } }}
                      className="rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white px-2 py-1 text-[9px] font-bold">Override</button>
                  </div>
                </div>
              ))}
              {flags.length === 0 && <p className="text-[9px] text-[#8a8172] italic">No flags yet.</p>}
            </div>
          </div>
        </div>
      )}

      <GrowthBookStatus flags={flagStates} userId={currentUser?.id} />

      {tab === 'region' && (
        <div className="bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-2xl p-3 max-w-xl">
          <p className="font-mono text-[9px] font-bold uppercase tracking-wider text-[#8a8172] mb-2">Simulated edge routing</p>
          <div className="flex gap-1.5">
            {['auto', 'ap-south-1', 'ap-southeast-1', 'eu-central-1', 'us-east-1'].map((r) => (
              <button key={r} onClick={async () => {
                setRegion(r);
                try {
                  const d = await api<{ requestedRegion: string; routedTo: { region: string; replica: string; latencyMs: number } }>('/api/os/region', token, undefined, 'GET', { 'x-region': r });
                  setRegionRes(d);
                } catch (e: any) { toast(`⛔ ${e.message}`); }
              }} className={`rounded-lg px-2.5 py-1.5 text-[9px] font-bold transition-all ${region === r ? 'bg-amber-600 text-white' : 'bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 text-[#8a8172]'}`}>{r}</button>
            ))}
          </div>
          {regionRes && (
            <div className="mt-3 rounded-xl bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 p-3 space-y-1.5">
              <p className="text-[11px] font-bold text-[#3a342a] dark:text-zinc-100">Requested: <span className="font-mono text-amber-600">{regionRes.requestedRegion}</span></p>
              <p className="text-[10px] text-[#8a8172]">Served by replica <b className="text-[#3a342a] dark:text-zinc-200">{regionRes.routedTo.replica}</b> ({regionRes.routedTo.region})</p>
              <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-mono">simulated latency: {regionRes.routedTo.latencyMs} ms</p>
              <p className="text-[8px] text-[#8a8172]">{regionRes.note}</p>
            </div>
          )}
          <p className="text-[8px] text-[#8a8172] mt-2">Send the <code className="bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 rounded px-1">x-region</code> header and the edge routes you to the nearest replica with simulated latency.</p>
        </div>
      )}
    </FeatureShell>
    </GrowthBookProvider>
  );
}
