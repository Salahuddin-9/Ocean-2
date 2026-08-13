// Cleans up smoke-test data created by scripts/smoke-prod.cjs.sh:
// deletes matching users from Firestore (web SDK — rules currently allow it)
// and strips them from database.json + sessions.json locally.
const fs = require('fs');
const path = require('path');
const { initializeApp, getApps } = require('firebase/app');
const { getFirestore, doc, getDocs, collection, deleteDoc } = require('firebase/firestore');

const root = process.cwd();
const cfg = JSON.parse(fs.readFileSync(path.join(root, 'firebase-applet-config.json'), 'utf8'));
const app = getApps().length ? getApps()[0] : initializeApp(cfg);
const db = getFirestore(app, cfg.firestoreDatabaseId || undefined);

(async () => {
  // 1. Find + delete smoke users from Firestore
  const snap = await getDocs(collection(db, 'users'));
  let deleted = 0;
  const smokeIds = [];
  snap.forEach((d) => {
    const data = d.data();
    if (data && (String(data.email || '').includes('@test.local') || /smoke|boot\.check|final\.smoke/i.test(String(data.name || '')))) {
      smokeIds.push(d.id);
    }
  });
  for (const id of smokeIds) {
    try { await deleteDoc(doc(db, 'users', id)); deleted++; } catch (e) { console.log('skip delete', id, e.message); }
  }
  console.log(`Firestore: deleted ${deleted} smoke user doc(s)`);

  // 2. Strip from local database.json
  const dbfile = path.join(root, 'database.json');
  if (fs.existsSync(dbfile)) {
    const dbData = JSON.parse(fs.readFileSync(dbfile, 'utf8'));
    const before = (dbData.users || []).length;
    dbData.users = (dbData.users || []).filter((u) =>
      !String(u.email || '').includes('@test.local') && !/smoke|boot\.check|final\.smoke/i.test(String(u.name || ''))
    );
    if (dbData.sessions && typeof dbData.sessions === 'object') {
      const smokeTokens = Object.keys(dbData.sessions).filter((t) => {
        const s = dbData.sessions[t];
        return s && smokeIds.includes(s.userId);
      });
      smokeTokens.forEach((t) => delete dbData.sessions[t]);
    }
    fs.writeFileSync(dbfile, JSON.stringify(dbData, null, 2), 'utf8');
    console.log(`database.json: ${before} -> ${dbData.users.length} users`);
  }

  // 3. Strip from sessions.json
  const sfile = path.join(root, 'sessions.json');
  if (fs.existsSync(sfile)) {
    const sessions = JSON.parse(fs.readFileSync(sfile, 'utf8'));
    let removed = 0;
    for (const t of Object.keys(sessions)) {
      const s = sessions[t];
      if (s && typeof s === 'object' && smokeIds.includes(s.userId)) { delete sessions[t]; removed++; }
    }
    fs.writeFileSync(sfile, JSON.stringify(sessions, null, 2), 'utf8');
    console.log(`sessions.json: removed ${removed} smoke session(s)`);
  }
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
