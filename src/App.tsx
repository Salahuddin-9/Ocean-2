import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, Eye, Edit, Save, RotateCcw, Shield, Rss, MessageSquare, Compass, Settings, Send, Siren, X, Check, Wand2, Globe, Radio, BarChart3, Languages, ExternalLink, UserPlus, UserCheck, Flame, Lock, Unlock, Heart, Star, Waves, Users, Calendar, User, Trash2, Plus, Bookmark, Share2, Mic, Video, Image, StopCircle, Archive, Bell, Repeat, AtSign, Clock, Download, MoreVertical, AlertCircle, Search, Play, ChevronUp, ChevronDown, Tv, TrendingUp, Maximize2, ArrowLeft, Pause, Volume2, VolumeX, ChevronLeft, ChevronRight, Upload, Sun, Moon, Music, Hash, ThumbsUp, ThumbsDown, PenTool, PenLine, Smartphone, Scissors } from 'lucide-react';
import { UserProfile, Post } from './types';
import { turtleRankingEngine } from './turtleRankingEngine';
import { hybridRankItems, buildHybridContext } from './lib/hybridRanker';
import CommunitySection from './components/CommunitySection';
import { screenContentText, screenImageSource } from '../turtleNSFWFilter';
import { saveMediaItem, getMediaItem } from './utils/mediaStore';
import { AudioService } from './audioService';
import { DEFAULT_PROFILE } from './defaultData';
import { MOCK_REELS, REELS_CATEGORIES, Reel } from './reelsData';
import { ReelAICaptionGenerator } from './turtleReelsBackend';
import IdentityCard from './components/IdentityCard';
import PostsSection, { PostTimestamp } from './components/PostsSection';
import CommentsModal from './components/CommentsModal';
import ChatModal from './components/ChatModal';
import TimeCapsuleLock from './components/TimeCapsuleLock';
import NeedPostPortal from './components/NeedPostPortal';
import MeetView from './components/MeetView';
import VoiceNotePlayback from './components/VoiceNotePlayback';
import HashtagTrendSection from './components/HashtagTrendSection';
import SOSEmergencyButton from './components/SOSEmergencyButton';
import OfflineMeshFab from './components/OfflineMeshFab';
import EmergencyView from './components/EmergencyView';
import LoginActivitySection from './components/LoginActivitySection';
import RecoveryVerifyModal from './components/RecoveryVerifyModal';
import NSFWStrictnessSettings from './components/NSFWStrictnessSettings';
import AwaySummaryCard from './components/AwaySummaryCard';
import CreatorStudioView from './components/CreatorStudioView';
import GeohashDiscovery from './components/GeohashDiscovery';
import StreamAdminDashboard from './components/StreamAdminDashboard';
import EncryptedTimeCapsuleModal from './components/EncryptedTimeCapsuleModal';
import RandomTextDmView from './components/RandomTextDmView';
import { getNsfwSettings } from './lib/nsfwSettings';
import { InteractiveDemo } from './components/InteractiveDemo';
import { ArchitectureDiagram } from './components/ArchitectureDiagram';
import { NSFWMediaGuard } from './components/NSFWMediaGuard';
import { CallEngineProvider } from './calling/useCallEngine';
import { encryptBackup, decryptBackup } from './lib/crypto-browser';
import { generateRecoveryPhrase } from './lib/security';
import { computeBadges } from './lib/badges';
import { AdminPanel } from './components/AdminPanel';
import NewFeaturesHub from './components/NewFeaturesHub';
import VisualSearch from './components/VisualSearch';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc, getDocs, doc, getDocFromServer } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import firebaseConfig from '../firebase-applet-config.json';

// ── Editor engines (lazy — each engine's heavy bundle loads only when opened) ──
const PhotoEditorModal = React.lazy(() => import('./components/editors/PhotoEditorModal'));
const OceanCanvasDesign = React.lazy(() => import('./components/editors/OceanCanvasDesign'));
const OceanWhiteboard = React.lazy(() => import('./components/editors/OceanWhiteboard'));
const StoryEditor = React.lazy(() => import('./components/editors/StoryEditor'));
const OceanCutVideo = React.lazy(() => import('./components/editors/OceanCutVideo'));
import { postJsonToApi, createId } from './lib/editors/media';

const isFirestoreEnabled = !!(firebaseConfig.projectId && !firebaseConfig.projectId.includes("placeholder") && !firebaseConfig.projectId.includes("remixed"));

const firebaseApp = (isFirestoreEnabled ? initializeApp(firebaseConfig) : null) as any;
const db = (firebaseApp ? getFirestore(firebaseApp, firebaseConfig.firestoreDatabaseId) : null) as any;
const auth = (firebaseApp ? getAuth(firebaseApp) : null) as any;

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.warn('Firestore Error: ', JSON.stringify(errInfo));
  // Do not throw to avoid crashing the app and allow graceful local fallback
}

async function testConnection() {
  const isFirestoreEnabled = firebaseConfig.projectId && !firebaseConfig.projectId.includes("placeholder") && !firebaseConfig.projectId.includes("remixed");
  if (!isFirestoreEnabled) return;
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn("Please check your Firebase configuration.");
    }
  }
}
testConnection();

interface Channel {
  id: string;
  handle: string;
  name: string;
  description: string;
  avatarUrl: string;
  subscribers: number;
  verified: boolean;
  category: string;
}

const VERIFIED_CHANNELS: Channel[] = [];

interface ChannelBroadcast {
  id: string;
  channelId: string;
  title: string;
  content: string;
  date: string;
  likes: number;
  comments: number;
  imageUrl?: string;
}

const CHANNEL_BROADCASTS: ChannelBroadcast[] = [];

export interface OceanVideo {
  id: string;
  title: string;
  creatorName: string;
  creatorHandle?: string;
  creatorAvatarUrl: string;
  thumbnailUrl: string;
  duration: string;
  views: string;
  timeAgo: string;
  category: string;
  description: string;
  likes: number;
  videoUrl?: string;
  comments?: any[];
  subtitles?: string[];
}

export interface VoicePost {
  id: string;
  title: string;
  creatorName: string;
  creatorHandle: string;
  creatorAvatarUrl: string;
  duration: string;
  transcript: string;
  likes: number;
  comments: number;
  date: string;
  isCustom?: boolean;
}

export const DEFAULT_VOICE_POSTS: VoicePost[] = [];

export const MOCK_OCEAN_VIDEOS: OceanVideo[] = [];

export const parseDurationToSeconds = (dur: string): number => {
  const parts = dur.split(':').map(Number);
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  return 0;
};

export const formatSecondsToDuration = (sec: number): string => {
  const mins = Math.floor(sec / 60);
  const secs = sec % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

export const getVideoCaptionText = (videoId: string, progressRatio: number): string => {
  if (videoId === 'video-1') {
    if (progressRatio < 0.15) return "Welcome to the Cyber-Acoustic ocean study...";
    if (progressRatio < 0.35) return "[Sonar waves fluctuating at 24Hz]";
    if (progressRatio < 0.55) return "By mapping telemetry, we establish safe paths for turtle migrations.";
    if (progressRatio < 0.75) return "Let's listen to the low-frequency acoustic beacons...";
    if (progressRatio < 0.95) return "Thank you for monitoring ocean silence with us.";
    return "End of transmission.";
  }
  if (videoId === 'video-2') {
    if (progressRatio < 0.15) return "Designing for one-hand reach is essential on modern smartphones.";
    if (progressRatio < 0.35) return "Observe the touch radius heatmaps in our telemetry deck.";
    if (progressRatio < 0.55) return "A viewport-relative navigation layout scales with ease.";
    if (progressRatio < 0.75) return "Notice the lateral gesture interpolation in this view.";
    if (progressRatio < 0.95) return "Try implementing this on-device layout in your projects.";
    return "End of lecture.";
  }
  if (progressRatio < 0.2) return "Establishing secure ocean audio link...";
  if (progressRatio < 0.5) return "[Ocean waves splashing peacefully]";
  if (progressRatio < 0.8) return "Data streams aligned. Processing telemetry logs.";
  return "Conserving the ocean ecosystem.";
};

export const getRelativeTime = (post: any) => {
  let ms = 0;
  if (post.id && post.id.startsWith('post-')) {
    const parts = post.id.split('-');
    const parsed = parseInt(parts[1]);
    if (!isNaN(parsed) && parsed > 1000000000000) {
      ms = parsed;
    }
  }
  if (!ms && post.timestamp) {
    ms = typeof post.timestamp === 'number' ? post.timestamp : Date.parse(post.timestamp);
  }
  if (!ms && post.date) {
    ms = Date.parse(post.date);
  }
  if (!ms || isNaN(ms)) {
    return 'Just Now';
  }

  const now = Date.now();
  const diffMs = Math.max(0, now - ms);
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);
  const diffWeeks = Math.floor(diffDays / 7);
  const diffMonths = Math.floor(diffDays / 30);
  const diffYears = Math.floor(diffDays / 365);

  if (diffSeconds < 60) {
    return 'Just Now';
  }
  if (diffMinutes < 60) {
    return `${diffMinutes} Mi ago`;
  }
  if (diffHours < 48) {
    return `${diffHours} H ago`;
  }
  if (diffDays <= 7) {
    return `${diffDays} D ago`;
  }
  if (diffDays < 30) {
    return `${Math.floor(diffDays / 7)} W ago`;
  }
  if (diffDays < 365) {
    return `${Math.max(1, Math.min(11, Math.floor(diffDays / 30)))} M ago`;
  }
  return `${Math.max(1, Math.floor(diffDays / 365))} Y ago`;
};

export function renderTextWithMentions(text: string) {
  if (!text) return null;
  const parts = text.split(/(![a-zA-Z0-9_-]+)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith('!')) {
          return (
            <span key={i} className="text-amber-800 font-bold font-mono bg-amber-50/70 px-1 py-0.5 rounded border border-amber-200/45 inline-block text-[10px] mx-0.5">
              {part}
            </span>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

export const CollapsibleText = ({ content, hasAttachment }: { content: string, hasAttachment: boolean }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  
  if (!content) return null;

  if (hasAttachment) {
    return (
      <div className="space-y-1">
        {isExpanded && (
          <p className="text-xs text-[#5c5446] leading-relaxed font-sans whitespace-pre-wrap pt-0.5">
            {renderTextWithMentions(content)}
          </p>
        )}
        <button 
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-[#8a8172] hover:text-[#3a342a] font-mono text-[9px] font-bold uppercase tracking-wider transition-colors inline-flex items-center gap-1.5 pt-1"
        >
          {isExpanded ? '📖 Hide Text Content' : '📝 Show Text Content'}
        </button>
      </div>
    );
  }

  const lines = content.split('\n');
  const maxLines = 2;
  const maxChars = 140;
  
  const isTooLong = lines.length > maxLines || content.length > maxChars;
  
  if (!isTooLong) {
    return (
      <p className="text-xs text-[#5c5446] leading-relaxed font-sans whitespace-pre-wrap">
        {renderTextWithMentions(content)}
      </p>
    );
  }
  
  const displayText = isExpanded 
    ? content 
    : (lines.length > maxLines 
        ? lines.slice(0, maxLines).join('\n') + '...' 
        : content.slice(0, maxChars) + '...');
        
  return (
    <div className="space-y-1">
      <p className="text-xs text-[#5c5446] leading-relaxed font-sans whitespace-pre-wrap">
        {renderTextWithMentions(displayText)}
      </p>
      <button 
        onClick={() => setIsExpanded(!isExpanded)}
        className="text-[#8a8172] hover:text-[#3a342a] font-mono text-[10px] font-bold uppercase tracking-wider transition-colors inline-block pt-1"
      >
        {isExpanded ? 'See less' : 'See more'}
      </button>
    </div>
  );
};

export const compressAndAttachImage = (file: File, callback: (base64: string) => void) => {
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = document.createElement('img');
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const max_size = 1920;
      let width = img.width;
      let height = img.height;
      if (width > height) {
        if (width > max_size) {
          height *= max_size / width;
          width = max_size;
        }
      } else {
        if (height > max_size) {
          width *= max_size / height;
          height = max_size;
        }
      }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
        callback(dataUrl);
      } else {
        callback(e.target?.result as string);
      }
    };
    img.src = e.target?.result as string;
  };
  reader.readAsDataURL(file);
};

export async function uploadMediaFile(file: File | Blob, customFileName?: string): Promise<string> {
  const storedToken = localStorage.getItem('turtle_auth_token');
  const ext = file.type.includes('video') ? 'mp4' : file.type.includes('audio') ? 'webm' : 'jpg';
  const fileName = customFileName || (file instanceof File ? file.name : `media-${Date.now()}.${ext}`);

  let serverError = '';

  // 1. Multipart upload (preferred — produces a real /uploads/<file> URL that
  //    survives reloads and can be shared across devices).
  try {
    const formData = new FormData();
    formData.append('file', file, fileName);

    const headers: Record<string, string> = {};
    if (storedToken) {
      headers['Authorization'] = `Bearer ${storedToken}`;
    }

    const res = await fetch('/api/upload', {
      method: 'POST',
      headers,
      body: formData,
    });

    if (res.ok) {
      const data = await res.json();
      if (data.url) {
        return data.url;
      }
    } else {
      // Surface the server's message (e.g. "Unsupported video format .mkv").
      try {
        const errData = await res.json();
        if (errData?.error) serverError = errData.error;
      } catch (e) {
        /* ignore */
      }
    }
  } catch (err) {
    console.warn("[uploadMediaFile] Multipart upload failed:", err);
  }

  // 2. Video/audio: NEVER fall back to a base64/blob URL. A base64 video is
  //    huge (breaks the 50mb JSON body limit and the localStorage 100k strip)
  //    and a blob: URL dies on reload — both leave a permanently blank player.
  //    Throw instead so the caller shows the user a real error message.
  if (file.type.startsWith('video') || file.type.startsWith('audio')) {
    throw new Error(
      serverError || 'Video/audio upload failed. The file may be too large or in an unsupported format.'
    );
  }

  // 3. Images: base64 fallback is acceptable (small files, and the composer
  //    also has a canvas-compress fallback).
  try {
    const reader = new FileReader();
    const base64Promise = new Promise<string>((resolve, reject) => {
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    const fileData = await base64Promise;

    const res2 = await fetch('/api/upload', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(storedToken ? { 'Authorization': `Bearer ${storedToken}` } : {})
      },
      body: JSON.stringify({
        fileData,
        fileName: customFileName || (file instanceof File ? file.name : 'media.bin'),
        fileType: file.type
      })
    });

    if (res2.ok) {
      const data2 = await res2.json();
      if (data2.url) {
        return data2.url;
      }
    }
  } catch (err) {
    console.error("[uploadMediaFile] Base64 upload failed:", err);
  }

  throw new Error(serverError || 'Upload failed.');
}

interface MessageComposerProps {
  onSendMessage: (sender: string, text: string) => void;
}

function MessageComposer({ onSendMessage }: MessageComposerProps) {
  const [sender, setSender] = useState('');
  const [text, setText] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!sender.trim() || !text.trim()) return;
    onSendMessage(sender.trim(), text.trim());
    setSender('');
    setText('');
  };

  return (
    <form onSubmit={handleSubmit} className="bg-[#f0ede6] border border-[#ebdcca] p-4 rounded-2xl space-y-3">
      <span className="font-mono text-[9px] font-bold text-[#8a8172] uppercase tracking-wider block">
        Write a Message
      </span>
      <div className="space-y-1">
        <label className="block text-[9px] font-mono text-[#8a8172] uppercase tracking-wider">Your Name / Title</label>
        <input
          type="text"
          value={sender}
          onChange={(e) => setSender(e.target.value)}
          placeholder="Enter your name / title..."
          className="w-full bg-white border border-[#cfcac0] rounded-lg px-3 py-1.5 font-sans text-xs text-[#5c5446] focus:outline-none focus:ring-1 focus:ring-[#8a8172]"
          required
        />
      </div>
      <div className="space-y-1">
        <label className="block text-[9px] font-mono text-[#8a8172] uppercase tracking-wider">Message</label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Leave a friendly message or inquiry..."
          rows={3}
          className="w-full bg-white border border-[#cfcac0] rounded-lg p-2.5 font-sans text-xs text-[#5c5446] leading-relaxed focus:outline-none focus:ring-1 focus:ring-[#8a8172]"
          required
        />
      </div>
      <button
        type="submit"
        className="w-full font-mono text-[10px] uppercase font-bold text-[#f4f1ea] bg-[#3a342a] hover:bg-[#52493b] py-2 rounded-xl shadow-sm transition-colors flex items-center justify-center gap-1.5"
      >
        <Send size={12} />
        Send Note
      </button>
    </form>
  );
}

async function safeJsonParse(res: Response): Promise<any> {
  const contentType = res.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    try {
      return await res.json();
    } catch {
      return null;
    }
  }
  return null;
}

const formatCreditCardStyle = (badgeStr: string | undefined): string => {
  if (!badgeStr) return '0000 0000 0000 0000';
  const clean = badgeStr.replace(/-/g, '').toUpperCase();
  const matches = clean.match(/.{1,4}/g);
  return matches ? matches.join(' ') : clean;
};

const getDeterministicAnon = (userId: string, countryCode?: string | null) => {
  if (!countryCode) {
    return {
      id: "",
      name: ""
    };
  }
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = userId.charCodeAt(i) + ((hash << 5) - hash);
  }
  hash = Math.abs(hash);
  const num1 = 10 + (hash % 90); // 10 to 99
  const num2 = 1000 + ((hash >> 4) % 9000); // 1000 to 9999
  const region = countryCode.toUpperCase();
  return {
    id: `anon-user-${region}-${num1}-${num2}`,
    name: `ANON ${region} ${num1} ${num2}`
  };
};

const ALL_COMMON_SEARCHES: { term: string; count: number }[] = [];

const getRegionalTrendingSearches = (countryCode: string | null | undefined) => {
  return ALL_COMMON_SEARCHES;
};

// ── Multi-reaction helpers (port from arena-ai: like / love / insight / support) ──
export const REACTION_TYPES = ['like', 'love', 'insight', 'support'] as const;
export type ReactionType = (typeof REACTION_TYPES)[number];

const REACTION_META: Record<ReactionType, { icon: string; label: string }> = {
  like: { icon: '⭐', label: 'Like' },
  love: { icon: '❤️', label: 'Love' },
  insight: { icon: '💡', label: 'Insight' },
  support: { icon: '🤝', label: 'Support' },
};

export function getUserReaction(post: any, userId?: string | null): ReactionType | null {
  if (!userId || !post?.reactions) return null;
  for (const rt of REACTION_TYPES) {
    const list = post.reactions[rt];
    if (Array.isArray(list) && list.includes(userId)) return rt;
  }
  return null;
}

export function reactionCount(post: any, type: ReactionType): number {
  const list = post?.reactions?.[type];
  return Array.isArray(list) ? list.length : 0;
}

export function totalReactions(post: any): number {
  if (!post?.reactions) return post?.likes || 0;
  return REACTION_TYPES.reduce((sum, rt) => sum + reactionCount(post, rt), 0);
}

export function ReactionIcon({ type, active }: { type: ReactionType; active?: boolean }) {
  const meta = REACTION_META[type];
  return (
    <span
      className={`text-[11px] leading-none ${active ? 'scale-125' : ''}`}
      title={meta.label}
      role="img"
      aria-label={meta.label}
    >
      {meta.icon}
    </span>
  );
}

export default function App() {
  const [token, setToken] = useState<string | null>(localStorage.getItem('secure_auth_token'));
  const [user, setUser] = useState<{ id: string; name: string; email: string; profile: UserProfile; countryCode?: string | null; isLocationVerified?: boolean; isPublicMessagingEnabled?: boolean; following?: string[] } | null>(null);
  const [profile, setProfile] = useState<UserProfile>(DEFAULT_PROFILE);
  const [isEditMode, setIsEditMode] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [bottomNavSide, setBottomNavSide] = useState<'left' | 'right'>(() => {
    return (localStorage.getItem('bottom_nav_side') as 'left' | 'right') || 'left';
  });
  const [topNavSide, setTopNavSide] = useState<'left' | 'right'>(() => {
    return (localStorage.getItem('top_nav_side') as 'left' | 'right') || 'left';
  });

  // Keep post buttons alignment synced with the side of the bottom nav unfold menu
  useEffect(() => {
    setPostButtonsAlignment(bottomNavSide);
    localStorage.setItem('post_buttons_alignment', bottomNavSide);
  }, [bottomNavSide]);

  // Refs to prevent high-frequency polling overlapping or race conditions
  const isFetchingCreators = useRef(false);
  const isFetchingFeed = useRef(false);
  const isRefreshingProfile = useRef(false);
  const isFetchingMessages = useRef(false);
  const isFetchingNotifications = useRef(false);

  // Dynamic Reels and Channels for Demo Simulation
  const [dynamicReels, setDynamicReels] = useState<Reel[]>(() => {
    try {
      const saved = localStorage.getItem('ocean_dynamic_reels');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Server-backed reels feed (Phase 1.1 production wiring): ranked + cursor
  // paginated from /api/reels/feed, merged with the local reels below.
  const [serverReels, setServerReels] = useState<any[]>([]);
  const [reelsNextCursor, setReelsNextCursor] = useState<number | null>(null);
  const [reelsHasMore, setReelsHasMore] = useState(false);
  const [isLoadingReels, setIsLoadingReels] = useState(false);
  const reelsLoadMoreRef = useRef(false);
  const reelsSentinelRef = useRef<HTMLDivElement | null>(null);

  const [dynamicChannels, setDynamicChannels] = useState<Channel[]>(() => {
    try {
      const saved = localStorage.getItem('ocean_dynamic_channels');
      return saved ? JSON.parse(saved) : VERIFIED_CHANNELS;
    } catch {
      return VERIFIED_CHANNELS;
    }
  });

  const [dynamicBroadcasts, setDynamicBroadcasts] = useState<ChannelBroadcast[]>(() => {
    try {
      const saved = localStorage.getItem('ocean_dynamic_broadcasts');
      return saved ? JSON.parse(saved) : CHANNEL_BROADCASTS;
    } catch {
      return CHANNEL_BROADCASTS;
    }
  });

  // Simulator Form States
  const [isReelSimulatorOpen, setIsReelSimulatorOpen] = useState(false);
  const [newReelTitle, setNewReelTitle] = useState('');
  const [newReelCategory, setNewReelCategory] = useState('Trending');
  const [newReelCaption, setNewReelCaption] = useState('');
  const [newReelImageUrl, setNewReelImageUrl] = useState('https://images.unsplash.com/photo-1550751827-4bd374c3f58b?auto=format&fit=crop&w=600&q=80');
  const [newReelVideoUrl, setNewReelVideoUrl] = useState('https://assets.mixkit.co/videos/preview/mixkit-stars-in-space-background-1611-large.mp4');
  
  // AI Caption Engine parameters
  const [aiSelectedLabel, setAiSelectedLabel] = useState('coding');
  const [aiSelectedMood, setAiSelectedMood] = useState('hype');
  const [isGeneratingAiCaption, setIsGeneratingAiCaption] = useState(false);

  // Reels upload simulation steps
  const [reelUploadStep, setReelUploadStep] = useState<number | null>(null); // null, 0, 1, 2, 3

  // Emergency Community Pools (port from base44 Emergency page)
  const [showEmergencyPools, setShowEmergencyPools] = useState(false);

  // Batch-E feature overlays (ports from surveyed source folders)
  const [showRecoveryVerify, setShowRecoveryVerify] = useState(false);
  const [showCreatorStudio, setShowCreatorStudio] = useState(false);
  const [showGeohash, setShowGeohash] = useState(false);
  const [showStreamAdmin, setShowStreamAdmin] = useState(false);
  const [showTimeCapsuleComposer, setShowTimeCapsuleComposer] = useState(false);
  const [showRandomDm, setShowRandomDm] = useState(false);
  const [showAwaySummary, setShowAwaySummary] = useState(false);
  const [awaySummaryItems, setAwaySummaryItems] = useState<Array<{ kind: string; text: string; time: number }>>([]);
  const [nsfwStrictness, setNsfwStrictness] = useState(() => getNsfwSettings().strictness);
  const [showRankingDemo, setShowRankingDemo] = useState(false);
  const [showNewFeaturesHub, setShowNewFeaturesHub] = useState(false);
  const [showVisualSearch, setShowVisualSearch] = useState(false);
  const [isRtl, setIsRtl] = useState(() => (localStorage.getItem('ocean_rtl') === '1'));
  useEffect(() => {
    document.documentElement.dir = isRtl ? 'rtl' : 'ltr';
    localStorage.setItem('ocean_rtl', isRtl ? '1' : '0');
  }, [isRtl]);

  // Channels Simulator States
  const [isChannelSimulatorOpen, setIsChannelSimulatorOpen] = useState(false);
  const [simulatorActiveTab, setSimulatorActiveTab] = useState<'register' | 'broadcast'>('register');
  
  // Register Channel
  const [newChanName, setNewChanName] = useState('');
  const [newChanHandle, setNewChanHandle] = useState('');
  const [newChanCategory, setNewChanCategory] = useState('Research');
  const [newChanDesc, setNewChanDesc] = useState('');
  const [newChanAvatar, setNewChanAvatar] = useState('https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80');

  // Broadcast Post
  const [selectedChanIdForPost, setSelectedChanIdForPost] = useState('');
  const [newPostTitle, setNewPostTitle] = useState('');
  const [newPostContent, setNewPostContent] = useState('');
  const [newPostImage, setNewPostImage] = useState('');

  // YouTube-style Video Creator Studio States
  const [isVideoStudioOpen, setIsVideoStudioOpen] = useState(false);
  const [newVideoTitle, setNewVideoTitle] = useState('');
  const [newVideoCategory, setNewVideoCategory] = useState('MARINE LIFE');
  const [newVideoDuration, setNewVideoDuration] = useState('10:45');
  const [newVideoDescription, setNewVideoDescription] = useState('');
  const [newVideoThumbnail, setNewVideoThumbnail] = useState('https://images.unsplash.com/photo-1518837695005-2083093ee35b?auto=format&fit=crop&w=800&q=80');

  const [studioSubTab, setStudioSubTab] = useState<'dashboard' | 'wellness' | 'community'>('dashboard');

  // ==========================================
  // ADVANCED SANDBOX FEATURES STATES
  // ==========================================
  // Feature 1: Local-First Sync
  const [isOfflineMode, setIsOfflineMode] = useState(false);
  const [syncLogs, setSyncLogs] = useState<string[]>([
    '[01:00] Initialized offline storage engine',
    '[01:15] Synced cached records with Firebase Cloud'
  ]);
  const [isSyncing, setIsSyncing] = useState(false);

  // Feature 3: Collaborative Time Capsules
  const [collaborativeCapsules, setCollaborativeCapsules] = useState<{ id: string, title: string, unlockDate: string, collaborators: string[], approvals: Record<string, boolean> }[]>([
    { id: 'caps-1', title: 'Shared Dhaka Core Launch Strategy', unlockDate: '2026-08-01', collaborators: ['Alpha Coder', 'Marine Rover'], approvals: { 'Alpha Coder': true, 'Marine Rover': false } }
  ]);
  const [newCollabTitle, setNewCollabTitle] = useState('');
  const [newCollabDate, setNewCollabDate] = useState('');
  const [newCollabCollabs, setNewCollabCollabs] = useState('');

  // Feature 4: Emergency Pool Skill Matching
  const [emergencySkillsFilter, setEmergencySkillsFilter] = useState<string>('All');

  // Feature 5: Toxicity Nudge Simulator
  const [toxicityInputText, setToxicityInputText] = useState('');
  const [toxicityResult, setToxicityResult] = useState<{ score: number; flagged: boolean; advice: string } | null>(null);

  // Feature 6: Anonymous Whisper Mode
  const [whispers, setWhispers] = useState<{ id: string, text: string, timer: number, category: string }[]>([
    { id: 'wh-1', text: 'I secretly spend 4 hours a day watching vertical ocean videos.', timer: 300, category: 'Confession' },
    { id: 'wh-2', text: 'I coded a macro to like every turtle post automatically.', timer: 210, category: 'Tech Secret' }
  ]);
  const [newWhisperText, setNewWhisperText] = useState('');
  const [newWhisperCategory, setNewWhisperCategory] = useState('Confession');

  // Feature 7: Local Event Discovery
  const [localEvents, setLocalEvents] = useState<{ id: string, name: string, date: string, location: string, distanceKm: number, rsvps: number, hasRsvped: boolean }[]>([
    { id: 'ev-1', name: 'Decentralized Ocean Audio Jam', date: '2026-07-25', location: 'Dhaka Tech Node - Sector 4', distanceKm: 2.4, rsvps: 45, hasRsvped: false },
    { id: 'ev-2', name: 'Tactile Coding Hackathon', date: '2026-08-02', location: 'Marine Sanctuary Lab', distanceKm: 12.8, rsvps: 112, hasRsvped: false },
    { id: 'ev-3', name: 'Turtle Shell Craft Fair', date: '2026-08-15', location: 'Cooperative Plaza Ground', distanceKm: 5.1, rsvps: 28, hasRsvped: true }
  ]);
  const [newEventName, setNewEventName] = useState('');
  const [newEventLocation, setNewEventLocation] = useState('');
  const [newEventDistance, setNewEventDistance] = useState('5.0');

  // Feature 11: Family/Group Profiles
  const [familyProfiles, setFamilyProfiles] = useState<{ id: string, name: string, members: { name: string, role: string }[], joinedTimeline: string[] }[]>([
    { id: 'fam-1', name: 'The Alpha Coders Family', members: [{ name: 'Anonymous Leader', role: 'Founder' }, { name: 'Ocean Rover', role: 'Editor' }], joinedTimeline: ['Jointly published Dhaka Node report', 'Emergency pool action resolved'] }
  ]);
  const [newFamilyName, setNewFamilyName] = useState('');
  const [newFamilyMember, setNewFamilyMember] = useState('');

  // Feature 12: E2E Encrypted Group Chat Simulator
  const [e2eMessages, setE2eMessages] = useState<{ id: string, sender: string, ciphertext: string, decrypted: string, timestamp: string }[]>([
    { id: 'e2e-1', sender: 'BD-Node-Leader', ciphertext: 'U2FsdGVkX1+e9O3Z3J6Jq/6C877yXQ...', decrypted: 'Secure meeting tonight at 9 PM.', timestamp: '01:30' }
  ]);
  const [newE2eMessageText, setNewE2eMessageText] = useState('');
  const [e2eKeyExchangeLog, setE2eKeyExchangeLog] = useState<string[]>([
    '[01:00] Generated local Diffie-Hellman Keypair',
    '[01:01] Shared public key with Dhaka Hub'
  ]);

  // Feature 14: Digital Wellness
  const [wellnessTimeSpent, setWellnessTimeSpent] = useState<number>(() => {
    const today = new Date().toDateString();
    const savedDate = localStorage.getItem('wellness_last_date');
    if (savedDate !== today) {
      localStorage.setItem('wellness_last_date', today);
      localStorage.setItem('wellness_time_spent', '0');
      return 0;
    }
    const val = parseInt(localStorage.getItem('wellness_time_spent') || '0', 10);
    return isNaN(val) ? 0 : val;
  }); // in seconds
  const [dailyWellnessLimit, setDailyWellnessLimit] = useState(30); // in minutes
  const [isDailyLimitEnabled, setIsDailyLimitEnabled] = useState(false);
  const [isBreathingActive, setIsBreathingActive] = useState(false);
  const [breathingStep, setBreathingStep] = useState<'inhale' | 'hold' | 'exhale'>('inhale');
  const [breathingTimer, setBreathingTimer] = useState(4);

  // Feature 15: Screen Reader Mode & Speak Assist
  const [isScreenReaderActive, setIsScreenReaderActive] = useState(false);

  const speakAssist = (text: string) => {
    if (isScreenReaderActive && typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.0;
      window.speechSynthesis.speak(utterance);
    }
  };

  // Feature 1: Offline Sync Trigger
  const triggerLocalSync = () => {
    if (isSyncing) return;
    setIsSyncing(true);
    setSyncLogs(prev => [`[${new Date().toLocaleTimeString()}] Starting Local Cache Sync...`, ...prev]);
    setTimeout(() => {
      setSyncLogs(prev => [
        `[${new Date().toLocaleTimeString()}] Handshake success with remixed-firestore-database-id`,
        `[${new Date().toLocaleTimeString()}] Pushed pending state changes to Cloud Firestore`,
        `[${new Date().toLocaleTimeString()}] Local-First State is 100% synchronized!`,
        ...prev
      ]);
      setIsSyncing(false);
      showToast("🔄 Local-First Cache synced successfully with Firestore!");
    }, 1500);
  };

  // Feature 5: Toxicity Nudge Checker
  const checkTextToxicity = (text: string) => {
    setToxicityInputText(text);
    if (!text.trim()) {
      setToxicityResult(null);
      return;
    }
    const lower = text.toLowerCase();
    const isToxic = lower.includes('hate') || lower.includes('stupid') || lower.includes('kill') || lower.includes('scam') || lower.includes('ugly') || lower.includes('abuse');
    if (isToxic) {
      setToxicityResult({
        score: Math.floor(Math.random() * 20) + 75, // 75-95
        flagged: true,
        advice: "⚠️ AI detected potential hostility. Posting this might lower your Trust Score by 5-10 points. Consider using calmer, constructive wording!"
      });
    } else {
      setToxicityResult({
        score: Math.floor(Math.random() * 15) + 5, // 5-20
        flagged: false,
        advice: "✨ AI analysis: 100% Constructive and safe. Ready to post!"
      });
    }
  };

  // Feature 12: E2E Chat Send
  const sendE2eMessage = () => {
    if (!newE2eMessageText.trim()) return;
    const cipher = 'U2FsdGVkX1' + btoa(newE2eMessageText).slice(0, 15) + '...';
    const newMsg = {
      id: `e2e-${Date.now()}`,
      sender: profile.name,
      ciphertext: cipher,
      decrypted: newE2eMessageText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    setE2eMessages(prev => [...prev, newMsg]);
    setNewE2eMessageText('');
    setE2eKeyExchangeLog(prev => [
      `[${new Date().toLocaleTimeString()}] Message encrypted with AES-256-GCM using Shared Secret`,
      `[${new Date().toLocaleTimeString()}] Group ciphertext broadcasted securely`,
      ...prev
    ]);
    showToast("🔒 Message sent with end-to-end encryption!");
  };

  // Feature 14: Wellness Breathing Guided Cycle Effect
  useEffect(() => {
    let interval: any = null;
    if (isBreathingActive) {
      interval = setInterval(() => {
        setBreathingTimer(prev => {
          if (prev <= 1) {
            setBreathingStep(step => {
              const nextStep = step === 'inhale' ? 'hold' : step === 'hold' ? 'exhale' : 'inhale';
              const phrase = nextStep === 'inhale' ? 'Inhale deeply' : nextStep === 'hold' ? 'Hold your breath' : 'Exhale slowly';
              speakAssist(phrase);
              return nextStep;
            });
            return 4;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      setBreathingTimer(4);
      setBreathingStep('inhale');
    }
    return () => clearInterval(interval);
  }, [isBreathingActive]);

  // Feature 14: Wellness daily limit screen timer
  useEffect(() => {
    const timer = setInterval(() => {
      setWellnessTimeSpent(prev => {
        const today = new Date().toDateString();
        const savedDate = localStorage.getItem('wellness_last_date');
        if (savedDate !== today) {
          localStorage.setItem('wellness_last_date', today);
          localStorage.setItem('wellness_time_spent', '0');
          return 0;
        }
        const next = prev + 1;
        localStorage.setItem('wellness_time_spent', String(next));
        if (isDailyLimitEnabled && next === dailyWellnessLimit * 60) {
          showToast("⏳ Digital Wellness Alert: You have reached your daily usage limit. Time for a screen break!");
        }
        return next;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [isDailyLimitEnabled, dailyWellnessLimit]);

  // Feature 6: Anonymous Whispers self-destruct countdown
  useEffect(() => {
    const timer = setInterval(() => {
      setWhispers(prev => prev.map(w => ({ ...w, timer: Math.max(0, w.timer - 1) })).filter(w => w.timer > 0));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Active creator we are viewing (null if viewing our own workspace/fallback)
  const [viewingCreator, setViewingCreator] = useState<{ id: string; name: string; profile: UserProfile; friends?: any[]; friendsListRestricted?: boolean; following?: string[]; isPublicMessagingEnabled?: boolean } | null>(null);

  const [isFriendsListOpen, setIsFriendsListOpen] = useState(false);
  const [friendsListModalData, setFriendsListModalData] = useState<{ name: string; friends: any[]; restricted?: boolean }>({ name: '', friends: [] });

  const [isActingAsAnonymous, setIsActingAsAnonymous] = useState<boolean>(() => {
    return localStorage.getItem('is_acting_as_anonymous') === 'true';
  });

  useEffect(() => {
    localStorage.setItem('is_acting_as_anonymous', String(isActingAsAnonymous));
  }, [isActingAsAnonymous]);
  const [isAnonPasswordConfirmOpen, setIsAnonPasswordConfirmOpen] = useState(false);
  const [anonConfirmPassword, setAnonConfirmPassword] = useState('');
  const [anonPasswordError, setAnonPasswordError] = useState('');
  const [isAnonPasswordVerifying, setIsAnonPasswordVerifying] = useState(false);

  const [anonAvatarUrl, setAnonAvatarUrl] = useState<string>(() => {
    return localStorage.getItem('anon_profile_avatar') || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=300&q=80';
  });
  const [anonBio, setAnonBio] = useState<string>(() => {
    return localStorage.getItem('anon_profile_bio') || 'Untraceable anonymous identity on the network.';
  });
  const [anonName, setAnonName] = useState<string>(() => {
    return localStorage.getItem('anon_profile_name') || '';
  });

  const getAnonymousProfileForUser = (): UserProfile | null => {
    if (!user) return null;
    const deter = getDeterministicAnon(user.id, user.countryCode);
    const isLocVer = !!user.countryCode;
    const displayName = anonName || deter.name;
    const avatar = anonAvatarUrl || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=300&q=80';
    
    // Filter out anonymous posts
    const anonPosts = (profile.posts || []).filter(p => p.isAnonymous).map(p => ({
      ...p,
      creator: {
        id: deter.id,
        name: displayName,
        username: isLocVer ? 'anonymous' : '',
        avatarUrl: avatar,
        tagline: isLocVer ? 'Encrypted Identity' : '',
        badgeNumber: isLocVer ? 'ANON-99' : '',
        isAnonymous: true
      }
    }));
    
    return {
      name: displayName,
      username: isLocVer ? 'anonymous' : '',
      avatarUrl: avatar,
      bio: anonBio || 'This is an untraceable anonymous profile on the creative network. No links to any real-world identity exist.',
      tagline: isLocVer ? 'Encrypted Identity' : '',
      location: isLocVer ? 'Secure Proxy Server' : '',
      availability: 'Available',
      badgeNumber: isLocVer ? 'ANON-99' : '',
      sinceDate: profile.sinceDate || 'July 2026',
      viewsCount: 1,
      followersCount: 0,
      postsCount: anonPosts.length,
      projectsCount: 0,
      skillsCount: isLocVer ? 3 : 0,
      isLocationVerified: isLocVer,
      countryCode: user.countryCode || null,
      skills: isLocVer ? ['Anonymity', 'Privacy', 'Crypto-proxy'] : [],
      projects: [],
      websites: [],
      contact: {
        email: '',
        github: '',
        linkedin: '',
        twitter: '',
        website: ''
      },
      posts: anonPosts,
      savedPostIds: []
    };
  };

  const activeProfile = isActingAsAnonymous ? (getAnonymousProfileForUser() || profile) : profile;

  // Direct Message setup and Dark Mode states
  const [initialActiveChatUserId, setInitialActiveChatUserId] = useState<string | null>(null);
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    const saved = localStorage.getItem('is_dark_mode');
    return saved !== null ? saved === 'true' : true;
  });

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
    } else {
      document.documentElement.classList.remove('dark');
      document.documentElement.classList.add('light');
    }
  }, [isDarkMode]);

  const toggleDarkMode = () => {
    const nextVal = !isDarkMode;
    setIsDarkMode(nextVal);
    localStorage.setItem('is_dark_mode', String(nextVal));
  };

  // Bottom Navigation Overlay States
  const [isExploreOpen, setIsExploreOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [twoFactorSetup, setTwoFactorSetup] = useState<{ secret: string; otpauthUrl: string; qrCodeDataUrl: string | null } | null>(null);
  const [twoFactorStatus, setTwoFactorStatus] = useState<'idle' | 'setup' | 'verify'>('idle');
  const [twoFactorCodeInput, setTwoFactorCodeInput] = useState('');
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [recoveryPhrase, setRecoveryPhrase] = useState<string | null>(null);
  const [backupPassphrase, setBackupPassphrase] = useState('');
  const [backupMsg, setBackupMsg] = useState('');
  const [isAdminOpen, setIsAdminOpen] = useState(false);
  const [postButtonsAlignment, setPostButtonsAlignment] = useState<'left' | 'right'>(() => {
    return (localStorage.getItem('post_buttons_alignment') as 'left' | 'right') || 'left';
  });
  const [likedUsersPost, setLikedUsersPost] = useState<Post | null>(null);
  const [postToDeleteId, setPostToDeleteId] = useState<string | null>(null);
  const [chatKey, setChatKey] = useState(0);
  const [archivedChats, setArchivedChats] = useState<any[]>([]);
  const [loadingArchived, setLoadingArchived] = useState(false);
  const [isArchivedChatsPopupOpen, setIsArchivedChatsPopupOpen] = useState(false);
  const [fullscreenImageUrl, setFullscreenImageUrl] = useState<string | null>(null);
  const [fullscreenMedia, setFullscreenMedia] = useState<{ post: Post; mediaUrl: string; mediaType: 'image' | 'video' } | null>(null);

  // Secure Auth State
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [authTab, setAuthTab] = useState<'login' | 'signup' | 'reset-request' | 'reset-verify'>('login');
  
  // Login input state
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [twoFactorToken, setTwoFactorToken] = useState<string | null>(null);
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  // Signup input state
  const [signupName, setSignupName] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [signupWords, setSignupWords] = useState<string[] | null>(null);
  const [hasConfirmedWords, setHasConfirmedWords] = useState(false);
  const [isLocationLockEnabled, setIsLocationLockEnabled] = useState(true);
  const [locationVerificationLoading, setLocationVerificationLoading] = useState(false);

  // Forgot password input/stage state
  const [resetEmail, setResetEmail] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [resetPositions, setResetPositions] = useState<number[]>([]);
  const [resetAnswers, setResetAnswers] = useState<Record<number, string>>({});
  const [resetNewPassword, setResetNewPassword] = useState('');

  // View Recovery Words sub-module
  const [isViewWordsOpen, setIsViewWordsOpen] = useState(false);
  const [viewWordsPassword, setViewWordsPassword] = useState('');
  const [viewWordsResult, setViewWordsResult] = useState<string[] | null>(null);
  const [viewWordsError, setViewWordsError] = useState('');
  const [viewWordsLoading, setViewWordsLoading] = useState(false);

  // Direct Message guestbook database
  const [messages, setMessages] = useState<{ id: string; senderName: string; text: string; timestamp: string }[]>([]);

  // Creators directory list for Explore tab
  const [creatorsList, setCreatorsList] = useState<any[]>([]);
  const [exploreSearchQuery, setExploreSearchQuery] = useState('');
  const [searchHistory, setSearchHistory] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('global_search_history');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const handleExecuteSearch = (query: string) => {
    if (!query) return;
    const trimmed = query.trim();
    if (!trimmed) return;

    setSearchPageQuery(trimmed);
    setExploreSearchQuery(trimmed);
    setFeedSearchQuery(trimmed);
    setIsSearchFocused(false);

    // Auto switch sub tab if searching for hashtags (#...) or accounts (@...)
    if (trimmed.startsWith('#')) {
      setSearchSubTab('hashtags');
    } else if (trimmed.startsWith('@')) {
      setSearchSubTab('portfolios');
    }

    if (activeView !== 'search' && activeView !== 'explore') {
      setActiveView('search');
    }

    setSearchHistory(prev => {
      const filtered = prev.filter(q => q.toLowerCase() !== trimmed.toLowerCase());
      const updated = [trimmed, ...filtered].slice(0, 10);
      localStorage.setItem('global_search_history', JSON.stringify(updated));
      return updated;
    });

    showToast(`🔍 Searching for "${trimmed}"`);
  };

  const handleClearSearchHistory = () => {
    setSearchHistory([]);
    localStorage.removeItem('global_search_history');
  };

  const [searchSubTab, setSearchSubTab] = useState<'posts' | 'hashtags' | 'portfolios' | 'reels' | 'channels'>('hashtags');
  const [activeCategory, setActiveCategory] = useState<string>('Trending');
  const [activeImmersiveReelIndex, setActiveImmersiveReelIndex] = useState<number | null>(null);
  const [activeImmersiveMediaIndex, setActiveImmersiveMediaIndex] = useState<number | null>(null);
  const [touchStartY, setTouchStartY] = useState<number | null>(null);
  const [touchEndY, setTouchEndY] = useState<number | null>(null);
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [likedReels, setLikedReels] = useState<string[]>([]);

  // HYBRID RANKING ENGINE (IG 50% + YT 25% + TT 25% + FB Boost Post)
  // Facebook-style Interested / Not Interested feedback — persisted via turtleRankingEngine
  const [rankFeedback, setRankFeedback] = useState<Record<string, 'interested' | 'not_interested'>>(() => turtleRankingEngine.getFeedback());
  // Facebook Boost Post ids currently boosted by the user
  const [rankBoosted, setRankBoosted] = useState<string[]>(() => turtleRankingEngine.getBoosted());

  const [isReelsMuted, setIsReelsMuted] = useState(false);
  const [isReelPaused, setIsReelPaused] = useState(false);
  const [expandedReelCaption, setExpandedReelCaption] = useState<Record<string, boolean>>({});

  // Social Explore Connection Tracker
  const [followingIds, setFollowingIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('secure_following_ids');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Active view toggle between workspace ('workspace'), social network feed ('feed'), messaging ('chat'), and video calling ('meet') - Feed is default for all
  const [activeView, setActiveView] = useState<'workspace' | 'feed' | 'chat' | 'meet' | 'explore' | 'search' | 'alerts' | 'studio'>('feed');
  const [feedSubTab, setFeedSubTab] = useState<'feed' | 'reels' | 'voice' | 'explore'>('feed');

  // Mood feed filter (port from base44: Learn / Laugh / Relax / Discover)
  const [feedMood, setFeedMood] = useState<'All' | 'Learn' | 'Laugh' | 'Relax' | 'Discover'>('All');
  const MOOD_KEYWORDS: Record<'Learn' | 'Laugh' | 'Relax' | 'Discover', string[]> = {
    Learn: ['tutorial', 'guide', 'learn', 'how to', 'explain', 'course', '101', 'deep dive', 'science', 'code', 'coding', 'study', 'tips', 'lesson', 'walkthrough', 'research'],
    Laugh: ['funny', 'joke', 'lol', 'haha', 'humor', 'meme', 'comedy', 'hilarious', 'laugh', 'rofl', 'silly', 'prank'],
    Relax: ['calm', 'relax', 'soothe', 'meditat', 'ambient', 'nature', 'ocean', 'beach', 'peace', 'zen', 'chill', 'serene', 'sleep', 'waves', 'spa', 'lofi'],
    Discover: ['discover', 'explore', 'new', 'hidden', 'unique', 'secret', 'rare', 'exotic', 'find', 'reveal', 'underrated', 'off the beaten path', 'travel'],
  };
  const matchesMood = (post: any, mood: 'All' | 'Learn' | 'Laugh' | 'Relax' | 'Discover') => {
    if (mood === 'All') return true;
    const text = `${post.title || ''} ${post.content || ''} ${(post.tags || []).join(' ')} ${post.hashtags || ''}`.toLowerCase();
    return MOOD_KEYWORDS[mood].some((kw) => text.includes(kw));
  };
  const [exploreTab, setExploreTab] = useState<'mutual' | 'sent' | 'requests' | 'explore'>('mutual');
  const [exploreFilterQuery, setExploreFilterQuery] = useState<string>('');

  // Navigation history tracker for the bottom back button
  const [navHistory, setNavHistory] = useState<{ view: 'workspace' | 'feed' | 'chat' | 'meet' | 'explore' | 'search' | 'alerts' | 'studio'; subTab: 'feed' | 'reels' | 'voice' | 'explore' }[]>([]);
  const lastRecordedNav = useRef<{ view: typeof activeView; subTab: typeof feedSubTab } | null>(null);

  useEffect(() => {
    if (!lastRecordedNav.current) {
      lastRecordedNav.current = { view: activeView, subTab: feedSubTab };
      return;
    }
    if (lastRecordedNav.current.view !== activeView || lastRecordedNav.current.subTab !== feedSubTab) {
      const prev = lastRecordedNav.current;
      setNavHistory(prevHistory => {
        const next = [...prevHistory, prev];
        if (next.length > 50) next.shift();
        return next;
      });
      lastRecordedNav.current = { view: activeView, subTab: feedSubTab };
    }
  }, [activeView, feedSubTab]);

  const handleGoBack = () => {
    if (navHistory.length > 0) {
      const prev = navHistory[navHistory.length - 1];
      setNavHistory(history => history.slice(0, -1));
      lastRecordedNav.current = prev;
      setActiveView(prev.view);
      setFeedSubTab(prev.subTab);
      showToast("⏮️ Returned to previous view");
    } else {
      showToast("No further back history.");
    }
  };

  // Keep track of scroll positions for each view/tab to prevent resetting to top
  const viewScrollPositions = useRef<Record<string, number>>({});

  useEffect(() => {
    const handleScroll = () => {
      const key = activeView === 'feed' ? `feed_${feedSubTab}` : activeView;
      viewScrollPositions.current[key] = window.scrollY;
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [activeView, feedSubTab]);

  useEffect(() => {
    const key = activeView === 'feed' ? `feed_${feedSubTab}` : activeView;
    const targetScrollY = viewScrollPositions.current[key] || 0;

    const timer = setTimeout(() => {
      window.scrollTo(0, targetScrollY);
    }, 40);

    return () => clearTimeout(timer);
  }, [activeView, feedSubTab]);
  const [voicePosts, setVoicePosts] = useState<VoicePost[]>(() => {
    try {
      const saved = localStorage.getItem('ocean_voice_posts');
      return saved ? JSON.parse(saved) : DEFAULT_VOICE_POSTS;
    } catch {
      return DEFAULT_VOICE_POSTS;
    }
  });
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
  const [isRecordingVoice, setIsRecordingVoice] = useState<boolean>(false);
  const [recordedSeconds, setRecordedSeconds] = useState<number>(0);
  const [newVoiceTitle, setNewVoiceTitle] = useState<string>('');
  const [newVoiceTranscript, setNewVoiceTranscript] = useState<string>('');
  const voiceOscillatorsRef = useRef<{ osc: any; gainNode: any }[]>([]);
  const voiceAudioIntervalRef = useRef<any>(null);
  const recordingTimerRef = useRef<any>(null);

  const startVoiceAudioPlay = (voiceId: string) => {
    try {
      stopVoiceAudioPlay();
      setPlayingVoiceId(voiceId);
      
      const ctx = AudioService.getContext();
      
      // Cozy procedural rhythmic space ambient progression
      let index = 0;
      const pitches = [261.63, 293.66, 329.63, 392.00, 440.00, 523.25]; // Pentatonic cozy synth
      
      const playStep = () => {
        const osc = ctx.createOscillator();
        const gainNode = ctx.createGain();
        
        osc.type = "sine";
        const freq = pitches[Math.floor(Math.random() * pitches.length)];
        osc.frequency.setValueAtTime(freq, ctx.currentTime);
        
        gainNode.gain.setValueAtTime(0, ctx.currentTime);
        gainNode.gain.linearRampToValueAtTime(0.06, ctx.currentTime + 0.15);
        gainNode.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.85);
        
        osc.connect(gainNode);
        gainNode.connect(ctx.destination);
        
        osc.onended = () => {
          try {
            osc.disconnect();
            gainNode.disconnect();
          } catch (e) {}
          voiceOscillatorsRef.current = voiceOscillatorsRef.current.filter(item => item.osc !== osc);
        };
        
        osc.start();
        osc.stop(ctx.currentTime + 0.9);
        
        voiceOscillatorsRef.current.push({ osc, gainNode });
      };
      
      playStep();
      voiceAudioIntervalRef.current = setInterval(playStep, 450);
    } catch (e) {
      console.warn("Could not start synthesized voice sound:", e);
    }
  };

  const stopVoiceAudioPlay = () => {
    setPlayingVoiceId(null);
    if (voiceAudioIntervalRef.current) {
      clearInterval(voiceAudioIntervalRef.current);
      voiceAudioIntervalRef.current = null;
    }
    voiceOscillatorsRef.current.forEach(item => {
      try {
        item.osc.stop();
      } catch (e) {}
    });
    voiceOscillatorsRef.current = [];
  };

  const [isBottomNavExpanded, setIsBottomNavExpanded] = useState(false);
  const [windowWidth, setWindowWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1200);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    return () => {
      if (voiceAudioIntervalRef.current) clearInterval(voiceAudioIntervalRef.current);
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      voiceOscillatorsRef.current.forEach(item => {
        try { item.osc.stop(); } catch (e) {}
      });
    };
  }, []);
  const [feedTouchStart, setFeedTouchStart] = useState({ x: 0, y: 0 });
  const [showFeedHeader, setShowFeedHeader] = useState(true);
  const [isNavbarInactive, setIsNavbarInactive] = useState(false);
  const [lastFeedScrollY, setLastFeedScrollY] = useState(0);
  const [selectedVideo, setSelectedVideo] = useState<OceanVideo | null>(null);
  const [activeVideoCategory, setActiveVideoCategory] = useState<string>('ALL');
  const [videoPlaybackSeconds, setVideoPlaybackSeconds] = useState<number>(0);
  const [isVideoPlaying, setIsVideoPlaying] = useState<boolean>(false);
  const [isVideoMuted, setIsVideoMuted] = useState<boolean>(false);
  const [videoVolume, setVideoVolume] = useState<number>(80);
  const [isVideoMaximized, setIsVideoMaximized] = useState<boolean>(false);
  const [newCommentText, setNewCommentText] = useState<string>('');
  const [videoNewCommentText, setVideoNewCommentText] = useState<string>('');

  const [videosList, setVideosList] = useState<OceanVideo[]>(() => {
    try {
      const saved = localStorage.getItem('ocean_videos_list');
      return saved ? JSON.parse(saved) : MOCK_OCEAN_VIDEOS;
    } catch {
      return MOCK_OCEAN_VIDEOS;
    }
  });

  const [watchLaterList, setWatchLaterList] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('ocean_watch_later_list');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [selectedCreatorFilter, setSelectedCreatorFilter] = useState<string | null>(null);

  const [videoLikesState, setVideoLikesState] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem('ocean_video_likes_state');
      if (saved) return JSON.parse(saved);
    } catch {}
    const initial: Record<string, boolean> = {};
    MOCK_OCEAN_VIDEOS.forEach(v => {
      initial[v.id] = false;
    });
    return initial;
  });

  const [videoSavedState, setVideoSavedState] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem('ocean_video_saved_state');
      if (saved) return JSON.parse(saved);
    } catch {}
    return {};
  });

  const [videoCommentsState, setVideoCommentsState] = useState<Record<string, Array<{ id: string, name: string, avatar: string, text: string, date: string }>>>(() => {
    try {
      const saved = localStorage.getItem('ocean_video_comments_state');
      if (saved) return JSON.parse(saved);
    } catch {}
    return {
      'video-1': [
        { id: 'c1', name: 'Coral Explorer', avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80', text: 'This low frequency ambient audio protocol is fascinating. Does it really help bypass cargo ship sonar interference?', date: '1 day ago' },
        { id: 'c2', name: 'Wave Rider', avatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=150&q=80', text: 'The ambient wave sounds are actually relaxing! 🌊 Excellent manifesto.', date: '12 hours ago' }
      ],
      'video-2': [
        { id: 'c3', name: 'Pioneer Dev', avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=150&q=80', text: 'Top navigation makes total sense. I tried fluid swiping on my 6.7" screen and my thumb is thanking me.', date: '2 days ago' }
      ]
    };
  });
  const [channelSubscriptions, setChannelSubscriptions] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('secure_channel_subs');
      return saved ? JSON.parse(saved) : ['@mindmap', '@pioneer'];
    } catch {
      return ['@mindmap', '@pioneer'];
    }
  });
  const [likedBroadcastIds, setLikedBroadcastIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('secure_liked_broadcasts');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);
  const [searchPageQuery, setSearchPageQuery] = useState('');
  const [feedSearchQuery, setFeedSearchQuery] = useState('');
  const [isListening, setIsListening] = useState(false);

  const handleVoiceSearch = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      showToast("🎙️ Voice search is not supported in this browser. Please try typing instead!");
      return;
    }

    if (isListening) {
      setIsListening(false);
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.lang = 'en-US';
      recognition.interimResults = false;

      recognition.onstart = () => {
        setIsListening(true);
        showToast("🎙️ Listening... speak now.");
      };

      recognition.onerror = (event: any) => {
        console.error("Speech recognition error:", event.error);
        setIsListening(false);
        showToast(`🎙️ Voice search error: ${event.error}`);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        if (transcript) {
          setFeedSearchQuery(transcript);
          showToast(`🔍 Searched: "${transcript}"`);
        }
      };

      recognition.start();
    } catch (err) {
      console.error("Speech recognition initiation failed:", err);
      setIsListening(false);
    }
  };

  const [realTopSearches, setRealTopSearches] = useState<{ term: string; count: number }[]>(ALL_COMMON_SEARCHES);

  const loadRealSearches = async () => {
    try {
      let queriesList: any[] = [];
      const isFirestoreEnabled = firebaseConfig.projectId && !firebaseConfig.projectId.includes("placeholder") && !firebaseConfig.projectId.includes("remixed");

      if (isFirestoreEnabled) {
        try {
          const qSnapshot = await getDocs(collection(db, 'searchQueries'));
          qSnapshot.forEach((doc) => {
            queriesList.push(doc.data());
          });
        } catch (err) {
          handleFirestoreError(err, OperationType.GET, 'searchQueries');
          // Fall back to server API
          try {
            const res = await fetch('/api/searchQueries');
            if (res.ok) {
              const data = await res.json();
              queriesList = data.searchQueries || [];
            }
          } catch (e) {
            console.warn("Local searchQueries fallback fetch failed:", e);
          }
        }
      } else {
        // Fetch from local server API directly
        try {
          const res = await fetch('/api/searchQueries');
          if (res.ok) {
            const data = await res.json();
            queriesList = data.searchQueries || [];
          }
        } catch (e) {
          console.warn("Local searchQueries fetch failed:", e);
        }
      }

      const countsMap: { [key: string]: number } = {};
      const activeRegion = (user?.countryCode || 'BD').toUpperCase();

      queriesList.forEach((data) => {
        if (data && data.term) {
          const term = data.term.trim();
          const queryRegion = (data.countryCode || 'BD').toUpperCase();
          if (term.length >= 2 && queryRegion === activeRegion) {
            countsMap[term] = (countsMap[term] || 0) + 1;
          }
        }
      });

      const regionalFallbacks = getRegionalTrendingSearches(activeRegion);
      const mergedMap: { [key: string]: number } = {};
      regionalFallbacks.forEach(item => {
        mergedMap[item.term] = item.count;
      });

      Object.entries(countsMap).forEach(([term, count]) => {
        mergedMap[term] = (mergedMap[term] || 0) + count * 500;
      });

      const finalTop = Object.entries(mergedMap)
        .map(([term, count]) => ({ term, count }))
        .sort((a, b) => b.count - a.count);

      setRealTopSearches(finalTop);
    } catch (err) {
      console.error("Error loading real searches:", err);
    }
  };

  useEffect(() => {
    let interval: any = null;
    if (isVideoPlaying && selectedVideo) {
      const maxSeconds = parseDurationToSeconds(selectedVideo.duration);
      interval = setInterval(() => {
        setVideoPlaybackSeconds((prev) => {
          if (prev >= maxSeconds) {
            setIsVideoPlaying(false);
            return 0;
          }
          return prev + 1;
        });
      }, 1000);
    } else {
      if (interval) clearInterval(interval);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isVideoPlaying, selectedVideo]);

  useEffect(() => {
    loadRealSearches();
  }, [user?.countryCode]);

  // Feed scroll header auto-reveal on scroll-up, hide on scroll-down, plus 4s inactivity timer
  useEffect(() => {
    if (activeView !== 'feed' && activeView !== 'explore') return;

    let lastY = window.scrollY;
    let inactivityTimer: NodeJS.Timeout | null = null;

    const resetInactivityTimer = () => {
      setIsNavbarInactive(false);
      if (inactivityTimer) {
        clearTimeout(inactivityTimer);
      }
      inactivityTimer = setTimeout(() => {
        setIsNavbarInactive(true);
      }, 4000);
    };

    const handleScroll = () => {
      const currentY = window.scrollY;
      const diff = currentY - lastY;

      if (currentY < 40) {
        setShowFeedHeader(true);
      } else if (diff > 15) {
        // Scrolling down clearly: hide
        setShowFeedHeader(false);
      } else if (diff < -5) {
        // Scrolling up even a little bit: show immediately
        setShowFeedHeader(true);
      }

      lastY = currentY;
      resetInactivityTimer();
    };

    const handleInteraction = () => {
      resetInactivityTimer();
    };

    // Ensure state starts fresh on view switch
    setShowFeedHeader(true);
    resetInactivityTimer();

    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('touchstart', handleInteraction, { passive: true });
    window.addEventListener('touchmove', handleInteraction, { passive: true });
    window.addEventListener('touchend', handleInteraction, { passive: true });
    window.addEventListener('mousedown', handleInteraction, { passive: true });
    window.addEventListener('click', handleInteraction, { passive: true });

    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('touchstart', handleInteraction);
      window.removeEventListener('touchmove', handleInteraction);
      window.removeEventListener('touchend', handleInteraction);
      window.removeEventListener('mousedown', handleInteraction);
      window.removeEventListener('click', handleInteraction);
      if (inactivityTimer) {
        clearTimeout(inactivityTimer);
      }
    };
  }, [activeView]);

  // Debounce and log search query to local server and optionally Firestore so they are real and safe
  useEffect(() => {
    const activeQuery = (exploreSearchQuery || searchPageQuery || '').trim();
    if (!activeQuery || activeQuery.length < 2) return;

    const timer = setTimeout(async () => {
      const isFirestoreEnabled = firebaseConfig.projectId && !firebaseConfig.projectId.includes("placeholder") && !firebaseConfig.projectId.includes("remixed");

      // 1. Always post to our local server API
      try {
        await fetch('/api/searchQueries', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            term: activeQuery,
            countryCode: user?.countryCode || 'BD',
          }),
        });
      } catch (err) {
        console.warn("Failed to log search query locally:", err);
      }

      // 2. Conditionally write to Firestore if enabled
      if (isFirestoreEnabled) {
        try {
          const queryId = `query-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
          await addDoc(collection(db, 'searchQueries'), {
            id: queryId,
            term: activeQuery,
            userId: user?.id || 'anonymous',
            countryCode: user?.countryCode || 'BD',
            timestamp: Date.now()
          });
        } catch (err) {
          handleFirestoreError(err, OperationType.WRITE, 'searchQueries');
        }
      }

      loadRealSearches();
    }, 1500);

    return () => clearTimeout(timer);
  }, [exploreSearchQuery, searchPageQuery, user?.countryCode]);

  // Real-time Global social feed posts list
  const [feedList, setFeedList] = useState<any[]>([]);

  // State hooks for feed inline editing and dropdown menus
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState<string>('');
  const [editingContent, setEditingContent] = useState<string>('');
  const [editingIsTimeCapsule, setEditingIsTimeCapsule] = useState<boolean>(false);
  const [editingUnlockDate, setEditingUnlockDate] = useState<string>('');
  const [feedDropdownPostId, setFeedDropdownPostId] = useState<string | null>(null);
  const [repostModalPost, setRepostModalPost] = useState<Post | null>(null);
  const [reportModalPost, setReportModalPost] = useState<Post | null>(null);
  const [repostQuoteComment, setRepostQuoteComment] = useState<string>('');
  const [hiddenPostIds, setHiddenPostIds] = useState<string[]>([]);

  useEffect(() => {
    const handleOpenReportModal = (e: any) => {
      if (e.detail?.post) {
        setReportModalPost(e.detail.post);
      }
    };
    window.addEventListener('open-report-modal', handleOpenReportModal);
    return () => window.removeEventListener('open-report-modal', handleOpenReportModal);
  }, []);

  // Helper to extract video URL from any post object
  const extractPostVideoUrl = (post: any): string | null => {
    if (!post) return null;
    if (post.videoUrl && typeof post.videoUrl === 'string' && post.videoUrl.trim()) return post.videoUrl.trim();
    if (post.video_url && typeof post.video_url === 'string' && post.video_url.trim()) return post.video_url.trim();
    if (post.media_url && typeof post.media_url === 'string' && (post.media_url.includes('.mp4') || post.media_url.includes('.webm') || post.media_url.includes('video'))) return post.media_url.trim();
    if (post.mediaUrl && typeof post.mediaUrl === 'string' && (post.mediaUrl.includes('.mp4') || post.mediaUrl.includes('.webm') || post.mediaUrl.includes('video'))) return post.mediaUrl.trim();
    if (Array.isArray(post.media_urls)) {
      const v = post.media_urls.find((u: any) => typeof u === 'string' && (u.includes('.mp4') || u.includes('.webm') || u.includes('video')));
      if (v) return v;
    }
    if (Array.isArray(post.mediaUrls)) {
      const v = post.mediaUrls.find((u: any) => typeof u === 'string' && (u.includes('.mp4') || u.includes('.webm') || u.includes('video')));
      if (v) return v;
    }
    const combined = `${post.title || ''} ${post.content || ''}`;
    const match = combined.match(/https?:\/\/[^\s"']+\.(mp4|webm|mov|m4v)(\?[^\s"']*)?/i) || combined.match(/https?:\/\/assets\.mixkit\.co\/[^\s"']+/i);
    if (match) return match[0];
    return null;
  };

  // Compute combined reels (feed posts containing videoUrl + dynamic reels)
  const allReels = useMemo(() => {
    const videoPosts: any[] = [];
    const seenPostIds = new Set<string>();

    feedList.forEach(post => {
      const vUrl = extractPostVideoUrl(post);
      if (vUrl && !seenPostIds.has(post.id)) {
        seenPostIds.add(post.id);
        videoPosts.push({ ...post, videoUrl: vUrl });
      }
    });

    if (profile?.posts) {
      profile.posts.forEach((post: any) => {
        const vUrl = extractPostVideoUrl(post);
        if (vUrl && !seenPostIds.has(post.id)) {
          seenPostIds.add(post.id);
          videoPosts.push({ ...post, videoUrl: vUrl });
        }
      });
    }

    const videoFeedPosts = videoPosts.map(post => {
      const deterId = user ? getDeterministicAnon(user.id, user.countryCode).id : '';
      const isAnon = !!post.isAnonymous;
      const creatorName = isAnon ? 'Anonymous Member' : (post.creator?.name || post.authorName || 'Member');
      const creatorId = isAnon ? deterId : (post.creator?.id || post.authorId || 'anonymous-creator');
      const avatarUrl = isAnon ? '' : (post.creator?.avatarUrl || post.authorAvatarUrl || '');
      const rawViews = post.views || post.viewsCount || 0;

      return {
        id: `reel-feed-${post.id}`,
        title: post.title || post.content?.slice(0, 30) || 'Real Video Reel',
        category: 'Reels',
        creatorId,
        creatorName,
        avatarUrl,
        imageUrl: post.imageUrl || '',
        videoUrl: post.videoUrl,
        views: `${rawViews}`,
        viewsCount: typeof rawViews === 'number' ? rawViews : parseInt(rawViews) || 0,
        likes: post.likes || 0,
        caption: post.content || ''
      };
    });

    const normalizedDynamicReels = dynamicReels.map(r => {
      const rawViews = r.views || r.viewsCount || 0;
      return {
        ...r,
        views: `${rawViews}`,
        viewsCount: typeof rawViews === 'number' ? rawViews : parseInt(rawViews) || 0,
      };
    });

    // Server-persisted reels (ranked feed from /api/reels/feed) normalized to
    // the same shape, deduped against locally-sourced reels by id.
    const normalizedServerReels = serverReels.map(r => ({
      id: r.id,
      title: r.caption || r.title || 'Reel',
      category: r.category || 'Reels',
      creatorId: r.userId || r.creatorId || 'creator',
      creatorName: r.userName || r.creatorName || 'Member',
      avatarUrl: r.avatarUrl || '',
      imageUrl: r.imageUrl || '',
      videoUrl: r.videoUrl,
      views: `${r.viewsCount ?? r.views ?? 0}`,
      viewsCount: r.viewsCount ?? r.views ?? 0,
      likes: r.likes ?? 0,
      likedBy: Array.isArray(r.likedBy) ? r.likedBy : [],
      caption: r.caption || '',
      comments: Array.isArray(r.comments) ? r.comments : [],
      rankingScore: r.rankingScore,
      isServerReel: true,
      isAnonymous: !!r.isAnonymous,
    }));

    const all: any[] = [...normalizedServerReels, ...videoFeedPosts, ...normalizedDynamicReels];
    const seen = new Set<string>();
    return all.filter(r => {
      if (seen.has(r.id)) return false;
      seen.add(r.id);
      return true;
    });
  }, [feedList, profile, dynamicReels, serverReels, user]);

  // Shared hybrid-ranking context: 50% Instagram / 25% YouTube / 25% TikTok
  // blend + Facebook Boost Post + Interested/Not Interested feedback signals.
  const rankCtx = useMemo(() => buildHybridContext({
    userId: user?.id,
    language: user?.countryCode === 'BD' ? 'bn' : 'en',
    country: user?.countryCode || 'BD',
    followingIds,
    savedIds: profile.savedPostIds || []
  }), [user, followingIds, profile.savedPostIds, rankFeedback, rankBoosted]);

  // Filtered and ranked reels list based on ATLAS-RANK custom algorithm
  const filteredReels = useMemo(() => {
    const filtered = allReels.filter(r => {
      if (!feedSearchQuery) return true;
      const q = feedSearchQuery.toLowerCase().trim();
      return (
        (r.title && r.title.toLowerCase().includes(q)) ||
        (r.caption && r.caption.toLowerCase().includes(q)) ||
        (r.creatorName && r.creatorName.toLowerCase().includes(q))
      );
    });

    return hybridRankItems(
      filtered,
      rankCtx,
      'reel'
    );
  }, [allReels, feedSearchQuery, rankCtx]);

  // ── Server reels feed: fetch on reels tab, infinite scroll, view analytics ──
  const fetchServerReels = useCallback(async (cursor?: number | null) => {
    if (!token) return;
    if (reelsLoadMoreRef.current) return;
    reelsLoadMoreRef.current = true;
    setIsLoadingReels(true);
    try {
      const q = new URLSearchParams();
      q.set('limit', '30');
      if (cursor) q.set('cursor', String(cursor));
      const res = await fetch(`/api/reels/feed?${q.toString()}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      setServerReels(prev => {
        const map = new Map<string, any>();
        prev.forEach(r => { if (r && r.id) map.set(r.id, r); });
        (data.reels || []).forEach((r: any) => { if (r && r.id) map.set(r.id, r); });
        return Array.from(map.values());
      });
      setReelsNextCursor(data.nextCursor ?? null);
      setReelsHasMore(!!data.hasMore);
    } catch (e) {
      console.warn('Failed to load server reels:', e);
    } finally {
      reelsLoadMoreRef.current = false;
      setIsLoadingReels(false);
    }
  }, [token]);

  // Initial load when the user opens the reels tab.
  useEffect(() => {
    if (token && feedSubTab === 'reels' && !isLoadingReels && serverReels.length === 0) {
      fetchServerReels(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, feedSubTab]);

  // Infinite scroll: auto-load the next ranked page when the sentinel is visible.
  useEffect(() => {
    const el = reelsSentinelRef.current;
    if (!el || !reelsHasMore) return;
    const obs = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && reelsHasMore && !isLoadingReels) {
        fetchServerReels(reelsNextCursor);
      }
    }, { rootMargin: '240px' });
    obs.observe(el);
    return () => obs.disconnect();
  }, [reelsHasMore, isLoadingReels, reelsNextCursor, fetchServerReels]);

  // View + watch-time analytics for server reels. Elapsed time is measured
  // between reel transitions (cleanup) so ≥3s of viewing counts as a view on
  // the server (ReelsAnalyticsManager threshold) instead of a fixed 2s ping.
  const reelWatchStartRef = useRef<number>(Date.now());
  useEffect(() => {
    if (activeImmersiveReelIndex === null || !token) return;
    const reel = filteredReels[activeImmersiveReelIndex];
    reelWatchStartRef.current = Date.now();
    if (!reel || !reel.isServerReel || !reel.id) return;
    return () => {
      const elapsed = Math.round((Date.now() - reelWatchStartRef.current) / 1000);
      if (elapsed >= 2 && reel.id) {
        fetch(`/api/reels/${reel.id}/view`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ watchSeconds: Math.min(elapsed, 120) }),
        }).catch(() => {});
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeImmersiveReelIndex, token]);

  // Dynamically extract all hashtags and trend counts from live posts, reels, and reference lists
  const extractedHashtags = useMemo(() => {
    const tagCounts: Record<string, number> = {};

    // 1. Scan feedList
    feedList.forEach(post => {
      const text = `${post.title || ''} ${post.content || ''}`;
      const matches = text.match(/#[a-zA-Z0-9_\u0980-\u09FF]+/g);
      if (matches) {
        matches.forEach(m => {
          const tag = m.toLowerCase();
          tagCounts[tag] = (tagCounts[tag] || 0) + 1;
        });
      }
      if (post.tags && Array.isArray(post.tags)) {
        post.tags.forEach((t: string) => {
          const tag = t.startsWith('#') ? t.toLowerCase() : `#${t.toLowerCase()}`;
          tagCounts[tag] = (tagCounts[tag] || 0) + 1;
        });
      }
    });

    // 2. Scan Reels
    (allReels || []).forEach(reel => {
      const text = `${reel.title || ''} ${reel.caption || ''} ${reel.category || ''}`;
      const matches = text.match(/#[a-zA-Z0-9_\u0980-\u09FF]+/g);
      if (matches) {
        matches.forEach(m => {
          const tag = m.toLowerCase();
          tagCounts[tag] = (tagCounts[tag] || 0) + 1;
        });
      }
    });

    // Hashtags dynamically aggregated from actual posts and reels
    const defaultReferenceHashtags: { tag: string; count: number }[] = [];

    defaultReferenceHashtags.forEach(item => {
      if (!tagCounts[item.tag]) {
        tagCounts[item.tag] = item.count;
      }
    });

    return Object.entries(tagCounts)
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count);
  }, [feedList, allReels]);

  // Real-time social comments states
  const [openComments, setOpenComments] = useState<Record<string, boolean>>({});
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [commenterName, setCommenterName] = useState(() => localStorage.getItem('social_commenter_name') || '');
  const [activeCommentsPost, setActiveCommentsPost] = useState<any | null>(null);

  const convertReelToPost = (reel: any) => {
    if (!reel) return { id: '', title: '', content: '', date: '', likes: 0, comments: [] };
    const isFeedReel = reel.id && typeof reel.id === 'string' && reel.id.startsWith('reel-feed-');
    const originalId = isFeedReel ? reel.id.replace('reel-feed-', '') : reel.id;
    
    if (isFeedReel) {
      const found = feedList.find(p => p.id === originalId);
      if (found) return found;
    }
    
    return {
      id: originalId,
      title: reel.title,
      content: reel.caption || '',
      date: 'Just now',
      likes: reel.likes || 0,
      comments: [],
      imageUrl: reel.imageUrl,
      videoUrl: reel.videoUrl,
      creator: {
        id: reel.creatorId || 'anonymous-creator',
        name: reel.creatorName,
        username: reel.creatorName.toLowerCase().replace(/[^a-z0-9_]/g, '')
      }
    };
  };

  // Automatically clear viewingCreator when navigating away from the workspace view
  useEffect(() => {
    if (activeView !== 'workspace' && viewingCreator !== null) {
      setViewingCreator(null);
    }
  }, [activeView, viewingCreator]);

  // Active Toast Feed indicator
  const [toastText, setToastText] = useState('');
  const showToast = (msg: string) => {
    if (!msg) return;
    const lower = msg.toLowerCase();
    // Filter out quiet, noisy navigation, viewing, and tab-switching messages
    if (
      lower.includes('switched to') ||
      lower.includes('returned to') ||
      lower.includes('navigated to') ||
      lower.includes('viewing') ||
      lower.includes('playing') ||
      lower.includes('immersive view') ||
      lower.includes('loaded post') ||
      lower.includes('back history') ||
      lower.includes('reactions aligned')
    ) {
      return;
    }
    setToastText(msg);
    const timer = setTimeout(() => {
      setToastText(prev => prev === msg ? '' : prev);
    }, 2500);
    return () => clearTimeout(timer);
  };

  // --- RICH POSTS EXTRA STATE MECHANICS ---
  const [isCreatePostOpen, setIsCreatePostOpen] = useState(false);
  const [isUploadingPost, setIsUploadingPost] = useState(false);
  const [isUploadingMedia, setIsUploadingMedia] = useState(false);
  const [editingFeedPost, setEditingFeedPost] = useState<Post | null>(null);
  const [isTimeCapsule, setIsTimeCapsule] = useState(false);
  const [isAnonymousPost, setIsAnonymousPost] = useState(false);
  const [isNeedPost, setIsNeedPost] = useState(false);
  const [needType, setNeedType] = useState<'blood' | 'football' | 'other'>('other');
  const [needLocation, setNeedLocation] = useState('');
  const [needBox, setNeedBox] = useState('');
  const [needTime, setNeedTime] = useState('');
  const [needUrgency, setNeedUrgency] = useState<'urgent' | 'normal'>('normal');
  const [capsuleDate, setCapsuleDate] = useState('');
  const [capsuleTime, setCapsuleTime] = useState('');
  const [activeFeedDropdownId, setActiveFeedDropdownId] = useState<string | null>(null);
  const [likesModalPost, setLikesModalPost] = useState<Post | null>(null);
  
  // Media Attachment Base64 stores
  const [attachedImage, setAttachedImage] = useState<string>('');
  const [attachedVideo, setAttachedVideo] = useState<string>('');
  const [attachedAudio, setAttachedAudio] = useState<string>('');
  const [showPostGifPicker, setShowPostGifPicker] = useState(false);

  // ── Editor engine state (photo edit + create studio) ──
  const [photoEditFile, setPhotoEditFile] = useState<string | File | Blob | null>(null); // feed composer image → PhotoEditorModal
  const [avatarEditFile, setAvatarEditFile] = useState<File | null>(null);      // IdentityCard avatar → PhotoEditorModal
  const [showCanvasDesign, setShowCanvasDesign] = useState(false);
  const [showWhiteboard, setShowWhiteboard] = useState(false);
  const [showStoryEditor, setShowStoryEditor] = useState(false);
  const [showCutVideo, setShowCutVideo] = useState(false);
  const [storyCaption, setStoryCaption] = useState('');
  const [reelCaption, setReelCaption] = useState('');

  // Audio Recording States
  const [recording, setRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const [recordingInterval, setRecordingInterval] = useState<any | null>(null);

  // Sharing states
  const [sharingPost, setSharingPost] = useState<any | null>(null);

  // --- NOTIFICATIONS & MENTIONS & FOLLOWERS & FRIENDS ---
  const [followers, setFollowers] = useState<any[]>([]);
  const [friends, setFriends] = useState<any[]>([]);
  const [friendRequestsSent, setFriendRequestsSent] = useState<string[]>([]);
  const [friendRequestsReceived, setFriendRequestsReceived] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [postContent, setPostContent] = useState('');
  const [showPostMentions, setShowPostMentions] = useState(false);
  const [postMentionFilter, setPostMentionFilter] = useState('');

  // Workspace sub-tab ('posts' or 'bookmarks')
  const [workspaceSubTab, setWorkspaceSubTab] = useState<'posts' | 'bookmarks'>('posts');

  const handleAddComment = async (postId: string) => {
    const text = commentDrafts[postId]?.trim();
    if (!text) return;

    let finalSender = user?.name || commenterName.trim();
    if (!finalSender) {
      finalSender = "Guest Creator";
    }

    try {
      const response = await fetch(`/api/posts/${postId}/comment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ senderName: finalSender, text })
      });

      if (response.ok) {
        const data = await response.json();
        setFeedList(prev => prev.map(p => p.id === postId ? { ...p, comments: data.comments } : p));
        setCommentDrafts(prev => ({ ...prev, [postId]: '' }));
        if (!user && commenterName.trim()) {
          localStorage.setItem('social_commenter_name', commenterName.trim());
        }
        showToast("Comment posted live!");
      } else {
        showToast("⚠️ Failed to post comment.");
      }
    } catch (e) {
      console.error(e);
      showToast("⚠️ Connection error.");
    }
  };

  // Helper to fetch global feed
  const fetchFeed = async () => {
    if (isFetchingFeed.current) return;
    isFetchingFeed.current = true;
    try {
      const headers: Record<string, string> = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      const res = await fetch('/api/posts/feed', { headers });
      if (res.ok) {
        const data = await safeJsonParse(res);
        if (data) {
          setFeedList(data.feed || []);
        }
      }
    } catch (e) {
      console.warn("Could not fetch feed:", e);
    } finally {
      isFetchingFeed.current = false;
    }
  };

  // Periodic background feed polling for real-time feed synchronization
  useEffect(() => {
    fetchFeed();
    const interval = setInterval(() => {
      fetchFeed();
    }, 12000);
    return () => clearInterval(interval);
  }, [token]);

  // Helper to toggle following a creator on the live backend
  const handleFollowToggle = async (creatorId: string) => {
    if (!token) {
      showToast("🔒 Register or login to follow this creator!");
      setAuthTab('login');
      setIsAuthOpen(true);
      return;
    }
    if (user && user.id === creatorId) {
      showToast("⚠️ You cannot follow your own space.");
      return;
    }
    try {
      const res = await fetch(`/api/creators/${creatorId}/follow`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });
      if (res.ok) {
        const data = await res.json();
        setFollowingIds(data.followingList || []);
        
        // Update local viewer profile follower statistics live on-screen
        if (viewingCreator && viewingCreator.id === creatorId) {
          setViewingCreator(prev => prev ? {
            ...prev,
            profile: { ...prev.profile, followersCount: data.followersCount }
          } : null);
        }
        
        fetchCreators();
        showToast(data.isFollowing ? "✓ Following creator" : "Unfollowed creator");
      } else {
        const errData = await res.json();
        showToast(`⚠️ ${errData.error || 'Action failed'}`);
      }
    } catch (e) {
      console.error(e);
      showToast("⚠️ Connection issue.");
    }
  };

  // Helper to handle friend system operations
  const handleFriendAction = async (creatorId: string, action: 'send' | 'accept' | 'decline' | 'unfriend') => {
    if (!token) {
      showToast("🔒 Register or login to manage friends!");
      setAuthTab('login');
      setIsAuthOpen(true);
      return;
    }
    if (user && user.id === creatorId) {
      showToast("⚠️ You cannot perform friend actions with yourself.");
      return;
    }

    let url = '';
    if (action === 'send') url = '/api/friends/request/send';
    else if (action === 'accept') url = '/api/friends/request/accept';
    else if (action === 'decline') url = '/api/friends/request/decline';
    else if (action === 'unfriend') url = '/api/friends/unfriend';

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ targetId: creatorId })
      });

      if (res.ok) {
        const data = await res.json();
        showToast(`✓ Friend action successful!`);
        
        // Refresh authentication user state, feed, and creator list
        fetchMe(token);
        fetchCreators();
        fetchFeed();
        fetchNotifications();

        // Refresh the viewingCreator profile if they are viewing that profile
        if (viewingCreator && viewingCreator.id === creatorId) {
          const profileRes = await fetch(`/api/creators/${creatorId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          if (profileRes.ok) {
            const profileData = await profileRes.json();
            setViewingCreator({
              id: profileData.id,
              name: profileData.name,
              profile: profileData.profile
            });
          }
        }
      } else {
        const errData = await res.json();
        showToast(`⚠️ ${errData.error || 'Action failed'}`);
      }
    } catch (e) {
      console.error(e);
      showToast("⚠️ Connection issue.");
    }
  };

  // Helper to open a post's video in the immersive reels feed
  const handleVideoClickToReel = (post: any) => {
    setFeedSearchQuery('');
    const targetId = `reel-feed-${post.id}`;
    const idx = allReels.findIndex(r => r.id === targetId);
    if (idx !== -1) {
      setActiveImmersiveReelIndex(idx);
    } else {
      setActiveImmersiveReelIndex(0);
    }
    setActiveView('feed');
    setFeedSubTab('reels');
  };

  // Facebook-style Interested / Not Interested feedback -> strong ranking signal.
  // (Interested lifts the feedback score; Not Interested applies the heavy β₋ = −3.0 penalty.)
  const handleRankFeedback = (postId: string, type: 'interested' | 'not_interested', title?: string) => {
    turtleRankingEngine.recordSignal(postId, type, title);
    setRankFeedback({ ...turtleRankingEngine.getFeedback() });
    showToast(type === 'interested'
      ? '👍 Marked as Interested — the algorithm will surface more like this'
      : '👎 Marked as Not Interested — showing less of this in your feed');
  };

  // Facebook Boost Post action — pushes the post up the feed via the boost multiplier (up to 2.5×).
  const handleBoostPost = (postId: string) => {
    const boosted = turtleRankingEngine.toggleBoost(postId);
    setRankBoosted(turtleRankingEngine.getBoosted());
    showToast(boosted
      ? '⚡ Post Boosted — Facebook Boost Post multiplier active'
      : 'Boost removed — post returns to organic ranking');
  };

  // Normalize reel ids that wrap feed posts (`reel-feed-<postId>`) back to the post id
  const rankKeyFor = (id: string) => (id && id.startsWith('reel-feed-') ? id.replace('reel-feed-', '') : id);

  // Helper to like a post globally in the feed
  const handleLikeFeedPost = async (postId: string, reactionType: string = 'like') => {
    // Record signal in hybrid ranking engine
    turtleRankingEngine.recordSignal(postId, 'like');

    // Obtain or initialize guest identifier
    let guestId = localStorage.getItem('visitor_guest_id');
    if (!guestId) {
      guestId = 'guest-' + Math.random().toString(36).substring(2, 11);
      localStorage.setItem('visitor_guest_id', guestId);
    }

    const syncReactionState = (p: any) => {
      const reactions = p.reactions || { like: [], love: [], insight: [], support: [] };
      const allReacted = Object.values(reactions).flat() as string[];
      return {
        ...p,
        likes: allReacted.length,
        likedBy: allReacted,
        reactions
      };
    };

    // If we're not logged in, and viewing the default local profile, allow local-only liking for instant guest interactivity
    if (!token && !viewingCreator) {
      setProfile(prev => {
        const posts = (prev.posts || []).map(p => {
          if (p.id !== postId) return p;
          // Clone reactions deeply before mutating (safe under StrictMode double-invocation)
          const reactions = {
            like: [...(p.reactions?.like || [])],
            love: [...(p.reactions?.love || [])],
            insight: [...(p.reactions?.insight || [])],
            support: [...(p.reactions?.support || [])],
          };
          const list = reactions[reactionType as ReactionType] || [];
          const idx = list.indexOf('guest-local');
          if (idx !== -1) {
            list.splice(idx, 1);
          } else {
            Object.keys(reactions).forEach((rt) => { reactions[rt as ReactionType] = (reactions[rt as ReactionType] || []).filter((id: string) => id !== 'guest-local'); });
            reactions[reactionType as ReactionType] = [...(reactions[reactionType as ReactionType] || []), 'guest-local'];
          }
          return syncReactionState({ ...p, reactions });
        });
        return { ...prev, posts };
      });
      showToast("React registered locally (Visitor Mode)!");
      return;
    }

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      if (isActingAsAnonymous) {
        headers['X-Acting-As-Anonymous'] = 'true';
      }
      const res = await fetch(`/api/posts/${postId}/like`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ guestId, reaction: reactionType })
      });
      if (res.ok) {
        const data = await res.json();
        const mergeState = (p: any) => syncReactionState({ ...p, likes: data.likes, likedBy: data.likedBy || [], reactions: data.reactions });
        // Sync feed list state
        setFeedList(prev => prev.map(p => p.id === postId ? mergeState(p) : p));
        
        // Update own profile posts if it contains this post
        setProfile(prev => {
          if (!prev.posts?.some(p => p.id === postId)) return prev;
          const posts = (prev.posts || []).map(p => p.id === postId ? mergeState(p) : p);
          return { ...prev, posts };
        });
        
        if (viewingCreator) {
          setViewingCreator(prev => prev ? {
            ...prev,
            profile: {
              ...prev.profile,
              posts: (prev.profile.posts || []).map(p => p.id === postId ? mergeState(p) : p)
            }
          } : null);
        }

        // Sync CommentsModal active post state
        if (activeCommentsPost && activeCommentsPost.id === postId) {
          setActiveCommentsPost(prev => prev ? mergeState(prev) : null);
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Click handler to redirect notification to its source
  const handleNotificationClick = async (notif: any) => {
    // 1. Mark as read on backend
    if (!notif.isRead && token) {
      try {
        const res = await fetch(`/api/notifications/${notif.id}/read`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          setNotifications(data.notifications || []);
        }
      } catch (e) {
        console.warn("Could not mark notification as read on server:", e);
      }
    }

    // Mark as read locally in state
    setNotifications(prev => prev.map(n => n.id === notif.id ? { ...n, isRead: true } : n));

    // 2. Go to source!
    if (notif.type === 'chat_message') {
      if (notif.actorIds && notif.actorIds.length > 0) {
        setInitialActiveChatUserId(notif.actorIds[0]);
      }
      setActiveView('chat');
      showToast("💬 Opening direct message");
      return;
    }

    if (notif.postId) {
      try {
        // Try to find the post locally in feedList
        const localPost = feedList.find(p => p.id === notif.postId);
        if (localPost) {
          setActiveView('feed');
          setFeedSubTab('feed');
          setActiveCommentsPost(localPost);
          showToast(`Viewing post: "${localPost.title || 'micro-post'}"`);
        } else {
          // Fetch from our newly created individual post endpoint!
          const headers: Record<string, string> = {};
          if (token) {
            headers['Authorization'] = `Bearer ${token}`;
          }
          const res = await fetch(`/api/posts/${notif.postId}`, { headers });
          if (res.ok) {
            const data = await res.json();
            if (data.post) {
              setActiveView('feed');
              setFeedSubTab('feed');
              setActiveCommentsPost(data.post);
              showToast(`Loaded post from notification`);
            }
          } else {
            showToast("⚠️ Could not locate post (may have been deleted).");
          }
        }
      } catch (e) {
        console.error(e);
        showToast("⚠️ Error loading source post.");
      }
    } else if (notif.actorIds && notif.actorIds.length > 0) {
      // Direct to user's profile
      loadCreatorProfile(notif.actorIds[0]);
    } else {
      showToast("Notification acknowledged.");
    }
  };

  // Helper to open repost modal
  const handleRepostFeedPost = async (originalPost: any) => {
    if (!token) {
      showToast("🔒 Please log in to repost.");
      setAuthTab('login');
      setIsAuthOpen(true);
      return;
    }
    setRepostQuoteComment('');
    setRepostModalPost(originalPost);
  };

  const executeActualRepost = async (originalPost: any, quoteComment?: string) => {
    if (!token) {
      showToast("🔒 Please log in to repost.");
      setAuthTab('login');
      setIsAuthOpen(true);
      return;
    }

    try {
      let originalOwnerId = null;
      let originalOwnerName = '';

      if (originalPost.isRepost && originalPost.repostedFrom?.id) {
        originalOwnerId = originalPost.repostedFrom.id;
        originalOwnerName = originalPost.repostedFrom.name;
      } else {
        originalOwnerId = originalPost.creator?.id || originalPost.ownerId || originalPost.authorId || (viewingCreator ? viewingCreator.id : null);
        originalOwnerName = originalPost.creator?.name || originalPost.authorName || (viewingCreator ? viewingCreator.name : 'Original Creator');
      }

      if (!originalOwnerId) {
        const found = feedList.find(p => p.id === originalPost.id);
        if (found) {
          if (found.isRepost && found.repostedFrom?.id) {
            originalOwnerId = found.repostedFrom.id;
            originalOwnerName = found.repostedFrom.name;
          } else {
            originalOwnerId = found.creator?.id || found.ownerId || found.authorId;
            originalOwnerName = found.creator?.name || found.authorName || originalOwnerName;
          }
        }
      }

      // Final fallback if we are on our own workspace and creating a repost of our own post
      if (!originalOwnerId) {
        originalOwnerId = user?.id || profile?.id;
        originalOwnerName = profile?.name || user?.name || 'Original Creator';
      }

      const finalContent = quoteComment && quoteComment.trim() 
        ? `${quoteComment.trim()}\n\n—\n${originalPost.content || ''}` 
        : originalPost.content;

      const repostPost = {
        id: `post-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        title: originalPost.title,
        content: finalContent,
        imageUrl: originalPost.imageUrl || null,
        videoUrl: originalPost.videoUrl || null,
        audioUrl: originalPost.audioUrl || null,
        likes: 0,
        likedBy: [],
        date: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
        isRepost: true,
        repostedFrom: {
          id: originalOwnerId || 'system',
          name: originalOwnerName
        },
        originalPostId: originalPost.originalPostId || originalPost.id
      };

      const updatedPosts = [repostPost, ...(profile.posts || [])];

      const res = await fetch('/api/posts/update', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ posts: updatedPosts })
      });

      if (res.ok) {
        showToast("✨ Publication reposted successfully!");
        fetchFeed();
        refreshCurrentProfile();
      }
    } catch (e) {
      console.error("Repost failed:", e);
      showToast("⚠️ Repost failed.");
    }
  };

  const startAudioRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => chunks.push(e.data);
      recorder.onstop = async () => {
        const blob = new Blob(chunks, { type: 'audio/webm' });
        showToast("🎙️ Uploading voice note...");
        try {
          const url = await uploadMediaFile(blob, `voicenote-${Date.now()}.webm`);
          setAttachedAudio(url);
          showToast("🎙️ Voice note recorded and attached!");
        } catch (err) {
          const reader = new FileReader();
          reader.onload = () => {
            setAttachedAudio(reader.result as string);
            showToast("🎙️ Voice note attached!");
          };
          reader.readAsDataURL(blob);
        }
      };
      recorder.start();
      setMediaRecorder(recorder);
      setRecording(true);
      setRecordingTime(0);
      const interval = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
      setRecordingInterval(interval);
      showToast("🔴 Recording voice note... Release to attach.");
    } catch (err) {
      console.warn("Microphone access denied or dismissed, using simulation fallback.", err);
      // Fallback simulation so user can still attach voice note successfully
      setMediaRecorder(null);
      setRecording(true);
      setRecordingTime(0);
      const interval = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
      setRecordingInterval(interval);
      showToast("🎙️ Recording simulated voice note (Mic permission fallback)... Release to attach.");
    }
  };

  const stopAudioRecording = () => {
    if (mediaRecorder && recording) {
      try {
        mediaRecorder.stop();
        mediaRecorder.stream.getTracks().forEach(track => track.stop());
      } catch (e) {
        // ignore
      }
    }
    if (recordingInterval) {
      clearInterval(recordingInterval);
    }
    setRecording(false);
    const wasSimulated = !mediaRecorder;
    setMediaRecorder(null);
    setRecordingInterval(null);

    if (wasSimulated && recording) {
      const sampleAudioUrl = "https://actions.google.com/sounds/v1/ambiences/rain_heavy.ogg";
      setAttachedAudio(sampleAudioUrl);
      showToast("🎙️ Voice note successfully attached!");
    }
  };

  // Helper to publish a post directly from the Feed tab
  const handleCreatePostFromFeed = async (title: string, content: string, imageUrl?: string, videoUrl?: string, audioUrl?: string) => {
    if (!token) {
      showToast("🔒 Please log in to publish a post.");
      setAuthTab('login');
      setIsAuthOpen(true);
      return;
    }
    setIsUploadingPost(true);
    try {
      // AI Safety NSFW Content Screening
      const textVerdict = screenContentText(`${title} ${content}`);
      if (textVerdict === 'block') {
        showToast("🚨 Post blocked: Contains explicit / adult text violating AI Safety guidelines.");
        setIsUploadingPost(false);
        return;
      }
      if (textVerdict === 'blur') {
        showToast("⚠️ Notice: Sensitive keywords detected by AI Safety Engine.");
      }

      let imageNsfwVerdict: 'safe' | 'blur' | 'block' = 'safe';
      if (imageUrl) {
        try {
          const imgScreen = await screenImageSource(imageUrl);
          imageNsfwVerdict = imgScreen.verdict;
          if (imgScreen.verdict === 'block') {
            showToast("🚨 Post blocked: Attached image contains adult/explicit content (NSFW/Nudity detected).");
            setIsUploadingPost(false);
            return;
          }
          if (imgScreen.verdict === 'blur') {
            showToast("⚠️ Notice: Attached image flagged as sensitive by NSFW filter.");
          }
        } catch (e) {
          console.warn("NSFW image screen error:", e);
        }
      }
      const formatDate = () => {
        const options: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'long', day: 'numeric' };
        return new Date().toLocaleDateString('en-US', options);
      };

      let finalUnlockDate: string | undefined = undefined;
      if (isTimeCapsule && capsuleDate && capsuleTime) {
        const localDateTimeStr = `${capsuleDate}T${capsuleTime}`;
        const d = new Date(localDateTimeStr);
        if (!isNaN(d.getTime())) {
          finalUnlockDate = d.toISOString();
        }
      }

      const shouldBeAnonymous = isAnonymousPost || isActingAsAnonymous;
      
      let anonId = `anon-user-BD-99-9999`;
      let currentAnonName = anonName || `ANON BD 99 9999`;
      if (user) {
        const deter = getDeterministicAnon(user.id, user.countryCode);
        anonId = deter.id;
        currentAnonName = anonName || deter.name;
      } else {
        let visitorSeed = localStorage.getItem('visitor_anon_seed');
        if (!visitorSeed) {
          visitorSeed = 'visitor-' + Math.random().toString(36).substring(2, 11);
          localStorage.setItem('visitor_anon_seed', visitorSeed);
        }
        let hash = 0;
        for (let i = 0; i < visitorSeed.length; i++) {
          hash = visitorSeed.charCodeAt(i) + ((hash << 5) - hash);
        }
        hash = Math.abs(hash);
        const num1 = 10 + (hash % 90);
        const num2 = 1000 + ((hash >> 4) % 9000);
        anonId = `anon-user-BD-${num1}-${num2}`;
        currentAnonName = anonName || `ANON BD ${num1} ${num2}`;
      }

      const nowTs = Date.now();
      const newPost: Post = {
        id: `post-${nowTs}`,
        title: title.trim(),
        content: content.trim(),
        date: formatDate(),
        createdTime: nowTs,
        createdAt: new Date(nowTs).toISOString(),
        timestamp: nowTs,
        likes: 0,
        imageUrl,
        videoUrl,
        audioUrl,
        isNsfw: imageNsfwVerdict === 'blur' || textVerdict === 'blur',
        nsfwVerdict: imageNsfwVerdict !== 'safe' ? imageNsfwVerdict : textVerdict,
        isTimeCapsule: isTimeCapsule,
        unlockDate: finalUnlockDate,
        lockedAtDate: new Date().toISOString(),
        followersSuggested: false,
        isAnonymous: shouldBeAnonymous,
        anonymousCreatorId: shouldBeAnonymous ? anonId : undefined,
        anonymousCreatorName: shouldBeAnonymous ? currentAnonName : undefined,
        isNeedPost: isNeedPost,
        needType: isNeedPost ? needType : undefined,
        needStatus: isNeedPost ? 'active' : undefined,
        needLocation: isNeedPost ? needLocation.trim() : undefined,
        needBox: isNeedPost ? needBox.trim() : undefined,
        needTime: isNeedPost ? needTime.trim() : undefined,
        needUrgency: isNeedPost ? needUrgency : undefined,
        needTexts: isNeedPost ? [] : []
      };

      if (videoUrl) saveMediaItem(`post_vid_${newPost.id}`, videoUrl);
      if (imageUrl) saveMediaItem(`post_img_${newPost.id}`, imageUrl);

      try {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;
        await fetch('/api/posts/create', {
          method: 'POST',
          headers,
          body: JSON.stringify({ post: newPost })
        });
      } catch (err) {
        console.warn("Direct post creation endpoint error:", err);
      }

      const updatedPosts = [newPost, ...(profile.posts || [])];
      await handleUpdatePosts(updatedPosts);
      await fetchFeed();
      showToast(isTimeCapsule ? "🕒 Time capsule sealed and published!" : "Post shared live to network feed!");
    } catch (e) {
      console.error(e);
      showToast("⚠️ Failed to publish post.");
    } finally {
      setIsUploadingPost(false);
    }
  };

  // Helper to edit an existing post in the Feed tab with backend sync
  const handleEditFeedPost = async (
    postId: string, 
    title: string, 
    content: string, 
    imageUrl?: string, 
    videoUrl?: string, 
    audioUrl?: string,
    overrideIsTimeCapsule?: boolean,
    overrideUnlockDate?: string
  ) => {
    if (!token) {
      showToast("🔒 Please log in to edit.");
      return;
    }

    const targetIsTimeCapsule = overrideIsTimeCapsule !== undefined ? overrideIsTimeCapsule : isTimeCapsule;
    let finalUnlockDate: string | undefined = overrideUnlockDate;
    if (!finalUnlockDate && targetIsTimeCapsule && capsuleDate && capsuleTime) {
      const localDateTimeStr = `${capsuleDate}T${capsuleTime}`;
      const d = new Date(localDateTimeStr);
      if (!isNaN(d.getTime())) {
        finalUnlockDate = d.toISOString();
      }
    }

    setIsUploadingPost(true);
    try {
      const res = await fetch(`/api/posts/${postId}/edit`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
          title: title.trim(), 
          content: content.trim(),
          imageUrl,
          videoUrl,
          audioUrl,
          isTimeCapsule: targetIsTimeCapsule,
          unlockDate: finalUnlockDate,
          isNeedPost: isNeedPost,
          needStatus: isNeedPost ? 'active' : undefined,
          needLocation: isNeedPost ? needLocation.trim() : undefined,
          needBox: isNeedPost ? needBox.trim() : undefined,
          needTime: isNeedPost ? needTime.trim() : undefined,
          needUrgency: isNeedPost ? needUrgency : undefined,
        })
      });

      // Synchronize locally in states immediately
      setFeedList(prev => prev.map(p => p.id === postId ? { 
        ...p, 
        title: title.trim(), 
        content: content.trim(),
        imageUrl: imageUrl !== undefined ? imageUrl : p.imageUrl,
        videoUrl: videoUrl !== undefined ? videoUrl : p.videoUrl,
        audioUrl: audioUrl !== undefined ? audioUrl : p.audioUrl,
        isTimeCapsule: targetIsTimeCapsule,
        unlockDate: finalUnlockDate !== undefined ? finalUnlockDate : p.unlockDate
      } : p));

      const updatedPosts = (profile.posts || []).map(p => {
        if (p.id === postId) {
          return {
            ...p,
            title: title.trim(),
            content: content.trim(),
            imageUrl: imageUrl !== undefined ? imageUrl : p.imageUrl,
            videoUrl: videoUrl !== undefined ? videoUrl : p.videoUrl,
            audioUrl: audioUrl !== undefined ? audioUrl : p.audioUrl,
            isTimeCapsule: targetIsTimeCapsule,
            unlockDate: finalUnlockDate !== undefined ? finalUnlockDate : p.unlockDate,
            isNeedPost: isNeedPost,
            needStatus: isNeedPost ? (p.needStatus || 'active') : undefined,
            needLocation: isNeedPost ? needLocation.trim() : undefined,
            needBox: isNeedPost ? needBox.trim() : undefined,
            needTime: isNeedPost ? needTime.trim() : undefined,
            needUrgency: isNeedPost ? needUrgency : undefined,
          };
        }
        return p;
      });

      await handleUpdatePosts(updatedPosts);
      await fetchFeed();
      showToast("Post updated successfully!");
    } catch (e) {
      console.error(e);
      showToast("⚠️ Error updating post on server.");
    } finally {
      setIsUploadingPost(false);
    }
  };

  // Helper to toggle saving other users' posts
  const handleSavePost = async (postId: string) => {
    if (!token) {
      showToast("🔒 Please log in to save posts.");
      setAuthTab('login');
      setIsAuthOpen(true);
      return;
    }
    const currentSavedIds = profile.savedPostIds || [];
    const isSaved = currentSavedIds.includes(postId);
    let nextSavedIds: string[];
    if (isSaved) {
      nextSavedIds = currentSavedIds.filter(id => id !== postId);
      showToast("Post removed from saved bookmarks.");
    } else {
      nextSavedIds = [...currentSavedIds, postId];
      turtleRankingEngine.recordSignal(postId, 'save');
      showToast("Post bookmarked successfully!");
    }
    await handleUpdateProfile({ savedPostIds: nextSavedIds });
  };

  // Helper to remove a post directly from the Feed tab
  const handleDeleteFeedPost = (postId: string) => {
    setPostToDeleteId(postId);
  };

  const handleConfirmDeleteFeedPost = async () => {
    if (!postToDeleteId) return;
    const idToDelete = postToDeleteId;
    setPostToDeleteId(null);

    if (!token) {
      // Offline fallback: delete from local feed and profile
      setFeedList(prev => prev.filter(p => p.id !== idToDelete));
      setProfile(prev => {
        const posts = (prev.posts || []).filter(p => p.id !== idToDelete);
        const nextProfile = { ...prev, posts };
        localStorage.setItem('user_portfolio_profile', JSON.stringify(nextProfile));
        return nextProfile;
      });
      showToast("Post deleted locally successfully!");
      return;
    }

    try {
      const res = await fetch(`/api/posts/${idToDelete}/delete`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        setFeedList(prev => prev.filter(p => p.id !== idToDelete));
        setProfile(prev => {
          const posts = (prev.posts || []).filter(p => p.id !== idToDelete);
          return { ...prev, posts };
        });
        showToast("Post deleted successfully!");
      } else {
        const updatedPosts = (profile.posts || []).filter(p => p.id !== idToDelete);
        await handleUpdatePosts(updatedPosts);
        await fetchFeed();
        showToast("Post removed.");
      }
    } catch (e) {
      console.error(e);
      const updatedPosts = (profile.posts || []).filter(p => p.id !== idToDelete);
      await handleUpdatePosts(updatedPosts);
      await fetchFeed();
      showToast("Post removed.");
    }
  };

  // Helper to fetch other creators
  const fetchCreators = async () => {
    if (isFetchingCreators.current) return;
    isFetchingCreators.current = true;
    try {
      const headers: Record<string, string> = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      const res = await fetch('/api/creators', { headers });
      if (res.ok) {
        const data = await safeJsonParse(res);
        if (data) {
          setCreatorsList(data.creators || []);
        }
      }
    } catch (e) {
      console.warn("Could not fetch creators:", e);
    } finally {
      isFetchingCreators.current = false;
    }
  };

  // Helper to fetch direct messages for authenticated user
  const fetchMessages = async (authToken: string) => {
    if (!authToken || isFetchingMessages.current) return;
    isFetchingMessages.current = true;
    try {
      const res = await fetch('/api/messages', {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      if (res.ok) {
        const data = await safeJsonParse(res);
        if (data) {
          setMessages(data.messages || []);
        }
      }
    } catch (e) {
      console.warn("Could not fetch messages:", e);
    } finally {
      isFetchingMessages.current = false;
    }
  };

  const fetchArchivedChats = async () => {
    if (!token) return;
    setLoadingArchived(true);
    try {
      const response = await fetch('/api/chat/conversations', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        const allConversations = data.conversations || [];
        const archived = allConversations.filter((c: any) => c.isArchived);
        setArchivedChats(archived);
      }
    } catch (e) {
      console.error('Failed to fetch archived chats:', e);
    } finally {
      setLoadingArchived(false);
    }
  };

  const handleUnarchiveChat = async (convId: string) => {
    if (!token) return;
    try {
      const response = await fetch(`/api/chat/conversations/${convId}/unarchive`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        showToast("Chat restored to inbox instantly!");
        await fetchArchivedChats();
        setChatKey(prev => prev + 1);
      }
    } catch (e) {
      console.error('Failed to unarchive chat:', e);
      showToast("⚠️ Failed to restore chat.");
    }
  };

  // Authenticate user on mount or token changes
  const fetchMe = async (authToken: string) => {
    try {
      const res = await fetch('/api/auth/me', {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      if (res.ok) {
        const data = await safeJsonParse(res);
        if (data) {
          setUser(data.user);
          setProfile(data.user.profile);
          setFollowingIds(data.user.following || []);
          setFollowers(data.user.followers || []);
          setFriends(data.user.friends || []);
          setFriendRequestsSent(data.user.friendRequestsSent || []);
          setFriendRequestsReceived(data.user.friendRequestsReceived || []);
          fetchMessages(authToken);
        }
      } else if (res.status === 401) {
        // Retry once after a brief delay in case server is rebooting or compiling updates
        await new Promise(r => setTimeout(r, 1500));
        try {
          const retryRes = await fetch('/api/auth/me', {
            headers: { 'Authorization': `Bearer ${authToken}` }
          });
          if (retryRes.ok) {
            const retryData = await safeJsonParse(retryRes);
            if (retryData) {
              setUser(retryData.user);
              setProfile(retryData.user.profile);
              setFollowingIds(retryData.user.following || []);
              setFollowers(retryData.user.followers || []);
              setFriends(retryData.user.friends || []);
              setFriendRequestsSent(retryData.user.friendRequestsSent || []);
              setFriendRequestsReceived(retryData.user.friendRequestsReceived || []);
              fetchMessages(authToken);
              return;
            }
          }
        } catch (retryErr) {
          console.warn("Auth retry failed:", retryErr);
        }

        // Token definitively expired or invalid
        localStorage.removeItem('secure_auth_token');
        setToken(null);
        setUser(null);
        setProfile(DEFAULT_PROFILE);
      }
    } catch (e) {
      console.warn("Auth me error:", e);
    }
  };

  // Load creators and session on mount with active live polling
  useEffect(() => {
    fetchCreators();
    fetchFeed();
    if (token) {
      fetchMe(token);
      fetchNotifications();
    } else {
      setProfile(DEFAULT_PROFILE);
      setMessages([
        { id: 'm1', senderName: 'Sarah Jenkins (Senior Designer)', text: 'Love the tactile feel of your profile cards! The monospace numbers look incredibly premium.', timestamp: 'July 4, 2026' },
        { id: 'm2', senderName: 'Devon Miller (Product Engineer)', text: 'Are you available for freelance contract roles starting this autumn?', timestamp: 'July 3, 2026' }
      ]);
    }
    setIsInitialized(true);

    const handleUnlockEvent = () => {
      fetchFeed();
      if (token) {
        fetchMe(token);
        fetchNotifications();
      }
    };
    const handleShowToastEvent = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail && customEvent.detail.message) {
        showToast(customEvent.detail.message);
      }
    };
    const handleOpenPostEvent = (e: Event) => {
      const customEvent = e as CustomEvent;
      const postId = customEvent.detail && customEvent.detail.postId;
      if (!postId) return;
      // Refresh the feed so the target post is present, then surface it.
      window.dispatchEvent(new CustomEvent('refresh-feed'));
      showToast(`Opening post ${String(postId).slice(0, 10)}…`);
    };
    window.addEventListener('capsule-unlocked', handleUnlockEvent);
    window.addEventListener('refresh-feed', handleUnlockEvent);
    window.addEventListener('show-toast', handleShowToastEvent);
    window.addEventListener('open-post', handleOpenPostEvent);
    return () => {
      window.removeEventListener('capsule-unlocked', handleUnlockEvent);
      window.removeEventListener('refresh-feed', handleUnlockEvent);
      window.removeEventListener('show-toast', handleShowToastEvent);
      window.removeEventListener('open-post', handleOpenPostEvent);
    };
  }, [token]);

  useEffect(() => {
    if (isCreatePostOpen) {
      setPostContent(editingFeedPost ? editingFeedPost.content : '');
      setIsTimeCapsule(editingFeedPost?.isTimeCapsule || false);
      setIsAnonymousPost(editingFeedPost?.isAnonymous || false);
      setNeedLocation(editingFeedPost?.needLocation || '');
      setNeedBox(editingFeedPost?.needBox || '');
      setNeedTime(editingFeedPost?.needTime || '');
      setNeedUrgency(editingFeedPost?.needUrgency || 'normal');
      if (editingFeedPost?.unlockDate) {
        try {
          const d = new Date(editingFeedPost.unlockDate);
          const year = d.getFullYear();
          const month = String(d.getMonth() + 1).padStart(2, '0');
          const day = String(d.getDate()).padStart(2, '0');
          setCapsuleDate(`${year}-${month}-${day}`);
          
          const hours = String(d.getHours()).padStart(2, '0');
          const minutes = String(d.getMinutes()).padStart(2, '0');
          setCapsuleTime(`${hours}:${minutes}`);
        } catch {
          setCapsuleDate('');
          setCapsuleTime('');
        }
      } else {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        setCapsuleDate(`${year}-${month}-${day}`);
        
        const future = new Date(now.getTime() + 15 * 60 * 1000);
        const hours = String(future.getHours()).padStart(2, '0');
        const minutes = String(future.getMinutes()).padStart(2, '0');
        setCapsuleTime(`${hours}:${minutes}`);
      }
    } else {
      setPostContent('');
      setShowPostMentions(false);
      setIsTimeCapsule(false);
      setIsAnonymousPost(false);
      setNeedLocation('');
      setNeedBox('');
      setNeedTime('');
      setNeedUrgency('normal');
      setCapsuleDate('');
      setCapsuleTime('');
    }
  }, [isCreatePostOpen, editingFeedPost]);

  const handleDownloadMedia = async (url: string, filename: string) => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
      showToast("💾 Download started successfully!");
    } catch (error) {
      // CORS fallback: open in new tab
      const link = document.createElement('a');
      link.href = url;
      link.target = '_blank';
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      showToast("💾 Opened media in new tab to download!");
    }
  };

  useEffect(() => {
    if (isSettingsOpen || isArchivedChatsPopupOpen) {
      fetchArchivedChats();
    }
  }, [isSettingsOpen, isArchivedChatsPopupOpen]);

  const getImmersiveMediaSlides = () => {
    const list = [...feedList];
    if (viewingCreator?.profile?.posts) {
      list.push(...viewingCreator.profile.posts);
    }
    if (profile?.posts) {
      list.push(...profile.posts);
    }
    
    // Unique by id
    const seen = new Set();
    const unique: any[] = [];
    for (const p of list) {
      if (p.id && !seen.has(p.id)) {
        seen.add(p.id);
        unique.push(p);
      }
    }

    const slides: { type: 'video' | 'audios'; posts: any[] }[] = [];

    // Filter video posts
    const videoPosts = unique.filter(p => p.videoUrl);
    videoPosts.forEach(post => {
      slides.push({
        type: 'video',
        posts: [post]
      });
    });

    // Filter audio posts
    const audioPosts = unique.filter(p => p.audioUrl);
    // Group audio posts by 3
    const AUDIOS_PER_SLIDE = 3;
    for (let i = 0; i < audioPosts.length; i += AUDIOS_PER_SLIDE) {
      const chunk = audioPosts.slice(i, i + AUDIOS_PER_SLIDE);
      if (chunk.length > 0) {
        slides.push({
          type: 'audios',
          posts: chunk
        });
      }
    }

    return slides;
  };

  const openImmersiveMedia = (post: any, mediaType: 'video' | 'audio') => {
    const slides = getImmersiveMediaSlides();
    let targetIndex = 0;
    
    if (mediaType === 'video') {
      const foundIndex = slides.findIndex(s => s.type === 'video' && s.posts[0]?.id === post.id);
      if (foundIndex !== -1) {
        targetIndex = foundIndex;
      }
    } else {
      const foundIndex = slides.findIndex(s => s.type === 'audios' && s.posts.some(p => p.id === post.id));
      if (foundIndex !== -1) {
        targetIndex = foundIndex;
      }
    }
    
    setActiveImmersiveMediaIndex(targetIndex);
  };

  useEffect(() => {
    const handleViewImage = (e: Event) => {
      const customEvent = e as CustomEvent<string>;
      if (customEvent.detail) {
        setFullscreenImageUrl(customEvent.detail);
      }
    };
    const handleViewPostMedia = (e: Event) => {
      const customEvent = e as CustomEvent<{ post: Post; mediaUrl: string; mediaType: 'image' | 'video' | 'audio' }>;
      if (customEvent.detail) {
        const { post } = customEvent.detail;
        setActiveCommentsPost(post);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setFullscreenImageUrl(null);
        setFullscreenMedia(null);
        setActiveImmersiveMediaIndex(null);
      }
    };
    const handleDetectVerifyLocation = () => {
      handleVerifyLocationLater();
    };
    window.addEventListener('view-image', handleViewImage);
    window.addEventListener('view-post-media', handleViewPostMedia);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('detect-verify-location', handleDetectVerifyLocation);
    return () => {
      window.removeEventListener('view-image', handleViewImage);
      window.removeEventListener('view-post-media', handleViewPostMedia);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('detect-verify-location', handleDetectVerifyLocation);
    };
  }, [feedList, viewingCreator, profile]);

  // Keyboard navigation for Immersive Reels
  useEffect(() => {
    if (activeImmersiveReelIndex === null) return;

    const handleReelKeys = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveImmersiveReelIndex(prev => {
          if (prev === null) return null;
          return prev < filteredReels.length - 1 ? prev + 1 : 0;
        });
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveImmersiveReelIndex(prev => {
          if (prev === null) return null;
          return prev > 0 ? prev - 1 : filteredReels.length - 1;
        });
      } else if (e.key === 'Escape') {
        setActiveImmersiveReelIndex(null);
      }
    };

    window.addEventListener('keydown', handleReelKeys);
    return () => {
      window.removeEventListener('keydown', handleReelKeys);
    };
  }, [activeImmersiveReelIndex, filteredReels]);

  // Keyboard navigation for Immersive Media Diver
  useEffect(() => {
    if (activeImmersiveMediaIndex === null) return;

    const handleMediaKeys = (e: KeyboardEvent) => {
      const slides = getImmersiveMediaSlides();
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveImmersiveMediaIndex(prev => {
          if (prev === null) return null;
          return prev < slides.length - 1 ? prev + 1 : 0;
        });
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveImmersiveMediaIndex(prev => {
          if (prev === null) return null;
          return prev > 0 ? prev - 1 : slides.length - 1;
        });
      }
    };

    window.addEventListener('keydown', handleMediaKeys);
    return () => {
      window.removeEventListener('keydown', handleMediaKeys);
    };
  }, [activeImmersiveMediaIndex]);

  // Automatic Pause/Resume of Video and Audio elements on Scroll
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const media = entry.target as HTMLVideoElement | HTMLAudioElement;
          if (entry.isIntersecting) {
            // Element entered viewport - resume playing if it was auto-paused
            if (media.dataset.wasPlaying === "true") {
              media.play().catch(() => {});
            }
          } else {
            // Element left viewport - pause if playing
            if (media && !media.paused) {
              media.dataset.wasPlaying = "true";
              media.dataset.isAutoPausing = "true";
              media.pause();
            }
          }
        });
      },
      { threshold: 0.2 } // Trigger when less than 20% visible
    );

    // Track play/pause state manually to avoid resuming elements that were already paused by the user
    const handlePlay = (e: Event) => {
      const media = e.target as HTMLVideoElement | HTMLAudioElement;
      media.dataset.wasPlaying = "true";
    };

    const handlePause = (e: Event) => {
      const media = e.target as HTMLVideoElement | HTMLAudioElement;
      if (media.dataset.isAutoPausing === "true") {
        media.dataset.isAutoPausing = "false";
        return;
      }
      media.dataset.wasPlaying = "false";
    };

    const setupObservers = () => {
      const mediaElements = document.querySelectorAll('video, audio');
      mediaElements.forEach((el) => {
        // Avoid duplicate event listeners
        if (el.getAttribute('data-observed') !== 'true') {
          el.setAttribute('data-observed', 'true');
          observer.observe(el);
          el.addEventListener('play', handlePlay);
          el.addEventListener('pause', handlePause);
        }
      });
    };

    setupObservers();

    // Re-check periodically when DOM changes (tab switches, new posts loaded)
    const interval = setInterval(setupObservers, 1500);

    return () => {
      clearInterval(interval);
      observer.disconnect();
      const mediaElements = document.querySelectorAll('video, audio');
      mediaElements.forEach((el) => {
        el.removeEventListener('play', handlePlay);
        el.removeEventListener('pause', handlePause);
      });
    };
  }, []);

  // Prevent background scroll when any popup modal is open
  useEffect(() => {
    const isAnyModalOpen = !!(
      isCreatePostOpen ||
      isSettingsOpen ||
      isAuthOpen ||
      activeCommentsPost ||
      fullscreenImageUrl ||
      fullscreenMedia ||
      isArchivedChatsPopupOpen ||
      activeImmersiveReelIndex !== null ||
      activeImmersiveMediaIndex !== null ||
      likedUsersPost ||
      postToDeleteId
    );

    if (isAnyModalOpen) {
      document.body.classList.add('overflow-hidden');
      document.documentElement.classList.add('overflow-hidden');
    } else {
      document.body.classList.remove('overflow-hidden');
      document.documentElement.classList.remove('overflow-hidden');
    }

    return () => {
      document.body.classList.remove('overflow-hidden');
      document.documentElement.classList.remove('overflow-hidden');
    };
  }, [
    isCreatePostOpen,
    isSettingsOpen,
    isAuthOpen,
    activeCommentsPost,
    fullscreenImageUrl,
    fullscreenMedia,
    isArchivedChatsPopupOpen,
    activeImmersiveReelIndex,
    activeImmersiveMediaIndex,
    likedUsersPost,
    postToDeleteId
  ]);

  // Robust fallback scroll unlocker upon any primary navigation change
  useEffect(() => {
    // Reset view-bound media overlays when changing primary views or subtabs
    if (activeView !== 'feed' || feedSubTab !== 'reels') {
      setActiveImmersiveReelIndex(null);
    }
    setActiveImmersiveMediaIndex(null);
    setFullscreenImageUrl(null);
    setFullscreenMedia(null);

    const isModalOpen = !!(
      isCreatePostOpen ||
      isSettingsOpen ||
      isAuthOpen ||
      isArchivedChatsPopupOpen ||
      postToDeleteId
    );

    if (!isModalOpen) {
      document.body.classList.remove('overflow-hidden');
      document.documentElement.classList.remove('overflow-hidden');
    }
  }, [activeView, feedSubTab, searchSubTab]);

  // Helper to silently refresh currently viewed profile in real-time
  const refreshCurrentProfile = async () => {
    if (isRefreshingProfile.current) return;
    isRefreshingProfile.current = true;
    try {
      if (token) {
        const res = await fetch('/api/auth/me', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await safeJsonParse(res);
          if (data) {
            setUser(data.user);
            setProfile(data.user.profile);
            setFollowingIds(data.user.following || []);
            setFollowers(data.user.followers || []);
            setFriends(data.user.friends || []);
            setFriendRequestsSent(data.user.friendRequestsSent || []);
            setFriendRequestsReceived(data.user.friendRequestsReceived || []);
            fetchMessages(token);
          }
        }
      }

      if (viewingCreator) {
        const headers: Record<string, string> = {};
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }
        const res = await fetch(`/api/creators/${viewingCreator.id}`, { headers });
        if (res.ok) {
          const data = await safeJsonParse(res);
          if (data) {
            setViewingCreator({ id: data.id, name: data.name, profile: data.profile, following: data.following || [] });
          }
        }
      }
    } catch (e) {
      console.warn("Error polling own profile:", e);
    } finally {
      isRefreshingProfile.current = false;
    }
  };

  const fetchNotifications = async () => {
    if (!token || isFetchingNotifications.current) return;
    isFetchingNotifications.current = true;
    try {
      const res = await fetch('/api/notifications', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await safeJsonParse(res);
        if (data) {
          setNotifications(data.notifications || []);
        }
      }
    } catch (e) {
      console.warn("Failed to fetch notifications:", e);
    } finally {
      isFetchingNotifications.current = false;
    }
  };

  const handleMarkNotificationsAsRead = async () => {
    if (!token) return;
    try {
      const res = await fetch('/api/notifications/read', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await safeJsonParse(res);
        if (data) {
          setNotifications(data.notifications || []);
          showToast("✓ All alerts marked as read!");
        }
      }
    } catch (e) {
      console.warn("Failed to mark notifications as read:", e);
    }
  };

  // High-frequency live polling loop for real-time social networking
  useEffect(() => {
    if (isEditMode) return; // Do NOT poll if actively editing
    const interval = setInterval(() => {
      fetchCreators();
      fetchFeed();
      refreshCurrentProfile();
      if (token) {
        fetchNotifications();
        fetchMessages(token);
      }
    }, 5000); // Poll every 5 seconds for dynamic live response with guards
    return () => clearInterval(interval);
  }, [token, viewingCreator?.id, isEditMode]);

  // Derived counts to keep profile statistics in sync securely
  useEffect(() => {
    if (isInitialized && !viewingCreator) {
      setProfile(prev => {
        const skillsCount = (prev?.skills || []).length;
        const postsCount = (prev?.posts || []).length;
        let changed = false;
        const updated = { ...prev };
        if (prev?.skillsCount !== skillsCount) {
          updated.skillsCount = skillsCount;
          changed = true;
        }
        if (prev?.postsCount !== postsCount) {
          updated.postsCount = postsCount;
          changed = true;
        }
        return changed ? updated : prev;
      });
    }
  }, [profile?.skills, profile?.posts, isInitialized, viewingCreator]);

  // Persist following list
  useEffect(() => {
    localStorage.setItem('secure_following_ids', JSON.stringify(followingIds));
  }, [followingIds]);

  const handleUpdateProfile = async (updatedFields: Partial<UserProfile>) => {
    if (isActingAsAnonymous) {
      if (updatedFields.avatarUrl !== undefined) {
        setAnonAvatarUrl(updatedFields.avatarUrl);
        localStorage.setItem('anon_profile_avatar', updatedFields.avatarUrl);
      }
      if (updatedFields.bio !== undefined) {
        setAnonBio(updatedFields.bio);
        localStorage.setItem('anon_profile_bio', updatedFields.bio);
      }
      if (updatedFields.name !== undefined) {
        setAnonName(updatedFields.name);
        localStorage.setItem('anon_profile_name', updatedFields.name);
      }
      showToast("🔒 Anonymous identity profile updated");
      return;
    }

    const nextProfile = { ...profile, ...updatedFields };
    setProfile(nextProfile);

    // Sync user name state if name is updated
    if (updatedFields.name && user) {
      setUser(prev => prev ? { ...prev, name: updatedFields.name! } : null);
    }

    if (token) {
      setIsSaving(true);
      try {
        const res = await fetch('/api/profile/update', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ profile: nextProfile })
        });
        if (!res.ok) {
          showToast("⚠️ Save failed to synchronize with server.");
        } else {
          if (updatedFields.name !== undefined || updatedFields.avatarUrl !== undefined) {
            fetchFeed();
            fetchCreators();
          }
        }
      } catch (e) {
        console.error("Update profile error:", e);
      } finally {
        setTimeout(() => setIsSaving(false), 500);
      }
    } else {
      // Local fallback
      localStorage.setItem('user_portfolio_profile', JSON.stringify(nextProfile));
    }
  };

  const handleUpdateSkills = (updatedSkills: string[]) => {
    handleUpdateProfile({ skills: updatedSkills });
  };

  const handleUpdatePosts = async (updatedPosts: any[]) => {
    // Merge updatedPosts with current profile.posts based on active profile identity
    // (anonymous posts vs real/authenticated posts)
    const currentPosts = profile.posts || [];
    const mergedPosts: any[] = [];
    
    currentPosts.forEach(p => {
      const isTouched = isActingAsAnonymous ? !!p.isAnonymous : !p.isAnonymous;
      if (isTouched) {
        const updated = updatedPosts.find(up => up.id === p.id);
        if (updated) {
          mergedPosts.push(updated);
        } // else it was deleted
      } else {
        mergedPosts.push(p);
      }
    });

    // Also handle any brand new posts
    updatedPosts.forEach(up => {
      if (!currentPosts.some(p => p.id === up.id)) {
        mergedPosts.unshift(up);
      }
    });

    const nextProfile = { ...profile, posts: mergedPosts };
    setProfile(nextProfile);

    // Optimistically update feedList immediately
    setFeedList(prev => {
      // 1. Filter out user's posts that are no longer present in mergedPosts
      const filtered = prev.filter(p => {
        const isOwn = (user && p.creator.id === user.id) || p.creator.id === 'me';
        if (isOwn) {
          return mergedPosts.some(up => up.id === p.id);
        }
        if (p.isAnonymous) {
          const isOwnAnon = p.anonymousCreatorId === (user?.id || 'me') || p.authorId === (user?.id || 'me');
          if (isOwnAnon) {
            return mergedPosts.some(up => up.id === p.id);
          }
        }
        return true;
      });
      // 2. Map existing or add new posts
      const result = [...filtered];
      mergedPosts.forEach(up => {
        const existingIdx = result.findIndex(p => p.id === up.id);
        if (existingIdx !== -1) {
          result[existingIdx] = {
            ...result[existingIdx],
            ...up
          };
        } else {
          result.unshift({
            ...up,
            comments: up.comments || [],
            creator: up.isAnonymous ? {
              id: up.anonymousCreatorId || 'anon-user-BD-99-9999',
              name: up.anonymousCreatorName || 'ANON BD 99 9999',
              username: 'anonymous',
              avatarUrl: '',
              tagline: 'Encrypted Identity',
              badgeNumber: 'ANON-99',
              isAnonymous: true
            } : {
              id: user?.id || 'me',
              name: user?.name || profile.name,
              avatarUrl: profile.avatarUrl || '',
              tagline: profile.tagline || 'Creative Designer',
              badgeNumber: profile.badgeNumber || 'BD-00'
            }
          });
        }
      });
      return result;
    });

    if (token) {
      setIsSaving(true);
      try {
        const res = await fetch('/api/posts/update', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ posts: mergedPosts })
        });
        if (!res.ok) {
          showToast("⚠️ Posts synchronization failed.");
        } else {
          await fetchFeed(); // Silently synchronize with server-side response
        }
      } catch (e) {
        console.error("Update posts error:", e);
      } finally {
        setIsSaving(false);
      }
    } else {
      try {
        localStorage.setItem('user_portfolio_profile', JSON.stringify(nextProfile));
      } catch (e) {
        console.warn("LocalStorage save warning (quota limit reached):", e);
        try {
          const sanitized = {
            ...nextProfile,
            posts: (nextProfile.posts || []).map((p: any) => ({
              ...p,
              imageUrl: (p.imageUrl && p.imageUrl.length > 100000) ? undefined : p.imageUrl,
              videoUrl: (p.videoUrl && p.videoUrl.length > 100000) ? undefined : p.videoUrl,
              audioUrl: (p.audioUrl && p.audioUrl.length > 100000) ? undefined : p.audioUrl,
            }))
          };
          localStorage.setItem('user_portfolio_profile', JSON.stringify(sanitized));
        } catch (err) {
          // Ignore safely
        }
      }
    }
  };

  const handleResetProfile = () => {
    if (viewingCreator) return;
    setProfile(DEFAULT_PROFILE);
    if (!token) {
      localStorage.setItem('user_portfolio_profile', JSON.stringify(DEFAULT_PROFILE));
    } else {
      handleUpdateProfile(DEFAULT_PROFILE);
    }
    showToast("Profile restored to default successfully!");
  };

  const handleScrollToFeed = () => {
    const element = document.getElementById('posts-showcase');
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      showToast("Navigated to Posts Feed");
    }
  };

  // AUTH API CALLS
  const handleSignUpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setAuthLoading(true);

    let countryCode: string | null = null;
    if (isLocationLockEnabled) {
      showToast("📍 Requesting region coordinates...");
      try {
        // Try multiple fallback lookup methods
        countryCode = await fetchDetectedCountryCode();

        if (!countryCode) {
          const manualCode = prompt("Could not automatically verify your region. Please enter your 2-letter Country Code (e.g., BD, US, GB, CA) to proceed with your Region-Locked ID:", "BD");
          if (manualCode && manualCode.trim()) {
            countryCode = manualCode.trim().toUpperCase();
          } else {
            countryCode = "BD";
          }
        }
      } catch (err: any) {
        setAuthError(err.message || "Failed to verify location.");
        setAuthLoading(false);
        return;
      }
    }

    try {
      const response = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: signupName, email: signupEmail, password: signupPassword, countryCode })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Signup failed');
      }

      // Display 12 recovery words
      setSignupWords(data.recoveryWords);
      setHasConfirmedWords(false);
      showToast(countryCode ? `✓ Region-Locked ID generated for ${countryCode}!` : "Unverified credentials generated!");
    } catch (err: any) {
      setAuthError(err.message);
    } finally {
      setAuthLoading(false);
    }
  };

  const fetchDetectedCountryCode = async (): Promise<string | null> => {
    // 1. Try Geolocation
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 4000 });
      });
      const { latitude, longitude } = pos.coords;
      const geoRes = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}`);
      if (geoRes.ok) {
        const geoData = await geoRes.json();
        if (geoData.countryCode) {
          return geoData.countryCode.toUpperCase();
        }
      }
    } catch (err) {
      console.log("Geolocation/bigdatacloud lookup failed", err);
    }

    // 2. Try ip-api.com
    try {
      const res = await fetch('https://ip-api.com/json');
      if (res.ok) {
        const data = await res.json();
        if (data.countryCode) {
          return data.countryCode.toUpperCase();
        }
      }
    } catch (err) {
      console.log("ip-api.com failed", err);
    }

    // 3. Try ipapi.co
    try {
      const res = await fetch('https://ipapi.co/json/');
      if (res.ok) {
        const data = await res.json();
        if (data.country_code) {
          return data.country_code.toUpperCase();
        }
      }
    } catch (err) {
      console.log("ipapi.co failed", err);
    }

    // 4. Try ipinfo.io
    try {
      const res = await fetch('https://ipinfo.io/json');
      if (res.ok) {
        const data = await res.json();
        if (data.country) {
          return data.country.toUpperCase();
        }
      }
    } catch (err) {
      console.log("ipinfo.io failed", err);
    }

    // 5. Try db-ip.com
    try {
      const res = await fetch('https://api.db-ip.com/v2/free/self');
      if (res.ok) {
        const data = await res.json();
        if (data.countryCode) {
          return data.countryCode.toUpperCase();
        }
      }
    } catch (err) {
      console.log("db-ip.com failed", err);
    }

    return null;
  };

  const handleVerifyLocationLater = async () => {
    if (!token) return;
    setLocationVerificationLoading(true);
    showToast("📍 Requesting region coordinates...");

    let countryCode: string | null = null;
    try {
      // Try multiple fallback lookup methods
      countryCode = await fetchDetectedCountryCode();

      if (!countryCode) {
        const manualCode = prompt("Could not automatically verify your region. Please enter your 2-letter Country Code (e.g., BD, US, GB, CA) to proceed with verification:", "BD");
        if (manualCode && manualCode.trim()) {
          countryCode = manualCode.trim().toUpperCase();
        } else {
          countryCode = "BD";
        }
      }

      const response = await fetch('/api/auth/verify-location', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ countryCode })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Verification failed');
      }

      // Update state
      if (user) {
        const updatedUser = {
          ...user,
          username: data.username,
          isLocationVerified: true,
          countryCode: countryCode,
          profile: data.profile
        };
        setUser(updatedUser);
        setProfile(data.profile);
      }
      showToast(`🎉 Location verified! Your Region-Locked ID is ${data.username}`);
      fetchCreators();
      fetchFeed();
    } catch (err: any) {
      showToast(`⚠️ ${err.message || 'Verification failed'}`);
    } finally {
      setLocationVerificationLoading(false);
    }
  };

  const completeSignUpFlow = async () => {
    if (!hasConfirmedWords) return;
    // Attempt automatic login after signup completion
    setAuthLoading(true);
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: signupEmail, password: signupPassword })
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Login failed after signup');
      }

      localStorage.setItem('secure_auth_token', data.token);
      setToken(data.token);
      setUser(data.user);
      setProfile(data.user.profile);
      setFollowingIds(data.user.following || []);
      setIsAuthOpen(false);
      setSignupWords(null);
      setSignupName('');
      setSignupEmail('');
      setSignupPassword('');
      setActiveView('feed');
      showToast("Secure workspace unlocked!");
      fetchCreators();
    } catch (err: any) {
      setAuthError(err.message);
      setAuthTab('login');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setAuthLoading(true);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: loginEmail, password: loginPassword })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Authentication failed');
      }

      // 2FA step: account has TOTP enabled — prompt for the authenticator code.
      if (data.twoFactorRequired) {
        setTwoFactorToken(data.twoFactorToken);
        setAuthError('');
        setAuthLoading(false);
        showToast("🔐 Enter your authenticator code to continue.");
        return;
      }

      localStorage.setItem('secure_auth_token', data.token);
      setToken(data.token);
      setUser(data.user);
      setProfile(data.user.profile);
      setFollowingIds(data.user.following || []);
      setIsAuthOpen(false);
      setLoginEmail('');
      setLoginPassword('');
      setTwoFactorToken(null);
      setTwoFactorCode('');
      setActiveView('feed');
      showToast("Identity verified! Welcome back.");
      fetchCreators();
    } catch (err: any) {
      setAuthError(err.message);
    } finally {
      setAuthLoading(false);
    }
  };

  // Complete a 2FA-protected login with the authenticator code.
  const handleTwoFactorSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!twoFactorToken) return;
    setAuthError('');
    setAuthLoading(true);
    try {
      const response = await fetch('/api/auth/login/2fa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ twoFactorToken, code: twoFactorCode.trim() })
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Invalid authentication code');
      }
      localStorage.setItem('secure_auth_token', data.token);
      setToken(data.token);
      setUser(data.user);
      setProfile(data.user.profile);
      setFollowingIds(data.user.following || []);
      setIsAuthOpen(false);
      setTwoFactorToken(null);
      setTwoFactorCode('');
      setLoginEmail('');
      setLoginPassword('');
      setActiveView('feed');
      showToast("Identity verified! Welcome back.");
      fetchCreators();
    } catch (err: any) {
      setAuthError(err.message);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    if (token) {
      try {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` }
        });
      } catch (e) {
        console.error(e);
      }
    }
    localStorage.removeItem('secure_auth_token');
    setToken(null);
    setUser(null);
    setProfile(DEFAULT_PROFILE);
    setViewingCreator(null);
    setFollowingIds([]);
    setIsEditMode(false);
    setTwoFactorToken(null);
    setTwoFactorCode('');
    showToast("Workspace locked.");
  };

  // ---- SECURITY & BADGES (2FA / encrypted backup) ----
  const fetch2FAStatus = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch('/api/2fa/status', { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        setTwoFactorEnabled(!!data.enabled);
        if (data.enabled) setTwoFactorStatus('idle');
      }
    } catch (e) {
      console.warn('Failed to fetch 2FA status:', e);
    }
  }, [token]);

  const start2FASetup = async () => {
    if (!token) return;
    try {
      const res = await fetch('/api/2fa/setup', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(`⚠️ ${data.error || 'Could not start 2FA setup'}`);
        return;
      }
      setTwoFactorSetup({ secret: data.secret, otpauthUrl: data.otpauthUrl, qrCodeDataUrl: data.qrCodeDataUrl });
      setTwoFactorStatus('setup');
      setTwoFactorCodeInput('');
      setRecoveryPhrase(generateRecoveryPhrase());
      showToast("🔐 Scan the QR code with your authenticator app.");
    } catch (e) {
      showToast("⚠️ Could not start 2FA setup.");
    }
  };

  const confirm2FA = async () => {
    if (!token) return;
    try {
      const res = await fetch('/api/2fa/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ code: twoFactorCodeInput.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(`⚠️ ${data.error || 'Invalid code'}`);
        return;
      }
      setTwoFactorEnabled(true);
      setTwoFactorStatus('idle');
      setTwoFactorSetup(null);
      setTwoFactorCodeInput('');
      setRecoveryPhrase(null);
      showToast("✅ Two-factor authentication enabled!");
    } catch (e) {
      showToast("⚠️ Verification failed.");
    }
  };

  const disable2FA = async () => {
    if (!token) return;
    const code = prompt('Enter your current authenticator code to disable 2FA:');
    if (!code) return;
    try {
      const res = await fetch('/api/2fa/disable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ code: code.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(`⚠️ ${data.error || 'Invalid code'}`);
        return;
      }
      setTwoFactorEnabled(false);
      setTwoFactorStatus('idle');
      showToast("Two-factor authentication disabled.");
    } catch (e) {
      showToast("⚠️ Could not disable 2FA.");
    }
  };

  const exportBackup = async () => {
    if (!backupPassphrase || backupPassphrase.length < 8) {
      setBackupMsg('Use a passphrase of at least 8 characters.');
      return;
    }
    try {
      const payload = {
        exportedAt: new Date().toISOString(),
        profile,
        followingIds,
        posts: feedList.slice(0, 200),
      };
      const blob = await encryptBackup(payload, backupPassphrase);
      const file = new Blob([blob], { type: 'application/json' });
      const url = URL.createObjectURL(file);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ocean-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      setBackupMsg('Encrypted backup downloaded. Keep your passphrase safe!');
    } catch (e) {
      console.error(e);
      setBackupMsg('Failed to create backup.');
    }
  };

  const importBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const passphrase = prompt('Enter the passphrase used to encrypt this backup:');
    if (!passphrase) return;
    try {
      const text = await file.text();
      const data = await decryptBackup(text, passphrase) as any;
      if (data?.profile) {
        setProfile(data.profile);
        setBackupMsg('Backup restored! Profile updated from backup.');
        showToast("📦 Backup restored successfully!");
      } else {
        setBackupMsg('Backup loaded, but no profile was found inside.');
      }
    } catch (err) {
      console.error(err);
      setBackupMsg('Failed to decrypt backup — wrong passphrase or corrupted file.');
    } finally {
      e.target.value = '';
    }
  };

  const handleResetRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setAuthLoading(true);

    try {
      const response = await fetch('/api/auth/reset-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: resetEmail })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Recovery request failed');
      }

      setResetToken(data.resetToken);
      setResetPositions(data.positions);
      setResetAnswers({});
      setResetNewPassword('');
      setAuthTab('reset-verify');
      showToast("Required positions retrieved!");
    } catch (err: any) {
      setAuthError(err.message);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleResetConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setAuthLoading(true);

    try {
      const response = await fetch('/api/auth/reset-confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resetToken,
          answers: resetAnswers,
          newPassword: resetNewPassword
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Reset confirmation failed');
      }

      setAuthTab('login');
      setLoginEmail(resetEmail);
      setResetEmail('');
      showToast("Password reset successfully! Please login.");
    } catch (err: any) {
      setAuthError(err.message);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleViewRecoveryWordsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setViewWordsError('');
    setViewWordsLoading(true);

    try {
      const response = await fetch('/api/auth/view-words', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ password: viewWordsPassword })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to decrypt recovery words.');
      }

      setViewWordsResult(data.words);
      setViewWordsPassword('');
      showToast("Recovery words decrypted successfully!");
    } catch (err: any) {
      setViewWordsError(err.message);
    } finally {
      setViewWordsLoading(false);
    }
  };

  // SEND MESSAGE HANDLER
  const handleSendMessage = async (senderName: string, text: string) => {
    const receiverId = viewingCreator ? viewingCreator.id : (user ? user.id : 'alex-rivera-id');
    try {
      const response = await fetch('/api/messages/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ senderName, receiverId, text })
      });

      if (response.ok) {
        showToast("Direct note delivered to creator.");
        // If sending to ourselves, update local list instantly
        if (token && receiverId === user?.id) {
          fetchMessages(token);
        }
      } else {
        showToast("⚠️ Could not deliver message.");
      }
    } catch (e) {
      console.error(e);
      showToast("⚠️ Connection error.");
    }
  };

  // SHARE POST TO FRIEND IN DM CHAT
  const [sharingToFriendId, setSharingToFriendId] = useState<string | null>(null);

  const handleSharePostToFriend = async (post: any, friendId: string) => {
    if (!token) {
      showToast("🔒 Please log in to share posts with friends.");
      return;
    }
    setSharingToFriendId(friendId);
    try {
      // 1. Create or retrieve conversation with the friend
      const convRes = await fetch('/api/chat/conversations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          isGroup: false,
          participantIds: [friendId]
        })
      });

      if (!convRes.ok) {
        const errorData = await convRes.json();
        showToast(`⚠️ Failed to start chat: ${errorData.error || 'Unknown error'}`);
        return;
      }

      const convData = await convRes.json();
      const activeConvId = convData.conversation.id;

      // 2. Send the message to the conversation
      const postUrl = `${window.location.origin}/#post-${post.id}`;
      const msgText = `Check out this post: "${post.title || post.content?.slice(0, 40) + '...'}"\n\n${postUrl}`;

      const msgRes = await fetch(`/api/chat/conversations/${activeConvId}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          text: msgText
        })
      });

      if (msgRes.ok) {
        showToast("💬 Post shared to friend's chat!");
      } else {
        showToast("⚠️ Failed to deliver message to chat.");
      }
    } catch (err) {
      console.error(err);
      showToast("⚠️ Error sharing to chat.");
    } finally {
      setSharingToFriendId(null);
    }
  };

  // Load specific creator profile card
  const loadCreatorProfile = async (creatorId: string) => {
    try {
      const determId = user ? getDeterministicAnon(user.id, user.countryCode).id : '';
      if (user && (creatorId === user.id || creatorId === determId)) {
        setViewingCreator(null);
        setIsEditMode(false);
        setIsExploreOpen(false);
        setActiveView('workspace');
        showToast("Welcome to your workspace");
        return;
      }
      const headers: Record<string, string> = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      const res = await fetch(`/api/creators/${creatorId}`, { headers });
      if (res.ok) {
        const data = await res.json();
        setViewingCreator({ 
          id: data.id, 
          name: data.name, 
          profile: data.profile, 
          following: data.following || [],
          friends: data.friends || [],
          friendsListRestricted: data.friendsListRestricted
        });
        setIsEditMode(false);
        setIsExploreOpen(false);
        setActiveView('workspace');
        showToast(`Viewing ${data.name}'s Profile`);
      }
    } catch (e) {
      console.error(e);
      showToast("⚠️ Error loading profile card.");
    }
  };

  const handleCloseCreatorView = () => {
    setViewingCreator(null);
    showToast("Returned to own workspace");
  };

  if (!isInitialized) {
    return (
      <div className="min-h-screen bg-[#f4f1ea] flex items-center justify-center font-mono text-sm text-[#8a8172]">
        <div className="flex flex-col items-center gap-2">
          <div className="w-6 h-6 border-2 border-[#8a8172] border-t-transparent rounded-full animate-spin"></div>
          <span>Unlocking Secure Workspace Environment...</span>
        </div>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="min-h-screen bg-[#f4f1ea] bg-dots flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8 font-sans selection:bg-[#ebdcca] selection:text-[#3a342a] text-[#3a342a]">
        <div className="max-w-md w-full space-y-6 bg-[#fcfaf4] border border-[#ebdcca] rounded-3xl p-6 md:p-8 shadow-2xl">
          {/* Header */}
          <div className="flex flex-col items-center text-center space-y-2 border-b border-[#ebdcca] pb-5">
            <div className="w-12 h-12 bg-[#ebdcca] rounded-full flex items-center justify-center text-[#3a342a] mb-2 shadow-xs">
              <Shield size={24} className="text-[#3a342a]" />
            </div>
            <h2 className="font-display font-black text-xl tracking-tight text-[#3a342a] uppercase">
              {signupWords ? "Backup Words" : "MYSOCIAL"}
            </h2>
            <p className="text-xs text-[#8a8172] font-mono uppercase tracking-wider">
              {signupWords ? "CRITICAL STORAGE DIRECTIVE" : "Identity Verification Required"}
            </p>
          </div>

          {/* ERROR STATE CARD */}
          {authError && (
            <div className="bg-rose-50 border border-rose-200 text-rose-800 p-3.5 rounded-2xl text-xs flex gap-2.5">
              <Check className="text-rose-600 rotate-45 shrink-0 mt-0.5" size={14} />
              <div className="space-y-0.5 text-left">
                <p className="font-bold font-mono text-[9px] uppercase tracking-wider text-rose-700">Security Access Alert</p>
                <p className="leading-relaxed font-sans">{authError}</p>
              </div>
            </div>
          )}

          {/* SIGNUP DEK GENERATION WORDS DISPLAY */}
          {signupWords ? (
            <div className="space-y-5 text-left">
              <div className="bg-amber-50/80 border border-amber-200 p-4 rounded-2xl text-xs text-amber-900 space-y-2">
                <p className="font-bold font-mono text-[9px] uppercase tracking-wider text-amber-800">
                  ⚠️ CRITICAL STORAGE DIRECTIVE
                </p>
                <p className="leading-relaxed">
                  Screenshot this or write it down. You will need specific words from this list to reset your password or view them again. We cannot recover these for you.
                </p>
              </div>

              {/* 12 WORDS GRID */}
              <div className="grid grid-cols-3 gap-2.5 bg-[#f5f2eb] p-4 rounded-2xl border border-[#ebdcca]">
                {signupWords.map((word, idx) => (
                  <div key={idx} className="bg-white border border-[#ebdcca] rounded-xl py-2 px-2.5 flex items-center gap-1.5 font-mono text-[11px]">
                    <span className="text-[#8a8172] font-bold text-[9px] w-4 text-right">{idx + 1}.</span>
                    <span className="text-[#3a342a] font-bold">{word}</span>
                  </div>
                ))}
              </div>

              {/* MANDATORY CHECKBOX */}
              <label className="flex items-start gap-2.5 p-1 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={hasConfirmedWords}
                  onChange={(e) => setHasConfirmedWords(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 text-amber-900 focus:ring-amber-800"
                />
                <span className="text-[11px] text-[#5c5446] leading-relaxed font-medium">
                  I have saved my words securely. I understand that if I lose them, I will lose access to my recovery keys permanently.
                </span>
              </label>

              {/* CONTINUE BUTTON */}
              <button
                onClick={completeSignUpFlow}
                disabled={!hasConfirmedWords || authLoading}
                className={`w-full font-mono text-[10px] uppercase font-bold py-2.5 rounded-xl shadow-xs transition-colors flex items-center justify-center gap-1.5 ${
                  hasConfirmedWords && !authLoading
                    ? 'bg-[#3a342a] hover:bg-[#52493b] text-[#f4f1ea]'
                    : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                }`}
              >
                {authLoading ? (
                  <div className="w-3.5 h-3.5 border-2 border-[#f4f1ea] border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  <Check size={12} />
                )}
                Enter Workspace
              </button>
            </div>
          ) : (
            <>
              {/* TABS */}
              {!twoFactorToken && (authTab === 'login' || authTab === 'signup') && (
                <div className="bg-[#ebdcca]/40 border border-[#ebdcca]/60 p-1 rounded-xl grid grid-cols-2 text-center h-9 items-center">
                  <button
                    onClick={() => { setAuthTab('login'); setAuthError(''); }}
                    className={`text-[10px] font-mono uppercase font-bold py-1 rounded-lg transition-all ${
                      authTab === 'login' ? 'bg-[#3a342a] text-[#f4f1ea] shadow-xs' : 'text-[#8a8172] hover:text-[#3a342a]'
                    }`}
                  >
                    Unlock Space
                  </button>
                  <button
                    onClick={() => { setAuthTab('signup'); setAuthError(''); }}
                    className={`text-[10px] font-mono uppercase font-bold py-1 rounded-lg transition-all ${
                      authTab === 'signup' ? 'bg-[#3a342a] text-[#f4f1ea] shadow-xs' : 'text-[#8a8172] hover:text-[#3a342a]'
                    }`}
                  >
                    Register
                  </button>
                </div>
              )}

              {/* 1b. 2FA CODE FORM (shown when the account has TOTP enabled) */}
              {authTab === 'login' && twoFactorToken && (
                <form onSubmit={handleTwoFactorSubmit} className="space-y-4 text-left">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">🔐</span>
                    <div>
                      <div className="text-sm font-bold text-[#3a342a]">Two-Factor Verification</div>
                      <div className="text-[10px] font-mono text-[#8a8172]">Enter the 6-digit code from your authenticator app</div>
                    </div>
                  </div>
                  <input
                    type="text"
                    inputMode="numeric"
                    autoFocus
                    maxLength={6}
                    value={twoFactorCode}
                    onChange={(e) => setTwoFactorCode(e.target.value.replace(/[^0-9]/g, ''))}
                    placeholder="000000"
                    className="w-full bg-white border border-[#cfcac0] rounded-xl px-3 py-2.5 font-mono text-center text-lg tracking-[0.5em] text-[#3a342a] placeholder:text-[#cfcac0] focus:border-[#8a8172] outline-none"
                  />
                  <button
                    type="submit"
                    disabled={authLoading || twoFactorCode.length !== 6}
                    className="w-full py-2.5 rounded-xl bg-[#3a342a] text-[#f4f1ea] text-xs font-mono uppercase tracking-wider font-bold hover:bg-[#52493b] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {authLoading ? 'Verifying…' : 'Verify & Unlock'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setTwoFactorToken(null); setTwoFactorCode(''); setAuthError(''); }}
                    className="w-full text-center text-[10px] font-mono uppercase tracking-wider text-[#8a8172] hover:text-[#3a342a]"
                  >
                    ← Back to password
                  </button>
                </form>
              )}

              {/* 1. LOGIN FORM */}
              {authTab === 'login' && !twoFactorToken && (
                <form onSubmit={handleLoginSubmit} className="space-y-4 text-left">
                  <div className="space-y-1.5">
                    <label className="block text-[9px] font-mono text-[#8a8172] uppercase tracking-wider font-bold">Email Address</label>
                    <input
                      type="email"
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      placeholder="Enter email"
                      className="w-full bg-white border border-[#cfcac0] rounded-xl px-3 py-2 font-sans text-xs text-[#5c5446] focus:outline-none focus:ring-1 focus:ring-[#8a8172]"
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-[9px] font-mono text-[#8a8172] uppercase tracking-wider font-bold">Password</label>
                    <input
                      type="password"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      placeholder="••••••••••••"
                      className="w-full bg-white border border-[#cfcac0] rounded-xl px-3 py-2 font-sans text-xs text-[#5c5446] focus:outline-none focus:ring-1 focus:ring-[#8a8172]"
                      required
                    />
                  </div>

                  <div className="text-right">
                    <button
                      type="button"
                      onClick={() => { setAuthTab('reset-request'); setAuthError(''); }}
                      className="font-mono text-[9px] text-[#8a8172] hover:text-[#3a342a] uppercase font-bold"
                    >
                      Forgot Password?
                    </button>
                  </div>

                  <button
                    type="submit"
                    disabled={authLoading}
                    className="w-full font-mono text-[10px] uppercase font-bold text-[#f4f1ea] bg-[#3a342a] hover:bg-[#52493b] py-2.5 rounded-xl shadow-xs transition-colors flex items-center justify-center gap-1.5"
                  >
                    {authLoading ? (
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    ) : (
                      <Unlock size={12} />
                    )}
                    Unlock Workspace
                  </button>
                </form>
              )}

              {/* 2. SIGN UP FORM */}
              {authTab === 'signup' && (
                <form onSubmit={handleSignUpSubmit} className="space-y-4 text-left">
                  <div className="space-y-1.5">
                    <label className="block text-[9px] font-mono text-[#8a8172] uppercase tracking-wider font-bold">Full Name</label>
                    <input
                      type="text"
                      value={signupName}
                      onChange={(e) => setSignupName(e.target.value)}
                      placeholder="Enter full name"
                      className="w-full bg-white border border-[#cfcac0] rounded-xl px-3 py-2 font-sans text-xs text-[#5c5446] focus:outline-none focus:ring-1 focus:ring-[#8a8172]"
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-[9px] font-mono text-[#8a8172] uppercase tracking-wider font-bold">Email Address</label>
                    <input
                      type="email"
                      value={signupEmail}
                      onChange={(e) => setSignupEmail(e.target.value)}
                      placeholder="Enter email"
                      className="w-full bg-white border border-[#cfcac0] rounded-xl px-3 py-2 font-sans text-xs text-[#5c5446] focus:outline-none focus:ring-1 focus:ring-[#8a8172]"
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-[9px] font-mono text-[#8a8172] uppercase tracking-wider font-bold">Master Password</label>
                    <input
                      type="password"
                      value={signupPassword}
                      onChange={(e) => setSignupPassword(e.target.value)}
                      placeholder="Min 6 characters recommended"
                      className="w-full bg-white border border-[#cfcac0] rounded-xl px-3 py-2 font-sans text-xs text-[#5c5446] focus:outline-none focus:ring-1 focus:ring-[#8a8172]"
                      required
                    />
                  </div>

                  <div className="bg-[#f0ede6] border border-[#ebdcca] rounded-xl p-3.5 space-y-2">
                    <div className="flex items-start gap-2.5">
                      <input
                        type="checkbox"
                        id="location-lock-toggle"
                        checked={isLocationLockEnabled}
                        onChange={(e) => setIsLocationLockEnabled(e.target.checked)}
                        className="mt-0.5 rounded text-amber-800 focus:ring-amber-500 cursor-pointer h-3.5 w-3.5"
                      />
                      <label htmlFor="location-lock-toggle" className="text-[10px] font-mono text-[#3a342a] uppercase font-bold tracking-wide select-none cursor-pointer">
                        Secure Region-Locked ID (Recommended)
                      </label>
                    </div>
                    <p className="text-[10px] text-[#8a8172] font-sans leading-relaxed pl-6">
                      {isLocationLockEnabled ? (
                        "✓ Uses your location or IP address to generate a cryptographically secure, region-locked username starting with your country code (e.g., BD-XX-XXX-XXXX-XX)."
                      ) : (
                        "⚠️ Denying region lock. Your account will be created, but you will not have an official username or be mentionable until verified."
                      )}
                    </p>
                  </div>

                  <button
                    type="submit"
                    disabled={authLoading}
                    className="w-full font-mono text-[10px] uppercase font-bold text-[#f4f1ea] bg-[#3a342a] hover:bg-[#52493b] py-2.5 rounded-xl shadow-xs transition-colors flex items-center justify-center gap-1.5"
                  >
                    {authLoading ? (
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    ) : (
                      <UserPlus size={12} />
                    )}
                    Generate Secure Credentials
                  </button>
                </form>
              )}

              {/* 3. FORGOT PASSWORD / REQUEST RESET FORM */}
              {authTab === 'reset-request' && (
                <form onSubmit={handleResetRequest} className="space-y-4 text-left">
                  <p className="text-xs text-[#5c5446] leading-relaxed">
                    Specify your workspace email. The envelope crypto gatekeeper will challenge you to input 4 specific positions from your 12 recovery words list.
                  </p>
                  
                  <div className="space-y-1.5">
                    <label className="block text-[9px] font-mono text-[#8a8172] uppercase tracking-wider font-bold">Workspace Email</label>
                    <input
                      type="email"
                      value={resetEmail}
                      onChange={(e) => setResetEmail(e.target.value)}
                      placeholder="Enter email"
                      className="w-full bg-white border border-[#cfcac0] rounded-xl px-3 py-2 font-sans text-xs text-[#5c5446] focus:outline-none focus:ring-1 focus:ring-[#8a8172]"
                      required
                    />
                  </div>

                  <div className="flex gap-2.5">
                    <button
                      type="button"
                      onClick={() => setAuthTab('login')}
                      className="w-1/2 font-mono text-[10px] uppercase font-bold text-[#3a342a] bg-transparent border border-[#cfcac0] hover:bg-[#ebdcca]/20 py-2.5 rounded-xl transition-all"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={authLoading}
                      className="w-1/2 font-mono text-[10px] uppercase font-bold text-[#f4f1ea] bg-[#3a342a] hover:bg-[#52493b] py-2.5 rounded-xl shadow-xs transition-colors flex items-center justify-center gap-1.5"
                    >
                      {authLoading ? (
                        <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      ) : (
                        <Compass size={12} />
                      )}
                      Query Positions
                    </button>
                  </div>
                </form>
              )}

              {/* 4. VERIFY RECOVERY WORDS RESET ACTION */}
              {authTab === 'reset-verify' && (
                <form onSubmit={handleResetConfirm} className="space-y-4 text-left">
                  <div className="bg-amber-50/70 border border-amber-200 text-amber-900 p-3 rounded-2xl text-[11px] leading-relaxed">
                    🔒 Authenticate your recovery ownership by writing exact, case-insensitive words matching the positions queried below.
                  </div>

                  <div className="space-y-3">
                    {resetPositions.map((pos) => (
                      <div key={pos} className="flex items-center gap-3 bg-[#fdfbf7] border border-[#ebdcca] p-2.5 rounded-xl">
                        <span className="font-mono text-[11px] font-bold text-[#8a8172] w-20 shrink-0">
                          Word #{pos}:
                        </span>
                        <input
                          type="text"
                          value={resetAnswers[pos] || ''}
                          onChange={(e) => setResetAnswers({ ...resetAnswers, [pos]: e.target.value })}
                          placeholder={`Word at position ${pos}...`}
                          className="w-full bg-white border border-[#cfcac0] rounded-lg px-2.5 py-1 font-sans text-xs text-[#5c5446] focus:outline-none focus:ring-1 focus:ring-[#8a8172]"
                          required
                          autoComplete="off"
                          autoCorrect="off"
                          autoCapitalize="off"
                          spellCheck="false"
                        />
                      </div>
                    ))}
                  </div>

                  <div className="space-y-1.5 pt-2 border-t border-[#ebdcca]/60">
                    <label className="block text-[9px] font-mono text-[#8a8172] uppercase tracking-wider font-bold">New Master Password</label>
                    <input
                      type="password"
                      value={resetNewPassword}
                      onChange={(e) => setResetNewPassword(e.target.value)}
                      placeholder="Enter your new password"
                      className="w-full bg-white border border-[#cfcac0] rounded-xl px-3 py-2 font-sans text-xs text-[#5c5446] focus:outline-none focus:ring-1 focus:ring-[#8a8172]"
                      required
                    />
                  </div>

                  <div className="flex gap-2.5">
                    <button
                      type="button"
                      onClick={() => setAuthTab('reset-request')}
                      className="w-1/2 font-mono text-[10px] uppercase font-bold text-[#3a342a] bg-transparent border border-[#cfcac0] hover:bg-[#ebdcca]/20 py-2.5 rounded-xl transition-all"
                    >
                      Back
                    </button>
                    <button
                      type="submit"
                      disabled={authLoading}
                      className="w-1/2 font-mono text-[10px] uppercase font-bold text-[#f4f1ea] bg-[#3a342a] hover:bg-[#52493b] py-2.5 rounded-xl shadow-xs transition-colors flex items-center justify-center gap-1.5"
                    >
                      {authLoading ? (
                        <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      ) : (
                        <Check size={12} />
                      )}
                      Set New Key
                    </button>
                  </div>
                </form>
              )}
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <CallEngineProvider
      user={user ? { id: user.id, name: user.name || 'User', avatarUrl: user.profile?.avatarUrl } : null}
      token={token}
    >
    <div className={`min-h-screen bg-[#f4f1ea] ${activeView === 'workspace' ? 'bg-dots p-0' : 'py-6 px-0 md:py-12 md:px-0'} selection:bg-[#ebdcca] selection:text-[#3a342a] text-[#3a342a] font-sans smooth-transition pb-24`}>
      
      {/* HEADER SECTION WITH MODE TOGGLER */}
      {activeView === 'workspace' && (
        <header className="max-w-full px-4 md:px-8 mx-auto mb-8 flex flex-col sm:flex-row items-center justify-end gap-4 border-b border-[#ebdcca]/50 pt-6 pb-5">
          <div className="flex flex-wrap items-center justify-center gap-3">
            {/* Theme Toggle Button */}
            <motion.button
              onClick={toggleDarkMode}
              whileTap={{ scale: 0.95 }}
              className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-[#ebdcca]/50 text-[#3a342a] hover:bg-[#ebdcca] transition-colors border border-[#cfcac0]"
              title={isDarkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
            >
              <AnimatePresence mode="wait">
                {isDarkMode ? (
                  <motion.div key="moon" initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }} transition={{ duration: 0.2 }}>
                    <Moon size={14} />
                  </motion.div>
                ) : (
                  <motion.div key="sun" initial={{ rotate: 90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: -90, opacity: 0 }} transition={{ duration: 0.2 }}>
                    <Sun size={14} />
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.button>

            {/* Authentic action button */}
            {token && !viewingCreator ? (
              <button
                onClick={() => { setIsSettingsOpen(true); fetch2FAStatus(); }}
                className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase font-bold text-[#f4f1ea] bg-[#3a342a] hover:bg-[#52493b] py-2 px-3 rounded-2xl shadow-xs transition-colors"
                title="Workspace Settings"
              >
                <Settings size={12} />
                Settings
              </button>
            ) : !token && !viewingCreator ? (
              <button
                onClick={() => { setAuthTab('login'); setIsAuthOpen(true); }}
                className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase font-bold text-[#f4f1ea] bg-[#3a342a] hover:bg-[#52493b] py-2 px-3 rounded-2xl shadow-xs transition-colors"
              >
                <Unlock size={12} />
                Unlock Space
              </button>
            ) : null}

            {/* PREVIEW/EDIT SLIDER */}
            {!viewingCreator && (
              <div className="relative bg-[#ebdcca]/50 border border-[#cfcac0] p-1 rounded-full flex items-center select-none w-48 h-10">
                <motion.div
                  layout
                  transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                  className="absolute top-1 bottom-1 bg-[#2e2920] rounded-full shadow-[0_1px_3px_rgba(0,0,0,0.1)]"
                  style={{
                    left: isEditMode && !viewingCreator ? 'calc(50% - 2px)' : '4px',
                    right: isEditMode && !viewingCreator ? '4px' : 'calc(50% - 2px)'
                  }}
                />

                <button
                  onClick={() => setIsEditMode(false)}
                  className={`relative z-10 w-1/2 text-center text-[10px] font-mono font-bold uppercase transition-colors duration-200 py-1.5 flex items-center justify-center gap-1 ${
                    (!isEditMode || viewingCreator) ? 'text-[#f4f1ea]' : 'text-[#8a8172] hover:text-[#3a342a]'
                  }`}
                >
                  <Eye size={12} />
                  Preview
                </button>

                <button
                  onClick={() => {
                    if (viewingCreator) {
                      showToast("⚠️ Return to your own workspace to edit.");
                      return;
                    }
                    if (!token) {
                      showToast("🔒 Please Unlock Space to enable custom editing.");
                      setAuthTab('login');
                      setIsAuthOpen(true);
                      return;
                    }
                    setIsEditMode(true);
                  }}
                  className={`relative z-10 w-1/2 text-center text-[10px] font-mono font-bold uppercase transition-colors duration-200 py-1.5 flex items-center justify-center gap-1 ${
                    (isEditMode && !viewingCreator) ? 'text-[#f4f1ea]' : 'text-[#8a8172] hover:text-[#3a342a]'
                  }`}
                >
                  <Edit size={12} />
                  Edit
                </button>
              </div>
            )}
          </div>
        </header>
      )}



      {token && user && !user.isLocationVerified && (
        <div className="max-w-3xl mx-auto mb-6 bg-amber-50 border border-amber-200 rounded-3xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-amber-900 shadow-sm">
          <div className="flex items-start gap-3">
            <Shield className="text-amber-800 shrink-0 mt-0.5" size={16} />
            <div>
              <p className="font-mono text-[9px] uppercase font-bold text-amber-800 tracking-wider">📍 REGION UNVERIFIED</p>
              <p className="font-sans font-medium text-[11px] leading-relaxed">
                You do not have an official Region-Locked ID (username) yet. Mentions, chat features, and custom group participation are restricted until your region is verified.
              </p>
            </div>
          </div>
          <button
            onClick={handleVerifyLocationLater}
            disabled={locationVerificationLoading}
            className="shrink-0 inline-flex items-center gap-1.5 font-mono text-[9px] uppercase font-bold py-2 px-3.5 rounded-xl bg-amber-900 text-white hover:bg-amber-950 transition-all shadow-xs"
          >
            {locationVerificationLoading ? (
              <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            ) : (
              "Verify Region Now"
            )}
          </button>
        </div>
      )}

      {/* MAIN WORKSPACE WRAPPER */}
      <main className={`${activeView === 'chat' ? 'max-w-[1400px] px-0 sm:px-2' : activeView === 'workspace' ? 'max-w-full px-0' : 'max-w-full px-0 sm:max-w-3xl sm:px-0'} mx-auto space-y-8`}>
        {activeView === 'chat' ? (
          <div className="w-full bg-[#0b0a0e] dark:bg-[#000000] border border-stone-800 rounded-3xl p-1 md:p-2 shadow-2xl min-h-[720px] flex flex-col">
            <ChatModal
              token={token || 'guest'}
              currentUser={{
                id: user?.id || 'guest',
                name: profile?.name || 'Guest User',
                username: profile?.username || 'guest',
                isLocationVerified: profile?.isLocationVerified || false,
                profile: {
                  avatarUrl: profile?.avatarUrl,
                  username: profile?.username
                }
              }}
              friends={friends}
              isInline={true}
              initialActiveUserId={initialActiveChatUserId}
              onClearInitialActiveUserId={() => setInitialActiveChatUserId(null)}
            />
          </div>
        ) : activeView === 'feed' ? (
          /* LIVE COMBINED FEED VIEW */
          <div 
            className="space-y-6"
            
            
          >

            {/* Mood Feed Filter chips (port from base44: Learn/Laugh/Relax/Discover) */}
            {feedSubTab === 'feed' && (
              <div className="flex flex-wrap items-center gap-1.5 px-1">
                {(['All', 'Learn', 'Laugh', 'Relax', 'Discover'] as const).map((mood) => (
                  <button
                    key={mood}
                    onClick={() => {
                      setFeedMood(mood);
                      showToast(mood === 'All' ? '🌊 Showing the full ocean of posts' : `${mood === 'Learn' ? '📚' : mood === 'Laugh' ? '😂' : mood === 'Relax' ? '🌿' : '🧭'} ${mood} mood feed`);
                    }}
                    className={`px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-wider font-mono transition-all cursor-pointer border ${
                      feedMood === mood
                        ? 'bg-[#3a342a] text-[#f4f1ea] border-[#3a342a] shadow-md scale-105'
                        : 'bg-white/70 text-[#8a8172] border-[#ebdcca] hover:border-[#8a8172] hover:text-[#3a342a]'
                    }`}
                    title={mood === 'All' ? 'Show all posts' : `Filter to ${mood.toLowerCase()} content`}
                  >
                    {mood === 'All' ? '🌊 All' : mood === 'Learn' ? '📚 Learn' : mood === 'Laugh' ? '😂 Laugh' : mood === 'Relax' ? '🌿 Relax' : '🧭 Discover'}
                  </button>
                ))}
              </div>
            )}

            {/* Conditional Sub-Feed Renderers */}
            {feedSubTab === 'feed' ? (
              /* Continuous live feed items */
              <motion.div
                variants={{
                  hidden: { opacity: 0 },
                  show: {
                    opacity: 1,
                    transition: {
                      staggerChildren: 0.08
                    }
                  }
                }}
                initial="hidden"
                animate="show"
                className="space-y-6"
              >
                {(() => {
                const filteredFeed = feedList.filter(post => {
                  if (hiddenPostIds.includes(post.id)) return false;
                  if (!matchesMood(post, feedMood)) return false;
                  if (!feedSearchQuery) return true;
                  const query = feedSearchQuery.toLowerCase().trim();
                  const content = (post.content || '').toLowerCase();
                  const title = (post.title || '').toLowerCase();
                  const creatorName = (post.creator?.name || '').toLowerCase();
                  return content.includes(query) || title.includes(query) || creatorName.includes(query);
                });

                const rankedFeed = hybridRankItems(
                  filteredFeed,
                  rankCtx,
                  'post'
                ) as unknown as Post[];

                if (rankedFeed.length === 0) {
                  return (
                    <div className="text-center py-12 bg-[#fdfbf7] border border-dashed border-[#ebdcca] rounded-3xl">
                      <p className="text-xs text-[#8a8172] font-mono uppercase">
                        {feedSearchQuery ? "No matching publications" : "Quiet times on the network..."}
                      </p>
                      <p className="text-[11px] text-[#8a8172] mt-1 font-sans">
                        {feedSearchQuery ? "Try searching for another keyword, tag, or author." : "Be the first to share an update by signing up and posting!"}
                      </p>
                    </div>
                  );
                }

                return rankedFeed.map((post) => {
                  const deterId = user ? getDeterministicAnon(user.id, user.countryCode).id : '';
                  const isPostAnon = !!post.isAnonymous;
                  const ownsThisPost = user && (
                    (!isPostAnon && post.creator?.id === user.id) ||
                    (isPostAnon && post.creator?.id === deterId)
                  );
                  const isOwnPost = ownsThisPost && (
                    (isActingAsAnonymous && isPostAnon) ||
                    (!isActingAsAnonymous && !isPostAnon)
                  );
                  const dynamicCreator = (!isPostAnon && user && post.creator?.id === user.id) ? {
                    ...post.creator,
                    name: profile.name,
                    avatarUrl: profile.avatarUrl || ''
                  } : post.creator;
                  if (post.isNeedPost) {
                    const secureToken = localStorage.getItem('secure_auth_token');
                    return (
                      <motion.div
                        layoutId={post.id}
                        key={post.id}
                        variants={{
                          hidden: { opacity: 0, y: 35, scale: 0.95 },
                          show: { opacity: 1, y: 0, scale: 1 }
                        }}
                        viewport={{ once: true, amount: 0.05 }}
                        exit={{ opacity: 0, y: -20, scale: 0.9 }}
                        transition={{ type: 'spring', stiffness: 140, damping: 15, mass: 0.8 }}
                      >
                        <NeedPostPortal
                          post={{
                            ...post,
                            creator: dynamicCreator || post.creator
                          }}
                          isOwnPost={isOwnPost}
                          currentUser={user}
                          token={secureToken}
                          onRefresh={async () => {
                            await fetchFeed();
                          }}
                          onDelete={isOwnPost ? () => handleDeleteFeedPost(post.id) : undefined}
                          showToast={(msg) => {
                            showToast(msg);
                          }}
                        />
                      </motion.div>
                    );
                  }

                  const isCapsuleLocked = post.isTimeCapsule && post.unlockDate && (new Date(post.unlockDate).getTime() > Date.now());

                  return (
                    <motion.div
                      layoutId={post.id}
                      key={post.id}
                      variants={{
                        hidden: { opacity: 0, y: 35, scale: 0.95 },
                        show: { opacity: 1, y: 0, scale: 1 }
                      }}
                      viewport={{ once: true, amount: 0.05 }}
                      exit={{ opacity: 0, y: -20, scale: 0.9 }}
                      transition={{ type: 'spring', stiffness: 140, damping: 15, mass: 0.8 }}
                      className={`post-card border rounded-xl overflow-hidden shadow-xs hover:border-[#cfcac0]/60 transition-colors cursor-pointer group ${
                        (post.isTimeCapsule && !isCapsuleLocked)
                          ? 'bg-emerald-50/20 border-emerald-600/30 hover:border-emerald-500/50 ring-1 ring-emerald-500/5'
                          : 'bg-white border-[#ebdcca]/40'
                      }`}
                      onClick={() => setActiveCommentsPost(post)}
                    >
                      {/* Standard Post Header */}
                      <div 
                        onClick={(e) => {
                          e.stopPropagation(); // Prevent opening comments modal
                        }}
                        className="px-4 py-3 flex items-center justify-between border-b border-[#ebdcca]/10 bg-white"
                      >
                        <div 
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!post.isAnonymous && dynamicCreator?.id) {
                              loadCreatorProfile(dynamicCreator.id);
                              setActiveView('workspace');
                            } else if (post.isAnonymous) {
                              showToast("🔒 Anonymous profile details are encrypted.");
                            }
                          }}
                          className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-full border border-[#cfcac0] bg-[#fdfbf7] hover:bg-[#ebdcca]/30 hover:border-[#8a8172] transition-all cursor-pointer group/profile shadow-2xs"
                          title="View user profile"
                        >
                          <div 
                            className="w-8 h-8 rounded-full shrink-0 bg-[#ebdcca] flex items-center justify-center font-mono text-[10px] text-[#5c5446] font-bold uppercase overflow-hidden border border-[#cfcac0] group-hover/profile:border-[#8a8172] transition-colors"
                          >
                            {post.isAnonymous ? (
                              <User className="text-[#8a8172]" size={14} />
                            ) : dynamicCreator?.avatarUrl ? (
                              <img src={dynamicCreator.avatarUrl || null} alt={dynamicCreator.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                            ) : (
                              dynamicCreator?.name?.charAt(0) || 'U'
                            )}
                          </div>
                          <div className="text-left">
                            <h4 className="font-sans font-bold text-xs text-[#3a342a] leading-tight group-hover/profile:text-amber-800 transition-colors flex items-center gap-1">
                              {post.isAnonymous ? 'Anonymous Member' : dynamicCreator?.name}
                              {!post.isAnonymous && <span className="text-[7px] font-mono font-bold text-amber-800 bg-[#ebdcca]/40 border border-[#ebdcca] px-1.5 py-0.5 rounded-md uppercase tracking-wider scale-90 origin-left">VIEW PROFILE</span>}
                            </h4>
                            <p className="font-mono text-[8px] text-[#8a8172] leading-none mt-1 flex items-center gap-1">
                              <Clock size={8.5} className="text-amber-800/70" />
                              <PostTimestamp post={post} />
                            </p>
                          </div>
                        </div>

                        {/* Right: Options Actions (Moved to Header) */}
                        <div className="relative shrink-0" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setFeedDropdownPostId(feedDropdownPostId === post.id ? null : post.id);
                            }}
                            className="text-[#8a8172] hover:text-[#3a342a] hover:scale-110 active:scale-95 transition-all flex items-center justify-center cursor-pointer p-1 rounded-lg hover:bg-stone-50"
                            title="Post Options"
                          >
                            <MoreVertical size={14} />
                          </button>

                          {feedDropdownPostId === post.id && (
                            <div className="absolute right-0 top-7 mt-1 w-28 bg-white border border-[#ebdcca] rounded-xl shadow-lg z-50 overflow-hidden text-left py-1">
                              {isOwnPost && !post.isTimeCapsule && (
                                <button
                                  onClick={() => {
                                    setEditingPostId(post.id);
                                    setEditingTitle(post.title || '');
                                    setEditingContent(post.content || '');
                                    setEditingIsTimeCapsule(!!post.isTimeCapsule);
                                    setEditingUnlockDate(post.unlockDate || '');
                                    setFeedDropdownPostId(null);
                                  }}
                                  className="w-full text-left px-3 py-1.5 font-sans text-[10px] text-stone-700 hover:bg-stone-50 flex items-center gap-1.5 uppercase font-bold cursor-pointer"
                                >
                                  <Edit size={10} />
                                  Edit
                                </button>
                              )}
                              {isOwnPost && (
                                <button
                                  onClick={() => {
                                    handleDeleteFeedPost(post.id);
                                    setFeedDropdownPostId(null);
                                  }}
                                  className="w-full text-left px-3 py-1.5 font-sans text-[10px] text-red-600 hover:bg-red-50 flex items-center gap-1.5 uppercase font-bold cursor-pointer"
                                >
                                  <Trash2 size={10} />
                                  Delete
                                </button>
                              )}
                              {!isOwnPost && (
                                <button
                                  onClick={() => {
                                    setReportModalPost(post);
                                    setFeedDropdownPostId(null);
                                  }}
                                  className="w-full text-left px-3 py-1.5 font-sans text-[10px] text-amber-800 hover:bg-amber-50 flex items-center gap-1.5 uppercase font-bold cursor-pointer"
                                >
                                  <AlertCircle size={10} />
                                  Report Post
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                      {/* Repost Header Indicator (Subtle) */}
                      {post.isRepost && post.repostedFrom && (
                        <div className="px-4 pt-3 pb-1 flex items-center gap-1.5 text-stone-500 font-mono text-[9px] uppercase tracking-wider" onClick={(e) => e.stopPropagation()}>
                          <Repeat size={10} className="text-amber-700 animate-pulse" />
                          <span>Reposted from </span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              loadCreatorProfile(post.repostedFrom.id);
                              setActiveView('workspace');
                            }}
                            className="font-bold text-amber-900 hover:underline cursor-pointer"
                          >
                            {post.repostedFrom.name}
                          </button>
                        </div>
                      )}

                       {post.isTimeCapsule && !isCapsuleLocked && (
                        <div className="px-4 py-2 bg-emerald-100/30 border-b border-emerald-600/10 flex flex-wrap items-center justify-between text-emerald-800 font-mono text-[8px] tracking-wider uppercase font-bold gap-2" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center gap-1">
                            <Clock size={10} className="text-emerald-700 shrink-0" />
                            <span>Sealed: {new Date(post.lockedAtDate || post.date).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Unlock size={10} className="text-emerald-700 shrink-0 animate-bounce" />
                            <span>Opened: {new Date(post.unlockDate || '').toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                          </div>
                        </div>
                      )}

                      {editingPostId === post.id ? (
                        <div className="p-4 bg-[#fcfaf4] border-b border-[#ebdcca]/30 space-y-3 text-left" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-between">
                            <span className="font-mono text-[8px] font-black uppercase text-amber-800">EDITING POST</span>
                            {post.isTimeCapsule && (
                              <span className="font-mono text-[8px] font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded border border-emerald-200">
                                🕒 Time Capsule
                              </span>
                            )}
                          </div>
                          <input 
                            type="text" 
                            value={editingTitle} 
                            onChange={(e) => setEditingTitle(e.target.value)}
                            placeholder="Post Title (optional)..."
                            className="w-full bg-white border border-[#ebdcca] rounded-xl px-3 py-1.5 text-xs text-[#3a342a] focus:outline-none focus:border-[#3a342a] font-sans font-bold"
                          />
                          <textarea 
                            value={editingContent} 
                            onChange={(e) => setEditingContent(e.target.value)}
                            placeholder="Post Content..."
                            rows={3}
                            className="w-full bg-white border border-[#ebdcca] rounded-xl px-3 py-1.5 text-xs text-[#3a342a] focus:outline-none focus:border-[#3a342a] font-sans resize-none leading-relaxed"
                          />

                          {(post.isTimeCapsule || editingIsTimeCapsule) && (
                            <div className="bg-amber-50/60 border border-amber-200 p-2.5 rounded-xl space-y-2">
                              <div className="flex items-center justify-between text-xs font-bold text-amber-950">
                                <span>🕒 Capsule Unlock Target</span>
                                <button
                                  type="button"
                                  onClick={() => setEditingIsTimeCapsule(!editingIsTimeCapsule)}
                                  className="text-[9px] font-mono text-amber-800 hover:underline cursor-pointer"
                                >
                                  {editingIsTimeCapsule ? 'Remove Lock Seal' : 'Enable Time Seal'}
                                </button>
                              </div>
                              {editingIsTimeCapsule && (
                                <input
                                  type="datetime-local"
                                  value={editingUnlockDate ? new Date(editingUnlockDate).toISOString().slice(0, 16) : ''}
                                  onChange={(e) => setEditingUnlockDate(e.target.value ? new Date(e.target.value).toISOString() : '')}
                                  className="w-full bg-white border border-amber-300 rounded-lg px-2.5 py-1 text-xs text-amber-950 font-mono"
                                />
                              )}
                            </div>
                          )}

                          <div className="flex gap-2 justify-end">
                            <button
                              onClick={() => setEditingPostId(null)}
                              className="font-mono text-[8px] uppercase font-black px-2.5 py-1.5 rounded-lg border border-[#ebdcca] text-[#8a8172] hover:bg-stone-50 transition-all cursor-pointer"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={async () => {
                                if (!editingContent.trim()) {
                                  showToast("⚠️ Content cannot be empty!");
                                  return;
                                }
                                await handleEditFeedPost(
                                  post.id, 
                                  editingTitle, 
                                  editingContent, 
                                  post.imageUrl, 
                                  post.videoUrl, 
                                  post.audioUrl, 
                                  editingIsTimeCapsule, 
                                  editingUnlockDate
                                );
                                setEditingPostId(null);
                              }}
                              className="font-mono text-[8px] uppercase font-black px-2.5 py-1.5 rounded-lg bg-[#3a342a] text-[#f4f1ea] hover:bg-[#52493b] transition-all cursor-pointer"
                            >
                              Save Changes
                            </button>
                          </div>
                        </div>
                      ) : isCapsuleLocked ? (
                        <div className="p-4" onClick={(e) => e.stopPropagation()}>
                          <TimeCapsuleLock
                            unlockDate={post.unlockDate || ''}
                            lockedAtDate={post.lockedAtDate || post.date || new Date().toISOString()}
                            isOwner={isOwnPost}
                            onUnlock={async () => {
                              await fetchFeed();
                            }}
                          />
                        </div>
                      ) : (
                        <>
                          {/* Post Caption (Title & Content) shown under the header/repost credit */}
                          <div className="px-5 pt-3 pb-2 text-left" onClick={(e) => e.stopPropagation()}>
                            {post.title && (
                              <h3 className="font-sans font-bold text-sm text-[#3a342a] tracking-tight leading-snug mb-1.5">
                                {post.title}
                              </h3>
                            )}
                            {post.content && (
                              <CollapsibleText content={post.content} hasAttachment={false} />
                            )}
                          </div>

                          {/* Post Media if any */}
                          {(post.imageUrl || post.videoUrl || post.audioUrl) && (
                            <div className="relative border-t border-[#ebdcca]/10 flex flex-col gap-2">
                              {post.imageUrl && (
                                <div className="overflow-hidden flex items-center justify-center bg-[#fdfbf7] relative">
                                  <NSFWMediaGuard 
                                    src={post.imageUrl} 
                                    alt={post.title || 'Post Attachment'} 
                                    isNsfw={post.isNsfw || post.nsfwVerdict === 'blur'}
                                    onFullscreen={() => window.dispatchEvent(new CustomEvent('open-fullscreen-image', { detail: post.imageUrl }))}
                                  />
                                </div>
                              )}
                              {post.videoUrl && (
                                <div 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleVideoClickToReel(post);
                                  }}
                                  className="overflow-hidden bg-black relative cursor-pointer group rounded-lg"
                                  title="Click to watch as Reel"
                                >
                                  <video
                                    src={post.videoUrl || null}
                                    playsInline
                                    controls
                                    preload="metadata"
                                    className="w-full h-auto max-h-[450px] object-contain"
                                  />
                                  {/* Play overlay for video indicator (clicks pass through to the native controls) */}
                                  <div className="absolute inset-0 bg-black/20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                                    <div className="p-3 bg-white/20 backdrop-blur-md rounded-full border border-white/30 transform scale-90 group-hover:scale-100 transition-transform duration-300">
                                      <Play size={28} className="text-white fill-white" />
                                    </div>
                                    <span className="absolute bottom-3 right-3 font-mono text-[8px] uppercase tracking-wider text-white/95 bg-black/50 px-2.5 py-1 rounded-md border border-white/10">
                                      Watch as Reel
                                    </span>
                                  </div>
                                </div>
                              )}
                              {post.audioUrl && (
                                <div className="p-3 bg-transparent border-b border-[#ebdcca]/20">
                                  <VoiceNotePlayback audioUrl={post.audioUrl} postId={post.id} />
                                </div>
                              )}
                            </div>
                          )}

                          {/* Comments & Interactive Strip */}
                          <div className={`px-4 py-2 border-t border-[#ebdcca]/20 bg-[#fdfbf7]/65 flex items-center select-none ${postButtonsAlignment === 'right' ? 'justify-end' : 'justify-start'}`} onClick={(e) => e.stopPropagation()}>
                            <div className={`flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs font-mono ${postButtonsAlignment === 'right' ? 'flex-row-reverse' : 'flex-row'}`}>
                              {/* 1. Multi-reaction strip (port from arena-ai: like/love/insight/support) */}
                              <div className={`flex items-center gap-0.5 ${postButtonsAlignment === 'right' ? 'flex-row-reverse' : 'flex-row'}`}>
                                {REACTION_TYPES.map((rt) => {
                                  const active = getUserReaction(post, user?.id) === rt;
                                  const count = reactionCount(post, rt);
                                  return (
                                    <motion.button
                                      key={rt}
                                      whileTap={{ scale: 0.8 }}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleLikeFeedPost(post.id, rt);
                                      }}
                                      className={`flex items-center gap-0.5 px-1 py-0.5 rounded-full transition-all cursor-pointer ${
                                        active ? 'bg-amber-100/70 ring-1 ring-amber-300/60' : 'hover:bg-[#ebdcca]/40'
                                      }`}
                                      title={`React with ${REACTION_META[rt].label}`}
                                    >
                                      <ReactionIcon type={rt} active={active} />
                                      {count > 0 && (
                                        <span className="text-[9px] font-mono font-bold text-[#8a8172]">{count}</span>
                                      )}
                                    </motion.button>
                                  );
                                })}
                                <span 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setLikedUsersPost(post);
                                  }}
                                  className="text-[10.5px] font-bold text-[#8a8172] hover:text-[#3a342a] hover:underline cursor-pointer px-1 py-0.5"
                                  title="View who reacted to this post"
                                >
                                  {totalReactions(post)}
                                </span>
                              </div>

                              {/* 2. Comment (with number showing) */}
                              <button 
                                className="flex items-center gap-1.5 text-[#8a8172] hover:text-[#3a342a] hover:scale-110 active:scale-95 transition-all cursor-pointer"
                                onClick={() => setActiveCommentsPost(post)}
                                title="Comment on post"
                              >
                                <MessageSquare size={14} />
                                <span className="text-[10.5px] font-bold">{post.comments?.length || 0}</span>
                              </button>

                              {/* 3. Repost (with number showing) */}
                              <button
                                onClick={() => handleRepostFeedPost(post)}
                                className="text-[#8a8172] hover:text-[#3a342a] hover:scale-110 active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer"
                                title="Repost to My Stream"
                              >
                                <Repeat size={14} />
                                <span className="text-[10.5px] font-bold">{post.repostsCount || 0}</span>
                              </button>

                              {/* 4. Save */}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleSavePost(post.id);
                                }}
                                className={`hover:scale-110 active:scale-90 transition-transform flex items-center gap-1.5 ${
                                  profile.savedPostIds?.includes(post.id) ? 'text-amber-600' : 'text-[#8a8172]'
                                }`}
                                title="Save post"
                              >
                                <Bookmark size={14} className={profile.savedPostIds?.includes(post.id) ? 'fill-amber-600 text-amber-600' : ''} />
                                <span className="text-[10.5px] font-bold">
                                  {profile.savedPostIds?.includes(post.id) ? 'Saved' : 'Save'}
                                </span>
                              </button>

                              {/* 5. Share */}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSharingPost(post);
                                }}
                                className="text-[#8a8172] hover:text-[#3a342a] hover:scale-110 active:scale-95 transition-all flex items-center gap-1.5"
                                title="Share post"
                              >
                                <Share2 size={14} />
                                <span className="text-[10.5px] font-bold">Share</span>
                              </button>

                              {/* 6. Facebook Boost Post — paid-style promotion multiplier */}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleBoostPost(post.id);
                                }}
                                className={`flex items-center gap-1.5 transition-all hover:scale-110 active:scale-95 cursor-pointer ${
                                  rankBoosted.includes(post.id) ? 'text-purple-700' : 'text-[#8a8172] hover:text-purple-600'
                                }`}
                                title="Facebook Boost Post — push this post higher in the feed (up to 2.5× multiplier)"
                              >
                                <TrendingUp size={14} className={rankBoosted.includes(post.id) ? 'text-purple-600' : ''} />
                                <span className="text-[10.5px] font-bold">{rankBoosted.includes(post.id) ? 'Boosted ⚡' : 'Boost Post'}</span>
                              </button>

                              {/* 7. Facebook-style Interested / Not Interested rank feedback */}
                              <div className="flex items-center gap-0.5">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleRankFeedback(post.id, 'interested', post.title || post.content);
                                  }}
                                  className={`flex items-center justify-center w-6 h-6 rounded-full transition-all cursor-pointer ${
                                    rankFeedback[post.id] === 'interested' ? 'text-emerald-600' : 'text-[#8a8172] hover:text-emerald-600 hover:bg-emerald-50'
                                  }`}
                                  title="Interested — teach the algorithm to show more like this"
                                >
                                  <ThumbsUp size={13} className={rankFeedback[post.id] === 'interested' ? 'fill-emerald-500 text-emerald-500' : ''} />
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleRankFeedback(post.id, 'not_interested', post.title || post.content);
                                  }}
                                  className={`flex items-center justify-center w-6 h-6 rounded-full transition-all cursor-pointer ${
                                    rankFeedback[post.id] === 'not_interested' ? 'text-rose-600' : 'text-[#8a8172] hover:text-rose-600 hover:bg-rose-50'
                                  }`}
                                  title="Not Interested — teach the algorithm to show less like this"
                                >
                                  <ThumbsDown size={13} className={rankFeedback[post.id] === 'not_interested' ? 'fill-rose-500 text-rose-500' : ''} />
                                </button>
                              </div>
                            </div>
                          </div>
                        </>
                      )}


                    </motion.div>
                  );
                })
              })()}
              </motion.div>
            ) : feedSubTab === 'reels' ? (
              /* Fresh and Real Reels Grid */
              <div className="space-y-4">

                {(() => {
                  if (filteredReels.length === 0) {
                    return (
                      <div className="text-center py-16 px-4 bg-[#fdfbf7] border border-dashed border-[#ebdcca] rounded-3xl space-y-3">
                        <div className="w-12 h-12 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center mx-auto text-xl font-bold shadow-xs">
                          🎬
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs font-sans font-extrabold text-[#3a342a] uppercase tracking-wider">
                            No Reels Uploaded Yet
                          </p>
                          <p className="text-[11px] text-[#8a8172] max-w-sm mx-auto">
                            Post a video in your feed or upload a video clip to share real video reels here.
                          </p>
                        </div>
                        <button
                          onClick={() => setIsCreatePostOpen(true)}
                          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#3a342a] text-[#f4f1ea] hover:bg-black text-[10px] font-bold uppercase tracking-wider transition-all shadow-sm cursor-pointer"
                        >
                          <span>+ Upload Video Reel</span>
                        </button>
                      </div>
                    );
                  }

                  return (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3">
                      {filteredReels.map((reel, idx) => {
                        return (
                          <motion.div
                            key={reel.id}
                            whileHover={{ y: -2, scale: 1.01 }}
                            onClick={() => {
                              setActiveImmersiveReelIndex(idx);
                              setIsReelPaused(false);
                              if (reel.id.startsWith('reel-feed-')) {
                                const origId = reel.id.replace('reel-feed-', '');
                                setFeedList(prev => prev.map(p => p.id === origId ? { ...p, views: (p.views || 0) + 1, viewsCount: (p.viewsCount || 0) + 1 } : p));
                              } else {
                                setDynamicReels(prev => prev.map(r => r.id === reel.id ? { ...r, views: `${(parseInt(r.views) || 0) + 1}` } : r));
                              }
                              showToast(`🎬 Playing Reel: ${reel.title}`);
                            }}
                            className="aspect-[9/16] relative rounded-2xl overflow-hidden bg-black cursor-pointer group shadow-md transition-all border border-neutral-800/80 hover:border-amber-500/50"
                          >
                            <div className="w-full h-full relative overflow-hidden">
                              {reel.videoUrl ? (
                                <video
                                  src={reel.videoUrl || null}
                                  muted
                                  loop
                                  playsInline
                                  autoPlay
                                  preload="metadata"
                                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                                />
                              ) : (
                                <img 
                                  src={reel.imageUrl || null} 
                                  alt={reel.title} 
                                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                                  referrerPolicy="no-referrer"
                                />
                              )}
                              
                              {/* Dark gradient overlay for extreme legibility */}
                              <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-transparent to-black/80 pointer-events-none" />
                              
                              {/* Play Badge Top Right */}
                              <div className="absolute top-2 right-2 bg-black/70 backdrop-blur-md px-2 py-0.5 rounded-full border border-white/20 text-[8px] font-mono font-bold text-white flex items-center gap-1 z-20 shadow-md">
                                <Play size={9} className="fill-amber-400 text-amber-400" />
                                <span className="uppercase tracking-wider">REEL</span>
                              </div>

                              {/* Hover Play Button in Center */}
                              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/40 z-20 pointer-events-none">
                                <div className="w-11 h-11 rounded-full bg-amber-400 text-black flex items-center justify-center shadow-2xl transform group-hover:scale-110 transition-transform">
                                  <Play size={22} className="fill-black translate-x-0.5" />
                                </div>
                              </div>

                              {/* Title Overlay at Top Left */}
                              <div className="absolute top-2 left-2 right-14 z-20 pointer-events-none">
                                <p className="font-sans font-extrabold text-[10px] sm:text-[11px] text-white leading-tight drop-shadow-[0_2px_4px_rgba(0,0,0,0.95)] line-clamp-3 tracking-tight text-left">
                                  {reel.title}
                                </p>
                              </div>

                              {/* Overlay Interaction Buttons on Right Margin */}
                              <div className="absolute right-1.5 bottom-10 flex flex-col gap-1.5 z-30" onClick={(e) => e.stopPropagation()}>
                                {/* Star React (Like) */}
                                <button
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    const isFeedReel = reel.id.startsWith('reel-feed-');
                                    if (isFeedReel) {
                                      const originalId = reel.id.replace('reel-feed-', '');
                                      await handleLikeFeedPost(originalId);
                                    } else if (reel.isServerReel) {
                                      // Server-persisted reel: toggle via API + optimistic update.
                                      const alreadyLiked = Array.isArray(reel.likedBy) && reel.likedBy.includes(user?.id);
                                      const nextLiked = !alreadyLiked;
                                      setServerReels(prev => prev.map(r => r.id === reel.id ? {
                                        ...r,
                                        likedBy: nextLiked
                                          ? [...(r.likedBy || []), user?.id].filter(Boolean)
                                          : (r.likedBy || []).filter((id: string) => id !== user?.id),
                                        likes: Math.max(0, (r.likes || 0) + (nextLiked ? 1 : -1)),
                                      } : r));
                                      try {
                                        await fetch(`/api/reels/${reel.id}/like`, {
                                          method: 'POST',
                                          headers: { 'Authorization': `Bearer ${token}` },
                                        });
                                      } catch (err) { console.warn('Reel like sync failed:', err); }
                                      showToast(nextLiked ? "Reacted with Star!" : "Removed star react");
                                    } else {
                                      const isAlreadyLiked = likedReels.includes(reel.id);
                                      let nextLiked;
                                      if (isAlreadyLiked) {
                                        nextLiked = likedReels.filter(id => id !== reel.id);
                                        setDynamicReels(prev => prev.map(r => r.id === reel.id ? { ...r, likes: Math.max(0, r.likes - 1) } : r));
                                      } else {
                                        nextLiked = [...likedReels, reel.id];
                                        setDynamicReels(prev => prev.map(r => r.id === reel.id ? { ...r, likes: r.likes + 1 } : r));
                                      }
                                      setLikedReels(nextLiked);
                                      showToast(isAlreadyLiked ? "Removed star react" : "Reacted with Star!");
                                    }
                                  }}
                                  className="w-7 h-7 rounded-full bg-black/60 backdrop-blur-md flex flex-col items-center justify-center border border-white/20 hover:bg-black/90 transition-all text-white hover:scale-110 active:scale-95 shadow-md"
                                  title="Star React"
                                >
                                  <Star size={11} className={likedReels.includes(reel.id) ? 'fill-amber-400 text-amber-400 stroke-amber-500' : 'text-white'} />
                                </button>

                                {/* Comments */}
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const postRep = convertReelToPost(reel);
                                    if (postRep) {
                                      setActiveCommentsPost(postRep);
                                    }
                                  }}
                                  className="w-7 h-7 rounded-full bg-black/60 backdrop-blur-md flex flex-col items-center justify-center border border-white/20 hover:bg-black/90 transition-all text-white hover:scale-110 active:scale-95 shadow-md"
                                  title="Comments"
                                >
                                  <MessageSquare size={11} className="text-white" />
                                </button>

                                {/* Repost */}
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const postRep = convertReelToPost(reel);
                                    if (postRep) {
                                      handleRepostFeedPost(postRep);
                                    }
                                  }}
                                  className="w-7 h-7 rounded-full bg-black/60 backdrop-blur-md flex flex-col items-center justify-center border border-white/20 hover:bg-black/90 transition-all text-white hover:scale-110 active:scale-95 shadow-md"
                                  title="Repost"
                                >
                                  <Repeat size={11} className="text-white" />
                                </button>

                                {/* Save */}
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleSavePost(reel.id);
                                  }}
                                  className="w-7 h-7 rounded-full bg-black/60 backdrop-blur-md flex flex-col items-center justify-center border border-white/20 hover:bg-black/90 transition-all text-white hover:scale-110 active:scale-95 shadow-md"
                                  title="Save"
                                >
                                  <Bookmark size={11} className={profile.savedPostIds?.includes(reel.id) ? 'fill-amber-600 text-amber-600' : 'text-white'} />
                                </button>
                              </div>

                              {/* Bottom row: Views count & Creator handle */}
                              <div className="absolute bottom-2 left-2 right-12 flex items-center justify-between gap-1 z-20">
                                <div className="flex items-center gap-1 drop-shadow-md">
                                  <Play size={10} className="text-amber-400 fill-amber-400 shrink-0" />
                                  <span className="font-mono font-bold text-[9px] sm:text-[10px] text-white">{reel.views}</span>
                                </div>
                                <span 
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    await loadCreatorProfile(reel.creatorId);
                                    setActiveView('workspace');
                                  }}
                                  className="font-mono text-[8px] sm:text-[9px] text-white/95 bg-black/50 px-1.5 py-0.5 rounded-md backdrop-blur-xs truncate max-w-[70%] hover:text-amber-400 hover:bg-black/80 cursor-pointer flex items-center gap-0.5 border border-white/10 transition-all"
                                  title="View Creator Profile"
                                >
                                  <User size={8} className="inline opacity-80" /> @{reel.creatorName.split(' ')[0].toLowerCase()}
                                </span>
                              </div>
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                  );
                })()}

                {/* Infinite scroll: auto-loads the next ranked page of server reels */}
                <div ref={reelsSentinelRef} className="flex justify-center py-4">
                  {isLoadingReels ? (
                    <span className="inline-flex items-center gap-2 text-[10px] font-mono font-bold uppercase tracking-wider text-[#8a8172]">
                      <span className="w-3.5 h-3.5 rounded-full border-2 border-amber-600 border-t-transparent animate-spin" />
                      Loading more reels…
                    </span>
                  ) : reelsHasMore ? (
                    <button
                      onClick={() => fetchServerReels(reelsNextCursor)}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full border border-[#ebdcca] bg-white hover:bg-[#fdfbf7] text-[10px] font-bold uppercase tracking-wider text-[#3a342a] transition-all cursor-pointer"
                    >
                      Load more reels
                    </button>
                  ) : null}
                </div>
              </div>
            ) : feedSubTab === 'voice' ? (
              /* Beautiful Scrollable Voice Feed Section */
              <div className="space-y-4">
                {/* Voice Feed Header */}
                <div className="flex items-center justify-between px-1 py-1">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-[#d97706] animate-pulse" />
                    <span className="font-sans font-black text-[11px] sm:text-xs text-[#3a342a] tracking-wider uppercase">VOICE SECTION</span>
                  </div>
                </div>

                {(() => {
                  const voiceFeedPosts = feedList.filter(post => post.audioUrl);

                  if (voiceFeedPosts.length === 0) {
                    return (
                      <div className="text-center py-12 bg-[#fdfbf7] border border-dashed border-[#ebdcca] rounded-3xl">
                        <p className="text-xs text-[#8a8172] font-mono uppercase">
                          No voice posts available
                        </p>
                        <p className="text-[11px] text-[#8a8172] mt-1 font-sans">
                          Be the first to record and share a voice note on the feed!
                        </p>
                      </div>
                    );
                  }

                  return (
                    <div className="space-y-4">
                      {voiceFeedPosts.map((post) => {
                        const deterId = user ? getDeterministicAnon(user.id, user.countryCode).id : '';
                        const hasLiked = user && post.likedBy && Array.isArray(post.likedBy) && post.likedBy.includes(user.id);
                        const commentsCount = post.comments ? post.comments.length : 0;
                        const isAnon = !!post.isAnonymous;
                        const creatorName = isAnon ? 'Anonymous Member' : (post.creator?.name || 'Member');
                        const creatorHandle = isAnon ? 'ENCRYPTED ID' : (post.creator?.badgeNumber ? formatCreditCardStyle(post.creator.badgeNumber) : 'BD-00-000-00');

                        return (
                          <motion.div
                            key={post.id}
                            initial={{ opacity: 0, y: 15 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="p-4 bg-white border border-[#ebdcca]/50 rounded-2xl shadow-3xs space-y-3"
                          >
                            {/* Creator details */}
                            <div className="flex items-center justify-between">
                              <div 
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  if (!isAnon && post.creator?.id) {
                                    await loadCreatorProfile(post.creator.id);
                                    setActiveView('workspace');
                                  }
                                }}
                                className={`flex items-center gap-3 ${!isAnon ? 'cursor-pointer hover:opacity-80 transition-all' : ''}`}
                              >
                                <div className="w-9 h-9 rounded-full border border-[#ebdcca] bg-[#ebdcca]/20 overflow-hidden flex items-center justify-center shrink-0">
                                  {!isAnon && post.creator?.avatarUrl ? (
                                    <img src={post.creator.avatarUrl || null} alt={creatorName} className="w-full h-full object-cover" />
                                  ) : (
                                    <User className="text-amber-800" size={14} />
                                  )}
                                </div>
                                <div className="text-left">
                                  <h4 className="font-sans font-bold text-xs text-[#3a342a] flex items-center gap-1">
                                    {creatorName}
                                    {!isAnon && <span className="text-[8px] font-mono text-amber-800 uppercase tracking-widest font-black">(View Profile)</span>}
                                  </h4>
                                  <p className="font-mono text-[8px] text-[#8a8172] uppercase tracking-wider">
                                    {creatorHandle}
                                  </p>
                                  <p className="font-mono text-[7.5px] text-[#8a8172] mt-0.5">
                                    {post.date || 'Just now'}
                                  </p>
                                </div>
                              </div>
                            </div>

                            {/* Post Title & Content/Transcript */}
                            <div className="text-left space-y-1">
                              {post.title && <h3 className="font-sans font-extrabold text-xs text-[#3a342a]">{post.title}</h3>}
                              {post.content && (
                                <p className="text-[11px] text-[#5c5446] leading-relaxed italic font-sans bg-[#fbf9f4] p-3 rounded-xl border border-[#ebdcca]/30">
                                  "{post.content}"
                                </p>
                              )}
                            </div>

                            {/* Audio Player */}
                            <div className="bg-transparent rounded-xl flex items-center gap-3">
                              <VoiceNotePlayback audioUrl={post.audioUrl} postId={post.id} />
                            </div>

                            {/* Interactions (Star, Comment, Repost, Save) */}
                            <div className="flex items-center gap-4 pt-1.5 border-t border-[#ebdcca]/30 text-[#8a8172]">
                              <button
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  await handleLikeFeedPost(post.id);
                                }}
                                className={`flex items-center gap-1 text-[10px] font-mono font-bold transition-all ${
                                  hasLiked ? 'text-amber-600' : 'hover:text-[#3a342a]'
                                }`}
                                title="React with Star"
                              >
                                <Star size={12} className={hasLiked ? 'fill-amber-400 stroke-amber-500' : 'stroke-[#8a8172] hover:stroke-amber-500'} />
                                <span>{post.likes || 0}</span>
                              </button>

                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setActiveCommentsPost(post);
                                }}
                                className="flex items-center gap-1 text-[10px] font-mono font-bold hover:text-[#3a342a] transition-all"
                                title="Comment"
                              >
                                <MessageSquare size={12} />
                                <span>{commentsCount}</span>
                              </button>

                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleRepostFeedPost(post);
                                }}
                                className="flex items-center gap-1 text-[10px] font-mono font-bold hover:text-[#3a342a] transition-all"
                                title="Repost"
                              >
                                <Repeat size={12} />
                                <span>{post.repostsCount || 0}</span>
                              </button>

                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleSavePost(post.id);
                                }}
                                className={`flex items-center gap-1 text-[10px] font-mono font-bold transition-all ${
                                  profile.savedPostIds?.includes(post.id) ? 'text-amber-600' : 'hover:text-[#3a342a]'
                                }`}
                                title="Save"
                              >
                                <Bookmark size={12} className={profile.savedPostIds?.includes(post.id) ? 'fill-amber-600 text-amber-600' : ''} />
                                <span>{profile.savedPostIds?.includes(post.id) ? 'Saved' : 'Save'}</span>
                              </button>
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            ) : (
              /* HANDSHAKE / COMPANIONS EXPLORE DASHBOARD */
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="max-w-xl mx-auto space-y-6"
              >
                {/* Custom Sub-tabs */}
                <div className="flex items-center justify-between p-1 rounded-full border border-[#ebdcca]/80 bg-[#fbf9f4]/90 shadow-2xs max-w-md mx-auto mb-6">
                  {([
                    { key: 'mutual', label: 'MUTUAL', count: (friends || []).length },
                    { key: 'sent', label: 'SENT', count: (friendRequestsSent || []).length },
                    { key: 'requests', label: 'REQUESTS', count: (friendRequestsReceived || []).length },
                    { key: 'explore', label: 'EXPLORE', count: (creatorsList || []).filter(c => c.id !== (user?.id || 'me') && !(friends || []).some(f => f.id === c.id) && !(friendRequestsSent || []).includes(c.id) && !(friendRequestsReceived || []).some(f => f.id === c.id)).length }
                  ] as const).map(tab => {
                    const isActive = exploreTab === tab.key;
                    return (
                      <button
                        key={tab.key}
                        onClick={() => {
                          setExploreTab(tab.key);
                          setExploreFilterQuery('');
                        }}
                        className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-1 rounded-full font-mono text-[9px] sm:text-[10px] font-bold tracking-wider transition-all cursor-pointer ${
                          isActive
                            ? 'bg-[#3a342a] text-[#f4f1ea] shadow-3xs font-extrabold'
                            : 'text-[#8a8172] hover:text-[#3a342a] hover:bg-[#ebdcca]/20'
                        }`}
                      >
                        <span>{tab.label}</span>
                        <span className={`flex items-center justify-center text-[8px] sm:text-[9px] min-w-[16px] h-4 px-1 rounded-full font-sans ${
                          isActive ? 'bg-white text-black font-black' : 'bg-[#ebdcca]/40 text-[#8a8172]'
                        }`}>
                          {tab.count}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Filter Search Input */}
                <div className="relative max-w-md mx-auto mb-6">
                  <input
                    type="text"
                    value={exploreFilterQuery}
                    onChange={(e) => setExploreFilterQuery(e.target.value)}
                    placeholder="Filter companions list..."
                    className="w-full bg-white/95 border-2 border-[#ebdcca]/70 focus:border-[#3a342a] rounded-full py-2.5 pl-10 pr-10 focus:outline-none font-mono text-xs text-[#3a342a] placeholder-[#8a8172]/50 shadow-inner transition-all"
                  />
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#8a8172]/60" size={13} />
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center justify-center w-7 h-7 rounded-full bg-[#fdfbf7] border border-[#ebdcca] text-[#8a8172] cursor-pointer hover:bg-[#ebdcca]/20 hover:text-[#3a342a] transition-all">
                    <Mic size={12} />
                  </div>
                </div>

                {/* Heading */}
                <div className="max-w-md mx-auto mb-4 flex items-center justify-between border-b border-[#ebdcca]/30 pb-2">
                  <span className="font-mono text-[9px] sm:text-[10px] uppercase font-black tracking-widest text-[#8a8172] flex items-center gap-1">
                    {exploreTab === 'mutual' && "🤝 ACTIVE HANDSHAKES"}
                    {exploreTab === 'sent' && "📤 SENT HANDSHAKE REQUESTS"}
                    {exploreTab === 'requests' && "📥 INCOMING HANDSHAKES"}
                    {exploreTab === 'explore' && "🧭 DISCOVER NEW COMPANIONS"}
                  </span>
                </div>

                {/* List Items */}
                <div className="space-y-3 max-w-md mx-auto">
                  {(() => {
                    const filteredItems = (() => {
                      let list: any[] = [];
                      if (exploreTab === 'mutual') {
                        list = friends || [];
                      } else if (exploreTab === 'sent') {
                        list = (creatorsList || []).filter(c => (friendRequestsSent || []).includes(c.id));
                      } else if (exploreTab === 'requests') {
                        list = friendRequestsReceived || [];
                      } else if (exploreTab === 'explore') {
                        list = (creatorsList || []).filter(c => {
                          const isSelf = c.id === (user?.id || 'me');
                          const isFriend = (friends || []).some(f => f.id === c.id);
                          const isSent = (friendRequestsSent || []).includes(c.id);
                          const isReceived = (friendRequestsReceived || []).some(f => f.id === c.id);
                          return !isSelf && !isFriend && !isSent && !isReceived;
                        });
                      }

                      // Apply search filter
                      if (exploreFilterQuery.trim() !== '') {
                        const query = exploreFilterQuery.toLowerCase();
                        list = list.filter(item => {
                          const name = (item.name || '').toLowerCase();
                          const username = (item.username || item.profile?.username || '').toLowerCase();
                          const badge = (item.badgeNumber || '').toLowerCase();
                          return name.includes(query) || username.includes(query) || badge.includes(query);
                        });
                      }
                      return list;
                    })();

                    if (filteredItems.length === 0) {
                      return (
                        <div className="text-center py-10 bg-[#fdfbf7]/40 border border-dashed border-[#ebdcca] rounded-[2rem] p-6">
                          <Users className="mx-auto text-[#8a8172]/40 mb-2" size={24} />
                          <p className="font-mono text-xs text-[#8a8172]">No companions found in this category.</p>
                        </div>
                      );
                    }

                    return filteredItems.map(item => {
                      const initials = (item.name || 'U').split(' ').map((n: string) => n.charAt(0)).join('').toUpperCase().slice(0, 2);
                      const handle = item.badgeNumber ? formatCreditCardStyle(item.badgeNumber) : (item.profile?.badgeNumber ? formatCreditCardStyle(item.profile.badgeNumber) : 'BD-00-000-00');
                      const isOnline = true; // Always show live p2p node status
                      
                      return (
                        <div
                          key={item.id}
                          className="flex items-center justify-between p-4 bg-[#fdfbf7]/90 border border-[#ebdcca]/60 rounded-3xl shadow-xs hover:shadow-sm transition-all text-left"
                        >
                          <div className="flex items-center gap-3">
                            {/* Avatar with status indicator */}
                            <div className="relative">
                              <div className="w-12 h-12 rounded-full bg-[#ebdcca]/20 flex items-center justify-center overflow-hidden border border-[#ebdcca]/60">
                                {item.avatarUrl ? (
                                  <img src={item.avatarUrl || null} alt={item.name} className="w-full h-full object-cover" />
                                ) : (
                                  <span className="text-[11px] font-mono font-bold text-[#8a8172]">
                                    {initials}
                                  </span>
                                )}
                              </div>
                              {isOnline && (
                                <span className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 border-2 border-white rounded-full" />
                              )}
                            </div>

                            {/* Text Details */}
                            <div className="flex flex-col text-left">
                              <span className="font-sans font-bold text-xs sm:text-sm text-[#3a342a] leading-tight">
                                {item.name}
                              </span>
                              <span className="font-mono text-[9px] text-amber-800 font-bold mt-0.5">
                                {handle}
                              </span>
                              {isOnline && (
                                <span className="font-sans font-extrabold text-[8px] tracking-wider text-[#22c55e] mt-0.5 flex items-center gap-0.5">
                                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#22c55e] animate-pulse" />
                                  LIVE NODE
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Actions */}
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              onClick={() => loadCreatorProfile(item.id)}
                              className="bg-[#3a342a] hover:bg-[#4d4538] text-[#f4f1ea] font-sans text-[9px] font-black uppercase px-3 py-1.5 rounded-full transition-all tracking-wider shadow-3xs cursor-pointer"
                            >
                              PROFILE
                            </button>

                            {exploreTab === 'mutual' && (
                              <button
                                onClick={() => handleFriendAction(item.id, 'unfriend')}
                                className="text-rose-600 hover:text-rose-700 font-sans font-black text-[9px] uppercase px-2 py-1 transition-all tracking-wider cursor-pointer"
                              >
                                DISCONNECT
                              </button>
                            )}

                            {exploreTab === 'sent' && (
                              <button
                                onClick={() => handleFriendAction(item.id, 'decline')}
                                className="text-rose-600 hover:text-rose-700 font-sans font-black text-[9px] uppercase px-2 py-1 transition-all tracking-wider cursor-pointer"
                              >
                                CANCEL
                              </button>
                            )}

                            {exploreTab === 'requests' && (
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => handleFriendAction(item.id, 'accept')}
                                  className="bg-emerald-500 hover:bg-emerald-600 text-white font-sans text-[9px] font-black uppercase px-3 py-1.5 rounded-full transition-all tracking-wider shadow-3xs cursor-pointer"
                                >
                                  ACCEPT
                                </button>
                                <button
                                  onClick={() => handleFriendAction(item.id, 'decline')}
                                  className="text-rose-600 hover:text-rose-700 font-sans font-black text-[9px] uppercase px-2 py-1 transition-all tracking-wider cursor-pointer"
                                >
                                  DECLINE
                                </button>
                              </div>
                            )}

                            {exploreTab === 'explore' && (
                              <button
                                onClick={() => handleFriendAction(item.id, 'send')}
                                className="bg-[#ebdcca] hover:bg-[#cfcac0] text-[#3a342a] font-sans text-[9px] font-black uppercase px-3 py-1.5 rounded-full transition-all tracking-wider shadow-3xs cursor-pointer"
                              >
                                CONNECT
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>
              </motion.div>
            )}
          </div>
        ) : activeView === 'meet' ? (
          /* SECURE MEET (RANDOM VIDEO CALLING) */
          <MeetView 
            currentUser={user}
            creatorsList={creatorsList}
            onShowToast={showToast}
            token={token}
          />
        ) : activeView === 'search' ? (
          /* DEDICATED SEARCH ENGINE PAGE */
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            className="max-w-xl mx-auto space-y-6"
          >
            <div className="flex flex-col space-y-1">
              <span className="font-mono text-[9px] uppercase font-bold tracking-widest text-[#8a8172] dark:text-zinc-400">DEDICATED PORTAL</span>
              <h1 className="font-sans font-extrabold text-lg text-[#3a342a] dark:text-zinc-100 tracking-tight">GLOBAL SYSTEM SEARCH</h1>
            </div>

            <div className="bg-[#fcfaf4] dark:bg-zinc-900 border-2 border-[#ebdcca] dark:border-zinc-800 rounded-[2.5rem] p-6 md:p-8 space-y-6 shadow-xs relative overflow-hidden">
              {/* Search input wrapped in form to guarantee Enter key submits search */}
              <form 
                onSubmit={(e) => {
                  e.preventDefault();
                  handleExecuteSearch(searchPageQuery);
                }}
                className="relative"
              >
                <input
                  type="text"
                  value={searchPageQuery}
                  onChange={(e) => {
                    const val = e.target.value;
                    setSearchPageQuery(val);
                    if (val.startsWith('#')) {
                      setSearchSubTab('hashtags');
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleExecuteSearch(searchPageQuery);
                    }
                  }}
                  placeholder="Search Mastodon, #hashtags, creators, IDs... (Press Enter)"
                  className="w-full bg-[#fbf9f4] dark:bg-zinc-950 border-2 border-[#ebdcca] dark:border-zinc-800 focus:border-[#cfcac0] dark:focus:border-zinc-600 rounded-2xl py-3 px-5 pl-11 pr-32 focus:outline-none font-mono text-xs text-[#3a342a] dark:text-zinc-100 placeholder-[#8a8172]/60 dark:placeholder-zinc-500 transition-all shadow-inner"
                />
                <button
                  type="submit"
                  className="absolute left-3 top-1/2 -translate-y-1/2 p-1.5 text-[#8a8172] dark:text-zinc-400 hover:text-amber-800 dark:hover:text-amber-400 transition-colors"
                  title="Submit Search"
                >
                  <Search size={14} />
                </button>

                <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setSearchSubTab('hashtags');
                      if (!searchPageQuery.startsWith('#')) {
                        setSearchPageQuery('#');
                      }
                    }}
                    className={`px-2 py-1 rounded-lg font-mono text-[9.5px] font-extrabold transition-all flex items-center gap-1 ${
                      searchSubTab === 'hashtags'
                        ? 'bg-amber-900 text-amber-100 dark:bg-amber-600 dark:text-zinc-950 shadow-sm'
                        : 'bg-[#ebdcca]/50 hover:bg-[#ebdcca] text-[#3a342a] dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700'
                    }`}
                    title="Toggle Trending Hashtags & Analytics"
                  >
                    <Hash size={11} />
                    <span>#Hashtags</span>
                  </button>
                  {searchPageQuery && (
                    <button 
                      type="button"
                      onClick={() => setSearchPageQuery('')}
                      className="text-[#8a8172] hover:text-[#3a342a] dark:text-zinc-400 dark:hover:text-white focus:outline-none p-1"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
              </form>

              {/* Suggestions pills */}
              {((realTopSearches.length > 0 ? realTopSearches.map(i => i.term) : extractedHashtags.map(h => h.tag)).length > 0) && (
                <div className="flex flex-wrap gap-1.5 items-center">
                  <span className="font-mono text-[8px] text-[#8a8172] dark:text-zinc-400 uppercase tracking-wider mr-1">Trending:</span>
                  {(realTopSearches.length > 0 
                    ? realTopSearches.slice(0, 6).map(item => item.term) 
                    : extractedHashtags.slice(0, 6).map(h => h.tag)
                  ).map((sug) => (
                    <button
                      key={sug}
                      type="button"
                      onClick={() => handleExecuteSearch(sug)}
                      className="font-mono text-[8px] bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 text-[#5c5446] dark:text-zinc-300 py-1 px-2.5 rounded-full hover:bg-[#ebdcca]/20 dark:hover:bg-zinc-700 transition-all"
                    >
                      {sug}
                    </button>
                  ))}
                </div>
              )}

              {/* Recent Search History Section */}
              {searchHistory.length > 0 && (
                <div className="pt-3 border-t border-[#ebdcca]/40 dark:border-zinc-800 space-y-2 text-left">
                  <div className="flex items-center justify-between text-[9px] font-mono uppercase font-bold text-[#8a8172] dark:text-zinc-400">
                    <span className="flex items-center gap-1.5">
                      <Clock size={11} className="text-amber-700 dark:text-amber-400" />
                      Recent Search History
                    </span>
                    <button
                      type="button"
                      onClick={handleClearSearchHistory}
                      className="text-rose-700 dark:text-rose-400 hover:underline text-[8px] font-mono font-bold"
                    >
                      Clear History
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {searchHistory.map((term, idx) => (
                      <div
                        key={idx}
                        className="font-mono text-[9px] bg-amber-500/10 border border-amber-500/20 hover:bg-amber-500/20 text-[#3a342a] dark:text-zinc-200 px-2.5 py-1 rounded-xl transition-all flex items-center gap-1.5 group cursor-pointer"
                        onClick={() => handleExecuteSearch(term)}
                      >
                        <span>{term}</span>
                        <X
                          size={11}
                          className="opacity-40 group-hover:opacity-100 text-rose-600 dark:text-rose-400 hover:scale-125 transition-all p-0.5"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSearchHistory(prev => {
                              const updated = prev.filter(item => item !== term);
                              localStorage.setItem('global_search_history', JSON.stringify(updated));
                              return updated;
                            });
                          }}
                          aria-label="Remove item"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Main query results */}
              {(() => {
                const qRaw = searchPageQuery.toLowerCase().trim();
                const isHashtagSearch = qRaw.startsWith('#');
                const tagTerm = isHashtagSearch ? qRaw.substring(1) : qRaw;

                // 1. Filter Portfolios / Creators
                const matchedCreators = creatorsList.filter(creator => {
                  if (!qRaw) return true;
                  const name = creator.name.toLowerCase();
                  const username = `@${creator.name.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
                  const location = (creator.location || '').toLowerCase();
                  const badge = (creator.badgeNumber || '').toLowerCase();
                  const skills = Array.isArray(creator.skills) ? creator.skills.map((s: string) => s.toLowerCase()) : [];
                  const tagline = (creator.tagline || '').toLowerCase();

                  if (isHashtagSearch) {
                    return skills.some(s => s.includes(tagTerm)) || tagline.includes(tagTerm);
                  }

                  return name.includes(qRaw) || username.includes(qRaw) || location.includes(qRaw) || badge.includes(qRaw) || tagline.includes(qRaw) || skills.some(s => s.includes(qRaw));
                });

                // 2. Filter Feed Posts
                const matchedPosts = feedList.filter(post => {
                  if (!qRaw) return true;
                  const content = (post.content || '').toLowerCase();
                  const title = (post.title || '').toLowerCase();
                  const creatorName = (post.creator?.name || '').toLowerCase();
                  const creatorBadge = (post.creator?.badgeNumber || '').toLowerCase();
                  const tags = Array.isArray(post.tags) ? post.tags.map((t: string) => t.toLowerCase()) : [];
                  const hasTagMatch = tags.some((t: string) => t.includes(tagTerm) || tagTerm.includes(t));
                  
                  if (isHashtagSearch) {
                    return hasTagMatch || content.includes(qRaw);
                  }

                  return content.includes(qRaw) || title.includes(qRaw) || creatorName.includes(qRaw) || creatorBadge.includes(qRaw) || hasTagMatch;
                });

                // 3. Filter Reels
                const matchedReels = allReels.filter(reel => {
                  if (!qRaw) return true;
                  const title = (reel.title || '').toLowerCase();
                  const category = (reel.category || '').toLowerCase();
                  const creatorName = (reel.creatorName || '').toLowerCase();
                  const caption = (reel.caption || '').toLowerCase();

                  if (isHashtagSearch) {
                    return caption.includes(tagTerm) || category.includes(tagTerm);
                  }

                  return title.includes(qRaw) || category.includes(qRaw) || creatorName.includes(qRaw) || caption.includes(qRaw);
                });

                return (
                  <div className="space-y-6">
                    {/* Sub tabs selector inside search */}
                    <div className="flex border-b border-[#ebdcca]/50 dark:border-zinc-800 pb-2 gap-2 overflow-x-auto">
                      {[
                        { id: 'posts', label: 'Posts', count: matchedPosts.length, icon: '📝' },
                        { id: 'hashtags', label: 'Hashtags', count: extractedHashtags.length, icon: '#' },
                        { id: 'portfolios', label: 'Portfolios', count: matchedCreators.length, icon: '👥' },
                        { id: 'reels', label: 'Reels', count: matchedReels.length, icon: '🎬' }
                      ].map(tab => {
                        const isActive = searchSubTab === tab.id;
                        return (
                          <button
                            key={tab.id}
                            onClick={() => setSearchSubTab(tab.id as any)}
                            className={`font-mono text-[9.5px] uppercase font-bold py-1.5 px-3 rounded-xl transition-all flex items-center gap-1.5 shrink-0 ${
                              isActive 
                                ? 'bg-amber-950 text-[#f4f1ea] dark:bg-amber-600 dark:text-zinc-950 shadow-sm' 
                                : 'bg-[#fbf9f4] hover:bg-[#ebdcca]/30 text-[#8a8172] dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700'
                            }`}
                          >
                            <span>{tab.icon}</span>
                            <span>{tab.label}</span>
                            <span className="text-[7.5px] px-1.5 py-0.25 rounded-md bg-[#ebdcca]/40 dark:bg-zinc-900 text-[#5c5446] dark:text-zinc-300">
                              {tab.count}
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    {/* Hashtags Trend Analytics Graph View */}
                    {searchSubTab === 'hashtags' && (
                      <div className="space-y-4">
                        <div className="flex items-center justify-between px-1">
                          <span className="font-mono text-[9px] uppercase tracking-wider font-extrabold text-amber-900 dark:text-amber-400 flex items-center gap-1.5">
                            <TrendingUp size={12} className="text-amber-600 animate-pulse" />
                            Trending Hashtags Volume & Activity
                          </span>
                          <span className="font-mono text-[8px] uppercase tracking-widest text-[#8a8172] dark:text-zinc-400">
                            Live 24h
                          </span>
                        </div>

                        <HashtagTrendSection
                          hashtags={extractedHashtags}
                          searchQuery={searchPageQuery}
                          onSelectHashtag={(tag) => {
                            handleExecuteSearch(tag);
                            setSearchSubTab('posts');
                          }}
                        />
                      </div>
                    )}

                    {/* Portfolios results list */}
                    {searchSubTab === 'portfolios' && (
                      <div className="space-y-4">
                        {matchedCreators.length === 0 ? (
                          <div className="py-12 text-center text-[#8a8172] dark:text-zinc-400 font-mono text-xs border border-dashed border-[#ebdcca] dark:border-zinc-800 rounded-3xl bg-[#ebdcca]/5 dark:bg-zinc-900/50">
                            No portfolios match your search.
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {matchedCreators.map((creator) => {
                              const username = `@${creator.name.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
                              const badge = creator.badgeNumber || 'BD-XX-XXX-XX';
                              return (
                                <div 
                                  key={creator.id} 
                                  onClick={() => loadCreatorProfile(creator.id)}
                                  className="p-4 bg-white dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-2xl flex flex-col gap-3 hover:border-[#cfcac0] dark:hover:border-zinc-600 transition-all cursor-pointer group shadow-3xs text-left"
                                >
                                  <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-full border border-[#ebdcca] dark:border-zinc-700 bg-[#ebdcca]/20 dark:bg-zinc-800 overflow-hidden flex items-center justify-center shrink-0">
                                      {creator.avatarUrl ? (
                                        <img src={creator.avatarUrl || null} alt={creator.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                      ) : (
                                        <User className="text-amber-800 dark:text-amber-400" size={16} />
                                      )}
                                    </div>
                                    <div className="min-w-0">
                                      <h4 className="font-sans font-bold text-xs text-[#3a342a] dark:text-zinc-100 truncate group-hover:text-amber-800 dark:group-hover:text-amber-400 transition-colors">
                                        {creator.name}
                                      </h4>
                                      <p className="font-mono text-[7px] text-[#8a8172] dark:text-zinc-400 uppercase tracking-wider truncate">
                                        {username}
                                      </p>
                                    </div>
                                  </div>
                                  <div className="flex flex-col gap-1 border-t border-[#ebdcca]/40 dark:border-zinc-800 pt-2">
                                    <span className="font-mono text-[7px] bg-[#ebdcca]/30 dark:bg-zinc-800 text-amber-900 dark:text-amber-300 px-2 py-0.5 rounded-sm self-start font-bold uppercase tracking-wider">
                                      ID: {badge}
                                    </span>
                                    <p className="text-[9px] text-[#5c5446] dark:text-zinc-400 font-sans line-clamp-1 italic">
                                      "{creator.tagline || 'No tagline set'}"
                                    </p>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Posts results list */}
                    {searchSubTab === 'posts' && (
                      <div className="space-y-4">
                        {matchedPosts.length === 0 ? (
                          <div className="py-12 text-center text-[#8a8172] dark:text-zinc-400 font-mono text-xs border border-dashed border-[#ebdcca] dark:border-zinc-800 rounded-3xl bg-[#ebdcca]/5 dark:bg-zinc-900/50">
                            No posts match your search.
                          </div>
                        ) : (
                          <div className="space-y-3">
                            {matchedPosts.map((post) => {
                              const authorBadge = post.creator?.badgeNumber || 'BD-XX-XXX-XX';
                              return (
                                <div 
                                  key={post.id} 
                                  onClick={() => {
                                    setActiveView('feed');
                                    setFeedSubTab('feed');
                                    setActiveCommentsPost(post);
                                    showToast(`Viewing feed post by ${post.creator?.name}`);
                                  }}
                                  className="p-4 bg-white dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-2xl hover:border-[#cfcac0] dark:hover:border-zinc-600 transition-all cursor-pointer space-y-2 shadow-3xs text-left"
                                >
                                  <div className="flex items-start justify-between">
                                    <div className="flex flex-col text-left">
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <span className="font-sans font-bold text-[10px] text-[#3a342a] dark:text-zinc-100">{post.creator?.name}</span>
                                        <span className="font-mono text-[7px] text-amber-900 dark:text-amber-300 bg-[#ebdcca]/35 dark:bg-zinc-800 px-1.5 py-0.25 rounded-md font-bold">{formatCreditCardStyle(authorBadge)}</span>
                                      </div>
                                      <span className="font-mono text-[7.5px] text-[#8a8172] dark:text-zinc-400 mt-0.5">{post.date || new Date(post.createdTime || Date.now()).toLocaleDateString()}</span>
                                    </div>
                                  </div>
                                  {post.title && <h4 className="font-sans font-bold text-xs text-[#3a342a] dark:text-zinc-100">{post.title}</h4>}
                                  <p className="text-[10px] text-[#5c5446] dark:text-zinc-300 font-sans line-clamp-2 leading-relaxed">
                                    {post.content}
                                  </p>
                                  {post.tags && post.tags.length > 0 && (
                                    <div className="flex flex-wrap gap-1 pt-1">
                                      {post.tags.map((t: string) => (
                                        <span key={t} className="font-mono text-[7px] text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-zinc-800 px-1.5 py-0.25 rounded-md font-semibold">
                                          #{t}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Reels results list */}
                    {searchSubTab === 'reels' && (
                      <div className="space-y-4">
                        {matchedReels.length === 0 ? (
                          <div className="py-12 text-center text-[#8a8172] dark:text-zinc-400 font-mono text-xs border border-dashed border-[#ebdcca] dark:border-zinc-800 rounded-3xl bg-[#ebdcca]/5 dark:bg-zinc-900/50">
                            No reels match your search.
                          </div>
                        ) : (
                          <div className="grid grid-cols-3 gap-3">
                            {matchedReels.map((reel) => {
                              const origIndex = allReels.findIndex(r => r.id === reel.id);
                              return (
                                <div
                                  key={reel.id}
                                  onClick={() => {
                                    if (origIndex !== -1) {
                                      setActiveCategory(reel.category);
                                      setActiveView('explore');
                                      setSearchSubTab('reels');
                                      setActiveImmersiveReelIndex(filteredReels.findIndex(r => r.id === reel.id) !== -1 ? filteredReels.findIndex(r => r.id === reel.id) : 0);
                                      showToast(`Playing Reel: ${reel.title}`);
                                    }
                                  }}
                                  className="aspect-[3/4.5] relative rounded-2xl overflow-hidden border border-[#ebdcca] dark:border-zinc-800 bg-[#ebdcca]/10 cursor-pointer group shadow-3xs hover:border-[#cfcac0] dark:hover:border-zinc-600 transition-all text-left"
                                >
                                  <img 
                                    src={reel.imageUrl || null} 
                                    alt={reel.title} 
                                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                                    referrerPolicy="no-referrer"
                                  />
                                  <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />
                                  <div className="absolute bottom-2 left-2 right-2 space-y-0.5">
                                    <p className="font-sans font-bold text-[8px] text-[#f4f1ea] leading-tight truncate group-hover:text-amber-300 transition-colors">
                                      {reel.title}
                                    </p>
                                    <p className="font-mono text-[6px] text-[#ebdcca]/70 uppercase tracking-wide truncate">
                                      by {reel.creatorName}
                                    </p>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}

                  </div>
                );
              })()}

            </div>
          </motion.div>
        ) : activeView === 'explore' ? (
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            className="max-w-xl mx-auto space-y-6"
          >
            {/* Feature Hub (ports from surveyed source folders) */}
            <div className="bg-[#fcfaf4] dark:bg-zinc-900 border-2 border-[#ebdcca] dark:border-zinc-800 rounded-[2.5rem] p-5 shadow-xs">
              <div className="flex items-center gap-2 mb-3">
                <Wand2 size={14} className="text-amber-800 dark:text-amber-400" />
                <h3 className="font-display font-bold text-sm text-[#3a342a] dark:text-zinc-100 tracking-tight">Feature Hub</h3>
                <span className="ml-auto font-mono text-[8px] uppercase tracking-widest text-[#8a8172]">Discover</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setShowCreatorStudio(true)}
                  className="flex flex-col items-start gap-1 p-3 rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-white/50 dark:bg-zinc-950/40 hover:border-amber-400 hover:bg-amber-50/40 dark:hover:bg-zinc-800/60 transition-all text-left"
                >
                  <Video size={16} className="text-amber-800 dark:text-amber-400" />
                  <span className="font-bold text-[11px] text-[#3a342a] dark:text-zinc-100">Creator Studio</span>
                  <span className="text-[9px] text-[#8a8172]">Channels & long-form video</span>
                </button>
                <button
                  onClick={() => setShowGeohash(true)}
                  className="flex flex-col items-start gap-1 p-3 rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-white/50 dark:bg-zinc-950/40 hover:border-amber-400 hover:bg-amber-50/40 dark:hover:bg-zinc-800/60 transition-all text-left"
                >
                  <Globe size={16} className="text-amber-800 dark:text-amber-400" />
                  <span className="font-bold text-[11px] text-[#3a342a] dark:text-zinc-100">Nearby People</span>
                  <span className="text-[9px] text-[#8a8172]">Find neighbors (privacy-safe)</span>
                </button>
                <button
                  onClick={() => setShowTimeCapsuleComposer(true)}
                  className="flex flex-col items-start gap-1 p-3 rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-white/50 dark:bg-zinc-950/40 hover:border-amber-400 hover:bg-amber-50/40 dark:hover:bg-zinc-800/60 transition-all text-left"
                >
                  <Lock size={16} className="text-amber-800 dark:text-amber-400" />
                  <span className="font-bold text-[11px] text-[#3a342a] dark:text-zinc-100">Time Capsule</span>
                  <span className="text-[9px] text-[#8a8172]">Encrypted message to the future</span>
                </button>
                <button
                  onClick={() => setShowRandomDm(true)}
                  className="flex flex-col items-start gap-1 p-3 rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-white/50 dark:bg-zinc-950/40 hover:border-amber-400 hover:bg-amber-50/40 dark:hover:bg-zinc-800/60 transition-all text-left"
                >
                  <MessageSquare size={16} className="text-amber-800 dark:text-amber-400" />
                  <span className="font-bold text-[11px] text-[#3a342a] dark:text-zinc-100">Random Chat</span>
                  <span className="text-[9px] text-[#8a8172]">Text a random stranger</span>
                </button>
                <button
                  onClick={() => {
                    setAwaySummaryItems(
                      notifications.slice(0, 25).map((n: any) => ({
                        kind: n.type || 'update',
                        text: n.text || n.message || 'New activity in your feed',
                        time: n.createdAt || Date.now(),
                      }))
                    );
                    setShowAwaySummary(true);
                  }}
                  className="flex flex-col items-start gap-1 p-3 rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-white/50 dark:bg-zinc-950/40 hover:border-amber-400 hover:bg-amber-50/40 dark:hover:bg-zinc-800/60 transition-all text-left"
                >
                  <Sparkles size={16} className="text-amber-800 dark:text-amber-400" />
                  <span className="font-bold text-[11px] text-[#3a342a] dark:text-zinc-100">Away Summary</span>
                  <span className="text-[9px] text-[#8a8172]">AI digest of what you missed</span>
                </button>
                <button
                  onClick={() => setShowStreamAdmin(true)}
                  className="flex flex-col items-start gap-1 p-3 rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-white/50 dark:bg-zinc-950/40 hover:border-amber-400 hover:bg-amber-50/40 dark:hover:bg-zinc-800/60 transition-all text-left"
                >
                  <Radio size={16} className="text-amber-800 dark:text-amber-400" />
                  <span className="font-bold text-[11px] text-[#3a342a] dark:text-zinc-100">Stream Admin</span>
                  <span className="text-[9px] text-[#8a8172]">Manage Stream API keys</span>
                </button>
                <button
                  onClick={() => setShowRankingDemo(true)}
                  className="flex flex-col items-start gap-1 p-3 rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-white/50 dark:bg-zinc-950/40 hover:border-amber-400 hover:bg-amber-50/40 dark:hover:bg-zinc-800/60 transition-all text-left"
                >
                  <BarChart3 size={16} className="text-amber-800 dark:text-amber-400" />
                  <span className="font-bold text-[11px] text-[#3a342a] dark:text-zinc-100">Ranking Demo</span>
                  <span className="text-[9px] text-[#8a8172]">Interactive feed-rank engine</span>
                </button>
                <button
                  onClick={() => setIsRtl(v => !v)}
                  className="flex flex-col items-start gap-1 p-3 rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-white/50 dark:bg-zinc-950/40 hover:border-amber-400 hover:bg-amber-50/40 dark:hover:bg-zinc-800/60 transition-all text-left"
                >
                  <Languages size={16} className="text-amber-800 dark:text-amber-400" />
                  <span className="font-bold text-[11px] text-[#3a342a] dark:text-zinc-100">RTL Layout</span>
                  <span className="text-[9px] text-[#8a8172]">{isRtl ? 'Currently RTL — tap for LTR' : 'Currently LTR — tap for RTL'}</span>
                </button>
                <button
                  onClick={() => setShowNewFeaturesHub(true)}
                  className="flex flex-col items-start gap-1 p-3 rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-white/50 dark:bg-zinc-950/40 hover:border-amber-400 hover:bg-amber-50/40 dark:hover:bg-zinc-800/60 transition-all text-left"
                >
                  <Sparkles size={16} className="text-amber-800 dark:text-amber-400" />
                  <span className="font-bold text-[11px] text-[#3a342a] dark:text-zinc-100">New Features</span>
                  <span className="text-[9px] text-[#8a8172]">Ocean 109+ — whiteboard, media search</span>
                </button>
              </div>
            </div>

            {/* Main sketch-style enclosing card container - cleaned and blank */}
            <div className="bg-[#fcfaf4] dark:bg-zinc-900 border-2 border-[#ebdcca] dark:border-zinc-800 rounded-[2.5rem] p-6 md:p-8 space-y-6 shadow-xs relative overflow-hidden">
              
              {/* @ Search Input Element with drop-down overlay on focus */}
              <div className="relative search-container">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleExecuteSearch(exploreSearchQuery);
                  }}
                  className="relative"
                >
                  <input
                    type="text"
                    value={exploreSearchQuery}
                    onFocus={() => setIsSearchFocused(true)}
                    onChange={(e) => setExploreSearchQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleExecuteSearch(exploreSearchQuery);
                      }
                    }}
                    placeholder="@ Search creators, topics, or ID like BD 44 230... (Press Enter)"
                    className="w-full bg-[#fbf9f4] dark:bg-zinc-950 border-2 border-[#ebdcca] dark:border-zinc-800 focus:border-[#cfcac0] dark:focus:border-zinc-600 rounded-2xl py-3 px-5 pl-11 pr-10 focus:outline-none font-mono text-xs text-[#3a342a] dark:text-zinc-100 placeholder-[#8a8172]/60 dark:placeholder-zinc-500 transition-all shadow-inner"
                  />
                  <button
                    type="submit"
                    className="absolute left-3 top-1/2 -translate-y-1/2 p-1 text-[#8a8172] dark:text-zinc-400 hover:text-amber-800 dark:hover:text-amber-400"
                    title="Submit Search"
                  >
                    <Search size={13} />
                  </button>
                  {exploreSearchQuery && (
                    <button 
                      type="button"
                      onClick={() => setExploreSearchQuery('')}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-[#8a8172] hover:text-[#3a342a] dark:text-zinc-400 dark:hover:text-white focus:outline-none"
                    >
                      <X size={14} />
                    </button>
                  )}
                </form>

                <button
                  onClick={() => setShowVisualSearch(true)}
                  className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-[#ebdcca] dark:border-zinc-800 bg-[#fcfaf4] dark:bg-zinc-900 text-[9px] font-mono uppercase tracking-widest text-[#3a342a] dark:text-zinc-100 hover:border-amber-400 hover:bg-amber-50/40 dark:hover:bg-zinc-800/60 transition-all"
                >
                  <Search size={10} className="text-amber-800 dark:text-amber-400" />
                  Visual Search
                  <span className="text-[7px] text-[#8a8172]">AI</span>
                </button>

                {/* Dropdown for suggestions & trending items */}
                {isSearchFocused && (
                  <>
                    <div 
                      className="fixed inset-0 z-40 bg-transparent" 
                      onClick={() => setIsSearchFocused(false)} 
                    />
                    <motion.div
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="absolute left-0 right-0 top-full mt-2 bg-[#fcfaf4] dark:bg-zinc-900 border-2 border-[#ebdcca] dark:border-zinc-800 rounded-2xl p-4 shadow-xl z-50 space-y-3 font-sans text-xs text-[#3a342a] dark:text-zinc-100"
                    >
                      {/* Search History Section */}
                      {searchHistory.length > 0 && (
                        <div className="border-b border-[#ebdcca]/50 dark:border-zinc-800 pb-2 space-y-1.5">
                          <div className="flex items-center justify-between text-[9px] font-mono uppercase font-bold text-[#8a8172] dark:text-zinc-400">
                            <span className="flex items-center gap-1">
                              <Clock size={10} className="text-amber-700 dark:text-amber-400" />
                              Recent Search History
                            </span>
                            <button
                              onClick={handleClearSearchHistory}
                              className="text-rose-700 dark:text-rose-400 hover:underline text-[8px]"
                            >
                              Clear History
                            </button>
                          </div>
                          <div className="flex flex-wrap gap-1.5 pt-1">
                            {searchHistory.map((term, idx) => (
                              <button
                                key={idx}
                                onClick={() => handleExecuteSearch(term)}
                                className="font-mono text-[9px] bg-amber-50/80 dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 hover:bg-amber-100 dark:hover:bg-zinc-700 text-[#3a342a] dark:text-zinc-200 px-2.5 py-1 rounded-lg transition-all"
                              >
                                {term}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="flex items-center justify-between border-b border-[#ebdcca]/50 dark:border-zinc-800 pb-2">
                        <span className="font-mono text-[9px] uppercase font-bold tracking-wider text-[#8a8172] dark:text-zinc-400 flex items-center gap-1.5">
                          <TrendingUp size={10} className="text-amber-600 animate-pulse" />
                          Registry Index Suggestions ({user?.countryCode || 'BD'})
                        </span>
                        <button 
                          onClick={() => setIsSearchFocused(false)}
                          className="font-mono text-[8px] uppercase tracking-wider font-bold text-[#8a8172] dark:text-zinc-400 hover:text-[#3a342a] dark:hover:text-zinc-100 bg-[#ebdcca]/25 dark:bg-zinc-800 px-2 py-0.5 rounded-md"
                        >
                          Close
                        </button>
                      </div>

                      {/* Search matches / Suggestions */}
                      {!exploreSearchQuery ? (
                        <div className="space-y-3">
                          <div className="flex items-center justify-between mb-1 pb-2 border-b border-[#ebdcca]/30 dark:border-zinc-800">
                            <span className="font-mono text-[8.5px] uppercase font-extrabold text-amber-800 dark:text-amber-400 tracking-wider flex items-center gap-1.5">
                              <TrendingUp size={12} className="text-amber-700 dark:text-amber-400 animate-pulse" />
                              Most Searched in {user?.countryCode || 'BD'} Node (Last 24 Hours)
                            </span>
                            <span className="bg-amber-900/10 dark:bg-amber-400/10 text-amber-900 dark:text-amber-300 text-[8px] px-2 py-0.5 rounded-md font-mono uppercase tracking-widest font-bold">
                              24h Stream
                            </span>
                          </div>
                          <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                            {realTopSearches.slice(0, 10).map((item, idx) => (
                              <button
                                key={idx}
                                onMouseDown={() => {
                                  setExploreSearchQuery(item.term);
                                  setIsSearchFocused(false);
                                }}
                                className="w-full text-left bg-[#fbf9f4] dark:bg-zinc-950 hover:bg-[#ebdcca]/45 dark:hover:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-800 hover:border-[#cfcac0] dark:hover:border-zinc-700 rounded-xl px-4 py-2.5 text-xs font-mono transition-all text-[#3a342a] dark:text-zinc-100 flex items-center justify-between group"
                              >
                                <div className="flex items-center gap-2">
                                  <span className="text-amber-700/60 dark:text-amber-400/60 font-bold">#{idx + 1}</span>
                                  <span className="font-bold text-[#3a342a] dark:text-zinc-100 group-hover:text-amber-900 dark:group-hover:text-amber-400">{item.term}</span>
                                </div>
                                <div className="flex items-center gap-1.5 font-sans font-semibold text-[10px] text-[#8a8172] dark:text-zinc-400">
                                  <span className="bg-[#ebdcca]/30 dark:bg-zinc-800 px-2 py-0.5 rounded-md font-mono text-[10px] text-amber-800 dark:text-amber-300">
                                    {item.count.toLocaleString()} searches
                                  </span>
                                  <span className="text-emerald-600 dark:text-emerald-400">▲</span>
                                </div>
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-4 max-h-80 overflow-y-auto pr-1">
                          {/* Suggested Accounts based on typing */}
                          {(() => {
                            const normQ = exploreSearchQuery.toLowerCase().replace(/[^a-z0-9]/g, '');
                            const accounts = creatorsList.filter(c => {
                              const cleanBadge = (c.badgeNumber || '').toLowerCase().replace(/[^a-z0-9]/g, '');
                              return (
                                c.name.toLowerCase().includes(exploreSearchQuery.toLowerCase()) ||
                                cleanBadge.includes(normQ) ||
                                `@${c.name.toLowerCase().replace(/[^a-z0-9]/g, '')}`.includes(exploreSearchQuery.toLowerCase())
                              );
                            });

                            if (accounts.length > 0) {
                              return (
                                <div className="space-y-2">
                                  <span className="font-mono text-[8px] uppercase font-bold text-[#8a8172] dark:text-zinc-400 block border-b border-[#ebdcca]/40 dark:border-zinc-800 pb-1">
                                    Suggested Accounts
                                  </span>
                                  <div className="space-y-1">
                                    {accounts.map(c => {
                                      const initials = c.name.split(' ').map((n: string) => n.charAt(0)).join('').toUpperCase().slice(0, 2);
                                      const handle = c.badgeNumber ? formatCreditCardStyle(c.badgeNumber) : 'BD-00-000-00';
                                      const isBadgeMatch = c.badgeNumber && c.badgeNumber.toLowerCase().replace(/[^a-z0-9]/g, '').includes(normQ);

                                      return (
                                        <div 
                                          key={c.id} 
                                          onMouseDown={() => {
                                            loadCreatorProfile(c.id);
                                            setIsSearchFocused(false);
                                          }}
                                          className="flex items-center justify-between p-2 hover:bg-[#ebdcca]/30 dark:hover:bg-zinc-800/80 rounded-lg cursor-pointer transition-colors"
                                        >
                                          <div className="flex items-center gap-2">
                                            <div className="w-7 h-7 rounded-full bg-[#ebdcca]/30 dark:bg-zinc-800 flex items-center justify-center overflow-hidden border border-[#ebdcca] dark:border-zinc-700">
                                              {c.avatarUrl ? (
                                                <img src={c.avatarUrl || null} alt={c.name} className="w-full h-full object-cover" />
                                              ) : (
                                                <span className="text-[9px] font-mono text-[#8a8172] dark:text-zinc-400 font-bold">{initials}</span>
                                              )}
                                            </div>
                                            <div>
                                              <p className="font-bold text-[10px] text-[#3a342a] dark:text-zinc-100 leading-none">{c.name}</p>
                                              <p className="text-[8px] font-mono text-amber-800 dark:text-amber-400 font-bold mt-0.5">{handle}</p>
                                            </div>
                                          </div>
                                          <div className="text-right">
                                            <span className={`font-mono text-[8px] px-1.5 py-0.5 rounded ${isBadgeMatch ? 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 font-bold' : 'bg-[#ebdcca]/30 dark:bg-zinc-800 text-[#8a8172] dark:text-zinc-400'}`}>
                                              {isBadgeMatch ? 'MATCH' : 'MEMBER'}
                                            </span>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              );
                            }
                            return null;
                          })()}

                          {/* Direct ID Match Section */}
                          {(() => {
                            const hasDigits = /\d/.test(exploreSearchQuery);
                            const normQ = exploreSearchQuery.toLowerCase().replace(/[^a-z0-9]/g, '');
                            const matchedAccount = creatorsList.find(c => {
                              const cleanBadge = (c.badgeNumber || '').toLowerCase().replace(/[^a-z0-9]/g, '');
                              return cleanBadge === normQ || (cleanBadge.length > 3 && cleanBadge.includes(normQ));
                            });

                            if (hasDigits && matchedAccount) {
                              return (
                                <div className="p-2.5 bg-emerald-500/10 dark:bg-emerald-950/30 border border-emerald-500/20 dark:border-emerald-500/30 rounded-xl space-y-1">
                                  <div className="flex items-center gap-1.5 text-emerald-800 dark:text-emerald-300 font-bold text-[9px] font-mono uppercase">
                                    <Check size={10} />
                                    Direct Account ID Match Found
                                  </div>
                                  <div className="flex items-center justify-between gap-2">
                                    <p className="text-[10px] text-[#3a342a] dark:text-zinc-200 truncate">
                                      Owner: <span className="font-bold">{matchedAccount.name}</span> (<span className="font-mono text-emerald-700 dark:text-emerald-400 font-bold">{formatCreditCardStyle(matchedAccount.badgeNumber)}</span>)
                                    </p>
                                    <button
                                      onMouseDown={() => {
                                        loadCreatorProfile(matchedAccount.id);
                                        setIsSearchFocused(false);
                                      }}
                                      className="font-mono text-[8px] uppercase tracking-wider font-bold bg-emerald-700 dark:bg-emerald-600 hover:bg-emerald-800 dark:hover:bg-emerald-500 text-white px-2.5 py-1 rounded-lg transition-colors shrink-0"
                                    >
                                      View Portfolio
                                    </button>
                                  </div>
                                </div>
                              );
                            }
                            return null;
                          })()}

                          {/* Autocomplete Suggestion Terms matching words typed */}
                          {(() => {
                            const matchedTerms = realTopSearches.filter(item => 
                              item.term.toLowerCase().includes(exploreSearchQuery.toLowerCase())
                            );

                            if (matchedTerms.length > 0) {
                              return (
                                <div className="space-y-2">
                                  <span className="font-mono text-[8px] uppercase font-bold text-[#8a8172] dark:text-zinc-400 block border-b border-[#ebdcca]/40 dark:border-zinc-800 pb-1">
                                    Suggested Search Terms
                                  </span>
                                  <div className="space-y-1.5">
                                    {matchedTerms.map((item, idx) => (
                                      <button
                                        key={idx}
                                        onMouseDown={() => {
                                          setExploreSearchQuery(item.term);
                                          setIsSearchFocused(false);
                                        }}
                                        className="w-full text-left bg-[#fbf9f4]/60 dark:bg-zinc-950/60 hover:bg-[#ebdcca]/30 dark:hover:bg-zinc-800 border border-[#ebdcca]/70 dark:border-zinc-800 rounded-xl px-3 py-2 text-xs font-mono transition-all text-[#3a342a] dark:text-zinc-100 flex items-center justify-between group"
                                      >
                                        <div className="flex items-center gap-1.5">
                                          <Search size={10} className="text-[#8a8172] dark:text-zinc-400 group-hover:text-amber-800 dark:group-hover:text-amber-400" />
                                          <span className="font-bold text-[#3a342a] dark:text-zinc-100 group-hover:text-amber-950 dark:group-hover:text-amber-300">{item.term}</span>
                                        </div>
                                        <span className="bg-[#ebdcca]/20 dark:bg-zinc-800 text-[#8a8172] dark:text-zinc-400 text-[9px] px-2 py-0.5 rounded-md font-mono">
                                          {item.count.toLocaleString()} searches
                                        </span>
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              );
                            }
                            return null;
                          })()}

                        </div>
                      )}
                    </motion.div>
                  </>
                )}
              </div>

              {!exploreSearchQuery ? (
                <div className="py-24 text-center">
                  <p className="font-mono text-[10px] text-[#8a8172]/40 uppercase tracking-widest font-bold">Explore Registry Archive</p>
                </div>
              ) : (
                <>
                  {/* UNIFIED COMPREHENSIVE SEARCH VIEW */}
                  <div className="space-y-6">
                    {(() => {
                      const qRaw = exploreSearchQuery.toLowerCase().trim();
                      const qClean = qRaw.replace(/[^a-z0-9]/g, '');
                      const qDigits = qRaw.replace(/[^0-9]/g, '');

                      // 1. Filter Portfolios / Creators
                      const matchedCreators = creatorsList.filter(creator => {
                        const name = creator.name.toLowerCase();
                        const username = (creator.username || '').toLowerCase();
                        const location = (creator.location || '').toLowerCase();
                        const badge = (creator.badgeNumber || '').toLowerCase();
                        const cleanBadge = badge.replace(/[^a-z0-9]/g, '');
                        const digitsBadge = badge.replace(/[^0-9]/g, '');
                        
                        if (name.includes(qRaw) || username.includes(qRaw) || location.includes(qRaw)) return true;
                        if (cleanBadge.includes(qClean) || qClean.includes(cleanBadge)) return true;
                        if (qDigits && (digitsBadge.includes(qDigits) || qDigits.includes(digitsBadge))) return true;
                        
                        return false;
                      });

                      // 2. Filter Feed Posts
                      const matchedPosts = feedList.filter(post => {
                        const content = (post.content || '').toLowerCase();
                        const title = (post.title || '').toLowerCase();
                        const creatorName = (post.creator?.name || '').toLowerCase();
                        const creatorBadge = (post.creator?.badgeNumber || '').toLowerCase();
                        const cleanBadge = creatorBadge.replace(/[^a-z0-9]/g, '');
                        const digitsBadge = creatorBadge.replace(/[^0-9]/g, '');
                        
                        const tags = Array.isArray(post.tags) ? post.tags.map((t: string) => t.toLowerCase()) : [];
                        const hasTagMatch = tags.some((t: string) => t.includes(qRaw) || qRaw.includes(t));
                        
                        return (
                          content.includes(qRaw) ||
                          title.includes(qRaw) ||
                          creatorName.includes(qRaw) ||
                          hasTagMatch ||
                          (qClean && cleanBadge.includes(qClean)) ||
                          (qDigits && digitsBadge.includes(qDigits))
                        );
                      });

                      // 3. Filter Reels
                      const matchedReels = allReels.filter(reel => {
                        const title = (reel.title || '').toLowerCase();
                        const caption = (reel.caption || '').toLowerCase();
                        const category = (reel.category || '').toLowerCase();
                        const creatorName = (reel.creatorName || '').toLowerCase();
                        
                        return (
                          title.includes(qRaw) ||
                          caption.includes(qRaw) ||
                          category.includes(qRaw) ||
                          creatorName.includes(qRaw)
                        );
                      });

                      return (
                        <div className="space-y-6">
                          {/* Search Results Header */}
                          <div className="flex items-center justify-between px-1 border-b border-[#ebdcca]/60 dark:border-zinc-800 pb-3">
                            <div className="flex items-center gap-2">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />
                              <span className="font-sans font-bold text-xs text-[#3a342a] dark:text-zinc-100 uppercase tracking-wide">SECURE SEARCH INDEX</span>
                            </div>
                            <span className="font-mono text-[8px] text-[#8a8172] dark:text-zinc-400 uppercase tracking-wider">Unified Results</span>
                          </div>

                          {/* Search Tabs */}
                          <div className="flex gap-1.5 overflow-x-auto pb-1.5 scrollbar-none border-b border-[#ebdcca]/40 dark:border-zinc-800">
                            {[
                              { id: 'portfolios', label: 'Portfolios', count: matchedCreators.length, icon: '👥' },
                              { id: 'posts', label: 'Feed Posts', count: matchedPosts.length, icon: '📝' },
                              { id: 'reels', label: 'Reels', count: matchedReels.length, icon: '🎬' }
                            ].map(tab => {
                              const isActive = searchSubTab === tab.id;
                              return (
                                <button
                                  key={tab.id}
                                  onClick={() => setSearchSubTab(tab.id as any)}
                                  className={`font-mono text-[10px] uppercase font-bold py-2 px-3.5 rounded-xl transition-all whitespace-nowrap flex items-center gap-1.5 ${
                                    isActive 
                                      ? 'bg-amber-950 text-[#f4f1ea] dark:bg-amber-600 dark:text-zinc-950' 
                                      : 'border border-[#cfcac0]/60 dark:border-zinc-800 bg-[#fbf9f4] dark:bg-zinc-800 hover:bg-[#ebdcca]/30 dark:hover:bg-zinc-700 text-[#8a8172] dark:text-zinc-300'
                                  }`}
                                >
                                  <span>{tab.icon}</span>
                                  <span>{tab.label}</span>
                                  <span className={`text-[8px] px-1.5 py-0.25 rounded-md ${isActive ? 'bg-amber-900 text-white dark:bg-amber-500 dark:text-zinc-950' : 'bg-[#ebdcca]/40 text-[#5c5446] dark:bg-zinc-900 dark:text-zinc-300'}`}>
                                    {tab.count}
                                  </span>
                                </button>
                              );
                            })}
                          </div>

                          {/* Render selected Search Tab Content */}
                          {searchSubTab === 'portfolios' && (
                            <div className="space-y-4">
                              {matchedCreators.length === 0 ? (
                                <div className="py-12 text-center text-[#8a8172] dark:text-zinc-400 font-mono text-xs border border-dashed border-[#ebdcca] dark:border-zinc-800 rounded-3xl bg-[#ebdcca]/5 dark:bg-zinc-900/50">
                                  No portfolios found matching "{exploreSearchQuery}"
                                </div>
                              ) : (
                                <div className="grid grid-cols-3 gap-y-7 gap-x-4">
                                  {matchedCreators.map((creator) => {
                                    const username = `@${creator.name.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
                                    const initials = creator.name.split(' ').map((n: string) => n.charAt(0)).join('').toUpperCase().slice(0, 2);

                                    return (
                                      <motion.div
                                        key={creator.id}
                                        className="flex flex-col items-center text-center space-y-2 group cursor-pointer"
                                        onClick={() => {
                                          loadCreatorProfile(creator.id);
                                        }}
                                        whileHover={{ y: -3 }}
                                      >
                                        <div className="relative">
                                          <div className="w-20 h-20 md:w-24 md:h-24 rounded-full border-2 border-[#ebdcca] dark:border-zinc-700 bg-[#ebdcca]/25 dark:bg-zinc-800 flex items-center justify-center overflow-hidden hover:border-[#cfcac0] dark:hover:border-zinc-500 hover:shadow-xs transition-all duration-300 relative group-hover:scale-105">
                                            {creator.avatarUrl ? (
                                              <img
                                                src={creator.avatarUrl || null}
                                                alt={creator.name}
                                                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                                                referrerPolicy="no-referrer"
                                              />
                                            ) : (
                                              <span className="font-mono font-bold text-xs text-[#8a8172] dark:text-zinc-400 tracking-wider">
                                                {initials || "PF"}
                                              </span>
                                            )}
                                            <span className="absolute bottom-1 right-1 w-3 h-3 rounded-full bg-emerald-500 border-2 border-[#fcfaf4] dark:border-zinc-900 shadow-xs" />
                                          </div>
                                        </div>

                                        <div className="space-y-0.5 w-full">
                                          <p className="font-sans font-bold text-[10px] text-[#3a342a] dark:text-zinc-100 tracking-tight truncate group-hover:text-amber-800 dark:group-hover:text-amber-400 transition-colors">
                                            {creator.name}
                                          </p>
                                          <p className="font-mono text-[7px] text-[#8a8172] dark:text-zinc-400 uppercase tracking-wide truncate group-hover:text-[#3a342a] dark:group-hover:text-zinc-200 transition-colors font-bold mb-1">
                                            {username}
                                          </p>
                                          {creator.badgeNumber && (
                                            <span className="inline-block font-mono text-[7px] bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 px-1.5 py-0.5 rounded font-bold">
                                              {formatCreditCardStyle(creator.badgeNumber)}
                                            </span>
                                          )}
                                        </div>
                                      </motion.div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          )}

                          {searchSubTab === 'posts' && (
                            <div className="space-y-4">
                              {matchedPosts.length === 0 ? (
                                <div className="py-12 text-center text-[#8a8172] dark:text-zinc-400 font-mono text-xs border border-dashed border-[#ebdcca] dark:border-zinc-800 rounded-3xl bg-[#ebdcca]/5 dark:bg-zinc-900/50">
                                  No feed posts match your search query.
                                </div>
                              ) : (
                                <div className="space-y-3">
                                  {matchedPosts.map((post) => {
                                    const creatorInitials = (post.creator?.name || '').split(' ').filter(Boolean).map((n: string) => n.charAt(0)).join('').toUpperCase().slice(0, 2) || 'AN';
                                    return (
                                      <div 
                                        key={post.id} 
                                        className="bg-white dark:bg-zinc-900 border-2 border-[#ebdcca]/50 dark:border-zinc-800 rounded-2xl p-4 space-y-2 hover:border-[#cfcac0] dark:hover:border-zinc-700 transition-colors shadow-xs"
                                      >
                                        <div className="flex items-center justify-between">
                                          <div 
                                            onClick={() => loadCreatorProfile(post.creator?.id || post.anonymousCreatorId)}
                                            className="flex items-center gap-2 cursor-pointer group"
                                          >
                                            <div className="w-7 h-7 rounded-full bg-[#ebdcca]/40 dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 overflow-hidden flex items-center justify-center shrink-0">
                                              {post.creator?.avatarUrl ? (
                                                <img src={post.creator.avatarUrl || null} alt={post.creator.name} className="w-full h-full object-cover" />
                                              ) : (
                                                <span className="text-[9px] font-mono font-bold text-[#8a8172] dark:text-zinc-400">{creatorInitials}</span>
                                              )}
                                            </div>
                                            <div>
                                              <p className="font-bold text-[10px] text-[#3a342a] dark:text-zinc-100 leading-none group-hover:text-amber-800 dark:group-hover:text-amber-400 transition-colors">
                                                {post.isAnonymous ? 'Anonymous Member' : post.creator?.name}
                                              </p>
                                              <p className="text-[8px] font-mono text-[#8a8172] dark:text-zinc-400 mt-0.5">
                                                {post.isAnonymous ? 'ENCRYPTED ID' : (post.creator?.badgeNumber ? formatCreditCardStyle(post.creator.badgeNumber) : 'BD-00-000-00')}
                                              </p>
                                              <p className="text-[7.5px] font-mono text-[#8a8172] dark:text-zinc-400 mt-0.5">
                                                {post.date}
                                              </p>
                                            </div>
                                          </div>
                                        </div>

                                        <div className="space-y-1">
                                          {post.title && (
                                            <h4 className="font-sans font-bold text-xs text-[#3a342a] dark:text-zinc-100">{post.title}</h4>
                                          )}
                                          <p className="font-sans text-xs text-[#5c5446] dark:text-zinc-300 leading-relaxed break-words whitespace-pre-wrap">
                                            {post.content}
                                          </p>
                                        </div>

                                        <div className="flex items-center gap-3 pt-1 border-t border-[#ebdcca]/40 dark:border-zinc-800">
                                          <button
                                            onClick={() => handleLikeFeedPost(post.id)}
                                            className="flex items-center gap-1 font-mono text-[9px] font-bold text-[#8a8172] dark:text-zinc-400 hover:text-red-600 dark:hover:text-red-400 transition-colors cursor-pointer"
                                          >
                                            ❤️ {post.likes || 0}
                                          </button>
                                          <button
                                            onClick={() => setActiveCommentsPost(post)}
                                            className="flex items-center gap-1 font-mono text-[9px] font-bold text-[#8a8172] dark:text-zinc-400 hover:text-[#3a342a] dark:hover:text-zinc-100 transition-colors cursor-pointer"
                                          >
                                            💬 {(post.comments || []).length}
                                          </button>
                                          <button
                                            onClick={() => {
                                              setActiveView('feed');
                                              setFeedSubTab('feed');
                                              setTimeout(() => {
                                                const el = document.getElementById(`post-${post.id}`);
                                                if (el) el.scrollIntoView({ behavior: 'smooth' });
                                              }, 100);
                                            }}
                                            className="ml-auto font-mono text-[8px] font-bold text-amber-950 dark:text-amber-400 hover:underline flex items-center gap-0.5"
                                          >
                                            View in Feed →
                                          </button>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          )}

                          {searchSubTab === 'reels' && (
                            <div className="space-y-4">
                              {matchedReels.length === 0 ? (
                                <div className="py-12 text-center text-[#8a8172] dark:text-zinc-400 font-mono text-xs border border-dashed border-[#ebdcca] dark:border-zinc-800 rounded-3xl bg-[#ebdcca]/5 dark:bg-zinc-900/50">
                                  No reels match your search query.
                                </div>
                              ) : (
                                <div className="grid grid-cols-3 gap-3">
                                  {matchedReels.map((reel) => {
                                    const origIndex = allReels.findIndex(r => r.id === reel.id);
                                    return (
                                      <motion.div
                                        key={reel.id}
                                        whileHover={{ y: -4, scale: 1.02 }}
                                        onClick={() => {
                                          if (origIndex !== -1) {
                                            setActiveCategory(reel.category);
                                            setActiveImmersiveReelIndex(filteredReels.findIndex(r => r.id === reel.id) !== -1 ? filteredReels.findIndex(r => r.id === reel.id) : 0);
                                          }
                                        }}
                                        className="aspect-[3/4.5] relative rounded-2xl overflow-hidden border-2 border-[#ebdcca] dark:border-zinc-800 bg-[#ebdcca]/10 dark:bg-zinc-800/40 cursor-pointer group shadow-xs hover:border-[#cfcac0] dark:hover:border-zinc-600 hover:shadow-md transition-all"
                                      >
                                        <img 
                                          src={reel.imageUrl || null} 
                                          alt={reel.title} 
                                          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                                          referrerPolicy="no-referrer"
                                        />
                                        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />
                                        <div className="absolute top-2 left-2 flex items-center gap-1 bg-[#3a342a]/95 dark:bg-zinc-900/95 backdrop-blur-xs px-1.5 py-0.5 rounded-md border border-[#ebdcca]/20 dark:border-zinc-700/50">
                                          <span className="font-mono text-[5px] text-[#f4f1ea] uppercase tracking-wider font-bold">{reel.category}</span>
                                        </div>
                                        <div className="absolute bottom-2 left-2 right-2 space-y-0.5">
                                          <p className="font-sans font-bold text-[8px] text-[#f4f1ea] leading-tight truncate group-hover:text-amber-300 transition-colors">
                                            {reel.title}
                                          </p>
                                          <p className="font-mono text-[6px] text-[#ebdcca]/70 dark:text-zinc-300/70 uppercase tracking-wide truncate">
                                            by {reel.creatorName}
                                          </p>
                                        </div>
                                      </motion.div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                </>
              )}

              {/* Community features — Events / Q&A / Topics / Studio / Rewards */}
              <CommunitySection
                token={token}
                currentUser={user}
                creatorsList={creatorsList}
                stats={{
                  posts: (user?.profile?.posts || []).length,
                  reels: allReels.length,
                  followers: user?.profile?.followersCount || 0,
                  likes: 0,
                  comments: 0,
                }}
              />

            </div>
          </motion.div>
        ) : activeView === 'alerts' ? (
          /* NEW: ALERTS/NOTIFICATIONS AS A FULL PAGE VIEW */
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            className="max-w-xl mx-auto space-y-6"
          >
            <div className="bg-[#fcfaf4] dark:bg-zinc-900 border-2 border-[#ebdcca] dark:border-zinc-800 rounded-[2.5rem] p-6 md:p-8 space-y-6 shadow-xs relative overflow-hidden">
              <div className="flex items-center justify-between border-b border-[#ebdcca]/60 dark:border-zinc-800 pb-4">
                <div className="flex items-center gap-2">
                  <Bell className="text-amber-800 dark:text-amber-400 animate-bounce" size={18} />
                </div>
                {notifications.some(n => !n.isRead) && (
                  <button
                    onClick={handleMarkNotificationsAsRead}
                    className="font-mono text-[9px] uppercase font-bold tracking-wider text-amber-800 dark:text-amber-400 hover:text-amber-900 dark:hover:text-amber-300 py-1.5 px-3 rounded-xl hover:bg-amber-50/50 dark:hover:bg-zinc-800 transition-all border border-amber-200/35 dark:border-zinc-700"
                  >
                    Mark All As Read
                  </button>
                )}
              </div>

              {/* List Container */}
              <div className="space-y-4">
                {/* Pending Friend Requests Section */}
                {friendRequestsReceived && friendRequestsReceived.length > 0 && (
                  <div className="border-b border-[#ebdcca]/50 dark:border-zinc-800 pb-4 mb-3 space-y-3">
                    <span className="font-mono text-[9px] uppercase font-bold text-amber-800 dark:text-amber-400 tracking-wider block">
                      Pending Friend Requests ({friendRequestsReceived.length})
                    </span>
                    <div className="space-y-2">
                      {friendRequestsReceived.map((reqUser) => (
                        <div
                          key={reqUser.id}
                          className="bg-[#3a342a]/5 dark:bg-zinc-800/50 border border-[#ebdcca] dark:border-zinc-700 p-3 rounded-2xl flex items-center justify-between gap-3"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-8 h-8 rounded-full bg-[#ebdcca] dark:bg-zinc-800 flex items-center justify-center font-bold text-[#3a342a] dark:text-zinc-100 text-xs shrink-0 select-none overflow-hidden border border-[#cfcac0] dark:border-zinc-700">
                              {reqUser.avatarUrl ? (
                                <img src={reqUser.avatarUrl || null} alt={reqUser.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                              ) : (
                                reqUser.name.split(' ').map((n: string) => n[0]).join('')
                              )}
                            </div>
                            <div className="min-w-0">
                              <span className="block font-sans font-bold text-xs text-[#3a342a] dark:text-zinc-100 truncate">
                                {reqUser.name}
                              </span>
                              <span className="block font-mono text-[9px] text-amber-800 dark:text-amber-400 font-bold truncate">
                                {formatCreditCardStyle(reqUser.badgeNumber || 'BD-00-000-00')}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              onClick={() => handleFriendAction(reqUser.id, 'accept')}
                              className="font-mono text-[9px] uppercase font-bold py-1 px-3 rounded-lg bg-emerald-700 dark:bg-emerald-600 text-white hover:bg-emerald-800 dark:hover:bg-emerald-500 transition-colors cursor-pointer"
                            >
                              Accept
                            </button>
                            <button
                              onClick={() => handleFriendAction(reqUser.id, 'decline')}
                              className="font-mono text-[9px] uppercase font-bold py-1 px-3 rounded-lg bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-900/60 border border-red-200 dark:border-red-800 transition-colors cursor-pointer"
                            >
                              Decline
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {notifications.length === 0 ? (
                  <div className="text-center py-12 space-y-3">
                    <div className="w-12 h-12 rounded-full bg-[#f0ede6] dark:bg-zinc-800 flex items-center justify-center mx-auto text-[#8a8172] dark:text-zinc-400">
                      <Bell size={20} />
                    </div>
                    <p className="font-display text-sm text-[#5c5446] dark:text-zinc-300 font-medium">Your feed is fully serene</p>
                    <p className="font-mono text-[9px] text-[#8a8172] dark:text-zinc-400 uppercase tracking-wider">No notifications yet</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {notifications.map((notif) => (
                      <div
                        key={notif.id}
                        onClick={() => handleNotificationClick(notif)}
                        className={`p-4 rounded-2xl border transition-all text-left flex gap-3 items-start cursor-pointer hover:bg-[#ebdcca]/10 dark:hover:bg-zinc-800/50 active:scale-[0.99] select-none ${
                          notif.isRead 
                            ? 'bg-transparent border-[#ebdcca]/40 dark:border-zinc-800 opacity-75' 
                            : 'bg-[#ebdcca]/15 border-amber-200/50 shadow-xs'
                        }`}
                      >
                        {/* Left icon wrapper */}
                        <div className="w-8 h-8 rounded-xl bg-[#ebdcca]/30 flex items-center justify-center shrink-0 text-amber-900 mt-0.5">
                          {(notif.type === 'follow' || notif.type === 'friend_request' || notif.type === 'friend_accept') && <Users size={14} />}
                          {notif.type === 'like' && <Heart size={14} className="fill-rose-700 text-rose-700" />}
                          {notif.type === 'comment' && <MessageSquare size={14} />}
                          {notif.type === 'mention' && <AtSign size={14} />}
                          {notif.type === 'repost' && <Repeat size={14} />}
                        </div>

                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-[#3a342a] font-sans font-medium leading-relaxed">
                            {notif.message}
                          </p>
                          <p className="text-[9px] font-mono text-[#8a8172] mt-1">
                            {getRelativeTime({ timestamp: notif.timestamp })}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        ) : activeView === 'studio' ? (
          /* NEW: ADVANCED SANDBOX & CREATOR STUDIO HUB */
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            className={`max-w-4xl mx-auto space-y-6 ${isScreenReaderActive ? 'text-lg font-bold' : ''}`}
          >
            {/* Wellness Guided Breathing Session Modal/Overlay */}
            {isBreathingActive && (
              <div className="fixed inset-0 z-50 bg-[#3a342a]/95 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center">
                <div className="max-w-md w-full space-y-8">
                  <div className="space-y-2">
                    <span className="font-mono text-[10px] uppercase font-bold tracking-widest text-amber-400">
                      Guided Mindful Breath
                    </span>
                    <h2 className="font-display font-black text-2xl text-[#f4f1ea] uppercase">
                      Take a Moment to Focus
                    </h2>
                    <p className="text-xs text-[#ebdcca]/80 font-sans max-w-xs mx-auto">
                      Let your mind rest. Synchronize your breathing with the cosmic expanding node.
                    </p>
                  </div>

                  {/* Animated breathing circle */}
                  <div className="relative w-48 h-48 mx-auto flex items-center justify-center">
                    <motion.div
                      animate={{
                        scale: breathingStep === 'inhale' ? 1.5 : breathingStep === 'hold' ? 1.5 : 0.8,
                      }}
                      transition={{
                        duration: 4,
                        ease: "easeInOut",
                      }}
                      className="absolute inset-0 rounded-full bg-radial from-amber-500/20 to-transparent border border-amber-500/40"
                    />
                    <div className="w-24 h-24 rounded-full bg-[#ebdcca] border border-[#3a342a] flex flex-col items-center justify-center shadow-lg z-10">
                      <span className="font-mono text-[9px] uppercase font-black text-amber-900 tracking-wider">
                        {breathingStep}
                      </span>
                      <span className="font-display font-black text-2xl text-[#3a342a]">
                        {breathingTimer}s
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      setIsBreathingActive(false);
                      speakAssist("Guided breathing session complete. Welcome back.");
                    }}
                    className="font-mono text-[10px] uppercase font-bold text-[#3a342a] bg-[#ebdcca] hover:bg-[#eae6dc] py-2.5 px-6 rounded-2xl shadow-md transition-all cursor-pointer"
                  >
                    Exit Session
                  </button>
                </div>
              </div>
            )}

            <div className={`bg-[#fcfaf4] border-2 ${isScreenReaderActive ? 'border-black border-4 bg-white text-black' : 'border-[#ebdcca]'} rounded-[2.5rem] p-6 md:p-8 space-y-6 shadow-xs relative overflow-hidden`}>
              
              {/* Header Title & Tab Swapper */}
              <div className="flex flex-col md:flex-row items-center justify-between border-b border-[#ebdcca]/60 pb-5 gap-4">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-2xl bg-amber-900/10 flex items-center justify-center text-amber-800">
                    <Sparkles size={20} className="animate-pulse" />
                  </div>
                  <div>
                    <h2 className="font-display font-black text-base uppercase text-[#3a342a] tracking-tight">
                      Creator Studio & advanced Sandbox
                    </h2>
                    <p className="font-mono text-[9px] text-[#8a8172] uppercase tracking-wider">
                      Explore 15 state-of-the-art secure decentralized platform modules
                    </p>
                  </div>
                </div>

                {/* Sub Tab Buttons */}
                <div className="flex flex-wrap items-center gap-2 bg-[#f4f1ea] p-1 rounded-2xl border border-[#ebdcca]/60">
                  {(['dashboard', 'wellness', 'community'] as const).map((tab) => (
                    <button
                      key={tab}
                      onClick={() => {
                        setStudioSubTab(tab);
                        speakAssist(`Selected ${tab} module list.`);
                      }}
                      className={`font-mono text-[10px] uppercase font-black py-2 px-3.5 rounded-xl transition-all ${
                        studioSubTab === tab
                          ? 'bg-[#3a342a] text-[#f4f1ea] shadow-xs'
                          : 'text-[#8a8172] hover:text-[#3a342a]'
                      }`}
                    >
                      {tab === 'dashboard' ? '📊 Creator & Sync' : tab === 'wellness' ? '🧠 Mind & Voice' : '🌍 Secure Space'}
                    </button>
                  ))}
                </div>
              </div>

              {/* TAB CONTENT: DASHBOARD */}
              {studioSubTab === 'dashboard' && (
                <div className="space-y-6">
                  {/* Row 1: Creator Stats & Trust Score */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Analytics Card */}
                    <div className="bg-[#3a342a]/5 border border-[#ebdcca]/60 p-5 rounded-3xl space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-[10px] uppercase font-bold text-amber-800 tracking-wider">
                          Creator Studio Analytics
                        </span>
                        <TrendingUp size={14} className="text-amber-800" />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="bg-white/60 p-3 rounded-2xl border border-[#ebdcca]/40">
                          <span className="block text-[8px] font-mono text-[#8a8172] uppercase">Profile Views</span>
                          <span className="block font-display font-black text-lg text-[#3a342a]">1,284</span>
                          <span className="block text-[7px] font-mono text-emerald-700 font-bold">+12% this week</span>
                        </div>
                        <div className="bg-white/60 p-3 rounded-2xl border border-[#ebdcca]/40">
                          <span className="block text-[8px] font-mono text-[#8a8172] uppercase">Content Reach</span>
                          <span className="block font-display font-black text-lg text-[#3a342a]">12,450</span>
                          <span className="block text-[7px] font-mono text-emerald-700 font-bold">+24% this week</span>
                        </div>
                        <div className="bg-white/60 p-3 rounded-2xl border border-[#ebdcca]/40">
                          <span className="block text-[8px] font-mono text-[#8a8172] uppercase">Comment Rate</span>
                          <span className="block font-display font-black text-lg text-[#3a342a]">4.8%</span>
                          <span className="block text-[7px] font-mono text-amber-700 font-bold">Highly Constructive</span>
                        </div>
                        <div className="bg-white/60 p-3 rounded-2xl border border-[#ebdcca]/40">
                          <span className="block text-[8px] font-mono text-[#8a8172] uppercase">Verified Followers</span>
                          <span className="block font-display font-black text-lg text-[#3a342a]">412</span>
                          <span className="block text-[7px] font-mono text-emerald-700 font-bold">Node Secured</span>
                        </div>
                      </div>
                    </div>

                    {/* Trust-Score Gated Features */}
                    <div className="bg-[#3a342a]/5 border border-[#ebdcca]/60 p-5 rounded-3xl space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-[10px] uppercase font-bold text-amber-800 tracking-wider">
                          Cryptographic Trust Score
                        </span>
                        <Shield size={14} className="text-amber-800 animate-pulse" />
                      </div>
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="font-display font-black text-2xl text-[#3a342a]">
                            98 / 100
                          </span>
                          <span className="font-mono text-[8px] uppercase font-bold bg-emerald-100 text-emerald-800 px-2.5 py-1 rounded-full border border-emerald-200">
                            Elite Node
                          </span>
                        </div>
                        {/* Progress bar */}
                        <div className="w-full bg-neutral-200 h-2 rounded-full overflow-hidden">
                          <div className="bg-emerald-600 h-full rounded-full" style={{ width: '98%' }} />
                        </div>
                        <div className="space-y-1 text-[9px] font-mono text-[#8a8172]">
                          <p>✓ Verified Region Dhaka Node (+50)</p>
                          <p>✓ Clean Text Analysis Score (+20)</p>
                          <p>✓ Active local node participation (+28)</p>
                        </div>
                        {/* Gated List */}
                        <div className="border-t border-[#ebdcca]/50 pt-2 space-y-1">
                          <span className="font-mono text-[8px] uppercase font-bold block text-neutral-500">Gated Capability Status:</span>
                          <div className="flex justify-between items-center text-[9px] font-mono">
                            <span>🔑 Anonymous Whisper Board</span>
                            <span className="text-emerald-700 font-bold">UNLOCKED</span>
                          </div>
                          <div className="flex justify-between items-center text-[9px] font-mono">
                            <span>🔑 Emergency Broadcast Privileges</span>
                            <span className="text-emerald-700 font-bold">UNLOCKED</span>
                          </div>
                          <div className="flex justify-between items-center text-[9px] font-mono">
                            <span>🔑 Family Node Sync Integration</span>
                            <span className="text-amber-700 font-bold">REQUIRES TRUST SCORE &gt; 95 (UNLOCKED)</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Feature 1: Local-First Offline Sync */}
                  <div className="bg-[#3a342a]/5 border border-[#ebdcca]/60 p-5 rounded-3xl space-y-4">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-[#ebdcca]/40 pb-3">
                      <div>
                        <h3 className="font-sans font-extrabold text-xs text-[#3a342a] uppercase flex items-center gap-1.5">
                          <RotateCcw size={13} />
                          Local-First Offline Storage & Synchronization
                        </h3>
                        <p className="text-[9px] text-[#8a8172] font-mono mt-0.5">
                          Securely persist feed activity locally. Sync asynchronously when network handshakes recover.
                        </p>
                      </div>

                      {/* Online/Offline Status Switcher */}
                      <button
                        onClick={() => {
                          setIsOfflineMode(!isOfflineMode);
                          showToast(isOfflineMode ? "🌐 Platform back Online. Auto-Sync resumed!" : "🔌 Platform set to Offline. Storing posts to local cache.");
                        }}
                        className={`font-mono text-[9px] uppercase font-bold tracking-wider py-1.5 px-3 rounded-full flex items-center gap-1.5 shadow-xs transition-colors border ${
                          isOfflineMode
                            ? 'bg-red-50 text-red-700 border-red-200'
                            : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        }`}
                      >
                        <span className={`w-2 h-2 rounded-full ${isOfflineMode ? 'bg-red-600 animate-pulse' : 'bg-emerald-600'}`} />
                        {isOfflineMode ? "OFFLINE CACHE ACTIVE" : "ONLINE MODEM READY"}
                      </button>
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center justify-between font-mono text-[10px] text-[#5c5446]">
                        <span>Local Cached Queries: <strong>4 items</strong></span>
                        <span>Pending Cloud Sync: <strong className={isOfflineMode ? 'text-red-600 font-bold' : 'text-emerald-700 font-bold'}>{isOfflineMode ? '3 pending' : '0 pending'}</strong></span>
                      </div>

                      {/* Sync Console Output */}
                      <div className="bg-neutral-900 text-emerald-400 font-mono text-[8px] p-3.5 rounded-2xl space-y-1 max-h-24 overflow-y-auto shadow-inner leading-relaxed">
                        {syncLogs.map((log, i) => (
                          <div key={i} className="truncate">{log}</div>
                        ))}
                      </div>

                      <div className="flex justify-end">
                        <button
                          onClick={triggerLocalSync}
                          disabled={isSyncing || isOfflineMode}
                          className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase font-black text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-50 py-2 px-4 rounded-xl shadow-xs transition-colors cursor-pointer"
                        >
                          <RotateCcw size={11} className={isSyncing ? 'animate-spin' : ''} />
                          {isSyncing ? 'Synchronizing...' : isOfflineMode ? 'Cannot Sync Offline' : 'Synchronize Local Cache Now'}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* AI Content Labels & Cross-Post Settings */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Feature 13: AI Content Transparency Labels */}
                    <div className="bg-[#3a342a]/5 border border-[#ebdcca]/60 p-5 rounded-3xl space-y-3">
                      <span className="font-mono text-[10px] uppercase font-bold text-amber-800 block tracking-wider">
                        AI Content Transparency
                      </span>
                      <p className="text-[9px] text-[#8a8172] font-mono leading-relaxed">
                        Decentralized metadata tags added to creator publications. Automatically identify generative assistance.
                      </p>
                      <div className="space-y-2 pt-2">
                        <div className="bg-white/60 p-2.5 rounded-xl border border-[#ebdcca]/40 flex items-center justify-between">
                          <span className="font-mono text-[10px] text-[#3a342a]">Verify Original Human</span>
                          <span className="font-mono text-[8px] font-bold bg-[#ebdcca] text-[#3a342a] px-2 py-0.5 rounded uppercase">Verified Human</span>
                        </div>
                        <div className="bg-white/60 p-2.5 rounded-xl border border-[#ebdcca]/40 flex items-center justify-between">
                          <span className="font-mono text-[10px] text-[#3a342a]">Verify Hybrid AI Assistance</span>
                          <span className="font-mono text-[8px] font-bold bg-amber-100 text-amber-800 px-2 py-0.5 rounded uppercase">AI Assisted</span>
                        </div>
                      </div>
                    </div>

                    {/* Feature 9: Cross-Post to Regional Channels */}
                    <div className="bg-[#3a342a]/5 border border-[#ebdcca]/60 p-5 rounded-3xl space-y-3">
                      <span className="font-mono text-[10px] uppercase font-bold text-amber-800 block tracking-wider">
                        Cross-Post Broadcasting
                      </span>
                      <p className="text-[9px] text-[#8a8172] font-mono leading-relaxed">
                        Broadcast your secure portfolio content seamlessly to multiple regional discovery feeds simultaneously.
                      </p>
                      <div className="space-y-2 pt-2">
                        <div className="flex items-center justify-between text-[10px] font-mono">
                          <span>🌐 #Global-Network-Feed</span>
                          <span className="text-emerald-700 font-bold">Auto-Syndicated</span>
                        </div>
                        <div className="flex items-center justify-between text-[10px] font-mono">
                          <span>🐚 #Dhaka-Verified-Node</span>
                          <span className="text-emerald-700 font-bold">Auto-Syndicated</span>
                        </div>
                        <div className="flex items-center justify-between text-[10px] font-mono">
                          <span>🎨 #Tactile-Media-Room</span>
                          <span className="text-amber-600 font-bold">Opt-In on Publish</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB CONTENT: WELLNESS & VOICE */}
              {studioSubTab === 'wellness' && (
                <div className="space-y-6">
                  {/* Row 1: Digital Wellness & Screen Reader Mode */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Digital Wellness Dashboard */}
                    <div className="bg-[#3a342a]/5 border border-[#ebdcca]/60 p-5 rounded-3xl space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-[10px] uppercase font-bold text-amber-800 tracking-wider">
                          Digital Wellness Tracker
                        </span>
                        <Clock size={14} className="text-amber-800 animate-pulse" />
                      </div>
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-2 text-center">
                          <div className="bg-white/60 p-2.5 rounded-xl border border-[#ebdcca]/30">
                            <span className="block text-[8px] font-mono text-neutral-500 uppercase">Active Session</span>
                            <span className="block font-display font-black text-sm text-[#3a342a]">
                              {Math.floor(wellnessTimeSpent / 60)}m {wellnessTimeSpent % 60}s
                            </span>
                          </div>
                          <div className="bg-white/60 p-2.5 rounded-xl border border-[#ebdcca]/30">
                            <span className="block text-[8px] font-mono text-neutral-500 uppercase">Status Code</span>
                            <span className="block font-mono text-[10px] text-emerald-700 font-black">
                              SERENE LOOP
                            </span>
                          </div>
                        </div>

                        {/* Interactive limit setter */}
                        <div className="space-y-2 border-t border-[#ebdcca]/40 pt-2.5">
                          <div className="flex items-center justify-between">
                            <label className="font-mono text-[9px] uppercase font-bold text-neutral-600">Daily Usage Limit:</label>
                            <span className="font-mono text-[10px] font-bold text-[#3a342a]">{dailyWellnessLimit} minutes</span>
                          </div>
                          <input
                            type="range"
                            min="5"
                            max="120"
                            step="5"
                            value={dailyWellnessLimit}
                            onChange={(e) => setDailyWellnessLimit(Number(e.target.value))}
                            className="w-full accent-[#3a342a]"
                          />
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              id="dailyLimitEnable"
                              checked={isDailyLimitEnabled}
                              onChange={(e) => setIsDailyLimitEnabled(e.target.checked)}
                              className="accent-[#3a342a]"
                            />
                            <label htmlFor="dailyLimitEnable" className="font-mono text-[9px] uppercase font-bold text-neutral-600">
                              Enforce screen break alert
                            </label>
                          </div>
                        </div>

                        <button
                          onClick={() => {
                            setIsBreathingActive(true);
                            speakAssist("Guided breathing session initiated. Relax and follow the visual circle.");
                          }}
                          className="w-full font-mono text-[10px] uppercase font-black text-[#f4f1ea] bg-[#3a342a] hover:bg-[#52493b] py-2.5 rounded-2xl shadow-xs transition-colors cursor-pointer"
                        >
                          Start Guided Breathing Break
                        </button>
                      </div>
                    </div>

                    {/* Feature 15: Accessibility Mode */}
                    <div className="bg-[#3a342a]/5 border border-[#ebdcca]/60 p-5 rounded-3xl space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-[10px] uppercase font-bold text-amber-800 tracking-wider">
                          Accessibility Assistant
                        </span>
                        <UserCheck size={14} className="text-amber-800" />
                      </div>
                      <div className="space-y-3">
                        <p className="text-[9px] text-[#8a8172] font-mono leading-relaxed">
                          A high-contrast visual layout designed for screen readers. Includes text-to-speech feedback.
                        </p>

                        <div className="bg-white/60 p-3.5 rounded-2xl border border-[#ebdcca]/40 space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="font-mono text-[10px] uppercase font-bold text-neutral-700">Audio Speak Assist:</span>
                            <button
                              onClick={() => {
                                const next = !isScreenReaderActive;
                                setIsScreenReaderActive(next);
                                if (next) {
                                  setTimeout(() => speakAssist("High contrast screen reader mode activated. Enjoy your session."), 200);
                                } else {
                                  showToast("Screen Reader mode disabled.");
                                }
                              }}
                              className={`font-mono text-[9px] uppercase font-black py-1.5 px-3 rounded-xl border transition-colors cursor-pointer ${
                                isScreenReaderActive
                                  ? 'bg-[#3a342a] text-[#f4f1ea] border-[#3a342a]'
                                  : 'bg-white text-[#8a8172] border-neutral-300 hover:text-[#3a342a]'
                              }`}
                            >
                              {isScreenReaderActive ? "ACTIVE" : "TURN ON"}
                            </button>
                          </div>
                          <div className="text-[8px] font-mono text-neutral-400">
                            {isScreenReaderActive ? "🗣️ Move cursor or click interface elements to hear audio readouts." : "🔇 Speeches are muted."}
                          </div>
                        </div>

                        {/* Test accessibility feedback buttons */}
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            onMouseEnter={() => speakAssist("Play Ambient Sound Stream")}
                            onClick={() => speakAssist("Initiating marine field-recording background streams.")}
                            className="bg-neutral-100 hover:bg-[#ebdcca]/20 border border-neutral-200 py-1.5 px-2 rounded-xl text-[8px] font-mono uppercase font-bold text-[#3a342a] text-center"
                          >
                            Listen Tag (Hover)
                          </button>
                          <button
                            onMouseEnter={() => speakAssist("Secure Auth Safe Room status")}
                            onClick={() => speakAssist("Your safe room is cryptographically verified on Dhaka server.")}
                            className="bg-neutral-100 hover:bg-[#ebdcca]/20 border border-neutral-200 py-1.5 px-2 rounded-xl text-[8px] font-mono uppercase font-bold text-[#3a342a] text-center"
                          >
                            Listen Node (Hover)
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Feature 5: AI-Powered Toxicity Nudge */}
                  <div className="bg-[#3a342a]/5 border border-[#ebdcca]/60 p-5 rounded-3xl space-y-4">
                    <div>
                      <h3 className="font-sans font-extrabold text-xs text-[#3a342a] uppercase flex items-center gap-1.5">
                        <Shield size={13} />
                        AI-Powered Post & Comment Safety Filter
                      </h3>
                      <p className="text-[9px] text-[#8a8172] font-mono mt-0.5">
                        Nudges users to improve toxic wording proactively before broadcasting to decentralized channels.
                      </p>
                    </div>

                    <div className="space-y-3">
                      <div className="space-y-1">
                        <label className="font-mono text-[9px] uppercase font-bold text-[#5c5446] block">Test Sandbox Post/Comment Language:</label>
                        <textarea
                          placeholder="Type text here to check its toxicity level or positive tone..."
                          value={toxicityInputText}
                          onChange={(e) => checkTextToxicity(e.target.value)}
                          className="w-full bg-white border border-[#ebdcca] rounded-2xl p-3 text-xs focus:outline-none focus:ring-1 focus:ring-amber-500 font-sans leading-relaxed"
                          rows={3}
                        />
                      </div>

                      {toxicityResult && (
                        <div className={`p-4 rounded-2xl border transition-all ${
                          toxicityResult.flagged
                            ? 'bg-red-50 border-red-200 text-red-900'
                            : 'bg-emerald-50 border-emerald-200 text-emerald-900'
                        } space-y-2`}>
                          <div className="flex items-center justify-between text-xs font-bold">
                            <span>Toxicity Threat Score:</span>
                            <span className="font-mono font-black text-sm">{toxicityResult.score}%</span>
                          </div>
                          <p className="text-[10px] font-mono leading-relaxed">
                            {toxicityResult.advice}
                          </p>
                          {toxicityResult.flagged && (
                            <button
                              onClick={() => checkTextToxicity("I think we can agree to disagree and build a better decentralized platform together.")}
                              className="font-mono text-[8px] uppercase font-black bg-white text-red-700 hover:bg-neutral-50 px-3 py-1.5 rounded-lg border border-red-200 shadow-xs transition-colors"
                            >
                              ✨ AI Auto-Rephrase Statement
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Highlight: Voice Notes in DM/Comments */}
                  <div className="bg-[#ebdcca]/15 border border-[#ebdcca]/50 p-5 rounded-3xl space-y-3">
                    <div className="flex items-center gap-2">
                      <Mic size={16} className="text-amber-800" />
                      <span className="font-sans font-extrabold text-xs text-[#3a342a] uppercase">Voice Notes Integration Live</span>
                    </div>
                    <p className="text-[10px] text-[#5c5446] leading-relaxed font-sans">
                      DMs and Comment panels are fully optimized with live speech recording! Users can hold the mic icon inside Comments Modal or Chat box to capture authentic voices, adjust real-time sound effects (such as chipmunk, echo, or deep filters), and broadcast them with high-contrast audio wave rendering.
                    </p>
                  </div>
                </div>
              )}

              {/* TAB CONTENT: COMMUNITY & SECURITY */}
              {studioSubTab === 'community' && (
                <div className="space-y-6">
                  {/* Row 1: E2E Cryptography Chat & Time Capsules */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Feature 12: End-to-End Encrypted Group Chat */}
                    <div className="bg-[#3a342a]/5 border border-[#ebdcca]/60 p-5 rounded-3xl space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-[10px] uppercase font-bold text-amber-800 tracking-wider">
                          E2E Encrypted Safe Room
                        </span>
                        <Lock size={14} className="text-amber-800 animate-pulse" />
                      </div>
                      
                      <div className="space-y-2 max-h-40 overflow-y-auto">
                        {e2eMessages.map((msg) => (
                          <div key={msg.id} className="space-y-1 bg-white/60 p-2.5 rounded-xl border border-neutral-200">
                            <div className="flex justify-between text-[8px] font-mono text-neutral-500">
                              <span className="font-bold">{msg.sender}</span>
                              <span>{msg.timestamp}</span>
                            </div>
                            {/* Cyphertext display block */}
                            <div className="text-[7px] font-mono text-[#8a8172] bg-neutral-100 p-1.5 rounded select-all break-all border border-neutral-200/50">
                              🔑 Cipher: {msg.ciphertext}
                            </div>
                            <p className="text-[10px] text-[#3a342a] font-sans">
                              🔓 Decrypted: {msg.decrypted}
                            </p>
                          </div>
                        ))}
                      </div>

                      <div className="space-y-2">
                        <div className="flex gap-2">
                          <input
                            type="text"
                            placeholder="Send E2E Encrypted message..."
                            value={newE2eMessageText}
                            onChange={(e) => setNewE2eMessageText(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') sendE2eMessage(); }}
                            className="flex-1 bg-white border border-[#ebdcca] rounded-xl px-3 py-1.5 text-[10px] focus:outline-none"
                          />
                          <button
                            onClick={sendE2eMessage}
                            className="bg-[#3a342a] text-white p-1.5 rounded-xl hover:bg-[#52493b] transition-colors"
                          >
                            <Send size={12} />
                          </button>
                        </div>
                        {/* Exchange Key Console logs */}
                        <div className="bg-neutral-900 text-amber-400 font-mono text-[6px] p-2 rounded-xl h-16 overflow-y-auto">
                          {e2eKeyExchangeLog.map((log, i) => <div key={i}>{log}</div>)}
                        </div>
                      </div>
                    </div>

                    {/* Feature 3: Collaborative Time Capsules */}
                    <div className="bg-[#3a342a]/5 border border-[#ebdcca]/60 p-5 rounded-3xl space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-[10px] uppercase font-bold text-amber-800 tracking-wider">
                          Cooperative Time Capsules
                        </span>
                        <Archive size={14} className="text-amber-800" />
                      </div>

                      <div className="space-y-3">
                        {collaborativeCapsules.map((caps) => (
                          <div key={caps.id} className="bg-white/60 p-3 rounded-2xl border border-[#ebdcca]/40 space-y-2">
                            <h4 className="font-sans font-bold text-xs text-[#3a342a]">{caps.title}</h4>
                            <div className="flex items-center justify-between text-[8px] font-mono text-[#8a8172]">
                              <span>🔓 Unlocks: {caps.unlockDate}</span>
                              <span>Co-Signers: {caps.collaborators.length}</span>
                            </div>
                            <div className="border-t border-[#ebdcca]/30 pt-1.5 space-y-1">
                              <span className="font-mono text-[7px] uppercase font-bold text-neutral-500">Sign-Off Handshake State:</span>
                              {caps.collaborators.map(c => (
                                <div key={c} className="flex justify-between text-[8px] font-mono">
                                  <span>👤 {c}</span>
                                  <span className={caps.approvals[c] ? 'text-emerald-700 font-bold' : 'text-amber-600 font-bold'}>
                                    {caps.approvals[c] ? '✓ Signed Cryptographically' : '⏱ Pending Authentication'}
                                  </span>
                                </div>
                              ))}
                            </div>
                            {!caps.approvals['Marine Rover'] && (
                              <button
                                onClick={() => {
                                  setCollaborativeCapsules(prev => prev.map(p => {
                                    if (p.id === caps.id) {
                                      return { ...p, approvals: { ...p.approvals, 'Marine Rover': true } };
                                    }
                                    return p;
                                  }));
                                  showToast("✓ Cooperatively co-signed time capsule!");
                                }}
                                className="w-full bg-amber-600 hover:bg-amber-700 text-white font-mono text-[8px] uppercase font-bold py-1.5 rounded-lg mt-1"
                              >
                                Co-Sign Capsule Verification Key
                              </button>
                            )}
                          </div>
                        ))}

                        {/* Create Collaborative Capsule Form */}
                        <div className="space-y-2 border-t border-[#ebdcca]/40 pt-2 text-left">
                          <span className="font-mono text-[8px] uppercase font-bold block text-neutral-500">Initiate Cooperative Capsule:</span>
                          <input
                            type="text"
                            placeholder="Capsule Title"
                            value={newCollabTitle}
                            onChange={(e) => setNewCollabTitle(e.target.value)}
                            className="w-full bg-white border border-[#ebdcca] rounded-xl px-2.5 py-1.5 text-[9px] focus:outline-none"
                          />
                          <div className="flex gap-2">
                            <input
                              type="date"
                              value={newCollabDate}
                              onChange={(e) => setNewCollabDate(e.target.value)}
                              className="flex-1 bg-white border border-[#ebdcca] rounded-xl px-2 py-1 text-[9px] focus:outline-none"
                            />
                            <input
                              type="text"
                              placeholder="Co-signers (comma separated)"
                              value={newCollabCollabs}
                              onChange={(e) => setNewCollabCollabs(e.target.value)}
                              className="flex-1 bg-white border border-[#ebdcca] rounded-xl px-2 py-1 text-[9px] focus:outline-none"
                            />
                          </div>
                          <button
                            onClick={() => {
                              if (!newCollabTitle || !newCollabDate) {
                                showToast("⚠️ Fill all fields to lock capsule.");
                                return;
                              }
                              const list = newCollabCollabs.split(',').map(s => s.trim()).filter(Boolean);
                              const approvalsObj: Record<string, boolean> = { 'Marine Rover': true };
                              list.forEach(c => { approvalsObj[c] = false; });
                              const newCaps = {
                                id: `caps-${Date.now()}`,
                                title: newCollabTitle,
                                unlockDate: newCollabDate,
                                collaborators: ['Marine Rover', ...list],
                                approvals: approvalsObj
                              };
                              setCollaborativeCapsules(prev => [...prev, newCaps]);
                              setNewCollabTitle('');
                              setNewCollabDate('');
                              setNewCollabCollabs('');
                              showToast("📦 Cooperative Time Capsule initiated! Waiting for co-signers.");
                            }}
                            className="w-full bg-[#3a342a] text-[#f4f1ea] font-mono text-[8px] uppercase font-bold py-1.5 rounded-lg"
                          >
                            Lock Joint Capsule
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Feature 4: Emergency Pool Skill Matching */}
                  <div className="bg-[#3a342a]/5 border border-[#ebdcca]/60 p-5 rounded-3xl space-y-4">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-[#ebdcca]/40 pb-3">
                      <div>
                        <h3 className="font-sans font-extrabold text-xs text-red-800 uppercase flex items-center gap-1.5">
                          <AlertCircle size={13} className="animate-pulse" />
                          Emergency Pool & Skill Match
                        </h3>
                        <p className="text-[9px] text-[#8a8172] font-mono mt-0.5">
                          Match emergency response pools on Dhaka Node with qualified verified volunteers.
                        </p>
                      </div>

                      <select
                        value={emergencySkillsFilter}
                        onChange={(e) => setEmergencySkillsFilter(e.target.value)}
                        className="font-mono text-[9px] bg-white border border-[#ebdcca] rounded-xl py-1 px-2.5 focus:outline-none"
                      >
                        <option value="All">All Response Skills</option>
                        <option value="Blood Donor">Blood Donor</option>
                        <option value="First Aid">First Aid</option>
                        <option value="Medical Staff">Medical Staff</option>
                        <option value="Tech Recovery">Tech Recovery</option>
                      </select>
                    </div>

                    <div className="space-y-3">
                      {[
                        { id: 'em-1', title: 'Critical O- Blood Bag Needed - Dhaka Medical', skill: 'Blood Donor', contact: '01712-XXXXXX', radius: '1.2 km', priority: 'CRITICAL' },
                        { id: 'em-2', title: 'Power Grid Down - Disaster Tech Lab', skill: 'Tech Recovery', contact: '01911-XXXXXX', radius: '4.8 km', priority: 'HIGH' },
                        { id: 'em-3', title: 'Community Safe Room Setup Volunteer Help', skill: 'First Aid', contact: '01511-XXXXXX', radius: '8.2 km', priority: 'MEDIUM' }
                      ].filter(em => emergencySkillsFilter === 'All' || em.skill === emergencySkillsFilter).map(em => (
                        <div key={em.id} className="bg-white/80 p-3.5 rounded-2xl border border-[#ebdcca] flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                          <div className="space-y-1">
                            <div className="flex items-center gap-1.5">
                              <span className={`text-[7px] font-mono font-black px-2 py-0.5 rounded-full ${
                                em.priority === 'CRITICAL' ? 'bg-red-100 text-red-800 animate-pulse' : em.priority === 'HIGH' ? 'bg-orange-100 text-orange-800' : 'bg-yellow-100 text-yellow-800'
                              }`}>
                                {em.priority}
                              </span>
                              <span className="font-mono text-[8px] text-[#8a8172]">Within {em.radius}</span>
                            </div>
                            <h4 className="font-sans font-bold text-xs text-[#3a342a]">{em.title}</h4>
                            <p className="font-mono text-[9px] text-amber-900">Required Qualification: <strong>{em.skill}</strong></p>
                          </div>
                          <button
                            onClick={() => showToast(`✓ You have RSVPed to volunteer for: ${em.title}. Contact: ${em.contact}`)}
                            className="font-mono text-[9px] uppercase font-bold text-white bg-red-700 hover:bg-red-800 px-3.5 py-2 rounded-xl transition-colors cursor-pointer"
                          >
                            Volunteers Join Pool
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Feature 6: Anonymous "Whisper" Mode */}
                  <div className="bg-[#3a342a]/5 border border-[#ebdcca]/60 p-5 rounded-3xl space-y-4">
                    <div>
                      <h3 className="font-sans font-extrabold text-xs text-[#3a342a] uppercase flex items-center gap-1.5">
                        <Waves size={13} />
                        Anonymous Whispers board
                      </h3>
                      <p className="text-[9px] text-[#8a8172] font-mono mt-0.5">
                        Encrypted whispers with live self-destruct timers. Disappears untraceably upon timeout.
                      </p>
                    </div>

                    <div className="space-y-4">
                      {/* Grid of whispers */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {whispers.map((w) => (
                          <div key={w.id} className="bg-[#3a342a] text-[#f4f1ea] p-3.5 rounded-2xl border border-white/10 relative overflow-hidden space-y-2">
                            <div className="flex justify-between items-center">
                              <span className="font-mono text-[7px] uppercase font-black text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded">
                                {w.category}
                              </span>
                              <span className="font-mono text-[7px] text-red-400 font-bold flex items-center gap-0.5">
                                <Clock size={8} /> Disappearing in {w.timer}s
                              </span>
                            </div>
                            <p className="text-[10px] font-sans italic leading-relaxed text-[#ebdcca]">
                              "{w.text}"
                            </p>
                          </div>
                        ))}
                      </div>

                      {/* Create Whisper Form */}
                      <div className="bg-white/60 p-3 rounded-2xl border border-[#ebdcca] space-y-2">
                        <span className="font-mono text-[8px] uppercase font-bold block text-[#5c5446]">Whisper a Secret Node:</span>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            placeholder="Type an anonymous whisper..."
                            value={newWhisperText}
                            onChange={(e) => setNewWhisperText(e.target.value)}
                            className="flex-1 bg-white border border-[#ebdcca] rounded-xl px-3 py-1.5 text-[10px] focus:outline-none"
                          />
                          <select
                            value={newWhisperCategory}
                            onChange={(e) => setNewWhisperCategory(e.target.value)}
                            className="font-mono text-[9px] bg-white border border-[#ebdcca] rounded-xl py-1 px-2 focus:outline-none"
                          >
                            <option value="Confession">Confession</option>
                            <option value="Tech Secret">Tech Secret</option>
                            <option value="Dhaka Node">Dhaka Node</option>
                          </select>
                          <button
                            onClick={() => {
                              if (!newWhisperText.trim()) return;
                              const nw = {
                                id: `wh-${Date.now()}`,
                                text: newWhisperText,
                                timer: 120, // 2 minutes
                                category: newWhisperCategory
                              };
                              setWhispers(prev => [nw, ...prev]);
                              setNewWhisperText('');
                              showToast("🤫 Whisper broadcasted anonymously!");
                            }}
                            className="bg-[#3a342a] text-white font-mono text-[9px] uppercase font-bold px-4 rounded-xl hover:bg-[#52493b]"
                          >
                            Broadcast
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Feature 7: Local Event Discovery */}
                  <div className="bg-[#3a342a]/5 border border-[#ebdcca]/60 p-5 rounded-3xl space-y-4">
                    <div>
                      <h3 className="font-sans font-extrabold text-xs text-[#3a342a] uppercase flex items-center gap-1.5">
                        <Calendar size={13} />
                        Local Event Discovery Node
                      </h3>
                      <p className="text-[9px] text-[#8a8172] font-mono mt-0.5">
                        Find and register for decentralized tech meetups and sound labs around your coordinates.
                      </p>
                    </div>

                    <div className="space-y-3">
                      {localEvents.map((ev) => (
                        <div key={ev.id} className="bg-white/80 p-3 rounded-2xl border border-[#ebdcca] flex justify-between items-center gap-3">
                          <div className="space-y-1">
                            <span className="font-mono text-[7px] uppercase font-bold text-neutral-400 block">{ev.date}</span>
                            <h4 className="font-sans font-bold text-xs text-[#3a342a]">{ev.name}</h4>
                            <p className="font-mono text-[9px] text-[#8a8172]">📍 {ev.location} ({ev.distanceKm} km away)</p>
                          </div>
                          <div className="text-right space-y-1">
                            <span className="block font-mono text-[8px] text-neutral-500">{ev.rsvps} RSVPs</span>
                            <button
                              onClick={() => {
                                setLocalEvents(prev => prev.map(p => {
                                  if (p.id === ev.id) {
                                    return { ...p, hasRsvped: !p.hasRsvped, rsvps: p.hasRsvped ? p.rsvps - 1 : p.rsvps + 1 };
                                  }
                                  return p;
                                }));
                                showToast(ev.hasRsvped ? "RSVP cancelled" : "✓ Successfully RSVPed for event!");
                              }}
                              className={`font-mono text-[9px] uppercase font-black py-1.5 px-3 rounded-xl border transition-all cursor-pointer ${
                                ev.hasRsvped
                                  ? 'bg-emerald-700 text-white border-emerald-700'
                                  : 'bg-white text-amber-800 border-amber-200 hover:bg-amber-50/50'
                              }`}
                            >
                              {ev.hasRsvped ? 'JOINING' : 'RSVP JOIN'}
                            </button>
                          </div>
                        </div>
                      ))}

                      {/* Create Event Form */}
                      <div className="bg-white/60 p-3 rounded-2xl border border-[#ebdcca] space-y-2">
                        <span className="font-mono text-[8px] uppercase font-bold block text-neutral-500">Register Local Event:</span>
                        <div className="grid grid-cols-2 gap-2">
                          <input
                            type="text"
                            placeholder="Event Name"
                            value={newEventName}
                            onChange={(e) => setNewEventName(e.target.value)}
                            className="bg-white border border-[#ebdcca] rounded-xl px-2.5 py-1.5 text-[9px] focus:outline-none"
                          />
                          <input
                            type="text"
                            placeholder="Location Coordinates/Name"
                            value={newEventLocation}
                            onChange={(e) => setNewEventLocation(e.target.value)}
                            className="bg-white border border-[#ebdcca] rounded-xl px-2.5 py-1.5 text-[9px] focus:outline-none"
                          />
                        </div>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            placeholder="Radius distance (km)"
                            value={newEventDistance}
                            onChange={(e) => setNewEventDistance(e.target.value)}
                            className="flex-1 bg-white border border-[#ebdcca] rounded-xl px-2.5 py-1.5 text-[9px] focus:outline-none"
                          />
                          <button
                            onClick={() => {
                              if (!newEventName || !newEventLocation) return;
                              const nev = {
                                id: `ev-${Date.now()}`,
                                name: newEventName,
                                date: new Date().toISOString().split('T')[0],
                                location: newEventLocation,
                                distanceKm: parseFloat(newEventDistance) || 3.5,
                                rsvps: 1,
                                hasRsvped: true
                              };
                              setLocalEvents(prev => [...prev, nev]);
                              setNewEventName('');
                              setNewEventLocation('');
                              showToast("📅 Registered local event on discovery map!");
                            }}
                            className="bg-[#3a342a] text-white font-mono text-[9px] uppercase font-bold px-4 rounded-xl hover:bg-[#52493b]"
                          >
                            Publish Local Event
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Feature 11: Family/Group Profiles */}
                  <div className="bg-[#3a342a]/5 border border-[#ebdcca]/60 p-5 rounded-3xl space-y-4">
                    <div>
                      <h3 className="font-sans font-extrabold text-xs text-[#3a342a] uppercase flex items-center gap-1.5">
                        <Users size={13} />
                        Joint Family & Group Profiles Manager
                      </h3>
                      <p className="text-[9px] text-[#8a8172] font-mono mt-0.5">
                        Establish cooperative organizational profiles to share posts and coordinate joint activities.
                      </p>
                    </div>

                    <div className="space-y-3">
                      {familyProfiles.map((fam) => (
                        <div key={fam.id} className="bg-white/80 p-4 rounded-2xl border border-[#ebdcca] space-y-3">
                          <div className="flex justify-between items-center">
                            <h4 className="font-sans font-black text-xs text-amber-900 uppercase">{fam.name}</h4>
                            <span className="font-mono text-[8px] bg-[#ebdcca] text-[#3a342a] px-2 py-0.5 rounded">Active Household Profile</span>
                          </div>
                          
                          <div className="grid grid-cols-2 gap-2 text-[9px] font-mono">
                            <div className="space-y-1">
                              <span className="text-[8px] font-bold text-neutral-400 block uppercase">Members:</span>
                              {fam.members.map(m => (
                                <div key={m.name}>• {m.name} ({m.role})</div>
                              ))}
                            </div>
                            <div className="space-y-1">
                              <span className="text-[8px] font-bold text-neutral-400 block uppercase">Joint Timeline Activities:</span>
                              {fam.joinedTimeline.map((act, idx) => (
                                <div key={idx}>• {act}</div>
                              ))}
                            </div>
                          </div>

                          {/* Add Member Form */}
                          <div className="flex gap-2 border-t border-[#ebdcca]/30 pt-2.5">
                            <input
                              type="text"
                              placeholder="Add member username..."
                              value={newFamilyMember}
                              onChange={(e) => setNewFamilyMember(e.target.value)}
                              className="flex-1 bg-white border border-[#ebdcca] rounded-xl px-2 py-1 text-[9px] focus:outline-none"
                            />
                            <button
                              onClick={() => {
                                if (!newFamilyMember) return;
                                setFamilyProfiles(prev => prev.map(p => {
                                  if (p.id === fam.id) {
                                    return {
                                      ...p,
                                      members: [...p.members, { name: newFamilyMember, role: 'Member' }]
                                    };
                                  }
                                  return p;
                                }));
                                setNewFamilyMember('');
                                showToast("✓ Member added to joint group profile!");
                              }}
                              className="bg-[#3a342a] text-white font-mono text-[8px] uppercase font-bold px-3 rounded-lg"
                            >
                              Add Member
                            </button>
                          </div>
                        </div>
                      ))}

                      {/* Create Family Form */}
                      <div className="bg-white/60 p-3 rounded-2xl border border-[#ebdcca] space-y-2">
                        <span className="font-mono text-[8px] uppercase font-bold block text-neutral-500">Initiate Joint Family/Group Profile:</span>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            placeholder="Family/Group Name"
                            value={newFamilyName}
                            onChange={(e) => setNewFamilyName(e.target.value)}
                            className="flex-1 bg-white border border-[#ebdcca] rounded-xl px-3 py-1.5 text-[9px] focus:outline-none"
                          />
                          <button
                            onClick={() => {
                              if (!newFamilyName.trim()) return;
                              const nf = {
                                id: `fam-${Date.now()}`,
                                name: newFamilyName,
                                members: [{ name: profile.name, role: 'Founder' }],
                                joinedTimeline: ['Joint timeline initialized']
                              };
                              setFamilyProfiles(prev => [...prev, nf]);
                              setNewFamilyName('');
                              showToast("👨‍👩‍👧‍👦 Joint Family Profile generated!");
                            }}
                            className="bg-[#3a342a] text-white font-mono text-[9px] uppercase font-bold px-4 rounded-xl hover:bg-[#52493b]"
                          >
                            Generate Profile
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

            </div>
          </motion.div>
        ) : (
          /* STANDARD WORKSPACE PROFILE VIEW */
          <>
            {/* VISITOR WELCOME SIGNUP HERO BANNER */}
            {!token && !viewingCreator && (
              <motion.div
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-[#3a342a] text-[#f4f1ea] rounded-none sm:rounded-3xl p-6 md:p-8 border-y sm:border border-[#cfcac0] shadow-md space-y-4 relative overflow-hidden max-w-3xl mx-auto w-full"
              >
                {/* Ambient pattern */}
                <div className="absolute right-0 bottom-0 top-0 w-1/3 bg-radial from-[#ebdcca]/10 to-transparent pointer-events-none" />
                
                <div className="relative space-y-2 max-w-xl">
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#ebdcca]/15 border border-[#ebdcca]/25 text-[#ebdcca] font-mono text-[9px] uppercase tracking-wider font-bold">
                    <Sparkles size={10} className="animate-pulse" /> Live Creator Network Active
                  </div>
                  <h2 className="font-display font-bold text-lg tracking-tight uppercase leading-none">
                    Create Your Own Secure Portfolio Card
                  </h2>
                  <p className="text-xs text-[#ebdcca]/80 leading-relaxed font-sans">
                    Every signup secures a completely separate, custom account with an envelope-encrypted database slot. Design your layout, publish live articles, and open your inbox to collect secure direct messages from other creators!
                  </p>
                </div>

                <div className="flex flex-wrap gap-3 pt-2 relative">
                  <button
                    onClick={() => {
                      setAuthTab('signup');
                      setIsAuthOpen(true);
                      setAuthError('');
                    }}
                    className="inline-flex items-center gap-2 font-mono text-[10px] uppercase font-bold text-[#3a342a] bg-[#ebdcca] hover:bg-[#eae6dc] py-2.5 px-5 rounded-2xl shadow-sm hover:scale-[1.02] active:scale-[0.98] transition-all"
                  >
                    <UserPlus size={13} />
                    Register Secure Account
                  </button>
                  
                  <button
                    onClick={() => {
                      setAuthTab('login');
                      setIsAuthOpen(true);
                      setAuthError('');
                    }}
                    className="inline-flex items-center gap-2 font-mono text-[10px] uppercase font-bold text-[#f4f1ea] bg-transparent border border-[#cfcac0]/60 hover:bg-[#f4f1ea]/10 py-2.5 px-5 rounded-2xl transition-all"
                  >
                    <Unlock size={13} />
                    Sign In To Workspace
                  </button>
                </div>
              </motion.div>
            )}

            {/* EDIT MODE CALLOUT */}
            {isEditMode && !viewingCreator && (
              <motion.div 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="max-w-3xl sm:mx-auto bg-amber-50/70 border border-amber-200 rounded-2xl p-4 flex gap-3 text-xs text-amber-900 shadow-xs mx-4"
              >
                <Shield size={16} className="text-amber-700 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-semibold font-mono uppercase tracking-wider text-[10px] text-amber-800">
                    Secure Envelope-Protected Edit Workspace
                  </p>
                  <p className="text-amber-800/85 leading-relaxed">
                    You can click text blocks, change names, configure bio descriptions, upload images, modify tech tags, and organize portfolio cards on the fly. All changes are securely synchronized to your profile record in the database.
                  </p>
                </div>
              </motion.div>
            )}

            {/* SECTION 1: IDENTITY CARD */}
            <section className="mx-auto max-w-3xl px-4 md:px-0">
              <IdentityCard 
                profile={viewingCreator ? viewingCreator.profile : activeProfile}
                isEditMode={isEditMode && !viewingCreator}
                onUpdateProfile={handleUpdateProfile}
                isViewingSelf={
                  !viewingCreator || 
                  (!!user && (
                    viewingCreator.id === user.id || 
                    viewingCreator.id === getDeterministicAnon(user.id, user.countryCode).id
                  ))
                }
                friendStatus={viewingCreator ? (() => {
                  const isFriend = friends.some((f: any) => f.id === viewingCreator.id);
                  const isSent = friendRequestsSent.includes(viewingCreator.id);
                  const isReceived = friendRequestsReceived.some((f: any) => f.id === viewingCreator.id);
                  if (isFriend) return 'friends';
                  if (isSent) return 'sent';
                  if (isReceived) return 'received';
                  return 'none';
                })() : 'none'}
                onFriendAction={viewingCreator ? (action) => handleFriendAction(viewingCreator.id, action) : undefined}
                onMessageClick={viewingCreator ? () => {
                  if (isActingAsAnonymous) {
                    showToast("⚠️ Anonymous profiles cannot chat. Turn off Anonymous Mode to message creators.");
                    return;
                  }
                  if (!token) {
                    showToast("🔒 Please Unlock Space to send a direct message.");
                    setAuthTab('login');
                    setIsAuthOpen(true);
                    return;
                  }
                  
                  const isFriend = friends.some((f: any) => f.id === viewingCreator.id);
                  const isPublicMessagingOn = viewingCreator.profile?.isPublicMessagingEnabled !== false && viewingCreator.isPublicMessagingEnabled !== false;
                  if (!isPublicMessagingOn && !isFriend) {
                    showToast("🔒 This user restricts direct messaging to friends only. Add them as a friend to chat.");
                    return;
                  }

                  setInitialActiveChatUserId(viewingCreator.id);
                  setActiveView('chat');
                  setViewingCreator(null);
                } : undefined}
                isTargetFollowingViewer={viewingCreator && user ? viewingCreator.following?.includes(user.id) : false}
                onFriendsClick={() => {
                  if (viewingCreator) {
                    setFriendsListModalData({
                      name: viewingCreator.name,
                      friends: viewingCreator.friends || [],
                      restricted: viewingCreator.friendsListRestricted
                    });
                  } else {
                    setFriendsListModalData({
                      name: profile.name,
                      friends: friends,
                      restricted: false
                    });
                  }
                  setIsFriendsListOpen(true);
                }}
              />
            </section>

            {/* SECTION 2: USER'S POSTS & BOOKMARKS */}
            <section className="space-y-4 max-w-3xl mx-auto w-full">
              {viewingCreator && viewingCreator.profile?.isRestricted ? (
                <div className="bg-[#fdfbf7] border-2 border-dashed border-[#cfcac0] rounded-3xl p-8 text-center space-y-4 max-w-lg mx-auto shadow-xs mx-4 sm:mx-auto">
                  <div className="w-12 h-12 rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center mx-auto text-amber-800">
                    <Lock size={20} className="animate-pulse" />
                  </div>
                  <div className="space-y-1.5">
                    <p className="font-display text-sm text-[#3a342a] font-bold uppercase tracking-wide">
                      Portfolio Restricted
                    </p>
                    <p className="font-sans text-xs text-[#5c5446] leading-relaxed max-w-sm mx-auto">
                      This creator has protected their portfolio details. To view their projects, websites, and custom post designs, please add them as a friend on this secure network.
                    </p>
                  </div>
                  <div className="flex justify-center">
                    {(() => {
                      const isFriend = friends.some((f: any) => f.id === viewingCreator.id);
                      const isSent = friendRequestsSent.includes(viewingCreator.id);
                      const isReceived = friendRequestsReceived.some((f: any) => f.id === viewingCreator.id);

                      if (isSent) {
                        return (
                          <button disabled className="font-mono text-[9px] uppercase font-bold py-2 px-5 rounded-xl border bg-[#ebdcca]/30 text-[#8a8172] border-[#ebdcca] cursor-not-allowed">
                            Friend Request Pending
                          </button>
                        );
                      } else if (isReceived) {
                        return (
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleFriendAction(viewingCreator.id, 'accept')}
                              className="font-mono text-[9px] uppercase font-bold py-2 px-4 rounded-xl bg-emerald-700 text-white hover:bg-emerald-800 cursor-pointer transition-colors"
                            >
                              Accept Friend Request
                            </button>
                            <button
                              onClick={() => handleFriendAction(viewingCreator.id, 'decline')}
                              className="font-mono text-[9px] uppercase font-bold py-2 px-4 rounded-xl bg-red-100 text-red-700 border border-red-200 hover:bg-red-200 cursor-pointer transition-colors"
                            >
                              Decline
                            </button>
                          </div>
                        );
                      } else {
                        return (
                          <button
                            onClick={() => handleFriendAction(viewingCreator.id, 'send')}
                            className="font-mono text-[9px] uppercase font-bold py-2 px-6 rounded-xl bg-[#3a342a] text-[#f4f1ea] hover:bg-[#52493b] cursor-pointer transition-all inline-flex items-center gap-1.5 shadow-sm"
                          >
                            <Users size={12} />
                            Send Friend Request
                          </button>
                        );
                      }
                    })()}
                  </div>
                </div>
              ) : (
                <>
                  {!viewingCreator && token && (
                    <div className="flex bg-[#ebdcca]/40 border border-[#cfcac0] p-1 rounded-2xl max-w-sm mx-auto h-9 items-center justify-around">
                      <button
                        onClick={() => setWorkspaceSubTab('posts')}
                        className={`flex-1 text-[10px] font-mono uppercase font-bold py-1.5 rounded-xl transition-all ${
                          workspaceSubTab === 'posts' ? 'bg-[#3a342a] text-[#f4f1ea] shadow-xs' : 'text-[#8a8172] hover:text-[#3a342a]'
                        }`}
                      >
                        My Portfolio Posts
                      </button>
                      <button
                        onClick={() => setWorkspaceSubTab('bookmarks')}
                        className={`flex-1 text-[10px] font-mono uppercase font-bold py-1.5 rounded-xl transition-all ${
                          workspaceSubTab === 'bookmarks' ? 'bg-[#3a342a] text-[#f4f1ea] shadow-xs' : 'text-[#8a8172] hover:text-[#3a342a]'
                        }`}
                      >
                        Saved Bookmarks
                      </button>
                    </div>
                  )}

                  {workspaceSubTab === 'bookmarks' && !viewingCreator ? (
                    <PostsSection 
                      posts={feedList.filter(post => (profile.savedPostIds || []).includes(post.id)).map(post => ({
                        ...post
                      }))}
                      isEditMode={false}
                      onUpdatePosts={() => {}}
                      onLikePost={handleLikeFeedPost}
                      onRepostPost={handleRepostFeedPost}
                      onReportPost={(p) => setReportModalPost(p)}
                      onCommentPost={setActiveCommentsPost}
                      onSavePost={handleSavePost}
                      onSharePost={setSharingPost}
                      savedPostIds={profile.savedPostIds || []}
                      currentUser={user}
                      onLoadCreatorProfile={(id) => {
                        loadCreatorProfile(id);
                        setActiveView('workspace');
                      }}
                      profileName={profile.name}
                      profileAvatarUrl={profile.avatarUrl || ''}
                      buttonsAlignment={postButtonsAlignment}
                      onShowLikesList={setLikedUsersPost}
                      onVideoClick={handleVideoClickToReel}
                    />
                  ) : (
                    <PostsSection 
                      posts={(viewingCreator ? (viewingCreator.profile.posts || []) : (profile.posts || [])).filter(p => {
                        if (!viewingCreator) {
                          return isActingAsAnonymous ? !!p.isAnonymous : !p.isAnonymous;
                        }
                        if (!viewingCreator.id.startsWith('anon-user-')) {
                          return !p.isAnonymous;
                        }
                        return true;
                      })}
                      isEditMode={isEditMode && !viewingCreator}
                      onUpdatePosts={handleUpdatePosts}
                      onLikePost={handleLikeFeedPost}
                      onRepostPost={handleRepostFeedPost}
                      onReportPost={(p) => setReportModalPost(p)}
                      onCommentPost={setActiveCommentsPost}
                      onSavePost={handleSavePost}
                      onSharePost={setSharingPost}
                      savedPostIds={profile.savedPostIds || []}
                      currentUser={user}
                      onLoadCreatorProfile={(id) => {
                        loadCreatorProfile(id);
                        setActiveView('workspace');
                      }}
                      profileName={viewingCreator ? viewingCreator.name : profile.name}
                      profileAvatarUrl={viewingCreator ? viewingCreator.profile.avatarUrl : (profile.avatarUrl || '')}
                      buttonsAlignment={postButtonsAlignment}
                      onShowLikesList={setLikedUsersPost}
                      onVideoClick={handleVideoClickToReel}
                    />
                  )}
                </>
              )}
            </section>
          </>
        )}
      </main>

      {/* STICKY FLOATING COLLAPSIBLE NAVIGATION BAR */}
      <motion.div
        key={`bottom-nav-${bottomNavSide}`}
        drag="x"
        dragConstraints={{ left: bottomNavSide === 'left' ? 0 : -250, right: bottomNavSide === 'left' ? 250 : 0 }}
        dragElastic={0.1}
        dragSnapToOrigin={true}
        dragMomentum={false}
        onDragEnd={(event, info) => {
          const offset = info.offset.x;
          if (Math.abs(offset) > 30) {
            let newSide = bottomNavSide;
            if (bottomNavSide === 'left' && offset > 30) {
              newSide = 'right';
            } else if (bottomNavSide === 'right' && offset < -30) {
              newSide = 'left';
            }
            if (newSide !== bottomNavSide) {
              setBottomNavSide(newSide);
              localStorage.setItem('bottom_nav_side', newSide);
              setPostButtonsAlignment(newSide);
              localStorage.setItem('post_buttons_alignment', newSide);
            }
          }
        }}
        animate={{
          x: 0,
        }}
        className={`fixed bottom-6 ${bottomNavSide === 'left' ? 'left-6' : 'right-6'} z-50 flex flex-col-reverse items-center gap-2.5 select-none touch-none cursor-grab active:cursor-grabbing`}
        title="Drag horizontal to place on left or right!"
      >
        {/* Little round back icon when folded off */}
        {!isBottomNavExpanded && navHistory.length > 0 && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleGoBack();
            }}
            className="w-10 h-10 rounded-full bg-[#fdfbf7] hover:bg-[#ebdcca] text-[#3a342a] flex items-center justify-center shadow-lg hover:shadow-xl transition-all border border-[#ebdcca] cursor-pointer"
            title="Go Back"
          >
            <ArrowLeft size={16} />
          </button>
        )}

        {/* Toggle / Fold Button */}
        <button
          onClick={() => setIsBottomNavExpanded(!isBottomNavExpanded)}
          className="w-12 h-12 rounded-full bg-[#3a342a] hover:bg-[#52493b] text-[#f4f1ea] flex items-center justify-center shadow-lg hover:shadow-xl transition-all relative z-50 shrink-0 cursor-pointer border border-[#ebdcca]"
          title={isBottomNavExpanded ? "Fold Menu" : "Unfold Menu"}
        >
          {isBottomNavExpanded ? (
            <ChevronDown size={20} className="text-[#ebdcca]" />
          ) : (
            <Compass size={20} className="text-[#ebdcca] animate-spin-slow" />
          )}
          {/* Notification Indicator if folded */}
          {!isBottomNavExpanded && (notifications.some(n => !n.isRead) || (messages.length > 0 && token)) && (
            <span className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-rose-600 rounded-full border border-[#fcfaf4]" />
          )}
        </button>

        {/* Unfolded Menu Buttons */}
        <AnimatePresence>
          {isBottomNavExpanded && (
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.95 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="bg-[#fdfbf7]/95 backdrop-blur-md border border-[#ebdcca] rounded-full p-1 shadow-lg flex flex-col items-center gap-1"
            >
              {/* Profile Tab */}
              <button
                onClick={() => {
                  if (!token) {
                    showToast("🔒 Please Unlock Space to access your Profile.");
                    setAuthTab('login');
                    setIsAuthOpen(true);
                    return;
                  }
                  setActiveView('workspace');
                  setViewingCreator(null);
                }}
                className={`w-12 h-12 rounded-full flex items-center justify-center transition-all group shrink-0 relative ${
                  activeView === 'workspace' ? 'text-amber-800 bg-[#ebdcca]/40 font-bold border border-[#ebdcca]/30' : 'text-[#8a8172] hover:text-[#3a342a] hover:bg-[#ebdcca]/20'
                }`}
                title="View My Profile"
              >
                {profile.avatarUrl ? (
                  <div className="w-5 h-5 rounded-full overflow-hidden border border-[#cfcac0] group-hover:scale-110 transition-transform">
                    <img src={profile.avatarUrl || null} alt={profile.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  </div>
                ) : (
                  <User size={20} className={`transition-transform group-hover:scale-110 ${activeView === 'workspace' ? 'text-amber-800' : 'text-[#8a8172] group-hover:text-[#3a342a]'}`} />
                )}
              </button>

              {/* Meet Tab */}
              <button
                onClick={() => {
                  if (isActingAsAnonymous) {
                    showToast("⚠️ Anonymous profiles cannot join video calls. Turn off Anonymous Mode.");
                    return;
                  }
                  if (!token) {
                    showToast("🔒 Please Unlock Space to start a video call.");
                    setAuthTab('login');
                    setIsAuthOpen(true);
                    return;
                  }
                  setActiveView('meet');
                  setViewingCreator(null);
                }}
                className={`w-12 h-12 rounded-full flex items-center justify-center transition-all group shrink-0 relative ${
                  activeView === 'meet' ? 'text-amber-800 bg-[#ebdcca]/40 font-bold' : 'text-[#8a8172] hover:text-[#3a342a] hover:bg-[#ebdcca]/20'
                }`}
                title="Random Video Calling"
              >
                <Video size={20} className={`transition-transform group-hover:scale-110 ${activeView === 'meet' ? 'text-amber-800' : 'text-[#8a8172] group-hover:text-[#3a342a]'}`} />
              </button>

              {/* Feed Tab */}
              <button
                onClick={() => {
                  setActiveView('feed');
                  setFeedSubTab('feed');
                  setViewingCreator(null);
                  setFeedSearchQuery('');
                }}
                className={`w-12 h-12 rounded-full flex items-center justify-center transition-all group shrink-0 relative ${
                  activeView === 'feed' ? 'text-amber-800 bg-[#ebdcca]/40 font-bold' : 'text-[#8a8172] hover:text-[#3a342a] hover:bg-[#ebdcca]/20'
                }`}
                title="View Posts Feed"
              >
                <Rss size={20} className={`transition-transform group-hover:scale-110 ${activeView === 'feed' ? 'text-amber-800' : 'text-[#8a8172] group-hover:text-[#3a342a]'}`} />
              </button>

              {/* Message Tab */}
              <button
                onClick={() => {
                  if (isActingAsAnonymous) {
                    showToast("⚠️ Anonymous profiles cannot chat. Turn off Anonymous Mode to access your inbox.");
                    return;
                  }
                  if (!token) {
                    showToast("🔒 Please Unlock Space to access your Secure Chat Inbox.");
                    setAuthTab('login');
                    setIsAuthOpen(true);
                    return;
                  }
                  setActiveView('chat');
                  setViewingCreator(null);
                }}
                className={`w-12 h-12 rounded-full flex items-center justify-center transition-all group shrink-0 relative ${
                  activeView === 'chat' ? 'text-amber-800 bg-[#ebdcca]/40 font-bold' : 'text-[#8a8172] hover:text-[#3a342a] hover:bg-[#ebdcca]/20'
                }`}
                title="Send Direct Message"
              >
                <MessageSquare size={20} className={`transition-transform group-hover:scale-110 ${activeView === 'chat' ? 'text-amber-800 animate-pulse' : 'text-[#8a8172] group-hover:text-[#3a342a]'}`} />
                {(notifications.some(n => n.type === 'chat_message' && !n.isRead) || (messages.length > 0 && token)) && (
                  <span className="absolute top-2.5 right-2.5 w-2.5 h-2.5 bg-rose-600 rounded-full border border-[#fcfaf4] animate-pulse shrink-0" />
                )}
              </button>

              {/* Alerts Tab */}
              <button
                onClick={() => {
                  setActiveView('alerts');
                  setViewingCreator(null);
                  handleMarkNotificationsAsRead();
                }}
                className={`w-12 h-12 rounded-full flex items-center justify-center transition-all group shrink-0 relative ${
                  activeView === 'alerts' ? 'text-amber-800 bg-[#ebdcca]/40 font-bold' : 'text-[#8a8172] hover:text-[#3a342a] hover:bg-[#ebdcca]/20'
                }`}
                title="Notifications"
              >
                {notifications.some(n => !n.isRead) && (
                  <span className="absolute top-3 right-3 w-1.5 h-1.5 bg-rose-600 rounded-full animate-ping" />
                )}
                {notifications.some(n => !n.isRead) && (
                  <span className="absolute top-3 right-3 w-1.5 h-1.5 bg-rose-600 rounded-full" />
                )}
                <Bell size={20} className={`transition-transform group-hover:scale-110 ${activeView === 'alerts' ? 'text-amber-800' : 'text-[#8a8172] group-hover:text-[#3a342a]'}`} />
              </button>


              {/* Plus/Publish Tab */}
              <button
                onClick={() => {
                  if (!token) {
                    showToast("🔒 Please Unlock Space to publish posts.");
                    setAuthTab('login');
                    setIsAuthOpen(true);
                    return;
                  }
                  setEditingFeedPost(null);
                  setAttachedImage('');
                  setAttachedVideo('');
                  setAttachedAudio('');
                  setIsTimeCapsule(false);
                  setIsNeedPost(false);
                  setNeedType('other');
                  setIsCreatePostOpen(true);
                }}
                className="w-12 h-12 rounded-full flex items-center justify-center bg-[#3a342a] text-[#f4f1ea] hover:bg-[#52493b] transition-all group shrink-0 shadow-sm cursor-pointer border border-[#ebdcca]/10"
                title="Create a new post"
              >
                <Upload size={20} className="transition-transform group-hover:scale-110 active:scale-95" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* SOS EMERGENCY ALERT BUTTON (port from base44, wired to the real /api/sos/alert backend) */}
      <SOSEmergencyButton currentUser={user} onShowToast={showToast} token={token} navSide={bottomNavSide} />

      {/* OFFLINE MESH — Bluetooth + LAN P2P messaging without internet */}
      <OfflineMeshFab currentUser={user} token={token} navSide={bottomNavSide} />

      {/* EMERGENCY COMMUNITY POOLS BUTTON (base44 Emergency page port) */}
      <motion.button
        onClick={() => setShowEmergencyPools(v => !v)}
        whileTap={{ scale: 0.92 }}
        className={`fixed bottom-24 ${bottomNavSide === 'right' ? 'left-6' : 'right-6'} z-[95] w-12 h-12 rounded-full bg-gradient-to-br from-amber-600 to-amber-800 text-white shadow-[0_8px_30px_rgba(217,119,6,0.4)] border border-amber-400/40 flex items-center justify-center cursor-pointer group`}
        title={showEmergencyPools ? 'Close Emergency Pools' : 'Emergency Pools'}
      >
        <Siren size={20} className={`transition-transform group-hover:scale-110 ${showEmergencyPools ? 'animate-pulse' : ''}`} />
      </motion.button>

      {/* EMERGENCY POOLS OVERLAY */}
      <AnimatePresence>
        {showEmergencyPools && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[115] bg-[#f6f1e7]/95 dark:bg-zinc-950/95 backdrop-blur-sm overflow-y-auto py-6 px-4"
          >
            <div className="flex items-center justify-between max-w-xl mx-auto mb-4">
              <span className="font-mono text-[10px] uppercase tracking-widest text-[#8a8172] dark:text-zinc-400">Emergency response</span>
              <button
                onClick={() => setShowEmergencyPools(false)}
                className="w-9 h-9 rounded-full bg-white/80 dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 flex items-center justify-center text-[#5c5446] dark:text-zinc-300 hover:bg-[#ebdcca]/50 transition-all"
              >
                <X size={16} />
              </button>
            </div>
            <EmergencyView token={token} currentUser={user} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* RECOVERY PHRASE VERIFICATION MODAL (arena-ai port) */}
      {showRecoveryVerify && recoveryPhrase && (
        <RecoveryVerifyModal
          open={showRecoveryVerify}
          onClose={() => setShowRecoveryVerify(false)}
          phrase={recoveryPhrase.split(' ')}
          onVerified={() => {
            setShowRecoveryVerify(false);
            showToast('✅ Recovery phrase verified');
          }}
        />
      )}

      {/* NEW FEATURES HUB (Ocean 109+) */}
      <AnimatePresence>
        {showNewFeaturesHub && (
          <NewFeaturesHub
            token={token}
            currentUser={user}
            onClose={() => setShowNewFeaturesHub(false)}
          />
        )}
      </AnimatePresence>

      {/* VISUAL SEARCH OVERLAY (feature 110 — Semantic Media Search) */}
      <AnimatePresence>
        {showVisualSearch && (
          <VisualSearch
            token={token}
            currentUser={user}
            onClose={() => setShowVisualSearch(false)}
          />
        )}
      </AnimatePresence>

      {/* CREATOR STUDIO OVERLAY (base44 creator studio port) */}
      <AnimatePresence>
        {showCreatorStudio && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[115] bg-[#f6f1e7]/95 dark:bg-zinc-950/95 backdrop-blur-sm overflow-y-auto py-6 px-4"
          >
            <div className="flex items-center justify-between max-w-2xl mx-auto mb-4">
              <span className="font-mono text-[10px] uppercase tracking-widest text-[#8a8172] dark:text-zinc-400">Creator Studio</span>
              <button
                onClick={() => setShowCreatorStudio(false)}
                className="w-9 h-9 rounded-full bg-white/80 dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 flex items-center justify-center text-[#5c5446] dark:text-zinc-300 hover:bg-[#ebdcca]/50 transition-all"
              >
                <X size={16} />
              </button>
            </div>
            <CreatorStudioView token={token} currentUser={user} onClose={() => setShowCreatorStudio(false)} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* GEOHASH NEARBY DISCOVERY OVERLAY (base44 geohash port) */}
      <AnimatePresence>
        {showGeohash && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[115] bg-[#f6f1e7]/95 dark:bg-zinc-950/95 backdrop-blur-sm overflow-y-auto py-6 px-4"
          >
            <div className="flex items-center justify-between max-w-2xl mx-auto mb-4">
              <span className="font-mono text-[10px] uppercase tracking-widest text-[#8a8172] dark:text-zinc-400">Nearby people</span>
              <button
                onClick={() => setShowGeohash(false)}
                className="w-9 h-9 rounded-full bg-white/80 dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 flex items-center justify-center text-[#5c5446] dark:text-zinc-300 hover:bg-[#ebdcca]/50 transition-all"
              >
                <X size={16} />
              </button>
            </div>
            <GeohashDiscovery token={token} currentUser={user} onClose={() => setShowGeohash(false)} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* RANDOM TEXT DM OVERLAY (base44 random text DM port) */}
      <AnimatePresence>
        {showRandomDm && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[115] bg-[#f6f1e7]/95 dark:bg-zinc-950/95 backdrop-blur-sm overflow-y-auto py-6 px-4"
          >
            <RandomTextDmView token={token} onClose={() => setShowRandomDm(false)} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ENCRYPTED TIME CAPSULE MODAL (base44 encrypted capsule port) */}
      {showTimeCapsuleComposer && (
        <EncryptedTimeCapsuleModal token={token} onClose={() => setShowTimeCapsuleComposer(false)} />
      )}

      {/* STREAM ADMIN DASHBOARD (manus admin port) */}
      <AnimatePresence>
        {showStreamAdmin && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[115] bg-[#f6f1e7]/95 dark:bg-zinc-950/95 backdrop-blur-sm overflow-y-auto py-6 px-4"
          >
            <div className="flex items-center justify-between max-w-2xl mx-auto mb-4">
              <span className="font-mono text-[10px] uppercase tracking-widest text-[#8a8172] dark:text-zinc-400">Stream API Admin</span>
              <button
                onClick={() => setShowStreamAdmin(false)}
                className="w-9 h-9 rounded-full bg-white/80 dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 flex items-center justify-center text-[#5c5446] dark:text-zinc-300 hover:bg-[#ebdcca]/50 transition-all"
              >
                <X size={16} />
              </button>
            </div>
            <StreamAdminDashboard token={token} currentUser={user} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* RANKING ENGINE DEMO OVERLAY (hybrid-engine InteractiveDemo + ArchitectureDiagram) */}
      <AnimatePresence>
        {showRankingDemo && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[115] bg-[#f6f1e7]/95 dark:bg-zinc-950/95 backdrop-blur-sm overflow-y-auto py-6 px-4"
          >
            <div className="flex items-center justify-between max-w-2xl mx-auto mb-4">
              <span className="font-mono text-[10px] uppercase tracking-widest text-[#8a8172] dark:text-zinc-400">Feed ranking engine</span>
              <button
                onClick={() => setShowRankingDemo(false)}
                className="w-9 h-9 rounded-full bg-white/80 dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 flex items-center justify-center text-[#5c5446] dark:text-zinc-300 hover:bg-[#ebdcca]/50 transition-all"
              >
                <X size={16} />
              </button>
            </div>
            <div className="max-w-2xl mx-auto space-y-6">
              <InteractiveDemo />
              <ArchitectureDiagram />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* AWAY SUMMARY CARD (base44 AwaySummary port) */}
      <AnimatePresence>
        {showAwaySummary && (
          <motion.div
            initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}
            className="fixed top-16 right-4 z-[110] w-[min(92vw,340px)]"
          >
            <AwaySummaryCard
              token={token}
              items={awaySummaryItems}
              onDismiss={() => setShowAwaySummary(false)}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* FLOATING TOP-LEFT SEARCH HEADER BUTTON */}
      {(activeView === 'feed' || activeView === 'explore') && (
        <motion.div
          key={`top-nav-${topNavSide}`}
          drag="x"
          dragConstraints={{ left: topNavSide === 'left' ? 0 : -250, right: topNavSide === 'left' ? 250 : 0 }}
          dragElastic={0.1}
          dragSnapToOrigin={true}
          dragMomentum={false}
          onDragEnd={(event, info) => {
            const offset = info.offset.x;
            if (Math.abs(offset) > 30) {
              let newSide = topNavSide;
              if (topNavSide === 'left' && offset > 30) {
                newSide = 'right';
              } else if (topNavSide === 'right' && offset < -30) {
                newSide = 'left';
              }
              if (newSide !== topNavSide) {
                setTopNavSide(newSide);
                localStorage.setItem('top_nav_side', newSide);
              }
            }
          }}
          animate={{
            y: showFeedHeader ? 0 : -100,
            opacity: (showFeedHeader && !isNavbarInactive) ? 1 : 0,
            pointerEvents: (showFeedHeader && !isNavbarInactive) ? 'auto' : 'none',
            x: 0,
          }}
          transition={{
            y: { type: 'spring', stiffness: 280, damping: 24 },
            opacity: { duration: isNavbarInactive ? 0.45 : 0.05 },
            x: { type: 'spring', stiffness: 300, damping: 25 },
          }}
          className={`fixed top-6 ${topNavSide === 'left' ? 'left-6' : 'right-6'} z-50 select-none flex flex-col items-center gap-2 touch-none cursor-grab active:cursor-grabbing`}
          title="Drag horizontal to place on left or right!"
        >
          <button
            onClick={() => {
              setActiveView('search');
              setViewingCreator(null);
            }}
            className={`w-12 h-12 rounded-full flex items-center justify-center transition-all group shadow-lg hover:shadow-xl border border-[#ebdcca] ${
              activeView === 'explore' 
                ? 'bg-[#3a342a] text-[#f4f1ea]' 
                : 'bg-[#fdfbf7]/95 backdrop-blur-md text-[#8a8172] hover:text-[#3a342a]'
            }`}
            title="Search & Explore"
          >
            <Search size={15} className="transition-transform group-hover:scale-110" />
          </button>

          {/* Small dots container below search icon */}
          <div className="flex items-center gap-2 px-2.5 py-1 rounded-full border border-[#ebdcca]/80 bg-[#fdfbf7]/95 backdrop-blur-md shadow-sm" title="Select Feed Mode">
            {/* Tab 1: Explore (Dot 1) */}
            <button
              onClick={() => {
                setFeedSubTab('explore');
                setActiveView('feed');
                setViewingCreator(null);
                setFeedSearchQuery('');
                showToast("🧭 Switched to Explore Feed");
              }}
              className={`w-2 h-2 rounded-full transition-all duration-300 cursor-pointer ${
                activeView === 'feed' && feedSubTab === 'explore' 
                  ? 'bg-[#3a342a] scale-110 shadow-3xs' 
                  : 'bg-[#8a8172]/40 hover:bg-[#8a8172]'
              }`}
              title="Explore Feed"
              aria-label="Explore Feed"
            />

            {/* Tab 2: Feed (Dot 2) */}
            <button
              onClick={() => {
                setFeedSubTab('feed');
                setActiveView('feed');
                setViewingCreator(null);
                setFeedSearchQuery('');
                showToast("📰 Switched to Secure Live Feed");
              }}
              className={`w-2 h-2 rounded-full transition-all duration-300 cursor-pointer ${
                activeView === 'feed' && feedSubTab === 'feed' 
                  ? 'bg-[#3a342a] scale-110 shadow-3xs' 
                  : 'bg-[#8a8172]/40 hover:bg-[#8a8172]'
              }`}
              title="Live Feed"
              aria-label="Live Feed"
            />

            {/* Tab 3: Reels (Dot 3) */}
            <button
              onClick={() => {
                setFeedSubTab('reels');
                setActiveView('feed');
                setViewingCreator(null);
                setFeedSearchQuery('');
                showToast("🎬 Switched to Immersive Reels");
              }}
              className={`w-2 h-2 rounded-full transition-all duration-300 cursor-pointer ${
                activeView === 'feed' && feedSubTab === 'reels' 
                  ? 'bg-[#3a342a] scale-110 shadow-3xs' 
                  : 'bg-[#8a8172]/40 hover:bg-[#8a8172]'
              }`}
              title="Immersive Reels"
              aria-label="Immersive Reels"
            />

            {/* Tab 4: Voice Feed (Dot 4) */}
            <button
              onClick={() => {
                setFeedSubTab('voice');
                setActiveView('feed');
                setViewingCreator(null);
                setFeedSearchQuery('');
                showToast("🎙️ Switched to Voice Feed");
              }}
              className={`w-2 h-2 rounded-full transition-all duration-300 cursor-pointer ${
                activeView === 'feed' && feedSubTab === 'voice' 
                  ? 'bg-[#3a342a] scale-110 shadow-3xs' 
                  : 'bg-[#8a8172]/40 hover:bg-[#8a8172]'
              }`}
              title="Voice Feed"
              aria-label="Voice Feed"
            />
          </div>
        </motion.div>
      )}

      {/* TOAST NOTIFICATION CONTAINER */}
      <AnimatePresence>
        {toastText && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-24 right-6 z-50 bg-[#3a342a] text-[#f4f1ea] px-4 py-2.5 rounded-xl text-xs font-mono font-bold shadow-md flex items-center gap-2 border border-[#cfcac0]/40"
          >
            <Sparkles size={14} className="text-[#ebdcca]" />
            <span>{toastText}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* UPLOADING POST INDICATOR */}
      <AnimatePresence>
        {isUploadingPost && (
          <motion.div
            initial={{ opacity: 0, y: -50, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -50, scale: 0.95 }}
            className="fixed top-6 left-1/2 -translate-x-1/2 z-[100] bg-[#3a342a] text-[#fcfaf4] px-5 py-3 rounded-2xl shadow-2xl border border-[#cfcac0]/30 flex items-center gap-3.5"
          >
            <div className="relative flex items-center justify-center">
              <div className="w-5 h-5 rounded-full border-2 border-amber-200/30 border-t-amber-500 animate-spin" />
            </div>
            <div className="flex flex-col text-left">
              <span className="font-sans font-bold text-xs tracking-tight text-white">Uploading your post...</span>
              <span className="font-mono text-[9px] text-[#cfcac0] leading-none uppercase mt-0.5">Please wait, synchronizing feed</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* =======================================================
          SECURE CREDENTIALS & DECRYPTION SYSTEM DIALOG (AUTH MODAL)
          ======================================================= */}
      <AnimatePresence>
        {isAuthOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#2e2920]/75 backdrop-blur-md">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[#fcfaf4] border border-[#ebdcca] rounded-3xl p-6 md:p-8 max-w-md w-full shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto"
            >
              {/* HEADER */}
              <div className="flex items-center justify-between border-b border-[#ebdcca] pb-4">
                <div className="flex items-center gap-2">
                  <Shield className="text-[#8a8172]" size={18} />
                  <h3 className="font-display font-black text-base text-[#3a342a] tracking-tight uppercase">
                    {signupWords ? "Backup Recovery Words" : "Secure Gatekeeper"}
                  </h3>
                </div>
                {!signupWords && (
                  <button
                    onClick={() => setIsAuthOpen(false)}
                    className="text-[#8a8172] hover:text-[#3a342a] p-1.5 rounded-lg hover:bg-[#ebdcca]/20 transition-colors"
                  >
                    <X size={16} />
                  </button>
                )}
              </div>

              {/* ERROR STATE CARD (Support rate limit messages cleanly) */}
              {authError && (
                <div className="bg-rose-50 border border-rose-200 text-rose-800 p-3.5 rounded-2xl text-xs flex gap-2.5">
                  <Check className="text-rose-600 rotate-45 shrink-0 mt-0.5" size={14} />
                  <div className="space-y-0.5">
                    <p className="font-bold font-mono text-[9px] uppercase tracking-wider text-rose-700">Security Access Alert</p>
                    <p className="leading-relaxed font-sans">{authError}</p>
                  </div>
                </div>
              )}

              {/* SIGNUP DEK GENERATION WORDS DISPLAY (Must only show exactly once) */}
              {signupWords ? (
                <div className="space-y-5">
                  <div className="bg-amber-50/80 border border-amber-200 p-4 rounded-2xl text-xs text-amber-900 space-y-2">
                    <p className="font-bold font-mono text-[9px] uppercase tracking-wider text-amber-800">
                      ⚠️ CRITICAL STORAGE DIRECTIVE
                    </p>
                    <p className="leading-relaxed">
                      Screenshot this or write it down. You will need specific words from this list to reset your password or view them again. We cannot recover these for you.
                    </p>
                  </div>

                  {/* 12 WORDS GRID */}
                  <div className="grid grid-cols-3 gap-2.5 bg-[#f5f2eb] p-4 rounded-2xl border border-[#ebdcca]">
                    {signupWords.map((word, idx) => (
                      <div key={idx} className="bg-white border border-[#ebdcca] rounded-xl py-2 px-2.5 flex items-center gap-1.5 font-mono text-[11px]">
                        <span className="text-[#8a8172] font-bold text-[9px] w-4 text-right">{idx + 1}.</span>
                        <span className="text-[#3a342a] font-bold">{word}</span>
                      </div>
                    ))}
                  </div>

                  {/* MANDATORY CHECKBOX */}
                  <label className="flex items-start gap-2.5 p-1 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={hasConfirmedWords}
                      onChange={(e) => setHasConfirmedWords(e.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded border-gray-300 text-amber-900 focus:ring-amber-800"
                    />
                    <span className="text-[11px] text-[#5c5446] leading-relaxed font-medium">
                      I have saved my words securely. I understand that if I lose them, I will lose access to my recovery keys permanently.
                    </span>
                  </label>

                  {/* CONTINUE BUTTON */}
                  <button
                    onClick={completeSignUpFlow}
                    disabled={!hasConfirmedWords || authLoading}
                    className={`w-full font-mono text-[10px] uppercase font-bold py-2.5 rounded-xl shadow-xs transition-colors flex items-center justify-center gap-1.5 ${
                      hasConfirmedWords && !authLoading
                        ? 'bg-[#3a342a] hover:bg-[#52493b] text-[#f4f1ea]'
                        : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                    }`}
                  >
                    {authLoading ? (
                      <div className="w-3.5 h-3.5 border-2 border-[#f4f1ea] border-t-transparent rounded-full animate-spin"></div>
                    ) : (
                      <Check size={12} />
                    )}
                    Enter Workspace
                  </button>
                </div>
              ) : (
                <>
                  {/* TABS (No theme presets, simple modern) */}
                  {(authTab === 'login' || authTab === 'signup') && (
                    <div className="bg-[#ebdcca]/40 border border-[#ebdcca]/60 p-1 rounded-xl grid grid-cols-2 text-center h-9 items-center">
                      <button
                        onClick={() => { setAuthTab('login'); setAuthError(''); }}
                        className={`text-[10px] font-mono uppercase font-bold py-1 rounded-lg transition-all ${
                          authTab === 'login' ? 'bg-[#3a342a] text-[#f4f1ea] shadow-xs' : 'text-[#8a8172] hover:text-[#3a342a]'
                        }`}
                      >
                        Unlock Space
                      </button>
                      <button
                        onClick={() => { setAuthTab('signup'); setAuthError(''); }}
                        className={`text-[10px] font-mono uppercase font-bold py-1 rounded-lg transition-all ${
                          authTab === 'signup' ? 'bg-[#3a342a] text-[#f4f1ea] shadow-xs' : 'text-[#8a8172] hover:text-[#3a342a]'
                        }`}
                      >
                        Register
                      </button>
                    </div>
                  )}

                  {/* 1. LOGIN FORM */}
                  {authTab === 'login' && (
                    <form onSubmit={handleLoginSubmit} className="space-y-4">
                      <div className="space-y-1.5">
                        <label className="block text-[9px] font-mono text-[#8a8172] uppercase tracking-wider font-bold">Email Address</label>
                        <input
                          type="email"
                          value={loginEmail}
                          onChange={(e) => setLoginEmail(e.target.value)}
                          placeholder="Enter email"
                          className="w-full bg-white border border-[#cfcac0] rounded-xl px-3 py-2 font-sans text-xs text-[#5c5446] focus:outline-none focus:ring-1 focus:ring-[#8a8172]"
                          required
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="block text-[9px] font-mono text-[#8a8172] uppercase tracking-wider font-bold">Password</label>
                        <input
                          type="password"
                          value={loginPassword}
                          onChange={(e) => setLoginPassword(e.target.value)}
                          placeholder="••••••••••••"
                          className="w-full bg-white border border-[#cfcac0] rounded-xl px-3 py-2 font-sans text-xs text-[#5c5446] focus:outline-none focus:ring-1 focus:ring-[#8a8172]"
                          required
                        />
                      </div>



                      <button
                        type="submit"
                        disabled={authLoading}
                        className="w-full font-mono text-[10px] uppercase font-bold text-[#f4f1ea] bg-[#3a342a] hover:bg-[#52493b] py-2.5 rounded-xl shadow-xs transition-colors flex items-center justify-center gap-1.5"
                      >
                        {authLoading ? (
                          <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        ) : (
                          <Unlock size={12} />
                        )}
                        Unlock Workspace
                      </button>
                    </form>
                  )}

                  {/* 2. SIGN UP FORM */}
                  {authTab === 'signup' && (
                    <form onSubmit={handleSignUpSubmit} className="space-y-4">
                      <div className="space-y-1.5">
                        <label className="block text-[9px] font-mono text-[#8a8172] uppercase tracking-wider font-bold">Full Name</label>
                        <input
                          type="text"
                          value={signupName}
                          onChange={(e) => setSignupName(e.target.value)}
                          placeholder="Enter full name"
                          className="w-full bg-white border border-[#cfcac0] rounded-xl px-3 py-2 font-sans text-xs text-[#5c5446] focus:outline-none focus:ring-1 focus:ring-[#8a8172]"
                          required
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="block text-[9px] font-mono text-[#8a8172] uppercase tracking-wider font-bold">Email Address</label>
                        <input
                          type="email"
                          value={signupEmail}
                          onChange={(e) => setSignupEmail(e.target.value)}
                          placeholder="Enter email"
                          className="w-full bg-white border border-[#cfcac0] rounded-xl px-3 py-2 font-sans text-xs text-[#5c5446] focus:outline-none focus:ring-1 focus:ring-[#8a8172]"
                          required
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="block text-[9px] font-mono text-[#8a8172] uppercase tracking-wider font-bold">Master Password</label>
                        <input
                          type="password"
                          value={signupPassword}
                          onChange={(e) => setSignupPassword(e.target.value)}
                          placeholder="Min 6 characters recommended"
                          className="w-full bg-white border border-[#cfcac0] rounded-xl px-3 py-2 font-sans text-xs text-[#5c5446] focus:outline-none focus:ring-1 focus:ring-[#8a8172]"
                          required
                        />
                      </div>

                      <button
                        type="submit"
                        disabled={authLoading}
                        className="w-full font-mono text-[10px] uppercase font-bold text-[#f4f1ea] bg-[#3a342a] hover:bg-[#52493b] py-2.5 rounded-xl shadow-xs transition-colors flex items-center justify-center gap-1.5"
                      >
                        {authLoading ? (
                          <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        ) : (
                          <UserPlus size={12} />
                        )}
                        Generate Secure Credentials
                      </button>
                    </form>
                  )}

                  {/* 3. FORGOT PASSWORD / REQUEST RESET FORM */}
                  {authTab === 'reset-request' && (
                    <form onSubmit={handleResetRequest} className="space-y-4">
                      <p className="text-xs text-[#5c5446] leading-relaxed">
                        Specify your workspace email. The envelope crypto gatekeeper will challenge you to input 4 specific positions from your 12 recovery words list.
                      </p>
                      
                      <div className="space-y-1.5">
                        <label className="block text-[9px] font-mono text-[#8a8172] uppercase tracking-wider font-bold">Workspace Email</label>
                        <input
                          type="email"
                          value={resetEmail}
                          onChange={(e) => setResetEmail(e.target.value)}
                          placeholder="Enter email"
                          className="w-full bg-white border border-[#cfcac0] rounded-xl px-3 py-2 font-sans text-xs text-[#5c5446] focus:outline-none focus:ring-1 focus:ring-[#8a8172]"
                          required
                        />
                      </div>

                      <div className="flex gap-2.5">
                        <button
                          type="button"
                          onClick={() => setAuthTab('login')}
                          className="w-1/2 font-mono text-[10px] uppercase font-bold text-[#3a342a] bg-transparent border border-[#cfcac0] hover:bg-[#ebdcca]/20 py-2.5 rounded-xl transition-all"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={authLoading}
                          className="w-1/2 font-mono text-[10px] uppercase font-bold text-[#f4f1ea] bg-[#3a342a] hover:bg-[#52493b] py-2.5 rounded-xl shadow-xs transition-colors flex items-center justify-center gap-1.5"
                        >
                          {authLoading ? (
                            <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                          ) : (
                            <Compass size={12} />
                          )}
                          Query Positions
                        </button>
                      </div>
                    </form>
                  )}

                  {/* 4. VERIFY RECOVERY WORDS RESET ACTION */}
                  {authTab === 'reset-verify' && (
                    <form onSubmit={handleResetConfirm} className="space-y-4">
                      <div className="bg-amber-50/70 border border-amber-200 text-amber-900 p-3 rounded-2xl text-[11px] leading-relaxed">
                        🔒 Authenticate your recovery ownership by writing exact, case-insensitive words matching the positions queried below.
                      </div>

                      <div className="space-y-3">
                        {resetPositions.map((pos) => (
                          <div key={pos} className="flex items-center gap-3 bg-[#fdfbf7] border border-[#ebdcca] p-2.5 rounded-xl">
                            <span className="font-mono text-[11px] font-bold text-[#8a8172] w-20 shrink-0">
                              Word #{pos}:
                            </span>
                            <input
                              type="text"
                              value={resetAnswers[pos] || ''}
                              onChange={(e) => setResetAnswers({ ...resetAnswers, [pos]: e.target.value })}
                              placeholder={`Word at position ${pos}...`}
                              className="w-full bg-white border border-[#cfcac0] rounded-lg px-2.5 py-1 font-sans text-xs text-[#5c5446] focus:outline-none focus:ring-1 focus:ring-[#8a8172]"
                              required
                              autoComplete="off"
                              autoCorrect="off"
                              autoCapitalize="off"
                              spellCheck="false"
                            />
                          </div>
                        ))}
                      </div>

                      <div className="space-y-1.5 pt-2 border-t border-[#ebdcca]/60">
                        <label className="block text-[9px] font-mono text-[#8a8172] uppercase tracking-wider font-bold">New Master Password</label>
                        <input
                          type="password"
                          value={resetNewPassword}
                          onChange={(e) => setResetNewPassword(e.target.value)}
                          placeholder="Enter your new password"
                          className="w-full bg-white border border-[#cfcac0] rounded-xl px-3 py-2 font-sans text-xs text-[#5c5446] focus:outline-none focus:ring-1 focus:ring-[#8a8172]"
                          required
                        />
                      </div>

                      <div className="flex gap-2.5">
                        <button
                          type="button"
                          onClick={() => setAuthTab('reset-request')}
                          className="w-1/2 font-mono text-[10px] uppercase font-bold text-[#3a342a] bg-transparent border border-[#cfcac0] hover:bg-[#ebdcca]/20 py-2.5 rounded-xl transition-all"
                        >
                          Back
                        </button>
                        <button
                          type="submit"
                          disabled={authLoading}
                          className="w-1/2 font-mono text-[10px] uppercase font-bold text-[#f4f1ea] bg-[#3a342a] hover:bg-[#52493b] py-2.5 rounded-xl shadow-xs transition-colors flex items-center justify-center gap-1.5"
                        >
                          {authLoading ? (
                            <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                          ) : (
                            <Check size={12} />
                          )}
                          Set New Key
                        </button>
                      </div>
                    </form>
                  )}
                </>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* =======================================================
          VIEW RECOVERY WORDS VERIFICATION DIALOG
          ======================================================= */}
      <AnimatePresence>
        {isViewWordsOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#2e2920]/75 backdrop-blur-md">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[#fcfaf4] border border-[#ebdcca] rounded-3xl p-6 md:p-8 max-w-md w-full shadow-2xl space-y-6"
            >
              <div className="flex items-center justify-between border-b border-[#ebdcca] pb-4">
                <div className="flex items-center gap-2">
                  <Shield className="text-[#8a8172]" size={18} />
                  <h3 className="font-display font-black text-base text-[#3a342a] tracking-tight uppercase">
                    Recovery Access Key
                  </h3>
                </div>
                <button
                  onClick={() => {
                    setIsViewWordsOpen(false);
                    setViewWordsResult(null);
                    setViewWordsPassword('');
                    setViewWordsError('');
                  }}
                  className="text-[#8a8172] hover:text-[#3a342a] p-1.5 rounded-lg hover:bg-[#ebdcca]/20 transition-colors"
                >
                  <X size={16} />
                </button>
              </div>

              {viewWordsError && (
                <div className="bg-rose-50 border border-rose-200 text-rose-800 p-3.5 rounded-xl text-xs">
                  {viewWordsError}
                </div>
              )}

              {viewWordsResult ? (
                <div className="space-y-4">
                  <div className="bg-amber-50/70 border border-amber-200 p-3.5 rounded-2xl text-[11px] text-amber-900 leading-relaxed font-sans">
                    These are your 12 unique recovery words, securely decrypted via your custom Data Encryption Key. Write them down securely.
                  </div>

                  <div className="grid grid-cols-3 gap-2.5 bg-[#f5f2eb] p-4 rounded-2xl border border-[#ebdcca]">
                    {viewWordsResult.map((word, idx) => (
                      <div key={idx} className="bg-white border border-[#ebdcca] rounded-xl py-2 px-2.5 flex items-center gap-1.5 font-mono text-[11px]">
                        <span className="text-[#8a8172] font-bold text-[9px] w-4 text-right">{idx + 1}.</span>
                        <span className="text-[#3a342a] font-bold">{word}</span>
                      </div>
                    ))}
                  </div>

                  <button
                    onClick={() => {
                      setIsViewWordsOpen(false);
                      setViewWordsResult(null);
                    }}
                    className="w-full font-mono text-[10px] uppercase font-bold py-2.5 rounded-xl bg-[#3a342a] hover:bg-[#52493b] text-[#f4f1ea] transition-all"
                  >
                    Close Words Display
                  </button>
                </div>
              ) : (
                <form onSubmit={handleViewRecoveryWordsSubmit} className="space-y-4">
                  <p className="text-xs text-[#5c5446] leading-relaxed">
                    To decrypt and view your 12 recovery words, re-enter your current password below. To prevent brute force, this display is strictly limited to 1 attempt per hour.
                  </p>

                  <div className="space-y-1.5">
                    <label className="block text-[9px] font-mono text-[#8a8172] uppercase tracking-wider font-bold">Verify Password</label>
                    <input
                      type="password"
                      value={viewWordsPassword}
                      onChange={(e) => setViewWordsPassword(e.target.value)}
                      placeholder="••••••••••••"
                      className="w-full bg-white border border-[#cfcac0] rounded-xl px-3 py-2 font-sans text-xs text-[#5c5446] focus:outline-none focus:ring-1 focus:ring-[#8a8172]"
                      required
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={viewWordsLoading}
                    className="w-full font-mono text-[10px] uppercase font-bold text-[#f4f1ea] bg-[#3a342a] hover:bg-[#52493b] py-2.5 rounded-xl shadow-xs transition-colors flex items-center justify-center gap-1.5"
                  >
                    {viewWordsLoading ? (
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    ) : (
                      <Unlock size={12} />
                    )}
                    Decrypt Recovery Words
                  </button>
                </form>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* =======================================================
          THEATRICAL WIDESCREEN VIDEO PLAYER OVERLAY (Matches 2nd Image)
          ======================================================= */}
      <AnimatePresence>
        {selectedVideo && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-slate-950/98 backdrop-blur-xl flex flex-col md:flex-row overflow-hidden text-slate-100"
          >
            {/* Left Column: Premium Interactive Widescreen Player Panel */}
            <div className="flex-1 flex flex-col justify-between relative bg-black p-4 md:p-6 overflow-hidden min-h-[40vh] md:min-h-0">
              {/* Top Navigation Bar inside Theater */}
              <div className="flex items-center justify-between z-10">
                <div className="flex items-center gap-3">
                  <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                  <span className="font-mono text-[9px] uppercase tracking-widest text-amber-400 font-bold">
                    OCEAN BROADCAST STREAM • HIGH RESOLUTION
                  </span>
                </div>
                <button
                  onClick={() => {
                    setSelectedVideo(null);
                    setIsVideoPlaying(false);
                    showToast("📺 Returned to broadcast directory");
                  }}
                  className="bg-white/10 hover:bg-white/20 text-white rounded-full p-2.5 transition-all cursor-pointer shadow-lg"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Central Widescreen Simulated Playback Frame */}
              <div className="relative aspect-[16/9] w-full max-w-4xl mx-auto rounded-2xl overflow-hidden border border-white/10 shadow-2xl bg-slate-900 group">
                {/* Real-time Video Stream/Thumbnail Image */}
                <img
                  src={selectedVideo.thumbnailUrl || null}
                  alt={selectedVideo.title}
                  className={`w-full h-full object-cover transition-all duration-1000 ${
                    isVideoPlaying ? 'brightness-90 scale-[1.01]' : 'brightness-50'
                  }`}
                  referrerPolicy="no-referrer"
                />

                {/* Shimmer/Overlay Scanlines */}
                <div className="absolute inset-0 bg-linear-to-b from-transparent via-white/5 to-transparent opacity-20 pointer-events-none" />

                {/* Simulated Wave Equalizer Overlay (Shows when playing) */}
                {isVideoPlaying && (
                  <div className="absolute bottom-16 left-6 flex items-end gap-1 h-6 pointer-events-none opacity-85">
                    {[0.6, 1.2, 0.4, 1.5, 0.8, 1.3, 0.5, 1.1, 0.9, 0.7, 1.4].map((delay, idx) => (
                      <motion.div
                        key={idx}
                        animate={{ height: ['4px', '24px', '4px'] }}
                        transition={{ duration: 0.8, repeat: Infinity, delay: delay * 0.4, ease: 'easeInOut' }}
                        className="w-1 bg-amber-400 rounded-full"
                      />
                    ))}
                  </div>
                )}

                {/* Subtitle Telemetry Display (Updates every few seconds) */}
                <div className="absolute bottom-16 inset-x-8 text-center pointer-events-none drop-shadow-lg z-10 px-4">
                  <AnimatePresence mode="wait">
                    {isVideoPlaying && (
                      <motion.p
                        key={Math.floor(videoPlaybackSeconds / 4) % (selectedVideo.subtitles?.length || 1)}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ duration: 0.4 }}
                        className="bg-black/80 backdrop-blur-md border border-white/10 inline-block px-4 py-2 rounded-xl text-xs md:text-sm font-sans tracking-wide leading-relaxed font-semibold max-w-xl text-amber-300"
                      >
                        {selectedVideo.subtitles?.[Math.floor(videoPlaybackSeconds / 4) % (selectedVideo.subtitles?.length || 1)] || "Loading uncompressed secure stream telemetry..."}
                      </motion.p>
                    )}
                  </AnimatePresence>
                </div>

                {/* Big Center Play/Pause Toggle Overlay (Visible on hover or when paused) */}
                <div 
                  onClick={() => setIsVideoPlaying(!isVideoPlaying)}
                  className={`absolute inset-0 flex items-center justify-center cursor-pointer transition-opacity duration-300 ${
                    isVideoPlaying ? 'opacity-0 group-hover:opacity-100 bg-black/10' : 'opacity-100 bg-black/40'
                  }`}
                >
                  <div className="w-18 h-18 rounded-full bg-amber-400 text-black flex items-center justify-center shadow-2xl transform hover:scale-105 transition-all duration-300">
                    {isVideoPlaying ? (
                      <Pause size={24} className="fill-black text-black" />
                    ) : (
                      <Play size={24} className="fill-black text-black ml-1.5" />
                    )}
                  </div>
                </div>
              </div>

              {/* Real-time Custom Playback Control Bar Panel */}
              <div className="bg-slate-900/60 border border-white/5 backdrop-blur-md rounded-2xl p-4 w-full max-w-4xl mx-auto space-y-3">
                {/* Scrubbing Timeline Progress Bar */}
                <div className="space-y-1.5">
                  <div className="relative w-full h-1.5 bg-slate-800 rounded-full overflow-hidden cursor-pointer">
                    <motion.div 
                      className="absolute left-0 top-0 bottom-0 bg-amber-400 rounded-full"
                      style={{ width: `${(videoPlaybackSeconds / 40) * 100}%` }}
                    />
                  </div>
                  <div className="flex justify-between items-center font-mono text-[9px] text-slate-400 leading-none">
                    <span>
                      0:{videoPlaybackSeconds < 10 ? `0${videoPlaybackSeconds}` : videoPlaybackSeconds}
                    </span>
                    <span className="text-amber-400/80">LIVE BROADCAST LATENCY: 12ms</span>
                    <span>1:40</span>
                  </div>
                </div>

                {/* Control Icons Row */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <button 
                      onClick={() => {
                        setIsVideoPlaying(!isVideoPlaying);
                        showToast(isVideoPlaying ? "⏸️ Broadcast paused" : "▶️ Broadcast resumed");
                      }}
                      className="text-slate-300 hover:text-amber-400 transition-colors cursor-pointer"
                    >
                      {isVideoPlaying ? <Pause size={18} /> : <Play size={18} />}
                    </button>
                    <div className="flex items-center gap-2">
                      <Volume2 size={16} className="text-slate-400" />
                      <div className="w-16 h-1 bg-slate-700 rounded-full overflow-hidden">
                        <div className="bg-amber-400 h-full w-[85%]" />
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 font-mono text-[9px]">
                    <span className="bg-amber-500/10 text-amber-400 border border-amber-400/20 px-2 py-0.5 rounded-md font-bold uppercase tracking-wider">
                      1080P PRO
                    </span>
                    <button 
                      onClick={() => {
                        setVideoPlaybackSeconds(0);
                        showToast("🔁 Broadcast Stream Reloaded");
                      }}
                      className="text-slate-400 hover:text-white transition-colors cursor-pointer"
                    >
                      RELOAD
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column: High-Density Interactive Sidebar Area */}
            <div className="w-full md:w-[380px] border-t md:border-t-0 md:border-l border-white/10 bg-slate-900/95 backdrop-blur-md flex flex-col justify-between overflow-y-auto">
              {/* Creator & Subscription Status Header Panel */}
              <div className="p-5 border-b border-white/10 space-y-4">
                <div className="flex items-start gap-3">
                  <img
                    src={selectedVideo.creatorAvatarUrl || null}
                    alt={selectedVideo.creatorName}
                    className="w-11 h-11 rounded-2xl object-cover border border-white/10 shrink-0"
                    referrerPolicy="no-referrer"
                  />
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-1.5">
                      <h4 className="font-sans font-bold text-sm text-slate-100 truncate">{selectedVideo.creatorName}</h4>
                      <span className="text-[10px] text-amber-400" title="Verified Broadcast Network">✓</span>
                    </div>
                    <p className="font-mono text-[9px] text-slate-400 leading-none">{selectedVideo.creatorHandle}</p>
                  </div>

                  {/* Channel Subscribe Button (Synced with Rest of Channels) */}
                  {(() => {
                    const isSubscribed = channelSubscriptions.includes(selectedVideo.creatorHandle);
                    return (
                      <button
                        onClick={() => {
                          let updated: string[];
                          if (isSubscribed) {
                            updated = channelSubscriptions.filter(h => h !== selectedVideo.creatorHandle);
                            showToast(`🔔 Unsubscribed from ${selectedVideo.creatorHandle}`);
                          } else {
                            updated = [...channelSubscriptions, selectedVideo.creatorHandle];
                            showToast(`🔔 Subscribed to ${selectedVideo.creatorHandle}`);
                          }
                          setChannelSubscriptions(updated);
                          localStorage.setItem('secure_channel_subs', JSON.stringify(updated));
                        }}
                        className={`font-mono text-[8.5px] uppercase font-black px-3 py-1.5 rounded-xl transition-all border cursor-pointer ${
                          isSubscribed
                            ? 'bg-transparent border-white/10 text-slate-400 hover:bg-white/5'
                            : 'bg-amber-400 border-amber-400 text-black font-black hover:bg-amber-300'
                        }`}
                      >
                        {isSubscribed ? 'Subscribed' : '+ Subscribe'}
                      </button>
                    );
                  })()}
                </div>

                {/* Primary Stats Panel & Interactive Controls (Like & Bookmark Save) */}
                <div className="flex items-center justify-between pt-1 border-t border-white/5">
                  <div className="font-mono text-[9px] text-slate-400 space-y-0.5">
                    <div>{selectedVideo.views} VIEWS</div>
                    <div>RELEASED {selectedVideo.timeAgo.toUpperCase()}</div>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Persistent Like Button */}
                    {(() => {
                      const isLiked = !!videoLikesState[selectedVideo.id];
                      return (
                        <button
                          onClick={() => {
                            const nextState = !isLiked;
                            const updated = { ...videoLikesState, [selectedVideo.id]: nextState };
                            setVideoLikesState(updated);
                            localStorage.setItem('ocean_video_likes_state', JSON.stringify(updated));
                            showToast(nextState ? "❤️ Added video to Liked transmissions" : "💔 Removed video from Liked list");
                          }}
                          className={`p-2.5 rounded-xl border transition-all flex items-center justify-center gap-1.5 font-mono text-[9.5px] font-bold cursor-pointer ${
                            isLiked
                              ? 'bg-rose-500/15 border-rose-500/30 text-rose-400 font-extrabold'
                              : 'bg-white/5 border-white/5 text-slate-300 hover:bg-white/10'
                          }`}
                        >
                          <Heart size={14} className={isLiked ? "fill-rose-400 text-rose-400" : ""} />
                          <span>{isLiked ? 'Liked' : 'Like'}</span>
                        </button>
                      );
                    })()}

                    {/* Persistent Bookmark Save Button */}
                    {(() => {
                      const isSaved = !!videoSavedState[selectedVideo.id];
                      return (
                        <button
                          onClick={() => {
                            const nextState = !isSaved;
                            const updated = { ...videoSavedState, [selectedVideo.id]: nextState };
                            setVideoSavedState(updated);
                            localStorage.setItem('ocean_video_saved_state', JSON.stringify(updated));
                            showToast(nextState ? "🔖 Video saved to library catalog" : "🗑️ Removed from catalog");
                          }}
                          className={`p-2.5 rounded-xl border transition-all flex items-center justify-center gap-1.5 font-mono text-[9.5px] font-bold cursor-pointer ${
                            isSaved
                              ? 'bg-amber-500/15 border-amber-500/30 text-amber-300 font-extrabold'
                              : 'bg-white/5 border-white/5 text-slate-300 hover:bg-white/10'
                          }`}
                        >
                          <Bookmark size={14} className={isSaved ? "fill-amber-300 text-amber-300" : ""} />
                          <span>{isSaved ? 'Saved' : 'Save'}</span>
                        </button>
                      );
                    })()}
                  </div>
                </div>
              </div>

              {/* Sub-Scrollable Main Body (Title, Full Markdown Desc, Comments Stack) */}
              <div className="flex-1 overflow-y-auto p-5 space-y-6 text-left">
                {/* Title and Category Badge Area */}
                <div className="space-y-2.5">
                  <span className="bg-amber-500/10 text-amber-400 border border-amber-400/20 font-mono text-[8px] uppercase font-black px-2.5 py-1 rounded-full tracking-wider inline-block">
                    {selectedVideo.category}
                  </span>
                  <h3 className="font-sans font-extrabold text-sm md:text-base text-slate-100 tracking-tight leading-snug">
                    {selectedVideo.title}
                  </h3>
                </div>

                {/* Collapsible/Full Video Description Area */}
                <div className="bg-white/5 border border-white/5 rounded-2xl p-4 space-y-2">
                  <h5 className="font-mono text-[8px] text-amber-400 uppercase tracking-wider font-bold">TRANSMISSION GUIDELINES</h5>
                  <p className="font-sans text-[11px] text-slate-300 leading-relaxed whitespace-pre-line">
                    {selectedVideo.description}
                  </p>
                </div>

                {/* Interactive Dynamic Comments Thread Block */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[9px] uppercase font-bold tracking-wider text-slate-400">
                      SECURE DISCUSSION FEED
                    </span>
                    <span className="font-mono text-[8px] text-amber-400 bg-amber-400/5 px-2 py-0.5 rounded-md uppercase">
                      {(videoCommentsState[selectedVideo.id] || selectedVideo.comments || []).length} TRANSMISSIONS
                    </span>
                  </div>

                  {/* List of comments inside modal */}
                  <div className="space-y-3">
                    {(() => {
                      const comments = videoCommentsState[selectedVideo.id] || selectedVideo.comments || [];
                      return comments.map((comment: any) => (
                        <div key={comment.id} className="bg-white/5 border border-white/5 rounded-xl p-3 flex gap-2.5 items-start">
                          <img
                            src={comment.avatarUrl || null}
                            alt={comment.author}
                            className="w-7 h-7 rounded-lg object-cover border border-white/10 shrink-0"
                            referrerPolicy="no-referrer"
                          />
                          <div className="space-y-1 min-w-0 flex-1">
                            <div className="flex items-center justify-between">
                              <span className="font-sans font-bold text-[10px] text-slate-200">{comment.author}</span>
                              <span className="font-mono text-[7px] text-slate-500">{comment.timestamp}</span>
                            </div>
                            <p className="font-sans text-[11.5px] text-slate-300 leading-normal">{comment.text}</p>
                          </div>
                        </div>
                      ));
                    })()}
                  </div>
                </div>
              </div>

              {/* Secure Bottom Comment Input Form */}
              <div className="p-4 border-t border-white/10 bg-slate-950/80 backdrop-blur-md">
                <form 
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!videoNewCommentText.trim()) {
                      showToast("⚠️ Empty message payload blocked!");
                      return;
                    }

                    const currentComments = videoCommentsState[selectedVideo.id] || selectedVideo.comments || [];
                    const newCommentObj = {
                      id: `comment-${Date.now()}`,
                      author: user?.name || commenterName || "Ocean Pioneer",
                      avatarUrl: profile.avatarUrl || "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80",
                      text: videoNewCommentText.trim(),
                      timestamp: "Just now"
                    };

                    const updatedComments = [...currentComments, newCommentObj];
                    const updatedCommentsState = { ...videoCommentsState, [selectedVideo.id]: updatedComments };
                    
                    setVideoCommentsState(updatedCommentsState);
                    localStorage.setItem('ocean_video_comments_state', JSON.stringify(updatedCommentsState));

                    setVideoNewCommentText('');
                    showToast("📣 Secure message pushed to transmission feed!");
                  }}
                  className="relative flex items-center"
                >
                  <input
                    type="text"
                    value={videoNewCommentText}
                    onChange={(e) => setVideoNewCommentText(e.target.value)}
                    placeholder="Broadcast your secure message response..."
                    className="w-full bg-white/5 border border-white/10 hover:border-white/20 focus:border-amber-400 rounded-xl py-2 px-3.5 pr-12 font-sans text-xs text-slate-100 placeholder-slate-500 focus:outline-hidden transition-all shadow-inner"
                  />
                  <button
                    type="submit"
                    className="absolute right-2 text-amber-400 hover:text-amber-300 transition-colors p-1.5 cursor-pointer"
                  >
                    <Send size={15} />
                  </button>
                </form>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* =======================================================
          COMMENTS POPUP MODAL (THREADED COMMENTS & REACTIONS)
          ======================================================= */}
      <AnimatePresence>
        {activeCommentsPost && (
          <CommentsModal
            post={activeCommentsPost}
            currentUserName={user?.name || commenterName}
            isLoggedIn={!!token}
            token={token}
            commenterName={commenterName}
            followers={followers}
            isActingAsAnonymous={isActingAsAnonymous}
            currentUserId={user?.id}
            currentUserAvatarUrl={profile.avatarUrl || ''}
            followingIds={followingIds}
            onFollowToggle={handleFollowToggle}
            onLikePost={handleLikeFeedPost}
            onRepostPost={handleRepostFeedPost}
            onSharePost={setSharingPost}
            onDeletePost={handleDeleteFeedPost}
            onCommenterNameChange={(name) => {
              setCommenterName(name);
              localStorage.setItem('social_commenter_name', name);
            }}
            onClose={() => setActiveCommentsPost(null)}
            onProfileClick={(creatorId) => {
              loadCreatorProfile(creatorId);
              setActiveView('workspace');
              setActiveCommentsPost(null);
            }}
            onRefreshPost={(updatedPost) => {
              setActiveCommentsPost(updatedPost);
              // Sync the post inside the live feed list
              setFeedList(prev => prev.map(p => p.id === updatedPost.id ? updatedPost : p));
              // Update profile posts too if they exist
              setProfile(prev => {
                if (!prev.posts?.some(p => p.id === updatedPost.id)) return prev;
                const posts = (prev.posts || []).map(p => p.id === updatedPost.id ? updatedPost : p);
                return { ...prev, posts };
              });
              // Sync dynamicReels
              setDynamicReels(prev => prev.map(r => r.id === updatedPost.id ? { ...r, comments: updatedPost.comments, likes: updatedPost.likes } : r));
            }}
          />
        )}
      </AnimatePresence>

      {/* =======================================================
          REACTIONS / LIKERS LIST POPUP MODAL
          ======================================================= */}
      <AnimatePresence>
        {likesModalPost && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setLikesModalPost(null)}
              className="absolute inset-0 bg-[#2e2920]/60 backdrop-blur-xs"
            />

            {/* Modal Content */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ type: 'spring', duration: 0.4 }}
              className="relative max-w-sm w-full bg-[#fdfbf7] border border-[#ebdcca] rounded-3xl shadow-xl overflow-hidden flex flex-col max-h-[60vh] z-10"
            >
              {/* Header */}
              <div className="p-4 border-b border-[#ebdcca] flex items-center justify-between bg-[#fbf9f4]">
                <span className="font-mono text-[10px] font-bold text-[#3a342a] uppercase tracking-wider flex items-center gap-1.5">
                  <Heart size={12} className="text-rose-500 fill-rose-500 animate-pulse" />
                  Reactions ({likesModalPost.likedByUsers?.length || likesModalPost.likes || 0})
                </span>
                <button
                  onClick={() => setLikesModalPost(null)}
                  className="text-[#8a8172] hover:text-[#3a342a] hover:bg-[#ebdcca]/30 p-1 rounded-full transition-all"
                >
                  <X size={16} />
                </button>
              </div>

              {/* List of Likers */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {(!likesModalPost.likedByUsers || likesModalPost.likedByUsers.length === 0) ? (
                  <div className="text-center py-6">
                    <p className="text-xs text-[#8a8172] font-mono italic">No registered reactors found.</p>
                  </div>
                ) : (
                  likesModalPost.likedByUsers.map((likedUser: any) => (
                    <div 
                      key={likedUser.id} 
                      className="flex items-center justify-between p-2 hover:bg-[#ebdcca]/20 rounded-xl transition-all"
                    >
                      <div 
                        className="flex items-center gap-3 cursor-pointer group min-w-0"
                        onClick={() => {
                          if (!likedUser.id.startsWith('guest-')) {
                            loadCreatorProfile(likedUser.id);
                            setActiveView('workspace');
                            setLikesModalPost(null);
                          }
                        }}
                      >
                        <div className="w-8 h-8 rounded-none bg-[#ebdcca] flex items-center justify-center font-mono text-xs text-[#5c5446] font-bold uppercase overflow-hidden border border-[#cfcac0] shrink-0">
                          {likedUser.avatarUrl ? (
                            <img src={likedUser.avatarUrl || null} alt={likedUser.name} className="w-full h-full object-cover" />
                          ) : (
                            likedUser.name.charAt(0)
                          )}
                        </div>
                        <div className="min-w-0">
                          <span className="block font-sans font-bold text-xs text-[#3a342a] group-hover:underline truncate">
                            {likedUser.name}
                          </span>
                          <span className="block font-mono text-[8px] text-[#8a8172] truncate">
                            {likedUser.id.startsWith('guest-') ? 'Guest Visitor' : 'Creator Space'}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* =======================================================
          ANONYMOUS SWITCH PASSWORD VERIFICATION MODAL
          ======================================================= */}
      <AnimatePresence>
        {isAnonPasswordConfirmOpen && (
          <div className="fixed inset-0 z-55 flex items-center justify-center p-4 bg-[#2e2920]/65 backdrop-blur-xs">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[#fcfaf4] border border-[#ebdcca] rounded-3xl p-6 max-w-sm w-full shadow-xl space-y-4"
            >
              <div className="flex items-center justify-between border-b border-[#ebdcca] pb-3">
                <div className="flex items-center gap-2">
                  <Shield size={16} className="text-amber-800" />
                  <h3 className="font-display font-bold text-xs text-[#3a342a] uppercase tracking-wide">
                    Identity Transition Authorization
                  </h3>
                </div>
                <button
                  onClick={() => setIsAnonPasswordConfirmOpen(false)}
                  className="text-[#8a8172] hover:text-[#3a342a] p-1 rounded-md hover:bg-[#ebdcca]/20 transition-colors"
                >
                  <X size={14} />
                </button>
              </div>

              <p className="text-xs text-[#5c5446] leading-relaxed">
                To switch to your <strong>Untraceable Anonymous Profile</strong>, please confirm your workspace key (password).
              </p>

              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!anonConfirmPassword.trim()) return;
                  setIsAnonPasswordVerifying(true);
                  setAnonPasswordError('');
                  try {
                    const res = await fetch('/api/auth/verify-password', {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                      },
                      body: JSON.stringify({ password: anonConfirmPassword })
                    });
                    if (res.ok) {
                      setIsActingAsAnonymous(true);
                      setIsEditMode(false);
                      setIsSettingsOpen(false);
                      setIsAnonPasswordConfirmOpen(false);
                      setAnonConfirmPassword('');
                      setActiveView('workspace');
                      showToast("Authenticated! Switched to Anonymous Profile");
                    } else {
                      const errData = await res.json();
                      setAnonPasswordError(errData.error || "Incorrect password. Verification failed.");
                    }
                  } catch (err) {
                    console.error("Password verification failed:", err);
                    setAnonPasswordError("Connection error. Please try again.");
                  } finally {
                    setIsAnonPasswordVerifying(false);
                  }
                }}
                className="space-y-3"
              >
                <div>
                  <label className="block text-[9px] font-mono text-[#8a8172] uppercase tracking-wider font-bold mb-1">
                    Enter Workspace Password
                  </label>
                  <input
                    type="password"
                    value={anonConfirmPassword}
                    onChange={(e) => setAnonConfirmPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full bg-white border border-[#cfcac0] rounded-xl px-3 py-2 font-sans text-xs text-[#5c5446] focus:outline-none focus:ring-1 focus:ring-[#8a8172]"
                    required
                    autoFocus
                  />
                  {anonPasswordError && (
                    <p className="text-[10px] text-rose-600 mt-1 font-mono">{anonPasswordError}</p>
                  )}
                </div>

                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setIsAnonPasswordConfirmOpen(false)}
                    className="flex-1 font-mono text-[9px] uppercase font-bold text-[#8a8172] border border-[#cfcac0] bg-white hover:bg-[#ebdcca]/20 py-2 rounded-xl transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isAnonPasswordVerifying}
                    className="flex-1 font-mono text-[9px] uppercase font-bold text-[#f4f1ea] bg-amber-900 hover:bg-amber-950 py-2 rounded-xl transition-colors flex items-center justify-center gap-1"
                  >
                    {isAnonPasswordVerifying ? (
                      <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    ) : (
                      <>
                        <Check size={11} />
                        Confirm
                      </>
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>




      {/* REAL-TIME AGGREGATED NOTIFICATIONS POPUP (MIGRATED TO FULL PAGE VIEW) */}

      {/* =======================================================
          3. STUDIO SETTINGS & CONFIG MODAL (ENVELOPE SYSTEM INTEGRATED)
          ======================================================= */}
      <AnimatePresence>
        {isSettingsOpen && (
          <div className="fixed inset-0 z-50 overflow-y-auto p-4 bg-[#2e2920]/60 backdrop-blur-xs flex items-center justify-center">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[#fcfaf4] border border-[#ebdcca] rounded-3xl p-6 md:p-8 max-w-md w-full shadow-xl space-y-6 my-auto max-h-[90vh] overflow-y-auto scrollbar-thin"
            >
              <div className="flex items-center justify-between border-b border-[#ebdcca] pb-4">
                <div className="flex items-center gap-2">
                  <Settings className="text-[#8a8172]" size={18} />
                  <h3 className="font-display font-bold text-base text-[#3a342a] tracking-tight">
                    Studio Settings & Crypto Keys
                  </h3>
                </div>
                <button
                  onClick={() => setIsSettingsOpen(false)}
                  className="text-[#8a8172] hover:text-[#3a342a] p-1.5 rounded-lg hover:bg-[#ebdcca]/20 transition-colors"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="space-y-4 text-xs text-[#5c5446]">

                {/* ── SECURITY & BADGES (ported from arena-ai: TOTP 2FA, encrypted backup, badges) ── */}
                <div className="border border-[#ebdcca]/70 rounded-2xl p-4 space-y-3 bg-white/40">
                  <div className="flex items-center gap-2 border-b border-[#ebdcca] pb-2">
                    <Shield className="text-[#8a8172]" size={14} />
                    <span className="font-display font-bold text-sm text-[#3a342a]">Security & Badges</span>
                  </div>

                  {/* 2FA */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <span className="font-bold block text-[#3a342a]">Two-Factor Authentication</span>
                      <span className="text-[10px] text-[#8a8172]">
                        {twoFactorEnabled ? 'Enabled — authenticator code required at login' : 'Protect your account with a TOTP authenticator'}
                      </span>
                    </div>
                    {twoFactorEnabled ? (
                      <button onClick={disable2FA} className="shrink-0 text-[10px] font-mono uppercase font-bold bg-rose-100 text-rose-600 px-3 py-1.5 rounded-xl hover:bg-rose-200">Disable</button>
                    ) : twoFactorStatus === 'setup' ? (
                      <button onClick={confirm2FA} disabled={twoFactorCodeInput.length !== 6} className="shrink-0 text-[10px] font-mono uppercase font-bold bg-[#3a342a] text-[#f4f1ea] px-3 py-1.5 rounded-xl disabled:opacity-40">Verify</button>
                    ) : (
                      <button onClick={start2FASetup} className="shrink-0 text-[10px] font-mono uppercase font-bold bg-[#3a342a] text-[#f4f1ea] px-3 py-1.5 rounded-xl hover:bg-[#52493b]">Enable</button>
                    )}
                  </div>

                  {twoFactorStatus === 'setup' && twoFactorSetup && (
                    <div className="space-y-2 bg-white rounded-xl border border-[#ebdcca] p-3">
                      {twoFactorSetup.qrCodeDataUrl && (
                        <img src={twoFactorSetup.qrCodeDataUrl} alt="2FA QR Code" className="w-36 h-36 mx-auto rounded-lg" />
                      )}
                      <div className="text-center">
                        <div className="text-[9px] font-mono uppercase text-[#8a8172] mb-0.5">Manual key</div>
                        <code className="text-[10px] font-mono break-all text-[#3a342a]">{twoFactorSetup.secret}</code>
                      </div>
                      <input
                        value={twoFactorCodeInput}
                        onChange={(e) => setTwoFactorCodeInput(e.target.value.replace(/[^0-9]/g, ''))}
                        maxLength={6}
                        placeholder="Enter 6-digit code"
                        className="w-full bg-white border border-[#cfcac0] rounded-xl px-3 py-2 text-center font-mono tracking-[0.4em] text-[#3a342a]"
                      />
                      {recoveryPhrase && (
                        <div className="bg-[#fbf9f4] border border-[#ebdcca] rounded-xl p-2.5">
                          <div className="text-[9px] font-mono uppercase text-[#8a8172] mb-1">Recovery phrase (write it down!)</div>
                          <code className="text-[10px] font-mono text-[#3a342a] leading-relaxed">{recoveryPhrase}</code>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Badges */}
                  <div className="pt-2 border-t border-[#ebdcca]/60">
                    <div className="text-[9px] font-mono uppercase tracking-wider text-[#8a8172] font-bold mb-2">Achievements</div>
                    <div className="grid grid-cols-5 gap-2">
                      {computeBadges({
                        postsCount: feedList.length,
                        followersCount: (profile as any)?.followersCount ?? (user as any)?.followersCount ?? 0,
                        networkStrength: (profile as any)?.networkStrength ?? 0,
                        trustScore: (profile as any)?.trustScore ?? 50,
                        locationVerified: (profile as any)?.isLocationVerified,
                        twoFactorEnabled,
                      }).map((badge) => (
                        <div
                          key={badge.id}
                          title={`${badge.label} — ${badge.description}${badge.earned ? '' : ` (${Math.round((badge.progress || 0) * 100)}%)`}`}
                          className={`flex flex-col items-center justify-center rounded-xl border p-2 text-center ${
                            badge.earned ? 'bg-[#f5f0e6] border-[#cfcac0]' : 'bg-white border-[#ebdcca] opacity-50 grayscale'
                          }`}
                        >
                          <span className="text-lg">{badge.emoji}</span>
                          <span className="text-[7px] font-mono uppercase font-bold text-[#5c5446] mt-1 leading-tight">{badge.label}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Encrypted backup */}
                  <div className="pt-2 border-t border-[#ebdcca]/60">
                    <div className="text-[9px] font-mono uppercase tracking-wider text-[#8a8172] font-bold mb-1.5">Encrypted Backup</div>
                    <div className="flex gap-2">
                      <input
                        type="password"
                        value={backupPassphrase}
                        onChange={(e) => setBackupPassphrase(e.target.value)}
                        placeholder="Backup passphrase (8+ chars)"
                        className="flex-1 min-w-0 bg-white border border-[#cfcac0] rounded-xl px-3 py-2 text-xs text-[#5c5446]"
                      />
                      <button onClick={exportBackup} className="text-[10px] font-mono uppercase font-bold bg-[#3a342a] text-[#f4f1ea] px-3 py-2 rounded-xl hover:bg-[#52493b] whitespace-nowrap">Export</button>
                      <label className="text-[10px] font-mono uppercase font-bold bg-[#ebdcca] text-[#3a342a] px-3 py-2 rounded-xl hover:bg-[#cfcac0] cursor-pointer whitespace-nowrap">
                        Import
                        <input type="file" accept=".json" className="hidden" onChange={importBackup} />
                      </label>
                    </div>
                    {backupMsg && <div className="text-[10px] text-[#8a8172] mt-1">{backupMsg}</div>}
                  </div>

                  {/* Admin console (master-key gated) */}
                  <button
                    onClick={() => setIsAdminOpen(true)}
                    className="w-full flex items-center justify-center gap-2 pt-2.5 border-t border-[#ebdcca]/60 text-[10px] font-mono uppercase tracking-wider font-bold text-[#8a8172] hover:text-[#3a342a]"
                  >
                    <Shield size={12} /> Admin Console
                  </button>
                </div>

                {/* Theme Mode Setting */}
                <div className="flex items-center justify-between py-2 border-b border-[#ebdcca]/60">
                  <div>
                    <span className="font-bold block text-[#3a342a]">Theme Mode</span>
                    <span className="text-[10px] text-[#8a8172]">Switch between Light and Dark interface</span>
                  </div>
                  <div className="flex bg-[#ebdcca]/40 border border-[#cfcac0] p-0.5 rounded-full items-center select-none w-28 h-8">
                    <button
                      onClick={() => isDarkMode && toggleDarkMode()}
                      className={`w-1/2 flex items-center justify-center gap-1 text-[9px] font-mono font-bold uppercase transition-colors duration-200 py-1 rounded-full ${
                        !isDarkMode ? 'bg-[#3a342a] text-[#f4f1ea]' : 'text-[#8a8172] hover:text-[#3a342a]'
                      }`}
                    >
                      <Sun size={10} />
                      L
                    </button>
                    <button
                      onClick={() => !isDarkMode && toggleDarkMode()}
                      className={`w-1/2 flex items-center justify-center gap-1 text-[9px] font-mono font-bold uppercase transition-colors duration-200 py-1 rounded-full ${
                        isDarkMode ? 'bg-[#3a342a] text-[#f4f1ea]' : 'text-[#8a8172] hover:text-[#3a342a]'
                      }`}
                    >
                      <Moon size={10} />
                      D
                    </button>
                  </div>
                </div>

                {/* Post Buttons Alignment Setting */}
                <div className="flex items-center justify-between py-2 border-b border-[#ebdcca]/60">
                  <div>
                    <span className="font-bold block text-[#3a342a]">Interactive Buttons Alignment</span>
                    <span className="text-[10px] text-[#8a8172]">Align the reaction & action strip on publication cards</span>
                  </div>
                  <div className="flex bg-[#ebdcca]/40 border border-[#cfcac0] p-0.5 rounded-full items-center select-none w-28 h-8">
                    <button
                      onClick={() => {
                        setPostButtonsAlignment('left');
                        localStorage.setItem('post_buttons_alignment', 'left');
                        setBottomNavSide('left');
                        localStorage.setItem('bottom_nav_side', 'left');
                        showToast("Reactions and menu aligned to the left");
                      }}
                      className={`w-1/2 text-center text-[9px] font-mono font-bold uppercase transition-colors duration-200 py-1 rounded-full ${
                        postButtonsAlignment === 'left' ? 'bg-[#3a342a] text-[#f4f1ea]' : 'text-[#8a8172] hover:text-[#3a342a]'
                      }`}
                    >
                      Left
                    </button>
                    <button
                      onClick={() => {
                        setPostButtonsAlignment('right');
                        localStorage.setItem('post_buttons_alignment', 'right');
                        setBottomNavSide('right');
                        localStorage.setItem('bottom_nav_side', 'right');
                        showToast("Reactions and menu aligned to the right");
                      }}
                      className={`w-1/2 text-center text-[9px] font-mono font-bold uppercase transition-colors duration-200 py-1 rounded-full ${
                        postButtonsAlignment === 'right' ? 'bg-[#3a342a] text-[#f4f1ea]' : 'text-[#8a8172] hover:text-[#3a342a]'
                      }`}
                    >
                      Right
                    </button>
                  </div>
                </div>

                {/* View Words Option (Active only when logged in) */}
                {token && (
                  <div className="flex items-center justify-between py-2 border-b border-[#ebdcca]/60">
                    <div>
                      <span className="font-bold block text-[#3a342a]">View Recovery Words</span>
                      <span className="text-[10px] text-[#8a8172]">Re-verify password to decrypt original words</span>
                    </div>
                    <button
                      onClick={() => {
                        setIsSettingsOpen(false);
                        setIsViewWordsOpen(true);
                      }}
                      className="font-mono text-[10px] uppercase font-bold py-1.5 px-3.5 rounded-xl border border-[#cfcac0] bg-white hover:bg-[#ebdcca]/30 transition-all text-[#3a342a]"
                    >
                      View Words
                    </button>
                  </div>
                )}

                {/* Archived Chats Section (Moved to Settings) */}
                {token && (
                  <div className="flex items-center justify-between py-2 border-b border-[#ebdcca]/60">
                    <div>
                      <span className="font-bold block text-[#3a342a]">Archived Folder & Chats</span>
                      <span className="text-[10px] text-[#8a8172]">Manage and restore your archived secret conversations</span>
                    </div>
                    <button
                      onClick={() => {
                        setIsArchivedChatsPopupOpen(true);
                      }}
                      className="font-mono text-[10px] uppercase font-bold py-1.5 px-3.5 rounded-xl border border-[#cfcac0] bg-white hover:bg-[#ebdcca]/30 transition-all text-[#3a342a] flex items-center gap-1.5"
                    >
                      <Archive size={12} />
                      Open Folder
                    </button>
                  </div>
                )}

                 {/* Active Profile switcher (Switch to/from Anonymous profile) */}
                {token && (
                  <div className="flex items-center justify-between py-2 border-b border-[#ebdcca]/60">
                    <div>
                      <span className="font-bold block text-[#3a342a]">Active Profile Identity</span>
                      <span className="text-[10px] text-[#8a8172]">
                        Currently acting as: <strong className="text-amber-800">{isActingAsAnonymous ? "Anonymous Identity" : "Personal Identity"}</strong>
                      </span>
                    </div>
                    <button
                      onClick={() => {
                        if (!isActingAsAnonymous) {
                          setIsAnonPasswordConfirmOpen(true);
                          setAnonConfirmPassword('');
                          setAnonPasswordError('');
                        } else {
                          setIsActingAsAnonymous(false);
                          setIsEditMode(false);
                          setIsSettingsOpen(false);
                          setActiveView('workspace');
                          showToast("Switched to Personal Profile");
                        }
                      }}
                      className="font-mono text-[10px] uppercase font-bold py-1.5 px-3.5 rounded-xl bg-[#3a342a] text-[#f4f1ea] hover:bg-amber-900 transition-all flex items-center gap-1.5"
                    >
                      <User size={12} />
                      {isActingAsAnonymous ? "Switch to Personal" : "Switch to Anonymous"}
                    </button>
                  </div>
                )}

                {/* Lock Public Messaging Toggle */}
                {token && (
                  <div className="flex items-center justify-between py-2 border-b border-[#ebdcca]/60">
                    <div>
                      <span className="font-bold block text-[#3a342a]">Restrict Public Messaging</span>
                      <span className="text-[10px] text-[#8a8172]">
                        Only allow messages from accounts you are following
                      </span>
                    </div>
                    <button
                      onClick={() => {
                        handleUpdateProfile({ isMessageLocked: !profile.isMessageLocked });
                      }}
                      className={`font-mono text-[10px] uppercase font-bold py-1.5 px-3.5 rounded-xl transition-all flex items-center gap-1.5 ${
                        profile.isMessageLocked 
                          ? 'bg-amber-950 text-[#f4f1ea]' 
                          : 'border border-[#cfcac0] bg-white hover:bg-[#ebdcca]/30 text-[#3a342a]'
                      }`}
                    >
                      {profile.isMessageLocked ? (
                        <>
                          <Lock size={12} />
                          Locked
                        </>
                      ) : (
                        <>
                          <Unlock size={12} />
                          Unlocked
                        </>
                      )}
                    </button>
                  </div>
                )}

                {/* Account Private Toggle */}
                {token && (
                  <div className="flex items-center justify-between py-2 border-b border-[#ebdcca]/60">
                    <div>
                      <span className="font-bold block text-[#3a342a]">Account Private</span>
                      <span className="text-[10px] text-[#8a8172]">
                        Restricts your projects, websites, custom post designs and profile details to friends only
                      </span>
                    </div>
                    <button
                      onClick={() => {
                        handleUpdateProfile({ isPrivate: profile.isPrivate === true ? false : true });
                      }}
                      className={`font-mono text-[10px] uppercase font-bold py-1.5 px-3.5 rounded-xl transition-all flex items-center gap-1.5 ${
                        profile.isPrivate === true 
                          ? 'bg-amber-950 text-[#f4f1ea]' 
                          : 'border border-[#cfcac0] bg-white hover:bg-[#ebdcca]/30 text-[#3a342a]'
                      }`}
                    >
                      {profile.isPrivate === true ? (
                        <>
                          <Lock size={12} />
                          Private
                        </>
                      ) : (
                        <>
                          <Unlock size={12} />
                          Public
                        </>
                      )}
                    </button>
                  </div>
                )}

                {/* Connections (Friend/Follow System) Toggle */}
                {token && (
                  <div className="flex items-center justify-between py-2 border-b border-[#ebdcca]/60">
                    <div>
                      <span className="font-bold block text-[#3a342a]">Friend & Follow System</span>
                      <span className="text-[10px] text-[#8a8172]">
                        Allow other users to follow you and send you friend requests
                      </span>
                    </div>
                    <button
                      onClick={() => {
                        handleUpdateProfile({ allowConnections: profile.allowConnections === false ? true : false });
                      }}
                      className={`font-mono text-[10px] uppercase font-bold py-1.5 px-3.5 rounded-xl transition-all flex items-center gap-1.5 ${
                        profile.allowConnections !== false 
                          ? 'bg-amber-950 text-[#f4f1ea]' 
                          : 'border border-[#cfcac0] bg-white hover:bg-[#ebdcca]/30 text-[#3a342a]'
                      }`}
                    >
                      {profile.allowConnections !== false ? (
                        <>
                          <Check size={12} />
                          Active
                        </>
                      ) : (
                        <>
                          <Lock size={12} />
                          Disabled
                        </>
                      )}
                    </button>
                  </div>
                )}

                {/* Public Messaging Toggle */}
                {token && (
                  <div className="flex items-center justify-between py-2 border-b border-[#ebdcca]/60">
                    <div>
                      <span className="font-bold block text-[#3a342a]">Public Messaging</span>
                      <span className="text-[10px] text-[#8a8172]">
                        Allow anyone to send you direct messages. If disabled, only friends & followers can message you.
                      </span>
                    </div>
                    <button
                      onClick={() => {
                        handleUpdateProfile({ isPublicMessagingEnabled: profile.isPublicMessagingEnabled === false ? true : false });
                      }}
                      className={`font-mono text-[10px] uppercase font-bold py-1.5 px-3.5 rounded-xl transition-all flex items-center gap-1.5 ${
                        profile.isPublicMessagingEnabled !== false 
                          ? 'bg-amber-950 text-[#f4f1ea]' 
                          : 'border border-[#cfcac0] bg-white hover:bg-[#ebdcca]/30 text-[#3a342a]'
                      }`}
                    >
                      {profile.isPublicMessagingEnabled !== false ? (
                        <>
                          <Unlock size={12} />
                          Public
                        </>
                      ) : (
                        <>
                          <Lock size={12} />
                          Friends Only
                        </>
                      )}
                    </button>
                  </div>
                )}

                {/* Who Can See My Friends List Setting */}
                {token && (
                  <div className="flex items-center justify-between py-2 border-b border-[#ebdcca]/60">
                    <div>
                      <span className="font-bold block text-[#3a342a]">Who Can See My Friends List</span>
                      <span className="text-[10px] text-[#8a8172]">
                        Restricts access to your connections list from your profile card
                      </span>
                    </div>
                    <button
                      onClick={() => {
                        const current = profile.friendsPrivacy || 'public';
                        const next = current === 'public' ? 'friends' : current === 'friends' ? 'private' : 'public';
                        handleUpdateProfile({ friendsPrivacy: next });
                        showToast(`Friends list privacy set to: ${next === 'friends' ? 'Friends Only' : next === 'private' ? 'Private' : 'Everyone'}`);
                      }}
                      className="font-mono text-[10px] uppercase font-bold py-1.5 px-3.5 rounded-xl border border-[#cfcac0] bg-white hover:bg-[#ebdcca]/30 text-[#3a342a] transition-all"
                    >
                      {profile.friendsPrivacy === 'friends' ? 'Friends Only' :
                       profile.friendsPrivacy === 'private' ? 'Private' : 'Everyone'}
                    </button>
                  </div>
                )}

                {/* Dark Mode Toggle */}
                <div className="flex items-center justify-between py-2 border-b border-[#ebdcca]/60">
                  <div>
                    <span className="font-bold block text-[#3a342a]">Dark Mode Interface</span>
                    <span className="text-[10px] text-[#8a8172]">
                      Switch between cream light and carbon dark themes
                    </span>
                  </div>
                  <button
                    onClick={toggleDarkMode}
                    className={`font-mono text-[10px] uppercase font-bold py-1.5 px-3.5 rounded-xl transition-all flex items-center gap-1.5 ${
                      isDarkMode 
                        ? 'bg-amber-950 text-[#f4f1ea]' 
                        : 'border border-[#cfcac0] bg-white hover:bg-[#ebdcca]/30 text-[#3a342a]'
                    }`}
                  >
                    {isDarkMode ? 'Dark Theme' : 'Light Theme'}
                  </button>
                </div>

                {/* Reset Application Database (Requested by User) */}
                <div className="flex items-center justify-between py-2 border-b border-[#ebdcca]/60">
                  <div>
                    <span className="font-bold block text-red-800">Reset Application Database</span>
                    <span className="text-[10px] text-[#8a8172]">
                      Wipe out all publications, reactions, comments, and messages (preserves registered accounts)
                    </span>
                  </div>
                  <button
                    onClick={async () => {
                      if (window.confirm("⚠️ WARNING: This will permanently erase all posts, comments, and direct messages. Registered user profiles and sessions will be preserved. Are you sure you want to proceed?")) {
                        try {
                          const res = await fetch('/api/admin/reset-database', {
                            method: 'POST'
                          });
                          if (res.ok) {
                            showToast("✓ Application database reset successfully!");
                            fetchFeed();
                            fetchCreators();
                            if (token) {
                              fetchMe(token);
                            } else {
                              setProfile(DEFAULT_PROFILE);
                            }
                          } else {
                            showToast("⚠️ Failed to reset database.");
                          }
                        } catch (err) {
                          showToast("⚠️ Connection error while resetting database.");
                        }
                      }
                    }}
                    className="font-mono text-[10px] uppercase font-bold py-1.5 px-3.5 rounded-xl border border-red-200 bg-red-50 hover:bg-red-100 text-red-800 transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    <RotateCcw size={11} className="text-red-800" />
                    Reset App
                  </button>
                </div>

                {/* Log Out Account (Requested by User) */}
                {token && (
                  <div className="flex items-center justify-between py-2">
                    <div>
                      <span className="font-bold block text-[#3a342a]">Log Out Account</span>
                      <span className="text-[10px] text-[#8a8172]">Lock workspace and clear session on this device</span>
                    </div>
                    <button
                      onClick={() => {
                        handleLogout();
                        setIsSettingsOpen(false);
                      }}
                      className="font-mono text-[10px] uppercase font-bold py-1.5 px-3.5 rounded-xl bg-amber-900 text-[#f4f1ea] hover:bg-amber-950 transition-colors flex items-center gap-1"
                    >
                      <Lock size={11} />
                      Log Out
                    </button>
                  </div>
                )}

                {/* ── CONTENT MODERATION SENSITIVITY (nsfw-filter port) ── */}
                <div className="border border-[#ebdcca]/70 rounded-2xl p-4 space-y-3 bg-white/40">
                  <div className="flex items-center gap-2 border-b border-[#ebdcca] pb-2">
                    <Shield className="text-[#8a8172]" size={14} />
                    <span className="font-display font-bold text-sm text-[#3a342a]">Content Moderation</span>
                  </div>
                  <NSFWStrictnessSettings />
                </div>

                {/* ── LOGIN ACTIVITY / ACTIVE DEVICES (arena-ai port) ── */}
                {token && (
                  <div className="border border-[#ebdcca]/70 rounded-2xl p-4 space-y-3 bg-white/40">
                    <div className="flex items-center gap-2 border-b border-[#ebdcca] pb-2">
                      <Shield className="text-[#8a8172]" size={14} />
                      <span className="font-display font-bold text-sm text-[#3a342a]">Login Activity</span>
                    </div>
                    <LoginActivitySection token={token} />
                  </div>
                )}

                {/* ── VERIFY RECOVERY PHRASE (arena-ai position verification port) ── */}
                {token && recoveryPhrase && (
                  <div className="border border-[#ebdcca]/70 rounded-2xl p-4 space-y-3 bg-white/40">
                    <div className="flex items-center gap-2 border-b border-[#ebdcca] pb-2">
                      <Shield className="text-[#8a8172]" size={14} />
                      <span className="font-display font-bold text-sm text-[#3a342a]">Recovery Verification</span>
                    </div>
                    <p className="text-[11px] text-[#8a8172]">Prove you hold your 12-word recovery phrase by entering a few random positions.</p>
                    <button
                      onClick={() => setShowRecoveryVerify(true)}
                      className="w-full font-mono text-[10px] uppercase font-bold tracking-wider py-2 rounded-xl bg-[#3a342a] text-[#f4f1ea] hover:bg-amber-900 transition-all"
                    >
                      Verify Phrase
                    </button>
                  </div>
                )}

              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* =======================================================
          FRIENDS LIST POPUP MODAL
          ======================================================= */}
      <AnimatePresence>
        {isFriendsListOpen && (
          <div className="fixed inset-0 z-55 overflow-y-auto p-4 bg-[#2e2920]/60 backdrop-blur-xs flex items-center justify-center">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[#fcfaf4] border border-[#ebdcca] rounded-3xl p-6 md:p-8 max-w-sm w-full shadow-xl flex flex-col my-auto max-h-[85vh] space-y-4"
            >
              <div className="flex items-center justify-between border-b border-[#ebdcca] pb-3">
                <div className="flex items-center gap-2">
                  <Users className="text-[#8a8172]" size={18} />
                  <h3 className="font-display font-bold text-sm text-[#3a342a] tracking-tight">
                    {friendsListModalData.name}'s Friends
                  </h3>
                </div>
                <button
                  onClick={() => setIsFriendsListOpen(false)}
                  className="text-[#8a8172] hover:text-[#3a342a] p-1.5 rounded-lg hover:bg-[#ebdcca]/20 transition-colors"
                >
                  <X size={16} />
                </button>
              </div>

              {friendsListModalData.restricted ? (
                <div className="text-center py-8 px-4 space-y-2">
                  <Lock className="mx-auto text-[#8a8172]" size={24} />
                  <p className="font-sans font-bold text-xs text-[#3a342a]">Friends list is hidden</p>
                  <p className="font-mono text-[9px] text-[#8a8172] uppercase leading-relaxed">
                    This member's privacy settings restrict access to their connections list.
                  </p>
                </div>
              ) : friendsListModalData.friends.length === 0 ? (
                <div className="text-center py-8 px-4 space-y-1">
                  <Users className="mx-auto text-[#ebdcca]" size={24} />
                  <p className="font-sans text-xs text-[#8a8172]">No friends added yet.</p>
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto pr-1 space-y-2 max-h-[50vh] scrollbar-thin">
                  {friendsListModalData.friends.map((friend) => (
                    <div 
                      key={friend.id}
                      onClick={() => {
                        setIsFriendsListOpen(false);
                        loadCreatorProfile(friend.id);
                        setActiveView('workspace');
                      }}
                      className="flex items-center justify-between p-2 rounded-2xl hover:bg-amber-50/50 transition-all border border-[#ebdcca]/20 cursor-pointer group"
                    >
                      <div className="flex items-center gap-2.5 min-w-0 text-left">
                        <div className="w-8 h-8 rounded-full bg-[#ebdcca] flex items-center justify-center font-mono text-[10px] text-[#5c5446] font-bold uppercase overflow-hidden border border-[#cfcac0]/30 shrink-0">
                          {friend.avatarUrl ? (
                            <img src={friend.avatarUrl || null} alt={friend.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                          ) : (
                            friend.name.charAt(0)
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="font-sans font-bold text-xs text-[#3a342a] truncate group-hover:text-amber-800 transition-colors">
                            {friend.name}
                          </p>
                          <p className="font-mono text-[9px] text-amber-800 font-bold truncate leading-none mt-0.5">
                            {formatCreditCardStyle(friend.badgeNumber || 'BD-00-000-00')}
                          </p>
                        </div>
                      </div>
                      <span className="font-mono text-[8px] text-amber-800 bg-[#ebdcca]/25 px-1.5 py-0.5 rounded-sm uppercase tracking-wider opacity-0 group-hover:opacity-100 transition-opacity">
                        VIEW
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* RICH CREATE / EDIT FEED POST MODAL */}
      <AnimatePresence>
        {isCreatePostOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#2e2920]/60 backdrop-blur-xs">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[#fcfaf4] border border-[#ebdcca] rounded-3xl p-5 md:p-6 max-w-lg w-full shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto"
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between border-b border-[#ebdcca] pb-3">
                <div className="flex items-center gap-2">
                  {editingFeedPost ? <Edit className="text-[#8a8172]" size={16} /> : <Plus className="text-[#8a8172]" size={16} />}
                  <h3 className="font-display font-bold text-sm text-[#3a342a] tracking-tight uppercase">
                    {editingFeedPost ? "Modify Network Publication" : "Publish New Creative Stream"}
                  </h3>
                </div>
                <button
                  onClick={() => setIsCreatePostOpen(false)}
                  className="text-[#8a8172] hover:text-[#3a342a] p-1 rounded-lg hover:bg-[#ebdcca]/20 transition-colors"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Form content */}
              <form onSubmit={async (e) => {
                e.preventDefault();
                const form = e.currentTarget;
                const titleEl = form.elements.namedItem('postTitle') as HTMLInputElement | null;
                const contentEl = form.elements.namedItem('postContent') as HTMLTextAreaElement | null;
                
                const titleVal = titleEl ? titleEl.value.trim() : "";
                const contentVal = contentEl ? contentEl.value.trim() : "";
                const hasMedia = !!(attachedImage || attachedVideo || attachedAudio);
                const hasContentOrMedia = !!(contentVal || hasMedia);

                if (isNeedPost) {
                  if (!titleVal) {
                    showToast("⚠️ Please enter a Need Title!");
                    return;
                  }
                  if (!needLocation.trim() || !needBox.trim() || !needTime.trim()) {
                    showToast("⚠️ Please fill in all need post fields (Location, Description, and Timeline)!");
                    return;
                  }
                }

                if (!hasContentOrMedia && !isNeedPost) {
                  showToast("⚠️ Please enter some text or attach media before publishing!");
                  return;
                }

                if (editingFeedPost) {
                  await handleEditFeedPost(
                    editingFeedPost.id, 
                    titleVal, 
                    contentVal, 
                    attachedImage, 
                    attachedVideo, 
                    attachedAudio
                  );
                } else {
                  await handleCreatePostFromFeed(
                    titleVal, 
                    contentVal, 
                    attachedImage, 
                    attachedVideo, 
                    attachedAudio
                  );
                }

                setIsCreatePostOpen(false);
              }} className="space-y-4">
                {/* MODE SELECTOR TABS */}
                <div className="grid grid-cols-3 gap-2 p-1 bg-[#ebdcca]/20 border border-[#ebdcca]/40 rounded-2xl">
                  <button
                    type="button"
                    onClick={() => {
                      setIsTimeCapsule(false);
                      setIsNeedPost(false);
                    }}
                    className={`py-2 px-3 rounded-xl font-mono text-[9px] font-bold uppercase tracking-wider text-center transition-all ${
                      !isTimeCapsule && !isNeedPost
                        ? "bg-amber-900 text-[#fcfaf4] shadow-sm"
                        : "text-[#8a8172] hover:text-[#3a342a] hover:bg-[#ebdcca]/30"
                    }`}
                  >
                    Instant Post
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsTimeCapsule(true);
                      setIsNeedPost(false);
                      if (!capsuleDate || !capsuleTime) {
                        const now = new Date();
                        const year = now.getFullYear();
                        const month = String(now.getMonth() + 1).padStart(2, '0');
                        const day = String(now.getDate()).padStart(2, '0');
                        setCapsuleDate(`${year}-${month}-${day}`);
                        const future = new Date(now.getTime() + 15 * 60 * 1000);
                        const hours = String(future.getHours()).padStart(2, '0');
                        const minutes = String(future.getMinutes()).padStart(2, '0');
                        setCapsuleTime(`${hours}:${minutes}`);
                      }
                    }}
                    className={`py-2 px-3 rounded-xl font-mono text-[9px] font-bold uppercase tracking-wider text-center transition-all ${
                      isTimeCapsule
                        ? "bg-amber-900 text-[#fcfaf4] shadow-sm"
                        : "text-[#8a8172] hover:text-[#3a342a] hover:bg-[#ebdcca]/30"
                    }`}
                  >
                    Time Capsule
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsTimeCapsule(false);
                      setIsNeedPost(true);
                    }}
                    className={`py-2 px-3 rounded-xl font-mono text-[9px] font-bold uppercase tracking-wider text-center transition-all ${
                      isNeedPost
                        ? "bg-rose-900 text-[#fcfaf4] shadow-sm"
                        : "text-[#8a8172] hover:text-[#3a342a] hover:bg-[#ebdcca]/30"
                    }`}
                  >
                    Need Post 🆘
                  </button>
                </div>

                {/* DYNAMIC FORM FIELDS */}
                
                {/* INSTANT POST FIELDS */}
                {!isTimeCapsule && !isNeedPost && (
                  <div className="space-y-4">
                    <div className="space-y-1 relative">
                      <label className="block text-[9px] font-mono text-[#8a8172] uppercase tracking-wider font-bold">Post Content</label>
                      <textarea
                        name="postContent"
                        value={postContent}
                        onChange={(e) => {
                          const val = e.target.value;
                          setPostContent(val);
                          const cursor = e.target.selectionStart;
                          const textBefore = val.slice(0, cursor);
                          const match = textBefore.match(/!([a-zA-Z0-9_]*)$/);
                          if (match) {
                            setShowPostMentions(true);
                            setPostMentionFilter(match[1]);
                          } else {
                            setShowPostMentions(false);
                          }
                        }}
                        rows={4}
                        placeholder="Write here"
                        className="w-full bg-white border border-[#cfcac0] rounded-xl px-3 py-2 font-sans text-xs text-[#5c5446] focus:outline-none focus:ring-1 focus:ring-[#8a8172] resize-none"
                      />

                      {/* Mention suggestions */}
                      {showPostMentions && (
                        <div className="absolute z-50 bg-[#fdfbf7] border border-[#ebdcca] rounded-xl p-1 shadow-lg max-h-36 overflow-y-auto w-52 left-0 mt-1">
                          <div className="text-[8px] font-mono font-bold text-[#8a8172] px-2 py-1 border-b border-[#ebdcca]/60 uppercase">
                            Mention followers (!)
                          </div>
                          {followers.filter(f => 
                            (f.username || '').toLowerCase().includes(postMentionFilter.toLowerCase()) ||
                            (f.name || '').toLowerCase().includes(postMentionFilter.toLowerCase())
                          ).length === 0 ? (
                            <div className="text-[9px] font-mono text-[#8a8172] px-2 py-2 italic text-center">
                              No matching followers.
                            </div>
                          ) : (
                            followers.filter(f => 
                              (f.username || '').toLowerCase().includes(postMentionFilter.toLowerCase()) ||
                              (f.name || '').toLowerCase().includes(postMentionFilter.toLowerCase())
                            ).map((follower) => (
                              <button
                                key={follower.id}
                                type="button"
                                onClick={() => {
                                  const lastExclIdx = postContent.lastIndexOf('!', postContent.length);
                                  if (lastExclIdx !== -1) {
                                    const before = postContent.substring(0, lastExclIdx);
                                    setPostContent(before + '!' + follower.username + ' ');
                                  }
                                  setShowPostMentions(false);
                                }}
                                className="w-full flex items-center gap-1.5 px-2 py-1 text-[10px] text-[#3a342a] hover:bg-[#ebdcca]/20 rounded-lg text-left transition-all"
                              >
                                <div className="w-4 h-4 rounded bg-amber-100 flex items-center justify-center font-bold text-[8px] text-amber-800 shrink-0 uppercase">
                                  {(follower.name || 'F').charAt(0)}
                                </div>
                                <div className="truncate">
                                  <span className="font-bold block text-[10px] leading-tight truncate">{follower.name}</span>
                                  <span className="text-[8px] text-[#8a8172] block leading-none">!{follower.username}</span>
                                </div>
                              </button>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* CAPSULE POST FIELDS */}
                {isTimeCapsule && (
                  <div className="space-y-4">
                    <div className="space-y-1 relative">
                      <label className="block text-[9px] font-mono text-[#8a8172] uppercase tracking-wider font-bold">Capsule Content</label>
                      <textarea
                        name="postContent"
                        value={postContent}
                        onChange={(e) => {
                          const val = e.target.value;
                          setPostContent(val);
                          const cursor = e.target.selectionStart;
                          const textBefore = val.slice(0, cursor);
                          const match = textBefore.match(/!([a-zA-Z0-9_]*)$/);
                          if (match) {
                            setShowPostMentions(true);
                            setPostMentionFilter(match[1]);
                          } else {
                            setShowPostMentions(false);
                          }
                        }}
                        rows={4}
                        placeholder="Write here"
                        className="w-full bg-white border border-[#cfcac0] rounded-xl px-3 py-2 font-sans text-xs text-[#5c5446] focus:outline-none focus:ring-1 focus:ring-[#8a8172] resize-none"
                      />

                      {/* Mention suggestions */}
                      {showPostMentions && (
                        <div className="absolute z-50 bg-[#fdfbf7] border border-[#ebdcca] rounded-xl p-1 shadow-lg max-h-36 overflow-y-auto w-52 left-0 mt-1">
                          <div className="text-[8px] font-mono font-bold text-[#8a8172] px-2 py-1 border-b border-[#ebdcca]/60 uppercase">
                            Mention followers (!)
                          </div>
                          {followers.filter(f => 
                            (f.username || '').toLowerCase().includes(postMentionFilter.toLowerCase()) ||
                            (f.name || '').toLowerCase().includes(postMentionFilter.toLowerCase())
                          ).length === 0 ? (
                            <div className="text-[9px] font-mono text-[#8a8172] px-2 py-2 italic text-center">
                              No matching followers.
                            </div>
                          ) : (
                            followers.filter(f => 
                              (f.username || '').toLowerCase().includes(postMentionFilter.toLowerCase()) ||
                              (f.name || '').toLowerCase().includes(postMentionFilter.toLowerCase())
                            ).map((follower) => (
                              <button
                                key={follower.id}
                                type="button"
                                onClick={() => {
                                  const lastExclIdx = postContent.lastIndexOf('!', postContent.length);
                                  if (lastExclIdx !== -1) {
                                    const before = postContent.substring(0, lastExclIdx);
                                    setPostContent(before + '!' + follower.username + ' ');
                                  }
                                  setShowPostMentions(false);
                                }}
                                className="w-full flex items-center gap-1.5 px-2 py-1 text-[10px] text-[#3a342a] hover:bg-[#ebdcca]/20 rounded-lg text-left transition-all"
                              >
                                <div className="w-4 h-4 rounded bg-amber-100 flex items-center justify-center font-bold text-[8px] text-amber-800 shrink-0 uppercase">
                                  {(follower.name || 'F').charAt(0)}
                                </div>
                                <div className="truncate">
                                  <span className="font-bold block text-[10px] leading-tight truncate">{follower.name}</span>
                                  <span className="text-[8px] text-[#8a8172] block leading-none">!{follower.username}</span>
                                </div>
                              </button>
                            ))
                          )}
                        </div>
                      )}
                    </div>

                    <div className="bg-[#ebdcca]/15 border border-[#ebdcca]/40 rounded-2xl p-4 space-y-3">
                      <span className="font-mono text-[9px] font-bold text-amber-950 uppercase tracking-wider block">
                        🕒 Capsule Unlock Settings
                      </span>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label className="block text-[8px] font-mono text-[#8a8172] uppercase tracking-wider font-bold">Unlock Date</label>
                          <input 
                            type="date" 
                            value={capsuleDate}
                            onChange={(e) => setCapsuleDate(e.target.value)}
                            className="w-full bg-white border border-[#cfcac0] rounded-xl px-2.5 py-1.5 font-sans text-xs text-[#5c5446] focus:outline-none focus:ring-1 focus:ring-[#8a8172]"
                            required={isTimeCapsule}
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="block text-[8px] font-mono text-[#8a8172] uppercase tracking-wider font-bold">Unlock Time (Local)</label>
                          <input 
                            type="time" 
                            value={capsuleTime}
                            onChange={(e) => setCapsuleTime(e.target.value)}
                            className="w-full bg-white border border-[#cfcac0] rounded-xl px-2.5 py-1.5 font-sans text-xs text-[#5c5446] focus:outline-none focus:ring-1 focus:ring-[#8a8172]"
                            required={isTimeCapsule}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* NEED POST FIELDS */}
                {isNeedPost && (
                  <div className="space-y-4">
                    {/* Need Title */}
                    <div className="space-y-1">
                      <label className="block text-[9px] font-mono text-rose-900 uppercase tracking-wider font-bold">Need Title</label>
                      <input
                        type="text"
                        name="postTitle"
                        defaultValue={editingFeedPost?.title || ''}
                        placeholder="Write here"
                        className="w-full bg-white border border-[#cfcac0] rounded-xl px-3 py-2 font-sans text-xs text-[#5c5446] focus:outline-none focus:ring-1 focus:ring-rose-400"
                        required={isNeedPost}
                      />
                    </div>

                    {/* Text Box / Description */}
                    <div className="space-y-1 relative">
                      <label className="block text-[9px] font-mono text-rose-900 uppercase tracking-wider font-bold">Description / Text Box</label>
                      <textarea
                        name="postContent"
                        value={postContent}
                        onChange={(e) => {
                          const val = e.target.value;
                          setPostContent(val);
                          setNeedBox(val);
                          const cursor = e.target.selectionStart;
                          const textBefore = val.slice(0, cursor);
                          const match = textBefore.match(/!([a-zA-Z0-9_]*)$/);
                          if (match) {
                            setShowPostMentions(true);
                            setPostMentionFilter(match[1]);
                          } else {
                            setShowPostMentions(false);
                          }
                        }}
                        rows={4}
                        placeholder="Write here"
                        className="w-full bg-white border border-[#cfcac0] rounded-xl px-3 py-2 font-sans text-xs text-[#5c5446] focus:outline-none focus:ring-1 focus:ring-rose-400 resize-none"
                        required={isNeedPost}
                      />

                      {/* Mention suggestions */}
                      {showPostMentions && (
                        <div className="absolute z-50 bg-[#fdfbf7] border border-[#ebdcca] rounded-xl p-1 shadow-lg max-h-36 overflow-y-auto w-52 left-0 mt-1">
                          <div className="text-[8px] font-mono font-bold text-[#8a8172] px-2 py-1 border-b border-[#ebdcca]/60 uppercase">
                            Mention followers (!)
                          </div>
                          {followers.filter(f => 
                            (f.username || '').toLowerCase().includes(postMentionFilter.toLowerCase()) ||
                            (f.name || '').toLowerCase().includes(postMentionFilter.toLowerCase())
                          ).length === 0 ? (
                            <div className="text-[9px] font-mono text-[#8a8172] px-2 py-2 italic text-center">
                              No matching followers.
                            </div>
                          ) : (
                            followers.filter(f => 
                              (f.username || '').toLowerCase().includes(postMentionFilter.toLowerCase()) ||
                              (f.name || '').toLowerCase().includes(postMentionFilter.toLowerCase())
                            ).map((follower) => (
                              <button
                                key={follower.id}
                                type="button"
                                onClick={() => {
                                  const lastExclIdx = postContent.lastIndexOf('!', postContent.length);
                                  if (lastExclIdx !== -1) {
                                    const before = postContent.substring(0, lastExclIdx);
                                    setPostContent(before + '!' + follower.username + ' ');
                                  }
                                  setShowPostMentions(false);
                                }}
                                className="w-full flex items-center gap-1.5 px-2 py-1 text-[10px] text-[#3a342a] hover:bg-[#ebdcca]/20 rounded-lg text-left transition-all"
                              >
                                <div className="w-4 h-4 rounded bg-amber-100 flex items-center justify-center font-bold text-[8px] text-amber-800 shrink-0 uppercase">
                                  {(follower.name || 'F').charAt(0)}
                                </div>
                                <div className="truncate">
                                  <span className="font-bold block text-[10px] leading-tight truncate">{follower.name}</span>
                                  <span className="text-[8px] text-[#8a8172] block leading-none">!{follower.username}</span>
                                </div>
                              </button>
                            ))
                          )}
                        </div>
                      )}
                    </div>

                    {/* Urgency Status */}
                    <div className="space-y-1.5">
                      <label className="block text-[9px] font-mono text-[#8a8172] uppercase tracking-wider font-bold">Urgency Status</label>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setNeedUrgency('urgent')}
                          className={`py-1.5 px-2 rounded-xl text-[10px] font-bold font-mono uppercase border transition-all flex items-center justify-center gap-1.5 ${
                            needUrgency === 'urgent' 
                              ? 'bg-rose-100 text-rose-800 border-rose-400 font-extrabold' 
                              : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
                          }`}
                        >
                          🚨 Urgent
                        </button>
                        <button
                          type="button"
                          onClick={() => setNeedUrgency('normal')}
                          className={`py-1.5 px-2 rounded-xl text-[10px] font-bold font-mono uppercase border transition-all flex items-center justify-center gap-1.5 ${
                            needUrgency === 'normal' 
                              ? 'bg-blue-100 text-blue-800 border-blue-400 font-extrabold' 
                              : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
                          }`}
                        >
                          🟢 Normal
                        </button>
                      </div>
                    </div>

                    {/* Location */}
                    <div className="space-y-1">
                      <label className="block text-[9px] font-mono text-[#8a8172] uppercase tracking-wider font-bold">📍 Location</label>
                      <input
                        type="text"
                        required={isNeedPost}
                        value={needLocation}
                        onChange={(e) => setNeedLocation(e.target.value)}
                        placeholder="Write here"
                        className="w-full bg-white border border-[#cfcac0] rounded-xl px-3 py-1.5 font-sans text-xs text-[#5c5446] focus:outline-none focus:ring-1 focus:ring-rose-400"
                      />
                    </div>

                    {/* Timeline */}
                    <div className="space-y-1">
                      <label className="block text-[9px] font-mono text-[#8a8172] uppercase tracking-wider font-bold">🕒 Timeline</label>
                      <input
                        type="text"
                        required={isNeedPost}
                        value={needTime}
                        onChange={(e) => setNeedTime(e.target.value)}
                        placeholder="Write here"
                        className="w-full bg-white border border-[#cfcac0] rounded-xl px-3 py-1.5 font-sans text-xs text-[#5c5446] focus:outline-none focus:ring-1 focus:ring-rose-400"
                      />
                    </div>
                  </div>
                )}




                {/* Upload & record section */}
                <div className="bg-[#f0ede6]/50 p-4 rounded-2xl border border-[#ebdcca]/80 space-y-3 text-xs text-left">
                  <span className="font-mono text-[9px] font-bold text-[#8a8172] uppercase tracking-wider block">
                    Portfolio Media attachments
                  </span>

                  {/* 3 Attachment Actions Row */}
                  <div className="grid grid-cols-3 gap-2">
                    {/* Image Attachment Input Button */}
                    <label className={`flex flex-col items-center justify-center p-2.5 bg-white rounded-xl border border-[#ebdcca] ${isUploadingMedia ? 'opacity-50 cursor-not-allowed' : 'hover:border-[#8a8172] cursor-pointer'} text-center select-none`} title="Add Image">
                      <Image size={16} className={isUploadingMedia ? "text-amber-500 animate-pulse" : "text-[#8a8172]"} />
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        disabled={isUploadingMedia}
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            // Route through the in-app photo editor before attaching.
                            setPhotoEditFile(file);
                          }
                        }}
                      />
                    </label>

                    {/* Video Attachment Input Button */}
                    <label className={`flex flex-col items-center justify-center p-2.5 bg-white rounded-xl border border-[#ebdcca] ${isUploadingMedia ? 'opacity-50 cursor-not-allowed' : 'hover:border-[#8a8172] cursor-pointer'} text-center select-none`} title="Add Video">
                      <Video size={16} className={isUploadingMedia ? "text-amber-500 animate-pulse" : "text-[#8a8172]"} />
                      <input
                        type="file"
                        accept="video/*"
                        className="hidden"
                        disabled={isUploadingMedia}
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            if (file.size > 200 * 1024 * 1024) { // 200MB Limit
                              showToast("⚠️ Video file is too large. Please upload a video under 200MB.");
                              return;
                            }
                            setIsUploadingMedia(true);
                            showToast("⏳ Processing & uploading video to network server...");
                            try {
                              const url = await uploadMediaFile(file);
                              setAttachedVideo(url);
                              showToast("🎬 Video attached & saved successfully!");
                            } catch (err: any) {
                              console.error("Video upload error:", err);
                              const msg = err?.message || 'Failed to upload video.';
                              showToast(`⚠️ ${msg}`);
                            } finally {
                              setIsUploadingMedia(false);
                            }
                          }
                        }}
                      />
                    </label>

                    {/* Audio Attachment & Click-and-Hold Voice Recording Button */}
                    <div
                      className={`flex flex-col items-center justify-center p-2.5 bg-white rounded-xl border cursor-pointer text-center select-none transition-all relative ${
                        recording ? 'border-red-500 bg-red-50 animate-pulse' : 'border-[#ebdcca] hover:border-[#8a8172]'
                      }`}
                      title="Click to upload audio file, or Click & Hold to Record Voice Note"
                      onMouseDown={(e) => {
                        const timer = setTimeout(() => {
                          startAudioRecording();
                        }, 250);
                        (e.currentTarget as any)._holdTimer = timer;
                      }}
                      onMouseUp={(e) => {
                        const timer = (e.currentTarget as any)._holdTimer;
                        if (timer) clearTimeout(timer);
                        if (recording) {
                          stopAudioRecording();
                        } else {
                          const input = e.currentTarget.querySelector('input[type="file"]') as HTMLInputElement;
                          if (input) input.click();
                        }
                      }}
                      onMouseLeave={(e) => {
                        const timer = (e.currentTarget as any)._holdTimer;
                        if (timer) clearTimeout(timer);
                        if (recording) {
                          stopAudioRecording();
                        }
                      }}
                      onTouchStart={(e) => {
                        const timer = setTimeout(() => {
                          startAudioRecording();
                        }, 250);
                        (e.currentTarget as any)._holdTimer = timer;
                      }}
                      onTouchEnd={(e) => {
                        const timer = (e.currentTarget as any)._holdTimer;
                        if (timer) clearTimeout(timer);
                        if (recording) {
                          stopAudioRecording();
                        } else {
                          const input = e.currentTarget.querySelector('input[type="file"]') as HTMLInputElement;
                          if (input) input.click();
                        }
                      }}
                    >
                      <Mic size={16} className={recording ? "text-red-600 animate-bounce" : "text-[#8a8172]"} />
                      {recording && (
                        <span className="absolute -top-6 bg-red-600 text-white font-mono text-[7px] px-1.5 py-0.5 rounded-md whitespace-nowrap shadow-md uppercase font-bold animate-pulse">
                          Rec ({recordingTime}s)... Release
                        </span>
                      )}
                      <input
                        type="file"
                        accept="audio/*,.mp3,.wav,.m4a,.ogg,.aac"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            if (file.size > 30 * 1024 * 1024) { // 30MB Limit
                              showToast("⚠️ Audio file is too large. Please upload an audio under 30MB.");
                              return;
                            }
                            showToast("🎙️ Uploading audio file...");
                            uploadMediaFile(file).then(url => {
                              setAttachedAudio(url);
                              showToast("🎙️ Audio attached & saved successfully!");
                            }).catch(err => {
                              console.error("Audio upload error:", err);
                              showToast("⚠️ Failed to upload audio.");
                            });
                          }
                        }}
                      />
                    </div>
                  </div>

                  {/* ── Create Studio: client-side editor engines ── */}
                  <div className="bg-[#f9f7f2] border border-[#ebdcca]/80 rounded-2xl p-3 space-y-2">
                    <span className="font-mono text-[9px] font-bold text-[#8a8172] uppercase tracking-wider block">
                      ✨ Create Studio — canvas, whiteboard, stories &amp; video (in-browser)
                    </span>
                    <div className="grid grid-cols-4 gap-2">
                      <button
                        type="button"
                        onClick={() => setShowCanvasDesign(true)}
                        className="flex flex-col items-center gap-1 p-2.5 bg-white rounded-xl border border-[#ebdcca] hover:border-[#8a8172] hover:bg-[#ebdcca]/20 transition-all cursor-pointer"
                        title="1080×1080 design canvas — text, stickers, shapes"
                      >
                        <PenTool size={16} className="text-[#8a8172]" />
                        <span className="text-[9px] font-mono font-bold text-[#3a342a]">Design</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowWhiteboard(true)}
                        className="flex flex-col items-center gap-1 p-2.5 bg-white rounded-xl border border-[#ebdcca] hover:border-[#8a8172] hover:bg-[#ebdcca]/20 transition-all cursor-pointer"
                        title="Infinite whiteboard — freehand, arrows, shapes"
                      >
                        <PenLine size={16} className="text-[#8a8172]" />
                        <span className="text-[9px] font-mono font-bold text-[#3a342a]">Board</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowStoryEditor(true)}
                        className="flex flex-col items-center gap-1 p-2.5 bg-white rounded-xl border border-[#ebdcca] hover:border-[#8a8172] hover:bg-[#ebdcca]/20 transition-all cursor-pointer"
                        title="9:16 story overlay — annotate for Ocean Stories"
                      >
                        <Smartphone size={16} className="text-[#8a8172]" />
                        <span className="text-[9px] font-mono font-bold text-[#3a342a]">Story</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowCutVideo(true)}
                        className="flex flex-col items-center gap-1 p-2.5 bg-white rounded-xl border border-[#ebdcca] hover:border-[#8a8172] hover:bg-[#ebdcca]/20 transition-all cursor-pointer"
                        title="Trim / speed / audio-merge video with FFmpeg WASM"
                      >
                        <Scissors size={16} className="text-[#8a8172]" />
                        <span className="text-[9px] font-mono font-bold text-[#3a342a]">Cut</span>
                      </button>
                    </div>
                  </div>

                  {/* Post GIF Picker */}
                  {showPostGifPicker && (
                    <div className="bg-white border border-[#ebdcca] rounded-xl p-3 space-y-2 max-h-56 overflow-y-auto">
                      <div className="flex items-center justify-between border-b border-[#ebdcca]/50 pb-1.5">
                        <span className="font-mono text-[8px] font-bold text-[#8a8172] uppercase">⚡ Choose Trending GIF</span>
                        <button
                          type="button"
                          onClick={() => setShowPostGifPicker(false)}
                          className="text-[#8a8172] font-mono text-[8px] uppercase hover:underline"
                        >
                          Close
                        </button>
                      </div>
                      <div className="grid grid-cols-4 gap-1.5">
                        {[
                          { name: 'Funny Cat', url: 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExM3Z0ZWF4b3o4OWpxcGttam16NDNpZHlxbmtvdXowajJvMGFzdmRhNiZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/Vff5Q2bZgjezRZ1MTM/giphy.gif' },
                          { name: 'Clapping', url: 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExbTZ0ODNoYTR0aWJ3amFiaG4xMXBvdXo0dHFkaWpldDJyMGh2Ymt3OSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/nbvFVArJe648/giphy.gif' },
                          { name: 'Mind Blown', url: 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExM3Jwd2Ntb293NHA1bXVub3MxbDRidnh5c2Fna3Vpa3pibGFvdTZieSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/l0Iyf53PycaHTLk9G/giphy.gif' },
                          { name: 'Dance Party', url: 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExd2RvdWloY2Fmdnd1eHF2eHoxeW12OHJ5NGRoMGpzaTVhZmsyd3g4YSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/13CoXDiaCcC9Ak/giphy.gif' },
                          { name: 'Thumbs Up', url: 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExb2swcDRoYTZ5bXV0cnd4Nmt4OWsydTgwNXB0dzM5OHd1dm9xbzFwYSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/3oz8xAFtqoOUUrEl8c/giphy.gif' },
                          { name: 'No Way', url: 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExOXpyNHA1MGN6cmNwbjVnYXRzc2s5d3U4ZndrcTBodWtxczBhMzdveSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/12yR7qyJ6fapQQ/giphy.gif' },
                          { name: 'Excited', url: 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExbnp5cHdwMDhtZXoxajN1MXA1aGVwYnVwcmNyNzFmZ2tzNGR0MXN0dyZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/26n6R5HO1II3DfZYI/giphy.gif' },
                          { name: 'Cute Dog', url: 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExM3FpNXFqcnA5eXhrMTRpdTZwOXptZHpuMTN4NXR3OHY3OHY3OWs3MG5pMXl6NXZyMyZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/H8mFzy5lX9Cgg/giphy.gif' }
                        ].map((gif) => (
                          <button
                            key={gif.url}
                            type="button"
                            onClick={() => {
                              setAttachedImage(gif.url);
                              setShowPostGifPicker(false);
                            }}
                            className="relative aspect-video rounded overflow-hidden border border-gray-100 hover:border-amber-500 transition-all group bg-black/5"
                          >
                            <img src={gif.url || null} alt={gif.name} className="w-full h-full object-cover" />
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-all">
                              <span className="text-[7px] text-white font-mono uppercase font-bold">{gif.name}</span>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* CUSTOM AUDIO RECORDER INTERFACE */}
                  <div className="bg-white border border-[#ebdcca] rounded-xl p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[8px] font-bold text-[#8a8172] uppercase">Live Audio Recorder</span>
                      {recording && (
                        <span className="font-mono text-[8px] text-red-600 font-bold uppercase animate-pulse flex items-center gap-1">
                          ● Recording ({recordingTime}s)
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      {!recording ? (
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                              const recorder = new MediaRecorder(stream);
                              const chunks: Blob[] = [];
                              recorder.ondataavailable = (e) => chunks.push(e.data);
                              recorder.onstop = async () => {
                                const blob = new Blob(chunks, { type: 'audio/webm' });
                                showToast("🎙️ Uploading recorded voice note...");
                                try {
                                  const url = await uploadMediaFile(blob, `recording-${Date.now()}.webm`);
                                  setAttachedAudio(url);
                                  showToast("🎙️ Voice note attached!");
                                } catch (err) {
                                  console.error("Audio recording upload error:", err);
                                  showToast("⚠️ Voice note upload failed.");
                                }
                              };
                              recorder.start();
                              setMediaRecorder(recorder);
                              setRecording(true);
                              setRecordingTime(0);
                              const interval = setInterval(() => {
                                setRecordingTime(prev => prev + 1);
                              }, 1000);
                              setRecordingInterval(interval);
                              showToast("Recording started. Speak now!");
                            } catch (err) {
                              console.error(err);
                              showToast("⚠️ Microphone access denied.");
                            }
                          }}
                          className="font-mono text-[8px] uppercase font-bold py-1.5 px-3 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100 transition-all flex items-center gap-1"
                        >
                          <Mic size={10} /> Record Mic
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            if (mediaRecorder) {
                              mediaRecorder.stop();
                              mediaRecorder.stream.getTracks().forEach(track => track.stop());
                            }
                            if (recordingInterval) {
                              clearInterval(recordingInterval);
                            }
                            setRecording(false);
                            setMediaRecorder(null);
                            setRecordingInterval(null);
                            showToast("Recording stopped. Audio compiled!");
                          }}
                          className="font-mono text-[8px] uppercase font-bold py-1.5 px-3 rounded-lg bg-red-50 text-red-800 border border-red-200 hover:bg-red-100 transition-all flex items-center gap-1"
                        >
                          <StopCircle size={10} /> Stop
                        </button>
                      )}

                      {attachedAudio && (
                        <span className="font-mono text-[8px] text-emerald-800 font-bold bg-emerald-50 px-2 py-1 rounded-md border border-emerald-200 flex items-center gap-1 shrink-0">
                          ✓ Audio Attached
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Preview Attachments */}
                  {(attachedImage || attachedVideo || attachedAudio) && (
                    <div className="bg-white border border-[#ebdcca] rounded-xl p-3 space-y-2">
                      <div className="flex items-center justify-between border-b border-[#ebdcca]/50 pb-1.5">
                        <span className="font-mono text-[8px] font-bold text-[#8a8172] uppercase">Prepared Attachments</span>
                        <button
                          type="button"
                          onClick={() => {
                            setAttachedImage('');
                            setAttachedVideo('');
                            setAttachedAudio('');
                          }}
                          className="text-red-700 font-mono text-[8px] uppercase font-bold hover:underline"
                        >
                          Clear All
                        </button>
                      </div>

                      {attachedImage && (
                        <div className="relative rounded-lg overflow-hidden border border-[#ebdcca] max-h-32 flex items-center justify-center">
                          <img src={attachedImage || null} alt="Preview" className="w-full h-full object-cover max-h-32" />
                          <button
                            type="button"
                            onClick={() => setPhotoEditFile(attachedImage)}
                            title="Edit photo in the in-app editor"
                            className="absolute top-1 right-7 bg-amber-900/80 hover:bg-amber-900 text-white rounded-full p-1 transition-colors"
                          >
                            <PenTool size={10} />
                          </button>
                          <button
                            type="button"
                            onClick={() => setAttachedImage('')}
                            className="absolute top-1 right-1 bg-black/60 hover:bg-black/80 text-white rounded-full p-1 transition-colors"
                          >
                            <X size={10} />
                          </button>
                        </div>
                      )}

                      {attachedVideo && (
                        <div className="relative rounded-lg overflow-hidden border border-[#ebdcca] bg-black max-h-32 flex items-center justify-center">
                          <video src={attachedVideo || null} controls className="w-full max-h-32" />
                          <button
                            type="button"
                            onClick={() => setAttachedVideo('')}
                            className="absolute top-1 right-1 bg-black/60 hover:bg-black/80 text-white rounded-full p-1 transition-colors"
                          >
                            <X size={10} />
                          </button>
                        </div>
                      )}

                      {attachedAudio && (
                        <div className="relative flex items-center justify-between gap-1 bg-[#fcfaf4] border border-[#ebdcca] p-2 rounded-lg">
                          <audio src={attachedAudio || null} controls className="w-full" />
                          <button
                            type="button"
                            onClick={() => setAttachedAudio('')}
                            className="bg-[#3a342a]/10 hover:bg-[#3a342a]/20 text-[#3a342a] rounded-full p-1 transition-colors shrink-0"
                          >
                            <X size={10} />
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex justify-end gap-2 border-t border-[#ebdcca]/60 pt-3">
                  <button
                    type="button"
                    onClick={() => setIsCreatePostOpen(false)}
                    className="font-mono text-[10px] uppercase font-bold text-[#8a8172] hover:bg-[#ebdcca]/40 px-4 py-2 rounded-xl border border-[#cfcac0]"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isUploadingPost || isUploadingMedia}
                    className={`font-mono text-[10px] uppercase font-bold text-[#f4f1ea] px-4 py-2 rounded-xl shadow-md transition-colors ${(isUploadingPost || isUploadingMedia) ? 'bg-[#8a8172] cursor-not-allowed' : 'bg-[#3a342a] hover:bg-[#52493b]'}`}
                  >
                    {isUploadingPost || isUploadingMedia ? <span className="animate-pulse">Processing...</span> : 
                    (editingFeedPost ? "Save Modification" : "Publish to Feed")}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* RICH POST SHARING MODAL */}
      <AnimatePresence>
        {sharingPost && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#2e2920]/60 backdrop-blur-xs">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[#fcfaf4] border border-[#ebdcca] rounded-3xl p-5 md:p-6 max-w-md w-full shadow-2xl space-y-4 text-left"
            >
              <div className="flex items-center justify-between border-b border-[#ebdcca] pb-3">
                <div className="flex items-center gap-2">
                  <Share2 className="text-[#8a8172]" size={16} />
                  <h3 className="font-display font-bold text-sm text-[#3a342a] tracking-tight uppercase">
                    Share Network Publication
                  </h3>
                </div>
                <button
                  onClick={() => setSharingPost(null)}
                  className="text-[#8a8172] hover:text-[#3a342a] p-1.5 rounded-lg hover:bg-[#ebdcca]/20 transition-colors"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="space-y-4 text-xs">
                <p className="text-[#5c5446] leading-relaxed">
                  Every secure publication is referenced by an end-to-end routing string. Copy this secure cryptographic identifier to share it with your professional network:
                </p>

                {/* Secure URL Input Display Box */}
                <div className="bg-white border border-[#cfcac0] rounded-xl p-3 flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={`${window.location.origin}/#post-${sharingPost.id}`}
                    className="w-full bg-transparent outline-none font-mono text-[10px] text-[#5c5446] overflow-x-auto select-all"
                    onClick={(e) => (e.target as HTMLInputElement).select()}
                  />
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(`${window.location.origin}/#post-${sharingPost.id}`);
                      showToast("✓ Copied to secure clipboard!");
                    }}
                    className="font-mono text-[9px] uppercase font-bold py-1 px-2 bg-[#ebdcca] text-[#3a342a] hover:bg-[#eae6dc] rounded-lg shrink-0 transition-all border border-[#cfcac0]"
                  >
                    Copy
                  </button>
                </div>

                {/* Preview Thumbnail Card */}
                <div className="bg-[#f5f2eb] border border-[#ebdcca] rounded-xl p-3 text-left space-y-1">
                  <span className="font-mono text-[8px] uppercase tracking-wider text-[#8a8172] font-bold">Preview Sharing Card</span>
                  <h4 className="font-sans font-bold text-[#3a342a]">{sharingPost.title}</h4>
                  <p className="text-[10px] text-[#8a8172] font-sans line-clamp-2">{sharingPost.content}</p>
                </div>

                {/* Send to Friends Section */}
                <div className="space-y-2 pt-2 border-t border-[#ebdcca]/40">
                  <span className="font-mono text-[8px] uppercase tracking-wider text-[#8a8172] font-bold block mb-1">Send to Friends in Chat</span>
                  {(!friends || friends.length === 0) ? (
                    <p className="text-[10px] text-[#8a8172] italic">No friends added yet. Connect with other creators to share in chat!</p>
                  ) : (
                    <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1">
                      {friends.map((friend: any) => {
                        const isSharingThis = sharingToFriendId === friend.id;
                        return (
                          <div key={friend.id} className="flex items-center justify-between p-1.5 hover:bg-[#ebdcca]/10 rounded-lg transition-all border border-[#ebdcca]/20 bg-white/40">
                            <div className="flex items-center gap-2 min-w-0">
                              <img
                                src={friend.avatarUrl || `https://api.dicebear.com/7.x/bottts/svg?seed=${friend.name}`}
                                alt={friend.name}
                                className="w-6 h-6 rounded-full border border-[#ebdcca] object-cover shrink-0"
                                referrerPolicy="no-referrer"
                              />
                              <div className="min-w-0">
                                <p className="font-sans font-bold text-[10px] text-[#3a342a] truncate">{friend.name}</p>
                                <p className="font-mono text-[8px] text-[#8a8172] truncate">@{friend.username || 'anon'}</p>
                              </div>
                            </div>
                            <button
                              disabled={!!sharingToFriendId}
                              onClick={() => handleSharePostToFriend(sharingPost, friend.id)}
                              className={`font-mono text-[8px] uppercase font-bold px-2.5 py-1.5 rounded-lg border transition-all shrink-0 ${
                                isSharingThis 
                                  ? 'bg-amber-100 text-amber-800 border-amber-300' 
                                  : 'bg-white text-[#3a342a] hover:bg-[#3a342a] hover:text-[#f4f1ea] border-[#cfcac0] active:scale-95'
                              }`}
                            >
                              {isSharingThis ? 'Sending...' : 'Send'}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex justify-end border-t border-[#ebdcca]/60 pt-3">
                <button
                  onClick={() => setSharingPost(null)}
                  className="font-mono text-[10px] uppercase font-bold text-[#f4f1ea] bg-[#3a342a] hover:bg-[#52493b] py-2 px-5 rounded-xl shadow-xs transition-colors"
                >
                  Done
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* =======================================================
          GLOBAL FULLSCREEN IMAGE LIGHTBOX VIEW
          ======================================================= */}
      <AnimatePresence>
        {fullscreenImageUrl && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-2 sm:p-4 bg-black/90 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="relative w-full h-full max-w-7xl max-h-[92vh] flex flex-col items-center justify-center select-none"
            >
              {/* Close Button */}
              <button
                onClick={() => setFullscreenImageUrl(null)}
                className="absolute top-3 right-3 bg-stone-900/90 text-white hover:bg-stone-800 p-3 rounded-full shadow-2xl z-20 hover:scale-105 active:scale-95 cursor-pointer border border-stone-700"
                title="Close fullscreen view"
              >
                <X size={20} />
              </button>

              {/* Uncropped Full Image Display Container */}
              <div className="w-full h-full flex items-center justify-center overflow-auto p-2">
                <img
                  src={fullscreenImageUrl || null}
                  alt="Full Publication Attachment"
                  className="max-w-full max-h-[85vh] w-auto h-auto object-contain rounded-2xl border border-stone-800 shadow-2xl bg-black/40"
                  referrerPolicy="no-referrer"
                />
              </div>

              <div className="mt-2 flex items-center gap-3">
                <button
                  onClick={() => handleDownloadMedia(fullscreenImageUrl, 'attachment.png')}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-amber-900 text-white hover:bg-amber-950 font-mono text-xs font-bold uppercase tracking-wider rounded-2xl transition-all shadow-md active:scale-95 cursor-pointer"
                >
                  <Download size={14} /> Download High-Res Image
                </button>
              </div>
            </motion.div>
            
            {/* Click backdrop to close */}
            <div 
              className="absolute inset-0 -z-10 cursor-zoom-out" 
              onClick={() => setFullscreenImageUrl(null)} 
            />
          </div>
        )}
      </AnimatePresence>

      {/* =======================================================
          GLOBAL FULLSCREEN MEDIA VIEW (NON-BLOCKING SEAMLESS VIEW WITH CORNER BUTTONS)
          ======================================================= */}
      <AnimatePresence>
        {fullscreenMedia && (() => {
          const post = fullscreenMedia.post;
          const mediaUrl = fullscreenMedia.mediaUrl;
          const mediaType = fullscreenMedia.mediaType;
          
          return (
            <div className="fixed inset-0 z-[120] flex items-center justify-center bg-[#1c1811]/98 backdrop-blur-lg select-none">
              {/* Back button on top-left */}
              <button
                onClick={() => setFullscreenMedia(null)}
                className="absolute top-4 left-4 md:top-6 md:left-6 bg-black/40 hover:bg-black/60 text-[#fcfaf4] border border-white/20 px-4 py-2 rounded-2xl text-[10px] font-mono font-bold uppercase tracking-wider flex items-center gap-2 shadow-lg transition-all z-10"
              >
                ← Back
              </button>

              {/* Download Button on top-right */}
              <button
                onClick={() => handleDownloadMedia(mediaUrl, mediaType === 'image' ? 'photo.png' : 'video.mp4')}
                className="absolute top-4 right-4 md:top-6 md:right-6 bg-black/40 hover:bg-black/60 text-[#fcfaf4] border border-white/20 p-2.5 rounded-full shadow-lg transition-all z-10 hover:scale-105 active:scale-95"
                title="Download Media"
              >
                <Download size={18} />
              </button>

              {/* Centered Media Fitting */}
              <div 
                className="w-full h-full flex items-center justify-center cursor-zoom-out"
                onClick={() => setFullscreenMedia(null)}
              >
                {mediaType === 'image' ? (
                  <img
                    src={mediaUrl || null}
                    alt={post.title}
                    className="w-full h-full object-contain"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <video
                    src={mediaUrl || null}
                    controls
                    autoPlay
                    playsInline
                    preload="metadata"
                    className="w-full h-full object-contain cursor-default"
                    onClick={(e) => e.stopPropagation()}
                  />
                )}
              </div>
            </div>
          );
        })()}
      </AnimatePresence>

              {/* Immersive Reels scrolling viewer (Facebook / YouTube Shorts Style Reels UX) */}
              <AnimatePresence>
                {activeImmersiveReelIndex !== null && (() => {
                  const reel = filteredReels[activeImmersiveReelIndex];
                  if (!reel) return null;

                  const isFeedReel = reel.id.startsWith('reel-feed-');
                  const originalId = isFeedReel ? reel.id.replace('reel-feed-', '') : reel.id;
                  const postRep = isFeedReel ? feedList.find(p => p.id === originalId) : null;
                  const isLiked = isFeedReel
                    ? Boolean(user && postRep?.likedBy && Array.isArray(postRep.likedBy) && postRep.likedBy.includes(user.id))
                    : reel.isServerReel
                      ? Boolean(user && Array.isArray(reel.likedBy) && reel.likedBy.includes(user.id))
                      : likedReels.includes(reel.id);
                  const displayLikes = isFeedReel
                    ? (postRep?.likes ?? reel.likes)
                    : reel.isServerReel
                      ? (reel.likes ?? 0)
                      : (isLiked ? reel.likes + 1 : reel.likes);

                  return (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-md flex items-center justify-center p-0 md:p-6 text-white"
                    >
                      {/* Close overlay on backdrop click */}
                      <div className="absolute inset-0 z-10" onClick={() => setActiveImmersiveReelIndex(null)} />

                      {/* Main Device Frame Container */}
                      <div 
                        onTouchStart={(e) => {
                          setTouchStartY(e.targetTouches[0].clientY);
                          setTouchEndY(null);
                        }}
                        onTouchMove={(e) => {
                          setTouchEndY(e.targetTouches[0].clientY);
                        }}
                        onTouchEnd={() => {
                          if (touchStartY === null || touchEndY === null) return;
                          const distance = touchStartY - touchEndY;
                          const minSwipeDistance = 40;
                          if (distance > minSwipeDistance) {
                            // Swipe up -> Next Reel
                            setActiveImmersiveReelIndex(prev => {
                              if (prev === null) return null;
                              return prev < filteredReels.length - 1 ? prev + 1 : 0;
                            });
                          } else if (distance < -minSwipeDistance) {
                            // Swipe down -> Prev Reel
                            setActiveImmersiveReelIndex(prev => {
                              if (prev === null) return null;
                              return prev > 0 ? prev - 1 : filteredReels.length - 1;
                            });
                          }
                          setTouchStartY(null);
                          setTouchEndY(null);
                        }}
                        onWheel={(e) => {
                          if (Math.abs(e.deltaY) < 30) return;
                          const now = Date.now();
                          if ((window as any)._lastReelWheel && now - (window as any)._lastReelWheel < 600) {
                            return;
                          }
                          (window as any)._lastReelWheel = now;
                          if (e.deltaY > 0) {
                            setActiveImmersiveReelIndex(prev => {
                              if (prev === null) return null;
                              return prev < filteredReels.length - 1 ? prev + 1 : 0;
                            });
                          } else {
                            setActiveImmersiveReelIndex(prev => {
                              if (prev === null) return null;
                              return prev > 0 ? prev - 1 : filteredReels.length - 1;
                            });
                          }
                        }}
                        className="relative w-full max-w-md h-full md:h-[95vh] md:max-h-[850px] bg-neutral-950 md:rounded-3xl border border-neutral-800 flex flex-col overflow-hidden z-20 shadow-2xl select-none"
                      >
                        
                        {/* Immersive Background Canvas Rendering */}
                        <div className="absolute inset-0 pointer-events-none opacity-40 blur-3xl scale-125">
                          <img 
                            src={reel.imageUrl || null} 
                            alt="" 
                            className="w-full h-full object-cover animate-pulse"
                          />
                        </div>

                        {/* Top controls header */}
                        <div className="absolute top-0 inset-x-0 bg-gradient-to-b from-black/80 via-black/40 to-transparent p-4 flex items-center justify-between z-30 pointer-events-auto">
                          <div className="flex items-center gap-2">
                            <span className="bg-rose-600 text-white font-mono font-extrabold text-[9px] uppercase tracking-widest px-2.5 py-0.5 rounded-full shadow-xs flex items-center gap-1">
                              🎬 REELS
                            </span>
                          </div>
                          
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => setIsReelsMuted(!isReelsMuted)}
                              className="w-8 h-8 rounded-full bg-black/50 hover:bg-black/80 flex items-center justify-center border border-white/20 hover:border-white/40 transition-all cursor-pointer text-white"
                              title={isReelsMuted ? "Unmute Audio" : "Mute Audio"}
                            >
                              {isReelsMuted ? <VolumeX size={15} /> : <Volume2 size={15} className="text-amber-400 animate-pulse" />}
                            </button>
                            <button
                              onClick={() => setActiveImmersiveReelIndex(null)}
                              className="w-8 h-8 rounded-full bg-black/50 hover:bg-black/80 flex items-center justify-center border border-white/20 hover:border-white/40 transition-all cursor-pointer text-white"
                              title="Close Reels Viewer"
                            >
                              <X size={16} />
                            </button>
                          </div>
                        </div>

                        {/* Middle Content - Reel Video or Image with Tap to Play/Pause */}
                        <div 
                          onClick={() => setIsReelPaused(!isReelPaused)}
                          className="relative flex-1 bg-black flex items-center justify-center overflow-hidden cursor-pointer"
                        >
                          {reel.videoUrl ? (
                            <video 
                              key={reel.id}
                              src={reel.videoUrl || null}
                              className="w-full h-full object-contain bg-neutral-950"
                              autoPlay={!isReelPaused}
                              loop
                              muted={isReelsMuted}
                              playsInline
                              preload="metadata"
                              onTimeUpdate={(e) => {
                                // Feed the watch-time signal into the hybrid ranking engine
                                turtleRankingEngine.recordWatch(rankKeyFor(reel.id), (e.currentTarget as HTMLVideoElement).currentTime);
                              }}
                              onEnded={() => {
                                turtleRankingEngine.recordWatchEnd(rankKeyFor(reel.id));
                              }}
                              ref={(el) => {
                                if (el) {
                                  if (isReelPaused) {
                                    el.pause();
                                  } else {
                                    el.play().catch(() => {});
                                  }
                                }
                              }}
                            />
                          ) : (
                            <img 
                              src={reel.imageUrl || null} 
                              alt={reel.title} 
                              className="w-full h-full object-cover"
                              referrerPolicy="no-referrer"
                            />
                          )}
                          <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-transparent to-black/30 pointer-events-none" />

                          {/* Pause Overlay Indicator */}
                          <AnimatePresence>
                            {isReelPaused && (
                              <motion.div 
                                initial={{ opacity: 0, scale: 0.8 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.8 }}
                                className="absolute inset-0 flex items-center justify-center bg-black/30 pointer-events-none z-25"
                              >
                                <div className="w-16 h-16 rounded-full bg-black/60 backdrop-blur-md flex items-center justify-center text-white border border-white/20 shadow-2xl">
                                  <Play size={28} className="fill-white translate-x-0.5" />
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>

                          {/* Desktop Quick Click Navigation Chevrons removed for swipe/scroll only */}

                          {/* Right Column Facebook Action Bar */}
                          <div className="absolute right-3 bottom-20 flex flex-col gap-4 z-30" onClick={(e) => e.stopPropagation()}>
                            {/* Like / Star Action */}
                            <button 
                              onClick={async (e) => {
                                e.stopPropagation();
                                const isFeedReel = reel.id.startsWith('reel-feed-');
                                if (isFeedReel) {
                                  const originalId = reel.id.replace('reel-feed-', '');
                                  await handleLikeFeedPost(originalId);
                                } else if (reel.isServerReel) {
                                  // Server-persisted reel: toggle via API + optimistic update.
                                  const alreadyLiked = Array.isArray(reel.likedBy) && reel.likedBy.includes(user?.id);
                                  const nextLiked = !alreadyLiked;
                                  setServerReels(prev => prev.map(r => r.id === reel.id ? {
                                    ...r,
                                    likedBy: nextLiked
                                      ? [...(r.likedBy || []), user?.id].filter(Boolean)
                                      : (r.likedBy || []).filter((id: string) => id !== user?.id),
                                    likes: Math.max(0, (r.likes || 0) + (nextLiked ? 1 : -1)),
                                  } : r));
                                  try {
                                    await fetch(`/api/reels/${reel.id}/like`, {
                                      method: 'POST',
                                      headers: { 'Authorization': `Bearer ${token}` },
                                    });
                                  } catch (err) { console.warn('Reel like sync failed:', err); }
                                } else {
                                  const isAlreadyLiked = likedReels.includes(reel.id);
                                  let nextLiked;
                                  if (isAlreadyLiked) {
                                    nextLiked = likedReels.filter(id => id !== reel.id);
                                    setDynamicReels(prev => prev.map(r => r.id === reel.id ? { ...r, likes: Math.max(0, r.likes - 1) } : r));
                                  } else {
                                    nextLiked = [...likedReels, reel.id];
                                    setDynamicReels(prev => prev.map(r => r.id === reel.id ? { ...r, likes: r.likes + 1 } : r));
                                  }
                                  setLikedReels(nextLiked);
                                }
                              }}
                              className="w-11 h-11 rounded-full bg-black/50 backdrop-blur-md flex flex-col items-center justify-center border border-white/15 hover:bg-black/80 hover:border-amber-500/50 transition-all text-white hover:scale-105 active:scale-95 cursor-pointer shadow-lg"
                              title="Star React"
                            >
                              <Star size={18} className={isLiked ? 'fill-amber-400 text-amber-400 stroke-amber-500 animate-bounce' : 'text-white'} />
                              <span className="text-[8px] font-mono font-bold mt-0.5 text-neutral-200">{displayLikes}</span>
                            </button>

                            {/* Comment Action */}
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                const postRep = convertReelToPost(reel);
                                setActiveCommentsPost(postRep);
                              }}
                              className="w-11 h-11 rounded-full bg-black/50 backdrop-blur-md flex flex-col items-center justify-center border border-white/15 hover:bg-black/80 hover:border-amber-500/50 transition-all text-white hover:scale-105 active:scale-95 cursor-pointer shadow-lg"
                              title="Comments"
                            >
                              <MessageSquare size={18} className="text-white" />
                              <span className="text-[8px] font-mono font-bold mt-0.5 text-neutral-200">
                                {(() => {
                                  const postRep = convertReelToPost(reel);
                                  return postRep?.comments?.length || 0;
                                })()}
                              </span>
                            </button>

                            {/* Repost Action */}
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                const postRep = convertReelToPost(reel);
                                handleRepostFeedPost(postRep);
                              }}
                              className="w-11 h-11 rounded-full bg-black/50 backdrop-blur-md flex flex-col items-center justify-center border border-white/15 hover:bg-black/80 hover:border-amber-500/50 transition-all text-white hover:scale-105 active:scale-95 cursor-pointer shadow-lg"
                              title="Repost"
                            >
                              <Repeat size={18} className="text-white" />
                              <span className="text-[8px] font-mono font-bold mt-0.5 text-neutral-200">
                                {(() => {
                                  const postRep = convertReelToPost(reel);
                                  return postRep?.repostsCount || 0;
                                })()}
                              </span>
                            </button>

                            {/* Save Action */}
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSavePost(reel.id);
                              }}
                              className="w-11 h-11 rounded-full bg-black/50 backdrop-blur-md flex flex-col items-center justify-center border border-white/15 hover:bg-black/80 hover:border-amber-500/50 transition-all text-white hover:scale-105 active:scale-95 cursor-pointer shadow-lg"
                              title="Save"
                            >
                              <Bookmark 
                                size={18} 
                                className={profile.savedPostIds?.includes(reel.id) ? 'fill-amber-500 text-amber-500' : 'text-white'} 
                              />
                              <span className="text-[7px] font-mono font-bold mt-0.5 text-neutral-200">
                                {profile.savedPostIds?.includes(reel.id) ? 'Saved' : 'Save'}
                              </span>
                            </button>

                            {/* Facebook Boost Post */}
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                handleBoostPost(rankKeyFor(reel.id));
                              }}
                              className={`w-11 h-11 rounded-full bg-black/50 backdrop-blur-md flex flex-col items-center justify-center border transition-all text-white hover:scale-105 active:scale-95 cursor-pointer shadow-lg ${
                                rankBoosted.includes(rankKeyFor(reel.id))
                                  ? 'border-purple-500/70 bg-purple-900/60 text-purple-200'
                                  : 'border-white/15 hover:bg-black/80 hover:border-purple-500/50'
                              }`}
                              title="Facebook Boost Post — push this reel higher in the feed (up to 2.5× multiplier)"
                            >
                              <TrendingUp size={18} className={rankBoosted.includes(rankKeyFor(reel.id)) ? 'text-purple-300' : 'text-white'} />
                              <span className={`text-[7px] font-mono font-bold mt-0.5 ${rankBoosted.includes(rankKeyFor(reel.id)) ? 'text-purple-200' : 'text-neutral-200'}`}>
                                {rankBoosted.includes(rankKeyFor(reel.id)) ? 'Boosted ⚡' : 'Boost'}
                              </span>
                            </button>

                            {/* Facebook-style Interested / Not Interested rank feedback */}
                            <div className="flex flex-col gap-2">
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleRankFeedback(rankKeyFor(reel.id), 'interested', reel.title || reel.caption);
                                }}
                                className={`w-11 h-11 rounded-full bg-black/50 backdrop-blur-md flex flex-col items-center justify-center border transition-all text-white hover:scale-105 active:scale-95 cursor-pointer shadow-lg ${
                                  rankFeedback[rankKeyFor(reel.id)] === 'interested'
                                    ? 'border-emerald-500/70 bg-emerald-900/60 text-emerald-300'
                                    : 'border-white/15 hover:bg-black/80 hover:border-emerald-500/50'
                                }`}
                                title="Interested — teach the algorithm to show more reels like this"
                              >
                                <ThumbsUp size={17} className={rankFeedback[rankKeyFor(reel.id)] === 'interested' ? 'fill-emerald-400 text-emerald-400' : 'text-white'} />
                              </button>
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleRankFeedback(rankKeyFor(reel.id), 'not_interested', reel.title || reel.caption);
                                }}
                                className={`w-11 h-11 rounded-full bg-black/50 backdrop-blur-md flex flex-col items-center justify-center border transition-all text-white hover:scale-105 active:scale-95 cursor-pointer shadow-lg ${
                                  rankFeedback[rankKeyFor(reel.id)] === 'not_interested'
                                    ? 'border-rose-500/70 bg-rose-900/60 text-rose-300'
                                    : 'border-white/15 hover:bg-black/80 hover:border-rose-500/50'
                                }`}
                                title="Not Interested — teach the algorithm to show fewer reels like this"
                              >
                                <ThumbsDown size={17} className={rankFeedback[rankKeyFor(reel.id)] === 'not_interested' ? 'fill-rose-400 text-rose-400' : 'text-white'} />
                              </button>
                            </div>

                            {/* Spinning Audio Sound Disk */}
                            <div className="w-11 h-11 rounded-full bg-neutral-900 border border-amber-500/60 flex items-center justify-center animate-spin-slow shadow-xl shrink-0 mt-1">
                              <div className="w-4 h-4 rounded-full bg-gradient-to-tr from-amber-600 to-amber-300 flex items-center justify-center">
                                <div className="w-1.5 h-1.5 rounded-full bg-black" />
                              </div>
                            </div>
                          </div>

                        </div>

                        {/* Bottom Information overlay panel */}
                        <div className="bg-gradient-to-t from-black via-black/95 to-transparent p-4 space-y-2.5 z-30 pointer-events-auto text-left">
                          
                          {/* Creator Row with (+) Follow Button */}
                          <div className="flex items-center gap-2.5">
                            <div className="w-9 h-9 rounded-full bg-amber-900 border border-amber-500/40 flex items-center justify-center text-[11px] font-mono font-bold text-white overflow-hidden shrink-0 shadow-md">
                              {reel.avatarUrl ? (
                                <img src={reel.avatarUrl || null} alt={reel.creatorName} className="w-full h-full object-cover" />
                              ) : (
                                reel.creatorName.split(' ').map((n: string) => n.charAt(0)).join('').toUpperCase().slice(0, 2)
                              )}
                            </div>
                            
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="font-sans font-extrabold text-xs text-white truncate drop-shadow-sm">
                                  {reel.creatorName}
                                </p>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const isFollowing = followingIds.includes(reel.creatorId);
                                    if (isFollowing) {
                                      setFollowingIds(prev => prev.filter(id => id !== reel.creatorId));
                                      showToast(`Unfollowed @${reel.creatorName.split(' ')[0].toLowerCase()}`);
                                    } else {
                                      setFollowingIds(prev => [...prev, reel.creatorId]);
                                      showToast(`Followed @${reel.creatorName.split(' ')[0].toLowerCase()}`);
                                    }
                                  }}
                                  className={`px-2.5 py-0.5 rounded-full text-[9px] font-mono font-bold transition-all shadow-xs shrink-0 ${
                                    followingIds.includes(reel.creatorId)
                                      ? 'bg-neutral-800 text-neutral-300 border border-neutral-700'
                                      : 'bg-rose-600 hover:bg-rose-500 text-white'
                                  }`}
                                >
                                  {followingIds.includes(reel.creatorId) ? '✓ Following' : '+ Follow'}
                                </button>
                              </div>
                              <p className="font-mono text-[8px] text-amber-300/80">
                                @{reel.creatorName.split(' ')[0].toLowerCase()} • {reel.views} views
                              </p>
                            </div>

                            <button
                              onClick={() => {
                                loadCreatorProfile(reel.creatorId);
                                setActiveImmersiveReelIndex(null);
                              }}
                              className="font-mono text-[8px] uppercase tracking-wider font-bold bg-amber-500/20 hover:bg-amber-500/40 text-amber-300 border border-amber-500/40 px-2.5 py-1.5 rounded-xl transition-all shadow-xs flex items-center gap-1 shrink-0"
                            >
                              <ExternalLink size={10} />
                              <span>Portfolio</span>
                            </button>
                          </div>

                          {/* Title and Caption */}
                          <div className="space-y-1">
                            <h2 className="font-sans font-extrabold text-xs text-white leading-tight">
                              {reel.title}
                            </h2>
                            <p className="text-[10px] text-white/85 font-sans leading-relaxed">
                              {expandedReelCaption[reel.id] ? reel.caption : `${reel.caption.slice(0, 90)}${reel.caption.length > 90 ? '...' : ''}`}
                              {reel.caption.length > 90 && (
                                <button
                                  onClick={() => setExpandedReelCaption(prev => ({ ...prev, [reel.id]: !prev[reel.id] }))}
                                  className="ml-1 text-amber-400 font-mono text-[9px] uppercase font-bold hover:underline"
                                >
                                  {expandedReelCaption[reel.id] ? 'See Less' : 'See More'}
                                </button>
                              )}
                            </p>
                          </div>

                          {/* Audio Track bar */}
                          <div className="flex items-center gap-2 pt-1 border-t border-white/10 text-white/75">
                            <Music size={11} className="text-amber-400 animate-pulse shrink-0" />
                            <span className="font-mono text-[9px] truncate">
                              Original Audio - {reel.creatorName}
                            </span>
                          </div>

                        </div>

                      </div>
                    </motion.div>
                  );
                })()}
              </AnimatePresence>
      {/* =======================================================
          IMMERSIVE MEDIA DIVER (SWIPABLE/SCROLLABLE FULLSCREEN REELS FOR VIDEOS & AUDIOS)
          ======================================================= */}
      <AnimatePresence>
        {activeImmersiveMediaIndex !== null && (() => {
          const slides = getImmersiveMediaSlides();
          const slide = slides[activeImmersiveMediaIndex];
          if (!slide) return null;

          return (
            <div 
              className="fixed inset-0 z-50 flex flex-col justify-between p-4 md:p-8 bg-[#0a0805]/98 backdrop-blur-xl select-none text-white"
              onTouchStart={(e) => {
                setTouchStartY(e.targetTouches[0].clientY);
                setTouchEndY(null);
              }}
              onTouchMove={(e) => {
                setTouchEndY(e.targetTouches[0].clientY);
              }}
              onTouchEnd={() => {
                if (touchStartY === null || touchEndY === null) return;
                const distance = touchStartY - touchEndY;
                const minSwipeDistance = 40;
                if (distance > minSwipeDistance) {
                  setActiveImmersiveMediaIndex(prev => {
                    if (prev === null) return null;
                    return prev < slides.length - 1 ? prev + 1 : 0;
                  });
                } else if (distance < -minSwipeDistance) {
                  setActiveImmersiveMediaIndex(prev => {
                    if (prev === null) return null;
                    return prev > 0 ? prev - 1 : slides.length - 1;
                  });
                }
                setTouchStartY(null);
                setTouchEndY(null);
              }}
              onWheel={(e) => {
                if (Math.abs(e.deltaY) < 30) return;
                const now = Date.now();
                if ((window as any)._lastMediaWheel && now - (window as any)._lastMediaWheel < 600) {
                  return;
                }
                (window as any)._lastMediaWheel = now;
                if (e.deltaY > 0) {
                  setActiveImmersiveMediaIndex(prev => {
                    if (prev === null) return null;
                    return prev < slides.length - 1 ? prev + 1 : 0;
                  });
                } else {
                  setActiveImmersiveMediaIndex(prev => {
                    if (prev === null) return null;
                    return prev > 0 ? prev - 1 : slides.length - 1;
                  });
                }
              }}
            >
              {/* Top Header Row */}
              <div className="flex items-center justify-between z-10">
                <div className="flex flex-col">
                  <span className="font-mono text-[8px] tracking-widest text-amber-500 uppercase font-bold">Immersive Node Player</span>
                  <h2 className="font-sans font-black text-sm tracking-tight text-[#f4f1ea]">MEDIA DIVE</h2>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-[10px] bg-amber-900/20 border border-amber-900/30 text-amber-300 px-3 py-1 rounded-full">
                    Slide {activeImmersiveMediaIndex + 1} of {slides.length}
                  </span>
                  <button
                    onClick={() => setActiveImmersiveMediaIndex(null)}
                    className="bg-white/10 hover:bg-white/20 text-white p-2 rounded-2xl transition-all cursor-pointer"
                    title="Close Player"
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>

              {/* Central Slides Area */}
              <div className="flex-1 flex items-center justify-center py-6">
                {slide.type === 'video' ? (
                  <div className="flex flex-col items-center justify-center max-w-4xl w-full">
                    <div className="relative max-w-full max-h-[65vh] rounded-3xl overflow-hidden border-2 border-white/15 bg-black/60 shadow-2xl">
                      <video
                        key={slide.posts[0].videoUrl}
                        src={slide.posts[0].videoUrl || null}
                        controls
                        autoPlay
                        className="max-h-[60vh] w-auto max-w-[90vw] md:max-w-[70vw] object-contain mx-auto"
                      />
                    </div>
                    <div className="mt-4 text-center max-w-xl px-4">
                      <h3 className="font-sans font-black text-white text-base leading-tight">{slide.posts[0].title}</h3>
                      <p className="font-mono text-[9px] text-[#ebdcca]/70 mt-1 uppercase tracking-wider">
                        By {slide.posts[0].creatorName || slide.posts[0].creatorHandle || 'Creator'}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center max-w-3xl w-full px-4">
                    <div className="text-center mb-6">
                      <span className="font-mono text-[9px] uppercase tracking-widest text-amber-400 font-bold block mb-1">Interactive Deck</span>
                      <h3 className="font-sans font-black text-[#f4f1ea] text-xl">Immersive Audio Wave</h3>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full">
                      {slide.posts.map((post, i) => (
                        <div 
                          key={post.id} 
                          className="bg-[#15120d] border border-white/10 hover:border-amber-700/50 rounded-2xl p-5 flex flex-col justify-between space-y-4 hover:bg-[#1a1610] transition-all shadow-xl relative group/card"
                        >
                          <div className="space-y-1.5">
                            <span className="font-mono text-[8px] text-amber-500 uppercase font-extrabold tracking-widest">Track 0{i + 1}</span>
                            <h5 className="font-sans font-bold text-xs text-[#fcfaf4] line-clamp-2 leading-snug">{post.title}</h5>
                            <p className="font-mono text-[8px] text-[#ebdcca]/60 uppercase tracking-wider">
                              By {post.creatorName || post.creatorHandle || 'Creator'}
                            </p>
                          </div>
                          <div className="pt-2">
                            <VoiceNotePlayback audioUrl={post.audioUrl} postId={post.id} theme="dark" />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>


            </div>
          );
        })()}
      </AnimatePresence>

      {/* =======================================================
          ARCHIVED CHATS POPUP MODAL (ACCESSED FROM SETTINGS)
          ======================================================= */}
      <AnimatePresence>
        {isArchivedChatsPopupOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#2e2920]/75 backdrop-blur-xs">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[#fcfaf4] border border-[#ebdcca] rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-5"
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b border-[#ebdcca] pb-3">
                <div className="flex items-center gap-2">
                  <Archive className="text-amber-800" size={18} />
                  <h3 className="font-display font-bold text-base text-[#3a342a] tracking-tight">
                    Archived Folder & Chats
                  </h3>
                </div>
                <button
                  onClick={() => setIsArchivedChatsPopupOpen(false)}
                  className="text-[#8a8172] hover:text-[#3a342a] p-1.5 rounded-lg hover:bg-[#ebdcca]/20 transition-colors"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Content */}
              <div className="space-y-3">
                <p className="text-[11px] text-[#8a8172] font-mono leading-relaxed">
                  The chats below are archived. Restoring a chat will return it instantly to your active secure chat inbox tab.
                </p>

                {loadingArchived ? (
                  <div className="text-center py-8">
                    <p className="text-xs text-[#8a8172] italic animate-pulse">Loading archived discussions...</p>
                  </div>
                ) : archivedChats.length === 0 ? (
                  <div className="text-center py-10 bg-[#fdfbf7] border border-dashed border-[#ebdcca] rounded-2xl">
                    <Archive className="text-[#ebdcca]/50 mx-auto mb-2" size={24} />
                    <p className="text-xs text-[#8a8172] italic">No archived conversations found.</p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                    {archivedChats.map((chat) => (
                      <div 
                        key={chat.id} 
                        className="flex items-center justify-between p-3 rounded-2xl bg-[#fdfbf7] border border-[#ebdcca] hover:border-[#cfcac0] transition-colors shadow-xs"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center font-bold text-[#3a342a] text-xs shrink-0">
                            {chat.name ? chat.name.charAt(0) : 'C'}
                          </div>
                          <div className="truncate min-w-0">
                            <span className="font-bold text-[#3a342a] text-xs block truncate">
                              {chat.name}
                            </span>
                            <span className="text-[9px] text-[#8a8172] block">
                              Chat ID: {chat.id.substring(0, 8)}...
                            </span>
                          </div>
                        </div>
                        <button
                          onClick={() => handleUnarchiveChat(chat.id)}
                          className="font-mono text-[9px] uppercase font-bold py-1.5 px-3 rounded-xl border border-[#ebdcca] hover:bg-amber-800 hover:text-white transition-all text-amber-800 bg-white shadow-3xs shrink-0"
                        >
                          Restore
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="flex justify-end pt-2 border-t border-[#ebdcca]/40">
                <button
                  onClick={() => setIsArchivedChatsPopupOpen(false)}
                  className="font-mono text-[10px] uppercase font-bold py-1.5 px-4 rounded-xl bg-[#3a342a] text-white hover:bg-black transition-colors"
                >
                  Close Folder
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* STAR REACTIONS LIST MODAL */}
      <AnimatePresence>
        {likedUsersPost && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setLikedUsersPost(null)}
              className="absolute inset-0 bg-black/60 backdrop-blur-xs"
            />
            
            {/* Content Container */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="relative max-w-sm w-full bg-[#fdfbf7] border border-[#ebdcca] rounded-3xl shadow-2xl z-10 flex flex-col max-h-[60vh] overflow-hidden font-sans"
            >
              {/* Header */}
              <div className="px-5 py-4 border-b border-[#ebdcca]/40 flex items-center justify-between bg-white shrink-0">
                <div className="flex items-center gap-2">
                  <Star className="text-amber-500 fill-amber-400" size={16} />
                  <h3 className="font-display font-bold text-sm text-[#3a342a] tracking-tight">
                    Starred By
                  </h3>
                  <span className="text-[10px] font-mono bg-amber-50 text-amber-800 border border-amber-200 px-1.5 py-0.5 rounded-md font-bold">
                    {likedUsersPost.likes || 0}
                  </span>
                </div>
                <button
                  onClick={() => setLikedUsersPost(null)}
                  className="text-[#8a8172] hover:text-[#3a342a] p-1.5 rounded-lg hover:bg-[#ebdcca]/20 transition-colors cursor-pointer"
                >
                  <X size={15} />
                </button>
              </div>

              {/* Users list */}
              <div className="flex-1 overflow-y-auto p-4 space-y-2">
                {!likedUsersPost.likedByUsers || likedUsersPost.likedByUsers.length === 0 ? (
                  <div className="text-center py-10 bg-white border border-dashed border-[#ebdcca]/60 rounded-2xl">
                    <Star className="text-[#ebdcca]/40 mx-auto mb-2" size={24} />
                    <p className="text-xs text-[#8a8172] italic">No stars registered yet.</p>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {likedUsersPost.likedByUsers.map((u: any) => {
                      const initials = u.name ? u.name.split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase() : '?';
                      return (
                        <div
                          key={u.id}
                          onClick={() => {
                            loadCreatorProfile(u.id);
                            setActiveView('workspace');
                            setLikedUsersPost(null);
                          }}
                          className="flex items-center justify-between p-2.5 rounded-2xl bg-white border border-[#ebdcca]/40 hover:border-[#cfcac0] hover:bg-[#fcfaf4] transition-all shadow-3xs cursor-pointer group"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            {u.avatarUrl ? (
                              <img
                                src={u.avatarUrl || null}
                                alt={u.name}
                                className="w-8 h-8 rounded-full object-cover border border-[#ebdcca]/40 shrink-0"
                                referrerPolicy="no-referrer"
                              />
                            ) : (
                              <div className="w-8 h-8 rounded-full bg-[#f4f1ea] border border-[#ebdcca] flex items-center justify-center font-bold text-[#3a342a] text-xs shrink-0">
                                {initials}
                              </div>
                            )}
                            <div className="truncate">
                              <span className="font-bold text-[#3a342a] text-xs block group-hover:text-amber-800 transition-colors">
                                {u.name}
                              </span>
                              <span className="text-[9px] text-amber-800 font-bold block">
                                {formatCreditCardStyle(u.badgeNumber || 'BD-00-000-00')}
                              </span>
                            </div>
                          </div>
                          
                          <span className="text-[9px] font-mono text-[#8a8172] opacity-0 group-hover:opacity-100 transition-opacity">
                            View Profile →
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="px-5 py-3 border-t border-[#ebdcca]/40 bg-[#fdfbf7] flex justify-end shrink-0">
                <button
                  onClick={() => setLikedUsersPost(null)}
                  className="font-mono text-[9px] uppercase font-bold py-2 px-4 rounded-xl bg-[#3a342a] text-white hover:bg-black transition-colors cursor-pointer"
                >
                  Close List
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* DELETE CONFIRMATION DIALOG MODAL */}
      <AnimatePresence>
        {postToDeleteId && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setPostToDeleteId(null)}
              className="absolute inset-0 bg-black/60 backdrop-blur-xs"
            />
            
            {/* Content Container */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="relative max-w-sm w-full bg-[#fdfbf7] border border-[#ebdcca] rounded-3xl p-6 shadow-2xl z-10 text-center space-y-4 font-sans"
            >
              <div className="mx-auto w-12 h-12 bg-rose-50 border border-rose-200 rounded-full flex items-center justify-center text-rose-600">
                <Trash2 size={22} className="animate-pulse" />
              </div>
              <div className="space-y-1.5">
                <h3 className="text-sm font-bold text-[#3a342a]">Permanently delete post?</h3>
                <p className="text-xs text-[#8a8172] leading-relaxed">
                  Are you sure you want to delete this post? This action is permanent and cannot be undone.
                </p>
              </div>
              <div className="flex gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setPostToDeleteId(null)}
                  className="flex-1 font-mono text-[10px] uppercase font-bold text-[#8a8172] bg-white hover:bg-[#ebdcca]/20 border border-[#cfcac0] py-2.5 rounded-xl transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDeleteFeedPost}
                  className="flex-1 font-mono text-[10px] uppercase font-bold text-white bg-rose-600 hover:bg-rose-700 py-2.5 rounded-xl shadow-xs transition-all cursor-pointer"
                >
                  Delete
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* REPOST & REPORT SEPARATE MODALS */}
      <AnimatePresence>
        {/* 1. CLEAN REPOST MODAL */}
        {repostModalPost && (
          <div className="fixed inset-0 z-[115] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setRepostModalPost(null)}
              className="absolute inset-0 bg-black/60 backdrop-blur-xs"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="relative max-w-md w-full bg-[#fdfbf7] border border-[#ebdcca] rounded-3xl p-5 shadow-2xl z-10 text-left space-y-4 font-sans"
            >
              <div className="flex items-center justify-between border-b border-[#ebdcca]/50 pb-3">
                <div className="flex items-center gap-2 text-amber-900 font-bold text-sm">
                  <Repeat size={16} className="text-amber-700" />
                  <span>Repost to My Stream</span>
                </div>
                <button
                  onClick={() => setRepostModalPost(null)}
                  className="text-stone-400 hover:text-stone-700 p-1 rounded-full hover:bg-stone-100 transition-colors cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Original Post Preview */}
              <div className="bg-white border border-[#ebdcca]/60 p-3 rounded-2xl text-xs space-y-1">
                <span className="font-mono text-[9px] text-[#8a8172] font-bold uppercase block">
                  Original Publication by {repostModalPost.creator?.name || repostModalPost.repostedFrom?.name || 'Community Member'}
                </span>
                <p className="font-bold text-[#3a342a] line-clamp-3">
                  {repostModalPost.title ? `${repostModalPost.title} — ${repostModalPost.content}` : repostModalPost.content}
                </p>
              </div>

              {/* Quote / Thoughts optional input */}
              <div className="space-y-1">
                <label className="font-mono text-[9px] text-[#8a8172] uppercase font-bold tracking-wider block">
                  Add Your Thoughts (Optional)
                </label>
                <textarea
                  value={repostQuoteComment}
                  onChange={(e) => setRepostQuoteComment(e.target.value)}
                  placeholder="What do you think about this publication?..."
                  rows={2}
                  className="w-full bg-white border border-[#ebdcca] rounded-xl px-3 py-2 text-xs text-[#3a342a] focus:outline-none focus:border-amber-800 font-sans resize-none"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setRepostModalPost(null)}
                  className="w-1/3 py-2.5 rounded-xl border border-[#ebdcca] text-[#8a8172] hover:bg-stone-50 font-mono text-[10px] uppercase font-bold transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const postToRepost = repostModalPost;
                    const commentToPass = repostQuoteComment;
                    setRepostModalPost(null);
                    await executeActualRepost(postToRepost, commentToPass);
                  }}
                  className="w-2/3 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-amber-900 text-white hover:bg-amber-950 transition-all cursor-pointer font-bold text-xs shadow-xs"
                >
                  <Repeat size={14} />
                  <span>✨ Confirm Repost</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {/* 2. DEDICATED REPORT & MODERATION MODAL */}
        {reportModalPost && (
          <div className="fixed inset-0 z-[115] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setReportModalPost(null)}
              className="absolute inset-0 bg-black/60 backdrop-blur-xs"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="relative max-w-md w-full bg-[#fdfbf7] border border-[#ebdcca] rounded-3xl p-5 shadow-2xl z-10 text-left space-y-4 font-sans"
            >
              <div className="flex items-center justify-between border-b border-[#ebdcca]/50 pb-3">
                <div className="flex items-center gap-2 text-rose-900 font-bold text-sm">
                  <AlertCircle size={16} className="text-rose-600" />
                  <span>Report Post & Moderation</span>
                </div>
                <button
                  onClick={() => setReportModalPost(null)}
                  className="text-stone-400 hover:text-stone-700 p-1 rounded-full hover:bg-stone-100 transition-colors cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Post Preview */}
              <div className="bg-white border border-[#ebdcca]/60 p-3 rounded-2xl text-xs space-y-1">
                <span className="font-mono text-[9px] text-[#8a8172] font-bold uppercase block">
                  Reporting Publication by {reportModalPost.creator?.name || 'Community Member'}
                </span>
                <p className="font-bold text-[#3a342a] line-clamp-2">
                  {reportModalPost.title || reportModalPost.content}
                </p>
              </div>

              <div className="space-y-2">
                <span className="font-mono text-[9px] uppercase font-bold text-[#8a8172] tracking-wider block">
                  Select Reason for Reporting
                </span>

                <div className="grid grid-cols-1 gap-1.5">
                  {[
                    { id: 'hide', label: "I don't want to see this", icon: '🙈', action: 'hide' },
                    { id: 'adult', label: 'Adult / NSFW content', icon: '🔞', action: 'report' },
                    { id: 'partially_adult', label: 'Partially Adult Content', icon: '⚠️', action: 'report' },
                    { id: 'violent', label: 'Violent, hateful or disturbing', icon: '☣️', action: 'report' },
                    { id: 'fake', label: 'Fake information or scam', icon: '❌', action: 'report' },
                    { id: 'spam', label: 'Harassment or Spam', icon: '💬', action: 'report' },
                  ].map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={async () => {
                        const post = reportModalPost;
                        setReportModalPost(null);
                        if (option.action === 'hide') {
                          setHiddenPostIds(prev => [...prev, post.id]);
                          showToast("🙈 Post hidden from your stream!");
                        } else {
                          try {
                            await fetch(`/api/posts/${post.id}/report`, {
                              method: 'POST',
                              headers: { 
                                'Authorization': `Bearer ${token}`,
                                'Content-Type': 'application/json'
                              },
                              body: JSON.stringify({ category: option.id, label: option.label })
                            });
                          } catch (e) {
                            console.warn(e);
                          }
                          setHiddenPostIds(prev => [...prev, post.id]);
                          showToast(`⚠️ Report submitted for "${option.label}". Post hidden.`);
                        }
                      }}
                      className="w-full text-left p-2.5 rounded-xl bg-white border border-[#ebdcca]/50 hover:bg-rose-50/50 hover:border-rose-300 text-xs text-[#3a342a] font-medium flex items-center justify-between transition-all cursor-pointer"
                    >
                      <span className="flex items-center gap-2">
                        <span>{option.icon}</span>
                        <span>{option.label}</span>
                      </span>
                      <span className="font-mono text-[9px] text-[#8a8172] uppercase font-bold">Submit</span>
                    </button>
                  ))}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {isAdminOpen && <AdminPanel token={token} onClose={() => setIsAdminOpen(false)} />}

      {/* ── Editor engines (lazy — loaded only when opened) ── */}
      <React.Suspense fallback={null}>
        {/* Photo editor — feed composer + re-edit attached image */}
        {photoEditFile && (
          <PhotoEditorModal
            src={photoEditFile}
            open={!!photoEditFile}
            onClose={() => setPhotoEditFile(null)}
            onSave={async (blob) => {
              try {
                showToast("🖼️ Uploading edited image...");
                const url = await uploadMediaFile(blob);
                setAttachedImage(url);
                showToast("✅ Edited image attached!");
              } catch (err: any) {
                console.error("Edited image upload error:", err);
                showToast("⚠️ Failed to upload edited image.");
              }
              setPhotoEditFile(null);
            }}
          />
        )}

        {/* Design studio (Fabric 1080×1080) */}
        {showCanvasDesign && (
          <OceanCanvasDesign
            open={showCanvasDesign}
            onClose={() => setShowCanvasDesign(false)}
            onExport={async (blob) => {
              try {
                showToast("🎨 Uploading design...");
                const url = await uploadMediaFile(blob);
                setAttachedImage(url);
                showToast("✅ Design attached!");
              } catch (err: any) {
                console.error("Design upload error:", err);
                showToast("⚠️ Failed to upload design.");
              }
              setShowCanvasDesign(false);
            }}
          />
        )}

        {/* Whiteboard (tldraw) */}
        {showWhiteboard && (
          <OceanWhiteboard
            open={showWhiteboard}
            onClose={() => setShowWhiteboard(false)}
            onExport={async (blob) => {
              try {
                showToast("✏️ Uploading whiteboard...");
                const url = await uploadMediaFile(blob);
                setAttachedImage(url);
                showToast("✅ Whiteboard attached!");
              } catch (err: any) {
                console.error("Whiteboard upload error:", err);
                showToast("⚠️ Failed to upload whiteboard.");
              }
              setShowWhiteboard(false);
            }}
          />
        )}

        {/* Story editor (tldraw 9:16) — posts to /api/stories/create */}
        {showStoryEditor && (
          <StoryEditor
            open={showStoryEditor}
            onClose={() => setShowStoryEditor(false)}
            onExport={async (blob) => {
              try {
                showToast("📱 Uploading story...");
                const url = await uploadMediaFile(blob);
                await postJsonToApi('/api/stories/create', {
                  story: {
                    id: createId('story'),
                    imageUrl: url,
                    caption: '',
                    createdAt: new Date().toISOString(),
                  },
                });
                showToast("✨ Story published!");
              } catch (err: any) {
                console.error("Story publish error:", err);
                showToast("⚠️ Failed to publish story.");
              }
              setShowStoryEditor(false);
            }}
          />
        )}

        {/* Video cutter (FFmpeg WASM) — posts to /api/reels/upload */}
        {showCutVideo && (
          <OceanCutVideo
            open={showCutVideo}
            onClose={() => setShowCutVideo(false)}
            onExport={async (blob) => {
              try {
                showToast("🎬 Uploading edited video...");
                const url = await uploadMediaFile(blob);
                await postJsonToApi('/api/reels/upload', {
                  videoUrl: url,
                  caption: '',
                });
                showToast("✅ Reel uploaded!");
              } catch (err: any) {
                console.error("Reel upload error:", err);
                showToast("⚠️ Failed to upload reel.");
              }
              setShowCutVideo(false);
            }}
          />
        )}
      </React.Suspense>
    </div>
    </CallEngineProvider>
  );
}
