# ATLAS-RANK — Production Specification
## Part II — Prediction Models, Ranking Pipeline, Feed Score, Virality, Cold Start, Freshness, Trends, Exploration, Geo

---

## 8. PREDICTION MODELS

### 8.1 Multi-task architecture

```
φ(u,c,ctx) ∈ R^56
      │
      ├─► Shared bottom: 8 experts × MLP(256 → 256), ReLU, LayerNorm
      │
      ├─► Per-task gate: g_k = softmax(W_g^k · φ)        (MMoE)
      │   h_k = Σ_e g_k[e] · expert_e(φ)
      │
      └─► 15 task towers: MLP(256 → 128 → 1) + task-specific link
```

Rationale for MMoE over shared-bottom: the 15 objectives have **conflicting gradients** (e.g. `p_share` rewards outrage-adjacent content while `p_satisfaction` punishes it). Gates let each task select its own expert mixture, which in offline evaluation recovered +2.4% AUC on `p_satisfaction` versus a shared bottom without hurting `p_like`.

### 8.2 Head inventory

| # | Head | Link | Label source | Prior AUC |
|---|---|---|---|---|
| 1 | `p_like` | sigmoid | like ∪ love within 30 min | 0.842 |
| 2 | `p_comment` | sigmoid | comment | 0.871 |
| 3 | `p_share` | sigmoid | share ∪ dm_share | 0.887 |
| 4 | `p_save` | sigmoid | save ∪ playlist_add | 0.879 |
| 5 | `p_follow` | sigmoid | follow ∪ subscribe | 0.913 |
| 6 | `p_profile_visit` | sigmoid | profile_visit | 0.834 |
| 7 | `watch_time` | softplus-ratio × duration | Σ watch_ms | RMSE 3.1 s |
| 8 | `p_complete` | sigmoid | watch ≥ 95% duration | 0.808 |
| 9 | `p_rewatch` | sigmoid | replays ≥ 1 | 0.861 |
| 10 | `p_session_extend` | sigmoid | ≥ 1 more item in session | 0.795 |
| 11 | `p_satisfaction` | sigmoid | survey ∪ pseudo-label | 0.783 |
| 12 | `p_return_tomorrow` | sigmoid | session in [24h, 48h) | 0.741 |
| 13 | `p_retention_7d` | sigmoid | ≥ 1 session in 7 d | 0.762 |
| 14 | `p_negative` | sigmoid | hide ∪ not_interested ∪ report ∪ mute | 0.902 |
| 15 | `p_viral` | sigmoid | reaches viral band within 48 h | 0.826 |

### 8.3 Head equations (served, distilled linear students)

All binary heads:

```
z_k    = w_kᵀφ + b_k
p_raw  = σ(z_k)
p_k    = σ( a_k · logit(p_raw) + β_k )        ← Platt calibration
```

Watch-time head:

```
z_w    = w_wᵀφ + b_w
ratio  = 1.6 · softplus(z_w) / (1 + softplus(z_w))       ∈ [0, 1.6]
Ŵ_sec  = clip( ratio · duration , 0 , 1.8·duration )
```

The `1.6` ceiling and `1.8·duration` clip allow **overwatch** (rewatch loops) to be predicted, which is essential for short-form: a 7-second loop watched 2.3× is the highest-value outcome on the surface.

Retention heads use a discrete-time hazard formulation:

```
h(d)          = σ( β₀ + β₁·S + β₂·log1p(sessions_7d) + β₃·watchMin_7d/60
                   − β₄·negRate − β₅·log1p(daysSinceLast) )
P(return ≤ D) = 1 − Π_{d=1..D} (1 − h(d)·0.965^{d−1})
```

Satisfaction pseudo-label (used when no survey exists, ~99.7% of sessions):

```
Ŝ = σ( 1.7·watchRatio + 1.4·completionRate + 2.6·deepEngagementRate
      + 0.8·log1p(sessionLengthRatio) + 0.7·diversityEntropy
      − 3.1·negativeRate − 1.2·skipRate − 0.5·log1p(returnGap/24) − 1.1 )

S = 0.65·survey + 0.35·Ŝ    when a survey exists
```

Viral head (§11) is trained as a **forward-looking** classifier: label = 1 if the item reaches `VP ≥ 0.72` within 48 h of the impression.

### 8.4 Losses

| Head type | Loss |
|---|---|
| binary | trust-weighted logloss + IPS correction: `L = Σ (T_u / √π_i) · BCE(p_i, y_i)` |
| watch-time | Huber(δ=0.35) on the ratio + Tweedie(p=1.4) auxiliary on seconds |
| retention | per-day BCE over the hazard sequence |
| viral | focal loss (γ=2, α=0.25) — extreme class imbalance (~1:4,000) |

Total: `L = Σ_k λ_k L_k + λ_reg‖θ‖²`, with `λ_k` re-tuned monthly by GradNorm to keep per-task gradient magnitudes balanced.

### 8.5 Calibration

Every head is recalibrated per `(surface × country-tier × device-class)` every 15 minutes on the last 2 M labelled impressions. Calibration drift (`E[p] / E[y] ∉ [0.93, 1.07]`) is a **paging alert** — miscalibration silently destroys the multi-objective trade-off because the `β` coefficients assume comparable probability scales.

---

## 9. RANKING PIPELINE — TEN STAGES IN DETAIL

### STAGE 1 — Candidate Generation

Nine parallel sources, each with an independent budget and its own index:

| # | Source | Budget | Index | Query |
|---|---|---|---|---|
| 1 | **Following Feed** | 220 | follow-graph → creator→content inverted list | posts from followed creators, ≤ 14 d, unseen |
| 2 | **Interest Matching** | 320 | topic inverted list + ANN | top-10 topics from `retrievalTopicSet()`, quality-ordered |
| 3 | **Similar Users (CF)** | 160 | user-user ANN over `e_u` → their recent positives | items liked by the 200 nearest users |
| 4 | **Similar Content (i2i)** | 160 | content-content ANN over `e_c` | neighbours of the user's last 20 positive items |
| 5 | **Trending Global** | 120 | trend KV sorted set by `viralScore` | ≤ 96 h, viral band ≥ rising |
| 6 | **Trending Regional** | 140 | trend KV partitioned by region | user region + neighbouring regions, ≤ 168 h |
| 7 | **Creator Expansion** | 100 | creator-creator similarity graph | unfollowed creators similar to followed ones |
| 8 | **Exploration Pool** | 120 | Thompson-sampled topic arms + latent topics | randomised ordering |
| 9 | **Cold-Start Seed** | 80 | phase-1/2 queue filtered by seed-cohort eligibility | ≤ 48 h, capped at 12% of the page |

Deduplication is by `content_id`; the **first** source to produce an item owns attribution, but all contributing sources are recorded for source-mix telemetry and for the multi-source prior (`items retrieved by ≥ 3 sources receive a +0.04 logit prior`).

Retrieval is issued as one fan-out with a 25 ms hard deadline; slow pools are dropped and the funnel proceeds (graceful degradation — a missing trending pool costs ~0.3% watch time, a 200 ms feed costs 4%).

### STAGE 2 — Eligibility Filtering (hard, non-negotiable)

```
DROP if creator == viewer                        (self content)
DROP if !isEligible or status != 'live'
DROP if !isRecommendable and creator not followed
DROP if creator ∈ user.blocked ∪ user.muted
DROP if safetyLabel ∈ {violating, restricted}
DROP if creator.violationRisk > 0.85
DROP if exposure(u,c).impressions ≥ 3           (frequency cap)
DROP if hoursSince(exposure(u,c).lastSeen) < 6  (recency dedupe)
DROP if stats.impressions ≥ content.coldStartCap and phase < 6
DROP if age > surface maxAge (reels 30 d, following 14 d)
DROP if legal/geo-block list matches user's jurisdiction
DROP if minor-safety policy blocks (age-gating, DM-shareability)
```

Implementation: a bitmap-and over precomputed eligibility bitsets plus a Bloom filter for the exposure check (14-day window, 0.1% FP rate, 12 MB per 10 k active users).

### STAGE 3 — Quality Filtering

```
verdict = enforcement(spamProb, botProb, violationRisk)
DROP if verdict ∈ {remove, review}
DROP if negativeRate > 4·ν_topic  and impressions > 500
DROP if qualityScore < 0.14
DROP if duplicateOf != null
DROP if creator.spamRisk > 0.75
DEMOTE (×0.55) if verdict == demote
LIMIT  (×0.20) if verdict == limit
```

Enforcement ladder:

| risk = max(spam, 0.8·bot, violation) | action | multiplier |
|---|---|---|
| violation > 0.85 | remove | 0 |
| risk > 0.80 | review (human queue) | 0.05 |
| risk > 0.60 | limit | 0.20 |
| risk > 0.40 | demote | 0.55 |
| else | allow | 1.00 |

### STAGE 4 — Engagement Prediction

One trunk pass yields `p_like, p_comment, p_share, p_save, p_follow, p_profile_visit`. Batched in tiles of 256 candidates; SIMD/AVX-512 dot products over the 56-d vector; the entire 700-candidate × 6-head evaluation is ~1.2 M FLOPs, sub-millisecond.

### STAGE 5 — Watch-Time Prediction

`watch_time`, `p_complete`, `p_rewatch` from the same trunk. Duration-aware: the head predicts a **ratio**, then multiplies by duration, which makes it robust to the duration distribution shifting between surfaces.

Also computed here: `completionVelocity = p_complete / duration` (used by the diversity stage to avoid stacking three 60-second items in a row for a user with a 12-second median dwell).

### STAGE 6 — Satisfaction Prediction

`p_session_extend`, `p_satisfaction`, `p_return_tomorrow`, `p_retention_7d`, `p_negative`, `p_viral`. These are the **long-horizon** heads and they carry the largest weights in `U_long`. This is the stage that separates ATLAS-RANK from an engagement-maximiser.

### STAGE 7 — Re-Ranking (Master Feed Score)

See §10. Produces the shortlist of ~240 items sorted by `S(u,c)`.

### STAGE 8 — Diversity Injection

MMR with a similarity kernel over `e_c`:

```
MMR(c) = λ · Ŝ(c)/Ŝ_max − (1−λ) · max_{c'∈Selected(last 8)} cos(e_c, e_c')
λ = 0.78
```

Hard slot constraints enforced during greedy selection:

* ≤ 2 items per creator per 20-slot window
* ≤ 4 items per topic per 10-slot window
* ≥ 3 distinct verticals in the first 10 slots
* no two Phase-1 cold-start items adjacent
* slot 1 must satisfy `p_negative < 0.06` (first-impression protection)

Tuning evidence: `λ < 0.72` → −2.1% watch time; `λ > 0.85` → −1.4% D7 retention. 0.78 is the joint optimum.

### STAGE 9 — Freshness Balancing

Temporal portfolio per 20-slot page:

| Bucket | Target share |
|---|---|
| < 6 h | 22% |
| 6–48 h | 34% |
| 2–14 d | 30% |
| > 14 d | 14% |

Soft quota: a candidate in an over-filled bucket is multiplied by `q = (target/actual)^0.6`, recomputed after every pick. Soft (not hard) because a genuinely exceptional item should be able to break the quota.

### STAGE 10 — Final Feed Generation

```
newUserDamp      = 1 − 2^(−daysSinceSignup/7)
depthDamp        = clip(1 + 0.03·max(0, depth − 10), 1, 1.4)
sponsoredShare   = clip( 0.10·(1 − 0.5·fatigue̅)·(0.6 + 0.4·satisfaction)
                         ·depthDamp·newUserDamp , 0 , 0.16 )
organicShare     = clip( 0.70 · followingSupplyRatio , 0.35 , 0.80 )
recommendedShare = 1 − sponsoredShare − organicShare
```

Ad positions: never slot 1; minimum gap of 5 organic items; positions `max(3, gap−1), +gap, +2·gap …`.

Then the ad auction (§17) runs per sponsored slot, competing against the organic opportunity cost.

---

## 10. MASTER FEED SCORE

### 10.1 Short-term utility

```
Ŵ_norm  = log1p(Ŵ_sec) / log1p(90)

U_short = 1.00·Ŵ_norm
        + 0.62·p_complete
        + 0.55·p_rewatch
        + 0.30·p_like
        + 0.48·p_comment
        + 0.85·p_share
        + 0.72·p_save
        + 1.10·p_follow
        + 0.34·p_profile_visit
```

Coefficients are in **like-equivalents**, obtained by regressing each action against 7-day retention on a 90-day holdout and normalising `β_like = 0.30`. A follow is worth ~3.7 likes; a share ~2.8; a save ~2.4. This ordering — *deep actions ≫ cheap actions* — is the entire reason the system does not devolve into clickbait.

### 10.2 Long-term utility

```
U_long = 0.55·p_session_extend
       + 1.45·p_satisfaction
       + 1.25·p_return_tomorrow
       + 0.95·p_retention_7d
       + 0.45·Q_content
       + 0.40·T_creator
```

`ω_l = 1.15 > ω_s = 1.00`: the long-horizon block is weighted **above** the short-horizon block. That single inequality is the philosophical core of the design.

### 10.3 Ecosystem utility

```
U_eco = 0.30·Freshness + 0.25·Momentum + 0.28·ViralPotential
      + 0.22·Novelty   + 0.18·Serendipity + 0.20·EmergingCreatorLift
```

### 10.4 Penalties

```
P = 2.60·p_negative
  + 3.20·SpamProb
  + 2.40·BotProb
  + 0.90·(1 − Q)·1[Q < 0.35]
  + 1.30·log1p(priorImpressions)/log1p(4)
```

### 10.5 Composition

```
B = 1.00·U_short + 1.15·U_long + 0.55·U_eco − P

Λ_locale   = LM^1.35 · (0.55 + 0.30·CM + 0.15·RM)
Φ_fatigue  = (1 − TopicFatigue)^1.45 · (1 − CreatorFatigue)^1.20
T_trust    = (1 − SpamProb)^1.6 · (0.35 + 0.65·T_creator) · IntegrityScore
G          = Λ_locale · Φ_fatigue · T_trust

S(u,c) = softplus(B) · G · (1 + ExplorationBonus)
```

`softplus` keeps the base strictly positive, which is required for the multiplicative gates to behave monotonically (with a raw negative base, a *smaller* gate would perversely produce a *larger* score).

### 10.6 Why multiplicative gates

An additive penalty can always be outbid. A user who does not speak the language, or a post from a spam farm, must be **vetoed** regardless of predicted engagement. Language mismatch (`LM = 0.08`) collapses the score by `0.08^1.35 ≈ 0.036` — a 96% reduction that no engagement prediction can recover.

---

## 11. VIRAL DETECTION LOGIC

Virality is *not* "many views". It is **unusually efficient propagation per impression, accelerating, crossing audience boundaries.**

```
completionRate = q100 / views
rewatchRate    = rewatches / views
watchRatio     = watchTime / (views · duration)

G_w = σ(2.1·z(watchRatio))          watch-time growth
G_c = σ(2.4·z(completionRate))      completion growth
G_r = σ(3.0·(rewatchRate − 0.06)/0.10)   rewatch growth
G_s = σ(2.6·z(shares/views))        share growth
G_v = σ(2.2·z(saves/views))         save growth
G_m = σ(1.8·z(comments/views))      comment growth
A   = σ(3.0·a)                      acceleration, a = (v_t − v_{t−1})/(|v_{t−1}|+1)
M   = MomentumScore                 §14
X   = regionsReached / totalRegions regional expansion

Integrity = (1 − spamProb)·(1 − botProb)·max(0, 1 − 3·negativeRate)
earlyDamp = 1 − 2^(−impressions/200)

core = 0.20·G_s + 0.16·G_w + 0.14·G_c + 0.12·G_v
     + 0.10·G_r + 0.08·G_m + 0.10·A + 0.10·M

VP(c) = core · (0.65 + 0.35·X) · Integrity · earlyDamp
```

All `z(·)` are computed against the **(topic × cold-start-phase × duration-bucket) cohort**, never globally — otherwise `comedy` would occupy every viral slot and `education` would never be detected as viral.

### 11.1 Escalation bands

| VP | Band | Distribution multiplier | Additional action |
|---|---|---|---|
| < 0.35 | normal | ×1.0 | — |
| 0.35–0.55 | rising | ×1.2 | unlock next cold-start phase early |
| 0.55–0.72 | hot | ×2.2 | cross-region unlock; trend-service promotion |
| 0.72–0.86 | viral | ×4.0 | global pool; auto-enqueue for integrity re-scan |
| ≥ 0.86 | mega | ×6.0 | **mandatory** integrity re-scan + policy review before global fanout |

`earlyDamp` is what prevents a 3-impression post with a 100% share rate from detonating the trend engine.

### 11.2 Anti-manipulation

Counters feeding `VP` are **trust-discounted before** the computation:

```
effectiveCount = rawCount · (1 − spamProb)^1.3 · trustWeightedShare
```

A viral band promotion requires `podOverlap < 0.35` and `geoEntropy > 0.30` — coordinated networks fail both.

---

## 12. COLD START LOGIC

### 12.1 Content ladder

| Phase | Impression cap | Cohort |
|---|---|---|
| 1 | 50 | stratified seed cohort |
| 2 | 500 | micro validation |
| 3 | 5,000 | topic-cohort validation |
| 4 | 50,000 | regional expansion |
| 5 | 500,000 | national / cross-region |
| 6 | unlimited | global pool |

Effective cap = `PHASE_CAP[k] × M_creator × M_viral`.

### 12.2 Seed cohort composition (Phase 1)

| Share | Cohort | Purpose |
|---|---|---|
| 55% | high topic affinity | low-variance quality estimate |
| 20% | creator's own followers | baseline expectation |
| 15% | calibrators (high-volume, high-trust, historically predictive users) | early signal with the best signal-to-noise |
| 10% | out-of-topic | measures crossover potential |

Constraint: **≤ 12% of any user's page** may be Phase-1 content, so exploration never wrecks a session.

### 12.3 Promotion gates (all must pass)

```
G1 Volume      impressions ≥ N_k
G2 Retention   watchRatio  ≥ μ_topic · θ_w[k],  θ_w = [0.80, 0.88, 0.94, 1.00, 1.06]
G3 Completion  completion  ≥ μ_topic · θ_c[k],  θ_c = [0.75, 0.85, 0.92, 1.00, 1.05]
G4 Engagement  E_norm      ≥ μ_topic · θ_e[k],  θ_e = [0.70, 0.85, 0.95, 1.05, 1.10]
G5 Negative    negRate     ≤ ν_topic · θ_n[k],  θ_n = [2.00, 1.60, 1.30, 1.10, 1.00]
G6 Integrity   spam < 0.35 ∧ bot < 0.35 ∧ violation < 0.20
G7 Confidence  WilsonLower95(weightedSuccesses, impressions) ≥ floor[k],
               floor = [0.18, 0.28, 0.36, 0.44, 0.52]

E_norm = 3·shareRate + 2.2·saveRate + 1.4·likeRate + 2.6·followRate
```

The thresholds **tighten** with each phase (θ_w goes 0.80 → 1.06): a post must merely be "not bad" to reach 500 people, but must beat the cohort average to reach 500,000.

### 12.4 Phase score and acceleration

```
score = 0.32·(watchRatio/μ_w)·0.5 + 0.28·(completion/μ_c)·0.5
      + 0.30·(E_norm/μ_e)·0.5 + 0.10

accelerate ⟺ score ≥ 1.45 ∧ confidenceLower ≥ 1.6·floor[k]   → skip one phase
```

This is the breakout path: `1 → 3 → 5 → 6` in three evaluation cycles, i.e. a genuinely exceptional post can reach millions within hours.

### 12.5 Demotion / freeze

```
freeze if negRate > 3·ν_topic  and impressions > 30           (harm control)
freeze if impressions ≥ N_k and score < 0.55                  (cohort floor)
freeze if integrity gate fails                                 (safety)
```

Frozen posts keep their Following-feed distribution (owed to the creator's audience) but exit all recommendation surfaces.

### 12.6 User cold start

```
ε(n)          = 0.20 + 0.25·2^(−n/12)                exploration budget
confidence(n) = 1 − 2^(−n/15)                        personal-model confidence
A_eff(u,t)    = confidence·A_personal + (1 − confidence)·P(t | country, lang, ageBand)
```

Probe list: 12 items spanning 12 distinct verticals, selected to maximise expected information gain

```
argmax_S  H(prior) − E[ H(posterior | S) ]
```

approximated greedily by picking the item that maximally splits the current posterior over the latent taste vector. Switch fully to the personal model when `confidence > 0.6` (~n = 20 interactions).

### 12.7 Creator cold start

```
T₀ = 0.45 + 0.15·verified + 0.10·phoneVerified − 0.20·registrationBurstScore
M_c starts at 0.85
New-creator guarantee: first 5 posts receive ≥ Phase-2 (500) allocation
                       unless any integrity flag fires
```

---

## 13. FRESHNESS ENGINE

```
H_recency(t)   = max(3 h, 0.28·H_lifecycle(t))

R = 2^(−age / H_recency)                                   recency
V = tanh( vViews / (μ_v + σ_v) )                           velocity
E = tanh( (3·vShares + 2·vSaves + vComments) / 6 )         recent engagement
L = 1 − 2^(−age / H_lifecycle)                             lifecycle position

Freshness F(c) = 0.42·R + 0.26·V + 0.20·E + 0.12·(1 − L)
```

Topic-adaptive half-lives are the key: `news` decays with `H_recency = 5 h`, `diy` with `H_recency = 41 h`. A single global recency prior is the most common cause of "evergreen content is dead" in naive systems.

---

## 14. TREND / MOMENTUM ENGINE

Per-item momentum:

```
v = max(ε, vViews)
z_view  = z(vViews, μ_v, σ_v)
z_watch = z(vWatch/(v·duration), μ_wr, σ_wr)
z_share = z(vShares/v, μ_sh, σ_sh)
z_save  = z(vSaves/v,  μ_sa, σ_sa)
z_cmt   = z(vComments/v, 0.020, 0.030)
z_fol   = z(vFollows/v,  0.004, 0.008)
a       = (vViews − vViews_prev)/(|vViews_prev| + 1)

M_raw = 0.24·z_view + 0.22·z_watch + 0.20·z_share
      + 0.14·z_save + 0.10·z_cmt  + 0.10·z_fol + 0.35·tanh(2a)

M(c) = σ(1.15·M_raw) · (1 − 2^(−impressions/120))
```

Velocity maintenance (per counter, per event batch):

```
rate  = Δcount / max(1/60, Δhours)
v_new = 2^(−Δhours/1.5)·v_old + (1 − 2^(−Δhours/1.5))·rate
```

Topic-level trend:

```
TM(t) = σ( 1.4·z(Σv_views/|corpus|) + 1.1·z(Σv_shares/|corpus|) + 0.9·tanh(2·a_t) )
        · sqrt(1 − lifecyclePosition(t))
```

Regional vs global split:

```
RT(c, r) = σ( 1.3·log(v_region / v_global) + 0.4·log1p(|corpus_r|)/log1p(1000) )
```

An item with `RT > 0.7` but low global momentum is a **regional trend** and is confined to its region + neighbours until it demonstrates crossover (`X > 0.4`).

---

## 15. EXPLORATION ENGINE

### 15.1 Adaptive budget

```
ε(u) = clip( 0.20 · (1 + 0.9·drift)
                  · (1 + 0.6·fatigue̅)
                  · (1 + 0.5·noveltyAppetite)
                  · (1 + 1.4·2^(−interactions/40))
                  · fairnessBoost ,  0.08 , 0.45 )
```

Nominal 80/20 exploit/explore, but the budget **expands** when the user is drifting, bored, novelty-seeking, new, or when the creator ecosystem is over-concentrated.

### 15.2 Thompson Sampling (topic arms)

```
θ_a ~ Beta(α_a, β_a)
α_a ← α_a + r ,  β_a ← β_a + (1 − r)
```

Crucially `r` is the **satisfaction-weighted reward**, not the click:

```
r = clip( mean_e[ w_S(e)/3 ] + 0.4·watchReward , 0, 1 )
```

Optimising a click-reward bandit converges to clickbait in ~3 weeks (measured in the 2023 shadow experiment). A satisfaction-reward bandit does not.

### 15.3 Contextual bandit (LinUCB, diagonal approximation)

```
score(a) = θ_aᵀφ + α·sqrt( Σ_i φ_i²·A⁻¹_ii ) ,  α = 0.35
A_a ← A_a + φφᵀ  (diagonal only, for latency)
b_a ← b_a + r·φ
θ_a = A_a⁻¹ b_a
```

Used for **creator arms** and **source arms**, where the context (time of day, session depth, device) matters more than for topics.

### 15.4 Exploration bonus in ranking

```
uncertainty = 1/sqrt(1 + pulls(arm))
bonus = ε(u) · ( 0.55·uncertainty + 0.25·1[coldStartPhase ≤ 2] + 0.20·1[newCreator] )
        · (0.6 + 0.4·U(0,1))
S_final = S · (1 + bonus)
```

The random multiplier prevents deterministic exploration ordering, which would otherwise let adversaries reverse-engineer the exploration slots.

### 15.5 Off-policy correction

Every logged impression stores its **propensity** `π_i`. Offline evaluation uses capped IPS / doubly-robust estimators:

```
V̂_DR = (1/n) Σ [ ĝ(x_i, a_i) + (r_i − ĝ(x_i, a_i))·min(π_new/π_i, 10) ]
```

Cap at 10 to bound variance. Any policy change must beat the incumbent on `V̂_DR` before it is allowed into a live A/B.

---

## 16. GEO & LANGUAGE PERSONALIZATION

### 16.1 Language match

```
LM = 1.00   exact primary language
   = 0.82   declared secondary language
   = 0.70   language-agnostic content (music, dance, pets, visual art)
   = 0.34   same language family (mutually intelligible-ish)
   = 0.08   otherwise
```

### 16.2 Country / region match

```
CM = 1.00 same country | 0.62 same region | 0.34 neighbouring region | 0.15 global
RM = 1.00 same region  | 0.55 neighbouring | 0.20 distant
```

Region graph: `NA ↔ LATAM ↔ EU ↔ MENA ↔ SA_ASIA ↔ SEA ↔ EA` (plus NA↔EU).

### 16.3 Aggregate locale gate

```
Λ(u,c) = LM^1.35 · (0.55 + 0.30·CM + 0.15·RM)
```

Priority order (1 → 5) as required: same language ≻ same country ≻ same region ≻ neighbouring regions ≻ global. The exponent 1.35 makes language dominant; the additive `0.55` floor means an outstanding same-language/global item can still surface.

### 16.4 Multilingual users

`secondaryLanguages` is inferred, not asked: a user with `≥ 15` positive engagements on language `ℓ` over 30 days and `completionRate(ℓ) ≥ 0.8 · completionRate(primary)` has `ℓ` added at `LM = 0.82`. Decays out after 60 days of no engagement.

### 16.5 Diaspora handling

Users whose `country ≠ mode(engagement country)` (e.g. an Indian user in the UAE) get a **blended locale profile**:

```
CM_effective = max( CM(user.country, c), 0.9·CM(inferredHomeCountry, c) )
```

This single rule produced the largest single retention win in the geo workstream (+3.8% D7 for diaspora cohorts).
