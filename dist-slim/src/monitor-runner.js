#!/usr/bin/env node
import "dotenv/config";
import { getSignal } from "./get-signal.js";
import { runMonitorCycle } from "./trading/positionMonitor.js";
import { getPositions } from "./trading/positionsStore.js";
import { sleep } from "./utils.js";

async function loop() {
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
    await sleep(5000);
  }
}

loop();
