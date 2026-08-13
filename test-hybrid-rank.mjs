// Smoke test: hybrid ranking engine (50% IG / 25% YT / 25% TT + FB Boost Post)
// Run: npx tsx test-hybrid-rank.mjs
import { hybridRankItems, buildHybridContext } from './src/lib/hybridRanker.ts';
import { turtleRankingEngine } from './src/turtleRankingEngine.ts';
import { DEFAULT_ENGINE_CONFIG } from './src/engine/config.ts';

const now = Date.now();
const mk = (id, likes, createdAtMs) => ({
  id,
  title: `Post ${id}`,
  content: `content of ${id}`,
  creatorId: `creator-${id % 3}`,
  creator: { id: `creator-${id % 3}` },
  likes,
  comments: [1, 2, 3],
  sharesCount: likes,
  createdAt: createdAtMs,
});

// Baseline items (created at different ages)
const items = [
  mk('post-a', 120, now - 3600e3),   // 1h old, decent likes
  mk('post-b', 500, now - 48 * 3600e3), // 2d old, many likes
  mk('post-c', 5, now - 5 * 3600e3),  // new, few likes
  mk('post-d', 80, now - 12 * 3600e3),
];

// 1. Baseline ranking
const base = hybridRankItems(items, { language: 'en', country: 'US' }, 'post');
console.log('1. BASELINE ORDER:', base.map((p) => `${p.id}(${p.__rankScore})`).join(' -> '));

// 2. Boost post-c (the new low-engagement one) -> should jump up via boost multiplier
turtleRankingEngine.recordSignal('post-c', 'boost');
const boostCtx = buildHybridContext({ language: 'en', country: 'US' });
const boosted = hybridRankItems(items, boostCtx, 'post');
console.log('2. AFTER BOOST post-c:', boosted.map((p) => `${p.id}(${p.__rankScore})`).join(' -> '));
const cBreakdown = boosted.find((p) => p.id === 'post-c')?.__rankBreakdown;
console.log('   post-c breakdown boostMultiplier =', cBreakdown?.boostMultiplier, '(expect >1, capped at', DEFAULT_ENGINE_CONFIG.thresholds.maxBoostMultiplier + ')');

// 3. Mark post-a as not_interested -> heavy penalty should sink it to the bottom
turtleRankingEngine.recordSignal('post-a', 'not_interested', 'Post A content');
const fbCtx = buildHybridContext({ language: 'en', country: 'US' });
const feedback = hybridRankItems(items, fbCtx, 'post');
console.log('3. AFTER NOT-INTERESTED post-a:', feedback.map((p) => `${p.id}(${p.__rankScore})`).join(' -> '));
const aBreakdown = feedback.find((p) => p.id === 'post-a')?.__rankBreakdown;
console.log('   post-a feedbackScore =', aBreakdown?.feedbackScore, '(expect ~ -3 from beta_neg)');

// 4. Mark post-d as interested -> slight lift
turtleRankingEngine.recordSignal('post-d', 'interested', 'Post D content');
const fbCtx2 = buildHybridContext({ language: 'en', country: 'US' });
const feedback2 = hybridRankItems(items, fbCtx2, 'post');
console.log('4. AFTER INTERESTED post-d:', feedback2.map((p) => `${p.id}(${p.__rankScore})`).join(' -> '));
const dBreakdown = feedback2.find((p) => p.id === 'post-d')?.__rankBreakdown;
console.log('   post-d feedbackScore =', dBreakdown?.feedbackScore, '(expect +0.1)');

const boostedOk = cBreakdown?.boostMultiplier > 1;
const sankOk = feedback.find((p) => p.id === 'post-a') === feedback[feedback.length - 1] && aBreakdown?.feedbackScore < 0;
console.log('\nRESULT:', boostedOk && sankOk ? 'PASS ✅ — boost lifts score, not-interested sinks post' : 'FAIL ❌', { boostedOk, sankOk });
