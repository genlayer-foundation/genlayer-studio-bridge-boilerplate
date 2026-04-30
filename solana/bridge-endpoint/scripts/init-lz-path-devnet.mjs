#!/usr/bin/env node

import { createHash } from "node:crypto";
import { SystemProgram, TransactionInstruction } from "@solana/web3.js";
import {
  accountExists,
  getArgValue,
  getBridgePdas,
  getConfig,
  getConnection,
  getLayerZeroPdas,
  LAYERZERO_ULN_PROGRAM_ID,
  loadKeypair,
  parseBytes32,
  pda,
  printCommonHeader,
  sendInstructions,
  simulateInstructions,
  u32be,
} from "./devnet-utils.mjs";

const SEND = process.argv.includes("--send");
const config = getConfig();
const payer = loadKeypair(config.keypairPath);
const connection = getConnection(config.rpcUrl);
const pdas = getBridgePdas(undefined, config.hubEid);
const lzPdas = getLayerZeroPdas(config.endpointProgram, pdas.store);
const ulnProgram = LAYERZERO_ULN_PROGRAM_ID;
const remoteEid = Number(getArgValue("--remote-eid", config.hubEid));
const remoteOapps = getRemoteOapps();

const messageLib = pda([Buffer.from("MessageLib")], ulnProgram);
const messageLibInfo = pda([Buffer.from("MessageLib"), messageLib.toBuffer()], config.endpointProgram);
const sendConfig = pda([Buffer.from("SendConfig"), u32be(remoteEid), pdas.store.toBuffer()], ulnProgram);
const receiveConfig = pda([Buffer.from("ReceiveConfig"), u32be(remoteEid), pdas.store.toBuffer()], ulnProgram);
const sendLibraryConfig = pda(
  [Buffer.from("SendLibraryConfig"), pdas.store.toBuffer(), u32be(remoteEid)],
  config.endpointProgram,
);
const receiveLibraryConfig = pda(
  [Buffer.from("ReceiveLibraryConfig"), pdas.store.toBuffer(), u32be(remoteEid)],
  config.endpointProgram,
);

printCommonHeader("Solana LayerZero Path Initialization", config, payer.publicKey);
console.log("  Remote EID:", remoteEid);
console.log("  Store PDA:", pdas.store.toBase58());
console.log("  ULN program:", ulnProgram.toBase58());
console.log("  Endpoint OApp registry:", lzPdas.oappRegistry.toBase58());
console.log("  Remote OApps:");
for (const remote of remoteOapps) {
  console.log(`    ${remote.label}: 0x${remote.oapp.toString("hex")}`);
  console.log(`      Nonce: ${remote.nonce.toBase58()}`);
  console.log(`      PendingInboundNonce: ${remote.pendingInboundNonce.toBase58()}`);
}
console.log("  SendLibraryConfig:", sendLibraryConfig.toBase58());
console.log("  ReceiveLibraryConfig:", receiveLibraryConfig.toBase58());
console.log("  ULN SendConfig:", sendConfig.toBase58());
console.log("  ULN ReceiveConfig:", receiveConfig.toBase58());
console.log("  Mode:", SEND ? "send" : "simulate-only");

if (!(await accountExists(connection, pdas.store))) {
  throw new Error("Store PDA does not exist. Run npm run devnet:init first.");
}

const instructions = [];

const sendConfigExists = await accountExists(connection, sendConfig);
const receiveConfigExists = await accountExists(connection, receiveConfig);
if (!sendConfigExists && !receiveConfigExists) {
  instructions.push(initUlnConfigInstruction());
} else if (sendConfigExists && receiveConfigExists) {
  console.log("  ULN app config already exists; skipping init_config");
} else {
  throw new Error("LayerZero ULN app config is partially initialized; inspect SendConfig/ReceiveConfig before continuing.");
}

if (!(await accountExists(connection, sendLibraryConfig))) {
  instructions.push(initSendLibraryInstruction());
} else {
  console.log("  Send library config already exists; skipping init_send_library");
}

if (!(await accountExists(connection, receiveLibraryConfig))) {
  instructions.push(initReceiveLibraryInstruction());
} else {
  console.log("  Receive library config already exists; skipping init_receive_library");
}

for (const remote of remoteOapps) {
  const nonceExists = await accountExists(connection, remote.nonce);
  const pendingNonceExists = await accountExists(connection, remote.pendingInboundNonce);
  if (!nonceExists && !pendingNonceExists) {
    instructions.push(initNonceInstruction(remote));
  } else if (nonceExists && pendingNonceExists) {
    console.log(`  Nonce accounts already exist for ${remote.label}; skipping init_nonce`);
  } else {
    throw new Error(`LayerZero nonce accounts are partially initialized for ${remote.label}; inspect before continuing.`);
  }
}

if (instructions.length === 0) {
  console.log("\nLayerZero path accounts are already initialized.");
  process.exit(0);
}

const simulation = await simulateInstructions(connection, payer, instructions);
console.log("\nSimulation result:", simulation.value.err ? "failed" : "ok");
if (simulation.value.logs?.length) {
  for (const log of simulation.value.logs.slice(-24)) {
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
console.log("\nLayerZero path initialization transaction:", signature);

function initUlnConfigInstruction() {
  return new TransactionInstruction({
    programId: config.endpointProgram,
    keys: [
      meta(payer.publicKey, false, true),
      meta(lzPdas.oappRegistry, false, false),
      meta(messageLibInfo, false, false),
      meta(messageLib, false, false),
      meta(ulnProgram, false, false),
      meta(payer.publicKey, true, true),
      meta(messageLib, false, false),
      meta(sendConfig, false, true),
      meta(receiveConfig, false, true),
      meta(SystemProgram.programId, false, false),
    ],
    data: instructionData("init_config", serializePubkeyU32(pdas.store, remoteEid)),
  });
}

function initSendLibraryInstruction() {
  return new TransactionInstruction({
    programId: config.endpointProgram,
    keys: [
      meta(payer.publicKey, true, true),
      meta(lzPdas.oappRegistry, false, false),
      meta(sendLibraryConfig, false, true),
      meta(SystemProgram.programId, false, false),
    ],
    data: instructionData("init_send_library", serializePubkeyU32(pdas.store, remoteEid)),
  });
}

function initReceiveLibraryInstruction() {
  return new TransactionInstruction({
    programId: config.endpointProgram,
    keys: [
      meta(payer.publicKey, true, true),
      meta(lzPdas.oappRegistry, false, false),
      meta(receiveLibraryConfig, false, true),
      meta(SystemProgram.programId, false, false),
    ],
    data: instructionData("init_receive_library", serializePubkeyU32(pdas.store, remoteEid)),
  });
}

function initNonceInstruction(remote) {
  return new TransactionInstruction({
    programId: config.endpointProgram,
    keys: [
      meta(payer.publicKey, true, true),
      meta(lzPdas.oappRegistry, false, false),
      meta(remote.nonce, false, true),
      meta(remote.pendingInboundNonce, false, true),
      meta(SystemProgram.programId, false, false),
    ],
    data: instructionData("init_nonce", serializeInitNonce(pdas.store, remoteEid, remote.oapp)),
  });
}

function meta(pubkey, isSigner, isWritable) {
  return { pubkey, isSigner, isWritable };
}

function instructionData(name, serializedParams) {
  return Buffer.concat([anchorDiscriminator(name), serializedParams]);
}

function anchorDiscriminator(name) {
  return createHash("sha256").update(`global:${name}`).digest().subarray(0, 8);
}

function serializePubkeyU32(pubkey, value) {
  const buffer = Buffer.alloc(36);
  pubkey.toBuffer().copy(buffer, 0);
  buffer.writeUInt32LE(value, 32);
  return buffer;
}

function serializeInitNonce(localOapp, eid, remoteOappBytes) {
  const buffer = Buffer.alloc(68);
  localOapp.toBuffer().copy(buffer, 0);
  buffer.writeUInt32LE(eid, 32);
  remoteOappBytes.copy(buffer, 36);
  return buffer;
}

function getRemoteOapps() {
  const explicitRemote = getArgValue("--remote-oapp", undefined);
  const candidates = explicitRemote
    ? [{ label: "custom remote", value: explicitRemote }]
    : [
        { label: "hub outbound router", value: process.env.HUB_OUTBOUND_ROUTER_ADDRESS },
        { label: "hub inbound inbox", value: process.env.HUB_INBOUND_INBOX_ADDRESS },
      ];

  const remotes = [];
  for (const candidate of candidates) {
    if (!candidate.value) {
      continue;
    }

    const oapp = Buffer.from(parseBytes32(candidate.value, candidate.label));
    const nonce = pda(
      [Buffer.from("Nonce"), pdas.store.toBuffer(), u32be(remoteEid), oapp],
      config.endpointProgram,
    );
    const pendingInboundNonce = pda(
      [Buffer.from("PendingNonce"), pdas.store.toBuffer(), u32be(remoteEid), oapp],
      config.endpointProgram,
    );
    remotes.push({ label: candidate.label, oapp, nonce, pendingInboundNonce });
  }

  if (remotes.length === 0) {
    throw new Error(
      "Set HUB_OUTBOUND_ROUTER_ADDRESS and/or HUB_INBOUND_INBOX_ADDRESS, or pass --remote-oapp <address-or-bytes32>.",
    );
  }

  return remotes;
}
