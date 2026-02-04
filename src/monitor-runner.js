#!/usr/bin/env node
import "dotenv/config";
import { syncSessionState } from "./sessionSync.js";
import { runPositionMonitor } from "./trading/positionMonitor.js";

syncSessionState().then(() =>
  runPositionMonitor({ pollIntervalMs: 5000 })
  )
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
