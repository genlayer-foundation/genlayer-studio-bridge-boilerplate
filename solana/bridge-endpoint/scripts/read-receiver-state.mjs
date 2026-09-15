#!/usr/bin/env node

import { PublicKey } from "@solana/web3.js";
import {
  getConfig,
  getConnection,
  getProgram,
  loadKeypair,
  pda,
  printCommonHeader,
  RECEIVER_STATE_SEED,
} from "./devnet-utils.mjs";

const config = getConfig();
const payer = loadKeypair(config.keypairPath);
const connection = getConnection(config.rpcUrl);
const program = getProgram(connection, payer);
const target = new PublicKey(process.env.SOLANA_TEST_RECEIVER_TARGET || payer.publicKey.toBase58());
const receiverState = pda([Buffer.from(RECEIVER_STATE_SEED), target.toBuffer()], program.programId);

printCommonHeader("Solana Bridge Receiver State", config, payer.publicKey);
console.log("  Target:", target.toBase58());
console.log("  ReceiverState PDA:", receiverState.toBase58());

try {
  const state = await program.account.receiverState.fetch(receiverState);
  const payload = Buffer.from(state.lastPayload);
  console.log("  Last message ID:", `0x${Buffer.from(state.lastMessageId).toString("hex")}`);
  console.log("  Last source EID:", state.lastSourceEid);
  console.log("  Last source sender:", `0x${Buffer.from(state.lastSourceSender).toString("hex")}`);
  console.log("  Last payload hex:", `0x${payload.toString("hex")}`);
  console.log("  Last payload utf8:", payload.toString("utf8"));
} catch (error) {
  if (String(error?.message || error).includes("Account does not exist")) {
    console.log("  State: not delivered yet");
  } else {
    throw error;
  }
}
