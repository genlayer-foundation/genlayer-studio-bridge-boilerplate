# v0.1.0
# { "Depends": "py-genlayer:1j12s63yfjpva9ik2xgnffgrs6v44y1f52jvj9w7xvdn7qckd379" }

"""StringSender: Example that sends strings from GenLayer to EVM via BridgeSender."""

from genlayer import *

genvm_eth = gl.evm


class StringSender(gl.Contract):
    bridge_sender: Address
    target_chain_eid: u256
    target_contract: str
    sent_strings: DynArray[str]
    owner: Address

    def __init__(self, bridge_sender: str, target_chain_eid: int, target_contract: str):
        self.bridge_sender = Address(bridge_sender)
        self.target_chain_eid = u256(target_chain_eid)
        self.target_contract = target_contract
        self.owner = gl.message.sender_address

    @gl.public.write
    def set_bridge_sender(self, bridge_sender: str):
        if gl.message.sender_address != self.owner:
            raise ValueError("Only owner")
        self.bridge_sender = Address(bridge_sender)

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

        bridge_contract = gl.get_contract_at(self.bridge_sender)
        bridge_contract.emit().send_message(self.target_chain_eid, self.target_contract, message_bytes)
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
            "bridge_sender": str(self.bridge_sender),
            "target_chain_eid": int(self.target_chain_eid),
            "target_contract": self.target_contract,
            "owner": str(self.owner),
        }
