export interface EvmNetworkProfile {
  name: string;
  chainId: number;
  layerZeroEid: number;
  role: "hub" | "target" | "local";
}
const NETWORK_PROFILES: Record<string, EvmNetworkProfile> = {
  hardhat: { name: "hardhat", chainId: 31337, layerZeroEid: 0, role: "local" },
  localhost: { name: "localhost", chainId: 31337, layerZeroEid: 0, role: "local" },
  zkSyncSepoliaTestnet: { name: "zkSyncSepoliaTestnet", chainId: 300, layerZeroEid: 40305, role: "hub" },
  zkSyncMainnet: { name: "zkSyncMainnet", chainId: 324, layerZeroEid: 30165, role: "hub" },
  baseSepoliaTestnet: { name: "baseSepoliaTestnet", chainId: 84532, layerZeroEid: 40245, role: "target" },
  baseMainnet: { name: "baseMainnet", chainId: 8453, layerZeroEid: 30184, role: "target" },
};

export function getEvmNetworkProfile(name: string): EvmNetworkProfile {
  const profile = NETWORK_PROFILES[name];
  if (!profile) throw new Error(`Unsupported EVM network: ${name}`);
  return profile;
}

export function assertChainId(profile: EvmNetworkProfile, actualChainId: bigint): void {
  if (actualChainId !== BigInt(profile.chainId)) {
    throw new Error(
      `Network ${profile.name} reported chain ID ${actualChainId}, expected ${profile.chainId}.`,
    );
  }
}

export function getRequiredLayerZeroEndpoint(env: NodeJS.ProcessEnv): string {
  const endpoint = env.LAYERZERO_ENDPOINT?.trim();
  if (!endpoint) throw new Error("Missing required environment variable: LAYERZERO_ENDPOINT");
  if (!/^0x[a-fA-F0-9]{40}$/.test(endpoint)) {
    throw new Error("LAYERZERO_ENDPOINT must be a 20-byte EVM address");
  }
  return endpoint;
}
