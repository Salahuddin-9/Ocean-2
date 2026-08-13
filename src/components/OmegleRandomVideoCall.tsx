import React, { useState, useRef, useEffect } from 'react';
import {
  Video,
  VideoOff,
  Mic,
  MicOff,
  PhoneOff,
  RefreshCw,
  Send,
  Sparkles,
  MessageSquare,
  Shield,
  Eye,
  EyeOff,
  Users,
  AlertCircle,
  X,
  Lock,
} from 'lucide-react';
import { useCallEngine } from '../calling/useCallEngine';

export interface OmegleRandomVideoCallProps {
  currentUser: {
    id: string;
    name: string;
    avatarUrl?: string;
    countryCode?: string;
  } | null;
  interests?: string[];
  token?: string | null;
  onShowToast?: (msg: string) => void;
  onClose?: () => void;
}

export default function OmegleRandomVideoCall({
  currentUser,
  interests = ['Design', 'Music', 'Coding', 'Travel', 'Art'],
  token,
  onShowToast,
  onClose,
}: OmegleRandomVideoCallProps) {
  const [tagInput, setTagInput] = useState('');
  const [activeInterests, setActiveInterests] = useState<string[]>(interests);
  const [chatInput, setChatInput] = useState('');
  const chatBottomRef = useRef<HTMLDivElement>(null);

  const handleToast = (msg: string) => {
    if (onShowToast) onShowToast(msg);
  };

  const {
    status,
    stranger,
    sharedInterests,
    roomId,
    isMuted,
    isCameraOff,
    isVideoConsented,
    setIsVideoConsented,
    localStream,
    remoteStreamConnected,
    messages,
    unreadCount,
    setUnreadCount,
    isChatOpen,
    setIsChatOpen,
    cooldownSeconds,
    localVideoRef,
    remoteVideoRef,
    startSearch,
    skipMatch,
    stopCall,
    sendMessage,
    toggleMute,
    toggleCamera,
  } = useCallEngine({
    currentUser,
    interests: activeInterests,
    token,
    onToast: handleToast,
  });

  // Auto-scroll chat to bottom when new messages arrive
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isChatOpen]);

  // Handle Interest Tag addition
  const handleAddTag = (e: React.KeyboardEvent | React.MouseEvent) => {
    if ('key' in e && e.key !== 'Enter') return;
    e.preventDefault();
    const tag = tagInput.trim();
    if (tag && !activeInterests.includes(tag)) {
      setActiveInterests([...activeInterests, tag]);
      setTagInput('');
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setActiveInterests(activeInterests.filter((t) => t !== tagToRemove));
  };

  // Handle Send Chat
  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    sendMessage(chatInput);
    setChatInput('');
  };

  return (
    <div
      id="omegle-random-video-call-root"
      className="bg-[#fdfbf7] border-2 border-[#cfcac0] text-[#3a342a] rounded-3xl p-4 sm:p-6 shadow-2xl min-h-[580px] max-w-6xl mx-auto flex flex-col justify-between overflow-hidden relative"
    >
      {/* ── HEADER BAR ── */}
      <div className="flex flex-wrap items-center justify-between border-b border-[#ebdcca] pb-4 mb-4 gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-2xl bg-gradient-to-tr from-amber-500/20 to-amber-600/10 text-amber-700 border border-amber-500/30">
            <Video size={22} className={status === 'connected' ? 'animate-pulse' : ''} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-display font-black text-base sm:text-lg tracking-tight uppercase text-[#3a342a]">
                Meet Unknow
              </h1>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Status badge */}
          {status === 'connected' && (
            <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/30 px-3.5 py-1.5 rounded-full text-emerald-700 text-[10px] font-mono uppercase font-bold animate-pulse">
              <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
              LIVE CONNECTED
            </div>
          )}

          {status === 'searching' && (
            <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 px-3.5 py-1.5 rounded-full text-amber-700 text-[10px] font-mono uppercase font-bold animate-pulse">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping"></span>
              SEARCHING...
            </div>
          )}

          {status === 'cooldown' && (
            <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 px-3.5 py-1.5 rounded-full text-red-700 text-[10px] font-mono uppercase font-bold">
              <Lock size={12} />
              SPAM FILTER ({cooldownSeconds}s)
            </div>
          )}

          {onClose && (
            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-[#fbf9f4] hover:bg-[#ebdcca] text-[#8a8172] hover:text-[#3a342a] transition-all border border-[#2d2d3e]"
              title="Close component"
            >
              <X size={18} />
            </button>
          )}
        </div>
      </div>

      {/* ── INTEREST TAGS BAR (When Idle) ── */}
      {status === 'idle' && (
        <div className="mb-4 bg-[#f4f1ea] border border-[#ebdcca] rounded-2xl p-3 sm:p-4">
          <div className="flex items-center gap-2 mb-2 text-xs font-mono font-bold text-[#8a8172] uppercase">
            <Sparkles size={14} className="text-amber-700" />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {activeInterests.map((tag) => (
              <span
                key={tag}
                className="bg-white text-[#3a342a] border border-[#ebdcca] px-2.5 py-1 rounded-xl text-xs flex items-center gap-1.5 font-medium group"
              >
                #{tag}
                <button
                  onClick={() => handleRemoveTag(tag)}
                  className="text-[#8a8172] hover:text-red-700 transition-colors"
                >
                  <X size={12} />
                </button>
              </span>
            ))}
            <div className="flex items-center gap-1">
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={handleAddTag}
                placeholder="Add interest tag..."
                className="bg-white border border-[#ebdcca] rounded-xl px-2.5 py-1 text-xs text-[#3a342a] focus:outline-none focus:border-amber-500/50 w-32"
              />
              <button
                onClick={handleAddTag}
                className="bg-[#ebdcca] hover:bg-amber-600 text-[#3a342a] text-xs px-2.5 py-1 rounded-xl font-bold transition-all"
              >
                +
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MAIN WORKSPACE / VIEWPORTS AREA ── */}
      <div className="flex-1 flex flex-col lg:flex-row gap-4 items-stretch justify-center relative min-h-[360px]">
        
        {/* VIEWPORT AREA */}
        <div className="flex-1 flex flex-col gap-3 relative min-h-[340px]">
          
          {/* IDLE STATE */}
          {status === 'idle' && (
            <div className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-[#ebdcca] rounded-2xl p-6 sm:p-10 text-center bg-[#fbf9f4] min-h-[320px]">
              <div className="w-20 h-20 rounded-3xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-700 mb-4 shadow-lg shadow-amber-500/5">
                <Video size={38} />
              </div>
              <h2 className="font-display font-bold text-lg sm:text-xl uppercase text-[#3a342a] tracking-wide">
                Start Instant Random Video Call
              </h2>


              <button
                onClick={startSearch}
                className="mt-6 inline-flex items-center gap-2.5 font-mono text-xs uppercase font-bold text-[#3a342a] bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 py-3.5 px-8 rounded-2xl shadow-lg shadow-amber-500/20 hover:scale-102 active:scale-98 transition-all animate-bounce"
              >
                <Sparkles size={16} />
                Start Random Video Call
              </button>
            </div>
          )}

          {/* SEARCHING STATE */}
          {status === 'searching' && (
            <div className="flex-1 flex flex-col items-center justify-center border border-[#ebdcca] rounded-2xl p-8 text-center bg-[#fbf9f4] min-h-[320px] relative overflow-hidden">
              <div className="absolute inset-0 bg-radial from-amber-500/10 to-transparent pointer-events-none animate-pulse" />
              <div className="relative z-10 space-y-4">
                <div className="relative w-20 h-20 mx-auto">
                  <div className="absolute inset-0 border-4 border-amber-500/20 rounded-full animate-ping" />
                  <div className="w-20 h-20 rounded-full border-4 border-amber-500 border-t-transparent animate-spin flex items-center justify-center bg-[#fbf9f4]">
                    <Users size={28} className="text-amber-700" />
                  </div>
                </div>
                <h3 className="font-display font-bold text-base uppercase text-amber-900 tracking-wider">
                  Searching for a stranger...
                </h3>
                <p className="font-mono text-xs text-[#8a8172] max-w-sm mx-auto">
                  Matching with someone who shares your interests or is waiting in queue.
                </p>

                <button
                  onClick={stopCall}
                  className="mt-2 font-mono text-xs uppercase font-bold py-2 px-5 rounded-xl bg-red-500/10 text-red-700 hover:bg-red-500/20 transition-all border border-red-500/30"
                >
                  Cancel Search
                </button>
              </div>
            </div>
          )}

          {/* COOLDOWN STATE */}
          {status === 'cooldown' && (
            <div className="flex-1 flex flex-col items-center justify-center border border-red-500/30 rounded-2xl p-8 text-center bg-red-50 min-h-[320px]">
              <AlertCircle size={44} className="text-red-700 mb-3 animate-bounce" />
              <h3 className="font-display font-bold text-base uppercase text-red-900">
                Anti-Spam Filter Active
              </h3>
              <p className="text-xs text-red-700 max-w-sm mt-2 font-mono">
                Rapid consecutive skips detected. Please wait <span className="font-bold text-red-700 text-sm">{cooldownSeconds}s</span> before looking for another match.
              </p>
            </div>
          )}

          {/* CONNECTED STATE (ACTIVE CALL) */}
          {status === 'connected' && stranger && (
            <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-3 min-h-[320px]">
              
              {/* REMOTE VIEWPORT */}
              <div className="relative bg-[#2e2920] border border-[#ebdcca] rounded-2xl overflow-hidden flex items-center justify-center shadow-inner group min-h-[260px]">
                <video
                  ref={remoteVideoRef}
                  autoPlay
                  playsInline
                  className={`absolute inset-0 w-full h-full object-cover transition-all ${
                    !isVideoConsented ? 'blur-2xl opacity-30 scale-105' : 'blur-none opacity-100'
                  }`}
                />

                {/* Video Safety Overlay / Blur consent if disabled */}
                {!isVideoConsented && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#3a342a]/90 backdrop-blur-md p-4 text-center z-20 space-y-3">
                    <Shield size={32} className="text-amber-500" />
                    <p className="text-xs font-mono text-[#f4f1ea] max-w-xs">
                      Safety Shield: Remote stream is blurred by default for safety.
                    </p>
                    <button
                      onClick={() => setIsVideoConsented(true)}
                      className="inline-flex items-center gap-1.5 font-mono text-xs uppercase font-bold bg-amber-500 hover:bg-amber-400 text-[#3a342a] px-4 py-2 rounded-xl transition-all"
                    >
                      <Eye size={14} /> Unblur Video
                    </button>
                  </div>
                )}

                {/* Stream Connecting/Loading Placeholder */}
                {!remoteStreamConnected && isVideoConsented && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-b from-[#3a342a]/90 to-[#231f18]/95 p-4 text-center z-10">
                    <div className="w-20 h-20 rounded-2xl border-2 border-amber-500/40 bg-white flex items-center justify-center text-amber-900 font-display font-bold text-3xl mb-2 animate-pulse">
                      {stranger.displayName.charAt(0)}
                    </div>
                    <h4 className="font-bold text-sm text-[#3a342a]">{stranger.displayName}</h4>
                    <p className="text-[10px] text-amber-700 font-mono mt-1 animate-pulse">
                      ESTABLISHING WebRTC MEDIA STREAMS...
                    </p>
                  </div>
                )}

                {/* Participant badge */}
                <div className="absolute top-3 left-3 bg-[#3a342a]/80 backdrop-blur-md px-3 py-1 rounded-xl border border-[#ebdcca]/20 text-[10px] font-mono uppercase text-[#ebdcca] z-20 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                  Stranger: {stranger.displayName}
                </div>

                {/* Safety Unblur Toggle Button */}
                <button
                  onClick={() => setIsVideoConsented(!isVideoConsented)}
                  className="absolute top-3 right-3 bg-[#3a342a]/80 hover:bg-[#3a342a] p-2 rounded-xl border border-[#ebdcca]/20 text-[#ebdcca] z-20 transition-all"
                  title={isVideoConsented ? 'Blur Remote Video' : 'Unblur Remote Video'}
                >
                  {isVideoConsented ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>

                {/* Shared Interests Badge */}
                {sharedInterests.length > 0 && (
                  <div className="absolute bottom-3 left-3 bg-[#3a342a]/80 backdrop-blur-md px-2.5 py-1 rounded-lg border border-[#ebdcca]/20 text-[9px] font-mono text-[#ebdcca] z-20">
                    Shared: {sharedInterests.join(', ')}
                  </div>
                )}
              </div>

              {/* LOCAL VIEWPORT */}
              <div className="relative bg-[#2e2920] border border-[#ebdcca] rounded-2xl overflow-hidden flex items-center justify-center shadow-inner min-h-[260px]">
                {localStream && !isCameraOff ? (
                  <video
                    ref={localVideoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover transform -scale-x-100"
                  />
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#fbf9f4] p-4 text-center">
                    <VideoOff size={32} className="text-[#8a8172] mb-2" />
                    <p className="font-mono text-xs uppercase text-[#8a8172]">Camera Disabled</p>
                  </div>
                )}

                <div className="absolute top-3 left-3 bg-[#3a342a]/80 backdrop-blur-md px-3 py-1 rounded-xl border border-[#ebdcca]/20 text-[10px] font-mono uppercase text-[#ebdcca] z-20">
                  You {isMuted && '• MUTED'}
                </div>
              </div>

            </div>
          )}

          {/* CONTROL TOOLBAR */}
          {(status === 'connected' || status === 'searching') && (
            <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3 bg-[#fbf9f4] border border-[#ebdcca] p-3 rounded-2xl">
              <button
                onClick={toggleMute}
                disabled={status !== 'connected'}
                className={`p-3 rounded-xl flex items-center justify-center transition-all ${
                  isMuted
                    ? 'bg-red-500/20 text-red-700 border border-red-500/40'
                    : 'bg-white text-[#3a342a] hover:bg-[#fbf9f4] border border-[#cfcac0]'
                }`}
                title={isMuted ? 'Unmute Microphone' : 'Mute Microphone'}
              >
                {isMuted ? <MicOff size={18} /> : <Mic size={18} />}
              </button>

              <button
                onClick={toggleCamera}
                disabled={status !== 'connected'}
                className={`p-3 rounded-xl flex items-center justify-center transition-all ${
                  isCameraOff
                    ? 'bg-red-500/20 text-red-700 border border-red-500/40'
                    : 'bg-white text-[#3a342a] hover:bg-[#fbf9f4] border border-[#cfcac0]'
                }`}
                title={isCameraOff ? 'Turn Camera On' : 'Turn Camera Off'}
              >
                {isCameraOff ? <VideoOff size={18} /> : <Video size={18} />}
              </button>

              {/* Chat Toggle Button */}
              <button
                onClick={() => {
                  setIsChatOpen(!isChatOpen);
                  if (!isChatOpen) setUnreadCount(0);
                }}
                className={`p-3 rounded-xl flex items-center justify-center transition-all relative ${
                  isChatOpen
                    ? 'bg-amber-500 text-[#3a342a] font-bold'
                    : 'bg-white text-[#3a342a] hover:bg-[#fbf9f4] border border-[#cfcac0]'
                }`}
                title="Toggle Live Chat"
              >
                <MessageSquare size={18} />
                {unreadCount > 0 && !isChatOpen && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-[#3a342a] text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                    {unreadCount}
                  </span>
                )}
              </button>

              {/* HIGH PRIORITY SKIP / NEXT MATCH BUTTON */}
              <button
                onClick={skipMatch}
                className="inline-flex items-center gap-2 font-mono text-xs uppercase font-bold py-3 px-5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-[#3a342a] transition-all shadow-md active:scale-95"
                title="Skip to next stranger immediately"
              >
                <RefreshCw size={15} className="animate-spin" style={{ animationDuration: '6s' }} />
                <span>Skip / Next Stranger</span>
              </button>

              {/* DISCONNECT BUTTON */}
              <button
                onClick={stopCall}
                className="inline-flex items-center gap-1.5 font-mono text-xs uppercase font-bold py-3 px-4 rounded-xl bg-red-600/20 hover:bg-red-600/30 text-red-700 border border-red-500/30 transition-all"
                title="Stop call and disconnect"
              >
                <PhoneOff size={15} />
                <span>Stop</span>
              </button>
            </div>
          )}

        </div>

        {/* ── CHAT PANEL ── */}
        {(isChatOpen || status === 'connected') && (
          <div className="w-full lg:w-80 bg-[#fbf9f4] border border-[#ebdcca] rounded-2xl p-3 sm:p-4 flex flex-col justify-between min-h-[300px]">
            <div className="flex items-center justify-between border-b border-[#ebdcca] pb-2.5 mb-2">
              <span className="font-mono text-xs uppercase font-bold text-amber-700 flex items-center gap-1.5">
                <MessageSquare size={14} /> Live Messenger
              </span>
              {stranger && (
                <span className="text-[10px] font-mono text-[#8a8172] truncate max-w-[120px]">
                  {stranger.displayName}
                </span>
              )}
            </div>

            {/* Messages list */}
            <div className="flex-1 overflow-y-auto space-y-2.5 pr-1 max-h-[260px] min-h-[180px] text-xs">
              {messages.length === 0 ? (
                <div className="text-center py-10 text-[#8a8172] font-mono text-[10px] uppercase border border-dashed border-[#ebdcca] rounded-xl">
                  {status === 'connected' ? 'Type a message to stranger below' : 'Waiting for connection...'}
                </div>
              ) : (
                messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${
                      msg.isSystem ? 'items-center' : msg.fromSelf ? 'items-end' : 'items-start'
                    }`}
                  >
                    {msg.isSystem ? (
                      <div className="bg-white text-amber-900 border border-amber-500/20 text-[10px] font-mono px-2.5 py-1 rounded-lg text-center my-1 w-full">
                        {msg.text}
                      </div>
                    ) : (
                      <div
                        className={`max-w-[85%] rounded-2xl px-3 py-2 leading-relaxed ${
                          msg.fromSelf
                            ? 'bg-amber-500 text-[#3a342a] font-medium rounded-tr-none'
                            : 'bg-white text-[#3a342a] rounded-tl-none border border-[#ebdcca]'
                        }`}
                      >
                        {!msg.fromSelf && (
                          <div className="text-[9px] font-mono text-amber-700 font-bold mb-0.5">
                            {msg.displayName}
                          </div>
                        )}
                        <p className="break-words">{msg.text}</p>
                      </div>
                    )}
                  </div>
                ))
              )}
              <div ref={chatBottomRef} />
            </div>

            {/* Chat Input Form */}
            <form onSubmit={handleSendChat} className="flex gap-1.5 mt-3 border-t border-[#ebdcca] pt-3">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder={status === 'connected' ? 'Say something...' : 'Match to start chat'}
                disabled={status !== 'connected'}
                maxLength={300}
                className="flex-1 bg-white border border-[#ebdcca] rounded-xl px-3 py-2 text-xs text-[#3a342a] focus:outline-none focus:border-amber-500/60 disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={status !== 'connected' || !chatInput.trim()}
                className="p-2.5 rounded-xl bg-amber-500 text-[#3a342a] hover:bg-amber-400 transition-all disabled:opacity-40"
              >
                <Send size={14} />
              </button>
            </form>
          </div>
        )}

      </div>


    </div>
  );
}
