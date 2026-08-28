import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { loadNetworkProfile } from "../dist/network-profile.js";

function environment(profile, chainId) {
  return {
    BRIDGE_NETWORK_PROFILE: profile,
    GENLAYER_CHAIN_ID: String(chainId),
    GENLAYER_RPC_URL: "https://genlayer.example/rpc",
    HUB_RPC_URL: "https://hub.example/rpc",
    HUB_CHAIN_ID: "300",
    HUB_LAYERZERO_EID: "40305",
    TARGET_RPC_URL: "https://target.example/rpc",
    TARGET_CHAIN_ID: "84532",
    TARGET_LAYERZERO_EID: "40245",
    TARGET_BRIDGE_SENDER_ADDRESS: "0x1111111111111111111111111111111111111111",
    BRIDGE_FORWARDER_ADDRESS: "0x2222222222222222222222222222222222222222",
    BRIDGE_RECEIVER_IC_ADDRESS: "0x3333333333333333333333333333333333333333",
    HUB_BRIDGE_RECEIVER_ADDRESS: "0x4444444444444444444444444444444444444444",
    TARGET_BRIDGE_RECEIVER_ADDRESS: "0x5555555555555555555555555555555555555555",
  };
}

test("loads the Studionet profile", () => {
  const profile = loadNetworkProfile(environment("studionet", 61999));
  assert.equal(profile.genlayerNetwork, "studionet");
  assert.equal(profile.genlayerChainId, 61999);
});

test("loads the Bradbury profile", () => {
  const profile = loadNetworkProfile(environment("bradbury", 4221));
  assert.equal(profile.genlayerNetwork, "testnetBradbury");
  assert.equal(profile.genlayerChainId, 4221);
});

test("rejects a profile and chain ID mismatch", () => {
  assert.throws(
    () => loadNetworkProfile(environment("bradbury", 61999)),
    /does not match bradbury/,
  );
});

test("rejects missing profile selection", () => {
  const env = environment("studionet", 61999);
  delete env.BRIDGE_NETWORK_PROFILE;
  assert.throws(() => loadNetworkProfile(env), /BRIDGE_NETWORK_PROFILE/);
});

test("rejects malformed deployment addresses", () => {
  const env = environment("studionet", 61999);
  env.BRIDGE_FORWARDER_ADDRESS = "0x1234";
  assert.throws(() => loadNetworkProfile(env), /BRIDGE_FORWARDER_ADDRESS/);
});

test("rejects non-HTTP RPC URLs", () => {
  const env = environment("studionet", 61999);
  env.GENLAYER_RPC_URL = "file:///tmp/rpc";
  assert.throws(() => loadNetworkProfile(env), /GENLAYER_RPC_URL/);
});

test("hydrates EVM addresses and endpoint from a deployment manifest", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "counsel-manifest-"));
  const filename = path.join(directory, "network-manifest.json");
  fs.writeFileSync(filename, JSON.stringify({
    network: "zkSyncSepoliaTestnet",
    chainId: 300,
    contracts: {
      BridgeSender: { address: "0x1111111111111111111111111111111111111111" },
      BridgeForwarder: { address: "0x2222222222222222222222222222222222222222" },
      BridgeReceiver: {
        address: "0x4444444444444444444444444444444444444444",
        params: { endpoint: "0x5555555555555555555555555555555555555555" },
      },
    },
  }));
  const env = environment("studionet", 61999);
  delete env.BRIDGE_SENDER_ADDRESS;
  delete env.BRIDGE_FORWARDER_ADDRESS;
  delete env.HUB_BRIDGE_RECEIVER_ADDRESS;
  delete env.LAYERZERO_ENDPOINT;
  env.DEPLOYMENT_MANIFEST = filename;
  const profile = loadNetworkProfile(env);
  assert.equal(profile.targetBridgeSenderAddress, "0x1111111111111111111111111111111111111111");
  assert.equal(profile.bridgeForwarderAddress, "0x2222222222222222222222222222222222222222");
  assert.equal(profile.hubBridgeReceiverAddress, "0x4444444444444444444444444444444444444444");
  fs.rmSync(directory, { recursive: true, force: true });
});

test("rejects a deployment manifest for a different hub chain", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "counsel-manifest-"));
  const filename = path.join(directory, "network-manifest.json");
  fs.writeFileSync(filename, JSON.stringify({ network: "wrong", chainId: 1, contracts: {} }));
  const env = environment("studionet", 61999);
  env.DEPLOYMENT_MANIFEST = filename;
  assert.throws(() => loadNetworkProfile(env), /does not match HUB_CHAIN_ID/);
  fs.rmSync(directory, { recursive: true, force: true });
});

test("hydrates hub and target addresses from a combined manifest", () => {
  const env = environment("studionet", 61999);
  const file = path.join(os.tmpdir(), `counsel-combined-${Date.now()}.json`);
  fs.writeFileSync(file, JSON.stringify({
    hub: {
      network: "zkSyncSepoliaTestnet",
      chainId: 300,
      contracts: {
        BridgeForwarder: { address: "0x2222222222222222222222222222222222222222" },
        BridgeReceiver: {
          address: "0x4444444444444444444444444444444444444444",
          params: { endpoint: "0x5555555555555555555555555555555555555555" },
        },
      },
    },
    target: {
      network: "baseSepoliaTestnet",
      chainId: 84532,
      contracts: {
        BridgeSender: { address: "0x1111111111111111111111111111111111111111" },
        BridgeReceiver: { address: "0x5555555555555555555555555555555555555555" },
      },
    },
  }));
  try {
    env.DEPLOYMENT_MANIFEST = file;
    delete env.BRIDGE_SENDER_ADDRESS;
    delete env.BRIDGE_FORWARDER_ADDRESS;
    delete env.HUB_BRIDGE_RECEIVER_ADDRESS;
    const profile = loadNetworkProfile(env);
    assert.equal(profile.targetBridgeSenderAddress, "0x1111111111111111111111111111111111111111");
    assert.equal(profile.bridgeForwarderAddress, "0x2222222222222222222222222222222222222222");
    assert.equal(profile.hubBridgeReceiverAddress, "0x4444444444444444444444444444444444444444");
    assert.equal(profile.targetBridgeReceiverAddress, "0x5555555555555555555555555555555555555555");
  } finally {
    fs.rmSync(file, { force: true });
  }
});
