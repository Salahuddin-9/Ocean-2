# Ocean — Social Media App (Claude Code Project Guide)

## What this is
"Ocean" is a full social media platform: Facebook/Instagram-style feed (posts, reels,
stories, reactions), chat + audio/video calls (zero-key P2P WebRTC + Jitsi), random
video chat "Meet" (Omegle-style), friends, notifications, trending, NSFW moderation
(NSFWJS client + server text filter), Gemini AI features — **plus a ~200-feature
Explore hub** (safety/civic, privacy/sovereignty, AI, hyperlocal economy, agriculture,
education, civic, religious, travel, frontier tech). See `FEATURES.md`.
Stack: React 18 + Vite + TypeScript frontend; single Express backend (`server.ts`) +
`ws` chat (`chatServer.ts`). Data lives in JSON files (`database.json`,
`community.json`, `sessions.json`) with best-effort Firestore sync.

## ⚠️ CRITICAL — read before editing anything
- **The LIVE app is `src/App.tsx`** (plus `src/components/*`, `src/hooks/*`).
- Root-level leftovers and backup duplicates (`App.tsx`, `AppContext.tsx`,
  `server-1.ts`, `App-1.tsx`, root `matchmaking.ts`/`auth.ts`, etc.) were proven
  unreachable and REMOVED. If a task mentions one of these names, the real file is
  under `src/components/`.
- **This working directory is the live repo.** `G:\Ocean-V1` and
  `G:\Ocean-V1 - Copy` are STALE pre-cleanup snapshots (they still contain the
  removed root-level leftovers) — do NOT treat them as copies to sync into.
- `src/archive/dead-turtle/` holds archived superseded backends; it is excluded from
  `tsc` via `exclude: ["src/archive/**"]`. Never import from it.
- All hub features (109–260) are wired in `src/turtleFeatureRegistry.ts` → 148
  `register*Routes(app)` calls + direct server.ts registration. Verified: 0 dead
  turtle modules, 154/154 hub features resolve to registered routes.

## Commands
- `npm run dev` — start the Express server (`tsx server.ts`) on port 3000
- `npm run build` — production build (vite + esbuild → `dist/server.cjs`)
- `npm start` — run the built server
- `npm run lint` — TypeScript typecheck (`tsc --noEmit`)
- `npm test` / `npm run test:watch` — Vitest suite (38 tests, isolated temp dirs)
- Browse http://localhost:3000 (server also serves the Vite dev client)

## Architecture map
- `server.ts` — Express backend: JWT auth, posts/reels/comments/reactions, chat,
  `/api/posts/feed` (**RANKED** — engagement + recency + creator-trust, returns
  `rankingScore`), `/api/stream/token` (multi-API-key rotation + admin runtime
  key registry fallback, returns `configured:false` gracefully without keys),
  `/api/meet/*` (random video matchmaking, interest-priority + 8s fallback
  pairing), plus ported groups: `/api/link-preview`, `/api/saved`,
  `/api/chat/.../join-request(s)|schedule|delete-for-me|delete-everyone`,
  `/api/chat/messages/:id/save`, `/api/chat/self-notes`, `/api/chat/random-match`,
  `/api/channels|/api/studio/stats`, `/api/discovery/nearby`, `/api/ai/image`,
  `/api/ai/summary`, `/api/auth/sessions`, `/api/admin/stream-keys|stream-usage`
- `chatServer.ts` — realtime chat over the raw `ws` package (`WebSocketServer`,
  path `/ws/chat` — NOT Socket.IO), plus mesh WebRTC signaling and watch-together sync
- `turtleRankingEngine.ts` — feed ranking engine (wired into `/api/posts/feed`)
- `turtleNSFWFilter.ts` — client NSFW screening (fail-open; model at
  `public/models/mobilenet_v2/`)
- `SafeImage.tsx` — NSFW-safe `<img>` wrapper (fail-open, blur/block verdicts)
- `turtleNSFWServerEngine.ts` — server-side NSFW routes
- `src/components/MeetView.tsx` + `OmegleRandomVideoCall.tsx` +
  `src/calling/meetRoomMesh.ts` + `useMeetRoomMesh.ts` — the LIVE Meet flow
  (standalone mesh WebRTC: `join-room`/`all-users`/`user-connected`/
  `sending-signal`/`returning-signal` relayed over `/ws/chat` in chatServer.ts;
  random pairing via `/api/meet/match`, shared room-code group join;
  `openrelay.metered.ca` STUN/TURN/TURNS ladder)
- `src/components/ChatModal.tsx` + `src/components/call/StreamCallLayer.tsx` —
  chat + calling UI
- **`src/engine/`** — the full hybrid-engine ranking pipeline (ported verbatim
  from `hybrid-engine(algo)/src/engine/`): master scoring formula, viral-trending
  momentum, exploration bandits, online learning, user modeling, trust-safety,
  boosted-content ads, content understanding. `src/lib/hybridRanker.ts` adapts the
  app's loose posts/reels onto it; it powers the live feed + reels ranking.
- **`src/lib/reco/`** — ATLAS-RANK production ranking math (ported from
  `architecture (1)/src/lib/reco/`): `masterFeedScore`, MMR diversity rerank,
  ad auction, integrity/anti-spam, user/creator modeling, plus `advanced/`
  (ScaNN ANN, FTRL-proximal, SlateQ/CQL RL, deep rankers). Wired as
  `/api/feed/atlas-rank`.
- **`src/lib/matchmaking.ts`** — interest-tag matchmaking queue (ported from
  `manus-omegle-stream/server/matchmaking.ts`); drives `/api/meet/match`
  (shared-interest priority → 8s-wait fallback).
- **`src/lib/streamApiManager.ts`** — Stream multi-key manager (adapted from
  `manus-omegle-stream/server/apiManager.ts`): per-key concurrency caps,
  lifetime budgets, auto-switch, per-user call caps; drives `/api/stream/*`.
- `src/reference/` — DB-coupled originals kept for the record (excluded from
  `tsc` via tsconfig `exclude`): ATLAS `pipeline/store/seed/ingest`,
  manus originals, nsfw-filter `Model`/`LRUCache`/classifiers.
- **`src/components/CommunitySection.tsx` + `src/turtleCommunityBackend.ts` +
  `/api/community/*`** — Events / Q&A / Topics / Creator Studio / Rewards / Tips
  (ported from base44-social-media + arena-ai). State in `community.json`.
- `src/components/InteractiveDemo.tsx` + `ArchitectureDiagram.tsx` — visual demo
  of the hybrid-engine ranking pipeline (from hybrid-engine(algo)).
- `src/server/{env,llm,voiceTranscription}.ts` + `/api/ai/*` — LLM tool-calling,
  voice transcription, model list (ported from manus-omegle-stream `_core`;
  degrade gracefully when `BUILT_IN_FORGE_API_URL/KEY` are unset).
- `src/lib/{haptics,utils,trust,moderation,base44Utils}.ts/.js` +
  `imageCompressor.ts` + `ringtoneSynth.ts` + `countries.ts` — utility ports.
- `docs/specs/*.md` — ATLAS-RANK design specs (from architecture(1)/public/spec).
- **`src/turtle*.ts` + `src/turtleFeatureRegistry.ts`** — the feature backend layer:
  **163 turtle modules**, of which **148 are registered in `registerOceanFeatures(app)`**
  (features 109–260) and 15 are shared engines/helpers (coins, JSON store, ranking,
  emergency rate-limit pools, server-context, etc.) wired directly in `server.ts`/
  `chatServer.ts`. Each module exports `registerXxxRoutes(app)` and owns its routes +
  data model. Verified: 0 dead modules, 0 registry imports never invoked.
  Analyzer: `scripts/analyze-turtle-imports.mjs` (report in `scripts/turtle-import-graph-report.md`).
- **`src/test/`** — Vitest suite (38 tests, 6 files): auth (incl. login 429 rate-limit),
  feed + NSFW text filter, chat, upload validation, NSFW pure functions, emergency-pools
  auth regression. Runs in isolated temp dirs (`NODE_ENV=test`, `startServer()` skipped,
  Firestore disabled) — never touches real `database.json`.
- **`scripts/`** — verification tooling: `extract-routes.mjs` (955-route inventory),
  `verify-feature-wiring.mjs` (hub→component→route cross-check), `analyze-turtle-imports.mjs`.

## JSON DB & Firestore sync
- Data lives in JSON files: `database.json` (users/posts/messages/etc.),
  `community.json` (events/Q&A/topics/rewards), `sessions.json` (login sessions),
  `stories.json`/`databrain.json`/`miniapps.json`/`liveeco.json`/`snapmap.json`.
- `loadDatabase()`/`saveDatabase()` (via `src/turtleServerContext.ts`) read/write these
  files synchronously. Paths are overridable via `DB_FILE`/`SESSIONS_FILE` env (tests
  use this).
- Firestore sync is a **best-effort mirror** (Admin SDK): periodic save + load-on-boot,
  graceful fallback to local files when credentials are missing. It is NOT the source
  of truth. `firestore.rules` requires auth (server-only writes).

## Recent fixes — DO NOT REGRESS
1. **NSFW**: model files added to `public/models/mobilenet_v2/`; thresholds
   recalibrated so normal photos never blur (block only porn/hentai ≥0.75 or combined
   ≥0.85; blur only sexy ≥0.92 AND explicit ≥0.10); fail-open + 60s model retry +
   4s screening timeout; bounded prediction queue.
2. **Feed**: `/api/posts/feed` ranks posts with a momentum-aware score; the
   multi-number-id timestamp bug (`post-1784102659620-655` → year 57541) is fixed
   and the always-positive noise term is now symmetric ±0.02.
3. **Stream tokens**: multi-key pool; graceful `configured:false` when keys missing.
4. **Meet**: real `/api/meet/match` polling (no fake setTimeout); interest-priority matching.
   **Meet video rooms** run on a standalone mesh engine (`src/calling/meetRoomMesh.ts`)
   — native `<video autoPlay playsInline>` boxes, real `getUserMedia` camera/mic
   toggles, and SimpleWebRTC-style mesh signaling (`join-room`/`all-users`/
   `user-connected`/`sending-signal`/`returning-signal`) in chatServer.ts (no
   REST signal polling, no glare: existing member initiates, newcomer answers).
   Regression test: `scripts/test-meet-mesh.mjs`.
5. **Calling — zero getstream.io keys required**: chat 1:1 audio/video falls back to
   built-in P2P WebRTC (signaling via the chat WebSocket); group meetings + Meet use
   Jitsi Meet via the iframe API (`src/components/call/JitsiMeeting.tsx`, host from
   `VITE_JITSI_HOST`, default `8x8.vc` with automatic `meet.jit.si` fallback —
   self-hostable from `jitsi-meet-master`).
   Stream keys are only an optional enhancement. Stream singleton fix (reconnect
   after remount); `/api/stream/upsert-target` honors the multi-key manager.
6. **Videos**: missing `/uploads/*` now return 404 (not index.html); unplayable
   containers (mkv/avi/flv/wmv) rejected at upload; feed videos show native controls.
7. **Dark mode**: `@custom-variant dark` added so `dark:*` utilities follow the
   in-app `.dark` class toggle (Tailwind v4 default is media-query only).
8. **2FA**: TOTP flow (setup → verify → login challenge) + `MASTER_KEY`-gated admin
   console + encrypted backup + badges.

## Env vars (see `.env.example`) — empty ⇒ feature degrades/off
`STREAM_API_KEY`/`STREAM_SECRET_KEY` (+ `_2`, `_3`), `GEMINI_API_KEY`, `JWT_SECRET`,
`TELEGRAM_BOT_TOKEN`, `REDIS_URL`, `MASTER_KEY`, `SUPABASE_URL`, `SERVICE_ROLE_KEY`,
`APP_URL`.

## Known publish blockers (fix before production)
Updated 2026-08-15 — the production-demo hardening pass (dotenv wiring, `.env`,
helmet/CORS allow-list, untracking the Firebase config) is DONE; see
`FINAL_READINESS_REPORT.md` for the full audit. Remaining:
- **P1** Real API keys are still unset: `.env` exists (gitignored) with a secure
  random `JWT_SECRET` + `CORS_ORIGIN`, but `STREAM_*`, `GEMINI_API_KEY`,
  `MASTER_KEY`, `SERVICE_ROLE_KEY`, `TELEGRAM_BOT_TOKEN` are empty ⇒ AI/Stream/
  Firestore features degrade gracefully. Production **fails closed** (refuses to
  start) when `JWT_SECRET` is missing; boot with `NODE_ENV=production` (env vars
  override `.env`) for fail-closed validation + the HTTPS warning.
- **P1** `firebase-applet-config.json` is now **untracked** (`git rm --cached`, still
  gitignored + on disk) — rotate the web API key for hygiene since it lives in git
  history.
- **P2** Server-side open_nsfw model folder (`server_models/`) is missing — the client
  TF.js path is the active screen (fail-open) and works; a loud startup warning is
  printed and the server falls back to the client mobilenet_v2 model automatically.
- **P2** Login rate limiter is in-memory (per-email 30s lockout, tested) — swap to
  Redis-backed `express-rate-limit` for launch.
- **P2** Video calls require HTTPS in production (getUserMedia).
- **P2** `MASTER_KEY` unset uses a legacy dev fallback with a loud warning.
- **P2** For a real deployment set `CORS_ORIGIN` to the deployed origin (allow-list is
  `http://localhost:5173,http://localhost:3000` by default); the CSP is intentionally
  permissive (CDN scripts/wasm, ws:, data:/blob:, Jitsi frame) — tighten `script-src`
  to exact CDN hosts before a public launch.

## Fixed (do NOT re-introduce)
- JWT fallback: **no hardcoded mock secret** — dev generates an ephemeral random
  secret; `validateStartupEnvironment()` exits in production when secrets are missing.
  (`.env` now supplies a real one; keep it gitignored.)
- `firestore.rules`: **no wide-open `allow read, write: if true`** — auth required,
  server-only writes, users may edit only their own profile.
- Emergency pools auth: all `/api/emergency/pools*` mutating routes mount `requireAuth`
  (regression test in `src/test/emergency.test.ts`).
- CORS: **no `Access-Control-Allow-Origin: *`** — server.ts uses `helmet()` (custom
  CSP) + `cors({ origin: CORS_ORIGIN allow-list, credentials: true })`. Keep the
  allow-list; never re-add the wildcard middleware.
- `.env` loading: `import 'dotenv/config'` is the **first import in server.ts** —
  removing it silently disables `.env` (dotenv is NOT auto-loaded).
- `firebase-applet-config.json`: untracked via `git rm --cached` and matched by
  `.gitignore` — keep it out of git (do not `git add -f` it back).

## Reference features in sibling folders (port only if asked)
- `../architecture-y/src/lib/reco/` — ATLAS-RANK production feed algorithm
- `../manus-omegle-stream/server/` — production Omegle matchmaking (apiManager, matchmaking)
- `../real-time-messaging-module22/src/` — voice notes, call history, read receipts
- `../base44-social-media/src/` — admin panel, report/emergency UI
- `../nsfwjs-master/nsfwjs-master/models/mobilenet_v2/` — NSFW model source

## Ported features (batch port from surveyed sibling folders)
Chat (ChatModal.tsx + chatServer.ts + server.ts):
- **Slash commands** (`/help /clear /watch /schedule /block /report`) + autocomplete
  palette (from `bitchat-main`).
- **Link previews** — `LinkPreviewCard.tsx` + `POST /api/link-preview` unfurls
  og:title/description/image/site/favicon (from Tinode urlpreview).
- **Saved messages / notes-to-self** — `SavedMessagesPanel.tsx` +
  `POST /api/chat/messages/:id/save`, `GET /api/saved`, `POST /api/chat/self-notes`
  (self-conversation), header bookmark button (from Tinode `slf`).
- **Per-user soft delete** — `delete-for-me` + `delete-everyone` tombstone
  (admin/owner past the 10-min window) (from Tinode DeletedFor).
- **Scheduled messages** — `POST /api/chat/conversations/:id/schedule`, 15s
  delivery ticker, `CalendarClock` picker (from rtm22).
- **Group join-request moderation** — `join-request` / `join-requests` /
  `approve` / `reject` routes + admin panel + realtime `join_request` events
  (from rtm(1)).
- **Member roles/kick/mute/ban** — `PATCH .../members/:userId`, enforced server-side
  in chatServer message handler (from rtm(1)).
- **Watch together** — `WatchTogetherModal.tsx` synced YouTube via `watch_sync`
  WS events (from jitsi shared-video).

Security & settings (App.tsx settings panel):
- **Login activity / device list** — `LoginActivitySection.tsx` +
  `GET /api/auth/sessions`, `POST /api/auth/sessions/revoke`; sessions now store
  IP + User-Agent (from arena-ai).
- **Recovery-phrase position verification** — `RecoveryVerifyModal.tsx`
  (from arena-ai verifyRecoveryPositions).
- **NSFW strictness slider + filter modes** — `NSFWStrictnessSettings.tsx` +
  `src/lib/nsfwSettings.ts`; `NSFWMediaGuard.tsx` honors strictness (lenient/
  balanced/strict) and blur/grayscale/hide modes (from nsfw-filter).

Community / discovery (Explore Feature Hub):
- **Emergency Community Pools** — `EmergencyView.tsx` +
  `turtleEmergencyPoolsBackend.ts` (create/join/contribute/claim/vote/disburse)
  (from base44 emergency page).
- **Creator Studio** — `CreatorStudioView.tsx` + channels/videos REST API
  (`/api/channels`, `/api/studio/stats`) (from base44 creator studio).
- **Geohash nearby discovery** — `GeohashDiscovery.tsx` +
  `/api/discovery/nearby`, `/api/discovery/location` (privacy-safe ~11km cells)
  (from base44 geohash/grid_cell).
- **Encrypted time capsules** — `EncryptedTimeCapsuleModal.tsx` (AES-GCM +
  PBKDF2 passphrase, localStorage) (from base44).
- **Random text DM** — `RandomTextDmView.tsx` + `/api/chat/random-match`
  (from base44 random text DM).
- **Away Summary** — `AwaySummaryCard.tsx` + `POST /api/ai/summary` (LLM digest
  with heuristic fallback) (from base44).
- **Stream API admin dashboard** — `StreamAdminDashboard.tsx` +
  `/api/admin/stream-keys|stream-usage` CRUD + runtime key registry fallback in
  `/api/stream/token` (from manus apiManager).
- **AI image generation** — `POST /api/ai/image` (Gemini Imagen if key present,
  SVG placeholder otherwise).
- **Ranking demo wiring** — `InteractiveDemo.tsx` + `ArchitectureDiagram.tsx`
  now reachable from the Explore Feature Hub (hybrid-engine).
- **RTL toggle** — `isRtl` state flips `document.dir`, persisted to localStorage.

## Final verification (2026-08-15) — current state
- `npx tsc --noEmit` → clean · `npm run build` → succeeds · `npm test` → 38/38 pass.
- **955 routes**: 833 require auth (87%), 20 admin-gated, 102 intentionally public
  (auth endpoints, guest-capable content with explicit `guestId` contract, stateless
  AI tools, health/static). Inventory: `scripts/route-inventory.json`.
- **154/154 hub features** (109–260) wired: component exists + rendered in hub + every
  API call resolves to a registered route. Table: `scripts/feature-wiring.json`.
- **0 dead turtle modules**; all 148 registry `register*` calls are invoked.
- Feature statuses (✅/⚠️/🧪/🔧) are documented honestly in `FEATURES.md` — simulated
  sub-parts (Bluetooth mesh, hardware wallet, satellite, weather APIs, police filing,
  govt-job/scolarship ingestion, biometric unlock, ad revenue) are labeled in-UI and in
  the doc; no over-promising.
