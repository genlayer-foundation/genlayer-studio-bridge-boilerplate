/**
 * Send a test message from StringSenderEvm on Base Sepolia to GenLayer.
 */

import * as dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import hre from "hardhat";
import { Options } from "@layerzerolabs/lz-v2-utilities";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, "../.env") });

const { ethers } = hre;

const STRING_SENDER_EVM = process.env.STRING_SENDER_EVM;

if (!STRING_SENDER_EVM) {
  throw new Error("Missing STRING_SENDER_EVM in .env");
}

async function main(): Promise<void> {
  const senderAddress = STRING_SENDER_EVM;

  const [signer] = await ethers.getSigners();
  console.log("Signer:", signer.address);

  const balance = await ethers.provider.getBalance(signer.address);
  console.log("Balance:", ethers.formatEther(balance), "ETH");

  const sender = await ethers.getContractAt("StringSenderEvm", senderAddress);

  const message = "Hello GenLayer - Pull Model Test!";

  // Build options
  const options = Options.newOptions()
    .addExecutorLzReceiveOption(1_000_000, 0)
    .toHex();

  console.log("Getting quote...");
  const [nativeFee] = await sender.quoteSendString(message, options);
  console.log("Fee:", ethers.formatEther(nativeFee), "ETH");

  console.log("Sending message:", message);
  const tx = await sender.sendString(message, options, { value: nativeFee });
  console.log("TX:", tx.hash);

  const receipt = await tx.wait();
  console.log("Confirmed in block:", receipt?.blockNumber);
}

main().catch((error) => {
  console.error("Error:", error);
  process.exitCode = 1;
});
