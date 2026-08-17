import { useCallback, useEffect, useState } from 'react';
import { motion } from 'motion/react';
import {
  X, Waves, Loader2, LocateFixed, MapPin, ShieldAlert, Navigation,
  KeyRound, Droplets, Building2, Compass, AlertTriangle,
} from 'lucide-react';

/**
 * Ocean — Cyclone Evacuation Routes (FEATURE 128)
 * -------------------------------------------------
 * Given your location, ranks open shelters on routes that dodge flooded roads,
 * using community flood reports (Flood Depth Mapper) + shelter registry
 * (Safe Shelter). Directional guidance, not turn-by-turn navigation.
 */

interface EvacuationRoutesProps {
  token: string | null;
  currentUser: { id: string; name: string } | null;
  onClose: () => void;
}

interface EvacOption {
  shelterId: string;
  name: string;
  areaLabel: string;
  capacity: number;
  estKm: number;
  hazardScore: number;
  hazardLevel: 'low' | 'moderate' | 'high';
  floodDepthCm: number;
  advice: string;
  verified: boolean;
}

interface FloodZone {
  areaLabel: string;
  reportCount: number;
  maxDepthCm: number;
  centroidLat: number;
  centroidLng: number;
}

interface EvacResponse {
  origin: { lat: number; lng: number } | null;
  areaLabel: string;
  options: EvacOption[];
  floodZones: FloodZone[];
  safeBearing: number;
  evacuatedBy: string;
  disclaimer: string;
}

const HAZARD_STYLE: Record<string, string> = {
  low: 'text-emerald-700 dark:text-emerald-400 bg-emerald-600/10 border-emerald-600/30',
  moderate: 'text-amber-700 dark:text-amber-400 bg-amber-600/10 border-amber-600/30',
  high: 'text-rose-700 dark:text-rose-400 bg-rose-600/10 border-rose-600/30',
};

export default function EvacuationRoutes({ token, currentUser, onClose }: EvacuationRoutesProps) {
  const [zoneCount, setZoneCount] = useState(0);
  const [shelterCount, setShelterCount] = useState(0);

  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [areaLabel, setAreaLabel] = useState('');
  const [gpsBusy, setGpsBusy] = useState(false);
  const [planning, setPlanning] = useState(false);
  const [result, setResult] = useState<EvacResponse | null>(null);
  const [error, setError] = useState('');
  const [usedGps, setUsedGps] = useState(false);

  const api = useCallback(
    async (path: string, method = 'GET', body?: unknown) => {
      const res = await fetch(path, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Request failed (${res.status})`);
      }
      return res.json();
    },
    [token]
  );

  useEffect(() => {
    if (!token) return;
    api('/api/shelter/evacuate/status')
      .then((d) => {
        setZoneCount(d.zoneCount || 0);
        setShelterCount(d.shelterCount || 0);
      })
      .catch(() => {});
  }, [token, api]);

  if (!token) {
    return (
      <div className="fixed inset-0 z-[115] bg-[#141b2b]/55 dark:bg-[#05060c]/85 backdrop-blur-sm overflow-y-auto py-6 px-4">
        <div className="max-w-xl mx-auto">
          <Header onClose={onClose} />
          <div className="bg-[#fcfaf4] border border-[#ebdcca] rounded-3xl p-8 text-center space-y-3">
            <KeyRound className="mx-auto text-[#8a8172]" size={28} />
            <p className="font-display text-base font-bold text-[#3a342a] dark:text-zinc-100">Log in to plan routes</p>
            <p className="text-xs text-[#8a8172] max-w-xs mx-auto">
              Evacuation planning needs a session so it can record who evacuated where.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const captureGps = () => {
    setGpsBusy(true);
    setError('');
    if (!navigator.geolocation) {
      setGpsBusy(false);
      setError('Geolocation is not available in this browser.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude.toFixed(5));
        setLng(pos.coords.longitude.toFixed(5));
        setUsedGps(true);
        setGpsBusy(false);
      },
      () => {
        setGpsBusy(false);
        setError('Location permission denied — enter coordinates or an area label manually.');
      },
      { enableHighAccuracy: true, timeout: 12000 }
    );
  };

  const plan = async () => {
    setPlanning(true);
    setError('');
    setResult(null);
    try {
      const body: Record<string, unknown> = {};
      const nLat = Number(lat);
      const nLng = Number(lng);
      if (Number.isFinite(nLat) && Number.isFinite(nLng)) {
        body.lat = nLat;
        body.lng = nLng;
      }
      if (areaLabel.trim()) body.areaLabel = areaLabel.trim();
      const data = await api('/api/shelter/evacuate', 'POST', body);
      setResult(data);
    } catch (e: any) {
      setError(e.message || 'Planning failed.');
    } finally {
      setPlanning(false);
    }
  };

  const bearingName = (deg: number): string => {
    const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    return dirs[Math.round(deg / 45) % 8];
  };

  return (
    <div className="fixed inset-0 z-[115] bg-[#141b2b]/55 dark:bg-[#05060c]/85 backdrop-blur-sm overflow-y-auto py-6 px-4">
      <div className="max-w-3xl mx-auto space-y-5">
        <Header onClose={onClose} />

        {/* Status strip */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-[#fcfaf4] border border-[#ebdcca] rounded-2xl p-4 flex items-center gap-3">
            <span className="w-9 h-9 rounded-full bg-sky-600/10 flex items-center justify-center">
              <Droplets className="text-sky-600" size={16} />
            </span>
            <div>
              <p className="font-display text-sm font-bold text-[#3a342a] dark:text-zinc-100">{zoneCount}</p>
              <p className="font-mono text-[8px] uppercase tracking-wider text-[#8a8172]">flood zones live</p>
            </div>
          </div>
          <div className="bg-[#fcfaf4] border border-[#ebdcca] rounded-2xl p-4 flex items-center gap-3">
            <span className="w-9 h-9 rounded-full bg-emerald-600/10 flex items-center justify-center">
              <Building2 className="text-emerald-600" size={16} />
            </span>
            <div>
              <p className="font-display text-sm font-bold text-[#3a342a] dark:text-zinc-100">{shelterCount}</p>
              <p className="font-mono text-[8px] uppercase tracking-wider text-[#8a8172]">open shelters</p>
            </div>
          </div>
        </div>

        {/* Planner */}
        <div className="bg-[#fcfaf4] border border-[#ebdcca] rounded-3xl p-5 space-y-3">
          <div className="flex items-center gap-2">
            <span className="w-8 h-8 rounded-full bg-rose-600/10 flex items-center justify-center">
              <Navigation className="text-rose-600" size={15} />
            </span>
            <div>
              <h3 className="font-display text-sm font-bold text-[#3a342a] dark:text-zinc-100">Plan my evacuation</h3>
              <p className="font-mono text-[8px] uppercase tracking-wider text-[#8a8172]">
                Avoids flooded corridors using community reports
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <button
              onClick={captureGps}
              disabled={gpsBusy}
              className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-[#3a342a] text-[#f4f1ea] text-[10px] font-mono uppercase font-bold hover:bg-[#52493b] disabled:opacity-50"
            >
              {gpsBusy ? <Loader2 size={13} className="animate-spin" /> : <LocateFixed size={13} />}
              Use my GPS
            </button>
            <input
              value={lat}
              onChange={(e) => setLat(e.target.value)}
              placeholder="Latitude"
              className="px-3 py-2.5 rounded-xl bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 text-xs outline-none focus:border-amber-400"
            />
            <input
              value={lng}
              onChange={(e) => setLng(e.target.value)}
              placeholder="Longitude"
              className="px-3 py-2.5 rounded-xl bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 text-xs outline-none focus:border-amber-400"
            />
          </div>
          <input
            value={areaLabel}
            onChange={(e) => setAreaLabel(e.target.value)}
            placeholder="…or an area label (e.g. “Gulshan 2, near the lake”)"
            className="w-full px-3 py-2.5 rounded-xl bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 text-xs outline-none focus:border-amber-400"
          />
          <div className="flex items-center gap-2">
            <button
              onClick={plan}
              disabled={planning || (!lat && !lng && !areaLabel.trim())}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#3a342a] text-[#f4f1ea] text-[10px] font-mono uppercase font-bold hover:bg-[#52493b] disabled:opacity-40"
            >
              {planning ? <Loader2 size={13} className="animate-spin" /> : <Navigation size={13} />}
              Find safest route
            </button>
            {usedGps && (
              <span className="font-mono text-[8px] uppercase tracking-wider text-emerald-600">GPS locked ✓</span>
            )}
          </div>
          {error && <p className="font-mono text-[9px] uppercase tracking-wider text-rose-500">{error}</p>}
        </div>

        {/* Results */}
        {result && (
          <>
            {result.safeBearing > 0 && (
              <div className="bg-[#fcfaf4] border border-[#ebdcca] rounded-2xl p-4 flex items-center gap-3">
                <span className="w-10 h-10 rounded-full bg-amber-600/10 flex items-center justify-center shrink-0">
                  <Compass className="text-amber-600" size={18} />
                </span>
                <div>
                  <p className="text-[11px] font-semibold text-[#3a342a] dark:text-zinc-100">
                    Head generally {bearingName(result.safeBearing)} ({result.safeBearing}°) to move away from the deepest flood zone.
                  </p>
                  <p className="font-mono text-[8px] uppercase tracking-wider text-[#8a8172]">first move · then follow an option below</p>
                </div>
              </div>
            )}

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-display text-sm font-bold text-[#3a342a] dark:text-zinc-100 flex items-center gap-1.5">
                  <ShieldAlert size={14} className="text-rose-600" /> Evacuation options
                </h3>
                <span className="font-mono text-[8px] uppercase tracking-wider text-[#8a8172]">
                  {result.options.length} shelter{result.options.length === 1 ? '' : 's'} ranked
                </span>
              </div>

              {result.options.length === 0 ? (
                <div className="py-8 text-center space-y-2">
                  <Building2 className="mx-auto text-[#8a8172]" size={26} />
                  <p className="font-display text-sm text-[#5c5446] dark:text-zinc-300">
                    No open shelters found — register one in Safe Shelter during normal times.
                  </p>
                </div>
              ) : (
                result.options.map((o, i) => (
                  <motion.div
                    key={o.shelterId}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(i * 0.05, 0.4) }}
                    className="bg-[#fcfaf4] border border-[#ebdcca] rounded-2xl p-4 space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-[12px] font-bold text-[#3a342a] dark:text-zinc-100 flex items-center gap-1.5">
                          {i + 1}. {o.name}
                          {o.verified && (
                            <span className="text-[8px] font-mono uppercase font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-600/10 px-1.5 py-0.5 rounded-full">
                              verified
                            </span>
                          )}
                        </p>
                        <p className="font-mono text-[8px] uppercase tracking-wider text-[#8a8172] mt-0.5">
                          <MapPin size={9} className="inline" /> {o.areaLabel}
                          {o.estKm > 0 ? ` · ~${o.estKm}km` : ' · distance unknown'}
                          {o.capacity > 0 ? ` · capacity ${o.capacity}` : ''}
                        </p>
                      </div>
                      <span className={`shrink-0 text-[8px] font-mono uppercase font-bold px-2 py-1 rounded-full border ${HAZARD_STYLE[o.hazardLevel]}`}>
                        {o.hazardLevel}
                      </span>
                    </div>

                    {(o.floodDepthCm > 0 || o.hazardScore > 0) && (
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 rounded-full bg-[#ebdcca]/60 dark:bg-zinc-800 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              o.hazardLevel === 'low'
                                ? 'bg-emerald-500'
                                : o.hazardLevel === 'moderate'
                                  ? 'bg-amber-500'
                                  : 'bg-rose-500'
                            }`}
                            style={{ width: `${o.hazardScore}%` }}
                          />
                        </div>
                        <span className="font-mono text-[8px] uppercase tracking-wider text-[#8a8172] shrink-0">
                          hazard {o.hazardScore}%
                        </span>
                      </div>
                    )}

                    <p className="text-[11px] leading-relaxed text-[#5c5446] dark:text-zinc-300">{o.advice}</p>
                  </motion.div>
                ))
              )}

              {result.floodZones.length > 0 && (
                <div className="bg-[#fcfaf4] border border-[#ebdcca] rounded-2xl p-4 space-y-2">
                  <p className="font-mono text-[8px] uppercase tracking-wider text-[#8a8172] flex items-center gap-1.5">
                    <Waves size={10} className="text-sky-600" /> Flood zones near your route
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {result.floodZones.map((z) => (
                      <span
                        key={z.areaLabel}
                        className={`text-[8px] font-mono uppercase px-2 py-1 rounded-full ${
                          z.maxDepthCm >= 60
                            ? 'text-rose-700 dark:text-rose-400 bg-rose-600/10'
                            : 'text-sky-700 dark:text-sky-400 bg-sky-600/10'
                        }`}
                      >
                        {z.areaLabel} · {z.reportCount} reports · {Math.round(z.maxDepthCm)}cm
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex items-start gap-2 bg-amber-600/5 border border-amber-600/20 rounded-2xl p-3">
                <AlertTriangle size={13} className="text-amber-600 shrink-0 mt-0.5" />
                <p className="text-[10px] leading-relaxed text-[#5c5446] dark:text-zinc-300">{result.disclaimer}</p>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Header({ onClose }: { onClose: () => void }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-2">
        <span className="w-9 h-9 rounded-full bg-rose-600/10 flex items-center justify-center">
          <Waves className="text-rose-600" size={18} />
        </span>
        <div>
          <h2 className="font-display text-lg font-bold text-[#3a342a] dark:text-zinc-100">Evacuation Routes</h2>
          <p className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172]">cyclone route optimizer · 128</p>
        </div>
      </div>
      <button
        onClick={onClose}
        className="w-9 h-9 rounded-full bg-white/80 dark:bg-zinc-800 flex items-center justify-center text-[#3a342a] dark:text-zinc-200 hover:bg-white"
        aria-label="Close"
      >
        <X size={16} />
      </button>
    </div>
  );
}
