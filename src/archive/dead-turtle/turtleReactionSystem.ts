/**
 * Turtle Social Media Application - Core Reaction & Interactive Engagement Engine
 * 
 * This file contains the complete, production-ready non-UI type definitions, validation schemas,
 * rate limit counters, atomic database transition strategies, and safety rules for the reaction engine.
 * 
 * -----------------------------------------------------------------------------------------
 * CORE REACTION RULES:
 * 1. Exactly 5 minimal emoji reactions are supported (Like 👍, Love ❤️, Laugh 😂, Wow 😮, Sad 😢).
 * 2. High-performance caching counters exist for likes, dislikes, and total reactions.
 * 3. Users can add, switch, or remove their active reaction at any time.
 * 4. Mutual exclusion prevents a user from simultaneously Liking and Disliking the same post.
 * 5. Multi-level spam prevention is implemented using a rolling sliding window rate-limiter.
 * -----------------------------------------------------------------------------------------
 */

// ==========================================
// 1. REACTION TYPES & RULES DEFINITION
// ==========================================

export type EmojiReactionType = 
  | "LIKE"      // 👍
  | "LOVE"      // ❤️
  | "LAUGH"     // 😂
  | "WOW"       // 😮
  | "SAD";      // 😢

export const MINIMAL_EMOJI_REACTIONS: Record<EmojiReactionType, { emoji: string; label: string }> = {
  LIKE: { emoji: "👍", label: "Like" },
  LOVE: { emoji: "❤️", label: "Love" },
  LAUGH: { emoji: "😂", label: "Laugh" },
  WOW: { emoji: "😮", label: "Wow" },
  SAD: { emoji: "😢", label: "Sad" }
} as const;

export interface PostReactionRecord {
  id: string;
  postId: string;
  userId: string;
  reaction: EmojiReactionType;
  createdAt: Date;
}

export interface PostDislikeRecord {
  postId: string;
  userId: string;
  createdAt: Date;
}

// Caching structure kept on posts table for lightning-fast feed lists
export interface ReactionCounters {
  likeCount: number;
  dislikeCount: number;
  totalReactionCount: number;
  reactionBreakdown: Record<EmojiReactionType, number>;
}

// ==========================================
// 2. ANTI-SPAM & RATE LIMITS
// ==========================================

const REACTION_LIMIT_WINDOW_MS = 60 * 1000; // 1-minute window
const MAX_REACTIONS_PER_WINDOW = 15; // Limit rapid clicking / automated scripting bots

export interface ReactionTracker {
  userId: string;
  timestamps: number[];
}

/**
 * Validates reaction rate limits for anti-spam enforcement
 */
export function isReactionRateLimited(tracker: ReactionTracker, nowMs: number): { limited: boolean; remainingSec: number } {
  // Discard older timestamps outside the active window
  const activeTimestamps = tracker.timestamps.filter(ts => (nowMs - ts) < REACTION_LIMIT_WINDOW_MS);
  
  if (activeTimestamps.length >= MAX_REACTIONS_PER_WINDOW) {
    const oldestInWindow = activeTimestamps[0];
    const remainingMs = REACTION_LIMIT_WINDOW_MS - (nowMs - oldestInWindow);
    return { limited: true, remainingSec: Math.ceil(remainingMs / 1000) };
  }

  return { limited: false, remainingSec: 0 };
}

// ==========================================
// 3. ATOMIC COUNT UPDATE STRATEGY
// ==========================================

export interface ReactionStateTransition {
  postId: string;
  userId: string;
  
  // Current states before applying action
  currentReaction: EmojiReactionType | null;
  isCurrentlyDisliked: boolean;
}

export interface StateTransitionResult {
  success: boolean;
  error?: string;
  
  // Instructions on what row changes need to be made in database
  action: "INSERT" | "DELETE" | "UPDATE" | "NO_CHANGE";
  dbTargetReaction: EmojiReactionType | null;
  dbDislikeState: boolean;

  // Counter updates (deltas) to execute atomically
  likeDelta: number;
  dislikeDelta: number;
  reactionDelta: number;
  breakdownDeltas: Record<EmojiReactionType, number>;
}

/**
 * Functional engine calculating precise state changes for Reactions and Dislikes.
 * Enforces mutual exclusion: A post cannot be simultaneously Liked and Disliked by the same user.
 */
export function handleReactionAction(
  transition: ReactionStateTransition,
  actionType: "ADD_REACTION" | "REMOVE_REACTION" | "TOGGLE_DISLIKE",
  targetReaction: EmojiReactionType | null,
  rateLimitTracker: ReactionTracker
): StateTransitionResult {
  
  const now = Date.now();
  const limitCheck = isReactionRateLimited(rateLimitTracker, now);
  if (limitCheck.limited) {
    return {
      success: false,
      error: `Too many actions. Please wait ${limitCheck.remainingSec} seconds before interacting again.`,
      action: "NO_CHANGE",
      dbTargetReaction: transition.currentReaction,
      dbDislikeState: transition.isCurrentlyDisliked,
      likeDelta: 0,
      dislikeDelta: 0,
      reactionDelta: 0,
      breakdownDeltas: { LIKE: 0, LOVE: 0, LAUGH: 0, WOW: 0, SAD: 0 }
    };
  }

  // Track the timestamp of active interaction
  rateLimitTracker.timestamps.push(now);

  const breakdownDeltas: Record<EmojiReactionType, number> = {
    LIKE: 0, LOVE: 0, LAUGH: 0, WOW: 0, SAD: 0
  };

  let likeDelta = 0;
  let dislikeDelta = 0;
  let reactionDelta = 0;

  // -------------------------------------------------------------
  // ACTION: TOGGLE DISLIKE
  // -------------------------------------------------------------
  if (actionType === "TOGGLE_DISLIKE") {
    if (transition.isCurrentlyDisliked) {
      // Untoggle dislike
      dislikeDelta = -1;
      return {
        success: true,
        action: "DELETE",
        dbTargetReaction: transition.currentReaction,
        dbDislikeState: false,
        likeDelta,
        dislikeDelta,
        reactionDelta,
        breakdownDeltas
      };
    } else {
      // Toggle dislike ON. If currently reacted, we must clear that reaction!
      dislikeDelta = 1;
      if (transition.currentReaction) {
        reactionDelta = -1;
        breakdownDeltas[transition.currentReaction] = -1;
        if (transition.currentReaction === "LIKE") {
          likeDelta = -1;
        }
      }
      return {
        success: true,
        action: "INSERT", // Insert record in post_dislikes table
        dbTargetReaction: null, // Reaction cleared due to dislike mutual-exclusion
        dbDislikeState: true,
        likeDelta,
        dislikeDelta,
        reactionDelta,
        breakdownDeltas
      };
    }
  }

  // -------------------------------------------------------------
  // ACTION: REMOVE REACTION
  // -------------------------------------------------------------
  if (actionType === "REMOVE_REACTION") {
    if (!transition.currentReaction) {
      return {
        success: true,
        action: "NO_CHANGE",
        dbTargetReaction: null,
        dbDislikeState: transition.isCurrentlyDisliked,
        likeDelta,
        dislikeDelta,
        reactionDelta,
        breakdownDeltas
      };
    }

    reactionDelta = -1;
    breakdownDeltas[transition.currentReaction] = -1;
    if (transition.currentReaction === "LIKE") {
      likeDelta = -1;
    }

    return {
      success: true,
      action: "DELETE",
      dbTargetReaction: null,
      dbDislikeState: transition.isCurrentlyDisliked,
      likeDelta,
      dislikeDelta,
      reactionDelta,
      breakdownDeltas
    };
  }

  // -------------------------------------------------------------
  // ACTION: ADD / SWITCH REACTION
  // -------------------------------------------------------------
  if (actionType === "ADD_REACTION") {
    if (!targetReaction) {
      return {
        success: false,
        error: "Target reaction must be specified when adding a reaction.",
        action: "NO_CHANGE",
        dbTargetReaction: transition.currentReaction,
        dbDislikeState: transition.isCurrentlyDisliked,
        likeDelta,
        dislikeDelta,
        reactionDelta,
        breakdownDeltas
      };
    }

    // Case A: User has NO active reaction
    if (!transition.currentReaction) {
      reactionDelta = 1;
      breakdownDeltas[targetReaction] = 1;
      if (targetReaction === "LIKE") {
        likeDelta = 1;
      }

      // If user had a Dislike active, clear it due to mutual exclusion rules
      if (transition.isCurrentlyDisliked) {
        dislikeDelta = -1;
      }

      return {
        success: true,
        action: "INSERT",
        dbTargetReaction: targetReaction,
        dbDislikeState: false, // Dislike is cleared
        likeDelta,
        dislikeDelta,
        reactionDelta,
        breakdownDeltas
      };
    }

    // Case B: User has an active reaction of the EXACT SAME type (toggles off)
    if (transition.currentReaction === targetReaction) {
      reactionDelta = -1;
      breakdownDeltas[targetReaction] = -1;
      if (targetReaction === "LIKE") {
        likeDelta = -1;
      }

      return {
        success: true,
        action: "DELETE",
        dbTargetReaction: null,
        dbDislikeState: transition.isCurrentlyDisliked,
        likeDelta,
        dislikeDelta,
        reactionDelta,
        breakdownDeltas
      };
    }

    // Case C: User is SWITCHING to a different reaction type
    reactionDelta = 0; // Total count stays same
    breakdownDeltas[transition.currentReaction] = -1; // Decrement old
    breakdownDeltas[targetReaction] = 1; // Increment new

    if (transition.currentReaction === "LIKE") likeDelta = -1;
    if (targetReaction === "LIKE") likeDelta = 1;

    // Dislike cleared if it was somehow active
    if (transition.isCurrentlyDisliked) {
      dislikeDelta = -1;
    }

    return {
      success: true,
      action: "UPDATE",
      dbTargetReaction: targetReaction,
      dbDislikeState: false,
      likeDelta,
      dislikeDelta,
      reactionDelta,
      breakdownDeltas
    };
  }

  return {
    success: false,
    error: "Invalid transition action parsed.",
    action: "NO_CHANGE",
    dbTargetReaction: transition.currentReaction,
    dbDislikeState: transition.isCurrentlyDisliked,
    likeDelta,
    dislikeDelta,
    reactionDelta,
    breakdownDeltas
  };
}

// ============================================================================
// 4. SUPABASE PERSISTENCE HANDLERS (Database CRUD Simulation)
// ============================================================================

/**
 * Persists calculated reaction delta values to Supabase database.
 * Done as database increment updates to prevent read-modify-write count overrides.
 */
export async function persistReactionToSupabase(
  supabaseClient: any,
  postId: string,
  userId: string,
  transitionResult: StateTransitionResult
): Promise<{ success: boolean; error?: string }> {
  
  if (!transitionResult.success) {
    return { success: false, error: transitionResult.error };
  }

  try {
    // 1. Update reaction record
    if (transitionResult.action === "INSERT" && transitionResult.dbTargetReaction) {
      await supabaseClient
        .from("post_emoji_reactions")
        .upsert({
          post_id: postId,
          user_id: userId,
          reaction_type: transitionResult.dbTargetReaction
        });
    } else if (transitionResult.action === "DELETE") {
      await supabaseClient
        .from("post_emoji_reactions")
        .delete()
        .eq("post_id", postId)
        .eq("user_id", userId);
    } else if (transitionResult.action === "UPDATE" && transitionResult.dbTargetReaction) {
      await supabaseClient
        .from("post_emoji_reactions")
        .update({ reaction_type: transitionResult.dbTargetReaction })
        .eq("post_id", postId)
        .eq("user_id", userId);
    }

    // 2. Update dislike states
    if (transitionResult.dbDislikeState) {
      await supabaseClient
        .from("post_dislikes")
        .upsert({ post_id: postId, user_id: userId });
    } else {
      await supabaseClient
        .from("post_dislikes")
        .delete()
        .eq("post_id", postId)
        .eq("user_id", userId);
    }

    // 3. Atomically update post analytics counters
    const breakdownUpdates: Record<string, any> = {};
    for (const [reactionType, value] of Object.entries(transitionResult.breakdownDeltas)) {
      if (value !== 0) {
        breakdownUpdates[`breakdown_${reactionType.toLowerCase()}`] = value;
      }
    }

    // RPC functions run raw sql `count = count + delta` to avoid dirty reads
    await supabaseClient.rpc("update_post_reaction_counters", {
      p_post_id: postId,
      p_like_delta: transitionResult.likeDelta,
      p_dislike_delta: transitionResult.dislikeDelta,
      p_reaction_delta: transitionResult.reactionDelta,
      p_breakdown_deltas: breakdownUpdates
    });

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || "Internal database query exception." };
  }
}

// ============================================================================
// 5. POSTGRES REACTION SYSTEM DATABASE SCHEMAS
// ============================================================================
export const SQL_REACTION_MIGRATION = `
-- ============================================================================
-- REACTION ENGINE DATABASE SPECIFICATION & OPTIMIZATION INDEXING
-- ============================================================================

-- Primary emoji reaction tracking (Supports 👍, ❤️, 😂, 😮, 😢)
create table if not exists public.post_emoji_reactions (
    post_id uuid references public.posts(id) on delete cascade not null,
    user_id uuid references public.profiles(id) on delete cascade not null,
    reaction_type text not null,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    primary key (post_id, user_id),
    constraint check_emoji_types check (reaction_type in ('LIKE', 'LOVE', 'LAUGH', 'WOW', 'SAD'))
);

-- Dislikes tracking table
create table if not exists public.post_dislikes (
    post_id uuid references public.posts(id) on delete cascade not null,
    user_id uuid references public.profiles(id) on delete cascade not null,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    primary key (post_id, user_id)
);

-- Expand public.posts to cache atomic total and breakdown counts
alter table public.posts 
add column if not exists reaction_count integer default 0 not null check (reaction_count >= 0),
add column if not exists dislike_count integer default 0 not null check (dislike_count >= 0),
add column if not exists like_count integer default 0 not null check (like_count >= 0),
add column if not exists reaction_breakdown jsonb default '{"LIKE":0,"LOVE":0,"LAUGH":0,"WOW":0,"SAD":0}'::jsonb not null;

-- Indexing for performance
create index if not exists idx_emoji_reactions_user on public.post_emoji_reactions(user_id);
create index if not exists idx_emoji_dislikes_user on public.post_dislikes(user_id);

-- ==========================================
-- COALESCE ATOMIC COUNTER INCREMENTS SQL RPC
-- ==========================================
create or replace function public.update_post_reaction_counters(
    p_post_id uuid,
    p_like_delta integer,
    p_dislike_delta integer,
    p_reaction_delta integer,
    p_breakdown_deltas jsonb
)
returns void as $$
declare
    current_breakdown jsonb;
    key_name text;
    delta_val integer;
begin
    -- 1. Grab current breakdown state
    select reaction_breakdown into current_breakdown
    from public.posts where id = p_post_id;

    -- 2. Modify breakdown keys
    for key_name, delta_val in select * from jsonb_each_text(p_breakdown_deltas) loop
        current_breakdown := jsonb_set(
            current_breakdown, 
            array[upper(key_name)], 
            to_jsonb(coalesce((current_breakdown->>upper(key_name))::int, 0) + delta_val)
        );
    end loop;

    -- 3. Execute atomic count updates on target post
    update public.posts
    set 
        like_count = like_count + p_like_delta,
        dislike_count = dislike_count + p_dislike_delta,
        reaction_count = reaction_count + p_reaction_delta,
        reaction_breakdown = current_breakdown,
        updated_at = timezone('utc'::text, now())
    where id = p_post_id;
end;
$$ language plpgsql security definer;
`;
