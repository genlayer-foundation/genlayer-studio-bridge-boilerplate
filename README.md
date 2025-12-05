# GenLayer Bridge

Bidirectional cross-chain messaging between GenLayer and EVM chains via LayerZero V2.

## Overview

- **GenLayer → EVM**: Send messages from GenLayer intelligent contracts to EVM chains (Base, Ethereum, etc.)
- **EVM → GenLayer**: Send messages from EVM smart contracts to GenLayer intelligent contracts

The bridge uses **LayerZero V2** for transport and **zkSync** as the hub chain for both directions.

## Architecture

```
                          ┌─────────────────────────────┐
                          │       zkSync (Hub)          │
                          │  ┌───────────────────────┐  │
     GenLayer ◄──────────►│  │ BridgeForwarder.sol   │  │◄──────────► Base
                          │  │ BridgeReceiver.sol    │  │
                          │  └───────────────────────┘  │
                          └─────────────────────────────┘
                                        ▲
                                   LayerZero V2
                                        ▼
                          ┌─────────────────────────────┐
                          │     Other EVM Chains        │
                          └─────────────────────────────┘
```

### GenLayer → EVM Flow

```
GenLayer BridgeSender.py → Service polls → zkSync BridgeForwarder → LayerZero → Target EVM
```

1. IC calls `BridgeSender.send_message(target_chain_eid, target_contract, data)`
2. Service polls for new messages and relays via `BridgeForwarder.callRemoteArbitrary()`
3. LayerZero delivers to `BridgeReceiver` on destination chain
4. `BridgeReceiver` calls `target.processBridgeMessage(srcChainId, srcSender, message)`

### EVM → GenLayer Flow

```
EVM BridgeSender.sol → LayerZero → zkSync BridgeReceiver → Service polls → GenLayer BridgeReceiver.py
```

1. Contract calls `BridgeSender.sendToGenLayer(targetContract, data, options)`
2. LayerZero delivers to zkSync `BridgeReceiver` which stores the message
3. Service polls and relays to GenLayer `BridgeReceiver`
4. Target IC calls `claim_all_messages()` to receive (PULL model)

## Quick Start

```bash
# 1. Install dependencies
cd smart-contracts && npm install
cd ../service && npm install

# 2. Configure environment
cp smart-contracts/.env.example smart-contracts/.env
cp service/.env.example service/.env

# 3. Deploy EVM contracts (see Deployment section)

# 4. Deploy GenLayer contracts via Studio (see below)

# 5. Configure contracts and start service
cd service && npm run build && npm start
```

## Directory Structure

```
bridge/
├── smart-contracts/           # Solidity contracts (Hardhat)
│   ├── contracts/
│   │   ├── BridgeForwarder.sol   # GL→EVM relay on zkSync
│   │   ├── BridgeReceiver.sol    # Receives LayerZero messages
│   │   └── BridgeSender.sol      # EVM→GL entry point
│   └── scripts/
│       ├── deploy.ts             # Unified deployment
│       └── configure.ts          # Unified configuration
├── intelligent-contracts/     # GenLayer Python contracts
│   ├── BridgeSender.py           # GL→EVM message storage
│   └── BridgeReceiver.py         # EVM→GL message receiver (PULL)
├── service/                   # TypeScript relay service
│   ├── src/relay/
│   │   ├── GenLayerToEvm.ts
│   │   └── EvmToGenLayer.ts
│   └── cli.ts                    # Debug CLI
└── example/                   # Bidirectional examples
```

## Configuration

Copy and configure environment files:

```bash
cp smart-contracts/.env.example smart-contracts/.env
cp service/.env.example service/.env
cp example/.env.example example/.env
```

See each `.env.example` for required variables and descriptions.

## Deployment

### EVM Contracts

```bash
cd smart-contracts

# Deploy BridgeReceiver (destination chains)
CONTRACT=receiver npx hardhat run scripts/deploy.ts --network baseSepoliaTestnet
CONTRACT=receiver npx hardhat run scripts/deploy.ts --network zkSyncSepoliaTestnet

# Deploy BridgeForwarder (zkSync hub)
CONTRACT=forwarder npx hardhat run scripts/deploy.ts --network zkSyncSepoliaTestnet

# Deploy BridgeSender (EVM→GL source chain)
CONTRACT=sender npx hardhat run scripts/deploy.ts --network baseSepoliaTestnet
```

### Configure Contracts

```bash
# zkSync: Set trusted forwarder and bridge addresses
ACTION=set-trusted-forwarder npx hardhat run scripts/configure.ts --network zkSyncSepoliaTestnet
ACTION=set-authorized-relayer npx hardhat run scripts/configure.ts --network zkSyncSepoliaTestnet
ACTION=set-bridge-address npx hardhat run scripts/configure.ts --network zkSyncSepoliaTestnet

# Base: Configure BridgeSender and BridgeReceiver
ACTION=set-sender-receiver npx hardhat run scripts/configure.ts --network baseSepoliaTestnet
ACTION=set-trusted-forwarder npx hardhat run scripts/configure.ts --network baseSepoliaTestnet
```

### GenLayer Contracts

Deploy intelligent contracts via [GenLayer Studio](https://studio.genlayer.com/):

1. **Connect wallet** - Must match `PRIVATE_KEY` in your .env files
2. **Deploy BridgeSender.py** - No constructor arguments needed
3. **Deploy BridgeReceiver.py** - Constructor: `initial_relayer` = your bridge service wallet address
4. **Save addresses** - Update `service/.env` with deployed contract addresses

### Start Bridge Service

```bash
cd service
npm run build
npm start
```

## Implementing Target Contracts

### Receiving on EVM (GenLayer → EVM)

```solidity
import {IGenLayerBridgeReceiver} from "./interfaces/IGenLayerBridgeReceiver.sol";

contract MyReceiver is IGenLayerBridgeReceiver {
    address public bridgeReceiver;

    modifier onlyBridge() {
        require(msg.sender == bridgeReceiver, "Only bridge");
        _;
    }

    function processBridgeMessage(
        uint32 srcChainId,
        address srcSender,
        bytes calldata message
    ) external onlyBridge {
        string memory data = abi.decode(message, (string));
        // Handle message...
    }
}
```

### Receiving on GenLayer (EVM → GenLayer)

```python
class MyReceiverIC(gl.Contract):
    bridge_receiver: Address

    def __init__(self, bridge_receiver: str):
        self.bridge_receiver = Address(bridge_receiver)

    @gl.public.write
    def claim_messages(self) -> int:
        """Call this to receive pending messages"""
        bridge = gl.get_contract_at(self.bridge_receiver)
        messages = bridge.call().claim_all_messages(str(gl.contract.address))
        for msg in messages:
            self._process(msg.get("data", bytes()))
        return len(messages)

    def _process(self, data: bytes):
        decoder = gl.evm.MethodDecoder([str])
        message = decoder.decode(data)[0]
        # Handle message...
```

### Sending from GenLayer

```python
@gl.public.write
def send_to_evm(self, message: str):
    encoder = gl.evm.MethodEncoder("", [str], bool)
    data = encoder.encode_call([message])[4:]  # Remove selector

    bridge = gl.get_contract_at(self.bridge_sender)
    bridge.emit().send_message(TARGET_CHAIN_EID, TARGET_CONTRACT, data)
```

### Sending from EVM

```solidity
function sendToGenLayer(string calldata message, bytes calldata options) external payable {
    bytes memory encoded = abi.encode(message);
    bridgeSender.sendToGenLayer{value: msg.value}(targetContract, encoded, options);
}
```

## CLI Debug Tools

```bash
cd service

npx ts-node cli.ts check-receiver     # zkSync BridgeReceiver state
npx ts-node cli.ts check-sender       # Base BridgeSender state
npx ts-node cli.ts check-forwarder    # zkSync BridgeForwarder state
npx ts-node cli.ts check-config       # Verify configurations
npx ts-node cli.ts pending-messages   # Pending EVM→GL messages
npx ts-node cli.ts debug-tx <hash>    # Debug transaction
```

## LayerZero Reference

| Network        | LayerZero EID | Endpoint Address                             |
| -------------- | ------------- | -------------------------------------------- |
| zkSync Sepolia | 40305         | `0xe2Ef622A13e71D9Dd2BBd12cd4b27e1516FA8a09` |
| Base Sepolia   | 40245         | `0x6EDCE65403992e310A62460808c4b910D972f10f` |
| zkSync Mainnet | 30165         | See LayerZero docs                           |
| Base Mainnet   | 30184         | `0x1a44076050125825900e736c501f859c50fE728c` |

## Example

See `example/` for complete bidirectional string messaging:

- **GL→EVM**: `StringSender.py` → `StringReceiver.sol`
- **EVM→GL**: `StringSenderEvm.sol` → `StringReceiverIC.py`

```bash
cd example/smart-contracts && npm install
# See example/.env.example for configuration
```

## License

MIT
