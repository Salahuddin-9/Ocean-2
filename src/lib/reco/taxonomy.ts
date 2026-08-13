/**
 * ATLAS-RANK :: content taxonomy + semantic topology.
 * The taxonomy is a 3-level tree (vertical -> topic -> subtopic). Topic-topic
 * affinity is derived from co-vertical membership + an explicit adjacency list,
 * which seeds the "hidden interest discovery" graph-diffusion step.
 */

export const EMBED_DIM = 64;

export interface TopicNode {
  id: string;
  vertical: string;
  subtopics: string[];
  /** Nominal half-life (hours) of the topic's trend lifecycle. */
  lifecycleHalfLifeH: number;
  /** Baseline global popularity prior in [0,1]. */
  popularityPrior: number;
  /** Seasonality period in days (0 = aseasonal). */
  seasonPeriodDays: number;
}

export const TOPICS: TopicNode[] = [
  { id: "technology", vertical: "knowledge", subtopics: ["gadgets", "hardware", "software"], lifecycleHalfLifeH: 96, popularityPrior: 0.72, seasonPeriodDays: 0 },
  { id: "ai", vertical: "knowledge", subtopics: ["llm", "agents", "genai", "research"], lifecycleHalfLifeH: 60, popularityPrior: 0.81, seasonPeriodDays: 0 },
  { id: "programming", vertical: "knowledge", subtopics: ["frontend", "backend", "devops", "systems"], lifecycleHalfLifeH: 120, popularityPrior: 0.58, seasonPeriodDays: 0 },
  { id: "startups", vertical: "knowledge", subtopics: ["founders", "vc", "saas"], lifecycleHalfLifeH: 108, popularityPrior: 0.51, seasonPeriodDays: 0 },
  { id: "science", vertical: "knowledge", subtopics: ["space", "biology", "physics"], lifecycleHalfLifeH: 144, popularityPrior: 0.49, seasonPeriodDays: 0 },
  { id: "finance", vertical: "knowledge", subtopics: ["investing", "crypto", "personal-finance"], lifecycleHalfLifeH: 72, popularityPrior: 0.55, seasonPeriodDays: 0 },
  { id: "education", vertical: "knowledge", subtopics: ["study", "languages", "exams"], lifecycleHalfLifeH: 168, popularityPrior: 0.44, seasonPeriodDays: 365 },

  { id: "gaming", vertical: "entertainment", subtopics: ["fps", "moba", "indie", "mobile"], lifecycleHalfLifeH: 48, popularityPrior: 0.78, seasonPeriodDays: 0 },
  { id: "comedy", vertical: "entertainment", subtopics: ["skits", "standup", "memes"], lifecycleHalfLifeH: 30, popularityPrior: 0.88, seasonPeriodDays: 0 },
  { id: "music", vertical: "entertainment", subtopics: ["pop", "hiphop", "edm", "indie-music"], lifecycleHalfLifeH: 40, popularityPrior: 0.84, seasonPeriodDays: 0 },
  { id: "dance", vertical: "entertainment", subtopics: ["choreo", "trend-dance"], lifecycleHalfLifeH: 24, popularityPrior: 0.7, seasonPeriodDays: 0 },
  { id: "film", vertical: "entertainment", subtopics: ["reviews", "trailers", "edits"], lifecycleHalfLifeH: 72, popularityPrior: 0.62, seasonPeriodDays: 0 },
  { id: "anime", vertical: "entertainment", subtopics: ["shonen", "edits-anime"], lifecycleHalfLifeH: 60, popularityPrior: 0.66, seasonPeriodDays: 0 },

  { id: "fitness", vertical: "lifestyle", subtopics: ["gym", "running", "yoga", "calisthenics"], lifecycleHalfLifeH: 120, popularityPrior: 0.69, seasonPeriodDays: 365 },
  { id: "food", vertical: "lifestyle", subtopics: ["recipes", "streetfood", "baking"], lifecycleHalfLifeH: 96, popularityPrior: 0.83, seasonPeriodDays: 365 },
  { id: "travel", vertical: "lifestyle", subtopics: ["budget", "luxury", "vanlife"], lifecycleHalfLifeH: 132, popularityPrior: 0.64, seasonPeriodDays: 365 },
  { id: "fashion", vertical: "lifestyle", subtopics: ["streetwear", "haul", "styling"], lifecycleHalfLifeH: 84, popularityPrior: 0.73, seasonPeriodDays: 182 },
  { id: "beauty", vertical: "lifestyle", subtopics: ["skincare", "makeup"], lifecycleHalfLifeH: 96, popularityPrior: 0.68, seasonPeriodDays: 0 },
  { id: "home", vertical: "lifestyle", subtopics: ["diy", "interior", "organizing"], lifecycleHalfLifeH: 150, popularityPrior: 0.52, seasonPeriodDays: 365 },
  { id: "pets", vertical: "lifestyle", subtopics: ["dogs", "cats", "exotic"], lifecycleHalfLifeH: 110, popularityPrior: 0.79, seasonPeriodDays: 0 },
  { id: "parenting", vertical: "lifestyle", subtopics: ["newborn", "toddler"], lifecycleHalfLifeH: 160, popularityPrior: 0.41, seasonPeriodDays: 0 },

  { id: "sports", vertical: "culture", subtopics: ["football", "basketball", "cricket", "f1"], lifecycleHalfLifeH: 36, popularityPrior: 0.8, seasonPeriodDays: 365 },
  { id: "news", vertical: "culture", subtopics: ["world", "local", "explainer"], lifecycleHalfLifeH: 18, popularityPrior: 0.6, seasonPeriodDays: 0 },
  { id: "politics", vertical: "culture", subtopics: ["policy", "elections"], lifecycleHalfLifeH: 20, popularityPrior: 0.38, seasonPeriodDays: 1460 },
  { id: "art", vertical: "culture", subtopics: ["digital", "traditional", "process"], lifecycleHalfLifeH: 140, popularityPrior: 0.5, seasonPeriodDays: 0 },
  { id: "photography", vertical: "culture", subtopics: ["street", "portrait", "editing"], lifecycleHalfLifeH: 130, popularityPrior: 0.47, seasonPeriodDays: 0 },
  { id: "automotive", vertical: "culture", subtopics: ["ev", "jdm", "reviews-car"], lifecycleHalfLifeH: 100, popularityPrior: 0.57, seasonPeriodDays: 0 },
  { id: "motivation", vertical: "culture", subtopics: ["discipline", "mindset"], lifecycleHalfLifeH: 70, popularityPrior: 0.61, seasonPeriodDays: 365 },
  { id: "health", vertical: "lifestyle", subtopics: ["mental-health", "nutrition", "sleep"], lifecycleHalfLifeH: 150, popularityPrior: 0.58, seasonPeriodDays: 0 },
  { id: "diy", vertical: "knowledge", subtopics: ["woodworking", "repair", "3dprint"], lifecycleHalfLifeH: 145, popularityPrior: 0.45, seasonPeriodDays: 0 },
  { id: "outdoors", vertical: "lifestyle", subtopics: ["hiking", "camping", "fishing"], lifecycleHalfLifeH: 155, popularityPrior: 0.43, seasonPeriodDays: 365 },
];

export const TOPIC_IDS = TOPICS.map((t) => t.id);
export const TOPIC_INDEX: Record<string, TopicNode> = Object.fromEntries(TOPICS.map((t) => [t.id, t]));

/** Explicit semantic adjacency (bidirectional) for latent-interest diffusion. */
const ADJACENCY: [string, string, number][] = [
  ["technology", "ai", 0.86], ["technology", "programming", 0.8], ["technology", "gaming", 0.52],
  ["ai", "programming", 0.78], ["ai", "startups", 0.7], ["ai", "science", 0.62],
  ["programming", "startups", 0.6], ["startups", "finance", 0.66], ["finance", "news", 0.48],
  ["science", "education", 0.6], ["science", "health", 0.5], ["gaming", "anime", 0.58],
  ["gaming", "comedy", 0.44], ["comedy", "music", 0.4],
  ["music", "dance", 0.74], ["music", "film", 0.5], ["film", "anime", 0.52],
  ["fitness", "health", 0.8], ["fitness", "motivation", 0.66], ["fitness", "food", 0.44],
  ["food", "travel", 0.55], ["travel", "photography", 0.6], ["travel", "outdoors", 0.68],
  ["fashion", "beauty", 0.82], ["fashion", "art", 0.4], ["beauty", "health", 0.42],
  ["home", "diy", 0.75], ["diy", "automotive", 0.5], ["pets", "comedy", 0.46],
  ["sports", "fitness", 0.62], ["sports", "news", 0.4], ["news", "politics", 0.8],
  ["art", "photography", 0.7], ["art", "film", 0.5], ["motivation", "health", 0.5],
  ["parenting", "health", 0.45], ["education", "programming", 0.5], ["outdoors", "photography", 0.5],
];

const affinityMap = new Map<string, number>();
for (const t of TOPICS) affinityMap.set(`${t.id}|${t.id}`, 1);
for (const [a, b, w] of ADJACENCY) {
  if (!TOPIC_INDEX[a] || !TOPIC_INDEX[b]) continue;
  affinityMap.set(`${a}|${b}`, w);
  affinityMap.set(`${b}|${a}`, w);
}

/** ρ(t_i, t_j) ∈ [0,1] — semantic proximity between topics. */
export function topicAffinity(a: string, b: string): number {
  if (a === b) return 1;
  const direct = affinityMap.get(`${a}|${b}`);
  if (direct !== undefined) return direct;
  const na = TOPIC_INDEX[a];
  const nb = TOPIC_INDEX[b];
  if (!na || !nb) return 0;
  return na.vertical === nb.vertical ? 0.28 : 0.05;
}

/** Two-hop diffusion neighbours used by hidden-interest discovery. */
export function topicNeighbors(topic: string, minWeight = 0.35): { topic: string; weight: number }[] {
  return TOPIC_IDS.filter((t) => t !== topic)
    .map((t) => ({ topic: t, weight: topicAffinity(topic, t) }))
    .filter((n) => n.weight >= minWeight)
    .sort((x, y) => y.weight - x.weight);
}

export const LANGUAGES = ["en", "es", "pt", "hi", "id", "ar", "fr", "de", "ja", "tr"] as const;
export const REGIONS: Record<string, { countries: string[]; neighbors: string[] }> = {
  NA: { countries: ["US", "CA", "MX"], neighbors: ["LATAM", "EU"] },
  LATAM: { countries: ["BR", "AR", "CO", "CL"], neighbors: ["NA", "EU"] },
  EU: { countries: ["GB", "DE", "FR", "ES", "IT", "TR"], neighbors: ["NA", "MENA"] },
  MENA: { countries: ["AE", "SA", "EG", "MA"], neighbors: ["EU", "SA_ASIA"] },
  SA_ASIA: { countries: ["IN", "PK", "BD", "LK"], neighbors: ["MENA", "SEA"] },
  SEA: { countries: ["ID", "PH", "VN", "TH", "MY"], neighbors: ["SA_ASIA", "EA"] },
  EA: { countries: ["JP", "KR", "TW"], neighbors: ["SEA"] },
};

export const COUNTRY_TO_REGION: Record<string, string> = Object.entries(REGIONS).reduce(
  (acc, [region, cfg]) => {
    for (const c of cfg.countries) acc[c] = region;
    return acc;
  },
  {} as Record<string, string>,
);

export const COUNTRY_LANGUAGE: Record<string, string> = {
  US: "en", CA: "en", MX: "es", BR: "pt", AR: "es", CO: "es", CL: "es",
  GB: "en", DE: "de", FR: "fr", ES: "es", IT: "en", TR: "tr",
  AE: "ar", SA: "ar", EG: "ar", MA: "fr",
  IN: "hi", PK: "en", BD: "en", LK: "en",
  ID: "id", PH: "en", VN: "en", TH: "en", MY: "id",
  JP: "ja", KR: "en", TW: "en",
};
