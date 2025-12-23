# v0.2.0
# { "Depends": "py-genlayer:1j12s63yfjpva9ik2xgnffgrs6v44y1f52jvj9w7xvdn7qckd379" }

"""StringReceiverIC: Receives strings from EVM via BridgeReceiver emit()."""

from genlayer import *


class StringReceiverIC(gl.Contract):
    bridge_receiver: Address
    received_strings: DynArray[str]
    owner: Address

    def __init__(self, bridge_receiver: str):
        self.bridge_receiver = Address(bridge_receiver)
        self.owner = gl.message.sender_address

    @gl.public.write
    def set_bridge_receiver(self, bridge_receiver: str):
        if gl.message.sender_address != self.owner:
            raise ValueError("Only owner")
        self.bridge_receiver = Address(bridge_receiver)

    @gl.public.write
    def process_bridge_message(
        self, message_id: str, source_chain_id: int, source_sender: str, message: bytes
    ):
        if gl.message.sender_address != self.bridge_receiver:
            raise ValueError("Only BridgeReceiver")

        string_message = gl.evm.decode(str, message)
        self.received_strings.append(string_message)

    @gl.public.view
    def get_received_strings(self) -> list:
        return list(self.received_strings)

    @gl.public.view
    def get_received_count(self) -> int:
        return len(self.received_strings)
