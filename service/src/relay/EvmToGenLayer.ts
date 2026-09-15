/**
 * source chain -> GenLayer relay
 *
 * Polls zkSync HubInboundInbox for pending messages and relays them
 * to GenLayerInbox, which dispatches to target ICs.
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
import { bytes32ToAddress, toUint8Array } from "../codec.js";

interface GenLayerBoundMessage {
  messageId: string;
  srcEid: number;
  srcSender: string;
  target: string;
  payload: string;
  relayed: boolean;
}

const HUB_INBOUND_INBOX_ABI = [
  "function getPendingMessages() external view returns (bytes32[] messageIds, tuple(bytes32 messageId, uint32 srcEid, bytes32 srcSender, bytes32 target, bytes payload, bool relayed)[] messages)",
  "function getPendingGenLayerMessages() external view returns (bytes32[] messageIds, tuple(bytes32 messageId, uint32 srcEid, bytes32 srcSender, bytes32 target, bytes payload, bool relayed)[] messages)",
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
      HUB_INBOUND_INBOX_ABI,
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
      `[EVM→GL] Initialized. hub inbound inbox: ${getZkSyncBridgeReceiverAddress()}`
    );
  }

  private async getPendingMessages(): Promise<GenLayerBoundMessage[]> {
    try {
      let messageIds: string[];
      let messages: any[];
      try {
        [messageIds, messages] =
          await this.zkSyncBridgeReceiver.getPendingMessages();
      } catch {
        [messageIds, messages] =
          await this.zkSyncBridgeReceiver.getPendingGenLayerMessages();
      }

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
          srcEid: Number(msg.srcEid ?? msg.srcChainId),
          srcSender: msg.srcSender,
          target: msg.target ?? msg.targetContract,
          payload: msg.payload ?? msg.data,
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
      console.log(`  Source: ${message.srcEid}/${message.srcSender}`);
      console.log(`  Target: ${message.target}`);

      // Check if already on GenLayerInbox
      const isProcessed = await this.genLayerClient.readContract({
        address: getBridgeReceiverIcAddress() as Address,
        functionName: "is_message_processed",
        args: [message.messageId],
        stateStatus: "accepted",
      });

      if (isProcessed) {
        console.log(`[EVM→GL] Already in GenLayerInbox, marking on zkSync`);
        await this.markRelayedOnZkSync(message.messageId);
        this.processedMessageIds.add(message.messageId);
        return;
      }

      const targetContract = bytes32ToAddress(message.target);
      const messageData = toUint8Array(message.payload);

      // Call GenLayerInbox, which stores + emit() dispatches to target
      const txHash = await this.genLayerClient.writeContract({
        address: getBridgeReceiverIcAddress() as Address,
        functionName: "receive_message",
        args: [
          message.messageId,
          message.srcEid,
          message.srcSender,
          targetContract,
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
