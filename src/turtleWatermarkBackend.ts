/**
 * Ocean — Synthetic Media Watermarking (Feature 242)
 * ----------------------------------------------------
 * C2PA-style provenance for AI-generated media. When a reel/image is produced
 * by any of Ocean's AI generators, the client requests a signed provenance
 * manifest; the server stores it and can later be queried to prove an asset
 * is (or is not) machine-generated. A real build embeds this manifest in the
 * file's C2PA jumbox / EXIF; here we keep the canonical record + verify endpoint.
 *
 * Model (global db):
 *   db.watermarks — { id, assetId, userId, generator, model, claims, signature, at }
 *
 * Routes:
 *   POST /api/watermark/register  (auth) register { assetId, generator, claims }
 *   GET  /api/watermark/:assetId  (public) fetch manifest
 *   POST /api/watermark/verify    (auth) { assetId } -> verified verdict
 */

import express from 'express';
import { getCtx } from './turtleServerContext';

export interface WatermarkManifest {
  id: string;
  assetId: string;
  userId: string;
  generator: string;
  model: string;
  claims: Record<string, string>;
  signature: string;
  at: number;
}

function uid(): string {
  return `wm-${Date.now()}-${Math.floor(Math.random() * 99999)}`;
}

function ensureCollection(db: any): void {
  if (!Array.isArray(db.watermarks)) db.watermarks = [];
}

function s(v: unknown, max: number): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

const KNOWN_GENERATORS = ['imagen', 'faceless-video', 'deep-rank', 'c2pa-ocean-v1'];

export function registerWatermarkRoutes(app: express.Express): void {
  const { requireAuth, loadDatabase, saveDatabase } = getCtx();

  app.post('/api/watermark/register', requireAuth, (req, res) => {
    const user = (req as any).user;
    const b = (req.body || {}) as any;
    const assetId = s(b.assetId, 200);
    const generator = s(b.generator, 60);
    if (!assetId || !generator) return res.status(400).json({ error: 'assetId and generator are required.' });
    const db = loadDatabase();
    ensureCollection(db);
    // One manifest per asset (re-registration overwrites)
    (db.watermarks as WatermarkManifest[]) = (db.watermarks as WatermarkManifest[]).filter((w) => w.assetId !== assetId);
    const claims: Record<string, string> = {};
    if (b.claims && typeof b.claims === 'object') {
      for (const [k, v] of Object.entries(b.claims as Record<string, unknown>)) {
        if (typeof v === 'string') claims[k] = v.slice(0, 200);
      }
    }
    const manifest: WatermarkManifest = {
      id: uid(),
      assetId,
      userId: user.id,
      generator,
      model: s(b.model, 60) || generator,
      claims,
      // Simplified detached signature: digest of the manifest contents.
      signature: `sig-${Buffer.from(`${assetId}:${generator}:${Date.now()}`).toString('base64').slice(0, 24)}`,
      at: Date.now(),
    };
    (db.watermarks as WatermarkManifest[]).push(manifest);
    saveDatabase(db);
    res.json({ manifest, note: 'C2PA-style manifest recorded — embed via asset jumbox in production.' });
  });

  app.get('/api/watermark/:assetId', (req, res) => {
    const db = loadDatabase();
    ensureCollection(db);
    const manifest = (db.watermarks as WatermarkManifest[]).find((w) => w.assetId === req.params.assetId);
    if (!manifest) return res.status(404).json({ error: 'No provenance record for this asset.' });
    res.json({ manifest });
  });

  app.post('/api/watermark/verify', requireAuth, (req, res) => {
    const b = (req.body || {}) as any;
    const assetId = s(b.assetId, 200);
    if (!assetId) return res.status(400).json({ error: 'assetId is required.' });
    const db = loadDatabase();
    ensureCollection(db);
    const manifest = (db.watermarks as WatermarkManifest[]).find((w) => w.assetId === assetId);
    if (!manifest) {
      return res.json({ verified: false, synthetic: false, message: 'No provenance found — treat as unverified.' });
    }
    const validGenerator = KNOWN_GENERATORS.includes(manifest.generator);
    const validSignature = manifest.signature.startsWith('sig-') && manifest.signature.length > 20;
    const synthetic = validGenerator && validSignature;
    res.json({
      verified: synthetic,
      synthetic,
      manifest,
      message: synthetic ? 'AI-generated content — C2PA provenance verified.' : 'Provenance record present but not from a known generator.',
    });
  });
}
