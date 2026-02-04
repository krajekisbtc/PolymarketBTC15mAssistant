/**
 * Position monitor for Clawbot mode: TP, SL, pre-settlement sell.
 * Run as background loop when CLAWBOT_MODE=true and positions exist.
 */

import { addPosition, getPositions, getPositionsForMarket, removePosition } from "./positionsStore.js";
import { sellOrder } from "./polymarketTrader.js";
import { fetchClobPrice } from "../data/polymarket.js";

const POLL_MS = 15_000; // Check every 15 seconds

/**
 * Check one position: TP, SL, or sell before settlement.
 * @returns {Promise<{action: string, pos?: object, result?: object}>}
 */
async function checkPosition(pos, timeLeftMin) {
  const currentPrice = await fetchClobPrice({ tokenId: pos.tokenId, side: "sell" });
  if (currentPrice == null || currentPrice <= 0) return { action: "SKIP", reason: "no_price" };

  const entryPrice = pos.entryPrice ?? 0.5;
  const profitPct = (currentPrice - entryPrice) / entryPrice;
  const lossPct = (entryPrice - currentPrice) / entryPrice;

  if (profitPct >= (pos.takeProfitPct ?? 0.2)) {
    const result = await sellOrder({
      tokenId: pos.tokenId,
      price: currentPrice,
      size: pos.size
    });
    removePosition(pos.id);
    return { action: "TAKE_PROFIT", pos, result, profitPct };
  }

  if (lossPct >= (pos.stopLossPct ?? 0.25)) {
    const result = await sellOrder({
      tokenId: pos.tokenId,
      price: currentPrice,
      size: pos.size
    });
    removePosition(pos.id);
    return { action: "STOP_LOSS", pos, result, lossPct };
  }

  const sellBeforeMin = pos.sellBeforeSettlementMin ?? 3;
  if (timeLeftMin <= sellBeforeMin && timeLeftMin > 0) {
    const result = await sellOrder({
      tokenId: pos.tokenId,
      price: currentPrice,
      size: pos.size
    });
    removePosition(pos.id);
    return { action: "PRE_SETTLEMENT", pos, result, timeLeftMin };
  }

  return { action: "HOLD", pos, profitPct, lossPct, timeLeftMin };
}

/**
 * Run one monitor cycle for a market.
 */
export async function runMonitorCycle(marketSlug, timeLeftMin) {
  const positions = getPositionsForMarket(marketSlug);
  if (positions.length === 0) return [];

  const results = [];
  for (const pos of positions) {
    try {
      const r = await checkPosition(pos, timeLeftMin);
      results.push(r);
    } catch (err) {
      results.push({ action: "ERROR", pos, error: err?.message });
    }
  }
  return results;
}

/**
 * Save a position for TP/SL tracking. Called by clawbot-execute.
 */
export function savePosition(pos) {
  return addPosition(pos);
}

/**
 * Run position monitor loop. Checks positions every pollIntervalMs.
 * @param {{ pollIntervalMs?: number }} opts
 */
export async function runPositionMonitor({ pollIntervalMs = 5000 } = {}) {
  const { getSignal } = await import("../get-signal.js");
  const { sleep } = await import("../utils.js");

  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const positions = getPositions();
      if (positions.length > 0) {
        const signal = await getSignal();
        const slug = signal.marketSnapshot?.slug;
        const timeLeft = signal.timeLeftMin ?? 0;
        if (slug) {
          const results = await runMonitorCycle(slug, timeLeft);
          for (const r of results) {
            if (r.action !== "HOLD" && r.action !== "SKIP") {
              console.log(JSON.stringify({ time: new Date().toISOString(), ...r }));
            }
          }
        }
      }
    } catch (err) {
      console.error("Monitor error:", err?.message);
    }
    await sleep(pollIntervalMs);
  }
}
