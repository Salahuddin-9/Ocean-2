/**
 * Ocean — Relationship Timeline (Feature 2)
 * ------------------------------------------
 * On a user profile, the "Timeline" tab answers "how do we know each other?" by
 * aggregating REAL signals already in the db:
 *   - first DM message date        (db.conversations + db.chatMessages)
 *   - first reaction on posts      (post.reactions / post.likes)
 *   - first audio/video call date  (db.callHistory)
 *   - common group chats, common friends, common interests
 *
 * Route:
 *   GET /api/users/:userId/timeline  (auth) — pair timeline with that user
 *   GET /api/me/timeline             (auth) — personal milestone timeline
 */
import express from 'express';
import { getCtx } from './turtleServerContext';

interface TimelineEvent {
  id: string;
  kind: 'message' | 'reaction' | 'call' | 'group' | 'friend' | 'interest' | 'joined' | 'first_post' | 'first_reel';
  icon: string;
  title: string;
  detail: string;
  timestamp: number;
}

function s(v: unknown, max: number): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

function numOf(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v) && v > 0) return v;
  if (typeof v === 'string') {
    const t = Date.parse(v);
    if (Number.isFinite(t)) return t;
  }
  return 0;
}

function push(list: TimelineEvent[], ev: TimelineEvent | null): void {
  if (ev && ev.timestamp > 0) list.push(ev);
}

function nameOf(u: any): string {
  return u ? u.name || u.username || 'User' : 'User';
}

export function registerRelationshipTimelineRoutes(app: express.Express): void {
  const { requireAuth, loadDatabase } = getCtx();

  app.get('/api/users/:userId/timeline', requireAuth, (req, res) => {
    const me = (req as any).user;
    const db = loadDatabase();
    const otherId = String(req.params.userId || '');
    if (otherId === me.id) {
      return buildPersonalTimeline(res, db, me);
    }
    const other = (db.users || []).find((u: any) => u && u.id === otherId);
    if (!other) return res.status(404).json({ error: 'User not found.' });

    const events: TimelineEvent[] = [];
    const summary: any = {};

    // 1. First DM message — any 2-person conversation containing both of us.
    const pairConvs = (db.conversations || []).filter(
      (c: any) =>
        Array.isArray(c.participants) &&
        c.participants.length === 2 &&
        c.participants.includes(me.id) &&
        c.participants.includes(otherId)
    );
    const convIds = new Set(pairConvs.map((c: any) => c.id));
    const chatMessages = (db.chatMessages || []).filter((m: any) => m && convIds.has(m.conversationId));
    const firstMsg = chatMessages
      .filter((m: any) => m.senderId === me.id || m.senderId === otherId)
      .sort((a: any, b: any) => numOf(a.timestamp) - numOf(b.timestamp))[0];
    if (firstMsg) {
      summary.firstMessageAt = numOf(firstMsg.timestamp);
      push(events, {
        id: `ev-msg-${firstMsg.id || Date.now()}`,
        kind: 'message',
        icon: '💬',
        title: 'First message',
        detail: `You and ${nameOf(other)} first messaged each other.`,
        timestamp: numOf(firstMsg.timestamp),
      });
    }

    // 2. First reaction — scan posts by either author for reactions by the other.
    let firstReactionAt = 0;
    const scanReactions = (posts: any[], authorName: string) => {
      for (const p of posts || []) {
        if (!p) continue;
        const t = numOf(p.timestamp || p.createdAt);
        if (t <= 0) continue;
        const reacts = p.reactions;
        let reactedByOther = false;
        if (reacts && typeof reacts === 'object') {
          for (const key of Object.keys(reacts)) {
            const arr = reacts[key];
            if (Array.isArray(arr) && arr.includes(me.id)) reactedByOther = true;
          }
        }
        const likesArr = p.likes;
        if (Array.isArray(likesArr) && likesArr.includes(me.id)) reactedByOther = true;
        if (reactedByOther && (firstReactionAt === 0 || t < firstReactionAt)) firstReactionAt = t;
      }
    };
    for (const u of db.users || []) {
      if (u && u.id === otherId) scanReactions(u.profile?.posts, nameOf(u));
    }
    const meUser = (db.users || []).find((u: any) => u && u.id === me.id);
    if (meUser) scanReactions(meUser.profile?.posts, 'your');
    if (firstReactionAt) {
      summary.firstReactionAt = firstReactionAt;
      push(events, {
        id: `ev-react-${firstReactionAt}`,
        kind: 'reaction',
        icon: '❤️',
        title: 'First reaction',
        detail: `You reacted to ${nameOf(other)}'s content for the first time.`,
        timestamp: firstReactionAt,
      });
    }

    // 3. First call — db.callHistory between the pair.
    const calls = (db.callHistory || []).filter(
      (c: any) =>
        c &&
        ((c.callerId === me.id && c.calleeId === otherId) || (c.callerId === otherId && c.calleeId === me.id))
    );
    const firstCall = calls.sort((a: any, b: any) => numOf(a.startedAt) - numOf(b.startedAt))[0];
    if (firstCall) {
      summary.firstCallAt = numOf(firstCall.startedAt);
      push(events, {
        id: `ev-call-${firstCall.id || Date.now()}`,
        kind: 'call',
        icon: firstCall.callType === 'audio' ? '📞' : '📹',
        title: `First ${firstCall.callType === 'audio' ? 'audio' : 'video'} call`,
        detail: `${Math.max(0, Math.round((firstCall.durationSec || 0) / 60))} min ${firstCall.callType === 'audio' ? 'call' : 'video call'} (${firstCall.status || 'completed'}).`,
        timestamp: numOf(firstCall.startedAt),
      });
    }

    // 4. Common groups.
    const commonGroups = (db.conversations || []).filter(
      (c: any) =>
        c &&
        c.type === 'group' &&
        Array.isArray(c.participants) &&
        c.participants.includes(me.id) &&
        c.participants.includes(otherId)
    );
    summary.commonGroups = commonGroups.length;
    for (const g of commonGroups.slice(0, 5)) {
      push(events, {
        id: `ev-group-${g.id}`,
        kind: 'group',
        icon: '👥',
        title: `Common group: ${s(g.name, 60) || 'Group chat'}`,
        detail: `You are both members of this group chat.`,
        timestamp: numOf(g.createdAt),
      });
    }

    // 5. Common friends + interests.
    const friendSets: string[][] = [];
    for (const u of [me, other]) {
      const direct = Array.isArray(u.friends) ? u.friends : [];
      const prof = Array.isArray(u.profile?.friends) ? u.profile.friends : [];
      friendSets.push([...direct, ...prof]);
    }
    const commonFriends = friendSets[0].filter((id) => friendSets[1].includes(id));
    summary.commonFriends = commonFriends.length;
    const myInterests = new Set((me.profile?.interests || []).map((i: string) => String(i).toLowerCase()));
    const commonInterests = (other.profile?.interests || []).filter((i: string) =>
      myInterests.has(String(i).toLowerCase())
    );
    summary.commonInterests = commonInterests;
    push(events, {
      id: `ev-friends-${otherId}`,
      kind: 'friend',
      icon: '🤝',
      title: `${commonFriends.length} mutual ${commonFriends.length === 1 ? 'friend' : 'friends'}`,
      detail: commonFriends.length
        ? 'You share mutual connections on Ocean.'
        : 'No mutual connections yet.',
      timestamp: 0,
    });
    if (commonInterests.length) {
      push(events, {
        id: `ev-interests-${otherId}`,
        kind: 'interest',
        icon: '🔖',
        title: `Shared interests: ${commonInterests.slice(0, 4).join(', ')}`,
        detail: 'Both of you follow these topics.',
        timestamp: 0,
      });
    }

    const ordered = events
      .filter((e) => e.timestamp > 0)
      .sort((a, b) => a.timestamp - b.timestamp);
    const noTime = events.filter((e) => e.timestamp === 0);
    res.json({ user: { id: other.id, name: nameOf(other) }, summary, timeline: [...ordered, ...noTime] });
  });

  // Personal milestone timeline for the logged-in user.
  function buildPersonalTimeline(res: express.Response, db: any, me: any) {
    const events: TimelineEvent[] = [];
    const joined = numOf(me.createdAt) || numOf(me.profile?.sinceDate);
    push(events, {
      id: `ev-joined-${me.id}`,
      kind: 'joined',
      icon: '🌊',
      title: 'Joined Ocean',
      detail: `${nameOf(me)} joined the community.`,
      timestamp: joined || Date.now(),
    });
    const myPosts = (me.profile?.posts || []).sort((a: any, b: any) => numOf(a.timestamp) - numOf(b.timestamp));
    const firstPost = myPosts[0];
    if (firstPost) {
      push(events, {
        id: `ev-post-${firstPost.id}`,
        kind: 'first_post',
        icon: '📝',
        title: 'First post',
        detail: s(firstPost.content || firstPost.title || '(media post)', 80),
        timestamp: numOf(firstPost.timestamp),
      });
    }
    const myCalls = (db.callHistory || []).filter((c: any) => c && c.callerId === me.id);
    const firstCall = myCalls.sort((a: any, b: any) => numOf(a.startedAt) - numOf(b.startedAt))[0];
    if (firstCall) {
      push(events, {
        id: `ev-mycall-${firstCall.id || Date.now()}`,
        kind: 'call',
        icon: '📞',
        title: 'First outgoing call',
        detail: `${firstCall.callType === 'audio' ? 'Audio' : 'Video'} call with ${s(firstCall.calleeId, 30)}.`,
        timestamp: numOf(firstCall.startedAt),
      });
    }
    const groups = (db.conversations || []).filter(
      (c: any) => c && c.type === 'group' && c.participants?.includes(me.id)
    );
    if (groups.length) {
      push(events, {
        id: `ev-mygroups-${me.id}`,
        kind: 'group',
        icon: '👥',
        title: `${groups.length} group ${groups.length === 1 ? 'chat' : 'chats'}`,
        detail: 'Groups you are a member of.',
        timestamp: 0,
      });
    }
    const ordered = events
      .filter((e) => e.timestamp > 0)
      .sort((a, b) => a.timestamp - b.timestamp);
    res.json({ user: { id: me.id, name: nameOf(me) }, summary: {}, timeline: [...ordered] });
  }

  app.get('/api/me/timeline', requireAuth, (req, res) => {
    const me = (req as any).user;
    const db = loadDatabase();
    return buildPersonalTimeline(res, db, me);
  });
}
