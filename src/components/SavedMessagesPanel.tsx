import { useCallback, useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Bookmark, X, Plus, Clock, MessageCircle, StickyNote } from 'lucide-react';

/**
 * Ocean — "Saved & Notes" panel
 * -----------------------------
 * Lists every message the user has bookmarked (GET /api/saved) and a
 * notes-to-self composer (POST /api/chat/self-notes). Unsave deletes the
 * bookmark via DELETE /api/chat/messages/:messageId/save.
 *
 * Ocean palette: bg-[#fcfaf4]/zinc-900 cards, #ebdcca borders, amber accents.
 */

interface SavedMessagesPanelProps {
  token: string | null;
  onClose?: () => void;
}

interface SavedMessageEntry {
  savedAt: number;
  message: {
    id: string;
    senderId?: string;
    senderName?: string;
    text?: string;
    timestamp?: number;
    mediaUrl?: string | null;
    mediaName?: string | null;
    deleted?: boolean;
  };
  conversationId: string;
  conversationName: string;
}

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 45) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 604800) return `${Math.floor(s / 86400)}d ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function SavedMessagesPanel({ token, onClose }: SavedMessagesPanelProps) {
  const [saved, setSaved] = useState<SavedMessageEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [unsavingId, setUnsavingId] = useState<string | null>(null);

  const toast = (message: string, variant?: string) => {
    window.dispatchEvent(new CustomEvent('show-toast', { detail: { message, variant } }));
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/saved', {
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: 'Bearer ' + token } : {}),
        },
      });
      if (res.ok) {
        const data = await res.json();
        setSaved(Array.isArray(data.saved) ? data.saved : []);
      }
    } catch (e) {
      console.error('Failed to load saved messages:', e);
    }
    setLoading(false);
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const addNote = async () => {
    const text = note.trim();
    if (!text) return;
    setSavingNote(true);
    try {
      const res = await fetch('/api/chat/self-notes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: 'Bearer ' + token } : {}),
        },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to save note.');
      }
      const data = await res.json();
      // Best-effort: auto-bookmark the freshly-created note so it shows in this panel.
      if (data?.message?.id && token) {
        try {
          await fetch(`/api/chat/messages/${encodeURIComponent(data.message.id)}/save`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
          });
        } catch {
          /* non-fatal */
        }
      }
      toast('📝 Note saved to self.');
      setNote('');
      load();
    } catch (e: any) {
      toast(e.message || 'Failed to save note.', 'destructive');
    } finally {
      setSavingNote(false);
    }
  };

  const unsave = async (entry: SavedMessageEntry) => {
    const messageId = entry.message?.id;
    if (!messageId) return;
    setUnsavingId(messageId);
    try {
      const res = await fetch(`/api/chat/messages/${encodeURIComponent(messageId)}/save`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: 'Bearer ' + token } : {}),
        },
      });
      if (!res.ok) throw new Error('Failed to unsave.');
      toast('Un-saved message.');
      load();
    } catch (e: any) {
      toast(e.message || 'Failed to unsave.', 'destructive');
    } finally {
      setUnsavingId(null);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 12 }}
      transition={{ duration: 0.2 }}
      className="bg-[#fcfaf4] dark:bg-zinc-900 border-2 border-[#ebdcca] dark:border-zinc-800 rounded-[2rem] p-5 md:p-6 space-y-4 shadow-xs w-full max-w-xl mx-auto"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-9 h-9 rounded-full bg-amber-800/10 dark:bg-amber-400/10 flex items-center justify-center">
            <Bookmark className="text-amber-800 dark:text-amber-400" size={16} />
          </span>
          <div>
            <h2 className="font-display text-lg font-bold text-[#3a342a] dark:text-zinc-100">Saved &amp; Notes</h2>
            <p className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-400">
              Messages &amp; thoughts kept for later
            </p>
          </div>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-[#8a8172] dark:text-zinc-400 hover:text-[#3a342a] dark:hover:text-zinc-100 transition-colors"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {/* Notes-to-self composer */}
      <div className="rounded-2xl border-2 border-[#ebdcca] dark:border-zinc-800 bg-white/60 dark:bg-zinc-800/40 p-3 space-y-2">
        <div className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-400">
          <StickyNote size={11} /> Note to self
        </div>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Remind yourself of anything…"
          rows={2}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              addNote();
            }
          }}
          className="w-full bg-transparent text-sm text-[#3a342a] dark:text-zinc-100 placeholder:text-[#8a8172] dark:placeholder:text-zinc-500 outline-none resize-none"
        />
        <div className="flex justify-end">
          <button
            onClick={addNote}
            disabled={savingNote || !note.trim()}
            className="font-mono text-[9px] uppercase font-bold tracking-wider py-1.5 px-3 rounded-lg bg-amber-800 text-white dark:bg-amber-400 dark:text-zinc-900 disabled:opacity-50 hover:bg-amber-900 transition-all flex items-center gap-1"
          >
            <Plus size={11} /> {savingNote ? 'Saving…' : 'Add note'}
          </button>
        </div>
      </div>

      {/* Saved messages */}
      {loading ? (
        <div className="py-12 text-center font-mono text-[10px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-400">
          Loading saved…
        </div>
      ) : saved.length === 0 ? (
        <div className="py-12 text-center space-y-2">
          <span className="inline-flex w-14 h-14 rounded-full bg-[#ebdcca]/40 dark:bg-zinc-800 items-center justify-center">
            <Bookmark className="text-[#8a8172] dark:text-zinc-500" size={22} />
          </span>
          <p className="font-display text-sm text-[#5c5446] dark:text-zinc-300">Nothing saved yet.</p>
          <p className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-500">
            Bookmark messages or jot a note to self
          </p>
        </div>
      ) : (
        <ul className="space-y-2.5 max-h-[45vh] overflow-y-auto pr-1">
          {saved.map((entry) => {
            const messageId = entry.message?.id;
            const deleted = entry.message?.deleted;
            const text = deleted ? 'This message was deleted' : entry.message?.text || '';
            const mediaHint = !text && entry.message?.mediaUrl ? 'Media message' : '';
            return (
              <li key={`${entry.savedAt}-${messageId || 'msg'}`}>
                <div className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-white/60 dark:bg-zinc-800/40 p-3 space-y-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-display text-xs font-bold text-[#3a342a] dark:text-zinc-100 truncate">
                        {entry.message?.senderName || 'Unknown'}
                      </span>
                      <span className="text-[10px] font-mono text-[#8a8172] dark:text-zinc-500 flex items-center gap-1 shrink-0">
                        <Clock size={10} /> {timeAgo(entry.savedAt)}
                      </span>
                    </div>
                    <button
                      onClick={() => unsave(entry)}
                      disabled={unsavingId === messageId}
                      className="font-mono text-[9px] uppercase font-bold tracking-wider px-2 py-1 rounded-lg bg-[#ebdcca]/40 dark:bg-zinc-800 text-[#8a8172] dark:text-zinc-400 hover:text-red-600 dark:hover:text-red-400 transition-colors disabled:opacity-50 shrink-0"
                    >
                      {unsavingId === messageId ? '…' : 'Unsave'}
                    </button>
                  </div>

                  <p
                    className={`text-xs leading-relaxed break-words ${
                      deleted ? 'italic text-[#8a8172] dark:text-zinc-500' : 'text-[#5c5446] dark:text-zinc-300'
                    }`}
                  >
                    {text || mediaHint || '…'}
                  </p>

                  <div className="flex items-center gap-1 text-[9px] font-mono uppercase tracking-wider text-[#8a8172] dark:text-zinc-500">
                    <MessageCircle size={10} />
                    <span className="truncate">{entry.conversationName || 'Chat'}</span>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </motion.div>
  );
}
