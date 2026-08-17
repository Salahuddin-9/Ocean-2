import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import QRCode from 'qrcode';
import { 
  X, Send, Paperclip, Check, CheckCheck, Smile, Users, 
  User, Search, Plus, ArrowLeft, Image as ImageIcon, FileText, Circle, Mic,
  Video, Trash2, Edit2, Reply, Archive, FolderOpen, Shield, ShieldAlert, CheckSquare, MessageSquare,
  Phone, PhoneOff, MoreVertical, MicOff, Camera, Globe, RotateCw, FlipHorizontal, FlipVertical,
  Sliders, Eye, Volume2, Sparkles, Wand2, Play, Pause, ZoomIn, RefreshCw,
  Pin, VolumeX, BarChart2, Share2, QrCode, Flag, AlertCircle, Copy, Radio, Hash, Sticker, Info,
  Bookmark, BookmarkCheck, CalendarClock, MonitorPlay, UserX
} from 'lucide-react';
import { StartCallButton } from './call/StreamCallLayer';
import LinkPreviewCard, { extractUrls } from './LinkPreviewCard';
import SavedMessagesPanel from './SavedMessagesPanel';
import WatchTogetherModal from './WatchTogetherModal';
import { JitsiMeeting } from './call/JitsiMeeting';
import { Post, Comment } from '../types';

// Image Processing Utility
export interface ImageEditOptions {
  filter: 'none' | 'grayscale' | 'sepia' | 'warm' | 'cool' | 'contrast' | 'vintage' | 'vivid';
  rotation: number;
  flipH: boolean;
  flipV: boolean;
  brightness: number;
  contrast: number;
  saturate: number;
}

export async function applyImageEdits(dataUrl: string, options: ImageEditOptions): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return resolve(dataUrl);

      const isRotated90or270 = options.rotation % 180 !== 0;
      canvas.width = isRotated90or270 ? img.height : img.width;
      canvas.height = isRotated90or270 ? img.width : img.height;

      let filterStr = `brightness(${options.brightness}%) contrast(${options.contrast}%) saturate(${options.saturate}%) `;
      if (options.filter === 'grayscale') filterStr += 'grayscale(100%) ';
      else if (options.filter === 'sepia') filterStr += 'sepia(100%) ';
      else if (options.filter === 'warm') filterStr += 'saturate(140%) hue-rotate(15deg) ';
      else if (options.filter === 'cool') filterStr += 'saturate(110%) hue-rotate(180deg) ';
      else if (options.filter === 'contrast') filterStr += 'contrast(170%) ';
      else if (options.filter === 'vintage') filterStr += 'sepia(50%) contrast(120%) brightness(90%) ';
      else if (options.filter === 'vivid') filterStr += 'brightness(110%) saturate(160%) ';

      ctx.filter = filterStr.trim();

      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate((options.rotation * Math.PI) / 180);
      ctx.scale(options.flipH ? -1 : 1, options.flipV ? -1 : 1);

      ctx.drawImage(img, -img.width / 2, -img.height / 2);

      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

// Audio Effects & Rendering Utilities
export async function renderAudioWithEffect(
  originalDataUrl: string, 
  effect: 'normal' | 'chipmunk' | 'deep' | 'echo' | 'robot' | 'radio', 
  speed: number,
  volumeBoost: number = 1.0,
  trimStartPercent: number = 0,
  trimEndPercent: number = 100
): Promise<string> {
  if (effect === 'normal' && speed === 1.0 && volumeBoost === 1.0 && trimStartPercent === 0 && trimEndPercent === 100) {
    return originalDataUrl;
  }

  const response = await fetch(originalDataUrl);
  const arrayBuffer = await response.arrayBuffer();
  
  const decodeCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  const fullAudioBuffer = await decodeCtx.decodeAudioData(arrayBuffer);
  await decodeCtx.close();

  const sampleRate = fullAudioBuffer.sampleRate;
  
  // Extract trimmed slice
  const startFrame = Math.floor((trimStartPercent / 100) * fullAudioBuffer.length);
  const endFrame = Math.min(fullAudioBuffer.length, Math.floor((trimEndPercent / 100) * fullAudioBuffer.length));
  const trimmedLength = Math.max(1, endFrame - startFrame);

  const decodeCtx2 = new (window.AudioContext || (window as any).webkitAudioContext)();
  const audioBuffer = decodeCtx2.createBuffer(fullAudioBuffer.numberOfChannels, trimmedLength, sampleRate);
  for (let ch = 0; ch < fullAudioBuffer.numberOfChannels; ch++) {
    const srcData = fullAudioBuffer.getChannelData(ch);
    const destData = audioBuffer.getChannelData(ch);
    for (let i = 0; i < trimmedLength; i++) {
      destData[i] = srcData[startFrame + i];
    }
  }
  await decodeCtx2.close();

  let speedFactor = speed;
  if (effect === 'chipmunk') speedFactor *= 1.35;
  if (effect === 'deep') speedFactor *= 0.72;

  const renderLength = Math.ceil(audioBuffer.length / speedFactor);

  const offlineCtx = new OfflineAudioContext(
    audioBuffer.numberOfChannels,
    renderLength,
    sampleRate
  );

  const source = offlineCtx.createBufferSource();
  source.buffer = audioBuffer;
  source.playbackRate.value = speedFactor;

  const gainNode = offlineCtx.createGain();
  gainNode.gain.value = volumeBoost;

  if (effect === 'echo') {
    const delay = offlineCtx.createDelay(1.0);
    delay.delayTime.value = 0.3;

    const feedback = offlineCtx.createGain();
    feedback.gain.value = 0.35;

    const wetGain = offlineCtx.createGain();
    wetGain.gain.value = 0.35;

    const dryGain = offlineCtx.createGain();
    dryGain.gain.value = 1.0;

    source.connect(dryGain);
    dryGain.connect(gainNode);

    source.connect(delay);
    delay.connect(feedback);
    feedback.connect(delay);

    delay.connect(wetGain);
    wetGain.connect(gainNode);
    gainNode.connect(offlineCtx.destination);
  } else if (effect === 'radio') {
    const hp = offlineCtx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 500;

    const lp = offlineCtx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 3000;

    source.connect(hp);
    hp.connect(lp);
    lp.connect(gainNode);
    gainNode.connect(offlineCtx.destination);
  } else if (effect === 'robot') {
    const osc = offlineCtx.createOscillator();
    osc.frequency.value = 60;
    osc.type = 'sawtooth';
    const carrierGain = offlineCtx.createGain();
    carrierGain.gain.value = 0.8;

    source.connect(carrierGain);
    carrierGain.connect(gainNode);
    gainNode.connect(offlineCtx.destination);
    osc.start(0);
  } else {
    source.connect(gainNode);
    gainNode.connect(offlineCtx.destination);
  }

  source.start(0);
  const renderedBuffer = await offlineCtx.startRendering();
  const wavBlob = audioBufferToWav(renderedBuffer);
  
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.readAsDataURL(wavBlob);
  });
}

function audioBufferToWav(buffer: AudioBuffer): Blob {
  const numOfChan = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1; // PCM
  const bitDepth = 16;
  
  let result;
  if (numOfChan === 2) {
    result = interleave(buffer.getChannelData(0), buffer.getChannelData(1));
  } else {
    result = buffer.getChannelData(0);
  }
  
  const bufferLen = result.length * 2;
  const wavBuffer = new ArrayBuffer(44 + bufferLen);
  const view = new DataView(wavBuffer);
  
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + bufferLen, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, format, true);
  view.setUint16(22, numOfChan, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numOfChan * (bitDepth / 8), true);
  view.setUint16(32, numOfChan * (bitDepth / 8), true);
  view.setUint16(34, bitDepth, true);
  writeString(view, 36, 'data');
  view.setUint32(40, bufferLen, true);
  
  floatTo16BitPCM(view, 44, result);
  
  return new Blob([wavBuffer], { type: 'audio/wav' });
}

function interleave(inputL: Float32Array, inputR: Float32Array): Float32Array {
  const length = inputL.length + inputR.length;
  const result = new Float32Array(length);
  let index = 0;
  let inputIndex = 0;
  
  while (index < length) {
    result[index++] = inputL[inputIndex];
    result[index++] = inputR[inputIndex];
    inputIndex++;
  }
  return result;
}

export function RenderRichChatMessage({ text, isMe }: { text: string; isMe: boolean }) {
  if (!text) return null;

  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = text.split(urlRegex);

  const postMatch = text.match(/(?:https?:\/\/[^\s]+\/#post-|#post-)([a-zA-Z0-9_-]+)/);
  const postId = postMatch ? postMatch[1] : null;

  return (
    <div className="space-y-2">
      <p className="text-xs leading-relaxed font-sans break-words whitespace-pre-wrap">
        {parts.map((part, idx) => {
          if (part.match(urlRegex)) {
            return (
              <a
                key={idx}
                href={part}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => {
                  if (part.includes('#post-')) {
                    e.preventDefault();
                    const pId = part.split('#post-')[1];
                    if (pId) {
                      window.location.hash = `post-${pId}`;
                      window.dispatchEvent(new CustomEvent('open-post-detail', { detail: pId }));
                    }
                  }
                }}
                className={`underline font-medium hover:opacity-80 transition-opacity break-all ${
                  isMe ? 'text-amber-200 font-bold' : 'text-amber-800 font-bold'
                }`}
              >
                {part}
              </a>
            );
          }
          return <span key={idx}>{part}</span>;
        })}
      </p>

      {postId && (
        <div
          onClick={() => {
            window.location.hash = `post-${postId}`;
            window.dispatchEvent(new CustomEvent('open-post-detail', { detail: postId }));
          }}
          className={`p-2.5 rounded-xl border text-left cursor-pointer transition-all hover:scale-[1.01] active:scale-95 space-y-1.5 ${
            isMe
              ? 'bg-amber-950/40 border-amber-500/40 text-[#ebdcca]'
              : 'bg-stone-50 border-[#ebdcca] text-[#3a342a]'
          }`}
        >
          <div className="flex items-center justify-between text-[9px] font-mono font-bold uppercase opacity-80">
            <span>📌 Shared Publication</span>
            <span className="underline">View Full Post →</span>
          </div>
          <p className="text-xs font-bold line-clamp-2">Publication #{postId}</p>
        </div>
      )}
    </div>
  );
}

function floatTo16BitPCM(output: DataView, offset: number, input: Float32Array) {
  for (let i = 0; i < input.length; i++, offset += 2) {
    let s = Math.max(-1, Math.min(1, input[i]));
    output.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }
}

function writeString(view: DataView, offset: number, string: string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

interface Creator {
  id: string;
  name: string;
  username?: string;
  tagline: string;
  location: string;
  avatarUrl: string;
  badgeNumber: string;
  skills: string[];
  isPublicMessagingEnabled?: boolean;
}

interface ChatMessage {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  senderAvatar?: string;
  text: string;
  mediaUrl: string | null;
  mediaName: string | null;
  timestamp: number;
  status: 'sent' | 'delivered' | 'read';
  readBy: string[];
  deleted?: boolean;
  deletedForMe?: string[];
  edited?: boolean;
  replyToMessageId?: string | null;
  reactions?: Record<string, string[]>;
  viewsCount?: number;
  poll?: {
    question: string;
    options: Array<{ id: string; text: string; votes: string[] }>;
    isAnonymous?: boolean;
    isMultipleChoice?: boolean;
  } | null;
  forwardedFrom?: {
    senderName: string;
  } | null;
}

interface Conversation {
  id: string;
  isGroup: boolean;
  isChannel?: boolean;
  isOpenGroup?: boolean;
  isPrivate?: boolean;
  joinCode?: string;
  name: string | null;
  description?: string;
  avatarUrl: string | null;
  creatorId?: string;
  adminIds?: string[];
  participants: string[];
  createdTime: number;
  lastMessage: ChatMessage | null;
  unreadCount: number;
  isArchived?: boolean;
  isMuted?: boolean;
  isBlocked?: boolean;
  pinnedMessageId?: string | null;
  slowModeSeconds?: number;
}

export const TELEGRAM_STICKERS = [
  { id: 'stk-1', emoji: '🔥', label: 'Fire', url: 'https://cdn-icons-png.flaticon.com/512/785/785116.png' },
  { id: 'stk-2', emoji: '🎉', label: 'Party', url: 'https://cdn-icons-png.flaticon.com/512/3132/3132738.png' },
  { id: 'stk-3', emoji: '🚀', label: 'Rocket', url: 'https://cdn-icons-png.flaticon.com/512/1356/1356479.png' },
  { id: 'stk-4', emoji: '❤️', label: 'Heart', url: 'https://cdn-icons-png.flaticon.com/512/833/833472.png' },
  { id: 'stk-5', emoji: '😎', label: 'Cool', url: 'https://cdn-icons-png.flaticon.com/512/742/742751.png' },
  { id: 'stk-6', emoji: '💡', label: 'Idea', url: 'https://cdn-icons-png.flaticon.com/512/702/702797.png' },
  { id: 'stk-7', emoji: '👏', label: 'Clap', url: 'https://cdn-icons-png.flaticon.com/512/1256/1256650.png' },
  { id: 'stk-8', emoji: '💎', label: 'Diamond', url: 'https://cdn-icons-png.flaticon.com/512/2909/2909762.png' },
  { id: 'stk-9', emoji: '🤖', label: 'Robot', url: 'https://cdn-icons-png.flaticon.com/512/4712/4712109.png' },
  { id: 'stk-10', emoji: '⭐', label: 'Star', url: 'https://cdn-icons-png.flaticon.com/512/1828/1828884.png' }
];

interface ChatModalProps {
  key?: any;
  onClose?: () => void;
  token: string;
  currentUser: {
    id: string;
    name: string;
    username?: string;
    isLocationVerified?: boolean;
    profile?: {
      avatarUrl?: string;
      username?: string;
    }
  };
  isInline?: boolean;
  friends?: any[];
  initialActiveUserId?: string | null;
  onClearInitialActiveUserId?: () => void;
}

export const TRENDING_GIFS = [
  { name: 'Funny Cat', url: 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExM3Z0ZWF4b3o4OWpxcGttam16NDNpZHlxbmtvdXowajJvMGFzdmRhNiZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/Vff5Q2bZgjezRZ1MTM/giphy.gif' },
  { name: 'Clapping', url: 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExbTZ0ODNoYTR0aWJ3amFiaG4xMXBvdXo0dHFkaWpldDJyMGh2Ymt3OSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/nbvFVArJe648/giphy.gif' },
  { name: 'Mind Blown', url: 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExM3Jwd2Ntb293NHA1bXVub3MxbDRidnh5c2Fna3Vpa3pibGFvdTZieSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/l0Iyf53PycaHTLk9G/giphy.gif' },
  { name: 'Dance Party', url: 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExd2RvdWloY2Fmdnd1eHF2eHoxeW12OHJ5NGRoMGpzaTVhZmsyd3g4YSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/13CoXDiaCcC9Ak/giphy.gif' },
  { name: 'Thumbs Up', url: 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExb2swcDRoYTZ5bXV0cnd4Nmt4OWsydTgwNXB0dzM5OHd1dm9xbzFwYSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/3oz8xAFtqoOUUrEl8c/giphy.gif' },
  { name: 'No Way', url: 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExOXpyNHA1MGN6cmNwbjVnYXRzc2s5d3U4ZndrcTBodWtxczBhMzdveSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/12yR7qyJ6fapQQ/giphy.gif' },
  { name: 'Excited', url: 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExbnp5cHdwMDhtZXoxajN1MXA1aGVwYnVwcmNyNzFmZ2tzNGR0MXN0dyZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/26n6R5HO1II3DfZYI/giphy.gif' },
  { name: 'Cute Dog', url: 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExM3FpNXFqcnA5eXhrMTRpdTZwOXptZHpuMTN4NXR3OHY3OHY3OWs3MG5pMXl6NXZyMyZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/H8mFzy5lX9Cgg/giphy.gif' }
];

export default function ChatModal({ 
  onClose, 
  token, 
  currentUser, 
  isInline = false, 
  friends = [],
  initialActiveUserId,
  onClearInitialActiveUserId
}: ChatModalProps) {
  // Navigation & UI state
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversationsLoaded, setConversationsLoaded] = useState(false);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [creators, setCreators] = useState<Creator[]>([]);
  const [showCreateMenu, setShowCreateMenu] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [msgFilter, setMsgFilter] = useState<'all' | 'direct' | 'groups' | 'unread'>('all');
  const [showInfoPanel, setShowInfoPanel] = useState<boolean>(true);
  const [showJitsiMeeting, setShowJitsiMeeting] = useState(false);
  const [recentCalls, setRecentCalls] = useState<any[]>([]);
  const [infoTab, setInfoTab] = useState<'members' | 'media' | 'files'>('members');
  
  // Calling system states
  const [activeCall, setActiveCall] = useState<{
    type: 'audio' | 'video';
    status: 'dialing' | 'ringing' | 'connected' | 'disconnected';
    recipientId: string;
    recipientName: string;
    recipientAvatar?: string;
    duration: number;
    isMuted: boolean;
    isVideoOff: boolean;
  } | null>(null);

  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const callTimerRef = useRef<any>(null);

  // Chat settings dropdown toggle
  const [showChatSettingsDropdown, setShowChatSettingsDropdown] = useState(false);

  // Handle call timer
  useEffect(() => {
    if (activeCall && activeCall.status === 'connected') {
      callTimerRef.current = setInterval(() => {
        setActiveCall(prev => prev ? { ...prev, duration: prev.duration + 1 } : null);
      }, 1000);
    } else {
      if (callTimerRef.current) {
        clearInterval(callTimerRef.current);
        callTimerRef.current = null;
      }
    }

    return () => {
      if (callTimerRef.current) {
        clearInterval(callTimerRef.current);
      }
    };
  }, [activeCall?.status]);

  // Handle video stream for local camera preview
  useEffect(() => {
    if (activeCall && activeCall.type === 'video' && activeCall.status === 'connected' && !activeCall.isVideoOff) {
      navigator.mediaDevices.getUserMedia({ video: true, audio: false })
        .then(stream => {
          setLocalStream(stream);
          if (localVideoRef.current) {
            localVideoRef.current.srcObject = stream;
          }
        })
        .catch(err => {
          console.warn("Could not start camera for call preview:", err);
        });
    } else {
      if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        setLocalStream(null);
      }
    }

    return () => {
      if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
      }
    };
  }, [activeCall?.status, activeCall?.isVideoOff]);

  // Handle auto-connection after brief dialing / ringing delay
  useEffect(() => {
    if (activeCall && activeCall.status === 'dialing') {
      const ringTimer = setTimeout(() => {
        setActiveCall(prev => prev ? { ...prev, status: 'ringing' } : null);
      }, 1500);

      const connectTimer = setTimeout(() => {
        setActiveCall(prev => prev ? { ...prev, status: 'connected' } : null);
      }, 4000);

      return () => {
        clearTimeout(ringTimer);
        clearTimeout(connectTimer);
      };
    }
  }, [activeCall?.status]);

  // Auto-close chat settings dropdown on conversation change
  useEffect(() => {
    setShowChatSettingsDropdown(false);
  }, [activeConvId]);
  
  // Group & Channel creation form states
  const [isGroupCreate, setIsGroupCreate] = useState(false);
  const [isChannelCreate, setIsChannelCreate] = useState(false);
  const [isOpenGroupCreate, setIsOpenGroupCreate] = useState(false);
  const [isPrivateCreate, setIsPrivateCreate] = useState(false);
  const [groupSlowMode, setGroupSlowMode] = useState<number>(0);
  const [groupName, setGroupName] = useState('');
  const [groupDescription, setGroupDescription] = useState('');
  const [selectedParticipants, setSelectedParticipants] = useState<string[]>([]);

  // Interactive Poll Modal state
  const [showPollModal, setShowPollModal] = useState(false);
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState<string[]>(['Option A', 'Option B']);
  const [pollIsAnonymous, setPollIsAnonymous] = useState(false);
  const [pollIsMultipleChoice, setPollIsMultipleChoice] = useState(false);

  // Group / Channel Settings & Invite Modal state
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showForwardModal, setShowForwardModal] = useState<ChatMessage | null>(null);
  const [showReportModal, setShowReportModal] = useState<{ targetType: 'user' | 'message' | 'conversation', targetId: string } | null>(null);
  // Batch-D feature states (saved messages / watch-together / schedule / join-requests)
  const [showSavedPanel, setShowSavedPanel] = useState(false);
  const [showWatchTogether, setShowWatchTogether] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [scheduleText, setScheduleText] = useState('');
  const [scheduleAt, setScheduleAt] = useState('');
  const [showJoinRequests, setShowJoinRequests] = useState(false);
  const [joinRequests, setJoinRequests] = useState<any[]>([]);
  const [savedMessageIds, setSavedMessageIds] = useState<Set<string>>(new Set());
  const [reportReason, setReportReason] = useState('Spam or Scam');
  const [reportDetails, setReportDetails] = useState('');

  // Drafts & Chat Search state
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [isSearchingInChat, setIsSearchingInChat] = useState(false);
  const [chatSearchQuery, setChatSearchQuery] = useState('');
  const [mediaPickerTab, setMediaPickerTab] = useState<'emoji' | 'stickers' | 'gifs'>('emoji');
  const qrCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Render QR Code for Invite Links
  useEffect(() => {
    if (showInviteModal && qrCanvasRef.current && activeConv) {
      const inviteUrl = `${window.location.origin}/chat/join/${activeConv.joinCode || activeConv.id}`;
      QRCode.toCanvas(qrCanvasRef.current, inviteUrl, { width: 180, margin: 2 }, (err: any) => {
        if (err) console.error(err);
      });
    }
  }, [showInviteModal, activeConvId]);

  // Chat tabs & Open Groups state
  const [activeChatTab, setActiveChatTab] = useState<'chats' | 'open_groups' | 'archived'>('chats');
  const [openGroups, setOpenGroups] = useState<any[]>([]);

  const fetchOpenGroups = async () => {
    try {
      const res = await fetch('/api/chat/open-groups', {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
      if (res.ok) {
        const data = await res.json();
        setOpenGroups(data.openGroups || []);
      }
    } catch (e) {
      console.warn('Failed to fetch open groups:', e);
    }
  };

  useEffect(() => {
    fetchOpenGroups();
  }, [token]);

  const handleJoinOpenGroup = async (group: any) => {
    try {
      const res = await fetch(`/api/chat/conversations/${group.id}/join`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        await fetchConversations();
        await fetchOpenGroups();
        setActiveConvId(group.id);
        setActiveChatTab('chats');
        setViewState('chat');
        window.dispatchEvent(new CustomEvent('show-toast', { detail: { message: `🎉 Joined ${group.name}!` } }));
      }
    } catch (e) {
      console.error('Error joining open group:', e);
    }
  };

  // Input area states
  const [textInput, setTextInput] = useState('');
  const [showGifPicker, setShowGifPicker] = useState(false);
  const [attachedMedia, setAttachedMedia] = useState<string | null>(null);
  const [attachedMediaName, setAttachedMediaName] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Real-time states
  const [presence, setPresence] = useState<Record<string, { status: string; lastSeen: number | null }>>({});
  const [typers, setTypers] = useState<Array<{ id: string; name: string; username: string }>>([]);
  const [isTyping, setIsTyping] = useState(false);

  // Message edit/reply & Sidebar tab states
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);
  const [editingMessage, setEditingMessage] = useState<ChatMessage | null>(null);

  // Voice Recording states & refs
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const autoSendRef = useRef<boolean>(false);

  // Image Editor & Preview states
  const [imageFilter, setImageFilter] = useState<'none' | 'grayscale' | 'sepia' | 'warm' | 'cool' | 'contrast' | 'vintage' | 'vivid'>('none');
  const [imageRotation, setImageRotation] = useState<number>(0);
  const [imageFlipH, setImageFlipH] = useState<boolean>(false);
  const [imageFlipV, setImageFlipV] = useState<boolean>(false);
  const [imageBrightness, setImageBrightness] = useState<number>(100);
  const [imageContrast, setImageContrast] = useState<number>(100);
  const [imageSaturate, setImageSaturate] = useState<number>(100);
  const [isEditingImage, setIsEditingImage] = useState<boolean>(false);
  const [isZoomingImage, setIsZoomingImage] = useState<boolean>(false);

  // Audio Editor options state
  const [audioSpeed, setAudioSpeed] = useState<number>(1.0);
  const [audioEffect, setAudioEffect] = useState<'normal' | 'chipmunk' | 'deep' | 'echo' | 'robot' | 'radio'>('normal');
  const [audioVolumeBoost, setAudioVolumeBoost] = useState<number>(1.0);
  const [audioTrimStart, setAudioTrimStart] = useState<number>(0);
  const [audioTrimEnd, setAudioTrimEnd] = useState<number>(100);
  const [isEditingAudio, setIsEditingAudio] = useState<boolean>(false);
  const [isPlayingPreview, setIsPlayingPreview] = useState(false);
  const activePreviewSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const previewAudioCtxRef = useRef<AudioContext | null>(null);

  const playPreviewWithEffect = async () => {
    if (!attachedMedia) return;
    try {
      if (activePreviewSourceRef.current) {
        try { activePreviewSourceRef.current.stop(); } catch(e){}
      }
      if (!previewAudioCtxRef.current) {
        previewAudioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const ctx = previewAudioCtxRef.current;
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }

      const response = await fetch(attachedMedia);
      const arrayBuffer = await response.arrayBuffer();
      const fullAudioBuffer = await ctx.decodeAudioData(arrayBuffer);

      // Extract trim bounds
      const startFrame = Math.floor((audioTrimStart / 100) * fullAudioBuffer.length);
      const endFrame = Math.min(fullAudioBuffer.length, Math.floor((audioTrimEnd / 100) * fullAudioBuffer.length));
      const trimmedLength = Math.max(1, endFrame - startFrame);

      const audioBuffer = ctx.createBuffer(fullAudioBuffer.numberOfChannels, trimmedLength, fullAudioBuffer.sampleRate);
      for (let ch = 0; ch < fullAudioBuffer.numberOfChannels; ch++) {
        const srcData = fullAudioBuffer.getChannelData(ch);
        const destData = audioBuffer.getChannelData(ch);
        for (let i = 0; i < trimmedLength; i++) {
          destData[i] = srcData[startFrame + i];
        }
      }

      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;

      let speedFactor = audioSpeed;
      if (audioEffect === 'chipmunk') speedFactor *= 1.35;
      if (audioEffect === 'deep') speedFactor *= 0.72;

      source.playbackRate.value = speedFactor;

      const gainNode = ctx.createGain();
      gainNode.gain.value = audioVolumeBoost;

      if (audioEffect === 'echo') {
        const delay = ctx.createDelay(1.0);
        delay.delayTime.value = 0.3;

        const feedback = ctx.createGain();
        feedback.gain.value = 0.35;

        const wetGain = ctx.createGain();
        wetGain.gain.value = 0.35;

        const dryGain = ctx.createGain();
        dryGain.gain.value = 1.0;

        source.connect(dryGain);
        dryGain.connect(gainNode);

        source.connect(delay);
        delay.connect(feedback);
        feedback.connect(delay);

        delay.connect(wetGain);
        wetGain.connect(gainNode);
        gainNode.connect(ctx.destination);
      } else if (audioEffect === 'radio') {
        const hp = ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = 500;

        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 3000;

        source.connect(hp);
        hp.connect(lp);
        lp.connect(gainNode);
        gainNode.connect(ctx.destination);
      } else if (audioEffect === 'robot') {
        const osc = ctx.createOscillator();
        osc.frequency.value = 60;
        osc.type = 'sawtooth';
        const carrierGain = ctx.createGain();
        carrierGain.gain.value = 0.8;

        source.connect(carrierGain);
        carrierGain.connect(gainNode);
        gainNode.connect(ctx.destination);
        osc.start(0);
      } else {
        source.connect(gainNode);
        gainNode.connect(ctx.destination);
      }

      source.onended = () => {
        setIsPlayingPreview(false);
      };

      source.start(0);
      activePreviewSourceRef.current = source;
      setIsPlayingPreview(true);
    } catch (e) {
      console.error("Preview playback failed:", e);
    }
  };

  const stopPreviewPlayback = () => {
    if (activePreviewSourceRef.current) {
      try { activePreviewSourceRef.current.stop(); } catch(e){}
      activePreviewSourceRef.current = null;
    }
    setIsPlayingPreview(false);
  };

  useEffect(() => {
    return () => {
      if (activePreviewSourceRef.current) {
        try { activePreviewSourceRef.current.stop(); } catch(e){}
      }
      if (previewAudioCtxRef.current) {
        try { previewAudioCtxRef.current.close(); } catch(e){}
      }
    };
  }, []);

  const handleSendMessageDirect = async (audioUrl: string) => {
    if (!activeConvId) return;
    try {
      const response = await fetch(`/api/chat/conversations/${activeConvId}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          text: '',
          mediaUrl: audioUrl,
          mediaName: `voice_recording_${Date.now()}.wav`,
          replyToMessageId: null
        })
      });

      if (response.ok) {
        const data = await response.json();
        const sentMsg = data.message;
        if (sentMsg) {
          setMessages(prev => {
            if (prev.some(m => m.id === sentMsg.id)) return prev;
            return [...prev, sentMsg];
          });
          setTimeout(() => scrollToBottom(), 50);
        }
      }
    } catch (e) {
      console.error("Direct send error:", e);
    }
  };

  const startRecording = async (directSend: boolean = false) => {
    try {
      autoSendRef.current = directSend;
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        // Upload through /api/voice/upload (auth + multer, magic-byte validated)
        // so the message stores a real /uploads/... URL — a raw data URL would
        // bloat database.json and break for the recipient's <audio> player.
        let audioUrl: string | null = null;
        try {
          const fd = new FormData();
          fd.append('file', audioBlob, `voice_recording_${Date.now()}.webm`);
          const upRes = await fetch('/api/voice/upload', {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
            body: fd,
          });
          const upData = await upRes.json();
          if (upRes.ok && upData.url) audioUrl = upData.url;
        } catch (e) {
          console.warn('Voice note upload failed:', e);
        }
        if (!audioUrl) {
          // Fallback: keep the local data URL so the recording is never lost.
          const reader = new FileReader();
          reader.onloadend = () => {
            const audioDataUrl = reader.result as string;
            if (autoSendRef.current) void handleSendMessageDirect(audioDataUrl);
            else {
              setAttachedMedia(audioDataUrl);
              setAttachedMediaName(`voice_recording_${Date.now()}.webm`);
              setAudioSpeed(1.0);
              setAudioEffect('normal');
            }
          };
          reader.readAsDataURL(audioBlob);
        } else if (autoSendRef.current) {
          await handleSendMessageDirect(audioUrl);
        } else {
          setAttachedMedia(audioUrl);
          setAttachedMediaName(`voice_recording_${Date.now()}.webm`);
          setAudioSpeed(1.0);
          setAudioEffect('normal');
        }

        // Stop all tracks on the stream to release the mic
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
      setRecordingDuration(0);

      // Start duration timer
      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration(prev => prev + 1);
      }, 1000);
    } catch (err) {
      console.error('Failed to start voice recording:', err);
      alert('Could not access microphone. Please ensure permissions are granted.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    setIsRecording(false);
  };

  const cancelRecording = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.onstop = null;
      if (mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      if (mediaRecorderRef.current.stream) {
        mediaRecorderRef.current.stream.getTracks().forEach(t => t.stop());
      }
    }
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    setIsRecording(false);
    setRecordingDuration(0);
    audioChunksRef.current = [];
  };

  const formatDuration = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const secs = sec % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // References
  const socketRef = useRef<WebSocket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const activeConvIdRef = useRef<string | null>(null);

  // Synchronize active conversation ID with ref
  useEffect(() => {
    activeConvIdRef.current = activeConvId;
  }, [activeConvId]);

  // Responsive viewing state (mobile sidebar vs details view)
  const [viewState, setViewState] = useState<'list' | 'chat'>('list');

  // Load conversions, creators and call history lists on mount
  useEffect(() => {
    fetchConversations();
    fetchCreators();
    fetchRecentCalls();

    // Setup socket connection
    let socket: WebSocket | null = null;
    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws/chat`;
      socket = new WebSocket(wsUrl);
      socketRef.current = socket;
    } catch (err) {
      console.warn('Chat WebSocket connection could not be initialized:', err);
    }

    if (socket) {
      socket.onopen = () => {
        // Send auth handshake
        if (socket && socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({
            type: 'auth',
            token,
            userId: currentUser.id,
            name: currentUser.name,
            username: currentUser.username || currentUser.profile?.username || ''
          }));
        }
      };

      socket.onerror = (err) => {
        console.warn('Chat WebSocket error handled gracefully:', err);
      };

      socket.onclose = (event) => {
        console.log('Chat WebSocket closed gracefully:', event.reason);
      };

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          const { type } = data;

          if (type === 'presence') {
            const { userId, status, lastSeen } = data;
            setPresence(prev => ({
              ...prev,
              [userId]: { status, lastSeen }
            }));
          }

          if (type === 'typing_state') {
            const { conversationId, typers: incomingTypers } = data;
            if (conversationId === activeConvIdRef.current) {
              setTypers(incomingTypers.filter((t: any) => t.id !== currentUser.id));
            }
          }

          if (type === 'message_received') {
            const { message, muted } = data;
            
            if (message.senderId !== currentUser.id) {
              // Azan auto-mute (feature 223): the server tags this event `muted`
              // when the recipient's prayer-window auto-mute is active — deliver
              // the message silently (no chime, no toast).
              if (!muted) {
                try {
                  const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
                  const osc = audioCtx.createOscillator();
                  const gain = audioCtx.createGain();
                  osc.type = 'sine';
                  osc.frequency.setValueAtTime(587.33, audioCtx.currentTime);
                  osc.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 0.15);
                  gain.gain.setValueAtTime(0.12, audioCtx.currentTime);
                  gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.2);
                  osc.connect(gain);
                  gain.connect(audioCtx.destination);
                  osc.start();
                  osc.stop(audioCtx.currentTime + 0.2);
                } catch (e) {
                  // AudioContext blocked or uninitialized
                }

                const msgTxt = message.text 
                  ? (message.text.length > 35 ? message.text.substring(0, 35) + '...' : message.text)
                  : (message.mediaUrl ? (message.mediaName?.match(/\.(mp3|wav|ogg|m4a|webm)$/i) ? '🎙️ Voice Note' : '🖼️ Photo') : 'Message');
                
                window.dispatchEvent(new CustomEvent('show-toast', {
                  detail: { message: `💬 ${message.senderName || 'Chat'}: ${msgTxt}` }
                }));
              }
            }

            // Add message to active chat if matching
            if (message.conversationId === activeConvIdRef.current) {
              setMessages(prev => {
                // Avoid duplicates
                if (prev.some(m => m.id === message.id)) return prev;
                return [...prev, message];
              });
              // Mark as read immediately since the chat is open
              markAsRead(message.conversationId, [message.id]);
            }

            // Update last message in conversation sidebar list
            setConversations(prev => {
              const exists = prev.some(conv => conv.id === message.conversationId);
              if (!exists) {
                // If it is a new conversation not in the sidebar, fetch list from API to display it
                fetchConversations();
                return prev;
              }
              return prev.map(conv => {
                if (conv.id === message.conversationId) {
                  return {
                    ...conv,
                    lastMessage: message,
                    unreadCount: message.conversationId === activeConvIdRef.current 
                      ? 0 
                      : conv.unreadCount + (message.senderId === currentUser.id ? 0 : 1)
                  };
                }
                return conv;
              });
            });

            // Scroll down
            setTimeout(() => {
              scrollToBottom();
            }, 100);
          }

          if (type === 'messages_read') {
            const { conversationId, readerId, messageIds } = data;
            if (conversationId === activeConvIdRef.current) {
              setMessages(prev => prev.map(msg => {
                if (messageIds.includes(msg.id)) {
                  const updatedReadBy = Array.from(new Set([...(msg.readBy || []), readerId]));
                  const totalOthers = conversations.find(c => c.id === conversationId)?.participants.filter(p => p !== msg.senderId).length || 1;
                  const readOthers = updatedReadBy.filter(p => p !== msg.senderId).length;
                  return {
                    ...msg,
                    readBy: updatedReadBy,
                    status: readOthers >= totalOthers ? 'read' : 'delivered'
                  };
                }
                return msg;
              }));
            }
          }

          if (type === 'message_edited' || type === 'message_deleted' || type === 'message_reacted') {
            const { conversationId, message, messageId } = data;
            if (conversationId === activeConvIdRef.current) {
              setMessages(prev => prev.map(m => (m.id === (messageId || message.id)) ? message : m));
            }
            // Also update lastMessage in sidebar if applicable
            setConversations(prev => prev.map(conv => {
              if (conv.id === conversationId) {
                return {
                  ...conv,
                  lastMessage: conv.lastMessage?.id === (messageId || message.id) ? message : conv.lastMessage
                };
              }
              return conv;
            }));
          }
        } catch (err) {
          console.error('Socket error parsing incoming payload:', err);
        }
      };
    }

    return () => {
      if (socketRef.current) {
        try {
          socketRef.current.close();
        } catch (e) {}
      }
    };
  }, [token]);

  // Back-up real-time sync / polling loop to guarantee real-time delivery without reload
  useEffect(() => {
    const intervalId = setInterval(() => {
      fetchConversations();
      fetchCreators();
      if (activeConvId) {
        // Fetch new messages in the active conversation
        fetch(`/api/chat/conversations/${activeConvId}/messages?limit=50`, {
          headers: { 'Authorization': `Bearer ${token}` }
        })
          .then(res => {
            if (res.ok) return res.json();
          })
          .then(data => {
            if (data && data.messages) {
              setMessages(prev => {
                const map = new Map<string, ChatMessage>();
                prev.forEach(m => map.set(m.id, m));
                let changed = false;
                data.messages.forEach((m: ChatMessage) => {
                  const existing = map.get(m.id);
                  if (!existing || JSON.stringify(existing) !== JSON.stringify(m)) {
                    map.set(m.id, m);
                    changed = true;
                  }
                });
                if (changed) {
                  const sorted = Array.from(map.values()).sort((a, b) => a.timestamp - b.timestamp);
                  return sorted;
                }
                return prev;
              });
            }
          })
          .catch(() => {});
      }
    }, 2500);

    return () => clearInterval(intervalId);
  }, [activeConvId, token]);

  const markAsRead = async (convId: string, messageIds?: string[]) => {
    if (!convId) return;
    // Reset sidebar unread badge immediately in local state
    setConversations(prev => prev.map(c => c.id === convId ? { ...c, unreadCount: 0 } : c));

    // Send HTTP REST API request to clear unread in database permanently
    try {
      await fetch(`/api/chat/conversations/${convId}/read`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ messageIds: messageIds || [] })
      });
    } catch (err) {
      console.warn('Failed to send read receipt via REST:', err);
    }

    // Send WebSocket notification if connected
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({
        type: 'read',
        conversationId: convId,
        messageIds: messageIds || []
      }));
    }
  };

  // Synchronize scrolling and fetch history on conversation change
  useEffect(() => {
    if (activeConvId) {
      markAsRead(activeConvId);
      fetchMessages(activeConvId);
      setTypers([]);
      setViewState('chat');
      setEditingMessage(null);
      setReplyingTo(null);
      setAttachedMedia(null);
      setAttachedMediaName(null);
      setTextInput('');
      setShowGifPicker(false);
    }
  }, [activeConvId]);

  // Auto-select or auto-create conversation with initialActiveUserId
  useEffect(() => {
    if (initialActiveUserId && conversationsLoaded) {
      const existing = conversations.find(c => 
        !c.isGroup && 
        c.participants.includes(initialActiveUserId) && 
        c.participants.includes(currentUser.id)
      );
      if (existing) {
        setActiveConvId(existing.id);
        if (onClearInitialActiveUserId) onClearInitialActiveUserId();
      } else {
        // Create a new one
        const createChat = async () => {
          try {
            const res = await fetch('/api/chat/conversations', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
              },
              body: JSON.stringify({
                isGroup: false,
                participantIds: [initialActiveUserId]
              })
            });
            if (res.ok) {
              const data = await res.json();
              if (data.conversation) {
                // Prepend or add to conversations and set active
                setConversations(prev => {
                  if (prev.some(c => c.id === data.conversation.id)) return prev;
                  return [data.conversation, ...prev];
                });
                setActiveConvId(data.conversation.id);
              }
            } else {
              const data = await res.json();
              window.dispatchEvent(new CustomEvent('show-toast', { detail: { message: `🔒 ${data.error || 'Cannot start chat with this user.'}` } }));
            }
          } catch (e) {
            console.error("Failed to auto-create conversation:", e);
          } finally {
            if (onClearInitialActiveUserId) onClearInitialActiveUserId();
          }
        };
        createChat();
      }
    }
  }, [initialActiveUserId, conversations, conversationsLoaded, currentUser.id, token, onClearInitialActiveUserId]);

  const DEMO_CONVERSATIONS: Conversation[] = [
    {
      id: 'conv-gucci-fans',
      isGroup: true,
      name: 'gucci fans 🌱',
      description: 'Gucci Fans Official Chatroom & Insta Curation',
      avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80',
      participants: ['user-1', 'user-2', 'user-3', 'user-4'],
      createdTime: Date.now() - 86400000,
      unreadCount: 0,
      lastMessage: {
        id: 'msg-demo-1',
        conversationId: 'conv-gucci-fans',
        senderId: 'user-chloe',
        senderName: 'Chloe',
        text: 'pls help me choose photos for insta post ⚡😍',
        mediaUrl: null,
        mediaName: null,
        timestamp: Date.now() - 300000,
        status: 'read',
        readBy: ['user-1']
      }
    },
    {
      id: 'conv-maya-lin',
      isGroup: false,
      name: 'Maya Lin 📌',
      avatarUrl: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=200&q=80',
      participants: ['user-maya', currentUser.id],
      createdTime: Date.now() - 172800000,
      unreadCount: 2,
      lastMessage: {
        id: 'msg-demo-2',
        conversationId: 'conv-maya-lin',
        senderId: 'user-maya',
        senderName: 'Maya Lin',
        text: 'Check out this new UI design layout!',
        mediaUrl: null,
        mediaName: null,
        timestamp: Date.now() - 7200000,
        status: 'delivered',
        readBy: []
      }
    },
    {
      id: 'conv-design-crew',
      isGroup: true,
      name: 'Design System Crew 🎨',
      avatarUrl: 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=200&q=80',
      participants: ['user-1', currentUser.id],
      createdTime: Date.now() - 259200000,
      unreadCount: 0,
      lastMessage: {
        id: 'msg-demo-3',
        conversationId: 'conv-design-crew',
        senderId: 'user-2',
        senderName: 'Design Lead',
        text: 'Components updated in Figma!',
        mediaUrl: null,
        mediaName: null,
        timestamp: Date.now() - 86400000,
        status: 'read',
        readBy: []
      }
    },
    {
      id: 'conv-alex-rivera',
      isGroup: false,
      name: 'Alex Rivera',
      avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=200&q=80',
      participants: ['user-alex', currentUser.id],
      createdTime: Date.now() - 432000000,
      unreadCount: 0,
      lastMessage: {
        id: 'msg-demo-4',
        conversationId: 'conv-alex-rivera',
        senderId: 'user-alex',
        senderName: 'Alex Rivera',
        text: 'Got the ticket confirmed! See you Friday.',
        mediaUrl: null,
        mediaName: null,
        timestamp: Date.now() - 259200000,
        status: 'read',
        readBy: []
      }
    }
  ];

  const fetchConversations = async () => {
    try {
      const response = await fetch('/api/chat/conversations', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      let convList: Conversation[] = [];
      if (response.ok) {
        const data = await response.json();
        convList = (data.conversations || []).map((c: Conversation) => {
          if (c.id === activeConvIdRef.current) {
            return { ...c, unreadCount: 0 };
          }
          return c;
        });
      }
      if (convList.length === 0) {
        convList = DEMO_CONVERSATIONS;
      }
      setConversations(convList);
      setConversationsLoaded(true);
      if (!activeConvIdRef.current && convList.length > 0) {
        setActiveConvId(convList[0].id);
      }
    } catch (e) {
      console.error('Failed to fetch chat conversations:', e);
      setConversations(DEMO_CONVERSATIONS);
      if (!activeConvIdRef.current) {
        setActiveConvId(DEMO_CONVERSATIONS[0].id);
      }
    }
  };

  const fetchRecentCalls = async () => {
    try {
      const response = await fetch('/api/calls', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setRecentCalls(data.calls || []);
      }
    } catch (e) {
      console.warn('Failed to load call history:', e);
    }
  };

  const fetchCreators = async () => {
    try {
      const response = await fetch('/api/creators', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setCreators(data.creators.filter((c: Creator) => c.id !== currentUser.id));
      }
    } catch (e) {
      console.error('Failed to load creators list:', e);
    }
  };

  const fetchPresence = async (userId: string) => {
    try {
      const response = await fetch(`/api/chat/presence/${userId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setPresence(prev => ({
          ...prev,
          [userId]: data
        }));
      }
    } catch (e) {}
  };

  const DEMO_MESSAGES: Record<string, ChatMessage[]> = {
    'conv-gucci-fans': [
      {
        id: 'msg-demo-1',
        conversationId: 'conv-gucci-fans',
        senderId: 'user-chloe',
        senderName: 'Chloe Vance',
        text: 'Come ooooonn 👻',
        mediaUrl: null,
        mediaName: null,
        timestamp: Date.now() - 3600000,
        status: 'read',
        readBy: ['all'],
        reactions: {
          '❤️': ['u1'],
          '🔥': ['u1', 'u2', 'u3', 'u4'],
          '👻': ['u1', 'u2']
        }
      },
      {
        id: 'msg-demo-2',
        conversationId: 'conv-gucci-fans',
        senderId: currentUser.id,
        senderName: currentUser.name || 'You',
        text: 'Hi peeps',
        mediaUrl: null,
        mediaName: null,
        timestamp: Date.now() - 3500000,
        status: 'read',
        readBy: ['all']
      },
      {
        id: 'msg-demo-3',
        conversationId: 'conv-gucci-fans',
        senderId: currentUser.id,
        senderName: currentUser.name || 'You',
        text: 'pls help me choose photos for insta post ⚡😍',
        mediaUrl: null,
        mediaName: null,
        timestamp: Date.now() - 3400000,
        status: 'read',
        readBy: ['all']
      }
    ]
  };

  const fetchMessages = async (convId: string, beforeTimestamp?: number) => {
    try {
      const url = `/api/chat/conversations/${convId}/messages?limit=30${
        beforeTimestamp ? `&beforeTimestamp=${beforeTimestamp}` : ''
      }`;
      const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      let loadedMessages: ChatMessage[] = [];
      if (response.ok) {
        const data = await response.json();
        loadedMessages = data.messages || [];
        setHasMore(data.hasMore);
      }
      if (loadedMessages.length === 0 && DEMO_MESSAGES[convId]) {
        loadedMessages = DEMO_MESSAGES[convId];
      }
      if (beforeTimestamp) {
        setMessages(prev => [...loadedMessages, ...prev]);
      } else {
        setMessages(loadedMessages);
        setTimeout(() => scrollToBottom(), 80);
      }
      const unreadIds = loadedMessages
        .filter((m: ChatMessage) => m.senderId !== currentUser.id && !(m.readBy || []).includes(currentUser.id))
        .map((m: ChatMessage) => m.id);
      markAsRead(convId, unreadIds);
    } catch (e) {
      console.error('Failed to fetch messages:', e);
      if (DEMO_MESSAGES[convId]) {
        setMessages(DEMO_MESSAGES[convId]);
        setTimeout(() => scrollToBottom(), 80);
      }
    }
  };

  const loadMoreMessages = () => {
    if (!hasMore || messages.length === 0) return;
    const oldestTimestamp = messages[0].timestamp;
    fetchMessages(activeConvId!, oldestTimestamp);
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleCreate1to1Chat = async (recipient: Creator) => {
    try {
      const response = await fetch('/api/chat/conversations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          isGroup: false,
          participantIds: [recipient.id]
        })
      });

      if (response.ok) {
        const data = await response.json();
        await fetchConversations();
        setActiveConvId(data.conversation.id);
        setShowCreateMenu(false);
      } else {
        const data = await response.json();
        window.dispatchEvent(new CustomEvent('show-toast', { detail: { message: `🔒 ${data.error || 'Cannot start chat with this user.'}` } }));
      }
    } catch (e) {
      console.error('Failed to start chat:', e);
    }
  };

  const handleCreateGroupChat = async () => {
    if (!groupName.trim()) return;

    try {
      const response = await fetch('/api/chat/conversations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          isGroup: true,
          isOpenGroup: isOpenGroupCreate,
          name: groupName.trim(),
          description: groupDescription.trim(),
          participantIds: selectedParticipants
        })
      });

      if (response.ok) {
        const data = await response.json();
        await fetchConversations();
        await fetchOpenGroups();
        setActiveConvId(data.conversation.id);
        setGroupName('');
        setGroupDescription('');
        setSelectedParticipants([]);
        setIsGroupCreate(false);
        setIsOpenGroupCreate(false);
        setShowCreateMenu(false);
        window.dispatchEvent(new CustomEvent('show-toast', { detail: { message: `✨ Group "${groupName.trim()}" launched!` } }));
      }
    } catch (e) {
      console.error('Failed to create group:', e);
    }
  };

  const toggleParticipantSelection = (userId: string) => {
    setSelectedParticipants(prev => 
      prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
    );
  };

  const handleTriggerMediaFile = () => {
    fileInputRef.current?.click();
  };

  const handleMediaFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setAttachedMedia(reader.result as string);
        setAttachedMediaName(file.name);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleTyping = () => {
    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN || !activeConvId) return;

    if (!isTyping) {
      setIsTyping(true);
      socketRef.current.send(JSON.stringify({
        type: 'typing',
        conversationId: activeConvId,
        isTyping: true
      }));
    }

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    typingTimeoutRef.current = setTimeout(() => {
      setIsTyping(false);
      if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
        socketRef.current.send(JSON.stringify({
          type: 'typing',
          conversationId: activeConvId,
          isTyping: false
        }));
      }
    }, 2000);
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!textInput.trim() && !attachedMedia) || !activeConvId || isSubmitting) return;

    // Slash commands (bitchat port)
    if (textInput.trim().startsWith('/') && !editingMessage) {
      runSlashCommand(textInput.trim());
      return;
    }

    if (editingMessage) {
      const updatedText = textInput.trim();
      const targetMsgId = editingMessage.id;
      
      // Optimistic update
      setMessages(prev => prev.map(m => m.id === targetMsgId ? { ...m, text: updatedText, edited: true } : m));
      
      setTextInput('');
      setEditingMessage(null);

      // 1. Send via WebSocket if connected
      if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
        socketRef.current.send(JSON.stringify({
          type: 'edit_message',
          conversationId: activeConvId,
          messageId: targetMsgId,
          newText: updatedText
        }));
      }

      // 2. Backup via REST API
      try {
        await fetch(`/api/chat/conversations/${activeConvId}/messages/${targetMsgId}/edit`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ text: updatedText })
        });
      } catch (err) {
        console.error("Failed to edit message via REST:", err);
      }
      return;
    }

    setIsSubmitting(true);
    try {
      let finalMediaUrl = attachedMedia;
      let finalMediaName = attachedMediaName;

      const isImage = attachedMediaName?.match(/\.(jpeg|jpg|gif|png|webp|svg|bmp)$/i) || attachedMedia?.startsWith('data:image');
      const isAudio = attachedMediaName?.match(/\.(mp3|wav|ogg|m4a|webm|flac|aac)$/i) || attachedMedia?.startsWith('data:audio');

      // Bake image edits if present
      if (attachedMedia && isImage && (imageFilter !== 'none' || imageRotation !== 0 || imageFlipH || imageFlipV || imageBrightness !== 100 || imageContrast !== 100 || imageSaturate !== 100)) {
        try {
          window.dispatchEvent(new CustomEvent('show-toast', { detail: { message: "🎨 Baking image edits..." } }));
          finalMediaUrl = await applyImageEdits(attachedMedia, {
            filter: imageFilter,
            rotation: imageRotation,
            flipH: imageFlipH,
            flipV: imageFlipV,
            brightness: imageBrightness,
            contrast: imageContrast,
            saturate: imageSaturate
          });
        } catch (err) {
          console.error("Failed to render image with edits:", err);
        }
      }

      // Bake audio effects/edits if present
      if (attachedMedia && isAudio && (audioEffect !== 'normal' || audioSpeed !== 1.0 || audioVolumeBoost !== 1.0 || audioTrimStart !== 0 || audioTrimEnd !== 100)) {
        try {
          window.dispatchEvent(new CustomEvent('show-toast', { detail: { message: "✨ Polishing & baking audio effects..." } }));
          finalMediaUrl = await renderAudioWithEffect(attachedMedia, audioEffect, audioSpeed, audioVolumeBoost, audioTrimStart, audioTrimEnd);
          finalMediaName = finalMediaName || `audio_${Date.now()}.wav`;
        } catch (err) {
          console.error("Failed to render audio with effect:", err);
        }
      }

      // Send via REST API for maximum database reliability and speed
      const response = await fetch(`/api/chat/conversations/${activeConvId}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          text: textInput.trim(),
          mediaUrl: finalMediaUrl,
          mediaName: finalMediaName,
          replyToMessageId: replyingTo?.id || null
        })
      });

      if (response.ok) {
        const data = await response.json();
        setTextInput('');
        setAttachedMedia(null);
        setAttachedMediaName(null);
        setReplyingTo(null);
        setImageFilter('none');
        setImageRotation(0);
        setImageFlipH(false);
        setImageFlipV(false);
        setImageBrightness(100);
        setImageContrast(100);
        setImageSaturate(100);
        setIsEditingImage(false);
        setAudioSpeed(1.0);
        setAudioEffect('normal');
        setAudioVolumeBoost(1.0);
        setAudioTrimStart(0);
        setAudioTrimEnd(100);
        setIsEditingAudio(false);
        setAttachedMediaName(null);
        setReplyingTo(null);
        setAudioSpeed(1.0);
        setAudioEffect('normal');
        
        // Optimistically add message to local view if broadcast didn't occur yet
        const sentMsg = data.message;
        if (sentMsg) {
          setMessages(prev => {
            if (prev.some(m => m.id === sentMsg.id)) return prev;
            return [...prev, sentMsg];
          });
          setTimeout(() => scrollToBottom(), 50);
        }
      } else {
        // Fallback to WebSocket
        if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
          socketRef.current.send(JSON.stringify({
            type: 'message',
            conversationId: activeConvId,
            text: textInput.trim(),
            mediaUrl: finalMediaUrl,
            mediaName: finalMediaName,
            replyToMessageId: replyingTo?.id || null
          }));
          setTextInput('');
          setAttachedMedia(null);
          setAttachedMediaName(null);
          setReplyingTo(null);
          setAudioSpeed(1.0);
          setAudioEffect('normal');
        }
      }
    } catch (err) {
      console.error('Error sending message via REST API:', err);
      // Fallback to WebSocket
      if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
        let finalMediaUrl = attachedMedia;
        let finalMediaName = attachedMediaName;
        if (attachedMedia && attachedMediaName?.endsWith('.webm') && (audioEffect !== 'normal' || audioSpeed !== 1.0)) {
          try {
            finalMediaUrl = await renderAudioWithEffect(attachedMedia, audioEffect, audioSpeed);
            finalMediaName = `voice_recording_${Date.now()}.wav`;
          } catch (e) {}
        }
        socketRef.current.send(JSON.stringify({
          type: 'message',
          conversationId: activeConvId,
          text: textInput.trim(),
          mediaUrl: finalMediaUrl,
          mediaName: finalMediaName,
          replyToMessageId: replyingTo?.id || null
        }));
        setTextInput('');
        setAttachedMedia(null);
        setAttachedMediaName(null);
        setReplyingTo(null);
        setAudioSpeed(1.0);
        setAudioEffect('normal');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleArchiveConversation = async (conv: Conversation) => {
    try {
      const isCurrentlyArchived = conv.isArchived;
      const endpoint = `/api/chat/conversations/${conv.id}/${isCurrentlyArchived ? 'unarchive' : 'archive'}`;
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        await fetchConversations();
        setActiveConvId(null);
        setViewState('list');
      }
    } catch (e) {
      console.error('Failed to archive conversation:', e);
    }
  };

  const handleDeleteConversation = async (conv: Conversation) => {
    if (!window.confirm('Are you sure you want to delete this chat? This action will hide the conversation from your inbox.')) return;
    try {
      const response = await fetch(`/api/chat/conversations/${conv.id}/delete`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        setActiveConvId(null);
        await fetchConversations();
      }
    } catch (e) {
      console.error('Failed to delete conversation:', e);
    }
  };

  const handleToggleBlockParticipant = async (conv: Conversation) => {
    const otherId = conv.participants.find(p => p !== currentUser.id);
    if (!otherId) return;
    const isCurrentlyBlocked = conv.isBlocked;
    
    if (!isCurrentlyBlocked && !window.confirm('Are you sure you want to block this user? You will not receive any new messages from them.')) {
      return;
    }
    
    try {
      const endpoint = `/api/chat/users/${otherId}/${isCurrentlyBlocked ? 'unblock' : 'block'}`;
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        await fetchConversations();
      }
    } catch (e) {
      console.error('Failed to block/unblock user:', e);
    }
  };

  const handleVotePoll = async (msgId: string, optionId: string) => {
    if (!activeConvId) return;

    // Optimistic update
    setMessages(prev => prev.map(m => {
      if (m.id !== msgId || !m.poll || !m.poll.options) return m;
      const updatedOptions = m.poll.options.map(opt => {
        let votes = [...(opt.votes || [])];
        if (opt.id === optionId) {
          if (votes.includes(currentUser.id)) {
            votes = votes.filter(uid => uid !== currentUser.id);
          } else {
            votes.push(currentUser.id);
          }
        } else if (!m.poll?.isMultipleChoice) {
          votes = votes.filter(uid => uid !== currentUser.id);
        }
        return { ...opt, votes };
      });
      return { ...m, poll: { ...m.poll, options: updatedOptions } };
    }));

    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({
        type: 'poll_vote',
        conversationId: activeConvId,
        messageId: msgId,
        optionId
      }));
    }

    try {
      await fetch(`/api/chat/conversations/${activeConvId}/messages/${msgId}/vote`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ optionId })
      });
    } catch (e) {
      console.error('Failed to vote in poll:', e);
    }
  };

  const handleTogglePinMessage = async (msgId: string | null) => {
    if (!activeConvId) return;
    const newPinId = msgId === activeConv?.pinnedMessageId ? null : msgId;

    setConversations(prev => prev.map(c => c.id === activeConvId ? { ...c, pinnedMessageId: newPinId } : c));

    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({
        type: 'pin_message',
        conversationId: activeConvId,
        messageId: newPinId
      }));
    }

    try {
      await fetch(`/api/chat/conversations/${activeConvId}/pin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ messageId: newPinId })
      });
      window.dispatchEvent(new CustomEvent('show-toast', { detail: { message: newPinId ? '📌 Message pinned to chat' : '📌 Message unpinned' } }));
    } catch (e) {
      console.error('Failed to pin message:', e);
    }
  };

  // --- Saved messages (Tinode slf port) ---
  const handleSaveMessage = async (msg: ChatMessage) => {
    try {
      const res = await fetch(`/api/chat/messages/${msg.id}/save`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (res.ok) {
        setSavedMessageIds(prev => new Set(prev).add(msg.id));
        window.dispatchEvent(new CustomEvent('show-toast', { detail: { message: '🔖 Message saved' } }));
      }
    } catch (e) { console.error('save message failed:', e); }
  };

  const handleUnsaveMessage = async (msg: ChatMessage) => {
    try {
      const res = await fetch(`/api/chat/messages/${msg.id}/save`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (res.ok) {
        setSavedMessageIds(prev => { const next = new Set(prev); next.delete(msg.id); return next; });
        window.dispatchEvent(new CustomEvent('show-toast', { detail: { message: 'Removed from saved' } }));
      }
    } catch (e) { console.error('unsave message failed:', e); }
  };

  // --- Per-user soft delete (Tinode DeletedFor port) ---
  const handleDeleteForMe = async (msg: ChatMessage) => {
    if (!activeConvId) return;
    try {
      await fetch(`/api/chat/conversations/${activeConvId}/messages/${msg.id}/delete-for-me`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      setMessages(prev => prev.map(m => m.id === msg.id
        ? { ...m, deletedForMe: [...(m.deletedForMe || []), currentUser.id] }
        : m));
      window.dispatchEvent(new CustomEvent('show-toast', { detail: { message: '🗑️ Deleted for you' } }));
    } catch (e) { console.error('delete-for-me failed:', e); }
  };

  // --- Delete for everyone (tombstone, admin/owner allowed beyond 10 min) ---
  const handleDeleteEveryone = async (msg: ChatMessage) => {
    if (!activeConvId) return;
    try {
      const res = await fetch(`/api/chat/conversations/${activeConvId}/messages/${msg.id}/delete-everyone`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, ...data.message } : m));
        window.dispatchEvent(new CustomEvent('show-toast', { detail: { message: '🗑️ Deleted for everyone' } }));
      } else {
        const err = await res.json().catch(() => ({}));
        window.dispatchEvent(new CustomEvent('show-toast', { detail: { message: err.error || 'Delete failed', variant: 'destructive' } }));
      }
    } catch (e) { console.error('delete-everyone failed:', e); }
  };

  // --- Scheduled messages (rtm22 port) ---
  const handleScheduleMessage = async () => {
    if (!activeConvId || !scheduleText.trim()) return;
    const when = new Date(scheduleAt).getTime();
    if (!Number.isFinite(when) || when <= Date.now()) {
      window.dispatchEvent(new CustomEvent('show-toast', { detail: { message: 'Pick a future time', variant: 'destructive' } }));
      return;
    }
    try {
      const res = await fetch(`/api/chat/conversations/${activeConvId}/schedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ text: scheduleText.trim(), scheduledFor: when }),
      });
      if (res.ok) {
        window.dispatchEvent(new CustomEvent('show-toast', { detail: { message: '⏰ Message scheduled' } }));
        setScheduleText(''); setScheduleAt(''); setShowScheduleModal(false);
      } else {
        const err = await res.json().catch(() => ({}));
        window.dispatchEvent(new CustomEvent('show-toast', { detail: { message: err.error || 'Schedule failed', variant: 'destructive' } }));
      }
    } catch (e) { console.error('schedule failed:', e); }
  };

  // --- Group join-request moderation (rtm(1) port) ---
  const loadJoinRequests = async () => {
    if (!activeConvId) return;
    try {
      const res = await fetch(`/api/chat/conversations/${activeConvId}/join-requests`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setJoinRequests(data.requests || []);
      }
    } catch (e) { console.error('load join requests failed:', e); }
  };

  const handleJoinRequest = async (requestId: string, approve: boolean) => {
    try {
      const res = await fetch(`/api/chat/join-requests/${requestId}/${approve ? 'approve' : 'reject'}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (res.ok) {
        setJoinRequests(prev => prev.filter(r => r.id !== requestId));
        window.dispatchEvent(new CustomEvent('show-toast', { detail: { message: approve ? '✅ Join request approved' : '❌ Join request rejected' } }));
      }
    } catch (e) { console.error('join request action failed:', e); }
  };

  // --- Slash commands (bitchat port) ---
  const SLASH_COMMANDS: { cmd: string; label: string; action: () => void }[] = [
    { cmd: '/help', label: 'Show available commands', action: () => window.dispatchEvent(new CustomEvent('show-toast', { detail: { message: 'Commands: /help /clear /block /report /watch /schedule /me — type one to run it.' } })) },
    { cmd: '/clear', label: 'Clear this chat locally', action: () => { setMessages([]); window.dispatchEvent(new CustomEvent('show-toast', { detail: { message: 'Chat cleared locally' } })); } },
    { cmd: '/watch', label: 'Watch a video together', action: () => setShowWatchTogether(true) },
    { cmd: '/schedule', label: 'Schedule a message', action: () => setShowScheduleModal(true) },
    { cmd: '/block', label: 'Block this user', action: () => {
      if (!activeConv?.isGroup && activeConv) {
        const otherId = (activeConv.participants || []).find((p: string) => p !== currentUser.id);
        if (otherId) {
          fetch(`/api/chat/users/${otherId}/block`, { method: 'POST', headers: { 'Authorization': `Bearer ${token}` } })
            .then(() => window.dispatchEvent(new CustomEvent('show-toast', { detail: { message: '🚫 User blocked' } })))
            .catch(() => {});
        }
      } else window.dispatchEvent(new CustomEvent('show-toast', { detail: { message: 'Only available in direct messages', variant: 'destructive' } }));
    } },
    { cmd: '/report', label: 'Report this chat', action: () => { if (activeConv) setShowReportModal({ targetType: activeConv.isGroup ? 'conversation' : 'user', targetId: activeConv.id }); } },
    { cmd: '/pay', label: 'Send coins inline — /pay @rahim 50', action: () => window.dispatchEvent(new CustomEvent('show-toast', { detail: { message: 'Type /pay @username 50 to send Ocean Coins to anyone in this chat.' } })) },
    { cmd: '/split', label: 'Split an expense — /split 500', action: () => window.dispatchEvent(new CustomEvent('show-toast', { detail: { message: 'Type /split 500 to split an amount equally across this group.' } })) },
  ];

  const runSlashCommand = (cmd: string) => {
    const trimmed = cmd.trim();

    // /pay @username 50 — inline Ocean Pay transfer (Ocean Pay, feature 19)
    if (/^\/pay(\s|$)/i.test(trimmed)) {
      void handlePayCommand(trimmed);
      setTextInput('');
      return true;
    }
    // /split [amount] — equal split bill in this group chat (Split Bill, feature 4)
    if (/^\/split(\s|$)/i.test(trimmed)) {
      void handleSplitCommand(trimmed);
      setTextInput('');
      return true;
    }

    const match = SLASH_COMMANDS.find(c => trimmed.toLowerCase().startsWith(c.cmd));
    if (match) { match.action(); setTextInput(''); return true; }
    return false;
  };

  // Post a system-style card into the active chat (used by /pay and /split).
  const appendChatCard = async (text: string) => {
    if (!activeConvId) return;
    try {
      const response = await fetch(`/api/chat/conversations/${activeConvId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ text, mediaUrl: null, replyToMessageId: null })
      });
      if (response.ok) {
        const data = await response.json();
        if (data.message) {
          setMessages(prev => (prev.some(m => m.id === data.message.id) ? prev : [...prev, data.message]));
          setTimeout(() => scrollToBottom(), 50);
        }
      }
    } catch (e) {
      console.error('Failed to append chat card:', e);
    }
  };

  const handlePayCommand = async (cmd: string) => {
    const parts = cmd.replace(/^\/pay\s*/i, '').trim().split(/\s+/);
    const amount = parseInt(parts[parts.length - 1], 10);
    const targetName = parts.slice(0, -1).join(' ').replace(/^@/, '').toLowerCase();
    if (!targetName || !Number.isFinite(amount) || amount <= 0) {
      window.dispatchEvent(new CustomEvent('show-toast', { detail: { message: 'Usage: /pay @username 50 — e.g. /pay @rahim 50' } }));
      return;
    }
    // Resolve the recipient from the creators directory, or the DM counterpart.
    const recipient = creators.find((c: Creator) =>
      (c.name || '').toLowerCase() === targetName ||
      (c.username || '').toLowerCase() === targetName ||
      (c.name || '').toLowerCase().includes(targetName)
    );
    const dmOther = (!activeConv?.isGroup && activeConv)
      ? (activeConv.participants || []).find((p: string) => p !== currentUser.id)
      : null;
    if (!recipient && !dmOther) {
      window.dispatchEvent(new CustomEvent('show-toast', { detail: { message: `Could not find @${targetName} — check the name.` } }));
      return;
    }
    const toUserId = recipient ? recipient.id : (dmOther as string);
    const toName = recipient ? recipient.name || recipient.username : activeConv?.name;
    try {
      const res = await fetch('/api/wallet/pay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ toUserId, amount, note: 'Sent from chat' })
      });
      const data = await res.json();
      if (res.ok) {
        await appendChatCard(`💰 ${currentUser.name} sent ${amount} Ocean Coins to ${toName}`);
        window.dispatchEvent(new CustomEvent('show-toast', { detail: { message: data.message || `💰 Sent ${amount} coins` } }));
      } else {
        window.dispatchEvent(new CustomEvent('show-toast', { detail: { message: `⛔ ${data.error || 'Payment failed'}` } }));
      }
    } catch (e) {
      window.dispatchEvent(new CustomEvent('show-toast', { detail: { message: '⛔ Payment failed — are you online?' } }));
    }
  };

  const handleSplitCommand = async (cmd: string) => {
    const amount = parseInt(cmd.replace(/^\/split\s*/i, '').trim(), 10);
    if (!Number.isFinite(amount) || amount <= 0) {
      window.dispatchEvent(new CustomEvent('show-toast', { detail: { message: 'Usage: /split 500 — splits that amount equally in this group.' } }));
      return;
    }
    if (!activeConv || !activeConv.isGroup) {
      window.dispatchEvent(new CustomEvent('show-toast', { detail: { message: 'ℹ️ /split works in group chats only.' } }));
      return;
    }
    const participants = (activeConv.participants || []).map((p: string) => ({ userId: p }));
    try {
      const res = await fetch(`/api/chats/${activeConv.id}/split`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          title: `Quick split — ${new Date().toLocaleDateString()}`,
          items: [{ name: 'Shared expense', amount, payers: participants.map((p: any) => p.userId), paidBy: currentUser.id }],
          participants
        })
      });
      const data = await res.json();
      if (res.ok) {
        const perPerson = Math.ceil(amount / participants.length);
        await appendChatCard(`🧾 Split bill created: ৳${amount} / ${participants.length} people = ${perPerson} each. See the Split Bill tab.`);
        window.dispatchEvent(new CustomEvent('show-toast', { detail: { message: `🧾 Split created — ৳${amount} split ${participants.length} ways` } }));
      } else {
        window.dispatchEvent(new CustomEvent('show-toast', { detail: { message: `⛔ ${data.error || 'Could not create split'}` } }));
      }
    } catch (e) {
      window.dispatchEvent(new CustomEvent('show-toast', { detail: { message: '⛔ Could not create split' } }));
    }
  };

  const handleToggleMuteConversation = async (conv: Conversation) => {
    try {
      const res = await fetch(`/api/chat/conversations/${conv.id}/mute`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setConversations(prev => prev.map(c => c.id === conv.id ? { ...c, isMuted: data.isMuted } : c));
        window.dispatchEvent(new CustomEvent('show-toast', { detail: { message: data.isMuted ? '🔕 Conversation muted' : '🔔 Notifications enabled' } }));
      }
    } catch (e) {
      console.error('Failed to mute conversation:', e);
    }
  };

  const handleForwardMessage = async (targetConvId: string) => {
    if (!showForwardModal) return;
    try {
      const res = await fetch(`/api/chat/conversations/${targetConvId}/forward`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ sourceMessageId: showForwardModal.id })
      });
      if (res.ok) {
        setShowForwardModal(null);
        window.dispatchEvent(new CustomEvent('show-toast', { detail: { message: '↪️ Message forwarded successfully!' } }));
      }
    } catch (e) {
      console.error('Failed to forward message:', e);
    }
  };

  const handleSendPoll = async () => {
    if (!pollQuestion.trim() || pollOptions.filter(o => o.trim()).length < 2 || !activeConvId) return;

    const pollData = {
      question: pollQuestion.trim(),
      options: pollOptions.filter(o => o.trim()).map((text, i) => ({ id: `opt-${i}`, text: text.trim(), votes: [] })),
      isAnonymous: pollIsAnonymous,
      isMultipleChoice: pollIsMultipleChoice
    };

    try {
      const res = await fetch(`/api/chat/conversations/${activeConvId}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          text: `📊 Poll: ${pollQuestion.trim()}`,
          poll: pollData
        })
      });
      if (res.ok) {
        setShowPollModal(false);
        setPollQuestion('');
        setPollOptions(['Option A', 'Option B']);
        const data = await res.json();
        if (data.message) {
          setMessages(prev => [...prev, data.message]);
          setTimeout(() => scrollToBottom(), 50);
        }
      }
    } catch (e) {
      console.error('Failed to send poll:', e);
    }
  };

  const handleSubmitReport = async () => {
    if (!showReportModal) return;
    try {
      const res = await fetch('/api/chat/reports', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          targetType: showReportModal.targetType,
          targetId: showReportModal.targetId,
          reason: reportReason,
          details: reportDetails
        })
      });
      if (res.ok) {
        setShowReportModal(null);
        setReportDetails('');
        window.dispatchEvent(new CustomEvent('show-toast', { detail: { message: '🛡️ Report submitted. Thank you for keeping our community safe.' } }));
      }
    } catch (e) {
      console.error('Failed to submit report:', e);
    }
  };

  const handleDeleteMessage = async (msgId: string) => {
    if (!activeConvId) return;

    // Optimistic update
    setMessages(prev => prev.map(m => m.id === msgId ? { ...m, text: 'This message was deleted', deleted: true, mediaUrl: null, mediaName: null } : m));

    // 1. Send via WebSocket if connected
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({
        type: 'delete_message',
        conversationId: activeConvId,
        messageId: msgId
      }));
    }

    // 2. Backup via REST API
    try {
      const res = await fetch(`/api/chat/conversations/${activeConvId}/messages/${msgId}/delete`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) {
        const data = await res.json();
        window.dispatchEvent(new CustomEvent('show-toast', { detail: { message: `⚠️ ${data.error || 'Failed to delete message'}` } }));
      }
    } catch (e) {
      console.error('Failed to delete message:', e);
    }
  };

  const handleToggleReaction = async (msgId: string, emoji: string) => {
    if (!activeConvId) return;

    // Optimistic update
    setMessages(prev => prev.map(m => {
      if (m.id !== msgId) return m;
      const reactions = { ...(m.reactions || {}) };
      const list = [...(reactions[emoji] || [])];
      if (list.includes(currentUser.id)) {
        reactions[emoji] = list.filter(u => u !== currentUser.id);
      } else {
        reactions[emoji] = [...list, currentUser.id];
      }
      return { ...m, reactions };
    }));

    // 1. Send via WebSocket if connected
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({
        type: 'add_reaction',
        conversationId: activeConvId,
        messageId: msgId,
        emoji
      }));
    }

    // 2. Backup via REST API
    try {
      await fetch(`/api/chat/conversations/${activeConvId}/messages/${msgId}/react`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ emoji })
      });
    } catch (e) {
      console.error('Failed to toggle reaction via REST:', e);
    }
  };

  const handleStartEdit = (msg: ChatMessage) => {
    setEditingMessage(msg);
    setTextInput(msg.text);
    setReplyingTo(null);
  };

  const getActiveConversationInfo = () => {
    return conversations.find(c => c.id === activeConvId) || null;
  };

  const getParticipantStatusLine = (conv: Conversation) => {
    if (conv.isGroup) {
      return `${conv.participants.length} participants`;
    }

    const otherId = conv.participants.find(p => p !== currentUser.id);
    if (!otherId) return 'Offline';

    const pState = presence[otherId];
    if (!pState) return 'Offline';

    if (pState.status === 'online') return 'Online';

    if (pState.lastSeen) {
      const date = new Date(pState.lastSeen);
      return `Last seen ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} ${date.toLocaleDateString([], { month: 'short', day: 'numeric' })}`;
    }

    return 'Offline';
  };

  const formatMessageTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const renderMessagePreview = (msg: ChatMessage | null, statusFallback: string) => {
    if (!msg) return statusFallback;
    const isMe = msg.senderId === currentUser.id;
    const prefix = isMe ? 'You: ' : '';
    if (msg.deleted) return `${prefix}🚫 message deleted`;

    let mediaBadge = '';
    if (msg.mediaUrl) {
      const name = (msg.mediaName || '').toLowerCase();
      const url = (msg.mediaUrl || '').toLowerCase();
      if (name.match(/\.(mp3|wav|ogg|m4a|webm)$/i) || url.includes('audio') || url.includes('webm') || name.includes('voice') || name.includes('recording')) {
        mediaBadge = '🎙️ Voice Note';
      } else if (name.match(/\.(jpg|jpeg|png|gif|webp|svg)$/i) || url.includes('image') || url.startsWith('data:image')) {
        mediaBadge = '🖼️ Photo';
      } else {
        mediaBadge = '📎 File';
      }
    }

    if (mediaBadge && msg.text) {
      return `${prefix}${mediaBadge} • ${msg.text}`;
    } else if (mediaBadge) {
      return `${prefix}${mediaBadge}`;
    }
    return `${prefix}${msg.text || 'Message'}`;
  };

  const filteredCreators = creators.filter(c => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) return true;
    return (
      c.name.toLowerCase().includes(query) ||
      (c.username || '').toLowerCase().includes(query) ||
      (c.badgeNumber || '').toLowerCase().includes(query)
    );
  });

  const activeConv = getActiveConversationInfo();

  const otherParticipantId = activeConv?.isGroup ? null : activeConv?.participants.find(p => p !== currentUser.id);
  const otherCreator = otherParticipantId ? creators.find(c => c.id === otherParticipantId) : null;
  const isFriendOfRecipient = otherParticipantId ? friends.some((f: any) => f.id === otherParticipantId) : false;
  const isMessagingDisabledByRecipient = !!(otherCreator && otherCreator.isPublicMessagingEnabled === false && !isFriendOfRecipient);

  const renderAll = () => (
    <>
      <motion.div
        initial={isInline ? { opacity: 0, y: 15 } : { scale: 0.95, opacity: 0 }}
        animate={isInline ? { opacity: 1, y: 0 } : { scale: 1, opacity: 1 }}
        exit={isInline ? { opacity: 0, y: 15 } : { scale: 0.95, opacity: 0 }}
        className={`bg-[#000000] text-stone-100 rounded-3xl w-full ${
          isInline ? 'h-[75vh] md:h-[82vh]' : 'max-w-6xl h-[85vh]'
        } border border-stone-800/90 shadow-2xl overflow-hidden flex font-sans select-none relative`}
      >
        {/* COLUMN 1: LEFT SIDEBAR (Chat List) */}
        <div className={`w-full md:w-80 border-r border-stone-800/80 flex flex-col bg-[#000000] shrink-0 ${
          viewState === 'chat' ? 'hidden md:flex' : 'flex'
        }`}>
          {/* Header */}
          <div className="p-4 border-b border-stone-800/80 flex items-center justify-between bg-[#000000]">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-indigo-600/30 border border-indigo-500/40 flex items-center justify-center text-indigo-400 font-bold shrink-0">
                <Users size={18} />
              </div>
              <div>
                <h3 className="font-bold text-sm text-white tracking-tight flex items-center gap-1.5">
                  Messages
                </h3>
                <span className="text-[10px] text-zinc-400 block font-mono">Gucci Fans Messenger</span>
              </div>
            </div>
            <button
              onClick={() => {
                setIsGroupCreate(true);
                setShowCreateMenu(true);
              }}
              className="w-8 h-8 rounded-full bg-[#16161a] hover:bg-[#25252e] text-white flex items-center justify-center transition-all cursor-pointer border border-white/10 shrink-0"
              title="New Chat or Group"
            >
              <Plus size={16} />
            </button>
          </div>

          {/* Search Input Bar */}
          <div className="px-3 py-2.5 bg-[#000000]">
            <div className="relative">
              <input
                type="text"
                placeholder="Search chats or messages..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-[#121215] border border-stone-800 focus:border-stone-700 rounded-xl py-2 pl-9 pr-3 text-xs text-white placeholder-zinc-500 focus:outline-none transition-all"
              />
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={14} />
            </div>
          </div>

          {/* Filter Pills */}
          <div className="flex px-3 py-1.5 gap-1.5 border-b border-stone-800/80 bg-[#000000] overflow-x-auto scrollbar-none">
            {[
              { id: 'all', label: 'All' },
              { id: 'direct', label: 'Direct' },
              { id: 'groups', label: 'Groups' },
              { id: 'unread', label: 'Unread' }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setMsgFilter(tab.id as any)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-all cursor-pointer whitespace-nowrap ${
                  msgFilter === tab.id
                    ? 'bg-[#22202e] text-white font-semibold border border-white/10'
                    : 'text-zinc-400 hover:text-white hover:bg-[#121215]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Chat List Stream */}
          <div className="flex-1 overflow-y-auto p-2 space-y-1 bg-[#000000]">
            {/* Recent Calls */}
            {recentCalls.length > 0 && (
              <div className="mb-2">
                <div className="flex items-center justify-between px-3 py-1.5">
                  <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 font-bold">Recent Calls</span>
                  <span className="text-[9px] font-mono uppercase tracking-wider text-zinc-600">{recentCalls.length} total</span>
                </div>
                <div className="space-y-0.5">
                  {recentCalls.slice(0, 4).map((call) => {
                    const isOutgoing = call.callerId === currentUser.id;
                    const otherId = isOutgoing ? call.calleeId : call.callerId;
                    const conv = conversations.find(c => !c.isGroup && (c.participants || []).includes(otherId));
                    const otherName = conv?.name || (isOutgoing ? call.calleeId : call.callerName);
                    return (
                      <button
                        key={call.id}
                        onClick={() => {
                          if (conv) {
                            setActiveConvId(conv.id);
                            setViewState('chat');
                          }
                        }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left hover:bg-[#0d0d12] transition-colors group cursor-pointer border border-transparent"
                        title={`Open conversation with ${otherName}`}
                      >
                        <span className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${call.callType === 'video' ? 'bg-rose-500/15 text-rose-400' : 'bg-emerald-500/15 text-emerald-400'}`}>
                          {call.callType === 'video' ? <Video size={13} /> : <Phone size={13} />}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="text-[12px] font-semibold text-zinc-200 truncate">
                            {isOutgoing ? 'Outgoing' : 'Incoming'} {call.callType === 'video' ? 'video' : 'voice'} · {otherName}
                          </div>
                          <div className="text-[10px] font-mono text-zinc-500">
                            {call.status} {call.durationSec > 0 ? `· ${Math.floor(call.durationSec / 60)}m ${call.durationSec % 60}s` : ''}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            {conversations
              .filter(c => {
                if (searchQuery.trim()) {
                  const q = searchQuery.toLowerCase().trim();
                  const matchName = (c.name || '').toLowerCase().includes(q);
                  const matchLastMsg = (c.lastMessage?.text || '').toLowerCase().includes(q);
                  if (!matchName && !matchLastMsg) return false;
                }
                if (msgFilter === 'direct') return !c.isGroup;
                if (msgFilter === 'groups') return c.isGroup;
                if (msgFilter === 'unread') return c.unreadCount > 0;
                return true;
              })
              .map((conv) => {
                const isActive = conv.id === activeConvId;
                const statusLine = getParticipantStatusLine(conv);
                const isOnline = !conv.isGroup && statusLine === 'Online';

                return (
                  <button
                    key={conv.id}
                    onClick={() => {
                      setActiveConvId(conv.id);
                      setViewState('chat');
                    }}
                    className={`w-full p-3 rounded-2xl text-left transition-all border flex gap-3 items-center group cursor-pointer ${
                      isActive
                        ? 'bg-[#181622] border-indigo-500/40 text-white shadow-md'
                        : 'bg-transparent border-transparent hover:bg-[#0d0d12] text-zinc-300'
                    }`}
                  >
                    {/* Avatar with online dot */}
                    <div className="relative shrink-0">
                      <img
                        src={conv.avatarUrl || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80'}
                        alt={conv.name || 'Chat'}
                        className="w-11 h-11 rounded-2xl object-cover border border-white/10"
                      />
                      <span className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-[#000000] ${
                        isOnline || conv.isGroup ? 'bg-emerald-500' : 'bg-zinc-600'
                      }`} />
                    </div>

                    {/* Title & Preview */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-xs text-white truncate flex items-center gap-1">
                          {conv.name || 'Private Chat'}
                        </span>
                        {conv.lastMessage && (
                          <span className="text-[10px] text-zinc-500 font-mono">
                            {formatMessageTime(conv.lastMessage.timestamp)}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center justify-between mt-1">
                        <p className="text-[11px] text-zinc-400 truncate pr-2">
                          {renderMessagePreview(conv.lastMessage, statusLine)}
                        </p>
                        {conv.unreadCount > 0 && (
                          <span className="bg-white text-black font-bold text-[10px] w-5 h-5 flex items-center justify-center rounded-full shrink-0 shadow-sm">
                            {conv.unreadCount}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
          </div>

          {/* Bottom Profile Footer */}
          <div className="p-3 border-t border-stone-800/80 bg-[#0a0a0d] flex items-center justify-between">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="relative">
                <img
                  src={currentUser.profile?.avatarUrl || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=200&q=80'}
                  alt={currentUser.name}
                  className="w-9 h-9 rounded-full object-cover border border-white/10"
                />
                <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-500 rounded-full border border-[#0a0a0d]" />
              </div>
              <div className="min-w-0">
                <h4 className="font-bold text-xs text-white truncate">{currentUser.name || 'Alex Morgan'}</h4>
                <span className="text-[10px] text-emerald-400 font-medium block">Online</span>
              </div>
            </div>
            <button
              onClick={() => setShowSettingsModal(true)}
              className="text-zinc-400 hover:text-white p-2 rounded-xl hover:bg-[#181622] transition-colors cursor-pointer"
              title="Settings"
            >
              <Sliders size={16} />
            </button>
          </div>
        </div>

        {/* COLUMN 2: MIDDLE CHAT CONTENT AREA */}
        <div className={`flex-1 flex flex-col bg-[#000000] min-w-0 ${
          viewState === 'list' ? 'hidden md:flex' : 'flex'
        }`}>
          {activeConv ? (
            <>
              {/* Active Conversation Header */}
              <div className="p-4 border-b border-stone-800/80 bg-[#000000] flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <button
                    onClick={() => setViewState('list')}
                    className="md:hidden text-zinc-400 hover:text-white p-1 rounded-full hover:bg-stone-800 transition-colors"
                  >
                    <ArrowLeft size={16} />
                  </button>
                  <div className="relative shrink-0">
                    <img
                      src={activeConv.avatarUrl || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80'}
                      alt={activeConv.name || 'Chat'}
                      className="w-10 h-10 rounded-2xl object-cover border border-white/10"
                    />
                    {!activeConv.isGroup && getParticipantStatusLine(activeConv) === 'Online' && (
                      <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 border-2 border-[#000000] rounded-full" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <h4 className="font-bold text-sm text-white tracking-tight flex items-center gap-2 truncate">
                      {activeConv.name}
                      {activeConv.isBlocked && (
                        <span className="bg-rose-500/20 text-rose-400 text-[8px] font-mono px-1.5 py-0.5 rounded font-bold uppercase border border-rose-500/30">Blocked</span>
                      )}
                    </h4>
                    <span className="text-[11px] text-emerald-400 block truncate">
                      {getParticipantStatusLine(activeConv)}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 relative">
                  {/* Audio Call Button (self-contained engine; Stream optional) */}
                  <StartCallButton
                    targetUserId={activeConv.isGroup ? '' : (activeConv.participants.find(p => p !== currentUser.id) || '')}
                    callType="audio"
                    peerName={activeConv.name}
                    className="text-zinc-400 hover:text-white p-2 rounded-xl hover:bg-stone-800 transition-colors"
                    title="Start Audio Call"
                  >
                    <Phone size={16} />
                  </StartCallButton>

                  {/* Video Call Button (self-contained engine; Stream optional) */}
                  <StartCallButton
                    targetUserId={activeConv.isGroup ? '' : (activeConv.participants.find(p => p !== currentUser.id) || '')}
                    callType="video"
                    peerName={activeConv.name}
                    className="text-zinc-400 hover:text-white p-2 rounded-xl hover:bg-stone-800 transition-colors"
                    title="Start Video Call"
                  >
                    <Video size={16} />
                  </StartCallButton>

                  {/* Jitsi Group Meeting Button — group chats only (self-hostable, external-only for multi-party). 1:1 calls use the built-in engine. */}
                  {activeConv.isGroup && (
                    <button
                      onClick={() => setShowJitsiMeeting(true)}
                      className="text-zinc-400 hover:text-white p-2 rounded-xl hover:bg-stone-800 transition-colors cursor-pointer"
                      title="Start a Jitsi Meeting (group video call)"
                    >
                      <Users size={16} />
                    </button>
                  )}

                  {/* Watch Together (jitsi shared-video port) */}
                  <button
                    onClick={() => setShowWatchTogether(true)}
                    className="text-zinc-400 hover:text-white p-2 rounded-xl hover:bg-stone-800 transition-colors cursor-pointer"
                    title="Watch a video together"
                  >
                    <MonitorPlay size={16} />
                  </button>

                  {/* Saved messages / notes-to-self */}
                  <button
                    onClick={() => setShowSavedPanel(true)}
                    className="text-zinc-400 hover:text-white p-2 rounded-xl hover:bg-stone-800 transition-colors cursor-pointer"
                    title="Saved messages & notes"
                  >
                    <Bookmark size={16} />
                  </button>

                  {/* Schedule a message */}
                  <button
                    onClick={() => setShowScheduleModal(true)}
                    className="text-zinc-400 hover:text-white p-2 rounded-xl hover:bg-stone-800 transition-colors cursor-pointer"
                    title="Schedule a message"
                  >
                    <CalendarClock size={16} />
                  </button>

                  {/* Group join-request moderation (group admins) */}
                  {activeConv.isGroup && (activeConv.creatorId === currentUser.id || (activeConv.adminIds || []).includes(currentUser.id)) && (
                    <button
                      onClick={() => { setShowJoinRequests(v => !v); if (!showJoinRequests) loadJoinRequests(); }}
                      className="text-zinc-400 hover:text-white p-2 rounded-xl hover:bg-stone-800 transition-colors cursor-pointer relative"
                      title="Join requests"
                    >
                      <Users size={16} />
                      {joinRequests.length > 0 && (
                        <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-amber-400 rounded-full border border-black" />
                      )}
                    </button>
                  )}

                  {/* Toggle Info Panel Button */}
                  <button
                    onClick={() => setShowInfoPanel(!showInfoPanel)}
                    className={`p-2 rounded-xl transition-colors cursor-pointer ${
                      showInfoPanel ? 'bg-indigo-600/30 text-indigo-400 border border-indigo-500/40' : 'text-zinc-400 hover:text-white hover:bg-stone-800'
                    }`}
                    title="Toggle Info Panel"
                  >
                    <Info size={16} />
                  </button>

                  {/* Settings dropdown trigger */}
                  <div className="relative">
                    <button
                      onClick={() => setShowChatSettingsDropdown(!showChatSettingsDropdown)}
                      className={`p-2 rounded-xl transition-colors cursor-pointer ${
                        showChatSettingsDropdown 
                          ? 'bg-stone-800 text-white' 
                          : 'text-zinc-400 hover:text-white hover:bg-stone-800'
                      }`}
                      title="Chat Settings"
                    >
                      <MoreVertical size={16} />
                    </button>

                    <AnimatePresence>
                      {showChatSettingsDropdown && (
                        <>
                          {/* Backdrop to close dropdown on click outside */}
                          <div 
                            className="fixed inset-0 z-40" 
                            onClick={() => setShowChatSettingsDropdown(false)} 
                          />
                          <motion.div
                            initial={{ opacity: 0, y: 10, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 10, scale: 0.95 }}
                            transition={{ duration: 0.15 }}
                            className="absolute right-0 mt-1 w-52 bg-[#fdfbf7] border border-[#ebdcca] rounded-xl shadow-lg py-1.5 z-50 overflow-hidden font-sans"
                          >
                            <div className="px-3 py-1.5 border-b border-[#ebdcca]/40 mb-1">
                              <span className="text-[10px] font-mono uppercase tracking-wider text-[#8a8172] font-bold">Chat Options</span>
                            </div>

                            {/* Search in Chat */}
                            <button
                              onClick={() => {
                                setIsSearchingInChat(true);
                                setShowChatSettingsDropdown(false);
                              }}
                              className="w-full text-left px-3 py-2 text-xs hover:bg-[#ebdcca]/20 transition-colors flex items-center gap-2 text-[#5c5446]"
                            >
                              <Search size={13} className="text-[#8a8172]" />
                              <span>Search Messages</span>
                            </button>

                            {/* Mute/Unmute Notifications */}
                            <button
                              onClick={() => {
                                handleToggleMuteConversation(activeConv);
                                setShowChatSettingsDropdown(false);
                              }}
                              className="w-full text-left px-3 py-2 text-xs hover:bg-[#ebdcca]/20 transition-colors flex items-center gap-2 text-[#5c5446]"
                            >
                              <VolumeX size={13} className="text-[#8a8172]" />
                              <span>{activeConv.isMuted ? 'Unmute Notifications' : 'Mute Notifications'}</span>
                            </button>

                            {/* Share Invite & QR Code */}
                            {(activeConv.isGroup || activeConv.isChannel) && (
                              <button
                                onClick={() => {
                                  setShowInviteModal(true);
                                  setShowChatSettingsDropdown(false);
                                }}
                                className="w-full text-left px-3 py-2 text-xs hover:bg-[#ebdcca]/20 transition-colors flex items-center gap-2 text-[#5c5446]"
                              >
                                <QrCode size={13} className="text-amber-800" />
                                <span>Invite Link & QR Code</span>
                              </button>
                            )}

                            {/* Create Poll */}
                            <button
                              onClick={() => {
                                setShowPollModal(true);
                                setShowChatSettingsDropdown(false);
                              }}
                              className="w-full text-left px-3 py-2 text-xs hover:bg-[#ebdcca]/20 transition-colors flex items-center gap-2 text-[#5c5446]"
                            >
                              <BarChart2 size={13} className="text-amber-800" />
                              <span>Create Interactive Poll</span>
                            </button>

                            {/* Report User / Group */}
                            <button
                              onClick={() => {
                                setShowReportModal({ targetType: activeConv.isGroup ? 'conversation' : 'user', targetId: activeConv.id });
                                setShowChatSettingsDropdown(false);
                              }}
                              className="w-full text-left px-3 py-2 text-xs hover:bg-[#ebdcca]/20 transition-colors flex items-center gap-2 text-amber-900 font-medium"
                            >
                              <Flag size={13} className="text-amber-800" />
                              <span>Report {activeConv.isGroup ? 'Group' : 'User'}</span>
                            </button>

                            {/* Block User for Private Chats */}
                            {!activeConv.isGroup && !activeConv.isChannel && (
                              <button
                                onClick={() => {
                                  handleToggleBlockParticipant(activeConv);
                                  setShowChatSettingsDropdown(false);
                                }}
                                className="w-full text-left px-3 py-2 text-xs hover:bg-rose-50 hover:text-rose-700 transition-colors flex items-center gap-2 text-[#5c5446]"
                              >
                                {activeConv.isBlocked ? (
                                  <>
                                    <ShieldAlert size={13} className="text-rose-600" />
                                    <span>Unblock User</span>
                                  </>
                                ) : (
                                  <>
                                    <Shield size={13} className="text-[#8a8172]" />
                                    <span>Block User</span>
                                  </>
                                )}
                              </button>
                            )}

                            {/* Archive Conversation */}
                            <button
                              onClick={() => {
                                  handleArchiveConversation(activeConv);
                                  setShowChatSettingsDropdown(false);
                              }}
                              className="w-full text-left px-3 py-2 text-xs hover:bg-[#ebdcca]/20 transition-colors flex items-center gap-2 text-[#5c5446]"
                            >
                              {activeConv.isArchived ? (
                                <>
                                  <FolderOpen size={13} className="text-amber-800" />
                                  <span>Unarchive Chat</span>
                                </>
                              ) : (
                                <>
                                  <Archive size={13} className="text-[#8a8172]" />
                                  <span>Archive Chat</span>
                                </>
                              )}
                            </button>

                            {/* Delete Conversation */}
                            <button
                              onClick={() => {
                                handleDeleteConversation(activeConv);
                                setShowChatSettingsDropdown(false);
                              }}
                              className="w-full text-left px-3 py-2 text-xs hover:bg-rose-50 text-rose-600 hover:text-rose-700 transition-colors flex items-center gap-2 border-t border-[#ebdcca]/40 mt-1 pt-1.5"
                            >
                              <Trash2 size={13} />
                              <span>Delete Chat</span>
                            </button>
                          </motion.div>
                        </>
                      )}
                    </AnimatePresence>
                  </div>

                  <div className="w-[1px] h-4 bg-[#ebdcca] mx-0.5" />

                  {!isInline && onClose && (
                    <button
                      onClick={onClose}
                      className="text-[#8a8172] hover:text-[#3a342a] p-1.5 rounded-lg hover:bg-[#ebdcca]/20 transition-colors"
                    >
                      <X size={15} />
                    </button>
                  )}
                </div>
              </div>

              {/* Sticky Pinned Message Banner */}
              {activeConv.pinnedMessageId && (() => {
                const pinnedMsg = messages.find(m => m.id === activeConv.pinnedMessageId);
                return (
                  <div className="bg-amber-50 border-b border-amber-200/80 px-4 py-2 flex items-center justify-between text-xs animate-fadeIn">
                    <div className="flex items-center gap-2 min-w-0">
                      <Pin size={13} className="text-amber-800 shrink-0" />
                      <div className="min-w-0">
                        <span className="font-bold text-[9px] uppercase tracking-wider text-amber-900 block font-mono">Pinned Message</span>
                        <p className="text-[11px] text-amber-950 truncate font-sans">
                          {pinnedMsg ? (pinnedMsg.text || 'Attachment') : 'Pinned message'}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => handleTogglePinMessage(null)}
                      className="text-amber-800 hover:text-amber-950 text-[10px] font-mono underline ml-2 shrink-0"
                    >
                      Unpin
                    </button>
                  </div>
                );
              })()}

              {/* In-Chat Search Input Bar */}
              {isSearchingInChat && (
                <div className="bg-[#fbf9f4] border-b border-[#ebdcca] px-4 py-2 flex items-center gap-2">
                  <Search size={14} className="text-[#8a8172]" />
                  <input
                    type="text"
                    placeholder="Search messages in this chat..."
                    value={chatSearchQuery}
                    onChange={(e) => setChatSearchQuery(e.target.value)}
                    className="flex-1 bg-white border border-[#ebdcca] rounded-lg px-2.5 py-1 text-xs text-[#3a342a] focus:outline-none"
                    autoFocus
                  />
                  <button onClick={() => { setIsSearchingInChat(false); setChatSearchQuery(''); }} className="text-[#8a8172] hover:text-[#3a342a] p-1">
                    <X size={14} />
                  </button>
                </div>
              )}

              {/* Message Streams Area */}
              <div 
                ref={messagesContainerRef}
                className="flex-1 overflow-y-auto overflow-x-hidden p-4 space-y-3.5 bg-[#000000]"
              >
                {hasMore && (
                  <div className="text-center">
                    <button
                      onClick={loadMoreMessages}
                      className="font-mono text-[8px] uppercase font-bold text-amber-800 hover:underline"
                    >
                      Load older messages
                    </button>
                  </div>
                )}

                {messages.length === 0 ? (
                  <div className="h-full flex items-center justify-center py-20">
                    <div className="text-center space-y-1">
                      <p className="text-[10px] text-[#b0a595] font-sans">Say hello to start the discussion!</p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {messages.filter((m: any) => !((m.deletedForMe || []).includes(currentUser.id))).map((msg, idx) => {
                      const isMe = msg.senderId === currentUser.id;
                      const isAdminUser = activeConv ? (activeConv.creatorId === currentUser.id || (activeConv.adminIds || []).includes(currentUser.id)) : false;

                      // Show date headers
                      const showDateHeader = idx === 0 || 
                        new Date(messages[idx - 1].timestamp).toDateString() !== new Date(msg.timestamp).toDateString();

                      return (
                        <div key={msg.id} className="space-y-1.5">
                          {showDateHeader && (
                            <div className="flex items-center justify-center my-3">
                              <span className="bg-[#ebdcca]/40 text-[#5c5446] font-mono text-[8px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                                {new Date(msg.timestamp).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}
                              </span>
                            </div>
                          )}

                          <div className={`flex ${isMe ? 'justify-end' : 'justify-start'} group/msg`}>
                            <div className="relative max-w-[70%]">
                              <div className={`rounded-2xl p-3 border shadow-2xs space-y-1 relative ${
                              isMe 
                                ? 'bg-[#3a342a] border-[#3a342a] text-[#fbf9f4] rounded-br-xs' 
                                : 'bg-[#fdfbf7] border-[#ebdcca] text-[#3a342a] rounded-bl-xs'
                            }`}>
                              {/* Reply Quoted Preview */}
                              {msg.replyToMessageId && (() => {
                                const repliedMsg = messages.find(m => m.id === msg.replyToMessageId);
                                if (!repliedMsg) return null;
                                return (
                                  <div className={`p-2 rounded-lg text-[10px] border-l-2 mb-1.5 line-clamp-2 ${
                                    isMe 
                                      ? 'bg-white/10 border-[#ebdcca]/50 text-[#fbf9f4]/80' 
                                      : 'bg-[#3a342a]/5 border-amber-800 text-[#5c5446]'
                                  }`}>
                                    <span className="font-bold block text-[9px]">
                                      {repliedMsg.senderId === currentUser.id ? 'You' : repliedMsg.senderName}
                                    </span>
                                    {repliedMsg.deleted ? '🚫 Message deleted' : (repliedMsg.text || '📷 Attachment')}
                                  </div>
                                );
                              })()}

                              {/* Forwarded Header */}
                              {msg.forwardedFrom && (
                                <div className={`text-[9px] font-mono font-bold flex items-center gap-1 mb-1 ${
                                  isMe ? 'text-[#ebdcca]/80' : 'text-amber-800'
                                }`}>
                                  <Share2 size={10} />
                                  <span>Forwarded from {msg.forwardedFrom.senderName}</span>
                                </div>
                              )}

                              {/* Group sender name badge */}
                              {activeConv.isGroup && !isMe && !msg.forwardedFrom && (
                                <span className="block font-mono text-[8px] font-bold text-amber-800 uppercase tracking-wide">
                                  {msg.senderName}
                                </span>
                              )}

                              {msg.deleted ? (
                                <p className="text-xs italic leading-relaxed font-sans opacity-60">
                                  🚫 This message was deleted
                                </p>
                              ) : (
                                <>
                                  {/* Media attachment */}
                                  {msg.mediaUrl && (
                                    <div className="rounded-lg overflow-hidden border border-[#ebdcca]/20 bg-black/5 p-1 mb-1">
                                      {msg.mediaName?.match(/\.(jpeg|jpg|gif|png)$/i) || msg.mediaUrl.startsWith('data:image') ? (
                                        <div className="flex items-center justify-center max-h-48">
                                          <img 
                                            src={msg.mediaUrl || null} 
                                            alt="Attachment" 
                                            className="max-h-48 w-auto object-contain rounded-lg cursor-zoom-in hover:scale-[1.02] active:scale-[0.98] transition-all duration-200" 
                                            referrerPolicy="no-referrer"
                                            onClick={() => window.dispatchEvent(new CustomEvent('view-image', { detail: msg.mediaUrl }))}
                                          />
                                        </div>
                                      ) : msg.mediaName?.match(/\.(mp3|wav|ogg|webm|m4a)$/i) || msg.mediaUrl.startsWith('data:audio') ? (
                                        <div className="p-2 flex flex-col gap-1.5 min-w-[200px]">
                                          <div className="flex items-center gap-1.5">
                                            <Mic size={14} className="text-amber-800 shrink-0" />
                                            <span className="text-[9px] font-mono text-[#8a8172] truncate max-w-[150px] uppercase font-bold">Voice Message</span>
                                          </div>
                                          <audio src={msg.mediaUrl || null} controls className="w-full max-w-[240px] h-8 rounded-lg outline-none" />
                                        </div>
                                      ) : msg.mediaName?.match(/\.(mp4|webm|mov|ogg)$/i) || msg.mediaUrl.startsWith('data:video') ? (
                                        <div className="rounded-lg overflow-hidden flex items-center justify-center max-h-48 bg-black">
                                          <video src={msg.mediaUrl || null} controls className="max-h-48 w-full object-contain rounded-lg" />
                                        </div>
                                      ) : (
                                        <div className="p-3 flex items-center gap-2">
                                          <FileText size={20} className="text-amber-800 shrink-0" />
                                          <a href={msg.mediaUrl} download={msg.mediaName || 'Attached_File'} className="text-[10px] underline hover:text-amber-950 truncate font-mono max-w-[150px] font-bold">
                                            {msg.mediaName || 'Attached File'}
                                          </a>
                                        </div>
                                      )}
                                    </div>
                                  )}

                                  {/* Poll Card Display */}
                                  {msg.poll && (
                                    <div className="space-y-2 py-1 my-1">
                                      <div className="flex items-center justify-between border-b border-current/10 pb-1">
                                        <span className="font-bold text-xs">{msg.poll.question}</span>
                                        <BarChart2 size={13} className={isMe ? 'text-amber-200' : 'text-amber-800'} />
                                      </div>
                                      <div className="space-y-1.5">
                                        {msg.poll.options.map(opt => {
                                          const totalVotes = msg.poll!.options.reduce((acc, curr) => acc + (curr.votes?.length || 0), 0);
                                          const optVotes = opt.votes?.length || 0;
                                          const pct = totalVotes > 0 ? Math.round((optVotes / totalVotes) * 100) : 0;
                                          const isVoted = (opt.votes || []).includes(currentUser.id);

                                          return (
                                            <button
                                              key={opt.id}
                                              onClick={() => handleVotePoll(msg.id, opt.id)}
                                              className={`w-full p-2 rounded-xl text-left border transition-all relative overflow-hidden text-xs flex items-center justify-between ${
                                                isVoted
                                                  ? (isMe ? 'bg-amber-800/60 border-amber-300 font-bold' : 'bg-amber-100 border-amber-800 font-bold')
                                                  : (isMe ? 'bg-white/10 border-white/20 hover:bg-white/20' : 'bg-white border-[#ebdcca] hover:border-[#cfcac0]')
                                              }`}
                                            >
                                              <div
                                                className={`absolute left-0 top-0 bottom-0 transition-all ${
                                                  isMe ? 'bg-amber-500/30' : 'bg-amber-200/60'
                                                }`}
                                                style={{ width: `${pct}%` }}
                                              />
                                              <span className="relative z-10 min-w-0 truncate">{opt.text}</span>
                                              <span className="relative z-10 font-mono text-[10px] ml-2 shrink-0">{pct}% ({optVotes})</span>
                                            </button>
                                          );
                                        })}
                                      </div>
                                      <span className="text-[9px] font-mono block opacity-75 pt-0.5">
                                        {msg.poll.options.reduce((acc, curr) => acc + (curr.votes?.length || 0), 0)} votes • {msg.poll.isAnonymous ? 'Anonymous' : 'Public'}
                                      </span>
                                    </div>
                                  )}

                                  {/* Text content */}
                                  {msg.text && !msg.poll && (
                                    <RenderRichChatMessage text={msg.text} isMe={isMe} />
                                  )}

                                  {/* Link preview (Tinode urlpreview port) */}
                                  {msg.text && !msg.poll && !msg.deleted && extractUrls(msg.text).length > 0 && (
                                    <div className="mt-1.5 min-w-[160px]">
                                      <LinkPreviewCard url={extractUrls(msg.text)[0]} token={token} />
                                    </div>
                                  )}
                                </>
                              )}

                              {/* Emoji Reactions List Display */}
                              {msg.reactions && Object.entries(msg.reactions).some(([_, val]) => ((val as string[]) || []).length > 0) && (
                                <div className="flex flex-wrap gap-1 mt-1.5 z-10">
                                  {Object.entries(msg.reactions).map(([emoji, val]) => {
                                    const users = (val as string[]) || [];
                                    if (!users || users.length === 0) return null;
                                    const reactedByMe = users.includes(currentUser.id);
                                    return (
                                      <button
                                        key={emoji}
                                        onClick={() => handleToggleReaction(msg.id, emoji)}
                                        className={`inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded-full border transition-all ${
                                          reactedByMe 
                                            ? 'bg-amber-100/40 border-amber-400 text-amber-950 font-bold' 
                                            : isMe 
                                              ? 'bg-white/10 border-white/20 text-[#ebdcca]/90 hover:bg-white/25'
                                              : 'bg-stone-100 border-[#ebdcca]/60 text-[#3a342a] hover:bg-stone-200'
                                        }`}
                                      >
                                        <span>{emoji}</span>
                                        <span>{users.length}</span>
                                      </button>
                                    );
                                  })}
                                </div>
                              )}

                              {/* Footer (Time + Double tick indicators) */}
                              <div className="flex items-center justify-end gap-1 pt-0.5">
                                {msg.edited && !msg.deleted && (
                                  <span className={`font-mono text-[7px] block italic ${isMe ? 'text-[#ebdcca]/50' : 'text-[#8a8172]/60'}`}>
                                    (edited)
                                  </span>
                                )}
                                <span className={`font-mono text-[8px] block ${isMe ? 'text-[#ebdcca]/70' : 'text-[#8a8172]'}`}>
                                  {formatMessageTime(msg.timestamp)}
                                </span>
                                {isMe && (
                                  <span className="shrink-0 flex items-center justify-center">
                                    {msg.status === 'sent' && (
                                      <Check size={10} className="text-[#ebdcca]/50" />
                                    )}
                                    {msg.status === 'delivered' && (
                                      <CheckCheck size={10} className="text-[#ebdcca]/60" />
                                    )}
                                    {msg.status === 'read' && (
                                      <CheckCheck size={10} className="text-amber-400" />
                                    )}
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Floating Action Menu on Hover */}
                            <div className={`absolute top-1/2 -translate-y-1/2 flex items-center gap-1 opacity-0 group-hover/msg:opacity-100 transition-all duration-150 z-20 ${
                              isMe ? 'right-full pr-2' : 'left-full pl-2'
                            }`}>
                              {/* Quick Emoji reaction choosing panel */}
                              <div className="flex items-center gap-0.5 bg-[#fdfbf7] border border-[#ebdcca] rounded-full px-1.5 py-0.5 shadow-md">
                                {['👍', '❤️', '😂', '🔥', '😮'].map(emoji => (
                                  <button
                                    key={emoji}
                                    onClick={() => handleToggleReaction(msg.id, emoji)}
                                    className="text-xs hover:scale-130 transition-transform duration-700 px-0.5"
                                  >
                                    {emoji}
                                  </button>
                                ))}
                              </div>

                              {/* Save/Unsave trigger (Tinode slf port) */}
                              {!msg.deleted && (
                                <button
                                  onClick={() => savedMessageIds.has(msg.id) ? handleUnsaveMessage(msg) : handleSaveMessage(msg)}
                                  className={`p-1 rounded-full bg-[#fdfbf7] border border-[#ebdcca] shadow-xs transition-colors ${
                                    savedMessageIds.has(msg.id) ? 'text-amber-800 bg-amber-100' : 'text-[#8a8172] hover:text-amber-800 hover:bg-amber-50'
                                  }`}
                                  title={savedMessageIds.has(msg.id) ? "Unsave Message" : "Save Message"}
                                >
                                  {savedMessageIds.has(msg.id) ? <BookmarkCheck size={10} /> : <Bookmark size={10} />}
                                </button>
                              )}

                              {/* Pin/Unpin trigger */}
                              {!msg.deleted && (
                                <button
                                  onClick={() => handleTogglePinMessage(msg.id)}
                                  className={`p-1 rounded-full bg-[#fdfbf7] border border-[#ebdcca] shadow-xs transition-colors ${
                                    activeConv.pinnedMessageId === msg.id ? 'text-amber-800 bg-amber-100' : 'text-[#8a8172] hover:text-amber-800 hover:bg-amber-50'
                                  }`}
                                  title={activeConv.pinnedMessageId === msg.id ? "Unpin Message" : "Pin Message"}
                                >
                                  <Pin size={10} />
                                </button>
                              )}

                              {/* Forward trigger */}
                              {!msg.deleted && (
                                <button
                                  onClick={() => setShowForwardModal(msg)}
                                  className="p-1 rounded-full bg-[#fdfbf7] border border-[#ebdcca] text-[#8a8172] hover:text-amber-800 hover:bg-amber-50 shadow-xs transition-colors"
                                  title="Forward Message"
                                >
                                  <Share2 size={10} />
                                </button>
                              )}

                              {/* Reply trigger */}
                              {!msg.deleted && (
                                <button
                                  onClick={() => setReplyingTo(msg)}
                                  className="p-1 rounded-full bg-[#fdfbf7] border border-[#ebdcca] text-[#8a8172] hover:text-amber-800 hover:bg-amber-50 shadow-xs transition-colors"
                                  title="Reply"
                                >
                                  <Reply size={10} />
                                </button>
                              )}

                              {/* Edit trigger */}
                              {isMe && !msg.deleted && (
                                <button
                                  onClick={() => handleStartEdit(msg)}
                                  className="p-1 rounded-full bg-[#fdfbf7] border border-[#ebdcca] text-[#8a8172] hover:text-amber-800 hover:bg-amber-50 shadow-xs transition-colors"
                                  title="Edit"
                                >
                                  <Edit2 size={10} />
                                </button>
                              )}

                              {/* Report message trigger */}
                              {!isMe && !msg.deleted && (
                                <button
                                  onClick={() => setShowReportModal({ targetType: 'message', targetId: msg.id })}
                                  className="p-1 rounded-full bg-[#fdfbf7] border border-[#ebdcca] text-[#8a8172] hover:text-amber-800 hover:bg-amber-50 shadow-xs transition-colors"
                                  title="Report Message"
                                >
                                  <Flag size={10} />
                                </button>
                              )}

                              {/* Delete for me (Tinode DeletedFor) */}
                              {!msg.deleted && (
                                <button
                                  onClick={() => handleDeleteForMe(msg)}
                                  className="p-1 rounded-full bg-[#fdfbf7] border border-[#ebdcca] text-[#8a8172] hover:text-red-600 hover:bg-red-50 shadow-xs transition-colors"
                                  title="Delete for me"
                                >
                                  <Trash2 size={10} />
                                </button>
                              )}

                              {/* Delete for everyone (admin/owner tombstone) */}
                              {(isMe || isAdminUser) && !msg.deleted && (
                                <button
                                  onClick={() => handleDeleteEveryone(msg)}
                                  className="p-1 rounded-full bg-[#fdfbf7] border border-[#ebdcca] text-[#8a8172] hover:text-red-600 hover:bg-red-50 shadow-xs transition-colors"
                                  title="Delete for everyone"
                                >
                                  <UserX size={10} />
                                </button>
                              )}

                              {/* Delete trigger */}
                              {isMe && !msg.deleted && (Date.now() - msg.timestamp < 10 * 60 * 1000) && (
                                <button
                                  onClick={() => handleDeleteMessage(msg.id)}
                                  className="p-1 rounded-full bg-[#fdfbf7] border border-[#ebdcca] text-rose-600 hover:text-rose-800 hover:bg-rose-50 shadow-xs transition-colors"
                                  title="Delete Message"
                                >
                                  <Trash2 size={10} />
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                      );
                    })}
                    <div ref={messagesEndRef} />
                  </div>
                )}
              </div>

              {/* Typing Indicators */}
              {typers.length > 0 && (
                <div className="px-4 py-1.5 bg-[#faf8f3] border-t border-[#ebdcca]/10 flex items-center gap-1.5">
                  <span className="flex gap-0.5 items-center justify-center shrink-0">
                    <span className="w-1.5 h-1.5 bg-amber-800 rounded-full animate-bounce delay-0" />
                    <span className="w-1.5 h-1.5 bg-amber-800 rounded-full animate-bounce delay-150" />
                    <span className="w-1.5 h-1.5 bg-amber-800 rounded-full animate-bounce delay-300" />
                  </span>
                  <p className="text-[9px] font-mono text-amber-800">
                    {typers.map(t => t.name).join(', ')} is typing...
                  </p>
                </div>
              )}

              {/* Chat Input Bar */}
              <div className="p-3 border-t border-[#ebdcca] bg-[#fbf9f4] space-y-2">
                {replyingTo && (
                  <div className="flex items-center justify-between bg-amber-50/70 border border-amber-200 px-3 py-1.5 rounded-lg">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <Reply size={12} className="text-amber-800 shrink-0" />
                      <div className="text-[10px] truncate">
                        <span className="font-bold text-amber-900 font-sans">Replying to {replyingTo.senderName}: </span>
                        <span className="text-[#5c5446] font-mono italic">{replyingTo.text || '📷 Attached asset'}</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setReplyingTo(null)}
                      className="text-[#8a8172] hover:text-amber-900 hover:bg-amber-100 rounded-full p-0.5"
                    >
                      <X size={12} />
                    </button>
                  </div>
                )}

                {editingMessage && (
                  <div className="flex items-center justify-between bg-amber-50 border border-[#ebdcca] px-3 py-1.5 rounded-lg">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <Edit2 size={12} className="text-amber-800 shrink-0" />
                      <div className="text-[10px] truncate">
                        <span className="font-bold text-amber-900 font-sans">Editing Message: </span>
                        <span className="text-[#5c5446] font-mono italic">{editingMessage.text}</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingMessage(null);
                        setTextInput('');
                      }}
                      className="text-[#8a8172] hover:text-amber-900 hover:bg-amber-100 rounded-full p-0.5"
                    >
                      <X size={12} />
                    </button>
                  </div>
                )}

                {/* Advanced Attached Media Preview & Editing System */}
                {attachedMedia && (() => {
                  const isImage = attachedMediaName?.match(/\.(jpeg|jpg|gif|png|webp|svg|bmp)$/i) || attachedMedia.startsWith('data:image');
                  const isAudio = attachedMediaName?.match(/\.(mp3|wav|ogg|m4a|webm|flac|aac)$/i) || attachedMedia.startsWith('data:audio');

                  if (isImage) {
                    const filterCss = (() => {
                      let str = `brightness(${imageBrightness}%) contrast(${imageContrast}%) saturate(${imageSaturate}%) `;
                      if (imageFilter === 'grayscale') str += 'grayscale(100%) ';
                      else if (imageFilter === 'sepia') str += 'sepia(100%) ';
                      else if (imageFilter === 'warm') str += 'saturate(140%) hue-rotate(15deg) ';
                      else if (imageFilter === 'cool') str += 'saturate(110%) hue-rotate(180deg) ';
                      else if (imageFilter === 'contrast') str += 'contrast(170%) ';
                      else if (imageFilter === 'vintage') str += 'sepia(50%) contrast(120%) brightness(90%) ';
                      else if (imageFilter === 'vivid') str += 'brightness(110%) saturate(160%) ';
                      return str;
                    })();

                    const transformCss = `rotate(${imageRotation}deg) scaleX(${imageFlipH ? -1 : 1}) scaleY(${imageFlipV ? -1 : 1})`;

                    return (
                      <div className="p-3 bg-amber-50/90 border border-amber-200 rounded-xl shadow-sm flex flex-col gap-2.5 animate-fade-in relative">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <ImageIcon size={15} className="text-amber-800 shrink-0" />
                            <span className="font-mono text-[10px] font-bold text-amber-900 uppercase tracking-wide">Image Preview & Editor</span>
                            <span className="bg-amber-100 text-amber-900 text-[8px] font-mono px-1.5 py-0.5 rounded font-bold">
                              {attachedMediaName || 'Attached Image'}
                            </span>
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => setIsZoomingImage(true)}
                              className="p-1 rounded text-[#8a8172] hover:text-amber-900 hover:bg-amber-100 transition-colors"
                              title="Full Screen Preview"
                            >
                              <ZoomIn size={14} />
                            </button>
                            <button
                              type="button"
                              onClick={() => setIsEditingImage(!isEditingImage)}
                              className={`px-2 py-0.5 rounded text-[9px] font-mono font-bold flex items-center gap-1 transition-all ${
                                isEditingImage ? 'bg-amber-800 text-white shadow-xs' : 'bg-amber-100 text-amber-900 hover:bg-amber-200'
                              }`}
                            >
                              <Wand2 size={11} />
                              {isEditingImage ? 'Hide Tools' : 'Edit Image'}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setAttachedMedia(null);
                                setAttachedMediaName(null);
                                setImageFilter('none');
                                setImageRotation(0);
                                setImageFlipH(false);
                                setImageFlipV(false);
                                setImageBrightness(100);
                                setImageContrast(100);
                                setImageSaturate(100);
                                setIsEditingImage(false);
                              }}
                              className="text-red-700 hover:bg-red-100 p-1 rounded-full transition-all ml-1"
                              title="Remove Image"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>

                        {/* Image Preview Thumbnail with Real-time CSS Filter & Rotation */}
                        <div className="relative rounded-lg overflow-hidden border border-amber-200 bg-black/10 flex items-center justify-center p-2 min-h-[120px] max-h-[180px]">
                          <img
                            src={attachedMedia || null}
                            alt="Preview"
                            className="max-h-[160px] max-w-full object-contain rounded transition-all duration-200 shadow-sm"
                            style={{
                              filter: filterCss,
                              transform: transformCss
                            }}
                          />
                        </div>

                        {/* Image Editing Panel */}
                        {isEditingImage && (
                          <div className="bg-white/80 border border-amber-200 p-2.5 rounded-lg flex flex-col gap-2.5 text-[9px] font-mono">
                            {/* Filter Presets */}
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-bold text-[#8a8172] uppercase text-[8px] w-12">Filter:</span>
                              {[
                                { id: 'none', label: 'Normal' },
                                { id: 'grayscale', label: 'B&W 🖤' },
                                { id: 'sepia', label: 'Sepia 📜' },
                                { id: 'warm', label: 'Warm 🌅' },
                                { id: 'cool', label: 'Cool ❄️' },
                                { id: 'contrast', label: 'Contrast ⚡' },
                                { id: 'vintage', label: 'Vintage 🔮' },
                                { id: 'vivid', label: 'Vivid 💡' }
                              ].map(f => (
                                <button
                                  key={f.id}
                                  type="button"
                                  onClick={() => setImageFilter(f.id as any)}
                                  className={`px-2 py-0.5 rounded border transition-all ${
                                    imageFilter === f.id
                                      ? 'bg-amber-800 text-white border-amber-800 font-bold shadow-2xs'
                                      : 'bg-white text-stone-700 border-stone-200 hover:border-amber-400'
                                  }`}
                                >
                                  {f.label}
                                </button>
                              ))}
                            </div>

                            {/* Rotation & Flips */}
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-bold text-[#8a8172] uppercase text-[8px] w-12">Transform:</span>
                              <button
                                type="button"
                                onClick={() => setImageRotation((prev) => (prev + 90) % 360)}
                                className="px-2 py-0.5 rounded border border-amber-300 bg-white hover:bg-amber-50 text-amber-900 flex items-center gap-1 font-bold"
                              >
                                <RotateCw size={10} /> Rotate 90° ({imageRotation}°)
                              </button>
                              <button
                                type="button"
                                onClick={() => setImageFlipH(!imageFlipH)}
                                className={`px-2 py-0.5 rounded border flex items-center gap-1 font-bold ${
                                  imageFlipH ? 'bg-amber-800 text-white border-amber-800' : 'bg-white border-amber-300 text-amber-900 hover:bg-amber-50'
                                }`}
                              >
                                <FlipHorizontal size={10} /> Flip Horiz
                              </button>
                              <button
                                type="button"
                                onClick={() => setImageFlipV(!imageFlipV)}
                                className={`px-2 py-0.5 rounded border flex items-center gap-1 font-bold ${
                                  imageFlipV ? 'bg-amber-800 text-white border-amber-800' : 'bg-white border-amber-300 text-amber-900 hover:bg-amber-50'
                                }`}
                              >
                                <FlipVertical size={10} /> Flip Vert
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setImageFilter('none');
                                  setImageRotation(0);
                                  setImageFlipH(false);
                                  setImageFlipV(false);
                                  setImageBrightness(100);
                                  setImageContrast(100);
                                  setImageSaturate(100);
                                }}
                                className="px-2 py-0.5 rounded border border-stone-300 text-stone-600 hover:bg-stone-100 flex items-center gap-1 ml-auto"
                              >
                                <RefreshCw size={10} /> Reset
                              </button>
                            </div>

                            {/* Fine Adjustments Sliders */}
                            <div className="grid grid-cols-3 gap-2 pt-1 border-t border-amber-100">
                              <div className="flex flex-col gap-0.5">
                                <label className="text-[8px] text-[#8a8172] font-bold">Brightness: {imageBrightness}%</label>
                                <input
                                  type="range"
                                  min="50"
                                  max="150"
                                  value={imageBrightness}
                                  onChange={(e) => setImageBrightness(Number(e.target.value))}
                                  className="accent-amber-800 h-1 bg-amber-100 rounded"
                                />
                              </div>
                              <div className="flex flex-col gap-0.5">
                                <label className="text-[8px] text-[#8a8172] font-bold">Contrast: {imageContrast}%</label>
                                <input
                                  type="range"
                                  min="50"
                                  max="150"
                                  value={imageContrast}
                                  onChange={(e) => setImageContrast(Number(e.target.value))}
                                  className="accent-amber-800 h-1 bg-amber-100 rounded"
                                />
                              </div>
                              <div className="flex flex-col gap-0.5">
                                <label className="text-[8px] text-[#8a8172] font-bold">Saturate: {imageSaturate}%</label>
                                <input
                                  type="range"
                                  min="50"
                                  max="200"
                                  value={imageSaturate}
                                  onChange={(e) => setImageSaturate(Number(e.target.value))}
                                  className="accent-amber-800 h-1 bg-amber-100 rounded"
                                />
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  }

                  if (isAudio) {
                    return (
                      <div className="p-3 bg-amber-50/90 border border-amber-200 rounded-xl shadow-sm flex flex-col gap-2.5 animate-fade-in">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Mic size={15} className="text-amber-800 animate-pulse shrink-0" />
                            <span className="font-mono text-[10px] font-bold text-amber-900 uppercase tracking-wide">Audio Preview & Voice Studio</span>
                            <span className="bg-amber-100 text-amber-900 text-[8px] font-mono px-1.5 py-0.5 rounded font-bold truncate max-w-[150px]">
                              {attachedMediaName || 'Audio Recording'}
                            </span>
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => setIsEditingAudio(!isEditingAudio)}
                              className={`px-2 py-0.5 rounded text-[9px] font-mono font-bold flex items-center gap-1 transition-all ${
                                isEditingAudio ? 'bg-amber-800 text-white shadow-xs' : 'bg-amber-100 text-amber-900 hover:bg-amber-200'
                              }`}
                            >
                              <Sliders size={11} />
                              {isEditingAudio ? 'Hide Controls' : 'Audio Tools'}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                stopPreviewPlayback();
                                setAttachedMedia(null);
                                setAttachedMediaName(null);
                                setAudioSpeed(1.0);
                                setAudioEffect('normal');
                                setAudioVolumeBoost(1.0);
                                setAudioTrimStart(0);
                                setAudioTrimEnd(100);
                                setIsEditingAudio(false);
                              }}
                              className="text-red-700 hover:bg-red-100 p-1 rounded-full transition-all ml-1"
                              title="Delete Audio"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>

                        {/* Interactive Waveform / Playback Bar */}
                        <div className="flex items-center gap-3 bg-white border border-amber-200 p-2 rounded-lg">
                          <button
                            type="button"
                            onClick={isPlayingPreview ? stopPreviewPlayback : playPreviewWithEffect}
                            className="w-8 h-8 rounded-full bg-amber-800 hover:bg-amber-900 text-white flex items-center justify-center shrink-0 shadow-sm transition-transform active:scale-95"
                          >
                            {isPlayingPreview ? <Pause size={14} /> : <Play size={14} className="ml-0.5" />}
                          </button>

                          {/* Equalizer Waveform visualizer */}
                          <div className="flex-1 flex items-center gap-1 h-6">
                            {[12, 24, 16, 28, 20, 14, 22, 30, 18, 10, 26, 20, 14, 22].map((height, i) => (
                              <div
                                key={i}
                                className={`flex-1 rounded-full transition-all ${
                                  isPlayingPreview ? 'bg-amber-700 animate-pulse' : 'bg-amber-200'
                                }`}
                                style={{
                                  height: isPlayingPreview ? `${Math.max(6, Math.sin(i + Date.now()/100) * 20 + 12)}px` : `${height}px`
                                }}
                              />
                            ))}
                          </div>

                          <span className="font-mono text-[9px] text-amber-950 font-bold shrink-0">
                            {isPlayingPreview ? '▶ Playing Preview' : 'Ready'}
                          </span>
                        </div>

                        {/* Audio Editor Panel */}
                        {isEditingAudio && (
                          <div className="bg-white/80 border border-amber-200 p-2.5 rounded-lg flex flex-col gap-2.5 text-[9px] font-mono">
                            {/* Speed Selector */}
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-[#8a8172] uppercase text-[8px] w-12">Speed:</span>
                              <div className="flex gap-1">
                                {[0.5, 0.75, 1.0, 1.25, 1.5, 2.0].map((rate) => (
                                  <button
                                    key={rate}
                                    type="button"
                                    onClick={() => {
                                      stopPreviewPlayback();
                                      setAudioSpeed(rate);
                                    }}
                                    className={`px-2 py-0.5 rounded border transition-all ${
                                      audioSpeed === rate
                                        ? 'bg-amber-800 text-white border-amber-800 shadow-2xs font-bold'
                                        : 'bg-white text-stone-700 border-stone-200 hover:border-amber-400'
                                    }`}
                                  >
                                    {rate === 1.0 ? '1.0x Normal' : `${rate}x`}
                                  </button>
                                ))}
                              </div>
                            </div>

                            {/* Sound & Voice Effects */}
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-[#8a8172] uppercase text-[8px] w-12">Effects:</span>
                              <div className="flex flex-wrap gap-1">
                                {[
                                  { id: 'normal', label: 'Normal 🎤' },
                                  { id: 'chipmunk', label: 'Chipmunk 🐿️' },
                                  { id: 'deep', label: 'Deep 🎙️' },
                                  { id: 'echo', label: 'Echo 🔊' },
                                  { id: 'robot', label: 'Robot 🤖' },
                                  { id: 'radio', label: 'Vintage Radio 📻' }
                                ].map((eff) => (
                                  <button
                                    key={eff.id}
                                    type="button"
                                    onClick={() => {
                                      stopPreviewPlayback();
                                      setAudioEffect(eff.id as any);
                                    }}
                                    className={`px-2 py-0.5 rounded border transition-all ${
                                      audioEffect === eff.id
                                        ? 'bg-amber-800 text-white border-amber-800 shadow-2xs font-bold'
                                        : 'bg-white text-stone-700 border-stone-200 hover:border-amber-400'
                                    }`}
                                  >
                                    {eff.label}
                                  </button>
                                ))}
                              </div>
                            </div>

                            {/* Volume Boost */}
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-[#8a8172] uppercase text-[8px] w-12">Volume:</span>
                              <div className="flex gap-1">
                                {[
                                  { val: 1.0, label: '100% 🔈' },
                                  { val: 1.5, label: '150% 🔉' },
                                  { val: 2.0, label: '200% 🔊' }
                                ].map((v) => (
                                  <button
                                    key={v.val}
                                    type="button"
                                    onClick={() => {
                                      stopPreviewPlayback();
                                      setAudioVolumeBoost(v.val);
                                    }}
                                    className={`px-2 py-0.5 rounded border transition-all ${
                                      audioVolumeBoost === v.val
                                        ? 'bg-amber-800 text-white border-amber-800 font-bold shadow-2xs'
                                        : 'bg-white text-stone-700 border-stone-200 hover:border-amber-400'
                                    }`}
                                  >
                                    {v.label}
                                  </button>
                                ))}
                              </div>
                            </div>

                            {/* Audio Trimming */}
                            <div className="flex items-center gap-2 pt-1 border-t border-amber-100">
                              <span className="font-bold text-[#8a8172] uppercase text-[8px] w-12">Trim Bounds:</span>
                              <div className="flex-1 flex items-center gap-2">
                                <label className="text-[8px] text-stone-600 font-bold">Start: {audioTrimStart}%</label>
                                <input
                                  type="range"
                                  min="0"
                                  max={audioTrimEnd - 5}
                                  value={audioTrimStart}
                                  onChange={(e) => {
                                    stopPreviewPlayback();
                                    setAudioTrimStart(Number(e.target.value));
                                  }}
                                  className="accent-amber-800 h-1 bg-amber-100 rounded flex-1"
                                />
                                <label className="text-[8px] text-stone-600 font-bold">End: {audioTrimEnd}%</label>
                                <input
                                  type="range"
                                  min={audioTrimStart + 5}
                                  max="100"
                                  value={audioTrimEnd}
                                  onChange={(e) => {
                                    stopPreviewPlayback();
                                    setAudioTrimEnd(Number(e.target.value));
                                  }}
                                  className="accent-amber-800 h-1 bg-amber-100 rounded flex-1"
                                />
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  }

                  // Non-image, non-audio generic file attachment
                  return (
                    <div className="relative inline-flex items-center gap-2 bg-[#ebdcca]/30 px-3 py-1.5 rounded-lg border border-[#ebdcca] max-w-full shadow-2xs">
                      <Paperclip size={13} className="text-amber-800 shrink-0" />
                      <span className="font-mono text-[10px] text-[#3a342a] truncate max-w-[220px] font-bold">{attachedMediaName}</span>
                      <button
                        type="button"
                        onClick={() => {
                          setAttachedMedia(null);
                          setAttachedMediaName(null);
                        }}
                        className="text-red-700 hover:bg-red-100 rounded-full p-0.5 ml-1"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  );
                })()}

                {/* Floating GIF Picker Card */}
                {showGifPicker && (
                  <div className="p-3 bg-white border border-[#cfcac0] rounded-xl shadow-lg flex flex-col gap-2 max-w-full z-10 max-h-56 overflow-y-auto">
                    <div className="flex items-center justify-between pb-1 border-b border-gray-100">
                      <span className="text-[10px] font-mono font-bold uppercase text-amber-900">✨ Trending Expressive GIFs</span>
                      <button
                        type="button"
                        onClick={() => setShowGifPicker(false)}
                        className="text-gray-400 hover:text-gray-600"
                      >
                        <X size={12} />
                      </button>
                    </div>
                    <div className="grid grid-cols-4 gap-1.5">
                      {TRENDING_GIFS.map((gif) => (
                        <button
                          key={gif.url}
                          type="button"
                          onClick={() => {
                            setAttachedMedia(gif.url);
                            setAttachedMediaName(`${gif.name.toLowerCase().replace(/ /g, '_')}.gif`);
                            setShowGifPicker(false);
                          }}
                          className="relative aspect-video rounded overflow-hidden border border-gray-100 hover:border-amber-500 transition-all group bg-black/5"
                        >
                          <img 
                            src={gif.url || null} 
                            alt={gif.name} 
                            className="w-full h-full object-cover group-hover:scale-105 transition-all duration-200"
                            referrerPolicy="no-referrer"
                          />
                          <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-all">
                            <span className="text-[8px] font-sans text-white text-center px-1 truncate font-bold">{gif.name}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {activeConv?.isBlocked ? (
                  <div className="p-3 bg-rose-50 border border-rose-100 rounded-lg text-center">
                    <p className="text-[10px] font-mono text-rose-800 font-bold uppercase tracking-wide">
                      This conversation is blocked
                    </p>
                    <p className="text-[9px] text-rose-700 font-sans mt-0.5">
                      Unblock this user from the options in the header to resume messaging.
                    </p>
                  </div>
                ) : isMessagingDisabledByRecipient ? (
                  <div className="p-3 bg-amber-50 border border-amber-100 rounded-lg text-center">
                    <p className="text-[10px] font-mono text-amber-800 font-bold uppercase tracking-wide">
                      🔒 Messaging restricted by recipient
                    </p>
                    <p className="text-[9px] text-amber-700 font-sans mt-0.5">
                      This user restricts direct messaging to friends only. Add them as a friend to message them.
                    </p>
                  </div>
                ) : (
                  <form onSubmit={handleSendMessage} className="flex gap-2 items-center">
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleMediaFileChange}
                      className="hidden"
                    />

                    {!isRecording && (
                      <div className="flex gap-0.5 items-center shrink-0">
                        <button
                          type="button"
                          onClick={handleTriggerMediaFile}
                          className="p-2 text-[#8a8172] hover:text-[#3a342a] hover:bg-[#ebdcca]/20 rounded-lg transition-all"
                          title="Attach File/Image"
                          disabled={isSubmitting}
                        >
                          <Paperclip size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => startRecording(false)}
                          className="p-2 text-amber-800 hover:text-amber-950 hover:bg-[#ebdcca]/20 rounded-lg transition-all"
                          title="Record Voice Note"
                          disabled={isSubmitting}
                        >
                          <Mic size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowGifPicker(!showGifPicker)}
                          className={`p-2 rounded-lg transition-all ${
                            showGifPicker 
                              ? 'text-amber-950 bg-[#ebdcca]/45 font-bold' 
                              : 'text-[#8a8172] hover:text-[#3a342a] hover:bg-[#ebdcca]/20'
                          }`}
                          title="Send GIF"
                          disabled={isSubmitting}
                        >
                          <span className="font-mono text-[9px] font-extrabold uppercase tracking-tight">GIF</span>
                        </button>
                      </div>
                    )}

                    {isRecording ? (
                      <div className="flex-1 flex items-center justify-between bg-red-50/95 border border-red-200/50 rounded-lg px-3 py-1.5">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 bg-red-600 rounded-full animate-ping" />
                          <span className="font-mono text-[10px] font-bold text-red-700 uppercase tracking-wider">Recording Voice</span>
                          <span className="font-mono text-[10px] text-red-600 font-bold">({formatDuration(recordingDuration)})</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={cancelRecording}
                            className="text-[9px] font-mono uppercase font-bold text-gray-500 hover:text-gray-800 px-1.5 py-1 hover:bg-gray-100 rounded-md transition-all"
                          >
                            Cancel
                          </button>
                          
                          {/* STOP & EDIT option */}
                          <button
                            type="button"
                            onClick={stopRecording}
                            className="bg-amber-800 text-white text-[9px] font-mono uppercase font-bold px-2 py-1 rounded-md hover:bg-amber-900 shadow-3xs transition-all"
                            title="Stop & Apply effects / Custom playback rate"
                          >
                            Edit
                          </button>

                          {/* STOP & SEND DIRECT OPTION (requested by user) */}
                          <button
                            type="button"
                            onClick={async () => {
                              autoSendRef.current = true;
                              stopRecording();
                            }}
                            className="bg-emerald-600 text-white text-[9px] font-mono uppercase font-bold px-2 py-1 rounded-md hover:bg-emerald-700 shadow-3xs transition-all flex items-center gap-1"
                            title="Send voice note immediately to inbox"
                          >
                            <span>Send</span>
                            <Send size={8} />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        {/* Slash-command palette (bitchat port) */}
                        <AnimatePresence>
                          {textInput.trim().startsWith('/') && !editingMessage && (
                            <motion.div
                              initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }}
                              className="absolute bottom-full left-0 right-0 mb-2 z-30 bg-[#fdfbf7] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-700 rounded-xl shadow-lg p-1.5"
                            >
                              <div className="text-[9px] font-mono uppercase tracking-wider text-[#8a8172] px-2 pb-1">Commands</div>
                              {SLASH_COMMANDS.filter(c => c.cmd.startsWith(textInput.trim().split(' ')[0].toLowerCase())).map(c => (
                                <button
                                  key={c.cmd}
                                  type="button"
                                  onClick={() => runSlashCommand(c.cmd)}
                                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left hover:bg-amber-50 dark:hover:bg-zinc-800 transition-colors"
                                >
                                  <span className="font-mono text-[11px] font-bold text-amber-800 dark:text-amber-400">{c.cmd}</span>
                                  <span className="text-[11px] text-[#5c5446] dark:text-zinc-300">{c.label}</span>
                                </button>
                              ))}
                            </motion.div>
                          )}
                        </AnimatePresence>
                        <input
                          type="text"
                          value={textInput}
                          onChange={(e) => {
                            setTextInput(e.target.value);
                            handleTyping();
                          }}
                          placeholder="Type a message…  ( / for commands )"
                          disabled={isSubmitting}
                          className="flex-1 bg-white border border-[#cfcac0] rounded-lg px-3 py-1.5 text-xs text-[#5c5446] focus:outline-none focus:ring-1 focus:ring-[#8a8172] font-sans"
                        />

                        <button
                          type="submit"
                          disabled={(!textInput.trim() && !attachedMedia) || isSubmitting}
                          className="font-mono text-[9px] uppercase font-bold text-[#f4f1ea] bg-[#3a342a] hover:bg-[#52493b] py-1.5 px-3 rounded-lg shadow-2xs transition-all flex items-center gap-1 disabled:opacity-50 disabled:hover:bg-[#3a342a]"
                        >
                          <Send size={10} />
                          <span>{editingMessage ? "Save" : "Send"}</span>
                        </button>
                      </>
                    )}
                  </form>
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-[#000000]">
              <div className="w-16 h-16 rounded-full bg-[#121215] border border-stone-800 flex items-center justify-center text-zinc-500 mb-4">
                <Users size={32} />
              </div>
              <h4 className="font-bold text-sm text-white mb-1">Gucci Messenger</h4>
              <p className="text-xs text-zinc-400 max-w-xs leading-relaxed mb-4">
                Select a conversation from the sidebar or start a new chat with your friends.
              </p>
              <button
                onClick={() => setShowCreateMenu(true)}
                className="bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs px-4 py-2 rounded-xl transition-all cursor-pointer shadow-lg shadow-indigo-600/20"
              >
                + Start New Chat
              </button>
            </div>
          )}
        </div>

        {/* COLUMN 3: RIGHT INFO PANEL */}
        {activeConv && showInfoPanel && (
          <div className="w-72 border-l border-stone-800/80 bg-[#000000] flex-col hidden lg:flex shrink-0 overflow-y-auto">
            {/* Header */}
            <div className="p-4 border-b border-stone-800/80 flex items-center justify-between">
              <span className="font-bold text-xs text-white uppercase tracking-wider font-mono">Chat Info</span>
              <button
                onClick={() => setShowInfoPanel(false)}
                className="text-zinc-400 hover:text-white p-1 rounded-lg hover:bg-stone-800 transition-colors cursor-pointer"
              >
                <X size={15} />
              </button>
            </div>

            {/* User/Group Profile Card */}
            <div className="p-5 flex flex-col items-center text-center border-b border-stone-800/80 bg-[#050507]">
              <div className="relative mb-3">
                <img
                  src={activeConv.avatarUrl || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80'}
                  alt={activeConv.name || 'Profile'}
                  className="w-20 h-20 rounded-2xl object-cover border-2 border-white/10 shadow-xl"
                />
                {!activeConv.isGroup && (
                  <span className="absolute bottom-0 right-0 w-4 h-4 bg-emerald-500 border-2 border-[#050507] rounded-full" />
                )}
              </div>
              <h3 className="font-bold text-base text-white tracking-tight">{activeConv.name || 'User'}</h3>
              <p className="text-xs text-emerald-400 font-medium mt-0.5">{getParticipantStatusLine(activeConv)}</p>
              {activeConv.description && (
                <p className="text-xs text-zinc-400 mt-2 px-2 line-clamp-3 italic bg-[#0d0d12] p-2 rounded-xl border border-white/5 w-full">
                  "{activeConv.description}"
                </p>
              )}

              {/* Action Buttons */}
              <div className="grid grid-cols-3 gap-2 w-full mt-4">
                <button
                  onClick={() => handleToggleMuteConversation(activeConv)}
                  className="p-2.5 rounded-xl bg-[#121215] hover:bg-[#1f1f28] border border-white/5 text-zinc-300 flex flex-col items-center justify-center gap-1 transition-all cursor-pointer"
                >
                  <VolumeX size={16} className={activeConv.isMuted ? 'text-amber-400' : ''} />
                  <span className="text-[10px] font-medium">{activeConv.isMuted ? 'Unmute' : 'Mute'}</span>
                </button>
                <button
                  onClick={() => setIsSearchingInChat(true)}
                  className="p-2.5 rounded-xl bg-[#121215] hover:bg-[#1f1f28] border border-white/5 text-zinc-300 flex flex-col items-center justify-center gap-1 transition-all cursor-pointer"
                >
                  <Search size={16} />
                  <span className="text-[10px] font-medium">Search</span>
                </button>
                <button
                  onClick={() => handleArchiveConversation(activeConv)}
                  className="p-2.5 rounded-xl bg-[#121215] hover:bg-[#1f1f28] border border-white/5 text-zinc-300 flex flex-col items-center justify-center gap-1 transition-all cursor-pointer"
                >
                  <Archive size={16} />
                  <span className="text-[10px] font-medium">Archive</span>
                </button>
              </div>
            </div>

            {/* Info Tabs: Media, Files, Members */}
            <div className="flex border-b border-stone-800/80 bg-[#000000] p-1 gap-1">
              {(['media', 'files', 'members'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setInfoTab(tab)}
                  className={`flex-1 py-1.5 text-xs font-semibold capitalize rounded-lg transition-all cursor-pointer ${
                    infoTab === tab ? 'bg-[#181622] text-white border border-white/10' : 'text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>

            {/* Tab Content Stream */}
            <div className="p-3 flex-1 overflow-y-auto">
              {infoTab === 'media' && (
                <div className="grid grid-cols-3 gap-1.5">
                  {[
                    'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=300&q=80',
                    'https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=300&q=80',
                    'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?auto=format&fit=crop&w=300&q=80',
                    'https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&w=300&q=80'
                  ].map((img, i) => (
                    <img key={i} src={img || null} alt="Shared" className="w-full aspect-square object-cover rounded-lg border border-white/10 hover:opacity-80 transition-opacity cursor-pointer" />
                  ))}
                </div>
              )}
              {infoTab === 'files' && (
                <div className="space-y-2">
                  <div className="p-2.5 rounded-xl bg-[#121215] border border-white/5 flex items-center gap-2.5">
                    <FileText size={18} className="text-indigo-400 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-white truncate">Project_Brief.pdf</p>
                      <span className="text-[10px] text-zinc-500 font-mono">2.4 MB • Yest</span>
                    </div>
                  </div>
                </div>
              )}
              {infoTab === 'members' && (
                <div className="space-y-2">
                  {activeConv.participants.map((pId) => (
                    <div key={pId} className="flex items-center gap-2.5 p-2 rounded-xl bg-[#0a0a0d] border border-white/5">
                      <div className="w-7 h-7 rounded-full bg-indigo-900/50 text-indigo-300 font-bold text-xs flex items-center justify-center shrink-0">
                        {pId.charAt(0).toUpperCase()}
                      </div>
                      <span className="text-xs text-white font-medium truncate min-w-0">
                        {pId === currentUser.id ? 'You' : pId}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </motion.div>

      {/* MODAL OVERLAY: Create Chat / New Message Menu */}
      <AnimatePresence>
        {showCreateMenu && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#2e2920]/40 backdrop-blur-xs">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[#fcfaf4] border border-[#ebdcca] rounded-2xl p-5 w-full max-w-md shadow-xl flex flex-col max-h-[70vh]"
            >
              {/* Menu Header */}
              <div className="flex items-center justify-between border-b border-[#ebdcca] pb-3 mb-3">
                <div className="flex items-center gap-2">
                  <Users className="text-amber-800" size={15} />
                  <span className="font-mono text-[10px] font-bold text-[#3a342a] uppercase tracking-wider">
                    {isGroupCreate ? 'Create Group Conversation' : 'Start Private Chat'}
                  </span>
                </div>
                <button
                  onClick={() => {
                    setShowCreateMenu(false);
                    setIsGroupCreate(false);
                    setGroupName('');
                    setSelectedParticipants([]);
                  }}
                  className="text-[#8a8172] hover:text-[#3a342a]"
                >
                  <X size={15} />
                </button>
              </div>

              {/* Group / Channel Toggle Tabs */}
              <div className="flex bg-[#ebdcca]/25 rounded-lg p-0.5 mb-3.5">
                <button
                  onClick={() => {
                    setIsGroupCreate(false);
                    setIsChannelCreate(false);
                    setSelectedParticipants([]);
                  }}
                  className={`flex-1 text-center py-1 font-mono text-[9px] uppercase font-bold rounded-md transition-all ${
                    !isGroupCreate && !isChannelCreate ? 'bg-white text-amber-800 shadow-3xs' : 'text-[#8a8172] hover:text-[#3a342a]'
                  }`}
                >
                  1:1 Chat
                </button>
                <button
                  onClick={() => {
                    setIsGroupCreate(true);
                    setIsChannelCreate(false);
                  }}
                  className={`flex-1 text-center py-1 font-mono text-[9px] uppercase font-bold rounded-md transition-all ${
                    isGroupCreate && !isChannelCreate ? 'bg-white text-amber-800 shadow-3xs' : 'text-[#8a8172] hover:text-[#3a342a]'
                  }`}
                >
                  Group Chat
                </button>
                <button
                  onClick={() => {
                    setIsGroupCreate(true);
                    setIsChannelCreate(true);
                  }}
                  className={`flex-1 text-center py-1 font-mono text-[9px] uppercase font-bold rounded-md transition-all ${
                    isChannelCreate ? 'bg-white text-amber-800 shadow-3xs' : 'text-[#8a8172] hover:text-[#3a342a]'
                  }`}
                >
                  📢 Channel
                </button>
              </div>

              {/* Group Name & Description inputs */}
              {(isGroupCreate || isChannelCreate) && (
                <div className="space-y-2 mb-3">
                  <input
                    type="text"
                    value={groupName}
                    onChange={(e) => setGroupName(e.target.value)}
                    placeholder={isChannelCreate ? "Enter Channel Name" : "Enter Group Name"}
                    className="w-full bg-white border border-[#cfcac0] rounded-lg px-3 py-1.5 text-xs text-[#5c5446] focus:outline-none focus:ring-1 focus:ring-[#8a8172] font-sans"
                  />
                  <input
                    type="text"
                    value={groupDescription}
                    onChange={(e) => setGroupDescription(e.target.value)}
                    placeholder="Channel / Group description or topic..."
                    className="w-full bg-white border border-[#cfcac0] rounded-lg px-3 py-1.5 text-xs text-[#5c5446] focus:outline-none focus:ring-1 focus:ring-[#8a8172] font-sans"
                  />
                  {isChannelCreate && (
                    <div className="p-2 bg-amber-50 border border-amber-200 rounded-lg text-[9px] font-mono text-amber-900">
                      📢 Broadcast Channel: Only channel creators and administrators can post messages. Subscribers can read and react.
                    </div>
                  )}
                </div>
              )}

              {/* Search contacts bar */}
              <div className="relative mb-3">
                <Search className="absolute left-2.5 top-2.5 text-[#8a8172]" size={10} />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search network creators..."
                  className="w-full bg-white border border-[#cfcac0] rounded-lg pl-8 pr-3 py-1.5 text-xs text-[#5c5446] focus:outline-none focus:ring-1 focus:ring-[#8a8172] font-sans"
                />
              </div>

              {/* Creators list area */}
              <div className="flex-1 overflow-y-auto min-h-[150px] max-h-[300px] p-1 space-y-1">
                {filteredCreators.length === 0 ? (
                  <p className="text-center text-[10px] text-[#8a8172] py-6 italic font-mono">No matching creators found.</p>
                ) : (
                  filteredCreators.map((creator) => {
                    const isSelected = selectedParticipants.includes(creator.id);

                    return (
                      <button
                        key={creator.id}
                        onClick={() => {
                          if (isGroupCreate) {
                            toggleParticipantSelection(creator.id);
                          } else {
                            handleCreate1to1Chat(creator);
                          }
                        }}
                        className={`w-full p-2 rounded-xl text-left border flex items-center justify-between transition-all ${
                          isSelected 
                            ? 'bg-[#3a342a]/5 border-amber-800' 
                            : 'bg-transparent border-transparent hover:bg-[#ebdcca]/20'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-7 h-7 rounded-full bg-[#ebdcca]/60 flex items-center justify-center font-bold text-[#3a342a] font-mono text-[10px] uppercase">
                            {(creator.name || 'C').charAt(0)}
                          </div>
                          <div className="min-w-0">
                            <span className="block font-sans font-bold text-xs text-[#3a342a] truncate">
                              {creator.name}
                            </span>
                            <span className="block font-sans text-[10px] text-[#8a8172] truncate">
                              {creator.tagline}
                            </span>
                          </div>
                        </div>

                        {isGroupCreate && (
                          <div className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${
                            isSelected ? 'bg-amber-800 border-amber-800' : 'border-[#cfcac0]'
                          }`}>
                            {isSelected && <span className="w-1.5 h-1.5 bg-white rounded-full" />}
                          </div>
                        )}
                      </button>
                    );
                  })
                )}
              </div>

              {/* Trigger button for Group Chat */}
              {isGroupCreate && (
                <div className="mt-4 pt-3 border-t border-[#ebdcca] flex justify-end">
                  <button
                    onClick={handleCreateGroupChat}
                    disabled={!groupName.trim() || (!isOpenGroupCreate && selectedParticipants.length === 0)}
                    className="font-mono text-[9px] uppercase font-bold text-[#f4f1ea] bg-[#3a342a] hover:bg-[#52493b] py-1.5 px-4 rounded-lg shadow-2xs transition-all disabled:opacity-50"
                  >
                    {isOpenGroupCreate ? 'Launch Open Group' : 'Launch Group Chat'}
                  </button>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* SIMULATED AUDIO/VIDEO CALL SYSTEM OVERLAY */}
      <AnimatePresence>
        {activeCall && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-[#2e2920]/80 backdrop-blur-md p-4"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.9, y: 20, opacity: 0 }}
              className="bg-[#1f1b16] border border-[#3e3428] rounded-3xl p-6 w-full max-w-lg shadow-2xl flex flex-col items-center text-center justify-between min-h-[480px] text-white relative overflow-hidden"
            >
              {/* Subtle tech grid background decorations */}
              <div className="absolute inset-0 bg-radial-gradient from-transparent to-[#13110e] opacity-80 pointer-events-none" />
              <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-[#3a342a]/20 to-transparent pointer-events-none" />

              {/* Top Security Line Banner */}
              <div className="z-10 w-full flex flex-col items-center gap-1">
                <div className="flex items-center gap-1.5 bg-[#ebdcca]/10 border border-[#ebdcca]/20 px-3 py-1 rounded-full">
                  <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                  <span className="font-mono text-[8px] uppercase tracking-widest text-[#ebdcca]/80 font-black">
                    Secure E2E Encrypted {activeCall.type} Line
                  </span>
                </div>
                {activeCall.status === 'connected' && (
                  <span className="font-mono text-[9px] uppercase tracking-wider text-emerald-400 font-bold mt-1 animate-pulse">
                    ● Connected
                  </span>
                )}
              </div>

              {/* Middle Section: Avatar, Video, or Audio wave visualization */}
              <div className="z-10 flex-1 w-full flex flex-col items-center justify-center my-6 relative">
                {activeCall.type === 'video' && activeCall.status === 'connected' ? (
                  // Video call layout
                  <div className="w-full h-64 bg-[#13110e] rounded-2xl border border-[#3e3428] relative overflow-hidden flex items-center justify-center">
                    {/* Remote Participant feed (simulated with nice animation and initials bubble) */}
                    <div className="absolute inset-0 flex flex-col items-center justify-center space-y-3">
                      <div className="w-20 h-20 rounded-full bg-amber-800/20 border border-amber-800/40 flex items-center justify-center text-amber-100 font-mono text-3xl font-bold uppercase animate-pulse shadow-lg">
                        {activeCall.recipientName.charAt(0)}
                      </div>
                      <span className="text-xs text-[#8a8172] font-mono tracking-wide">
                        Simulating {activeCall.recipientName}'s Camera Feed
                      </span>
                      {/* Animated audio wave bars reacting to sim remote audio */}
                      <div className="flex items-end gap-1 h-8 mt-2">
                        {[...Array(6)].map((_, i) => (
                          <motion.div
                            key={i}
                            animate={{ height: [8, Math.random() * 24 + 10, 8] }}
                            transition={{ repeat: Infinity, duration: 0.6 + i * 0.1, ease: "easeInOut" }}
                            className="w-1 bg-amber-500 rounded-full"
                          />
                        ))}
                      </div>
                    </div>

                    {/* Local self-preview window in the corner */}
                    {!activeCall.isVideoOff ? (
                      <div className="absolute bottom-3 right-3 w-24 h-32 bg-black rounded-xl border border-white/20 shadow-lg overflow-hidden">
                        <video
                          ref={localVideoRef}
                          autoPlay
                          playsInline
                          muted
                          className="w-full h-full object-cover"
                        />
                        <span className="absolute bottom-1 left-1.5 font-mono text-[7px] text-white bg-black/60 px-1 rounded">
                          You (Live)
                        </span>
                      </div>
                    ) : (
                      <div className="absolute bottom-3 right-3 w-24 h-32 bg-slate-900 rounded-xl border border-white/10 shadow-lg flex items-center justify-center text-slate-500">
                        <Camera size={16} className="opacity-40" />
                      </div>
                    )}
                  </div>
                ) : (
                  // Audio Call / Dialing Layout
                  <div className="flex flex-col items-center space-y-4">
                    {/* Ringing waves */}
                    <div className="relative flex items-center justify-center">
                      {(activeCall.status === 'dialing' || activeCall.status === 'ringing') && (
                        <>
                          <span className="absolute inset-0 rounded-full border border-amber-500/20 animate-ping" />
                          <span className="absolute -inset-4 rounded-full border border-amber-500/15 animate-ping delay-300" />
                          <span className="absolute -inset-8 rounded-full border border-amber-500/10 animate-ping delay-700" />
                        </>
                      )}
                      
                      {/* Recipient Avatar Initials */}
                      <div className="w-24 h-24 rounded-full bg-amber-800 text-[#f4f1ea] border-2 border-amber-900 flex items-center justify-center font-bold text-3xl font-mono uppercase shadow-xl relative z-10">
                        {activeCall.recipientName.charAt(0)}
                      </div>
                    </div>

                    <div className="space-y-1 text-center">
                      <h4 className="font-display font-bold text-lg text-amber-100 tracking-tight">
                        {activeCall.recipientName}
                      </h4>
                      <p className="text-[10px] font-mono uppercase tracking-wider text-[#8a8172]">
                        {activeCall.status === 'dialing' && 'Dialing Out...'}
                        {activeCall.status === 'ringing' && 'Ringing...'}
                        {activeCall.status === 'connected' && 'SECURE VOICE SESSION'}
                        {activeCall.status === 'disconnected' && 'Call Terminated'}
                      </p>
                    </div>

                    {/* Interactive Animated Waveform for Connected Audio Call */}
                    {activeCall.status === 'connected' && (
                      <div className="flex items-center gap-1.5 h-10 px-6 mt-4">
                        {[...Array(12)].map((_, i) => (
                          <motion.div
                            key={i}
                            animate={{ height: [4, Math.random() * 32 + 8, 4] }}
                            transition={{ repeat: Infinity, duration: 0.5 + i * 0.08, ease: "easeInOut" }}
                            className="w-1 bg-amber-500 rounded-full"
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Bottom Section: Call Timer or Hangup Confirmation */}
              <div className="z-10 w-full flex flex-col items-center gap-5 mt-4">
                {activeCall.status === 'connected' && (
                  <div className="font-mono text-sm tracking-widest text-[#ebdcca] bg-white/5 border border-white/10 px-4 py-1.5 rounded-full shadow-inner font-bold">
                    {formatDuration(activeCall.duration)}
                  </div>
                )}

                {activeCall.status === 'disconnected' && (
                  <div className="font-mono text-xs text-rose-500 font-bold">
                    Total Duration: {formatDuration(activeCall.duration)}
                  </div>
                )}

                {/* Call Controls row */}
                <div className="flex items-center gap-4">
                  {/* Mute Button */}
                  {activeCall.status === 'connected' && (
                    <button
                      onClick={() => setActiveCall(prev => prev ? { ...prev, isMuted: !prev.isMuted } : null)}
                      className={`p-3 rounded-full border transition-all ${
                        activeCall.isMuted
                          ? 'bg-rose-950/80 border-rose-800 text-rose-500 hover:bg-rose-900 shadow-3xs'
                          : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10'
                      }`}
                      title={activeCall.isMuted ? 'Unmute Mic' : 'Mute Mic'}
                    >
                      {activeCall.isMuted ? <MicOff size={16} /> : <Mic size={16} />}
                    </button>
                  )}

                  {/* Hang Up Button */}
                  <button
                    onClick={() => {
                      setActiveCall(prev => prev ? { ...prev, status: 'disconnected' } : null);
                      setTimeout(() => {
                        setActiveCall(null);
                      }, 1500);
                    }}
                    className="p-4 rounded-full bg-rose-600 hover:bg-rose-700 text-white shadow-lg transition-transform hover:scale-110 active:scale-95 duration-200"
                    title="End Call"
                  >
                    <PhoneOff size={20} />
                  </button>

                  {/* Camera Toggle Button */}
                  {activeCall.status === 'connected' && activeCall.type === 'video' && (
                    <button
                      onClick={() => setActiveCall(prev => prev ? { ...prev, isVideoOff: !prev.isVideoOff } : null)}
                      className={`p-3 rounded-full border transition-all ${
                        activeCall.isVideoOff
                          ? 'bg-rose-950/80 border-rose-800 text-rose-500 hover:bg-rose-900 shadow-3xs'
                          : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10'
                      }`}
                      title={activeCall.isVideoOff ? 'Turn Camera On' : 'Turn Camera Off'}
                    >
                      {activeCall.isVideoOff ? <Camera size={16} className="stroke-rose-500" /> : <Camera size={16} />}
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
        {/* Full screen Image Lightbox */}
        {isZoomingImage && attachedMedia && (
          <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex flex-col items-center justify-center p-4">
            <button
              type="button"
              onClick={() => setIsZoomingImage(false)}
              className="absolute top-4 right-4 text-white hover:text-amber-200 p-2 rounded-full bg-white/10 hover:bg-white/20 transition-all z-10"
            >
              <X size={20} />
            </button>
            <img
              src={attachedMedia || null}
              alt="Zoomed"
              className="max-h-[85vh] max-w-[90vw] object-contain rounded-xl shadow-2xl"
              style={{
                filter: (() => {
                  let str = `brightness(${imageBrightness}%) contrast(${imageContrast}%) saturate(${imageSaturate}%) `;
                  if (imageFilter === 'grayscale') str += 'grayscale(100%) ';
                  else if (imageFilter === 'sepia') str += 'sepia(100%) ';
                  else if (imageFilter === 'warm') str += 'saturate(140%) hue-rotate(15deg) ';
                  else if (imageFilter === 'cool') str += 'saturate(110%) hue-rotate(180deg) ';
                  else if (imageFilter === 'contrast') str += 'contrast(170%) ';
                  else if (imageFilter === 'vintage') str += 'sepia(50%) contrast(120%) brightness(90%) ';
                  else if (imageFilter === 'vivid') str += 'brightness(110%) saturate(160%) ';
                  return str;
                })(),
                transform: `rotate(${imageRotation}deg) scaleX(${imageFlipH ? -1 : 1}) scaleY(${imageFlipV ? -1 : 1})`
              }}
            />
          </div>
        )}

        {/* MODAL OVERLAY: Create Poll */}
        {showPollModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[#fcfaf4] border border-[#ebdcca] rounded-2xl p-5 w-full max-w-md shadow-2xl space-y-4"
            >
              <div className="flex items-center justify-between border-b border-[#ebdcca] pb-3">
                <div className="flex items-center gap-2">
                  <BarChart2 className="text-amber-800" size={16} />
                  <span className="font-mono text-xs font-bold text-[#3a342a] uppercase">Create Group Poll</span>
                </div>
                <button onClick={() => setShowPollModal(false)} className="text-[#8a8172] hover:text-[#3a342a]">
                  <X size={16} />
                </button>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-[10px] font-mono uppercase font-bold text-[#8a8172] mb-1">Poll Question</label>
                  <input
                    type="text"
                    value={pollQuestion}
                    onChange={(e) => setPollQuestion(e.target.value)}
                    placeholder="Ask a question..."
                    className="w-full bg-white border border-[#cfcac0] rounded-lg px-3 py-1.5 text-xs text-[#5c5446] focus:outline-none focus:ring-1 focus:ring-amber-800 font-sans"
                  />
                </div>

                <div className="space-y-2">
                  <label className="block text-[10px] font-mono uppercase font-bold text-[#8a8172]">Options</label>
                  {pollOptions.map((opt, idx) => (
                    <div key={idx} className="flex gap-2">
                      <input
                        type="text"
                        value={opt}
                        onChange={(e) => {
                          const next = [...pollOptions];
                          next[idx] = e.target.value;
                          setPollOptions(next);
                        }}
                        placeholder={`Option ${idx + 1}`}
                        className="flex-1 bg-white border border-[#cfcac0] rounded-lg px-3 py-1.5 text-xs text-[#5c5446] focus:outline-none focus:ring-1 focus:ring-amber-800 font-sans"
                      />
                      {pollOptions.length > 2 && (
                        <button
                          onClick={() => setPollOptions(pollOptions.filter((_, i) => i !== idx))}
                          className="text-rose-600 hover:bg-rose-50 p-1.5 rounded-lg border border-transparent"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  ))}
                  {pollOptions.length < 10 && (
                    <button
                      onClick={() => setPollOptions([...pollOptions, ''])}
                      className="text-xs font-mono font-bold text-amber-800 hover:underline flex items-center gap-1 pt-1"
                    >
                      + Add Option
                    </button>
                  )}
                </div>

                <label className="flex items-center gap-2 cursor-pointer pt-2 border-t border-[#ebdcca]">
                  <input
                    type="checkbox"
                    checked={pollIsAnonymous}
                    onChange={(e) => setPollIsAnonymous(e.target.checked)}
                    className="accent-amber-800 rounded"
                  />
                  <span className="text-xs font-sans text-[#3a342a]">Anonymous Voting</span>
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => setShowPollModal(false)}
                  className="px-3 py-1.5 font-mono text-xs font-bold text-[#8a8172] hover:bg-stone-200 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSendPoll}
                  disabled={!pollQuestion.trim() || pollOptions.filter(o => o.trim()).length < 2}
                  className="px-4 py-1.5 font-mono text-xs uppercase font-bold text-[#f4f1ea] bg-amber-800 hover:bg-amber-900 rounded-lg shadow-xs disabled:opacity-50"
                >
                  Create Poll
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {/* MODAL OVERLAY: Invite Link & QR Code */}
        {showInviteModal && activeConv && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[#fcfaf4] border border-[#ebdcca] rounded-2xl p-5 w-full max-w-sm shadow-2xl space-y-4 text-center"
            >
              <div className="flex items-center justify-between border-b border-[#ebdcca] pb-3 text-left">
                <div className="flex items-center gap-2">
                  <QrCode className="text-amber-800" size={16} />
                  <span className="font-mono text-xs font-bold text-[#3a342a] uppercase">Group Invite & QR</span>
                </div>
                <button onClick={() => setShowInviteModal(false)} className="text-[#8a8172] hover:text-[#3a342a]">
                  <X size={16} />
                </button>
              </div>

              <div className="flex flex-col items-center justify-center p-3 bg-white border border-[#ebdcca] rounded-xl shadow-inner">
                <canvas ref={qrCanvasRef} className="w-44 h-44 rounded-lg bg-white p-1" />
                <span className="mt-2 font-mono text-[10px] text-amber-900 font-bold uppercase">Scan to Join Group</span>
              </div>

              <div className="space-y-1 text-left">
                <label className="block text-[10px] font-mono uppercase font-bold text-[#8a8172]">Invite Code</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    readOnly
                    value={activeConv.joinCode || activeConv.id}
                    className="flex-1 bg-stone-100 border border-[#cfcac0] rounded-lg px-3 py-1.5 font-mono text-xs text-[#3a342a] font-bold"
                  />
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(activeConv.joinCode || activeConv.id);
                      alert('Invite code copied to clipboard!');
                    }}
                    className="px-3 py-1.5 font-mono text-xs font-bold text-white bg-amber-800 hover:bg-amber-900 rounded-lg"
                  >
                    Copy
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}

        {/* MODAL OVERLAY: Forward Message */}
        {showForwardModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[#fcfaf4] border border-[#ebdcca] rounded-2xl p-5 w-full max-w-sm shadow-2xl space-y-4"
            >
              <div className="flex items-center justify-between border-b border-[#ebdcca] pb-3">
                <div className="flex items-center gap-2">
                  <Share2 className="text-amber-800" size={16} />
                  <span className="font-mono text-xs font-bold text-[#3a342a] uppercase">Forward Message</span>
                </div>
                <button onClick={() => setShowForwardModal(null)} className="text-[#8a8172] hover:text-[#3a342a]">
                  <X size={16} />
                </button>
              </div>

              <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-xl text-xs font-sans text-stone-800 italic">
                "{showForwardModal.text || 'Attached Media'}"
              </div>

              <div className="space-y-2 max-h-60 overflow-y-auto">
                <label className="block text-[10px] font-mono uppercase font-bold text-[#8a8172]">Select Destination Chat</label>
                {conversations.filter(c => c.id !== activeConv?.id).map(conv => (
                  <button
                    key={conv.id}
                    onClick={() => handleForwardMessage(conv.id)}
                    className="w-full p-2.5 rounded-xl border border-[#ebdcca] hover:border-amber-800 bg-white hover:bg-amber-50 text-left transition-all flex items-center justify-between"
                  >
                    <span className="font-sans text-xs font-bold text-[#3a342a] truncate">{conv.name}</span>
                    <Share2 size={12} className="text-amber-800" />
                  </button>
                ))}
              </div>
            </motion.div>
          </div>
        )}

        {/* MODAL OVERLAY: Report System */}
        {showReportModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[#fcfaf4] border border-[#ebdcca] rounded-2xl p-5 w-full max-w-sm shadow-2xl space-y-4"
            >
              <div className="flex items-center justify-between border-b border-[#ebdcca] pb-3">
                <div className="flex items-center gap-2">
                  <Flag className="text-rose-600" size={16} />
                  <span className="font-mono text-xs font-bold text-[#3a342a] uppercase">Report Content / User</span>
                </div>
                <button onClick={() => setShowReportModal(null)} className="text-[#8a8172] hover:text-[#3a342a]">
                  <X size={16} />
                </button>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-[10px] font-mono uppercase font-bold text-[#8a8172] mb-1">Reason for Report</label>
                  <select
                    value={reportReason}
                    onChange={(e) => setReportReason(e.target.value)}
                    className="w-full bg-white border border-[#cfcac0] rounded-lg px-3 py-1.5 text-xs text-[#5c5446] focus:outline-none focus:ring-1 focus:ring-amber-800 font-sans"
                  >
                    <option value="spam">Spam or Unsolicited Promotion</option>
                    <option value="harassment">Harassment or Bullying</option>
                    <option value="inappropriate">Inappropriate Media Content</option>
                    <option value="impersonation">Impersonation / Fake Account</option>
                    <option value="other">Other</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-mono uppercase font-bold text-[#8a8172] mb-1">Additional Details (Optional)</label>
                  <textarea
                    value={reportDetails}
                    onChange={(e) => setReportDetails(e.target.value)}
                    rows={3}
                    placeholder="Provide any context..."
                    className="w-full bg-white border border-[#cfcac0] rounded-lg p-2 text-xs text-[#5c5446] focus:outline-none focus:ring-1 focus:ring-amber-800 font-sans"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-[#ebdcca]">
                <button
                  onClick={() => setShowReportModal(null)}
                  className="px-3 py-1.5 font-mono text-xs font-bold text-[#8a8172] hover:bg-stone-200 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSubmitReport}
                  className="px-4 py-1.5 font-mono text-xs uppercase font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-lg shadow-xs"
                >
                  Submit Report
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Watch Together modal */}
      {showWatchTogether && activeConv && (
        <WatchTogetherModal
          conversationId={activeConv.id}
          socket={socketRef.current}
          onClose={() => setShowWatchTogether(false)}
        />
      )}

      {/* Saved messages & notes panel */}
      {showSavedPanel && (
        <SavedMessagesPanel token={token} onClose={() => setShowSavedPanel(false)} />
      )}

      {/* Schedule message modal */}
      <AnimatePresence>
        {showScheduleModal && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[80] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setShowScheduleModal(false)}
          >
            <motion.div
              initial={{ scale: 0.94, y: 12 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.94, y: 12 }}
              className="bg-[#fcfaf4] dark:bg-zinc-900 rounded-[1.75rem] p-6 w-full max-w-md border-2 border-[#ebdcca] dark:border-zinc-800 space-y-3 shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <h3 className="font-display font-bold text-[#3a342a] dark:text-zinc-100 flex items-center gap-2">
                  <CalendarClock size={16} className="text-amber-800 dark:text-amber-400" /> Schedule Message
                </h3>
                <button onClick={() => setShowScheduleModal(false)} className="text-[#8a8172] hover:text-[#3a342a]"><X size={16} /></button>
              </div>
              <textarea
                value={scheduleText}
                onChange={e => setScheduleText(e.target.value)}
                rows={3}
                placeholder="Message to send later…"
                className="w-full bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 rounded-xl px-3 py-2 text-sm text-[#3a342a] dark:text-zinc-100 outline-none focus:border-amber-400 resize-none"
              />
              <input
                type="datetime-local"
                value={scheduleAt}
                onChange={e => setScheduleAt(e.target.value)}
                className="w-full bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 rounded-xl px-3 py-2 text-sm outline-none focus:border-amber-400"
              />
              <button
                onClick={handleScheduleMessage}
                className="w-full font-mono text-[10px] uppercase font-bold tracking-wider py-2.5 rounded-xl bg-amber-800 text-white dark:bg-amber-400 dark:text-zinc-900 hover:bg-amber-900 transition-all"
              >
                Schedule
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Group join-request moderation panel */}
      <AnimatePresence>
        {showJoinRequests && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[80] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setShowJoinRequests(false)}
          >
            <motion.div
              initial={{ scale: 0.94, y: 12 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.94, y: 12 }}
              className="bg-[#fcfaf4] dark:bg-zinc-900 rounded-[1.75rem] p-6 w-full max-w-md border-2 border-[#ebdcca] dark:border-zinc-800 space-y-3 shadow-2xl max-h-[70vh] overflow-y-auto"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <h3 className="font-display font-bold text-[#3a342a] dark:text-zinc-100 flex items-center gap-2">
                  <Users size={16} className="text-amber-800 dark:text-amber-400" /> Join Requests
                </h3>
                <button onClick={() => setShowJoinRequests(false)} className="text-[#8a8172] hover:text-[#3a342a]"><X size={16} /></button>
              </div>
              {joinRequests.length === 0 ? (
                <p className="text-xs text-[#8a8172] py-6 text-center">No pending join requests.</p>
              ) : (
                <div className="space-y-2">
                  {joinRequests.map((r: any) => (
                    <div key={r.id} className="flex items-center gap-3 rounded-xl border border-[#ebdcca] dark:border-zinc-700 p-3">
                      <div className="w-9 h-9 rounded-full bg-[#ebdcca]/50 dark:bg-zinc-800 flex items-center justify-center text-[#5c5446]">
                        <User size={15} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-[#3a342a] dark:text-zinc-100 truncate">{r.userName}</p>
                        <p className="text-[10px] font-mono text-[#8a8172]">{new Date(r.createdAt).toLocaleString()}</p>
                      </div>
                      <div className="flex gap-1.5">
                        <button
                          onClick={() => handleJoinRequest(r.id, true)}
                          className="font-mono text-[9px] uppercase font-bold tracking-wider py-1.5 px-3 rounded-lg bg-emerald-700 text-white hover:bg-emerald-800"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => handleJoinRequest(r.id, false)}
                          className="font-mono text-[9px] uppercase font-bold tracking-wider py-1.5 px-3 rounded-lg bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800 hover:bg-red-200"
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );

  if (currentUser.isLocationVerified === false) {
    const warningContent = (
      <div className="flex flex-col items-center justify-center p-8 text-center h-[50vh] md:h-[60vh] bg-[#fcfaf4] border border-[#ebdcca] rounded-3xl w-full max-w-4xl mx-auto shadow-md">
        <div className="w-14 h-14 rounded-full bg-amber-50 flex items-center justify-center text-amber-800 mb-4 animate-bounce">
          <ShieldAlert size={24} />
        </div>
        <h3 className="font-display font-bold text-base text-[#3a342a] uppercase tracking-wide">
          Region Verification Required
        </h3>
        <p className="font-sans text-[11px] text-[#5c5446] max-w-md mt-2 leading-relaxed">
          Cozy Secure Chat requires an official Region-Locked ID to verify your physical location alignment before unlocking direct messaging and custom group features.
        </p>
        <p className="font-mono text-[9px] uppercase tracking-wider text-amber-800 font-bold mt-4">
          📍 Please verify your location in the dashboard header to begin.
        </p>
      </div>
    );

    if (isInline) {
      return warningContent;
    }

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#2e2920]/60 backdrop-blur-xs">
        <div className="relative w-full max-w-md">
          {onClose && (
            <button
              onClick={onClose}
              className="absolute top-4 right-4 text-[#8a8172] hover:text-[#3a342a] z-55 bg-white/80 p-1.5 rounded-full shadow-xs hover:bg-[#ebdcca]/20 transition-all"
            >
              <X size={16} />
            </button>
          )}
          {warningContent}
        </div>
      </div>
    );
  }

  // 1:1 audio/video calls run on the self-contained engine provided at the App
  // root (CallEngineProvider). The Jitsi iframe is offered for GROUP chats only
  // (multi-party), gated to activeConv.isGroup so 1:1 calls never touch it.

  if (isInline) {
    return (
      <>
        {renderAll()}
        {showJitsiMeeting && activeConv?.isGroup && (
          <JitsiMeeting
            roomName={`ocean-${activeConv.id || 'meeting'}`}
            displayName={currentUser.name || 'Guest'}
            onClose={() => setShowJitsiMeeting(false)}
          />
        )}
      </>
    );
  }

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#2e2920]/60 backdrop-blur-xs">
        {renderAll()}
      </div>
      {showJitsiMeeting && activeConv?.isGroup && (
        <JitsiMeeting
          roomName={`ocean-${activeConv.id || 'meeting'}`}
          displayName={currentUser.name || 'Guest'}
          onClose={() => setShowJitsiMeeting(false)}
        />
      )}
    </>
  );
}
