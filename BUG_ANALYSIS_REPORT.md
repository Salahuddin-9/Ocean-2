# Turtle Social Platform — Comprehensive Bug Analysis & Fix Report

## Architecture Overview

The project has **two parallel architectures** that conflict with each other:

1. **Express + JSON File DB** (`server.ts`, `database.json`): Custom Express.js server with PBKDF2 auth, local JSON file as database, WebSocket-based chat, Stream API for video calls.
2. **Firebase Client SDK** (`AppContext.tsx`): Firebase Auth + Firestore direct client, used in parallel with the Express API.

This dual architecture creates data inconsistency, auth conflicts, and duplicate state.

---

## CRITICAL BUGS (P1 — Must Fix)

### 1. NSFW Engine: Safe Images Incorrectly Blurred

**Root Cause Analysis:**

Three separate issues converge:

**A) Model Path is Wrong** (`turtleNSFWServerEngine.ts:36`)
```typescript
const PYTHON_SCRIPT = path.join(process.cwd(), 'server_models', 'open_nsfw', 'classify_nsfw_py3.py');
```
The actual Python script is at root: `classify_nsfw_py3.py`. This path is invalid, meaning the OpenNSFW Python engine **never runs** on the server. Only the NSFWJS fallback (lower accuracy) is used.

**B) NSFW Routes NOT Mounted in Primary Server** (`server.ts`)
`server.ts` does NOT import `registerNSFWRoutes` from `turtleNSFWServerEngine.ts`. Only the older `server-1.ts` has it. The `/api/nsfw/check` endpoint does not exist on the running server, so server-side NSFW double-checking never happens.

**C) Aggressive Skin Detection Threshold** (`turtleNSFWFilter.ts:291-296`)
```typescript
if (skinRatio >= 0.38 || centerSkinRatio >= 0.42) {
  return { verdict: 'blur', skinRatio };
}
```
A 38% skin pixel ratio triggers blur. Photos of beach scenes, yoga poses, portraits, fitness content, and even close-cropped face photos commonly exceed 38% skin ratio. The `sexy` threshold of 0.70 is also very low.

**D) NSFWJS `blurSexy` Threshold Too Low** (`turtleNSFWFilter.ts:71`)
```typescript
blurSexy: 0.70,
```
The NSFWJS model tends to classify many fashion/beach/gym images as "Sexy" with probabilities in the 0.4–0.8 range. A 0.70 threshold means safe content frequently gets blurred.

**Proposed Fix:**
- Fix the Python script path in `turtleNSFWServerEngine.ts` to point to `classify_nsfw_py3.py` at root.
- Import and call `registerNSFWRoutes(app)` in `server.ts`.
- Raise `blurSexy` threshold to 0.85, raise `blockPorn`/`blockHentai` to 0.80.
- Raise skin detection blur threshold from 0.38 → 0.50, block from 0.52 → 0.65.
- Add a **whitelist** for common safe image patterns (clothing detection).

**Side Effects:**
- Some genuinely borderline content that was previously blurred may now show. But the current setup is over-blocking safe content which is worse for UX.

---

### 2. WebRTC Calling: Calls Fail Behind NAT/Firewall

**Root Cause:**
`socketServer.ts` and related code have **no STUN/TURN server configuration**. The Stream Video API handles calls via its own infrastructure, but the fallback `webrtc-offer/answer/ice-candidate` signaling relays are pure WebRTC without any ICE server configuration.

In `socketServer.ts`, the WebRTC signaling flow:
1. Users get matched via `matchmaking.ts`
2. Stream call is optionally created (best-effort, can silently fail)
3. If Stream call creation fails, the system silently falls through to "pure WebRTC"
4. There is no STUN/TURN configuration anywhere

**Result:** Calls between users behind symmetric NATs, corporate firewalls, or mobile networks will fail to establish ICE connectivity. `iceConnectionState` will stay in "checking" or go to "failed".

**Proposed Fix:**
- Add STUN/TURN server configuration in the client-side WebRTC setup.
- At minimum, configure Google's free STUN servers (`stun:stun.l.google.com:19302`).
- For production, add a TURN server (coturn or commercial) for relay candidates.
- In `socketServer.ts`, add TURN credentials to the `matched` event payload so clients can configure their `RTCPeerConnection`.

**Side Effects:**
- None. This is a pure addition.

---

### 3. Authentication: WebSocket Trusts Self-Declared User IDs

**Root Cause:** (`chatServer.ts:122-140`)
```typescript
if (type === 'auth') {
  const { token } = payload;
  // ... commented-out token validation logic
  const { userId, name, username } = payload;  // <-- TRUSTS CLIENT INPUT
  if (!userId) { ... }
  authenticatedUserId = userId;
  // registers user without any verification
}
```
The WebSocket `auth` handler **accepts `userId` directly from the client** without validating the session token. A malicious client can impersonate any user by sending their ID.

**Proposed Fix:**
- Validate the token against `getUserIdFromToken()` (imported from `server.ts` or via shared module).
- Remove the `userId` field from client auth payload; derive it from the validated token only.

**Side Effects:**
- The simulated reply feature (`triggerSimulatedReplyExternal`) needs the token context — pass `sessionToken` to `setupChatServer` during initialization.

---

### 4. Database Concurrency: Race Conditions on File Writes

**Root Cause:** (`server.ts`)
`loadDatabase()` reads the entire JSON file into memory. `saveDatabase()` writes it back atomically (via temp file + rename). However, multiple Express handlers run concurrently. If two requests both `loadDatabase()`, modify, then `saveDatabase()`, the SECOND save overwrites the FIRST's changes.

For example:
1. Request A: `loadDatabase()` → adds post → `saveDatabase()`
2. Request B: `loadDatabase()` → adds message → `saveDatabase()`
3. If B loads BEFORE A saves, A's post is LOST.

**Proposed Fix:**
- Implement a write queue/lock using a promise chain (similar to the existing `syncQueue` for Firestore).
- Or: switch to a proper database (SQLite via `better-sqlite3`) for ACID transactions.

**Side Effects:**
- Queue-based locking adds slight latency (~1-5ms) per write but prevents data loss.

---

## HIGH SEVERITY (P2)

### 5. Image Storage: Base64 in database.json — Massive Bloat

**Root Cause:** Posts with images store the full base64 data URI in `database.json` (e.g., 92KB+ base64 strings per image). With 12 posts visible in the current DB, the file is already enormous. Every read of the database loads ALL images into memory.

**Impact:**
- `database.json` grows unboundedly with each image upload.
- Every API request that calls `loadDatabase()` loads all images into RAM.
- Node.js memory consumption grows linearly with image count.
- The Firestore sync serializes this to cloud, wasting bandwidth and storage.

**Proposed Fix:**
- Images should ONLY be stored as `/uploads/media-XXXX.jpg` file paths, never as base64 in the database.
- Add a migration that extracts existing base64 images to files and replaces them with paths.
- Enforce this at the API level: reject posts with `imageUrl` that starts with `data:`.

---

### 6. `auth.ts` is from a Different Project (Next.js) — Dead Code

**Root Cause:** `auth.ts` uses `next/headers`, `next/navigation`, Drizzle ORM, and bcryptjs. The actual project uses Express, PBKDF2, and no Drizzle. This file is entirely unused and misleading.

**Proposed Fix:** Delete `auth.ts` or add a comment noting it belongs to a different architecture. Currently it's dead code that confuses debugging.

---

### 7. Notification: Time Capsule Unlock Detection is Inefficient

**Root Cause:** (`server.ts:606-651`)
`checkAndUnlockCapsules()` is called on every `loadDatabase()`. It iterates ALL users, ALL posts, and for each unlocked capsule, iterates ALL users again to find followers. This is O(n² × m) where n = users, m = posts.

**Impact:** As user base grows, database load time increases quadratically. On every API request, there's a full scan of all users/posts.

**Proposed Fix:**
- Pre-compute the follower graph index at write time rather than scanning on every read.
- Or run capsule unlock checks on a scheduled interval (e.g., every 60 seconds via `setInterval`) rather than on every database load.

---

### 8. No Input Validation on Comment/Messaging Routes

**Root Cause:** The comment endpoint (`server.ts:3552`) accepts `text` with no length limit, no XSS sanitization, and no content moderation check. The message send route similarly lacks validation.

**Impact:** XSS injection, extremely long messages crashing the database, no profanity/abuse filtering.

**Proposed Fix:**
- Truncate `text` to a reasonable limit (e.g., 5000 chars for messages, 2000 for comments).
- Sanitize HTML/script tags from all user text input.
- Run `screenContentText()` from `turtleNSFWFilter.ts` on text content before storage.

---

## MEDIUM SEVERITY (P3)

### 9. Memory Leak: Session/Meeting Maps Never Cleaned

**Root Cause:** (`server.ts`)
The `meetSearchers`, `meetRoomMessages`, and `meetSignals` Maps have stale entry cleanup only on `leave` or `disconnect`. If a user closes their browser without calling `/api/meet/leave`, their entries persist indefinitely.

**Proposed Fix:**
- Add a periodic cleanup interval (every 60s) that removes entries older than 30 seconds.

---

### 10. Error Handling: `saveDatabase` Can Throw on First Write

**Root Cause:** (`server.ts:593-604`)
```typescript
function saveDatabase(data: any) {
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
}
```
If `syncGlobalPostsFromUsers` throws (e.g., `data` is null), `isSyncPending` stays `true` forever, blocking future Firestore syncs.

**Proposed Fix:** Move `isSyncPending = true` inside a try/finally block, or reset it on error.

---

### 11. Rate Limiting is In-Memory Only

**Root Cause:** Login rate limits (`failedLoginAttempts`), reset rate limits (`resetAttempts`), and view-words rate limits are all stored in JavaScript Maps. On server restart, all rate limits reset, allowing brute force across restarts.

**Proposed Fix:** Persist rate limit state to `database.json` or `sessions.json`.

---

### 12. File Upload: No File Type Validation on Server

**Root Cause:** (`server.ts:842-901`)
The upload endpoint accepts any file extension and creates it in `uploads/`. Malicious files can be uploaded and served as static assets.

**Proposed Fix:**
- Whitelist allowed extensions (image: jpg, jpeg, png, gif, webp; video: mp4, webm, mov; audio: mp3, wav).
- Scan uploaded files for magic bytes to verify they match their extension.
- Serve uploads with `Content-Security-Policy` and `X-Content-Type-Options: nosniff` headers.

---

### 13. `getRepostsCountMap` is O(n²) — Scans All Users Twice

**Root Cause:** Called on every `/api/auth/me` request. Iterates all users and all their posts to build a repost count map.

**Proposed Fix:** Cache the repost map with a short TTL (5 seconds) in memory.

---

## LOW SEVERITY (P4)

### 14. Timestamp Format Inconsistency

Some endpoints use `Date.now()` (numeric), others use `.toLocaleDateString()` (string format). This breaks sorting and comparison across endpoints.

### 15. `SEED_USERS` Array is Empty but Still Referenced

`server.ts:38`: `const SEED_USERS: any[] = [];` — declared but never populated, only used in error fallback. A relic of earlier code.

### 16. Hardcoded `alex-rivera-id` in Message Filter

`server.ts:1779`: Messages are filtered for `receiverId === 'alex-rivera-id'` — a hardcoded seed user ID that may not exist.

### 17. `socketServer.ts` References `apiManager` Module That May Not Exist

`socketServer.ts:4`: `import * as apiManager from "./apiManager";` — no `apiManager.ts` file visible in the project.

---

## SUMMARY: Fix Priority Order

| Priority | Bug | Impact |
|----------|-----|--------|
| P1 #1 | NSFW safe images blurred | User-facing: Content censorship is broken |
| P1 #2 | WebRTC calls fail behind NAT | User-facing: Calls silently fail |
| P1 #3 | WebSocket auth trusts client | Security: Impersonation possible |
| P1 #4 | Database race conditions | Data integrity: Posts/messages lost |
| P2 #5 | Base64 images in database | Performance: OOM on growth |
| P2 #6 | Dead `auth.ts` file | Confusion: Wrong architecture reference |
| P2 #7 | Time capsule O(n²) scan | Performance: Slows all API calls |
| P2 #8 | No content validation | Security: XSS, abuse |
| P3 #9 | Meet maps memory leak | Performance: Memory grows over time |
| P3 #10 | `isSyncPending` stuck bug | Reliability: Firestore sync blocked |
| P3 #11 | Rate limits not persisted | Security: Reset on restart |
| P3 #12 | No upload file validation | Security: Malicious file upload |
| P3 #13 | RepostMap O(n²) | Performance: Slow /me endpoint |
| P4 #14-17 | Minor issues | Code quality |
