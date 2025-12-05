# v0.1.0
# { "Depends": "py-genlayer:1j12s63yfjpva9ik2xgnffgrs6v44y1f52jvj9w7xvdn7qckd379" }

"""StringReceiverIC: Example that receives strings from EVM via BridgeReceiver (PULL model)."""

from genlayer import *

genvm_eth = gl.evm


class StringReceiverIC(gl.Contract):
    bridge_receiver: Address
    received_strings: DynArray[str]
    message_sources: TreeMap[u64, str]
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
    def claim_messages(self) -> int:
        """Claim and process all pending messages from the bridge."""
        my_address = str(gl.contract.address)
        bridge = gl.get_contract_at(self.bridge_receiver)
        messages = bridge.call().claim_all_messages(my_address)

        if not messages:
            return 0

        count = 0
        for msg in messages:
            try:
                self._process_message(
                    msg.get("source_chain_id", 0),
                    msg.get("source_sender", ""),
                    msg.get("data", bytes()),
                )
                count += 1
            except Exception as e:
                print(f"Error processing message: {e}")

        return count

    def _process_message(self, source_chain_id: int, source_sender: str, message: bytes):
        decoder = genvm_eth.MethodDecoder([str])
        decoded = decoder.decode(message)
        string_message = decoded[0]

        index = u64(len(self.received_strings))
        self.received_strings.append(string_message)
        self.message_sources[index] = f"chain:{source_chain_id},sender:{source_sender}"

    @gl.public.write
    def process_bridge_message(self, source_chain_id: int, source_sender: str, message: bytes):
        """Legacy push interface for backwards compatibility."""
        if gl.message.sender_address != self.bridge_receiver:
            raise ValueError("Only bridge receiver")
        self._process_message(source_chain_id, source_sender, message)

    @gl.public.view
    def get_received_strings(self) -> list[str]:
        return list(self.received_strings)

    @gl.public.view
    def get_received_count(self) -> int:
        return len(self.received_strings)

    @gl.public.view
    def get_message_source(self, index: int) -> str | None:
        return self.message_sources.get(u64(index))

    @gl.public.view
    def get_config(self) -> dict:
        return {
            "bridge_receiver": str(self.bridge_receiver),
            "owner": str(self.owner),
            "received_count": len(self.received_strings),
        }
