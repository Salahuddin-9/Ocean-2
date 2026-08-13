import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  MapPin, X, RefreshCw, Navigation, MessageCircle, Loader2, Radar,
  EyeOff, Users,
} from 'lucide-react';

/**
 * Ocean — Geohash Discovery ("people near you")
 * ---------------------------------------------
 * Nearby-people discovery ported from base44-social-media's geohash /
 * grid-cell pattern. Backed by /api/discovery/location (POST lat/lng,
 * server rounds to ~11km precision) and /api/discovery/nearby (GET
 * ?radiusKm=N -> { nearby, needLocation, myGridCell }).
 *
 * Privacy: your exact coordinates never leave the server — it stores a
 * rounded grid cell and distances are computed server-side. Neighbors
 * only ever see your approximate area.
 */

interface GeohashDiscoveryProps {
  token: string | null;
  currentUser: { id: string; name: string } | null;
  onClose: () => void;
}

interface NearbyPerson {
  userId: string;
  name: string;
  avatarUrl?: string;
  distanceKm: number;
  gridCell?: string | null;
  interests?: string[];
}

interface NearbyResponse {
  nearby?: NearbyPerson[];
  needLocation?: boolean;
  radiusKm?: number;
  myGridCell?: string | null;
  message?: string;
}

const MIN_RADIUS = 5;
const MAX_RADIUS = 200;

const containerVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0 },
};

function distanceLabel(km: number): string {
  if (km < 1) return '<1 km away';
  if (km < 10) return `${km.toFixed(1)} km away`;
  return `${Math.round(km)} km away`;
}

function Avatar({ name, avatarUrl }: { name: string; avatarUrl?: string }) {
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        className="w-11 h-11 rounded-full object-cover border-2 border-[#ebdcca] dark:border-zinc-700 bg-[#ebdcca]/40 dark:bg-zinc-800"
        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
      />
    );
  }
  const initials = (name || '?').split(/\s+/).map((p) => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
  return (
    <span className="w-11 h-11 rounded-full border-2 border-[#ebdcca] dark:border-zinc-700 bg-amber-800/10 dark:bg-amber-400/10 text-amber-800 dark:text-amber-400 font-display font-bold text-sm flex items-center justify-center">
      {initials || '?'}
    </span>
  );
}

function NearbyPersonCard({
  person,
  onSayHi,
  busyId,
}: {
  person: NearbyPerson;
  onSayHi: (p: NearbyPerson) => void;
  busyId: string | null;
}) {
  return (
    <div className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-white/60 dark:bg-zinc-800/40 p-3.5 space-y-2.5">
      <div className="flex items-center gap-3">
        <Avatar name={person.name} avatarUrl={person.avatarUrl} />
        <div className="min-w-0 flex-1">
          <p className="font-display font-bold text-sm text-[#3a342a] dark:text-zinc-100 truncate">{person.name}</p>
          <p className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-400 flex items-center gap-1">
            <MapPin size={10} /> {distanceLabel(person.distanceKm)}
          </p>
        </div>
        <button
          onClick={() => onSayHi(person)}
          disabled={busyId === person.userId}
          className="font-mono text-[9px] uppercase font-bold tracking-wider py-1.5 px-3 rounded-lg bg-amber-800 text-white dark:bg-amber-400 dark:text-zinc-900 hover:bg-amber-900 dark:hover:bg-amber-300 transition-all flex items-center gap-1 disabled:opacity-50 shrink-0"
        >
          {busyId === person.userId ? <Loader2 size={11} className="animate-spin" /> : <MessageCircle size={11} />}
          Say hi
        </button>
      </div>

      {(person.interests && person.interests.length > 0) && (
        <div className="flex flex-wrap gap-1.5">
          {person.interests.map((tag) => (
            <span
              key={tag}
              className="font-mono text-[9px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#ebdcca]/40 dark:bg-zinc-800 text-[#5c5446] dark:text-zinc-300"
            >
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export default function GeohashDiscovery({ token, currentUser, onClose }: GeohashDiscoveryProps) {
  const [radiusKm, setRadiusKm] = useState(50);
  const [nearby, setNearby] = useState<NearbyPerson[]>([]);
  const [loading, setLoading] = useState(true);
  const [needLocation, setNeedLocation] = useState(false);
  const [myGridCell, setMyGridCell] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [locError, setLocError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const radiusRef = useRef(radiusKm);
  radiusRef.current = radiusKm;

  const toast = (message: string, variant?: string) => {
    window.dispatchEvent(new CustomEvent('show-toast', { detail: { message, variant } }));
  };

  const authHeaders = (): Record<string, string> => ({
    'Content-Type': 'application/json',
    ...(token ? { Authorization: 'Bearer ' + token } : {}),
  });

  const load = useCallback(async (radius: number) => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/discovery/nearby?radiusKm=${radius}`, { headers: authHeaders() });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to load neighbors.');
      }
      const data: NearbyResponse = await res.json();
      setNearby(Array.isArray(data.nearby) ? data.nearby : []);
      setNeedLocation(!!data.needLocation);
      setMyGridCell(data.myGridCell || null);
    } catch (e: any) {
      setError(e.message || 'Failed to load neighbors.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  // Debounced refetch whenever the radius slider moves.
  useEffect(() => {
    if (!token) return;
    const t = setTimeout(() => { load(radiusKm); }, 250);
    return () => clearTimeout(t);
  }, [radiusKm, load, token]);

  const shareLocation = () => {
    setLocError(null);
    if (!('geolocation' in navigator)) {
      setLocError('Geolocation is not supported in this browser. Try a modern browser to discover neighbors.');
      setNeedLocation(true);
      return;
    }
    setSharing(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const { latitude: lat, longitude: lng } = pos.coords;
          const res = await fetch('/api/discovery/location', {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify({ lat, lng }),
          });
          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || 'Failed to save location.');
          }
          const data = await res.json();
          setMyGridCell(data.gridCell || null);
          setNeedLocation(false);
          toast('Location shared — neighbors see your area, never your exact spot.');
          await load(radiusRef.current);
        } catch (e: any) {
          toast(e.message || 'Failed to share location.', 'destructive');
        } finally {
          setSharing(false);
        }
      },
      (err) => {
        setSharing(false);
        let msg = 'Could not get your location — please try again.';
        if (err.code === err.PERMISSION_DENIED) {
          msg = 'Location permission was denied. Allow it in your browser settings to discover neighbors.';
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          msg = 'Your location is currently unavailable — check GPS/network and try again.';
        } else if (err.code === err.TIMEOUT) {
          msg = 'Location request timed out — please try again.';
        }
        setLocError(msg);
        setNeedLocation(true);
        toast(msg, 'destructive');
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 },
    );
  };

  const sayHi = (person: NearbyPerson) => {
    window.dispatchEvent(new CustomEvent('open-chat', { detail: { userId: person.userId } }));
    setBusyId(person.userId);
    setTimeout(() => setBusyId(null), 700);
    toast(`Opening chat with ${person.name}…`);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 12 }}
      transition={{ duration: 0.2 }}
      className="bg-[#fcfaf4] dark:bg-zinc-900 border-2 border-[#ebdcca] dark:border-zinc-800 rounded-[2rem] p-5 md:p-6 space-y-4 shadow-xs w-full max-w-xl mx-auto"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-9 h-9 rounded-full bg-amber-800/10 dark:bg-amber-400/10 flex items-center justify-center">
            <Radar className="text-amber-800 dark:text-amber-400" size={16} />
          </span>
          <div>
            <h2 className="font-display text-lg font-bold text-[#3a342a] dark:text-zinc-100">Discover people near you</h2>
            <p className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-400">
              Grid-cell discovery · {myGridCell ? `pinned to ${myGridCell}` : 'location not shared'}
            </p>
          </div>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-[#8a8172] dark:text-zinc-400 hover:text-[#3a342a] dark:hover:text-zinc-100 transition-colors"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {/* Share-location gate */}
      {needLocation ? (
        <div className="rounded-2xl border-2 border-[#ebdcca] dark:border-zinc-800 bg-white/60 dark:bg-zinc-800/40 p-5 space-y-3">
          <span className="inline-flex w-14 h-14 rounded-full bg-amber-800/10 dark:bg-amber-400/10 items-center justify-center">
            <Navigation className="text-amber-800 dark:text-amber-400" size={22} />
          </span>
          <div>
            <h3 className="font-display font-bold text-sm text-[#3a342a] dark:text-zinc-100">Share your area to meet neighbors</h3>
            <p className="text-xs text-[#5c5446] dark:text-zinc-300 leading-relaxed mt-1">
              Discover people nearby, join local conversations and find friends within your radius.
            </p>
          </div>
          <button
            onClick={shareLocation}
            disabled={sharing}
            className="font-mono text-[10px] uppercase font-bold tracking-wider py-2 px-4 rounded-xl bg-amber-800 text-white dark:bg-amber-400 dark:text-zinc-900 hover:bg-amber-900 dark:hover:bg-amber-300 disabled:opacity-50 transition-all flex items-center gap-1.5"
          >
            {sharing ? <Loader2 size={12} className="animate-spin" /> : <MapPin size={12} />}
            {sharing ? 'Sharing…' : 'Share my location'}
          </button>
          {locError && (
            <p className="text-xs text-red-700 dark:text-red-400 flex items-center gap-1.5">
              <EyeOff size={13} /> {locError}
            </p>
          )}
        </div>
      ) : (
        <>
          {/* Radius control */}
          <div className="rounded-2xl border-2 border-[#ebdcca] dark:border-zinc-800 bg-white/60 dark:bg-zinc-800/40 p-3.5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[9px] uppercase font-bold tracking-wider text-[#5c5446] dark:text-zinc-300 flex items-center gap-1">
                <MapPin size={11} /> Search radius
              </span>
              <span className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-400">
                {radiusKm} km
              </span>
            </div>
            <input
              type="range"
              min={MIN_RADIUS}
              max={MAX_RADIUS}
              step={5}
              value={radiusKm}
              onChange={(e) => setRadiusKm(Number(e.target.value))}
              className="w-full accent-amber-800 dark:accent-amber-400"
            />
            <div className="flex justify-between font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-500">
              <span>{MIN_RADIUS} km</span>
              <span>{MAX_RADIUS} km</span>
            </div>
          </div>

          {/* Result list */}
          {loading ? (
            <div className="py-12 text-center font-mono text-[10px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-400">
              Searching nearby…
            </div>
          ) : error ? (
            <div className="py-12 text-center space-y-2">
              <span className="inline-flex w-14 h-14 rounded-full bg-red-100 dark:bg-red-950/50 items-center justify-center">
                <Radar className="text-red-600 dark:text-red-400" size={22} />
              </span>
              <p className="font-display text-sm text-[#5c5446] dark:text-zinc-300">{error}</p>
              <button
                onClick={() => load(radiusKm)}
                className="font-mono text-[9px] uppercase font-bold tracking-wider py-1.5 px-3 rounded-lg bg-[#ebdcca]/40 dark:bg-zinc-800 text-[#5c5446] dark:text-zinc-300 hover:bg-[#ebdcca]/70 transition-all flex items-center gap-1 mx-auto"
              >
                <RefreshCw size={11} /> Retry
              </button>
            </div>
          ) : nearby.length === 0 ? (
            <div className="py-12 text-center space-y-2">
              <span className="inline-flex w-14 h-14 rounded-full bg-[#ebdcca]/40 dark:bg-zinc-800 items-center justify-center">
                <Users className="text-[#8a8172] dark:text-zinc-500" size={22} />
              </span>
              <p className="font-display text-sm text-[#5c5446] dark:text-zinc-300">No neighbors sharing their area in range yet.</p>
              <p className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-500">
                Try widening your radius, or check back later
              </p>
            </div>
          ) : (
            <motion.div
              variants={containerVariants}
              initial="hidden"
              animate="show"
              className="space-y-2.5"
            >
              <div className="flex items-center justify-between">
                <p className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-400 flex items-center gap-1">
                  <Users size={11} /> {nearby.length} neighbor{nearby.length !== 1 ? 's' : ''} within {radiusKm} km
                </p>
                <button
                  onClick={() => load(radiusKm)}
                  disabled={loading}
                  className="font-mono text-[9px] uppercase font-bold tracking-wider py-1 px-2 rounded-lg bg-[#ebdcca]/40 dark:bg-zinc-800 text-[#5c5446] dark:text-zinc-300 hover:bg-[#ebdcca]/70 transition-all flex items-center gap-1 disabled:opacity-50"
                >
                  <RefreshCw size={11} /> Refresh
                </button>
              </div>
              <div className="space-y-2.5 max-h-[42vh] overflow-y-auto pr-1">
                {nearby.map((person) => (
                  <motion.div key={person.userId} variants={itemVariants}>
                    <NearbyPersonCard person={person} onSayHi={sayHi} busyId={busyId} />
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}
        </>
      )}

      {/* Privacy note */}
      <div className="rounded-xl bg-[#ebdcca]/30 dark:bg-zinc-800/40 px-3 py-2.5 flex items-start gap-2">
        <EyeOff className="text-[#8a8172] dark:text-zinc-400 mt-0.5 shrink-0" size={13} />
        <p className="text-[10px] text-[#8a8172] dark:text-zinc-400 leading-relaxed">
          Location is rounded to ~11km — neighbors never see your exact position.
        </p>
      </div>
    </motion.div>
  );
}
