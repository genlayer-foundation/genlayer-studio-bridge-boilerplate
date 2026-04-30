#!/usr/bin/env node

import * as anchor from "@coral-xyz/anchor";
import { ComputeBudgetProgram } from "@solana/web3.js";
import { PriceFeedPDADeriver, PriceFeedProgram, SendHelper } from "@layerzerolabs/lz-solana-sdk-v2";
import { Options } from "@layerzerolabs/lz-v2-utilities";
import BN from "bn.js";
import {
  bytesToHex,
  getArgValue,
  getBridgePdas,
  getConfig,
  getConnection,
  getLayerZeroPdas,
  getProgram,
  LAYERZERO_ULN_PROGRAM_ID,
  loadKeypair,
  parseBytes32,
  printCommonHeader,
  sendInstructions,
  simulateInstructions,
} from "./devnet-utils.mjs";

process.on("unhandledRejection", handleFatal);
process.on("uncaughtException", handleFatal);

const SEND = process.argv.includes("--send");
const config = getConfig();
const payer = loadKeypair(config.keypairPath);
const connection = getConnection(config.rpcUrl);
const program = getProgram(connection, payer);
const pdas = getBridgePdas(program.programId, config.hubEid);
const lzPdas = getLayerZeroPdas(config.endpointProgram, pdas.store);

const payloadText = getArgValue(
  "--payload",
  process.env.SOLANA_TO_HUB_PAYLOAD || `hello hub ${Date.now()}`,
);
const targetValue = getArgValue(
  "--target",
  process.env.SOLANA_TO_HUB_TARGET_BYTES32 ||
    process.env.SOLANA_TO_HUB_TARGET ||
    process.env.GENLAYER_TEST_TARGET_BYTES32 ||
    process.env.GENLAYER_TEST_TARGET ||
    payer.publicKey.toBase58(),
);
const lzReceiveGas = Number(
  getArgValue("--lz-receive-gas", process.env.SOLANA_TO_HUB_LZ_RECEIVE_GAS || "250000"),
);
const lzReceiveValue = BigInt(
  getArgValue("--lz-receive-value", process.env.SOLANA_TO_HUB_LZ_RECEIVE_VALUE || "0"),
);
const computeUnits = Number(getArgValue("--compute-units", process.env.SOLANA_TO_HUB_COMPUTE_UNITS || "1000000"));

const target = Buffer.from(parseBytes32(targetValue, "SOLANA_TO_HUB_TARGET"));
const payload = Buffer.from(payloadText, "utf8");
const options = Buffer.from(
  Options.newOptions().addExecutorLzReceiveOption(lzReceiveGas, lzReceiveValue).toBytes(),
);

const outboundPeer = await program.account.outboundPeerConfig.fetch(pdas.outboundPeer);
const receiver = bytesToHex(outboundPeer.peerAddress);
await assertLayerZeroPricefeedRoute(connection, config.hubEid);

const helper = new SendHelper(config.endpointProgram, LAYERZERO_ULN_PROGRAM_ID);
const quoteRemainingAccounts = await helper.getQuoteAccounts(
  connection,
  payer.publicKey,
  pdas.store,
  config.hubEid,
  receiver,
  "confirmed",
);

const quoteParams = {
  dstEid: config.hubEid,
  target: [...target],
  payload,
  options,
  payInLzToken: false,
};
const fee = await program.methods
  .quoteSendToGenLayer(quoteParams)
  .accounts({
    payer: payer.publicKey,
    store: pdas.store,
    outboundPeer: pdas.outboundPeer,
    endpoint: lzPdas.endpoint,
  })
  .remainingAccounts(quoteRemainingAccounts)
  .view();

const nativeFee = new BN(fee.nativeFee.toString());
const lzTokenFee = new BN(fee.lzTokenFee.toString());
const nativeFeeLamports = BigInt(nativeFee.toString());
const payerBalance = BigInt(await connection.getBalance(payer.publicKey, "confirmed"));

const sendRemainingAccounts = await helper.getSendAccounts(
  connection,
  payer.publicKey,
  pdas.store,
  config.hubEid,
  receiver,
  "confirmed",
);
const sendInstruction = await program.methods
  .sendToGenLayer({
    dstEid: config.hubEid,
    target: [...target],
    payload,
    options,
    nativeFee,
    lzTokenFee,
  })
  .accounts({
    payer: payer.publicKey,
    store: pdas.store,
    outboundPeer: pdas.outboundPeer,
    endpoint: lzPdas.endpoint,
  })
  .remainingAccounts(sendRemainingAccounts)
  .instruction();

const instructions = [
  ComputeBudgetProgram.setComputeUnitLimit({ units: computeUnits }),
  sendInstruction,
];

printCommonHeader("Solana -> Hub Smoke Message", config, payer.publicKey);
console.log("  Store PDA:", pdas.store.toBase58());
console.log("  Hub EID:", config.hubEid);
console.log("  Hub inbound inbox peer:", receiver);
console.log("  Target:", bytesToHex(target));
console.log("  Payload:", payloadText);
console.log("  LZ receive gas:", lzReceiveGas);
console.log("  LZ receive value:", lzReceiveValue.toString(), "wei");
console.log("  Compute unit limit:", computeUnits);
console.log("  Quote remaining accounts:", quoteRemainingAccounts.length);
console.log("  Send remaining accounts:", sendRemainingAccounts.length);
console.log("  Native fee:", nativeFeeLamports.toString(), "lamports");
console.log("  LZ token fee:", lzTokenFee.toString());
console.log("  Payer balance:", payerBalance.toString(), "lamports");
console.log("  Mode:", SEND ? "send" : "simulate-only");

if (payerBalance <= nativeFeeLamports) {
  throw new Error(`Insufficient SOL: need more than ${nativeFeeLamports} lamports, have ${payerBalance}`);
}

const simulation = await simulateInstructions(connection, payer, instructions);
console.log("\nSimulation result:", simulation.value.err ? "failed" : "ok");
if (simulation.value.logs?.length) {
  for (const log of simulation.value.logs.slice(-32)) {
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
console.log("\nSolana send transaction:", signature);
console.log("LayerZero Scan:", `https://testnet.layerzeroscan.com/tx/${signature}`);

const event = await findEvent(signature, "messageSentToGenLayer");
console.log("Message ID:", bytesToHex(event.messageId));
console.log("Outbound nonce:", event.nonce.toString());

async function findEvent(signature, name) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const tx = await connection.getTransaction(signature, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    });
    if (tx?.meta?.logMessages) {
      for (const log of tx.meta.logMessages) {
        const prefix = "Program data: ";
        if (!log.startsWith(prefix)) {
          continue;
        }

        const event = program.coder.events.decode(log.slice(prefix.length));
        if (event?.name === name) {
          return event.data;
        }
      }
    }
    await sleep(500);
  }

  throw new Error(`Event not found: ${name}`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function handleFatal(error) {
  if (process.env.DEBUG === "1") {
    console.error(error);
  } else {
    console.error(error?.message || error);
  }
  process.exit(1);
}

async function assertLayerZeroPricefeedRoute(connection, dstEid) {
  if (process.argv.includes("--skip-pricefeed-check")) {
    return;
  }

  const pricefeedProgram = PriceFeedProgram.PROGRAM_ID;
  const pricefeed = new PriceFeedPDADeriver(pricefeedProgram).priceFeed()[0];
  const info = await connection.getAccountInfo(pricefeed, "confirmed");
  if (!info) {
    throw new Error(`LayerZero pricefeed account is missing: ${pricefeed.toBase58()}`);
  }

  const account = PriceFeedProgram.accounts.PriceFeed.fromAccountInfo(info)[0];
  const candidateEids = [dstEid];
  if (dstEid >= 30000) {
    candidateEids.push(dstEid - 30000);
  }

  if (account.prices.some((price) => candidateEids.includes(price.eid))) {
    return;
  }

  throw new Error(
    [
      `LayerZero Solana pricefeed ${pricefeed.toBase58()} has no price row for destination EID ${dstEid}.`,
      `Checked rows ${candidateEids.join(" and ")} because the Solana pricefeed stores legacy testnet IDs for some routes.`,
      "The Endpoint/ULN account path is initialized, but LayerZero cannot quote or send this route until the Solana Devnet pricefeed supports the destination.",
      "Use a supported destination EID, or ask LayerZero to add the missing pricefeed route. Pass --skip-pricefeed-check to force the raw quote attempt.",
    ].join(" "),
  );
}
