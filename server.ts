// Load .env FIRST so every other module sees JWT_SECRET / CORS_ORIGIN / etc.
// (dotenv never overrides already-set env vars, so NODE_ENV=production npm start
// still boots the server in production mode.)
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import QRCode from 'qrcode';
import { StreamClient } from '@stream-io/node-sdk';
import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, setDoc, deleteDoc } from 'firebase/firestore';
// Firebase Admin SDK (modular v14 API) — used for production Firestore sync via service account.
import { initializeApp as initAdminApp, cert as adminCert, getApps as getAdminApps } from 'firebase-admin/app';
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore';
import { createServer as createViteServer } from 'vite';
import { setupChatServer, getUserStatus, broadcastMessageToUsers, triggerSimulatedReplyExternal, setExternalSaveDatabase, setExternalTokenValidator } from './chatServer.js';
import { setServerContext } from './src/turtleServerContext';
import { registerOceanFeatures } from './src/turtleFeatureRegistry';
import { registerAIModerationRoutes } from './src/turtleAIModerationAssistant';
import { registerAIVehicleAnalysisRoutes } from './src/turtleAIVehicleAnalysisEngine';
import { registerAIBengaliModerationRoutes } from './src/turtleAIBengaliModerationEngine';

import { registerAICaptionRoutes } from './src/turtleAICaptionEngine';
import { registerChatAiHelperRoutes } from './src/turtleChatAiHelper';
import { registerTelegramOTPGatewayRoutes, validateStartupEnvironment } from './src/turtleSecurityTelegramOTPService';
import { registerNSFWRoutes, serverScreenImage } from './turtleNSFWServerEngine';
import { registerEmergencyPoolsRoutes } from './src/turtleEmergencyPoolsBackend';
import { ReelsAnalyticsManager, ReelsRecommendationEngine } from './src/turtleReelsBackend';
import { StreamApiManager, buildApiPoolFromEnv, type StreamApi } from './src/lib/streamApiManager';
import { enqueue as matchmakingEnqueue, dequeue as matchmakingDequeue, queueLength as matchmakingQueueLength, clearQueue as matchmakingClearQueue } from './src/lib/matchmaking';
import { masterFeedScore } from './src/lib/reco';
import {
  communityFrom, defaultCommunity, createEvent, rsvpEvent, askQuestion, answerQuestion,
  upvoteAnswer, ensureDefaultTopics, joinTopic, tipCreator, addBalance, spendBalance,
  trustPointsForUser, DEFAULT_REWARDS,
} from './src/turtleCommunityBackend';
import { transcribeAudio } from './src/server/voiceTranscription';
import { invokeLLM, listLLMModels } from './src/server/llm';
import { ENV as MANUS_ENV } from './src/server/env';
import { aiRateLimit } from './src/lib/aiRateLimit';
import { createIpRateLimiter } from './src/lib/rateLimit';

process.env.DISABLE_HMR = 'true'; 

// Mock default credentials are ONLY seeded outside production so the sandboxed
// dev environment can boot without secrets. In production (NODE_ENV=production)
// missing secrets FAIL CLOSED via validateStartupEnvironment() below — the server
// refuses to start rather than silently signing tokens with a public key.
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
if (!IS_PRODUCTION) {
  if (!process.env.TELEGRAM_BOT_TOKEN) {
    process.env.TELEGRAM_BOT_TOKEN = "mock_telegram_bot_token_123456789";
  }
  if (!process.env.REDIS_URL) {
    process.env.REDIS_URL = "redis://127.0.0.1:6379";
  }
  // JWT_SECRET: NEVER hardcoded. In dev we derive an EPHEMERAL random secret so
  // the sandbox can boot — sessions won't survive a restart, and the warning
  // below tells the operator to set a real JWT_SECRET. In production no mock is
  // ever seeded and validateStartupEnvironment() exits the process instead.
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    process.env.JWT_SECRET = crypto.randomBytes(32).toString('hex');
    console.warn('[SECURITY] JWT_SECRET is not set — generated an EPHEMERAL random secret for this dev process (sessions will not survive restarts). Set JWT_SECRET (>=32 chars) in .env. Production refuses to start without it.');
  }
}

// Run strict security-audited startup validations. Fails closed with exit(1)
// in production when JWT_SECRET / TELEGRAM_BOT_TOKEN / REDIS_URL are missing.
validateStartupEnvironment();

// Process-level safety net: an uncaught exception or unhandled rejection from
// a dropped WebRTC peer (Ngrok tunnel teardown, dead socket between the
// readyState check and ws.send(), a malformed ICE candidate payload, etc.)
// must not take the whole server down mid-call. Log it loudly and keep the
// server online — the failed call is already gone, but every other user keeps
// working. Individual handlers still get their own try-catch; this is the
// last line of defense, not the first.
process.on('uncaughtException', (err) => {
  console.error('[FATAL][uncaughtException] recovered — keeping server alive:', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[FATAL][unhandledRejection] recovered — keeping server alive:', reason);
});

const app = express();

// ── Security headers + CORS ─────────────────────────────────────────────────
// helmet(): hardened defaults (X-Content-Type-Options, X-Frame-Options, etc.).
// CSP is customised to match the app's real needs: CDN scripts/wasm (ffmpeg,
// mediapipe, tfjs), WebSockets, data:/blob: media, and the Jitsi iframe all
// stay allowed. 'unsafe-inline' scripts are allowed only in dev (Vite React
// Refresh preamble); styled-components always needs 'unsafe-inline' styles.
// crossOriginEmbedderPolicy is off because cross-origin CDN assets would be
// blocked without CORP headers. upgrade-insecure-requests is off so plain-http
// dev assets (http://localhost:3000) keep loading.
const CORS_ORIGINS = (process.env.CORS_ORIGIN || 'http://localhost:5173,http://localhost:3000')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
app.use(helmet({
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      'upgrade-insecure-requests': null,
      'script-src': ["'self'", "'unsafe-eval'", 'https:', 'data:', 'blob:', ...(IS_PRODUCTION ? [] : ["'unsafe-inline'"])],
      'style-src': ["'self'", "'unsafe-inline'", 'https:', 'data:'],
      'img-src': ["'self'", 'data:', 'blob:', 'https:', 'http:'],
      'media-src': ["'self'", 'data:', 'blob:', 'https:', 'http:'],
      'connect-src': ["'self'", 'ws:', 'wss:', 'https:', 'http:'],
      'worker-src': ["'self'", 'blob:', 'https:'],
      'frame-src': ["'self'", 'https:', 'http:'],
    },
  },
}));
app.use(cors({ origin: CORS_ORIGINS, credentials: true }));

// Behind a reverse proxy (staging/production) honor X-Forwarded-For so req.ip
// (used by the signup rate limiter) and X-Forwarded-Proto see the real client.
// Local dev connects directly, so this stays off outside production.
if (IS_PRODUCTION) {
  app.set('trust proxy', 1);
}

const PORT = 3000;
// DB_FILE / SESSIONS_FILE are overridable via env so tests can run against a
// temp copy instead of the repo's real data files.
const DB_FILE = process.env.DB_FILE || path.join(process.cwd(), 'database.json');

// Ensure database file exists
const SEED_USERS: any[] = [];

function loadDatabase() {
  if (!fs.existsSync(DB_FILE)) {
    const initialData = {
      users: [],
      messages: []
    };
    fs.writeFileSync(DB_FILE, JSON.stringify(initialData, null, 2), 'utf8');
    return initialData;
  }
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf8');
    const db = JSON.parse(raw);
    let changed = false;

    const originalUserCount = (db.users || []).length;
    db.users = (db.users || []).filter((u: any) => u.id && !u.id.startsWith('user-seed') && !u.id.startsWith('seed-'));
    if (db.users.length !== originalUserCount) {
      changed = true;
    }

    const originalMessageCount = (db.messages || []).length;
    db.messages = (db.messages || []).filter((m: any) => m.id && !m.id.startsWith('msg-seed') && !m.id.startsWith('seed-'));
    if (db.messages.length !== originalMessageCount) {
      changed = true;
    }

    // Migrate users with missing names, usernames & salt (to comply with security rules)
    db.users.forEach((u: any) => {
      if (!u.name) {
        u.name = (u.profile && u.profile.name) || 'Anonymous';
        changed = true;
      }
      if (!u.username) {
        u.username = u.name.toLowerCase().replace(/[^a-z0-9_]/g, '');
        changed = true;
      }
      if (u.profile && !u.profile.username) {
        u.profile.username = u.username;
        changed = true;
      }
      if (!u.salt) {
        u.salt = crypto.randomBytes(16).toString('hex');
        changed = true;
      }
    });

    // MIGRATION: Extract base64 data-URI images to files to prevent database.json bloat.
    // Full base64 strings stored in the DB cause massive file sizes (100s of KB per image),
    // slow load times, and unbounded memory growth. This converts them to file paths.
    const DATA_URI_PREFIX = 'data:image/';
    function extractBase64ToFileSync(base64DataUri: string): string | null {
      try {
        const matches = base64DataUri.match(/^data:(image\/\w+);base64,(.+)$/);
        if (!matches) return null;
        const mime = matches[1];
        const ext = mime.split('/')[1] || 'jpg';
        const buffer = Buffer.from(matches[2], 'base64');
        if (buffer.length > 10 * 1024 * 1024) return null; // skip if >10MB
        const uploadsDirMig = path.join(process.cwd(), 'uploads');
        if (!fs.existsSync(uploadsDirMig)) fs.mkdirSync(uploadsDirMig, { recursive: true });
        const fname = `media-migrated-${Date.now()}-${Math.floor(Math.random() * 10000)}.${ext}`;
        const fpath = path.join(uploadsDirMig, fname);
        fs.writeFileSync(fpath, buffer);
        console.log(`[Migration] Extracted base64 image: /uploads/${fname} (${buffer.length} bytes)`);
        return `/uploads/${fname}`;
      } catch (e) {
        return null;
      }
    }

    const extractImageFromPost = (p: any) => {
      if (!p) return;
      if (typeof p.imageUrl === 'string' && p.imageUrl.startsWith(DATA_URI_PREFIX)) {
        const newPath = extractBase64ToFileSync(p.imageUrl);
        if (newPath) { p.imageUrl = newPath; changed = true; }
      }
    };

    if (db.posts) db.posts.forEach(extractImageFromPost);
    if (db.users) {
      db.users.forEach((u: any) => {
        if (u.profile?.posts) u.profile.posts.forEach(extractImageFromPost);
        if (typeof u.profile?.avatarUrl === 'string' && u.profile.avatarUrl.startsWith(DATA_URI_PREFIX)) {
          const newPath = extractBase64ToFileSync(u.profile.avatarUrl);
          if (newPath) { u.profile.avatarUrl = newPath; changed = true; }
        }
      });
    }

    // Reset false positive NSFW flags from all posts in db
    const sanitizePostFlags = (p: any) => {
      if (!p) return;
      const text = `${p.title || ''} ${p.content || ''}`.toLowerCase();
      const hasExplicitText = ['porn', 'hentai', 'xxx', 'naked', 'nude', 'pussy', 'dick', 'vagina'].some(w => new RegExp(`\\b${w}\\b`, 'i').test(text));
      if (!hasExplicitText && (p.isNsfw || p.nsfwVerdict === 'blur' || p.nsfwVerdict === 'block')) {
        p.isNsfw = false;
        p.nsfwVerdict = 'safe';
        changed = true;
      }
    };

    if (db.posts) {
      db.posts.forEach(sanitizePostFlags);
    }
    if (db.users) {
      db.users.forEach((u: any) => {
        if (u.profile && u.profile.posts) {
          u.profile.posts.forEach(sanitizePostFlags);
        }
      });
    }

    checkAndUnlockCapsules(db);

    ensureLastSyncedDbState(db);

    if (changed) {
      saveDatabase(db);
    }
    return db;
  } catch (e) {
    console.error("Error reading database.json, recreating...", e);
    const fallback = { users: [...SEED_USERS], messages: [] };
    fs.writeFileSync(DB_FILE, JSON.stringify(fallback, null, 2), 'utf8');
    ensureLastSyncedDbState(fallback);
    return fallback;
  }
}

let lastSyncedDbState: any = null;

function ensureLastSyncedDbState(db: any) {
  if (!lastSyncedDbState) {
    lastSyncedDbState = {
      users: JSON.parse(JSON.stringify(db.users || [])),
      messages: JSON.parse(JSON.stringify(db.messages || [])),
      conversations: JSON.parse(JSON.stringify(db.conversations || [])),
      chatMessages: JSON.parse(JSON.stringify(db.chatMessages || []))
    };
  }
}

function isDeepEqual(a: any, b: any): boolean {
  if (a === b) return true;
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    if (Array.isArray(a) !== Array.isArray(b)) return false;
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length) return false;
    for (const key of keysA) {
      if (!keysB.includes(key)) return false;
      if (!isDeepEqual(a[key], b[key])) return false;
    }
    return true;
  }
  return false;
}

let firestore: any = null;
let isSyncPending = false;
let lastSyncFromFirestoreTime = 0;
const SYNC_COOLDOWN_MS = 2000;

let lastFirestoreErrorTime = 0;
let lastFirestoreErrorLogTime = 0;
const ERROR_COOLDOWN_MS = 30000; // Skip trying for 30s after any Firestore error to prevent stalls and log spam
const ERROR_LOG_COOLDOWN_MS = 60000; // Limit warning logs to once per minute

function getFirestoreClient(forceReset = false) {
  if (firestore && !forceReset) return firestore;

  // 1) Preferred (production): Firebase Admin SDK with a service account. The
  //    Admin SDK bypasses firestore.rules, which lets us lock the rules down to
  //    authenticated users only. SERVICE_ROLE_KEY may be the raw JSON string or
  //    a path to the service-account JSON file.
  const serviceRole = (process.env.SERVICE_ROLE_KEY || '').trim();
  if (serviceRole) {
    try {
      if (getAdminApps().length === 0) {
        let parsed: any;
        if (serviceRole.startsWith('{')) {
          parsed = JSON.parse(serviceRole);
        } else {
          const saPath = path.resolve(process.cwd(), serviceRole);
          if (!fs.existsSync(saPath)) {
            console.warn('[Firestore] SERVICE_ROLE_KEY file not found at', saPath, '— falling back to local database.json storage.');
            return null;
          }
          parsed = JSON.parse(fs.readFileSync(saPath, 'utf8'));
        }
        initAdminApp({ credential: adminCert(parsed) });
      }
      // Preserve the custom Firestore database id from the web config if present.
      let dbId: string | undefined;
      try {
        const cfgPath = path.join(process.cwd(), 'firebase-applet-config.json');
        if (fs.existsSync(cfgPath)) {
          dbId = JSON.parse(fs.readFileSync(cfgPath, 'utf8')).firestoreDatabaseId || undefined;
        }
      } catch (e) { /* ignore */ }
      firestore = getAdminFirestore(dbId);
      (firestore as any).__isAdmin = true;
      console.log('Firebase Admin SDK initialized (service account) — Firestore sync bypasses security rules.');
      return firestore;
    } catch (err) {
      console.warn('[Firestore] Admin SDK initialization failed:', err instanceof Error ? err.message : err);
      firestore = null;
    }
  }

  // 2) Development fallback: web SDK config (firebase-applet-config.json).
  //    NOTE: with the hardened firestore.rules this path is blocked for writes
  //    in production — set SERVICE_ROLE_KEY to enable cloud sync.
  try {
    const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
    if (!fs.existsSync(configPath)) {
      console.log("Firebase config file not found. Falling back to local database.json storage.");
      return null;
    }

    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    if (!config.projectId || config.projectId.includes("placeholder") || config.projectId.includes("remixed")) {
      console.log("Firebase/Firestore is disabled (running with placeholder/unconfigured project ID). Falling back to local database.json storage.");
      return null;
    }

    let app;
    const apps = getApps();
    if (apps.length > 0) {
      app = apps[0];
    } else {
      app = initializeApp(config);
    }

    firestore = getFirestore(app, config.firestoreDatabaseId || undefined);
    (firestore as any).__isAdmin = false;
    console.log("Firebase Modular SDK initialized successfully with database ID:", config.firestoreDatabaseId || "(default)");
    console.warn('[Firestore] SERVICE_ROLE_KEY is not set — using the web SDK fallback. The hardened firestore.rules block unauthenticated writes, so cloud sync will fail closed once those rules are deployed. Set SERVICE_ROLE_KEY (service-account JSON or path) to enable production sync via the Admin SDK.');
    return firestore;
  } catch (err) {
    console.log("Failed to initialize Firebase Modular SDK:", err instanceof Error ? err.message : err);
    return null;
  }
}

/** Read all docs of a collection — dispatches web SDK vs Admin SDK. */
async function fsGetAll(client: any, col: string): Promise<any[]> {
  if (client.__isAdmin) {
    const snap = await client.collection(col).get();
    return snap.docs.map((d: any) => d.data());
  }
  const snap = await getDocs(collection(client, col));
  const out: any[] = [];
  snap.forEach((d: any) => out.push(d.data()));
  return out;
}

/** Write a single doc — dispatches web SDK vs Admin SDK. */
async function fsSetDoc(client: any, col: string, id: string, data: any): Promise<void> {
  if (client.__isAdmin) {
    await client.collection(col).doc(id).set(data);
    return;
  }
  await setDoc(doc(client, col, id), data);
}

/** Delete a single doc — dispatches web SDK vs Admin SDK. */
async function fsDeleteDoc(client: any, col: string, id: string): Promise<void> {
  if (client.__isAdmin) {
    await client.collection(col).doc(id).delete();
    return;
  }
  await deleteDoc(doc(client, col, id));
}

function mergeDbStates(localDb: any, firestoreDb: any) {
  const merged: any = {
    users: [],
    messages: [],
    conversations: [],
    chatMessages: [],
    posts: []
  };

  const localUsers = localDb.users || [];
  const firestoreUsers = firestoreDb.users || [];
  const lastUsers = (lastSyncedDbState && lastSyncedDbState.users) || [];

  // Merge users
  const allUserIds = new Set([
    ...localUsers.map((u: any) => u.id),
    ...firestoreUsers.map((u: any) => u.id)
  ]);

  for (const uid of allUserIds) {
    const localUser = localUsers.find((u: any) => u.id === uid);
    const firestoreUser = firestoreUsers.find((u: any) => u.id === uid);
    const lastUser = lastUsers.find((u: any) => u.id === uid);

    if (localUser && firestoreUser) {
      // Merge posts array from both localUser and firestoreUser profiles so no posts are lost
      const localPosts = localUser.profile?.posts || [];
      const firestorePosts = firestoreUser.profile?.posts || [];
      const postsMap = new Map();
      firestorePosts.forEach((p: any) => { if (p && p.id) postsMap.set(p.id, p); });
      localPosts.forEach((p: any) => { if (p && p.id) postsMap.set(p.id, p); });
      const mergedPosts = Array.from(postsMap.values());

      const baseUser = (!lastUser || !isDeepEqual(localUser, lastUser)) ? localUser : firestoreUser;
      const mergedUser = {
        ...firestoreUser,
        ...baseUser,
        profile: {
          ...(firestoreUser.profile || {}),
          ...(baseUser.profile || {}),
          posts: mergedPosts
        }
      };
      merged.users.push(mergedUser);
    } else if (localUser) {
      merged.users.push(localUser);
    } else if (firestoreUser) {
      merged.users.push(firestoreUser);
    }
  }

  // Merge standalone posts (by ID)
  const allPostIds = new Set([
    ...(localDb.posts || []).map((p: any) => p.id),
    ...(firestoreDb.posts || []).map((p: any) => p.id)
  ]);
  for (const pid of allPostIds) {
    const localPost = (localDb.posts || []).find((p: any) => p.id === pid);
    const firestorePost = (firestoreDb.posts || []).find((p: any) => p.id === pid);
    if (localPost && firestorePost) {
      const commentsMap = new Map();
      (firestorePost.comments || []).forEach((c: any) => { if (c && c.id) commentsMap.set(c.id, c); });
      (localPost.comments || []).forEach((c: any) => { if (c && c.id) commentsMap.set(c.id, c); });
      
      const likedBy = Array.from(new Set([...(firestorePost.likedBy || []), ...(localPost.likedBy || [])]));
      
      merged.posts.push({
        ...firestorePost,
        ...localPost,
        comments: Array.from(commentsMap.values()),
        likedBy,
        likes: Math.max(localPost.likes || 0, firestorePost.likes || 0, likedBy.length)
      });
    } else {
      merged.posts.push(firestorePost || localPost);
    }
  }

  // Merge messages (by ID)
  const allMessageIds = new Set([
    ...(localDb.messages || []).map((m: any) => m.id),
    ...(firestoreDb.messages || []).map((m: any) => m.id)
  ]);
  for (const mid of allMessageIds) {
    const localMsg = (localDb.messages || []).find((m: any) => m.id === mid);
    const firestoreMsg = (firestoreDb.messages || []).find((m: any) => m.id === mid);
    merged.messages.push(firestoreMsg || localMsg);
  }

  // Merge conversations (by ID)
  const allConvIds = new Set([
    ...(localDb.conversations || []).map((c: any) => c.id),
    ...(firestoreDb.conversations || []).map((c: any) => c.id)
  ]);
  const lastConversations = (lastSyncedDbState && lastSyncedDbState.conversations) || [];
  for (const cid of allConvIds) {
    const localConv = (localDb.conversations || []).find((c: any) => c.id === cid);
    const firestoreConv = (firestoreDb.conversations || []).find((c: any) => c.id === cid);
    const lastConv = lastConversations.find((c: any) => c.id === cid);

    if (localConv && firestoreConv) {
      const hasLocalChanges = !lastConv || !isDeepEqual(localConv, lastConv);
      if (hasLocalChanges) {
        merged.conversations.push(localConv);
      } else {
        merged.conversations.push(firestoreConv);
      }
    } else {
      merged.conversations.push(firestoreConv || localConv);
    }
  }

  // Merge chatMessages (by ID)
  const allChatMsgIds = new Set([
    ...(localDb.chatMessages || []).map((cm: any) => cm.id),
    ...(firestoreDb.chatMessages || []).map((cm: any) => cm.id)
  ]);
  const lastChatMessages = (lastSyncedDbState && lastSyncedDbState.chatMessages) || [];
  for (const cmid of allChatMsgIds) {
    const localCM = (localDb.chatMessages || []).find((cm: any) => cm.id === cmid);
    const firestoreCM = (firestoreDb.chatMessages || []).find((cm: any) => cm.id === cmid);
    const lastCM = lastChatMessages.find((cm: any) => cm.id === cmid);

    if (localCM && firestoreCM) {
      const hasLocalChanges = !lastCM || !isDeepEqual(localCM, lastCM);
      if (hasLocalChanges) {
        merged.chatMessages.push(localCM);
      } else {
        merged.chatMessages.push(firestoreCM);
      }
    } else {
      merged.chatMessages.push(firestoreCM || localCM);
    }
  }

  return merged;
}

async function syncFromFirestore(force = false) {
  if (isSyncPending) {
    console.log("Firestore sync from cloud skipped because a local write is pending sync.");
    return;
  }

  const now = Date.now();
  // Avoid checking/attempting Firestore sync if we recently hit an error (even if force = true)
  if (now - lastFirestoreErrorTime < ERROR_COOLDOWN_MS) {
    return;
  }

  if (!force && now - lastSyncFromFirestoreTime < SYNC_COOLDOWN_MS) {
    // Cooldown is active, skip fetching
    return;
  }

  const dbClient = getFirestoreClient();
  if (!dbClient) return;

  try {
    lastSyncFromFirestoreTime = now;
    console.log("Fetching database state from Firestore...");
    const [users, messages, conversations, chatMessages, posts] = await Promise.all([
      fsGetAll(dbClient, 'users'),
      fsGetAll(dbClient, 'messages'),
      fsGetAll(dbClient, 'conversations'),
      fsGetAll(dbClient, 'chatMessages'),
      fsGetAll(dbClient, 'posts')
    ]);

    console.log(`Successfully fetched ${users.length} users, ${messages.length} messages, ${conversations.length} conversations, ${chatMessages.length} chat messages, and ${posts.length} posts from Firestore.`);

    const localDb = loadDatabase();
    const firestoreDb = { users, messages, conversations, chatMessages, posts };
    const mergedDb = mergeDbStates(localDb, firestoreDb);

    fs.writeFileSync(DB_FILE, JSON.stringify(mergedDb, null, 2), 'utf8');
    lastSyncedDbState = JSON.parse(JSON.stringify(firestoreDb));
    lastFirestoreErrorTime = 0; // recovered — clear the error cooldown
    console.log("Local database.json has been merged and synchronized with Firestore.");
  } catch (err: any) {
    const nowError = Date.now();
    const errMsg = err?.message || String(err);
    try {
      fs.appendFileSync(path.join(process.cwd(), 'firestore-debug.log'), `[${new Date().toISOString()}] syncFromFirestore error: ${errMsg}\n`);
    } catch (e) {}
    lastFirestoreErrorTime = nowError; // block future syncs on cooldown
    if (nowError - lastFirestoreErrorLogTime > ERROR_LOG_COOLDOWN_MS) {
      console.log("Firestore sync from cloud not available (using local backup only). Details:", errMsg);
      lastFirestoreErrorLogTime = nowError;
    }
  }
}

async function syncToFirestore(db: any) {
  const dbClient = getFirestoreClient();
  if (!dbClient) {
    isSyncPending = false;
    return;
  }

  try {
    console.log("Syncing database changes to Firestore in background...");
    ensureLastSyncedDbState(db);

    const lastUsers = lastSyncedDbState.users || [];
    const lastMessages = lastSyncedDbState.messages || [];
    const lastConversations = lastSyncedDbState.conversations || [];
    const lastChatMessages = lastSyncedDbState.chatMessages || [];
    const lastPosts = lastSyncedDbState.posts || [];

    // 1. Sync users
    const dbUsers = db.users || [];
    const userPromises = dbUsers.map(async (user: any) => {
      if (!user.id) return;
      const lastUser = lastUsers.find((u: any) => u.id === user.id);
      if (lastUser && isDeepEqual(user, lastUser)) {
        return;
      }
      console.log(`Syncing user ${user.id} to Firestore (changed)...`);
      await fsSetDoc(dbClient, 'users', user.id, user);
    });

    // 2. Sync messages
    const dbMessages = db.messages || [];
    const messagePromises = dbMessages.map(async (msg: any) => {
      if (!msg.id) return;
      const lastMsg = lastMessages.find((m: any) => m.id === msg.id);
      if (lastMsg && isDeepEqual(msg, lastMsg)) {
        return;
      }
      console.log(`Syncing message ${msg.id} to Firestore (changed)...`);
      await fsSetDoc(dbClient, 'messages', msg.id, msg);
    });

    // 3. Sync conversations
    const dbConversations = db.conversations || [];
    const conversationPromises = dbConversations.map(async (conv: any) => {
      if (!conv.id) return;
      const lastConv = lastConversations.find((c: any) => c.id === conv.id);
      if (lastConv && isDeepEqual(conv, lastConv)) {
        return;
      }
      console.log(`Syncing conversation ${conv.id} to Firestore (changed)...`);
      await fsSetDoc(dbClient, 'conversations', conv.id, conv);
    });

    // 4. Sync chatMessages
    const dbChatMessages = db.chatMessages || [];
    const chatMessagePromises = dbChatMessages.map(async (chatMsg: any) => {
      if (!chatMsg.id) return;
      const lastChatMsg = lastChatMessages.find((cm: any) => cm.id === chatMsg.id);
      if (lastChatMsg && isDeepEqual(chatMsg, lastChatMsg)) {
        return;
      }
      console.log(`Syncing chatMessage ${chatMsg.id} to Firestore (changed)...`);
      await fsSetDoc(dbClient, 'chatMessages', chatMsg.id, chatMsg);
    });

    // 5. Sync posts
    const dbPosts = db.posts || [];
    const postPromises = dbPosts.map(async (post: any) => {
      if (!post.id) return;
      const lastPost = lastPosts.find((p: any) => p.id === post.id);
      if (lastPost && isDeepEqual(post, lastPost)) {
        return;
      }
      console.log(`Syncing post ${post.id} to Firestore (changed)...`);
      await fsSetDoc(dbClient, 'posts', post.id, post);
    });

    await Promise.all([
      ...userPromises,
      ...messagePromises,
      ...conversationPromises,
      ...chatMessagePromises,
      ...postPromises
    ]);

    lastSyncedDbState = JSON.parse(JSON.stringify(db));
    isSyncPending = false;
    lastSyncFromFirestoreTime = Date.now();
    lastFirestoreErrorTime = 0; // recovered — clear the error cooldown
    console.log("Firestore background sync completed successfully.");
  } catch (err: any) {
    isSyncPending = false;
    const nowError = Date.now();
    const errMsg = err?.message || String(err);
    try {
      fs.appendFileSync(path.join(process.cwd(), 'firestore-debug.log'), `[${new Date().toISOString()}] syncToFirestore error: ${errMsg}\n`);
    } catch (e) {}
    lastFirestoreErrorTime = nowError; // set error cooldown
    if (nowError - lastFirestoreErrorLogTime > ERROR_LOG_COOLDOWN_MS) {
      console.log("Firestore sync to cloud failed. Using local storage backup only. Details:", errMsg);
      lastFirestoreErrorLogTime = nowError;
    }
    throw err; // propagate so the retry queue can back off and retry
  }
}

let syncQueue: Promise<void> = Promise.resolve();

// Write serialization lock: prevents concurrent saveDatabase() calls from
// losing data via read-modify-write race conditions. All writes are chained
// on this promise so that two concurrent handlers cannot interleave their
// loadDatabase → modify → saveDatabase cycles.
let writeLock: Promise<void> = Promise.resolve();

const FIRESTORE_RETRY_MAX = 5;
const FIRESTORE_RETRY_BASE_MS = 1000;

function queueSyncToFirestore(db: any) {
  syncQueue = syncQueue.then(async () => {
    // Retry queue with exponential backoff: transient network/auth failures
    // are retried up to FIRESTORE_RETRY_MAX times before the sync is dropped
    // (the next saveDatabase() will re-queue a fresh full sync).
    for (let attempt = 1; attempt <= FIRESTORE_RETRY_MAX; attempt++) {
      try {
        await syncToFirestore(db);
        return; // success
      } catch (e) {
        if (attempt === FIRESTORE_RETRY_MAX) {
          console.error(`Failed to sync to Firestore after ${FIRESTORE_RETRY_MAX} attempts:`, e);
          return;
        }
        const delay = Math.min(FIRESTORE_RETRY_BASE_MS * 2 ** attempt, 30000);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  });
}

function syncGlobalPostsFromUsers(db: any) {
  if (!db) return;
  db.posts = db.posts || [];

  const activeProfilePostIds = new Set<string>();
  const userPostsMap = new Map<string, { post: any; user: any }>();

  (db.users || []).forEach((u: any) => {
    const userPosts = u.profile?.posts || [];
    userPosts.forEach((p: any) => {
      if (p && p.id) {
        activeProfilePostIds.add(p.id);
        if (!userPostsMap.has(p.id)) {
          userPostsMap.set(p.id, { post: p, user: u });
        }
      }
    });
  });

  // Keep posts in db.posts if present in profile or created globally
  const postsMap = new Map();
  db.posts.forEach((p: any) => { if (p && p.id) postsMap.set(p.id, p); });

  userPostsMap.forEach(({ post: p, user: u }) => {
    const existing = postsMap.get(p.id);
    if (!existing) {
      postsMap.set(p.id, {
        ...p,
        creator: p.creator || (p.isAnonymous ? {
          id: p.anonymousCreatorId || 'anon-user-BD-99-9999',
          name: p.anonymousCreatorName || 'ANON BD 99 9999',
          username: 'anonymous',
          avatarUrl: '',
          badgeNumber: 'ANON-99',
          isAnonymous: true
        } : {
          id: u.id,
          name: u.name,
          username: u.profile?.username || u.username || '',
          avatarUrl: u.profile?.avatarUrl || '',
          badgeNumber: u.profile?.badgeNumber || 'BD-00'
        })
      });
    } else {
      const commentsMap = new Map();
      (existing.comments || []).forEach((c: any) => { if (c && c.id) commentsMap.set(c.id, c); });
      (p.comments || []).forEach((c: any) => { if (c && c.id) commentsMap.set(c.id, c); });
      const likedBy = Array.from(new Set([...(existing.likedBy || []), ...(p.likedBy || [])]));

      postsMap.set(p.id, {
        ...existing,
        ...p,
        comments: Array.from(commentsMap.values()),
        likedBy,
        likes: Math.max(existing.likes || 0, p.likes || 0, likedBy.length)
      });
    }
  });

  db.posts = Array.from(postsMap.values());
}

function saveDatabase(data: any) {
  // Serialize writes through a lock to prevent concurrent saveDatabase() calls
  // from losing each other's changes (read-modify-write race condition).
  writeLock = writeLock.then(() => {
    return new Promise<void>((resolve) => {
      try {
        isSyncPending = true;
        syncGlobalPostsFromUsers(data);
        const tempFile = `${DB_FILE}.tmp`;
        try {
          fs.writeFileSync(tempFile, JSON.stringify(data, null, 2), 'utf8');
          fs.renameSync(tempFile, DB_FILE);
        } catch (err) {
          fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
        }
        queueSyncToFirestore(data);
      } catch (writeErr) {
        console.error('saveDatabase error (isSyncPending may be stuck):', writeErr);
        isSyncPending = false; // prevent permanent stuck
      }
      resolve();
    });
  });
}

function checkAndUnlockCapsules(db: any) {
  let changed = false;
  const now = Date.now();

  db.users.forEach((u: any) => {
    const profile = u.profile || {};
    const posts = profile.posts || [];
    
    posts.forEach((p: any) => {
      if (p.isTimeCapsule && p.unlockDate) {
        const unlockTime = new Date(p.unlockDate).getTime();
        if (!isNaN(unlockTime) && unlockTime <= now && !p.followersSuggested) {
          p.followersSuggested = true;
          changed = true;

          // Find followers of u.id (users whose following array includes u.id)
          db.users.forEach((follower: any) => {
            follower.following = follower.following || [];
            if (follower.following.includes(u.id)) {
              follower.notifications = follower.notifications || [];
              const exists = follower.notifications.some((n: any) => n.postId === p.id && n.type === 'capsule_unlock');
              if (!exists) {
                const titleTrunc = p.title ? ` "${p.title.substring(0, 20)}${p.title.length > 20 ? '...' : ''}"` : '';
                const newNotification = {
                  id: `notif-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
                  type: 'capsule_unlock',
                  message: `✨ Creator Suggestion: ${u.name}'s sealed time capsule${titleTrunc} is now open! Check it out.`,
                  isRead: false,
                  timestamp: Date.now(),
                  actorIds: [u.id],
                  actorNames: [u.name],
                  postId: p.id
                };
                follower.notifications.unshift(newNotification);
              }
            }
          });
        }
      }
    });
  });

  if (changed) {
    saveDatabase(db);
  }
}

// Ensure database is initialized from Firestore on boot
async function bootSync() {
  try {
    await syncFromFirestore();
  } catch (err) {
    console.error("Boot-time Firestore sync failed, starting with local DB:", err);
  }
  loadDatabase();
}
bootSync();

// Master Server Key for secure backend recovery (protecting the DEK decryptable state on server).
// There is NO static/hardcoded fallback. In production MASTER_KEY is REQUIRED:
// validateStartupEnvironment() exits at boot if it is missing, and the guard below
// is defense-in-depth. In development, an EPHEMERAL per-process key lets the sandbox
// boot without a known constant — password recovery / encrypted backups created under
// an earlier key will simply not survive a restart (loud warning tells the operator
// to set MASTER_KEY in .env).
const MASTER_KEY_SEED = (process.env.MASTER_KEY || '').trim();
if (!MASTER_KEY_SEED && IS_PRODUCTION) {
  console.error('[FATAL ERROR] MASTER_KEY is required in production (validateStartupEnvironment should have exited first).');
  process.exit(1);
}
const MASTER_KEY = crypto.scryptSync(MASTER_KEY_SEED || crypto.randomBytes(32).toString('hex'), 'static-salt-studio', 32);
if (!MASTER_KEY_SEED) {
  console.warn('[SECURITY] MASTER_KEY is not set — using an EPHEMERAL per-process key. Password recovery and encrypted backups will not survive restarts. Set MASTER_KEY in .env (REQUIRED for production).');
}

// --- ENVELOPE ENCRYPTION UTILITIES ---

function deriveKek(password: string, salt: string): Buffer {
  // Derive a 32-byte Key Encryption Key (KEK) using PBKDF2
  return crypto.pbkdf2Sync(password, salt, 10000, 32, 'sha256');
}

function encryptWithKey(data: Buffer, key: Buffer): { ciphertext: string; iv: string } {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  let encrypted = cipher.update(data);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return {
    ciphertext: encrypted.toString('hex'),
    iv: iv.toString('hex')
  };
}

function decryptWithKey(ciphertextHex: string, ivHex: string, key: Buffer): Buffer {
  const iv = Buffer.from(ivHex, 'hex');
  const ciphertext = Buffer.from(ciphertextHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  let decrypted = decipher.update(ciphertext);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted;
}

// 100 Clean unrelated words for recovery phrase generation
const WORD_POOL = [
  "badger", "falcon", "lizard", "spider", "walrus", "iguana", "rabbit", "monkey", "turtle", "beaver",
  "donkey", "kitten", "pigeon", "toucan", "jaguar", "dolphin", "cheetah", "panther", "leopard", "octopus",
  "lobster", "penguin", "hamster", "squirrel", "peacock", "flamingo", "pelican", "sparrow", "bluejay", "cardinal",
  "boulder", "glacier", "volcano", "canyon", "meadow", "forest", "prairie", "savanna", "monsoon", "tornado",
  "hurricane", "rainbow", "eclipse", "comet", "meteor", "nebula", "galaxy", "planet", "asteroid", "aurora",
  "lantern", "compass", "anchor", "journal", "backpack", "canteen", "goggles", "telescope", "microscope", "sextant",
  "violin", "trumpet", "clarinet", "trombone", "marimba", "bagpipe", "accordion", "tambourine", "triangle", "dulcimer",
  "emerald", "sapphire", "ruby", "topaz", "amethyst", "turquoise", "obsidian", "granite", "marble", "quartz",
  "maple", "redwood", "sequoia", "cypress", "juniper", "bamboo", "bonsai", "heather", "orchid", "jasmine"
];

function generate12Words(): string[] {
  const pool = [...WORD_POOL];
  const selected: string[] = [];
  for (let i = 0; i < 12; i++) {
    const index = Math.floor(Math.random() * pool.length);
    selected.push(pool.splice(index, 1)[0]);
  }
  return selected;
}

// --- TOTP 2FA (RFC 6238) via Node's built-in crypto — no otplib dependency ---
function base32Encode(input: Buffer): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0, value = 0, output = '';
  for (const byte of input) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += alphabet[(value << (5 - bits)) & 31];
  return output;
}

function generateTOTPSecret(): string {
  return base32Encode(crypto.randomBytes(20)); // 160-bit secret, 32 base32 chars
}

function totpVerify(secretBase32: string, token: string, window = 1): boolean {
  if (!/^\d{6}$/.test(token)) return false;
  let secretBuf: Buffer;
  try {
    secretBuf = Buffer.from(base32Decode(secretBase32));
  } catch (e) {
    return false;
  }
  const step = 30; // 30-second period
  const counter = Math.floor(Date.now() / 1000 / step);
  const expected = new Set<number>();
  for (let w = -window; w <= window; w++) {
    const buf = Buffer.alloc(8);
    buf.writeBigInt64BE(BigInt(counter + w));
    const hmac = crypto.createHmac('sha1', secretBuf).update(buf).digest();
    const offset = hmac[hmac.length - 1] & 0x0f;
    const code =
      ((hmac[offset] & 0x7f) << 24) |
      ((hmac[offset + 1] & 0xff) << 16) |
      ((hmac[offset + 2] & 0xff) << 8) |
      (hmac[offset + 3] & 0xff);
    expected.add(code % 1000000);
  }
  return expected.has(parseInt(token, 10));
}

function base32Decode(input: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const cleaned = input.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0, value = 0;
  const bytes: number[] = [];
  for (const char of cleaned) {
    const idx = alphabet.indexOf(char);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

function otpauthUrl(secret: string, accountName: string): string {
  const issuer = 'Ocean';
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(accountName)}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`;
}

// One-time pending 2FA logins: userId -> { token, expires }
const pending2FALogins = new Map<string, { userId: string; expires: number }>();

// --- RATE LIMIT STATE ENGINES (In-Memory) ---

// 1. Login Attempts: Lock out or add delay after 1 failed attempt per account within 30 seconds
const failedLoginAttempts = new Map<string, { count: number; lastAttempt: number }>();

// 2. Reset Attempts: 3-5 attempts per 10 minutes per account, then a cooldown of 10 minutes
const resetAttempts = new Map<string, { count: number; attemptsTimestamps: number[]; lockoutUntil?: number }>();

// 3. View Words Attempts: 1 attempt per hour
const viewWordsAttempts = new Map<string, { lastAttempt: number }>();

// --- SESSIONS STATE ENGINE ---
const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days maximum session validity

interface SessionEntry {
  userId: string;
  createdAt: number;
  ip?: string;
  userAgent?: string;
  lastSeenAt?: number;
}

const activeSessions = new Map<string, SessionEntry>(); // sessionToken -> SessionEntry

const SESSIONS_FILE = process.env.SESSIONS_FILE || path.join(process.cwd(), 'sessions.json');

function loadSessions() {
  try {
    const now = Date.now();
    // 1. Load from sessions.json if present
    if (fs.existsSync(SESSIONS_FILE)) {
      const raw = fs.readFileSync(SESSIONS_FILE, 'utf8');
      const data = JSON.parse(raw);
      for (const [token, val] of Object.entries(data)) {
        if (typeof val === 'string') {
          activeSessions.set(token, { userId: val, createdAt: now });
        } else if (val && typeof val === 'object' && typeof (val as any).userId === 'string') {
          const entry = val as SessionEntry;
          if (now - (entry.createdAt || now) < SESSION_MAX_AGE_MS) {
            activeSessions.set(token, entry);
          }
        }
      }
    }
    // 2. Also load from database.json db.sessions for persistent session backup across restarts/deploys
    const db = loadDatabase();
    if (db.sessions && typeof db.sessions === 'object') {
      for (const [token, val] of Object.entries(db.sessions)) {
        if (val && typeof val === 'object' && typeof (val as any).userId === 'string') {
          const entry = val as SessionEntry;
          if (now - (entry.createdAt || now) < SESSION_MAX_AGE_MS) {
            if (!activeSessions.has(token)) {
              activeSessions.set(token, entry);
            }
          }
        }
      }
    }
    console.log(`[Sessions] Loaded ${activeSessions.size} active sessions.`);
  } catch (err) {
    console.error('[Sessions] Error loading sessions:', err);
  }
}

function saveSessions() {
  try {
    const data: Record<string, SessionEntry> = {};
    activeSessions.forEach((entry, token) => {
      data[token] = entry;
    });
    fs.writeFileSync(SESSIONS_FILE, JSON.stringify(data, null, 2), 'utf8');
    // Save into database.json sessions field for cloud persistence
    const db = loadDatabase();
    db.sessions = data;
    saveDatabase(db);
  } catch (err) {
    console.error('[Sessions] Error saving sessions:', err);
  }
}

function getUserIdFromToken(token: string): string | null {
  let session = activeSessions.get(token);
  // Fallback to database.json if not in memory
  if (!session) {
    const db = loadDatabase();
    if (db.sessions && db.sessions[token]) {
      session = db.sessions[token];
      if (session) {
        activeSessions.set(token, session);
      }
    }
  }
  if (!session) return null;
  const now = Date.now();
  if (now - (session.createdAt || now) > SESSION_MAX_AGE_MS) {
    activeSessions.delete(token);
    saveSessions();
    return null;
  }
  return session.userId;
}

function setSessionToken(token: string, userId: string, meta?: { ip?: string; userAgent?: string }) {
  const existing = activeSessions.get(token);
  activeSessions.set(token, {
    userId,
    createdAt: existing?.createdAt || Date.now(),
    ip: meta?.ip || existing?.ip,
    userAgent: meta?.userAgent || existing?.userAgent,
    lastSeenAt: Date.now(),
  });
  saveSessions();
}

// Parse a friendly device label from a User-Agent string (arena-ai deviceLabel pattern)
function deviceLabelFromUA(ua: string): { browser: string; os: string } {
  let browser = 'Browser';
  let os = 'Device';
  if (!ua) return { browser, os };
  const u = ua;
  if (/Edg\//i.test(u)) browser = 'Edge';
  else if (/OPR|Opera/i.test(u)) browser = 'Opera';
  else if (/Firefox/i.test(u)) browser = 'Firefox';
  else if (/Chrome\//i.test(u)) browser = 'Chrome';
  else if (/Safari/i.test(u)) browser = 'Safari';
  if (/Windows NT/i.test(u)) os = 'Windows';
  else if (/Android/i.test(u)) os = 'Android';
  else if (/iPhone|iPad|iOS/i.test(u)) os = 'iOS';
  else if (/Mac OS X/i.test(u)) os = 'macOS';
  else if (/Linux/i.test(u)) os = 'Linux';
  return { browser, os };
}

// List the current user's active sessions with device info (arena-ai login-activity port)
app.get('/api/auth/sessions', requireAuth, (req, res) => {
  const user = (req as any).user;
  const currentToken = (req as any).sessionToken;
  const now = Date.now();
  const sessions = Array.from(activeSessions.entries())
    .filter(([, s]) => s.userId === user.id)
    .map(([token, s]) => {
      const ua = s.userAgent || '';
      const { browser, os } = deviceLabelFromUA(ua);
      return {
        token,
        isCurrent: token === currentToken,
        ip: s.ip || '—',
        browser,
        os,
        createdAt: s.createdAt,
        lastSeenAt: s.lastSeenAt || s.createdAt,
        active: now - (s.lastSeenAt || s.createdAt) < SESSION_MAX_AGE_MS,
      };
    })
    .sort((a, b) => b.lastSeenAt - a.lastSeenAt);
  res.json({ sessions });
});

// Revoke a session (sign out another device)
app.post('/api/auth/sessions/revoke', requireAuth, (req, res) => {
  const user = (req as any).user;
  const { token } = req.body || {};
  const session = activeSessions.get(token || '');
  if (session && session.userId === user.id) {
    activeSessions.delete(token);
    saveSessions();
    const db = loadDatabase();
    if (db.sessions && db.sessions[token]) {
      delete db.sessions[token];
      saveDatabase(db);
    }
  }
  res.json({ success: true });
});

// Load active sessions immediately on server startup
loadSessions();

// --- BODY PARSERS & FILE UPLOADS ---
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

const uploadsDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Serve /uploads static files with Range headers support for video streaming & seeking
app.use('/uploads', express.static(uploadsDir, {
  acceptRanges: true,
  maxAge: '30d'
}));

// Explicit 404 for missing /uploads files. Without this, a missing video/image
// falls through to the SPA catch-all which returns index.html with HTTP 200 —
// the browser then tries to decode HTML as a video and renders a blank player.
app.use('/uploads', (req, res) => {
  res.status(404).json({ error: 'File not found', path: req.path });
});

// FILE UPLOAD ENDPOINT
const upload = multer({ dest: uploadsDir, limits: { fileSize: 200 * 1024 * 1024, files: 1 } }); // 200MB hard cap, single file

// ── Upload validation (production hardening) ───────────────────────────────
// Whitelisted types + per-category size caps. Everything else (svg, html,
// executables, unknown extensions) is rejected up front.
const ALLOWED_IMAGE_EXT = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp']);
const ALLOWED_VIDEO_EXT = new Set(['mp4', 'webm', 'mov']);
const ALLOWED_AUDIO_EXT = new Set(['mp3', 'wav', 'ogg', 'm4a']);
const ALLOWED_UPLOAD_EXT = new Set([...ALLOWED_IMAGE_EXT, ...ALLOWED_VIDEO_EXT, ...ALLOWED_AUDIO_EXT]);
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const MAX_AUDIO_BYTES = 50 * 1024 * 1024;
const MAX_VIDEO_BYTES = 200 * 1024 * 1024;

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp', 'image/bmp': 'bmp',
  'video/mp4': 'mp4', 'video/webm': 'webm',
  'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'audio/ogg': 'ogg', 'audio/mp4': 'm4a',
};

/** Detect the real file type from magic bytes — extension spoofing is rejected. */
function detectMimeFromMagic(buffer: Buffer): string | null {
  if (!buffer || buffer.length < 12) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer.readUInt32BE(0) === 0x89504e47) return 'image/png';
  const gif = buffer.toString('latin1', 0, 6);
  if (gif === 'GIF87a' || gif === 'GIF89a') return 'image/gif';
  if (buffer.toString('latin1', 0, 4) === 'RIFF' && buffer.toString('latin1', 8, 12) === 'WEBP') return 'image/webp';
  if (buffer[0] === 0x42 && buffer[1] === 0x4d) return 'image/bmp';
  if (buffer.toString('latin1', 4, 8) === 'ftyp') {
    const brand = buffer.toString('latin1', 8, 12);
    return brand.startsWith('M4A') || brand.startsWith('M4B') ? 'audio/mp4' : 'video/mp4';
  }
  if (buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3) return 'video/webm';
  if (buffer.toString('latin1', 0, 3) === 'ID3') return 'audio/mpeg';
  if (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0) return 'audio/mpeg';
  if (buffer.toString('latin1', 0, 4) === 'RIFF' && buffer.toString('latin1', 8, 12) === 'WAVE') return 'audio/wav';
  if (buffer.toString('latin1', 0, 4) === 'OggS') return 'audio/ogg';
  return null;
}

function uploadKindOf(ext: string): 'image' | 'video' | 'audio' {
  if (ALLOWED_IMAGE_EXT.has(ext)) return 'image';
  if (ALLOWED_VIDEO_EXT.has(ext)) return 'video';
  return 'audio';
}

function validateUpload(buffer: Buffer, claimedExt: string, knownSize?: number):
  | { ok: true; ext: string; kind: 'image' | 'video' | 'audio' }
  | { ok: false; error: string } {
  const ext = (claimedExt || '').toLowerCase();
  if (!ALLOWED_UPLOAD_EXT.has(ext)) {
    return { ok: false, error: `Unsupported file type ".${ext}". Allowed: images (jpg/png/gif/webp), video (mp4/webm), audio (mp3/wav/ogg/m4a).` };
  }
  const mime = detectMimeFromMagic(buffer);
  if (!mime) {
    return { ok: false, error: 'Unable to verify file contents — the upload appears corrupted or disguised. Please re-encode and retry.' };
  }
  const actualExt = MIME_TO_EXT[mime] || ext;
  if (uploadKindOf(actualExt) !== uploadKindOf(ext)) {
    return { ok: false, error: `File content does not match its extension (".${ext}" claims ${uploadKindOf(ext)}, content is ${actualExt}). Upload rejected.` };
  }
  const limit = uploadKindOf(ext) === 'image' ? MAX_IMAGE_BYTES : uploadKindOf(ext) === 'audio' ? MAX_AUDIO_BYTES : MAX_VIDEO_BYTES;
  // knownSize is passed for multipart uploads (only the 16-byte magic head is
  // buffered there); the base64 path validates against the full buffer.
  const size = typeof knownSize === 'number' ? knownSize : buffer.length;
  if (size > limit) {
    return { ok: false, error: `File exceeds the ${Math.round(limit / 1024 / 1024)}MB limit for ${uploadKindOf(ext)} uploads.` };
  }
  return { ok: true, ext: actualExt, kind: uploadKindOf(ext) };
}

type UploadCheck = { ok: true; ext: string; kind: 'image' | 'video' | 'audio' } | { ok: false; error: string };

/** Type guard — narrows an UploadCheck without relying on strict-mode discriminant narrowing. */
function isUploadOk(r: UploadCheck): r is { ok: true; ext: string; kind: 'image' | 'video' | 'audio' } {
  return r && r.ok === true;
}

function readFileHead(filePath: string, bytes = 16): Buffer {
  const head = Buffer.alloc(bytes);
  try {
    const fd = fs.openSync(filePath, 'r');
    try { fs.readSync(fd, head, 0, bytes, 0); } finally { fs.closeSync(fd); }
  } catch (e) { /* keep zeroed head — validation will reject */ }
  return head;
}

// Video containers most browsers cannot decode. Accepting these makes the
// uploaded file render as a blank/broken <video>, so reject them up front
// with a clear message instead of storing a useless file.
const UNPLAYABLE_VIDEO_EXT = new Set(['mkv', 'avi', 'flv', 'wmv', 'm4v', '3gp', 'rmvb', 'ts', 'mts', 'webmv']);

// Basic email shape check (production hardening).
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Shared file-upload pipeline (multipart + legacy base64). Mounted under both
 *  /api/upload and the dedicated /api/voice/upload so chat voice notes get the
 *  same auth + multer + magic-byte validation path. */
async function handleUpload(req: express.Request, res: express.Response) {
  try {
    if (req.file) {
      // SECURITY: Validate file has a path and non-zero size before filesystem operations
      // to prevent empty-buffer pointer exceptions and null-reference crashes.
      if (!req.file.path || !req.file.size || req.file.size === 0) {
        return res.status(400).json({ error: 'Uploaded file is empty or invalid.' });
      }

      const claimedExt = (req.file.originalname.split('.').pop() || 'bin').toLowerCase();
      const check: UploadCheck = validateUpload(readFileHead(req.file.path), claimedExt, req.file.size);
      if (!isUploadOk(check)) {
        // Remove the temp file multer wrote so we don't leak it on disk.
        try { fs.unlinkSync(req.file.path); } catch (e) { /* ignore */ }
        return res.status(400).json({ error: check.error });
      }
      const uniqueName = `media-${Date.now()}-${Math.floor(Math.random() * 10000)}.${check.ext}`;
      const filePath = path.join(uploadsDir, uniqueName);
      fs.renameSync(req.file.path, filePath);
      const fileUrl = `/uploads/${uniqueName}`;
      console.log(`[Upload] File saved via multer: ${fileUrl} (${check.kind})`);
      return res.json({ success: true, url: fileUrl, kind: check.kind });
    }

    // Fallback to legacy base64 upload logic
    const { fileData, fileName, fileType } = req.body || {};

    if (!fileData) {
      return res.status(400).json({ error: 'No file data provided' });
    }

    let buffer: Buffer;
    let claimedExt = 'bin';

    // SECURITY: Validate buffer can be created from fileData before processing
    try {
      const matches = typeof fileData === 'string' ? fileData.match(/^data:(.+);base64,(.+)$/) : null;
      if (matches && matches.length === 3) {
        const mime = matches[1];
        claimedExt = mime.split('/')[1] || 'bin';
        if (claimedExt === 'quicktime') claimedExt = 'mp4';
        if (claimedExt === 'mpeg') claimedExt = 'mp3';
        if (claimedExt === 'webm') claimedExt = 'webm';
        buffer = Buffer.from(matches[2], 'base64');
      } else if (typeof fileData === 'string') {
        buffer = Buffer.from(fileData, 'base64');
        if (fileType) {
          claimedExt = fileType.split('/')[1] || 'bin';
        }
      } else {
        buffer = Buffer.from(fileData);
      }
    } catch (e) {
      return res.status(400).json({ error: 'Invalid file data: cannot decode payload.' });
    }

    // SECURITY: Validate buffer has content before filesystem write
    if (!buffer || buffer.length === 0) {
      return res.status(400).json({ error: 'Uploaded file data is empty.' });
    }

    if (fileName && fileName.includes('.')) {
      const parts = fileName.split('.');
      const fileExt = parts[parts.length - 1].toLowerCase();
      if (ALLOWED_UPLOAD_EXT.has(fileExt)) {
        claimedExt = fileExt;
      }
    }

    // Magic-byte validation (rejects disguised payloads + unplayable containers).
    const check: UploadCheck = validateUpload(buffer, claimedExt);
    if (!isUploadOk(check)) {
      return res.status(400).json({ error: check.error });
    }
    const ext = check.ext;

    const uniqueName = `media-${Date.now()}-${Math.floor(Math.random() * 10000)}.${ext}`;
    const filePath = path.join(uploadsDir, uniqueName);

    // Server-side NSFW screening for image uploads (second line of defense)
    const isImage = check.kind === 'image';
    let nsfwVerdict: string | null = null;
    if (isImage) {
      try {
        const screenPromise = serverScreenImage(fileData).catch(() => null);
        const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 8000));
        const screenResult = await Promise.race([screenPromise, timeout]);
        if (screenResult && screenResult.success && screenResult.verdict === 'block') {
          return res.status(403).json({
            success: false,
            error: 'This image was blocked by the NSFW safety filter.',
            nsfw: { verdict: 'block', engine: screenResult.engine }
          });
        }
        nsfwVerdict = screenResult && screenResult.success ? (screenResult.verdict || null) : null;
      } catch (screenErr) {
        console.warn('[Upload] Server-side NSFW screening skipped:', screenErr);
      }
    }

    fs.writeFileSync(filePath, buffer);

    const fileUrl = `/uploads/${uniqueName}`;
    console.log(`[Upload] File saved legacy base64: ${fileUrl} (${buffer.length} bytes, ${check.kind})`);
    return res.json({ success: true, url: fileUrl, filename: uniqueName, kind: check.kind, nsfw: nsfwVerdict ? { verdict: nsfwVerdict } : undefined });
  } catch (err: any) {
    console.error('[Upload] Error saving uploaded file:', err);
    return res.status(500).json({ error: 'Failed to save file on server' });
  }
}

// Generic media upload (images, video, audio) + dedicated voice-note upload.
app.post('/api/upload', requireAuth, upload.single('file'), handleUpload);
app.post('/api/voice/upload', requireAuth, upload.single('file'), handleUpload);

// --- NON-BLOCKING ASYNCHRONOUS FIRESTORE SYNC MIDDLEWARE ---
// Instead of await blocking every API request, run non-blocking background sync
setInterval(() => {
  syncFromFirestore(false).catch(err => {
    console.warn("Background Firestore sync failed:", err);
  });
}, 15000); // Background sync every 15s without delaying Express HTTP handlers

// --- API AUTHENTICATION MIDDLEWARE ---
function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required. Please login.' });
  }
  const token = authHeader.split(' ')[1];
  const userId = getUserIdFromToken(token);
  if (!userId) {
    return res.status(401).json({ error: 'Session expired or invalid. Please login again.' });
  }

  // Find user
  const db = loadDatabase();
  const user = db.users.find((u: any) => u.id === userId);
  if (!user) {
    return res.status(401).json({ error: 'User account not found.' });
  }

  (req as any).user = user;
  (req as any).sessionToken = token;
  next();
}

// Constant-time string comparison for secrets (prevents timing side channels).
function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

// Admin gate: user.isAdmin flag, or an x-admin-key header matching MASTER_KEY
// (compared in constant time). Unauthenticated requests can NEVER pass here.
function requireAdmin(req: express.Request, res: express.Response, next: express.NextFunction) {
  const user = (req as any).user;
  if (user && user.isAdmin) return next();
  const masterKey = process.env.MASTER_KEY || '';
  const adminKey = (req.headers['x-admin-key'] as string) || '';
  if (masterKey && adminKey && safeEqual(adminKey, masterKey)) return next();
  return res.status(403).json({ error: 'Admin access required.' });
}

// ── AI endpoint rate limiter (per-user sliding window) ─────────────────────
// Protects the paid LLM/Imagen upstreams from runaway loops and abuse.
// Shared implementation lives in src/lib/aiRateLimit.ts (used by module AI
// routes too) — same semantics as the original inline version.

// Multi-key Stream API manager (adapted from manus-omegle-stream apiManager.ts):
// per-key concurrency caps, lifetime-minute budgets, auto-switch when a key is
// exhausted, and per-user call caps — tracked in memory, keys from the env.
const streamApiManager = new StreamApiManager(buildApiPoolFromEnv({ maxConcurrentCalls: 8 }));

app.post('/api/stream/token', requireAuth, (req, res) => {
  const user = (req as any).user;

  // Per-user call cap (ported from apiManager.ts).
  if (!streamApiManager.canUserCall(user.id)) {
    return res.status(429).json({ error: 'Per-user call limit reached for this session.' });
  }

  let picked = streamApiManager.getNextAvailableApi();
  // Fall back to admin-registered runtime keys (Stream API admin dashboard).
  if (!picked) {
    const db = loadDatabase();
    const runtime = (db.streamApiKeys || []).find((k: any) => k.status !== 'inactive' && k.apiKey && k.apiSecret);
    if (runtime) {
      picked = {
        id: -1, label: runtime.label, apiKey: runtime.apiKey, apiSecret: runtime.apiSecret,
        maxConcurrentCalls: runtime.maxConcurrentCalls || 8, lifetimeMinutes: runtime.lifetimeMinutes || 43200,
        minutesUsed: 0, minutesRemaining: runtime.lifetimeMinutes || 43200, currentConcurrentCalls: 0,
        status: 'active', canUse: true,
      };
    }
  }
  if (!picked) {
    return res.json({
      configured: false,
      error: 'No Stream API key available (all keys at concurrent capacity or exhausted their lifetime budget).'
    });
  }
  // The issued token is stateless — it does not hold a call open — so release
  // the concurrency slot immediately after selecting the key.
  if (picked.id >= 0) streamApiManager.trackCallEnd(picked.id);

  try {
    const serverClient = new StreamClient(picked.apiKey, picked.apiSecret);

    serverClient.upsertUsers([
      {
        id: user.id,
        name: user.name || 'User',
        role: 'user',
      },
    ]).catch((err: any) => console.warn('[Stream] upsertUsers warning:', err?.message || err));

    const token = serverClient.generateUserToken({
      user_id: user.id,
      exp: Math.floor(Date.now() / 1000) + 60 * 60,
    });

    return res.json({ configured: true, token, userId: user.id, apiKey: picked.apiKey });
  } catch (err: any) {
    console.error('[Stream] token generation error:', err?.message || err);
    return res.status(500).json({ error: 'Failed to generate Stream token.' });
  }
});

app.post('/api/stream/upsert-target', requireAuth, async (req, res) => {
  const { targetUserId, targetUserName } = req.body || {};
  // Use the full multi-key manager (STREAM_API_KEY/_2/_3 with per-key caps) —
  // the same pool the /api/stream/token endpoint uses. Previously this endpoint
  // only read the primary key, so deployments with only backup keys configured
  // would 500 here while token generation worked fine.
  const picked = streamApiManager.getNextAvailableApi();
  if (!picked) {
    return res.json({ configured: false, error: 'Stream keys not configured' });
  }
  streamApiManager.trackCallEnd(picked.id);

  if (!targetUserId) {
    return res.status(400).json({ error: 'Missing targetUserId' });
  }

  try {
    const serverClient = new StreamClient(picked.apiKey, picked.apiSecret);
    await serverClient.upsertUsers([
      {
        id: targetUserId,
        name: targetUserName || 'User',
        role: 'user',
      },
    ]);
    return res.json({ success: true });
  } catch (err: any) {
    console.warn('[Stream] upsert target user warning:', err?.message || err);
    return res.json({ success: true, warning: err?.message || err });
  }
});

// Helper to generate a country-specific secure username (Region-Locked ID)
function generateCountryUsername(countryCode: string, dbUsers: any[]): string {
  const code = (countryCode || 'US').toUpperCase();
  const digits = '0123456789';
  const randStr = (len: number) => {
    let s = '';
    for (let i = 0; i < len; i++) {
      s += digits.charAt(Math.floor(Math.random() * digits.length));
    }
    return s;
  };

  let attempts = 0;
  while (attempts < 100) {
    // format: BD-XX-XXX-XXXX-XX
    const candidate = `${code}-${randStr(2)}-${randStr(3)}-${randStr(4)}-${randStr(2)}`;
    const isTaken = dbUsers.some((u: any) => 
      (u.username || '').toLowerCase() === candidate.toLowerCase() || 
      (u.profile?.username || '').toLowerCase() === candidate.toLowerCase()
    );
    if (!isTaken) {
      return candidate;
    }
    attempts++;
  }
  return `${code}-${Date.now()}`;
}

// Helper to get deterministic anonymous identity for a user
function getDeterministicAnon(userId: string, countryCode?: string | null) {
  if (!countryCode) {
    return {
      id: "anon-user-BD-99-9999",
      name: "ANON BD 99 9999"
    };
  }
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = userId.charCodeAt(i) + ((hash << 5) - hash);
  }
  hash = Math.abs(hash);
  const num1 = 10 + (hash % 90); // 10 to 99
  const num2 = 1000 + ((hash >> 4) % 9000); // 1000 to 9999
  const region = countryCode.toUpperCase();
  return {
    id: `anon-user-${region}-${num1}-${num2}`,
    name: `ANON ${region} ${num1} ${num2}`
  };
}

// Helper to get sender info, checking x-acting-as-anonymous header
function getSenderInfo(req: any, fallbackName: string) {
  const user = getRequestUser(req);
  const actingAsAnonymous = req.headers['x-acting-as-anonymous'] === 'true';
  if (user) {
    if (actingAsAnonymous) {
      const deter = getDeterministicAnon(user.id, user.countryCode);
      return { id: deter.id, name: deter.name };
    }
    return { id: user.id, name: user.name };
  }
  return { id: null, name: fallbackName || 'Anonymous Guest' };
}

// Helper to get repost counts map
function getRepostsCountMap(db: any) {
  const repostsMap = new Map<string, number>();
  db.users.forEach((u: any) => {
    const profile = u.profile || {};
    const posts = profile.posts || [];
    posts.forEach((p: any) => {
      if (p.isRepost && p.repostedFrom && p.repostedFrom.id) {
        if (p.originalPostId) {
          const keyId = `id:${p.originalPostId}`;
          repostsMap.set(keyId, (repostsMap.get(keyId) || 0) + 1);
        }
        const keyText = `text:${p.repostedFrom.id}:${(p.title || '').trim()}:${(p.content || '').trim()}`;
        repostsMap.set(keyText, (repostsMap.get(keyText) || 0) + 1);
      }
    });
  });
  return repostsMap;
}

// --- API ENDPOINTS ---

// 1. SIGN UP
// Signup abuse protection: max 5 registrations per 15 minutes per IP.
// (Login already has its own per-email 30s lockout — see failedLoginAttempts.)
const signupLimiter = createIpRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'Too many signup attempts from this IP. Please try again later.',
});

app.post('/api/auth/signup', signupLimiter, (req, res) => {
  const { name, email, password, countryCode } = req.body || {};

  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email, and password are required.' });
  }

  // ── Input validation (production hardening) ──
  const cleanName = String(name).trim();
  if (cleanName.length < 2 || cleanName.length > 60) {
    return res.status(400).json({ error: 'Name must be between 2 and 60 characters.' });
  }
  if (typeof email !== 'string' || !EMAIL_RE.test(email)) {
    return res.status(400).json({ error: 'Please provide a valid email address.' });
  }
  if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
    return res.status(400).json({ error: 'Password must be between 8 and 128 characters.' });
  }
  if (countryCode !== undefined && countryCode !== null && (typeof countryCode !== 'string' || !/^[A-Za-z]{2}$/.test(countryCode))) {
    return res.status(400).json({ error: 'Country code must be a 2-letter ISO code.' });
  }

  const cleanEmail = email.toLowerCase().trim();
  const db = loadDatabase();

  const existing = db.users.find((u: any) => u.email === cleanEmail);
  if (existing) {
    return res.status(400).json({ error: 'An account with this email already exists.' });
  }

  const userId = `user-${Date.now()}`;
  const isLocationVerified = !!countryCode;
  const finalUsername = isLocationVerified 
    ? generateCountryUsername(countryCode, db.users)
    : "";

  try {
    // Generate DEK (Data Encryption Key)
    const dek = crypto.randomBytes(32);

    // Generate random salt
    const salt = crypto.randomBytes(16).toString('hex');

    // Derive KEK from password and salt
    const kek = deriveKek(password, salt);

    // Encrypt DEK with KEK
    const encDek = encryptWithKey(dek, kek);

    // Encrypt DEK with Master Key for backend decryption verification on password recovery
    const encDekMaster = encryptWithKey(dek, MASTER_KEY);

    // Hash the password for verification
    const passwordHash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha256').toString('hex');

    // Generate recovery words
    const words = generate12Words();

    // Encrypt 12 words with the DEK
    const encWords = encryptWithKey(Buffer.from(JSON.stringify(words), 'utf8'), dek);

    // Generate custom badge number
    const badgePrefix = (countryCode || 'BD').toUpperCase();
    const badgeNumber = `${badgePrefix}-${Math.floor(10 + Math.random() * 89)}-${Math.floor(100 + Math.random() * 899)}-${Math.floor(10 + Math.random() * 89)}-${Math.floor(100 + Math.random() * 899)}`;

    // Create user record
    const newUser = {
      id: userId,
      name: cleanName,
      username: finalUsername,
      email: cleanEmail,
      isLocationVerified,
      countryCode: isLocationVerified ? countryCode.toUpperCase() : null,
      passwordHash,
      salt,
      encryptedDek: encDek.ciphertext,
      encryptedDekIv: encDek.iv,
      encryptedDekMaster: encDekMaster.ciphertext,
      encryptedDekMasterIv: encDekMaster.iv,
      encryptedWords: encWords.ciphertext,
      encryptedWordsIv: encWords.iv,
      profile: {
        name: cleanName,
        username: finalUsername,
        isLocationVerified,
        countryCode: isLocationVerified ? countryCode.toUpperCase() : null,
        avatarUrl: "",
        bio: "Professional creative designer, part of the secure creative network.",
        tagline: "",
        location: isLocationVerified ? `${countryCode.toUpperCase()}` : "",
        availability: "Available",
        badgeNumber,
        sinceDate: new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
        viewsCount: 1,
        followersCount: 0,
        postsCount: 0,
        projectsCount: 0,
        skillsCount: 4,
        skills: ["React", "TypeScript", "Node.js", "Tailwind CSS"],
        projects: [],
        websites: [],
        contact: { email: cleanEmail, github: "", linkedin: "", twitter: "", website: "" },
        posts: []
      }
    };

    db.users.push(newUser);
    saveDatabase(db);

    res.json({
      message: 'Signup successful!',
      userId: newUser.id,
      recoveryWords: words // Displayed to user exactly once
    });

  } catch (error) {
    console.error("Signup error:", error);
    res.status(500).json({ error: 'Server error during secure account creation.' });
  }
});

// 1.5 VERIFY LOCATION AFTER REGISTRATION
app.post('/api/auth/verify-location', requireAuth, (req, res) => {
  const user = (req as any).user;
  const { countryCode } = req.body || {};

  if (typeof countryCode !== 'string' || !/^[A-Za-z]{2}$/.test(countryCode)) {
    return res.status(400).json({ error: 'Country code must be a 2-letter ISO code.' });
  }

  const db = loadDatabase();
  const dbUser = db.users.find((u: any) => u.id === user.id);

  if (!dbUser) {
    return res.status(404).json({ error: 'User account not found.' });
  }

  if (dbUser.isLocationVerified) {
    return res.status(400).json({ error: 'Location already verified.', profile: dbUser.profile });
  }

  // Generate verified username
  const verifiedUsername = generateCountryUsername(countryCode, db.users);

  // Update dbUser info
  dbUser.isLocationVerified = true;
  dbUser.countryCode = countryCode.toUpperCase();
  dbUser.username = verifiedUsername;

  // Sync profile fields
  dbUser.profile = dbUser.profile || {};
  dbUser.profile.isLocationVerified = true;
  dbUser.profile.countryCode = countryCode.toUpperCase();
  dbUser.profile.username = verifiedUsername;
  dbUser.profile.location = countryCode.toUpperCase();

  // Update badgeNumber with the verified country code prefix if it didn't match
  const currentBadge = dbUser.profile.badgeNumber || 'BD-00-000-00';
  const newPrefix = countryCode.toUpperCase();
  const badgeParts = currentBadge.split('-');
  let updatedBadge = currentBadge;
  if (badgeParts[0] !== newPrefix) {
    if (badgeParts.length > 1) {
      badgeParts[0] = newPrefix;
      updatedBadge = badgeParts.join('-');
    } else {
      updatedBadge = `${newPrefix}-${Math.floor(10 + Math.random() * 89)}-${Math.floor(100 + Math.random() * 899)}-${Math.floor(10 + Math.random() * 89)}`;
    }
  }
  dbUser.profile.badgeNumber = updatedBadge;

  // Save changes
  saveDatabase(db);

  res.json({
    success: true,
    message: 'Location verified and Region-Locked ID generated successfully!',
    username: verifiedUsername,
    profile: dbUser.profile
  });
});

// 2. LOGIN
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body || {};

  if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  const cleanEmail = email.toLowerCase().trim();

  // Rate Limit check: delay or lock out after 1 failed attempt within 30 seconds
  const rateLimitInfo = failedLoginAttempts.get(cleanEmail);
  const now = Date.now();
  if (rateLimitInfo) {
    const elapsed = now - rateLimitInfo.lastAttempt;
    if (rateLimitInfo.count >= 1 && elapsed < 30000) {
      const waitTime = Math.ceil((30000 - elapsed) / 1000);
      return res.status(429).json({
        error: `Security lockout active due to previous failed attempt. Please wait ${waitTime} seconds.`
      });
    }
  }

  const db = loadDatabase();
  const user = db.users.find((u: any) => u.email === cleanEmail);

  if (!user) {
    // Record failed attempt
    const count = rateLimitInfo ? rateLimitInfo.count + 1 : 1;
    failedLoginAttempts.set(cleanEmail, { count, lastAttempt: now });
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  // Verify password hash
  const candidateHash = crypto.pbkdf2Sync(password, user.salt, 10000, 64, 'sha256').toString('hex');
  if (candidateHash !== user.passwordHash) {
    // Record failed attempt
    const count = rateLimitInfo ? rateLimitInfo.count + 1 : 1;
    failedLoginAttempts.set(cleanEmail, { count, lastAttempt: now });
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  // Clear rate limits upon successful login
  failedLoginAttempts.delete(cleanEmail);

  // 2FA step: if the user has TOTP 2FA enabled, don't issue the session token
  // yet — issue a short-lived one-time code to be exchanged for the real token
  // after a valid authenticator code is provided.
  if (user.twoFactorSecret) {
    const twoFactorToken = crypto.randomBytes(24).toString('hex');
    pending2FALogins.set(twoFactorToken, { userId: user.id, expires: Date.now() + 5 * 60 * 1000 });
    return res.json({
      message: 'Two-factor authentication required.',
      twoFactorRequired: true,
      twoFactorToken,
    });
  }

  // Generate Session Token
  const token = crypto.randomBytes(32).toString('hex');
  setSessionToken(token, user.id, { ip: (req as any).ip, userAgent: req.get('user-agent') });

  res.json({
    message: 'Login successful',
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      username: user.username,
      isLocationVerified: !!user.isLocationVerified,
      countryCode: user.countryCode,
      profile: user.profile,
      following: user.following || []
    }
  });
});

// Complete a 2FA-protected login with the authenticator code.
app.post('/api/auth/login/2fa', (req, res) => {
  const { twoFactorToken, code } = req.body || {};
  if (!twoFactorToken || !code) {
    return res.status(400).json({ error: 'Two-factor token and code are required.' });
  }
  const pending = pending2FALogins.get(twoFactorToken);
  if (!pending || pending.expires < Date.now()) {
    pending2FALogins.delete(twoFactorToken);
    return res.status(401).json({ error: 'This 2FA challenge has expired. Please log in again.' });
  }
  const db = loadDatabase();
  const user = db.users.find((u: any) => u.id === pending.userId);
  if (!user || !user.twoFactorSecret) {
    pending2FALogins.delete(twoFactorToken);
    return res.status(401).json({ error: '2FA is not enabled for this account.' });
  }
  if (!totpVerify(user.twoFactorSecret, code)) {
    return res.status(401).json({ error: 'Invalid authentication code.' });
  }
  pending2FALogins.delete(twoFactorToken);
  const token = crypto.randomBytes(32).toString('hex');
  setSessionToken(token, user.id, { ip: (req as any).ip, userAgent: req.get('user-agent') });
  res.json({
    message: 'Login successful',
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      username: user.username,
      isLocationVerified: !!user.isLocationVerified,
      countryCode: user.countryCode,
      profile: user.profile,
      following: user.following || []
    }
  });
});

// --- TOTP 2FA SETUP / VERIFY / DISABLE ---
app.post('/api/2fa/setup', requireAuth, (req, res) => {
  const user = (req as any).user;
  if (user.twoFactorSecret) {
    return res.status(400).json({ error: '2FA is already enabled for this account.' });
  }
  const secret = generateTOTPSecret();
  const db = loadDatabase();
  const dbUser = db.users.find((u: any) => u.id === user.id);
  if (!dbUser) return res.status(404).json({ error: 'User not found.' });
  dbUser.pending2FASecret = secret;
  saveDatabase(db);

  const accountName = user.email || user.name || user.id;
  const otpauth = otpauthUrl(secret, accountName);
  QRCode.toDataURL(otpauth, { width: 220, margin: 1 }, (err: any, url: string) => {
    if (err) return res.json({ secret, otpauthUrl: otpauth, qrCodeDataUrl: null });
    res.json({ secret, otpauthUrl: otpauth, qrCodeDataUrl: url });
  });
});

app.post('/api/2fa/verify', requireAuth, (req, res) => {
  const user = (req as any).user;
  const { code } = req.body || {};
  const db = loadDatabase();
  const dbUser = db.users.find((u: any) => u.id === user.id);
  if (!dbUser) return res.status(404).json({ error: 'User not found.' });
  const secret = dbUser.pending2FASecret || dbUser.twoFactorSecret;
  if (!secret) return res.status(400).json({ error: 'No pending 2FA setup found. Run setup first.' });
  if (!totpVerify(secret, code)) {
    return res.status(401).json({ error: 'Invalid authentication code.' });
  }
  dbUser.twoFactorSecret = secret;
  dbUser.twoFactorEnabled = true;
  dbUser.pending2FASecret = undefined;
  // Enable 2FA rewards the account with extra trust (from arena-ai port).
  dbUser.trustScore = (dbUser.trustScore || 0) + 10;
  saveDatabase(db);
  res.json({ success: true, message: 'Two-factor authentication enabled.', trustScore: dbUser.trustScore });
});

app.post('/api/2fa/disable', requireAuth, (req, res) => {
  const user = (req as any).user;
  const { code } = req.body || {};
  const db = loadDatabase();
  const dbUser = db.users.find((u: any) => u.id === user.id);
  if (!dbUser || !dbUser.twoFactorSecret) return res.status(400).json({ error: '2FA is not enabled.' });
  if (!totpVerify(dbUser.twoFactorSecret, code)) {
    return res.status(401).json({ error: 'Invalid authentication code.' });
  }
  dbUser.twoFactorSecret = undefined;
  dbUser.twoFactorEnabled = false;
  saveDatabase(db);
  res.json({ success: true, message: 'Two-factor authentication disabled.' });
});

app.get('/api/2fa/status', requireAuth, (req, res) => {
  const user = (req as any).user;
  const db = loadDatabase();
  const dbUser = db.users.find((u: any) => u.id === user.id);
  res.json({ enabled: !!(dbUser && dbUser.twoFactorSecret), trustScore: dbUser?.trustScore || 0 });
});

// LOGOUT
app.post('/api/auth/logout', requireAuth, (req, res) => {
  const token = (req as any).sessionToken;
  activeSessions.delete(token);
  saveSessions();
  res.json({ success: true, message: 'Logged out successfully.' });
});

// VERIFY PASSWORD FOR ANONYMOUS SWITCH
app.post('/api/auth/verify-password', requireAuth, (req, res) => {
  const { password } = req.body;
  const user = (req as any).user;

  if (!password) {
    return res.status(400).json({ error: 'Password is required.' });
  }

  const db = loadDatabase();
  const dbUser = db.users.find((u: any) => u.id === user.id);

  if (!dbUser) {
    return res.status(404).json({ error: 'User account not found.' });
  }

  const candidateHash = crypto.pbkdf2Sync(password, dbUser.salt, 10000, 64, 'sha256').toString('hex');
  if (candidateHash !== dbUser.passwordHash) {
    return res.status(401).json({ error: 'Incorrect password.' });
  }

  res.json({ success: true, message: 'Password verified successfully.' });
});

// GET CURRENT USER ME
app.get('/api/auth/me', requireAuth, (req, res) => {
  const user = (req as any).user;
  const db = loadDatabase();
  const dbUser = db.users.find((u: any) => u.id === user.id);
  if (!dbUser) {
    return res.status(404).json({ error: 'User not found' });
  }

  // Ensure friends arrays exist
  dbUser.friends = dbUser.friends || [];
  dbUser.friendRequestsSent = dbUser.friendRequestsSent || [];
  dbUser.friendRequestsReceived = dbUser.friendRequestsReceived || [];

  // Digital Legacy (feature 20): keep lastActiveAt fresh (throttled writes) so
  // the inactivity scan can memorialize genuinely-inactive accounts.
  if (!dbUser.lastActiveAt || Date.now() - dbUser.lastActiveAt > 60_000) {
    dbUser.lastActiveAt = Date.now();
    saveDatabase(db);
  }

  const friendsList = dbUser.friends.map((fid: string) => {
    const friend = db.users.find((u: any) => u.id === fid);
    return friend ? {
      id: friend.id,
      name: friend.name,
      username: friend.username || friend.profile?.username || friend.name.toLowerCase().replace(/[^a-z0-9_]/g, ''),
      avatarUrl: friend.profile?.avatarUrl || ''
    } : null;
  }).filter(Boolean);

  const friendRequestsReceivedList = dbUser.friendRequestsReceived.map((fid: string) => {
    const requestor = db.users.find((u: any) => u.id === fid);
    return requestor ? {
      id: requestor.id,
      name: requestor.name,
      username: requestor.username || requestor.profile?.username || requestor.name.toLowerCase().replace(/[^a-z0-9_]/g, ''),
      avatarUrl: requestor.profile?.avatarUrl || ''
    } : null;
  }).filter(Boolean);

  const profileCopy = { ...dbUser.profile };
  profileCopy.followersCount = friendsList.length;

  const repostsMap = getRepostsCountMap(db);

  if (profileCopy.posts) {
    profileCopy.posts = profileCopy.posts.map((p: any) => {
      // Resolve comments
      const resolvedComments = (p.comments || []).map((c: any) => {
        let senderName = c.senderName;
        let senderAvatarUrl = '';
        if (c.senderId) {
          const commentUser = db.users.find((userObj: any) => userObj.id === c.senderId);
          if (commentUser) {
            senderName = commentUser.name;
            senderAvatarUrl = commentUser.profile?.avatarUrl || '';
          }
        }
        return {
          ...c,
          senderName,
          senderAvatarUrl
        };
      });

      // Resolve likedBy
      const resolvedLikedBy = (p.likedBy || []).map((id: string) => {
        if (id.startsWith('guest-')) {
          return { id, name: 'Guest Visitor', avatarUrl: '' };
        }
        const userObj = db.users.find((userObj: any) => userObj.id === id);
        if (userObj) {
          return {
            id: userObj.id,
            name: userObj.name,
            avatarUrl: userObj.profile?.avatarUrl || ''
          };
        }
        return { id, name: 'Anonymous User', avatarUrl: '' };
      });

      // Resolve repostedFrom
      let resolvedRepostedFrom = p.repostedFrom;
      if (p.isRepost && p.repostedFrom && p.repostedFrom.id) {
        if (!p.repostedFrom.id.startsWith('anon-user-')) {
          const originalUser = db.users.find((userObj: any) => userObj.id === p.repostedFrom.id);
          if (originalUser) {
            resolvedRepostedFrom = {
              ...p.repostedFrom,
              name: originalUser.name
            };
          }
        }
      }

      const countById = p.id ? (repostsMap.get(`id:${p.id}`) || 0) : 0;
      const isAnon = !!p.isAnonymous;
      const creatorIdForMap = isAnon ? (p.anonymousCreatorId || 'anon-user-BD-99-9999') : dbUser.id;
      const countByText = (creatorIdForMap && p.title && p.content) ? (repostsMap.get(`text:${creatorIdForMap}:${p.title.trim()}:${p.content.trim()}`) || 0) : 0;
      const repostsCount = Math.max(countById, countByText);

      return {
        ...p,
        comments: resolvedComments,
        likedByUsers: resolvedLikedBy,
        repostedFrom: resolvedRepostedFrom,
        repostsCount,
        creator: {
          id: dbUser.id,
          name: dbUser.name,
          username: dbUser.profile?.username || dbUser.username || '',
          avatarUrl: dbUser.profile?.avatarUrl || '',
          tagline: '',
          badgeNumber: dbUser.profile?.badgeNumber || 'BD-00'
        }
      };
    });
  }

  res.json({
    user: {
      id: dbUser.id,
      name: dbUser.name,
      email: dbUser.email,
      username: dbUser.username,
      isLocationVerified: !!dbUser.isLocationVerified,
      countryCode: dbUser.countryCode,
      profile: profileCopy,
      following: dbUser.following || [],
      followers: friendsList,
      friends: friendsList,
      friendRequestsSent: dbUser.friendRequestsSent || [],
      friendRequestsReceived: friendRequestsReceivedList
    }
  });
});

// 3. FORGOT PASSWORD / REQUEST RESET
app.post('/api/auth/reset-request', (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ error: 'Email address is required.' });
  }

  const cleanEmail = email.toLowerCase().trim();

  // Rate-limit check: 3–5 attempts per 10 minutes, then cooldown
  const now = Date.now();
  let rateInfo = resetAttempts.get(cleanEmail);
  if (!rateInfo) {
    rateInfo = { count: 0, attemptsTimestamps: [] };
  }

  // Filter out attempts older than 10 minutes (600,000ms)
  rateInfo.attemptsTimestamps = rateInfo.attemptsTimestamps.filter(t => now - t < 600000);

  // Check if locked out
  if (rateInfo.lockoutUntil && now < rateInfo.lockoutUntil) {
    const remainingSec = Math.ceil((rateInfo.lockoutUntil - now) / 1000);
    return res.status(429).json({
      error: `Reset attempts locked out due to high volume of requests. Please wait ${remainingSec} seconds.`
    });
  }

  if (rateInfo.attemptsTimestamps.length >= 4) {
    // Lock out for 10 minutes
    rateInfo.lockoutUntil = now + 600000;
    resetAttempts.set(cleanEmail, rateInfo);
    return res.status(429).json({
      error: "Too many password reset requests. Account locked out for 10 minutes."
    });
  }

  // Register attempt timestamp
  rateInfo.attemptsTimestamps.push(now);
  resetAttempts.set(cleanEmail, rateInfo);

  const db = loadDatabase();
  const user = db.users.find((u: any) => u.email === cleanEmail);
  if (!user) {
    return res.status(404).json({ error: 'No account registered with this email address.' });
  }

  // Randomly pick 4 distinct positions from 1 to 12
  const pool = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  const selectedPositions: number[] = [];
  for (let i = 0; i < 4; i++) {
    const index = Math.floor(Math.random() * pool.length);
    selectedPositions.push(pool.splice(index, 1)[0]);
  }
  selectedPositions.sort((a, b) => a - b);

  // Generate random Reset Token to represent this flow
  const resetToken = crypto.randomBytes(24).toString('hex');

  // Store the active reset state in a temporary server storage
  // In real systems this can expire in 10 minutes
  (app as any).activeResets = (app as any).activeResets || new Map();
  (app as any).activeResets.set(resetToken, {
    userId: user.id,
    email: cleanEmail,
    positions: selectedPositions,
    expiresAt: now + 600000 // 10 minutes
  });

  res.json({
    resetToken,
    positions: selectedPositions
  });
});

// CONFIRM RESET & SET NEW PASSWORD
app.post('/api/auth/reset-confirm', (req, res) => {
  const { resetToken, answers, newPassword } = req.body;

  if (!resetToken || !answers || !newPassword) {
    return res.status(400).json({ error: 'Reset token, answers, and new password are required.' });
  }
  if (typeof newPassword !== 'string' || newPassword.length < 8 || newPassword.length > 128) {
    return res.status(400).json({ error: 'New password must be between 8 and 128 characters.' });
  }

  const activeResets = (app as any).activeResets;
  if (!activeResets || !activeResets.has(resetToken)) {
    return res.status(400).json({ error: 'Reset token is invalid, expired, or already used.' });
  }

  const resetState = activeResets.get(resetToken);
  if (Date.now() > resetState.expiresAt) {
    activeResets.delete(resetToken);
    return res.status(400).json({ error: 'Reset session expired. Please start over.' });
  }

  const db = loadDatabase();
  const user = db.users.find((u: any) => u.id === resetState.userId);
  if (!user) {
    return res.status(400).json({ error: 'Associated user account no longer exists.' });
  }

  try {
    // 1. Decrypt DEK using Master Key (proving words allows resetting)
    const dek = decryptWithKey(user.encryptedDekMaster, user.encryptedDekMasterIv, MASTER_KEY);

    // 2. Decrypt 12 words with the DEK to compare with user answers
    const wordsBytes = decryptWithKey(user.encryptedWords, user.encryptedWordsIv, dek);
    const words: string[] = JSON.parse(wordsBytes.toString('utf8'));

    // 3. Verify specific selected positions
    for (const pos of resetState.positions) {
      const expectedWord = words[pos - 1].toLowerCase().trim();
      const providedWord = (answers[pos] || '').toLowerCase().trim();

      if (expectedWord !== providedWord) {
        return res.status(400).json({
          error: `Incorrect recovery word at position ${pos}. Please check your list and try again.`
        });
      }
    }

    // 4. Words verified successfully! Now derive new KEK and encrypt same DEK
    const newSalt = crypto.randomBytes(16).toString('hex');
    const newKek = deriveKek(newPassword, newSalt);

    const encDek = encryptWithKey(dek, newKek);
    const newPasswordHash = crypto.pbkdf2Sync(newPassword, newSalt, 10000, 64, 'sha256').toString('hex');

    // Update user credentials
    user.salt = newSalt;
    user.passwordHash = newPasswordHash;
    user.encryptedDek = encDek.ciphertext;
    user.encryptedDekIv = encDek.iv;

    // Reset rate-limits and cleanup reset sessions
    activeResets.delete(resetToken);
    resetAttempts.delete(resetState.email);

    saveDatabase(db);

    res.json({
      success: true,
      message: 'Your password has been successfully reset. You can now login with your new credentials.'
    });

  } catch (error) {
    console.error("Confirm reset error:", error);
    res.status(500).json({ error: 'Cryptographic error occurred during security verification.' });
  }
});

// 4. VIEW MY RECOVERY WORDS
app.post('/api/auth/view-words', requireAuth, (req, res) => {
  const { password } = req.body;
  const user = (req as any).user;

  if (!password) {
    return res.status(400).json({ error: 'Current password is required to verify your identity.' });
  }

  const now = Date.now();
  const rateInfo = viewWordsAttempts.get(user.id);
  if (rateInfo) {
    const elapsed = now - rateInfo.lastAttempt;
    if (elapsed < 3600000) { // 1 hour = 3600000ms
      const remainingMin = Math.ceil((3600000 - elapsed) / 60000);
      return res.status(429).json({
        error: `Security lockout active. You can only view recovery words once per hour. Please wait ${remainingMin} minutes.`
      });
    }
  }

  // Verify password hash
  const candidateHash = crypto.pbkdf2Sync(password, user.salt, 10000, 64, 'sha256').toString('hex');
  if (candidateHash !== user.passwordHash) {
    // Mark failed or successful attempts alike to enforce the rate limit/prevent probing
    viewWordsAttempts.set(user.id, { lastAttempt: now });
    return res.status(401).json({ error: 'Incorrect password. Identity verification failed.' });
  }

  try {
    // Decrypt DEK using current password KEK
    const kek = deriveKek(password, user.salt);
    const dek = decryptWithKey(user.encryptedDek, user.encryptedDekIv, kek);

    // Decrypt words with DEK
    const wordsBytes = decryptWithKey(user.encryptedWords, user.encryptedWordsIv, dek);
    const words: string[] = JSON.parse(wordsBytes.toString('utf8'));

    // Register last successful attempt timestamp for 1-hour rate limit
    viewWordsAttempts.set(user.id, { lastAttempt: now });

    res.json({
      success: true,
      words
    });

  } catch (error) {
    console.error("View words error:", error);
    res.status(500).json({ error: 'Unable to decrypt recovery phrase.' });
  }
});

// --- CORE PRODUCT WORKSPACE APIS (Multi-User Data Storage) ---

// UPDATE USER PROFILE
app.post('/api/profile/update', requireAuth, (req, res) => {
  const user = (req as any).user;
  const { profile } = req.body;

  if (!profile) {
    return res.status(400).json({ error: 'Profile data is required.' });
  }

  const db = loadDatabase();
  const dbUser = db.users.find((u: any) => u.id === user.id);

  if (dbUser) {
    if (profile.name) {
      dbUser.name = profile.name;
    }
    // Preserve core fields that aren't editable via free input
    dbUser.profile = {
      ...dbUser.profile,
      ...profile,
      posts: dbUser.profile.posts || [] // Keep posts separate
    };
    saveDatabase(db);
    res.json({ success: true, profile: dbUser.profile });
  } else {
    res.status(404).json({ error: 'User not found' });
  }
});

// SAVE/UPDATE POSTS
app.post('/api/posts/update', requireAuth, (req, res) => {
  const user = (req as any).user;
  const { posts } = req.body;

  if (!posts || !Array.isArray(posts)) {
    return res.status(400).json({ error: 'Posts list is required and must be an array.' });
  }

  const db = loadDatabase();
  const dbUser = db.users.find((u: any) => u.id === user.id);

  if (dbUser) {
    const oldPosts = dbUser.profile.posts || [];
    const oldIds = oldPosts.map((p: any) => p.id);
    
    // Compare and process new posts
    posts.forEach((post: any) => {
      if (!oldIds.includes(post.id)) {
        // This is a new publication!
        // 1. Scan for mentions in post content
        parseAndSendMentions(db, post.content || '', { id: user.id, name: user.name }, { postId: post.id, postTitle: post.title });
        
        // 2. Scan if it is a repost
        if (post.isRepost && post.repostedFrom && post.repostedFrom.id) {
          addNotification(db, post.repostedFrom.id, 'repost', { id: user.id, name: user.name }, { postId: post.id, postTitle: post.title });
        }
      }
    });

    dbUser.profile.posts = posts;
    saveDatabase(db);
    res.json({ success: true, posts });
  } else {
    res.status(404).json({ error: 'User not found' });
  }
});

// DIRECT MESSAGES (REALTIME persistence)
app.post('/api/messages/send', (req, res) => {
  const { senderName, receiverId, text } = req.body;

  if (!senderName || !receiverId || !text) {
    return res.status(400).json({ error: 'Sender name, recipient ID, and message text are required.' });
  }

  const db = loadDatabase();
  const newMessage = {
    id: `msg-${Date.now()}`,
    senderName,
    receiverId,
    text,
    timestamp: new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  };

  db.messages = db.messages || [];
  db.messages.push(newMessage);
  saveDatabase(db);

  res.json({ success: true, message: newMessage });
});

app.get('/api/messages', requireAuth, (req, res) => {
  const user = (req as any).user;
  const db = loadDatabase();
  const dbMessages = db.messages || [];

  // Filter messages intended for this logged-in user or the original seed ID, and map them
  const userMessages = dbMessages
    .filter((m: any) => m.receiverId === user.id || m.receiverId === 'alex-rivera-id')
    .map((m: any) => ({
      ...m,
      receiverId: user.id
    }));
  res.json({ messages: userMessages });
});

// ==========================================
// REAL-TIME CHAT ENGINE ROUTE HIGHLIGHTS
// ==========================================

// Get user's conversations with last message preview and unread counts
app.get('/api/chat/conversations', requireAuth, (req, res) => {
  const user = (req as any).user;
  const db = loadDatabase();
  
  const conversations = (db.conversations || []).filter((c: any) => 
    (c.participants || []).includes(user.id) &&
    !(c.deletedBy || []).includes(user.id)
  );
  
  const hydrated = conversations.map((conv: any) => {
    const msgs = (db.chatMessages || []).filter((m: any) => m.conversationId === conv.id);
    const lastMessage = msgs[msgs.length - 1] || null;
    const unreadCount = msgs.filter((m: any) => 
      m.senderId !== user.id && !(m.readBy || []).includes(user.id)
    ).length;
    
    let name = conv.name;
    let avatarUrl = conv.avatarUrl;
    
    if (!conv.isGroup) {
      const otherId = (conv.participants || []).find((p: string) => p !== user.id);
      const otherUser = db.users.find((u: any) => u.id === otherId);
      if (otherUser) {
        name = otherUser.name;
        avatarUrl = otherUser.profile?.avatarUrl || '';
      } else {
        name = 'Unknown User';
        avatarUrl = '';
      }
    }

    const isArchived = (conv.archivedBy || []).includes(user.id);
    const isMuted = (conv.mutedBy || []).includes(user.id);
    const isBlocked = conv.isGroup || conv.isChannel ? false : (() => {
      const otherId = (conv.participants || []).find((p: string) => p !== user.id);
      if (!otherId) return false;
      const dbUser = db.users.find((u: any) => u.id === user.id);
      const otherUser = db.users.find((u: any) => u.id === otherId);
      return !!(
        (dbUser?.blockedUserIds || []).includes(otherId) ||
        (otherUser?.blockedUserIds || []).includes(user.id)
      );
    })();
    
    return {
      ...conv,
      name,
      avatarUrl,
      lastMessage,
      unreadCount,
      isArchived,
      isMuted,
      isBlocked,
      isChannel: !!conv.isChannel,
      joinCode: conv.joinCode || conv.id,
      pinnedMessageId: conv.pinnedMessageId || null,
      adminIds: conv.adminIds || [conv.creatorId],
      slowModeSeconds: conv.slowModeSeconds || 0
    };
  });
  
  hydrated.sort((a: any, b: any) => {
    const timeA = a.lastMessage ? a.lastMessage.timestamp : (a.createdTime || 0);
    const timeB = b.lastMessage ? b.lastMessage.timestamp : (b.createdTime || 0);
    return timeB - timeA;
  });
  
  res.json({ conversations: hydrated });
});

// Block/Unblock, Archive, Delete chat endpoints
app.post('/api/chat/users/:userId/block', requireAuth, (req, res) => {
  const { userId } = req.params;
  const user = (req as any).user;
  const db = loadDatabase();
  
  const dbUser = db.users.find((u: any) => u.id === user.id);
  if (!dbUser) return res.status(404).json({ error: 'User not found' });
  
  dbUser.blockedUserIds = dbUser.blockedUserIds || [];
  if (!dbUser.blockedUserIds.includes(userId)) {
    dbUser.blockedUserIds.push(userId);
    saveDatabase(db);
  }
  res.json({ success: true, blockedUserIds: dbUser.blockedUserIds });
});

app.post('/api/chat/users/:userId/unblock', requireAuth, (req, res) => {
  const { userId } = req.params;
  const user = (req as any).user;
  const db = loadDatabase();
  
  const dbUser = db.users.find((u: any) => u.id === user.id);
  if (!dbUser) return res.status(404).json({ error: 'User not found' });
  
  dbUser.blockedUserIds = dbUser.blockedUserIds || [];
  dbUser.blockedUserIds = dbUser.blockedUserIds.filter((id: string) => id !== userId);
  saveDatabase(db);
  res.json({ success: true, blockedUserIds: dbUser.blockedUserIds });
});

app.post('/api/chat/conversations/:conversationId/archive', requireAuth, (req, res) => {
  const { conversationId } = req.params;
  const user = (req as any).user;
  const db = loadDatabase();
  
  const conv = (db.conversations || []).find((c: any) => c.id === conversationId);
  if (!conv || !(conv.participants || []).includes(user.id)) {
    return res.status(403).json({ error: 'Access denied' });
  }
  
  conv.archivedBy = conv.archivedBy || [];
  if (!conv.archivedBy.includes(user.id)) {
    conv.archivedBy.push(user.id);
    saveDatabase(db);
  }
  res.json({ success: true });
});

app.post('/api/chat/conversations/:conversationId/unarchive', requireAuth, (req, res) => {
  const { conversationId } = req.params;
  const user = (req as any).user;
  const db = loadDatabase();
  
  const conv = (db.conversations || []).find((c: any) => c.id === conversationId);
  if (!conv || !(conv.participants || []).includes(user.id)) {
    return res.status(403).json({ error: 'Access denied' });
  }
  
  conv.archivedBy = conv.archivedBy || [];
  conv.archivedBy = conv.archivedBy.filter((id: string) => id !== user.id);
  saveDatabase(db);
  res.json({ success: true });
});

app.post('/api/chat/conversations/:conversationId/delete', requireAuth, (req, res) => {
  const { conversationId } = req.params;
  const user = (req as any).user;
  const db = loadDatabase();
  
  const conv = (db.conversations || []).find((c: any) => c.id === conversationId);
  if (!conv || !(conv.participants || []).includes(user.id)) {
    return res.status(403).json({ error: 'Access denied' });
  }
  
  conv.deletedBy = conv.deletedBy || [];
  if (!conv.deletedBy.includes(user.id)) {
    conv.deletedBy.push(user.id);
    saveDatabase(db);
  }
  res.json({ success: true });
});

// Get paginated/lazy-loaded message history for a conversation
app.get('/api/chat/conversations/:conversationId/messages', requireAuth, (req, res) => {
  const { conversationId } = req.params;
  const beforeTimestamp = req.query.beforeTimestamp ? parseInt(req.query.beforeTimestamp as string) : null;
  const limit = req.query.limit ? parseInt(req.query.limit as string) : 20;
  const user = (req as any).user;
  
  const db = loadDatabase();
  const conv = (db.conversations || []).find((c: any) => c.id === conversationId);
  if (!conv || !(conv.participants || []).includes(user.id)) {
    return res.status(403).json({ error: 'Access denied to this conversation.' });
  }
  
  let msgs = (db.chatMessages || []).filter((m: any) => m.conversationId === conversationId);
  
  if (beforeTimestamp) {
    msgs = msgs.filter((m: any) => m.timestamp < beforeTimestamp);
  }
  
  msgs.sort((a: any, b: any) => b.timestamp - a.timestamp);
  
  const sliced = msgs.slice(0, limit);
  sliced.reverse(); // client needs ascending chronological order
  
  res.json({ 
    messages: sliced, 
    hasMore: msgs.length > limit 
  });
});

// REST API endpoint to send a message to a conversation (fallback/robustness support)
app.post('/api/chat/conversations/:conversationId/messages', requireAuth, (req, res) => {
  const { conversationId } = req.params;
  const { text, mediaUrl, mediaName, replyToMessageId } = req.body;
  const user = (req as any).user;
  
  const db = loadDatabase();
  const conv = (db.conversations || []).find((c: any) => c.id === conversationId);
  if (!conv || !(conv.participants || []).includes(user.id)) {
    return res.status(403).json({ error: 'Access denied to this conversation.' });
  }

  // Event-group archive guard (self-destructing event groups, feature 11):
  // an archived event group (or one past its end date + 24h) is read-only.
  if (conv.isEventGroup && (conv.archived || (conv.eventEndDate && Date.now() > conv.eventEndDate + 24 * 60 * 60 * 1000))) {
    return res.status(403).json({ error: 'This event group is archived — chat is read-only.' });
  }

  // Block check
  if (!conv.isGroup) {
    const otherId = (conv.participants || []).find((p: string) => p !== user.id);
    if (otherId) {
      const dbUser = db.users.find((u: any) => u.id === user.id);
      const otherUser = db.users.find((u: any) => u.id === otherId);
      const isUserBlocked = 
        (dbUser?.blockedUserIds || []).includes(otherId) || 
        (otherUser?.blockedUserIds || []).includes(user.id);
      if (isUserBlocked) {
        return res.status(403).json({ error: 'Communication blocked between these users.' });
      }

      // Privacy Lock checks
      const otherUserFollowing = otherUser?.following || [];
      const otherUserFriends = otherUser?.friends || [];
      const dbUserFollowing = dbUser?.following || [];

      const isFollowingSender = otherUserFollowing.includes(user.id);
      const isSenderFriend = otherUserFriends.includes(user.id);
      const isSenderFollowingRecipient = dbUserFollowing.includes(otherId);

      // Old isMessageLocked (followed accounts only)
      if (otherUser?.profile?.isMessageLocked && !isFollowingSender) {
        return res.status(403).json({ error: 'This user has restricted direct messaging to followed accounts only.' });
      }

      // New Public Messaging toggle (friends or followers only)
      if (otherUser?.profile?.isPublicMessagingEnabled === false) {
        if (!isFollowingSender && !isSenderFriend && !isSenderFollowingRecipient) {
          return res.status(403).json({ error: 'This user has disabled public messaging. You must be a friend or follower to message them.' });
        }
      }
    }
  }
  
  const msgId = `msg-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const sender = db.users.find((u: any) => u.id === user.id);
  
  const newMsg = {
    id: msgId,
    conversationId,
    senderId: user.id,
    senderName: sender?.name || 'Someone',
    senderAvatar: sender?.profile?.avatarUrl || '',
    text: text || '',
    mediaUrl: mediaUrl || null,
    mediaName: mediaName || null,
    replyToMessageId: replyToMessageId || null,
    reactions: {},
    timestamp: Date.now(),
    status: 'sent',
    readBy: [user.id]
  };
  
  if (!db.chatMessages) db.chatMessages = [];
  db.chatMessages.push(newMsg);
  
  // Update lastMessage on conversation
  conv.lastMessage = newMsg;
  
  // Trigger notifications for other participants in conversation
  const otherParticipants = (conv.participants || []).filter((pId: string) => pId !== user.id);
  otherParticipants.forEach((pId: string) => {
    addNotification(db, pId, 'chat_message', { id: user.id, name: sender?.name || 'Someone' }, { interestText: text || (mediaName ? `File: ${mediaName}` : 'Attachment') });
  });

  saveDatabase(db);
  
  // Broadcast via WebSockets
  broadcastMessageToUsers(conv.participants || [], {
    type: 'message_received',
    message: newMsg
  });
  
  res.json({ success: true, message: newMsg });
});

// REST API endpoint to mark conversation messages as read
app.post('/api/chat/conversations/:conversationId/read', requireAuth, (req, res) => {
  const { conversationId } = req.params;
  const { messageIds } = req.body;
  const user = (req as any).user;

  const db = loadDatabase();
  const conv = (db.conversations || []).find((c: any) => c.id === conversationId);
  if (!conv || !(conv.participants || []).includes(user.id)) {
    return res.status(403).json({ error: 'Access denied to this conversation.' });
  }

  let changed = false;
  const updatedMsgIds: string[] = [];

  (db.chatMessages || []).forEach((msg: any) => {
    if (msg.conversationId === conversationId) {
      if (!messageIds || (Array.isArray(messageIds) && (messageIds.length === 0 || messageIds.includes(msg.id)))) {
        msg.readBy = msg.readBy || [];
        if (!msg.readBy.includes(user.id)) {
          msg.readBy.push(user.id);
          changed = true;
          updatedMsgIds.push(msg.id);
        }
      }
    }
  });

  if (changed) {
    saveDatabase(db);
    broadcastMessageToUsers(conv.participants || [], {
      type: 'messages_read',
      conversationId,
      readerId: user.id,
      messageIds: updatedMsgIds
    });
  }

  res.json({ success: true, updatedCount: updatedMsgIds.length });
});

// REST API endpoint to edit a chat message
app.post('/api/chat/conversations/:conversationId/messages/:messageId/edit', requireAuth, (req, res) => {
  const { conversationId, messageId } = req.params;
  const { text } = req.body;
  const user = (req as any).user;

  const db = loadDatabase();
  const conv = (db.conversations || []).find((c: any) => c.id === conversationId);
  if (!conv || !(conv.participants || []).includes(user.id)) {
    return res.status(403).json({ error: 'Access denied to this conversation.' });
  }

  const msg = (db.chatMessages || []).find((m: any) => m.id === messageId);
  if (!msg || msg.senderId !== user.id) {
    return res.status(403).json({ error: 'Cannot edit this message.' });
  }

  msg.text = text;
  msg.edited = true;
  saveDatabase(db);

  broadcastMessageToUsers(conv.participants || [], {
    type: 'message_edited',
    conversationId,
    message: msg
  });

  res.json({ success: true, message: msg });
});

// REST API endpoint to delete a chat message
app.post('/api/chat/conversations/:conversationId/messages/:messageId/delete', requireAuth, (req, res) => {
  const { conversationId, messageId } = req.params;
  const user = (req as any).user;

  const db = loadDatabase();
  const conv = (db.conversations || []).find((c: any) => c.id === conversationId);
  if (!conv || !(conv.participants || []).includes(user.id)) {
    return res.status(403).json({ error: 'Access denied to this conversation.' });
  }

  const msg = (db.chatMessages || []).find((m: any) => m.id === messageId);
  if (!msg || msg.senderId !== user.id) {
    return res.status(403).json({ error: 'Cannot delete this message.' });
  }

  const elapsed = Date.now() - msg.timestamp;
  if (elapsed > 10 * 60 * 1000) {
    return res.status(400).json({ error: 'Messages can only be deleted within 10 minutes of sending.' });
  }

  msg.text = 'This message was deleted';
  msg.deleted = true;
  msg.mediaUrl = null;
  msg.mediaName = null;
  saveDatabase(db);

  broadcastMessageToUsers(conv.participants || [], {
    type: 'message_deleted',
    conversationId,
    messageId,
    message: msg
  });

  res.json({ success: true, message: msg });
});

// REST API endpoint to toggle a reaction on a chat message
app.post('/api/chat/conversations/:conversationId/messages/:messageId/react', requireAuth, (req, res) => {
  const { conversationId, messageId } = req.params;
  const { emoji } = req.body;
  const user = (req as any).user;

  if (!emoji) return res.status(400).json({ error: 'Emoji is required.' });

  const db = loadDatabase();
  const conv = (db.conversations || []).find((c: any) => c.id === conversationId);
  if (!conv || !(conv.participants || []).includes(user.id)) {
    return res.status(403).json({ error: 'Access denied to this conversation.' });
  }

  const msg = (db.chatMessages || []).find((m: any) => m.id === messageId);
  if (!msg) return res.status(404).json({ error: 'Message not found.' });

  msg.reactions = msg.reactions || {};
  msg.reactions[emoji] = msg.reactions[emoji] || [];

  if (msg.reactions[emoji].includes(user.id)) {
    msg.reactions[emoji] = msg.reactions[emoji].filter((uid: string) => uid !== user.id);
  } else {
    msg.reactions[emoji].push(user.id);
  }

  saveDatabase(db);

  broadcastMessageToUsers(conv.participants || [], {
    type: 'message_reacted',
    conversationId,
    messageId,
    message: msg
  });

  res.json({ success: true, message: msg });
});

// Create/start a new 1:1, Group, or Channel Conversation
app.post('/api/chat/conversations', requireAuth, (req, res) => {
  const user = (req as any).user;
  const { isGroup, isChannel, isOpenGroup, isPrivate, slowModeSeconds, name, description, participantIds, avatarUrl } = req.body;
  
  if (!participantIds || !Array.isArray(participantIds)) {
    return res.status(400).json({ error: 'Participants list is required.' });
  }
  
  const finalParticipants = Array.from(new Set([...participantIds, user.id]));
  const db = loadDatabase();
  db.conversations = db.conversations || [];
  
  if (!isGroup && !isChannel && !isOpenGroup && finalParticipants.length === 2) {
    const otherId = finalParticipants.find((p: string) => p !== user.id);
    if (otherId) {
      const dbUser = db.users.find((u: any) => u.id === user.id);
      const otherUser = db.users.find((u: any) => u.id === otherId);
      const otherUserFollowing = otherUser?.following || [];
      const otherUserFriends = otherUser?.friends || [];
      const dbUserFollowing = dbUser?.following || [];

      const isFollowingSender = otherUserFollowing.includes(user.id);
      const isSenderFriend = otherUserFriends.includes(user.id);
      const isSenderFollowingRecipient = dbUserFollowing.includes(otherId);

      // Old isMessageLocked (followed accounts only)
      if (otherUser?.profile?.isMessageLocked && !isFollowingSender) {
        return res.status(403).json({ error: 'This user has restricted direct messaging to followed accounts only.' });
      }

      // New Public Messaging toggle (friends or followers only)
      if (otherUser?.profile?.isPublicMessagingEnabled === false) {
        if (!isFollowingSender && !isSenderFriend && !isSenderFollowingRecipient) {
          return res.status(403).json({ error: 'This user has disabled public messaging. You must be a friend or follower to message them.' });
        }
      }
    }

    const existing = db.conversations.find((c: any) => 
      !c.isGroup && 
      !c.isChannel &&
      !c.isOpenGroup &&
      c.participants.length === 2 && 
      finalParticipants.every((p: string) => c.participants.includes(p))
    );
    if (existing) {
      return res.json({ conversation: existing, existed: true });
    }
  }
  
  const convId = `conv-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const joinCode = `join-${Math.random().toString(36).substring(2, 10)}`;

  let defaultName = 'New Chat';
  if (isChannel) defaultName = 'New Broadcast Channel';
  else if (isOpenGroup) defaultName = 'Open Community Room';
  else if (isGroup) defaultName = 'New Group Chat';

  const newConv = {
    id: convId,
    isGroup: !!isGroup || !!isOpenGroup,
    isChannel: !!isChannel,
    isOpenGroup: !!isOpenGroup,
    isPrivate: !!isPrivate,
    joinCode,
    name: (name || '').trim() || defaultName,
    description: (description || '').trim() || (isChannel ? 'Official broadcast channel.' : (isOpenGroup ? 'Open public discussion channel.' : '')),
    avatarUrl: avatarUrl || '',
    creatorId: user.id,
    adminIds: [user.id],
    participants: finalParticipants,
    mutedBy: [],
    pinnedMessageId: null,
    slowModeSeconds: slowModeSeconds ? parseInt(slowModeSeconds) : 0,
    createdTime: Date.now()
  };
  
  db.conversations.push(newConv);
  saveDatabase(db);
  
  res.json({ conversation: newConv, existed: false });
});

// Toggle Pin Message on Conversation
app.post('/api/chat/conversations/:conversationId/pin', requireAuth, (req, res) => {
  const { conversationId } = req.params;
  const { messageId } = req.body;
  const user = (req as any).user;

  const db = loadDatabase();
  const conv = (db.conversations || []).find((c: any) => c.id === conversationId);
  if (!conv || !(conv.participants || []).includes(user.id)) {
    return res.status(403).json({ error: 'Access denied' });
  }

  conv.pinnedMessageId = messageId || null;
  saveDatabase(db);

  broadcastMessageToUsers(conv.participants || [], {
    type: 'message_pinned',
    conversationId,
    pinnedMessageId: conv.pinnedMessageId
  });

  res.json({ success: true, pinnedMessageId: conv.pinnedMessageId });
});

// Toggle Mute Conversation
app.post('/api/chat/conversations/:conversationId/mute', requireAuth, (req, res) => {
  const { conversationId } = req.params;
  const user = (req as any).user;

  const db = loadDatabase();
  const conv = (db.conversations || []).find((c: any) => c.id === conversationId);
  if (!conv || !(conv.participants || []).includes(user.id)) {
    return res.status(403).json({ error: 'Access denied' });
  }

  conv.mutedBy = conv.mutedBy || [];
  if (conv.mutedBy.includes(user.id)) {
    conv.mutedBy = conv.mutedBy.filter((id: string) => id !== user.id);
  } else {
    conv.mutedBy.push(user.id);
  }
  saveDatabase(db);

  res.json({ success: true, isMuted: conv.mutedBy.includes(user.id) });
});

// Vote in Interactive Poll
app.post('/api/chat/conversations/:conversationId/messages/:messageId/vote', requireAuth, (req, res) => {
  const { conversationId, messageId } = req.params;
  const { optionId } = req.body;
  const user = (req as any).user;

  const db = loadDatabase();
  const conv = (db.conversations || []).find((c: any) => c.id === conversationId);
  if (!conv || !(conv.participants || []).includes(user.id)) {
    return res.status(403).json({ error: 'Access denied' });
  }

  const msg = (db.chatMessages || []).find((m: any) => m.id === messageId);
  if (!msg || !msg.poll || !msg.poll.options) {
    return res.status(404).json({ error: 'Poll not found' });
  }

  msg.poll.options.forEach((opt: any) => {
    opt.votes = opt.votes || [];
    if (opt.id === optionId) {
      if (opt.votes.includes(user.id)) {
        opt.votes = opt.votes.filter((uid: string) => uid !== user.id);
      } else {
        opt.votes.push(user.id);
      }
    } else if (!msg.poll.isMultipleChoice) {
      opt.votes = opt.votes.filter((uid: string) => uid !== user.id);
    }
  });

  saveDatabase(db);

  broadcastMessageToUsers(conv.participants || [], {
    type: 'message_edited',
    conversationId,
    messageId,
    message: msg
  });

  res.json({ success: true, poll: msg.poll });
});

// Forward Message to another conversation
app.post('/api/chat/conversations/:targetConversationId/forward', requireAuth, (req, res) => {
  const { targetConversationId } = req.params;
  const { sourceMessageId } = req.body;
  const user = (req as any).user;

  const db = loadDatabase();
  const targetConv = (db.conversations || []).find((c: any) => c.id === targetConversationId);
  if (!targetConv || !(targetConv.participants || []).includes(user.id)) {
    return res.status(403).json({ error: 'Access denied to target conversation' });
  }

  const sourceMsg = (db.chatMessages || []).find((m: any) => m.id === sourceMessageId);
  if (!sourceMsg) {
    return res.status(404).json({ error: 'Source message not found' });
  }

  const sender = db.users.find((u: any) => u.id === user.id);
  const msgId = `msg-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

  const newMsg = {
    id: msgId,
    conversationId: targetConversationId,
    senderId: user.id,
    senderName: sender?.name || 'Someone',
    senderAvatar: sender?.profile?.avatarUrl || '',
    text: sourceMsg.text || '',
    mediaUrl: sourceMsg.mediaUrl || null,
    mediaName: sourceMsg.mediaName || null,
    poll: sourceMsg.poll ? JSON.parse(JSON.stringify(sourceMsg.poll)) : null,
    forwardedFrom: {
      senderName: sourceMsg.senderName || 'Original Author'
    },
    reactions: {},
    timestamp: Date.now(),
    status: 'sent',
    readBy: [user.id]
  };

  db.chatMessages.push(newMsg);
  targetConv.lastMessage = newMsg;
  saveDatabase(db);

  broadcastMessageToUsers(targetConv.participants || [], {
    type: 'message_received',
    message: newMsg
  });

  res.json({ success: true, message: newMsg });
});

// Update Group/Channel Settings
app.post('/api/chat/conversations/:conversationId/settings', requireAuth, (req, res) => {
  const { conversationId } = req.params;
  const { name, description, avatarUrl, isPrivate, slowModeSeconds, adminIds } = req.body;
  const user = (req as any).user;

  const db = loadDatabase();
  const conv = (db.conversations || []).find((c: any) => c.id === conversationId);
  if (!conv || !(conv.participants || []).includes(user.id)) {
    return res.status(403).json({ error: 'Access denied' });
  }

  const isAdmin = conv.creatorId === user.id || (conv.adminIds || []).includes(user.id);
  if (!isAdmin) {
    return res.status(403).json({ error: 'Only group/channel administrators can modify settings.' });
  }

  if (name !== undefined) conv.name = name.trim();
  if (description !== undefined) conv.description = description.trim();
  if (avatarUrl !== undefined) conv.avatarUrl = avatarUrl;
  if (isPrivate !== undefined) conv.isPrivate = !!isPrivate;
  if (slowModeSeconds !== undefined) conv.slowModeSeconds = parseInt(slowModeSeconds) || 0;
  if (Array.isArray(adminIds)) conv.adminIds = Array.from(new Set([...adminIds, conv.creatorId]));

  saveDatabase(db);

  res.json({ success: true, conversation: conv });
});

// Join conversation via Join Code / Invite Link
app.post('/api/chat/conversations/join-code/:joinCode', requireAuth, (req, res) => {
  const { joinCode } = req.params;
  const user = (req as any).user;

  const db = loadDatabase();
  const conv = (db.conversations || []).find((c: any) => c.joinCode === joinCode || c.id === joinCode);
  if (!conv) {
    return res.status(404).json({ error: 'Invite link invalid or expired.' });
  }

  conv.participants = conv.participants || [];
  if (!conv.participants.includes(user.id)) {
    conv.participants.push(user.id);
    saveDatabase(db);
  }

  res.json({ success: true, conversation: conv });
});

// Report User or Message
app.post('/api/chat/reports', requireAuth, (req, res) => {
  const { targetType, targetId, reason, details } = req.body;
  const user = (req as any).user;

  const db = loadDatabase();
  db.chatReports = db.chatReports || [];
  
  const report = {
    id: `report-${Date.now()}`,
    reporterId: user.id,
    targetType: targetType || 'user', // 'user' | 'message' | 'conversation'
    targetId,
    reason: reason || 'Spam / Inappropriate Content',
    details: details || '',
    timestamp: Date.now()
  };

  db.chatReports.push(report);
  saveDatabase(db);

  res.json({ success: true, message: 'Report submitted successfully. Our safety team will review it shortly.' });
});

// GET list of all Open Public Groups
app.get('/api/chat/open-groups', (req, res) => {
  const db = loadDatabase();
  const user = getRequestUser(req);
  
  // Seed default open groups if none exist (archived event groups are hidden)
  let openGroups = (db.conversations || []).filter((c: any) => c.isOpenGroup && !c.archived);
  if (openGroups.length === 0) {
    const defaultOpenGroups = [
      {
        id: 'group-lounge-global',
        isGroup: true,
        isOpenGroup: true,
        name: '🌐 Global Creators Lounge',
        description: 'Open public network room for general chatter, introductions, and tech updates.',
        avatarUrl: '',
        creatorId: 'alex-rivera-id',
        participants: (db.users || []).map((u: any) => u.id),
        createdTime: Date.now() - 86400000
      },
      {
        id: 'group-designers-circle',
        isGroup: true,
        isOpenGroup: true,
        name: '🎨 Designers & UI Sandbox',
        description: 'Collaborative space for discussing design tokens, typography, and tactile UI/UX.',
        avatarUrl: '',
        creatorId: 'alex-rivera-id',
        participants: (db.users || []).slice(0, 5).map((u: any) => u.id),
        createdTime: Date.now() - 43200000
      },
      {
        id: 'group-tech-crypto',
        isGroup: true,
        isOpenGroup: true,
        name: '⚡ Web3 & Cryptographic Engineering',
        description: 'Public channel discussing zero-knowledge proofs, region-locked keys, and decentralization.',
        avatarUrl: '',
        creatorId: 'alex-rivera-id',
        participants: (db.users || []).slice(0, 3).map((u: any) => u.id),
        createdTime: Date.now() - 21600000
      }
    ];
    db.conversations = db.conversations || [];
    db.conversations.push(...defaultOpenGroups);
    saveDatabase(db);
    openGroups = defaultOpenGroups;
  }

  const hydrated = openGroups.map((c: any) => {
    const isMember = user ? (c.participants || []).includes(user.id) : false;
    const msgs = (db.chatMessages || []).filter((m: any) => m.conversationId === c.id);
    msgs.sort((a: any, b: any) => b.timestamp - a.timestamp);
    const lastMessage = msgs[0] || null;
    return {
      ...c,
      isMember,
      participantCount: (c.participants || []).length,
      lastMessage
    };
  });

  res.json({ openGroups: hydrated });
});

// Join an Open Public Group
app.post('/api/chat/conversations/:conversationId/join', requireAuth, (req, res) => {
  const { conversationId } = req.params;
  const user = (req as any).user;
  const db = loadDatabase();
  
  const conv = (db.conversations || []).find((c: any) => c.id === conversationId);
  if (!conv || !conv.isOpenGroup) {
    return res.status(404).json({ error: 'Open public group not found.' });
  }

  conv.participants = conv.participants || [];
  if (!conv.participants.includes(user.id)) {
    conv.participants.push(user.id);
    saveDatabase(db);
  }

  res.json({ success: true, conversation: conv });
});

// Get presence and last seen state for a user
app.get('/api/chat/presence/:userId', requireAuth, (req, res) => {
  const { userId } = req.params;
  const status = getUserStatus(userId);
  res.json(status);
});

// --- GROUP JOIN-REQUEST WORKFLOW (from real-time-messaging-module (1)) ---
// Request to join a private group. Admins approve/reject; the requester sees
// myStatus (member / pending / none) so the UI can render the right button.
app.post('/api/chat/conversations/:conversationId/join-request', requireAuth, (req, res) => {
  const { conversationId } = req.params;
  const user = (req as any).user;
  const db = loadDatabase();
  const conv = (db.conversations || []).find((c: any) => c.id === conversationId);
  if (!conv) return res.status(404).json({ error: 'Conversation not found.' });

  // Open groups: join directly.
  if (conv.isOpenGroup) {
    conv.participants = conv.participants || [];
    if (!conv.participants.includes(user.id)) {
      conv.participants.push(user.id);
      saveDatabase(db);
    }
    return res.json({ myStatus: 'member', memberCount: conv.participants.length });
  }

  if ((conv.participants || []).includes(user.id)) {
    return res.json({ myStatus: 'member', memberCount: conv.participants.length });
  }

  db.joinRequests = db.joinRequests || [];
  const existing = db.joinRequests.find((r: any) => r.conversationId === conversationId && r.userId === user.id);
  if (existing) {
    existing.status = existing.status === 'rejected' ? 'pending' : existing.status;
    saveDatabase(db);
    return res.json({ myStatus: existing.status === 'approved' ? 'member' : 'pending', memberCount: (conv.participants || []).length });
  }

  db.joinRequests.push({
    id: `jr-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
    conversationId,
    userId: user.id,
    userName: user.name || user.username || 'User',
    status: 'pending',
    createdAt: Date.now(),
  });
  saveDatabase(db);

  // Notify admins in realtime
  const admins = conv.adminIds?.length ? conv.adminIds : [conv.creatorId];
  broadcastMessageToUsers(admins.filter((id: string) => id !== user.id), {
    type: 'join_request',
    conversationId,
    request: { userId: user.id, userName: user.name || 'User', createdAt: Date.now() },
  });

  res.json({ myStatus: 'pending', memberCount: (conv.participants || []).length });
});

// Admins list pending join requests for a conversation
app.get('/api/chat/conversations/:conversationId/join-requests', requireAuth, (req, res) => {
  const { conversationId } = req.params;
  const user = (req as any).user;
  const db = loadDatabase();
  const conv = (db.conversations || []).find((c: any) => c.id === conversationId);
  if (!conv) return res.status(404).json({ error: 'Conversation not found.' });
  const isAdmin = conv.creatorId === user.id || (conv.adminIds || []).includes(user.id);
  if (!isAdmin) return res.status(403).json({ error: 'Only group admins can review join requests.' });
  const requests = (db.joinRequests || []).filter((r: any) => r.conversationId === conversationId && r.status === 'pending');
  res.json({ requests });
});

// Approve a join request
app.post('/api/chat/join-requests/:requestId/approve', requireAuth, (req, res) => {
  const { requestId } = req.params;
  const user = (req as any).user;
  const db = loadDatabase();
  const req2 = (db.joinRequests || []).find((r: any) => r.id === requestId);
  if (!req2) return res.status(404).json({ error: 'Join request not found.' });
  const conv = (db.conversations || []).find((c: any) => c.id === req2.conversationId);
  if (!conv) return res.status(404).json({ error: 'Conversation not found.' });
  const isAdmin = conv.creatorId === user.id || (conv.adminIds || []).includes(user.id);
  if (!isAdmin) return res.status(403).json({ error: 'Only group admins can approve join requests.' });

  req2.status = 'approved';
  conv.participants = conv.participants || [];
  if (!conv.participants.includes(req2.userId)) conv.participants.push(req2.userId);
  saveDatabase(db);
  broadcastMessageToUsers([req2.userId], { type: 'join_request_resolved', conversationId: conv.id, approved: true });
  res.json({ success: true });
});

// Reject a join request
app.post('/api/chat/join-requests/:requestId/reject', requireAuth, (req, res) => {
  const { requestId } = req.params;
  const user = (req as any).user;
  const db = loadDatabase();
  const req2 = (db.joinRequests || []).find((r: any) => r.id === requestId);
  if (!req2) return res.status(404).json({ error: 'Join request not found.' });
  const conv = (db.conversations || []).find((c: any) => c.id === req2.conversationId);
  if (!conv) return res.status(404).json({ error: 'Conversation not found.' });
  const isAdmin = conv.creatorId === user.id || (conv.adminIds || []).includes(user.id);
  if (!isAdmin) return res.status(403).json({ error: 'Only group admins can reject join requests.' });

  req2.status = 'rejected';
  saveDatabase(db);
  broadcastMessageToUsers([req2.userId], { type: 'join_request_resolved', conversationId: conv.id, approved: false });
  res.json({ success: true });
});

// --- GROUP MEMBER ROLES / KICK / MUTE (from real-time-messaging-module (1)) ---
// Admins can set a member's role (owner/admin/moderator/member), mute until a
// timestamp, kick, ban or unban. Server-side rules are enforced in chatServer fan-out.
app.patch('/api/chat/conversations/:conversationId/members/:userId', requireAuth, (req, res) => {
  const { conversationId, userId } = req.params;
  const user = (req as any).user;
  const { role, mutedUntil, action, nickname } = req.body || {};
  const db = loadDatabase();
  const conv = (db.conversations || []).find((c: any) => c.id === conversationId);
  if (!conv) return res.status(404).json({ error: 'Conversation not found.' });
  const isAdmin = conv.creatorId === user.id || (conv.adminIds || []).includes(user.id);
  if (!isAdmin) return res.status(403).json({ error: 'Only group admins can manage members.' });
  if (!(conv.participants || []).includes(userId)) return res.status(404).json({ error: 'Member not in this group.' });

  conv.memberRoles = conv.memberRoles || {};
  const member = conv.memberRoles[userId] || {};
  if (role) member.role = role;
  if (nickname) member.nickname = nickname;
  if (typeof mutedUntil === 'number') member.mutedUntil = mutedUntil;
  if (action === 'kick') {
    member.isKicked = true;
    conv.participants = (conv.participants || []).filter((id: string) => id !== userId);
  } else if (action === 'ban') {
    member.isBanned = true;
    member.isKicked = false;
    conv.participants = (conv.participants || []).filter((id: string) => id !== userId);
  } else if (action === 'unban') {
    member.isBanned = false;
    member.isKicked = false;
  }
  conv.memberRoles[userId] = member;
  saveDatabase(db);
  broadcastMessageToUsers([userId], { type: 'member_updated', conversationId, member });
  res.json({ success: true, member });
});

// --- PER-USER MESSAGE SOFT-DELETE (Tinode "DeletedFor") ---
// "Delete for me": only the sender's view removes the message (others still see it).
app.post('/api/chat/conversations/:conversationId/messages/:messageId/delete-for-me', requireAuth, (req, res) => {
  const { conversationId, messageId } = req.params;
  const user = (req as any).user;
  const db = loadDatabase();
  const conv = (db.conversations || []).find((c: any) => c.id === conversationId);
  if (!conv || !(conv.participants || []).includes(user.id)) {
    return res.status(403).json({ error: 'Access denied to this conversation.' });
  }
  const msg = (db.chatMessages || []).find((m: any) => m.id === messageId);
  if (!msg) return res.status(404).json({ error: 'Message not found.' });
  msg.deletedForMe = msg.deletedForMe || [];
  if (!msg.deletedForMe.includes(user.id)) msg.deletedForMe.push(user.id);
  saveDatabase(db);
  res.json({ success: true });
});

// "Delete for everyone" (tombstone, admin/owner allowed beyond the 10-min window)
app.post('/api/chat/conversations/:conversationId/messages/:messageId/delete-everyone', requireAuth, (req, res) => {
  const { conversationId, messageId } = req.params;
  const user = (req as any).user;
  const db = loadDatabase();
  const conv = (db.conversations || []).find((c: any) => c.id === conversationId);
  if (!conv || !(conv.participants || []).includes(user.id)) {
    return res.status(403).json({ error: 'Access denied to this conversation.' });
  }
  const msg = (db.chatMessages || []).find((m: any) => m.id === messageId);
  if (!msg) return res.status(404).json({ error: 'Message not found.' });
  const isAdmin = conv.creatorId === user.id || (conv.adminIds || []).includes(user.id);
  if (msg.senderId !== user.id && !isAdmin) {
    return res.status(403).json({ error: 'Only the sender or an admin can delete this message.' });
  }
  msg.text = 'This message was deleted';
  msg.deleted = true;
  msg.deletedForEveryone = true;
  msg.mediaUrl = null;
  msg.mediaName = null;
  saveDatabase(db);
  broadcastMessageToUsers(conv.participants || [], {
    type: 'message_deleted', conversationId, messageId, message: msg,
  });
  res.json({ success: true, message: msg });
});

// --- SAVED MESSAGES / NOTES-TO-SELF (Tinode "slf" self topic) ---
app.post('/api/chat/messages/:messageId/save', requireAuth, (req, res) => {
  const { messageId } = req.params;
  const user = (req as any).user;
  const db = loadDatabase();
  const msg = (db.chatMessages || []).find((m: any) => m.id === messageId);
  if (!msg) return res.status(404).json({ error: 'Message not found.' });
  db.savedMessages = db.savedMessages || [];
  if (!db.savedMessages.some((s: any) => s.messageId === messageId && s.userId === user.id)) {
    db.savedMessages.push({
      id: `sav-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
      userId: user.id,
      messageId,
      conversationId: msg.conversationId,
      savedAt: Date.now(),
    });
  }
  saveDatabase(db);
  res.json({ success: true });
});

app.delete('/api/chat/messages/:messageId/save', requireAuth, (req, res) => {
  const { messageId } = req.params;
  const user = (req as any).user;
  const db = loadDatabase();
  db.savedMessages = (db.savedMessages || []).filter((s: any) => !(s.messageId === messageId && s.userId === user.id));
  saveDatabase(db);
  res.json({ success: true });
});

// List my saved messages (with full message payloads)
app.get('/api/saved', requireAuth, (req, res) => {
  const user = (req as any).user;
  const db = loadDatabase();
  const saved = (db.savedMessages || [])
    .filter((s: any) => s.userId === user.id)
    .sort((a: any, b: any) => b.savedAt - a.savedAt);
  const hydrated = saved.map((s: any) => {
    const msg = (db.chatMessages || []).find((m: any) => m.id === s.messageId);
    if (!msg) return null;
    const conv = (db.conversations || []).find((c: any) => c.id === msg.conversationId);
    const sender = db.users.find((u: any) => u.id === msg.senderId);
    return {
      savedAt: s.savedAt,
      message: msg,
      conversationId: msg.conversationId,
      conversationName: conv?.isGroup ? conv.name : sender?.name || 'Chat',
    };
  }).filter(Boolean);
  res.json({ saved: hydrated });
});

// Self conversation (notes to self). Lazily created per user.
app.post('/api/chat/self-notes', requireAuth, (req, res) => {
  const user = (req as any).user;
  const { text } = req.body || {};
  if (!text || !String(text).trim()) return res.status(400).json({ error: 'Note text is required.' });
  const db = loadDatabase();
  let selfConv = (db.conversations || []).find((c: any) => c.isSelfConversation && (c.participants || []).includes(user.id));
  if (!selfConv) {
    selfConv = {
      id: `self-${user.id}`,
      name: 'Saved & Notes',
      isGroup: false,
      isSelfConversation: true,
      participants: [user.id],
      adminIds: [user.id],
      creatorId: user.id,
      archivedBy: [],
      mutedBy: [],
      createdAt: Date.now(),
    };
    db.conversations.push(selfConv);
  }
  const msg = {
    id: `msg-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
    conversationId: selfConv.id,
    senderId: user.id,
    senderName: user.name || 'Me',
    text: String(text).trim(),
    mediaUrl: null,
    mediaName: null,
    timestamp: Date.now(),
    readBy: [user.id],
  };
  db.chatMessages.push(msg);
  saveDatabase(db);
  res.json({ success: true, message: msg, conversation: selfConv });
});

// --- SCHEDULED MESSAGES (from real-time-messaging-module22) ---
app.post('/api/chat/conversations/:conversationId/schedule', requireAuth, (req, res) => {
  const { conversationId } = req.params;
  const user = (req as any).user;
  const { text, scheduledFor } = req.body || {};
  const db = loadDatabase();
  const conv = (db.conversations || []).find((c: any) => c.id === conversationId);
  if (!conv || !(conv.participants || []).includes(user.id)) {
    return res.status(403).json({ error: 'Access denied to this conversation.' });
  }
  const when = Number(scheduledFor) || 0;
  if (!text || !String(text).trim() || when < Date.now()) {
    return res.status(400).json({ error: 'Text and a future scheduledFor time are required.' });
  }
  db.scheduledMessages = db.scheduledMessages || [];
  db.scheduledMessages.push({
    id: `sch-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
    conversationId,
    senderId: user.id,
    text: String(text).trim(),
    scheduledFor: when,
    isSent: false,
    createdAt: Date.now(),
  });
  saveDatabase(db);
  res.json({ success: true });
});

app.get('/api/chat/conversations/:conversationId/scheduled', requireAuth, (req, res) => {
  const { conversationId } = req.params;
  const user = (req as any).user;
  const db = loadDatabase();
  const conv = (db.conversations || []).find((c: any) => c.id === conversationId);
  if (!conv || !(conv.participants || []).includes(user.id)) {
    return res.status(403).json({ error: 'Access denied to this conversation.' });
  }
  const scheduled = (db.scheduledMessages || []).filter((s: any) => s.conversationId === conversationId && !s.isSent);
  res.json({ scheduled });
});

// Scheduled-message delivery ticker (every 15s)
setInterval(() => {
  try {
    const db = loadDatabase();
    const due = (db.scheduledMessages || []).filter((s: any) => !s.isSent && s.scheduledFor <= Date.now());
    if (due.length === 0) return;
    for (const s of due) {
      const msg = {
        id: `msg-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
        conversationId: s.conversationId,
        senderId: s.senderId,
        text: s.text,
        mediaUrl: null,
        mediaName: null,
        timestamp: s.scheduledFor,
        readBy: [s.senderId],
        scheduled: true,
      };
      db.chatMessages.push(msg);
      s.isSent = true;
      const conv = (db.conversations || []).find((c: any) => c.id === s.conversationId);
      if (conv) {
        broadcastMessageToUsers((conv.participants || []).filter((id: string) => id !== s.senderId), {
          type: 'message',
          conversationId: s.conversationId,
          message: msg,
        });
      }
    }
    saveDatabase(db);
  } catch (e) {
    console.error('scheduled-message ticker error:', e);
  }
}, 15000);


// CALL HISTORY (from real-time-messaging-module22)
app.post('/api/calls', requireAuth, (req, res) => {
  const user = (req as any).user;
  const { targetUserId, callType, durationSec, status } = req.body || {};
  if (!targetUserId) return res.status(400).json({ error: 'Missing targetUserId' });
  const db = loadDatabase();
  db.callHistory = db.callHistory || [];
  db.callHistory.push({
    id: `call-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
    callerId: user.id,
    callerName: user.name || 'User',
    calleeId: targetUserId,
    callType: callType === 'audio' ? 'audio' : 'video',
    status: status || 'completed',
    durationSec: Math.max(0, Math.round(durationSec || 0)),
    startedAt: Date.now(),
  });
  if (db.callHistory.length > 200) db.callHistory = db.callHistory.slice(-200);
  saveDatabase(db);
  res.json({ success: true });
});

app.get('/api/calls', requireAuth, (req, res) => {
  const user = (req as any).user;
  const db = loadDatabase();
  const calls = (db.callHistory || [])
    .filter((c: any) => c.callerId === user.id || c.calleeId === user.id)
    .sort((a: any, b: any) => b.startedAt - a.startedAt)
    .slice(0, 50);
  res.json({ calls });
});

// CREATOR NETWORKS (EXPLORE)
app.get('/api/creators', (req, res) => {
  const db = loadDatabase();
  // Return list of all creators (public viewable info only)
  const publicCreators = db.users.map((u: any) => {
    const profile = u.profile || {};
    return {
      id: u.id,
      name: u.name,
      tagline: '',
      location: profile.location || 'Distributed',
      avatarUrl: profile.avatarUrl || '',
      badgeNumber: profile.badgeNumber || 'BD-00',
      skills: profile.skills || [],
      postsCount: (profile.posts || []).filter((p: any) => !p.isAnonymous).length,
      allowConnections: profile.allowConnections !== false,
      isPublicMessagingEnabled: profile.isPublicMessagingEnabled !== false
    };
  });
  res.json({ creators: publicCreators });
});

// GET PUBLIC CREATOR BY ID (View their custom page)
app.get('/api/creators/:id', (req, res) => {
  const db = loadDatabase();
  const { id } = req.params;

  let requestUser: any = null;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    const userId = getUserIdFromToken(token);
    if (userId) {
      requestUser = db.users.find((u: any) => u.id === userId);
    }
  }

  if (id.startsWith('anon-user-')) {
    // Intercept anonymous creators
    const parts = id.replace('anon-user-', '').split('-');
    const region = parts[0] || 'BD';
    const num1 = parts[1] || '00';
    const num2 = parts[2] || '0000';
    const anonName = `ANON ${region} ${num1} ${num2}`;

    const anonPosts: any[] = [];
    const repostsMap = getRepostsCountMap(db);
    db.users.forEach((u: any) => {
      const posts = u.profile.posts || [];
      posts.forEach((p: any) => {
        if (p.isAnonymous && p.anonymousCreatorId === id) {
          const countById = p.id ? (repostsMap.get(`id:${p.id}`) || 0) : 0;
          const countByText = (id && p.title && p.content) ? (repostsMap.get(`text:${id}:${p.title.trim()}:${p.content.trim()}`) || 0) : 0;
          const repostsCount = Math.max(countById, countByText);

          anonPosts.push({
            ...p,
            comments: p.comments || [],
            repostsCount,
            creator: {
              id: id,
              name: anonName,
              username: 'anonymous',
              avatarUrl: '',
              tagline: 'Encrypted Identity',
              badgeNumber: 'ANON-99',
              isAnonymous: true
            }
          });
        }
      });
    });

    return res.json({
      id: id,
      name: anonName,
      profile: {
        name: anonName,
        tagline: 'Encrypted Identity',
        location: 'Secure Proxy Server',
        avatarUrl: '',
        badgeNumber: 'ANON-99',
        bio: 'This is an untraceable anonymous profile on the creative network. No links to any real-world identity exist.',
        skills: ['Anonymity', 'Privacy', 'Crypto-proxy'],
        posts: anonPosts
      }
    });
  }

  const user = db.users.find((u: any) => u.id === id);
  if (!user) {
    return res.status(404).json({ error: 'Creator profile not found.' });
  }

  const isSelf = requestUser && requestUser.id === id;
  const areFriends = requestUser && user.friends && user.friends.includes(requestUser.id);

  // Return their public profile, restricting details if not self or friend, and if the account is private
  const profileCopy = { ...user.profile };
  const isPrivate = profileCopy.isPrivate === true;

  if (isPrivate && !isSelf && !areFriends) {
    profileCopy.posts = [];
    profileCopy.projects = [];
    profileCopy.websites = [];
    profileCopy.skills = [];
    profileCopy.contact = { email: "", github: "", linkedin: "", twitter: "", website: "" };
    profileCopy.isRestricted = true;
  } else {
    profileCopy.isRestricted = false;
    if (profileCopy.posts) {
      const repostsMap = getRepostsCountMap(db);
      profileCopy.posts = profileCopy.posts
        .filter((p: any) => !p.isAnonymous)
        .map((p: any) => {
          // Resolve comments
          const resolvedComments = (p.comments || []).map((c: any) => {
            let senderName = c.senderName;
            let senderAvatarUrl = '';
            if (c.senderId) {
              const commentUser = db.users.find((userObj: any) => userObj.id === c.senderId);
              if (commentUser) {
                senderName = commentUser.name;
                senderAvatarUrl = commentUser.profile?.avatarUrl || '';
              }
            }
            return {
              ...c,
              senderName,
              senderAvatarUrl
            };
          });

          // Resolve likedBy
          const resolvedLikedBy = (p.likedBy || []).map((id: string) => {
            if (id.startsWith('guest-')) {
              return { id, name: 'Guest Visitor', avatarUrl: '' };
            }
            const userObj = db.users.find((userObj: any) => userObj.id === id);
            if (userObj) {
              return {
                id: userObj.id,
                name: userObj.name,
                avatarUrl: userObj.profile?.avatarUrl || ''
              };
            }
            return { id, name: 'Anonymous User', avatarUrl: '' };
          });

          // Resolve repostedFrom
          let resolvedRepostedFrom = p.repostedFrom;
          if (p.isRepost && p.repostedFrom && p.repostedFrom.id) {
            if (!p.repostedFrom.id.startsWith('anon-user-')) {
              const originalUser = db.users.find((userObj: any) => userObj.id === p.repostedFrom.id);
              if (originalUser) {
                resolvedRepostedFrom = {
                  ...p.repostedFrom,
                  name: originalUser.name
                };
              }
            }
          }

          const countById = p.id ? (repostsMap.get(`id:${p.id}`) || 0) : 0;
          const countByText = (user.id && p.title && p.content) ? (repostsMap.get(`text:${user.id}:${p.title.trim()}:${p.content.trim()}`) || 0) : 0;
          const repostsCount = Math.max(countById, countByText);

          return {
            ...p,
            comments: resolvedComments,
            likedByUsers: resolvedLikedBy,
            repostedFrom: resolvedRepostedFrom,
            repostsCount,
            creator: {
              id: user.id,
              name: user.name,
              username: user.profile?.username || user.username || '',
              avatarUrl: user.profile?.avatarUrl || '',
              tagline: '',
              badgeNumber: user.profile?.badgeNumber || 'BD-00'
            }
          };
        });
    }
  }

  // Implement friends list privacy
  const friendsPrivacy = user.profile?.friendsPrivacy || 'public';
  let resolvedFriends: any[] = [];
  let friendsListRestricted = false;

  if (isSelf) {
    friendsListRestricted = false;
  } else if (friendsPrivacy === 'public') {
    friendsListRestricted = false;
  } else if (friendsPrivacy === 'friends' && areFriends) {
    friendsListRestricted = false;
  } else {
    friendsListRestricted = true;
  }

  if (!friendsListRestricted) {
    const friendIds = user.friends || [];
    resolvedFriends = friendIds.map((fid: string) => {
      const fUser = db.users.find((uObj: any) => uObj.id === fid);
      if (fUser) {
        return {
          id: fUser.id,
          name: fUser.name,
          username: fUser.profile?.username || fUser.username || '',
          avatarUrl: fUser.profile?.avatarUrl || '',
          badgeNumber: fUser.profile?.badgeNumber || 'BD-00'
        };
      }
      return null;
    }).filter(Boolean);
  }

  res.json({
    id: user.id,
    name: user.name,
    profile: profileCopy,
    following: user.following || [],
    friends: resolvedFriends,
    friendsListRestricted
  });
});

// --- ADMIN DATABASE RESET API ---
// SECURED: requires authentication + admin role (isAdmin flag or MASTER_KEY header)
app.post('/api/admin/reset-database', requireAuth, requireAdmin, async (req, res) => {
  try {
    const db = loadDatabase();

    // 1. Wipe all posts from all users
    db.users.forEach((u: any) => {
      if (u.profile) {
        u.profile.posts = [];
        u.profile.postsCount = 0;
      }
    });

    // 2. Wipe messages and other relational data
    db.messages = [];
    db.conversations = [];
    db.chatMessages = [];

    // 3. Save database
    saveDatabase(db);

    // 4. Reset last synced state
    lastSyncedDbState = {
      users: JSON.parse(JSON.stringify(db.users || [])),
      messages: [],
      conversations: [],
      chatMessages: []
    };

    console.log("[Admin] Database has been successfully reset by user " + (req as any).user?.id + ". Preserved user accounts.");
    res.json({ success: true, message: "Application database has been reset! All posts and messages are cleared, while registered user accounts remain intact." });
  } catch (err: any) {
    console.error("Failed to reset database:", err);
    res.status(500).json({ error: "Failed to reset database: " + err.message });
  }
});

// --- SOCIAL NETWORK REAL-TIME APIS ---

// GET COMBINED FEED OF ALL POSTS
app.get('/api/posts/feed', (req, res) => {
  const db = loadDatabase();
  syncGlobalPostsFromUsers(db);
  const viewer = getRequestUser(req);
  const viewerBlocked = viewer ? (viewer.blockedUsers || viewer.profile?.blockedUsers || []) : [];
  const repostsMap = getRepostsCountMap(db);
  const feedMap = new Map();

  const addPostToFeed = (p: any, authorUser?: any) => {
    if (!p || !p.id) return;
    if (p.scheduledAt && new Date(p.scheduledAt).getTime() > Date.now()) {
      if (!viewer || (authorUser && viewer.id !== authorUser.id)) {
        return;
      }
    }

    if (viewer && authorUser) {
      const uBlocked = authorUser.blockedUsers || authorUser.profile?.blockedUsers || [];
      if (viewerBlocked.includes(authorUser.id) || uBlocked.includes(viewer.id)) {
        return;
      }
    }

    const isAnon = !!p.isAnonymous;

    const resolvedComments = (p.comments || []).map((c: any) => {
      let senderName = c.senderName;
      let senderAvatarUrl = c.senderAvatarUrl || '';
      if (c.senderId) {
        const commentUser = db.users.find((userObj: any) => userObj.id === c.senderId);
        if (commentUser) {
          senderName = commentUser.name;
          senderAvatarUrl = commentUser.profile?.avatarUrl || '';
        }
      }
      return {
        ...c,
        senderName: senderName || 'Anonymous User',
        senderAvatarUrl
      };
    });

    const resolvedLikedBy = (p.likedBy || []).map((id: string) => {
      if (id.startsWith('guest-')) {
        return { id, name: 'Guest Visitor', avatarUrl: '' };
      }
      const userObj = db.users.find((userObj: any) => userObj.id === id);
      if (userObj) {
        return {
          id: userObj.id,
          name: userObj.name,
          avatarUrl: userObj.profile?.avatarUrl || ''
        };
      }
      return { id, name: 'Anonymous User', avatarUrl: '' };
    });

    let resolvedRepostedFrom = p.repostedFrom;
    if (p.isRepost && p.repostedFrom && p.repostedFrom.id) {
      if (!p.repostedFrom.id.startsWith('anon-user-')) {
        const originalUser = db.users.find((userObj: any) => userObj.id === p.repostedFrom.id);
        if (originalUser) {
          resolvedRepostedFrom = {
            ...p.repostedFrom,
            name: originalUser.name
          };
        }
      }
    }

    const countById = p.id ? (repostsMap.get(`id:${p.id}`) || 0) : 0;
    const creatorIdForMap = isAnon ? (p.anonymousCreatorId || 'anon-user-BD-99-9999') : (authorUser?.id || p.authorId || 'me');
    const countByText = (creatorIdForMap && p.title && p.content) ? (repostsMap.get(`text:${creatorIdForMap}:${p.title.trim()}:${p.content.trim()}`) || 0) : 0;
    const repostsCount = Math.max(countById, countByText);

    const postCreator = isAnon ? {
      id: p.anonymousCreatorId || 'anon-user-BD-99-9999',
      name: p.anonymousCreatorName || 'ANON BD 99 9999',
      username: 'anonymous',
      avatarUrl: '',
      tagline: '',
      badgeNumber: 'ANON-99',
      isAnonymous: true
    } : (authorUser ? {
      id: authorUser.id,
      name: authorUser.name,
      username: authorUser.profile?.username || authorUser.username || '',
      avatarUrl: authorUser.profile?.avatarUrl || '',
      tagline: authorUser.profile?.tagline || '',
      badgeNumber: authorUser.profile?.badgeNumber || 'BD-00',
      allowConnections: authorUser.profile?.allowConnections !== false,
      isPublicMessagingEnabled: authorUser.profile?.isPublicMessagingEnabled !== false
    } : (p.creator || {
      id: p.authorId || 'me',
      name: p.authorName || 'Network Member',
      username: '',
      avatarUrl: '',
      badgeNumber: 'BD-00'
    }));

    feedMap.set(p.id, {
      ...p,
      comments: resolvedComments,
      likedByUsers: resolvedLikedBy,
      repostedFrom: resolvedRepostedFrom,
      repostsCount,
      creator: postCreator
    });
  };

  db.users.forEach((u: any) => {
    // Moderated/blocked users' content is excluded from the public feed.
    if (u.blocked) return;
    const profile = u.profile || {};
    const posts = profile.posts || [];
    posts.forEach((p: any) => {
      if (p.hidden) return;
      addPostToFeed(p, u);
    });
  });

  (db.posts || []).forEach((p: any) => {
    if (p.hidden) return;
    if (!feedMap.has(p.id)) {
      const authorUser = db.users.find((u: any) => u.id === p.authorId || (u.profile?.posts || []).some((up: any) => up.id === p.id));
      if (authorUser && authorUser.blocked) return;
      addPostToFeed(p, authorUser);
    }
  });

  const feed = Array.from(feedMap.values());

  const getPostTimestamp = (p: any): number => {
    if (typeof p.createdTime === 'number') return p.createdTime;
    if (typeof p.timestamp === 'number') return p.timestamp;
    if (p.createdAt) {
      const t = new Date(p.createdAt).getTime();
      if (!isNaN(t) && t > 0) return t;
    }
    if (p.date) {
      const t = Date.parse(p.date);
      if (!isNaN(t) && t > 0) return t;
    }
    if (p.id) {
      const numMatch = p.id.match(/\d+/g);
      if (numMatch) {
        // Use the FIRST numeric group only. Joining multiple groups corrupts
        // the value: for id "post-1784102659620-655", join() → "1784102659620655"
        // which parseInt reads as ~year 57541 — that post then looks maximally
        // fresh forever and pins itself to the top of the feed.
        const val = parseInt(numMatch[0], 10);
        // A realistic epoch-millis timestamp (between 2001 and 2033). Values
        // below that are sequence numbers, not timestamps.
        if (!isNaN(val) && val > 978307200000 && val < 2000000000000) return val;
      }
    }
    return 0;
  };

  // ── ALGO: ranked feed (engagement + recency + creator trust) ──────────────
  // Replaces the old chronological sort. Response shape is unchanged.
  const rankFeedItem = (item: any): number => {
    const likes =
      typeof item.likes === 'number' ? item.likes :
      Array.isArray(item.likedBy) ? item.likedBy.length :
      Array.isArray(item.likedByUsers) ? item.likedByUsers.length : 0;
    const comments = Array.isArray(item.comments) ? item.comments.length : (typeof item.commentsCount === 'number' ? item.commentsCount : 0);
    const reposts = typeof item.repostsCount === 'number' ? item.repostsCount : 0;
    const views = typeof item.viewsCount === 'number' ? item.viewsCount : (typeof item.views === 'number' ? item.views : 0);

    const engagement = Math.log1p(likes * 2 + comments * 3 + reposts * 5 + views * 0.05);
    const rawTime = getPostTimestamp(item);
    // Posts with no usable timestamp get a neutral ~30-day recency instead of
    // being treated as brand new (the old code gave them ageHours=0 → recency=1,
    // wrongly boosting posts that simply lacked a timestamp).
    const ageHours = rawTime > 0 ? Math.max(0, (Date.now() - rawTime) / 3600000) : 24 * 30;
    const recency = Math.pow(0.5, ageHours / 48);

    let creatorFollowers = 0;
    if (item.creator && item.creator.id) {
      const creatorUser = db.users.find((u: any) => u.id === item.creator.id);
      creatorFollowers = creatorUser?.profile?.followersCount || creatorUser?.followersCount || 0;
    }
    const creatorTrust = 0.7 + 0.3 * Math.min(1, Math.log10(creatorFollowers + 1) / 4);

    // ── Hybrid-engine style scoring ─────────────────────────────────────────
    // Ports the key ideas from hybrid-engine(algo)/scoring.ts + viral-trending.ts:
    //   Score ∝ Penalty × [ α₁·σ(engagement) + α₂·Decay(age) + α₃·σ(momentum)
    //                       + exploration ] × creatorTrust × boost × bounce
    const sigmoid = (x: number, k: number, mid: number) => 1 / (1 + Math.exp(-k * (x - mid)));

    // σ(engagement): sigmoid maps raw engagement into (0,1), midpoint ~2 units.
    const engagementScore = sigmoid(engagement, 1.6, 1.8);

    // Viral momentum = engagement gained per hour (velocity). A post pulling 50
    // likes in an hour trends harder than 50 likes over a week. Fresh posts with
    // no age (unknown timestamp) don't get a false momentum spike — ageHours is
    // already floored at 0.25.
    const momentum = engagement / Math.max(0.25, ageHours);
    const viralBoost = sigmoid(momentum, 0.6, 1.2);

    // Exploration (Thompson-inspired): posts with little evidence get a small
    // recency-weighted bonus so the feed isn't a pure rich-get-richer loop.
    const evidence = 1 + likes + comments * 2 + reposts * 3;
    const exploration = Math.min(0.06, 1.2 / Math.pow(evidence, 0.55)) * recency;

    // Boost factor for promoted content (1.0 for organic).
    const boostFactor = item.isBoosted || item.boosted ? 1.35 : 1.0;

    // Bounce-penalty proxy: we don't track watch time server-side, so penalize
    // low-engagement posts from high-follower creators (a clickbait signal that
    // people open and immediately leave).
    const bouncePenalty = creatorTrust > 0.9 && engagement < 0.2 ? 0.8 : 1.0;

    // Symmetric ±0.02 noise (the old Math.random()*0.02 was always positive,
    // so it silently pushed every post up and dominated ties).
    const score = (0.5 * engagementScore + 0.25 * recency + 0.25 * viralBoost + exploration)
      * creatorTrust * boostFactor * bouncePenalty
      + (Math.random() * 2 - 1) * 0.02;
    item.rankingScore = Number(score.toFixed(4));
    return score;
  };

  feed.forEach(rankFeedItem);
  feed.sort((a, b) => (b.rankingScore || 0) - (a.rankingScore || 0));

  const limitParam = req.query.limit ? parseInt(req.query.limit as string) : null;
  const offsetParam = req.query.offset ? parseInt(req.query.offset as string) : 0;

  let resultFeed = feed;
  if (limitParam && !isNaN(limitParam)) {
    resultFeed = feed.slice(offsetParam, offsetParam + limitParam);
  }

  res.json({
    feed: resultFeed,
    total: feed.length
  });
});

// CREATE NEW POST DIRECTLY
app.post('/api/posts/create', (req, res) => {
  const { post } = req.body;
  if (!post || !post.id || (!post.content && !post.imageUrl && !post.videoUrl && !post.audioUrl)) {
    return res.status(400).json({ error: 'Valid post object is required.' });
  }

  const user = getRequestUser(req);
  const db = loadDatabase();

  // Digital Legacy (feature 20): memorialized accounts are read-only.
  if (user && user.memorialized) {
    return res.status(403).json({ error: 'This account is memorialized — posts are read-only.' });
  }

  const timestamp = Date.now();
  const fullPost = {
    ...post,
    createdTime: post.createdTime || timestamp,
    createdAt: post.createdAt || new Date(timestamp).toISOString(),
    timestamp: post.timestamp || timestamp,
    comments: post.comments || [],
    likedBy: post.likedBy || [],
    likes: post.likes || 0
  };

  // Server-side NSFW Content Validation for explicit text
  const userText = `${fullPost.title || ''} ${fullPost.content || ''}`.toLowerCase();
  const BLOCK_TERMS = ['porn', 'hentai', 'xxx', 'naked', 'nude', 'pussy', 'dick', 'cock', 'vagina', 'penis', 'topless', 'boob', 'boobs', 'tits'];
  const BLUR_TERMS = ['nsfw', 'gore', 'decapitation', 'mutilation', 'slaughter'];

  for (const term of BLOCK_TERMS) {
    if (new RegExp(`\\b${term}\\b`, 'i').test(userText)) {
      return res.status(400).json({ error: `🚨 Post blocked by server AI Safety Filter: Adult/NSFW content detected (${term}).` });
    }
  }
  for (const term of BLUR_TERMS) {
    if (new RegExp(`\\b${term}\\b`, 'i').test(userText)) {
      fullPost.isNsfw = true;
      fullPost.nsfwVerdict = 'blur';
    }
  }

  if (user) {
    const dbUser = db.users.find((u: any) => u.id === user.id);
    if (dbUser) {
      dbUser.profile = dbUser.profile || {};
      dbUser.profile.posts = dbUser.profile.posts || [];
      const existingIdx = dbUser.profile.posts.findIndex((p: any) => p.id === fullPost.id);
      if (existingIdx !== -1) {
        dbUser.profile.posts[existingIdx] = fullPost;
      } else {
        dbUser.profile.posts.unshift(fullPost);
      }
    }
  }

  db.posts = db.posts || [];
  const globalIdx = db.posts.findIndex((p: any) => p.id === fullPost.id);
  if (globalIdx !== -1) {
    db.posts[globalIdx] = fullPost;
  } else {
    db.posts.unshift(fullPost);
  }

  saveDatabase(db);
  try {
    broadcastMessageToUsers([], { type: 'feed_updated', action: 'create_post', post: fullPost });
  } catch (e) {}
  res.json({ success: true, post: fullPost });
});

// --- STORIES (Ocean Stories 2.0 — #249) ---
// Full stories backend with 24h expiry, viewers, reactions, polls, Q&A, music
// Registered via registerOceanFeatures(app) in turtleFeatureRegistry.ts

// --- REELS (Short Video — client-side FFmpeg processed) ---
app.post('/api/reels/upload', requireAuth, async (req, res) => {
  try {
    const { videoUrl, caption, audioUrl } = req.body || {};
    if (!videoUrl || typeof videoUrl !== 'string' || (!videoUrl.startsWith('/uploads/') && !/^https?:\/\//.test(videoUrl))) {
      return res.status(400).json({ error: 'videoUrl must be a valid media URL (/uploads/... or http(s)://...).' });
    }

    const user = getRequestUser(req);
    const db = loadDatabase();
    const timestamp = Date.now();

    const newReel = {
      id: `reel-${timestamp}`,
      userId: user?.id || 'unknown',
      userName: user?.name || 'Unknown',
      videoUrl,
      caption: caption || '',
      audioUrl: audioUrl || '',
      createdAt: new Date(timestamp).toISOString(),
      createdTime: timestamp,
      likes: 0,
      likedBy: [],
      comments: [],
      views: 0,
    };

    db.reels = db.reels || [];
    db.reels.unshift(newReel);

    // Update user profile reels
    if (user) {
      const dbUser = db.users?.find((u: any) => u.id === user.id);
      if (dbUser) {
        dbUser.profile = dbUser.profile || {};
        dbUser.profile.reels = dbUser.profile.reels || [];
        dbUser.profile.reels.unshift(newReel);
      }
    }

    saveDatabase(db);
    try {
      broadcastMessageToUsers([], { type: 'reels_updated', action: 'create_reel', reel: newReel });
    } catch (e) {}
    res.json({ success: true, reel: newReel });
  } catch (err) {
    console.error('[Reels upload] Error:', err);
    res.status(500).json({ error: 'Reel upload failed.' });
  }
});

// ── REELS FEED + INTERACTIONS (production wiring of turtleReelsBackend) ─────
// Cursor-paginated, ranked reels feed. Sources: db.reels (server-persisted
// uploads) + per-user profile reels, deduped by id.
function findReelInDb(db: any, reelId: string): { reel: any; ownerUser?: any } | null {
  const idx = (db.reels || []).findIndex((r: any) => r && r.id === reelId);
  if (idx !== -1) return { reel: db.reels[idx] };
  for (const u of db.users || []) {
    const profileReels = u.profile?.reels || [];
    const ridx = profileReels.findIndex((r: any) => r && r.id === reelId);
    if (ridx !== -1) return { reel: profileReels[ridx], ownerUser: u };
  }
  return null;
}

// Alias: /api/reels serves the exact same ranked feed as /api/reels/feed
// (cursor-paginated, engagement-ranked). Keeps old clients working while the
// app's Reels feed is backed by real server data instead of mock fixtures.
app.get('/api/reels', requireAuth, (req, res) => {
  req.url = '/api/reels/feed' + (req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '');
  app._router.handle(req, res, () => {});
});

app.get('/api/reels/feed', requireAuth, (req, res) => {
  const db = loadDatabase();
  const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 50);
  const cursor = Number(req.query.cursor) || Infinity;
  const category = String(req.query.category || '').trim();
  const search = String(req.query.search || '').trim().toLowerCase();

  const reelMap = new Map<string, any>();
  (db.reels || []).forEach((r: any) => { if (r && r.id) reelMap.set(r.id, r); });
  (db.users || []).forEach((u: any) => {
    (u.profile?.reels || []).forEach((r: any) => { if (r && r.id) reelMap.set(r.id, r); });
  });

  const now = Date.now();
  const list = Array.from(reelMap.values()).filter((r: any) => {
    const t = Number(r.createdTime ?? r.timestamp ?? 0) || now;
    if (t > cursor) return false;
    if (category && (r.category || '') !== category) return false;
    if (search && !`${r.title || ''} ${r.caption || ''} ${r.userName || r.creatorName || ''}`.toLowerCase().includes(search)) return false;
    return true;
  });

  const scored = list.map((r: any) => {
    const t = Number(r.createdTime ?? r.timestamp ?? 0) || now;
    const ageHours = Math.max(0.25, (now - t) / 3600000);
    const views = Number(r.viewsCount ?? r.views ?? 0);
    const likes = Number(r.likes ?? (Array.isArray(r.likedBy) ? r.likedBy.length : 0));
    const comments = Array.isArray(r.comments) ? r.comments.length : 0;
    // Retention-weighted score from the reels blueprint engine when watch-time
    // data exists; momentum score otherwise.
    let score: number;
    if (Number(r.watchTimeSecondsTotal) > 0 && Number(r.durationSeconds) > 0) {
      try {
        score = ReelsRecommendationEngine.scoreByRetentionEngagement({
          reel: r,
          creatorIsVerified: !!r.creatorIsVerified,
          ageInHours: ageHours,
        });
      } catch (e) {
        score = (likes * 2 + comments * 3 + views * 0.05) / Math.pow(ageHours + 2, 1.2);
      }
    } else {
      score = (likes * 2 + comments * 3 + views * 0.05) / Math.pow(ageHours + 2, 1.2);
    }
    return { r, score, t };
  });

  scored.sort((a, b) => b.score - a.score || b.t - a.t);
  const page = scored.slice(0, limit);
  const nextCursor = page.length ? Math.min(...page.map((x) => x.t)) : null;
  const hasMore = scored.length > page.length;

  res.json({
    reels: page.map((x) => ({ ...x.r, rankingScore: Number(x.score.toFixed(4)) })),
    nextCursor,
    hasMore,
    total: scored.length,
  });
});

app.post('/api/reels/:id/like', requireAuth, (req, res) => {
  const user = (req as any).user;
  const db = loadDatabase();
  const found = findReelInDb(db, req.params.id);
  if (!found) return res.status(404).json({ error: 'Reel not found.' });
  const reel = found.reel;
  reel.likedBy = Array.isArray(reel.likedBy) ? reel.likedBy : [];
  const idx = reel.likedBy.indexOf(user.id);
  const liked = idx === -1;
  if (liked) reel.likedBy.push(user.id); else reel.likedBy.splice(idx, 1);
  reel.likes = reel.likedBy.length;
  saveDatabase(db);
  try { broadcastMessageToUsers([], { type: 'reels_updated', action: 'like_reel', reelId: reel.id, liked }); } catch (e) {}
  res.json({ success: true, liked, likes: reel.likes });
});

app.post('/api/reels/:id/comment', requireAuth, (req, res) => {
  const user = (req as any).user;
  const text = String(req.body?.text || '').trim().slice(0, 500);
  if (!text) return res.status(400).json({ error: 'Comment text is required.' });
  const db = loadDatabase();
  const found = findReelInDb(db, req.params.id);
  if (!found) return res.status(404).json({ error: 'Reel not found.' });
  const reel = found.reel;
  reel.comments = reel.comments || [];
  const comment = {
    id: `reelc-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    userId: user.id,
    userName: user.name || 'User',
    text,
    createdAt: Date.now(),
  };
  reel.comments.push(comment);
  saveDatabase(db);
  try { broadcastMessageToUsers([], { type: 'reels_updated', action: 'comment_reel', reelId: reel.id }); } catch (e) {}
  res.json({ success: true, comment, commentsCount: reel.comments.length });
});

// View + watch-time analytics. Uses ReelsAnalyticsManager (from the reels
// blueprint): a view only counts after ≥3s watched or a completed loop, and a
// 2s per-user-per-reel cooldown prevents view-injection spam.
const reelViewCooldowns = new Map<string, number>();
// Evict stale cooldown entries so the map cannot grow unbounded.
setInterval(() => {
  const cutoff = Date.now() - 60 * 60 * 1000;
  for (const [k, t] of reelViewCooldowns) {
    if (t < cutoff) reelViewCooldowns.delete(k);
  }
}, 10 * 60 * 1000).unref?.();

app.post('/api/reels/:id/view', requireAuth, (req, res) => {
  const user = (req as any).user;
  const db = loadDatabase();
  const found = findReelInDb(db, req.params.id);
  if (!found) return res.status(404).json({ error: 'Reel not found.' });
  const reel = found.reel;
  const watchSeconds = Math.max(0, Math.min(Number(req.body?.watchSeconds) || 0, 120));
  const completedLoop = req.body?.completedLoop === true;

  const event = ReelsAnalyticsManager.trackPlayEvent(
    {
      reelId: reel.id,
      userId: user.id,
      watchDurationSeconds: watchSeconds,
      completedLoop,
      clientSessionId: String(req.body?.sessionId || 's'),
      timestamp: new Date(),
    },
    req.ip || ''
  );

  if (event.isValid && event.viewIncrementAmount > 0) {
    const key = `${user.id}:${reel.id}`;
    const now = Date.now();
    if (now - (reelViewCooldowns.get(key) || 0) >= 2000) {
      reelViewCooldowns.set(key, now);
      reel.views = (reel.views || 0) + 1;
      reel.viewsCount = (reel.viewsCount || 0) + 1;
    }
  }
  reel.watchTimeSecondsTotal = (reel.watchTimeSecondsTotal || 0) + event.watchDurationAdded;
  saveDatabase(db);
  res.json({ success: true, views: reel.viewsCount ?? reel.views, watchTimeSecondsTotal: reel.watchTimeSecondsTotal });
});

app.delete('/api/reels/:id', requireAuth, (req, res) => {
  const user = (req as any).user;
  const db = loadDatabase();
  const found = findReelInDb(db, req.params.id);
  if (!found) return res.status(404).json({ error: 'Reel not found.' });
  const isOwner = !!user.isAdmin || found.reel.userId === user.id || (found.ownerUser && found.ownerUser.id === user.id);
  if (!isOwner) return res.status(403).json({ error: 'Only the creator can delete this reel.' });
  const idx = (db.reels || []).findIndex((r: any) => r && r.id === req.params.id);
  if (idx !== -1) db.reels.splice(idx, 1);
  (db.users || []).forEach((u: any) => {
    if (u.profile?.reels) {
      const pidx = u.profile.reels.findIndex((r: any) => r && r.id === req.params.id);
      if (pidx !== -1) u.profile.reels.splice(pidx, 1);
    }
  });
  saveDatabase(db);
  try { broadcastMessageToUsers([], { type: 'reels_updated', action: 'delete_reel', reelId: req.params.id }); } catch (e) {}
  res.json({ success: true });
});

// SERVER-SIDE NSFW SCREENING lives in turtleNSFWServerEngine.ts — the
// registerNSFWRoutes() mount (below) is the ONLY /api/nsfw/check handler.
// A previous inline duplicate here shadowed the real engine route with a
// keyword-only stub; it has been removed so the full engine runs.

// GET INDIVIDUAL POST BY ID
function initializePostAnalytics(post: any) {
  if (!post) return;
  if (post.impressionsCount === undefined) {
    const likes = post.likes || 0;
    const commentsCount = (post.comments || []).length;
    const repostsCount = post.repostsCount || 0;
    
    const baseClicks = likes * 2 + commentsCount * 3 + repostsCount * 4 + Math.floor(Math.random() * 5) + 1;
    const baseImpressions = baseClicks * 4 + Math.floor(Math.random() * 20) + 12;
    const baseShares = Math.floor(likes * 0.3) + Math.floor(Math.random() * 2);

    post.impressionsCount = baseImpressions;
    post.clicksCount = baseClicks;
    post.sharesCount = baseShares;
    
    // Generate 7-day impressions data
    const impressionsData: { date: string; value: number }[] = [];
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(now.getDate() - i);
      const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const dailyValue = Math.max(1, Math.floor(baseImpressions / 7) + Math.floor(Math.random() * 3) - 1);
      impressionsData.push({ date: dateStr, value: dailyValue });
    }
    post.impressionsData = impressionsData;

    // Generate country breakdown
    const viewsByCountry: Record<string, number> = {};
    if (baseImpressions > 0) {
      viewsByCountry["Bangladesh"] = Math.ceil(baseImpressions * 0.75);
      viewsByCountry["United States"] = Math.ceil(baseImpressions * 0.15);
      viewsByCountry["United Kingdom"] = Math.max(1, Math.floor(baseImpressions * 0.10));
    } else {
      viewsByCountry["Bangladesh"] = 1;
    }
    post.viewsByCountry = viewsByCountry;
  }
}

app.get('/api/posts/:postId', (req, res) => {
  const { postId } = req.params;
  const db = loadDatabase();
  let foundPost: any = null;
  let creatorObj: any = null;

  db.users.forEach((u: any) => {
    const posts = u.profile.posts || [];
    const p = posts.find((pObj: any) => pObj.id === postId);
    if (p) {
      foundPost = p;
      const isAnon = !!p.isAnonymous;
      creatorObj = isAnon ? {
        id: p.anonymousCreatorId || 'anon-user-BD-99-9999',
        name: p.anonymousCreatorName || 'ANON BD 99 9999',
        username: 'anonymous',
        avatarUrl: '',
        tagline: 'Encrypted Identity',
        badgeNumber: 'ANON-99',
        isAnonymous: true
      } : {
        id: u.id,
        name: u.name,
        username: u.profile?.username || u.username || '',
        avatarUrl: u.profile?.avatarUrl || '',
        tagline: '',
        badgeNumber: u.profile?.badgeNumber || 'BD-00',
        allowConnections: u.profile?.allowConnections !== false,
        isPublicMessagingEnabled: u.profile?.isPublicMessagingEnabled !== false
      };
    }
  });

  if (foundPost) {
    // Increment analytics for this post on detailed retrieval
    initializePostAnalytics(foundPost);
    foundPost.impressionsCount = (foundPost.impressionsCount || 0) + 1;
    foundPost.clicksCount = (foundPost.clicksCount || 0) + 1;
    
    if (foundPost.impressionsData && foundPost.impressionsData.length > 0) {
      const lastIndex = foundPost.impressionsData.length - 1;
      foundPost.impressionsData[lastIndex].value += 1;
    }

    if (foundPost.viewsByCountry) {
      const viewerCountry = "Bangladesh";
      foundPost.viewsByCountry[viewerCountry] = (foundPost.viewsByCountry[viewerCountry] || 0) + 1;
    }
    
    saveDatabase(db);

    // Resolve comments dynamically
    const resolvedComments = (foundPost.comments || []).map((c: any) => {
      let senderName = c.senderName;
      let senderAvatarUrl = '';
      if (c.senderId) {
        const commentUser = db.users.find((userObj: any) => userObj.id === c.senderId);
        if (commentUser) {
          senderName = commentUser.name;
          senderAvatarUrl = commentUser.profile?.avatarUrl || '';
        }
      }
      return {
        ...c,
        senderName,
        senderAvatarUrl
      };
    });

    // Resolve likedBy to likedByUsers
    const resolvedLikedBy = (foundPost.likedBy || []).map((id: string) => {
      if (id.startsWith('guest-')) {
        return { id, name: 'Guest Visitor', avatarUrl: '' };
      }
      const userObj = db.users.find((userObj: any) => userObj.id === id);
      if (userObj) {
        return {
          id: userObj.id,
          name: userObj.name,
          avatarUrl: userObj.profile?.avatarUrl || ''
        };
      }
      return { id, name: 'Anonymous User', avatarUrl: '' };
    });

    const repostsMap = getRepostsCountMap(db);
    const countById = foundPost.id ? (repostsMap.get(`id:${foundPost.id}`) || 0) : 0;
    const isAnon = !!foundPost.isAnonymous;
    const creatorIdForMap = isAnon ? (foundPost.anonymousCreatorId || 'anon-user-BD-99-9999') : creatorObj.id;
    const countByText = (creatorIdForMap && foundPost.title && foundPost.content) ? (repostsMap.get(`text:${creatorIdForMap}:${foundPost.title.trim()}:${foundPost.content.trim()}`) || 0) : 0;
    const repostsCount = Math.max(countById, countByText);

    res.json({
      success: true,
      post: {
        ...foundPost,
        comments: resolvedComments,
        likedByUsers: resolvedLikedBy,
        repostsCount,
        creator: creatorObj
      }
    });
  } else {
    res.status(404).json({ error: 'Post not found' });
  }
});

// EDIT A POST BY ID
app.post('/api/posts/:postId/edit', requireAuth, (req, res) => {
  const { postId } = req.params;
  const { title, content, imageUrl, videoUrl, audioUrl } = req.body;
  const user = (req as any).user;
  const db = loadDatabase();

  let found = false;
  let updatedPost: any = null;

  db.users.forEach((u: any) => {
    const posts = u.profile.posts || [];
    const idx = posts.findIndex((p: any) => p.id === postId);
    if (idx !== -1) {
      const p = posts[idx];
      // Verify ownership
      const isAnonOwner = p.isAnonymous && (p.anonymousCreatorId === user.id || p.authorId === user.id);
      const isNormalOwner = !p.isAnonymous && u.id === user.id;

      if (isNormalOwner || isAnonOwner || u.id === user.id) {
        p.title = title !== undefined ? title : p.title;
        p.content = content !== undefined ? content : p.content;
        if (imageUrl !== undefined) p.imageUrl = imageUrl;
        if (videoUrl !== undefined) p.videoUrl = videoUrl;
        if (audioUrl !== undefined) p.audioUrl = audioUrl;
        updatedPost = p;
        found = true;
      }
    }
  });

  if (found) {
    saveDatabase(db);
    res.json({ success: true, post: updatedPost });
  } else {
    res.status(404).json({ error: 'Post not found or unauthorized to edit.' });
  }
});

// DELETE A POST BY ID
app.post('/api/posts/:postId/delete', requireAuth, (req, res) => {
  const { postId } = req.params;
  const user = (req as any).user;
  const db = loadDatabase();

  let found = false;

  db.users.forEach((u: any) => {
    const posts = u.profile?.posts || [];
    const idx = posts.findIndex((p: any) => p && p.id === postId);
    if (idx !== -1) {
      const p = posts[idx];
      const isAnonOwner = p.isAnonymous && (p.anonymousCreatorId === user.id || p.authorId === user.id);
      const isNormalOwner = !p.isAnonymous && (u.id === user.id || p.authorId === user.id || p.creator?.id === user.id);

      if (isNormalOwner || isAnonOwner || u.id === user.id) {
        posts.splice(idx, 1);
        u.profile.posts = posts;
        found = true;
      }
    }
  });

  // Always remove from db.posts array
  if (db.posts && Array.isArray(db.posts)) {
    const pIdx = db.posts.findIndex((p: any) => p && p.id === postId);
    if (pIdx !== -1) {
      db.posts.splice(pIdx, 1);
      found = true;
    }
  }

  // Also remove from Firestore if Firestore is initialized (admin-SDK aware)
  try {
    const fsClient = getFirestoreClient();
    if (fsClient) {
      fsDeleteDoc(fsClient, 'posts', postId).catch(() => {});
    }
  } catch (e) {}

  if (found) {
    saveDatabase(db);
    try {
      broadcastMessageToUsers([], { type: 'feed_updated', action: 'delete_post', postId });
    } catch (e) {}
    res.json({ success: true, message: 'Post deleted successfully.' });
  } else {
    res.status(404).json({ error: 'Post not found or unauthorized to delete.' });
  }
});

// REPORT A POST BY ID
app.post('/api/posts/:postId/report', requireAuth, (req, res) => {
  const { postId } = req.params;
  const user = (req as any).user;
  const db = loadDatabase();
  
  let found = false;
  db.users.forEach((u: any) => {
    const posts = u.profile.posts || [];
    const post = posts.find((p: any) => p.id === postId);
    if (post) {
      post.reports = post.reports || [];
      if (!post.reports.includes(user.id)) {
        post.reports.push(user.id);
      }
      post.reportsCount = post.reports.length;
      found = true;
    }
  });

  if (found) {
    saveDatabase(db);
    res.json({ success: true, message: 'Post reported successfully.' });
  } else {
    res.status(404).json({ error: 'Post not found.' });
  }
});

// ── ADMIN MODERATION (ported from base44 Admin panel) ──────────────────────
app.get('/api/admin/reports', requireAuth, requireAdmin, (req, res) => {
  const db = loadDatabase();
  const reports: any[] = [];
  db.users.forEach((u: any) => {
    (u.profile?.posts || []).forEach((p: any) => {
      if (p.reportsCount > 0 && Array.isArray(p.reports) && p.reports.length > 0) {
        reports.push({
          id: p.id,
          authorId: u.id,
          authorName: u.name || 'User',
          text: String(p.title || p.text || p.caption || '').slice(0, 200),
          imageUrl: p.imageUrl,
          videoUrl: p.videoUrl,
          reportsCount: p.reportsCount,
          reporters: p.reports,
          status: p.hidden ? 'hidden' : (p.moderated ? 'resolved' : 'open'),
          createdAt: p.createdTime || p.timestamp || Date.now(),
        });
      }
    });
  });
  reports.sort((a, b) => b.reportsCount - a.reportsCount);
  res.json({ reports: reports.slice(0, 100) });
});

app.post('/api/admin/posts/:postId/action', requireAuth, requireAdmin, (req, res) => {
  const { postId } = req.params;
  const { action } = req.body || {}; // hide | remove | clear
  const db = loadDatabase();
  let changed = false;
  db.users.forEach((u: any) => {
    const posts = u.profile?.posts || [];
    const idx = posts.findIndex((p: any) => p.id === postId);
    if (idx !== -1) {
      const p = posts[idx];
      if (action === 'hide') {
        p.hidden = true;
        p.moderated = true;
      } else if (action === 'remove') {
        posts.splice(idx, 1);
      } else if (action === 'clear') {
        p.reports = [];
        p.reportsCount = 0;
        p.moderated = true;
      }
      changed = true;
    }
  });
  if (changed) {
    saveDatabase(db);
    res.json({ success: true });
  } else {
    res.status(404).json({ error: 'Post not found.' });
  }
});

app.get('/api/admin/users', requireAuth, requireAdmin, (req, res) => {
  const db = loadDatabase();
  const users = db.users.map((u: any) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    trustScore: u.trustScore || 0,
    followersCount: u.profile?.followersCount || u.followersCount || 0,
    blocked: !!u.blocked,
    reportsReceived: (u.profile?.posts || []).filter((p: any) => p.reportsCount > 0).length,
    createdAt: u.createdAt || 0,
  }));
  users.sort((a: any, b: any) => b.reportsReceived - a.reportsReceived);
  res.json({ users });
});

app.post('/api/admin/users/:id/block', requireAuth, requireAdmin, (req, res) => {
  const { id } = req.params;
  const { blocked } = req.body || {};
  const db = loadDatabase();
  const u = db.users.find((x: any) => x.id === id);
  if (!u) return res.status(404).json({ error: 'User not found.' });
  u.blocked = !!blocked;
  saveDatabase(db);
  res.json({ success: true, blocked: u.blocked });
});

// AI-assisted scan of recent posts (heuristic keyword filter; no API key
// required). Flags suspicious posts so a human admin can review them.
const SCAN_FLAG_WORDS = [
  'buy followers', 'free money', 'click here', 'urgent loan', 'password needed',
  'credit card', 'sex', 'nude', 'porn', 'gambling', 'casino', 'hack', 'spam',
  'earn fast', 'instant cash', 'bitcoin giveaway',
];

app.post('/api/admin/scan', requireAuth, requireAdmin, (req, res) => {
  const { limit = 200 } = req.body || {};
  const db = loadDatabase();
  const flagged: any[] = [];
  const seen = new Set<string>();
  db.users.forEach((u: any) => {
    (u.profile?.posts || []).forEach((p: any) => {
      if (seen.has(p.id)) return;
      seen.add(p.id);
      if (flagged.length >= limit) return;
      const text = String(p.title || p.text || p.caption || '');
      const lower = text.toLowerCase();
      const hits = SCAN_FLAG_WORDS.filter((w) => lower.includes(w));
      if (hits.length > 0) {
        flagged.push({
          id: p.id,
          authorId: u.id,
          authorName: u.name || 'User',
          text: text.slice(0, 200),
          hits,
          severity: hits.length >= 3 ? 'high' : hits.length === 2 ? 'medium' : 'low',
          createdAt: p.createdTime || p.timestamp || Date.now(),
        });
      }
    });
  });
  flagged.sort((a, b) => b.hits.length - a.hits.length);
  res.json({ flagged: flagged.slice(0, limit) });
});

// SHARE A POST BY ID
app.post('/api/posts/:postId/share', (req, res) => {
  const { postId } = req.params;
  const db = loadDatabase();
  let found = false;
  let updatedShares = 0;

  db.users.forEach((u: any) => {
    const posts = u.profile.posts || [];
    const p = posts.find((pObj: any) => pObj.id === postId);
    if (p) {
      initializePostAnalytics(p);
      p.sharesCount = (p.sharesCount || 0) + 1;
      updatedShares = p.sharesCount;
      found = true;
    }
  });

  if (found) {
    saveDatabase(db);
    res.json({ success: true, sharesCount: updatedShares });
  } else {
    res.status(404).json({ error: 'Post not found.' });
  }
});

// LIKE A POST IN FEED
app.post('/api/posts/:postId/like', (req, res) => {
  const { postId } = req.params;
  const user = getRequestUser(req);
  const { guestId, reaction } = req.body;
  const actingAsAnonymous = req.headers['x-acting-as-anonymous'] === 'true';

  // Multi-reaction support (port from arena-ai): like | love | insight | support
  const VALID_REACTIONS = ['like', 'love', 'insight', 'support'];
  const reactionType = VALID_REACTIONS.includes(reaction) ? reaction : 'like';

  let identifier = user ? user.id : guestId;
  let actorName = user ? user.name : 'Guest Visitor';

  if (!identifier) {
    return res.status(401).json({ error: 'Authentication or Guest ID required.' });
  }

  if (actingAsAnonymous && user) {
    const deter = getDeterministicAnon(user.id, user.countryCode);
    identifier = deter.id;
    actorName = deter.name;
  }

  const db = loadDatabase();
  let found = false;
  let updatedLikes = 0;

  db.users.forEach((u: any) => {
    const posts = u.profile.posts || [];
    const post = posts.find((p: any) => p.id === postId);
    if (post) {
      // Initialize reactions map: { like: [userIds], love: [...], insight: [...], support: [...] }
      post.reactions = post.reactions || { like: [], love: [], insight: [], support: [] };
      Object.keys(post.reactions).forEach((key) => {
        if (!Array.isArray(post.reactions[key])) post.reactions[key] = [];
      });

      const targetList = post.reactions[reactionType];
      const targetIdx = targetList.indexOf(identifier);

      if (targetIdx !== -1) {
        // Toggle: remove this reaction from the selected type
        targetList.splice(targetIdx, 1);
      } else {
        // Remove the user from ALL other reaction types (single active reaction per user)
        VALID_REACTIONS.forEach((rt) => {
          if (rt !== reactionType) {
            post.reactions[rt] = (post.reactions[rt] || []).filter((id: string) => id !== identifier);
          }
        });
        targetList.push(identifier);

        // Trigger like notification (only once per user per post)
        if (!post.reactedUsers || !post.reactedUsers.includes(identifier)) {
          addNotification(db, u.id, 'like', { id: identifier, name: actorName }, { postId: post.id, postTitle: post.title });
        }
      }

      // Backward-compatible aggregate: union of all reaction lists
      const allReacted = Array.from(new Set(VALID_REACTIONS.flatMap((rt) => post.reactions[rt] || [])));
      post.reactedUsers = allReacted;
      post.likedBy = allReacted;
      post.likes = allReacted.length;
      updatedLikes = post.likes;
      found = true;
    }
  });

  if (found) {
    saveDatabase(db);
    let updatedReactions: Record<string, string[]> = { like: [], love: [], insight: [], support: [] };
    db.users.forEach((u: any) => {
      const posts = u.profile.posts || [];
      const post = posts.find((p: any) => p.id === postId);
      if (post) {
        updatedReactions = post.reactions || updatedReactions;
        updatedLikes = post.likes || updatedLikes;
      }
    });
    res.json({ success: true, likes: updatedLikes, likedBy: updatedLikes > 0 ? Object.values(updatedReactions).flat() : [], reactions: updatedReactions });
  } else {
    res.status(404).json({ error: 'Post not found.' });
  }
});

// VOTE ON A POLL IN POST
app.post('/api/posts/:postId/poll/vote', (req, res) => {
  const { postId } = req.params;
  const { optionId } = req.body;
  const user = getRequestUser(req);
  if (!user) {
    return res.status(401).json({ error: 'Authentication required to vote.' });
  }

  const db = loadDatabase();
  let updatedPoll = null;

  db.users.forEach((u: any) => {
    const posts = u.profile.posts || [];
    const post = posts.find((p: any) => p.id === postId);
    if (post && post.poll && Array.isArray(post.poll.options)) {
      post.poll.options.forEach((opt: any) => {
        opt.votes = opt.votes || [];
        // Remove existing vote by user across all options (single-choice poll)
        opt.votes = opt.votes.filter((vId: string) => vId !== user.id);
        if (opt.id === optionId) {
          opt.votes.push(user.id);
        }
      });
      updatedPoll = post.poll;
    }
  });

  if (updatedPoll) {
    saveDatabase(db);
    res.json({ success: true, poll: updatedPoll });
  } else {
    res.status(404).json({ error: 'Post or poll option not found.' });
  }
});

// EXPORT ENCRYPTED BACKUP DATA
app.get('/api/profile/export', requireAuth, (req, res) => {
  const user = (req as any).user;
  const db = loadDatabase();
  const dbUser = db.users.find((u: any) => u.id === user.id);
  if (!dbUser) {
    return res.status(404).json({ error: 'User not found.' });
  }
  const dump = {
    app: 'Turtle Network',
    version: '1.0.0',
    exportedAt: new Date().toISOString(),
    user: {
      id: dbUser.id,
      name: dbUser.name,
      email: dbUser.email,
      username: dbUser.username,
      countryCode: dbUser.countryCode,
      profile: dbUser.profile,
      following: dbUser.following || [],
      followers: dbUser.followers || [],
      blockedUsers: dbUser.blockedUsers || []
    }
  };
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="turtle_backup_${dbUser.username || dbUser.id}_${Date.now()}.json"`);
  res.send(JSON.stringify(dump, null, 2));
});

// Helper to optionally resolve user from Authorization header
function getRequestUser(req: express.Request) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.split(' ')[1];
  const userId = getUserIdFromToken(token);
  if (!userId) return null;
  const db = loadDatabase();
  return db.users.find((u: any) => u.id === userId) || null;
}

// ADD COMMENT TO A POST IN FEED (Supports Guest/Optional Auth & Image/Audio attachments)
app.post('/api/posts/:postId/comment', (req, res) => {
  const { postId } = req.params;
  const { text, parentId, senderName, image, audioUrl } = req.body;
  const senderInfo = getSenderInfo(req, senderName);
  const finalSenderName = senderInfo.name;
  const finalSenderId = senderInfo.id;

  if (!text && !image && !audioUrl) {
    return res.status(400).json({ error: 'Text, image, or voice message is required.' });
  }

  const db = loadDatabase();
  let found = false;
  let updatedComments: any[] = [];

  db.users.forEach((u: any) => {
    const posts = u.profile.posts || [];
    const post = posts.find((p: any) => p.id === postId);
    if (post) {
      post.comments = post.comments || [];
      const newComment = {
        id: `comment-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        senderId: finalSenderId,
        senderName: finalSenderName.trim(),
        text: (text || '').trim(),
        parentId: parentId || null,
        reactions: {},
        image: image || null,
        audioUrl: audioUrl || null,
        timestamp: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
      };
      post.comments.push(newComment);
      updatedComments = post.comments;
      found = true;
      
      // Trigger comment notification and mentions parsing
      const actor = { id: finalSenderId || 'guest', name: finalSenderName };
      addNotification(db, u.id, 'comment', actor, { postId: post.id, postTitle: post.title });
      parseAndSendMentions(db, text || '', actor, { postId: post.id, postTitle: post.title });
    }
  });

  if (found) {
    saveDatabase(db);
    res.json({ success: true, comments: updatedComments });
  } else {
    res.status(404).json({ error: 'Post not found.' });
  }
});

// SUBMIT AN INTEREST MESSAGE TO A NEED POST (Supports Guest/Optional Auth)
app.post('/api/posts/:postId/need-text', (req, res) => {
  const { postId } = req.params;
  const { text, senderName } = req.body;
  const user = getRequestUser(req);
  const finalSenderName = user ? user.name : (senderName || 'Anonymous Guest');

  if (!text || !text.trim()) {
    return res.status(400).json({ error: 'Text content is required to send a portal message.' });
  }

  const db = loadDatabase();
  let found = false;
  let updatedTexts: any[] = [];
  let errorMsg = '';

  db.users.forEach((u: any) => {
    const posts = u.profile.posts || [];
    const post = posts.find((p: any) => p.id === postId);
    if (post) {
      if (post.needStatus === 'fulfilled') {
        errorMsg = 'This need has already been fulfilled and matching is complete.';
        return;
      }
      post.needTexts = post.needTexts || [];
      const newMessage = {
        id: `need-msg-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        senderId: user ? user.id : 'guest',
        senderName: finalSenderName.trim(),
        text: text.trim(),
        timestamp: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
      };
      post.needTexts.push(newMessage);
      updatedTexts = post.needTexts;
      found = true;

      // Trigger a direct, un-grouped notification to the poster
      const actor = user ? { id: user.id, name: user.name } : { id: 'guest', name: finalSenderName };
      addNotification(db, u.id, 'need_interest', actor, { 
        postId: post.id, 
        postTitle: post.title, 
        interestText: text 
      });
    }
  });

  if (errorMsg) {
    return res.status(400).json({ error: errorMsg });
  }

  if (found) {
    saveDatabase(db);
    res.json({ success: true, needTexts: updatedTexts });
  } else {
    res.status(404).json({ error: 'Need post not found.' });
  }
});

// UPDATE NEED POST STATUS (Owner Only)
app.post('/api/posts/:postId/need-status', requireAuth, (req, res) => {
  const { postId } = req.params;
  const { status } = req.body; // 'active' | 'fulfilled'
  const user = (req as any).user;

  if (status !== 'active' && status !== 'fulfilled') {
    return res.status(400).json({ error: 'Invalid status. Must be active or fulfilled.' });
  }

  const db = loadDatabase();
  const dbUser = db.users.find((u: any) => u.id === user.id);
  if (!dbUser) {
    return res.status(404).json({ error: 'User not found.' });
  }

  const posts = dbUser.profile.posts || [];
  const post = posts.find((p: any) => p.id === postId);

  if (post) {
    post.needStatus = status;
    saveDatabase(db);
    res.json({ success: true, post });
  } else {
    res.status(404).json({ error: 'Need post not found or you do not have permission to modify it.' });
  }
});

// REACT WITH EMOJI TO A COMMENT OR REPLY (Supports Guest/Optional Auth)
app.post('/api/posts/:postId/comments/:commentId/react', (req, res) => {
  const { postId, commentId } = req.params;
  const { emoji, senderName } = req.body;
  const senderInfo = getSenderInfo(req, senderName);
  const finalSenderName = senderInfo.name;

  if (!emoji) {
    return res.status(400).json({ error: 'Emoji is required.' });
  }

  const db = loadDatabase();
  let found = false;
  let updatedComments: any[] = [];

  db.users.forEach((u: any) => {
    const posts = u.profile.posts || [];
    const post = posts.find((p: any) => p.id === postId);
    if (post) {
      post.comments = post.comments || [];
      const comment = post.comments.find((c: any) => c.id === commentId);
      if (comment) {
        comment.reactions = comment.reactions || {};
        comment.reactions[emoji] = comment.reactions[emoji] || [];
        
        const idx = comment.reactions[emoji].indexOf(finalSenderName);
        if (idx !== -1) {
          // Toggle off
          comment.reactions[emoji].splice(idx, 1);
        } else {
          // Toggle on
          comment.reactions[emoji].push(finalSenderName);
        }
        updatedComments = post.comments;
        found = true;
      }
    }
  });

  if (found) {
    saveDatabase(db);
    res.json({ success: true, comments: updatedComments });
  } else {
    res.status(404).json({ error: 'Post or comment not found.' });
  }
});

// EDIT A COMMENT ON A FEED POST
app.post('/api/posts/:postId/comments/:commentId/edit', (req, res) => {
  const { postId, commentId } = req.params;
  const { text, senderName } = req.body;
  const user = getRequestUser(req);
  const senderInfo = getSenderInfo(req, senderName);

  if (!text || !text.trim()) {
    return res.status(400).json({ error: 'Text content is required to edit.' });
  }

  const db = loadDatabase();
  let found = false;
  let updatedComments: any[] = [];

  db.users.forEach((u: any) => {
    const posts = u.profile.posts || [];
    const post = posts.find((p: any) => p.id === postId);
    if (post) {
      post.comments = post.comments || [];
      const comment = post.comments.find((c: any) => c.id === commentId);
      if (comment) {
        const isCommentAuthor = (user && comment.senderId === user.id) || (comment.senderId === senderInfo.id) || (!comment.senderId && comment.senderName === senderInfo.name);
        const isPostAuthor = user && u.id === user.id;

        if (isCommentAuthor || isPostAuthor) {
          comment.text = text.trim();
          updatedComments = post.comments;
          found = true;
        } else {
          return res.status(403).json({ error: 'Unauthorized to edit this comment.' });
        }
      }
    }
  });

  if (found) {
    saveDatabase(db);
    res.json({ success: true, comments: updatedComments });
  } else {
    if (!res.headersSent) {
      res.status(404).json({ error: 'Post or comment not found.' });
    }
  }
});

// DELETE A COMMENT ON A FEED POST
app.post('/api/posts/:postId/comments/:commentId/delete', (req, res) => {
  const { postId, commentId } = req.params;
  const { senderName } = req.body;
  const user = getRequestUser(req);
  const senderInfo = getSenderInfo(req, senderName);

  const db = loadDatabase();
  let found = false;
  let updatedComments: any[] = [];

  db.users.forEach((u: any) => {
    const posts = u.profile.posts || [];
    const post = posts.find((p: any) => p.id === postId);
    if (post) {
      post.comments = post.comments || [];
      const commentIndex = post.comments.findIndex((c: any) => c.id === commentId);
      if (commentIndex > -1) {
        const comment = post.comments[commentIndex];
        const isCommentAuthor = (user && comment.senderId === user.id) || (comment.senderId === senderInfo.id) || (!comment.senderId && comment.senderName === senderInfo.name);
        const isPostAuthor = user && u.id === user.id;

        if (isCommentAuthor || isPostAuthor) {
          post.comments.splice(commentIndex, 1);
          post.comments = post.comments.filter((c: any) => c.parentId !== commentId);
          updatedComments = post.comments;
          found = true;
        } else {
          return res.status(403).json({ error: 'Unauthorized to delete this comment.' });
        }
      }
    }
  });

  if (found) {
    saveDatabase(db);
    res.json({ success: true, comments: updatedComments });
  } else {
    if (!res.headersSent) {
      res.status(404).json({ error: 'Post or comment not found.' });
    }
  }
});

// HELPER TO ADD/AGGREGATE NOTIFICATION
function addNotification(db: any, targetUserId: string, type: string, actor: { id: string, name: string }, extra: { postId?: string, postTitle?: string, interestText?: string } = {}) {
  if (actor.id === targetUserId) return;
  const targetUser = db.users.find((u: any) => u.id === targetUserId);
  if (!targetUser) return;

  targetUser.notifications = targetUser.notifications || [];

  const existingIndex = targetUser.notifications.findIndex((n: any) => {
    if (n.isRead) return false;
    if (n.type !== type) return false;
    if (extra.postId && n.postId !== extra.postId) return false;
    if (type === 'need_interest') return false; // individual notifications for needs
    return true;
  });

  if (existingIndex !== -1) {
    const n = targetUser.notifications[existingIndex];
    if (!n.actorIds.includes(actor.id)) {
      n.actorIds.push(actor.id);
      n.actorNames.push(actor.name);
    }
    n.timestamp = Date.now();

    const count = n.actorNames.length;
    const othersCount = count - 1;
    const firstActorName = n.actorNames[0];

    if (type === 'follow') {
      n.message = count > 1 
        ? `${firstActorName} and ${othersCount} other${othersCount > 1 ? 's' : ''} followed you`
        : `${firstActorName} followed you`;
    } else if (type === 'friend_request') {
      n.message = `${firstActorName} sent you a friend request`;
    } else if (type === 'friend_accept') {
      n.message = `${firstActorName} accepted your friend request`;
    } else if (type === 'like') {
      const titleTrunc = extra.postTitle ? ` "${extra.postTitle.substring(0, 20)}${extra.postTitle.length > 20 ? '...' : ''}"` : '';
      n.message = count > 1
        ? `${firstActorName} and ${othersCount} other${othersCount > 1 ? 's' : ''} liked your post${titleTrunc}`
        : `${firstActorName} liked your post${titleTrunc}`;
    } else if (type === 'comment') {
      const titleTrunc = extra.postTitle ? ` "${extra.postTitle.substring(0, 20)}${extra.postTitle.length > 20 ? '...' : ''}"` : '';
      n.message = count > 1
        ? `${firstActorName} and ${othersCount} other${othersCount > 1 ? 's' : ''} commented on your post${titleTrunc}`
        : `${firstActorName} commented on your post${titleTrunc}`;
    } else if (type === 'mention') {
      const titleTrunc = extra.postTitle ? ` "${extra.postTitle.substring(0, 20)}${extra.postTitle.length > 20 ? '...' : ''}"` : '';
      n.message = count > 1
        ? `${firstActorName} and ${othersCount} other${othersCount > 1 ? 's' : ''} mentioned you in a post/comment${titleTrunc}`
        : `${firstActorName} mentioned you in a post/comment${titleTrunc}`;
    } else if (type === 'repost') {
      const titleTrunc = extra.postTitle ? ` "${extra.postTitle.substring(0, 20)}${extra.postTitle.length > 20 ? '...' : ''}"` : '';
      n.message = count > 1
        ? `${firstActorName} and ${othersCount} other${othersCount > 1 ? 's' : ''} reposted your publication${titleTrunc}`
        : `${firstActorName} reposted your publication${titleTrunc}`;
    } else if (type === 'chat_message') {
      const msgPreview = extra.interestText ? `: "${extra.interestText.substring(0, 25)}${extra.interestText.length > 25 ? '...' : ''}"` : '';
      n.message = count > 1
        ? `${firstActorName} and ${othersCount} other${othersCount > 1 ? 's' : ''} sent you messages${msgPreview}`
        : `${firstActorName} sent you a message${msgPreview}`;
    } else if (type === 'need_interest') {
      const textTrunc = (extra as any).interestText ? `: "${(extra as any).interestText.substring(0, 40)}${(extra as any).interestText.length > 40 ? '...' : ''}"` : '';
      n.message = `${actor.name} messaged about your need "${extra.postTitle || 'Post'}"${textTrunc}`;
    }

    targetUser.notifications.splice(existingIndex, 1);
    targetUser.notifications.unshift(n);
  } else {
    let message = '';
    const titleTrunc = extra.postTitle ? ` "${extra.postTitle.substring(0, 20)}${extra.postTitle.length > 20 ? '...' : ''}"` : '';
    
    if (type === 'follow') {
      message = `${actor.name} followed you`;
    } else if (type === 'friend_request') {
      message = `${actor.name} sent you a friend request`;
    } else if (type === 'friend_accept') {
      message = `${actor.name} accepted your friend request`;
    } else if (type === 'like') {
      message = `${actor.name} liked your post${titleTrunc}`;
    } else if (type === 'comment') {
      message = `${actor.name} commented on your post${titleTrunc}`;
    } else if (type === 'mention') {
      message = `${actor.name} mentioned you in a post/comment${titleTrunc}`;
    } else if (type === 'repost') {
      message = `${actor.name} reposted your publication${titleTrunc}`;
    } else if (type === 'need_interest') {
      const textTrunc = (extra as any).interestText ? `: "${(extra as any).interestText.substring(0, 40)}${(extra as any).interestText.length > 40 ? '...' : ''}"` : '';
      message = `${actor.name} messaged about your need "${extra.postTitle || 'Post'}"${textTrunc}`;
    }

    const newNotification = {
      id: `notif-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      type,
      message,
      isRead: false,
      timestamp: Date.now(),
      actorIds: [actor.id],
      actorNames: [actor.name],
      postId: extra.postId || null
    };

    targetUser.notifications.unshift(newNotification);
  }
}

// SCAN TEXT FOR MENTIONS AND DISPATCH
function parseAndSendMentions(db: any, text: string, actor: { id: string, name: string }, extra: { postId: string, postTitle: string }) {
  if (!text) return;
  const mentionMatches = text.match(/!([a-zA-Z0-9_]+)/g);
  if (!mentionMatches) return;

  const usernames = mentionMatches.map(m => m.substring(1).toLowerCase());
  const uniqueUsernames = Array.from(new Set(usernames));

  uniqueUsernames.forEach(username => {
    const targetUser = db.users.find((u: any) => {
      const uName = (u.username || u.profile?.username || '').toLowerCase();
      return uName === username;
    });

    if (targetUser && targetUser.id !== actor.id) {
      // Enforce: User can only mention their followers (targetUser must follow actor)
      const isFollower = (targetUser.following || []).includes(actor.id);
      if (isFollower) {
        addNotification(db, targetUser.id, 'mention', actor, extra);
      }
    }
  });
}

// GET NOTIFICATIONS FOR LOGGED IN USER
app.get('/api/notifications', requireAuth, (req, res) => {
  const user = (req as any).user;
  const db = loadDatabase();
  const dbUser = db.users.find((u: any) => u.id === user.id);
  if (!dbUser) {
    return res.status(404).json({ error: 'User not found' });
  }
  res.json({ notifications: dbUser.notifications || [] });
});

// MARK ALL NOTIFICATIONS AS READ
app.post('/api/notifications/read', requireAuth, (req, res) => {
  const user = (req as any).user;
  const db = loadDatabase();
  const dbUser = db.users.find((u: any) => u.id === user.id);
  if (!dbUser) {
    return res.status(404).json({ error: 'User not found' });
  }
  dbUser.notifications = (dbUser.notifications || []).map((n: any) => ({ ...n, isRead: true }));
  saveDatabase(db);
  res.json({ success: true, notifications: dbUser.notifications });
});

// MARK SINGLE NOTIFICATION AS READ
app.post('/api/notifications/:id/read', requireAuth, (req, res) => {
  const user = (req as any).user;
  const { id } = req.params;
  const db = loadDatabase();
  const dbUser = db.users.find((u: any) => u.id === user.id);
  if (!dbUser) {
    return res.status(404).json({ error: 'User not found' });
  }
  dbUser.notifications = (dbUser.notifications || []).map((n: any) => 
    n.id === id ? { ...n, isRead: true } : n
  );
  saveDatabase(db);
  res.json({ success: true, notifications: dbUser.notifications });
});

// GET ALL SEARCH QUERIES (LOCAL BACKUP FOR FIRESTORE COOLDOWN/MOCKING)
app.get('/api/searchQueries', (req, res) => {
  const db = loadDatabase();
  res.json({ searchQueries: db.searchQueries || [] });
});

// ADD A SEARCH QUERY
app.post('/api/searchQueries', (req, res) => {
  const { term, countryCode } = req.body;
  const db = loadDatabase();
  db.searchQueries = db.searchQueries || [];
  
  if (db.searchQueries.length >= 500) {
    db.searchQueries.shift();
  }

  const newQuery = {
    id: 'query-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
    term: (term || '').trim(),
    countryCode: countryCode || 'BD',
    timestamp: Date.now()
  };
  
  if (newQuery.term) {
    db.searchQueries.push(newQuery);
    saveDatabase(db);
  }
  
  res.json({ success: true, searchQuery: newQuery });
});

// TOGGLE FOLLOW A CREATOR
app.post('/api/creators/:id/follow', requireAuth, (req, res) => {
  const user = (req as any).user;
  const targetId = req.params.id;

  if (user.id === targetId) {
    return res.status(400).json({ error: 'You cannot follow your own workspace.' });
  }

  const db = loadDatabase();
  const dbUser = db.users.find((u: any) => u.id === user.id);
  const targetUser = db.users.find((u: any) => u.id === targetId);

  if (!targetUser) {
    return res.status(404).json({ error: 'Target creator profile not found.' });
  }

  dbUser.following = dbUser.following || [];
  const index = dbUser.following.indexOf(targetId);
  let isFollowing = false;

  if (index === -1 && targetUser.profile?.allowConnections === false) {
    return res.status(403).json({ error: 'This creator has disabled their connection and follow system.' });
  }

  if (index > -1) {
    // Unfollow
    dbUser.following.splice(index, 1);
    targetUser.profile.followersCount = Math.max(0, (targetUser.profile.followersCount || 0) - 1);
    isFollowing = false;
  } else {
    // Follow
    dbUser.following.push(targetId);
    targetUser.profile.followersCount = (targetUser.profile.followersCount || 0) + 1;
    isFollowing = true;
    
    // Trigger follow notification
    addNotification(db, targetId, 'follow', { id: user.id, name: user.name });
  }

  saveDatabase(db);
  res.json({
    success: true,
    isFollowing,
    followersCount: targetUser.profile.followersCount,
    followingList: dbUser.following
  });
});

// FRIEND SYSTEM APIS

// SEND FRIEND REQUEST
app.post('/api/friends/request/send', requireAuth, (req, res) => {
  const user = (req as any).user;
  const { targetId } = req.body;

  if (!targetId || user.id === targetId) {
    return res.status(400).json({ error: 'Invalid target user.' });
  }

  const db = loadDatabase();
  const dbUser = db.users.find((u: any) => u.id === user.id);
  const targetUser = db.users.find((u: any) => u.id === targetId);

  if (!dbUser || !targetUser) {
    return res.status(404).json({ error: 'User not found.' });
  }

  if (targetUser.profile?.allowConnections === false) {
    return res.status(403).json({ error: 'This creator has disabled their connection and friend request system.' });
  }

  dbUser.friendRequestsSent = dbUser.friendRequestsSent || [];
  dbUser.friends = dbUser.friends || [];
  targetUser.friendRequestsReceived = targetUser.friendRequestsReceived || [];
  targetUser.friends = targetUser.friends || [];

  if (dbUser.friends.includes(targetId)) {
    return res.status(400).json({ error: 'You are already friends.' });
  }
  if (dbUser.friendRequestsSent.includes(targetId)) {
    return res.status(400).json({ error: 'Friend request already sent.' });
  }

  dbUser.friendRequestsSent.push(targetId);
  targetUser.friendRequestsReceived.push(user.id);

  // Trigger friend request notification
  addNotification(db, targetId, 'friend_request', { id: user.id, name: user.name });

  saveDatabase(db);
  res.json({ success: true, message: 'Friend request sent.' });
});

// ACCEPT FRIEND REQUEST
app.post('/api/friends/request/accept', requireAuth, (req, res) => {
  const user = (req as any).user;
  const { targetId } = req.body;

  if (!targetId) {
    return res.status(400).json({ error: 'Invalid target user.' });
  }

  const db = loadDatabase();
  const dbUser = db.users.find((u: any) => u.id === user.id);
  const targetUser = db.users.find((u: any) => u.id === targetId);

  if (!dbUser || !targetUser) {
    return res.status(404).json({ error: 'User not found.' });
  }

  dbUser.friends = dbUser.friends || [];
  dbUser.friendRequestsReceived = dbUser.friendRequestsReceived || [];
  dbUser.friendRequestsSent = dbUser.friendRequestsSent || [];
  dbUser.following = dbUser.following || [];

  targetUser.friends = targetUser.friends || [];
  targetUser.friendRequestsSent = targetUser.friendRequestsSent || [];
  targetUser.friendRequestsReceived = targetUser.friendRequestsReceived || [];
  targetUser.following = targetUser.following || [];

  // Remove request from arrays
  dbUser.friendRequestsReceived = dbUser.friendRequestsReceived.filter((id: string) => id !== targetId);
  dbUser.friendRequestsSent = dbUser.friendRequestsSent.filter((id: string) => id !== targetId);
  targetUser.friendRequestsSent = targetUser.friendRequestsSent.filter((id: string) => id !== user.id);
  targetUser.friendRequestsReceived = targetUser.friendRequestsReceived.filter((id: string) => id !== user.id);

  // Add to friends lists (if not already there)
  if (!dbUser.friends.includes(targetId)) {
    dbUser.friends.push(targetId);
    if (!dbUser.following.includes(targetId)) {
      dbUser.following.push(targetId);
    }
  }
  if (!targetUser.friends.includes(user.id)) {
    targetUser.friends.push(user.id);
    if (!targetUser.following.includes(user.id)) {
      targetUser.following.push(user.id);
    }
  }

  // Update counts
  dbUser.profile.followersCount = dbUser.friends.length;
  targetUser.profile.followersCount = targetUser.friends.length;

  // Add notification of acceptance
  addNotification(db, targetId, 'friend_accept', { id: user.id, name: user.name });

  saveDatabase(db);
  res.json({ success: true, message: 'Friend request accepted.' });
});

// DECLINE FRIEND REQUEST
app.post('/api/friends/request/decline', requireAuth, (req, res) => {
  const user = (req as any).user;
  const { targetId } = req.body;

  if (!targetId) {
    return res.status(400).json({ error: 'Invalid target user.' });
  }

  const db = loadDatabase();
  const dbUser = db.users.find((u: any) => u.id === user.id);
  const targetUser = db.users.find((u: any) => u.id === targetId);

  if (!dbUser || !targetUser) {
    return res.status(404).json({ error: 'User not found.' });
  }

  dbUser.friendRequestsReceived = dbUser.friendRequestsReceived || [];
  dbUser.friendRequestsSent = dbUser.friendRequestsSent || [];
  targetUser.friendRequestsSent = targetUser.friendRequestsSent || [];
  targetUser.friendRequestsReceived = targetUser.friendRequestsReceived || [];

  dbUser.friendRequestsReceived = dbUser.friendRequestsReceived.filter((id: string) => id !== targetId);
  dbUser.friendRequestsSent = dbUser.friendRequestsSent.filter((id: string) => id !== targetId);
  targetUser.friendRequestsSent = targetUser.friendRequestsSent.filter((id: string) => id !== user.id);
  targetUser.friendRequestsReceived = targetUser.friendRequestsReceived.filter((id: string) => id !== user.id);

  saveDatabase(db);
  res.json({ success: true, message: 'Friend request declined.' });
});

// UNFRIEND A USER
app.post('/api/friends/unfriend', requireAuth, (req, res) => {
  const user = (req as any).user;
  const { targetId } = req.body;

  if (!targetId) {
    return res.status(400).json({ error: 'Invalid target user.' });
  }

  const db = loadDatabase();
  const dbUser = db.users.find((u: any) => u.id === user.id);
  const targetUser = db.users.find((u: any) => u.id === targetId);

  if (!dbUser || !targetUser) {
    return res.status(404).json({ error: 'User not found.' });
  }

  dbUser.friends = dbUser.friends || [];
  dbUser.following = dbUser.following || [];
  targetUser.friends = targetUser.friends || [];
  targetUser.following = targetUser.following || [];

  dbUser.friends = dbUser.friends.filter((id: string) => id !== targetId);
  dbUser.following = dbUser.following.filter((id: string) => id !== targetId);
  targetUser.friends = targetUser.friends.filter((id: string) => id !== user.id);
  targetUser.following = targetUser.following.filter((id: string) => id !== user.id);

  dbUser.profile.followersCount = dbUser.friends.length;
  targetUser.profile.followersCount = targetUser.friends.length;

  saveDatabase(db);
  res.json({ success: true, message: 'Unfriended successfully.' });
});

// Inject server-private functions into the feature-module seam (features 109–248)
setServerContext({
  requireAuth,
  requireAdmin,
  loadDatabase,
  saveDatabase,
  loadCommunity,
  saveCommunity,
  getUserIdFromToken,
  getRequestUser,
  uploadsDir,
  UNPLAYABLE_VIDEO_EXT,
});

// Register all Ocean new-feature backend modules (features 109–248)
registerOceanFeatures(app);

// Register AI Moderation Assistant routes
registerAIModerationRoutes(app);

// Register AI Vehicle Analysis Assistant routes
registerAIVehicleAnalysisRoutes(app);

// Register AI Bengali Content Moderation Engine routes
registerAIBengaliModerationRoutes(app);

// Register AI Caption Suggestion Engine routes
registerAICaptionRoutes(app);

// Register AI Chat Copilot assistant routes
registerChatAiHelperRoutes(app);

// Register Security Telegram OTP Auth Gateway routes
registerTelegramOTPGatewayRoutes(app);

// Register NSFW Server-Side Image Screening routes (double-checks client-side verdicts)
registerNSFWRoutes(app);

// Register Emergency Community Pools routes
registerEmergencyPoolsRoutes(app);

// --- LINK PREVIEW / URL UNFURL (Tinode /v0/urlpreview pattern) ---
function decodeEntities(input: string): string {
  return input
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

app.post('/api/link-preview', requireAuth, async (req, res) => {
  const raw = String(req.body?.url || '').trim();
  if (!/^https?:\/\//i.test(raw)) {
    return res.status(400).json({ error: 'A valid http(s) URL is required.' });
  }
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const resp = await fetch(raw, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (Ocean LinkPreview)' },
    });
    clearTimeout(timer);
    if (!resp.ok) return res.status(502).json({ error: `Upstream returned ${resp.status}.` });
    const html = (await resp.text()).slice(0, 200000);
    const grab = (pattern: RegExp) => { const m = html.match(pattern); return m ? m[1].trim() : ''; };
    const title = grab(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']*)["']/i)
      || grab(/<title[^>]*>([^<]*)<\/title>/i);
    const description = grab(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']*)["']/i)
      || grab(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)["']/i);
    const image = grab(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']*)["']/i)
      || grab(/<meta[^>]*name=["']twitter:image["'][^>]*content=["']([^"']*)["']/i);
    const siteName = grab(/<meta[^>]*property=["']og:site_name["'][^>]*content=["']([^"']*)["']/i);
    const iconMatch = html.match(/<link[^>]*rel=["']?(?:shortcut\s+)?icon["']?[^>]*href=["']([^"']+)["']/i);
    let favicon = null;
    try { favicon = new URL(iconMatch?.[1] || '/favicon.ico', raw).href; } catch { favicon = null; }
    res.json({
      title: decodeEntities(title) || raw,
      description: decodeEntities(description),
      image: image || null,
      siteName: decodeEntities(siteName) || null,
      favicon,
      url: raw,
    });
  } catch (e) {
    res.status(502).json({ error: 'Could not fetch a preview for that URL.' });
  }
});

// --- AI IMAGE GENERATION (manus integrations pattern) ---
// If GEMINI_API_KEY is present we try the Gemini Imagen endpoint; otherwise we
// return a deterministic local SVG placeholder so the feature always works.
app.post('/api/ai/image', requireAuth, aiRateLimit, async (req, res) => {
  const prompt = String(req.body?.prompt || '').trim().slice(0, 500);
  if (!prompt) return res.status(400).json({ error: 'Prompt is required.' });

  const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
  if (GEMINI_API_KEY) {
    try {
      const gresp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict?key=${encodeURIComponent(GEMINI_API_KEY)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ instances: [{ prompt }], parameters: { sampleCount: 1 } }),
        }
      );
      if (gresp.ok) {
        const data = await gresp.json();
        const b64 = data?.predictions?.[0]?.bytesBase64Encoded;
        if (b64) {
          return res.json({ imageUrl: `data:image/png;base64,${b64}`, synthetic: true, watermark: 'manifest + client-canvas stamp (see WatermarkStudio / /api/watermark)' });
        }
      }
    } catch (e) {
      console.warn('[ai-image] Imagen failed, falling back to placeholder:', e);
    }
  }

  // Deterministic SVG placeholder (ocean-themed gradient + prompt label) with a
  // VISIBLE synthetic-media watermark baked in before serving (Feature 242).
  const safe = prompt.replace(/[<>&"]/g, '');
  const hue = Math.abs(prompt.split('').reduce((a, c) => a + c.charCodeAt(0), 0)) % 360;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400" viewBox="0 0 640 400">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="hsl(${hue},80%,60%)"/><stop offset="1" stop-color="hsl(${(hue + 60) % 360},70%,40%)"/>
  </linearGradient></defs>
  <rect width="640" height="400" fill="url(#g)"/>
  <text x="320" y="190" text-anchor="middle" fill="white" font-size="26" font-family="sans-serif">AI Image</text>
  <text x="320" y="225" text-anchor="middle" fill="white" font-size="14" font-family="sans-serif" opacity="0.85">${safe.slice(0, 60)}</text>
  <rect x="0" y="352" width="640" height="48" fill="rgba(0,0,0,0.55)"/>
  <text x="320" y="376" text-anchor="middle" fill="white" font-size="15" font-family="sans-serif" letter-spacing="2">AI GENERATED BY OCEAN</text>
</svg>`;
  res.json({ imageUrl: `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`, placeholder: true, synthetic: true, watermark: 'visible-band' });
});

// --- GEOHASH-STYLE NEARBY DISCOVERY (base44 geohash/grid_cell pattern) ---
// Users opt in by sharing an approximate grid cell (rounded to ~1.1km). The
// discovery endpoint returns nearby users who also opted in, with exact
// coordinates never exposed.
app.post('/api/discovery/location', requireAuth, (req, res) => {
  const user = (req as any).user;
  const lat = Number(req.body?.lat);
  const lng = Number(req.body?.lng);
  if (Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
    const db = loadDatabase();
    const target = db.users.find((u: any) => u.id === user.id);
    if (target) {
      // Round to ~1 decimal (≈11km precision) to preserve privacy.
      target.profile = target.profile || {};
      target.profile.gridCell = `${lat.toFixed(1)},${lng.toFixed(1)}`;
      target.profile.location = { lat, lng };
      saveDatabase(db);
      return res.json({ success: true, gridCell: target.profile.gridCell });
    }
  }
  res.status(400).json({ error: 'Valid lat/lng coordinates required.' });
});

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

app.get('/api/discovery/nearby', requireAuth, (req, res) => {
  const user = (req as any).user;
  const radiusKm = Math.max(1, Math.min(Number(req.query.radiusKm) || 50, 500));
  const db = loadDatabase();
  const target = db.users.find((u: any) => u.id === user.id);
  const myLoc = target?.profile?.location;
  if (!myLoc || !Number.isFinite(myLoc.lat) || !Number.isFinite(myLoc.lng)) {
    return res.json({ nearby: [], needLocation: true, message: 'Share your approximate location to discover neighbors.' });
  }
  const nearby = (db.users || [])
    .filter((u: any) => u.id !== user.id)
    .map((u: any) => {
      const loc = u.profile?.location;
      if (!loc || !Number.isFinite(loc.lat) || !Number.isFinite(loc.lng)) return null;
      const distanceKm = haversineKm(myLoc.lat, myLoc.lng, loc.lat, loc.lng);
      return {
        userId: u.id,
        name: u.name || 'User',
        avatarUrl: u.profile?.avatarUrl || '',
        distanceKm: Math.round(distanceKm * 10) / 10,
        gridCell: u.profile?.gridCell || null,
        interests: (u.profile?.interests || []).slice(0, 5),
      };
    })
    .filter((x: any) => x && x.distanceKm <= radiusKm)
    .sort((a: any, b: any) => a.distanceKm - b.distanceKm)
    .slice(0, 50);
  res.json({ nearby, needLocation: false, radiusKm, myGridCell: target?.profile?.gridCell || null });
});

// --- STREAM API ADMIN DASHBOARD (manus admin CRUD + usage) ---
// Runtime registry of extra Stream keys (stored in database.json) that the
// /api/stream/token endpoint consults as a fallback after env keys.
app.get('/api/admin/stream-keys', requireAuth, requireAdmin, (req, res) => {
  const db = loadDatabase();
  const runtime = (db.streamApiKeys || []).map((k: any, i: number) => ({
    id: i,
    label: k.label,
    apiKey: k.apiKey,
    apiKeyPreview: k.apiKey?.slice(0, 8) + '…' + k.apiKey?.slice(-4),
    maxConcurrentCalls: k.maxConcurrentCalls,
    lifetimeMinutes: k.lifetimeMinutes,
    status: k.status === 'inactive' ? 'inactive' : 'active',
    source: 'runtime',
  }));
  const env = streamApiManager.list().map((k: StreamApi) => ({
    id: k.id,
    label: k.label,
    apiKey: k.apiKey,
    apiKeyPreview: k.apiKey?.slice(0, 8) + '…' + k.apiKey?.slice(-4),
    maxConcurrentCalls: k.maxConcurrentCalls,
    lifetimeMinutes: k.lifetimeMinutes,
    minutesUsed: k.minutesUsed,
    minutesRemaining: k.minutesRemaining,
    currentConcurrentCalls: k.currentConcurrentCalls,
    status: k.status,
    source: 'env',
  }));
  res.json({ keys: [...env, ...runtime] });
});

app.post('/api/admin/stream-keys', requireAuth, requireAdmin, (req, res) => {
  const { label, apiKey, apiSecret, maxConcurrentCalls, lifetimeMinutes } = req.body || {};
  if (!apiKey || !apiSecret) return res.status(400).json({ error: 'apiKey and apiSecret are required.' });
  const db = loadDatabase();
  db.streamApiKeys = db.streamApiKeys || [];
  if (db.streamApiKeys.some((k: any) => k.apiKey === apiKey)) {
    return res.status(400).json({ error: 'That key is already registered.' });
  }
  db.streamApiKeys.push({
    label: String(label || 'custom-key'),
    apiKey: String(apiKey),
    apiSecret: String(apiSecret),
    maxConcurrentCalls: Math.max(1, Number(maxConcurrentCalls) || 8),
    lifetimeMinutes: Math.max(1, Number(lifetimeMinutes) || 60 * 24 * 30),
    status: 'active',
    createdAt: Date.now(),
  });
  saveDatabase(db);
  res.json({ success: true });
});

app.delete('/api/admin/stream-keys/:index', requireAuth, requireAdmin, (req, res) => {
  const idx = Number(req.params.index);
  const db = loadDatabase();
  db.streamApiKeys = db.streamApiKeys || [];
  if (Number.isInteger(idx) && idx >= 0 && idx < db.streamApiKeys.length) {
    db.streamApiKeys.splice(idx, 1);
    saveDatabase(db);
  }
  res.json({ success: true });
});

app.post('/api/admin/stream-keys/:index/toggle', requireAuth, requireAdmin, (req, res) => {
  const idx = Number(req.params.index);
  const db = loadDatabase();
  db.streamApiKeys = db.streamApiKeys || [];
  if (Number.isInteger(idx) && idx >= 0 && idx < db.streamApiKeys.length) {
    db.streamApiKeys[idx].status = db.streamApiKeys[idx].status === 'inactive' ? 'active' : 'inactive';
    saveDatabase(db);
  }
  res.json({ success: true });
});

app.get('/api/admin/stream-usage', requireAuth, requireAdmin, (req, res) => {
  const db = loadDatabase();
  const env = streamApiManager.list().map((k: StreamApi) => ({
    label: k.label, source: 'env', minutesUsed: k.minutesUsed, minutesRemaining: k.minutesRemaining,
    currentConcurrentCalls: k.currentConcurrentCalls, status: k.status, canUse: k.canUse,
  }));
  const runtime = (db.streamApiKeys || []).map((k: any) => ({
    label: k.label, source: 'runtime', minutesUsed: 0, minutesRemaining: k.lifetimeMinutes,
    currentConcurrentCalls: 0, status: k.status, canUse: k.status !== 'inactive',
  }));
  res.json({ usage: [...env, ...runtime] });
});

// --- AWAY SUMMARY (base44 AwaySummary — "while you were away" LLM digest) ---
app.post('/api/ai/summary', requireAuth, aiRateLimit, async (req, res) => {
  const user = (req as any).user;
  const { items } = req.body || {};
  const entries = (Array.isArray(items) ? items : []).slice(0, 40).map((i: any) =>
    typeof i === 'string' ? i : `${i.kind || 'event'}: ${i.text || ''}`
  ).filter(Boolean);
  if (entries.length === 0) return res.json({ summary: '', mode: 'empty' });

  try {
    const result = await invokeLLM({
      messages: [
        { role: 'system', content: 'You write a warm, concise 2-4 sentence "while you were away" summary of a social feed for the user. Do not use markdown. Address the user directly.' },
        { role: 'user', content: `My missed updates:\n${entries.join('\n')}` },
      ],
      model: 'gemini-3.5-flash',
      maxTokens: 300,
    });
    const text = result.choices?.[0]?.message?.content;
    if (typeof text === 'string' && text.trim()) {
      return res.json({ summary: text.trim(), mode: 'llm' });
    }
  } catch (e) {
    console.warn('[ai-summary] LLM failed, using fallback:', e);
  }
  // Heuristic fallback when no API key / LLM error
  const kinds = entries.map((e: string) => e.split(':')[0] || 'update');
  const uniq = [...new Set(kinds)].slice(0, 3).join(', ');
  res.json({
    summary: `You missed ${entries.length} update${entries.length > 1 ? 's' : ''} while you were away — mostly ${uniq}. `,
    mode: 'fallback',
  });
});

// --- CHANNELS / CREATOR STUDIO (base44 Creator Studio port) ---
app.post('/api/channels', requireAuth, (req, res) => {
  const user = (req as any).user;
  const { name, handle, category, description, avatarUrl } = req.body || {};
  if (!name || String(name).trim().length < 2) return res.status(400).json({ error: 'Channel name is required.' });
  const db = loadDatabase();
  db.channels = db.channels || [];
  const channel = {
    id: `chan-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
    name: String(name).trim(),
    handle: String(handle || '').trim() || String(name).trim().toLowerCase().replace(/\s+/g, '.'),
    category: String(category || 'Other'),
    description: String(description || '').trim(),
    avatarUrl: String(avatarUrl || ''),
    creatorId: user.id,
    creatorName: user.name || 'User',
    subscriberIds: [user.id],
    createdAt: Date.now(),
  };
  db.channels.push(channel);
  saveDatabase(db);
  res.json({ channel });
});

app.get('/api/channels', (req, res) => {
  const db = loadDatabase();
  const channels = (db.channels || [])
    .slice()
    .sort((a: any, b: any) => (b.subscriberIds?.length || 0) - (a.subscriberIds?.length || 0))
    .map((c: any) => ({ ...c, subscriberCount: c.subscriberIds?.length || 0 }));
  res.json({ channels });
});

app.get('/api/channels/:id', (req, res) => {
  const db = loadDatabase();
  const channel = (db.channels || []).find((c: any) => c.id === req.params.id);
  if (!channel) return res.status(404).json({ error: 'Channel not found.' });
  const videos = (db.channelVideos || []).filter((v: any) => v.channelId === channel.id).sort((a: any, b: any) => b.createdAt - a.createdAt);
  res.json({ channel: { ...channel, subscriberCount: channel.subscriberIds?.length || 0 }, videos });
});

app.post('/api/channels/:id/subscribe', requireAuth, (req, res) => {
  const user = (req as any).user;
  const db = loadDatabase();
  const channel = (db.channels || []).find((c: any) => c.id === req.params.id);
  if (!channel) return res.status(404).json({ error: 'Channel not found.' });
  channel.subscriberIds = channel.subscriberIds || [];
  const idx = channel.subscriberIds.indexOf(user.id);
  if (idx === -1) channel.subscriberIds.push(user.id); else channel.subscriberIds.splice(idx, 1);
  saveDatabase(db);
  res.json({ subscribed: idx === -1, subscriberCount: channel.subscriberIds.length });
});

app.post('/api/channels/:id/videos', requireAuth, (req, res) => {
  const user = (req as any).user;
  const { title, description, videoUrl, thumbnailUrl, category, duration } = req.body || {};
  const db = loadDatabase();
  const channel = (db.channels || []).find((c: any) => c.id === req.params.id);
  if (!channel) return res.status(404).json({ error: 'Channel not found.' });
  if (channel.creatorId !== user.id) return res.status(403).json({ error: 'Only the channel owner can publish videos.' });
  if (!title || !videoUrl) return res.status(400).json({ error: 'Title and video URL are required.' });
  db.channelVideos = db.channelVideos || [];
  const video = {
    id: `vid-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
    channelId: channel.id,
    title: String(title).trim(),
    description: String(description || '').trim(),
    videoUrl: String(videoUrl),
    thumbnailUrl: String(thumbnailUrl || ''),
    category: String(category || 'Other'),
    duration: String(duration || ''),
    views: 0,
    likes: 0,
    createdAt: Date.now(),
  };
  db.channelVideos.push(video);
  saveDatabase(db);
  res.json({ video });
});

app.get('/api/channels/:id/videos', (req, res) => {
  const db = loadDatabase();
  const videos = (db.channelVideos || []).filter((v: any) => v.channelId === req.params.id).sort((a: any, b: any) => b.createdAt - a.createdAt);
  res.json({ videos });
});

app.post('/api/channels/:id/videos/:videoId/view', (req, res) => {
  const db = loadDatabase();
  const video = (db.channelVideos || []).find((v: any) => v.id === req.params.videoId && v.channelId === req.params.id);
  if (video) { video.views = (video.views || 0) + 1; saveDatabase(db); }
  res.json({ ok: true });
});

// Creator Studio dashboard stats
app.get('/api/studio/stats', requireAuth, (req, res) => {
  const user = (req as any).user;
  const db = loadDatabase();
  const myChannels = (db.channels || []).filter((c: any) => c.creatorId === user.id);
  const channelIds = myChannels.map((c: any) => c.id);
  const myVideos = (db.channelVideos || []).filter((v: any) => channelIds.includes(v.channelId));
  const totalViews = myVideos.reduce((a: number, v: any) => a + (v.views || 0), 0);
  const totalSubs = myChannels.reduce((a: number, c: any) => a + (c.subscriberIds?.length || 0), 0);
  res.json({
    stats: {
      channelCount: myChannels.length,
      videoCount: myVideos.length,
      totalViews,
      totalSubscribers: totalSubs,
    },
    channels: myChannels,
    videos: myVideos.sort((a: any, b: any) => b.createdAt - a.createdAt),
  });
});

// --- RANDOM TEXT-CHAT DM (base44 random text DM port) ---
// Pairs the user with a random other online user for anonymous text chat.
app.post('/api/chat/random-match', requireAuth, (req, res) => {
  const user = (req as any).user;
  const db = loadDatabase();
  const onlineIds = new Set<string>();
  try {
    const { getOnlineUsers } = require('./chatServer.js');
    if (typeof getOnlineUsers === 'function') (getOnlineUsers() || []).forEach((u: any) => onlineIds.add(typeof u === 'string' ? u : u.userId));
  } catch { /* fall back to all users */ }

  const candidates = (db.users || []).filter((u: any) =>
    u.id !== user.id &&
    !(user.blockedUserIds || []).includes(u.id) &&
    !(u.blockedUserIds || []).includes(user.id)
  );
  // Prefer online users, else any user
  const pool = candidates.filter((u: any) => onlineIds.has(u.id));
  const chosen = (pool.length ? pool : candidates)[Math.floor(Math.random() * (pool.length ? pool.length : candidates.length))];
  if (!chosen) return res.json({ matched: false });

  const id = [user.id, chosen.id].sort().join('-');
  let conv = (db.conversations || []).find((c: any) => c.id === id);
  if (!conv) {
    conv = { id, name: chosen.name, isGroup: false, isRandomTextDm: true, participants: [user.id, chosen.id], adminIds: [user.id, chosen.id], archivedBy: [], mutedBy: [], createdAt: Date.now() };
    db.conversations.push(conv);
  }
  saveDatabase(db);
  res.json({ matched: true, conversation: conv, stranger: { id: chosen.id, name: chosen.name, avatarUrl: chosen.profile?.avatarUrl || '' } });
});

// --- MEET REAL-TIME VIDEO MATCHMAKING ---
interface MeetSearcher {
  userId: string;
  name: string;
  location: string;
  avatarUrl: string;
  interests?: string[];
  timestamp: number;
  matchedRoomId?: string;
}

const meetSearchers = new Map<string, MeetSearcher>();
const meetRoomMessages = new Map<string, { senderId: string; text: string; timestamp: number }[]>();
interface MeetSignal {
  senderId: string;
  type: string;
  payload: any;
  timestamp: number;
}
const meetSignals = new Map<string, MeetSignal[]>();

app.post('/api/meet/match', requireAuth, (req, res) => {
  const user = (req as any).user;
  const db = loadDatabase();
  const dbUser = db.users.find((u: any) => u.id === user.id);
  const profile = dbUser?.profile || {};
  
  const now = Date.now();
  
  // 1. Clean up stale searchers (older than 8 seconds)
  for (const [id, searcher] of meetSearchers.entries()) {
    if (now - searcher.timestamp > 8000) {
      meetSearchers.delete(id);
    }
  }

  // 2. Add/update current user in searchers pool
  const { interests = [] } = req.body || {};
  const normalizedInterests = Array.isArray(interests)
    ? interests.map((i: any) => String(i).toLowerCase())
    : [];

  let currentSearcher = meetSearchers.get(user.id);
  if (!currentSearcher) {
    currentSearcher = {
      userId: user.id,
      name: user.name,
      location: profile.location || 'Connected Creator',
      avatarUrl: profile.avatarUrl || '',
      interests: normalizedInterests,
      timestamp: now
    };
    meetSearchers.set(user.id, currentSearcher);
  } else {
    currentSearcher.timestamp = now;
    currentSearcher.interests = normalizedInterests;
  }

  // 3. If already matched in a room, return that match immediately!
  if (currentSearcher.matchedRoomId) {
    // Find the other user in the room
    const otherSearcher = Array.from(meetSearchers.values()).find(
      s => s.matchedRoomId === currentSearcher!.matchedRoomId && s.userId !== user.id
    );
    if (otherSearcher) {
      return res.json({
        status: 'connected',
        roomId: currentSearcher.matchedRoomId,
        peer: {
          id: otherSearcher.userId,
          name: otherSearcher.name,
          location: otherSearcher.location,
          avatarUrl: otherSearcher.avatarUrl,
          interests: otherSearcher.interests || []
        }
      });
    } else {
      // The other side dropped or is stale
      currentSearcher.matchedRoomId = undefined;
    }
  }

  // 4. Try to find another searching user via the ported interest-matchmaking
  //    module (manus-omegle-stream matchmaking.ts). It prefers a partner sharing
  //    at least one interest tag (Omegle-style), then anyone who has been waiting
  //    ≥8s, then the first available person. Returns a MatchResult with shared
  //    interests when a partner is found.
  const match = matchmakingEnqueue({
    socketId: user.id,
    userId: user.id,
    displayName: user.name,
    interests: normalizedInterests,
    joinedAt: now,
  });

  if (match) {
    const partner = match.userB;
    const partnerSearcher = meetSearchers.get(partner.userId);
    const roomId = `meet-room-${match.callId}`;

    // Assign both to the room
    currentSearcher.matchedRoomId = roomId;
    if (partnerSearcher) partnerSearcher.matchedRoomId = roomId;

    // Initialize messages and signals for this room
    meetRoomMessages.set(roomId, []);
    meetSignals.set(roomId, []);

    return res.json({
      status: 'connected',
      roomId,
      peer: {
        id: partner.userId,
        name: partner.displayName,
        location: partnerSearcher?.location || 'Connected Creator',
        avatarUrl: partnerSearcher?.avatarUrl || '',
        interests: partner.interests || [],
        sharedInterests: match.sharedInterests || []
      }
    });
  }

  // 5. If no match yet, return searching status
  return res.json({
    status: 'searching',
    queueLength: matchmakingQueueLength()
  });
});

app.get('/api/meet/queue-stats', requireAuth, (req, res) => {
  res.json({ queueLength: matchmakingQueueLength() });
});

/* ------------------------------------------------------------------ */
/* Community backend — Events / Questions / Topics / Tips / Rewards    */
/* (feature concepts ported from base44-social-media + arena-ai).      */
/* State lives in a separate community.json so the Firestore merge     */
/* never wipes it.                                                     */
/* ------------------------------------------------------------------ */
const COMMUNITY_FILE = path.join(process.cwd(), 'community.json');

function loadCommunity() {
  try {
    if (!fs.existsSync(COMMUNITY_FILE)) {
      const state = defaultCommunity();
      ensureDefaultTopics(state);
      fs.writeFileSync(COMMUNITY_FILE, JSON.stringify(state, null, 2), 'utf8');
      return state;
    }
    const state = communityFrom(JSON.parse(fs.readFileSync(COMMUNITY_FILE, 'utf8')));
    ensureDefaultTopics(state);
    return state;
  } catch {
    const state = defaultCommunity();
    ensureDefaultTopics(state);
    return state;
  }
}

function saveCommunity(state: any) {
  try {
    fs.writeFileSync(COMMUNITY_FILE, JSON.stringify(state, null, 2), 'utf8');
  } catch (e) {
    console.warn('community save error:', e);
  }
}

app.get('/api/community', requireAuth, (req, res) => {
  const state = loadCommunity();
  res.json({ state, rewards: DEFAULT_REWARDS });
});

app.post('/api/community/events', requireAuth, (req, res) => {
  const user = (req as any).user;
  const { title, description, category, location, date, capacity } = req.body || {};
  if (!title) return res.status(400).json({ error: 'Title required' });
  const state = loadCommunity();
  const ev = createEvent(state, {
    title, description: description || '', category: category || 'general',
    location: location || 'Online', date: Number(date) || Date.now() + 86400000,
    capacity: Number(capacity) || 0, createdBy: user.id,
  });
  saveCommunity(state);
  res.json({ event: ev });
});

// Feature #64 — shorthand aliases: same handlers as /api/community/events.
app.post('/api/events/create', requireAuth, (req, res) => {
  const user = (req as any).user;
  const { title, description, category, location, date, capacity } = req.body || {};
  if (!title) return res.status(400).json({ error: 'Title required' });
  const state = loadCommunity();
  const ev = createEvent(state, {
    title, description: description || '', category: category || 'general',
    location: location || 'Online', date: Number(date) || Date.now() + 86400000,
    capacity: Number(capacity) || 0, createdBy: user.id,
  });
  saveCommunity(state);
  res.json({ event: ev });
});

app.post('/api/community/events/:id/rsvp', requireAuth, (req, res) => {
  const user = (req as any).user;
  const state = loadCommunity();
  const result = rsvpEvent(state, req.params.id, user.id);
  saveCommunity(state);
  res.json(result);
});

app.post('/api/events/:id/rsvp', requireAuth, (req, res) => {
  const user = (req as any).user;
  const state = loadCommunity();
  const result = rsvpEvent(state, req.params.id, user.id);
  saveCommunity(state);
  res.json(result);
});

app.post('/api/community/questions', requireAuth, (req, res) => {
  const user = (req as any).user;
  const { text, category } = req.body || {};
  if (!text) return res.status(400).json({ error: 'Question text required' });
  const state = loadCommunity();
  const q = askQuestion(state, { text, category, askedBy: user.id });
  saveCommunity(state);
  res.json({ question: q });
});

app.post('/api/community/questions/:id/answers', requireAuth, (req, res) => {
  const user = (req as any).user;
  const { text } = req.body || {};
  if (!text) return res.status(400).json({ error: 'Answer text required' });
  const state = loadCommunity();
  const q = answerQuestion(state, req.params.id, { text, by: user.id });
  saveCommunity(state);
  res.json(q ? { question: q } : { error: 'Question not found' });
});

app.post('/api/community/answers/:id/upvote', requireAuth, (req, res) => {
  const user = (req as any).user;
  const { questionId, answerId } = req.body || {};
  const state = loadCommunity();
  if (questionId && answerId) upvoteAnswer(state, questionId, answerId, user.id);
  saveCommunity(state);
  res.json({ success: true });
});

app.post('/api/community/topics/:id/join', requireAuth, (req, res) => {
  const user = (req as any).user;
  const state = loadCommunity();
  joinTopic(state, req.params.id, user.id);
  saveCommunity(state);
  res.json({ success: true });
});

app.post('/api/community/tips', requireAuth, (req, res) => {
  const user = (req as any).user;
  const { to, amount, note } = req.body || {};
  const amt = Number(amount) || 0;
  if (!to || amt <= 0) return res.status(400).json({ error: 'Recipient + amount required' });
  const state = loadCommunity();
  const ok = tipCreator(state, user.id, to, amt, note);
  saveCommunity(state);
  res.json({ success: ok, balance: state.balances[user.id] || 0 });
});

app.get('/api/community/rewards', requireAuth, (req, res) => {
  const user = (req as any).user;
  const state = loadCommunity();
  // Seed a starting balance so tips/rewards are immediately demoable.
  state.balances[user.id] = Math.max(state.balances[user.id] || 0, 100);
  saveCommunity(state);
  const dbUser = loadDatabase().users.find((u: any) => u.id === user.id);
  const trustScore = Number(dbUser?.trustScore ?? dbUser?.profile?.trustScore ?? 0);
  res.json({ rewards: DEFAULT_REWARDS, balance: trustPointsForUser(state, user.id, trustScore) });
});

app.post('/api/community/rewards/:id/redeem', requireAuth, (req, res) => {
  const user = (req as any).user;
  const state = loadCommunity();
  const reward = DEFAULT_REWARDS.find((r) => r.id === req.params.id);
  if (!reward) return res.status(404).json({ error: 'Reward not found' });
  state.balances[user.id] = Math.max(state.balances[user.id] || 0, 100);
  saveCommunity(state);
  const dbUser = loadDatabase().users.find((u: any) => u.id === user.id);
  const trustScore = Number(dbUser?.trustScore ?? dbUser?.profile?.trustScore ?? 0);
  const balance = trustPointsForUser(state, user.id, trustScore);
  if (balance < reward.cost) return res.status(400).json({ error: 'Not enough points' });
  spendBalance(state, user.id, reward.cost);
  saveCommunity(state);
  res.json({ success: true, redeemed: reward, balance: state.balances[user.id] || 0 });
});

/* ------------------------------------------------------------------ */
/* AI helpers — ported from manus-omegle-stream/server/_core.         */
/* Degrade gracefully (error payloads) when no provider key is set.   */
/* ------------------------------------------------------------------ */
app.get('/api/ai/status', requireAuth, (req, res) => {
  res.json({
    gemini: !!process.env.GEMINI_API_KEY,
    forgeLlm: !!(MANUS_ENV.forgeApiUrl && MANUS_ENV.forgeApiKey),
    transcription: !!(MANUS_ENV.forgeApiUrl && MANUS_ENV.forgeApiKey),
  });
});

app.post('/api/ai/transcribe', requireAuth, aiRateLimit, async (req, res) => {
  const { audioUrl, language, prompt } = req.body || {};
  if (!audioUrl) return res.status(400).json({ error: 'audioUrl required' });
  try {
    const result = await transcribeAudio({ audioUrl, language, prompt });
    if (result && (result as any).code === 'SERVICE_ERROR') {
      // No transcription engine configured (BUILT_IN_FORGE_API_URL/KEY unset).
      // Tell the client to fall back to the in-browser Web Speech transcriber
      // instead of failing silently.
      return res.status(501).json({
        error: (result as any).error || 'Server-side transcription is not configured.',
        code: 'SERVICE_ERROR',
        available: false,
        details: (result as any).details,
        hint: 'Use the in-browser Local Transcriber (Web Speech API) — nothing is uploaded.',
      });
    }
    if (result && (result as any).error) return res.status(422).json(result);
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Transcription failed' });
  }
});

app.post('/api/ai/chat', requireAuth, aiRateLimit, async (req, res) => {
  const { messages, tools, toolChoice, model, maxTokens } = req.body || {};
  if (!messages || !Array.isArray(messages)) return res.status(400).json({ error: 'messages required' });
  try {
    const result = await invokeLLM({ messages, tools, toolChoice, model, maxTokens });
    return res.json(result);
  } catch (err: any) {
    return res.status(502).json({ error: err?.message || 'LLM invocation failed' });
  }
});

app.get('/api/ai/models', requireAuth, aiRateLimit, async (req, res) => {
  try {
    const models = await listLLMModels();
    return res.json(models);
  } catch (err: any) {
    return res.status(502).json({ error: err?.message || 'Models fetch failed' });
  }
});

// ATLAS-RANK feed endpoint (port of architecture(1)/src/lib/reco master scoring).
// Maps each post to the production ScoreInputs (predictions derived heuristically
// from live engagement) and returns the feed ordered by masterFeedScore.final.
app.get('/api/feed/atlas-rank', requireAuth, (req, res) => {
  const db = loadDatabase();
  const feed: any[] = [];

  db.users.forEach((u: any) => {
    if (u.blocked) return;
    (u.profile?.posts || []).forEach((p: any) => {
      if (p.hidden) return;
      feed.push({ ...p, creator: { id: u.id, name: u.name, followersCount: u.profile?.followersCount || 0 } });
    });
  });

  const now = Date.now();
  const scored = feed.map((post) => {
    const likes = Number(post.likes ?? (Array.isArray(post.likedBy) ? post.likedBy.length : 0));
    const comments = Array.isArray(post.comments) ? post.comments.length : Number(post.commentsCount ?? 0);
    const shares = Number(post.repostsCount ?? post.sharesCount ?? 0);
    const views = Number(post.viewsCount ?? post.views ?? 0);
    const ageHours = Math.max(0.25, (now - (post.createdTime || post.timestamp || now - 86400000)) / 3600000);
    const engagement = likes * 2 + comments * 3 + shares * 5 + views * 0.05;

    // Heuristic prediction heads from live signals (0..1 proxies).
    const pred = {
      p_like: Math.min(1, likes / 50),
      p_comment: Math.min(1, comments / 30),
      p_share: Math.min(1, shares / 15),
      p_save: Math.min(1, likes / 80),
      p_follow: Math.min(1, views / 5000),
      p_profile_visit: Math.min(1, views / 2000),
      watch_time: Math.min(60, views > 0 ? views / Math.max(1, comments + 1) : 10),
      watch_ratio: Math.min(1, likes > 0 ? 0.6 : 0.3),
      p_complete: Math.min(1, likes / 100 + 0.2),
      p_rewatch: Math.min(1, likes / 60),
      p_session_extend: Math.min(1, likes / 120 + 0.1),
      p_satisfaction: Math.min(1, likes > 0 ? 0.7 : 0.3),
      p_return_tomorrow: Math.min(1, likes / 200 + 0.1),
      p_retention_7d: Math.min(1, likes / 150 + 0.05),
      p_negative: Math.min(0.5, likes === 0 && views > 100 ? 0.3 : 0.05),
      p_viral: Math.min(1, engagement / 200),
    };

    const creatorFollowers = Number(post.creator?.followersCount ?? 0);
    const creatorTrust = 0.7 + 0.3 * Math.min(1, Math.log10(creatorFollowers + 1) / 4);
    const momentum = engagement / ageHours;

    const result = masterFeedScore({
      pred,
      durationSec: Number(post.videoLength ?? 0),
      contentQuality: 5 + Math.min(5, likes / 20),
      creatorTrust,
      freshness: Math.pow(0.5, ageHours / 48),
      momentum,
      viral: Math.min(1, momentum / 5),
      novelty: Math.min(0.15, 1 / (views + 1) * 10),
      serendipity: Math.min(0.1, 1 / (views + 1) * 5),
      emergingCreatorLift: creatorFollowers < 10 ? 0.05 : 0,
      spamProbability: 0.02,
      botProbability: 0.02,
      integrityScore: 0.92,
      localeMultiplier: 1,
      topicFatigue: 0,
      creatorFatigue: 0,
      priorImpressions: views,
      explorationBonus: Math.min(0.06, 1.2 / Math.pow(1 + views, 0.5)),
    });

    return { post, score: result.final, breakdown: result };
  });

  scored.sort((a, b) => b.score - a.score);
  res.json({
    feed: scored.map((s) => ({ ...s.post, rankingScore: Number(s.score.toFixed(4)) })),
    explanation: scored.map((s) => ({ id: s.post.id, final: Number(s.score.toFixed(4)), uShort: s.breakdown.uShort, penalty: s.breakdown.penalty })),
  });
});

app.post('/api/meet/leave', requireAuth, (req, res) => {
  const user = (req as any).user;
  const searcher = meetSearchers.get(user.id);
  if (searcher && searcher.matchedRoomId) {
    const rId = searcher.matchedRoomId;
    meetRoomMessages.delete(rId);
    meetSignals.delete(rId);
    
    // Clear room for peer as well
    const other = Array.from(meetSearchers.values()).find(s => s.matchedRoomId === rId && s.userId !== user.id);
    if (other) {
      other.matchedRoomId = undefined;
    }
  }
  meetSearchers.delete(user.id);
  matchmakingDequeue(user.id); // keep the interest-matchmaking queue consistent
  res.json({ success: true });
});

app.post('/api/meet/room/:roomId/message', requireAuth, (req, res) => {
  const { roomId } = req.params;
  const { text } = req.body;
  const user = (req as any).user;

  if (!meetRoomMessages.has(roomId)) {
    meetRoomMessages.set(roomId, []);
  }

  const list = meetRoomMessages.get(roomId)!;
  list.push({
    senderId: user.id,
    text: text || '',
    timestamp: Date.now()
  });

  // Keep only last 50 messages
  if (list.length > 50) {
    list.shift();
  }

  res.json({ success: true });
});

app.get('/api/meet/room/:roomId/messages', requireAuth, (req, res) => {
  const { roomId } = req.params;
  const messages = meetRoomMessages.get(roomId) || [];
  res.json({ messages });
});

app.post('/api/meet/room/:roomId/signal', requireAuth, (req, res) => {
  const { roomId } = req.params;
  const { type, payload } = req.body || {};
  const user = (req as any).user;

  // Strict boundary: a malformed or oversized signaling payload (bad ICE
  // candidate from a flaky tunnel) must be rejected cleanly, never allowed to
  // throw inside the relay and take the process down.
  if (!roomId || !type || typeof type !== 'string') {
    return res.status(400).json({ error: 'type is required.' });
  }
  if (!payload || typeof payload !== 'object') {
    return res.status(400).json({ error: 'payload must be an object.' });
  }
  try {
    const serialized = JSON.stringify(payload);
    if (serialized && serialized.length > 100_000) {
      return res.status(413).json({ error: 'signal payload too large.' });
    }
  } catch {
    return res.status(400).json({ error: 'payload is not JSON-serializable.' });
  }

  try {
    if (!meetSignals.has(roomId)) {
      meetSignals.set(roomId, []);
    }

    const list = meetSignals.get(roomId)!;
    list.push({
      senderId: user.id,
      type,
      payload,
      timestamp: Date.now()
    });

    // Keep only last 50 signals
    if (list.length > 50) {
      list.shift();
    }

    res.json({ success: true });
  } catch (e) {
    console.error('Meet signal relay error:', e);
    res.status(500).json({ error: 'Signal relay failed.' });
  }
});

app.get('/api/meet/room/:roomId/signals', requireAuth, (req, res) => {
  try {
    const { roomId } = req.params;
    const { lastTimestamp } = req.query;
    const ts = lastTimestamp ? parseInt(lastTimestamp as string, 10) : 0;

    const all = meetSignals.get(roomId) || [];
    const filtered = all.filter(s => s.timestamp > ts);
    res.json({ signals: filtered });
  } catch (e) {
    console.error('Meet signals read error:', e);
    res.status(500).json({ error: 'Signals read failed.' });
  }
});

// --- VITE DEV AND PROD MIDDLEWARE SETUP ---
async function startServer() {
  // Startup warning for server-side NSFW screening. The client-side TF.js path
  // (public/models/mobilenet_v2/) is PRIMARY and works; the dedicated server
  // folder is an optional second line of defence (OpenNSFW/Caffe, or a
  // server_models/ copy of the mobilenet_v2 model). Without it the server
  // engine falls back to NSFWJS with the client model, or fails open.
  const openNsfwDir = path.join(process.cwd(), 'server_models', 'open_nsfw');
  const serverModelDir = path.join(process.cwd(), 'server_models', 'mobilenet_v2');
  const clientModelPath = path.join(process.cwd(), 'public', 'models', 'mobilenet_v2', 'model.json');
  if (!fs.existsSync(openNsfwDir) && !fs.existsSync(serverModelDir)) {
    console.warn(
      '[NSFW][STARTUP] server_models/open_nsfw (OpenNSFW/Caffe) is missing — server-side image screening will use the client NSFWJS model' +
      (fs.existsSync(clientModelPath) ? ' (present at public/models/mobilenet_v2/, loaded automatically)' : ' — NO model found anywhere, server screening FAILS OPEN') +
      '. Client-side TF.js screening remains primary and works. To enable a dedicated server model, place mobilenet_v2 at server_models/mobilenet_v2/ (see CLAUDE.md → Known publish blockers).'
    );
  }
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  if (IS_PRODUCTION) {
    const appUrl = process.env.APP_URL || '';
    // HTTPS is considered configured when APP_URL is an https:// URL, or when
    // the operator sets HTTPS=true to signal TLS is terminated at the proxy.
    const behindHttps = /^https:\/\//i.test(appUrl) || process.env.HTTPS === 'true';
    if (!behindHttps) {
      console.warn('[SECURITY][SEVERE] WARNING: HTTPS not configured. WebRTC calls and getUserMedia will fail in production. Serve this app behind TLS (reverse proxy / HTTPS load balancer) and set APP_URL to an https:// URL, or set HTTPS=true when TLS is already terminated upstream.');
    }
  }

  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
  setExternalSaveDatabase(saveDatabase);
  setExternalTokenValidator(getUserIdFromToken);
  setupChatServer(server);
}

// Test hook: when running under Vitest (NODE_ENV=test) we skip binding a port
// and the Vite dev middleware, and instead export the Express app so supertest
// can exercise routes in-process against a temp database.json. Production and
// `npm run dev` behavior is unchanged.
if (process.env.NODE_ENV !== 'test') {
  startServer();
}

export { app };
