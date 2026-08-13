// import-graph.cjs — Mechanical import/reachability/duplicate analysis for Ocean-V1 - Copy
// Builds a real import graph from the actual source files and reports, per file:
//   importers, reachable-from-entry (client/server/realtime), dead status
const fs = require('fs');
const path = require('path');

const ROOT = 'G:/OnmiRouter-Test/Ocean-V1 - Copy';
const SKIP_DIRS = ['node_modules', 'dist', '.git', 'assets', 'uploads'];
const SKIP_EXT = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.wasm', '.map', '.ico', '.woff', '.woff2', '.lock'];

// ── Enumerate source files ──
function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name.startsWith('.') && ent.name !== '.env.example') continue;
    if (SKIP_DIRS.includes(ent.name)) continue;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

// ── Resolve an import specifier to an actual file (or null) ──
function resolveImport(fromFile, spec) {
  if (spec.startsWith('@/')) spec = spec.slice(2);
  // bare package imports → not a project file
  if (!spec.startsWith('.') && !spec.startsWith('/') && !spec.startsWith('@/')) return null;
  const base = spec.startsWith('/') ? ROOT : path.dirname(fromFile);
  const cands = [];
  const raw = path.resolve(base, spec);
  const EXT_ALIAS = { '.js': '.ts', '.jsx': '.tsx' };
  if (raw.endsWith('.ts') || raw.endsWith('.tsx') || raw.endsWith('.js') || raw.endsWith('.jsx') || raw.endsWith('.mjs') || raw.endsWith('.cjs')) {
    cands.push(raw);
    // ESM-in-TS convention: imports written as .js / .jsx point at .ts / .tsx files
    for (const [from, to] of Object.entries(EXT_ALIAS)) {
      if (raw.endsWith(from)) cands.push(raw.slice(0, -from.length) + to);
    }
  } else {
    cands.push(raw, raw + '.ts', raw + '.tsx', raw + '.js', raw + '.jsx', raw + '.mjs', raw + '.cjs',
      path.join(raw, 'index.ts'), path.join(raw, 'index.tsx'), path.join(raw, 'index.js'), path.join(raw, 'index.jsx'));
    // strip ext alias for the directory-index case too
    for (const [from, to] of Object.entries(EXT_ALIAS)) {
      if (raw.endsWith(from)) cands.push(raw.slice(0, -from.length) + to);
    }
  }
  for (const c of cands) {
    try {
      if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
    } catch { /* ignore */ }
  }
  return null;
}

// Precise import extraction. Patterns:
//   from './x'                      (static import / re-export / export-from)
//   import './x'                    (side-effect import)
//   import('./x')                   (dynamic import)
//   require('./x')                  (CJS require)
//   require = require('x')          (TS import-equals via __require shim)
const FROM_RE = /(?:^|[^\w.])from\s*['"]([^'"]+)['"]/g;
const SIDE_EFFECT_RE = /\bimport\s*['"]([^'"]+)['"]/g;
const DYNAMIC_RE = /\bimport\s*\(\s*['"]([^'"]+)['"]/g;
const REQUIRE_RE = /\brequire\s*\(\s*['"]([^'"]+)['"]/g;
const IMPORT_EQUALS_RE = /\bimport\s+[^'"]+?\s*=\s*require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

function extractImports(file, contents) {
  const deps = new Set();
  let m;
  for (const re of [FROM_RE, SIDE_EFFECT_RE, DYNAMIC_RE, REQUIRE_RE, IMPORT_EQUALS_RE]) {
    re.lastIndex = 0;
    while ((m = re.exec(contents)) !== null) deps.add(m[1]);
  }
  return [...deps];
}

// ── Build graph ──
const files = walk(ROOT).filter(f => !SKIP_EXT.includes(path.extname(f)));
const graph = new Map(); // file -> {deps: Set(resolved), raw: [spec]}
for (const f of files) {
  const contents = fs.readFileSync(f, 'utf8');
  const raw = extractImports(f, contents);
  const deps = new Set();
  for (const spec of raw) {
    const resolved = resolveImport(f, spec);
    if (resolved && fs.existsSync(resolved)) deps.add(path.normalize(resolved));
  }
  graph.set(path.normalize(f), { deps, raw, contents });
}

// ── Reverse index: importers ──
const importers = new Map(); // file -> Set(importers)
for (const [f, info] of graph) {
  for (const d of info.deps) {
    if (!importers.has(d)) importers.set(d, new Set());
    importers.get(d).add(f);
  }
}

// ── Reachability from entry points ──
function reachableFrom(entry) {
  const seen = new Set();
  const stack = [path.normalize(entry)];
  while (stack.length) {
    const cur = stack.pop();
    if (seen.has(cur)) continue;
    seen.add(cur);
    const info = graph.get(cur);
    if (!info) continue;
    for (const d of info.deps) if (!seen.has(d)) stack.push(d);
  }
  return seen;
}

const clientEntry = path.normalize(path.join(ROOT, 'src/main.tsx'));
const serverEntry = path.normalize(path.join(ROOT, 'server.ts'));
const chatEntry = path.normalize(path.join(ROOT, 'chatServer.ts'));
const socketEntry = path.normalize(path.join(ROOT, 'socketServer.ts'));

const clientReach = reachableFrom(clientEntry);
const serverReach = reachableFrom(serverEntry);
const chatReach = reachableFrom(chatEntry);
const socketReach = reachableFrom(socketEntry);

const allReach = new Set([...clientReach, ...serverReach, ...chatReach, ...socketReach]);

// ── Duplicate detection (byte-identical + near-identical size) ──
const bySize = new Map();
for (const [f, info] of graph) {
  const size = info.contents.length;
  if (!bySize.has(size)) bySize.set(size, []);
  bySize.get(size).push(f);
}
const exactDuplicates = [];
for (const [size, list] of bySize) {
  if (list.length < 2) continue;
  const byHash = new Map();
  for (const f of list) {
    const h = require('crypto').createHash('sha256').update(graph.get(f).contents).digest('hex');
    if (!byHash.has(h)) byHash.set(h, []);
    byHash.get(h).push(f);
  }
  for (const [h, l] of byHash) if (l.length > 1) exactDuplicates.push(l);
}

// ── Output ──
const rel = f => path.relative(ROOT, f).replace(/\\/g, '/');
const rows = [];
for (const f of files) {
  const n = path.normalize(f);
  const imp = importers.get(n) ? [...importers.get(n)].map(rel).sort() : [];
  const inClient = clientReach.has(n);
  const inServer = serverReach.has(n);
  const inChat = chatReach.has(n);
  const inSocket = socketReach.has(n);
  const reachable = allReach.has(n);
  const isEntry = [clientEntry, serverEntry, chatEntry, socketEntry].includes(n);
  rows.push({ file: rel(f), importers: imp, impCount: imp.length, inClient, inServer, inChat, inSocket, reachable, isEntry });
}

rows.sort((a, b) => a.file.localeCompare(b.file));
console.log('=== REACHABLE FROM CLIENT (src/main.tsx) ===');
console.log(clientReach.size + ' files');
console.log('=== REACHABLE FROM SERVER (server.ts) ===');
console.log(serverReach.size + ' files');
console.log('=== REACHABLE FROM CHAT (chatServer.ts) ===');
console.log(chatReach.size + ' files');
console.log('=== REACHABLE FROM SOCKET (socketServer.ts) ===');
console.log(socketReach.size + ' files');

// Write full report
const out = [];
out.push('# Import-Graph Analysis — Ocean-V1 - Copy\n');
out.push('Client reachable (src/main.tsx): ' + clientReach.size);
out.push('Server reachable (server.ts): ' + serverReach.size);
out.push('Chat reachable (chatServer.ts): ' + chatReach.size);
out.push('Socket reachable (socketServer.ts): ' + socketReach.size);
out.push('Total source files: ' + files.length + '\n');
out.push('| File | Imported-by count | Imported by | Client-reach | Server-reach | Chat-reach | Socket-reach | Any-reach |');
out.push('|---|---|---|---|---|---|---|---|');
for (const r of rows) {
  out.push(`| ${r.file} | ${r.impCount} | ${r.importers.slice(0,5).join(', ') + (r.importers.length>5?'…':'')} | ${r.inClient?'Y':'N'} | ${r.inServer?'Y':'N'} | ${r.inChat?'Y':'N'} | ${r.inSocket?'Y':'N'} | ${r.reachable?'Y':'N'} |`);
}

out.push('\n## Zero-importer files (imported by nothing) — candidate DEAD\n');
for (const r of rows) if (r.impCount === 0 && !r.isEntry) out.push('- ' + r.file);

out.push('\n## Exact duplicate groups (byte-identical)\n');
if (!exactDuplicates.length) out.push('(none)');
for (const group of exactDuplicates) {
  out.push('\n### Group: ' + group.map(rel).join(' , '));
}

fs.writeFileSync(path.join(ROOT, 'import-graph-report.md'), out.join('\n'));
console.log('\nReport written to import-graph-report.md');
console.log('Zero-importer files: ' + rows.filter(r => r.impCount===0 && !r.isEntry).length);
console.log('Exact-duplicate groups: ' + exactDuplicates.length);
