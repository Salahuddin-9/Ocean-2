/**
 * Ocean — Bio-Data Auto Builder (Feature 218)
 * ---------------------------------------------
 * Generates a marriage bio-data document (HTML, print/PDF-ready) from profile
 * info plus optional family details. Routes:
 *   GET  /api/profile/biodata/:userId  (public) bio-data JSON + HTML
 *   POST /api/profile/biodata          (auth) save my bio-data details
 */

import express from 'express';
import { getCtx } from './turtleServerContext';

export interface BioData {
  id: string;
  userId: string;
  name: string;
  dob: string;
  height: string;
  education: string;
  occupation: string;
  city: string;
  religion: string;
  familyInfo: string;
  preferences: string;
  updatedAt: number;
}

function uid(): string {
  return `bio-${Date.now()}-${Math.floor(Math.random() * 99999)}`;
}

function ensureCollection(db: any): void {
  if (!Array.isArray(db.bioDatas)) db.bioDatas = [];
}

function s(v: unknown, max: number): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

function esc(html: string): string {
  return html.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function findMine(db: any, userId: string) {
  return (db.bioDatas as BioData[]).find((b) => b && b.userId === userId);
}

function resolveUser(db: any, ref: string): any | null {
  const q = String(ref || '').trim();
  const byId = (db.users || []).find((u: any) => u && u.id === q);
  if (byId) return byId;
  return (db.users || []).find((u: any) => u && (u.name === q || u.username === q)) || null;
}

function build(db: any, u: any, mine?: BioData): BioData {
  const profile = u?.profile || {};
  const base: BioData = {
    id: mine?.id || uid(),
    userId: u.id,
    name: mine?.name || u.name || u.username || 'User',
    dob: mine?.dob || s(profile.dob, 40),
    height: mine?.height || '',
    education: mine?.education || s(profile.education, 100),
    occupation: mine?.occupation || s(profile.occupation, 80),
    city: mine?.city || s(profile.city, 60),
    religion: mine?.religion || '',
    familyInfo: mine?.familyInfo || '',
    preferences: mine?.preferences || '',
    updatedAt: mine?.updatedAt || Date.now(),
  };
  return base;
}

function toHtml(b: BioData): string {
  const row = (k: string, v: string) => v ? `<tr><td class="k">${esc(k)}</td><td>${esc(v)}</td></tr>` : '';
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(b.name)} — Bio-Data</title>
  <style>
    body{font-family:Georgia,serif;max-width:640px;margin:32px auto;padding:0 24px;color:#2b2620}
    h1{text-align:center;font-size:26px;margin-bottom:2px} .sub{text-align:center;color:#6b5f4d;font-size:12px;margin-bottom:18px}
    table{width:100%;border-collapse:collapse} td{padding:8px 10px;border-bottom:1px solid #e5d9c4;font-size:13.5px}
    .k{width:38%;color:#8a5a2b;font-weight:bold}
    .section{font-size:12px;text-transform:uppercase;letter-spacing:.12em;color:#8a5a2b;border-bottom:2px solid #e5d9c4;padding-bottom:4px;margin:18px 0 8px}
    @media print{body{margin:12px auto}}
  </style></head><body>
  <h1>${esc(b.name)}</h1>
  <div class="sub">Marriage Bio-Data · prepared by Ocean</div>
  <div class="section">Personal</div>
  <table>${row('Name', b.name)}${row('Date of Birth', b.dob)}${row('Height', b.height)}${row('Education', b.education)}${row('Occupation', b.occupation)}${row('City', b.city)}${row('Religion', b.religion)}</table>
  <div class="section">Family</div>
  <table>${row('Family Information', b.familyInfo)}</table>
  <div class="section">Preferences</div>
  <table>${row('Partner preferences', b.preferences)}</table>
  </body></html>`;
}

export function registerBioDataRoutes(app: express.Express): void {
  const { requireAuth, loadDatabase, saveDatabase } = getCtx();

  app.get('/api/profile/biodata/:userId', (req, res) => {
    const db = loadDatabase();
    ensureCollection(db);
    const u = resolveUser(db, req.params.userId);
    if (!u) return res.status(404).json({ error: 'User not found.' });
    const biodata = build(db, u, findMine(db, u.id));
    res.json({ biodata, html: toHtml(biodata) });
  });

  app.post('/api/profile/biodata', requireAuth, (req, res) => {
    const user = (req as any).user;
    const b = (req.body || {}) as any;
    const db = loadDatabase();
    ensureCollection(db);
    let mine = findMine(db, user.id);
    const now = Date.now();
    if (!mine) {
      mine = { id: uid(), userId: user.id, name: s(b.name || user.name, 80), dob: s(b.dob, 40), height: s(b.height, 20), education: s(b.education, 100), occupation: s(b.occupation, 80), city: s(b.city, 60), religion: s(b.religion, 40), familyInfo: s(b.familyInfo, 400), preferences: s(b.preferences, 400), updatedAt: now };
      (db.bioDatas as BioData[]).push(mine);
    } else {
      mine.name = s(b.name, 80) || mine.name;
      mine.dob = s(b.dob, 40); mine.height = s(b.height, 20); mine.education = s(b.education, 100);
      mine.occupation = s(b.occupation, 80); mine.city = s(b.city, 60); mine.religion = s(b.religion, 40);
      mine.familyInfo = s(b.familyInfo, 400); mine.preferences = s(b.preferences, 400); mine.updatedAt = now;
    }
    saveDatabase(db);
    res.json({ biodata: mine, html: toHtml(mine) });
  });
}
