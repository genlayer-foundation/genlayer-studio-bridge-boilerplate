#!/usr/bin/env npx tsx
/**
 * Deploy StringReceiverIC intelligent contract to GenLayer.
 *
 * Usage:
 *   export PRIVATE_KEY=0x... GENLAYER_RPC_URL=https://studio-stage.genlayer.com/api
 *   npx tsx deploy-string-receiver-ic.ts --bridge-receiver <bridge_receiver_address>
 */

import { readFileSync } from 'fs';
import { createAccount, createClient } from 'genlayer-js';
import { localnet } from 'genlayer-js/chains';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// GenLayer BridgeReceiver address
const DEFAULT_BRIDGE_RECEIVER = '0x7382c2e881f3b4E70cE1158CFFd38DcA2667c91F';

function parseArgs(): { bridgeReceiver: string } {
  const args = process.argv.slice(2);
  const index = args.findIndex((arg) => arg === '--bridge-receiver');
  const bridgeReceiver = index !== -1 ? args[index + 1] : DEFAULT_BRIDGE_RECEIVER;
  return { bridgeReceiver };
}

async function main(): Promise<void> {
  const { bridgeReceiver } = parseArgs();

  console.log('🚀 Deploying StringReceiverIC to GenLayer...\n');

  const privateKey = process.env.PRIVATE_KEY;
  const rpcUrl = process.env.GENLAYER_RPC_URL || 'https://studio-stage.genlayer.com/api';

  if (!privateKey) {
    throw new Error('Missing PRIVATE_KEY environment variable');
  }

  console.log('Configuration:');
  console.log(`  RPC URL: ${rpcUrl}`);
  console.log(`  Bridge Receiver: ${bridgeReceiver}`);
  console.log();

  const account = createAccount(privateKey as `0x${string}`);
  const client = createClient({
    chain: localnet,
    account,
    endpoint: rpcUrl,
  });

  const contractPath = path.resolve(__dirname, '../intelligent-contracts/StringReceiverIC.py');
  const contractCode = readFileSync(contractPath, 'utf-8');

  console.log('📄 Deploying contract...');

  const hash = await client.deployContract({
    code: contractCode,
    args: [bridgeReceiver],
  });

  console.log(`  Transaction hash: ${hash}`);
  console.log('  Waiting for confirmation...');

  const receipt = await client.waitForTransactionReceipt({
    hash,
    status: 'ACCEPTED',
    retries: 30,
  });

  const contractAddress =
    receipt.data?.contract_address ||
    receipt.consensus_data?.leader_receipt?.[0]?.execution_result;

  if (!contractAddress) {
    throw new Error('Failed to get contract address from receipt');
  }

  console.log('\n✅ StringReceiverIC deployed successfully!');
  console.log(`  Contract address: ${contractAddress}`);
  console.log(`  Bridge Receiver: ${bridgeReceiver}`);

  console.log('\n📝 Next steps:');
  console.log('  1. Update StringSenderEvm on Base to target this contract:');
  console.log(`     await stringSenderEvm.setTargetContract("${contractAddress}")`);
  console.log('  2. Send a string from Base');
  console.log('  3. Wait for bridge service to relay');
  console.log('  4. Call claim_messages() on StringReceiverIC to receive');
}

main().catch((error) => {
  console.error('\n❌ Deployment failed:', error);
  process.exit(1);
});
