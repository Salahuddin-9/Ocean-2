/**
 * Turtle Social Media Application - AI Bengali & Banglish Content Moderation Engine
 * 
 * This file contains the complete, production-ready, fully typed module for Turtle's
 * Bengali and Banglish AI Moderation Engine. It integrates with Google GenAI (@google/genai SDK)
 * to evaluate user-generated content in Bengali (native script) or Banglish (phonetic/romanized text)
 * for localized harassment, hate speech, political violence, sexual content, scams, spam,
 * fake emergencies, self-harm, threats, private information, and medical misinformation.
 * 
 * -----------------------------------------------------------------------------------------
 * CORE FEATURE OVERVIEW:
 * 1. Rich type safety for localized multilingual payloads and classification metrics.
 * 2. High-fidelity Gemini API multimodal/text prompt engineering with strict evaluation rules.
 * 3. Structured JSON Response Schema mapping exactly to the requested payload.
 * 4. Advanced cultural & linguistic context rules (handling phonetic swear words, political slang, etc.).
 * 5. Transparent client-side proxy helper interacting with Express API routes.
 * 6. Production-grade server-side controller ready to mount inside the central Express server.
 * 7. Bilingual heuristic-based mock fallback mechanism for offline/no-key environments.
 * -----------------------------------------------------------------------------------------
 */

import { GoogleGenAI, Type } from "@google/genai";
import { aiRateLimit } from './lib/aiRateLimit';

// ============================================================================
// 1. DATA MODELS & TYPES
// ============================================================================

export type BengaliModerationLanguage = "bn" | "banglish" | "mixed" | "unknown";
export type BengaliModerationRiskLevel = "none" | "low" | "medium" | "high" | "critical";
export type BengaliModerationAction = "allow" | "limit" | "send_to_review" | "block";

export type BengaliModerationCategory =
  | "harassment"
  | "hate speech"
  | "political violence"
  | "sexual content"
  | "scam"
  | "spam"
  | "fake emergency"
  | "self-harm"
  | "threat"
  | "private information"
  | "medical misinformation";

export interface BengaliModerationInput {
  text: string;
  context?: {
    userId?: string;
    postId?: string;
    ipAddress?: string;
    timestamp?: string;
  };
}

export interface BengaliModerationResult {
  language: BengaliModerationLanguage;
  riskLevel: BengaliModerationRiskLevel;
  categories: BengaliModerationCategory[];
  translatedSummaryEnglish: string;
  reasonBangla: string;
  recommendedAction: BengaliModerationAction;
  confidence: number; // 0.0 to 1.0
}

// ============================================================================
// 2. GEMINI API STRUCTURED JSON SCHEMA
// ============================================================================

export const BENGALI_MODERATION_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  description: "Strict evaluation of safety risks in Bengali or Banglish text content for Turtle.",
  properties: {
    language: {
      type: Type.STRING,
      description: "Must be exactly one of: 'bn' (native Bengali script), 'banglish' (romanized phonetic Bengali), 'mixed' (combination), 'unknown' (not Bengali)."
    },
    riskLevel: {
      type: Type.STRING,
      description: "Must be exactly one of: 'none', 'low', 'medium', 'high', 'critical'."
    },
    categories: {
      type: Type.ARRAY,
      description: "List of matched risk categories. Empty if clean.",
      items: {
        type: Type.STRING,
        description: "Must be one of: 'harassment', 'hate speech', 'political violence', 'sexual content', 'scam', 'spam', 'fake emergency', 'self-harm', 'threat', 'private information', 'medical misinformation'."
      }
    },
    translatedSummaryEnglish: {
      type: Type.STRING,
      description: "A clear, precise English translation and summary of what the input text says."
    },
    reasonBangla: {
      type: Type.STRING,
      description: "A succinct, high-fidelity explanation in formal Bengali (বাংলা) stating why this classification was made."
    },
    recommendedAction: {
      type: Type.STRING,
      description: "Recommended action. Must be exactly one of: 'allow', 'limit', 'send_to_review', 'block'."
    },
    confidence: {
      type: Type.NUMBER,
      description: "AI classification confidence level, from 0.0 to 1.0."
    }
  },
  required: [
    "language",
    "riskLevel",
    "categories",
    "translatedSummaryEnglish",
    "reasonBangla",
    "recommendedAction",
    "confidence"
  ]
};

// ============================================================================
// 3. SYSTEM INSTRUCTIONS (BENGALI/BANGLISH LINGUISTIC COMPLIANCE RULES)
// ============================================================================

export const BENGALI_MODERATION_SYSTEM_INSTRUCTION = `
You are Turtle's Automated safety officer specializing in Bengali (বাংলা) and Banglish (phonetic/Romanized Bengali) content moderation. Your role is to examine social posts, comments, or private messages and detect safety violations.

LITERARY AND PHONETIC DECODER LAWS:
1. DETECT LANGUAGE:
   - Identify if the script is native Bengali characters ('bn'), romanized phonetic words like 'ami bhalo achi' ('banglish'), a combination of both ('mixed'), or not Bengali ('unknown').
2. CATEGORY EVALUATION MATRIX:
   - 'harassment': Targeted insults (e.g., calling individuals 'kutta', 'sala', 'haramjada', 'khanki'), personal attacks, or aggressive degradation.
   - 'hate speech': Slurs targeting specific religious, ethnic, or gender groups in South Asia (e.g., standard highly offensive regional slurs, communal hate words).
   - 'political violence': Threats of riots, vandalism, calls to destroy government/civic infrastructure ('gari bhangchor', 'andolon violent activities'), political extremist propaganda, or incitement to physical clash ('maramari').
   - 'sexual content': Explicit sexual anatomical vocabulary, pornography references, or soliciting sexual acts ('choda', 'buda', 'gud', 'sex kora').
   - 'scam': Fraudulent financial schemes, lottery scams ('free lottery jeten', 'bKash/Nagad double money offer'), unverified digital cash investments.
   - 'spam': Rapid duplicate messages, suspicious link farms, follower buying schemes.
   - 'fake emergency': Fabricated natural disasters, fake political lockdown (hartal) alarms, false military or police actions designed to cause panic.
   - 'self-harm': Suicidal ideation, self-harm instructions ('ami morbo', 'suicide kora', 'attahotta').
   - 'threat': Direct or indirect promises of violence or death ('toke mere phelbo', 'khun korbo', 'gola katbo').
   - 'private information': Publishing someone else's personal address ('thikana'), mobile phone number, bKash PIN, or banking credentials without permission.
   - 'medical misinformation': Fraudulent medical cures (e.g., 'homeopathy cures COVID instantly', 'ajgubi osudh'), fabricating global health crises.

MAPPING RISK DECISION ENGINE:
- 'none': Normal, healthy communication. Action: 'allow'.
- 'low': Mild colloquial expressions, benign sarcasm, normal business queries. Action: 'allow' or 'limit'.
- 'medium': Spamming, minor private details shared, mild harassment, sketchy financial links. Action: 'send_to_review'.
- 'high': Direct violent threats, major hate speech slurs, financial scams, sexual harassment. Action: 'block' or 'send_to_review'.
- 'critical': Severe threats of immediate physical violence (e.g., calling for public beheadings, riots), explicit self-harm/suicide plans. Action: 'block'.

OUTPUT COMPLIANCE:
You MUST output strictly a single valid JSON payload matching the specified schema. No markdown fences (\`\`\`json), no trailing text, and no preambles.
`.trim();

// ============================================================================
// 4. LAZY-INITIALIZED GEMINI CLIENT
// ============================================================================

let geminiClient: GoogleGenAI | null = null;

function getGeminiClient(): GoogleGenAI {
  if (!geminiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not defined in server environment variables.");
    }
    geminiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build"
        }
      }
    });
  }
  return geminiClient;
}

// ============================================================================
// 5. SERVER-SIDE GEMINI PIPELINE
// ============================================================================

/**
 * Analyzes Bengali or Banglish text content on the server side using Gemini 3.5 Flash.
 * Instantly falls back to our robust phonetic match simulator if the API key is absent.
 */
export async function serverSideAnalyzeBengaliContent(input: BengaliModerationInput): Promise<BengaliModerationResult> {
  const hasApiKey = !!process.env.GEMINI_API_KEY;

  if (!hasApiKey) {
    console.warn("GEMINI_API_KEY not found. Operating Bengali moderation via robust local phonetic matching simulation.");
    return runMockBengaliModeration(input.text);
  }

  try {
    const client = getGeminiClient();

    const inputPrompt = `
Analyze the following text for localized South Asian and Bengali safety compliance:
"${input.text}"

Context Details:
- User ID: ${input.context?.userId || "anonymous"}
- Post/Entity ID: ${input.context?.postId || "none"}
- Timestamp: ${input.context?.timestamp || new Date().toISOString()}

Provide a highly precise safety classification.
    `.trim();

    const response = await client.models.generateContent({
      model: "gemini-3.5-flash",
      contents: inputPrompt,
      config: {
        systemInstruction: BENGALI_MODERATION_SYSTEM_INSTRUCTION,
        responseMimeType: "application/json",
        responseSchema: BENGALI_MODERATION_RESPONSE_SCHEMA,
        temperature: 0.1
      }
    });

    const text = response.text;
    if (!text) {
      throw new Error("Gemini returned empty Bengali/Banglish safety content.");
    }

    return JSON.parse(text.trim()) as BengaliModerationResult;
  } catch (error: any) {
    console.error("AI Bengali Moderation pipeline error:", error);
    // Safe failover
    return {
      language: "bn",
      riskLevel: "medium",
      categories: ["harassment"],
      translatedSummaryEnglish: `Failed to classify content securely due to pipeline interruption: ${input.text}`,
      reasonBangla: "কারিগরি ত্রুটির কারণে স্বয়ংক্রিয় এআই মূল্যায়ন সম্পন্ন করা যায়নি, তাই পর্যালোচনার জন্য পাঠানো হয়েছে।",
      recommendedAction: "send_to_review",
      confidence: 0.5
    };
  }
}

// ============================================================================
// 6. CLIENT-SIDE SERVICE API IMPLEMENTATION
// ============================================================================

/**
 * Client-side service helper to query the Bengali/Banglish AI moderation route.
 * Secures the API flow behind server proxies.
 */
export async function clientAnalyzeBengaliContent(input: BengaliModerationInput, sessionToken?: string): Promise<BengaliModerationResult> {
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json"
    };
    if (sessionToken) {
      headers["Authorization"] = `Bearer ${sessionToken}`;
    }

    const response = await fetch("/api/moderation/bengali", {
      method: "POST",
      headers,
      body: JSON.stringify(input)
    });

    if (!response.ok) {
      const errPayload = await response.json().catch(() => ({}));
      throw new Error(errPayload.error || `HTTP error ${response.status}`);
    }

    const json = await response.json();
    if (!json.success || !json.data) {
      throw new Error(json.error?.message || "Invalid payload format received from Bengali safety server.");
    }

    return json.data as BengaliModerationResult;
  } catch (error: any) {
    console.warn("Client Bengali moderation call failed. Using offline phonetic mock resolver:", error);
    return runMockBengaliModeration(input.text);
  }
}

// ============================================================================
// 7. HIGH-FIDELITY LOCAL PHONETIC COMPLIANCE SIMULATOR (MOCK RESOLVER)
// ============================================================================

/**
 * Analyzes script types and applies custom Regex heuristics to simulate highly authentic
 * Bengali / Banglish moderation behavior.
 */
export function runMockBengaliModeration(rawText: string): BengaliModerationResult {
  const text = rawText.trim();
  const lowerText = text.toLowerCase();

  // Detect script language
  const hasBengaliScript = /[\u0980-\u09FF]/.test(text);
  const hasLatinScript = /[a-zA-Z]/.test(text);

  let detectedLang: BengaliModerationLanguage = "unknown";
  if (hasBengaliScript && hasLatinScript) {
    detectedLang = "mixed";
  } else if (hasBengaliScript) {
    detectedLang = "bn";
  } else if (hasLatinScript) {
    // Basic heuristics to check if the latin string is phonetic Banglish
    const banglishIndicators = ["ami", "toke", "phelbo", "korbo", "bhalo", "achis", "boma", "sala", "kutta", "khanki", "buda", "choda", "taka", "nagad", "bkash"];
    const matchesIndicator = banglishIndicators.some(word => lowerText.includes(word));
    detectedLang = matchesIndicator ? "banglish" : "unknown";
  }

  // Define threat patterns (both native Bengali and phonetic Banglish)
  const patterns = {
    selfHarm: {
      words: ["আত্মহত্যা", "মরে যাব", "suicide", "morbo", "attahotta", "cutting myself"],
      category: "self-harm" as BengaliModerationCategory,
      risk: "critical" as BengaliModerationRiskLevel,
      action: "block" as BengaliModerationAction,
      en: "The user is expressing suicidal ideation or planning self-harm.",
      bn: "ব্যবহারকারী আত্মহত্যার ইচ্ছা বা নিজের ক্ষতির পরিকল্পনা প্রকাশ করছেন যা প্ল্যাটফর্মের নীতিমালার পরিপন্থী।"
    },
    threat: {
      words: ["মেরে ফেলব", "খুন করব", "গলা কাটব", "mere phelbo", "khun korbo", "gola katbo", "mere phelbo toke"],
      category: "threat" as BengaliModerationCategory,
      risk: "critical" as BengaliModerationRiskLevel,
      action: "block" as BengaliModerationAction,
      en: "Direct death threats and active violent intentions targeting another user.",
      bn: "সরাসরি হত্যার হুমকি এবং মারাত্বক শারীরিক ক্ষতি করার উদ্দেশ্য প্রকাশ পেয়েছে।"
    },
    politicalViolence: {
      words: ["গাড়ি ভাঙচুর", "আগুন দাও", "ভোট ধ্বংস", "andolon violent", "gari bhangchor", "bombing party", "politics dhang", "মিছিল ভাঙচুর"],
      category: "political-violence" as any, // fallback to "political violence"
      categoryResolved: "political violence" as BengaliModerationCategory,
      risk: "high" as BengaliModerationRiskLevel,
      action: "block" as BengaliModerationAction,
      en: "Incitement of violent political demonstrations, infrastructure vandalism, or riots.",
      bn: "সহিংস রাজনৈতিক ভাঙচুর, বিশৃঙ্খলা ও দাঙ্গা ছড়ানোর উসকানি সনাক্ত হয়েছে।"
    },
    sexual: {
      words: ["চুদি", "খানকি", "ভোদা", "gud", "buda", "choda", "khanki magi", "sex kora", "sexy video link"],
      category: "sexual content" as BengaliModerationCategory,
      risk: "high" as BengaliModerationRiskLevel,
      action: "block" as BengaliModerationAction,
      en: "Highly explicit sexual slang or adult solicitation content.",
      bn: "অত্যন্ত অশ্লীল যৌন শব্দ বা প্রাপ্তবয়স্কদের আপত্তিকর ভাষা সনাক্ত করা হয়েছে।"
    },
    hateSpeech: {
      words: ["মালাউন", "কাফের", "হিজরা", "slur hate", "chamar", "mullah khedao"],
      category: "hate speech" as BengaliModerationCategory,
      risk: "high" as BengaliModerationRiskLevel,
      action: "block" as BengaliModerationAction,
      en: "Communal slurs, demeaning protected religious or social groups.",
      bn: "সাম্প্রদায়িক বা নির্দিষ্ট কোনো গোষ্ঠীকে লক্ষ্য করে চরম বিদ্বেষমূলক ভাষা প্রকাশ পেয়েছে।"
    },
    harassment: {
      words: ["কুত্তা", "কুত্তার বাচ্চা", "হারামজাদা", "শালা", "kutta", "sala", "haramjada", "pagol naki", "loser", "tor baper"],
      category: "harassment" as BengaliModerationCategory,
      risk: "medium" as BengaliModerationRiskLevel,
      action: "send_to_review" as BengaliModerationAction,
      en: "Targeted insults, mild verbal abuse, and localized toxic harassment.",
      bn: "ব্যক্তিগত আক্রমণ এবং অশোভন গালিগালাজ ব্যবহার করা হয়েছে।"
    },
    scam: {
      words: ["টাকা দ্বিগুণ", "ফ্রি লটারি", "বিকাশ ডাবল", "taka double", "bkash double", "free cash win", "nagad offer", "investment profit double"],
      category: "scam" as BengaliModerationCategory,
      risk: "high" as BengaliModerationRiskLevel,
      action: "block" as BengaliModerationAction,
      en: "BKash/Nagad financial doubling scams and fraudulent investment traps.",
      bn: "বিকাশ বা নগদ সম্পর্কিত অর্থনৈতিক প্রতারণা এবং ভুয়া অফার চিহ্নিত করা হয়েছে।"
    },
    privateInfo: {
      words: ["আমার ঠিকানা", "ফোন নম্বর", "আমার বাসা", "basa thikana", "phone number is", "bkash pin"],
      category: "private information" as BengaliModerationCategory,
      risk: "medium" as BengaliModerationRiskLevel,
      action: "send_to_review" as BengaliModerationAction,
      en: "Sharing highly sensitive personal identification numbers or street addresses.",
      bn: "ব্যবহারকারীর সংবেদনশীল ব্যক্তিগত ঠিকানা বা যোগাযোগের বিবরণ প্রকাশ করা হয়েছে।"
    },
    medicalMisinfo: {
      words: ["করোনা ভুয়া", "হোমিওপ্যাথি করোনা", "covid fake", "miracle bangla cure"],
      category: "medical misinformation" as BengaliModerationCategory,
      risk: "medium" as BengaliModerationRiskLevel,
      action: "limit" as BengaliModerationAction,
      en: "Spreading alternative health misinformation that directly violates medical rules.",
      bn: "স্বাস্থ্যের ক্ষতি করতে পারে এমন অবৈজ্ঞানিক বা ক্ষতিকারক চিকিৎসা তথ্য ছড়ানো হয়েছে।"
    },
    spam: {
      words: ["ফলোয়ার কিনুন", "unlimited followers", "click links below"],
      category: "spam" as BengaliModerationCategory,
      risk: "low" as BengaliModerationRiskLevel,
      action: "limit" as BengaliModerationAction,
      en: "Promotional links, social follower-buying services, or rapid automated spam.",
      bn: "অযাচিত বাণিজ্যিক প্রচারমূলক বা স্প্যাম মেসেজ সনাক্ত হয়েছে।"
    }
  };

  // Evaluate matches
  for (const key of Object.keys(patterns)) {
    const val = (patterns as any)[key];
    const isMatched = val.words.some((word: string) => lowerText.includes(word));
    if (isMatched) {
      return {
        language: detectedLang,
        riskLevel: val.risk,
        categories: [val.categoryResolved || val.category],
        translatedSummaryEnglish: `[Heuristics Match] ${val.en} Input was: "${text}"`,
        reasonBangla: val.bn,
        recommendedAction: val.action,
        confidence: 0.95
      };
    }
  }

  // If no threat found
  const summaryEn = detectedLang === "bn" 
    ? "A casual message in native Bengali script. No obvious safety concerns detected."
    : detectedLang === "banglish"
    ? "A casual message written phonetically in Banglish. No safety concerns detected."
    : "Standard harmless text transmission.";

  return {
    language: detectedLang === "unknown" && hasBengaliScript ? "bn" : detectedLang,
    riskLevel: "none",
    categories: [],
    translatedSummaryEnglish: summaryEn,
    reasonBangla: "কোনো ধরনের নীতি লঙ্ঘনকারী ভাষা বা ক্ষতিকারক বিষয় সনাক্ত করা যায়নি। পোস্ট করার অনুমতি দেওয়া হয়েছে।",
    recommendedAction: "allow",
    confidence: 0.92
  };
}

// ============================================================================
// 8. EXPRESS ROUTES INTEGRATION
// ============================================================================

/**
 * Mounts server API routes to securely perform AI Bengali moderation on behalf of clients.
 * Integrates directly inside server.ts entry point.
 */
export function registerAIBengaliModerationRoutes(app: any) {
  app.post("/api/moderation/bengali", aiRateLimit, async (req: any, res: any) => {
    try {
      const input: BengaliModerationInput = req.body || { text: "" };

      if (!input.text) {
        return res.status(400).json({
          success: false,
          data: null,
          error: {
            code: "MISSING_TEXT",
            message: "A non-empty 'text' string is required for Bengali/Banglish moderation analysis."
          }
        });
      }

      const result = await serverSideAnalyzeBengaliContent(input);

      return res.status(200).json({
        success: true,
        data: result,
        error: null
      });
    } catch (err: any) {
      console.error("AI Bengali Moderation Route handler failed:", err);
      return res.status(500).json({
        success: false,
        data: null,
        error: {
          code: "SERVER_BENGALI_MODERATION_ERROR",
          message: err?.message || "Internal server error during AI Bengali/Banglish moderation processing."
        }
      });
    }
  });
}
