#!/usr/bin/env node
import "dotenv/config";
/**
 * Trade CLI for Polymarket BTC 15m.
 * Used by Clawbot skill to execute trades.
 *
 * Usage:
 *   npm run trade -- --signal          # Get current signal (JSON)
 *   npm run trade -- --execute UP      # Execute BUY UP (requires confirmation)
 *   npm run trade -- --execute DOWN    # Execute BUY DOWN
 *   npm run trade -- --execute UP --yes # Skip confirmation (for Clawbot automation)
 *
 * Env: POLYMARKET_PRIVATE_KEY, POLYMARKET_FUNDER (required for --execute)
 */

import { getSignal } from "./get-signal.js";
import { placeBtc15mOrder } from "./trading/polymarketTrader.js";
import { syncSessionState } from "./sessionSync.js";
import { createInterface } from "node:readline";

async function prompt(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (ans) => {
      rl.close();
      resolve(ans?.trim()?.toLowerCase());
    });
  });
}

async function main() {
  await syncSessionState();
  const args = process.argv.slice(2);
  const signalOnly = args.includes("--signal");
  const executeEq = args.find((a) => a.startsWith("--execute="));
  const executeIdx = args.indexOf("--execute");
  let sideArg = executeEq ? executeEq.split("=")[1] : executeIdx >= 0 ? args[executeIdx + 1] : null;
  if (sideArg && sideArg.startsWith("--")) sideArg = null;
  const skipConfirm = args.includes("--yes") || args.includes("-y");

  if (signalOnly) {
    const signal = await getSignal();
    console.log(JSON.stringify(signal, null, 2));
    return;
  }

  if (executeIdx >= 0 && (sideArg === "UP" || sideArg === "DOWN")) {
    const signal = await getSignal();

    if (!signal.marketSnapshot?.tokens) {
      console.error(JSON.stringify({ error: "No market snapshot", signal }));
      process.exit(1);
    }

    if (signal.action !== "ENTER" || signal.side !== sideArg) {
      console.error(
        JSON.stringify({
          error: "Signal mismatch",
          requested: sideArg,
          current: signal.action === "ENTER" ? signal.side : "NO_TRADE",
          reason: signal.reason
        })
      );
      process.exit(1);
    }

    if (!skipConfirm) {
      const ans = await prompt(
        `Execute BUY ${sideArg}? (phase=${signal.phase}, strength=${signal.strength}) [y/N]: `
      );
      if (ans !== "y" && ans !== "yes") {
        console.log("Aborted.");
        process.exit(0);
      }
    }

    try {
      const result = await placeBtc15mOrder({
        side: sideArg,
        marketSnapshot: signal.marketSnapshot
      });
      console.log(JSON.stringify({ success: true, orderId: result?.orderID, status: result?.status }));
    } catch (err) {
      console.error(JSON.stringify({ error: err?.message ?? String(err) }));
      process.exit(1);
    }
    return;
  }

  console.log(`
Usage:
  node src/trade-cli.js --signal              Get current signal (JSON)
  node src/trade-cli.js --execute UP         Execute BUY UP (with confirmation)
  node src/trade-cli.js --execute DOWN       Execute BUY DOWN
  node src/trade-cli.js --execute UP --yes   Execute without confirmation (Clawbot)

Env vars for --execute:
  POLYMARKET_PRIVATE_KEY   Wallet private key
  POLYMARKET_FUNDER        Funder address (from polymarket.com/settings)
  POLYMARKET_SIGNATURE_TYPE 0=EOA, 1=Magic, 2=Gnosis Safe (default: 2)
  POLYMARKET_ORDER_SIZE    Shares per order (default: 5)
`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
