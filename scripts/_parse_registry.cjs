const fs = require("fs");
const txt = fs.readFileSync("src/turtleFeatureRegistry.ts", "utf8");
const funcToModule = {};
const importRe = /import\s*\{([^}]+)\}\s*from\s*'\.\/([^']+)'/g;
let m;
while ((m = importRe.exec(txt))) {
  const fns = m[1].split(",");
  for (const fn of fns) {
    const trimmed = fn.trim();
    if (trimmed) funcToModule[trimmed] = m[2] + ".ts";
  }
}
const regRe = /register(\w+)\(app\);\s*(?:\/\/\s*(.*))?/g;
const out = [];
while ((m = regRe.exec(txt))) {
  const fn = "register" + m[1];
  const mod = funcToModule[fn];
  out.push({ fn, mod: mod || "?", comment: (m[2] || "").trim() });
}
console.log(JSON.stringify(out, null, 1));
