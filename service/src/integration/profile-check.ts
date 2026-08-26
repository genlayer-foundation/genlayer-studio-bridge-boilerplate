import { ethers } from "ethers";
import { getNetworkProfile } from "../config.js";

if (process.env.COUNSEL_BRIDGE_INTEGRATION !== "1") {
  throw new Error("Set COUNSEL_BRIDGE_INTEGRATION=1 to run the opt-in network profile check.");
}

const profile = getNetworkProfile();
const hubProvider = new ethers.JsonRpcProvider(profile.hubRpcUrl);
const targetProvider = new ethers.JsonRpcProvider(profile.targetRpcUrl);

const [hubNetwork, targetNetwork, senderCode, forwarderCode, receiverCode] = await Promise.all([
  hubProvider.getNetwork(),
  targetProvider.getNetwork(),
  targetProvider.getCode(profile.targetBridgeSenderAddress),
  hubProvider.getCode(profile.bridgeForwarderAddress),
  hubProvider.getCode(profile.hubBridgeReceiverAddress),
]);
const targetReceiverCode = await targetProvider.getCode(profile.targetBridgeReceiverAddress);

if (hubNetwork.chainId !== BigInt(profile.hubChainId)) {
  throw new Error(`Hub RPC chain ID ${hubNetwork.chainId} does not match ${profile.hubChainId}.`);
}
if (targetNetwork.chainId !== BigInt(profile.targetChainId)) {
  throw new Error(`Target RPC chain ID ${targetNetwork.chainId} does not match ${profile.targetChainId}.`);
}
for (const [name, code] of [
  ["BridgeSender", senderCode],
  ["BridgeForwarder", forwarderCode],
  ["Hub BridgeReceiver", receiverCode],
  ["Target BridgeReceiver", targetReceiverCode],
] as const) {
  if (code === "0x") throw new Error(`${name} has no deployed bytecode at the configured address.`);
}

const forwarder = new ethers.Contract(
  profile.bridgeForwarderAddress,
  ["function endpoint() view returns (address)"],
  hubProvider,
);
const hubReceiver = new ethers.Contract(
  profile.hubBridgeReceiverAddress,
  ["function endpoint() view returns (address)"],
  hubProvider,
);
const sender = new ethers.Contract(
  profile.targetBridgeSenderAddress,
  [
    "function endpoint() view returns (address)",
    "function zkSyncEid() view returns (uint32)",
    "function zkSyncBridgeReceiver() view returns (bytes32)",
  ],
  targetProvider,
);
const targetReceiver = new ethers.Contract(
  profile.targetBridgeReceiverAddress,
  ["function endpoint() view returns (address)"],
  targetProvider,
);
const [hubEndpoint, hubReceiverEndpoint, senderEndpoint, senderEid, senderReceiver, targetEndpoint] =
  await Promise.all([
    forwarder.endpoint(),
    hubReceiver.endpoint(),
    sender.endpoint(),
    sender.zkSyncEid(),
    sender.zkSyncBridgeReceiver(),
    targetReceiver.endpoint(),
  ]);
if (hubEndpoint.toLowerCase() !== hubReceiverEndpoint.toLowerCase()) {
  throw new Error("Hub BridgeForwarder and BridgeReceiver use different LayerZero endpoints.");
}
if (senderEndpoint.toLowerCase() !== targetEndpoint.toLowerCase()) {
  throw new Error("Target BridgeSender and BridgeReceiver use different LayerZero endpoints.");
}
if (Number(senderEid) !== profile.hubLayerZeroEid) {
  throw new Error(`BridgeSender EID ${senderEid} does not match HUB_LAYERZERO_EID ${profile.hubLayerZeroEid}.`);
}
const configuredReceiver = `0x${senderReceiver.slice(-40)}`;
if (configuredReceiver.toLowerCase() !== profile.hubBridgeReceiverAddress.toLowerCase()) {
  throw new Error("BridgeSender does not point to the configured hub BridgeReceiver.");
}

console.log(JSON.stringify({
  profile: profile.name,
  genlayerNetwork: profile.genlayerNetwork,
  genlayerChainId: profile.genlayerChainId,
  hubChainId: Number(hubNetwork.chainId),
  targetChainId: Number(targetNetwork.chainId),
  contracts: {
    targetBridgeSender: profile.targetBridgeSenderAddress,
    bridgeForwarder: profile.bridgeForwarderAddress,
    hubBridgeReceiver: profile.hubBridgeReceiverAddress,
    targetBridgeReceiver: profile.targetBridgeReceiverAddress,
  },
  wiring: {
    hubEndpoint,
    targetEndpoint,
    senderEid: Number(senderEid),
    senderHubReceiver: configuredReceiver,
  },
}, null, 2));
