#!/usr/bin/env npx tsx
import { createAccount, createClient } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';

const privateKey = process.env.PRIVATE_KEY;
const rpcUrl = process.env.GENLAYER_RPC_URL;
const bridgeReceiverAddress = process.env.BRIDGE_RECEIVER_IC_ADDRESS;
const messageId = process.env.MESSAGE_ID;

if (!privateKey) {
  throw new Error('Missing PRIVATE_KEY env var');
}
if (!bridgeReceiverAddress) {
  throw new Error('Missing BRIDGE_RECEIVER_IC_ADDRESS env var');
}
if (!rpcUrl) throw new Error('Missing GENLAYER_RPC_URL env var');
if (!messageId) throw new Error('Missing MESSAGE_ID env var');

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

async function main() {
  console.log('Checking BridgeReceiver:', bridgeReceiverAddress);

  // Check latest message
  const isProcessed = await client.readContract({
    address: bridgeReceiverAddress as `0x${string}`,
    functionName: 'is_message_processed',
    args: [messageId],
    stateStatus: 'accepted',
  });
  console.log('Message', messageId);
  console.log('  is_message_processed:', isProcessed);

  // Get message details
  const message = await client.readContract({
    address: bridgeReceiverAddress as `0x${string}`,
    functionName: 'get_message',
    args: [messageId],
    stateStatus: 'accepted',
  });
  console.log('  get_message:', message);
}

main().catch(console.error);
