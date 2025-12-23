/**
 * Update StringSenderEvm target and send a test message to GenLayer.
 *
 * Usage:
 *   npx hardhat run scripts/send-to-genlayer.ts --network baseSepoliaTestnet
 *
 * Environment:
 *   STRING_SENDER_EVM - StringSenderEvm address (default from deployment)
 *   TARGET_CONTRACT - GenLayer StringReceiverIC address to set (optional)
 *   MESSAGE - Message to send (default: "Hello GenLayer from Base!")
 */
import hre from "hardhat";
import { Options } from "@layerzerolabs/lz-v2-utilities";

const STRING_SENDER_EVM = process.env.STRING_SENDER_EVM;

if (!STRING_SENDER_EVM) {
  throw new Error("Missing STRING_SENDER_EVM in .env");
}
const TARGET_CONTRACT = process.env.TARGET_CONTRACT || "";
const MESSAGE = process.env.MESSAGE || "Hello GenLayer from Base!";

async function main() {
  const { ethers } = hre;
  const [signer] = await ethers.getSigners();

  console.log("📤 Sending string to GenLayer...\n");
  console.log("Configuration:");
  console.log(`  Signer: ${signer.address}`);
  console.log(`  StringSenderEvm: ${STRING_SENDER_EVM}`);
  console.log(`  Message: "${MESSAGE}"`);

  // Get contract
  const sender = await ethers.getContractAt("StringSenderEvm", STRING_SENDER_EVM, signer);

  // Update target if specified
  if (TARGET_CONTRACT) {
    const currentTarget = await sender.targetContract();
    console.log(`\nCurrent target: ${currentTarget}`);
    console.log(`New target: ${TARGET_CONTRACT}`);

    if (currentTarget.toLowerCase() !== TARGET_CONTRACT.toLowerCase()) {
      console.log("Updating target contract...");
      const tx = await sender.setTargetContract(TARGET_CONTRACT);
      await tx.wait();
      console.log("✓ Target updated");
    } else {
      console.log("✓ Target already set");
    }
  }

  const target = await sender.targetContract();
  console.log(`\nTarget contract: ${target}`);

  // Build LayerZero options (200k gas for GenLayer execution)
  const options = Options.newOptions()
    .addExecutorLzReceiveOption(200_000, 0)
    .toHex();

  // Get fee quote
  const [nativeFee] = await sender.quoteSendString(MESSAGE, options);
  console.log(`LayerZero fee: ${ethers.formatEther(nativeFee)} ETH`);

  // Check balance
  const balance = await ethers.provider.getBalance(signer.address);
  console.log(`Signer balance: ${ethers.formatEther(balance)} ETH`);

  if (balance < nativeFee) {
    throw new Error("Insufficient balance for LayerZero fee");
  }

  // Send message
  console.log("\nSending message...");
  const tx = await sender.sendString(MESSAGE, options, { value: nativeFee });
  console.log(`TX hash: ${tx.hash}`);

  console.log("Waiting for confirmation...");
  const receipt = await tx.wait();
  console.log(`✅ Confirmed in block ${receipt?.blockNumber}`);

  // Parse event for message ID
  const sentEvent = receipt?.logs.find((log) => {
    try {
      const parsed = sender.interface.parseLog({ topics: log.topics as string[], data: log.data });
      return parsed?.name === "StringSent";
    } catch {
      return false;
    }
  });

  if (sentEvent) {
    const parsed = sender.interface.parseLog({ topics: sentEvent.topics as string[], data: sentEvent.data });
    console.log(`Message ID: ${parsed?.args.messageId}`);
  }

  console.log("\n📝 Next steps:");
  console.log("  1. Track LayerZero delivery to zkSync");
  console.log("  2. Run bridge service to relay to GenLayer");
  console.log("  3. Call StringReceiverIC.claim_messages() on GenLayer");
}

main().catch(console.error);
