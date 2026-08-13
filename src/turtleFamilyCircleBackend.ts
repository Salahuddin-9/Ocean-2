/**
 * Ocean — Family Circle Dashboard (Feature 202)
 * -----------------------------------------------
 * A private family circle: members with roles (admin/parent/guardian/member),
 * check-ins and an opt-in location share. The admin approves join requests.
 *
 * Model (global db): db.familyCircles — array of
 *   { id, name, createdBy, members: { id, name, role, joinedAt }[],
 *     pending: { id, name, at }[], checkIns: { userId, name, at, note }[],
 *     locationShare: { userId, name, lat, lng, at }[] (opt-in), createdAt }
 *
 * Routes:
 *   GET  /api/family                (auth) my circles + circles I belong to
 *   POST /api/family                (auth) create a circle (admin)
 *   POST /api/family/:id/join       (auth) request to join
 *   POST /api/family/:id/approve    (auth: admin) approve a pending member
 *   POST /api/family/:id/check-in   (auth: member) check in
 *   POST /api/family/:id/location   (auth: member) opt-in share location
 *   POST /api/family/:id/leave      (auth: member) leave the circle
 */

import express from 'express';
import { getCtx } from './turtleServerContext';

export interface FamilyMember {
  id: string;
  name: string;
  role: 'admin' | 'parent' | 'guardian' | 'member';
  joinedAt: number;
}

export interface FamilyCircle {
  id: string;
  name: string;
  createdBy: string;
  members: FamilyMember[];
  pending: { id: string; name: string; at: number }[];
  checkIns: { userId: string; name: string; at: number; note: string }[];
  locationShare: { userId: string; name: string; lat: number; lng: number; at: number }[];
  createdAt: number;
}

function uid(p: string): string {
  return `${p}-${Date.now()}-${Math.floor(Math.random() * 99999)}`;
}

function ensureCollection(db: any): void {
  if (!Array.isArray(db.familyCircles)) db.familyCircles = [];
}

function s(v: unknown, max: number): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

export function registerFamilyCircleRoutes(app: express.Express): void {
  const { requireAuth, loadDatabase, saveDatabase } = getCtx();

  function memberOf(c: FamilyCircle, userId: string) {
    return c.members.some((m) => m.id === userId);
  }

  app.get('/api/family', requireAuth, (req, res) => {
    const user = (req as any).user;
    const db = loadDatabase();
    ensureCollection(db);
    const mine = (db.familyCircles as FamilyCircle[]).filter((c) => memberOf(c, user.id) || c.createdBy === user.id);
    const joined = mine.map((c) => {
      const isAdmin = c.createdBy === user.id || c.members.find((m) => m.id === user.id)?.role === 'admin';
      return { ...c, isAdmin };
    });
    res.json({ circles: joined });
  });

  app.post('/api/family', requireAuth, (req, res) => {
    const user = (req as any).user;
    const name = s((req.body || {}).name, 80);
    if (!name) return res.status(400).json({ error: 'Circle name is required.' });
    const db = loadDatabase();
    ensureCollection(db);
    const circle: FamilyCircle = {
      id: uid('fam'),
      name,
      createdBy: user.id,
      members: [{ id: user.id, name: user.name || user.username || 'User', role: 'admin', joinedAt: Date.now() }],
      pending: [],
      checkIns: [],
      locationShare: [],
      createdAt: Date.now(),
    };
    (db.familyCircles as FamilyCircle[]).push(circle);
    saveDatabase(db);
    res.json({ circle: { ...circle, isAdmin: true } });
  });

  app.post('/api/family/:id/join', requireAuth, (req, res) => {
    const user = (req as any).user;
    const db = loadDatabase();
    ensureCollection(db);
    const circle = (db.familyCircles as FamilyCircle[]).find((c) => c.id === req.params.id);
    if (!circle) return res.status(404).json({ error: 'Circle not found.' });
    if (memberOf(circle, user.id)) return res.status(400).json({ error: 'Already a member.' });
    if (circle.pending.some((p) => p.id === user.id)) return res.status(400).json({ error: 'Join request already sent.' });
    circle.pending.push({ id: user.id, name: user.name || user.username || 'User', at: Date.now() });
    saveDatabase(db);
    res.json({ success: true, message: 'Join request sent to the family admin.' });
  });

  app.post('/api/family/:id/approve', requireAuth, (req, res) => {
    const user = (req as any).user;
    const db = loadDatabase();
    ensureCollection(db);
    const circle = (db.familyCircles as FamilyCircle[]).find((c) => c.id === req.params.id);
    if (!circle) return res.status(404).json({ error: 'Circle not found.' });
    const isAdmin = circle.createdBy === user.id || circle.members.find((m) => m.id === user.id)?.role === 'admin';
    if (!isAdmin) return res.status(403).json({ error: 'Only admins can approve members.' });
    const pendingUser = circle.pending.find((p) => p.id === String((req.body || {}).userId));
    if (!pendingUser) return res.status(404).json({ error: 'No pending request for that user.' });
    circle.members.push({ id: pendingUser.id, name: pendingUser.name, role: 'member', joinedAt: Date.now() });
    circle.pending = circle.pending.filter((p) => p.id !== pendingUser.id);
    saveDatabase(db);
    res.json({ success: true, members: circle.members });
  });

  app.post('/api/family/:id/check-in', requireAuth, (req, res) => {
    const user = (req as any).user;
    const db = loadDatabase();
    ensureCollection(db);
    const circle = (db.familyCircles as FamilyCircle[]).find((c) => c.id === req.params.id);
    if (!circle) return res.status(404).json({ error: 'Circle not found.' });
    if (!memberOf(circle, user.id)) return res.status(403).json({ error: 'Join the circle first.' });
    circle.checkIns.unshift({ userId: user.id, name: user.name || user.username || 'User', at: Date.now(), note: s((req.body || {}).note, 200) });
    if (circle.checkIns.length > 50) circle.checkIns.length = 50;
    saveDatabase(db);
    res.json({ success: true, checkIns: circle.checkIns });
  });

  app.post('/api/family/:id/location', requireAuth, (req, res) => {
    const user = (req as any).user;
    const b = (req.body || {}) as any;
    const lat = Number(b.lat);
    const lng = Number(b.lng);
    const db = loadDatabase();
    ensureCollection(db);
    const circle = (db.familyCircles as FamilyCircle[]).find((c) => c.id === req.params.id);
    if (!circle) return res.status(404).json({ error: 'Circle not found.' });
    if (!memberOf(circle, user.id)) return res.status(403).json({ error: 'Join the circle first.' });
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      const idx = circle.locationShare.findIndex((l) => l.userId === user.id);
      const entry = { userId: user.id, name: user.name || user.username || 'User', lat, lng, at: Date.now() };
      if (idx >= 0) circle.locationShare[idx] = entry;
      else circle.locationShare.push(entry);
      saveDatabase(db);
      return res.json({ success: true, shared: true });
    }
    // null lat/lng => stop sharing
    circle.locationShare = circle.locationShare.filter((l) => l.userId !== user.id);
    saveDatabase(db);
    res.json({ success: true, shared: false });
  });

  app.post('/api/family/:id/leave', requireAuth, (req, res) => {
    const user = (req as any).user;
    const db = loadDatabase();
    ensureCollection(db);
    const circle = (db.familyCircles as FamilyCircle[]).find((c) => c.id === req.params.id);
    if (!circle) return res.status(404).json({ error: 'Circle not found.' });
    if (circle.createdBy === user.id) return res.status(400).json({ error: 'Admins cannot leave — delete or transfer the circle.' });
    circle.members = circle.members.filter((m) => m.id !== user.id);
    circle.checkIns = circle.checkIns.filter((c) => c.userId !== user.id);
    circle.locationShare = circle.locationShare.filter((l) => l.userId !== user.id);
    saveDatabase(db);
    res.json({ success: true });
  });
}
