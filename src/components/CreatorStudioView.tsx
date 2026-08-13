import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  LayoutDashboard, Users, Eye, Heart, Plus, X, Video, Upload, Send,
  CheckCircle2, User, Sparkles, Clapperboard, Film, TrendingUp, Youtube,
} from 'lucide-react';

/**
 * Ocean — Creator Studio
 * ----------------------
 * Ported from base44-social-media's Creator Studio. Lets the signed-in user
 * publish long-form videos to their own channels.
 * Backed by /api/studio/stats, /api/channels* on the Express server.
 */

interface Channel {
  id: string;
  name: string;
  handle: string;
  category: string;
  description?: string;
  avatarUrl?: string;
  creatorId?: string;
  creatorName: string;
  subscriberIds: string[];
  subscriberCount: number;
  createdAt?: number;
}

interface ChannelVideo {
  id: string;
  channelId: string;
  title: string;
  description?: string;
  videoUrl: string;
  thumbnailUrl?: string;
  category?: string;
  duration?: string;
  views: number;
  likes: number;
  createdAt: number;
}

interface StudioStats {
  channelCount: number;
  videoCount: number;
  totalViews: number;
  totalSubscribers: number;
}

interface CreatorStudioViewProps {
  token: string | null;
  currentUser: { id: string; name: string } | null;
  onClose: () => void;
}

type Tab = 'dashboard' | 'channels' | 'upload';

const CATEGORIES = ['Gaming', 'Music', 'Education', 'Tech', 'Vlogs', 'Comedy', 'Sports', 'News', 'Tutorials', 'Other'];

const fmt = (n: number): string => {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}K`;
  return `${n}`;
};

const inputCls =
  'w-full bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 rounded-xl px-3 py-2 text-xs text-[#3a342a] dark:text-zinc-100 placeholder-[#8a8172]/60 outline-none focus:border-amber-400 transition-colors';

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={13} /> },
  { id: 'channels', label: 'Channels', icon: <Clapperboard size={13} /> },
  { id: 'upload', label: 'Upload', icon: <Upload size={13} /> },
];

export default function CreatorStudioView({ token, currentUser, onClose }: CreatorStudioViewProps) {
  const authToken = token ?? localStorage.getItem('secure_auth_token');
  const me = currentUser ?? { id: '', name: 'You' };

  const [tab, setTab] = useState<Tab>('dashboard');

  // Shared studio data
  const [stats, setStats] = useState<StudioStats | null>(null);
  const [myChannels, setMyChannels] = useState<Channel[]>([]);
  const [myVideos, setMyVideos] = useState<ChannelVideo[]>([]);

  // Channels tab
  const [channels, setChannels] = useState<Channel[]>([]);
  const [channelsLoading, setChannelsLoading] = useState(true);
  const [subscribeBusy, setSubscribeBusy] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [channelForm, setChannelForm] = useState({ name: '', handle: '', category: 'Other', description: '', avatarUrl: '' });
  const [creating, setCreating] = useState(false);

  // Upload tab
  const [videoForm, setVideoForm] = useState({ channelId: '', title: '', description: '', videoUrl: '', thumbnailUrl: '', category: 'Other', duration: '' });
  const [uploading, setUploading] = useState(false);

  // Dashboard loading
  const [statsLoading, setStatsLoading] = useState(true);

  const toast = (message: string, variant?: string) => {
    window.dispatchEvent(new CustomEvent('show-toast', { detail: { message, variant } }));
  };

  const api = useCallback(
    async (path: string, method = 'GET', body?: any) => {
      const res = await fetch(path, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Request failed (${res.status})`);
      }
      return res.json();
    },
    [authToken],
  );

  const loadStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const data = await api('/api/studio/stats');
      setStats(data.stats || null);
      setMyChannels(data.channels || []);
      setMyVideos(data.videos || []);
    } catch (e: any) {
      console.error('Failed to load studio stats:', e);
      toast(e.message || 'Failed to load studio stats.', 'destructive');
    }
    setStatsLoading(false);
  }, [api, toast]);

  const loadChannels = useCallback(async () => {
    setChannelsLoading(true);
    try {
      const data = await api('/api/channels');
      setChannels(data.channels || []);
    } catch (e: any) {
      console.error('Failed to load channels:', e);
      toast(e.message || 'Failed to load channels.', 'destructive');
    }
    setChannelsLoading(false);
  }, [api, toast]);

  useEffect(() => {
    loadStats();
    loadChannels();
  }, [loadStats, loadChannels]);

  // -------------------------------------------------------------------------
  // Channel actions
  // -------------------------------------------------------------------------

  const createChannel = async () => {
    if (!channelForm.name.trim()) return toast('Channel name is required.', 'destructive');
    setCreating(true);
    try {
      const data = await api('/api/channels', 'POST', channelForm);
      toast(`Channel "${data.channel.name}" created.`);
      setCreateOpen(false);
      setChannelForm({ name: '', handle: '', category: 'Other', description: '', avatarUrl: '' });
      loadChannels();
      loadStats();
    } catch (e: any) {
      toast(e.message || 'Failed to create channel.', 'destructive');
    } finally {
      setCreating(false);
    }
  };

  const toggleSubscribe = async (channel: Channel) => {
    setSubscribeBusy(channel.id);
    try {
      const data = await api(`/api/channels/${channel.id}/subscribe`, 'POST', {});
      setChannels(prev =>
        prev.map(c => {
          if (c.id !== channel.id) return c;
          const ids = data.subscribed
            ? Array.from(new Set([...(c.subscriberIds || []), me.id]))
            : (c.subscriberIds || []).filter(id => id !== me.id);
          return { ...c, subscriberIds: ids, subscriberCount: data.subscriberCount };
        }),
      );
      toast(data.subscribed ? `Subscribed to ${channel.name}.` : `Unsubscribed from ${channel.name}.`);
    } catch (e: any) {
      toast(e.message || 'Failed to update subscription.', 'destructive');
    } finally {
      setSubscribeBusy(null);
    }
  };

  // -------------------------------------------------------------------------
  // Video upload
  // -------------------------------------------------------------------------

  const uploadVideo = async () => {
    if (!videoForm.channelId) return toast('Pick a channel to publish to.', 'destructive');
    if (!videoForm.title.trim() || !videoForm.videoUrl.trim()) return toast('Title and video URL are required.', 'destructive');
    setUploading(true);
    try {
      await api(`/api/channels/${videoForm.channelId}/videos`, 'POST', videoForm);
      toast('Video published to your channel!');
      setVideoForm(prev => ({ ...prev, title: '', description: '', videoUrl: '', thumbnailUrl: '', category: 'Other', duration: '' }));
      loadStats();
      loadChannels();
    } catch (e: any) {
      toast(e.message || 'Failed to publish video.', 'destructive');
    } finally {
      setUploading(false);
    }
  };

  const switchToChannels = () => setTab('channels');

  const statsTiles = useMemo(
    () =>
      [
        { label: 'Channels', value: stats?.channelCount ?? 0, icon: <Clapperboard size={16} /> },
        { label: 'Videos', value: stats?.videoCount ?? 0, icon: <Video size={16} /> },
        { label: 'Total views', value: stats?.totalViews ?? 0, icon: <Eye size={16} /> },
        { label: 'Subscribers', value: stats?.totalSubscribers ?? 0, icon: <Users size={16} /> },
      ] as const,
    [stats],
  );

  return (
    <div className="max-w-xl mx-auto space-y-5">
      <div className="bg-[#fcfaf4] dark:bg-zinc-900 border-2 border-[#ebdcca] dark:border-zinc-800 rounded-[2rem] p-6 md:p-8 space-y-5 shadow-xs">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-9 h-9 rounded-full bg-amber-800/10 flex items-center justify-center">
              <Youtube className="text-amber-800 dark:text-amber-400" size={18} />
            </span>
            <div>
              <h2 className="font-display text-lg font-bold text-[#3a342a] dark:text-zinc-100">Creator Studio</h2>
              <p className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-400">Channels &amp; long-form video</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-[#8a8172] dark:text-zinc-400 hover:text-[#3a342a] dark:hover:text-zinc-100 transition-colors p-1"
            title="Close studio"
          >
            <X size={16} />
          </button>
        </div>

        <p className="text-xs text-[#5c5446] dark:text-zinc-300 leading-relaxed">
          Create channels, grow a subscriber base, and publish long-form videos to your audience.
          Every channel you own becomes a home for your uploads.
        </p>

        {/* Tabs */}
        <div className="flex gap-2 flex-wrap">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`font-mono text-[9px] uppercase font-bold tracking-wider py-1.5 px-3 rounded-full transition-all flex items-center gap-1.5 ${
                tab === t.id
                  ? 'bg-amber-800 text-white dark:bg-amber-400 dark:text-zinc-900'
                  : 'bg-[#ebdcca]/30 text-[#5c5446] dark:bg-zinc-800 dark:text-zinc-400 hover:bg-[#ebdcca]/60'
              }`}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {/* Tab content with motion transitions */}
        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
            className="space-y-4"
          >
            {tab === 'dashboard' && (
              <DashboardTab
                statsLoading={statsLoading}
                statsTiles={statsTiles}
                myChannels={myChannels}
                myVideos={myVideos}
                onGoUpload={() => setTab('upload')}
              />
            )}

            {tab === 'channels' && (
              <ChannelsTab
                channels={channels}
                loading={channelsLoading}
                me={me}
                subscribeBusy={subscribeBusy}
                onSubscribe={toggleSubscribe}
                onOpenCreate={() => setCreateOpen(true)}
              />
            )}

            {tab === 'upload' && (
              <UploadTab
                myChannels={myChannels}
                videoForm={videoForm}
                setVideoForm={setVideoForm}
                uploading={uploading}
                onUpload={uploadVideo}
                onGoChannels={switchToChannels}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Create channel dialog */}
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
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <h3 className="font-display font-bold text-[#3a342a] dark:text-zinc-100 flex items-center gap-2">
                  <Plus className="text-amber-800 dark:text-amber-400" size={16} /> Create Channel
                </h3>
                <button onClick={() => setCreateOpen(false)} className="text-[#8a8172] hover:text-[#3a342a]"><X size={16} /></button>
              </div>

              <input
                value={channelForm.name} onChange={e => setChannelForm({ ...channelForm, name: e.target.value })}
                placeholder="Channel name *"
                className={inputCls}
              />
              <input
                value={channelForm.handle} onChange={e => setChannelForm({ ...channelForm, handle: e.target.value })}
                placeholder="@handle (optional — default: name in lowercase)"
                className={inputCls}
              />
              <select
                value={channelForm.category} onChange={e => setChannelForm({ ...channelForm, category: e.target.value })}
                className={inputCls}
              >
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <textarea
                value={channelForm.description} onChange={e => setChannelForm({ ...channelForm, description: e.target.value })}
                placeholder="What is this channel about?"
                rows={3}
                className={`${inputCls} resize-none`}
              />
              <input
                value={channelForm.avatarUrl} onChange={e => setChannelForm({ ...channelForm, avatarUrl: e.target.value })}
                placeholder="Avatar image URL (optional)"
                className={inputCls}
              />

              <button
                onClick={createChannel} disabled={creating}
                className="w-full font-mono text-[10px] uppercase font-bold tracking-wider py-2.5 rounded-xl bg-amber-800 text-white dark:bg-amber-400 dark:text-zinc-900 hover:bg-amber-900 dark:hover:bg-amber-300 disabled:opacity-50 transition-all flex items-center justify-center gap-1.5"
              >
                <CheckCircle2 size={12} /> {creating ? 'Creating…' : 'Create channel'}
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function Avatar({ channel, className }: { channel: Channel; className?: string }) {
  const cls = className || 'w-10 h-10';
  if (channel.avatarUrl) {
    return <img src={channel.avatarUrl} alt={channel.name} className={`${cls} rounded-full object-cover bg-[#ebdcca]/40 dark:bg-zinc-800`} />;
  }
  return (
    <span className={`${cls} rounded-full bg-amber-800/10 dark:bg-amber-400/10 flex items-center justify-center text-amber-800 dark:text-amber-400 font-display font-bold`}>
      {(channel.name || '?').charAt(0).toUpperCase()}
    </span>
  );
}

interface DashboardTabProps {
  statsLoading: boolean;
  statsTiles: readonly { label: string; value: number; icon: React.ReactNode }[];
  myChannels: Channel[];
  myVideos: ChannelVideo[];
  onGoUpload: () => void;
}

function DashboardTab({ statsLoading, statsTiles, myChannels, myVideos, onGoUpload }: DashboardTabProps) {
  if (statsLoading) {
    return <div className="py-14 text-center font-mono text-[10px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-400">Loading studio…</div>;
  }

  const isEmpty = myChannels.length === 0 && myVideos.length === 0;

  return (
    <div className="space-y-4">
      {/* Stat tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {statsTiles.map(tile => (
          <div key={tile.label} className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-white/70 dark:bg-zinc-800/50 p-3 space-y-1.5">
            <span className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-400">
              <span className="text-amber-800 dark:text-amber-400">{tile.icon}</span> {tile.label}
            </span>
            <span className="block font-display text-xl font-bold text-[#3a342a] dark:text-zinc-100">{fmt(tile.value)}</span>
          </div>
        ))}
      </div>

      {isEmpty ? (
        <div className="py-10 text-center space-y-2">
          <Sparkles className="mx-auto text-[#8a8172] dark:text-zinc-500" size={26} />
          <p className="font-display text-sm text-[#5c5446] dark:text-zinc-300">No channel or video yet.</p>
          <p className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-500">Create a channel to start publishing</p>
          <button
            onClick={onGoUpload}
            className="mt-1 font-mono text-[9px] uppercase font-bold tracking-wider py-1.5 px-3 rounded-lg bg-amber-800 text-white dark:bg-amber-400 dark:text-zinc-900 hover:bg-amber-900 transition-all"
          >
            Go to upload
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {/* My channels */}
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-400">
              <Clapperboard size={11} className="text-amber-800 dark:text-amber-400" /> My channels
            </div>
            {myChannels.length === 0 ? (
              <div className="rounded-2xl border border-[#ebdcca]/70 dark:border-zinc-800 p-4 text-xs text-[#8a8172] dark:text-zinc-400">
                No channels yet. Create one in the Channels tab.
              </div>
            ) : (
              <div className="space-y-2">
                {myChannels.map(channel => (
                  <div key={channel.id} className="flex items-center gap-3 rounded-2xl border border-[#ebdcca]/70 dark:border-zinc-800 bg-white/70 dark:bg-zinc-800/40 p-3">
                    <Avatar channel={channel} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-display font-bold text-[#3a342a] dark:text-zinc-100 truncate">{channel.name}</div>
                      <div className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172]">@{channel.handle || channel.name.toLowerCase().replace(/\s+/g, '.')} · {channel.category}</div>
                    </div>
                    <span className="flex items-center gap-1 text-[10px] font-mono text-[#5c5446] dark:text-zinc-300">
                      <Users size={11} className="text-amber-800 dark:text-amber-400" /> {fmt(channel.subscriberCount)} subs
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* My videos */}
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-400">
              <Film size={11} className="text-amber-800 dark:text-amber-400" /> My videos
            </div>
            {myVideos.length === 0 ? (
              <div className="rounded-2xl border border-[#ebdcca]/70 dark:border-zinc-800 p-4 text-xs text-[#8a8172] dark:text-zinc-400">
                No published videos yet. Upload one from the Upload tab.
              </div>
            ) : (
              <div className="space-y-2">
                {myVideos.map(video => (
                  <div key={video.id} className="flex items-center gap-3 rounded-2xl border border-[#ebdcca]/70 dark:border-zinc-800 bg-white/70 dark:bg-zinc-800/40 p-3">
                    {video.thumbnailUrl ? (
                      <img src={video.thumbnailUrl} alt={video.title} className="w-12 h-12 rounded-xl object-cover bg-[#ebdcca]/40 dark:bg-zinc-800" />
                    ) : (
                      <span className="w-12 h-12 rounded-xl bg-amber-800/10 dark:bg-amber-400/10 flex items-center justify-center">
                        <Video size={18} className="text-amber-800 dark:text-amber-400" />
                      </span>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-display font-bold text-[#3a342a] dark:text-zinc-100 truncate">{video.title}</div>
                      <div className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172]">
                        {video.duration ? `${video.duration} · ` : ''}{video.category || 'Other'}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 text-[10px] font-mono text-[#5c5446] dark:text-zinc-300 shrink-0">
                      <span className="flex items-center gap-1"><Eye size={11} className="text-amber-800 dark:text-amber-400" /> {fmt(video.views)}</span>
                      <span className="flex items-center gap-1"><Heart size={11} className="text-amber-800 dark:text-amber-400" /> {fmt(video.likes)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

interface ChannelsTabProps {
  channels: Channel[];
  loading: boolean;
  me: { id: string; name: string };
  subscribeBusy: string | null;
  onSubscribe: (channel: Channel) => void;
  onOpenCreate: () => void;
}

function ChannelsTab({ channels, loading, me, subscribeBusy, onSubscribe, onOpenCreate }: ChannelsTabProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-400 flex items-center gap-1.5">
          <Clapperboard size={11} className="text-amber-800 dark:text-amber-400" /> {channels.length} channel{channels.length === 1 ? '' : 's'}
        </span>
        <button
          onClick={onOpenCreate}
          className="font-mono text-[9px] uppercase font-bold tracking-wider text-amber-800 dark:text-amber-400 py-2 px-3 rounded-xl border border-amber-200/50 dark:border-zinc-700 hover:bg-amber-50/50 dark:hover:bg-zinc-800 transition-all flex items-center gap-1"
        >
          <Plus size={12} /> Create channel
        </button>
      </div>

      {loading ? (
        <div className="py-14 text-center font-mono text-[10px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-400">Loading channels…</div>
      ) : channels.length === 0 ? (
        <div className="py-14 text-center space-y-2">
          <TrendingUp className="mx-auto text-[#8a8172] dark:text-zinc-500" size={26} />
          <p className="font-display text-sm text-[#5c5446] dark:text-zinc-300">No channels yet.</p>
          <p className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-500">Be the first creator</p>
        </div>
      ) : (
        <div className="space-y-2">
          {channels.map(channel => {
            const subscribed = channel.subscriberIds?.includes(me.id);
            const busy = subscribeBusy === channel.id;
            return (
              <motion.div key={channel.id} layout>
                <div className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-white/70 dark:bg-zinc-800/40 p-4 space-y-2">
                  <div className="flex items-center gap-3">
                    <Avatar channel={channel} className="w-11 h-11" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h4 className="font-display font-bold text-sm text-[#3a342a] dark:text-zinc-100 truncate">{channel.name}</h4>
                        {channel.creatorId === me.id && (
                          <span className="font-mono text-[9px] px-1.5 py-0.5 rounded-full bg-amber-800/10 dark:bg-amber-400/10 text-amber-800 dark:text-amber-400 uppercase tracking-wider">Yours</span>
                        )}
                      </div>
                      <div className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172]">
                        @{channel.handle || channel.name.toLowerCase().replace(/\s+/g, '.')} · {channel.category}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-display font-bold text-lg text-[#3a342a] dark:text-zinc-100 leading-none">{fmt(channel.subscriberCount)}</div>
                      <div className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] flex items-center gap-1 justify-end">
                        <Users size={10} /> subscribers
                      </div>
                    </div>
                  </div>
                  {channel.description && (
                    <p className="text-xs text-[#5c5446] dark:text-zinc-300 leading-relaxed">{channel.description}</p>
                  )}
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-[#8a8172] dark:text-zinc-400 font-mono uppercase tracking-wide flex items-center gap-1">
                      <User size={10} /> {channel.creatorName}
                    </span>
                    {channel.creatorId !== me.id && (
                      <button
                        onClick={() => onSubscribe(channel)}
                        disabled={busy}
                        className={`font-mono text-[9px] uppercase font-bold tracking-wider py-1.5 px-3 rounded-lg transition-all flex items-center gap-1 disabled:opacity-50 ${
                          subscribed
                            ? 'bg-[#ebdcca]/50 dark:bg-zinc-800 text-[#5c5446] dark:text-zinc-300'
                            : 'bg-amber-800 text-white dark:bg-amber-400 dark:text-zinc-900 hover:bg-amber-900'
                        }`}
                      >
                        {subscribed ? <CheckCircle2 size={11} /> : <Users size={11} />}
                        {busy ? '…' : subscribed ? 'Subscribed' : 'Subscribe'}
                      </button>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}

interface UploadTabProps {
  myChannels: Channel[];
  videoForm: { channelId: string; title: string; description: string; videoUrl: string; thumbnailUrl: string; category: string; duration: string };
  setVideoForm: React.Dispatch<React.SetStateAction<{ channelId: string; title: string; description: string; videoUrl: string; thumbnailUrl: string; category: string; duration: string }>>;
  uploading: boolean;
  onUpload: () => void;
  onGoChannels: () => void;
}

function UploadTab({ myChannels, videoForm, setVideoForm, uploading, onUpload, onGoChannels }: UploadTabProps) {
  if (myChannels.length === 0) {
    return (
      <div className="py-14 text-center space-y-2">
        <Send className="mx-auto text-[#8a8172] dark:text-zinc-500" size={26} />
        <p className="font-display text-sm text-[#5c5446] dark:text-zinc-300">You need a channel to publish videos.</p>
        <p className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-500">Create one in the Channels tab</p>
        <button
          onClick={onGoChannels}
          className="mt-1 font-mono text-[9px] uppercase font-bold tracking-wider py-1.5 px-3 rounded-lg bg-amber-800 text-white dark:bg-amber-400 dark:text-zinc-900 hover:bg-amber-900 transition-all"
        >
          Create channel
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-white/70 dark:bg-zinc-800/40 p-4 space-y-3">
      <div className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-400">
        <Upload size={11} className="text-amber-800 dark:text-amber-400" /> Publish to your channel
      </div>

      <div className="space-y-1.5">
        <label className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172]">Channel *</label>
        <select
          value={videoForm.channelId || myChannels[0]?.id || ''}
          onChange={e => setVideoForm(prev => ({ ...prev, channelId: e.target.value }))}
          className={inputCls}
        >
          {myChannels.map(c => <option key={c.id} value={c.id}>{c.name} (@{c.handle || c.name.toLowerCase().replace(/\s+/g, '.')})</option>)}
        </select>
      </div>

      <input
        value={videoForm.title} onChange={e => setVideoForm(prev => ({ ...prev, title: e.target.value }))}
        placeholder="Video title *"
        className={inputCls}
      />
      <textarea
        value={videoForm.description} onChange={e => setVideoForm(prev => ({ ...prev, description: e.target.value }))}
        placeholder="Description (optional)"
        rows={2}
        className={`${inputCls} resize-none`}
      />
      <input
        value={videoForm.videoUrl} onChange={e => setVideoForm(prev => ({ ...prev, videoUrl: e.target.value }))}
        placeholder="Video URL * (mp4 / stream link)"
        className={inputCls}
      />
      <input
        value={videoForm.thumbnailUrl} onChange={e => setVideoForm(prev => ({ ...prev, thumbnailUrl: e.target.value }))}
        placeholder="Thumbnail image URL (optional)"
        className={inputCls}
      />
      <div className="grid grid-cols-2 gap-2">
        <select
          value={videoForm.category} onChange={e => setVideoForm(prev => ({ ...prev, category: e.target.value }))}
          className={inputCls}
        >
          {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <input
          value={videoForm.duration} onChange={e => setVideoForm(prev => ({ ...prev, duration: e.target.value }))}
          placeholder="Duration e.g. 12:34"
          className={inputCls}
        />
      </div>

      <button
        onClick={onUpload} disabled={uploading}
        className="w-full font-mono text-[10px] uppercase font-bold tracking-wider py-2.5 rounded-xl bg-amber-800 text-white dark:bg-amber-400 dark:text-zinc-900 hover:bg-amber-900 dark:hover:bg-amber-300 disabled:opacity-50 transition-all flex items-center justify-center gap-1.5"
      >
        <Send size={12} /> {uploading ? 'Publishing…' : 'Publish video'}
      </button>
    </div>
  );
}
