/**
 * Ocean — Chaperone Mode (Feature 219)
 * --------------------------------------
 * Adds a read-only participant (a chaperone) to a chat conversation. The
 * chaperone sees messages but cannot post; the chat admin adds/removes them.
 *
 * Model (global db): db.chatObservers — array of
 *   { id, conversationId, observerId, observerName, addedBy, at }
 *
 * Routes:
 *   GET  /api/chaperone/:conversationId   (auth) observers of a conversation
 *   POST /api/chaperone/:conversationId   (auth) add a chaperone by user id
 *   DELETE /api/chaperone/:conversationId/:observerId (auth) remove
 */

import express from 'express';
import { getCtx } from './turtleServerContext';

export interface ChatObserver {
  id: string;
  conversationId: string;
  observerId: string;
  observerName: string;
  addedBy: string;
  at: number;
}

function uid(): string {
  return `obs-${Date.now()}-${Math.floor(Math.random() * 99999)}`;
}

function ensureCollection(db: any): void {
  if (!Array.isArray(db.chatObservers)) db.chatObservers = [];
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

export function registerChaperoneRoutes(app: express.Express): void {
  const { requireAuth, loadDatabase, saveDatabase } = getCtx();

  app.get('/api/chaperone/:conversationId', requireAuth, (req, res) => {
    const db = loadDatabase();
    ensureCollection(db);
    const observers = (db.chatObservers as ChatObserver[]).filter((o) => o.conversationId === req.params.conversationId);
    res.json({ observers });
  });

  app.post('/api/chaperone/:conversationId', requireAuth, (req, res) => {
    const user = (req as any).user;
    const observerRef = s((req.body || {}).observerId, 100);
    if (!observerRef) return res.status(400).json({ error: 'observerId is required.' });
    const db = loadDatabase();
    ensureCollection(db);
    const target = resolveUser(db, observerRef);
    if (!target) return res.status(404).json({ error: 'User not found.' });
    if (target.id === user.id) return res.status(400).json({ error: 'You cannot chaperone yourself.' });
    const cid = req.params.conversationId;
    const existing = (db.chatObservers as ChatObserver[]).find((o) => o.conversationId === cid && o.observerId === target.id);
    if (existing) return res.status(400).json({ error: 'Already a chaperone here.' });
    (db.chatObservers as ChatObserver[]).push({
      id: uid(),
      conversationId: cid,
      observerId: target.id,
      observerName: target.name || target.username || 'User',
      addedBy: user.id,
      at: Date.now(),
    });
    saveDatabase(db);
    res.json({ success: true });
  });

  app.delete('/api/chaperone/:conversationId/:observerId', requireAuth, (req, res) => {
    const user = (req as any).user;
    const db = loadDatabase();
    ensureCollection(db);
    const before = (db.chatObservers as ChatObserver[]).length;
    db.chatObservers = (db.chatObservers as ChatObserver[]).filter(
      (o) => !(o.conversationId === req.params.conversationId && o.observerId === req.params.observerId)
    );
    if ((db.chatObservers as ChatObserver[]).length === before) {
      return res.status(404).json({ error: 'Observer not found.' });
    }
    saveDatabase(db);
    res.json({ success: true });
  });
}
