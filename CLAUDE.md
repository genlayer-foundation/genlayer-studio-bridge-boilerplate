# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Bidirectional cross-chain messaging bridge between GenLayer and EVM chains (Base, zkSync) using LayerZero V2. zkSync serves as the hub chain for both directions.

## Architecture

```
GenLayer → EVM:
  GenLayer BridgeSender.py → Service polls → zkSync BridgeForwarder → LayerZero → Target EVM

EVM → GenLayer:
  EVM BridgeSender.sol → LayerZero → zkSync BridgeReceiver (stores) → Service polls → GenLayer BridgeReceiver.py → Target IC claims
```

## Directory Structure

- `/smart-contracts` - Solidity contracts for EVM chains (Hardhat)
- `/intelligent-contracts` - Python contracts for GenLayer
- `/service` - Node.js relay service that polls and relays messages
- `/example` - Complete bidirectional example with StringSender/StringReceiver

## Key Contracts

| Contract              | Chain    | Purpose                               |
| --------------------- | -------- | ------------------------------------- |
| `BridgeSender.py`     | GenLayer | Stores outbound GL→EVM messages       |
| `BridgeReceiver.py`   | GenLayer | Receives EVM→GL messages (PULL model) |
| `BridgeForwarder.sol` | zkSync   | Relays GL→EVM via LayerZero           |
| `BridgeReceiver.sol`  | zkSync   | Stores EVM→GL messages for polling    |
| `BridgeSender.sol`    | Base/EVM | Entry point for EVM→GL messages       |

## Commands

### Smart Contracts

```bash
cd smart-contracts

# Compile
npx hardhat compile

# Run tests
npx hardhat test

# Deploy (unified script)
CONTRACT=receiver npx hardhat run scripts/deploy.ts --network zkSyncSepoliaTestnet
CONTRACT=forwarder npx hardhat run scripts/deploy.ts --network zkSyncSepoliaTestnet
CONTRACT=sender npx hardhat run scripts/deploy.ts --network baseSepoliaTestnet

# Configure (unified script)
ACTION=set-trusted-forwarder npx hardhat run scripts/configure.ts --network zkSyncSepoliaTestnet
ACTION=set-authorized-relayer npx hardhat run scripts/configure.ts --network zkSyncSepoliaTestnet
ACTION=set-bridge-address npx hardhat run scripts/configure.ts --network zkSyncSepoliaTestnet
ACTION=set-sender-receiver npx hardhat run scripts/configure.ts --network baseSepoliaTestnet
```

### Bridge Service

```bash
cd service

npm run build    # Compile TypeScript
npm start        # Run service

# Debug CLI
npx ts-node cli.ts check-receiver    # Check zkSync BridgeReceiver state
npx ts-node cli.ts check-sender      # Check Base BridgeSender state
npx ts-node cli.ts check-forwarder   # Check zkSync BridgeForwarder state
npx ts-node cli.ts check-config      # Verify all configurations
npx ts-node cli.ts pending-messages  # List pending messages on zkSync
npx ts-node cli.ts debug-tx <hash>   # Debug a transaction
```

### Example Contracts

```bash
cd example

# Deploy StringSender to GenLayer
npx tsx scripts/deploy-string-sender.ts --bridge-sender <addr> --target-contract <addr>
```

## Key Design Patterns

1. **Stored Message Polling** - Both directions poll stored messages instead of events for reliability
2. **PULL Model for GenLayer** - Target ICs must call `claim_messages()` because GenLayer's `emit()` doesn't propagate state changes
3. **Authorized Relayers** - Bridge service wallet must be authorized on both BridgeReceiver contracts
4. **Replay Prevention** - `usedTxHash` mapping in BridgeForwarder, `received_messages` in BridgeReceiver.py

## LayerZero Endpoint IDs

```
zkSync Sepolia: 40305    Base Sepolia: 40245
zkSync Mainnet: 30165    Base Mainnet: 30184
```

## Environment Variables

### Service (`service/.env`)

```bash
# RPC URLs
FORWARDER_NETWORK_RPC_URL=https://sepolia.era.zksync.dev
GENLAYER_RPC_URL=https://studio-stage.genlayer.com/api
ZKSYNC_RPC_URL=https://sepolia.era.zksync.dev

# GenLayer → EVM contracts
BRIDGE_FORWARDER_ADDRESS=0x...
BRIDGE_SENDER_ADDRESS=0x...

# EVM → GenLayer contracts
BRIDGE_RECEIVER_IC_ADDRESS=0x...
ZKSYNC_BRIDGE_RECEIVER_ADDRESS=0x...

# Auth
PRIVATE_KEY=...

# Sync intervals (cron format)
BRIDGE_SYNC_INTERVAL=*/1 * * * *
EVM_TO_GL_SYNC_INTERVAL=*/1 * * * *
```

### Smart Contracts (`smart-contracts/.env`)

```bash
PRIVATE_KEY=...
OWNER_ADDRESS=0x...
CALLER_ADDRESS=0x...

# LayerZero endpoints
ZKSYNCSEPOLIATESTNET_ENDPOINT=0xe2Ef622A13e71D9Dd2BBd12cd4b27e1516FA8a09
BASESEPOLIATESTNET_ENDPOINT=0x6EDCE65403992e310A62460808c4b910D972f10f

# Contract addresses for configuration scripts
BRIDGE_FORWARDER_ADDRESS=0x...
BRIDGE_RECEIVER_ADDRESS=0x...
ZKSYNC_BRIDGE_RECEIVER_ADDRESS=0x...
```

## Message Flow Details

### GenLayer → EVM

1. Source IC calls `BridgeSender.send_message(target_chain_eid, target_contract, data)`
2. Service polls `get_message_hashes()` and `get_message()` on GenLayer
3. Service calls `BridgeForwarder.callRemoteArbitrary()` on zkSync with LayerZero fee
4. LayerZero delivers to `BridgeReceiver` on destination chain
5. BridgeReceiver dispatches to target contract via `processBridgeMessage()`

### EVM → GenLayer

1. Source contract calls `BridgeSender.sendToGenLayer(targetContract, data, options)`
2. LayerZero delivers to `BridgeReceiver.sol` on zkSync
3. BridgeReceiver stores message (not just event) for polling
4. Service polls `getPendingGenLayerMessages()` on zkSync
5. Service calls `BridgeReceiver.receive_message()` on GenLayer
6. Service calls `markMessageRelayed()` on zkSync
7. Target IC calls `BridgeReceiver.claim_all_messages()` to receive (PULL model)

## Testing

```bash
cd smart-contracts
npx hardhat test                           # All tests
npx hardhat test test/BridgeForwarder.test.ts  # Specific file
```
