/**
 * Turtle Social Media Application - Conversational AI Copilot (chatAiHelper)
 * 
 * This file contains the backend core implementation, prompt structures,
 * quadratic social context modes, and Express server endpoint integration for
 * the Dynamic Conversational AI Copilot.
 */

import { GoogleGenAI } from "@google/genai";
import { aiRateLimit } from './lib/aiRateLimit';

export interface ChatMessage {
  senderName: string;
  text: string;
}

export type SocialContextMode = "relation" | "fix" | "savage" | "fresh";

export interface CopilotRequest {
  messages: ChatMessage[];
  mode: SocialContextMode;
  temperature?: number;
}

export interface CopilotResponse {
  draftText: string;
  modeUsed: SocialContextMode;
  notes?: string;
}

// Map the quadratic social contexts to specific instructions and default temperatures
export const SOCIAL_CONTEXT_CONFIG: Record<
  SocialContextMode,
  { systemInstruction: string; defaultTemperature: number; description: string }
> = {
  relation: {
    defaultTemperature: 0.85,
    description: "Romantic, warm, charming drafting style optimized to show authentic relational interest.",
    systemInstruction: `
You are drafting a message in 'Relation' mode.
Your tone must be warm, romantic, charming, and deeply caring.
Express authentic relational interest, positivity, and a supportive, close connection.
Do not use dry or formal language. Keep it sweet, endearing, and emotionally present.
`.trim()
  },
  fix: {
    defaultTemperature: 0.6,
    description: "High-emotional intelligence, de-escalating, validating mediator designed to resolve tension or de-escalate arguments.",
    systemInstruction: `
You are drafting a message in 'Fix' mode.
Your tone must represent high emotional intelligence. You act as a validating, de-escalating mediator.
Acknowledge the other side's feelings, offer constructive paths forward, and resolve tension or conflicts peacefully.
Be diplomatic, calm, empathetic, and objective. Avoid escalating statements or blame.
`.trim()
  },
  savage: {
    defaultTemperature: 0.9,
    description: "Sharp, cheeky, witty, and sarcastic responses that remain safe (strictly avoiding harassment or toxic text).",
    systemInstruction: `
You are drafting a message in 'Savage' mode.
Your tone must be sharp, cheeky, witty, and delightfully sarcastic.
Deliver a clever, humorous burn or a sassy comeback.
CRITICAL SAFETY BOUNDARY: Do NOT cross into harassment, hate speech, bullying, toxicity, threats, or vulgarity. It must remain playful, safe, and lighthearted banter.
`.trim()
  },
  fresh: {
    defaultTemperature: 0.8,
    description: "Out-of-the-box reviving conversation starters centered around slow living, decentralized systems, and environmental consciousness.",
    systemInstruction: `
You are drafting a message in 'Fresh' mode.
Your goal is to revive a conversation or spark interest out-of-the-box.
Center your starters or suggestions around themes of slow living, organic growth, steady progress, decentralized systems, environmental consciousness, or harmony with nature.
Be thoughtful, original, intriguing, and forward-thinking.
`.trim()
  }
};

let geminiClient: GoogleGenAI | null = null;

function getGeminiClient(): GoogleGenAI {
  if (!geminiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not configured.");
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

/**
 * Main backend helper to invoke Gemini 3.5 Flash and generate raw message drafts.
 */
export async function draftCopilotResponse(req: CopilotRequest): Promise<CopilotResponse> {
  const config = SOCIAL_CONTEXT_CONFIG[req.mode] || SOCIAL_CONTEXT_CONFIG.fresh;
  const temp = req.temperature ?? config.defaultTemperature;

  // Convert active chat threads into chronological [Sender]: Text transcripts
  const transcript = req.messages
    .map(msg => `[${msg.senderName}]: ${msg.text}`)
    .join("\n");

  const prompt = `
Analyzing the following historical chat transcript:
---
${transcript}
---

Draft a single, appropriate response to the last message, continuing the conversation.
Follow these constraints strictly:
1. Tone/Style: Rely fully on the current mode instructions: ${config.systemInstruction}
2. Length: Maximum of 3 sentences.
3. Formatting: Return ONLY the raw conversational copy. Absolutely NO markdown tags, bold formatting, headers, or surrounding quotation marks. Just the direct text to be sent in chat.
  `.trim();

  const hasApiKey = !!process.env.GEMINI_API_KEY;

  if (hasApiKey) {
    try {
      const client = getGeminiClient();
      const response = await client.models.generateContent({
        model: "gemini-3.5-flash",
        contents: prompt,
        config: {
          temperature: temp,
          systemInstruction: `You are an expert messaging co-pilot. Your job is to draft raw, high-quality, conversational responses conforming to strict length constraints (maximum of 3 sentences) and specific stylistic boundaries. Never output quotes, headers, or markdown.`
        }
      });

      let text = response.text || "";
      // Clean up any stray quotes, markdown, or headers
      text = cleanDraftResponse(text);

      return {
        draftText: text,
        modeUsed: req.mode
      };
    } catch (err: any) {
      console.error("Gemini Copilot generation failed, falling back to mock:", err);
    }
  }

  // Fallback / Mock Generator when API key is missing or fails
  const mockText = generateMockDraft(req.messages, req.mode);
  return {
    draftText: mockText,
    modeUsed: req.mode,
    notes: "Generated by secure contextual copilot simulator."
  };
}

/**
 * Removes markdown formatting, surrounding quotes, or preamble from model output.
 */
function cleanDraftResponse(text: string): string {
  let cleaned = text.trim();
  
  // Remove markdown quotes if wrapped in ``` or similar
  cleaned = cleaned.replace(/^```[a-z]*\n?/i, "").replace(/\n?```$/, "");
  
  // Remove outer quotes if the model wrapped the entire response in double or single quotes
  if (cleaned.startsWith('"') && cleaned.endsWith('"')) {
    cleaned = cleaned.slice(1, -1).trim();
  } else if (cleaned.startsWith("'") && cleaned.endsWith("'")) {
    cleaned = cleaned.slice(1, -1).trim();
  }
  
  // Cut down to maximum 3 sentences just in case
  const sentences = cleaned.match(/[^.!?]+[.!?]+(\s|$)/g) || [cleaned];
  if (sentences.length > 3) {
    cleaned = sentences.slice(0, 3).join("").trim();
  }

  return cleaned;
}

/**
 * Generate highly context-aware mocks when Gemini API is unavailable.
 */
function generateMockDraft(history: ChatMessage[], mode: SocialContextMode): string {
  const lastMsg = history[history.length - 1];
  const lastText = (lastMsg?.text || "").toLowerCase();
  const partnerName = lastMsg?.senderName || "Friend";

  switch (mode) {
    case "relation":
      if (lastText.includes("miss") || lastText.includes("see you")) {
        return `I miss you so much too, ${partnerName}. I've been thinking about you all day and can't wait until we get to spend some beautiful quiet time together.`;
      }
      return `That sounds so wonderful, ${partnerName}. Every time I talk to you, my day instantly gets so much brighter and more peaceful.`;

    case "fix":
      if (lastText.includes("angry") || lastText.includes("upset") || lastText.includes("late") || lastText.includes("why")) {
        return `I completely understand why you're upset, ${partnerName}, and your feelings are totally valid. I want to apologize for the misunderstanding, so let's chat through this and find a compromise that works for both of us.`;
      }
      return `Thank you for sharing your thoughts on this, ${partnerName}. I really value your perspective, and I'd love to take a step back and figure out how we can align on this together.`;

    case "savage":
      if (lastText.includes("smart") || lastText.includes("expert") || lastText.includes("know")) {
        return `Oh, so we're pretending to be experts now? I'd love to agree with you, ${partnerName}, but then we'd both be completely wrong.`;
      }
      return `Is that the best comeback you've got, ${partnerName}? I've seen slower-growing bonsai trees move faster than your logic.`;

    case "fresh":
    default:
      if (lastText.includes("bored") || lastText.includes("do") || lastText.includes("what")) {
        return `How about we step away from the screens, go for a quiet walk, and observe the slow, steady rhythm of nature? It's the perfect day to appreciate simple, decentralized living.`;
      }
      return `Let's focus on steady, sustainable progress and slow-living today. Taking simple, deliberate steps is always better than rushing into things.`;
  }
}

/**
 * Register Express endpoints for AI Chat Copilot
 */
export function registerChatAiHelperRoutes(app: any) {
  app.post("/api/ai/chat-copilot", aiRateLimit, async (req: any, res: any) => {
    try {
      const { messages, mode, temperature } = req.body;

      if (!messages || !Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({
          success: false,
          error: "Messages history array is required and cannot be empty."
        });
      }

      if (!mode) {
        return res.status(400).json({
          success: false,
          error: "Social context mode (relation, fix, savage, fresh) is required."
        });
      }

      const copilotResponse = await draftCopilotResponse({
        messages,
        mode,
        temperature
      });

      return res.status(200).json({
        success: true,
        data: copilotResponse
      });
    } catch (err: any) {
      console.error("Express route chat copilot error:", err);
      return res.status(500).json({
        success: false,
        error: err?.message || "Internal server chat copilot error."
      });
    }
  });
}
