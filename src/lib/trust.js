const db = globalThis.__B44_DB__ || { auth:{ isAuthenticated: async()=>false, me: async()=>null }, entities:new Proxy({}, { get:()=>({ filter:async()=>[], get:async()=>null, create:async()=>({}), update:async()=>({}), delete:async()=>({}) }) }), integrations:{ Core:{ UploadFile:async()=>({ file_url:'' }) } } };


// Three-tier trust metrics: ATS (active time), TS (reputation), N (network).
export async function computeTrustMetrics(userId) {
  if (!userId) return { ats: 50, ts: 50, n: 50 };
  try {
    const [posts, reports, user, friends, reactions] = await Promise.all([
      db.entities.Post.filter({ anonymous: false }, "-created_date", 300).catch(() => []),
      db.entities.Report.filter({ target_type: "user", target_id: userId }).catch(() => []),
      db.entities.User.get(userId).catch(() => null),
      db.entities.FriendRequest.filter({ status: "accepted" }).catch(() => []),
      db.entities.Reaction.filter({ target_type: "post" }).catch(() => []),
    ]);
    const myPosts = posts.filter((p) => p.created_by_id === userId);
    const ats = Math.max(
      10,
      Math.min(100, Math.round(50 + Math.min(40, myPosts.length * 6) + Math.min(10, myPosts.reduce((s, p) => s + (p.comment_count || 0), 0) * 0.5)))
    );
    const verifLevel = user?.verified ? 1 : 0;
    const ts = Math.max(0, Math.min(100, Math.round(50 + verifLevel * 20 - reports.length * 15)));
    const acceptedFriends = friends.filter((f) => f.from_id === userId || f.to_id === userId).length;
    const myPostIds = new Set(myPosts.map((p) => p.id));
    const positiveReactions = reactions.filter((r) => myPostIds.has(r.target_id)).length;
    const n = Math.max(0, Math.min(100, Math.round(acceptedFriends * 5 + positiveReactions * 0.5)));
    return { ats, ts, n };
  } catch {
    return { ats: 50, ts: 50, n: 50 };
  }
}

// Overall trust (average of the three) — kept for any legacy callers.
export async function computeTrust(userId) {
  const m = await computeTrustMetrics(userId);
  return Math.round((m.ats + m.ts + m.n) / 3);
}