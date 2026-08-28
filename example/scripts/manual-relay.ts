#!/usr/bin/env npx tsx
import { createAccount, createClient } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';

const privateKey = process.env.PRIVATE_KEY;
const rpcUrl = process.env.GENLAYER_RPC_URL;
const bridgeReceiverAddress = process.env.BRIDGE_RECEIVER_IC_ADDRESS;

if (!privateKey) {
  throw new Error('Missing PRIVATE_KEY env var');
}
if (!bridgeReceiverAddress) {
  throw new Error('Missing BRIDGE_RECEIVER_IC_ADDRESS env var');
}
if (!rpcUrl) throw new Error('Missing GENLAYER_RPC_URL env var');

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
  // Get params from env or CLI args
  const messageId = process.env.MESSAGE_ID || process.argv[2];
  const srcChainIdValue = process.env.SOURCE_CHAIN_ID || process.argv[3];
  const srcChainId = Number(srcChainIdValue);
  const srcSender = process.env.OWNER_ADDRESS || process.argv[4];
  const targetContract = process.env.TARGET_CONTRACT || process.argv[5];
  const dataHex = process.env.MESSAGE_DATA || process.argv[6];

  if (!messageId || !Number.isSafeInteger(srcChainId) || srcChainId <= 0 || !srcSender || !targetContract || !dataHex) {
    console.error('Usage: manual-relay.ts <messageId> <sourceChainId> <srcSender> <targetContract> <dataHex>');
    console.error('Or set MESSAGE_ID, SOURCE_CHAIN_ID, OWNER_ADDRESS, TARGET_CONTRACT, MESSAGE_DATA env vars');
    process.exit(1);
  }

  const data = new Uint8Array(Buffer.from(dataHex.replace(/^0x/, ''), 'hex'));

  console.log('Manually calling BridgeReceiver.receive_message()');
  console.log('  Address:', bridgeReceiverAddress);
  console.log('  Message ID:', messageId);
  console.log('  Source Chain:', srcChainId);
  console.log('  Source Sender:', srcSender);
  console.log('  Target:', targetContract);
  console.log('  Data length:', data.length);

  try {
    const hash = await client.writeContract({
      address: bridgeReceiverAddress as `0x${string}`,
      functionName: 'receive_message',
      args: [messageId, srcChainId, srcSender, targetContract, data],
    });
    console.log('TX Hash:', hash);

    const receipt = await client.waitForTransactionReceipt({ hash, status: 'ACCEPTED', retries: 30 });
    console.log('Receipt status:', receipt.status);
    console.log('Receipt:', JSON.stringify(receipt, null, 2));
  } catch (error) {
    console.error('Error:', error);
  }
}

main();
