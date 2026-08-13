/**
 * Ocean — Nearby Blood Donor Match (Feature 3)
 * ----------------------------------------------
 * Enhances blood-donation Need Posts: the author can press "Notify Nearby Donors"
 * and the server finds users within ~5 km who (a) have the requested blood group
 * on their donor profile, (b) are opted in, and (c) haven't donated in the last
 * 90 days — then pushes an in-app notification to each of them.
 *
 * Donor profile lives on the user record (user.bloodDonorProfile) and is also
 * cross-referenced with the existing registry entries in db.bloodDonors so donors
 * registered through the Blood Donor tab are notified too.
 *
 * Routes:
 *   GET  /api/needs/donor-profile     (auth) my donor profile
 *   POST /api/needs/donor-profile     (auth) { bloodGroup, lat, lng, lastDonationDate, optIn }
 *   POST /api/needs/:postId/notify    (auth, post author) notify nearby matching donors
 */
import express from 'express';
import { getCtx } from './turtleServerContext';
import { haversineKm, pushNotification } from './turtleCoinTransfer';

export interface BloodDonorProfile {
  bloodGroup: string;
  lat: number | null;
  lng: number | null;
  lastDonationDate: string | null; // ISO date
  optIn: boolean;
  updatedAt: number;
}

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const MAX_RADIUS_KM = 5;
const COOLDOWN_MS = 90 * 24 * 60 * 60 * 1000;

function uid(): string {
  return `donor-${Date.now()}-${Math.floor(Math.random() * 99999)}`;
}

function s(v: unknown, max: number): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

function donorProfileOf(u: any): BloodDonorProfile | null {
  const p = u?.bloodDonorProfile;
  if (p && p.bloodGroup) return p;
  // Fallback: legacy registry entry.
  return null;
}

export function registerNearbyDonorNotifyRoutes(app: express.Express): void {
  const { requireAuth, loadDatabase, saveDatabase } = getCtx();

  // GET /api/needs/donor-profile — my donor profile (auth)
  app.get('/api/needs/donor-profile', requireAuth, (req, res) => {
    const user = (req as any).user;
    const db = loadDatabase();
    const profile = (user as any).bloodDonorProfile || null;
    const legacy = (db.bloodDonors || []).find((d: any) => d && d.userId === user.id);
    res.json({
      profile,
      legacy: legacy || null,
      bloodGroups: BLOOD_GROUPS,
      maxRadiusKm: MAX_RADIUS_KM,
    });
  });

  // POST /api/needs/donor-profile — save my donor profile (auth)
  app.post('/api/needs/donor-profile', requireAuth, (req, res) => {
    const user = (req as any).user;
    const body = req.body || {};
    const bloodGroup = String(body.bloodGroup || '').toUpperCase();
    if (!BLOOD_GROUPS.includes(bloodGroup)) {
      return res.status(400).json({ error: 'Select a valid blood group (A+ … O-).' });
    }
    const lat = Number.isFinite(Number(body.lat)) ? Number(body.lat) : null;
    const lng = Number.isFinite(Number(body.lng)) ? Number(body.lng) : null;
    const lastDonationDate = String(body.lastDonationDate || '').slice(0, 10) || null;
    const profile: BloodDonorProfile = {
      bloodGroup,
      lat,
      lng,
      lastDonationDate,
      optIn: body.optIn !== false,
      updatedAt: Date.now(),
    };
    (user as any).bloodDonorProfile = profile;
    const db = loadDatabase();
    saveDatabase(db);
    res.json({ profile });
  });

  // POST /api/needs/:postId/notify — notify nearby matching donors (auth, post author)
  app.post('/api/needs/:postId/notify', requireAuth, (req, res) => {
    const user = (req as any).user;
    const db = loadDatabase();
    const postId = String(req.params.postId || '');
    // Need posts can live in db.posts or inside a user's profile.posts — search both.
    const findPost = (id: string) => {
      const direct = (db.posts || []).find((p: any) => p && p.id === id);
      if (direct) return direct;
      for (const u of db.users || []) {
        const p = (u?.profile?.posts || []).find((x: any) => x && x.id === id);
        if (p) return p;
      }
      return null;
    };
    const post = findPost(postId);
    const authorId = post ? String(post.creator?.id || post.authorId || post.creatorId || '') : '';
    if (!post) return res.status(404).json({ error: 'Need post not found.' });
    // Fail closed: the notify action is restricted to the post author.
    if (!authorId || authorId !== user.id) {
      return res.status(403).json({ error: 'Only the post author can notify nearby donors.' });
    }

    const body = req.body || {};
    const requestedGroup = String(body.bloodGroup || post.bloodGroup || '').toUpperCase();
    if (!requestedGroup) return res.status(400).json({ error: 'Blood group is required.' });

    // Author location: body coords > post location > author profile location.
    let lat = Number.isFinite(Number(body.lat)) ? Number(body.lat) : null;
    let lng = Number.isFinite(Number(body.lng)) ? Number(body.lng) : null;
    if (lat == null && post.location) {
      lat = Number.isFinite(Number(post.location.lat)) ? Number(post.location.lat) : null;
      lng = Number.isFinite(Number(post.location.lng)) ? Number(post.location.lng) : null;
    }
    if (lat == null && user.bloodDonorProfile) {
      lat = user.bloodDonorProfile.lat;
      lng = user.bloodDonorProfile.lng;
    }
    if (lat == null || lng == null) {
      return res.status(400).json({
        error: 'No location available. Share a location on your donor profile or pass lat/lng.',
      });
    }

    const now = Date.now();
    const notified: Array<{ userId: string; name: string; bloodGroup: string; distanceKm: number }> = [];
    const seen = new Set<string>();

    const consider = (candidate: any, profile: BloodDonorProfile) => {
      const cid = String(candidate.id);
      if (seen.has(cid)) return;
      if (cid === user.id) return;
      if (!profile.optIn) return;
      if (profile.bloodGroup !== requestedGroup) return;
      if (profile.lat == null || profile.lng == null) return;
      const d = haversineKm(lat as number, lng as number, profile.lat, profile.lng);
      if (d > MAX_RADIUS_KM) return;
      if (profile.lastDonationDate) {
        const last = Date.parse(profile.lastDonationDate);
        if (Number.isFinite(last) && now - last < COOLDOWN_MS) return; // donated within 90 days
      }
      seen.add(cid);
      notified.push({
        userId: cid,
        name: candidate.name || candidate.username || 'User',
        bloodGroup: profile.bloodGroup,
        distanceKm: Math.round(d * 10) / 10,
      });
    };

    // 1. Users with a donor profile (user.bloodDonorProfile).
    for (const u of db.users || []) {
      const p = donorProfileOf(u);
      if (p) consider(u, p);
    }
    // 2. Legacy registry entries (db.bloodDonors) not already considered.
    for (const d of db.bloodDonors || []) {
      if (!d || !d.userId) continue;
      const u = (db.users || []).find((x: any) => x && x.id === d.userId);
      const profile: BloodDonorProfile = {
        bloodGroup: String(d.bloodGroup || '').toUpperCase(),
        lat: Number.isFinite(Number(d.lat)) ? Number(d.lat) : null,
        lng: Number.isFinite(Number(d.lng)) ? Number(d.lng) : null,
        lastDonationDate: d.lastDonationDate || null,
        optIn: d.optIn !== false,
        updatedAt: 0,
      };
      if (profile.bloodGroup) consider(u || { id: d.userId }, profile);
    }

    // Push in-app notifications.
    let pushed = 0;
    for (const donor of notified) {
      pushNotification(
        db,
        donor.userId,
        'blood_donor_needed',
        `Urgent: ${requestedGroup} blood needed ${donor.distanceKm} km from you. Please check the blood request.`,
        { id: user.id, name: user.name || user.username || 'User' }
      );
      pushed += 1;
    }
    saveDatabase(db);
    res.json({
      success: true,
      notified: pushed,
      donors: notified.sort((a, b) => a.distanceKm - b.distanceKm),
      message: pushed
        ? `Notified ${pushed} nearby ${requestedGroup} donor${pushed === 1 ? '' : 's'}.`
        : 'No eligible nearby donors found within 5 km right now.',
    });
  });

  // GET /api/needs/meta — blood groups + radius for the composer UI
  app.get('/api/needs/meta', (req, res) => {
    res.json({ bloodGroups: BLOOD_GROUPS, maxRadiusKm: MAX_RADIUS_KM });
  });
}
