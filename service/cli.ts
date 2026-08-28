#!/usr/bin/env node
/**
 * Bridge Service CLI - Unified debug and inspection tool
 *
 * Usage:
 *   npx ts-node cli.ts <command> [args]
 *
 * Commands:
 *   check-receiver           - Check hub BridgeReceiver state
 *   check-sender             - Check target BridgeSender state
 *   check-forwarder          - Check hub BridgeForwarder state
 *   check-config             - Verify all contract configurations
 *   pending-messages         - List pending messages on the hub
 *   debug-tx <hash>          - Debug a transaction (show revert reason)
 *   help                     - Show this help message
 */

import { ethers } from "ethers";
import dotenv from "dotenv";
import { getNetworkProfile } from "./src/config.js";

dotenv.config();

// ============================================================================
// Configuration
// ============================================================================

function loadCliConfig() {
  try {
    const profile = getNetworkProfile();
    return {
      profile: profile.name,
      hubRpc: profile.hubRpcUrl,
      targetRpc: profile.targetRpcUrl,
      genlayerRpc: profile.genlayerRpcUrl,
      hubBridgeReceiver: profile.hubBridgeReceiverAddress,
      bridgeForwarder: profile.bridgeForwarderAddress,
      bridgeSender: profile.targetBridgeSenderAddress,
      bridgeReceiverIc: profile.bridgeReceiverIcAddress,
      targetLayerZeroEid: profile.targetLayerZeroEid,
    };
  } catch {
    return {
      profile: "not configured",
      hubRpc: "",
      targetRpc: "",
      genlayerRpc: "",
      hubBridgeReceiver: "",
      bridgeForwarder: "",
      bridgeSender: "",
      bridgeReceiverIc: "",
      targetLayerZeroEid: 0,
    };
  }
}

// ABIs
const BRIDGE_RECEIVER_ABI = [
  "function getPendingGenLayerMessages() external view returns (bytes32[] messageIds, tuple(bytes32 messageId, uint32 srcChainId, address srcSender, address targetContract, bytes data, bool relayed)[] messages)",
  "function getGenLayerMessageIds() external view returns (bytes32[])",
  "function getGenLayerMessageCount() external view returns (uint256)",
  "function getGenLayerMessage(bytes32 messageId) external view returns (tuple(bytes32 messageId, uint32 srcChainId, address srcSender, address targetContract, bytes data, bool relayed))",
  "function trustedForwarders(uint32) external view returns (bytes32)",
  "function authorizedRelayers(address) external view returns (bool)",
  "function endpoint() external view returns (address)",
  "function owner() external view returns (address)",
];

const BRIDGE_FORWARDER_ABI = [
  "function bridgeAddresses(uint32) external view returns (bytes32)",
  "function isHashUsed(bytes32) external view returns (bool)",
  "function endpoint() external view returns (address)",
  "function owner() external view returns (address)",
  "function caller() external view returns (address)",
];

const BRIDGE_SENDER_ABI = [
  "function zkSyncEid() external view returns (uint32)",
  "function zkSyncBridgeReceiver() external view returns (bytes32)",
  "function endpoint() external view returns (address)",
  "function owner() external view returns (address)",
];

// ============================================================================
// Commands
// ============================================================================

async function checkReceiver() {
  console.log("Checking hub BridgeReceiver...\n");
  const config = loadCliConfig();

  if (!config.hubBridgeReceiver) {
    console.error("Network profile is not configured");
    return;
  }

  const provider = new ethers.JsonRpcProvider(config.hubRpc);
  const contract = new ethers.Contract(
    config.hubBridgeReceiver,
    BRIDGE_RECEIVER_ABI,
    provider
  );

  console.log("Profile:", config.profile);
  console.log("Address:", config.hubBridgeReceiver);

  const endpoint = await contract.endpoint();
  console.log("LZ Endpoint:", endpoint);

  const owner = await contract.owner();
  console.log("Owner:", owner);

  // Check trusted forwarders
  console.log("\nTrusted Forwarders:");
  const trusted = await contract.trustedForwarders(config.targetLayerZeroEid);
  if (trusted !== ethers.ZeroHash) {
    const addr = "0x" + trusted.slice(-40);
    console.log(`  Target (${config.targetLayerZeroEid}): ${addr}`);
  }

  // Check message count
  const count = await contract.getGenLayerMessageCount();
  console.log("\nTotal Messages:", count.toString());

  // Check pending
  const [ids, messages] = await contract.getPendingGenLayerMessages();
  console.log("Pending Messages:", ids.length);
}

async function checkSender() {
  console.log("Checking target BridgeSender...\n");
  const config = loadCliConfig();

  if (!config.bridgeSender) {
    console.error("Network profile is not configured");
    return;
  }

  const senderAddr = config.bridgeSender;

  const provider = new ethers.JsonRpcProvider(config.targetRpc);
  const contract = new ethers.Contract(senderAddr, BRIDGE_SENDER_ABI, provider);

  console.log("Address:", senderAddr);

  const endpoint = await contract.endpoint();
  console.log("LZ Endpoint:", endpoint);

  const owner = await contract.owner();
  console.log("Owner:", owner);

  const zkSyncEid = await contract.zkSyncEid();
  console.log("\nConfigured hub EID:", zkSyncEid.toString());

  const zkSyncReceiver = await contract.zkSyncBridgeReceiver();
  const receiverAddr = "0x" + zkSyncReceiver.slice(-40);
  console.log("Hub receiver (bytes32):", zkSyncReceiver);
  console.log("Hub receiver (address):", receiverAddr);

  // Expected receiver
  const expected = config.hubBridgeReceiver;
  if (expected) {
    if (receiverAddr.toLowerCase() === expected.toLowerCase()) {
      console.log("\n✓ Receiver matches expected");
    } else {
      console.log("\n✗ Receiver MISMATCH!");
      console.log("  Expected:", expected);
    }
  }
}

async function checkForwarder() {
  console.log("Checking hub BridgeForwarder...\n");
  const config = loadCliConfig();

  if (!config.bridgeForwarder) {
    console.error("Network profile is not configured");
    return;
  }

  const provider = new ethers.JsonRpcProvider(config.hubRpc);
  const contract = new ethers.Contract(
    config.bridgeForwarder,
    BRIDGE_FORWARDER_ABI,
    provider
  );

  console.log("Profile:", config.profile);
  console.log("Address:", config.bridgeForwarder);

  const endpoint = await contract.endpoint();
  console.log("LZ Endpoint:", endpoint);

  const owner = await contract.owner();
  console.log("Owner:", owner);

  const caller = await contract.caller();
  console.log("Caller:", caller);

  // Check bridge addresses
  console.log("\nBridge Addresses:");
  const bridge = await contract.bridgeAddresses(config.targetLayerZeroEid);
  if (bridge !== ethers.ZeroHash) {
    const addr = "0x" + bridge.slice(-40);
    console.log(`  Target (${config.targetLayerZeroEid}): ${addr}`);
  }
}

async function checkConfig() {
  console.log("Verifying Bridge Configuration...\n");
  const config = loadCliConfig();

  console.log("Environment:");
  console.log("  Profile:", config.profile);
  console.log("  Hub RPC:", config.hubRpc || "(not set)");
  console.log("  Target RPC:", config.targetRpc || "(not set)");
  console.log("  GenLayer RPC:", config.genlayerRpc || "(not set)");
  console.log("");
  console.log("Contracts:");
  console.log("  Hub BridgeReceiver:", config.hubBridgeReceiver || "(not set)");
  console.log("  BridgeForwarder:", config.bridgeForwarder || "(not set)");
  console.log("  BridgeSender:", config.bridgeSender || "(not set)");
  console.log("  BridgeReceiver IC:", config.bridgeReceiverIc || "(not set)");
  console.log("");

  // Check each contract has code
  if (!config.hubRpc || !config.targetRpc) {
    console.error("Network profile is not configured");
    return;
  }
  const zkProvider = new ethers.JsonRpcProvider(config.hubRpc);
  const baseProvider = new ethers.JsonRpcProvider(config.targetRpc);

  console.log("Contract Code Verification:");

  for (const [name, addr, provider] of [
    ["Hub BridgeReceiver", config.hubBridgeReceiver, zkProvider],
    ["BridgeForwarder", config.bridgeForwarder, zkProvider],
    ["BridgeSender", config.bridgeSender, baseProvider],
  ] as const) {
    if (addr) {
      const code = await provider.getCode(addr);
      const hasCode = code !== "0x";
      console.log(`  ${name}: ${hasCode ? "✓" : "✗ NO CODE"}`);
    }
  }
}

async function pendingMessages() {
  console.log("Fetching pending messages from the hub BridgeReceiver...\n");
  const config = loadCliConfig();

  if (!config.hubBridgeReceiver) {
    console.error("Network profile is not configured");
    return;
  }

  const provider = new ethers.JsonRpcProvider(config.hubRpc);
  const contract = new ethers.Contract(
    config.hubBridgeReceiver,
    BRIDGE_RECEIVER_ABI,
    provider
  );

  const [ids, messages] = await contract.getPendingGenLayerMessages();
  console.log(`Found ${ids.length} pending message(s)\n`);

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    console.log(`Message ${i + 1}:`);
    console.log(`  ID: ${msg.messageId}`);
    console.log(`  Source Chain: ${msg.srcChainId}`);
    console.log(`  Source Sender: ${msg.srcSender}`);
    console.log(`  Target Contract: ${msg.targetContract}`);
    console.log(`  Data: ${msg.data}`);
    console.log(`  Relayed: ${msg.relayed}`);
    console.log("");
  }
}

async function debugTx(txHash: string) {
  console.log(`Debugging Transaction: ${txHash}\n`);
  const config = loadCliConfig();

  // Try hub first, then target
  for (const [name, rpc] of [
    ["Hub", config.hubRpc],
    ["Target", config.targetRpc],
  ]) {
    if (!rpc) continue;
    const provider = new ethers.JsonRpcProvider(rpc);

    try {
      const receipt = await provider.getTransactionReceipt(txHash);
      if (!receipt) continue;

      console.log(`Found on ${name}`);
      console.log("  Block:", receipt.blockNumber);
      console.log("  Status:", receipt.status === 1 ? "Success" : "Failed");
      console.log("  Gas Used:", receipt.gasUsed.toString());
      console.log("  Logs:", receipt.logs.length);

      if (receipt.status === 0) {
        // Try to get revert reason
        const tx = await provider.getTransaction(txHash);
        if (tx) {
          try {
            await provider.call(
              {
                to: tx.to,
                data: tx.data,
                value: tx.value,
              },
            );
          } catch (e: any) {
            console.log("\nRevert Reason:", e.reason || e.message);
          }
        }
      }

      return;
    } catch {
      continue;
    }
  }

  console.log("Transaction not found on any network");
}

function showHelp() {
  console.log(`
Bridge Service CLI

Usage: npx ts-node cli.ts <command> [args]

Commands:
  check-receiver           Check hub BridgeReceiver state
  check-sender             Check target BridgeSender state
  check-forwarder          Check hub BridgeForwarder state
  check-config             Verify all contract configurations
  pending-messages         List pending messages on the hub
  debug-tx <hash>          Debug a transaction
  help                     Show this help message

Environment:
  Set these in .env:
    BRIDGE_NETWORK_PROFILE, GENLAYER_CHAIN_ID, GENLAYER_RPC_URL
    HUB_RPC_URL, HUB_CHAIN_ID, HUB_LAYERZERO_EID, HUB_BRIDGE_RECEIVER_ADDRESS
    TARGET_RPC_URL, TARGET_CHAIN_ID, TARGET_LAYERZERO_EID
    BRIDGE_FORWARDER_ADDRESS, BRIDGE_SENDER_ADDRESS, BRIDGE_RECEIVER_IC_ADDRESS
`);
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  const [, , command, ...args] = process.argv;

  try {
    switch (command) {
      case "check-receiver":
        await checkReceiver();
        break;
      case "check-sender":
        await checkSender();
        break;
      case "check-forwarder":
        await checkForwarder();
        break;
      case "check-config":
        await checkConfig();
        break;
      case "pending-messages":
        await pendingMessages();
        break;
      case "debug-tx":
        if (!args[0]) {
          console.error("Usage: debug-tx <transaction_hash>");
          process.exit(1);
        }
        await debugTx(args[0]);
        break;
      case "help":
      case "--help":
      case "-h":
        showHelp();
        break;
      default:
        if (command) {
          console.error(`Unknown command: ${command}\n`);
        }
        showHelp();
        process.exit(command ? 1 : 0);
    }
  } catch (error: any) {
    console.error("Error:", error.message || error);
    process.exit(1);
  }
}

main();
