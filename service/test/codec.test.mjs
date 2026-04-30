import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  BRIDGE_ENVELOPE_VERSION,
  addressToBytes32,
  bytes32ToAddress,
  decodeBridgeEnvelope,
  encodeBridgeEnvelope,
} from "../dist/codec.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const goldenVector = JSON.parse(
  readFileSync(join(__dirname, "../../test-vectors/bridge-envelope.json"), "utf8")
);

describe("bridge codec", () => {
  it("round-trips the canonical envelope", () => {
    const envelope = {
      version: BRIDGE_ENVELOPE_VERSION,
      messageId: "0x" + "11".repeat(32),
      srcEid: 61998,
      srcSender: "0x" + "22".repeat(32),
      target: "0x" + "33".repeat(32),
      payload: "0x123456",
    };

    const encoded = encodeBridgeEnvelope(envelope);
    assert.deepEqual(decodeBridgeEnvelope(encoded), envelope);
  });

  it("matches the canonical bridge envelope golden vector", () => {
    const envelope = {
      version: goldenVector.version,
      messageId: goldenVector.messageId,
      srcEid: goldenVector.srcEid,
      srcSender: goldenVector.srcSender,
      target: goldenVector.target,
      payload: goldenVector.payload,
    };

    assert.equal(encodeBridgeEnvelope(envelope), goldenVector.encoded);
    assert.deepEqual(decodeBridgeEnvelope(goldenVector.encoded), envelope);
  });

  it("normalizes EVM addresses as right-aligned bytes32 values", () => {
    const address = "0x000000000000000000000000000000000000dEaD";
    const encoded = addressToBytes32(address);

    assert.equal(
      encoded,
      "0x000000000000000000000000000000000000000000000000000000000000dead"
    );
    assert.equal(bytes32ToAddress(encoded), "0x000000000000000000000000000000000000dEaD");
  });
});
