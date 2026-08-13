/**
 * Ocean — Trigger Warning Auto-Blur (Feature 139)
 * ------------------------------------------------
 * Scans post text (and captions) for sensitive-topic triggers — violence,
 * self-harm/suicide, phobia triggers, eating disorders, graphic gore. Posts that
 * match are marked `post.triggerWarnings` so clients can blur-by-default and show
 * a "Show content" gate. Mirrors the NSFW pipeline's fail-open philosophy: no
 * match => no warning, never blocks.
 *
 * Model (global db, idempotent ensure):
 *   db.triggerScans — array of { id, postId, textSnippet, warnings: TriggerWarning[],
 *                      severity: 'none'|'mild'|'moderate'|'severe', createdAt }
 *   post.triggerWarnings — written directly onto the post object (canonical flag)
 *
 * Routes:
 *   POST /api/posts/trigger-scan       { postId } -> scan (or return cached) + persist
 *   GET  /api/posts/trigger-scan/:postId          -> cached scan (guest-safe)
 *   POST /api/posts/trigger-scan-text  { text }   -> scan arbitrary text (no persistence)
 */

import express from 'express';
import { getCtx } from './turtleServerContext';

export type TriggerCategory = 'violence' | 'self_harm' | 'phobia' | 'eating_disorder' | 'gore';
export type TriggerSeverity = 'none' | 'mild' | 'moderate' | 'severe';

export interface TriggerWarning {
  category: TriggerCategory;
  label: string;
  keywords: string[];
  severity: 'mild' | 'moderate' | 'severe';
}

export interface TriggerScan {
  id: string;
  postId: string;
  textSnippet: string;
  warnings: TriggerWarning[];
  severity: TriggerSeverity;
  createdAt: number;
}

// Deterministic trigger lexicon — word-boundary matched, low false-positive.
const LEXICON: Record<TriggerCategory, { label: string; severe: string[]; moderate: string[]; mild: string[] }> = {
  violence: {
    label: 'Violence',
    severe: ['murder', 'massacre', 'slaughter', 'torture', 'beheading', 'executed', 'genocide'],
    moderate: ['gunshot', 'shooting', 'stabbing', 'assault', 'brutal', 'bloodbath', 'riot', 'bomb blast'],
    mild: ['fight', 'violence', 'brawl', 'attacked', 'beaten'],
  },
  self_harm: {
    label: 'Self-harm / suicide',
    severe: ['suicide', 'kill myself', 'end my life', 'self-harm', 'self harm', 'take my own life', 'hanging myself'],
    moderate: ['overdose', 'cutting myself', 'no reason to live', 'wanna die', 'want to die'],
    mild: ['depressed', 'hopeless', 'struggling mentally'],
  },
  phobia: {
    label: 'Phobia triggers',
    severe: [],
    moderate: ['snake', 'spider', 'needle', 'injection', 'cockroach', 'rat', 'heights', 'clown'],
    mild: ['blood', 'gore warning'],
  },
  eating_disorder: {
    label: 'Eating disorder',
    severe: ['anorexia', 'bulimia', 'purging', 'starvation diet'],
    moderate: ['calorie counting obsession', 'laxative abuse', 'binge purge'],
    mild: ['diet', 'fasting', 'weight loss'],
  },
  gore: {
    label: 'Graphic gore',
    severe: ['gore', 'dismembered', 'disembowel', 'severed limb', 'corpse', 'dead body'],
    moderate: ['accident footage', 'crime scene', 'graphic images'],
    mild: [],
  },
};

const CATEGORY_ORDER: TriggerCategory[] = ['violence', 'self_harm', 'phobia', 'eating_disorder', 'gore'];

function escRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function matchWords(text: string, words: string[]): string[] {
  if (words.length === 0) return [];
  const lower = text.toLowerCase();
  const re = new RegExp(`\\b(?:${words.map(escRe).join('|')})\\b`, 'gi');
  return (lower.match(re) || []).map((m) => m.toLowerCase());
}

/** Deterministic scan — returns warnings + overall severity. */
export function scanTextForTriggers(raw: string): { warnings: TriggerWarning[]; severity: TriggerSeverity } {
  const text = String(raw || '');
  const warnings: TriggerWarning[] = [];
  let worst = 0;

  for (const cat of CATEGORY_ORDER) {
    const lx = LEXICON[cat];
    const found: { word: string; lvl: number }[] = [];
    for (const w of lx.severe) if (matchWords(text, [w]).length > 0) found.push({ word: w, lvl: 3 });
    for (const w of lx.moderate) if (matchWords(text, [w]).length > 0) found.push({ word: w, lvl: 2 });
    for (const w of lx.mild) if (matchWords(text, [w]).length > 0) found.push({ word: w, lvl: 1 });
    if (found.length === 0) continue;
    const maxLvl = Math.max(...found.map((f) => f.lvl));
    worst = Math.max(worst, maxLvl);
    warnings.push({
      category: cat,
      label: lx.label,
      keywords: found.slice(0, 5).map((f) => f.word),
      severity: maxLvl === 3 ? 'severe' : maxLvl === 2 ? 'moderate' : 'mild',
    });
  }

  const severity: TriggerSeverity = worst >= 3 ? 'severe' : worst === 2 ? 'moderate' : worst === 1 ? 'mild' : 'none';
  return { warnings, severity };
}

function severityRank(s: TriggerSeverity): number {
  return s === 'severe' ? 3 : s === 'moderate' ? 2 : s === 'mild' ? 1 : 0;
}

/** Find a post across db.posts + user.profile.posts (same shape as bounty module). */
function findPostById(db: any, postId: string): any | null {
  if (!postId) return null;
  for (const u of db.users || []) {
    const p = (u.profile?.posts || []).find((x: any) => x && x.id === postId);
    if (p) return p;
  }
  const p = (db.posts || []).find((x: any) => x && x.id === postId);
  return p || null;
}

function postText(p: any): string {
  return String(p?.content || '') + (p?.title ? ` ${String(p.title)}` : '') + (p?.caption ? ` ${String(p.caption)}` : '');
}

function ensureCollection(db: any): void {
  if (!Array.isArray(db.triggerScans)) db.triggerScans = [];
}

export function registerTriggerWarningRoutes(app: express.Express): void {
  const { requireAuth, loadDatabase, saveDatabase } = getCtx();

  // POST /api/posts/trigger-scan — scan a post (auth), cached per post
  app.post('/api/posts/trigger-scan', requireAuth, (req, res) => {
    const postId = String((req.body || {}).postId || '').trim();
    if (!postId) return res.status(400).json({ error: 'postId is required.' });

    const db = loadDatabase();
    ensureCollection(db);
    const post = findPostById(db, postId);
    if (!post) return res.status(404).json({ error: 'Post not found.' });

    const cached = (db.triggerScans as TriggerScan[]).find((s) => s.postId === postId);
    if (cached) return res.json({ scan: cached });

    const { warnings, severity } = scanTextForTriggers(postText(post));
    const scan: TriggerScan = {
      id: `ts-${Date.now()}-${Math.floor(Math.random() * 999)}`,
      postId,
      textSnippet: postText(post).slice(0, 220),
      warnings,
      severity,
      createdAt: Date.now(),
    };
    (db.triggerScans as TriggerScan[]).unshift(scan);
    // Canonical flag on the post itself (consumed by feed blur-gates).
    post.triggerWarnings = warnings.map((w) => w.label);
    post.triggerSeverity = severity;
    saveDatabase(db);
    res.json({ scan });
  });

  // GET /api/posts/trigger-scan/:postId — cached scan (guest-safe)
  app.get('/api/posts/trigger-scan/:postId', (req, res) => {
    const db = loadDatabase();
    ensureCollection(db);
    const post = findPostById(db, req.params.postId);
    const scan = (db.triggerScans as TriggerScan[]).find((s) => s.postId === req.params.postId);
    if (scan) return res.json({ scan });
    if (!post) return res.status(404).json({ error: 'Post not found.' });
    const { warnings, severity } = scanTextForTriggers(postText(post));
    res.json({
      scan: {
        id: null,
        postId: req.params.postId,
        textSnippet: postText(post).slice(0, 220),
        warnings,
        severity,
        createdAt: null,
      },
    });
  });

  // POST /api/posts/trigger-scan-text — scan arbitrary text (no persistence)
  app.post('/api/posts/trigger-scan-text', (req, res) => {
    const text = String((req.body || {}).text || '').slice(0, 4000);
    if (!text.trim()) return res.status(400).json({ error: 'text is required.' });
    const { warnings, severity } = scanTextForTriggers(text);
    res.json({ warnings, severity, needsGate: severityRank(severity) > 0 });
  });
}
