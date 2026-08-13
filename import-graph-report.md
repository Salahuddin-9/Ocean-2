# Import-Graph Analysis — Ocean-V1 - Copy

Client reachable (src/main.tsx): 216
Server reachable (server.ts): 163
Chat reachable (chatServer.ts): 2
Socket reachable (socketServer.ts): 3
Total source files: 540

| File | Imported-by count | Imported by | Client-reach | Server-reach | Chat-reach | Socket-reach | Any-reach |
|---|---|---|---|---|---|---|---|
| .env.example | 0 |  | N | N | N | N | N |
| 01-architecture.md | 0 |  | N | N | N | N | N |
| 02-ranking-1.md | 0 |  | N | N | N | N | N |
| 02-ranking.md | 0 |  | N | N | N | N | N |
| apiManager.ts | 2 | BUG_ANALYSIS_REPORT.md, socketServer.ts | N | N | N | Y | Y |
| App-1.tsx | 0 |  | N | N | N | N | N |
| App-2.tsx | 0 |  | N | N | N | N | N |
| App-3.tsx | 0 |  | N | N | N | N | N |
| app-shell.tsx | 0 |  | N | N | N | N | N |
| App.tsx | 0 |  | N | N | N | N | N |
| AppContext.tsx | 0 |  | N | N | N | N | N |
| auth.ts | 0 |  | N | N | N | N | N |
| AwaySummary.jsx | 0 |  | N | N | N | N | N |
| BUG_ANALYSIS_REPORT.md | 0 |  | N | N | N | N | N |
| ChatModal.tsx | 0 |  | N | N | N | N | N |
| ChatRoom.tsx | 0 |  | N | N | N | N | N |
| chatServer.ts | 2 | server-1.ts, server.ts | N | Y | Y | N | Y |
| ChatView.tsx | 0 |  | N | N | N | N | N |
| classify_nsfw_py3.py | 0 |  | N | N | N | N | N |
| CLAUDE.md | 0 |  | N | N | N | N | N |
| CommentSection.jsx | 1 | PostCard.jsx | N | N | N | N | N |
| CommentsModal-1.tsx | 0 |  | N | N | N | N | N |
| CommentsModal-2.tsx | 0 |  | N | N | N | N | N |
| CommentsModal.tsx | 0 |  | N | N | N | N | N |
| community.json | 0 |  | N | N | N | N | N |
| database.json | 0 |  | N | N | N | N | N |
| docs/cleanup-test-data.mjs | 0 |  | N | N | N | N | N |
| docs/IMPLEMENTATION_PLAYBOOK.md | 0 |  | N | N | N | N | N |
| docs/specs/01-architecture.md | 0 |  | N | N | N | N | N |
| docs/specs/02-ranking.md | 0 |  | N | N | N | N | N |
| docs/specs/03-platform.md | 0 |  | N | N | N | N | N |
| docs/specs/04-meta-tiktok-production-gap-analysis.md | 0 |  | N | N | N | N | N |
| docs/test-callflow.mjs | 0 |  | N | N | N | N | N |
| docs/test-pairing.mjs | 0 |  | N | N | N | N | N |
| firebase-applet-config.json | 6 | src/App.tsx, test-firestore.cjs, test-firestore.js, test-firestore2.cjs, test-firestore3.cjs… | Y | N | N | N | Y |
| firebase-blueprint.json | 0 |  | N | N | N | N | N |
| firebase.json | 0 |  | N | N | N | N | N |
| firestore.rules | 0 |  | N | N | N | N | N |
| fix_app.py | 0 |  | N | N | N | N | N |
| fix_media_dive.py | 0 |  | N | N | N | N | N |
| fix_reels_idx.py | 0 |  | N | N | N | N | N |
| fix_server.py | 0 |  | N | N | N | N | N |
| fix-ui.cjs | 0 |  | N | N | N | N | N |
| IdentityCard.tsx | 0 |  | N | N | N | N | N |
| immersive_reels_block.tsx | 0 |  | N | N | N | N | N |
| import-graph-report.md | 0 |  | N | N | N | N | N |
| index.html | 0 |  | N | N | N | N | N |
| matchmaking.ts | 1 | socketServer.ts | N | N | N | Y | Y |
| mathkit-1.ts | 0 |  | N | N | N | N | N |
| mathkit.ts | 0 |  | N | N | N | N | N |
| MediaView.jsx | 1 | PostCard.jsx | N | N | N | N | N |
| metadata.json | 0 |  | N | N | N | N | N |
| move_reels.py | 0 |  | N | N | N | N | N |
| noise-debug.ts | 0 |  | N | N | N | N | N |
| noise-debug2.ts | 0 |  | N | N | N | N | N |
| noise-debug3.ts | 0 |  | N | N | N | N | N |
| noise-smoke.ts | 0 |  | N | N | N | N | N |
| noise-vector.ts | 0 |  | N | N | N | N | N |
| package-1.json | 0 |  | N | N | N | N | N |
| package-lock.json | 0 |  | N | N | N | N | N |
| package.json | 0 |  | N | N | N | N | N |
| patch_app.py | 0 |  | N | N | N | N | N |
| patch_publish.py | 0 |  | N | N | N | N | N |
| patch_server.py | 0 |  | N | N | N | N | N |
| PostCard.jsx | 0 |  | N | N | N | N | N |
| PostComposer.jsx | 0 |  | N | N | N | N | N |
| PostsSection.tsx | 0 |  | N | N | N | N | N |
| public/ffmpeg/ffmpeg-core.js | 0 |  | N | N | N | N | N |
| public/models/mobilenet_v2/group1-shard1of1 | 0 |  | N | N | N | N | N |
| public/models/mobilenet_v2/model.json | 0 |  | N | N | N | N | N |
| ReactionBar.jsx | 1 | PostCard.jsx | N | N | N | N | N |
| README.md | 0 |  | N | N | N | N | N |
| ReelCard.jsx | 0 |  | N | N | N | N | N |
| ReelComposer.jsx | 0 |  | N | N | N | N | N |
| SafeImage.tsx | 3 | ChatModal.tsx, CommentsModal-2.tsx, PostsSection.tsx | N | N | N | N | N |
| schema.ts | 0 |  | N | N | N | N | N |
| scripts/capture-whiteboard.cjs | 0 |  | N | N | N | N | N |
| scripts/import-graph.cjs | 0 |  | N | N | N | N | N |
| scripts/smoke-editors.cjs | 0 |  | N | N | N | N | N |
| security_spec.md | 0 |  | N | N | N | N | N |
| server-1.ts | 0 |  | N | N | N | N | N |
| server.ts | 0 |  | N | Y | N | N | Y |
| sessions.json | 0 |  | N | N | N | N | N |
| socketServer.ts | 0 |  | N | N | N | Y | Y |
| src/App.tsx | 4 | src/components/CommentsModal.tsx, src/components/NeedPostPortal.tsx, src/components/PostsSection.tsx, src/main.tsx | Y | N | N | N | Y |
| src/audioService.ts | 2 | src/App.tsx, src/calling/useCallEngine.tsx | Y | N | N | N | Y |
| src/bitchat/crypto.ts | 8 | noise-debug.ts, noise-debug2.ts, noise-debug3.ts, noise-smoke.ts, noise-vector.ts… | N | N | N | N | N |
| src/bitchat/identity.ts | 0 |  | N | N | N | N | N |
| src/bitchat/noise.ts | 5 | noise-debug.ts, noise-debug2.ts, noise-debug3.ts, noise-smoke.ts, noise-vector.ts | N | N | N | N | N |
| src/calling/ActiveCallScreen.tsx | 1 | src/calling/useCallEngine.tsx | Y | N | N | N | Y |
| src/calling/callEngine.ts | 1 | src/calling/useCallEngine.tsx | Y | N | N | N | Y |
| src/calling/IncomingCallPopup.tsx | 1 | src/calling/useCallEngine.tsx | Y | N | N | N | Y |
| src/calling/media.ts | 3 | src/calling/ActiveCallScreen.tsx, src/calling/callEngine.ts, src/calling/useCallEngine.tsx | Y | N | N | N | Y |
| src/calling/ringSocket.ts | 2 | src/calling/callEngine.ts, src/calling/useCallEngine.tsx | Y | N | N | N | Y |
| src/calling/types.ts | 5 | src/calling/ActiveCallScreen.tsx, src/calling/IncomingCallPopup.tsx, src/calling/callEngine.ts, src/calling/ringSocket.ts, src/calling/useCallEngine.tsx | Y | N | N | N | Y |
| src/calling/useCallEngine.tsx | 4 | src/App.tsx, src/components/OmegleRandomVideoCall.tsx, src/components/call/P2PCallLayer.tsx, src/components/call/StreamCallLayer.tsx | Y | N | N | N | Y |
| src/components/Achievements.tsx | 1 | src/components/NewFeaturesHub.tsx | Y | N | N | N | Y |
| src/components/AdminPanel.tsx | 1 | src/App.tsx | Y | N | N | N | Y |
| src/components/Afforestation.tsx | 1 | src/components/NewFeaturesHub.tsx | Y | N | N | N | Y |
| src/components/AIModerator.tsx | 1 | src/components/NewFeaturesHub.tsx | Y | N | N | N | Y |
| src/components/AlgoPanel.tsx | 1 | src/components/NewFeaturesHub.tsx | Y | N | N | N | Y |
| src/components/AlumniNetwork.tsx | 1 | src/components/NewFeaturesHub.tsx | Y | N | N | N | Y |
| src/components/AnonymousMode.tsx | 1 | src/components/NewFeaturesHub.tsx | Y | N | N | N | Y |
| src/components/ArchitectureDiagram.tsx | 1 | src/App.tsx | Y | N | N | N | Y |
| src/components/AssignmentHelp.tsx | 1 | src/components/NewFeaturesHub.tsx | Y | N | N | N | Y |
| src/components/AuditLog.tsx | 1 | src/components/NewFeaturesHub.tsx | Y | N | N | N | Y |
| src/components/AwaySummaryCard.tsx | 1 | src/App.tsx | Y | N | N | N | Y |
| src/components/AzanAutoMute.tsx | 1 | src/components/NewFeaturesHub.tsx | Y | N | N | N | Y |
| src/components/BarterExchange.tsx | 1 | src/components/NewFeaturesHub.tsx | Y | N | N | N | Y |
| src/components/BioDataBuilder.tsx | 1 | src/components/NewFeaturesHub.tsx | Y | N | N | N | Y |
| src/components/BloodDonorRegistry.tsx | 1 | src/components/NewFeaturesHub.tsx | Y | N | N | N | Y |
| src/components/BotBounty.tsx | 1 | src/components/NewFeaturesHub.tsx | Y | N | N | N | Y |
| src/components/BuyNothing.tsx | 1 | src/components/NewFeaturesHub.tsx | Y | N | N | N | Y |
| src/components/call/ActiveCallScreen.tsx | 1 | src/components/call/StreamCallLayer.tsx | Y | N | N | N | Y |
| src/components/call/ActiveP2PCallScreen.tsx | 0 |  | N | N | N | N | N |
| src/components/call/CallWhiteboard.tsx | 3 | src/components/NewFeaturesHub.tsx, src/components/call/ActiveCallScreen.tsx, src/components/call/ActiveP2PCallScreen.tsx | Y | N | N | N | Y |
| src/components/call/IncomingCallPopup.tsx | 1 | src/components/call/StreamCallLayer.tsx | Y | N | N | N | Y |
| src/components/call/JitsiMeeting.tsx | 1 | src/components/ChatModal.tsx | Y | N | N | N | Y |
| src/components/call/P2PCallLayer.tsx | 0 |  | N | N | N | N | N |
| src/components/call/StreamCallLayer.tsx | 1 | src/components/ChatModal.tsx | Y | N | N | N | Y |
| src/components/call/StreamProvider.tsx | 1 | src/components/call/StreamCallLayer.tsx | Y | N | N | N | Y |
| src/components/CarbonLedger.tsx | 1 | src/components/NewFeaturesHub.tsx | Y | N | N | N | Y |
| src/components/Carpool.tsx | 1 | src/components/NewFeaturesHub.tsx | Y | N | N | N | Y |
| src/components/ChaperoneMode.tsx | 1 | src/components/NewFeaturesHub.tsx | Y | N | N | N | Y |
| src/components/ChatModal.tsx | 1 | src/App.tsx | Y | N | N | N | Y |
| src/components/ChitFund.tsx | 1 | src/components/NewFeaturesHub.tsx | Y | N | N | N | Y |
| src/components/CivicEscalation.tsx | 1 | src/components/NewFeaturesHub.tsx | Y | N | N | N | Y |
| src/components/CNGFare.tsx | 1 | src/components/NewFeaturesHub.tsx | Y | N | N | N | Y |
| src/components/CollaborativeReels.tsx | 1 | src/components/NewFeaturesHub.tsx | Y | N | N | N | Y |
| src/components/CollabPosts.tsx | 1 | src/components/NewFeaturesHub.tsx | Y | N | N | N | Y |
| src/components/CommentsModal.tsx | 1 | src/App.tsx | Y | N | N | N | Y |
| src/components/CommentSummary.tsx | 1 | src/components/NewFeaturesHub.tsx | Y | N | N | N | Y |
| src/components/CommunityKitchens.tsx | 1 | src/components/NewFeaturesHub.tsx | Y | N | N | N | Y |
| src/components/CommunityMatchmaker.tsx | 1 | src/components/NewFeaturesHub.tsx | Y | N | N | N | Y |
| src/components/CommunitySection.tsx | 1 | src/App.tsx | Y | N | N | N | Y |
| src/components/CompatibilityMatrix.tsx | 1 | src/components/NewFeaturesHub.tsx | Y | N | N | N | Y |
| src/components/ContentGate.tsx | 1 | src/components/NewFeaturesHub.tsx | Y | N | N | N | Y |
| src/components/ContractBuilder.tsx | 1 | src/components/NewFeaturesHub.tsx | Y | N | N | N | Y |
| src/components/CoStreaming.tsx | 1 | src/components/NewFeaturesHub.tsx | Y | N | N | N | Y |
| src/components/CreatorStudioView.tsx | 1 | src/App.tsx | Y | N | N | N | Y |
| src/components/CropDiagnosis.tsx | 1 | src/components/NewFeaturesHub.tsx | Y | N | N | N | Y |
| src/components/DailyPodcast.tsx | 1 | src/components/NewFeaturesHub.tsx | Y | N | N | N | Y |
| src/components/DataMarketplace.tsx | 1 | src/components/NewFeaturesHub.tsx | Y | N | N | N | Y |
| src/components/DataSovereigntyView.tsx | 1 | src/components/NewFeaturesHub.tsx | Y | N | N | N | Y |
| src/components/DebateModerator.tsx | 1 | src/components/NewFeaturesHub.tsx | Y | N | N | N | Y |
| src/components/DecentralizedProfiles.tsx | 1 | src/components/NewFeaturesHub.tsx | Y | N | N | N | Y |
| src/components/DeepDive.tsx | 1 | src/components/NewFeaturesHub.tsx | Y | N | N | N | Y |
| src/components/DigitalFIR.tsx | 1 | src/components/NewFeaturesHub.tsx | Y | N | N | N | Y |
| src/components/DigitalTwin.tsx | 1 | src/components/NewFeaturesHub.tsx | Y | N | N | N | Y |
| src/components/E2EEMessenger.tsx | 1 | src/components/NewFeaturesHub.tsx | Y | N | N | N | Y |
| src/components/editors/OceanCanvasDesign.tsx | 1 | src/App.tsx | Y | N | N | N | Y |
| src/components/editors/OceanCutVideo.tsx | 1 | src/App.tsx | Y | N | N | N | Y |
| src/components/editors/OceanWhiteboard.tsx | 1 | src/App.tsx | Y | N | N | N | Y |
| src/components/editors/PhotoEditorModal.tsx | 2 | src/App.tsx, src/components/IdentityCard.tsx | Y | N | N | N | Y |
| src/components/editors/StoryEditor.tsx | 1 | src/App.tsx | Y | N | N | N | Y |
| src/components/ElderMode.tsx | 1 | src/components/NewFeaturesHub.tsx | Y | N | N | N | Y |
| src/components/EmergencyView.tsx | 1 | src/App.tsx | Y | N | N | N | Y |
| src/components/EncryptedTimeCapsuleModal.tsx | 1 | src/App.tsx | Y | N | N | N | Y |
| src/components/ErrorBoundary.tsx | 1 | src/main.tsx | Y | N | N | N | Y |
| src/components/Escrow.tsx | 1 | src/components/NewFeaturesHub.tsx | Y | N | N | N | Y |
| src/components/EvacuationRoutes.tsx | 1 | src/components/NewFeaturesHub.tsx | Y | N | N | N | Y |
| src/components/EvidenceVault.tsx | 1 | src/components/NewFeaturesHub.tsx | Y | N | N | N | Y |
| src/components/ExamWarRoom.tsx | 1 | src/components/NewFeaturesHub.tsx | Y | N | N | N | Y |
| src/components/FacelessVideoGenerator.tsx | 1 | src/components/NewFeaturesHub.tsx | Y | N | N | N | Y |
| src/components/FactChecker.tsx | 1 | src/components/NewFeaturesHub.tsx | Y | N | N | N | Y |
| src/components/FamilyCircle.tsx | 1 | src/components/NewFeaturesHub.tsx | Y | N | N | N | Y |
| src/components/FarmLive.tsx | 1 | src/components/NewFeaturesHub.tsx | Y | N | N | N | Y |
| src/components/FarmToolPool.tsx | 1 | src/components/NewFeaturesHub.tsx | Y | N | N | N | Y |
| src/components/FederatedLearning.tsx | 1 | src/components/NewFeaturesHub.tsx | Y | N | N | N | Y |
| src/components/FediverseBridge.tsx | 1 | src/components/NewFeaturesHub.tsx | Y | N | N | N | Y |
| src/components/FeedExplainer.tsx | 1 | src/components/NewFeaturesHub.tsx | Y | N | N | N | Y |
| src/components/FloodDepthMapperView.tsx | 1 | src/components/NewFeaturesHub.tsx | Y | N | N | N | Y |
| src/components/FocusLock.tsx | 1 | src/components/NewFeaturesHub.tsx | Y | N | N | N | Y |
| src/components/GarageSaleMap.tsx | 1 | src/components/NewFeaturesHub.tsx | Y | N | N | N | Y |
| src/components/GeohashDiscovery.tsx | 1 | src/App.tsx | Y | N | N | N | Y |
| src/components/GhostMode.tsx | 1 | src/components/NewFeaturesHub.tsx | Y | N | N | N | Y |
| src/components/GigRadar.tsx | 1 | src/components/NewFeaturesHub.tsx | Y | N | N | N | Y |
| src/components/GroupBuy.tsx | 1 | src/components/NewFeaturesHub.tsx | Y | N | N | N | Y |
| src/components/GroupTrip.tsx | 1 | src/components/NewFeaturesHub.tsx | Y | N | N | N | Y |
| src/components/GuardianApproval.tsx | 1 | src/components/NewFeaturesHub.tsx | Y | N | N | N | Y |
| src/components/HalalTimeline.tsx | 1 | src/components/NewFeaturesHub.tsx | Y | N | N | N | Y |
| src/components/HardwareWallet.tsx | 1 | src/components/NewFeaturesHub.tsx | Y | N | N | N | Y |
| src/components/HashtagTrendSection.tsx | 1 | src/App.tsx | Y | N | N | N | Y |
| src/components/HiddenGems.tsx | 1 | src/components/NewFeaturesHub.tsx | Y | N | N | N | Y |
| src/components/HumanityScore.tsx | 1 | src/components/NewFeaturesHub.tsx | Y | N | N | N | Y |
| src/components/IdentityCard.tsx | 1 | src/App.tsx | Y | N | N | N | Y |
| src/components/IntentionalScroll.tsx | 1 | src/components/NewFeaturesHub.tsx | Y | N | N | N | Y |
| src/components/InteractiveDemo.tsx | 1 | src/App.tsx | Y | N | N | N | Y |
| src/components/InternshipBoard.tsx | 1 | src/components/NewFeaturesHub.tsx | Y | N | N | N | Y |
| src/components/InterviewRoom.tsx | 1 | src/components/NewFeaturesHub.tsx | Y | N | N | N | Y |
| src/components/IrrigationScheduler.tsx | 1 | src/components/NewFeaturesHub.tsx | Y | N | N | N | Y |
| src/components/JobAlerts.tsx | 1 | src/components/NewFeaturesHub.tsx | Y | N | N | N | Y |
| src/components/LandTrust.tsx | 1 | src/components/NewFeaturesHub.tsx | Y | N | N | N | Y |
| src/components/LawyerMatch.tsx | 1 | src/components/NewFeaturesHub.tsx | Y | N | N | N | Y |
| src/components/LegalAid.tsx | 1 | src/components/NewFeaturesHub.tsx | Y | N | N | N | Y |
| src/components/LinkPreviewCard.tsx | 1 | src/components/ChatModal.tsx | Y | N | N | N | Y |
| src/components/LocalTranscriber.tsx | 1 | src/components/NewFeaturesHub.tsx | Y | N | N | N | Y |
| src/components/LoginActivitySection.tsx | 1 | src/App.tsx | Y | N | N | N | Y |
| src/components/MandiPrices.tsx | 1 | src/components/NewFeaturesHub.tsx | Y | N | N | N | Y |
| src/components/MarketNegotiator.tsx | 1 | src/components/NewFeaturesHub.tsx | Y | N | N | N | Y |
| src/components/MeetView.tsx | 1 | src/App.tsx | Y | N | N | N | Y |
| src/components/MemoryRecaps.tsx | 1 | src/components/NewFeaturesHub.tsx | Y | N | N | N | Y |
| src/components/MicroSubscriptions.tsx | 1 | src/components/NewFeaturesHub.tsx | Y | N | N | N | Y |
| src/components/MissingPersonView.tsx | 1 | src/components/NewFeaturesHub.tsx | Y | N | N | N | Y |
| src/components/MoodFeed.tsx | 1 | src/components/NewFeaturesHub.tsx | Y | N | N | N | Y |
| src/components/NeedPostPortal.tsx | 2 | src/App.tsx, src/components/PostsSection.tsx | Y | N | N | N | Y |
| src/components/NewFeaturesHub.tsx | 1 | src/App.tsx | Y | N | N | N | Y |
| src/components/NSFWMediaGuard.tsx | 4 | src/App.tsx, src/components/CommentsModal.tsx, src/components/NeedPostPortal.tsx, src/components/PostsSection.tsx | Y | N | N | N | Y |
| src/components/NSFWStrictnessSettings.tsx | 1 | src/App.tsx | Y | N | N | N | Y |
| src/components/OfflineChatView.tsx | 2 | src/components/NewFeaturesHub.tsx, src/components/OfflineMeshFab.tsx | Y | N | N | N | Y |
| src/components/OfflineMeshFab.tsx | 1 | src/App.tsx | Y | N | N | N | Y |
| src/components/OfflineMeshView.tsx | 1 | src/components/OfflineChatView.tsx | Y | N | N | N | Y |
| src/components/OmegleRandomVideoCall.tsx | 1 | src/components/MeetView.tsx | Y | N | N | N | Y |
| src/components/P2PRenting.tsx | 1 | src/components/NewFeaturesHub.tsx | Y | N | N | N | Y |
| src/components/PairCoding.tsx | 1 | src/components/NewFeaturesHub.tsx | Y | N | N | N | Y |
| src/components/ParkingShare.tsx | 1 | src/components/NewFeaturesHub.tsx | Y | N | N | N | Y |
| src/components/PeriodTracker.tsx | 1 | src/components/NewFeaturesHub.tsx | Y | N | N | N | Y |
| src/components/Personas.tsx | 1 | src/components/NewFeaturesHub.tsx | Y | N | N | N | Y |
| src/components/PlasticWealth.tsx | 1 | src/components/NewFeaturesHub.tsx | Y | N | N | N | Y |
| src/components/Portfolio.tsx | 1 | src/components/NewFeaturesHub.tsx | Y | N | N | N | Y |
| src/components/PostsSection.tsx | 1 | src/App.tsx | Y | N | N | N | Y |
| src/components/PrivacyDashboard.tsx | 1 | src/components/NewFeaturesHub.tsx | Y | N | N | N | Y |
| src/components/ProfileSummary.tsx | 1 | src/components/NewFeaturesHub.tsx | Y | N | N | N | Y |
| src/components/QuantumCrypto.tsx | 1 | src/components/NewFeaturesHub.tsx | Y | N | N | N | Y |
| src/components/QuranCircle.tsx | 1 | src/components/NewFeaturesHub.tsx | Y | N | N | N | Y |
| src/components/RandomTextDmView.tsx | 1 | src/App.tsx | Y | N | N | N | Y |
| src/components/RecoveryVerifyModal.tsx | 1 | src/App.tsx | Y | N | N | N | Y |
| src/components/RedTeamArena.tsx | 1 | src/components/NewFeaturesHub.tsx | Y | N | N | N | Y |
| src/components/ReelBounties.tsx | 1 | src/components/NewFeaturesHub.tsx | Y | N | N | N | Y |
| src/components/ReligiousEvents.tsx | 1 | src/components/NewFeaturesHub.tsx | Y | N | N | N | Y |
| src/components/Reputation.tsx | 1 | src/components/NewFeaturesHub.tsx | Y | N | N | N | Y |
| src/components/ResumeBuilder.tsx | 1 | src/components/NewFeaturesHub.tsx | Y | N | N | N | Y |
| src/components/RevenueShare.tsx | 1 | src/components/NewFeaturesHub.tsx | Y | N | N | N | Y |
| src/components/RTIFiler.tsx | 1 | src/components/NewFeaturesHub.tsx | Y | N | N | N | Y |
| src/components/SafeEscortView.tsx | 1 | src/components/NewFeaturesHub.tsx | Y | N | N | N | Y |
| src/components/SafeHavenView.tsx | 1 | src/components/NewFeaturesHub.tsx | Y | N | N | N | Y |
| src/components/SafeShelterView.tsx | 1 | src/components/NewFeaturesHub.tsx | Y | N | N | N | Y |
| src/components/SafeSOSView.tsx | 1 | src/components/NewFeaturesHub.tsx | Y | N | N | N | Y |
| src/components/SafetyShieldView.tsx | 1 | src/components/NewFeaturesHub.tsx | Y | N | N | N | Y |
| src/components/SafetyShorts.tsx | 1 | src/components/NewFeaturesHub.tsx | Y | N | N | N | Y |
| src/components/SafeWatchView.tsx | 1 | src/components/NewFeaturesHub.tsx | Y | N | N | N | Y |
| src/components/SatelliteFallback.tsx | 1 | src/components/NewFeaturesHub.tsx | Y | N | N | N | Y |
| src/components/SavedMessagesPanel.tsx | 1 | src/components/ChatModal.tsx | Y | N | N | N | Y |
| src/components/SavingCircle.tsx | 1 | src/components/NewFeaturesHub.tsx | Y | N | N | N | Y |
| src/components/ScholarshipTracker.tsx | 1 | src/components/NewFeaturesHub.tsx | Y | N | N | N | Y |
| src/components/SecureVaultView.tsx | 1 | src/components/NewFeaturesHub.tsx | Y | N | N | N | Y |
| src/components/SensorySafeMode.tsx | 1 | src/components/NewFeaturesHub.tsx | Y | N | N | N | Y |
| src/components/SilentDrop.tsx | 1 | src/components/NewFeaturesHub.tsx | Y | N | N | N | Y |
| src/components/SkillExchange.tsx | 1 | src/components/NewFeaturesHub.tsx | Y | N | N | N | Y |
| src/components/SmartCommunity.tsx | 2 | src/components/CommunitySection.tsx, src/components/NewFeaturesHub.tsx | Y | N | N | N | Y |
| src/components/SOSAlertView.tsx | 1 | src/components/NewFeaturesHub.tsx | Y | N | N | N | Y |
| src/components/SOSEmergencyButton.tsx | 1 | src/App.tsx | Y | N | N | N | Y |
| src/components/StealthRec.tsx | 1 | src/components/NewFeaturesHub.tsx | Y | N | N | N | Y |
| src/components/StoryChains.tsx | 1 | src/components/NewFeaturesHub.tsx | Y | N | N | N | Y |
| src/components/Streaks.tsx | 1 | src/components/NewFeaturesHub.tsx | Y | N | N | N | Y |
| src/components/StreamAdminDashboard.tsx | 1 | src/App.tsx | Y | N | N | N | Y |
| src/components/SubscriptionManager.tsx | 1 | src/components/NewFeaturesHub.tsx | Y | N | N | N | Y |
| src/components/TakeABreath.tsx | 1 | src/components/NewFeaturesHub.tsx | Y | N | N | N | Y |
| src/components/TenderTracker.tsx | 1 | src/components/NewFeaturesHub.tsx | Y | N | N | N | Y |
| src/components/TimeCapsuleLock.tsx | 3 | src/App.tsx, src/components/CommentsModal.tsx, src/components/PostsSection.tsx | Y | N | N | N | Y |
| src/components/TrafficWitness.tsx | 1 | src/components/NewFeaturesHub.tsx | Y | N | N | N | Y |
| src/components/TravelBuddy.tsx | 1 | src/components/NewFeaturesHub.tsx | Y | N | N | N | Y |
| src/components/TrendingSounds.tsx | 1 | src/components/NewFeaturesHub.tsx | Y | N | N | N | Y |
| src/components/TriggerWarnings.tsx | 1 | src/components/NewFeaturesHub.tsx | Y | N | N | N | Y |
| src/components/TutorMatch.tsx | 1 | src/components/NewFeaturesHub.tsx | Y | N | N | N | Y |
| src/components/UpliftFeed.tsx | 1 | src/components/NewFeaturesHub.tsx | Y | N | N | N | Y |
| src/components/VenueStatus.tsx | 1 | src/components/NewFeaturesHub.tsx | Y | N | N | N | Y |
| src/components/VerifiedLive.tsx | 1 | src/components/NewFeaturesHub.tsx | Y | N | N | N | Y |
| src/components/VisualSearch.tsx | 2 | src/App.tsx, src/components/NewFeaturesHub.tsx | Y | N | N | N | Y |
| src/components/VoiceNotePlayback.tsx | 2 | src/App.tsx, src/components/PostsSection.tsx | Y | N | N | N | Y |
| src/components/WardCivic.tsx | 1 | src/components/NewFeaturesHub.tsx | Y | N | N | N | Y |
| src/components/WatchTogetherModal.tsx | 1 | src/components/ChatModal.tsx | Y | N | N | N | Y |
| src/components/WatermarkStudio.tsx | 1 | src/components/NewFeaturesHub.tsx | Y | N | N | N | Y |
| src/components/ZakatCalculator.tsx | 1 | src/components/NewFeaturesHub.tsx | Y | N | N | N | Y |
| src/components/ZeroDoomscroll.tsx | 1 | src/components/NewFeaturesHub.tsx | Y | N | N | N | Y |
| src/components/ZKKYC.tsx | 1 | src/components/NewFeaturesHub.tsx | Y | N | N | N | Y |
| src/defaultData.ts | 1 | src/App.tsx | Y | N | N | N | Y |
| src/engine/boosted-content.ts | 0 |  | N | N | N | N | N |
| src/engine/config.ts | 4 | src/engine/index.ts, src/engine/scoring.ts, src/lib/hybridRanker.ts, test-hybrid-rank.mjs | Y | N | N | N | Y |
| src/engine/content-understanding.ts | 0 |  | N | N | N | N | N |
| src/engine/creator-modeling.ts | 0 |  | N | N | N | N | N |
| src/engine/data-schemas.ts | 0 |  | N | N | N | N | N |
| src/engine/exploration.ts | 0 |  | N | N | N | N | N |
| src/engine/index.ts | 1 | src/components/InteractiveDemo.tsx | Y | N | N | N | Y |
| src/engine/math.ts | 8 | src/engine/boosted-content.ts, src/engine/exploration.ts, src/engine/index.ts, src/engine/prediction-models.ts, src/engine/ranking-pipeline.ts… | Y | N | N | N | Y |
| src/engine/online-learning.ts | 0 |  | N | N | N | N | N |
| src/engine/prediction-models.ts | 0 |  | N | N | N | N | N |
| src/engine/ranking-pipeline.ts | 0 |  | N | N | N | N | N |
| src/engine/scoring.ts | 2 | src/engine/index.ts, src/lib/hybridRanker.ts | Y | N | N | N | Y |
| src/engine/simulator.ts | 1 | src/engine/index.ts | Y | N | N | N | Y |
| src/engine/trust-safety.ts | 0 |  | N | N | N | N | N |
| src/engine/types.ts | 5 | src/engine/config.ts, src/engine/index.ts, src/engine/scoring.ts, src/engine/simulator.ts, src/lib/hybridRanker.ts | Y | N | N | N | Y |
| src/engine/user-modeling.ts | 0 |  | N | N | N | N | N |
| src/engine/viral-trending.ts | 0 |  | N | N | N | N | N |
| src/googleDriveService.ts | 0 |  | N | N | N | N | N |
| src/hooks/useP2PCall.ts | 1 | src/components/call/ActiveP2PCallScreen.tsx | N | N | N | N | N |
| src/hooks/useRandomVideoCall.ts | 0 |  | N | N | N | N | N |
| src/index.css | 1 | src/main.tsx | Y | N | N | N | Y |
| src/lib/badges.ts | 1 | src/App.tsx | Y | N | N | N | Y |
| src/lib/base44Utils.js | 0 |  | N | N | N | N | N |
| src/lib/countries.ts | 0 |  | N | N | N | N | N |
| src/lib/crypto-browser.ts | 1 | src/App.tsx | Y | N | N | N | Y |
| src/lib/editors/fabric/canvasManager.ts | 1 | src/components/editors/OceanCanvasDesign.tsx | Y | N | N | N | Y |
| src/lib/editors/ffmpeg/ffmpegEngine.ts | 1 | src/components/editors/OceanCutVideo.tsx | Y | N | N | N | Y |
| src/lib/editors/filerobot.d.ts | 0 |  | N | N | N | N | N |
| src/lib/editors/media.ts | 2 | src/App.tsx, src/components/editors/PhotoEditorModal.tsx | Y | N | N | N | Y |
| src/lib/haptics.ts | 0 |  | N | N | N | N | N |
| src/lib/hybridRanker.ts | 2 | src/App.tsx, test-hybrid-rank.mjs | Y | N | N | N | Y |
| src/lib/imageCompressor.ts | 0 |  | N | N | N | N | N |
| src/lib/matchmaking.ts | 1 | server.ts | N | Y | N | N | Y |
| src/lib/mediaKeyframe.ts | 1 | src/components/VisualSearch.tsx | Y | N | N | N | Y |
| src/lib/moderation.js | 0 |  | N | N | N | N | N |
| src/lib/nsfwSettings.ts | 2 | src/App.tsx, src/components/NSFWMediaGuard.tsx | Y | N | N | N | Y |
| src/lib/reco/ads.ts | 1 | src/lib/reco/index.ts | N | Y | N | N | Y |
| src/lib/reco/advanced/ann-scann.ts | 1 | src/lib/reco/index.ts | N | Y | N | N | Y |
| src/lib/reco/advanced/deep-rankers.ts | 1 | src/lib/reco/index.ts | N | Y | N | N | Y |
| src/lib/reco/advanced/feature-store.ts | 1 | src/lib/reco/index.ts | N | Y | N | N | Y |
| src/lib/reco/advanced/online-ftrl.ts | 1 | src/lib/reco/index.ts | N | Y | N | N | Y |
| src/lib/reco/advanced/reinforcement-learning.ts | 1 | src/lib/reco/index.ts | N | Y | N | N | Y |
| src/lib/reco/coldstart.ts | 1 | src/lib/reco/index.ts | N | Y | N | N | Y |
| src/lib/reco/content-model.ts | 2 | src/lib/reco/index.ts, src/lib/reco/user-model.ts | N | Y | N | N | Y |
| src/lib/reco/context.ts | 1 | src/lib/reco/index.ts | N | Y | N | N | Y |
| src/lib/reco/creator-model.ts | 1 | src/lib/reco/index.ts | N | Y | N | N | Y |
| src/lib/reco/dynamics.ts | 1 | src/lib/reco/index.ts | N | Y | N | N | Y |
| src/lib/reco/features.ts | 2 | src/lib/reco/index.ts, src/lib/reco/models.ts | N | Y | N | N | Y |
| src/lib/reco/index.ts | 1 | server.ts | N | Y | N | N | Y |
| src/lib/reco/integrity.ts | 1 | src/lib/reco/index.ts | N | Y | N | N | Y |
| src/lib/reco/mathkit.ts | 16 | src/lib/reco/ads.ts, src/lib/reco/advanced/ann-scann.ts, src/lib/reco/advanced/deep-rankers.ts, src/lib/reco/advanced/online-ftrl.ts, src/lib/reco/advanced/reinforcement-learning.ts… | N | Y | N | N | Y |
| src/lib/reco/models.ts | 2 | src/lib/reco/index.ts, src/lib/reco/ranker.ts | N | Y | N | N | Y |
| src/lib/reco/ranker.ts | 1 | src/lib/reco/index.ts | N | Y | N | N | Y |
| src/lib/reco/signals.ts | 1 | src/lib/reco/index.ts | N | Y | N | N | Y |
| src/lib/reco/taxonomy.ts | 6 | src/lib/reco/content-model.ts, src/lib/reco/context.ts, src/lib/reco/dynamics.ts, src/lib/reco/features.ts, src/lib/reco/index.ts… | N | Y | N | N | Y |
| src/lib/reco/user-model.ts | 1 | src/lib/reco/index.ts | N | Y | N | N | Y |
| src/lib/ringtoneSynth.ts | 0 |  | N | N | N | N | N |
| src/lib/rtcConfig.ts | 3 | src/calling/callEngine.ts, src/hooks/useP2PCall.ts, src/hooks/useRandomVideoCall.ts | Y | N | N | N | Y |
| src/lib/security.ts | 1 | src/App.tsx | Y | N | N | N | Y |
| src/lib/streamApiManager.ts | 1 | server.ts | N | Y | N | N | Y |
| src/lib/trust.js | 0 |  | N | N | N | N | N |
| src/lib/utils.ts | 0 |  | N | N | N | N | N |
| src/main.tsx | 0 |  | Y | N | N | N | Y |
| src/reelsData.ts | 1 | src/App.tsx | Y | N | N | N | Y |
| src/reference/atlas/ingest.ts | 0 |  | N | N | N | N | N |
| src/reference/atlas/pipeline.ts | 0 |  | N | N | N | N | N |
| src/reference/atlas/seed.ts | 0 |  | N | N | N | N | N |
| src/reference/atlas/store.ts | 2 | src/reference/atlas/ingest.ts, src/reference/atlas/pipeline.ts | N | N | N | N | N |
| src/reference/manus/apiManager.ts | 0 |  | N | N | N | N | N |
| src/reference/manus/matchmaking.ts | 0 |  | N | N | N | N | N |
| src/reference/nsfw-filter/classifiers/BinaryClassifier.ts | 0 |  | N | N | N | N | N |
| src/reference/nsfw-filter/classifiers/Classifier.ts | 2 | src/reference/nsfw-filter/classifiers/BinaryClassifier.ts, src/reference/nsfw-filter/classifiers/NsfwjsClassifier.ts | N | N | N | N | N |
| src/reference/nsfw-filter/classifiers/NsfwjsClassifier.ts | 0 |  | N | N | N | N | N |
| src/reference/nsfw-filter/LRUCache.ts | 0 |  | N | N | N | N | N |
| src/reference/nsfw-filter/Model.ts | 0 |  | N | N | N | N | N |
| src/server/env.ts | 10 | server.ts, src/server/llm.ts, src/server/voiceTranscription.ts, src/turtleCommentSummaryBackend.ts, src/turtleDigitalTwinBackend.ts… | N | Y | N | N | Y |
| src/server/llm.ts | 8 | server.ts, src/turtleCommentSummaryBackend.ts, src/turtleDigitalTwinBackend.ts, src/turtleFacelessVideoBackend.ts, src/turtleFactCheckerBackend.ts… | N | Y | N | N | Y |
| src/server/voiceTranscription.ts | 1 | server.ts | N | Y | N | N | Y |
| src/turtleAchievementsBackend.ts | 1 | src/turtleFeatureRegistry.ts | N | Y | N | N | Y |
| src/turtleAfforestationBackend.ts | 1 | src/turtleFeatureRegistry.ts | N | Y | N | N | Y |
| src/turtleAIBengaliModerationEngine.ts | 2 | server-1.ts, server.ts | N | Y | N | N | Y |
| src/turtleAICaptionEngine.ts | 2 | server-1.ts, server.ts | N | Y | N | N | Y |
| src/turtleAICaptionFlow.ts | 0 |  | N | N | N | N | N |
| src/turtleAIModerationAssistant.ts | 2 | server-1.ts, server.ts | N | Y | N | N | Y |
| src/turtleAIModeratorBackend.ts | 1 | src/turtleFeatureRegistry.ts | N | Y | N | N | Y |
| src/turtleAIVehicleAnalysisEngine.ts | 2 | server-1.ts, server.ts | N | Y | N | N | Y |
| src/turtleAlgoPrefsBackend.ts | 1 | src/turtleFeatureRegistry.ts | N | Y | N | N | Y |
| src/turtleAlumniBackend.ts | 1 | src/turtleFeatureRegistry.ts | N | Y | N | N | Y |
| src/turtleAnonymousBackend.ts | 1 | src/turtleFeatureRegistry.ts | N | Y | N | N | Y |
| src/turtleAssignmentHelpBackend.ts | 1 | src/turtleFeatureRegistry.ts | N | Y | N | N | Y |
| src/turtleAuditLogBackend.ts | 2 | src/turtleAlgoPrefsBackend.ts, src/turtleFeatureRegistry.ts | N | Y | N | N | Y |
| src/turtleAuthFlow.ts | 0 |  | N | N | N | N | N |
| src/turtleAzanBackend.ts | 1 | src/turtleFeatureRegistry.ts | N | Y | N | N | Y |
| src/turtleBackendAPIService.ts | 0 |  | N | N | N | N | N |
| src/turtleBackendBlueprint.ts | 0 |  | N | N | N | N | N |
| src/turtleBarterBackend.ts | 1 | src/turtleFeatureRegistry.ts | N | Y | N | N | Y |
| src/turtleBioDataBackend.ts | 1 | src/turtleFeatureRegistry.ts | N | Y | N | N | Y |
| src/turtleBloodDonorBackend.ts | 1 | src/turtleFeatureRegistry.ts | N | Y | N | N | Y |
| src/turtleBotBountyBackend.ts | 1 | src/turtleFeatureRegistry.ts | N | Y | N | N | Y |
| src/turtleBountyBackend.ts | 1 | src/turtleFeatureRegistry.ts | N | Y | N | N | Y |
| src/turtleBuyNothingBackend.ts | 1 | src/turtleFeatureRegistry.ts | N | Y | N | N | Y |
| src/turtleCarbonLedgerBackend.ts | 1 | src/turtleFeatureRegistry.ts | N | Y | N | N | Y |
| src/turtleCarpoolBackend.ts | 1 | src/turtleFeatureRegistry.ts | N | Y | N | N | Y |
| src/turtleChannelsBackend.ts | 0 |  | N | N | N | N | N |
| src/turtleChaperoneBackend.ts | 1 | src/turtleFeatureRegistry.ts | N | Y | N | N | Y |
| src/turtleChatAiHelper.ts | 3 | chatServer.ts, server-1.ts, server.ts | N | Y | Y | N | Y |
| src/turtleChitFundBackend.ts | 1 | src/turtleFeatureRegistry.ts | N | Y | N | N | Y |
| src/turtleCivicBackend.ts | 1 | src/turtleFeatureRegistry.ts | N | Y | N | N | Y |
| src/turtleCNGFareBackend.ts | 1 | src/turtleFeatureRegistry.ts | N | Y | N | N | Y |
| src/turtleCollaborativeReelsBackend.ts | 1 | src/turtleFeatureRegistry.ts | N | Y | N | N | Y |
| src/turtleCollabPostsBackend.ts | 1 | src/turtleFeatureRegistry.ts | N | Y | N | N | Y |
| src/turtleCommentSummaryBackend.ts | 1 | src/turtleFeatureRegistry.ts | N | Y | N | N | Y |
| src/turtleCommunityBackend.ts | 30 | server.ts, src/turtleAfforestationBackend.ts, src/turtleAssignmentHelpBackend.ts, src/turtleBloodDonorBackend.ts, src/turtleBotBountyBackend.ts… | N | Y | N | N | Y |
| src/turtleCommunityKitchenBackend.ts | 1 | src/turtleFeatureRegistry.ts | N | Y | N | N | Y |
| src/turtleCompatibilityBackend.ts | 1 | src/turtleFeatureRegistry.ts | N | Y | N | N | Y |
| src/turtleContentGateBackend.ts | 1 | src/turtleFeatureRegistry.ts | N | Y | N | N | Y |
| src/turtleContractBackend.ts | 1 | src/turtleFeatureRegistry.ts | N | Y | N | N | Y |
| src/turtleCoStreamBackend.ts | 1 | src/turtleFeatureRegistry.ts | N | Y | N | N | Y |
| src/turtleCropDiagnosisBackend.ts | 1 | src/turtleFeatureRegistry.ts | N | Y | N | N | Y |
| src/turtleDataMarketBackend.ts | 1 | src/turtleFeatureRegistry.ts | N | Y | N | N | Y |
| src/turtleDataSovereigntyBackend.ts | 1 | src/turtleFeatureRegistry.ts | N | Y | N | N | Y |
| src/turtleDebateModeratorBackend.ts | 1 | src/turtleFeatureRegistry.ts | N | Y | N | N | Y |
| src/turtleDecentralizedProfilesBackend.ts | 1 | src/turtleFeatureRegistry.ts | N | Y | N | N | Y |
| src/turtleDeepDiveBackend.ts | 1 | src/turtleFeatureRegistry.ts | N | Y | N | N | Y |
| src/turtleDigitalTwinBackend.ts | 1 | src/turtleFeatureRegistry.ts | N | Y | N | N | Y |
| src/turtleE2EEBackend.ts | 1 | src/turtleFeatureRegistry.ts | N | Y | N | N | Y |
| src/turtleElderModeBackend.ts | 1 | src/turtleFeatureRegistry.ts | N | Y | N | N | Y |
| src/turtleEmergencyPools.ts | 13 | src/components/SOSEmergencyButton.tsx, src/turtleBloodDonorBackend.ts, src/turtleCommunityKitchenBackend.ts, src/turtleEmergencyPoolsBackend.ts, src/turtleFloodDepthMapperBackend.ts… | Y | Y | N | N | Y |
| src/turtleEmergencyPoolsBackend.ts | 1 | server.ts | N | Y | N | N | Y |
| src/turtleEscrowBackend.ts | 1 | src/turtleFeatureRegistry.ts | N | Y | N | N | Y |
| src/turtleEvacuationBackend.ts | 1 | src/turtleFeatureRegistry.ts | N | Y | N | N | Y |
| src/turtleEvidenceVaultBackend.ts | 1 | src/turtleFeatureRegistry.ts | N | Y | N | N | Y |
| src/turtleExamRoomBackend.ts | 1 | src/turtleFeatureRegistry.ts | N | Y | N | N | Y |
| src/turtleFacelessVideoBackend.ts | 1 | src/turtleFeatureRegistry.ts | N | Y | N | N | Y |
| src/turtleFactCheckerBackend.ts | 1 | src/turtleFeatureRegistry.ts | N | Y | N | N | Y |
| src/turtleFamilyCircleBackend.ts | 1 | src/turtleFeatureRegistry.ts | N | Y | N | N | Y |
| src/turtleFarmLiveBackend.ts | 1 | src/turtleFeatureRegistry.ts | N | Y | N | N | Y |
| src/turtleFarmToolsBackend.ts | 1 | src/turtleFeatureRegistry.ts | N | Y | N | N | Y |
| src/turtleFeatureRegistry.ts | 1 | server.ts | N | Y | N | N | Y |
| src/turtleFeaturesMasterBlueprint.ts | 0 |  | N | N | N | N | N |
| src/turtleFederatedLearningBackend.ts | 1 | src/turtleFeatureRegistry.ts | N | Y | N | N | Y |
| src/turtleFediverseBackend.ts | 1 | src/turtleFeatureRegistry.ts | N | Y | N | N | Y |
| src/turtleFeedExplainBackend.ts | 2 | src/turtleAuditLogBackend.ts, src/turtleFeatureRegistry.ts | N | Y | N | N | Y |
| src/turtleFeedPostLogic.ts | 0 |  | N | N | N | N | N |
| src/turtleFIRBackend.ts | 1 | src/turtleFeatureRegistry.ts | N | Y | N | N | Y |
| src/turtleFloodDepthMapperBackend.ts | 1 | src/turtleFeatureRegistry.ts | N | Y | N | N | Y |
| src/turtleFriendsSystem.ts | 0 |  | N | N | N | N | N |
| src/turtleGarageSaleBackend.ts | 1 | src/turtleFeatureRegistry.ts | N | Y | N | N | Y |
| src/turtleGhostViewBackend.ts | 1 | src/turtleFeatureRegistry.ts | N | Y | N | N | Y |
| src/turtleGigRadarBackend.ts | 1 | src/turtleFeatureRegistry.ts | N | Y | N | N | Y |
| src/turtleGroupBuyBackend.ts | 1 | src/turtleFeatureRegistry.ts | N | Y | N | N | Y |
| src/turtleGuardianBackend.ts | 1 | src/turtleFeatureRegistry.ts | N | Y | N | N | Y |
| src/turtleHalalDatingBackend.ts | 1 | src/turtleFeatureRegistry.ts | N | Y | N | N | Y |
| src/turtleHardwareWalletBackend.ts | 1 | src/turtleFeatureRegistry.ts | N | Y | N | N | Y |
| src/turtleHumanityBackend.ts | 1 | src/turtleFeatureRegistry.ts | N | Y | N | N | Y |
| src/turtleInternshipBackend.ts | 1 | src/turtleFeatureRegistry.ts | N | Y | N | N | Y |
| src/turtleInterviewBackend.ts | 1 | src/turtleFeatureRegistry.ts | N | Y | N | N | Y |
| src/turtleIrrigationBackend.ts | 1 | src/turtleFeatureRegistry.ts | N | Y | N | N | Y |
| src/turtleJobAlertBackend.ts | 1 | src/turtleFeatureRegistry.ts | N | Y | N | N | Y |
| src/turtleLawyerBackend.ts | 1 | src/turtleFeatureRegistry.ts | N | Y | N | N | Y |
| src/turtleLegalAidBackend.ts | 1 | src/turtleFeatureRegistry.ts | N | Y | N | N | Y |
| src/turtleLiveReporterBackend.ts | 1 | src/turtleFeatureRegistry.ts | N | Y | N | N | Y |
| src/turtleLogic.ts | 0 |  | N | N | N | N | N |
| src/turtleLongFormVideoBackend.ts | 0 |  | N | N | N | N | N |
| src/turtleMandiBackend.ts | 1 | src/turtleFeatureRegistry.ts | N | Y | N | N | Y |
| src/turtleMarketNegotiatorBackend.ts | 1 | src/turtleFeatureRegistry.ts | N | Y | N | N | Y |
| src/turtleMatchmakerBackend.ts | 1 | src/turtleFeatureRegistry.ts | N | Y | N | N | Y |
| src/turtleMediaSearchBackend.ts | 1 | src/turtleFeatureRegistry.ts | N | Y | N | N | Y |
| src/turtleMemoriesBackend.ts | 1 | src/turtleFeatureRegistry.ts | N | Y | N | N | Y |
| src/turtleMessagingBackend.ts | 0 |  | N | N | N | N | N |
| src/turtleMissingPersonBackend.ts | 1 | src/turtleFeatureRegistry.ts | N | Y | N | N | Y |
| src/turtleModerationSystem.ts | 0 |  | N | N | N | N | N |
| src/turtleMoodFeedBackend.ts | 1 | src/turtleFeatureRegistry.ts | N | Y | N | N | Y |
| src/turtleMVPScopingEngine.ts | 0 |  | N | N | N | N | N |
| src/turtleNotificationSystem.ts | 0 |  | N | N | N | N | N |
| src/turtleOfflineMeshBackend.ts | 1 | src/turtleFeatureRegistry.ts | N | Y | N | N | Y |
| src/turtleOfflineP2P.ts | 3 | src/components/OfflineChatView.tsx, src/components/OfflineMeshFab.tsx, test-offline-p2p.ts | Y | N | N | N | Y |
| src/turtlePairCodingBackend.ts | 1 | src/turtleFeatureRegistry.ts | N | Y | N | N | Y |
| src/turtleParkingBackend.ts | 1 | src/turtleFeatureRegistry.ts | N | Y | N | N | Y |
| src/turtlePersonaBackend.ts | 1 | src/turtleFeatureRegistry.ts | N | Y | N | N | Y |
| src/turtlePlasticWealthBackend.ts | 1 | src/turtleFeatureRegistry.ts | N | Y | N | N | Y |
| src/turtlePodcastBackend.ts | 1 | src/turtleFeatureRegistry.ts | N | Y | N | N | Y |
| src/turtlePortfolioBackend.ts | 1 | src/turtleFeatureRegistry.ts | N | Y | N | N | Y |
| src/turtlePrivacyDashboardBackend.ts | 1 | src/turtleFeatureRegistry.ts | N | Y | N | N | Y |
| src/turtleProfileMetrics.ts | 0 |  | N | N | N | N | N |
| src/turtleProfileSummaryBackend.ts | 1 | src/turtleFeatureRegistry.ts | N | Y | N | N | Y |
| src/turtleQATestPlan.ts | 0 |  | N | N | N | N | N |
| src/turtleQuantumCryptoBackend.ts | 1 | src/turtleFeatureRegistry.ts | N | Y | N | N | Y |
| src/turtleQuranCircleBackend.ts | 1 | src/turtleFeatureRegistry.ts | N | Y | N | N | Y |
| src/turtleRandomChatBackend.ts | 0 |  | N | N | N | N | N |
| src/turtleRankingEngine.ts | 3 | src/App.tsx, src/lib/hybridRanker.ts, test-hybrid-rank.mjs | Y | N | N | N | Y |
| src/turtleReactionSystem.ts | 0 |  | N | N | N | N | N |
| src/turtleRedTeamBackend.ts | 1 | src/turtleFeatureRegistry.ts | N | Y | N | N | Y |
| src/turtleReelsBackend.ts | 1 | src/App.tsx | Y | N | N | N | Y |
| src/turtleReligiousEventsBackend.ts | 1 | src/turtleFeatureRegistry.ts | N | Y | N | N | Y |
| src/turtleRentalBackend.ts | 1 | src/turtleFeatureRegistry.ts | N | Y | N | N | Y |
| src/turtleReputationBackend.ts | 1 | src/turtleFeatureRegistry.ts | N | Y | N | N | Y |
| src/turtleResumeBackend.ts | 1 | src/turtleFeatureRegistry.ts | N | Y | N | N | Y |
| src/turtleRevenueShareBackend.ts | 1 | src/turtleFeatureRegistry.ts | N | Y | N | N | Y |
| src/turtleRTIBackend.ts | 1 | src/turtleFeatureRegistry.ts | N | Y | N | N | Y |
| src/turtleSafeEscortBackend.ts | 1 | src/turtleFeatureRegistry.ts | N | Y | N | N | Y |
| src/turtleSafeHavenBackend.ts | 1 | src/turtleFeatureRegistry.ts | N | Y | N | N | Y |
| src/turtleSafeShelterBackend.ts | 1 | src/turtleFeatureRegistry.ts | N | Y | N | N | Y |
| src/turtleSafeSOSBackend.ts | 1 | src/turtleFeatureRegistry.ts | N | Y | N | N | Y |
| src/turtleSafetyShieldBackend.ts | 1 | src/turtleFeatureRegistry.ts | N | Y | N | N | Y |
| src/turtleSafetyShortsBackend.ts | 1 | src/turtleFeatureRegistry.ts | N | Y | N | N | Y |
| src/turtleSafeWatchBackend.ts | 1 | src/turtleFeatureRegistry.ts | N | Y | N | N | Y |
| src/turtleSatelliteBackend.ts | 1 | src/turtleFeatureRegistry.ts | N | Y | N | N | Y |
| src/turtleSavingCircleBackend.ts | 1 | src/turtleFeatureRegistry.ts | N | Y | N | N | Y |
| src/turtleScholarshipBackend.ts | 1 | src/turtleFeatureRegistry.ts | N | Y | N | N | Y |
| src/turtleSecureVaultBackend.ts | 1 | src/turtleFeatureRegistry.ts | N | Y | N | N | Y |
| src/turtleSecurityPrivacyBackend.ts | 0 |  | N | N | N | N | N |
| src/turtleSecurityTelegramOTPService.ts | 2 | server-1.ts, server.ts | N | Y | N | N | Y |
| src/turtleServerContext.ts | 126 | server.ts, src/turtleAIModeratorBackend.ts, src/turtleAchievementsBackend.ts, src/turtleAfforestationBackend.ts, src/turtleAlgoPrefsBackend.ts… | N | Y | N | N | Y |
| src/turtleSharedSubsBackend.ts | 1 | src/turtleFeatureRegistry.ts | N | Y | N | N | Y |
| src/turtleSilentDropBackend.ts | 1 | src/turtleFeatureRegistry.ts | N | Y | N | N | Y |
| src/turtleSkillExchangeBackend.ts | 1 | src/turtleFeatureRegistry.ts | N | Y | N | N | Y |
| src/turtleSmartCommunityBackend.ts | 3 | src/turtleAIModeratorBackend.ts, src/turtleDebateModeratorBackend.ts, src/turtleFeatureRegistry.ts | N | Y | N | N | Y |
| src/turtleSmartSearchBackend.ts | 0 |  | N | N | N | N | N |
| src/turtleSmartSearchJSONGenerator.ts | 0 |  | N | N | N | N | N |
| src/turtleSOSAlertBackend.ts | 1 | src/turtleFeatureRegistry.ts | N | Y | N | N | Y |
| src/turtleStealthRecBackend.ts | 1 | src/turtleFeatureRegistry.ts | N | Y | N | N | Y |
| src/turtleStoryChainsBackend.ts | 1 | src/turtleFeatureRegistry.ts | N | Y | N | N | Y |
| src/turtleStreaksBackend.ts | 1 | src/turtleFeatureRegistry.ts | N | Y | N | N | Y |
| src/turtleSubscriptionsBackend.ts | 1 | src/turtleFeatureRegistry.ts | N | Y | N | N | Y |
| src/turtleTimeCapsuleSystem.ts | 0 |  | N | N | N | N | N |
| src/turtleTravelBackend.ts | 1 | src/turtleFeatureRegistry.ts | N | Y | N | N | Y |
| src/turtleTrendingSoundBackend.ts | 1 | src/turtleFeatureRegistry.ts | N | Y | N | N | Y |
| src/turtleTrendingTopicEngine.ts | 0 |  | N | N | N | N | N |
| src/turtleTriggerWarningBackend.ts | 1 | src/turtleFeatureRegistry.ts | N | Y | N | N | Y |
| src/turtleTutorBackend.ts | 1 | src/turtleFeatureRegistry.ts | N | Y | N | N | Y |
| src/turtleUpliftFeedBackend.ts | 1 | src/turtleFeatureRegistry.ts | N | Y | N | N | Y |
| src/turtleUserSettingsBackend.ts | 0 |  | N | N | N | N | N |
| src/turtleVenueBackend.ts | 1 | src/turtleFeatureRegistry.ts | N | Y | N | N | Y |
| src/turtleWardBackend.ts | 1 | src/turtleFeatureRegistry.ts | N | Y | N | N | Y |
| src/turtleWatermarkBackend.ts | 1 | src/turtleFeatureRegistry.ts | N | Y | N | N | Y |
| src/turtleWhiteboardBackend.ts | 1 | src/turtleFeatureRegistry.ts | N | Y | N | N | Y |
| src/turtleZakatBackend.ts | 1 | src/turtleFeatureRegistry.ts | N | Y | N | N | Y |
| src/turtleZKKYCBackend.ts | 1 | src/turtleFeatureRegistry.ts | N | Y | N | N | Y |
| src/types.ts | 7 | src/App.tsx, src/components/ChatModal.tsx, src/components/CommentsModal.tsx, src/components/IdentityCard.tsx, src/components/NeedPostPortal.tsx… | Y | N | N | N | Y |
| src/utils/mediaStore.ts | 1 | src/App.tsx | Y | N | N | N | Y |
| test-dom.js | 0 |  | N | N | N | N | N |
| test-firestore.cjs | 0 |  | N | N | N | N | N |
| test-firestore.js | 0 |  | N | N | N | N | N |
| test-firestore2.cjs | 0 |  | N | N | N | N | N |
| test-firestore3.cjs | 0 |  | N | N | N | N | N |
| test-firestore4.cjs | 0 |  | N | N | N | N | N |
| test-hybrid-rank.mjs | 0 |  | N | N | N | N | N |
| test-offline-p2p.ts | 0 |  | N | N | N | N | N |
| test-selector.js | 0 |  | N | N | N | N | N |
| tsconfig-1.json | 0 |  | N | N | N | N | N |
| tsconfig.json | 0 |  | N | N | N | N | N |
| turtle_product_logic.md | 0 |  | N | N | N | N | N |
| turtle_schema.sql | 0 |  | N | N | N | N | N |
| turtleNSFWFilter.ts | 5 | App-3.tsx, src/App.tsx, src/components/NSFWMediaGuard.tsx, src/lib/nsfwSettings.ts, turtleNSFWServerEngine.ts | Y | Y | N | N | Y |
| turtleNSFWServerEngine.ts | 1 | server.ts | N | Y | N | N | Y |
| turtleRankingEngine-1.ts | 0 |  | N | N | N | N | N |
| turtleRankingEngine.ts | 3 | App-1.tsx, App-2.tsx, src/turtleRankingEngine.ts | Y | N | N | N | Y |
| VERIFICATION_REPORT.md | 0 |  | N | N | N | N | N |
| vite,config-1.ts | 0 |  | N | N | N | N | N |
| vite.config.ts | 0 |  | N | N | N | N | N |
| WorldMeet.tsx | 0 |  | N | N | N | N | N |
| x25519-check.ts | 0 |  | N | N | N | N | N |

## Zero-importer files (imported by nothing) — candidate DEAD

- .env.example
- 01-architecture.md
- 02-ranking-1.md
- 02-ranking.md
- App-1.tsx
- App-2.tsx
- App-3.tsx
- app-shell.tsx
- App.tsx
- AppContext.tsx
- auth.ts
- AwaySummary.jsx
- BUG_ANALYSIS_REPORT.md
- ChatModal.tsx
- ChatRoom.tsx
- ChatView.tsx
- classify_nsfw_py3.py
- CLAUDE.md
- CommentsModal-1.tsx
- CommentsModal-2.tsx
- CommentsModal.tsx
- community.json
- database.json
- docs/cleanup-test-data.mjs
- docs/IMPLEMENTATION_PLAYBOOK.md
- docs/specs/01-architecture.md
- docs/specs/02-ranking.md
- docs/specs/03-platform.md
- docs/specs/04-meta-tiktok-production-gap-analysis.md
- docs/test-callflow.mjs
- docs/test-pairing.mjs
- firebase-blueprint.json
- firebase.json
- firestore.rules
- fix_app.py
- fix_media_dive.py
- fix_reels_idx.py
- fix_server.py
- fix-ui.cjs
- IdentityCard.tsx
- immersive_reels_block.tsx
- import-graph-report.md
- index.html
- mathkit-1.ts
- mathkit.ts
- metadata.json
- move_reels.py
- noise-debug.ts
- noise-debug2.ts
- noise-debug3.ts
- noise-smoke.ts
- noise-vector.ts
- package-1.json
- package-lock.json
- package.json
- patch_app.py
- patch_publish.py
- patch_server.py
- PostCard.jsx
- PostComposer.jsx
- PostsSection.tsx
- public/ffmpeg/ffmpeg-core.js
- public/models/mobilenet_v2/group1-shard1of1
- public/models/mobilenet_v2/model.json
- README.md
- ReelCard.jsx
- ReelComposer.jsx
- schema.ts
- scripts/capture-whiteboard.cjs
- scripts/import-graph.cjs
- scripts/smoke-editors.cjs
- security_spec.md
- server-1.ts
- sessions.json
- src/bitchat/identity.ts
- src/components/call/ActiveP2PCallScreen.tsx
- src/components/call/P2PCallLayer.tsx
- src/engine/boosted-content.ts
- src/engine/content-understanding.ts
- src/engine/creator-modeling.ts
- src/engine/data-schemas.ts
- src/engine/exploration.ts
- src/engine/online-learning.ts
- src/engine/prediction-models.ts
- src/engine/ranking-pipeline.ts
- src/engine/trust-safety.ts
- src/engine/user-modeling.ts
- src/engine/viral-trending.ts
- src/googleDriveService.ts
- src/hooks/useRandomVideoCall.ts
- src/lib/base44Utils.js
- src/lib/countries.ts
- src/lib/editors/filerobot.d.ts
- src/lib/haptics.ts
- src/lib/imageCompressor.ts
- src/lib/moderation.js
- src/lib/ringtoneSynth.ts
- src/lib/trust.js
- src/lib/utils.ts
- src/reference/atlas/ingest.ts
- src/reference/atlas/pipeline.ts
- src/reference/atlas/seed.ts
- src/reference/manus/apiManager.ts
- src/reference/manus/matchmaking.ts
- src/reference/nsfw-filter/classifiers/BinaryClassifier.ts
- src/reference/nsfw-filter/classifiers/NsfwjsClassifier.ts
- src/reference/nsfw-filter/LRUCache.ts
- src/reference/nsfw-filter/Model.ts
- src/turtleAICaptionFlow.ts
- src/turtleAuthFlow.ts
- src/turtleBackendAPIService.ts
- src/turtleBackendBlueprint.ts
- src/turtleChannelsBackend.ts
- src/turtleFeaturesMasterBlueprint.ts
- src/turtleFeedPostLogic.ts
- src/turtleFriendsSystem.ts
- src/turtleLogic.ts
- src/turtleLongFormVideoBackend.ts
- src/turtleMessagingBackend.ts
- src/turtleModerationSystem.ts
- src/turtleMVPScopingEngine.ts
- src/turtleNotificationSystem.ts
- src/turtleProfileMetrics.ts
- src/turtleQATestPlan.ts
- src/turtleRandomChatBackend.ts
- src/turtleReactionSystem.ts
- src/turtleSecurityPrivacyBackend.ts
- src/turtleSmartSearchBackend.ts
- src/turtleSmartSearchJSONGenerator.ts
- src/turtleTimeCapsuleSystem.ts
- src/turtleTrendingTopicEngine.ts
- src/turtleUserSettingsBackend.ts
- test-dom.js
- test-firestore.cjs
- test-firestore.js
- test-firestore2.cjs
- test-firestore3.cjs
- test-firestore4.cjs
- test-hybrid-rank.mjs
- test-offline-p2p.ts
- test-selector.js
- tsconfig-1.json
- tsconfig.json
- turtle_product_logic.md
- turtle_schema.sql
- turtleRankingEngine-1.ts
- VERIFICATION_REPORT.md
- vite,config-1.ts
- vite.config.ts
- WorldMeet.tsx
- x25519-check.ts

## Exact duplicate groups (byte-identical)


### Group: 01-architecture.md , docs/specs/01-architecture.md

### Group: 02-ranking-1.md , 02-ranking.md , docs/specs/02-ranking.md

### Group: App-1.tsx , App-2.tsx

### Group: CommentsModal-1.tsx , CommentsModal.tsx

### Group: mathkit-1.ts , mathkit.ts , src/lib/reco/mathkit.ts

### Group: src/lib/matchmaking.ts , src/reference/manus/matchmaking.ts

### Group: test-firestore.cjs , test-firestore.js

### Group: vite,config-1.ts , vite.config.ts