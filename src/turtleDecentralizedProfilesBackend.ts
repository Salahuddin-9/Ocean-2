/**
 * Ocean — De-centralized Profiles backend  [FEATURE 136]
 * -------------------------------------------------------
 * Portable identity with W3C-style DIDs - export/import your identity,
 * portable profile bundles.
 *
 * Security model:
 * - Ed25519 keypair generated server-side with node:crypto (createPrivateKey/createPublicKey).
 * - ONLY the public key is stored in db.dids.identities.
 * - The private key PEM is returned ONCE at creation and never stored.
 * - Imported bundles are validated and stored in db.dids.importedBundles.
 *
 * Collections (idempotent ensure on every load):
 * - db.dids: { identities: DIDIdentity[], importedBundles: ImportedBundle[] }
 */

import express from 'express';
import { createHash, generateKeyPairSync, createPublicKey, createSign, createVerify } from 'node:crypto';
import { getCtx } from './turtleServerContext';

export interface DIDIdentity {
  id: string;                    // did:ocean:<24-hex>
  userId: string;
  username: string;
  displayName: string;
  avatarUrl?: string;
  publicKeyPem: string;          // SPKI PEM (public key only)
  createdAt: number;
}

export interface ImportedBundle {
  importedDid: string;
  userId: string;
  importedAt: number;
}

export interface PortableProfileBundle {
  did: string;
  username: string;
  displayName: string;
  avatarUrl?: string;
  publicKeyPem: string;
  exportedAt: number;
}

function generateDID(): string {
  const bytes = new Uint8Array(12);
  for (let i = 0; i < 12; i++) bytes[i] = Math.floor(Math.random() * 256);
  const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  return `did:ocean:${hex}`;
}

function generateEd25519KeyPair(): { privateKeyPem: string; publicKeyPem: string } {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519', {
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });
  return { privateKeyPem: privateKey, publicKeyPem: publicKey };
}

function validateDID(did: string): boolean {
  return typeof did === 'string' && /^did:ocean:[0-9a-f]{24}$/i.test(did);
}

function validateBundle(bundle: any): bundle is PortableProfileBundle {
  return (
    bundle &&
    typeof bundle.did === 'string' &&
    validateDID(bundle.did) &&
    typeof bundle.username === 'string' &&
    bundle.username.length > 0 &&
    typeof bundle.publicKeyPem === 'string' &&
    bundle.publicKeyPem.includes('-----BEGIN PUBLIC KEY-----')
  );
}

export function registerDecentralizedProfilesRoutes(app: express.Express): void {
  const { requireAuth, loadDatabase, saveDatabase } = getCtx();

  // Idempotent ensure
  function ensureDids(db: any): void {
    if (!db.dids) db.dids = { identities: [], importedBundles: [] };
    if (!Array.isArray(db.dids.identities)) db.dids.identities = [];
    if (!Array.isArray(db.dids.importedBundles)) db.dids.importedBundles = [];
  }

  // POST /api/did/create - generate DID + Ed25519 keypair, store identity (public only)
  app.post('/api/did/create', requireAuth, (req: express.Request, res: express.Response) => {
    const db = loadDatabase();
    ensureDids(db);

    const user = (req as any).user;
    const userId = user?.id;
    const displayName = req.body?.displayName || user?.name || 'Ocean User';

    // Check if user already has a DID
    const existing = db.dids.identities.find((i: DIDIdentity) => i.userId === userId);
    if (existing) {
      return res.status(400).json({ error: 'You already have a DID. Use /api/did/mine to view it.' });
    }

    const did = generateDID();
    const { privateKeyPem, publicKeyPem } = generateEd25519KeyPair();

    const identity: DIDIdentity = {
      id: did,
      userId,
      username: user?.username || `user_${userId.slice(0, 8)}`,
      displayName,
      avatarUrl: user?.profile?.avatarUrl,
      publicKeyPem,
      createdAt: Date.now(),
    };

    db.dids.identities.push(identity);
    saveDatabase(db);

    // Return private key ONCE - never stored
    res.json({
      identity: {
        did: identity.id,
        username: identity.username,
        displayName: identity.displayName,
        avatarUrl: identity.avatarUrl,
        publicKeyPem: identity.publicKeyPem,
      },
      privateKeyPem,
    });
  });

  // GET /api/did/mine - my identity (no private key)
  app.get('/api/did/mine', requireAuth, (req: express.Request, res: express.Response) => {
    const db = loadDatabase();
    ensureDids(db);

    const user = (req as any).user;
    const userId = user?.id;

    const identity = db.dids.identities.find((i: DIDIdentity) => i.userId === userId);
    if (!identity) {
      return res.status(404).json({ error: 'No DID found. Create one first.' });
    }

    res.json({
      identity: {
        did: identity.id,
        username: identity.username,
        displayName: identity.displayName,
        avatarUrl: identity.avatarUrl,
        publicKeyPem: identity.publicKeyPem,
        createdAt: identity.createdAt,
      },
    });
  });

  // POST /api/did/export - build a PORTABLE PROFILE BUNDLE JSON
  app.post('/api/did/export', requireAuth, (req: express.Request, res: express.Response) => {
    const db = loadDatabase();
    ensureDids(db);

    const user = (req as any).user;
    const userId = user?.id;

    const identity = db.dids.identities.find((i: DIDIdentity) => i.userId === userId);
    if (!identity) {
      return res.status(404).json({ error: 'No DID found to export.' });
    }

    const bundle: PortableProfileBundle = {
      did: identity.id,
      username: identity.username,
      displayName: identity.displayName,
      avatarUrl: identity.avatarUrl,
      publicKeyPem: identity.publicKeyPem,
      exportedAt: Date.now(),
    };

    res.json({ bundle });
  });

  // POST /api/did/import - validate bundle and store in importedBundles
  app.post('/api/did/import', requireAuth, (req: express.Request, res: express.Response) => {
    const db = loadDatabase();
    ensureDids(db);

    const user = (req as any).user;
    const userId = user?.id;
    const bundle = req.body?.bundle;

    if (!validateBundle(bundle)) {
      return res.status(400).json({ error: 'Invalid bundle: must contain did, username, publicKeyPem with valid format.' });
    }

    // Check if this DID is already imported by this user
    const already = db.dids.importedBundles.find(
      (b: ImportedBundle) => b.importedDid === bundle.did && b.userId === userId
    );
    if (already) {
      return res.json({ status: 'already_imported', did: bundle.did });
    }

    // Do NOT overwrite an existing identity for this user
    const existingIdentity = db.dids.identities.find((i: DIDIdentity) => i.userId === userId);
    if (existingIdentity && existingIdentity.id !== bundle.did) {
      // Just record the import, don't replace
    }

    db.dids.importedBundles.push({
      importedDid: bundle.did,
      userId,
      importedAt: Date.now(),
    });

    saveDatabase(db);
    res.json({ status: 'imported', did: bundle.did });
  });

  // GET /api/did/resolve/:did - resolve a DID to its public profile document (guest-safe)
  app.get('/api/did/resolve/:did', (req: express.Request, res: express.Response) => {
    const db = loadDatabase();
    ensureDids(db);

    const did = req.params.did;
    if (!validateDID(did)) {
      return res.status(400).json({ error: 'Invalid DID format.' });
    }

    const identity = db.dids.identities.find((i: DIDIdentity) => i.id === did);
    if (!identity) {
      return res.status(404).json({ error: 'DID not found.' });
    }

    res.json({
      did: identity.id,
      username: identity.username,
      displayName: identity.displayName,
      avatarUrl: identity.avatarUrl,
      publicKeyPem: identity.publicKeyPem,
    });
  });

  // GET /api/did/registry - list all identities (guest-safe)
  app.get('/api/did/registry', (req: express.Request, res: express.Response) => {
    const db = loadDatabase();
    ensureDids(db);

    const list = db.dids.identities.map((i: DIDIdentity) => ({
      did: i.id,
      username: i.username,
      displayName: i.displayName,
      publicKeyPem: i.publicKeyPem,
    }));

    res.json({ identities: list });
  });

  // POST /api/did/verify - verify Ed25519 signature against DID public key
  app.post('/api/did/verify', requireAuth, (req: express.Request, res: express.Response) => {
    const db = loadDatabase();
    ensureDids(db);

    const { did, message, signature } = req.body || {};

    if (!did || !validateDID(did)) {
      return res.status(400).json({ error: 'Valid DID required.' });
    }
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Message string required.' });
    }
    if (!signature || typeof signature !== 'string') {
      return res.status(400).json({ error: 'Signature (base64) required.' });
    }

    const identity = db.dids.identities.find((i: DIDIdentity) => i.id === did);
    if (!identity) {
      return res.status(404).json({ error: 'DID not found.' });
    }

    try {
      const publicKey = createPublicKey({ key: identity.publicKeyPem, format: 'pem' });
      const verify = createVerify('sha256');
      verify.update(message);
      verify.end();

      const sigBuffer = Buffer.from(signature, 'base64');
      const valid = verify.verify(publicKey, sigBuffer);

      res.json({ valid });
    } catch (e) {
      res.status(400).json({ error: 'Verification failed: ' + (e as Error).message });
    }
  });
}