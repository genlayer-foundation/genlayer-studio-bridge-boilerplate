# v0.1.0
# { "Depends": "py-genlayer:1j12s63yfjpva9ik2xgnffgrs6v44y1f52jvj9w7xvdn7qckd379" }

"""Disposable Bradbury bridge proof sender with fixed, reviewed targets."""

from genlayer import *

genvm_eth = gl.evm


class BradburyStringSender(gl.Contract):
    bridge_sender: Address
    target_chain_eid: u256
    target_contract: str
    sent_strings: DynArray[str]

    def __init__(self):
        self.bridge_sender = Address("0xCE4788042e60FE1Cef7D5351aEd0D2f43EC92A56")
        self.target_chain_eid = u256(40245)
        self.target_contract = "0x7a60ccAdBD46c926E7f76100168e6b5b60d4e681"

    @gl.public.write
    def send_string(self, message: str):
        encoder = genvm_eth.MethodEncoder("", [str], bool)
        message_bytes = encoder.encode_call([message])[4:]
        bridge_contract = gl.get_contract_at(self.bridge_sender)
        bridge_contract.emit().send_message(self.target_chain_eid, self.target_contract, message_bytes)
        self.sent_strings.append(message)

    @gl.public.view
    def get_config(self) -> dict:
        return {
            "bridge_sender": str(self.bridge_sender),
            "target_chain_eid": int(self.target_chain_eid),
            "target_contract": self.target_contract,
        }
