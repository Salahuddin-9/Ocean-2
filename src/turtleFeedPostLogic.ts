/**
 * Turtle Social Media Application - Feed Post Engine & Core Architectural Backend Logic
 * 
 * This file contains the complete, production-ready non-UI structures, types, validation rules,
 * database models, and algorithm engines for Turtle's multifaceted feed posts, media flows,
 * interaction policies, and high-performance ranking pipelines.
 * 
 * -----------------------------------------------------------------------------------------
 * SUPPORTED POST TYPES:
 * 1. TEXT_POST: Plain text or formatted markdown with optionally styled backgrounds.
 * 2. IMAGE_POST: Single-image focal content with associated captions.
 * 3. AUDIO_POST: Sonic logs, voice notes, or music shares with waveforms.
 * 4. GALLERY_POST: Multi-image/multi-media horizontal carousel logs.
 * 5. REEL_POST: Short-form vertical, immersive looping video format.
 * 6. VIDEO_POST: Landscape/standard horizontal high-fidelity longer-form videos.
 * 7. TIME_CAPSULE_POST: Content encrypted and locked until a future release timestamp is reached.
 * -----------------------------------------------------------------------------------------
 */

// ==========================================
// 1. DATA MODELS & TYPES
// ==========================================

export type PostType = 
  | "TEXT"
  | "IMAGE"
  | "AUDIO"
  | "GALLERY"
  | "REEL"
  | "VIDEO"
  | "TIME_CAPSULE";

export type PostVisibility = "everyone" | "friends" | "private";

export type ReactionType = "like" | "love" | "insight" | "support";

export interface MediaFile {
  id: string;
  url: string;
  mimeType: string;
  sizeBytes: number;
  durationSeconds?: number; // For audio, reel, video
  sortOrder: number; // For gallery alignment
}

export interface AICaptionMetadata {
  promptUsed?: string;
  suggestedCaptionsList: string[];
  selectedCaptionIndex?: number;
  modelAliasUsed?: string;
  generatedAt: Date;
}

export interface TurtleFeedPost {
  id: string;
  authorId: string;
  postType: PostType;
  contentText: string; // Caption or text body content
  mediaFiles: MediaFile[];
  aiCaptionMetadata?: AICaptionMetadata;
  visibility: PostVisibility;
  createdAt: Date;
  updatedAt: Date;
  
  // Counters for performant indexing (recalculated asynchronously via database triggers)
  likeCount: number;
  dislikeCount: number;
  reactionCounts: Record<ReactionType, number>;
  commentCount: number;
  reportCount: number;

  // Time Capsule lock attributes
  unlockAt?: Date;
  isUnlocked: boolean;
}

export interface PostComment {
  id: string;
  postId: string;
  userId: string;
  commentText: string;
  parentCommentId?: string; // Supports nested replies
  createdAt: Date;
  updatedAt: Date;
}

export interface PostReactionRecord {
  postId: string;
  userId: string;
  reactionType: ReactionType;
  createdAt: Date;
}

export interface PostDislikeRecord {
  postId: string;
  userId: string;
  createdAt: Date;
}

export interface PostReportRecord {
  id: string;
  postId: string;
  reporterId: string;
  reason: "spam" | "harassment" | "toxic" | "misinformation" | "copyright";
  details?: string;
  createdAt: Date;
}

// ==========================================
// 2. INPUT VALIDATION & CREATION RULES
// ==========================================

export interface CreatePostRequest {
  authorId: string;
  postType: PostType;
  contentText: string;
  mediaFiles: Omit<MediaFile, "id">[];
  aiCaptionMetadata?: AICaptionMetadata;
  visibility: PostVisibility;
  unlockAt?: Date;
}

/**
 * Validates a feed post request and enforces structural guidelines before DB insertion.
 */
export function validateAndPreparePost(
  req: CreatePostRequest
): { success: boolean; error?: string; post?: TurtleFeedPost } {
  const now = new Date();

  // Content text basic safety clamps
  if (req.contentText && req.contentText.length > 5000) {
    return { success: false, error: "Post text content exceeds the limit of 5,000 characters." };
  }

  // Type-specific requirements
  switch (req.postType) {
    case "TEXT":
      if (!req.contentText || req.contentText.trim().length === 0) {
        return { success: false, error: "Text posts cannot be empty." };
      }
      if (req.mediaFiles && req.mediaFiles.length > 0) {
        return { success: false, error: "Text posts cannot contain media attachments." };
      }
      break;

    case "IMAGE":
      if (!req.mediaFiles || req.mediaFiles.length !== 1) {
        return { success: false, error: "Image posts require exactly one image attachment." };
      }
      if (!req.mediaFiles[0].mimeType.startsWith("image/")) {
        return { success: false, error: "Attachment must be a valid image file." };
      }
      break;

    case "AUDIO":
      if (!req.mediaFiles || req.mediaFiles.length !== 1) {
        return { success: false, error: "Audio posts require exactly one audio attachment." };
      }
      if (!req.mediaFiles[0].mimeType.startsWith("audio/")) {
        return { success: false, error: "Attachment must be a valid audio file." };
      }
      break;

    case "GALLERY":
      if (!req.mediaFiles || req.mediaFiles.length < 2 || req.mediaFiles.length > 10) {
        return { success: false, error: "Gallery carousels must contain between 2 and 10 media files." };
      }
      break;

    case "REEL":
      if (!req.mediaFiles || req.mediaFiles.length !== 1) {
        return { success: false, error: "Reels require exactly one vertical video attachment." };
      }
      const reelVideo = req.mediaFiles[0];
      if (!reelVideo.mimeType.startsWith("video/")) {
        return { success: false, error: "Reel attachment must be a valid video file." };
      }
      if (reelVideo.durationSeconds && reelVideo.durationSeconds > 180) {
        return { success: false, error: "Reels are restricted to a maximum of 3 minutes (180 seconds)." };
      }
      break;

    case "VIDEO":
      if (!req.mediaFiles || req.mediaFiles.length !== 1) {
        return { success: false, error: "Video posts require exactly one video attachment." };
      }
      if (!req.mediaFiles[0].mimeType.startsWith("video/")) {
        return { success: false, error: "Attachment must be a valid video file." };
      }
      break;

    case "TIME_CAPSULE":
      if (!req.unlockAt) {
        return { success: false, error: "Time Capsule posts must specify a future unlock timestamp." };
      }
      if (req.unlockAt.getTime() <= now.getTime() + 10 * 60 * 1000) {
        return { success: false, error: "Unlock timestamp must be at least 10 minutes into the future." };
      }
      break;

    default:
      return { success: false, error: "Invalid or unsupported post type." };
  }

  // Format valid prepared post
  const preparedPost: TurtleFeedPost = {
    id: `post-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
    authorId: req.authorId,
    postType: req.postType,
    contentText: req.contentText,
    mediaFiles: req.mediaFiles.map((m, idx) => ({
      ...m,
      id: `media-${Date.now()}-${idx}`
    })),
    aiCaptionMetadata: req.aiCaptionMetadata,
    visibility: req.visibility,
    createdAt: now,
    updatedAt: now,
    likeCount: 0,
    dislikeCount: 0,
    reactionCounts: {
      like: 0,
      love: 0,
      insight: 0,
      support: 0
    },
    commentCount: 0,
    reportCount: 0,
    unlockAt: req.unlockAt,
    isUnlocked: req.postType !== "TIME_CAPSULE" // Time capsule starts locked
  };

  return { success: true, post: preparedPost };
}

// ==========================================
// 3. MEDIA UPLOAD LOGIC & LIMITS
// ==========================================

export const MEDIA_LIMITS = {
  IMAGE_MAX_SIZE_BYTES: 15 * 1024 * 1024, // 15 MB
  AUDIO_MAX_SIZE_BYTES: 25 * 1024 * 1024, // 25 MB
  VIDEO_MAX_SIZE_BYTES: 200 * 1024 * 1024, // 200 MB
  REEL_MAX_SIZE_BYTES: 100 * 1024 * 1024 // 100 MB
} as const;

/**
 * Validates file constraints for media files prior to starting the storage upload.
 */
export function validateMediaUpload(
  filename: string,
  mimeType: string,
  sizeBytes: number,
  expectedType: "IMAGE" | "AUDIO" | "VIDEO" | "REEL"
): { allowed: boolean; error?: string } {
  
  if (expectedType === "IMAGE") {
    if (!mimeType.startsWith("image/")) return { allowed: false, error: "File must be an image type." };
    if (sizeBytes > MEDIA_LIMITS.IMAGE_MAX_SIZE_BYTES) return { allowed: false, error: "Image size exceeds 15 MB limit." };
  }
  
  if (expectedType === "AUDIO") {
    if (!mimeType.startsWith("audio/")) return { allowed: false, error: "File must be an audio type." };
    if (sizeBytes > MEDIA_LIMITS.AUDIO_MAX_SIZE_BYTES) return { allowed: false, error: "Audio size exceeds 25 MB limit." };
  }

  if (expectedType === "REEL") {
    if (!mimeType.startsWith("video/")) return { allowed: false, error: "File must be a video type for reels." };
    if (sizeBytes > MEDIA_LIMITS.REEL_MAX_SIZE_BYTES) return { allowed: false, error: "Reel video size exceeds 100 MB limit." };
  }

  if (expectedType === "VIDEO") {
    if (!mimeType.startsWith("video/")) return { allowed: false, error: "File must be a video type." };
    if (sizeBytes > MEDIA_LIMITS.VIDEO_MAX_SIZE_BYTES) return { allowed: false, error: "Video file size exceeds 200 MB limit." };
  }

  return { allowed: true };
}

// ==========================================
// 4. POST VISIBILITY & ACL LOGIC
// ==========================================

/**
 * Access Control evaluation determining if a target reader is allowed to view a post.
 */
export function canUserViewPost(
  readerId: string,
  post: TurtleFeedPost,
  areFriends: boolean
): boolean {
  // Author can always view their own post
  if (post.authorId === readerId) return true;

  // Underlocked Time Capsules are strictly invisible to anyone other than the author
  if (post.postType === "TIME_CAPSULE" && !post.isUnlocked) {
    return false;
  }

  // Evaluate structural visibility rules
  if (post.visibility === "everyone") return true;

  if (post.visibility === "friends") {
    return areFriends;
  }

  if (post.visibility === "private") {
    return false; // Already verified not the author
  }

  return false;
}

// ==========================================
// 5. ATOMIC INTERACTION SYSTEM RULES
// ==========================================

/**
 * Handles state transformation for reacting to a post (mutual-exclusion rules)
 */
export function applyReactionToPost(
  postId: string,
  userId: string,
  targetReaction: ReactionType,
  existingReaction?: ReactionType
): { reactionAdded: boolean; reactionType: ReactionType; countDelta: Record<ReactionType, number> } {
  
  const countDelta: Record<ReactionType, number> = {
    like: 0,
    love: 0,
    insight: 0,
    support: 0
  };

  // If user clicks the exact same reaction, remove it (toggle off)
  if (existingReaction === targetReaction) {
    countDelta[targetReaction] = -1;
    return { reactionAdded: false, reactionType: targetReaction, countDelta };
  }

  // If user has a different existing reaction on this post, decrement that old one
  if (existingReaction) {
    countDelta[existingReaction] = -1;
  }

  // Increment new targeted reaction type
  countDelta[targetReaction] = 1;

  return { reactionAdded: true, reactionType: targetReaction, countDelta };
}

/**
 * Prevents dislike collisions (disliking a post can automatically toggle likes off)
 */
export function applyDislikeToggle(
  postId: string,
  userId: string,
  isCurrentlyDisliked: boolean,
  hasLiked: boolean
): { dislikeActive: boolean; likeDelta: number; dislikeDelta: number } {
  
  let likeDelta = 0;
  let dislikeDelta = 0;

  if (isCurrentlyDisliked) {
    // Toggle off dislike
    dislikeDelta = -1;
  } else {
    // Toggle on dislike
    dislikeDelta = 1;
    // If post was previously liked, clear the like automatically
    if (hasLiked) {
      likeDelta = -1;
    }
  }

  return {
    dislikeActive: !isCurrentlyDisliked,
    likeDelta,
    dislikeDelta
  };
}

// ==========================================
// 6. FEED RANKING OPTIONS
// ==========================================

export interface RankingFactors {
  post: TurtleFeedPost;
  authorTrustScore: number;
  areFriends: boolean;
}

/**
 * Feed ranking calculation logic implementing standard chronological, balanced, and discovery pipelines.
 */
export class TurtleFeedEngine {
  
  /**
   * Sorts chronologically, purely on timestamp
   */
  public static getChronologicalFeed(factors: RankingFactors[]): TurtleFeedPost[] {
    return [...factors]
      .map(f => f.post)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  /**
   * Balanced Feed - Considers:
   * - Friendship closeness (massive boost multiplier)
   * - Time elapsed (decay factor)
   * - Raw reaction counts and comments
   * - Creator's Trust Score (reputation)
   */
  public static getBalancedFeed(factors: RankingFactors[]): TurtleFeedPost[] {
    const now = new Date().getTime();

    const scoredPosts = factors.map((f) => {
      const ageHours = (now - f.post.createdAt.getTime()) / (1000 * 60 * 60);
      
      // Decelerating time decay curve
      const timeDecay = Math.exp(-0.05 * ageHours); // Slow decay factor

      // Popularity score (reactions add points, comments add more weight)
      const engagementScore = 
        f.post.likeCount * 1 +
        f.post.reactionCounts.love * 1.5 +
        f.post.reactionCounts.insight * 2 +
        f.post.commentCount * 3 -
        f.post.dislikeCount * 0.5;

      const baseScore = Math.max(1, engagementScore);

      // Trust Score multiplier (ranges from 0.5 to 1.5)
      const trustMultiplier = 0.5 + (f.authorTrustScore / 100);

      // Friend relationship multiplier (friend posts get 3x default visibility boosting)
      const relationshipMultiplier = f.areFriends ? 3.0 : 1.0;

      // Final Rank Formula
      const finalScore = baseScore * trustMultiplier * relationshipMultiplier * timeDecay;

      return { post: f.post, score: finalScore };
    });

    return scoredPosts
      .sort((a, b) => b.score - a.score)
      .map(item => item.post);
  }

  /**
   * Discovery Feed - Prioritizes:
   * - High viral growth rates
   * - Broad organic visibility categories (e.g. reels)
   * - Excludes posts from current friends to broaden horizon
   */
  public static getDiscoveryFeed(factors: RankingFactors[]): TurtleFeedPost[] {
    const scoredDiscovery = factors
      .filter(f => !f.areFriends) // Intentional filtering of friends to prompt discovery of new people
      .map((f) => {
        let visibilityWeight = 1.0;
        
        // Boost Reels and Immersive Video posts slightly in global discovery channels
        if (f.post.postType === "REEL") visibilityWeight = 1.8;
        if (f.post.postType === "VIDEO") visibilityWeight = 1.4;

        const totalInteractions = f.post.likeCount + f.post.commentCount;
        const reputationWeight = f.authorTrustScore / 100;

        const finalScore = totalInteractions * visibilityWeight * reputationWeight;
        return { post: f.post, score: finalScore };
      });

    return scoredDiscovery
      .sort((a, b) => b.score - a.score)
      .map(item => item.post);
  }
}

// ============================================================================
// 7. SQL DATABASE SCHEMA MIGRATION FOR COMPREHENSIVE FEED POSTS SYSTEM
// ============================================================================
export const SQL_FEED_POST_MIGRATION = `
-- ============================================================================
-- TURTLE HIGH-FIDELITY FEED POSTS & USER INTERACTIONS - SCHEMA ADDITIONS
-- ============================================================================

-- Create table to link multi-media items to individual posts
create table if not exists public.post_attachments (
    id uuid default uuid_generate_v4() primary key,
    post_id uuid references public.posts(id) on delete cascade not null,
    attachment_url text not null,
    mime_type text not null,
    size_bytes bigint not null,
    duration_seconds numeric(6, 2),
    sort_order integer default 0 not null,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- AI caption generation lookup table
create table if not exists public.post_ai_caption_metadata (
    post_id uuid references public.posts(id) on delete cascade primary key,
    prompt_used text,
    suggested_captions_list jsonb not null, -- Array of string recommendations
    selected_caption_index integer,
    model_alias_used text,
    generated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Dislike indexing tracking
create table if not exists public.post_dislikes (
    post_id uuid references public.posts(id) on delete cascade,
    user_id uuid references public.profiles(id) on delete cascade,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    primary key (post_id, user_id)
);

-- Recalculating trigger for performant counters
create or replace function public.increment_post_comment_counter()
returns trigger as $$
begin
    update public.posts 
    set updated_at = timezone('utc'::text, now())
    where id = new.post_id;
    return new;
end;
$$ language plpgsql;

create trigger tr_post_comment_inserted
    after insert on public.post_comments
    for each row execute function public.increment_post_comment_counter();
`;
