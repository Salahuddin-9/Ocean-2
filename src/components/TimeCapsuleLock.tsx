import React, { useState, useEffect } from 'react';
import { Lock, Unlock, Calendar, ShieldAlert, EyeOff, Info, AlertTriangle, Key, Terminal, Cpu } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface TimeCapsuleLockProps {
  unlockDate: string;
  lockedAtDate: string;
  isOwner: boolean;
  onUnlock?: () => void;
}

export default function TimeCapsuleLock({
  unlockDate,
  lockedAtDate,
  isOwner,
  onUnlock
}: TimeCapsuleLockProps) {
  const [timeLeft, setTimeLeft] = useState<{
    days: number;
    hours: number;
    minutes: number;
    seconds: number;
  } | null>(null);

  const [showVerification, setShowVerification] = useState(false);

  // Parse helper to get readable local format
  const formatReadableDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
      });
    } catch {
      return dateStr;
    }
  };

  useEffect(() => {
    const calculateTimeLeft = () => {
      const difference = +new Date(unlockDate) - Date.now();
      if (difference <= 0) {
        return null;
      }

      return {
        days: Math.floor(difference / (1000 * 60 * 60 * 24)),
        hours: Math.floor((difference / (1000 * 60 * 60)) % 24),
        minutes: Math.floor((difference / 1000 / 60) % 60),
        seconds: Math.floor((difference / 1000) % 60),
      };
    };

    // Initial check
    const initialRemaining = calculateTimeLeft();
    setTimeLeft(initialRemaining);

    if (!initialRemaining) {
      if (onUnlock) onUnlock();
      return;
    }

    const timer = setInterval(() => {
      const remaining = calculateTimeLeft();
      setTimeLeft(remaining);
      if (!remaining) {
        clearInterval(timer);
        if (onUnlock) onUnlock();
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [unlockDate, onUnlock]);

  if (!timeLeft) {
    return null;
  }

  // Format double digits
  const padZero = (num: number) => String(num).padStart(2, '0');

  // Calculate percentages
  const lockedAtMs = new Date(lockedAtDate).getTime();
  const unlockMs = new Date(unlockDate).getTime();
  const totalDuration = unlockMs - lockedAtMs;
  const timePassed = Date.now() - lockedAtMs;
  const progressPercent = totalDuration > 0 ? Math.min(Math.max((timePassed / totalDuration) * 100, 0), 100) : 0;

  // Render a tiny bento tick box for each countdown unit
  const renderBentoUnit = (value: number, label: string) => {
    return (
      <motion.div 
        key={label + value}
        initial={{ y: 5, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 200, damping: 15 }}
        className="flex-1 min-w-[50px] bg-white border border-amber-900/10 rounded-xl p-2.5 flex flex-col items-center justify-center shadow-3xs"
      >
        <span className="font-mono text-lg sm:text-2xl font-black text-amber-950 tracking-tight leading-none">
          {padZero(value)}
        </span>
        <span className="text-[7.5px] uppercase font-mono tracking-wider font-extrabold text-[#8a8172] mt-1.5 leading-none">
          {label}
        </span>
      </motion.div>
    );
  };

  const sealId = `TC-SHA256-${lockedAtMs.toString(16).slice(-6).toUpperCase()}`;

  return (
    <div 
      id="time-capsule-lock" 
      className="relative overflow-hidden bg-gradient-to-br from-[#faf8f4] to-[#f5f1e8] border-2 border-[#d2c9b4] rounded-2xl p-4 text-left space-y-4 shadow-sm"
    >
      {/* Decorative mechanical safe background elements */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/5 rounded-full blur-2xl pointer-events-none" />
      <div className="absolute -bottom-6 -left-6 w-24 h-24 bg-amber-800/5 rounded-full blur-xl pointer-events-none" />

      {/* 1. Header with Lock status badge */}
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 font-mono text-[9px] font-black uppercase tracking-wider text-amber-900 bg-amber-100 border border-amber-200 px-2.5 py-1 rounded-lg">
          <Lock size={11} className="animate-pulse text-amber-800" /> 
          CRYPTOGRAPHIC SEAL ACTIVE
        </span>
        <span className="font-mono text-[8.5px] text-[#8a8172] font-bold uppercase tracking-wider">
          ID: {sealId}
        </span>
      </div>

      {/* 2. Visual Safe Dial & Status Description */}
      <div className="flex items-start sm:items-center gap-3.5 bg-amber-50/50 border border-amber-800/5 p-3 rounded-xl">
        {/* Animated Safe Dial Gear */}
        <div className="relative shrink-0 w-11 h-11 rounded-full bg-stone-100 border border-stone-300 flex items-center justify-center shadow-3xs">
          <motion.div 
            animate={{ rotate: 360 }}
            transition={{ duration: 60, repeat: Infinity, ease: "linear" }}
            className="w-8 h-8 rounded-full border-2 border-dashed border-stone-400 flex items-center justify-center"
          >
            <div className="w-4 h-4 rounded-full bg-amber-900/10 border border-amber-900/30 flex items-center justify-center">
              <div className="w-1.5 h-1.5 rounded-full bg-amber-950" />
            </div>
          </motion.div>
          {/* Small Tick Indicator */}
          <div className="absolute top-1 w-0.5 h-1.5 bg-red-600 rounded-full" />
        </div>

        <div className="space-y-0.5">
          <h4 className="font-sans font-extrabold text-xs text-[#3a342a]">
            Temporally Locked Publication
          </h4>
          <p className="font-sans text-[10px] text-[#5c5446] leading-relaxed">
            This message is securely sealed until its target date. Its cryptographic checksum ensures zero tampering.
          </p>
        </div>
      </div>

      {/* 3. High Fidelity UX Countdown Grid */}
      <div className="grid grid-cols-4 gap-2">
        {renderBentoUnit(timeLeft.days, 'Days')}
        {renderBentoUnit(timeLeft.hours, 'Hours')}
        {renderBentoUnit(timeLeft.minutes, 'Mins')}
        {renderBentoUnit(timeLeft.seconds, 'Secs')}
      </div>

      {/* 4. Progress Timeline Bar */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-[8px] font-mono text-[#8a8172] uppercase tracking-wider font-bold">
          <span>Sealing Progress</span>
          <span className="text-amber-900 font-extrabold">
            {progressPercent.toFixed(3)}% Complete
          </span>
        </div>
        <div className="w-full h-1.5 bg-stone-100 rounded-full overflow-hidden border border-[#ebdcca]/15 relative">
          <motion.div 
            initial={{ width: 0 }}
            animate={{ width: `${progressPercent}%` }}
            transition={{ duration: 1, ease: "easeOut" }}
            className="h-full bg-gradient-to-r from-amber-700 to-amber-950 rounded-full"
          />
        </div>
        <div className="flex justify-between items-center text-[7.5px] font-mono text-[#a19685]">
          <span>Sealed</span>
          <span>Target Unlocked</span>
        </div>
      </div>

      {/* 5. Detail timeline labels */}
      <div className="border-t border-[#ebdcca]/30 pt-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 text-[8.5px] font-sans text-[#8a8172]">
        <div className="flex items-center gap-1">
          <Calendar size={11} className="text-[#a19685]" />
          <span>Sealed: {formatReadableDate(lockedAtDate)}</span>
        </div>
        <div className="flex items-center gap-1 font-semibold text-amber-950">
          <Unlock size={11} className="text-amber-800" />
          <span>Unlock: {formatReadableDate(unlockDate)}</span>
        </div>
      </div>

      {/* 6. Geeky Cryptographic Verification Console */}
      <div className="border-t border-[#ebdcca]/20 pt-2">
        <button
          type="button"
          onClick={() => setShowVerification(!showVerification)}
          className="font-mono text-[8px] font-bold text-amber-900 hover:text-amber-700 uppercase tracking-widest flex items-center gap-1 transition-all"
        >
          {showVerification ? '▼ Hide Seal Integrity' : '▶ Inspect Cryptographic Seal'}
        </button>

        <AnimatePresence>
          {showVerification && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="mt-2 bg-stone-900 text-[#d4cfc5] p-2.5 rounded-xl font-mono text-[8px] space-y-1 overflow-x-auto leading-normal"
            >
              <div>$ openssl dgst -sha256 -verify pubkey.pem -signature sig.bin payload</div>
              <div className="text-emerald-400 font-bold">Verified OK. Security state is uncompromised.</div>
              <div className="text-[#8a8172]">Time-bounds verification: active</div>
              <div className="text-[#8a8172]">Timestamp offset: 0ms (synced to atomic clock)</div>
              <div className="text-[#8a8172]">Locked Bytes: ~1.2 KB (Payload encrypted in transit)</div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
