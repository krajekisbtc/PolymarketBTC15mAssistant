#!/usr/bin/env node
import "dotenv/config";
/**
 * Clawbot execute: accepts params from Clawbot AI, places order, starts position monitor.
 *
 * Usage:
 *   echo '{"side":"UP","sizeUsd":10,"takeProfitPct":20,"stopLossPct":12,"preSettlementMin":3}' | node src/clawbot-execute.js
 *   node src/clawbot-execute.js --params='{"side":"UP","sizeUsd":10,...}'
 *
 * Requires CLAWBOT_MODE=true
 */

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { syncSessionState } from "./sessionSync.js";
import { getSignal } from "./get-signal.js";
import { placeBtc15mOrder } from "./trading/polymarketTrader.js";
import { savePosition } from "./trading/positionMonitor.js";

async function readStdin() {
  if (process.stdin.isTTY) return null;
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8").trim() || null;
}

async function main() {
  await syncSessionState();
  const clawbotMode = (process.env.CLAWBOT_MODE || "false").toLowerCase() === "true";
  if (!clawbotMode) {
    console.error(JSON.stringify({ error: "CLAWBOT_MODE must be true to use clawbot-execute" }));
    process.exit(1);
  }

  let params = null;
  const paramsArg = process.argv.find((a) => a.startsWith("--params="));
  if (paramsArg) {
    try {
      params = JSON.parse(paramsArg.split("=", 2)[1]);
    } catch {
      console.error(JSON.stringify({ error: "Invalid --params JSON" }));
      process.exit(1);
    }
  } else {
    const stdin = await readStdin();
    if (stdin) {
      try {
        params = JSON.parse(stdin);
      } catch {
        console.error(JSON.stringify({ error: "Invalid JSON from stdin" }));
        process.exit(1);
      }
    }
  }

  if (!params?.side || (params.side !== "UP" && params.side !== "DOWN")) {
    console.error(JSON.stringify({ error: "params.side (UP or DOWN) required" }));
    process.exit(1);
  }

  const signal = await getSignal();
  if (signal.action !== "ENTER" || signal.side !== params.side) {
    console.error(
      JSON.stringify({
        error: "Signal mismatch",
        requested: params.side,
        current: signal.action === "ENTER" ? signal.side : "NO_TRADE"
      })
    );
    process.exit(1);
  }

  if (!signal.marketSnapshot?.tokens) {
    console.error(JSON.stringify({ error: "No market snapshot" }));
    process.exit(1);
  }

  const sizeUsd = params.sizeUsd ?? 10;
  const takeProfitPct = params.takeProfitPct ?? 20;
  const stopLossPct = params.stopLossPct ?? 12;
  const preSettlementMin = params.preSettlementMin ?? 3;

  const tokenId = params.side === "UP" ? signal.marketSnapshot.tokens.upTokenId : signal.marketSnapshot.tokens.downTokenId;
  const book = params.side === "UP" ? signal.marketSnapshot.orderbook?.up : signal.marketSnapshot.orderbook?.down;
  const entryPrice = book?.bestAsk ?? 0.5;

  try {
    const result = await placeBtc15mOrder({
      side: params.side,
      marketSnapshot: signal.marketSnapshot,
      sizeUsd
    });

    savePosition({
      tokenId,
      side: params.side,
      entryPrice,
      size: Math.floor(sizeUsd / entryPrice),
      takeProfitPct,
      stopLossPct,
      preSettlementMin,
      sellBeforeSettlementMin: preSettlementMin,
      marketSlug: signal.marketSnapshot.slug,
      endDate: signal.marketSnapshot.endDate,
      orderId: result?.orderID,
      createdAt: new Date().toISOString()
    });

    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const monitorPath = path.join(__dirname, "monitor-runner.js");
    const monitor = spawn(process.execPath, [monitorPath], {
      detached: true,
      stdio: "ignore",
      cwd: process.cwd(),
      env: process.env
    });
    monitor.unref();

    console.log(
      JSON.stringify({
        success: true,
        orderId: result?.orderID,
        side: params.side,
        sizeUsd,
        entryPrice,
        takeProfitPct,
        stopLossPct,
        preSettlementMin,
        monitorStarted: true
      })
    );
  } catch (err) {
    console.error(JSON.stringify({ error: err?.message ?? String(err) }));
    process.exit(1);
  }
}

main();
