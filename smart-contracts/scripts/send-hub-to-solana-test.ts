import * as dotenv from "dotenv";
import { ethers } from "hardhat";
import { Options } from "@layerzerolabs/lz-v2-utilities";
import {
  getEnvVar,
  getEnvVarOrDefault,
  peerToBytes32,
  validateAddress,
} from "./utils";

dotenv.config();

const BRIDGE_ENVELOPE_VERSION = 1;
const ENVELOPE_TYPES = [
  "uint16",
  "bytes32",
  "uint32",
  "bytes32",
  "bytes32",
  "bytes",
] as const;

async function main() {
  const routerAddress = getEnvVar("HUB_OUTBOUND_ROUTER_ADDRESS");
  const dstEid = Number(getEnvVarOrDefault("SOLANA_EID", "40168"));
  const srcEid = Number(getEnvVarOrDefault("GENLAYER_EID", "61998"));
  const target = getEnvVar("SOLANA_TEST_RECEIVER_TARGET_BYTES32");
  const payloadText = getEnvVarOrDefault(
    "SOLANA_TEST_PAYLOAD",
    `hello solana ${Date.now()}`,
  );
  const send = process.env.SEND === "1" || process.argv.includes("--send");

  validateAddress(routerAddress, "HUB_OUTBOUND_ROUTER_ADDRESS");

  const [signer] = await ethers.getSigners();
  const srcSender = peerToBytes32(getEnvVarOrDefault("GENLAYER_TEST_SOURCE", signer.address));
  const targetBytes32 = peerToBytes32(target);
  const payload = ethers.toUtf8Bytes(payloadText);
  const lzReceiveGas = Number(getEnvVarOrDefault("SOLANA_LZ_RECEIVE_GAS", "1000000"));
  const lzReceiveValue = BigInt(getEnvVarOrDefault("SOLANA_LZ_RECEIVE_VALUE", "0"));
  const messageId = ethers.keccak256(
    ethers.solidityPacked(
      ["uint16", "uint32", "bytes32", "bytes32", "bytes", "uint256"],
      [BRIDGE_ENVELOPE_VERSION, srcEid, srcSender, targetBytes32, payload, Date.now()],
    ),
  );
  const encodedMessage = ethers.AbiCoder.defaultAbiCoder().encode(ENVELOPE_TYPES, [
    BRIDGE_ENVELOPE_VERSION,
    messageId,
    srcEid,
    srcSender,
    targetBytes32,
    payload,
  ]);
  const options = Options.newOptions()
    .addExecutorLzReceiveOption(lzReceiveGas, lzReceiveValue)
    .toHex();

  const router = await ethers.getContractAt("HubOutboundRouter", routerAddress, signer);

  console.log("\nHub -> Solana smoke message");
  console.log("  Signer:", signer.address);
  console.log("  Router:", routerAddress);
  console.log("  Destination EID:", dstEid);
  console.log("  Envelope source EID:", srcEid);
  console.log("  Source sender:", srcSender);
  console.log("  Target:", targetBytes32);
  console.log("  Payload:", payloadText);
  console.log("  Message ID:", messageId);
  console.log("  LZ receive gas:", lzReceiveGas);
  console.log("  LZ receive value:", lzReceiveValue.toString(), "lamports");
  console.log("  Mode:", send ? "send" : "quote-only");

  const [nativeFee, lzTokenFee] = await router.quoteMessage(dstEid, encodedMessage, options);
  console.log("  Native fee:", ethers.formatEther(nativeFee), "ETH");
  console.log("  LZ token fee:", lzTokenFee.toString());

  if (!send) {
    console.log("\nQuote succeeded. Re-run with SEND=1 to send.");
    return;
  }

  const balance = await ethers.provider.getBalance(signer.address);
  if (balance < nativeFee) {
    throw new Error(
      `Insufficient balance: need ${ethers.formatEther(nativeFee)} ETH, have ${ethers.formatEther(balance)} ETH`,
    );
  }

  const tx = await router.sendMessage(messageId, dstEid, encodedMessage, options, {
    value: nativeFee,
  });
  console.log("  TX:", tx.hash);
  const receipt = await tx.wait();
  console.log("  Confirmed block:", receipt?.blockNumber);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
