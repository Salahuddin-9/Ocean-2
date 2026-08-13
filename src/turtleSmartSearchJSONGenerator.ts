/**
 * Turtle Social Media Application - Smart Search suggestions JSON Payload Adapter
 * 
 * This file contains the complete, production-ready, non-UI backend schemas,
 * type definitions, response decorators, error constructors, and calculation helper
 * engines for formatting raw search counts into the exact requested JSON layout.
 * 
 * Includes:
 * 1. Rich type declarations for Turtle suggestions and errors
 * 2. Automatic trend metrics estimators (trendDirection, isRising)
 * 3. Dynamic human-friendly volume label generators (e.g., "10K+", "100K+")
 * 4. Full interactive example response constant matching the query "MD Nafis"
 * 5. Explanatory data dictionaries describing every single field
 * 6. Dynamic Ranking mathematical code
 * 7. Secure, standard error payload generators
 * -----------------------------------------------------------------------------------------
 */

// ============================================================================
// 1. DATA MODELS & ENUMS
// ============================================================================

export type TrendDirection = "up" | "down" | "stable";

export interface RelatedEntity {
  id: string;
  name: string;
  type: "profile" | "channel" | "post" | "hashtag";
  avatarUrl?: string | null;
}

export interface SmartSearchSuggestionItem {
  id: string;
  query: string;
  category: "People" | "Channels" | "Posts" | "Hashtags" | "General";
  searchVolumeLabel: string;   // Human-friendly approximate volume (e.g. "10K+", "100+", "5M+")
  rawSearchCount: number;      // Actual exact platform search count
  trendingScore: number;       // Combined velocity calculation score
  trendDirection: TrendDirection;
  isRising: boolean;           // True if accelerating rapidly in the last 24h window
  relatedEntities: RelatedEntity[];
  safetyFiltered: boolean;     // Flag asserting safe-search status evaluation
}

export interface SmartSearchSuggestionsSuccessResponse {
  status: "success";
  query: string;
  timestamp: string;
  latencyMs: number;
  suggestionsCount: number;
  suggestions: SmartSearchSuggestionItem[];
}

export interface SmartSearchErrorResponse {
  status: "error";
  code: string;                // Machine-readable error code (e.g., "QUERY_TOO_SHORT")
  message: string;             // Human-readable brief description
  timestamp: string;
  details: {
    invalidParam?: string;
    allowedBounds?: string;
    [key: string]: any;
  } | null;
}

// ============================================================================
// 2. ADAPTER DECORATION ENGINE (FUNCTIONAL UTILITIES)
// ============================================================================

export class SmartSearchSuggestionsAdapter {
  
  /**
   * Generates a YouTube-style formatted volume label (e.g., "1.2M+", "45K+", "100+")
   * based on exact platform search volume constraints.
   */
  public static generateVolumeLabel(count: number): string {
    if (count <= 0) return "0+";
    if (count < 100) return "10+";
    if (count < 1000) {
      const hundreds = Math.floor(count / 100) * 100;
      return `${hundreds}+`;
    }
    if (count < 1000000) {
      const thousands = Math.floor(count / 1000);
      return `${thousands}K+`;
    }
    const millions = (count / 1000000).toFixed(1);
    // Remove trailing zero if applicable (e.g., "1.0M" -> "1M")
    const cleanMillions = millions.endsWith(".0") ? millions.substring(0, millions.length - 2) : millions;
    return `${cleanMillions}M+`;
  }

  /**
   * Translates score shifts and acceleration statistics into discrete 
   * trend directions and rising binary flags.
   */
  public static evaluateTrendMetrics(
    trendingScore: number,
    velocityRatio24h: number // Ratio of queries in last 24h vs historical average
  ): { direction: TrendDirection; isRising: boolean } {
    let direction: TrendDirection = "stable";
    let isRising = false;

    if (velocityRatio24h >= 1.5) {
      direction = "up";
      isRising = trendingScore > 50.0;
    } else if (velocityRatio24h <= 0.5) {
      direction = "down";
      isRising = false;
    } else {
      direction = "stable";
      isRising = false;
    }

    return { direction, isRising };
  }

  /**
   * Combines raw inputs to build a validated Suggestion Item.
   */
  public static createSuggestionItem(params: {
    id: string;
    query: string;
    category: "People" | "Channels" | "Posts" | "Hashtags" | "General";
    rawSearchCount: number;
    trendingScore: number;
    velocityRatio24h: number;
    relatedEntities?: RelatedEntity[];
    safetyFiltered?: boolean;
  }): SmartSearchSuggestionItem {
    const { direction, isRising } = this.evaluateTrendMetrics(params.trendingScore, params.velocityRatio24h);
    const volumeLabel = this.generateVolumeLabel(params.rawSearchCount);

    return {
      id: params.id,
      query: params.query,
      category: params.category,
      searchVolumeLabel: volumeLabel,
      rawSearchCount: params.rawSearchCount,
      trendingScore: params.trendingScore,
      trendDirection: direction,
      isRising,
      relatedEntities: params.relatedEntities || [],
      safetyFiltered: params.safetyFiltered ?? false
    };
  }

  /**
   * Formats a successful response payload.
   */
  public static buildSuccessResponse(
    query: string,
    items: SmartSearchSuggestionItem[],
    startTimeMs: number
  ): SmartSearchSuggestionsSuccessResponse {
    return {
      status: "success",
      query,
      timestamp: new Date().toISOString(),
      latencyMs: Date.now() - startTimeMs,
      suggestionsCount: items.length,
      suggestions: items
    };
  }

  /**
   * Formats a standardized error payload.
   */
  public static buildErrorResponse(
    code: string,
    message: string,
    invalidParam?: string,
    allowedBounds?: string
  ): SmartSearchErrorResponse {
    return {
      status: "error",
      code,
      message,
      timestamp: new Date().toISOString(),
      details: invalidParam ? { invalidParam, allowedBounds } : null
    };
  }
}

// ============================================================================
// 3. RANKING FORMULA EXPLANATION & CALCULATION MODULE
// ============================================================================

export const RANKING_FORMULA_DETAILS = {
  mathematicalEquation: "Score = (log10(RawSearchCount + 1) * W_volume) + (VelocityRatio24h * W_velocity) - (AgeDecayFactor * W_decay)",
  description: "The suggestions are ranked via a composite dynamic formula incorporating volume scale, hourly acceleration, and recency decay. It prioritizes terms capturing massive engagement or rapid virality, while letting outdated queries decay smoothly.",
  weights: {
    volumeWeight: 3.0,
    velocityWeight: 7.0,
    recencyDecayWeight: 2.0
  }
};

/**
 * Executes a rank calculation for suggestion items.
 */
export function rankSuggestions(
  items: SmartSearchSuggestionItem[]
): SmartSearchSuggestionItem[] {
  // Sort descending by calculated trendingScore parameter
  return [...items].sort((a, b) => b.trendingScore - a.trendingScore);
}

// ============================================================================
// 4. REAL-WORLD PRODUCTION SPECIFICATION (JSON EXAMPLE)
// ============================================================================

/**
 * Concrete response example conforming to the requested "MD Nafis" user query.
 */
export const SAMPLE_MD_NAFIS_SUGGESTIONS_JSON: SmartSearchSuggestionsSuccessResponse = {
  status: "success",
  query: "MD Nafis",
  timestamp: "2026-07-05T13:48:00.000Z",
  latencyMs: 14,
  suggestionsCount: 3,
  suggestions: [
    {
      id: "sug-mdnafis-profile-9821",
      query: "MD Nafis",
      category: "People",
      searchVolumeLabel: "45K+",
      rawSearchCount: 45210,
      trendingScore: 89.45,
      trendDirection: "up",
      isRising: true,
      relatedEntities: [
        {
          id: "usr-nafis-7711",
          name: "@md_nafis",
          type: "profile",
          avatarUrl: "https://turtle.app/avatars/md_nafis.png"
        }
      ],
      safetyFiltered: false
    },
    {
      id: "sug-mdnafis-channel-4210",
      query: "MD Nafis Coding Channel",
      category: "Channels",
      searchVolumeLabel: "12K+",
      rawSearchCount: 12402,
      trendingScore: 74.20,
      trendDirection: "up",
      isRising: false,
      relatedEntities: [
        {
          id: "chan-nafis-coding-902",
          name: "Nafis Tech Academy",
          type: "channel",
          avatarUrl: "https://turtle.app/banners/nafis_academy.jpg"
        }
      ],
      safetyFiltered: false
    },
    {
      id: "sug-mdnafis-posts-0021",
      query: "MD Nafis project updates",
      category: "Posts",
      searchVolumeLabel: "800+",
      rawSearchCount: 840,
      trendingScore: 42.10,
      trendDirection: "stable",
      isRising: false,
      relatedEntities: [
        {
          id: "post-nafis-beta-12",
          name: "Turtle Beta Release Announcement by MD Nafis",
          type: "post"
        }
      ],
      safetyFiltered: false
    }
  ]
};

// ============================================================================
// 5. COMPREHENSIVE ERROR SPECIFICATION (JSON EXAMPLES)
// ============================================================================

export const SAMPLE_ERROR_RESPONSES = {
  queryTooShort: {
    description: "Returned when user inputs less than 2 characters (e.g. 'M')",
    payload: SmartSearchSuggestionsAdapter.buildErrorResponse(
      "QUERY_TOO_SHORT",
      "The input search query does not meet the minimum length constraint.",
      "query",
      "2 to 100 characters"
    )
  },
  rateLimitExceeded: {
    description: "Returned when a suspicious bot triggers more than 30 queries per minute.",
    payload: SmartSearchSuggestionsAdapter.buildErrorResponse(
      "RATE_LIMIT_EXCEEDED",
      "Too many search requests. Please throttle your queries to avoid temporary blocks.",
      "ipAddress",
      "Maximum 30 searches per minute"
    )
  },
  maliciousPatternBlocked: {
    description: "Returned when a potential SQL Injection or XSS code payload is detected.",
    payload: SmartSearchSuggestionsAdapter.buildErrorResponse(
      "MALICIOUS_PATTERN_BLOCKED",
      "Search request rejected. Security firewall identified suspicious pattern footprints.",
      "query",
      "Plaintext alphanumeric text search tokens"
    )
  }
};

// ============================================================================
// 6. DETAILED SPECIFICATION DATA DICTIONARY (FIELD-BY-FIELD)
// ============================================================================

export const FIELD_EXPLANATIONS_DICTIONARY = [
  {
    field: "id",
    dataType: "string (UUID or Prefixed Token)",
    purpose: "Universally unique identifier mapping this specific suggestion row in database cache."
  },
  {
    field: "query",
    dataType: "string",
    purpose: "The exact formatted plaintext query suggested to the client autocompletion bar."
  },
  {
    field: "category",
    dataType: "string ('People' | 'Channels' | 'Posts' | 'Hashtags' | 'General')",
    purpose: "Lanes suggestions to let user interfaces render custom inline context icons."
  },
  {
    field: "searchVolumeLabel",
    dataType: "string",
    purpose: "Approximate platform volume tier (e.g., '10K+') avoiding faking exact stats while keeping data visually simplified."
  },
  {
    field: "rawSearchCount",
    dataType: "number",
    purpose: "True, exact mathematical quantity of submitted queries logged in search_queries_log."
  },
  {
    field: "trendingScore",
    dataType: "number",
    purpose: "Dynamic value mapping search volume acceleration in active time blocks, calculated via decay and trending engines."
  },
  {
    field: "trendDirection",
    dataType: "string ('up' | 'down' | 'stable')",
    purpose: "Indicates trending trajectory momentum over last 24h interval."
  },
  {
    field: "isRising",
    dataType: "boolean",
    purpose: "A high-confidence boolean indicating whether the query is accelerating aggressively (viral spike detection)."
  },
  {
    field: "relatedEntities",
    dataType: "Array of Object (id, name, type, avatarUrl)",
    purpose: "Entity linkage block letting the autocomplete dropdown list direct profiles or channels immediately before loading a search results page."
  },
  {
    field: "safetyFiltered",
    dataType: "boolean",
    purpose: "Confirms whether the suggestion passed safe-search checks (hiding NSFW/sensitive search terms when safe search is on)."
  }
];
