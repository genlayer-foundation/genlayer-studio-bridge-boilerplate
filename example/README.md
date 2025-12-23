# GenLayer Bridge Example: Bidirectional Messaging

This example demonstrates the core capability of the Resolution Layer: **bidirectional communication** between GenLayer Intelligent Contracts and EVM Smart Contracts (Base Sepolia).

We use a simple "String Sender/Receiver" pattern as the primitive. In a real application, this string would be the result of a web resolution, an AI inference, or a prediction market outcome.

## 1. GenLayer → EVM (Push)

An Intelligent Contract initiates an action on an EVM chain.

### 1. Prerequisites
Ensure the [Main README](../README.md) deployment steps are complete.

### 2. Deploy Contracts
**A. Base Sepolia (`StringReceiver.sol`)**
```bash
cd smart-contracts
export BRIDGE_RECEIVER_ADDRESS=<your_bridge_receiver_address>
npm run deploy:base-sepolia
# COPY: <STRING_RECEIVER_ADDRESS>
```

**B. GenLayer (`StringSender.py`)**
```bash
cd ../scripts
npx tsx deploy-string-sender.ts --bridge-sender <BRIDGE_SENDER_PY_ADDRESS> --target-contract <STRING_RECEIVER_ADDRESS>
```

### 3. Execute
```bash
npx tsx send-test-string.ts --sender <STRING_SENDER_PY_ADDRESS> --message "Hello from GenLayer"
```

### 4. Verify
Wait 2-5 min. Check Base Sepolia:
```bash
cd ../smart-contracts
npx hardhat run scripts/check-messages.ts --network baseSepoliaTestnet --contract <STRING_RECEIVER_ADDRESS>
cd ..
```

---

## 2. EVM → GenLayer (Push)

An EVM contract sends data to GenLayer. The BridgeReceiver dispatches it directly to the target Intelligent Contract.

### 1. Prerequisites
- GenLayer `BridgeReceiver` deployed.
- ZKsync Era `BridgeReceiver` (Hub) deployed.
- Service relaying EVM → GenLayer.

### 2. Deploy Contracts
**A. GenLayer (`StringReceiverIC.py`)**
Deploy via Studio. Constructor: `bridge_receiver` = `<BRIDGE_RECEIVER_PY_ADDRESS>`.

**B. Base Sepolia (`StringSenderEvm.sol`)**
```bash
cd smart-contracts
export BRIDGE_SENDER_ADDRESS=<BRIDGE_SENDER_SOL_ADDRESS>
export TARGET_CONTRACT=<STRING_RECEIVER_IC_ADDRESS>
npx hardhat run scripts/deploy-string-sender-evm.ts --network baseSepoliaTestnet
# COPY: <STRING_SENDER_EVM_ADDRESS>
```

### 3. Execute
Send transaction on Base Sepolia:
```bash
npx hardhat run scripts/send-to-genlayer.ts --network baseSepoliaTestnet --contract <STRING_SENDER_EVM_ADDRESS> --message "Request #123"
```

### 4. Verify
The BridgeReceiver automatically dispatches the message to StringReceiverIC.
1. Go to [GenLayer Studio](https://studio.genlayer.com/).
2. Open `StringReceiverIC.py` → **Run and Debug**.
3. Call `get_received_strings()` to see the message.
4. Call `get_received_count()` to verify.

## Contract Reference

- **`StringSender.py` (GenLayer)**: Encodes string, calls `BridgeSender`.
- **`StringReceiver.sol` (EVM)**: Becomes `IGenLayerBridgeReceiver`, accepts calls from Bridge.
- **`StringSenderEvm.sol` (EVM)**: Payable contract, pays fees, sends to Bridge.
- **`StringReceiverIC.py` (GenLayer)**: Receives messages via `process_bridge_message()` from BridgeReceiver.
