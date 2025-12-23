#!/usr/bin/env npx tsx
/**
 * Send a test string message from GenLayer StringSender.
 *
 * Usage:
 *   export PRIVATE_KEY=0x... GENLAYER_RPC_URL=https://studio.genlayer.com/api
 *   npx tsx send-test-string.ts --address <StringSender_address> --message "Hello Base!"
 */

import { createAccount, createClient } from 'genlayer-js';
import { localnet } from 'genlayer-js/chains';

function parseArgs(): { address: string; message: string } {
  const args = process.argv.slice(2);
  const addressIndex = args.findIndex((arg) => arg === '--address');
  const messageIndex = args.findIndex((arg) => arg === '--message');

  const address = addressIndex !== -1 ? args[addressIndex + 1] : null;
  const message = messageIndex !== -1 ? args[messageIndex + 1] : 'Hello Base from GenLayer!';

  if (!address) {
    console.error('❌ Missing required argument: --address <StringSender_address>');
    process.exit(1);
  }

  return { address, message };
}

async function main(): Promise<void> {
  const { address, message } = parseArgs();

  const privateKey = process.env.PRIVATE_KEY;
  const rpcUrl = process.env.GENLAYER_RPC_URL || 'https://studio.genlayer.com/api';

  if (!privateKey) {
    throw new Error('Missing PRIVATE_KEY environment variable');
  }

  console.log('📤 Sending string message...\n');
  console.log(`  StringSender: ${address}`);
  console.log(`  Message: "${message}"`);
  console.log(`  RPC: ${rpcUrl}\n`);

  const account = createAccount(privateKey as `0x${string}`);
  const client = createClient({
    chain: localnet,
    account,
    endpoint: rpcUrl,
  });

  const hash = await client.writeContract({
    address: address as `0x${string}`,
    functionName: 'send_string',
    args: [message],
  });

  console.log(`  Transaction: ${hash}`);
  console.log('  Waiting for acceptance...');

  const receipt = await client.waitForTransactionReceipt({
    hash,
    status: 'ACCEPTED',
    retries: 30,
  });

  console.log('\n✅ Message sent successfully!');
  console.log(`  Status: ${receipt.status}`);
  console.log('\n📝 Next: Run bridge service to relay the message');
}

main().catch((error) => {
  console.error('\n❌ Failed:', error);
  process.exit(1);
});
