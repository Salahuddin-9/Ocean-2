# OCEAN — IMPLEMENTATION PLAYBOOK (synthesized from 12 area surveys)

Root: `G:/OnmiRouter-Test/Ocean-V1 - Copy`. Live backend = `server.ts` (single Express file, ~6220 lines) + `chatServer.ts` (WS). Live frontend = `src/App.tsx` (one 12,634-line default-export component). All line numbers below are verified against the current tree. `requireAuth`/`loadDatabase`/`saveDatabase` are declared as hoisted function declarations, so they are usable by routes defined before their textual position.

---

## 1. FEATURE FILE CONVENTION

### File name pattern
- **Pure-logic backend module** (types + pure functions, NO fs / NO express): `src/turtle<FeatureName>Backend.ts` (e.g. `turtleCommunityBackend.ts`, `turtleEmergencyPoolsBackend.ts`, `turtleChatAiHelper.ts`). Follow this for coin/economy/bounty/marketplace logic.
- **Self-contained registered module** (owns its state + routes): `src/turtle<FeatureName>Backend.ts` exposing `export function register<FeatureName>Routes(app: any): void`. Signature takes ONLY the express app — no db/ctx. Canonical examples: `registerEmergencyPoolsRoutes(app)` (turtleEmergencyPoolsBackend.ts:147), `registerAIModerationRoutes(app)` (turtleAIModerationAssistant:395), `registerNSFWRoutes(app)` (turtleNSFWServerEngine:208).
- **AI module** (Gemini): `src/turtle<FeatureName>Engine.ts` with a `register<FeatureName>Routes(app)` tail (see §5).

### How the module accesses db + saveDatabase — 3 established patterns
There is NO exported `getDb()`/`getSave()` from server.ts, and NO ctx object is passed to registered modules. `loadDatabase()` (server.ts:54-181) re-reads `database.json` from disk on EVERY call (130+ call sites); `saveDatabase(data)` (server.ts:656-678) is a write-lock-serialized atomic writer (writes `.tmp` then `fs.renameSync`, then queues Firestore sync). Pick ONE:

1. **Inline wiring (RECOMMENDED for most features)** — write pure functions in `src/turtle<Feature>Backend.ts`, then add the Express routes DIRECTLY in server.ts, calling `loadDatabase()` + `saveDatabase()` (or `loadCommunity()` + `saveCommunity()`) inline. This is exactly how `/api/community/*` (server.ts:5893-5993) and `/api/posts/*` work. `req.user` comes from the `requireAuth` middleware.
2. **Own JSON state file** — when data must NOT be synced to Firestore (community.json) or is high-write/ephemeral (emergency.json). Persist to `path.join(process.cwd(), '<feature>.json')` with your own load/save (community pattern, §2). Community's rationale is stated at server.ts:5862-5863: "State lives in a separate community.json so the Firestore merge never wipes it."
3. **Setter injection** — only needed if a separate module must call server.ts's private `saveDatabase`/`getUserIdFromToken`. Copy chatServer's seam: module-level `let externalSaveDatabase: ((db:any)=>void)|null` + `export function setExternalSaveDatabase(fn){ externalSaveDatabase = fn }`, then in `startServer()` call `setExternalSaveDatabase(saveDatabase)` / `setExternalTokenValidator(getUserIdFromToken)` right before `setupChatServer(server)` (server.ts:6216-6218).

### Import + register in server.ts (exact call pattern)
- Add the import at the TOP block (server.ts:12-31), e.g.:
  ```ts
  import { register<Feature>Routes } from './src/turtle<Feature>Backend';
  ```
- Add `register<Feature>Routes(app);` in the registration block at server.ts:5286-5307 (after `registerAIModerationRoutes(app)` at 5286 … `registerEmergencyPoolsRoutes(app)` at 5307). NOTE: this block is MID-FILE (~line 5286), so module routes register AFTER the ~5250 inline routes — beware of prefix shadowing vs inline routes that registered earlier (see the `/api/nsfw/check` shadow bug, §10).

### requireAuth and reading the user
- Attach `requireAuth` as the second arg: `app.post('/api/feature/do', requireAuth, (req, res) => { ... })`.
- `requireAuth` (server.ts:1176-1197) requires `Authorization: Bearer <token>`, resolves the token via `getUserIdFromToken` (server.ts:944-964: in-memory `activeSessions` Map, fallback to `db.sessions[token]`, 30-day expiry), then sets:
  - `(req as any).user` = the **FULL user record** from `db.users` (name/email/profile/following/friends/trustScore/…)
  - `(req as any).sessionToken` = the raw bearer token.
- **There is NO `req.userId`.** Read the id as `const user = (req as any).user; ... user.id`. This is the universal convention (~86 uses of `(req as any).user` in server.ts).
- For read-only endpoints that allow guests, use `getRequestUser(req)` (server.ts:4582-4590) which returns the user object or null WITHOUT setting `req.user`.
- For admin: `requireAdmin` (server.ts:1200-1207) passes if `req.user.isAdmin` OR header `x-admin-key` === `process.env.MASTER_KEY`; no user in the DB has isAdmin set, so admin is effectively MASTER_KEY-gated. Protect `/api/admin/*` with `requireAuth, requireAdmin`.

---

## 2. DB MODEL CONVENTION

### database.json top-level keys (verified live)
`users`, `messages`, `conversations`, `chatMessages`, `posts`. Runtime-added keys: `db.sessions`, `db.callHistory`, `db.streamApiKeys`, `db.posts` (rebuilt by `syncGlobalPostsFromUsers` at server.ts:594-654 on every saveDatabase), `db.channelVideos` (lazy), `db.scheduledMessages`, `db.chatReports`. `db.posts` is DERIVED: the canonical store is `user.profile.posts[]`; `syncGlobalPostsFromUsers` merges them.

### Adding a new collection/field SAFELY (idempotent ensure/backfill)
The established pattern is a self-healing block inside `loadDatabase()` (migrations already run there, server.ts:81-168) OR an ensure-on-write. Precedent — seeds/defaults written when missing (loadDatabase 56-98). Use:
```ts
if (!Array.isArray(db.<feature>)) db.<feature> = [];          // idempotent — safe to run every load
if (!db.users.find(...)) db.users.push(<seed>);              // backfill only if absent
// after all ensures, one saveDatabase(db) write-locks + atomic-writes + Firestore-syncs
```
For a single new field on existing users, the ensure pattern used in migrations is: `if (!u.someField) u.someField = defaultValue;` guarded by `if (changed) { saveDatabase(db); }` (loadDatabase already does this for name/username/profile.username/salt, server.ts:81-98). Fields added to `user` must be optional in the client `UserProfile` type (src/types.ts:89-118) or absent on old users will crash renders — every new user field should be read defensively (`u.trustScore ?? 0`).

### When to use a separate JSON state file vs the global db
- **Use a separate file** (community.json / emergency.json) when: (a) data must survive the Firestore merge (community.json header comment), (b) high-write-frequency state that would thrash the write-lock + Firestore sync (emergency.json uses an in-memory `store` + 150ms-debounced persist), or (c) it's a standalone subsystem that shouldn't be re-read through loadDatabase's seed/migration pipeline.
- **Use the global db** when: the data is per-user and should sync to Firestore, or is queried alongside users/posts (e.g. a new `user.profile.*` field, a new `db.<collection>` of posts-like records).
- Do NOT put large binary/base64 in database.json — loadDatabase extracts `data:image/` URIs out of posts/avatars into `/uploads/media-migrated-*.ext` (server.ts:103-141).

### Load/save snippet (community pattern — copy verbatim)
```ts
const FEATURE_FILE = path.join(process.cwd(), 'feature.json');   // like COMMUNITY_FILE at server.ts:5865
function loadFeature() {
  try {
    if (!fs.existsSync(FEATURE_FILE)) {
      const state = defaultFeature();
      fs.writeFileSync(FEATURE_FILE, JSON.stringify(state, null, 2), 'utf8');
      return state;
    }
    return featureFrom(JSON.parse(fs.readFileSync(FEATURE_FILE, 'utf8'))); // sanitizer drops unknown keys
  } catch {
    return defaultFeature();
  }
}
function saveFeature(state: any) {
  try { fs.writeFileSync(FEATURE_FILE, JSON.stringify(state, null, 2), 'utf8'); }
  catch (e) { console.warn('feature save error:', e); }
}
```
Server.ts community load/save: `loadCommunity()` 5867-5881, `saveCommunity(state)` 5883-5891. Pattern per route: `load → mutate → saveCommunity(state) → respond`. `loadCommunity` re-reads disk every request (no cache) — that's the norm, don't "optimize" it into a stale singleton unless you need cross-request consistency.

---

## 3. FRONTEND COMPONENT CONVENTION

### File location
`src/components/<FeatureName>.tsx` (37 files today, e.g. EmergencyView.tsx, CreatorStudioView.tsx, CommunitySection.tsx). Default export for view components; inline `interface <Name>Props {...}` above the component. Sub-folders exist for call: `src/components/call/`.

### Wiring into App.tsx — two mechanisms (NO router; conditional JSX on a state enum)
1. **Feature Hub overlay (the convention for new features)** — the hub is at `src/App.tsx:6415-6497` (`{/* Feature Hub ... */}`), only reachable after setting `activeView === 'explore'` (set at App.tsx:6371). Recipe:
   - Add boolean state in the "ADVANCED SANDBOX FEATURES STATES" cluster, src/App.tsx:683-695: `const [showX, setShowX] = useState(false);`
   - Add a card `<button onClick={() => setShowX(true)}>` inside the hub grid (App.tsx:6422-6496) — copy an existing card's className verbatim (icon lucide size-16, bold title span, 9px gray subtitle span).
   - Add the render block in the full-screen overlays region near App.tsx:8697-8849:
     ```tsx
     <AnimatePresence>{showX && (
       <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
         className="fixed inset-0 z-[115] bg-[#f6f1e7]/95 dark:bg-zinc-950/95 backdrop-blur-sm overflow-y-auto py-6 px-4">
         <div ...header row with X close button (w-9 h-9 rounded-full bg-white/80 dark:bg-zinc-800).../>
         <FeatureX token={token} currentUser={user} onClose={() => setShowX(false)} />
       </motion.div>
     )}</AnimatePresence>
     ```
   - If it needs a bottom-nav entry: add a value to the `activeView` union (App.tsx:1175: 'workspace'|'feed'|'chat'|'meet'|'explore'|'search'|'alerts') plus a branch in `<main>` (4868-8467) and a nav button (pattern 8542-8679).
2. **Settings-panel section** (for toggles): add a card/row inside the `space-y-4` div at src/App.tsx:10089, following the card pattern (Shield icon header + `border border-[#ebdcca]/70 rounded-2xl p-4 space-y-3 bg-white/40`); simple toggles as `flex items-center justify-between py-2 border-b border-[#ebdcca]/60` rows.

### Component prop convention (copy this)
```ts
interface <FeatureX>Props {
  token: string | null;
  currentUser: { id: string; name: string } | null;  // sometimes narrower
  onClose: () => void;
}
```
Representative: EmergencyViewProps (EmergencyView.tsx:58-61), CreatorStudioViewProps (:51-55 — falls back to `token ?? localStorage.getItem('secure_auth_token')`). Some components only need `{ token, onClose }` (SavedMessagesPanel.tsx:15, RandomTextDmView.tsx).

### fetch / API convention
- Always **relative** `fetch('/api/...')` — same-origin (Express on :3000 serves the Vite client via middleware in dev). NO axios, NO wrapper module, NO proxy block in vite.config.ts.
- Auth header: `Authorization: \`Bearer ${token}\`` where `token` mirrors localStorage key `secure_auth_token`. JSON body with `'Content-Type': 'application/json'`. No `credentials` option.
- Copy the local `api` helper (identical in EmergencyView.tsx:331-345 and CreatorStudioView.tsx:106-123):
  ```ts
  const api = async (path: string, method = 'GET', body?: unknown) => {
    const res = await fetch(path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Request failed (${res.status})`);
    return res.json();
  };
  ```
- Auth restore: App calls `GET /api/auth/me` on mount (fetchMe, App.tsx:2883-2934); 401 → 1 retry after 1500ms, then clears token.

### Reading the current user
There is NO React context for the user (the only `createContext` calls are in call components). `App` owns `token` (:611), `user` (:612, `{ id, name, email, profile: UserProfile } | null`), `profile` (:613) and **prop-drills** them. Components receive `currentUser`/`token` via props — never `import` the user from a module.

### Modal / overlay patterns
- Centered dialog: `fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#2e2920]/75 backdrop-blur-md` wrapping a `motion.div` `bg-[#fcfaf4] border border-[#ebdcca] rounded-3xl p-6 md:p-8 max-w-md w-full max-h-[90vh] overflow-y-auto` (auth modal App.tsx:9020-9026, settings :10066).
- Full-screen feature overlay: `fixed inset-0 z-[115] bg-[#f6f1e7]/95 dark:bg-zinc-950/95 backdrop-blur-sm overflow-y-auto py-6 px-4` (all hub features).
- Toast bridge: children dispatch `window.dispatchEvent(new CustomEvent('show-toast', { detail: { message } }))` (EmergencyView.tsx:308-310); App listens via `window.addEventListener('show-toast', handleShowToastEvent)` (:2960-2967). Other bus events: `'capsule-unlocked'`, `'refresh-feed'`. No portal/headlessui/radix libs.

### Styling conventions (Tailwind v4, warm cream/stone palette — NOT zinc/indigo)
- Imports: single named-import statement from `lucide-react` (alias collisions: `Image as ImageIcon`, `Video as VideoIcon`); `motion, AnimatePresence` from `'motion/react'`. NO `cn()`/clsx — plain string classNames.
- Signature tokens (dominant): muted text `text-[#8a8172]`, borders `border-[#ebdcca]`, primary text `text-[#3a342a]`, secondary text `text-[#5c5446]`, primary button bg `bg-[#3a342a]`, hover `bg-[#52493b]`, light surface `bg-[#fcfaf4]`, text-on-dark `text-[#f4f1ea]`, dark bg `bg-[#0d0d10]`.
- PRIMARY BUTTON: `flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#3a342a] text-[#f4f1ea] text-[10px] font-mono uppercase font-bold hover:bg-[#52493b] disabled:opacity-50`. Labels are tiny font-mono uppercase.
- SECONDARY: `bg-white border border-[#cfcac0] rounded-xl px-3 py-2 text-xs text-[#3a342a]`.
- CARD: `bg-[#fcfaf4] border border-[#ebdcca] rounded-3xl p-6 w-full max-w-sm shadow-xl space-y-4`.
- Status badge: `text-[8px] font-mono uppercase bg-rose-50 text-rose-500 px-1.5 py-0.5 rounded-full` (also amber/emerald/zinc).
- Dark mode: `dark:*` variants follow the `.dark` CLASS on `<html>` (via `@custom-variant dark (&:where(.dark, .dark *));` at src/index.css:9). The index.css `html.dark [class*=...]` override block (:41-214) remaps hardcoded-hex light surfaces → charcoal, so hardcoded arbitrary-hex classes generally still work in dark mode.

---

## 4. COIN/WALLET API

**There is NO per-user coin field on `user` in database.json (0 hits).** The ONLY balance store is `state.balances: Record<userId, number>` inside `community.json` (server.ts:5865, `COMMUNITY_FILE`), backed by `src/turtleCommunityBackend.ts`. All routes that touch it live in server.ts (not the module) and require auth.

Imports already at server.ts:24-28 (reuse, don't re-import):
```ts
import { communityFrom, defaultCommunity, createEvent, rsvpEvent, askQuestion, answerQuestion,
  upvoteAnswer, ensureDefaultTopics, joinTopic, tipCreator, addBalance, spendBalance,
  trustPointsForUser, DEFAULT_REWARDS } from './src/turtleCommunityBackend';
```

### Exact call pattern — award coins to the authenticated user
```ts
app.post('/api/feature/reward', requireAuth, (req, res) => {
  const user = (req as any).user;            // full user record; balance key = user.id
  const state = loadCommunity();             // module-private in server.ts (5867) — re-reads disk
  addBalance(state, user.id, 100);           // state.balances[userId] += amount
  saveCommunity(state);                      // (5883) naive sync writeFileSync — caller must call it
  res.json({ success: true, balance: state.balances[user.id] || 0 });
});
```
- `addBalance(state, userId, amount): number` (turtleCommunityBackend.ts:179-182) and `spendBalance(state, userId, amount): boolean` (:184-189, returns false if insufficient, never goes negative). Both are PURE — persistence is the caller's job via `saveCommunity`.
- Seed-on-demand precedent (server.ts:5971-5973): `state.balances[user.id] = Math.max(state.balances[user.id] || 0, 100); saveCommunity(state);`
- Spend precedent (POST /api/community/rewards/:id/redeem, server.ts:5979-5993): check affordability, then `spendBalance(state, user.id, reward.cost); saveCommunity(state);`.

### Displayed "points" vs stored balance — KNOWN INCONSISTENCY to handle deliberately
`trustPointsForUser(state, userId, trustScore) = Math.round(trustScore*100) + (state.balances[userId] || 0)` (:199-201). The rewards GET reports `trustPointsForUser` (server.ts:5976) but the redeem route spends ONLY the stored balance via `spendBalance` and responds with raw `state.balances[user.id]` (5990, 5992). For a new awarding route, pick one convention and report it consistently — recommended: operate on stored `balances` and report `trustPointsForUser(state, user.id, Number(dbUser?.trustScore ?? 0))`, reading trustScore as `Number(dbUser?.trustScore ?? dbUser?.profile?.trustScore ?? 0)` (server.ts:5974-5975).
- Trust-score awarding (a DIFFERENT wallet — a `user.trustScore` int on the user record in database.json): `dbUser.trustScore = (dbUser.trustScore || 0) + 10; saveDatabase(db);` (2FA enable precedent, server.ts:1722-1724). It only feeds the 100× component of trustPointsForUser.
- Tips: `tipCreator(state, from, to, amount, note)` (POST /api/community/tips, server.ts:5957-5966) — recipient is a userId string.
- There is NO cron/`node-cron` and NO scheduled coin job today. A scheduled award job (daily/streak) would be net-new; the established server-pattern is module-level `setInterval` + load/mutate/save (precedents: Firestore sync every 15s at server.ts:1169, scheduled-message ticker at :3350).
- DEFAULT_REWARDS (cost in points): verified-badge 500, profile-frame 300, boost-pin 400, custom-theme 350 (turtleCommunityBackend.ts:78-83).

---

## 5. AI API

### Two parallel LLM stacks (pick based on your feature)
- **(A) `invokeLLM` — Forge/OpenAI-compatible, used by server.ts inline routes.** `invokeLLM(params: InvokeParams): Promise<InvokeResult>` at src/server/llm.ts:342. Single non-streaming POST to `{ENV.forgeApiUrl}/v1/chat/completions` (fallback `https://forge.manus.im/v1/chat/completions`), 4 retries w/ exponential backoff, NO timeout. `ENV` from src/server/env.ts (imported in server.ts as `ENV as MANUS_ENV`): `forgeApiUrl = process.env.BUILT_IN_FORGE_API_URL`, `forgeApiKey = process.env.BUILT_IN_FORGE_API_KEY`. `assertApiKey()` throws "OPENAI_API_KEY is not configured" (misleading text) when the key is unset.
- **(B) `@google/genai` — turtle* feature modules use this** with `process.env.GEMINI_API_KEY`, model string `"gemini-3.5-flash"`. Lazy singleton client `getGeminiClient()` that throws if the key is missing; every caller gates on `!!process.env.GEMINI_API_KEY` FIRST and falls back to a mock/heuristic.

### Exact invokeLLM call pattern + graceful degradation (canonical: /api/ai/summary, server.ts:5548-5579)
```ts
app.post('/api/ai/my-feature', requireAuth, async (req, res) => {
  try {
    const result = await invokeLLM({
      messages: [
        { role: 'system', content: 'You are ...' },
        { role: 'user', content: String(req.body.text ?? '').slice(0, 500) },
      ],
      model: 'gemini-3.5-flash',
      maxTokens: 300,
    });
    const text = result.choices[0].message.content; // string
    return res.json({ summary: text, mode: 'llm' });
  } catch (e: any) {
    console.warn('my-feature llm error:', e?.message);
    return res.json({ summary: <heuristic-fallback>, mode: 'fallback' });  // NEVER 500 on missing key
  }
});
```
Degradation rules per report: `/api/ai/chat` returns 502 on key-missing (server.ts:6021); `/api/ai/models` 502 (6030); `/api/ai/summary` degrades to heuristic with `mode:"fallback"` (5569-5578); `/api/ai/image` falls back to a deterministic ocean-themed SVG placeholder when `process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY` absent (5364, 5385-5396); `transcribeAudio` RETURNS (does not throw) `{error, code:"SERVICE_ERROR"}` when env unset (voiceTranscription.ts:78-91). GET `/api/ai/status` (requireAuth) reports `{ gemini: !!GEMINI_API_KEY, forgeLlm: !!(forgeApiUrl&&forgeApiKey), transcription: !!(forgeApiUrl&&forgeApiKey) }` (server.ts:5999-6005).

### Gemini turtle-module pattern (copy turtleAICaptionEngine / turtleAIModerationAssistant)
1. Typed request/response interfaces; `GEMINI_SYSTEM_INSTRUCTION` safety prompt; JSON schema via `responseSchema` + `responseMimeType:"application/json"`.
2. `suggestAICaptions(req)` core fn gates on `!!process.env.GEMINI_API_KEY` → real `runRealGeminiAnalysis` vs mock `runMockAnalysis` (never crashes).
3. Real call (:253-262): `client.models.generateContent({ model: "gemini-3.5-flash", contents: { parts }, config: { systemInstruction, responseMimeType:"application/json", responseSchema, temperature: 0.75 } })`, parse `response.text.trim()` as JSON.
4. Register fn: `registerXxxRoutes(app: any)` → `app.post('/api/ai/<slug>', ...)`; 400 on missing required body; catch → `{success:false, error}` 500. No timeouts, no AbortController, no rate limiting anywhere in AI paths — do not assume them.
5. **Vision**: to send an image, build `parts` with `{ inlineData: { mimeType, data: <raw base64> } }` (strip any `;base64,` data-URL prefix first; for URLs, `fetch(url)` → `Buffer.from(await res.arrayBuffer()).toString('base64')`, MIME from Content-Type) — see turtleAIVehicleAnalysisEngine.ts:194-229.
6. Register the module in server.ts imports (:12-17) and call `registerXxxRoutes(app)` in the block at 5286-5307.

### Other facts
- `listLLMModels()` at llm.ts:435 (GET `{baseUrl}/v1/models`). `transcribeAudio({audioUrl, language?, prompt?})` at voiceTranscription.ts:73 (16MB cap, multipart `whisper-1`). NO server-side TTS (only client `window.speechSynthesis`, App.tsx:811-818). NO streaming. GEMINI_API_KEY is NOT in the ENV object — read straight from `process.env`.

---

## 6. SOCKET CONVENTION

The ONLY live WebSocket is chatServer.ts (raw `ws` package, NOT Socket.IO) on path `/ws/chat`. `socketServer.ts` (Socket.IO) is dead/orphan code — do not import it. `new WebSocketServer({ noServer:true })` lives in the `setupChatServer(server)` closure (chatServer.ts:105-106); the Express http server's `'upgrade'` event only upgrades `url.pathname === '/ws/chat'` (chatServer.ts:109-117).

### Adding a new event on the existing /ws/chat channel (EASIEST)
- Server: add a `case 'my_event':` in the `type` switch (chatServer.ts:127-634), gated by the existing `authenticatedUserId` check (line 178). Read `(req as any)`-equivalent socket context: `ws.userId` etc. Use `sendToUsers(userIds, data)` (line 807) for fan-out to specific users, or `broadcast(data)` (line 822) for all.
- Client: open a raw WebSocket to `` `${protocol}//${window.location.host}/ws/chat` `` where `protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'` (ChatModal.tsx:940-945), send the handshake `{type:'auth', token, userId, name, username}` (ChatModal.tsx:951-962), then handle your type in the `onmessage` switch. AUTO-RECONNECT on close after 3s (P2PCallLayer.tsx:96-101). ChatModal, P2PCallLayer and WatchTogetherModal each open their OWN socket — that's the norm; no singleton.

### Adding a NEW WS namespace (e.g. /ws/whiteboard)
Extend chatServer.ts's upgrade handler (line 109) with a second `url.pathname === '/ws/whiteboard'` branch that `handleUpgrade`s into a second `new WebSocketServer({noServer:true})`, reusing the SAME auth handshake and injection seams (`externalGetUserIdFromToken` token validator — fail-closed if not configured, line 144). Alternatively refactor `setupChatServer` to accept a `path → handler` map. If you instead want Socket.IO namespaces, you must wire `registerSocketServer(server)` in `startServer()` (server.ts:6218) AND add socketServer.ts to tsconfig include (currently excluded) — both currently un-wired.

### Reusable server-sent types already defined (reuse conventions)
`presence` {userId,status:'online'|'offline',lastSeen}, `typing_state` {conversationId,typers:[{id,name,username}]}, `message_received` {message}, `messages_read` {conversationId,readerId,messageIds}, `message_edited`/`message_deleted`/`message_reacted`/`message_pinned`, `call_offer`/`call_cancel`/`call_answer`{accepted}/`call_end`. REST→WS push from server.ts uses the imported `broadcastMessageToUsers(userIds, data)` (e.g. server.ts:2492, 3987). Caveat: scheduled-message ticker broadcasts type `'message'` (NOT `message_received`) so clients don't render it — match the exact type names.

### Injected seams (server.ts:6216-6218, chatServer.ts:9-18)
`setExternalSaveDatabase(saveDatabase)` and `setExternalTokenValidator(getUserIdFromToken)` are the ONLY server.ts→module injection points. Presence is partly simulated (~60% of users fake-online, 10s ticker) — treat `getUserStatus(userId)` (chatServer.ts:896) as the source of truth for REST.

---

## 7. UPLOAD + MEDIA

### The single generic route: `POST /api/upload` (server.ts:1072-1165)
- Multer: `multer({ dest: uploadsDir, limits: { fileSize: 200 * 1024 * 1024 } })` (server.ts:1065); `uploadsDir = path.join(process.cwd(),'uploads')` (1046-1048); field name `upload.single('file')`. NO mimetype whitelist — only an extension DENY-LIST `UNPLAYABLE_VIDEO_EXT = {mkv,avi,flv,wmv,m4v,3gp,rmvb,ts,mts,webmv}` (1070); rejected after multer wrote the temp file (cleaned via `fs.unlinkSync`).
- Multipart path: derive ext from `req.file.originalname`, rename to `media-${Date.now()}-${Math.floor(Math.random()*10000)}.${ext}`, `fs.renameSync` into uploadsDir, return **`{ success: true, url: '/uploads/<uniqueName>' }`** (1083-1088). NO auth middleware on this route. NO NSFW screening on the multipart path.
- Legacy base64 path (same route, body `{fileData, fileName, fileType}`): ext allow-list (mp4/webm/mov/avi/mkv/mp3/wav/ogg/m4a/png/jpg/jpeg/gif/webp), re-checks the deny-list, and for images runs server-side NSFW screening `serverScreenImage(fileData)` with 8s timeout → `403 {nsfw:{verdict:'block'}}` on block; returns `{success, url, filename, nsfw}` (1091-1160).
- Serving: `app.use('/uploads', express.static(uploadsDir, { acceptRanges:true, maxAge:'30d' }))` (1052-1055) enables video Range seeking; a trailing `/uploads` 404 handler prevents missing files falling through to the SPA catch-all (1060-1062).

### How a NEW upload route stores files and returns URLs
Copy the multer config verbatim, OR just reuse `/api/upload` for media payloads and send the returned `/uploads/<name>` URL in your JSON body. If you need your OWN route:
```ts
const upload = multer({ dest: uploadsDir, limits: { fileSize: 200 * 1024 * 1024 } });
app.post('/api/myfeature/upload', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'file required' });
  const ext = (req.file.originalname.split('.').pop() || 'bin').toLowerCase();
  if (UNPLAYABLE_VIDEO_EXT.has(ext)) { try { fs.unlinkSync(req.file.path); } catch {} return res.status(400).json({ error: 'Unsupported video format' }); }
  const uniqueName = `media-${Date.now()}-${Math.floor(Math.random()*10000)}.${ext}`;
  fs.renameSync(req.file.path, path.join(uploadsDir, uniqueName));
  res.json({ success: true, url: '/uploads/' + uniqueName });
});
```
- Client helper: `uploadMediaFile` (App.tsx:377-464) — multipart FormData first (`formData.append('file', file, fileName)`); images fall back to base64 JSON body; video/audio THROW on failure (no base64 fallback). Pre-upload client NSFW screening via `screenContentText` / `screenImageSource` (App.tsx:2507-2533).
- There is NO thumbnail/keyframe/transcode generation anywhere (grep thumbnail/ffmpeg/transcod → only a metadata field). If a feature needs thumbnails, that's net-new.
- To add a server-side image/vision analysis route, reuse `getNSFWJSNodeModel()` + `serverScreenImage` from turtleNSFWServerEngine.ts:48-65/185 (cached, self-retrying) or the Python pipeline `runPythonClassifier` (:96-130, root script `classify_nsfw_py3.py`; `server_models/` does not exist).

---

## 8. ROUTE PREFIX COLLISION LIST

Every prefix already mounted in server.ts (inline routes registered in file order, lines noted). **NEW feature routes MUST NOT collide with any of these; pick a fresh top-level segment.** Free-for-use today (verified 0 hits): `/api/reels*`, `/api/marketplace*`, `/api/bounty*`, `/api/family*`, `/api/wallet*`, `/api/streak*`, `/api/gig*`, `/api/whiteboard*`, `/api/live*`, `/api/trip*`, `/api/prayer*` etc. `app.put` is UNUSED (only get/post/patch/delete exist); only ONE `app.patch` exists (server.ts:3141).

- `/api/auth/*` — sessions GET (998), sessions/revoke POST (1023), signup (1403), verify-location (1510), login (1571), login/2fa (1649), logout (1751), verify-password (1759), me GET (1783), reset-request (1914), reset-confirm (1988), view-words (2063). PLUS module: telegram-webhook, otp-request, otp-verify, telegram-users GET (via registerTelegramOTPGatewayRoutes, mounted 5301).
- `/api/2fa/*` — setup (1688), verify (1708), disable (1728), status GET (1743).
- `/api/upload` POST (1072).
- `/api/stream/*` — token (1229), upsert-target (1284).
- `/api/profile/*` — update (2117), export GET (4553).
- `/api/posts/*` — feed GET (3685), create (3926), :postId GET (4056), :postId/edit (4164), :postId/delete (4203), :postId/report (4255), :postId/share (4405), :postId/like (4431), :postId/poll/vote (4517), :postId/comment (4593), :postId/need-text (4644), :postId/need-status (4702), :postId/comments/:commentId/react (4730), /edit (4777), /delete (4823).
- `/api/messages` POST (2184), GET (2207).
- `/api/chat/*` — conversations GET (2227)/POST (2647); users/:userId/block (2298), unblock (2314); conversations/:id/archive (2328), unarchive (2346), delete (2362), messages GET (2381)/POST (2411), read (2501), messages/:messageId/edit (2542), delete (2572), react (2609), pin (2731), mute (2755), messages/:messageId/vote (2777), forward (2819), settings (2870), join-code/:joinCode (2899); reports (2919); open-groups GET (2943); conversations/:id/join (3008); presence/:userId GET (3028); join-request (3037); join-requests GET (3088); join-requests/:requestId/approve (3101), reject (3121); PATCH conversations/:id/members/:userId (3141); messages/:messageId/delete-for-me (3176), delete-everyone (3193); messages/:messageId/save POST (3220) DELETE (3240); self-notes (3272); conversations/:id/schedule (3310); scheduled GET (3337); random-match (5697).
- `/api/saved` GET (3250).
- `/api/calls` POST (3386), GET (3407).
- `/api/creators` GET (3418), `/api/creators/:id` GET (3440), `/api/creators/:id/follow` (5069).
- `/api/admin/*` — reset-database (3646, UNPROTECTED), reports GET (4283), posts/:postId/action (4308), users GET (4339), users/:id/block (4355), scan (4374), stream-keys GET (5463) POST (5491) DELETE /:index (5512) /:index/toggle (5523), stream-usage GET (5534).
- `/api/notifications` GET (4998), read (5009), :id/read (5022).
- `/api/searchQueries` GET (5038), POST (5044).
- `/api/friends/*` — request/send (5120), request/accept (5163), request/decline (5221), unfriend (5252).
- `/api/link-preview` (5317).
- `/api/ai/*` — image (5360), summary (5548), status GET (5999), transcribe (6007), chat (6014), models GET (6025). PLUS modules: suggest-captions (5295), chat-copilot (5298).
- `/api/discovery/*` — location (5403), nearby GET (5430).
- `/api/channels` POST (5582) GET (5605), /:id GET (5614), /:id/subscribe (5622), /:id/videos POST (5634) GET (5661), /:id/videos/:videoId/view (5667).
- `/api/studio/stats` GET (5675).
- `/api/community/*` — root GET (5893), events (5898), events/:id/rsvp (5912), questions (5920), questions/:id/answers (5930), answers/:id/upvote (5940), topics/:id/join (5949), tips (5957), rewards GET (5968), rewards/:id/redeem (5979).
- `/api/feed/atlas-rank` GET (6037).
- `/api/nsfw/check` (3993 — keyword route; DUPLICATED by registerNSFWRoutes at 5304, the module copy is shadowed because 3993 registers first).
- `/api/meet/*` — match (5747), queue-stats GET (5855), leave (6113), room/:roomId/message (6132), room/:roomId/messages GET (6156), room/:roomId/signal (6162), room/:roomId/signals GET (6187).
- Module-registered: `/api/moderation/analyze` (5286), `/api/moderation/bengali` (5292), `/api/vehicle/analyze` (5289), `/api/emergency/pools` (+ /:id, join, contribute, resolve, requests, requests/:requestId/vote, report — mounted 5307, defined turtleEmergencyPoolsBackend.ts:151-350).

---

## 9. EXISTING-FEATURE INVENTORY (reuse, don't duplicate)

### Real, wired features you can build ON TOP of:
- **Coins/wallet/points** — community.json `balances` + `addBalance`/`spendBalance`/`tipCreator`/`trustPointsForUser`/`DEFAULT_REWARDS` (see §4). Trust score `user.trustScore` in database.json (+10 on 2FA).
- **SOS / emergency pools** — `SOSEmergencyButton.tsx` (client-side only, localStorage), `EmergencyView.tsx`, backend `/api/emergency/*` (turtleEmergencyPoolsBackend.ts, emergency.json). POOL categories include **blood** (BLOOD_NEEDED) — there is NO standalone blood-donor registry; a donor directory would extend this pool system.
- **Need posts / help requests** — `isNeedPost` + need* fields on posts, routes `/api/posts/:postId/need-text` (4644) and `need-status` (4702), `NeedPostPortal.tsx`. Reuse for blood-request/help-request features.
- **Community** — events/rsvp, Q&A, topics, tips, rewards (`/api/community/*`, `CommunitySection.tsx`).
- **Time capsules** — `isTimeCapsule`/`unlockDate`/`lockedAtDate` on posts, `EncryptedTimeCapsuleModal.tsx`, `TimeCapsuleLock.tsx`, AES-GCM+PBKDF2 client crypto.
- **Badges / achievements** — `src/lib/badges.ts` computeBadges() → 10 badges, Achievements panel (App.tsx:10142-10160).
- **Reputation / trust** — `src/lib/trust.js` (spec), `src/turtleProfileMetrics.ts`, feed ranking uses creator trust + interaction "evidence".
- **Portfolio profile** — `profile.skills/projects/websites`, `IdentityCard.tsx`.
- **Mood feed filter** — Learn/Laugh/Relax/Discover keyword pre-rank filter (App.tsx:1178-1189, 4897-4914).
- **Trending hashtags** — `HashtagTrendSection.tsx`, `turtleTrendingTopicEngine.ts`.
- **Chat / calls / meet / creator-studio / discovery / channels / voice-notes / watch-together / random-text-dm / geohash discovery / stream admin / ranking demo / away summary / digital wellness / accessibility mode / RTL / dark mode** — all live.
- **Moderation** — post reports (`/api/posts/:postId/report`, `/api/admin/reports`, `/api/admin/posts/:postId/action`), chat reports (`/api/chat/reports`), admin block (`/api/admin/users/:id/block`), NSFW screen + blur/block pipeline (`NSFWMediaGuard`, `serverScreenImage`). `SupabaseModerationService` in turtleModerationSystem.ts is SPEC ONLY (never instantiated) — do not assume penalties/appeals exist.
- **Ranking** — `/api/posts/feed` inline scorer (server.ts:3846-3906), `/api/feed/atlas-rank` (6037, wraps `masterFeedScore`), client `hybridRankItems` (src/lib/hybridRanker.ts, App.tsx:1805/4949), `turtleRankingEngine` (localStorage `turtle_ranking_v2`). Feature-index 55 `"bias"` slot in features.ts:289-290 is a free plug-in point for a user algorithm-preference.

### UI-ONLY DEMOS (client state, NO backend — backend for these is net-new): Family/Group Profiles, Local-First Offline Sync, Toxicity Nudge, Anonymous Whispers, Local Event Discovery, E2E Group Chat Simulator, Digital Wellness timer, Accessibility Mode, Cross-Post Regional Channels, AI Content Transparency Labels.

### NOT FOUND anywhere (build from scratch, 0 lines exist): bounty, relationship timeline, safe walk/escort, marketplace/listing, split bill, live broadcast, gig/job, barter, chit fund, savings circle, group buy, buy-nothing, garage sale, parking/carpool, tutor/tuition, internship, scholarship, lawyer/legal aid, menstrual/period health, flood, cyclone, shelter, missing person, mesh networking, route-safety score, zakat, azan/prayer, matrimony/nikkah, mosque/venue, trip/travel, hidden gem, CNG/rickshaw/fare, real-time traffic, ActivityPub/fediverse, KYC/ZKP/zk, hardware wallet, post-quantum, C2PA/watermark, persona, topic hub, skill exchange, alumni, resume/CV, interview, terminal/xterm, govt job/circular, RTI/FIR/police, ward, tender, land trust, contract/e-sign, podcast, streak gamification, story chain, doomscroll blocker, shared whiteboard/drawing, faceless, trending sound/music.

### Reuse targets for the ~140 features (dependencies, not duplications):
- **Bounty/marketplace/split-bill/wallet** → build on community.json `balances` (§4) + new pure-logic module + inline routes. No cart/checkout exists.
- **Blood donor / donor registry** → extend `turtleEmergencyPools` (BLOOD_NEEDED pool, `isDonorVerified`, `verificationReferenceCode`) — do NOT create a parallel SOS.
- **Family/guardian** → currently UI-only in App.tsx:8082-8170; needs a backend collection + routes.
- **Video/whiteboard/co-streaming** → Jitsi iframe (JitsiMeeting.tsx) for groups, P2P WebRTC (useP2PCall.ts) for 1:1, Meet REST-relay for random pairing. Best whiteboard button slot: ActiveP2PCallScreen.tsx:138-189 control bar (1:1) / ActiveCallScreen.tsx:156-204 (Stream). No canvas/drawing code exists anywhere yet. Live broadcast is NOT built — Stream SDK here is 1:1 calls, not broadcast.
- **Reels** → client-side derived view only (posts with videoUrl → `reel-feed-<id>`); NO `/api/reels*` routes; reel creation is un-wired. A reels feature = server routes + persistence (new), not reuse.

---

## 10. VERIFICATION GATE

### Typecheck (the gate)
- `npm run lint` = **`tsc --noEmit`** (package.json:12). **Baseline is CLEAN: exit 0, zero errors** (verified). It checks **1559 files** under NON-strict settings.
- tsconfig include is exactly `["src/**/*", "server.ts"]`, exclude `["src/reference/**"]`. Settings: target ES2022, module ESNext, moduleResolution bundler, jsx react-jsx, allowJs (no checkJs), skipLibCheck, noEmit, `strict` OFF, no noUnusedLocals/Parameters. `paths: {"@/*": ["./*"]}` is configured but **unused by live code — use relative imports** (`./types`, `../turtleNSFWFilter`, `./components/X`). `.js` suffix imports resolve to `.ts` siblings (server.ts:14 `'./chatServer.js'` → chatServer.ts); explicit `.tsx`/`.js` extensions are legal.
- **CRITICAL: keep new code under `src/**` and NEVER import root-level leftovers or `src/reference/**`** — root `App.tsx`, `App-1/2/3.tsx`, `AppContext.tsx`, `WorldMeet.tsx`, root `ChatModal.tsx`/`CommentsModal*`/`PostsSection.tsx`/`SafeImage.tsx`/`ChatRoom.tsx`, `socketServer.ts`, `server-1.ts`, `auth.ts`, `matchmaking.ts`, `schema.ts` are excluded from the program and mostly non-compiling; importing any of them breaks the clean gate.
- Files that ARE live and checked: `server.ts`, `chatServer.ts`, `turtleNSFWFilter.ts`, `turtleNSFWServerEngine.ts`, root `turtleRankingEngine.ts`, `src/**` (minus reference). `src/lib/*.js` (base44Utils.js, moderation.js, trust.js) are in the program but not typechecked.

### Run the server
- Dev: `npm run dev` = `tsx server.ts` → Express on `http://localhost:3000` ("0.0.0.0", server.ts:6213), Vite middleware serves the client in dev (no SPA catch-all); no proxy needed (same origin). Hardcoded mock env fallbacks for TELEGRAM_BOT_TOKEN/JWT_SECRET/REDIS_URL at server.ts:33-41 keep it bootable in sandbox.
- Prod: `npm run build` (vite build + esbuild server bundle → dist/server.cjs) then `npm start`.
- Note: `startServer()` calls `setExternalSaveDatabase(saveDatabase)`, `setExternalTokenValidator(getUserIdFromToken)`, `setupChatServer(server)` at server.ts:6216-6218 — extend there if adding new injected seams or a second WS namespace.

### Known baseline issues / gotchas (from the surveys — do not "fix" silently, do not trip on)
1. **`/api/nsfw/check` shadow bug** — inline keyword route (server.ts:3993) registers BEFORE `registerNSFWRoutes(app)` (5304), so the model-based `imageData` endpoint is unreachable; real model screening only runs in the /api/upload base64 branch. If a feature needs server image screening, call `serverScreenImage` directly.
2. **No auth on `POST /api/upload`** — a bearer header is ignored; any feature that needs ownership on uploads must add its own guard.
3. **`/api/admin/reset-database` is UNPROTECTED** (server.ts:3646) — known security blocker (CLAUDE.md).
4. **Mock `JWT_SECRET` fallback** (server.ts:37-39) and hardcoded scrypt `MASTER_KEY` constant (server.ts:740) — known blockers; MASTER_KEY env is the admin gate.
5. **Client double-ranking** — `/api/posts/feed` ranks server-side but the client re-ranks with `hybridRankItems` on every render (App.tsx:4949). A new ranking feature must hook `hybridRanker`/App.tsx to affect UI, or wire `/api/feed/atlas-rank` into the client.
6. **hybridRanker quirks** — `watchDuration` hardcoded 15s (hybridRanker.ts:118); `platformWeights {tiktok:0.5, instagram:0.25, youtube:0.25}` (line 148) contradicts engine default {instagram:0.50, youtube:0.25, tiktok:0.25}.
7. **SOS button is 100% client-side** (localStorage only, GPS hardcoded 0,0) — does not touch `/api/emergency/*`; wiring it to the backend is net-new.
8. **Live SOS presence is partly simulated** (chatServer fake-online seed + 10s ticker) — don't build hard guarantees on presence.
9. **TURN absent** in both P2P paths (STUN-only) — calls can fail across strict NATs. **Jitsi "Open in new tab"/fallback links hardcode `meet.jit.si`**, ignoring `VITE_JITSI_HOST`. `JitsiMeeting.isVideo` prop is accepted-but-unused.
10. **SafeImage.tsx (root) is unused** — the live sensitive-media component is `src/components/NSFWMediaGuard.tsx`. Use that.
11. **Reels have no backend and no creation path**; `MOCK_REELS = []` (src/reelsData.ts:22); the "Reel Simulator" UI state is un-wired.
12. **No ESLint/prettier** — "lint" is only `tsc --noEmit`; there are no linting rules beyond typecheck.
13. **`AnimatePresence` overlays & dark-mode**: new full-screen overlays should use `z-[115]` and `dark:bg-zinc-950/95` per convention; plain conditionals (not AnimatePresence) are also acceptable (TimeCapsule, AdminPanel).
14. **Persistence re-reads**: `loadDatabase()` and `loadCommunity()` read disk per request — a module holding its own in-memory copy (chatServer, emergency) must explicitly load/save to stay consistent.
