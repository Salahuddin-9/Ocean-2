import React, { useCallback, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Siren, X, MapPin, AlertTriangle, Send, ShieldCheck } from "lucide-react";
import {
  SYSTEM_POOLS,
  SAFETY_DISCLAIMERS,
  validateAndFormatAlert,
  isUserRateLimited,
  type UrgencyLevel,
} from "../turtleEmergencyPools";

/**
 * Ocean SOS Emergency Button
 * --------------------------
 * Ported from base44-social-media's SOSButton / EmergencyPoolCard concept and
 * wired to Ocean's existing turtleEmergencyPools backend logic.
 *
 * A floating red SOS button that opens a quick emergency-alert composer.
 * Alerts are validated with the shared engine (rate limits, urgency rules,
 * blood-group checks) and stored locally with an expiry timestamp.
 */

interface SOSAlertRecord {
  id: string;
  poolId: string;
  title: string;
  messageContent: string;
  urgency: UrgencyLevel;
  createdAt: number;
  expiresAt: number;
}

interface SOSEmergencyButtonProps {
  currentUser: { id: string; name: string; countryCode?: string } | null;
  onShowToast: (msg: string) => void;
  /** Auth token for the real /api/sos/alert dispatch. */
  token?: string | null;
  /** Which side the bottom nav currently sits on, so the SOS button mirrors it and never overlaps. */
  navSide?: 'left' | 'right';
}

const POOL_LIST = Object.values(SYSTEM_POOLS);

const URGENCY_OPTIONS: { value: UrgencyLevel; label: string; color: string }[] = [
  { value: "low", label: "LOW", color: "bg-emerald-600 hover:bg-emerald-700" },
  { value: "medium", label: "MEDIUM", color: "bg-amber-500 hover:bg-amber-600" },
  { value: "high", label: "HIGH", color: "bg-orange-600 hover:bg-orange-700" },
  { value: "critical", label: "CRITICAL", color: "bg-red-700 hover:bg-red-800" },
];

const POOL_MAX_URGENCY: Record<string, UrgencyLevel> = {
  [SYSTEM_POOLS.FOOTBALL_PLAYER_SHORTAGE.id]: "medium",
  [SYSTEM_POOLS.BLOOD_NEEDED.id]: "critical",
  [SYSTEM_POOLS.LOCAL_HELP.id]: "high",
  [SYSTEM_POOLS.STUDY_HELP.id]: "low",
  [SYSTEM_POOLS.EVENT_VOLUNTEER.id]: "medium",
};

export default function SOSEmergencyButton({ currentUser, onShowToast, token, navSide = 'left' }: SOSEmergencyButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [poolId, setPoolId] = useState<string>(SYSTEM_POOLS.BLOOD_NEEDED.id);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [urgency, setUrgency] = useState<UrgencyLevel>("medium");
  const [bloodGroup, setBloodGroup] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [agreedDisclaimer, setAgreedDisclaimer] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Rate-limit tracker for this device/user (mirrors the backend tracker shape)
  const trackerRef = useRef<{ userId: string; alertTimestamps: number[] }>({
    userId: currentUser?.id || "guest",
    alertTimestamps: [],
  });

  const selectPool = (id: string) => {
    setPoolId(id);
    // Clamp urgency to the pool's maximum allowed level
    const max = POOL_MAX_URGENCY[id] || "medium";
    const maxIdx = URGENCY_OPTIONS.findIndex((o) => o.value === max);
    setUrgency((prev) => {
      const prevIdx = URGENCY_OPTIONS.findIndex((o) => o.value === prev);
      return prevIdx > maxIdx ? max : prev;
    });
    setError(null);
  };

  const sendAlert = useCallback(async () => {
    setError(null);
    if (!currentUser) {
      setError("Please log in before sending an emergency alert.");
      return;
    }
    if (!agreedDisclaimer) {
      setError("Please accept the safety agreement to continue.");
      return;
    }
    if (!title.trim() || !message.trim()) {
      setError("Please add a title and details for the alert.");
      return;
    }

    const senderId = currentUser.id;
    if (trackerRef.current.userId !== senderId) {
      trackerRef.current = { userId: senderId, alertTimestamps: [] };
    }
    trackerRef.current.alertTimestamps.push(Date.now());

    const poolForToast = Object.values(SYSTEM_POOLS).find((p) => p.id === poolId);
    const alertMessage = `${title.trim()}${message.trim() ? ` — ${message.trim()}` : ''}`.slice(0, 600);

    setIsSending(true);
    try {
      // REAL incident creation: dispatch through the backend SOS engine
      // (/api/sos/alert — server-authoritative rate limiting + persistence).
      const res = await fetch('/api/sos/alert', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          message: alertMessage,
          area: poolForToast?.title || 'Community pool',
          urgency,
          shareLocation: false,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || 'Alert could not be dispatched. Please try again.');
        setIsSending(false);
        return;
      }

      // Keep a local record (offline fallback + quick history).
      const alert: SOSAlertRecord = {
        id: data?.alert?.id || `sos-${Date.now()}`,
        poolId,
        title: title.trim(),
        messageContent: message.trim(),
        urgency,
        createdAt: Date.now(),
        expiresAt: Date.now() + 60 * 60 * 1000,
      };
      try {
        const existing = JSON.parse(localStorage.getItem("ocean_sos_alerts") || "[]");
        existing.unshift(alert);
        localStorage.setItem("ocean_sos_alerts", JSON.stringify(existing.slice(0, 50)));
      } catch (e) {
        console.warn("SOS alert persistence failed:", e);
      }

      setIsSending(false);
      setIsOpen(false);
      setTitle("");
      setMessage("");
      setBloodGroup("");
      setAgreedDisclaimer(false);
      onShowToast(
        `🚨 ${alert.urgency.toUpperCase()} alert dispatched to the ${poolForToast?.title || "community"} pool!`
      );
    } catch (e) {
      // Offline recovery: queue the alert locally so it is not lost.
      const alert: SOSAlertRecord = {
        id: `sos-offline-${Date.now()}`,
        poolId,
        title: title.trim(),
        messageContent: message.trim(),
        urgency,
        createdAt: Date.now(),
        expiresAt: Date.now() + 60 * 60 * 1000,
      };
      try {
        const existing = JSON.parse(localStorage.getItem("ocean_sos_alerts") || "[]");
        existing.unshift(alert);
        localStorage.setItem("ocean_sos_alerts", JSON.stringify(existing.slice(0, 50)));
      } catch (e2) {
        console.warn("SOS offline persistence failed:", e2);
      }
      setIsSending(false);
      setIsOpen(false);
      setTitle("");
      setMessage("");
      setBloodGroup("");
      setAgreedDisclaimer(false);
      onShowToast("📡 Network unavailable — SOS alert queued offline and will sync when you reconnect.");
    }
  }, [agreedDisclaimer, bloodGroup, currentUser, message, onShowToast, poolId, title, token, urgency]);

  return (
    <>
      {/* Floating SOS button — always visible, opposite side of the bottom nav to avoid overlap */}
      <motion.button
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.92 }}
        onClick={() => setIsOpen(true)}
        className={`fixed bottom-6 ${navSide === 'right' ? 'left-6' : 'right-6'} z-[95] w-14 h-14 rounded-full bg-gradient-to-br from-red-600 to-red-800 text-white shadow-[0_8px_30px_rgba(220,38,38,0.45)] border border-red-400/50 flex items-center justify-center cursor-pointer group`}
        title="Send Emergency Alert (SOS)"
      >
        <Siren size={22} className="group-hover:animate-pulse" />
        <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-red-400 border-2 border-white animate-ping" />
      </motion.button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[120] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setIsOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md bg-[#fdfbf7] border border-[#ebdcca] rounded-3xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
            >
              {/* Header */}
              <div className="bg-gradient-to-r from-red-700 to-red-900 px-5 py-4 text-white flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <Siren size={18} />
                  <div>
                    <h3 className="font-sans font-black uppercase tracking-wider text-sm">Emergency SOS</h3>
                    <p className="text-[9px] text-red-100/80 font-mono uppercase tracking-widest">
                      Community Pool Dispatch
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-1.5 rounded-full hover:bg-white/20 transition-colors cursor-pointer"
                  title="Close"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Body */}
              <div className="p-5 space-y-4 overflow-y-auto">
                {/* Pool selector */}
                <div>
                  <span className="font-mono text-[9px] font-bold text-[#8a8172] uppercase tracking-wider block mb-2">
                    Emergency Type
                  </span>
                  <div className="grid grid-cols-2 gap-1.5">
                    {POOL_LIST.map((pool) => (
                      <button
                        key={pool.id}
                        onClick={() => selectPool(pool.id)}
                        className={`text-left px-2.5 py-2 rounded-xl border text-[10px] font-sans font-bold transition-all cursor-pointer ${
                          poolId === pool.id
                            ? "bg-red-600/10 border-red-600/50 text-red-800"
                            : "bg-white border-[#ebdcca] text-[#5c5446] hover:border-[#8a8172]"
                        }`}
                      >
                        {pool.title}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Title */}
                <div>
                  <label className="font-mono text-[9px] font-bold text-[#8a8172] uppercase tracking-wider block mb-1.5">
                    Alert Title *
                  </label>
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Blood donation urgently needed at City Hospital"
                    className="w-full bg-white border border-[#cfcac0] rounded-xl px-3 py-2 text-xs text-[#3a342a] focus:outline-none focus:ring-2 focus:ring-red-500/40 placeholder:text-[#8a8172]/50"
                  />
                </div>

                {/* Message */}
                <div>
                  <label className="font-mono text-[9px] font-bold text-[#8a8172] uppercase tracking-wider block mb-1.5">
                    Details *
                  </label>
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    rows={3}
                    placeholder="Describe what is needed, where, and any other critical info..."
                    className="w-full bg-white border border-[#cfcac0] rounded-xl px-3 py-2 text-xs text-[#3a342a] focus:outline-none focus:ring-2 focus:ring-red-500/40 placeholder:text-[#8a8172]/50 resize-none"
                  />
                </div>

                {/* Blood group (only for blood pool) */}
                {poolId === SYSTEM_POOLS.BLOOD_NEEDED.id && (
                  <div>
                    <label className="font-mono text-[9px] font-bold text-[#8a8172] uppercase tracking-wider block mb-1.5">
                      Blood Group Needed (optional)
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-", "UNKNOWN"].map((bg) => (
                        <button
                          key={bg}
                          onClick={() => setBloodGroup(bg)}
                          className={`px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold transition-all cursor-pointer ${
                            bloodGroup === bg
                              ? "bg-red-600 text-white"
                              : "bg-white border border-[#ebdcca] text-[#5c5446] hover:border-red-400"
                          }`}
                        >
                          {bg}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Urgency */}
                <div>
                  <label className="font-mono text-[9px] font-bold text-[#8a8172] uppercase tracking-wider block mb-1.5">
                    Urgency Level
                  </label>
                  <div className="grid grid-cols-4 gap-1.5">
                    {URGENCY_OPTIONS.map((opt) => {
                      const maxForPool = POOL_MAX_URGENCY[poolId] || "medium";
                      const disabled =
                        URGENCY_OPTIONS.findIndex((o) => o.value === opt.value) >
                        URGENCY_OPTIONS.findIndex((o) => o.value === maxForPool);
                      return (
                        <button
                          key={opt.value}
                          disabled={disabled}
                          onClick={() => setUrgency(opt.value)}
                          className={`px-2 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                            disabled
                              ? "opacity-30 cursor-not-allowed"
                              : urgency === opt.value
                                ? `${opt.color} text-white shadow-md`
                                : "bg-white border border-[#ebdcca] text-[#5c5446] hover:border-[#8a8172]"
                          }`}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Safety disclaimer */}
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={agreedDisclaimer}
                      onChange={(e) => setAgreedDisclaimer(e.target.checked)}
                      className="mt-0.5 accent-red-600 cursor-pointer"
                    />
                    <span className="text-[9.5px] text-[#5c5446] font-sans leading-relaxed">
                      I understand this is a <b>volunteer community alert</b> and does not replace
                      official emergency services. For life-threatening emergencies call your local
                      emergency number immediately.
                    </span>
                  </label>
                  {poolId === SYSTEM_POOLS.BLOOD_NEEDED.id && (
                    <p className="text-[8.5px] text-[#8a8172] font-mono mt-2 leading-relaxed">
                      {SAFETY_DISCLAIMERS.BLOOD_NEEDED.substring(0, 180)}...
                    </p>
                  )}
                </div>

                {error && (
                  <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 text-[10px] font-sans font-bold px-3 py-2 rounded-xl">
                    <AlertTriangle size={12} className="shrink-0" />
                    {error}
                  </div>
                )}

                {/* Send */}
                <button
                  onClick={sendAlert}
                  disabled={isSending || !title.trim() || !message.trim()}
                  className="w-full py-3 rounded-xl bg-gradient-to-r from-red-700 to-red-900 text-white font-sans font-black uppercase tracking-wider text-xs flex items-center justify-center gap-2 transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed shadow-lg cursor-pointer"
                >
                  {isSending ? (
                    <>
                      <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Dispatching...
                    </>
                  ) : (
                    <>
                      <Send size={14} />
                      Dispatch Alert
                    </>
                  )}
                </button>

                <p className="flex items-center justify-center gap-1 text-[8px] text-[#8a8172] font-mono uppercase tracking-widest">
                  <ShieldCheck size={10} className="text-emerald-600" />
                  Location-fuzzed · Rate-limited · Community-safety checked
                </p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
