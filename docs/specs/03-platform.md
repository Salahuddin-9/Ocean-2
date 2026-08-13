# ATLAS-RANK — Production Specification
## Part III — Boosted Posts, Integrity, Online Learning, Schemas, Training, Serving, RL, Scaling, Pseudocode, Deployment

---

## 17. BOOSTED POST SYSTEM

### 17.1 Unified auction

An ad competes in the **same value currency** as organic content. It only wins a slot if its total value beats the organic candidate it displaces.

```
AdvertiserValue = bid · P(action | a,u) · pacing(a)
UserValue       = ν · ( 0.45·p_satisfaction + 0.30·relevance + 0.25·p_positiveEngagement )
QualityAdj      = −κ · ( 1.6·negativeFeedbackRate + 0.9·(1 − adQuality) + 1.2·freqPenalty )

TotalValue(a,u) = AdvertiserValue + UserValue + QualityAdj

ν = 3.2  (USD-equivalent per unit of user value — the "user value exchange rate",
          re-estimated quarterly from the long-run retention→revenue elasticity)
κ = 4.0
```

### 17.2 Pricing — GSP with quality

```
price₁ = ( TotalValue₂ − UserValue₁ − QualityAdj₁ ) / ( P(action|a₁,u)·pacing(a₁) ) + $0.01
price₁ = min(price₁, bid₁)
```

The winner pays the minimum bid that would still have won, expressed back in bid space. A high-quality, high-relevance ad pays **less** than a low-quality ad for the same slot — the quality discount is the incentive that keeps ad quality up.

### 17.3 Reserve price = organic opportunity cost

```
reserve = max( 1.15 , ν · S_bestOrganic / S_normaliser )
```

This is the most important line in the ads system: the floor is not a business constant, it is the **user value being displaced**.

### 17.4 Budget pacing

```
Φ(t)          = diurnal spend CDF (two-peak: lunch 13:00, prime 21:00)
targetSpend(t)= dailyBudget · Φ(t)
error(t)      = (spentToday − targetSpend(t)) / dailyBudget
pacing        = clip( exp(−2.4·error) , 0.05 , 2.0 )
```

Under-delivery ⇒ `pacing > 1` ⇒ more aggressive bidding. Over-delivery ⇒ throttled. A second-order term (`−0.6·d(error)/dt`) is added for campaigns with `dailyBudget > $5,000` to damp oscillation.

### 17.5 Frequency capping and ad load

```
freqPenalty = 1 − exp(−impressionsToday / cap)
HARD BLOCK if impressionsToday ≥ cap
GLOBAL CAP: ads ≤ 16% of items in any rolling 50-item window
NEW USER:   no ads until day 3; linear ramp to full load by day 14
```

### 17.6 Conversion model

```
P(conv | objective) = base(objective) · pClick · (0.5 + 0.5·relevance) · (0.6 + 0.4·adQuality) · 6
base = { reach: 1.00, engagement: 0.42, traffic: 0.18, conversion: 0.035, follows: 0.06 }
```

### 17.7 Ad quality score (advertiser-facing, 1–10)

```
AQ = σ( 4.2·p_positiveEngagement − 40·negativeFeedbackRate + 1.8·landingQuality − 2.1 )
```

Campaigns with `negativeFeedbackRate > 0.05` are auto-paused pending review.

### 17.8 Target mix

Base **70% organic / 20% recommended / 10% sponsored**, adaptive per §9 Stage 10. Observed steady-state on a healthy account: 66/24/10. On a low-satisfaction account the sponsored share compresses to 4–6% automatically — ad load is a *function of user health*, not a fixed constant.

---

## 18. ANTI-SPAM LAYER

### 18.1 Three tiers

| Tier | Method | Latency | Coverage |
|---|---|---|---|
| T1 | Rule/velocity CEP in Flink | < 5 ms | 62% of abuse volume |
| T2 | Per-entity statistical anomaly vs cohort | 1 min | +24% |
| T3 | GNN on the user↔content bipartite graph, label propagation | hourly | +12% (the sophisticated 12%) |

### 18.2 Bot probability (per user)

```
rateAnomaly            = z(peakActionsPerMin, 6, 5)/4
intervalCVFit          = 1 − |CV(interArrival) − 1.0| / 1.0
uniformity             = share of sessions with identical length (±2 s)
engagementExtremity    = |engagementRate − 0.07| / 0.5
watchThresholdHugging  = 0.9·(1 − |meanWatchRatio − 0.12|/0.12)

z = 1.9·rateAnomaly + 1.7·(1 − intervalCVFit) + 1.4·uniformity
  + 1.6·engagementExtremity + 1.3·watchThresholdHugging
  + 1.2·(1 − topicEntropy) + 1.1·deviceChurn
  + 1.5·suspiciousFollowRatio + 1.3·registrationBurstScore
  − 1.0·log1p(accountAgeDays)/log1p(365) − 1.6·verified − 3.4

BotProb B(u) = σ(z)
```

`watchThresholdHugging` catches view farms that watch exactly enough to register a view and no more — the single highest-precision signal in the set.

### 18.3 Spam probability (per content)

```
z = 2.6·lowTrustEngagementShare + 1.9·burstiness + 1.7·(1 − engagerUniqueness)
  + 1.8·podOverlap + 1.6·likeWithoutWatchRatio + 1.5·commentDuplicationRate
  + 1.2·log1p(dupClusterSize)/log1p(50) + 0.9·hashtagStuffing
  + 1.4·(1 − geoEntropy) + 1.3·viewImpressionAnomaly + 2.2·min(1,100·reportRate) − 4.1

SpamProb S(c) = σ(z)
```

### 18.4 Detector definitions

```
burstiness(T)  = ((σ_gap − μ_gap)/(σ_gap + μ_gap))/2 + 0.5      Fano-style, Poisson ≈ 0.5→0
podOverlap(E)  = mean pairwise Jaccard of engager sets across a creator's last N posts
                 genuine audience: 0.05–0.18   engagement pod: > 0.45
geoEntropy     = normalised Shannon entropy of engagement-by-country
likeWithoutWatch = likes / max(1, views_with_watch ≥ 2 s)
```

### 18.5 Abuse taxonomy → detector map

| Abuse | Primary detectors |
|---|---|
| Fake likes | lowTrustShare, burstiness, likeWithoutWatch |
| Fake comments | commentDuplicationRate, engagerUniqueness, embedding-cluster of comment text |
| Fake shares | burstiness + geoEntropy + share→open ratio |
| Follow farms | suspiciousFollowRatio, follow-graph bipartite density, registration bursts |
| Engagement pods | podOverlap, reciprocity ratio, temporal co-occurrence |
| Bot networks | GNN label propagation, device/ASN fingerprint clustering |
| View farms | watchThresholdHugging, viewImpressionAnomaly, intervalCV |

### 18.6 Counter discounting

Raw counters are discounted **before** they reach momentum/viral/cold-start:

```
effective = raw · (1 − spamProb)^1.3 · trustWeightedShare
trustWeightedShare = Σ_u T(u)·1[u engaged] / #engagements
```

---

## 19. TRUST LAYER

```
UserTrust     T(u) = (1 − B(u))^1.4 · (0.55 + 0.45·log1p(ageDays)/log1p(365)) · (1 − 0.6·min(1,strikes/5))
ContentTrust  T(c) = (1 − S(c))^1.6 · (0.35 + 0.65·T_creator) · IntegrityScore
CreatorTrust  T_cr = §7
```

Trust is applied in **four** places, which is what makes it effective:

1. Ranking — as the multiplicative `T_trust` gate.
2. Counters — engagement from low-trust accounts contributes fractionally.
3. Training — `L = Σ T(u)·BCE(...)`; a bot's like teaches the model nothing.
4. Bandits — reward is trust-weighted, so farms cannot steer exploration.

### 19.1 Trust propagation over the follow graph

```
T^(k+1)(u) = (1−α)·T^(0)(u) + α · Σ_{v∈N(u)} w_uv·T^(k)(v) / Σ w_uv
α = 0.35, 3 iterations
```

Bot clusters mutually reinforce low trust; a single low-trust follower cannot meaningfully drag down a genuine account.

### 19.2 Appeals and recovery

Enforcement is **reversible**. A creator whose `spamRisk` falls below 0.25 for 14 consecutive days has `M_c` restored linearly over 7 days. Permanent penalties are reserved for policy violations, never for statistical suspicion.

---

## 20. ONLINE LEARNING ARCHITECTURE

```
events.raw ──► flink-label-joiner (30-min watermark, join on request_id+content_id)
                    │
                    ├──► training.examples  (φ from feed_logs + labels)
                    │
        ┌───────────▼───────────┐
        │ ONLINE TRAINER        │  streaming SGD / FTRL-proximal
        │ • per-head weights    │  η = 0.035 (binary), 0.012 (regression)
        │ • L2 = 2e-6           │  gradient clip ±12
        │ • IPS weight = T(u)/√π│
        └───────────┬───────────┘
                    │ every 60 s
        ┌───────────▼───────────┐
        │ VALIDATION GATE       │  holdout AUC, calibration ratio, PSI drift
        │ reject if ΔAUC < −0.4%│
        └───────────┬───────────┘
                    │
             etcd pointer swap ──► all rankers hot-reload in ≤ 30 s
```

### 20.1 SGD step

```
binary:      g = (σ(wᵀφ + b) − y) · T(u) · (1/π)^0.5
             w ← w − η(g·φ + λw) ;  b ← b − η·g

regression:  err = clip(ratio_pred − ratio_true, ±0.35)          Huber
             w ← w − η(err·φ + λw)
```

### 20.2 What updates at what cadence

| Object | Cadence | Mechanism |
|---|---|---|
| Interest graph | ≤ 1 s | Flink user-state |
| Fatigue window | ≤ 1 s | Flink user-state |
| Content counters/velocity | ≤ 1 s | Flink content-state |
| Freshness/momentum/viral | ≤ 60 s | Flink content-state |
| Cold-start phase | ≤ 60 s | Flink content-state (CAS) |
| Head weights | 60 s | online trainer |
| Calibration (a, b) | 15 min | calibration job |
| User embedding | 5 min (or on 10 positive events) | user-tower refresh |
| Content embedding | on upload + on edit | content pipeline |
| Creator scores | 1 h | batch job |
| Topic baselines | 1 h | batch job |
| Full model retrain | 24 h | Ray/PyTorch |
| ANN index | 15 min incremental, 24 h full | index builder |

### 20.3 Safety rails

* **Shadow scoring**: every new weight set scores 1% of live traffic without serving; distributional divergence (PSI > 0.2) blocks promotion.
* **Kill-switch**: etcd flag reverts to the last-known-good pointer in < 5 s.
* **Bounded drift**: `‖w_new − w_lastNightly‖₂ / ‖w_lastNightly‖₂ ≤ 0.35`; exceeding it forces a full retrain instead of continued streaming.

---

## 21. DATABASE SCHEMA

Implemented in `src/db/schema.ts` (Drizzle/Postgres). Logical grouping:

| Table | Purpose | Key indexes |
|---|---|---|
| `users` | identity, locale, behavioural priors, retention/LTV, trust, 64-d embedding | country, language, last_active |
| `user_interests` | interest graph: `(user, topic) → S, L, A, m, conf, kind` | `(user_id, topic)` unique; `(user_id, affinity)` |
| `user_creator_affinity` | per-creator affinity, follow/mute/block | `(user_id, creator_id)` unique |
| `creators` | trust/quality/consistency/satisfaction/retention/growth/risk, tier | primary_topic, trust |
| `content` | text/video/audio understanding, quality vector, safety, embedding, cold-start state | topic, creator, published_at, (language,country), phase |
| `content_stats` | counters, retention curve (1/3/5/10 s, q25–q100), velocities, freshness/momentum/viral, integrity | viral, momentum |
| `events` | raw event log (Kafka landing/replay buffer) | (user,created_at), content, type, session |
| `sessions` | session envelope + satisfaction | (user, started_at) |
| `user_content_exposure` | dedupe + frequency capping | `(user_id, content_id)` unique |
| `topic_exposure` | sliding-window topic fatigue state | `(user_id, topic)` unique |
| `feed_logs` | **the training table**: φ snapshot, predictions, labels, propensity | request_id, (user,content), (labeled, created_at) |
| `model_weights` | per-head weights, bias, calibration, metrics | head unique |
| `bandit_arms` | Beta posteriors per (user, arm) | `(user, arm_type, arm_key)` unique |
| `boost_campaigns` | budget, bid, targeting, pacing, quality | status, content |
| `ad_impressions` | auction outcomes, price, eCPM | campaign, (user, created_at) |
| `trust_ledger` | integrity detector firings with evidence | (entity_type, entity_id) |
| `pipeline_runs` | per-request stage timings and mixes | (user, created_at) |

### 21.1 Partitioning at scale

* `events`: hourly range partitions, 7-day hot retention, then Iceberg.
* `feed_logs`: hourly partitions, 30-day retention (training window).
* `content_stats`: hot rows in Redis; Cassandra is the durable store keyed by `content_id`.
* `user_interests`: co-located with `users` on the same shard key so the interest read is a single-shard query.

---

## 22. EVENT TRACKING SCHEMA

### 22.1 Envelope

```jsonc
{
  "event_id": "uuid",           // client-generated, dedupe key
  "user_id": "us_000123",
  "session_id": "se_9f2c",
  "request_id": "uuid",         // joins back to feed_logs → φ
  "content_id": "ct_00042",
  "creator_id": "cr_0007",
  "event_type": "watch_progress",
  "surface": "reels",
  "position": 7,
  "value": 1.0,
  "watch_ms": 8450,
  "duration_ms": 15000,
  "replays": 1,
  "dwell_ms": 8900,
  "client_ts": "2026-02-11T09:31:22.441Z",
  "context": {
    "device": "high", "network": "wifi", "app_version": "9.4.1",
    "headphones": true, "autoplay": true, "volume": 0.7,
    "scroll_velocity_px_s": 1830, "battery": 0.62
  }
}
```

### 22.2 Full event taxonomy and weights

| Event | `w_interest` | `w_reward` | `w_satisfaction` | Labels produced |
|---|---|---|---|---|
| impression | 0.01 | 0.00 | 0.00 | — |
| view_start | 0.04 | 0.05 | 0.02 | `p_view` |
| watch_progress | 0.10 | 0.35 | 0.20 | `watch_time`, `p_complete` |
| video_complete | 0.30 | 0.70 | 0.45 | `p_complete` |
| replay / rewatch | 0.42 / 0.46 | 0.85 / 0.90 | 0.55 / 0.60 | `p_rewatch` |
| like | 0.35 | 1.00 | 0.40 | `p_like` |
| love | 0.42 | 1.15 | 0.50 | `p_like` |
| share | 0.55 | 2.40 | 1.10 | `p_share` |
| dm_share | 0.60 | 2.80 | 1.25 | `p_share` |
| save | 0.58 | 2.10 | 1.30 | `p_save` |
| playlist_add | 0.60 | 2.20 | 1.30 | `p_save` |
| comment | 0.48 | 1.60 | 0.75 | `p_comment` |
| comment_like | 0.22 | 0.55 | 0.28 | `p_comment` |
| follow / subscribe | 0.72 / 0.75 | 3.20 / 3.40 | 1.60 / 1.70 | `p_follow` |
| profile_visit | 0.34 | 1.10 | 0.55 | `p_profile_visit` |
| post_expand | 0.20 | 0.45 | 0.25 | `p_expand` |
| audio_reuse | 0.66 | 2.60 | 1.15 | `p_share` |
| story_view / story_complete | 0.12 / 0.26 | 0.30 / 0.65 | 0.15 / 0.35 | `p_complete` |
| explore_click | 0.30 | 0.80 | 0.45 | `p_discovery` |
| search_click | 0.52 | 1.20 | 0.70 | `p_discovery` |
| hashtag_click | 0.34 | 0.70 | 0.35 | `p_discovery` |
| topic_expand | 0.44 | 0.95 | 0.60 | `p_discovery` |
| new_creator_engage | 0.40 | 1.30 | 0.80 | `p_follow` |
| skip | −0.10 | −0.35 | −0.15 | `p_skip` |
| fast_scroll | −0.16 | −0.55 | −0.25 | `p_skip` |
| swipe_away | −0.20 | −0.70 | −0.30 | `p_skip` |
| not_interested | −0.85 | −3.20 | −1.60 | `p_negative` |
| hide | −0.90 | −3.60 | −1.80 | `p_negative` |
| report | −1.00 | −6.00 | −3.00 | `p_negative`, `p_violating` |
| mute_creator | −0.60 | −3.00 | −1.50 | `p_negative` |
| unfollow | −0.70 | −3.40 | −1.70 | `p_negative` |
| block_creator | −1.00 | −5.00 | −2.50 | `p_negative` |
| session_exit | −0.12 | −1.40 | −0.90 | `p_session_extend` |
| survey_positive / negative | ±0.50 / −0.80 | ±2.00 / −2.60 | ±3.00 / −3.40 | `p_satisfaction` |

### 22.3 Watch-time reward shaping

```
R_watch(w, d) = ( log1p(w) / log1p(90) ) · ( 0.55 + 0.45·min(1, w/d) )
```

Sub-linear in absolute seconds so long-form cannot dominate short-form; multiplied by a completion term so a fully-watched 8-second clip beats a 12%-watched 60-second clip with the same absolute seconds.

### 22.4 Client-side quality rules

* Watch heartbeats every 250 ms, batched and flushed every 2 s or on item change.
* `event_id` is a client UUID; the collector dedupes on a 24 h Bloom filter.
* Clock skew: `client_ts` is corrected by `server_ts − received_ts` offset per session.
* Offline buffering: up to 500 events, 24 h TTL, replayed with original timestamps.

---

## 23. TRAINING PIPELINE

### 23.1 Offline (nightly, 6 h window)

```
1. Snapshot feed_logs[t−30d, t] joined with labels  (≈ 9·10^10 rows sampled to 4·10^9)
2. Negative downsampling: keep all positives, sample negatives at 1:12,
   correct the bias analytically:  logit_corrected = logit − log(12)
3. Stratified split: train [t−30d, t−2d], valid [t−2d, t−1d], test [t−1d, t]
   (temporal split only — random splits leak future information)
4. Train MMoE teacher (Ray, 64×A100, 4.5 h, bf16, ZeRO-2)
5. Distill to 15 linear students on the 56-d φ  (KL on logits, T = 2.0)
6. Calibrate per (surface × country-tier × device)
7. Evaluate: AUC, logloss, calibration ratio, NDCG@20, DR off-policy value
8. Gate: promote only if ΔAUC ≥ −0.1% on every head AND
         DR value ≥ incumbent AND no fairness regression
9. Publish to S3, flip etcd pointer, canary 1% → 5% → 25% → 100% over 6 h
```

### 23.2 Feature/label join correctness

The join is `feed_logs.(request_id, content_id) ⟕ events` with a 30-minute watermark. Impressions with no matching events after the watermark become **explicit negatives** — this is essential; treating them as missing produces a catastrophically over-optimistic model.

### 23.3 Counterfactual evaluation

Before any live test:

```
V̂_IPS = (1/n) Σ r_i · min(π_new(a_i|x_i)/π_log(a_i|x_i), 10)
V̂_DR  = (1/n) Σ [ ĝ(x_i,a_i) + (r_i − ĝ(x_i,a_i))·min(ratio, 10) ]
```

plus a replay simulation over 24 h of logged requests to estimate feed-composition shifts (source mix, topic entropy, creator Gini, ad load).

### 23.4 Experimentation

* Unit: user, hashed to 10,000 buckets, sticky for 90 days.
* Guardrails (auto-rollback): D1 retention, D7 retention, session length, report rate, creator Gini, ad-load, p99 latency.
* Minimum run: 14 days (retention needs 2 weekly cycles). Novelty effects are excluded by discarding days 1–2.
* Holdback: a permanent 0.5% population receives the previous quarter's model, to measure cumulative long-run drift.

---

## 24. REAL-TIME SERVING PIPELINE

```
┌──────────┐  40ms feed cache  ┌───────────────┐
│  Edge    │──────────────────►│ Orchestrator  │
└──────────┘                   └───┬───────────┘
                                   │ fan-out (25 ms deadline)
        ┌──────────┬───────────┬───┴────┬──────────┬───────────┐
        ▼          ▼           ▼        ▼          ▼           ▼
   follow-idx  topic-idx    ANN(HNSW) trend-KV  explore    coldstart-Q
        └──────────┴───────────┴───┬────┴──────────┴───────────┘
                                   ▼
                        dedupe + eligibility bitsets
                                   ▼
                    feature assembly (Redis multi-get, 1 RTT)
                                   ▼
                    ranker (ONNX, AVX-512, tiles of 256)
                                   ▼
              re-rank → MMR → freshness quota → slots → auction
                                   ▼
                     response  +  async Kafka logging
```

### 24.1 Degradation ladder

| Condition | Action |
|---|---|
| ANN pool times out | proceed without it (−0.3% watch time) |
| Trend KV unavailable | fall back to `content.publishedAt` ordering |
| Integrity service down | use last cached scores; if none, treat as `risk = 0.5` (conservative) |
| Ranker p99 > 60 ms | drop to top-400 candidates |
| Model registry unreachable | serve last-known-good weights from local disk |
| Total failure | serve the cached "safe feed": followed creators + top-quality evergreen |

### 24.2 Caching

* Feed cache: 40 s TTL, key `user|surface|cursorBucket`. Hit rate ~31%, saves 22% of ranker CPU.
* Feature cache: per-request memo of creator/content features (a creator often appears multiple times).
* Negative cache: eligibility failures cached for 10 min per `(user, content)`.

---

## 25. REINFORCEMENT LEARNING STRATEGY

### 25.1 Formulation

* **State** `s_t` = (interest graph summary, session context, fatigue vector, recent-item embeddings, time context)
* **Action** `a_t` = the ranked slate of 20 items (combinatorial → handled by slate decomposition)
* **Reward**

```
r_t = Σ_e w_R(e)·T(u)  +  1.35·R_watch  −  1.40·1[session_exit]
R_session = Σ_t γ^t r_t + Γ·1[returned within 24 h] + Γ₇·1[returned within 7 d]
γ = 0.92 (per item), Γ = 12.0, Γ₇ = 30.0
```

The terminal retention bonuses are what force the policy to trade immediate watch time for tomorrow's session.

### 25.2 Algorithm

Two-stage:

1. **Behaviour-cloned baseline** — the supervised master feed score is the behaviour policy.
2. **Slate-Q / SlateQ decomposition** — the Q-value of a slate is decomposed into per-item Q-values weighted by the user's choice model:

```
Q(s, A) = Σ_{i∈A} P(choose i | A, s) · [ r(s,i) + γ·V(s') ]
P(choose i | A, s) = softmax over item-level attraction (conditional logit)
```

3. **Conservative off-policy training** — CQL penalty on out-of-distribution actions:

```
L_CQL = α·( log Σ_a exp Q(s,a) − E_{a~π_log}[Q(s,a)] ) + L_TD ,  α = 5.0
```

4. **Deployment as a re-ranking residual**, not a replacement:

```
S_final = S_supervised · (1 + 0.22·tanh( Q_RL_normalised ))
```

The RL policy can move an item by at most ±22%. This bound is non-negotiable: an unbounded RL ranker is the fastest known route to a degenerate feed.

### 25.3 Long-horizon credit assignment

Retention is observed 1/7/30 days later. We use:

* **Reward shaping** with the potential function `Φ(s) = p_satisfaction(s)` (policy-invariant by Ng et al.), giving dense per-item signal without changing the optimal policy.
* **TD(λ)** with `λ = 0.85` over the session, bootstrapping to the next-session value estimated by the retention heads.

### 25.4 Safety

* Constrained MDP: `max E[R] s.t. E[reportRate] ≤ ε₁, E[negativeRate] ≤ ε₂, Gini ≤ 0.82`, solved with Lagrangian duals updated nightly.
* The RL residual is disabled for users with `< 40` interactions and for all minor accounts.

---

## 26. SCALING STRATEGY

### 26.1 Targets and sizing

| Metric | Target | Implication |
|---|---|---|
| MAU | 100 M+ | 8 M DAU-peak concurrent-ish |
| Feed QPS | 250 k peak | 1,700 ranker pods @ 150 QPS each |
| Impressions/day | 1 B+ | 12 k events/s baseline, 45 k peak |
| Candidates scored/s | 1.75×10^8 | 56-d dot products, AVX-512, ~9 GFLOP/s per core |
| p99 ranking latency | < 100 ms | see §1.4 |
| Event lag (e2e) | < 1 s p99 | Flink with 2 s checkpoint interval |

### 26.2 Sharding

* **Users**: consistent-hash on `user_id`, 4,096 virtual shards. Interest graph, exposure bloom, session state co-located.
* **Content**: consistent-hash on `content_id` for stats; ANN index sharded by `(topic-vertical × language-family)` into 64 shards, each replicated 3×.
* **Retrieval fan-out**: a feed request touches at most 6 ANN shards (the user's top verticals), not all 64.

### 26.3 Hot-key handling

Viral content becomes a hot key in `content_stats`. Mitigation: per-node local counters with 200 ms flush + probabilistic counting (HyperLogLog for unique viewers, Count-Min for velocity). Exact counts are reconciled hourly from the event lake.

### 26.4 Cost control

* 40 s feed cache: −22% ranker CPU.
* Distilled linear students: −38× vs teacher inference.
* Candidate budget adaptive to load: under overload, budgets scale to 60% (measured cost: −0.7% watch time, vs −4% for latency-induced abandonment).
* Embedding quantisation: int8 with per-vector scale, −4× memory, −0.3% recall.

### 26.5 Multi-region

Three ranking regions (US-EAST, EU-WEST, AP-SOUTH). User state is homed to the nearest region with async cross-region replication (last-writer-wins on interest rows, CRDT counters for exposure). Content and model artifacts are globally replicated. A region failure fails over in < 90 s with a cold interest graph rebuilt from the event lake (degraded for ~10 min).

---

## 27. DETAILED PSEUDOCODE

### 27.1 Feed generation

```python
def generate_feed(user_id, surface, page_size=20, session=None):
    t0 = now()

    # ---- Stage 0: hydrate ------------------------------------------------
    u          = feature_store.user(user_id)                # 5 ms
    interests  = decay_all(feature_store.interests(user_id), now())
    aff        = feature_store.creator_affinity(user_id)
    exposure   = feature_store.exposure_bloom(user_id)
    ctx        = build_context(session, u, now())
    bank       = model_registry.current()                   # cached 30 s

    drift      = interest_drift(interests)
    latent     = discover_latent(interests)                 # graph diffusion
    eps        = exploration_budget(drift, ctx.fatigue, u.novelty_appetite,
                                    u.interaction_count, fairness_boost())

    # ---- Stage 1: candidate generation (parallel, 25 ms deadline) --------
    topics     = retrieval_topic_set(interests, k=12)
    arms       = bandit.arms(user_id, "topic")
    explore_t  = thompson_select(arms, k=6)

    pools = parallel({
      "following":         follow_index.recent(aff.following, max_age=14*24),
      "interest_match":    topic_index.by_quality(topics[:10], u.language),
      "similar_users":     cf_index.neighbors_positives(u.embedding, k=200),
      "similar_content":   ann.query(recent_positive_embeddings(u), k=160),
      "trending_global":   trend_kv.top("global", band=">=rising", max_age=96),
      "trending_regional": trend_kv.top(u.region + neighbors(u.region), 168),
      "creator_expansion": creator_graph.similar_unfollowed(aff.following),
      "exploration":       topic_index.random(explore_t + latent),
      "cold_start_seed":   coldstart_queue.eligible(u, cap=0.12*page_size),
    }, deadline_ms=25)

    cands = dedupe_by_id(pools)                 # ~1200

    # ---- Stage 2 + 3: filters -------------------------------------------
    cands = [c for c in cands if eligible(c, u, aff, exposure)]
    cands = [c for c in cands if passes_quality(c, topic_baseline(c.topic))]

    # ---- Stages 4-6: one trunk pass, 15 heads ---------------------------
    scored = []
    for tile in tiles(cands, 256):
        PHI  = [build_phi(u, c, ctx, interests, aff, exposure) for c in tile]
        PRED = bank.predict_all(PHI)            # SIMD, all heads
        for c, phi, p in zip(tile, PHI, PRED):
            bonus = eps * (0.55/sqrt(1+pulls(c.topic))
                           + 0.25*(c.phase <= 2) + 0.20*c.creator_is_new) * jitter()
            s = master_feed_score(p, c, ctx, bonus)
            scored.append(Scored(c, phi, p, s, bonus))

    # ---- Stage 7: re-rank ------------------------------------------------
    scored.sort(key=lambda s: -s.score.final)
    shortlist = scored[:240]

    # ---- Stage 8: diversity ---------------------------------------------
    picked = mmr(shortlist, limit=60, lam=0.78, constraints=SLOT_RULES)

    # ---- Stage 9: freshness quota ---------------------------------------
    balanced = []
    buckets  = defaultdict(int)
    while picked and len(balanced) < 40:
        best = argmax(picked, key=lambda s:
                      s.score.final * freshness_quota(bucket(s.age), buckets, len(balanced)))
        picked.remove(best); buckets[bucket(best.age)] += 1; balanced.append(best)

    # ---- Stage 10: slots + auction --------------------------------------
    alloc = slot_allocation(u.satisfaction, ctx.mean_fatigue, ctx.session_depth,
                            u.days_since_signup, following_supply_ratio(balanced),
                            page_size)
    feed  = balanced[:page_size]
    for pos in ad_slots(page_size, alloc.sponsored):
        winner = run_auction(eligible_ads(u, ctx),
                             reserve=organic_opportunity_cost(feed[0].score.final))
        if winner: feed.insert(pos, as_item(winner))
    feed = feed[:page_size]

    # ---- logging (async) -------------------------------------------------
    kafka.emit("feed_logs", [log_row(r, f, propensity(i)) for i, f in enumerate(feed)])
    kafka.emit("exposure",  [(user_id, f.content_id) for f in feed])

    return feed, telemetry(t0)
```

### 27.2 Event ingestion

```python
def ingest(batch):
    u = user_store.get(batch.user_id)

    # 1. interest graph
    for e in batch:
        c = content_store.get(e.content_id)
        s = interest_signal(e.type, u.trust, e.watch_ms/1000/c.duration)
        row = interest_store.get(u.id, c.topic) or new_row(c.topic)
        row = update_interest(row, s, now(), session_intensity(u))
        interest_store.put(row)
        creator_affinity.bump(u.id, c.creator_id, e)

    # 2. fatigue windows
    for topic, (imps, engs) in group_by_topic(batch):
        topic_exposure.decay_and_add(u.id, topic, imps, engs, decay=0.85)

    # 3. content counters + dynamics
    for cid, evs in group_by_content(batch):
        st  = stats_store.get(cid)
        st  = apply_increments(st, evs)
        dt  = hours_since(st.updated_at)
        st.v_views  = ewma_timed(st.v_views,  count(evs,'view')/dt,  dt, 1.5)
        ...
        st.freshness = freshness_score(st, content.topic)
        mom          = momentum_score(st, cohort_baseline(content.topic))
        st.momentum  = mom.score
        st.viral     = viral_potential(st, integrity_of(cid))
        stats_store.put(st)

        # 4. cold-start ladder (compare-and-swap)
        if content.phase < 6:
            d = evaluate_cold_start(st, topic_baseline, creator_multiplier,
                                    viral_multiplier=st.viral.multiplier)
            if d.decision in ("promote", "accelerate"):
                content_store.cas_phase(cid, content.phase, d.next_phase, d.next_cap)
            elif d.decision == "freeze":
                content_store.freeze(cid, st.impressions)

    # 5. bandit posteriors (satisfaction-weighted reward)
    for topic, evs in group_by_topic(batch):
        r = clip(mean(w_satisfaction(e)/3 for e in evs) + 0.4*watch_reward(evs), 0, 1)
        bandit.update(u.id, "topic", topic, r)

    # 6. label join + streaming SGD
    for log in feed_logs.by_request(batch.request_ids):
        evs = [e for e in batch if e.content_id == log.content_id]
        if not evs: continue
        y   = labels_from(evs, log.duration)
        for head in HEADS:
            if head in y:
                bank[head] = sgd_step(bank[head], log.features, y[head],
                                      trust=u.trust, propensity=log.propensity)
        feed_logs.mark_labeled(log.id, y)
    model_registry.stage(bank)      # promoted after the validation gate

    # 7. user aggregates + embedding refresh
    refresh_user_state(u.id)
```

### 27.3 Cold-start evaluation

```python
def evaluate_cold_start(obs, base, m_creator, m_viral):
    k = clamp(obs.phase - 1, 0, 4)
    watch      = obs.watch_time / (obs.views * obs.duration)
    completion = obs.completions / obs.views
    e_norm     = 3*obs.shares/obs.views + 2.2*obs.saves/obs.views \
               + 1.4*obs.likes/obs.views + 2.6*obs.follows/obs.views
    neg        = obs.negatives / obs.impressions

    gates = {
      "volume":     obs.impressions >= PHASE_CAPS[k],
      "watch":      watch      >= base.watch      * THETA_W[k],
      "completion": completion >= base.completion * THETA_C[k],
      "engagement": e_norm     >= base.engagement * THETA_E[k],
      "negative":   neg        <= base.negative   * THETA_N[k],
      "integrity":  obs.spam < .35 and obs.bot < .35 and obs.violation < .20,
      "confidence": wilson_lower(weighted_successes(obs), obs.impressions) >= FLOOR[k],
    }

    if neg > 3*base.negative and obs.impressions > 30: return FREEZE("negative_breach")
    if gates["volume"] and phase_score(obs, base) < 0.55: return FREEZE("below_floor")
    if not gates["integrity"]: return FREEZE("integrity")
    if not all(gates.values()): return HOLD

    accelerate = phase_score(obs, base) >= 1.45 and confidence >= 1.6*FLOOR[k]
    nxt = min(6, obs.phase + (2 if accelerate else 1))
    return PROMOTE(nxt, PHASE_CAPS[nxt-1] * m_creator * m_viral)
```

---

## 28. PRODUCTION DEPLOYMENT BLUEPRINT

### 28.1 Environments

`dev → staging (5% mirrored shadow traffic) → canary (1%) → prod`.
Shadow traffic is **scored but not served**, and its outputs are diffed against production for distributional drift (topic mix, source mix, score histograms, PSI per feature).

### 28.2 Rollout procedure for a ranking change

```
D0   offline eval: AUC/logloss/calibration per head + DR off-policy value
D0   replay simulation: 24 h of logged requests → composition deltas
D1   shadow at 5% for 24 h: latency, PSI, score distribution
D2   canary 1% for 48 h: guardrails only (no ship decision)
D4   A/B 5% for 14 d: primary = D7 retention; secondary = watch time, satisfaction
D18  ramp 25% → 50% → 100% over 72 h with automated rollback on guardrail breach
D25  post-launch: 0.5% permanent holdback continues measuring cumulative effect
```

### 28.3 Guardrail metrics (auto-rollback thresholds)

| Metric | Threshold |
|---|---|
| D1 retention | −0.30% |
| D7 retention | −0.20% |
| Report rate | +5% |
| Hide / not-interested rate | +8% |
| Creator Gini (top-10k) | +0.02 |
| Ad load (p95 window) | > 0.16 |
| p99 feed latency | > 120 ms |
| Calibration ratio (any head) | outside [0.90, 1.10] |
| Topic entropy of served feeds | −6% |

### 28.4 Observability

* **RED** per service (rate, errors, duration) + per-stage timing histograms (`pipeline_runs.stage_ms`).
* **Model dashboards**: per-head AUC/logloss/calibration on a rolling 1 h holdout, PSI per feature, weight-norm drift.
* **Ecosystem dashboards**: creator Gini, share of impressions to `tier=new/emerging`, cold-start graduation rate by phase, median time-to-500-impressions for a new creator.
* **Integrity dashboards**: spam/bot score distributions, enforcement action counts, appeal reversal rate (a high reversal rate means the detectors are miscalibrated).

### 28.5 Runbooks

| Symptom | First action |
|---|---|
| Watch time up, D7 down | suspect a `β/γ` imbalance — verify calibration of `p_satisfaction`; roll back if drifted |
| Topic entropy collapse | check MMR `λ` config and the diversity constraint hit-rate; likely a candidate-pool starvation |
| Cold-start graduation rate < 3% | topic baselines stale or too high — re-run the baseline job |
| Creator Gini spike | fairness controller stuck; verify `emergingCreatorBoost` is being applied |
| Latency p99 spike | check ANN shard health; enable the reduced candidate budget flag |
| Sudden viral-band flood | integrity discounting failure — check `trustWeightedShare` computation |

### 28.6 Capacity plan (steady state, 250k feed QPS)

| Component | Pods / nodes | Instance |
|---|---|---|
| feed-orchestrator | 1,700 | 16 vCPU / 32 GB |
| ranker (ONNX) | 900 | 32 vCPU AVX-512 / 64 GB |
| retrieval-ann | 192 (64 shards × 3) | 32 vCPU / 256 GB (int8 vectors) |
| retrieval-index | 240 | 16 vCPU / 128 GB NVMe |
| trend-service + Redis | 300 | r6g.4xlarge |
| feature-store Redis | 600 | r6g.8xlarge |
| Kafka | 240 brokers | i3en.6xlarge |
| Flink | 1,200 task slots | 8 vCPU / 32 GB |
| Training | 64× A100 (nightly), 8× A100 (online) | p4d |

### 28.7 Compliance & user control

* **Why am I seeing this** — surfaced from `feed_logs.predictions` + top feature contributions (the same `explainFeatures` output the debug API returns).
* **Not interested / Mute / Block** — applied within one request (write-through to the interest graph and the affinity row).
* **Interest management** — users can view and delete rows from their own interest graph; deletion writes `affinity = 0, kind = 'suppressed'` and adds the topic to a per-user suppression list honoured at Stage 2.
* **Data retention** — raw events 2 y, feature snapshots 30 d, model artifacts 1 y. Right-to-erasure removes the user row, interest graph, affinity rows and pseudonymises the event lake within 30 days.
* **Minor safety** — under-18 accounts: no ads before day 14, exploration capped at 0.25, `p_negative` penalty weight ×1.5, restricted-content classes hard-blocked at Stage 2.
