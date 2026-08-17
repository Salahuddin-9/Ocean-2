<div align="center">

# Ocean

A full-featured social media platform — feed, stories, reels, chat + calls, random video "Meet", safety tools, hyperlocal economy, AI features, and a 200-feature Explore hub.

**React 18 · Vite · TypeScript · Express · raw-`ws` WebSocket · WebRTC · JSON DB + Firestore sync**

</div>

---

## What is Ocean?

Ocean is a social platform with a Facebook/Instagram-style core (ranked feed, posts, comments,
reactions, stories, reels, notifications) plus three big differentiators:

1. **Communication without external keys** — 1:1 audio/video calls fall back to built-in P2P WebRTC
   (signaling over the chat WebSocket); group meetings & random "Meet" use Jitsi; no
   getstream.io keys required.
2. **A 200-feature Explore Hub** — safety & civic tools (SOS, shelters, blood donor, missing
   persons), privacy/sovereignty (E2E encryption with device pairing, data export, DIDs), AI
   (Digital Twin, Mock Interview, Fact-Checker, Faceless Video), a hyperlocal economy (escrow,
   barter, gigs, group buying), agriculture, education, civic, religious, travel and frontier
   tech (Fediverse bridge, quantum crypto simulation, mini-apps). See **[FEATURES.md](FEATURES.md)**.
3. **Honest simulation** — features that need external hardware/services (Bluetooth mesh, hardware
   wallets, satellite, weather APIs, real police filing) run as clearly-labeled simulations with a
   real code path for future integration.

## Tech Stack

| Layer | Tech |
|---|---|
| Frontend | React 18, Vite, TypeScript, Tailwind v4, Canvas/MediaRecorder/Web Speech, MediaPipe, FFmpeg.wasm |
| Backend | Express (`server.ts`), raw-`ws` WebSocket chat (`chatServer.ts`), `tsx` dev runner |
| Data | `database.json` + `community.json` + `sessions.json` (JSON files), Firestore sync (Admin SDK, graceful fallback) |
| Ranking | Momentum-aware hybrid engine (`src/engine/` + `src/lib/reco/` ATLAS-RANK math) |
| Real-time | WebSocket chat, mesh WebRTC signaling, Jitsi iframe |

## Getting Started

**Prerequisites:** Node.js 18+ (npm).

```bash
# 1. Install dependencies
npm install

# 2. (Recommended) Create your env file
cp .env.example .env
#    Fill in JWT_SECRET (≥32 chars), MASTER_KEY, and any service keys you have.
#    Everything is optional — empty keys make features degrade gracefully.

# 3. Run the dev server (Express on http://localhost:3000, serves the Vite client)
npm run dev
```

Browse to **http://localhost:3000** and sign up.

### Available scripts

| Script | What it does |
|---|---|
| `npm run dev` | Start the Express server (`tsx server.ts`) on port 3000 |
| `npm run build` | Production build (vite client + esbuild server → `dist/server.cjs`) |
| `npm start` | Run the built server |
| `npm run lint` | TypeScript typecheck (`tsc --noEmit`) |
| `npm test` | Run the test suite once (`vitest run`) |
| `npm run test:watch` | Run tests in watch mode |

## Environment Variables

All env vars are optional; **empty ⇒ the feature degrades gracefully or stays off**. See
`.env.example` for the full annotated list.

| Var | Purpose | If empty |
|---|---|---|
| `JWT_SECRET` | Auth token signing (≥32 chars) | Dev: ephemeral random secret (sessions don't survive restarts). **Production refuses to start.** |
| `MASTER_KEY` | Admin console + encrypted backups gate | Legacy dev fallback with loud warning |
| `GEMINI_API_KEY` | LLM features (Digital Twin, Interview, summaries, captions) | Deterministic heuristic fallbacks |
| `STREAM_API_KEY`/`_2`/`_3` | Stream Video SDK (optional enhancement) | P2P WebRTC / Jitsi fallback |
| `TELEGRAM_BOT_TOKEN` | Telegram OTP auth | OTP degrades |
| `REDIS_URL` | Redis (rate limiting, presence) | In-memory fallback |
| `VITE_JITSI_HOST` | Jitsi host for group meetings | `8x8.vc` default with `meet.jit.si` fallback |
| `VITE_TURN_URL`/`USERNAME`/`CREDENTIAL` | TURN for keyless P2P calls | Public STUN only (may fail on strict NATs) |
| `SUPABASE_URL`/`SERVICE_ROLE_KEY` | Optional Supabase | Off |
| `APP_URL` | Public app URL | Auto-derived |

## Architecture (30-second tour)

- **`server.ts`** — single Express backend: JWT auth, posts/feed (ranked), chat REST, uploads
  (whitelisted containers), `/api/meet/*`, `/api/stream/token`, `/api/ai/*`, sessions, admin.
- **`chatServer.ts`** — realtime chat over the raw `ws` package (`/ws/chat`, NOT Socket.IO) + mesh WebRTC signaling + watch-together sync.
- **`src/turtleFeatureRegistry.ts`** — registers **148 turtle backends** (features 109–260) onto
  the Express app. Each `src/turtle*.ts` module owns one feature's routes + data model.
- **`src/components/NewFeaturesHub.tsx`** — the Explore hub: 154 feature cards, each rendering a
  component in `src/components/`.
- **`src/calling/`** — P2P WebRTC call engine + mesh room engine + Jitsi meeting.
- **`src/engine/` + `src/lib/reco/`** — hybrid ranking pipeline and ATLAS-RANK math.
- **`database.json`** — primary data store; Firestore sync is a best-effort mirror.

## Testing

38 tests across 6 files (`src/test/`) cover auth, feed+NSFW, chat, upload validation, NSFW
filtering, and the emergency-pools auth regression. Tests run fully isolated: each worker
`chdir`s into a fresh temp dir, so the repo's real `database.json` is never touched, and
Firestore sync is disabled. Run with `npm test`.

## Known Limitations & Production Blockers

These are the honest gaps — everything else in [FEATURES.md](FEATURES.md) is fully wired and
functional (verified 154/154 hub features resolve to registered routes).

| Priority | Item | Detail |
|---|---|---|
| P1 | No `.env` in the repo | Production **refuses to start** without `JWT_SECRET` (fail-closed validation). Set real secrets before deploying. |
| P1 | `firebase-applet-config.json` is git-tracked | Contains a Firebase **web API key** (public-by-design) but should be untracked/rotated for hygiene. |
| P2 | CORS is `*` + no helmet/CSP | Fine same-origin; tighten before exposing a browser client on another origin. |
| P2 | Server-side open_nsfw model folder (`server_models/`) missing | Client TF.js NSFW path works and is the active screen; server path inert. |
| P2 | Login rate limiter is in-memory | Per-email 30s lockout works (tested); swap to Redis-backed `express-rate-limit` for launch. |
| P2 | Video calls need HTTPS | `getUserMedia` is blocked on insecure origins. |
| Simulated | Bluetooth mesh, hardware wallet, satellite channel, weather APIs, real police filing, govt-job/scolarship ingestion | Clearly labeled in-UI and documented in FEATURES.md; each has a real integration path. |

## Contributing

1. **Read [CLAUDE.md](CLAUDE.md)** first — it documents the critical layout rules (live app is
   `src/App.tsx`; root-level leftovers were removed; archive under `src/archive/` is excluded
   from `tsc`).
2. Feature work: backend route module in `src/turtle*.ts`, register it in
   `turtleFeatureRegistry.ts`, frontend component in `src/components/`, card in
   `NewFeaturesHub.tsx`.
3. Keep statuses honest: if a feature relies on a simulation or an external key, say so in the
   UI and in FEATURES.md.
4. Verify with `npm run lint && npm test && npm run build` before submitting.

## Docs

- **[FEATURES.md](FEATURES.md)** — full feature inventory with honest statuses.
- **[FINAL_READINESS_REPORT.md](FINAL_READINESS_REPORT.md)** — verification method, route
  inventory (955 routes, 87% auth-gated), security status, blockers.
- **[CLAUDE.md](CLAUDE.md)** — developer guide: architecture map, conventions, recent fixes.
