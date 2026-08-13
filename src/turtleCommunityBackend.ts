/**
 * Turtle Community Backend — data/logic engine for the community feature set
 * (ported feature concepts from base44-social-media + arena-ai):
 *   - Events   (create, RSVP, attendees)
 *   - Questions(Q&A posts, answers, votes)
 *   - Topics   (browse topic communities)
 *   - Creator Studio (per-creator content analytics)
 *   - Rewards  (trust-based badge/reward catalogue)
 *   - Tips     (creator tipping with virtual balance)
 *
 * Storage lives in the `community` object inside database.json, managed by the
 * server routes (server.ts). This module is pure logic + types.
 */

export interface CommunityEvent {
  id: string;
  title: string;
  description: string;
  category: string;
  location: string;
  date: number; // timestamp ms
  capacity: number;
  createdBy: string;
  createdAt: number;
  attendees: string[]; // user ids
}

export interface CommunityQuestion {
  id: string;
  text: string;
  category: string;
  askedBy: string;
  askedAt: number;
  answers: { id: string; text: string; by: string; at: number; upvotes: string[] }[];
}

export interface CommunityTopic {
  id: string;
  name: string;
  emoji: string;
  description: string;
  members: string[]; // user ids
}

export interface CommunityTip {
  id: string;
  from: string;
  to: string;
  amount: number;
  note?: string;
  at: number;
}

export interface RewardDefinition {
  id: string;
  name: string;
  description: string;
  cost: number; // trust points
  emoji: string;
}

export interface CommunityState {
  events: CommunityEvent[];
  questions: CommunityQuestion[];
  topics: CommunityTopic[];
  tips: CommunityTip[];
  balances: Record<string, number>; // user id -> virtual balance
}

export const EMPTY_COMMUNITY: CommunityState = {
  events: [],
  questions: [],
  topics: [],
  tips: [],
  balances: {},
};

export const DEFAULT_REWARDS: RewardDefinition[] = [
  { id: 'verified-badge', name: 'Verified Badge', description: 'Permanent verified checkmark', cost: 500, emoji: '✅' },
  { id: 'profile-frame', name: 'Creator Frame', description: 'Exclusive profile avatar frame', cost: 300, emoji: '🖼️' },
  { id: 'boost-pin', name: 'Featured Pin', description: 'Pin one post to the top of your profile', cost: 400, emoji: '📌' },
  { id: 'custom-theme', name: 'Custom Theme', description: 'Unlock a custom accent theme', cost: 350, emoji: '🎨' },
];

export function defaultCommunity(): CommunityState {
  return JSON.parse(JSON.stringify(EMPTY_COMMUNITY)) as CommunityState;
}

export function communityFrom(data: any): CommunityState {
  if (!data) return defaultCommunity();
  return {
    events: Array.isArray(data.events) ? data.events : [],
    questions: Array.isArray(data.questions) ? data.questions : [],
    topics: Array.isArray(data.topics) ? data.topics : [],
    tips: Array.isArray(data.tips) ? data.tips : [],
    balances: data.balances && typeof data.balances === 'object' ? data.balances : {},
  };
}

// ── Events ───────────────────────────────────────────────────────────────────
export function createEvent(state: CommunityState, ev: Omit<CommunityEvent, 'id' | 'createdAt' | 'attendees'>): CommunityEvent {
  const event: CommunityEvent = {
    ...ev,
    id: `event-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    createdAt: Date.now(),
    attendees: [ev.createdBy],
  };
  state.events.unshift(event);
  return event;
}

export function rsvpEvent(state: CommunityState, eventId: string, userId: string): { ok: boolean; reason?: string } {
  const ev = state.events.find((e) => e.id === eventId);
  if (!ev) return { ok: false, reason: 'Event not found' };
  if (ev.attendees.includes(userId)) {
    ev.attendees = ev.attendees.filter((a) => a !== userId);
    return { ok: true };
  }
  if (ev.capacity > 0 && ev.attendees.length >= ev.capacity) {
    return { ok: false, reason: 'Event is full' };
  }
  ev.attendees.push(userId);
  return { ok: true };
}

// ── Questions ────────────────────────────────────────────────────────────────
export function askQuestion(state: CommunityState, q: { text: string; category?: string; askedBy: string }): CommunityQuestion {
  const question: CommunityQuestion = {
    id: `q-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    text: q.text,
    category: q.category || 'general',
    askedBy: q.askedBy,
    askedAt: Date.now(),
    answers: [],
  };
  state.questions.unshift(question);
  return question;
}

export function answerQuestion(
  state: CommunityState,
  questionId: string,
  a: { text: string; by: string },
): CommunityQuestion | null {
  const q = state.questions.find((x) => x.id === questionId);
  if (!q) return null;
  q.answers.push({ id: `a-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, text: a.text, by: a.by, at: Date.now(), upvotes: [] });
  return q;
}

export function upvoteAnswer(state: CommunityState, questionId: string, answerId: string, userId: string): void {
  const q = state.questions.find((x) => x.id === questionId);
  const a = q?.answers.find((y) => y.id === answerId);
  if (!a) return;
  if (a.upvotes.includes(userId)) a.upvotes = a.upvotes.filter((u) => u !== userId);
  else a.upvotes.push(userId);
}

// ── Topics ───────────────────────────────────────────────────────────────────
export function ensureDefaultTopics(state: CommunityState): void {
  if (state.topics.length > 0) return;
  const seed = [
    { id: 'topic-design', name: 'Design', emoji: '🎨', description: 'UI/UX, product & visual design' },
    { id: 'topic-coding', name: 'Coding', emoji: '💻', description: 'Software, web & AI projects' },
    { id: 'topic-music', name: 'Music', emoji: '🎵', description: 'Artists, tracks & production' },
    { id: 'topic-ai', name: 'AI', emoji: '🤖', description: 'Machine learning & generative AI' },
    { id: 'topic-art', name: 'Art', emoji: '🖌️', description: 'Illustration, photography & film' },
  ];
  state.topics = seed.map((t) => ({ ...t, members: [] }));
}

export function joinTopic(state: CommunityState, topicId: string, userId: string): void {
  const t = state.topics.find((x) => x.id === topicId);
  if (!t) return;
  if (!t.members.includes(userId)) t.members.push(userId);
}

// ── Tips & Rewards ───────────────────────────────────────────────────────────
export function addBalance(state: CommunityState, userId: string, amount: number): number {
  state.balances[userId] = (state.balances[userId] || 0) + amount;
  return state.balances[userId];
}

export function spendBalance(state: CommunityState, userId: string, amount: number): boolean {
  const bal = state.balances[userId] || 0;
  if (bal < amount) return false;
  state.balances[userId] = bal - amount;
  return true;
}

export function tipCreator(state: CommunityState, from: string, to: string, amount: number, note?: string): boolean {
  if (!spendBalance(state, from, amount)) return false;
  addBalance(state, to, amount);
  state.tips.push({ id: `tip-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, from, to, amount, note, at: Date.now() });
  return true;
}

/** Reward earning: trust points (from turtleProfileMetrics-style trust score). */
export function trustPointsForUser(state: CommunityState, userId: string, trustScore: number): number {
  return Math.round(trustScore * 100) + (state.balances[userId] || 0);
}
