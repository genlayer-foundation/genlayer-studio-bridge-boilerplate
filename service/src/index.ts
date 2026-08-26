/**
 * Bridge Service - Entry Point
 *
 * Bidirectional relay between GenLayer and EVM chains via a configured EVM hub.
 */

import cron from "node-cron";
import {
  getBridgeSyncInterval,
  getEvmToGlSyncInterval,
  isEvmToGlBridgingEnabled,
  isGenLayerToEvmBridgingEnabled,
} from "./config.js";
import { GenLayerToEvmRelay } from "./relay/GenLayerToEvm.js";
import { EvmToGenLayerRelay } from "./relay/EvmToGenLayer.js";

async function main() {
  console.log("Starting Bridge Service");

  // GenLayer -> EVM relay
  if (isGenLayerToEvmBridgingEnabled()) {
    const glToEvm = new GenLayerToEvmRelay();
    const glToEvmInterval = getBridgeSyncInterval();

    console.log(`  GenLayer → EVM: ${glToEvmInterval}`);
    glToEvm.sync();
    cron.schedule(glToEvmInterval, () => glToEvm.sync());
  } else {
    console.log("  GenLayer → EVM: DISABLED (missing GenLayer BridgeSender)");
  }

  // EVM -> GenLayer relay (if configured)
  if (isEvmToGlBridgingEnabled()) {
    const evmToGl = new EvmToGenLayerRelay();
    const evmToGlInterval = getEvmToGlSyncInterval();

    console.log(`  EVM → GenLayer: ${evmToGlInterval}`);
    evmToGl.sync(); // Initial sync
    cron.schedule(evmToGlInterval, () => evmToGl.sync());
  } else {
    console.log("  EVM → GenLayer: DISABLED (missing config)");
  }

  console.log("Bridge service running");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("Received SIGTERM. Shutting down...");
  process.exit(0);
});

process.on("SIGINT", () => {
  console.log("Received SIGINT. Shutting down...");
  process.exit(0);
});
