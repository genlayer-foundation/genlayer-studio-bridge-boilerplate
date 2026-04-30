import { randomBytes } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const { Wallet } = require(resolve(root, "smart-contracts/node_modules/ethers"));
const { Keypair } = require(resolve(root, "solana/bridge-endpoint/node_modules/@solana/web3.js"));
const force = process.argv.includes("--force");
const keyDir = resolve(root, ".testnet-keys");
mkdirSync(keyDir, { recursive: true, mode: 0o700 });
chmodSync(keyDir, 0o700);

const solanaKeypairPath = resolve(keyDir, "solana-devnet.json");
const evmPrivateKeyPath = resolve(keyDir, "evm-private-key");
const addressesPath = resolve(keyDir, "addresses.json");
const smartContractsEnvPath = resolve(root, "smart-contracts/.env");
const serviceEnvPath = resolve(root, "service/.env");
const solanaEnvPath = resolve(root, "solana/bridge-endpoint/.env.testnet.local");

if (!force) {
  const existing = [
    evmPrivateKeyPath,
    solanaKeypairPath,
    smartContractsEnvPath,
    serviceEnvPath,
    solanaEnvPath,
  ].filter((path) => existsSync(path));
  if (existing.length > 0) {
    throw new Error(
      `Refusing to overwrite existing testnet key/env files. Re-run with --force only if you intentionally want new keys.\n${existing.join("\n")}`,
    );
  }
}

const evmPrivateKey = `0x${randomBytes(32).toString("hex")}`;
const evmWallet = new Wallet(evmPrivateKey);
const solanaKeypair = Keypair.generate();

writeSecret(evmPrivateKeyPath, `${evmPrivateKey.slice(2)}\n`);
writeSecret(solanaKeypairPath, JSON.stringify(Array.from(solanaKeypair.secretKey)));

const addresses = {
  evmAddress: evmWallet.address,
  solanaAddress: solanaKeypair.publicKey.toBase58(),
  solanaKeypairPath,
};
writeFileSync(addressesPath, `${JSON.stringify(addresses, null, 2)}\n`, { mode: 0o600 });

const solanaStoreBytes32 =
  "0xabd6cbf832e08930187e4035cd6a320d21015e3d3c3c9c529c75e052a9cdadc6";

writeSecret(
  smartContractsEnvPath,
  [
    `PRIVATE_KEY=${evmPrivateKey.slice(2)}`,
    `OWNER_ADDRESS=${evmWallet.address}`,
    `CALLER_ADDRESS=${evmWallet.address}`,
    `RELAYER_ADDRESS=${evmWallet.address}`,
    "ETHERSCAN_API_KEY=",
    "ZKSYNC_SEPOLIA_RPC_URL=https://sepolia.era.zksync.dev",
    "BASE_SEPOLIA_RPC_URL=https://sepolia.base.org",
    "ZKSYNCSEPOLIATESTNET_ENDPOINT=0xe2Ef622A13e71D9Dd2BBd12cd4b27e1516FA8a09",
    "BASESEPOLIATESTNET_ENDPOINT=0x6EDCE65403992e310A62460808c4b910D972f10f",
    "HUB_EID=40305",
    "ZKSYNC_EID=40305",
    "SOLANA_EID=40168",
    "HUB_OUTBOUND_ROUTER_ADDRESS=",
    "HUB_INBOUND_INBOX_ADDRESS=",
    "DST_EID=40168",
    `DST_ENDPOINT_ADDRESS=${solanaStoreBytes32}`,
    "SRC_EID=40168",
    `TRUSTED_SOURCE_ENDPOINT_ADDRESS=${solanaStoreBytes32}`,
    "TARGET_CONTRACT=",
  ].join("\n") + "\n",
);

writeSecret(
  serviceEnvPath,
  [
    "GENLAYER_RPC_URL=https://studio.genlayer.com/api",
    `PRIVATE_KEY=${evmPrivateKey.slice(2)}`,
    "FORWARDER_NETWORK_RPC_URL=https://sepolia.era.zksync.dev",
    "ZKSYNC_RPC_URL=https://sepolia.era.zksync.dev",
    "HUB_OUTBOUND_ROUTER_ADDRESS=",
    "HUB_INBOUND_INBOX_ADDRESS=",
    "GENLAYER_OUTBOX_ADDRESS=",
    "GENLAYER_INBOX_ADDRESS=",
    'BRIDGE_SYNC_INTERVAL="*/5 * * * *"',
    'EVM_TO_GL_SYNC_INTERVAL="*/1 * * * *"',
  ].join("\n") + "\n",
);

writeSecret(
  solanaEnvPath,
  [
    "SOLANA_RPC_URL=https://api.devnet.solana.com",
    "ANCHOR_PROVIDER_URL=https://api.devnet.solana.com",
    `SOLANA_KEYPAIR_PATH=${solanaKeypairPath}`,
    `ANCHOR_WALLET=${solanaKeypairPath}`,
    "SOLANA_PROGRAM_KEYPAIR_PATH=target/deploy/bridge_endpoint-keypair.json",
    "SOLANA_PROGRAM_SO_PATH=target/deploy/bridge_endpoint.so",
    "SOLANA_DEPLOY_BUFFER_KEYPAIR_PATH=../../.testnet-keys/solana-deploy-buffer.json",
    "LAYERZERO_SOLANA_ENDPOINT_PROGRAM_ID=76y77prsiCMvXMjuoZ5VRrhG5qYBrUMYTE5WgHqgjEn6",
    "SOLANA_EID=40168",
    "HUB_EID=40305",
    "HUB_OUTBOUND_ROUTER_ADDRESS=",
    "HUB_INBOUND_INBOX_ADDRESS=",
    "SOLANA_REGISTER_TEST_RECEIVER=1",
    "SOLANA_TEST_RECEIVER_TARGET=",
    "SOLANA_TEST_RECEIVER_MODE=1",
  ].join("\n") + "\n",
);

console.log(`EVM address: ${evmWallet.address}`);
console.log(`Solana devnet address: ${solanaKeypair.publicKey.toBase58()}`);
console.log(`Solana keypair path: ${solanaKeypairPath}`);
console.log(`Local address record: ${addressesPath}`);
console.log("Private key material was written only to ignored local files.");

function writeSecret(path, content) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, { mode: 0o600 });
  chmodSync(path, 0o600);
}
