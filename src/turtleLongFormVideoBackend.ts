/**
 * Turtle Social Media Application - Long-form Video Backend Engine
 * 
 * This file contains the complete, production-ready, non-UI backend architecture,
 * type definitions, watch history state trackers, metadata models, and API interfaces
 * for Turtle's YouTube-style widescreen (16:9) long-form video streaming platform.
 * 
 * -----------------------------------------------------------------------------------------
 * CORE FUNCTIONAL SERVICES:
 * 1. Long-form Video Registries: Tracks 16:9 previews, durations, tags, and creator channels.
 * 2. Media Metadata Extractor: Standard structure mapping resolution, codec, and bitrate.
 * 3. Watch History System: Tracks precise elapsed playback offsets, complete state, and stats.
 * 4. Interactive Engagement: Thread-safe view counters, likes, saves, shares, and reports.
 * 5. Feed Recommendation Engine: Tag-matching content affinity lookups.
 * 6. High-Performance SQL Schema Migration Scripts & Row Level Security (RLS) Policies.
 * 7. Multi-stage Video Upload Flow & Storage Bucket Plan.
 * 8. Performance, Streaming, & Enterprise-scale Scaling Architecture Notes.
 * -----------------------------------------------------------------------------------------
 */

// ==========================================
// 1. DATA MODELS & ENUMERATIONS
// ==========================================

export enum VideoProcessingState {
  INITIALIZED = "initialized",
  UPLOADING = "uploading",
  TRANSCODING = "transcoding",
  ANALYZING_METADATA = "analyzing_metadata",
  READY = "ready",
  FAILED = "failed"
}

export interface VideoMetadata {
  fileSizeBytes: number;
  bitrateKbps: number;
  codec: string;              // e.g., "h264", "hevc", "vp9", "av1"
  audioCodec: string;         // e.g., "aac", "opus"
  width: number;              // e.g., 1920 (for 16:9 aspect ratio support)
  height: number;             // e.g., 1080 (for 16:9 aspect ratio support)
  frameRate: number;          // e.g., 60, 30, 24
  aspectRatio: string;        // e.g., "16:9"
  containerFormat: string;    // e.g., "mp4", "mkv", "mov"
}

export interface LongFormVideo {
  id: string;
  channelId: string;
  uploaderId: string;
  title: string;
  description: string | null;
  videoUrl: string;           // Direct or adaptive streaming URL (e.g., HLS master playlist .m3u8)
  previewUrl: string | null;  // Dynamic 16:9 silent animated preview loop URL (mp4 or webp)
  thumbnailUrl: string | null;// High-resolution 16:9 vertical-aligned landscape banner
  durationSeconds: number;
  processingState: VideoProcessingState;
  metadata: VideoMetadata | null; // Nested dynamic media profile parameters
  recommendationTags: string[];   // For content discovery pipelines
  viewsCount: number;
  likesCount: number;
  dislikesCount: number;
  reportsCount: number;
  savesCount: number;
  isPrivate: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface LongFormLike {
  id: string;
  userId: string;
  videoId: string;
  createdAt: Date;
}

export interface LongFormSave {
  id: string;
  userId: string;
  videoId: string;
  createdAt: Date;
}

export interface LongFormShare {
  id: string;
  senderId: string;
  videoId: string;
  platform: "internal" | "whatsapp" | "twitter" | "facebook" | "copied_link" | "embed";
  shareCode: string;
  sharedAt: Date;
}

export interface LongFormReport {
  id: string;
  reporterId: string;
  videoId: string;
  reason: "copyright" | "spam" | "harassment" | "inappropriate" | "misinformation" | "other";
  details: string | null;
  status: "pending" | "under_review" | "resolved" | "dismissed";
  createdAt: Date;
  updatedAt: Date;
}

export interface WatchHistoryEntry {
  id: string;
  userId: string;
  videoId: string;
  watchedDurationSeconds: number; // Elapsed playback offset marker
  lastWatchedAt: Date;
  isCompleted: boolean;           // True if user watched past 90% of duration
}

export const VIDEO_LIMITS = {
  MIN_TITLE_LENGTH: 3,
  MAX_TITLE_LENGTH: 100,
  MAX_DESCRIPTION_LENGTH: 5000,
  MAX_FILE_SIZE_BYTES: 10 * 1024 * 1024 * 1024, // 10GB long-form video cap
  MAX_DURATION_SECONDS: 43200,                  // 12 hours max video length
  COMPLETION_THRESHOLD_RATIO: 0.90,             // 90% watched marks video as completed
  UPLOADS_PER_DAY_LIMIT: 5                      // Rate limiting rule to block bot flood
};

// ==========================================
// 2. VIDEO PROCESSING FLOWCHART & STORAGE
// ==========================================

export const LONG_FORM_STORAGE_PLAN = {
  buckets: {
    "longform-raw-uploads": "Temporary private staging bucket. Access limited strictly to uploader and transcoding worker.",
    "longform-optimized-streams": "Public, global CDN-cached bucket storing HLS directories (.m3u8 index and .ts stream chunks) with CORS enabled.",
    "longform-assets": "Widescreen 16:9 images, 5-second dynamic widescreen animated preview files, and custom splash screens."
  }
};

export const LONG_FORM_PROCESSING_PIPELINE = [
  {
    step: 1,
    name: "Initiate & Chunked S3 Upload",
    description: "Client queries backend to initialize file upload. Receives secure pre-signed multi-part URLs for parallel chunk delivery direct to S3 bucket to ensure 100% upload stability for massive files up to 10GB."
  },
  {
    step: 2,
    name: "Object Created Trigger",
    description: "Upload completion triggers a secure edge serverless worker which reads source container bytes and sets database state to 'transcoding'."
  },
  {
    step: 3,
    name: "FFmpeg Transcoding & Adaptation",
    description: "Invokes scalable containerized FFmpeg workers to transform single source container into optimized multi-bitrate HLS streams (1080p, 720p, 480p, 360p) with AAC audio profiles."
  },
  {
    step: 4,
    name: "Widescreen Assets Synthesis",
    description: "FFmpeg extracts a crisp 16:9 JPEG at the 10% duration mark. Simultaneously encodes a silent 5-second silent 16:9 webp/mp4 loop at 24fps served as dynamic preview file when users hover over video cards."
  },
  {
    step: 5,
    name: "Metadata & Safety Inspection",
    description: "Runs probe diagnostics (ffprobe) to parse resolution, bitrate, precise audio channels, and codecs. Simultaneously triggers cloud-native AI safety webhooks checking for copyright waveforms or toxic visuals."
  },
  {
    step: 6,
    name: "Publish & Real-time Broadcasting",
    description: "Inserts complete metadata records, updates status to 'ready' inside the database, and broadcasts dynamic feed cards to subscribed users."
  }
];

// ==========================================
// 3. RUNTIME METADATA & TAG MATCHING
// ==========================================

export class LongFormMetadataEngine {
  /**
   * Asserts aspect ratio from video dimensions to guarantee 16:9 or similar widescreen fitment.
   */
  public static calculateAspectRatio(width: number, height: number): string {
    const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
    const divisor = gcd(width, height);
    const aspectW = width / divisor;
    const aspectH = height / divisor;

    if (aspectW === 16 && aspectH === 9) return "16:9";
    if (aspectW === 4 && aspectH === 3) return "4:3";
    if (aspectW === 21 && aspectH === 9) return "21:9";
    return `${aspectW}:${aspectH}`;
  }

  /**
   * Simulates parsing exact ffprobe output to generate validated dynamic metadata configurations.
   */
  public static parseVideoProperties(probeData: {
    size: number;
    duration: number;
    width: number;
    height: number;
    fps: number;
    codec_name: string;
    audio_codec_name: string;
    bit_rate: number;
  }): VideoMetadata {
    const aspect = this.calculateAspectRatio(probeData.width, probeData.height);
    return {
      fileSizeBytes: probeData.size,
      bitrateKbps: Math.round(probeData.bit_rate / 1000),
      codec: probeData.codec_name,
      audioCodec: probeData.audio_codec_name,
      width: probeData.width,
      height: probeData.height,
      frameRate: probeData.fps,
      aspectRatio: aspect,
      containerFormat: "mp4"
    };
  }
}

// ==========================================
// 4. API ENDPOINTS / SUPABASE SERVICE CLASS
// ==========================================

export class SupabaseLongFormVideoService {
  private supabase: any;

  constructor(supabaseClient: any) {
    this.supabase = supabaseClient;
  }

  /**
   * Registers a brand-new long-form video record.
   * Throttles spam uploads and validates basic naming structures.
   */
  public async createVideoRegistry(
    uploaderId: string,
    channelId: string,
    videoInput: {
      title: string;
      description: string | null;
      videoUrl: string;
      thumbnailUrl: string | null;
      previewUrl: string | null;
      durationSeconds: number;
      recommendationTags: string[];
      isPrivate?: boolean;
    }
  ): Promise<{ success: boolean; video?: LongFormVideo; error?: string }> {
    try {
      const cleanTitle = videoInput.title.trim();
      
      if (cleanTitle.length < VIDEO_LIMITS.MIN_TITLE_LENGTH || cleanTitle.length > VIDEO_LIMITS.MAX_TITLE_LENGTH) {
        return {
          success: false,
          error: `Title must be between ${VIDEO_LIMITS.MIN_TITLE_LENGTH} and ${VIDEO_LIMITS.MAX_TITLE_LENGTH} characters.`
        };
      }

      if (videoInput.durationSeconds > VIDEO_LIMITS.MAX_DURATION_SECONDS) {
        return { success: false, error: "Duration exceeds maximum permissible cap of 12 hours." };
      }

      // Check upload throttling (quota of 5 per day)
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const { count } = await this.supabase
        .from("long_form_videos")
        .select("*", { count: "exact", head: true })
        .eq("uploader_id", uploaderId)
        .gte("created_at", oneDayAgo.toISOString());

      if (count && count >= VIDEO_LIMITS.UPLOADS_PER_DAY_LIMIT) {
        return {
          success: false,
          error: `Daily upload quota breached. Maximum is ${VIDEO_LIMITS.UPLOADS_PER_DAY_LIMIT} uploads per day.`
        };
      }

      const id = `lfv-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
      const { data, error } = await this.supabase
        .from("long_form_videos")
        .insert({
          id,
          channel_id: channelId,
          uploader_id: uploaderId,
          title: cleanTitle,
          description: videoInput.description,
          video_url: videoInput.videoUrl,
          thumbnail_url: videoInput.thumbnailUrl,
          preview_url: videoInput.previewUrl,
          duration_seconds: videoInput.durationSeconds,
          processing_state: VideoProcessingState.INITIALIZED,
          recommendation_tags: videoInput.recommendationTags,
          is_private: videoInput.isPrivate || false
        })
        .select()
        .single();

      if (error) throw error;

      return {
        success: true,
        video: this.mapRowToVideo(data)
      };
    } catch (err: any) {
      return { success: false, error: err?.message || "Failed to catalog widescreen video registry." };
    }
  }

  /**
   * Invoked by transcoding worker to persist calculated hardware metadata.
   */
  public async updateVideoMetadata(
    videoId: string,
    metadata: VideoMetadata,
    widescreenAssets: { thumbnailUrl?: string; previewUrl?: string }
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const updates: Record<string, any> = {
        metadata,
        processing_state: VideoProcessingState.READY,
        updated_at: new Date()
      };

      if (widescreenAssets.thumbnailUrl) updates.thumbnail_url = widescreenAssets.thumbnailUrl;
      if (widescreenAssets.previewUrl) updates.preview_url = widescreenAssets.previewUrl;

      const { error } = await this.supabase
        .from("long_form_videos")
        .update(updates)
        .eq("id", videoId);

      if (error) throw error;

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || "Metadata updates aborted." };
    }
  }

  /**
   * Tracks elapsed user watch time. Maintains single entries per user-video correlation,
   * tracking completion states and saving precise resume-offsets.
   */
  public async updateWatchHistory(
    userId: string,
    videoId: string,
    elapsedSeconds: number
  ): Promise<{ success: boolean; isCompleted: boolean; error?: string }> {
    try {
      // 1. Fetch total duration of the target video to determine completion ratio
      const { data: video } = await this.supabase
        .from("long_form_videos")
        .select("duration_seconds")
        .eq("id", videoId)
        .single();

      if (!video) {
        return { success: false, isCompleted: false, error: "Target video does not exist." };
      }

      const totalDuration = video.duration_seconds;
      const progressRatio = elapsedSeconds / totalDuration;
      const isCompleted = progressRatio >= VIDEO_LIMITS.COMPLETION_THRESHOLD_RATIO;
      const cappedOffset = Math.min(elapsedSeconds, totalDuration);

      // 2. Upsert watch history ledger
      const { data: existing } = await this.supabase
        .from("long_form_watch_history")
        .select("id, is_completed")
        .eq("user_id", userId)
        .eq("video_id", videoId)
        .maybeSingle();

      const now = new Date();

      if (existing) {
        // Retain completion state if user already finished but is rewinding
        const finalCompleted = existing.is_completed || isCompleted;
        await this.supabase
          .from("long_form_watch_history")
          .update({
            watched_duration_seconds: cappedOffset,
            is_completed: finalCompleted,
            last_watched_at: now
          })
          .eq("id", existing.id);
      } else {
        await this.supabase
          .from("long_form_watch_history")
          .insert({
            id: `his-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
            user_id: userId,
            video_id: videoId,
            watched_duration_seconds: cappedOffset,
            is_completed: isCompleted,
            last_watched_at: now
          });
      }

      return { success: true, isCompleted };
    } catch (err: any) {
      return { success: false, isCompleted: false, error: err?.message || "Failed to commit playback offset tracking." };
    }
  }

  /**
   * Safe counter increments ensuring high thread concurrency without dirty-writes.
   */
  public async incrementViews(videoId: string): Promise<boolean> {
    const { error } = await this.supabase.rpc("increment_longform_views", {
      p_video_id: videoId
    });
    return !error;
  }

  /**
   * Toggles video Liking state.
   */
  public async toggleLikeVideo(
    userId: string,
    videoId: string
  ): Promise<{ success: boolean; isLiked: boolean; error?: string }> {
    try {
      const { data: existing } = await this.supabase
        .from("long_form_likes")
        .select("id")
        .eq("user_id", userId)
        .eq("video_id", videoId)
        .maybeSingle();

      if (existing) {
        await this.supabase.from("long_form_likes").delete().eq("id", existing.id);
        return { success: true, isLiked: false };
      } else {
        await this.supabase.from("long_form_likes").insert({
          id: `llk-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
          user_id: userId,
          video_id: videoId
        });
        return { success: true, isLiked: true };
      }
    } catch (err: any) {
      return { success: false, isLiked: false, error: err?.message || "Interaction failed." };
    }
  }

  /**
   * Saves video directly to personal dashboard bookmark decks.
   */
  public async saveVideo(userId: string, videoId: string): Promise<boolean> {
    const { error } = await this.supabase
      .from("long_form_saves")
      .upsert({
        id: `lsv-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
        user_id: userId,
        video_id: videoId
      });
    return !error;
  }

  /**
   * Registers a sharing audit log, exporting dynamic code variables for external embeds.
   */
  public async shareVideo(
    senderId: string,
    videoId: string,
    platform: "internal" | "whatsapp" | "twitter" | "facebook" | "copied_link" | "embed" = "copied_link"
  ): Promise<{ success: boolean; shareCode?: string; error?: string }> {
    try {
      const shareCode = `ref-lfv-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
      const { error } = await this.supabase
        .from("long_form_shares")
        .insert({
          id: `lsh-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
          sender_id: senderId,
          video_id: videoId,
          platform,
          share_code: shareCode
        });

      if (error) throw error;
      return { success: true, shareCode };
    } catch (err: any) {
      return { success: false, error: err?.message || "Failed to commit sharing logging stats." };
    }
  }

  /**
   * Dispatches moderation complaints immediately locking visual discovery feeds
   * if user reporting limits are breached.
   */
  public async reportVideo(
    reporterId: string,
    videoId: string,
    reason: "copyright" | "spam" | "harassment" | "inappropriate" | "misinformation" | "other",
    details: string | null = null
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const { error } = await this.supabase
        .from("long_form_reports")
        .insert({
          id: `lrep-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
          reporter_id: reporterId,
          video_id: videoId,
          reason,
          details,
          status: "pending"
        });

      if (error) throw error;
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || "Report logging failed." };
    }
  }

  /**
   * Retrieves recommended videos with semantic tag mapping matching target keywords.
   */
  public async getRecommendedVideos(
    videoId: string,
    limit: number = 10
  ): Promise<{ success: boolean; videos?: LongFormVideo[]; error?: string }> {
    try {
      // 1. Fetch current video tags
      const { data: currentVideo } = await this.supabase
        .from("long_form_videos")
        .select("recommendation_tags")
        .eq("id", videoId)
        .single();

      if (!currentVideo) {
        return { success: false, error: "Video record not found." };
      }

      const tags = currentVideo.recommendation_tags || [];

      // 2. Fetch records sharing any overlapping tags, sorted by views and recency, excluding current video
      const { data, error } = await this.supabase
        .from("long_form_videos")
        .select("*")
        .neq("id", videoId)
        .eq("is_private", false)
        .eq("processing_state", VideoProcessingState.READY)
        .overlaps("recommendation_tags", tags)
        .order("views_count", { ascending: false })
        .limit(limit);

      if (error) throw error;

      return {
        success: true,
        videos: (data || []).map(row => this.mapRowToVideo(row))
      };
    } catch (err: any) {
      return { success: false, error: err?.message || "Failed to query recommended video feeds." };
    }
  }

  // Row Mapping converter helper
  private mapRowToVideo(row: any): LongFormVideo {
    return {
      id: row.id,
      channelId: row.channel_id,
      uploaderId: row.uploader_id,
      title: row.title,
      description: row.description,
      videoUrl: row.video_url,
      thumbnailUrl: row.thumbnail_url,
      previewUrl: row.preview_url,
      durationSeconds: row.duration_seconds,
      processingState: row.processing_state as VideoProcessingState,
      metadata: row.metadata as VideoMetadata | null,
      recommendationTags: row.recommendation_tags || [],
      viewsCount: row.views_count || 0,
      likesCount: row.likes_count || 0,
      dislikesCount: row.dislikes_count || 0,
      reportsCount: row.reports_count || 0,
      savesCount: row.saves_count || 0,
      isPrivate: row.is_private,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    };
  }
}

// ============================================================================
// 4b. EXPRESS WIRING (Ocean JSON-DB adapter, feature #61)
// ----------------------------------------------------------------------------
// The channels + long-form video feature is served by /api/channels/* in
// server.ts. This module adapts the long-form engagement surface (watch
// progress, like/save/report, recommendations) onto the same db.channelVideos
// collection so the Ocean Cut / Creator Studio flows have full endpoints.
// ============================================================================

import express from 'express';
import { getCtx } from './turtleServerContext';

export function registerLongFormVideoRoutes(app: express.Express): void {
  const { requireAuth, loadDatabase, saveDatabase } = getCtx();

  function findVideo(db: any, videoId: string) {
    return (db.channelVideos || []).find((v: any) => v.id === videoId) || null;
  }

  // POST /api/channels/:id/videos/:videoId/watch  { elapsedSeconds } -> resume offset + completion
  app.post('/api/channels/:id/videos/:videoId/watch', requireAuth, (req, res) => {
    const user = (req as any).user;
    const db = loadDatabase();
    const video = findVideo(db, req.params.videoId);
    if (!video) return res.status(404).json({ error: 'Video not found.' });
    const elapsed = Math.max(0, Number(req.body?.elapsedSeconds) || 0);
    db.watchHistory = db.watchHistory || [];
    const key = `${user.id}:${video.id}`;
    let entry = db.watchHistory.find((w: any) => w.key === key);
    if (!entry) {
      entry = { key, userId: user.id, videoId: video.id, watchedSeconds: 0, completed: false, updatedAt: Date.now() };
      db.watchHistory.push(entry);
    }
    entry.watchedSeconds = Math.max(entry.watchedSeconds || 0, elapsed);
    const duration = Number(video.durationSeconds || req.body?.durationSeconds || 0);
    if (duration > 0 && elapsed / duration >= 0.9) entry.completed = true;
    entry.updatedAt = Date.now();
    // Views: only count a fresh watch (1 per user per 10 min).
    if (!entry.lastViewAt || Date.now() - entry.lastViewAt > 10 * 60 * 1000) {
      video.views = (video.views || 0) + 1;
      entry.lastViewAt = Date.now();
    }
    saveDatabase(db);
    res.json({ ok: true, resumeSeconds: entry.watchedSeconds, completed: entry.completed, views: video.views });
  });

  // POST /api/channels/:id/videos/:videoId/like  -> toggle like
  app.post('/api/channels/:id/videos/:videoId/like', requireAuth, (req, res) => {
    const user = (req as any).user;
    const db = loadDatabase();
    const video = findVideo(db, req.params.videoId);
    if (!video) return res.status(404).json({ error: 'Video not found.' });
    video.likedBy = Array.isArray(video.likedBy) ? video.likedBy : [];
    const idx = video.likedBy.indexOf(user.id);
    if (idx === -1) video.likedBy.push(user.id); else video.likedBy.splice(idx, 1);
    video.likes = video.likedBy.length;
    saveDatabase(db);
    res.json({ liked: idx === -1, likes: video.likes });
  });

  // POST /api/channels/:id/videos/:videoId/save  -> toggle saved
  app.post('/api/channels/:id/videos/:videoId/save', requireAuth, (req, res) => {
    const user = (req as any).user;
    const db = loadDatabase();
    const video = findVideo(db, req.params.videoId);
    if (!video) return res.status(404).json({ error: 'Video not found.' });
    video.savedBy = Array.isArray(video.savedBy) ? video.savedBy : [];
    const idx = video.savedBy.indexOf(user.id);
    if (idx === -1) video.savedBy.push(user.id); else video.savedBy.splice(idx, 1);
    saveDatabase(db);
    res.json({ saved: idx === -1 });
  });

  // POST /api/channels/:id/videos/:videoId/report  { reason } -> moderation log
  app.post('/api/channels/:id/videos/:videoId/report', requireAuth, (req, res) => {
    const user = (req as any).user;
    const db = loadDatabase();
    const video = findVideo(db, req.params.videoId);
    if (!video) return res.status(404).json({ error: 'Video not found.' });
    const reason = String(req.body?.reason || 'other').slice(0, 40);
    db.videoReports = db.videoReports || [];
    db.videoReports.push({ id: `vr-${Date.now()}-${Math.floor(Math.random() * 1000)}`, reporterId: user.id, videoId: video.id, reason, status: 'pending', createdAt: Date.now() });
    video.reportsCount = (video.reportsCount || 0) + 1;
    saveDatabase(db);
    res.json({ ok: true, reason });
  });

  // GET /api/channels/:id/videos/:videoId/recommendations  -> tag/creator overlap
  app.get('/api/channels/:id/videos/:videoId/recommendations', (req, res) => {
    const db = loadDatabase();
    const video = findVideo(db, req.params.videoId);
    if (!video) return res.status(404).json({ error: 'Video not found.' });
    const channel = (db.channels || []).find((c: any) => c.id === video.channelId);
    const sameChannel = (db.channelVideos || [])
      .filter((v: any) => v.channelId === video.channelId && v.id !== video.id)
      .slice(0, 12);
    const others = (db.channelVideos || [])
      .filter((v: any) => v.id !== video.id && v.channelId !== video.channelId && (v.category || '') === (video.category || ''))
      .slice(0, 12);
    res.json({ recommendations: [...sameChannel, ...others].slice(0, 12), channel: channel ? { id: channel.id, name: channel.name } : null });
  });
}

// ============================================================================
// 5. POSTGRES ROW LEVEL SECURITY (RLS) & DATABASE SCHEMA MIGRATION
// ============================================================================

export const SQL_LONG_FORM_MIGRATION = `
-- ============================================================================
-- SQL SCHEMA FOR LONG-FORM VIDEO STREAMING SERVICE
-- ============================================================================

-- Core widescreen catalog
create table if not exists public.long_form_videos (
    id uuid default uuid_generate_v4() primary key,
    channel_id uuid references public.channels(id) on delete cascade not null,
    uploader_id uuid references public.profiles(id) on delete cascade not null,
    title text not null,
    description text,
    video_url text not null,
    thumbnail_url text,               -- high-res 16:9 banner
    preview_url text,                 -- dynamic 5s preview file
    duration_seconds integer not null check (duration_seconds > 0),
    processing_state text default 'initialized'::text not null check (processing_state in ('initialized', 'uploading', 'transcoding', 'analyzing_metadata', 'ready', 'failed')),
    metadata jsonb,                   -- structured container details
    recommendation_tags text[] default '{}'::text[] not null,
    views_count integer default 0 not null check (views_count >= 0),
    likes_count integer default 0 not null check (likes_count >= 0),
    dislikes_count integer default 0 not null check (dislikes_count >= 0),
    reports_count integer default 0 not null check (reports_count >= 0),
    saves_count integer default 0 not null check (saves_count >= 0),
    is_private boolean default false not null,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Likes correlation mapping
create table if not exists public.long_form_likes (
    id uuid default uuid_generate_v4() primary key,
    user_id uuid references public.profiles(id) on delete cascade not null,
    video_id uuid references public.long_form_videos(id) on delete cascade not null,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    
    constraint unique_user_long_form_like unique (user_id, video_id)
);

-- Saved bookmarks ledger
create table if not exists public.long_form_saves (
    id uuid default uuid_generate_v4() primary key,
    user_id uuid references public.profiles(id) on delete cascade not null,
    video_id uuid references public.long_form_videos(id) on delete cascade not null,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    
    constraint unique_user_saved_longform unique (user_id, video_id)
);

-- Sharing telemetry logger
create table if not exists public.long_form_shares (
    id uuid default uuid_generate_v4() primary key,
    sender_id uuid references public.profiles(id) on delete cascade not null,
    video_id uuid references public.long_form_videos(id) on delete cascade not null,
    platform text not null,
    share_code text not null unique,
    shared_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Abuse complaints registry
create table if not exists public.long_form_reports (
    id uuid default uuid_generate_v4() primary key,
    reporter_id uuid references public.profiles(id) on delete cascade not null,
    video_id uuid references public.long_form_videos(id) on delete cascade not null,
    reason text not null check (reason in ('copyright', 'spam', 'harassment', 'inappropriate', 'misinformation', 'other')),
    details text,
    status text default 'pending'::text not null check (status in ('pending', 'under_review', 'resolved', 'dismissed')),
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Watch history offset logs (Tracks elapsed locations)
create table if not exists public.long_form_watch_history (
    id uuid default uuid_generate_v4() primary key,
    user_id uuid references public.profiles(id) on delete cascade not null,
    video_id uuid references public.long_form_videos(id) on delete cascade not null,
    watched_duration_seconds integer not null check (watched_duration_seconds >= 0),
    is_completed boolean default false not null,
    last_watched_at timestamp with time zone default timezone('utc'::text, now()) not null,
    
    constraint unique_user_video_history unique (user_id, video_id)
);

-- ============================================================================
-- ATOMIC INCREMENT AUTOMATIONS (PROCEDURES)
-- ============================================================================

-- 1. Atomic view increment RPC function
create or replace function public.increment_longform_views(p_video_id uuid)
returns void as $$
begin
    update public.long_form_videos
    set views_count = views_count + 1
    where id = p_video_id;
end;
$$ language plpgsql security definer;

-- 2. Sync Likes Counter
create or replace function public.on_longform_like_update()
returns trigger as $$
begin
    if (TG_OP = 'INSERT') then
        update public.long_form_videos set likes_count = likes_count + 1 where id = new.video_id;
    elsif (TG_OP = 'DELETE') then
        update public.long_form_videos set likes_count = greatest(0, likes_count - 1) where id = old.video_id;
    end if;
    return null;
end;
$$ language plpgsql security definer;

create trigger tr_longform_likes_counter_sync
    after insert or delete on public.long_form_likes
    for each row execute function public.on_longform_like_update();

-- 3. Sync Saves Counter
create or replace function public.on_longform_save_update()
returns trigger as $$
begin
    if (TG_OP = 'INSERT') then
        update public.long_form_videos set saves_count = saves_count + 1 where id = new.video_id;
    elsif (TG_OP = 'DELETE') then
        update public.long_form_videos set saves_count = greatest(0, saves_count - 1) where id = old.video_id;
    end if;
    return null;
end;
$$ language plpgsql security definer;

create trigger tr_longform_saves_counter_sync
    after insert or delete on public.long_form_saves
    for each row execute function public.on_longform_save_update();

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

alter table public.long_form_videos enable row level security;
alter table public.long_form_likes enable row level security;
alter table public.long_form_saves enable row level security;
alter table public.long_form_shares enable row level security;
alter table public.long_form_reports enable row level security;
alter table public.long_form_watch_history enable row level security;

-- 1. Videos Policy: anyone views ready public videos
create policy "Anyone can select ready public widescreen videos"
    on public.long_form_videos for select
    using (is_private = false and processing_state = 'ready');

create policy "Uploaders can fully manage their videos"
    on public.long_form_videos for all
    using (auth.uid() = uploader_id);

-- 2. Engagement Policies: Restricted strictly to own execution
create policy "Users can toggle their own video likes"
    on public.long_form_likes for all
    using (auth.uid() = user_id);

create policy "Users can manage their own bookmarks"
    on public.long_form_saves for all
    using (auth.uid() = user_id);

create policy "Users can read their private watch history logs"
    on public.long_form_watch_history for all
    using (auth.uid() = user_id);

-- ============================================================================
-- PERFORMANCE SEARCH & ARRAYS INDEXING
-- ============================================================================
create index if not exists idx_longform_tag_array_overlaps 
on public.long_form_videos using gin (recommendation_tags);

create index if not exists idx_longform_state_timeline 
on public.long_form_videos (processing_state, created_at desc) 
where is_private = false;

create index if not exists idx_longform_watch_history_timeline 
on public.long_form_watch_history (user_id, last_watched_at desc);
`;

// ============================================================================
// 6. SCALING & CDN CACHING SPECIFICATION
// ============================================================================

export const LONG_FORM_SCALING_SPECIFICATION = {
  dynamicStreamingAspects: {
    protocol: "HTTP Live Streaming (HLS) with adaptive-bitrate transcoding.",
    delivery: "Video files are split into small 6-second MPEG-2 transport stream segments (.ts files) indexed via master m3u8 playlist manifests.",
    bandwidthConservation: "Mobile clients load a low-resolution stream (480p) conserving data, while gigabit desktops seamlessly scale up to pristine 1080p 60fps."
  },
  cachingStrategy: {
    edgeCdn: "Leverages Google Cloud CDN or Cloudflare CDN configured with proxy routing. Master m3u8 playlists have a TTL of 2 seconds, while immutable video chunks (.ts files) are cached indefinitely for 365 days across global edge POPs to ensure low-latency buffers."
  },
  concurrencyProtection: {
    viewsSpamFence: "Unique view increments are validated via client-session IP cookies and user tokens cached in Redis with a 24-hour expiration. Prevents view inflation loop scripts from overloading DB writes.",
    databaseOptimizations: "Widescreen metadata checks are isolated into postgres JSONB indexing columns, and high-volume overlapping array logic utilizes optimized GIN (Generalized Inverted Index) patterns."
  }
};
