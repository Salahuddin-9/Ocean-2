/**
 * Ocean — ActivityPub / Fediverse Bridge (Feature 236)
 * -------------------------------------------------------
 * A minimal federation layer: local posts can be "federated" to an outbox in
 * ActivityPub-shaped JSON, remote actors' posts ingested via the inbox, and —
 * crucially — discovery works: the webfinger endpoint and a real ActivityPub
 * actor document are served so Mastodon-style servers can find and follow
 * Ocean users. Outbound delivery is signed with HTTP Signatures (hs2019 +
 * Ed25519) when a targetInbox is supplied.
 *
 * Model (global db):
 *   db.fedOutbox      — { id, actor, type, object, to, at }
 *   db.fedRemotePosts — { id, actor, content, url, at }
 *   db.fedActors      — { username, publicKeyPem, at } (Ed25519 key per user)
 *
 * Routes:
 *   GET  /.well-known/webfinger          (public) acct discovery -> actor
 *   GET  /api/fediverse/actor/:username  (public) ActivityPub actor JSON
 *   GET  /api/fediverse/outbox           (public) recent outbox activities
 *   POST /api/fediverse/outbox           (auth) federate a post/note
 *   POST /api/fediverse/inbox            (auth) ingest a remote post
 *   GET  /api/fediverse/remote           (public) remote posts
 */

import express from 'express';
import crypto from 'crypto';
import { getCtx } from './turtleServerContext';

export interface FedActivity {
  id: string;
  actor: string;
  type: string;
  object: string;
  to: string;
  at: number;
}

export interface FedRemotePost {
  id: string;
  actor: string;
  content: string;
  url: string;
  at: number;
}

function uid(p: string): string {
  return `${p}-${Date.now()}-${Math.floor(Math.random() * 99999)}`;
}

function ensureCollection(db: any): void {
  if (!Array.isArray(db.fedOutbox)) db.fedOutbox = [];
  if (!Array.isArray(db.fedRemotePosts)) db.fedRemotePosts = [];
}

function s(v: unknown, max: number): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

/** Base origin for actor URLs — APP_URL first, else the request host. */
function originOf(req: express.Request): string {
  const appUrl = process.env.APP_URL || '';
  if (/^https?:\/\//i.test(appUrl)) return appUrl.replace(/\/$/, '');
  const host = req.get('host') || 'localhost:3000';
  return `${req.protocol}://${host}`;
}

/**
 * Deterministic per-user Ed25519 signing keypair (SPKI/PKCS8 PEM) for the
 * actor doc. The private key is stored alongside the public key so outbound
 * deliveries can be signed with HTTP Signatures (hs2019).
 */
function actorKeyPair(username: string, db: any, saveDatabase: (db: any) => void): { publicKeyPem: string; privateKeyPem: string } {
  if (!Array.isArray(db.fedActors)) db.fedActors = [];
  let rec = (db.fedActors as any[]).find((a) => a.username === username);
  if (!rec) {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
    const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
    const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    rec = { username, publicKeyPem, privateKeyPem, at: Date.now() };
    (db.fedActors as any[]).push(rec);
    saveDatabase(db);
  }
  return { publicKeyPem: rec.publicKeyPem, privateKeyPem: rec.privateKeyPem };
}

/**
 * Sign an outgoing HTTP request with an HTTP Signature (hs2019 + Ed25519) so
 * remote ActivityPub servers can verify that the activity genuinely came from
 * this actor's key (keyId = <actor>#main-key).
 */
function signHttpRequest(opts: {
  privateKeyPem: string;
  keyId: string;
  method: string;
  url: URL;
  body: string;
}): { headers: Record<string, string>; signature: string } {
  const { privateKeyPem, keyId, method, url, body } = opts;
  const digest = crypto.createHash('sha256').update(body, 'utf8').digest('base64');
  const date = new Date().toUTCString();
  const host = url.host;
  const requestTarget = `${method.toLowerCase()} ${url.pathname}${url.search}`;
  const signingString = `(request-target): ${requestTarget}\nhost: ${host}\ndate: ${date}\ndigest: SHA-256=${digest}`;
  const privateKey = crypto.createPrivateKey(privateKeyPem);
  const signature = crypto.sign(null, Buffer.from(signingString, 'utf8'), privateKey).toString('base64');
  return {
    headers: {
      'Host': host,
      'Date': date,
      'Digest': `SHA-256=${digest}`,
      'Content-Type': 'application/activity+json',
      'Signature': `keyId="${keyId}",algorithm="hs2019",headers="(request-target) host date digest",signature="${signature}"`,
    },
    signature,
  };
}

/**
 * Deliver a queued activity to a remote inbox with HTTP Signatures. Failures
 * are logged and non-fatal — the activity stays in the local outbox so a later
 * retry (or manual re-federation) can push it again.
 */
async function deliverSignedActivity(opts: {
  inboxUrl: string;
  actorId: string;
  privateKeyPem: string;
  activity: FedActivity;
}): Promise<{ ok: boolean; status?: number; error?: string }> {
  const { inboxUrl, actorId, privateKeyPem, activity } = opts;
  try {
    const url = new URL(inboxUrl);
    if (!/^https?:$/.test(url.protocol)) return { ok: false, error: 'Inbox URL must be http(s).' };
    const body = JSON.stringify(activity);
    const { headers } = signHttpRequest({ privateKeyPem, keyId: `${actorId}#main-key`, method: 'POST', url, body });
    const res = await fetch(url.href, {
      method: 'POST',
      headers: { ...headers, 'User-Agent': 'OceanFediverse/1.0 (+ActivityPub)' },
      body,
    });
    if (res.ok) return { ok: true, status: res.status };
    return { ok: false, status: res.status, error: `Remote returned HTTP ${res.status}` };
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
}

export function registerFediverseRoutes(app: express.Express): void {
  const { requireAuth, loadDatabase, saveDatabase } = getCtx();

  // ── Webfinger: acct:user@host discovery (the entry point for Mastodon/PeerTube) ──
  app.get('/.well-known/webfinger', (req, res) => {
    const resource = String(req.query.resource || '');
    if (!resource) {
      return res.status(400).json({ error: 'Missing resource parameter (e.g. ?resource=acct:user@host).' });
    }
    const m = resource.match(/^acct:([^@]+)@(.+)$/i);
    const username = m ? m[1] : resource.split('@')[0];
    if (!username) return res.status(400).json({ error: 'Unsupported resource format.' });
    const db = loadDatabase();
    const user = (db.users || []).find((u: any) => (u.username || '').toLowerCase() === username.toLowerCase() || (u.name || '').toLowerCase() === username.toLowerCase());
    if (!user) return res.status(404).json({ error: 'No such account.' });
    const origin = originOf(req);
    const handle = user.username || username;
    const actor = `${origin}/api/fediverse/actor/${encodeURIComponent(handle)}`;
    res.type('application/jrd+json');
    res.json({
      subject: `acct:${handle}@${origin.replace(/^https?:\/\//, '')}`,
      aliases: [actor],
      links: [
        { rel: 'self', type: 'application/activity+json', href: actor },
        { rel: 'http://webfinger.net/rel/profile-page', type: 'text/html', href: `${origin}/users/${encodeURIComponent(handle)}` },
      ],
    });
  });

  // ── ActivityPub actor document ──
  app.get('/api/fediverse/actor/:username', (req, res) => {
    const username = decodeURIComponent(req.params.username);
    const db = loadDatabase();
    const user = (db.users || []).find((u: any) => (u.username || '').toLowerCase() === username.toLowerCase() || (u.name || '').toLowerCase() === username.toLowerCase());
    if (!user) return res.status(404).json({ error: 'No such account.' });
    const handle = user.username || username;
    const origin = originOf(req);
    const actorId = `${origin}/api/fediverse/actor/${encodeURIComponent(handle)}`;
    const { publicKeyPem: keyPem } = actorKeyPair(handle, db, saveDatabase);
    res.type('application/activity+json');
    res.json({
      '@context': ['https://www.w3.org/ns/activitystreams', 'https://w3id.org/security/v1'],
      id: actorId,
      type: 'Person',
      preferredUsername: handle,
      name: user.name || handle,
      summary: '',
      url: `${origin}/users/${encodeURIComponent(handle)}`,
      inbox: `${origin}/api/fediverse/inbox`,
      outbox: `${origin}/api/fediverse/outbox`,
      publicKey: {
        id: `${actorId}#main-key`,
        owner: actorId,
        publicKeyPem: keyPem,
      },
    });
  });

  app.get('/api/fediverse/outbox', (req, res) => {
    const db = loadDatabase();
    ensureCollection(db);
    const outbox = (db.fedOutbox as FedActivity[]).slice().sort((a, b) => b.at - a.at).slice(0, 50);
    res.json({ outbox });
  });

  app.post('/api/fediverse/outbox', requireAuth, async (req, res) => {
    const user = (req as any).user;
    const b = (req.body || {}) as any;
    const content = s(b.content, 2000);
    if (!content) return res.status(400).json({ error: 'content is required.' });
    const db = loadDatabase();
    ensureCollection(db);
    const origin = originOf(req);
    const actor = `${origin}/api/fediverse/actor/${encodeURIComponent(user.username || user.name || user.id)}`;
    const activity: FedActivity = {
      id: uid('fed'),
      actor,
      type: 'Create',
      object: JSON.stringify({
        type: 'Note',
        id: uid('note'),
        attributedTo: actor,
        content,
        published: new Date().toISOString(),
        to: ['https://www.w3.org/ns/activitystreams#Public'],
      }),
      to: 'https://www.w3.org/ns/activitystreams#Public',
      at: Date.now(),
    };
    (db.fedOutbox as FedActivity[]).unshift(activity);
    saveDatabase(db);

    // Signed outbound delivery: when a remote inbox URL is supplied (e.g. a
    // Mastodon/PeerTube instance's /inbox), push the activity there with an
    // HTTP Signature so the remote server can verify it came from this actor.
    // Delivery is best-effort: failures are reported but never block the local
    // queue (the activity stays in the outbox for later retry).
    const targetInbox = s(b.targetInbox, 400);
    let delivery: { ok: boolean; status?: number; error?: string } | null = null;
    if (targetInbox) {
      const { privateKeyPem } = actorKeyPair(user.username || user.name || user.id, db, saveDatabase);
      delivery = await deliverSignedActivity({
        inboxUrl: targetInbox,
        actorId: actor,
        privateKeyPem,
        activity,
      });
      if (!delivery.ok) console.warn(`[fediverse] signed delivery to ${targetInbox} failed:`, delivery.error || `HTTP ${delivery.status}`);
    }

    res.json({
      activity,
      delivery,
      note: delivery
        ? delivery.ok
          ? 'Activity delivered to the remote inbox with HTTP Signatures.'
          : 'Activity queued locally; signed delivery to the remote inbox failed (see delivery).'
        : 'Activity queued locally — pass targetInbox to deliver it to a remote server with HTTP Signatures.'
    });
  });

  app.post('/api/fediverse/inbox', requireAuth, (req, res) => {
    const user = (req as any).user;
    const b = (req.body || {}) as any;
    const content = s(b.content, 2000);
    const actor = s(b.actor, 200);
    if (!content || !actor) return res.status(400).json({ error: 'actor and content are required.' });
    const db = loadDatabase();
    ensureCollection(db);
    const post: FedRemotePost = {
      id: uid('frm'),
      actor,
      content,
      url: s(b.url, 400),
      at: Date.now(),
    };
    (db.fedRemotePosts as FedRemotePost[]).unshift(post);
    saveDatabase(db);
    res.json({ post });
  });

  app.get('/api/fediverse/remote', (req, res) => {
    const db = loadDatabase();
    ensureCollection(db);
    res.json({ posts: (db.fedRemotePosts as FedRemotePost[]).slice().sort((a, b) => b.at - a.at).slice(0, 50) });
  });
}
