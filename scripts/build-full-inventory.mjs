import fs from 'fs';
import path from 'path';

const root = process.cwd();

// Read all source files
const serverSrc = fs.readFileSync(path.join(root, 'server.ts'), 'utf8');
const chatSrc = fs.readFileSync(path.join(root, 'chatServer.ts'), 'utf8');

// Get all turtle backend files
const srcDir = path.join(root, 'src');
const turtleFiles = fs.readdirSync(srcDir).filter(f => f.startsWith('turtle') && f.endsWith('.ts'));

// Parse function to extract routes from a file
function extractRoutesFromFile(filePath, fileContent) {
  const routes = [];
  // Pattern to match app.get/post/put/patch/delete with quoted path
  const routeRe = /app\.(get|post|put|patch|delete)\s*\(\s*['"`]([^'"`]+)['"`]/g;

  let m;
  while ((m = routeRe.exec(fileContent)) !== null) {
    const method = m[1].toUpperCase();
    const routePath = m[2];
    const lineNumber = fileContent.substring(0, m.index).split('\n').length;

    // Look at surrounding context (before and after the match) for auth middleware
    const beforeContext = fileContent.substring(Math.max(0, m.index - 200), m.index);
    const afterContext = fileContent.substring(m.index, m.index + 400);
    const context = beforeContext + afterContext;

    const hasRequireAuth = /\brequireAuth\b/.test(context);
    const hasRequireAdmin = /\brequireAdmin\b/.test(context);
    const hasAuthenticateToken = /\bauthenticateToken\b/.test(context);
    const hasVerifyToken = /\bverifyToken\b/.test(context);
    const hasIsAdmin = /\bisAdmin\b/.test(context);

    const auth = hasRequireAuth || hasAuthenticateToken || hasVerifyToken;
    const admin = hasRequireAdmin || hasIsAdmin;

    routes.push({
      method,
      path: routePath,
      auth,
      admin,
      sourceFile: filePath,
      line: lineNumber
    });
  }

  return routes;
}

// Extract from server.ts
const serverRoutes = extractRoutesFromFile('server.ts', serverSrc);

// Extract from chatServer.ts (it might have routes)
const chatRoutes = extractRoutesFromFile('chatServer.ts', chatSrc);

// Extract from all turtle backend files
let turtleRoutes = [];
for (const file of turtleFiles) {
  const fullPath = path.join(srcDir, file);
  const content = fs.readFileSync(fullPath, 'utf8');
  const routes = extractRoutesFromFile(`src/${file}`, content);
  turtleRoutes = turtleRoutes.concat(routes);
}

// Combine all routes
const allRoutes = [...serverRoutes, ...chatRoutes, ...turtleRoutes];

// Deduplicate by (method, path, sourceFile)
const uniqueMap = new Map();
for (const route of allRoutes) {
  const key = `${route.method}|${route.path}|${route.sourceFile}`;
  if (!uniqueMap.has(key)) {
    uniqueMap.set(key, route);
  }
}

const uniqueRoutes = Array.from(uniqueMap.values());

// Sort by method then path
uniqueRoutes.sort((a, b) => {
  if (a.method !== b.method) return a.method.localeCompare(b.method);
  return a.path.localeCompare(b.path);
});

// Count by auth status
const authCount = uniqueRoutes.filter(r => r.auth).length;
const adminCount = uniqueRoutes.filter(r => r.admin).length;
const publicCount = uniqueRoutes.filter(r => !r.auth && !r.admin).length;

// Count by source file
const sourceBreakdown = {};
for (const route of uniqueRoutes) {
  sourceBreakdown[route.sourceFile] = (sourceBreakdown[route.sourceFile] || 0) + 1;
}

// Write output
const output = {
  total: uniqueRoutes.length,
  routes: uniqueRoutes
};

fs.writeFileSync(
  path.join(root, '.verification', 'route-inventory.json'),
  JSON.stringify(output, null, 2)
);

console.log(`Total routes: ${uniqueRoutes.length}`);
console.log(`  Auth: ${authCount}`);
console.log(`  Admin: ${adminCount}`);
console.log(`  Public: ${publicCount}`);
console.log(`\nSource breakdown:`);
for (const [file, count] of Object.entries(sourceBreakdown).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${file}: ${count}`);
}