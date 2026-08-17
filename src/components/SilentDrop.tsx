import { useEffect, useState } from 'react';
import { X, Bomb, Send, Eye, Hourglass } from 'lucide-react';

/**
 * Ocean — Silent Drop (Feature 167)
 * Posts that vanish after 20 minutes or 50 views — ephemeral by design.
 */
interface SilentDropProps {
  token: string | null;
  currentUser: { id: string; name: string } | null;
  onClose: () => void;
}

interface Drop {
  id: string;
  title: string;
  text: string;
  authorName: string;
  expiresAt: number;
  maxViews: number;
  viewCount: number;
  visible: boolean;
}

export default function SilentDrop({ token, currentUser, onClose }: SilentDropProps) {
  const [drops, setDrops] = useState<Drop[]>([]);
  const [title, setTitle] = useState('A thought that expires');
  const [text, setText] = useState('This post deletes itself soon. Read it while it lasts.');
  const [minutes, setMinutes] = useState(20);
  const [maxViews, setMaxViews] = useState(50);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');

  const headers = token ? { Authorization: `Bearer ${token}` } : {};

  const load = async () => {
    try {
      const r = await fetch('/api/silentdrop/active');
      const d = await r.json();
      setDrops(d.drops || []);
    } catch { /* non-fatal */ }
  };

  useEffect(() => {
    load();
    const iv = setInterval(load, 15000); // re-poll: drops expire
    return () => clearInterval(iv);
  }, []);

  const create = async () => {
    setBusy(true);
    setError('');
    setToast('');
    try {
      const r = await fetch('/api/silentdrop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ title, text, minutes, maxViews }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Failed');
      setToast(d.note);
      setText('');
      load();
    } catch (e: any) {
      setError(e.message || 'Failed');
    } finally {
      setBusy(false);
    }
  };

  const view = async (id: string) => {
    try {
      await fetch(`/api/silentdrop/${id}/view`, { method: 'POST', headers });
      load();
    } catch { /* non-fatal */ }
  };

  const minsLeft = (d: Drop) => Math.max(0, Math.ceil((d.expiresAt - Date.now()) / 60000));

  return (
    <div className="fixed inset-0 z-[115] bg-[#141b2b]/60 dark:bg-[#05060c]/85 backdrop-blur-sm overflow-y-auto py-6 px-4">
      <div className="max-w-xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Bomb size={18} className="text-amber-800 dark:text-amber-400" />
            <h2 className="font-display font-bold text-lg text-[#3a342a] dark:text-zinc-100 tracking-tight">Silent Drop</h2>
            <span className="font-mono text-[9px] uppercase tracking-widest text-[#8a8172] dark:text-zinc-400">Feature 167</span>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-white/80 dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 flex items-center justify-center text-[#5c5446] dark:text-zinc-300 hover:bg-[#ebdcca]/50 transition-all" aria-label="Close">
            <X size={16} />
          </button>
        </div>

        {error && <p className="text-[10px] text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-xl p-2.5 mb-3">{error}</p>}
        {toast && <p className="text-[10px] text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl p-2.5 mb-3">{toast}</p>}

        <div className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-[#fcfaf4] dark:bg-zinc-900 p-4 mb-3">
          <p className="text-[11px] text-[#5c5446] dark:text-zinc-300 leading-relaxed mb-3">
            Ephemeral by design: a silent drop lives for a few minutes and only the first few viewers ever see it. Then it's gone.
          </p>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" className="w-full px-3 py-2.5 rounded-xl border border-[#ebdcca] dark:border-zinc-700 bg-white dark:bg-zinc-950 text-[12px] text-[#3a342a] dark:text-zinc-100 focus:outline-none focus:border-amber-500 mb-2" />
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} placeholder="What vanishes…" className="w-full px-3 py-2.5 rounded-xl border border-[#ebdcca] dark:border-zinc-700 bg-white dark:bg-zinc-950 text-[12px] resize-none focus:outline-none focus:border-amber-500 mb-2" />
          <div className="grid grid-cols-2 gap-2 mb-2">
            <div>
              <label className="font-mono text-[8px] uppercase tracking-widest text-[#8a8172] dark:text-zinc-500">Lifetime (min)</label>
              <input type="number" min={1} max={1440} value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} className="w-full mt-1 px-3 py-2 rounded-xl border border-[#ebdcca] dark:border-zinc-700 bg-white dark:bg-zinc-950 text-[11px] focus:outline-none focus:border-amber-500" />
            </div>
            <div>
              <label className="font-mono text-[8px] uppercase tracking-widest text-[#8a8172] dark:text-zinc-500">Max viewers</label>
              <input type="number" min={1} max={500} value={maxViews} onChange={(e) => setMaxViews(Number(e.target.value))} className="w-full mt-1 px-3 py-2 rounded-xl border border-[#ebdcca] dark:border-zinc-700 bg-white dark:bg-zinc-950 text-[11px] focus:outline-none focus:border-amber-500" />
            </div>
          </div>
          <button onClick={create} disabled={busy || !currentUser} className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-amber-600 to-amber-800 text-white font-bold text-[12px] py-2.5 hover:brightness-110 transition-all disabled:opacity-40">
            <Send size={13} /> Drop it
          </button>
        </div>

        <div className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-[#fcfaf4] dark:bg-zinc-900 p-4">
          <p className="font-mono text-[9px] uppercase tracking-widest text-[#8a8172] dark:text-zinc-500 mb-2">Live drops</p>
          {drops.length === 0 && <p className="text-[10px] text-[#8a8172] dark:text-zinc-500">Nothing ephemeral in the air right now.</p>}
          <div className="space-y-1.5">
            {drops.map((d) => (
              <div key={d.id} className="rounded-xl border border-[#ebdcca] dark:border-zinc-800 p-2.5">
                <div className="flex items-center gap-2 mb-1">
                  <Hourglass size={12} className="text-amber-600 shrink-0" />
                  <p className="font-bold text-[11px] text-[#3a342a] dark:text-zinc-100 truncate">{d.title}</p>
                  <span className="ml-auto font-mono text-[8px] text-[#8a8172]">{minsLeft(d)}m · {d.viewCount}/{d.maxViews} views</span>
                </div>
                <p className="text-[10px] text-[#5c5446] dark:text-zinc-400 mb-1.5">“{d.text.slice(0, 120)}{d.text.length > 120 ? '…' : ''}”</p>
                <button onClick={() => view(d.id)} className="flex items-center gap-1 text-[9px] font-bold text-amber-700 dark:text-amber-400 hover:underline">
                  <Eye size={10} /> View (counts toward the cap)
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
