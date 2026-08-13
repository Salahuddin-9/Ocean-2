/**
 * turtleRankingEngine.ts
 * ----------------------------------------------------------------------------
 * TURTLE HYBRID CONTENT RANKING ENGINE (ATLAS-RANK Architecture)
 * ----------------------------------------------------------------------------
 * A client-side adaptation of the ATLAS-RANK specification tuned for Turtle Social.
 * Ranking blends four platform signals:
 *
 *   1. INSTAGRAM  50%  -> engagement quality (like / comment / share / save /
 *                        follow / profile-visit), Wilson lower bound, recency
 *   2. YOUTUBE    25%  -> watch-time (avg watch seconds, completion, rewatch)
 *   3. TIKTOK     25%  -> virality (view velocity, rewatch rate, share rate,
 *                        title keyword affinity)
 *   4. FACEBOOK BOOST  -> paid boost multiplier (Boost Post)
 *
 * Personalization & Diversity layers:
 *   - Interested / Not Interested clicks (Facebook style) -> strong +/- signal
 *   - Language & country / region matching
 *   - Following / Saved / Visited creator relationships
 *   - "App usage after watch" retention
 *   - Exploration / Cold-Start UCB-1 uncertainty bonus for new posts & creators
 *   - Full-Feed Diversity "Seen Recently" penalty across post/creator/category
 *   - Stage 8 Maximal Marginal Relevance (MMR) re-ranking with hard slate constraints
 *
 * All signals & math kernels are self-contained with automatic localStorage pruning.
 * ----------------------------------------------------------------------------
 */

export type RankSignalType =
  | "watch"
  | "rewatch"
  | "complete"
  | "like"
  | "comment"
  | "share"
  | "save"
  | "follow"
  | "profile_visit"
  | "interested"
  | "not_interested"
  | "boost";

export interface RankContext {
  userId?: string | null;
  language?: string; // e.g. "bn", "en"
  country?: string;  // e.g. "BD"
  region?: string;   // e.g. "Dhaka"
  followingIds?: string[];
  savedIds?: string[];
  interests?: string[]; // learned keyword interests
}

export interface RankScore {
  instagram: number;  // 0..1 engagement utility
  youtube: number;    // 0..1 watch-time utility
  tiktok: number;     // 0..1 virality utility
  blend: number;      // weighted platform blend (0.5/0.25/0.25)
  boost: number;      // Facebook Boost Post multiplier
  feedback: number;   // interested / not-interested multiplier
  locality: number;   // language + country + relationship multiplier
  retention: number;  // app-usage-after-watch multiplier
  exploration: number;// UCB-1 cold-start discovery bonus
  seenPenalty: number;// full-feed "seen recently" diversity factor
  total: number;      // final score
}

export interface ItemStats {
  watchSeconds: number;
  watchSessions: number;
  rewinds: number;
  completions: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  follows: number;
  visits: number;
  interested: number;
  notInterested: number;
  boostAmount: number;
  appUsesAfterWatch: number;
  lastWatchAt: number;
  firstSeenAt: number;
}

export interface SeenRecord {
  id: string;
  creatorId: string;
  category: string;
  timestamp: number;
}

interface StoredData {
  stats: Record<string, ItemStats>;
  interests: Record<string, number>;
  feedback: Record<string, "interested" | "not_interested">;
  boosted: string[];
  recentlySeen: SeenRecord[];
}

const STORAGE_KEY = "turtle_ranking_v2";

const STOPWORDS = new Set([
  "the","a","an","and","or","of","to","for","in","on","at","by","with","is",
  "are","was","were","be","been","this","that","it","from","as","my","your",
  "our","their","how","what","why","when","new","video","post","share","get",
  "its","not","but","if","so","just","very","can","will","more","all","about",
]);

// ---------------------------------------------------------------------------
// Self-Contained Math Kernels & Numerical Helpers
// ---------------------------------------------------------------------------

export const EPS = 1e-9;

export function clamp(x: number, lo: number, hi: number): number {
  if (!Number.isFinite(x)) return lo;
  return Math.min(hi, Math.max(lo, x));
}

export function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-clamp(x, -30, 30)));
}

export function softplus(x: number): number {
  return x > 20 ? x : Math.log1p(Math.exp(x));
}

/** Wilson lower bound — confidence-corrected positive rate (z = 1.96). */
export function wilsonLowerBound(positive: number, total: number, z = 1.96): number {
  if (total <= 0) return 0;
  const p = positive / total;
  const z2 = z * z;
  const denom = 1 + z2 / total;
  const centre = p + z2 / (2 * total);
  const margin = z * Math.sqrt((p * (1 - p) + z2 / (4 * total)) / total);
  return clamp((centre - margin) / denom, 0, 1);
}

/** Exponential half-life decay in hours. */
export function halfLifeDecay(ageHours: number, halfLifeHours = 36): number {
  return Math.pow(2, -Math.max(0, ageHours) / Math.max(EPS, halfLifeHours));
}

/** 32-bit FNV-1a hash function for feature vectors. */
export function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Hash a text token into a signed unit vector component. */
export function hashToVector(token: string, dim: number, weight = 1): number[] {
  const v = new Array<number>(dim).fill(0);
  const h = fnv1a(token);
  const idx = h % dim;
  const sign = ((h >>> 16) & 1) === 0 ? 1 : -1;
  v[idx] = sign * weight;
  return v;
}

export function dot(a: readonly number[], b: readonly number[]): number {
  const n = Math.min(a.length, b.length);
  let s = 0;
  for (let i = 0; i < n; i++) s += a[i] * b[i];
  return s;
}

export function norm(a: readonly number[]): number {
  return Math.sqrt(dot(a, a));
}

export function cosine(a: readonly number[], b: readonly number[]): number {
  const na = norm(a);
  const nb = norm(b);
  if (na < EPS || nb < EPS) return 0;
  return clamp(dot(a, b) / (na * nb), -1, 1);
}

export function detectLanguage(text: string): string {
  // Bengali script range U+0980–U+09FF
  if (/[\u0980-\u09FF]/.test(text)) return "bn";
  return "en";
}

export function tokenize(text: string): string[] {
  if (!text) return [];
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w));
}

// ---------------------------------------------------------------------------
// Engine Implementation
// ---------------------------------------------------------------------------

function emptyStats(): ItemStats {
  const now = Date.now();
  return {
    watchSeconds: 0,
    watchSessions: 0,
    rewinds: 0,
    completions: 0,
    likes: 0,
    comments: 0,
    shares: 0,
    saves: 0,
    follows: 0,
    visits: 0,
    interested: 0,
    notInterested: 0,
    boostAmount: 0,
    appUsesAfterWatch: 0,
    lastWatchAt: 0,
    firstSeenAt: now,
  };
}

class TurtleRankingEngine {
  private data: StoredData;
  /** In-memory watch tick state: id -> { last, acc, loops, started } */
  private ticks: Record<string, { last: number; acc: number; loops: number; started: number }> = {};
  private lastWatchId: string | null = null;
  private lastWatchAt = 0;
  private lastPersist = 0;

  constructor() {
    this.data = this.load();
  }

  // -- persistence & memory pruning -----------------------------------------

  private load(): StoredData {
    const fallback: StoredData = { stats: {}, interests: {}, feedback: {}, boosted: [], recentlySeen: [] };
    try {
      if (typeof localStorage === "undefined") return fallback;
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw);
      return {
        stats: parsed.stats || {},
        interests: parsed.interests || {},
        feedback: parsed.feedback || {},
        boosted: Array.isArray(parsed.boosted) ? parsed.boosted : [],
        recentlySeen: Array.isArray(parsed.recentlySeen) ? parsed.recentlySeen : [],
      };
    } catch {
      return fallback;
    }
  }

  /** Keep localStorage clean and bounded to prevent QuotaExceededError. */
  private pruneStoredData(): void {
    // 1. Keep top 200 item stats sorted by recency
    const statsEntries = Object.entries(this.data.stats);
    if (statsEntries.length > 200) {
      statsEntries.sort((a, b) => (b[1].lastWatchAt || b[1].firstSeenAt) - (a[1].lastWatchAt || a[1].firstSeenAt));
      const prunedStats: Record<string, ItemStats> = {};
      for (const [id, s] of statsEntries.slice(0, 200)) {
        prunedStats[id] = s;
      }
      this.data.stats = prunedStats;
    }

    // 2. Keep top 80 keyword interests sorted by weight
    const interestEntries = Object.entries(this.data.interests);
    if (interestEntries.length > 80) {
      interestEntries.sort((a, b) => b[1] - a[1]);
      const prunedInterests: Record<string, number> = {};
      for (const [word, weight] of interestEntries.slice(0, 80)) {
        prunedInterests[word] = weight;
      }
      this.data.interests = prunedInterests;
    }

    // 3. Keep last 100 seen records
    if (this.data.recentlySeen.length > 100) {
      this.data.recentlySeen = this.data.recentlySeen.slice(-100);
    }
  }

  private persist(force = false): void {
    const now = Date.now();
    if (!force && now - this.lastPersist < 2000) return;
    this.lastPersist = now;
    this.pruneStoredData();
    try {
      if (typeof localStorage !== "undefined") {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
      }
    } catch {
      /* Storage full / unavailable — ignore */
    }
  }

  private statsOf(id: string): ItemStats {
    if (!this.data.stats[id]) this.data.stats[id] = emptyStats();
    return this.data.stats[id];
  }

  // -- public state API -----------------------------------------------------

  getStats(id: string): ItemStats {
    return { ...this.statsOf(id) };
  }

  /** Non-mutating check — unlike getStats, this never creates an empty entry. */
  hasStats(id: string): boolean {
    return !!this.data.stats[id];
  }

  getBoosted(): string[] {
    return [...this.data.boosted];
  }

  isBoosted(id: string): boolean {
    return this.data.boosted.includes(id);
  }

  getFeedback(): Record<string, "interested" | "not_interested"> {
    return { ...this.data.feedback };
  }

  getInterests(): string[] {
    return Object.entries(this.data.interests)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 25)
      .map(([w]) => w);
  }

  buildContext(partial: Partial<RankContext>): RankContext {
    return {
      userId: partial.userId ?? null,
      language:
        partial.language ||
        (typeof navigator !== "undefined" ? navigator.language?.split("-")[0] : undefined),
      country: partial.country,
      region: partial.region,
      followingIds: partial.followingIds || [],
      savedIds: partial.savedIds || [],
      interests: partial.interests || this.getInterests(),
    };
  }

  /** Mark an item as seen in the recent session feed buffer. */
  markAsSeen(id: string, creatorId = "unknown", category = "general"): void {
    if (!id) return;
    const now = Date.now();
    this.data.recentlySeen.push({ id, creatorId, category, timestamp: now });
    if (this.data.recentlySeen.length > 100) {
      this.data.recentlySeen = this.data.recentlySeen.slice(-100);
    }
    this.persist();
  }

  /** Core signal recorder with positive/negative keyword interest learning. */
  recordSignal(id: string, type: RankSignalType, contentText?: string): void {
    if (!id) return;
    const s = this.statsOf(id);
    const now = Date.now();

    // Retention signal: attribution of app usage within 5 minutes of watching
    if (
      this.lastWatchId &&
      this.lastWatchAt &&
      now - this.lastWatchAt < 5 * 60 * 1000 &&
      type !== "watch"
    ) {
      const watched = this.statsOf(this.lastWatchId);
      watched.appUsesAfterWatch += 1;
      this.lastWatchId = null;
    }

    switch (type) {
      case "like":
        s.likes += 1;
        break;
      case "comment":
        s.comments += 1;
        break;
      case "share":
        s.shares += 1;
        break;
      case "save":
        s.saves += 1;
        break;
      case "follow":
        s.follows += 1;
        break;
      case "profile_visit":
        s.visits += 1;
        break;
      case "interested":
        s.interested += 1;
        this.data.feedback[id] = "interested";
        break;
      case "not_interested":
        s.notInterested += 1;
        this.data.feedback[id] = "not_interested";
        break;
      case "boost":
        s.boostAmount = Math.min(2, s.boostAmount + 1);
        if (!this.data.boosted.includes(id)) this.data.boosted.push(id);
        break;
      default:
        break;
    }

    // Learn or penalize keyword interests based on signal type
    if (contentText) {
      const positive = ["like", "save", "share", "interested", "complete"].includes(type);
      const negative = type === "not_interested";
      const tokens = tokenize(contentText);

      if (positive) {
        for (const word of tokens) {
          const current = this.data.interests[word] || 0;
          this.data.interests[word] = Math.min(30, current + 1.5);
        }
      } else if (negative) {
        for (const word of tokens) {
          const current = this.data.interests[word] || 0;
          this.data.interests[word] = Math.max(0, current - 2.0);
        }
      }
    }

    this.persist();
  }

  /**
   * Called on video timeupdate ticks.
   * Fixes watch-time accumulation & ensures watchSessions is tracked accurately.
   */
  recordWatch(id: string, currentSeconds: number): void {
    if (!id) return;
    const s = this.statsOf(id);
    const m = (this.ticks[id] = this.ticks[id] || {
      last: currentSeconds,
      acc: 0,
      loops: 0,
      started: Date.now(),
    });

    const dt = currentSeconds - m.last;
    if (dt > 0 && dt < 3.0) {
      m.acc += dt;
      s.watchSeconds += dt;
      if (s.watchSessions === 0) {
        s.watchSessions = 1;
      }
    }
    m.last = currentSeconds;
    s.lastWatchAt = Date.now();
    this.lastWatchId = id;
    this.lastWatchAt = s.lastWatchAt;
    this.persist();
  }

  /**
   * Called when a video loop completes.
   * Increments completions, rewinds, and watch sessions without double counting.
   */
  recordWatchEnd(id: string): void {
    if (!id) return;
    const s = this.statsOf(id);
    const m = (this.ticks[id] = this.ticks[id] || {
      last: 0,
      acc: 0,
      loops: 0,
      started: Date.now(),
    });

    m.loops += 1;
    s.completions += 1;
    s.watchSessions += 1;
    if (m.loops > 1) s.rewinds += 1;
    m.last = 0; // Reset last tick so next loop start doesn't cause jump errors
    s.lastWatchAt = Date.now();
    this.lastWatchId = id;
    this.lastWatchAt = s.lastWatchAt;
    this.persist(true);
  }

  toggleBoost(id: string): boolean {
    if (this.data.boosted.includes(id)) {
      this.data.boosted = this.data.boosted.filter((b) => b !== id);
      return false;
    }
    this.recordSignal(id, "boost");
    return true;
  }

  // -- ranking engine math --------------------------------------------------

  /** Continuous weighted keyword affinity based on user's learned interests. */
  private keywordAffinity(text: string, interests: string[]): number {
    if (!text || interests.length === 0) return 0;
    const tokens = new Set(tokenize(text));
    let score = 0;
    for (const w of tokens) {
      const weight = this.data.interests[w] || (interests.includes(w) ? 1 : 0);
      if (weight > 0) {
        score += Math.min(weight, 3);
      }
    }
    return clamp(score / 8, 0, 1);
  }

  /** Score an individual item against user context & engagement statistics. */
  private scoreItem(item: any, ctx: RankContext): RankScore {
    const id = item?.id || "";
    const s = this.statsOf(id);

    // Normalize metadata fields
    const title = item?.title || item?.caption || item?.contentText || "";
    const caption = item?.caption || item?.content || item?.contentText || "";
    const text = `${title} ${caption}`;

    let createdAt = 0;
    if (item?.createdAt) {
      const t =
        item.createdAt instanceof Date
          ? item.createdAt.getTime()
          : typeof item.createdAt === "number"
          ? item.createdAt
          : Date.parse(item.createdAt);
      if (!isNaN(t)) createdAt = t;
    }
    if (!createdAt) {
      const m = String(id).match(/post-(\d+)/);
      if (m) createdAt = Number(m[1]);
    }
    if (!createdAt && item?.date) createdAt = Date.parse(item.date) || 0;

    const views =
      (typeof item?.viewsCount === "number" ? item.viewsCount : 0) ||
      parseInt(item?.views || "0", 10) ||
      (typeof item?.views === "number" ? item.views : 0) ||
      0;
    const likes = item?.likes || item?.likeCount || 0;
    const comments = item?.comments?.length || item?.commentCount || 0;
    const shares = item?.sharesCount || item?.repostsCount || item?.shares || 0;
    const saves = item?.saves || 0;
    const creatorId = item?.creatorId || item?.creator?.id || item?.authorId || "unknown";
    const creatorCountry = item?.creator?.countryCode || item?.countryCode || "";
    const category = item?.category || item?.topic || "general";

    const ageHours = createdAt ? Math.max(0, (Date.now() - createdAt) / 3.6e6) : 24;

    // Creator level stats
    const cs = creatorId && creatorId !== "unknown" && this.data.stats[creatorId] ? this.data.stats[creatorId] : null;

    // ===== INSTAGRAM (50%) — engagement quality + recency =====
    const engagement =
      likes * 1 +
      comments * 3 +
      shares * 5 +
      saves * 4 +
      (cs?.follows || 0) * 3 +
      (cs?.visits || 0) * 2 +
      s.interested * 2;
    const impressions = Math.max(views, engagement, s.watchSessions, 1);
    const igRate = wilsonLowerBound(engagement, impressions);
    const igRecency = halfLifeDecay(ageHours, 24);
    const instagram = (0.7 * sigmoid(engagement / 20) + 0.3 * igRate) * (0.5 + 0.5 * igRecency);

    // ===== YOUTUBE (25%) — watch time =====
    const effectiveSessions = Math.max(s.watchSessions, s.watchSeconds > 0 ? 1 : 0);
    const avgWatch = effectiveSessions ? s.watchSeconds / effectiveSessions : 0;
    const completionRate = effectiveSessions ? clamp(s.completions / effectiveSessions, 0, 1) : 0;
    const youtube =
      0.45 * sigmoid(avgWatch / 45) +
      0.35 * completionRate +
      0.2 * sigmoid(views / 500);

    // ===== TIKTOK (25%) — virality + title affinity =====
    const viewVelocity = impressions / Math.max(1, ageHours + 1);
    const rewatchRate = effectiveSessions ? clamp(s.rewinds / effectiveSessions, 0, 1) : 0;
    const shareRate = impressions ? clamp(s.shares / impressions, 0, 1) : 0;
    const affinity = this.keywordAffinity(text, ctx.interests || []);
    const tiktok =
      0.35 * sigmoid(viewVelocity / 20) +
      0.2 * rewatchRate +
      0.25 * shareRate +
      0.2 * affinity;

    // ===== BLEND (the fixed platform weights) =====
    const blend = 0.5 * instagram + 0.25 * youtube + 0.25 * tiktok;

    // ===== PERSONALIZATION MULTIPLIERS =====
    const boost = this.isBoosted(id) ? 1 + Math.min(s.boostAmount || 0, 2) : 1;

    let feedback = 1;
    if (s.notInterested > 0) feedback *= Math.pow(0.12, s.notInterested);
    if (s.interested > 0) feedback *= 1 + 0.4 * Math.min(s.interested, 3);

    let locality = 1;
    if (ctx.language) {
      const lang = detectLanguage(text);
      if (lang === ctx.language) locality *= 1.25;
    }
    if (ctx.country && creatorCountry) {
      if (String(creatorCountry).toUpperCase() === String(ctx.country).toUpperCase()) locality *= 1.15;
    }
    if (creatorId !== "unknown" && ctx.followingIds?.includes(creatorId)) locality *= 1.3;
    if (ctx.savedIds?.includes(id)) locality *= 1.4;
    if ((cs?.visits || 0) > 0) locality *= 1 + 0.1 * Math.min(cs?.visits || 0, 5);

    const retention = s.appUsesAfterWatch > 0 ? 1 + 0.12 * Math.min(s.appUsesAfterWatch, 5) : 1;

    // ===== EXPLORATION / COLD-START BONUS (UCB-1) =====
    // New posts (<24h old) or content with low impressions (<15) get an uncertainty boost
    let exploration = 1;
    if (impressions < 15 || ageHours < 24) {
      const uncertainty = Math.sqrt(Math.log(impressions + 10) / (impressions + 1));
      exploration = 1 + 0.35 * uncertainty * halfLifeDecay(ageHours, 24);
    }

    // ===== FULL-FEED DIVERSITY "SEEN RECENTLY" PENALTY =====
    let seenPenalty = 1;
    const recent20 = this.data.recentlySeen.slice(-20);
    if (recent20.some((r) => r.id === id)) {
      seenPenalty *= 0.35; // Heavy decay if exact post was seen recently
    }
    const recent15 = this.data.recentlySeen.slice(-15);
    const creatorSeenCount = recent15.filter((r) => r.creatorId === creatorId && creatorId !== "unknown").length;
    if (creatorSeenCount > 0) {
      seenPenalty *= 1 / (1 + 0.35 * creatorSeenCount);
    }
    const categorySeenCount = recent15.filter((r) => r.category === category).length;
    if (categorySeenCount > 0) {
      seenPenalty *= 1 / (1 + 0.2 * categorySeenCount);
    }

    const total = softplus(blend) * boost * feedback * locality * retention * exploration * seenPenalty;

    return {
      instagram,
      youtube,
      tiktok,
      blend,
      boost,
      feedback,
      locality,
      retention,
      exploration,
      seenPenalty,
      total,
    };
  }

  /** Extract a 16-dimensional vector for MMR content similarity checks. */
  private getItemVector(item: any): number[] {
    const dim = 16;
    const vec = new Array<number>(dim).fill(0);
    const text = `${item?.title || ''} ${item?.caption || ''} ${item?.category || ''}`;
    const tokens = tokenize(text);
    for (const token of tokens) {
      const tv = hashToVector(token, dim, 1.0);
      for (let i = 0; i < dim; i++) vec[i] += tv[i];
    }
    const creatorId = item?.creatorId || item?.creator?.id || item?.authorId || "";
    if (creatorId) {
      const cv = hashToVector(`creator:${creatorId}`, dim, 2.0);
      for (let i = 0; i < dim; i++) vec[i] += cv[i];
    }
    return vec;
  }

  /**
   * Rank a mixed array of post/reel objects using the hybrid scoring engine,
   * followed by Stage 8 Maximal Marginal Relevance (MMR) diversity re-ranking
   * with hard slate constraints.
   */
  rankItems<T>(items: T[], ctx: RankContext, kind: "post" | "reel", enableMMR = true): T[] {
    if (!items || items.length === 0) return items;

    // Step 1: Compute raw score breakdown
    const candidates = items.map((item: any, idx) => {
      const breakdown = this.scoreItem(item, ctx);
      const vec = this.getItemVector(item);
      return {
        rawItem: item,
        score: breakdown.total,
        breakdown,
        vec,
        creatorId: item?.creatorId || item?.creator?.id || item?.authorId || "unknown",
        category: item?.category || item?.topic || "general",
        origIdx: idx,
      };
    });

    if (!enableMMR || candidates.length <= 2) {
      candidates.sort((a, b) => b.score - a.score || a.origIdx - b.origIdx);
      return candidates.map((c) => ({
        ...c.rawItem,
        __rankScore: c.score,
        __rankBreakdown: c.breakdown,
        __rankKind: kind,
        __rankIndex: c.origIdx,
      }));
    }

    // Step 2: Stage 8 MMR Re-Ranking with Slate Constraints
    const maxScore = Math.max(...candidates.map((c) => c.score), 0.001);
    const lambda = 0.78;
    const remaining = [...candidates];
    const selected: typeof candidates = [];

    while (remaining.length > 0) {
      let bestIdx = -1;
      let bestMMR = -Infinity;

      for (let i = 0; i < remaining.length; i++) {
        const cand = remaining[i];
        const normScore = cand.score / maxScore;

        // Cosine similarity with recently selected items in current slate (last 8)
        const recentSelected = selected.slice(-8);
        let maxSim = 0;
        for (const sel of recentSelected) {
          const sim = cosine(cand.vec, sel.vec);
          if (sim > maxSim) maxSim = sim;
        }

        // MMR score formula
        let mmrScore = lambda * normScore - (1 - lambda) * maxSim;

        // Hard Slate Constraints over last 10 window
        const last10 = selected.slice(-10);
        const creatorCountInWindow = last10.filter((s) => s.creatorId === cand.creatorId && cand.creatorId !== "unknown").length;
        const categoryCountInWindow = last10.filter((s) => s.category === cand.category).length;

        if (creatorCountInWindow >= 2) mmrScore -= 0.4;
        if (categoryCountInWindow >= 3) mmrScore -= 0.25;

        if (mmrScore > bestMMR) {
          bestMMR = mmrScore;
          bestIdx = i;
        }
      }

      if (bestIdx < 0) bestIdx = 0;
      const [picked] = remaining.splice(bestIdx, 1);
      selected.push(picked);
    }

    return selected.map((c, idx) => ({
      ...c.rawItem,
      __rankScore: c.score,
      __rankBreakdown: c.breakdown,
      __rankKind: kind,
      __rankIndex: idx,
    }));
  }
}

/** Shared singleton instance. */
export const turtleRankingEngine = new TurtleRankingEngine();
