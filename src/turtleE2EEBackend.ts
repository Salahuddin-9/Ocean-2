/**
 * Ocean — End-to-End Encryption backend  [FEATURE 132]
 * ----------------------------------------------------
 * E2E-encrypted direct messages with key exchange + encrypted storage at rest.
 *
 * Security model (privacy by construction):
 *  - The server NEVER sees plaintext. Message bodies arrive as opaque base64
 *    AES-GCM ciphertext (plus IV and an RSA-OAEP-wrapped per-message session key)
 *    produced client-side with Web Crypto. Decryption happens only in the browser.
 *  - The server NEVER stores private keys or secrets. db.e2eeKeys holds PUBLIC
 *    RSA public keys only (PEM, spki); db.e2eeMessages holds ciphertext only.
 *  - Fingerprints are deterministic SHA-256 digests of the public key PEM (first
 *    12 hex chars) — used to bind a message to the sender's published key.
 *
 * Collections (idempotent ensure on every load):
 *  - db.e2eeKeys:     { userId, publicKeyPem, fingerprint, createdAt, updatedAt }
 *  - db.e2eeMessages: { id, fromId, toId, ciphertext, iv, wrappedKey,
 *                       wrappedKeyForSender, fromPublicKeyFingerprint,
 *                       createdAt, read }
 *    wrappedKey = per-message AES-256 session key wrapped with the RECIPIENT's
 *    RSA public key. wrappedKeyForSender (optional) = the same session key wrapped
 *    with the SENDER's own RSA public key so the sender can re-read their own sent
 *    messages in a later session. Both are opaque ciphertext — never keys/plaintext.
 */

import express from 'express';
import { createHash } from 'node:crypto';
import { getCtx } from './turtleServerContext';

export interface E2EEKeyRecord {
  userId: string;
  publicKeyPem: string;
  fingerprint: string;
  createdAt: number;
  updatedAt: number;
}

export interface E2EEMessage {
  id: string;
  fromId: string;
  toId: string;
  ciphertext: string;          // base64 of AES-256-GCM encrypted message bytes
  iv: string;                  // base64 of the 12-byte random IV
  wrappedKey: string;          // base64 of the AES session key wrapped w/ recipient RSA-OAEP
  wrappedKeyForSender: string | null; // optional: same session key wrapped w/ sender RSA-OAEP
  fromPublicKeyFingerprint: string;
  createdAt: number;
  read: boolean;
}

const MAX_PEM_LEN = 16384;
const MIN_PEM_LEN = 40;
const MAX_CIPHERTEXT_LEN = 200000;
const MAX_IV_LEN = 128;
const MAX_WRAPPED_LEN = 8192;
const MAX_FP_LEN = 128;

/** Short deterministic SHA-256 fingerprint (first 12 hex chars) of a public key PEM. */
function fingerprintOf(pem: string): string {
  return createHash('sha256').update(String(pem || '')).digest('hex').slice(0, 12);
}

function newMessageId(): string {
  return `e2ee-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

export function registerE2EERoutes(app: express.Express) {
  const ctx = getCtx();
  const { requireAuth, loadDatabase, saveDatabase, loadCommunity, saveCommunity, getRequestUser } = ctx;

  // POST /api/e2ee/keys — publish / upsert my RSA public key (public keys only)
  app.post('/api/e2ee/keys', requireAuth, (req, res) => {
    try {
      const user = (req as any).user;
      const body = req.body || {};
      const pem = body.publicKeyPem ? String(body.publicKeyPem).trim() : '';
      if (pem.length < MIN_PEM_LEN || pem.length > MAX_PEM_LEN) {
        return res.status(400).json({ error: 'Invalid public key (length out of range).' });
      }
      // Accept PEM-formatted spki keys or bare base64 key blobs.
      const isPem = pem.includes('-----BEGIN PUBLIC KEY-----') && pem.includes('-----END PUBLIC KEY-----');
      const isB64 = /^[A-Za-z0-9+/=\r\n]+$/.test(pem);
      if (!isPem && !isB64) {
        return res.status(400).json({ error: 'Invalid public key format. Expected PEM (spki).' });
      }

      const db = loadDatabase();
      if (!Array.isArray(db.e2eeKeys)) db.e2eeKeys = [];
      const fingerprint = fingerprintOf(pem);
      const idx = db.e2eeKeys.findIndex((k: any) => k && k.userId === user.id);
      if (idx >= 0) {
        db.e2eeKeys[idx].publicKeyPem = pem;
        db.e2eeKeys[idx].fingerprint = fingerprint;
        db.e2eeKeys[idx].updatedAt = Date.now();
      } else {
        db.e2eeKeys.push({
          userId: user.id,
          publicKeyPem: pem,
          fingerprint,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
      }
      saveDatabase(db);
      res.json({ success: true, fingerprint });
    } catch (e: any) {
      console.warn('[e2ee] key publish error:', e?.message || e);
      res.status(500).json({ error: 'Failed to publish E2EE key.' });
    }
  });

  // GET /api/e2ee/keys — list users who published keys (id, name, fingerprint)
  app.get('/api/e2ee/keys', requireAuth, (req, res) => {
    try {
      const user = (req as any).user;
      const db = loadDatabase();
      if (!Array.isArray(db.e2eeKeys)) db.e2eeKeys = [];
      const users = Array.isArray(db.users) ? db.users : [];
      const keys = db.e2eeKeys
        .filter((k: any) => k && k.userId && k.userId !== user.id)
        .map((k: any) => {
          const u = users.find((x: any) => x && x.id === k.userId);
          return {
            userId: k.userId,
            name: (u && (u.name || u.username)) || k.userId,
            fingerprint: k.fingerprint || fingerprintOf(k.publicKeyPem),
          };
        });
      res.json({ keys });
    } catch (e: any) {
      console.warn('[e2ee] key list error:', e?.message || e);
      res.status(500).json({ error: 'Failed to list E2EE keys.' });
    }
  });

  // GET /api/e2ee/keys/:userId — fetch a user's public key for key exchange (404 if none)
  app.get('/api/e2ee/keys/:userId', requireAuth, (req, res) => {
    try {
      const db = loadDatabase();
      if (!Array.isArray(db.e2eeKeys)) db.e2eeKeys = [];
      const key = db.e2eeKeys.find((k: any) => k && k.userId === req.params.userId);
      if (!key) {
        return res.status(404).json({ error: 'No E2EE key published for this user.' });
      }
      res.json({
        userId: key.userId,
        publicKeyPem: key.publicKeyPem,
        fingerprint: key.fingerprint || fingerprintOf(key.publicKeyPem),
      });
    } catch (e: any) {
      console.warn('[e2ee] key fetch error:', e?.message || e);
      res.status(500).json({ error: 'Failed to fetch E2EE key.' });
    }
  });

  // POST /api/e2ee/messages — store an encrypted message (opaque ciphertext only)
  app.post('/api/e2ee/messages', requireAuth, (req, res) => {
    try {
      const user = (req as any).user;
      const body = req.body || {};
      const toUserId = String(body.toUserId || '');
      if (!toUserId) return res.status(400).json({ error: 'toUserId is required.' });
      const ciphertext = String(body.ciphertext || '');
      const iv = String(body.iv || '');
      const wrappedKey = String(body.wrappedKey || '');
      if (!ciphertext || !iv || !wrappedKey) {
        return res.status(400).json({ error: 'ciphertext, iv and wrappedKey are required.' });
      }
      if (ciphertext.length > MAX_CIPHERTEXT_LEN || iv.length > MAX_IV_LEN || wrappedKey.length > MAX_WRAPPED_LEN) {
        return res.status(400).json({ error: 'Payload too large.' });
      }

      const db = loadDatabase();
      if (!Array.isArray(db.e2eeMessages)) db.e2eeMessages = [];
      const recipient = (db.users || []).find((u: any) => u && u.id === toUserId);
      if (!recipient) return res.status(404).json({ error: 'Recipient not found.' });

      const wrappedForSender = body.wrappedKeyForSender
        ? String(body.wrappedKeyForSender).slice(0, MAX_WRAPPED_LEN)
        : null;
      const fp = String(body.fromPublicKeyFingerprint || '').slice(0, MAX_FP_LEN);

      const message: E2EEMessage = {
        id: newMessageId(),
        fromId: user.id,
        toId: toUserId,
        ciphertext,
        iv,
        wrappedKey,
        wrappedKeyForSender: wrappedForSender,
        fromPublicKeyFingerprint: fp,
        createdAt: Date.now(),
        read: false,
      };
      db.e2eeMessages.push(message);
      saveDatabase(db);
      res.json({ message });
    } catch (e: any) {
      console.warn('[e2ee] message store error:', e?.message || e);
      res.status(500).json({ error: 'Failed to store encrypted message.' });
    }
  });

  // GET /api/e2ee/messages?with=:userId — my E2EE messages with a peer (both directions)
  app.get('/api/e2ee/messages', requireAuth, (req, res) => {
    try {
      const user = (req as any).user;
      const peer = String((req.query as any).with || '');
      if (!peer) return res.status(400).json({ error: '?with=<userId> is required.' });
      const db = loadDatabase();
      const messages = (db.e2eeMessages ?? [])
        .filter(
          (m: any) =>
            m &&
            ((m.fromId === user.id && m.toId === peer) || (m.fromId === peer && m.toId === user.id))
        )
        .sort((a: any, b: any) => (a.createdAt || 0) - (b.createdAt || 0));
      res.json({ messages, peer });
    } catch (e: any) {
      console.warn('[e2ee] messages list error:', e?.message || e);
      res.status(500).json({ error: 'Failed to load encrypted messages.' });
    }
  });

  // POST /api/e2ee/messages/:id/read — mark read (recipient only)
  app.post('/api/e2ee/messages/:id/read', requireAuth, (req, res) => {
    try {
      const user = (req as any).user;
      const db = loadDatabase();
      const message = (db.e2eeMessages ?? []).find((m: any) => m && m.id === req.params.id);
      if (!message) return res.status(404).json({ error: 'Message not found.' });
      if (message.toId !== user.id) {
        return res.status(403).json({ error: 'Only the recipient can mark this message read.' });
      }
      message.read = true;
      saveDatabase(db);
      res.json({ success: true, id: message.id, read: true });
    } catch (e: any) {
      console.warn('[e2ee] message read error:', e?.message || e);
      res.status(500).json({ error: 'Failed to mark message read.' });
    }
  });

  // GET /api/e2ee/status — my key state + contacts who have published keys
  app.get('/api/e2ee/status', requireAuth, (req, res) => {
    try {
      const user = (req as any).user;
      const db = loadDatabase();
      if (!Array.isArray(db.e2eeKeys)) db.e2eeKeys = [];
      const myKey = db.e2eeKeys.find((k: any) => k && k.userId === user.id);
      const users = Array.isArray(db.users) ? db.users : [];
      const contactsWithKeys = db.e2eeKeys
        .filter((k: any) => k && k.userId && k.userId !== user.id)
        .map((k: any) => {
          const u = users.find((x: any) => x && x.id === k.userId);
          return {
            userId: k.userId,
            name: (u && (u.name || u.username)) || k.userId,
            fingerprint: k.fingerprint || fingerprintOf(k.publicKeyPem),
          };
        });
      res.json({ hasKey: !!myKey, contactsWithKeys });
    } catch (e: any) {
      console.warn('[e2ee] status error:', e?.message || e);
      res.status(500).json({ error: 'Failed to load E2EE status.' });
    }
  });
}
