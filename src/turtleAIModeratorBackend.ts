/**
 * Ocean — AI Community Moderator (Feature 143)
 * --------------------------------------------
 * Automated moderation for groups/channels: when content is flagged, the AI layer
 * auto-warns, auto-deletes, or mutes the author based on configurable rules.
 *
 * Detection reuses the Smart Community deterministic signal engine
 * (turtleSmartCommunityBackend.analyzeText) so every verdict lists WHICH signals
 * fired. ModerationRule is a persisted, admin-configurable rule set.
 *
 * Model (global db, idempotent ensure):
 *   db.moderationRules   — array of { id, name, category, maxSeverity, action, enabled, createdBy, createdAt }
 *   db.moderationActions — ring buffer of { id, targetType, targetId, targetUserId, ruleName,
 *                          action, message, signals, severity, createdAt }
 *
 * Routes:
 *   GET    /api/moderation/rules            -> list rules (guest-safe)
 *   POST   /api/moderation/rules            -> create rule (auth)
 *   DELETE /api/moderation/rules/:id        -> delete rule (auth)
 *   POST   /api/moderation/auto-review      { targetType, targetId, text, authorId? } -> verdict + auto action
 *   GET    /api/moderation/actions          -> recent actions (guest-safe)
 */

import express from 'express';
import { getCtx } from './turtleServerContext';
import { analyzeText } from './turtleSmartCommunityBackend';

export type ModAction = 'allow' | 'warn' | 'delete' | 'mute';

export interface ModerationRule {
  id: string;
  name: string;
  category: 'harmful' | 'spam' | 'misleading' | 'bot';
  /** Auto-action when the category score reaches this threshold. */
  threshold: number;
  action: ModAction;
  enabled: boolean;
  createdBy: string;
  createdAt: number;
}

export interface ModerationAction {
  id: string;
  targetType: 'post' | 'comment' | 'message';
  targetId: string;
  targetUserId: string;
  ruleName: string;
  action: ModAction;
  message: string;
  signals: string[];
  severity: number;
  createdAt: number;
}

export interface AutoReviewResult {
  severity: number;
  categoryScores: Record<string, number>;
  signals: string[];
  action: ModAction;
  message: string;
  ruleName: string;
}

const DEFAULT_RULES: Omit<ModerationRule, 'id' | 'createdBy' | 'createdAt'>[] = [
  { name: 'Harmful content', category: 'harmful', threshold: 60, action: 'delete', enabled: true },
  { name: 'Spam guard', category: 'spam', threshold: 55, action: 'warn', enabled: true },
  { name: 'Misinformation guard', category: 'misleading', threshold: 65, action: 'warn', enabled: true },
  { name: 'Bot behavior', category: 'bot', threshold: 70, action: 'mute', enabled: true },
];

function uid(): string {
  return `mrule-${Date.now()}-${Math.floor(Math.random() * 99999)}`;
}

function ensureCollections(db: any): void {
  if (!Array.isArray(db.moderationRules)) {
    // Seed with sane defaults on first run (idempotent).
    db.moderationRules = DEFAULT_RULES.map((r) => ({
      ...r,
      id: uid(),
      createdBy: 'system',
      createdAt: Date.now(),
    }));
  }
  if (!Array.isArray(db.moderationActions)) db.moderationActions = [];
}

/** Aggregate the shared signal engine's tags into category scores + labels. */
export function reviewText(raw: string): { severity: number; categoryScores: Record<string, number>; signals: string[] } {
  const signals = analyzeText(String(raw || ''));
  const categoryScores: Record<string, number> = {};
  const labels: string[] = [];
  for (const s of signals) {
    for (const tag of s.tags) categoryScores[tag] = (categoryScores[tag] || 0) + s.weight;
    labels.push(s.label);
  }
  const severity = Math.min(100, signals.reduce((acc, s) => acc + s.weight, 0));
  return { severity, categoryScores, signals: labels };
}

export function registerAIModeratorRoutes(app: express.Express): void {
  const { requireAuth, loadDatabase, saveDatabase } = getCtx();

  // GET /api/moderation/rules
  app.get('/api/moderation/rules', (req, res) => {
    const db = loadDatabase();
    ensureCollections(db);
    res.json({ rules: db.moderationRules });
  });

  // POST /api/moderation/rules — create/update a rule (auth)
  app.post('/api/moderation/rules', requireAuth, (req, res) => {
    const user = (req as any).user;
    const body = req.body || {};
    const category = body.category;
    if (category !== 'harmful' && category !== 'spam' && category !== 'misleading' && category !== 'bot') {
      return res.status(400).json({ error: 'category must be harmful|spam|misleading|bot.' });
    }
    const action = body.action;
    if (action !== 'allow' && action !== 'warn' && action !== 'delete' && action !== 'mute') {
      return res.status(400).json({ error: 'action must be allow|warn|delete|mute.' });
    }
    const name = String(body.name || '').trim().slice(0, 80);
    if (name.length < 3) return res.status(400).json({ error: 'Rule name must be at least 3 characters.' });
    const threshold = Math.max(0, Math.min(100, Math.round(Number(body.threshold) || 60)));

    const db = loadDatabase();
    ensureCollections(db);
    const rules = db.moderationRules as ModerationRule[];
    const rule: ModerationRule = {
      id: body.id && typeof body.id === 'string' ? body.id : uid(),
      name,
      category,
      threshold,
      action,
      enabled: body.enabled !== false,
      createdBy: user.id,
      createdAt: Date.now(),
    };
    const idx = rules.findIndex((r) => r.id === rule.id);
    if (idx >= 0) rules[idx] = rule;
    else rules.push(rule);
    saveDatabase(db);
    res.json({ rule, rules });
  });

  // DELETE /api/moderation/rules/:id
  app.delete('/api/moderation/rules/:id', requireAuth, (req, res) => {
    const db = loadDatabase();
    ensureCollections(db);
    const rules = db.moderationRules as ModerationRule[];
    const idx = rules.findIndex((r) => r.id === req.params.id);
    if (idx < 0) return res.status(404).json({ error: 'Rule not found.' });
    rules.splice(idx, 1);
    saveDatabase(db);
    res.json({ success: true });
  });

  // POST /api/moderation/auto-review — run rules over content, apply the winner
  app.post('/api/moderation/auto-review', requireAuth, (req, res) => {
    const user = (req as any).user;
    const body = req.body || {};
    const targetType = body.targetType === 'comment' || body.targetType === 'message' ? body.targetType : 'post';
    const targetId = String(body.targetId || `auto-${Date.now()}`).trim();
    const text = String(body.text || '').slice(0, 4000);
    const authorId = String(body.authorId || 'unknown');
    if (!text.trim()) return res.status(400).json({ error: 'text is required.' });

    const db = loadDatabase();
    ensureCollections(db);
    const { severity, categoryScores, signals } = reviewText(text);
    const rules = db.moderationRules as ModerationRule[];

    // Winner = enabled rule with the highest category score above its threshold.
    let winner: ModerationRule | null = null;
    let winnerScore = -1;
    for (const r of rules) {
      if (!r.enabled) continue;
      const catScore = categoryScores[r.category] || 0;
      if (catScore >= r.threshold && catScore > winnerScore) {
        winner = r;
        winnerScore = catScore;
      }
    }

    let action: ModAction = 'allow';
    let ruleName = 'No rule matched';
    if (winner) {
      action = winner.action;
      ruleName = winner.name;
    } else if (severity >= 80) {
      // Safety net: even without a rule, extreme content never sails through.
      action = 'delete';
      ruleName = 'Emergency severity cap';
    } else if (severity >= 55) {
      action = 'warn';
      ruleName = 'Default warning band';
    } else if (severity >= 35) {
      action = 'allow';
      ruleName = 'Low risk — noted';
    }

    const message =
      action === 'allow'
        ? 'Content approved — no moderation action.'
        : action === 'warn'
          ? `Auto-warned by “${ruleName}”: ${signals.slice(0, 3).join('; ') || 'flagged content'}`
          : action === 'delete'
            ? `Auto-deleted by “${ruleName}” (severity ${severity}/100).`
            : `Author muted by “${ruleName}” — repeat violations.`;

    const record: ModerationAction = {
      id: `ma-${Date.now()}-${Math.floor(Math.random() * 999)}`,
      targetType,
      targetId,
      targetUserId: authorId,
      ruleName,
      action,
      message,
      signals,
      severity,
      createdAt: Date.now(),
    };
    const list = db.moderationActions as ModerationAction[];
    list.unshift(record);
    if (list.length > 300) list.length = 300;
    saveDatabase(db);

    res.json({ ...record, categoryScores, reviewedBy: user.name || user.username || 'User' });
  });

  // GET /api/moderation/actions
  app.get('/api/moderation/actions', (req, res) => {
    const db = loadDatabase();
    ensureCollections(db);
    res.json({ actions: (db.moderationActions as ModerationAction[]).slice(0, 100) });
  });
}
