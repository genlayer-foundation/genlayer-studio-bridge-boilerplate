#!/usr/bin/env node

import { spawn } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { Keypair } from "@solana/web3.js";
import {
  BRIDGE_PROGRAM_ID,
  getConfig,
  getConnection,
  loadKeypair,
  printCommonHeader,
} from "./devnet-utils.mjs";

const SEND = process.argv.includes("--send");

const config = getConfig();
const payer = loadKeypair(config.keypairPath);
const connection = getConnection(config.rpcUrl);

printCommonHeader("Solana Bridge Program Devnet Deployment", config, payer.publicKey);
console.log("  Program keypair:", config.programKeypairPath);
console.log("  Program artifact:", config.programSoPath);
console.log("  Deploy buffer keypair:", config.bufferKeypairPath);
console.log("  Mode:", SEND ? "send" : "dry-run");

if (!existsSync(config.programKeypairPath)) {
  throw new Error(`Missing program keypair: ${config.programKeypairPath}`);
}
if (!existsSync(config.programSoPath)) {
  throw new Error(`Missing program artifact: ${config.programSoPath}`);
}
ensureBufferKeypair(config.bufferKeypairPath);

const existingProgram = await connection.getAccountInfo(BRIDGE_PROGRAM_ID, "confirmed");
console.log("  Current on-chain program:", existingProgram?.executable ? "deployed" : "not deployed");

if (!SEND) {
  console.log("\nDry-run only. This script will not sign or broadcast unless --send is supplied.");
  console.log("The Solana CLI deploy command uses preflight simulation for each deployment transaction.");
  process.exit(0);
}

const installedSolana = join(homedir(), ".local/share/solana/install/active_release/bin/solana");
const solana = process.env.SOLANA_CLI || (existsSync(installedSolana) ? installedSolana : "solana");
const args = [
  "program",
  "deploy",
  "--url",
  config.rpcUrl,
  "--keypair",
  config.keypairPath,
  "--fee-payer",
  config.keypairPath,
  "--program-id",
  config.programKeypairPath,
  "--upgrade-authority",
  config.keypairPath,
  "--buffer",
  config.bufferKeypairPath,
  "--use-quic",
  "--max-sign-attempts",
  "10",
  "--commitment",
  "confirmed",
  "--output",
  "json",
  config.programSoPath,
];

await new Promise((resolvePromise, reject) => {
  const child = spawn(solana, args, {
    stdio: "inherit",
    env: {
      ...process.env,
      NO_DNA: "1",
    },
  });

  child.on("error", reject);
  child.on("exit", (code) => {
    if (code === 0) {
      resolvePromise();
    } else {
      reject(new Error(`solana program deploy exited with code ${code}`));
    }
  });
});

function ensureBufferKeypair(path) {
  if (existsSync(path)) {
    return;
  }

  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const keypair = Keypair.generate();
  writeFileSync(path, JSON.stringify(Array.from(keypair.secretKey)), { mode: 0o600 });
  chmodSync(path, 0o600);
  console.log("  Created deploy buffer:", keypair.publicKey.toBase58());
}
