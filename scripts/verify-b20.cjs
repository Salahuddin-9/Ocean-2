// Quick verification of Batch B20 (features 249-260) routes — run: node scripts/verify-b20.cjs
const fs = require('fs');
const path = require('path');
const root = process.cwd();

function routesOf(file) {
  const p = path.join(root, 'src', file);
  if (!fs.existsSync(p)) return { missing: true, routes: [] };
  const src = fs.readFileSync(p, 'utf8');
  const routes = [];
  const re = /app\.(get|post|put|patch|delete)\(\s*['"`](\/api\/[^'"`]+)['"`]/g;
  let m;
  while ((m = re.exec(src)) !== null) routes.push(m[2]);
  return { missing: false, routes };
}

const checks = [
  ['turtleStoriesBackend.ts', '249 Stories 2.0 (24h, reactions, viewers)'],
  ['turtleVideoEditorBackend.ts', '250/251 Ocean Cut + 257 (subtitles, enhance)'],
  ['turtleLiveEcosystemBackend.ts', '252 Live Gifts (coins, goals, leaderboard)'],
  ['turtleMiniAppsBackend.ts', '253 Mini Apps (register/list + commission)'],
  ['turtleCommunitiesProBackend.ts', '254 Communities Pro (threads/templates/events)'],
  ['turtleCreatorMonetizationBackend.ts', '255 Monetization (brand deals, affiliate)'],
  ['turtleProGraphBackend.ts', '256 Pro Graph (endorsements/recommendations)'],
  ['turtleSnapMapBackend.ts', '258 Snap Map + private stories + best friends'],
  ['turtleOSLayerBackend.ts', '259 OS Layer (flags/experiments admin)'],
  ['turtleDataBrainBackend.ts', '260 Data Brain (CSV export, analytics)'],
];

for (const [file, label] of checks) {
  const { missing, routes } = routesOf(file);
  console.log(`\n=== ${label} ===`);
  if (missing) { console.log('  !! FILE MISSING'); continue; }
  if (routes.length === 0) { console.log('  !! NO ROUTES FOUND'); continue; }
  for (const r of routes) console.log(`  ${r}`);
}
