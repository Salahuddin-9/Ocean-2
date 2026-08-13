/**
 * Ocean — Anonymous & Pseudonymous Backend
 * ---------------------------------------
 * Self-contained registered module owning its own routes.
 * Follows the server.ts context seam pattern via getCtx().
 */

import { getCtx } from './turtleServerContext';

const WORD_PAIRS = [
  ['quiet', 'lotus'],
  ['silent', 'wave'],
  ['hidden', 'star'],
  ['secret', 'shore'],
  ['soft', 'breeze'],
  ['gentle', 'tide'],
  ['calm', 'moon'],
  ['peace', 'dawn'],
  ['still', 'water'],
  ['pure', 'light'],
  ['wild', 'rose'],
  ['free', 'bird'],
  ['deep', 'ocean'],
  ['bright', 'sky'],
  ['swift', 'wind'],
  ['bold', 'heart'],
  ['kind', 'soul'],
  ['wise', 'owl'],
  ['swift', 'fox'],
  ['gentle', 'deer'],
  ['mystic', 'veil'],
  ['shadow', 'dance'],
  ['whisper', 'pine'],
  ['echo', 'valley'],
  ['drift', 'wood'],
  ['amber', 'glow'],
  ['velvet', 'night'],
  ['crystal', 'clear'],
  ['golden', 'hour'],
  ['silver', 'lining'],
  ['ruby', 'dawn'],
];

function generateHandle(existingHandles: Set<string>): string {
  for (const [adj, noun] of WORD_PAIRS) {
    const base = `${adj}_${noun}`;
    if (!existingHandles.has(base)) return base;
    for (let i = 2; i < 100; i++) {
      const candidate = `${base}${i}`;
      if (!existingHandles.has(candidate)) return candidate;
    }
  }
  // Fallback: random adjective_noun with number
  const adj = WORD_PAIRS[Math.floor(Math.random() * WORD_PAIRS.length)][0];
  const noun = WORD_PAIRS[Math.floor(Math.random() * WORD_PAIRS.length)][1];
  return `${adj}_${noun}_${Math.floor(Math.random() * 10000)}`;
}

export function registerAnonymousRoutes(app: any): void {
  const { requireAuth, loadDatabase, saveDatabase } = getCtx();

  // POST /api/anonymous/pseudonym - Create pseudonym
  app.post('/api/anonymous/pseudonym', requireAuth, (req: any, res: any) => {
    try {
      const user = req.user;
      const userId = user.id;
      const { displayName, avatarEmoji } = req.body || {};

      const db = loadDatabase();

      // Ensure pseudonyms array exists
      if (!Array.isArray(db.pseudonyms)) db.pseudonyms = [];

      // Check if user already has a pseudonym
      const existing = db.pseudonyms.find((p: any) => p.userId === userId);
      if (existing) {
        return res.status(400).json({ error: 'Pseudonym already exists. Use PUT to update.' });
      }

      // Build existing handles set for uniqueness
      const existingHandles: Set<string> = new Set<string>((db.pseudonyms ?? []).map((p: any) => String(p.handle)));

      const pseudonym = {
        id: `pseudo_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        userId,
        handle: generateHandle(existingHandles),
        displayName: displayName?.slice(0, 30) || 'Anonymous',
        avatarEmoji: avatarEmoji || '🌊',
        createdAt: Date.now(),
      };

      db.pseudonyms.push(pseudonym);
      saveDatabase(db);

      // Return without userId
      const { userId: _omit, ...publicPseudonym } = pseudonym;
      res.json({ pseudonym: publicPseudonym });
    } catch (e: any) {
      console.error('Create pseudonym error:', e);
      res.status(500).json({ error: e.message || 'Failed to create pseudonym' });
    }
  });

  // GET /api/anonymous/pseudonym - Get my pseudonym
  app.get('/api/anonymous/pseudonym', requireAuth, (req: any, res: any) => {
    try {
      const user = req.user;
      const userId = user.id;

      const db = loadDatabase();
      const pseudonym = (db.pseudonyms ?? []).find((p: any) => p.userId === userId);

      if (!pseudonym) {
        return res.json({ pseudonym: null });
      }

      const { userId: _omit, ...publicPseudonym } = pseudonym;
      res.json({ pseudonym: publicPseudonym });
    } catch (e: any) {
      console.error('Get pseudonym error:', e);
      res.status(500).json({ error: e.message || 'Failed to get pseudonym' });
    }
  });

  // PUT /api/anonymous/pseudonym - Update my pseudonym
  app.put('/api/anonymous/pseudonym', requireAuth, (req: any, res: any) => {
    try {
      const user = req.user;
      const userId = user.id;
      const { displayName, avatarEmoji } = req.body || {};

      const db = loadDatabase();
      if (!Array.isArray(db.pseudonyms)) db.pseudonyms = [];

      const idx = db.pseudonyms.findIndex((p: any) => p.userId === userId);
      if (idx === -1) {
        return res.status(404).json({ error: 'Pseudonym not found' });
      }

      const pseudonym = db.pseudonyms[idx];
      if (displayName !== undefined) pseudonym.displayName = displayName.slice(0, 30);
      if (avatarEmoji !== undefined) pseudonym.avatarEmoji = avatarEmoji || '🌊';

      saveDatabase(db);

      const { userId: _omit, ...publicPseudonym } = pseudonym;
      res.json({ pseudonym: publicPseudonym });
    } catch (e: any) {
      console.error('Update pseudonym error:', e);
      res.status(500).json({ error: e.message || 'Failed to update pseudonym' });
    }
  });

  // DELETE /api/anonymous/pseudonym - Delete my pseudonym
  app.delete('/api/anonymous/pseudonym', requireAuth, (req: any, res: any) => {
    try {
      const user = req.user;
      const userId = user.id;

      const db = loadDatabase();
      if (!Array.isArray(db.pseudonyms)) db.pseudonyms = [];

      const idx = db.pseudonyms.findIndex((p: any) => p.userId === userId);
      if (idx === -1) {
        return res.status(404).json({ error: 'Pseudonym not found' });
      }

      db.pseudonyms.splice(idx, 1);
      saveDatabase(db);

      res.json({ success: true });
    } catch (e: any) {
      console.error('Delete pseudonym error:', e);
      res.status(500).json({ error: e.message || 'Failed to delete pseudonym' });
    }
  });

  // POST /api/anonymous/post - Create incognito post
  app.post('/api/anonymous/post', requireAuth, (req: any, res: any) => {
    try {
      const user = req.user;
      const userId = user.id;
      const { content } = req.body || {};

      // Validate content
      const text = String(content ?? '').trim();
      if (!text || text.length < 1 || text.length > 1000) {
        return res.status(400).json({ error: 'Content must be 1-1000 characters' });
      }

      const db = loadDatabase();
      if (!Array.isArray(db.pseudonyms)) db.pseudonyms = [];
      if (!Array.isArray(db.incognitoPosts)) db.incognitoPosts = [];

      // Find user's pseudonym
      const pseudonym = db.pseudonyms.find((p: any) => p.userId === userId);
      if (!pseudonym) {
        return res.status(400).json({ error: 'Create a pseudonym first' });
      }

      const post = {
        id: `incog_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        handle: pseudonym.handle,
        avatarEmoji: pseudonym.avatarEmoji,
        content: text,
        createdAt: Date.now(),
      };

      db.incognitoPosts.push(post);
      saveDatabase(db);

      res.json({ post });
    } catch (e: any) {
      console.error('Create incognito post error:', e);
      res.status(500).json({ error: e.message || 'Failed to create post' });
    }
  });

  // GET /api/anonymous/feed - Get incognito feed (guest-safe)
  app.get('/api/anonymous/feed', (req: any, res: any) => {
    try {
      const db = loadDatabase();
      if (!Array.isArray(db.incognitoPosts)) db.incognitoPosts = [];

      // Sort newest first, return only public fields
      const posts = [...db.incognitoPosts]
        .sort((a: any, b: any) => b.createdAt - a.createdAt)
        .map((p: any) => ({
          id: p.id,
          handle: p.handle,
          avatarEmoji: p.avatarEmoji,
          content: p.content,
          createdAt: p.createdAt,
        }));

      res.json({ posts });
    } catch (e: any) {
      console.error('Get incognito feed error:', e);
      res.status(500).json({ error: e.message || 'Failed to get feed' });
    }
  });

  // POST /api/anonymous/mode - Save privacy modes
  app.post('/api/anonymous/mode', requireAuth, (req: any, res: any) => {
    try {
      const user = req.user;
      const userId = user.id;
      const { anonymousBrowsing, incognitoPosting } = req.body || {};

      const db = loadDatabase();

      // Find user in db.users
      const userIdx = db.users.findIndex((u: any) => u.id === userId);
      if (userIdx === -1) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Ensure privacy object exists
      if (!db.users[userIdx].privacy) db.users[userIdx].privacy = {};
      db.users[userIdx].privacy.browsingModes = {
        anonymousBrowsing: !!anonymousBrowsing,
        incognitoPosting: !!incognitoPosting,
      };

      saveDatabase(db);

      res.json({
        modes: {
          anonymousBrowsing: !!anonymousBrowsing,
          incognitoPosting: !!incognitoPosting,
        },
      });
    } catch (e: any) {
      console.error('Save modes error:', e);
      res.status(500).json({ error: e.message || 'Failed to save modes' });
    }
  });

  // GET /api/anonymous/mode - Get current modes
  app.get('/api/anonymous/mode', requireAuth, (req: any, res: any) => {
    try {
      const user = req.user;
      const userId = user.id;

      const db = loadDatabase();
      const dbUser = db.users.find((u: any) => u.id === userId);

      const modes = dbUser?.privacy?.browsingModes ?? {
        anonymousBrowsing: false,
        incognitoPosting: false,
      };

      res.json({ modes });
    } catch (e: any) {
      console.error('Get modes error:', e);
      res.status(500).json({ error: e.message || 'Failed to get modes' });
    }
  });
}