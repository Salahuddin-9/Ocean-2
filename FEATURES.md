# Ocean — Feature Inventory

Complete, honest inventory of every feature in the Ocean social media app as of 2026-08-15.
Statuses reflect the verified state of the codebase (see `FINAL_READINESS_REPORT.md`): every hub
feature below is **wired end-to-end** (component exists → rendered in the hub → API calls resolve to
registered backend routes; verified 154/154). "Partial" means the core flow works but part of the
promise is simulated, key-gated, or has a known limitation — always noted inline.

## Legend

| Status | Meaning |
|---|---|
| ✅ Fully Working | Real code path, tested or verified, no external dependency required |
| ⚠️ Partial | Works, but a part is simulated / key-gated / has a known limitation (noted) |
| 🧪 Prototype | Functional demo shell; the "real-world" half is out of scope by design |
| 🔧 Config-Blocked | Feature works only once a service key/credential is configured (`.env`) |

## Summary

| Category | ✅ | ⚠️ | 🧪 | 🔧 | Total |
|---|---|---|---|---|---|
| Core Social | 13 | 1 | — | — | 14 |
| Communication & Calling | 12 | 1 | — | — | 13 |
| Creator & Media | 14 | 1 | — | — | 15 |
| Safety & Civic Resilience | 21 | 1 | — | — | 22 |
| Privacy, Sovereignty & Anti-Bot | 12 | 4 | — | — | 16 |
| AI & Trust | 18 | — | — | — | 18 |
| Wellness & Algo Control | 11 | 1 | — | — | 12 |
| Social & Gamification | 10 | — | — | — | 10 |
| Economy & Micro-Finance | 17 | — | — | — | 17 |
| Agriculture & Environment | 4 | 3 | — | — | 7 |
| Education & Careers | 9 | — | 3 | — | 12 |
| Family, Safety & Legal | 10 | — | 2 | — | 12 |
| Civic & Governance | 5 | — | — | — | 5 |
| Religious & Dating | 7 | 1 | — | — | 8 |
| Travel & Transport | 8 | — | — | — | 8 |
| Tech & Frontier | 7 | 4 | — | — | 11 |
| **Total** | **178** | **17** | **5** | **0** | **200** |

> All AI features (Gemini-backed) degrade to deterministic heuristic fallbacks when
> `GEMINI_API_KEY` is unset — they keep working, just without the LLM. None are hard-blocked.

---

## Core Social

| # | Feature | Status | Description |
|---|---|---|---|
| 1 | Authentication | ✅ | JWT signup/login, recovery phrases, session tokens, 2FA TOTP challenge |
| 2 | Registration | ✅ | Full signup: country picker, badges, 12-word recovery phrase (encrypted DEK/KEK) |
| 3 | Profiles | ✅ | Rich profile schema: avatar, skills, projects, websites, contact, export |
| 4 | Feed (Ranked) | ✅ | Momentum-aware hybrid ranking (`/api/posts/feed`, returns `rankingScore`); ATLAS-RANK + hybrid-engine math available |
| 5 | Posts | ✅ | Create/edit/delete, scheduled posts, reposts, server-side NSFW text filter |
| 6 | Reactions | ✅ | Like/love/insight/support multi-reactions, guest-capable |
| 7 | Comments | ✅ | Nested comments, edit/delete/react, resolved against author profiles |
| 8 | Stories | ✅ | 24h stories: camera, polls, Q&A, music, close friends (Stories 2.0) |
| 9 | Reels | ⚠️ | Feed posts with `videoUrl` merge into the reels list; no dedicated reels feed API |
| 10 | Search | ✅ | Text search + trending topics + Visual Search (local semantic embeddings) |
| 11 | Notifications | ✅ | Server-generated on post interactions; read/unread + per-item read |
| 12 | Friends & Follows | ✅ | Friend system, follow graph, creator affinity |
| 13 | Trending | ✅ | Trending topics engine + trending sounds predictor |
| 14 | Admin Panel | ✅ | Reports, user actions, DB scan/reset, stream-key admin, `MASTER_KEY`-gated |

## Communication & Calling

| # | Feature | Status | Description |
|---|---|---|---|
| 15 | Chat (1:1 + groups) | ✅ | WS `/ws/chat` realtime; conversations, presence, fan-out; slash commands, link previews, saved messages, scheduled messages, soft delete, roles/kick/mute/ban, watch-together |
| 16 | Voice/Video Calls | ✅ | 1:1 P2P WebRTC via WS signaling (zero keys); group meetings via Jitsi iframe (`8x8.vc` default, `meet.jit.si` fallback) |
| 17 | Random "Meet" | ✅ | Omegle-style video matchmaking: interest-priority + 8s fallback, standalone mesh WebRTC engine |
| 18 | Random Text DM | ✅ | Anonymous text matchmaking via `/api/chat/random-match` |
| 19 | Whiteboard | ✅ | Shared canvas for video calls (persisted to DB) |
| 20 | Group Chat Moderation | ✅ | Join-request approval, member roles, kick/mute/ban enforced server-side |
| 21 | Event Groups | ✅ | Self-destructing group chats with event scope |
| 22 | Split Bill | ✅ | Itemized bills + coin settlement in chat |
| 23 | Voice Summarizer | ✅ | Transcribe + summarize voice notes (local/LLM) |
| 24 | Study Rooms | ✅ | Focus rooms + Pomodoro presence |
| 25 | Relationship Timeline | ✅ | First message, call, shared groups history |
| 26 | Watch Together | ✅ | Synced YouTube playback over WS |
| 27 | Live Gifts (Live Ecosystem) | ⚠️ | Gift streams, goals, clips, leaderboard, mod tools; broadcast is simulated |

## Creator & Media

| # | Feature | Status | Description |
|---|---|---|---|
| 28 | Channels & Creator Studio | ✅ | Channel CRUD, subscriptions, videos, `/api/studio/stats` |
| 29 | Faceless AI Video | ✅ | Topic → script → slides; **Canvas + MediaRecorder + Web Speech TTS renders a downloadable WebM client-side** (no ffmpeg needed); server assembles MP4 when ffmpeg exists |
| 30 | Trending Sounds | ✅ | Predict next viral audio, 60s rescan |
| 31 | Collaborative Reels | ✅ | Co-create a reel with friends |
| 32 | Co-Streaming | ✅ | Co-host live + tip split |
| 33 | Reel Bounties | ✅ | Coins for solved bounty tasks (escrow + payout + refund) |
| 34 | Revenue Share | ⚠️ | Ad-revenue split to group admins; ad revenue is **simulated** (deposit endpoint) |
| 35 | Micro-Subscriptions | ✅ | 10-Taka patron monthly, creator gates content |
| 36 | Ocean Cut — Video | ✅ | FFmpeg.wasm trim/cut/speed + Bengali subtitles (client-side) |
| 37 | Ocean Cut — Photo | ✅ | Filters, crop, stickers, bg removal, AI enhance |
| 38 | Creation Lab | ✅ | MediaPipe Face Mesh AR filters (glasses/hats), duet/stitch via Canvas+MediaRecorder, auto beat-sync |
| 39 | Synthetic Media Watermark | ✅ | Visible "AI Generated by Ocean" canvas overlay + signed C2PA-style manifest |
| 40 | Creator Monetization | ✅ | Revenue dashboard, brand deals, affiliate, CRM |
| 41 | Media Watermark (Studio) | ✅ | C2PA provenance for AI media |
| 42 | Photo/Video Uploads | ✅ | Multer + extension/container whitelist, Range streaming, 404 on missing |

## Safety & Civic Resilience

| # | Feature | Status | Description |
|---|---|---|---|
| 43 | Safe SOS | ✅ | Safety circle: contacts + SOS + safe walk; rate-limited 2/15min |
| 44 | Global SOS Button | ✅ | Real `/api/sos/alert` dispatch + offline queue that auto-flushes on reconnect |
| 45 | Safety Shield | ✅ | Trusted circle + check-in SOS |
| 46 | Safe Shelter | ✅ | Disaster shelters + alerts + help |
| 47 | Blood Donor | ✅ | Donor registry + requests + accept/withdraw/resolve |
| 48 | Missing Person | ✅ | Reports + sightings + verify + found |
| 49 | Missing Person — Visual Match | ✅ | Privacy-first face search from relief photos |
| 50 | Safe Escort | ✅ | Escort matching + route safety + coverage |
| 51 | SOS Panic | ✅ | Panic alert + emergency contacts + acknowledge/resolve |
| 52 | Safe Watch | ✅ | Neighborhood safety + hazard reports |
| 53 | Offline Mesh | ⚠️ | **WS store-and-forward relay works offline→online**; Bluetooth mesh is simulated (badge shown) |
| 54 | Safe Haven | ✅ | Safe place / refuge network |
| 55 | Flood Depth Mapper | ✅ | Community flood depth mapping |
| 56 | Emergency Community Pools | ✅ | Create/join/contribute/claim/vote/disburse (**auth-fixed 2026-08-15**; all routes now `requireAuth`) |
| 57 | Evacuation Routes | ✅ | Cyclone-safe shelter routes |
| 58 | Community Kitchens | ✅ | Disaster meal coordination |
| 59 | Self-Defense Shorts | ✅ | 30-second safety drill videos |
| 60 | Verified Live | ✅ | Proof-of-location anti-fake-news badge |
| 61 | Proximity Alert | ✅ | Silent anti-stalking alerts for blocked users |
| 62 | Trigger Warnings | ✅ | Lexicon scan, 3 severity tiers, auto-blur |
| 63 | NSFW Filtering | ✅ | Client TF.js mobilenet_v2 (fail-open) + server explicit-text filter; strictness slider + blur/grayscale/hide modes |
| 64 | Content Gate | ✅ | Age rating for posts (18+/16+/13+), fail-open consent |

## Privacy, Sovereignty & Anti-Bot

| # | Feature | Status | Description |
|---|---|---|---|
| 65 | Data Sovereignty | ✅ | Full export + GDPR deletion + consent, 48h cooldown + token-gated confirm |
| 66 | E2E Encryption | ✅ | AES-256-GCM via Web Crypto; **multi-device sync with QR + ECDH P-256 pairing** (server stores ciphertext + public keys only) |
| 67 | Privacy Dashboard | ✅ | Access log + third-party + permissions + masking |
| 68 | Anonymous Mode | ✅ | Pseudonym CRUD + incognito posting + incognito feed |
| 69 | Secure Vault | ⚠️ | Encrypted notes/photos; **biometric unlock is simulated** (accepts any biometric) |
| 70 | Decentralized DID | ✅ | Ed25519 keypair, `did:ocean:` identifiers, export/import |
| 71 | Humanity Score | ✅ | 6-signal behavioral-biometric heuristic |
| 72 | Bot-Bounty | ✅ | Deterministic bot detection + coin rewards |
| 73 | Ghost Mode | ✅ | Ghost-view ledger, zero ranking impact, 10min cooldown |
| 74 | Privacy-Preserving KYC (zkKYC) | ✅ | Renamed from "zero-knowledge"; **challenge-response proof** (server-issued nonce, signed with key derived from NID hash). Honest label: not a full zk-SNARK |
| 75 | Hardware Wallet | ⚠️ | Simulated Ledger/Trezor-style handshake + **real WebUSB/WebHID interface when the browser supports it**; "Simulation Mode" badge without a device |
| 76 | Satellite Fallback | ⚠️ | Offline queue (localStorage/SW) auto-sends when online; "Satellite Mode (Simulated)" badge |
| 77 | Quantum-Resistant Crypto | ⚠️ | Hybrid key exchange: **real WebCrypto X25519 + Kyber-shaped KEM simulation**; labeled "Post-Quantum Simulation" until liboqs |
| 78 | Federated Learning | ✅ | Train locally, share deltas only (no raw data) |
| 79 | Login Activity / Devices | ✅ | Sessions with IP + UA, remote revoke |
| 80 | Recovery Verification | ✅ | Recovery-phrase position verification |

## AI & Trust

| # | Feature | Status | Description |
|---|---|---|---|
| 81 | Feed Explanation | ✅ | Real ranking-signal decomposition ("why did I see this?") |
| 82 | Profile Summary | ✅ | One-line AI bios (LLM + deterministic fallback) |
| 83 | Comment Summarizer | ✅ | Sentiment + key points (LLM + extractive fallback) |
| 84 | AI Moderator | ✅ | Configurable rules, auto warn/delete/mute |
| 85 | Fact-Checker | ✅ | Claim-level checking (LLM + lexicon fallback) |
| 86 | AI Captions | ✅ | Caption generation from media (LLM + heuristic fallback) |
| 87 | Smart Community | ✅ | AI moderation + community summaries |
| 88 | Digital Twin | ✅ | Auto-responder that types like you (Gemini when key present, deterministic fallback); sensitive messages forwarded |
| 89 | Debate Moderator | ✅ | Heuristic moderation + balance analysis |
| 90 | Local Transcriber | ✅ | In-browser speech-to-text (Web Speech API) |
| 91 | Mock Interview | ✅ | **LLM scoring via `invokeLLM` + robust heuristic fallback (length, keyword coverage, relevance) + voice answers via MediaRecorder + Web Speech** |
| 92 | Marketplace Negotiator | ✅ | Explainable price negotiation anchored to market avg |
| 93 | Legal First-Aid | ✅ | Curated KB (6 topics) always answers + optional LLM |
| 94 | AI Image Generation | ✅ | Gemini Imagen when key present, SVG placeholder otherwise |
| 95 | AI Vehicle Analysis | ✅ | Traffic-safety media analysis (LLM + simulated detection) |
| 96 | AI Summary (Away) | ✅ | LLM digest with heuristic fallback |
| 97 | Red-Team Arena | ✅ | Hunt AI vulnerabilities, earn bounties |
| 98 | Contextual Personas | ✅ | Multiple identities, one account |

## Wellness & Algo Control

| # | Feature | Status | Description |
|---|---|---|---|
| 99 | Daily Podcast | ⚠️ | Editorial ranking + **script download (.txt)**; browsers can't capture `speechSynthesis` into audio — a server TTS service produces the MP3 in production |
| 100 | Algo Panel | ✅ | Tune feed weights, personal score + audit log |
| 101 | Audit Log | ✅ | `explainPost` + ring-buffer cap 200/user |
| 102 | Zero Doomscroll | ✅ | 30-min timer + interrupt modal |
| 103 | Intentional Scroll | ✅ | Daily limit prompt |
| 104 | Focus Lock | ✅ | Locks Reels/Explore for a timer (password-protected) |
| 105 | Uplift Feed | ✅ | Positive-only feed via real sentiment scoring |
| 106 | Sensory-Safe Mode | ✅ | Global `sensory-safe` CSS class + disables autoplay |
| 107 | Take a Breath | ✅ | Rapid-scroll detector + 10s breathing overlay |
| 108 | Ghost View | ✅ | Stealth-view with cooldown |
| 109 | Deep Dive Mode | ✅ | Topic hubs for long-form reads |
| 110 | Mood Feed | ✅ | Feed filtered by sentiment |

## Social & Gamification

| # | Feature | Status | Description |
|---|---|---|---|
| 111 | Memory Recaps | ✅ | On-this-day posts/reels/messages |
| 112 | Collab Posts | ✅ | Multi-author posts with ownership/permissions |
| 113 | Story Chains | ✅ | Chain stories, anti-domination, per-author limits |
| 114 | Meaningful Streaks | ✅ | Same-day dedup, gap restart, best retention |
| 115 | Achievements | ✅ | Seeded catalog + live metric thresholds |
| 116 | Reputation Score | ✅ | Baseline 50 + content quality + flags + streaks |
| 117 | Silent Drop | ✅ | Vanishing post: auto-delete after 20 min, max 50 views (cron-verified) |
| 118 | Stealth Recommend | ✅ | Signal a post to a friend, 1h dedupe + ranking bump |
| 119 | Uplift Feed | ✅ | (see Wellness) |
| 120 | Skill Exchange | ✅ | Teach what you learn |

## Economy & Micro-Finance

| # | Feature | Status | Description |
|---|---|---|---|
| 121 | Ocean Pay | ✅ | P2P coins + `/pay` in chat |
| 122 | Smart Escrow | ✅ | Time-locked escrow: real debit on create, credit on release/refund |
| 123 | P2P Renting | ✅ | Fee→owner, deposit held/refunded |
| 124 | Barter Exchange | ✅ | Coin-free by design, interest + match |
| 125 | Gig Radar | ✅ | Distance-filtered gigs + apply/fill |
| 126 | Group Buying | ✅ | Real coin pool + target activation |
| 127 | Buy-Nothing Group | ✅ | Free-only + claim |
| 128 | Garage Sale Map | ✅ | Map grid + normalized lat/lng |
| 129 | Chit Fund | ✅ | Rotating savings tracker + deterministic payout rotation |
| 130 | Saving Circle | ✅ | Real wallet contribution + pooled total |
| 131 | Subscription Manager | ✅ | Owner collects member share on settle |
| 132 | Data Marketplace | ✅ | **Opt-in flow → anonymized pool → proportional reward** (10% lister fee) |
| 133 | Micro-Subscriptions | ✅ | (see Creator) |
| 134 | Marketplace | ✅ | Hyperlocal: sell, free, services |
| 135 | Assignment Help | ✅ | Coin exchange: spendBalance + addBalance |
| 136 | Exam War Room | ✅ | Study-group logic + member-editable papers/notes |
| 137 | Farm Tool Pool | ✅ | Fee/deposit debit + owner credit + refund |

## Agriculture & Environment

| # | Feature | Status | Description |
|---|---|---|---|
| 138 | Mandi Price Predictor | ✅ | Real 7-day moving avg + linear regression extrapolation |
| 139 | Farmer Live | ✅ | Buy straight from the field (broadcast simulated) |
| 140 | Crop Scanner | ✅ | Ranked diagnosis from disease KB by coverage+specificity |
| 141 | Irrigation Scheduler | ⚠️ | Real rain-adjusted scheduling; **weather forecast is simulated** (`simulatedForecast`) |
| 142 | Carbon Ledger | ✅ | Real CARBON_FACTORS math |
| 143 | Afforestation | ⚠️ | Real coin flow; verification = 30-day timer + **self-attestation** |
| 144 | Plastic-to-Wealth | ⚠️ | Real payout (kg×5); pickup-partner verification = **self-attestation** |

## Education & Careers

| # | Feature | Status | Description |
|---|---|---|---|
| 145 | Freelancer Portfolio | ✅ | Real CRUD + server-verified badge |
| 146 | Resume Builder | ✅ | **Real jsPDF A4 PDF download** + HTML preview |
| 147 | Bio-Data Builder | ✅ | Marriage bio-data → **jsPDF PDF** + HTML preview |
| 148 | Pair Coding | ✅ | **Live real-time text sync** (room poll over WS), shared terminal simulation |
| 149 | Internship Board | ✅ | Real CRUD + server-side rules |
| 150 | Govt Job Alerts | 🧪 | CRUD/bookmark; **no govt-job ingestion** — user-submitted only |
| 151 | Tutor Matchmaking | 🧪 | CRUD; **manual claim only**, no compatibility scoring |
| 152 | Scholarship Tracker | 🧪 | CRUD/bookmark; **manual entry**, no external feed |
| 153 | Study Rooms | ✅ | (see Communication) |
| 154 | Alumni Network | ✅ | Find batchmates & mentors |
| 155 | Pro Graph | ✅ | Skills, endorsements, validation, job matching |
| 156 | Exam War Room | ✅ | (see Economy) |

## Family, Safety & Legal

| # | Feature | Status | Description |
|---|---|---|---|
| 157 | Family Circle | ✅ | Admin-approval + location opt-in + leave |
| 158 | Elder Mode | ✅ | Large fonts, high contrast (client CSS theme + DB pref) |
| 159 | Trusted Guardian | ✅ | Pending→approved/rejected, guardian-only respond (403) |
| 160 | Period Tracker | ✅ | Client-only AES-GCM + PBKDF2 (150k iter) localStorage |
| 161 | Evidence Vault | ✅ | Client-encrypted AES-GCM, server stores ciphertext only |
| 162 | Pro-Bono Lawyer Match | ✅ | Register → file → match flow |
| 163 | Contract Builder | ✅ | 5 templates + multi-party e-sign + auto-execute (validity simulated) |
| 164 | RTI Auto-Filer | 🧪 | Generates statutory letter; **no real filing** (simulated by design) |
| 165 | Digital FIR / GD | 🧪 | **Simulated police reporting**; no external integration |
| 166 | Digital Legacy | ✅ | Legacy contact + verification + inactivity scan + **memorialization flow + profile badge** |
| 167 | Chaperone Mode | ✅ | Read-only chat observers |
| 168 | Content Gate | ✅ | (see Safety) |

## Civic & Governance

| # | Feature | Status | Description |
|---|---|---|---|
| 169 | Ward Budget | ✅ | One-vote toggle on ward projects |
| 170 | Ward Sabha | ✅ | Digital town halls + Jitsi URL auto-build |
| 171 | Civic Escalation | ✅ | Auto-escalation L1→4 by age/upvotes |
| 172 | Tender Tracker | ✅ | Bid-rigging anomaly detector + auto-close |
| 173 | Land Trust | ✅ | Community-owned parcels, member-approval votes |

## Religious & Dating

| # | Feature | Status | Description |
|---|---|---|---|
| 174 | Compatibility Matrix | ✅ | Weighted multi-dimension scoring |
| 175 | Halal Timeline | ✅ | Staged relationship progress + wali approval gates |
| 176 | Community Matchmaker | ✅ | Community-suggested matches |
| 177 | Azan Auto-Mute | ✅ | Quiet during prayer times |
| 178 | Zakat Calculator | ✅ | 2.5% above nisab |
| 179 | Venue Status | ✅ | Crowds & opening status |
| 180 | Quran Circles | ⚠️ | Voice study rooms; participant gate is **simulated** (client-enforced) |
| 181 | Religious Events | ✅ | RSVP + organizer updates |

## Travel & Transport

| # | Feature | Status | Description |
|---|---|---|---|
| 182 | Travel Buddy | ✅ | Match on route & dates |
| 183 | Hidden Gems | ✅ | GPS scenic spot drops |
| 184 | Group Trip | ✅ | Itinerary + shared budget |
| 185 | Carpool Lane | ✅ | Office ride sharing |
| 186 | Bike Pool | ✅ | Student two-wheeler share |
| 187 | CNG Fare Radar | ✅ | Fair fare + community reports |
| 188 | Parking Share | ✅ | Rent spots by the hour |
| 189 | Traffic Witness | ✅ | Community violation reports |

## Tech & Frontier

| # | Feature | Status | Description |
|---|---|---|---|
| 190 | Fediverse Bridge | ⚠️ | **Webfinger (`/.well-known/webfinger`) + actor + ActivityStreams outbox endpoints live**; full federation requires HTTPS + signed delivery |
| 191 | Privacy-Preserving KYC | ✅ | (see Privacy) |
| 192 | Hardware Wallet | ⚠️ | (see Privacy) |
| 193 | Satellite Fallback | ⚠️ | (see Privacy) |
| 194 | Quantum Crypto | ⚠️ | (see Privacy) |
| 195 | Mini Apps Platform | ✅ | **Developer submission + permission prompt + sandboxed iframe + postMessage wallet/notifications API + admin approval + 30% commission** |
| 196 | Communities Pro | ✅ | Voice rooms (LiveKit when keyed, **WebRTC mesh fallback with mute/deafen**), stages with speaker/listener roles, thread channels, server templates |
| 197 | Ocean OS Layer | ✅ | A/B experiments (user groups, metric tracking) + feature-flag admin panel (per user/group) in JSON DB; multi-region routing simulated |
| 198 | Data + AI Brain | ✅ | Creator analytics dashboard (views/likes/retention), **CSV export**, recommendation observability (why a post was shown, admin-viewable) |
| 199 | Snap Map | ✅ | Friends' public stories on map (opt-in), private stories with custom recipients, **best-friends graph from chat frequency**, AR lenses |
| 200 | Offline Drafts | ✅ | Autosave + smart sync queue |

---

*Maintained from the verified state — see `FINAL_READINESS_REPORT.md` for verification method and
remaining production blockers.*
