from pathlib import Path


def test_message_ids_include_outbox_identity(direct_vm, direct_deploy, direct_alice, monkeypatch):
    outbox = direct_deploy(str(Path(__file__).resolve().parents[1] / "GenLayerOutbox.py"))
    from genlayer import Address, gl

    direct_vm.sender = direct_alice
    target = bytes.fromhex("00" * 12 + "11" * 20)
    initial = direct_vm.snapshot()
    first_id = outbox.send_message(40168, target, b"hello")
    assert outbox.send_message(40168, target, b"hello") != first_id
    # Model a fresh outbox: same empty storage and sender, different contract identity.
    direct_vm.revert(initial)
    monkeypatch.setattr(gl, "message", gl.message._replace(contract_address=Address(b"\x22" * 20)))
    assert outbox.send_message(40168, target, b"hello") != first_id
