import { WebSocket, WebSocketServer } from 'ws';
import * as fs from 'fs';
import * as path from 'path';
import { draftCopilotResponse } from './src/turtleChatAiHelper.js';
// Azan auto-mute (feature 223): per-recipient notification suppression during
// prayer windows. Pure helper — no routes, no side effects at import.
import { azanMuteMapForUsers } from './src/turtleAzanBackend.js';

// Load and save DB functions to match server.ts
const DB_FILE = path.join(process.cwd(), 'database.json');

let externalSaveDatabase: ((db: any) => void) | null = null;
let externalGetUserIdFromToken: ((token: string) => string | null) | null = null;

export function setExternalSaveDatabase(fn: (db: any) => void) {
  externalSaveDatabase = fn;
}

export function setExternalTokenValidator(fn: (token: string) => string | null) {
  externalGetUserIdFromToken = fn;
}

function loadDatabase() {
  try {
    if (!fs.existsSync(DB_FILE)) {
      return { users: [], messages: [], conversations: [], chatMessages: [] };
    }
    const data = fs.readFileSync(DB_FILE, 'utf8');
    const db = JSON.parse(data);
    if (!db.conversations) db.conversations = [];
    if (!db.chatMessages) db.chatMessages = [];
    return db;
  } catch (e) {
    return { users: [], messages: [], conversations: [], chatMessages: [] };
  }
}

function saveDatabase(db: any) {
  try {
    if (externalSaveDatabase) {
      externalSaveDatabase(db);
    } else {
      fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8');
    }
  } catch (e) {
    console.error('Failed to save database in chatServer:', e);
  }
}

function addNotification(db: any, targetUserId: string, type: string, actor: { id: string, name: string }, extra: { postId?: string, postTitle?: string, interestText?: string } = {}) {
  if (actor.id === targetUserId) return;
  const targetUser = db.users.find((u: any) => u.id === targetUserId);
  if (!targetUser) return;

  targetUser.notifications = targetUser.notifications || [];

  const existingIndex = targetUser.notifications.findIndex((n: any) => {
    if (n.isRead) return false;
    if (n.type !== type) return false;
    return true;
  });

  const msgPreview = extra.interestText ? `: "${extra.interestText.substring(0, 25)}${extra.interestText.length > 25 ? '...' : ''}"` : '';

  if (existingIndex !== -1) {
    const n = targetUser.notifications[existingIndex];
    if (!n.actorIds.includes(actor.id)) {
      n.actorIds.push(actor.id);
      n.actorNames.push(actor.name);
    }
    n.timestamp = Date.now();
    const count = n.actorNames.length;
    const othersCount = count - 1;
    const firstActorName = n.actorNames[0];
    n.message = count > 1
      ? `${firstActorName} and ${othersCount} other${othersCount > 1 ? 's' : ''} sent you messages${msgPreview}`
      : `${firstActorName} sent you a message${msgPreview}`;

    targetUser.notifications.splice(existingIndex, 1);
    targetUser.notifications.unshift(n);
  } else {
    targetUser.notifications.unshift({
      id: `notif-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      type,
      message: `${actor.name} sent you a message${msgPreview}`,
      actorIds: [actor.id],
      actorNames: [actor.name],
      timestamp: Date.now(),
      isRead: false
    });
  }
}

// In-memory active sockets and typing users
// userId -> Set of WebSockets
const userConnections = new Map<string, Set<WebSocket>>();
// userId -> username
const onlineUsers = new Map<string, string>();
// userId -> number (timestamp)
const lastSeenUsers = new Map<string, number>();
// conversationId -> Set of userIds who are typing
const typingStates = new Map<string, Set<string>>();
// boardId -> Set of WebSockets subscribed to a shared whiteboard (feature 109)
const whiteboardRooms = new Map<string, Set<WebSocket>>();
// ── Meet room mesh signaling (SimpleWebRTC-style group video rooms) ────────
// roomId -> userId -> { name } (the authoritative membership list per room).
// Signaling itself is stateless: 'sending-signal' is relayed straight to the
// target's live sockets. Membership drives the 'all-users' snapshot, the
// 'user-connected' fan-out, and disconnect cleanup.
const meetRooms = new Map<string, Map<string, { name: string }>>();
// userId -> Set<roomId> — reverse index so a dropped socket can clean up
// every room it joined without scanning all rooms.
const userMeetRooms = new Map<string, Set<string>>();
// Track simulated online users to make the network feel alive in real-time
const simulatedOnlineUsers = new Set<string>();
// Caller of last resort for busy detection: userId -> outstanding offer
// (callId + expiry). Tracks a user's live ring so a SECOND caller hears
// call_busy instead of getting an unanswered offer (Tinode 486 semantics).
// Cleared when the ring resolves (answer/cancel/end) or after 45s.
const busyCalls = new Map<string, { callId: string; expires: number }>();

let triggerSimulatedReplyBridge: any = null;

export function setupChatServer(server: any) {
  const wss = new WebSocketServer({ noServer: true });

  // Handle server upgrade request
  server.on('upgrade', (request: any, socket: any, head: any) => {
    // Only upgrade ws paths. A malformed request or a socket that died before
    // the upgrade completed must never crash the process (common over Ngrok).
    try {
      const url = new URL(request.url, `http://${request.headers.host}`);
      if (url.pathname === '/ws/chat') {
        wss.handleUpgrade(request, socket, head, (ws) => {
          wss.emit('connection', ws, request);
        });
      }
    } catch (e) {
      console.error('WebSocket upgrade error:', e);
      try { socket.destroy(); } catch { /* ignore */ }
    }
  });

  wss.on('connection', (ws: WebSocket) => {
    let authenticatedUserId: string | null = null;

    ws.on('message', async (messageData: string) => {
      try {
        const payload = JSON.parse(messageData);
        const { type } = payload;

        if (type === 'auth') {
          const { token } = payload;
          if (!token) {
            ws.send(JSON.stringify({ type: 'error', message: 'Authentication token required' }));
            return;
          }

          // Validate token against server's session store
          if (externalGetUserIdFromToken) {
            const validatedUserId = externalGetUserIdFromToken(token);
            if (!validatedUserId) {
              ws.send(JSON.stringify({ type: 'error', message: 'Session expired or invalid. Please login again.' }));
              return;
            }
            authenticatedUserId = validatedUserId;
          } else {
            // Fallback: token validator not configured — reject for security
            ws.send(JSON.stringify({ type: 'error', message: 'Authentication service unavailable.' }));
            return;
          }

          // Resolve username/name from DB for display
          const db = loadDatabase();
          const user = db.users.find((u: any) => u.id === authenticatedUserId);
          const username = user?.profile?.username || user?.username || '';
          const name = user?.name || username;

          if (!userConnections.has(authenticatedUserId)) {
            userConnections.set(authenticatedUserId, new Set());
          }
          userConnections.get(authenticatedUserId)!.add(ws);
          onlineUsers.set(authenticatedUserId, username || name);
          lastSeenUsers.delete(authenticatedUserId); // Active now

          // Broadcast user online status
          broadcast({
            type: 'presence',
            userId: authenticatedUserId,
            status: 'online',
            lastSeen: null
          });

          // Send confirmation + list of currently online users
          ws.send(JSON.stringify({
            type: 'auth_ok',
            onlineUserIds: Array.from(userConnections.keys())
          }));
          return;
        }

        // Below actions require authentication
        if (!authenticatedUserId) {
          ws.send(JSON.stringify({ type: 'error', message: 'Not authenticated' }));
          return;
        }

        if (type === 'typing') {
          const { conversationId, isTyping } = payload;
          if (!conversationId) return;

          if (!typingStates.has(conversationId)) {
            typingStates.set(conversationId, new Set());
          }

          const typers = typingStates.get(conversationId)!;
          if (isTyping) {
            typers.add(authenticatedUserId);
          } else {
            typers.delete(authenticatedUserId);
          }

          // Broadcast typing states to conversation participants
          const db = loadDatabase();
          const conv = db.conversations.find((c: any) => c.id === conversationId);
          if (conv) {
            const participantIds = conv.participants || [];
            sendToUsers(participantIds, {
              type: 'typing_state',
              conversationId,
              typers: Array.from(typers).map(uid => {
                const u = db.users.find((u: any) => u.id === uid);
                return {
                  id: uid,
                  name: u?.name || 'Someone',
                  username: u?.profile?.username || u?.username || ''
                };
              })
            });
          }
          return;
        }

        if (type === 'message') {
          const { conversationId, text, mediaUrl, mediaName, replyToMessageId, poll, forwardedFrom } = payload;
          if (!conversationId) return;

          const db = loadDatabase();
          const conv = db.conversations.find((c: any) => c.id === conversationId);
          if (!conv) {
            ws.send(JSON.stringify({ type: 'error', message: 'Conversation not found' }));
            return;
          }

          // Event-group archive guard (feature 11): archived event groups are read-only.
          if (conv.isEventGroup && (conv.archived || (conv.eventEndDate && Date.now() > conv.eventEndDate + 24 * 60 * 60 * 1000))) {
            ws.send(JSON.stringify({ type: 'error', message: 'This event group is archived — chat is read-only.' }));
            return;
          }

          // Channel check: Broadcast only channel allows posts from creator or admins only
          if (conv.isChannel) {
            const isAdmin = conv.creatorId === authenticatedUserId || (conv.adminIds || []).includes(authenticatedUserId);
            if (!isAdmin) {
              ws.send(JSON.stringify({ type: 'error', message: 'Only channel administrators can post messages in this broadcast channel.' }));
              return;
            }
          }

          // Member-role enforcement (banned / kicked / muted) — from rtm(1)
          const memberEntry = (conv.memberRoles || {})[authenticatedUserId];
          if (memberEntry) {
            if (memberEntry.isBanned) {
              ws.send(JSON.stringify({ type: 'error', message: 'You are banned from this group.' }));
              return;
            }
            if (memberEntry.isKicked) {
              ws.send(JSON.stringify({ type: 'error', message: 'You were removed from this group.' }));
              return;
            }
            if (memberEntry.mutedUntil && memberEntry.mutedUntil > Date.now()) {
              ws.send(JSON.stringify({ type: 'error', message: `You are muted until ${new Date(memberEntry.mutedUntil).toLocaleTimeString()}.` }));
              return;
            }
          }

          // Slow mode check
          if (conv.slowModeSeconds && conv.slowModeSeconds > 0) {
            const isAdmin = conv.creatorId === authenticatedUserId || (conv.adminIds || []).includes(authenticatedUserId);
            if (!isAdmin) {
              const lastTime = (conv.lastMessageSentBy || {})[authenticatedUserId] || 0;
              const elapsed = (Date.now() - lastTime) / 1000;
              if (elapsed < conv.slowModeSeconds) {
                const waitSecs = Math.ceil(conv.slowModeSeconds - elapsed);
                ws.send(JSON.stringify({ type: 'error', message: `Slow mode active. Please wait ${waitSecs}s before sending another message.` }));
                return;
              }
            }
          }

          // Block check
          if (!conv.isGroup && !conv.isChannel) {
            const otherId = (conv.participants || []).find((p: string) => p !== authenticatedUserId);
            if (otherId) {
              const dbUser = db.users.find((u: any) => u.id === authenticatedUserId);
              const otherUser = db.users.find((u: any) => u.id === otherId);
              const isUserBlocked = 
                (dbUser?.blockedUserIds || []).includes(otherId) || 
                (otherUser?.blockedUserIds || []).includes(authenticatedUserId);
              if (isUserBlocked) {
                ws.send(JSON.stringify({ type: 'error', message: 'Communication blocked between these users.' }));
                return;
              }
            }
          }

          const sender = db.users.find((u: any) => u.id === authenticatedUserId);
          const msgId = `msg-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
          
          const newMsg = {
            id: msgId,
            conversationId,
            senderId: authenticatedUserId,
            senderName: sender?.name || 'Someone',
            senderAvatar: sender?.profile?.avatarUrl || '',
            text: text || '',
            mediaUrl: mediaUrl || null,
            mediaName: mediaName || null,
            replyToMessageId: replyToMessageId || null,
            poll: poll || null,
            forwardedFrom: forwardedFrom || null,
            reactions: {},
            timestamp: Date.now(),
            status: 'sent', // Initially sent
            readBy: [authenticatedUserId], // Read by sender
            viewsCount: conv.isChannel ? 1 : undefined,
            viewedBy: conv.isChannel ? [authenticatedUserId] : undefined
          };

          db.chatMessages.push(newMsg);
          
          // Track last message timestamp for slow mode
          conv.lastMessageSentBy = conv.lastMessageSentBy || {};
          conv.lastMessageSentBy[authenticatedUserId] = Date.now();

          // Determine status based on active participants
          const otherParticipants = (conv.participants || []).filter((p: string) => p !== authenticatedUserId);
          let deliveredCount = 0;

          otherParticipants.forEach((pId: string) => {
            if (userConnections.has(pId) && userConnections.get(pId)!.size > 0) {
              deliveredCount++;
            }
          });

          if (deliveredCount > 0) {
            newMsg.status = 'delivered';
          }

          // Azan auto-mute (feature 223): when a recipient has auto-mute enabled
          // and we're inside a prayer window, suppress the in-app notification
          // (no badge/unread notif) and tag their broadcast as `muted` so the
          // client can skip the chime/toast while still delivering the message.
          const azanMutes = azanMuteMapForUsers(db, conv.participants || []);
          otherParticipants.forEach((pId: string) => {
            if (azanMutes.get(pId)) return; // muted — skip the notification entry
            addNotification(db, pId, 'chat_message', { id: authenticatedUserId, name: sender?.name || 'Someone' }, { interestText: text || (mediaName ? `File: ${mediaName}` : 'Attachment') });
          });

          saveDatabase(db);

          // Broadcast message to all online participants (per-recipient muted flag)
          (conv.participants || []).forEach((pId: string) => {
            sendToUsers([pId], {
              type: 'message_received',
              message: newMsg,
              muted: azanMutes.get(pId) || false
            });
          });

          return;
        }

        if (type === 'pin_message') {
          const { conversationId, messageId } = payload;
          if (!conversationId) return;

          const db = loadDatabase();
          const conv = db.conversations.find((c: any) => c.id === conversationId);
          if (!conv) return;

          conv.pinnedMessageId = messageId || null;
          saveDatabase(db);

          sendToUsers(conv.participants || [], {
            type: 'message_pinned',
            conversationId,
            pinnedMessageId: conv.pinnedMessageId
          });
          return;
        }

        if (type === 'poll_vote') {
          const { conversationId, messageId, optionId } = payload;
          if (!conversationId || !messageId || !optionId) return;

          const db = loadDatabase();
          const msg = db.chatMessages.find((m: any) => m.id === messageId);
          if (!msg || !msg.poll || !msg.poll.options) return;

          msg.poll.options.forEach((opt: any) => {
            opt.votes = opt.votes || [];
            if (opt.id === optionId) {
              if (opt.votes.includes(authenticatedUserId)) {
                opt.votes = opt.votes.filter((uid: string) => uid !== authenticatedUserId);
              } else {
                opt.votes.push(authenticatedUserId);
              }
            } else if (!msg.poll.isMultipleChoice) {
              // Single choice removes vote from other options
              opt.votes = opt.votes.filter((uid: string) => uid !== authenticatedUserId);
            }
          });

          saveDatabase(db);

          const conv = db.conversations.find((c: any) => c.id === conversationId);
          if (conv) {
            sendToUsers(conv.participants || [], {
              type: 'message_edited',
              conversationId,
              messageId,
              message: msg
            });
          }
          return;
        }

        if (type === 'edit_message') {
          const { conversationId, messageId, newText } = payload;
          if (!conversationId || !messageId) return;

          const db = loadDatabase();
          const msg = db.chatMessages.find((m: any) => m.id === messageId);
          if (!msg || msg.senderId !== authenticatedUserId) {
            ws.send(JSON.stringify({ type: 'error', message: 'Cannot edit this message' }));
            return;
          }

          msg.text = newText;
          msg.edited = true;
          saveDatabase(db);

          const conv = db.conversations.find((c: any) => c.id === conversationId);
          if (conv) {
            sendToUsers(conv.participants || [], {
              type: 'message_edited',
              conversationId,
              message: msg
            });
          }
          return;
        }

        if (type === 'delete_message') {
          const { conversationId, messageId } = payload;
          if (!conversationId || !messageId) return;

          const db = loadDatabase();
          const msg = db.chatMessages.find((m: any) => m.id === messageId);
          if (!msg || msg.senderId !== authenticatedUserId) {
            ws.send(JSON.stringify({ type: 'error', message: 'Cannot delete this message' }));
            return;
          }

          // Check 10 minute limit
          const elapsed = Date.now() - msg.timestamp;
          if (elapsed > 10 * 60 * 1000) {
            ws.send(JSON.stringify({ type: 'error', message: 'Messages can only be deleted within 10 minutes of sending.' }));
            return;
          }

          msg.text = 'This message was deleted';
          msg.deleted = true;
          msg.mediaUrl = null;
          msg.mediaName = null;
          saveDatabase(db);

          const conv = db.conversations.find((c: any) => c.id === conversationId);
          if (conv) {
            sendToUsers(conv.participants || [], {
              type: 'message_deleted',
              conversationId,
              messageId,
              message: msg
            });
          }
          return;
        }

        // Per-user soft delete ("delete for me") — echoes to the sender's other devices
        if (type === 'delete_for_me') {
          const { conversationId, messageId } = payload;
          if (!conversationId || !messageId) return;
          const db = loadDatabase();
          const msg = db.chatMessages.find((m: any) => m.id === messageId);
          if (!msg) return;
          msg.deletedForMe = msg.deletedForMe || [];
          if (!msg.deletedForMe.includes(authenticatedUserId)) msg.deletedForMe.push(authenticatedUserId);
          saveDatabase(db);
          ws.send(JSON.stringify({
            type: 'message_soft_deleted', conversationId, messageId, userId: authenticatedUserId,
          }));
          return;
        }

        // Watch-together sync (from jitsi shared-video pattern) — play/pause/seek/mute broadcast
        if (type === 'watch_sync') {
          const { conversationId, url, status, time, muted } = payload;
          if (!conversationId || !url) return;
          const db = loadDatabase();
          const conv = db.conversations.find((c: any) => c.id === conversationId);
          if (!conv) return;
          sendToUsers((conv.participants || []).filter((p: string) => p !== authenticatedUserId), {
            type: 'watch_sync',
            conversationId,
            from: authenticatedUserId,
            url,
            status: status || 'pause',
            time: Number(time) || 0,
            muted: !!muted,
            sentAt: Date.now(),
          });
          return;
        }

        if (type === 'add_reaction') {
          const { conversationId, messageId, emoji } = payload;
          if (!conversationId || !messageId || !emoji) return;

          const db = loadDatabase();
          const msg = db.chatMessages.find((m: any) => m.id === messageId);
          if (!msg) return;

          msg.reactions = msg.reactions || {};
          msg.reactions[emoji] = msg.reactions[emoji] || [];

          if (msg.reactions[emoji].includes(authenticatedUserId)) {
            // Toggle off
            msg.reactions[emoji] = msg.reactions[emoji].filter((uid: string) => uid !== authenticatedUserId);
          } else {
            // Add reaction
            msg.reactions[emoji].push(authenticatedUserId);
          }

          saveDatabase(db);

          const conv = db.conversations.find((c: any) => c.id === conversationId);
          if (conv) {
            sendToUsers(conv.participants || [], {
              type: 'message_reacted',
              conversationId,
              messageId,
              message: msg
            });
          }
          return;
        }

        if (type === 'read') {
          const { conversationId, messageIds } = payload;
          if (!conversationId || !messageIds || !Array.isArray(messageIds)) return;

          const db = loadDatabase();
          let changed = false;

          db.chatMessages.forEach((msg: any) => {
            if (msg.conversationId === conversationId && messageIds.includes(msg.id)) {
              msg.readBy = msg.readBy || [];
              if (!msg.readBy.includes(authenticatedUserId)) {
                msg.readBy.push(authenticatedUserId);
                changed = true;
              }

              // Update overall status to 'read' if all other participants have read it
              const conv = db.conversations.find((c: any) => c.id === conversationId);
              if (conv) {
                const totalOthers = (conv.participants || []).filter((p: string) => p !== msg.senderId).length;
                const readOthers = (msg.readBy || []).filter((p: string) => p !== msg.senderId).length;
                if (readOthers >= totalOthers && totalOthers > 0) {
                  msg.status = 'read';
                }
              }
            }
          });

          if (changed) {
            saveDatabase(db);
            // Broadcast read receipt
            const conv = db.conversations.find((c: any) => c.id === conversationId);
            if (conv) {
              sendToUsers(conv.participants || [], {
                type: 'messages_read',
                conversationId,
                readerId: authenticatedUserId,
                messageIds
              });
            }
          }
          return;
        }

        // --- CALL SIGNALLING (P2P WebRTC fallback when Stream is unavailable) ---
        // These relay lightweight ring/answer/cancel/end events between the
        // two peers over the existing chat socket. The actual media (SDP/ICE)
        // is exchanged via the /api/meet/room/:id/signal REST relay.
        //
        // Strict boundary: a peer that vanished mid-call (Ngrok tunnel drop,
        // firewall RST, device sleep) must never take the process down. Every
        // relay below is guarded by sendToUsers()/safeSend() which never throw,
        // and the whole block is additionally wrapped here so a malformed
        // payload only aborts this one relay instead of the whole handler.
        try {
        if (type === 'call_offer') {
          const { to, callId, callType, fromName } = payload;
          if (!to || !callId) return;

          // Lazy-purge expired offers, then enforce single outstanding ring:
          // if the callee already has a live incoming call, the new caller
          // hears call_busy (Tinode 486 / USER_BUSY) instead of an unanswered
          // offer. Otherwise record this offer as the callee's busy slot.
          const now = Date.now();
          for (const [uid, entry] of busyCalls.entries()) {
            if (entry.expires < now) busyCalls.delete(uid);
          }
          // Never drop the offer silently: if the target has no live socket
          // (offline / mid-reconnect) tell the caller immediately instead of
          // letting them ring into the void for the full 45s timeout. Also
          // avoids recording a stale busy slot for an offline user.
          const targetConns = userConnections.get(to);
          if (!targetConns || targetConns.size === 0) {
            sendToUsers([authenticatedUserId as string], {
              type: 'call_unreachable',
              fromUserId: to,
              callId,
            });
            return;
          }
          if (busyCalls.has(to)) {
            sendToUsers([authenticatedUserId as string], {
              type: 'call_busy',
              fromUserId: to,
              callId,
            });
            return;
          }
          busyCalls.set(to, { callId, expires: now + 45_000 });

          sendToUsers([to], {
            type: 'call_offer',
            fromUserId: authenticatedUserId,
            fromName: fromName || 'User',
            callId,
            callType: callType || 'video',
          });
          try {
            const db = loadDatabase();
            addNotification(db, to, 'call', {
              id: authenticatedUserId as string,
              name: fromName || 'User',
            }, { interestText: `Incoming ${callType === 'audio' ? 'voice' : 'video'} call` });
            saveDatabase(db);
          } catch (e) {
            console.warn('call_offer notification failed:', e);
          }
          return;
        }

        // Callee acknowledges the offer → caller plays ringback.
        if (type === 'call_ringing') {
          const { to, callId } = payload;
          if (!to) return;
          sendToUsers([to], {
            type: 'call_ringing',
            fromUserId: authenticatedUserId,
            callId,
          });
          return;
        }

        // Server-side busy relay (second caller hearing call_busy).
        if (type === 'call_busy') {
          const { to, callId } = payload;
          if (!to) return;
          sendToUsers([to], {
            type: 'call_busy',
            fromUserId: authenticatedUserId,
            callId,
          });
          return;
        }

        if (type === 'call_cancel') {
          const { to, callId } = payload;
          if (!to) return;
          busyCalls.delete(to);
          sendToUsers([to], {
            type: 'call_cancel',
            fromUserId: authenticatedUserId,
            callId,
          });
          return;
        }

        if (type === 'call_answer') {
          const { to, callId, accepted } = payload;
          if (!to) return;
          // The busy slot is owned by the ANSWERING user (the callee recorded
          // in call_offer's busyCalls.set(to, ...)). Deleting the caller's key
          // here left the callee's slot lingering for 45s, silently turning the
          // NEXT offer to that callee into call_busy. Clear the right entry.
          busyCalls.delete(authenticatedUserId as string);
          sendToUsers([to], {
            type: 'call_answer',
            fromUserId: authenticatedUserId,
            callId,
            accepted: !!accepted,
          });
          return;
        }

        if (type === 'call_end') {
          const { to, callId } = payload;
          if (!to) return;
          busyCalls.delete(to);
          sendToUsers([to], {
            type: 'call_end',
            fromUserId: authenticatedUserId,
            callId,
          });
          return;
        }
        } catch (relayErr) {
          console.error('Call signaling relay error (type=' + String(type) + '):', relayErr);
        }

        // === Shared Workspace Whiteboard relay (feature 109) ===
        if (type === 'whiteboard_subscribe') {
          const { boardId } = payload;
          if (!boardId) return;
          let members = whiteboardRooms.get(boardId);
          if (!members) {
            members = new Set<WebSocket>();
            whiteboardRooms.set(boardId, members);
          }
          members.add(ws);
          ws.send(JSON.stringify({ type: 'whiteboard_subscribed', boardId }));
          return;
        }

        if (type === 'whiteboard_event') {
          const { boardId, event } = payload;
          if (!boardId || !event) return;
          const members = whiteboardRooms.get(boardId);
          if (!members) return;
          const out = JSON.stringify({
            type: 'whiteboard_event',
            boardId,
            event,
            from: authenticatedUserId,
          });
          members.forEach((s) => {
            if (s !== ws && s.readyState === WebSocket.OPEN) s.send(out);
          });
          return;
        }

        if (type === 'whiteboard_state') {
          const { boardId, elements } = payload;
          if (!boardId || !elements) return;
          const members = whiteboardRooms.get(boardId);
          if (!members) return;
          const out = JSON.stringify({
            type: 'whiteboard_state',
            boardId,
            elements,
            from: authenticatedUserId,
          });
          members.forEach((s) => {
            if (s !== ws && s.readyState === WebSocket.OPEN) s.send(out);
          });
          return;
        }

        // === MEET ROOM MESH SIGNALING (SimpleWebRTC-style group video rooms) ===
        // Standard mesh WebRTC event vocabulary, relayed over the existing
        // authenticated /ws/chat socket:
        //   client → server: 'join-room' | 'sending-signal' | 'leave-room'
        //   server → client: 'all-users' | 'user-connected' | 'returning-signal'
        //                    | 'user-disconnected'
        // The actual media plane (SDP offers/answers + ICE candidates) travels
        // inside 'sending-signal'/'returning-signal' envelopes. Every relay is
        // guarded by safeSend()/sendToUsers() which never throw, so a peer that
        // vanished mid-room can never take the process down. Each handler below
        // is ALSO wrapped in its own try-catch so network fluctuations or empty
        // ICE candidates never crash this socket or the main Express thread.
        try {
        if (type === 'join-room') {
          const { roomId, name } = payload;
          if (!roomId || typeof roomId !== 'string') return;
          const uid = authenticatedUserId as string;
          let room = meetRooms.get(roomId);
          if (!room) {
            room = new Map<string, { name: string }>();
            meetRooms.set(roomId, room);
          }
          if (!room.has(uid)) room.set(uid, { name: String(name || uid).slice(0, 60) });
          if (!userMeetRooms.has(uid)) userMeetRooms.set(uid, new Set<string>());
          userMeetRooms.get(uid)!.add(roomId);

          // 1) Snapshot of everyone already in the room → the newcomer.
          const existing = Array.from(room.entries())
            .filter(([id]) => id !== uid)
            .map(([id, info]) => ({ userId: id, name: info.name }));
          safeSend(ws, JSON.stringify({ type: 'all-users', roomId, users: existing }));

          // 2) Fan-out 'user-connected' to the existing members so they can
          //    open a peer connection to the newcomer (they initiate; the
          //    newcomer answers — exactly one offer per pair, no glare).
          const announce = JSON.stringify({ type: 'user-connected', roomId, userId: uid, name: String(name || uid).slice(0, 60) });
          room.forEach((_info, otherId) => {
            if (otherId === uid) return;
            const conns = userConnections.get(otherId);
            if (conns) conns.forEach((s) => safeSend(s, announce));
          });
          return;
        }

        if (type === 'sending-signal') {
          const { roomId, userToSignal, signal } = payload;
          if (!roomId || !userToSignal) return;
          // Empty or malformed ICE candidates / SDP must NEVER propagate out of
          // this handler — the target's peer connection tolerates a skipped
          // candidate (handled client-side), so a bad signal only aborts this
          // one relay rather than dropping the whole socket or crashing the
          // process. Normalize the signal envelope defensively.
          if (!signal || (typeof signal !== 'object')) return;
          const room = meetRooms.get(roomId);
          if (!room || !room.has(userToSignal)) return; // target left the room
          const out = JSON.stringify({
            type: 'returning-signal',
            roomId,
            fromUserId: authenticatedUserId,
            signal: signal || null,
          });
          const conns = userConnections.get(userToSignal);
          if (conns) conns.forEach((s) => safeSend(s, out));
          return;
        }

        if (type === 'leave-room') {
          const { roomId } = payload;
          if (!roomId) return;
          leaveMeetRoom(authenticatedUserId as string, roomId);
          return;
        }
        } catch (meetErr) {
          // Absolute error boundary for meet-room signaling: a transient network
          // blip or a malformed envelope must not tear down the WebSocket or the
          // Express thread. Inform the sender and continue.
          console.error('Meet room signaling error (type=' + String(type) + '):', meetErr);
          try {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'error', message: 'Meet room signaling failed' }));
            }
          } catch { /* ignore */ }
        }

      } catch (err) {
        console.error('WebSocket message parsing/handling error:', err);
        // Tell the sender the relay failed instead of letting the call hang
        // silently; the other peer may still recover via the REST hangup path.
        try {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'error', message: 'Message handling failed' }));
          }
        } catch { /* ignore */ }
      }
    });

    // Socket-level errors (Ngrok tunnel teardown, RST, abrupt disconnect) MUST
    // have a listener, otherwise Node treats them as uncaught exceptions and
    // kills the process mid-call.
    ws.on('error', (err) => {
      console.warn('WebSocket socket error (peer dropped):', (err as any)?.message || err);
    });

    ws.on('close', () => {
      try {
      // Remove this socket from any subscribed whiteboard rooms (feature 109)
      whiteboardRooms.forEach((members, boardId) => {
        if (members.delete(ws) && members.size === 0) whiteboardRooms.delete(boardId);
      });
      if (authenticatedUserId) {
        const conns = userConnections.get(authenticatedUserId);
        if (conns) {
          conns.delete(ws);
          if (conns.size === 0) {
            // Last socket of this user closed — leave every meet room they
            // joined (broadcasts 'user-disconnected' to remaining members).
            try {
              const userRooms = userMeetRooms.get(authenticatedUserId);
              if (userRooms) {
                Array.from(userRooms).forEach((rId) => leaveMeetRoom(authenticatedUserId as string, rId));
              }
            } catch (e) {
              console.error('Meet room cleanup on close error:', e);
            }
            userConnections.delete(authenticatedUserId);
            onlineUsers.delete(authenticatedUserId);
            const now = Date.now();
            lastSeenUsers.set(authenticatedUserId, now);

            // Clear any typing state
            typingStates.forEach((typers, convId) => {
              if (typers.delete(authenticatedUserId)) {
                // Broadcast typing update
                const db = loadDatabase();
                const conv = db.conversations.find((c: any) => c.id === convId);
                if (conv) {
                  sendToUsers(conv.participants || [], {
                    type: 'typing_state',
                    conversationId: convId,
                    typers: Array.from(typers).map(uid => {
                      const u = db.users.find((u: any) => u.id === uid);
                      return {
                        id: uid,
                        name: u?.name || 'Someone',
                        username: u?.profile?.username || u?.username || ''
                      };
                    })
                  });
                }
              }
            });

            // Broadcast user offline status with last seen timestamp
            broadcast({
              type: 'presence',
              userId: authenticatedUserId,
              status: 'offline',
              lastSeen: now
            });
          }
        }
      }
      } catch (e) {
        console.error('WebSocket close handler error:', e);
      }
    });
  });

  triggerSimulatedReplyBridge = triggerSimulatedReply;

  // Helper to trigger automated simulated response from an offline user using Copilot AI
  function triggerSimulatedReply(conversationId: string, responderId: string, responderUser: any, senderId: string) {
    if (!responderId || responderId === senderId) return;
    // Wait 1.5 - 2.5 seconds, then set typing to true
    const typingOnDelay = 1500 + Math.random() * 1000;
    setTimeout(() => {
      if (!typingStates.has(conversationId)) {
        typingStates.set(conversationId, new Set());
      }
      typingStates.get(conversationId)!.add(responderId);

      // Broadcast typing state to conversation participants
      const db = loadDatabase();
      const conv = db.conversations.find((c: any) => c.id === conversationId);
      if (!conv) return;

      const typersList = Array.from(typingStates.get(conversationId)!).map(uid => {
        const u = db.users.find((x: any) => x.id === uid);
        return {
          id: uid,
          name: u?.name || 'Someone',
          username: u?.profile?.username || u?.username || ''
        };
      });

      sendToUsers(conv.participants || [], {
        type: 'typing_state',
        conversationId,
        typers: typersList
      });

      // Prepare AI payload of last 12 messages
      const messagesInConv = (db.chatMessages || [])
        .filter((m: any) => m.conversationId === conversationId)
        .sort((a: any, b: any) => a.timestamp - b.timestamp);

      const mappedMessages = messagesInConv.slice(-12).map((m: any) => ({
        senderName: m.senderName,
        text: m.text || ''
      }));

      // Randomly select one of the social modes based on creator description or tagline
      const modes: ('relation' | 'fix' | 'savage' | 'fresh')[] = ['relation', 'fix', 'savage', 'fresh'];
      const selectedMode = modes[Math.floor(Math.random() * modes.length)];

      // Draft response from the AI
      draftCopilotResponse({
        messages: mappedMessages,
        mode: selectedMode,
        temperature: 0.85
      }).then((copilotRes) => {
        const replyText = copilotRes.draftText || "That's very interesting! Tell me more about your workspace.";

        // Wait another 2 - 3.5 seconds to simulate organic message composition
        const messageSendDelay = 2000 + Math.random() * 1500;
        setTimeout(() => {
          // Remove typing indicator
          const currentTypers = typingStates.get(conversationId);
          if (currentTypers) {
            currentTypers.delete(responderId);
          }

          // Broadcast typing state off
          const typersListOff = Array.from(typingStates.get(conversationId) || []).map(uid => {
            const u = db.users.find((x: any) => x.id === uid);
            return {
              id: uid,
              name: u?.name || 'Someone',
              username: u?.profile?.username || u?.username || ''
            };
          });

          sendToUsers(conv.participants || [], {
            type: 'typing_state',
            conversationId,
            typers: typersListOff
          });

          // Save and broadcast message
          const db2 = loadDatabase();
          const replyMsgId = `msg-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
          
          const replyMsg = {
            id: replyMsgId,
            conversationId,
            senderId: responderId,
            senderName: responderUser.name,
            senderAvatar: responderUser.profile?.avatarUrl || '',
            text: replyText,
            mediaUrl: null,
            mediaName: null,
            timestamp: Date.now(),
            status: 'read',
            readBy: [responderId, senderId]
          };

          db2.chatMessages = db2.chatMessages || [];
          db2.chatMessages.push(replyMsg);
          saveDatabase(db2);

          // Broadcast message (Azan auto-mute feature 223: per-recipient muted flag)
          const azanMutes2 = azanMuteMapForUsers(db2, conv.participants || []);
          (conv.participants || []).forEach((pId: string) => {
            sendToUsers([pId], {
              type: 'message_received',
              message: replyMsg,
              muted: azanMutes2.get(pId) || false
            });
          });

        }, messageSendDelay);
      }).catch((err) => {
        console.error("Simulation response generation error:", err);
        // Turn off typing indicator in case of error
        const currentTypers = typingStates.get(conversationId);
        if (currentTypers) currentTypers.delete(responderId);
      });

    }, typingOnDelay);
  }

  /**
   * Send one payload to a socket without ever throwing. A peer that drops
   * mid-call (Ngrok tunnel teardown, device sleep, firewall RST) can leave the
   * underlying stream in CLOSING/CLOSED between the readyState check and
   * ws.send(); without this guard the synchronous throw would propagate out of
   * the relay handler and kill the Node process.
   */
  function safeSend(ws: WebSocket, payload: string) {
    try {
      if (ws.readyState === WebSocket.OPEN) ws.send(payload);
    } catch (e) {
      console.warn('Socket send failed (peer disconnected):', e);
    }
  }

  // Utility to send to multiple users (never throws)
  function sendToUsers(userIds: string[], data: any) {
    let payload: string;
    try {
      payload = JSON.stringify(data);
    } catch (e) {
      console.error('sendToUsers: payload serialization failed:', e);
      return;
    }
    userIds.forEach((userId) => {
      const conns = userConnections.get(userId);
      if (conns) {
        conns.forEach((ws) => safeSend(ws, payload));
      }
    });
  }

  /**
   * Remove a user from a meet room and tell the remaining members. Idempotent
   * (safe to call twice — e.g. explicit 'leave-room' then socket close).
   */
  function leaveMeetRoom(userId: string, roomId: string): void {
    const room = meetRooms.get(roomId);
    if (room) {
      room.delete(userId);
      if (room.size === 0) meetRooms.delete(roomId);
    }
    userMeetRooms.get(userId)?.delete(roomId);
    if (userMeetRooms.get(userId)?.size === 0) userMeetRooms.delete(userId);
    if (room && room.size > 0) {
      const out = JSON.stringify({ type: 'user-disconnected', roomId, userId });
      room.forEach((_info, otherId) => {
        if (otherId === userId) return;
        const conns = userConnections.get(otherId);
        if (conns) conns.forEach((s) => safeSend(s, out));
      });
    }
  }

  // Utility to broadcast to all connected clients (never throws)
  function broadcast(data: any) {
    let payload: string;
    try {
      payload = JSON.stringify(data);
    } catch (e) {
      console.error('broadcast: payload serialization failed:', e);
      return;
    }
    userConnections.forEach((conns) => {
      conns.forEach((ws) => safeSend(ws, payload));
    });
  }

  // Seed initial simulated online statuses for a lively look on page load
  try {
    const db = loadDatabase();
    if (db.users && db.users.length > 0) {
      db.users.forEach((u: any) => {
        if (Math.random() > 0.4) { // 60% chance to be initially online
          simulatedOnlineUsers.add(u.id);
        } else {
          const randomLastSeen = Date.now() - (5 * 60 * 1000 + Math.floor(Math.random() * 8 * 60 * 60 * 1000));
          lastSeenUsers.set(u.id, randomLastSeen);
        }
      });
    }
  } catch (e) {
    console.error('Failed to seed initial simulated presence:', e);
  }

  // Periodically simulate real-time presence updates for creators to make the network feel alive
  setInterval(() => {
    try {
      const db = loadDatabase();
      if (!db.users || db.users.length === 0) return;

      // Filter out users who have active real connections
      const mockUserIds = db.users
        .map((u: any) => u.id)
        .filter((uid: string) => !userConnections.has(uid) || userConnections.get(uid)!.size === 0);

      if (mockUserIds.length === 0) return;

      const randomUserId = mockUserIds[Math.floor(Math.random() * mockUserIds.length)];
      
      // 50% chance to go online, 50% to go offline
      const shouldBeOnline = Math.random() > 0.5;

      if (shouldBeOnline) {
        simulatedOnlineUsers.add(randomUserId);
        lastSeenUsers.delete(randomUserId);
        broadcast({
          type: 'presence',
          userId: randomUserId,
          status: 'online',
          lastSeen: null
        });
      } else {
        simulatedOnlineUsers.delete(randomUserId);
        // last seen between 1 minute and 4 hours ago
        const randomLastSeen = Date.now() - (60 * 1000 + Math.floor(Math.random() * 4 * 60 * 60 * 1000));
        lastSeenUsers.set(randomUserId, randomLastSeen);
        broadcast({
          type: 'presence',
          userId: randomUserId,
          status: 'offline',
          lastSeen: randomLastSeen
        });
      }
    } catch (e) {
      console.error('Error in presence simulation interval:', e);
    }
  }, 10000); // Check and simulate a presence change every 10 seconds
}

// REST helper to check user status
export function getUserStatus(userId: string) {
  if (userConnections.has(userId) && userConnections.get(userId)!.size > 0) {
    return { status: 'online', lastSeen: null };
  }
  if (simulatedOnlineUsers.has(userId)) {
    return { status: 'online', lastSeen: null };
  }
  return { status: 'offline', lastSeen: lastSeenUsers.get(userId) || null };
}

// Global broadcast helper for REST API triggers
export function broadcastMessageToUsers(userIds: string[], data: any) {
  let payload: string;
  try {
    payload = JSON.stringify(data);
  } catch (e) {
    console.error('broadcastMessageToUsers: payload serialization failed:', e);
    return;
  }
  userIds.forEach((userId) => {
    const conns = userConnections.get(userId);
    if (conns) {
      conns.forEach((ws) => {
        try {
          if (ws.readyState === WebSocket.OPEN) ws.send(payload);
        } catch (e) {
          console.warn('Socket send failed (peer disconnected):', e);
        }
      });
    }
  });
}

export function triggerSimulatedReplyExternal(conversationId: string, responderId: string, responderUser: any, senderId: string) {
  if (triggerSimulatedReplyBridge) {
    triggerSimulatedReplyBridge(conversationId, responderId, responderUser, senderId);
  }
}
