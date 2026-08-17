import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Radio, Zap } from 'lucide-react';
import { p2p, type EngineStatus } from '../turtleOfflineP2P';
import OfflineChatView from './OfflineChatView';

/**
 * Ocean — Offline Mesh Floating Button
 * ------------------------------------
 * Always-visible entry point to the offline peer-to-peer messaging system
 * (Bluetooth + LAN + store-and-forward queue). Sits stacked with the SOS and
 * Emergency buttons on the side opposite the bottom nav so it never covers the
 * messaging icons. Shows a live badge with the number of queued (undelivered)
 * messages.
 */
interface OfflineMeshFabProps {
  currentUser?: { id: string; name: string } | null;
  token?: string | null;
  /** Which side the bottom nav is on, so this button mirrors the SOS button. */
  navSide?: 'left' | 'right';
}

export default function OfflineMeshFab({ currentUser, token, navSide = 'left' }: OfflineMeshFabProps) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<EngineStatus>(() => p2p.getStatus());

  useEffect(() => {
    const off = p2p.on('status', (s: EngineStatus) => setStatus(s));
    return off;
  }, []);

  const sideCls = navSide === 'right' ? 'left-6' : 'right-6';
  const queued = status.queued;

  return (
    <>
      <motion.button
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.92 }}
        onClick={() => setOpen(true)}
        className={`fixed bottom-6 ${sideCls} z-[95] w-14 h-14 rounded-full bg-gradient-to-br from-teal-600 to-emerald-700 text-white shadow-[0_8px_30px_rgba(13,148,136,0.45)] border border-teal-400/50 flex items-center justify-center cursor-pointer group`}
        title="Offline Mesh — chat over Bluetooth / LAN without internet"
        aria-label="Open offline mesh messaging"
      >
        <Radio size={22} className="group-hover:animate-pulse" />
        {queued > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-600 border-2 border-white text-white text-[9px] font-bold flex items-center justify-center">
            {queued}
          </span>
        )}
      </motion.button>

      <AnimatePresence>
        {open && (
          <OfflineChatView token={token} currentUser={currentUser} onClose={() => setOpen(false)} />
        )}
      </AnimatePresence>
    </>
  );
}
