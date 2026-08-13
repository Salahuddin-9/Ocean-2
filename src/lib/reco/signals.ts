/**
 * ATLAS-RANK :: Signal Ontology (spec §22 event schema + reward shaping).
 *
 * Every observable user action maps to:
 *   - an interest-graph weight  w_I  (how much it moves the user model)
 *   - a reward weight           w_R  (how much it moves the RL/ranking reward)
 *   - a satisfaction weight     w_S  (contribution to the long-horizon head)
 *   - a set of supervised LABELS it produces for the multi-task heads
 *
 * Signal weights were calibrated by regressing each action against D7 retention
 * on a 90-day holdout (partial-dependence slope, normalised to like = 1.0).
 */

export type EventType =
  // impressions / watch
  | "impression" | "view_start" | "watch_progress" | "video_complete" | "replay" | "rewatch"
  // positive explicit
  | "like" | "love" | "share" | "save" | "comment" | "comment_like"
  | "follow" | "subscribe" | "profile_visit" | "post_expand" | "audio_reuse"
  | "playlist_add" | "story_view" | "story_complete" | "dm_share"
  // discovery
  | "explore_click" | "search_click" | "hashtag_click" | "topic_expand" | "new_creator_engage"
  // negative
  | "skip" | "fast_scroll" | "swipe_away" | "not_interested" | "hide"
  | "report" | "mute_creator" | "unfollow" | "block_creator" | "session_exit"
  // survey
  | "survey_positive" | "survey_negative";

export interface SignalSpec {
  wInterest: number;
  wReward: number;
  wSatisfaction: number;
  labels: string[];
  negative?: boolean;
  /** Cost of faking this action — used by the anti-spam trust weighting. */
  forgeCost: number;
}

export const SIGNALS: Record<EventType, SignalSpec> = {
  impression:        { wInterest: 0.01,  wReward: 0.0,   wSatisfaction: 0.0,   labels: [], forgeCost: 0.05 },
  view_start:        { wInterest: 0.04,  wReward: 0.05,  wSatisfaction: 0.02,  labels: ["p_view"], forgeCost: 0.1 },
  watch_progress:    { wInterest: 0.10,  wReward: 0.35,  wSatisfaction: 0.20,  labels: ["watch_time", "p_complete"], forgeCost: 0.4 },
  video_complete:    { wInterest: 0.30,  wReward: 0.70,  wSatisfaction: 0.45,  labels: ["p_complete"], forgeCost: 0.6 },
  replay:            { wInterest: 0.42,  wReward: 0.85,  wSatisfaction: 0.55,  labels: ["p_rewatch"], forgeCost: 0.7 },
  rewatch:           { wInterest: 0.46,  wReward: 0.90,  wSatisfaction: 0.60,  labels: ["p_rewatch"], forgeCost: 0.7 },

  like:              { wInterest: 0.35,  wReward: 1.00,  wSatisfaction: 0.40,  labels: ["p_like"], forgeCost: 0.2 },
  love:              { wInterest: 0.42,  wReward: 1.15,  wSatisfaction: 0.50,  labels: ["p_like"], forgeCost: 0.25 },
  share:             { wInterest: 0.55,  wReward: 2.40,  wSatisfaction: 1.10,  labels: ["p_share"], forgeCost: 0.85 },
  dm_share:          { wInterest: 0.60,  wReward: 2.80,  wSatisfaction: 1.25,  labels: ["p_share"], forgeCost: 0.95 },
  save:              { wInterest: 0.58,  wReward: 2.10,  wSatisfaction: 1.30,  labels: ["p_save"], forgeCost: 0.8 },
  comment:           { wInterest: 0.48,  wReward: 1.60,  wSatisfaction: 0.75,  labels: ["p_comment"], forgeCost: 0.6 },
  comment_like:      { wInterest: 0.22,  wReward: 0.55,  wSatisfaction: 0.28,  labels: ["p_comment"], forgeCost: 0.2 },
  follow:            { wInterest: 0.72,  wReward: 3.20,  wSatisfaction: 1.60,  labels: ["p_follow"], forgeCost: 0.9 },
  subscribe:         { wInterest: 0.75,  wReward: 3.40,  wSatisfaction: 1.70,  labels: ["p_follow"], forgeCost: 0.92 },
  profile_visit:     { wInterest: 0.34,  wReward: 1.10,  wSatisfaction: 0.55,  labels: ["p_profile_visit"], forgeCost: 0.5 },
  post_expand:       { wInterest: 0.20,  wReward: 0.45,  wSatisfaction: 0.25,  labels: ["p_expand"], forgeCost: 0.3 },
  audio_reuse:       { wInterest: 0.66,  wReward: 2.60,  wSatisfaction: 1.15,  labels: ["p_share"], forgeCost: 0.95 },
  playlist_add:      { wInterest: 0.60,  wReward: 2.20,  wSatisfaction: 1.30,  labels: ["p_save"], forgeCost: 0.85 },
  story_view:        { wInterest: 0.12,  wReward: 0.30,  wSatisfaction: 0.15,  labels: [], forgeCost: 0.2 },
  story_complete:    { wInterest: 0.26,  wReward: 0.65,  wSatisfaction: 0.35,  labels: ["p_complete"], forgeCost: 0.4 },

  explore_click:     { wInterest: 0.30,  wReward: 0.80,  wSatisfaction: 0.45,  labels: ["p_discovery"], forgeCost: 0.4 },
  search_click:      { wInterest: 0.52,  wReward: 1.20,  wSatisfaction: 0.70,  labels: ["p_discovery"], forgeCost: 0.6 },
  hashtag_click:     { wInterest: 0.34,  wReward: 0.70,  wSatisfaction: 0.35,  labels: ["p_discovery"], forgeCost: 0.4 },
  topic_expand:      { wInterest: 0.44,  wReward: 0.95,  wSatisfaction: 0.60,  labels: ["p_discovery"], forgeCost: 0.5 },
  new_creator_engage:{ wInterest: 0.40,  wReward: 1.30,  wSatisfaction: 0.80,  labels: ["p_follow"], forgeCost: 0.6 },

  skip:              { wInterest: -0.10, wReward: -0.35, wSatisfaction: -0.15, labels: ["p_skip"], negative: true, forgeCost: 0.05 },
  fast_scroll:       { wInterest: -0.16, wReward: -0.55, wSatisfaction: -0.25, labels: ["p_skip"], negative: true, forgeCost: 0.05 },
  swipe_away:        { wInterest: -0.20, wReward: -0.70, wSatisfaction: -0.30, labels: ["p_skip"], negative: true, forgeCost: 0.05 },
  not_interested:    { wInterest: -0.85, wReward: -3.20, wSatisfaction: -1.60, labels: ["p_negative"], negative: true, forgeCost: 0.7 },
  hide:              { wInterest: -0.90, wReward: -3.60, wSatisfaction: -1.80, labels: ["p_negative"], negative: true, forgeCost: 0.75 },
  report:            { wInterest: -1.00, wReward: -6.00, wSatisfaction: -3.00, labels: ["p_negative", "p_violating"], negative: true, forgeCost: 0.9 },
  mute_creator:      { wInterest: -0.60, wReward: -3.00, wSatisfaction: -1.50, labels: ["p_negative"], negative: true, forgeCost: 0.8 },
  unfollow:          { wInterest: -0.70, wReward: -3.40, wSatisfaction: -1.70, labels: ["p_negative"], negative: true, forgeCost: 0.85 },
  block_creator:     { wInterest: -1.00, wReward: -5.00, wSatisfaction: -2.50, labels: ["p_negative"], negative: true, forgeCost: 0.9 },
  session_exit:      { wInterest: -0.12, wReward: -1.40, wSatisfaction: -0.90, labels: ["p_session_extend"], negative: true, forgeCost: 0.1 },

  survey_positive:   { wInterest: 0.50,  wReward: 2.00,  wSatisfaction: 3.00,  labels: ["p_satisfaction"], forgeCost: 0.99 },
  survey_negative:   { wInterest: -0.80, wReward: -2.60, wSatisfaction: -3.40, labels: ["p_satisfaction"], negative: true, forgeCost: 0.99 },
};

export const isNegative = (t: EventType): boolean => SIGNALS[t]?.negative === true;

export const POSITIVE_EVENTS: EventType[] = (Object.keys(SIGNALS) as EventType[]).filter(
  (t) => !SIGNALS[t].negative && SIGNALS[t].wReward > 0.5,
);

/**
 * Watch-time reward shaping.
 *   normalisedWatch = min(watchSec / duration, 3)     (allows rewatch > 1)
 *   R_watch = log1p(watchSec) / log1p(90)  ·  (0.55 + 0.45·completionRatio)
 * Sub-linear in absolute seconds so long-form does not dominate short-form,
 * multiplied by a completion term so a 100%-watched 8s clip beats a 12%-watched
 * 60s clip with the same absolute seconds.
 */
export function watchReward(watchSec: number, durationSec: number): number {
  const d = Math.max(1, durationSec);
  const ratio = Math.min(watchSec / d, 3);
  const completion = Math.min(1, ratio);
  return (Math.log1p(Math.max(0, watchSec)) / Math.log1p(90)) * (0.55 + 0.45 * completion);
}

/**
 * Composite immediate reward for the RL agent (spec §25):
 *   r_t = Σ_e w_R(e) · trust(u)  +  β_w · R_watch  −  γ_x · 1[session_exit]
 * with trust(u) down-weighting low-trust accounts so bot farms cannot steer
 * the policy.
 */
export function immediateReward(
  events: { type: EventType; watchSec?: number; durationSec?: number }[],
  userTrust: number,
): number {
  let r = 0;
  for (const e of events) {
    const spec = SIGNALS[e.type];
    if (!spec) continue;
    r += spec.wReward * (spec.negative ? 1 : userTrust);
    if (e.type === "watch_progress" || e.type === "video_complete") {
      r += 1.35 * watchReward(e.watchSec ?? 0, e.durationSec ?? 20);
    }
  }
  return r;
}

/** Signal → interest-graph delta, trust-weighted and forgery-discounted. */
export function interestSignal(type: EventType, userTrust: number, watchRatio?: number): number {
  const spec = SIGNALS[type];
  if (!spec) return 0;
  let s = spec.wInterest;
  if (type === "watch_progress" && watchRatio !== undefined) {
    // 0.5x at 25% watched, 1.0x at 100%, 1.35x on overwatch
    s *= 0.2 + 1.15 * Math.min(1.15, watchRatio);
  }
  return spec.negative ? s : s * (0.35 + 0.65 * userTrust);
}
