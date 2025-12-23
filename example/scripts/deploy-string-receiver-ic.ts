#!/usr/bin/env npx tsx
/**
 * Deploy StringReceiverIC intelligent contract to GenLayer.
 *
 * Usage:
 *   export PRIVATE_KEY=0x... GENLAYER_RPC_URL=https://studio.genlayer.com/api
 *   npx tsx deploy-string-receiver-ic.ts --bridge-receiver <BridgeReceiver_address>
 */

import { readFileSync } from 'fs';
import { createAccount, createClient } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function parseArgs(): { bridgeReceiver: string } {
  const args = process.argv.slice(2);
  const bridgeReceiverIndex = args.findIndex((arg) => arg === '--bridge-receiver');
  const bridgeReceiver = bridgeReceiverIndex !== -1 ? args[bridgeReceiverIndex + 1] : null;

  if (!bridgeReceiver) {
    console.error('❌ Missing required argument: --bridge-receiver <BridgeReceiver_address>');
    process.exit(1);
  }

  return { bridgeReceiver };
}

async function main(): Promise<void> {
  const { bridgeReceiver } = parseArgs();

  console.log('🚀 Deploying StringReceiverIC to GenLayer...\n');

  const privateKey = process.env.PRIVATE_KEY;
  const rpcUrl = process.env.GENLAYER_RPC_URL || 'https://studio.genlayer.com/api';

  if (!privateKey) {
    throw new Error('Missing PRIVATE_KEY environment variable');
  }

  console.log('Configuration:');
  console.log(`  RPC URL: ${rpcUrl}`);
  console.log(`  BridgeReceiver: ${bridgeReceiver}`);
  console.log();

  const account = createAccount(privateKey as `0x${string}`);
  const client = createClient({
    chain: {
      ...studionet,
      rpcUrls: {
        default: { http: [rpcUrl] },
      },
    },
    account,
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

  console.log('\n📝 Next steps:');
  console.log('  1. Ensure BridgeReceiver has authorized the service wallet as relayer');
  console.log('  2. Update StringSenderEvm on Base to target this contract');
  console.log('  3. Send a string from Base');
  console.log('  4. Bridge service calls BridgeReceiver.receive_message()');
  console.log('  5. BridgeReceiver dispatches to this contract via process_bridge_message()');
}

main().catch((error) => {
  console.error('\n❌ Deployment failed:', error);
  process.exit(1);
});
