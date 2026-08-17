import { useCallback, useEffect, useState } from 'react';
import { motion } from 'motion/react';
import {
  X, UtensilsCrossed, Loader2, MapPin, Plus, LocateFixed, BadgeCheck,
  KeyRound, CheckCircle2, Flag, Send, Users, AlertTriangle,
} from 'lucide-react';

/**
 * Ocean — Community Kitchens (FEATURE 129 — Disaster Community Kitchen Coordination)
 * -----------------------------------------------------------------------------------
 * Register kitchens serving food during disasters, request meals, and fulfil
 * requests for coins. Area-label only by default (privacy) with optional
 * coarse GPS opt-in per kitchen.
 */

interface CommunityKitchensProps {
  token: string | null;
  currentUser: { id: string; name: string } | null;
  onClose: () => void;
}

interface Kitchen {
  id: string;
  name: string;
  areaLabel: string;
  foodTypes: string[];
  mealsPerDay: number;
  openHours: string;
  status: 'open' | 'closed' | 'out_of_food';
  notes: string;
  ownerName: string;
  verified: boolean;
  verifiedCount: number;
  reportCount: number;
  requestCount: number;
  createdAt: number;
  isOwner: boolean;
  verifiedByMe: boolean;
  openRequestCount: number;
}

interface KitchenRequest {
  id: string;
  kitchenId: string;
  requesterName: string;
  foodType: string;
  people: number;
  notes: string;
  status: 'open' | 'fulfilled';
  createdAt: number;
  fulfilledByName?: string;
  isMine?: boolean;
  canFulfill?: boolean;
}

const STATUS_STYLE: Record<string, string> = {
  open: 'text-emerald-700 dark:text-emerald-400 bg-emerald-600/10',
  out_of_food: 'text-amber-700 dark:text-amber-400 bg-amber-600/10',
  closed: 'text-rose-700 dark:text-rose-400 bg-rose-600/10',
};

const FOOD_OPTIONS = ['rice', 'daal', 'bread', 'water', 'milk', 'baby-food', 'medicine', 'cooked-meal', 'dry-rations'];

export default function CommunityKitchens({ token, currentUser, onClose }: CommunityKitchensProps) {
  const [kitchens, setKitchens] = useState<Kitchen[]>([]);
  const [requests, setRequests] = useState<KitchenRequest[]>([]);
  const [areaFilter, setAreaFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  // create form
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [areaLabel, setAreaLabel] = useState('');
  const [foodTypes, setFoodTypes] = useState<string[]>([]);
  const [mealsPerDay, setMealsPerDay] = useState('');
  const [status, setStatus] = useState('open');
  const [shareLoc, setShareLoc] = useState(false);
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [gpsBusy, setGpsBusy] = useState(false);
  const [creating, setCreating] = useState(false);

  // request flow: which kitchen is the request form open on
  const [requestFor, setRequestFor] = useState('');
  const [reqFood, setReqFood] = useState('');
  const [reqPeople, setReqPeople] = useState('2');
  const [reqBusy, setReqBusy] = useState(false);

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

  const load = useCallback(async () => {
    try {
      const qs = areaFilter.trim() ? `?area=${encodeURIComponent(areaFilter.trim())}` : '';
      const [kitchenData, reqData] = await Promise.all([
        api(`/api/disaster/kitchens${qs}`),
        api('/api/disaster/kitchen-requests'),
      ]);
      setKitchens(kitchenData.kitchens || []);
      setRequests(reqData.requests || []);
      setError('');
    } catch (e: any) {
      setError(e.message || 'Could not load kitchens.');
    } finally {
      setLoading(false);
    }
  }, [api, areaFilter]);

  useEffect(() => {
    if (token) load();
  }, [token, load]);

  if (!token) {
    return (
      <div className="fixed inset-0 z-[115] bg-[#141b2b]/55 dark:bg-[#05060c]/85 backdrop-blur-sm overflow-y-auto py-6 px-4">
        <div className="max-w-xl mx-auto">
          <Header onClose={onClose} />
          <div className="bg-[#fcfaf4] border border-[#ebdcca] rounded-3xl p-8 text-center space-y-3">
            <KeyRound className="mx-auto text-[#8a8172]" size={28} />
            <p className="font-display text-base font-bold text-[#3a342a] dark:text-zinc-100">Log in to coordinate</p>
            <p className="text-xs text-[#8a8172] max-w-xs mx-auto">
              Registering kitchens and fulfilling food requests need a session.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const captureGps = () => {
    setGpsBusy(true);
    if (!navigator.geolocation) {
      setGpsBusy(false);
      setMsg('Geolocation unavailable.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude.toFixed(5));
        setLng(pos.coords.longitude.toFixed(5));
        setGpsBusy(false);
      },
      () => {
        setGpsBusy(false);
        setMsg('Permission denied — coords will be omitted (area label only).');
      },
      { enableHighAccuracy: true, timeout: 12000 }
    );
  };

  const create = async () => {
    if (creating) return;
    setCreating(true);
    setMsg('');
    try {
      const body: Record<string, unknown> = {
        name,
        areaLabel,
        foodTypes,
        mealsPerDay: Number(mealsPerDay) || 0,
        status,
        shareLocation: shareLoc,
      };
      if (shareLoc && Number(lat) && Number(lng)) {
        body.lat = Number(lat);
        body.lng = Number(lng);
      }
      const data = await api('/api/disaster/kitchens', 'POST', body);
      setMsg(`Kitchen registered — ${data.kitchen?.name || 'welcome'}.`);
      setName('');
      setAreaLabel('');
      setFoodTypes([]);
      setMealsPerDay('');
      setShowForm(false);
      load();
    } catch (e: any) {
      setMsg(e.message || 'Register failed.');
    } finally {
      setCreating(false);
    }
  };

  const requestFood = async (kitchenId: string) => {
    if (reqBusy) return;
    setReqBusy(true);
    setMsg('');
    try {
      await api(`/api/disaster/kitchens/${kitchenId}/request`, 'POST', {
        foodType: reqFood,
        people: Number(reqPeople) || 1,
      });
      setRequestFor('');
      setReqFood('');
      setMsg('Request placed — a volunteer can now fulfil it.');
      load();
    } catch (e: any) {
      setMsg(e.message || 'Request failed.');
    } finally {
      setReqBusy(false);
    }
  };

  const verify = async (id: string) => {
    try {
      await api(`/api/disaster/kitchens/${id}/verify`, 'POST');
      load();
    } catch (e: any) {
      setMsg(e.message || 'Verify failed.');
    }
  };

  const report = async (id: string) => {
    try {
      await api(`/api/disaster/kitchens/${id}/report`, 'POST', { reason: 'closed' });
      setMsg('Reported — 3 reports close a kitchen.');
      load();
    } catch (e: any) {
      setMsg(e.message || 'Report failed.');
    }
  };

  const fulfill = async (requestId: string) => {
    try {
      await api(`/api/disaster/kitchen-requests/${requestId}/fulfill`, 'POST');
      setMsg('Request fulfilled — +6 coins.');
      load();
    } catch (e: any) {
      setMsg(e.message || 'Fulfil failed.');
    }
  };

  const toggleFood = (f: string) => {
    setFoodTypes((prev) => (prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f]));
  };

  const openRequests = requests.filter((r) => r.status === 'open');

  return (
    <div className="fixed inset-0 z-[115] bg-[#141b2b]/55 dark:bg-[#05060c]/85 backdrop-blur-sm overflow-y-auto py-6 px-4">
      <div className="max-w-3xl mx-auto space-y-5">
        <Header onClose={onClose} />

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={areaFilter}
            onChange={(e) => setAreaFilter(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && load()}
            placeholder="Filter by area…"
            className="flex-1 min-w-[160px] px-3 py-2.5 rounded-xl bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 text-xs outline-none focus:border-amber-400"
          />
          <button
            onClick={load}
            className="px-3 py-2.5 rounded-xl bg-[#3a342a] text-[#f4f1ea] text-[10px] font-mono uppercase font-bold hover:bg-[#52493b]"
          >
            Apply
          </button>
          <button
            onClick={() => setShowForm((v) => !v)}
            className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-white border border-[#cfcac0] text-xs text-[#3a342a] hover:bg-[#f6f1e7]"
          >
            <Plus size={12} /> Register kitchen
          </button>
        </div>

        {msg && (
          <p className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] bg-[#fcfaf4] border border-[#ebdcca] rounded-xl px-3 py-2">
            {msg}
          </p>
        )}

        {/* Create form */}
        {showForm && (
          <div className="bg-[#fcfaf4] border border-[#ebdcca] rounded-3xl p-5 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Kitchen name (e.g. 'North-side relief kitchen')"
                className="px-3 py-2.5 rounded-xl bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 text-xs outline-none focus:border-amber-400"
              />
              <input
                value={areaLabel}
                onChange={(e) => setAreaLabel(e.target.value)}
                placeholder="Area label (e.g. 'Near the bazaar, north side')"
                className="px-3 py-2.5 rounded-xl bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 text-xs outline-none focus:border-amber-400"
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {FOOD_OPTIONS.map((f) => (
                <button
                  key={f}
                  onClick={() => toggleFood(f)}
                  className={`text-[9px] font-mono uppercase px-2.5 py-1 rounded-full transition-colors ${
                    foodTypes.includes(f)
                      ? 'bg-[#3a342a] text-[#f4f1ea]'
                      : 'bg-[#ebdcca]/40 dark:bg-zinc-800 text-[#5c5446] hover:bg-[#ebdcca]/70'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <input
                value={mealsPerDay}
                onChange={(e) => setMealsPerDay(e.target.value)}
                type="number"
                placeholder="Meals / day (0 = unknown)"
                className="px-3 py-2.5 rounded-xl bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 text-xs outline-none focus:border-amber-400"
              />
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="px-3 py-2.5 rounded-xl bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 text-xs outline-none focus:border-amber-400"
              >
                <option value="open">open</option>
                <option value="out_of_food">out of food</option>
                <option value="closed">closed</option>
              </select>
              <button
                onClick={captureGps}
                disabled={gpsBusy}
                className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-white border border-[#cfcac0] text-xs text-[#3a342a] hover:bg-[#f6f1e7] disabled:opacity-50"
              >
                {gpsBusy ? <Loader2 size={12} className="animate-spin" /> : <LocateFixed size={12} />}
                {lat && lng ? 'Coords locked' : 'Opt-in coords'}
              </button>
            </div>
            {lat && lng && (
              <label className="flex items-center gap-2 text-[10px] text-[#5c5446] dark:text-zinc-300">
                <input type="checkbox" checked={shareLoc} onChange={(e) => setShareLoc(e.target.checked)} className="accent-amber-600" />
                Share coarse location ({lat}, {lng}) — rounded to ~11m
              </label>
            )}
            <button
              onClick={create}
              disabled={creating || name.trim().length < 3 || areaLabel.trim().length < 3}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#3a342a] text-[#f4f1ea] text-[10px] font-mono uppercase font-bold hover:bg-[#52493b] disabled:opacity-40"
            >
              {creating ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
              Register (+8 coins)
            </button>
          </div>
        )}

        {/* Open needs strip */}
        {openRequests.length > 0 && (
          <div className="bg-amber-600/5 border border-amber-600/20 rounded-2xl p-4 space-y-2">
            <p className="font-mono text-[8px] uppercase tracking-wider text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
              <Users size={10} /> Open food requests — fulfil for +6 coins
            </p>
            <div className="space-y-1.5">
              {openRequests.slice(0, 8).map((r) => (
                <div key={r.id} className="flex items-center gap-2 text-[10px]">
                  <span className="flex-1 min-w-0 truncate text-[#5c5446] dark:text-zinc-300">
                    {r.requesterName} needs <b className="text-[#3a342a] dark:text-zinc-100">{r.foodType}</b>
                    {r.people > 1 ? ` for ${r.people} people` : ''}
                    {r.notes ? ` — ${r.notes}` : ''}
                  </span>
                  {r.canFulfill ? (
                    <button
                      onClick={() => fulfill(r.id)}
                      className="shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#3a342a] text-[#f4f1ea] text-[8px] font-mono uppercase font-bold hover:bg-[#52493b]"
                    >
                      <CheckCircle2 size={9} /> Fulfil
                    </button>
                  ) : (
                    <span className="shrink-0 font-mono text-[8px] uppercase text-[#8a8172]">yours</span>
                  )}
                </div>
              ))}
              {openRequests.length > 8 && (
                <p className="font-mono text-[8px] uppercase text-[#8a8172]">+{openRequests.length - 8} more</p>
              )}
            </div>
          </div>
        )}

        {/* Kitchens */}
        {loading ? (
          <div className="py-12 text-center">
            <Loader2 className="mx-auto text-[#8a8172] animate-spin" size={24} />
          </div>
        ) : error ? (
          <div className="py-10 text-center font-mono text-[10px] uppercase tracking-wider text-rose-500">{error}</div>
        ) : kitchens.length === 0 ? (
          <div className="py-10 text-center space-y-2">
            <UtensilsCrossed className="mx-auto text-[#8a8172]" size={26} />
            <p className="font-display text-sm text-[#5c5446] dark:text-zinc-300">No kitchens here yet.</p>
            <p className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172]">Register the first one above</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {kitchens.map((k, i) => (
              <motion.div
                key={k.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.03, 0.3) }}
                className="bg-[#fcfaf4] border border-[#ebdcca] rounded-2xl p-4 space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[12px] font-bold text-[#3a342a] dark:text-zinc-100 flex items-center gap-1.5">
                      {k.name}
                      {k.verified && <BadgeCheck size={13} className="text-emerald-600 shrink-0" />}
                    </p>
                    <p className="font-mono text-[8px] uppercase tracking-wider text-[#8a8172] mt-0.5">
                      <MapPin size={9} className="inline" /> {k.areaLabel} · by {k.ownerName}
                    </p>
                  </div>
                  <span className={`shrink-0 text-[8px] font-mono uppercase font-bold px-2 py-1 rounded-full ${STATUS_STYLE[k.status]}`}>
                    {k.status.replace('_', ' ')}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  {k.foodTypes.slice(0, 5).map((f) => (
                    <span key={f} className="text-[8px] font-mono uppercase text-[#5c5446] dark:text-zinc-400 bg-[#ebdcca]/50 dark:bg-zinc-800 px-1.5 py-0.5 rounded-full">
                      {f}
                    </span>
                  ))}
                  {k.mealsPerDay > 0 && (
                    <span className="text-[8px] font-mono uppercase text-[#8a8172]">{k.mealsPerDay}/day</span>
                  )}
                </div>

                <div className="flex items-center justify-between font-mono text-[8px] uppercase tracking-wider text-[#8a8172]">
                  <span>{k.openHours}</span>
                  <span>{k.openRequestCount} open request{k.openRequestCount === 1 ? '' : 's'}</span>
                </div>

                {/* Request form */}
                {requestFor === k.id ? (
                  <div className="space-y-2 bg-[#f6f1e7]/60 dark:bg-zinc-800/40 rounded-xl p-3">
                    <input
                      value={reqFood}
                      onChange={(e) => setReqFood(e.target.value)}
                      placeholder="What do you need? (e.g. rice)"
                      className="w-full px-2.5 py-2 rounded-lg bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 text-[11px] outline-none focus:border-amber-400"
                    />
                    <div className="flex items-center gap-2">
                      <input
                        value={reqPeople}
                        onChange={(e) => setReqPeople(e.target.value)}
                        type="number"
                        min={1}
                        placeholder="People"
                        className="w-20 px-2.5 py-2 rounded-lg bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 text-[11px] outline-none focus:border-amber-400"
                      />
                      <button
                        onClick={() => requestFood(k.id)}
                        disabled={reqBusy || !reqFood.trim()}
                        className="flex items-center gap-1 px-3 py-2 rounded-lg bg-[#3a342a] text-[#f4f1ea] text-[9px] font-mono uppercase font-bold hover:bg-[#52493b] disabled:opacity-40"
                      >
                        {reqBusy ? <Loader2 size={11} className="animate-spin" /> : <Send size={11} />}
                        Place request
                      </button>
                      <button onClick={() => setRequestFor('')} className="text-[9px] font-mono uppercase text-[#8a8172] hover:underline">
                        cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      onClick={() => {
                        setRequestFor(k.id);
                        setReqFood('');
                      }}
                      disabled={k.status !== 'open'}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600/10 text-emerald-700 dark:text-emerald-400 text-[9px] font-mono uppercase font-bold hover:bg-emerald-600/20 disabled:opacity-40"
                    >
                      <UtensilsCrossed size={10} /> Request food
                    </button>
                    {!k.verifiedByMe && !k.isOwner && (
                      <button
                        onClick={() => verify(k.id)}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white border border-[#cfcac0] text-[9px] font-mono uppercase text-[#5c5446] hover:bg-[#f6f1e7]"
                      >
                        <CheckCircle2 size={10} /> Verify
                      </button>
                    )}
                    {!k.isOwner && (
                      <button
                        onClick={() => report(k.id)}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white border border-[#cfcac0] text-[9px] font-mono uppercase text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                      >
                        <Flag size={10} /> Report
                      </button>
                    )}
                  </div>
                )}

                {k.openRequestCount > 0 && (
                  <div className="flex items-start gap-1.5 text-[9px] text-amber-700 dark:text-amber-400">
                    <AlertTriangle size={10} className="mt-0.5 shrink-0" />
                    <span>{k.openRequestCount} neighbour{k.openRequestCount === 1 ? '' : 's'} waiting for food — tap the amber strip above to help.</span>
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Header({ onClose }: { onClose: () => void }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-2">
        <span className="w-9 h-9 rounded-full bg-amber-600/10 flex items-center justify-center">
          <UtensilsCrossed className="text-amber-600" size={18} />
        </span>
        <div>
          <h2 className="font-display text-lg font-bold text-[#3a342a] dark:text-zinc-100">Community Kitchens</h2>
          <p className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172]">disaster meal coordination · 129</p>
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
