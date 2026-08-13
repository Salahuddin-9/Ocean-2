const db = globalThis.__B44_DB__ || { auth:{ isAuthenticated: async()=>false, me: async()=>null }, entities:new Proxy({}, { get:()=>({ filter:async()=>[], get:async()=>null, create:async()=>({}), update:async()=>({}), delete:async()=>({}) }) }), integrations:{ Core:{ UploadFile:async()=>({ file_url:'' }) } } };


// Banglish (romanized Bengali) profanity heuristic — offline fallback.
const BANGLA_BAD = ["mala", "harami", "boka", "chagol", "shala", "magi", "khanki", "chudi", "bichi", "bal", "kotha"];
const BANGLA_SCRIPT = /[\u0980-\u09FF]/;

function heuristic(text) {
  const t = text.toLowerCase();
  const hits = BANGLA_BAD.filter((w) => new RegExp(`\\b${w}\\b`).test(t));
  const isBn = BANGLA_SCRIPT.test(text);
  if (hits.length > 0) {
    return {
      flagged: true,
      categories: ["profanity_bangla"],
      severity: hits.length > 1 ? "high" : "medium",
      suggestion: "Possible Bengali/Banglish profanity — review before publishing.",
      language: "banglish",
      reasonBangla: "সম্ভাব্য আপত্তিকর ভাষা শনাক্ত হয়েছে।",
      recommendedAction: "send_to_review",
    };
  }
  return { flagged: false, language: isBn ? "bn" : "en" };
}

// AI content moderation scan (English + Bengali/Banglish).
// Returns { flagged, categories, severity, suggestion, language, reasonBangla, recommendedAction }.
export async function scanContent(text) {
  if (!text || text.trim().length < 5) return { flagged: false };
  try {
    const res = await db.integrations.Core.InvokeLLM({
      prompt: `You moderate a calm, safe social network with Bengali and Banglish (romanized Bengali) support. Analyze this post for hate, threats, harassment, sexual content, spam, or self-harm in English, Bengali script, and Banglish. Respond ONLY with JSON. Post: """${text}"""`,
      response_json_schema: {
        type: "object",
        properties: {
          flagged: { type: "boolean" },
          categories: { type: "array", items: { type: "string" } },
          severity: { type: "string", enum: ["low", "medium", "high"] },
          language: { type: "string", enum: ["en", "bn", "banglish"] },
          reasonBangla: { type: "string" },
          suggestion: { type: "string" },
          recommendedAction: { type: "string", enum: ["allow", "limit", "send_to_review", "block"] },
        },
      },
    });
    if (res && typeof res === "object") {
      return {
        flagged: !!res.flagged,
        categories: res.categories || [],
        severity: res.severity || "low",
        suggestion: res.suggestion || "",
        language: res.language || (BANGLA_SCRIPT.test(text) ? "bn" : "en"),
        reasonBangla: res.reasonBangla || "",
        recommendedAction: res.recommendedAction || "allow",
      };
    }
    return heuristic(text);
  } catch {
    return heuristic(text);
  }
}