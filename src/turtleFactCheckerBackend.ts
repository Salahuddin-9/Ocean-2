/**
 * Ocean — AI Semantic Fact-Checker (Feature 144)
 * ----------------------------------------------
 * For viral posts, splits the text into claims and scores each against a
 * deterministic knowledge base (suspicious phrase lexicon + numeric/date
 * verifiability + source citation heuristics). Optional LLM review when a key is
 * present. Results attach to posts as a "Fact Context" box.
 *
 * Model (global db, idempotent ensure):
 *   db.factChecks — array of { id, postId, text, verdict, confidence, claims[], mode, createdAt }
 *   db.factKnowledge — curated false-claim phrases (seeded, appendable via API)
 *
 * Routes:
 *   POST /api/factcheck/check       { text, postId? } -> check claims, persist
 *   GET  /api/factcheck/:id                          -> one check (guest-safe)
 *   GET  /api/factcheck/recent                       -> recent checks (guest-safe)
 *   GET  /api/factcheck/post/:postId                 -> latest check for a post
 */

import express from 'express';
import { getCtx } from './turtleServerContext';
import { invokeLLM } from './server/llm';
import { ENV } from './server/env';

export type ClaimVerdict = 'likely_true' | 'disputed' | 'likely_false' | 'unverifiable';

export interface FactClaim {
  text: string;
  verdict: ClaimVerdict;
  reason: string;
}

export interface FactCheck {
  id: string;
  postId: string | null;
  text: string;
  verdict: 'verified' | 'disputed' | 'false' | 'unverified';
  confidence: number; // 0-100
  claims: FactClaim[];
  mode: 'llm' | 'template';
  createdAt: number;
  checkedBy: string | null;
}

// Phrases that strongly correlate with fabricated / viral misinformation.
const FALSE_PATTERNS = [
  'cure for covid', '5g causes', 'vaccine kills', 'miracle cure', 'drink bleach',
  '100% guaranteed', 'doctors hate', 'they dont want you to know', 'share before deleted',
  'bill gates created', 'china weapon', 'invented by', 'nasa confirms', 'government is hiding',
];

// Numeric verifiability markers — claims that cite numbers/dates are checkable.
const NUM_RE = /\b\d{1,3}(?:,\d{3})*(?:\.\d+)?\s*(%|million|billion|thousand|people|cases|deaths|taka|crore|lakh)?\b/i;
const DATE_RE = /\b(19|20)\d{2}\b/;

const SENSATIONAL_WORDS = ['shocking', 'urgent', 'breaking', 'incredible', 'unbelievable', 'secret', 'viral', 'exposed', 'truth', 'conspiracy'];

function uid(): string {
  return `fc-${Date.now()}-${Math.floor(Math.random() * 99999)}`;
}

function ensureCollections(db: any): void {
  if (!Array.isArray(db.factChecks)) db.factChecks = [];
  if (!Array.isArray(db.factKnowledge)) {
    db.factKnowledge = [
      'miracle cure for covid', '5g networks spread coronavirus', 'drinking bleach prevents infection',
      'vaccines contain microchips', 'the earth is flat', 'bananas cause cancer',
    ];
  }
}

function splitClaims(text: string): string[] {
  return String(text || '')
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 12 && s.length <= 300)
    .slice(0, 8);
}

function checkClaim(claim: string, knowledge: string[]): { verdict: ClaimVerdict; reason: string } {
  const lower = claim.toLowerCase();
  // Known-false phrase in our curated knowledge base.
  for (const k of knowledge) {
    if (lower.includes(k)) return { verdict: 'likely_false', reason: `Matches known false-claim pattern: “${k}”` };
  }
  for (const p of FALSE_PATTERNS) {
    if (lower.includes(p)) return { verdict: 'likely_false', reason: `Flagged phrase pattern: “${p}”` };
  }
  // Verifiable: has concrete numbers/dates.
  const hasData = NUM_RE.test(claim) || DATE_RE.test(claim);
  if (hasData) return { verdict: 'disputed', reason: 'Contains concrete figures — verifiable against official sources' };
  // Unverifiable opinion/rumor without data.
  return { verdict: 'unverifiable', reason: 'No verifiable figures or citations — treat as anecdotal' };
}

function templateCheck(text: string, knowledge: string[]): { verdict: FactCheck['verdict']; confidence: number; claims: FactClaim[] } {
  const claims = splitClaims(text).map((c) => {
    const { verdict, reason } = checkClaim(c, knowledge);
    return { text: c.length > 160 ? `${c.slice(0, 160)}…` : c, verdict, reason };
  });
  if (claims.length === 0) {
    return { verdict: 'unverified', confidence: 30, claims: [{ text: text.slice(0, 160), verdict: 'unverifiable', reason: 'Too short to verify' }] };
  }
  const falseCount = claims.filter((c) => c.verdict === 'likely_false').length;
  const disputedCount = claims.filter((c) => c.verdict === 'disputed').length;
  const ratio = falseCount / claims.length;
  let verdict: FactCheck['verdict'] = 'verified';
  if (ratio >= 0.5) verdict = 'false';
  else if (falseCount > 0) verdict = 'disputed';
  else if (disputedCount === claims.length) verdict = 'disputed';
  else if (disputedCount > 0) verdict = 'unverified';
  const confidence = Math.round(
    verdict === 'false' ? 80 + ratio * 20 : verdict === 'disputed' ? 62 : verdict === 'verified' ? 58 : 45
  );
  return { verdict, confidence, claims };
}

function extractText(content: unknown): string {
  if (!content) return '';
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((c) => (typeof c === 'string' ? c : typeof (c as any)?.text === 'string' ? (c as any).text : ''))
      .join('\n');
  }
  return '';
}

function stripJsonFences(raw: string): string {
  return raw.replace(/```(?:json)?/gi, '').trim();
}

function sanitizeVerdict(v: unknown): ClaimVerdict {
  return v === 'likely_true' || v === 'disputed' || v === 'likely_false' || v === 'unverifiable' ? v : 'unverifiable';
}

export function registerFactCheckerRoutes(app: express.Express): void {
  const { loadDatabase, saveDatabase, getRequestUser } = getCtx();

  // POST /api/factcheck/check
  app.post('/api/factcheck/check', async (req, res) => {
    try {
      const me = getRequestUser(req);
      const body = req.body || {};
      const text = String(body.text || '').slice(0, 6000);
      const postId = typeof body.postId === 'string' && body.postId ? body.postId : null;
      if (!text.trim()) return res.status(400).json({ error: 'text is required.' });

      const db = loadDatabase();
      ensureCollections(db);
      let result = templateCheck(text, db.factKnowledge);

      const keyPresent = !!(ENV.forgeApiKey || process.env.GEMINI_API_KEY);
      if (keyPresent && splitClaims(text).length >= 2) {
        try {
          const llm = await invokeLLM({
            messages: [
              {
                role: 'system',
                content:
                  'You are a cautious fact-checker. For each claim reply with JSON only: {"claims": [{"text": string, "verdict": "likely_true"|"disputed"|"likely_false"|"unverifiable", "reason": string}], "verdict": "verified"|"disputed"|"false"|"unverified", "confidence": number(0-100)}. Never invent sources. No markdown.',
              },
              { role: 'user', content: text },
            ],
            model: 'gemini-3.5-flash',
            maxTokens: 700,
            responseFormat: { type: 'json_object' },
          });
          const raw = extractText(llm.choices?.[0]?.message?.content);
          const parsed = JSON.parse(stripJsonFences(raw || '{}'));
          if (Array.isArray(parsed?.claims) && parsed.claims.length > 0) {
            result = {
              verdict:
                parsed.verdict === 'verified' || parsed.verdict === 'disputed' || parsed.verdict === 'false' || parsed.verdict === 'unverified'
                  ? parsed.verdict
                  : result.verdict,
              confidence: Math.max(0, Math.min(100, Math.round(Number(parsed.confidence) || result.confidence))),
              claims: parsed.claims
                .map((c: any) => ({
                  text: String(c?.text || '').slice(0, 200),
                  verdict: sanitizeVerdict(c?.verdict),
                  reason: String(c?.reason || '').slice(0, 200),
                }))
                .filter((c: FactClaim) => c.text.length > 0)
                .slice(0, 10),
            };
          }
        } catch (e: any) {
          console.warn('[factcheck] llm error:', e?.message || e);
        }
      }

      const check: FactCheck = {
        id: uid(),
        postId,
        text: text.slice(0, 300),
        verdict: result.verdict,
        confidence: result.confidence,
        claims: result.claims,
        mode: keyPresent ? 'llm' : 'template',
        createdAt: Date.now(),
        checkedBy: me?.id ?? null,
      };
      const list = db.factChecks as FactCheck[];
      list.unshift(check);
      if (list.length > 200) list.length = 200;
      saveDatabase(db);
      res.json({ check });
    } catch (e: any) {
      console.warn('[factcheck] error:', e?.message || e);
      res.status(500).json({ error: 'Fact-check failed.' });
    }
  });

  // GET /api/factcheck/recent
  // Registered BEFORE /api/factcheck/:id so Express matches the static path
  // first (otherwise a request for "/recent" is captured by the :id param
  // route and returns 404 "Check not found.").
  app.get('/api/factcheck/recent', (req, res) => {
    const db = loadDatabase();
    ensureCollections(db);
    res.json({ checks: (db.factChecks as FactCheck[]).slice(0, 30) });
  });

  // GET /api/factcheck/:id
  app.get('/api/factcheck/:id', (req, res) => {
    const db = loadDatabase();
    ensureCollections(db);
    const check = (db.factChecks as FactCheck[]).find((c) => c.id === req.params.id);
    if (!check) return res.status(404).json({ error: 'Check not found.' });
    res.json({ check });
  });

  // GET /api/factcheck/post/:postId
  app.get('/api/factcheck/post/:postId', (req, res) => {
    const db = loadDatabase();
    ensureCollections(db);
    const check = (db.factChecks as FactCheck[]).find((c) => c.postId === req.params.postId);
    if (!check) return res.status(404).json({ error: 'No fact-check for this post yet.' });
    res.json({ check });
  });
}
