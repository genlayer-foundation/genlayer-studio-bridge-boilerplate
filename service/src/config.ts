import dotenv from 'dotenv';

dotenv.config();

interface Config {
  // GenLayer -> EVM direction
  bridgeSenderAddress?: string;
  bridgeForwarderAddress?: string;
  campaignFactoryAddress?: string;
  forwarderNetworkRpcUrl?: string;
  genlayerRpcUrl?: string;
  privateKey?: string;
  bridgeSyncInterval?: string;
  // EVM -> GenLayer direction
  bridgeReceiverIcAddress?: string;
  zkSyncBridgeReceiverAddress?: string;
  zkSyncRpcUrl?: string;
  evmToGlSyncInterval?: string;
}

function loadConfig(): Config {
  const {
    // GenLayer -> EVM
    BRIDGE_FORWARDER_ADDRESS,
    BRIDGE_SENDER_ADDRESS,
    FORWARDER_NETWORK_RPC_URL,
    GENLAYER_RPC_URL,
    PRIVATE_KEY,
    BRIDGE_SYNC_INTERVAL = '*/5 * * * *', // Default to every 5 minutes
    // EVM -> GenLayer
    BRIDGE_RECEIVER_IC_ADDRESS,
    ZKSYNC_BRIDGE_RECEIVER_ADDRESS,
    ZKSYNC_RPC_URL,
    EVM_TO_GL_SYNC_INTERVAL = '*/1 * * * *', // Default to every 1 minute
  } = process.env;

  try {
    return {
      // GenLayer -> EVM
      bridgeSenderAddress: BRIDGE_SENDER_ADDRESS,
      bridgeForwarderAddress: BRIDGE_FORWARDER_ADDRESS,
      forwarderNetworkRpcUrl: FORWARDER_NETWORK_RPC_URL,
      genlayerRpcUrl: GENLAYER_RPC_URL,
      privateKey: PRIVATE_KEY,
      bridgeSyncInterval: BRIDGE_SYNC_INTERVAL,
      // EVM -> GenLayer
      bridgeReceiverIcAddress: BRIDGE_RECEIVER_IC_ADDRESS,
      zkSyncBridgeReceiverAddress: ZKSYNC_BRIDGE_RECEIVER_ADDRESS,
      zkSyncRpcUrl: ZKSYNC_RPC_URL,
      evmToGlSyncInterval: EVM_TO_GL_SYNC_INTERVAL,
    };
  } catch (error) {
    console.warn('Failed to load config:', error);
    return {};
  }
}

export function getRequiredConfig(key: keyof Config, envKey: string): string {
  const config = loadConfig();
  const value = config[key] || process.env[envKey];
  
  if (!value) {
    throw new Error(`Missing required configuration: ${key}`);
  }
  
  return value;
}

// Export specific getters for each required address
export function getBridgeSenderAddress(): string {
  return getRequiredConfig('bridgeSenderAddress', 'BRIDGE_SENDER_ADDRESS');
}

export function getBridgeForwarderAddress(): string {
  return getRequiredConfig('bridgeForwarderAddress', 'BRIDGE_FORWARDER_ADDRESS');
}

export function getForwarderNetworkRpcUrl(): string {
  return getRequiredConfig('forwarderNetworkRpcUrl', 'FORWARDER_NETWORK_RPC_URL');
}

export function getGenlayerRpcUrl(): string {
  return getRequiredConfig('genlayerRpcUrl', 'GENLAYER_RPC_URL');
}

export function getPrivateKey(): string {
  return getRequiredConfig('privateKey', 'PRIVATE_KEY');
}

export function getBridgeSyncInterval(): string {
  return getRequiredConfig('bridgeSyncInterval', 'BRIDGE_SYNC_INTERVAL');
}

// EVM -> GenLayer getters
export function getBridgeReceiverIcAddress(): string {
  return getRequiredConfig('bridgeReceiverIcAddress', 'BRIDGE_RECEIVER_IC_ADDRESS');
}

export function getZkSyncBridgeReceiverAddress(): string {
  return getRequiredConfig('zkSyncBridgeReceiverAddress', 'ZKSYNC_BRIDGE_RECEIVER_ADDRESS');
}

export function getZkSyncRpcUrl(): string {
  return getRequiredConfig('zkSyncRpcUrl', 'ZKSYNC_RPC_URL');
}

export function getEvmToGlSyncInterval(): string {
  return getRequiredConfig('evmToGlSyncInterval', 'EVM_TO_GL_SYNC_INTERVAL');
}

// Optional config getter (returns undefined instead of throwing)
export function getOptionalConfig(key: keyof Config, envKey: string): string | undefined {
  const config = loadConfig();
  return config[key] || process.env[envKey];
}

// Check if EVM->GL bridging is enabled
export function isEvmToGlBridgingEnabled(): boolean {
  const bridgeReceiverIc = getOptionalConfig('bridgeReceiverIcAddress', 'BRIDGE_RECEIVER_IC_ADDRESS');
  const zkSyncReceiver = getOptionalConfig('zkSyncBridgeReceiverAddress', 'ZKSYNC_BRIDGE_RECEIVER_ADDRESS');
  const zkSyncRpc = getOptionalConfig('zkSyncRpcUrl', 'ZKSYNC_RPC_URL');
  return !!(bridgeReceiverIc && zkSyncReceiver && zkSyncRpc);
}