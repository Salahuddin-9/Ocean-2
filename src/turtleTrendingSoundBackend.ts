/**
 * Ocean — Trending Sound Predictor backend
 * -----------------------------------------
 * Tracks sound/music usage across reels and posts, predicts which sounds are
 * going viral, and exposes the top 5.
 *
 * Data source: the live post/reel model in database.json does NOT carry a
 * dedicated sound field — posts are { creator, content, title, imageUrl,
 * videoUrl, audioUrl, likes, comments, ... } and reels are derived client-side
 * (feed posts with videoUrl → Reel { id, title, category, creatorId, caption,
 * ... }). So the scanner reads post objects DEFENSIVELY for any of:
 *   p.sound (string | {id,name,artist}), p.soundId, p.soundName, p.musicName,
 *   p.musicTitle, p.trackName, p.soundTrackName, p.soundtrack_name, p.audioName,
 *   p.soundArtist
 * and, when none exists, falls back to parsing the caption text for a sound
 * marker hashtag of the form "#sound <name>" (also #music / #soundtrack /
 * #song / #audio). A user posting a reel can also explicitly record usage via
 * POST /api/sounds/track.
 *
 * Model: db.soundTrends — array of SoundTrend records (idempotent ensure).
 *   usageCount  = postUsage (recomputed fresh from posts each scan) + manualCount
 *   growthRate  = usageCount / max(1, yesterdayCount), rolled over once per day
 *   score       = usageCount * max(0, growthRate)^2   (viral-prediction score)
 *
 * A lightweight in-process scheduler (setInterval, 60s) re-scans posts and
 * performs the once-per-day growth rollover. It is idempotent per period and
 * only writes db when something actually changed, so it never thrashes the
 * saveDatabase write-lock / Firestore sync.
 */

import express from 'express';
import { getCtx } from './turtleServerContext';

/** A tracked sound trend record persisted in db.soundTrends. */
export interface SoundTrend {
  id: string;
  soundId?: string;
  name: string;
  artist?: string;
  usageCount: number;
  /** usageCount snapshot taken 24h ago (baseline for growthRate). */
  yesterdayCount: number;
  /** Per-day growth ratio, e.g. 1.42 = 42% up. */
  growthRate: number;
  lastUpdatedAt?: number;
  /** Viral-prediction score = usageCount * max(0, growthRate)^2. */
  score: number;
  /** Post-derived usage (recomputed from scratch on each scan — idempotent). */
  postUsage: number;
  /** Usage recorded explicitly via POST /api/sounds/track. */
  manualCount: number;
}

const SCAN_INTERVAL_MS = 60_000; // modest 60s tick
const MAX_NAME_LEN = 80;
const MAX_ID_LEN = 64;

let cronStarted = false;
let tickRunning = false;

function uid(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

/** Normalize a sound name into a stable key for matching/dedup. */
function normKey(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}

function dayKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

/** score = usageCount * max(0, growthRate)^2 (spec formula). */
function recomputeScore(t: { usageCount: number; growthRate: number }): number {
  const usage = Math.max(0, t.usageCount || 0);
  const g = Math.max(0, t.growthRate || 0);
  return Math.round(usage * g * g * 100) / 100;
}

/** Idempotent collection ensure — safe to run on every load. */
function ensureCollection(db: any): boolean {
  if (!db || typeof db !== 'object') return false;
  if (!Array.isArray(db.soundTrends)) {
    db.soundTrends = [];
    return true;
  }
  return false;
}

/** Find an existing trend by soundId first, then by normalized name. */
function findTrend(trends: SoundTrend[], soundId?: string, name?: string): SoundTrend | undefined {
  if (soundId) {
    const byId = trends.find(t => t.soundId && t.soundId === soundId);
    if (byId) return byId;
  }
  if (name) {
    const nk = normKey(name);
    return trends.find(t => t.name && normKey(t.name) === nk);
  }
  return undefined;
}

/**
 * Parse a sound marker from caption text of the form "#sound <name>" (also
 * #music / #soundtrack / #song / #audio). Returns the extracted name or null.
 */
function parseCaptionSound(text: string): string | null {
  if (!text) return null;
  const re = /#(soundtrack|sound|music|song|audio)\b\s*[:=-]?\s*([^\n#]{1,80})/gi;
  let best = '';
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const candidate = m[2].replace(/^[\s\-–—.:*'"!]+/, '').trim();
    if (candidate.length >= 2 && candidate.length > best.length) best = candidate;
  }
  return best ? best.slice(0, MAX_NAME_LEN) : null;
}

/**
 * Extract a sound descriptor from a single post/reel record.
 * Checks explicit fields first, then falls back to caption hashtag parsing.
 */
export function extractSoundFromPost(p: any): { soundId?: string; name: string; artist?: string } | null {
  if (!p || typeof p !== 'object') return null;

  let name = '';
  let soundId = '';
  let artist = '';

  const s = p.sound;
  if (s && typeof s === 'object') {
    if (typeof s.name === 'string' && s.name.trim()) name = s.name.trim();
    if (typeof s.id === 'string' && s.id.trim()) soundId = s.id.trim();
    if (typeof s.artist === 'string' && s.artist.trim()) artist = s.artist.trim();
  } else if (typeof s === 'string' && s.trim()) {
    name = s.trim();
  }

  // Explicit sound-name fields, in priority order (first non-empty wins).
  for (const field of [
    'soundName', 'musicName', 'musicTitle', 'trackName',
    'soundTrackName', 'soundtrack_name', 'audioName',
  ]) {
    const v = (p as any)[field];
    if (typeof v === 'string' && v.trim()) {
      if (!name) name = v.trim();
      break;
    }
  }
  if (!soundId && typeof p.soundId === 'string' && p.soundId.trim()) {
    soundId = p.soundId.trim();
  }
  if (!artist && typeof p.soundArtist === 'string' && p.soundArtist.trim()) {
    artist = p.soundArtist.trim();
  }

  if (name || soundId) {
    return {
      soundId: soundId || undefined,
      name: name || (soundId ? `Sound ${soundId.slice(0, 12)}` : 'Unknown sound'),
      artist: artist || undefined,
    };
  }

  // Fallback: caption hashtag of the form "#sound <name>".
  const caption = `${p.content || ''} ${p.caption || ''} ${p.title || ''}`;
  const parsed = parseCaptionSound(caption);
  if (parsed) return { name: parsed };
  return null;
}

/**
 * Scan db.posts + every user.profile.posts for reel-like posts carrying a sound.
 * Returns a Map<key, {soundId?, name, artist?, count}>. Deduped by post id.
 */
export function scanPostsForSounds(db: any): Map<string, { soundId?: string; name: string; artist?: string; count: number }> {
  const counts = new Map<string, { soundId?: string; name: string; artist?: string; count: number }>();
  const seen = new Set<string>();
  const posts: any[] = [];

  if (Array.isArray(db.posts)) {
    for (const p of db.posts) posts.push(p);
  }
  if (Array.isArray(db.users)) {
    for (const u of db.users) {
      const ups = u?.profile?.posts;
      if (Array.isArray(ups)) for (const p of ups) posts.push(p);
    }
  }

  for (const p of posts) {
    if (!p || typeof p !== 'object') continue;
    if (p.id) {
      if (seen.has(p.id)) continue;
      seen.add(p.id);
    }
    const hit = extractSoundFromPost(p);
    if (!hit) continue;
    const key = hit.soundId ? `id:${hit.soundId}` : `name:${normKey(hit.name)}`;
    const cur = counts.get(key);
    if (cur) {
      cur.count += 1;
      if (!cur.artist && hit.artist) cur.artist = hit.artist;
    } else {
      counts.set(key, { soundId: hit.soundId, name: hit.name, artist: hit.artist, count: 1 });
    }
  }
  return counts;
}

/**
 * Merge a fresh scan into the persisted trends. postUsage is recomputed from
 * the current scan (0 for sounds no longer present), so this is IDEMPOTENT per
 * scan — running it repeatedly never double-counts. usageCount = postUsage +
 * manualCount. Returns true if anything changed (caller persists only then).
 */
function mergeScanIntoTrends(trends: SoundTrend[], scan: Map<string, { soundId?: string; name: string; artist?: string; count: number }>, now: number): boolean {
  let changed = false;
  const handled = new Set<SoundTrend>();

  scan.forEach((s) => {
    const existing = findTrend(trends, s.soundId, s.name);
    if (existing) {
      handled.add(existing);
      if (existing.postUsage !== s.count) {
        existing.postUsage = s.count;
        changed = true;
      }
      if (!existing.name && s.name) {
        existing.name = s.name;
        changed = true;
      }
      if (s.artist && !existing.artist) {
        existing.artist = s.artist;
        changed = true;
      }
      existing.usageCount = existing.postUsage + (existing.manualCount || 0);
      if (existing.growthRate == null) existing.growthRate = 1;
      existing.score = recomputeScore(existing);
    } else {
      const t: SoundTrend = {
        id: uid('sound'),
        soundId: s.soundId,
        name: s.name,
        artist: s.artist,
        usageCount: s.count,
        yesterdayCount: s.count, // baseline = current usage (flat until tomorrow)
        growthRate: 1,
        lastUpdatedAt: now,
        score: recomputeScore({ usageCount: s.count, growthRate: 1 }),
        postUsage: s.count,
        manualCount: 0,
      };
      trends.push(t);
      handled.add(t); // freshly created — must not be zeroed in the pass below
      changed = true;
    }
  });

  // Zero out postUsage for trends no longer seen in the current scan.
  trends.forEach((t) => {
    if (handled.has(t)) return;
    if (t.postUsage !== 0) {
      t.postUsage = 0;
      changed = true;
    }
    const nu = t.manualCount || 0;
    if (t.usageCount !== nu) {
      t.usageCount = nu;
      changed = true;
    }
    t.score = recomputeScore(t);
  });

  return changed;
}

/**
 * Once-per-day growth rollover per sound: growthRate = usageCount /
 * max(1, yesterdayCount), then yesterdayCount = usageCount. Idempotent via the
 * lastUpdatedAt day check (only fires on the first tick of a new day).
 */
function rolloverDaily(trends: SoundTrend[], now: number): boolean {
  let changed = false;
  const today = dayKey(now);
  for (const t of trends) {
    if (!t.lastUpdatedAt) {
      t.lastUpdatedAt = now;
      changed = true;
      continue;
    }
    if (dayKey(t.lastUpdatedAt) === today) continue;
    t.growthRate = t.usageCount / Math.max(1, t.yesterdayCount || 0);
    t.yesterdayCount = t.usageCount;
    t.lastUpdatedAt = now;
    t.score = recomputeScore(t);
    changed = true;
  }
  return changed;
}

/** Slim public shape returned to the client. */
function publicSound(t: SoundTrend) {
  return {
    id: t.id,
    soundId: t.soundId,
    name: t.name,
    artist: t.artist,
    usageCount: t.usageCount,
    growthRate: t.growthRate,
    score: t.score,
    lastUpdatedAt: t.lastUpdatedAt,
  };
}

/** In-process scheduler — 60s tick, idempotent, writes only when changed. */
function startSoundCron(load: () => any, save: (db: any) => void): void {
  if (cronStarted) return;
  cronStarted = true;
  setInterval(() => {
    if (tickRunning) return;
    tickRunning = true;
    try {
      const db = load();
      if (!db || typeof db !== 'object') return;
      const created = ensureCollection(db);
      const scan = scanPostsForSounds(db);
      const merged = mergeScanIntoTrends(db.soundTrends as SoundTrend[], scan, Date.now());
      const rolled = rolloverDaily(db.soundTrends as SoundTrend[], Date.now());
      if (created || merged || rolled) save(db);
    } catch (e: any) {
      console.warn('[sounds] cron tick error:', e?.message || e);
    } finally {
      tickRunning = false;
    }
  }, SCAN_INTERVAL_MS);
}

// ---------------------------------------------------------------------------
// ROUTES
// ---------------------------------------------------------------------------

export function registerTrendingSoundRoutes(app: express.Express): void {
  const { requireAuth, loadDatabase, saveDatabase } = getCtx();

  // Record a sound usage now (called when a user posts a reel with that sound).
  app.post('/api/sounds/track', requireAuth, (req, res) => {
    const user = (req as any).user;
    const body = (req.body || {}) as any;
    const cleanName = typeof body.name === 'string' && body.name.trim() ? body.name.trim().slice(0, MAX_NAME_LEN) : '';
    const cleanId = typeof body.soundId === 'string' && body.soundId.trim() ? body.soundId.trim().slice(0, MAX_ID_LEN) : '';
    const cleanArtist = typeof body.artist === 'string' && body.artist.trim() ? body.artist.trim().slice(0, MAX_NAME_LEN) : '';
    if (!cleanName && !cleanId) {
      return res.status(400).json({ error: 'name or soundId is required.' });
    }

    const db = loadDatabase();
    ensureCollection(db);
    const trends = db.soundTrends as SoundTrend[];
    const now = Date.now();

    let t = findTrend(trends, cleanId, cleanName);
    if (!t) {
      t = {
        id: uid('sound'),
        soundId: cleanId || undefined,
        name: cleanName || (cleanId ? `Sound ${cleanId.slice(0, 12)}` : 'Unknown sound'),
        artist: cleanArtist || undefined,
        usageCount: 0,
        yesterdayCount: 0,
        growthRate: 1,
        lastUpdatedAt: now,
        score: 0,
        postUsage: 0,
        manualCount: 0,
      };
      trends.push(t);
    } else {
      if (cleanName && t.name !== cleanName) t.name = cleanName;
      if (cleanArtist && !t.artist) t.artist = cleanArtist;
    }

    t.manualCount = (t.manualCount || 0) + 1;
    t.usageCount = (t.postUsage || 0) + t.manualCount;
    if (t.growthRate == null) t.growthRate = 1;
    t.score = recomputeScore(t);
    saveDatabase(db);

    res.json({ success: true, sound: publicSound(t), trackedBy: user.id });
  });

  // Top 5 sounds predicted to go viral (guest-safe).
  app.get('/api/sounds/trending', (req, res) => {
    const db = loadDatabase();
    ensureCollection(db);
    const trends = (db.soundTrends as SoundTrend[]) || [];
    const ranked = trends
      .map(t => ({ ...t, score: recomputeScore(t) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map(publicSound);
    res.json({ trending: ranked });
  });

  // All tracked sounds sorted by usage (guest-safe).
  app.get('/api/sounds', (req, res) => {
    const db = loadDatabase();
    ensureCollection(db);
    const trends = (db.soundTrends as SoundTrend[]) || [];
    const sounds = trends
      .map(t => ({ ...t, score: recomputeScore(t) }))
      .sort((a, b) => (b.usageCount || 0) - (a.usageCount || 0))
      .map(publicSound);
    res.json({ sounds });
  });

  // Start the daily-update scanner (once per process).
  startSoundCron(loadDatabase, saveDatabase);
}
