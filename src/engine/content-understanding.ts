// ============================================================
// CONTENT UNDERSTANDING ENGINE
// Multi-Modal Feature Extraction & Embedding Architecture
// ============================================================

export interface ContentFeatures {
  contentId: string;
  creatorId: string;
  publishedAt: number;
  
  // Text features
  text: TextFeatures;
  
  // Video features
  video: VideoFeatures;
  
  // Audio features  
  audio: AudioFeatures;
  
  // Quality features
  quality: QualityFeatures;
  
  // Embedding
  embedding: Float32Array;  // 512-dim content embedding
  
  // Classification
  topics: TopicClassification[];
  
  // Safety
  safety: SafetyClassification;
}

export interface TextFeatures {
  title: string;
  description: string;
  hashtags: string[];
  mentions: string[];
  ocrText: string;           // text extracted from video frames
  speechTranscript: string;  // ASR output
  keywords: string[];        // extracted keywords
  semanticTopics: string[];  // topic modeling output
  language: string;          // detected language
  languageConfidence: number;
  sentiment: number;         // -1 to 1
  entities: NamedEntity[];   // NER output
  embeddings: {
    title: Float32Array;       // 384-dim sentence embedding
    description: Float32Array;
    transcript: Float32Array;
  };
}

export interface NamedEntity {
  text: string;
  type: 'PERSON' | 'ORG' | 'LOC' | 'PRODUCT' | 'EVENT' | 'OTHER';
  confidence: number;
  startPos: number;
  endPos: number;
}

export interface VideoFeatures {
  duration: number;           // seconds
  frameRate: number;
  resolution: { width: number; height: number };
  aspectRatio: number;
  
  // Visual analysis
  sceneCount: number;
  sceneChanges: number[];     // timestamps of scene changes
  avgSceneDuration: number;
  
  // Object detection
  detectedObjects: ObjectDetection[];
  dominantColors: string[];
  
  // Face analysis
  faceCount: number;
  faceFrameRatio: number;     // % of frames with faces
  emotions: EmotionDetection;
  
  // Motion analysis
  motionIntensity: number;    // 0-1
  motionVariance: number;
  
  // Style analysis
  editingPace: 'slow' | 'medium' | 'fast' | 'rapid';
  hasTextOverlay: boolean;
  hasSubtitles: boolean;
  visualStyle: 'professional' | 'amateur' | 'ugc' | 'animated';
  
  // Hook detection
  hookScore: number;          // 0-1, how strong is the opening
  hookType: 'visual' | 'audio' | 'text' | 'action' | 'question' | 'none';
  firstFrameEngagement: number;
  
  // Thumbnails
  thumbnailQuality: number;
  thumbnailRelevance: number;
  
  // Embeddings
  frameEmbeddings: Float32Array[];  // key frame embeddings
  videoEmbedding: Float32Array;     // aggregated 512-dim
}

export interface ObjectDetection {
  label: string;
  confidence: number;
  boundingBox: { x: number; y: number; width: number; height: number };
  frameTimestamp: number;
}

export interface EmotionDetection {
  dominant: 'happy' | 'sad' | 'angry' | 'surprised' | 'neutral' | 'fear';
  distribution: Record<string, number>;
  confidence: number;
}

export interface AudioFeatures {
  hasAudio: boolean;
  duration: number;
  
  // Music analysis
  hasMusic: boolean;
  musicGenre: string[];
  musicMood: string[];
  musicTempo: number;         // BPM
  musicEnergy: number;        // 0-1
  isTrendingAudio: boolean;
  audioId: string | null;     // for trending audio tracking
  
  // Speech analysis
  hasSpeech: boolean;
  speechRatio: number;        // % of audio that is speech
  speakerCount: number;
  speechPace: 'slow' | 'normal' | 'fast';
  speechClarity: number;      // 0-1
  
  // Sentiment
  audioSentiment: number;     // -1 to 1
  audioEnergy: number;        // 0-1
  
  // Quality
  audioQuality: number;       // 0-1
  hasBackgroundNoise: boolean;
  
  // Embedding
  audioEmbedding: Float32Array;  // 256-dim
}

export interface QualityFeatures {
  // Production quality
  productionScore: number;      // 0-10
  clarityScore: number;         // 0-10
  lightingScore: number;        // 0-10
  stabilityScore: number;       // 0-10 (anti-shake)
  
  // Content quality
  originalityScore: number;     // 0-10
  creativityScore: number;      // 0-10
  informativeScore: number;     // 0-10
  entertainmentScore: number;   // 0-10
  educationalScore: number;     // 0-10
  
  // Composite
  overallQualityScore: number;  // 0-10, weighted combination
  
  // Flags
  isRepost: boolean;
  repostSimilarity: number;     // if repost, similarity to original
  originalContentId: string | null;
}

export interface TopicClassification {
  topic: string;
  confidence: number;
  level: number;              // 0=broad, 1=medium, 2=specific
  taxonomy: string[];         // full path in taxonomy
}

export interface SafetyClassification {
  isSafe: boolean;
  flags: SafetyFlag[];
  overallRisk: number;        // 0-1
  requiresReview: boolean;
}

export interface SafetyFlag {
  type: 'violence' | 'adult' | 'hate' | 'misinformation' | 'spam' | 'harassment' | 'self-harm' | 'dangerous';
  severity: 'low' | 'medium' | 'high' | 'critical';
  confidence: number;
  timestamp?: number;         // for video, where in the content
}

// ─────────────────────────────────────────────
// Content Embedding Architecture
// ─────────────────────────────────────────────
// 
// Multi-modal fusion:
// C_emb = α·T_emb + β·V_emb + γ·A_emb + δ·Q_emb
// 
// Where:
//   T_emb = text embedding (BERT/sentence-transformers)
//   V_emb = video embedding (VideoMAE/CLIP)
//   A_emb = audio embedding (wav2vec)
//   Q_emb = quality embedding (learned)
//
// Final embedding is L2-normalized 512-dim vector

export const MODALITY_WEIGHTS = {
  text: 0.30,
  video: 0.40,
  audio: 0.20,
  quality: 0.10,
};

export function fuseModalityEmbeddings(
  textEmb: Float32Array,     // 512-dim
  videoEmb: Float32Array,    // 512-dim
  audioEmb: Float32Array,    // 512-dim (zero-padded from 256)
  qualityEmb: Float32Array,  // 512-dim
  weights = MODALITY_WEIGHTS
): Float32Array {
  const dim = 512;
  const result = new Float32Array(dim);
  
  for (let i = 0; i < dim; i++) {
    result[i] = 
      weights.text * (textEmb[i] || 0) +
      weights.video * (videoEmb[i] || 0) +
      weights.audio * (audioEmb[i] || 0) +
      weights.quality * (qualityEmb[i] || 0);
  }
  
  // L2 normalize
  const norm = Math.sqrt(result.reduce((a, b) => a + b * b, 0));
  if (norm > 0) {
    for (let i = 0; i < dim; i++) {
      result[i] /= norm;
    }
  }
  
  return result;
}

// ─────────────────────────────────────────────
// Hook Detection Model
// ─────────────────────────────────────────────
// Predicts how engaging the first N seconds are
// Hook_score = σ(w · [visual_hook, audio_hook, text_hook, action_hook, novelty])

export interface HookAnalysis {
  overallScore: number;
  visualScore: number;
  audioScore: number;
  textScore: number;
  actionScore: number;
  curiosityGap: number;      // does it create curiosity?
  recommendations: string[];
}

export function analyzeHook(
  _firstFrameEmbedding: Float32Array,
  firstSecondAudioEnergy: number,
  hasOpeningText: boolean,
  hasQuickAction: boolean,
  sceneDiversity: number
): HookAnalysis {
  // Simplified hook scoring
  const visualScore = sceneDiversity * 0.5 + 0.5; // diversity helps
  const audioScore = Math.min(1, firstSecondAudioEnergy * 1.2);
  const textScore = hasOpeningText ? 0.7 : 0.3;
  const actionScore = hasQuickAction ? 0.8 : 0.4;
  
  // Curiosity gap - would need NLP analysis of opening
  const curiosityGap = 0.5; // placeholder
  
  const overallScore = 
    0.25 * visualScore +
    0.20 * audioScore +
    0.15 * textScore +
    0.25 * actionScore +
    0.15 * curiosityGap;
  
  const recommendations: string[] = [];
  if (visualScore < 0.5) recommendations.push('Improve opening visual impact');
  if (audioScore < 0.5) recommendations.push('Add engaging audio hook');
  if (!hasOpeningText) recommendations.push('Consider text overlay in first 2 seconds');
  if (!hasQuickAction) recommendations.push('Start with action to grab attention');
  
  return {
    overallScore,
    visualScore,
    audioScore,
    textScore,
    actionScore,
    curiosityGap,
    recommendations,
  };
}

// ─────────────────────────────────────────────
// Overall Quality Score Computation
// ─────────────────────────────────────────────
// Q_overall = Σᵢ wᵢ × qᵢ × confidence_factor

export const QUALITY_WEIGHTS = {
  production: 0.15,
  clarity: 0.10,
  lighting: 0.08,
  stability: 0.07,
  originality: 0.20,
  creativity: 0.15,
  informative: 0.10,
  entertainment: 0.10,
  educational: 0.05,
};

export function computeOverallQuality(quality: QualityFeatures): number {
  return (
    QUALITY_WEIGHTS.production * quality.productionScore +
    QUALITY_WEIGHTS.clarity * quality.clarityScore +
    QUALITY_WEIGHTS.lighting * quality.lightingScore +
    QUALITY_WEIGHTS.stability * quality.stabilityScore +
    QUALITY_WEIGHTS.originality * quality.originalityScore +
    QUALITY_WEIGHTS.creativity * quality.creativityScore +
    QUALITY_WEIGHTS.informative * quality.informativeScore +
    QUALITY_WEIGHTS.entertainment * quality.entertainmentScore +
    QUALITY_WEIGHTS.educational * quality.educationalScore
  );
}

// ─────────────────────────────────────────────
// Content Similarity Computation
// ─────────────────────────────────────────────
// sim(c₁, c₂) = cosine(emb₁, emb₂)

export function computeContentSimilarity(
  emb1: Float32Array,
  emb2: Float32Array
): number {
  let dotProduct = 0;
  let norm1 = 0;
  let norm2 = 0;
  
  for (let i = 0; i < emb1.length; i++) {
    dotProduct += emb1[i] * emb2[i];
    norm1 += emb1[i] * emb1[i];
    norm2 += emb2[i] * emb2[i];
  }
  
  const denominator = Math.sqrt(norm1) * Math.sqrt(norm2);
  return denominator > 0 ? dotProduct / denominator : 0;
}
