# v0.1.0
# { "Depends": "py-genlayer:1j12s63yfjpva9ik2xgnffgrs6v44y1f52jvj9w7xvdn7qckd379" }

"""BridgeSender: Sends messages from GenLayer to EVM chains via the bridge service."""

from dataclasses import dataclass
from datetime import datetime
from typing import Any

from genlayer import *
from genlayer.py.keccak import Keccak256

genvm_eth = gl.evm


@allow_storage
@dataclass
class MessageData:
    target_chain_id: u256
    target_contract: str
    data: bytes


class BridgeSender(gl.Contract):
    messages: TreeMap[str, MessageData]

    def __init__(self):
        pass

    @gl.public.write
    def send_message(self, target_chain_id: int, target_contract: str, data: bytes) -> str:
        """Send a message to be bridged. Returns message hash for tracking."""
        hasher = Keccak256()
        hasher.update(datetime.now().isoformat().encode())
        hasher.update(gl.message.sender_address.as_bytes)
        hasher.update(target_contract.encode())
        hasher.update(data)

        message_hash = hasher.digest().hex()

        abi = [u32, Address, Address, bytes]
        encoder = genvm_eth.MethodEncoder("", abi, bool)
        message_data = [61998, gl.message.sender_address, Address(target_contract), data]
        message_bytes = encoder.encode_call(message_data)[4:]  # Remove method selector

        self.messages[message_hash] = MessageData(target_chain_id, target_contract, message_bytes)
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
