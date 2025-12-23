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
  chain: { ...studionet, rpcUrls: { default: { http: [rpcUrl] } } },
  account,
});

async function main() {
  const owner = await client.readContract({
    address: bridgeReceiverAddress as `0x${string}`,
    functionName: 'get_owner',
    args: [],
    stateStatus: 'accepted',
  });
  console.log('BridgeReceiver owner:', owner);
  console.log('Our wallet:', account.address);
  
  const isAuthorized = await client.readContract({
    address: bridgeReceiverAddress as `0x${string}`,
    functionName: 'is_relayer_authorized',
    args: [account.address],
    stateStatus: 'accepted',
  });
  console.log('Is our wallet authorized:', isAuthorized);
}

main().catch(console.error);
