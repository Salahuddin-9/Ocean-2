# Ocean — Independent Verification Report

**Date:** 2026-08-15 · **Method:** static code analysis + full runtime sweep in an isolated temp copy (no production data touched) + WebSocket + critical-flow tests. All findings below are from the actual code and live responses, not doc claims.

## 1. Executive summary

The Ocean app (Express + raw-`ws` chatServer, React/Vite frontend, JSON-file persistence) boots cleanly, builds, passes its full test suite, and serves **957 registered Express routes** with **zero 500s and zero unregistered paths**. 0 broken routes. Auth is enforced on the sensitive surface (401 without token), admin routes are gated (403 without MASTER_KEY, 2xx with it), and the documented graceful-degradation paths (Stream tokens, AI image, guest feed) behave as described. The known publish blockers (empty service keys, missing server-side NSFW model, in-memory rate limits, untracked Meet mesh + test files) remain — see §6.

## 2. Build & test results

| Check | Command | Result |
|---|---|---|
| TypeScript | `npx tsc --noEmit` | ✅ clean (exit 0) |
| Lint | `npm run lint` (== tsc) | ✅ clean |
| Tests | `npm test` | ✅ 38/38 pass (6 files) |
| Build | `npm run build` | ✅ vite + esbuild succeed (chunk-size warnings only) |

## 3. Runtime route check

Booted the real server from an isolated temp dir (copied data files, 'DB_FILE'/'SESSIONS_FILE' overrides, no Firestore config → local fallback). 3 requests per route (no-auth / valid-auth / invalid-auth) ≈ 2,870 requests across 957 routes.

| Class | Count | Meaning |
|---|---|---|
| ⚠️ 4xx-BL | 533 | reachable; sane 4xx for generic/empty body |
| ✅ OK | 298 | 2xx with valid auth |
| 🚫 PUBLIC-READ | 70 | intentional public read/list |
| 🚫 PUBLIC | 37 | works without auth (by design) |
| 🔒 ADMIN | 19 | 403 without admin key; 2xx with x-admin-key (verified) |
| **Broken (5xx / unregistered)** | 0 | — |

### Critical flows (isolated server, 27/27 passed)

| Flow | Result |
|---|---|
| register+login two users | ✅ |
| create direct conversation | ✅ |
| WS A auth_ok | ✅ |
| WS B auth_ok | ✅ |
| B receives A message via WS | ✅ |
| message persisted (REST) | ✅ |
| typing event received by peer | ✅ |
| create post | ✅ |
| like post | ✅ |
| comment on post | ✅ |
| feed contains post | ✅ |
| upload PNG image | ✅ |
| create story | ✅ |
| list my stories | ✅ |
| create event (religious) | ✅ |
| RSVP to event | ✅ |
| SOS alert dispatch | ✅ |
| wallet balance read | ✅ |
| wallet transfer 5 coins | ✅ |
| meet match enqueue | ✅ |
| 2FA setup | ✅ |
| 2FA verify with valid code | ✅ |
| login now requires 2FA | ✅ |
| login completes with TOTP code | ✅ |
| stream token (no keys → configured:false) | ✅ |
| AI image (no key → placeholder) | ✅ |
| guest feed works (no auth) | ✅ |

WS: `auth_ok`, `message_received`, `typing_state`, presence, and REST persistence all verified over `/ws/chat`.

Admin: `/api/admin/*` + OS-layer admin routes return 403 without key, 200 with `x-admin-key`.

## 4. Feature verification

FEATURES.md lists **200 features** (✅=178, ⚠️=17, 🧪=5). Every hub feature has a rendered component and API routes that resolve to registered endpoints (script cross-check: 154/154 wired; independent runtime sweep found no unregistered route called by the hub).

## 5. Dead code & duplicates

- `src/components/call/ActiveCallScreen.tsx` — **unused duplicate** of `src/calling/ActiveCallScreen.tsx` (0 importers).
- `src/components/call/IncomingCallPopup.tsx` — **unused duplicate** of `src/calling/IncomingCallPopup.tsx` (0 importers).
- `src/hooks/useRandomVideoCall.ts` — dead (referenced only in comments; superseded by `useCallEngine`/mesh).
- 0 dead turtle backend modules (163/163 imported; 0 dead per import graph).
- `backups/` exists but is empty.

## 6. Security findings

| Severity | Finding |
|---|---|
| ✅ PASS | `firestore.rules`: no wide-open writes; auth required for reads; users may edit only own profile; server-only writes |
| ✅ PASS | helmet() + CORS allow-list (no wildcard); `credentials: true` |
| ✅ PASS | No hardcoded real API keys; only documented dev fallback 'studio-secret-auth-key-2026' (loud warning) |
| ✅ PASS | Login/reset rate limits + AI per-user rate limiter + emergency-pool rate limits (in-memory) |
| ⚠️ P2 | `/api/auth/signup` has no rate limit (spam vector); all rate limits are in-memory (reset on restart) |
| ⚠️ P2 | Untracked source files: `src/calling/{meetRoomMesh,useMeetRoomMesh,MeshVoiceRoom}.ts(x)` (live Meet engine), `SimulationModeBadge.tsx`, and the entire `src/test/` — a fresh clone breaks Meet and has no tests |
| ⚠️ P2 | MASTER_KEY, GEMINI_API_KEY, STREAM_*, SERVICE_ROLE_KEY, TELEGRAM_BOT_TOKEN unset in .env (documented; graceful degradation verified) |
| ⚠️ P2 | Server-side NSFW model folder missing (fail-open + loud warning; client TF.js path is primary) |
| ⚠️ P3 | database.json / community.json / sessions.json remain git-tracked despite being added to .gitignore (ignore only affects new files) |
| ⚠️ P3 | Public POST `/api/searchQueries` (logs user search text w/o auth) |

## 7. Remaining blockers (from code + runtime)

1. **P1** Service keys unset (Stream/Gemini/Firestore/Telegram) — features degrade gracefully (verified), but real AI/calls/sync need them.
2. **P1** Publish hygiene: 5 untracked source files (Meet mesh engine) + untracked 'src/test/' — commit before deploying.
3. **P2** HTTPS required in production for WebRTC/getUserMedia (warning printed on boot).
4. **P2** Login rate limiter is in-memory per-email; swap to Redis-backed for launch; add signup rate limit.
5. **P2** `MASTER_KEY` unset → legacy dev fallback for encrypted backups (loud warning).
6. **P2** Chunk-size warnings (7 MB+ main bundle) — code-split the hub.

## 8. Readiness score

**7.5 / 10.** The codebase is genuinely functional: clean build, 38/38 tests, 27/27 runtime flows, zero broken routes across a 957-route sweep, solid auth/security posture, honest feature labeling. The score is capped by P1 config (empty service keys) and P1 repo hygiene (untracked critical files), plus P2 infra (HTTPS, Redis rate limits). No P0 issues found.
