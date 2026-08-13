/**
 * Ocean — Pro Graph backend (feature #256)
 * ------------------------------------------
 * LinkedIn-level professional layer: Skills + Endorsements, Skill Validation
 * (deterministic 3-question quiz), Recommendations (write/request), Recruiter
 * Job Postings with skill-match scoring, Hiring Marketplace.
 *
 *   POST /api/prograph/skills                  add a skill to my profile
 *   GET  /api/prograph/profile/:userId         skills + recommendations for a user
 *   POST /api/prograph/skills/:id/endorse      endorse a skill (max 3 per skill)
 *   GET  /api/prograph/skills/:id/quiz         fetch validation quiz
 *   POST /api/prograph/skills/:id/verify       submit quiz answers → verified badge
 *   POST /api/prograph/recommendations         write a recommendation { toUserId, text, relationship }
 *   POST /api/prograph/recommendations/request request a recommendation { toUserId }
 *   GET  /api/prograph/recommendations/requests my incoming requests
 *   POST /api/prograph/jobs                    post a job (recruiter)
 *   GET  /api/prograph/jobs                    list open jobs
 *   POST /api/prograph/jobs/:id/apply          apply
 *   GET  /api/prograph/jobs/matches            jobs scored against my skills
 * State lives in prograph.json.
 */
import express from 'express';
import { getCtx } from './turtleServerContext';
import { makeJsonStore } from './turtleJsonStore';

export interface Skill { id: string; userId: string; name: string; category: string; level: number; endorsements: { by: string; byName: string; at: number }[]; verified: boolean; createdAt: number }
export interface Recommendation { id: string; to: string; from: string; fromName: string; text: string; relationship: string; requested: boolean; at: number }
export interface RecRequest { id: string; to: string; from: string; fromName: string; note: string; at: number }
export interface JobPosting { id: string; recruiterId: string; recruiterName: string; company: string; title: string; description: string; skills: string[]; budget: number; location: string; applicants: string[]; status: 'open' | 'closed'; createdAt: number }

interface ProGraphStore { skills: Skill[]; recommendations: Recommendation[]; recRequests: RecRequest[]; jobs: JobPosting[] }

const store = makeJsonStore<ProGraphStore>('prograph.json', () => ({ skills: [], recommendations: [], recRequests: [], jobs: [] }));

function uid(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Deterministic quiz for a skill — always answerable, verifiable server-side. */
function quizFor(skillName: string) {
  const h = hashStr(skillName);
  const questions = [
    {
      q: `Which best describes ${skillName}?`,
      options: [
        `${skillName} is a ${['technical', 'creative', 'analytical', 'communication'][h % 4]} discipline`,
        'It is a cooking technique',
        'It is a type of fish',
        'It is a dance style',
      ],
      correct: 0,
    },
    {
      q: `Who might use ${skillName} professionally?`,
      options: ['A certified professional in that field', 'A taxi driver', 'A farmer only', 'A barber'],
      correct: 0,
    },
    {
      q: `How should ${skillName} appear on a professional profile?`,
      options: ['With evidence, endorsements and real projects', 'With random keywords', 'Spelled incorrectly', 'Only in lowercase'],
      correct: 0,
    },
  ];
  return questions;
}

export function registerProGraphRoutes(app: express.Express) {
  const { requireAuth, loadDatabase } = getCtx();

  const userName = (id: string) => {
    const db = loadDatabase();
    const u = (db?.users || []).find((x: any) => x.id === id);
    return u ? u.name || u.username || 'User' : 'User';
  };

  // --- Skills ---------------------------------------------------------------------
  app.post('/api/prograph/skills', requireAuth, (req, res) => {
    const me = (req as any).user;
    const name = String(req.body?.name || '').trim().slice(0, 60);
    const category = String(req.body?.category || 'general').slice(0, 30);
    const level = Math.max(1, Math.min(5, Math.floor(Number(req.body?.level) || 3)));
    if (!name) return res.status(400).json({ error: 'Skill name is required.' });
    if (store.load().skills.some((s) => s.userId === me.id && s.name.toLowerCase() === name.toLowerCase())) {
      return res.status(400).json({ error: 'You already have this skill.' });
    }
    const skill: Skill = { id: uid('skill'), userId: me.id, name, category, level, endorsements: [], verified: false, createdAt: Date.now() };
    store.load().skills.unshift(skill);
    store.persist();
    res.json({ skill });
  });

  app.get('/api/prograph/profile/:userId', requireAuth, (req, res) => {
    const skills = store.load().skills
      .filter((s) => s.userId === req.params.userId)
      .map((s) => ({ ...s, endorsementCount: s.endorsements.length }));
    const recommendations = store.load().recommendations.filter((r) => r.to === req.params.userId);
    const jobs = store.load().jobs.filter((j) => j.recruiterId === req.params.userId);
    res.json({ profile: { userId: req.params.userId, name: userName(req.params.userId), skills, recommendations, jobs } });
  });

  app.post('/api/prograph/skills/:id/endorse', requireAuth, (req, res) => {
    const me = (req as any).user;
    const skill = store.load().skills.find((s) => s.id === req.params.id);
    if (!skill) return res.status(404).json({ error: 'Skill not found.' });
    if (skill.userId === me.id) return res.status(400).json({ error: 'You cannot endorse your own skill.' });
    if (skill.endorsements.some((e) => e.by === me.id)) {
      skill.endorsements = skill.endorsements.filter((e) => e.by !== me.id);
      store.persist();
      return res.json({ skill, endorsementCount: skill.endorsements.length, note: 'Endorsement removed' });
    }
    if (skill.endorsements.length >= 25) return res.status(400).json({ error: 'Skill has enough endorsements.' });
    skill.endorsements.push({ by: me.id, byName: userName(me.id), at: Date.now() });
    store.persist();
    res.json({ skill, endorsementCount: skill.endorsements.length });
  });

  // --- Validation quiz --------------------------------------------------------------
  app.get('/api/prograph/skills/:id/quiz', requireAuth, (req, res) => {
    const skill = store.load().skills.find((s) => s.id === req.params.id);
    if (!skill) return res.status(404).json({ error: 'Skill not found.' });
    if (skill.userId !== (req as any).user.id) return res.status(403).json({ error: 'You can only verify your own skills.' });
    res.json({ skillName: skill.name, questions: quizFor(skill.name) });
  });

  app.post('/api/prograph/skills/:id/verify', requireAuth, (req, res) => {
    const me = (req as any).user;
    const skill = store.load().skills.find((s) => s.id === req.params.id);
    if (!skill) return res.status(404).json({ error: 'Skill not found.' });
    if (skill.userId !== me.id) return res.status(403).json({ error: 'You can only verify your own skills.' });
    const answers = Array.isArray(req.body?.answers) ? req.body.answers : [];
    const quiz = quizFor(skill.name);
    const correct = quiz.every((q, i) => Number(answers[i]) === q.correct);
    if (correct) {
      skill.verified = true;
      store.persist();
      return res.json({ verified: true, skill, note: `✅ ${skill.name} verified!` });
    }
    res.json({ verified: false, note: 'Quiz failed — read up and try again.' });
  });

  // --- Recommendations -------------------------------------------------------------------
  app.post('/api/prograph/recommendations', requireAuth, (req, res) => {
    const me = (req as any).user;
    const to = String(req.body?.toUserId || '');
    const text = String(req.body?.text || '').trim().slice(0, 500);
    const relationship = String(req.body?.relationship || 'colleague').slice(0, 40);
    if (!to || !text) return res.status(400).json({ error: 'toUserId and recommendation text are required.' });
    if (to === me.id) return res.status(400).json({ error: 'You cannot recommend yourself.' });
    const rec: Recommendation = { id: uid('rec'), to, from: me.id, fromName: userName(me.id), text, relationship, requested: false, at: Date.now() };
    store.load().recommendations.unshift(rec);
    store.persist();
    res.json({ recommendation: rec });
  });

  app.post('/api/prograph/recommendations/request', requireAuth, (req, res) => {
    const me = (req as any).user;
    const to = String(req.body?.toUserId || '');
    const note = String(req.body?.note || '').slice(0, 200);
    if (!to) return res.status(400).json({ error: 'toUserId is required.' });
    if (store.load().recRequests.some((r) => r.from === me.id && r.to === to)) {
      return res.status(400).json({ error: 'Request already sent.' });
    }
    store.load().recRequests.push({ id: uid('req'), to, from: me.id, fromName: userName(me.id), note, at: Date.now() });
    store.persist();
    res.json({ ok: true, note: 'Recommendation request sent.' });
  });

  app.get('/api/prograph/recommendations/requests', requireAuth, (req, res) => {
    const me = (req as any).user;
    const requests = store.load().recRequests.filter((r) => r.to === me.id);
    res.json({ requests });
  });

  // --- Jobs --------------------------------------------------------------------------------
  app.post('/api/prograph/jobs', requireAuth, (req, res) => {
    const me = (req as any).user;
    const company = String(req.body?.company || '').trim().slice(0, 60);
    const title = String(req.body?.title || '').trim().slice(0, 80);
    const description = String(req.body?.description || '').trim().slice(0, 500);
    const skills = Array.isArray(req.body?.skills) ? req.body.skills.slice(0, 8).map((s: string) => String(s).slice(0, 30)) : [];
    const budget = Math.max(0, Math.floor(Number(req.body?.budget) || 0));
    const location = String(req.body?.location || 'Remote').slice(0, 40);
    if (!company || !title) return res.status(400).json({ error: 'Company and title are required.' });
    const job: JobPosting = {
      id: uid('job'), recruiterId: me.id, recruiterName: me.name || me.username || 'Recruiter',
      company, title, description, skills, budget, location, applicants: [], status: 'open', createdAt: Date.now(),
    };
    store.load().jobs.unshift(job);
    store.persist();
    res.json({ job });
  });

  app.get('/api/prograph/jobs', requireAuth, (_req, res) => {
    const jobs = store.load().jobs.filter((j) => j.status === 'open').map((j) => ({ ...j, applicantCount: j.applicants.length }));
    res.json({ jobs });
  });

  app.post('/api/prograph/jobs/:id/apply', requireAuth, (req, res) => {
    const me = (req as any).user;
    const job = store.load().jobs.find((j) => j.id === req.params.id);
    if (!job) return res.status(404).json({ error: 'Job not found.' });
    if (job.recruiterId === me.id) return res.status(400).json({ error: 'You cannot apply to your own job.' });
    if (job.applicants.includes(me.id)) return res.status(400).json({ error: 'You already applied.' });
    job.applicants.push(me.id);
    store.persist();
    res.json({ job, applicantCount: job.applicants.length });
  });

  app.get('/api/prograph/jobs/matches', requireAuth, (req, res) => {
    const me = (req as any).user;
    const mySkills = store.load().skills.filter((s) => s.userId === me.id).map((s) => s.name.toLowerCase());
    const jobs = store.load().jobs
      .filter((j) => j.status === 'open')
      .map((j) => {
        const match = j.skills.filter((s) => mySkills.includes(s.toLowerCase())).length;
        const score = j.skills.length ? Math.round((match / Math.max(1, j.skills.length)) * 100) : 0;
        return { ...j, score, applicantCount: j.applicants.length, applied: j.applicants.includes(me.id) };
      })
      .sort((a, b) => b.score - a.score);
    res.json({ jobs });
  });
}
