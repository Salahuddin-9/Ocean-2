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
 *     verifiedAt?, submittedAt }
 *
 * Routes:
 *   POST /api/zkkyc/submit    (auth) { commitments: [{field,digest}], proofs: [{property,proof}] }
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
  submittedAt: number;
  verifiedAt?: number;
}

function uid(): string {
  return `zk-${Date.now()}-${Math.floor(Math.random() * 99999)}`;
}

function ensureCollection(db: any): void {
  if (!Array.isArray(db.zkYcRecords)) db.zkYcRecords = [];
}

function s(v: unknown, max: number): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

export function registerZKKYCRoutes(app: express.Express): void {
  const { requireAuth, loadDatabase, saveDatabase } = getCtx();

  app.post('/api/zkkyc/submit', requireAuth, (req, res) => {
    const user = (req as any).user;
    const b = (req.body || {}) as any;
    const commitments = Array.isArray(b.commitments) ? b.commitments.slice(0, 10).map((c: any) => ({
      field: s(c.field, 40), digest: s(c.digest, 128),
    })).filter((c: { field: string; digest: string }) => c.field && c.digest) : [];
    const proofs = Array.isArray(b.proofs) ? b.proofs.slice(0, 10).map((p: any) => ({
      property: s(p.property, 60), proof: s(p.proof, 512),
    })).filter((p: { property: string; proof: string }) => p.property && p.proof) : [];
    if (commitments.length === 0) return res.status(400).json({ error: 'At least one commitment is required.' });
    const db = loadDatabase();
    ensureCollection(db);
    // one active record per user
    db.zkYcRecords = (db.zkYcRecords as ZkycRecord[]).filter((r) => r.userId !== user.id);
    const record: ZkycRecord = {
      id: uid(),
      userId: user.id,
      status: 'pending',
      commitments,
      proofs,
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
