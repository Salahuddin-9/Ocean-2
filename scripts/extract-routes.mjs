// Extract Express route registrations from server.ts and all wired turtle backends.
// For each route: method, path, protected (requireAuth/requireAdmin present), source file.
import fs from 'fs';
import path from 'path';

const root = process.cwd();

// Wired modules: everything imported by the registry + the direct server.ts imports.
const registrySrc = fs.readFileSync(path.join(root, 'src/turtleFeatureRegistry.ts'), 'utf8');
const registryMods = [];
for (const m of registrySrc.matchAll(/import\s*\{[^}]*\}\s*from\s*'\.\/(turtle[A-Za-z0-9]+)'/g)) {
  registryMods.push(m[1]);
}

const serverSrc = fs.readFileSync(path.join(root, 'server.ts'), 'utf8');
const directMods = [];
for (const m of serverSrc.matchAll(/from\s*'\.\/(turtle[A-Za-z0-9]+)'/g)) {
  directMods.push(m[1]);
}
for (const m of serverSrc.matchAll(/from\s*'\.\/src\/(turtle[A-Za-z0-9]+)'/g)) {
  directMods.push(m[1]);
}
// Also chatServer imports
const chatSrc = fs.readFileSync(path.join(root, 'chatServer.ts'), 'utf8');
for (const m of chatSrc.matchAll(/from\s*'\.\/src\/(turtle[A-Za-z0-9]+)'/g)) {
  directMods.push(m[1]);
}

const wired = new Set([...registryMods, ...directMods, 'turtleFeatureRegistry']);
const files = new Set(['server.ts']);
for (const mod of wired) {
  const p = path.join(root, 'src', `${mod}.ts`);
  if (fs.existsSync(p)) files.add(`src/${mod}.ts`);
}

const routes = [];
const routeRe = /app\.(get|post|put|patch|delete)\(\s*['"`]([^'"`]+)['"`]/g;
for (const file of files) {
  const full = fs.readFileSync(path.join(root, file), 'utf8');
  let m;
  while ((m = routeRe.exec(full)) !== null) {
    const method = m[1].toUpperCase();
    const routePath = m[2];
    // Look ahead for middleware within this call (bounded window).
    const window = full.slice(m.index, m.index + 800);
    const hasRequireAuth = /\brequireAuth\b/.test(window);
    const hasRequireAdmin = /\brequireAdmin\b/.test(window);
    const proto = hasRequireAdmin ? 'admin' : hasRequireAuth ? 'auth' : 'public';
    // Skip .well-known / static-ish wildcards flagged separately
    routes.push({ file: file.replace(/\\/g, '/'), method, path: routePath, proto });
  }
}

// Sort: public first, then path
const publics = routes.filter((r) => r.proto === 'public');
const authed = routes.filter((r) => r.proto === 'auth');
const admin = routes.filter((r) => r.proto === 'admin');

console.log(`Files scanned: ${files.size}`);
console.log(`Total routes: ${routes.length}`);
console.log(`  auth:    ${authed.length}`);
console.log(`  admin:   ${admin.length}`);
console.log(`  public:  ${publics.length}\n`);

console.log('=== PUBLIC ROUTES ===');
for (const r of publics.sort((a, b) => a.path.localeCompare(b.path))) {
  console.log(`${r.method.padEnd(6)} ${r.path.padEnd(70)} ${r.file}`);
}

console.log('\n=== POTENTIALLY SENSITIVE PUBLIC ROUTES (mutating) ===');
const sensitive = publics.filter((r) => !['GET', 'HEAD', 'OPTIONS'].includes(r.method));
for (const r of sensitive) console.log(`${r.method.padEnd(6)} ${r.path.padEnd(70)} ${r.file}`);

fs.writeFileSync(
  path.join(root, 'scripts', 'route-inventory.json'),
  JSON.stringify({ total: routes.length, authed: authed.length, admin: admin.length, public: publics.length, routes }, null, 2)
);
