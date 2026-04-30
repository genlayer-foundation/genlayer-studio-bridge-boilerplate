import * as anchor from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const BRIDGE_PROGRAM_ID = new PublicKey("H4bMLhY9L8rB8kQrMbSeyy2KbQ2CYQnSvxqPro6vsy4J");
export const LAYERZERO_ENDPOINT_PROGRAM_ID = new PublicKey(
  "76y77prsiCMvXMjuoZ5VRrhG5qYBrUMYTE5WgHqgjEn6",
);
export const LAYERZERO_ULN_PROGRAM_ID = new PublicKey("7a4WjyR8VZ7yZz5XJAKm39BUGn5iT9CKcv2pmG9tdXVH");
export const SOLANA_EID = 40168;
export const HUB_EID = 40305;

export const STORE_SEED = "Store";
export const PEER_SEED = "Peer";
export const OUTBOUND_PEER_SEED = "OutboundPeer";
export const LZ_RECEIVE_TYPES_SEED = "LzReceiveTypes";
export const RECEIVER_SEED = "Receiver";
export const RECEIVER_STATE_SEED = "ReceiverState";
export const OAPP_SEED = "OApp";
export const EVENT_SEED = "__event_authority";

const scriptDir = dirname(fileURLToPath(import.meta.url));
export const workspaceDir = resolve(scriptDir, "..");
export const repoDir = resolve(workspaceDir, "../..");

export function loadLocalEnv() {
  const candidates = [
    resolve(workspaceDir, ".env.testnet.local"),
    resolve(repoDir, ".env.testnet.local"),
  ];

  for (const file of candidates) {
    if (!existsSync(file)) {
      continue;
    }

    const body = readFileSync(file, "utf8");
    for (const rawLine of body.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) {
        continue;
      }

      const equalsIndex = line.indexOf("=");
      if (equalsIndex === -1) {
        continue;
      }

      const key = line.slice(0, equalsIndex).trim();
      const value = line
        .slice(equalsIndex + 1)
        .trim()
        .replace(/^['"]|['"]$/g, "");

      if (!(key in process.env)) {
        process.env[key] = value;
      }
    }
  }
}

export function getArgFlag(name) {
  return process.argv.includes(name);
}

export function getArgValue(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index === -1 || index + 1 >= process.argv.length) {
    return fallback;
  }
  return process.argv[index + 1];
}

export function getConfig() {
  loadLocalEnv();

  const rpcUrl =
    process.env.SOLANA_RPC_URL ||
    process.env.SOLANA_DEVNET_RPC_URL ||
    getArgValue("--rpc-url", "https://api.devnet.solana.com");
  const keypairPath = resolve(
    workspaceDir,
    getArgValue(
      "--keypair",
      process.env.SOLANA_KEYPAIR_PATH ||
        process.env.ANCHOR_WALLET ||
        "../../.testnet-keys/solana-devnet.json",
    ),
  );
  const programKeypairPath = resolve(
    workspaceDir,
    getArgValue(
      "--program-keypair",
      process.env.SOLANA_PROGRAM_KEYPAIR_PATH || "target/deploy/bridge_endpoint-keypair.json",
    ),
  );
  const programSoPath = resolve(
    workspaceDir,
    getArgValue("--program-so", process.env.SOLANA_PROGRAM_SO_PATH || "target/deploy/bridge_endpoint.so"),
  );
  const bufferKeypairPath = resolve(
    workspaceDir,
    getArgValue(
      "--buffer-keypair",
      process.env.SOLANA_DEPLOY_BUFFER_KEYPAIR_PATH ||
        "../../.testnet-keys/solana-deploy-buffer.json",
    ),
  );
  const endpointProgram = new PublicKey(
    getArgValue(
      "--endpoint-program",
      process.env.LAYERZERO_SOLANA_ENDPOINT_PROGRAM_ID || LAYERZERO_ENDPOINT_PROGRAM_ID.toBase58(),
    ),
  );
  const localEid = Number(getArgValue("--local-eid", process.env.SOLANA_EID || SOLANA_EID));
  const hubEid = Number(getArgValue("--hub-eid", process.env.HUB_EID || HUB_EID));

  return {
    rpcUrl,
    keypairPath,
    programKeypairPath,
    programSoPath,
    bufferKeypairPath,
    endpointProgram,
    localEid,
    hubEid,
  };
}

export function loadKeypair(path) {
  const secret = JSON.parse(readFileSync(path, "utf8"));
  return Keypair.fromSecretKey(Uint8Array.from(secret));
}

export function getConnection(rpcUrl) {
  return new Connection(rpcUrl, {
    commitment: "confirmed",
    confirmTransactionInitialTimeout: 90_000,
  });
}

export function getProgram(connection, payerKeypair) {
  const idl = JSON.parse(readFileSync(resolve(workspaceDir, "target/idl/bridge_endpoint.json"), "utf8"));
  const wallet = new anchor.Wallet(payerKeypair);
  const provider = new anchor.AnchorProvider(connection, wallet, {
    commitment: "confirmed",
    preflightCommitment: "confirmed",
  });
  return new anchor.Program(idl, provider);
}

export function u32be(value) {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32BE(value);
  return buffer;
}

export function pda(seedParts, programId = BRIDGE_PROGRAM_ID) {
  return PublicKey.findProgramAddressSync(seedParts, programId)[0];
}

export function getBridgePdas(programId = BRIDGE_PROGRAM_ID, hubEid = HUB_EID) {
  const store = pda([Buffer.from(STORE_SEED)], programId);
  return {
    store,
    lzReceiveTypesAccounts: pda([Buffer.from(LZ_RECEIVE_TYPES_SEED), store.toBuffer()], programId),
    peer: pda([Buffer.from(PEER_SEED), store.toBuffer(), u32be(hubEid)], programId),
    outboundPeer: pda([Buffer.from(OUTBOUND_PEER_SEED), store.toBuffer(), u32be(hubEid)], programId),
  };
}

export function getLayerZeroPdas(endpointProgram, oapp) {
  return {
    endpoint: pda([Buffer.from("Endpoint")], endpointProgram),
    oappRegistry: pda([Buffer.from(OAPP_SEED), oapp.toBuffer()], endpointProgram),
    eventAuthority: pda([Buffer.from(EVENT_SEED)], endpointProgram),
  };
}

export function getRegisterOappRemainingAccounts(endpointProgram, payer, oapp) {
  const { oappRegistry, eventAuthority } = getLayerZeroPdas(endpointProgram, oapp);

  return [
    { pubkey: endpointProgram, isSigner: false, isWritable: false },
    { pubkey: payer, isSigner: true, isWritable: true },
    { pubkey: oapp, isSigner: false, isWritable: false },
    { pubkey: oappRegistry, isSigner: false, isWritable: true },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    { pubkey: eventAuthority, isSigner: false, isWritable: false },
    { pubkey: endpointProgram, isSigner: false, isWritable: false },
  ];
}

export function parseBytes32(value, name) {
  if (!value) {
    throw new Error(`Missing ${name}`);
  }

  const normalized = value.trim();
  if (/^0x[0-9a-fA-F]{64}$/.test(normalized)) {
    return Array.from(Buffer.from(normalized.slice(2), "hex"));
  }

  if (/^0x[0-9a-fA-F]{40}$/.test(normalized)) {
    return Array.from(Buffer.concat([Buffer.alloc(12), Buffer.from(normalized.slice(2), "hex")]));
  }

  try {
    const pubkey = new PublicKey(normalized);
    return Array.from(pubkey.toBytes());
  } catch {
    throw new Error(`${name} must be an EVM address, 0x-prefixed bytes32, or Solana pubkey`);
  }
}

export function bytesToHex(bytes) {
  return `0x${Buffer.from(bytes).toString("hex")}`;
}

export async function accountExists(connection, pubkey) {
  return (await connection.getAccountInfo(pubkey, "confirmed")) !== null;
}

export async function simulateInstructions(connection, payerKeypair, instructions) {
  const transaction = new Transaction();
  transaction.feePayer = payerKeypair.publicKey;
  transaction.recentBlockhash = (await connection.getLatestBlockhash("confirmed")).blockhash;
  transaction.add(...instructions);
  transaction.sign(payerKeypair);

  return connection.simulateTransaction(transaction);
}

export async function sendInstructions(connection, payerKeypair, instructions) {
  const transaction = new Transaction();
  transaction.feePayer = payerKeypair.publicKey;
  const latestBlockhash = await connection.getLatestBlockhash("confirmed");
  transaction.recentBlockhash = latestBlockhash.blockhash;
  transaction.add(...instructions);
  transaction.sign(payerKeypair);

  const signature = await connection.sendRawTransaction(transaction.serialize(), {
    preflightCommitment: "confirmed",
    skipPreflight: false,
  });
  await connection.confirmTransaction(
    {
      signature,
      ...latestBlockhash,
    },
    "confirmed",
  );

  return signature;
}

export function printCommonHeader(title, config, payer) {
  console.log(`\n${title}`);
  console.log("  Cluster RPC:", config.rpcUrl);
  console.log("  Fee payer:", payer.toBase58());
  console.log("  Bridge program:", BRIDGE_PROGRAM_ID.toBase58());
  console.log("  LayerZero endpoint program:", config.endpointProgram.toBase58());
}
