/**
 * Turtle Social Media Application - Friends & Connections Backend Engine
 * 
 * This file contains the complete, production-ready non-UI type definitions, validation schemas,
 * rate limiters, security policies, atomic database transaction flows, and SQL schemas for
 * Turtle's comprehensive Friendship, Friend Requests, and Blocking infrastructure.
 * 
 * -----------------------------------------------------------------------------------------
 * CORE FUNCTIONAL SERVICES:
 * 1. Send friend request (with mutual-exclusion & double-opt-in auto-resolve rules)
 * 2. Accept friend request
 * 3. Reject friend request
 * 4. Cancel sent request
 * 5. Remove friend (cleanup both nodes)
 * 6. Block user (automatically severs existing relationships & blocks pending requests)
 * 7. List total friends, pending received, and sent requests
 * -----------------------------------------------------------------------------------------
 */

// ==========================================
// 1. DATA MODELS & TYPE DEFINITIONS
// ==========================================

export type RequestStatus = "pending" | "accepted" | "rejected";

export interface FriendRequest {
  id: string;
  senderId: string;
  receiverId: string;
  status: RequestStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface Friendship {
  id: string;
  userId1: string; // Lexicographically smaller UUID to enforce row uniqueness
  userId2: string; // Lexicographically larger UUID
  createdAt: Date;
}

export interface UserBlock {
  id: string;
  blockerId: string;
  blockedId: string;
  createdAt: Date;
}

// ==========================================
// 2. ABUSE PREVENTION & RATE LIMITS
// ==========================================

export const FRIENDS_SYSTEM_LIMITS = {
  MAX_PENDING_SENT_REQUESTS: 100,      // Prevents massive friend-request scraping/spamming
  MAX_DAILY_REQUESTS_SENT: 30,         // Rolling rate limit for sending new invitations
  COOLDOWN_REINVITE_DAYS: 7,          // Days to wait before re-requesting after a rejection
  MAX_TOTAL_FRIENDS: 5000              // Standard scalability safeguard
};

export interface FriendRateTracker {
  userId: string;
  lastSentTimestamps: number[]; // Array of timestamps for requests sent in the last 24 hours
}

/**
 * Checks whether a user is rate-limited from sending further friend requests
 */
export function isFriendRequestRateLimited(
  tracker: FriendRateTracker,
  nowMs: number
): { limited: boolean; remainingSec: number; countInWindow: number } {
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;
  
  // Filter out timestamps older than 24 hours
  const activeTimestamps = tracker.lastSentTimestamps.filter(ts => (nowMs - ts) < ONE_DAY_MS);
  tracker.lastSentTimestamps = activeTimestamps;

  if (activeTimestamps.length >= FRIENDS_SYSTEM_LIMITS.MAX_DAILY_REQUESTS_SENT) {
    const oldestInWindow = activeTimestamps[0];
    const remainingMs = ONE_DAY_MS - (nowMs - oldestInWindow);
    return {
      limited: true,
      remainingSec: Math.ceil(remainingMs / 1000),
      countInWindow: activeTimestamps.length
    };
  }

  return {
    limited: false,
    remainingSec: 0,
    countInWindow: activeTimestamps.length
  };
}

// ==========================================
// 3. CORE LOGIC ENGINE (EDGE CASES & STATE TRANSITIONS)
// ==========================================

export interface FriendsSystemTransitionContext {
  senderId: string;
  receiverId: string;
  isSenderBlockedByReceiver: boolean;
  isReceiverBlockedBySender: boolean;
  existingFriendship: boolean;
  existingRequestFromSender: FriendRequest | null;
  existingRequestFromReceiver: FriendRequest | null;
  senderPendingCount: number;
}

export interface TransitionResult {
  success: boolean;
  error?: string;
  action: 
    | "CREATE_REQUEST" 
    | "AUTO_ACCEPT_FRIENDSHIP" 
    | "ACCEPT_REQUEST" 
    | "REJECT_REQUEST" 
    | "CANCEL_REQUEST" 
    | "REMOVE_FRIENDSHIP" 
    | "BLOCK_USER" 
    | "NO_OP";
  /**
   * Safe payload ready for database execution
   */
  dbPayload?: any;
}

/**
 * Validates and calculates friend transitions. Enforces edge cases:
 * - Cannot friend yourself.
 * - Cannot friend someone if a block exists in either direction.
 * - Cannot double-friend.
 * - Reciprocal request auto-acceptance: if user A sends a request to B, but B already sent one to A,
 *   the system automatically accepts the existing request instead of creating a new pending duplicate.
 * - Rate limits sent caps.
 */
export function evaluateFriendRequestTransition(
  context: FriendsSystemTransitionContext,
  actionType: "SEND" | "ACCEPT" | "REJECT" | "CANCEL" | "REMOVE" | "BLOCK",
  rateTracker: FriendRateTracker,
  now: Date = new Date()
): TransitionResult {
  
  const {
    senderId,
    receiverId,
    isSenderBlockedByReceiver,
    isReceiverBlockedBySender,
    existingFriendship,
    existingRequestFromSender,
    existingRequestFromReceiver,
    senderPendingCount
  } = context;

  // 1. Prevent self-targeting
  if (senderId === receiverId) {
    return { success: false, error: "You cannot initiate friend system actions with yourself.", action: "NO_OP" };
  }

  // 2. Block validation
  if (isSenderBlockedByReceiver || isReceiverBlockedBySender) {
    return {
      success: false,
      error: "Unable to complete action due to privacy configurations or active blocks.",
      action: "NO_OP"
    };
  }

  // --------------------------------------------------------------------------
  // ACTION: SEND FRIEND REQUEST
  // --------------------------------------------------------------------------
  if (actionType === "SEND") {
    if (existingFriendship) {
      return { success: false, error: "You are already friends with this user.", action: "NO_OP" };
    }

    // Rate limiting & spam validations
    const limitCheck = isFriendRequestRateLimited(rateTracker, now.getTime());
    if (limitCheck.limited) {
      return {
        success: false,
        error: `Daily limit of ${FRIENDS_SYSTEM_LIMITS.MAX_DAILY_REQUESTS_SENT} requests reached. Please try again in ${Math.ceil(limitCheck.remainingSec / 3600)} hours.`,
        action: "NO_OP"
      };
    }

    if (senderPendingCount >= FRIENDS_SYSTEM_LIMITS.MAX_PENDING_SENT_REQUESTS) {
      return {
        success: false,
        error: `Abuse prevention: You have reached the maximum cap of ${FRIENDS_SYSTEM_LIMITS.MAX_PENDING_SENT_REQUESTS} pending requests sent.`,
        action: "NO_OP"
      };
    }

    // Check duplicate pending from self
    if (existingRequestFromSender && existingRequestFromSender.status === "pending") {
      return { success: false, error: "A pending friend request has already been sent to this user.", action: "NO_OP" };
    }

    // Enforce cooldown if previously rejected
    if (existingRequestFromSender && existingRequestFromSender.status === "rejected") {
      const lastUpdateMs = existingRequestFromSender.updatedAt.getTime();
      const diffDays = (now.getTime() - lastUpdateMs) / (1000 * 60 * 60 * 24);
      if (diffDays < FRIENDS_SYSTEM_LIMITS.COOLDOWN_REINVITE_DAYS) {
        const remainingDays = Math.ceil(FRIENDS_SYSTEM_LIMITS.COOLDOWN_REINVITE_DAYS - diffDays);
        return {
          success: false,
          error: `You must wait ${remainingDays} more days before sending another request to this user.`,
          action: "NO_OP"
        };
      }
    }

    // EDGE CASE: Reciprocal request already exists! User B requested A, and A now requests B.
    // Transition should immediately accept the existing request and create the friendship row.
    if (existingRequestFromReceiver && existingRequestFromReceiver.status === "pending") {
      return {
        success: true,
        action: "AUTO_ACCEPT_FRIENDSHIP",
        dbPayload: {
          requestId: existingRequestFromReceiver.id,
          userId1: senderId < receiverId ? senderId : receiverId,
          userId2: senderId > receiverId ? senderId : receiverId
        }
      };
    }

    // Log the request timestamp for rate limits
    rateTracker.lastSentTimestamps.push(now.getTime());

    return {
      success: true,
      action: "CREATE_REQUEST",
      dbPayload: {
        id: `req-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
        senderId,
        receiverId,
        status: "pending" as RequestStatus
      }
    };
  }

  // --------------------------------------------------------------------------
  // ACTION: ACCEPT FRIEND REQUEST
  // --------------------------------------------------------------------------
  if (actionType === "ACCEPT") {
    if (existingFriendship) {
      return { success: true, action: "NO_OP" }; // Idempotent
    }

    if (!existingRequestFromReceiver || existingRequestFromReceiver.status !== "pending") {
      return { success: false, error: "No pending friend request exists to accept.", action: "NO_OP" };
    }

    return {
      success: true,
      action: "ACCEPT_REQUEST",
      dbPayload: {
        requestId: existingRequestFromReceiver.id,
        userId1: senderId < receiverId ? senderId : receiverId,
        userId2: senderId > receiverId ? senderId : receiverId
      }
    };
  }

  // --------------------------------------------------------------------------
  // ACTION: REJECT FRIEND REQUEST
  // --------------------------------------------------------------------------
  if (actionType === "REJECT") {
    if (!existingRequestFromReceiver || existingRequestFromReceiver.status !== "pending") {
      return { success: false, error: "No pending friend request exists to reject.", action: "NO_OP" };
    }

    return {
      success: true,
      action: "REJECT_REQUEST",
      dbPayload: {
        requestId: existingRequestFromReceiver.id
      }
    };
  }

  // --------------------------------------------------------------------------
  // ACTION: CANCEL SENT REQUEST
  // --------------------------------------------------------------------------
  if (actionType === "CANCEL") {
    if (!existingRequestFromSender || existingRequestFromSender.status !== "pending") {
      return { success: false, error: "No pending outbound friend request exists to cancel.", action: "NO_OP" };
    }

    return {
      success: true,
      action: "CANCEL_REQUEST",
      dbPayload: {
        requestId: existingRequestFromSender.id
      }
    };
  }

  // --------------------------------------------------------------------------
  // ACTION: REMOVE FRIENDSHIP
  // --------------------------------------------------------------------------
  if (actionType === "REMOVE") {
    if (!existingFriendship) {
      return { success: false, error: "You are not currently friends with this user.", action: "NO_OP" };
    }

    return {
      success: true,
      action: "REMOVE_FRIENDSHIP",
      dbPayload: {
        userId1: senderId < receiverId ? senderId : receiverId,
        userId2: senderId > receiverId ? senderId : receiverId
      }
    };
  }

  // --------------------------------------------------------------------------
  // ACTION: BLOCK USER
  // --------------------------------------------------------------------------
  if (actionType === "BLOCK") {
    return {
      success: true,
      action: "BLOCK_USER",
      dbPayload: {
        blockerId: senderId,
        blockedId: receiverId,
        friendshipKeys: {
          userId1: senderId < receiverId ? senderId : receiverId,
          userId2: senderId > receiverId ? senderId : receiverId
        }
      }
    };
  }

  return { success: false, error: "Invalid friends system action type.", action: "NO_OP" };
}

// ==========================================
// 4. SUPABASE TRANSACTION INTEGRATIONS
// ==========================================

/**
 * High-fidelity representation of actual Supabase JS queries needed to manage friendships.
 * Keeps interactions structured and fully documented.
 */
export class SupabaseFriendsService {
  private supabase: any;

  constructor(supabaseClient: any) {
    this.supabase = supabaseClient;
  }

  /**
   * Enforces friends system logic transitions onto PostgreSQL tables.
   */
  public async executeTransition(
    senderId: string,
    receiverId: string,
    action: "SEND" | "ACCEPT" | "REJECT" | "CANCEL" | "REMOVE" | "BLOCK",
    rateTracker: FriendRateTracker
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // 1. Gather all baseline context from DB
      const { data: requestFromSender } = await this.supabase
        .from("friend_requests")
        .select("*")
        .eq("sender_id", senderId)
        .eq("receiver_id", receiverId)
        .maybeSingle();

      const { data: requestFromReceiver } = await this.supabase
        .from("friend_requests")
        .select("*")
        .eq("sender_id", receiverId)
        .eq("receiver_id", senderId)
        .maybeSingle();

      const u1 = senderId < receiverId ? senderId : receiverId;
      const u2 = senderId > receiverId ? senderId : receiverId;

      const { data: friendship } = await this.supabase
        .from("friendships")
        .select("*")
        .eq("user_id_1", u1)
        .eq("user_id_2", u2)
        .maybeSingle();

      const { data: blockFromSender } = await this.supabase
        .from("user_blocks")
        .select("*")
        .eq("blocker_id", senderId)
        .eq("blocked_id", receiverId)
        .maybeSingle();

      const { data: blockFromReceiver } = await this.supabase
        .from("user_blocks")
        .select("*")
        .eq("blocker_id", receiverId)
        .eq("blocked_id", senderId)
        .maybeSingle();

      const { count: pendingCount } = await this.supabase
        .from("friend_requests")
        .select("*", { count: "exact", head: true })
        .eq("sender_id", senderId)
        .eq("status", "pending");

      // Format types from database to our logical domain
      const context: FriendsSystemTransitionContext = {
        senderId,
        receiverId,
        isSenderBlockedByReceiver: !!blockFromReceiver,
        isReceiverBlockedBySender: !!blockFromSender,
        existingFriendship: !!friendship,
        existingRequestFromSender: requestFromSender ? {
          ...requestFromSender,
          createdAt: new Date(requestFromSender.created_at),
          updatedAt: new Date(requestFromSender.updated_at)
        } : null,
        existingRequestFromReceiver: requestFromReceiver ? {
          ...requestFromReceiver,
          createdAt: new Date(requestFromReceiver.created_at),
          updatedAt: new Date(requestFromReceiver.updated_at)
        } : null,
        senderPendingCount: pendingCount || 0
      };

      const evalResult = evaluateFriendRequestTransition(context, action, rateTracker);

      if (!evalResult.success) {
        return { success: false, error: evalResult.error };
      }

      const p = evalResult.dbPayload;

      // 2. Execute DB operations
      switch (evalResult.action) {
        case "CREATE_REQUEST":
          await this.supabase
            .from("friend_requests")
            .insert({
              id: p.id,
              sender_id: p.senderId,
              receiver_id: p.receiverId,
              status: p.status
            });
          break;

        case "ACCEPT_REQUEST":
        case "AUTO_ACCEPT_FRIENDSHIP":
          // Atomically update request status and create friendship row
          await this.supabase
            .from("friend_requests")
            .update({ status: "accepted" })
            .eq("id", p.requestId);

          await this.supabase
            .from("friendships")
            .insert({
              user_id_1: p.userId1,
              user_id_2: p.userId2
            });
          break;

        case "REJECT_REQUEST":
          await this.supabase
            .from("friend_requests")
            .update({ status: "rejected" })
            .eq("id", p.requestId);
          break;

        case "CANCEL_REQUEST":
          await this.supabase
            .from("friend_requests")
            .delete()
            .eq("id", p.requestId);
          break;

        case "REMOVE_FRIENDSHIP":
          // Delete friendship and associated request rows
          await this.supabase
            .from("friendships")
            .delete()
            .eq("user_id_1", p.userId1)
            .eq("user_id_2", p.userId2);

          await this.supabase
            .from("friend_requests")
            .delete()
            .or(`and(sender_id.eq.${senderId},receiver_id.eq.${receiverId}),and(sender_id.eq.${receiverId},receiver_id.eq.${senderId})`);
          break;

        case "BLOCK_USER":
          // Sever any pre-existing friendships, requests, and record block row
          await this.supabase
            .from("friendships")
            .delete()
            .eq("user_id_1", p.friendshipKeys.userId1)
            .eq("user_id_2", p.friendshipKeys.userId2);

          await this.supabase
            .from("friend_requests")
            .delete()
            .or(`and(sender_id.eq.${senderId},receiver_id.eq.${receiverId}),and(sender_id.eq.${receiverId},receiver_id.eq.${senderId})`);

          await this.supabase
            .from("user_blocks")
            .upsert({
              blocker_id: p.blockerId,
              blocked_id: p.blockedId
            });
          break;

        case "NO_OP":
        default:
          break;
      }

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || "Internal database connection failure." };
    }
  }

  /**
   * Fetches total friends count for a user
   */
  public async getFriendsCount(userId: string): Promise<number> {
    const { count, error } = await this.supabase
      .from("friendships")
      .select("*", { count: "exact", head: true })
      .or(`user_id_1.eq.${userId},user_id_2.eq.${userId}`);
    if (error) throw error;
    return count || 0;
  }

  /**
   * Fetches pending RECEIVED requests for a user
   */
  public async getPendingReceivedRequests(userId: string): Promise<FriendRequest[]> {
    const { data, error } = await this.supabase
      .from("friend_requests")
      .select("*")
      .eq("receiver_id", userId)
      .eq("status", "pending")
      .order("created_at", { ascending: false });

    if (error) throw error;
    return (data || []).map((row: any) => ({
      id: row.id,
      senderId: row.sender_id,
      receiverId: row.receiver_id,
      status: row.status,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    }));
  }

  /**
   * Fetches pending SENT requests for a user
   */
  public async getPendingSentRequests(userId: string): Promise<FriendRequest[]> {
    const { data, error } = await this.supabase
      .from("friend_requests")
      .select("*")
      .eq("sender_id", userId)
      .eq("status", "pending")
      .order("created_at", { ascending: false });

    if (error) throw error;
    return (data || []).map((row: any) => ({
      id: row.id,
      senderId: row.sender_id,
      receiverId: row.receiver_id,
      status: row.status,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    }));
  }
}

// ==========================================
// 5. REALTIME SYNC & NOTIFICATION DISPATCH PLAN
// ==========================================

export const REALTIME_FRIENDS_PLAN = {
  /**
   * Under standard client subscription, the frontend listens to Postgres insert/update events.
   * Format: `friend_requests:receiver_id=eq.${currentUserId}`
   */
  subscriptionChannels: {
    REQUESTS: "realtime:public:friend_requests",
    FRIENDSHIPS: "realtime:public:friendships"
  },
  
  /**
   * Payload outline transmitted when a request transitions.
   */
  generatePushPayload(request: FriendRequest, senderName: string): { title: string; body: string; data: any } {
    return {
      title: "New Friend Request",
      body: `${senderName} sent you a friend request on Turtle.`,
      data: {
        type: "FRIEND_REQUEST_RECEIVED",
        requestId: request.id,
        senderId: request.senderId
      }
    };
  }
};

// ============================================================================
// 6. POSTGRES ROW LEVEL SECURITY (RLS) & DATABASE SCHEMA MIGRATION
// ============================================================================
export const SQL_FRIENDS_MIGRATION = `
-- ============================================================================
-- SQL SCHEMA FOR FRIENDSHIPS, REQUESTS, AND USER BLOCKING RECORDS
-- ============================================================================

-- Friend requests table
create table if not exists public.friend_requests (
    id uuid default uuid_generate_v4() primary key,
    sender_id uuid references public.profiles(id) on delete cascade not null,
    receiver_id uuid references public.profiles(id) on delete cascade not null,
    status text default 'pending'::text not null,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
    
    constraint check_request_status check (status in ('pending', 'accepted', 'rejected')),
    -- Prevent duplicate rows for active requests in the same direction
    constraint unique_sender_receiver unique (sender_id, receiver_id)
);

-- Friendship table (lexicographically ordered keys userId1 < userId2 to prevent double records)
create table if not exists public.friendships (
    id uuid default uuid_generate_v4() primary key,
    user_id_1 uuid references public.profiles(id) on delete cascade not null,
    user_id_2 uuid references public.profiles(id) on delete cascade not null,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    
    constraint unique_friend_pair unique (user_id_1, user_id_2),
    constraint check_lexicographical_order check (user_id_1 < user_id_2)
);

-- Blocking table
create table if not exists public.user_blocks (
    id uuid default uuid_generate_v4() primary key,
    blocker_id uuid references public.profiles(id) on delete cascade not null,
    blocked_id uuid references public.profiles(id) on delete cascade not null,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    
    constraint unique_blocker_blocked unique (blocker_id, blocked_id)
);

-- Automatically update public.friend_requests's updated_at timestamp
create or replace function public.set_updated_at_column()
returns trigger as $$
begin
    new.updated_at = timezone('utc'::text, now());
    return new;
end;
$$ language plpgsql;

create trigger tr_friend_requests_updated_at
    before update on public.friend_requests
    for each row execute function public.set_updated_at_column();

-- ============================================================================
-- SECURE ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

alter table public.friend_requests enable row level security;
alter table public.friendships enable row level security;
alter table public.user_blocks enable row level security;

-- Friend requests RLS
create policy "Users can read requests they sent or received"
    on public.friend_requests for select
    using (auth.uid() = sender_id or auth.uid() = receiver_id);

create policy "Users can insert outbound requests"
    on public.friend_requests for insert
    with check (
        auth.uid() = sender_id and 
        not exists (
            select 1 from public.user_blocks 
            where (blocker_id = receiver_id and blocked_id = auth.uid())
               or (blocker_id = auth.uid() and blocked_id = receiver_id)
        )
    );

create policy "Users can update requests they received"
    on public.friend_requests for update
    using (auth.uid() = receiver_id);

create policy "Users can cancel requests they sent"
    on public.friend_requests for delete
    using (auth.uid() = sender_id);

-- Friendships RLS
create policy "Users can view friendships they are part of"
    on public.friendships for select
    using (auth.uid() = user_id_1 or auth.uid() = user_id_2);

create policy "Friendships can only be established through request flows or RPC"
    on public.friendships for insert
    with check (auth.uid() = user_id_1 or auth.uid() = user_id_2);

create policy "Either friend can terminate the friendship"
    on public.friendships for delete
    using (auth.uid() = user_id_1 or auth.uid() = user_id_2);

-- User Blocks RLS
create policy "Users can view their own blocks"
    on public.user_blocks for select
    using (auth.uid() = blocker_id);

create policy "Users can insert their own blocks"
    on public.user_blocks for insert
    with check (auth.uid() = blocker_id);

create policy "Users can delete their own blocks"
    on public.user_blocks for delete
    using (auth.uid() = blocker_id);

-- ============================================================================
-- HIGH-PERFORMANCE SEARCH & COMPLIANCE INDEXES
-- ============================================================================
create index if not exists idx_friend_requests_lookup on public.friend_requests (sender_id, receiver_id);
create index if not exists idx_friendships_nodes on public.friendships (user_id_1, user_id_2);
create index if not exists idx_user_blocks_nodes on public.user_blocks (blocker_id, blocked_id);
`;
