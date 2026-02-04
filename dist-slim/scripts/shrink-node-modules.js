#!/usr/bin/env node
/**
 * Shrinks node_modules by removing files not needed at runtime.
 * Run after npm install (postinstall).
 */

import fs from "node:fs";
import path from "node:path";

const NODE_MODULES = path.join(process.cwd(), "node_modules");
const REMOVE_PATTERNS = [
  (p) => p.endsWith(".map"),
  (p) => /\.(md|markdown|mdx)$/i.test(p),
  (p) => /(README|CHANGELOG|HISTORY|LICENSE|NOTICE|CONTRIBUTING)\.(md|txt)$/i.test(p),
  (p) => /\/test(s)?\//.test(p) || /\/__tests__\//.test(p) || /\/spec(s)?\//.test(p),
  (p) => /\/docs?\//.test(p) || /\/examples?\//.test(p) || /\/example\//.test(p),
  (p) => /\/\.github\//.test(p) || /\/\.vscode\//.test(p),
  (p) => /\/coverage\//.test(p) || /\/\.nyc_output\//.test(p),
  (p) => p.endsWith(".d.ts"),
  (p) => /\.(flow|tsbuildinfo)$/.test(p),
  (p) => /(\.eslintrc|\.prettierrc|\.editorconfig|\.npmignore|\.yarnrc)/.test(p),
  (p) => /\.(snap|tap|yaml|yml)$/.test(p) && !/package\.json$/.test(p)
];

let removed = 0;
let freed = 0;

function getSize(filePath) {
  try {
    return fs.statSync(filePath).size;
  } catch {
    return 0;
  }
}

function shouldRemove(relPath) {
  return REMOVE_PATTERNS.some((fn) => fn(relPath));
}

function walk(dir, base = "") {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    const rel = path.join(base, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules") continue;
      walk(full, rel);
    } else if (e.isFile() && shouldRemove(rel)) {
      const size = getSize(full);
      try {
        fs.unlinkSync(full);
        removed++;
        freed += size;
      } catch {
        // ignore
      }
    }
  }
}

walk(NODE_MODULES);
console.log(`Shrunk node_modules: removed ${removed} files, freed ${(freed / 1024 / 1024).toFixed(2)} MB`);
