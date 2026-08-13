/**
 * Ocean — Resume Builder (Feature 194)
 * -------------------------------------
 * Generates a structured resume from the user's profile, skills, education and
 * portfolio items. Returns both JSON and a self-contained HTML document the
 * browser can print / save as PDF — no PDF library dependency required.
 *
 * Model: db.resumes — array of { id, userId, headline, summary, skills[],
 *   experience[] {role, org, years, desc}, education[] {degree, school, year},
 *   contact {email, phone, city}, updatedAt }
 *
 * Routes:
 *   GET  /api/profile/resume/:userId   (public) built resume JSON + HTML
 *   POST /api/profile/resume           (auth) save MY resume details
 */

import express from 'express';
import { getCtx } from './turtleServerContext';

export interface ResumeDoc {
  id: string;
  userId: string;
  name: string;
  headline: string;
  summary: string;
  skills: string[];
  experience: { role: string; org: string; years: string; desc: string }[];
  education: { degree: string; school: string; year: string }[];
  contact: { email: string; phone: string; city: string };
  updatedAt: number;
}

function uid(): string {
  return `res-${Date.now()}-${Math.floor(Math.random() * 99999)}`;
}

function ensureCollection(db: any): void {
  if (!Array.isArray(db.resumes)) db.resumes = [];
}

function s(v: unknown, max: number): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

function esc(html: string): string {
  return html.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function resolveUser(db: any, ref: string): any | null {
  const q = String(ref || '').trim();
  const byId = (db.users || []).find((u: any) => u && u.id === q);
  if (byId) return byId;
  return (db.users || []).find((u: any) => u && (u.name === q || u.username === q)) || null;
}

function findMine(db: any, userId: string): ResumeDoc | undefined {
  return (db.resumes as ResumeDoc[]).find((r) => r && r.userId === userId);
}

export function buildResume(db: any, u: any, mine?: ResumeDoc): ResumeDoc {
  const profile = u?.profile || {};
  const posts = Array.isArray(profile.posts) ? profile.posts : [];
  const topSkills = Array.isArray(profile.skills) ? profile.skills.slice(0, 8) : [];
  const fallback: ResumeDoc = {
    id: mine?.id || uid(),
    userId: u.id,
    name: u.name || u.username || 'User',
    headline: mine?.headline || s(profile.headline, 120) || `${u.name || 'User'} — professional profile`,
    summary: mine?.summary || s(profile.bio, 500) || 'Open to collaboration and meaningful work.',
    skills: mine?.skills?.length ? mine.skills : topSkills,
    experience: mine?.experience || [],
    education: mine?.education || [],
    contact: mine?.contact || { email: profile.email || u.email || '', phone: '', city: '' },
    updatedAt: mine?.updatedAt || Date.now(),
  };
  // enrich summary with post themes when empty
  if (!mine?.summary && posts.length > 0) {
    const topics = posts.map((p: any) => String(p.title || p.content || '').slice(0, 60)).filter(Boolean).slice(0, 3);
    fallback.summary = `Active contributor sharing ${topics.length} update${topics.length === 1 ? '' : 's'}: ${topics.join(' · ')}`;
  }
  return fallback;
}

export function resumeToHtml(r: ResumeDoc): string {
  const skills = r.skills.map((x) => esc(x)).join(', ') || '—';
  const exp = r.experience.map((e) => `
      <div class="block">
        <div class="row"><strong>${esc(e.role)}</strong> <span class="muted">@ ${esc(e.org)}${e.years ? ' · ' + esc(e.years) : ''}</span></div>
        <div class="muted">${esc(e.desc)}</div>
      </div>`).join('');
  const edu = r.education.map((e) => `
      <div class="block">
        <div class="row"><strong>${esc(e.degree)}</strong> <span class="muted">${esc(e.school)}${e.year ? ' · ' + esc(e.year) : ''}</span></div>
      </div>`).join('');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(r.name)} — Resume</title>
  <style>
    body{font-family:Georgia,serif;color:#2b2620;max-width:760px;margin:40px auto;padding:0 24px;line-height:1.55}
    h1{font-size:30px;margin:0 0 2px} .headline{color:#6b5f4d;margin:0 0 14px}
    .contact{font-size:12.5px;color:#6b5f4d;margin-bottom:18px}
    h2{font-size:13px;text-transform:uppercase;letter-spacing:.12em;color:#8a5a2b;border-bottom:1px solid #e5d9c4;padding-bottom:4px;margin:22px 0 10px}
    .block{margin-bottom:10px} .row{display:flex;justify-content:space-between;gap:12px} .muted{color:#6b5f4d;font-size:13px}
    .skills span{display:inline-block;background:#f4ecdc;border-radius:20px;padding:2px 10px;margin:2px 3px 2px 0;font-size:12px}
    @media print{body{margin:12px auto}}
  </style></head><body>
  <h1>${esc(r.name)}</h1>
  <div class="headline">${esc(r.headline)}</div>
  <div class="contact">${esc(r.contact.email)}${r.contact.phone ? ' · ' + esc(r.contact.phone) : ''}${r.contact.city ? ' · ' + esc(r.contact.city) : ''}</div>
  <h2>Summary</h2><div>${esc(r.summary)}</div>
  <h2>Skills</h2><div class="skills">${r.skills.map((x) => `<span>${esc(x)}</span>`).join('') || '—'}</div>
  <h2>Experience</h2>${exp || '<div class="muted">—</div>'}
  <h2>Education</h2>${edu || '<div class="muted">—</div>'}
  <p class="muted" style="margin-top:26px;font-size:11px">Generated by Ocean Resume Builder</p>
  </body></html>`;
}

export function registerResumeRoutes(app: express.Express): void {
  const { requireAuth, loadDatabase, saveDatabase } = getCtx();

  app.get('/api/profile/resume/:userId', (req, res) => {
    const db = loadDatabase();
    ensureCollection(db);
    const u = resolveUser(db, req.params.userId);
    if (!u) return res.status(404).json({ error: 'User not found.' });
    const mine = findMine(db, u.id);
    const resume = buildResume(db, u, mine);
    res.json({ resume, html: resumeToHtml(resume) });
  });

  app.post('/api/profile/resume', requireAuth, (req, res) => {
    const user = (req as any).user;
    const b = (req.body || {}) as any;
    const db = loadDatabase();
    ensureCollection(db);
    let r = findMine(db, user.id);
    const now = Date.now();
    if (!r) {
      r = {
        id: uid(),
        userId: user.id,
        name: s(b.name || user.name, 80) || user.name || 'User',
        headline: s(b.headline, 120),
        summary: s(b.summary, 600),
        skills: Array.isArray(b.skills) ? b.skills.map((x: any) => s(x, 40)).filter(Boolean).slice(0, 15) : [],
        experience: Array.isArray(b.experience) ? b.experience.slice(0, 10).map((e: any) => ({
          role: s(e.role, 80), org: s(e.org, 80), years: s(e.years, 40), desc: s(e.desc, 400),
        })) : [],
        education: Array.isArray(b.education) ? b.education.slice(0, 6).map((e: any) => ({
          degree: s(e.degree, 80), school: s(e.school, 80), year: s(e.year, 20),
        })) : [],
        contact: {
          email: s(b.contact?.email, 120),
          phone: s(b.contact?.phone, 40),
          city: s(b.contact?.city, 60),
        },
        updatedAt: now,
      };
      (db.resumes as ResumeDoc[]).push(r);
    } else {
      r.name = s(b.name, 80) || r.name;
      r.headline = s(b.headline, 120);
      r.summary = s(b.summary, 600);
      if (Array.isArray(b.skills)) r.skills = b.skills.map((x: any) => s(x, 40)).filter(Boolean).slice(0, 15);
      if (Array.isArray(b.experience)) r.experience = b.experience.slice(0, 10).map((e: any) => ({
        role: s(e.role, 80), org: s(e.org, 80), years: s(e.years, 40), desc: s(e.desc, 400),
      }));
      if (Array.isArray(b.education)) r.education = b.education.slice(0, 6).map((e: any) => ({
        degree: s(e.degree, 80), school: s(e.school, 80), year: s(e.year, 20),
      }));
      if (b.contact && typeof b.contact === 'object') {
        r.contact = { email: s(b.contact.email, 120), phone: s(b.contact.phone, 40), city: s(b.contact.city, 60) };
      }
      r.updatedAt = now;
    }
    saveDatabase(db);
    res.json({ resume: r, html: resumeToHtml(r) });
  });
}
