# Code / Feature Index — Ocean

Maps every feature in `FEATURES.md` (current 1–200 numbering; the registry uses the legacy 109–260 ids) to its frontend component, backend module, route prefix and storage. Feature statuses come from FEATURES.md, cross-checked with the runtime sweep.

## Status counts (FEATURES.md + runtime)

| Status | Count |
|---|---|
| ✅ | 178 |
| ⚠️ | 17 |
| 🧪 | 5 |

## Feature table

| # | Feature | Status | Frontend | Backend | Route prefix | DB/store |
|---|---|---|---|---|---|---|
| 1 | Authentication | ✅ | `src/App.tsx (auth modal)` | `server.ts (core)` | `—` | database.json |
| 2 | Registration | ✅ | `src/App.tsx (signup)` | `server.ts (core)` | `—` | database.json |
| 3 | Profiles | ✅ | `src/App.tsx (profile panel)` | `server.ts (core)` | `—` | database.json |
| 4 | Feed (Ranked) | ✅ | `src/components/PostsSection.tsx` | `server.ts (core, /api/posts/feed) + turtleRankingEngine.ts` | `` | database.json |
| 5 | Posts | ✅ | `src/components/PostsSection.tsx` | `server.ts (core, /api/posts/*)` | `—` | database.json |
| 6 | Reactions | ✅ | `src/components/PostsSection.tsx` | `server.ts (core)` | `—` | database.json |
| 7 | Comments | ✅ | `src/components/CommentsModal.tsx` | `server.ts (core)` | `—` | database.json |
| 8 | Stories | ✅ | `src/components/StoriesBar.tsx + Stories2.tsx` | `src/turtleStoriesBackend.ts` | `POST /api/stories, POST /api/stories/create, GET /api/stories, GET /api/stories/mine` | database.json |
| 9 | Reels | ⚠️ | `src/components/PostsSection.tsx (feed video merge)` | `server.ts (core feed merge) + src/turtleReelsBackend.ts` | `` | database.json |
| 10 | Search | ✅ | `src/components/VisualSearch.tsx + HashtagTrendSection.tsx` | `src/turtleMediaSearchBackend.ts + src/turtleSmartSearchJSONGenerator.ts` | `POST /api/search/media/index, GET /api/search/media, POST /api/search/media/backfill, GET /api/search/smart` | database.json |
| 11 | Notifications | ✅ | `src/App.tsx` | `server.ts (core)` | `—` | database.json |
| 12 | Friends & Follows | ✅ | `src/App.tsx` | `server.ts (core)` | `—` | database.json |
| 13 | Trending | ✅ | `src/components/TrendingSounds.tsx + HashtagTrendSection.tsx` | `src/turtleTrendingTopicEngine.ts + src/turtleTrendingSoundBackend.ts` | `GET /api/trends/hashtags, POST /api/sounds/track, GET /api/sounds/trending, GET /api/sounds` | database.json |
| 14 | Admin Panel | ✅ | `src/components/AdminPanel.tsx` | `server.ts (core, /api/admin/*)` | `—` | database.json |
| 15 | Chat (1:1 + groups) | ✅ | `src/components/ChatModal.tsx` | `chatServer.ts (/ws/chat) + server.ts (REST)` | `—` | database.json |
| 16 | Voice/Video Calls | ✅ | `src/components/call/StreamCallLayer.tsx + call/P2PCallLayer.tsx + calling/ActiveCallScreen.tsx` | `src/calling/* (P2P mesh) + src/components/call/* (Jitsi)` | `—` | database.json |
| 17 | Random "Meet" | ✅ | `src/components/MeetView.tsx + OmegleRandomVideoCall.tsx` | `server.ts (/api/meet/*) + src/calling/meetRoomMesh.ts` | `—` | database.json |
| 18 | Random Text DM | ✅ | `src/components/RandomTextDmView.tsx` | `server.ts (/api/chat/random-match)` | `—` | database.json |
| 19 | Whiteboard | ✅ | `src/components/CallWhiteboard.tsx` | `src/turtleWhiteboardBackend.ts` | `GET /api/whiteboard/session, GET /api/whiteboard/session/:id, POST /api/whiteboard/session, POST /api/whiteboard/session/:id/elements` | database.json |
| 20 | Group Chat Moderation | ✅ | `(App.tsx / client-only)` | `server.ts (REST) + chatServer.ts (WS enforcement)` | `—` | database.json |
| 21 | Event Groups | ✅ | `src/components/EventGroups.tsx` | `src/turtleEventGroupsBackend.ts` | `POST /api/chat/event-groups, GET /api/chat/event-groups, GET /api/chat/event-groups/:id, POST /api/chat/event-groups/:id/archive` | database.json |
| 22 | Split Bill | ✅ | `src/components/SplitBillView.tsx` | `src/turtleSplitBillBackend.ts` | `GET /api/chats/:chatId/split, POST /api/chats/:chatId/split, GET /api/split/mine, POST /api/splits/:id/settle` | database.json |
| 23 | Voice Summarizer | ✅ | `src/components/VoiceSummary.tsx` | `src/turtleVoiceSummaryBackend.ts` | `GET /api/ai/voice-summary, POST /api/ai/voice-summary` | database.json |
| 24 | Study Rooms | ✅ | `src/components/StudyRooms.tsx` | `src/turtleStudyRoomsBackend.ts` | `GET /api/rooms, POST /api/rooms, GET /api/rooms/:id, POST /api/rooms/:id/join` | database.json |
| 25 | Relationship Timeline | ✅ | `src/components/RelationshipTimeline.tsx` | `src/turtleRelationshipTimelineBackend.ts` | `GET /api/users/:userId/timeline, GET /api/me/timeline` | database.json |
| 26 | Watch Together | ✅ | `src/components/WatchTogetherModal.tsx` | `chatServer.ts (watch_sync WS)` | `—` | database.json |
| 27 | Live Gifts (Live Ecosystem) | ⚠️ | `src/components/LiveEcosystem.tsx` | `src/turtleLiveEcosystemBackend.ts` | `GET /api/live/gifts, POST /api/live/gifts/send, GET /api/live/gifts/recent, GET /api/live/goals` | database.json |
| 28 | Channels & Creator Studio | ✅ | `(App.tsx / client-only)` | `server.ts (core /api/channels) + src/turtleLongFormVideoBackend.ts` | `POST /api/channels/:id/videos/:videoId/watch, POST /api/channels/:id/videos/:videoId/like, POST /api/channels/:id/videos/:videoId/save, POST /api/channels/:id/videos/:videoId/report` | database.json |
| 29 | Faceless AI Video | ✅ | `src/components/FacelessVideoGenerator.tsx` | `src/turtleFacelessVideoBackend.ts` | `POST /api/ai/faceless-video, GET /api/ai/faceless-video, GET /api/ai/faceless-video/:id` | database.json |
| 30 | Trending Sounds | ✅ | `src/components/TrendingSounds.tsx` | `src/turtleTrendingSoundBackend.ts` | `POST /api/sounds/track, GET /api/sounds/trending, GET /api/sounds` | database.json |
| 31 | Collaborative Reels | ✅ | `src/components/CollaborativeReels.tsx` | `src/turtleCollaborativeReelsBackend.ts` | `POST /api/reels/collab, GET /api/reels/collab, GET /api/reels/collab/:id, POST /api/reels/collab/:id/element` | database.json |
| 32 | Co-Streaming | ✅ | `src/components/CoStreaming.tsx` | `src/turtleCoStreamBackend.ts` | `POST /api/live/session, GET /api/live/session, GET /api/live/session/:id, POST /api/live/session/:id/cohost` | database.json |
| 33 | Reel Bounties | ✅ | `src/components/ReelBounties.tsx` | `src/turtleBountyBackend.ts` | `GET /api/bounty, POST /api/bounty, GET /api/bounty/:id, POST /api/bounty/:id/comment` | database.json |
| 34 | Revenue Share | ⚠️ | `src/components/RevenueShare.tsx` | `src/turtleRevenueShareBackend.ts` | `GET /api/revenue/groups, POST /api/revenue/groups, GET /api/revenue/groups/:id, POST /api/revenue/groups/:id/deposit` | database.json |
| 35 | Micro-Subscriptions | ✅ | `src/components/MicroSubscriptions.tsx` | `src/turtleSubscriptionsBackend.ts` | `GET /api/subscriptions/creators, GET /api/subscriptions, GET /api/subscriptions/mine, GET /api/subscriptions/status/:creatorId` | database.json |
| 36 | Ocean Cut — Video | ✅ | `src/components/editors/OceanCutVideo.tsx` | `src/turtleVideoEditorBackend.ts` | `POST /api/ai/subtitle-bengali, POST /api/ai/enhance-image, GET /api/editor/templates, POST /api/editor/templates` | database.json |
| 37 | Ocean Cut — Photo | ✅ | `src/components/editors/OceanCutVideo.tsx + OceanCutPhoto.tsx` | `src/turtleVideoEditorBackend.ts` | `POST /api/ai/subtitle-bengali, POST /api/ai/enhance-image, GET /api/editor/templates, POST /api/editor/templates` | database.json |
| 38 | Creation Lab | ✅ | `src/components/CreationLab.tsx` | `client-side (Canvas/MediaRecorder/MediaPipe) + src/turtleVideoEditorBackend.ts` | `POST /api/ai/subtitle-bengali, POST /api/ai/enhance-image, GET /api/editor/templates, POST /api/editor/templates` | localStorage / browser |
| 39 | Synthetic Media Watermark | ✅ | `src/components/WatermarkStudio.tsx` | `src/turtleWatermarkBackend.ts` | `POST /api/watermark/register, GET /api/watermark/:assetId, POST /api/watermark/verify` | database.json |
| 40 | Creator Monetization | ✅ | `src/components/CreatorMonetization.tsx` | `src/turtleCreatorMonetizationBackend.ts` | `GET /api/creator/dashboard, POST /api/creator/deals, GET /api/creator/deals, GET /api/creator/deals/mine` | database.json |
| 41 | Media Watermark (Studio) | ✅ | `src/components/WatermarkStudio.tsx` | `src/turtleWatermarkBackend.ts` | `POST /api/watermark/register, GET /api/watermark/:assetId, POST /api/watermark/verify` | database.json |
| 42 | Photo/Video Uploads | ✅ | `src/App.tsx + PostsSection.tsx` | `server.ts (core /api/upload)` | `—` | database.json |
| 43 | Safe SOS | ✅ | `src/components/SafeSOSView.tsx` | `src/turtleSafeSOSBackend.ts` | `GET /api/safesos/status, GET /api/safesos/contacts, POST /api/safesos/contacts, DELETE /api/safesos/contacts/:contactId` | database.json |
| 44 | Global SOS Button | ✅ | `src/components/SOSEmergencyButton.tsx` | `src/turtleSOSAlertBackend.ts (/api/sos/alert)` | `GET /api/sos/meta, GET /api/sos/contacts, POST /api/sos/contacts, POST /api/sos/contacts/:contactId/remove` | database.json |
| 45 | Safety Shield | ✅ | `src/components/SafetyShieldView.tsx` | `src/turtleSafetyShieldBackend.ts` | `GET /api/safety/status, GET /api/safety/events, GET /api/safety/events/:id, POST /api/safety/events` | database.json |
| 46 | Safe Shelter | ✅ | `src/components/SafeShelterView.tsx` | `src/turtleSafeShelterBackend.ts` | `GET /api/shelter/status, GET /api/shelter/list, POST /api/shelter, POST /api/shelter/:id/verify` | database.json |
| 47 | Blood Donor | ✅ | `src/components/BloodDonorRegistry.tsx` | `src/turtleBloodDonorBackend.ts` | `GET /api/blood/meta, GET /api/blood/status, POST /api/blood/donor, POST /api/blood/donor/optout` | database.json |
| 48 | Missing Person | ✅ | `src/components/MissingPersonView.tsx` | `src/turtleMissingPersonBackend.ts` | `GET /api/missing/reports, GET /api/missing/reports/:id, POST /api/missing/reports, POST /api/missing/reports/:id/sightings` | database.json |
| 49 | Missing Person — Visual Match | ✅ | `src/components/MissingPersonView.tsx` | `src/turtleMissingFaceSearchBackend.ts` | `POST /api/missing/face-upload, POST /api/missing/face-search, GET /api/missing/face-index, POST /api/missing/face-upload/:id/remove` | database.json |
| 50 | Safe Escort | ✅ | `src/components/SafeEscortView.tsx` | `src/turtleSafeEscortBackend.ts` | `GET /api/escort/meta, GET /api/escort/status, POST /api/escort/escort, POST /api/escort/escort/optout` | database.json |
| 51 | SOS Panic | ✅ | `(App.tsx / client-only)` | `src/turtleSOSAlertBackend.ts` | `GET /api/sos/meta, GET /api/sos/contacts, POST /api/sos/contacts, POST /api/sos/contacts/:contactId/remove` | database.json |
| 52 | Safe Watch | ✅ | `src/components/SafeWatchView.tsx` | `src/turtleSafeWatchBackend.ts` | `GET /api/watch/status, GET /api/watch/posts, GET /api/watch/posts/:id, POST /api/watch/posts` | database.json |
| 53 | Offline Mesh | ⚠️ | `src/components/OfflineMeshView.tsx + OfflineChatView.tsx` | `src/turtleOfflineMeshBackend.ts` | `GET /api/mesh/meta, POST /api/mesh/relay, GET /api/mesh/relay, GET /api/mesh/sync` | database.json |
| 54 | Safe Haven | ✅ | `src/components/SafeHavenView.tsx` | `src/turtleSafeHavenBackend.ts` | `GET /api/safehaven/meta, GET /api/safehaven/status, GET /api/safehaven/havens, GET /api/safehaven/havens/:id` | database.json |
| 55 | Flood Depth Mapper | ✅ | `src/components/FloodDepthMapperView.tsx` | `src/turtleFloodDepthMapperBackend.ts` | `GET /api/flood/overview, GET /api/flood/reports, POST /api/flood/reports, POST /api/flood/reports/:id/confirm` | database.json |
| 56 | Emergency Community Pools | ✅ | `(App.tsx / client-only)` | `src/turtleEmergencyPoolsBackend.ts` | `GET /api/emergency/pools, GET /api/emergency/pools/:id, POST /api/emergency/pools, POST /api/emergency/pools/:id/join` | database.json |
| 57 | Evacuation Routes | ✅ | `(App.tsx / client-only)` | `src/turtleEvacuationBackend.ts` | `POST /api/shelter/evacuate, GET /api/shelter/evacuate/status` | database.json |
| 58 | Community Kitchens | ✅ | `src/components/SmartCommunity.tsx` | `src/turtleCommunityKitchenBackend.ts` | `GET /api/disaster/kitchens, GET /api/disaster/kitchen-requests, POST /api/disaster/kitchens, POST /api/disaster/kitchens/:id/update` | database.json |
| 59 | Self-Defense Shorts | ✅ | `(App.tsx / client-only)` | `src/turtleSafetyShortsBackend.ts` | `GET /api/safety/shorts, GET /api/safety/tags, POST /api/safety/shorts/submit, POST /api/safety/shorts/:id/upvote` | database.json |
| 60 | Verified Live | ✅ | `(App.tsx / client-only)` | `src/turtleLiveReporterBackend.ts` | `GET /api/verified-live, GET /api/posts/:id/proof, POST /api/posts/verify-location, POST /api/posts/revoke-verification` | database.json |
| 61 | Proximity Alert | ✅ | `src/components/ProximityAlert.tsx` | `src/turtleProximityAlertBackend.ts` | `GET /api/safety/proximity/settings, POST /api/safety/proximity/settings, POST /api/safety/proximity/check, GET /api/safety/proximity/alerts` | database.json |
| 62 | Trigger Warnings | ✅ | `src/components/TriggerWarnings.tsx` | `src/turtleTriggerWarningBackend.ts` | `POST /api/posts/trigger-scan, GET /api/posts/trigger-scan/:postId, POST /api/posts/trigger-scan-text` | database.json |
| 63 | NSFW Filtering | ✅ | `src/components/NSFWMediaGuard.tsx + SafeImage.tsx` | `turtleNSFWServerEngine.ts + turtleNSFWFilter.ts + server.ts (text filter)` | `POST /api/nsfw/check` | database.json |
| 64 | Content Gate | ✅ | `src/components/ContentGate.tsx` | `src/turtleContentGateBackend.ts` | `POST /api/content-rating/:postId, GET /api/content-rating/:postId, GET /api/content-rating/gate/:postId` | database.json |
| 65 | Data Sovereignty | ✅ | `src/components/DataSovereigntyView.tsx` | `src/turtleDataSovereigntyBackend.ts` | `GET /api/sovereignty/inventory, GET /api/sovereignty/export, GET /api/sovereignty/exports, POST /api/sovereignty/delete/request` | database.json |
| 66 | E2E Encryption | ✅ | `(App.tsx / client-only)` | `src/turtleE2EEBackend.ts` | `POST /api/e2ee/keys, GET /api/e2ee/keys, GET /api/e2ee/keys/:userId, POST /api/e2ee/devices/pair-start` | database.json |
| 67 | Privacy Dashboard | ✅ | `src/components/PrivacyDashboard.tsx` | `src/turtlePrivacyDashboardBackend.ts` | `POST /api/privacy/log-access, GET /api/privacy/access-log, GET /api/privacy/third-party, POST /api/privacy/third-party/:appId/revoke` | database.json |
| 68 | Anonymous Mode | ✅ | `src/components/AnonymousMode.tsx` | `src/turtleAnonymousBackend.ts` | `POST /api/anonymous/pseudonym, GET /api/anonymous/pseudonym, PUT /api/anonymous/pseudonym, DELETE /api/anonymous/pseudonym` | database.json |
| 69 | Secure Vault | ⚠️ | `src/components/SecureVaultView.tsx` | `src/turtleSecureVaultBackend.ts` | `GET /api/vault/status, POST /api/vault/setup, POST /api/vault/unlock, POST /api/vault/entries` | database.json |
| 70 | Decentralized DID | ✅ | `(App.tsx / client-only)` | `src/turtleDecentralizedProfilesBackend.ts` | `POST /api/did/create, GET /api/did/mine, POST /api/did/export, POST /api/did/import` | database.json |
| 71 | Humanity Score | ✅ | `src/components/HumanityScore.tsx` | `src/turtleHumanityBackend.ts` | `POST /api/auth/humanity-score, GET /api/auth/humanity-score, GET /api/users/:id/humanity, POST /api/auth/humanity-reset` | database.json |
| 72 | Bot-Bounty | ✅ | `src/components/BotBounty.tsx` | `src/turtleBotBountyBackend.ts` | `POST /api/botbounty/report, GET /api/botbounty/reports, GET /api/botbounty/leaderboard` | database.json |
| 73 | Ghost Mode | ✅ | `src/components/GhostMode.tsx` | `src/turtleGhostViewBackend.ts` | `POST /api/posts/:id/ghost-view, GET /api/posts/:id/ghost-status, GET /api/posts/ghost/my` | database.json |
| 74 | Privacy-Preserving KYC (zkKYC) | ✅ | `src/components/PrivacyDashboard.tsx` | `src/turtleZKKYCBackend.ts` | `GET /api/zkkyc/challenge, POST /api/zkkyc/submit, GET /api/zkkyc/status` | database.json |
| 75 | Hardware Wallet | ⚠️ | `src/components/HardwareWallet.tsx` | `src/turtleHardwareWalletBackend.ts` | `GET /api/hardware-wallet, POST /api/hardware-wallet, DELETE /api/hardware-wallet/:id` | database.json |
| 76 | Satellite Fallback | ⚠️ | `src/components/SatelliteFallback.tsx` | `src/turtleSatelliteBackend.ts` | `POST /api/sat/relay, GET /api/sat/relays` | database.json |
| 77 | Quantum-Resistant Crypto | ⚠️ | `src/components/QuantumCrypto.tsx` | `src/turtleQuantumCryptoBackend.ts` | `GET /api/pq/keys, POST /api/pq/keys, POST /api/pq/exchange, POST /api/pq/messages` | database.json |
| 78 | Federated Learning | ✅ | `src/components/FederatedLearning.tsx` | `src/turtleFederatedLearningBackend.ts` | `GET /api/fed/model, POST /api/fed/update, GET /api/fed/status` | database.json |
| 79 | Login Activity / Devices | ✅ | `src/components/LoginActivitySection.tsx` | `server.ts (core /api/auth/sessions)` | `—` | database.json |
| 80 | Recovery Verification | ✅ | `src/components/RecoveryVerifyModal.tsx` | `server.ts (core)` | `—` | database.json |
| 81 | Feed Explanation | ✅ | `src/components/FeedExplainer.tsx` | `src/turtleFeedExplainBackend.ts` | `POST /api/feed/explain, GET /api/feed/explain-history` | database.json |
| 82 | Profile Summary | ✅ | `src/components/ProfileSummary.tsx` | `src/turtleProfileSummaryBackend.ts` | `GET /api/users/:userId/summary, POST /api/users/:userId/summary/refresh` | database.json |
| 83 | Comment Summarizer | ✅ | `src/components/CommentSummary.tsx` | `src/turtleCommentSummaryBackend.ts` | `GET /api/posts/:postId/comment-summary, POST /api/posts/:postId/comment-summary/refresh` | database.json |
| 84 | AI Moderator | ✅ | `src/components/AIModerator.tsx` | `src/turtleAIModeratorBackend.ts` | `GET /api/moderation/rules, POST /api/moderation/rules, DELETE /api/moderation/rules/:id, POST /api/moderation/auto-review` | database.json |
| 85 | Fact-Checker | ✅ | `src/components/FactChecker.tsx` | `src/turtleFactCheckerBackend.ts` | `POST /api/factcheck/check, GET /api/factcheck/recent, GET /api/factcheck/:id, GET /api/factcheck/post/:postId` | database.json |
| 86 | AI Captions | ✅ | `(App.tsx / client-only)` | `src/turtleAICaptionEngine.ts` | `POST /api/ai/suggest-captions, POST /api/ai/caption` | database.json |
| 87 | Smart Community | ✅ | `src/components/SmartCommunity.tsx` | `src/turtleSmartCommunityBackend.ts` | `POST /api/community/smart/scan, GET /api/community/smart/report, POST /api/community/smart/flag, POST /api/community/smart/clear` | database.json |
| 88 | Digital Twin | ✅ | `src/components/DigitalLegacy.tsx` | `src/turtleDigitalTwinBackend.ts` | `GET /api/twin/status, POST /api/twin/train, POST /api/twin/enable, POST /api/twin/reply` | database.json |
| 89 | Debate Moderator | ✅ | `src/components/DebateModerator.tsx` | `src/turtleDebateModeratorBackend.ts` | `POST /api/debate/session, GET /api/debate/sessions, POST /api/debate/session/:id/comment, POST /api/debate/session/:id/balance` | database.json |
| 90 | Local Transcriber | ✅ | `src/components/LocalTranscriber.tsx` | `client-only (Web Speech API)` | `—` | localStorage / browser |
| 91 | Mock Interview | ✅ | `src/components/InterviewRoom.tsx` | `src/turtleInterviewBackend.ts` | `POST /api/interview/start, GET /api/interview/:id, POST /api/interview/:id/answer, GET /api/interview` | database.json |
| 92 | Marketplace Negotiator | ✅ | `src/components/Marketplace.tsx` | `src/turtleMarketNegotiatorBackend.ts` | `POST /api/market/items, GET /api/market/items, POST /api/market/negotiate, POST /api/market/offer` | database.json |
| 93 | Legal First-Aid | ✅ | `(App.tsx / client-only)` | `src/turtleLegalAidBackend.ts` | `POST /api/legal/ask, GET /api/legal/log` | database.json |
| 94 | AI Image Generation | ✅ | `(App.tsx / client-only)` | `server.ts (/api/ai/image)` | `—` | database.json |
| 95 | AI Vehicle Analysis | ✅ | `(App.tsx / client-only)` | `src/turtleAIVehicleAnalysisEngine.ts` | `POST /api/vehicle/analyze` | database.json |
| 96 | AI Summary (Away) | ✅ | `(App.tsx / client-only)` | `server.ts (/api/ai/summary)` | `—` | database.json |
| 97 | Red-Team Arena | ✅ | `src/components/RedTeamArena.tsx` | `src/turtleRedTeamBackend.ts` | `GET /api/redteam/challenges, POST /api/redteam/challenges, POST /api/redteam/submit, GET /api/redteam/submissions` | database.json |
| 98 | Contextual Personas | ✅ | `src/components/Personas.tsx` | `src/turtlePersonaBackend.ts` | `GET /api/personas, POST /api/personas, POST /api/personas/:id/activate, DELETE /api/personas/:id` | database.json |
| 99 | Daily Podcast | ⚠️ | `src/components/DailyPodcast.tsx` | `src/turtlePodcastBackend.ts` | `POST /api/podcast/generate, GET /api/podcast/today, GET /api/podcast/history` | database.json |
| 100 | Algo Panel | ✅ | `src/components/AlgoPanel.tsx` | `src/turtleAlgoPrefsBackend.ts` | `GET /api/algo/preferences, PUT /api/algo/preferences, GET /api/feed/personalized` | database.json |
| 101 | Audit Log | ✅ | `src/components/AuditLog.tsx` | `src/turtleAuditLogBackend.ts` | `POST /api/algo/audit/log, GET /api/algo/audit, GET /api/algo/audit/:postId` | database.json |
| 102 | Zero Doomscroll | ✅ | `src/components/ZeroDoomscroll.tsx` | `client-only` | `—` | localStorage / browser |
| 103 | Intentional Scroll | ✅ | `src/components/IntentionalScroll.tsx` | `client-only` | `—` | localStorage / browser |
| 104 | Focus Lock | ✅ | `src/components/FocusLock.tsx` | `client-only` | `—` | localStorage / browser |
| 105 | Uplift Feed | ✅ | `src/components/UpliftFeed.tsx` | `src/turtleUpliftFeedBackend.ts` | `GET /api/feed/uplift, GET /api/feed/mood` | database.json |
| 106 | Sensory-Safe Mode | ✅ | `src/components/SensorySafeMode.tsx` | `client-only (CSS)` | `—` | localStorage / browser |
| 107 | Take a Breath | ✅ | `src/components/TakeABreath.tsx` | `client-only` | `—` | localStorage / browser |
| 108 | Ghost View | ✅ | `(App.tsx / client-only)` | `src/turtleGhostViewBackend.ts` | `POST /api/posts/:id/ghost-view, GET /api/posts/:id/ghost-status, GET /api/posts/ghost/my` | database.json |
| 109 | Deep Dive Mode | ✅ | `src/components/DeepDive.tsx` | `src/turtleDeepDiveBackend.ts` | `GET /api/hubs, POST /api/hubs, POST /api/hubs/:id/attach, GET /api/hubs/:id` | database.json |
| 110 | Mood Feed | ✅ | `src/components/MoodFeed.tsx` | `src/turtleMoodFeedBackend.ts` | `GET /api/mood/feed, GET /api/mood/sentiment` | database.json |
| 111 | Memory Recaps | ✅ | `src/components/MemoryRecaps.tsx` | `src/turtleMemoriesBackend.ts` | `POST /api/memories/recap, GET /api/memories/recap, GET /api/memories/recaps, GET /api/memories/shared/:friendId` | database.json |
| 112 | Collab Posts | ✅ | `src/components/CollaborativeReels.tsx` | `src/turtleCollabPostsBackend.ts` | `POST /api/collab/create, POST /api/collab/:id/add-section, PATCH /api/collab/:id, POST /api/collab/:id/accept` | database.json |
| 113 | Story Chains | ✅ | `src/components/StoryChains.tsx` | `src/turtleStoryChainsBackend.ts` | `POST /api/chains, POST /api/chains/:id/add, GET /api/chains, GET /api/chains/:id` | database.json |
| 114 | Meaningful Streaks | ✅ | `src/components/Streaks.tsx` | `src/turtleStreaksBackend.ts` | `POST /api/streaks/checkin, GET /api/streaks, GET /api/streaks/leaderboard` | database.json |
| 115 | Achievements | ✅ | `src/components/Achievements.tsx` | `src/turtleAchievementsBackend.ts` | `POST /api/achievements/scan, GET /api/achievements, GET /api/achievements/all` | database.json |
| 116 | Reputation Score | ✅ | `src/components/Reputation.tsx` | `src/turtleReputationBackend.ts` | `POST /api/reputation/refresh, GET /api/reputation, GET /api/reputation/leaderboard, GET /api/reputation/:userId` | database.json |
| 117 | Silent Drop | ✅ | `src/components/SilentDrop.tsx` | `src/turtleSilentDropBackend.ts` | `POST /api/silentdrop, POST /api/silentdrop/:id/view, GET /api/silentdrop/active, POST /api/silentdrop/cleanup` | database.json |
| 118 | Stealth Recommend | ✅ | `src/components/StealthRec.tsx` | `src/turtleStealthRecBackend.ts` | `POST /api/stealthrec, GET /api/stealthrec/mine, GET /api/stealthrec/inbox, GET /api/stealthrec/boost/:postId` | database.json |
| 119 | Uplift Feed | ✅ | `src/components/UpliftFeed.tsx` | `src/turtleUpliftFeedBackend.ts` | `GET /api/feed/uplift, GET /api/feed/mood` | database.json |
| 120 | Skill Exchange | ✅ | `src/components/SkillExchange.tsx` | `src/turtleSkillExchangeBackend.ts` | `GET /api/skills, POST /api/skills, GET /api/skills/match, DELETE /api/skills/:id` | database.json |
| 121 | Ocean Pay | ✅ | `src/components/OceanPay.tsx` | `src/turtleOceanPayBackend.ts + src/turtleCoinTransfer.ts` | `GET /api/wallet/balance, POST /api/wallet/transfer, POST /api/wallet/pay, GET /api/wallet/transactions` | database.json |
| 122 | Smart Escrow | ✅ | `src/components/Escrow.tsx` | `src/turtleEscrowBackend.ts` | `POST /api/escrow, POST /api/escrow/:id/release, POST /api/escrow/:id/refund, GET /api/escrow` | database.json |
| 123 | P2P Renting | ✅ | `src/components/P2PRenting.tsx` | `src/turtleRentalBackend.ts` | `POST /api/rentals, GET /api/rentals, POST /api/rentals/:id/rent, POST /api/rentals/:id/return` | database.json |
| 124 | Barter Exchange | ✅ | `src/components/BarterExchange.tsx` | `src/turtleBarterBackend.ts` | `POST /api/barter, GET /api/barter, POST /api/barter/:id/interest, POST /api/barter/:id/match` | database.json |
| 125 | Gig Radar | ✅ | `src/components/GigRadar.tsx` | `src/turtleGigRadarBackend.ts` | `POST /api/gigs, GET /api/gigs, POST /api/gigs/:id/apply, POST /api/gigs/:id/fill` | database.json |
| 126 | Group Buying | ✅ | `src/components/GroupBuy.tsx` | `src/turtleGroupBuyBackend.ts` | `POST /api/groupbuy, GET /api/groupbuy, POST /api/groupbuy/:id/join, POST /api/groupbuy/:id/done` | database.json |
| 127 | Buy-Nothing Group | ✅ | `src/components/BuyNothing.tsx` | `src/turtleBuyNothingBackend.ts` | `POST /api/buynothing, GET /api/buynothing, POST /api/buynothing/:id/claim` | database.json |
| 128 | Garage Sale Map | ✅ | `src/components/GarageSaleMap.tsx` | `src/turtleGarageSaleBackend.ts` | `POST /api/garagesales, GET /api/garagesales` | database.json |
| 129 | Chit Fund | ✅ | `src/components/ChitFund.tsx` | `src/turtleChitFundBackend.ts` | `POST /api/chitfund, GET /api/chitfund, POST /api/chitfund/:id/join, POST /api/chitfund/:id/pay` | database.json |
| 130 | Saving Circle | ✅ | `src/components/SavingCircle.tsx` | `src/turtleSavingCircleBackend.ts` | `POST /api/savingcircle, GET /api/savingcircle, POST /api/savingcircle/:id/join, POST /api/savingcircle/:id/contribute` | database.json |
| 131 | Subscription Manager | ✅ | `src/components/MicroSubscriptions.tsx` | `src/turtleSharedSubsBackend.ts` | `POST /api/sharedsubs, GET /api/sharedsubs, POST /api/sharedsubs/:id/join, POST /api/sharedsubs/:id/pay` | database.json |
| 132 | Data Marketplace | ✅ | `src/components/Marketplace.tsx` | `src/turtleDataMarketBackend.ts` | `POST /api/datamarket/optin, GET /api/datamarket/optins, POST /api/datamarket, GET /api/datamarket` | database.json |
| 133 | Micro-Subscriptions | ✅ | `src/components/MicroSubscriptions.tsx` | `src/turtleSubscriptionsBackend.ts` | `GET /api/subscriptions/creators, GET /api/subscriptions, GET /api/subscriptions/mine, GET /api/subscriptions/status/:creatorId` | database.json |
| 134 | Marketplace | ✅ | `src/components/Marketplace.tsx` | `src/turtleMarketplaceBackend.ts` | `POST /api/marketplace/listings, GET /api/marketplace/listings, GET /api/marketplace/listings/:id, POST /api/marketplace/listings/:id/contact` | database.json |
| 135 | Assignment Help | ✅ | `src/components/AssignmentHelp.tsx` | `src/turtleAssignmentHelpBackend.ts` | `GET /api/assignment-help, POST /api/assignment-help, POST /api/assignment-help/:id/claim, POST /api/assignment-help/:id/complete` | database.json |
| 136 | Exam War Room | ✅ | `src/components/ExamWarRoom.tsx` | `src/turtleExamRoomBackend.ts` | `GET /api/exam-rooms, POST /api/exam-rooms, POST /api/exam-rooms/:id/join, POST /api/exam-rooms/:id/papers` | database.json |
| 137 | Farm Tool Pool | ✅ | `src/components/FarmToolPool.tsx` | `src/turtleFarmToolsBackend.ts` | `POST /api/agri/tools, GET /api/agri/tools, POST /api/agri/tools/:id/rent, POST /api/agri/tools/:id/return` | database.json |
| 138 | Mandi Price Predictor | ✅ | `src/components/MandiPrices.tsx` | `src/turtleMandiBackend.ts` | `POST /api/agri/mandi, GET /api/agri/mandi, GET /api/agri/predict-price` | database.json |
| 139 | Farmer Live | ✅ | `(App.tsx / client-only)` | `src/turtleFarmLiveBackend.ts` | `POST /api/agri/farm-streams, GET /api/agri/farm-streams, POST /api/agri/farm-streams/:id/join, POST /api/agri/farm-streams/:id/order` | database.json |
| 140 | Crop Scanner | ✅ | `(App.tsx / client-only)` | `src/turtleCropDiagnosisBackend.ts` | `GET /api/agri/diseases, POST /api/agri/diagnose-crop` | database.json |
| 141 | Irrigation Scheduler | ⚠️ | `src/components/IrrigationScheduler.tsx` | `src/turtleIrrigationBackend.ts` | `POST /api/agri/irrigation, GET /api/agri/irrigation, POST /api/agri/irrigation/:id/water, GET /api/agri/weather` | database.json |
| 142 | Carbon Ledger | ✅ | `src/components/CarbonLedger.tsx` | `src/turtleCarbonLedgerBackend.ts` | `POST /api/carbon/log, GET /api/carbon` | database.json |
| 143 | Afforestation | ⚠️ | `src/components/Afforestation.tsx` | `src/turtleAfforestationBackend.ts` | `POST /api/agri/plantings, GET /api/agri/plantings, POST /api/agri/plantings/:id/verify` | database.json |
| 144 | Plastic-to-Wealth | ⚠️ | `src/components/PlasticWealth.tsx` | `src/turtlePlasticWealthBackend.ts` | `POST /api/agri/plastic, GET /api/agri/plastic, POST /api/agri/plastic/:id/verify` | database.json |
| 145 | Freelancer Portfolio | ✅ | `src/components/Portfolio.tsx` | `src/turtlePortfolioBackend.ts` | `GET /api/portfolio, GET /api/portfolio/:userId, POST /api/portfolio, POST /api/portfolio/items` | database.json |
| 146 | Resume Builder | ✅ | `src/components/ResumeBuilder.tsx` | `src/turtleResumeBackend.ts` | `GET /api/profile/resume/:userId, POST /api/profile/resume` | database.json |
| 147 | Bio-Data Builder | ✅ | `src/components/BioDataBuilder.tsx` | `src/turtleBioDataBackend.ts` | `GET /api/profile/biodata/:userId, POST /api/profile/biodata` | database.json |
| 148 | Pair Coding | ✅ | `src/components/PairCoding.tsx` | `src/turtlePairCodingBackend.ts` | `POST /api/pair/rooms, GET /api/pair/rooms/:code, POST /api/pair/rooms/:code/buffer, POST /api/pair/rooms/:code/command` | database.json |
| 149 | Internship Board | ✅ | `src/components/InternshipBoard.tsx` | `src/turtleInternshipBackend.ts` | `GET /api/internships, POST /api/internships, POST /api/internships/:id/apply, POST /api/internships/:id/applications/:appId/respond` | database.json |
| 150 | Govt Job Alerts | 🧪 | `src/components/JobAlerts.tsx` | `src/turtleJobAlertBackend.ts` | `GET /api/jobs/alerts, POST /api/jobs/alerts, POST /api/jobs/alerts/:id/save, GET /api/jobs/alerts/saved` | database.json |
| 151 | Tutor Matchmaking | 🧪 | `src/components/TutorMatch.tsx` | `src/turtleTutorBackend.ts` | `GET /api/tutor, POST /api/tutor, POST /api/tutor/:id/offer, GET /api/tutor/mine` | database.json |
| 152 | Scholarship Tracker | 🧪 | `src/components/ScholarshipTracker.tsx` | `src/turtleScholarshipBackend.ts` | `GET /api/scholarships, POST /api/scholarships, POST /api/scholarships/:id/save, GET /api/scholarships/saved` | database.json |
| 153 | Study Rooms | ✅ | `src/components/StudyRooms.tsx` | `src/turtleStudyRoomsBackend.ts` | `GET /api/rooms, POST /api/rooms, GET /api/rooms/:id, POST /api/rooms/:id/join` | database.json |
| 154 | Alumni Network | ✅ | `src/components/AlumniNetwork.tsx` | `src/turtleAlumniBackend.ts` | `GET /api/alumni, POST /api/alumni, GET /api/alumni/:institution` | database.json |
| 155 | Pro Graph | ✅ | `src/components/ProGraph.tsx` | `src/turtleProGraphBackend.ts` | `POST /api/prograph/skills, GET /api/prograph/profile/:userId, POST /api/prograph/skills/:id/endorse, GET /api/prograph/skills/:id/quiz` | database.json |
| 156 | Exam War Room | ✅ | `src/components/ExamWarRoom.tsx` | `src/turtleExamRoomBackend.ts` | `GET /api/exam-rooms, POST /api/exam-rooms, POST /api/exam-rooms/:id/join, POST /api/exam-rooms/:id/papers` | database.json |
| 157 | Family Circle | ✅ | `src/components/FamilyCircle.tsx` | `src/turtleFamilyCircleBackend.ts` | `GET /api/family, POST /api/family, POST /api/family/:id/join, POST /api/family/:id/approve` | database.json |
| 158 | Elder Mode | ✅ | `src/components/ElderMode.tsx` | `src/turtleElderModeBackend.ts` | `GET /api/prefs/elder-mode, POST /api/prefs/elder-mode` | database.json |
| 159 | Trusted Guardian | ✅ | `src/components/GuardianApproval.tsx` | `src/turtleGuardianBackend.ts` | `GET /api/guardian, POST /api/guardian/request, POST /api/guardian/:id/respond, POST /api/guardian/:id/remove` | database.json |
| 160 | Period Tracker | ✅ | `src/components/PeriodTracker.tsx` | `client-only (AES-GCM localStorage)` | `—` | localStorage / browser |
| 161 | Evidence Vault | ✅ | `src/components/EvidenceVault.tsx` | `src/turtleEvidenceVaultBackend.ts` | `POST /api/evidence/entries, POST /api/vault/evidence, GET /api/evidence/entries, GET /api/evidence/entries/:id` | database.json |
| 162 | Pro-Bono Lawyer Match | ✅ | `src/components/LawyerMatch.tsx` | `src/turtleLawyerBackend.ts` | `GET /api/lawyers, POST /api/lawyers, GET /api/cases, POST /api/cases` | database.json |
| 163 | Contract Builder | ✅ | `src/components/ContractBuilder.tsx` | `src/turtleContractBackend.ts` | `GET /api/contracts/templates, GET /api/contracts, POST /api/contracts, POST /api/contracts/:id/sign` | database.json |
| 164 | RTI Auto-Filer | 🧪 | `(App.tsx / client-only)` | `src/turtleRTIBackend.ts` | `GET /api/rti, POST /api/rti, POST /api/rti/:id/respond` | database.json |
| 165 | Digital FIR / GD | 🧪 | `src/components/DigitalFIR.tsx` | `src/turtleFIRBackend.ts` | `GET /api/fir, POST /api/fir, POST /api/fir/:id/status` | database.json |
| 166 | Digital Legacy | ✅ | `src/components/DigitalLegacy.tsx` | `src/turtleDigitalLegacyBackend.ts` | `GET /api/account/legacy, POST /api/account/legacy, GET /api/account/legacy/requests, POST /api/account/legacy/contact/verify` | database.json |
| 167 | Chaperone Mode | ✅ | `src/components/ChaperoneMode.tsx` | `src/turtleChaperoneBackend.ts` | `GET /api/chaperone/:conversationId, POST /api/chaperone/:conversationId, DELETE /api/chaperone/:conversationId/:observerId` | database.json |
| 168 | Content Gate | ✅ | `src/components/ContentGate.tsx` | `src/turtleContentGateBackend.ts` | `POST /api/content-rating/:postId, GET /api/content-rating/:postId, GET /api/content-rating/gate/:postId` | database.json |
| 169 | Ward Budget | ✅ | `src/components/WardCivic.tsx` | `src/turtleWardBackend.ts` | `GET /api/ward/projects, POST /api/ward/projects, POST /api/ward/projects/:id/vote, GET /api/ward/meetings` | database.json |
| 170 | Ward Sabha | ✅ | `src/components/WardCivic.tsx` | `src/turtleWardBackend.ts` | `GET /api/ward/projects, POST /api/ward/projects, POST /api/ward/projects/:id/vote, GET /api/ward/meetings` | database.json |
| 171 | Civic Escalation | ✅ | `src/components/CivicEscalation.tsx` | `src/turtleCivicBackend.ts` | `GET /api/civic/issues, POST /api/civic/issues, POST /api/civic/issues/:id/upvote, GET /api/tenders` | database.json |
| 172 | Tender Tracker | ✅ | `src/components/TenderTracker.tsx` | `src/turtleCivicBackend.ts` | `GET /api/civic/issues, POST /api/civic/issues, POST /api/civic/issues/:id/upvote, GET /api/tenders` | database.json |
| 173 | Land Trust | ✅ | `src/components/LandTrust.tsx` | `src/turtleCivicBackend.ts` | `GET /api/civic/issues, POST /api/civic/issues, POST /api/civic/issues/:id/upvote, GET /api/tenders` | database.json |
| 174 | Compatibility Matrix | ✅ | `src/components/CompatibilityMatrix.tsx` | `src/turtleCompatibilityBackend.ts` | `POST /api/match/compatibility` | database.json |
| 175 | Halal Timeline | ✅ | `src/components/HalalTimeline.tsx` | `src/turtleHalalDatingBackend.ts` | `GET /api/halal, POST /api/halal/start, POST /api/halal/:id/advance, POST /api/halal/:id/confirm` | database.json |
| 176 | Community Matchmaker | ✅ | `src/components/SmartCommunity.tsx` | `src/turtleMatchmakerBackend.ts` | `GET /api/matchmaker, POST /api/matchmaker, POST /api/matchmaker/:id/respond, GET /api/match/suggest` | database.json |
| 177 | Azan Auto-Mute | ✅ | `src/components/AzanAutoMute.tsx` | `src/turtleAzanBackend.ts` | `GET /api/azan/times, GET /api/azan/prefs, POST /api/azan/prefs` | database.json |
| 178 | Zakat Calculator | ✅ | `src/components/ZakatCalculator.tsx` | `src/turtleZakatBackend.ts` | `POST /api/zakat/calculate` | database.json |
| 179 | Venue Status | ✅ | `src/components/VenueStatus.tsx` | `src/turtleVenueBackend.ts` | `GET /api/venues, POST /api/venues` | database.json |
| 180 | Quran Circles | ⚠️ | `src/components/QuranCircle.tsx` | `src/turtleQuranCircleBackend.ts` | `GET /api/quran-circles, POST /api/quran-circles, POST /api/quran-circles/:id/join, POST /api/quran-circles/:id/note` | database.json |
| 181 | Religious Events | ✅ | `src/components/ReligiousEvents.tsx` | `src/turtleReligiousEventsBackend.ts` | `GET /api/events, POST /api/events, POST /api/events/:id/rsvp, POST /api/events/:id/update` | database.json |
| 182 | Travel Buddy | ✅ | `src/components/TravelBuddy.tsx` | `src/turtleTravelBackend.ts` | `GET /api/travel/plans, POST /api/travel/plans, POST /api/travel/plans/:id/join, GET /api/travel/plans/mine` | database.json |
| 183 | Hidden Gems | ✅ | `src/components/HiddenGems.tsx` | `src/turtleTravelBackend.ts` | `GET /api/travel/plans, POST /api/travel/plans, POST /api/travel/plans/:id/join, GET /api/travel/plans/mine` | database.json |
| 184 | Group Trip | ✅ | `src/components/GroupTrip.tsx` | `src/turtleTravelBackend.ts` | `GET /api/travel/plans, POST /api/travel/plans, POST /api/travel/plans/:id/join, GET /api/travel/plans/mine` | database.json |
| 185 | Carpool Lane | ✅ | `src/components/Carpool.tsx` | `src/turtleCarpoolBackend.ts` | `GET /api/carpool, POST /api/carpool, POST /api/carpool/:id/join` | database.json |
| 186 | Bike Pool | ✅ | `src/components/Carpool.tsx` | `src/turtleCarpoolBackend.ts` | `GET /api/carpool, POST /api/carpool, POST /api/carpool/:id/join` | database.json |
| 187 | CNG Fare Radar | ✅ | `src/components/CNGFare.tsx` | `src/turtleCNGFareBackend.ts` | `POST /api/cng/fare, GET /api/cng/reports, POST /api/cng/reports` | database.json |
| 188 | Parking Share | ✅ | `src/components/ParkingShare.tsx` | `src/turtleParkingBackend.ts` | `GET /api/parking, POST /api/parking, POST /api/parking/:id/book, GET /api/traffic` | database.json |
| 189 | Traffic Witness | ✅ | `src/components/TrafficWitness.tsx` | `src/turtleParkingBackend.ts` | `GET /api/parking, POST /api/parking, POST /api/parking/:id/book, GET /api/traffic` | database.json |
| 190 | Fediverse Bridge | ⚠️ | `src/components/FediverseBridge.tsx` | `src/turtleFediverseBackend.ts` | `GET /.well-known/webfinger, GET /api/fediverse/actor/:username, GET /api/fediverse/outbox, POST /api/fediverse/outbox` | database.json |
| 191 | Privacy-Preserving KYC | ✅ | `src/components/PrivacyDashboard.tsx` | `(core server.ts / client-only)` | `—` | localStorage / browser |
| 192 | Hardware Wallet | ⚠️ | `src/components/HardwareWallet.tsx` | `src/turtleHardwareWalletBackend.ts` | `GET /api/hardware-wallet, POST /api/hardware-wallet, DELETE /api/hardware-wallet/:id` | database.json |
| 193 | Satellite Fallback | ⚠️ | `src/components/SatelliteFallback.tsx` | `src/turtleSatelliteBackend.ts` | `POST /api/sat/relay, GET /api/sat/relays` | database.json |
| 194 | Quantum Crypto | ⚠️ | `src/components/QuantumCrypto.tsx` | `(core server.ts / client-only)` | `—` | localStorage / browser |
| 195 | Mini Apps Platform | ✅ | `src/components/MiniAppStore.tsx` | `src/turtleMiniAppsBackend.ts` | `GET /api/miniapps, POST /api/miniapps, GET /api/miniapps/mine, GET /api/miniapps/:id` | database.json |
| 196 | Communities Pro | ✅ | `src/components/SmartCommunity.tsx` | `src/turtleCommunitiesProBackend.ts` | `GET /api/communities/:id/voice, POST /api/communities/:id/voice, POST /api/communities/:id/voice/:vid/join, GET /api/livekit/token` | database.json |
| 197 | Ocean OS Layer | ✅ | `src/components/OSLayer.tsx` | `src/turtleOSLayerBackend.ts` | `POST /api/os/experiments, GET /api/os/experiments, POST /api/os/experiments/:id/assign, GET /api/os/my-assignments` | database.json |
| 198 | Data + AI Brain | ✅ | `(App.tsx / client-only)` | `src/turtleDataBrainBackend.ts` | `POST /api/data/brain/events, GET /api/data/brain/events, GET /api/data/brain/stats, DELETE /api/data/brain/events` | database.json |
| 199 | Snap Map | ✅ | `src/components/SnapMap.tsx` | `src/turtleSnapMapBackend.ts` | `POST /api/map/me/location, GET /api/map/me/location, GET /api/map/stories, GET /api/map/heat` | database.json |
| 200 | Offline Drafts | ✅ | `src/components/OfflineDrafts.tsx` | `client-side (localStorage/SW)` | `—` | localStorage / browser |
