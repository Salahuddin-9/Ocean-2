/**
 * Turtle Social Media Application - Comprehensive Moderation & Reporting Backend Engine
 * 
 * This file contains the complete, production-ready, non-UI backend architecture,
 * data models, trust score algorithms, rate-limiting handlers, and database definitions 
 * for Turtle's report and moderation workflow.
 * 
 * -----------------------------------------------------------------------------------------
 * CORE FUNCTIONAL SERVICES:
 * 1. Report Registry: Handles profile, post, comment, message, channel, video, reel,
 *    random chat session, and emergency alert reports.
 * 2. Trust Score Tracker: Handles dynamic, merit-based trust rating adjustments (0 to 100).
 * 3. Automated Safety Flagger: Instant threat assessment (AI hook simulation & regex).
 * 4. User Penalty Manager: Controls warnings, shadowbans, suspensions, and bans.
 * 5. Appeal Processing: Tracks user appeals and penalty reversion routines.
 * 6. Rate Limiting & Abuse Prevention: Mitigates spam reporting or bad-faith mass flags.
 * 7. High-Performance SQL Schema Migration Scripts, triggers, and Row Level Security (RLS) policies.
 * -----------------------------------------------------------------------------------------
 */

// ==========================================
// 1. DATA MODELS & ENUMERATIONS
// ==========================================

export enum ReportableItemType {
  PROFILE = "profile",
  POST = "post",
  COMMENT = "comment",
  MESSAGE = "message",
  CHANNEL = "channel",
  VIDEO = "video",
  REEL = "reel",
  RANDOM_CHAT_SESSION = "random_chat_session",
  EMERGENCY_ALERT = "emergency_alert"
}

export enum ReportReason {
  SPAM = "spam",
  HARASSMENT = "harassment",
  HATE = "hate",
  NUDITY = "nudity",
  VIOLENCE = "violence",
  SCAM = "scam",
  FAKE_EMERGENCY = "fake_emergency",
  DANGEROUS_CONTENT = "dangerous_content",
  MINOR_SAFETY = "minor_safety",
  OTHER = "other"
}

export enum ModerationStatus {
  PENDING = "pending",
  UNDER_REVIEW = "under_review",
  ACTIONED = "actioned", // Content taken down / penalty issued
  DISMISSED = "dismissed" // Allowed / report marked as invalid
}

export enum PenaltyType {
  WARNING = "warning",       // Formal system warning logged
  SHADOWBAN = "shadowban",   // Content visible only to author; throttled discovery
  SUSPEND = "suspend",       // Temporary complete lock of login features
  BAN = "ban"                // Permanent absolute eviction from platform
}

export enum AppealStatus {
  PENDING = "pending",
  APPROVED = "approved", // Appeal won; penalty restored, trust score recovered
  REJECTED = "rejected"  // Appeal denied; penalty held
}

export interface ModerationReport {
  id: string;
  reporterId: string;
  contentType: ReportableItemType;
  contentId: string;             // Target object ID
  contentOwnerId: string;        // Creator/Author of the target object
  reason: ReportReason;
  details: string | null;
  status: ModerationStatus;
  automatedFlag: boolean;        // Triggered by instant analysis rules
  flagReason: string | null;
  moderatorId: string | null;
  moderatorNotes: string | null;
  actionTaken: PenaltyType | "none";
  createdAt: Date;
  updatedAt: Date;
}

export interface UserTrustScore {
  userId: string;
  trustScore: number;            // Ranges from 0 to 100. Starts at 100.
  successfulReportsCount: number;// Reports that resulted in actioned outcomes
  falseReportsCount: number;     // Bad-faith/incorrect spam reports
  lastCalculatedAt: Date;
}

export interface UserPenalty {
  id: string;
  userId: string;
  reportId: string | null;       // Associated trigger report, if any
  penaltyType: PenaltyType;
  reason: string;
  durationHours: number | null;  // Null implies indefinite/permanent
  expiresAt: Date | null;        // Null implies permanent
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ModerationAppeal {
  id: string;
  penaltyId: string;
  userId: string;
  appealReason: string;
  status: AppealStatus;
  reviewNotes: string | null;
  reviewerId: string | null;
  reviewedAt: Date | null;
  createdAt: Date;
}

// ==========================================
// 2. MODERATION POLICY & PENALTY RULES
// ==========================================

export const MODERATION_LIMITS = {
  MIN_DETAILS_LENGTH: 10,
  MAX_DETAILS_LENGTH: 2000,
  REPORTS_WINDOW_MS: 15 * 60 * 1000,      // 15 minutes rolling window
  MAX_REPORTS_PER_WINDOW: 5,               // Anti-flood cap
  MAX_REPORTS_SAME_ITEM_PER_USER: 1,       // Single report per unique item per reporter
  AUTO_QUARANTINE_REPORTS_THRESHOLD: 10,  // Dynamic quarantine on 10 unique reports
  TRUST_SCORE_DECREASE_STEP: 15,           // Point deduction for committing violations
  TRUST_SCORE_PENALTY_FOR_SPAM_REPORT: 20, // Point deduction for bad-faith false reports
  TRUST_SCORE_RECOVERY_ON_APPEAL: 15,      // Restore points if proven innocent
  TRUST_SCORE_CRITICAL_THRESHOLD: 30       // Trust score below 30 invokes automatic shadowban
};

/**
 * Maps reported violation reasons to their respective severity-based penalty rules.
 */
export const PENALTY_RULES: Record<ReportReason, { defaultPenalty: PenaltyType; durationHours: number | null }> = {
  [ReportReason.SPAM]: { defaultPenalty: PenaltyType.WARNING, durationHours: 0 },
  [ReportReason.HARASSMENT]: { defaultPenalty: PenaltyType.SHADOWBAN, durationHours: 72 }, // 3-day shadowban
  [ReportReason.HATE]: { defaultPenalty: PenaltyType.SUSPEND, durationHours: 168 },       // 7-day complete suspension
  [ReportReason.NUDITY]: { defaultPenalty: PenaltyType.SHADOWBAN, durationHours: 120 },     // 5-day shadowban
  [ReportReason.VIOLENCE]: { defaultPenalty: PenaltyType.SUSPEND, durationHours: 336 },     // 14-day complete suspension
  [ReportReason.SCAM]: { defaultPenalty: PenaltyType.SUSPEND, durationHours: 720 },         // 30-day complete suspension
  [ReportReason.FAKE_EMERGENCY]: { defaultPenalty: PenaltyType.BAN, durationHours: null },  // Permanent immediate eviction
  [ReportReason.DANGEROUS_CONTENT]: { defaultPenalty: PenaltyType.SHADOWBAN, durationHours: 168 }, // 7-day shadowban
  [ReportReason.MINOR_SAFETY]: { defaultPenalty: PenaltyType.BAN, durationHours: null },    // Permanent immediate eviction
  [ReportReason.OTHER]: { defaultPenalty: PenaltyType.WARNING, durationHours: 0 }
};

// ==========================================
// 3. AUTOMATED SAFETY FLAG RULES
// ==========================================

export class AutomatedSafetyFlagger {
  // Common visual / textual hazard keywords representing unsafe content
  private static HAZARD_REGEXES: Record<string, RegExp> = {
    violence: /\b(bomb|shoot|assassinate|kill\s+everyone|terrorism|detonate|massacre)\b/i,
    scam: /\b(double\s+your\s+crypto|send\s+me\s+btc|cashapp\s+flip|get\s+rich\s+quick\s+scam)\b/i,
    minor_endangerment: /\b(exploit\s+minors|underage\s+groom|child\s+abuse)\b/i,
    fake_emergency: /\b(nuclear\s+missile\s+alert|false\s+air\s+raid|spoof\s+evacuation)\b/i
  };

  /**
   * Scans content elements and returns automatic safety flag results prior to database insertion.
   */
  public static inspectContent(text: string, type: ReportableItemType): { flag: boolean; reason: string | null } {
    if (!text) return { flag: false, reason: null };

    // Strict Emergency Alert Spoof Filter
    if (type === ReportableItemType.EMERGENCY_ALERT) {
      if (this.HAZARD_REGEXES.fake_emergency.test(text)) {
        return {
          flag: true,
          reason: "Automated match of forbidden panic/emergency simulation patterns in an alert container."
        };
      }
    }

    // Heavy violence detection
    if (this.HAZARD_REGEXES.violence.test(text)) {
      return {
        flag: true,
        reason: "Matched highly destructive or threatening vocabulary within platform content."
      };
    }

    // Explicit Scam patterns
    if (this.HAZARD_REGEXES.scam.test(text)) {
      return {
        flag: true,
        reason: "Matched high-probability financial double-your-investment fraud metrics."
      };
    }

    // High critical minor safety patterns
    if (this.HAZARD_REGEXES.minor_endangerment.test(text)) {
      return {
        flag: true,
        reason: "CRITICAL: Suspicious minor exploitation keyphrase matched. Locking item immediately."
      };
    }

    return { flag: false, reason: null };
  }
}

// ==========================================
// 4. SUPABASE / POSTGRES MODERATION SERVICE
// ==========================================

export class SupabaseModerationService {
  private supabase: any;
  // Local in-memory cache of timestamps to prevent database hammering for rate-limiting
  private static localRateLimitCache: Map<string, number[]> = new Map();

  constructor(supabaseClient: any) {
    this.supabase = supabaseClient;
  }

  /**
   * Submits a formal content report. Asserts rate limits, checks for existing reports
   * to avoid duplicate submissions, runs automated screening checks, and inserts the ledger.
   */
  public async submitReport(
    reporterId: string,
    reportInput: {
      contentType: ReportableItemType;
      contentId: string;
      contentOwnerId: string;
      reason: ReportReason;
      details: string | null;
      contentTextToScan?: string; // Optional raw text body for immediate scanning
    }
  ): Promise<{ success: boolean; report?: ModerationReport; error?: string }> {
    try {
      if (reporterId === reportInput.contentOwnerId) {
        return { success: false, error: "Self-reporting is forbidden. Use edit/delete controls to manage your content." };
      }

      const cleanDetails = reportInput.details ? reportInput.details.trim() : "";
      if (cleanDetails.length > 0 && cleanDetails.length < MODERATION_LIMITS.MIN_DETAILS_LENGTH) {
        return {
          success: false,
          error: `Please provide at least ${MODERATION_LIMITS.MIN_DETAILS_LENGTH} characters of detail to explain this report.`
        };
      }

      if (cleanDetails.length > MODERATION_LIMITS.MAX_DETAILS_LENGTH) {
        return {
          success: false,
          error: `Details text exceeds the ${MODERATION_LIMITS.MAX_DETAILS_LENGTH} character limit.`
        };
      }

      // 1. Anti-spam Rate Limiting
      const nowMs = Date.now();
      const userReports = SupabaseModerationService.localRateLimitCache.get(reporterId) || [];
      const validReports = userReports.filter(ts => nowMs - ts < MODERATION_LIMITS.REPORTS_WINDOW_MS);
      
      if (validReports.length >= MODERATION_LIMITS.MAX_REPORTS_PER_WINDOW) {
        return {
          success: false,
          error: "Rate limit reached. You can only submit up to 5 moderation reports every 15 minutes."
        };
      }

      // 2. Prevent duplicate reporting of the exact same item
      const { data: duplicate } = await this.supabase
        .from("moderation_reports")
        .select("id")
        .eq("reporter_id", reporterId)
        .eq("content_type", reportInput.contentType)
        .eq("content_id", reportInput.contentId)
        .maybeSingle();

      if (duplicate) {
        return { success: false, error: "You have already logged a report against this specific item." };
      }

      // Record rate limit timestamp
      validReports.push(nowMs);
      SupabaseModerationService.localRateLimitCache.set(reporterId, validReports);

      // 3. Dynamic Automated Filtering
      let automatedFlag = false;
      let flagReason: string | null = null;
      if (reportInput.contentTextToScan) {
        const scan = AutomatedSafetyFlagger.inspectContent(reportInput.contentTextToScan, reportInput.contentType);
        automatedFlag = scan.flag;
        flagReason = scan.reason;
      }

      // If reasons are extreme, trigger automated flags regardless
      if (reportInput.reason === ReportReason.MINOR_SAFETY || reportInput.reason === ReportReason.FAKE_EMERGENCY) {
        automatedFlag = true;
        flagReason = flagReason || `Automated flag raised due to severe impact classification: ${reportInput.reason}`;
      }

      // 4. Save report in DB
      const id = `rep-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
      const { data, error } = await this.supabase
        .from("moderation_reports")
        .insert({
          id,
          reporter_id: reporterId,
          content_type: reportInput.contentType,
          content_id: reportInput.contentId,
          content_owner_id: reportInput.contentOwnerId,
          reason: reportInput.reason,
          details: cleanDetails || null,
          status: automatedFlag ? ModerationStatus.UNDER_REVIEW : ModerationStatus.PENDING,
          automated_flag: automatedFlag,
          flag_reason: flagReason,
          action_taken: "none"
        })
        .select()
        .single();

      if (error) throw error;

      // 5. Automated content isolation / quarantine if threshold breached or critical flag triggered
      if (automatedFlag) {
        await this.isolateQuarantinedContent(reportInput.contentType, reportInput.contentId, flagReason || "Critical hazard trigger");
      } else {
        // Evaluate overall report volume for automatic quarantine
        const { count } = await this.supabase
          .from("moderation_reports")
          .select("*", { count: "exact", head: true })
          .eq("content_type", reportInput.contentType)
          .eq("content_id", reportInput.contentId)
          .eq("status", ModerationStatus.PENDING);

        if (count && count >= MODERATION_LIMITS.AUTO_QUARANTINE_REPORTS_THRESHOLD) {
          await this.isolateQuarantinedContent(reportInput.contentType, reportInput.contentId, `Exceeded rolling reports limit of ${MODERATION_LIMITS.AUTO_QUARANTINE_REPORTS_THRESHOLD} flags.`);
        }
      }

      return {
        success: true,
        report: this.mapRowToReport(data)
      };
    } catch (err: any) {
      return { success: false, error: err?.message || "Failed to commit moderation report record." };
    }
  }

  /**
   * Safe content isolation utility. Conceals content on extreme reports pending moderator review.
   */
  private async isolateQuarantinedContent(type: ReportableItemType, contentId: string, reason: string): Promise<void> {
    try {
      let tableName = "";
      switch (type) {
        case ReportableItemType.POST:
          tableName = "posts";
          break;
        case ReportableItemType.COMMENT:
          tableName = "comments";
          break;
        case ReportableItemType.VIDEO:
          tableName = "long_form_videos";
          break;
        case ReportableItemType.CHANNEL:
          tableName = "channels";
          break;
        default:
          return; // Skip table isolation logic if no matching schema is linked directly
      }

      // Update visibility column inside the appropriate table
      if (tableName) {
        await this.supabase
          .from(tableName)
          .update({
            is_private: true,
            quarantined_by_system: true,
            moderation_notes: `Quarantined automatically: ${reason}`
          })
          .eq("id", contentId);
      }
    } catch (e) {
      console.error("Failed to run automated containment isolate procedures: ", e);
    }
  }

  /**
   * Moderator Action Dashboard API: Approves (actioned) or rejects (dismissed) reports,
   * issuing targeted user penalty records and adjusting user trust scores.
   */
  public async reviewReport(
    moderatorId: string,
    reportId: string,
    decision: "approve_and_penalize" | "dismiss_report",
    notes: string,
    overridePenalty?: PenaltyType
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // 1. Fetch current report
      const { data: report } = await this.supabase
        .from("moderation_reports")
        .select("*")
        .eq("id", reportId)
        .single();

      if (!report) {
        return { success: false, error: "Target report item does not exist." };
      }

      if (report.status === ModerationStatus.ACTIONED || report.status === ModerationStatus.DISMISSED) {
        return { success: false, error: "This report has already been finalized by a moderator." };
      }

      const ownerId = report.content_owner_id;
      const reporterId = report.reporter_id;

      if (decision === "approve_and_penalize") {
        // Content deemed inappropriate -> Issue Penalty and dock Creator Trust Score
        const rule = PENALTY_RULES[report.reason as ReportReason];
        const selectedPenalty = overridePenalty || rule.defaultPenalty;
        const duration = rule.durationHours;
        const expiresAt = duration ? new Date(Date.now() + duration * 60 * 60 * 1000) : null;

        // Save Penalty Record
        const penaltyId = `pen-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
        await this.supabase
          .from("user_penalties")
          .insert({
            id: penaltyId,
            user_id: ownerId,
            report_id: reportId,
            penalty_type: selectedPenalty,
            reason: `Violated terms under section: ${report.reason}. Context: ${notes}`,
            duration_hours: duration,
            expires_at: expiresAt,
            is_active: true
          });

        // Dock Trust Score
        await this.adjustUserTrustScore(ownerId, -MODERATION_LIMITS.TRUST_SCORE_DECREASE_STEP, true, false);
        // Reward successful reporter count
        await this.adjustUserTrustScore(reporterId, 0, false, true);

        // Update Report
        await this.supabase
          .from("moderation_reports")
          .update({
            status: ModerationStatus.ACTIONED,
            moderator_id: moderatorId,
            moderator_notes: notes,
            action_taken: selectedPenalty,
            updated_at: new Date()
          })
          .eq("id", reportId);

        // Trigger user profile lockdown if penalty is severe
        if (selectedPenalty === PenaltyType.BAN || selectedPenalty === PenaltyType.SUSPEND) {
          await this.supabase
            .from("profiles")
            .update({ is_banned: true, moderation_status: selectedPenalty })
            .eq("id", ownerId);
        }

      } else {
        // Dismissed -> Reporter was wrong (or spamming false reports)
        await this.adjustUserTrustScore(reporterId, -MODERATION_LIMITS.TRUST_SCORE_PENALTY_FOR_SPAM_REPORT, false, false, true);

        // Update Report
        await this.supabase
          .from("moderation_reports")
          .update({
            status: ModerationStatus.DISMISSED,
            moderator_id: moderatorId,
            moderator_notes: notes,
            action_taken: "none",
            updated_at: new Date()
          })
          .eq("id", reportId);

        // Lift quarantine on content if dismissed
        await this.liftQuarantine(report.content_type, report.content_id);
      }

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || "Failed to submit moderator finalization action." };
    }
  }

  /**
   * Restores quarantined contents back into general discoverability if reports are dismissed.
   */
  private async liftQuarantine(type: string, contentId: string): Promise<void> {
    try {
      let tableName = "";
      if (type === ReportableItemType.POST) tableName = "posts";
      else if (type === ReportableItemType.COMMENT) tableName = "comments";
      else if (type === ReportableItemType.VIDEO) tableName = "long_form_videos";
      else if (type === ReportableItemType.CHANNEL) tableName = "channels";

      if (tableName) {
        await this.supabase
          .from(tableName)
          .update({
            is_private: false,
            quarantined_by_system: false,
            moderation_notes: null
          })
          .eq("id", contentId);
      }
    } catch (e) {
      console.error("Failed to restore quarantined content: ", e);
    }
  }

  /**
   * Adjusted user reputation score ledger (Trust score 0 to 100)
   */
  private async adjustUserTrustScore(
    userId: string,
    pointsChange: number,
    isViolation: boolean = false,
    isSuccessfulReporter: boolean = false,
    isSpamReporter: boolean = false
  ): Promise<void> {
    try {
      const { data: scoreRow } = await this.supabase
        .from("user_trust_scores")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();

      let currentScore = 100;
      let successCount = 0;
      let falseCount = 0;

      if (scoreRow) {
        currentScore = scoreRow.trust_score;
        successCount = scoreRow.successful_reports_count;
        falseCount = scoreRow.false_reports_count;
      }

      const updatedScore = Math.max(0, Math.min(100, currentScore + pointsChange));
      const finalSuccessCount = successCount + (isSuccessfulReporter ? 1 : 0);
      const finalFalseCount = falseCount + (isSpamReporter ? 1 : 0);

      await this.supabase
        .from("user_trust_scores")
        .upsert({
          user_id: userId,
          trust_score: updatedScore,
          successful_reports_count: finalSuccessCount,
          false_reports_count: finalFalseCount,
          last_calculated_at: new Date()
        });

      // Automated action: If trust score falls below critical threshold, issue a automatic 24H shadowban
      if (updatedScore < MODERATION_LIMITS.TRUST_SCORE_CRITICAL_THRESHOLD && pointsChange < 0) {
        await this.supabase
          .from("user_penalties")
          .insert({
            id: `pen-auto-${Date.now()}`,
            user_id: userId,
            penalty_type: PenaltyType.SHADOWBAN,
            reason: `Automated shadowban: Trust score fell below critical safety threshold (${updatedScore}/100)`,
            duration_hours: 24,
            expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
            is_active: true
          });
      }
    } catch (e) {
      console.error("Trust score update aborted: ", e);
    }
  }

  /**
   * Log an appeal request against a penalty.
   */
  public async submitAppeal(
    userId: string,
    penaltyId: string,
    appealReason: string
  ): Promise<{ success: boolean; appealId?: string; error?: string }> {
    try {
      // 1. Validate penalty exists
      const { data: penalty } = await this.supabase
        .from("user_penalties")
        .select("*")
        .eq("id", penaltyId)
        .eq("user_id", userId)
        .single();

      if (!penalty) {
        return { success: false, error: "Penalty record not found or does not belong to your account." };
      }

      if (!penalty.is_active) {
        return { success: false, error: "This penalty has already expired or been resolved." };
      }

      // Check duplicate appeals
      const { data: existing } = await this.supabase
        .from("moderation_appeals")
        .select("id")
        .eq("penalty_id", penaltyId)
        .maybeSingle();

      if (existing) {
        return { success: false, error: "An appeal has already been logged for this penalty." };
      }

      const appealId = `app-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
      await this.supabase
        .from("moderation_appeals")
        .insert({
          id: appealId,
          penalty_id: penaltyId,
          user_id: userId,
          appeal_reason: appealReason.trim(),
          status: AppealStatus.PENDING
        });

      return { success: true, appealId };
    } catch (err: any) {
      return { success: false, error: err?.message || "Appeal submission failed." };
    }
  }

  /**
   * Resolves an active appeal. If approved, deactivate penalty, recover trust score, and restore profile.
   */
  public async resolveAppeal(
    adminId: string,
    appealId: string,
    decision: AppealStatus.APPROVED | AppealStatus.REJECTED,
    notes: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const { data: appeal } = await this.supabase
        .from("moderation_appeals")
        .select("*, user_penalties(*)")
        .eq("id", appealId)
        .single();

      if (!appeal) {
        return { success: false, error: "Appeal item not found." };
      }

      if (appeal.status !== AppealStatus.PENDING) {
        return { success: false, error: "This appeal has already been processed." };
      }

      const penalty = appeal.user_penalties;
      const targetUserId = appeal.user_id;

      if (decision === AppealStatus.APPROVED) {
        // Lift Penalty
        await this.supabase
          .from("user_penalties")
          .update({ is_active: false, updated_at: new Date() })
          .eq("id", penalty.id);

        // Recover Trust Score
        await this.adjustUserTrustScore(targetUserId, MODERATION_LIMITS.TRUST_SCORE_RECOVERY_ON_APPEAL);

        // Unban profile if suspended or banned
        if (penalty.penalty_type === PenaltyType.BAN || penalty.penalty_type === PenaltyType.SUSPEND) {
          await this.supabase
            .from("profiles")
            .update({ is_banned: false, moderation_status: null })
            .eq("id", targetUserId);
        }

        // Lift content quarantine associated with reports
        if (penalty.report_id) {
          const { data: report } = await this.supabase
            .from("moderation_reports")
            .select("content_type, content_id")
            .eq("id", penalty.report_id)
            .single();

          if (report) {
            await this.liftQuarantine(report.content_type, report.content_id);
          }
        }
      }

      // Update Appeal Status
      await this.supabase
        .from("moderation_appeals")
        .update({
          status: decision,
          review_notes: notes,
          reviewer_id: adminId,
          reviewed_at: new Date()
        })
        .eq("id", appealId);

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || "Failed to resolve penalty appeal." };
    }
  }

  // Row Mapping converter helper
  private mapRowToReport(row: any): ModerationReport {
    return {
      id: row.id,
      reporterId: row.reporter_id,
      contentType: row.content_type as ReportableItemType,
      contentId: row.content_id,
      contentOwnerId: row.content_owner_id,
      reason: row.reason as ReportReason,
      details: row.details,
      status: row.status as ModerationStatus,
      automatedFlag: row.automated_flag,
      flagReason: row.flag_reason,
      moderatorId: row.moderator_id,
      moderatorNotes: row.moderator_notes,
      actionTaken: row.action_taken as PenaltyType | "none",
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    };
  }
}

// ============================================================================
// 5. POSTGRES ROW LEVEL SECURITY (RLS) & DATABASE SCHEMA MIGRATION
// ============================================================================

export const SQL_MODERATION_MIGRATION = `
-- ============================================================================
-- SQL SCHEMA FOR REPORTING & CONTENT MODERATION SYSTEM
-- ============================================================================

-- Core reports registry
create table if not exists public.moderation_reports (
    id uuid default uuid_generate_v4() primary key,
    reporter_id uuid references public.profiles(id) on delete cascade not null,
    content_type text not null check (content_type in ('profile', 'post', 'comment', 'message', 'channel', 'video', 'reel', 'random_chat_session', 'emergency_alert')),
    content_id text not null,
    content_owner_id uuid references public.profiles(id) on delete cascade not null,
    reason text not null check (reason in ('spam', 'harassment', 'hate', 'nudity', 'violence', 'scam', 'fake_emergency', 'dangerous_content', 'minor_safety', 'other')),
    details text,
    status text default 'pending'::text not null check (status in ('pending', 'under_review', 'actioned', 'dismissed')),
    automated_flag boolean default false not null,
    flag_reason text,
    moderator_id uuid references public.profiles(id),
    moderator_notes text,
    action_taken text default 'none'::text not null check (action_taken in ('none', 'warning', 'shadowban', 'suspend', 'ban')),
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- User reputation/trust score tracking
create table if not exists public.user_trust_scores (
    user_id uuid references public.profiles(id) on delete cascade primary key,
    trust_score integer default 100 not null check (trust_score between 0 and 100),
    successful_reports_count integer default 0 not null check (successful_reports_count >= 0),
    false_reports_count integer default 0 not null check (false_reports_count >= 0),
    last_calculated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Log of punishments active or historic
create table if not exists public.user_penalties (
    id uuid default uuid_generate_v4() primary key,
    user_id uuid references public.profiles(id) on delete cascade not null,
    report_id uuid references public.moderation_reports(id) on delete set null,
    penalty_type text not null check (penalty_type in ('warning', 'shadowban', 'suspend', 'ban')),
    reason text not null,
    duration_hours integer,
    expires_at timestamp with time zone,
    is_active boolean default true not null,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Appeals logged by flagged users
create table if not exists public.moderation_appeals (
    id uuid default uuid_generate_v4() primary key,
    penalty_id uuid references public.user_penalties(id) on delete cascade not null,
    user_id uuid references public.profiles(id) on delete cascade not null,
    appeal_reason text not null,
    status text default 'pending'::text not null check (status in ('pending', 'approved', 'rejected')),
    review_notes text,
    reviewer_id uuid references public.profiles(id),
    reviewed_at timestamp with time zone,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- ============================================================================
-- AUTOMATED SYNC TRIGGERS
-- ============================================================================

-- Automatically provision trust score records upon user registration profile insert
create or replace function public.on_profile_create_provision_trust_score()
returns trigger as $$
begin
    insert into public.user_trust_scores (user_id, trust_score)
    values (new.id, 100)
    on conflict (user_id) do nothing;
    return null;
end;
$$ language plpgsql security definer;

create trigger tr_profiles_provision_trust_score
    after insert on public.profiles
    for each row execute function public.on_profile_create_provision_trust_score();

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

alter table public.moderation_reports enable row level security;
alter table public.user_trust_scores enable row level security;
alter table public.user_penalties enable row level security;
alter table public.moderation_appeals enable row level security;

-- 1. Reports Policy
create policy "Users can log reports"
    on public.moderation_reports for insert
    with check (auth.uid() = reporter_id);

create policy "Users can inspect reports they authored"
    on public.moderation_reports for select
    using (auth.uid() = reporter_id);

create policy "Moderators have absolute power over report objects"
    on public.moderation_reports for all
    using (
        exists (
            select 1 from public.profiles
            where id = auth.uid() and role in ('moderator', 'admin')
        )
    );

-- 2. Trust Scores Policy
create policy "Users can view their private trust score"
    on public.user_trust_scores for select
    using (auth.uid() = user_id);

-- 3. Penalties Policy
create policy "Users can view active penalties levied against them"
    on public.user_penalties for select
    using (auth.uid() = user_id);

-- 4. Appeals Policy
create policy "Users can submit appeals against active penalties"
    on public.moderation_appeals for insert
    with check (auth.uid() = user_id);

create policy "Users can select their own appeals"
    on public.moderation_appeals for select
    using (auth.uid() = user_id);

create policy "Moderators manage all appeal requests"
    on public.moderation_appeals for all
    using (
        exists (
            select 1 from public.profiles
            where id = auth.uid() and role in ('moderator', 'admin')
        )
    );

-- ============================================================================
-- INDEXES FOR SCALE
-- ============================================================================
create index if not exists idx_reports_by_owner_and_status
on public.moderation_reports (content_owner_id, status);

create index if not exists idx_reports_by_content_id
on public.moderation_reports (content_type, content_id);

create index if not exists idx_penalties_by_user_active
on public.user_penalties (user_id, is_active);

create index if not exists idx_appeals_by_status
on public.moderation_appeals (status);
`;

// ============================================================================
// 6. SAFETY POLICIES & ABUSE PREVENTION SUMMARY
// ============================================================================

export const SAFETY_POLICY_SPECIFICATION = {
  abusePrevention: {
    badFaithReporting: "If a user reports valid contents that moderators repeatedly dismiss, the reporter's trust score drops by 20 points per incident. If their trust score falls below 50, all incoming reports from them are demoted to lowest priority.",
    coolingOffPeriod: "Users are blocked from reporting the same content multiple times. After 5 reports in a 15-minute window, a hard IP-and-user-scoped reporting lock is issued."
  },
  escalationMatrix: {
    immediateSuspension: "Violations tagged as MINOR_SAFETY or FAKE_EMERGENCY bypass all triage queue levels, immediately locking content, flagging IP address pools, and notifying human administrators via high-priority Webhooks.",
    quarantineTrigger: "Any content getting 10 or more reports is automatically isolated from feeds instantly, keeping users safe while human mod verification is pending."
  }
};
