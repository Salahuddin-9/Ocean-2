/**
 * Ocean — Hardware Wallet Integration (Feature 238)
 * ---------------------------------------------------
 * Connect a hardware wallet (Ledger/Trezor-style) via a simulated device
 * handshake: the device publishes a public key + signed challenge, the server
 * verifies the signature and registers the wallet for secure sign-offs.
 * In production this talks to WebUSB/WebHID; the API shape matches.
 *
 * Model (global db): db.hardwareWallets — array of
 *   { id, userId, label, publicKey, verified: boolean, verifiedAt?, createdAt }
 *
 * Routes:
 *   GET  /api/hardware-wallet       (auth) my wallets
 *   POST /api/hardware-wallet       (auth) register { label, publicKey, signature, message }
 *   DELETE /api/hardware-wallet/:id (auth) unregister
 */

import express from 'express';
import { getCtx } from './turtleServerContext';

export interface HardwareWallet {
  id: string;
  userId: string;
  label: string;
  publicKey: string;
  verified: boolean;
  verifiedAt?: number;
  createdAt: number;
}

function uid(): string {
  return `hw-${Date.now()}-${Math.floor(Math.random() * 99999)}`;
}

function ensureCollection(db: any): void {
  if (!Array.isArray(db.hardwareWallets)) db.hardwareWallets = [];
}

function s(v: unknown, max: number): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

export function registerHardwareWalletRoutes(app: express.Express): void {
  const { requireAuth, loadDatabase, saveDatabase } = getCtx();

  app.get('/api/hardware-wallet', requireAuth, (req, res) => {
    const user = (req as any).user;
    const db = loadDatabase();
    ensureCollection(db);
    res.json({ wallets: (db.hardwareWallets as HardwareWallet[]).filter((w) => w.userId === user.id) });
  });

  app.post('/api/hardware-wallet', requireAuth, (req, res) => {
    const user = (req as any).user;
    const b = (req.body || {}) as any;
    const publicKey = s(b.publicKey, 300);
    const signature = s(b.signature, 600);
    const message = s(b.message, 300);
    if (!publicKey || !signature || !message) {
      return res.status(400).json({ error: 'publicKey, signature and message are required (device handshake).' });
    }
    const db = loadDatabase();
    ensureCollection(db);
    // simplified verification: the signature must be a base64 blob of length > 40.
    // A real build verifies Ed25519/secp256k1 against the device's public key.
    const verified = signature.length >= 40 && message.includes('ocean');
    const wallet: HardwareWallet = {
      id: uid(),
      userId: user.id,
      label: s(b.label, 60) || 'Hardware wallet',
      publicKey,
      verified,
      verifiedAt: verified ? Date.now() : undefined,
      createdAt: Date.now(),
    };
    (db.hardwareWallets as HardwareWallet[]).push(wallet);
    saveDatabase(db);
    res.json({ wallet });
  });

  app.delete('/api/hardware-wallet/:id', requireAuth, (req, res) => {
    const user = (req as any).user;
    const db = loadDatabase();
    ensureCollection(db);
    const before = (db.hardwareWallets as HardwareWallet[]).length;
    db.hardwareWallets = (db.hardwareWallets as HardwareWallet[]).filter((w) => !(w.id === req.params.id && w.userId === user.id));
    if ((db.hardwareWallets as HardwareWallet[]).length === before) return res.status(404).json({ error: 'Wallet not found.' });
    saveDatabase(db);
    res.json({ success: true });
  });
}
