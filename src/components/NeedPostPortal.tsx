import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { HelpCircle, Send, CheckCircle, Activity, MessageSquare, Trash2, RefreshCw, Clock, User } from 'lucide-react';
import { Post } from '../types';
import { getRelativeTime } from '../App';
import { NSFWMediaGuard } from './NSFWMediaGuard';

interface NeedPostPortalProps {
  post: Post;
  isOwnPost: boolean;
  currentUser: any;
  token: string | null;
  onRefresh: () => void | Promise<void>;
  onDelete?: () => void;
  showToast: (msg: string) => void;
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

const NeedPostPortal: React.FC<NeedPostPortalProps> = ({
  post,
  isOwnPost,
  currentUser,
  token,
  onRefresh,
  onDelete,
  showToast
}) => {
  const [interestText, setInterestText] = useState('');
  const [guestName, setGuestName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [isPortalOpen, setIsPortalOpen] = useState(false);
  const [isDetailsExpanded, setIsDetailsExpanded] = useState(false);

  const isFulfilled = post.needStatus === 'fulfilled';
  const isUrgent = post.needUrgency === 'urgent';

  // Determine Creator Details
  let postCreatorName = 'Member';
  let postCreatorAvatar = '';
  let postCreatorId = '';

  if (post.isAnonymous) {
    postCreatorName = 'Anonymous Member';
  } else if (post.creator) {
    postCreatorName = post.creator.name;
    postCreatorAvatar = post.creator.avatarUrl || '';
    postCreatorId = post.creator.id;
  } else if (post.authorName) {
    postCreatorName = post.authorName;
    postCreatorAvatar = post.authorAvatarUrl || '';
    postCreatorId = post.authorId || '';
  }

  // Handle status update
  const handleToggleStatus = async () => {
    if (!token) {
      showToast("🔒 Please log in to change the status of this post.");
      return;
    }
    setIsUpdatingStatus(true);
    const newStatus = isFulfilled ? 'active' : 'fulfilled';

    try {
      const res = await fetch(`/api/posts/${post.id}/need-status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ status: newStatus })
      });

      if (res.ok) {
        showToast(newStatus === 'fulfilled' ? "🎉 Marked as FULFILLED! Texting portal closed." : "🔄 Reopened request! Portal is open.");
        await onRefresh();
      } else {
        const errData = await res.json();
        showToast(`⚠️ Error: ${errData.error || 'Failed to update status'}`);
      }
    } catch (e) {
      console.error(e);
      showToast("⚠️ Network error while updating need status.");
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  // Submit texting interest
  const handleSubmitMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!interestText.trim()) return;

    setIsSubmitting(true);
    const finalSenderName = currentUser ? currentUser.name : (guestName.trim() || 'Anonymous Guest');

    try {
      const res = await fetch(`/api/posts/${post.id}/need-text`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          text: interestText,
          senderName: finalSenderName
        })
      });

      if (res.ok) {
        showToast("💬 Message sent! Poster has been notified individually.");
        setInterestText('');
        setGuestName('');
        await onRefresh();
      } else {
        const errData = await res.json();
        showToast(`⚠️ ${errData.error || 'Failed to send interest.'}`);
      }
    } catch (e) {
      console.error(e);
      showToast("⚠️ Network error while sending interest.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const fullText = post.needBox || post.content || '';
  const shouldTruncate = fullText.length > 160;
  const displayText = isDetailsExpanded ? fullText : (shouldTruncate ? `${fullText.slice(0, 160)}...` : fullText);

  return (
    <article 
      id={`need-post-${post.id}`} 
      className="post-card bg-white border border-rose-200 border-l-4 border-l-rose-600 sm:rounded-xl overflow-hidden shadow-[0_1px_5px_rgba(225,29,72,0.04)] hover:border-rose-400 hover:border-l-rose-700 transition-all text-left flex flex-col w-full p-4 space-y-3"
    >
      {/* 1. CARD HEADER */}
      <div className="flex items-center justify-between border-b border-[#ebdcca]/10 pb-2.5">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full shrink-0 bg-[#ebdcca] flex items-center justify-center font-mono text-[10px] text-[#5c5446] font-bold uppercase overflow-hidden border border-[#cfcac0]/30">
            {post.isAnonymous ? (
              <User className="text-[#8a8172]" size={14} />
            ) : postCreatorAvatar ? (
              <img src={postCreatorAvatar || null} alt={postCreatorName} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
            ) : (
              postCreatorName.charAt(0)
            )}
          </div>
          <div className="text-left">
            <span className="font-sans font-bold text-xs text-[#3a342a] leading-tight flex items-center gap-1.5">
              {postCreatorName}
              <span className={`text-[7px] font-mono font-bold px-1.5 py-0.5 rounded uppercase tracking-wider ${
                isUrgent ? 'bg-rose-50 text-rose-700 border border-rose-200' : 'bg-blue-50 text-blue-700 border border-blue-200'
              }`}>
                {isUrgent ? '🆘 URGENT NEED' : '🤝 NEED REQUEST'}
              </span>
            </span>
            <PostTimestamp post={post} />
          </div>
        </div>

        <div className="shrink-0 flex items-center gap-1.5">
          {isFulfilled ? (
            <span className="bg-gray-100 border border-gray-300 text-gray-500 font-mono text-[8px] font-bold uppercase px-1.5 py-0.5 rounded">
              FULFILLED
            </span>
          ) : (
            <span className="bg-emerald-50 border border-emerald-200 text-emerald-700 font-mono text-[8px] font-extrabold uppercase px-1.5 py-0.5 rounded animate-pulse">
              ● ACTIVE
            </span>
          )}
        </div>
      </div>

      {/* 2. METADATA ROW (Compact Badges) */}
      <div className="flex flex-wrap gap-1.5 items-center">
        <span className="flex items-center gap-1 bg-amber-50/60 px-2 py-0.5 rounded border border-[#ebdcca]/40 text-[9px] font-mono text-[#5c5446]">
          📍 {post.needLocation || 'Anywhere'}
        </span>
        <span className="flex items-center gap-1 bg-amber-50/60 px-2 py-0.5 rounded border border-[#ebdcca]/40 text-[9px] font-mono text-[#5c5446]">
          🕒 {post.needTime || 'Asap'}
        </span>
        <span className={`px-2 py-0.5 rounded border text-[9px] font-mono font-bold uppercase ${
          isUrgent 
            ? 'bg-rose-50 border-rose-200 text-rose-700' 
            : 'bg-emerald-50 border-emerald-200 text-emerald-700'
        }`}>
          {isUrgent ? '🚨 URGENT' : '🟢 NORMAL'}
        </span>
      </div>

      {/* 3. CONTENT AREA */}
      <div className="space-y-1">
        {post.title && (
          <h4 className="font-sans font-extrabold text-xs text-[#3a342a] tracking-tight">
            {post.title}
          </h4>
        )}
        <p className="font-sans text-xs text-[#5c5446] leading-relaxed whitespace-pre-wrap">
          {displayText}
        </p>
        
        {shouldTruncate && (
          <button 
            type="button" 
            onClick={() => setIsDetailsExpanded(!isDetailsExpanded)} 
            className="font-mono text-[9px] font-extrabold text-amber-900 hover:text-amber-700 hover:underline text-left block mt-1 transition-colors"
          >
            {isDetailsExpanded ? "See less" : "See more"}
          </button>
        )}
      </div>

      {/* 4. POST MEDIA IF ANY */}
      {(Boolean(post.imageUrl && post.imageUrl.trim()) || Boolean(post.videoUrl && post.videoUrl.trim()) || Boolean(post.audioUrl && post.audioUrl.trim()) || Boolean(post.voiceUrl && post.voiceUrl.trim())) && (
        <div className="relative border-t border-[#ebdcca]/10 flex flex-col gap-2 pt-2">
          {post.imageUrl && post.imageUrl.trim() && (
            <div className="overflow-hidden flex items-center justify-center bg-[#fdfbf7] relative max-h-[400px] rounded-lg">
              <NSFWMediaGuard
                src={post.imageUrl}
                alt={post.title || 'Need Attached Image'}
                isNsfw={post.isNsfw || post.nsfwVerdict === 'blur'}
              />
            </div>
          )}
          {post.videoUrl && post.videoUrl.trim() && (
            <div className="overflow-hidden bg-black relative rounded-lg border border-[#ebdcca]/30">
              <video
                src={post.videoUrl || null}
                controls
                playsInline
                preload="metadata"
                className="w-full max-h-[400px] object-contain mx-auto"
              />
            </div>
          )}
          {post.audioUrl && post.audioUrl.trim() && (
            <div className="p-3 bg-[#fbf9f4] border border-[#ebdcca]/20 rounded-lg">
              <audio src={post.audioUrl || null} controls className="w-full" />
            </div>
          )}
          {post.voiceUrl && post.voiceUrl.trim() && (
            <div className="p-3 bg-[#fbf9f4] border border-[#ebdcca]/20 rounded-lg">
              <audio src={post.voiceUrl || null} controls className="w-full" />
            </div>
          )}
        </div>
      )}

      {/* 5. INTERACTIVE TEXTING PORTAL FRAME */}
      <div className="space-y-2 pt-1">
        {/* Toggle Button */}
        <button
          type="button"
          onClick={() => setIsPortalOpen(!isPortalOpen)}
          className={`w-full py-1.5 px-3 border border-[#ebdcca]/60 rounded-lg font-mono text-[9px] font-bold uppercase tracking-wider flex items-center justify-between transition-all ${
            isPortalOpen
              ? 'bg-[#3a342a] text-[#fbf9f4] border-[#3a342a]'
              : 'bg-[#fdfbf7] hover:bg-[#fbf9f4] text-[#5c5446]'
          }`}
        >
          <span className="flex items-center gap-1.5">
            <MessageSquare size={11} className={isPortalOpen ? 'text-[#ebdcca]' : 'text-[#8a8172]'} />
            {isPortalOpen ? 'Close Text Portal' : 'Open Text Portal'}
          </span>
          <span className={`px-1.5 py-0.5 text-[8px] font-extrabold rounded ${
            isPortalOpen ? 'bg-white text-amber-900' : 'bg-amber-50 text-[#8a8172] border border-[#ebdcca]/40'
          }`}>
            {post.needTexts?.length || 0} TEXTS
          </span>
        </button>

        {/* Messaging Box */}
        <AnimatePresence>
          {isPortalOpen && (
            <motion.div 
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="bg-stone-50/50 border border-[#ebdcca]/40 p-2.5 rounded-lg space-y-2 overflow-hidden"
            >
              <span className="font-mono text-[8px] font-bold text-[#8a8172] uppercase tracking-wider block border-b border-[#ebdcca]/10 pb-1">
                💬 Portal Log ({post.needTexts?.length || 0})
              </span>

              {/* Message History */}
              {(!post.needTexts || post.needTexts.length === 0) ? (
                <div className="text-center py-3 bg-white/45 border border-dashed border-[#ebdcca]/30 rounded">
                  <p className="text-[9px] font-sans text-[#8a8172] italic">
                    No texts yet. Send a direct message to help!
                  </p>
                </div>
              ) : (
                <div className="space-y-1.5 max-h-32 overflow-y-auto pr-1">
                  {post.needTexts.map((msg) => {
                    const isMsgSenderMe = currentUser && msg.senderId === currentUser.id;
                    return (
                      <div 
                        key={msg.id} 
                        className={`p-2 text-xs leading-normal border rounded transition-colors ${
                          isMsgSenderMe 
                            ? 'bg-amber-50/40 border-amber-200/50 text-[#3a342a]' 
                            : 'bg-white border-stone-200 text-[#5c5446]'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 mb-0.5 font-mono text-[8px] text-[#8a8172] font-bold uppercase">
                          <span className={isMsgSenderMe ? 'text-amber-900 font-extrabold' : 'text-[#3a342a]'}>
                            {msg.senderName} {isMsgSenderMe && ' (You)'}
                          </span>
                          <span>{msg.timestamp}</span>
                        </div>
                        <p className="font-sans text-[10px] whitespace-pre-wrap text-[#3a342a]">{msg.text}</p>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Reply Form */}
              {!isFulfilled ? (
                <form onSubmit={handleSubmitMessage} className="space-y-1.5 border-t border-[#ebdcca]/15 pt-2">
                  {!currentUser && (
                    <input
                      type="text"
                      placeholder="Your Name / Contact Info..."
                      value={guestName}
                      onChange={(e) => setGuestName(e.target.value)}
                      className="w-full bg-white border border-[#ebdcca] rounded-md px-2 py-1 text-[9px] text-[#5c5446] focus:outline-none focus:ring-1 focus:ring-amber-800"
                    />
                  )}
                  <div className="flex gap-1.5">
                    <textarea
                      placeholder={currentUser ? "Offer support or request details..." : "I can help! Leave details..."}
                      value={interestText}
                      onChange={(e) => setInterestText(e.target.value)}
                      rows={1}
                      required
                      className="w-full bg-white border border-[#ebdcca] rounded-md px-2 py-1 font-sans text-[10px] text-[#5c5446] leading-normal focus:outline-none focus:ring-1 focus:ring-amber-800 resize-none"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleSubmitMessage(e);
                        }
                      }}
                    />
                    <button
                      type="submit"
                      disabled={isSubmitting || !interestText.trim()}
                      className="p-1.5 bg-[#3a342a] text-[#faf6ee] hover:bg-black rounded-md disabled:opacity-40 disabled:cursor-not-allowed shrink-0 transition-colors flex items-center justify-center border border-[#3a342a]"
                    >
                      <Send size={10} className={isSubmitting ? 'animate-spin' : ''} />
                    </button>
                  </div>
                </form>
              ) : (
                <div className="flex items-start gap-1 bg-gray-50 border border-gray-100 p-2 rounded text-[9px] text-gray-500">
                  <CheckCircle size={10} className="text-gray-400 shrink-0 mt-0.5" />
                  <p>Portal is locked since request is fulfilled.</p>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* 6. OWNER MANAGER CONTROLS */}
      {isOwnPost && (
        <div className="bg-stone-50 border border-[#ebdcca]/50 p-2 rounded-lg flex items-center justify-between gap-2 mt-1">
          <div className="text-left">
            <span className="font-mono text-[8px] font-bold text-stone-700 uppercase tracking-wider block">
              👑 Owner controls
            </span>
            <p className="text-[8px] text-[#8a8172]">
              Mark fulfilled to resolve this request.
            </p>
          </div>
          <button
            type="button"
            onClick={handleToggleStatus}
            disabled={isUpdatingStatus}
            className={`font-mono text-[8px] font-bold uppercase px-2 py-1 border border-stone-400 rounded transition-all active:translate-y-[0.5px] ${
              isFulfilled
                ? 'bg-amber-50 text-amber-900 hover:bg-amber-100'
                : 'bg-green-600 text-white hover:bg-green-700'
            }`}
          >
            {isUpdatingStatus ? (
              <RefreshCw size={8} className="animate-spin" />
            ) : isFulfilled ? (
              'Reopen'
            ) : (
              '✓ Mark Fulfilled'
            )}
          </button>
        </div>
      )}

      {/* 7. CARD FOOTER */}
      <div className="flex items-center justify-between border-t border-[#ebdcca]/20 pt-2.5 mt-1 select-none">
        <div className="flex items-center gap-1.5 text-[10px] font-mono font-bold text-[#8a8172]">
          <MessageSquare size={12} className="text-[#8a8172]" />
          <span>{post.needTexts?.length || 0}</span>
        </div>

        {onDelete && (
          <button
            onClick={onDelete}
            className="text-red-600 hover:text-red-700 hover:bg-red-50 p-1 border border-[#ebdcca]/60 rounded font-mono text-[8px] font-bold uppercase transition-all shadow-3xs"
            title="Delete Request"
          >
            <Trash2 size={11} />
          </button>
        )}
      </div>
    </article>
  );
};

export default NeedPostPortal;
