/**
 * EVM -> GenLayer Relay
 *
 * Polls zkSync BridgeReceiver for pending messages and relays them
 * to GenLayer BridgeReceiver IC.
 */

import { ethers } from "ethers";
import { createAccount, createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import type { Address } from "genlayer-js/types";
import {
  getBridgeReceiverIcAddress,
  getZkSyncBridgeReceiverAddress,
  getZkSyncRpcUrl,
  getGenlayerRpcUrl,
  getPrivateKey,
} from "../config.js";

interface GenLayerBoundMessage {
  messageId: string;
  srcChainId: number;
  srcSender: string;
  targetContract: string;
  data: string;
  relayed: boolean;
}

const BRIDGE_RECEIVER_ABI = [
  "function getPendingGenLayerMessages() external view returns (bytes32[] messageIds, tuple(bytes32 messageId, uint32 srcChainId, address srcSender, address targetContract, bytes data, bool relayed)[] messages)",
  "function isMessageRelayed(bytes32 messageId) external view returns (bool)",
  "function markMessageRelayed(bytes32 messageId) external",
];

export class EvmToGenLayerRelay {
  private zkSyncProvider: ethers.JsonRpcProvider;
  private zkSyncWallet: ethers.Wallet;
  private zkSyncBridgeReceiver: ethers.Contract;
  private genLayerClient: any;
  private processedMessageIds: Set<string>;

  constructor() {
    this.zkSyncProvider = new ethers.JsonRpcProvider(getZkSyncRpcUrl());
    this.zkSyncWallet = new ethers.Wallet(getPrivateKey(), this.zkSyncProvider);

    this.zkSyncBridgeReceiver = new ethers.Contract(
      getZkSyncBridgeReceiverAddress(),
      BRIDGE_RECEIVER_ABI,
      this.zkSyncWallet
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

    this.processedMessageIds = new Set<string>();

    console.log(
      `[EVM→GL] Initialized. zkSync receiver: ${getZkSyncBridgeReceiverAddress()}`
    );
  }

  private async getPendingMessages(): Promise<GenLayerBoundMessage[]> {
    try {
      const [messageIds, messages] =
        await this.zkSyncBridgeReceiver.getPendingGenLayerMessages();

      console.log(`[EVM→GL] Found ${messageIds.length} pending on zkSync`);

      const newMessages: GenLayerBoundMessage[] = [];
      for (let i = 0; i < messageIds.length; i++) {
        const msgId = messageIds[i];
        if (this.processedMessageIds.has(msgId)) {
          continue;
        }

        const msg = messages[i];
        newMessages.push({
          messageId: msgId,
          srcChainId: Number(msg.srcChainId),
          srcSender: msg.srcSender,
          targetContract: msg.targetContract,
          data: msg.data,
          relayed: msg.relayed,
        });
      }

      return newMessages;
    } catch (error) {
      console.error("[EVM→GL] Error polling zkSync:", error);
      return [];
    }
  }

  private async relayMessage(message: GenLayerBoundMessage): Promise<void> {
    try {
      console.log(`[EVM→GL] Processing message ${message.messageId}`);
      console.log(`  Source: ${message.srcChainId}/${message.srcSender}`);
      console.log(`  Target: ${message.targetContract}`);

      // Check if already on GenLayer
      const isProcessed = await this.genLayerClient.readContract({
        address: getBridgeReceiverIcAddress() as Address,
        functionName: "is_message_processed",
        args: [message.messageId],
        stateStatus: "accepted",
      });

      if (isProcessed) {
        console.log(`[EVM→GL] Already on GenLayer, marking on zkSync`);
        await this.markRelayedOnZkSync(message.messageId);
        this.processedMessageIds.add(message.messageId);
        return;
      }

      // Convert data to bytes
      let messageData: string | Uint8Array = message.data;
      if (typeof messageData === "string" && messageData.startsWith("0x")) {
        messageData = new Uint8Array(
          Buffer.from(messageData.slice(2), "hex")
        );
      }

      // Submit to GenLayer
      const result = await this.genLayerClient.writeContract({
        address: getBridgeReceiverIcAddress() as Address,
        functionName: "receive_message",
        args: [
          message.messageId,
          message.srcChainId,
          message.srcSender,
          message.targetContract,
          messageData,
        ],
      });

      console.log(`[EVM→GL] Submitted to GenLayer. TX: ${result.hash}`);

      // Mark on zkSync
      await this.markRelayedOnZkSync(message.messageId);
      this.processedMessageIds.add(message.messageId);
    } catch (error) {
      console.error(`[EVM→GL] Error relaying ${message.messageId}:`, error);
    }
  }

  private async markRelayedOnZkSync(messageId: string): Promise<void> {
    try {
      console.log(`[EVM→GL] Marking ${messageId} relayed on zkSync`);
      const tx = await this.zkSyncBridgeReceiver.markMessageRelayed(messageId);
      await tx.wait();
      console.log(`[EVM→GL] Marked relayed`);
    } catch (error) {
      console.error(`[EVM→GL] Error marking relayed:`, error);
    }
  }

  public async sync(): Promise<void> {
    try {
      console.log("[EVM→GL] Starting sync...");

      const messages = await this.getPendingMessages();
      console.log(`[EVM→GL] Found ${messages.length} new messages`);

      for (const message of messages) {
        await this.relayMessage(message);
      }

      console.log("[EVM→GL] Sync complete");
    } catch (error) {
      console.error("[EVM→GL] Sync error:", error);
    }
  }
}
