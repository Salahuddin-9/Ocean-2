import { useCallback, useEffect, useState } from 'react';
import { Blocks, Plus, ExternalLink, Star, Trash2, Coins, Rocket } from 'lucide-react';
import FeatureShell, { toast, authHeaders } from './FeatureShell';
import MiniAppViewer from './MiniAppViewer';

interface Props {
  token: string | null;
  currentUser: { id: string; name: string } | null;
  onClose: () => void;
}

interface MiniApp {
  id: string; name: string; developerId: string; developerName: string; description: string;
  bundleUrl: string; icon: string; price: number; permissions: string[];
  installedBy: string[]; rating: number; ratingCount: number; installs: number;
  installed?: boolean; isMine?: boolean;
}

const PERMS = [
  ['wallet', '💳 Wallet (in-app purchases)'],
  ['camera', '📷 Camera'],
  ['location', '📍 Location'],
  ['clipboard', '📋 Clipboard'],
  ['storage', '💾 Local storage'],
] as const;

async function api<T>(path: string, token: string | null, body?: unknown, method?: string): Promise<T> {
  const res = await fetch(path, { method: method || (body ? 'POST' : 'GET'), headers: authHeaders(token), body: body ? JSON.stringify(body) : undefined });
  if (!res.ok) throw new Error(((await res.json().catch(() => ({}))).error) || 'Request failed');
  return res.json() as Promise<T>;
}

export default function MiniAppStore({ token, currentUser, onClose }: Props) {
  const [tab, setTab] = useState<'store' | 'dev'>('store');
  const [apps, setApps] = useState<MiniApp[]>([]);
  const [mine, setMine] = useState<MiniApp[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', description: '', bundleUrl: '', icon: '🧩', price: 0, perms: [] as string[] });

  const load = useCallback(async () => {
    try {
      const [a, m] = await Promise.all([
        api<{ apps: MiniApp[] }>('/api/miniapps', token),
        api<{ apps: MiniApp[] }>('/api/miniapps/mine', token),
      ]);
      setApps(a.apps); setMine(m.apps);
    } catch { /* offline */ }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const install = async (app: MiniApp) => {
    try {
      const d = await api<{ installed: boolean }>(`/api/miniapps/${app.id}/${app.installed ? 'uninstall' : 'install'}`, token);
      toast(d.installed ? `✅ Installed ${app.name}` : `🗑️ Uninstalled ${app.name}`);
      load();
    } catch (e: any) { toast(`⛔ ${e.message}`); }
  };

  const register = async () => {
    if (!form.name.trim() || !form.bundleUrl.trim()) { toast('⛔ Name and bundle URL required'); return; }
    try {
      await api('/api/miniapps', token, { ...form, price: form.price });
      toast('🚀 App registered! It runs sandboxed in an iframe with a postMessage API.');
      setForm({ name: '', description: '', bundleUrl: '', icon: '🧩', price: 0, perms: [] });
      load();
    } catch (e: any) { toast(`⛔ ${e.message}`); }
  };

  const openApp = apps.find((a) => a.id === openId);

  return (
    <FeatureShell title="Ocean Mini Apps" badge="253 · platform" icon={<Blocks size={18} className="text-indigo-700 dark:text-indigo-400" />} onClose={onClose}>
      <div className="flex items-center gap-1.5 mb-3">
        {([['store', 'Store', null], ['dev', 'Developer', null]] as const).map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)}
            className={`rounded-lg px-3 py-1.5 text-[10px] font-bold transition-all ${tab === id ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 text-[#8a8172]'}`}>
            {label}
          </button>
        ))}
        <p className="ml-auto text-[8px] text-[#8a8172] font-mono uppercase tracking-wider">Wallet IAP · 30% platform cut</p>
      </div>

      {openApp && <MiniAppViewer app={openApp} token={token} onClose={() => setOpenId(null)} />}

      {tab === 'store' && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {apps.map((a) => (
            <div key={a.id} className="bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-2xl p-3 flex flex-col">
              <div className="flex items-center gap-2">
                <span className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center text-xl">{a.icon}</span>
                <div className="min-w-0">
                  <p className="text-[11px] font-bold text-[#3a342a] dark:text-zinc-100 truncate">{a.name}</p>
                  <p className="text-[8px] text-[#8a8172] flex items-center gap-1"><Star size={8} className="text-amber-500" /> {a.rating || '—'} · {a.installs} installs</p>
                </div>
              </div>
              <p className="text-[9px] text-[#8a8172] mt-1.5 line-clamp-2 flex-1">{a.description}</p>
              <p className="text-[8px] text-[#8a8172] mt-1">by {a.developerName} · {a.permissions.length ? a.permissions.map((p) => `#${p}`).join(' ') : 'no permissions'}</p>
              <div className="flex gap-1.5 mt-2">
                <button onClick={() => setOpenId(a.id)} disabled={!a.installed}
                  className="flex-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-bold py-1.5 transition-all disabled:opacity-40 disabled:bg-zinc-300 dark:disabled:bg-zinc-700">
                  <ExternalLink size={10} className="inline mr-1" />Open
                </button>
                <button onClick={() => install(a)}
                  className={`rounded-lg px-2.5 text-[10px] font-bold border transition-all ${a.installed ? 'border-[#ebdcca] dark:border-zinc-700 text-[#8a8172]' : 'bg-emerald-600 hover:bg-emerald-500 text-white border-transparent'}`}>
                  {a.installed ? 'Installed' : 'Install'}
                </button>
              </div>
            </div>
          ))}
          {apps.length === 0 && (
            <p className="col-span-full text-[10px] text-[#8a8172] italic py-4">No mini apps yet — register the first one in the Developer tab!</p>
          )}
        </div>
      )}

      {tab === 'dev' && (
        <div className="grid md:grid-cols-2 gap-3">
          <div className="bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-2xl p-3">
            <p className="font-mono text-[9px] font-bold uppercase tracking-wider text-[#8a8172] mb-2 flex items-center gap-1"><Plus size={11} /> Register a mini app</p>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="App name" className="w-full rounded-xl border border-[#ebdcca] dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2.5 py-2 text-[11px] outline-none mb-1.5" />
            <input value={form.bundleUrl} onChange={(e) => setForm({ ...form, bundleUrl: e.target.value })} placeholder="Bundle URL (https://…)" className="w-full rounded-xl border border-[#ebdcca] dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2.5 py-2 text-[11px] outline-none mb-1.5" />
            <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Short description" className="w-full rounded-xl border border-[#ebdcca] dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2.5 py-2 text-[11px] outline-none mb-1.5" />
            <div className="flex gap-1.5 mb-2">
              <input value={form.icon} onChange={(e) => setForm({ ...form, icon: e.target.value })} placeholder="Icon emoji" className="w-20 rounded-xl border border-[#ebdcca] dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2.5 py-2 text-[11px] outline-none" />
              <input type="number" min={0} value={form.price} onChange={(e) => setForm({ ...form, price: Number(e.target.value) })} placeholder="Price (coins)" className="flex-1 rounded-xl border border-[#ebdcca] dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2.5 py-2 text-[11px] outline-none" />
            </div>
            <div className="grid grid-cols-2 gap-1 mb-2">
              {PERMS.map(([p, label]) => (
                <label key={p} className="flex items-center gap-1.5 text-[9px] text-[#8a8172] cursor-pointer">
                  <input type="checkbox" checked={form.perms.includes(p)} onChange={(e) => setForm({ ...form, perms: e.target.checked ? [...form.perms, p] : form.perms.filter((x) => x !== p) })} className="accent-indigo-600" />
                  {label}
                </label>
              ))}
            </div>
            <button onClick={register} className="w-full rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-bold uppercase tracking-wider py-2.5 transition-all">
              <Rocket size={12} className="inline mr-1" /> Publish app
            </button>
          </div>

          <div className="bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-2xl p-3">
            <p className="font-mono text-[9px] font-bold uppercase tracking-wider text-[#8a8172] mb-2 flex items-center gap-1"><Coins size={11} /> My apps ({mine.length})</p>
            {mine.map((a) => (
              <div key={a.id} className="flex items-center gap-2 py-2 border-b border-[#ebdcca]/60 dark:border-zinc-800 last:border-0">
                <span className="text-lg">{a.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-bold text-[#3a342a] dark:text-zinc-100 truncate">{a.name}</p>
                  <p className="text-[8px] text-[#8a8172]">{a.installs} installs · {a.price} coins · 30% commission</p>
                </div>
                <button onClick={async () => { await api(`/api/miniapps/${a.id}`, token, undefined, 'DELETE'); toast('Deleted'); load(); }} className="text-rose-500 hover:text-rose-400"><Trash2 size={13} /></button>
              </div>
            ))}
            {mine.length === 0 && <p className="text-[10px] text-[#8a8172] italic">No apps yet.</p>}
          </div>
        </div>
      )}
    </FeatureShell>
  );
}
