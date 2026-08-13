import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();
const EXT_CANDIDATES = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];

function resolveSpecifier(fromFile, spec) {
  if (spec.startsWith('@/')) spec = path.join(ROOT, spec.slice(2));
  if (!spec.startsWith('.') && !spec.startsWith('/')) return null; // bare module
  const base = spec.startsWith('/') ? spec : path.join(path.dirname(fromFile), spec);
  // strip query/hash
  const clean = base.split('?')[0].split('#')[0];
  if (!clean) return null;
  // direct file match
  for (const ext of ['', ...EXT_CANDIDATES]) {
    const cand = clean + ext;
    if (fs.existsSync(cand) && fs.statSync(cand).isFile()) return path.normalize(cand);
  }
  // ESM-style: specifier ends in .js/.jsx but source is .ts/.tsx
  if (/\.[jt]sx?$/.test(clean)) {
    const base = clean.replace(/\.(js|jsx)$/, '');
    for (const ext of EXT_CANDIDATES) {
      const cand = base + ext;
      if (fs.existsSync(cand) && fs.statSync(cand).isFile()) return path.normalize(cand);
    }
  }
  // directory index
  for (const ext of EXT_CANDIDATES) {
    const cand = path.join(clean, 'index' + ext);
    if (fs.existsSync(cand)) return path.normalize(cand);
  }
  return null;
}

const IMPORT_RE = /(?:^|[\s;])(?:import\s+(?:[\w*{}, \n]+?\s+from\s+)?['"]([^'"]+)['"]|export\s+(?:\*\s+from|\{[^}]*\}\s+from)\s+['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|require\s*\(\s*['"]([^'"]+)['"]\s*\))/g;

function collectImports(file) {
  let src;
  try { src = fs.readFileSync(file, 'utf8'); } catch { return []; }
  const out = [];
  let m;
  while ((m = IMPORT_RE.exec(src))) {
    const spec = m[1] || m[2] || m[3] || m[4];
    if (!spec) continue;
    const resolved = resolveSpecifier(file, spec);
    if (resolved && fs.existsSync(resolved)) out.push(resolved);
  }
  return out;
}

function closure(roots) {
  const seen = new Set();
  const queue = [...roots];
  while (queue.length) {
    const f = queue.shift();
    if (seen.has(f)) continue;
    seen.add(f);
    for (const dep of collectImports(f)) if (!seen.has(dep)) queue.push(dep);
  }
  return seen;
}

// All candidate files: root-level ts + src/** (exclude node_modules/dist/reference)
const candidates = new Set();
function walk(dir) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (['node_modules', 'dist', 'reference', 'server'].includes(e.name)) continue;
      walk(p);
    } else if (/\.(ts|tsx|js|jsx)$/.test(e.name) && !e.name.endsWith('.d.ts')) {
      candidates.add(path.normalize(p));
    }
  }
}
walk(ROOT);
// exclude node_modules nested under anything
for (const f of [...candidates]) {
  if (f.includes(`${path.sep}node_modules${path.sep}`)) candidates.delete(f);
}

const backendRoot = closure([path.join(ROOT, 'server.ts')]);
const frontendRoot = closure([path.join(ROOT, 'src', 'main.tsx')]);

// DEBUG: editor chain
const d1 = path.join(ROOT, 'src', 'components', 'editors', 'OceanCanvasDesign.tsx');
const d2 = path.join(ROOT, 'src', 'lib', 'editors', 'fabric', 'canvasManager.ts');
console.log('[debug] OceanCanvasDesign in frontend closure:', frontendRoot.has(d1));
console.log('[debug] canvasManager in frontend closure:', frontendRoot.has(d2));
if (frontendRoot.has(d1)) console.log('[debug] collectImports(OceanCanvasDesign):', collectImports(d1).map(p => path.relative(ROOT, p)));

const rel = (f) => path.relative(ROOT, f).split(path.sep).join('/');

const categories = { both: [], backend: [], frontend: [], dead: [] };
for (const f of candidates) {
  const b = backendRoot.has(f), fr = frontendRoot.has(f);
  if (b && fr) categories.both.push(rel(f));
  else if (b) categories.backend.push(rel(f));
  else if (fr) categories.frontend.push(rel(f));
  else categories.dead.push(rel(f));
}

console.log('=== CLOSURE SUMMARY ===');
console.log(`backend-reachable: ${backendRoot.size} files | frontend-reachable: ${frontendRoot.size} files | candidates: ${candidates.size}`);
console.log(`\n=== CATEGORY COUNTS ===`);
for (const k of Object.keys(categories)) console.log(`${k}: ${categories[k].length}`);

console.log(`\n=== DEAD (reachable from NEITHER root) — ${categories.dead.length} ===`);
for (const f of categories.dead.sort()) console.log('  ' + f);
