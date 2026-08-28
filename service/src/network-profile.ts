export type GenLayerProfileName = "studionet" | "bradbury";

export interface NetworkProfile {
  name: GenLayerProfileName;
  genlayerNetwork: "studionet" | "testnetBradbury";
  genlayerChainId: number;
  genlayerRpcUrl: string;
  hubRpcUrl: string;
  hubChainId: number;
  hubLayerZeroEid: number;
  targetRpcUrl: string;
  targetChainId: number;
  targetLayerZeroEid: number;
  bridgeSenderAddress?: string;
  targetBridgeSenderAddress: string;
  bridgeForwarderAddress: string;
  bridgeReceiverIcAddress: string;
  hubBridgeReceiverAddress: string;
  targetBridgeReceiverAddress: string;
}

interface DeploymentManifest {
  network: string;
  chainId: number;
  contracts?: Record<string, { address?: string; params?: Record<string, unknown> }>;
  hub?: DeploymentManifest;
  target?: DeploymentManifest;
}

const GENLAYER_PROFILES: Record<GenLayerProfileName, Pick<NetworkProfile, "genlayerNetwork" | "genlayerChainId">> = {
  studionet: { genlayerNetwork: "studionet", genlayerChainId: 61999 },
  bradbury: { genlayerNetwork: "testnetBradbury", genlayerChainId: 4221 },
};

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`Missing required network configuration: ${name}`);
  return value;
}

function positiveInteger(env: NodeJS.ProcessEnv, name: string): number {
  const value = Number(required(env, name));
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return value;
}

function url(env: NodeJS.ProcessEnv, name: string): string {
  const value = required(env, name);
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid URL.`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`${name} must use HTTP or HTTPS.`);
  }
  return value;
}

function address(env: NodeJS.ProcessEnv, name: string): string {
  const value = required(env, name);
  if (!/^0x[a-fA-F0-9]{40}$/.test(value)) {
    throw new Error(`${name} must be a 20-byte EVM address.`);
  }
  return value;
}

function loadManifest(env: NodeJS.ProcessEnv): DeploymentManifest | undefined {
  const filename = env.DEPLOYMENT_MANIFEST?.trim();
  if (!filename) return undefined;
  if (!fs.existsSync(filename)) throw new Error(`Deployment manifest does not exist: ${filename}`);
  let manifest: DeploymentManifest;
  try {
    manifest = JSON.parse(fs.readFileSync(filename, "utf8")) as DeploymentManifest;
  } catch {
    throw new Error(`Deployment manifest is not valid JSON: ${filename}`);
  }
  const isCombined = Boolean(manifest.hub || manifest.target);
  if (isCombined) {
    if (!manifest.hub || !manifest.target) {
      throw new Error("Combined deployment manifest must include both hub and target.");
    }
    if (
      !manifest.hub.network ||
      !Number.isSafeInteger(manifest.hub.chainId) ||
      !manifest.target.network ||
      !Number.isSafeInteger(manifest.target.chainId)
    ) {
      throw new Error("Combined deployment manifest hub and target entries must include network and chainId.");
    }
  } else if (!manifest.network || !Number.isSafeInteger(manifest.chainId)) {
    throw new Error("Deployment manifest must include network and chainId.");
  }
  const configuredHubChainId = env.HUB_CHAIN_ID?.trim();
  if (
    configuredHubChainId &&
    Number(configuredHubChainId) !== (manifest.hub?.chainId ?? manifest.chainId)
  ) {
    throw new Error(
      `Deployment manifest hub chain ID ${manifest.hub?.chainId ?? manifest.chainId} does not match HUB_CHAIN_ID ${configuredHubChainId}.`,
    );
  }
  const configuredTargetChainId = env.TARGET_CHAIN_ID?.trim();
  if (
    manifest.target &&
    configuredTargetChainId &&
    Number(configuredTargetChainId) !== manifest.target.chainId
  ) {
    throw new Error(
      `Deployment manifest target chain ID ${manifest.target.chainId} does not match TARGET_CHAIN_ID ${configuredTargetChainId}.`,
    );
  }
  return manifest;
}

function hydrateFromManifest(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const manifest = loadManifest(env);
  if (!manifest) return env;
  const hydrated = { ...env };
  const hub = manifest.hub ?? manifest;
  const target = manifest.target ?? manifest;
  const sender = target.contracts?.BridgeSender?.address;
  const forwarder = hub.contracts?.BridgeForwarder?.address;
  const receiver = hub.contracts?.BridgeReceiver?.address;
  const targetReceiver = target.contracts?.BridgeReceiver?.address;
  if (!hydrated.TARGET_BRIDGE_SENDER_ADDRESS && sender) hydrated.TARGET_BRIDGE_SENDER_ADDRESS = sender;
  if (!hydrated.BRIDGE_FORWARDER_ADDRESS && forwarder) hydrated.BRIDGE_FORWARDER_ADDRESS = forwarder;
  if (!hydrated.HUB_BRIDGE_RECEIVER_ADDRESS && receiver) hydrated.HUB_BRIDGE_RECEIVER_ADDRESS = receiver;
  if (!hydrated.TARGET_BRIDGE_RECEIVER_ADDRESS && targetReceiver) hydrated.TARGET_BRIDGE_RECEIVER_ADDRESS = targetReceiver;
  const endpoint = hub.contracts?.BridgeReceiver?.params?.endpoint;
  if (!hydrated.LAYERZERO_ENDPOINT && typeof endpoint === "string") hydrated.LAYERZERO_ENDPOINT = endpoint;
  return hydrated;
}

export function loadNetworkProfile(env: NodeJS.ProcessEnv = process.env): NetworkProfile {
  const hydrated = hydrateFromManifest(env);
  const name = required(hydrated, "BRIDGE_NETWORK_PROFILE").toLowerCase() as GenLayerProfileName;
  const preset = GENLAYER_PROFILES[name];
  if (!preset) throw new Error("BRIDGE_NETWORK_PROFILE must be studionet or bradbury.");

  const configuredChainId = positiveInteger(hydrated, "GENLAYER_CHAIN_ID");
  if (configuredChainId !== preset.genlayerChainId) {
    throw new Error(
      `GENLAYER_CHAIN_ID ${configuredChainId} does not match ${name} (${preset.genlayerChainId}).`,
    );
  }

  return {
    name,
    ...preset,
    genlayerRpcUrl: url(hydrated, "GENLAYER_RPC_URL"),
    hubRpcUrl: url(hydrated, "HUB_RPC_URL"),
    hubChainId: positiveInteger(hydrated, "HUB_CHAIN_ID"),
    hubLayerZeroEid: positiveInteger(hydrated, "HUB_LAYERZERO_EID"),
    targetRpcUrl: url(hydrated, "TARGET_RPC_URL"),
    targetChainId: positiveInteger(hydrated, "TARGET_CHAIN_ID"),
    targetLayerZeroEid: positiveInteger(hydrated, "TARGET_LAYERZERO_EID"),
    bridgeSenderAddress: hydrated.BRIDGE_SENDER_ADDRESS ? address(hydrated, "BRIDGE_SENDER_ADDRESS") : undefined,
    targetBridgeSenderAddress: address(hydrated, "TARGET_BRIDGE_SENDER_ADDRESS"),
    bridgeForwarderAddress: address(hydrated, "BRIDGE_FORWARDER_ADDRESS"),
    bridgeReceiverIcAddress: address(hydrated, "BRIDGE_RECEIVER_IC_ADDRESS"),
    hubBridgeReceiverAddress: address(hydrated, "HUB_BRIDGE_RECEIVER_ADDRESS"),
    targetBridgeReceiverAddress: address(hydrated, "TARGET_BRIDGE_RECEIVER_ADDRESS"),
  };
}
import fs from "node:fs";
