#!/usr/bin/env node

import { PublicKey, SystemProgram } from "@solana/web3.js";
import {
  accountExists,
  bytesToHex,
  getBridgePdas,
  getConfig,
  getConnection,
  getProgram,
  loadKeypair,
  parseBytes32,
  pda,
  printCommonHeader,
  RECEIVER_SEED,
  RECEIVER_STATE_SEED,
  sendInstructions,
  simulateInstructions,
} from "./devnet-utils.mjs";

const SEND = process.argv.includes("--send");

const config = getConfig();
const REGISTER_RECEIVER =
  process.argv.includes("--register-receiver") ||
  process.env.SOLANA_REGISTER_TEST_RECEIVER === "1";
const payer = loadKeypair(config.keypairPath);
const connection = getConnection(config.rpcUrl);
const program = getProgram(connection, payer);
const pdas = getBridgePdas(program.programId, config.hubEid);

const hubOutboundRouter = process.env.HUB_OUTBOUND_ROUTER_ADDRESS;
const hubInboundInbox = process.env.HUB_INBOUND_INBOX_ADDRESS;
const trustedPeer = parseBytes32(hubOutboundRouter, "HUB_OUTBOUND_ROUTER_ADDRESS");
const outboundPeer = parseBytes32(hubInboundInbox, "HUB_INBOUND_INBOX_ADDRESS");

const receiverTarget = new PublicKey(process.env.SOLANA_TEST_RECEIVER_TARGET || payer.publicKey.toBase58());
const receiverMode = Number(process.env.SOLANA_TEST_RECEIVER_MODE || 1);
const receiver = pda([Buffer.from(RECEIVER_SEED), receiverTarget.toBuffer()], program.programId);
const receiverState = pda([Buffer.from(RECEIVER_STATE_SEED), receiverTarget.toBuffer()], program.programId);

printCommonHeader("Solana Bridge Devnet Peer Configuration", config, payer.publicKey);
console.log("  Hub EID:", config.hubEid);
console.log("  Store PDA:", pdas.store.toBase58());
console.log("  Trusted inbound peer:", bytesToHex(trustedPeer));
console.log("  Outbound receiver peer:", bytesToHex(outboundPeer));
console.log("  Register test receiver:", REGISTER_RECEIVER ? "yes" : "no");
if (REGISTER_RECEIVER) {
  console.log("  Test receiver target:", receiverTarget.toBase58());
  console.log("  Test receiver PDA:", receiver.toBase58());
  console.log("  ReceiverState PDA:", receiverState.toBase58());
  console.log("  Test receiver mode:", receiverMode === 1 ? "direct" : "store-and-claim");
}
console.log("  Mode:", SEND ? "send" : "simulate-only");

if (!(await accountExists(connection, pdas.store))) {
  throw new Error("Store PDA does not exist. Run npm run devnet:init first.");
}

const instructions = [
  await program.methods
    .setTrustedPeer(config.hubEid, trustedPeer)
    .accounts({
      admin: payer.publicKey,
      store: pdas.store,
      peer: pdas.peer,
      systemProgram: SystemProgram.programId,
    })
    .instruction(),
  await program.methods
    .setOutboundPeer(config.hubEid, outboundPeer)
    .accounts({
      admin: payer.publicKey,
      store: pdas.store,
      outboundPeer: pdas.outboundPeer,
      systemProgram: SystemProgram.programId,
    })
    .instruction(),
];

if (REGISTER_RECEIVER) {
  instructions.push(
    await program.methods
      .registerReceiver(receiverTarget, receiverMode)
      .accounts({
        admin: payer.publicKey,
        store: pdas.store,
        receiver,
        receiverState,
        systemProgram: SystemProgram.programId,
      })
      .instruction(),
  );
}

const simulation = await simulateInstructions(connection, payer, instructions);
console.log("\nSimulation result:", simulation.value.err ? "failed" : "ok");
if (simulation.value.logs?.length) {
  for (const log of simulation.value.logs.slice(-16)) {
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

const signature = await sendInstructions(connection, payer, instructions);
console.log("\nConfiguration transaction:", signature);
