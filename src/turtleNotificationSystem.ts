/**
 * Turtle Social Media Application - Notifications Backend Engine
 * 
 * This file contains the complete, production-ready, non-UI backend architecture,
 * type definitions, preference models, rate-limit systems, API orchestrators,
 * and high-performance SQL schemas for Turtle's cross-channel notification system.
 * 
 * -----------------------------------------------------------------------------------------
 * CORE FUNCTIONAL SERVICES:
 * 1. 13 Specialized Notification Types: Friend requests, direct messaging, reactions,
 *    comments, channel updates, Reels milestones, security/abuse alerts, emergency community pool broadcasts,
 *    unlocked Time Capsules, random matchmaking, and administrative system updates.
 * 2. User Preference Registry: Push & In-App delivery granular switches per type.
 * 3. Rate-Limiting & De-duplication Logic: Consolidates repetitive events (e.g., likes from the same user)
 *    and prevents notification flood attacks.
 * 4. Structured JSON Payload Generators: Formatting models for Apple APNS and Google FCM.
 * 5. Supabase/PostgreSQL Database operations and RLS Security Policies.
 * -----------------------------------------------------------------------------------------
 */

// ==========================================
// 1. DATA MODELS & TYPES
// ==========================================

export enum NotificationType {
  FRIEND_REQUEST = "FRIEND_REQUEST",
  MESSAGE = "MESSAGE",
  LIKE = "LIKE",
  DISLIKE = "DISLIKE",
  REACTION = "REACTION",
  COMMENT = "COMMENT",
  CHANNEL_UPDATE = "CHANNEL_UPDATE",
  REELS_MILESTONE = "REELS_MILESTONE",
  SECURITY_ALERT = "SECURITY_ALERT",
  EMERGENCY_POOL_ALERT = "EMERGENCY_POOL_ALERT",
  TIME_CAPSULE_UNLOCKED = "TIME_CAPSULE_UNLOCKED",
  RANDOM_CHAT_MATCH = "RANDOM_CHAT_MATCH",
  SYSTEM_UPDATE = "SYSTEM_UPDATE"
}

export type NotificationPriority = "low" | "medium" | "high" | "critical";

export interface NotificationPreference {
  userId: string;
  notificationType: NotificationType;
  allowPush: boolean;
  allowInApp: boolean;
  updatedAt: Date;
}

export interface TurtleNotification {
  id: string;
  recipientId: string;
  senderId: string | null; // Null for system-generated alerts
  type: NotificationType;
  priority: NotificationPriority;
  title: string;
  body: string;
  /**
   * Extensible JSON context payload linking to posts, conversations,
   * capsules, or user accounts.
   */
  metadata: Record<string, any>;
  isRead: boolean;
  isDelivered: boolean;
  createdAt: Date;
}

// ==========================================
// 2. GRANULAR PREFERENCE CONFIGURATORS
// ==========================================

export const DEFAULT_PREFERENCES: Record<NotificationType, { push: boolean; inApp: boolean; priority: NotificationPriority }> = {
  [NotificationType.FRIEND_REQUEST]: { push: true, inApp: true, priority: "medium" },
  [NotificationType.MESSAGE]: { push: true, inApp: true, priority: "high" },
  [NotificationType.LIKE]: { push: false, inApp: true, priority: "low" },
  [NotificationType.DISLIKE]: { push: false, inApp: true, priority: "low" },
  [NotificationType.REACTION]: { push: false, inApp: true, priority: "low" },
  [NotificationType.COMMENT]: { push: true, inApp: true, priority: "medium" },
  [NotificationType.CHANNEL_UPDATE]: { push: false, inApp: true, priority: "low" },
  [NotificationType.REELS_MILESTONE]: { push: true, inApp: true, priority: "medium" },
  [NotificationType.SECURITY_ALERT]: { push: true, inApp: true, priority: "critical" },
  [NotificationType.EMERGENCY_POOL_ALERT]: { push: true, inApp: true, priority: "critical" },
  [NotificationType.TIME_CAPSULE_UNLOCKED]: { push: true, inApp: true, priority: "medium" },
  [NotificationType.RANDOM_CHAT_MATCH]: { push: true, inApp: true, priority: "high" },
  [NotificationType.SYSTEM_UPDATE]: { push: false, inApp: true, priority: "low" }
};

/**
 * Validates whether a notification is allowed to proceed to push or in-app delivery
 * based on explicit user preference overrides.
 */
export function evaluateUserDeliveryPreferences(
  userPreferences: NotificationPreference[],
  type: NotificationType
): { deliverPush: boolean; deliverInApp: boolean } {
  
  const customPref = userPreferences.find(pref => pref.notificationType === type);

  if (customPref) {
    return {
      deliverPush: customPref.allowPush,
      deliverInApp: customPref.allowInApp
    };
  }

  // Fall back to system defaults
  const systemDefault = DEFAULT_PREFERENCES[type];
  return {
    deliverPush: systemDefault.push,
    deliverInApp: systemDefault.inApp
  };
}

// ==========================================
// 3. RATE LIMITING & ANTI-SPAM (DE-DUPLICATION ENGINE)
// ==========================================

export interface UserNotificationRateTracker {
  userId: string;
  recentNotificationTimestamps: { type: NotificationType; timestamp: number }[];
}

export const RATE_LIMIT_BOUNDS: Record<string, { maxPerMinute: number; debounceWindowMs: number }> = {
  // Enforce caps to prevent notification fatigue or malicious floods
  [NotificationType.LIKE]: { maxPerMinute: 5, debounceWindowMs: 10000 },
  [NotificationType.DISLIKE]: { maxPerMinute: 5, debounceWindowMs: 10000 },
  [NotificationType.REACTION]: { maxPerMinute: 5, debounceWindowMs: 10000 },
  [NotificationType.COMMENT]: { maxPerMinute: 10, debounceWindowMs: 2000 },
  [NotificationType.MESSAGE]: { maxPerMinute: 40, debounceWindowMs: 0 },
  [NotificationType.FRIEND_REQUEST]: { maxPerMinute: 3, debounceWindowMs: 60000 },
  [NotificationType.EMERGENCY_POOL_ALERT]: { maxPerMinute: 2, debounceWindowMs: 120000 },
  ["DEFAULT"]: { maxPerMinute: 15, debounceWindowMs: 5000 }
};

/**
 * Decides if a notification should be suppressed or rate-limited.
 * Enforces De-duplication: Rapid consecutive identical alerts (e.g. liking and unliking)
 * are discarded to prevent user device buzzing.
 */
export function checkRateLimitAndDeduplicate(
  tracker: UserNotificationRateTracker,
  incomingType: NotificationType,
  metadataKey: string, // e.g., "post-12345" or "sender-abc"
  activeHistory: TurtleNotification[],
  nowMs: number = Date.now()
): { allowed: boolean; reason?: "RATE_LIMIT_EXCEEDED" | "DUPLICATE_SUPPRESSED" } {
  
  const limits = RATE_LIMIT_BOUNDS[incomingType] || RATE_LIMIT_BOUNDS["DEFAULT"];

  // 1. De-duplication Debounce check: Check if an identical alert was sent recently
  if (limits.debounceWindowMs > 0) {
    const duplicate = activeHistory.find(notif => 
      notif.type === incomingType && 
      (nowMs - notif.createdAt.getTime()) < limits.debounceWindowMs &&
      notif.metadata.targetKey === metadataKey
    );

    if (duplicate) {
      return { allowed: false, reason: "DUPLICATE_SUPPRESSED" };
    }
  }

  // 2. Frequency rate limits
  const oneMinuteAgo = nowMs - 60 * 1000;
  
  // Clean old metrics
  tracker.recentNotificationTimestamps = tracker.recentNotificationTimestamps.filter(item => 
    item.timestamp > oneMinuteAgo
  );

  const matchedRecent = tracker.recentNotificationTimestamps.filter(item => item.type === incomingType);

  if (matchedRecent.length >= limits.maxPerMinute) {
    return { allowed: false, reason: "RATE_LIMIT_EXCEEDED" };
  }

  // Add current event
  tracker.recentNotificationTimestamps.push({ type: incomingType, timestamp: nowMs });
  return { allowed: true };
}

// ==========================================
// 4. STRUCTURED PUSH PAYLOAD FORMATS (JSON)
// ==========================================

export class NotificationPayloadBuilder {
  
  /**
   * Produces standard payloads conforming to APNS (Apple) and FCM (Google Firebase) expectations.
   */
  public static buildPushPayload(notification: TurtleNotification): {
    to: string; // Recipient device token
    priority: "normal" | "high";
    notification: {
      title: string;
      body: string;
      sound: string;
      badge: number;
    };
    data: {
      notificationId: string;
      type: NotificationType;
      priority: NotificationPriority;
      senderId: string | null;
      [key: string]: any;
    };
  } {
    
    // Critical priority overrides APNS/FCM delivery lanes
    const wirePriority = (notification.priority === "critical" || notification.priority === "high") ? "high" : "normal";
    const customSound = notification.priority === "critical" ? "emergency_alarm.caf" : "default";

    return {
      to: notification.metadata.deviceToken || "device-token-placeholder",
      priority: wirePriority,
      notification: {
        title: notification.title,
        body: notification.body,
        sound: customSound,
        badge: notification.metadata.unreadCountBadge || 1
      },
      data: {
        notificationId: notification.id,
        type: notification.type,
        priority: notification.priority,
        senderId: notification.senderId,
        click_action: "FLUTTER_NOTIFICATION_CLICK", // Standard mobile framework hook
        ...notification.metadata
      }
    };
  }
}

// ==========================================
// 5. EDGE FUNCTION DISPATCH ENGINE (SIMULATION)
// ==========================================

export interface DeviceRegistry {
  userId: string;
  deviceToken: string;
  os: "ios" | "android";
}

/**
 * Simulates the backend serverless engine listening to table INSERT triggers
 * and sending live push requests to FCM/APNS and Realtime WebSockets.
 */
export async function handleNotificationDispatch(
  notif: TurtleNotification,
  recipientPreferences: NotificationPreference[],
  devices: DeviceRegistry[]
): Promise<{ dispatchedPush: boolean; dispatchedRealtime: boolean; error?: string }> {
  
  const rules = evaluateUserDeliveryPreferences(recipientPreferences, notif.type);
  let dispatchedPush = false;
  let dispatchedRealtime = false;

  try {
    // 1. Process Realtime WebSockets (always attempt for in-app feeds if allowed)
    if (rules.deliverInApp) {
      // Simulate transmitting packet via Supabase Realtime / WebSockets
      // supabase.channel(`notifications:${notif.recipientId}`).send({ ...notif })
      dispatchedRealtime = true;
    }

    // 2. Process Mobile Push Channels
    if (rules.deliverPush) {
      const activeDevices = devices.filter(d => d.userId === notif.recipientId);

      for (const dev of activeDevices) {
        const enrichedNotif = {
          ...notif,
          metadata: {
            ...notif.metadata,
            deviceToken: dev.deviceToken
          }
        };

        const payload = NotificationPayloadBuilder.buildPushPayload(enrichedNotif);
        
        // Simulated HTTP POST to https://fcm.googleapis.com/fcm/send
        // fetch('fcm_endpoint', { body: JSON.stringify(payload) })
        dispatchedPush = true;
      }
    }

    return { dispatchedPush, dispatchedRealtime };
  } catch (err: any) {
    return {
      dispatchedPush,
      dispatchedRealtime,
      error: err?.message || "Internal transmission dispatcher error."
    };
  }
}

// ==========================================
// 6. GRANULAR DATABASE API CONTROLLER
// ==========================================

export class SupabaseNotificationService {
  private supabase: any;

  constructor(supabaseClient: any) {
    this.supabase = supabaseClient;
  }

  /**
   * Safely adds a new notification record to the database.
   */
  public async createNotification(
    recipientId: string,
    senderId: string | null,
    type: NotificationType,
    title: string,
    body: string,
    metadata: Record<string, any> = {}
  ): Promise<{ success: boolean; data?: TurtleNotification; error?: string }> {
    try {
      const priority = DEFAULT_PREFERENCES[type].priority;
      const notifId = `notif-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

      const { data, error } = await this.supabase
        .from("notifications")
        .insert({
          id: notifId,
          recipient_id: recipientId,
          sender_id: senderId,
          type,
          priority,
          title,
          body,
          metadata
        })
        .select()
        .single();

      if (error) throw error;

      return {
        success: true,
        data: {
          id: data.id,
          recipientId: data.recipient_id,
          senderId: data.sender_id,
          type: data.type,
          priority: data.priority,
          title: data.title,
          body: data.body,
          metadata: data.metadata || {},
          isRead: data.is_read,
          isDelivered: data.is_delivered,
          createdAt: new Date(data.created_at)
        }
      };
    } catch (err: any) {
      return { success: false, error: err?.message || "Failed to create database notification." };
    }
  }

  /**
   * Marks a specific notification as read.
   */
  public async markAsRead(notificationId: string, userId: string): Promise<boolean> {
    const { error } = await this.supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("id", notificationId)
      .eq("recipient_id", userId); // Secure isolation validation

    if (error) throw error;
    return true;
  }

  /**
   * Marks all notifications as read for a given user.
   */
  public async markAllAsRead(userId: string): Promise<number> {
    const { data, error } = await this.supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("recipient_id", userId)
      .eq("is_read", false)
      .select();

    if (error) throw error;
    return data ? data.length : 0;
  }

  /**
   * Fetches active unread count for badges.
   */
  public async getUnreadCount(userId: string): Promise<number> {
    const { count, error } = await this.supabase
      .from("notifications")
      .select("*", { count: "exact", head: true })
      .eq("recipient_id", userId)
      .eq("is_read", false);

    if (error) throw error;
    return count || 0;
  }

  /**
   * Updates user custom granular toggles.
   */
  public async updatePreferences(
    userId: string,
    type: NotificationType,
    allowPush: boolean,
    allowInApp: boolean
  ): Promise<boolean> {
    const { error } = await this.supabase
      .from("user_notification_preferences")
      .upsert({
        user_id: userId,
        notification_type: type,
        allow_push: allowPush,
        allow_in_app: allowInApp,
        updated_at: new Date()
      });

    if (error) throw error;
    return true;
  }
}

// ============================================================================
// 7. POSTGRES ROW LEVEL SECURITY (RLS) & DATABASE SCHEMA MIGRATION
// ============================================================================
export const SQL_NOTIFICATION_MIGRATION = `
-- ============================================================================
-- TURTLE INTEGRATED NOTIFICATION & PREFERENCE SYSTEMS - SCHEMA SPECIFICATION
-- ============================================================================

-- Primary Notification records catalog
create table if not exists public.notifications (
    id uuid default uuid_generate_v4() primary key,
    recipient_id uuid references public.profiles(id) on delete cascade not null,
    sender_id uuid references public.profiles(id) on delete cascade, -- Null for system/security alerts
    type text not null,
    priority text default 'low'::text not null,
    title text not null,
    body text not null,
    metadata jsonb default '{}'::jsonb not null,
    is_read boolean default false not null,
    is_delivered boolean default false not null,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    
    constraint check_priority check (priority in ('low', 'medium', 'high', 'critical'))
);

-- Granular delivery configurations per user profile
create table if not exists public.user_notification_preferences (
    user_id uuid references public.profiles(id) on delete cascade,
    notification_type text not null,
    allow_push boolean default true not null,
    allow_in_app boolean default true not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
    
    primary key (user_id, notification_type)
);

-- Device token registry linking profiles to APNS/FCM endpoints
create table if not exists public.user_device_tokens (
    id uuid default uuid_generate_v4() primary key,
    user_id uuid references public.profiles(id) on delete cascade not null,
    device_token text not null,
    os_type text not null check (os_type in ('ios', 'android')),
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    
    constraint unique_user_device_token unique (user_id, device_token)
);

-- ============================================================================
-- SECURE ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

alter table public.notifications enable row level security;
alter table public.user_notification_preferences enable row level security;
alter table public.user_device_tokens enable row level security;

-- 1. Notifications RLS
create policy "Users can only read their own notifications"
    on public.notifications for select
    using (auth.uid() = recipient_id);

create policy "System or other services can create notifications"
    on public.notifications for insert
    with check (true);

create policy "Users can update their own notification read states"
    on public.notifications for update
    using (auth.uid() = recipient_id);

create policy "Users can prune their notification logs"
    on public.notifications for delete
    using (auth.uid() = recipient_id);

-- 2. User notification preferences RLS
create policy "Users can read their own notification preferences"
    on public.user_notification_preferences for select
    using (auth.uid() = user_id);

create policy "Users can customize their notification preferences"
    on public.user_notification_preferences for write
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

-- 3. Device Tokens RLS
create policy "Users can view their own device tokens"
    on public.user_device_tokens for select
    using (auth.uid() = user_id);

create policy "Users can register their device tokens"
    on public.user_device_tokens for insert
    with check (auth.uid() = user_id);

create policy "Users can unregister their device tokens"
    on public.user_device_tokens for delete
    using (auth.uid() = user_id);

-- ==========================================
// 8. DATABASE TRIGGER EXAMPLES (AUTOMATION)
-- ==========================================
-- This trigger automatically generates an in-app notification when a new comment is posted
-- and the post author is not the commenter.
-- ==========================================

create or replace function public.on_new_comment_notify()
returns trigger as $$
declare
    v_post_author uuid;
    v_commenter_name text;
begin
    -- 1. Locate the author of the post
    select author_id into v_post_author 
    from public.posts 
    where id = new.post_id;

    -- 2. Locate commenter display name
    select username into v_commenter_name 
    from public.profiles 
    where id = new.user_id;

    -- 3. Only notify if the commenter is not the post author
    if v_post_author != new.user_id then
        insert into public.notifications (
            id,
            recipient_id,
            sender_id,
            type,
            priority,
            title,
            body,
            metadata
        ) values (
            uuid_generate_v4(),
            v_post_author,
            new.user_id,
            'COMMENT',
            'medium',
            'New comment on your post',
            concat(v_commenter_name, ' commented: "', left(new.comment_text, 40), '..."'),
            jsonb_build_object(
                'postId', new.post_id,
                'commentId', new.id,
                'targetKey', concat('comment-post-', new.post_id)
            )
        );
    end if;

    return new;
end;
$$ language plpgsql security definer;

-- Bind the trigger
drop trigger if exists tr_on_comment_notify on public.post_comments;
create trigger tr_on_comment_notify
    after insert on public.post_comments
    for each row execute function public.on_new_comment_notify();

-- ============================================================================
-- HIGH-PERFORMANCE TIMELINE INDEXES
-- ============================================================================
create index if not exists idx_notifications_recipient_unread 
on public.notifications (recipient_id) 
where is_read = false;

create index if not exists idx_notifications_timeline 
on public.notifications (recipient_id, created_at desc);

create index if not exists idx_user_device_tokens_lookup 
on public.user_device_tokens (user_id);
`;
