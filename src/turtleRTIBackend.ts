/**
 * Ocean — RTI Auto-Filer (Feature 211)
 * --------------------------------------
 * Generates a Right to Information (RTI) application letter from the user's
 * details + question, tracks the filing and deadline responses (30 days).
 *
 * Model (global db): db.rtiRequests — array of
 *   { id, userId, userName, authority, question, letter, status:
 *     'draft'|'filed'|'responded'|'appeal', filedAt, response?, deadlineAt, createdAt }
 *
 * Routes:
 *   GET  /api/rti            (auth) my requests
 *   POST /api/rti            (auth) generate + file (or save draft)
 *   POST /api/rti/:id/respond  (auth) log a response
 */

import express from 'express';
import { getCtx } from './turtleServerContext';

export interface RtiRequest {
  id: string;
  userId: string;
  userName: string;
  authority: string;
  question: string;
  letter: string;
  status: 'draft' | 'filed' | 'responded' | 'appeal';
  filedAt: number;
  deadlineAt: number;
  response?: string;
  createdAt: number;
}

function uid(): string {
  return `rti-${Date.now()}-${Math.floor(Math.random() * 99999)}`;
}

function ensureCollection(db: any): void {
  if (!Array.isArray(db.rtiRequests)) db.rtiRequests = [];
}

function s(v: unknown, max: number): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

function buildLetter(userName: string, authority: string, question: string, address: string, date: string): string {
  return [
    `Date: ${date}`,
    `To,\nThe Information Officer,\n${authority}`,
    `Subject: Application under the Right to Information Act for information regarding: ${question}`,
    '',
    `Dear Sir/Madam,`,
    `I, ${userName}, request information under the RTI Act on the subject above. The details sought are:`,
    `1. ${question}`,
    address ? `2. My mailing address for the reply: ${address}` : '',
    '',
    `Kindly provide the information within the statutory time limit (30 days).`,
    '',
    `Yours faithfully,\n${userName}`,
  ].filter(Boolean).join('\n');
}

export function registerRTIRoutes(app: express.Express): void {
  const { requireAuth, loadDatabase, saveDatabase } = getCtx();

  app.get('/api/rti', requireAuth, (req, res) => {
    const user = (req as any).user;
    const db = loadDatabase();
    ensureCollection(db);
    res.json({ requests: (db.rtiRequests as RtiRequest[]).filter((r) => r.userId === user.id) });
  });

  app.post('/api/rti', requireAuth, (req, res) => {
    const user = (req as any).user;
    const b = (req.body || {}) as any;
    const authority = s(b.authority, 120);
    const question = s(b.question, 600);
    if (!authority || !question) return res.status(400).json({ error: 'authority and question are required.' });
    const db = loadDatabase();
    ensureCollection(db);
    const filed = b.filed !== false;
    const now = Date.now();
    const request: RtiRequest = {
      id: uid(),
      userId: user.id,
      userName: user.name || user.username || 'User',
      authority,
      question,
      letter: buildLetter(user.name || user.username || 'User', authority, question, s(b.address, 300), new Date().toLocaleDateString()),
      status: filed ? 'filed' : 'draft',
      filedAt: filed ? now : 0,
      deadlineAt: filed ? now + 30 * 86400000 : 0,
      createdAt: now,
    };
    (db.rtiRequests as RtiRequest[]).unshift(request);
    saveDatabase(db);
    res.json({ request });
  });

  app.post('/api/rti/:id/respond', requireAuth, (req, res) => {
    const user = (req as any).user;
    const b = (req.body || {}) as any;
    const response = s(b.response, 2000);
    const db = loadDatabase();
    ensureCollection(db);
    const request = (db.rtiRequests as RtiRequest[]).find((r) => r.id === req.params.id);
    if (!request) return res.status(404).json({ error: 'Request not found.' });
    if (request.userId !== user.id) return res.status(403).json({ error: 'Not yours.' });
    request.response = response;
    request.status = b.appeal ? 'appeal' : 'responded';
    saveDatabase(db);
    res.json({ request });
  });
}
