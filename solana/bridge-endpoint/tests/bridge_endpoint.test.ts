import * as anchor from "@coral-xyz/anchor";
import { expect } from "chai";
import {
  Commitment,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";

const STORE_SEED = "Store";
const PEER_SEED = "Peer";
const OUTBOUND_PEER_SEED = "OutboundPeer";
const LZ_RECEIVE_TYPES_SEED = "LzReceiveTypes";
const RECEIVER_SEED = "Receiver";
const MESSAGE_SEED = "Message";
const MESSAGE_STATUS_SEED = "MessageStatus";
const RECEIVER_STATE_SEED = "ReceiverState";

const GENLAYER_EID = 61998;
const HUB_EID = 40305;
const SOLANA_EID = 40168;
const STORE_AND_CLAIM = 0;
const DIRECT = 1;

describe("bridge_endpoint", () => {
  const commitment: Commitment = "confirmed";
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = (anchor.workspace as any).bridgeEndpoint as any;
  const payer = provider.wallet.publicKey;
  const hubSender = Buffer.alloc(32, 0x22);
  const hubInboundInbox = Buffer.alloc(32, 0x55);
  const sourceSender = Buffer.alloc(32, 0x44);

  const [store] = PublicKey.findProgramAddressSync(
    [Buffer.from(STORE_SEED)],
    program.programId,
  );
  const [lzReceiveTypesAccounts] = PublicKey.findProgramAddressSync(
    [Buffer.from(LZ_RECEIVE_TYPES_SEED), store.toBuffer()],
    program.programId,
  );
  const [peer] = PublicKey.findProgramAddressSync(
    [Buffer.from(PEER_SEED), store.toBuffer(), u32be(HUB_EID)],
    program.programId,
  );
  const [outboundPeer] = PublicKey.findProgramAddressSync(
    [Buffer.from(OUTBOUND_PEER_SEED), store.toBuffer(), u32be(HUB_EID)],
    program.programId,
  );

  before(async () => {
    const signature = await provider.connection.requestAirdrop(payer, 10 * LAMPORTS_PER_SOL);
    const latestBlockhash = await provider.connection.getLatestBlockhash();
    await provider.connection.confirmTransaction(
      {
        signature,
        ...latestBlockhash,
      },
      commitment,
    );

    await program.methods
      .init(payer, program.programId, SOLANA_EID)
      .accounts({
        payer,
        store,
        lzReceiveTypesAccounts,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    await program.methods
      .setTrustedPeer(HUB_EID, [...hubSender])
      .accounts({
        admin: payer,
        store,
        peer,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    await program.methods
      .setOutboundPeer(HUB_EID, [...hubInboundInbox])
      .accounts({
        admin: payer,
        store,
        outboundPeer,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
  });

  it("stores a LayerZero-delivered bridge envelope and claims it", async () => {
    const target = Keypair.generate().publicKey;
    const messageId = Buffer.alloc(32, 0x11);
    const guid = Buffer.alloc(32, 0xa1);
    const payload = Buffer.from("hello from genlayer", "utf8");
    const encodedMessage = encodeBridgeEnvelope(messageId, GENLAYER_EID, sourceSender, target, payload);
    const params = lzReceiveParams(hubSender, 1n, guid, encodedMessage);
    const [receiver] = receiverPda(target);
    const [message] = messagePda(messageId);
    const [status] = messageStatusPda(messageId);
    const [receiverState] = receiverStatePda(target);

    await program.methods
      .registerReceiver(target, STORE_AND_CLAIM)
      .accounts({
        admin: payer,
        store,
        receiver,
        receiverState,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    await program.methods
      .lzReceive(params)
      .accounts({
        payer,
        store,
        peer,
        receiver,
        message,
        status,
        receiverState,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const stored = await program.account.receivedMessage.fetch(message);
    expect(stored.initialized).to.equal(true);
    expect(Buffer.from(stored.messageId)).to.deep.equal(messageId);
    expect(stored.sourceEid).to.equal(GENLAYER_EID);
    expect(Buffer.from(stored.sourceSender)).to.deep.equal(sourceSender);
    expect(stored.target.toBase58()).to.equal(target.toBase58());
    expect(Buffer.from(stored.payload)).to.deep.equal(payload);
    expect(stored.claimed).to.equal(false);

    await program.methods
      .claimMessage([...messageId])
      .accounts({
        claimer: payer,
        store,
        receiver,
        message,
        receiverState,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const claimed = await program.account.receivedMessage.fetch(message);
    expect(claimed.claimed).to.equal(true);

    const state = await program.account.receiverState.fetch(receiverState);
    expect(state.target.toBase58()).to.equal(target.toBase58());
    expect(Buffer.from(state.lastMessageId)).to.deep.equal(messageId);
    expect(state.lastSourceEid).to.equal(GENLAYER_EID);
    expect(Buffer.from(state.lastSourceSender)).to.deep.equal(sourceSender);
    expect(Buffer.from(state.lastPayload)).to.deep.equal(payload);

    await expectRejects(
      program.methods
        .claimMessage([...messageId])
        .accounts({
          claimer: payer,
          store,
          receiver,
          message,
          receiverState,
          systemProgram: SystemProgram.programId,
        })
        .rpc(),
      "already been claimed",
    );
  });

  it("delivers directly when the receiver mode is direct", async () => {
    const target = Keypair.generate().publicKey;
    const messageId = Buffer.alloc(32, 0x12);
    const guid = Buffer.alloc(32, 0xa2);
    const nonce = 2n;
    const payload = Buffer.from([0xde, 0xad, 0xbe, 0xef]);
    const encodedMessage = encodeBridgeEnvelope(messageId, GENLAYER_EID, sourceSender, target, payload);
    const params = lzReceiveParams(hubSender, nonce, guid, encodedMessage);
    const [receiver] = receiverPda(target);
    const [message] = messagePda(messageId);
    const [status] = messageStatusPda(messageId);
    const [receiverState] = receiverStatePda(target);

    await program.methods
      .registerReceiver(target, DIRECT)
      .accounts({
        admin: payer,
        store,
        receiver,
        receiverState,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const info = await simulateLzReceiveTypesInfo(
      program,
      provider,
      payer,
      params,
      store,
      lzReceiveTypesAccounts,
    );
    expect(info.version).to.equal(2);
    expect(info.accounts.map((account) => account.toBase58())).to.deep.equal([
      store.toBase58(),
      receiver.toBase58(),
    ]);

    const plan = await program.methods
      .lzReceiveTypesV2(params)
      .accounts({ store, receiver })
      .view();
    const plannedAccounts = lzReceiveInstructionAccounts(plan.instructions[0]);
    const clear = endpointClearAccounts(store, HUB_EID, hubSender, nonce, program.programId);

    expect(plan.contextVersion).to.equal(1);
    expect(isPayerLocator(plannedAccounts[0].pubkey)).to.equal(true);
    expect(hasPlannedAddress(plannedAccounts, message)).to.equal(true);
    expect(hasPlannedAddress(plannedAccounts, status)).to.equal(true);
    expect(hasPlannedAddress(plannedAccounts, receiverState)).to.equal(true);
    expect(writableForPlannedAddress(plannedAccounts, clear.payloadHash)).to.equal(true);
    expect(writableForPlannedAddress(plannedAccounts, clear.endpointSettings)).to.equal(true);

    await program.methods
      .lzReceive(params)
      .accounts({
        payer,
        store,
        peer,
        receiver,
        message,
        status,
        receiverState,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const state = await program.account.receiverState.fetch(receiverState);
    expect(Buffer.from(state.lastMessageId)).to.deep.equal(messageId);
    expect(Buffer.from(state.lastPayload)).to.deep.equal(payload);
  });

  it("rejects untrusted peers and replayed messages", async () => {
    const target = Keypair.generate().publicKey;
    const badMessageId = Buffer.alloc(32, 0x14);
    const messageId = Buffer.alloc(32, 0x13);
    const payload = Buffer.from("once", "utf8");
    const [receiver] = receiverPda(target);
    const [badMessage] = messagePda(badMessageId);
    const [badStatus] = messageStatusPda(badMessageId);
    const [message] = messagePda(messageId);
    const [status] = messageStatusPda(messageId);
    const [receiverState] = receiverStatePda(target);
    const badSender = Buffer.alloc(32, 0x99);
    const badEnvelope = encodeBridgeEnvelope(badMessageId, GENLAYER_EID, badSender, target, payload);
    const validEnvelope = encodeBridgeEnvelope(messageId, GENLAYER_EID, sourceSender, target, payload);
    const badParams = lzReceiveParams(badSender, 3n, Buffer.alloc(32, 0xa3), badEnvelope);
    const validParams = lzReceiveParams(hubSender, 4n, Buffer.alloc(32, 0xa4), validEnvelope);

    await program.methods
      .registerReceiver(target, STORE_AND_CLAIM)
      .accounts({
        admin: payer,
        store,
        receiver,
        receiverState,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    await expectRejects(
      program.methods
        .lzReceive(badParams)
        .accounts({
          payer,
          store,
          peer,
          receiver,
          message: badMessage,
          status: badStatus,
          receiverState,
          systemProgram: SystemProgram.programId,
        })
        .rpc(),
      "not trusted",
    );

    await program.methods
      .lzReceive(validParams)
      .accounts({
        payer,
        store,
        peer,
        receiver,
        message,
        status,
        receiverState,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    await expectRejects(
      program.methods
        .lzReceive(validParams)
        .accounts({
          payer,
          store,
          peer,
          receiver,
          message,
          status,
          receiverState,
          systemProgram: SystemProgram.programId,
        })
        .rpc(),
      "already been received",
    );
  });

  it("sends Solana-originated messages through the outbound peer path", async () => {
    const target = Buffer.alloc(32, 0x66);
    const payload = Buffer.from("hello from solana", "utf8");
    const options = Buffer.alloc(0);

    const fee = await program.methods
      .quoteSendToGenLayer({
        dstEid: HUB_EID,
        target: [...target],
        payload,
        options,
        payInLzToken: false,
      })
      .accounts({
        payer,
        store,
        outboundPeer,
        endpoint: program.programId,
      })
      .view();
    expect(new anchor.BN(fee.nativeFee).toNumber()).to.equal(0);
    expect(new anchor.BN(fee.lzTokenFee).toNumber()).to.equal(0);

    const before = await program.account.store.fetch(store);
    const signature = await program.methods
      .sendToGenLayer({
        dstEid: HUB_EID,
        target: [...target],
        payload,
        options,
        nativeFee: new anchor.BN(0),
        lzTokenFee: new anchor.BN(0),
      })
      .accounts({
        payer,
        store,
        outboundPeer,
        endpoint: program.programId,
      })
      .rpc();

    const after = await program.account.store.fetch(store);
    expect(after.localEid).to.equal(SOLANA_EID);
    expect(new anchor.BN(after.outboundNonce).sub(new anchor.BN(before.outboundNonce)).toNumber()).to.equal(1);

    await provider.connection.confirmTransaction(signature, "confirmed");
    const event = await findEvent(signature, "messageSentToGenLayer");
    expect(event.dstEid).to.equal(HUB_EID);
    expect(event.sourceEid).to.equal(SOLANA_EID);
    expect(Buffer.from(event.sourceSender)).to.deep.equal(payer.toBuffer());
    expect(Buffer.from(event.target)).to.deep.equal(target);
    expect(Buffer.from(event.payload)).to.deep.equal(payload);
    expect(new anchor.BN(event.nonce).toNumber()).to.equal(new anchor.BN(after.outboundNonce).toNumber());

    const configuredPeer = await program.account.outboundPeerConfig.fetch(outboundPeer);
    expect(configuredPeer.dstEid).to.equal(HUB_EID);
    expect(Buffer.from(configuredPeer.peerAddress)).to.deep.equal(hubInboundInbox);
  });

  function receiverPda(target: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from(RECEIVER_SEED), target.toBuffer()],
      program.programId,
    );
  }

  function messagePda(messageId: Buffer): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from(MESSAGE_SEED), messageId],
      program.programId,
    );
  }

  function messageStatusPda(messageId: Buffer): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from(MESSAGE_STATUS_SEED), messageId],
      program.programId,
    );
  }

  function receiverStatePda(target: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from(RECEIVER_STATE_SEED), target.toBuffer()],
      program.programId,
    );
  }

  async function findEvent(signature: string, name: string): Promise<any> {
    let tx = null;
    for (let attempt = 0; attempt < 10; attempt += 1) {
      tx = await provider.connection.getTransaction(signature, {
        commitment: "confirmed",
        maxSupportedTransactionVersion: 0,
      });
      if (tx?.meta?.logMessages !== undefined) {
        break;
      }
      await sleep(250);
    }
    expect(tx?.meta?.logMessages).to.not.equal(undefined);

    for (const log of tx!.meta!.logMessages!) {
      const prefix = "Program data: ";
      if (!log.startsWith(prefix)) {
        continue;
      }
      const event = program.coder.events.decode(log.slice(prefix.length));
      if (event?.name === name) {
        return event.data;
      }
    }

    throw new Error(`event not found: ${name}`);
  }

  function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
});

function encodeBridgeEnvelope(
  messageId: Buffer,
  sourceEid: number,
  sourceSender: Buffer,
  target: PublicKey,
  payload: Buffer,
): Buffer {
  const payloadPadding = Buffer.alloc((32 - (payload.length % 32)) % 32);
  return Buffer.concat([
    wordFromU16(1),
    messageId,
    wordFromU32(sourceEid),
    sourceSender,
    target.toBuffer(),
    wordFromU64(192n),
    wordFromU64(BigInt(payload.length)),
    payload,
    payloadPadding,
  ]);
}

function lzReceiveParams(sender: Buffer, nonce: bigint, guid: Buffer, message: Buffer): any {
  return {
    srcEid: HUB_EID,
    sender: [...sender],
    nonce: new anchor.BN(nonce.toString()),
    guid: [...guid],
    message,
    extraData: Buffer.alloc(0),
  };
}

function wordFromU16(value: number): Buffer {
  const word = Buffer.alloc(32);
  word.writeUInt16BE(value, 30);
  return word;
}

function wordFromU32(value: number): Buffer {
  const word = Buffer.alloc(32);
  word.writeUInt32BE(value, 28);
  return word;
}

function wordFromU64(value: bigint): Buffer {
  const word = Buffer.alloc(32);
  word.writeBigUInt64BE(value, 24);
  return word;
}

function u32be(value: number): Buffer {
  const out = Buffer.alloc(4);
  out.writeUInt32BE(value, 0);
  return out;
}

function u64be(value: bigint): Buffer {
  const out = Buffer.alloc(8);
  out.writeBigUInt64BE(value, 0);
  return out;
}

function endpointClearAccounts(
  receiver: PublicKey,
  sourceEid: number,
  sender: Buffer,
  nonce: bigint,
  endpointProgram: PublicKey,
): { payloadHash: PublicKey; endpointSettings: PublicKey } {
  const [payloadHash] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("PayloadHash"),
      receiver.toBuffer(),
      u32be(sourceEid),
      sender,
      u64be(nonce),
    ],
    endpointProgram,
  );
  const [endpointSettings] = PublicKey.findProgramAddressSync(
    [Buffer.from("Endpoint")],
    endpointProgram,
  );

  return { payloadHash, endpointSettings };
}

function lzReceiveInstructionAccounts(instruction: any): any[] {
  const lzReceive = instruction.lzReceive ?? instruction.lz_receive ?? instruction.LzReceive;
  expect(lzReceive).to.not.equal(undefined);
  return lzReceive.accounts;
}

async function simulateLzReceiveTypesInfo(
  program: any,
  provider: anchor.AnchorProvider,
  payer: PublicKey,
  params: any,
  store: PublicKey,
  lzReceiveTypesAccounts: PublicKey,
): Promise<{ version: number; accounts: PublicKey[] }> {
  const instruction = await program.methods
    .lzReceiveTypesInfo(params)
    .accounts({ store, lzReceiveTypesAccounts })
    .instruction();
  const transaction = new Transaction().add(instruction);
  transaction.feePayer = payer;
  transaction.recentBlockhash = (await provider.connection.getLatestBlockhash()).blockhash;

  const simulation = await provider.connection.simulateTransaction(transaction);
  expect(simulation.value.err).to.equal(null);
  expect(simulation.value.returnData?.programId).to.equal(program.programId.toBase58());
  expect(simulation.value.returnData?.data[1]).to.equal("base64");

  return decodeLzReceiveTypesInfo(Buffer.from(simulation.value.returnData!.data[0], "base64"));
}

function decodeLzReceiveTypesInfo(data: Buffer): { version: number; accounts: PublicKey[] } {
  expect(data.length).to.be.greaterThanOrEqual(5);

  let offset = 0;
  const version = data.readUInt8(offset);
  offset += 1;

  const accountCount = data.readUInt32LE(offset);
  offset += 4;

  const accounts: PublicKey[] = [];
  for (let i = 0; i < accountCount; i += 1) {
    accounts.push(new PublicKey(data.subarray(offset, offset + 32)));
    offset += 32;
  }

  expect(offset).to.equal(data.length);
  return { version, accounts };
}

function hasPlannedAddress(accounts: any[], pubkey: PublicKey): boolean {
  return accounts.some((meta) => locatorAddress(meta.pubkey)?.equals(pubkey) === true);
}

function writableForPlannedAddress(accounts: any[], pubkey: PublicKey): boolean {
  const meta = accounts.find((candidate) => locatorAddress(candidate.pubkey)?.equals(pubkey));
  expect(meta).to.not.equal(undefined);
  return Boolean(meta.isWritable ?? meta.is_writable);
}

function isPayerLocator(locator: any): boolean {
  return locator?.payer !== undefined || locator?.Payer !== undefined;
}

function locatorAddress(locator: any): PublicKey | undefined {
  const value = locator?.address ?? locator?.Address;
  if (value === undefined) {
    return undefined;
  }
  return publicKeyFromUnknown(value);
}

function publicKeyFromUnknown(value: any): PublicKey | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (value instanceof PublicKey) {
    return value;
  }
  if (typeof value.toBase58 === "function") {
    return new PublicKey(value.toBase58());
  }
  if (Array.isArray(value)) {
    if (value.every((item) => typeof item === "number")) {
      return new PublicKey(value);
    }
    return publicKeyFromUnknown(value[0]);
  }
  if (value.fields !== undefined) {
    return publicKeyFromUnknown(value.fields[0]);
  }
  if (value._0 !== undefined) {
    return publicKeyFromUnknown(value._0);
  }
  if (value[0] !== undefined) {
    return publicKeyFromUnknown(value[0]);
  }
  if (value.pubkey !== undefined) {
    return publicKeyFromUnknown(value.pubkey);
  }
  if (value.publicKey !== undefined) {
    return publicKeyFromUnknown(value.publicKey);
  }
  if (value.key !== undefined) {
    return publicKeyFromUnknown(value.key);
  }
  if (typeof value === "object") {
    for (const candidate of Object.values(value)) {
      const parsed = publicKeyFromUnknown(candidate);
      if (parsed !== undefined) {
        return parsed;
      }
    }
  }

  try {
    return new PublicKey(value);
  } catch {
    return undefined;
  }
}

async function expectRejects(promise: Promise<unknown>, message: string): Promise<void> {
  try {
    await promise;
  } catch (error) {
    expect(String(error)).to.include(message);
    return;
  }
  throw new Error(`expected rejection including ${message}`);
}
