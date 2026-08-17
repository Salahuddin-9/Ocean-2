/**
 * Ocean — Stories 2.0 backend (feature #249)
 * -------------------------------------------
 * 24h ephemeral stories with photo/video upload, friend + close-friend feed,
 * viewers, reactions, polls, Q&A and attachable music. Expiry is lazy (pruned
 * on read) plus a 5-minute background sweep. State lives in stories.json.
 *
 * Routes:
 *   POST /api/stories               create story (mediaUrl, kind, caption, closeFriends, musicId, poll, question, location)
 *   GET  /api/stories               feed: my active stories + friends' + close-friend + private-recipient stories
 *   GET  /api/stories/mine          my active stories
 *   GET  /api/stories/:id           single story detail (marks nothing)
 *   POST /api/stories/:id/view      record a view
 *   POST /api/stories/:id/react     react (type: ❤️ 😂 😮 😢 🔥 👍 🎉)
 *   GET  /api/stories/:id/viewers   viewer list with user info
 *   POST /api/stories/:id/poll      add a poll, or vote when body.vote is set
 *   POST /api/stories/:id/question  add a question, or answer when body.answer is set
 *   GET  /api/stories/music         attachable sound library
 *   DELETE /api/stories/:id         owner deletes their story
 */
import express from 'express';
import { getCtx } from './turtleServerContext';
import { makeJsonStore } from './turtleJsonStore';

export type StoryKind = 'image' | 'video';

export interface StoryPoll {
  question: string;
  options: string[];
  votes: number[];
  votedBy: string[];
}

export interface StoryQA {
  text: string;
  answers: { id: string; text: string; by: string; byName?: string; at: number }[];
}

export interface Story {
  id: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  mediaUrl: string;
  kind: StoryKind;
  caption?: string;
  closeFriends: boolean;
  private: boolean;
  recipientIds: string[];
  location?: { lat: number; lng: number; label?: string };
  music?: { id: string; name: string; url?: string };
  poll?: StoryPoll;
  question?: StoryQA;
  viewers: { userId: string; at: number }[];
  reactions: { userId: string; type: string; at: number }[];
  createdAt: number;
  expiresAt: number;
}

interface StoriesStore {
  stories: Story[];
}

export const STORY_TTL = 24 * 60 * 60 * 1000; // 24 hours
export const REACTION_TYPES = ['❤️', '😂', '😮', '😢', '🔥', '👍', '🎉'];

export const MUSIC_LIBRARY = [
  { id: 'm1', name: 'Neon Drive', genre: 'Synthwave', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3' },
  { id: 'm2', name: 'Golden Hour', genre: 'Lo-fi', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3' },
  { id: 'm3', name: 'Monsoon Beats', genre: 'Desi Pop', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3' },
  { id: 'm4', name: 'Midnight Drive', genre: 'Synthwave', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3' },
  { id: 'm5', name: 'Boat Song', genre: 'Acoustic', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3' },
  { id: 'm6', name: 'Cha Cha Ocean', genre: 'Latin', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-6.mp3' },
  { id: 'm7', name: 'Chittagong Nights', genre: 'Folk', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-7.mp3' },
  { id: 'm8', name: 'Viral Loop', genre: 'Dance', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-8.mp3' },
];

const store = makeJsonStore<StoriesStore>('stories.json', () => ({ stories: [] }));

function uid(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

function pruneExpired(): void {
  const s = store.load();
  const now = Date.now();
  const before = s.stories.length;
  s.stories = s.stories.filter((st) => st.expiresAt > now);
  if (s.stories.length !== before) store.persist();
}

function userNameOf(db: any, id: string): string {
  const u = (db?.users || []).find((x: any) => x.id === id);
  return u ? u.name || u.username || 'User' : 'User';
}

function userAvatarOf(db: any, id: string): string | undefined {
  const u = (db?.users || []).find((x: any) => x.id === id);
  return u?.avatar || u?.avatarUrl || undefined;
}

/** Visibility: mine, my friends (mutual), close-friends (friends only), private (recipients only). */
function canView(db: any, meId: string, authorId: string, story: Story): boolean {
  if (authorId === meId) return true;
  if (story.private) return (story.recipientIds || []).includes(meId);
  const me = (db?.users || []).find((u: any) => u.id === meId);
  const author = (db?.users || []).find((u: any) => u.id === authorId);
  const meFriends: string[] = me?.friends || [];
  const authorFriends: string[] = author?.friends || [];
  const isFriend = meFriends.includes(authorId) || authorFriends.includes(meId);
  if (story.closeFriends) return isFriend;
  const authorFollowsMe = (author?.following || []).includes(meId);
  return isFriend || authorFollowsMe;
}

/** Shared store accessor so sibling backends (e.g. Snap Map #258) can write stories. */
export function getStoriesStore() {
  return store;
}

export function registerStoriesRoutes(app: express.Express) {
  const { requireAuth, loadDatabase } = getCtx();
  pruneExpired();
  const sweep = setInterval(pruneExpired, 5 * 60 * 1000);
  if (typeof sweep.unref === 'function') sweep.unref();

  /** Shared creation logic — mounted at both /api/stories and the legacy
   *  /api/stories/create alias (the App.tsx tldraw story editor posts the
   *  legacy { story: { imageUrl, caption } } shape). */
  function createStory(req: express.Request, res: express.Response) {
    const me = (req as any).user;
    const body = (req.body || {}) as any;
    // Accept both the canonical flat shape and the legacy { story: {...} } envelope.
    const storyPayload = body.story && typeof body.story === 'object' ? body.story : body;
    const mediaUrl = storyPayload.mediaUrl || storyPayload.imageUrl || '';
    const kind = storyPayload.kind || (String(mediaUrl).match(/\.(mp4|webm|mov)(\?|$)/i) ? 'video' : 'image');
    const caption = storyPayload.caption ?? storyPayload.text ?? '';
    const closeFriends = !!storyPayload.closeFriends;
    const musicId = storyPayload.musicId;
    const poll = storyPayload.poll;
    const question = storyPayload.question;
    const location = storyPayload.location;
    if (!mediaUrl || typeof mediaUrl !== 'string' || !mediaUrl.startsWith('/uploads/')) {
      return res.status(400).json({ error: 'A story requires a mediaUrl from /api/upload.' });
    }
    const stKind: StoryKind = kind === 'video' ? 'video' : 'image';
    const db = loadDatabase();
    const music = musicId ? MUSIC_LIBRARY.find((m) => m.id === musicId) : undefined;
    const story: Story = {
      id: uid('story'),
      userId: me.id,
      userName: me.name || me.username || 'User',
      userAvatar: userAvatarOf(db, me.id),
      mediaUrl,
      kind: stKind,
      caption: String(caption || '').slice(0, 200),
      closeFriends,
      private: false,
      recipientIds: [],
      location: location && typeof location.lat === 'number' ? { lat: location.lat, lng: location.lng, label: String(location.label || '') } : undefined,
      music,
      poll: poll && poll.question && Array.isArray(poll.options) && poll.options.length >= 2
        ? {
            question: String(poll.question).slice(0, 140),
            options: poll.options.slice(0, 4).map((o: string) => String(o).slice(0, 40)),
            votes: poll.options.slice(0, 4).map(() => 0),
            votedBy: [],
          }
        : undefined,
      question: question && question.text
        ? { text: String(question.text).slice(0, 140), answers: [] }
        : undefined,
      viewers: [],
      reactions: [],
      createdAt: Date.now(),
      expiresAt: Date.now() + STORY_TTL,
    };
    store.load().stories.unshift(story);
    store.persist();
    res.json({ story });
  }

  // --- Create a story -------------------------------------------------------
  app.post('/api/stories', requireAuth, createStory);
  // Legacy alias used by the tldraw story editor (posts the { story } shape).
  app.post('/api/stories/create', requireAuth, createStory);

  // --- Feed ------------------------------------------------------------------
  app.get('/api/stories', requireAuth, (req, res) => {
    const me = (req as any).user;
    const db = loadDatabase();
    pruneExpired();
    const now = Date.now();
    const visible = store.load().stories
      .filter((st) => st.expiresAt > now && canView(db, me.id, st.userId, st))
      .map((st) => ({
        ...st,
        viewed: st.viewers.some((v) => v.userId === me.id),
        viewersCount: st.viewers.length,
        reactionsCount: st.reactions.length,
        isMine: st.userId === me.id,
      }))
      .sort((a, b) => b.createdAt - a.createdAt);
    res.json({ stories: visible });
  });

  // --- My stories -------------------------------------------------------------
  app.get('/api/stories/mine', requireAuth, (req, res) => {
    const me = (req as any).user;
    pruneExpired();
    const mine = store.load().stories.filter((st) => st.userId === me.id && st.expiresAt > Date.now());
    res.json({ stories: mine });
  });

  // --- Music library ----------------------------------------------------------------------
  app.get('/api/stories/music', (_req, res) => {
    res.json({ music: MUSIC_LIBRARY });
  });

  // --- Single story -----------------------------------------------------------
  app.get('/api/stories/:id', requireAuth, (req, res) => {
    const me = (req as any).user;
    const db = loadDatabase();
    pruneExpired();
    const story = store.load().stories.find((st) => st.id === req.params.id);
    if (!story || story.expiresAt <= Date.now()) return res.status(404).json({ error: 'Story not found or expired.' });
    if (!canView(db, me.id, story.userId, story)) return res.status(403).json({ error: 'You cannot view this story.' });
    res.json({ story, reactionTypes: REACTION_TYPES });
  });

  // --- View --------------------------------------------------------------------
  app.post('/api/stories/:id/view', requireAuth, (req, res) => {
    const me = (req as any).user;
    const db = loadDatabase();
    const story = store.load().stories.find((st) => st.id === req.params.id);
    if (!story) return res.status(404).json({ error: 'Story not found.' });
    if (!canView(db, me.id, story.userId, story)) return res.status(403).json({ error: 'You cannot view this story.' });
    if (story.userId !== me.id && !story.viewers.some((v) => v.userId === me.id)) {
      story.viewers.push({ userId: me.id, at: Date.now() });
      store.persist();
    }
    res.json({ viewersCount: story.viewers.length, viewers: story.viewers.slice(-50) });
  });

  // --- React ---------------------------------------------------------------------
  app.post('/api/stories/:id/react', requireAuth, (req, res) => {
    const me = (req as any).user;
    const db = loadDatabase();
    const story = store.load().stories.find((st) => st.id === req.params.id);
    if (!story) return res.status(404).json({ error: 'Story not found.' });
    if (!canView(db, me.id, story.userId, story)) return res.status(403).json({ error: 'You cannot view this story.' });
    const type = String(req.body?.type || '❤️');
    if (!REACTION_TYPES.includes(type)) return res.status(400).json({ error: 'Unknown reaction type.' });
    const existing = story.reactions.findIndex((r) => r.userId === me.id && r.type === type);
    if (existing >= 0) story.reactions.splice(existing, 1);
    else {
      story.reactions = story.reactions.filter((r) => r.userId !== me.id);
      story.reactions.push({ userId: me.id, type, at: Date.now() });
    }
    store.persist();
    res.json({ reactionsCount: story.reactions.length, reactions: story.reactions });
  });

  // --- Viewers ---------------------------------------------------------------------
  app.get('/api/stories/:id/viewers', requireAuth, (req, res) => {
    const me = (req as any).user;
    const db = loadDatabase();
    const story = store.load().stories.find((st) => st.id === req.params.id);
    if (!story) return res.status(404).json({ error: 'Story not found.' });
    if (story.userId !== me.id) return res.status(403).json({ error: 'Only the author can see viewers.' });
    const viewers = story.viewers
      .slice()
      .reverse()
      .slice(0, 100)
      .map((v) => ({ userId: v.userId, name: userNameOf(db, v.userId), at: v.at }));
    res.json({ viewers });
  });

  // --- Poll (add or vote) ------------------------------------------------------------
  app.post('/api/stories/:id/poll', requireAuth, (req, res) => {
    const me = (req as any).user;
    const story = store.load().stories.find((st) => st.id === req.params.id);
    if (!story) return res.status(404).json({ error: 'Story not found.' });

    // Voting mode
    if (req.body?.vote !== undefined) {
      const db = loadDatabase();
      if (!canView(db, me.id, story.userId, story)) return res.status(403).json({ error: 'You cannot view this story.' });
      if (!story.poll) return res.status(400).json({ error: 'This story has no poll.' });
      const option = Number(req.body.vote);
      if (Number.isNaN(option) || option < 0 || option >= story.poll.options.length) {
        return res.status(400).json({ error: 'Invalid poll option.' });
      }
      if (story.poll.votedBy.includes(me.id)) return res.status(400).json({ error: 'You already voted.' });
      story.poll.votes[option] += 1;
      story.poll.votedBy.push(me.id);
      store.persist();
      return res.json({ poll: story.poll, total: story.poll.votes.reduce((a, b) => a + b, 0) });
    }

    // Add-poll mode (author only)
    if (story.userId !== me.id) return res.status(403).json({ error: 'Only the author can add a poll.' });
    const { question, options } = req.body || {};
    if (!question || !Array.isArray(options) || options.length < 2) {
      return res.status(400).json({ error: 'A poll needs a question and at least 2 options.' });
    }
    story.poll = {
      question: String(question).slice(0, 140),
      options: options.slice(0, 4).map((o: string) => String(o).slice(0, 40)),
      votes: options.slice(0, 4).map(() => 0),
      votedBy: [],
    };
    store.persist();
    res.json({ poll: story.poll });
  });

  // --- Question (add or answer) ----------------------------------------------------------
  app.post('/api/stories/:id/question', requireAuth, (req, res) => {
    const me = (req as any).user;
    const db = loadDatabase();
    const story = store.load().stories.find((st) => st.id === req.params.id);
    if (!story) return res.status(404).json({ error: 'Story not found.' });

    // Answer mode
    if (req.body?.answer) {
      if (!story.question) return res.status(400).json({ error: 'This story has no question.' });
      const text = String(req.body.answer).trim().slice(0, 200);
      if (!text) return res.status(400).json({ error: 'Answer text is required.' });
      story.question.answers.push({ id: uid('ans'), text, by: me.id, byName: userNameOf(db, me.id), at: Date.now() });
      store.persist();
      return res.json({ question: story.question });
    }

    // Add-question mode (author only)
    if (story.userId !== me.id) return res.status(403).json({ error: 'Only the author can add a question.' });
    const text = String(req.body?.text || '').trim().slice(0, 140);
    if (!text) return res.status(400).json({ error: 'Question text is required.' });
    story.question = { text, answers: [] };
    store.persist();
    res.json({ question: story.question });
  });

  // --- Delete (author only) ------------------------------------------------------------------
  app.delete('/api/stories/:id', requireAuth, (req, res) => {
    const me = (req as any).user;
    const s = store.load();
    const idx = s.stories.findIndex((st) => st.id === req.params.id && st.userId === me.id);
    if (idx === -1) return res.status(404).json({ error: 'Story not found or not yours.' });
    s.stories.splice(idx, 1);
    store.persist();
    res.json({ ok: true });
  });
}
