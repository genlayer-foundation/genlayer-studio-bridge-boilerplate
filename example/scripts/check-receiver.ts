#!/usr/bin/env npx tsx
import { createAccount, createClient } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';

const privateKey = process.env.PRIVATE_KEY;
const rpcUrl = process.env.GENLAYER_RPC_URL || 'https://studio.genlayer.com/api';
const stringReceiverAddress = process.env.STRING_RECEIVER_ADDRESS;

if (!privateKey) {
  throw new Error('Missing PRIVATE_KEY env var');
}
if (!stringReceiverAddress) {
  throw new Error('Missing STRING_RECEIVER_ADDRESS env var');
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
  console.log('Checking StringReceiverIC:', stringReceiverAddress);

  const strings = await client.readContract({
    address: stringReceiverAddress as `0x${string}`,
    functionName: 'get_received_strings',
    args: [],
    stateStatus: 'accepted',
  });
  console.log('Received strings:', strings);

  const count = await client.readContract({
    address: stringReceiverAddress as `0x${string}`,
    functionName: 'get_received_count',
    args: [],
    stateStatus: 'accepted',
  });
  console.log('Count:', count);

  const config = await client.readContract({
    address: stringReceiverAddress as `0x${string}`,
    functionName: 'get_config',
    args: [],
    stateStatus: 'accepted',
  });
  console.log('Config:', config);

  // Check if our wallet is authorized as relayer
  try {
    const isAuthorized = await client.readContract({
      address: stringReceiverAddress as `0x${string}`,
      functionName: 'is_relayer_authorized',
      args: [account.address],
      stateStatus: 'accepted',
    });
    console.log('Our wallet authorized:', isAuthorized);
  } catch (e) {
    console.log('is_relayer_authorized not available (old contract version)');
  }
}

main().catch(console.error);
