/**
 * Unified configuration script for all bridge contracts.
 *
 * Usage:
 *   ACTION=<action> npx hardhat run scripts/configure.ts --network <network>
 *
 * Actions:
 *   set-trusted-forwarder - Add trusted forwarder to BridgeReceiver
 *   set-authorized-relayer - Add authorized relayer to BridgeReceiver
 *   set-bridge-address - Set destination bridge on BridgeForwarder
 *   set-sender-receiver - Update zkSync receiver on BridgeSender
 *
 * Required env vars vary by action (see usage info below).
 */

import { getEnvVar, getEnvVarOrDefault, validateAddress, addressToBytes32, getContract } from "./utils";
import { ethers } from "hardhat";

type ConfigAction =
  | "set-trusted-forwarder"
  | "set-authorized-relayer"
  | "set-bridge-address"
  | "set-sender-receiver"
  | "set-layerzero-config";

// ============================================================================
// Configuration Actions
// ============================================================================

/**
 * Set trusted forwarder on BridgeReceiver
 * Required env: BRIDGE_RECEIVER_ADDRESS, TRUSTED_FORWARDER_ADDRESS, SRC_EID
 */
async function setTrustedForwarder() {
  const receiverAddress = getEnvVar("BRIDGE_RECEIVER_ADDRESS");
  const forwarderAddress = getEnvVar("TRUSTED_FORWARDER_ADDRESS");
  const srcEid = parseInt(getEnvVar("SRC_EID"));

  validateAddress(receiverAddress, "BRIDGE_RECEIVER_ADDRESS");
  validateAddress(forwarderAddress, "TRUSTED_FORWARDER_ADDRESS");

  console.log("\nSetting trusted forwarder on BridgeReceiver");
  console.log("  Receiver:", receiverAddress);
  console.log("  Forwarder:", forwarderAddress);
  console.log("  Source EID:", srcEid);

  const receiver = await getContract("BridgeReceiver", receiverAddress);
  const forwarderBytes32 = addressToBytes32(forwarderAddress);

  const tx = await receiver.setTrustedForwarder(srcEid, forwarderBytes32);
  console.log("  TX:", tx.hash);

  await tx.wait();
  console.log("  ✓ Trusted forwarder set successfully");
}

/**
 * Set authorized relayer on BridgeReceiver
 * Required env: BRIDGE_RECEIVER_ADDRESS, RELAYER_ADDRESS (or uses OWNER_ADDRESS)
 */
async function setAuthorizedRelayer() {
  const receiverAddress = getEnvVar("BRIDGE_RECEIVER_ADDRESS");
  const relayerAddress = getEnvVarOrDefault("RELAYER_ADDRESS", process.env.OWNER_ADDRESS || "");

  validateAddress(receiverAddress, "BRIDGE_RECEIVER_ADDRESS");
  validateAddress(relayerAddress, "RELAYER_ADDRESS");

  console.log("\nSetting authorized relayer on BridgeReceiver");
  console.log("  Receiver:", receiverAddress);
  console.log("  Relayer:", relayerAddress);

  const receiver = await getContract("BridgeReceiver", receiverAddress);

  const tx = await receiver.setAuthorizedRelayer(relayerAddress, true);
  console.log("  TX:", tx.hash);

  await tx.wait();

  // Verify
  const isAuthorized = await receiver.authorizedRelayers(relayerAddress);
  console.log("  ✓ Authorized relayer set (verified:", isAuthorized, ")");
}

/**
 * Set bridge address on BridgeForwarder
 * Required env: BRIDGE_FORWARDER_ADDRESS, DST_EID, DST_BRIDGE_ADDRESS
 */
async function setBridgeAddress() {
  const forwarderAddress = getEnvVar("BRIDGE_FORWARDER_ADDRESS");
  const dstEid = parseInt(getEnvVar("DST_EID"));
  const dstBridgeAddress = getEnvVar("DST_BRIDGE_ADDRESS");

  validateAddress(forwarderAddress, "BRIDGE_FORWARDER_ADDRESS");
  validateAddress(dstBridgeAddress, "DST_BRIDGE_ADDRESS");

  console.log("\nSetting bridge address on BridgeForwarder");
  console.log("  Forwarder:", forwarderAddress);
  console.log("  Destination EID:", dstEid);
  console.log("  Destination Bridge:", dstBridgeAddress);

  const forwarder = await getContract("BridgeForwarder", forwarderAddress);
  const bridgeBytes32 = addressToBytes32(dstBridgeAddress);

  const tx = await forwarder.setBridgeAddress(dstEid, bridgeBytes32);
  console.log("  TX:", tx.hash);

  await tx.wait();
  console.log("  ✓ Bridge address set successfully");
}

/**
 * Update zkSync bridge receiver on BridgeSender
 * Required env: BRIDGE_SENDER_ADDRESS, HUB_BRIDGE_RECEIVER_ADDRESS, DESTINATION_LAYERZERO_EID
 */
async function setSenderReceiver() {
  const senderAddress = getEnvVar("BRIDGE_SENDER_ADDRESS");
  const zkSyncReceiverAddress = getEnvVar("HUB_BRIDGE_RECEIVER_ADDRESS");
  const zkSyncEid = parseInt(getEnvVar("DESTINATION_LAYERZERO_EID"), 10);

  validateAddress(senderAddress, "BRIDGE_SENDER_ADDRESS");
  validateAddress(zkSyncReceiverAddress, "HUB_BRIDGE_RECEIVER_ADDRESS");

  console.log("\nUpdating zkSync receiver on BridgeSender");
  console.log("  Sender:", senderAddress);
  console.log("  zkSync EID:", zkSyncEid);
  console.log("  zkSync Receiver:", zkSyncReceiverAddress);

  const sender = await getContract("BridgeSender", senderAddress);

  // Show current settings
  const currentReceiver = await sender.zkSyncBridgeReceiver();
  const currentEid = await sender.zkSyncEid();
  console.log("\n  Current settings:");
  console.log("    Receiver:", currentReceiver);
  console.log("    EID:", currentEid);

  const receiverBytes32 = addressToBytes32(zkSyncReceiverAddress);
  const tx = await sender.setZkSyncBridgeReceiver(zkSyncEid, receiverBytes32);
  console.log("\n  TX:", tx.hash);

  await tx.wait();

  // Verify
  const newReceiver = await sender.zkSyncBridgeReceiver();
  console.log("  ✓ Updated (verified:", newReceiver, ")");
}

/**
 * Apply a pre-encoded LayerZero message-library configuration through the OApp.
 * Required env: OAPP_ADDRESS, OAPP_TYPE (sender or receiver), LAYERZERO_LIBRARY,
 * CONFIG_EID, CONFIG_TYPE, CONFIG_BYTES.
 */
async function setLayerZeroConfig() {
  const oappAddress = getEnvVar("OAPP_ADDRESS");
  const oappType = getEnvVar("OAPP_TYPE").toLowerCase();
  const library = getEnvVar("LAYERZERO_LIBRARY");
  const eid = parseInt(getEnvVar("CONFIG_EID"), 10);
  const configType = parseInt(getEnvVar("CONFIG_TYPE"), 10);
  const configBytes = getEnvVar("CONFIG_BYTES");

  validateAddress(oappAddress, "OAPP_ADDRESS");
  if (oappType !== "sender" && oappType !== "receiver") throw new Error("OAPP_TYPE must be sender or receiver");
  validateAddress(library, "LAYERZERO_LIBRARY");
  if (!Number.isInteger(eid) || eid <= 0) throw new Error("CONFIG_EID must be a positive integer");
  if (!Number.isInteger(configType) || configType <= 0) throw new Error("CONFIG_TYPE must be a positive integer");
  if (!/^0x[0-9a-fA-F]*$/.test(configBytes) || configBytes.length % 2 !== 0) {
    throw new Error("CONFIG_BYTES must be an even-length hex string");
  }

  const oapp = await getContract(oappType === "sender" ? "BridgeSender" : "BridgeReceiver", oappAddress);
  const tx = await oapp.setLayerZeroConfig(library, eid, configType, configBytes);
  console.log("  TX:", tx.hash);
  await tx.wait();
  console.log("  ✓ LayerZero configuration applied");
}

// ============================================================================
// Main
// ============================================================================

function printUsage() {
  console.log("Usage: ACTION=<action> npx hardhat run scripts/configure.ts --network <network>");
  console.log("\nActions:");
  console.log("  set-trusted-forwarder  - Add trusted forwarder to BridgeReceiver");
  console.log("    Env: BRIDGE_RECEIVER_ADDRESS, TRUSTED_FORWARDER_ADDRESS, SRC_EID");
  console.log("");
  console.log("  set-authorized-relayer - Add authorized relayer to BridgeReceiver");
  console.log("    Env: BRIDGE_RECEIVER_ADDRESS, RELAYER_ADDRESS (or OWNER_ADDRESS)");
  console.log("");
  console.log("  set-bridge-address     - Set destination bridge on BridgeForwarder");
  console.log("    Env: BRIDGE_FORWARDER_ADDRESS, DST_EID, DST_BRIDGE_ADDRESS");
  console.log("");
  console.log("  set-sender-receiver    - Update zkSync receiver on BridgeSender");
  console.log("    Env: BRIDGE_SENDER_ADDRESS, HUB_BRIDGE_RECEIVER_ADDRESS, DESTINATION_LAYERZERO_EID");
  console.log("");
  console.log("  set-layerzero-config   - Apply pre-encoded LayerZero library configuration");
  console.log("    Env: OAPP_ADDRESS, OAPP_TYPE, LAYERZERO_LIBRARY, CONFIG_EID, CONFIG_TYPE, CONFIG_BYTES");
}

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  const action = (process.env.ACTION || "").toLowerCase() as ConfigAction;

  if (!action) {
    printUsage();
    process.exit(1);
  }

  switch (action) {
    case "set-trusted-forwarder":
      await setTrustedForwarder();
      break;
    case "set-authorized-relayer":
      await setAuthorizedRelayer();
      break;
    case "set-bridge-address":
      await setBridgeAddress();
      break;
    case "set-sender-receiver":
      await setSenderReceiver();
      break;
    case "set-layerzero-config":
      await setLayerZeroConfig();
      break;
    default:
      console.error(`Unknown action: ${action}`);
      printUsage();
      process.exit(1);
  }
}

main().catch((error) => {
  console.error("\nConfiguration failed!");
  console.error(error);
  process.exitCode = 1;
});
