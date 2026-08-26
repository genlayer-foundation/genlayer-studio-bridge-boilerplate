# GenLayer Bridge Boilerplate

**Connect your blockchain to the Resolution Layer.**

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Status](https://img.shields.io/badge/status-beta-orange.svg)

This boilerplate provides the complete infrastructure to connect **GenLayer Intelligent Contracts** with **EVM** chains (Base, Ethereum, etc.) via **LayerZero V2**. It enables any blockchain to offload complex, non-deterministic work—AI reasoning, web access, data verification—to GenLayer and receive verified results.

## 📚 Table of Contents

- [The Resolution Layer](#-the-resolution-layer)
- [Architecture](#-architecture)
  - [Message Flow](#message-flow)
- [Repository Structure](#-repository-structure)
- [Key Contracts](#-key-contracts)
- [Prerequisites](#-prerequisites)
- [Deployment Guide](#-deployment-guide)
  - [1. Installation](#1-installation)
  - [2. Configuration](#2-configuration)
  - [3. Deploy EVM Infrastructure](#3-deploy-evm-infrastructure)
  - [4. Link EVM Contracts](#4-link-evm-contracts)
  - [5. Deploy GenLayer "Brain"](#5-deploy-genlayer-brain)
  - [6. Activate the Resolution Layer](#6-activate-the-resolution-layer)
- [Development & Debugging](#-development--debugging)
- [Troubleshooting](#-troubleshooting)
- [License](#-license)

---

## 🌐 The Resolution Layer

Blockchains are powerful but blind. They cannot read news, verify events, or access the web. GenLayer solves this by acting as the **Resolution Layer** for the ecosystem.

- **Your Chain (Backbone)**: Holds liquidity, users, and core logic.
- **GenLayer (Brain)**: Handles intelligence, web data, and AI processing.

This bridge connects the two, allowing you to build "Intelligent dApps" without migrating your users or liquidity.

## 🏗 Architecture

The bridge implements a **Hub-and-Spoke** model with **ZKsync Era** serving as the central hub for GenLayer's interactions with the wider EVM ecosystem via LayerZero.

```mermaid
graph TD
    subgraph "The World"
        Web["Web Data / APIs"]
        AI["LLM Reasoning"]
    end

    subgraph "GenLayer (The Brain)"
        IC["Intelligent Contract<br/>(Your Logic)"]
        BR_GL["BridgeReceiver.py<br/>(Receiver)"]
        BS_GL["BridgeSender.py<br/>(Outbox)"]
    end

    subgraph "Transport"
        Service["Relay Service<br/>(Node.js)"]
        BF["BridgeForwarder.sol<br/>(Hub - ZKsync Era)"]
        BR_HUB["BridgeReceiver.sol<br/>(Hub - ZKsync Era)"]
        LZ["LayerZero V2"]
    end

    subgraph "EVM Chain (The Backbone)"
        dApp["Your dApp"]
        BS_EVM["BridgeSender.sol"]
        BR_EVM["BridgeReceiver.sol"]
    end

    dApp -.->|"0. Quote Fee"| BS_EVM
    dApp -->|"1. Request Resolution (+Fees)"| BS_EVM
    BS_EVM --> LZ
    LZ -->|"2. Relay Message"| BR_HUB
    BR_HUB -.->|"2a. Poll Hub"| Service
    Service -->|"3. Deliver to Receiver"| BR_GL
    BR_GL -->|"4. Dispatch via emit()"| IC
    Web -->|"5. Web Data"| IC
    AI -->|"6. AI Consensus"| IC
    IC -->|"7. Send Result"| BS_GL
    BS_GL -.->|"8. Poll Event"| Service
    Service -.->|"8a. Quote Fee"| BF
    Service -->|"9. Relay Result (+Fees)"| BF
    BF --> LZ
    LZ --> BR_EVM
    BR_EVM -->|"10. Callback"| dApp
```

### Message Flow

#### GenLayer → EVM

1.  **Source IC** calls `BridgeSender.send_message(target_chain_eid, target_contract, data)`.
2.  **Service** polls `get_message_hashes()` and `get_message()` on GenLayer.
3.  **Service** calls `BridgeForwarder.quoteCallRemoteArbitrary()` to determine the fee.
4.  **Service** calls `BridgeForwarder.callRemoteArbitrary()` on ZKsync Era (Hub) with the required **native fee**.
5.  **LayerZero** delivers to `BridgeReceiver` on destination chain (Target).
6.  **BridgeReceiver** dispatches to target contract via `processBridgeMessage()`.

#### EVM → GenLayer

1.  **dApp** calls `BridgeSender.quoteSendToGenLayer()` to get the fee.
2.  **dApp** calls `BridgeSender.sendToGenLayer(targetContract, data, options)` with `msg.value >= fee`.
3.  **LayerZero** delivers to `BridgeReceiver.sol` on ZKsync Era (Hub).
4.  **BridgeReceiver** (Hub) stores message (not just event) for polling.
5.  **Service** polls `getPendingGenLayerMessages()` on ZKsync Era (Hub).
6.  **Service** calls `BridgeReceiver.receive_message()` on GenLayer.
7.  **BridgeReceiver** dispatches to target IC via `emit().process_bridge_message()`.
8.  **Service** calls `markMessageRelayed()` on ZKsync Era (Hub).

## 📂 Repository Structure

This is a monorepo containing all components of the bridge:

- **/smart-contracts**: Solidity contracts for EVM chains (Hardhat).
- **/intelligent-contracts**: Python contracts for GenLayer.
- **/service**: Node.js relay service that polls and relays messages.
- **/example**: Complete bidirectional example with StringSender/StringReceiver.

## 🔑 Key Contracts

| Contract              | Chain    | Purpose                               |
| :-------------------- | :------- | :------------------------------------ |
| `BridgeSender.py`     | GenLayer | Stores outbound GL→EVM messages       |
| `BridgeReceiver.py`   | GenLayer | Receives EVM→GL messages, dispatches to target |
| `BridgeForwarder.sol` | ZKsync Era | Relays GL→EVM via LayerZero           |
| `BridgeReceiver.sol`  | ZKsync Era | Stores EVM→GL messages for polling    |
| `BridgeSender.sol`    | Base/EVM | Entry point for EVM→GL messages       |

## 📋 Prerequisites

To bridge intelligence to your dApp, you need:

- **Node.js**: v18+ & **npm**: v9+
- **GenLayer Studio**: [GenLayer Studio](https://studio.genlayer.com/)
- **Wallet**: A private key with testnet funds on:
  - **Base Sepolia** (Example Target Chain)
  - **ZKsync Era Sepolia** (Hub Chain)

## 🚀 Deployment Guide

Follow these steps to deploy your own instance of the bridge infrastructure.

### 1. Installation

```bash
# 1. Install Smart Contracts dependencies (EVM)
cd smart-contracts && npm install && cd ..

# 2. Install Bridge Service dependencies (Relayer)
cd service && npm install && cd ..
```

### 2. Configuration

Create your environment files.

**Smart Contracts (.env)**

```bash
cp smart-contracts/.env.example smart-contracts/.env
# EDIT: Add your PRIVATE_KEY, RPC URLs, and LAYERZERO_ENDPOINT for the selected network
```

**Service (.env)**

```bash
cp service/.env.example service/.env
# EDIT: Add your PRIVATE_KEY and GENLAYER_RPC_URL (e.g. https://studio.genlayer.com/api/rpc)
```

### 3. Deploy EVM Infrastructure

Deploy the "mailbox" contracts to the EVM chains.

```bash
cd smart-contracts

# 1. Set `LAYERZERO_ENDPOINT` to the LayerZero V2 endpoint for the selected network.
# 2. Deploy Receiver (Target & Hub)
CONTRACT=receiver npx hardhat run scripts/deploy.ts --network baseSepoliaTestnet
CONTRACT=receiver npx hardhat run scripts/deploy.ts --network zkSyncSepoliaTestnet

# 3. Deploy Forwarder (Hub - ZKsync Era)
CONTRACT=forwarder npx hardhat run scripts/deploy.ts --network zkSyncSepoliaTestnet

# 4. Deploy Sender (Target - Base). Set DESTINATION_LAYERZERO_EID explicitly.
CONTRACT=sender npx hardhat run scripts/deploy.ts --network baseSepoliaTestnet
```

### 4. Link EVM Contracts

Configure the trust relationships so messages can flow securely.

```bash
# Configure Hub (ZKsync Era)
ACTION=set-trusted-forwarder npx hardhat run scripts/configure.ts --network zkSyncSepoliaTestnet
ACTION=set-authorized-relayer npx hardhat run scripts/configure.ts --network zkSyncSepoliaTestnet
ACTION=set-bridge-address npx hardhat run scripts/configure.ts --network zkSyncSepoliaTestnet

# Configure Target (Base)
ACTION=set-sender-receiver npx hardhat run scripts/configure.ts --network baseSepoliaTestnet
ACTION=set-trusted-forwarder npx hardhat run scripts/configure.ts --network baseSepoliaTestnet
```

### 5. Deploy GenLayer "Brain"

Deploy the Intelligent Contracts via [GenLayer Studio](https://studio.genlayer.com/):

1.  **Deploy `BridgeSender.py`**: The exit point for results returning to EVM.
    - _No constructor args._
2.  **Deploy `BridgeReceiver.py`**: Receives and dispatches incoming requests to target ICs.
    - _No constructor args. After deployment, call `set_authorized_relayer(wallet_address, true)`._

### 6. Activate the Resolution Layer

Each deployment writes both a contract record and a per-chain network manifest
under `smart-contracts/deployments/`. Merge the hub and target records into the
combined manifest used by the relay:

```bash
cd smart-contracts
node scripts/merge-manifests.mjs \
  --hub deployments/zkSyncSepoliaTestnet-300-manifest.json \
  --target deployments/baseSepoliaTestnet-84532-manifest.json \
  --profile bradbury \
  --genlayer-chain-id 4221 \
  --output ../service/network-manifests/current.json
```

Set `DEPLOYMENT_MANIFEST` to the generated file. Do not copy deployed
addresses into source files.

Update `service/.env` with the selected profile and its manifest:

```env
BRIDGE_NETWORK_PROFILE=bradbury
GENLAYER_CHAIN_ID=4221
GENLAYER_RPC_URL=<Bradbury RPC URL>
HUB_RPC_URL=<hub EVM RPC URL>
HUB_CHAIN_ID=<hub EVM chain ID>
HUB_LAYERZERO_EID=<hub LayerZero EID>
TARGET_RPC_URL=<target EVM RPC URL>
TARGET_CHAIN_ID=<target EVM chain ID>
TARGET_LAYERZERO_EID=<target LayerZero EID>
TARGET_BRIDGE_SENDER_ADDRESS=<target EVM BridgeSender address>
TARGET_BRIDGE_RECEIVER_ADDRESS=<target BridgeReceiver address>
BRIDGE_RECEIVER_IC_ADDRESS=<GenLayer BridgeReceiver address>
DEPLOYMENT_MANIFEST=<path to the generated network manifest>
```

The checked-in file under `service/network-manifests/` is an evidence example
only. The profile checker verifies the generated addresses against live RPCs
before the relay is started.

Start the relay:

```bash
cd service
npm run build
npm start
```

_The service is now polling. Your bridge is live._

### Opt-in profile check

Before running a relay, verify the selected profile and deployed bytecode without sending a transaction:

```bash
cd service
set COUNSEL_BRIDGE_INTEGRATION=1
npm run integration:profile
```

Use PowerShell `$env:COUNSEL_BRIDGE_INTEGRATION="1"` instead of `set` on Windows. This check reads both EVM RPCs, validates their chain IDs, and confirms bytecode at the manifest addresses. It does not call GenLayer state-changing methods.

## 🛠 Development & Debugging

The `service` directory includes a CLI for debugging the bridge state.

```bash
cd service

# Check ZKsync Era BridgeReceiver state
npx ts-node cli.ts check-receiver

# Check Base BridgeSender state
npx ts-node cli.ts check-sender

# Check ZKsync Era BridgeForwarder state
npx ts-node cli.ts check-forwarder

# Verify all configurations
npx ts-node cli.ts check-config

# List pending messages on ZKsync Era
npx ts-node cli.ts pending-messages

# Debug a specific transaction
npx ts-node cli.ts debug-tx <hash>
```

## 🧪 Example: "Hello World"

To demonstrate the capability, we provide a bidirectional messaging example.

👉 **[Run the Example](example/README.md)**

- **EVM → GenLayer**: Send a string from Base. The BridgeReceiver dispatches it to your Intelligent Contract.
- **GenLayer → EVM**: The Intelligent Contract sends a response back to the EVM chain.

## 🛠 Troubleshooting

- **Service Logs**: The `service` console is your best debugging tool. It tracks every step of the relay.
- **Gas**: Ensure your relayer wallet has ETH on both Base Sepolia and ZKsync Era Sepolia.
- **Trust**: If messages fail to deliver, check that `set-trusted-forwarder` was run on the target chain.
- **LayerZero Endpoints**: Ensure you are using the correct Endpoint IDs for your networks.
  - ZKsync Era Sepolia: `40305`
  - Base Sepolia: `40245`

## 📄 License

MIT
