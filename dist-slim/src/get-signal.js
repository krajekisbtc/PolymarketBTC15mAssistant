/**
 * One-shot signal fetch for Polymarket BTC 15m.
 * Outputs JSON for Clawbot/skills to consume.
 *
 * Usage: npm run signal
 *        node src/get-signal.js
 */

import "dotenv/config";
import { syncSessionState } from "./sessionSync.js";
import { CONFIG } from "./config.js";
import { fetchKlines, fetchLastPrice } from "./data/binance.js";
import { fetchChainlinkBtcUsd } from "./data/chainlink.js";
import { fetchBtc15mMarketSnapshot } from "./data/polymarket.js";
import { computeVwapSeries } from "./indicators/vwap.js";
import { computeRsi, slopeLast } from "./indicators/rsi.js";
import { computeMacd } from "./indicators/macd.js";
import { computeHeikenAshi, countConsecutive } from "./indicators/heikenAshi.js";
import { scoreDirection, applyTimeAwareness } from "./engines/probability.js";
import { computeEdge, decide } from "./engines/edge.js";
import { getCandleWindowTiming } from "./utils.js";
import { applyGlobalProxyFromEnv } from "./net/proxy.js";

function countVwapCrosses(closes, vwapSeries, lookback) {
  if (closes.length < lookback || vwapSeries.length < lookback) return null;
  let crosses = 0;
  for (let i = closes.length - lookback + 1; i < closes.length; i += 1) {
    const prev = closes[i - 1] - vwapSeries[i - 1];
    const cur = closes[i] - vwapSeries[i];
    if (prev === 0) continue;
    if ((prev > 0 && cur < 0) || (prev < 0 && cur > 0)) crosses += 1;
  }
  return crosses;
}

applyGlobalProxyFromEnv();

export async function getSignal() {
  const [klines1m, lastPrice, chainlink, poly] = await Promise.all([
    fetchKlines({ interval: "1m", limit: 240 }),
    fetchLastPrice(),
    fetchChainlinkBtcUsd(),
    fetchBtc15mMarketSnapshot()
  ]);

  const settlementMs = poly.ok && poly.market?.endDate ? new Date(poly.market.endDate).getTime() : null;
  const timing = getCandleWindowTiming(CONFIG.candleWindowMinutes);
  const settlementLeftMin = settlementMs ? (settlementMs - Date.now()) / 60_000 : null;
  const timeLeftMin = settlementLeftMin ?? timing.remainingMinutes;

  const candles = klines1m;
  const closes = candles.map((c) => c.close);
  const vwapSeries = computeVwapSeries(candles);
  const vwapNow = vwapSeries[vwapSeries.length - 1];

  const lookback = CONFIG.vwapSlopeLookbackMinutes;
  const vwapSlope = vwapSeries.length >= lookback ? (vwapNow - vwapSeries[vwapSeries.length - lookback]) / lookback : null;

  const rsiNow = computeRsi(closes, CONFIG.rsiPeriod);
  const rsiSeries = [];
  for (let i = 0; i < closes.length; i += 1) {
    const r = computeRsi(closes.slice(0, i + 1), CONFIG.rsiPeriod);
    if (r !== null) rsiSeries.push(r);
  }
  const rsiSlope = slopeLast(rsiSeries, 3);
  const macd = computeMacd(closes, CONFIG.macdFast, CONFIG.macdSlow, CONFIG.macdSignal);
  const ha = computeHeikenAshi(candles);
  const consec = countConsecutive(ha);

  const vwapCrossCount = countVwapCrosses(closes, vwapSeries, 20);
  const volumeRecent = candles.slice(-20).reduce((a, c) => a + c.volume, 0);
  const volumeAvg = candles.slice(-120).reduce((a, c) => a + c.volume, 0) / 6;

  const failedVwapReclaim =
    vwapNow !== null &&
    vwapSeries.length >= 3 &&
    closes[closes.length - 1] < vwapNow &&
    closes[closes.length - 2] > vwapSeries[vwapSeries.length - 2];

  const scored = scoreDirection({
    price: lastPrice,
    vwap: vwapNow,
    vwapSlope,
    rsi: rsiNow,
    rsiSlope,
    macd,
    heikenColor: consec.color,
    heikenCount: consec.count,
    failedVwapReclaim
  });

  const timeAware = applyTimeAwareness(scored.rawUp, timeLeftMin, CONFIG.candleWindowMinutes);
  const marketUp = poly.ok ? poly.prices.up : null;
  const marketDown = poly.ok ? poly.prices.down : null;
  const edge = computeEdge({
    modelUp: timeAware.adjustedUp,
    modelDown: timeAware.adjustedDown,
    marketYes: marketUp,
    marketNo: marketDown
  });

  const rec = decide({
    remainingMinutes: timeLeftMin,
    edgeUp: edge.edgeUp,
    edgeDown: edge.edgeDown,
    modelUp: timeAware.adjustedUp,
    modelDown: timeAware.adjustedDown
  });

  return {
    action: rec.action,
    side: rec.side,
    phase: rec.phase,
    strength: rec.strength,
    reason: rec.reason,
    edge: rec.edge,
    modelUp: timeAware.adjustedUp,
    modelDown: timeAware.adjustedDown,
    marketUp,
    marketDown,
    edgeUp: edge.edgeUp,
    edgeDown: edge.edgeDown,
    timeLeftMin,
    btcPrice: chainlink?.price ?? lastPrice,
    marketSnapshot: poly.ok
      ? {
          market: poly.market?.question,
          slug: poly.market?.slug,
          endDate: poly.market?.endDate,
          tokens: poly.tokens,
          prices: poly.prices,
          orderbook: poly.orderbook
        }
      : null
  };
}

async function main() {
  await syncSessionState();
  try {
    const signal = await getSignal();
    console.log(JSON.stringify(signal, null, 2));
  } catch (err) {
    console.error(JSON.stringify({ error: err?.message ?? String(err) }));
    process.exit(1);
  }
}

main();
