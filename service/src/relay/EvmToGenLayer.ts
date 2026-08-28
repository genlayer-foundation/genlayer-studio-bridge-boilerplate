/**
 * EVM -> GenLayer Relay (LayerZero Pattern)
 *
 * Polls the configured hub BridgeReceiver for pending messages and relays them
 * to GenLayer BridgeReceiver IC, which dispatches to target ICs.
 */

import { ethers } from "ethers";
import type { Address } from "genlayer-js/types";
import {
  getBridgeReceiverIcAddress,
  getZkSyncBridgeReceiverAddress,
  getZkSyncRpcUrl,
  getGenlayerRpcUrl,
  getPrivateKey,
} from "../config.js";
import { createConfiguredGenLayerClient } from "../genlayer-client.js";

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
  private hubProvider: ethers.JsonRpcProvider;
  private hubWallet: ethers.Wallet;
  private hubBridgeReceiver: ethers.Contract;
  private genLayerClient: any;
  private processedMessageIds: Set<string>;

  constructor() {
    this.hubProvider = new ethers.JsonRpcProvider(getZkSyncRpcUrl());
    this.hubWallet = new ethers.Wallet(getPrivateKey(), this.hubProvider);

    this.hubBridgeReceiver = new ethers.Contract(
      getZkSyncBridgeReceiverAddress(),
      BRIDGE_RECEIVER_ABI,
      this.hubWallet
    );

    this.genLayerClient = createConfiguredGenLayerClient();

    this.processedMessageIds = new Set<string>();

    console.log(
      `[EVM→GL] Initialized. Hub receiver: ${getZkSyncBridgeReceiverAddress()}`
    );
  }

  private async getPendingMessages(): Promise<GenLayerBoundMessage[]> {
    try {
      const [messageIds, messages] =
        await this.hubBridgeReceiver.getPendingGenLayerMessages();

      console.log(`[EVM→GL] Found ${messageIds.length} pending on the hub`);

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
      console.error("[EVM→GL] Error polling hub:", error);
      return [];
    }
  }

  private async relayMessage(message: GenLayerBoundMessage): Promise<void> {
    try {
      console.log(`[EVM→GL] Processing message ${message.messageId}`);
      console.log(`  Source: ${message.srcChainId}/${message.srcSender}`);
      console.log(`  Target: ${message.targetContract}`);

      // Check if already on GenLayer BridgeReceiver
      const isProcessed = await this.genLayerClient.readContract({
        address: getBridgeReceiverIcAddress() as Address,
        functionName: "is_message_processed",
        args: [message.messageId],
        stateStatus: "accepted",
      });

      if (isProcessed) {
        console.log(`[EVM→GL] Already in BridgeReceiver, marking on the hub`);
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

      // Call BridgeReceiver which stores + emit() dispatches to target
      const txHash = await this.genLayerClient.writeContract({
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
      console.log(`[EVM→GL] TX: ${txHash}`);

      await this.genLayerClient.waitForTransactionReceipt({
        hash: txHash,
        status: "ACCEPTED",
        retries: 30,
      });

      await this.markRelayedOnZkSync(message.messageId);
      this.processedMessageIds.add(message.messageId);
      console.log(`[EVM→GL] Relayed successfully`);
    } catch (error) {
      console.error(`[EVM→GL] Error relaying ${message.messageId}:`, error);
    }
  }

  private async markRelayedOnZkSync(messageId: string): Promise<void> {
    try {
      console.log(`[EVM→GL] Marking ${messageId} relayed on the hub`);
      const tx = await this.hubBridgeReceiver.markMessageRelayed(messageId);
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
