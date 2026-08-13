import React, { useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Camera, MapPin, Check, Briefcase, Calendar, Eye, Code, Layers, Users, FileText, MessageSquare, Lock } from 'lucide-react';
import { UserProfile } from '../types';

// Photo editor is lazy so the heavy filerobot engine only loads when needed.
const PhotoEditorModal = React.lazy(() => import('./editors/PhotoEditorModal'));

interface IdentityCardProps {
  profile: UserProfile;
  isEditMode: boolean;
  onUpdateProfile: (updated: Partial<UserProfile>) => void;
  isViewingSelf?: boolean;
  isFollowing?: boolean;
  onFollowToggle?: () => void;
  onMessageClick?: () => void;
  isTargetFollowingViewer?: boolean;
  friendStatus?: 'none' | 'sent' | 'received' | 'friends';
  onFriendAction?: (action: 'send' | 'accept' | 'decline' | 'unfriend') => void;
  onFriendsClick?: () => void;
}

export default function IdentityCard({ 
  profile, 
  isEditMode, 
  onUpdateProfile,
  isViewingSelf = true,
  isFollowing = false,
  onFollowToggle,
  onMessageClick,
  isTargetFollowingViewer = false,
  friendStatus = 'none',
  onFriendAction,
  onFriendsClick
}: IdentityCardProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [copied, setCopied] = useState(false);
  const [avatarEditFile, setAvatarEditFile] = useState<File | null>(null);
  const isProfileAnonymous = profile.badgeNumber === 'ANON-99' || profile.name.startsWith('ANON ');

  // Helper to get initials for monogram
  const getInitials = (nameStr: string) => {
    if (!nameStr) return 'PF';
    const parts = nameStr.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  // Helper to generate dynamic ID sequence based on name initials
  const getStylizedId = (nameStr: string) => {
    if (profile.isLocationVerified && profile.username) {
      return profile.username.replace(/-/g, ' ').toUpperCase();
    }
    return '';
  };

  const formatCreditCardStyle = (badgeStr: string | undefined): string => {
    if (!badgeStr) return '0000 0000 0000 0000';
    const clean = badgeStr.replace(/-/g, '').toUpperCase();
    const matches = clean.match(/.{1,4}/g);
    return matches ? matches.join(' ') : clean;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  // Resize + persist an avatar image (dataURL → max 400px JPEG → profile).
  const commitAvatar = (dataUrl: string) => {
    const img = document.createElement('img');
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const max_size = 400;
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
        const outDataUrl = canvas.toDataURL('image/jpeg', 0.7);
        onUpdateProfile({ avatarUrl: outDataUrl });
      } else {
        onUpdateProfile({ avatarUrl: dataUrl });
      }
    };
    img.src = dataUrl;
  };

  // Convert an edited Blob back to a dataURL, then commit as the avatar.
  const commitAvatarBlob = (blob: Blob) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      if (typeof event.target?.result === 'string') commitAvatar(event.target.result);
    };
    reader.readAsDataURL(blob);
  };

  const processFile = (file: File) => {
    if (!file.type.startsWith('image/')) {
      alert('Please upload an image file (PNG, JPG, SVG, WebP)');
      return;
    }
    // Route through the in-app photo editor before committing as the avatar.
    setAvatarEditFile(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = () => {
    setDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const triggerFileInput = () => {
    if (isEditMode && !isProfileAnonymous) {
      fileInputRef.current?.click();
    }
  };

  const removeAvatar = (e: React.MouseEvent) => {
    e.stopPropagation();
    onUpdateProfile({ avatarUrl: '' });
  };

  const initials = getInitials(profile.name);

  return (
    <motion.div 
      id="portfolio-identity-card"
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="relative bg-[#f9f7f2] p-6 md:p-8 shadow-sm transition-all duration-300 mx-0 sm:rounded-3xl border-y sm:border border-[#cfcac0]"
    >
      {/* Decorative Stamp Corner background pattern */}
      <div className="absolute top-4 right-4 pointer-events-none opacity-5 font-mono text-xs select-none">
        MEMBER SECURE ID
      </div>

      {/* PUBLIC ID HEADER */}
      <div className="flex items-center justify-between mb-6 border-b border-[#ebdcca] pb-3">
        <span className="font-mono text-[10px] tracking-widest text-[#8a8172] uppercase font-bold flex items-center gap-1.5">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-600"></span>
          Public Identity
        </span>
      </div>

      {/* CORE INFO ROW */}
      <div className="flex flex-col sm:flex-row gap-6 items-center sm:items-start text-center sm:text-left">
        {/* AVATAR / MONOGRAM SECTION */}
        <div 
          onClick={triggerFileInput}
          onDragOver={isEditMode && !isProfileAnonymous ? handleDragOver : undefined}
          onDragLeave={isEditMode && !isProfileAnonymous ? handleDragLeave : undefined}
          onDrop={isEditMode && !isProfileAnonymous ? handleDrop : undefined}
          className={`relative group shrink-0 ${
            isEditMode && !isProfileAnonymous ? 'cursor-pointer hover:scale-102' : ''
          } transition-all duration-200`}
        >
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileChange} 
            accept="image/*" 
            className="hidden" 
          />

          <div className={`w-24 h-24 rounded-2xl border-2 border-[#b0a797] flex items-center justify-center overflow-hidden transition-all duration-200 ${
            dragOver ? 'bg-[#ebdcca] border-dashed scale-105' : 'bg-[#e9e4d9]'
          }`}>
            {profile.avatarUrl ? (
              <img 
                src={profile.avatarUrl || null} 
                alt={profile.name} 
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <span className="font-display font-medium text-3xl tracking-tight text-[#5c5446]">
                {initials}
              </span>
            )}

            {/* Edit Mode Hover Overlay */}
            {isEditMode && !isProfileAnonymous && (
              <div className="absolute inset-0 bg-[#3a342a]/60 rounded-2xl flex flex-col items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity duration-200 p-1">
                <Camera size={18} className="mb-0.5" />
                <span className="text-[9px] font-mono font-medium text-center leading-none">
                  {profile.avatarUrl ? 'Change' : 'Upload'}
                </span>
              </div>
            )}
          </div>

          {/* Avatar Removal button in Edit Mode */}
          {isEditMode && !isProfileAnonymous && profile.avatarUrl && (
            <button 
              onClick={removeAvatar}
              className="absolute -top-1 -right-1 bg-red-100 text-red-700 hover:bg-red-200 rounded-full p-1 border border-red-300 shadow-sm transition-colors duration-150"
              title="Remove profile image"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
          )}
        </div>

        {/* TEXT DETAILS CONTAINER */}
        <div className="flex-1 w-full space-y-3">
          {/* USER NAME */}
          <div className="relative">
            {isEditMode ? (
              <div className="space-y-1">
                <label className="block text-[10px] font-mono text-[#8a8172] uppercase tracking-wider">
                  User's Name {isProfileAnonymous && "🔒 (LOCKED)"}
                </label>
                <input 
                  type="text"
                  value={profile.name}
                  onChange={(e) => onUpdateProfile({ name: e.target.value })}
                  placeholder="Enter name"
                  maxLength={40}
                  disabled={isProfileAnonymous}
                  className={`w-full ${isProfileAnonymous ? 'bg-[#ebdcca]/20 text-[#8a8172] cursor-not-allowed border-dashed' : 'bg-white text-[#3a342a]'} border border-[#cfcac0] rounded-lg px-3 py-1.5 font-display text-xl focus:outline-none focus:ring-1 focus:ring-[#8a8172]`}
                />
                {isProfileAnonymous && (
                  <p className="text-[9px] text-amber-800 font-mono">
                    ⚠️ Anonymous identity is deterministic and cannot be modified.
                  </p>
                )}
              </div>
            ) : (
              <h1 className="font-display font-bold text-2xl md:text-3xl text-[#3a342a] tracking-tight transition-colors duration-200">
                {profile.name || "Untitled Profile"}
              </h1>
            )}
          </div>

          {/* EDITABLE BIO */}
          <div className="relative">
            {isEditMode ? (
              <div className="space-y-1">
                <label className="block text-[10px] font-mono text-[#8a8172] uppercase tracking-wider">Bio / Description</label>
                <textarea 
                  value={profile.bio}
                  onChange={(e) => {
                    const text = e.target.value;
                    onUpdateProfile({ bio: text.slice(0, 69) });
                  }}
                  placeholder="Enter biography..."
                  rows={2}
                  maxLength={69}
                  className="w-full bg-white border border-[#cfcac0] rounded-lg p-3 font-sans text-xs text-[#5c5446] leading-relaxed focus:outline-none focus:ring-1 focus:ring-[#8a8172]"
                />
                <div className="flex justify-between items-center mt-1">
                  <span className="text-[10px] text-[#aaa090]">
                    Max 69 letters
                  </span>
                  <span className={`text-[10px] font-mono ${(profile.bio || '').length >= 65 ? 'text-amber-600 font-bold' : 'text-[#8a8172]'}`}>
                    {(profile.bio || '').length} / 69 letters
                  </span>
                </div>
              </div>
            ) : (
              <p className="font-sans text-sm text-[#5c5446] leading-relaxed max-w-lg">
                {(profile.bio || "No biography provided. Enter one in edit mode.").slice(0, 69)}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* MONOSPACE ID SEQUENCE */}
      <div className="mt-6 md:mt-8 py-3 px-4 bg-[#f0ede6] border border-[#ebdcca] rounded-xl flex flex-row items-center justify-between gap-3">
        <div className="flex flex-col min-w-0 w-full">
          <div className="flex flex-row items-center justify-between sm:justify-start gap-2.5 w-full min-w-0">
            <button
              onClick={() => {
                if (profile.badgeNumber) {
                  navigator.clipboard.writeText(formatCreditCardStyle(profile.badgeNumber));
                  window.dispatchEvent(new CustomEvent('show-toast', { detail: { message: "✓ Secure ID copied to clipboard!" } }));
                }
              }}
              className="font-mono text-xs min-[320px]:text-sm sm:text-base font-bold tracking-wider text-[#3a342a] hover:text-amber-800 hover:underline text-left flex items-center gap-1 transition-colors cursor-pointer truncate min-w-0"
              title="Click to copy ID Number to clipboard"
            >
              <span className="truncate">{formatCreditCardStyle(profile.badgeNumber || 'BD-00-000-00')}</span>
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 opacity-60 hover:opacity-100 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
              </svg>
            </button>
            <span className={`inline-flex items-center gap-1 font-mono text-[8px] sm:text-[9px] font-bold uppercase tracking-wider ${
              profile.isLocationVerified 
                ? "bg-emerald-50 text-emerald-800 border border-emerald-200/60" 
                : "bg-amber-50 text-amber-800 border border-amber-200/60"
            } rounded px-1.5 py-0.5 shadow-[0_1px_1px_rgba(0,0,0,0.03)] whitespace-nowrap shrink-0`}>
              {profile.isLocationVerified ? <Check size={7} /> : null}
              {profile.isLocationVerified ? "Verified ID" : "Unverified ID"}
            </span>
          </div>
        </div>
      </div>

      {/* METADATA BAR (Replacing IP address & Coordinates) */}
      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 items-center text-xs text-[#8a8172] font-mono">
        {isEditMode ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
            <div>
              <label className="block text-[9px] text-[#8a8172] uppercase flex items-center gap-1 font-bold">
                <Lock size={10} className="text-amber-800" />
                Region-Locked Location
              </label>
              <div className="flex items-center gap-1.5 mt-1">
                <span className="font-sans text-xs text-[#8a8172] font-medium bg-[#ebdcca]/10 px-2.5 py-1.5 rounded-lg border border-[#ebdcca]/40 block flex-1 truncate cursor-not-allowed">
                  {profile.location || 'Distributed'}
                </span>
              </div>
            </div>
            <div>
              <label className="block text-[9px] text-[#8a8172] uppercase">Availability</label>
              <select 
                value={profile.availability}
                onChange={(e) => onUpdateProfile({ availability: e.target.value as any })}
                className="w-full bg-white border border-[#cfcac0] rounded-lg px-2.5 py-1.5 text-xs text-[#3a342a] focus:outline-none focus:ring-1 focus:ring-[#8a8172] mt-1"
              >
                <option value="Single">Single</option>
                <option value="Married">Married</option>
                <option value="Engaged">Engaged</option>
                <option value="Moved on">Moved on</option>
                <option value="In a relationship">In a relationship</option>
                <option value="Divorced">Divorced</option>
              </select>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 w-full justify-center sm:justify-start divide-x divide-[#cfcac0]/60 text-[11px]">
            <span className="flex items-center gap-1.5 pr-2">
              <MapPin size={11} className="text-[#8a8172]" />
              {profile.location || 'Distributed'}
            </span>
            <span className="flex items-center gap-1.5 px-2">
              <Calendar size={11} className="text-[#8a8172]" />
              Joined {profile.sinceDate}
            </span>
            <span className="flex items-center gap-1.5 pl-2 font-semibold">
              <span className={`w-2 h-2 rounded-full ${
                profile.availability === 'Single' || profile.availability === 'Available' ? 'bg-emerald-500' :
                profile.availability === 'Married' || profile.availability === 'Busy' ? 'bg-indigo-500' :
                profile.availability === 'Engaged' || profile.availability === 'Mentoring' ? 'bg-pink-500' :
                profile.availability === 'Moved on' ? 'bg-[#92400e]' :
                profile.availability === 'In a relationship' || profile.availability === 'Freelance' ? 'bg-sky-500' :
                profile.availability === 'Divorced' ? 'bg-red-500' :
                'bg-amber-500'
              }`}></span>
              {profile.availability || 'Single'}
            </span>
          </div>
        )}
      </div>

      <hr className="my-5 border-t border-[#ebdcca]" style={{ display: 'none' }} />

      {/* REAL-TIME DYNAMIC STATS (Friends and Posts) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-t border-[#ebdcca] pt-5 mt-5">
        <div className="flex items-center gap-6 justify-center sm:justify-start text-sm">
          <div 
            id="followers-stat" 
            onClick={onFriendsClick}
            className={`flex items-center gap-1.5 text-[#3a342a] ${onFriendsClick ? 'cursor-pointer hover:opacity-85 active:scale-95 transition-all select-none' : ''}`}
            title={onFriendsClick ? "View connections list" : undefined}
          >
            <Users size={14} className="text-[#8a8172]" />
            <span className="font-mono font-bold">{profile.followersCount ?? 0}</span>
            <span className="text-[#8a8172] font-sans text-xs hover:underline">friends</span>
          </div>

          <div id="posts-stat" className="flex items-center gap-1.5 text-[#3a342a]">
            <FileText size={14} className="text-[#8a8172]" />
            <span className="font-mono font-bold">{profile.postsCount ?? 0}</span>
            <span className="text-[#8a8172] font-sans text-xs">posts</span>
          </div>
        </div>

        {/* Friend System & Message buttons */}
        {!isViewingSelf && (
          <div className="flex flex-wrap items-center gap-2 justify-center sm:justify-end">
            {onFriendAction && (() => {
              if (friendStatus === 'friends') {
                return (
                  <button
                    onClick={() => onFriendAction('unfriend')}
                    className="font-mono text-[10px] uppercase font-bold py-1.5 px-4 rounded-xl border bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-red-50 hover:text-red-700 hover:border-red-200 transition-all cursor-pointer"
                    title="Unfriend this user"
                  >
                    ✓ Friends
                  </button>
                );
              } else if (friendStatus === 'sent') {
                return (
                  <button
                    disabled
                    className="font-mono text-[10px] uppercase font-bold py-1.5 px-4 rounded-xl border bg-[#ebdcca]/30 text-[#8a8172] border-[#ebdcca] cursor-not-allowed"
                  >
                    Pending Request
                  </button>
                );
              } else if (friendStatus === 'received') {
                return (
                  <div className="flex gap-2">
                    <button
                      onClick={() => onFriendAction('accept')}
                      className="font-mono text-[10px] uppercase font-bold py-1.5 px-3 rounded-xl bg-emerald-700 text-white hover:bg-emerald-800 transition-all cursor-pointer"
                    >
                      Accept
                    </button>
                    <button
                      onClick={() => onFriendAction('decline')}
                      className="font-mono text-[10px] uppercase font-bold py-1.5 px-3 rounded-xl bg-red-100 text-red-700 hover:bg-red-200 border border-red-200 transition-all cursor-pointer"
                    >
                      Decline
                    </button>
                  </div>
                );
              } else {
                if (profile.allowConnections === false) {
                  return (
                    <button
                      disabled
                      className="font-mono text-[10px] uppercase font-bold py-1.5 px-4 rounded-xl border bg-[#ebdcca]/20 text-[#8a8172]/60 border-[#ebdcca]/40 cursor-not-allowed"
                      title="This user has disabled their follow / friend system."
                    >
                      Connections Off
                    </button>
                  );
                }
                return (
                  <button
                    onClick={() => onFriendAction('send')}
                    className="font-mono text-[10px] uppercase font-bold py-1.5 px-4 rounded-xl border bg-[#3a342a] text-[#f4f1ea] border-transparent hover:bg-[#52493b] transition-all cursor-pointer"
                  >
                    Add Friend
                  </button>
                );
              }
            })()}

            {onMessageClick && (() => {
              const isPublicMessagingOn = profile.isPublicMessagingEnabled !== false;
              const isFriendOrConnected = friendStatus === 'friends' || isFollowing || isTargetFollowingViewer;
              const allowedByOldLock = !profile.isMessageLocked || isTargetFollowingViewer;
              
              const canMessage = allowedByOldLock && (isPublicMessagingOn || isFriendOrConnected);
              
              if (canMessage) {
                return (
                  <button
                    onClick={onMessageClick}
                    className="font-mono text-[10px] uppercase font-bold py-1.5 px-4 rounded-xl transition-all shadow-xs duration-150 flex items-center gap-1.5 hover:scale-102 active:scale-98 bg-[#3a342a] text-[#f4f1ea] hover:bg-[#52493b]"
                  >
                    <MessageSquare size={12} />
                    Message
                  </button>
                );
              } else {
                return (
                  <button
                    disabled
                    className="font-mono text-[10px] uppercase font-bold py-1.5 px-4 rounded-xl transition-all shadow-xs duration-150 flex items-center gap-1.5 bg-[#ebdcca]/40 text-[#8a8172] border border-[#cfcac0] cursor-not-allowed"
                    title={!isPublicMessagingOn ? "This user restricts direct messaging to friends or followers only." : "This user restricts direct messaging to followed accounts only."}
                  >
                    <Lock size={12} />
                    Inbox Restricted
                  </button>
                );
              }
            })()}
          </div>
        )}

      {/* Avatar photo editor */}
      <React.Suspense fallback={null}>
        {avatarEditFile && (
          <PhotoEditorModal
            src={avatarEditFile}
            open={!!avatarEditFile}
            onClose={() => setAvatarEditFile(null)}
            onSave={(blob) => {
              commitAvatarBlob(blob);
              setAvatarEditFile(null);
            }}
          />
        )}
      </React.Suspense>
      </div>
    </motion.div>
  );
}
