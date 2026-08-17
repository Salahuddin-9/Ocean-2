/**
 * Ocean — Feature Registry (features 109–248)
 * -------------------------------------------
 * Aggregates every new-feature backend module so server.ts only ever needs ONE call:
 *     registerOceanFeatures(app);
 * New modules are imported + registered here as each batch lands. server.ts calls
 * setServerContext(...) BEFORE registerOceanFeatures(app), so getCtx() is available.
 */
import type { Express } from 'express';
import { getCtx } from './turtleServerContext';
import { registerWhiteboardRoutes } from './turtleWhiteboardBackend';
import { registerMediaSearchRoutes } from './turtleMediaSearchBackend';
import { registerCollaborativeReelsRoutes } from './turtleCollaborativeReelsBackend';
import { registerRevenueShareRoutes } from './turtleRevenueShareBackend';
import { registerSubscriptionsRoutes } from './turtleSubscriptionsBackend';
import { registerCoStreamRoutes } from './turtleCoStreamBackend';
import { registerBountyRoutes } from './turtleBountyBackend';
import { registerFacelessVideoRoutes } from './turtleFacelessVideoBackend';
import { registerTrendingSoundRoutes } from './turtleTrendingSoundBackend';
import { registerSmartCommunityRoutes } from './turtleSmartCommunityBackend';
import { registerSafeSOSRoutes } from './turtleSafeSOSBackend';
import { registerSafetyShieldRoutes } from './turtleSafetyShieldBackend';
import { registerSafeShelterRoutes } from './turtleSafeShelterBackend';
import { registerBloodDonorRoutes } from './turtleBloodDonorBackend';
import { registerMissingPersonRoutes } from './turtleMissingPersonBackend';
import { registerSafeEscortRoutes } from './turtleSafeEscortBackend';
import { registerSOSAlertRoutes } from './turtleSOSAlertBackend';
import { registerSafeWatchRoutes } from './turtleSafeWatchBackend';
import { registerOfflineMeshRoutes } from './turtleOfflineMeshBackend';
import { registerSafeHavenRoutes } from './turtleSafeHavenBackend';
import { registerFloodDepthMapperRoutes } from './turtleFloodDepthMapperBackend';
import { registerDataSovereigntyRoutes } from './turtleDataSovereigntyBackend';
import { registerE2EERoutes } from './turtleE2EEBackend';
import { registerPrivacyDashboardRoutes } from './turtlePrivacyDashboardBackend';
import { registerAnonymousRoutes } from './turtleAnonymousBackend';
import { registerDecentralizedProfilesRoutes } from './turtleDecentralizedProfilesBackend';
import { registerSecureVaultRoutes } from './turtleSecureVaultBackend';            // 135 Secure Vault
import { registerHumanityRoutes } from './turtleHumanityBackend';                 // 137 Humanity Score
import { registerBotBountyRoutes } from './turtleBotBountyBackend';               // 138 Community Bot-Bounty
import { registerTriggerWarningRoutes } from './turtleTriggerWarningBackend';      // 139 Trigger Warning Auto-Blur
import { registerFeedExplainRoutes } from './turtleFeedExplainBackend';            // 140 AI Feed Explanation
import { registerProfileSummaryRoutes } from './turtleProfileSummaryBackend';      // 141 AI Profile Summary
import { registerCommentSummaryRoutes } from './turtleCommentSummaryBackend';     // 142 AI Comment Summarizer
import { registerAIModeratorRoutes } from './turtleAIModeratorBackend';           // 143 AI Community Moderator
import { registerFactCheckerRoutes } from './turtleFactCheckerBackend';           // 144 AI Semantic Fact-Checker
import { registerGhostViewRoutes } from './turtleGhostViewBackend';               // 145 Ghost View
import { registerPodcastRoutes } from './turtlePodcastBackend';                   // 147 Daily Podcast
import { registerMarketNegotiatorRoutes } from './turtleMarketNegotiatorBackend'; // 148 Marketplace Negotiator
import { registerDigitalTwinRoutes } from './turtleDigitalTwinBackend';           // 149 Digital Twin Auto-Responder
import { registerDebateModeratorRoutes } from './turtleDebateModeratorBackend';   // 150 AI Debate Moderator
import { registerAlgoPrefsRoutes } from './turtleAlgoPrefsBackend';               // 151 User-Controlled Algo Panel
import { registerAuditLogRoutes } from './turtleAuditLogBackend';                 // 152 Algorithmic Audit Log
import { registerUpliftFeedRoutes } from './turtleUpliftFeedBackend';             // 156 Uplift Feed Toggle
import { registerMemoriesRoutes } from './turtleMemoriesBackend';                 // 160-161 Memory Recaps + Shared Memories
import { registerCollabPostsRoutes } from './turtleCollabPostsBackend';           // 162 Collaborative Posts
import { registerStoryChainRoutes } from './turtleStoryChainsBackend';            // 163 Story Chains
import { registerStreakRoutes } from './turtleStreaksBackend';                    // 164 Meaningful Streaks
import { registerAchievementRoutes } from './turtleAchievementsBackend';          // 165 Achievement System
import { registerReputationRoutes } from './turtleReputationBackend';             // 166 Reputation Score
import { registerSilentDropRoutes } from './turtleSilentDropBackend';             // 167 Silent Drop
import { registerStealthRecRoutes } from './turtleStealthRecBackend';             // 168 Stealth Recommend
import { registerEscrowRoutes } from './turtleEscrowBackend';                     // 171 Time-Locked Escrow
import { registerRentalRoutes } from './turtleRentalBackend';                     // 172 P2P Asset Renting
import { registerBarterRoutes } from './turtleBarterBackend';                     // 173 Barter Exchange
import { registerGigRoutes } from './turtleGigRadarBackend';                      // 174 Hyperlocal Gig Radar
import { registerGroupBuyRoutes } from './turtleGroupBuyBackend';                 // 175 Group Buying Power
import { registerBuyNothingRoutes } from './turtleBuyNothingBackend';             // 176 Buy-Nothing Group
import { registerGarageSaleRoutes } from './turtleGarageSaleBackend';             // 177 Garage Sale Map
import { registerChitFundRoutes } from './turtleChitFundBackend';                 // 179 Chit Fund / Committee
import { registerSavingCircleRoutes } from './turtleSavingCircleBackend';         // 180 Saving Circle
import { registerSharedSubsRoutes } from './turtleSharedSubsBackend';             // 181 Subscription Manager
import { registerDataMarketRoutes } from './turtleDataMarketBackend';             // 182 Data Marketplace
import { registerMandiRoutes } from './turtleMandiBackend';                       // 184 Mandi Price Predictor
import { registerFarmLiveRoutes } from './turtleFarmLiveBackend';                 // 185 Farmer-to-Consumer Live
import { registerCropDiagnosisRoutes } from './turtleCropDiagnosisBackend';       // 186 Crop Disease Scanner
import { registerIrrigationRoutes } from './turtleIrrigationBackend';             // 187 Irrigation Scheduler
import { registerFarmToolsRoutes } from './turtleFarmToolsBackend';               // 188 Farm Equipment Pool
import { registerCarbonRoutes } from './turtleCarbonLedgerBackend';               // 189 Carbon Ledger
import { registerAfforestationRoutes } from './turtleAfforestationBackend';       // 190 Micro-Afforestation
import { registerPlasticWealthRoutes } from './turtlePlasticWealthBackend';       // 191 Plastic Waste-to-Wealth
import { registerInterviewRoutes } from './turtleInterviewBackend';              // 192 AI Mock Interview Room
import { registerPortfolioRoutes } from './turtlePortfolioBackend';              // 193 Verified Freelancer Portfolio
import { registerResumeRoutes } from './turtleResumeBackend';                    // 194 Resume Builder
import { registerPairCodingRoutes } from './turtlePairCodingBackend';            // 195 Coding Pair-Sessions
import { registerInternshipRoutes } from './turtleInternshipBackend';            // 196 Internship Board
import { registerJobAlertRoutes } from './turtleJobAlertBackend';                // 197 Govt Job Alert Tracker
import { registerTutorRoutes } from './turtleTutorBackend';                      // 198 Home Tutor Matchmaking
import { registerAssignmentHelpRoutes } from './turtleAssignmentHelpBackend';    // 199 Assignment Help Exchange
import { registerExamRoomRoutes } from './turtleExamRoomBackend';                // 200 Exam War Room
import { registerScholarshipRoutes } from './turtleScholarshipBackend';          // 201 Scholarship Aggregator
import { registerFamilyCircleRoutes } from './turtleFamilyCircleBackend';        // 202 Family Circle Dashboard
import { registerContentGateRoutes } from './turtleContentGateBackend';          // 203 Age-Appropriate Content Gate
import { registerElderModeRoutes } from './turtleElderModeBackend';              // 204 Elder Mode
import { registerGuardianRoutes } from './turtleGuardianBackend';                // 205 Trusted Guardian for Minors
import { registerEvidenceVaultRoutes } from './turtleEvidenceVaultBackend';      // 207 Harassment Evidence Vault
import { registerLawyerRoutes } from './turtleLawyerBackend';                    // 208 Pro-Bono Lawyer Matchmaking
import { registerLegalAidRoutes } from './turtleLegalAidBackend';                // 209 AI Legal First-Aid
import { registerContractRoutes } from './turtleContractBackend';                // 210 Digital Contract Builder
import { registerRTIRoutes } from './turtleRTIBackend';                          // 211 RTI Auto-Filer
import { registerFIRRoutes } from './turtleFIRBackend';                          // 212 Digital FIR / GD Lodge
import { registerWardRoutes } from './turtleWardBackend';                        // 213-214 Ward Budget + Ward Sabha
import { registerCivicRoutes } from './turtleCivicBackend';                      // 215-217 Escalation + Tenders + CLT
import { registerBioDataRoutes } from './turtleBioDataBackend';                  // 218 Bio-Data Auto Builder
import { registerChaperoneRoutes } from './turtleChaperoneBackend';              // 219 Chaperone Mode
import { registerCompatibilityRoutes } from './turtleCompatibilityBackend';      // 220 Compatibility Matrix
import { registerHalalDatingRoutes } from './turtleHalalDatingBackend';          // 221 Halal Dating Timeline
import { registerMatchmakerRoutes } from './turtleMatchmakerBackend';            // 222 Community Matchmaker
import { registerAzanRoutes } from './turtleAzanBackend';                        // 223 Azan Auto-Mute
import { registerZakatRoutes } from './turtleZakatBackend';                      // 224 Digital Zakat Calculator
import { registerVenueRoutes } from './turtleVenueBackend';                      // 225 Venue Live Status
import { registerQuranCircleRoutes } from './turtleQuranCircleBackend';          // 226 Quran/Hadith Circle
import { registerReligiousEventsRoutes } from './turtleReligiousEventsBackend';  // 227 Religious Event Coordination
import { registerTravelRoutes } from './turtleTravelBackend';                    // 228-230 Travel Buddy + Gems + Trips
import { registerCarpoolRoutes } from './turtleCarpoolBackend';                  // 231-232 Carpool + Bike Pool
import { registerCNGFareRoutes } from './turtleCNGFareBackend';                  // 233 CNG Fare Negotiator
import { registerParkingRoutes } from './turtleParkingBackend';                  // 234-235 Parking + Traffic Witness
import { registerFediverseRoutes } from './turtleFediverseBackend';            // 236 ActivityPub / Fediverse Bridge
import { registerZKKYCRoutes } from './turtleZKKYCBackend';                    // 237 Zero-Knowledge KYC
import { registerHardwareWalletRoutes } from './turtleHardwareWalletBackend';  // 238 Hardware Wallet Integration
import { registerSatelliteRoutes } from './turtleSatelliteBackend';            // 239 Satellite Connectivity Fallback
import { registerQuantumCryptoRoutes } from './turtleQuantumCryptoBackend';    // 240 Quantum-Resistant Cryptography
import { registerFederatedLearningRoutes } from './turtleFederatedLearningBackend'; // 241 Federated Learning Node
import { registerWatermarkRoutes } from './turtleWatermarkBackend';            // 242 Synthetic Media Watermarking
import { registerRedTeamRoutes } from './turtleRedTeamBackend';                // 243 Red-Team Challenge Platform
import { registerPersonaRoutes } from './turtlePersonaBackend';              // 244 Contextual Personas
import { registerMoodFeedRoutes } from './turtleMoodFeedBackend';            // 245 Mood Feed
import { registerDeepDiveRoutes } from './turtleDeepDiveBackend';            // 246 Deep Dive Mode (Topic Hubs)
import { registerSkillExchangeRoutes } from './turtleSkillExchangeBackend';  // 247 Skill Exchange Network
import { registerAlumniRoutes } from './turtleAlumniBackend';                // 248 Alumni Network Bridge
import { registerLiveReporterRoutes } from './turtleLiveReporterBackend';      // 120 Proof-of-Location Verified Live
import { registerSafetyShortsRoutes } from './turtleSafetyShortsBackend';      // 126 Self-Defense Tutorial Shorts
import { registerEvacuationRoutes } from './turtleEvacuationBackend';          // 128 Cyclone Evacuation Routes
import { registerCommunityKitchenRoutes } from './turtleCommunityKitchenBackend'; // 129 Community Kitchens

// === Batch B19 — Ocean Pack: the 2026 feature set (missing-features build) ===
import { registerRelationshipTimelineRoutes } from './turtleRelationshipTimelineBackend'; // Relationship Timeline API
import { registerSplitBillRoutes } from './turtleSplitBillBackend';                        // Split Bill in Chat
import { registerVoiceSummaryRoutes } from './turtleVoiceSummaryBackend';                  // Voice Note Summarizer
import { registerStudyRoomsRoutes } from './turtleStudyRoomsBackend';                      // Study / Focus Rooms
import { registerEventGroupsRoutes } from './turtleEventGroupsBackend';                    // Self-Destructing Event Groups
import { registerMarketplaceRoutes } from './turtleMarketplaceBackend';                    // Hyperlocal Marketplace
import { registerOceanPayRoutes } from './turtleOceanPayBackend';                          // Ocean Pay P2P
import { registerDigitalLegacyRoutes } from './turtleDigitalLegacyBackend';                // Digital Legacy & Memorial
import { registerNearbyDonorNotifyRoutes } from './turtleNearbyDonorNotifyBackend';        // Nearby Blood Donor Match
import { registerMissingFaceSearchRoutes } from './turtleMissingFaceSearchBackend';      // Missing Person Visual Match
import { registerProximityAlertRoutes } from './turtleProximityAlertBackend';            // Anti-Stalking Proximity Alert
import { registerStoriesRoutes } from './turtleStoriesBackend';                    // 249 Stories 2.0
import { registerVideoEditorRoutes } from './turtleVideoEditorBackend';            // 250/251/257 Ocean Cut editors
import { registerLiveEcosystemRoutes } from './turtleLiveEcosystemBackend';        // 252 Live Gifts + Ecosystem
import { registerMiniAppsRoutes } from './turtleMiniAppsBackend';                  // 253 Mini Apps Platform
import { registerCommunitiesProRoutes } from './turtleCommunitiesProBackend';      // 254 Communities Pro
import { registerCreatorMonetizationRoutes } from './turtleCreatorMonetizationBackend'; // 255 Creator Monetization
import { registerProGraphRoutes } from './turtleProGraphBackend';                  // 256 Pro Graph
import { registerSnapMapRoutes } from './turtleSnapMapBackend';                    // 258 Snap Map + private stories
import { registerOSLayerRoutes } from './turtleOSLayerBackend';                    // 259 Ocean OS Layer
import { registerDataBrainRoutes } from './turtleDataBrainBackend';                // 260 Data + AI Brain
import { registerTrendingTopicRoutes } from './turtleTrendingTopicEngine';          // 59 Trending Topics (hashtag engine)
import { registerSmartSearchRoutes } from './turtleSmartSearchJSONGenerator';       // 58 Smart Search suggestions
import { registerLongFormVideoRoutes } from './turtleLongFormVideoBackend';         // 61 Long-form video engagement

export function registerOceanFeatures(app: Express) {
  // force-eval ctx so a misconfigured seam fails at startup, not at first request
  getCtx();

  // === Batch B1 — Enhanced Communication & Media (109–110) ===
  registerWhiteboardRoutes(app);     // 109 Shared Workspace Whiteboard
  registerMediaSearchRoutes(app);    // 110 Semantic Media Search

  // === Batch B2 — Creator Economy 2.0 (111–117) ===
  registerCollaborativeReelsRoutes(app);  // 111 Collaborative Reels
  registerRevenueShareRoutes(app);        // 112 Community Revenue Share
  registerSubscriptionsRoutes(app);       // 113 Micro-Subscriptions
  registerCoStreamRoutes(app);            // 114 Co-Streaming & Revenue Split
  registerBountyRoutes(app);              // 115 Open-Source Bounties via Reels
  registerFacelessVideoRoutes(app);       // 116 Faceless AI Video Generator
  registerTrendingSoundRoutes(app);       // 117 Trending Sound Predictor

  // === Batch B3 — Smart Community (118) ===
  registerSmartCommunityRoutes(app);      // 118 Smart Community

  // === Batch B4 — Safety & Civic Resilience (delivered as 11 safety modules) ===
  registerSafeSOSRoutes(app);            // Safe Circle (SOS + contacts + safe walk)
  registerSafetyShieldRoutes(app);       // Safety Shield (trusted circle + check-in)
  registerSafeShelterRoutes(app);        // Safe Shelter & Disaster Watch
  registerBloodDonorRoutes(app);         // Blood Donor Registry
  registerMissingPersonRoutes(app);      // Missing Person Alerts
  registerSafeEscortRoutes(app);         // Safe Escort & Route Safety
  registerSOSAlertRoutes(app);           // SOS Panic + Emergency Contacts
  registerSafeWatchRoutes(app);          // Neighborhood Safety Watch
  registerOfflineMeshRoutes(app);        // Offline Mesh Emergency Relay
  registerSafeHavenRoutes(app);          // Safe Place / Refuge Network
  registerFloodDepthMapperRoutes(app);   // Flood Depth Mapper

  // === Batch B5 — Privacy & Sovereignty (confirmed good modules) ===
  registerDataSovereigntyRoutes(app);    // 131 Data Sovereignty (export, deletion, consent)
  registerE2EERoutes(app);               // 132 End-to-End Encryption (E2EE messenger)
  registerPrivacyDashboardRoutes(app);   // 133 Privacy Dashboard (access log, third-party, permissions)
  registerAnonymousRoutes(app);          // 134 Anonymous & Pseudonymous (pseudonym + incognito feed)
  registerDecentralizedProfilesRoutes(app); // 136 De-centralized Profiles (W3C DIDs)
  registerSecureVaultRoutes(app);            // 135 Secure Vault (encrypted notes + biometric unlock)

  // === Batch B6 — Anti-Bot & Authenticity + Advanced AI (137–145) ===
  registerHumanityRoutes(app);          // 137 Behavioral Biometric Humanity Score
  registerBotBountyRoutes(app);         // 138 Community Bot-Bounty
  registerTriggerWarningRoutes(app);    // 139 Trigger Warning Auto-Blur
  registerFeedExplainRoutes(app);       // 140 AI Personal Feed Explanation
  registerProfileSummaryRoutes(app);    // 141 AI Profile Summary
  registerCommentSummaryRoutes(app);    // 142 AI Comment Summarizer
  registerAIModeratorRoutes(app);       // 143 AI Community Moderator
  registerFactCheckerRoutes(app);       // 144 AI Semantic Fact-Checker
  registerGhostViewRoutes(app);         // 145 Dynamic Contextual Ghosting (Ghost View)
  // 146 Local Transcriber — client-only, no backend needed

  // === Batch B7 — Advanced AI + Wellness & Algo Control (147–158) ===
  registerPodcastRoutes(app);           // 147 Personal Daily Podcast Generator
  registerMarketNegotiatorRoutes(app);  // 148 AI Marketplace Negotiator
  registerDigitalTwinRoutes(app);       // 149 Digital Twin Auto-Responder
  registerDebateModeratorRoutes(app);   // 150 AI Debate Moderator
  registerAlgoPrefsRoutes(app);         // 151 User-Controlled Algo Panel
  registerAuditLogRoutes(app);          // 152 Algorithmic Audit Log
  // 153 Zero Doomscroll — client-only
  // 154 Intentional Scroll — client-only
  // 155 Focus Lock — client-only
  registerUpliftFeedRoutes(app);        // 156 Uplift Feed Toggle
  // 157 Sensory-Safe Mode — client-only (CSS in index.css)
  // 158 Take a Breath Interstitial — client-only

  // === Batch B8 — Social Memory & Gamification (159–168) ===
  // 159 Relationship Timeline — already delivered in App.tsx (joint-timeline UI)
  registerMemoriesRoutes(app);          // 160 Memory Recaps + 161 Shared Memories
  registerCollabPostsRoutes(app);       // 162 Collaborative Posts
  registerStoryChainRoutes(app);        // 163 Story Chains
  registerStreakRoutes(app);            // 164 Meaningful Streaks
  registerAchievementRoutes(app);       // 165 Achievement System
  registerReputationRoutes(app);        // 166 Reputation Score
  registerSilentDropRoutes(app);        // 167 Silent Drop (cron cleanup)
  registerStealthRecRoutes(app);        // 168 Stealth Recommend

  // === Batch B9 — Hyperlocal Economy & Micro-Finance (169–183) ===
  // 169 Local Marketplace — covered by /api/market/* (148) + post type marketplace
  // 170 Micro-Bounty Engine — covered by /api/bounty escrow (115)
  registerEscrowRoutes(app);            // 171 Time-Locked Smart Wallet Escrow
  registerRentalRoutes(app);            // 172 P2P Asset Renting
  registerBarterRoutes(app);            // 173 Skill & Item Barter Exchange
  registerGigRoutes(app);               // 174 Hyperlocal Gig Radar
  registerGroupBuyRoutes(app);          // 175 Group Buying Power
  registerBuyNothingRoutes(app);        // 176 Local Buy-Nothing Group
  registerGarageSaleRoutes(app);        // 177 Garage Sale Map
  // 178 Split-Bill — already delivered in App.tsx (group expense tracker)
  registerChitFundRoutes(app);          // 179 Chit Fund / Committee Tracker
  registerSavingCircleRoutes(app);      // 180 Micro-Investment Group (Saving Circle)
  registerSharedSubsRoutes(app);        // 181 Subscription Manager
  registerDataMarketRoutes(app);        // 182 Personal Data Marketplace
  // 183 Smart Blood-Donor Matchmaking — covered by /api/blood (122)

  // === Batch B10 — Agriculture & Climate Action (184–191) ===
  registerMandiRoutes(app);            // 184 Mandi Price Predictor
  registerFarmLiveRoutes(app);         // 185 Farmer-to-Consumer Direct Bridge
  registerCropDiagnosisRoutes(app);    // 186 Crop Disease Scanner
  registerIrrigationRoutes(app);       // 187 Irrigation Scheduler
  registerFarmToolsRoutes(app);        // 188 Shared Farming Equipment Pool
  registerCarbonRoutes(app);           // 189 Personal Carbon Ledger
  registerAfforestationRoutes(app);    // 190 Micro-Afforestation Verification
  registerPlasticWealthRoutes(app);    // 191 Plastic Waste-to-Wealth

  // === Batch B11 — Education, Careers & Professional Growth (192–201) ===
  registerInterviewRoutes(app);        // 192 AI Mock Interview Room
  registerPortfolioRoutes(app);        // 193 Verified Freelancer Portfolio
  registerResumeRoutes(app);           // 194 Resume Builder (print-ready HTML)
  registerPairCodingRoutes(app);       // 195 Coding Pair-Sessions w/ shared terminal
  registerInternshipRoutes(app);       // 196 Internship Board
  registerJobAlertRoutes(app);         // 197 Govt Job Alert & Circular Tracker
  registerTutorRoutes(app);            // 198 Home Tutor Matchmaking
  registerAssignmentHelpRoutes(app);   // 199 Assignment Help Exchange (coin rewards)
  registerExamRoomRoutes(app);         // 200 Exam War Room
  registerScholarshipRoutes(app);      // 201 Scholarship Aggregator

  // === Batch B12 — Family Safety & Women's Empowerment (202–208) ===
  registerFamilyCircleRoutes(app);    // 202 Family Circle Dashboard
  registerContentGateRoutes(app);     // 203 Age-Appropriate Content Gate
  registerElderModeRoutes(app);       // 204 Elder Mode (client theme + pref sync)
  registerGuardianRoutes(app);        // 205 Trusted Guardian for Minors
  // 206 Period Tracker — client-only (encrypted localStorage, no backend)
  registerEvidenceVaultRoutes(app);   // 207 Harassment Evidence Vault (client-encrypted)
  registerLawyerRoutes(app);          // 208 Pro-Bono Lawyer Matchmaking

  // === Batch B13 — Legal, Governance & Civic Tech (209–217) ===
  registerLegalAidRoutes(app);        // 209 AI Legal First-Aid
  registerContractRoutes(app);        // 210 Digital Contract Builder (templates + e-sign)
  registerRTIRoutes(app);             // 211 RTI Auto-Filer
  registerFIRRoutes(app);             // 212 Digital FIR / GD Lodge (simulated)
  registerWardRoutes(app);            // 213 Participatory Budgeting + 214 Digital Ward Sabha
  registerCivicRoutes(app);           // 215 Escalation Ladder + 216 Tenders + 217 Land Trust

  // === Batch B14 — Religious & Cultural Life (218–227) ===
  registerBioDataRoutes(app);         // 218 Bio-Data Auto Builder
  registerChaperoneRoutes(app);       // 219 Chaperone Mode (read-only chat observer)
  registerCompatibilityRoutes(app);  // 220 Compatibility Matrix
  registerHalalDatingRoutes(app);    // 221 Halal Dating Timeline
  registerMatchmakerRoutes(app);     // 222 Community Matchmaker
  registerAzanRoutes(app);           // 223 Azan Auto-Mute
  registerZakatRoutes(app);          // 224 Digital Zakat Calculator
  registerVenueRoutes(app);          // 225 Religious Venue Live Status
  registerQuranCircleRoutes(app);    // 226 Quran/Hadith Circle Voice Rooms
  registerReligiousEventsRoutes(app); // 227 Religious Event Coordination

  // === Batch B15 — Travel, Transport & Logistics (228–235) ===
  registerTravelRoutes(app);          // 228 Travel Buddy + 229 Hidden Gems + 230 Group Trips
  registerCarpoolRoutes(app);         // 231 Carpool Lane + 232 Bike Pooling
  registerCNGFareRoutes(app);         // 233 CNG Fare Negotiator
  registerParkingRoutes(app);         // 234 Parking Sharing + 235 Traffic Witness

  // === Batch B16 — Frontier Tech & Interoperability (236–243) ===
  registerFediverseRoutes(app);       // 236 ActivityPub / Fediverse Bridge
  registerZKKYCRoutes(app);           // 237 Zero-Knowledge KYC
  registerHardwareWalletRoutes(app);  // 238 Hardware Wallet Integration
  registerSatelliteRoutes(app);       // 239 Satellite Connectivity Fallback
  registerQuantumCryptoRoutes(app);   // 240 Quantum-Resistant Cryptography
  registerFederatedLearningRoutes(app); // 241 Federated Learning Node
  registerWatermarkRoutes(app);       // 242 Synthetic Media Watermarking
  registerRedTeamRoutes(app);         // 243 Red-Team Challenge Platform

  // === Batch B17 — Social & Cognitive Additions (244–248) ===
  registerPersonaRoutes(app);         // 244 Contextual Personas
  registerMoodFeedRoutes(app);        // 245 Mood Feed
  registerDeepDiveRoutes(app);        // 246 Deep Dive Mode (Topic Hubs)
  registerSkillExchangeRoutes(app);   // 247 Skill Exchange Network
  registerAlumniRoutes(app);          // 248 Alumni Network Bridge

  // === Batch B18 — Gap-closure: requested features with no prior coverage ===
  registerLiveReporterRoutes(app);       // 120 Proof-of-Location Verified Live badge
  registerSafetyShortsRoutes(app);       // 126 Self-Defense Tutorial Shorts
  registerEvacuationRoutes(app);         // 128 Cyclone Evacuation Route Optimizer
  registerCommunityKitchenRoutes(app);   // 129 Disaster Community Kitchens

  // === Batch B19 — Ocean Pack (2026 missing-features build) ===
  registerRelationshipTimelineRoutes(app); // Relationship Timeline API (profile tab)
  registerSplitBillRoutes(app);            // Split Bill in Chat (/split)
  registerVoiceSummaryRoutes(app);         // Voice Note Summarizer
  registerStudyRoomsRoutes(app);           // Study / Focus Rooms with Pomodoro
  registerEventGroupsRoutes(app);          // Self-Destructing Event Groups
  registerMarketplaceRoutes(app);          // Hyperlocal Marketplace (distance-sorted)
  registerOceanPayRoutes(app);             // Ocean Pay P2P coin transfer
  registerDigitalLegacyRoutes(app);        // Digital Legacy & Memorial Pages
  registerNearbyDonorNotifyRoutes(app);    // Nearby Blood Donor Match + notify
  registerMissingFaceSearchRoutes(app);    // Missing Person Visual/Facial Match (130)
  registerProximityAlertRoutes(app);       // Anti-Stalking Proximity Alert (136)

  // === Batch B20 — Ocean 2026: Retention, Monetization & Pro Tools (249–260) ===
  registerStoriesRoutes(app);                  // 249 Stories 2.0 (24h ephemeral + polls/Q&A/music)
  registerVideoEditorRoutes(app);              // 250/251/257 Ocean Cut editors (subtitles, enhance, templates)
  registerLiveEcosystemRoutes(app);            // 252 Live Gifts + Live Ecosystem
  registerMiniAppsRoutes(app);                 // 253 Mini Apps Platform
  registerCommunitiesProRoutes(app);           // 254 Communities Pro
  registerCreatorMonetizationRoutes(app);      // 255 Creator Monetization Engine
  registerProGraphRoutes(app);                 // 256 Pro Graph
  // 257 Creation Lab — client-side (green screen / duet / beat sync), uses #250 backend
  registerSnapMapRoutes(app);                  // 258 Ocean Map + Snap
  registerOSLayerRoutes(app);                  // 259 Ocean OS Layer
  registerDataBrainRoutes(app);                // 260 Ocean Data + AI Brain

  // === Batch B21 — Wired engines (previously unwired modules) ===
  registerTrendingTopicRoutes(app);            // 59 Trending Topics — /api/trends/hashtags
  registerSmartSearchRoutes(app);              // 58 Smart Search — /api/search/smart
  registerLongFormVideoRoutes(app);            // 61 Long-form video — /api/channels/:id/videos/:videoId/*
}

