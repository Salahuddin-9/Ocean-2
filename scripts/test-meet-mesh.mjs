/**
 * Ocean mesh-room signaling E2E test.
 *
 * Boots (or reuses) the real server, signs up two throwaway users, connects
 * two /ws/chat sockets, and verifies the SimpleWebRTC-style mesh vocabulary:
 *
 *   join-room → all-users (newcomer) + user-connected (existing member)
 *   sending-signal → returning-signal relay (both directions)
 *   leave-room / socket close → user-disconnected fan-out
 *
 * Usage: node scripts/test-meet-mesh.mjs   (run from project root)
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const wsMod = require('ws');
const WebSocket = wsMod.WebSocket || wsMod.default || wsMod;

const ROOT = process.cwd();
const PORT = 3000;
const BASE = `http://localhost:${PORT}`;
const WS_URL = `ws://localhost:${PORT}/ws/chat`;

const results = [];
let serverProc = null;
let serverStarted = false;

function check(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
}

async function jsonReq(pathname, { method = 'GET', body, token } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BASE}${pathname}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { /* non-JSON */ }
  return { status: res.status, data };
}

async function waitForServer(timeoutMs = 90000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${BASE}/`);
      if (res.status < 500) return true;
    } catch { /* not up */ }
    await new Promise((r) => setTimeout(r, 1500));
  }
  return false;
}

async function isAlreadyUp() {
  try {
    const res = await fetch(`${BASE}/`, { signal: AbortSignal.timeout(3000) });
    return res.status < 500;
  } catch { return false; }
}

/** Open an authenticated chat socket. Resolves after auth_ok. */
function openAuthedSocket(token, userId, name) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_URL);
    const inbox = [];
    const waiters = [];
    ws.on('open', () => {
      ws.send(JSON.stringify({ type: 'auth', token, userId, name }));
    });
    ws.on('message', (raw) => {
      let data;
      try { data = JSON.parse(String(raw)); } catch { return; }
      if (data.type === 'auth_ok') {
        resolve({ ws, inbox, waiters, next: () => nextMessage(inbox, waiters) });
        return;
      }
      if (data.type === 'error') return;
      inbox.push(data);
      const w = waiters.shift();
      if (w) w(data);
    });
    ws.on('error', (e) => reject(e));
    setTimeout(() => reject(new Error('auth timeout')), 10000).unref();
  });
}

function nextMessage(inbox, waiters, timeoutMs = 5000) {
  if (inbox.length > 0) return Promise.resolve(inbox.shift());
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('message timeout')), timeoutMs);
    waiters.push((data) => { clearTimeout(t); resolve(data); });
  });
}

async function waitForType(inbox, waiters, type, timeoutMs = 5000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const idx = inbox.findIndex((m) => m.type === type);
    if (idx >= 0) return inbox.splice(idx, 1)[0];
    const msg = await Promise.race([
      nextMessage(inbox, waiters, 2000),
      new Promise((res) => setTimeout(() => res(null), 2000)),
    ]);
    if (msg && msg.type === type) return msg;
  }
  return null;
}

// ── boot ───────────────────────────────────────────────────────────────────
if (await isAlreadyUp()) {
  console.log('[boot] Server already running on port 3000 — reusing it.');
} else {
  const tsxEntry = require.resolve('tsx');
  const tsxCli = path.join(path.dirname(tsxEntry), 'cli.mjs');
  console.log('[boot] Starting server via tsx CLI …');
  serverProc = spawn(process.execPath, [tsxCli, 'server.ts'], {
    cwd: ROOT,
    env: { ...process.env, NODE_ENV: 'development' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  serverStarted = true;
  const up = await waitForServer();
  check('Server boots', up);
  if (!up) process.exit(1);
}

const salt = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;

try {
  // ── sign up two users ─────────────────────────────────────────────────────
  const mkUser = async (tag) => {
    const email = `mesh_${tag}_${salt}@test.dev`;
    const signup = await jsonReq('/api/auth/signup', {
      method: 'POST',
      body: { name: `Mesh ${tag}`, email, password: 'MeshPass123!', countryCode: 'BD' },
    });
    const login = await jsonReq('/api/auth/login', {
      method: 'POST',
      body: { email, password: 'MeshPass123!' },
    });
    return { id: login.data?.user?.id, token: login.data?.token };
  };
  const userA = await mkUser('A');
  const userB = await mkUser('B');
  check('Signup+login A', !!userA?.token && !!userA?.id);
  check('Signup+login B', !!userB?.token && !!userB?.id);
  if (!userA?.token || !userB?.token) throw new Error('auth failed');

  const a = await openAuthedSocket(userA.token, userA.id, 'Alice');
  const b = await openAuthedSocket(userB.token, userB.id, 'Bob');
  check('Both sockets authenticated', true);

  const ROOM = `mesh-test-${salt}`;

  // ── A joins first ─────────────────────────────────────────────────────────
  a.ws.send(JSON.stringify({ type: 'join-room', roomId: ROOM, name: 'Alice' }));
  const aAllUsersEmpty = await waitForType(a.inbox, a.waiters, 'all-users');
  check(
    'A receives all-users (empty) on join',
    aAllUsersEmpty && aAllUsersEmpty.roomId === ROOM && Array.isArray(aAllUsersEmpty.users) && aAllUsersEmpty.users.length === 0
  );

  // ── B joins second ────────────────────────────────────────────────────────
  b.ws.send(JSON.stringify({ type: 'join-room', roomId: ROOM, name: 'Bob' }));

  const bAllUsers = await waitForType(b.inbox, b.waiters, 'all-users');
  check(
    'B receives all-users listing A',
    bAllUsers && bAllUsers.roomId === ROOM && bAllUsers.users.some((u) => u.userId === userA.id && u.name === 'Alice')
  );

  const aUserConnected = await waitForType(a.inbox, a.waiters, 'user-connected');
  check(
    'A receives user-connected for B',
    aUserConnected && aUserConnected.userId === userB.id && aUserConnected.name === 'Bob'
  );

  // ── signal relay A → B ────────────────────────────────────────────────────
  const fakeSignal = { sdp: { type: 'offer', sdp: 'v=0 fake-offer-from-A' } };
  a.ws.send(JSON.stringify({ type: 'sending-signal', roomId: ROOM, userToSignal: userB.id, signal: fakeSignal }));
  const bReturning = await waitForType(b.inbox, b.waiters, 'returning-signal');
  check(
    'B receives returning-signal from A (offer relayed)',
    bReturning && bReturning.fromUserId === userA.id && bReturning.signal?.sdp?.sdp === 'v=0 fake-offer-from-A'
  );

  // ── signal relay B → A (answer back) ─────────────────────────────────────
  const fakeAnswer = { sdp: { type: 'answer', sdp: 'v=0 fake-answer-from-B' } };
  b.ws.send(JSON.stringify({ type: 'sending-signal', roomId: ROOM, userToSignal: userA.id, signal: fakeAnswer }));
  const aReturning = await waitForType(a.inbox, a.waiters, 'returning-signal');
  check(
    'A receives returning-signal from B (answer relayed)',
    aReturning && aReturning.fromUserId === userB.id && aReturning.signal?.sdp?.sdp === 'v=0 fake-answer-from-B'
  );

  // ── explicit leave-room fan-out ───────────────────────────────────────────
  b.ws.send(JSON.stringify({ type: 'leave-room', roomId: ROOM }));
  const aDisconnected = await waitForType(a.inbox, a.waiters, 'user-disconnected');
  check(
    'A receives user-disconnected after B leaves',
    aDisconnected && aDisconnected.userId === userB.id
  );

  // ── socket close cleanup ──────────────────────────────────────────────────
  b.ws.send(JSON.stringify({ type: 'join-room', roomId: ROOM, name: 'Bob' }));
  await waitForType(a.inbox, a.waiters, 'user-connected');
  b.ws.close();
  const aDisconnected2 = await waitForType(a.inbox, a.waiters, 'user-disconnected', 8000);
  check('A receives user-disconnected after B socket closes', aDisconnected2 && aDisconnected2.userId === userB.id);

  a.ws.close();
} catch (e) {
  check('Test run completed without fatal errors', false, String(e?.message || e));
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed.`);
if (serverStarted && serverProc) serverProc.kill();
process.exit(failed > 0 ? 1 : 0);
