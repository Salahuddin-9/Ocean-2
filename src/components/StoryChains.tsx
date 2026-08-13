import { useEffect, useState } from 'react';
import { X, Link2, Plus, Send } from 'lucide-react';

/**
 * Ocean — Story Chains (Feature 163)
 * Chain stories where each person adds one entry to a shared tale.
 */
interface StoryChainsProps {
  token: string | null;
  currentUser: { id: string; name: string } | null;
  onClose: () => void;
}

interface ChainEntry {
  id: string;
  authorName: string;
  text: string;
  at: number;
}

interface Chain {
  id: string;
  title: string;
  createdByName: string;
  status: string;
  maxLength: number;
  entries: ChainEntry[];
  entryCount?: number;
}

export default function StoryChains({ token, currentUser, onClose }: StoryChainsProps) {
  const [chains, setChains] = useState<Chain[]>([]);
  const [activeId, setActiveId] = useState('');
  const [active, setActive] = useState<Chain | null>(null);
  const [title, setTitle] = useState('The night the city lights went out…');
  const [entry, setEntry] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const headers = token ? { Authorization: `Bearer ${token}` } : {};

  const loadChains = async () => {
    try {
      const r = await fetch('/api/chains');
      const d = await r.json();
      setChains(d.chains || []);
    } catch { /* non-fatal */ }
  };

  useEffect(() => {
    loadChains();
  }, []);

  const open = async (id: string) => {
    setActiveId(id);
    setError('');
    try {
      const r = await fetch(`/api/chains/${id}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Failed');
      setActive(d.chain);
    } catch (e: any) {
      setError(e.message || 'Failed');
    }
  };

  const create = async () => {
    if (title.trim().length < 3) return setError('Title too short.');
    setBusy(true);
    setError('');
    try {
      const r = await fetch('/api/chains', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ title }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Failed');
      loadChains();
      open(d.chain.id);
    } catch (e: any) {
      setError(e.message || 'Failed');
    } finally {
      setBusy(false);
    }
  };

  const add = async () => {
    if (!entry.trim()) return;
    setBusy(true);
    setError('');
    try {
      const r = await fetch(`/api/chains/${activeId}/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ text: entry }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Failed');
      setEntry('');
      setActive(d.chain);
      loadChains();
    } catch (e: any) {
      setError(e.message || 'Failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[115] bg-[#f6f1e7]/97 dark:bg-zinc-950/97 backdrop-blur-sm overflow-y-auto py-6 px-4">
      <div className="max-w-xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Link2 size={18} className="text-amber-800 dark:text-amber-400" />
            <h2 className="font-display font-bold text-lg text-[#3a342a] dark:text-zinc-100 tracking-tight">Story Chains</h2>
            <span className="font-mono text-[9px] uppercase tracking-widest text-[#8a8172] dark:text-zinc-400">Feature 163</span>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-white/80 dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 flex items-center justify-center text-[#5c5446] dark:text-zinc-300 hover:bg-[#ebdcca]/50 transition-all" aria-label="Close">
            <X size={16} />
          </button>
        </div>

        {error && <p className="text-[10px] text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-xl p-2.5 mb-3">{error}</p>}

        {!active && (
          <>
            <div className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-[#fcfaf4] dark:bg-zinc-900 p-4 mb-3">
              <p className="text-[11px] text-[#5c5446] dark:text-zinc-300 leading-relaxed mb-3">
                Start a story — others add the next lines. Each addition is its own entry on the shared chain (max 20, and no single author may dominate).
              </p>
              <div className="flex gap-2">
                <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Chain title / first line" className="flex-1 px-3 py-2.5 rounded-xl border border-[#ebdcca] dark:border-zinc-700 bg-white dark:bg-zinc-950 text-[12px] text-[#3a342a] dark:text-zinc-100 focus:outline-none focus:border-amber-500" />
                <button onClick={create} disabled={busy || !currentUser} className="flex items-center gap-1 px-4 rounded-xl bg-amber-800 dark:bg-amber-400 text-white dark:text-zinc-950 font-bold text-[11px] hover:brightness-110 transition-all disabled:opacity-40">
                  <Plus size={13} /> Start
                </button>
              </div>
            </div>
            <div className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-[#fcfaf4] dark:bg-zinc-900 p-4">
              <p className="font-mono text-[9px] uppercase tracking-widest text-[#8a8172] dark:text-zinc-500 mb-2">Open chains</p>
              {chains.length === 0 && <p className="text-[10px] text-[#8a8172] dark:text-zinc-500">No open chains — start one!</p>}
              {chains.map((c) => (
                <button key={c.id} onClick={() => open(c.id)} className="w-full text-left rounded-xl border border-[#ebdcca] dark:border-zinc-800 p-2.5 mb-1.5 hover:border-amber-400 transition-all">
                  <p className="text-[11px] font-bold text-[#3a342a] dark:text-zinc-100">“{c.title}”</p>
                  <p className="text-[9px] text-[#8a8172] dark:text-zinc-500">by {c.createdByName} · {c.entryCount}/{c.maxLength} entries</p>
                </button>
              ))}
            </div>
          </>
        )}

        {active && (
          <div className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-[#fcfaf4] dark:bg-zinc-900 p-4 mb-3">
            <button onClick={() => { setActive(null); setActiveId(''); }} className="text-[10px] font-bold text-[#8a8172] dark:text-zinc-400 hover:text-amber-700 transition-colors mb-2">← All chains</button>
            <p className="font-bold text-[13px] text-[#3a342a] dark:text-zinc-100 mb-0.5">“{active.title}”</p>
            <p className="font-mono text-[8px] uppercase tracking-widest text-[#8a8172] dark:text-zinc-500 mb-3">
              {active.entries.length}/{active.maxLength} entries · {active.status}
            </p>
            <div className="relative space-y-2 mb-3 pl-3 border-l-2 border-[#ebdcca] dark:border-zinc-700">
              {active.entries.map((e) => (
                <div key={e.id} className="relative rounded-xl border border-[#ebdcca] dark:border-zinc-800 bg-white dark:bg-zinc-950 p-2.5">
                  <span className="absolute -left-[17px] top-3 w-2 h-2 rounded-full bg-amber-600 dark:bg-amber-400" />
                  <p className="text-[9px] font-bold text-[#8a8172] dark:text-zinc-400">{e.authorName} · {new Date(e.at).toLocaleTimeString()}</p>
                  <p className="text-[11px] text-[#3a342a] dark:text-zinc-100">{e.text}</p>
                </div>
              ))}
            </div>
            {active.status === 'open' ? (
              <div className="flex gap-2">
                <input value={entry} onChange={(e) => setEntry(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} placeholder="Continue the story…" className="flex-1 px-3 py-2.5 rounded-xl border border-[#ebdcca] dark:border-zinc-700 bg-white dark:bg-zinc-950 text-[12px] focus:outline-none focus:border-amber-500" />
                <button onClick={add} disabled={busy || !currentUser} className="flex items-center gap-1 px-4 rounded-xl bg-amber-800 dark:bg-amber-400 text-white dark:text-zinc-950 font-bold text-[11px] hover:brightness-110 transition-all disabled:opacity-40">
                  <Send size={12} /> Add line
                </button>
              </div>
            ) : (
              <p className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400">This chain is complete — the story lives on.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
