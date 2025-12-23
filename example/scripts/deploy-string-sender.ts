#!/usr/bin/env npx tsx
/**
 * Deploy StringSender intelligent contract to GenLayer.
 *
 * Prerequisites:
 * - BridgeSender must be deployed on GenLayer
 * - StringReceiver must be deployed on Base Sepolia
 *
 * Usage:
 *   cd bridge/example/scripts
 *   npx tsx deploy-string-sender.ts \
 *     --bridge-sender <bridge_sender_address> \
 *     --target-contract <string_receiver_address>
 *
 * Environment variables:
 *   GENLAYER_RPC_URL - GenLayer RPC endpoint (default: https://studio.genlayer.com/api)
 *   PRIVATE_KEY - Deployer private key
 */

import { config } from 'dotenv';
import { readFileSync } from 'fs';
import { createAccount, createClient } from 'genlayer-js';
import { localnet } from 'genlayer-js/chains';
import path from 'path';
import { fileURLToPath } from 'url';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
config({ path: path.resolve(__dirname, '../../../service/.env') });

// LayerZero Endpoint ID for Base Sepolia
const BASE_SEPOLIA_LZ_EID = 40245;

interface DeploymentResult {
  contractAddress: string;
  transactionHash: string;
  config: {
    bridgeSenderAddress: string;
    targetChainEid: number;
    targetContract: string;
  };
}

function parseArgs(): { bridgeSender: string; targetContract: string } {
  const args = process.argv.slice(2);

  const bridgeSenderIndex = args.findIndex((arg) => arg === '--bridge-sender');
  const targetContractIndex = args.findIndex(
    (arg) => arg === '--target-contract',
  );

  const bridgeSender =
    bridgeSenderIndex !== -1 ? args[bridgeSenderIndex + 1] : null;
  const targetContract =
    targetContractIndex !== -1 ? args[targetContractIndex + 1] : null;

  if (!bridgeSender) {
    console.error('❌ Missing required argument: --bridge-sender <address>');
    console.error('\nUsage:');
    console.error(
      '  npx tsx deploy-string-sender.ts --bridge-sender <addr> --target-contract <addr>',
    );
    process.exit(1);
  }

  if (!targetContract) {
    console.error(
      '❌ Missing required argument: --target-contract <address>',
    );
    console.error('\nUsage:');
    console.error(
      '  npx tsx deploy-string-sender.ts --bridge-sender <addr> --target-contract <addr>',
    );
    process.exit(1);
  }

  return { bridgeSender, targetContract };
}

async function main(): Promise<void> {
  const { bridgeSender, targetContract } = parseArgs();

  console.log('🚀 Deploying StringSender to GenLayer...\n');

  // Validate environment
  const privateKey = process.env.PRIVATE_KEY;
  const rpcUrl = process.env.GENLAYER_RPC_URL || 'https://studio.genlayer.com/api';

  if (!privateKey) {
    throw new Error('Missing required environment variable: PRIVATE_KEY');
  }

  console.log('Configuration:');
  console.log(`  RPC URL: ${rpcUrl}`);
  console.log(`  Bridge Sender: ${bridgeSender}`);
  console.log(`  Target Chain EID: ${BASE_SEPOLIA_LZ_EID} (Base Sepolia)`);
  console.log(`  Target Contract: ${targetContract}`);
  console.log();

  // Create GenLayer client
  const account = createAccount(privateKey as `0x${string}`);
  const client = createClient({
    chain: localnet,
    account,
    endpoint: rpcUrl,
  });

  // Read the contract code
  const contractPath = path.resolve(
    __dirname,
    '../intelligent-contracts/StringSender.py',
  );
  const contractCode = readFileSync(contractPath, 'utf-8');

  console.log('📄 Deploying contract...');

  // Deploy the contract
  const hash = await client.deployContract({
    code: contractCode,
    args: [bridgeSender, BASE_SEPOLIA_LZ_EID, targetContract],
  });

  console.log(`  Transaction hash: ${hash}`);
  console.log('  Waiting for confirmation...');

  // Wait for the transaction to be accepted
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

  const result: DeploymentResult = {
    contractAddress,
    transactionHash: hash,
    config: {
      bridgeSenderAddress: bridgeSender,
      targetChainEid: BASE_SEPOLIA_LZ_EID,
      targetContract,
    },
  };

  console.log('\n✅ StringSender deployed successfully!');
  console.log('\nDeployment Result:');
  console.log(JSON.stringify(result, null, 2));

  console.log('\n📝 Next steps:');
  console.log('  1. Use the StringSender to send a message:');
  console.log(`     await client.writeContract({`);
  console.log(`       address: "${contractAddress}",`);
  console.log(`       functionName: "send_string",`);
  console.log(`       args: ["Hello from GenLayer!"]`);
  console.log(`     })`);
  console.log('  2. Wait for the bridge service to relay the message');
  console.log('  3. Check the StringReceiver on Base Sepolia for the message');
}

main().catch((error) => {
  console.error('\n❌ Deployment failed:', error);
  process.exit(1);
});
