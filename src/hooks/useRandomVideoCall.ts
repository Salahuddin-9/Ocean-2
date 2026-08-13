import { useState, useEffect, useRef, useCallback } from 'react';
import { getIceServers } from '../lib/rtcConfig';

export type CallStatus = 'idle' | 'searching' | 'connected' | 'disconnected' | 'cooldown';

export interface StrangerProfile {
  id: string;
  displayName: string;
  interests: string[];
  avatarUrl?: string;
  ageGroup?: string;
  countryCode?: string;
}

export interface ChatMessage {
  id: string;
  text: string;
  displayName: string;
  timestamp: number;
  fromSelf: boolean;
  isSystem?: boolean;
}

export interface UseRandomVideoCallParams {
  currentUser: {
    id: string;
    name: string;
    avatarUrl?: string;
    countryCode?: string;
  } | null;
  interests?: string[];
  token?: string | null;
  onToast?: (msg: string) => void;
}

export function useRandomVideoCall({
  currentUser,
  interests = [],
  token,
  onToast,
}: UseRandomVideoCallParams) {
  // States
  const [status, setStatus] = useState<CallStatus>('idle');
  const [stranger, setStranger] = useState<StrangerProfile | null>(null);
  const [sharedInterests, setSharedInterests] = useState<string[]>([]);
  const [roomId, setRoomId] = useState<string | null>(null);

  // Audio/Video controls
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [isVideoConsented, setIsVideoConsented] = useState(true);

  // Media streams
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [remoteStreamConnected, setRemoteStreamConnected] = useState(false);

  // Chat
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isChatOpen, setIsChatOpen] = useState(false);

  // Cooldown
  const [cooldownSeconds, setCooldownSeconds] = useState(0);

  // Refs
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);

  // Interval refs
  const matchIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const messageIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const signalIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const cooldownTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastSignalTimeRef = useRef<number>(0);
  const consecutiveSkipsRef = useRef<number>(0);
  const lastSkipTimeRef = useRef<number>(0);

  // Helper for toast messages
  const notify = useCallback(
    (msg: string) => {
      if (onToast) onToast(msg);
    },
    [onToast]
  );

  // Clear all intervals & WebRTC peer connection
  const cleanupCallResources = useCallback(() => {
    if (matchIntervalRef.current) {
      clearInterval(matchIntervalRef.current);
      matchIntervalRef.current = null;
    }
    if (messageIntervalRef.current) {
      clearInterval(messageIntervalRef.current);
      messageIntervalRef.current = null;
    }
    if (signalIntervalRef.current) {
      clearInterval(signalIntervalRef.current);
      signalIntervalRef.current = null;
    }
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    setRemoteStreamConnected(false);
    lastSignalTimeRef.current = 0;
  }, []);

  // Stop local media tracks
  const stopLocalStream = useCallback(() => {
    if (localStream) {
      localStream.getTracks().forEach((track) => track.stop());
      setLocalStream(null);
    }
  }, [localStream]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      cleanupCallResources();
      if (cooldownTimerRef.current) clearInterval(cooldownTimerRef.current);
      if (localStream) {
        localStream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [cleanupCallResources, localStream]);

  // Hook local video element to stream
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream, status, isCameraOff]);

  // Hook remote video element to stream
  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
      remoteVideoRef.current.play().catch(() => {});
    }
  }, [remoteStream, status]);

  // Handle signal polling
  const pollSignals = useCallback(
    async (rId: string, peerId: string) => {
      try {
        const res = await fetch(
          `/api/meet/room/${rId}/signals?lastTimestamp=${lastSignalTimeRef.current}`,
          {
            headers: {
              Authorization: token ? `Bearer ${token}` : '',
            },
          }
        );
        if (!res.ok) return;
        const data = await res.json();

        for (const signal of data.signals) {
          if (signal.timestamp > lastSignalTimeRef.current) {
            lastSignalTimeRef.current = signal.timestamp;
          }

          if (signal.senderId === currentUser?.id) continue;

          const pc = pcRef.current;
          if (!pc) continue;

          if (signal.type === 'offer') {
            await pc.setRemoteDescription(new RTCSessionDescription(signal.payload));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            await fetch(`/api/meet/room/${rId}/signal`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: token ? `Bearer ${token}` : '',
              },
              body: JSON.stringify({ type: 'answer', payload: answer }),
            });
          } else if (signal.type === 'answer') {
            await pc.setRemoteDescription(new RTCSessionDescription(signal.payload));
          } else if (signal.type === 'candidate') {
            try {
              await pc.addIceCandidate(new RTCIceCandidate(signal.payload));
            } catch (e) {
              console.error('Error adding candidate', e);
            }
          }
        }
      } catch (err) {
        console.error('Signal poll error:', err);
      }
    },
    [currentUser?.id, token]
  );

  // Poll chat messages
  const pollMessages = useCallback(
    async (rId: string) => {
      try {
        const res = await fetch(`/api/meet/room/${rId}/messages`, {
          headers: {
            Authorization: token ? `Bearer ${token}` : '',
          },
        });
        if (!res.ok) return;
        const data = await res.json();

        const formatted: ChatMessage[] = data.messages.map((m: any) => ({
          id: m.id || `msg-${m.timestamp}`,
          text: m.text,
          displayName: m.senderId === currentUser?.id ? 'You' : stranger?.displayName || 'Stranger',
          timestamp: m.timestamp,
          fromSelf: m.senderId === currentUser?.id,
        }));

        setMessages(formatted);
      } catch (err) {
        console.error('Message poll error:', err);
      }
    },
    [currentUser?.id, stranger?.displayName, token]
  );

  // Initialize WebRTC
  const initWebRTC = useCallback(
    async (rId: string, peerId: string) => {
      try {
        const pc = new RTCPeerConnection({
          iceServers: getIceServers(),
        });
        pcRef.current = pc;

        let stream = localStream;
        if (!stream) {
          try {
            stream = await navigator.mediaDevices.getUserMedia({
              video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
              audio: true,
            });
            setLocalStream(stream);
          } catch (e) {
            console.warn('Camera/Mic permission failed:', e);
            notify('⚠️ Camera or microphone access was denied. Continuing in audio/limited mode.');
          }
        }

        if (stream && stream.getTracks().length > 0) {
          stream.getTracks().forEach((track) => {
            pc.addTrack(track, stream!);
          });
        } else {
          try {
            pc.addTransceiver('video', { direction: 'recvonly' });
            pc.addTransceiver('audio', { direction: 'recvonly' });
          } catch (trErr) {
            console.warn('Transceiver addition note:', trErr);
          }
        }

        pc.ontrack = (event) => {
          let incomingStream: MediaStream | null = null;
          if (event.streams && event.streams[0]) {
            incomingStream = event.streams[0];
          } else if (event.track) {
            incomingStream = new MediaStream([event.track]);
          }

          if (incomingStream) {
            setRemoteStream(incomingStream);
            setRemoteStreamConnected(true);
          }
        };

        pc.onicecandidate = (event) => {
          if (event.candidate) {
            fetch(`/api/meet/room/${rId}/signal`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: token ? `Bearer ${token}` : '',
              },
              body: JSON.stringify({ type: 'candidate', payload: event.candidate }),
            }).catch((err) => console.error('Signal candidate error', err));
          }
        };

        const isInitiator = currentUser && currentUser.id.localeCompare(peerId) < 0;
        if (isInitiator) {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          await fetch(`/api/meet/room/${rId}/signal`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: token ? `Bearer ${token}` : '',
            },
            body: JSON.stringify({ type: 'offer', payload: offer }),
          });
        }
      } catch (err) {
        console.error('WebRTC init error:', err);
      }
    },
    [currentUser, localStream, notify, token]
  );

  // Start polling in connected room
  const startRoomPolls = useCallback(
    (rId: string, peerId: string) => {
      messageIntervalRef.current = setInterval(() => {
        pollMessages(rId);
      }, 1500);

      signalIntervalRef.current = setInterval(() => {
        pollSignals(rId, peerId);
      }, 1200);

      initWebRTC(rId, peerId);
    },
    [initWebRTC, pollMessages, pollSignals]
  );

  // Poll Matchmaking Endpoint
  const pollMatchmaking = useCallback(async () => {
    try {
      const res = await fetch('/api/meet/match', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: token ? `Bearer ${token}` : '',
        },
        body: JSON.stringify({ interests }),
      });

      if (!res.ok) throw new Error('Matchmaking API call failed');
      const data = await res.json();

      if (data.status === 'connected') {
        if (matchIntervalRef.current) {
          clearInterval(matchIntervalRef.current);
          matchIntervalRef.current = null;
        }

        const peerInfo: StrangerProfile = {
          id: data.peer.id,
          displayName: data.peer.name || 'Stranger',
          interests: data.peer.interests || [],
          avatarUrl: data.peer.avatarUrl || '',
          location: data.peer.location || '',
        } as any;

        setRoomId(data.roomId);
        setStranger(peerInfo);
        
        // Calculate shared interests if any
        const myInterestsSet = new Set(interests.map(i => i.toLowerCase()));
        const shared = (data.peer.interests || []).filter((i: string) => myInterestsSet.has(i.toLowerCase()));
        setSharedInterests(shared);

        setStatus('connected');
        notify(`🎉 Connected with ${peerInfo.displayName}! Say hi!`);

        // Add system welcome message
        setMessages([
          {
            id: `sys-${Date.now()}`,
            text: `Connected to ${peerInfo.displayName}. ${shared.length > 0 ? `Shared interests: ${shared.join(', ')}` : 'You can start talking now.'}`,
            displayName: 'System',
            timestamp: Date.now(),
            fromSelf: false,
            isSystem: true,
          },
        ]);

        startRoomPolls(data.roomId, data.peer.id);
      }
    } catch (err) {
      console.error('Matchmaking polling error:', err);
    }
  }, [interests, notify, startRoomPolls, token]);

  // Start searching for partner
  const startSearch = useCallback(async () => {
    cleanupCallResources();
    setStatus('searching');
    setStranger(null);
    setRoomId(null);
    setMessages([]);

    // Acquire webcam
    try {
      if (!localStream) {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
          audio: true,
        });
        setLocalStream(stream);
      }
    } catch (err) {
      console.warn('Webcam/mic access error:', err);
      notify('⚠️ Webcam access denied or unavailable. Entering audio/chat fallback mode.');
    }

    // Trigger initial match attempt and schedule polling
    pollMatchmaking();
    matchIntervalRef.current = setInterval(pollMatchmaking, 2000);
  }, [cleanupCallResources, localStream, notify, pollMatchmaking]);

  // Trigger anti-spam cooldown when user skips rapidly
  const triggerCooldown = useCallback((seconds: number) => {
    setStatus('cooldown');
    setCooldownSeconds(seconds);
    notify(`⏳ Anti-Spam Filter: Please wait ${seconds} seconds before matching again.`);

    if (cooldownTimerRef.current) clearInterval(cooldownTimerRef.current);

    cooldownTimerRef.current = setInterval(() => {
      setCooldownSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(cooldownTimerRef.current!);
          cooldownTimerRef.current = null;
          setStatus('idle');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, [notify]);

  // SKIP / NEXT MATCH
  const skipMatch = useCallback(async () => {
    const now = Date.now();
    const timeSinceLastSkip = now - lastSkipTimeRef.current;
    lastSkipTimeRef.current = now;

    if (timeSinceLastSkip < 4000) {
      consecutiveSkipsRef.current += 1;
    } else {
      consecutiveSkipsRef.current = 1;
    }

    // Check rapid skip threshold (4 rapid skips in a row = 8s cooldown)
    if (consecutiveSkipsRef.current >= 4) {
      consecutiveSkipsRef.current = 0;
      cleanupCallResources();
      try {
        await fetch('/api/meet/leave', {
          method: 'POST',
          headers: { Authorization: token ? `Bearer ${token}` : '' },
        });
      } catch (e) {}
      triggerCooldown(8);
      return;
    }

    cleanupCallResources();

    try {
      await fetch('/api/meet/leave', {
        method: 'POST',
        headers: { Authorization: token ? `Bearer ${token}` : '' },
      });
    } catch (e) {
      console.error('Error leaving meet:', e);
    }

    notify('⏩ Skipping to next stranger...');
    startSearch();
  }, [cleanupCallResources, notify, startSearch, token, triggerCooldown]);

  // END / STOP CALL
  const stopCall = useCallback(async () => {
    cleanupCallResources();
    stopLocalStream();

    try {
      await fetch('/api/meet/leave', {
        method: 'POST',
        headers: { Authorization: token ? `Bearer ${token}` : '' },
      });
    } catch (e) {
      console.error('Leave error:', e);
    }

    setStatus('idle');
    setStranger(null);
    setRoomId(null);
    setMessages([]);
    notify('⏹️ Call disconnected.');
  }, [cleanupCallResources, notify, stopLocalStream, token]);

  // SEND TEXT MESSAGE
  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || !roomId) return;
      const cleanText = text.trim();

      try {
        await fetch(`/api/meet/room/${roomId}/message`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: token ? `Bearer ${token}` : '',
          },
          body: JSON.stringify({ text: cleanText }),
        });

        pollMessages(roomId);
      } catch (err) {
        console.error('Failed to send text:', err);
      }
    },
    [pollMessages, roomId, token]
  );

  // Toggle Mic
  const toggleMute = useCallback(() => {
    if (localStream) {
      localStream.getAudioTracks().forEach((track) => {
        track.enabled = !track.enabled;
      });
      const nextState = !isMuted;
      setIsMuted(nextState);
      notify(nextState ? '🔇 Microphone muted' : '🎙️ Microphone unmuted');
    }
  }, [localStream, isMuted, notify]);

  // Toggle Camera
  const toggleCamera = useCallback(() => {
    if (localStream) {
      localStream.getVideoTracks().forEach((track) => {
        track.enabled = !track.enabled;
      });
      const nextState = !isCameraOff;
      setIsCameraOff(nextState);
      notify(nextState ? '📷 Camera disabled' : '📹 Camera enabled');
    }
  }, [localStream, isCameraOff, notify]);

  return {
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
  };
}
