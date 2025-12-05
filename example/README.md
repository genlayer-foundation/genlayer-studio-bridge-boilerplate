# Bridge Example: Bidirectional String Messaging

This example demonstrates **bidirectional** string messaging between GenLayer and EVM chains (Base Sepolia) using the GenLayer Bridge infrastructure.

- **GenLayer → EVM**: StringSender.py → BridgeSender → Service → BridgeForwarder → LayerZero → BridgeReceiver → StringReceiver.sol
- **EVM → GenLayer**: StringSenderEvm.sol → BridgeSender.sol → LayerZero → BridgeReceiver.sol → Service → BridgeReceiver.py → StringReceiverIC.py

---

## Direction 1: GenLayer → EVM (Base Sepolia)

This section demonstrates how to send a simple string message from GenLayer to Base Sepolia using the GenLayer Bridge infrastructure.

## Architecture

This example follows the **exact same pattern** used by `CampaignIC.py` in the dKOL project:

```
GenLayer                                                     Base Sepolia
┌──────────────────┐                                        ┌──────────────────┐
│ StringSender.py  │                                        │                  │
│ (this example)   │                                        │                  │
│                  │    ┌─────────────┐                     │                  │
│ send_string() ───┼───▶│ BridgeSender│                     │                  │
│                  │    │ (existing)  │                     │                  │
└──────────────────┘    └──────┬──────┘                     │                  │
                               │                            │                  │
                               ▼                            │                  │
                        ┌─────────────┐                     │                  │
                        │BridgeService│─────────relay──────▶│ BridgeReceiver   │
                        │ (existing)  │                     │ (existing)       │
                        └─────────────┘                     │        │         │
                                                            │        ▼         │
                                                            │ StringReceiver   │
                                                            │ (this example)   │
                                                            └──────────────────┘
```

**Key Pattern:** `StringSender` directly calls `BridgeSender.send_message()` using `gl.get_contract_at()` -
the same pattern used by `CampaignIC.bridge_period_distribution()`.

## Prerequisites

Before running this example, ensure the following bridge infrastructure is deployed:

1. **GenLayer**:
   - BridgeSender IC deployed and address known

2. **Base Sepolia**:
   - BridgeReceiver contract deployed
   - BridgeForwarder trusted by BridgeReceiver

3. **Bridge Service**:
   - Running and configured to relay messages from GenLayer to Base Sepolia

## Quick Start

### Step 1: Deploy StringReceiver to Base Sepolia

```bash
# Navigate to the example smart-contracts directory
cd bridge/example/smart-contracts

# Install dependencies (first time only)
npm install

# Set environment variables in bridge/smart-contracts/.env or export them:
export BRIDGE_RECEIVER_ADDRESS=<your_bridge_receiver_address>
export PRIVATE_KEY=<your_deployer_private_key>

# Deploy to Base Sepolia
npm run deploy:base-sepolia
```

Note the deployed `StringReceiver` address from the output.

### Step 2: Deploy StringSender to GenLayer

```bash
# Navigate to the example scripts directory
cd bridge/example/scripts

# Set environment variables
export PRIVATE_KEY=<your_deployer_private_key>
export GENLAYER_RPC_URL=<your_genlayer_rpc_url>  # Optional, defaults to http://localhost:4000/api

# Deploy to GenLayer
npx tsx deploy-string-sender.ts \
  --bridge-sender <bridge_sender_address> \
  --target-contract <string_receiver_address_from_step_1>
```

### Step 3: Send a String

Using genlayer-js:

```typescript
import { createAccount, createClient } from 'genlayer-js';
import { localnet } from 'genlayer-js/chains';

const client = createClient({
  chain: localnet,
  account: createAccount(privateKey),
  endpoint: 'http://localhost:4000/api',
});

// Send a string message (same pattern as calling CampaignIC methods)
const hash = await client.writeContract({
  address: '<string_sender_address>',
  functionName: 'send_string',
  args: ['Hello from GenLayer!'],
});

console.log('Transaction hash:', hash);

// Wait for confirmation
const receipt = await client.waitForTransactionReceipt({
  hash,
  status: 'ACCEPTED',
  retries: 30,
});

console.log('Message sent! Bridge service will relay it within ~5 minutes');
```

This mirrors how the dKOL backend calls `bridge_period_distribution()` on campaigns.

### Step 4: Verify Receipt on Base Sepolia

After the bridge service relays the message (~5 minutes):

```typescript
import { ethers } from 'ethers';

const provider = new ethers.JsonRpcProvider('https://sepolia.base.org');
const receiver = new ethers.Contract(
  '<string_receiver_address>',
  ['function getAllMessages() view returns (string[])', 'function getLatestMessage() view returns (string)'],
  provider,
);

// Get all received messages
const messages = await receiver.getAllMessages();
console.log('Received messages:', messages);

// Or get just the latest
const latest = await receiver.getLatestMessage();
console.log('Latest message:', latest);
```

## Contracts

### StringSender.py (GenLayer)

An intelligent contract that follows the same pattern as `CampaignIC.py`:
- Stores configuration for the bridge sender and target contract
- ABI-encodes strings using `genvm_eth.MethodEncoder`
- Calls `BridgeSender.send_message()` via `gl.get_contract_at().emit().send_message()`
- Tracks all sent strings

**Key Methods**:
- `send_string(message: str)`: Send a string to the target chain
- `get_sent_strings() -> list[str]`: Get all sent strings
- `get_sent_count() -> int`: Get count of sent strings
- `set_bridge_sender(address: str)`: Update bridge sender (owner only)
- `set_target(chain_eid: int, contract: str)`: Update target (owner only)
- `get_config() -> dict`: Get current configuration

### StringReceiver.sol (Base Sepolia)

A Solidity contract that:
- Implements `IGenLayerBridgeReceiver` interface
- Receives bridged messages from BridgeReceiver
- Stores strings in an array
- Emits events on receipt

**Key Methods**:
- `processBridgeMessage(...)`: Called by BridgeReceiver (do not call directly)
- `getMessageCount() -> uint256`: Get number of received messages
- `getMessage(uint256 index) -> string`: Get message by index
- `getAllMessages() -> string[]`: Get all messages
- `getLatestMessage() -> string`: Get most recent message

## Configuration

### LayerZero Endpoint IDs

| Chain | LayerZero EID |
|-------|---------------|
| Base Sepolia | 40245 |
| Base Mainnet | 30184 |
| zkSync Sepolia | 40305 |
| zkSync Mainnet | 30165 |

### Environment Variables

**For GenLayer deployment** (`bridge/service/.env`):
```
PRIVATE_KEY=0x...
GENLAYER_RPC_URL=http://localhost:4000/api
```

**For Base Sepolia deployment** (`bridge/smart-contracts/.env`):
```
PRIVATE_KEY=0x...
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
BRIDGE_RECEIVER_ADDRESS=0x...
```

## Troubleshooting

### Message not arriving on Base Sepolia

1. **Check BridgeSender has the message**:
   ```python
   bridge_sender.get_message_hashes()  # Should include your message hash
   ```

2. **Check bridge service is running**:
   - Service polls every 5 minutes by default
   - Check logs for relay attempts

3. **Verify trust relationships**:
   - BridgeReceiver must trust the BridgeForwarder
   - Check `trustedForwarders` mapping on BridgeReceiver

### Contract verification failed

If automatic verification fails, verify manually:

```bash
cd bridge/smart-contracts
npx hardhat verify --network baseSepoliaTestnet \
  <string_receiver_address> \
  <bridge_receiver_address>
```

## File Structure

```
bridge/example/
├── README.md                           # This file
├── intelligent-contracts/
│   ├── StringSender.py                 # GenLayer IC that sends strings TO EVM
│   └── StringReceiverIC.py             # GenLayer IC that receives strings FROM EVM
├── smart-contracts/
│   ├── hardhat.config.ts               # Hardhat configuration for the example
│   ├── package.json                    # Dependencies for smart contract deployment
│   └── contracts/
│       ├── StringReceiver.sol          # EVM contract that receives strings FROM GenLayer
│       ├── StringSenderEvm.sol         # EVM contract that sends strings TO GenLayer
│       └── interfaces/
│           ├── IGenLayerBridgeReceiver.sol # Interface for receiving GenLayer messages
│           └── IBridgeSender.sol       # Interface for sending to GenLayer
├── scripts/
│   ├── deploy-string-sender.ts         # Deploy IC to GenLayer
│   └── deploy-string-receiver.ts       # Deploy contract to Base Sepolia
└── deployments/                        # Created after deployment
    └── stringReceiver-baseSepoliaTestnet-84532.json
```

---

## Direction 2: EVM → GenLayer

This section demonstrates how to send a string message from EVM (Base Sepolia) to GenLayer.

### Architecture (EVM → GenLayer)

```
Base Sepolia                                                     GenLayer
┌──────────────────┐                                        ┌──────────────────┐
│ StringSenderEvm  │                                        │                  │
│ (this example)   │                                        │                  │
│                  │    ┌─────────────┐                     │                  │
│ sendString() ────┼───▶│ BridgeSender│                     │                  │
│                  │    │  (.sol)     │                     │                  │
└──────────────────┘    └──────┬──────┘                     │                  │
                               │ LayerZero                  │                  │
                               ▼                            │                  │
                        ┌─────────────┐                     │                  │
                        │BridgeReceiver│                    │                  │
                        │  (zkSync)   │                     │                  │
                        └──────┬──────┘                     │                  │
                               │ emits event                │                  │
                               ▼                            │                  │
                        ┌─────────────┐                     │                  │
                        │BridgeService│─────────relay──────▶│ BridgeReceiver   │
                        │ (polls)     │                     │   (.py)          │
                        └─────────────┘                     │        │         │
                                                            │        ▼         │
                                                            │ StringReceiverIC │
                                                            │ (this example)   │
                                                            └──────────────────┘
```

### Prerequisites (EVM → GenLayer)

1. **GenLayer**:
   - BridgeReceiver.py IC deployed
   - StringReceiverIC.py deployed and configured with BridgeReceiver address
   - BridgeReceiver must have the service wallet authorized as a relayer

2. **zkSync**:
   - BridgeReceiver.sol deployed (extended with MessageForGenLayer event)
   - Trusted forwarder configured for Base's BridgeSender

3. **Base Sepolia**:
   - BridgeSender.sol deployed
   - StringSenderEvm.sol deployed with BridgeSender address

4. **Bridge Service**:
   - Running with EVM→GL bridging enabled
   - Configured with zkSync BridgeReceiver address and GenLayer BridgeReceiver IC address

### Quick Start (EVM → GenLayer)

#### Step 1: Deploy StringReceiverIC to GenLayer

```python
# Using genlayer-js or GenLayer Studio
from genlayer import *

# Deploy StringReceiverIC with BridgeReceiver address
receiver = StringReceiverIC(bridge_receiver="<bridge_receiver_ic_address>")
```

#### Step 2: Deploy StringSenderEvm to Base Sepolia

```bash
# Set environment variables
export BRIDGE_SENDER_ADDRESS=<bridge_sender_sol_address>
export TARGET_CONTRACT=<string_receiver_ic_address>

# Deploy
npx hardhat run scripts/deploy-string-sender-evm.ts --network baseSepoliaTestnet
```

#### Step 3: Send a String from EVM

```typescript
import { ethers } from 'ethers';
import { Options } from '@layerzerolabs/lz-v2-utilities';

const provider = new ethers.JsonRpcProvider('https://sepolia.base.org');
const wallet = new ethers.Wallet(privateKey, provider);

const stringSender = new ethers.Contract(
  '<string_sender_evm_address>',
  [
    'function sendString(string calldata _message, bytes calldata _options) external payable returns (bytes32)',
    'function quoteSendString(string calldata _message, bytes calldata _options) external view returns (uint256, uint256)',
  ],
  wallet
);

// Build LayerZero options
const options = Options.newOptions()
  .addExecutorLzReceiveOption(1_000_000, 0)
  .toHex();

// Get fee quote
const [nativeFee] = await stringSender.quoteSendString('Hello GenLayer!', options);

// Send the string
const tx = await stringSender.sendString('Hello GenLayer!', options, { value: nativeFee });
const receipt = await tx.wait();

console.log('Message sent! TX:', receipt.hash);
console.log('Bridge service will relay it within ~1 minute');
```

#### Step 4: Verify Receipt on GenLayer

After the bridge service relays the message:

```typescript
import { createClient } from 'genlayer-js';

const client = createClient({ /* ... */ });

// Get received strings
const strings = await client.readContract({
  address: '<string_receiver_ic_address>',
  functionName: 'get_received_strings',
  args: [],
});

console.log('Received strings:', strings);
```

### Contracts (EVM → GenLayer)

#### StringSenderEvm.sol (Base Sepolia)

A Solidity contract that:
- Sends strings to GenLayer via BridgeSender.sol
- Tracks all sent strings
- Provides fee quotes

**Key Methods**:
- `sendString(string, bytes options)`: Send a string to GenLayer
- `quoteSendString(string, bytes options)`: Get fee quote
- `getSentStrings()`: Get all sent strings
- `getSentCount()`: Get count of sent strings

#### StringReceiverIC.py (GenLayer)

An intelligent contract that:
- Implements `process_bridge_message()` pattern
- Receives strings from EVM chains via BridgeReceiver.py
- Tracks received strings with source info

**Key Methods**:
- `process_bridge_message(chain_id, sender, message)`: Called by BridgeReceiver
- `get_received_strings()`: Get all received strings
- `get_received_count()`: Get count of received strings
- `get_message_source(index)`: Get source info for a message

### Environment Variables (EVM → GenLayer)

**For Bridge Service** (`bridge/service/.env`):
```env
# EVM -> GenLayer configuration
BRIDGE_RECEIVER_IC_ADDRESS=0x...       # GenLayer BridgeReceiver.py address
ZKSYNC_BRIDGE_RECEIVER_ADDRESS=0x...   # zkSync BridgeReceiver.sol address
ZKSYNC_RPC_URL=https://sepolia.era.zksync.dev
EVM_TO_GL_SYNC_INTERVAL=*/1 * * * *    # Poll every minute
```
