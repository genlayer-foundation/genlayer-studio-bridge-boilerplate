/**
 * Unified deployment script for all bridge contracts.
 *
 * Usage:
 *   npx hardhat run scripts/deploy.ts --network zkSyncSepoliaTestnet
 *
 * Set CONTRACT env var to specify which contract:
 *   CONTRACT=hub-inbound npx hardhat run scripts/deploy.ts --network zkSyncSepoliaTestnet
 *   CONTRACT=hub-outbound npx hardhat run scripts/deploy.ts --network zkSyncSepoliaTestnet
 *   CONTRACT=evm-outbox npx hardhat run scripts/deploy.ts --network baseSepoliaTestnet
 *   CONTRACT=evm-inbox npx hardhat run scripts/deploy.ts --network baseSepoliaTestnet
 */

import {
  getNetworkInfo,
  logNetworkHeader,
  saveDeploymentResult,
  verifyContract,
  getEnvVar,
  getEnvVarOrDefault,
  validateAddress,
  addressToBytes32,
  LAYER_ZERO_EIDS,
} from "./utils";
import { ethers } from "hardhat";

type ContractType =
  | "receiver"
  | "forwarder"
  | "sender"
  | "hub-inbound"
  | "hub-outbound"
  | "evm-outbox"
  | "evm-inbox";

// ============================================================================
// Deploy Functions
// ============================================================================

async function deployBridgeReceiver() {
  const networkInfo = await getNetworkInfo();
  logNetworkHeader("Deploying BridgeReceiver", networkInfo);

  // Validate config
  validateAddress(networkInfo.endpointAddress, "LZ Endpoint");
  const ownerAddress = getEnvVar("OWNER_ADDRESS");
  validateAddress(ownerAddress, "Owner");

  console.log("\nConfiguration:");
  console.log("  Endpoint:", networkInfo.endpointAddress);
  console.log("  Owner:", ownerAddress);

  // Deploy
  const BridgeReceiver = await ethers.getContractFactory("BridgeReceiver");
  const contract = await BridgeReceiver.deploy(
    networkInfo.endpointAddress,
    ownerAddress
  );

  const deployTx = contract.deploymentTransaction();
  if (!deployTx) throw new Error("Deployment transaction not found");

  console.log("\nDeploying... TX:", deployTx.hash);
  await contract.waitForDeployment();
  const address = await contract.getAddress();

  // Save & verify
  await saveDeploymentResult({
    contract: "BridgeReceiver",
    network: networkInfo.networkName,
    chainId: Number(networkInfo.chainId),
    address,
    deploymentHash: deployTx.hash,
    params: { endpoint: networkInfo.endpointAddress, owner: ownerAddress },
    timestamp: new Date().toISOString(),
  });

  await verifyContract(address, [networkInfo.endpointAddress, ownerAddress]);

  console.log("\n✓ BridgeReceiver deployed to:", address);
  return address;
}

async function deployHubInboundInbox() {
  const networkInfo = await getNetworkInfo();
  logNetworkHeader("Deploying HubInboundInbox", networkInfo);

  validateAddress(networkInfo.endpointAddress, "LZ Endpoint");
  const ownerAddress = getEnvVar("OWNER_ADDRESS");
  validateAddress(ownerAddress, "Owner");

  console.log("\nConfiguration:");
  console.log("  Endpoint:", networkInfo.endpointAddress);
  console.log("  Owner:", ownerAddress);

  const HubInboundInbox = await ethers.getContractFactory("HubInboundInbox");
  const contract = await HubInboundInbox.deploy(
    networkInfo.endpointAddress,
    ownerAddress
  );

  const deployTx = contract.deploymentTransaction();
  if (!deployTx) throw new Error("Deployment transaction not found");

  console.log("\nDeploying... TX:", deployTx.hash);
  await contract.waitForDeployment();
  const address = await contract.getAddress();

  await saveDeploymentResult({
    contract: "HubInboundInbox",
    network: networkInfo.networkName,
    chainId: Number(networkInfo.chainId),
    address,
    deploymentHash: deployTx.hash,
    params: { endpoint: networkInfo.endpointAddress, owner: ownerAddress },
    timestamp: new Date().toISOString(),
  });

  await verifyContract(address, [networkInfo.endpointAddress, ownerAddress]);
  console.log("\n✓ HubInboundInbox deployed to:", address);
  return address;
}

async function deployBridgeForwarder() {
  const networkInfo = await getNetworkInfo();
  logNetworkHeader("Deploying BridgeForwarder", networkInfo);

  // Validate config
  validateAddress(networkInfo.endpointAddress, "LZ Endpoint");
  const ownerAddress = getEnvVar("OWNER_ADDRESS");
  const callerAddress = getEnvVar("CALLER_ADDRESS");
  validateAddress(ownerAddress, "Owner");
  validateAddress(callerAddress, "Caller");

  console.log("\nConfiguration:");
  console.log("  Endpoint:", networkInfo.endpointAddress);
  console.log("  Owner:", ownerAddress);
  console.log("  Caller:", callerAddress);

  // Deploy
  const BridgeForwarder = await ethers.getContractFactory("BridgeForwarder");
  const contract = await BridgeForwarder.deploy(
    networkInfo.endpointAddress,
    ownerAddress,
    callerAddress
  );

  const deployTx = contract.deploymentTransaction();
  if (!deployTx) throw new Error("Deployment transaction not found");

  console.log("\nDeploying... TX:", deployTx.hash);
  await contract.waitForDeployment();
  const address = await contract.getAddress();

  // Save & verify
  await saveDeploymentResult({
    contract: "BridgeForwarder",
    network: networkInfo.networkName,
    chainId: Number(networkInfo.chainId),
    address,
    deploymentHash: deployTx.hash,
    params: {
      endpoint: networkInfo.endpointAddress,
      owner: ownerAddress,
      caller: callerAddress,
    },
    timestamp: new Date().toISOString(),
  });

  await verifyContract(address, [
    networkInfo.endpointAddress,
    ownerAddress,
    callerAddress,
  ]);

  console.log("\n✓ BridgeForwarder deployed to:", address);
  return address;
}

async function deployHubOutboundRouter() {
  const networkInfo = await getNetworkInfo();
  logNetworkHeader("Deploying HubOutboundRouter", networkInfo);

  validateAddress(networkInfo.endpointAddress, "LZ Endpoint");
  const ownerAddress = getEnvVar("OWNER_ADDRESS");
  const relayerAddress = getEnvVarOrDefault("RELAYER_ADDRESS", process.env.CALLER_ADDRESS || "");
  validateAddress(ownerAddress, "Owner");
  validateAddress(relayerAddress, "Relayer");

  console.log("\nConfiguration:");
  console.log("  Endpoint:", networkInfo.endpointAddress);
  console.log("  Owner:", ownerAddress);
  console.log("  Relayer:", relayerAddress);

  const HubOutboundRouter = await ethers.getContractFactory("HubOutboundRouter");
  const contract = await HubOutboundRouter.deploy(
    networkInfo.endpointAddress,
    ownerAddress,
    relayerAddress
  );

  const deployTx = contract.deploymentTransaction();
  if (!deployTx) throw new Error("Deployment transaction not found");

  console.log("\nDeploying... TX:", deployTx.hash);
  await contract.waitForDeployment();
  const address = await contract.getAddress();

  await saveDeploymentResult({
    contract: "HubOutboundRouter",
    network: networkInfo.networkName,
    chainId: Number(networkInfo.chainId),
    address,
    deploymentHash: deployTx.hash,
    params: {
      endpoint: networkInfo.endpointAddress,
      owner: ownerAddress,
      relayer: relayerAddress,
    },
    timestamp: new Date().toISOString(),
  });

  await verifyContract(address, [
    networkInfo.endpointAddress,
    ownerAddress,
    relayerAddress,
  ]);

  console.log("\n✓ HubOutboundRouter deployed to:", address);
  return address;
}

async function deployBridgeSender() {
  const networkInfo = await getNetworkInfo();
  logNetworkHeader("Deploying BridgeSender", networkInfo);

  // Validate config
  validateAddress(networkInfo.endpointAddress, "LZ Endpoint");
  const ownerAddress = getEnvVar("OWNER_ADDRESS");
  const zkSyncReceiverAddress = getEnvVar("ZKSYNC_BRIDGE_RECEIVER_ADDRESS");
  const zkSyncEid = parseInt(getEnvVarOrDefault("ZKSYNC_EID", "40305"));
  validateAddress(ownerAddress, "Owner");
  validateAddress(zkSyncReceiverAddress, "zkSync BridgeReceiver");

  const zkSyncReceiverBytes32 = addressToBytes32(zkSyncReceiverAddress);

  console.log("\nConfiguration:");
  console.log("  Endpoint:", networkInfo.endpointAddress);
  console.log("  Owner:", ownerAddress);
  console.log("  zkSync EID:", zkSyncEid);
  console.log("  zkSync BridgeReceiver:", zkSyncReceiverAddress);

  // Deploy
  const BridgeSender = await ethers.getContractFactory("BridgeSender");
  const contract = await BridgeSender.deploy(
    networkInfo.endpointAddress,
    ownerAddress,
    zkSyncEid,
    zkSyncReceiverBytes32
  );

  const deployTx = contract.deploymentTransaction();
  if (!deployTx) throw new Error("Deployment transaction not found");

  console.log("\nDeploying... TX:", deployTx.hash);
  await contract.waitForDeployment();
  const address = await contract.getAddress();

  // Save & verify
  await saveDeploymentResult({
    contract: "BridgeSender",
    network: networkInfo.networkName,
    chainId: Number(networkInfo.chainId),
    address,
    deploymentHash: deployTx.hash,
    params: {
      endpoint: networkInfo.endpointAddress,
      owner: ownerAddress,
      zkSyncEid,
      zkSyncBridgeReceiver: zkSyncReceiverAddress,
    },
    timestamp: new Date().toISOString(),
  });

  await verifyContract(address, [
    networkInfo.endpointAddress,
    ownerAddress,
    zkSyncEid,
    zkSyncReceiverBytes32,
  ]);

  console.log("\n✓ BridgeSender deployed to:", address);
  console.log("\nNext: Set this as trusted forwarder on zkSync BridgeReceiver");
  return address;
}

async function deployEvmChainOutbox() {
  const networkInfo = await getNetworkInfo();
  logNetworkHeader("Deploying EvmChainOutbox", networkInfo);

  validateAddress(networkInfo.endpointAddress, "LZ Endpoint");
  const ownerAddress = getEnvVar("OWNER_ADDRESS");
  const hubInboundInboxAddress = getEnvVar("HUB_INBOUND_INBOX_ADDRESS");
  const hubEid = parseInt(getEnvVarOrDefault("HUB_EID", "40305"));
  validateAddress(ownerAddress, "Owner");
  validateAddress(hubInboundInboxAddress, "HubInboundInbox");

  const hubInboundInboxBytes32 = addressToBytes32(hubInboundInboxAddress);

  console.log("\nConfiguration:");
  console.log("  Endpoint:", networkInfo.endpointAddress);
  console.log("  Owner:", ownerAddress);
  console.log("  Hub EID:", hubEid);
  console.log("  HubInboundInbox:", hubInboundInboxAddress);

  const EvmChainOutbox = await ethers.getContractFactory("EvmChainOutbox");
  const contract = await EvmChainOutbox.deploy(
    networkInfo.endpointAddress,
    ownerAddress,
    hubEid,
    hubInboundInboxBytes32
  );

  const deployTx = contract.deploymentTransaction();
  if (!deployTx) throw new Error("Deployment transaction not found");

  console.log("\nDeploying... TX:", deployTx.hash);
  await contract.waitForDeployment();
  const address = await contract.getAddress();

  await saveDeploymentResult({
    contract: "EvmChainOutbox",
    network: networkInfo.networkName,
    chainId: Number(networkInfo.chainId),
    address,
    deploymentHash: deployTx.hash,
    params: {
      endpoint: networkInfo.endpointAddress,
      owner: ownerAddress,
      hubEid,
      hubInboundInbox: hubInboundInboxAddress,
    },
    timestamp: new Date().toISOString(),
  });

  await verifyContract(address, [
    networkInfo.endpointAddress,
    ownerAddress,
    hubEid,
    hubInboundInboxBytes32,
  ]);

  console.log("\n✓ EvmChainOutbox deployed to:", address);
  return address;
}

async function deployEvmChainInbox() {
  const networkInfo = await getNetworkInfo();
  logNetworkHeader("Deploying EvmChainInbox", networkInfo);

  validateAddress(networkInfo.endpointAddress, "LZ Endpoint");
  const ownerAddress = getEnvVar("OWNER_ADDRESS");
  validateAddress(ownerAddress, "Owner");

  console.log("\nConfiguration:");
  console.log("  Endpoint:", networkInfo.endpointAddress);
  console.log("  Owner:", ownerAddress);

  const EvmChainInbox = await ethers.getContractFactory("EvmChainInbox");
  const contract = await EvmChainInbox.deploy(
    networkInfo.endpointAddress,
    ownerAddress
  );

  const deployTx = contract.deploymentTransaction();
  if (!deployTx) throw new Error("Deployment transaction not found");

  console.log("\nDeploying... TX:", deployTx.hash);
  await contract.waitForDeployment();
  const address = await contract.getAddress();

  await saveDeploymentResult({
    contract: "EvmChainInbox",
    network: networkInfo.networkName,
    chainId: Number(networkInfo.chainId),
    address,
    deploymentHash: deployTx.hash,
    params: { endpoint: networkInfo.endpointAddress, owner: ownerAddress },
    timestamp: new Date().toISOString(),
  });

  await verifyContract(address, [networkInfo.endpointAddress, ownerAddress]);
  console.log("\n✓ EvmChainInbox deployed to:", address);
  return address;
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  const contractType = (process.env.CONTRACT || "").toLowerCase() as ContractType;

  if (!contractType) {
    console.log("Usage: CONTRACT=<type> npx hardhat run scripts/deploy.ts --network <network>");
    console.log("\nContract types:");
    console.log("  hub-inbound  - HubInboundInbox (deploy on zkSync)");
    console.log("  hub-outbound - HubOutboundRouter (deploy on zkSync)");
    console.log("  evm-outbox   - EvmChainOutbox (deploy on EVM source chains)");
    console.log("  evm-inbox    - EvmChainInbox (deploy on EVM destination chains)");
    console.log("  receiver     - legacy BridgeReceiver");
    console.log("  forwarder    - legacy BridgeForwarder");
    console.log("  sender       - legacy BridgeSender");
    process.exit(1);
  }

  switch (contractType) {
    case "receiver":
      await deployBridgeReceiver();
      break;
    case "forwarder":
      await deployBridgeForwarder();
      break;
    case "sender":
      await deployBridgeSender();
      break;
    case "hub-inbound":
      await deployHubInboundInbox();
      break;
    case "hub-outbound":
      await deployHubOutboundRouter();
      break;
    case "evm-outbox":
      await deployEvmChainOutbox();
      break;
    case "evm-inbox":
      await deployEvmChainInbox();
      break;
    default:
      throw new Error(`Unknown contract type: ${contractType}`);
  }
}

main().catch((error) => {
  console.error("\nDeployment failed!");
  console.error(error);
  process.exitCode = 1;
});
