import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Send, CornerDownRight, Smile, Image as ImageIcon, Star, Repeat, Bookmark, Share2, Heart, Trash2, Clock, MessageSquare, AlertCircle, MoreVertical, Edit, Mic, Volume2, Play, StopCircle, Check, Unlock, BarChart2, Eye } from 'lucide-react';
import { Post, Comment } from '../types';
import { getRelativeTime } from '../App';
import TimeCapsuleLock from './TimeCapsuleLock';
import { NSFWMediaGuard } from './NSFWMediaGuard';

// Audio Effects & Rendering Utilities
async function renderAudioWithEffect(originalDataUrl: string, effect: 'normal' | 'chipmunk' | 'deep' | 'echo', speed: number): Promise<string> {
  if (effect === 'normal' && speed === 1.0) {
    return originalDataUrl;
  }

  const response = await fetch(originalDataUrl);
  const arrayBuffer = await response.arrayBuffer();
  
  const decodeCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  const audioBuffer = await decodeCtx.decodeAudioData(arrayBuffer);
  await decodeCtx.close();

  const sampleRate = audioBuffer.sampleRate;
  
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
    dryGain.connect(offlineCtx.destination);

    source.connect(delay);
    delay.connect(feedback);
    feedback.connect(delay);

    delay.connect(wetGain);
    wetGain.connect(offlineCtx.destination);
  } else {
    source.connect(offlineCtx.destination);
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

interface CommentsModalProps {
  post: Post;
  currentUserName: string;
  isLoggedIn: boolean;
  commenterName: string;
  onCommenterNameChange: (name: string) => void;
  onClose: () => void;
  onRefreshPost: (updatedPost: Post) => void;
  token?: string | null;
  followers?: any[];
  onProfileClick?: (creatorId: string) => void;
  isActingAsAnonymous?: boolean;
  currentUserId?: string;
  currentUserAvatarUrl?: string;
  followingIds?: string[];
  onFollowToggle?: (creatorId: string) => void;
  onLikePost?: (postId: string) => void;
  onRepostPost?: (post: Post) => void;
  onSharePost?: (post: Post) => void;
  onDeletePost?: (postId: string) => void;
}

function PostTimestamp({ post }: { post: Post }) {
  const [showAbsolute, setShowAbsolute] = useState(false);

  const getPostDateObject = (): Date => {
    if (post.lockedAtDate) {
      const d = new Date(post.lockedAtDate);
      if (!isNaN(d.getTime())) return d;
    }
    const match = post.id?.match(/post-(\d+)/);
    if (match) {
      const ms = Number(match[1]);
      if (!isNaN(ms)) {
        return new Date(ms);
      }
    }
    if (post.date) {
      const d = new Date(post.date);
      if (!isNaN(d.getTime())) return d;
    }
    return new Date();
  };

  const dateObj = getPostDateObject();

  const getRelativeString = (): string => {
    return getRelativeTime(post);
  };

  const getAbsoluteString = (): string => {
    try {
      const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'long' });
      const dateStr = dateObj.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
      const timeStr = dateObj.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      return `${dayName}, ${dateStr} at ${timeStr}`;
    } catch (e) {
      return dateObj.toLocaleString();
    }
  };

  return (
    <span 
      onClick={(e) => {
        e.stopPropagation();
        setShowAbsolute(!showAbsolute);
      }}
      className="font-mono text-[8px] text-[#8a8172] hover:text-[#3a342a] hover:underline cursor-pointer select-none transition-all duration-150 inline-block mt-0.5"
      title="Click to view uploaded date, day & time"
    >
      {showAbsolute ? `📅 ${getAbsoluteString()}` : `⏳ ${getRelativeString()}`}
    </span>
  );
}

export default function CommentsModal({
  post,
  currentUserName,
  isLoggedIn,
  commenterName,
  onCommenterNameChange,
  onClose,
  onRefreshPost,
  token,
  followers = [],
  onProfileClick,
  isActingAsAnonymous = false,
  currentUserId,
  currentUserAvatarUrl,
  followingIds = [],
  onFollowToggle,
  onLikePost,
  onRepostPost,
  onSharePost,
  onDeletePost,
}: CommentsModalProps) {
  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState<Comment | null>(null);
  const [localCommenter, setLocalCommenter] = useState(commenterName);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [commentImage, setCommentImage] = useState<string | null>(null);
  const [showCommentGifPicker, setShowCommentGifPicker] = useState(false);
  const [showAnalytics, setShowAnalytics] = useState(false);
  
  // Voice Recording states & refs
  const [commentAudio, setCommentAudio] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const autoSubmitCommentRef = useRef<boolean>(false);

  // Audio Editor options state
  const [audioSpeed, setAudioSpeed] = useState<number>(1.0);
  const [audioEffect, setAudioEffect] = useState<'normal' | 'chipmunk' | 'deep' | 'echo'>('normal');
  const [isPlayingPreview, setIsPlayingPreview] = useState(false);
  const activePreviewSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const previewAudioCtxRef = useRef<AudioContext | null>(null);

  const playPreviewWithEffect = async () => {
    if (!commentAudio) return;
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

      const response = await fetch(commentAudio);
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer);

      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;

      let speedFactor = audioSpeed;
      if (audioEffect === 'chipmunk') speedFactor *= 1.35;
      if (audioEffect === 'deep') speedFactor *= 0.72;

      source.playbackRate.value = speedFactor;

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
        dryGain.connect(ctx.destination);

        source.connect(delay);
        delay.connect(feedback);
        feedback.connect(delay);

        delay.connect(wetGain);
        wetGain.connect(ctx.destination);
      } else {
        source.connect(ctx.destination);
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

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.onloadend = async () => {
          const audioUrl = reader.result as string;
          if (autoSubmitCommentRef.current) {
            autoSubmitCommentRef.current = false;
            try {
              setIsSubmitting(true);
              const sender = getSenderName();
              const headers: Record<string, string> = { 'Content-Type': 'application/json' };
              if (token) {
                headers['Authorization'] = `Bearer ${token}`;
              }
              if (isActingAsAnonymous) {
                headers['X-Acting-As-Anonymous'] = 'true';
              }
              const response = await fetch(`/api/posts/${post.id}/comment`, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                  senderName: sender,
                  text: text.trim(),
                  parentId: replyTo ? replyTo.id : null,
                  audioUrl: audioUrl,
                }),
              });
              if (response.ok) {
                const data = await response.json();
                const updatedPost: Post = { ...post, comments: data.comments };
                onRefreshPost(updatedPost);
                setText('');
                setReplyTo(null);
                setCommentAudio(null);
                window.dispatchEvent(new CustomEvent('show-toast', { detail: { message: "🎙️ Voice comment posted directly!" } }));
              } else {
                window.dispatchEvent(new CustomEvent('show-toast', { detail: { message: "⚠️ Failed to send direct voice comment." } }));
              }
            } catch (err) {
              console.error("Direct voice comment error:", err);
            } finally {
              setIsSubmitting(false);
            }
          } else {
            setCommentAudio(audioUrl);
            setAudioSpeed(1.0);
            setAudioEffect('normal');
          }
        };
        reader.readAsDataURL(audioBlob);

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

  const [showMentions, setShowMentions] = useState(false);
  const [mentionFilter, setMentionFilter] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setText(val);
    const cursor = e.target.selectionStart || 0;
    const textBefore = val.slice(0, cursor);
    const match = textBefore.match(/!([a-zA-Z0-9_]*)$/);
    if (match) {
      setShowMentions(true);
      setMentionFilter(match[1]);
    } else {
      setShowMentions(false);
    }
  };

  const handleSelectMention = (username: string) => {
    if (!inputRef.current) return;
    const cursor = inputRef.current.selectionStart || 0;
    const textBefore = text.slice(0, cursor);
    const textAfter = text.slice(cursor);
    const match = textBefore.match(/!([a-zA-Z0-9_]*)$/);
    if (match) {
      const mentionStart = cursor - match[0].length;
      const newText = text.slice(0, mentionStart) + `!${username} ` + textAfter;
      setText(newText);
      setShowMentions(false);
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          const newCursorPos = mentionStart + username.length + 2; // ! + username + space
          inputRef.current.setSelectionRange(newCursorPos, newCursorPos);
        }
      }, 50);
    }
  };

  // Sync prop changes for commenter name
  useEffect(() => {
    setLocalCommenter(commenterName);
  }, [commenterName]);

  // Handle auto-focus of input when replying
  useEffect(() => {
    if (replyTo && inputRef.current) {
      inputRef.current.focus();
    }
  }, [replyTo]);

  // Popular reactions available
  const AVAILABLE_EMOJIS = ['👍', '❤️', '😂', '🔥', '😮'];

  // Identify sender name
  const getSenderName = () => {
    if (isLoggedIn && currentUserName) return currentUserName;
    return localCommenter.trim() || 'Anonymous Guest';
  };

  const handleTriggerFile = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setCommentImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  // Submit comment or reply
  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!text.trim() && !commentImage && !commentAudio) return;

    setIsSubmitting(true);
    const sender = getSenderName();

    // Persist local commenter name if changed
    if (!isLoggedIn && localCommenter.trim()) {
      onCommenterNameChange(localCommenter.trim());
    }

    let finalAudioUrl = commentAudio;

    try {
      if (commentAudio && (audioEffect !== 'normal' || audioSpeed !== 1.0)) {
        try {
          window.dispatchEvent(new CustomEvent('show-toast', { detail: { message: "✨ Polishing & baking comment audio..." } }));
          finalAudioUrl = await renderAudioWithEffect(commentAudio, audioEffect, audioSpeed);
        } catch (err) {
          console.error("Failed to render audio with effect:", err);
        }
      }

      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      if (isActingAsAnonymous) {
        headers['X-Acting-As-Anonymous'] = 'true';
      }
      const response = await fetch(`/api/posts/${post.id}/comment`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          senderName: sender,
          text: text.trim(),
          parentId: replyTo ? replyTo.id : null,
          image: commentImage || undefined,
          audioUrl: finalAudioUrl || undefined,
        }),
      });

      if (response && response.ok) {
        const data = await response.json();
        const updatedPost: Post = { ...post, comments: data.comments };
        onRefreshPost(updatedPost);
        setText('');
        setCommentImage(null);
        setCommentAudio(null);
        setReplyTo(null);
        setAudioSpeed(1.0);
        setAudioEffect('normal');
        // Scroll to bottom after a short delay
        setTimeout(() => {
          if (scrollContainerRef.current) {
            scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
          }
        }, 100);
      } else {
        throw new Error("Server response was not ok, invoking local fallback");
      }
    } catch (err) {
      console.warn('Error adding comment, using local fallback:', err);
      
      const newComment: Comment = {
        id: `local-comment-${Date.now()}`,
        senderName: sender,
        text: text.trim(),
        timestamp: new Date().toISOString(),
        parentId: replyTo ? replyTo.id : null,
        image: commentImage || undefined,
        audioUrl: finalAudioUrl || undefined,
        reactions: {}
      };

      const updatedComments = [...(post.comments || []), newComment];

      const updatedPost: Post = { ...post, comments: updatedComments };
      onRefreshPost(updatedPost);
      setText('');
      setCommentImage(null);
      setCommentAudio(null);
      setReplyTo(null);
      setAudioSpeed(1.0);
      setAudioEffect('normal');
      
      setTimeout(() => {
        if (scrollContainerRef.current) {
          scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
        }
      }, 100);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Toggle emoji reaction
  const handleReact = async (commentId: string, emoji: string) => {
    const sender = getSenderName();
    if (!isLoggedIn && !localCommenter.trim()) {
      // Prompt for guest name if they try to react without a name
      const promptedName = prompt("Please enter your name to react:", "Guest");
      if (!promptedName || !promptedName.trim()) return;
      onCommenterNameChange(promptedName.trim());
      setLocalCommenter(promptedName.trim());
    }

    const finalSender = isLoggedIn ? currentUserName : (localCommenter.trim() || 'Guest');
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    if (isActingAsAnonymous) {
      headers['X-Acting-As-Anonymous'] = 'true';
    }

    try {
      const response = await fetch(`/api/posts/${post.id}/comments/${commentId}/react`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          emoji,
          senderName: finalSender,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const updatedPost: Post = { ...post, comments: data.comments };
        onRefreshPost(updatedPost);
      }
    } catch (err) {
      console.error('Error toggling reaction:', err);
    }
  };

  const handleEditComment = async (commentId: string, newText: string) => {
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      if (isActingAsAnonymous) {
        headers['X-Acting-As-Anonymous'] = 'true';
      }
      const response = await fetch(`/api/posts/${post.id}/comments/${commentId}/edit`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          text: newText,
          senderName: getSenderName(),
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const updatedPost: Post = { ...post, comments: data.comments };
        onRefreshPost(updatedPost);
      }
    } catch (err) {
      console.error('Error editing comment:', err);
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      if (isActingAsAnonymous) {
        headers['X-Acting-As-Anonymous'] = 'true';
      }
      const response = await fetch(`/api/posts/${post.id}/comments/${commentId}/delete`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          senderName: getSenderName(),
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const updatedPost: Post = { ...post, comments: data.comments };
        onRefreshPost(updatedPost);
      }
    } catch (err) {
      console.error('Error deleting comment:', err);
    }
  };

  const comments = post.comments || [];
  const isCapsuleLocked = post.isTimeCapsule && post.unlockDate && (new Date(post.unlockDate).getTime() > Date.now());
  const isPostOwner = !!(
    (currentUserId && (
      post.creator?.id === currentUserId || 
      post.authorId === currentUserId || 
      (post as any).userId === currentUserId ||
      post.anonymousCreatorId === currentUserId
    )) ||
    (currentUserName && (post.creator?.name === currentUserName || post.creator?.name === 'Anonymous Guest' || post.creator?.name === 'User')) ||
    (!post.creator?.id && isLoggedIn)
  );
  
  // Group comments hierarchically
  const topLevelComments = comments.filter(c => !c.parentId);
  const getRepliesFor = (parentId: string) => comments.filter(c => c.parentId === parentId);

  // Analytics computation
  const likesCount = post.likes || 0;
  const commentsCount = comments.length;
  const repostsCount = post.repostsCount || 0;
  const sharesCount = post.sharesCount !== undefined ? post.sharesCount : Math.max(0, Math.floor(likesCount * 0.3));
  const clicksCount = post.clicksCount !== undefined ? post.clicksCount : likesCount * 2 + commentsCount * 3 + repostsCount * 4 + 4;
  const impressionsCount = post.impressionsCount !== undefined ? post.impressionsCount : clicksCount * 4 + 12;
  const totalEngagements = likesCount + commentsCount + repostsCount + sharesCount + clicksCount;

  const chartData = post.impressionsData || [
    { date: 'Day 1', value: Math.max(1, Math.floor(impressionsCount * 0.1)) },
    { date: 'Day 2', value: Math.max(1, Math.floor(impressionsCount * 0.12)) },
    { date: 'Day 3', value: Math.max(1, Math.floor(impressionsCount * 0.15)) },
    { date: 'Day 4', value: Math.max(1, Math.floor(impressionsCount * 0.2)) },
    { date: 'Day 5', value: Math.max(1, Math.floor(impressionsCount * 0.13)) },
    { date: 'Day 6', value: Math.max(1, Math.floor(impressionsCount * 0.18)) },
    { date: 'Day 7', value: Math.max(1, Math.floor(impressionsCount * 0.25)) }
  ];

  const rawCountries = post.viewsByCountry || {
    "Bangladesh": Math.ceil(impressionsCount * 0.75),
    "United States": Math.ceil(impressionsCount * 0.15),
    "United Kingdom": Math.max(1, Math.floor(impressionsCount * 0.10))
  };

  const countriesList = Object.entries(rawCountries)
    .map(([name, count]) => ({ name, count: count as number }))
    .sort((a, b) => b.count - a.count);

  const totalCountryViews = countriesList.reduce((sum, c) => sum + c.count, 0) || 1;

  const countryFlags: Record<string, string> = {
    "Bangladesh": "🇧🇩",
    "United States": "🇺🇸",
    "United Kingdom": "🇬🇧",
    "Canada": "🇨🇦",
    "Germany": "🇩🇪",
    "Australia": "🇦🇺",
    "India": "🇮🇳"
  };

  const renderSVGChart = () => {
    const width = 360;
    const height = 110;
    const paddingLeft = 24;
    const paddingRight = 12;
    const paddingTop = 12;
    const paddingBottom = 16;

    const maxVal = Math.max(...chartData.map(d => d.value), 5);

    const points = chartData.map((d, i) => {
      const x = paddingLeft + (i / (chartData.length - 1)) * (width - paddingLeft - paddingRight);
      const y = height - paddingBottom - (d.value / maxVal) * (height - paddingTop - paddingBottom);
      return { x, y, date: d.date, value: d.value };
    });

    const linePath = points.reduce((acc, p, i) => {
      return i === 0 ? `M ${p.x} ${p.y}` : `${acc} L ${p.x} ${p.y}`;
    }, "");

    const areaPath = points.length > 0 ? `
      ${linePath}
      L ${points[points.length - 1].x} ${height - paddingBottom}
      L ${points[0].x} ${height - paddingBottom}
      Z
    ` : "";

    return (
      <div className="bg-[#fcfbf9] border border-[#ebdcca]/50 p-3.5 rounded-2xl shadow-3xs space-y-2">
        <div className="flex items-center justify-between text-[9px] font-mono font-bold text-[#8a8172] uppercase tracking-wider">
          <span>Views Trend (7 Days)</span>
          <span className="text-amber-900 bg-amber-50 border border-amber-200/40 px-2 py-0.5 rounded-md">Total: {impressionsCount}</span>
        </div>
        <div className="relative w-full overflow-hidden">
          <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto select-none overflow-visible">
            <defs>
              <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#b45309" stopOpacity="0.15" />
                <stop offset="100%" stopColor="#b45309" stopOpacity="0.0" />
              </linearGradient>
            </defs>

            {[0, 0.5, 1].map((ratio, i) => {
              const y = paddingTop + ratio * (height - paddingTop - paddingBottom);
              return (
                <line
                  key={i}
                  x1={paddingLeft}
                  y1={y}
                  x2={width - paddingRight}
                  y2={y}
                  stroke="#ebdcca"
                  strokeOpacity="0.5"
                  strokeDasharray="2,2"
                />
              );
            })}

            {[0, 0.5, 1].map((ratio, i) => {
              const val = Math.round((1 - ratio) * maxVal);
              const y = paddingTop + ratio * (height - paddingTop - paddingBottom) + 3;
              return (
                <text
                  key={i}
                  x={paddingLeft - 5}
                  y={y}
                  fill="#8a8172"
                  fontSize="7"
                  fontFamily="monospace"
                  textAnchor="end"
                  fontWeight="bold"
                >
                  {val}
                </text>
              );
            })}

            <path d={areaPath} fill="url(#areaGradient)" />
            <path d={linePath} fill="none" stroke="#b45309" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />

            {points.map((p, i) => (
              <g key={i} className="group cursor-pointer">
                <circle
                  cx={p.x}
                  cy={p.y}
                  r="3"
                  fill="#fff"
                  stroke="#b45309"
                  strokeWidth="1.25"
                  className="transition-all duration-150 hover:r-[4.5px] hover:stroke-amber-900"
                />
                <text
                  x={p.x}
                  y={p.y - 6}
                  fill="#78350f"
                  fontSize="7"
                  fontFamily="monospace"
                  textAnchor="middle"
                  fontWeight="bold"
                  className="opacity-0 group-hover:opacity-100 transition-opacity duration-150"
                >
                  {p.value}
                </text>
                <text
                  x={p.x}
                  y={height - 4}
                  fill="#8a8172"
                  fontSize="7"
                  fontFamily="monospace"
                  textAnchor="middle"
                  fontWeight="bold"
                >
                  {p.date}
                </text>
              </g>
            ))}
          </svg>
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-0">
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-stone-900/50 backdrop-blur-xs"
      />

      {/* Modal Content */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        transition={{ type: 'spring', duration: 0.4 }}
        className="relative w-full h-full bg-[#fdfbf7] overflow-hidden flex flex-col"
      >
        {/* Header */}
        <div className="p-3 border-b border-[#ebdcca] flex items-center justify-between bg-[#fbf9f4]">
          <div className="flex items-center gap-2">
            <ImageIcon size={13} className="text-amber-800" />
            <span className="font-mono text-[10px] font-bold text-[#3a342a] uppercase tracking-wider">
              Discussion Thread ({comments.length})
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-[#8a8172] hover:text-[#3a342a] hover:bg-[#ebdcca]/30 p-1 rounded-full transition-all"
          >
            <X size={15} />
          </button>
        </div>

        {/* Comments Stream */}
        <div
          ref={scrollContainerRef}
          className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-[#ebdcca] scrollbar-track-transparent flex flex-col bg-white"
        >
          {/* Main Original Post (Unifying post detail exactly like Image 2) */}
          <div className={`border-b border-[#ebdcca]/30 transition-colors ${
            (post.isTimeCapsule && !isCapsuleLocked)
              ? 'bg-emerald-50/20 border-emerald-600/30'
              : 'bg-white'
          }`}>
            {/* Header: User Profile details */}
            <div className="px-4 py-3 flex items-center justify-between">
              <div 
                onClick={() => {
                  if (onProfileClick && post.creator?.id) {
                    onProfileClick(post.creator.id);
                  }
                }}
                className="flex items-center gap-2.5 cursor-pointer hover:opacity-85 transition-opacity"
              >
                <div className="w-8 h-8 rounded-full bg-[#ebdcca] flex items-center justify-center font-mono text-xs text-[#5c5446] font-bold uppercase overflow-hidden border border-[#cfcac0]/30">
                  {post.creator?.avatarUrl ? (
                    <img src={post.creator.avatarUrl || null} alt={post.creator.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  ) : (
                    (post.creator?.name || 'M').charAt(0)
                  )}
                </div>
                <div className="flex flex-col text-left">
                  <span className="font-sans font-bold text-xs text-[#3a342a] leading-tight">
                    {post.isAnonymous ? 'Anonymous Member' : (post.creator?.name || 'member')}
                  </span>
                  <PostTimestamp post={post} />
                </div>
              </div>

              {/* Follow Button if not acting as anonymous & not own post */}
              {onFollowToggle && post.creator && currentUserId !== post.creator.id && !post.isAnonymous && (
                <button
                  type="button"
                  onClick={() => onFollowToggle(post.creator!.id)}
                  className={`font-mono text-[9px] uppercase font-bold py-1 px-3 rounded-full border transition-all ${
                    followingIds.includes(post.creator.id) 
                      ? 'bg-stone-100 text-stone-600 border-stone-200 hover:bg-rose-50 hover:text-rose-700' 
                      : 'bg-[#1c1811] text-white border-black hover:bg-stone-800'
                  }`}
                >
                  {followingIds.includes(post.creator.id) ? 'Following' : 'Follow'}
                </button>
              )}
            </div>

            {post.isTimeCapsule && !isCapsuleLocked && (
              <div className="px-4 py-2 bg-emerald-100/30 border-y border-emerald-600/10 flex flex-wrap items-center justify-between text-emerald-800 font-mono text-[8px] tracking-wider uppercase font-bold gap-2">
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

              <>
                {/* Media Content - STRICTLY FULL BLEED wall-to-wall */}
                <div className="w-full border-y border-[#ebdcca]/10 bg-[#fdfbf7]">
                  {post.imageUrl ? (
                    <div className="flex items-center justify-center relative overflow-hidden">
                      <NSFWMediaGuard
                        src={post.imageUrl}
                        alt={post.title || 'Post Attachment'}
                        isNsfw={post.isNsfw || post.nsfwVerdict === 'blur'}
                      />
                    </div>
                  ) : post.videoUrl ? (
                    <div className="bg-black flex items-center justify-center relative overflow-hidden">
                      <video src={post.videoUrl || null} controls playsInline preload="metadata" className="w-full h-auto max-h-[450px]" />
                    </div>
                  ) : post.audioUrl ? (
                    <div className="p-4 bg-[#fbf9f4]">
                      <audio src={post.audioUrl || null} controls className="w-full brightness-95" />
                    </div>
                  ) : null}
                </div>

                {/* Details: Title & Description */}
                <div className="px-4 py-3.5 space-y-1.5 text-left bg-white">
                  {post.title && (
                    <h3 className="font-sans font-bold text-sm text-[#3a342a] tracking-tight leading-snug">
                      {post.title}
                    </h3>
                  )}
                  {post.content && (
                    <p className="text-xs text-[#5c5446] leading-relaxed font-sans whitespace-pre-wrap">
                      {post.content}
                    </p>
                  )}
                </div>
              </>

            {/* Action Buttons: Star (React) & Repost */}
            <div className="px-4 py-3 border-t border-[#ebdcca]/10 flex items-center justify-between bg-white">
              <div className="flex items-center gap-4">
                {/* Star Reaction */}
                {onLikePost && (
                  <button
                    type="button"
                    onClick={() => onLikePost(post.id)}
                    className={`flex items-center gap-1.5 transition-colors group text-xs ${
                      currentUserId && post.likedBy?.includes(currentUserId) ? 'text-amber-500' : 'text-[#8a8172] hover:text-amber-500'
                    }`}
                  >
                    <Star 
                      size={16} 
                      className={currentUserId && post.likedBy?.includes(currentUserId) ? 'fill-amber-400 stroke-amber-500' : 'stroke-[#8a8172]'} 
                    />
                    <span className="font-mono text-[10px] font-bold">
                      {post.likes || 0}
                    </span>
                  </button>
                )}

                {/* Repost */}
                {onRepostPost && (
                  <button
                    type="button"
                    onClick={() => onRepostPost(post)}
                    className="text-[#8a8172] hover:text-amber-800 transition-colors flex items-center gap-1"
                    title="Repost"
                  >
                    <Repeat size={15} />
                  </button>
                )}

                {/* Share */}
                {onSharePost && (
                  <button
                    type="button"
                    onClick={() => {
                      onSharePost(post);
                      // Send API request to increment share count on server too!
                      fetch(`/api/posts/${post.id}/share`, { method: 'POST' }).catch(err => console.warn(err));
                    }}
                    className="text-[#8a8172] hover:text-[#3a342a] transition-colors"
                    title="Share"
                  >
                    <Share2 size={15} />
                  </button>
                )}

                {/* Post Analytics (Only visible to post owner) */}
                {isPostOwner && (
                  <button
                    type="button"
                    onClick={() => setShowAnalytics(!showAnalytics)}
                    className={`transition-colors flex items-center gap-1.5 px-2 py-1 rounded-full border ${
                      showAnalytics 
                        ? 'text-amber-900 bg-amber-100 border-amber-300 shadow-3xs' 
                        : 'text-[#8a8172] bg-white hover:text-amber-800 border-[#ebdcca]/50 hover:bg-amber-50/20'
                    }`}
                    title="View Publication Insights"
                  >
                    <BarChart2 size={13} className="shrink-0" />
                    <span className="font-mono text-[8.5px] font-bold uppercase tracking-wider">Insights</span>
                  </button>
                )}
              </div>

              {/* Trash/Delete if owned */}
              {onDeletePost && currentUserId && post.creator?.id === currentUserId && (
                <button
                  type="button"
                  onClick={() => {
                    onDeletePost(post.id);
                    onClose();
                  }}
                  className="text-rose-500 hover:text-rose-700 hover:bg-rose-50 p-1 rounded-lg transition-all"
                  title="Delete Post"
                >
                  <Trash2 size={15} />
                </button>
              )}
            </div>
          </div>

          {/* Comments Section Title */}
          {showAnalytics ? (
            <div className="px-4 pt-4 pb-2 bg-[#fdfbf7] border-b border-[#ebdcca]/20 flex items-center justify-between animate-fade-in">
              <span className="font-sans font-bold text-[10px] text-amber-950 uppercase tracking-wider">
                Publication Insights
              </span>
              <span className="font-mono text-[8px] text-[#8a8172] uppercase font-bold bg-amber-50 px-1.5 py-0.5 rounded-md">
                Author Only
              </span>
            </div>
          ) : (
            <div className="px-4 pt-4 pb-2 bg-[#fdfbf7] border-b border-[#ebdcca]/20 flex items-center justify-between">
              <span className="font-sans font-bold text-[10px] text-[#8a8172] uppercase tracking-wider">
                Comments ({comments.length})
              </span>
            </div>
          )}

          {/* Comments List Wrapper with side padding */}
          {showAnalytics ? (
            /* Publication Insights Content Panel */
            <div className="p-4 space-y-4 bg-[#fbf9f4] flex-1 overflow-y-auto animate-fade-in">
              {/* 1. Total Engagements & Metrics list */}
              <div className="space-y-2">
                <div className="flex items-center justify-between border-b border-[#ebdcca]/40 pb-1">
                  <span className="font-sans font-extrabold text-xs text-[#3a342a]">{totalEngagements} {totalEngagements === 1 ? 'Engagement' : 'Engagements'}</span>
                  <span className="font-mono text-[8.5px] text-[#8a8172] font-bold uppercase">Overview</span>
                </div>
                
                <div className="space-y-2 bg-[#fcfbf9] border border-[#ebdcca]/40 rounded-2xl p-4 shadow-3xs">
                  {[
                    { name: 'Reactions', value: likesCount, icon: <Star size={12} className="text-amber-700 fill-amber-100 shrink-0" /> },
                    { name: 'Comments', value: commentsCount, icon: <MessageSquare size={12} className="text-amber-700 shrink-0" /> },
                    { name: 'Reposts', value: repostsCount, icon: <Repeat size={12} className="text-amber-700 shrink-0" /> },
                    { name: 'Shares', value: sharesCount, icon: <Share2 size={12} className="text-amber-700 shrink-0" /> },
                    { name: 'Impressions', value: impressionsCount, icon: <Eye size={12} className="text-amber-700 shrink-0" /> },
                    { name: 'Clicks', value: clicksCount, icon: <BarChart2 size={12} className="text-amber-700 shrink-0" /> }
                  ].map((metric, idx) => (
                    <div key={idx} className="flex items-center justify-between py-2 border-b border-stone-100 last:border-0 font-mono text-xs font-bold">
                      <div className="flex items-center gap-2 text-[#5c5446]">
                        {metric.icon}
                        <span>{metric.name}</span>
                      </div>
                      <span className="font-extrabold text-[#3a342a]">{metric.value}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* 2. Impressions 7-Day SVG Chart */}
              {renderSVGChart()}

              {/* 3. Country / Region Breakdown */}
              <div className="space-y-2">
                <div className="flex items-center justify-between border-b border-[#ebdcca]/40 pb-1">
                  <span className="font-sans font-extrabold text-xs text-[#3a342a]">Views by Country</span>
                  <span className="font-mono text-[8.5px] text-[#8a8172] font-bold uppercase">Geography</span>
                </div>

                <div className="bg-[#fcfbf9] border border-[#ebdcca]/40 rounded-2xl p-4 shadow-3xs space-y-2.5">
                  <div className="flex items-center justify-between text-[8px] font-mono font-bold text-[#8a8172] uppercase tracking-wider border-b border-[#ebdcca]/20 pb-1.5">
                    <span>Country / Region</span>
                    <span>Percentage</span>
                  </div>
                  <div className="space-y-2">
                    {countriesList.map((country, idx) => {
                      const pct = totalCountryViews > 0 ? Math.round((country.count / totalCountryViews) * 100) : 0;
                      const flag = countryFlags[country.name] || "🏳️";
                      return (
                        <div key={idx} className="flex items-center justify-between text-xs font-mono">
                          <div className="flex items-center gap-2 text-[#3a342a] font-bold">
                            <span className="text-sm leading-none">{flag}</span>
                            <span>{country.name}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="font-mono text-xs font-extrabold text-[#3a342a]">
                              {country.count} • {pct}%
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-4 space-y-3 bg-white flex-1">
            {topLevelComments.length === 0 ? (
              <div className="text-center py-6 px-3">
                <p className="text-xs text-[#8a8172] font-mono italic">No comments yet. Write one below!</p>
              </div>
            ) : (
              <div className="space-y-3">
                {topLevelComments.map(comment => {
                  const replies = getRepliesFor(comment.id);

                  return (
                    <div key={comment.id} className="space-y-1.5">
                      {/* Top Level Comment */}
                      <CommentCard
                        comment={comment}
                        level={0}
                        availableEmojis={AVAILABLE_EMOJIS}
                        currentUserName={getSenderName()}
                        onReact={(emoji) => handleReact(comment.id, emoji)}
                        onReply={() => setReplyTo(comment)}
                        onProfileClick={onProfileClick}
                        currentUserId={currentUserId}
                        currentUserAvatarUrl={currentUserAvatarUrl}
                        onEditComment={handleEditComment}
                        onDeleteComment={handleDeleteComment}
                        postCreatorId={post.creator?.id}
                      />

                      {/* Level 1 Replies */}
                      {replies.length > 0 && (
                        <div className="pl-2 border-l border-[#ebdcca] ml-1.5 space-y-1.5 relative">
                          {replies.map(reply1 => {
                            const replies2 = getRepliesFor(reply1.id);

                            return (
                              <div key={reply1.id} className="space-y-1.5 relative">
                                <div className="absolute -left-2 top-2.5 w-2 h-px bg-[#ebdcca]" />
                                <CommentCard
                                  comment={reply1}
                                  level={1}
                                  availableEmojis={AVAILABLE_EMOJIS}
                                  currentUserName={getSenderName()}
                                  onReact={(emoji) => handleReact(reply1.id, emoji)}
                                  onReply={() => setReplyTo(reply1)}
                                  onProfileClick={onProfileClick}
                                  currentUserId={currentUserId}
                                  currentUserAvatarUrl={currentUserAvatarUrl}
                                  onEditComment={handleEditComment}
                                  onDeleteComment={handleDeleteComment}
                                  postCreatorId={post.creator?.id}
                                />

                                {/* Level 2 Replies (Replies to reply) */}
                                {replies2.length > 0 && (
                                  <div className="pl-2 border-l border-[#ebdcca]/80 ml-1.5 space-y-1.5 relative">
                                    {replies2.map(reply2 => {
                                      const replies3 = getRepliesFor(reply2.id);

                                      return (
                                        <div key={reply2.id} className="space-y-1.5 relative">
                                          <div className="absolute -left-2 top-2.5 w-2 h-px bg-[#ebdcca]/80" />
                                          <CommentCard
                                            comment={reply2}
                                            level={2}
                                            availableEmojis={AVAILABLE_EMOJIS}
                                            currentUserName={getSenderName()}
                                            onReact={(emoji) => handleReact(reply2.id, emoji)}
                                            onReply={() => setReplyTo(reply2)}
                                            onProfileClick={onProfileClick}
                                            currentUserId={currentUserId}
                                            currentUserAvatarUrl={currentUserAvatarUrl}
                                            onEditComment={handleEditComment}
                                            onDeleteComment={handleDeleteComment}
                                            postCreatorId={post.creator?.id}
                                          />

                                          {/* Level 3 Replies */}
                                          {replies3.length > 0 && (
                                            <div className="pl-2 border-l border-[#ebdcca]/60 ml-1.5 space-y-1.5 relative">
                                              {replies3.map(reply3 => (
                                                <div key={reply3.id} className="relative">
                                                  <div className="absolute -left-2 top-2.5 w-2 h-px bg-[#ebdcca]/60" />
                                                  <CommentCard
                                                    comment={reply3}
                                                    level={3}
                                                    availableEmojis={AVAILABLE_EMOJIS}
                                                    currentUserName={getSenderName()}
                                                    onReact={(emoji) => handleReact(reply3.id, emoji)}
                                                    onReply={() => setReplyTo(reply2)} // Flattens nicely into parent reply level
                                                    onProfileClick={onProfileClick}
                                                    currentUserId={currentUserId}
                                                    currentUserAvatarUrl={currentUserAvatarUrl}
                                                    onEditComment={handleEditComment}
                                                    onDeleteComment={handleDeleteComment}
                                                    postCreatorId={post.creator?.id}
                                                  />
                                                </div>
                                              ))}
                                            </div>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          )}
        </div>

        {/* Footer with Input form */}
        {!showAnalytics && (
          <div className="p-3.5 border-t border-[#ebdcca] bg-[#fbf9f4] space-y-2">
          {/* Replying Status Banner */}
          <AnimatePresence>
            {replyTo && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="flex items-center justify-between bg-[#3a342a]/5 text-[#3a342a] px-2.5 py-1 rounded-lg text-[10px] font-mono"
              >
                <div className="flex items-center gap-1">
                  <CornerDownRight size={10} className="text-amber-800" />
                  <span>Replying to <strong className="font-sans">{replyTo.senderName}</strong></span>
                </div>
                <button
                  onClick={() => setReplyTo(null)}
                  className="text-[#8a8172] hover:text-[#3a342a] uppercase font-bold text-[8px] hover:underline"
                >
                  Cancel
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-2">
            {/* Identity line for guests */}
            {!isLoggedIn && (
              <div className="flex items-center gap-2">
                <span className="text-[9px] font-mono text-[#8a8172] uppercase font-bold shrink-0">
                  Comment as:
                </span>
                <input
                  type="text"
                  value={localCommenter}
                  onChange={(e) => {
                    setLocalCommenter(e.target.value);
                    onCommenterNameChange(e.target.value);
                  }}
                  placeholder="Anonymous Guest"
                  className="bg-white border border-[#cfcac0] rounded-md px-2 py-0.5 text-xs text-[#5c5446] focus:outline-none focus:ring-1 focus:ring-[#8a8172] w-40 font-sans"
                />
              </div>
            )}

            {/* Attachment preview */}
            {commentImage && (
              <div className="relative inline-block mt-1">
                <img src={commentImage || null} className="max-h-20 w-auto object-contain rounded border border-[#ebdcca]" />
                <button
                  type="button"
                  onClick={() => setCommentImage(null)}
                  className="absolute -top-1.5 -right-1.5 bg-red-100 text-red-700 hover:bg-red-200 rounded-full p-0.5 border border-red-300 shadow-sm"
                >
                  <X size={10} />
                </button>
              </div>
            )}

            {/* Voice message dynamic editor panel */}
            {commentAudio && (
              <div className="p-3 mb-2 bg-amber-50/90 border border-amber-200 rounded-lg shadow-sm flex flex-col gap-2 animate-fade-in">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Mic size={14} className="text-amber-800 animate-pulse" />
                    <span className="font-mono text-[10px] font-bold text-amber-900 uppercase">Voice Comment Editor</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      stopPreviewPlayback();
                      setCommentAudio(null);
                    }}
                    className="text-red-700 hover:bg-red-50 p-1 rounded-full transition-all"
                    title="Delete Recording"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>

                {/* Speed Selector */}
                <div className="flex items-center gap-2">
                  <span className="text-[9px] font-mono font-bold text-[#8a8172] uppercase w-12">Speed:</span>
                  <div className="flex gap-1">
                    {[0.5, 1.0, 1.5, 2.0].map((rate) => (
                      <button
                        key={rate}
                        type="button"
                        onClick={() => {
                          stopPreviewPlayback();
                          setAudioSpeed(rate);
                        }}
                        className={`px-2 py-0.5 text-[9px] font-mono rounded-md border transition-all ${
                          audioSpeed === rate
                            ? 'bg-amber-800 text-white border-amber-800 shadow-3xs font-bold'
                            : 'bg-white text-gray-700 border-gray-200 hover:border-amber-500'
                        }`}
                      >
                        {rate === 1.0 ? 'Normal' : `${rate}x`}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Voice Effect Selector */}
                <div className="flex items-center gap-2">
                  <span className="text-[9px] font-mono font-bold text-[#8a8172] uppercase w-12">Effect:</span>
                  <div className="flex flex-wrap gap-1">
                    {[
                      { id: 'normal', label: 'Normal 🎤' },
                      { id: 'chipmunk', label: 'Chipmunk 🐿️' },
                      { id: 'deep', label: 'Deep 🎙️' },
                      { id: 'echo', label: 'Echo 🔊' }
                    ].map((effect) => (
                      <button
                        key={effect.id}
                        type="button"
                        onClick={() => {
                          stopPreviewPlayback();
                          setAudioEffect(effect.id as any);
                        }}
                        className={`px-2 py-0.5 text-[9px] font-mono rounded-md border transition-all ${
                          audioEffect === effect.id
                            ? 'bg-amber-800 text-white border-amber-800 shadow-3xs font-bold'
                            : 'bg-white text-gray-700 border-gray-200 hover:border-amber-500'
                        }`}
                      >
                        {effect.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Audio Preview Controls */}
                <div className="flex items-center justify-between bg-white border border-amber-100 rounded px-2.5 py-1.5">
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={isPlayingPreview ? stopPreviewPlayback : playPreviewWithEffect}
                      className="p-1 text-amber-800 hover:text-white hover:bg-amber-800 rounded-md transition-all shrink-0"
                      title="Preview effects"
                    >
                      {isPlayingPreview ? (
                        <span className="font-mono text-[9px] font-bold uppercase tracking-wider px-1">Stop Preview</span>
                      ) : (
                        <span className="font-mono text-[9px] font-bold uppercase tracking-wider px-1">▶ Play Preview</span>
                      )}
                    </button>
                    <span className="text-[8px] font-mono text-[#8a8172] uppercase">
                      (Bakes speed & effects automatically on send)
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Comment GIF Picker Panel */}
            {showCommentGifPicker && (
              <div className="bg-white border border-[#ebdcca] rounded-xl p-3 space-y-2 max-h-52 overflow-y-auto shadow-md">
                <div className="flex items-center justify-between border-b border-[#ebdcca]/50 pb-1.5">
                  <span className="font-mono text-[8px] font-bold text-[#8a8172] uppercase">⚡ Choose Trending GIF Comment</span>
                  <button
                    type="button"
                    onClick={() => setShowCommentGifPicker(false)}
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
                        setCommentImage(gif.url);
                        setShowCommentGifPicker(false);
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

            <div className="relative flex gap-2 items-center">
              {!isRecording ? (
                <>
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    accept="image/*"
                    className="hidden"
                  />
                  <div className="flex items-center gap-0.5">
                    <button
                      type="button"
                      onClick={handleTriggerFile}
                      className="p-2 text-[#8a8172] hover:text-[#3a342a] hover:bg-[#ebdcca]/30 rounded-lg transition-colors"
                      title="Add Image"
                    >
                      <ImageIcon size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={startRecording}
                      className="p-2 text-amber-800 hover:text-amber-950 hover:bg-[#ebdcca]/30 rounded-lg transition-colors"
                      title="Record Voice Comment"
                    >
                      <Mic size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowCommentGifPicker(!showCommentGifPicker)}
                      className={`px-1.5 py-1 rounded-md text-[10px] font-sans font-black tracking-tight transition-all hover:bg-[#ebdcca]/35 ${
                        showCommentGifPicker ? 'text-white bg-amber-800' : 'text-[#8a8172]'
                      }`}
                      title="Send GIF"
                    >
                      GIF
                    </button>
                  </div>

                  <input
                    ref={inputRef}
                    type="text"
                    value={text}
                    onChange={handleInputChange}
                    placeholder={replyTo ? `Write a reply...` : isLoggedIn ? "Write a comment..." : "Type your comment..."}
                    disabled={isSubmitting}
                    className="flex-1 bg-white border border-[#cfcac0] rounded-lg px-2.5 py-1.5 text-xs text-[#5c5446] focus:outline-none focus:ring-1 focus:ring-[#8a8172] font-sans"
                  />
                </>
              ) : (
                <div className="flex-1 flex items-center justify-between bg-red-50/95 border border-red-200/50 rounded-lg px-3 py-1.5">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 bg-red-600 rounded-full animate-ping" />
                    <span className="font-mono text-[10px] font-bold text-red-700 uppercase tracking-wider">Recording Voice</span>
                    <span className="font-mono text-[9px] font-bold text-red-600 bg-red-100/80 px-1.5 py-0.5 rounded-sm">
                      {formatDuration(recordingDuration)}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={cancelRecording}
                      className="text-[9px] font-mono uppercase font-bold text-gray-500 hover:text-gray-800 px-1.5 py-1 hover:bg-gray-100 rounded-md transition-all"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={stopRecording}
                      className="bg-amber-800 text-white text-[9px] font-mono uppercase font-bold px-2 py-1 rounded-md hover:bg-amber-900 shadow-3xs transition-all"
                      title="Stop & Apply effects / Custom playback rate"
                    >
                      Edit & Attach
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        autoSubmitCommentRef.current = true;
                        stopRecording();
                      }}
                      className="bg-emerald-600 text-white text-[9px] font-mono uppercase font-bold px-2 py-1 rounded-md hover:bg-emerald-700 shadow-3xs transition-all flex items-center gap-1"
                      title="Post voice comment immediately without editing"
                    >
                      <span>Send Direct</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Followers Mention Autocomplete Popup */}
              {showMentions && followers.length > 0 && (
                <div className="absolute bottom-full mb-2 left-10 right-0 z-50 bg-[#fdfbf7] border border-[#ebdcca] rounded-xl shadow-lg max-h-36 overflow-y-auto p-1.5 space-y-0.5">
                  <div className="text-[9px] font-mono font-bold text-[#8a8172] px-2 py-1 uppercase tracking-wider border-b border-[#ebdcca]/40">
                    Mention Followers Only
                  </div>
                  {followers
                    .filter(f => 
                      (f.username || '').toLowerCase().includes(mentionFilter.toLowerCase()) ||
                      (f.name || '').toLowerCase().includes(mentionFilter.toLowerCase())
                    )
                    .map(follower => {
                      const fUser = follower.username || follower.name.toLowerCase().replace(/[^a-z0-9_]/g, '');
                      return (
                        <button
                          key={follower.id}
                          type="button"
                          onClick={() => handleSelectMention(fUser)}
                          className="w-full text-left px-2 py-1.5 rounded-lg text-xs hover:bg-[#ebdcca]/30 transition-colors flex items-center gap-2"
                        >
                          <div className="w-5 h-5 rounded-md bg-[#ebdcca] flex items-center justify-center font-bold text-[#3a342a] font-mono text-[9px] uppercase">
                            {follower.name.charAt(0)}
                          </div>
                          <div>
                            <span className="font-sans font-bold text-[#3a342a]">{follower.name}</span>
                            <span className="font-mono text-[9px] text-[#8a8172] ml-1.5">!{fUser}</span>
                          </div>
                        </button>
                      );
                    })}
                  {followers.filter(f => 
                    (f.username || '').toLowerCase().includes(mentionFilter.toLowerCase()) ||
                    (f.name || '').toLowerCase().includes(mentionFilter.toLowerCase())
                  ).length === 0 && (
                    <div className="text-[10px] text-[#8a8172] p-2 italic text-center font-mono">
                      No followers match "!{mentionFilter}"
                    </div>
                  )}
                </div>
              )}

              {!isRecording && (
                <button
                  type="submit"
                  disabled={(!text.trim() && !commentImage && !commentAudio) || isSubmitting}
                  className="font-mono text-[9px] uppercase font-bold text-[#f4f1ea] bg-[#3a342a] hover:bg-[#52493b] py-1.5 px-3 rounded-lg shadow-2xs transition-all flex items-center gap-1 disabled:opacity-50 disabled:hover:bg-[#3a342a]"
                >
                  <Send size={10} />
                  <span>Send</span>
                </button>
              )}
            </div>
          </form>
        </div>
        )}
      </motion.div>
    </div>
  );
}

// Sub-component for individual comments/replies
interface CommentCardProps {
  comment: Comment;
  level: number;
  availableEmojis: string[];
  currentUserName: string;
  onReact: (emoji: string) => void;
  onReply: () => void;
  onProfileClick?: (creatorId: string) => void;
  currentUserId?: string;
  currentUserAvatarUrl?: string;
  onEditComment: (commentId: string, text: string) => Promise<void>;
  onDeleteComment: (commentId: string) => Promise<void>;
  postCreatorId?: string;
}

function CommentCard({
  comment,
  level,
  availableEmojis,
  currentUserName,
  onReact,
  onReply,
  onProfileClick,
  currentUserId,
  currentUserAvatarUrl,
  onEditComment,
  onDeleteComment,
  postCreatorId,
}: CommentCardProps) {
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(comment.text || '');
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

  // Checks if active user reacted with a specific emoji
  const hasReacted = (emoji: string) => {
    const list = comment.reactions?.[emoji] || [];
    return list.includes(currentUserName);
  };

  const resolvedName = (currentUserId && comment.senderId === currentUserId) ? currentUserName : comment.senderName;
  const resolvedAvatarUrl = (currentUserId && comment.senderId === currentUserId) ? (currentUserAvatarUrl || comment.senderAvatarUrl) : comment.senderAvatarUrl;
  const initial = (resolvedName || 'G').charAt(0);

  const isCommentAuthor = (currentUserId && comment.senderId === currentUserId) || (!comment.senderId && comment.senderName === currentUserName);
  const isPostOwner = currentUserId && postCreatorId === currentUserId;
  const canEdit = isCommentAuthor;
  const canDelete = isCommentAuthor || isPostOwner;

  return (
    <div className={`flex gap-3 p-3 border border-[#ebdcca]/30 transition-all rounded-xl relative ${
      level > 0 
        ? 'bg-[#faf8f4]/60 ml-2 md:ml-4' 
        : 'bg-[#fdfbf9] shadow-xs'
    } group/card`}>
      
      {/* Avatar */}
      <div 
        onClick={() => {
          if (comment.senderId && onProfileClick) {
            onProfileClick(comment.senderId);
          }
        }}
        className={`${level > 0 ? 'w-6 h-6 text-[8px]' : 'w-7 h-7 text-[10px]'} rounded-full bg-[#ebdcca] text-[#5c5446] flex items-center justify-center font-mono font-bold uppercase shrink-0 border border-[#cfcac0]/30 overflow-hidden ${comment.senderId ? 'cursor-pointer hover:opacity-85 transition-all' : ''}`}
      >
        {resolvedAvatarUrl ? (
          <img src={resolvedAvatarUrl || null} alt={resolvedName} className="w-full h-full object-cover" />
        ) : (
          initial
        )}
      </div>

      {/* Details & content */}
      <div className="flex-1 space-y-1 min-w-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 min-w-0">
            <span 
              onClick={() => {
                if (comment.senderId && onProfileClick) {
                  onProfileClick(comment.senderId);
                }
              }}
              className={`font-sans font-bold text-[#3a342a] ${level > 0 ? 'text-[11.5px]' : 'text-xs'} truncate tracking-tight ${comment.senderId ? 'cursor-pointer hover:underline' : ''}`}
            >
              {resolvedName}
            </span>
            {comment.senderId === postCreatorId && (
              <span className="text-[7.5px] font-mono font-bold text-amber-800 bg-[#ebdcca]/40 px-1 rounded uppercase tracking-wider">
                Author
              </span>
            )}
          </div>
          
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-[8px] text-[#8a8172] font-mono">
              {comment.timestamp}
            </span>

            {/* More options menu if authorized */}
            {(canEdit || canDelete) && (
              <div className="relative">
                <button
                  onClick={() => setShowDropdown(!showDropdown)}
                  className="text-[#8a8172] hover:text-[#3a342a] p-0.5 rounded-full hover:bg-[#ebdcca]/20 transition-all cursor-pointer"
                >
                  <MoreVertical size={11} />
                </button>

                {showDropdown && (
                  <>
                    <div className="fixed inset-0 z-30" onClick={() => setShowDropdown(false)} />
                    <div className="absolute right-0 top-4 bg-white border border-[#ebdcca] rounded-xl shadow-md z-40 overflow-hidden text-left py-1 w-24">
                      {canEdit && (
                        <button
                          onClick={() => {
                            setEditText(comment.text || '');
                            setIsEditing(true);
                            setShowDropdown(false);
                          }}
                          className="w-full text-left px-2.5 py-1 text-[9.5px] text-[#3a342a] hover:bg-stone-50 flex items-center gap-1.5 uppercase font-bold"
                        >
                          <Edit size={10} />
                          Edit
                        </button>
                      )}
                      {canDelete && (
                        <button
                          onClick={() => {
                            setIsConfirmingDelete(true);
                            setShowDropdown(false);
                          }}
                          className="w-full text-left px-2.5 py-1 text-[9.5px] text-red-600 hover:bg-red-50 flex items-center gap-1.5 uppercase font-bold"
                        >
                          <Trash2 size={10} />
                          Delete
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Comment Text / Edit State */}
        {isEditing ? (
          <div className="space-y-2 mt-1" onClick={(e) => e.stopPropagation()}>
            <textarea
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              rows={2}
              className="w-full bg-white border border-[#ebdcca] rounded-xl px-2.5 py-1.5 text-xs text-[#3a342a] focus:outline-none focus:border-[#3a342a] font-sans resize-none leading-relaxed"
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setIsEditing(false)}
                className="font-mono text-[8px] uppercase font-bold px-2 py-1 rounded-md border border-[#ebdcca] text-[#8a8172] hover:bg-stone-50 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (!editText.trim()) return;
                  await onEditComment(comment.id, editText);
                  setIsEditing(false);
                }}
                className="font-mono text-[8px] uppercase font-bold px-2 py-1 rounded-md bg-[#3a342a] text-[#f4f1ea] hover:bg-[#52493b] transition-all"
              >
                Save
              </button>
            </div>
          </div>
        ) : (
          comment.text && (
            <p className={`${level > 0 ? 'text-[11px]' : 'text-[11.5px]'} text-[#5c5446] leading-relaxed font-sans whitespace-pre-wrap`}>
              {comment.text}
            </p>
          )
        )}

        {/* Delete Confirmation Inline Banner */}
        {isConfirmingDelete && (
          <div className="bg-red-50/50 border border-red-200/40 rounded-xl p-2 mt-1.5 flex flex-col sm:flex-row items-center justify-between gap-2 text-left" onClick={(e) => e.stopPropagation()}>
            <span className="text-[9.5px] text-red-800 font-sans font-medium">Delete this comment?</span>
            <div className="flex gap-1.5 shrink-0">
              <button
                onClick={() => setIsConfirmingDelete(false)}
                className="font-mono text-[8px] uppercase font-bold px-2 py-0.5 rounded-md border border-stone-200 text-stone-600 bg-white hover:bg-stone-50"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  await onDeleteComment(comment.id);
                  setIsConfirmingDelete(false);
                }}
                className="font-mono text-[8px] uppercase font-bold px-2 py-0.5 rounded-md bg-red-600 text-white hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        )}

        {comment.image && (
          <div className="mt-1.5 overflow-hidden border border-[#ebdcca]/45 bg-[#fcfaf7] max-h-40 flex items-center justify-start rounded-xl">
            <img 
              src={comment.image || null} 
              alt="Attachment" 
              className="max-h-40 max-w-full object-contain cursor-zoom-in hover:scale-[1.01] transition-all duration-200" 
              referrerPolicy="no-referrer"
              onClick={() => window.dispatchEvent(new CustomEvent('view-image', { detail: comment.image }))}
            />
          </div>
        )}

        {comment.audioUrl && (
          <div className="mt-1.5 p-2 bg-[#fcfaf7] border border-[#ebdcca]/45 rounded-xl flex flex-col gap-1.5 w-full max-w-[240px]">
            <div className="flex items-center gap-1.5">
              <Mic size={12} className="text-amber-800 shrink-0" />
              <span className="text-[8px] font-mono text-[#8a8172] uppercase font-bold">Voice Message</span>
            </div>
            <audio src={comment.audioUrl || null} controls className="w-full h-8 rounded outline-none" />
          </div>
        )}

        {/* Reaction Pill Rows & Action items */}
        <div className="flex flex-wrap items-center justify-between gap-1 pt-1.5 border-t border-[#ebdcca]/10">
          
          {/* Existing Reaction Pills */}
          <div className="flex flex-wrap items-center gap-1">
            {comment.reactions && Object.entries(comment.reactions).map(([emoji, users], index) => {
              if (!users || users.length === 0) return null;
              const active = hasReacted(emoji);
              return (
                <button
                  key={`${emoji}-${index}`}
                  onClick={() => onReact(emoji)}
                  className={`inline-flex items-center gap-1 font-mono text-[8.5px] px-2 py-0.5 rounded-full border transition-all ${
                    active 
                      ? 'bg-amber-50 border-amber-600 text-amber-950 font-bold' 
                      : 'bg-[#fdfbf9] border-[#ebdcca]/50 hover:border-[#3a342a] text-[#5c5446]'
                  }`}
                  title={users.join(', ')}
                >
                  <span>{emoji}</span>
                  <span>{users.length}</span>
                </button>
              );
            })}
          </div>

          {/* Comment actions (Like/React picker, Reply button) */}
          <div className="flex items-center gap-2 ml-auto">
            {/* Quick react smiley picker */}
            <div className="relative">
              <button
                onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                className="text-[#8a8172] hover:text-[#3a342a] p-1 rounded-full hover:bg-[#ebdcca]/20 transition-all flex items-center justify-center border border-transparent"
                title="Add Reaction"
              >
                <Smile size={11} />
              </button>
              
              <AnimatePresence>
                {showEmojiPicker && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setShowEmojiPicker(false)} />
                    <motion.div
                      initial={{ opacity: 0, y: 3, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 3, scale: 0.95 }}
                      className="absolute right-0 bottom-6 z-20 bg-white border border-[#ebdcca] p-1 rounded-xl shadow-md flex items-center gap-1"
                    >
                      {availableEmojis.map(emoji => {
                        const active = hasReacted(emoji);
                        return (
                          <button
                            key={emoji}
                            onClick={() => {
                              onReact(emoji);
                              setShowEmojiPicker(false);
                            }}
                            className={`hover:scale-125 transition-transform p-0.5 text-xs rounded-lg ${active ? 'bg-amber-100' : ''}`}
                          >
                            {emoji}
                          </button>
                        );
                      })}
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>

            {/* Reply action */}
            {level < 3 && (
              <button
                onClick={onReply}
                className="font-mono text-[8px] uppercase font-black text-[#8a8172] hover:text-[#3a342a] flex items-center gap-0.5 transition-colors"
              >
                <CornerDownRight size={9} />
                <span>Reply</span>
              </button>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
