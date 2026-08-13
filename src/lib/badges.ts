// Badges/gamification engine (ported from arena-ai-glm5.2-social-media).
export interface Badge {
  id: string;
  label: string;
  emoji: string;
  description: string;
  earned: boolean;
  progress?: number; // 0..1
}

interface BadgeInput {
  postsCount?: number | null;
  followersCount?: number | null;
  networkStrength?: number | null;
  trustScore?: number | null;
  activeTimeScore?: number | null;
  locationVerified?: boolean | null;
  verified?: boolean | null;
  twoFactorEnabled?: boolean | null;
  createdAt?: Date | string | null;
}

export function computeBadges(u: BadgeInput): Badge[] {
  const posts = Number(u.postsCount ?? 0);
  const followers = Number(u.followersCount ?? 0);
  const network = Number(u.networkStrength ?? 0);
  const trust = Number(u.trustScore ?? 50);
  const ats = Number(u.activeTimeScore ?? 0);

  const clamp = (v: number) => Math.max(0, Math.min(1, v));

  return [
    { id: "first", label: "First Spark", emoji: "✨", description: "Published your first post", earned: posts >= 1, progress: clamp(posts / 1) },
    { id: "storyteller", label: "Storyteller", emoji: "📚", description: "Shared 10 posts", earned: posts >= 10, progress: clamp(posts / 10) },
    { id: "rising", label: "Rising Star", emoji: "🌟", description: "Reached 25 followers", earned: followers >= 25, progress: clamp(followers / 25) },
    { id: "popular", label: "Crowd Favorite", emoji: "🔥", description: "Reached 250 followers", earned: followers >= 250, progress: clamp(followers / 250) },
    { id: "connector", label: "Connector", emoji: "🤝", description: "Network strength of 30+", earned: network >= 30, progress: clamp(network / 30) },
    { id: "trusted", label: "Trusted Voice", emoji: "🛡️", description: "Trust score above 80", earned: trust >= 80, progress: clamp((trust - 50) / 30) },
    { id: "active", label: "Always On", emoji: "⚡", description: "Active time score of 200+", earned: ats >= 200, progress: clamp(ats / 200) },
    { id: "verified", label: "Identity Verified", emoji: "✅", description: "Verified location", earned: Boolean(u.locationVerified), progress: u.locationVerified ? 1 : 0 },
    { id: "security", label: "Security Pro", emoji: "🔐", description: "Enabled two-factor auth", earned: Boolean(u.twoFactorEnabled), progress: u.twoFactorEnabled ? 1 : 0 },
    { id: "verified-acc", label: "Verified Account", emoji: "✔️", description: "Officially verified", earned: Boolean(u.verified), progress: u.verified ? 1 : 0 },
  ];
}
