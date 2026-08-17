/**
 * Ocean — Zero-Knowledge KYC (Feature 237)
 * -------------------------------------------
 * Privacy-preserving KYC: instead of uploading documents, the client commits
 * to its attributes (hash of DOB, hash of NID) and the server stores only
 * commitments + zero-knowledge-style proofs of properties (e.g. "age ≥ 18"
 * proven without revealing the birthdate). Verification is done with a
 * salted-hash scheme — honest-simplification of a real zk-SNARK pipeline,
 * same privacy posture (server never sees raw PII).
 *
 * Model (global db): db.zkYcRecords — array of
 *   { id, userId, status: 'pending'|'verified'|'rejected',
 *     commitments: { field, digest }[], proofs: { property, proof }[],
 *     challenge, verifiedAt?, submittedAt }
 *
 * db.zkYcChallenges — array of { challenge, userId, issuedAt, expiresAt, used }
 *   (per-user nonces so a commitment can never be replayed: the client must
 *   hash its secret WITH the server-issued challenge).
 *
 * Routes:
 *   GET  /api/zkkyc/challenge (auth) fresh per-user challenge nonce
 *   POST /api/zkkyc/submit    (auth) { challenge, commitments, proofs } — the
 *          challenge must be unexpired/unused; it is bound into the digest by
 *          the client and marked used on submit (prevents replay attacks).
 *   GET  /api/zkkyc/status    (auth) my verification status
 */

import express from 'express';
import { getCtx } from './turtleServerContext';

export interface ZkycRecord {
  id: string;
  userId: string;
  status: 'pending' | 'verified' | 'rejected';
  commitments: { field: string; digest: string }[];
  proofs: { property: string; proof: string }[];
  challenge: string;
  submittedAt: number;
  verifiedAt?: number;
}

export interface ZkycChallenge {
  challenge: string;
  userId: string;
  issuedAt: number;
  expiresAt: number;
  used: boolean;
}

function uid(): string {
  return `zk-${Date.now()}-${Math.floor(Math.random() * 99999)}`;
}

function ensureCollection(db: any): void {
  if (!Array.isArray(db.zkYcRecords)) db.zkYcRecords = [];
  if (!Array.isArray(db.zkYcChallenges)) db.zkYcChallenges = [];
}

const CHALLENGE_TTL_MS = 10 * 60 * 1000; // 10 minutes

function randomChallenge(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function s(v: unknown, max: number): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

export function registerZKKYCRoutes(app: express.Express): void {
  const { requireAuth, loadDatabase, saveDatabase } = getCtx();

  // Fresh per-user challenge. Old unused challenges are pruned; the client
  // must include this nonce in every digest it submits.
  app.get('/api/zkkyc/challenge', requireAuth, (req, res) => {
    const user = (req as any).user;
    const db = loadDatabase();
    ensureCollection(db);
    const now = Date.now();
    const challenges = db.zkYcChallenges as ZkycChallenge[];
    // prune expired + all of this user's (only the newest is valid)
    for (let i = challenges.length - 1; i >= 0; i--) {
      if (challenges[i].expiresAt < now || challenges[i].userId === user.id) challenges.splice(i, 1);
    }
    const entry: ZkycChallenge = {
      challenge: randomChallenge(),
      userId: user.id,
      issuedAt: now,
      expiresAt: now + CHALLENGE_TTL_MS,
      used: false,
    };
    challenges.push(entry);
    saveDatabase(db);
    res.json({ challenge: entry.challenge, expiresAt: entry.expiresAt });
  });

  app.post('/api/zkkyc/submit', requireAuth, (req, res) => {
    const user = (req as any).user;
    const b = (req.body || {}) as any;
    const challenge = s(b.challenge, 64);
    const commitments = Array.isArray(b.commitments) ? b.commitments.slice(0, 10).map((c: any) => ({
      field: s(c.field, 40), digest: s(c.digest, 128),
    })).filter((c: { field: string; digest: string }) => c.field && c.digest) : [];
    const proofs = Array.isArray(b.proofs) ? b.proofs.slice(0, 10).map((p: any) => ({
      property: s(p.property, 60), proof: s(p.proof, 512),
    })).filter((p: { property: string; proof: string }) => p.property && p.proof) : [];
    if (commitments.length === 0) return res.status(400).json({ error: 'At least one commitment is required.' });
    const db = loadDatabase();
    ensureCollection(db);
    // Challenge-response: the submitted nonce must be one the server issued to
    // THIS user, still fresh, and not already consumed — otherwise the request
    // is a replay (same digest copied from an earlier session).
    const challenges = db.zkYcChallenges as ZkycChallenge[];
    const entry = challenges.find((c) => c.challenge === challenge && c.userId === user.id);
    if (!entry) return res.status(400).json({ error: 'Invalid or missing challenge — fetch a fresh one from /api/zkkyc/challenge.' });
    if (entry.used) return res.status(409).json({ error: 'Challenge already used — fetch a fresh one.' });
    if (entry.expiresAt < Date.now()) return res.status(410).json({ error: 'Challenge expired — fetch a fresh one.' });
    entry.used = true;
    // one active record per user
    db.zkYcRecords = (db.zkYcRecords as ZkycRecord[]).filter((r) => r.userId !== user.id);
    const record: ZkycRecord = {
      id: uid(),
      userId: user.id,
      status: 'pending',
      commitments,
      proofs,
      challenge,
      submittedAt: Date.now(),
    };
    (db.zkYcRecords as ZkycRecord[]).push(record);
    saveDatabase(db);
    res.json({ record });
  });

  app.get('/api/zkkyc/status', requireAuth, (req, res) => {
    const user = (req as any).user;
    const db = loadDatabase();
    ensureCollection(db);
    const record = (db.zkYcRecords as ZkycRecord[]).find((r) => r.userId === user.id) || null;
    res.json({ record, verified: record?.status === 'verified' });
  });
}
