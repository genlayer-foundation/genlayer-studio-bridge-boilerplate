#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

function argument(name) {
  const index = process.argv.indexOf(`--${name}`);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (!value || value.startsWith("--")) throw new Error(`Missing required argument: --${name}`);
  return value;
}

function readManifest(filename, role) {
  const resolved = path.resolve(filename);
  const manifest = JSON.parse(fs.readFileSync(resolved, "utf8"));
  if (!manifest.network || !Number.isSafeInteger(manifest.chainId)) {
    throw new Error(`${role} manifest must contain network and chainId: ${resolved}`);
  }
  if (!manifest.contracts && manifest.contract && manifest.address) {
    return { ...manifest, contracts: { [manifest.contract]: manifest } };
  }
  if (!manifest.contracts || typeof manifest.contracts !== "object") {
    throw new Error(`${role} manifest has no contracts or contract record: ${resolved}`);
  }
  return manifest;
}

const hub = readManifest(argument("hub"), "Hub");
const target = readManifest(argument("target"), "Target");
const output = path.resolve(argument("output"));
const profile = argument("profile");
const genlayerChainId = Number(argument("genlayer-chain-id"));

if (!Number.isSafeInteger(genlayerChainId) || genlayerChainId <= 0) {
  throw new Error("--genlayer-chain-id must be a positive integer.");
}
if (!hub.contracts.BridgeForwarder || !hub.contracts.BridgeReceiver) {
  throw new Error("Hub manifest must contain BridgeForwarder and BridgeReceiver.");
}
if (!target.contracts.BridgeSender) throw new Error("Target manifest must contain BridgeSender.");

fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, `${JSON.stringify({ profile, genlayerChainId, hub, target }, null, 2)}\n`);
console.log(`Wrote combined deployment manifest: ${output}`);
