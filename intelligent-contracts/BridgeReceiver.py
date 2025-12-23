# v0.1.0
# { "Depends": "py-genlayer:1j12s63yfjpva9ik2xgnffgrs6v44y1f52jvj9w7xvdn7qckd379" }

"""
BridgeReceiver for EVM->GenLayer messages.

"""

from dataclasses import dataclass
from genlayer import *


@allow_storage
@dataclass
class ReceivedMessage:
    source_chain_id: u256
    source_sender: str
    target_contract: str
    message_id: str
    data: bytes


class BridgeReceiver(gl.Contract):
    owner: Address
    authorized_relayers: TreeMap[str, bool]
    received_messages: TreeMap[str, bool]
    message_store: TreeMap[str, ReceivedMessage]

    def __init__(self):
        self.owner = gl.message.sender_address

    # Admin

    @gl.public.write
    def transfer_ownership(self, new_owner: str):
        self._only_owner()
        self.owner = Address(new_owner)

    @gl.public.write
    def set_authorized_relayer(self, relayer_address: str, authorized: bool):
        self._only_owner()
        self.authorized_relayers[relayer_address.lower()] = authorized

    # Message Delivery (called by bridge service)

    @gl.public.write
    def receive_message(
        self,
        message_id: str,
        source_chain_id: int,
        source_sender: str,
        target_contract: str,
        data: bytes,
    ):
        """
        Receive and dispatch a message from EVM to target IC (LayerZero pattern).

        1. Validates authorized relayer
        2. Stores message for replay protection
        3. Dispatches to target IC via contract-to-contract call
        """
        caller = str(gl.message.sender_address).lower()
        if not self.authorized_relayers.get(caller, False):
            raise ValueError(f"Unauthorized relayer: {caller}")

        if self.received_messages.get(message_id, False):
            raise ValueError(f"Message already received: {message_id}")

        self.received_messages[message_id] = True
        self.message_store[message_id] = ReceivedMessage(
            source_chain_id=u256(source_chain_id),
            source_sender=source_sender,
            target_contract=target_contract,
            message_id=message_id,
            data=data,
        )

        # Dispatch to target IC (LayerZero pattern)
        target = gl.get_contract_at(Address(target_contract))
        target.emit().process_bridge_message(
            message_id, source_chain_id, source_sender, data
        )

    # Views

    @gl.public.view
    def is_message_processed(self, message_id: str) -> bool:
        return self.received_messages.get(message_id, False)

    @gl.public.view
    def get_message(self, message_id: str) -> dict:
        msg = self.message_store.get(message_id)
        if msg is None:
            return {}
        return {
            "source_chain_id": int(msg.source_chain_id),
            "source_sender": msg.source_sender,
            "target_contract": msg.target_contract,
            "message_id": msg.message_id,
            "data": msg.data,
        }

    @gl.public.view
    def is_relayer_authorized(self, relayer: str) -> bool:
        return self.authorized_relayers.get(relayer.lower(), False)

    @gl.public.view
    def get_owner(self) -> str:
        return str(self.owner)

    def _only_owner(self):
        if gl.message.sender_address != self.owner:
            raise ValueError("Only owner can perform this action")
