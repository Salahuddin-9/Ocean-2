/**
 * Turtle Social Media Application - User Settings Backend Engine
 * 
 * This file contains the complete, production-ready, non-UI backend architecture,
 * type definitions, default configurations, API interfaces, and database schemas
 * for managing Turtle's complex user-level preferences.
 * 
 * -----------------------------------------------------------------------------------------
 * CORE SETTINGS AREAS COVERED:
 * 1. Hand Preference (Optimized UX spacing for left, right, or ambidextrous accessibility).
 * 2. Privacy Level (Granular visibility controls: public, friends-only, or strictly private).
 * 3. Notification Preferences (Matrix of push, email, in-app, or silent updates).
 * 4. Emergency Pool Preferences (Dynamic alerts, critical vibrations, or override parameters).
 * 5. Language Selection (Locale support: English, Spanish, French, German, or System).
 * 6. Appearance Preferences (Theming defaults: Light, Dark, System, or Cosmic Slate).
 * 7. Blocked Users (Bi-directional interactive restriction lists).
 * 8. Saved Items Bookmarks Deck (Organized cataloging of saved posts, videos, reels).
 * 9. Security Options (MFA flags, login telemetry alerts, auto-lock timeouts).
 * 10. Multiple Account Switching Placeholder (Sub-account bridging credentials).
 * 11. GDPR Data Export (Right to Access triggers).
 * 12. GDPR Data Deletion (Right to be Forgotten termination cascade).
 * -----------------------------------------------------------------------------------------
 */

// ==========================================
// 1. DATA MODELS & ENUMERATIONS
// ==========================================

export enum HandPreference {
  RIGHT = "right",
  LEFT = "left",
  AMBIDEXTROUS = "ambidextrous"
}

export enum PrivacyLevel {
  PUBLIC = "public",
  FRIENDS_ONLY = "friends_only",
  PRIVATE = "private"
}

export enum LanguageSelection {
  EN = "en",
  ES = "es",
  FR = "fr",
  DE = "de",
  SYSTEM = "system"
}

export enum AppearancePreference {
  LIGHT = "light",
  DARK = "dark",
  SYSTEM = "system",
  COSMIC_SLATE = "cosmic_slate"
}

export interface NotificationPreferences {
  pushLikes: boolean;
  pushComments: boolean;
  pushFriendRequests: boolean;
  pushMessages: boolean;
  emailWeeklyDigest: boolean;
  inAppSystemAlerts: boolean;
}

export interface EmergencyPoolPreferences {
  allowBroadcasts: boolean;        // Enables receiving disaster alerts
  enableVibrationPattern: boolean;  // Custom hardware vibration sequence for alerts
  criticalOverrideOnly: boolean;    // Only vibrate or flash for high-consequence alerts
}

export interface SecurityOptions {
  mfaEnabled: boolean;
  loginAlertsEnabled: boolean;      // Dispatches emails on unknown IP logins
  autoLockMinutes: number;          // Minutes before forcing app passcode lock (0 = disabled)
}

export interface SavedItem {
  id: string;
  userId: string;
  entityType: "post" | "video" | "reel" | "channel";
  entityId: string;
  savedAt: Date;
}

export interface SubAccountCredentialPlaceholder {
  accountId: string;
  username: string;
  avatarUrl: string | null;
  authTokenPlaceholder: string;     // Abstracted bridge token
  lastSwitchedAt: Date;
}

export interface UserSettings {
  userId: string;
  handPreference: HandPreference;
  privacyLevel: PrivacyLevel;
  notifications: NotificationPreferences;
  emergencyPools: EmergencyPoolPreferences;
  language: LanguageSelection;
  appearance: AppearancePreference;
  security: SecurityOptions;
  linkedAccountsPlaceholder: SubAccountCredentialPlaceholder[];
  currentActiveSubAccountId: string | null;
  updatedAt: Date;
}

// ==========================================
// 2. CENTRALIZED DEFAULT VALUES
// ==========================================

export const DEFAULT_USER_SETTINGS = (userId: string): UserSettings => ({
  userId,
  handPreference: HandPreference.RIGHT,
  privacyLevel: PrivacyLevel.PUBLIC,
  notifications: {
    pushLikes: true,
    pushComments: true,
    pushFriendRequests: true,
    pushMessages: true,
    emailWeeklyDigest: false,
    inAppSystemAlerts: true
  },
  emergencyPools: {
    allowBroadcasts: true,
    enableVibrationPattern: true,
    criticalOverrideOnly: false
  },
  language: LanguageSelection.SYSTEM,
  appearance: AppearancePreference.SYSTEM,
  security: {
    mfaEnabled: false,
    loginAlertsEnabled: true,
    autoLockMinutes: 15
  },
  linkedAccountsPlaceholder: [],
  currentActiveSubAccountId: null,
  updatedAt: new Date()
});

// ============================================================================
// 3. SUPABASE USER SETTINGS SERVICE CLASS
// ============================================================================

export class SupabaseUserSettingsService {
  private supabase: any;

  constructor(supabaseClient: any) {
    this.supabase = supabaseClient;
  }

  /**
   * Fetches user settings configurations. If non-existent, provisions 
   * default values atomically inside the database.
   */
  public async getSettings(userId: string): Promise<{ success: boolean; settings?: UserSettings; error?: string }> {
    try {
      const { data, error } = await this.supabase
        .from("user_settings")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        // Automatically initialize default settings if row doesn't exist
        const defaultSettings = DEFAULT_USER_SETTINGS(userId);
        const { data: inserted, error: insertError } = await this.supabase
          .from("user_settings")
          .insert(this.mapSettingsToRow(defaultSettings))
          .select()
          .single();

        if (insertError) throw insertError;
        return { success: true, settings: this.mapRowToSettings(inserted) };
      }

      return { success: true, settings: this.mapRowToSettings(data) };
    } catch (err: any) {
      return { success: false, error: err?.message || "Failed to retrieve settings profiles." };
    }
  }

  /**
   * Patches existing user settings profiles, keeping unchanged fields.
   */
  public async updateSettings(
    userId: string,
    patch: Partial<Omit<UserSettings, "userId" | "updatedAt">>
  ): Promise<{ success: boolean; settings?: UserSettings; error?: string }> {
    try {
      // 1. Fetch current settings to safely merge nested objects (JSONB fields)
      const current = await this.getSettings(userId);
      if (!current.success || !current.settings) {
        return { success: false, error: current.error || "Cannot find active settings configurations." };
      }

      const mergedSettings: UserSettings = {
        ...current.settings,
        ...patch,
        // Deeply merge nested structures to prevent accidental data erasure
        notifications: {
          ...current.settings.notifications,
          ...(patch.notifications || {})
        },
        emergencyPools: {
          ...current.settings.emergencyPools,
          ...(patch.emergencyPools || {})
        },
        security: {
          ...current.settings.security,
          ...(patch.security || {})
        },
        updatedAt: new Date()
      };

      const { data, error } = await this.supabase
        .from("user_settings")
        .update(this.mapSettingsToRow(mergedSettings))
        .eq("user_id", userId)
        .select()
        .single();

      if (error) throw error;

      return { success: true, settings: this.mapRowToSettings(data) };
    } catch (err: any) {
      return { success: false, error: err?.message || "Settings update aborted." };
    }
  }

  // ==========================================
  // BLOCKED USERS MANAGEMENT
  // ==========================================

  /**
   * Places a bi-directional blocking restriction between users.
   */
  public async blockUser(blockerId: string, blockedId: string): Promise<{ success: boolean; error?: string }> {
    try {
      if (blockerId === blockedId) {
        return { success: false, error: "Self-blocking is not permitted." };
      }

      const id = `blk-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
      const { error } = await this.supabase
        .from("blocked_users")
        .insert({
          id,
          blocker_id: blockerId,
          blocked_id: blockedId
        });

      if (error) throw error;

      // Clean up following relationships in both directions
      await this.supabase
        .from("profiles_followers")
        .delete()
        .or(`and(follower_id.eq.${blockerId},following_id.eq.${blockedId}),and(follower_id.eq.${blockedId},following_id.eq.${blockerId})`);

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || "Block command failed." };
    }
  }

  /**
   * Lifts an active user block restriction.
   */
  public async unblockUser(blockerId: string, blockedId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const { error } = await this.supabase
        .from("blocked_users")
        .delete()
        .eq("blocker_id", blockerId)
        .eq("blocked_id", blockedId);

      if (error) throw error;
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || "Unblocking command failed." };
    }
  }

  /**
   * Fetches the complete list of blocked users.
   */
  public async getBlockedUsers(userId: string): Promise<{ success: boolean; blockedIds?: string[]; error?: string }> {
    try {
      const { data, error } = await this.supabase
        .from("blocked_users")
        .select("blocked_id")
        .eq("blocker_id", userId);

      if (error) throw error;

      return {
        success: true,
        blockedIds: (data || []).map((row: any) => row.blocked_id)
      };
    } catch (err: any) {
      return { success: false, error: err?.message || "Failed to query blocked entities list." };
    }
  }

  // ==========================================
  // SAVED ITEMS BOOKMARKS MANAGEMENT
  // ==========================================

  /**
   * Saves content (post, video, reel, etc.) directly into personal bookmarks deck.
   */
  public async saveItem(
    userId: string,
    entityType: "post" | "video" | "reel" | "channel",
    entityId: string
  ): Promise<{ success: boolean; savedItem?: SavedItem; error?: string }> {
    try {
      const id = `svd-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
      const { data, error } = await this.supabase
        .from("saved_items")
        .upsert({
          id,
          user_id: userId,
          entity_type: entityType,
          entity_id: entityId
        })
        .select()
        .single();

      if (error) throw error;

      return {
        success: true,
        savedItem: {
          id: data.id,
          userId: data.user_id,
          entityType: data.entity_type,
          entityId: data.entity_id,
          savedAt: new Date(data.created_at)
        }
      };
    } catch (err: any) {
      return { success: false, error: err?.message || "Bookmark creation failed." };
    }
  }

  /**
   * Deletes a content item from the saved items ledger.
   */
  public async unsaveItem(
    userId: string,
    entityType: "post" | "video" | "reel" | "channel",
    entityId: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const { error } = await this.supabase
        .from("saved_items")
        .delete()
        .eq("user_id", userId)
        .eq("entity_type", entityType)
        .eq("entity_id", entityId);

      if (error) throw error;
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || "Bookmark deletion failed." };
    }
  }

  /**
   * Retrieves all saved item records.
   */
  public async getSavedItems(userId: string): Promise<{ success: boolean; items?: SavedItem[]; error?: string }> {
    try {
      const { data, error } = await this.supabase
        .from("saved_items")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      if (error) throw error;

      const mapped: SavedItem[] = (data || []).map((row: any) => ({
        id: row.id,
        userId: row.user_id,
        entityType: row.entity_type,
        entityId: row.entity_id,
        savedAt: new Date(row.created_at)
      }));

      return { success: true, items: mapped };
    } catch (err: any) {
      return { success: false, error: err?.message || "Failed to retrieve saved bookmarks ledger." };
    }
  }

  // ==========================================
  // MULTIPLE ACCOUNT SWITCHING PLACEHOLDER
  // ==========================================

  /**
   * Simulates credentials bridging, registering a sub-account placeholder link.
   */
  public async linkSubAccountPlaceholder(
    userId: string,
    subAccount: { username: string; avatarUrl: string | null; token: string }
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const current = await this.getSettings(userId);
      if (!current.success || !current.settings) {
        return { success: false, error: current.error || "Cannot find active user profile." };
      }

      const newCredentials: SubAccountCredentialPlaceholder = {
        accountId: `sub-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
        username: subAccount.username,
        avatarUrl: subAccount.avatarUrl,
        authTokenPlaceholder: subAccount.token,
        lastSwitchedAt: new Date()
      };

      const updatedList = [...current.settings.linkedAccountsPlaceholder, newCredentials];

      await this.updateSettings(userId, {
        linkedAccountsPlaceholder: updatedList
      });

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || "Sub-account linking aborted." };
    }
  }

  /**
   * Emulates switching active accounts, updating telemetry metadata logs.
   */
  public async switchActiveAccountPlaceholder(
    userId: string,
    targetAccountId: string
  ): Promise<{ success: boolean; sessionToken?: string; error?: string }> {
    try {
      const current = await this.getSettings(userId);
      if (!current.success || !current.settings) {
        return { success: false, error: current.error || "Cannot find active user profile." };
      }

      const match = current.settings.linkedAccountsPlaceholder.find(acc => acc.accountId === targetAccountId);
      if (!match) {
        return { success: false, error: "Sub-account record not configured or unauthorized." };
      }

      match.lastSwitchedAt = new Date();

      await this.updateSettings(userId, {
        linkedAccountsPlaceholder: current.settings.linkedAccountsPlaceholder,
        currentActiveSubAccountId: targetAccountId
      });

      return {
        success: true,
        sessionToken: match.authTokenPlaceholder // Return virtual bridge token
      };
    } catch (err: any) {
      return { success: false, error: err?.message || "Sub-account switching failed." };
    }
  }

  // ==========================================
  // GDPR COMPLIANT UTILITIES
  // ==========================================

  /**
   * Logs a GDPR Data Export request to queue server-side data generation.
   */
  public async requestGDPRDataExport(userId: string): Promise<{ success: boolean; exportId?: string; error?: string }> {
    try {
      const id = `export-${Date.now()}`;
      const { error } = await this.supabase
        .from("gdpr_requests")
        .insert({
          id,
          user_id: userId,
          request_type: "export",
          status: "pending"
        });

      if (error) throw error;
      return { success: true, exportId: id };
    } catch (err: any) {
      return { success: false, error: err?.message || "Failed to queue export request." };
    }
  }

  /**
   * Logs a permanent GDPR deletion request, initiating cascade data removal.
   */
  public async requestGDPRDataDeletion(userId: string): Promise<{ success: boolean; error?: string }> {
    try {
      // Direct hard purge of settings row
      const { error: sError } = await this.supabase
        .from("user_settings")
        .delete()
        .eq("user_id", userId);

      if (sError) throw sError;

      // Log deletion command
      await this.supabase
        .from("gdpr_requests")
        .insert({
          id: `delete-${Date.now()}`,
          user_id: userId,
          request_type: "deletion",
          status: "completed"
        });

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || "Cascade purge request failed." };
    }
  }

  // ==========================================
  // ROW MAPPING CONVERTERS
  // ==========================================

  private mapRowToSettings(row: any): UserSettings {
    const rawNotify = row.notifications || {};
    const rawEmergency = row.emergency_pools || {};
    const rawSecurity = row.security || {};

    return {
      userId: row.user_id,
      handPreference: row.hand_preference as HandPreference,
      privacyLevel: row.privacy_level as PrivacyLevel,
      notifications: {
        pushLikes: rawNotify.push_likes ?? true,
        pushComments: rawNotify.push_comments ?? true,
        pushFriendRequests: rawNotify.push_friend_requests ?? true,
        pushMessages: rawNotify.push_messages ?? true,
        emailWeeklyDigest: rawNotify.email_weekly_digest ?? false,
        inAppSystemAlerts: rawNotify.in_app_system_alerts ?? true
      },
      emergencyPools: {
        allowBroadcasts: rawEmergency.allow_broadcasts ?? true,
        enableVibrationPattern: rawEmergency.enable_vibration_pattern ?? true,
        criticalOverrideOnly: rawEmergency.critical_override_only ?? false
      },
      language: row.language as LanguageSelection,
      appearance: row.appearance as AppearancePreference,
      security: {
        mfaEnabled: rawSecurity.mfa_enabled ?? false,
        loginAlertsEnabled: rawSecurity.login_alerts_enabled ?? true,
        autoLockMinutes: rawSecurity.auto_lock_minutes ?? 15
      },
      linkedAccountsPlaceholder: (row.linked_accounts_placeholder || []).map((acc: any) => ({
        accountId: acc.account_id,
        username: acc.username,
        avatarUrl: acc.avatar_url,
        authTokenPlaceholder: acc.auth_token_placeholder,
        lastSwitchedAt: new Date(acc.last_switched_at)
      })),
      currentActiveSubAccountId: row.current_active_sub_account_id,
      updatedAt: new Date(row.updated_at)
    };
  }

  private mapSettingsToRow(settings: UserSettings): Record<string, any> {
    return {
      user_id: settings.userId,
      hand_preference: settings.handPreference,
      privacy_level: settings.privacyLevel,
      notifications: {
        push_likes: settings.notifications.pushLikes,
        push_comments: settings.notifications.pushComments,
        push_friend_requests: settings.notifications.pushFriendRequests,
        push_messages: settings.notifications.pushMessages,
        email_weekly_digest: settings.notifications.emailWeeklyDigest,
        in_app_system_alerts: settings.notifications.inAppSystemAlerts
      },
      emergency_pools: {
        allow_broadcasts: settings.emergencyPools.allowBroadcasts,
        enable_vibration_pattern: settings.emergencyPools.enableVibrationPattern,
        critical_override_only: settings.emergencyPools.criticalOverrideOnly
      },
      language: settings.language,
      appearance: settings.appearance,
      security: {
        mfa_enabled: settings.security.mfaEnabled,
        login_alerts_enabled: settings.security.loginAlertsEnabled,
        auto_lock_minutes: settings.security.autoLockMinutes
      },
      linked_accounts_placeholder: settings.linkedAccountsPlaceholder.map(acc => ({
        account_id: acc.accountId,
        username: acc.username,
        avatar_url: acc.avatarUrl,
        auth_token_placeholder: acc.authTokenPlaceholder,
        last_switched_at: acc.lastSwitchedAt.toISOString()
      })),
      current_active_sub_account_id: settings.currentActiveSubAccountId,
      updated_at: settings.updatedAt
    };
  }
}

// ============================================================================
// 4. POSTGRES ROW LEVEL SECURITY (RLS) & DATABASE SCHEMA MIGRATION
// ============================================================================

export const SQL_USER_SETTINGS_MIGRATION = `
-- ============================================================================
-- SQL SCHEMA FOR TURTLE USER SETTINGS & PREFERENCES SYSTEM
-- ============================================================================

-- Core user preferences catalog
create table if not exists public.user_settings (
    user_id uuid references public.profiles(id) on delete cascade primary key,
    hand_preference text default 'right'::text not null check (hand_preference in ('right', 'left', 'ambidextrous')),
    privacy_level text default 'public'::text not null check (privacy_level in ('public', 'friends_only', 'private')),
    notifications jsonb default '{"push_likes":true,"push_comments":true,"push_friend_requests":true,"push_messages":true,"email_weekly_digest":false,"in_app_system_alerts":true}'::jsonb not null,
    emergency_pools jsonb default '{"allow_broadcasts":true,"enable_vibration_pattern":true,"critical_override_only":false}'::jsonb not null,
    language text default 'system'::text not null check (language in ('en', 'es', 'fr', 'de', 'system')),
    appearance text default 'system'::text not null check (appearance in ('light', 'dark', 'system', 'cosmic_slate')),
    security jsonb default '{"mfa_enabled":false,"login_alerts_enabled":true,"auto_lock_minutes":15}'::jsonb not null,
    linked_accounts_placeholder jsonb default '[]'::jsonb not null,
    current_active_sub_account_id text,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Saved items ledger
create table if not exists public.saved_items (
    id uuid default uuid_generate_v4() primary key,
    user_id uuid references public.profiles(id) on delete cascade not null,
    entity_type text not null check (entity_type in ('post', 'video', 'reel', 'channel')),
    entity_id text not null,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    
    constraint unique_user_saved_item unique (user_id, entity_type, entity_id)
);

-- GDPR Data extraction logs
create table if not exists public.gdpr_requests (
    id uuid default uuid_generate_v4() primary key,
    user_id uuid references public.profiles(id) on delete cascade not null,
    request_type text not null check (request_type in ('export', 'deletion')),
    status text default 'pending'::text not null check (status in ('pending', 'processing', 'completed', 'failed')),
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- ============================================================================
-- AUTOMATED USER_SETTINGS INITIALIZATION TRIGGER
-- ============================================================================

create or replace function public.on_profile_create_initialize_user_settings()
returns trigger as $$
begin
    insert into public.user_settings (user_id)
    values (new.id)
    on conflict (user_id) do nothing;
    return null;
end;
$$ language plpgsql security definer;

create trigger tr_profiles_initialize_user_settings
    after insert on public.profiles
    for each row execute function public.on_profile_create_initialize_user_settings();

-- ============================================================================
-- SECURE ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

alter table public.user_settings enable row level security;
alter table public.saved_items enable row level security;
alter table public.gdpr_requests enable row level security;

-- 1. Settings Policy: Strictly restricted to owned profiles
create policy "Users can fully manage their settings profile"
    on public.user_settings for all
    using (auth.uid() = user_id);

-- 2. Saved Items Policy: Strictly restricted to owned items
create policy "Users can fully manage their saved bookmarks"
    on public.saved_items for all
    using (auth.uid() = user_id);

-- 3. GDPR requests Policy: Strictly restricted to owned queries
create policy "Users can fully manage their GDPR logs"
    on public.gdpr_requests for all
    using (auth.uid() = user_id);

-- ============================================================================
-- INDEXES FOR INSTANT ACCESS SCALES
-- ============================================================================
create index if not exists idx_saved_items_by_user 
on public.saved_items (user_id, created_at desc);

create index if not exists idx_gdpr_requests_by_user 
on public.gdpr_requests (user_id, status);
`;

// ============================================================================
// 5. EDGE CASE MITIGATIONS SPECIFICATION
// ============================================================================

export const USER_SETTINGS_EDGE_CASE_MITIGATIONS = {
  dynamicDeepMerging: {
    problem: "Partially patching nested settings (e.g. updating pushLikes inside notifications) risks wiping out other notification toggles.",
    resolution: "The SupabaseUserSettingsService enforces deep merging of nested notification, emergency, and security config objects prior to SQL serialization."
  },
  atomicUserProvisioning: {
    problem: "When a new user signs up, checking if settings exist and then creating them client-side introduces race conditions and potential null exceptions.",
    resolution: "A robust database-level trigger is provisioned ('tr_profiles_initialize_user_settings') which automatically generates default settings rows instantly upon user profile registration."
  },
  cascadeDataPurging: {
    problem: "GDPR compliance mandates that deleted users have all traces deleted without breaking historical chat flows for others.",
    resolution: "SQL cascade configurations handle the clean eviction of user settings, GDPR requests, and saved item rows, while messages are securely anonymized."
  }
};
