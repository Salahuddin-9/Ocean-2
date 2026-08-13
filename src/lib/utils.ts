/* --------------------- className helper --------------------- */
export function cn(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

/* --------------------- Time formatting --------------------- */
export function timeAgo(date: Date | string | null): string {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  const seconds = Math.floor((Date.now() - d.getTime()) / 1000);
  if (seconds < 5) return "now";
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function formatCount(n: number): string {
  if (n < 1000) return `${n}`;
  if (n < 1_000_000) return `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}K`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

/* --------------------- Avatar gradient --------------------- */
const GRADIENTS = [
  "from-violet-500 to-fuchsia-500",
  "from-cyan-500 to-blue-500",
  "from-emerald-500 to-teal-500",
  "from-amber-500 to-orange-500",
  "from-rose-500 to-pink-500",
  "from-indigo-500 to-purple-500",
  "from-lime-500 to-green-500",
  "from-sky-500 to-indigo-500",
];

export function avatarGradient(seed: string): string {
  if (!seed) return GRADIENTS[0];
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return GRADIENTS[h % GRADIENTS.length];
}

export function initials(name: string): string {
  return name
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

/* --------------------- Content rendering --------------------- */
// Render #hashtags and @mentions as styled spans (returns HTML-safe structured tokens)
export function renderRichText(text: string) {
  const parts: { type: "text" | "mention" | "hashtag" | "link"; value: string }[] = [];
  const regex = /(#[\w]+|@[\w.-]+|https?:\/\/\S+)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: "text", value: text.slice(lastIndex, match.index) });
    }
    const v = match[0];
    if (v.startsWith("#")) parts.push({ type: "hashtag", value: v });
    else if (v.startsWith("@")) parts.push({ type: "mention", value: v });
    else parts.push({ type: "link", value: v });
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) parts.push({ type: "text", value: text.slice(lastIndex) });
  return parts;
}

/* --------------------- Misc --------------------- */
export const AVAILABILITY_OPTIONS = [
  { value: "available", label: "Available", color: "text-emerald-400", dot: "bg-emerald-400" },
  { value: "busy", label: "Busy", color: "text-rose-400", dot: "bg-rose-400" },
  { value: "freelance", label: "Freelance", color: "text-amber-400", dot: "bg-amber-400" },
  { value: "mentoring", label: "Mentoring", color: "text-sky-400", dot: "bg-sky-400" },
] as const;

export function availabilityMeta(value: string | null) {
  return AVAILABILITY_OPTIONS.find((o) => o.value === value) ?? AVAILABILITY_OPTIONS[0];
}

export function slugifyUsername(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 12);
}
