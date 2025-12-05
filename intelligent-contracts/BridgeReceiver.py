# v0.1.0
# { "Depends": "py-genlayer:1j12s63yfjpva9ik2xgnffgrs6v44y1f52jvj9w7xvdn7qckd379" }

"""
BridgeReceiver: Receives EVM->GenLayer messages.

Uses PULL model - target contracts call claim_all_messages() to get pending messages.
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
    claimed: bool


class BridgeReceiver(gl.Contract):
    owner: Address
    authorized_relayers: TreeMap[str, bool]
    received_messages: TreeMap[str, bool]
    message_store: TreeMap[str, ReceivedMessage]
    pending_messages: TreeMap[str, DynArray[str]]

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
        """Store a message from EVM for claiming by target contract."""
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
            claimed=False,
        )

        target_lower = target_contract.lower()
        pending = self.pending_messages.get(target_lower)
        if pending is None:
            self.pending_messages[target_lower] = DynArray[str]()
            pending = self.pending_messages[target_lower]
        pending.append(message_id)

    # Message Claiming

    @gl.public.write
    def claim_message(self, message_id: str) -> dict:
        """Claim a single message. Returns message data."""
        msg = self.message_store.get(message_id)
        if msg is None:
            raise ValueError(f"Message not found: {message_id}")
        if msg.claimed:
            raise ValueError(f"Message already claimed: {message_id}")

        msg.claimed = True
        self.message_store[message_id] = msg

        return {
            "source_chain_id": int(msg.source_chain_id),
            "source_sender": msg.source_sender,
            "target_contract": msg.target_contract,
            "data": msg.data,
        }

    @gl.public.write
    def claim_all_messages(self, target_contract: str) -> list:
        """Claim all pending messages for a target contract."""
        target_lower = target_contract.lower()
        pending = self.pending_messages.get(target_lower)
        if pending is None or len(pending) == 0:
            return []

        results = []
        for message_id in pending:
            msg = self.message_store.get(message_id)
            if msg is not None and not msg.claimed:
                msg.claimed = True
                self.message_store[message_id] = msg
                results.append({
                    "message_id": msg.message_id,
                    "source_chain_id": int(msg.source_chain_id),
                    "source_sender": msg.source_sender,
                    "data": msg.data,
                })

        self.pending_messages[target_lower] = DynArray[str]()
        return results

    # Views

    @gl.public.view
    def is_message_processed(self, message_id: str) -> bool:
        return self.received_messages.get(message_id, False)

    @gl.public.view
    def is_message_claimed(self, message_id: str) -> bool:
        msg = self.message_store.get(message_id)
        return msg is not None and msg.claimed

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
            "claimed": msg.claimed,
        }

    @gl.public.view
    def get_pending_messages(self, target_contract: str) -> list[str]:
        target_lower = target_contract.lower()
        pending = self.pending_messages.get(target_lower)
        if pending is None:
            return []
        return [msg_id for msg_id in pending if not self.message_store.get(msg_id).claimed]

    @gl.public.view
    def get_pending_count(self, target_contract: str) -> int:
        return len(self.get_pending_messages(target_contract))

    @gl.public.view
    def is_relayer_authorized(self, relayer: str) -> bool:
        return self.authorized_relayers.get(relayer.lower(), False)

    @gl.public.view
    def get_owner(self) -> str:
        return str(self.owner)

    def _only_owner(self):
        if gl.message.sender_address != self.owner:
            raise ValueError("Only owner can perform this action")
