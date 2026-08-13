#!/usr/bin/env bash
# Ocean production smoke test — Phase 7 verification.
set -u
cd "$(pwd)"

# Back up mutable state so the test does not pollute the real DB.
cp database.json /tmp/ocean-db-backup.json 2>/dev/null || true
cp sessions.json /tmp/ocean-sessions-backup.json 2>/dev/null || true

# Kill any prior instance on :3000
( kill $(netstat -ano 2>/dev/null | grep ':3000' | grep LISTENING | awk '{print $5}' | sort -u) 2>/dev/null ) || true

node dist/server.cjs > /tmp/ocean-server.log 2>&1 &
SERVER_PID=$!
echo "server pid: $SERVER_PID"

# Wait for boot (up to 60s)
BOOTED=0
for i in $(seq 1 60); do
  if curl -s -o /dev/null http://localhost:3000/api/sos/meta; then
    BOOTED=1
    break
  fi
  sleep 1
done

if [ "$BOOTED" -ne 1 ]; then
  echo "FAIL: server did not boot within 60s. Last log lines:"
  tail -20 /tmp/ocean-server.log
  kill $SERVER_PID 2>/dev/null
  exit 1
fi
echo "OK: server booted"

PASS=0
FAIL=0
check() {
  local name="$1"
  local expect="$2"
  local actual="$3"
  if [ "$expect" = "$actual" ]; then
    echo "PASS: $name"
    PASS=$((PASS+1))
  else
    echo "FAIL: $name (expected $expect, got $actual)"
    FAIL=$((FAIL+1))
  fi
}

# 1. Upload without auth → 401
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:3000/api/upload)
check "upload requires auth (401)" "401" "$STATUS"

# 2. Invalid signup (short password) → 400
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:3000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"name":"Smoke Tester","email":"smoke@test.local","password":"short"}')
check "signup rejects short password (400)" "400" "$STATUS"

# 3. Valid signup → 200
SIGNUP=$(curl -s -X POST http://localhost:3000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"name":"Smoke Tester","email":"smoke@test.local","password":"correct-horse-battery"}')
echo "$SIGNUP" | grep -q '"message": "Signup successful' && echo "PASS: valid signup" && PASS=$((PASS+1)) || { echo "FAIL: valid signup: $SIGNUP"; FAIL=$((FAIL+1)); }

# 4. Login → token
LOGIN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"smoke@test.local","password":"correct-horse-battery"}')
TOKEN=$(echo "$LOGIN" | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')
if [ -n "$TOKEN" ]; then echo "PASS: login issued token"; PASS=$((PASS+1)); else echo "FAIL: login issued token"; FAIL=$((FAIL+1)); fi

AUTH="Authorization: Bearer $TOKEN"

# 5. /api/auth/me
STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/auth/me -H "$AUTH")
check "auth/me (200)" "200" "$STATUS"

# 6. Reels feed (auth) → 200
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:3000/api/reels/feed?limit=10" -H "$AUTH")
check "reels feed (200)" "200" "$STATUS"

# 7. Reels feed without auth → 401
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:3000/api/reels/feed?limit=10")
check "reels feed requires auth (401)" "401" "$STATUS"

# 8. NSFW keyword check → block verdict
NSFW=$(curl -s -X POST http://localhost:3000/api/nsfw/check \
  -H "Content-Type: application/json" -d '{"text":"explicit porn content"}')
echo "$NSFW" | grep -q '"verdict":"block"' && echo "PASS: nsfw keyword block" && PASS=$((PASS+1)) || { echo "FAIL: nsfw keyword block: $NSFW"; FAIL=$((FAIL+1)); }

# 9. SOS meta (guest-safe) → 200
STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/sos/meta)
check "sos meta (200)" "200" "$STATUS"

# 10. Create a reel then view it
REEL=$(curl -s -X POST http://localhost:3000/api/reels/upload -H "$AUTH" \
  -H "Content-Type: application/json" \
  -d '{"videoUrl":"https://assets.mixkit.co/videos/preview/mixkit-stars-in-space-background-1611-large.mp4","caption":"Smoke test reel"}')
REEL_ID=$(echo "$REEL" | sed -n 's/.*"id":"\([^"]*\)".*/\1/p')
if [ -n "$REEL_ID" ]; then
  echo "PASS: reel created ($REEL_ID)"; PASS=$((PASS+1))
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "http://localhost:3000/api/reels/$REEL_ID/view" -H "$AUTH" -H "Content-Type: application/json" -d '{"watchSeconds":4}')
  check "reel view analytics (200)" "200" "$STATUS"
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "http://localhost:3000/api/reels/$REEL_ID/like" -H "$AUTH")
  check "reel like toggle (200)" "200" "$STATUS"
else
  echo "FAIL: reel created: $REEL"; FAIL=$((FAIL+1))
fi

# 11. Upload with disguised content (text claiming .png) → 400
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:3000/api/upload -H "$AUTH" \
  -F "file=@/tmp/ocean-disguise.txt;filename=fake.png;type=image/png")
check "disguised upload rejected (400)" "400" "$STATUS"

# 12. Bad auth token → 401
STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/auth/me -H "Authorization: Bearer not-a-real-token")
check "invalid token rejected (401)" "401" "$STATUS"

echo ""
echo "=== RESULTS: $PASS passed, $FAIL failed ==="
kill $SERVER_PID 2>/dev/null
# Clean up test data (Firestore + local db + sessions)
node scripts/cleanup-smoke.cjs 2>/dev/null | tail -3
exit $FAIL
