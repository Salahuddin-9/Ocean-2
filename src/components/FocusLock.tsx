import { useEffect, useState } from 'react';
import { X, Lock, Unlock, LockOpen, Clapperboard, Compass, Video } from 'lucide-react';

/**
 * Ocean — Focus Lock (Feature 155, client-only)
 * Temporarily block distracting sections (Reels, Explore, Random Video) for a
 * chosen duration. Locks persist in localStorage and expose a status the app can
 * consult (key: ocean_focus_locks).
 */
interface FocusLockProps {
  token: string | null;
  currentUser: { id: string; name: string } | null;
  onClose: () => void;
}

interface Lock {
  section: string;
  label: string;
  until: number;
}

const SECTIONS = [
  ['reels', 'Reels', Clapperboard],
  ['explore', 'Explore', Compass],
  ['randomvideo', 'Random Video', Video],
] as const;

const LS_KEY = 'ocean_focus_locks';

function readLocks(): Lock[] {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) || '[]');
  } catch {
    return [];
  }
}

export default function FocusLock({ onClose }: FocusLockProps) {
  const [locks, setLocks] = useState<Lock[]>(readLocks);
  const [duration, setDuration] = useState(30);

  useEffect(() => {
    localStorage.setItem(LS_KEY, JSON.stringify(locks));
  }, [locks]);

  // Re-render each second so countdowns tick.
  const [, setTick] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => {
      setTick((t) => t + 1);
      // Auto-expire finished locks.
      setLocks((prev) => {
        const now = Date.now();
        const filtered = prev.filter((l) => l.until > now);
        return filtered.length === prev.length ? prev : filtered;
      });
    }, 1000);
    return () => clearInterval(iv);
  }, []);

  const lock = (section: string, label: string) => {
    setLocks((prev) => {
      const rest = prev.filter((l) => l.section !== section);
      return [...rest, { section, label, until: Date.now() + duration * 60000 }];
    });
  };

  const unlock = (section: string) => {
    setLocks((prev) => prev.filter((l) => l.section !== section));
  };

  const unlockAll = () => setLocks([]);

  const activeSection = (section: string): Lock | undefined => locks.find((l) => l.section === section);
  const minsLeft = (l: Lock) => Math.max(0, Math.ceil((l.until - Date.now()) / 60000));

  return (
    <div className="fixed inset-0 z-[115] bg-[#f6f1e7]/97 dark:bg-zinc-950/97 backdrop-blur-sm overflow-y-auto py-6 px-4">
      <div className="max-w-xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Lock size={18} className="text-amber-800 dark:text-amber-400" />
            <h2 className="font-display font-bold text-lg text-[#3a342a] dark:text-zinc-100 tracking-tight">Focus Lock</h2>
            <span className="font-mono text-[9px] uppercase tracking-widest text-[#8a8172] dark:text-zinc-400">Feature 155</span>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-white/80 dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 flex items-center justify-center text-[#5c5446] dark:text-zinc-300 hover:bg-[#ebdcca]/50 transition-all" aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-[#fcfaf4] dark:bg-zinc-900 p-4 mb-3">
          <p className="text-[11px] text-[#5c5446] dark:text-zinc-300 leading-relaxed mb-3">
            Lock the infinite-scroll sections while you work. Locks live in your browser
            (<span className="font-mono text-[9px]">ocean_focus_locks</span>) and expire automatically.
          </p>
          <label className="font-mono text-[8px] uppercase tracking-widest text-[#8a8172] dark:text-zinc-500">Lock duration</label>
          <div className="flex gap-1.5 mt-1.5 mb-3">
            {[15, 30, 60, 120].map((m) => (
              <button
                key={m}
                onClick={() => setDuration(m)}
                className={`px-3 py-1.5 rounded-full text-[10px] font-bold transition-all ${duration === m ? 'bg-amber-800 text-white dark:bg-amber-400 dark:text-zinc-950' : 'bg-white dark:bg-zinc-950 border border-[#ebdcca] dark:border-zinc-700 text-[#5c5446] dark:text-zinc-300'}`}
              >
                {m}m
              </button>
            ))}
          </div>

          <div className="space-y-2">
            {SECTIONS.map(([key, label, Icon]) => {
              const active = activeSection(key);
              return (
                <div key={key} className="flex items-center gap-3 rounded-xl border border-[#ebdcca] dark:border-zinc-800 p-3">
                  <Icon size={16} className={active ? 'text-rose-500' : 'text-amber-700 dark:text-amber-400'} />
                  <span className="text-[12px] font-bold text-[#3a342a] dark:text-zinc-100">{label}</span>
                  {active ? (
                    <>
                      <span className="ml-auto font-mono text-[10px] font-bold text-rose-600 dark:text-rose-400">{minsLeft(active)}m left</span>
                      <button onClick={() => unlock(key)} className="flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-rose-600 text-white text-[10px] font-bold hover:brightness-110 transition-all">
                        <LockOpen size={10} /> Unlock
                      </button>
                    </>
                  ) : (
                    <button onClick={() => lock(key, label)} className="ml-auto flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-amber-800 dark:bg-amber-400 text-white dark:text-zinc-950 text-[10px] font-bold hover:brightness-110 transition-all">
                      <Lock size={10} /> Lock for {duration}m
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {locks.length > 0 && (
            <button onClick={unlockAll} className="mt-3 flex items-center gap-1 text-[10px] font-bold text-[#8a8172] dark:text-zinc-400 hover:text-rose-600 transition-colors">
              <Unlock size={11} /> Unlock everything
            </button>
          )}
          {locks.length === 0 && (
            <p className="text-[9px] text-[#8a8172] dark:text-zinc-500 mt-2">Nothing locked — your focus time is in your hands.</p>
          )}
        </div>
      </div>
    </div>
  );
}
