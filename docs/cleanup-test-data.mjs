// Removes the users + call history created by test-callflow.mjs / test-pairing.mjs.
// Run: node docs/cleanup-test-data.mjs   (only when the server is NOT running)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dbFile = path.join(root, 'database.json');

if (!fs.existsSync(dbFile)) {
  console.log('database.json not found — nothing to do.');
  process.exit(0);
}

const db = JSON.parse(fs.readFileSync(dbFile, 'utf8'));
const isTestEmail = (e) =>
  typeof e === 'string' &&
  (/^calltester\d+@test\.com$/.test(e) || /^pair(pair)?a\d+@test\.com$/.test(e) || /^pairb\d+@test\.com$/.test(e) || /^calltester/i.test(e) || /^pair/i.test(e));

let removedUsers = 0;
if (Array.isArray(db.users)) {
  db.users = db.users.filter((u) => {
    const email = u?.email || u?.username || '';
    if (isTestEmail(email) || u?.name === 'Call Tester' || u?.name === 'PairA' || u?.name === 'PairB') {
      removedUsers += 1;
      return false;
    }
    return true;
  });
}

let removedCalls = 0;
if (Array.isArray(db.callHistory)) {
  db.callHistory = db.callHistory.filter((c) => {
    if (c && (c.targetUserId === 'some-user' || isTestEmail(String(c.targetUserId || '')))) {
      removedCalls += 1;
      return false;
    }
    return true;
  });
}

// Drop orphaned sessions for removed test users.
let removedSessions = 0;
if (db.sessions && typeof db.sessions === 'object') {
  for (const [token, s] of Object.entries(db.sessions)) {
    if (s && isTestEmail(String(s.email || s.userId || ''))) {
      delete db.sessions[token];
      removedSessions += 1;
    }
  }
}

fs.writeFileSync(dbFile, JSON.stringify(db, null, 2), 'utf8');
console.log(`Cleaned: ${removedUsers} test users, ${removedCalls} call-history records, ${removedSessions} sessions removed from database.json.`);
