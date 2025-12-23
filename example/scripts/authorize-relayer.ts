#!/usr/bin/env npx tsx
import { createAccount, createClient } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';

const privateKey = process.env.PRIVATE_KEY;
const rpcUrl = process.env.GENLAYER_RPC_URL || 'https://studio.genlayer.com/api';

if (!privateKey) {
  throw new Error('Missing PRIVATE_KEY env var');
}

const account = createAccount(privateKey as `0x${string}`);
console.log('Wallet address:', account.address);

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
  const bridgeReceiverAddress = process.env.BRIDGE_RECEIVER_IC_ADDRESS;
  if (!bridgeReceiverAddress) {
    throw new Error('Missing BRIDGE_RECEIVER_IC_ADDRESS env var');
  }
  console.log('BridgeReceiver:', bridgeReceiverAddress);

  const hash = await client.writeContract({
    address: bridgeReceiverAddress as `0x${string}`,
    functionName: 'set_authorized_relayer',
    args: [account.address, true],
  });
  console.log('TX:', hash);
  const receipt = await client.waitForTransactionReceipt({ hash, status: 'ACCEPTED' });
  console.log('Status:', receipt.status);
  console.log('Done - relayer authorized');
}

main().catch(console.error);
