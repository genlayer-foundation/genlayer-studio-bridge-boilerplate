# GenLayer Bridge Example: Bidirectional Strings

This example demonstrates bidirectional messaging between GenLayer Intelligent
Contracts and EVM smart contracts using the role-named bridge contracts.

## GenLayer -> EVM

```text
StringSender.py
  -> GenLayerOutbox.py
  -> service
  -> HubOutboundRouter.sol
  -> LayerZero
  -> EvmChainInbox.sol
  -> StringReceiver.sol
```

Deploy `StringReceiver.sol` with the `EvmChainInbox` address as its bridge
receiver. Deploy `StringSender.py` with the `GenLayerOutbox.py` address and the
target EVM receiver address.

`StringSender.py` ABI-encodes the string payload, normalizes the EVM target
address into a right-aligned `bytes32`, and queues the message in
`GenLayerOutbox.py`.

## EVM -> GenLayer

```text
StringSenderEvm.sol
  -> EvmChainOutbox.sol
  -> LayerZero
  -> HubInboundInbox.sol
  -> service
  -> GenLayerInbox.py
  -> StringReceiverIC.py
```

Deploy `StringReceiverIC.py` with the `GenLayerInbox.py` address as its bridge
receiver. Deploy `StringSenderEvm.sol` with the `EvmChainOutbox.sol` address and
the target GenLayer IC address.

`StringSenderEvm.sol` keeps the same `sendToGenLayer` interface, so it works
with either the new `EvmChainOutbox.sol` or the legacy `BridgeSender.sol`.

## Contract Reference

- `StringSender.py`: GenLayer example sender using `GenLayerOutbox.py`.
- `StringReceiver.sol`: EVM receiver implementing the new
  `processBridgeMessage(messageId, sourceEid, sourceSender, payload)` callback.
- `StringSenderEvm.sol`: EVM example sender for GenLayer-bound messages.
- `StringReceiverIC.py`: GenLayer receiver called by `GenLayerInbox.py`.
