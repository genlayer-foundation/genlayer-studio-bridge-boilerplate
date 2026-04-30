# v0.1.0
# { "Depends": "py-genlayer:1j12s63yfjpva9ik2xgnffgrs6v44y1f52jvj9w7xvdn7qckd379" }

"""StringSender: Example that sends strings from GenLayer to EVM via GenLayerOutbox."""

from genlayer import *

genvm_eth = gl.evm


class StringSender(gl.Contract):
    genlayer_outbox: Address
    target_chain_eid: u256
    target_contract: str
    sent_strings: DynArray[str]
    owner: Address

    def __init__(self, genlayer_outbox: str, target_chain_eid: int, target_contract: str):
        self.genlayer_outbox = Address(genlayer_outbox)
        self.target_chain_eid = u256(target_chain_eid)
        self.target_contract = target_contract
        self.owner = gl.message.sender_address

    @gl.public.write
    def set_bridge_sender(self, bridge_sender: str):
        if gl.message.sender_address != self.owner:
            raise ValueError("Only owner")
        self.genlayer_outbox = Address(bridge_sender)

    @gl.public.write
    def set_target(self, target_chain_eid: int, target_contract: str):
        if gl.message.sender_address != self.owner:
            raise ValueError("Only owner")
        self.target_chain_eid = u256(target_chain_eid)
        self.target_contract = target_contract

    @gl.public.write
    def send_string(self, message: str):
        """Send a string to target EVM chain via bridge."""
        abi = [str]
        encoder = genvm_eth.MethodEncoder("", abi, bool)
        message_bytes = encoder.encode_call([message])[4:]  # Remove method selector

        bridge_contract = gl.get_contract_at(self.genlayer_outbox)
        bridge_contract.emit().send_message(
            self.target_chain_eid,
            self._evm_address_to_bytes32(self.target_contract),
            message_bytes,
        )
        self.sent_strings.append(message)

    @gl.public.view
    def get_sent_strings(self) -> list[str]:
        return list(self.sent_strings)

    @gl.public.view
    def get_sent_count(self) -> int:
        return len(self.sent_strings)

    @gl.public.view
    def get_config(self) -> dict:
        return {
            "genlayer_outbox": str(self.genlayer_outbox),
            "target_chain_eid": int(self.target_chain_eid),
            "target_contract": self.target_contract,
            "owner": str(self.owner),
        }

    def _evm_address_to_bytes32(self, address: str) -> bytes:
        addr = Address(address)
        return b"\x00" * 12 + addr.as_bytes
