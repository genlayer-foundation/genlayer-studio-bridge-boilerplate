/**
 * Unified deployment script for all bridge contracts.
 *
 * Usage:
 *   npx hardhat run scripts/deploy.ts --network zkSyncSepoliaTestnet
 *
 * Set CONTRACT env var to specify which contract:
 *   CONTRACT=receiver npx hardhat run scripts/deploy.ts --network zkSyncSepoliaTestnet
 *   CONTRACT=forwarder npx hardhat run scripts/deploy.ts --network zkSyncSepoliaTestnet
 *   CONTRACT=sender npx hardhat run scripts/deploy.ts --network baseSepoliaTestnet
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

type ContractType = "receiver" | "forwarder" | "sender";

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

// ============================================================================
// Main
// ============================================================================

async function main() {
  const contractType = (process.env.CONTRACT || "").toLowerCase() as ContractType;

  if (!contractType) {
    console.log("Usage: CONTRACT=<type> npx hardhat run scripts/deploy.ts --network <network>");
    console.log("\nContract types:");
    console.log("  receiver  - BridgeReceiver (deploy on zkSync)");
    console.log("  forwarder - BridgeForwarder (deploy on zkSync)");
    console.log("  sender    - BridgeSender (deploy on Base/EVM chains)");
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
    default:
      throw new Error(`Unknown contract type: ${contractType}`);
  }
}

main().catch((error) => {
  console.error("\nDeployment failed!");
  console.error(error);
  process.exitCode = 1;
});
