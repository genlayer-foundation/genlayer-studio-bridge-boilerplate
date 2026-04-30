/**
 * Unified configuration script for all bridge contracts.
 *
 * Usage:
 *   ACTION=<action> npx hardhat run scripts/configure.ts --network <network>
 *
 * Actions:
 *   set-trusted-source - Add trusted source endpoint to HubInboundInbox
 *   set-authorized-relayer - Add authorized relayer to HubInboundInbox
 *   set-destination-endpoint - Set destination endpoint on HubOutboundRouter
 *   set-hub-inbox - Update hub inbox on EvmChainOutbox
 *   set-trusted-hub-router - Add trusted hub router to EvmChainInbox
 *
 * Required env vars vary by action (see usage info below).
 */

import { getEnvVar, getEnvVarOrDefault, validateAddress, addressToBytes32, peerToBytes32, getContract } from "./utils";
import { ethers } from "hardhat";

type ConfigAction =
  | "set-trusted-forwarder"
  | "set-trusted-source"
  | "set-authorized-relayer"
  | "set-bridge-address"
  | "set-destination-endpoint"
  | "set-sender-receiver"
  | "set-hub-inbox"
  | "set-trusted-hub-router";

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

async function setTrustedSource() {
  const inboxAddress = getEnvVar("HUB_INBOUND_INBOX_ADDRESS");
  const sourceEndpoint = getEnvVar("TRUSTED_SOURCE_ENDPOINT_ADDRESS");
  const srcEid = parseInt(getEnvVar("SRC_EID"));

  validateAddress(inboxAddress, "HUB_INBOUND_INBOX_ADDRESS");
  console.log("\nSetting trusted source endpoint on HubInboundInbox");
  console.log("  Inbox:", inboxAddress);
  console.log("  Source Endpoint:", sourceEndpoint);
  console.log("  Source EID:", srcEid);

  const inbox = await getContract("HubInboundInbox", inboxAddress);
  const sourceBytes32 = peerToBytes32(sourceEndpoint);

  const tx = await inbox.setTrustedSourceEndpoint(srcEid, sourceBytes32);
  console.log("  TX:", tx.hash);
  await tx.wait();
  console.log("  ✓ Trusted source endpoint set successfully");
}

/**
 * Set authorized relayer on BridgeReceiver
 * Required env: BRIDGE_RECEIVER_ADDRESS, RELAYER_ADDRESS (or uses OWNER_ADDRESS)
 */
async function setAuthorizedRelayer() {
  const receiverAddress = getEnvVarOrDefault("HUB_INBOUND_INBOX_ADDRESS", process.env.BRIDGE_RECEIVER_ADDRESS || "");
  const relayerAddress = getEnvVarOrDefault("RELAYER_ADDRESS", process.env.OWNER_ADDRESS || "");

  validateAddress(receiverAddress, "BRIDGE_RECEIVER_ADDRESS");
  validateAddress(relayerAddress, "RELAYER_ADDRESS");

  console.log("\nSetting authorized relayer on inbound inbox");
  console.log("  Receiver:", receiverAddress);
  console.log("  Relayer:", relayerAddress);

  const receiver = await getContract(
    process.env.HUB_INBOUND_INBOX_ADDRESS ? "HubInboundInbox" : "BridgeReceiver",
    receiverAddress
  );

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

async function setDestinationEndpoint() {
  const routerAddress = getEnvVar("HUB_OUTBOUND_ROUTER_ADDRESS");
  const dstEid = parseInt(getEnvVar("DST_EID"));
  const dstEndpointAddress = getEnvVar("DST_ENDPOINT_ADDRESS");

  validateAddress(routerAddress, "HUB_OUTBOUND_ROUTER_ADDRESS");
  console.log("\nSetting destination endpoint on HubOutboundRouter");
  console.log("  Router:", routerAddress);
  console.log("  Destination EID:", dstEid);
  console.log("  Destination Endpoint:", dstEndpointAddress);

  const router = await getContract("HubOutboundRouter", routerAddress);
  const endpointBytes32 = peerToBytes32(dstEndpointAddress);

  const tx = await router.setDestinationEndpoint(dstEid, endpointBytes32);
  console.log("  TX:", tx.hash);
  await tx.wait();
  console.log("  ✓ Destination endpoint set successfully");
}

/**
 * Update zkSync bridge receiver on BridgeSender
 * Required env: BRIDGE_SENDER_ADDRESS, ZKSYNC_BRIDGE_RECEIVER_ADDRESS, ZKSYNC_EID (default 40305)
 */
async function setSenderReceiver() {
  const senderAddress = getEnvVar("BRIDGE_SENDER_ADDRESS");
  const zkSyncReceiverAddress = getEnvVar("ZKSYNC_BRIDGE_RECEIVER_ADDRESS");
  const zkSyncEid = parseInt(getEnvVarOrDefault("ZKSYNC_EID", "40305"));

  validateAddress(senderAddress, "BRIDGE_SENDER_ADDRESS");
  validateAddress(zkSyncReceiverAddress, "ZKSYNC_BRIDGE_RECEIVER_ADDRESS");

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

async function setHubInbox() {
  const outboxAddress = getEnvVar("EVM_CHAIN_OUTBOX_ADDRESS");
  const hubInboxAddress = getEnvVar("HUB_INBOUND_INBOX_ADDRESS");
  const hubEid = parseInt(getEnvVarOrDefault("HUB_EID", "40305"));

  validateAddress(outboxAddress, "EVM_CHAIN_OUTBOX_ADDRESS");
  validateAddress(hubInboxAddress, "HUB_INBOUND_INBOX_ADDRESS");

  console.log("\nUpdating hub inbox on EvmChainOutbox");
  console.log("  Outbox:", outboxAddress);
  console.log("  Hub EID:", hubEid);
  console.log("  HubInboundInbox:", hubInboxAddress);

  const outbox = await getContract("EvmChainOutbox", outboxAddress);
  const inboxBytes32 = addressToBytes32(hubInboxAddress);
  const tx = await outbox.setHubInboundInbox(hubEid, inboxBytes32);
  console.log("  TX:", tx.hash);
  await tx.wait();
  console.log("  ✓ Hub inbox updated successfully");
}

async function setTrustedHubRouter() {
  const inboxAddress = getEnvVar("EVM_CHAIN_INBOX_ADDRESS");
  const hubRouterAddress = getEnvVar("HUB_OUTBOUND_ROUTER_ADDRESS");
  const hubEid = parseInt(getEnvVarOrDefault("HUB_EID", "40305"));

  validateAddress(inboxAddress, "EVM_CHAIN_INBOX_ADDRESS");
  validateAddress(hubRouterAddress, "HUB_OUTBOUND_ROUTER_ADDRESS");

  console.log("\nSetting trusted hub router on EvmChainInbox");
  console.log("  Inbox:", inboxAddress);
  console.log("  Hub EID:", hubEid);
  console.log("  HubOutboundRouter:", hubRouterAddress);

  const inbox = await getContract("EvmChainInbox", inboxAddress);
  const routerBytes32 = addressToBytes32(hubRouterAddress);
  const tx = await inbox.setTrustedHubRouter(hubEid, routerBytes32);
  console.log("  TX:", tx.hash);
  await tx.wait();
  console.log("  ✓ Trusted hub router set successfully");
}

// ============================================================================
// Main
// ============================================================================

function printUsage() {
  console.log("Usage: ACTION=<action> npx hardhat run scripts/configure.ts --network <network>");
  console.log("\nActions:");
  console.log("  set-trusted-source     - Add trusted source endpoint to HubInboundInbox");
  console.log("    Env: HUB_INBOUND_INBOX_ADDRESS, TRUSTED_SOURCE_ENDPOINT_ADDRESS, SRC_EID");
  console.log("");
  console.log("  set-trusted-forwarder  - Add trusted forwarder to BridgeReceiver");
  console.log("    Env: BRIDGE_RECEIVER_ADDRESS, TRUSTED_FORWARDER_ADDRESS, SRC_EID");
  console.log("");
  console.log("  set-authorized-relayer - Add authorized relayer to BridgeReceiver");
  console.log("    Env: BRIDGE_RECEIVER_ADDRESS, RELAYER_ADDRESS (or OWNER_ADDRESS)");
  console.log("");
  console.log("  set-bridge-address     - Set destination bridge on BridgeForwarder");
  console.log("    Env: BRIDGE_FORWARDER_ADDRESS, DST_EID, DST_BRIDGE_ADDRESS");
  console.log("");
  console.log("  set-destination-endpoint - Set destination endpoint on HubOutboundRouter");
  console.log("    Env: HUB_OUTBOUND_ROUTER_ADDRESS, DST_EID, DST_ENDPOINT_ADDRESS");
  console.log("");
  console.log("  set-sender-receiver    - Update zkSync receiver on BridgeSender");
  console.log("    Env: BRIDGE_SENDER_ADDRESS, ZKSYNC_BRIDGE_RECEIVER_ADDRESS, ZKSYNC_EID");
  console.log("");
  console.log("  set-hub-inbox          - Update hub inbox on EvmChainOutbox");
  console.log("    Env: EVM_CHAIN_OUTBOX_ADDRESS, HUB_INBOUND_INBOX_ADDRESS, HUB_EID");
  console.log("");
  console.log("  set-trusted-hub-router - Add trusted hub router to EvmChainInbox");
  console.log("    Env: EVM_CHAIN_INBOX_ADDRESS, HUB_OUTBOUND_ROUTER_ADDRESS, HUB_EID");
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
    case "set-trusted-source":
      await setTrustedSource();
      break;
    case "set-authorized-relayer":
      await setAuthorizedRelayer();
      break;
    case "set-bridge-address":
      await setBridgeAddress();
      break;
    case "set-destination-endpoint":
      await setDestinationEndpoint();
      break;
    case "set-sender-receiver":
      await setSenderReceiver();
      break;
    case "set-hub-inbox":
      await setHubInbox();
      break;
    case "set-trusted-hub-router":
      await setTrustedHubRouter();
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
