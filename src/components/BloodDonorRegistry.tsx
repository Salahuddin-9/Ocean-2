import React, { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Droplet, X, MapPin, Users, Clock, ShieldCheck, CheckCircle2, AlertTriangle,
  Send, Search, Wallet, BadgeCheck, Plus, LifeBuoy, HeartPulse,
  Eye, EyeOff, Info,
} from 'lucide-react';

/**
 * Ocean — Blood Donor Registry (FEATURE 119 — Safety & Civic Resilience)
 * ----------------------------------------------------------------------
 * A voluntary blood-donor directory + blood-request broadcast feed that extends the
 * Emergency Pools UX (EmergencyView / turtleEmergencyPoolsBackend BLOOD_NEEDED).
 *
 *  - Requests tab: browse active blood-needed requests, offer to donate (as a
 *    registered donor), accept offers (requester), resolve, report fake requests.
 *  - Donors tab: search the donor directory by blood group / area. Contact info is
 *    NEVER shown here — it is revealed only to a requester after accepting an offer.
 *  - Me tab: register / update / opt out of the donor directory; see safety coins.
 *
 *  Privacy (rule 4): area is a fuzzy label; precise GPS is attached only via an
 *  explicit per-tap opt-in (`shareLocation`), and is only revealed to the requester
 *  and to donors who offered to help.
 *
 *  Backed by /api/blood/* (turtleBloodDonorBackend.ts).
 */

type BloodGroup = 'A+' | 'A-' | 'B+' | 'B-' | 'AB+' | 'AB-' | 'O+' | 'O-' | 'UNKNOWN';
type Availability = 'always' | 'weekends' | 'only_emergency';
type Urgency = 'low' | 'medium' | 'high' | 'critical';
type RequestStatus = 'active' | 'resolved' | 'expired' | 'suppressed';
type OfferStatus = 'offered' | 'accepted' | 'withdrawn' | 'declined';
type Tab = 'requests' | 'donors' | 'me';

interface Donor {
  id: string;
  userId: string;
  userName: string;
  bloodGroup: BloodGroup;
  area: string;
  availability: Availability;
  note: string;
  isVerified: boolean;
  lastDonatedAt?: number;
  donationCount: number;
  createdAt: number;
  updatedAt: number;
  isMe?: boolean;
}

interface Offer {
  id: string;
  requestId: string;
  donorId: string;
  donorName: string;
  donorBloodGroup: BloodGroup;
  donorArea: string;
  message: string;
  status: OfferStatus;
  createdAt: number;
}

interface BloodRequest {
  id: string;
  creatorId: string;
  creatorName: string;
  bloodGroup: BloodGroup;
  urgency: Urgency;
  area: string;
  hospital?: string;
  message: string;
  referenceCode?: string;
  status: RequestStatus;
  shareLocation: boolean;
  createdAt: number;
  expiresAt: number;
  offers: Offer[];
  isMine: boolean;
  offerCount: number;
  myOffer: Offer | null;
}

interface Status {
  me: { id: string; name: string };
  donor: Donor | null;
  requestCount: number;
  activeRequests: number;
  offerCount: number;
  balance: number;
}

interface Meta {
  bloodGroups: BloodGroup[];
  availabilities: Availability[];
  urgencies: Urgency[];
  disclaimer: string;
  coinRewards: { register: number; offer: number; accept: number };
}

interface BloodDonorRegistryProps {
  token: string | null;
  currentUser: { id: string; name: string } | null;
  onClose: () => void;
}

const BLOOD_GROUPS: BloodGroup[] = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'UNKNOWN'];

const URGENCY_RANK: Record<Urgency, number> = { critical: 0, high: 1, medium: 2, low: 3 };

const URGENCY_STYLE: Record<Urgency, string> = {
  critical: 'bg-red-600',
  high: 'bg-orange-500',
  medium: 'bg-amber-400',
  low: 'bg-emerald-500',
};

const AVAILABILITY_LABEL: Record<Availability, string> = {
  always: 'Always',
  weekends: 'Weekends',
  only_emergency: 'Emergencies only',
};

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function formatDate(ts?: number): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}

function toDateInput(ts?: number): string {
  if (!ts) return '';
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function initials(name: string): string {
  return (name || '?').split(/\s+/).map((p) => p[0]).join('').slice(0, 2).toUpperCase();
}

const getCoords = (): Promise<{ lat: number; lng: number } | null> =>
  new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => resolve(null),
      { timeout: 6000, maximumAge: 30000 }
    );
  });

const inputCls =
  'w-full bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 rounded-xl px-3 py-2 text-sm text-[#3a342a] dark:text-zinc-100 outline-none focus:border-rose-400';

const chipCls = (active: boolean) =>
  `font-mono text-[9px] uppercase font-bold tracking-wider py-1.5 px-3 rounded-full transition-all ${
    active
      ? 'bg-rose-700 text-white dark:bg-rose-500'
      : 'bg-[#ebdcca]/30 text-[#5c5446] dark:bg-zinc-800 dark:text-zinc-400 hover:bg-[#ebdcca]/60'
  }`;

export default function BloodDonorRegistry({ token, currentUser, onClose }: BloodDonorRegistryProps) {
  const [tab, setTab] = useState<Tab>('requests');
  const [meta, setMeta] = useState<Meta | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [requests, setRequests] = useState<BloodRequest[]>([]);
  const [donors, setDonors] = useState<Donor[]>([]);
  const [reqScope, setReqScope] = useState<'active' | 'mine' | 'resolved'>('active');
  const [reqBlood, setReqBlood] = useState<string>('');
  const [donorBlood, setDonorBlood] = useState<string>('');
  const [donorArea, setDonorArea] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    bloodGroup: 'O+' as string,
    urgency: 'high' as Urgency,
    area: '',
    hospital: '',
    message: '',
    referenceCode: '',
    includeLocation: false,
    acceptedDisclaimer: false,
  });
  const [createBusy, setCreateBusy] = useState(false);
  const [offerMsg, setOfferMsg] = useState('');

  const [donorForm, setDonorForm] = useState({
    bloodGroup: '' as string,
    area: '',
    availability: 'always' as Availability,
    note: '',
    lastDonatedAt: '',
    donationCount: '',
    referenceCode: '',
    contactLine: '',
  });
  const [donorBusy, setDonorBusy] = useState(false);

  const toast = (msg: string, variant?: string) => {
    window.dispatchEvent(new CustomEvent('show-toast', { detail: { message: msg, variant } }));
  };

  const api = useCallback(async (path: string, method = 'GET', body?: unknown) => {
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

  const loadMeta = useCallback(async () => {
    try {
      const data = await api('/api/blood/meta', 'GET');
      setMeta(data);
    } catch (e) { /* meta is non-critical */ }
  }, [api]);

  const loadStatus = useCallback(async () => {
    try {
      const data = await api('/api/blood/status', 'GET');
      setStatus(data);
      if (data.donor) {
        setDonorForm({
          bloodGroup: data.donor.bloodGroup,
          area: data.donor.area,
          availability: data.donor.availability,
          note: data.donor.note || '',
          lastDonatedAt: toDateInput(data.donor.lastDonatedAt),
          donationCount: data.donor.donationCount ? String(data.donor.donationCount) : '',
          referenceCode: '',
          contactLine: '',
        });
      }
    } catch (e) { /* keep last */ }
  }, [api]);

  const loadRequests = useCallback(async () => {
    try {
      const q = new URLSearchParams({ scope: reqScope });
      if (reqBlood) q.set('blood', reqBlood);
      const data = await api(`/api/blood/requests?${q.toString()}`, 'GET');
      setRequests(data.requests || []);
    } catch (e) { /* ignore */ }
  }, [api, reqScope, reqBlood]);

  const loadDonors = useCallback(async () => {
    try {
      const q = new URLSearchParams();
      if (donorBlood) q.set('blood', donorBlood);
      if (donorArea.trim()) q.set('area', donorArea.trim());
      const data = await api(`/api/blood/donors?${q.toString()}`, 'GET');
      setDonors(data.donors || []);
    } catch (e) { /* ignore */ }
  }, [api, donorBlood, donorArea]);

  useEffect(() => {
    loadMeta();
    loadStatus();
  }, [loadMeta, loadStatus]);

  useEffect(() => { if (tab === 'requests') loadRequests(); }, [tab, loadRequests]);
  useEffect(() => { if (tab === 'donors') loadDonors(); }, [tab, loadDonors]);

  const refreshAll = useCallback(() => {
    loadStatus();
    loadRequests();
  }, [loadStatus, loadRequests]);

  // --- Requests -----------------------------------------------------------------
  const createRequest = async () => {
    if (!createForm.acceptedDisclaimer) return toast('Please accept the medical disclaimer.');
    if (!createForm.bloodGroup) return toast('Choose the blood group needed.');
    if (createForm.area.trim().length < 2) return toast('Add an approximate area.');
    if (createForm.message.trim().length < 10) return toast('Describe the need (at least 10 characters).');
    setCreateBusy(true);
    try {
      let lat: number | undefined;
      let lng: number | undefined;
      if (createForm.includeLocation) {
        const c = await getCoords();
        if (c) { lat = c.lat; lng = c.lng; }
      }
      const data = await api('/api/blood/requests', 'POST', {
        bloodGroup: createForm.bloodGroup,
        urgency: createForm.urgency,
        area: createForm.area.trim(),
        hospital: createForm.hospital.trim(),
        message: createForm.message.trim(),
        referenceCode: createForm.referenceCode.trim(),
        acceptedDisclaimer: createForm.acceptedDisclaimer,
        shareLocation: createForm.includeLocation,
        lat,
        lng,
      });
      toast(createForm.includeLocation
        ? 'Blood request posted (precise location shared with responders).'
        : 'Blood request posted to the community.');
      setCreateOpen(false);
      setCreateForm({ bloodGroup: 'O+', urgency: 'high', area: '', hospital: '', message: '', referenceCode: '', includeLocation: false, acceptedDisclaimer: false });
      setReqScope('active');
      refreshAll();
    } catch (e: any) {
      toast(e.message || 'Could not post request.', 'destructive');
    } finally {
      setCreateBusy(false);
    }
  };

  const offerToDonate = async (r: BloodRequest) => {
    if (offerMsg.trim().length < 5) return toast('Add a short message (at least 5 characters).');
    try {
      await api(`/api/blood/requests/${r.id}/offer`, 'POST', { message: offerMsg.trim() });
      toast('Offer sent. The requester can accept it to see your contact line.');
      setOfferMsg('');
      loadRequests();
      loadStatus();
    } catch (e: any) {
      toast(e.message || 'Could not offer.', 'destructive');
    }
  };

  const acceptOffer = async (r: BloodRequest, offer: Offer) => {
    try {
      const data = await api(`/api/blood/requests/${r.id}/accept`, 'POST', { offerId: offer.id });
      const contact = data.donorContact || '—';
      window.dispatchEvent(
        new CustomEvent('show-toast', {
          detail: { message: `Offer accepted. Donor contact: ${contact}`, variant: 'success' },
        })
      );
      loadRequests();
      loadStatus();
    } catch (e: any) {
      toast(e.message || 'Could not accept offer.', 'destructive');
    }
  };

  const withdrawOffer = async (r: BloodRequest) => {
    try {
      await api(`/api/blood/requests/${r.id}/withdraw`, 'POST');
      toast('Offer withdrawn.');
      loadRequests();
    } catch (e: any) {
      toast(e.message || 'Could not withdraw offer.', 'destructive');
    }
  };

  const resolveRequest = async (r: BloodRequest) => {
    try {
      await api(`/api/blood/requests/${r.id}/resolve`, 'POST');
      toast('Request marked resolved — thank you.');
      refreshAll();
    } catch (e: any) {
      toast(e.message || 'Could not resolve.', 'destructive');
    }
  };

  const reportRequest = async (r: BloodRequest) => {
    try {
      await api(`/api/blood/requests/${r.id}/report`, 'POST', { reason: 'fake_request' });
      toast('Reported. Requests are removed after 3 reports.');
    } catch (e: any) {
      toast(e.message || 'Could not report.', 'destructive');
    }
  };

  // --- Donors -------------------------------------------------------------------
  const saveDonor = async () => {
    if (!donorForm.bloodGroup) return toast('Choose your blood group.');
    if (donorForm.area.trim().length < 2) return toast('Add an approximate area.');
    setDonorBusy(true);
    try {
      const lastDonated = donorForm.lastDonatedAt ? new Date(donorForm.lastDonatedAt).getTime() : undefined;
      const data = await api('/api/blood/donor', 'POST', {
        bloodGroup: donorForm.bloodGroup,
        area: donorForm.area.trim(),
        availability: donorForm.availability,
        note: donorForm.note.trim(),
        lastDonatedAt: Number.isFinite(lastDonated) ? lastDonated : undefined,
        donationCount: Number(donorForm.donationCount) || 0,
        referenceCode: donorForm.referenceCode.trim(),
        contactLine: donorForm.contactLine.trim(),
      });
      toast(data.coins > 0 ? `Registered as a donor! +${data.coins} safety coins.` : 'Donor profile updated.');
      loadStatus();
    } catch (e: any) {
      toast(e.message || 'Could not save donor profile.', 'destructive');
    } finally {
      setDonorBusy(false);
    }
  };

  const optOutDonor = async () => {
    try {
      await api('/api/blood/donor/optout', 'POST');
      toast('You are no longer listed in the donor directory.');
      loadStatus();
    } catch (e: any) {
      toast(e.message || 'Could not opt out.', 'destructive');
    }
  };

  const sortedRequests = [...requests].sort(
    (a, b) => URGENCY_RANK[a.urgency] - URGENCY_RANK[b.urgency] || b.createdAt - a.createdAt
  );

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
              <Droplet className="text-rose-600" size={18} />
            </span>
            <div>
              <h2 className="font-display text-lg font-bold text-[#3a342a] dark:text-zinc-100">Blood Donor Registry</h2>
              <p className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-400">
                Donors · blood requests
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
            Sign in to post a blood request, offer to donate, or register as a donor.
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
            <BadgeCheck className={`mx-auto ${status?.donor ? 'text-emerald-600' : 'text-[#8a8172]'}`} size={15} />
            <div className="font-mono text-sm font-bold text-[#3a342a] dark:text-zinc-100 mt-1">{status?.donor ? status.donor.bloodGroup : '—'}</div>
            <div className="font-mono text-[8px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-500">donor status</div>
          </div>
          <div className="bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-2xl px-3 py-2.5 text-center">
            <HeartPulse className={`mx-auto text-rose-600 ${(status?.activeRequests || 0) > 0 ? 'animate-pulse' : ''}`} size={15} />
            <div className="font-mono text-sm font-bold text-[#3a342a] dark:text-zinc-100 mt-1">{status?.activeRequests ?? 0}</div>
            <div className="font-mono text-[8px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-500">active requests</div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2">
          {([['requests', 'Requests'], ['donors', 'Donors'], ['me', 'Me']] as const).map(([k, label]) => (
            <button key={k} onClick={() => setTab(k)} className={chipCls(tab === k)}>
              {label}
            </button>
          ))}
          {tab === 'requests' && (
            <button
              onClick={() => setCreateOpen(true)}
              className="ml-auto font-mono text-[9px] uppercase font-bold tracking-wider py-1.5 px-3 rounded-full bg-rose-700 text-white dark:bg-rose-500 hover:bg-rose-800 transition-all flex items-center gap-1"
            >
              <Plus size={11} /> New request
            </button>
          )}
        </div>

        {/* ================= REQUESTS TAB ================= */}
        {tab === 'requests' && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {([['active', 'Active'], ['mine', 'Mine'], ['resolved', 'Resolved']] as const).map(([k, label]) => (
                <button key={k} onClick={() => setReqScope(k)} className={chipCls(reqScope === k)}>
                  {label}
                </button>
              ))}
              <select
                value={reqBlood}
                onChange={(e) => setReqBlood(e.target.value)}
                className="bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 rounded-full px-3 py-1.5 text-[10px] text-[#5c5446] dark:text-zinc-300 outline-none"
              >
                <option value="">All blood groups</option>
                {BLOOD_GROUPS.map((bg) => <option key={bg} value={bg}>{bg}</option>)}
              </select>
            </div>

            {requests.length === 0 ? (
              <div className="py-14 text-center space-y-2 bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-3xl">
                <LifeBuoy className="mx-auto text-[#8a8172] dark:text-zinc-500" size={26} />
                <p className="font-display text-sm text-[#5c5446] dark:text-zinc-300">No blood requests here.</p>
                <p className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-500">
                  Post a request or register as a donor
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {sortedRequests.map((r) => (
                  <motion.div
                    key={r.id}
                    layout
                    className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-[#fcfaf4] dark:bg-zinc-900 p-4 shadow-sm"
                  >
                    <div className="flex items-center gap-2">
                      <span className={`w-2.5 h-2.5 rounded-full ${URGENCY_STYLE[r.urgency]} ${r.urgency === 'critical' ? 'animate-pulse' : ''}`} />
                      <h3 className="font-display font-bold text-sm text-[#3a342a] dark:text-zinc-100 flex-1">
                        Blood {r.bloodGroup === 'UNKNOWN' ? 'needed' : `${r.bloodGroup} needed`}
                      </h3>
                      <span className="font-mono text-[9px] px-2 py-0.5 rounded-full bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-300 capitalize">{r.status}</span>
                    </div>
                    <p className="text-xs text-[#5c5446] dark:text-zinc-300 mt-2">{r.message}</p>
                    <div className="flex flex-wrap items-center gap-3 mt-2 text-[10px] text-[#8a8172] dark:text-zinc-400 font-mono uppercase tracking-wide">
                      <span className="flex items-center gap-1 normal-case"><MapPin size={11} /> {r.area}</span>
                      {r.hospital && <span className="normal-case">🏥 {r.hospital}</span>}
                      {r.referenceCode && <span className="flex items-center gap-1"><ShieldCheck size={11} /> ref verified</span>}
                      <span className="flex items-center gap-1"><Clock size={11} /> {timeAgo(r.createdAt)}</span>
                      <span className="flex items-center gap-1"><Users size={11} /> {r.offerCount} offer{r.offerCount === 1 ? '' : 's'}</span>
                    </div>

                    <div className="flex gap-2 mt-3 flex-wrap">
                      <button
                        onClick={() => setExpanded(expanded === r.id ? null : r.id)}
                        className="font-mono text-[9px] uppercase font-bold tracking-wider py-1.5 px-3 rounded-lg bg-[#ebdcca]/40 dark:bg-zinc-800 text-[#5c5446] dark:text-zinc-300 hover:bg-[#ebdcca]/70 transition-all"
                      >
                        {expanded === r.id ? 'Hide details' : 'Details & offers'}
                      </button>
                      {r.isMine && r.status === 'active' && (
                        <button
                          onClick={() => resolveRequest(r)}
                          className="font-mono text-[9px] uppercase font-bold tracking-wider py-1.5 px-3 rounded-lg bg-emerald-700 text-white hover:bg-emerald-800 transition-all flex items-center gap-1"
                        >
                          <CheckCircle2 size={11} /> Resolve
                        </button>
                      )}
                      {!r.isMine && r.status === 'active' && status?.donor && (!r.myOffer || r.myOffer.status === 'withdrawn' || r.myOffer.status === 'declined') && (
                        <button
                          onClick={() => { setExpanded(r.id); }}
                          className="font-mono text-[9px] uppercase font-bold tracking-wider py-1.5 px-3 rounded-lg bg-rose-700 text-white dark:bg-rose-500 hover:bg-rose-800 transition-all flex items-center gap-1"
                        >
                          <Send size={11} /> Offer
                        </button>
                      )}
                      {!r.isMine && (
                        <button
                          onClick={() => reportRequest(r)}
                          className="ml-auto font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-500 hover:text-red-600 transition-colors flex items-center gap-1"
                        >
                          <AlertTriangle size={11} /> Report
                        </button>
                      )}
                    </div>

                    {expanded === r.id && (
                      <div className="mt-3 border-t border-[#ebdcca]/60 dark:border-zinc-800 pt-3 space-y-3">
                        {r.isMine && r.shareLocation && (
                          <p className="text-[10px] text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
                            <Eye size={11} /> You opted in to share precise location with responders.
                          </p>
                        )}
                        {!r.isMine && r.shareLocation && (
                          <p className="text-[10px] text-[#5c5446] dark:text-zinc-400 flex items-center gap-1">
                            <Eye size={11} /> Requester shared precise location with responders.
                          </p>
                        )}

                        {/* Offer box */}
                        {!r.isMine && r.status === 'active' && status?.donor && (!r.myOffer || r.myOffer.status === 'withdrawn' || r.myOffer.status === 'declined') && (
                          <div className="rounded-xl border border-[#ebdcca]/70 dark:border-zinc-700 p-3 space-y-2">
                            <div className="text-[10px] font-mono uppercase font-bold tracking-wider text-[#5c5446] dark:text-zinc-300 flex items-center gap-1">
                              <LifeBuoy size={11} /> Offer to donate
                            </div>
                            <input
                              value={offerMsg}
                              onChange={(e) => setOfferMsg(e.target.value)}
                              placeholder="e.g. O+ donor, can reach by 6pm today"
                              className={inputCls}
                            />
                            <button
                              onClick={() => offerToDonate(r)}
                              className="font-mono text-[9px] uppercase font-bold tracking-wider py-1.5 px-3 rounded-lg bg-rose-700 text-white dark:bg-rose-500 hover:bg-rose-800 flex items-center gap-1"
                            >
                              <Send size={11} /> Send offer (+{meta?.coinRewards.offer ?? 15} coins)
                            </button>
                          </div>
                        )}

                        {!r.isMine && r.status === 'active' && !status?.donor && (
                          <p className="text-[10px] text-[#8a8172] dark:text-zinc-500">
                            Register as a donor on the <b>Me</b> tab before offering.
                          </p>
                        )}

                        {/* My offer status */}
                        {r.myOffer && (r.myOffer.status === 'offered' || r.myOffer.status === 'accepted') && (
                          <p className="text-[10px] text-[#5c5446] dark:text-zinc-400 flex items-center gap-1">
                            <CheckCircle2 size={11} />
                            Your offer is {r.myOffer.status}.
                            {r.myOffer.status === 'offered' && (
                              <button onClick={() => withdrawOffer(r)} className="underline text-red-600 hover:text-red-700">Withdraw</button>
                            )}
                          </p>
                        )}

                        {/* Offers list */}
                        {r.offers.length > 0 && (
                          <div className="space-y-2">
                            <div className="text-[10px] font-mono uppercase font-bold tracking-wider text-[#5c5446] dark:text-zinc-300">
                              Offers ({r.offers.length})
                            </div>
                            {r.offers.map((o) => (
                              <div key={o.id} className="rounded-xl border border-[#ebdcca]/70 dark:border-zinc-700 p-3 text-xs space-y-1">
                                <div className="flex justify-between items-center">
                                  <span className="font-bold text-[#3a342a] dark:text-zinc-100 flex items-center gap-2">
                                    <span className="w-6 h-6 rounded-full bg-rose-100 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 flex items-center justify-center text-[9px] font-bold">
                                      {initials(o.donorName)}
                                    </span>
                                    {o.donorName}
                                    <span className="font-mono text-[9px] px-1.5 py-0.5 rounded-full bg-rose-50 text-rose-600 dark:bg-rose-950/40">{o.donorBloodGroup}</span>
                                  </span>
                                  <span className="font-mono text-[9px] uppercase text-[#8a8172] capitalize">{o.status}</span>
                                </div>
                                <p className="text-[#5c5446] dark:text-zinc-300">{o.message}</p>
                                <div className="text-[10px] font-mono text-[#8a8172] flex items-center gap-1">
                                  <MapPin size={10} /> {o.donorArea}
                                </div>
                                {r.isMine && r.status === 'active' && o.status === 'offered' && (
                                  <button
                                    onClick={() => acceptOffer(r, o)}
                                    className="font-mono text-[9px] uppercase font-bold tracking-wider py-1 px-3 rounded-lg bg-emerald-700 text-white hover:bg-emerald-800 mt-1 flex items-center gap-1"
                                  >
                                    <CheckCircle2 size={11} /> Accept & reveal contact
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ================= DONORS TAB ================= */}
        {tab === 'donors' && (
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row gap-2">
              <select
                value={donorBlood}
                onChange={(e) => setDonorBlood(e.target.value)}
                className="bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 rounded-xl px-3 py-2 text-xs text-[#5c5446] dark:text-zinc-300 outline-none"
              >
                <option value="">All blood groups</option>
                {BLOOD_GROUPS.map((bg) => <option key={bg} value={bg}>{bg}</option>)}
              </select>
              <div className="relative flex-1">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8a8172]" />
                <input
                  value={donorArea}
                  onChange={(e) => setDonorArea(e.target.value)}
                  placeholder="Search area (e.g. North Beach)"
                  className={inputCls + ' pl-8'}
                />
              </div>
            </div>

            <p className="text-[10px] text-[#8a8172] dark:text-zinc-500 flex items-center gap-1">
              <EyeOff size={11} /> Contact info is hidden — it's revealed to a requester only after you accept their offer.
            </p>

            {donors.length === 0 ? (
              <div className="py-14 text-center space-y-2 bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-3xl">
                <Search className="mx-auto text-[#8a8172] dark:text-zinc-500" size={26} />
                <p className="font-display text-sm text-[#5c5446] dark:text-zinc-300">No donors match.</p>
                <p className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-500">Register on the Me tab to join</p>
              </div>
            ) : (
              <div className="space-y-3">
                {donors.map((d) => (
                  <div key={d.id} className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-[#fcfaf4] dark:bg-zinc-900 p-4 shadow-sm">
                    <div className="flex items-center gap-3">
                      <span className="w-9 h-9 rounded-full bg-rose-100 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 flex items-center justify-center text-[11px] font-bold">
                        {initials(d.userName)}
                      </span>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-[#3a342a] dark:text-zinc-100">{d.userName}</span>
                          {d.isVerified && (
                            <span className="flex items-center gap-1 font-mono text-[8px] uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                              <BadgeCheck size={11} /> verified
                            </span>
                          )}
                          {d.isMe && (
                            <span className="font-mono text-[8px] uppercase tracking-wider text-[#8a8172]">you</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 text-[10px] text-[#8a8172] font-mono uppercase tracking-wide">
                          <span className="px-1.5 py-0.5 rounded-full bg-rose-50 text-rose-600 dark:bg-rose-950/40 font-bold">{d.bloodGroup}</span>
                          <span className="flex items-center gap-1 normal-case"><MapPin size={10} /> {d.area}</span>
                          <span>{AVAILABILITY_LABEL[d.availability]}</span>
                        </div>
                      </div>
                    </div>
                    {d.note && <p className="text-xs text-[#5c5446] dark:text-zinc-300 mt-2">{d.note}</p>}
                    <div className="text-[10px] text-[#8a8172] dark:text-zinc-500 font-mono mt-1.5">
                      {d.donationCount > 0 ? `${d.donationCount} donation${d.donationCount === 1 ? '' : 's'}` : 'New donor'}
                      {d.lastDonatedAt ? ` · last donated ${formatDate(d.lastDonatedAt)}` : ''}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ================= ME TAB ================= */}
        {tab === 'me' && (
          <div className="bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-3xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display font-bold text-sm text-[#3a342a] dark:text-zinc-100 flex items-center gap-2">
                <Droplet className="text-rose-600" size={15} /> My donor profile
              </h3>
              {status?.donor && (
                <span className="font-mono text-[9px] uppercase px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400 flex items-center gap-1">
                  <ShieldCheck size={10} /> active donor
                </span>
              )}
            </div>

            <p className="text-[10px] text-[#8a8172] dark:text-zinc-500">
              Blood group is voluntary and self-reported. Verify with a clinic/hospital reference code to earn a verified badge.
            </p>

            <div className="grid grid-cols-2 gap-2">
              <select
                value={donorForm.bloodGroup}
                onChange={(e) => setDonorForm({ ...donorForm, bloodGroup: e.target.value })}
                className="bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 rounded-xl px-3 py-2 text-sm capitalize"
              >
                <option value="">Blood group</option>
                {BLOOD_GROUPS.map((bg) => <option key={bg} value={bg}>{bg}</option>)}
              </select>
              <select
                value={donorForm.availability}
                onChange={(e) => setDonorForm({ ...donorForm, availability: e.target.value as Availability })}
                className="bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 rounded-xl px-3 py-2 text-sm"
              >
                {(['always', 'weekends', 'only_emergency'] as Availability[]).map((a) => (
                  <option key={a} value={a}>{AVAILABILITY_LABEL[a]}</option>
                ))}
              </select>
            </div>
            <input
              value={donorForm.area}
              onChange={(e) => setDonorForm({ ...donorForm, area: e.target.value })}
              placeholder="Approximate area (e.g. North Beach) — never your address"
              className={inputCls}
            />
            <textarea
              value={donorForm.note}
              onChange={(e) => setDonorForm({ ...donorForm, note: e.target.value })}
              placeholder="Optional note (e.g. last donated 2 months ago)"
              rows={2}
              className={inputCls + ' resize-none'}
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                type="date"
                value={donorForm.lastDonatedAt}
                onChange={(e) => setDonorForm({ ...donorForm, lastDonatedAt: e.target.value })}
                className={inputCls}
                title="Last donation date"
              />
              <input
                type="number"
                value={donorForm.donationCount}
                onChange={(e) => setDonorForm({ ...donorForm, donationCount: e.target.value })}
                placeholder="Lifetime donations"
                className={inputCls}
              />
            </div>
            <input
              value={donorForm.referenceCode}
              onChange={(e) => setDonorForm({ ...donorForm, referenceCode: e.target.value })}
              placeholder="Clinic/hospital verification code (optional)"
              className={inputCls}
            />
            <div>
              <input
                value={donorForm.contactLine}
                onChange={(e) => setDonorForm({ ...donorForm, contactLine: e.target.value })}
                placeholder="Contact line (e.g. @username) — revealed only when accepted"
                className={inputCls}
              />
              <p className="text-[9px] text-[#8a8172] dark:text-zinc-500 mt-1 flex items-center gap-1">
                <EyeOff size={10} /> Hidden from the directory. A requester sees it only after accepting your offer.
              </p>
            </div>

            <button
              onClick={saveDonor} disabled={donorBusy}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-[#3a342a] text-[#f4f1ea] text-[10px] font-mono uppercase font-bold hover:bg-[#52493b] disabled:opacity-50"
            >
              {donorBusy ? 'Saving…' : status?.donor ? 'Update donor profile' : `Register as donor (+${meta?.coinRewards.register ?? 25} coins)`}
            </button>

            {status?.donor && (
              <button
                onClick={optOutDonor}
                className="w-full font-mono text-[10px] uppercase font-bold tracking-wider py-2 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 hover:bg-rose-100 transition-all"
              >
                Opt out of directory
              </button>
            )}

            <div className="rounded-xl border border-[#ebdcca]/70 dark:border-zinc-700 p-3 space-y-1">
              <div className="text-[10px] font-mono uppercase font-bold tracking-wider text-[#5c5446] dark:text-zinc-300 flex items-center gap-1">
                <Info size={11} /> How you earn safety coins
              </div>
              <ul className="text-[10px] text-[#8a8172] dark:text-zinc-400 space-y-0.5">
                <li>+{meta?.coinRewards.register ?? 25} · register as a donor (first time)</li>
                <li>+{meta?.coinRewards.offer ?? 15} · offer to donate on a request</li>
                <li>+{meta?.coinRewards.accept ?? 50} · your offer is accepted by a requester</li>
              </ul>
            </div>
          </div>
        )}

        {/* ================= CREATE REQUEST MODAL ================= */}
        <AnimatePresence>
          {createOpen && (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-[120] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
              onClick={() => setCreateOpen(false)}
            >
              <motion.div
                initial={{ scale: 0.94, y: 12 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.94, y: 12 }}
                className="bg-[#fcfaf4] dark:bg-zinc-900 rounded-[1.75rem] p-6 w-full max-w-md border-2 border-[#ebdcca] dark:border-zinc-800 space-y-3 shadow-2xl max-h-[90vh] overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between">
                  <h3 className="font-display font-bold text-[#3a342a] dark:text-zinc-100 flex items-center gap-2">
                    <Droplet className="text-rose-600" size={16} /> Post blood request
                  </h3>
                  <button onClick={() => setCreateOpen(false)} className="text-[#8a8172] hover:text-[#3a342a]"><X size={16} /></button>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={createForm.bloodGroup}
                    onChange={(e) => setCreateForm({ ...createForm, bloodGroup: e.target.value })}
                    className="bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 rounded-xl px-2 py-2 text-sm"
                  >
                    {BLOOD_GROUPS.map((bg) => <option key={bg} value={bg}>{bg} needed</option>)}
                  </select>
                  <select
                    value={createForm.urgency}
                    onChange={(e) => setCreateForm({ ...createForm, urgency: e.target.value as Urgency })}
                    className="bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 rounded-xl px-2 py-2 text-sm capitalize"
                  >
                    {(['low', 'medium', 'high', 'critical'] as Urgency[]).map((u) => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
                <input
                  value={createForm.area}
                  onChange={(e) => setCreateForm({ ...createForm, area: e.target.value })}
                  placeholder="Approximate area (e.g. North Beach) — fuzzy, not your address"
                  className={inputCls}
                />
                <input
                  value={createForm.hospital}
                  onChange={(e) => setCreateForm({ ...createForm, hospital: e.target.value })}
                  placeholder="Hospital / clinic (optional)"
                  className={inputCls}
                />
                <textarea
                  value={createForm.message}
                  onChange={(e) => setCreateForm({ ...createForm, message: e.target.value })}
                  placeholder="What's needed? How can a donor help?"
                  rows={3}
                  className={inputCls + ' resize-none'}
                />
                <input
                  value={createForm.referenceCode}
                  onChange={(e) => setCreateForm({ ...createForm, referenceCode: e.target.value })}
                  placeholder="Verification reference code (optional)"
                  className={inputCls}
                />

                <label className="flex items-start gap-2 text-[10px] text-[#5c5446] dark:text-zinc-400 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={createForm.includeLocation}
                    onChange={(e) => setCreateForm({ ...createForm, includeLocation: e.target.checked })}
                    className="mt-0.5"
                  />
                  <span className="flex items-center gap-1">
                    {createForm.includeLocation ? <Eye size={12} /> : <EyeOff size={12} />}
                    Share my precise location with responders (opt-in, this tap only)
                  </span>
                </label>

                <label className="flex items-start gap-2 text-[10px] text-[#5c5446] dark:text-zinc-400 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={createForm.acceptedDisclaimer}
                    onChange={(e) => setCreateForm({ ...createForm, acceptedDisclaimer: e.target.checked })}
                    className="mt-0.5"
                  />
                  <span>
                    I accept the <b>medical disclaimer</b>. This is volunteer matchmaking, not medical advice.
                  </span>
                </label>

                {createForm.acceptedDisclaimer && meta?.disclaimer && (
                  <pre className="text-[9px] leading-relaxed text-[#8a8172] dark:text-zinc-500 bg-white/60 dark:bg-zinc-800/60 border border-[#ebdcca] dark:border-zinc-700 rounded-xl p-3 whitespace-pre-wrap max-h-28 overflow-y-auto font-sans">
                    {meta.disclaimer}
                  </pre>
                )}

                <button
                  onClick={createRequest} disabled={createBusy}
                  className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-rose-600 text-white text-[10px] font-mono uppercase font-bold hover:bg-rose-500 disabled:opacity-50"
                >
                  {createBusy ? 'Posting…' : 'Post request'}
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
