#!/usr/bin/env node
/**
 * Bridge Service CLI - Unified debug and inspection tool
 *
 * Usage:
 *   npx ts-node cli.ts <command> [args]
 *
 * Commands:
 *   check-receiver           - Check zkSync BridgeReceiver state
 *   check-sender             - Check Base BridgeSender state
 *   check-forwarder          - Check zkSync BridgeForwarder state
 *   check-config             - Verify all contract configurations
 *   pending-messages         - List pending messages on zkSync
 *   debug-tx <hash>          - Debug a transaction (show revert reason)
 *   help                     - Show this help message
 */

import { ethers } from "ethers";
import dotenv from "dotenv";

dotenv.config();

// ============================================================================
// Configuration
// ============================================================================

const CONFIG = {
  // RPCs
  zkSyncRpc: process.env.ZKSYNC_RPC_URL || "https://sepolia.era.zksync.dev",
  baseRpc: process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org",
  genlayerRpc: process.env.GENLAYER_RPC_URL || "https://studio-stage.genlayer.com/api",

  // Contracts
  zkSyncBridgeReceiver: process.env.ZKSYNC_BRIDGE_RECEIVER_ADDRESS || "",
  bridgeForwarder: process.env.BRIDGE_FORWARDER_ADDRESS || "",
  bridgeSender: process.env.BRIDGE_SENDER_ADDRESS || "",
  bridgeReceiverIc: process.env.BRIDGE_RECEIVER_IC_ADDRESS || "",
};

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
  console.log("Checking zkSync BridgeReceiver...\n");

  if (!CONFIG.zkSyncBridgeReceiver) {
    console.error("ZKSYNC_BRIDGE_RECEIVER_ADDRESS not set");
    return;
  }

  const provider = new ethers.JsonRpcProvider(CONFIG.zkSyncRpc);
  const contract = new ethers.Contract(
    CONFIG.zkSyncBridgeReceiver,
    BRIDGE_RECEIVER_ABI,
    provider
  );

  console.log("Address:", CONFIG.zkSyncBridgeReceiver);

  const endpoint = await contract.endpoint();
  console.log("LZ Endpoint:", endpoint);

  const owner = await contract.owner();
  console.log("Owner:", owner);

  // Check trusted forwarders
  console.log("\nTrusted Forwarders:");
  for (const [name, eid] of [
    ["Base Sepolia", 40245],
    ["Base Mainnet", 30184],
  ]) {
    const trusted = await contract.trustedForwarders(eid);
    if (trusted !== ethers.ZeroHash) {
      const addr = "0x" + trusted.slice(-40);
      console.log(`  ${name} (${eid}): ${addr}`);
    }
  }

  // Check message count
  const count = await contract.getGenLayerMessageCount();
  console.log("\nTotal Messages:", count.toString());

  // Check pending
  const [ids, messages] = await contract.getPendingGenLayerMessages();
  console.log("Pending Messages:", ids.length);
}

async function checkSender() {
  console.log("Checking Base BridgeSender...\n");

  const senderAddr =
    CONFIG.bridgeSender || "0x4c5df0951CAbE21AFe30bDa62551e1A5792889E6";

  const provider = new ethers.JsonRpcProvider(CONFIG.baseRpc);
  const contract = new ethers.Contract(senderAddr, BRIDGE_SENDER_ABI, provider);

  console.log("Address:", senderAddr);

  const endpoint = await contract.endpoint();
  console.log("LZ Endpoint:", endpoint);

  const owner = await contract.owner();
  console.log("Owner:", owner);

  const zkSyncEid = await contract.zkSyncEid();
  console.log("\nzkSync EID:", zkSyncEid.toString());

  const zkSyncReceiver = await contract.zkSyncBridgeReceiver();
  const receiverAddr = "0x" + zkSyncReceiver.slice(-40);
  console.log("zkSync Receiver (bytes32):", zkSyncReceiver);
  console.log("zkSync Receiver (address):", receiverAddr);

  // Expected receiver
  const expected = CONFIG.zkSyncBridgeReceiver;
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
  console.log("Checking zkSync BridgeForwarder...\n");

  if (!CONFIG.bridgeForwarder) {
    console.error("BRIDGE_FORWARDER_ADDRESS not set");
    return;
  }

  const provider = new ethers.JsonRpcProvider(CONFIG.zkSyncRpc);
  const contract = new ethers.Contract(
    CONFIG.bridgeForwarder,
    BRIDGE_FORWARDER_ABI,
    provider
  );

  console.log("Address:", CONFIG.bridgeForwarder);

  const endpoint = await contract.endpoint();
  console.log("LZ Endpoint:", endpoint);

  const owner = await contract.owner();
  console.log("Owner:", owner);

  const caller = await contract.caller();
  console.log("Caller:", caller);

  // Check bridge addresses
  console.log("\nBridge Addresses:");
  for (const [name, eid] of [
    ["Base Sepolia", 40245],
    ["Base Mainnet", 30184],
  ]) {
    const bridge = await contract.bridgeAddresses(eid);
    if (bridge !== ethers.ZeroHash) {
      const addr = "0x" + bridge.slice(-40);
      console.log(`  ${name} (${eid}): ${addr}`);
    }
  }
}

async function checkConfig() {
  console.log("Verifying Bridge Configuration...\n");

  console.log("Environment:");
  console.log("  zkSync RPC:", CONFIG.zkSyncRpc);
  console.log("  Base RPC:", CONFIG.baseRpc);
  console.log("  GenLayer RPC:", CONFIG.genlayerRpc);
  console.log("");
  console.log("Contracts:");
  console.log("  zkSync BridgeReceiver:", CONFIG.zkSyncBridgeReceiver || "(not set)");
  console.log("  BridgeForwarder:", CONFIG.bridgeForwarder || "(not set)");
  console.log("  BridgeSender:", CONFIG.bridgeSender || "(not set)");
  console.log("  BridgeReceiver IC:", CONFIG.bridgeReceiverIc || "(not set)");
  console.log("");

  // Check each contract has code
  const zkProvider = new ethers.JsonRpcProvider(CONFIG.zkSyncRpc);
  const baseProvider = new ethers.JsonRpcProvider(CONFIG.baseRpc);

  console.log("Contract Code Verification:");

  for (const [name, addr, provider] of [
    ["zkSync BridgeReceiver", CONFIG.zkSyncBridgeReceiver, zkProvider],
    ["BridgeForwarder", CONFIG.bridgeForwarder, zkProvider],
    ["BridgeSender", CONFIG.bridgeSender, baseProvider],
  ] as const) {
    if (addr) {
      const code = await provider.getCode(addr);
      const hasCode = code !== "0x";
      console.log(`  ${name}: ${hasCode ? "✓" : "✗ NO CODE"}`);
    }
  }
}

async function pendingMessages() {
  console.log("Fetching Pending Messages from zkSync BridgeReceiver...\n");

  if (!CONFIG.zkSyncBridgeReceiver) {
    console.error("ZKSYNC_BRIDGE_RECEIVER_ADDRESS not set");
    return;
  }

  const provider = new ethers.JsonRpcProvider(CONFIG.zkSyncRpc);
  const contract = new ethers.Contract(
    CONFIG.zkSyncBridgeReceiver,
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

  // Try zkSync first, then Base
  for (const [name, rpc] of [
    ["zkSync Sepolia", CONFIG.zkSyncRpc],
    ["Base Sepolia", CONFIG.baseRpc],
  ]) {
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
              tx.blockNumber
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
  check-receiver           Check zkSync BridgeReceiver state
  check-sender             Check Base BridgeSender state
  check-forwarder          Check zkSync BridgeForwarder state
  check-config             Verify all contract configurations
  pending-messages         List pending messages on zkSync
  debug-tx <hash>          Debug a transaction
  help                     Show this help message

Environment:
  Set these in .env:
    ZKSYNC_RPC_URL, BASE_SEPOLIA_RPC_URL
    ZKSYNC_BRIDGE_RECEIVER_ADDRESS, BRIDGE_FORWARDER_ADDRESS
    BRIDGE_SENDER_ADDRESS, BRIDGE_RECEIVER_IC_ADDRESS
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
