/**
 * Ocean — Self-Defense Tutorial Shorts backend (FEATURE 126)
 * ------------------------------------------------------------
 * Curated 30-second self-defence micro-lessons surfaced as a "Safety" category.
 * Deliberately light: a seeded curated library (text + optional embed id), a
 * community submission endpoint, tag/level filtering, and upvotes. No video
 * pipeline — the feed for real reels is the existing ReelsBackend; this module
 * provides the curated "Safety" shelf.
 *
 * Persistence: global db via ctx.loadDatabase()/saveDatabase() under `db.safetyShorts`
 * (idempotent ensure). The curated seed is merged in on first read (idempotent).
 *
 * Routes:
 *   GET  /api/safety/shorts        -> curated + community shorts (?tag=, ?level=), guest-safe
 *   GET  /api/safety/tags          -> available tags with counts, guest-safe
 *   POST /api/safety/shorts/submit -> community submission (requireAuth, 5/day)
 *   POST /api/safety/shorts/:id/upvote -> one upvote per user (requireAuth)
 */

import express from 'express';
import { getCtx } from './turtleServerContext';

export type ShortLevel = 'beginner' | 'intermediate' | 'advanced';

export interface SafetyShort {
  id: string;
  title: string;
  instructor: string;
  /** Targeted duration of the micro-lesson in seconds (target ~30). */
  durationSec: number;
  level: ShortLevel;
  tags: string[];
  /** Bullet-point steps a viewer can actually follow. */
  steps: string[];
  /** Optional YouTube embed id (rendered as a play placeholder when absent). */
  youtubeId?: string;
  /** 'curated' (Ocean Safety partners) vs 'community' (user submitted). */
  source: 'curated' | 'community';
  submittedById?: string;
  submittedByName?: string;
  upvotes: string[];
  createdAt: number;
}

export interface SafetyShortsState {
  shorts: SafetyShort[];
}

const LEVELS: ShortLevel[] = ['beginner', 'intermediate', 'advanced'];
const MAX_SUBMISSIONS_PER_DAY = 5;
const DAY_MS = 24 * 60 * 60 * 1000;

const CURATED_SEED: Omit<SafetyShort, 'id' | 'upvotes' | 'createdAt' | 'source'>[] = [
  {
    title: 'Wrist grab release',
    instructor: 'Ocean Safety Partners',
    durationSec: 30,
    level: 'beginner',
    tags: ['women', 'students', 'everyday'],
    steps: [
      'When grabbed at the wrist, rotate your arm toward the attacker\u2019s thumb.',
      'Pull sharply downward and outward to break the grip.',
      'Step back into a stable stance and create distance immediately.',
      'Run toward people or a lit area; call for help loudly.',
    ],
  },
  {
    title: 'Palms-up push escape',
    instructor: 'Ocean Safety Partners',
    durationSec: 30,
    level: 'beginner',
    tags: ['women', 'everyday'],
    steps: [
      'If pushed against a wall, do not fight the push.',
      'Slip one foot back, then drive palms up between you and the attacker.',
      'Use both hands to shove their chin or shoulders, breaking the close range.',
      'Side-step out and move diagonally away, never straight back.',
    ],
  },
  {
    title: 'Hair grab counter',
    instructor: 'Ocean Safety Partners',
    durationSec: 30,
    level: 'beginner',
    tags: ['women', 'students'],
    steps: [
      'Grab the attacker\u2019s hand with both of yours, pinning it to your head.',
      'Lean forward with the pull instead of resisting.',
      'Strike the inner forearm with a hard downward elbow motion.',
      'Drop low and pull their hand off, then sprint away.',
    ],
  },
  {
    title: 'Close-range palm strike',
    instructor: 'Ocean Safety Partners',
    durationSec: 30,
    level: 'beginner',
    tags: ['women', 'everyday'],
    steps: [
      'From a fighting stance, keep your hands up near your chin.',
      'Strike upward with the heel of the palm targeting the nose or chin.',
      'Follow with a knee to the groin if the attacker is still close.',
      'Use the moment of shock to create distance — do not stay to fight.',
    ],
  },
  {
    title: 'Escaping a bear hug',
    instructor: 'Ocean Safety Partners',
    durationSec: 30,
    level: 'intermediate',
    tags: ['women', 'students'],
    steps: [
      'If grabbed from behind, tuck your chin to protect your throat.',
      'Widen your stance and push your hips back to create space.',
      'Drive your heel into their shin or stomp on their foot.',
      'Turn hard into the opening and strike, then disengage and run.',
    ],
  },
  {
    title: 'Ground defence basics',
    instructor: 'Ocean Safety Partners',
    durationSec: 30,
    level: 'intermediate',
    tags: ['advanced-watch'],
    steps: [
      'If knocked down, never lie flat — roll to your side immediately.',
      'Use elbows and knees to keep the attacker off your chest.',
      'Bridge your hips to unbalance them, then scramble to your feet.',
      'Recover facing the threat, hands up, and move to safety.',
    ],
  },
  {
    title: 'Scream + strike drill',
    instructor: 'Ocean Safety Partners',
    durationSec: 30,
    level: 'beginner',
    tags: ['students', 'everyday'],
    steps: [
      'Practise a loud, guttural yell — it both deters and alerts bystanders.',
      'Pair every yell with a strike to the eyes, throat or groin.',
      'Recover into a stable stance between strikes.',
      'The goal is 3 seconds of chaos, then escape.',
    ],
  },
  {
    title: 'Car-jacking awareness',
    instructor: 'Ocean Safety Partners',
    durationSec: 30,
    level: 'intermediate',
    tags: ['everyday', 'travel'],
    steps: [
      'Approach your vehicle with keys ready, scanning the area.',
      'Check the back seat before entering the car.',
      'If approached aggressively, do not get in — walk toward lit public areas.',
      'Keep doors locked while driving and avoid isolated parking at night.',
    ],
  },
  {
    title: 'Public transport safety',
    instructor: 'Ocean Safety Partners',
    durationSec: 30,
    level: 'beginner',
    tags: ['students', 'commute'],
    steps: [
      'Stand near the driver or in well-lit, populated carriages.',
      'Share your route with a trusted contact before travelling.',
      'If harassed, move carriages and alert the driver or guard.',
      'Keep one hand free and your phone reachable at all times.',
    ],
  },
];

function uid(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

function str(v: unknown, max = 300): string {
  return String(v ?? '').trim().slice(0, max);
}

function userName(u: any): string {
  return String(u?.name || u?.username || 'User');
}

function sanitizeLevel(v: unknown): ShortLevel {
  const s = String(v ?? '').trim().toLowerCase();
  return LEVELS.includes(s as ShortLevel) ? (s as ShortLevel) : 'beginner';
}

function sanitizeTags(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((t) => String(t).trim().toLowerCase().replace(/\s+/g, '-'))
    .filter((t) => t.length > 0 && t.length <= 30)
    .slice(0, 8);
}

/** Idempotent ensure + seed merge — safe to run on every load. */
function ensureShorts(db: any): SafetyShortsState {
  if (!db.safetyShorts || typeof db.safetyShorts !== 'object' || Array.isArray(db.safetyShorts)) {
    db.safetyShorts = {};
  }
  const s = db.safetyShorts;
  if (!Array.isArray(s.shorts)) {
    s.shorts = CURATED_SEED.map((c, i) => ({
      ...c,
      id: `curated-${i + 1}`,
      upvotes: [],
      createdAt: Date.now() - (CURATED_SEED.length - i) * 1000,
    }));
  }
  return s;
}

export function registerSafetyShortsRoutes(app: express.Express): void {
  const ctx = getCtx();
  const { requireAuth, loadDatabase, saveDatabase, getRequestUser } = ctx;

  // GET /api/safety/shorts — list with ?tag= and ?level= filters (guest-safe).
  app.get('/api/safety/shorts', (req, res) => {
    try {
      const db = loadDatabase();
      const s = ensureShorts(db);
      let list = [...s.shorts].sort((a, b) => b.createdAt - a.createdAt);
      const tag = String(req.query.tag || '').trim().toLowerCase();
      if (tag) list = list.filter((x) => (x.tags || []).includes(tag));
      const level = String(req.query.level || '').trim().toLowerCase();
      if (LEVELS.includes(level as ShortLevel)) list = list.filter((x) => x.level === level);
      const viewer = getRequestUser(req);
      const viewerId = viewer?.id ?? null;
      res.json({
        shorts: list.map((x) => ({
          ...x,
          upvoteCount: (x.upvotes || []).length,
          upvotedByMe: viewerId !== null && (x.upvotes || []).includes(viewerId),
        })),
        levels: LEVELS,
        count: list.length,
      });
    } catch (e: any) {
      console.warn('[safety-shorts] list error:', e?.message || e);
      res.status(500).json({ error: 'List failed.' });
    }
  });

  // GET /api/safety/tags — tag counts (guest-safe).
  app.get('/api/safety/tags', (req, res) => {
    try {
      const db = loadDatabase();
      const s = ensureShorts(db);
      const counts = new Map<string, number>();
      for (const x of s.shorts) for (const t of x.tags || []) counts.set(t, (counts.get(t) || 0) + 1);
      res.json({
        tags: Array.from(counts.entries())
          .map(([tag, count]) => ({ tag, count }))
          .sort((a, b) => b.count - a.count),
      });
    } catch (e: any) {
      console.warn('[safety-shorts] tags error:', e?.message || e);
      res.status(500).json({ error: 'Tags failed.' });
    }
  });

  // POST /api/safety/shorts/submit — community submission (requireAuth, 5/day).
  app.post('/api/safety/shorts/submit', requireAuth, (req, res) => {
    try {
      const me = (req as any).user;
      const body = req.body || {};
      const title = str(body.title, 120);
      const stepsRaw = Array.isArray(body.steps) ? body.steps.map((s: unknown) => str(s, 300)).filter(Boolean) : [];
      if (title.length < 5) return res.status(400).json({ error: 'Title is required (min 5 characters).' });
      if (stepsRaw.length < 1) return res.status(400).json({ error: 'Add at least one safety step.' });

      const db = loadDatabase();
      const s = ensureShorts(db);
      const dayStart = Date.now() - DAY_MS;
      const recent = s.shorts.filter(
        (x) => x.source === 'community' && x.submittedById === me.id && x.createdAt >= dayStart
      ).length;
      if (recent >= MAX_SUBMISSIONS_PER_DAY) {
        return res.status(429).json({ error: `You can submit ${MAX_SUBMISSIONS_PER_DAY} shorts per day.` });
      }

      const tags = sanitizeTags(body.tags);
      const short: SafetyShort = {
        id: uid('safety'),
        title,
        instructor: str(body.instructor, 80) || userName(me),
        durationSec: Math.min(90, Math.max(15, Math.floor(Number(body.durationSec) || 30))),
        level: sanitizeLevel(body.level),
        tags: tags.length ? tags : ['community'],
        steps: stepsRaw.slice(0, 6),
        source: 'community',
        submittedById: me.id,
        submittedByName: userName(me),
        upvotes: [],
        createdAt: Date.now(),
      };
      s.shorts.unshift(short);
      if (s.shorts.length > 2000) s.shorts = s.shorts.slice(0, 2000);
      saveDatabase(db);
      res.json({ short });
    } catch (e: any) {
      console.warn('[safety-shorts] submit error:', e?.message || e);
      res.status(500).json({ error: 'Submission failed.' });
    }
  });

  // POST /api/safety/shorts/:id/upvote — one upvote per user (requireAuth).
  app.post('/api/safety/shorts/:id/upvote', requireAuth, (req, res) => {
    try {
      const me = (req as any).user;
      const db = loadDatabase();
      const s = ensureShorts(db);
      const short = s.shorts.find((x) => x && x.id === req.params.id);
      if (!short) return res.status(404).json({ error: 'Short not found.' });
      short.upvotes = short.upvotes || [];
      if (short.upvotes.includes(me.id)) {
        short.upvotes = short.upvotes.filter((u) => u !== me.id);
      } else {
        short.upvotes.push(me.id);
      }
      saveDatabase(db);
      res.json({ upvoteCount: short.upvotes.length, upvotedByMe: short.upvotes.includes(me.id) });
    } catch (e: any) {
      console.warn('[safety-shorts] upvote error:', e?.message || e);
      res.status(500).json({ error: 'Upvote failed.' });
    }
  });
}
