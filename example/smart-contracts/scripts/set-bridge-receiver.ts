import { ethers } from "hardhat";

async function main() {
  const target = process.env.STRING_RECEIVER_ADDRESS;
  const bridgeReceiver = process.env.BRIDGE_RECEIVER_ADDRESS;
  if (!target || !bridgeReceiver) throw new Error("Missing receiver addresses");
  const receiver = await ethers.getContractAt("StringReceiver", target);
  const tx = await receiver.setBridgeReceiver(bridgeReceiver);
  console.log("TX:", tx.hash);
  await tx.wait();
  console.log("Bridge receiver:", await receiver.bridgeReceiver());
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
