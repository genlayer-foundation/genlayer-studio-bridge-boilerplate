import * as dotenv from "dotenv";
import fs from "fs";
import hre, { ethers } from "hardhat";
import path from "path";

dotenv.config();

// ============================================================================
// Types
// ============================================================================

export interface NetworkInfo {
  deployer: any;
  networkName: string;
  chainId: bigint;
  endpointAddress: string;
}

export interface DeploymentResult {
  contract: string;
  network: string;
  chainId: number;
  address: string;
  deploymentHash: string;
  params: Record<string, any>;
  timestamp: string;
}

// ============================================================================
// Environment & Validation
// ============================================================================

/**
 * Get required environment variable or throw
 */
export function getEnvVar(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

/**
 * Get optional environment variable with default
 */
export function getEnvVarOrDefault(name: string, defaultValue: string): string {
  return process.env[name] || defaultValue;
}

/**
 * Validate an Ethereum address
 */
export function validateAddress(address: string, name: string): void {
  if (!address) {
    throw new Error(`${name} is required`);
  }
  if (!ethers.isAddress(address)) {
    throw new Error(`Invalid ${name}: ${address}`);
  }
}

/**
 * Convert address to bytes32 format for LayerZero
 */
export function addressToBytes32(address: string): string {
  return ethers.zeroPadValue(address, 32);
}

// ============================================================================
// Network Setup
// ============================================================================

/**
 * Get network info and deployer
 */
export async function getNetworkInfo(): Promise<NetworkInfo> {
  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();
  const networkName = hre.network.name;

  // Get LayerZero endpoint for this network
  const envVarName = `${networkName.toUpperCase()}_ENDPOINT`;
  const endpointAddress = process.env[envVarName] || "";

  return {
    deployer,
    networkName,
    chainId: network.chainId,
    endpointAddress,
  };
}

/**
 * Log network info header
 */
export function logNetworkHeader(action: string, networkInfo: NetworkInfo): void {
  console.log(`\n${action}`);
  console.log("Network:", networkInfo.networkName);
  console.log("Chain ID:", networkInfo.chainId);
  console.log("Deployer:", networkInfo.deployer.address);
  if (networkInfo.endpointAddress) {
    console.log("LZ Endpoint:", networkInfo.endpointAddress);
  }
}

// ============================================================================
// Deployment Artifacts
// ============================================================================

/**
 * Save deployment result to JSON file
 */
export async function saveDeploymentResult(result: DeploymentResult): Promise<void> {
  const deploymentsDir = path.join(__dirname, "../deployments");
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }

  const filename = path.join(
    deploymentsDir,
    `${result.contract}-${result.network}-${result.chainId}.json`
  );

  fs.writeFileSync(filename, JSON.stringify(result, null, 2));
  console.log(`\nDeployment saved to: ${filename}`);
}

/**
 * Load deployment result from JSON file
 */
export function loadDeployment(contract: string, network: string, chainId: number): DeploymentResult | null {
  const filename = path.join(
    __dirname,
    "../deployments",
    `${contract}-${network}-${chainId}.json`
  );

  if (!fs.existsSync(filename)) {
    return null;
  }

  return JSON.parse(fs.readFileSync(filename, "utf-8"));
}

// ============================================================================
// Contract Verification
// ============================================================================

/**
 * Verify contract on block explorer
 */
export async function verifyContract(
  address: string,
  constructorArgs: any[]
): Promise<void> {
  const networkName = hre.network.name;

  // Skip verification on local networks
  if (["hardhat", "localhost"].includes(networkName)) {
    console.log("Skipping verification on local network");
    return;
  }

  try {
    console.log("\nVerifying contract...");
    // @ts-ignore - Hardhat's run function is not properly typed
    await hre.run("verify:verify", {
      address: address,
      constructorArguments: constructorArgs,
    });
    console.log("Contract verified successfully");
  } catch (error: any) {
    if (error?.message?.includes("Already Verified")) {
      console.log("Contract already verified");
    } else {
      console.error("Error verifying contract:", error.message || error);
    }
  }
}

// ============================================================================
// Contract Loading
// ============================================================================

/**
 * Get contract instance by name and address
 */
export async function getContract(name: string, address: string) {
  const [signer] = await ethers.getSigners();
  return ethers.getContractAt(name, address, signer);
}

// ============================================================================
// LayerZero Helpers
// ============================================================================

export const LAYER_ZERO_EIDS = {
  zkSyncSepolia: 40305,
  zkSyncMainnet: 30165,
  baseSepolia: 40245,
  baseMainnet: 30184,
} as const;

/**
 * Get LayerZero EID for a network name
 */
export function getLayerZeroEid(networkName: string): number {
  const normalized = networkName.replace(/Testnet$/i, "");
  const key = normalized as keyof typeof LAYER_ZERO_EIDS;

  if (key in LAYER_ZERO_EIDS) {
    return LAYER_ZERO_EIDS[key];
  }

  throw new Error(`Unknown LayerZero EID for network: ${networkName}`);
}
