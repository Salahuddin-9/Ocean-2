/**
 * Ocean — AI Mock Interview Room (Feature 192)
 * --------------------------------------------
 * A practice interviewer: pick a role, answer a sequence of questions, get a
 * scored evaluation. Questions come from role-specific banks; answers are
 * scored deterministically by keyword coverage + length (a real deployment can
 * swap scoring for the LLM via invokeLLM).
 *
 * Model (global db, idempotent ensure):
 *   db.interviewSessions — array of { id, userId, role, status: 'active'|'done',
 *                           questionIdx, questions: string[], answers: {q, a, score}[],
 *                           totalScore, createdAt }
 *
 * Routes:
 *   POST /api/interview/start       (auth) { role }
 *   GET  /api/interview/:id         (auth) current question
 *   POST /api/interview/:id/answer  (auth) { text } -> score, next question or done
 *   GET  /api/interview             (auth) my sessions
 */

import express from 'express';
import { getCtx } from './turtleServerContext';
import { invokeLLM } from './server/llm';
import { ENV } from './server/env';

export interface InterviewAnswer {
  q: string;
  a: string;
  score: number;
}

export interface InterviewSession {
  id: string;
  userId: string;
  role: string;
  status: 'active' | 'done';
  questionIdx: number;
  questions: string[];
  answers: InterviewAnswer[];
  totalScore: number;
  createdAt: number;
}

const ROLES: Record<string, string[]> = {
  'frontend': [
    'Tell me about a tricky UI bug you fixed and how you debugged it.',
    'How does the browser render a page after you change a CSS property?',
    'Explain the difference between controlled and uncontrolled React components.',
    'How would you improve the performance of a slow React list?',
  ],
  'backend': [
    'Explain what happens when a user hits your API endpoint end to end.',
    'How do you design a database schema for a chat application?',
    'What is the difference between SQL and NoSQL, and when would you use each?',
    'How do you handle rate limiting and abuse on a public API?',
  ],
  'data': [
    'Walk me through how you would analyze a messy dataset.',
    'What is the difference between correlation and causation?',
    'How do you handle missing data in a dataset?',
    'Explain a metric you would track for a social media app and why.',
  ],
  'product': [
    'How would you prioritize features with limited engineering capacity?',
    'Tell me about a product decision you made with incomplete data.',
    'How do you measure the success of a new feature?',
    'Walk me through how you would launch a feature to 1% of users.',
  ],
  'general': [
    'Tell me about yourself and your strongest skill.',
    'Describe a time you handled a conflict on a team.',
    'What are you learning right now, and why?',
    'Where do you see yourself in two years?',
  ],
};

const KEYWORDS: Record<string, string[]> = {
  frontend: ['react', 'component', 'render', 'css', 'browser', 'dom', 'state', 'performance', 'debug', 'test', 'api'],
  backend: ['database', 'api', 'cache', 'sql', 'server', 'auth', 'scale', 'queue', 'security', 'error', 'latency'],
  data: ['data', 'metric', 'analysis', 'statistics', 'correlation', 'bias', 'visualization', 'sql', 'python', 'sample'],
  product: ['user', 'metric', 'priority', 'experiment', 'feedback', 'roadmap', 'launch', 'data', 'impact', 'customer'],
  general: ['team', 'learn', 'skill', 'project', 'goal', 'work', 'problem', 'help', 'improve', 'result'],
};

function uid(): string {
  return `iv-${Date.now()}-${Math.floor(Math.random() * 99999)}`;
}

function ensureCollection(db: any): void {
  if (!Array.isArray(db.interviewSessions)) db.interviewSessions = [];
}

export function scoreAnswer(role: string, q: string, a: string): number {
  const text = a.toLowerCase();
  const kws = KEYWORDS[role] || KEYWORDS.general;
  const hits = kws.filter((k) => text.includes(k)).length;
  const lengthScore = text.length >= 180 ? 40 : text.length >= 90 ? 25 : Math.round((text.length / 90) * 25);
  const relevance = text.includes(q.toLowerCase().slice(0, 8)) ? 10 : 0;
  return Math.min(100, hits * 6 + lengthScore + relevance);
}

/**
 * Constructive feedback for the deterministic keyword scorer (Feature 192).
 * Mirrors the shape of the LLM path (score + short advice) so the interview
 * always gives the candidate something actionable, even with no AI key set:
 * praises used domain terms, names the missing ones, and nudges structure.
 */
export function keywordFeedback(role: string, a: string, score: number): string {
  const bank = KEYWORDS[role] || KEYWORDS.general;
  const used = bank.filter((k) => a.toLowerCase().includes(k));
  const missing = bank.filter((k) => !a.toLowerCase().includes(k));
  const pick = (list: string[], n: number) => list.slice(0, n).join(', ');
  if (score >= 80) {
    return `Strong answer — you hit key ${role} concepts (${pick(used, 4)}). Locking it in with one concrete example would make it exceptional.`;
  }
  if (score >= 60) {
    return `Good coverage — ${used.length} relevant ${role} term${used.length === 1 ? '' : 's'} (${pick(used, 3)}). Go one level deeper with a specific example to push this higher.`;
  }
  if (score >= 40) {
    return `Reasonable start — weave in more domain language (try ${pick(missing, 3)}) and structure your answer around a concrete situation, action, and result.`;
  }
  return `Answer is too vague or short. Use the STAR format and concrete ${role} terminology (e.g. ${pick(missing, 3)}) so the interviewer can see your depth.`;
}

function stripJsonFences(raw: string): string {
  return raw.replace(/```(?:json)?/gi, '').trim();
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

/**
 * LLM-backed answer evaluation (Feature 192 completion).
 * When an LLM key is configured the model grades the answer against the
 * question + role rubric and returns a 0-100 score with a short comment.
 * Falls back to the deterministic keyword scorer on any failure so the
 * interview never breaks.
 */
export async function scoreAnswerWithLLM(role: string, q: string, a: string): Promise<{ score: number; feedback: string; mode: 'llm' | 'keyword' }> {
  const fallbackScore = scoreAnswer(role, q, a);
  const fallback = { score: fallbackScore, feedback: keywordFeedback(role, a, fallbackScore), mode: 'keyword' as const };
  const keyPresent = !!(ENV.forgeApiKey || process.env.GEMINI_API_KEY);
  if (!keyPresent) return fallback;
  try {
    const roleLabel = ROLES[role] ? role.charAt(0).toUpperCase() + role.slice(1) : 'General';
    const result = await invokeLLM({
      messages: [
        {
          role: 'system',
          content:
            `You are a ${roleLabel} interview evaluator. Grade the candidate's answer to the question on a 0-100 scale. ` +
            'Reply with JSON only, no markdown: {"score": number(0-100), "feedback": string(<=180 chars, one sentence of constructive advice)}. ' +
            'Be fair: reward structure, specific technical detail and clarity; penalize vagueness and off-topic replies.',
        },
        { role: 'user', content: `Question: ${q}\n\nCandidate answer: ${a}` },
      ],
      model: 'gemini-3.5-flash',
      maxTokens: 300,
      responseFormat: { type: 'json_object' },
    });
    const raw = extractText(result.choices?.[0]?.message?.content);
    const parsed = JSON.parse(stripJsonFences(raw) || '{}');
    const score = Math.max(0, Math.min(100, Math.round(Number(parsed.score) || fallback.score)));
    const feedback = String(parsed.feedback || '').slice(0, 200);
    return { score, feedback, mode: 'llm' };
  } catch (e: any) {
    console.warn('[interview] llm scoring failed, using keyword scorer:', e?.message || e);
    return fallback;
  }
}

export function registerInterviewRoutes(app: express.Express): void {
  const { requireAuth, loadDatabase, saveDatabase } = getCtx();

  app.post('/api/interview/start', requireAuth, (req, res) => {
    const user = (req as any).user;
    const role = String((req.body || {}).role || 'general');
    const questions = ROLES[role] || ROLES.general;
    const db = loadDatabase();
    ensureCollection(db);
    const session: InterviewSession = {
      id: uid(),
      userId: user.id,
      role,
      status: 'active',
      questionIdx: 0,
      questions,
      answers: [],
      totalScore: 0,
      createdAt: Date.now(),
    };
    (db.interviewSessions as InterviewSession[]).unshift(session);
    saveDatabase(db);
    res.json({ session, question: questions[0], progress: { current: 1, total: questions.length } });
  });

  app.get('/api/interview/:id', (req, res) => {
    const db = loadDatabase();
    ensureCollection(db);
    const session = (db.interviewSessions as InterviewSession[]).find((s) => s.id === req.params.id);
    if (!session) return res.status(404).json({ error: 'Session not found.' });
    const done = session.status === 'done';
    res.json({
      session,
      question: done ? null : session.questions[session.questionIdx],
      progress: { current: done ? session.questions.length : session.questionIdx + 1, total: session.questions.length },
      done,
    });
  });

  app.post('/api/interview/:id/answer', requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      const text = String((req.body || {}).text || '').trim();
      const db = loadDatabase();
      ensureCollection(db);
      const session = (db.interviewSessions as InterviewSession[]).find((s) => s.id === req.params.id);
      if (!session) return res.status(404).json({ error: 'Session not found.' });
      if (session.userId !== user.id) return res.status(403).json({ error: 'Only the participant can answer.' });
      if (session.status === 'done') return res.status(400).json({ error: 'Interview already finished.' });
      if (text.length < 10) return res.status(400).json({ error: 'Answer is too short — give it a real try.' });

      const q = session.questions[session.questionIdx];
      const graded = await scoreAnswerWithLLM(session.role, q, text);
      const score = graded.score;
      session.answers.push({ q, a: text.slice(0, 2000), score });
      session.totalScore = Math.round(session.answers.reduce((s, x) => s + x.score, 0) / session.answers.length);
      session.questionIdx += 1;
      if (session.questionIdx >= session.questions.length) session.status = 'done';
      saveDatabase(db);

      res.json({
        score,
        feedback: graded.feedback,
        mode: graded.mode,
        done: session.status === 'done',
        question: session.status === 'done' ? null : session.questions[session.questionIdx],
        progress: { current: session.questionIdx + (session.status === 'done' ? 0 : 1), total: session.questions.length },
        totalScore: session.status === 'done' ? session.totalScore : null,
      });
    } catch (err: any) {
      console.error('[interview] answer route error:', err);
      res.status(500).json({ error: err?.message || 'Failed to evaluate answer.' });
    }
  });

  app.get('/api/interview', requireAuth, (req, res) => {
    const user = (req as any).user;
    const db = loadDatabase();
    ensureCollection(db);
    const mine = (db.interviewSessions as InterviewSession[]).filter((s) => s.userId === user.id).sort((a, b) => b.createdAt - a.createdAt);
    res.json({ sessions: mine });
  });
}
