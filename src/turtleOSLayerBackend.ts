/**
 * Ocean — Ocean OS Layer backend (feature #259)
 * ----------------------------------------------
 * Infrastructure layer: A/B testing (deterministic variant assignment + metric
 * tracking), feature flags (rollout %, user/group overrides) and a simulated
 * multi-region edge (x-region header → regional replica + latency).
 *
 * Admin routes (user.isAdmin or MASTER_KEY) create/toggle; assignment &
 * evaluation are available to every user:
 *   POST /api/os/experiments                (admin) create experiment
 *   GET  /api/os/experiments                (admin) list experiments + stats
 *   POST /api/os/experiments/:id/assign     assign current user (deterministic)
 *   GET  /api/os/my-assignments             my variant per experiment
 *   POST /api/os/experiments/:id/metrics    track { metric, delta } against my variant
 *   GET  /api/os/experiments/:id/stats      variant metrics + participation
 *   POST /api/os/flags                      (admin) create / update flag
 *   GET  /api/os/flags                      list flags
 *   GET  /api/os/flags/evaluate             my flag states (rollout + group + override)
 *   POST /api/os/flags/:id/override         (admin) per-user override
 *   GET  /api/os/region                     simulated region routing
 * State lives in oslayer.json.
 */
import express from 'express';
import { getCtx } from './turtleServerContext';
import { makeJsonStore } from './turtleJsonStore';

export interface Experiment {
  id: string;
  name: string;
  description: string;
  variants: { id: string; name: string; weight: number }[];
  audiencePct: number;
  enabled: boolean;
  assignments: Record<string, string>;
  metrics: Record<string, Record<string, number>>; // metric -> variantId -> count
  createdAt: number;
}

export interface FeatureFlag {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  rolloutPct: number;
  targetGroup: string; // 'everyone' | 'admins' | 'beta'
  overrides: Record<string, boolean>;
  createdAt: number;
}

interface OSStore { experiments: Experiment[]; flags: FeatureFlag[]; eventLog: { at: number; type: string; userId: string; note: string }[] }

const store = makeJsonStore<OSStore>('oslayer.json', () => ({ experiments: [], flags: [], eventLog: [] }));

function uid(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

function hashId(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

const REGIONS = [
  { region: 'ap-south-1', replica: 'ocean-edge-dhaka', latencyMs: 12 },
  { region: 'ap-southeast-1', replica: 'ocean-edge-singapore', latencyMs: 34 },
  { region: 'eu-central-1', replica: 'ocean-edge-frankfurt', latencyMs: 180 },
  { region: 'us-east-1', replica: 'ocean-edge-virginia', latencyMs: 230 },
];

export function registerOSLayerRoutes(app: express.Express) {
  const { requireAuth, requireAdmin } = getCtx();

  const log = (type: string, userId: string, note: string) => {
    const s = store.load();
    s.eventLog.push({ at: Date.now(), type, userId, note });
    if (s.eventLog.length > 1000) s.eventLog.splice(0, s.eventLog.length - 1000);
  };

  const isAdmin = (req: express.Request) => {
    const u = (req as any).user;
    return !!(u && (u.isAdmin || u.role === 'admin'));
  };

  // --- Experiments --------------------------------------------------------------------
  app.post('/api/os/experiments', requireAuth, requireAdmin, (req, res) => {
    const name = String(req.body?.name || '').trim().slice(0, 60);
    const description = String(req.body?.description || '').slice(0, 200);
    const variants = Array.isArray(req.body?.variants) ? req.body.variants.slice(0, 6) : [];
    const audiencePct = Math.max(1, Math.min(100, Number(req.body?.audiencePct) || 100));
    if (!name || variants.length < 2) return res.status(400).json({ error: 'Name and at least 2 variants are required.' });
    const exp: Experiment = {
      id: uid('exp'), name, description,
      variants: variants.map((v: any, i: number) => ({ id: `v${i}`, name: String(v?.name || `Variant ${i + 1}`).slice(0, 40), weight: Math.max(1, Number(v?.weight) || 1) })),
      audiencePct, enabled: true, assignments: {}, metrics: {}, createdAt: Date.now(),
    };
    store.load().experiments.unshift(exp);
    store.persist();
    res.json({ experiment: exp });
  });

  app.get('/api/os/experiments', requireAuth, requireAdmin, (_req, res) => {
    res.json({
      experiments: store.load().experiments.map((e) => {
        const participantCount = Object.keys(e.assignments).length;
        const stats = Object.fromEntries(Object.entries(e.metrics).map(([metric, byVariant]) => [metric, byVariant]));
        return { ...e, participantCount, stats };
      }),
    });
  });

  app.post('/api/os/experiments/:id/assign', requireAuth, (req, res) => {
    const me = (req as any).user;
    const exp = store.load().experiments.find((e) => e.id === req.params.id);
    if (!exp) return res.status(404).json({ error: 'Experiment not found.' });
    if (!exp.enabled) return res.json({ assigned: false, variantId: null, note: 'Experiment disabled.' });
    const h = hashId(exp.id + ':' + me.id);
    if ((h % 100) >= exp.audiencePct) {
      log('exp-excluded', me.id, exp.name);
      return res.json({ assigned: false, variantId: null, note: 'Not in the audience for this experiment.' });
    }
    if (!exp.assignments[me.id]) {
      const totalW = exp.variants.reduce((a, v) => a + v.weight, 0);
      let r = h % totalW;
      let variantId = exp.variants[0].id;
      for (const v of exp.variants) { if (r < v.weight) { variantId = v.id; break; } r -= v.weight; }
      exp.assignments[me.id] = variantId;
      store.persist();
      log('exp-assigned', me.id, `${exp.name} → ${variantId}`);
    }
    const variant = exp.variants.find((v) => v.id === exp.assignments[me.id]);
    res.json({ assigned: true, experimentId: exp.id, name: exp.name, variantId: variant?.id, variantName: variant?.name });
  });

  app.get('/api/os/my-assignments', requireAuth, (req, res) => {
    const me = (req as any).user;
    const assignments = store.load().experiments
      .filter((e) => e.assignments[me.id])
      .map((e) => ({ experimentId: e.id, name: e.name, variantId: e.assignments[me.id], variantName: e.variants.find((v) => v.id === e.assignments[me.id])?.name }));
    res.json({ assignments });
  });

  app.post('/api/os/experiments/:id/metrics', requireAuth, (req, res) => {
    const me = (req as any).user;
    const exp = store.load().experiments.find((e) => e.id === req.params.id);
    if (!exp) return res.status(404).json({ error: 'Experiment not found.' });
    const metric = String(req.body?.metric || '').slice(0, 40);
    const delta = Number(req.body?.delta) || 1;
    if (!metric) return res.status(400).json({ error: 'metric is required.' });
    const variantId = exp.assignments[me.id] || 'unassigned';
    exp.metrics[metric] = exp.metrics[metric] || {};
    exp.metrics[metric][variantId] = (exp.metrics[metric][variantId] || 0) + delta;
    store.persist();
    res.json({ metric, variantId, value: exp.metrics[metric][variantId] });
  });

  app.get('/api/os/experiments/:id/stats', requireAuth, requireAdmin, (req, res) => {
    const exp = store.load().experiments.find((e) => e.id === req.params.id);
    if (!exp) return res.status(404).json({ error: 'Experiment not found.' });
    const byVariant = new Map<string, number>();
    Object.values(exp.assignments).forEach((v) => byVariant.set(v, (byVariant.get(v) || 0) + 1));
    res.json({
      experiment: exp,
      participantCount: Object.keys(exp.assignments).length,
      variantCounts: [...byVariant.entries()].map(([variantId, count]) => ({ variantId, count, variantName: exp.variants.find((v) => v.id === variantId)?.name })),
      metrics: exp.metrics,
    });
  });

  // --- Feature flags --------------------------------------------------------------------------
  app.post('/api/os/flags', requireAuth, requireAdmin, (req, res) => {
    const id = String(req.body?.id || '').trim();
    const name = String(req.body?.name || '').trim().slice(0, 60);
    const flagId = id || name.toLowerCase().replace(/[^a-z0-9]/g, '-');
    if (!name) return res.status(400).json({ error: 'Flag name is required.' });
    const s = store.load();
    let flag = s.flags.find((f) => f.id === flagId);
    if (flag) {
      flag.name = name;
      flag.description = String(req.body?.description || flag.description).slice(0, 200);
      flag.enabled = req.body?.enabled !== false;
      flag.rolloutPct = Math.max(0, Math.min(100, Number(req.body?.rolloutPct) ?? flag.rolloutPct));
      flag.targetGroup = ['everyone', 'admins', 'beta'].includes(req.body?.targetGroup) ? req.body.targetGroup : flag.targetGroup;
    } else {
      flag = {
        id: flagId, name,
        description: String(req.body?.description || '').slice(0, 200),
        enabled: req.body?.enabled !== false,
        rolloutPct: Math.max(0, Math.min(100, Number(req.body?.rolloutPct) ?? 100)),
        targetGroup: ['everyone', 'admins', 'beta'].includes(req.body?.targetGroup) ? req.body.targetGroup : 'everyone',
        overrides: {}, createdAt: Date.now(),
      };
      s.flags.push(flag);
    }
    store.persist();
    res.json({ flag });
  });

  app.get('/api/os/flags', requireAuth, (_req, res) => {
    res.json({ flags: store.load().flags });
  });

  app.get('/api/os/flags/evaluate', requireAuth, (req, res) => {
    const me = (req as any).user;
    const results = store.load().flags.map((f) => {
      if (f.overrides[me.id] !== undefined) return { id: f.id, name: f.name, on: f.overrides[me.id], source: 'override' };
      if (!f.enabled) return { id: f.id, name: f.name, on: false, source: 'disabled' };
      if (f.targetGroup === 'admins' && !isAdmin(req)) return { id: f.id, name: f.name, on: false, source: 'group' };
      if (f.targetGroup === 'beta' && !me.beta) return { id: f.id, name: f.name, on: false, source: 'group' };
      const on = hashId(f.id + ':' + me.id) % 100 < f.rolloutPct;
      return { id: f.id, name: f.name, on, source: 'rollout' };
    });
    res.json({ flags: results });
  });

  app.post('/api/os/flags/:id/override', requireAuth, requireAdmin, (req, res) => {
    const me = (req as any).user;
    const flag = store.load().flags.find((f) => f.id === req.params.id);
    if (!flag) return res.status(404).json({ error: 'Flag not found.' });
    const userId = String(req.body?.userId || '');
    if (!userId) return res.status(400).json({ error: 'userId is required.' });
    if (req.body?.value === null || req.body?.value === undefined) delete flag.overrides[userId];
    else flag.overrides[userId] = !!req.body.value;
    store.persist();
    log('flag-override', me.id, `${flag.name} → ${userId}`);
    res.json({ flag });
  });

  // --- Multi-region (simulated edge) ------------------------------------------------------------
  app.get('/api/os/region', requireAuth, (req, res) => {
    const requested = String(req.headers['x-region'] || req.headers['x-ocean-region'] || 'auto');
    const entry = REGIONS.find((r) => r.region === requested) || (requested === 'auto' ? REGIONS[0] : { region: requested, replica: `ocean-edge-${requested}`, latencyMs: 60 });
    res.json({
      requestedRegion: requested,
      routedTo: entry,
      note: 'Simulated multi-region routing — set the x-region header to see a different edge.',
      serverTime: Date.now(),
    });
  });
}
