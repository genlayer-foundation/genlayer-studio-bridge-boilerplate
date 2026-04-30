import { PublicKey } from "@solana/web3.js";

const [pubkey] = process.argv.slice(2);

if (!pubkey) {
  throw new Error("Usage: node scripts/pubkey-to-bytes32.mjs <solana-pubkey>");
}

const bytes = new PublicKey(pubkey).toBytes();
console.log(`0x${Buffer.from(bytes).toString("hex")}`);
