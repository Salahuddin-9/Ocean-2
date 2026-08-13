/**
 * Ocean — Quantum-Resistant Cryptography (Feature 240)
 * ------------------------------------------------------
 * Hybrid post-quantum E2EE seam: clients register a hybrid public key (real
 * X25519 + a Kyber-768 KEM, see src/components/QuantumCrypto.tsx) and exchange
 * an encapsulated symmetric key through the server — the server only ever
 * relays ciphertext, never plaintext.
 *
 * Production notes: the client's Kyber-768 leg is a documented *simulation*
 * (drop-in liboqs/kyber-js WebAssembly for true ML-KEM). The API shape
 * (register / key-exchange / send / receive) matches the final contract so the
 * client can upgrade in place.
 *
 * Model (global db):
 *   db.pqKeys        — { id, userId, kyberPublicKey, kyberCiphertext, at }
 *   db.pqMessages    — { id, fromId, toId, ct, nonce, at, read }
 *
 * Routes:
 *   GET  /api/pq/keys            (auth) my registered PQ keys
 *   POST /api/pq/keys            (auth) register { kyberPublicKey }
 *   POST /api/pq/exchange        (auth) { toUserId } -> returns recipient's pubkey
 *   POST /api/pq/messages        (auth) { toUserId, ct, nonce } relay a PQ-ciphertext message
 *   GET  /api/pq/messages        (auth) my incoming PQ messages
 */

import express from 'express';
import { getCtx } from './turtleServerContext';

export interface PQKey {
  id: string;
  userId: string;
  kyberPublicKey: string;
  at: number;
}

export interface PQMessage {
  id: string;
  fromId: string;
  toId: string;
  ct: string;
  nonce: string;
  at: number;
  read: boolean;
}

function uid(p: string): string {
  return `${p}-${Date.now()}-${Math.floor(Math.random() * 99999)}`;
}

function ensureCollection(db: any): void {
  if (!Array.isArray(db.pqKeys)) db.pqKeys = [];
  if (!Array.isArray(db.pqMessages)) db.pqMessages = [];
}

function s(v: unknown, max: number): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

export function registerQuantumCryptoRoutes(app: express.Express): void {
  const { requireAuth, loadDatabase, saveDatabase } = getCtx();

  app.get('/api/pq/keys', requireAuth, (req, res) => {
    const user = (req as any).user;
    const db = loadDatabase();
    ensureCollection(db);
    res.json({ keys: (db.pqKeys as PQKey[]).filter((k) => k.userId === user.id) });
  });

  app.post('/api/pq/keys', requireAuth, (req, res) => {
    const user = (req as any).user;
    const b = (req.body || {}) as any;
    const kyberPublicKey = s(b.kyberPublicKey, 2000);
    if (!kyberPublicKey) return res.status(400).json({ error: 'kyberPublicKey is required.' });
    const db = loadDatabase();
    ensureCollection(db);
    (db.pqKeys as PQKey[]) = (db.pqKeys as PQKey[]).filter((k) => k.userId !== user.id);
    const key: PQKey = {
      id: uid('pqk'),
      userId: user.id,
      kyberPublicKey,
      at: Date.now(),
    };
    (db.pqKeys as PQKey[]).push(key);
    saveDatabase(db);
    res.json({ key, note: 'ML-KEM public key registered — server only stores the public half.' });
  });

  app.post('/api/pq/exchange', requireAuth, (req, res) => {
    const user = (req as any).user;
    const b = (req.body || {}) as any;
    const toUserId = s(b.toUserId, 100);
    if (!toUserId) return res.status(400).json({ error: 'toUserId is required.' });
    const db = loadDatabase();
    ensureCollection(db);
    const target = (db.pqKeys as PQKey[]).find((k) => k.userId === toUserId);
    if (!target) return res.status(404).json({ error: 'Recipient has no registered PQ key yet.' });
    res.json({ publicKey: target.kyberPublicKey, toUserId });
  });

  app.post('/api/pq/messages', requireAuth, (req, res) => {
    const user = (req as any).user;
    const b = (req.body || {}) as any;
    const toUserId = s(b.toUserId, 100);
    const ct = s(b.ct, 8000);
    const nonce = s(b.nonce, 300);
    if (!toUserId || !ct) return res.status(400).json({ error: 'toUserId and ct are required.' });
    const db = loadDatabase();
    ensureCollection(db);
    const msg: PQMessage = {
      id: uid('pqm'),
      fromId: user.id,
      toId: toUserId,
      ct,
      nonce,
      at: Date.now(),
      read: false,
    };
    (db.pqMessages as PQMessage[]).push(msg);
    saveDatabase(db);
    res.json({ message: msg, note: 'Ciphertext relayed — server never sees plaintext.' });
  });

  app.get('/api/pq/messages', requireAuth, (req, res) => {
    const user = (req as any).user;
    const db = loadDatabase();
    ensureCollection(db);
    const msgs = (db.pqMessages as PQMessage[])
      .filter((m) => m.toId === user.id)
      .sort((a, b) => b.at - a.at)
      .slice(0, 100);
    (db.pqMessages as PQMessage[]).forEach((m) => {
      if (m.toId === user.id) m.read = true;
    });
    saveDatabase(db);
    res.json({ messages: msgs });
  });
}
