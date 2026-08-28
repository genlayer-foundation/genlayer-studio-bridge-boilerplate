import dotenv from 'dotenv';
import { loadNetworkProfile, type NetworkProfile } from './network-profile.js';

dotenv.config();

let cachedProfile: NetworkProfile | undefined;

export function getNetworkProfile(): NetworkProfile {
  cachedProfile ??= loadNetworkProfile();
  return cachedProfile;
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required configuration: ${name}`);
  return value;
}

// Export specific getters for each required address
export function getBridgeSenderAddress(): string {
  const address = getNetworkProfile().bridgeSenderAddress;
  if (!address) throw new Error("Missing BRIDGE_SENDER_ADDRESS for the GenLayer BridgeSender contract.");
  return address;
}

export function getTargetBridgeSenderAddress(): string {
  return getNetworkProfile().targetBridgeSenderAddress;
}

export function getBridgeForwarderAddress(): string {
  return getNetworkProfile().bridgeForwarderAddress;
}

export function getForwarderNetworkRpcUrl(): string {
  return getNetworkProfile().hubRpcUrl;
}

export function getGenlayerRpcUrl(): string {
  return getNetworkProfile().genlayerRpcUrl;
}

export function getPrivateKey(): string {
  return required('PRIVATE_KEY');
}

export function getBridgeSyncInterval(): string {
  return process.env.BRIDGE_SYNC_INTERVAL?.trim() || '*/5 * * * *';
}

// EVM -> GenLayer getters
export function getBridgeReceiverIcAddress(): string {
  return getNetworkProfile().bridgeReceiverIcAddress;
}

export function getZkSyncBridgeReceiverAddress(): string {
  return getNetworkProfile().hubBridgeReceiverAddress;
}

export function getZkSyncRpcUrl(): string {
  return getNetworkProfile().hubRpcUrl;
}

export function getEvmToGlSyncInterval(): string {
  return process.env.EVM_TO_GL_SYNC_INTERVAL?.trim() || '*/1 * * * *';
}

// Check if EVM->GL bridging is enabled
export function isEvmToGlBridgingEnabled(): boolean {
  try {
    getNetworkProfile();
    return true;
  } catch {
    return false;
  }
}

export function isGenLayerToEvmBridgingEnabled(): boolean {
  try {
    return Boolean(getNetworkProfile().bridgeSenderAddress);
  } catch {
    return false;
  }
}
