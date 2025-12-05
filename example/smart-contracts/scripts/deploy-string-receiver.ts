/**
 * Deploy StringReceiver smart contract to Base Sepolia.
 *
 * Prerequisites:
 * - BridgeReceiver must be deployed on Base Sepolia
 * - Deployer wallet must have Base Sepolia ETH for gas
 *
 * Usage:
 *   cd bridge/example/smart-contracts
 *   npm install
 *   npm run deploy:base-sepolia
 *
 * Environment variables (in .env):
 *   PRIVATE_KEY - Deployer private key
 *   BASE_SEPOLIA_RPC_URL - Base Sepolia RPC URL (optional, has default)
 *   BRIDGE_RECEIVER_ADDRESS - Address of BridgeReceiver on Base Sepolia
 */

import * as dotenv from "dotenv";
import * as fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import hre from "hardhat";

// ESM-compatible __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, "../../.env") });

const { ethers } = hre;

interface DeploymentResult {
  network: string;
  chainId: number;
  stringReceiver: string;
  bridgeReceiver: string;
  deployer: string;
  deploymentHash: string;
}

async function main(): Promise<void> {
  // Get bridge receiver address from command line or environment
  const bridgeReceiverAddress = process.env.BRIDGE_RECEIVER_ADDRESS;

  if (!bridgeReceiverAddress) {
    console.error("❌ Missing BRIDGE_RECEIVER_ADDRESS environment variable");
    console.error("\nSet it in your .env file or pass it as:");
    console.error(
      "  BRIDGE_RECEIVER_ADDRESS=0x... npx hardhat run ... --network baseSepoliaTestnet"
    );
    process.exit(1);
  }

  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();
  const networkName = hre.network.name;

  console.log("\n🚀 Deploying StringReceiver to Base Sepolia\n");
  console.log("Configuration:");
  console.log(`  Network: ${networkName}`);
  console.log(`  Chain ID: ${network.chainId}`);
  console.log(`  Deployer: ${deployer.address}`);
  console.log(`  Bridge Receiver: ${bridgeReceiverAddress}`);
  console.log();

  // Validate bridge receiver address
  if (!ethers.isAddress(bridgeReceiverAddress)) {
    throw new Error(
      `Invalid bridge receiver address: ${bridgeReceiverAddress}`
    );
  }

  // Check deployer balance
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log(`  Deployer balance: ${ethers.formatEther(balance)} ETH`);

  if (balance === 0n) {
    throw new Error(
      "Deployer has no ETH. Get Base Sepolia ETH from a faucet."
    );
  }

  // Deploy StringReceiver
  console.log("\n📄 Deploying StringReceiver...");

  const StringReceiver = await ethers.getContractFactory("StringReceiver");
  const stringReceiver = await StringReceiver.deploy(bridgeReceiverAddress);

  const deployTx = stringReceiver.deploymentTransaction();
  if (!deployTx) throw new Error("Deployment transaction not found");

  console.log(`  Transaction hash: ${deployTx.hash}`);
  console.log("  Waiting for confirmation...");

  await stringReceiver.waitForDeployment();
  const receiverAddress = await stringReceiver.getAddress();

  // Save deployment result
  const result: DeploymentResult = {
    network: networkName,
    chainId: Number(network.chainId),
    stringReceiver: receiverAddress,
    bridgeReceiver: bridgeReceiverAddress,
    deployer: deployer.address,
    deploymentHash: deployTx.hash,
  };

  // Save to deployments directory
  const deploymentsDir = path.join(__dirname, "../deployments");
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }

  const filename = path.join(
    deploymentsDir,
    `stringReceiver-${networkName}-${network.chainId}.json`
  );
  fs.writeFileSync(filename, JSON.stringify(result, null, 2));

  console.log("\n✅ StringReceiver deployed successfully!");
  console.log(`\n  Contract address: ${receiverAddress}`);
  console.log(`  Deployment saved to: ${filename}`);

  // Verify contract if on a supported network
  if (!["hardhat", "localhost"].includes(networkName)) {
    console.log("\n🔍 Verifying contract on block explorer...");
    try {
      await hre.run("verify:verify", {
        address: receiverAddress,
        constructorArguments: [bridgeReceiverAddress],
      });
      console.log("  Contract verified successfully!");
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      if (errorMessage.includes("Already Verified")) {
        console.log("  Contract already verified");
      } else {
        console.log("  Verification failed:", errorMessage);
        console.log("  You can verify manually later");
      }
    }
  }

  console.log("\n📝 Next steps:");
  console.log("  1. Deploy StringSender to GenLayer with:");
  console.log(`     --target-contract ${receiverAddress}`);
  console.log("  2. Send a string from StringSender on GenLayer");
  console.log("  3. Wait for the bridge to relay the message");
  console.log("  4. Check received messages:");
  console.log(
    `     const receiver = await ethers.getContractAt("StringReceiver", "${receiverAddress}")`
  );
  console.log("     await receiver.getAllMessages()");
}

main().catch((error) => {
  console.error("\n❌ Deployment failed:", error);
  process.exitCode = 1;
});
