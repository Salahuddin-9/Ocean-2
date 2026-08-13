import React from 'react';
import OmegleRandomVideoCall from './OmegleRandomVideoCall';

interface MeetViewProps {
  currentUser: { id: string; name: string; avatarUrl?: string } | null;
  creatorsList: any[];
  onShowToast: (msg: string) => void;
  token?: string | null;
}

/**
 * MeetView — the random-video-chat ("Meet") section.
 *
 * 100% self-contained: OmegleRandomVideoCall performs 1:1 random pairing over
 * the app's own WebRTC + /api/meet signaling — no getstream.io keys, no Jitsi,
 * no external platform. Video-only (the engine never offers an audio-only
 * entry point here).
 */
export default function MeetView({ currentUser, onShowToast, token }: MeetViewProps) {
  return (
    <div className="space-y-4">
      <OmegleRandomVideoCall
        currentUser={currentUser}
        interests={['Design', 'Coding', 'Music', 'AI', 'Art']}
        token={token}
        onShowToast={onShowToast}
      />
    </div>
  );
}
