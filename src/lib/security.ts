// Security utilities (ported from arena-ai-glm5.2-social-media, made
// browser-safe — no Node crypto dependency).

/* --------------------- Region-Locked ID generation --------------------- */
// Format: CC-XX-XXX-XXXX-XX  e.g. BD-50-425-6388-54
export function generateRegionId(country: string): string {
  const cc = (country || "XX").toUpperCase().slice(0, 2);
  const rand = (len: number) =>
    Array.from({ length: len }, () => Math.floor(Math.random() * 10)).join("");
  return `${cc}-${rand(2)}-${rand(3)}-${rand(4)}-${rand(2)}`;
}

/* --------------------- Password validation --------------------- */
export interface PasswordCheck {
  valid: boolean;
  errors: string[];
  score: number; // 0-5
}

export function validatePassword(password: string): PasswordCheck {
  const errors: string[] = [];
  if (password.length < 10) errors.push("at least 10 characters");
  if (!/[A-Z]/.test(password)) errors.push("an uppercase letter");
  if (!/[a-z]/.test(password)) errors.push("a lowercase letter");
  if (!/[0-9]/.test(password)) errors.push("a number");
  if (!/[^A-Za-z0-9]/.test(password)) errors.push("a special character");

  let score = 0;
  if (password.length >= 10) score++;
  if (password.length >= 14) score++;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;

  return { valid: errors.length === 0, errors, score };
}

/* --------------------- BIP39-style recovery phrase --------------------- */
export const RECOVERY_WORDS: string[] = [
  "apple", "bridge", "castle", "dragon", "ember", "forest", "garden", "harbor",
  "island", "jungle", "kettle", "lantern", "meadow", "noble", "ocean", "palace",
  "quartz", "rivers", "shadow", "temple", "umber", "valley", "willow", "xylo",
  "yonder", "zenith", "amber", "beacon", "copper", "dawn", "eagle", "falcon",
  "glacier", "horizon", "ivory", "jasper", "kindle", "lunar", "marble", "north",
  "orchid", "pepper", "quiver", "raven", "silver", "thunder", "uranium", "violet",
  "walnut", "xenon", "yellow", "zephyr", "anchor", "blossom", "cedar", "dune",
  "echo", "fern", "granite", "hazel", "indigo", "jade", "kelp", "lava",
  "mango", "nectar", "opal", "prairie", "quail", "reef", "saffron", "tundra",
  "ullage", "vortex", "wheat", "yarrow", "zodiac", "azure", "birch", "coral",
  "delta", "elm", "frost", "gypsum", "heather", "iris", "juniper", "knot",
  "lemon", "maple", "nylon", "oasis", "palm", "quartz", "ridge", "sage",
  "talon", "umber", "vine", "wren", "ash", "bay", "cliff", "dusk",
];

export function generateRecoveryPhrase(wordCount = 12): string {
  const words: string[] = [];
  for (let i = 0; i < wordCount; i++) {
    words.push(RECOVERY_WORDS[Math.floor(Math.random() * RECOVERY_WORDS.length)]);
  }
  return words.join(" ");
}
