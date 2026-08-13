import React, { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowLeft, Check, Clapperboard, Copy, Eye, Link2, MessageSquareText, Music,
  Plus, Rocket, Send, Sparkles, Users, Video, X,
} from 'lucide-react';

/**
 * Ocean — Collaborative Reels
 * ----------------------------
 * Multiple co-creators build ONE reel together. Backed by /api/reels/*:
 *   GET  /api/reels/collab           my collabs (+ creatorsResolved)
 *   POST /api/reels/collab           create (owner = me)
 *   GET  /api/reels/collab/:id       one collab
 *   POST /api/reels/collab/:id/element  append clip/caption/sound
 *   POST /api/reels/collab/:id/publish  publish to feed
 *   POST /api/reels/collab/:id/view     attribute a view (rewards every creator)
 *   POST /api/reels/invite           generate invite code
 *   POST /api/reels/join             join by invite code
 *   GET  /api/reels/feed             published mini-feed
 *
 * Views reward every creator: each attributed view credits 1 coin to all
 * co-creators (attribution is a separate call so feed reads never inflate).
 */

interface CollabElement {
  id: string;
  kind: 'clip' | 'sound' | 'caption' | 'effect';
  by: string;
  byName?: string;
  addedAt: number;
  data: Record<string, unknown>;
}

interface CreatorRef {
  id: string;
  name: string;
  avatar: string;
}

interface CollabReel {
  id: string;
  reelId?: string;
  title: string;
  description?: string;
  creatorIds: string[];
  ownerId: string;
  inviteTokens: { code: string; role: string; expiresAt: number }[];
  elements: CollabElement[];
  status: 'draft' | 'published';
  createdAt: number;
  updatedAt: number;
  viewCount: number;
  likeCount: number;
  publishedAt?: number;
  creatorsResolved?: CreatorRef[];
}

interface CollaborativeReelsProps {
  token: string | null;
  currentUser: { id: string; name: string } | null;
  onClose: () => void;
}

const AVATAR_COLORS = [
  'bg-amber-600', 'bg-rose-600', 'bg-emerald-600', 'bg-sky-600',
  'bg-violet-600', 'bg-orange-600', 'bg-teal-600', 'bg-fuchsia-600',
];

function avatarColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 997;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

function initials(name: string): string {
  return (
    name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase() || '?'
  );
}

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function AvatarStack({ creators }: { creators: CreatorRef[] }) {
  const list = creators || [];
  const shown = list.slice(0, 4);
  const extra = list.length - shown.length;
  return (
    <div className="flex -space-x-2">
      {shown.map((c) => (
        <div
          key={c.id}
          title={c.name}
          className={`w-7 h-7 rounded-full border-2 border-[#fcfaf4] dark:border-zinc-900 flex items-center justify-center text-[9px] font-bold text-white overflow-hidden ${avatarColor(c.id)}`}
        >
          {c.avatar ? (
            <img src={c.avatar} alt={c.name} className="w-full h-full object-cover rounded-full" referrerPolicy="no-referrer" />
          ) : (
            initials(c.name)
          )}
        </div>
      ))}
      {extra > 0 && (
        <div className="w-7 h-7 rounded-full border-2 border-[#fcfaf4] dark:border-zinc-900 bg-[#8a8172] flex items-center justify-center text-[9px] font-bold text-white">
          +{extra}
        </div>
      )}
    </div>
  );
}

function ElementPreview({ element }: { element: CollabElement }) {
  const d = element.data || {};
  if (element.kind === 'clip') {
    const url = String(d.url || '');
    return (
      <div className="space-y-1.5">
        {url && (
          <video src={url} controls className="w-full max-h-40 rounded-lg bg-black/5 dark:bg-zinc-800" />
        )}
        <p className="text-xs text-[#5c5446] dark:text-zinc-300 break-all">{url}</p>
        {d.title ? <p className="text-[10px] text-[#8a8172]">{String(d.title)}</p> : null}
      </div>
    );
  }
  if (element.kind === 'caption') {
    return <p className="text-sm text-[#3a342a] dark:text-zinc-100 italic">“{String(d.text || '')}”</p>;
  }
  if (element.kind === 'sound') {
    return (
      <p className="flex items-center gap-1.5 text-xs text-[#5c5446] dark:text-zinc-300">
        <Music size={12} className="text-[#8a8172]" /> {String(d.name || 'Untitled sound')}
      </p>
    );
  }
  if (element.kind === 'effect') {
    return (
      <p className="flex items-center gap-1.5 text-xs text-[#5c5446] dark:text-zinc-300">
        <Sparkles size={12} className="text-[#8a8172]" /> {String(d.name || 'Effect')}
        {typeof d.intensity === 'number' ? ` · ${d.intensity}%` : ''}
      </p>
    );
  }
  return null;
}

export default function CollaborativeReels({ token, currentUser, onClose }: CollaborativeReelsProps) {
  const [collabs, setCollabs] = useState<CollabReel[]>([]);
  const [feed, setFeed] = useState<CollabReel[]>([]);
  const [loading, setLoading] = useState(true);

  const [createOpen, setCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [creating, setCreating] = useState(false);

  const [openId, setOpenId] = useState<string | null>(null);
  const [active, setActive] = useState<CollabReel | null>(null);

  const [elemKind, setElemKind] = useState<'clip' | 'caption' | 'sound'>('clip');
  const [elemField, setElemField] = useState('');
  const [addingElem, setAddingElem] = useState(false);

  const [inviteCode, setInviteCode] = useState('');
  const [copied, setCopied] = useState(false);

  const [joinCode, setJoinCode] = useState('');
  const [joining, setJoining] = useState(false);

  const [publishing, setPublishing] = useState(false);
  const [viewing, setViewing] = useState<{ viewCount: number; totalRewarded: number } | null>(null);

  const toast = (msg: string, variant?: string) => {
    window.dispatchEvent(new CustomEvent('show-toast', { detail: { message: msg, variant } }));
  };

  const api = useCallback(
    async (path: string, method = 'POST', body?: any) => {
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
    },
    [token]
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api('/api/reels/collab', 'GET');
      setCollabs(data.collabs || []);
    } catch (e: any) {
      toast(e.message || 'Failed to load collabs.', 'destructive');
    }
    setLoading(false);
  }, [api]);

  const loadFeed = useCallback(async () => {
    try {
      const data = await api('/api/reels/feed', 'GET');
      setFeed(data.collabs || []);
    } catch {
      // guest feed is best-effort
    }
  }, [api]);

  useEffect(() => {
    load();
    loadFeed();
  }, [load, loadFeed]);

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const openCollab = async (id: string) => {
    setOpenId(id);
    setActive(null);
    setInviteCode('');
    setCopied(false);
    setViewing(null);
    try {
      const data = await api(`/api/reels/collab/${id}`, 'GET');
      setActive(data.collab);
    } catch (e: any) {
      toast(e.message || 'Failed to open collab.', 'destructive');
      setOpenId(null);
    }
  };

  const closeCollab = () => {
    setOpenId(null);
    setActive(null);
    setInviteCode('');
    setViewing(null);
  };

  const createCollab = async () => {
    if (!newTitle.trim()) return toast('Give your collab a title.');
    setCreating(true);
    try {
      const data = await api('/api/reels/collab', 'POST', { title: newTitle.trim() });
      toast('Collab created. Invite friends to co-create!');
      setCreateOpen(false);
      setNewTitle('');
      await load();
      await openCollab(data.collab.id);
    } catch (e: any) {
      toast(e.message || 'Failed to create collab.', 'destructive');
    } finally {
      setCreating(false);
    }
  };

  const addElement = async () => {
    if (!active) return;
    let data: Record<string, unknown> = {};
    if (elemKind === 'clip') {
      const url = elemField.trim();
      if (!url) return toast('Paste a clip URL (video link or /uploads/...).');
      data = { url };
    } else if (elemKind === 'caption') {
      const text = elemField.trim();
      if (!text) return toast('Write a caption.');
      data = { text };
    } else if (elemKind === 'sound') {
      const name = elemField.trim();
      if (!name) return toast('Name the sound.');
      data = { name };
    }
    setAddingElem(true);
    try {
      const res = await api(`/api/reels/collab/${active.id}/element`, 'POST', { kind: elemKind, data });
      setElemField('');
      setActive((prev) =>
        prev ? { ...prev, elements: res.collab.elements, updatedAt: res.collab.updatedAt } : prev
      );
      toast(`${elemKind} added to the reel.`);
      load();
    } catch (e: any) {
      toast(e.message || 'Failed to add element.', 'destructive');
    } finally {
      setAddingElem(false);
    }
  };

  const invite = async () => {
    if (!active) return;
    try {
      const data = await api('/api/reels/invite', 'POST', { collabId: active.id, role: 'editor' });
      setInviteCode(data.inviteCode);
      await copyToClipboard(data.inviteCode);
      toast('Invite code copied — anyone with it can join as a co-creator.');
    } catch (e: any) {
      toast(e.message || 'Failed to create invite.', 'destructive');
    }
  };

  const joinByCode = async () => {
    const code = joinCode.trim();
    if (!code) return toast('Paste an invite code.');
    setJoining(true);
    try {
      const data = await api('/api/reels/join', 'POST', { inviteCode: code });
      toast('Joined the collab!');
      setJoinCode('');
      await load();
      await openCollab(data.collab.id);
    } catch (e: any) {
      toast(e.message || 'Invalid invite code.', 'destructive');
    } finally {
      setJoining(false);
    }
  };

  const publish = async () => {
    if (!active) return;
    setPublishing(true);
    try {
      const data = await api(`/api/reels/collab/${active.id}/publish`, 'POST');
      setActive((prev) =>
        prev ? { ...prev, status: data.collab.status, publishedAt: data.collab.publishedAt } : prev
      );
      toast('Collab published — it now appears in the reels feed.');
      load();
      loadFeed();
    } catch (e: any) {
      toast(e.message || 'Failed to publish.', 'destructive');
    } finally {
      setPublishing(false);
    }
  };

  const attributeView = async () => {
    if (!active) return;
    try {
      const data = await api(`/api/reels/collab/${active.id}/view`, 'POST');
      setViewing({ viewCount: data.viewCount, totalRewarded: data.totalRewarded || 0 });
      setActive((prev) => (prev ? { ...prev, viewCount: data.viewCount } : prev));
      toast(`View attributed — all ${data.totalRewarded || 0} creators each earned 1 coin.`);
      load();
    } catch (e: any) {
      toast(e.message || 'Failed to attribute view.', 'destructive');
    }
  };

  const meIsCreator = active ? active.creatorIds.includes(currentUser?.id || '') : false;

  return (
    <div className="max-w-xl mx-auto space-y-5">
      <div className="bg-[#fcfaf4] dark:bg-zinc-900 border-2 border-[#ebdcca] dark:border-zinc-800 rounded-[2rem] p-6 md:p-8 space-y-5 shadow-xs">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-9 h-9 rounded-full bg-violet-600/10 flex items-center justify-center">
              <Clapperboard className="text-violet-600" size={18} />
            </span>
            <div>
              <h2 className="font-display text-lg font-bold text-[#3a342a] dark:text-zinc-100">Collaborative Reels</h2>
              <p className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-400">Co-create one reel as a team</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-white/80 dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 flex items-center justify-center text-[#8a8172] dark:text-zinc-400 hover:text-[#3a342a] dark:hover:text-zinc-100"
          >
            <X size={16} />
          </button>
        </div>

        <p className="text-xs text-[#5c5446] dark:text-zinc-300 leading-relaxed">
          Build one reel with a group: everyone adds clips, captions, sounds and effects.
          <b> Views reward every creator</b> — each attributed view credits 1 coin to all co-creators.
        </p>

        {/* Join by invite code */}
        <div className="flex gap-2">
          <input
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') joinByCode(); }}
            placeholder="Paste an invite code (CR-XXXXXX)"
            className="flex-1 bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 rounded-xl px-3 py-2 text-xs text-[#3a342a] dark:text-zinc-100 outline-none focus:border-violet-400"
          />
          <button
            onClick={joinByCode}
            disabled={joining}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#3a342a] text-[#f4f1ea] text-[10px] font-mono uppercase font-bold hover:bg-[#52493b] disabled:opacity-50"
          >
            <Link2 size={12} /> Join
          </button>
        </div>

        {openId && active ? (
          <div className="space-y-4">
            {/* Detail header */}
            <div className="flex items-center justify-between">
              <button
                onClick={closeCollab}
                className="flex items-center gap-1.5 text-[10px] font-mono uppercase font-bold text-[#8a8172] hover:text-[#3a342a]"
              >
                <ArrowLeft size={12} /> Back
              </button>
              <span className={`text-[8px] font-mono uppercase px-1.5 py-0.5 rounded-full ${active.status === 'published' ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400' : 'bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400'}`}>
                {active.status}
              </span>
            </div>

            <div>
              <h3 className="font-display text-base font-bold text-[#3a342a] dark:text-zinc-100">{active.title}</h3>
              {active.description ? (
                <p className="text-xs text-[#5c5446] dark:text-zinc-300 mt-1">{active.description}</p>
              ) : null}
              <div className="flex items-center gap-2 mt-2">
                <AvatarStack creators={active.creatorsResolved || []} />
                <span className="text-[10px] font-mono text-[#8a8172] uppercase">
                  {active.creatorIds.length} creator{active.creatorIds.length === 1 ? '' : 's'} · {active.elements.length} elements · {active.viewCount} views
                </span>
              </div>
            </div>

            {/* Invite (co-creators only) */}
            {meIsCreator ? (
              <div className="rounded-2xl border border-[#ebdcca]/70 dark:border-zinc-700 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono uppercase font-bold text-[#5c5446] dark:text-zinc-300 flex items-center gap-1">
                    <Users size={11} /> Invite co-creators
                  </span>
                  <button
                    onClick={invite}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#3a342a] text-[#f4f1ea] text-[10px] font-mono uppercase font-bold hover:bg-[#52493b]"
                  >
                    <Plus size={11} /> Invite
                  </button>
                </div>
                {inviteCode ? (
                  <div className="flex items-center gap-2 bg-white/70 dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 rounded-xl px-3 py-2">
                    <code className="flex-1 text-xs font-mono text-violet-700 dark:text-violet-300">{inviteCode}</code>
                    <button onClick={() => copyToClipboard(inviteCode)} className="text-[#8a8172] hover:text-[#3a342a]">
                      {copied ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
                    </button>
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="text-[10px] font-mono uppercase text-[#8a8172]">You are viewing this collab — ask a creator for the invite code to edit it.</p>
            )}

            {/* Elements */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Clapperboard size={12} className="text-[#8a8172]" />
                <h4 className="text-[10px] font-mono uppercase font-bold text-[#5c5446] dark:text-zinc-300">Elements</h4>
              </div>
              {active.elements.length === 0 ? (
                <p className="text-xs text-[#8a8172] py-3 text-center border border-dashed border-[#ebdcca] dark:border-zinc-700 rounded-xl">
                  No elements yet — add the first clip, caption or sound.
                </p>
              ) : (
                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                  {active.elements.map((el) => (
                    <div key={el.id} className="rounded-xl border border-[#ebdcca]/70 dark:border-zinc-700 p-3 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[8px] font-mono uppercase bg-violet-50 text-violet-600 dark:bg-violet-950/40 dark:text-violet-300 px-1.5 py-0.5 rounded-full">{el.kind}</span>
                        <span className="text-[9px] font-mono text-[#8a8172]">{el.byName || 'Creator'} · {timeAgo(el.addedAt)}</span>
                      </div>
                      <ElementPreview element={el} />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Composer (co-creators only) */}
            {meIsCreator ? (
              <div className="rounded-2xl border border-[#ebdcca]/70 dark:border-zinc-700 p-3 space-y-2">
                <span className="text-[10px] font-mono uppercase font-bold text-[#5c5446] dark:text-zinc-300">
                  Add an element · by {currentUser?.name || 'you'}
                </span>
                <div className="flex gap-1.5">
                  {([
                    ['clip', 'Clip', Video],
                    ['caption', 'Caption', MessageSquareText],
                    ['sound', 'Sound', Music],
                  ] as const).map(([k, label, Icon]) => (
                    <button
                      key={k}
                      onClick={() => setElemKind(k)}
                      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[9px] font-mono uppercase font-bold transition-all ${
                        elemKind === k
                          ? 'bg-[#3a342a] text-[#f4f1ea]'
                          : 'bg-[#ebdcca]/40 dark:bg-zinc-800 text-[#5c5446] dark:text-zinc-400 hover:bg-[#ebdcca]/70'
                      }`}
                    >
                      <Icon size={11} /> {label}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    value={elemField}
                    onChange={(e) => setElemField(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') addElement(); }}
                    placeholder={
                      elemKind === 'clip'
                        ? 'Clip URL (video link or /uploads/...)'
                        : elemKind === 'caption'
                          ? 'Caption text'
                          : 'Sound / track name'
                    }
                    className="flex-1 bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 rounded-xl px-3 py-2 text-xs text-[#3a342a] dark:text-zinc-100 outline-none focus:border-violet-400"
                  />
                  <button
                    onClick={addElement}
                    disabled={addingElem}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#3a342a] text-[#f4f1ea] text-[10px] font-mono uppercase font-bold hover:bg-[#52493b] disabled:opacity-50"
                  >
                    <Send size={11} /> Add
                  </button>
                </div>
              </div>
            ) : null}

            {/* Publish + view attribution */}
            <div className="space-y-2">
              {meIsCreator && active.status === 'draft' ? (
                <button
                  onClick={publish}
                  disabled={publishing}
                  className="w-full flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-emerald-700 text-white text-[10px] font-mono uppercase font-bold hover:bg-emerald-800 disabled:opacity-50"
                >
                  <Rocket size={12} /> Publish to reels feed
                </button>
              ) : null}
              <div className="rounded-xl border border-[#ebdcca]/70 dark:border-zinc-700 p-3 space-y-2">
                <p className="text-[10px] text-[#8a8172] dark:text-zinc-400 flex items-center gap-1.5">
                  <Eye size={11} /> Views reward every creator — each attributed view credits 1 coin to all {active.creatorIds.length} co-creators.
                </p>
                <button
                  onClick={attributeView}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-[#cfcac0] dark:border-zinc-700 text-[10px] font-mono uppercase font-bold text-[#3a342a] dark:text-zinc-200 hover:bg-[#f6f1e7]"
                >
                  <Eye size={11} /> Attribute a view
                </button>
                {viewing ? (
                  <p className="text-[10px] font-mono text-[#5c5446] dark:text-zinc-300">
                    {viewing.viewCount} total views · {viewing.totalRewarded} coin{viewing.totalRewarded === 1 ? '' : 's'} distributed
                  </p>
                ) : null}
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* My collabs */}
            <div className="flex items-center justify-between">
              <h3 className="text-[10px] font-mono uppercase font-bold text-[#5c5446] dark:text-zinc-300">My collabs</h3>
              <button
                onClick={() => setCreateOpen(true)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#3a342a] text-[#f4f1ea] text-[10px] font-mono uppercase font-bold hover:bg-[#52493b]"
              >
                <Plus size={12} /> New collab
              </button>
            </div>

            {loading ? (
              <div className="py-14 text-center font-mono text-[10px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-400">Loading collabs…</div>
            ) : collabs.length === 0 ? (
              <div className="py-10 text-center space-y-2 border border-dashed border-[#ebdcca] dark:border-zinc-700 rounded-2xl">
                <Clapperboard className="mx-auto text-[#8a8172] dark:text-zinc-500" size={26} />
                <p className="font-display text-sm text-[#5c5446] dark:text-zinc-300">No collabs yet.</p>
                <p className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-500">Create one and invite co-creators</p>
              </div>
            ) : (
              <div className="space-y-3">
                {collabs.map((c) => (
                  <div key={c.id} className="rounded-2xl border border-[#ebdcca] dark:border-zinc-700 bg-white/70 dark:bg-zinc-900/70 p-4 space-y-3 shadow-sm">
                    <div className="flex items-center gap-3">
                      <AvatarStack creators={c.creatorsResolved || []} />
                      <div className="flex-1 min-w-0">
                        <h4 className="text-sm font-bold text-[#3a342a] dark:text-zinc-100 truncate">{c.title}</h4>
                        <div className="flex flex-wrap items-center gap-x-2 text-[9px] font-mono uppercase text-[#8a8172] dark:text-zinc-400 mt-0.5">
                          <span>{c.creatorIds.length} creator{c.creatorIds.length === 1 ? '' : 's'}</span>
                          <span>·</span>
                          <span>{c.elements.length} elements</span>
                          <span>·</span>
                          <span>{c.viewCount} views</span>
                        </div>
                      </div>
                      <span className={`text-[8px] font-mono uppercase px-1.5 py-0.5 rounded-full ${c.status === 'published' ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400' : 'bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400'}`}>
                        {c.status}
                      </span>
                      <button
                        onClick={() => openCollab(c.id)}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#3a342a] text-[#f4f1ea] text-[10px] font-mono uppercase font-bold hover:bg-[#52493b]"
                      >
                        Open
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Published feed */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Sparkles size={12} className="text-[#8a8172]" />
                <h3 className="text-[10px] font-mono uppercase font-bold text-[#5c5446] dark:text-zinc-300">Published collabs</h3>
              </div>
              {feed.length === 0 ? (
                <p className="text-[10px] text-[#8a8172] py-2">No published collabs yet — publish yours to appear here.</p>
              ) : (
                <div className="space-y-2">
                  {feed.slice(0, 5).map((c) => (
                    <div key={c.id} className="flex items-center gap-3 rounded-xl border border-[#ebdcca]/70 dark:border-zinc-700 p-3">
                      <AvatarStack creators={c.creatorsResolved || []} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-[#3a342a] dark:text-zinc-100 truncate">{c.title}</p>
                        <p className="text-[9px] font-mono uppercase text-[#8a8172]">{c.viewCount} views · {c.elements.length} elements</p>
                      </div>
                      <button
                        onClick={() => openCollab(c.id)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-[#cfcac0] dark:border-zinc-700 text-[9px] font-mono uppercase font-bold text-[#3a342a] dark:text-zinc-200 hover:bg-[#f6f1e7]"
                      >
                        View
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* New collab dialog */}
      <AnimatePresence>
        {createOpen && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setCreateOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.94, y: 12 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.94, y: 12 }}
              className="bg-[#fcfaf4] dark:bg-zinc-900 rounded-[1.75rem] p-6 w-full max-w-md border-2 border-[#ebdcca] dark:border-zinc-800 space-y-3 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <h3 className="font-display font-bold text-[#3a342a] dark:text-zinc-100 flex items-center gap-2">
                  <Clapperboard className="text-violet-600" size={16} /> New Collaborative Reel
                </h3>
                <button onClick={() => setCreateOpen(false)} className="text-[#8a8172] hover:text-[#3a342a]"><X size={16} /></button>
              </div>
              <input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') createCollab(); }}
                placeholder="Reel title"
                className="w-full bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 rounded-xl px-3 py-2 text-sm text-[#3a342a] dark:text-zinc-100 outline-none focus:border-violet-400"
              />
              <p className="text-[10px] text-[#8a8172] dark:text-zinc-400">
                You start as the owner. Invite co-creators to add clips, captions, sounds and effects.
              </p>
              <button
                onClick={createCollab}
                disabled={creating}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-[#3a342a] text-[#f4f1ea] text-[10px] font-mono uppercase font-bold hover:bg-[#52493b] disabled:opacity-50"
              >
                {creating ? 'Creating…' : 'Create collab'}
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
