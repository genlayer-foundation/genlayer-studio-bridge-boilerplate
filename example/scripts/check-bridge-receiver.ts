#!/usr/bin/env npx tsx
import { createAccount, createClient } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';

const privateKey = process.env.PRIVATE_KEY;
const rpcUrl = process.env.GENLAYER_RPC_URL || 'https://studio.genlayer.com/api';
const bridgeReceiverAddress = process.env.BRIDGE_RECEIVER_IC_ADDRESS;

if (!privateKey) {
  throw new Error('Missing PRIVATE_KEY env var');
}
if (!bridgeReceiverAddress) {
  throw new Error('Missing BRIDGE_RECEIVER_IC_ADDRESS env var');
}

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
  const messageId = '0x9bc21d0904dd332a5015eec4a8c83ec448045e5c0112e5b17c19e18512e6e5de';
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
