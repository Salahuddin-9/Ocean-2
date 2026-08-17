// Cross-check every hub feature: component exists, component is imported by the
// hub, and the API paths the component calls exist in the route inventory.
import fs from 'fs';
import path from 'path';

const root = process.cwd();
const hubPath = path.join(root, 'src/components/NewFeaturesHub.tsx');
const hub = fs.readFileSync(hubPath, 'utf8');
const inv = JSON.parse(fs.readFileSync(path.join(root, 'scripts/route-inventory.json'), 'utf8'));
const routes = new Set(inv.routes.map((r) => `${r.method}:${r.path}`));
const routePaths = new Set(inv.routes.map((r) => r.path));

// 1. Extract features: id, badge number (each feature is one line)
const features = [];
for (const line of hub.split('\n')) {
  const m = line.match(/\{\s*id:\s*['"]([^'"]+)['"]\s*,[^]*?badge:\s*['"](\d+)['"]\s*\}/);
  if (m) features.push({ id: m[1], badge: Number(m[2]) });
}

// 2. Which components does the hub import?
const hubImports = new Set();
for (const m of hub.matchAll(/import\s+(?:(\w+)|{([^}]+)})\s+from\s+['"]\.\/([^'"]+)['"]/g)) {
  const names = [m[1], ...(m[2] ? m[2].split(',').map((s) => s.trim()) : [])].filter(Boolean);
  for (const n of names) hubImports.add(n);
}

// 3. For each feature, find the render case component name
const renderBlock = hub.slice(hub.indexOf('activeFeature') < 0 ? 0 : 0);
// render cases like: {active === 'whiteboard' && <CallWhiteboard .../>}
const renderCases = new Map();
for (const m of hub.matchAll(/active\s*===\s*['"]([^'"]+)['"]\s*&&\s*\(?<([A-Za-z0-9_]+)[^>]*>/g)) {
  renderCases.set(m[1], m[2]);
}

// 4. Component -> file existence (recursive — some live in call/ and editors/)
const compFiles = new Set();
function walkComp(dir) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walkComp(p);
    else if (ent.name.endsWith('.tsx')) compFiles.add(ent.name);
  }
}
walkComp(path.join(root, 'src/components'));

function compFileExists(name) {
  return compFiles.has(`${name}.tsx`);
}

// 5. API paths used by each feature's component (fetch('/api/...') and api('/api/...'))
function findCompFile(name) {
  const queue = [path.join(root, 'src/components')];
  while (queue.length) {
    const dir = queue.pop();
    const p = path.join(dir, `${name}.tsx`);
    if (fs.existsSync(p)) return p;
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      if (ent.isDirectory()) queue.push(path.join(dir, ent.name));
    }
  }
  return null;
}

function apiPathsOf(compName) {
  const f = findCompFile(compName);
  if (!f) return [];
  const src = fs.readFileSync(f, 'utf8');
  const paths = new Set();
  for (const m of src.matchAll(/(?:fetch|api|act)\(\s*[`'"]((?:\/api|\/\.well-known|\/uploads|\/ws)\/[^`'"]+)[`'"]/g)) {
    paths.add(m[1]);
  }
  // Backtick template literals may embed quotes inside ${...} interpolations
  // (e.g. `${refresh ? '/refresh' : ''}`) which truncates the class-based
  // capture above. Catch those separately with a balanced-ish capture.
  for (const m of src.matchAll(/fetch\(\s*`((?:\/api|\/\.well-known|\/uploads|\/ws)\/[^`]*)`/g)) {
    const p = m[1];
    if (p.includes('${')) paths.add(p);
  }
  return [...paths];
}

function matchesRoute(wild) {
  const segs = wild.split('/');
  for (const rp of routePaths) {
    const rsegs = rp.split('/');
    if (rsegs.length !== segs.length) continue;
    let ok = true;
    for (let i = 0; i < segs.length; i++) {
      if (segs[i] === 'PARAM' || rsegs[i] === segs[i]) continue;
      if (rsegs[i].startsWith(':')) continue;
      ok = false;
      break;
    }
    if (ok) return true;
  }
  return false;
}

function routeExists(p) {
  // 0) A class-based capture may truncate a template literal at an embedded
  //    quote, leaving an unclosed `${`. Treat a trailing `${` as a wildcard.
  if (/\$\{[^}]*$/.test(p)) p = p.replace(/\$\{[^}]*$/, '${X}');
  // 1) Protect ${...} interpolations from the query split (a `?` may appear
  //    inside an expression, e.g. `${refresh ? '/refresh' : ''}`).
  const protected_ = p.replace(/\$\{[^}]*\}/g, (m) => m.replace(/\?/g, '\u0001'));
  // 2) Strip query string + trailing slash.
  let clean = protected_.split('?')[0].replace(/\/+$/, '');
  // 3) Mid-path ${...} interpolations become wildcard segments.
  const wild = clean.replace(/\$\{[^}]*\}/g, 'PARAM');
  // 4) If the original ended with a ${...}, it is ambiguous: it may be an
  //    optional suffix (query string / `/refresh`) OR a real segment whose
  //    concrete values map to distinct backend routes (e.g. ${kind} ∈
  //    {release, refund}). Try both: stripped, then as a wildcard segment.
  if (matchesRoute(wild)) return true;
  if (/\$\{[^}]*\}$/.test(clean)) {
    const stripped = clean.replace(/\$\{[^}]*\}$/, '');
    if (matchesRoute(stripped.replace(/\$\{[^}]*\}/g, 'PARAM'))) return true;
  }
  return false;
}

const rows = [];
for (const f of features.sort((a, b) => a.badge - b.badge)) {
  const comp = renderCases.get(f.id) || (hubImports.has(f.id[0].toUpperCase() + f.id.slice(1)) ? f.id[0].toUpperCase() + f.id.slice(1) : '');
  const compExists = !!comp && compFileExists(comp);
  const rendered = renderCases.has(f.id);
  const paths = comp ? apiPathsOf(comp) : [];
  const missing = paths.filter((p) => !routeExists(p));
  const status = compExists && rendered && missing.length === 0 ? 'Wired' : compExists && rendered ? 'Partial' : 'Dead';
  rows.push({
    badge: f.badge,
    id: f.id,
    component: comp || '—',
    compExists,
    rendered,
    apiCalls: paths.length,
    missingRoutes: missing,
    status,
  });
}

console.log(`Hub features: ${rows.length}`);
console.log('Wired:', rows.filter((r) => r.status === 'Wired').length);
console.log('Partial:', rows.filter((r) => r.status === 'Partial').length);
console.log('Dead:', rows.filter((r) => r.status === 'Dead').length);
console.log('\n=== PARTIAL / DEAD ===');
for (const r of rows.filter((r) => r.status !== 'Wired')) {
  console.log(`#${r.badge} ${r.id} comp=${r.component} exists=${r.compExists} rendered=${r.rendered} api=${r.apiCalls} missing=[${r.missingRoutes.join(', ')}]`);
}

fs.writeFileSync(path.join(root, 'scripts', 'feature-wiring.json'), JSON.stringify(rows, null, 2));
