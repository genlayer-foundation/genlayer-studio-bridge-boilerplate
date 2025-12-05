/**
 * Deploy StringSenderEvm smart contract to Base Sepolia.
 *
 * This deploys the EVM -> GenLayer example sender contract.
 *
 * Prerequisites:
 * - BridgeSender must be deployed on Base Sepolia
 * - StringReceiverIC must be deployed on GenLayer (get the address)
 * - Deployer wallet must have Base Sepolia ETH for gas
 *
 * Usage:
 *   cd bridge/example/smart-contracts
 *   npm install
 *   npm run deploy:string-sender-evm
 *
 * Environment variables (in .env):
 *   PRIVATE_KEY - Deployer private key
 *   BASE_SEPOLIA_RPC_URL - Base Sepolia RPC URL (optional, has default)
 *   BRIDGE_SENDER_ADDRESS - Address of BridgeSender.sol on Base Sepolia
 *   TARGET_CONTRACT - Address of StringReceiverIC on GenLayer
 */

import * as dotenv from "dotenv";
import * as fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import hre from "hardhat";

// ESM-compatible __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, "../.env") });

const { ethers } = hre;

interface DeploymentResult {
  network: string;
  chainId: number;
  stringSenderEvm: string;
  bridgeSender: string;
  targetContract: string;
  deployer: string;
  deploymentHash: string;
}

async function main(): Promise<void> {
  // Get required addresses from environment
  const bridgeSenderAddress = process.env.BRIDGE_SENDER_ADDRESS;
  const targetContract = process.env.TARGET_CONTRACT;

  if (!bridgeSenderAddress) {
    console.error("❌ Missing BRIDGE_SENDER_ADDRESS environment variable");
    console.error("\nSet it in your .env file or pass it as:");
    console.error(
      "  BRIDGE_SENDER_ADDRESS=0x... npx hardhat run ... --network baseSepoliaTestnet"
    );
    process.exit(1);
  }

  if (!targetContract) {
    console.error("❌ Missing TARGET_CONTRACT environment variable");
    console.error("\nThis should be the address of StringReceiverIC on GenLayer.");
    console.error("Set it in your .env file or pass it as:");
    console.error(
      "  TARGET_CONTRACT=0x... npx hardhat run ... --network baseSepoliaTestnet"
    );
    process.exit(1);
  }

  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();
  const networkName = hre.network.name;

  console.log("\n🚀 Deploying StringSenderEvm to Base Sepolia\n");
  console.log("Configuration:");
  console.log(`  Network: ${networkName}`);
  console.log(`  Chain ID: ${network.chainId}`);
  console.log(`  Deployer: ${deployer.address}`);
  console.log(`  Bridge Sender: ${bridgeSenderAddress}`);
  console.log(`  Target Contract (GenLayer): ${targetContract}`);
  console.log();

  // Validate addresses
  if (!ethers.isAddress(bridgeSenderAddress)) {
    throw new Error(
      `Invalid bridge sender address: ${bridgeSenderAddress}`
    );
  }

  if (!ethers.isAddress(targetContract)) {
    throw new Error(
      `Invalid target contract address: ${targetContract}`
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

  // Deploy StringSenderEvm
  console.log("\n📄 Deploying StringSenderEvm...");

  const StringSenderEvm = await ethers.getContractFactory("StringSenderEvm");
  const stringSenderEvm = await StringSenderEvm.deploy(bridgeSenderAddress, targetContract);

  const deployTx = stringSenderEvm.deploymentTransaction();
  if (!deployTx) throw new Error("Deployment transaction not found");

  console.log(`  Transaction hash: ${deployTx.hash}`);
  console.log("  Waiting for confirmation...");

  await stringSenderEvm.waitForDeployment();
  const senderAddress = await stringSenderEvm.getAddress();

  // Save deployment result
  const result: DeploymentResult = {
    network: networkName,
    chainId: Number(network.chainId),
    stringSenderEvm: senderAddress,
    bridgeSender: bridgeSenderAddress,
    targetContract: targetContract,
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
    `stringSenderEvm-${networkName}-${network.chainId}.json`
  );
  fs.writeFileSync(filename, JSON.stringify(result, null, 2));

  console.log("\n✅ StringSenderEvm deployed successfully!");
  console.log(`\n  Contract address: ${senderAddress}`);
  console.log(`  Deployment saved to: ${filename}`);

  // Verify contract if on a supported network
  if (!["hardhat", "localhost"].includes(networkName)) {
    console.log("\n🔍 Verifying contract on block explorer...");
    try {
      await hre.run("verify:verify", {
        address: senderAddress,
        constructorArguments: [bridgeSenderAddress, targetContract],
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
  console.log("  1. Ensure StringReceiverIC is deployed on GenLayer");
  console.log("  2. Send a string from this contract:");
  console.log(`     const sender = await ethers.getContractAt("StringSenderEvm", "${senderAddress}")`);
  console.log("     const options = Options.newOptions().addExecutorLzReceiveOption(1_000_000, 0).toHex()");
  console.log("     const [fee] = await sender.quoteSendString('Hello GenLayer!', options)");
  console.log("     await sender.sendString('Hello GenLayer!', options, { value: fee })");
  console.log("  3. Wait for the bridge to relay the message (~1 minute)");
  console.log("  4. Check received messages on GenLayer:");
  console.log("     StringReceiverIC.get_received_strings()");
}

main().catch((error) => {
  console.error("\n❌ Deployment failed:", error);
  process.exitCode = 1;
});
