# GenLayer Bridge Example: Bidirectional Messaging

This example demonstrates the core capability of the Resolution Layer: **bidirectional communication** between GenLayer Intelligent Contracts and EVM Smart Contracts (Base Sepolia).

We use a simple "String Sender/Receiver" pattern as the primitive. In a real application, this string would be the result of a web resolution, an AI inference, or a prediction market outcome.

## 📂 Structure

- **`smart-contracts/`**: EVM contracts (Base Sepolia) and Hardhat scripts.
- **`intelligent-contracts/`**: GenLayer Python contracts.
- **`scripts/`**: GenLayer deployment and interaction scripts.

## 🗺️ The Two Flows

1.  **GenLayer → EVM (Push)**: "The Brain" sends instructions to "The Body".
    - _Example:_ An Intelligent Contract decides a prediction market winner and unlocks funds on Base.
    - _Path:_ `StringSender.py` → `BridgeSender` → `BridgeReceiver` → `StringReceiver.sol`

2.  **EVM → GenLayer (Pull)**: "The Body" asks "The Brain" a question.
    - _Example:_ A Base contract requests resolution for a sports game.
    - _Path:_ `StringSenderEvm.sol` → `BridgeSender.sol` → `BridgeReceiver.py` → `StringReceiverIC.py`

---

## Flow 1: GenLayer → EVM (Push to Chain)

In this flow, an Intelligent Contract initiates an action on an EVM chain.

### 1. Prerequisites

Ensure the **Bridge Service** is running (see [Main README](../README.md)).

### 2. Deploy the Example Contracts

**A. Deploy Target on Base Sepolia (`StringReceiver.sol`)**

```bash
cd smart-contracts
npm install
# Set BRIDGE_RECEIVER_ADDRESS from your main deployment (e.g. 0x...)
export BRIDGE_RECEIVER_ADDRESS=<your_bridge_receiver_address>

npm run deploy:base-sepolia
# 📋 COPY the output address: <STRING_RECEIVER_ADDRESS>
cd ..
```

**B. Deploy Sender on GenLayer (`StringSender.py`)**

```bash
# From 'example' root
export PRIVATE_KEY=<your_genlayer_private_key>
export BRIDGE_SENDER_PY_ADDRESS=<bridge_sender_address_from_main_readme>

npx tsx scripts/deploy-string-sender.ts \
  --bridge-sender $BRIDGE_SENDER_PY_ADDRESS \
  --target-contract <STRING_RECEIVER_ADDRESS>
```

### 3. Execute: Send a Message

Use the script to trigger the Intelligent Contract.

```bash
npx tsx scripts/send-test-string.ts \
  --sender <STRING_SENDER_PY_ADDRESS> \
  --message "Hello from GenLayer!"
```

### 4. Verify

1.  Wait ~1-2 minutes for the service to pick up the event and LayerZero to deliver it.
2.  Check the Base Sepolia contract state:

```bash
cd smart-contracts
npx hardhat run scripts/check-messages.ts --network baseSepoliaTestnet --contract <STRING_RECEIVER_ADDRESS>
cd ..
```

---

## Flow 2: EVM → GenLayer (Pull from Inbox)

In this flow, an EVM contract sends a request that sits in GenLayer's "Inbox" until an Intelligent Contract processes it.

### 1. Prerequisites

Ensure the **Bridge Service** is running and configured to relay messages from EVM to GenLayer (check `service/.env`).

### 2. Deploy the Example Contracts

**A. Deploy Receiver on GenLayer (`StringReceiverIC.py`)**

```bash
# From 'example' root
export BRIDGE_RECEIVER_PY_ADDRESS=<bridge_receiver_ic_address_from_main_readme>

npx tsx scripts/deploy-string-receiver-ic.ts \
  --bridge-receiver $BRIDGE_RECEIVER_PY_ADDRESS

# 📋 COPY the output address: <STRING_RECEIVER_IC_ADDRESS>
```

**B. Deploy Sender on Base Sepolia (`StringSenderEvm.sol`)**

```bash
cd smart-contracts
export BRIDGE_SENDER_ADDRESS=<bridge_sender_sol_address_from_main_readme>
export TARGET_CONTRACT=<STRING_RECEIVER_IC_ADDRESS>

npm run deploy:string-sender-evm
# 📋 COPY the output address: <STRING_SENDER_EVM_ADDRESS>
cd ..
```

### 3. Execute: Send a Request

Send a transaction on Base Sepolia.

```bash
cd smart-contracts
npx hardhat run scripts/send-to-genlayer.ts --network baseSepoliaTestnet
cd ..
```
*Note: This script uses the env vars `STRING_SENDER_EVM` and `TARGET_CONTRACT` if set, or defaults from deployment.*

### 4. Process the Inbox

On GenLayer, the message is now waiting in the `BridgeReceiver` (Inbox). The `StringReceiverIC` needs to "check its mail".

**Option A: GenLayer Studio (Recommended)**

1.  Go to [GenLayer Studio](https://studio.genlayer.com/).
2.  Open `StringReceiverIC.py`.
3.  Click on the **Run and Debug** tab.
4.  Call the `claim_messages()` function.
5.  Call `last_message_content()` to verify the message was received.

**Option B: Automation**

In a production app, your Intelligent Contract would regularly call `claim_messages()` as part of its execution logic, or you would have a cron job calling it.
