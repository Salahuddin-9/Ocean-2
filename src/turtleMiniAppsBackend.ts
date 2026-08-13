/**
 * Ocean — Mini Apps Platform backend (feature #253)
 * -------------------------------------------------
 * Register + serve sandboxed iframe mini-apps with a postMessage API, wallet
 * purchases (30% platform commission), and a per-app event relay buffer:
 *
 *   GET  /api/miniapps                list apps (+ installed flag, install counts)
 *   POST /api/miniapps                register an app (developer)
 *   GET  /api/miniapps/mine           apps I developed
 *   GET  /api/miniapps/:id            app manifest (permissions, apiVersion)
 *   POST /api/miniapps/:id/install    install an app
 *   POST /api/miniapps/:id/uninstall  remove install
 *   POST /api/miniapps/:id/purchase   in-app purchase { productId, amount } → 70/30 split
 *   POST /api/miniapps/:id/events     relay an event { to: 'parent'|'app', type, payload }
 *   GET  /api/miniapps/:id/events     poll events addressed to 'app' since ?after=N
 *   DELETE /api/miniapps/:id          developer deletes their app
 *
 * State lives in miniapps.json; coins live in community.json (wallet).
 */
import express from 'express';
import { getCtx } from './turtleServerContext';
import { makeJsonStore } from './turtleJsonStore';
import { addBalance, spendBalance } from './turtleCommunityBackend';

export interface MiniApp {
  id: string;
  name: string;
  developerId: string;
  developerName: string;
  description: string;
  bundleUrl: string;
  icon: string;
  price: number;
  permissions: string[];
  installedBy: string[];
  ratingSum: number;
  ratingCount: number;
  createdAt: number;
}

export interface MiniAppEvent {
  id: number;
  appId: string;
  to: 'parent' | 'app';
  type: string;
  payload: unknown;
  at: number;
}

interface MiniAppsStore {
  apps: MiniApp[];
  events: MiniAppEvent[];
  commissions: { appId: string; amount: number; at: number }[];
}

const VALID_PERMISSIONS = ['wallet', 'camera', 'location', 'clipboard', 'storage'];
const PLATFORM_CUT = 0.3;

const store = makeJsonStore<MiniAppsStore>('miniapps.json', () => ({ apps: [], events: [], commissions: [] }));

function uid(): string {
  return `app-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

export function registerMiniAppsRoutes(app: express.Express) {
  const { requireAuth, loadCommunity, saveCommunity, loadDatabase } = getCtx();

  const evtId = () => {
    const s = store.load();
    const next = s.events.length ? s.events[s.events.length - 1].id + 1 : 1;
    return next;
  };

  // --- List apps ------------------------------------------------------------------
  app.get('/api/miniapps', requireAuth, (req, res) => {
    const me = (req as any).user;
    const apps = store.load().apps
      .map((a) => ({ ...a, installed: a.installedBy.includes(me.id), isMine: a.developerId === me.id, installs: a.installedBy.length, rating: a.ratingCount ? +(a.ratingSum / a.ratingCount).toFixed(1) : 0 }))
      .sort((a, b) => b.installs - a.installs);
    res.json({ apps });
  });

  // --- Register an app ---------------------------------------------------------------
  app.post('/api/miniapps', requireAuth, (req, res) => {
    const me = (req as any).user;
    const name = String(req.body?.name || '').trim().slice(0, 40);
    const bundleUrl = String(req.body?.bundleUrl || '').trim().slice(0, 300);
    const description = String(req.body?.description || '').trim().slice(0, 200);
    const icon = String(req.body?.icon || '🧩').slice(0, 4);
    const price = Math.max(0, Math.floor(Number(req.body?.price) || 0));
    if (!name || !bundleUrl) return res.status(400).json({ error: 'name and bundleUrl are required.' });
    let url: URL;
    try { url = new URL(bundleUrl); } catch { return res.status(400).json({ error: 'bundleUrl must be a valid https URL.' }); }
    if (url.protocol !== 'https:') return res.status(400).json({ error: 'bundleUrl must be https.' });
    const permissions: string[] = Array.isArray(req.body?.permissions)
      ? req.body.permissions.filter((p: string) => VALID_PERMISSIONS.includes(p)).slice(0, 5)
      : [];
    const db = loadDatabase();
    const dev = (db?.users || []).find((u: any) => u.id === me.id);
    const myapp: MiniApp = {
      id: uid(), name, developerId: me.id, developerName: dev?.name || me.name || me.username || 'Developer',
      description, bundleUrl: url.toString(), icon, price, permissions,
      installedBy: [me.id], ratingSum: 0, ratingCount: 0, createdAt: Date.now(),
    };
    store.load().apps.unshift(myapp);
    store.persist();
    res.json({ app: myapp });
  });

  // --- My apps ------------------------------------------------------------------------
  app.get('/api/miniapps/mine', requireAuth, (req, res) => {
    const me = (req as any).user;
    const apps = store.load().apps.filter((a) => a.developerId === me.id);
    res.json({ apps });
  });

  // --- Manifest --------------------------------------------------------------------------
  app.get('/api/miniapps/:id', requireAuth, (req, res) => {
    const app = store.load().apps.find((a) => a.id === req.params.id);
    if (!app) return res.status(404).json({ error: 'App not found.' });
    res.json({
      manifest: {
        id: app.id, name: app.name, developerName: app.developerName, description: app.description,
        bundleUrl: app.bundleUrl, icon: app.icon, price: app.price, permissions: app.permissions,
        apiVersion: '1.0', postMessageApi: ['ocean:pay', 'ocean:event', 'ocean:ready', 'ocean:storage'],
      },
    });
  });

  // --- Install / uninstall ----------------------------------------------------------------
  app.post('/api/miniapps/:id/install', requireAuth, (req, res) => {
    const me = (req as any).user;
    const app = store.load().apps.find((a) => a.id === req.params.id);
    if (!app) return res.status(404).json({ error: 'App not found.' });
    if (!app.installedBy.includes(me.id)) app.installedBy.push(me.id);
    store.persist();
    res.json({ installed: true, installs: app.installedBy.length });
  });

  app.post('/api/miniapps/:id/uninstall', requireAuth, (req, res) => {
    const me = (req as any).user;
    const app = store.load().apps.find((a) => a.id === req.params.id);
    if (!app) return res.status(404).json({ error: 'App not found.' });
    app.installedBy = app.installedBy.filter((u) => u !== me.id);
    store.persist();
    res.json({ installed: false, installs: app.installedBy.length });
  });

  // --- In-app purchase (70/30) ---------------------------------------------------------------
  app.post('/api/miniapps/:id/purchase', requireAuth, (req, res) => {
    const me = (req as any).user;
    const app = store.load().apps.find((a) => a.id === req.params.id);
    if (!app) return res.status(404).json({ error: 'App not found.' });
    const amount = Math.max(1, Math.floor(Number(req.body?.amount) || 0));
    if (!amount) return res.status(400).json({ error: 'Purchase amount is required.' });
    const community = loadCommunity();
    if (!spendBalance(community, me.id, amount)) {
      saveCommunity(community);
      return res.status(402).json({ error: `You need ${amount} coins (balance ${community.balances[me.id] || 0}).` });
    }
    const devShare = Math.floor(amount * (1 - PLATFORM_CUT));
    const commission = amount - devShare;
    addBalance(community, app.developerId, devShare);
    saveCommunity(community);
    store.load().commissions.push({ appId: app.id, amount: commission, at: Date.now() });
    store.persist();
    res.json({
      ok: true,
      productId: req.body?.productId || null,
      amount,
      developerShare: devShare,
      platformCommission: commission,
      balance: community.balances[me.id] || 0,
    });
  });

  // --- Event relay ------------------------------------------------------------------------------
  app.post('/api/miniapps/:id/events', requireAuth, (req, res) => {
    const me = (req as any).user;
    const app = store.load().apps.find((a) => a.id === req.params.id);
    if (!app) return res.status(404).json({ error: 'App not found.' });
    const to = req.body?.to === 'app' ? 'app' : 'parent';
    // Only users who installed the app (or own it) may inject events INTO the running iframe
    // (prevents forging e.g. fake ocean:payment success messages to other users' viewers).
    if (to === 'app' && !app.installedBy.includes(me.id) && app.developerId !== me.id) {
      return res.status(403).json({ error: 'You must install this app before sending it events.' });
    }
    const type = String(req.body?.type || 'event').slice(0, 60);
    const ev: MiniAppEvent = { id: evtId(), appId: app.id, to, type, payload: req.body?.payload ?? null, at: Date.now() };
    store.load().events.push(ev);
    if (store.load().events.length > 2000) store.load().events.splice(0, store.load().events.length - 2000);
    store.persist();
    res.json({ event: ev });
  });

  app.get('/api/miniapps/:id/events', requireAuth, (req, res) => {
    const after = Number(req.query.after) || 0;
    const events = store.load().events.filter((e) => e.appId === req.params.id && e.to === 'app' && e.id > after).slice(0, 50);
    res.json({ events });
  });

  // --- Rate an app -------------------------------------------------------------------------------
  app.post('/api/miniapps/:id/rate', requireAuth, (req, res) => {
    const app = store.load().apps.find((a) => a.id === req.params.id);
    if (!app) return res.status(404).json({ error: 'App not found.' });
    const stars = Math.max(1, Math.min(5, Math.floor(Number(req.body?.stars) || 0)));
    app.ratingSum += stars;
    app.ratingCount += 1;
    store.persist();
    res.json({ rating: +(app.ratingSum / app.ratingCount).toFixed(1), ratingCount: app.ratingCount });
  });

  // --- Developer delete ------------------------------------------------------------------------------
  app.delete('/api/miniapps/:id', requireAuth, (req, res) => {
    const me = (req as any).user;
    const s = store.load();
    const idx = s.apps.findIndex((a) => a.id === req.params.id && a.developerId === me.id);
    if (idx === -1) return res.status(404).json({ error: 'App not found or not yours.' });
    s.apps.splice(idx, 1);
    store.persist();
    res.json({ ok: true });
  });
}
