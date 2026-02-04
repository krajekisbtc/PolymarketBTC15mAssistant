/**
 * Clawbot mode: dynamic position sizing based on balance, risk, signal.
 * Used when CLAWBOT_MODE=true.
 */

const BALANCE_RESERVE_PCT = 0.2; // Always keep 20% of balance as reserve
const MAX_POSITION_PCT = 0.3; // Never use more than 30% of balance per trade
const MIN_POSITION_PCT = 0.02; // Minimum 2% when risk is high

// Risk tiers by signal strength and edge
const RISK_TIERS = {
  STRONG: { pct: 0.15, tpPct: 0.25, slPct: 0.15, sellBeforeMin: 2 },
  GOOD: { pct: 0.1, tpPct: 0.2, slPct: 0.2, sellBeforeMin: 3 },
  OPTIONAL: { pct: 0.05, tpPct: 0.15, slPct: 0.25, sellBeforeMin: 4 }
};

// High risk: weak signal, low edge, late phase
const HIGH_RISK = { pct: 0.03, tpPct: 0.1, slPct: 0.3, sellBeforeMin: 5 };

/**
 * Compute position size (USD) and TP/SL params for Clawbot mode.
 * @param {Object} params
 * @param {number} params.balanceUsd - Available USDCe balance
 * @param {Object} params.signal - From getSignal()
 * @param {number} params.entryPrice - Price per share (0-1)
 */
export function computeClawbotParams({ balanceUsd, signal, entryPrice }) {
  const strength = signal.strength ?? "OPTIONAL";
  const edge = signal.edge ?? 0;
  const phase = signal.phase ?? "MID";
  const timeLeftMin = signal.timeLeftMin ?? 10;

  let tier = RISK_TIERS[strength] ?? RISK_TIERS.OPTIONAL;

  const isHighRisk =
    phase === "LATE" ||
    (edge < 0.1 && strength !== "STRONG") ||
    timeLeftMin < 5;

  if (isHighRisk) {
    tier = HIGH_RISK;
  }

  const usableBalance = balanceUsd * (1 - BALANCE_RESERVE_PCT);
  const positionPct = Math.min(tier.pct, MAX_POSITION_PCT);
  const positionUsd = Math.max(
    usableBalance * MIN_POSITION_PCT,
    Math.min(usableBalance * positionPct, balanceUsd * MAX_POSITION_PCT)
  );

  const size = entryPrice > 0 ? Math.floor(positionUsd / entryPrice) : 0;

  return {
    sizeUsd: Math.round(positionUsd * 100) / 100,
    sizeShares: Math.max(1, size),
    takeProfitPct: tier.tpPct,
    stopLossPct: tier.slPct,
    sellBeforeSettlementMin: tier.sellBeforeMin,
    tier: isHighRisk ? "HIGH_RISK" : strength,
    reservePct: BALANCE_RESERVE_PCT
  };
}
