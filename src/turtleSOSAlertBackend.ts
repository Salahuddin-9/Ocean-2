/**
 * Ocean — SOS / Panic Alert + Emergency Contacts backend
 * -------------------------------------------------------
 * A backend-wired SOS panic system that extends the emergency UX (EmergencyView /
 * turtleEmergencyPoolsBackend). The floating SOSEmergencyButton is 100% client-side;
 * this module gives SOS a real backend + persistence.
 *
 *  - Emergency contacts: stored ONLY after the user explicitly adds them (opt-in).
 *    A contact is a name + optional phone/relationship + optional linked app user id.
 *  - SOS alert: an explicit, one-tap panic broadcast. The SOS EVENT (fuzzy `area`
 *    label + message) is always broadcast; precise GPS lat/lng is attached ONLY when
 *    the user opts in on that tap (`shareLocation: true`), rounded to 6dp, and is
 *    only revealed to the alert creator and to acknowledged responders. Contact-only
 *    alerts reach only the creator's listed contacts (targetContactIds); otherwise
 *    the alert is public to the community feed. Rate-limited to 2 alerts / 15 min
 *    (shared emergency engine isUserRateLimited).
 *  - Responders acknowledge ("I'm coming / I saw this"), optionally revealing a
 *    contact line shown ONLY to the alert creator. Acknowledging earns the responder
 *    safety coins (community.json wallet via addBalance).
 *
 *  Privacy (rule 4): a user's full home address is never broadcast by default — the
 *  fuzzy `area` label is always broadcast; precise location only on explicit per-tap
 *  opt-in, and even then only to the creator + acknowledged responders.
 *
 *  Persistence: global db via ctx.loadDatabase()/saveDatabase() under
 *  `db.sosContacts` + `db.sosAlerts` (idempotent ensure, defensive reads via ?? []).
 *  Never stores base64.
 */

import express from 'express';
import { getCtx } from './turtleServerContext';
import { addBalance } from './turtleCommunityBackend';
import { isUserRateLimited, SAFETY_DISCLAIMERS } from './turtleEmergencyPools';
import { pushNotification } from './turtleCoinTransfer';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SOSUrgency = 'low' | 'medium' | 'high' | 'critical';
export type SOSStatus = 'active' | 'acknowledged' | 'resolved' | 'expired';

export interface SOSContact {
  id: string;
  name: string;
  phone?: string;
  relationship?: string;
  /** Optional: link this contact to another Ocean user so contact-only alerts reach them. */
  linkedUserId?: string;
  createdAt: number;
}

export interface SOSAcknowledgement {
  id: string;
  byUserId: string;
  byName: string;
  note: string;
  /** Responder's opt-in contact line — revealed ONLY to the alert creator. */
  contactLine?: string;
  at: number;
}

export interface SOSAlert {
  id: string;
  creatorId: string;
  creatorName: string;
  urgency: SOSUrgency;
  /** Fuzzy area label — always broadcast. */
  area: string;
  message: string;
  /** Precise location — only when the creator opted in on this tap. */
  shareLocation: boolean;
  lat?: number;
  lng?: number;
  /** true = only the creator's listed contacts see it. */
  contactOnly: boolean;
  targetContactIds: string[];
  status: SOSStatus;
  createdAt: number;
  expiresAt: number;
  resolvedAt?: number;
  acknowledgements: SOSAcknowledgement[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const URGENCIES: SOSUrgency[] = ['low', 'medium', 'high', 'critical'];
const MAX_CONTACTS = 8;
const MAX_ALERTS_KEPT = 200;
const COINS_ACK = 10; // responder acknowledgment reward (safety coins)

/** Alert lifetime by urgency — critical panic expires fastest. */
const SOS_EXPIRY_MS: Record<SOSUrgency, number> = {
  critical: 30 * 60 * 1000,
  high: 2 * 60 * 60 * 1000,
  medium: 6 * 60 * 60 * 1000,
  low: 12 * 60 * 60 * 1000,
};

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function now(): number {
  return Date.now();
}

function uid(prefix: string): string {
  return `${prefix}-${now()}-${Math.floor(Math.random() * 10000)}`;
}

function str(v: unknown, max = 500): string {
  return String(v ?? '').trim().slice(0, max);
}

function sanitizeUrgency(v: unknown): SOSUrgency {
  const s = String(v ?? '').trim().toLowerCase();
  return URGENCIES.includes(s as SOSUrgency) ? (s as SOSUrgency) : 'high';
}

function userLabel(u: any): string {
  return String(u?.name || u?.username || 'User');
}

/** Idempotent ensure of db.sosContacts + db.sosAlerts — safe to run on every load. */
function ensureSOSDb(db: any): void {
  if (!Array.isArray(db.sosContacts)) db.sosContacts = [];
  if (!Array.isArray(db.sosAlerts)) db.sosAlerts = [];
}

/** The current user's emergency-contact record (created lazily on first add). */
function ensureContactRecord(db: any, userId: string): { userId: string; contacts: SOSContact[] } {
  let record = db.sosContacts.find((r: any) => r && r.userId === userId);
  if (!record) {
    record = { userId, contacts: [] };
    db.sosContacts.push(record);
  }
  if (!Array.isArray(record.contacts)) record.contacts = [];
  return record;
}

function myContacts(db: any, userId: string): SOSContact[] {
  const record = db.sosContacts.find((r: any) => r && r.userId === userId);
  return record && Array.isArray(record.contacts) ? record.contacts : [];
}

/** Deterministic lazy sweep (no cron): overdue open alerts become 'expired'. */
function sweepExpired(alerts: SOSAlert[]): boolean {
  const t = now();
  let changed = false;
  for (const a of alerts) {
    if (a && (a.status === 'active' || a.status === 'acknowledged') && a.expiresAt && a.expiresAt < t) {
      a.status = 'expired';
      changed = true;
    }
  }
  return changed;
}

/** Award safety coins into the community.json wallet. */
function awardCoins(
  loadCommunity: () => any,
  saveCommunity: (s: any) => void,
  userId: string,
  amount: number
): number {
  try {
    const state = loadCommunity();
    addBalance(state, userId, amount);
    saveCommunity(state);
    return state.balances[userId] || 0;
  } catch (e: any) {
    console.warn('[sos] coin award error:', e?.message || e);
    return 0;
  }
}

/**
 * Alert as seen by `viewerId`. Precise GPS is stripped unless the viewer is the
 * creator or an acknowledged responder; responder contact lines are revealed only
 * to the creator.
 */
function publicAlert(a: SOSAlert, viewerId: string): any {
  const isCreator = a.creatorId === viewerId;
  const allowPrecise = isCreator || (a.acknowledgements || []).some((x) => x && x.byUserId === viewerId);
  const acks = (a.acknowledgements || []).map((x) => ({
    id: x.id,
    byUserId: x.byUserId,
    byName: x.byName,
    note: x.note,
    at: x.at,
    ...(isCreator ? { contactLine: x.contactLine } : {}),
  }));
  const out: any = { ...a, acknowledgements: acks };
  if (!allowPrecise) {
    out.lat = undefined;
    out.lng = undefined;
    out.shareLocation = false;
  }
  out.isMine = isCreator;
  out.ackCount = acks.length;
  out.myAck = (a.acknowledgements || []).find((x) => x && x.byUserId === viewerId) || null;
  return out;
}

const URGENCY_RANK: Record<SOSUrgency, number> = { critical: 0, high: 1, medium: 2, low: 3 };

/** Great-circle distance in km. */
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export function registerSOSAlertRoutes(app: express.Express): void {
  const ctx = getCtx();
  const { requireAuth, loadDatabase, saveDatabase, loadCommunity, saveCommunity, getRequestUser } = ctx;

  // GET /api/sos/meta — disclaimer + form options (guest-safe).
  app.get('/api/sos/meta', (req, res) => {
    const viewer = getRequestUser(req);
    res.json({
      disclaimer: SAFETY_DISCLAIMERS.GENERAL,
      relationships: ['family', 'partner', 'friend', 'neighbor', 'colleague', 'other'],
      urgencyOptions: URGENCIES,
      coinRewards: { acknowledge: COINS_ACK },
      maxContacts: MAX_CONTACTS,
      cooldownSec: 15 * 60, // 2 alerts / 15 min
      viewerId: viewer?.id ?? null,
    });
  });

  // GET /api/sos/contacts — my emergency contacts (requireAuth).
  app.get('/api/sos/contacts', requireAuth, (req, res) => {
    const me = (req as any).user;
    const db = loadDatabase();
    ensureSOSDb(db);
    res.json({ contacts: myContacts(db, me.id) });
  });

  // POST /api/sos/contacts — add an emergency contact (stored ONLY when the user sets it).
  app.post('/api/sos/contacts', requireAuth, (req, res) => {
    const me = (req as any).user;
    const body = req.body || {};
    const name = str(body.name, 60);
    if (name.length < 2) return res.status(400).json({ error: 'Contact name is required.' });
    const db = loadDatabase();
    ensureSOSDb(db);
    const record = ensureContactRecord(db, me.id);
    if (record.contacts.length >= MAX_CONTACTS) {
      return res.status(400).json({ error: `You can have up to ${MAX_CONTACTS} emergency contacts.` });
    }
    const contact: SOSContact = {
      id: uid('sosc'),
      name,
      phone: str(body.phone, 30) || undefined,
      relationship: str(body.relationship, 40) || undefined,
      linkedUserId:
        typeof body.linkedUserId === 'string' && body.linkedUserId.trim()
          ? body.linkedUserId.trim().slice(0, 60)
          : undefined,
      createdAt: now(),
    };
    record.contacts.push(contact);
    saveDatabase(db);
    res.json({ contact, contacts: record.contacts });
  });

  // POST /api/sos/contacts/:contactId/remove — remove an emergency contact.
  app.post('/api/sos/contacts/:contactId/remove', requireAuth, (req, res) => {
    const me = (req as any).user;
    const db = loadDatabase();
    ensureSOSDb(db);
    const record = ensureContactRecord(db, me.id);
    const idx = record.contacts.findIndex((c) => c && c.id === req.params.contactId);
    if (idx < 0) return res.status(404).json({ error: 'Contact not found.' });
    record.contacts.splice(idx, 1);
    saveDatabase(db);
    res.json({ contacts: record.contacts });
  });

  // POST /api/sos/alert — trigger an SOS panic broadcast (explicit tap; location opt-in per tap).
  /** Shared alert dispatch — mounted at /api/sos/alert and the /api/sos/trigger alias. */
  const handleSOSAlert = (req: express.Request, res: express.Response) => {
    const me = (req as any).user;
    const body = req.body || {};
    const message = str(body.message, 600);
    const area = str(body.area, 120);
    if (message.length < 5) {
      return res.status(400).json({ error: 'Describe the emergency (at least 5 characters).' });
    }
    const urgency = sanitizeUrgency(body.urgency);
    const db = loadDatabase();
    ensureSOSDb(db);

    // Shared emergency rate limit: 2 alerts / 15 min.
    const rl = isUserRateLimited(
      {
        userId: me.id,
        alertTimestamps: (db.sosAlerts || [])
          .filter((a: SOSAlert) => a && a.creatorId === me.id)
          .map((a: SOSAlert) => a.createdAt),
      },
      now()
    );
    if (rl.limited) {
      return res.status(429).json({ error: `You've sent SOS alerts recently. Please wait ${rl.remainingSec}s.` });
    }

    // Precise location is opt-in per press, validated + rounded to ~1m.
    let shareLocation = false;
    let lat: number | undefined;
    let lng: number | undefined;
    if (body.shareLocation === true) {
      const nLat = Number(body.lat);
      const nLng = Number(body.lng);
      if (Number.isFinite(nLat) && Number.isFinite(nLng) && nLat >= -90 && nLat <= 90 && nLng >= -180 && nLng <= 180) {
        shareLocation = true;
        lat = Math.round(nLat * 1e6) / 1e6;
        lng = Math.round(nLng * 1e6) / 1e6;
      }
    }

    const contacts = myContacts(db, me.id);
    const alert: SOSAlert = {
      id: uid('sos'),
      creatorId: me.id,
      creatorName: userLabel(me),
      urgency,
      area: area || 'Area not specified',
      message,
      shareLocation,
      lat,
      lng,
      contactOnly: body.contactOnly === true,
      targetContactIds: contacts
        .map((c) => c.linkedUserId)
        .filter((x): x is string => !!x),
      status: 'active',
      createdAt: now(),
      expiresAt: now() + (SOS_EXPIRY_MS[urgency] || SOS_EXPIRY_MS.high),
      acknowledgements: [],
    };
    db.sosAlerts.unshift(alert);
    if (db.sosAlerts.length > MAX_ALERTS_KEPT) db.sosAlerts = db.sosAlerts.slice(0, MAX_ALERTS_KEPT);

    // Real notification delivery: contact-only alerts hit the notification bell
    // of every linked contact (persisted with the user in database.json).
    if (alert.targetContactIds.length > 0) {
      db.users.forEach((u: any) => {
        if (alert.targetContactIds.includes(u.id)) {
          u.notifications = u.notifications || [];
          u.notifications.unshift({
            id: `notif-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            type: 'sos_alert',
            message: `🚨 ${alert.creatorName} sent an SOS alert: ${alert.message.slice(0, 80)}`,
            actorIds: [alert.creatorId],
            actorNames: [alert.creatorName],
            timestamp: alert.createdAt,
            isRead: false,
            sosAlertId: alert.id,
            urgency: alert.urgency,
          });
        }
      });
    }

    saveDatabase(db);
    res.json({ alert: publicAlert(alert, me.id), contactCount: contacts.length });
  };
  app.post('/api/sos/alert', requireAuth, handleSOSAlert);
  // Alias requested by the floating SOS button (feature #69).
  app.post('/api/sos/trigger', requireAuth, handleSOSAlert);

  // POST /api/sos/sisterhood — Sisterhood Emergency (feature #125): alert nearby
  // female users of the caller's circle of trust. The initiator's fuzzy area
  // label is always broadcast; precise GPS is used ONLY to find nearby users and
  // is never stored on the alert. Recipients are matched from users who shared
  // their approximate location (profile.location) and identify as female; if no
  // users have gender set, all nearby users are alerted so the feature never
  // silently no-ops. Every notified user gets a bell notification.
  app.post('/api/sos/sisterhood', requireAuth, (req, res) => {
    const me = (req as any).user;
    const body = req.body || {};
    const message = str(body.message, 600);
    if (message.length < 5) {
      return res.status(400).json({ error: 'Describe the emergency (at least 5 characters).' });
    }
    const area = str(body.area, 120) || 'Area not specified';
    const db = loadDatabase();
    ensureSOSDb(db);
    if (!Array.isArray(db.sisterhoodAlerts)) db.sisterhoodAlerts = [];

    // Rate limit mirrors the main SOS alert: 2 / 15 min.
    const rl = isUserRateLimited(
      {
        userId: me.id,
        alertTimestamps: (db.sisterhoodAlerts || [])
          .filter((a: any) => a && a.creatorId === me.id)
          .map((a: any) => a.createdAt),
      },
      now()
    );
    if (rl.limited) {
      return res.status(429).json({ error: `You've sent sisterhood alerts recently. Please wait ${rl.remainingSec}s.` });
    }

    // Precise GPS is opt-in per press (mirrors /api/sos/alert) and is used only
    // for proximity matching — never stored on the alert.
    let lat: number | undefined;
    let lng: number | undefined;
    if (body.shareLocation === true) {
      const nLat = Number(body.lat);
      const nLng = Number(body.lng);
      if (Number.isFinite(nLat) && Number.isFinite(nLng) && nLat >= -90 && nLat <= 90 && nLng >= -180 && nLng <= 180) {
        lat = nLat;
        lng = nLng;
      }
    }
    if (!Number.isFinite(lat as number) || !Number.isFinite(lng as number)) {
      const target = db.users.find((u: any) => u && u.id === me.id);
      const loc = target?.profile?.location;
      if (loc && Number.isFinite(loc.lat) && Number.isFinite(loc.lng)) {
        lat = loc.lat;
        lng = loc.lng;
      }
    }

    const t = now();
    const alert = {
      id: uid('sist'),
      creatorId: me.id,
      creatorName: userLabel(me),
      area,
      message,
      status: 'active' as SOSStatus,
      createdAt: t,
      expiresAt: t + 2 * 60 * 60 * 1000,
      notifiedUserIds: [] as string[],
    };
    db.sisterhoodAlerts.unshift(alert);
    if (db.sisterhoodAlerts.length > 100) db.sisterhoodAlerts = db.sisterhoodAlerts.slice(0, 100);

    // Notify nearby female users (or all nearby users when no gender is set).
    const radiusKm = Math.max(1, Math.min(Number(body.radiusKm) || 10, 100));
    const hasAnyGender = (db.users || []).some((u: any) => u && u.profile?.gender);
    let notifiedCount = 0;
    for (const u of db.users || []) {
      if (!u || u.id === me.id) continue;
      if (hasAnyGender && String(u.profile?.gender || '').toLowerCase() !== 'female') continue;
      const loc = u.profile?.location;
      if (!loc || !Number.isFinite(loc.lat) || !Number.isFinite(loc.lng)) continue;
      if (Number.isFinite(lat as number) && Number.isFinite(lng as number)) {
        const d = haversineKm(lat as number, lng as number, loc.lat, loc.lng);
        if (d > radiusKm) continue;
      }
      pushNotification(db, u.id, 'sisterhood', `🚺 ${alert.creatorName} sent a sisterhood emergency alert: ${alert.message.slice(0, 80)} (${area})`, {
        id: alert.creatorId,
        name: alert.creatorName,
      });
      alert.notifiedUserIds.push(u.id);
      notifiedCount++;
    }

    saveDatabase(db);
    res.json({
      alert: { ...alert, notifiedUserIds: undefined },
      notifiedCount,
      radiusKm,
      note: hasAnyGender
        ? 'Alert sent to nearby female users.'
        : 'No users have set a gender — alert sent to all nearby users.',
    });
  });

  // GET /api/sos/alerts — SOS feed (scope=active|mine|resolved).
  app.get('/api/sos/alerts', requireAuth, (req, res) => {
    const me = (req as any).user;
    const db = loadDatabase();
    ensureSOSDb(db);
    const changed = sweepExpired(db.sosAlerts);
    const scope = String(req.query.scope || 'active');
    let list = (db.sosAlerts || []) as SOSAlert[];
    if (scope === 'mine') {
      list = list.filter((a) => a && a.creatorId === me.id);
    } else if (scope === 'resolved') {
      list = list.filter((a) => a && (a.status === 'resolved' || a.status === 'expired'));
    } else {
      list = list.filter((a) => a && (a.status === 'active' || a.status === 'acknowledged'));
      // Contact-only alerts reach only the creator and the listed contacts.
      list = list.filter((a) => !a.contactOnly || a.creatorId === me.id || a.targetContactIds.includes(me.id));
    }
    list = [...list].sort((a, b) => URGENCY_RANK[a.urgency] - URGENCY_RANK[b.urgency] || b.createdAt - a.createdAt);
    if (changed) saveDatabase(db);
    res.json({ alerts: list.map((a) => publicAlert(a, me.id)), count: list.length });
  });

  // GET /api/sos/alerts/:id — detail; creator sees responder contact lines.
  app.get('/api/sos/alerts/:id', requireAuth, (req, res) => {
    const me = (req as any).user;
    const db = loadDatabase();
    ensureSOSDb(db);
    const changed = sweepExpired(db.sosAlerts);
    const a = (db.sosAlerts || []).find((x: SOSAlert) => x && x.id === req.params.id);
    if (!a) return res.status(404).json({ error: 'Alert not found.' });
    if (changed) saveDatabase(db);
    const responderContacts =
      a.creatorId === me.id
        ? (a.acknowledgements || []).map((x) => ({ byName: x.byName, contactLine: x.contactLine }))
        : [];
    res.json({ alert: publicAlert(a, me.id), responderContacts });
  });

  // POST /api/sos/alerts/:id/acknowledge — respond "I'm coming / I saw this".
  app.post('/api/sos/alerts/:id/acknowledge', requireAuth, (req, res) => {
    const me = (req as any).user;
    const body = req.body || {};
    const db = loadDatabase();
    ensureSOSDb(db);
    const a = (db.sosAlerts || []).find((x: SOSAlert) => x && x.id === req.params.id);
    if (!a) return res.status(404).json({ error: 'Alert not found.' });
    if (a.creatorId === me.id) return res.status(400).json({ error: 'You cannot acknowledge your own alert.' });
    if (a.status !== 'active' && a.status !== 'acknowledged') {
      return res.status(400).json({ error: 'This alert is already closed.' });
    }
    if ((a.acknowledgements || []).some((x) => x && x.byUserId === me.id)) {
      return res.status(400).json({ error: 'You already acknowledged this alert.' });
    }
    const ack: SOSAcknowledgement = {
      id: uid('sosack'),
      byUserId: me.id,
      byName: userLabel(me),
      note: str(body.note, 200),
      contactLine: str(body.contactLine, 200) || undefined,
      at: now(),
    };
    a.acknowledgements = a.acknowledgements || [];
    a.acknowledgements.push(ack);
    if (a.status === 'active') a.status = 'acknowledged';
    awardCoins(loadCommunity, saveCommunity, me.id, COINS_ACK);

    // Notify the alert creator that a responder acknowledged their SOS.
    const creatorUser = db.users.find((x: any) => x && x.id === a.creatorId);
    if (creatorUser) {
      creatorUser.notifications = creatorUser.notifications || [];
      creatorUser.notifications.unshift({
        id: `notif-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        type: 'sos_ack',
        message: `🆘 ${me.name} acknowledged your SOS alert: ${a.message.slice(0, 80)}`,
        actorIds: [me.id],
        actorNames: [me.name],
        timestamp: now(),
        isRead: false,
        sosAlertId: a.id,
      });
    }

    saveDatabase(db);
    res.json({ alert: publicAlert(a, me.id), ack, coins: COINS_ACK });
  });

  // POST /api/sos/alerts/:id/resolve — creator marks the situation resolved.
  app.post('/api/sos/alerts/:id/resolve', requireAuth, (req, res) => {
    const me = (req as any).user;
    const db = loadDatabase();
    ensureSOSDb(db);
    const a = (db.sosAlerts || []).find((x: SOSAlert) => x && x.id === req.params.id);
    if (!a) return res.status(404).json({ error: 'Alert not found.' });
    if (a.creatorId !== me.id) return res.status(403).json({ error: 'Only the alert creator can resolve it.' });
    if (a.status !== 'active' && a.status !== 'acknowledged') {
      return res.status(400).json({ error: 'This alert is already closed.' });
    }
    a.status = 'resolved';
    a.resolvedAt = now();
    saveDatabase(db);
    res.json({ success: true, alert: publicAlert(a, me.id) });
  });
}
