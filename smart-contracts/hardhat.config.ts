import "@nomicfoundation/hardhat-toolbox";
import '@matterlabs/hardhat-zksync';
import * as dotenv from "dotenv";
import { HardhatUserConfig } from "hardhat/config";

dotenv.config();

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    hardhat: {
      chainId: 31337,
    },
    zkSyncMainnet: {
      url: process.env.ZKSYNC_ERA_RPC_URL || "https://mainnet.era.zksync.io",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 324,
      // zksync: true,
      verifyURL: 'https://zksync2-mainnet-explorer.zksync.io/contract_verification',
    },
    zkSyncSepoliaTestnet: {
      url: process.env.ZKSYNC_SEPOLIA_RPC_URL || "https://sepolia.era.zksync.dev",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 300,
      // zksync: true,
      verifyURL: 'https://explorer.sepolia.era.zksync.dev/contract_verification',
    },
    baseMainnet: {
      url: process.env.BASE_RPC_URL || "https://mainnet.base.org",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 8453,
    },
    baseSepoliaTestnet: {
      url: process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 84532,
    },
  },
  etherscan: {
    apiKey: {
      // zkSync networks - use "123" placeholder
      zkSyncMainnet: "123",
      zkSyncSepoliaTestnet: "123", 
      // Base networks - use standard Etherscan API key (omni-chain)
      baseMainnet: process.env.ETHERSCAN_API_KEY || "",
      baseSepoliaTestnet: process.env.ETHERSCAN_API_KEY || "",
    },
    customChains: [
      {
        network: "zkSyncMainnet",
        chainId: 324,
        urls: {
          apiURL: "https://zksync2-mainnet-explorer.zksync.io/contract_verification",
          browserURL: "https://explorer.zksync.io/",
        },
      },
      {
        network: "zkSyncSepoliaTestnet",
        chainId: 300,
        urls: {
          apiURL: "https://explorer.sepolia.era.zksync.dev/contract_verification",
          browserURL: "https://sepolia.explorer.zksync.io/",
        },
      },
      {
        network: "baseMainnet",
        chainId: 8453,
        urls: {
          apiURL: "https://api.etherscan.io/v2/api?chainid=8453",
          browserURL: "https://basescan.org",
        },
      },
      {
        network: "baseSepoliaTestnet",
        chainId: 84532,
        urls: {
          apiURL: "https://api.etherscan.io/v2/api?chainid=84532",
          browserURL: "https://sepolia.basescan.org",
        },
      },
    ],
  },
};

export default config; 