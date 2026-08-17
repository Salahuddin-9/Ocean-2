/**
 * Turtle Social Media Application - AI Caption Suggestion Engine
 * 
 * This file contains the core backend logic, type definitions, safety rules,
 * validation schemes, and AI integration for Turtle's AI Caption Suggestion Engine.
 * 
 * -----------------------------------------------------------------------------------------
 * ARCHITECTURAL GUIDELINES:
 * 1. Suggestions Only: This engine does NOT auto-fill the final caption or auto-publish.
 *    It merely returns highly structured caption style suggestions for user selection.
 * 2. Privacy First: The model is strictly instructed never to identify private people
 *    or infer sensitive personal traits (medical, orientation, political).
 * 3. Graceful Fallback: If the server is lacking a valid `GEMINI_API_KEY`, it falls back
 *    to a rich contextual mock generator to ensure development integrity remains unbroken.
 * -----------------------------------------------------------------------------------------
 */

import { GoogleGenAI, Type } from "@google/genai";
import { aiRateLimit } from './lib/aiRateLimit';

// ==========================================
// 1. DATA MODELS & TYPE DEFINITIONS
// ==========================================

export type MediaCategory = "PHOTO" | "VIDEO" | "REEL" | "GALLERY_IMAGE";

export interface AICaptionRequest {
  mediaCategory: MediaCategory;
  mediaMimeType: string;
  mediaSizeNewBytes?: number;
  /**
   * base64 representation of the media (image/frame) to analyze.
   * Required for real Gemini vision processing.
   */
  mediaBase64?: string;
  /**
   * Optional manual hint or user prompt to help guide the caption suggestions.
   */
  userHint?: string;
}

export interface CaptionStyleSuggestion {
  style: "catchy" | "minimal" | "trending" | "professional" | "funny";
  text: string;
}

export interface AICaptionResponse {
  detectedTopic: string;
  topicConfidence: number; // Score between 0.0 and 1.0
  captionSuggestions: [
    { style: "catchy"; text: string },
    { style: "minimal"; text: string },
    { style: "trending"; text: string },
    { style: "professional"; text: string },
    { style: "funny"; text: string }
  ];
  hashtags: string[];
  altText: string; // Accessibility description
  safetyReviewRequired: boolean;
  safetyFlags: string[];
  notes: string; // "uncertain" if confidence is low, or additional metadata
}

// ==========================================
// 2. GEMINI API STRUCTURED SCHEMA DEFINITION
// ==========================================

/**
 * Type-safe Response Schema matching the requested JSON output structure exactly.
 */
export const GEMINI_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  description: "Suggested caption analytics for Turtle Social Media.",
  properties: {
    detectedTopic: {
      type: Type.STRING,
      description: "Identified main topic, event, or object. Say 'uncertain' if unable to detect clearly."
    },
    topicConfidence: {
      type: Type.NUMBER,
      description: "Model confidence rating on the main topic, scaling from 0.0 (completely uncertain) to 1.0 (certain)."
    },
    captionSuggestions: {
      type: Type.ARRAY,
      description: "Must contain exactly 5 suggestions, one for each specific style: catchy, minimal, trending, professional, funny.",
      items: {
        type: Type.OBJECT,
        properties: {
          style: {
            type: Type.STRING,
            description: "Must be exactly one of: 'catchy', 'minimal', 'trending', 'professional', 'funny'."
          },
          text: {
            type: Type.STRING,
            description: "The caption text for the designated style. Do not wrap in quotation marks."
          }
        },
        required: ["style", "text"]
      }
    },
    hashtags: {
      type: Type.ARRAY,
      description: "An array of 3 to 6 highly relevant hashtags based on the content.",
      items: { type: Type.STRING }
    },
    altText: {
      type: Type.STRING,
      description: "A high-quality, objective accessibility alt text description of the media contents."
    },
    safetyReviewRequired: {
      type: Type.BOOLEAN,
      description: "True if content appears sensitive, potentially violates standard safety boundaries, or contains sensitive tags."
    },
    safetyFlags: {
      type: Type.ARRAY,
      description: "List of triggered issues (e.g. sensitive_imagery, commercial_advertising, offensive_concepts) if applicable.",
      items: { type: Type.STRING }
    },
    notes: {
      type: Type.STRING,
      description: "A context note. If the model is uncertain or the image is ambiguous, state that here."
    }
  },
  required: [
    "detectedTopic",
    "topicConfidence",
    "captionSuggestions",
    "hashtags",
    "altText",
    "safetyReviewRequired",
    "safetyFlags",
    "notes"
  ]
};

// ==========================================
// 3. SYSTEM INSTRUCTIONS (SAFETY & PRIVACY RULES)
// ==========================================

export const GEMINI_SYSTEM_INSTRUCTION = `
You are the high-performance AI Caption Suggestion Engine for Turtle, a visual social media platform.
Your task is to analyze media (such as photos, video frames, reels, or gallery images) and suggest high-quality captions.

CRITICAL LAWS OF EXECUTION:
1. NO AUTO-PUBLISHING OR AUTO-FILLING: Your only responsibility is to output multiple style options in structured JSON for the user to evaluate and select manually. Never speak directly as if you have published or saved the post.
2. PRIVACY ENFORCEMENT: Never identify private individuals, specific real names, or personal identities. Keep descriptions broad (e.g., "A person cooking", "A group enjoying outdoor activities").
3. NO SENSITIVE INFERENCES: Do not infer or label sensitive traits about individuals, including medical diagnoses, health issues, sexual orientation, political opinions, or religious beliefs.
4. ABSOLUTE SAFETY: Do not generate offensive, toxic, highly sensational, or illegal captions. Keep all text inclusive and friendly.
5. EXHAUSTIVE STYLES: You must provide exactly 5 distinct caption suggestions matching these specific styles:
   - catchy: Engaging, punchy, or clever hooks.
   - minimal: Super brief, artistic, one-line remarks.
   - trending: Playful, modern slang, or internet culture format.
   - professional: Elegant, polished, intellectual, or business-appropriate context.
   - funny: Lighthearted humor, subtle puns, or witty notes.
6. UNCERTAINTY DIRECTIVE: If you cannot identify the topic or object with at least 50% certainty, set "detectedTopic" to "uncertain", the "topicConfidence" to below 0.5, and mention the lack of clarity in your "notes".
7. HASHTAGS: Provide 3 to 6 hashtags without spaces or special symbols (e.g., "#ScenicViews").
8. ALT TEXT: Provide detailed, highly descriptive visual-accessibility alternative text describing the objects, environment, background colors, and composition of the media. Do not include opinions or marketing text.
9. SAFETY FLAGS: Scan the content for safety triggers. If there are indicators of sensitive themes or controversial topics, set safetyReviewRequired to true and specify why in safetyFlags.
10. Return strictly valid JSON matching the provided schema. No markdown wrapping or explanation outside of the JSON block.
`.trim();

// ==========================================
// 4. LAZY-INITIALIZED GEMINI CLIENT
// ==========================================

let geminiClient: GoogleGenAI | null = null;

/**
 * Lazily initializes the official @google/genai client with safety checks
 */
export function getGeminiClient(): GoogleGenAI {
  if (!geminiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY environment variable is not configured.");
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

// ==========================================
// 5. CORE FUNCTION: SUGGESTION PIPELINE
// ==========================================

/**
 * Process media and returns structured caption suggestions.
 * Uses real Gemini 3.5 Flash if API key is present; otherwise falls back to a realistic mock.
 */
export async function suggestAICaptions(
  req: AICaptionRequest,
  options?: { forceRealMode?: boolean }
): Promise<AICaptionResponse> {
  const hasApiKey = !!process.env.GEMINI_API_KEY;

  if (options?.forceRealMode && !hasApiKey) {
    throw new Error("Missing GEMINI_API_KEY. Cannot fulfill request in forced real mode.");
  }

  let result: AICaptionResponse;

  // Use real Gemini API
  if (hasApiKey) {
    result = await runRealGeminiAnalysis(req);
  } else {
    // Fallback to high-quality Mock analyzer
    result = runMockAnalysis(req);
  }

  // Programmatic confidence override gating:
  // If the AI's primary topic identification confidence score falls below 50% (0.50),
  // the system triggers a programmatic override, forcing the detectedTopic string to return "uncertain".
  if (result.topicConfidence < 0.50) {
    result.detectedTopic = "uncertain";
  }

  return result;
}

/**
 * Calls real server-side Gemini 3.5 Flash model
 */
async function runRealGeminiAnalysis(req: AICaptionRequest): Promise<AICaptionResponse> {
  const client = getGeminiClient();

  // Prepare multimodal parts
  const parts: any[] = [];

  if (req.mediaBase64) {
    parts.push({
      inlineData: {
        mimeType: req.mediaMimeType,
        data: req.mediaBase64
      }
    });
  }

  const promptText = `
Analyze this media content of category: ${req.mediaCategory}.
${req.userHint ? `User guidance/hint to incorporate: "${req.userHint}"` : "Provide generic, high-quality suggestions based on the media content."}
Return a structured caption recommendation following the predefined safety and formatting instructions.
  `.trim();

  parts.push({ text: promptText });

  try {
    const response = await client.models.generateContent({
      model: "gemini-3.5-flash",
      contents: { parts },
      config: {
        systemInstruction: GEMINI_SYSTEM_INSTRUCTION,
        responseMimeType: "application/json",
        responseSchema: GEMINI_RESPONSE_SCHEMA,
        temperature: 0.75
      }
    });

    const textOutput = response.text;
    if (!textOutput) {
      throw new Error("Empty response returned from Gemini API.");
    }

    const parsed = JSON.parse(textOutput.trim());
    return parsed as AICaptionResponse;
  } catch (error: any) {
    console.error("Gemini Caption Generation failed:", error);
    throw new Error(`AI analysis failed: ${error?.message || error}`);
  }
}

// ==========================================
// 6. RICH CONTEXTUAL MOCK GENERATOR
// ==========================================

/**
 * Generates highly realistic mocks based on categories and hints to maintain a fully functional app preview.
 */
function runMockAnalysis(req: AICaptionRequest): AICaptionResponse {
  const hint = (req.userHint || "").toLowerCase();
  
  // Default general mock options
  let detectedTopic = "Scenic Outdoors";
  let confidence = 0.85;
  let catchy = "Chasing sunsets and making memories.";
  let minimal = "Golden hour.";
  let trending = "This view is rent-free in my mind right now 🌅";
  let professional = "Reflecting on nature's design principles.";
  let funny = "I would tell a joke about the sun, but it's a bit too bright for me.";
  let hashtags = ["#GoldenHour", "#ScenicOutdoors", "#Aesthetic", "#Wanderlust"];
  let altText = "A beautiful wide-angle shot of a glowing orange horizon reflecting off a tranquil body of water, framed by silhouettes of pine trees.";
  let safetyReviewRequired = false;
  let safetyFlags: string[] = [];
  let notes = "Analyzed with default scenic mock parameters.";

  // Contextual modifications based on hints or categories
  if (hint.includes("coffee") || hint.includes("cafe") || hint.includes("morning")) {
    detectedTopic = "Coffee and Morning Routine";
    confidence = 0.95;
    catchy = "Fueling my ambition, one cup at a time ☕";
    minimal = "A fresh start.";
    trending = "Tell me you're a coffee enthusiast without telling me.";
    professional = "Starting the workday with optimal alignment and energy.";
    funny = "My blood type is currently espresso.";
    hashtags = ["#CoffeeLover", "#MorningVibes", "#ProductiveDay", "#CafeAesthetic"];
    altText = "A steaming white ceramic mug of latte art sitting on a clean, light oak table next to an open notebook and metal pen.";
  } else if (hint.includes("code") || hint.includes("work") || hint.includes("office") || hint.includes("setup")) {
    detectedTopic = "Productive Workspace Setup";
    confidence = 0.92;
    catchy = "Turning lines of code into solutions.";
    minimal = "Focus mode.";
    trending = "Clean setups increase productivity, it's a fact.";
    professional = "Streamlining architecture for highly scalable user experiences.";
    funny = "It compiles on my machine, so my job here is done.";
    hashtags = ["#CodingVibes", "#DeveloperSetup", "#WorkspaceGoals", "#TechLife"];
    altText = "A modern minimalist desk setup featuring a dual monitor configuration displaying dark-themed code, an ergonomic keyboard, and a soft ambient desk mat.";
  } else if (hint.includes("fitness") || hint.includes("gym") || hint.includes("workout") || hint.includes("run")) {
    detectedTopic = "Fitness and Training Activities";
    confidence = 0.90;
    catchy = "Pushing boundaries and breaking personal records.";
    minimal = "No excuses.";
    trending = "Active days are the best days, hands down ⚡";
    professional = "Consistency in physical performance mirrors dedication in project execution.";
    funny = "I'm only here for the post-workout meal.";
    hashtags = ["#FitnessJourney", "#ActiveLifestyle", "#NoLimits", "#GymVibes"];
    altText = "A pair of modern running shoes on a wet running track with athletic markers visible in the soft background blur.";
  } else if (req.mediaCategory === "REEL" || req.mediaCategory === "VIDEO") {
    detectedTopic = "Dynamic Movement Video";
    confidence = 0.78;
    catchy = "Action speaks louder than words. Press play!";
    minimal = "In motion.";
    trending = "Wait for the transition at the end! 🔥";
    professional = "A dynamic showcase of modern community interactions.";
    funny = "Behind the scenes of me trying not to drop the camera.";
    hashtags = ["#ReelVideo", "#InMotion", "#DynamicMedia", "#ViralReels"];
    altText = "A high-frame-rate vertical video sequence showcasing urban life transitions and motion elements.";
    notes = "Simulated dynamic video temporal analysis parameters.";
  }

  // Handle uncertainty request rule
  if (hint.includes("uncertain") || hint.includes("confused") || hint.includes("blurry")) {
    detectedTopic = "uncertain";
    confidence = 0.23;
    catchy = "An abstract perspective on life.";
    minimal = "Blurry focus.";
    trending = "If you look closely enough, it might make sense.";
    professional = "Unstructured data anomalies requiring manual inspection.";
    funny = "When your camera autofocus decides to take a coffee break.";
    hashtags = ["#Abstract", "#VisualMystery", "#UnknownVibe"];
    altText = "An ambiguous, out-of-focus background with scattered light bokeh and undefined abstract shapes.";
    notes = "Uncertainty triggered due to ambiguous input indicators.";
  }

  return {
    detectedTopic,
    topicConfidence: confidence,
    captionSuggestions: [
      { style: "catchy", text: catchy },
      { style: "minimal", text: minimal },
      { style: "trending", text: trending },
      { style: "professional", text: professional },
      { style: "funny", text: funny }
    ],
    hashtags,
    altText,
    safetyReviewRequired,
    safetyFlags,
    notes
  };
}

// ==========================================
// 7. EXPRESS SERVER API INTEGRATION
// ==========================================

/**
 * Creates standard Express API routing handlers to process client requests.
 * Keeps your API keys absolutely hidden server-side.
 */
/**
 * Shared caption-suggestion handler. `mediaBase64` is optional: when omitted
 * (no attached image) the engine still returns keyword/template-based captions
 * from `runMockAnalysis` — so the endpoint always works, key or no key.
 */
async function handleCaptionRequest(req: any, res: any) {
  try {
    const { mediaCategory, mediaMimeType, mediaBase64, userHint } = req.body;

    if (!mediaCategory || !mediaMimeType) {
      return res.status(400).json({
        success: false,
        error: "Missing required payload parameters: mediaCategory and mediaMimeType are mandatory."
      });
    }

    const suggestions = await suggestAICaptions({
      mediaCategory,
      mediaMimeType,
      mediaBase64,
      userHint
    });

    return res.status(200).json({
      success: true,
      data: suggestions
    });
  } catch (err: any) {
    console.error("Express route caption engine error:", err);
    return res.status(500).json({
      success: false,
      error: err?.message || "Internal server caption generator error."
    });
  }
}

export function registerAICaptionRoutes(app: any) {
  app.post("/api/ai/suggest-captions", aiRateLimit, handleCaptionRequest);
  // Short alias the post composer calls (feature #87): same engine, so caption
  // suggestions + hashtags work even with no GEMINI_API_KEY (local fallback).
  app.post("/api/ai/caption", aiRateLimit, handleCaptionRequest);
}
