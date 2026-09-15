import assert from "node:assert/strict";
import test from "node:test";
import { Keypair, SystemProgram } from "@solana/web3.js";
import { programAccountExists, sendInstructions } from "../scripts/devnet-utils.mjs";

test("sendInstructions rejects failed confirmation and returns successful signatures", async () => {
  const payer = Keypair.generate();
  const instruction = SystemProgram.transfer({
    fromPubkey: payer.publicKey, toPubkey: Keypair.generate().publicKey, lamports: 1,
  });
  let err = { InstructionError: [0, { Custom: 6000 }] };
  const connection = {
    getLatestBlockhash: async () => ({ blockhash: Keypair.generate().publicKey.toBase58(), lastValidBlockHeight: 100 }),
    sendRawTransaction: async () => "test-signature",
    confirmTransaction: async () => ({ value: { err } }),
  };
  await assert.rejects(sendInstructions(connection, payer, [instruction]), /test-signature.*6000/);
  err = null;
  assert.equal(await sendInstructions(connection, payer, [instruction]), "test-signature");
});

test("prefunded PDAs are not treated as initialized program accounts", async () => {
  const owner = Keypair.generate().publicKey;
  const account = Keypair.generate().publicKey;
  let info = { owner: SystemProgram.programId, data: Buffer.alloc(0) };
  const connection = { getAccountInfo: async () => info };
  assert.equal(await programAccountExists(connection, account, owner), false);
  info = { owner, data: Buffer.alloc(80) };
  assert.equal(await programAccountExists(connection, account, owner), true);
  assert.equal(await programAccountExists(connection, account, SystemProgram.programId), false);
  info = null;
  assert.equal(await programAccountExists(connection, account, owner), false);
});
