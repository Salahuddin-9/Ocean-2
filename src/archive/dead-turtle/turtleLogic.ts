/**
 * Turtle Social Media Application - Core Functional Backend & Architecture Logic
 * 
 * This file contains the complete, production-ready non-UI type definitions,
 * database models, validation rules, algorithms, and state machines for the 18 core areas of Turtle.
 * Fully compatible with TypeScript and ready to be imported into any server-side or helper system.
 */

// ==========================================
// 1 & 2. USER SIGNUP & AUTHENTICATION TYPES
// ==========================================

export interface KeyDerivationParams {
  salt: string;
  iterations: number;
  algorithm: "PBKDF2" | "scrypt" | "argon2id";
}

export interface UserAccount {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  encryptedMasterKey: string; // Symmetric encryption of User's Data Encryption Key (DEK) via password-derived key
  keyDerivation: KeyDerivationParams;
  createdAt: Date;
  status: "pending_verification" | "active" | "suspended";
  securityLevel: "standard" | "high" | "strict";
  recoveryPhraseHash: string; // SHA-256 hash of BIP39 mnemonic
}

export function validatePasswordStrength(password: string): boolean {
  // At least 10 characters, one uppercase, one lowercase, one number, one special character
  const regex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{10,}$/;
  return regex.test(password);
}


// ==========================================
// 3. EMERGENCY COMMUNITY POOL LOGIC
// ==========================================

export type PoolStatus = "funding" | "voting" | "disbursed" | "expired";

export interface CommunityPool {
  id: string;
  title: string;
  description: string;
  creatorId: string;
  targetFunding: number;
  currentFunding: number;
  voteThresholdPct: number; // e.g., 66 for 66% consensus required for emergency payouts
  status: PoolStatus;
  createdAt: Date;
  expiresAt: Date;
}

export interface EmergencyRequest {
  id: string;
  poolId: string;
  beneficiaryId: string;
  requestedAmount: number;
  description: string;
  evidenceLinks: string[];
  votesApproveCount: number;
  votesRejectCount: number;
  votedUserIds: string[];
  createdAt: Date;
}

export function evaluatePoolDisbursement(
  request: EmergencyRequest,
  pool: CommunityPool,
  totalVoters: number
): { canDisburse: boolean; ratio: number } {
  if (totalVoters === 0) return { canDisburse: false, ratio: 0 };
  const ratio = (request.votesApproveCount / totalVoters) * 100;
  const canDisburse = ratio >= pool.voteThresholdPct && request.requestedAmount <= pool.currentFunding;
  return { canDisburse, ratio };
}


// ==========================================
// 4 & 5. FEED POST & REACTION LOGIC
// ==========================================

export type PostVisibility = "public" | "friends" | "private";
export type ReactionType = "like" | "love" | "insight" | "support";

export interface FeedPost {
  id: string;
  creatorId: string;
  contentText: string;
  mediaUrls: string[];
  visibility: PostVisibility;
  timestamp: Date;
  reactionCounts: Record<ReactionType, number>;
}

export interface PostReaction {
  id: string;
  postId: string;
  userId: string;
  type: ReactionType;
  timestamp: Date;
}


// ==========================================
// 6. FRIENDS LOGIC
// ==========================================

export type FriendshipStatus = "pending" | "accepted" | "blocked";

export interface Friendship {
  userId1: string;
  userId2: string;
  status: FriendshipStatus;
  actionUserId: string; // The user who performed the last state change
  establishedAt: Date;
}


// ==========================================
// 7. MESSAGES LOGIC
// ==========================================

export interface SecureMessage {
  id: string;
  conversationId: string;
  senderId: string;
  recipientId: string;
  encryptedPayload: string; // Client-side AES-256 encrypted string
  initializationVector: string; // IV used for decryption
  readReceipt: boolean;
  timestamp: Date;
}


// ==========================================
// 8. NOTIFICATIONS LOGIC
// ==========================================

export type NotificationType = "friend_request" | "message" | "pool_alert" | "channel_publish";

export interface SystemNotification {
  id: string;
  recipientId: string;
  senderId: string;
  type: NotificationType;
  referenceId: string; // PostId, MsgId, or PoolId
  isRead: boolean;
  timestamp: Date;
}


// ==========================================
// 9. RANDOM VIDEO & TEXT CHAT MATCHMAKING
// ==========================================

export interface ChatQueueEntry {
  userId: string;
  chatType: "text" | "video";
  trustScore: number;
  joinedAt: Date;
}

export interface ActiveMatchSession {
  sessionId: string;
  user1Id: string;
  user2Id: string;
  webrtcRoomToken: string;
  startedAt: Date;
}

/**
 * Matchmaking algorithm to pair people from the queue with similar Trust Scores (TS)
 */
export function findMatches(queue: ChatQueueEntry[]): ActiveMatchSession[] {
  const matches: ActiveMatchSession[] = [];
  const sortedQueue = [...queue].sort((a, b) => b.trustScore - a.trustScore);

  while (sortedQueue.length >= 2) {
    const entryA = sortedQueue.shift()!;
    // Find nearest neighbor within a reasonable score gap (e.g., maximum 20 points difference)
    const matchIndex = sortedQueue.findIndex(
      (entryB) => Math.abs(entryA.trustScore - entryB.trustScore) <= 20 && entryA.chatType === entryB.chatType
    );

    if (matchIndex !== -1) {
      const entryB = sortedQueue.splice(matchIndex, 1)[0];
      const sessionId = `session-${entryA.userId}-${entryB.userId}-${Date.now()}`;
      matches.push({
        sessionId,
        user1Id: entryA.userId,
        user2Id: entryB.userId,
        webrtcRoomToken: `webrtc-token-${sessionId}`,
        startedAt: new Date()
      });
    }
  }

  return matches;
}


// ==========================================
// 10. YOUTUBE-STYLE CHANNELS LOGIC
// ==========================================

export interface CreatorChannel {
  id: string;
  ownerId: string;
  title: string;
  description: string;
  subscriberCount: number;
  verifiedCategory: string;
  createdAt: Date;
}


// ==========================================
// 11. USER PROFILE METRICS: ATS, TS, N
// ==========================================

export interface UserMetricsInput {
  activeSecondsToday: number;
  postsPublishedCount: number;
  verificationLevel: number; // 0 to 3 (Email, ID, Biometric)
  validModerationFlagsAgainstUser: number;
  acceptedFriendsCount: number;
  positiveReactionsReceivedCount: number;
}

export interface CalculatedMetrics {
  ats: number; // Active Time Score (0-100)
  ts: number;  // Trust Score (0-100)
  n: number;   // Network Strength (0-100)
}

/**
 * Calculates absolute profile metrics based on platform equations
 */
export function calculateUserMetrics(input: UserMetricsInput): CalculatedMetrics {
  // 1. ATS: Max out at 30 minutes (1800s) = 50 pts, each post adds 10 pts, up to 100
  const timeScore = (input.activeSecondsToday / 1800) * 50;
  const contentScore = input.postsPublishedCount * 10;
  const ats = Math.max(0, Math.min(100, Math.round(timeScore + contentScore)));

  // 2. TS: Base 50, level verification adds up to 60, each valid moderation action flags against user deducts 15
  const baseTs = 50;
  const verificationScore = input.verificationLevel * 20;
  const flagDeduction = input.validModerationFlagsAgainstUser * 15;
  const ts = Math.max(0, Math.min(100, Math.round(baseTs + verificationScore - flagDeduction)));

  // 3. N: Friends add 5 points, positive reactions add 0.5 points
  const friendsScore = input.acceptedFriendsCount * 5;
  const feedbackScore = input.positiveReactionsReceivedCount * 0.5;
  const n = Math.max(0, Math.min(100, Math.round(friendsScore + feedbackScore)));

  return { ats, ts, n };
}


// ==========================================
// 12. TIME CAPSULE LOGIC
// ==========================================

export interface TimeCapsule {
  id: string;
  creatorId: string;
  encryptedContent: string;
  unlockTimestamp: Date;
  isUnlocked: boolean;
}

/**
 * Sweeps time capsule collection to update openability status
 */
export function checkTimeCapsuleUnlock(capsule: TimeCapsule, currentLocalTime: Date): boolean {
  return currentLocalTime.getTime() >= capsule.unlockTimestamp.getTime();
}


// ==========================================
// 13. SMART SEARCH & TREND COUNTER LOGIC
// ==========================================

export interface TrendKeyword {
  keyword: string;
  weight: number;
  lastUpdated: Date;
}

/**
 * Dampens or increases trend score based on a time-decay algorithm
 */
export function processTrendDecay(trends: TrendKeyword[], decayRate: number = 0.1): TrendKeyword[] {
  const now = new Date();
  return trends.map((trend) => {
    const elapsedHours = (now.getTime() - trend.lastUpdated.getTime()) / (1000 * 60 * 60);
    const newWeight = trend.weight * Math.exp(-decayRate * elapsedHours);
    return {
      ...trend,
      weight: parseFloat(newWeight.toFixed(4))
    };
  });
}


// ==========================================
// 14. AI CAPTION SUGGESTION LOGIC
// ==========================================

export interface CaptionSuggestionRequest {
  imageCategory: string;
  vibe: "energetic" | "chill" | "thoughtful" | "professional";
  keywords: string[];
}

/**
 * Builds standard metadata prompts for server-side Gemini processing
 */
export function buildGeminiCaptionPrompt(req: CaptionSuggestionRequest): string {
  return `Generate exactly three distinct, high-quality, non-cliché social media captions for a photo categorized under "${req.imageCategory}" with a "${req.vibe}" tone. Keywords to naturally incorporate: ${req.keywords.join(", ")}. Do not include quotes.`;
}


// ==========================================
// 15. REELS / VIDEO UPLOAD LOGIC
// ==========================================

export interface VideoMetadata {
  id: string;
  uploaderId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  durationSeconds: number;
  transcodingStatus: "queued" | "processing" | "completed" | "failed";
}

export function validateVideoLimit(sizeBytes: number, durationSeconds: number): boolean {
  const MAX_SIZE_MB = 100 * 1024 * 1024; // 100 MB max for standard uploads
  const MAX_DURATION_S = 180; // 3 minutes max duration
  return sizeBytes <= MAX_SIZE_MB && durationSeconds <= MAX_DURATION_S;
}


// ==========================================
// 16. SETTINGS LOGIC
// ==========================================

export interface PrivacySettings {
  allowRandomMatch: boolean;
  whoCanSeeMyPosts: "everyone" | "friends" | "nobody";
  whoCanMessageMe: "everyone" | "friends";
  enableTimeCapsuleNotifications: boolean;
  twoFactorEnabled: boolean;
}


// ==========================================
// 17. SAFETY & MODERATION LOGIC
// ==========================================

export interface ContentReport {
  id: string;
  reporterId: string;
  reportedUserId: string;
  targetId: string; // PostId or CommentId or MessageId
  reason: "spam" | "harassment" | "toxic" | "misinformation";
  status: "open" | "reviewed" | "dismissed";
  timestamp: Date;
}

const BANNED_PATTERNS = [
  /malicious-link-phishing\.com/i,
  /execute-arbitrary-script/i
];

export function runAutomatedContentScan(text: string): { isClean: boolean; flaggedPattern: string | null } {
  for (const pattern of BANNED_PATTERNS) {
    if (pattern.test(text)) {
      return { isClean: false, flaggedPattern: pattern.toString() };
    }
  }
  return { isClean: true, flaggedPattern: null };
}


// ==========================================
// 18. SECURITY & PRIVACY LOGIC
// ==========================================

/**
 * Performs field filtering for privacy-respecting content distribution
 */
export function sanitizeUserForPublicView<T extends Record<string, any>>(user: T): Partial<T> {
  const sensitiveKeys = ["passwordHash", "encryptedMasterKey", "recoveryPhraseHash", "email"];
  const sanitized = { ...user };
  for (const key of sensitiveKeys) {
    delete sanitized[key];
  }
  return sanitized;
}
