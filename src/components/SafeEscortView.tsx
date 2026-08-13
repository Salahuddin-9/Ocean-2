import React, { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ShieldCheck, X, MapPin, Clock, Users, Wallet, Star, HeartHandshake,
  Plus, LocateFixed, Send, Eye, Route, Footprints, BadgeCheck, AlertTriangle,
  Phone, Search, Handshake, UserCheck, Navigation, Map,
} from 'lucide-react';

/**
 * Ocean — Safe Escort & Route Safety
 * -----------------------------------
 * A civic-resilience feature that extends the Emergency UX (EmergencyView /
 * SafeSOS / Safe Shelter / Blood Donor Registry / Missing Person Alerts):
 *  - Escort requests: "walking home at ~11pm, want an escort". Fuzzy area
 *    labels are always shared; precise start/destination coords are attached
 *    ONLY when you opt in on that press and are revealed only to the matched
 *    escort after an offer is accepted.
 *  - Escort directory: explicitly register as a community escort (fuzzy area +
 *    availability). Your contact line is revealed only to a requester after
 *    they accept your offer.
 *  - Route safety ratings: 1-5 stars + tags ("well lit" / "isolated" / …) build
 *    a community safety score to help people choose a safer route.
 *  - Safety coins: +10 first-time escort registration, +15 to the escort when a
 *    matched request completes, +5 per route rating (once per area per user).
 *
 * Backed by /api/escort/* (turtleSafeEscortBackend.ts).
 */

type Kind = 'walk' | 'ride' | 'wait' | 'companion';
type Availability = 'anytime' | 'evenings' | 'nights' | 'weekends';
type RequestStatus = 'open' | 'matched' | 'completed' | 'cancelled' | 'expired' | 'suppressed';
type Tab = 'open' | 'routes' | 'me';

interface EscortRequest {
  id: string;
  requesterId: string;
  requesterName: string;
  kind: Kind;
  direction: string;
  startArea: string;
  destArea?: string;
  note: string;
  when: string;
  windowMinutes: number;
  status: RequestStatus;
  shareLocation: boolean;
  startLat?: number;
  startLng?: number;
  destLat?: number;
  destLng?: number;
  contactLine?: string;
  matchedOfferId?: string;
  matchedEscortId?: string;
  matchedEscortName?: string;
  completedAt?: number;
  cancelledAt?: number;
  reports?: { reason: string; details: string; by: string; at: number }[];
  createdAt: number;
  expiresAt: number;
  isMine?: boolean;
  offerCount?: number;
  myOffer?: EscortOffer | null;
}

interface EscortOffer {
  id: string;
  requestId: string;
  escortId: string;
  escortName: string;
  escortArea: string;
  note: string;
  status: 'offered' | 'accepted' | 'withdrawn' | 'declined';
  createdAt: number;
}

interface EscortProfile {
  id: string;
  userId: string;
  userName: string;
  area: string;
  availability: Availability;
  note: string;
  active: boolean;
  completedCount: number;
  createdAt: number;
  updatedAt: number;
  isMe?: boolean;
}

interface RouteRating {
  id: string;
  raterId: string;
  raterName: string;
  areaLabel: string;
  when: string;
  score: number;
  tags: string[];
  comment: string;
  createdAt: number;
}

interface CoverageRow {
  areaLabel: string;
  ratingCount: number;
  average: number;
  band: 'safe' | 'caution' | 'unsafe';
  topTags: string[];
}

interface StatusSummary {
  me: { id: string; name: string };
  profile: EscortProfile | null;
  requestCount: number;
  openCount: number;
  offerCount: number;
  balance: number;
}

interface SafeEscortViewProps {
  token: string | null;
  currentUser: { id: string; name: string } | null;
  onClose: () => void;
}

const KIND_LABEL: Record<Kind, string> = {
  walk: 'Walk home',
  ride: 'Shared ride / rickshaw',
  wait: 'Wait with me',
  companion: 'Errand companion',
};

const KIND_ICON: Record<Kind, any> = {
  walk: Footprints,
  ride: Navigation,
  wait: Clock,
  companion: UserCheck,
};

const RATING_TAGS = [
  'well_lit', 'dark', 'busy', 'isolated', 'cameras', 'police_patrol',
  'stray_animals', 'construction', 'public_transport', 'no_footpath',
];

const TAG_LABEL: Record<string, string> = {
  well_lit: 'Well lit', dark: 'Dark', busy: 'Busy', isolated: 'Isolated',
  cameras: 'Cameras', police_patrol: 'Police patrol', stray_animals: 'Stray animals',
  construction: 'Construction', public_transport: 'Public transport', no_footpath: 'No footpath',
};

const STATUS_BADGE: Record<RequestStatus, string> = {
  open: 'bg-amber-50 text-amber-600',
  matched: 'bg-sky-50 text-sky-600',
  completed: 'bg-emerald-50 text-emerald-600',
  cancelled: 'bg-zinc-100 text-zinc-500',
  expired: 'bg-zinc-100 text-zinc-500',
  suppressed: 'bg-rose-50 text-rose-500',
};

const BAND_STYLE: Record<string, string> = {
  safe: 'bg-emerald-100 text-emerald-700',
  caution: 'bg-amber-100 text-amber-700',
  unsafe: 'bg-rose-100 text-rose-700',
};

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

// ---------------------------------------------------------------------------
// Request card
// ---------------------------------------------------------------------------

function RequestCard({
  request, me, onOpenDetail, onChanged, api, toast,
}: {
  key?: string | number;
  request: EscortRequest; me: { id: string; name: string } | null;
  onOpenDetail: () => void; onChanged: () => void;
  api: (path: string, method?: string, body?: any) => Promise<any>;
  toast: (m: string, v?: string) => void;
}) {
  const isRequester = me?.id === request.requesterId;
  const KindIcon = KIND_ICON[request.kind] || Footprints;
  const [busy, setBusy] = useState(false);

  const cancel = async () => {
    setBusy(true);
    try {
      await api(`/api/escort/requests/${request.id}/cancel`, 'POST');
      toast('Request cancelled.');
      onChanged();
    } catch (e: any) { toast(e.message, 'destructive'); }
    finally { setBusy(false); }
  };

  return (
    <div className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-white/70 dark:bg-zinc-900/70 p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="w-10 h-10 rounded-xl bg-rose-600/10 dark:bg-rose-950/40 flex items-center justify-center shrink-0">
          <KindIcon className="text-rose-600 dark:text-rose-400" size={17} />
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-display font-bold text-sm text-[#3a342a] dark:text-zinc-100 flex-1 truncate">{request.direction}</h3>
            <span className={`font-mono text-[8px] uppercase px-1.5 py-0.5 rounded-full ${STATUS_BADGE[request.status]}`}>{request.status}</span>
          </div>
          <p className="text-[11px] text-[#5c5446] dark:text-zinc-300 mt-0.5">
            {KIND_LABEL[request.kind] || request.kind} · by {request.requesterName}
          </p>
          <div className="flex flex-wrap items-center gap-3 mt-1.5 text-[10px] text-[#8a8172] dark:text-zinc-400 font-mono uppercase tracking-wide">
            <span className="flex items-center gap-1 normal-case"><MapPin size={11} /> {request.startArea}{request.destArea ? ` → ${request.destArea}` : ''}</span>
            {request.when && <span className="flex items-center gap-1 normal-case"><Clock size={11} /> {request.when}</span>}
            <span>{timeAgo(request.createdAt)}</span>
          </div>
        </div>
      </div>
      {request.note && <p className="text-xs text-[#5c5446] dark:text-zinc-300 mt-2">{request.note}</p>}

      <div className="flex flex-wrap items-center gap-2 mt-3">
        <button
          onClick={onOpenDetail}
          className="font-mono text-[9px] uppercase font-bold tracking-wider py-1.5 px-3 rounded-lg bg-[#3a342a] text-[#f4f1ea] hover:bg-[#52493b] transition-all flex items-center gap-1"
        >
          <Eye size={11} /> {request.status === 'matched' ? 'Details' : `Details & offers (${request.offerCount || 0})`}
        </button>
        {isRequester && (request.status === 'open' || request.status === 'matched') && (
          <button
            onClick={cancel} disabled={busy}
            className="font-mono text-[9px] uppercase font-bold tracking-wider py-1.5 px-3 rounded-lg bg-transparent text-[#8a8172] border border-[#ebdcca] dark:border-zinc-700 hover:bg-[#ebdcca]/40 transition-all disabled:opacity-50"
          >
            Cancel
          </button>
        )}
        {request.status === 'matched' && request.matchedEscortName && (
          <span className="ml-auto font-mono text-[9px] uppercase tracking-wider text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
            <Handshake size={11} /> matched with {request.matchedEscortName}
          </span>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Create request dialog
// ---------------------------------------------------------------------------

function CreateRequestDialog({
  kinds, onClose, onCreate, api, toast,
}: {
  kinds: { id: string; label: string }[];
  onClose: () => void; onCreate: () => void;
  api: (path: string, method?: string, body?: any) => Promise<any>;
  toast: (m: string, v?: string) => void;
}) {
  const [form, setForm] = useState({
    kind: 'walk' as Kind, direction: '', startArea: '', destArea: '', when: '',
    note: '', windowMinutes: 120, contactLine: '', shareLocation: false, lat: 0, lng: 0,
  });
  const [saving, setSaving] = useState(false);

  const geo = () => {
    if (!navigator.geolocation) return toast('Geolocation is not available.');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setForm((f) => ({ ...f, shareLocation: true, lat: pos.coords.latitude, lng: pos.coords.longitude }));
        toast('Precise start location attached to this request (only shared on your opt-in).');
      },
      () => toast('Could not get your location.', 'destructive'),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const submit = async () => {
    if (form.direction.trim().length < 3) return toast('Describe the direction (e.g. "home from work").');
    if (form.startArea.trim().length < 2) return toast('An approximate start area is required.');
    if (form.note.trim().length < 5) return toast('Add a short note (at least 5 characters).');
    setSaving(true);
    try {
      await api('/api/escort/requests', 'POST', {
        ...form,
        windowMinutes: Number(form.windowMinutes) || 120,
        shareLocation: form.shareLocation && !!form.lat && !!form.lng,
      });
      toast('Escort request posted. Neighbourhood escorts can now offer.');
      onCreate();
    } catch (e: any) { toast(e.message, 'destructive'); }
    finally { setSaving(false); }
  };

  const inputCls = 'w-full bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 rounded-xl px-3 py-2 text-sm text-[#3a342a] dark:text-zinc-100 outline-none focus:border-amber-400';

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[120] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.94, y: 12 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.94, y: 12 }}
        className="bg-[#fcfaf4] dark:bg-zinc-900 rounded-[1.75rem] p-6 w-full max-w-md border-2 border-[#ebdcca] dark:border-zinc-800 space-y-3 shadow-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="font-display font-bold text-[#3a342a] dark:text-zinc-100 flex items-center gap-2">
            <ShieldCheck className="text-rose-600" size={16} /> Request an Escort
          </h3>
          <button onClick={onClose} className="text-[#8a8172] hover:text-[#3a342a]"><X size={16} /></button>
        </div>

        <p className="text-[11px] text-[#5c5446] dark:text-zinc-300 leading-relaxed">
          Post a public request for a neighbour to walk/ride with you. Your fuzzy area is always
          shared; your precise start location is only attached if you opt in below.
        </p>

        <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as Kind })} className={inputCls}>
          {kinds.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
        </select>
        <input value={form.direction} onChange={(e) => setForm({ ...form, direction: e.target.value })}
          placeholder="Direction, e.g. home from work" className={inputCls} />
        <div className="grid grid-cols-2 gap-2">
          <input value={form.startArea} onChange={(e) => setForm({ ...form, startArea: e.target.value })}
            placeholder="Start area (approx.)" className={inputCls} />
          <input value={form.destArea} onChange={(e) => setForm({ ...form, destArea: e.target.value })}
            placeholder="Destination (approx.)" className={inputCls} />
        </div>
        <input value={form.when} onChange={(e) => setForm({ ...form, when: e.target.value })}
          placeholder="When, e.g. tonight ~10pm" className={inputCls} />
        <textarea value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })}
          placeholder="Anything the escort should know…" rows={2} className={inputCls + ' resize-none'} />
        <div className="grid grid-cols-2 gap-2">
          <input type="number" value={form.windowMinutes} onChange={(e) => setForm({ ...form, windowMinutes: Number(e.target.value) })}
            placeholder="Offer window (min)" className={inputCls} />
          <input value={form.contactLine} onChange={(e) => setForm({ ...form, contactLine: e.target.value })}
            placeholder="Contact (only for matched escort)" className={inputCls} />
        </div>

        {/* Precise location opt-in */}
        <label className="flex items-start gap-2 text-xs text-[#5c5446] dark:text-zinc-300 rounded-xl border border-[#ebdcca] dark:border-zinc-700 bg-white/60 dark:bg-zinc-800/60 p-3 cursor-pointer">
          <input type="checkbox" checked={form.shareLocation} onChange={(e) => setForm({ ...form, shareLocation: e.target.checked })}
            className="mt-0.5 accent-rose-600" />
          <span className="flex-1">
            <span className="font-bold block">Share my precise start location</span>
            <span className="font-mono text-[9px] uppercase tracking-wide text-[#8a8172]">Optional — revealed only to the matched escort</span>
          </span>
          <button onClick={(e) => { e.preventDefault(); geo(); }} className="flex items-center gap-1 font-mono text-[9px] uppercase font-bold px-2 py-1 rounded-lg bg-rose-600 text-white hover:bg-rose-500">
            <LocateFixed size={10} /> GPS
          </button>
        </label>
        {form.shareLocation && form.lat !== 0 && (
          <p className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172]">Precise start attached ({form.lat.toFixed(4)}, {form.lng.toFixed(4)})</p>
        )}

        <button
          onClick={submit} disabled={saving}
          className="w-full font-mono text-[10px] uppercase font-bold tracking-wider py-2.5 rounded-xl bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-50 transition-all flex items-center justify-center gap-1.5"
        >
          <Send size={12} /> {saving ? 'Posting…' : 'Post request'}
        </button>
      </motion.div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Request detail modal (offers / offer / accept / complete / report)
// ---------------------------------------------------------------------------

function RequestDetailModal({
  requestId, me, api, toast, onChanged, onClose,
}: {
  requestId: string; me: { id: string; name: string } | null;
  api: (path: string, method?: string, body?: any) => Promise<any>;
  toast: (m: string, v?: string) => void; onChanged: () => void; onClose: () => void;
}) {
  const [req, setReq] = useState<EscortRequest | null>(null);
  const [offers, setOffers] = useState<EscortOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [matchedContact, setMatchedContact] = useState<string | undefined>();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api(`/api/escort/requests/${requestId}`, 'GET');
      setReq(data.request);
      setOffers(data.request?.offerCount ? data.offers || [] : []);
      setMatchedContact(data.matchedEscortContact);
    } catch (e: any) { toast(e.message, 'destructive'); }
    finally { setLoading(false); }
  }, [requestId, api, toast]);

  useEffect(() => { load(); }, [load]);

  const isRequester = me?.id === req?.requesterId;
  const isMatchedEscort = !!req?.matchedEscortId && req.matchedEscortId === me?.id;

  const offer = async () => {
    if (note.trim().length < 5) return toast('Add a short message (at least 5 characters).');
    setBusy(true);
    try {
      await api(`/api/escort/requests/${requestId}/offer`, 'POST', { note: note.trim() });
      toast('Offer sent. The requester will see it now.');
      setNote('');
      load(); onChanged();
    } catch (e: any) { toast(e.message, 'destructive'); }
    finally { setBusy(false); }
  };

  const acceptOffer = async (offerId: string) => {
    setBusy(true);
    try {
      const data = await api(`/api/escort/requests/${requestId}/accept`, 'POST', { offerId });
      toast('Escort matched. Their contact has been revealed to you.');
      setMatchedContact(data.matchedEscortContact);
      load(); onChanged();
    } catch (e: any) { toast(e.message, 'destructive'); }
    finally { setBusy(false); }
  };

  const complete = async () => {
    setBusy(true);
    try {
      const data = await api(`/api/escort/requests/${requestId}/complete`, 'POST');
      toast(data.escortCoins ? `Escort completed (+${data.escortCoins} coins to escort).` : 'Escort completed.');
      load(); onChanged();
    } catch (e: any) { toast(e.message, 'destructive'); }
    finally { setBusy(false); }
  };

  const reportFake = async () => {
    try {
      await api(`/api/escort/requests/${requestId}/report`, 'POST', { reason: 'fake_request' });
      toast('Report submitted. Fake requests are removed after 3 reports.');
      setReportOpen(false);
    } catch (e: any) { toast(e.message, 'destructive'); }
  };

  const inputCls = 'w-full bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 rounded-xl px-3 py-2 text-sm text-[#3a342a] dark:text-zinc-100 outline-none focus:border-amber-400';

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[120] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.94, y: 12 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.94, y: 12 }}
        className="bg-[#fcfaf4] dark:bg-zinc-900 rounded-[1.75rem] p-6 w-full max-w-lg border-2 border-[#ebdcca] dark:border-zinc-800 space-y-4 shadow-2xl max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {loading || !req ? (
          <div className="py-10 text-center font-mono text-[10px] uppercase tracking-wider text-[#8a8172]">Loading…</div>
        ) : (
          <>
            <div className="flex items-start gap-3">
              <span className="w-11 h-11 rounded-xl bg-rose-600/10 dark:bg-rose-950/40 flex items-center justify-center shrink-0">
                {(() => { const K = KIND_ICON[req.kind] || Footprints; return <K className="text-rose-600 dark:text-rose-400" size={18} />; })()}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-display font-bold text-lg text-[#3a342a] dark:text-zinc-100 truncate">{req.direction}</h3>
                  <button onClick={onClose} className="text-[#8a8172] hover:text-[#3a342a] shrink-0"><X size={16} /></button>
                </div>
                <p className="text-xs text-[#5c5446] dark:text-zinc-300">{KIND_LABEL[req.kind] || req.kind} · by {req.requesterName}</p>
                <span className={`font-mono text-[8px] uppercase px-1.5 py-0.5 rounded-full ${STATUS_BADGE[req.status]}`}>{req.status}</span>
              </div>
            </div>

            <div className="text-xs text-[#5c5446] dark:text-zinc-300 leading-relaxed">{req.note}</div>

            <div className="flex flex-wrap gap-2 text-[10px] font-mono uppercase tracking-wide text-[#8a8172] dark:text-zinc-400">
              <span className="flex items-center gap-1 normal-case"><MapPin size={11} /> {req.startArea}{req.destArea ? ` → ${req.destArea}` : ''}</span>
              {req.when && <span className="flex items-center gap-1 normal-case"><Clock size={11} /> {req.when}</span>}
              <span className="flex items-center gap-1"><Users size={11} /> {req.offerCount || 0} offers</span>
            </div>

            {/* Precise location revealed to matched pair only */}
            {(isRequester || isMatchedEscort) && req.shareLocation && req.startLat !== undefined && (
              <p className="font-mono text-[9px] uppercase tracking-wider text-rose-600 flex items-center gap-1">
                <LocateFixed size={11} /> Precise start location shared with the matched pair
              </p>
            )}

            {req.contactLine && (isRequester || isMatchedEscort) && (
              <p className="text-xs text-[#3a342a] dark:text-zinc-100 flex items-center gap-1.5 rounded-xl bg-white/60 dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 p-3">
                <Phone size={13} className="text-emerald-600 shrink-0" /> {req.contactLine}
              </p>
            )}
            {matchedContact && (
              <p className="text-xs text-[#3a342a] dark:text-zinc-100 flex items-center gap-1.5 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 p-3">
                <Handshake size={13} className="text-emerald-600 shrink-0" /> Matched escort: {req.matchedEscortName} · {matchedContact}
              </p>
            )}

            {/* Offers (requester view) */}
            {isRequester && req.status === 'open' && (
              <div>
                <h4 className="font-mono text-[10px] uppercase font-bold tracking-wider text-[#5c5446] dark:text-zinc-300 mb-2">Offers from escorts</h4>
                {offers.length === 0 ? (
                  <p className="text-[11px] text-[#8a8172] dark:text-zinc-400">No offers yet. Escorts nearby will see this request.</p>
                ) : (
                  <div className="space-y-2">
                    {offers.map((o) => (
                      <div key={o.id} className="rounded-xl border border-[#ebdcca]/70 dark:border-zinc-700 p-3 text-xs space-y-1">
                        <div className="flex justify-between">
                          <span className="font-bold text-[#3a342a] dark:text-zinc-100">{o.escortName}</span>
                          <span className="font-mono text-[9px] uppercase text-[#8a8172]">{timeAgo(o.createdAt)}</span>
                        </div>
                        <p className="text-[#5c5446] dark:text-zinc-300">{o.note}</p>
                        <p className="font-mono text-[9px] uppercase text-[#8a8172] normal-case">{o.escortArea}</p>
                        {o.status === 'offered' && (
                          <button onClick={() => acceptOffer(o.id)} disabled={busy}
                            className="font-mono text-[9px] uppercase font-bold tracking-wider py-1 px-3 rounded-lg bg-emerald-700 text-white hover:bg-emerald-800 disabled:opacity-50">
                            Accept this escort
                          </button>
                        )}
                        {o.status !== 'offered' && (
                          <span className="font-mono text-[9px] uppercase text-[#8a8172]">{o.status}</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Escort offer action */}
            {!isRequester && req.status === 'open' && (
              <div className="rounded-xl border border-[#ebdcca]/70 dark:border-zinc-700 p-3 space-y-2">
                <div className="text-[10px] font-mono uppercase font-bold tracking-wider text-[#5c5446] dark:text-zinc-300 flex items-center gap-1">
                  <ShieldCheck size={11} /> Offer to escort
                </div>
                <textarea value={note} onChange={(e) => setNote(e.target.value)}
                  placeholder="Say hello — when you're free, how they can spot you…" rows={2}
                  className={inputCls + ' resize-none'} />
                <button onClick={offer} disabled={busy}
                  className="w-full font-mono text-[9px] uppercase font-bold tracking-wider py-2 rounded-lg bg-[#3a342a] text-[#f4f1ea] hover:bg-[#52493b] disabled:opacity-50 flex items-center justify-center gap-1">
                  <Send size={11} /> {busy ? 'Sending…' : 'Send offer'}
                </button>
              </div>
            )}

            {/* Complete (requester or matched escort) */}
            {req.status === 'matched' && (isRequester || isMatchedEscort) && (
              <button onClick={complete} disabled={busy}
                className="w-full font-mono text-[9px] uppercase font-bold tracking-wider py-2 rounded-lg bg-emerald-700 text-white hover:bg-emerald-800 disabled:opacity-50 flex items-center justify-center gap-1">
                <BadgeCheck size={11} /> Mark escort completed
              </button>
            )}

            {/* Report fake */}
            <div className="flex items-center justify-between pt-1">
              {!isRequester && req.status === 'open' && (
                <button onClick={() => setReportOpen((v) => !v)} className="text-[#8a8172] dark:text-zinc-500 hover:text-red-600 transition-colors flex items-center gap-1 font-mono text-[9px] uppercase tracking-wider">
                  <AlertTriangle size={11} /> Report fake
                </button>
              )}
            </div>
            {reportOpen && (
              <div className="rounded-xl border border-red-200 dark:border-red-800/60 bg-red-50/60 dark:bg-red-950/30 p-3 space-y-2">
                <p className="text-[10px] font-mono uppercase font-bold tracking-wider text-red-700 dark:text-red-300">Report this request</p>
                <p className="text-[10px] text-[#5c5446] dark:text-zinc-300">Fake, spammy or commercial requests are removed after 3 reports.</p>
                <div className="flex gap-2">
                  <button onClick={reportFake} className="font-mono text-[9px] uppercase font-bold tracking-wider py-1 px-3 rounded-lg bg-red-600 text-white hover:bg-red-700">Report</button>
                  <button onClick={() => setReportOpen(false)} className="font-mono text-[9px] uppercase font-bold tracking-wider py-1 px-3 rounded-lg bg-transparent text-[#8a8172] border border-[#ebdcca] dark:border-zinc-700">Cancel</button>
                </div>
              </div>
            )}
          </>
        )}
      </motion.div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Me panel (escort profile + my requests)
// ---------------------------------------------------------------------------

function MePanel({
  status, me, requests, api, toast, onChanged, onOpenRequest,
}: {
  status: StatusSummary | null;
  me: { id: string; name: string } | null;
  requests: EscortRequest[];
  api: (path: string, method?: string, body?: any) => Promise<any>;
  toast: (m: string, v?: string) => void; onChanged: () => void;
  onOpenRequest: (id: string) => void;
}) {
  const profile = status?.profile || null;
  const [form, setForm] = useState({
    area: profile?.area || '', availability: (profile?.availability || 'anytime') as Availability,
    note: profile?.note || '', contactLine: '',
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm({
      area: profile?.area || '',
      availability: (profile?.availability || 'anytime') as Availability,
      note: profile?.note || '',
      contactLine: '',
    });
  }, [profile?.id]);

  const saveProfile = async () => {
    if (form.area.trim().length < 2) return toast('An approximate area is required.');
    setSaving(true);
    try {
      const data = await api('/api/escort/escort', 'POST', {
        area: form.area.trim(), availability: form.availability, note: form.note.trim(),
        contactLine: form.contactLine.trim(),
      });
      toast(data.coins ? `Escort profile saved (+${data.coins} coins).` : 'Escort profile saved.');
      setForm((f) => ({ ...f, contactLine: '' }));
      onChanged();
    } catch (e: any) { toast(e.message, 'destructive'); }
    finally { setSaving(false); }
  };

  const optOut = async () => {
    try {
      await api('/api/escort/escort/optout', 'POST');
      toast('You are no longer listed as an escort.');
      onChanged();
    } catch (e: any) { toast(e.message, 'destructive'); }
  };

  const inputCls = 'w-full bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 rounded-xl px-3 py-2 text-sm text-[#3a342a] dark:text-zinc-100 outline-none focus:border-amber-400';

  return (
    <div className="space-y-4">
      {/* Escort profile */}
      <div className="bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-3xl p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-9 h-9 rounded-full bg-emerald-600/10 flex items-center justify-center">
              <UserCheck className="text-emerald-600" size={16} />
            </span>
            <div>
              <h3 className="font-display font-bold text-sm text-[#3a342a] dark:text-zinc-100">Community Escort Profile</h3>
              <p className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-400">
                {profile ? `Active · ${profile.completedCount} completed` : 'Not registered'}
              </p>
            </div>
          </div>
          {profile && (
            <button onClick={optOut} className="font-mono text-[9px] uppercase font-bold tracking-wider py-1.5 px-3 rounded-lg bg-transparent text-[#8a8172] border border-[#ebdcca] dark:border-zinc-700 hover:bg-[#ebdcca]/40 transition-all">
              Opt out
            </button>
          )}
        </div>
        <p className="text-[11px] text-[#5c5446] dark:text-zinc-300 leading-relaxed">
          Register to appear in the public escort directory. Your area (fuzzy) is visible to everyone;
          your contact line is only revealed to a requester after they accept your offer.
        </p>
        <input value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })}
          placeholder="Your area (approx., e.g. North Beach)" className={inputCls} />
        <select value={form.availability} onChange={(e) => setForm({ ...form, availability: e.target.value as Availability })} className={inputCls}>
          <option value="anytime">Anytime</option>
          <option value="evenings">Evenings</option>
          <option value="nights">Nights</option>
          <option value="weekends">Weekends</option>
        </select>
        <textarea value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })}
          placeholder="Short intro for requesters…" rows={2} className={inputCls + ' resize-none'} />
        <input value={form.contactLine} onChange={(e) => setForm({ ...form, contactLine: e.target.value })}
          placeholder="Contact line (e.g. @username) — private until accepted" className={inputCls} />
        <button onClick={saveProfile} disabled={saving}
          className="w-full font-mono text-[10px] uppercase font-bold tracking-wider py-2.5 rounded-xl bg-[#3a342a] text-[#f4f1ea] hover:bg-[#52493b] disabled:opacity-50 transition-all flex items-center justify-center gap-1.5">
          <ShieldCheck size={12} /> {profile ? 'Update profile' : 'Register as escort'}
        </button>
      </div>

      {/* My requests */}
      <div className="bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-3xl p-5 space-y-3">
        <h3 className="font-mono text-[10px] uppercase font-bold tracking-wider text-[#5c5446] dark:text-zinc-300 flex items-center gap-1">
          <Route size={11} /> My requests
        </h3>
        <p className="text-[11px] text-[#8a8172] dark:text-zinc-400 font-mono uppercase tracking-wide">
          {status?.requestCount ?? 0} total · {status?.offerCount ?? 0} offers I made
        </p>
        <div className="flex flex-wrap gap-2 text-[10px] font-mono uppercase tracking-wide text-[#8a8172] dark:text-zinc-400">
          <span className="flex items-center gap-1"><Wallet size={11} /> {status?.balance ?? '—'} safety coins</span>
          <span className="flex items-center gap-1"><Users size={11} /> {status?.openCount ?? 0} open in your area</span>
        </div>
        {requests.length === 0 ? (
          <p className="text-[11px] text-[#8a8172] dark:text-zinc-500">You haven't posted any escort requests yet.</p>
        ) : (
          <div className="space-y-2 mt-1">
            {requests.map((request) => (
              <RequestCard
                key={request.id}
                request={request}
                me={me}
                onOpenDetail={() => onOpenRequest(request.id)}
                onChanged={onChanged}
                api={api}
                toast={toast}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Routes tab
// ---------------------------------------------------------------------------

function RoutesTab({
  token, api, toast, onChanged,
}: {
  token: string | null;
  api: (path: string, method?: string, body?: any) => Promise<any>;
  toast: (m: string, v?: string) => void; onChanged: () => void;
}) {
  const [ratings, setRatings] = useState<RouteRating[]>([]);
  const [coverage, setCoverage] = useState<CoverageRow[]>([]);
  const [area, setArea] = useState('');
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ areaLabel: '', when: '', score: 4, tags: [] as string[], comment: '' });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const q = new URLSearchParams();
      if (area.trim()) q.set('area', area.trim());
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const [rRes, cRes] = await Promise.all([
        fetch(`/api/escort/routes?${q.toString()}`, { headers }),
        fetch('/api/escort/coverage', { headers }),
      ]);
      if (rRes.ok) setRatings((await rRes.json()).ratings || []);
      if (cRes.ok) setCoverage((await cRes.json()).coverage || []);
    } catch (e) { console.error('Failed to load route ratings:', e); }
    setLoading(false);
  }, [token, area]);

  useEffect(() => { load(); }, [load]);

  const toggleTag = (t: string) => {
    setForm((f) => ({
      ...f,
      tags: f.tags.includes(t) ? f.tags.filter((x) => x !== t) : [...f.tags, t],
    }));
  };

  const submit = async () => {
    if (form.areaLabel.trim().length < 2) return toast('A route/area label is required.');
    setSaving(true);
    try {
      const data = await api('/api/escort/routes', 'POST', { ...form });
      toast(data.coins ? `Route rated (+${data.coins} coins).` : 'Route rating updated.');
      setForm({ areaLabel: '', when: '', score: 4, tags: [], comment: '' });
      load(); onChanged();
    } catch (e: any) { toast(e.message, 'destructive'); }
    finally { setSaving(false); }
  };

  const inputCls = 'w-full bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 rounded-xl px-3 py-2 text-sm text-[#3a342a] dark:text-zinc-100 outline-none focus:border-amber-400';

  return (
    <div className="space-y-4">
      {/* Coverage summary */}
      {coverage.length > 0 && (
        <div className="bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-3xl p-5 space-y-3">
          <h3 className="font-mono text-[10px] uppercase font-bold tracking-wider text-[#5c5446] dark:text-zinc-300 flex items-center gap-1">
            <Map size={11} /> Route safety coverage
          </h3>
          <div className="grid grid-cols-2 gap-2">
            {coverage.slice(0, 6).map((c) => (
              <div key={c.areaLabel} className="rounded-2xl border border-[#ebdcca]/70 dark:border-zinc-700 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#3a342a] dark:text-zinc-100 truncate">{c.areaLabel}</span>
                  <span className={`font-mono text-[8px] uppercase px-1.5 py-0.5 rounded-full ${BAND_STYLE[c.band]}`}>{c.band}</span>
                </div>
                <div className="flex items-center gap-1 mt-1.5">
                  <Star className="text-amber-500 fill-amber-500" size={12} />
                  <span className="font-mono text-xs font-bold text-[#3a342a] dark:text-zinc-100">{c.average}</span>
                  <span className="font-mono text-[9px] text-[#8a8172]">/ 5 · {c.ratingCount} ratings</span>
                </div>
                {c.topTags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {c.topTags.map((t) => (
                      <span key={t} className="font-mono text-[8px] uppercase px-1.5 py-0.5 rounded-full bg-[#ebdcca]/40 dark:bg-zinc-800 text-[#5c5446] dark:text-zinc-300">
                        {TAG_LABEL[t] || t}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add rating */}
      <div className="bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-3xl p-5 space-y-3">
        <h3 className="font-mono text-[10px] uppercase font-bold tracking-wider text-[#5c5446] dark:text-zinc-300 flex items-center gap-1">
          <Star size={11} /> Rate a route / area
        </h3>
        <p className="text-[11px] text-[#5c5446] dark:text-zinc-300 leading-relaxed">
          Fuzzy labels only — e.g. "Market Street" or "Gulshan 2 to Banani". Never include a precise address.
          Earn +5 safety coins per rating (once per area).
        </p>
        <div className="grid grid-cols-2 gap-2">
          <input value={form.areaLabel} onChange={(e) => setForm({ ...form, areaLabel: e.target.value })}
            placeholder="Route / area (approx.)" className={inputCls} />
          <input value={form.when} onChange={(e) => setForm({ ...form, when: e.target.value })}
            placeholder="When, e.g. night" className={inputCls} />
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172]">Safety</span>
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} onClick={() => setForm({ ...form, score: n })} aria-label={`${n} stars`}>
              <Star size={18} className={`transition-colors ${n <= form.score ? 'text-amber-500 fill-amber-500' : 'text-[#cfcac0] dark:text-zinc-700'}`} />
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {RATING_TAGS.map((t) => (
            <button key={t} onClick={() => toggleTag(t)}
              className={`font-mono text-[8px] uppercase px-2 py-1 rounded-full transition-all ${
                form.tags.includes(t)
                  ? 'bg-amber-800 text-white dark:bg-amber-400 dark:text-zinc-900'
                  : 'bg-[#ebdcca]/40 dark:bg-zinc-800 text-[#5c5446] dark:text-zinc-300 hover:bg-[#ebdcca]/70'
              }`}>
              {TAG_LABEL[t] || t}
            </button>
          ))}
        </div>
        <textarea value={form.comment} onChange={(e) => setForm({ ...form, comment: e.target.value })}
          placeholder="Anything worth knowing? (optional)" rows={2} className={inputCls + ' resize-none'} />
        <button onClick={submit} disabled={saving}
          className="w-full font-mono text-[10px] uppercase font-bold tracking-wider py-2.5 rounded-xl bg-[#3a342a] text-[#f4f1ea] hover:bg-[#52493b] disabled:opacity-50 transition-all">
          {saving ? 'Saving…' : 'Save rating'}
        </button>
      </div>

      {/* Ratings list */}
      <div className="relative">
        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8a8172]" />
        <input
          value={area} onChange={(e) => setArea(e.target.value)}
          placeholder="Filter ratings by area…"
          className="w-full bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 rounded-xl pl-8 pr-3 py-2 text-xs text-[#3a342a] dark:text-zinc-100 outline-none focus:border-amber-400"
        />
      </div>
      {loading ? (
        <div className="py-8 text-center font-mono text-[10px] uppercase tracking-wider text-[#8a8172]">Loading ratings…</div>
      ) : ratings.length === 0 ? (
        <div className="py-10 text-center space-y-2">
          <HeartHandshake className="mx-auto text-[#8a8172] dark:text-zinc-500" size={26} />
          <p className="font-display text-sm text-[#5c5446] dark:text-zinc-300">No route ratings yet.</p>
          <p className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-500">Rate a route to help neighbours stay safe</p>
        </div>
      ) : (
        <div className="space-y-2">
          {ratings.map((r) => (
            <div key={r.id} className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-white/70 dark:bg-zinc-900/70 p-3 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold text-[#3a342a] dark:text-zinc-100 truncate">{r.areaLabel}</span>
                <span className="flex items-center gap-0.5 shrink-0">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <Star key={n} size={11} className={n <= r.score ? 'text-amber-500 fill-amber-500' : 'text-[#cfcac0] dark:text-zinc-700'} />
                  ))}
                </span>
              </div>
              {r.comment && <p className="text-[#5c5446] dark:text-zinc-300 mt-1">{r.comment}</p>}
              <div className="flex flex-wrap items-center gap-2 mt-1.5 text-[9px] font-mono uppercase text-[#8a8172]">
                {r.when && <span className="flex items-center gap-1 normal-case"><Clock size={10} /> {r.when}</span>}
                {r.tags.slice(0, 4).map((t) => (
                  <span key={t} className="px-1.5 py-0.5 rounded-full bg-[#ebdcca]/40 dark:bg-zinc-800 normal-case">{TAG_LABEL[t] || t}</span>
                ))}
                <span className="ml-auto">{r.raterName} · {timeAgo(r.createdAt)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main view
// ---------------------------------------------------------------------------

export default function SafeEscortView({ token, currentUser, onClose }: SafeEscortViewProps) {
  const [tab, setTab] = useState<Tab>('open');
  const [requests, setRequests] = useState<EscortRequest[]>([]);
  const [status, setStatus] = useState<StatusSummary | null>(null);
  const [kinds, setKinds] = useState<{ id: string; label: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  const toast = useCallback((msg: string, variant?: string) => {
    window.dispatchEvent(new CustomEvent('show-toast', { detail: { message: msg, variant } }));
  }, []);

  const api = useCallback(async (path: string, method = 'GET', body?: any) => {
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
  }, [token]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const scope = tab === 'open' ? 'open' : tab === 'me' ? 'mine' : 'open';
      const res = await fetch(`/api/escort/requests?scope=${scope}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) setRequests((await res.json()).requests || []);
    } catch (e) {
      console.error('Failed to load escort requests:', e);
    }
    setLoading(false);
  }, [token, tab]);

  useEffect(() => { load(); }, [load]);

  const loadStatus = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch('/api/escort/status', {
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      });
      if (res.ok) setStatus(await res.json());
    } catch (e) { /* guest-safe */ }
  }, [token]);

  useEffect(() => { loadStatus(); }, [loadStatus]);

  const loadMeta = useCallback(async () => {
    try {
      const res = await fetch('/api/escort/meta', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const data = await res.json();
        if (data.kinds?.length) setKinds(data.kinds);
      }
    } catch (e) { /* ignore */ }
  }, [token]);

  useEffect(() => { loadMeta(); }, [loadMeta]);

  const refresh = () => { load(); loadStatus(); };

  const chipCls = (active: boolean) =>
    `font-mono text-[9px] uppercase font-bold tracking-wider py-1.5 px-3 rounded-full transition-all ${
      active
        ? 'bg-amber-800 text-white dark:bg-amber-400 dark:text-zinc-900'
        : 'bg-[#ebdcca]/30 text-[#5c5446] dark:bg-zinc-800 dark:text-zinc-400 hover:bg-[#ebdcca]/60'
    }`;

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[115] bg-[#f6f1e7]/95 dark:bg-zinc-950/95 backdrop-blur-sm overflow-y-auto py-6 px-4"
    >
      <div className="max-w-xl mx-auto space-y-5">
        {/* Header row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-9 h-9 rounded-full bg-rose-600/10 flex items-center justify-center">
              <ShieldCheck className="text-rose-600" size={18} />
            </span>
            <div>
              <h2 className="font-display text-lg font-bold text-[#3a342a] dark:text-zinc-100">Safe Escort &amp; Routes</h2>
              <p className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-400">
                Community escorts · route safety scores
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-white/80 dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 flex items-center justify-center text-[#5c5446] dark:text-zinc-300 hover:bg-[#ebdcca]/50 transition-all"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        {!token && (
          <div className="bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-2xl px-4 py-3 text-xs text-amber-900 dark:text-amber-200">
            Sign in to post an escort request, offer to help, or rate a route. You can still browse.
          </div>
        )}

        {/* Status strip */}
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-2xl px-3 py-2.5 text-center">
            <Wallet className="mx-auto text-amber-600" size={15} />
            <div className="font-mono text-sm font-bold text-[#3a342a] dark:text-zinc-100 mt-1">{status?.balance ?? '—'}</div>
            <div className="font-mono text-[8px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-500">safety coins</div>
          </div>
          <div className="bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-2xl px-3 py-2.5 text-center">
            <Route className="mx-auto text-rose-600" size={15} />
            <div className="font-mono text-sm font-bold text-[#3a342a] dark:text-zinc-100 mt-1">{status?.openCount ?? requests.filter((r) => r.status === 'open').length}</div>
            <div className="font-mono text-[8px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-500">open requests</div>
          </div>
          <div className="bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-2xl px-3 py-2.5 text-center">
            <Handshake className="mx-auto text-emerald-600" size={15} />
            <div className="font-mono text-sm font-bold text-[#3a342a] dark:text-zinc-100 mt-1">{status?.offerCount ?? 0}</div>
            <div className="font-mono text-[8px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-500">my offers</div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 flex-wrap">
          {([['open', 'Find help'], ['routes', 'Routes'], ['me', 'Me']] as const).map(([k, label]) => (
            <button key={k} onClick={() => setTab(k)} className={chipCls(tab === k)}>{label}</button>
          ))}
          <div className="flex-1" />
          {tab === 'open' && token && (
            <button
              onClick={() => setCreateOpen(true)}
              className="ml-auto font-mono text-[9px] uppercase font-bold tracking-wider py-1.5 px-3 rounded-full bg-rose-700 text-white dark:bg-rose-500 hover:bg-rose-800 transition-all flex items-center gap-1"
            >
              <Plus size={11} /> New request
            </button>
          )}
        </div>

        {/* Panels */}
        {tab === 'open' && (
          loading ? (
            <div className="py-14 text-center font-mono text-[10px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-400">Loading requests…</div>
          ) : requests.length === 0 ? (
            <div className="py-14 text-center space-y-2">
              <HeartHandshake className="mx-auto text-[#8a8172] dark:text-zinc-500" size={26} />
              <p className="font-display text-sm text-[#5c5446] dark:text-zinc-300">No open escort requests.</p>
              <p className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-500">Post one, or check back soon</p>
            </div>
          ) : (
            <div className="space-y-3">
              {requests.map((request) => (
                <RequestCard
                  key={request.id}
                  request={request}
                  me={currentUser}
                  onOpenDetail={() => setDetailId(request.id)}
                  onChanged={refresh}
                  api={api}
                  toast={toast}
                />
              ))}
            </div>
          )
        )}

        {tab === 'routes' && (
          <RoutesTab token={token} api={api} toast={toast} onChanged={refresh} />
        )}

        {tab === 'me' && (
          <MePanel
            status={status}
            me={currentUser}
            requests={requests}
            api={api}
            toast={toast}
            onChanged={refresh}
            onOpenRequest={(id) => setDetailId(id)}
          />
        )}
      </div>

      {/* Dialogs */}
      <AnimatePresence>
        {createOpen && (
          <CreateRequestDialog
            kinds={kinds}
            onClose={() => setCreateOpen(false)}
            onCreate={() => { setCreateOpen(false); refresh(); }}
            api={api}
            toast={toast}
          />
        )}
        {detailId && (
          <RequestDetailModal
            requestId={detailId}
            me={currentUser}
            api={api}
            toast={toast}
            onChanged={refresh}
            onClose={() => setDetailId(null)}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}
