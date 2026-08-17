import { useEffect, useState } from 'react';
import { X, Users, Plus, Pencil, Check, Send } from 'lucide-react';

/**
 * Ocean — Collaborative Posts (Feature 162)
 * Create multi-author posts, invite collaborators, and co-edit sections.
 */
interface CollabPostsProps {
  token: string | null;
  currentUser: { id: string; name: string } | null;
  onClose: () => void;
}

interface Section {
  id: string;
  authorName: string;
  text: string;
  at: number;
}

interface Collab {
  id: string;
  title: string;
  content: string;
  authorName: string;
  collaborators: { id: string; name: string; accepted: boolean }[];
  sections: Section[];
}

export default function CollabPosts({ token, currentUser, onClose }: CollabPostsProps) {
  const [posts, setPosts] = useState<Collab[]>([]);
  const [openId, setOpenId] = useState('');
  const [title, setTitle] = useState('A shared essay on community resilience');
  const [content, setContent] = useState('');
  const [invitees, setInvitees] = useState('');
  const [sectionText, setSectionText] = useState('');
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const headers = token ? { Authorization: `Bearer ${token}` } : {};

  const load = async () => {
    if (!token) return;
    try {
      const r = await fetch('/api/collab', { headers });
      const d = await r.json();
      setPosts(d.posts || []);
    } catch { /* non-fatal */ }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const create = async () => {
    setBusy(true);
    setError('');
    try {
      const r = await fetch('/api/collab/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({
          title,
          content,
          inviteeIds: invitees.split(',').map((s) => s.trim()).filter(Boolean),
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Failed');
      setTitle('');
      setContent('');
      setInvitees('');
      setOpenId(d.post.id);
      load();
    } catch (e: any) {
      setError(e.message || 'Failed');
    } finally {
      setBusy(false);
    }
  };

  const addSection = async (id: string) => {
    if (!sectionText.trim()) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/collab/${id}/add-section`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ text: sectionText }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Failed');
      setSectionText('');
      setPosts((prev) => prev.map((p) => (p.id === id ? d.post : p)));
    } catch (e: any) {
      setError(e.message || 'Failed');
    } finally {
      setBusy(false);
    }
  };

  const saveEdit = async (id: string) => {
    setBusy(true);
    try {
      const r = await fetch(`/api/collab/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ title: editTitle, content: editContent }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Failed');
      setPosts((prev) => prev.map((p) => (p.id === id ? d.post : p)));
      setEditTitle('');
      setEditContent('');
    } catch (e: any) {
      setError(e.message || 'Failed');
    } finally {
      setBusy(false);
    }
  };

  const active = posts.find((p) => p.id === openId) || null;
  const canEdit = (p: Collab) =>
    !!currentUser && (p.authorName === currentUser.name || p.collaborators.some((c) => c.id === currentUser.id && c.accepted));

  return (
    <div className="fixed inset-0 z-[115] bg-[#141b2b]/60 dark:bg-[#05060c]/85 backdrop-blur-sm overflow-y-auto py-6 px-4">
      <div className="max-w-xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Users size={18} className="text-amber-800 dark:text-amber-400" />
            <h2 className="font-display font-bold text-lg text-[#3a342a] dark:text-zinc-100 tracking-tight">Collaborative Posts</h2>
            <span className="font-mono text-[9px] uppercase tracking-widest text-[#8a8172] dark:text-zinc-400">Feature 162</span>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-white/80 dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 flex items-center justify-center text-[#5c5446] dark:text-zinc-300 hover:bg-[#ebdcca]/50 transition-all" aria-label="Close">
            <X size={16} />
          </button>
        </div>

        {error && <p className="text-[10px] text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-xl p-2.5 mb-3">{error}</p>}

        {!active && (
          <div className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-[#fcfaf4] dark:bg-zinc-900 p-4 mb-3">
            <p className="text-[11px] text-[#5c5446] dark:text-zinc-300 leading-relaxed mb-3">
              One post, many authors. Invite collaborators — everyone accepted can edit and append sections.
            </p>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" className="w-full px-3 py-2.5 rounded-xl border border-[#ebdcca] dark:border-zinc-700 bg-white dark:bg-zinc-950 text-[12px] text-[#3a342a] dark:text-zinc-100 focus:outline-none focus:border-amber-500 mb-2" />
            <textarea value={content} onChange={(e) => setContent(e.target.value)} rows={2} placeholder="Opening lines…" className="w-full px-3 py-2.5 rounded-xl border border-[#ebdcca] dark:border-zinc-700 bg-white dark:bg-zinc-950 text-[12px] resize-none focus:outline-none focus:border-amber-500 mb-2" />
            <input value={invitees} onChange={(e) => setInvitees(e.target.value)} placeholder="Invite user IDs, comma-separated" className="w-full px-3 py-2.5 rounded-xl border border-[#ebdcca] dark:border-zinc-700 bg-white dark:bg-zinc-950 text-[12px] focus:outline-none focus:border-amber-500 mb-2" />
            <button onClick={create} disabled={busy || !currentUser} className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-800 dark:bg-amber-400 text-white dark:text-zinc-950 font-bold text-[11px] hover:brightness-110 transition-all disabled:opacity-40">
              <Plus size={13} /> Create collaborative post
            </button>
          </div>
        )}

        {active && (
          <div className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-[#fcfaf4] dark:bg-zinc-900 p-4 mb-3">
            <button onClick={() => setOpenId('')} className="text-[10px] font-bold text-[#8a8172] dark:text-zinc-400 hover:text-amber-700 transition-colors mb-2">← All posts</button>
            <p className="font-bold text-[13px] text-[#3a342a] dark:text-zinc-100">{active.title}</p>
            <p className="text-[9px] text-[#8a8172] dark:text-zinc-500 mb-2">
              by {active.authorName} · {active.collaborators.length} collaborator{active.collaborators.length === 1 ? '' : 's'}
            </p>
            <div className="flex flex-wrap gap-1 mb-2">
              {active.collaborators.map((c) => (
                <span key={c.id} className={`px-2 py-0.5 rounded-full text-[8px] font-bold ${c.accepted ? 'bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300' : 'bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300'}`}>
                  {c.name} {c.accepted ? '✓' : '(invited)'}
                </span>
              ))}
            </div>
            {active.content && <p className="text-[11px] text-[#5c5446] dark:text-zinc-300 mb-2">{active.content}</p>}
            <div className="space-y-1.5 mb-3">
              {active.sections.map((s) => (
                <div key={s.id} className="rounded-xl border border-[#ebdcca] dark:border-zinc-800 p-2.5">
                  <p className="text-[9px] font-bold text-[#8a8172] dark:text-zinc-400">{s.authorName} · {new Date(s.at).toLocaleString()}</p>
                  <p className="text-[11px] text-[#3a342a] dark:text-zinc-100">{s.text}</p>
                </div>
              ))}
            </div>

            {canEdit(active) && (
              <>
                <div className="flex gap-2 mb-2">
                  <input
                    value={sectionText}
                    onChange={(e) => setSectionText(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addSection(active.id)}
                    placeholder="Add a section as a co-author…"
                    className="flex-1 px-3 py-2 rounded-xl border border-[#ebdcca] dark:border-zinc-700 bg-white dark:bg-zinc-950 text-[11px] focus:outline-none focus:border-amber-500"
                  />
                  <button onClick={() => addSection(active.id)} className="flex items-center gap-1 px-3 rounded-xl bg-amber-800 dark:bg-amber-400 text-white dark:text-zinc-950 font-bold text-[10px] hover:brightness-110 transition-all">
                    <Send size={11} /> Add
                  </button>
                </div>
                <div className="flex gap-2">
                  <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} placeholder="Edit title" className="flex-1 px-3 py-2 rounded-xl border border-[#ebdcca] dark:border-zinc-700 bg-white dark:bg-zinc-950 text-[11px] focus:outline-none focus:border-amber-500" />
                  <input value={editContent} onChange={(e) => setEditContent(e.target.value)} placeholder="Edit opening lines" className="flex-1 px-3 py-2 rounded-xl border border-[#ebdcca] dark:border-zinc-700 bg-white dark:bg-zinc-950 text-[11px] focus:outline-none focus:border-amber-500" />
                  <button onClick={() => saveEdit(active.id)} className="flex items-center gap-1 px-3 rounded-xl border border-amber-700/40 dark:border-amber-400/40 text-amber-800 dark:text-amber-300 font-bold text-[10px] hover:bg-amber-50 dark:hover:bg-amber-950/40 transition-all">
                    <Pencil size={11} /> Save
                  </button>
                </div>
              </>
            )}
            {!canEdit(active) && <p className="text-[9px] text-[#8a8172] dark:text-zinc-500">Read-only — accept your invite to start editing.</p>}
          </div>
        )}

        {!active && posts.length > 0 && (
          <div className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-[#fcfaf4] dark:bg-zinc-900 p-4">
            <p className="font-mono text-[9px] uppercase tracking-widest text-[#8a8172] dark:text-zinc-500 mb-2">My collaborative posts</p>
            {posts.map((p) => (
              <button key={p.id} onClick={() => setOpenId(p.id)} className="w-full text-left rounded-xl border border-[#ebdcca] dark:border-zinc-800 p-2.5 mb-1.5 hover:border-amber-400 transition-all">
                <p className="text-[11px] font-bold text-[#3a342a] dark:text-zinc-100">{p.title}</p>
                <p className="text-[9px] text-[#8a8172] dark:text-zinc-500">{p.collaborators.length} collaborators · {p.sections.length} sections</p>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
