/**
 * GenLayer -> EVM Relay
 *
 * Polls GenLayer BridgeSender for pending messages and relays them
 * via zkSync BridgeForwarder to destination EVM chains.
 */

import { ethers } from "ethers";
import { createAccount, createClient } from "genlayer-js";
import { testnetBradbury } from "genlayer-js/chains";
import type { Address } from "genlayer-js/types";
import { Options } from "@layerzerolabs/lz-v2-utilities";
import {
  getBridgeForwarderAddress,
  getBridgeSenderAddress,
  getForwarderNetworkRpcUrl,
  getGenlayerRpcUrl,
  getPrivateKey,
} from "../config.js";

interface BridgeMessage {
  targetChainId: number;
  targetContract: string;
  data: string;
}

type MessageResponse = Map<string, unknown> | Record<string, unknown>;

const BRIDGE_FORWARDER_ABI = [
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
      BRIDGE_FORWARDER_ABI,
      this.wallet
    );

    // Initialize GenLayer client
    const privateKey = getPrivateKey();
    const account = createAccount(`0x${privateKey.replace(/^0x/, "")}`);
    this.genLayerClient = createClient({
      chain: {
        ...testnetBradbury,
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

      return response.filter((hash): hash is string => {
        const normalized = hash.replace(/^0x/, "").toLowerCase();
        return !this.usedHashes.has(normalized);
      });
    } catch (error) {
      console.error("Error fetching messages:", error);
      return [];
    }
  }

  private async relayMessage(hash: string): Promise<boolean> {
    try {
      const normalizedHash = hash.replace(/^0x/, "").toLowerCase();
      console.log(`[GL→EVM] Processing message ${normalizedHash}`);

      // Check if already relayed
      const isUsed = await this.bridgeForwarder.isHashUsed(`0x${normalizedHash}`);
      if (isUsed) {
        console.log(`[GL→EVM] Message ${normalizedHash} already relayed, skipping`);
        return true;
      }

      // Get message from GenLayer
      const messageResponse: MessageResponse =
        await this.genLayerClient.readContract({
          address: getBridgeSenderAddress() as Address,
          functionName: "get_message",
          args: [hash],
          stateStatus: "accepted",
        });

      const readField = (name: string): unknown =>
        messageResponse instanceof Map
          ? messageResponse.get(name)
          : messageResponse[name];

      // Convert data to hex
      let messageData = readField("data");
      if (messageData instanceof Uint8Array || Buffer.isBuffer(messageData)) {
        messageData = "0x" + Buffer.from(messageData).toString("hex");
      } else if (typeof messageData === "string" && !messageData.startsWith("0x")) {
        messageData = "0x" + messageData;
      }

      if (typeof messageData !== "string") {
        throw new Error("GenLayer message data is not bytes-like");
      }

      const targetChainId = Number(readField("target_chain_id"));
      const targetContract = readField("target_contract");
      if (!Number.isInteger(targetChainId) || typeof targetContract !== "string") {
        throw new Error("GenLayer message has invalid target fields");
      }

      const message: BridgeMessage = {
        targetChainId,
        targetContract,
        data: messageData,
      };

      console.log(
        `[GL→EVM] Relaying to chain ${message.targetChainId}/${message.targetContract}`
      );

      // Build LayerZero options
      const optionsHex = Options.newOptions()
        .addExecutorLzReceiveOption(1_000_000, 0)
        .toHex();

      // Get fee quote
      const dstEid = message.targetChainId; // Already LZ EID
      const [nativeFee] = await this.bridgeForwarder.quoteCallRemoteArbitrary(
        dstEid,
        message.data,
        optionsHex
      );

      console.log(
        `[GL→EVM] Fee: ${ethers.formatEther(nativeFee)} ETH`
      );

      // Send via LayerZero
      const tx = await this.bridgeForwarder.callRemoteArbitrary(
        `0x${normalizedHash}`,
        dstEid,
        message.data,
        optionsHex,
        { value: nativeFee }
      );

      console.log(`[GL→EVM] TX: ${tx.hash}`);
      const receipt = await tx.wait();
      console.log(`[GL→EVM] Confirmed in block ${receipt.blockNumber}`);
      return true;
    } catch (error) {
      console.error(`[GL→EVM] Error relaying ${hash}:`, error);
      return false;
    }
  }

  public async sync(): Promise<void> {
    try {
      console.log("[GL→EVM] Starting sync...");

      const hashes = await this.getPendingMessages();
      console.log(`[GL→EVM] Found ${hashes.length} messages`);

      for (const hash of hashes) {
        const normalizedHash = hash.replace(/^0x/, "").toLowerCase();
        const relayed = await this.relayMessage(hash);
        if (relayed) {
          this.usedHashes.add(normalizedHash);
        }
      }

      console.log("[GL→EVM] Sync complete");
    } catch (error) {
      console.error("[GL→EVM] Sync error:", error);
    }
  }
}
