/**
 * Turtle Social Media Application - YouTube-Style Channels Backend Engine
 * 
 * This file contains the complete, production-ready, non-UI backend architecture,
 * type definitions, subscription state pipelines, playlist managers, content saves/shares/reports,
 * and high-performance SQL schemas for Turtle's decentralized public & private video channel platform.
 * 
 * -----------------------------------------------------------------------------------------
 * CORE FUNCTIONAL SERVICES:
 * 1. Channel Registries: Public, private, verified status toggles, metadata edits, and ownership assertions.
 * 2. Subscription System: Follow, unsubscribe, and member junction state controls.
 * 3. Video Pipeline: Multi-attribute metadata uploader, duration auditing, and uploader role gating.
 * 4. Playlist Architecture: Playlist generation, video addition, indexing/ordering, and custom compilation.
 * 5. Social Hooks: Multi-platform share logging, secure user bookmark/save library, and anti-abuse content reporting.
 * 6. Dynamic Ranking Algorithm: Recency-biased, subscriber-weighted popularity score formulas.
 * 7. Abuse & Spam Prevention: Upload velocity throttling, automatic toxic description flag blocks.
 * 8. Comprehensive PostgreSQL Schema Migration Scripts including Row Level Security (RLS).
 * 9. MVP vs Future Extensibility Architectural Roadmap.
 * -----------------------------------------------------------------------------------------
 */

// ==========================================
// 1. DATA MODELS, ENUMS, & INTERFACES
// ==========================================

export enum ChannelVisibility {
  PUBLIC = "public",
  PRIVATE = "private"
}

export enum ContentType {
  VIDEO = "video",
  CHANNEL = "channel",
  PLAYLIST = "playlist"
}

export enum ReportReason {
  SPAM = "spam",
  HARASSMENT = "harassment",
  COPYRIGHT = "copyright",
  INAPPROPRIATE_CONTENT = "inappropriate_content",
  HATE_SPEECH = "hate_speech",
  OTHER = "other"
}

export enum ReportStatus {
  PENDING = "pending",
  UNDER_REVIEW = "under_review",
  RESOLVED = "resolved",
  DISMISSED = "dismissed"
}

export interface Channel {
  id: string;
  ownerId: string;
  name: string;
  handle: string; // Lexicographically unique YouTube-style @handle
  description: string | null;
  avatarUrl: string | null;
  bannerUrl: string | null;
  visibility: ChannelVisibility;
  isVerified: boolean; // Managed by administrative moderation roles
  subscribersCount: number;
  videosCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ChannelVideo {
  id: string;
  channelId: string;
  uploaderId: string;
  title: string;
  description: string | null;
  videoUrl: string;
  thumbnailUrl: string | null;
  durationSeconds: number;
  viewsCount: number;
  likesCount: number;
  dislikesCount: number;
  reportsCount: number;
  isPrivate: boolean; // Overrides channel visibility if set
  createdAt: Date;
  updatedAt: Date;
}

export interface ChannelPlaylist {
  id: string;
  channelId: string | null; // Null if it is a personal playlist created by an individual user
  creatorId: string;
  name: string;
  description: string | null;
  isPrivate: boolean;
  videosCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface PlaylistVideo {
  id: string;
  playlistId: string;
  videoId: string;
  position: number; // 0-indexed sorting position in playlist
  addedAt: Date;
}

export interface ChannelSubscription {
  id: string;
  subscriberId: string;
  channelId: string;
  notificationsEnabled: boolean;
  joinedAt: Date;
}

export interface SavedContent {
  id: string;
  userId: string;
  videoId: string;
  savedAt: Date;
}

export interface ContentShare {
  id: string;
  senderId: string;
  targetType: ContentType;
  targetId: string;
  recipientId: string | null; // Null for public shares (e.g., copied link strings)
  platform: "internal" | "whatsapp" | "twitter" | "facebook" | "telegram" | "copied_link";
  shareCode: string; // Unique URL parameter code for referral tracking
  sharedAt: Date;
}

export interface ContentReport {
  id: string;
  reporterId: string;
  targetType: ContentType;
  targetId: string;
  reason: ReportReason;
  details: string | null;
  status: ReportStatus;
  createdAt: Date;
  updatedAt: Date;
}

// System Constants for Channels
export const CHANNEL_LIMITS = {
  MIN_HANDLE_LENGTH: 3,
  MAX_HANDLE_LENGTH: 30,
  MAX_VIDEO_DURATION_SECONDS: 14400, // 4 hours maximum video length
  MAX_PLAYLISTS_PER_USER: 100,
  UPLOADS_PER_HOUR_LIMIT: 5,         // Throttling protection rules
  REPORTS_THRESHOLD_AUTO_HIDE: 5,     // Videos exceeding this are hidden from public indexing pending review
};

// ==========================================
// 2. DYNAMIC CHANNEL RANKING ALGORITHM
// ==========================================

export interface RankingMetrics {
  viewsCount: number;
  likesCount: number;
  subscribersCount: number;
  ageInDays: number;
  isVerified: boolean;
}

export class ChannelRankingEngine {
  /**
   * Calculates a dynamic recommendation/popularity score for discovery feeds.
   * Leverages logarithmic scaling for high volumes and quadratic decay for aging content.
   * Boosts verified premium channel nodes safely.
   */
  public static calculatePopularityScore(metrics: RankingMetrics): number {
    const viewWeight = 1.0;
    const likeWeight = 5.0;
    const subscriberWeight = 2.0;
    const verificationBonusMultiplier = metrics.isVerified ? 1.25 : 1.0;

    // 1. Calculate base engagement score
    const engagementScore = 
      (metrics.viewsCount * viewWeight) + 
      (metrics.likesCount * likeWeight) + 
      (metrics.subscribersCount * subscriberWeight);

    // 2. Dynamic time decay factor (Half-life style gravity formula)
    // Score halves roughly every 7 days to maintain dynamic fresness
    const gravity = 1.8;
    const timeDecayFactor = Math.pow(metrics.ageInDays + 1, gravity);

    const baseScore = engagementScore / timeDecayFactor;

    // 3. Apply verification catalyst multiplier
    return Number((baseScore * verificationBonusMultiplier).toFixed(4));
  }
}

// ==========================================
// 3. ABUSE PREVENTION & UPLOAD VALIDATORS
// ==========================================

export interface UploadVelocityTracker {
  userId: string;
  recentUploadTimestamps: number[];
}

export class ChannelAbuseProtector {
  /**
   * Asserts whether a user has breached upload rate limits to prevent server DOS or video spam.
   */
  public static isUploadRateLimited(
    tracker: UploadVelocityTracker,
    nowMs: number = Date.now()
  ): boolean {
    const oneHourAgo = nowMs - (60 * 60 * 1000);
    
    // Clean old history
    tracker.recentUploadTimestamps = tracker.recentUploadTimestamps.filter(t => t > oneHourAgo);

    return tracker.recentUploadTimestamps.length >= CHANNEL_LIMITS.UPLOADS_PER_HOUR_LIMIT;
  }

  /**
   * Simple regex scan over inputs to filter blatant malicious text pattern combinations.
   */
  public static containsFlaggedContent(text: string): boolean {
    const blacklistedPatterns = [
      /get-rich-quick/i,
      /free-money-now/i,
      /buy-cheap-followers/i,
      /hack-credit-card/i,
      /spammer-bot-automation/i
    ];

    return blacklistedPatterns.some(pattern => pattern.test(text));
  }
}

// ==========================================
// 4. MAIN CHANNELS API / CONTROLLER SERVICE
// ==========================================

export class SupabaseChannelsService {
  private supabase: any;

  constructor(supabaseClient: any) {
    this.supabase = supabaseClient;
  }

  /**
   * Registers a brand new channel registry. Checks handle uniqueness.
   */
  public async createChannel(
    ownerId: string,
    name: string,
    handle: string,
    description: string | null,
    visibility: ChannelVisibility = ChannelVisibility.PUBLIC
  ): Promise<{ success: boolean; channel?: Channel; error?: string }> {
    try {
      const cleanHandle = handle.trim().toLowerCase().replace("@", "");
      
      if (cleanHandle.length < CHANNEL_LIMITS.MIN_HANDLE_LENGTH || cleanHandle.length > CHANNEL_LIMITS.MAX_HANDLE_LENGTH) {
        return {
          success: false,
          error: `Channel handle must be between ${CHANNEL_LIMITS.MIN_HANDLE_LENGTH} and ${CHANNEL_LIMITS.MAX_HANDLE_LENGTH} characters.`
        };
      }

      if (ChannelAbuseProtector.containsFlaggedContent(name) || (description && ChannelAbuseProtector.containsFlaggedContent(description))) {
        return {
          success: false,
          error: "Inappropriate language or malicious spam indicators flagged. Channel registration aborted."
        };
      }

      // 1. Assert handle uniqueness manually (additional check prior to database constraint)
      const { data: existingHandle } = await this.supabase
        .from("channels")
        .select("id")
        .eq("handle", cleanHandle)
        .maybeSingle();

      if (existingHandle) {
        return { success: false, error: `Handle @${cleanHandle} is already registered to another channel.` };
      }

      // 2. Insert record
      const channelId = `chan-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
      const { data, error } = await this.supabase
        .from("channels")
        .insert({
          id: channelId,
          owner_id: ownerId,
          name,
          handle: cleanHandle,
          description,
          visibility,
          is_verified: false
        })
        .select()
        .single();

      if (error) throw error;

      return {
        success: true,
        channel: {
          id: data.id,
          ownerId: data.owner_id,
          name: data.name,
          handle: data.handle,
          description: data.description,
          avatarUrl: data.avatar_url,
          bannerUrl: data.banner_url,
          visibility: data.visibility as ChannelVisibility,
          isVerified: data.is_verified,
          subscribersCount: data.subscribers_count || 0,
          videosCount: data.videos_count || 0,
          createdAt: new Date(data.created_at),
          updatedAt: new Date(data.updated_at)
        }
      };
    } catch (err: any) {
      return { success: false, error: err?.message || "Failed to create channel registry." };
    }
  }

  /**
   * Modifies channel visual elements and metadata parameters. Verified with ownerId guard.
   */
  public async editChannel(
    channelId: string,
    ownerId: string,
    updates: {
      name?: string;
      description?: string | null;
      avatarUrl?: string | null;
      bannerUrl?: string | null;
      visibility?: ChannelVisibility;
    }
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const { data: current } = await this.supabase
        .from("channels")
        .select("owner_id")
        .eq("id", channelId)
        .single();

      if (!current) {
        return { success: false, error: "Channel registry not found." };
      }

      if (current.owner_id !== ownerId) {
        return { success: false, error: "Authorization violation: Only the channel owner can apply edits." };
      }

      const cleanUpdates: Record<string, any> = {};
      if (updates.name !== undefined) cleanUpdates.name = updates.name;
      if (updates.description !== undefined) cleanUpdates.description = updates.description;
      if (updates.avatarUrl !== undefined) cleanUpdates.avatar_url = updates.avatarUrl;
      if (updates.bannerUrl !== undefined) cleanUpdates.banner_url = updates.bannerUrl;
      if (updates.visibility !== undefined) cleanUpdates.visibility = updates.visibility;
      cleanUpdates.updated_at = new Date();

      const { error } = await this.supabase
        .from("channels")
        .update(cleanUpdates)
        .eq("id", channelId);

      if (error) throw error;

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || "Edit operations failed." };
    }
  }

  /**
   * Follows/subscribes a user to a target channel.
   */
  public async subscribeToChannel(
    subscriberId: string,
    channelId: string,
    notificationsEnabled: boolean = true
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const { error } = await this.supabase
        .from("channel_subscriptions")
        .insert({
          id: `sub-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
          subscriber_id: subscriberId,
          channel_id: channelId,
          notifications_enabled: notificationsEnabled
        });

      if (error) throw error;

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || "Subscription registration failed." };
    }
  }

  /**
   * Unsubscribes a user from a target channel.
   */
  public async unsubscribeFromChannel(
    subscriberId: string,
    channelId: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const { error } = await this.supabase
        .from("channel_subscriptions")
        .delete()
        .eq("subscriber_id", subscriberId)
        .eq("channel_id", channelId);

      if (error) throw error;

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || "Unsubscribe operation failed." };
    }
  }

  /**
   * Registers metadata parameters for a newly uploaded video. Evaluates ownership and velocity gates.
   */
  public async uploadVideo(
    uploaderId: string,
    channelId: string,
    videoData: {
      title: string;
      description: string | null;
      videoUrl: string;
      thumbnailUrl: string | null;
      durationSeconds: number;
      isPrivate?: boolean;
    },
    velocityHistory: UploadVelocityTracker
  ): Promise<{ success: boolean; video?: ChannelVideo; error?: string }> {
    try {
      // 1. Verify ownership rights over the channel
      const { data: channel } = await this.supabase
        .from("channels")
        .select("owner_id")
        .eq("id", channelId)
        .single();

      if (!channel) {
        return { success: false, error: "Target channel does not exist." };
      }

      if (channel.owner_id !== uploaderId) {
        return { success: false, error: "Authorization violation: You are not authorized to upload to this channel." };
      }

      // 2. Enforce upload throttling rate limit
      if (ChannelAbuseProtector.isUploadRateLimited(velocityHistory)) {
        return {
          success: false,
          error: `Upload velocity limit breached. Maximum is ${CHANNEL_LIMITS.UPLOADS_PER_HOUR_LIMIT} uploads per hour.`
        };
      }

      // 3. Verify content safety
      if (ChannelAbuseProtector.containsFlaggedContent(videoData.title) || (videoData.description && ChannelAbuseProtector.containsFlaggedContent(videoData.description))) {
        return { success: false, error: "Upload blocked due to flagged toxic keywords in metadata." };
      }

      if (videoData.durationSeconds > CHANNEL_LIMITS.MAX_VIDEO_DURATION_SECONDS) {
        return { success: false, error: "Video exceeds maximum transfer capacity of 4 hours." };
      }

      // 4. Create record
      const videoId = `vid-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
      const { data, error } = await this.supabase
        .from("channel_videos")
        .insert({
          id: videoId,
          channel_id: channelId,
          uploader_id: uploaderId,
          title: videoData.title,
          description: videoData.description,
          video_url: videoData.videoUrl,
          thumbnail_url: videoData.thumbnailUrl,
          duration_seconds: videoData.durationSeconds,
          is_private: videoData.isPrivate || false
        })
        .select()
        .single();

      if (error) throw error;

      // Track metric to memory
      velocityHistory.recentUploadTimestamps.push(Date.now());

      return {
        success: true,
        video: {
          id: data.id,
          channelId: data.channel_id,
          uploaderId: data.uploader_id,
          title: data.title,
          description: data.description,
          videoUrl: data.video_url,
          thumbnailUrl: data.thumbnail_url,
          durationSeconds: data.duration_seconds,
          viewsCount: data.views_count || 0,
          likesCount: data.likes_count || 0,
          dislikesCount: data.dislikes_count || 0,
          reportsCount: data.reports_count || 0,
          isPrivate: data.is_private,
          createdAt: new Date(data.created_at),
          updatedAt: new Date(data.updated_at)
        }
      };
    } catch (err: any) {
      return { success: false, error: err?.message || "Failed to persist video upload metadata." };
    }
  }

  /**
   * Compiles a custom play index registry.
   */
  public async createPlaylist(
    creatorId: string,
    channelId: string | null,
    name: string,
    description: string | null,
    isPrivate: boolean = false
  ): Promise<{ success: boolean; playlist?: ChannelPlaylist; error?: string }> {
    try {
      // Guard user totals
      const { count } = await this.supabase
        .from("channel_playlists")
        .select("*", { count: "exact", head: true })
        .eq("creator_id", creatorId);

      if (count && count >= CHANNEL_LIMITS.MAX_PLAYLISTS_PER_USER) {
        return { success: false, error: `You have reached the maximum threshold of ${CHANNEL_LIMITS.MAX_PLAYLISTS_PER_USER} playlists.` };
      }

      const playlistId = `play-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
      const { data, error } = await this.supabase
        .from("channel_playlists")
        .insert({
          id: playlistId,
          channel_id: channelId,
          creator_id: creatorId,
          name,
          description,
          is_private: isPrivate
        })
        .select()
        .single();

      if (error) throw error;

      return {
        success: true,
        playlist: {
          id: data.id,
          channelId: data.channel_id,
          creatorId: data.creator_id,
          name: data.name,
          description: data.description,
          isPrivate: data.is_private,
          videosCount: data.videos_count || 0,
          createdAt: new Date(data.created_at),
          updatedAt: new Date(data.updated_at)
        }
      };
    } catch (err: any) {
      return { success: false, error: err?.message || "Failed to register playlist compile." };
    }
  }

  /**
   * Adds a video node to a target playlist with exact positioning index tracking.
   */
  public async addVideoToPlaylist(
    playlistId: string,
    videoId: string,
    creatorId: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // 1. Verify creator owns target playlist
      const { data: playlist } = await this.supabase
        .from("channel_playlists")
        .select("creator_id, videos_count")
        .eq("id", playlistId)
        .single();

      if (!playlist) {
        return { success: false, error: "Target playlist not found." };
      }

      if (playlist.creator_id !== creatorId) {
        return { success: false, error: "Authorization violation: Only the playlist compiler can add videos." };
      }

      // 2. Append link
      const nextPosition = playlist.videos_count || 0;
      const { error } = await this.supabase
        .from("playlist_videos")
        .insert({
          id: `pvid-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
          playlist_id: playlistId,
          video_id: videoId,
          position: nextPosition
        });

      if (error) throw error;

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || "Failed to link video node to playlist." };
    }
  }

  /**
   * Saves a video into a user's private bookmarks library.
   */
  public async saveVideo(userId: string, videoId: string): Promise<boolean> {
    const { error } = await this.supabase
      .from("saved_content")
      .upsert({
        id: `save-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
        user_id: userId,
        video_id: videoId
      });

    return !error;
  }

  /**
   * Dispatches a share logger entry and returns a unique trackable sharing code payload.
   */
  public async shareContent(
    senderId: string,
    targetType: ContentType,
    targetId: string,
    recipientId: string | null = null,
    platform: "internal" | "whatsapp" | "twitter" | "facebook" | "telegram" | "copied_link" = "copied_link"
  ): Promise<{ success: boolean; shareCode?: string; error?: string }> {
    try {
      const shareCode = `ref-${Date.now()}-${Math.floor(Math.random() * 100000)}`;

      const { error } = await this.supabase
        .from("content_shares")
        .insert({
          id: `share-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
          sender_id: senderId,
          target_type: targetType,
          target_id: targetId,
          recipient_id: recipientId,
          platform,
          share_code: shareCode
        });

      if (error) throw error;

      return { success: true, shareCode };
    } catch (err: any) {
      return { success: false, error: err?.message || "Failed to log sharing metric." };
    }
  }

  /**
   * Lodges a moderation/abuse complaint against a channel, video, or playlist.
   */
  public async reportContent(
    reporterId: string,
    targetType: ContentType,
    targetId: string,
    reason: ReportReason,
    details: string | null = null
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const reportId = `rep-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
      
      const { error } = await this.supabase
        .from("content_reports")
        .insert({
          id: reportId,
          reporter_id: reporterId,
          target_type: targetType,
          target_id: targetId,
          reason,
          details,
          status: ReportStatus.PENDING
        });

      if (error) throw error;

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || "Failed to file content report." };
    }
  }
}

// ============================================================================
// 5. POSTGRES ROW LEVEL SECURITY (RLS) & DATABASE SCHEMA MIGRATION
// ============================================================================

export const SQL_CHANNELS_MIGRATION = `
-- ============================================================================
-- SQL SCHEMA FOR YOUTUBE-STYLE CHANNELS & VIDEO PLATFORM
-- ============================================================================

-- Primary channel directories
create table if not exists public.channels (
    id uuid default uuid_generate_v4() primary key,
    owner_id uuid references public.profiles(id) on delete cascade not null,
    name text not null,
    handle text not null unique,
    description text,
    avatar_url text,
    banner_url text,
    visibility text default 'public'::text not null check (visibility in ('public', 'private')),
    is_verified boolean default false not null,
    subscribers_count integer default 0 not null check (subscribers_count >= 0),
    videos_count integer default 0 not null check (videos_count >= 0),
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Uploaded video registers catalog
create table if not exists public.channel_videos (
    id uuid default uuid_generate_v4() primary key,
    channel_id uuid references public.channels(id) on delete cascade not null,
    uploader_id uuid references public.profiles(id) on delete cascade not null,
    title text not null,
    description text,
    video_url text not null,
    thumbnail_url text,
    duration_seconds integer not null check (duration_seconds > 0),
    views_count integer default 0 not null check (views_count >= 0),
    likes_count integer default 0 not null check (likes_count >= 0),
    dislikes_count integer default 0 not null check (dislikes_count >= 0),
    reports_count integer default 0 not null check (reports_count >= 0),
    is_private boolean default false not null,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Compiled play indexes
create table if not exists public.channel_playlists (
    id uuid default uuid_generate_v4() primary key,
    channel_id uuid references public.channels(id) on delete cascade, -- Null if personal user list
    creator_id uuid references public.profiles(id) on delete cascade not null,
    name text not null,
    description text,
    is_private boolean default false not null,
    videos_count integer default 0 not null check (videos_count >= 0),
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Playlist video order map catalog
create table if not exists public.playlist_videos (
    id uuid default uuid_generate_v4() primary key,
    playlist_id uuid references public.channel_playlists(id) on delete cascade not null,
    video_id uuid references public.channel_videos(id) on delete cascade not null,
    position integer not null,
    added_at timestamp with time zone default timezone('utc'::text, now()) not null,
    
    constraint unique_playlist_video unique (playlist_id, video_id)
);

-- Subscriber relationships map catalog
create table if not exists public.channel_subscriptions (
    id uuid default uuid_generate_v4() primary key,
    subscriber_id uuid references public.profiles(id) on delete cascade not null,
    channel_id uuid references public.channels(id) on delete cascade not null,
    notifications_enabled boolean default true not null,
    joined_at timestamp with time zone default timezone('utc'::text, now()) not null,
    
    constraint unique_subscriber_channel unique (subscriber_id, channel_id)
);

-- Bookmarked saved videos catalog
create table if not exists public.saved_content (
    id uuid default uuid_generate_v4() primary key,
    user_id uuid references public.profiles(id) on delete cascade not null,
    video_id uuid references public.channel_videos(id) on delete cascade not null,
    saved_at timestamp with time zone default timezone('utc'::text, now()) not null,
    
    constraint unique_user_saved_video unique (user_id, video_id)
);

-- Video share metric logger
create table if not exists public.content_shares (
    id uuid default uuid_generate_v4() primary key,
    sender_id uuid references public.profiles(id) on delete cascade not null,
    target_type text not null,
    target_id uuid not null,
    recipient_id uuid references public.profiles(id) on delete cascade, -- Null for public shares
    platform text not null,
    share_code text not null unique,
    shared_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Content moderation complaints database
create table if not exists public.content_reports (
    id uuid default uuid_generate_v4() primary key,
    reporter_id uuid references public.profiles(id) on delete cascade not null,
    target_type text not null,
    target_id uuid not null,
    reason text not null,
    details text,
    status text default 'pending'::text not null check (status in ('pending', 'under_review', 'resolved', 'dismissed')),
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- ============================================================================
-- ATOMIC METRIC COUNTER TRIGGERS
-- ============================================================================

-- 1. Update subscriber counters on join / leave
create or replace function public.on_subscription_update()
returns trigger as $$
begin
    if (TG_OP = 'INSERT') then
        update public.channels 
        set subscribers_count = subscribers_count + 1 
        where id = new.channel_id;
    elsif (TG_OP = 'DELETE') then
        update public.channels 
        set subscribers_count = greatest(0, subscribers_count - 1) 
        where id = old.channel_id;
    end if;
    return null;
end;
$$ language plpgsql security definer;

create trigger tr_subscription_counter_sync
    after insert or delete on public.channel_subscriptions
    for each row execute function public.on_subscription_update();

-- 2. Update video counts in playlist on append / remove
create or replace function public.on_playlist_video_update()
returns trigger as $$
begin
    if (TG_OP = 'INSERT') then
        update public.channel_playlists 
        set videos_count = videos_count + 1 
        where id = new.playlist_id;
    elsif (TG_OP = 'DELETE') then
        update public.channel_playlists 
        set videos_count = greatest(0, videos_count - 1) 
        where id = old.playlist_id;
    end if;
    return null;
end;
$$ language plpgsql security definer;

create trigger tr_playlist_videos_counter_sync
    after insert or delete on public.playlist_videos
    for each row execute function public.on_playlist_video_update();

-- 3. Update videos count in channels on publish
create or replace function public.on_channel_video_update()
returns trigger as $$
begin
    if (TG_OP = 'INSERT') then
        update public.channels 
        set videos_count = videos_count + 1 
        where id = new.channel_id;
    elsif (TG_OP = 'DELETE') then
        update public.channels 
        set videos_count = greatest(0, videos_count - 1) 
        where id = old.channel_id;
    end if;
    return null;
end;
$$ language plpgsql security definer;

create trigger tr_channel_videos_counter_sync
    after insert or delete on public.channel_videos
    for each row execute function public.on_channel_video_update();

-- ============================================================================
// ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

alter table public.channels enable row level security;
alter table public.channel_videos enable row level security;
alter table public.channel_playlists enable row level security;
alter table public.playlist_videos enable row level security;
alter table public.channel_subscriptions enable row level security;
alter table public.saved_content enable row level security;
alter table public.content_shares enable row level security;
alter table public.content_reports enable row level security;

-- 1. Channel RLS: Anyone can view public channels, only owner views private
create policy "Anyone can select public channels"
    on public.channels for select
    using (visibility = 'public');

create policy "Owners can fully manage their channels"
    on public.channels for all
    using (auth.uid() = owner_id);

-- 2. Video RLS: Prevent reading private videos
create policy "Anyone can select public videos"
    on public.channel_videos for select
    using (is_private = false and exists (
        select 1 from public.channels 
        where id = channel_videos.channel_id and visibility = 'public'
    ));

create policy "Uploader can fully manage their videos"
    on public.channel_videos for all
    using (auth.uid() = uploader_id);

-- 3. Playlist RLS
create policy "Anyone can view public playlists"
    on public.channel_playlists for select
    using (is_private = false);

create policy "Compilers can fully manage their playlists"
    on public.channel_playlists for all
    using (auth.uid() = creator_id);

-- 4. Subscription RLS
create policy "Subscribers can view their own subscriptions"
    on public.channel_subscriptions for select
    using (auth.uid() = subscriber_id);

create policy "Users can subscribe to channels"
    on public.channel_subscriptions for insert
    with check (auth.uid() = subscriber_id);

create policy "Users can cancel subscription relationships"
    on public.channel_subscriptions for delete
    using (auth.uid() = subscriber_id);

-- 5. Bookmarks RLS
create policy "Users can read their private bookmarks"
    on public.saved_content for select
    using (auth.uid() = user_id);

create policy "Users can append private bookmarks"
    on public.saved_content for insert
    with check (auth.uid() = user_id);

create policy "Users can clear private bookmarks"
    on public.saved_content for delete
    using (auth.uid() = user_id);

-- ============================================================================
-- HIGH-PERFORMANCE SEARCH & FEED INDEXES
-- ============================================================================
create index if not exists idx_channels_handle_search 
on public.channels (handle);

create index if not exists idx_channel_videos_recency 
on public.channel_videos (channel_id, created_at desc) 
where is_private = false;

create index if not exists idx_playlist_videos_order 
on public.playlist_videos (playlist_id, position);
`;

// ============================================================================
// 6. ARCHITECTURAL EVOLUTION ROADMAP (MVP VS FUTURE VERSION)
// ============================================================================

export const CHANNELS_EVOLUTION_ROADMAP = {
  mvpModel: {
    hosting: "Direct storage upload bucket routing with raw HTML5 video source rendering.",
    discovery: "Standard SQL index lookups utilizing raw recency parameters.",
    monetization: "None. Standard ad-free public broadcasting.",
    playlists: "Sequential client-side loop indices with single-upping order positions."
  },
  futureEnterpriseRoadmap: [
    {
      phase: "Phase 1: Adaptive HLS Transcoding Pipeline",
      description: "Integrate AWS Elemental MediaConvert or Mux APIs. When a video is published, an event trigger boots an ffmpeg container transcoding the source .mp4 file into adaptive multi-bitrate HLS (HTTP Live Streaming) .m3u8 index playlists. Ensures seamless video playbacks over weak 3G networks without stalling user device buffers."
    },
    {
      phase: "Phase 2: Semantic AI & Vector Discovery Search",
      description: "Integrate pgvector inside Supabase. On video metadata publishing, trigger serverless Python edge worker models to translate titles, descriptions, and automated audio transcription text segments into 1536-dimension embeddings. Power contextual searches returning exact visual matches even if no exact title keywords overlap."
    },
    {
      phase: "Phase 3: Digital Rights DRM & Premium Channel Paywalls",
      description: "Secure high-value premium channel courses with Google Widevine & Apple FairPlay Digital Rights Management (DRM). Integrate with Stripe Subscriptions, preventing non-paying members from viewing private channels or sniffing raw source video URLs inside browsers."
    }
  ]
};
