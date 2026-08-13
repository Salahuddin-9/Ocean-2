# ATLAS-RANK — Production Specification
## Part I — System Architecture, Data Flow, Feature Engineering, Entity Modeling

**Codename:** ATLAS-RANK
**Surface mix:** Reels-style vertical video (50%), Shorts (25%), TikTok-style FYP (25%), plus Facebook-grade Feed + Boosted Post infrastructure.
**Scale target:** 100M+ MAU · 1B+ daily impressions · p99 ranking latency < 100 ms · 250k QPS peak.

---

## 1. SYSTEM ARCHITECTURE

### 1.1 Layer map

```
                      ┌──────────────────────────────────────────┐
   CLIENT             │ SDK: impression beacons, watch heartbeats│
                      │ (250ms), gesture telemetry, survey probes│
                      └────────────────┬─────────────────────────┘
                                       │ gRPC / HTTP3
                      ┌────────────────▼─────────────────────────┐
   EDGE               │ Edge PoP: auth, dedupe, batching,        │
                      │ shadow-traffic mirror, 40ms feed cache   │
                      └────────┬───────────────────┬─────────────┘
                               │ feed request      │ events
              ┌────────────────▼──────┐   ┌────────▼──────────────┐
   SERVING    │ FEED ORCHESTRATOR     │   │ EVENT COLLECTOR       │
              │ 10-stage pipeline     │   │ Kafka events.raw      │
              └───┬───────────┬───────┘   └────────┬──────────────┘
                  │           │                    │
      ┌───────────▼──┐  ┌─────▼─────────┐  ┌───────▼───────────────┐
      │ RETRIEVAL    │  │ RANKING       │  │ STREAM PROCESSING     │
      │ • ANN (HNSW) │  │ • MMoE trunk  │  │ Flink jobs:           │
      │ • Inverted   │  │ • 15 heads    │  │  user-state           │
      │   topic index│  │ • Calibration │  │  content-state        │
      │ • Trend KV   │  │ • MMR/diversity│ │  label-joiner         │
      │ • Follow graph│ │ • Ad auction  │  │  integrity            │
      └───────┬──────┘  └─────┬─────────┘  └───────┬───────────────┘
              │               │                    │
      ┌───────▼───────────────▼────────────────────▼───────────────┐
      │ FEATURE STORE   Redis (hot, 5ms) → RocksDB → Postgres/     │
      │                 Cassandra (warm) → Iceberg/S3 (cold)        │
      └─────────────────────────┬───────────────────────────────────┘
                                │
      ┌─────────────────────────▼───────────────────────────────────┐
      │ TRAINING PLANE  Spark/Ray offline · online SGD (60s push)   │
      │ Model registry (S3 + etcd pointer) · shadow + canary + A/B  │
      └──────────────────────────────────────────────────────────────┘
```

### 1.2 Service inventory

| Service | Responsibility | Language / runtime | SLO |
|---|---|---|---|
| `feed-orchestrator` | Runs the 10 stages, owns the latency budget | Rust/Go | p99 100 ms |
| `retrieval-ann` | HNSW over 64-d content vectors, sharded by topic-vertical | C++ (FAISS/ScaNN) | p99 12 ms @ recall\@200 = 0.95 |
| `retrieval-index` | Inverted lists: topic→content, creator→content, audio→content, geo→content | Go + RocksDB | p99 6 ms |
| `trend-service` | Rolling velocity counters, momentum, viral bands | Go + Redis Cluster | p99 3 ms |
| `ranker` | MMoE inference + distilled linear student | C++ / ONNX Runtime | p99 9 ms for 1.2k candidates |
| `integrity` | Spam/bot/coordination scoring, enforcement ladder | Python + GNN service | p99 8 ms (cached) |
| `ads-auction` | Unified auction, pacing, frequency capping | Go | p99 4 ms |
| `feature-store` | Point-in-time-correct feature reads/writes | Rust | p99 5 ms |
| `event-collector` | Ingest, validate, enrich, publish to Kafka | Go | p99 8 ms |
| `flink-*` | 4 streaming jobs (user, content, labels, integrity) | Flink (Java) | e2e p99 < 1 s |
| `trainer-online` | Streaming SGD/FTRL, pushes weights every 60 s | Python + Rust kernel | 60 s cycle |
| `trainer-offline` | Nightly full retrain, distillation, calibration | Ray + PyTorch | 6 h window |

### 1.3 Storage topology

| Store | Contents | Shard key | Retention |
|---|---|---|---|
| Redis Cluster (hot) | user state, interest graph top-40, session state, counters, feed cache | `user_id` / `content_id` | 24 h–7 d |
| RocksDB (embedded) | per-shard candidate metadata, HNSW graphs | `content_id` | live corpus |
| Postgres/Vitess (`UserDB`) | users, interests, creator affinity, bandit arms | `user_id` | ∞ |
| Cassandra (`ContentDB`) | content, content_stats, cold-start state | `content_id` | ∞ |
| Kafka | `events.raw`, `events.enriched`, `training.examples`, `model.updates` | `user_id` | 7 d |
| Iceberg on S3 | full event lake, training tables, feature snapshots | date + hour | 2 y |
| etcd | model pointer, ranking config, kill-switches | — | — |

### 1.4 Latency budget (p99, 20-slot page from 1,200 candidates)

| Stage | Budget | Actual |
|---|---|---|
| 0 Context hydration (parallel fan-out) | 18 ms | 14 ms |
| 1 Candidate generation (9 pools, parallel) | 25 ms | 22 ms |
| 2 Eligibility filter | 3 ms | 2 ms |
| 3 Quality filter | 3 ms | 1 ms |
| 4–6 Prediction (single trunk pass, 15 heads) | 12 ms | 9 ms |
| 7 Re-ranking | 3 ms | 2 ms |
| 8 Diversity (MMR) | 8 ms | 6 ms |
| 9 Freshness balancing | 2 ms | 1 ms |
| 10 Slot allocation + ad auction | 6 ms | 4 ms |
| Serialization + egress | 8 ms | 6 ms |
| **Total** | **88 ms** | **67 ms** |

Logging (feed_logs, exposure counters, pipeline telemetry) is written **asynchronously** to Kafka and never blocks the response.

---

## 2. RECOMMENDATION ARCHITECTURE

### 2.1 The funnel

```
   ~10^8 live items
        │  Stage 1: retrieval (9 sources, ANN + inverted index + KV)
        ▼
    ~1,200 candidates
        │  Stage 2: eligibility (hard rules)
        ▼
     ~900 candidates
        │  Stage 3: quality + integrity floors
        ▼
     ~700 candidates
        │  Stages 4–6: 15-head prediction on a shared trunk
        ▼
     ~700 scored
        │  Stage 7: master feed score + exploration bonus
        ▼
     ~240 shortlisted
        │  Stage 8: MMR diversity + hard slot constraints
        ▼
      ~60 balanced
        │  Stage 9: temporal portfolio quotas
        ▼
      ~40 ordered
        │  Stage 10: slot allocation (organic/recommended/sponsored) + auction
        ▼
       20 delivered
```

### 2.2 Two-tower retrieval

* **User tower** `f_u : (interest graph, recent consumption, context) → e_u ∈ R^64`
* **Content tower** `f_c : (text, video, audio, metadata) → e_c ∈ R^64`
* Trained with in-batch sampled-softmax + log-Q correction:

```
L = − Σ_(u,c⁺) log [ exp(s(u,c⁺)/τ − log Q(c⁺))
                     / Σ_{c∈B} exp(s(u,c)/τ − log Q(c)) ]
s(u,c) = cos(e_u, e_c) ,  τ = 0.06
```

`log Q(c)` is the streaming-frequency correction (popular items appear in more batches and must be down-weighted or the tower collapses onto head content). Hard-negative mining: 30% in-batch, 50% ANN-mined near-misses, 20% "shown but skipped".

* Index: HNSW, `M=48`, `efConstruction=400`, `efSearch=128`, sharded 64 ways by topic-vertical × language-family. Rebuilt every 15 min incrementally; full rebuild nightly.

### 2.3 Why a single shared trunk

Ranking 1,200 candidates × 15 objectives is only affordable because all heads read one trunk. The MMoE trunk (8 experts × 256) is distilled nightly into a per-head **linear student** over the 56-d engineered feature vector; the student serves online and is continuously corrected by streaming SGD. Measured gap: −1.1% AUC vs teacher, +38× throughput.

---

## 3. DATA FLOW

### 3.1 Request path (read)

```
1. Edge receives GET /feed?user=U&surface=reels&cursor=k
2. Feed cache probe (key = U|surface|bucket(k), TTL 40 s). Miss → orchestrator.
3. Parallel hydration:
     a. user row + interest graph (Redis, fallback UserDB)
     b. creator affinity + follow list
     c. exposure/dedupe bloom filter (last 14 d)
     d. session state (depth, fatigue, skip streak)
     e. model pointer (etcd, cached 30 s)
4. Stage 1..10 as above.
5. Response emitted; feed_logs + exposure counters published to Kafka.
```

### 3.2 Write path (events)

```
client → edge collector → validate/enrich → Kafka events.raw (key=user_id)
   ├─ flink-user-state    : interest graph update, fatigue window, session agg
   ├─ flink-content-state : counters, velocities, freshness/momentum/viral, cold-start ladder
   ├─ flink-label-joiner  : join to feed_logs on (request_id, content_id),
   │                        30-min watermark, emit training.examples
   ├─ flink-integrity     : burst/pod/farm detectors → trust_ledger
   └─ sink → Iceberg (events lake, hourly partitions)
```

### 3.3 Point-in-time correctness

Training examples embed the **exact feature vector that was used at serving time** (`feed_logs.features`). This eliminates train/serve skew by construction: we never recompute features for training. The only recomputed values are labels.

### 3.4 Consistency model

* Interest graph: read-your-writes within a session (Redis write-through).
* Content counters: eventually consistent, ≤ 1 s lag; ranking tolerates staleness because velocities are EWMAs.
* Cold-start caps: **strongly consistent** (CAS on `content.cold_start_cap`) — over-delivery of an unvalidated post is the one thing we refuse to tolerate.

---

## 4. FEATURE ENGINEERING

### 4.1 The 56-dimensional trunk vector `φ(u, c, ctx)`

| Idx | Family | Feature | Definition |
|---|---|---|---|
| 0 | geometry | `emb_cosine` | `cos(e_u, e_c)` |
| 1 | geometry | `topic_affinity_direct` | `A(u, topic_c)` |
| 2 | geometry | `topic_affinity_diffused` | `Â(u,t_c) = Σ A(u,t)ρ(t,t_c)^1.7 / Σ ρ^1.7` |
| 3 | geometry | `topic_momentum_user` | `m(u, t_c)` |
| 4 | geometry | `creator_affinity` | EWMA of engagement with creator |
| 5 | geometry | `is_following` | binary |
| 6 | geometry | `subtopic_overlap` | max affinity over `c.subTopics` |
| 7 | geometry | `audio_affinity` | audio seen in last 72 h |
| 8–16 | content | quality/originality/production/clarity/educational/entertainment/hook/motion/duration | see §6 |
| 17 | history | `log_impressions` | `log1p(I)/log1p(10^6)` |
| 18–25 | history | smoothed rates | `(k + p̄·s)/(n + s)` empirical-Bayes with per-topic priors |
| 26–32 | dynamics | freshness, momentum, viral, acceleration, age, lifecycle, audio-trend | §13/§14/§11 |
| 33–37 | locale | LM, CM, RM, Λ, creator-same-region | §16 |
| 38–44 | fatigue | topic fatigue, creator fatigue, novelty, serendipity, prior impressions, hours-since-topic, session depth | §fatigue |
| 45–50 | user | activity, avg watch ratio, skip rate, novelty appetite, prime-time, commute | |
| 51–54 | integrity | creator trust, creator quality, spam prob, negative rate | §18/§19 |
| 55 | — | bias | 1 |

### 4.2 Normalisation rules

1. **Counts** always enter as `log1p(x)/log1p(x_max)` — heavy tails otherwise dominate gradients.
2. **Rates** always enter Bayesian-smoothed toward the topic prior with strength `s` proportional to the prior's variance: `s = p̄(1−p̄)/σ²_topic`.
3. **Times** enter as decayed values, never raw timestamps (no leakage of absolute wall-clock).
4. **Cyclic context** (hour, day-of-week) enters as `(sin, cos)` pairs.
5. All features clipped to `[−4, 4]` after normalisation; clipping rate is monitored (alert if > 0.5%).

### 4.3 Anti-leakage rules

* No feature may be computed from events **after** the impression timestamp.
* `content_stats` used at serving time is snapshotted into `feed_logs.features` — the training job never re-reads live stats.
* Creator scores are lagged by 1 hour to avoid a post's own labels feeding back into its ranking features.

### 4.4 Feature freshness tiers

| Tier | Examples | Refresh | Store |
|---|---|---|---|
| T0 real-time | session depth, skip streak, consecutive topic | request-time | in-memory |
| T1 streaming | short-term interest, velocities, fatigue window | ≤ 1 s | Redis |
| T2 near-line | momentum, viral, freshness, cold-start phase | ≤ 60 s | Redis + Cassandra |
| T3 batch | creator trust/quality, embeddings, topic baselines | hourly / nightly | Cassandra + S3 |

---

## 5. USER MODELING

A user is three coexisting objects: an **interpretable interest graph**, a **dense embedding**, and a **volatile context**.

### 5.1 Dual-timescale interest

```
S(u,t)  short-term, half-life H_S = 6 h
L(u,t)  long-term,  half-life H_L = 504 h (21 d)
A(u,t)  = λ·S + (1−λ)·L ,  λ = 0.35 + 0.25·sessionIntensity  ∈ [0.20, 0.75]
```

Update on event `e` with signal weight `w_e` at time `t_now`, `Δt` hours since last touch:

```
surprise = 1 − Â(u,t)                (predictive coding: known interests move less)
S ← S · 2^(−Δt/H_S) + η_S · w_e · surprise ,   η_S = 0.34
L ← L · 2^(−Δt/H_L) + η_L · w_e · surprise ,   η_L = 0.06
```

Negative signals bypass the surprise damper (`surprise = 1`) so a "not interested" always lands at full magnitude.

### 5.2 Confidence

```
conf(u,t) = WilsonLower95( engagements(u,t), exposures(u,t) )
```

Confidence gates promotion out of `emerging` and controls how much the interest may influence retrieval (a 1/1 signal must not create a topic obsession).

### 5.3 Momentum, growth and decline

```
m(u,t) = clip( 6·(A_now − A_prev) + 0.7·m_prev , −1, 3 )
```

Classification:

| Kind | Rule |
|---|---|
| `emerging` | `exposures < 5` |
| `growing` | `m > 0.35 ∧ conf > 0.20` |
| `declining` | `m < −0.30` |
| `permanent` | `L > 0.55 ∧ |m| < 0.15` |
| `temporary` | `A > 0.30 ∧ L < 0.20` |
| `seasonal` | `autocorr(A, P) > 0.5` for topic period `P` |
| `latent` | discovered by diffusion, `exposures < 5` |

### 5.4 Seasonality

For topics with period `P` days:

```
A_seasonal(u,t) = A(u,t) · (1 + β·cos(2π(d − φ_{u,t})/P)) ,  β = 0.22
```

`φ` is the user's own phase, estimated by cross-correlating their engagement series against the topic's global seasonal curve.

### 5.5 Latent / hidden interest discovery

Diffusion over the topic manifold:

```
Â(u, t*) = Σ_t A(u,t) · ρ(t,t*)^γ  /  Σ_t ρ(t,t*)^γ ,   γ = 1.7
t* is LATENT ⟺ Â(u,t*) ≥ 0.32  ∧  exposures(u,t*) < 5
```

Latent topics feed the exploration pool directly and receive a **serendipity bonus** in ranking. This is the mechanism by which "AI" is proposed to a user whose graph only contains {technology, programming, startups}.

### 5.6 Interest drift detector

```
D(u) = Σ_t p_S(t) · log( p_S(t) / p_L(t) )   normalised by log|T|
```

`p_S`, `p_L` are the softmax-normalised short/long distributions. High `D(u)` ⇒ the user is changing; the exploration budget `ε(u)` is raised proportionally and the short-term blend weight `λ` increases.

### 5.7 User tower

```
e_u = L2Norm( Σ_t A(u,t)^1.25 · (0.6 + 0.4·conf(u,t)) · anchor(t)
              + 0.30 · Σ_k 2^(−age_k/72h) · e_{c_k} / Σ_k 2^(−age_k/72h) )
```

where `c_k` are the last-K positively engaged items. Topic anchors are shared with the content tower (Laplacian-smoothed over the topic adjacency graph), so the two towers live in one metric space and a single ANN index serves both.

### 5.8 Volatile context

`sessionDepth`, `consecutiveTopic`, `skipStreak`, `timeOfDay`, `deviceClass`, `networkClass`, `batteryState`, `headphonesConnected` (strong predictor of audio-heavy content success).

---

## 6. CONTENT MODELING

### 6.1 Understanding pipeline (offline, per upload, p95 ≈ 900 ms)

```
raw media ─┬─► ASR (Whisper-L, 99 langs)         → transcript, speechRatio
           ├─► OCR (2 fps frame sampler)          → onscreen text
           ├─► VideoMAE ViT-L (16×224)            → v_video ∈ R^512
           ├─► CLAP audio encoder                 → v_audio ∈ R^256
           ├─► mE5-large text encoder             → v_text  ∈ R^768
           ├─► Detectors: objects (DETR), faces, emotion (valence/arousal),
           │              scene-change (TransNetV2), motion (optical flow)
           └─► Safety classifiers (18 policy heads)
                             │
             ┌───────────────▼──────────────┐
             │  Gated fusion MLP            │
             │  z = W·[v_t; v_v; v_a; v_m]  │
             └───────────────┬──────────────┘
                             ▼
              e_c = L2Norm(z) ∈ R^64  (served ANN vector)
```

Served fusion (distilled): `e_c = L2( 0.34·E_text + 0.26·E_video + 0.12·E_audio + 0.62·anchor(topic) )`.

### 6.2 Text features

`title`, `caption`, `hashtags[]`, `ocrText`, `transcript`, `keywords[]` (YAKE + TF-IDF over the topic corpus), `semanticTopics` (top-3 taxonomy nodes with scores), `textSentiment ∈ [−1,1]`.

### 6.3 Video features

`sceneChanges`, `objectTags[]`, `faceCount`, `emotionValence`, `emotionArousal`, `motionIntensity`, `editingStyle ∈ {fast-cut, talking-head, standard, cinematic, montage}`, `hookStrength`.

```
HookStrength = σ( 1.9·motionOnset + 1.2·hasFaceEarly + 0.9·ocrDensity
                 + 0.8·audioEnergy + styleBonus − 2.6 )
```

This is a *prior* on `P(watch ≥ 3 s | impression)`; it is the single most valuable feature for cold-start content because it is computable **before any impression exists**.

### 6.4 Audio features

`audioId` (cluster id from CLAP + chromaprint), `audioType`, `audioTrendScore` (velocity of new posts using the audio, z-normalised), `audioSentiment`, `speechRatio`.

### 6.5 Quality vector

```
scenePacing  = 1 − |sceneChanges/max(4,duration) − 0.22| / 0.4
motionFit    = 1 − |motionIntensity − 0.55| / 0.55
faceFit      = 1 − |min(faceCount,4) − 1.2| / 3
jitter       = max(0, motionIntensity − 0.9)·6

Production  P = σ(1.6·scenePacing + 1.1·motionFit + 0.9·faceFit − 0.7·jitter − 1.5)
Clarity     C = σ(1.4·speechRatio + 1.0·transcriptDensity − 1.2·hashtagStuffing − 0.4)
Educational E = 0.55·transcriptDensity + 0.35·speechRatio + 0.25·min(1,dur/60) − 0.1
Entertain.  X = 0.42·motionIntensity + 0.30·min(1,scenes/12) + 0.28·(1 − speechRatio)
Depth       D = 0.6·E + 0.4·C
Originality O = base originality ÷ simhash-cluster rank   (first uploader keeps credit)

Quality     Q = 0.30·P + 0.24·C + 0.22·O + 0.14·CreatorQuality + 0.10·D
```

### 6.6 Near-duplicate detection

64-bit SimHash over weighted shingles of `caption ∪ transcript ∪ ocr`, plus perceptual video hash (pHash of 8 keyframes). Hamming ≤ 6 ⇒ same cluster. Within a cluster, originality is divided by rank-in-cluster and re-uploads are demoted, never removed (fair-use / remix culture is preserved but not rewarded with reach).

### 6.7 Topic lifecycle

```
lifecyclePosition(t, age) = 1 − 2^(−age / H_lifecycle(t))
```

`H_lifecycle` is topic-specific: `news = 18 h`, `dance = 24 h`, `comedy = 30 h`, `technology = 96 h`, `diy = 145 h`. Evergreen topics decay slowly, so a 3-week-old woodworking tutorial is not buried by a hard recency prior.

---

## 7. CREATOR MODELING

Per-post performance, recency-weighted with half-life 14 d:

```
perf_p = 0.34·completionRate + 0.26·watchRatio + 0.22·(4·engagementRate)
       + 0.18·(6·saveShareRate) − 0.40·(8·negativeRate)
```

Aggregates (`w_i = 2^(−age_i/336h)`, `W = Σ w_i`):

```
HistoricalPerformance H = Σ w_i·perf_i / W
Consistency            K = (1 − σ(perf)/max(0.05, μ(perf))) · (0.55 + 0.45·min(1, n/12))
Quality                Q_c = 0.55·Σw·quality/W + 0.30·Σw·originality/W + 0.15·H
AudienceSatisfaction   S_c = σ( 6.5·WilsonLower(deepEngagements, views) − 55·negRate + 0.15 )
Retention              R_c = 0.6·Σw·completionRate/W + 0.4·S_c
GrowthVelocity         G_c = tanh( 4·(followers − followers_prev)/max(50, followers_prev) )
ViolationRisk          V_c = σ( 2.4·strikes + 900·reportRate − 3.1 )
SpamRisk               P_c = σ( 3.0·spamMean + 2.2·cadencePenalty + 1.6·dupPenalty
                                + 2.5·(1 − followerAuthenticity) − 3.2 )

TRUST  T_c = σ( 2.2·Q_c + 1.6·K + 1.8·S_c + 0.9·log1p(ageDays)/log1p(365)
                + 1.1·followerAuthenticity − 3.4·V_c − 3.0·P_c − 0.8·min(3,strikes) − 2.6 )
```

`followerAuthenticity = 1 − (share of followers with user-trust < 0.35)`.

### 7.1 Tiering and distribution multiplier

```
composite = 0.35·T_c + 0.30·Q_c + 0.20·S_c + 0.15·K

tier = new          if posts < 3 or ageDays < 14
     = elite        if composite > 0.78 and followers > 50k
     = established  if composite > 0.60
     = emerging     otherwise

DistributionMultiplier M_c = clip( 0.75 + 0.55·composite
                                   + 0.20·log1p(followers)/log1p(10^7)
                                   − 0.35·P_c , 0.25, 1.9 )
```

The follower term is deliberately **logarithmic and small** (max +0.20). A 10M-follower account gets at most a 20% cold-start head start over a 1k-follower account with the same quality. This is the anti-rich-get-richer control.

### 7.2 Ecosystem fairness controller

```
G = Gini( impressions across top-10k creators )
healthy ⟺ G ≤ 0.82
if G > 0.82:  emergingCreatorBoost = clip(1 + 3·(G − 0.82), 1, 1.6)
```

`emergingCreatorBoost` multiplies the exploration budget allocated to `tier ∈ {new, emerging}` and raises `δ_g` (the emerging-creator term in `U_eco`) until the Gini returns under target. Measured weekly; changes are ramped over 72 h to avoid supply shocks.
