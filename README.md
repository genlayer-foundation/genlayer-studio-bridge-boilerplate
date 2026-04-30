# GenLayer Bridge Boilerplate

Bidirectional bridge infrastructure between GenLayer Intelligent Contracts and
external chains through an EVM hub chain and LayerZero V2.

The bridge is deliberately split by role. Each component has one job, which
makes the EVM and Solana paths easier to reason about and test.

## Architecture

### GenLayer -> Destination Chain

```text
Intelligent Contract
  -> GenLayerOutbox.py
  -> Relay Service
  -> HubOutboundRouter.sol on the hub EVM chain
  -> LayerZero
  -> EvmChainInbox.sol or SolanaBridgeEndpoint
  -> Destination receiver app
```

Contracts:

- `intelligent-contracts/GenLayerOutbox.py`
  - Stores GenLayer-originated outbound messages.
  - Produces the canonical bridge envelope.
- `smart-contracts/contracts/HubOutboundRouter.sol`
  - Authorized relay entrypoint on the hub EVM chain.
  - Enforces replay protection by `messageId`.
  - Routes the encoded envelope through LayerZero.
- `smart-contracts/contracts/EvmChainInbox.sol`
  - Destination EVM inbox.
  - Verifies the trusted hub router.
  - Calls `processBridgeMessage(messageId, sourceEid, sourceSender, payload)`.
- `solana/bridge-endpoint`
  - Anchor endpoint program for the Solana side.
  - Decodes the canonical envelope, validates trusted peers, supports
    store-and-claim and direct receiver modes, and exposes LayerZero-compatible
    `lz_receive`, `lz_receive_types_info`, and `lz_receive_types_v2` hooks.

### Source Chain -> GenLayer

```text
Source app
  -> EvmChainOutbox.sol or SolanaBridgeEndpoint
  -> LayerZero
  -> HubInboundInbox.sol on the hub EVM chain
  -> Relay Service
  -> GenLayerInbox.py
  -> Target Intelligent Contract
```

Contracts:

- `smart-contracts/contracts/EvmChainOutbox.sol`
  - Source EVM endpoint.
  - Packages source messages in the canonical envelope and sends to the hub.
- `solana/bridge-endpoint`
  - Source Solana endpoint.
  - Packages Solana-originated payload bytes in the canonical envelope and
    sends them to the configured hub inbox through LayerZero.
- `smart-contracts/contracts/HubInboundInbox.sol`
  - Hub inbox for GenLayer-bound messages.
  - Verifies trusted source endpoints.
  - Stores pending messages for the relay service.
- `intelligent-contracts/GenLayerInbox.py`
  - Authorized relay entrypoint on GenLayer.
  - Enforces replay protection.
  - Dispatches to target Intelligent Contracts.

Legacy contracts are still present for compatibility, but new deployments should
use the role-named contracts above.

## Canonical Envelope

All chains use one wire format:

```text
abi.encode(
  uint16  version,
  bytes32 messageId,
  uint32  sourceEid,
  bytes32 sourceSender,
  bytes32 target,
  bytes   payload
)
```

Rules:

- `version` is currently `1`.
- EVM and GenLayer addresses are right-aligned in `bytes32`.
- Solana pubkeys use the full native 32 bytes.
- `payload` is opaque to the bridge and belongs to the destination receiver.

This means GenLayer does not need Solana Borsh/Anchor bindings to bridge to
Solana. It only needs to emit a 32 byte target and receiver-specific payload
bytes.

For GenLayer -> Solana through an EVM hub, distinguish the LayerZero transport
origin from the canonical bridge origin: LayerZero sees the hub as `src_eid` /
`sender`, while the envelope still reports GenLayer as
`sourceEid` / `sourceSender`.

For Solana -> GenLayer, the envelope `sourceEid` is the Solana LayerZero EID
configured in the Solana Store PDA and `sourceSender` is the Solana payer
pubkey. The LayerZero remote receiver is configured separately as an outbound
peer because the hub inbox and hub outbound router can be different contracts
even when they share the same hub EID.

## Solana Receiver Model

Solana instructions require the full account list up front. The bridge supports
two receiver modes:

- `DirectCpiReceiver`: `lz_receive_types_v2` returns the known receiver account
  list, and `lz_receive` immediately applies the payload. The local program
  writes to an in-program receiver-state PDA; a production receiver can replace
  that with receiver-specific CPI.
- `StoreAndClaim`: `lz_receive` stores the message in a PDA keyed by the
  canonical bridge `messageId`, and a later claim transaction supplies the
  dynamic receiver accounts.

Use direct CPI when receiver accounts are static or derivable from the payload.
Use store-and-claim when accounts are user/order/token specific.

LayerZero Solana OApps must implement `init`, `lz_receive`,
`lz_receive_types_info`, and `lz_receive_types_v2`. Reference:
https://docs.layerzero.network/v2/developers/solana/oapp/overview

The Solana endpoint also includes the source-chain path:

- `set_outbound_peer`: configures the hub inbox bytes32 for a destination EID.
- `quote_send_to_gen_layer`: quotes the LayerZero fee for the canonical
  Solana-originated envelope.
- `send_to_gen_layer`: builds the canonical envelope, increments the outbound
  nonce, and CPIs into the configured LayerZero Endpoint.

The Solana tests also share `test-vectors/bridge-envelope.json` with the EVM
and service tests, so Rust, Solidity, and TypeScript all assert the same
canonical bytes.

## Repository Layout

```text
intelligent-contracts/
  GenLayerOutbox.py
  GenLayerInbox.py

smart-contracts/
  contracts/
    HubOutboundRouter.sol
    HubInboundInbox.sol
    EvmChainOutbox.sol
    EvmChainInbox.sol
    libs/BridgeCodec.sol
  test/BridgeCodecFlow.test.ts

service/
  src/codec.ts
  src/relay/GenLayerToEvm.ts
  src/relay/EvmToGenLayer.ts

solana/
  README.md
  bridge-endpoint/
```

## Development

Install dependencies:

```bash
cd smart-contracts && npm install
cd ../service && npm install
cd ../solana/bridge-endpoint && npm install
```

Run tests:

```bash
cd smart-contracts
npm test

cd ../service
npm test

cd ../solana/bridge-endpoint
cargo test
npm test
```

CI runs the same coverage on pull requests and pushes to `main`: smart-contract
tests and typecheck, relay service tests and typecheck, and Solana Rust,
TypeScript, and Anchor validator tests.

## Deployment

Deploy hub contracts on an EVM hub chain. Base Sepolia is the PR's tested
bidirectional Solana smoke-test hub; zkSync Sepolia can still be used for
EVM-to-Solana tests, but Solana-to-zkSync Sepolia requires LayerZero Devnet
pricefeed support for that route.

```bash
cd smart-contracts
CONTRACT=hub-inbound npx hardhat run scripts/deploy.ts --network baseSepoliaTestnet
CONTRACT=hub-outbound npx hardhat run scripts/deploy.ts --network baseSepoliaTestnet
```

Deploy EVM endpoint contracts on a source/destination EVM chain:

```bash
CONTRACT=evm-outbox npx hardhat run scripts/deploy.ts --network baseSepoliaTestnet
CONTRACT=evm-inbox npx hardhat run scripts/deploy.ts --network baseSepoliaTestnet
```

Configure trust:

```bash
# Source EVM -> GenLayer
ACTION=set-trusted-source npx hardhat run scripts/configure.ts --network baseSepoliaTestnet
ACTION=set-authorized-relayer npx hardhat run scripts/configure.ts --network baseSepoliaTestnet
ACTION=set-hub-inbox npx hardhat run scripts/configure.ts --network baseSepoliaTestnet

# GenLayer -> EVM
ACTION=set-destination-endpoint npx hardhat run scripts/configure.ts --network baseSepoliaTestnet
ACTION=set-trusted-hub-router npx hardhat run scripts/configure.ts --network baseSepoliaTestnet
```

Deploy `GenLayerOutbox.py` and `GenLayerInbox.py` on GenLayer, then authorize
the service wallet on `GenLayerInbox.py`.

## Service Configuration

```env
GENLAYER_OUTBOX_ADDRESS=
GENLAYER_INBOX_ADDRESS=
HUB_OUTBOUND_ROUTER_ADDRESS=
HUB_INBOUND_INBOX_ADDRESS=
FORWARDER_NETWORK_RPC_URL=
ZKSYNC_RPC_URL=
GENLAYER_RPC_URL=
PRIVATE_KEY=
BRIDGE_SYNC_INTERVAL="*/5 * * * *"
EVM_TO_GL_SYNC_INTERVAL="*/1 * * * *"
```

Backward-compatible env names are still accepted:

```env
BRIDGE_SENDER_ADDRESS=
BRIDGE_RECEIVER_IC_ADDRESS=
BRIDGE_FORWARDER_ADDRESS=
ZKSYNC_BRIDGE_RECEIVER_ADDRESS=
```

`ZKSYNC_RPC_URL` is retained as a backward-compatible service env name. Set it
to the RPC URL for whichever EVM hub chain you deploy `HubInboundInbox` on.
