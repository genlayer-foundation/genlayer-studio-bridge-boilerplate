/**
 * GenLayer -> destination relay
 *
 * Polls GenLayerOutbox for pending messages and relays them
 * via the zkSync HubOutboundRouter to destination chains.
 */

import { ethers } from "ethers";
import { createAccount, createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import type { Address } from "genlayer-js/types";
import { Options } from "@layerzerolabs/lz-v2-utilities";
import {
  getBridgeForwarderAddress,
  getBridgeSenderAddress,
  getForwarderNetworkRpcUrl,
  getGenlayerRpcUrl,
  getPrivateKey,
} from "../config.js";
import { mapValue, toHexBytes } from "../codec.js";

interface BridgeMessage {
  dstEid: number;
  encodedMessage: string;
}

const HUB_OUTBOUND_ROUTER_ABI = [
  "function callRemoteArbitrary(bytes32 txHash, uint32 dstEid, bytes data, bytes options) external payable",
  "function quoteCallRemoteArbitrary(uint32 dstEid, bytes data, bytes options) external view returns (uint256 nativeFee, uint256 lzTokenFee)",
  "function isHashUsed(bytes32 txHash) external view returns (bool)",
];

export class GenLayerToEvmRelay {
  private provider: ethers.JsonRpcProvider;
  private wallet: ethers.Wallet;
  private bridgeForwarder: ethers.Contract;
  private genLayerClient: any;
  private usedHashes: Set<string>;

  constructor() {
    this.provider = new ethers.JsonRpcProvider(getForwarderNetworkRpcUrl());
    this.wallet = new ethers.Wallet(getPrivateKey(), this.provider);

    this.bridgeForwarder = new ethers.Contract(
      getBridgeForwarderAddress(),
      HUB_OUTBOUND_ROUTER_ABI,
      this.wallet
    );

    // Initialize GenLayer client
    const privateKey = getPrivateKey();
    const account = createAccount(`0x${privateKey.replace(/^0x/, "")}`);
    this.genLayerClient = createClient({
      chain: {
        ...studionet,
        rpcUrls: {
          default: { http: [getGenlayerRpcUrl()] },
        },
      },
      account,
    });

    this.usedHashes = new Set<string>();
  }

  private async getPendingMessages(): Promise<string[]> {
    try {
      const response = await this.genLayerClient.readContract({
        address: getBridgeSenderAddress() as Address,
        functionName: "get_message_hashes",
        args: [],
        stateStatus: "accepted",
      });

      if (!Array.isArray(response)) {
        console.error("Unexpected response format:", response);
        return [];
      }

      return response.filter(
        (hash): hash is string => !this.usedHashes.has(hash)
      );
    } catch (error) {
      console.error("Error fetching messages:", error);
      return [];
    }
  }

  private async relayMessage(hash: string): Promise<void> {
    try {
      console.log(`[GL→EVM] Processing message ${hash}`);

      // Check if already relayed
      const isUsed = await this.bridgeForwarder.isHashUsed(`0x${hash}`);
      if (isUsed) {
        console.log(`[GL→EVM] Message ${hash} already relayed, skipping`);
        return;
      }

      // Get message from GenLayer
      const messageResponse: Map<string, any> =
        await this.genLayerClient.readContract({
          address: getBridgeSenderAddress() as Address,
          functionName: "get_message",
          args: [hash],
          stateStatus: "accepted",
        });

      const message: BridgeMessage = {
        dstEid: Number(
          mapValue(messageResponse, "dst_eid")
            ?? mapValue(messageResponse, "target_chain_id")
        ),
        encodedMessage: toHexBytes(
          mapValue(messageResponse, "encoded_message")
            ?? mapValue(messageResponse, "data")
        ),
      };

      console.log(
        `[GL→EVM] Relaying to destination EID ${message.dstEid}`
      );

      // Build LayerZero options
      const optionsHex = Options.newOptions()
        .addExecutorLzReceiveOption(1_000_000, 0)
        .toHex();

      // Get fee quote
      const dstEid = message.dstEid;
      const [nativeFee] = await this.bridgeForwarder.quoteCallRemoteArbitrary(
        dstEid,
        message.encodedMessage,
        optionsHex
      );

      console.log(
        `[GL→EVM] Fee: ${ethers.formatEther(nativeFee)} ETH`
      );

      // Send via LayerZero
      const tx = await this.bridgeForwarder.callRemoteArbitrary(
        `0x${hash}`,
        dstEid,
        message.encodedMessage,
        optionsHex,
        { value: nativeFee }
      );

      console.log(`[GL→EVM] TX: ${tx.hash}`);
      const receipt = await tx.wait();
      console.log(`[GL→EVM] Confirmed in block ${receipt.blockNumber}`);
    } catch (error) {
      console.error(`[GL→EVM] Error relaying ${hash}:`, error);
    }
  }

  public async sync(): Promise<void> {
    try {
      console.log("[GL→EVM] Starting sync...");

      const hashes = await this.getPendingMessages();
      console.log(`[GL→EVM] Found ${hashes.length} messages`);

      for (const hash of hashes) {
        this.usedHashes.add(hash);
        await this.relayMessage(hash);
      }

      console.log("[GL→EVM] Sync complete");
    } catch (error) {
      console.error("[GL→EVM] Sync error:", error);
    }
  }
}
