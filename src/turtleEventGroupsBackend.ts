/**
 * Ocean — Self-Destructing Event Groups (Feature 11)
 * ----------------------------------------------------
 * Convert any group chat into an "Event Group" with an event end date. After the
 * end date + 24h the group is ARCHIVED: it becomes read-only (message sends are
 * rejected by guards in server.ts + chatServer.ts), hidden from open-group lists,
 * and everyone is demoted to read-only viewers.
 *
 * Metadata lives on the conversation itself (isEventGroup / eventEndDate /
 * archived / archivedAt) so the existing chat paths can enforce it with a single
 * boolean check; db.eventGroups is a lightweight index for listing + the sweep.
 *
 * Routes:
 *   POST /api/chat/event-groups           (auth) { conversationId, eventEndDate, name? }
 *   GET  /api/chat/event-groups           (auth) my event groups with status
 *   GET  /api/chat/event-groups/:id       (auth) detail
 *   POST /api/chat/event-groups/:id/archive (auth: creator) archive now
 *   POST /api/chat/event-groups/check     (auth) cron sweep — archive expired groups
 */
import express from 'express';
import { getCtx } from './turtleServerContext';

export interface EventGroupIndex {
  id: string;
  conversationId: string;
  name: string;
  createdBy: string;
  eventEndDate: number;
  archived: boolean;
  archivedAt: number | null;
  createdAt: number;
}

const GRACE_MS = 24 * 60 * 60 * 1000;

function uid(): string {
  return `evgrp-${Date.now()}-${Math.floor(Math.random() * 99999)}`;
}

function ensureCollection(db: any): void {
  if (!Array.isArray(db.eventGroups)) db.eventGroups = [];
}

function endOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

export function archiveEventGroup(db: any, group: EventGroupIndex): boolean {
  if (group.archived) return false;
  group.archived = true;
  group.archivedAt = Date.now();
  const conv = (db.conversations || []).find((c: any) => c && c.id === group.conversationId);
  if (conv) {
    conv.isEventGroup = true;
    conv.archived = true;
    conv.archivedAt = group.archivedAt;
  }
  return true;
}

export function registerEventGroupsRoutes(app: express.Express): void {
  const { requireAuth, loadDatabase, saveDatabase } = getCtx();

  // POST /api/chat/event-groups — convert a group chat into an event group (auth)
  app.post('/api/chat/event-groups', requireAuth, (req, res) => {
    const user = (req as any).user;
    const db = loadDatabase();
    ensureCollection(db);
    const body = req.body || {};
    const conversationId = String(body.conversationId || '');
    const rawEnd = Date.parse(String(body.eventEndDate || ''));
    if (!conversationId) return res.status(400).json({ error: 'conversationId is required.' });
    if (!Number.isFinite(rawEnd)) return res.status(400).json({ error: 'A valid eventEndDate is required.' });

    const conv = (db.conversations || []).find((c: any) => c && c.id === conversationId);
    if (!conv) return res.status(404).json({ error: 'Chat not found.' });
    if (conv.type !== 'group' && conv.isGroup !== true) {
      return res.status(400).json({ error: 'Only group chats can become event groups.' });
    }
    if (!Array.isArray(conv.participants) || !conv.participants.includes(user.id)) {
      return res.status(403).json({ error: 'You must be a member of this group.' });
    }
    if (conv.archived) return res.status(400).json({ error: 'This group is already archived.' });

    const eventEndDate = endOfDay(rawEnd);
    const name = String(body.name || '').trim().slice(0, 120) || conv.name || 'Event Group';
    const group: EventGroupIndex = {
      id: uid(),
      conversationId,
      name,
      createdBy: user.id,
      eventEndDate,
      archived: false,
      archivedAt: null,
      createdAt: Date.now(),
    };
    conv.isEventGroup = true;
    conv.eventEndDate = eventEndDate;
    conv.eventGroupName = name;
    conv.archived = false;
    conv.archivedAt = null;
    (db.eventGroups as EventGroupIndex[]).push(group);
    saveDatabase(db);
    res.json({ group });
  });

  // GET /api/chat/event-groups — my event groups (auth)
  app.get('/api/chat/event-groups', requireAuth, (req, res) => {
    const user = (req as any).user;
    const db = loadDatabase();
    ensureCollection(db);
    const mine = (db.eventGroups as EventGroupIndex[])
      .filter((g) => {
        const conv = (db.conversations || []).find((c: any) => c && c.id === g.conversationId);
        return conv && Array.isArray(conv.participants) && conv.participants.includes(user.id);
      })
      .map((g) => {
        const conv = (db.conversations || []).find((c: any) => c && c.id === g.conversationId);
        const expiresAt = g.eventEndDate + GRACE_MS;
        return {
          ...g,
          status: g.archived
            ? 'archived'
            : Date.now() > expiresAt
              ? 'ready_to_archive'
              : Date.now() > g.eventEndDate
                ? 'grace_period'
                : 'active',
          expiresAt,
          memberCount: conv?.participants?.length || 0,
          chatName: conv?.name || g.name,
        };
      })
      .sort((a, b) => b.createdAt - a.createdAt);
    res.json({ groups: mine });
  });

  // GET /api/chat/event-groups/:id — detail (auth, participant)
  app.get('/api/chat/event-groups/:id', requireAuth, (req, res) => {
    const user = (req as any).user;
    const db = loadDatabase();
    ensureCollection(db);
    const group = (db.eventGroups as EventGroupIndex[]).find((g) => g.id === req.params.id);
    if (!group) return res.status(404).json({ error: 'Event group not found.' });
    const conv = (db.conversations || []).find((c: any) => c && c.id === group.conversationId);
    if (!conv || !Array.isArray(conv.participants) || !conv.participants.includes(user.id)) {
      return res.status(403).json({ error: 'Not a member of this group.' });
    }
    res.json({ group, conversation: conv });
  });

  // POST /api/chat/event-groups/:id/archive — archive now (creator)
  app.post('/api/chat/event-groups/:id/archive', requireAuth, (req, res) => {
    const user = (req as any).user;
    const db = loadDatabase();
    ensureCollection(db);
    const group = (db.eventGroups as EventGroupIndex[]).find((g) => g.id === req.params.id);
    if (!group) return res.status(404).json({ error: 'Event group not found.' });
    if (group.createdBy !== user.id) return res.status(403).json({ error: 'Only the organizer can archive this event group.' });
    const changed = archiveEventGroup(db, group);
    saveDatabase(db);
    res.json({ success: true, archived: changed, group });
  });

  // POST /api/chat/event-groups/check — cron sweep (auth; call it daily)
  app.post('/api/chat/event-groups/check', requireAuth, (req, res) => {
    const db = loadDatabase();
    ensureCollection(db);
    const now = Date.now();
    const due = (db.eventGroups as EventGroupIndex[]).filter(
      (g) => !g.archived && g.eventEndDate + GRACE_MS <= now
    );
    let archived = 0;
    for (const g of due) if (archiveEventGroup(db, g)) archived += 1;
    saveDatabase(db);
    res.json({ checked: (db.eventGroups as EventGroupIndex[]).length, archived });
  });
}
