#!/usr/bin/env node
import "dotenv/config";
/**
 * Position monitor daemon for Clawbot mode.
 * Runs continuously, checking TP/SL/pre-settlement every 15s.
 * Stop with Ctrl+C.
 */

import { getSignal } from "./get-signal.js";
import { runMonitorCycle } from "./trading/positionMonitor.js";
import { getPositions } from "./trading/positionsStore.js";
import { sleep } from "./utils.js";

const CLAWBOT_MODE = (process.env.CLAWBOT_MODE || "false").toLowerCase() === "true";
const POLL_MS = 15_000;

async function main() {
  if (!CLAWBOT_MODE) {
    console.error("CLAWBOT_MODE must be true to run monitor daemon.");
    process.exit(1);
  }

  console.log("Monitor daemon started. Ctrl+C to stop.");
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
    await sleep(POLL_MS);
  }
}

main();
