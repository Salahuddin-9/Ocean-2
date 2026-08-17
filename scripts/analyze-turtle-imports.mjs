// Analyze import graph for all src/turtle*.ts modules.
// For each module: exports, import count (files that import it), importer files.
import fs from 'fs';
import path from 'path';

const root = process.cwd();
const turtleDir = path.join(root, 'src');

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === 'archive' || ent.name === 'reference' || ent.name === 'node_modules' || ent.name === 'server') continue;
      walk(p, out);
    } else if (/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(ent.name)) {
      out.push(p);
    }
  }
  return out;
}

const allFiles = walk(root).filter((p) => !p.includes(`${path.sep}dist${path.sep}`) && !p.includes(`${path.sep}node_modules${path.sep}`));
const allSrc = walk(turtleDir);

// 1. Collect all turtle modules + their exports
const turtleMods = fs.readdirSync(turtleDir).filter((f) => /^turtle.*\.ts$/.test(f)).map((f) => path.join(turtleDir, f));
const moduleInfo = new Map();
for (const f of turtleMods) {
  const src = fs.readFileSync(f, 'utf8');
  const exports = [];
  for (const m of src.matchAll(/^export\s+(?:async\s+)?(?:function|const|class|interface|type|enum|default\s+(?:function|class))\s+([A-Za-z0-9_]+)/gm)) {
    exports.push(m[1]);
  }
  for (const m of src.matchAll(/^export\s*\{([^}]+)\}/gm)) {
    m[1].split(',').map((s) => s.trim()).filter(Boolean).forEach((s) => exports.push(s.split(/\s+as\s+/)[0].trim()));
  }
  moduleInfo.set(f, { exports: [...new Set(exports)] });
}

// 2. Count imports per module
const importers = new Map(); // modFile -> Set(importerFile)
for (const f of turtleMods) {
  importers.set(f, new Set());
}
for (const f of allFiles) {
  const src = fs.readFileSync(f, 'utf8');
  const base = path.basename(f);
  const rel = path.relative(root, f).replace(/\\/g, '/');
  for (const m of src.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
    const spec = m[1];
    const clean = spec.replace(/\.(ts|tsx|js|jsx)$/, '').split('/').pop();
    for (const mod of turtleMods) {
      const modBase = path.basename(mod, '.ts');
      if (clean === modBase) {
        importers.get(mod)?.add(rel);
      }
    }
  }
}

// Also count dynamic imports (import('...'))
for (const f of allFiles) {
  const src = fs.readFileSync(f, 'utf8');
  const rel = path.relative(root, f).replace(/\\/g, '/');
  for (const m of src.matchAll(/import\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    const clean = m[1].replace(/\.(ts|tsx|js|jsx)$/, '').split('/').pop();
    for (const mod of turtleMods) {
      const modBase = path.basename(mod, '.ts');
      if (clean === modBase) {
        importers.get(mod)?.add(rel);
      }
    }
  }
}

// 3. Output
const rows = [];
for (const f of turtleMods) {
  const info = moduleInfo.get(f);
  const imp = importers.get(f);
  rows.push({
    file: path.relative(root, f).replace(/\\/g, '/'),
    exports: info.exports,
    count: imp.size,
    importers: [...imp].sort(),
  });
}
rows.sort((a, b) => a.count - b.count || a.file.localeCompare(b.file));

const dead = rows.filter((r) => r.count === 0);
const alive = rows.filter((r) => r.count > 0);
console.log(`TOTAL turtle modules: ${rows.length}`);
console.log(`Alive (imported): ${alive.length}`);
console.log(`DEAD (0 imports): ${dead.length}\n`);
console.log('=== DEAD MODULES ===');
for (const r of dead) console.log(`${r.count}  ${r.file}  [${r.exports.join(', ')}]`);
console.log('\n=== ALIVE MODULES ===');
for (const r of alive) console.log(`${r.count}  ${r.file}`);

// Save detailed json
fs.writeFileSync(path.join(root, 'scripts', 'turtle-import-graph.json'), JSON.stringify(rows, null, 2));
