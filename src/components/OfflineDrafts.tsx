import { useEffect, useState } from 'react';
import { CloudOff, Cloud, Send, Trash2, RefreshCw, FileText, MessageSquare, Clapperboard } from 'lucide-react';
import FeatureShell, { toast, authHeaders } from './FeatureShell';
import {
  isOnline, onOnlineChange, saveDraft, listDrafts, removeDraft, markSynced,
  enqueueSend, pendingQueue, flushQueue, clearDrafts,
  type Draft, type DraftKind,
} from '../lib/offlineDrafts';

interface Props {
  token: string | null;
  currentUser: { id: string; name: string } | null;
  onClose: () => void;
}

const KIND_META: Record<string, { icon: any; label: string; placeholder: string }> = {
  post: { icon: FileText, label: 'Post', placeholder: 'Draft a post… (saved locally while you type)' },
  message: { icon: MessageSquare, label: 'Message', placeholder: 'Draft a chat message…' },
  reel: { icon: Clapperboard, label: 'Reel', placeholder: 'Draft a reel caption…' },
};

export default function OfflineDrafts({ token, currentUser, onClose }: Props) {
  const [online, setOnline] = useState(isOnline());
  const [kind, setKind] = useState<keyof typeof KIND_META>('post');
  const [text, setText] = useState('');
  const [drafts, setDrafts] = useState<Draft[]>(listDrafts());
  const [queue, setQueue] = useState(pendingQueue());
  const [syncing, setSyncing] = useState(false);

  useEffect(() => onOnlineChange(setOnline), []);

  useEffect(() => {
    if (!text.trim()) return;
    const t = setTimeout(() => {
      saveDraft(kind as DraftKind, text);
      setDrafts(listDrafts());
    }, 400);
    return () => clearTimeout(t);
  }, [text, kind]);

  const send = async () => {
    const content = text.trim();
    if (!content) return;
    if (online) {
      try {
        const res = await fetch('/api/posts/create', {
          method: 'POST',
          headers: authHeaders(token),
          body: JSON.stringify({ title: content.slice(0, 80), content, type: 'text' }),
        });
        if (res.ok) {
          markSynced(listDrafts().find((d) => d.text === content)?.id || '');
          setDrafts(listDrafts());
          toast('📤 Post published (online sync)');
        } else {
          enqueueSend(kind as DraftKind, content);
          setQueue(pendingQueue());
          toast('⛔ Server rejected the post — added to outbox');
        }
      } catch {
        enqueueSend(kind as DraftKind, content);
        setQueue(pendingQueue());
        toast('📡 Offline — post queued in outbox');
      }
    } else {
      enqueueSend(kind as DraftKind, content);
      setQueue(pendingQueue());
      toast('📡 Queued — will sync automatically when you reconnect');
    }
    setText('');
  };

  const syncAll = async () => {
    setSyncing(true);
    const result = await flushQueue(async (item) => {
      const res = await fetch('/api/posts/create', {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({ title: item.text.slice(0, 80), content: item.text, type: 'text' }),
      });
      return res.ok;
    });
    setQueue(pendingQueue());
    setSyncing(false);
    toast(`🔁 Outbox sync: ${result.synced} sent, ${result.failed} failed`);
  };

  return (
    <FeatureShell title="Offline Drafts & Smart Sync" badge="14" icon={<CloudOff size={18} className="text-sky-700 dark:text-sky-400" />} onClose={onClose}>
      <div className={`mb-4 flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold ${online ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800' : 'bg-amber-50 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800'}`}>
        {online ? <Cloud size={14} /> : <CloudOff size={14} />}
        {online ? 'Online — sending goes straight to the server. Drafts still autosave.' : 'Offline — everything you type autosaves and queues for sync.'}
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-2xl p-4">
          <div className="flex gap-1.5 mb-3">
            {Object.entries(KIND_META).map(([k, m]) => (
              <button key={k} onClick={() => setKind(k as keyof typeof KIND_META)}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 transition-all ${kind === k ? 'bg-amber-800 text-[#f4f1ea]' : 'bg-white dark:bg-zinc-800 text-[#8a8172] border border-[#ebdcca] dark:border-zinc-700'}`}>
                <m.icon size={11} /> {m.label}
              </button>
            ))}
          </div>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4}
            placeholder={KIND_META[kind].placeholder}
            className="w-full bg-white dark:bg-zinc-800 border border-[#cfcac0] dark:border-zinc-700 rounded-xl p-3 font-sans text-xs text-[#3a342a] dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-amber-600 resize-none" />
          <button onClick={send} disabled={!text.trim()}
            className="mt-2 w-full flex items-center justify-center gap-1.5 rounded-xl bg-amber-800 hover:bg-amber-700 text-[#f4f1ea] text-[11px] font-bold uppercase tracking-wider py-2 transition-all disabled:opacity-40">
            <Send size={12} /> {online ? 'Publish (online)' : 'Queue (offline)'}
          </button>
        </div>

        <div className="bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-2xl p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="font-mono text-[9px] font-bold text-[#8a8172] uppercase tracking-wider">Local drafts ({drafts.length})</span>
            <div className="flex gap-1.5">
              {queue.length > 0 && (
                <button onClick={syncAll} disabled={syncing || !online}
                  className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold bg-sky-600 hover:bg-sky-500 text-white transition-all disabled:opacity-40">
                  <RefreshCw size={11} className={syncing ? 'animate-spin' : ''} /> Sync {queue.length}
                </button>
              )}
              <button onClick={() => { clearDrafts(); setDrafts([]); }}
                className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold bg-white dark:bg-zinc-800 text-[#8a8172] border border-[#ebdcca] dark:border-zinc-700 hover:text-rose-600 transition-all">
                <Trash2 size={11} /> Clear
              </button>
            </div>
          </div>
          <div className="space-y-1.5 max-h-52 overflow-y-auto">
            {drafts.length === 0 && <p className="text-[10px] text-[#8a8172] italic">Nothing saved yet — start typing in the composer.</p>}
            {drafts.map((d) => {
              const m = KIND_META[d.kind] || KIND_META.post;
              return (
                <div key={d.id} className="flex items-start gap-2 bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 rounded-lg px-2.5 py-2">
                  <m.icon size={12} className="mt-0.5 text-amber-700 dark:text-amber-400 shrink-0" />
                  <p className="text-[10px] text-[#3a342a] dark:text-zinc-200 flex-1 line-clamp-2">{d.text || '(empty)'}</p>
                  <span className="text-[8px] font-mono text-[#8a8172] shrink-0">{d.syncedAt ? 'synced' : 'local'}</span>
                  <button onClick={() => { removeDraft(d.id); setDrafts(listDrafts()); }} className="text-[#8a8172] hover:text-rose-600 shrink-0"><Trash2 size={11} /></button>
                </div>
              );
            })}
          </div>

          <div className="mt-3">
            <span className="font-mono text-[9px] font-bold text-[#8a8172] uppercase tracking-wider">Outbox queue ({queue.length})</span>
            <div className="space-y-1.5 mt-1.5 max-h-36 overflow-y-auto">
              {queue.length === 0 && <p className="text-[10px] text-[#8a8172] italic">Queue empty — your offline sends wait here until you reconnect.</p>}
              {queue.map((q) => (
                <div key={q.id} className="flex items-center gap-2 bg-sky-50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-800 rounded-lg px-2.5 py-1.5">
                  <CloudOff size={11} className="text-sky-700 dark:text-sky-400 shrink-0" />
                  <p className="text-[10px] text-[#3a342a] dark:text-zinc-200 flex-1 truncate">{q.text}</p>
                  <span className="text-[8px] font-mono text-sky-700 dark:text-sky-400 shrink-0">pending</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </FeatureShell>
  );
}
