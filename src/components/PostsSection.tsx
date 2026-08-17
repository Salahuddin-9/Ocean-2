import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, Trash2, Heart, Star, Calendar, FileText, Check, X, AlertCircle, Repeat, Lock, Unlock, ExternalLink, MessageSquare, Bookmark, Share2, MoreVertical, Edit, Eye, Maximize2, Clock, Play } from 'lucide-react';
import { Post } from '../types';
import { getRelativeTime, CollapsibleText } from '../App';
import TimeCapsuleLock from './TimeCapsuleLock';
import NeedPostPortal from './NeedPostPortal';
import VoiceNotePlayback from './VoiceNotePlayback';
import { NSFWMediaGuard } from './NSFWMediaGuard';

export function PostTimestamp({ post }: { post: Post }) {
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
      className="font-mono text-[9px] text-[#8a8172] hover:text-primary hover:underline cursor-pointer select-none transition-all duration-150 inline-block mt-0.5"
      title="Click to view uploaded date, day & time"
    >
      {showAbsolute ? `📅 ${getAbsoluteString()}` : `⏳ ${getRelativeString()}`}
    </span>
  );
}

interface PostsSectionProps {
  posts: Post[];
  isEditMode: boolean;
  onUpdatePosts: (updatedPosts: Post[]) => void;
  onLikePost?: (id: string) => void;
  onRepostPost?: (post: Post) => void;
  onReportPost?: (post: Post) => void;
  onCommentPost?: (post: Post) => void;
  onSavePost?: (id: string) => void;
  onSharePost?: (post: Post) => void;
  savedPostIds?: string[];
  currentUser?: any;
  onLoadCreatorProfile?: (id: string) => void;
  profileName?: string;
  profileAvatarUrl?: string;
  buttonsAlignment?: 'left' | 'right';
  onShowLikesList?: (post: Post) => void;
  onVideoClick?: (post: Post) => void;
  onDeletePost?: (postId: string) => void;
}

export default function PostsSection({ 
  posts = [], 
  isEditMode, 
  onUpdatePosts,
  onLikePost,
  onRepostPost,
  onReportPost,
  onCommentPost,
  onSavePost,
  onSharePost,
  savedPostIds = [],
  currentUser,
  onLoadCreatorProfile,
  profileName = '',
  profileAvatarUrl = '',
  buttonsAlignment = 'left',
  onShowLikesList,
  onVideoClick,
  onDeletePost
}: PostsSectionProps) {
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [postToDeleteId, setPostToDeleteId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [activeDropdownId, setActiveDropdownId] = useState<string | null>(null);

  const formatDate = () => {
    const options: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'long', day: 'numeric' };
    return new Date().toLocaleDateString('en-US', options);
  };

  const handleAddPost = (e: React.FormEvent) => {
    e.preventDefault();
    const titleVal = newTitle.trim();
    const contentVal = newContent.trim();

    if (!contentVal) {
      if (titleVal) {
        alert("⚠️ Cannot publish a title alone. Please add some text content!");
      } else {
        alert("⚠️ Please enter some text content before publishing!");
      }
      return;
    }

    const newPost: Post = {
      id: `post-${Date.now()}`,
      title: titleVal,
      content: contentVal,
      date: formatDate(),
      likes: 0
    };

    onUpdatePosts([newPost, ...posts]);
    setNewTitle('');
    setNewContent('');
    setIsAdding(false);
  };

  const handleDeletePost = (id: string) => {
    setPostToDeleteId(id);
  };

  const confirmDeletePost = () => {
    if (postToDeleteId) {
      if (onDeletePost) {
        onDeletePost(postToDeleteId);
      } else {
        onUpdatePosts(posts.filter(p => p.id !== postToDeleteId));
      }
      setPostToDeleteId(null);
    }
  };

  const handleStartEdit = (post: Post) => {
    if (post.isTimeCapsule) {
      alert("⚠️ Time capsule posts cannot be edited.");
      return;
    }
    setEditingPostId(post.id);
    setEditTitle(post.title);
    setEditContent(post.content);
  };

  const handleSaveEdit = (id: string) => {
    const titleVal = editTitle.trim();
    const contentVal = editContent.trim();

    if (!contentVal) {
      if (titleVal) {
        alert("⚠️ Cannot publish a title alone. Please add some text content!");
      } else {
        alert("⚠️ Please enter some text content before publishing!");
      }
      return;
    }

    onUpdatePosts(posts.map(p => p.id === id ? { ...p, title: titleVal, content: contentVal } : p));
    setEditingPostId(null);
  };

  const handleLikePost = (id: string) => {
    if (onLikePost) {
      onLikePost(id);
    } else {
      onUpdatePosts(posts.map(p => p.id === id ? { ...p, likes: p.likes + 1 } : p));
    }
  };

  return (
    <div id="posts-showcase" className="bg-[#fcfaf4] border-y border-[#ebdcca] py-6 shadow-xs w-full min-w-full overflow-hidden">
      <div className="flex items-center justify-between mb-6 border-b border-[#ebdcca] pb-4 px-4 md:px-8 max-w-3xl mx-auto w-full">
        <div className="flex items-center gap-2">
          <FileText size={18} className="text-[#8a8172]" />
          <h2 className="font-display font-bold text-base text-[#3a342a] tracking-tight">
            User's Posts
          </h2>
          <span className="bg-[#ebdcca] text-[#5c5446] font-mono text-[10px] font-bold px-2 py-0.5 rounded-full">
            {posts.length}
          </span>
        </div>

        {isEditMode && !isAdding && (
          <button
            onClick={() => setIsAdding(true)}
            className="inline-flex items-center gap-1 font-mono text-xs font-bold text-[#f4f1ea] bg-[#3a342a] hover:bg-[#52493b] px-3.5 py-1.5 rounded-xl transition-all duration-150 shadow-sm"
          >
            <Plus size={14} />
            New Post
          </button>
        )}
      </div>

      {/* ADD NEW POST FORM */}
      <AnimatePresence>
        {isEditMode && isAdding && (
          <motion.form
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            onSubmit={handleAddPost}
            className="mb-6 bg-[#f0ede6] border border-[#ebdcca] p-4 rounded-2xl space-y-4 overflow-hidden"
          >
            <div className="flex justify-between items-center border-b border-[#cfcac0] pb-2">
              <span className="font-mono text-[10px] font-bold text-[#8a8172] uppercase tracking-wider">
                Compose New Post
              </span>
              <button
                type="button"
                onClick={() => setIsAdding(false)}
                className="text-[#8a8172] hover:text-primary p-1 rounded-lg transition-colors"
              >
                <X size={14} />
              </button>
            </div>

            <div className="space-y-1">
              <label className="block text-[10px] font-mono text-[#8a8172] uppercase tracking-wider">Title</label>
              <input
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Post title..."
                className="w-full bg-white border border-[#cfcac0] rounded-lg px-3 py-2 font-sans text-xs text-[#5c5446] focus:outline-none focus:ring-1 focus:ring-[#8a8172]"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-[10px] font-mono text-[#8a8172] uppercase tracking-wider">Content</label>
              <textarea
                value={newContent}
                onChange={(e) => setNewContent(e.target.value)}
                placeholder="Write your post thoughts here..."
                rows={4}
                className="w-full bg-white border border-[#cfcac0] rounded-lg p-3 font-sans text-xs text-[#5c5446] leading-relaxed focus:outline-none focus:ring-1 focus:ring-[#8a8172]"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsAdding(false)}
                className="font-mono text-[10px] uppercase font-bold text-[#8a8172] hover:bg-[#ebdcca]/40 px-3.5 py-2 rounded-xl border border-[#cfcac0]"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="font-mono text-[10px] uppercase font-bold text-[#f4f1ea] bg-[#3a342a] hover:bg-[#52493b] px-3.5 py-2 rounded-xl shadow-sm"
              >
                Publish Post
              </button>
            </div>
          </motion.form>
        )}
      </AnimatePresence>

      {/* POSTS LIST */}
      {posts.length === 0 ? (
        <div className="text-center py-12 px-4 border border-dashed border-[#ebdcca] rounded-2xl bg-[#fbf9f4]">
          <AlertCircle className="mx-auto text-[#8a8172] mb-3" size={24} />
          <p className="font-sans text-xs text-[#8a8172] font-medium">No posts published yet.</p>
          <p className="font-mono text-[10px] text-[#aaa090] mt-1">Switch to edit mode to publish your first update!</p>
        </div>
      ) : (
        <div className="space-y-4 max-w-3xl mx-auto px-0 sm:px-4 md:px-8">
          {posts.map((post) => {
            if (post.isNeedPost) {
              const secureToken = localStorage.getItem('secure_auth_token');
              return (
                <motion.div
                  key={post.id}
                  layout
                  initial={{ opacity: 0, y: 75, scale: 0.88, rotateX: 10 }}
                  whileInView={{ opacity: 1, y: 0, scale: 1, rotateX: 0 }}
                  viewport={{ once: true, amount: 0.05 }}
                  exit={{ opacity: 0, y: -20, scale: 0.9 }}
                  transition={{ type: 'spring', stiffness: 160, damping: 12, mass: 0.7 }}
                  style={{ perspective: 1000 }}
                >
                  <NeedPostPortal
                    post={post}
                    isOwnPost={isEditMode}
                    currentUser={currentUser}
                    token={secureToken}
                    onRefresh={() => {
                      window.dispatchEvent(new CustomEvent('refresh-feed'));
                    }}
                    onDelete={isEditMode ? () => handleDeletePost(post.id) : undefined}
                    showToast={(msg) => {
                      window.dispatchEvent(new CustomEvent('show-toast', { detail: { message: msg } }));
                    }}
                  />
                </motion.div>
              );
            }

            const isEditing = editingPostId === post.id;
            const isCapsuleLocked = post.isTimeCapsule && post.unlockDate && (new Date(post.unlockDate).getTime() > Date.now());
            
            let postCreatorName = profileName || 'Member';
            let postCreatorAvatar = profileAvatarUrl || '';
            let postCreatorId = post.creator?.id || '';
            const hasLiked = currentUser && post.likedBy && Array.isArray(post.likedBy) && post.likedBy.includes(currentUser.id);

            if (post.isAnonymous) {
              postCreatorName = 'Anonymous Member';
              postCreatorAvatar = '';
              postCreatorId = '';
            } else if (post.creator) {
              postCreatorName = post.creator.name;
              postCreatorAvatar = post.creator.avatarUrl || '';
              postCreatorId = post.creator.id;
            } else if (post.authorName) {
              postCreatorName = post.authorName;
              postCreatorAvatar = post.authorAvatarUrl || '';
              postCreatorId = post.authorId || '';
            }

            return (
              <motion.div
                key={post.id}
                layout
                initial={{ opacity: 0, y: 75, scale: 0.88, rotateX: 10 }}
                whileInView={{ opacity: 1, y: 0, scale: 1, rotateX: 0 }}
                viewport={{ once: true, amount: 0.05 }}
                exit={{ opacity: 0, y: -20, scale: 0.9 }}
                transition={{ type: 'spring', stiffness: 160, damping: 12, mass: 0.7 }}
                style={{ perspective: 1000 }}
              >
                <article className={`post-card group relative border-y sm:border sm:rounded-2xl border-outline-variant hover:border-primary/40 overflow-hidden nexus-shadow-1 transition-all duration-150 w-full ${
                  (post.isTimeCapsule && !isCapsuleLocked)
                    ? 'bg-emerald-50/20 border-emerald-600/30 hover:border-emerald-500/50 ring-1 ring-emerald-500/5'
                    : 'bg-white'
                }`}>
                  {isEditing ? (
                    <div className="space-y-3 p-4">
                      <div className="flex justify-between items-center border-b border-[#ebdcca] pb-1.5">
                        <span className="font-mono text-[9px] font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                          Editing Post
                        </span>
                        <div className="flex gap-1">
                          <button
                            onClick={() => handleSaveEdit(post.id)}
                            className="text-emerald-700 hover:bg-emerald-50 border border-emerald-200 p-1 rounded-lg"
                            title="Save Changes"
                          >
                            <Check size={12} />
                          </button>
                          <button
                            onClick={() => setEditingPostId(null)}
                            className="text-[#8a8172] hover:bg-gray-100 border border-gray-200 p-1 rounded-lg"
                            title="Cancel"
                          >
                            <X size={12} />
                          </button>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <input
                          type="text"
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          className="w-full bg-white border border-[#cfcac0] rounded-lg px-2.5 py-1.5 font-sans text-xs font-bold text-[#3a342a] focus:outline-none focus:ring-1 focus:ring-[#8a8172]"
                        />
                        <textarea
                          value={editContent}
                          onChange={(e) => setEditContent(e.target.value)}
                          rows={3}
                          className="w-full bg-white border border-[#cfcac0] rounded-lg p-2.5 font-sans text-xs text-[#5c5446] leading-relaxed focus:outline-none focus:ring-1 focus:ring-[#8a8172]"
                        />
                      </div>
                    </div>
                  ) : (
                    <div onClick={() => onCommentPost && onCommentPost(post)} className="cursor-pointer">
                      {/* Standard Post Header */}
                      <div 
                        onClick={(e) => {
                          e.stopPropagation();
                        }}
                        className="px-4 py-3 flex items-center justify-between border-b border-[#ebdcca]/10 bg-white"
                      >
                        <div 
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!post.isAnonymous && postCreatorId) {
                              if (onLoadCreatorProfile) onLoadCreatorProfile(postCreatorId);
                            }
                          }}
                          className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-full border border-[#cfcac0] bg-[#fdfbf7] hover:bg-[#ebdcca]/30 hover:border-[#8a8172] transition-all cursor-pointer group/profile shadow-2xs"
                          title="View user profile"
                        >
                          <div 
                            className="w-8 h-8 rounded-full shrink-0 bg-[#ebdcca] flex items-center justify-center font-mono text-[10px] text-[#5c5446] font-bold uppercase overflow-hidden border border-[#cfcac0] group-hover/profile:border-[#8a8172] transition-colors"
                          >
                            {postCreatorAvatar ? (
                              <img src={postCreatorAvatar || null} alt={postCreatorName} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                            ) : (
                              postCreatorName.charAt(0)
                            )}
                          </div>
                          <div className="text-left">
                            <div className="flex items-center gap-1.5">
                              <span 
                                className="font-sans font-bold text-xs text-[#3a342a] leading-tight block group-hover/profile:text-amber-800 transition-colors"
                              >
                                {postCreatorName}
                              </span>
                              {(post as any).verifiedLive && (
                                <span
                                  title={`Verified Live · ${new Date((post as any).verifiedLive.verifiedAt).toLocaleString()}`}
                                  className="shrink-0 text-[7px] font-mono uppercase font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-600/10 border border-emerald-600/30 px-1 py-px rounded-full"
                                >
                                  ● Verified Live
                                </span>
                              )}
                            </div>
                            <PostTimestamp post={post} />
                          </div>
                        </div>

                        {/* Right: Options Actions (Moved to Header) */}
                        <div className="relative shrink-0" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveDropdownId(activeDropdownId === post.id ? null : post.id);
                            }}
                            className="text-[#8a8172] hover:text-primary p-1 rounded-lg hover:bg-stone-50 transition-all flex items-center justify-center cursor-pointer"
                            title="Options"
                          >
                            <MoreVertical size={13} />
                          </button>

                          {activeDropdownId === post.id && (
                            <div className="absolute right-0 top-7 mt-1 w-32 bg-[#fdfbf7] border border-[#ebdcca] rounded-xl shadow-lg py-1.5 z-20 font-sans text-[10px]">
                              {isEditMode && !post.isTimeCapsule && (
                                <button
                                  onClick={() => {
                                    handleStartEdit(post);
                                    setActiveDropdownId(null);
                                  }}
                                  className="w-full text-left px-3 py-1.5 hover:bg-[#ebdcca]/30 text-[#3a342a] font-medium flex items-center gap-1.5 cursor-pointer"
                                >
                                  <Edit size={10} className="text-[#8a8172]" />
                                  Edit Post
                                </button>
                              )}
                              {isEditMode && (
                                <button
                                  onClick={() => {
                                    handleDeletePost(post.id);
                                    setActiveDropdownId(null);
                                  }}
                                  className="w-full text-left px-3 py-1.5 hover:bg-rose-50 text-rose-700 font-medium flex items-center gap-1.5 border-t border-[#ebdcca]/20 cursor-pointer"
                                >
                                  <Trash2 size={10} className="text-rose-500" />
                                  Delete Post
                                </button>
                              )}
                              <button
                                onClick={() => {
                                  setActiveDropdownId(null);
                                  if (onReportPost) {
                                    onReportPost(post);
                                  } else {
                                    window.dispatchEvent(new CustomEvent('open-report-modal', { detail: { post } }));
                                  }
                                }}
                                className={`w-full text-left px-3 py-1.5 hover:bg-rose-50 text-rose-700 font-medium flex items-center gap-1.5 cursor-pointer ${isEditMode ? 'border-t border-[#ebdcca]/20' : ''}`}
                              >
                                <AlertCircle size={10} className="text-rose-500" />
                                Report Post
                              </button>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Repost Header Credit */}
                      {post.isRepost && post.repostedFrom && (
                        <div className="px-4 pt-3 pb-1 flex items-center gap-1.5 text-stone-500 font-mono text-[9px] uppercase tracking-wider" onClick={(e) => e.stopPropagation()}>
                          <Repeat size={10} className="text-amber-800 animate-pulse" />
                          <span>Reposted from </span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (onLoadCreatorProfile && post.repostedFrom?.id) {
                                onLoadCreatorProfile(post.repostedFrom.id);
                              }
                            }}
                            className="font-bold text-amber-900 hover:underline cursor-pointer"
                          >
                            {post.repostedFrom.name}
                          </button>
                        </div>
                      )}

                      {isCapsuleLocked ? (
                        <div className="p-4" onClick={(e) => e.stopPropagation()}>
                          <TimeCapsuleLock
                            unlockDate={post.unlockDate || ''}
                            lockedAtDate={post.lockedAtDate || post.date || new Date().toISOString()}
                            isOwner={isEditMode}
                            onUnlock={() => {
                              window.dispatchEvent(new CustomEvent('refresh-feed'));
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
                          {(Boolean(post.imageUrl && post.imageUrl.trim()) || Boolean(post.videoUrl && post.videoUrl.trim()) || Boolean(post.audioUrl && post.audioUrl.trim()) || Boolean(post.voiceUrl && post.voiceUrl.trim())) && (
                            <div className="relative border-t border-[#ebdcca]/10 flex flex-col gap-2">
                              {post.imageUrl && post.imageUrl.trim() && (post.imageUrl.startsWith('http') || post.imageUrl.startsWith('data:') || post.imageUrl.startsWith('/') || post.imageUrl.startsWith('blob:')) && (
                                <div className="overflow-hidden flex items-center justify-center bg-[#fdfbf7] relative max-h-[500px]">
                                  <NSFWMediaGuard
                                    src={post.imageUrl}
                                    alt={post.title || 'Attached Image'}
                                    isNsfw={post.isNsfw || post.nsfwVerdict === 'blur'}
                                    onFullscreen={() => window.dispatchEvent(new CustomEvent('open-fullscreen-image', { detail: post.imageUrl }))}
                                  />
                                </div>
                              )}
                              {post.videoUrl && post.videoUrl.trim() && (post.videoUrl.startsWith('http') || post.videoUrl.startsWith('data:') || post.videoUrl.startsWith('/') || post.videoUrl.startsWith('blob:')) && (
                                <div 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (onVideoClick) onVideoClick(post);
                                  }}
                                  className="overflow-hidden bg-black relative rounded-lg border border-[#ebdcca]/30 my-1 cursor-pointer group"
                                  title="Click to watch as Reel"
                                >
                                  <video
                                    src={post.videoUrl || null}
                                    playsInline
                                    controls
                                    preload="metadata"
                                    className="w-full max-h-[500px] object-contain mx-auto"
                                    onError={(e) => {
                                      console.warn("Video playback error for URL:", post.videoUrl);
                                    }}
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
                              {post.audioUrl && post.audioUrl.trim() && (
                                <div className="p-3 bg-transparent border-b border-[#ebdcca]/20">
                                  <VoiceNotePlayback audioUrl={post.audioUrl} postId={post.id} />
                                </div>
                              )}
                              {post.voiceUrl && post.voiceUrl.trim() && (
                                <div className="p-3 bg-transparent border-b border-[#ebdcca]/20">
                                  <VoiceNotePlayback audioUrl={post.voiceUrl} postId={post.id} />
                                </div>
                              )}
                            </div>
                          )}
                        </>
                      )}

                      {/* Comments & Interactive Strip */}
                      <div className={`px-4 py-2 border-t border-[#ebdcca]/20 bg-[#fdfbf7]/65 flex items-center select-none ${buttonsAlignment === 'right' ? 'justify-end' : 'justify-start'}`} onClick={(e) => e.stopPropagation()}>
                        <div className={`flex items-center gap-4 text-xs font-mono ${buttonsAlignment === 'right' ? 'flex-row-reverse' : 'flex-row'}`}>
                          {/* 1. React (Star) button with the number of react or star */}
                          <div className={`flex items-center gap-1 ${buttonsAlignment === 'right' ? 'flex-row-reverse' : 'flex-row'}`}>
                            <motion.button
                              whileTap={{ scale: 0.8 }}
                              onClick={() => handleLikePost(post.id)}
                              className={`flex items-center justify-center transition-colors ${hasLiked ? 'text-amber-600' : 'text-[#8a8172]'}`}
                              title="React with Star"
                            >
                              <motion.div
                                animate={hasLiked ? { scale: [1, 1.4, 0.9, 1.1, 1], rotate: [0, 12, -12, 5, 0] } : { scale: 1 }}
                                transition={{ duration: 0.4, ease: "easeOut" }}
                                className="p-1"
                              >
                                <Star 
                                  size={14} 
                                  className={hasLiked ? 'fill-amber-400 stroke-amber-500' : 'stroke-[#8a8172] hover:stroke-amber-500'} 
                                />
                              </motion.div>
                            </motion.button>
                            <span 
                              onClick={(e) => {
                                e.stopPropagation();
                                if (onShowLikesList) onShowLikesList(post);
                              }}
                              className="text-[10.5px] font-bold text-[#8a8172] hover:text-primary hover:underline cursor-pointer px-1 py-0.5"
                              title="View who starred this post"
                            >
                              {post.likes || 0}
                            </span>
                          </div>

                          {/* 2. Comment (with number showing) */}
                          <button 
                            className="flex items-center gap-1.5 text-[#8a8172] hover:text-primary hover:scale-110 active:scale-95 transition-all"
                            onClick={() => onCommentPost && onCommentPost(post)}
                            title="Comment on post"
                          >
                            <MessageSquare size={14} />
                            <span className="text-[10.5px] font-bold">{post.comments?.length || 0}</span>
                          </button>

                          {/* 3. Repost (with number showing) */}
                          {onRepostPost && currentUser && (
                            <button
                              onClick={() => onRepostPost(post)}
                              className="text-[#8a8172] hover:text-primary hover:scale-110 active:scale-95 transition-all flex items-center gap-1.5"
                              title="Repost to stream"
                            >
                              <Repeat size={14} />
                              <span className="text-[10.5px] font-bold">{post.repostsCount || 0}</span>
                            </button>
                          )}

                          {/* 4. Save */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (onSavePost) onSavePost(post.id);
                            }}
                            className={`hover:scale-110 active:scale-90 transition-transform flex items-center gap-1.5 ${
                              savedPostIds?.includes(post.id) ? 'text-amber-600' : 'text-[#8a8172]'
                            }`}
                            title="Save post"
                          >
                            <Bookmark size={14} className={savedPostIds?.includes(post.id) ? 'fill-amber-600 text-amber-600' : ''} />
                            <span className="text-[10.5px] font-bold">
                              {savedPostIds?.includes(post.id) ? 'Saved' : 'Save'}
                            </span>
                          </button>

                          {/* 5. Share */}
                          {onSharePost && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onSharePost(post);
                              }}
                              className="text-[#8a8172] hover:text-primary hover:scale-110 active:scale-95 transition-all flex items-center gap-1.5"
                              title="Share post"
                            >
                              <Share2 size={14} />
                              <span className="text-[10.5px] font-bold">Share</span>
                            </button>
                          )}
                        </div>
                      </div>


                    </div>
                  )}
                </article>
              </motion.div>
            );
          })}
        </div>
      )}

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
                  onClick={confirmDeletePost}
                  className="flex-1 font-mono text-[10px] uppercase font-bold text-white bg-rose-600 hover:bg-rose-700 py-2.5 rounded-xl shadow-xs transition-all cursor-pointer"
                >
                  Delete
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
