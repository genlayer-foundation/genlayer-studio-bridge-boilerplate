import { ethers } from "hardhat";
import { 
  getContract, 
  loadDeployment, 
  LAYER_ZERO_EIDS, 
  addressToBytes32,
  getNetworkInfo 
} from "./utils";

async function main() {
  const { networkName, chainId } = await getNetworkInfo();
  console.log(`\nDebugging Bridge on ${networkName} (Chain ID: ${chainId})`);

  // ========================================================================
  // Base Sepolia (Sender Side)
  // ========================================================================
  if (networkName.includes("base")) {
    console.log("\n--- Checking BridgeSender (Base) ---");
    
    const deployment = loadDeployment("bridgeSender", networkName, Number(chainId));
    if (!deployment) {
      console.error("BridgeSender deployment not found!");
      return;
    }
    
    // Handle different JSON structures
    const contractAddress = deployment.address || deployment.bridgeSender;
    if (!contractAddress) {
       console.error("Could not find address in deployment file:", deployment);
       return;
    }
    console.log("BridgeSender Address:", contractAddress);

    const bridgeSender = await getContract("BridgeSender", contractAddress);

    // Check Config
    const zkSyncEid = await bridgeSender.zkSyncEid();
    const zkSyncBridgeReceiver = await bridgeSender.zkSyncBridgeReceiver();

    console.log("\nConfiguration:");
    console.log(`- Configured Destination EID: ${zkSyncEid}`);
    console.log(`- Expected zkSync Sepolia EID: ${LAYER_ZERO_EIDS.zkSyncSepolia}`);
    
    if (Number(zkSyncEid) !== LAYER_ZERO_EIDS.zkSyncSepolia) {
      console.warn("⚠️  MISMATCH: zkSync EID is incorrect!");
    } else {
      console.log("✅ zkSync EID matches.");
    }

    console.log(`- Configured Receiver: ${zkSyncBridgeReceiver}`);
    
    // Try to find what the receiver should be
    // We can't easily know the zkSync address here unless provided, but we can check if it is empty
    if (zkSyncBridgeReceiver === ethers.ZeroHash) {
      console.error("❌ Receiver address is empty (0x00...00)!");
    } else {
      console.log("✅ Receiver address is set (value verification requires zkSync address).");
    }
  }

  // ========================================================================
  // zkSync Sepolia (Receiver Side)
  // ========================================================================
  else if (networkName.includes("zkSync")) {
    console.log("\n--- Checking BridgeReceiver (zkSync) ---");

    const deployment = loadDeployment("bridgeReceiver", networkName, Number(chainId));
    if (!deployment) {
      console.error("BridgeReceiver deployment not found!");
      return;
    }
    
    // Handle different JSON structures
    const contractAddress = deployment.address || deployment.bridgeReceiver;
    if (!contractAddress) {
       console.error("Could not find address in deployment file:", deployment);
       return;
    }
    console.log("BridgeReceiver Address:", contractAddress);

    const bridgeReceiver = await getContract("BridgeReceiver", contractAddress);

    // Check Trusted Forwarder for Base Sepolia
    const srcEid = LAYER_ZERO_EIDS.baseSepolia;
    const trustedForwarder = await bridgeReceiver.trustedForwarders(srcEid);

    console.log("\nConfiguration:");
    console.log(`- Checking Trusted Forwarder for Base Sepolia EID (${srcEid})`);
    console.log(`- Configured Forwarder: ${trustedForwarder}`);

    if (trustedForwarder === ethers.ZeroHash) {
      console.error("❌ NO TRUSTED FORWARDER SET for Base Sepolia!");
      console.log("   To fix: Set the BridgeSender address from Base as the trusted forwarder.");
    } else {
      console.log("✅ Trusted forwarder is set.");
      console.log("   Ensure this matches the bytes32 version of the BridgeSender address on Base.");
    }

    // Check Message Count
    const msgCount = await bridgeReceiver.getGenLayerMessageCount();
    console.log(`\nStats:`);
    console.log(`- Received Messages: ${msgCount}`);
    
    if (msgCount > 0) {
      const [ids, msgs] = await bridgeReceiver.getPendingGenLayerMessages();
      console.log(`- Pending Messages: ${ids.length}`);
    }
  } 
  else {
    console.log("Unknown network for debugging. Please run on baseSepoliaTestnet or zkSyncSepoliaTestnet.");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

