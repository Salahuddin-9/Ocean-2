import { useEffect, useState } from 'react';
import { CalendarX, Plus, Archive, RefreshCw, Clock } from 'lucide-react';
import FeatureShell, { toast, authHeaders } from './FeatureShell';

interface Props {
  token: string | null;
  currentUser: { id: string; name: string } | null;
  onClose: () => void;
}

interface EventGroup {
  id: string;
  conversationId: string;
  name: string;
  chatName: string;
  eventEndDate: number;
  expiresAt: number;
  status: 'active' | 'grace_period' | 'ready_to_archive' | 'archived';
  memberCount: number;
  createdBy: string;
}

const STATUS_META: Record<EventGroup['status'], { label: string; cls: string }> = {
  active: { label: 'Active', cls: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300' },
  grace_period: { label: 'Grace (24h)', cls: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300' },
  ready_to_archive: { label: 'Ready to archive', cls: 'bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300' },
  archived: { label: 'Archived', cls: 'bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300' },
};

export default function EventGroups({ token, currentUser, onClose }: Props) {
  const [groups, setGroups] = useState<EventGroup[]>([]);
  const [conversations, setConversations] = useState<any[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [chatId, setChatId] = useState('');
  const [endDate, setEndDate] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const res = await fetch('/api/chat/event-groups', { headers: authHeaders(token) });
      if (res.ok) setGroups((await res.json()).groups || []);
      const convRes = await fetch('/api/chat/conversations', { headers: authHeaders(token) });
      if (convRes.ok) {
        const data = await convRes.json();
        const list = Array.isArray(data) ? data : data.conversations || [];
        setConversations(list.filter((c: any) => (c.type === 'group' || c.isGroup) && !c.archived));
      }
    } catch { /* offline */ }
  };

  useEffect(() => { load(); }, [token]);

  const create = async () => {
    if (!chatId || !endDate) { toast('⛔ Pick a group chat and an event end date'); return; }
    setBusy(true);
    const res = await fetch('/api/chat/event-groups', {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ conversationId: chatId, eventEndDate: new Date(endDate).toISOString() }),
    });
    const data = await res.json();
    setBusy(false);
    if (res.ok) {
      toast('✅ Event group created — it archives 24h after the event ends');
      setShowCreate(false);
      load();
    } else {
      toast(`⛔ ${data.error || 'Could not create event group'}`);
    }
  };

  const archiveNow = async (id: string) => {
    const res = await fetch(`/api/chat/event-groups/${id}/archive`, { method: 'POST', headers: authHeaders(token) });
    if (res.ok) { toast('🗄 Group archived — now read-only'); load(); }
    else toast('⛔ Only the organizer can archive');
  };

  const runSweep = async () => {
    setBusy(true);
    const res = await fetch('/api/chat/event-groups/check', { method: 'POST', headers: authHeaders(token) });
    const data = await res.json();
    setBusy(false);
    toast(`🔁 Sweep complete — ${data.archived || 0} group(s) archived`);
    load();
  };

  return (
    <FeatureShell title="Event Groups (Self-Destruct)" badge="11" icon={<CalendarX size={18} className="text-orange-700 dark:text-orange-400" />} onClose={onClose}>
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <p className="text-[10px] text-[#8a8172] max-w-md">Convert a group chat into an event group. When the event ends + 24h, it auto-archives: read-only, hidden, members stay as viewers.</p>
        <div className="flex gap-2">
          <button onClick={runSweep} disabled={busy}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 text-[10px] font-bold uppercase tracking-wider text-[#8a8172] hover:text-orange-600 transition-all disabled:opacity-40">
            <RefreshCw size={12} className={busy ? 'animate-spin' : ''} /> Run sweep
          </button>
          <button onClick={() => setShowCreate(!showCreate)}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-orange-800 hover:bg-orange-700 text-white text-[10px] font-bold uppercase tracking-wider transition-all">
            <Plus size={12} /> New event group
          </button>
        </div>
      </div>

      {showCreate && (
        <div className="bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-2xl p-4 mb-4">
          <select value={chatId} onChange={(e) => setChatId(e.target.value)} className="w-full bg-white dark:bg-zinc-800 border border-[#cfcac0] dark:border-zinc-700 rounded-lg px-3 py-2 text-xs mb-2">
            <option value="">Select a group chat…</option>
            {conversations.map((c) => <option key={c.id} value={c.id}>{c.name || 'Group chat'}</option>)}
          </select>
          <div className="flex gap-2">
            <input type="datetime-local" value={endDate} onChange={(e) => setEndDate(e.target.value)}
              className="flex-1 bg-white dark:bg-zinc-800 border border-[#cfcac0] dark:border-zinc-700 rounded-lg px-3 py-2 text-xs" />
            <button onClick={create} disabled={busy} className="px-4 rounded-lg bg-orange-800 hover:bg-orange-700 text-white text-[10px] font-bold uppercase tracking-wider disabled:opacity-40">
              {busy ? '…' : 'Create'}
            </button>
          </div>
          <p className="text-[9px] text-[#8a8172] mt-1.5">The group archives automatically {`24 hours after`} this date and becomes read-only.</p>
        </div>
      )}

      <div className="space-y-2.5">
        {groups.length === 0 && (
          <p className="text-[11px] text-[#8a8172] italic bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-2xl p-4">
            No event groups yet. Convert a group chat (wedding, exam camp, protest, picnic…) and let Ocean archive it for you.
          </p>
        )}
        {groups.map((g) => {
          const meta = STATUS_META[g.status];
          return (
            <div key={g.id} className={`bg-[#fcfaf4] dark:bg-zinc-900 border rounded-2xl p-4 ${g.status === 'archived' ? 'border-zinc-300 dark:border-zinc-700 opacity-75' : 'border-[#ebdcca] dark:border-zinc-800'}`}>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <p className="text-[12px] font-bold text-[#3a342a] dark:text-zinc-100">{g.chatName || g.name}</p>
                  <p className="text-[9px] font-mono text-[#8a8172] mt-0.5 flex items-center gap-1">
                    <Clock size={10} /> Event ends {new Date(g.eventEndDate).toLocaleString()} · archives {new Date(g.expiresAt).toLocaleString()} · {g.memberCount} members
                  </p>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${meta.cls}`}>{meta.label}</span>
              </div>
              {g.status !== 'archived' && (
                <button onClick={() => archiveNow(g.id)} disabled={busy}
                  className="mt-2 flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-[#8a8172] hover:text-orange-600 transition-all">
                  <Archive size={11} /> Archive now
                </button>
              )}
            </div>
          );
        })}
      </div>
    </FeatureShell>
  );
}
