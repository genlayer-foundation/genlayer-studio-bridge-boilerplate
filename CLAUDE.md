# CLAUDE.md

This repo is a bidirectional bridge between GenLayer Intelligent Contracts and
external chains using LayerZero V2 with zkSync Era as the hub chain.

## Current Architecture

GenLayer -> destination:

```text
GenLayerOutbox.py -> service -> HubOutboundRouter.sol -> LayerZero -> EvmChainInbox.sol / SolanaBridgeEndpoint -> receiver app
```

source chain -> GenLayer:

```text
EvmChainOutbox.sol / SolanaBridgeEndpoint -> LayerZero -> HubInboundInbox.sol -> service -> GenLayerInbox.py -> target IC
```

Legacy `BridgeSender`, `BridgeReceiver`, and `BridgeForwarder` contracts remain
in the repo for compatibility. New work should use the role-named contracts.

## Key Files

- `intelligent-contracts/GenLayerOutbox.py`: stores GenLayer-originated messages.
- `intelligent-contracts/GenLayerInbox.py`: receives relayed messages into GenLayer.
- `smart-contracts/contracts/HubOutboundRouter.sol`: zkSync outbound router.
- `smart-contracts/contracts/HubInboundInbox.sol`: zkSync inbound message store.
- `smart-contracts/contracts/EvmChainOutbox.sol`: EVM source endpoint.
- `smart-contracts/contracts/EvmChainInbox.sol`: EVM destination endpoint.
- `smart-contracts/contracts/libs/BridgeCodec.sol`: canonical envelope codec.
- `service/src/codec.ts`: TypeScript copy of the envelope codec.
- `solana/bridge-endpoint`: Anchor Solana endpoint, codec, and validator tests.

## Canonical Envelope

Every bridge leg uses:

```text
abi.encode(uint16 version, bytes32 messageId, uint32 sourceEid, bytes32 sourceSender, bytes32 target, bytes payload)
```

EVM/GenLayer addresses are right-aligned in `bytes32`. Solana pubkeys use the
full 32 bytes. `payload` is receiver-owned opaque bytes.

## Commands

```bash
cd smart-contracts
npm install
npm test
npx tsc --noEmit

cd ../service
npm install
npm test

cd ../solana/bridge-endpoint
npm install
cargo test
npm test
```

## Deploy

```bash
cd smart-contracts

CONTRACT=hub-inbound npx hardhat run scripts/deploy.ts --network zkSyncSepoliaTestnet
CONTRACT=hub-outbound npx hardhat run scripts/deploy.ts --network zkSyncSepoliaTestnet
CONTRACT=evm-outbox npx hardhat run scripts/deploy.ts --network baseSepoliaTestnet
CONTRACT=evm-inbox npx hardhat run scripts/deploy.ts --network baseSepoliaTestnet
```

## Configure

```bash
ACTION=set-trusted-source npx hardhat run scripts/configure.ts --network zkSyncSepoliaTestnet
ACTION=set-authorized-relayer npx hardhat run scripts/configure.ts --network zkSyncSepoliaTestnet
ACTION=set-destination-endpoint npx hardhat run scripts/configure.ts --network zkSyncSepoliaTestnet
ACTION=set-hub-inbox npx hardhat run scripts/configure.ts --network baseSepoliaTestnet
ACTION=set-trusted-hub-router npx hardhat run scripts/configure.ts --network baseSepoliaTestnet
```

## Solana Notes

LayerZero Solana OApps must implement `init`, `lz_receive`,
`lz_receive_types_info`, and `lz_receive_types_v2`. The bridge supports:

- direct receivers when receiver accounts are static or payload-derivable;
- store-and-claim when receiver accounts are dynamic.

Reference: https://docs.layerzero.network/v2/developers/solana/oapp/overview
