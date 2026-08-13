/**
 * Ocean — Story Chains (Feature 163)
 * ----------------------------------
 * Chain stories: a user starts a story with a topic, others append entries.
 * Each addition is stored as its own entry (post) carrying the shared chainId —
 * exactly the "separate post with chainId" model from the spec.
 *
 * Model (global db, idempotent ensure):
 *   db.storyChains — array of { id, title, topic, createdBy, createdByName, status,
 *                      entries: {id,authorId,authorName,text,at}[], maxLength, createdAt }
 *
 * Routes:
 *   POST /api/chains               (auth) { title } -> create
 *   POST /api/chains/:id/add       (auth) { text } -> append entry
 *   GET  /api/chains               (guest) list with entry counts
 *   GET  /api/chains/:id           (guest) full chain
 */

import express from 'express';
import { getCtx } from './turtleServerContext';

export interface ChainEntry {
  id: string;
  authorId: string;
  authorName: string;
  text: string;
  at: number;
}

export interface StoryChain {
  id: string;
  title: string;
  createdBy: string;
  createdByName: string;
  status: 'open' | 'complete';
  entries: ChainEntry[];
  maxLength: number;
  createdAt: number;
}

const DEFAULT_MAX_LENGTH = 20;

function uid(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 99999)}`;
}

function ensureCollection(db: any): void {
  if (!Array.isArray(db.storyChains)) db.storyChains = [];
}

function userName(db: any, u: any): string {
  return u?.name || u?.username || 'User';
}

export function registerStoryChainRoutes(app: express.Express): void {
  const { requireAuth, loadDatabase, saveDatabase } = getCtx();

  // POST /api/chains — start a chain
  app.post('/api/chains', requireAuth, (req, res) => {
    const user = (req as any).user;
    const title = String((req.body || {}).title || '').trim();
    if (title.length < 3) return res.status(400).json({ error: 'Title must be at least 3 characters.' });

    const db = loadDatabase();
    ensureCollection(db);
    const chain: StoryChain = {
      id: uid('chain'),
      title: title.slice(0, 160),
      createdBy: user.id,
      createdByName: userName(db, user),
      status: 'open',
      entries: [],
      maxLength: DEFAULT_MAX_LENGTH,
      createdAt: Date.now(),
    };
    (db.storyChains as StoryChain[]).unshift(chain);
    saveDatabase(db);
    res.json({ chain });
  });

  // POST /api/chains/:id/add — append an entry
  app.post('/api/chains/:id/add', requireAuth, (req, res) => {
    const user = (req as any).user;
    const text = String((req.body || {}).text || '').trim();
    if (text.length < 2) return res.status(400).json({ error: 'Entry text is too short.' });

    const db = loadDatabase();
    ensureCollection(db);
    const chain = (db.storyChains as StoryChain[]).find((c) => c.id === req.params.id);
    if (!chain) return res.status(404).json({ error: 'Chain not found.' });
    if (chain.status !== 'open') return res.status(400).json({ error: 'This chain is complete.' });
    if (chain.entries.length >= chain.maxLength) {
      chain.status = 'complete';
      saveDatabase(db);
      return res.status(400).json({ error: 'This chain reached its length limit.' });
    }
    // Soft limit: no single author dominates a chain (max 4 entries each).
    const mine = chain.entries.filter((e) => e.authorId === user.id).length;
    if (mine >= 4) return res.status(400).json({ error: 'Chains need many voices — you have contributed 4 entries already.' });

    chain.entries.push({ id: uid('entry'), authorId: user.id, authorName: userName(db, user), text: text.slice(0, 2000), at: Date.now() });
    if (chain.entries.length >= chain.maxLength) chain.status = 'complete';
    saveDatabase(db);
    res.json({ chain });
  });

  // GET /api/chains — open chains with counts
  app.get('/api/chains', (req, res) => {
    const db = loadDatabase();
    ensureCollection(db);
    const chains = (db.storyChains as StoryChain[])
      .filter((c) => c.status === 'open')
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 50)
      .map((c) => ({ ...c, entryCount: c.entries.length }));
    res.json({ chains });
  });

  // GET /api/chains/:id
  app.get('/api/chains/:id', (req, res) => {
    const db = loadDatabase();
    ensureCollection(db);
    const chain = (db.storyChains as StoryChain[]).find((c) => c.id === req.params.id);
    if (!chain) return res.status(404).json({ error: 'Chain not found.' });
    res.json({ chain });
  });
}
