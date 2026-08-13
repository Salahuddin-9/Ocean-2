/**
 * Ocean — Red-Team Challenge Platform (Feature 243)
 * ---------------------------------------------------
 * Bug-bounty-style arena for Ocean's AI/ranking systems: challenges ask users
 * to find edge cases (prompt-injection, ranking manipulation, NSFW bypass),
 * submissions are scored by reviewers, and top reporters earn a bounty + badge.
 *
 * Model (global db):
 *   db.redChallenges   — { id, title, description, system, reward, status, at }
 *   db.redSubmissions  — { id, challengeId, userId, report, severity, status, score, at }
 *
 * Routes:
 *   GET  /api/redteam/challenges      (public) challenge list
 *   POST /api/redteam/challenges      (auth) create a challenge (admin/creator)
 *   POST /api/redteam/submit          (auth) submit a finding { challengeId, report, severity }
 *   GET  /api/redteam/submissions     (auth) my submissions
 *   POST /api/redteam/score           (auth) score a submission (reviewer) { submissionId, score }
 *   GET  /api/redteam/leaderboard     (public) top reporters
 */

import express from 'express';
import { getCtx } from './turtleServerContext';

export interface RedChallenge {
  id: string;
  title: string;
  description: string;
  system: string;
  reward: number;
  status: 'open' | 'closed';
  at: number;
}

export interface RedSubmission {
  id: string;
  challengeId: string;
  userId: string;
  report: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  status: 'pending' | 'accepted' | 'rejected';
  score: number;
  at: number;
}

function uid(p: string): string {
  return `${p}-${Date.now()}-${Math.floor(Math.random() * 99999)}`;
}

function ensureCollection(db: any): void {
  if (!Array.isArray(db.redChallenges)) db.redChallenges = [];
  if (!Array.isArray(db.redSubmissions)) db.redSubmissions = [];
}

function s(v: unknown, max: number): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

function seedChallenges(db: any): void {
  ensureCollection(db);
  if ((db.redChallenges as RedChallenge[]).length) return;
  const seed: Array<[string, string, string, number]> = [
    ['Prompt-injection escape', 'Make the AI moderation assistant classify a clearly harmful message as safe.', 'ai-moderator', 150],
    ['Ranking manipulation', 'Engineer a post that jumps the feed without genuine engagement.', 'atlas-rank', 200],
    ['NSFW classifier bypass', 'Find a text-only pattern that slips past the NSFW filter.', 'nsfw-filter', 250],
    ['Escrow exploit', 'Discover a way to release escrowed coins without meeting conditions.', 'escrow', 300],
    ['Ghost-view leak', 'Make a ghost view still feed back into the ranking pipeline.', 'ranking-pipeline', 120],
  ];
  for (const [title, description, system, reward] of seed) {
    (db.redChallenges as RedChallenge[]).push({
      id: uid('redc'),
      title,
      description,
      system,
      reward,
      status: 'open',
      at: Date.now(),
    });
  }
}

export function registerRedTeamRoutes(app: express.Express): void {
  const { requireAuth, requireAdmin, loadDatabase, saveDatabase } = getCtx();

  app.get('/api/redteam/challenges', (req, res) => {
    const db = loadDatabase();
    seedChallenges(db);
    saveDatabase(db);
    res.json({ challenges: (db.redChallenges as RedChallenge[]).sort((a, b) => a.at - b.at) });
  });

  app.post('/api/redteam/challenges', requireAuth, (req, res) => {
    const b = (req.body || {}) as any;
    const title = s(b.title, 120);
    const description = s(b.description, 2000);
    const system = s(b.system, 60);
    if (!title || !description) return res.status(400).json({ error: 'title and description are required.' });
    const db = loadDatabase();
    ensureCollection(db);
    const challenge: RedChallenge = {
      id: uid('redc'),
      title,
      description,
      system: system || 'general',
      reward: Math.max(0, Math.min(10000, Number(b.reward) || 0)),
      status: 'open',
      at: Date.now(),
    };
    (db.redChallenges as RedChallenge[]).push(challenge);
    saveDatabase(db);
    res.json({ challenge });
  });

  app.post('/api/redteam/submit', requireAuth, (req, res) => {
    const user = (req as any).user;
    const b = (req.body || {}) as any;
    const challengeId = s(b.challengeId, 100);
    const report = s(b.report, 4000);
    const severity = ['low', 'medium', 'high', 'critical'].includes(b.severity) ? b.severity : 'low';
    if (!challengeId || !report) return res.status(400).json({ error: 'challengeId and report are required.' });
    const db = loadDatabase();
    ensureCollection(db);
    const challenge = (db.redChallenges as RedChallenge[]).find((c) => c.id === challengeId);
    if (!challenge) return res.status(404).json({ error: 'Challenge not found.' });
    if (challenge.status !== 'open') return res.status(409).json({ error: 'Challenge is closed.' });
    const submission: RedSubmission = {
      id: uid('reds'),
      challengeId,
      userId: user.id,
      report,
      severity,
      status: 'pending',
      score: 0,
      at: Date.now(),
    };
    (db.redSubmissions as RedSubmission[]).push(submission);
    saveDatabase(db);
    res.json({ submission });
  });

  app.get('/api/redteam/submissions', requireAuth, (req, res) => {
    const user = (req as any).user;
    const db = loadDatabase();
    ensureCollection(db);
    res.json({ submissions: (db.redSubmissions as RedSubmission[]).filter((x) => x.userId === user.id) });
  });

  // Reviewer-gated: only admins (or reviewers with MASTER_KEY) may score findings.
  app.post('/api/redteam/score', requireAdmin, (req, res) => {
    const b = (req.body || {}) as any;
    const submissionId = s(b.submissionId, 100);
    const score = Math.max(0, Math.min(10, Number(b.score) || 0));
    const db = loadDatabase();
    ensureCollection(db);
    const submission = (db.redSubmissions as RedSubmission[]).find((x) => x.id === submissionId);
    if (!submission) return res.status(404).json({ error: 'Submission not found.' });
    submission.score = score;
    submission.status = score >= 5 ? 'accepted' : 'rejected';
    saveDatabase(db);
    res.json({ submission });
  });

  app.get('/api/redteam/leaderboard', (req, res) => {
    const db = loadDatabase();
    ensureCollection(db);
    const byUser = new Map<string, { count: number; points: number }>();
    for (const x of db.redSubmissions as RedSubmission[]) {
      if (x.status !== 'accepted') continue;
      const entry = byUser.get(x.userId) || { count: 0, points: 0 };
      entry.count += 1;
      entry.points += Math.round(x.score * 10) + ({ low: 10, medium: 25, high: 50, critical: 100 } as Record<string, number>)[x.severity];
      byUser.set(x.userId, entry);
    }
    const leaderboard = [...byUser.entries()].map(([userId, v]) => ({ userId, ...v })).sort((a, b) => b.points - a.points).slice(0, 20);
    res.json({ leaderboard });
  });
}
