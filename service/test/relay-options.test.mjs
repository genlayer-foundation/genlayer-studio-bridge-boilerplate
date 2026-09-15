import assert from "node:assert/strict";
import test from "node:test";
import { Options } from "@layerzerolabs/lz-v2-utilities";
import { GenLayerToEvmRelay } from "../dist/relay/GenLayerToEvm.js";

test("Solana delivery funds message rent and honors the configured allowance", async (t) => {
  // Skip the constructor's network setup; exercise the real relay against RPC boundaries.
  const relay = Object.create(GenLayerToEvmRelay.prototype);
  let dstEid = 40168;
  let sentOptions;
  relay.genLayerClient = { readContract: async () => ({ dst_eid: dstEid, encoded_message: "0x1234" }) };
  relay.bridgeForwarder = {
    isHashUsed: async () => false,
    quoteCallRemoteArbitrary: async () => [1n, 0n],
    callRemoteArbitrary: async (_hash, _eid, _message, options) => {
      sentOptions = options;
      return { hash: "test", wait: async () => ({ blockNumber: 1 }) };
    },
  };
  const oldEnv = { ...process.env };
  t.after(() => { process.env = oldEnv; });
  process.env.GENLAYER_OUTBOX_ADDRESS = "0x" + "11".repeat(20);
  delete process.env.SOLANA_LZ_RECEIVE_VALUE;
  await relay.relayMessage("22".repeat(32));
  // ReceivedMessage takes 1,139 bytes including the Anchor discriminator.
  assert.ok(BigInt(Options.fromOptions(sentOptions).decodeExecutorLzReceiveOption().value.toString()) >= 8_818_320n);
  process.env.SOLANA_LZ_RECEIVE_VALUE = "12000000";
  await relay.relayMessage("23".repeat(32));
  assert.equal(Options.fromOptions(sentOptions).decodeExecutorLzReceiveOption().value.toString(), "12000000");
  dstEid = 40245;
  await relay.relayMessage("24".repeat(32));
  assert.equal(Options.fromOptions(sentOptions).decodeExecutorLzReceiveOption().value.toString(), "0");
});
