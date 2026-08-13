/**
 * Ocean — AI Legal First-Aid (Feature 209)
 * ------------------------------------------
 * A legal-knowledge chatbot. Answers common questions (tenant rights, domestic
 * violence, cyber crime, labor, consumer) from a curated knowledge base, with
 * an optional LLM synthesis when a key is present. Always appends a disclaimer
 * and, for safety-critical topics, recommends the pro-bono lawyer matching
 * feature (208) and official helplines.
 *
 * Model (global db): db.legalQaLog — { id, userId, question, answer, at }
 *
 * Routes:
 *   POST /api/legal/ask   (auth) { question } -> { answer, topics[], disclaimer }
 *   GET  /api/legal/log   (auth) my past questions
 */

import express from 'express';
import { getCtx } from './turtleServerContext';
import { invokeLLM } from './server/llm';
import { ENV } from './server/env';

export interface LegalTopic {
  id: string;
  keywords: string[];
  answer: string;
  helpline?: string;
  urgent?: boolean;
}

const KNOWLEDGE: LegalTopic[] = [
  {
    id: 'tenant',
    keywords: ['tenant', 'rent', 'landlord', 'evict', 'deposit', 'lease', 'ভাড়া'],
    answer: 'In Bangladesh, tenants cannot be evicted without a court order; the Rent Control Act protects residential tenancies. Keep rent receipts, a written agreement, and record any harassment. Landlords must provide reasonable notice (commonly 30 days) and cannot cut utilities to force eviction.',
    helpline: 'District Legal Aid Office (free legal aid): 16430',
  },
  {
    id: 'domestic',
    keywords: ['domestic', 'abuse', 'violence', 'harass', 'husband', 'wife', 'marital'],
    answer: 'The Domestic Violence (Prevention & Protection) Act 2010 provides protection orders, residence orders and monetary relief. You can file a case at any police station or directly with the magistrate, and request a shelter. Evidence (medical reports, messages, photos) should be preserved — our Evidence Vault can help.',
    helpline: 'National Helpline 109 (women & children) · 999 (emergency)',
    urgent: true,
  },
  {
    id: 'cyber',
    keywords: ['cyber', 'hack', 'facebook', 'fake profile', 'revenge', 'leak', 'blackmail'],
    answer: 'The Digital Security Act / Cyber Security Act covers identity theft, leaked content and online blackmail. Preserve screenshots and URLs immediately, complain to the Cyber Crime unit (e-Cycle at police HQ), and do not pay blackmailers. You may also request the platform to take content down.',
    helpline: 'Cyber Support for Women: 999 option 1 / Cyber Crime Unit',
    urgent: true,
  },
  {
    id: 'labor',
    keywords: ['labor', 'wage', 'salary', 'worker', 'employment', 'termination', 'layoff'],
    answer: 'Under the Labour Act 2006, wages must be paid in full; retrenchment requires prior notice and compensation. Keep appointment letters, pay slips and attendance records. File a complaint with the labour court or the Department of Inspection for Factories.',
    helpline: 'Department of Labour helpline',
  },
  {
    id: 'consumer',
    keywords: ['consumer', 'refund', 'defective', 'product', 'service', 'fraud', 'scam'],
    answer: 'The Consumer Rights Protection Act 2009 gives you the right to replacement, refund or compensation for defective goods/services. Complain to the National Consumer Rights Protection Directorate or the district office with receipts and photos.',
    helpline: 'National Consumer Helpline 16117',
  },
  {
    id: 'traffic',
    keywords: ['traffic', 'accident', 'hit', 'vehicle', 'road', 'crash'],
    answer: 'After a road accident: stay safe, call 999, note the vehicle number and witnesses, and obtain a copy of the accident report (GD/ FIR). Insurance claims require a police report within a reasonable time — document everything.',
    helpline: '999 (emergency)',
    urgent: true,
  },
];

function detectTopics(q: string): LegalTopic[] {
  const low = q.toLowerCase();
  const hits: LegalTopic[] = [];
  for (const t of KNOWLEDGE) {
    if (t.keywords.some((k) => low.includes(k.toLowerCase()))) hits.push(t);
  }
  return hits.length > 0 ? hits : [{
    id: 'general',
    keywords: [],
    answer: 'I can help with common first-aid legal questions about tenancy, domestic violence, cyber crime, labour rights, consumer rights and road accidents. If your situation is urgent or complex, contact the police (999) or a licensed lawyer — see Pro-Bono Lawyers for free help.',
    helpline: '999 · Legal Aid 16430',
  }];
}

function uid(): string {
  return `law-${Date.now()}-${Math.floor(Math.random() * 99999)}`;
}

function ensureCollection(db: any): void {
  if (!Array.isArray(db.legalQaLog)) db.legalQaLog = [];
}

function s(v: unknown, max: number): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

const DISCLAIMER = 'This is general legal information, not legal advice. For your specific case, consult a licensed lawyer (see Pro-Bono Lawyers) or the official helplines above.';

export function registerLegalAidRoutes(app: express.Express): void {
  const { requireAuth, loadDatabase, saveDatabase } = getCtx();

  app.post('/api/legal/ask', requireAuth, async (req, res) => {
    const user = (req as any).user;
    const question = s((req.body || {}).question, 800);
    if (!question) return res.status(400).json({ error: 'question is required.' });
    const topics = detectTopics(question);
    let answer = topics[0].answer;
    let mode: 'kb' | 'llm' = 'kb';

    const keyPresent = !!(ENV.forgeApiKey || process.env.GEMINI_API_KEY);
    if (keyPresent && topics[0].id !== 'general') {
      try {
        const result = await invokeLLM({
          messages: [
            { role: 'system', content: 'You give concise, cautious first-aid legal guidance for Bangladesh. Use the provided base answer; add practical next steps. Max 120 words. No markdown.' },
            { role: 'user', content: `Question: ${question}\nBase guidance: ${topics[0].answer}` },
          ],
          model: 'gemini-3.5-flash',
          maxTokens: 220,
        });
        const raw = Array.isArray(result.choices?.[0]?.message?.content)
          ? result.choices[0].message.content.map((c: any) => c.text || '').join('')
          : String(result.choices?.[0]?.message?.content || '');
        if (raw.trim()) {
          answer = raw.trim().slice(0, 900);
          mode = 'llm';
        }
      } catch { /* keep kb answer */ }
    }

    const db = loadDatabase();
    ensureCollection(db);
    const entry = { id: uid(), userId: user.id, question, answer, mode, topics: topics.map((t) => t.id), helpline: topics[0].helpline, urgent: topics.some((t) => t.urgent), at: Date.now() };
    (db.legalQaLog as any[]).unshift(entry);
    if (db.legalQaLog.length > 100) db.legalQaLog.length = 100;
    saveDatabase(db);
    res.json({ ...entry, disclaimer: DISCLAIMER });
  });

  app.get('/api/legal/log', requireAuth, (req, res) => {
    const user = (req as any).user;
    const db = loadDatabase();
    ensureCollection(db);
    res.json({ log: (db.legalQaLog as any[]).filter((e) => e.userId === user.id) });
  });
}
