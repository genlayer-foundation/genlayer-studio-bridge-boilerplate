# Solana Bridge Endpoint

The Solana endpoint is a LayerZero V2 OApp that sends and receives the same
canonical bridge envelope used by the EVM contracts and relay service.

## Message Boundary

The bridge delivers:

```text
uint16  version
bytes32 message_id
uint32  source_eid
bytes32 source_sender
bytes32 target
bytes   payload
```

`target` is the destination receiver identity. For Solana this is normally a
native 32 byte pubkey. `payload` is opaque to the bridge and belongs to the
receiver program.

GenLayer does not need Solana-specific Borsh or Anchor bindings for the bridge.
It only needs to produce this envelope and a receiver-specific byte payload.

## Anchor Program

`bridge-endpoint` is an Anchor workspace. It implements:

- `init`: initializes the Store PDA and `LzReceiveTypes` PDA, and registers
  the Store PDA as a LayerZero OApp when a real Endpoint program is configured.
- `set_trusted_peer`: configures the expected 32 byte remote sender for a source EID.
- `set_outbound_peer`: configures the expected 32 byte remote receiver for a destination EID.
- `register_receiver`: registers a Solana receiver pubkey in either store-and-claim or direct mode.
- `quote_send_to_gen_layer`: quotes the LayerZero fee for sending a
  Solana-originated canonical envelope to the hub inbox.
- `send_to_gen_layer`: builds a canonical envelope from the Solana payer,
  target bytes32, and opaque payload, then CPIs into the LayerZero Endpoint.
- `lz_receive`: accepts the LayerZero-compatible `LzReceiveParams`, verifies
  the peer, decodes the envelope, and either stores or directly delivers the
  message.
- `lz_receive_store`: local/test helper for the explicit store path.
- `lz_receive_direct`: local/test helper for the explicit direct path.
- `claim_message`: claims a stored message into the registered receiver state.
- `lz_receive_types_info` and `lz_receive_types_v2`: expose the account discovery hooks expected by the LayerZero V2 Solana executor.

The current direct path writes to an in-program receiver-state PDA so the full
flow is testable on a local validator. A production receiver that needs CPI into
another program should keep the same envelope validation and account discovery
shape, then replace that write-through with the receiver-specific CPI.

`lz_receive` uses LayerZero's `src_eid`, `sender`, `guid`, and `nonce` for the
transport channel. The canonical bridge envelope keeps its own `source_eid` and
`source_sender`. For GenLayer -> Solana through an EVM hub, the LayerZero
source EID is the hub chain EID, while the envelope source EID is GenLayer's
bridge source EID. Replay state is keyed by the canonical envelope `message_id`
so Solana stays aligned with the EVM contracts and stored messages can be
claimed by bridge message ID.

For Solana -> GenLayer, `send_to_gen_layer` uses the Store PDA `local_eid` as
the canonical `source_eid` and the transaction payer pubkey as
`source_sender`. The remote LayerZero receiver is read from an
`OutboundPeerConfig` PDA keyed by destination EID. This is separate from the
inbound `PeerConfig` because the hub inbound inbox and outbound router can be
different contracts on the same hub EID.

## Receive Modes

The endpoint supports two delivery modes:

- `DirectCpiReceiver`: `lz_receive_types_v2` returns the known receiver account
  list, and `lz_receive` immediately dispatches the payload. Receiver
  registration pre-creates the receiver-state PDA so executor delivery does not
  need to allocate rent-bearing bridge accounts.
- `StoreAndClaim`: `lz_receive` stores the message in a PDA keyed by
  `message_id`, and a later `claim_message` transaction supplies the final
  receiver account.

## LayerZero OApp Pieces

Per the LayerZero Solana OApp V2 reference, an Anchor OApp must implement:

- `init`
- `lz_receive`
- `lz_receive_types_info`
- `lz_receive_types_v2`

and maintain these PDAs:

- Store PDA: OApp identity and endpoint signer.
- Peer PDA: trusted remote peer per source EID for inbound messages.
- OutboundPeer PDA: remote receiver per destination EID for outbound messages.
- LzReceiveTypes PDA: account discovery state for the executor.

Reference: https://docs.layerzero.network/v2/developers/solana/oapp/overview

`lz_receive_types_v2` mirrors the LayerZero V2 OApp return shape:
`context_version`, `alts`, and `Instruction::LzReceive { accounts }`. The
planned account list includes the bridge accounts plus the Endpoint clear
accounts derived from the official `Nonce`, `PayloadHash`, `OApp`, `Endpoint`,
and `__event_authority` seeds.

## Tests

Install Anchor and the Solana CLI, then run:

```bash
cd solana/bridge-endpoint
npm install
cargo test
npm test
```

To configure the EVM hub with the Solana OApp as a LayerZero peer, use the
Store PDA as the remote endpoint identity. Do not use the program id for
LayerZero peer wiring:

```bash
npm run oapp:identity
```

Use the printed `storeBytes32` as `DST_ENDPOINT_ADDRESS` on `HubOutboundRouter`
for GenLayer -> Solana, and as `TRUSTED_SOURCE_ENDPOINT_ADDRESS` on
`HubInboundInbox` for Solana -> GenLayer.

## Devnet Deployment

The Devnet scripts live under `solana/bridge-endpoint` and read
`.env.testnet.local` when present. Start from the checked-in template:

```bash
cd solana/bridge-endpoint
cp .env.testnet.example .env.testnet.local
```

The scripts are dry-run first:

```bash
npm run devnet:deploy-program
npm run devnet:init
npm run devnet:configure
npm run devnet:init-lz-path
```

`devnet:deploy-program` prints the Solana CLI deployment summary and does not
send unless `-- --send` is supplied. The Solana CLI performs preflight for the
deployment transactions. `devnet:init` builds and simulates the Anchor `init`
instruction with the LayerZero `register_oapp` CPI accounts before sending.
`devnet:configure` simulates the trusted inbound peer, outbound peer, and
optional test receiver registration. `devnet:init-lz-path` initializes the
LayerZero Endpoint/ULN send and receive configs for the configured hub EID, plus
nonce accounts for both configured hub OApps: `HUB_OUTBOUND_ROUTER_ADDRESS` for
hub -> Solana delivery and `HUB_INBOUND_INBOX_ADDRESS` for Solana -> hub
delivery. If only one side is available, pass `-- --remote-oapp <address-or-bytes32>`
or set only the matching env var.

After reviewing the transaction summary, send with:

```bash
npm run devnet:deploy-program -- --send
npm run devnet:init -- --send
SOLANA_REGISTER_TEST_RECEIVER=1 npm run devnet:configure -- --send
npm run devnet:init-lz-path -- --send
```

For the deployed Devnet path:

- fee payer/admin: generated Solana keypair
- bridge program id: `H4bMLhY9L8rB8kQrMbSeyy2KbQ2CYQnSvxqPro6vsy4J`
- LayerZero Solana endpoint program:
  `76y77prsiCMvXMjuoZ5VRrhG5qYBrUMYTE5WgHqgjEn6`
- local Solana EID: `40168`
- Base Sepolia hub EID: `40245`
- zkSync Sepolia hub EID: `40305` for EVM -> Solana tests only until
  LayerZero Devnet pricefeed support exists for the Solana -> zkSync route.

`npm test` runs `anchor build`, starts `solana-test-validator` on available
localhost ports with the built SBF artifact loaded by `--bpf-program`, executes
the Anchor TypeScript tests, and shuts the validator down. The test suite covers
canonical envelope decoding, the shared golden vector, trusted LayerZero peer
validation with a distinct canonical GenLayer source, LayerZero `lz_receive`
store-and-claim delivery, LayerZero `lz_receive` direct delivery,
`lz_receive_types_v2` account planning with Endpoint clear PDAs, replay
rejection, outbound peer configuration, outbound quoting, and the
Solana-originated `send_to_gen_layer` path on a local endpoint stub.

## Testnet Smoke

The tested bidirectional smoke path is Base Sepolia <-> Solana Devnet. Configure
the hub contracts, Solana EID, Store PDA bytes32, and receiver target bytes32 in
`smart-contracts/.env`:

```env
HUB_EID=40245
SOLANA_EID=40168
GENLAYER_EID=61998
HUB_OUTBOUND_ROUTER_ADDRESS=0x3550385d7165C05B607a4E67b38C25A042D2fe10
HUB_INBOUND_INBOX_ADDRESS=0xbA527DEF67a5Cc274Cf2cFaC8Bf1BAAda36eccc0
SOLANA_TEST_RECEIVER_TARGET_BYTES32=0xaf662a0d7bc9bad8b5a37fc399299fdad561f3cc857a96ec024150d79612b64d
SOLANA_LZ_RECEIVE_VALUE=0
```

Base Sepolia -> Solana Devnet:

```bash
cd smart-contracts
SEND=1 npx hardhat run scripts/send-hub-to-solana-test.ts --network baseSepoliaTestnet
```

The smoke script sends a canonical bridge envelope through `HubOutboundRouter`
and LayerZero. For the direct receiver mode, `SOLANA_LZ_RECEIVE_VALUE` should
stay `0`; receiver registration pre-creates the receiver state, and the direct
path avoids per-message account allocation during executor delivery. If a future
receiver mode allocates Solana accounts inside `lz_receive`, it must either
pre-create those accounts or use an execution path that can fund rent.

Check Solana delivery with:

```bash
cd solana/bridge-endpoint
npm run devnet:receiver-state
```

For Solana Devnet -> Base Sepolia, configure `solana/bridge-endpoint/.env.testnet.local`:

```env
HUB_EID=40245
HUB_OUTBOUND_ROUTER_ADDRESS=0x3550385d7165C05B607a4E67b38C25A042D2fe10
HUB_INBOUND_INBOX_ADDRESS=0xbA527DEF67a5Cc274Cf2cFaC8Bf1BAAda36eccc0
SOLANA_TO_HUB_TARGET_BYTES32=0xaf662a0d7bc9bad8b5a37fc399299fdad561f3cc857a96ec024150d79612b64d
SOLANA_TO_HUB_PAYLOAD=hello base from solana live
```

Quote and simulate first:

```bash
cd solana/bridge-endpoint
npm run devnet:send-to-hub
```

After reviewing the printed fee, target, payload, and account summary, send:

```bash
npm run devnet:send-to-hub -- --send
```

The script uses the official LayerZero Solana SDK to derive the Endpoint/ULN
remaining accounts for the `quote_send_to_gen_layer` and `send_to_gen_layer`
CPIs. It prints the Solana transaction, LayerZero Scan URL, and canonical bridge
`message_id`.

The script also checks the LayerZero Solana pricefeed before quoting. On Devnet,
LayerZero must have a price row for the destination route; otherwise the
Endpoint cannot quote or send the message even when the OApp path accounts are
initialized. If this fails, use another supported destination EID or have
LayerZero add the missing route.

Check hub delivery with:

```bash
cd smart-contracts
MESSAGE_ID=0x... WAIT=1 npx hardhat run scripts/read-hub-inbox-message.ts --network baseSepoliaTestnet
```

Latest live Base Sepolia proof:

- Base -> Solana source tx:
  `0x5e0e1b725be83290ce8e56bd26c24c69e8a92123b45c34ff60c6c106d8ae2471`
- Base -> Solana destination tx:
  `5mdgnJPVVgj35X4ADsXpBfdkawTmGzafFKKE1d9P1FzdSWbQFaUFCQMJgNjnXXFhkZJiwsrqapSNXSUSySrVtGru`
- Solana -> Base source tx:
  `5vqvnhfzzgzEkuWUAPFFjHYypn2Lns8Tf3ygQs6mBASYCqAgK4XiDUJaL35Tc6Tz78AhVSyhMm6CpWukfyLtHfEo`
- Solana -> Base destination tx:
  `0xf63c3b64d82a057374d3f8eb4346a6f0652746c3749b70ece43077843b0f5c57`

LayerZero Solana Devnet pricefeed routes are required before
`send_to_gen_layer` can quote or send. The Solana pricefeed stores legacy
testnet route IDs for some destinations, so the script checks both `dstEid` and
`dstEid - 30000`. Base Sepolia `40245` maps to `10245` and was routeable in the
April 30, 2026 smoke run. zkSync Sepolia `40305` maps to `10305`; if that route
is absent, Solana -> zkSync cannot be quoted even when the OApp path accounts
are initialized.
