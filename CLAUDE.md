# Ocean — Social Media App (Claude Code Project Guide)

## What this is
"Ocean" is a full social media platform: Facebook/Instagram-style feed (posts, reels,
comments, reactions), chat + audio/video calls (Stream Video SDK), random video chat
"Meet" (Omegle-style), friends, notifications, trending, NSFW content moderation
(NSFWJS client + open_nsfw server), and Gemini AI features.
Stack: React 18 + Vite + TypeScript frontend; single Express backend (`server.ts`) +
`ws` chat (`chatServer.ts`). Data lives in `database.json` and syncs to Firestore.

## ⚠️ CRITICAL — read before editing anything
- **The LIVE app is `src/App.tsx`** (plus `src/components/*`, `src/hooks/*`).
- The root-level non-compiling leftovers (`App.tsx`, `AppContext.tsx`, `WorldMeet.tsx`,
  `ChatModal.tsx`, `PostsSection.tsx`, `PostCard.jsx`, `PostComposer.jsx`,
  `CommentSection.jsx`, `MediaView.jsx`, `ReelCard.jsx`) and backup duplicates
  (`server-1.ts`, `App-1.tsx`, `App-2.tsx`, `App-3.tsx`, `turtleRankingEngine-1.ts`,
  `package-1.json`, `mathkit-1.ts`, `vite,config-1.ts`, `CommentsModal-1.tsx`,
  `CommentsModal-2.tsx`, root `matchmaking.ts`/`auth.ts` variants) were proven
  unreachable (0 imports, not in tsconfig/vite entry) and REMOVED. If a task mentions
  these names, the real file is under `src/components/`.
- **Two copies of the app exist**: `Ocean-V0.1/` (source of truth) and
  `G:\Ocean-V0.1-runnable\` (runnable copy WITH node_modules + dist, created from
  Ocean-V0.1). Keep changes synced to both.
  ⚠️ `G:\Ocean\` is a DIFFERENT legacy project (tRPC + Drizzle + SQLite, old layout)
  — NOT a copy of Ocean-V0.1. Do NOT sync into it or "fix" it.

## Commands
- `npm run dev` — start the Express server (`tsx server.ts`) on port 3000
- `npm run build` — production build (vite + esbuild → `dist/server.cjs`)
- `npm start` — run the built server
- `npm run lint` — TypeScript typecheck (`tsc --noEmit`)
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
- `chatServer.ts` — Socket.IO chat
- `turtleRankingEngine.ts` — feed ranking engine (wired into `/api/posts/feed`)
- `turtleNSFWFilter.ts` — client NSFW screening (fail-open; model at
  `public/models/mobilenet_v2/`)
- `SafeImage.tsx` — NSFW-safe `<img>` wrapper (fail-open, blur/block verdicts)
- `turtleNSFWServerEngine.ts` — server-side NSFW routes
- `src/components/MeetView.tsx` + `OmegleRandomVideoCall.tsx` +
  `src/hooks/useRandomVideoCall.ts` — the LIVE Meet flow
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
- `src/turtle*.ts` — feature engines/specs (messaging, random chat, emergency pools,
  notification, smart search, time capsule, channels, etc.)

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
5. **Calling — zero getstream.io keys required**: chat 1:1 audio/video falls back to
   built-in P2P WebRTC (signaling via the chat WebSocket); group meetings + Meet use
   Jitsi Meet via the iframe API (`src/components/call/JitsiMeeting.tsx`, host from
   `VITE_JITSI_HOST`, default `meet.jit.si` — self-hostable from `jitsi-meet-master`).
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
- `server.ts` (~line 23) falls back to a hardcoded mock JWT secret when `JWT_SECRET`
  is missing → should fail closed instead (security hole).
- `firestore.rules` is `allow read, write: if true` (wide open) → require auth.
- Server-side open_nsfw model folder (`server_models/`) is missing.
- Real API keys are not set (`.env` doesn't exist yet).
- Video calls require HTTPS in production.

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
