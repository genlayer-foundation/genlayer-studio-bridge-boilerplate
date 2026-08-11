import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeMessageHash,
  readMessageField,
  shouldRememberRelayedHash,
} from "./message.js";

test("reads GenLayerJS object responses", () => {
  const response = { data: "0x1234", target_chain_id: 40245 };
  assert.equal(readMessageField(response, "data"), "0x1234");
  assert.equal(readMessageField(response, "target_chain_id"), 40245);
});

test("keeps Map responses compatible", () => {
  const response = new Map<string, unknown>([["data", "0xabcd"]]);
  assert.equal(readMessageField(response, "data"), "0xabcd");
});

test("normalizes relay hashes and remembers only successful relays", () => {
  assert.equal(normalizeMessageHash("0xAbCd"), "abcd");
  assert.equal(shouldRememberRelayedHash(true), true);
  assert.equal(shouldRememberRelayedHash(false), false);
});
