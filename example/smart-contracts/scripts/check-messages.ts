/**
 * Check received messages on StringReceiver
 */
import hre from "hardhat";

const STRING_RECEIVER = "0x967C4eCE65e7eE77969dc6a688D5c5c355c7ce98";

async function main() {
  const { ethers } = hre;

  console.log("Checking StringReceiver on Base Sepolia...\n");
  console.log("Address:", STRING_RECEIVER);

  const receiver = await ethers.getContractAt("StringReceiver", STRING_RECEIVER);

  const count = await receiver.getMessageCount();
  console.log("Message Count:", count.toString());

  if (count > 0n) {
    const messages = await receiver.getAllMessages();
    console.log("\nReceived Messages:");
    messages.forEach((msg: string, i: number) => {
      console.log(`  ${i + 1}. "${msg}"`);
    });

    const latest = await receiver.getLatestMessage();
    console.log("\nLatest:", latest);
  } else {
    console.log("\nNo messages received yet.");
    console.log("LayerZero delivery may take 1-5 minutes.");
  }
}

main().catch(console.error);
