#!/usr/bin/env node
/**
 * Creates dist-slim/ without node_modules (~100 KB).
 * Recipient runs: npm install
 */

import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SLIM = path.join(ROOT, "dist-slim");

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const e of fs.readdirSync(src)) {
    if (e === "node_modules" || e === "logs" || e === ".git" || e === "dist-slim") continue;
    const s = path.join(src, e);
    const d = path.join(dest, e);
    if (fs.statSync(s).isDirectory()) {
      copyDir(s, d);
    } else {
      fs.copyFileSync(s, d);
    }
  }
}

function getSize(dir) {
  let s = 0;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    s += e.isDirectory() ? getSize(p) : fs.statSync(p).size;
  }
  return s;
}

fs.rmSync(SLIM, { recursive: true, force: true });
copyDir(ROOT, SLIM);
const kb = (getSize(SLIM) / 1024).toFixed(1);
console.log(`Created dist-slim/ (${kb} KB). Run 'npm install' after copying.`);
