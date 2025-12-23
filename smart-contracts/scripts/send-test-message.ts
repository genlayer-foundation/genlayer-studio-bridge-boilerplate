import * as dotenv from "dotenv";
import { ethers } from "hardhat";
import { Options } from "@layerzerolabs/lz-v2-utilities";

dotenv.config();

async function main() {
  const senderAddress = process.env.BRIDGE_SENDER_ADDRESS;
  
  if (!senderAddress) {
    throw new Error("Missing BRIDGE_SENDER_ADDRESS in .env");
  }

  const [signer] = await ethers.getSigners();
  console.log("Signer:", signer.address);

  const sender = await ethers.getContractAt("BridgeSender", senderAddress, signer);

  // Target contract on GenLayer (StringReceiverIC)
  const targetContract = process.env.TARGET_CONTRACT;
  if (!targetContract) {
    throw new Error("Missing TARGET_CONTRACT in .env");
  }
  // ABI-encode string for StringReceiverIC's MethodDecoder([str])
  const messageData = ethers.AbiCoder.defaultAbiCoder().encode(
    ["string"],
    ["Hello GenLayer from Base! " + Date.now()]
  );

  // Build options with higher gas limit to avoid out of gas on destination
  const options = Options.newOptions()
    .addExecutorLzReceiveOption(2_000_000, 0)
    .toHex();

  console.log("Getting quote...");
  const [nativeFee] = await sender.quoteSendToGenLayer(targetContract, messageData, options);
  console.log("Fee:", ethers.formatEther(nativeFee), "ETH");

  console.log("Sending message...");
  const tx = await sender.sendToGenLayer(targetContract, messageData, options, { value: nativeFee });
  console.log("TX:", tx.hash);

  const receipt = await tx.wait();
  console.log("Message sent successfully!");
  
  // Find the MessageSentToGenLayer event
  const log = receipt.logs.find((log: any) => {
      try {
          const parsed = sender.interface.parseLog(log);
          return parsed && parsed.name === "MessageSentToGenLayer";
      } catch (e) {
          return false;
      }
  });

  if (log) {
      const parsed = sender.interface.parseLog(log);
      console.log("Message ID:", parsed?.args.messageId);
  } else {
      console.log("MessageSentToGenLayer event not found in receipt");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

