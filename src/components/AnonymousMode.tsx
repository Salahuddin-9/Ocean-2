import React, { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  EyeOff, X, User, PenLine, Settings, Send, Trash2, Sparkles, RefreshCw, ShieldCheck,
} from 'lucide-react';

/**
 * Ocean — Anonymous & Pseudonymous Mode
 * -------------------------------------
 * Three tabs:
 *  - Identity: create / edit / delete a pseudonym (handle + displayName + emoji).
 *  - Incognito: compose + view anonymous posts (never the real identity).
 *  - Settings: toggle anonymousBrowsing + incognitoPosting privacy modes.
 */

interface AnonymousModeProps {
  token: string | null;
  currentUser: { id: string; name: string } | null;
  onClose: () => void;
}

interface Pseudonym {
  id: string;
  handle: string;
  displayName: string;
  avatarEmoji: string;
  createdAt: number;
}

interface IncognitoPost {
  id: string;
  handle: string;
  avatarEmoji: string;
  content: string;
  createdAt: number;
}

interface Modes {
  anonymousBrowsing: boolean;
  incognitoPosting: boolean;
}

interface PostRowProps {
  key?: string | number;
  post: IncognitoPost;
}

interface EmojiPickerProps {
  key?: string | number;
  value: string;
  onPick: (emoji: string) => void;
}

interface TabButtonProps {
  key?: string | number;
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}

interface ModeToggleRowProps {
  key?: string | number;
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}

const EMOJI_LIST = ['🌊', '🌙', '🦋', '🐚', '🌿', '🪐', '🐠', '🌸', '🎭', '🌌', '🍃', '🐺', '🕊️', '✨', '🫧', '🗝️'];

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function PostRow({ post }: PostRowProps) {
  return (
    <div className="bg-white/60 dark:bg-zinc-900/60 border border-[#ebdcca]/70 dark:border-zinc-800 rounded-2xl p-3 space-y-1.5">
      <div className="flex items-center gap-2">
        <span className="w-6 h-6 rounded-full bg-[#ebdcca]/40 dark:bg-zinc-800 flex items-center justify-center text-sm">
          {post.avatarEmoji || '🌊'}
        </span>
        <span className="font-mono text-[10px] font-bold text-[#3a342a] dark:text-zinc-100">@{post.handle}</span>
        <span className="ml-auto font-mono text-[9px] uppercase text-[#8a8172] dark:text-zinc-400">{timeAgo(post.createdAt)}</span>
      </div>
      <p className="text-sm text-[#3a342a] dark:text-zinc-100 whitespace-pre-wrap break-words">{post.content}</p>
    </div>
  );
}

function EmojiPicker({ value, onPick }: EmojiPickerProps) {
  return (
    <div className="grid grid-cols-8 gap-1.5">
      {EMOJI_LIST.map(e => (
        <button
          key={e}
          type="button"
          onClick={() => onPick(e)}
          className={`w-8 h-8 rounded-xl flex items-center justify-center text-lg transition-all ${
            value === e
              ? 'bg-[#3a342a] dark:bg-zinc-100 scale-110'
              : 'bg-[#ebdcca]/40 dark:bg-zinc-800 hover:bg-[#ebdcca]/70 dark:hover:bg-zinc-700'
          }`}
        >
          {e}
        </button>
      ))}
    </div>
  );
}

function TabButton({ active, onClick, icon, label }: TabButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-[10px] font-mono uppercase font-bold tracking-wider transition-all ${
        active
          ? 'bg-[#3a342a] text-[#f4f1ea] dark:bg-zinc-100 dark:text-zinc-900'
          : 'bg-[#ebdcca]/40 text-[#5c5446] dark:bg-zinc-800 dark:text-zinc-300 hover:bg-[#ebdcca]/70'
      }`}
    >
      {icon} {label}
    </button>
  );
}

function ModeToggleRow({ label, description, checked, onChange }: ModeToggleRowProps) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-[#ebdcca]/60 dark:border-zinc-800 last:border-0">
      <div className="pr-3">
        <p className="text-xs font-bold text-[#3a342a] dark:text-zinc-100">{label}</p>
        <p className="text-[10px] text-[#8a8172] dark:text-zinc-400">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`w-10 h-6 rounded-full relative transition-colors shrink-0 ${
          checked ? 'bg-[#3a342a] dark:bg-zinc-100' : 'bg-[#cfcac0] dark:bg-zinc-700'
        }`}
      >
        <span
          className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${
            checked ? 'left-[18px] dark:bg-zinc-900' : 'left-0.5'
          }`}
        />
      </button>
    </div>
  );
}

export default function AnonymousMode({ token, currentUser, onClose }: AnonymousModeProps) {
  const [tab, setTab] = useState<'identity' | 'incognito' | 'settings'>('identity');

  // Identity state
  const [pseudonym, setPseudonym] = useState<Pseudonym | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [avatarEmoji, setAvatarEmoji] = useState('🌊');
  const [identityLoading, setIdentityLoading] = useState(true);

  // Incognito state
  const [content, setContent] = useState('');
  const [posts, setPosts] = useState<IncognitoPost[]>([]);
  const [posting, setPosting] = useState(false);

  // Settings state
  const [modes, setModes] = useState<Modes>({ anonymousBrowsing: false, incognitoPosting: false });
  const [modesSaving, setModesSaving] = useState(false);

  const toast = (msg: string, variant?: string) => {
    window.dispatchEvent(new CustomEvent('show-toast', { detail: { message: msg, variant } }));
  };

  const api = useCallback(async (path: string, method = 'GET', body?: unknown) => {
    const res = await fetch(path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Request failed (${res.status})`);
    }
    return res.json();
  }, [token]);

  const loadPseudonym = useCallback(async () => {
    setIdentityLoading(true);
    try {
      const data = await api('/api/anonymous/pseudonym', 'GET');
      setPseudonym(data.pseudonym || null);
      if (data.pseudonym) {
        setDisplayName(data.pseudonym.displayName || '');
        setAvatarEmoji(data.pseudonym.avatarEmoji || '🌊');
      }
    } catch (e) {
      console.error('Failed to load pseudonym:', e);
    } finally {
      setIdentityLoading(false);
    }
  }, [api]);

  const loadPosts = useCallback(async () => {
    try {
      const data = await api('/api/anonymous/feed', 'GET');
      setPosts(data.posts || []);
    } catch (e) {
      console.error('Failed to load incognito feed:', e);
    }
  }, [api]);

  const loadModes = useCallback(async () => {
    if (!token) return;
    try {
      const data = await api('/api/anonymous/mode', 'GET');
      setModes({
        anonymousBrowsing: !!data.modes?.anonymousBrowsing,
        incognitoPosting: !!data.modes?.incognitoPosting,
      });
    } catch (e) {
      console.error('Failed to load modes:', e);
    }
  }, [api, token]);

  useEffect(() => {
    loadPseudonym();
    loadPosts();
    loadModes();
  }, [loadPseudonym, loadPosts, loadModes]);

  const createPseudonym = async () => {
    try {
      const data = await api('/api/anonymous/pseudonym', 'POST', {
        displayName: displayName.trim() || undefined,
        avatarEmoji,
      });
      setPseudonym(data.pseudonym);
      setDisplayName(data.pseudonym.displayName || '');
      setAvatarEmoji(data.pseudonym.avatarEmoji || '🌊');
      toast('Pseudonym created.');
    } catch (e: any) {
      toast(e.message || 'Failed to create pseudonym.', 'destructive');
    }
  };

  const updatePseudonym = async () => {
    try {
      const data = await api('/api/anonymous/pseudonym', 'PUT', {
        displayName: displayName.trim() || undefined,
        avatarEmoji,
      });
      setPseudonym(data.pseudonym);
      setDisplayName(data.pseudonym.displayName || '');
      setAvatarEmoji(data.pseudonym.avatarEmoji || '🌊');
      toast('Pseudonym updated.');
    } catch (e: any) {
      toast(e.message || 'Failed to update pseudonym.', 'destructive');
    }
  };

  const deletePseudonym = async () => {
    try {
      await api('/api/anonymous/pseudonym', 'DELETE');
      setPseudonym(null);
      setDisplayName('');
      setAvatarEmoji('🌊');
      toast('Pseudonym deleted.');
    } catch (e: any) {
      toast(e.message || 'Failed to delete pseudonym.', 'destructive');
    }
  };

  const submitPost = async () => {
    const text = content.trim();
    if (!text) return toast('Write something first.');
    if (text.length > 1000) return toast('Max 1000 characters.');
    if (!pseudonym) {
      toast('Create a pseudonym first (Identity tab).', 'destructive');
      setTab('identity');
      return;
    }
    setPosting(true);
    try {
      const data = await api('/api/anonymous/post', 'POST', { content: text });
      setPosts(prev => [data.post, ...prev]);
      setContent('');
      toast('Posted incognito.');
    } catch (e: any) {
      toast(e.message || 'Failed to post.', 'destructive');
    } finally {
      setPosting(false);
    }
  };

  const saveModes = async (next: Modes) => {
    setModes(next);
    if (!token) return;
    setModesSaving(true);
    try {
      const data = await api('/api/anonymous/mode', 'POST', next);
      setModes({
        anonymousBrowsing: !!data.modes?.anonymousBrowsing,
        incognitoPosting: !!data.modes?.incognitoPosting,
      });
      toast('Privacy modes saved.');
    } catch (e: any) {
      toast(e.message || 'Failed to save modes.', 'destructive');
    } finally {
      setModesSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[115] bg-[#f6f1e7]/95 dark:bg-zinc-950/95 backdrop-blur-sm overflow-y-auto py-6 px-4">
      <div className="max-w-xl mx-auto space-y-5">
        <div className="bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-3xl p-6 md:p-8 space-y-5 shadow-xs">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-9 h-9 rounded-full bg-[#3a342a]/10 dark:bg-zinc-800 flex items-center justify-center">
              <EyeOff className="text-[#3a342a] dark:text-zinc-100" size={18} />
            </span>
            <div>
              <h2 className="font-display text-lg font-bold text-[#3a342a] dark:text-zinc-100">Anonymous &amp; Pseudonymous</h2>
              <p className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-400">
                Post without your real identity
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-white/80 dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 flex items-center justify-center text-[#5c5446] dark:text-zinc-300 hover:bg-[#ebdcca]/50 transition-all"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        <p className="text-xs text-[#5c5446] dark:text-zinc-300 leading-relaxed">
          Create a pseudonym handle, post incognito to the anonymous wall, and choose your
          browsing modes. Your real name and id are <b>never</b> shown on anonymous content.
        </p>

        {/* Tabs */}
        <div className="flex gap-2">
          <TabButton active={tab === 'identity'} onClick={() => setTab('identity')} icon={<User size={12} />} label="Identity" />
          <TabButton active={tab === 'incognito'} onClick={() => setTab('incognito')} icon={<PenLine size={12} />} label="Incognito" />
          <TabButton active={tab === 'settings'} onClick={() => setTab('settings')} icon={<Settings size={12} />} label="Settings" />
        </div>

        <AnimatePresence mode="wait">
          {tab === 'identity' && (
            <motion.div
              key="identity"
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
              className="space-y-4"
            >
              {identityLoading ? (
                <div className="py-14 text-center font-mono text-[10px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-400">
                  Loading…
                </div>
              ) : (
                <>
                  {/* Current pseudonym */}
                  <div className="rounded-2xl border border-[#ebdcca]/70 dark:border-zinc-700 p-4 space-y-3 bg-white/50 dark:bg-zinc-900/50">
                    <div className="flex items-center gap-3">
                      <span className="w-12 h-12 rounded-2xl bg-[#ebdcca]/40 dark:bg-zinc-800 flex items-center justify-center text-2xl">
                        {pseudonym?.avatarEmoji || '🌊'}
                      </span>
                      <div>
                        <p className="font-display font-bold text-sm text-[#3a342a] dark:text-zinc-100">
                          {pseudonym ? pseudonym.displayName || 'Anonymous' : 'No pseudonym yet'}
                        </p>
                        <p className="font-mono text-[10px] text-[#8a8172] dark:text-zinc-400">
                          {pseudonym ? `@${pseudonym.handle}` : 'Create one to start posting incognito'}
                        </p>
                      </div>
                    </div>
                    {pseudonym && (
                      <button
                        onClick={deletePseudonym}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-300 text-[10px] font-mono uppercase font-bold hover:bg-red-100 transition-all"
                      >
                        <Trash2 size={12} /> Delete pseudonym
                      </button>
                    )}
                  </div>

                  {/* Edit / create form */}
                  <div className="rounded-2xl border border-[#ebdcca]/70 dark:border-zinc-700 p-4 space-y-3 bg-white/50 dark:bg-zinc-900/50">
                    <p className="text-[10px] font-mono uppercase font-bold tracking-wider text-[#5c5446] dark:text-zinc-300 flex items-center gap-1">
                      <Sparkles size={11} /> {pseudonym ? 'Edit pseudonym' : 'Create pseudonym'}
                    </p>
                    <input
                      value={displayName}
                      onChange={e => setDisplayName(e.target.value)}
                      placeholder="Display name (optional)"
                      maxLength={30}
                      className="w-full bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 rounded-xl px-3 py-2 text-sm text-[#3a342a] dark:text-zinc-100 outline-none focus:border-[#3a342a] dark:focus:border-zinc-500"
                    />
                    <div className="space-y-2">
                      <p className="text-[10px] font-mono uppercase tracking-wider text-[#8a8172] dark:text-zinc-400">Avatar emoji</p>
                      <EmojiPicker value={avatarEmoji} onPick={setAvatarEmoji} />
                    </div>
                    <button
                      onClick={pseudonym ? updatePseudonym : createPseudonym}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#3a342a] text-[#f4f1ea] text-[10px] font-mono uppercase font-bold hover:bg-[#52493b] transition-all"
                    >
                      <RefreshCw size={12} /> {pseudonym ? 'Save changes' : 'Generate handle'}
                    </button>
                    {!pseudonym && (
                      <p className="text-[10px] text-[#8a8172] dark:text-zinc-400">
                        A unique handle like <span className="font-mono text-[#3a342a] dark:text-zinc-200">quiet_lotus</span> is auto-generated.
                      </p>
                    )}
                  </div>
                </>
              )}
            </motion.div>
          )}

          {tab === 'incognito' && (
            <motion.div
              key="incognito"
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
              className="space-y-4"
            >
              {/* Composer */}
              <div className="rounded-2xl border border-[#ebdcca]/70 dark:border-zinc-700 p-4 space-y-3 bg-white/50 dark:bg-zinc-900/50">
                <div className="flex items-center gap-2">
                  <span className="w-7 h-7 rounded-full bg-[#ebdcca]/40 dark:bg-zinc-800 flex items-center justify-center text-sm">
                    {pseudonym?.avatarEmoji || '🌊'}
                  </span>
                  <span className="font-mono text-[10px] font-bold text-[#3a342a] dark:text-zinc-100">
                    {pseudonym ? `@${pseudonym.handle}` : 'No pseudonym yet'}
                  </span>
                  <span className="ml-auto font-mono text-[9px] uppercase text-[#8a8172] dark:text-zinc-400">
                    {content.length}/1000
                  </span>
                </div>
                <textarea
                  value={content}
                  onChange={e => setContent(e.target.value.slice(0, 1000))}
                  placeholder="Share something anonymously…"
                  rows={3}
                  className="w-full bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 rounded-xl px-3 py-2 text-sm text-[#3a342a] dark:text-zinc-100 outline-none focus:border-[#3a342a] dark:focus:border-zinc-500 resize-none"
                />
                <button
                  onClick={submitPost}
                  disabled={posting || !content.trim()}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#3a342a] text-[#f4f1ea] text-[10px] font-mono uppercase font-bold hover:bg-[#52493b] disabled:opacity-50 transition-all"
                >
                  <Send size={12} /> {posting ? 'Posting…' : 'Post incognito'}
                </button>
              </div>

              {/* Feed */}
              <div className="space-y-2">
                <p className="text-[10px] font-mono uppercase font-bold tracking-wider text-[#5c5446] dark:text-zinc-300 flex items-center gap-1">
                  <ShieldCheck size={11} /> Anonymous wall
                </p>
                {posts.length === 0 ? (
                  <div className="py-10 text-center space-y-2">
                    <EyeOff className="mx-auto text-[#8a8172] dark:text-zinc-500" size={22} />
                    <p className="font-display text-sm text-[#5c5446] dark:text-zinc-300">No anonymous posts yet.</p>
                    <p className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-500">Be the first to whisper</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {posts.map(post => (
                      <PostRow key={post.id} post={post} />
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {tab === 'settings' && (
            <motion.div
              key="settings"
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
              className="space-y-4"
            >
              <div className="rounded-2xl border border-[#ebdcca]/70 dark:border-zinc-700 p-4 bg-white/50 dark:bg-zinc-900/50">
                <div className="flex items-center gap-2 mb-1">
                  <Settings size={14} className="text-[#3a342a] dark:text-zinc-100" />
                  <p className="font-display font-bold text-sm text-[#3a342a] dark:text-zinc-100">Privacy modes</p>
                </div>
                <div className="mt-1">
                  <ModeToggleRow
                    label="Anonymous browsing"
                    description="Browse feeds without your activity being attributed to your account."
                    checked={modes.anonymousBrowsing}
                    onChange={v => saveModes({ ...modes, anonymousBrowsing: v })}
                  />
                  <ModeToggleRow
                    label="Incognito posting"
                    description="Default new posts to incognito mode when a pseudonym exists."
                    checked={modes.incognitoPosting}
                    onChange={v => saveModes({ ...modes, incognitoPosting: v })}
                  />
                </div>
                {modesSaving && (
                  <p className="text-[10px] font-mono uppercase tracking-wider text-[#8a8172] dark:text-zinc-400 mt-2">
                    Saving…
                  </p>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        </div>
      </div>
    </div>
  );
}