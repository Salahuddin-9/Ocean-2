/**
 * Ocean — Halal Dating Timeline (Feature 221)
 * ---------------------------------------------
 * A state machine for relationship stages: match → getting-to-know →
 * guardian-involved → engagement → nikkah. Either partner advances a stage;
 * the other must confirm before it sticks. Every transition is logged.
 *
 * Model (global db): db.halalRelationships — array of
 *   { id, userA, userB, stage, pendingStage, log: { stage, by, at }[], createdAt }
 *
 * Routes:
 *   GET  /api/halal             (auth) my relationship(s)
 *   POST /api/halal/start       (auth) { partnerId } start a halal timeline
 *   POST /api/halal/:id/advance (auth) propose next stage
 *   POST /api/halal/:id/confirm (auth) confirm pending stage
 *   POST /api/halal/:id/end     (auth) end the timeline
 */

import express from 'express';
import { getCtx } from './turtleServerContext';

export interface HalalRelationship {
  id: string;
  userA: string;
  userB: string;
  stage: number;
  pendingStage?: number;
  log: { stage: number; by: string; at: number }[];
  createdAt: number;
}

export const HALAL_STAGES = ['Match', 'Getting to know (with chaperone)', 'Guardian involved', 'Engagement', 'Nikkah'];

function uid(): string {
  return `halal-${Date.now()}-${Math.floor(Math.random() * 99999)}`;
}

function ensureCollection(db: any): void {
  if (!Array.isArray(db.halalRelationships)) db.halalRelationships = [];
}

function s(v: unknown, max: number): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

function resolveUser(db: any, ref: string): any | null {
  const q = String(ref || '').trim();
  const byId = (db.users || []).find((u: any) => u && u.id === q);
  if (byId) return byId;
  return (db.users || []).find((u: any) => u && (u.name === q || u.username === q)) || null;
}

export function registerHalalDatingRoutes(app: express.Express): void {
  const { requireAuth, loadDatabase, saveDatabase } = getCtx();

  function mine(db: any, userId: string) {
    return (db.halalRelationships as HalalRelationship[]).filter((r) => r.userA === userId || r.userB === userId);
  }

  app.get('/api/halal', requireAuth, (req, res) => {
    const user = (req as any).user;
    const db = loadDatabase();
    ensureCollection(db);
    res.json({ relationships: mine(db, user.id) });
  });

  app.post('/api/halal/start', requireAuth, (req, res) => {
    const user = (req as any).user;
    const partnerRef = s((req.body || {}).partnerId, 100);
    if (!partnerRef) return res.status(400).json({ error: 'partnerId is required.' });
    const db = loadDatabase();
    ensureCollection(db);
    const partner = resolveUser(db, partnerRef);
    if (!partner) return res.status(404).json({ error: 'Partner not found.' });
    if (partner.id === user.id) return res.status(400).json({ error: 'Not with yourself!' });
    if (mine(db, user.id).some((r) => r.stage < 4)) {
      return res.status(400).json({ error: 'You already have an active timeline.' });
    }
    const rel: HalalRelationship = {
      id: uid(),
      userA: user.id,
      userB: partner.id,
      stage: 0,
      log: [{ stage: 0, by: user.id, at: Date.now() }],
      createdAt: Date.now(),
    };
    (db.halalRelationships as HalalRelationship[]).push(rel);
    saveDatabase(db);
    res.json({ relationship: rel, stages: HALAL_STAGES });
  });

  app.post('/api/halal/:id/advance', requireAuth, (req, res) => {
    const user = (req as any).user;
    const db = loadDatabase();
    ensureCollection(db);
    const rel = (db.halalRelationships as HalalRelationship[]).find((r) => r.id === req.params.id);
    if (!rel) return res.status(404).json({ error: 'Relationship not found.' });
    if (rel.userA !== user.id && rel.userB !== user.id) return res.status(403).json({ error: 'Not part of this timeline.' });
    if (rel.stage >= HALAL_STAGES.length - 1) return res.status(400).json({ error: 'Already at Nikkah — mabrook!' });
    if (rel.pendingStage != null) return res.status(400).json({ error: 'Partner must confirm the pending stage first.' });
    rel.pendingStage = rel.stage + 1;
    saveDatabase(db);
    res.json({ relationship: rel, stages: HALAL_STAGES });
  });

  app.post('/api/halal/:id/confirm', requireAuth, (req, res) => {
    const user = (req as any).user;
    const db = loadDatabase();
    ensureCollection(db);
    const rel = (db.halalRelationships as HalalRelationship[]).find((r) => r.id === req.params.id);
    if (!rel) return res.status(404).json({ error: 'Relationship not found.' });
    if (rel.userA !== user.id && rel.userB !== user.id) return res.status(403).json({ error: 'Not part of this timeline.' });
    if (rel.pendingStage == null) return res.status(400).json({ error: 'Nothing pending.' });
    rel.stage = rel.pendingStage;
    rel.pendingStage = undefined;
    rel.log.push({ stage: rel.stage, by: user.id, at: Date.now() });
    saveDatabase(db);
    res.json({ relationship: rel, stages: HALAL_STAGES });
  });

  app.post('/api/halal/:id/end', requireAuth, (req, res) => {
    const user = (req as any).user;
    const db = loadDatabase();
    ensureCollection(db);
    const rel = (db.halalRelationships as HalalRelationship[]).find((r) => r.id === req.params.id);
    if (!rel) return res.status(404).json({ error: 'Relationship not found.' });
    if (rel.userA !== user.id && rel.userB !== user.id) return res.status(403).json({ error: 'Not part of this timeline.' });
    rel.stage = -1;
    rel.pendingStage = undefined;
    saveDatabase(db);
    res.json({ success: true });
  });
}
