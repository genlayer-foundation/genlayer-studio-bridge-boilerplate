#!/usr/bin/env node

import { SystemProgram } from "@solana/web3.js";
import {
  accountExists,
  getBridgePdas,
  getConfig,
  getConnection,
  getLayerZeroPdas,
  getProgram,
  getRegisterOappRemainingAccounts,
  loadKeypair,
  printCommonHeader,
  sendInstructions,
  simulateInstructions,
} from "./devnet-utils.mjs";

const SEND = process.argv.includes("--send");

const config = getConfig();
const payer = loadKeypair(config.keypairPath);
const connection = getConnection(config.rpcUrl);
const program = getProgram(connection, payer);
const pdas = getBridgePdas(program.programId, config.hubEid);
const lzPdas = getLayerZeroPdas(config.endpointProgram, pdas.store);

printCommonHeader("Solana Bridge OApp Devnet Initialization", config, payer.publicKey);
console.log("  Local EID:", config.localEid);
console.log("  Store PDA:", pdas.store.toBase58());
console.log("  LzReceiveTypes PDA:", pdas.lzReceiveTypesAccounts.toBase58());
console.log("  LayerZero OApp registry PDA:", lzPdas.oappRegistry.toBase58());
console.log("  Mode:", SEND ? "send" : "simulate-only");

if (await accountExists(connection, pdas.store)) {
  console.log("\nStore PDA already exists; initialization is complete.");
  process.exit(0);
}

const endpointAccount = await connection.getAccountInfo(config.endpointProgram, "confirmed");
if (!endpointAccount?.executable) {
  throw new Error(`LayerZero endpoint program is not executable: ${config.endpointProgram.toBase58()}`);
}

const remainingAccounts = getRegisterOappRemainingAccounts(
  config.endpointProgram,
  payer.publicKey,
  pdas.store,
);

const instruction = await program.methods
  .init(payer.publicKey, config.endpointProgram, config.localEid)
  .accounts({
    payer: payer.publicKey,
    store: pdas.store,
    lzReceiveTypesAccounts: pdas.lzReceiveTypesAccounts,
    systemProgram: SystemProgram.programId,
  })
  .remainingAccounts(remainingAccounts)
  .instruction();

const simulation = await simulateInstructions(connection, payer, [instruction]);
console.log("\nSimulation result:", simulation.value.err ? "failed" : "ok");
if (simulation.value.logs?.length) {
  for (const log of simulation.value.logs.slice(-12)) {
    console.log(" ", log);
  }
}

if (simulation.value.err) {
  throw new Error(`Simulation failed: ${JSON.stringify(simulation.value.err)}`);
}

if (!SEND) {
  console.log("\nSimulation passed. Re-run with --send after approving the transaction summary.");
  process.exit(0);
}

const signature = await sendInstructions(connection, payer, [instruction]);
console.log("\nInitialization transaction:", signature);
