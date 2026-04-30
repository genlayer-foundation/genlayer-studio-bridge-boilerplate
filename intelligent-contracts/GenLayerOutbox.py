# v0.2.0
# { "Depends": "py-genlayer:1j12s63yfjpva9ik2xgnffgrs6v44y1f52jvj9w7xvdn7qckd379" }

"""GenLayerOutbox: stores GenLayer-originated bridge messages for the relay service."""

from dataclasses import dataclass
from typing import Any

from genlayer import *
from genlayer.py.keccak import Keccak256

genvm_eth = gl.evm

BRIDGE_ENVELOPE_VERSION = 1
GENLAYER_SOURCE_EID = 61998


@allow_storage
@dataclass
class OutboxMessage:
    dst_eid: u256
    target: bytes
    payload: bytes
    encoded_message: bytes


class GenLayerOutbox(gl.Contract):
    messages: TreeMap[str, OutboxMessage]
    message_nonce: u256

    def __init__(self):
        self.message_nonce = u256(0)

    @gl.public.write
    def send_message(self, dst_eid: int, target: bytes, payload: bytes) -> str:
        """
        Queue a message for a destination chain.

        ``target`` must be a 32 byte cross-chain target identifier. For EVM this
        is a right-aligned address. For Solana this is the native 32 byte pubkey.
        ``payload`` is opaque to the bridge and interpreted by the destination
        receiver.
        """
        target_32 = self._require_bytes32(target, "target")
        nonce = int(self.message_nonce) + 1
        self.message_nonce = u256(nonce)

        sender_32 = self._address_to_bytes32(gl.message.sender_address)
        hasher = Keccak256()
        hasher.update(GENLAYER_SOURCE_EID.to_bytes(4, "big"))
        hasher.update(sender_32)
        hasher.update(target_32)
        hasher.update(payload)
        hasher.update(nonce.to_bytes(32, "big"))
        message_id = hasher.digest()
        message_hash = message_id.hex()

        encoded_message = self._encode_bridge_message(
            message_id,
            GENLAYER_SOURCE_EID,
            sender_32,
            target_32,
            payload,
        )

        self.messages[message_hash] = OutboxMessage(
            dst_eid=u256(dst_eid),
            target=target_32,
            payload=payload,
            encoded_message=encoded_message,
        )
        return message_hash

    @gl.public.view
    def get_message(self, message_hash: str) -> dict[str, Any]:
        return self.messages[message_hash]

    @gl.public.view
    def get_messages(self) -> dict[str, dict[str, Any]]:
        return self.messages

    @gl.public.view
    def get_message_hashes(self) -> list[str]:
        return list(self.messages.keys())

    @gl.public.view
    def get_message_count(self) -> int:
        return len(self.messages.keys())

    def _encode_bridge_message(
        self,
        message_id: bytes,
        src_eid: int,
        src_sender: bytes,
        target: bytes,
        payload: bytes,
    ) -> bytes:
        abi = [
            u16,
            genvm_eth.bytes32,
            u32,
            genvm_eth.bytes32,
            genvm_eth.bytes32,
            bytes,
        ]
        encoder = genvm_eth.MethodEncoder("", abi, bool)
        encoded_call = encoder.encode_call(
            [
                u16(BRIDGE_ENVELOPE_VERSION),
                genvm_eth.bytes32(message_id),
                u32(src_eid),
                genvm_eth.bytes32(src_sender),
                genvm_eth.bytes32(target),
                payload,
            ]
        )
        return encoded_call[4:]

    def _address_to_bytes32(self, address: Address) -> bytes:
        return b"\x00" * 12 + address.as_bytes

    def _require_bytes32(self, value: bytes, name: str) -> bytes:
        value = bytes(value)
        if len(value) != 32:
            raise ValueError(f"{name} must be 32 bytes")
        return value
