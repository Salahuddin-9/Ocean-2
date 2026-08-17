/**
 * Ocean — Harassment Evidence Vault (Feature 207)
 * -------------------------------------------------
 * A secure, encrypted vault for evidence of harassment. Payloads are
 * encrypted client-side (AES-GCM) before upload — the server only ever sees
 * ciphertext, so even a database breach cannot read the contents. Files can be
 * attached as base64 and are stored alongside the encrypted note.
 *
 * Model (global db): db.evidenceVault — array of
 *   { id, ownerId, title, encrypted: { iv, ciphertext } (base64), kind,
 *     createdAt }
 *
 * Routes (mounted under /api/evidence/* — the secure-vault feature already owns
 * /api/vault/entries, so the evidence vault uses its own prefix to avoid being
 * shadowed by the earlier-registered secure vault handlers):
 *   POST /api/evidence/entries      (auth) store an encrypted entry
 *   GET  /api/evidence/entries      (auth) MY entries (metadata only — no ciphertext for list)
 *   GET  /api/evidence/entries/:id  (auth) MY entry incl. ciphertext
 *   DELETE /api/evidence/entries/:id (auth) remove MY entry
 *   POST /api/vault/evidence        (auth) alias of POST /api/evidence/entries
 */

import express from 'express';
import { getCtx } from './turtleServerContext';

export interface VaultEntry {
  id: string;
  ownerId: string;
  title: string;
  kind: string;
  iv: string;          // base64
  ciphertext: string;  // base64
  createdAt: number;
}

function uid(): string {
  return `vlt-${Date.now()}-${Math.floor(Math.random() * 99999)}`;
}

function ensureCollection(db: any): void {
  if (!Array.isArray(db.evidenceVault)) db.evidenceVault = [];
}

function s(v: unknown, max: number): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

export function registerEvidenceVaultRoutes(app: express.Express): void {
  const { requireAuth, loadDatabase, saveDatabase } = getCtx();

  function handleCreateEntry(req: express.Request, res: express.Response) {
    const user = (req as any).user;
    const b = (req.body || {}) as any;
    const title = s(b.title, 120);
    const iv = s(b.iv, 500);
    const ciphertext = s(b.ciphertext, 100_000);
    if (!title || !iv || !ciphertext) {
      return res.status(400).json({ error: 'title, iv and ciphertext (base64) are required. Encrypt client-side with AES-GCM.' });
    }
    const db = loadDatabase();
    ensureCollection(db);
    const entry: VaultEntry = {
      id: uid(),
      ownerId: user.id,
      title,
      kind: s(b.kind, 40) || 'evidence',
      iv,
      ciphertext,
      createdAt: Date.now(),
    };
    (db.evidenceVault as VaultEntry[]).unshift(entry);
    saveDatabase(db);
    res.json({ entry: { id: entry.id, title: entry.title, kind: entry.kind, createdAt: entry.createdAt } });
  }

  function handleListEntries(req: express.Request, res: express.Response) {
    const user = (req as any).user;
    const db = loadDatabase();
    ensureCollection(db);
    const mine = (db.evidenceVault as VaultEntry[])
      .filter((e) => e.ownerId === user.id)
      .map((e) => ({ id: e.id, title: e.title, kind: e.kind, createdAt: e.createdAt }));
    res.json({ entries: mine });
  }

  function handleGetEntry(req: express.Request, res: express.Response) {
    const user = (req as any).user;
    const db = loadDatabase();
    ensureCollection(db);
    const entry = (db.evidenceVault as VaultEntry[]).find((e) => e.id === req.params.id);
    if (!entry) return res.status(404).json({ error: 'Entry not found.' });
    if (entry.ownerId !== user.id) return res.status(403).json({ error: 'This vault is private.' });
    res.json({ entry });
  }

  function handleDeleteEntry(req: express.Request, res: express.Response) {
    const user = (req as any).user;
    const db = loadDatabase();
    ensureCollection(db);
    const before = (db.evidenceVault as VaultEntry[]).length;
    db.evidenceVault = (db.evidenceVault as VaultEntry[]).filter((e) => !(e.id === req.params.id && e.ownerId === user.id));
    if ((db.evidenceVault as VaultEntry[]).length === before) {
      return res.status(404).json({ error: 'Entry not found.' });
    }
    saveDatabase(db);
    res.json({ success: true });
  }

  app.post('/api/evidence/entries', requireAuth, handleCreateEntry);
  app.post('/api/vault/evidence', requireAuth, handleCreateEntry);
  app.get('/api/evidence/entries', requireAuth, handleListEntries);
  app.get('/api/evidence/entries/:id', requireAuth, handleGetEntry);
  app.delete('/api/evidence/entries/:id', requireAuth, handleDeleteEntry);
}
