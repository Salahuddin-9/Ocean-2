import { useEffect, useState } from 'react';
import { History, Search, User, Sparkles } from 'lucide-react';
import FeatureShell, { toast, authHeaders } from './FeatureShell';

interface Props {
  token: string | null;
  currentUser: { id: string; name: string } | null;
  onClose: () => void;
}

interface TimelineEvent {
  id: string;
  kind: string;
  icon: string;
  title: string;
  detail: string;
  timestamp: number;
}

const KIND_COLOR: Record<string, string> = {
  message: 'bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-800',
  reaction: 'bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800',
  call: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
  group: 'bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 border-violet-200 dark:border-violet-800',
  friend: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800',
  interest: 'bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300 border-teal-200 dark:border-teal-800',
  joined: 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800',
  first_post: 'bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-800',
  first_reel: 'bg-fuchsia-100 dark:bg-fuchsia-900/40 text-fuchsia-700 dark:text-fuchsia-300 border-fuchsia-200 dark:border-fuchsia-800',
};

export default function RelationshipTimeline({ token, currentUser, onClose }: Props) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [selected, setSelected] = useState<any | null>(null);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [summary, setSummary] = useState<any>({});
  const [otherName, setOtherName] = useState('');
  const [loading, setLoading] = useState(false);
  const [allUsers, setAllUsers] = useState<any[]>([]);

  useEffect(() => {
    if (!allUsers.length) {
      fetch('/api/creators', { headers: authHeaders(token) })
        .then((r) => r.json())
        .then((data) => setAllUsers(Array.isArray(data) ? data : data?.creators || []))
        .catch(() => {});
    }
  }, [token, allUsers.length]);

  useEffect(() => {
    const term = q.trim().toLowerCase();
    setResults(term ? allUsers.filter((u: any) => (u.name || u.username || '').toLowerCase().includes(term)).slice(0, 6) : []);
  }, [q, allUsers]);

  const loadTimeline = async (userId: string, name: string) => {
    setLoading(true);
    setSelected({ id: userId, name });
    setOtherName(name);
    setQ(name);
    setResults([]);
    try {
      const res = await fetch(`/api/users/${userId}/timeline`, { headers: authHeaders(token) });
      if (res.ok) {
        const data = await res.json();
        setTimeline(data.timeline || []);
        setSummary(data.summary || {});
      } else {
        toast('⛔ Could not load timeline');
        setTimeline([]);
      }
    } catch { toast('⛔ Network error'); }
    setLoading(false);
  };

  const loadMyTimeline = async () => {
    setLoading(true);
    setSelected({ id: 'me', name: 'Me' });
    setOtherName('you');
    setQ('');
    setSummary({});
    try {
      const res = await fetch('/api/me/timeline', { headers: authHeaders(token) });
      if (res.ok) {
        const data = await res.json();
        setTimeline(data.timeline || []);
      }
    } catch { /* noop */ }
    setLoading(false);
  };

  return (
    <FeatureShell title="Relationship Timeline" badge="2" icon={<History size={18} className="text-emerald-700 dark:text-emerald-400" />} onClose={onClose}>
      <div className="bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-2xl p-4 mb-4">
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={12} className="absolute left-2.5 top-2.5 text-[#8a8172]" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a user to see your shared history…"
              className="w-full bg-white dark:bg-zinc-800 border border-[#cfcac0] dark:border-zinc-700 rounded-lg pl-8 pr-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-amber-600" />
            {results.length > 0 && (
              <div className="absolute z-10 mt-1 w-full bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 rounded-lg shadow-lg overflow-hidden">
                {results.map((u: any) => (
                  <button key={u.id} onClick={() => loadTimeline(u.id, u.name || u.username)}
                    className="w-full text-left px-3 py-2 text-[11px] hover:bg-amber-50 dark:hover:bg-zinc-700 flex items-center gap-2">
                    <User size={12} className="text-emerald-700" /> {u.name || u.username}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button onClick={loadMyTimeline}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-800 hover:bg-emerald-700 text-[#f4f1ea] text-[10px] font-bold uppercase tracking-wider transition-all">
            <Sparkles size={12} /> My milestones
          </button>
        </div>

        {summary.firstMessageAt || summary.firstCallAt || summary.firstReactionAt || summary.commonGroups ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
            {summary.firstMessageAt && (
              <div className="rounded-xl bg-sky-50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-800 px-2.5 py-2">
                <p className="text-[8px] font-mono uppercase text-[#8a8172]">First message</p>
                <p className="text-[11px] font-bold text-[#3a342a] dark:text-zinc-100">{new Date(summary.firstMessageAt).toLocaleDateString()}</p>
              </div>
            )}
            {summary.firstReactionAt && (
              <div className="rounded-xl bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 px-2.5 py-2">
                <p className="text-[8px] font-mono uppercase text-[#8a8172]">First reaction</p>
                <p className="text-[11px] font-bold text-[#3a342a] dark:text-zinc-100">{new Date(summary.firstReactionAt).toLocaleDateString()}</p>
              </div>
            )}
            {summary.firstCallAt && (
              <div className="rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 px-2.5 py-2">
                <p className="text-[8px] font-mono uppercase text-[#8a8172]">First call</p>
                <p className="text-[11px] font-bold text-[#3a342a] dark:text-zinc-100">{new Date(summary.firstCallAt).toLocaleDateString()}</p>
              </div>
            )}
            <div className="rounded-xl bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800 px-2.5 py-2">
              <p className="text-[8px] font-mono uppercase text-[#8a8172]">Common groups</p>
              <p className="text-[11px] font-bold text-[#3a342a] dark:text-zinc-100">{summary.commonGroups ?? 0}</p>
            </div>
          </div>
        ) : null}
      </div>

      <div className="bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-2xl p-4">
        <span className="font-mono text-[9px] font-bold text-[#8a8172] uppercase tracking-wider">
          {loading ? 'Loading…' : selected ? `Shared history with ${otherName}` : 'Pick a user to begin'}
        </span>
        <div className="relative mt-4 ml-3">
          <div className="absolute left-[5px] top-2 bottom-2 w-px bg-[#e4dccb] dark:bg-zinc-700" />
          <div className="space-y-4">
            {timeline.length === 0 && !loading && (
              <p className="text-[11px] text-[#8a8172] italic">No shared events found yet{selected ? ' — start a conversation, react, or call them' : ''}.</p>
            )}
            {timeline.map((ev) => (
              <div key={ev.id} className="relative flex gap-3">
                <span className={`relative z-10 shrink-0 w-[11px] h-[11px] rounded-full border-2 border-[#fcfaf4] dark:border-zinc-900 ${(KIND_COLOR[ev.kind] || KIND_COLOR.joined).includes('rose') ? 'bg-rose-500' : (KIND_COLOR[ev.kind] || '').includes('sky') ? 'bg-sky-500' : (KIND_COLOR[ev.kind] || '').includes('emerald') ? 'bg-emerald-500' : (KIND_COLOR[ev.kind] || '').includes('violet') ? 'bg-violet-500' : 'bg-amber-500'}`} />
                <div className="flex-1 -mt-0.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-base leading-none">{ev.icon}</span>
                    <span className="text-[11px] font-bold text-[#3a342a] dark:text-zinc-100">{ev.title}</span>
                    {ev.timestamp > 0 && <span className="text-[9px] font-mono text-[#8a8172]">{new Date(ev.timestamp).toLocaleDateString()}</span>}
                  </div>
                  <p className="text-[10px] text-[#8a8172] mt-0.5">{ev.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </FeatureShell>
  );
}
