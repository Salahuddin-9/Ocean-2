# Route Inventory — Ocean

Generated 2026-08-15T16:10:57.634Z by independent extraction (all `src/turtle*.ts` + `server.ts`) and runtime sweep (3 requests per route: no-auth / valid-auth / invalid-auth).

## Summary

| Metric | Count |
|---|---|
| Total routes extracted | 957 |
| — GET | 364 |
| — POST | 564 |
| — PUT/PATCH/DELETE/USE | 29 |
| ⚠️ 4xx-BL | 533 |
| ✅ OK | 298 |
| 🚫 PUBLIC-READ | 70 |
| 🚫 PUBLIC | 37 |
| 🔒 ADMIN | 19 |
| Broken (5xx / unregistered) | 0 |

> Static auth classification (extract window) may over-flag; the **runtime** result is ground truth. "4xx-BL" = route reachable, returns a sane 4xx for a generic/empty body (missing fields, non-existent resource id, role check). All 70 "public-read" routes were spot-checked in source as intentionally public GETs (browse/list/view) or benign public POSTs (view counter, search log).

## Route table

| Method | Path | Auth | Admin | Source | Runtime | Note |
|---|---|---|---|---|---|---|
| GET | `/.well-known/webfinger` | public |  | `src/turtleFediverseBackend.ts` | 🚫 PUBLIC | works without auth, 400 on bad body |
| POST | `/api/2fa/disable` | auth |  | `server.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| POST | `/api/2fa/setup` | auth |  | `server.ts` | ✅ OK | valid-auth 200 |
| GET | `/api/2fa/status` | auth |  | `server.ts` | ✅ OK | valid-auth 200 |
| POST | `/api/2fa/verify` | auth |  | `server.ts` | ⚠️ 4xx-BL | valid-auth 401 role/state gate (e.g. conversation membership, 2FA code, vault lock) |
| GET | `/api/account/legacy` | auth |  | `src/turtleDigitalLegacyBackend.ts` | ✅ OK | valid-auth 200 |
| POST | `/api/account/legacy` | auth |  | `src/turtleDigitalLegacyBackend.ts` | ✅ OK | valid-auth 200 |
| POST | `/api/account/legacy/contact/decline` | auth | yes | `src/turtleDigitalLegacyBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| POST | `/api/account/legacy/contact/verify` | auth |  | `src/turtleDigitalLegacyBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| GET | `/api/account/legacy/requests` | auth |  | `src/turtleDigitalLegacyBackend.ts` | ✅ OK | valid-auth 200 |
| GET | `/api/achievements` | auth |  | `src/turtleAchievementsBackend.ts` | ✅ OK | valid-auth 200 |
| GET | `/api/achievements/all` | public |  | `src/turtleAchievementsBackend.ts` | ✅ OK | valid-auth 200 |
| POST | `/api/achievements/scan` | auth |  | `src/turtleAchievementsBackend.ts` | ✅ OK | valid-auth 200 |
| POST | `/api/admin/legacy/memorialize/:userId` | auth | yes | `src/turtleDigitalLegacyBackend.ts` | 🔒 ADMIN | 403 without admin key; 2xx with x-admin-key (verified) |
| POST | `/api/admin/legacy/scan` | auth | yes | `src/turtleDigitalLegacyBackend.ts` | 🔒 ADMIN | 403 without admin key; 2xx with x-admin-key (verified) |
| POST | `/api/admin/posts/:postId/action` | auth | yes | `server.ts` | 🔒 ADMIN | 403 without admin key; 2xx with x-admin-key (verified) |
| GET | `/api/admin/reports` | auth | yes | `server.ts` | 🔒 ADMIN | 403 without admin key; 2xx with x-admin-key (verified) |
| POST | `/api/admin/reset-database` | auth | yes | `server.ts` | 🔒 ADMIN | 403 without admin key; 2xx with x-admin-key (verified) |
| POST | `/api/admin/scan` | auth | yes | `server.ts` | 🔒 ADMIN | 403 without admin key; 2xx with x-admin-key (verified) |
| GET | `/api/admin/stream-keys` | auth | yes | `server.ts` | 🔒 ADMIN | 403 without admin key; 2xx with x-admin-key (verified) |
| POST | `/api/admin/stream-keys` | auth | yes | `server.ts` | 🔒 ADMIN | 403 without admin key; 2xx with x-admin-key (verified) |
| DELETE | `/api/admin/stream-keys/:index` | auth | yes | `server.ts` | 🔒 ADMIN | 403 without admin key; 2xx with x-admin-key (verified) |
| POST | `/api/admin/stream-keys/:index/toggle` | auth | yes | `server.ts` | 🔒 ADMIN | 403 without admin key; 2xx with x-admin-key (verified) |
| GET | `/api/admin/stream-usage` | auth | yes | `server.ts` | 🔒 ADMIN | 403 without admin key; 2xx with x-admin-key (verified) |
| GET | `/api/admin/users` | auth | yes | `server.ts` | 🔒 ADMIN | 403 without admin key; 2xx with x-admin-key (verified) |
| POST | `/api/admin/users/:id/block` | auth | yes | `server.ts` | 🔒 ADMIN | 403 without admin key; 2xx with x-admin-key (verified) |
| POST | `/api/agri/diagnose-crop` | auth |  | `src/turtleCropDiagnosisBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| GET | `/api/agri/diseases` | auth |  | `src/turtleCropDiagnosisBackend.ts` | 🚫 PUBLIC-READ | intentional public read (200 no-auth) |
| GET | `/api/agri/farm-streams` | auth |  | `src/turtleFarmLiveBackend.ts` | 🚫 PUBLIC-READ | intentional public read (200 no-auth) |
| POST | `/api/agri/farm-streams` | auth |  | `src/turtleFarmLiveBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| POST | `/api/agri/farm-streams/:id/end` | auth |  | `src/turtleFarmLiveBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| POST | `/api/agri/farm-streams/:id/join` | auth |  | `src/turtleFarmLiveBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| POST | `/api/agri/farm-streams/:id/order` | auth |  | `src/turtleFarmLiveBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| GET | `/api/agri/irrigation` | auth |  | `src/turtleIrrigationBackend.ts` | ✅ OK | valid-auth 200 |
| POST | `/api/agri/irrigation` | auth |  | `src/turtleIrrigationBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| POST | `/api/agri/irrigation/:id/water` | auth |  | `src/turtleIrrigationBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| GET | `/api/agri/mandi` | public |  | `src/turtleMandiBackend.ts` | ✅ OK | valid-auth 200 |
| POST | `/api/agri/mandi` | auth |  | `src/turtleMandiBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| GET | `/api/agri/plantings` | auth |  | `src/turtleAfforestationBackend.ts` | 🚫 PUBLIC-READ | intentional public read (200 no-auth) |
| POST | `/api/agri/plantings` | auth |  | `src/turtleAfforestationBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| POST | `/api/agri/plantings/:id/verify` | auth |  | `src/turtleAfforestationBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| GET | `/api/agri/plastic` | auth |  | `src/turtlePlasticWealthBackend.ts` | 🚫 PUBLIC-READ | intentional public read (200 no-auth) |
| POST | `/api/agri/plastic` | auth |  | `src/turtlePlasticWealthBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| POST | `/api/agri/plastic/:id/verify` | auth |  | `src/turtlePlasticWealthBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| GET | `/api/agri/predict-price` | public |  | `src/turtleMandiBackend.ts` | 🚫 PUBLIC | works without auth, 400 on bad body |
| GET | `/api/agri/tools` | auth |  | `src/turtleFarmToolsBackend.ts` | 🚫 PUBLIC-READ | intentional public read (200 no-auth) |
| POST | `/api/agri/tools` | auth |  | `src/turtleFarmToolsBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| POST | `/api/agri/tools/:id/rent` | auth |  | `src/turtleFarmToolsBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| POST | `/api/agri/tools/:id/return` | auth |  | `src/turtleFarmToolsBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| GET | `/api/agri/weather` | public |  | `src/turtleIrrigationBackend.ts` | ✅ OK | valid-auth 200 |
| POST | `/api/ai/caption` | public |  | `src/turtleAICaptionEngine.ts` | 🚫 PUBLIC | works without auth, 400 on bad body |
| POST | `/api/ai/chat` | auth |  | `server.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| POST | `/api/ai/chat-copilot` | public |  | `src/turtleChatAiHelper.ts` | 🚫 PUBLIC | works without auth, 400 on bad body |
| POST | `/api/ai/enhance-image` | auth |  | `src/turtleVideoEditorBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| GET | `/api/ai/faceless-video` | auth |  | `src/turtleFacelessVideoBackend.ts` | ✅ OK | valid-auth 200 |
| POST | `/api/ai/faceless-video` | auth |  | `src/turtleFacelessVideoBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| GET | `/api/ai/faceless-video/:id` | auth |  | `src/turtleFacelessVideoBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| POST | `/api/ai/image` | auth |  | `server.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| GET | `/api/ai/models` | auth |  | `server.ts` | ✅ OK | valid-auth 200 |
| GET | `/api/ai/status` | auth |  | `server.ts` | ✅ OK | valid-auth 200 |
| POST | `/api/ai/subtitle-bengali` | auth |  | `src/turtleVideoEditorBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| POST | `/api/ai/suggest-captions` | public |  | `src/turtleAICaptionEngine.ts` | 🚫 PUBLIC | works without auth, 400 on bad body |
| POST | `/api/ai/summary` | auth |  | `server.ts` | ✅ OK | valid-auth 200 |
| POST | `/api/ai/transcribe` | auth |  | `server.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| GET | `/api/ai/voice-summary` | auth |  | `src/turtleVoiceSummaryBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| POST | `/api/ai/voice-summary` | auth |  | `src/turtleVoiceSummaryBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| GET | `/api/algo/audit` | auth |  | `src/turtleAuditLogBackend.ts` | ✅ OK | valid-auth 200 |
| GET | `/api/algo/audit/:postId` | auth |  | `src/turtleAuditLogBackend.ts` | ✅ OK | valid-auth 200 |
| POST | `/api/algo/audit/log` | auth |  | `src/turtleAuditLogBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| GET | `/api/algo/preferences` | auth |  | `src/turtleAlgoPrefsBackend.ts` | ✅ OK | valid-auth 200 |
| PUT | `/api/algo/preferences` | auth |  | `src/turtleAlgoPrefsBackend.ts` | ✅ OK | valid-auth 200 |
| GET | `/api/alumni` | auth |  | `src/turtleAlumniBackend.ts` | ✅ OK | valid-auth 200 |
| POST | `/api/alumni` | auth |  | `src/turtleAlumniBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| GET | `/api/alumni/:institution` | auth |  | `src/turtleAlumniBackend.ts` | ✅ OK | valid-auth 200 |
| GET | `/api/analytics/creators` | auth |  | `src/turtleDataBrainBackend.ts` | ✅ OK | valid-auth 200 |
| GET | `/api/anonymous/feed` | auth |  | `src/turtleAnonymousBackend.ts` | 🚫 PUBLIC-READ | intentional public read (200 no-auth) |
| GET | `/api/anonymous/mode` | auth |  | `src/turtleAnonymousBackend.ts` | ✅ OK | valid-auth 200 |
| POST | `/api/anonymous/mode` | auth |  | `src/turtleAnonymousBackend.ts` | ✅ OK | valid-auth 200 |
| POST | `/api/anonymous/post` | auth |  | `src/turtleAnonymousBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| DELETE | `/api/anonymous/pseudonym` | auth |  | `src/turtleAnonymousBackend.ts` | ✅ OK | valid-auth 200 |
| GET | `/api/anonymous/pseudonym` | auth |  | `src/turtleAnonymousBackend.ts` | ✅ OK | valid-auth 200 |
| POST | `/api/anonymous/pseudonym` | auth |  | `src/turtleAnonymousBackend.ts` | ✅ OK | valid-auth 200 |
| PUT | `/api/anonymous/pseudonym` | auth |  | `src/turtleAnonymousBackend.ts` | ✅ OK | valid-auth 200 |
| GET | `/api/assignment-help` | auth |  | `src/turtleAssignmentHelpBackend.ts` | 🚫 PUBLIC-READ | intentional public read (200 no-auth) |
| POST | `/api/assignment-help` | auth |  | `src/turtleAssignmentHelpBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| POST | `/api/assignment-help/:id/claim` | auth |  | `src/turtleAssignmentHelpBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| POST | `/api/assignment-help/:id/complete` | auth |  | `src/turtleAssignmentHelpBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| GET | `/api/assignment-help/mine` | auth |  | `src/turtleAssignmentHelpBackend.ts` | ✅ OK | valid-auth 200 |
| POST | `/api/auth/humanity-reset` | auth |  | `src/turtleHumanityBackend.ts` | ✅ OK | valid-auth 200 |
| GET | `/api/auth/humanity-score` | auth |  | `src/turtleHumanityBackend.ts` | ✅ OK | valid-auth 200 |
| POST | `/api/auth/humanity-score` | auth |  | `src/turtleHumanityBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| POST | `/api/auth/login` | public |  | `server.ts` | 🚫 PUBLIC | works without auth, 400 on bad body |
| POST | `/api/auth/login/2fa` | auth |  | `server.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| POST | `/api/auth/logout` | auth |  | `server.ts` | ✅ OK | valid-auth 200 |
| GET | `/api/auth/me` | auth |  | `server.ts` | ✅ OK | valid-auth 200 |
| POST | `/api/auth/otp-request` | public |  | `src/turtleSecurityTelegramOTPService.ts` | 🚫 PUBLIC | works without auth, 400 on bad body |
| POST | `/api/auth/otp-verify` | public |  | `src/turtleSecurityTelegramOTPService.ts` | 🚫 PUBLIC | works without auth, 400 on bad body |
| POST | `/api/auth/reset-confirm` | public |  | `server.ts` | 🚫 PUBLIC | works without auth, 400 on bad body |
| POST | `/api/auth/reset-request` | public |  | `server.ts` | 🚫 PUBLIC | works without auth, 400 on bad body |
| GET | `/api/auth/sessions` | auth |  | `server.ts` | ✅ OK | valid-auth 200 |
| POST | `/api/auth/sessions/revoke` | auth |  | `server.ts` | ✅ OK | valid-auth 200 |
| POST | `/api/auth/signup` | public |  | `server.ts` | 🚫 PUBLIC | works without auth, 400 on bad body |
| GET | `/api/auth/telegram-users` | public |  | `src/turtleSecurityTelegramOTPService.ts` | ✅ OK | valid-auth 200 |
| POST | `/api/auth/telegram-webhook` | public |  | `src/turtleSecurityTelegramOTPService.ts` | ✅ OK | valid-auth 200 |
| POST | `/api/auth/verify-location` | auth |  | `server.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| POST | `/api/auth/verify-password` | auth |  | `server.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| POST | `/api/auth/view-words` | auth |  | `server.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| GET | `/api/azan/prefs` | auth |  | `src/turtleAzanBackend.ts` | ✅ OK | valid-auth 200 |
| POST | `/api/azan/prefs` | auth |  | `src/turtleAzanBackend.ts` | ✅ OK | valid-auth 200 |
| GET | `/api/azan/times` | auth |  | `src/turtleAzanBackend.ts` | 🚫 PUBLIC-READ | intentional public read (200 no-auth) |
| GET | `/api/barter` | auth |  | `src/turtleBarterBackend.ts` | 🚫 PUBLIC-READ | intentional public read (200 no-auth) |
| POST | `/api/barter` | auth |  | `src/turtleBarterBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| POST | `/api/barter/:id/interest` | auth |  | `src/turtleBarterBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| POST | `/api/barter/:id/match` | auth |  | `src/turtleBarterBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| POST | `/api/blood/donor` | auth |  | `src/turtleBloodDonorBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| POST | `/api/blood/donor/optout` | auth |  | `src/turtleBloodDonorBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| GET | `/api/blood/donors` | auth |  | `src/turtleBloodDonorBackend.ts` | ✅ OK | valid-auth 200 |
| GET | `/api/blood/meta` | auth |  | `src/turtleBloodDonorBackend.ts` | 🚫 PUBLIC-READ | intentional public read (200 no-auth) |
| GET | `/api/blood/requests` | auth |  | `src/turtleBloodDonorBackend.ts` | ✅ OK | valid-auth 200 |
| POST | `/api/blood/requests` | auth |  | `src/turtleBloodDonorBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| GET | `/api/blood/requests/:id` | auth |  | `src/turtleBloodDonorBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| POST | `/api/blood/requests/:id/accept` | auth |  | `src/turtleBloodDonorBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| POST | `/api/blood/requests/:id/offer` | auth |  | `src/turtleBloodDonorBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| POST | `/api/blood/requests/:id/report` | auth |  | `src/turtleBloodDonorBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| POST | `/api/blood/requests/:id/resolve` | auth |  | `src/turtleBloodDonorBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| POST | `/api/blood/requests/:id/withdraw` | auth |  | `src/turtleBloodDonorBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| GET | `/api/blood/status` | auth |  | `src/turtleBloodDonorBackend.ts` | ✅ OK | valid-auth 200 |
| GET | `/api/botbounty/leaderboard` | public |  | `src/turtleBotBountyBackend.ts` | ✅ OK | valid-auth 200 |
| POST | `/api/botbounty/report` | auth |  | `src/turtleBotBountyBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| GET | `/api/botbounty/reports` | auth |  | `src/turtleBotBountyBackend.ts` | ✅ OK | valid-auth 200 |
| GET | `/api/bounty` | auth |  | `src/turtleBountyBackend.ts` | 🚫 PUBLIC-READ | intentional public read (200 no-auth) |
| POST | `/api/bounty` | auth |  | `src/turtleBountyBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| GET | `/api/bounty/:id` | auth |  | `src/turtleBountyBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| POST | `/api/bounty/:id/accept-comment` | auth |  | `src/turtleBountyBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| POST | `/api/bounty/:id/comment` | auth |  | `src/turtleBountyBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| POST | `/api/bounty/:id/expire` | auth |  | `src/turtleBountyBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| GET | `/api/buynothing` | auth |  | `src/turtleBuyNothingBackend.ts` | 🚫 PUBLIC-READ | intentional public read (200 no-auth) |
| POST | `/api/buynothing` | auth |  | `src/turtleBuyNothingBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| POST | `/api/buynothing/:id/claim` | auth |  | `src/turtleBuyNothingBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| GET | `/api/calls` | auth |  | `server.ts` | ✅ OK | valid-auth 200 |
| POST | `/api/calls` | auth |  | `server.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| GET | `/api/carbon` | auth |  | `src/turtleCarbonLedgerBackend.ts` | ✅ OK | valid-auth 200 |
| POST | `/api/carbon/log` | auth |  | `src/turtleCarbonLedgerBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| GET | `/api/carpool` | auth |  | `src/turtleCarpoolBackend.ts` | 🚫 PUBLIC-READ | intentional public read (200 no-auth) |
| POST | `/api/carpool` | auth |  | `src/turtleCarpoolBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| POST | `/api/carpool/:id/join` | auth |  | `src/turtleCarpoolBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| GET | `/api/cases` | auth |  | `src/turtleLawyerBackend.ts` | ✅ OK | valid-auth 200 |
| POST | `/api/cases` | auth |  | `src/turtleLawyerBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| POST | `/api/cases/:id/accept` | auth |  | `src/turtleLawyerBackend.ts` | ⚠️ 4xx-BL | valid-auth 403 role/state gate (e.g. conversation membership, 2FA code, vault lock) |
| GET | `/api/chains` | public |  | `src/turtleStoryChainsBackend.ts` | ✅ OK | valid-auth 200 |
| POST | `/api/chains` | auth |  | `src/turtleStoryChainsBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| GET | `/api/chains/:id` | public |  | `src/turtleStoryChainsBackend.ts` | 🚫 PUBLIC | works without auth, 404 on bad body |
| POST | `/api/chains/:id/add` | auth |  | `src/turtleStoryChainsBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| GET | `/api/channels` | auth |  | `server.ts` | 🚫 PUBLIC-READ | intentional public read (200 no-auth) |
| POST | `/api/channels` | auth |  | `server.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| GET | `/api/channels/:id` | auth |  | `server.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| GET | `/api/channels/:id/revenue` | auth |  | `src/turtleRevenueShareBackend.ts` | ⚠️ 4xx-BL | valid-auth 403 role/state gate (e.g. conversation membership, 2FA code, vault lock) |
| POST | `/api/channels/:id/revenue/deposit` | auth |  | `src/turtleRevenueShareBackend.ts` | ⚠️ 4xx-BL | valid-auth 403 role/state gate (e.g. conversation membership, 2FA code, vault lock) |
| POST | `/api/channels/:id/revenue/distribute` | auth |  | `src/turtleRevenueShareBackend.ts` | ⚠️ 4xx-BL | valid-auth 403 role/state gate (e.g. conversation membership, 2FA code, vault lock) |
| POST | `/api/channels/:id/subscribe` | auth |  | `server.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| GET | `/api/channels/:id/videos` | auth |  | `server.ts` | 🚫 PUBLIC-READ | intentional public read (200 no-auth) |
| POST | `/api/channels/:id/videos` | auth |  | `server.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| POST | `/api/channels/:id/videos/:videoId/like` | auth |  | `src/turtleLongFormVideoBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| GET | `/api/channels/:id/videos/:videoId/recommendations` | public |  | `src/turtleLongFormVideoBackend.ts` | 🚫 PUBLIC | works without auth, 404 on bad body |
| POST | `/api/channels/:id/videos/:videoId/report` | auth |  | `src/turtleLongFormVideoBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| POST | `/api/channels/:id/videos/:videoId/save` | auth |  | `src/turtleLongFormVideoBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| POST | `/api/channels/:id/videos/:videoId/view` | auth |  | `server.ts` | 🚫 PUBLIC-READ | intentional public read (200 no-auth) |
| POST | `/api/channels/:id/videos/:videoId/watch` | auth |  | `src/turtleLongFormVideoBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| GET | `/api/chaperone/:conversationId` | auth |  | `src/turtleChaperoneBackend.ts` | ✅ OK | valid-auth 200 |
| POST | `/api/chaperone/:conversationId` | auth |  | `src/turtleChaperoneBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| DELETE | `/api/chaperone/:conversationId/:observerId` | auth |  | `src/turtleChaperoneBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| GET | `/api/chat/conversations` | auth |  | `server.ts` | ✅ OK | valid-auth 200 |
| POST | `/api/chat/conversations` | auth |  | `server.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| POST | `/api/chat/conversations/:conversationId/archive` | auth |  | `server.ts` | ⚠️ 4xx-BL | valid-auth 403 role/state gate (e.g. conversation membership, 2FA code, vault lock) |
| POST | `/api/chat/conversations/:conversationId/delete` | auth |  | `server.ts` | ⚠️ 4xx-BL | valid-auth 403 role/state gate (e.g. conversation membership, 2FA code, vault lock) |
| POST | `/api/chat/conversations/:conversationId/join` | auth |  | `server.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| POST | `/api/chat/conversations/:conversationId/join-request` | auth |  | `server.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| GET | `/api/chat/conversations/:conversationId/join-requests` | auth |  | `server.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| PATCH | `/api/chat/conversations/:conversationId/members/:userId` | auth |  | `server.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| GET | `/api/chat/conversations/:conversationId/messages` | auth |  | `server.ts` | ⚠️ 4xx-BL | valid-auth 403 role/state gate (e.g. conversation membership, 2FA code, vault lock) |
| POST | `/api/chat/conversations/:conversationId/messages` | auth |  | `server.ts` | ⚠️ 4xx-BL | valid-auth 403 role/state gate (e.g. conversation membership, 2FA code, vault lock) |
| POST | `/api/chat/conversations/:conversationId/messages/:messageId/delete` | auth |  | `server.ts` | ⚠️ 4xx-BL | valid-auth 403 role/state gate (e.g. conversation membership, 2FA code, vault lock) |
| POST | `/api/chat/conversations/:conversationId/messages/:messageId/delete-everyone` | auth |  | `server.ts` | ⚠️ 4xx-BL | valid-auth 403 role/state gate (e.g. conversation membership, 2FA code, vault lock) |
| POST | `/api/chat/conversations/:conversationId/messages/:messageId/delete-for-me` | auth |  | `server.ts` | ⚠️ 4xx-BL | valid-auth 403 role/state gate (e.g. conversation membership, 2FA code, vault lock) |
| POST | `/api/chat/conversations/:conversationId/messages/:messageId/edit` | auth |  | `server.ts` | ⚠️ 4xx-BL | valid-auth 403 role/state gate (e.g. conversation membership, 2FA code, vault lock) |
| POST | `/api/chat/conversations/:conversationId/messages/:messageId/react` | auth |  | `server.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| POST | `/api/chat/conversations/:conversationId/messages/:messageId/vote` | auth |  | `server.ts` | ⚠️ 4xx-BL | valid-auth 403 role/state gate (e.g. conversation membership, 2FA code, vault lock) |
| POST | `/api/chat/conversations/:conversationId/mute` | auth |  | `server.ts` | ⚠️ 4xx-BL | valid-auth 403 role/state gate (e.g. conversation membership, 2FA code, vault lock) |
| POST | `/api/chat/conversations/:conversationId/pin` | auth |  | `server.ts` | ⚠️ 4xx-BL | valid-auth 403 role/state gate (e.g. conversation membership, 2FA code, vault lock) |
| POST | `/api/chat/conversations/:conversationId/read` | auth |  | `server.ts` | ⚠️ 4xx-BL | valid-auth 403 role/state gate (e.g. conversation membership, 2FA code, vault lock) |
| POST | `/api/chat/conversations/:conversationId/schedule` | auth |  | `server.ts` | ⚠️ 4xx-BL | valid-auth 403 role/state gate (e.g. conversation membership, 2FA code, vault lock) |
| GET | `/api/chat/conversations/:conversationId/scheduled` | auth |  | `server.ts` | ⚠️ 4xx-BL | valid-auth 403 role/state gate (e.g. conversation membership, 2FA code, vault lock) |
| POST | `/api/chat/conversations/:conversationId/settings` | auth |  | `server.ts` | ⚠️ 4xx-BL | valid-auth 403 role/state gate (e.g. conversation membership, 2FA code, vault lock) |
| POST | `/api/chat/conversations/:conversationId/unarchive` | auth |  | `server.ts` | ⚠️ 4xx-BL | valid-auth 403 role/state gate (e.g. conversation membership, 2FA code, vault lock) |
| POST | `/api/chat/conversations/:targetConversationId/forward` | auth |  | `server.ts` | ⚠️ 4xx-BL | valid-auth 403 role/state gate (e.g. conversation membership, 2FA code, vault lock) |
| POST | `/api/chat/conversations/join-code/:joinCode` | auth |  | `server.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| GET | `/api/chat/event-groups` | auth |  | `src/turtleEventGroupsBackend.ts` | ✅ OK | valid-auth 200 |
| POST | `/api/chat/event-groups` | auth |  | `src/turtleEventGroupsBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| GET | `/api/chat/event-groups/:id` | auth |  | `src/turtleEventGroupsBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| POST | `/api/chat/event-groups/:id/archive` | auth |  | `src/turtleEventGroupsBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| POST | `/api/chat/event-groups/check` | auth |  | `src/turtleEventGroupsBackend.ts` | ✅ OK | valid-auth 200 |
| POST | `/api/chat/join-requests/:requestId/approve` | auth |  | `server.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| POST | `/api/chat/join-requests/:requestId/reject` | auth |  | `server.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| DELETE | `/api/chat/messages/:messageId/save` | auth |  | `server.ts` | ✅ OK | valid-auth 200 |
| POST | `/api/chat/messages/:messageId/save` | auth |  | `server.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| GET | `/api/chat/open-groups` | public |  | `server.ts` | ✅ OK | valid-auth 200 |
| GET | `/api/chat/presence/:userId` | auth |  | `server.ts` | ✅ OK | valid-auth 200 |
| POST | `/api/chat/random-match` | auth |  | `server.ts` | ✅ OK | valid-auth 200 |
| POST | `/api/chat/reports` | auth |  | `server.ts` | ✅ OK | valid-auth 200 |
| POST | `/api/chat/self-notes` | auth |  | `server.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| POST | `/api/chat/users/:userId/block` | auth |  | `server.ts` | ✅ OK | valid-auth 200 |
| POST | `/api/chat/users/:userId/unblock` | auth |  | `server.ts` | ✅ OK | valid-auth 200 |
| GET | `/api/chats/:chatId/split` | auth |  | `src/turtleSplitBillBackend.ts` | ⚠️ 4xx-BL | valid-auth 403 role/state gate (e.g. conversation membership, 2FA code, vault lock) |
| POST | `/api/chats/:chatId/split` | auth |  | `src/turtleSplitBillBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| GET | `/api/chitfund` | auth |  | `src/turtleChitFundBackend.ts` | 🚫 PUBLIC-READ | intentional public read (200 no-auth) |
| POST | `/api/chitfund` | auth |  | `src/turtleChitFundBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| GET | `/api/chitfund/:id` | public |  | `src/turtleChitFundBackend.ts` | 🚫 PUBLIC | works without auth, 404 on bad body |
| POST | `/api/chitfund/:id/join` | auth |  | `src/turtleChitFundBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| POST | `/api/chitfund/:id/pay` | auth |  | `src/turtleChitFundBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| GET | `/api/civic/issues` | auth |  | `src/turtleCivicBackend.ts` | 🚫 PUBLIC-READ | intentional public read (200 no-auth) |
| POST | `/api/civic/issues` | auth |  | `src/turtleCivicBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| POST | `/api/civic/issues/:id/upvote` | auth |  | `src/turtleCivicBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| GET | `/api/clt` | auth |  | `src/turtleCivicBackend.ts` | 🚫 PUBLIC-READ | intentional public read (200 no-auth) |
| POST | `/api/clt` | auth |  | `src/turtleCivicBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| POST | `/api/clt/:id/approve` | auth |  | `src/turtleCivicBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| POST | `/api/cng/fare` | auth |  | `src/turtleCNGFareBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| GET | `/api/cng/reports` | auth |  | `src/turtleCNGFareBackend.ts` | 🚫 PUBLIC-READ | intentional public read (200 no-auth) |
| POST | `/api/cng/reports` | auth |  | `src/turtleCNGFareBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| GET | `/api/collab` | auth |  | `src/turtleCollabPostsBackend.ts` | ✅ OK | valid-auth 200 |
| GET | `/api/collab/:id` | public |  | `src/turtleCollabPostsBackend.ts` | 🚫 PUBLIC | works without auth, 404 on bad body |
| PATCH | `/api/collab/:id` | auth |  | `src/turtleCollabPostsBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| POST | `/api/collab/:id/accept` | auth |  | `src/turtleCollabPostsBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| POST | `/api/collab/:id/add-section` | auth |  | `src/turtleCollabPostsBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| POST | `/api/collab/create` | auth |  | `src/turtleCollabPostsBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| GET | `/api/communities/:id/events` | auth |  | `src/turtleCommunitiesProBackend.ts` | ✅ OK | valid-auth 200 |
| POST | `/api/communities/:id/events` | auth |  | `src/turtleCommunitiesProBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| POST | `/api/communities/:id/events/:eid/rsvp` | auth |  | `src/turtleCommunitiesProBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| GET | `/api/communities/:id/stages` | auth |  | `src/turtleCommunitiesProBackend.ts` | ✅ OK | valid-auth 200 |
| POST | `/api/communities/:id/stages` | auth |  | `src/turtleCommunitiesProBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| POST | `/api/communities/:id/stages/:sid/join` | auth |  | `src/turtleCommunitiesProBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| POST | `/api/communities/:id/stages/:sid/speaker` | auth |  | `src/turtleCommunitiesProBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| GET | `/api/communities/:id/stats` | auth |  | `src/turtleCommunitiesProBackend.ts` | ✅ OK | valid-auth 200 |
| GET | `/api/communities/:id/templates` | auth |  | `src/turtleCommunitiesProBackend.ts` | ✅ OK | valid-auth 200 |
| POST | `/api/communities/:id/templates` | auth |  | `src/turtleCommunitiesProBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| POST | `/api/communities/:id/templates/:tid/apply` | auth |  | `src/turtleCommunitiesProBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| GET | `/api/communities/:id/threads` | auth |  | `src/turtleCommunitiesProBackend.ts` | ✅ OK | valid-auth 200 |
| POST | `/api/communities/:id/threads` | auth |  | `src/turtleCommunitiesProBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| POST | `/api/communities/:id/threads/:tid/reply` | auth |  | `src/turtleCommunitiesProBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| GET | `/api/communities/:id/voice` | auth |  | `src/turtleCommunitiesProBackend.ts` | ✅ OK | valid-auth 200 |
| POST | `/api/communities/:id/voice` | auth |  | `src/turtleCommunitiesProBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| POST | `/api/communities/:id/voice/:vid/join` | auth |  | `src/turtleCommunitiesProBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| GET | `/api/community` | auth |  | `server.ts` | ✅ OK | valid-auth 200 |
| POST | `/api/community/answers/:id/upvote` | auth |  | `server.ts` | ✅ OK | valid-auth 200 |
| POST | `/api/community/events` | auth |  | `server.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| POST | `/api/community/events/:id/rsvp` | auth |  | `server.ts` | ✅ OK | valid-auth 200 |
| POST | `/api/community/questions` | auth |  | `server.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| POST | `/api/community/questions/:id/answers` | auth |  | `server.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| GET | `/api/community/rewards` | auth |  | `server.ts` | ✅ OK | valid-auth 200 |
| POST | `/api/community/rewards/:id/redeem` | auth |  | `server.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| POST | `/api/community/smart/clear` | auth |  | `src/turtleSmartCommunityBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| POST | `/api/community/smart/flag` | auth |  | `src/turtleSmartCommunityBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| POST | `/api/community/smart/replies` | auth |  | `src/turtleSmartCommunityBackend.ts` | ✅ OK | valid-auth 200 |
| GET | `/api/community/smart/report` | auth |  | `src/turtleSmartCommunityBackend.ts` | 🚫 PUBLIC-READ | intentional public read (200 no-auth) |
| POST | `/api/community/smart/scan` | auth |  | `src/turtleSmartCommunityBackend.ts` | ✅ OK | valid-auth 200 |
| POST | `/api/community/smart/settings` | auth |  | `src/turtleSmartCommunityBackend.ts` | ✅ OK | valid-auth 200 |
| POST | `/api/community/smart/summarize` | auth |  | `src/turtleSmartCommunityBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| POST | `/api/community/tips` | auth |  | `server.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| POST | `/api/community/topics/:id/join` | auth |  | `server.ts` | ✅ OK | valid-auth 200 |
| GET | `/api/content-rating/:postId` | public |  | `src/turtleContentGateBackend.ts` | ✅ OK | valid-auth 200 |
| POST | `/api/content-rating/:postId` | auth |  | `src/turtleContentGateBackend.ts` | ✅ OK | valid-auth 200 |
| GET | `/api/content-rating/gate/:postId` | public |  | `src/turtleContentGateBackend.ts` | ✅ OK | valid-auth 200 |
| GET | `/api/contracts` | auth |  | `src/turtleContractBackend.ts` | ✅ OK | valid-auth 200 |
| POST | `/api/contracts` | auth |  | `src/turtleContractBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| POST | `/api/contracts/:id/sign` | auth |  | `src/turtleContractBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| GET | `/api/contracts/templates` | auth |  | `src/turtleContractBackend.ts` | 🚫 PUBLIC-READ | intentional public read (200 no-auth) |
| GET | `/api/creator/affiliate` | auth |  | `src/turtleCreatorMonetizationBackend.ts` | ✅ OK | valid-auth 200 |
| POST | `/api/creator/affiliate` | auth |  | `src/turtleCreatorMonetizationBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| POST | `/api/creator/affiliate/:id/click` | auth |  | `src/turtleCreatorMonetizationBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| GET | `/api/creator/dashboard` | auth |  | `src/turtleCreatorMonetizationBackend.ts` | ✅ OK | valid-auth 200 |
| GET | `/api/creator/deals` | auth |  | `src/turtleCreatorMonetizationBackend.ts` | ✅ OK | valid-auth 200 |
| POST | `/api/creator/deals` | auth |  | `src/turtleCreatorMonetizationBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| POST | `/api/creator/deals/:id/accept` | auth |  | `src/turtleCreatorMonetizationBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| POST | `/api/creator/deals/:id/apply` | auth |  | `src/turtleCreatorMonetizationBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| GET | `/api/creator/deals/mine` | auth |  | `src/turtleCreatorMonetizationBackend.ts` | ✅ OK | valid-auth 200 |
| GET | `/api/creator/fans` | auth |  | `src/turtleCreatorMonetizationBackend.ts` | ✅ OK | valid-auth 200 |
| POST | `/api/creator/fans` | auth |  | `src/turtleCreatorMonetizationBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| GET | `/api/creator/tiers` | auth |  | `src/turtleCreatorMonetizationBackend.ts` | ✅ OK | valid-auth 200 |
| POST | `/api/creator/tiers` | auth |  | `src/turtleCreatorMonetizationBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| POST | `/api/creator/tiers/:id/subscribe` | auth |  | `src/turtleCreatorMonetizationBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| GET | `/api/creators` | public |  | `server.ts` | ✅ OK | valid-auth 200 |
| GET | `/api/creators/:id` | public |  | `server.ts` | 🚫 PUBLIC | works without auth, 404 on bad body |
| POST | `/api/creators/:id/follow` | auth |  | `server.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| DELETE | `/api/data/brain/events` | auth |  | `src/turtleDataBrainBackend.ts` | ✅ OK | valid-auth 200 |
| GET | `/api/data/brain/events` | auth |  | `src/turtleDataBrainBackend.ts` | ✅ OK | valid-auth 200 |
| POST | `/api/data/brain/events` | auth |  | `src/turtleDataBrainBackend.ts` | ✅ OK | valid-auth 200 |
| GET | `/api/data/brain/stats` | auth |  | `src/turtleDataBrainBackend.ts` | ✅ OK | valid-auth 200 |
| POST | `/api/data/export` | auth |  | `src/turtleDataBrainBackend.ts` | ✅ OK | valid-auth 200 |
| GET | `/api/data/warehouse` | auth |  | `src/turtleDataBrainBackend.ts` | ✅ OK | valid-auth 200 |
| GET | `/api/datamarket` | auth |  | `src/turtleDataMarketBackend.ts` | 🚫 PUBLIC-READ | intentional public read (200 no-auth) |
| POST | `/api/datamarket` | auth |  | `src/turtleDataMarketBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| POST | `/api/datamarket/:id/buy` | auth |  | `src/turtleDataMarketBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| POST | `/api/datamarket/optin` | auth |  | `src/turtleDataMarketBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| GET | `/api/datamarket/optins` | auth |  | `src/turtleDataMarketBackend.ts` | ✅ OK | valid-auth 200 |
| POST | `/api/debate/session` | auth |  | `src/turtleDebateModeratorBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| GET | `/api/debate/session/:id` | public |  | `src/turtleDebateModeratorBackend.ts` | 🚫 PUBLIC | works without auth, 404 on bad body |
| POST | `/api/debate/session/:id/balance` | auth |  | `src/turtleDebateModeratorBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| POST | `/api/debate/session/:id/comment` | auth |  | `src/turtleDebateModeratorBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| GET | `/api/debate/sessions` | auth |  | `src/turtleDebateModeratorBackend.ts` | 🚫 PUBLIC-READ | intentional public read (200 no-auth) |
| POST | `/api/did/create` | auth |  | `src/turtleDecentralizedProfilesBackend.ts` | ✅ OK | valid-auth 200 |
| POST | `/api/did/export` | auth |  | `src/turtleDecentralizedProfilesBackend.ts` | ✅ OK | valid-auth 200 |
| POST | `/api/did/import` | auth |  | `src/turtleDecentralizedProfilesBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| GET | `/api/did/mine` | auth |  | `src/turtleDecentralizedProfilesBackend.ts` | ✅ OK | valid-auth 200 |
| GET | `/api/did/registry` | auth |  | `src/turtleDecentralizedProfilesBackend.ts` | 🚫 PUBLIC-READ | intentional public read (200 no-auth) |
| GET | `/api/did/resolve/:did` | auth |  | `src/turtleDecentralizedProfilesBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| POST | `/api/did/verify` | auth |  | `src/turtleDecentralizedProfilesBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| GET | `/api/disaster/kitchen-requests` | auth |  | `src/turtleCommunityKitchenBackend.ts` | 🚫 PUBLIC-READ | intentional public read (200 no-auth) |
| POST | `/api/disaster/kitchen-requests/:id/fulfill` | auth |  | `src/turtleCommunityKitchenBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| GET | `/api/disaster/kitchens` | public |  | `src/turtleCommunityKitchenBackend.ts` | ✅ OK | valid-auth 200 |
| POST | `/api/disaster/kitchens` | auth |  | `src/turtleCommunityKitchenBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| POST | `/api/disaster/kitchens/:id/report` | auth |  | `src/turtleCommunityKitchenBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| POST | `/api/disaster/kitchens/:id/request` | auth |  | `src/turtleCommunityKitchenBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| POST | `/api/disaster/kitchens/:id/update` | auth |  | `src/turtleCommunityKitchenBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| POST | `/api/disaster/kitchens/:id/verify` | auth |  | `src/turtleCommunityKitchenBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| POST | `/api/discovery/location` | auth |  | `server.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| GET | `/api/discovery/nearby` | auth |  | `server.ts` | ✅ OK | valid-auth 200 |
| GET | `/api/e2ee/devices` | auth |  | `src/turtleE2EEBackend.ts` | ✅ OK | valid-auth 200 |
| DELETE | `/api/e2ee/devices/:deviceId` | auth |  | `src/turtleE2EEBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| POST | `/api/e2ee/devices/complete` | auth |  | `src/turtleE2EEBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| POST | `/api/e2ee/devices/pair-start` | auth |  | `src/turtleE2EEBackend.ts` | ✅ OK | valid-auth 200 |
| GET | `/api/e2ee/keys` | auth |  | `src/turtleE2EEBackend.ts` | ✅ OK | valid-auth 200 |
| POST | `/api/e2ee/keys` | auth |  | `src/turtleE2EEBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| GET | `/api/e2ee/keys/:userId` | auth |  | `src/turtleE2EEBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| GET | `/api/e2ee/messages` | auth |  | `src/turtleE2EEBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| POST | `/api/e2ee/messages` | auth |  | `src/turtleE2EEBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| POST | `/api/e2ee/messages/:id/read` | auth |  | `src/turtleE2EEBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| GET | `/api/e2ee/status` | auth |  | `src/turtleE2EEBackend.ts` | ✅ OK | valid-auth 200 |
| GET | `/api/editor/templates` | auth |  | `src/turtleVideoEditorBackend.ts` | ✅ OK | valid-auth 200 |
| POST | `/api/editor/templates` | auth |  | `src/turtleVideoEditorBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| DELETE | `/api/editor/templates/:id` | auth |  | `src/turtleVideoEditorBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| GET | `/api/emergency/pools` | public |  | `src/turtleEmergencyPoolsBackend.ts` | ✅ OK | valid-auth 200 |
| POST | `/api/emergency/pools` | auth |  | `src/turtleEmergencyPoolsBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| GET | `/api/emergency/pools/:id` | auth |  | `src/turtleEmergencyPoolsBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| POST | `/api/emergency/pools/:id/contribute` | auth |  | `src/turtleEmergencyPoolsBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| POST | `/api/emergency/pools/:id/join` | auth |  | `src/turtleEmergencyPoolsBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| POST | `/api/emergency/pools/:id/report` | public |  | `src/turtleEmergencyPoolsBackend.ts` | 🚫 PUBLIC | works without auth, 404 on bad body |
| POST | `/api/emergency/pools/:id/requests` | auth |  | `src/turtleEmergencyPoolsBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| POST | `/api/emergency/pools/:id/requests/:requestId/vote` | auth |  | `src/turtleEmergencyPoolsBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| POST | `/api/emergency/pools/:id/resolve` | auth |  | `src/turtleEmergencyPoolsBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| GET | `/api/escort/coverage` | auth |  | `src/turtleSafeEscortBackend.ts` | ✅ OK | valid-auth 200 |
| POST | `/api/escort/escort` | auth |  | `src/turtleSafeEscortBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| POST | `/api/escort/escort/optout` | auth |  | `src/turtleSafeEscortBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| GET | `/api/escort/escorts` | auth |  | `src/turtleSafeEscortBackend.ts` | ✅ OK | valid-auth 200 |
| GET | `/api/escort/meta` | auth |  | `src/turtleSafeEscortBackend.ts` | 🚫 PUBLIC-READ | intentional public read (200 no-auth) |
| GET | `/api/escort/requests` | auth |  | `src/turtleSafeEscortBackend.ts` | ✅ OK | valid-auth 200 |
| POST | `/api/escort/requests` | auth |  | `src/turtleSafeEscortBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| GET | `/api/escort/requests/:id` | auth |  | `src/turtleSafeEscortBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| POST | `/api/escort/requests/:id/accept` | auth |  | `src/turtleSafeEscortBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| POST | `/api/escort/requests/:id/cancel` | auth |  | `src/turtleSafeEscortBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| POST | `/api/escort/requests/:id/complete` | auth |  | `src/turtleSafeEscortBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| POST | `/api/escort/requests/:id/offer` | auth |  | `src/turtleSafeEscortBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| POST | `/api/escort/requests/:id/report` | auth |  | `src/turtleSafeEscortBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| POST | `/api/escort/requests/:id/withdraw` | auth |  | `src/turtleSafeEscortBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| GET | `/api/escort/routes` | auth |  | `src/turtleSafeEscortBackend.ts` | ✅ OK | valid-auth 200 |
| POST | `/api/escort/routes` | auth |  | `src/turtleSafeEscortBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| GET | `/api/escort/status` | auth |  | `src/turtleSafeEscortBackend.ts` | ✅ OK | valid-auth 200 |
| GET | `/api/escrow` | auth |  | `src/turtleEscrowBackend.ts` | ✅ OK | valid-auth 200 |
| POST | `/api/escrow` | auth |  | `src/turtleEscrowBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| POST | `/api/escrow/:id/refund` | auth |  | `src/turtleEscrowBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| POST | `/api/escrow/:id/release` | auth |  | `src/turtleEscrowBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| GET | `/api/events` | auth |  | `src/turtleReligiousEventsBackend.ts` | 🚫 PUBLIC-READ | intentional public read (200 no-auth) |
| POST | `/api/events` | auth |  | `src/turtleReligiousEventsBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| POST | `/api/events/:id/rsvp` | auth |  | `server.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| POST | `/api/events/:id/rsvp` | auth |  | `src/turtleReligiousEventsBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| POST | `/api/events/:id/update` | auth |  | `src/turtleReligiousEventsBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| POST | `/api/events/create` | auth |  | `server.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| GET | `/api/evidence/entries` | auth |  | `src/turtleEvidenceVaultBackend.ts` | ✅ OK | valid-auth 200 |
| POST | `/api/evidence/entries` | auth |  | `src/turtleEvidenceVaultBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| DELETE | `/api/evidence/entries/:id` | auth |  | `src/turtleEvidenceVaultBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| GET | `/api/evidence/entries/:id` | auth |  | `src/turtleEvidenceVaultBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| GET | `/api/exam-rooms` | auth |  | `src/turtleExamRoomBackend.ts` | 🚫 PUBLIC-READ | intentional public read (200 no-auth) |
| POST | `/api/exam-rooms` | auth |  | `src/turtleExamRoomBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| POST | `/api/exam-rooms/:id/join` | auth |  | `src/turtleExamRoomBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| POST | `/api/exam-rooms/:id/notes` | auth |  | `src/turtleExamRoomBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| POST | `/api/exam-rooms/:id/papers` | auth |  | `src/turtleExamRoomBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| GET | `/api/factcheck/:id` | public |  | `src/turtleFactCheckerBackend.ts` | 🚫 PUBLIC | works without auth, 404 on bad body |
| POST | `/api/factcheck/check` | public |  | `src/turtleFactCheckerBackend.ts` | 🚫 PUBLIC | works without auth, 400 on bad body |
| GET | `/api/factcheck/post/:postId` | public |  | `src/turtleFactCheckerBackend.ts` | 🚫 PUBLIC | works without auth, 404 on bad body |
| GET | `/api/factcheck/recent` | public |  | `src/turtleFactCheckerBackend.ts` | ✅ OK | valid-auth 200 |
| GET | `/api/family` | auth |  | `src/turtleFamilyCircleBackend.ts` | ✅ OK | valid-auth 200 |
| POST | `/api/family` | auth |  | `src/turtleFamilyCircleBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| POST | `/api/family/:id/approve` | auth |  | `src/turtleFamilyCircleBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| POST | `/api/family/:id/check-in` | auth |  | `src/turtleFamilyCircleBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| POST | `/api/family/:id/join` | auth |  | `src/turtleFamilyCircleBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| POST | `/api/family/:id/leave` | auth |  | `src/turtleFamilyCircleBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| POST | `/api/family/:id/location` | auth |  | `src/turtleFamilyCircleBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| GET | `/api/fed/model` | auth |  | `src/turtleFederatedLearningBackend.ts` | ✅ OK | valid-auth 200 |
| GET | `/api/fed/status` | auth |  | `src/turtleFederatedLearningBackend.ts` | ✅ OK | valid-auth 200 |
| POST | `/api/fed/update` | auth |  | `src/turtleFederatedLearningBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| GET | `/api/fediverse/actor/:username` | auth |  | `src/turtleFediverseBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| POST | `/api/fediverse/inbox` | auth |  | `src/turtleFediverseBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| GET | `/api/fediverse/outbox` | auth |  | `src/turtleFediverseBackend.ts` | 🚫 PUBLIC-READ | intentional public read (200 no-auth) |
| POST | `/api/fediverse/outbox` | auth |  | `src/turtleFediverseBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| GET | `/api/fediverse/remote` | public |  | `src/turtleFediverseBackend.ts` | ✅ OK | valid-auth 200 |
| GET | `/api/feed/atlas-rank` | auth |  | `server.ts` | ✅ OK | valid-auth 200 |
| POST | `/api/feed/explain` | auth |  | `src/turtleFeedExplainBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| GET | `/api/feed/explain-history` | auth |  | `src/turtleFeedExplainBackend.ts` | ✅ OK | valid-auth 200 |
| GET | `/api/feed/mood` | public |  | `src/turtleUpliftFeedBackend.ts` | 🚫 PUBLIC | works without auth, 400 on bad body |
| GET | `/api/feed/personalized` | auth |  | `src/turtleAlgoPrefsBackend.ts` | ✅ OK | valid-auth 200 |
| GET | `/api/feed/uplift` | public |  | `src/turtleUpliftFeedBackend.ts` | ✅ OK | valid-auth 200 |
| GET | `/api/fir` | auth |  | `src/turtleFIRBackend.ts` | ✅ OK | valid-auth 200 |
| POST | `/api/fir` | auth |  | `src/turtleFIRBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| POST | `/api/fir/:id/status` | auth |  | `src/turtleFIRBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| POST | `/api/flood/checkin` | auth |  | `src/turtleFloodDepthMapperBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| GET | `/api/flood/overview` | public |  | `src/turtleFloodDepthMapperBackend.ts` | ✅ OK | valid-auth 200 |
| GET | `/api/flood/reports` | auth |  | `src/turtleFloodDepthMapperBackend.ts` | 🚫 PUBLIC-READ | intentional public read (200 no-auth) |
| POST | `/api/flood/reports` | auth |  | `src/turtleFloodDepthMapperBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| POST | `/api/flood/reports/:id/ack` | auth |  | `src/turtleFloodDepthMapperBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| POST | `/api/flood/reports/:id/confirm` | auth |  | `src/turtleFloodDepthMapperBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| POST | `/api/flood/reports/:id/resolve` | auth |  | `src/turtleFloodDepthMapperBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| GET | `/api/flood/spots` | auth |  | `src/turtleFloodDepthMapperBackend.ts` | 🚫 PUBLIC-READ | intentional public read (200 no-auth) |
| POST | `/api/flood/spots` | auth |  | `src/turtleFloodDepthMapperBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| POST | `/api/flood/spots/:id/confirm` | auth |  | `src/turtleFloodDepthMapperBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| GET | `/api/flood/status` | auth |  | `src/turtleFloodDepthMapperBackend.ts` | ✅ OK | valid-auth 200 |
| POST | `/api/friends/request/accept` | auth |  | `server.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| POST | `/api/friends/request/decline` | auth |  | `server.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| POST | `/api/friends/request/send` | auth |  | `server.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| POST | `/api/friends/unfriend` | auth | yes | `server.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| GET | `/api/garagesales` | public |  | `src/turtleGarageSaleBackend.ts` | ✅ OK | valid-auth 200 |
| POST | `/api/garagesales` | auth |  | `src/turtleGarageSaleBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| GET | `/api/gems` | auth |  | `src/turtleTravelBackend.ts` | 🚫 PUBLIC-READ | intentional public read (200 no-auth) |
| POST | `/api/gems` | auth |  | `src/turtleTravelBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| POST | `/api/gems/:id/upvote` | auth |  | `src/turtleTravelBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| GET | `/api/gigs` | auth |  | `src/turtleGigRadarBackend.ts` | 🚫 PUBLIC-READ | intentional public read (200 no-auth) |
| POST | `/api/gigs` | auth |  | `src/turtleGigRadarBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| POST | `/api/gigs/:id/apply` | auth |  | `src/turtleGigRadarBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| POST | `/api/gigs/:id/fill` | auth |  | `src/turtleGigRadarBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| GET | `/api/groupbuy` | auth |  | `src/turtleGroupBuyBackend.ts` | 🚫 PUBLIC-READ | intentional public read (200 no-auth) |
| POST | `/api/groupbuy` | auth |  | `src/turtleGroupBuyBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| POST | `/api/groupbuy/:id/done` | auth |  | `src/turtleGroupBuyBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| POST | `/api/groupbuy/:id/join` | auth |  | `src/turtleGroupBuyBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| GET | `/api/guardian` | auth |  | `src/turtleGuardianBackend.ts` | ✅ OK | valid-auth 200 |
| POST | `/api/guardian/:id/remove` | auth |  | `src/turtleGuardianBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| POST | `/api/guardian/:id/respond` | auth |  | `src/turtleGuardianBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| POST | `/api/guardian/request` | auth |  | `src/turtleGuardianBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| GET | `/api/halal` | auth |  | `src/turtleHalalDatingBackend.ts` | ✅ OK | valid-auth 200 |
| POST | `/api/halal/:id/advance` | auth |  | `src/turtleHalalDatingBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| POST | `/api/halal/:id/confirm` | auth |  | `src/turtleHalalDatingBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| POST | `/api/halal/:id/end` | auth |  | `src/turtleHalalDatingBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| POST | `/api/halal/start` | auth |  | `src/turtleHalalDatingBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| GET | `/api/hardware-wallet` | auth |  | `src/turtleHardwareWalletBackend.ts` | ✅ OK | valid-auth 200 |
| POST | `/api/hardware-wallet` | auth |  | `src/turtleHardwareWalletBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| DELETE | `/api/hardware-wallet/:id` | auth |  | `src/turtleHardwareWalletBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| GET | `/api/hubs` | auth |  | `src/turtleDeepDiveBackend.ts` | ✅ OK | valid-auth 200 |
| POST | `/api/hubs` | auth |  | `src/turtleDeepDiveBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| GET | `/api/hubs/:id` | auth |  | `src/turtleDeepDiveBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| POST | `/api/hubs/:id/attach` | auth |  | `src/turtleDeepDiveBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| GET | `/api/internships` | auth |  | `src/turtleInternshipBackend.ts` | 🚫 PUBLIC-READ | intentional public read (200 no-auth) |
| POST | `/api/internships` | auth |  | `src/turtleInternshipBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| POST | `/api/internships/:id/applications/:appId/respond` | auth |  | `src/turtleInternshipBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| POST | `/api/internships/:id/apply` | auth |  | `src/turtleInternshipBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| GET | `/api/internships/mine` | auth |  | `src/turtleInternshipBackend.ts` | ✅ OK | valid-auth 200 |
| GET | `/api/interview` | auth |  | `src/turtleInterviewBackend.ts` | ✅ OK | valid-auth 200 |
| GET | `/api/interview/:id` | auth |  | `src/turtleInterviewBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| POST | `/api/interview/:id/answer` | auth |  | `src/turtleInterviewBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| POST | `/api/interview/start` | auth |  | `src/turtleInterviewBackend.ts` | ✅ OK | valid-auth 200 |
| GET | `/api/jobs/alerts` | auth |  | `src/turtleJobAlertBackend.ts` | 🚫 PUBLIC-READ | intentional public read (200 no-auth) |
| POST | `/api/jobs/alerts` | auth |  | `src/turtleJobAlertBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| POST | `/api/jobs/alerts/:id/save` | auth |  | `src/turtleJobAlertBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| GET | `/api/jobs/alerts/saved` | auth |  | `src/turtleJobAlertBackend.ts` | ✅ OK | valid-auth 200 |
| GET | `/api/lawyers` | auth |  | `src/turtleLawyerBackend.ts` | 🚫 PUBLIC-READ | intentional public read (200 no-auth) |
| POST | `/api/lawyers` | auth |  | `src/turtleLawyerBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| POST | `/api/legal/ask` | auth |  | `src/turtleLegalAidBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| GET | `/api/legal/log` | auth |  | `src/turtleLegalAidBackend.ts` | ✅ OK | valid-auth 200 |
| POST | `/api/link-preview` | auth |  | `server.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| GET | `/api/live/clips` | auth |  | `src/turtleLiveEcosystemBackend.ts` | ✅ OK | valid-auth 200 |
| POST | `/api/live/clips` | auth |  | `src/turtleLiveEcosystemBackend.ts` | ✅ OK | valid-auth 200 |
| GET | `/api/live/gifts` | auth |  | `src/turtleLiveEcosystemBackend.ts` | ✅ OK | valid-auth 200 |
| GET | `/api/live/gifts/recent` | auth |  | `src/turtleLiveEcosystemBackend.ts` | ✅ OK | valid-auth 200 |
| POST | `/api/live/gifts/send` | auth |  | `src/turtleLiveEcosystemBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| GET | `/api/live/goals` | auth |  | `src/turtleLiveEcosystemBackend.ts` | ✅ OK | valid-auth 200 |
| POST | `/api/live/goals` | auth |  | `src/turtleLiveEcosystemBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| GET | `/api/live/leaderboard` | auth |  | `src/turtleLiveEcosystemBackend.ts` | ✅ OK | valid-auth 200 |
| GET | `/api/live/rooms` | auth |  | `src/turtleLiveEcosystemBackend.ts` | ✅ OK | valid-auth 200 |
| POST | `/api/live/rooms` | auth |  | `src/turtleLiveEcosystemBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| POST | `/api/live/rooms/:id/ban` | auth |  | `src/turtleLiveEcosystemBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| POST | `/api/live/rooms/:id/end` | auth |  | `src/turtleLiveEcosystemBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| POST | `/api/live/rooms/:id/join` | auth |  | `src/turtleLiveEcosystemBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| POST | `/api/live/rooms/:id/kick` | auth |  | `src/turtleLiveEcosystemBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| POST | `/api/live/rooms/:id/leave` | auth |  | `src/turtleLiveEcosystemBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| GET | `/api/live/session` | auth |  | `src/turtleCoStreamBackend.ts` | ✅ OK | valid-auth 200 |
| POST | `/api/live/session` | auth |  | `src/turtleCoStreamBackend.ts` | ✅ OK | valid-auth 200 |
| GET | `/api/live/session/:id` | auth |  | `src/turtleCoStreamBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| POST | `/api/live/session/:id/cohost` | auth |  | `src/turtleCoStreamBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| POST | `/api/live/session/:id/end` | auth |  | `src/turtleCoStreamBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| POST | `/api/live/session/:id/join` | auth |  | `src/turtleCoStreamBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| POST | `/api/live/session/:id/start` | auth |  | `src/turtleCoStreamBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| POST | `/api/live/session/:id/tip` | auth |  | `src/turtleCoStreamBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| GET | `/api/live/users` | auth |  | `src/turtleCoStreamBackend.ts` | ✅ OK | valid-auth 200 |
| GET | `/api/livekit/token` | auth |  | `src/turtleCommunitiesProBackend.ts` | ✅ OK | valid-auth 200 |
| GET | `/api/map/best-friends` | auth |  | `src/turtleSnapMapBackend.ts` | ✅ OK | valid-auth 200 |
| GET | `/api/map/heat` | auth |  | `src/turtleSnapMapBackend.ts` | ✅ OK | valid-auth 200 |
| POST | `/api/map/interaction` | auth |  | `src/turtleSnapMapBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| GET | `/api/map/me/location` | auth |  | `src/turtleSnapMapBackend.ts` | ✅ OK | valid-auth 200 |
| POST | `/api/map/me/location` | auth |  | `src/turtleSnapMapBackend.ts` | ✅ OK | valid-auth 200 |
| GET | `/api/map/stories` | auth |  | `src/turtleSnapMapBackend.ts` | ✅ OK | valid-auth 200 |
| GET | `/api/market/items` | auth |  | `src/turtleMarketNegotiatorBackend.ts` | 🚫 PUBLIC-READ | intentional public read (200 no-auth) |
| POST | `/api/market/items` | auth |  | `src/turtleMarketNegotiatorBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| POST | `/api/market/negotiate` | auth |  | `src/turtleMarketNegotiatorBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| POST | `/api/market/offer` | auth |  | `src/turtleMarketNegotiatorBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| GET | `/api/market/offers/:itemId` | public |  | `src/turtleMarketNegotiatorBackend.ts` | ✅ OK | valid-auth 200 |
| GET | `/api/marketplace/categories` | public |  | `src/turtleMarketplaceBackend.ts` | ✅ OK | valid-auth 200 |
| GET | `/api/marketplace/listings` | public |  | `src/turtleMarketplaceBackend.ts` | ✅ OK | valid-auth 200 |
| POST | `/api/marketplace/listings` | auth |  | `src/turtleMarketplaceBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| DELETE | `/api/marketplace/listings/:id` | auth |  | `src/turtleMarketplaceBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| GET | `/api/marketplace/listings/:id` | auth |  | `src/turtleMarketplaceBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| POST | `/api/marketplace/listings/:id/contact` | auth |  | `src/turtleMarketplaceBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| POST | `/api/marketplace/listings/:id/sold` | auth |  | `src/turtleMarketplaceBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| POST | `/api/match/compatibility` | auth |  | `src/turtleCompatibilityBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| GET | `/api/match/suggest` | auth |  | `src/turtleMatchmakerBackend.ts` | ✅ OK | valid-auth 200 |
| GET | `/api/matchmaker` | auth |  | `src/turtleMatchmakerBackend.ts` | ✅ OK | valid-auth 200 |
| POST | `/api/matchmaker` | auth |  | `src/turtleMatchmakerBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| POST | `/api/matchmaker/:id/respond` | auth |  | `src/turtleMatchmakerBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| GET | `/api/me/timeline` | auth |  | `src/turtleRelationshipTimelineBackend.ts` | ✅ OK | valid-auth 200 |
| POST | `/api/meet/leave` | auth |  | `server.ts` | ✅ OK | valid-auth 200 |
| POST | `/api/meet/match` | auth |  | `server.ts` | ✅ OK | valid-auth 200 |
| GET | `/api/meet/queue-stats` | auth |  | `server.ts` | ✅ OK | valid-auth 200 |
| POST | `/api/meet/room/:roomId/message` | auth |  | `server.ts` | ✅ OK | valid-auth 200 |
| GET | `/api/meet/room/:roomId/messages` | auth |  | `server.ts` | ✅ OK | valid-auth 200 |
| POST | `/api/meet/room/:roomId/signal` | auth |  | `server.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| GET | `/api/meet/room/:roomId/signals` | auth |  | `server.ts` | ✅ OK | valid-auth 200 |
| GET | `/api/memories/recap` | auth |  | `src/turtleMemoriesBackend.ts` | ✅ OK | valid-auth 200 |
| POST | `/api/memories/recap` | auth |  | `src/turtleMemoriesBackend.ts` | ✅ OK | valid-auth 200 |
| GET | `/api/memories/recaps` | auth |  | `src/turtleMemoriesBackend.ts` | ✅ OK | valid-auth 200 |
| GET | `/api/memories/shared/:friendId` | auth |  | `src/turtleMemoriesBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| POST | `/api/mesh/beacon` | auth |  | `src/turtleOfflineMeshBackend.ts` | ✅ OK | valid-auth 200 |
| GET | `/api/mesh/beacons` | auth |  | `src/turtleOfflineMeshBackend.ts` | 🚫 PUBLIC-READ | intentional public read (200 no-auth) |
| GET | `/api/mesh/meta` | auth |  | `src/turtleOfflineMeshBackend.ts` | 🚫 PUBLIC-READ | intentional public read (200 no-auth) |
| GET | `/api/mesh/relay` | auth |  | `src/turtleOfflineMeshBackend.ts` | 🚫 PUBLIC-READ | intentional public read (200 no-auth) |
| POST | `/api/mesh/relay` | auth |  | `src/turtleOfflineMeshBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| POST | `/api/mesh/relay/:id/ack` | auth |  | `src/turtleOfflineMeshBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| POST | `/api/mesh/relay/:id/report` | auth |  | `src/turtleOfflineMeshBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| POST | `/api/mesh/relay/:id/resolve` | auth |  | `src/turtleOfflineMeshBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| GET | `/api/mesh/status` | auth |  | `src/turtleOfflineMeshBackend.ts` | ✅ OK | valid-auth 200 |
| GET | `/api/mesh/sync` | auth |  | `src/turtleOfflineMeshBackend.ts` | ✅ OK | valid-auth 200 |
| GET | `/api/messages` | auth |  | `server.ts` | ✅ OK | valid-auth 200 |
| POST | `/api/messages/send` | auth |  | `server.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| GET | `/api/metabase/token` | auth |  | `src/turtleDataBrainBackend.ts` | ✅ OK | valid-auth 200 |
| GET | `/api/miniapps` | auth |  | `src/turtleMiniAppsBackend.ts` | ✅ OK | valid-auth 200 |
| POST | `/api/miniapps` | auth |  | `src/turtleMiniAppsBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| DELETE | `/api/miniapps/:id` | auth |  | `src/turtleMiniAppsBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| GET | `/api/miniapps/:id` | auth |  | `src/turtleMiniAppsBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| GET | `/api/miniapps/:id/events` | auth |  | `src/turtleMiniAppsBackend.ts` | ✅ OK | valid-auth 200 |
| POST | `/api/miniapps/:id/events` | auth |  | `src/turtleMiniAppsBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| POST | `/api/miniapps/:id/install` | auth |  | `src/turtleMiniAppsBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| POST | `/api/miniapps/:id/purchase` | auth |  | `src/turtleMiniAppsBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| POST | `/api/miniapps/:id/rate` | auth |  | `src/turtleMiniAppsBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| POST | `/api/miniapps/:id/uninstall` | auth |  | `src/turtleMiniAppsBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| GET | `/api/miniapps/mine` | auth |  | `src/turtleMiniAppsBackend.ts` | ✅ OK | valid-auth 200 |
| GET | `/api/missing/face-index` | auth |  | `src/turtleMissingFaceSearchBackend.ts` | ✅ OK | valid-auth 200 |
| POST | `/api/missing/face-search` | auth |  | `src/turtleMissingFaceSearchBackend.ts` | ⚠️ 4xx-BL | valid-auth 422 (business logic on generic body) |
| POST | `/api/missing/face-upload` | auth |  | `src/turtleMissingFaceSearchBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| POST | `/api/missing/face-upload/:id/remove` | auth |  | `src/turtleMissingFaceSearchBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| GET | `/api/missing/reports` | public |  | `src/turtleMissingPersonBackend.ts` | ✅ OK | valid-auth 200 |
| POST | `/api/missing/reports` | auth |  | `src/turtleMissingPersonBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| GET | `/api/missing/reports/:id` | auth |  | `src/turtleMissingPersonBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| POST | `/api/missing/reports/:id/found` | auth |  | `src/turtleMissingPersonBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| POST | `/api/missing/reports/:id/report` | auth |  | `src/turtleMissingPersonBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| POST | `/api/missing/reports/:id/sightings` | auth |  | `src/turtleMissingPersonBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| POST | `/api/missing/reports/:id/sightings/:sightId/helpful` | auth |  | `src/turtleMissingPersonBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| POST | `/api/missing/reports/:id/verify` | auth |  | `src/turtleMissingPersonBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| GET | `/api/missing/status` | auth |  | `src/turtleMissingPersonBackend.ts` | ✅ OK | valid-auth 200 |
| GET | `/api/moderation/actions` | public |  | `src/turtleAIModeratorBackend.ts` | ✅ OK | valid-auth 200 |
| POST | `/api/moderation/analyze` | public |  | `src/turtleAIModerationAssistant.ts` | ✅ OK | valid-auth 200 |
| POST | `/api/moderation/auto-review` | auth |  | `src/turtleAIModeratorBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| POST | `/api/moderation/bengali` | public |  | `src/turtleAIBengaliModerationEngine.ts` | 🚫 PUBLIC | works without auth, 400 on bad body |
| GET | `/api/moderation/rules` | auth |  | `src/turtleAIModeratorBackend.ts` | 🚫 PUBLIC-READ | intentional public read (200 no-auth) |
| POST | `/api/moderation/rules` | auth |  | `src/turtleAIModeratorBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| DELETE | `/api/moderation/rules/:id` | auth |  | `src/turtleAIModeratorBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| GET | `/api/mood/feed` | auth |  | `src/turtleMoodFeedBackend.ts` | ✅ OK | valid-auth 200 |
| GET | `/api/mood/sentiment` | auth |  | `src/turtleMoodFeedBackend.ts` | ✅ OK | valid-auth 200 |
| POST | `/api/needs/:postId/notify` | auth |  | `src/turtleNearbyDonorNotifyBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| GET | `/api/needs/donor-profile` | auth |  | `src/turtleNearbyDonorNotifyBackend.ts` | ✅ OK | valid-auth 200 |
| POST | `/api/needs/donor-profile` | auth |  | `src/turtleNearbyDonorNotifyBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| GET | `/api/needs/meta` | public |  | `src/turtleNearbyDonorNotifyBackend.ts` | ✅ OK | valid-auth 200 |
| GET | `/api/notifications` | auth |  | `server.ts` | ✅ OK | valid-auth 200 |
| POST | `/api/notifications/:id/read` | auth |  | `server.ts` | ✅ OK | valid-auth 200 |
| POST | `/api/notifications/read` | auth |  | `server.ts` | ✅ OK | valid-auth 200 |
| POST | `/api/nsfw/check` | public |  | `turtleNSFWServerEngine.ts` | 🚫 PUBLIC | works without auth, 400 on bad body |
| GET | `/api/os/experiments` | auth | yes | `src/turtleOSLayerBackend.ts` | 🔒 ADMIN | 403 without admin key; 2xx with x-admin-key (verified) |
| POST | `/api/os/experiments` | auth | yes | `src/turtleOSLayerBackend.ts` | 🔒 ADMIN | 403 without admin key; 2xx with x-admin-key (verified) |
| POST | `/api/os/experiments/:id/assign` | auth |  | `src/turtleOSLayerBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| POST | `/api/os/experiments/:id/metrics` | auth | yes | `src/turtleOSLayerBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| GET | `/api/os/experiments/:id/stats` | auth | yes | `src/turtleOSLayerBackend.ts` | 🔒 ADMIN | 403 without admin key; 2xx with x-admin-key (verified) |
| GET | `/api/os/flags` | auth | yes | `src/turtleOSLayerBackend.ts` | ✅ OK | valid-auth 200 |
| POST | `/api/os/flags` | auth | yes | `src/turtleOSLayerBackend.ts` | 🔒 ADMIN | 403 without admin key; 2xx with x-admin-key (verified) |
| POST | `/api/os/flags/:id/override` | auth | yes | `src/turtleOSLayerBackend.ts` | 🔒 ADMIN | 403 without admin key; 2xx with x-admin-key (verified) |
| GET | `/api/os/flags/evaluate` | auth | yes | `src/turtleOSLayerBackend.ts` | ✅ OK | valid-auth 200 |
| GET | `/api/os/my-assignments` | auth | yes | `src/turtleOSLayerBackend.ts` | ✅ OK | valid-auth 200 |
| GET | `/api/os/region` | auth |  | `src/turtleOSLayerBackend.ts` | ✅ OK | valid-auth 200 |
| POST | `/api/pair/rooms` | auth |  | `src/turtlePairCodingBackend.ts` | ✅ OK | valid-auth 200 |
| GET | `/api/pair/rooms/:code` | auth |  | `src/turtlePairCodingBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| POST | `/api/pair/rooms/:code/buffer` | auth |  | `src/turtlePairCodingBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| POST | `/api/pair/rooms/:code/command` | auth |  | `src/turtlePairCodingBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| POST | `/api/pair/rooms/:code/leave` | auth |  | `src/turtlePairCodingBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| GET | `/api/parking` | auth |  | `src/turtleParkingBackend.ts` | 🚫 PUBLIC-READ | intentional public read (200 no-auth) |
| POST | `/api/parking` | auth |  | `src/turtleParkingBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| POST | `/api/parking/:id/book` | auth |  | `src/turtleParkingBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| GET | `/api/personas` | auth |  | `src/turtlePersonaBackend.ts` | ✅ OK | valid-auth 200 |
| POST | `/api/personas` | auth |  | `src/turtlePersonaBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| DELETE | `/api/personas/:id` | auth |  | `src/turtlePersonaBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| POST | `/api/personas/:id/activate` | auth |  | `src/turtlePersonaBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| POST | `/api/podcast/generate` | auth |  | `src/turtlePodcastBackend.ts` | ✅ OK | valid-auth 200 |
| GET | `/api/podcast/history` | auth |  | `src/turtlePodcastBackend.ts` | ✅ OK | valid-auth 200 |
| GET | `/api/podcast/today` | auth |  | `src/turtlePodcastBackend.ts` | ✅ OK | valid-auth 200 |
| GET | `/api/portfolio` | auth |  | `src/turtlePortfolioBackend.ts` | 🚫 PUBLIC-READ | intentional public read (200 no-auth) |
| POST | `/api/portfolio` | auth |  | `src/turtlePortfolioBackend.ts` | ✅ OK | valid-auth 200 |
| GET | `/api/portfolio/:userId` | auth |  | `src/turtlePortfolioBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| POST | `/api/portfolio/items` | auth |  | `src/turtlePortfolioBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| DELETE | `/api/portfolio/items/:id` | auth |  | `src/turtlePortfolioBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| GET | `/api/posts/:id/ghost-status` | auth |  | `src/turtleGhostViewBackend.ts` | 🚫 PUBLIC-READ | intentional public read (200 no-auth) |
| POST | `/api/posts/:id/ghost-view` | auth |  | `src/turtleGhostViewBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| GET | `/api/posts/:id/proof` | auth |  | `src/turtleLiveReporterBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| GET | `/api/posts/:postId` | public |  | `server.ts` | 🚫 PUBLIC | works without auth, 404 on bad body |
| POST | `/api/posts/:postId/comment` | public |  | `server.ts` | 🚫 PUBLIC | works without auth, 400 on bad body |
| GET | `/api/posts/:postId/comment-summary` | auth |  | `src/turtleCommentSummaryBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| POST | `/api/posts/:postId/comment-summary/refresh` | auth |  | `src/turtleCommentSummaryBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| POST | `/api/posts/:postId/comments/:commentId/delete` | public |  | `server.ts` | 🚫 PUBLIC | works without auth, 404 on bad body |
| POST | `/api/posts/:postId/comments/:commentId/edit` | public |  | `server.ts` | 🚫 PUBLIC | works without auth, 400 on bad body |
| POST | `/api/posts/:postId/comments/:commentId/react` | public |  | `server.ts` | 🚫 PUBLIC | works without auth, 400 on bad body |
| POST | `/api/posts/:postId/delete` | auth |  | `server.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| POST | `/api/posts/:postId/edit` | auth |  | `server.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| POST | `/api/posts/:postId/like` | public |  | `server.ts` | 🚫 PUBLIC | works without auth, 404 on bad body |
| POST | `/api/posts/:postId/need-status` | auth |  | `server.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| POST | `/api/posts/:postId/need-text` | public |  | `server.ts` | 🚫 PUBLIC | works without auth, 400 on bad body |
| POST | `/api/posts/:postId/poll/vote` | auth |  | `server.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| POST | `/api/posts/:postId/report` | auth | yes | `server.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| POST | `/api/posts/:postId/share` | public |  | `server.ts` | 🚫 PUBLIC | works without auth, 404 on bad body |
| POST | `/api/posts/create` | public |  | `server.ts` | 🚫 PUBLIC | works without auth, 400 on bad body |
| GET | `/api/posts/feed` | public |  | `server.ts` | ✅ OK | valid-auth 200 |
| GET | `/api/posts/ghost/my` | auth |  | `src/turtleGhostViewBackend.ts` | ✅ OK | valid-auth 200 |
| POST | `/api/posts/revoke-verification` | auth |  | `src/turtleLiveReporterBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| POST | `/api/posts/trigger-scan` | auth |  | `src/turtleTriggerWarningBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| POST | `/api/posts/trigger-scan-text` | public |  | `src/turtleTriggerWarningBackend.ts` | 🚫 PUBLIC | works without auth, 400 on bad body |
| GET | `/api/posts/trigger-scan/:postId` | public |  | `src/turtleTriggerWarningBackend.ts` | 🚫 PUBLIC | works without auth, 404 on bad body |
| POST | `/api/posts/update` | auth |  | `server.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| POST | `/api/posts/verify-location` | auth |  | `src/turtleLiveReporterBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| POST | `/api/pq/exchange` | auth |  | `src/turtleQuantumCryptoBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| GET | `/api/pq/keys` | auth |  | `src/turtleQuantumCryptoBackend.ts` | ✅ OK | valid-auth 200 |
| POST | `/api/pq/keys` | auth |  | `src/turtleQuantumCryptoBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| GET | `/api/pq/messages` | auth |  | `src/turtleQuantumCryptoBackend.ts` | ✅ OK | valid-auth 200 |
| POST | `/api/pq/messages` | auth |  | `src/turtleQuantumCryptoBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| GET | `/api/prefs/elder-mode` | auth |  | `src/turtleElderModeBackend.ts` | ✅ OK | valid-auth 200 |
| POST | `/api/prefs/elder-mode` | auth |  | `src/turtleElderModeBackend.ts` | ✅ OK | valid-auth 200 |
| GET | `/api/privacy/access-log` | auth |  | `src/turtlePrivacyDashboardBackend.ts` | ✅ OK | valid-auth 200 |
| POST | `/api/privacy/log-access` | auth |  | `src/turtlePrivacyDashboardBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| POST | `/api/privacy/mask-activity` | auth |  | `src/turtlePrivacyDashboardBackend.ts` | ✅ OK | valid-auth 200 |
| GET | `/api/privacy/permissions` | auth |  | `src/turtlePrivacyDashboardBackend.ts` | ✅ OK | valid-auth 200 |
| POST | `/api/privacy/permissions` | auth |  | `src/turtlePrivacyDashboardBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| GET | `/api/privacy/summary` | auth |  | `src/turtlePrivacyDashboardBackend.ts` | ✅ OK | valid-auth 200 |
| GET | `/api/privacy/third-party` | auth |  | `src/turtlePrivacyDashboardBackend.ts` | ✅ OK | valid-auth 200 |
| POST | `/api/privacy/third-party/:appId/revoke` | auth |  | `src/turtlePrivacyDashboardBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| POST | `/api/profile/biodata` | auth |  | `src/turtleBioDataBackend.ts` | ✅ OK | valid-auth 200 |
| GET | `/api/profile/biodata/:userId` | auth |  | `src/turtleBioDataBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| GET | `/api/profile/export` | auth |  | `server.ts` | ✅ OK | valid-auth 200 |
| POST | `/api/profile/resume` | auth |  | `src/turtleResumeBackend.ts` | ✅ OK | valid-auth 200 |
| GET | `/api/profile/resume/:userId` | auth |  | `src/turtleResumeBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| POST | `/api/profile/update` | auth |  | `server.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| GET | `/api/prograph/jobs` | auth |  | `src/turtleProGraphBackend.ts` | ✅ OK | valid-auth 200 |
| POST | `/api/prograph/jobs` | auth |  | `src/turtleProGraphBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| POST | `/api/prograph/jobs/:id/apply` | auth |  | `src/turtleProGraphBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| GET | `/api/prograph/jobs/matches` | auth |  | `src/turtleProGraphBackend.ts` | ✅ OK | valid-auth 200 |
| GET | `/api/prograph/profile/:userId` | auth |  | `src/turtleProGraphBackend.ts` | ✅ OK | valid-auth 200 |
| POST | `/api/prograph/recommendations` | auth |  | `src/turtleProGraphBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| POST | `/api/prograph/recommendations/request` | auth |  | `src/turtleProGraphBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| GET | `/api/prograph/recommendations/requests` | auth |  | `src/turtleProGraphBackend.ts` | ✅ OK | valid-auth 200 |
| POST | `/api/prograph/skills` | auth |  | `src/turtleProGraphBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| POST | `/api/prograph/skills/:id/endorse` | auth |  | `src/turtleProGraphBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| GET | `/api/prograph/skills/:id/quiz` | auth |  | `src/turtleProGraphBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| POST | `/api/prograph/skills/:id/verify` | auth |  | `src/turtleProGraphBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| GET | `/api/quran-circles` | auth |  | `src/turtleQuranCircleBackend.ts` | 🚫 PUBLIC-READ | intentional public read (200 no-auth) |
| POST | `/api/quran-circles` | auth |  | `src/turtleQuranCircleBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| POST | `/api/quran-circles/:id/join` | auth |  | `src/turtleQuranCircleBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| POST | `/api/quran-circles/:id/mute` | auth |  | `src/turtleQuranCircleBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| POST | `/api/quran-circles/:id/note` | auth |  | `src/turtleQuranCircleBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| GET | `/api/redteam/challenges` | auth |  | `src/turtleRedTeamBackend.ts` | 🚫 PUBLIC-READ | intentional public read (200 no-auth) |
| POST | `/api/redteam/challenges` | auth |  | `src/turtleRedTeamBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| GET | `/api/redteam/leaderboard` | public |  | `src/turtleRedTeamBackend.ts` | ✅ OK | valid-auth 200 |
| POST | `/api/redteam/score` | auth | yes | `src/turtleRedTeamBackend.ts` | 🔒 ADMIN | 403 without admin key; 2xx with x-admin-key (verified) |
| GET | `/api/redteam/submissions` | auth | yes | `src/turtleRedTeamBackend.ts` | ✅ OK | valid-auth 200 |
| POST | `/api/redteam/submit` | auth |  | `src/turtleRedTeamBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| GET | `/api/reels` | auth |  | `server.ts` | ✅ OK | valid-auth 200 |
| DELETE | `/api/reels/:id` | auth |  | `server.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| POST | `/api/reels/:id/comment` | auth |  | `server.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| POST | `/api/reels/:id/like` | auth |  | `server.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| POST | `/api/reels/:id/view` | auth |  | `server.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| GET | `/api/reels/collab` | auth |  | `src/turtleCollaborativeReelsBackend.ts` | ✅ OK | valid-auth 200 |
| POST | `/api/reels/collab` | auth |  | `src/turtleCollaborativeReelsBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| GET | `/api/reels/collab/:id` | auth |  | `src/turtleCollaborativeReelsBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| POST | `/api/reels/collab/:id/element` | auth |  | `src/turtleCollaborativeReelsBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| POST | `/api/reels/collab/:id/publish` | auth |  | `src/turtleCollaborativeReelsBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| POST | `/api/reels/collab/:id/view` | auth |  | `src/turtleCollaborativeReelsBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| GET | `/api/reels/feed` | auth |  | `server.ts` | ✅ OK | valid-auth 200 |
| GET | `/api/reels/feed` | public |  | `src/turtleCollaborativeReelsBackend.ts` | ✅ OK | valid-auth 200 |
| POST | `/api/reels/invite` | auth |  | `src/turtleCollaborativeReelsBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| POST | `/api/reels/join` | auth |  | `src/turtleCollaborativeReelsBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| POST | `/api/reels/upload` | auth |  | `server.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| GET | `/api/rentals` | auth |  | `src/turtleRentalBackend.ts` | 🚫 PUBLIC-READ | intentional public read (200 no-auth) |
| POST | `/api/rentals` | auth |  | `src/turtleRentalBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| POST | `/api/rentals/:id/rent` | auth |  | `src/turtleRentalBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| POST | `/api/rentals/:id/return` | auth |  | `src/turtleRentalBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| GET | `/api/reputation` | auth |  | `src/turtleReputationBackend.ts` | ✅ OK | valid-auth 200 |
| GET | `/api/reputation/:userId` | public |  | `src/turtleReputationBackend.ts` | ✅ OK | valid-auth 200 |
| GET | `/api/reputation/leaderboard` | public |  | `src/turtleReputationBackend.ts` | ✅ OK | valid-auth 200 |
| POST | `/api/reputation/refresh` | auth |  | `src/turtleReputationBackend.ts` | ✅ OK | valid-auth 200 |
| GET | `/api/revenue/groups` | auth |  | `src/turtleRevenueShareBackend.ts` | ✅ OK | valid-auth 200 |
| POST | `/api/revenue/groups` | auth |  | `src/turtleRevenueShareBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| GET | `/api/revenue/groups/:id` | auth |  | `src/turtleRevenueShareBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| POST | `/api/revenue/groups/:id/admins` | auth |  | `src/turtleRevenueShareBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| POST | `/api/revenue/groups/:id/deposit` | auth |  | `src/turtleRevenueShareBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| POST | `/api/revenue/groups/:id/distribute` | auth |  | `src/turtleRevenueShareBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| GET | `/api/rooms` | auth |  | `src/turtleStudyRoomsBackend.ts` | 🚫 PUBLIC-READ | intentional public read (200 no-auth) |
| POST | `/api/rooms` | auth |  | `src/turtleStudyRoomsBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| GET | `/api/rooms/:id` | auth |  | `src/turtleStudyRoomsBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| POST | `/api/rooms/:id/join` | auth |  | `src/turtleStudyRoomsBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| POST | `/api/rooms/:id/leave` | auth |  | `src/turtleStudyRoomsBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| POST | `/api/rooms/:id/pomodoro` | auth |  | `src/turtleStudyRoomsBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| POST | `/api/rooms/:id/presence` | auth |  | `src/turtleStudyRoomsBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| GET | `/api/rti` | auth |  | `src/turtleRTIBackend.ts` | ✅ OK | valid-auth 200 |
| POST | `/api/rti` | auth |  | `src/turtleRTIBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| POST | `/api/rti/:id/respond` | auth |  | `src/turtleRTIBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| GET | `/api/safehaven/events` | auth |  | `src/turtleSafeHavenBackend.ts` | ✅ OK | valid-auth 200 |
| POST | `/api/safehaven/events` | auth |  | `src/turtleSafeHavenBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| GET | `/api/safehaven/events/:id` | auth |  | `src/turtleSafeHavenBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| POST | `/api/safehaven/events/:id/ack` | auth |  | `src/turtleSafeHavenBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| POST | `/api/safehaven/events/:id/report` | auth |  | `src/turtleSafeHavenBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| POST | `/api/safehaven/events/:id/resolve` | auth |  | `src/turtleSafeHavenBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| GET | `/api/safehaven/havens` | auth |  | `src/turtleSafeHavenBackend.ts` | ✅ OK | valid-auth 200 |
| POST | `/api/safehaven/havens` | auth |  | `src/turtleSafeHavenBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| DELETE | `/api/safehaven/havens/:id` | auth |  | `src/turtleSafeHavenBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| GET | `/api/safehaven/havens/:id` | auth |  | `src/turtleSafeHavenBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| POST | `/api/safehaven/havens/:id/open` | auth |  | `src/turtleSafeHavenBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| POST | `/api/safehaven/havens/:id/report` | auth |  | `src/turtleSafeHavenBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| POST | `/api/safehaven/havens/:id/verify` | auth |  | `src/turtleSafeHavenBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| GET | `/api/safehaven/meta` | auth |  | `src/turtleSafeHavenBackend.ts` | 🚫 PUBLIC-READ | intentional public read (200 no-auth) |
| GET | `/api/safehaven/status` | auth |  | `src/turtleSafeHavenBackend.ts` | ✅ OK | valid-auth 200 |
| GET | `/api/safesos/contacts` | auth |  | `src/turtleSafeSOSBackend.ts` | ✅ OK | valid-auth 200 |
| POST | `/api/safesos/contacts` | auth |  | `src/turtleSafeSOSBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| DELETE | `/api/safesos/contacts/:contactId` | auth |  | `src/turtleSafeSOSBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| GET | `/api/safesos/events` | auth |  | `src/turtleSafeSOSBackend.ts` | ✅ OK | valid-auth 200 |
| POST | `/api/safesos/events` | auth |  | `src/turtleSafeSOSBackend.ts` | ✅ OK | valid-auth 200 |
| POST | `/api/safesos/events/:id/ack` | auth |  | `src/turtleSafeSOSBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| POST | `/api/safesos/events/:id/report` | auth |  | `src/turtleSafeSOSBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| POST | `/api/safesos/events/:id/resolve` | auth |  | `src/turtleSafeSOSBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| DELETE | `/api/safesos/incoming/:contactId` | auth |  | `src/turtleSafeSOSBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| GET | `/api/safesos/status` | auth |  | `src/turtleSafeSOSBackend.ts` | ✅ OK | valid-auth 200 |
| POST | `/api/safesos/walk` | auth |  | `src/turtleSafeSOSBackend.ts` | ✅ OK | valid-auth 200 |
| POST | `/api/safesos/walk/:id/checkin` | auth |  | `src/turtleSafeSOSBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| POST | `/api/safesos/walk/:id/end` | auth |  | `src/turtleSafeSOSBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| GET | `/api/safety/contacts` | auth |  | `src/turtleSafetyShieldBackend.ts` | ✅ OK | valid-auth 200 |
| POST | `/api/safety/contacts` | auth |  | `src/turtleSafetyShieldBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| DELETE | `/api/safety/contacts/:userId` | auth |  | `src/turtleSafetyShieldBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| GET | `/api/safety/events` | auth |  | `src/turtleSafetyShieldBackend.ts` | ✅ OK | valid-auth 200 |
| POST | `/api/safety/events` | auth |  | `src/turtleSafetyShieldBackend.ts` | ✅ OK | valid-auth 200 |
| GET | `/api/safety/events/:id` | auth |  | `src/turtleSafetyShieldBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| POST | `/api/safety/events/:id/acknowledge` | auth |  | `src/turtleSafetyShieldBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| POST | `/api/safety/events/:id/resolve` | auth |  | `src/turtleSafetyShieldBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| POST | `/api/safety/profile` | auth |  | `src/turtleSafetyShieldBackend.ts` | ✅ OK | valid-auth 200 |
| GET | `/api/safety/proximity/alerts` | auth |  | `src/turtleProximityAlertBackend.ts` | ✅ OK | valid-auth 200 |
| POST | `/api/safety/proximity/alerts/:id/ack` | auth |  | `src/turtleProximityAlertBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| POST | `/api/safety/proximity/check` | auth |  | `src/turtleProximityAlertBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| GET | `/api/safety/proximity/settings` | auth |  | `src/turtleProximityAlertBackend.ts` | ✅ OK | valid-auth 200 |
| POST | `/api/safety/proximity/settings` | auth |  | `src/turtleProximityAlertBackend.ts` | ✅ OK | valid-auth 200 |
| POST | `/api/safety/route` | auth |  | `src/turtleSafeEscortBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| POST | `/api/safety/search` | auth |  | `src/turtleSafetyShieldBackend.ts` | ✅ OK | valid-auth 200 |
| GET | `/api/safety/shorts` | public |  | `src/turtleSafetyShortsBackend.ts` | ✅ OK | valid-auth 200 |
| POST | `/api/safety/shorts/:id/upvote` | auth |  | `src/turtleSafetyShortsBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| POST | `/api/safety/shorts/submit` | auth |  | `src/turtleSafetyShortsBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| GET | `/api/safety/status` | auth |  | `src/turtleSafetyShieldBackend.ts` | ✅ OK | valid-auth 200 |
| GET | `/api/safety/tags` | auth |  | `src/turtleSafetyShortsBackend.ts` | 🚫 PUBLIC-READ | intentional public read (200 no-auth) |
| POST | `/api/sat/relay` | auth |  | `src/turtleSatelliteBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| GET | `/api/sat/relays` | auth |  | `src/turtleSatelliteBackend.ts` | ✅ OK | valid-auth 200 |
| GET | `/api/saved` | auth |  | `server.ts` | ✅ OK | valid-auth 200 |
| GET | `/api/savingcircle` | auth |  | `src/turtleSavingCircleBackend.ts` | 🚫 PUBLIC-READ | intentional public read (200 no-auth) |
| POST | `/api/savingcircle` | auth |  | `src/turtleSavingCircleBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| POST | `/api/savingcircle/:id/contribute` | auth |  | `src/turtleSavingCircleBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| POST | `/api/savingcircle/:id/join` | auth |  | `src/turtleSavingCircleBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| GET | `/api/scholarships` | auth |  | `src/turtleScholarshipBackend.ts` | 🚫 PUBLIC-READ | intentional public read (200 no-auth) |
| POST | `/api/scholarships` | auth |  | `src/turtleScholarshipBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| POST | `/api/scholarships/:id/save` | auth |  | `src/turtleScholarshipBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| GET | `/api/scholarships/saved` | auth |  | `src/turtleScholarshipBackend.ts` | ✅ OK | valid-auth 200 |
| GET | `/api/search/media` | auth |  | `src/turtleMediaSearchBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| POST | `/api/search/media/backfill` | auth |  | `src/turtleMediaSearchBackend.ts` | ✅ OK | valid-auth 200 |
| POST | `/api/search/media/index` | auth |  | `src/turtleMediaSearchBackend.ts` | ✅ OK | valid-auth 200 |
| GET | `/api/search/smart` | public |  | `src/turtleSmartSearchJSONGenerator.ts` | ✅ OK | valid-auth 200 |
| GET | `/api/searchQueries` | auth |  | `server.ts` | 🚫 PUBLIC-READ | intentional public read (200 no-auth) |
| POST | `/api/searchQueries` | auth |  | `server.ts` | 🚫 PUBLIC-READ | intentional public read (200 no-auth) |
| GET | `/api/sharedsubs` | auth |  | `src/turtleSharedSubsBackend.ts` | ✅ OK | valid-auth 200 |
| POST | `/api/sharedsubs` | auth |  | `src/turtleSharedSubsBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| POST | `/api/sharedsubs/:id/join` | auth |  | `src/turtleSharedSubsBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| POST | `/api/sharedsubs/:id/pay` | auth |  | `src/turtleSharedSubsBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| POST | `/api/sharedsubs/:id/settle` | auth |  | `src/turtleSharedSubsBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| POST | `/api/shelter` | auth |  | `src/turtleSafeShelterBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| POST | `/api/shelter/:id/checkin` | auth |  | `src/turtleSafeShelterBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| POST | `/api/shelter/:id/help` | auth |  | `src/turtleSafeShelterBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| POST | `/api/shelter/:id/report` | auth |  | `src/turtleSafeShelterBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| POST | `/api/shelter/:id/update` | auth |  | `src/turtleSafeShelterBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| POST | `/api/shelter/:id/verify` | auth |  | `src/turtleSafeShelterBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| GET | `/api/shelter/alerts` | auth |  | `src/turtleSafeShelterBackend.ts` | ✅ OK | valid-auth 200 |
| POST | `/api/shelter/alerts` | auth |  | `src/turtleSafeShelterBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| POST | `/api/shelter/alerts/:id/confirm` | auth |  | `src/turtleSafeShelterBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| POST | `/api/shelter/alerts/:id/lift` | auth |  | `src/turtleSafeShelterBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| POST | `/api/shelter/alerts/:id/report` | auth |  | `src/turtleSafeShelterBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| POST | `/api/shelter/evacuate` | auth |  | `src/turtleEvacuationBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| GET | `/api/shelter/evacuate/status` | public |  | `src/turtleEvacuationBackend.ts` | ✅ OK | valid-auth 200 |
| POST | `/api/shelter/help/:requestId/resolve` | auth |  | `src/turtleSafeShelterBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| POST | `/api/shelter/help/:requestId/respond` | auth |  | `src/turtleSafeShelterBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| GET | `/api/shelter/list` | auth |  | `src/turtleSafeShelterBackend.ts` | ✅ OK | valid-auth 200 |
| GET | `/api/shelter/status` | auth |  | `src/turtleSafeShelterBackend.ts` | ✅ OK | valid-auth 200 |
| POST | `/api/silentdrop` | auth |  | `src/turtleSilentDropBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| POST | `/api/silentdrop/:id/view` | auth |  | `src/turtleSilentDropBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| GET | `/api/silentdrop/active` | auth |  | `src/turtleSilentDropBackend.ts` | 🚫 PUBLIC-READ | intentional public read (200 no-auth) |
| POST | `/api/silentdrop/cleanup` | auth |  | `src/turtleSilentDropBackend.ts` | ✅ OK | valid-auth 200 |
| GET | `/api/skills` | auth |  | `src/turtleSkillExchangeBackend.ts` | ✅ OK | valid-auth 200 |
| POST | `/api/skills` | auth |  | `src/turtleSkillExchangeBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| DELETE | `/api/skills/:id` | auth |  | `src/turtleSkillExchangeBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| GET | `/api/skills/match` | auth |  | `src/turtleSkillExchangeBackend.ts` | ✅ OK | valid-auth 200 |
| POST | `/api/sos/alert` | auth |  | `src/turtleSOSAlertBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| GET | `/api/sos/alerts` | auth |  | `src/turtleSOSAlertBackend.ts` | ✅ OK | valid-auth 200 |
| GET | `/api/sos/alerts/:id` | auth |  | `src/turtleSOSAlertBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| POST | `/api/sos/alerts/:id/acknowledge` | auth |  | `src/turtleSOSAlertBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| POST | `/api/sos/alerts/:id/resolve` | auth |  | `src/turtleSOSAlertBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| GET | `/api/sos/contacts` | auth |  | `src/turtleSOSAlertBackend.ts` | ✅ OK | valid-auth 200 |
| POST | `/api/sos/contacts` | auth |  | `src/turtleSOSAlertBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| POST | `/api/sos/contacts/:contactId/remove` | auth |  | `src/turtleSOSAlertBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| GET | `/api/sos/meta` | auth |  | `src/turtleSOSAlertBackend.ts` | 🚫 PUBLIC-READ | intentional public read (200 no-auth) |
| POST | `/api/sos/sisterhood` | auth |  | `src/turtleSOSAlertBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| POST | `/api/sos/trigger` | auth |  | `src/turtleSOSAlertBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| GET | `/api/sounds` | public |  | `src/turtleTrendingSoundBackend.ts` | ✅ OK | valid-auth 200 |
| POST | `/api/sounds/track` | auth |  | `src/turtleTrendingSoundBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| GET | `/api/sounds/trending` | public |  | `src/turtleTrendingSoundBackend.ts` | ✅ OK | valid-auth 200 |
| POST | `/api/sovereignty/delete/cancel` | auth |  | `src/turtleDataSovereigntyBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| POST | `/api/sovereignty/delete/confirm` | auth |  | `src/turtleDataSovereigntyBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| POST | `/api/sovereignty/delete/request` | auth |  | `src/turtleDataSovereigntyBackend.ts` | ✅ OK | valid-auth 200 |
| GET | `/api/sovereignty/delete/status` | auth |  | `src/turtleDataSovereigntyBackend.ts` | ✅ OK | valid-auth 200 |
| GET | `/api/sovereignty/export` | auth |  | `src/turtleDataSovereigntyBackend.ts` | ✅ OK | valid-auth 200 |
| GET | `/api/sovereignty/exports` | auth |  | `src/turtleDataSovereigntyBackend.ts` | ✅ OK | valid-auth 200 |
| GET | `/api/sovereignty/inventory` | auth |  | `src/turtleDataSovereigntyBackend.ts` | ✅ OK | valid-auth 200 |
| GET | `/api/split/mine` | auth |  | `src/turtleSplitBillBackend.ts` | ✅ OK | valid-auth 200 |
| POST | `/api/splits/:id/delete` | auth |  | `src/turtleSplitBillBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| POST | `/api/splits/:id/settle` | auth |  | `src/turtleSplitBillBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| POST | `/api/stealthrec` | auth |  | `src/turtleStealthRecBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| GET | `/api/stealthrec/boost/:postId` | public |  | `src/turtleStealthRecBackend.ts` | ✅ OK | valid-auth 200 |
| GET | `/api/stealthrec/inbox` | auth |  | `src/turtleStealthRecBackend.ts` | ✅ OK | valid-auth 200 |
| GET | `/api/stealthrec/mine` | auth |  | `src/turtleStealthRecBackend.ts` | ✅ OK | valid-auth 200 |
| GET | `/api/stories` | auth |  | `src/turtleStoriesBackend.ts` | ✅ OK | valid-auth 200 |
| POST | `/api/stories` | auth |  | `src/turtleStoriesBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| DELETE | `/api/stories/:id` | auth |  | `src/turtleStoriesBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| GET | `/api/stories/:id` | auth |  | `src/turtleStoriesBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| POST | `/api/stories/:id/poll` | auth |  | `src/turtleStoriesBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| POST | `/api/stories/:id/question` | auth |  | `src/turtleStoriesBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| POST | `/api/stories/:id/react` | auth |  | `src/turtleStoriesBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| POST | `/api/stories/:id/view` | auth |  | `src/turtleStoriesBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| GET | `/api/stories/:id/viewers` | auth |  | `src/turtleStoriesBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| POST | `/api/stories/create` | auth |  | `src/turtleStoriesBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| GET | `/api/stories/mine` | auth |  | `src/turtleStoriesBackend.ts` | ✅ OK | valid-auth 200 |
| GET | `/api/stories/music` | auth |  | `src/turtleStoriesBackend.ts` | 🚫 PUBLIC-READ | intentional public read (200 no-auth) |
| POST | `/api/stories/private` | auth |  | `src/turtleSnapMapBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| GET | `/api/streaks` | auth |  | `src/turtleStreaksBackend.ts` | ✅ OK | valid-auth 200 |
| POST | `/api/streaks/checkin` | auth |  | `src/turtleStreaksBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| GET | `/api/streaks/leaderboard` | public |  | `src/turtleStreaksBackend.ts` | ✅ OK | valid-auth 200 |
| POST | `/api/stream/token` | auth |  | `server.ts` | ✅ OK | valid-auth 200 |
| POST | `/api/stream/upsert-target` | auth |  | `server.ts` | ✅ OK | valid-auth 200 |
| GET | `/api/studio/stats` | auth |  | `server.ts` | ✅ OK | valid-auth 200 |
| GET | `/api/subscriptions` | auth |  | `src/turtleSubscriptionsBackend.ts` | ✅ OK | valid-auth 200 |
| POST | `/api/subscriptions` | auth |  | `src/turtleSubscriptionsBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| DELETE | `/api/subscriptions/:id` | auth |  | `src/turtleSubscriptionsBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| GET | `/api/subscriptions/creators` | auth |  | `src/turtleSubscriptionsBackend.ts` | ✅ OK | valid-auth 200 |
| POST | `/api/subscriptions/gate` | auth |  | `src/turtleSubscriptionsBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| GET | `/api/subscriptions/mine` | auth |  | `src/turtleSubscriptionsBackend.ts` | ✅ OK | valid-auth 200 |
| GET | `/api/subscriptions/status/:creatorId` | auth |  | `src/turtleSubscriptionsBackend.ts` | ✅ OK | valid-auth 200 |
| GET | `/api/tenders` | auth |  | `src/turtleCivicBackend.ts` | 🚫 PUBLIC-READ | intentional public read (200 no-auth) |
| POST | `/api/tenders` | auth |  | `src/turtleCivicBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| POST | `/api/tenders/:id/bids` | auth |  | `src/turtleCivicBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| GET | `/api/tenders/scan-anomalies` | auth |  | `src/turtleCivicBackend.ts` | 🚫 PUBLIC-READ | intentional public read (200 no-auth) |
| GET | `/api/traffic` | auth |  | `src/turtleParkingBackend.ts` | 🚫 PUBLIC-READ | intentional public read (200 no-auth) |
| POST | `/api/traffic` | auth |  | `src/turtleParkingBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| POST | `/api/traffic/:id/confirm` | auth |  | `src/turtleParkingBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| GET | `/api/travel/plans` | auth |  | `src/turtleTravelBackend.ts` | 🚫 PUBLIC-READ | intentional public read (200 no-auth) |
| POST | `/api/travel/plans` | auth |  | `src/turtleTravelBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| POST | `/api/travel/plans/:id/join` | auth |  | `src/turtleTravelBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| GET | `/api/travel/plans/mine` | auth |  | `src/turtleTravelBackend.ts` | ✅ OK | valid-auth 200 |
| GET | `/api/trends/hashtags` | public |  | `src/turtleTrendingTopicEngine.ts` | ✅ OK | valid-auth 200 |
| GET | `/api/trips` | auth |  | `src/turtleTravelBackend.ts` | 🚫 PUBLIC-READ | intentional public read (200 no-auth) |
| POST | `/api/trips` | auth |  | `src/turtleTravelBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| POST | `/api/trips/:id/budget` | auth |  | `src/turtleTravelBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| POST | `/api/trips/:id/join` | auth |  | `src/turtleTravelBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| GET | `/api/tutor` | auth |  | `src/turtleTutorBackend.ts` | 🚫 PUBLIC-READ | intentional public read (200 no-auth) |
| POST | `/api/tutor` | auth |  | `src/turtleTutorBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| POST | `/api/tutor/:id/offer` | auth |  | `src/turtleTutorBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| GET | `/api/tutor/mine` | auth |  | `src/turtleTutorBackend.ts` | ✅ OK | valid-auth 200 |
| POST | `/api/twin/enable` | auth |  | `src/turtleDigitalTwinBackend.ts` | ✅ OK | valid-auth 200 |
| POST | `/api/twin/reply` | auth |  | `src/turtleDigitalTwinBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| GET | `/api/twin/status` | auth |  | `src/turtleDigitalTwinBackend.ts` | ✅ OK | valid-auth 200 |
| POST | `/api/twin/train` | auth |  | `src/turtleDigitalTwinBackend.ts` | ✅ OK | valid-auth 200 |
| POST | `/api/upload` | auth |  | `server.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| GET | `/api/users/:id/humanity` | auth |  | `src/turtleHumanityBackend.ts` | 🚫 PUBLIC-READ | intentional public read (200 no-auth) |
| GET | `/api/users/:userId/summary` | auth |  | `src/turtleProfileSummaryBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| POST | `/api/users/:userId/summary/refresh` | auth |  | `src/turtleProfileSummaryBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| GET | `/api/users/:userId/timeline` | auth |  | `src/turtleRelationshipTimelineBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| GET | `/api/vault/entries` | auth |  | `src/turtleSecureVaultBackend.ts` | ⚠️ 4xx-BL | valid-auth 401 role/state gate (e.g. conversation membership, 2FA code, vault lock) |
| POST | `/api/vault/entries` | auth |  | `src/turtleSecureVaultBackend.ts` | ⚠️ 4xx-BL | valid-auth 401 role/state gate (e.g. conversation membership, 2FA code, vault lock) |
| DELETE | `/api/vault/entries/:id` | auth |  | `src/turtleSecureVaultBackend.ts` | ⚠️ 4xx-BL | valid-auth 401 role/state gate (e.g. conversation membership, 2FA code, vault lock) |
| GET | `/api/vault/entries/:id` | auth |  | `src/turtleSecureVaultBackend.ts` | ⚠️ 4xx-BL | valid-auth 401 role/state gate (e.g. conversation membership, 2FA code, vault lock) |
| POST | `/api/vault/entries/:id/pin` | auth |  | `src/turtleSecureVaultBackend.ts` | ⚠️ 4xx-BL | valid-auth 401 role/state gate (e.g. conversation membership, 2FA code, vault lock) |
| POST | `/api/vault/evidence` | auth |  | `src/turtleEvidenceVaultBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| POST | `/api/vault/setup` | auth |  | `src/turtleSecureVaultBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| GET | `/api/vault/status` | auth |  | `src/turtleSecureVaultBackend.ts` | ✅ OK | valid-auth 200 |
| POST | `/api/vault/unlock` | auth |  | `src/turtleSecureVaultBackend.ts` | ⚠️ 4xx-BL | valid-auth 401 role/state gate (e.g. conversation membership, 2FA code, vault lock) |
| POST | `/api/vehicle/analyze` | public |  | `src/turtleAIVehicleAnalysisEngine.ts` | ✅ OK | valid-auth 200 |
| GET | `/api/venues` | auth |  | `src/turtleVenueBackend.ts` | 🚫 PUBLIC-READ | intentional public read (200 no-auth) |
| POST | `/api/venues` | auth |  | `src/turtleVenueBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| GET | `/api/verified-live` | auth |  | `src/turtleLiveReporterBackend.ts` | 🚫 PUBLIC-READ | intentional public read (200 no-auth) |
| POST | `/api/voice/upload` | auth |  | `server.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| GET | `/api/wallet/balance` | auth |  | `src/turtleOceanPayBackend.ts` | ✅ OK | valid-auth 200 |
| POST | `/api/wallet/pay` | auth |  | `src/turtleOceanPayBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| GET | `/api/wallet/transactions` | auth |  | `src/turtleOceanPayBackend.ts` | ✅ OK | valid-auth 200 |
| POST | `/api/wallet/transfer` | auth |  | `src/turtleOceanPayBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| GET | `/api/ward/meetings` | auth |  | `src/turtleWardBackend.ts` | 🚫 PUBLIC-READ | intentional public read (200 no-auth) |
| POST | `/api/ward/meetings` | auth |  | `src/turtleWardBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| GET | `/api/ward/projects` | auth |  | `src/turtleWardBackend.ts` | 🚫 PUBLIC-READ | intentional public read (200 no-auth) |
| POST | `/api/ward/projects` | auth |  | `src/turtleWardBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| POST | `/api/ward/projects/:id/vote` | auth |  | `src/turtleWardBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| GET | `/api/watch/contacts` | auth |  | `src/turtleSafeWatchBackend.ts` | ✅ OK | valid-auth 200 |
| POST | `/api/watch/contacts` | auth |  | `src/turtleSafeWatchBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| POST | `/api/watch/contacts/:contactId/remove` | auth |  | `src/turtleSafeWatchBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| GET | `/api/watch/posts` | public |  | `src/turtleSafeWatchBackend.ts` | ✅ OK | valid-auth 200 |
| POST | `/api/watch/posts` | auth |  | `src/turtleSafeWatchBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| GET | `/api/watch/posts/:id` | auth |  | `src/turtleSafeWatchBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| POST | `/api/watch/posts/:id/ack` | auth |  | `src/turtleSafeWatchBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| POST | `/api/watch/posts/:id/confirm` | auth |  | `src/turtleSafeWatchBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| POST | `/api/watch/posts/:id/status` | auth |  | `src/turtleSafeWatchBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| GET | `/api/watch/status` | public |  | `src/turtleSafeWatchBackend.ts` | ✅ OK | valid-auth 200 |
| GET | `/api/watermark/:assetId` | auth |  | `src/turtleWatermarkBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| POST | `/api/watermark/register` | auth |  | `src/turtleWatermarkBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| POST | `/api/watermark/verify` | auth |  | `src/turtleWatermarkBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| GET | `/api/whiteboard/session` | auth | yes | `src/turtleServerContext.ts` | ✅ OK | valid-auth 200 |
| GET | `/api/whiteboard/session` | auth |  | `src/turtleWhiteboardBackend.ts` | ✅ OK | valid-auth 200 |
| POST | `/api/whiteboard/session` | auth |  | `src/turtleWhiteboardBackend.ts` | ✅ OK | valid-auth 200 |
| GET | `/api/whiteboard/session/:id` | auth |  | `src/turtleWhiteboardBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| POST | `/api/whiteboard/session/:id/close` | auth |  | `src/turtleWhiteboardBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| POST | `/api/whiteboard/session/:id/elements` | auth |  | `src/turtleWhiteboardBackend.ts` | ⚠️ 4xx-BL | valid-auth 404 (business logic on generic body) |
| POST | `/api/zakat/calculate` | public |  | `src/turtleZakatBackend.ts` | ✅ OK | valid-auth 200 |
| GET | `/api/zkkyc/challenge` | auth |  | `src/turtleZKKYCBackend.ts` | ✅ OK | valid-auth 200 |
| GET | `/api/zkkyc/status` | auth |  | `src/turtleZKKYCBackend.ts` | ✅ OK | valid-auth 200 |
| POST | `/api/zkkyc/submit` | auth |  | `src/turtleZKKYCBackend.ts` | ⚠️ 4xx-BL | valid-auth 400 (business logic on generic body) |
| USE | `/uploads` | public |  | `server.ts` | 🚫 PUBLIC | works without auth, 400 on bad body |
| USE | `/uploads` | public |  | `server.ts` | 🚫 PUBLIC | works without auth, 400 on bad body |
