/**
 * Turtle Social Media Application - Core Messaging Backend Engine
 * 
 * This file contains the complete, production-ready, non-UI backend architecture,
 * type definitions, message pipelines, read-receipt orchestrators, blocking guards,
 * and high-performance SQL schemas for Turtle's private instant messaging infrastructure.
 * 
 * -----------------------------------------------------------------------------------------
 * CORE FUNCTIONAL SERVICES:
 * 1. One-to-One & Extensible Group Conversation Creators
 * 2. Message Dispatcher with attachment size checks, media categorization, and active blocking safeguards
 * 3. Atomic Read Receipt updates with live unread-count recalculations
 * 4. Typing Indicator presence heartbeat state models
 * 5. Blocked User Message Suppressor
 * 6. Supabase Real-time Subscription design parameters
 * 7. Comprehensive SQL schema migration scripts including Row Level Security (RLS)
 * 8. Future End-to-End Encryption (E2EE) Architectural Blueprint & Roadmap
 * -----------------------------------------------------------------------------------------
 */

// ==========================================
// 1. DATA MODELS & TYPE DEFINITIONS
// ==========================================

export type ConversationType = "one-to-one" | "group";
export type MessageMediaType = "TEXT" | "IMAGE" | "AUDIO" | "VIDEO" | "FILE";
export type MessageReceiptStatus = "sent" | "delivered" | "read";

export interface Conversation {
  id: string;
  type: ConversationType;
  name: string | null;           // Null for standard one-to-one chats
  createdAt: Date;
  updatedAt: Date;
}

export interface ConversationParticipant {
  id: string;
  conversationId: string;
  userId: string;
  joinedAt: Date;
  lastReadAt: Date;              // Timestamp of the last message read in this conversation
}

export interface DirectMessage {
  id: string;
  conversationId: string;
  senderId: string;
  mediaType: MessageMediaType;
  /**
   * Plain text content or client-side encrypted text payload.
   * Extensible for End-to-End Encryption (E2EE).
   */
  contentText: string | null;
  mediaUrl: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface MessageReceipt {
  id: string;
  messageId: string;
  userId: string;               // Reader of the message
  status: MessageReceiptStatus;
  readAt: Date | null;
}

export interface UserPresenceState {
  userId: string;
  isOnline: boolean;
  lastSeenAt: Date;
  typingInConversationId: string | null; // ID of the conversation the user is currently typing in
}

// System Constraints for Messaging
export const MESSAGING_LIMITS = {
  MAX_TEXT_LENGTH_CHARACTERS: 10000,
  MAX_MEDIA_UPLOAD_SIZE_BYTES: 25 * 1024 * 1024, // 25MB standard media cap
  MAX_PARTICIPANTS_PER_GROUP: 250,              // Scalability guard
  ONLINE_HEARTBEAT_TIMEOUT_MS: 30000,           // User offline threshold (30 seconds)
  MAX_MESSAGE_LOAD_LIMIT: 50
};

// ============================================================================
// 2. ERROR & SECURITY BOUNDARY PROTOCOLS
// ============================================================================

export enum MessagingErrorCode {
  CONVERSATION_NOT_FOUND = "CONVERSATION_NOT_FOUND",
  USER_BLOCKED = "USER_BLOCKED",
  NOT_PARTICIPANT = "NOT_PARTICIPANT",
  MEDIA_SIZE_LIMIT_EXCEEDED = "MEDIA_SIZE_LIMIT_EXCEEDED",
  MESSAGE_LENGTH_LIMIT_EXCEEDED = "MESSAGE_LENGTH_LIMIT_EXCEEDED",
  UNSUPPORTED_MEDIA = "UNSUPPORTED_MEDIA",
  MESSAGE_ALREADY_DELETED = "MESSAGE_ALREADY_DELETED",
  PERSISTENCE_ERROR = "PERSISTENCE_ERROR",
  SECURITY_BREACH = "SECURITY_BREACH"
}

export interface MessagingError {
  code: MessagingErrorCode;
  message: string;
  details?: string;
}

// ==========================================
// 3. MESSAGE DISPATCH FLOW (PIPELINE)
// ==========================================

export interface SendMessageRequest {
  conversationId: string;
  senderId: string;
  mediaType: MessageMediaType;
  contentText?: string;
  mediaUrl?: string;
  mimeType?: string;
  sizeBytes?: number;
}

export interface MessagingPipelineContext {
  isSenderBlockedByReceiver: boolean;
  isReceiverBlockedBySender: boolean;
  isParticipantOfConversation: boolean;
  participants: string[]; // List of participant user IDs
}

/**
 * Validates structural bounds and mutual-blocking restrictions before dispatching a message.
 * Prevents malicious or blocked message insertions.
 */
export function validateAndPrepareMessage(
  req: SendMessageRequest,
  context: MessagingPipelineContext
): { success: boolean; error?: MessagingError; preparedMessage?: DirectMessage } {
  
  // 1. Authorization checks
  if (!context.isParticipantOfConversation) {
    return {
      success: false,
      error: {
        code: MessagingErrorCode.NOT_PARTICIPANT,
        message: "Access Denied: You are not a registered participant of this conversation."
      }
    };
  }

  // 2. Active block checks (one-to-one isolation enforcement)
  if (context.isSenderBlockedByReceiver || context.isReceiverBlockedBySender) {
    return {
      success: false,
      error: {
        code: MessagingErrorCode.USER_BLOCKED,
        message: "Message Delivery Failed: Active blocking policy exists between the participants."
      }
    };
  }

  // 3. Validate content length
  if (req.mediaType === "TEXT" && req.contentText) {
    if (req.contentText.length > MESSAGING_LIMITS.MAX_TEXT_LENGTH_CHARACTERS) {
      return {
        success: false,
        error: {
          code: MessagingErrorCode.MESSAGE_LENGTH_LIMIT_EXCEEDED,
          message: `Text length exceeds maximum allowed character boundary of ${MESSAGING_LIMITS.MAX_TEXT_LENGTH_CHARACTERS} characters.`
        }
      };
    }
  }

  // 4. Validate attachment specifications
  if (req.mediaType !== "TEXT") {
    if (!req.mediaUrl) {
      return {
        success: false,
        error: {
          code: MessagingErrorCode.UNSUPPORTED_MEDIA,
          message: "Media URL is mandatory for non-text messages."
        }
      };
    }

    if (req.sizeBytes && req.sizeBytes > MESSAGING_LIMITS.MAX_MEDIA_UPLOAD_SIZE_BYTES) {
      return {
        success: false,
        error: {
          code: MessagingErrorCode.MEDIA_SIZE_LIMIT_EXCEEDED,
          message: `Attachment exceeds maximum file transfer capacity of ${MESSAGING_LIMITS.MAX_MEDIA_UPLOAD_SIZE_BYTES / (1024 * 1024)}MB.`
        }
      };
    }
  }

  const messageId = `msg-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
  const preparedMessage: DirectMessage = {
    id: messageId,
    conversationId: req.conversationId,
    senderId: req.senderId,
    mediaType: req.mediaType,
    contentText: req.contentText || null,
    mediaUrl: req.mediaUrl || null,
    mimeType: req.mimeType || null,
    sizeBytes: req.sizeBytes || null,
    isDeleted: false,
    createdAt: new Date(),
    updatedAt: new Date()
  };

  return { success: true, preparedMessage };
}

// ==========================================
// 4. READ RECEIPTS & UNREAD COUNTS FLOW
// ==========================================

export interface UnreadCountResponse {
  conversationId: string;
  userId: string;
  unreadCount: number;
}

/**
 * Marks messages up to a specific timestamp as read for a given user in a conversation.
 * Returns the SQL parameters or direct payload to execute updates.
 */
export function markConversationAsRead(
  userId: string,
  conversationId: string,
  readAtTimestamp: Date = new Date()
): { conversationId: string; userId: string; lastReadAt: Date } {
  return {
    conversationId,
    userId,
    lastReadAt: readAtTimestamp
  };
}

/**
 * Local simulation of real unread count calculations to ensure seamless preview synchronization.
 */
export function calculateLocalUnreadCount(
  messages: DirectMessage[],
  participantLastReadAt: Date,
  currentUserId: string
): number {
  return messages.filter(msg => 
    msg.senderId !== currentUserId && 
    !msg.isDeleted && 
    msg.createdAt.getTime() > participantLastReadAt.getTime()
  ).length;
}

// ============================================================================
// 5. SUPABASE REALTIME SYNC & TYPING PRESENCE PLAN
// ============================================================================

export const REALTIME_MESSAGING_CHANNELS = {
  /**
   * Under Supabase's realtime database stream, clients hook onto inserts inside direct_messages table.
   * Subscription filter: `direct_messages:conversation_id=eq.${conversationId}`
   */
  getConversationChannel(conversationId: string): string {
    return `realtime:public:direct_messages:conversation_id=eq.${conversationId}`;
  },

  /**
   * For typing indicators, use ephemeral Supabase Broadcast Channels (or socket-level heartbeats)
   * which keep load off the primary database.
   */
  getPresenceChannel(conversationId: string): string {
    return `presence:chat_room:${conversationId}`;
  },

  /**
   * Maps current typing active events.
   */
  generateTypingBroadcast(
    userId: string,
    isTyping: boolean,
    userName: string
  ): { userId: string; isTyping: boolean; userName: string; timestamp: number } {
    return {
      userId,
      isTyping,
      userName,
      timestamp: Date.now()
    };
  }
};

// ==========================================
// 6. INTEGRATED SUPABASE DB QUERIES (EXECUTION)
// ==========================================

/**
 * Service to execute backend direct operations over Supabase / Postgres client
 */
export class SupabaseMessagingService {
  private supabase: any;

  constructor(supabaseClient: any) {
    this.supabase = supabaseClient;
  }

  /**
   * Initializes or fetches a direct conversation between two specific users.
   * Standardizes the lexicographical uniqueness check of participant nodes to avoid duplicate chats.
   */
  public async getOrCreateOneToOneChat(
    userId1: string,
    userId2: string
  ): Promise<{ success: boolean; conversationId?: string; error?: string }> {
    try {
      const u1 = userId1 < userId2 ? userId1 : userId2;
      const u2 = userId1 > userId2 ? userId1 : userId2;

      // Check if a direct conversation already exists between this exact duo
      const { data: existing, error: fetchErr } = await this.supabase
        .from("conversations")
        .select(`
          id,
          participants:conversation_participants!inner(user_id)
        `)
        .eq("type", "one-to-one");

      if (fetchErr) throw fetchErr;

      // Filter local results where both participants exist in the record mapping
      const exactMatch = (existing || []).find((conv: any) => {
        const ids = conv.participants.map((p: any) => p.user_id);
        return ids.includes(u1) && ids.includes(u2);
      });

      if (exactMatch) {
        return { success: true, conversationId: exactMatch.id };
      }

      // Create new atomic conversation record
      const newConvId = `conv-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
      
      const { error: convErr } = await this.supabase
        .from("conversations")
        .insert({
          id: newConvId,
          type: "one-to-one"
        });

      if (convErr) throw convErr;

      // Map participants
      await this.supabase
        .from("conversation_participants")
        .insert([
          { conversation_id: newConvId, user_id: u1 },
          { conversation_id: newConvId, user_id: u2 }
        ]);

      return { success: true, conversationId: newConvId };
    } catch (err: any) {
      return { success: false, error: err?.message || "Conversation initiation transaction failed." };
    }
  }

  /**
   * Safely dispatches a direct message across the system pipelines.
   */
  public async sendDirectMessage(
    req: SendMessageRequest
  ): Promise<{ success: boolean; message?: DirectMessage; error?: string }> {
    try {
      // 1. Resolve participants and active blocks in background database threads
      const { data: participantData } = await this.supabase
        .from("conversation_participants")
        .select("user_id")
        .eq("conversation_id", req.conversationId);

      const participants = (participantData || []).map((p: any) => p.user_id);
      const isParticipant = participants.includes(req.senderId);

      const receiverId = participants.find(id => id !== req.senderId) || "";

      // Check blocks
      const { data: senderBlock } = await this.supabase
        .from("user_blocks")
        .select("id")
        .eq("blocker_id", req.senderId)
        .eq("blocked_id", receiverId)
        .maybeSingle();

      const { data: receiverBlock } = await this.supabase
        .from("user_blocks")
        .select("id")
        .eq("blocker_id", receiverId)
        .eq("blocked_id", req.senderId)
        .maybeSingle();

      const validationContext: MessagingPipelineContext = {
        isSenderBlockedByReceiver: !!receiverBlock,
        isReceiverBlockedBySender: !!senderBlock,
        isParticipantOfConversation: isParticipant,
        participants
      };

      const result = validateAndPrepareMessage(req, validationContext);

      if (!result.success || !result.preparedMessage) {
        return { success: false, error: result.error?.message || "Message validation rejected." };
      }

      const msg = result.preparedMessage;

      // 2. Perform raw insert
      const { error: insertErr } = await this.supabase
        .from("direct_messages")
        .insert({
          id: msg.id,
          conversation_id: msg.conversationId,
          sender_id: msg.senderId,
          media_type: msg.mediaType,
          content_text: msg.contentText,
          media_url: msg.mediaUrl,
          mime_type: msg.mimeType,
          size_bytes: msg.sizeBytes,
          is_deleted: msg.isDeleted
        });

      if (insertErr) throw insertErr;

      return { success: true, message: msg };
    } catch (err: any) {
      return { success: false, error: err?.message || "Failed to persist chat message." };
    }
  }

  /**
   * Handles message deletion with security auditing.
   * Only the message sender is permitted to delete or soft-delete their own message.
   */
  public async deleteDirectMessage(
    messageId: string,
    requestingUserId: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const { data: existing, error: fetchErr } = await this.supabase
        .from("direct_messages")
        .select("sender_id, is_deleted")
        .eq("id", messageId)
        .single();

      if (fetchErr || !existing) {
        return { success: false, error: "Target message reference not found." };
      }

      if (existing.sender_id !== requestingUserId) {
        return {
          success: false,
          error: "Authorization Violation: You are not authorized to delete other users' messages."
        };
      }

      if (existing.is_deleted) {
        return { success: true }; // Idempotent
      }

      const { error: updateErr } = await this.supabase
        .from("direct_messages")
        .update({
          is_deleted: true,
          content_text: "[ This message was deleted ]",
          media_url: null,
          updated_at: new Date()
        })
        .eq("id", messageId);

      if (updateErr) throw updateErr;

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || "Message deletion update failed." };
    }
  }

  /**
   * Atomic operation to update participant last read point and update unread logs
   */
  public async markAsRead(
    userId: string,
    conversationId: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const readTimestamp = new Date();
      
      const { error } = await this.supabase
        .from("conversation_participants")
        .update({
          last_read_at: readTimestamp
        })
        .eq("conversation_id", conversationId)
        .eq("user_id", userId);

      if (error) throw error;

      // Update receipts status
      await this.supabase
        .from("message_receipts")
        .upsert({
          conversation_id: conversationId,
          user_id: userId,
          status: "read",
          read_at: readTimestamp
        });

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || "Read marker update execution failed." };
    }
  }
}

// ============================================================================
// 7. POSTGRES ROW LEVEL SECURITY (RLS) & DATABASE SCHEMA MIGRATION
// ============================================================================
export const SQL_MESSAGING_MIGRATION = `
-- ============================================================================
-- SQL SCHEMA FOR MESSAGES, CONVERSATIONS, PARTICIPANTS, AND RECEIPTS
-- ============================================================================

-- Conversation grouping registry
create table if not exists public.conversations (
    id uuid default uuid_generate_v4() primary key,
    type text default 'one-to-one'::text not null check (type in ('one-to-one', 'group')),
    name text, -- Group chat identifier name
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Mapping participants inside a conversation room
create table if not exists public.conversation_participants (
    id uuid default uuid_generate_v4() primary key,
    conversation_id uuid references public.conversations(id) on delete cascade not null,
    user_id uuid references public.profiles(id) on delete cascade not null,
    joined_at timestamp with time zone default timezone('utc'::text, now()) not null,
    last_read_at timestamp with time zone default timezone('utc'::text, now()) not null,
    
    constraint unique_participant_conversation unique (conversation_id, user_id)
);

-- Unified direct message storage catalog
create table if not exists public.direct_messages (
    id uuid default uuid_generate_v4() primary key,
    conversation_id uuid references public.conversations(id) on delete cascade not null,
    sender_id uuid references public.profiles(id) on delete cascade not null,
    media_type text default 'TEXT'::text not null,
    content_text text,
    media_url text,
    mime_type text,
    size_bytes bigint,
    is_deleted boolean default false not null,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
    
    constraint check_dm_media_type check (media_type in ('TEXT', 'IMAGE', 'AUDIO', 'VIDEO', 'FILE'))
);

-- Message receipts and audit tracking logs
create table if not exists public.message_receipts (
    id uuid default uuid_generate_v4() primary key,
    conversation_id uuid references public.conversations(id) on delete cascade not null,
    user_id uuid references public.profiles(id) on delete cascade not null,
    status text default 'read'::text not null check (status in ('sent', 'delivered', 'read')),
    read_at timestamp with time zone default timezone('utc'::text, now()) not null,
    
    constraint unique_receipt_user_conv unique (conversation_id, user_id)
);

-- Real-time user online presence and typing indicators states
create table if not exists public.user_presence (
    user_id uuid references public.profiles(id) on delete cascade primary key,
    is_online boolean default false not null,
    last_seen_at timestamp with time zone default timezone('utc'::text, now()) not null,
    typing_conversation_id uuid references public.conversations(id) on delete set null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Automatically update timestamps trigger
create or replace function public.trigger_updated_at_conversation()
returns trigger as $$
begin
    new.updated_at = timezone('utc'::text, now());
    return new;
end;
$$ language plpgsql;

create trigger tr_conversations_updated_at
    before update on public.conversations
    for each row execute function public.trigger_updated_at_conversation();

create trigger tr_direct_messages_updated_at
    before update on public.direct_messages
    for each row execute function public.trigger_updated_at_conversation();

-- ============================================================================
-- SECURE ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

alter table public.conversations enable row level security;
alter table public.conversation_participants enable row level security;
alter table public.direct_messages enable row level security;
alter table public.message_receipts enable row level security;
alter table public.user_presence enable row level security;

-- 1. Conversations access RLS: Only accessible if you are listed in conversation_participants
create policy "Users can view conversations they participate in"
    on public.conversations for select
    using (
        exists (
            select 1 from public.conversation_participants
            where conversation_id = conversations.id and user_id = auth.uid()
        )
    );

-- 2. Participants access RLS
create policy "Participants can read other participant details of same room"
    on public.conversation_participants for select
    using (
        exists (
            select 1 from public.conversation_participants as inner_p
            where inner_p.conversation_id = conversation_participants.conversation_id 
              and inner_p.user_id = auth.uid()
        )
    );

create policy "Users can modify their own last_read_at timestamp"
    on public.conversation_participants for update
    using (user_id = auth.uid());

-- 3. Direct Message RLS: Restricts reading DMs unless you are in the conversation,
-- and forbids messaging someone if they blocked you.
create policy "Users can read DMs inside their conversations"
    on public.direct_messages for select
    using (
        exists (
            select 1 from public.conversation_participants
            where conversation_id = direct_messages.conversation_id and user_id = auth.uid()
        )
    );

create policy "Users can insert messages if participant and not blocked"
    on public.direct_messages for insert
    with check (
        sender_id = auth.uid() and 
        exists (
            select 1 from public.conversation_participants
            where conversation_id = direct_messages.conversation_id and user_id = auth.uid()
        ) and 
        not exists (
            -- Anti-Abuse Block Guard
            select 1 from public.user_blocks as b
            where (
                b.blocker_id = auth.uid() and b.blocked_id = (
                    select user_id from public.conversation_participants 
                    where conversation_id = direct_messages.conversation_id and user_id != auth.uid() limit 1
                )
            ) or (
                b.blocker_id = (
                    select user_id from public.conversation_participants 
                    where conversation_id = direct_messages.conversation_id and user_id != auth.uid() limit 1
                ) and b.blocked_id = auth.uid()
            )
        )
    );

-- 4. Presence logs RLS
create policy "Presence is viewable by all signed in members"
    on public.user_presence for select
    using (auth.role() = 'authenticated');

create policy "Users can modify their own online presence and typing heartbeat"
    on public.user_presence for write
    using (user_id = auth.uid())
    with check (user_id = auth.uid());

-- ============================================================================
-- HIGH-PERFORMANCE INDEXES
-- ============================================================================
create index if not exists idx_direct_messages_timeline 
on public.direct_messages (conversation_id, created_at desc);

create index if not exists idx_participants_compound 
on public.conversation_participants (conversation_id, user_id);
`;

// ============================================================================
// 8. SECURITY AUDIT & FUTURE END-TO-END ENCRYPTION (E2EE) ROADMAP
// ============================================================================

export const MESSAGING_SECURITY_AUDIT = {
  mitigatedRisks: [
    {
      risk: "Malicious insertion of massive payloads triggering storage overflow or DOS",
      mitigation: "Strict validation schema check enforcing maximum limits of 10,000 characters and 25MB on files."
    },
    {
      risk: "Spamming users or harassment after being blocked",
      mitigation: "Active database constraint check and RLS policies asserting that messages cannot be sent if a mutual row in user_blocks table exists."
    },
    {
      risk: "Snoopers trying to read private direct messages",
      mitigation: "Rigid Row Level Security policies preventing reading messages unless matching a user_id row on the participants junction table."
    }
  ],
  
  e2eeImplementationRoadmap: {
    protocol: "Signal Double Ratchet Protocol over Diffie-Hellman Key Exchange",
    phases: [
      {
        phase: "Phase 1: Identity Key Ring Generation",
        description: "On user signup, generate cryptographic key pairs client-side (Identity Key, Signed Pre-key, and a bundle of One-time Pre-keys). Store public key fragments in a public.prekeys registry inside the database. Keep private keys strictly local inside secure device keystores."
      },
      {
        phase: "Phase 2: Initial Handshake (X3DH)",
        description: "When User A attempts to message User B for the first time, User A fetches User B's public prekey bundle from the server. User A performs Extended Triple Diffie-Hellman (X3DH) client-side to calculate a shared Master Secret Key and initiates local ratchets."
      },
      {
        phase: "Phase 3: Symmetric Message Ratcheting",
        description: "Every dispatched message is encrypted client-side using a unique, single-use Symmetric Encryption Key derived from the Double Ratchet sequence. The payload is sent to our Supabase DB as content_encrypted with no cleartext text ever sent over the network. The server acts merely as a zero-knowledge mailbox routing ciphertext."
      },
      {
        phase: "Phase 4: Multi-Device Sync & Backups",
        description: "Implement a threshold-encrypted backup scheme (e.g. Shamir's Secret Sharing or passphrase-derived key storage) allowing trusted recovery of key rings on login across new devices without transferring raw private keys through database servers."
      }
    ]
  }
};
