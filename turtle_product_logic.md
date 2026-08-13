# Turtle: Complete Non-UI Backend & Product Logic Specification

This document details the complete, production-ready system architecture, database schemas, validation rules, state machines, and implementation blueprints for **Turtle**, a next-generation high-fidelity social network. 

No client-side layout rules, styles, or UI aesthetics are defined here. This document serves as the absolute source of truth for the system engineers and API developers.

---

## 1. User Signup & Authentication Logic

### 1.1 Feature Explanation
The signup and authentication system prioritizes data privacy, cryptographic key derivation, and multi-factor recovery without relying on third-party SMS gateways. It uses standard client-side secure envelope encryption.

### 1.2 Data Needed
- **User Record (DB)**: `id`, `name`, `email`, `password_hash`, `salt`, `encrypted_master_key`, `key_derivation_params`, `created_at`, `status`
- **Mnemonic Security**: `recovery_hash` (derived from 12-word phrase), `security_level`

### 1.3 Backend Flow & API Actions
1. **POST `/api/auth/register`**:
   - Client sends `name`, `email`, `password_hash`, `salt`, and client-encrypted master key.
   - Server validates password complexity, hashes email for index uniqueness, and stores registration records.
   - Server generates a customized 12-word BIP39 mnemonic recovery phrase hash.
2. **POST `/api/auth/login`**:
   - Server returns user's specific salt and key derivation iterations.
   - Client derives password-encryption key, signs login payload, and server validates signature.
   - Returns a secure, short-lived JWT token.

### 1.4 Risk Points & Mitigation
- **Risk**: Missing master key on client.
- **Mitigation**: Prevent account finalization until client submits confirmation that recovery words are downloaded and local cryptographic key can decrypt/re-encrypt a test vector.

---

## 2. Emergency Community Pool Logic

### 2.1 Feature Explanation
A decentralized safety net where communities pool mutual-aid resources for localized emergencies (e.g., medical, disaster recovery) using verifiable smart thresholds.

### 2.2 Data Needed
- **CommunityPool**: `id`, `title`, `description`, `creator_id`, `target_funding`, `current_funding`, `vote_threshold_pct`, `status` (`funding` | `voting` | `disbursed` | `expired`)
- **EmergencyRequest**: `id`, `pool_id`, `beneficiary_id`, `requested_amount`, `description`, `evidence_links`
- **PoolVote**: `id`, `request_id`, `voter_id`, `vote` (`approve` | `reject`), `timestamp`

### 2.3 Backend Flow
1. **Creation**: Creator launches pool with defined threshold percentages (e.g., 66% support needed for disbursement).
2. **Emergency Request**: A user submits a disbursement claim with proof metrics.
3. **Voting Period**: Pool members cast cryptographic votes within a 24-hour window.
4. **Disbursement**: If the threshold is satisfied, the status shifts to `disbursed` and funds are transferred via the linked ledger.

---

## 3. Feed Post & Reaction Logic

### 3.1 Feature Explanation
The central post engine handles content generation with rich media attachments, multi-tiered nested reactions, and chronological distribution loops.

### 3.2 Data Needed
- **Post**: `id`, `creator_id`, `content_text`, `media_urls[]`, `visibility` (`public` | `friends` | `private`), `timestamp`
- **Reaction**: `id`, `post_id`, `user_id`, `type` (`like` | `love` | `insight` | `support`), `timestamp`

### 3.3 Backend Flow
1. **Publishing**: Content filter parses text for malicious URLs and compliance rules before creating post records.
2. **Reaction Toggle**:
   - Client issues reaction state payload.
   - Server performs atomic update (`upsert`) to prevent count desynchronization.

---

## 4. Friends & Messaging Logic

### 4.1 Feature Explanation
Bilateral friendship validation paired with secure direct message exchanges using encrypted queues.

### 4.2 Data Needed
- **Friendship**: `user_id_1`, `user_id_2`, `status` (`pending` | `accepted` | `blocked`), `established_at`
- **Message**: `id`, `conversation_id`, `sender_id`, `encrypted_payload`, `read_receipt` (boolean), `timestamp`

### 4.3 Backend Flow
- **Friend Request**: Server checks if blocked relation exists. If not, sets status to `pending`.
- **Message Send**: Validates friendship status. Delivers message via active WebSocket pipeline or persists in offline queue with push notification.

---

## 5. Notification & Channel Engine

### 5.1 Feature Explanation
Real-time push, in-app event registers, and YouTube-style channels for group publishing with modular subscription structures.

### 5.2 Data Needed
- **Channel**: `id`, `owner_id`, `title`, `description`, `subscriber_count`, `category`
- **Subscription**: `user_id`, `channel_id`, `notification_preference` (`all` | `mentions` | `none`)

### 5.3 Backend Flow
- **Channel Publish**: Triggers a background worker to fan-out notification logs to all active subscribers, prioritizing high-tier active users before batch-processing offline users.

---

## 6. Random Video & Text Chat (The Corridor)

### 6.1 Feature Explanation
An anonymous matchmaking pipeline that pairs users in real-time based on trust metrics and interest indicators.

### 6.2 Data Needed
- **MatchmakingQueue**: `user_id`, `chat_type` (`text` | `video`), `preferences` (JSON), `joined_at`
- **ActiveSession**: `session_id`, `user_1_id`, `user_2_id`, `webrtc_signaling_room`, `started_at`

### 6.3 Backend Flow
1. User requests matchmaking slot.
2. Scheduler performs an ELO-like pairing using Trust Scores (TS) and preferences to guarantee safety.
3. Once matched, server establishes a signaling gateway for direct peer-to-peer WebRTC connections.

---

## 7. Metrics & Profile Analytics (ATS, TS, N)

### 7.1 Feature Explanation
Autonomous profiles track three core health indicators to drive community dynamics:
- **ATS (Active Time Score)**: Score derived from authentic app engagement and production volume.
- **TS (Trust Score)**: Reputation index determined by account verification and flag ratios.
- **N (Network Strength)**: Quantitative rating of bidirectional social links and organic feedback loops.

### 7.2 Data Needed
- **MetricsRecord**: `user_id`, `active_seconds_today`, `verification_level` (0-3), `reports_filed_against_user`, `successful_moderation_actions`, `friend_count`

### 7.3 Core Calculation Algorithms (Mathematical Models)
$$\text{ATS} = \min\left(100, \frac{\text{ActiveSeconds}}{1800} \times 50 + \text{PostsPublished} \times 10\right)$$
$$\text{TS} = \max\left(0, \min\left(100, 50 + \text{VerifLevel} \times 20 - \text{ValidFlags} \times 15\right)\right)$$
$$\text{N} = \min\left(100, \text{AcceptedFriendships} \times 5 + \text{TotalPositiveReactions} \times 0.5\right)$$

---

## 8. Time Capsules & Reels

### 8.1 Feature Explanation
- **Time Capsules**: Delayed-release posts configured with future unlock timestamps.
- **Reels**: High-density vertical video clips cataloged for algorithmic recommendations.

### 8.2 Data Needed
- **TimeCapsule**: `id`, `creator_id`, `content_payload` (encrypted until unlock), `unlock_timestamp`, `is_unlocked` (boolean)
- **Reel**: `id`, `video_url`, `view_count`, `duration_seconds`, `transcoded_ready`

### 8.3 Backend Flow
- **Time Capsule Unlock Worker**: A recurring cron sweeps the collection every 60 seconds, comparing current local time to `unlock_timestamp` and setting `is_unlocked = true` when satisfied.

---

## 9. Search, AI Captions & Settings

### 9.1 Feature Explanation
Smart query structures combined with AI-powered context helpers using the Gemini API.

### 9.2 Data Needed
- **TrendCounter**: `keyword`, `count`, `last_updated`
- **GeminiConfig**: `model_alias`, `temperature`, `max_tokens`

### 9.3 Backend Flow
- **Trend Detection**: Queries parsing the main feed use a rolling token window, ranking word frequencies while filtering standard stop-words.
- **AI Captions**: Passes user-provided images or prompts to Gemini `gemini-2.5-flash` to return optimized textual descriptions and hashtags.

---

## 10. Security, Moderation, and Privacy Logic

### 10.1 Feature Explanation
Unified encryption, automated toxicity filters, reporting pipelines, and access controls.

### 10.2 Implementation Blueprints
- **Access Control List (ACL)**: All database read/write rules validate friendship state before returning personal user fields.
- **AI-Driven Moderation**: Content undergoes structural keyword scoring and safety checks prior to submission.
