/**
 * Builds context JSON for Clawbot AI to decide:
 * - sizeUsd (trade amount)
 * - takeProfitPct
 * - stopLossPct
 * - preSettlementMin (sell X min before settlement)
 *
 * Run: node src/clawbot-context.js
 * Output: JSON with signal, balance, riskAssessment, suggestedParams
 */

import "dotenv/config";
import { syncSessionState } from "../sessionSync.js";
import { getSignal } from "../get-signal.js";
import { getBalance, getPositionBalance } from "./polymarketTrader.js";

function assessRisk(signal) {
  if (signal.action !== "ENTER") return { level: "NONE", reason: "no_trade" };

  const edge = signal.edge ?? Math.max(signal.edgeUp ?? 0, signal.edgeDown ?? 0);
  const phase = signal.phase ?? "EARLY";
  const strength = signal.strength ?? "OPTIONAL";

  if (edge >= 0.2 && strength === "STRONG" && phase === "EARLY") {
    return { level: "LOW", reason: "strong_edge_early" };
  }
  if (edge >= 0.15 && (strength === "STRONG" || strength === "GOOD")) {
    return { level: "MEDIUM", reason: "good_edge" };
  }
  if (phase === "LATE" || edge < 0.1) {
    return { level: "HIGH", reason: "late_or_weak_edge" };
  }
  return { level: "MEDIUM", reason: "default" };
}

function suggestParams(signal, balance, risk) {
  if (signal.action !== "ENTER" || balance <= 0) {
    return null;
  }

  const maxPct = Math.min(50, balance < 20 ? 30 : balance < 100 ? 25 : 20);
  let sizePct = 10;

  if (risk.level === "LOW") {
    sizePct = Math.min(35, maxPct);
    return {
      sizeUsd: Math.min(balance * (sizePct / 100), balance * 0.35),
      takeProfitPct: 25,
      stopLossPct: 15,
      preSettlementMin: 2
    };
  }
  if (risk.level === "MEDIUM") {
    sizePct = Math.min(20, maxPct);
    return {
      sizeUsd: Math.min(balance * (sizePct / 100), balance * 0.2),
      takeProfitPct: 20,
      stopLossPct: 12,
      preSettlementMin: 3
    };
  }
  if (risk.level === "HIGH") {
    sizePct = Math.min(10, maxPct);
    return {
      sizeUsd: Math.min(balance * (sizePct / 100), balance * 0.1),
      takeProfitPct: 15,
      stopLossPct: 10,
      preSettlementMin: 4
    };
  }
  return null;
}

export async function getClawbotContext() {
  const [signal, balance] = await Promise.all([getSignal(), getBalance()]);

  const risk = assessRisk(signal);
  const suggestedParams = suggestParams(signal, balance, risk);

  let positions = null;
  if (signal.marketSnapshot?.tokens && balance > 0) {
    try {
      const [upPos, downPos] = await Promise.all([
        getPositionBalance(signal.marketSnapshot.tokens.upTokenId),
        getPositionBalance(signal.marketSnapshot.tokens.downTokenId)
      ]);
      if (upPos > 0 || downPos > 0) {
        positions = { up: upPos, down: downPos };
      }
    } catch {
      // ignore
    }
  }

  return {
    signal: {
      action: signal.action,
      side: signal.side,
      phase: signal.phase,
      strength: signal.strength,
      edge: signal.edge,
      edgeUp: signal.edgeUp,
      edgeDown: signal.edgeDown,
      modelUp: signal.modelUp,
      modelDown: signal.modelDown,
      marketUp: signal.marketUp,
      marketDown: signal.marketDown,
      timeLeftMin: signal.timeLeftMin,
      btcPrice: signal.btcPrice
    },
    balance: { usdc: balance },
    positions,
    riskAssessment: risk,
    suggestedParams,
    marketSnapshot: signal.marketSnapshot,
    clawbotMode: (process.env.CLAWBOT_MODE || "false").toLowerCase() === "true"
  };
}

async function main() {
  await syncSessionState();
  try {
    const ctx = await getClawbotContext();
    console.log(JSON.stringify(ctx, null, 2));
  } catch (err) {
    console.error(JSON.stringify({ error: err?.message ?? String(err) }));
    process.exit(1);
  }
}

main();
