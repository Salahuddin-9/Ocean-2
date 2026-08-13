/**
 * Ocean — Elder Mode (Feature 204)
 * ---------------------------------
 * Senior-friendly theme: large fonts, high-contrast, simplified navigation.
 * The visual theme is applied client-side (a `elder-mode` CSS class); this
 * backend persists the preference per user so it survives across devices.
 *
 * Model (global db): db.userPrefs — map userId -> { elderMode: boolean, ... }
 *
 * Routes:
 *   GET  /api/prefs/elder-mode   (auth) current preference (default false)
 *   POST /api/prefs/elder-mode   (auth) { enabled: boolean }
 */

import express from 'express';
import { getCtx } from './turtleServerContext';

function ensureCollection(db: any): void {
  if (!db.userPrefs || typeof db.userPrefs !== 'object') db.userPrefs = {};
}

export function registerElderModeRoutes(app: express.Express): void {
  const { requireAuth, loadDatabase, saveDatabase } = getCtx();

  app.get('/api/prefs/elder-mode', requireAuth, (req, res) => {
    const user = (req as any).user;
    const db = loadDatabase();
    ensureCollection(db);
    res.json({ enabled: Boolean(db.userPrefs[user.id]?.elderMode) });
  });

  app.post('/api/prefs/elder-mode', requireAuth, (req, res) => {
    const user = (req as any).user;
    const enabled = Boolean((req.body || {}).enabled);
    const db = loadDatabase();
    ensureCollection(db);
    if (!db.userPrefs[user.id]) db.userPrefs[user.id] = {};
    db.userPrefs[user.id].elderMode = enabled;
    saveDatabase(db);
    res.json({ enabled });
  });
}
