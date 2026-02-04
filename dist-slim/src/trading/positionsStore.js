/**
 * Store open positions for Clawbot mode (TP/SL tracking).
 */

import fs from "node:fs";
import path from "node:path";

const FILE = "./logs/positions.json";

function load() {
  try {
    const data = fs.readFileSync(FILE, "utf8");
    return JSON.parse(data);
  } catch {
    return { positions: [], updatedAt: null };
  }
}

function save(data) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  data.updatedAt = new Date().toISOString();
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2), "utf8");
}

export function addPosition(pos) {
  const data = load();
  data.positions.push({
    ...pos,
    id: `pos_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  });
  save(data);
  return data.positions[data.positions.length - 1];
}

export function getPositions() {
  return load().positions;
}

export function removePosition(id) {
  const data = load();
  data.positions = data.positions.filter((p) => p.id !== id);
  save(data);
}

export function getPositionsForMarket(marketSlug) {
  return getPositions().filter((p) => p.marketSlug === marketSlug);
}
