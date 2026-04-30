import { mkdirSync, existsSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { Keypair } from "@solana/web3.js";

const walletPath = resolve("target/test-wallet.json");

if (!existsSync(walletPath)) {
  mkdirSync(dirname(walletPath), { recursive: true });
  writeFileSync(walletPath, JSON.stringify(Array.from(Keypair.generate().secretKey)));
}
