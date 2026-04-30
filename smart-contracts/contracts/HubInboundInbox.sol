// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ILayerZeroEndpointV2, Origin} from "@layerzerolabs/lz-evm-protocol-v2/contracts/interfaces/ILayerZeroEndpointV2.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ILayerZeroReceiver} from "./interfaces/ILayerZeroReceiver.sol";
import {BridgeCodec} from "./libs/BridgeCodec.sol";

/**
 * @title HubInboundInbox
 * @notice zkSync hub inbox for source-chain messages bound for GenLayer.
 */
contract HubInboundInbox is ILayerZeroReceiver, Ownable, ReentrancyGuard {
    ILayerZeroEndpointV2 public immutable endpoint;

    mapping(uint32 => bytes32) public trustedSourceEndpoints;
    mapping(address => bool) public authorizedRelayers;

    struct PendingMessage {
        bytes32 messageId;
        uint32 srcEid;
        bytes32 srcSender;
        bytes32 target;
        bytes payload;
        bool relayed;
    }

    mapping(bytes32 => PendingMessage) public messages;
    bytes32[] public messageIds;

    event TrustedSourceEndpointSet(uint32 indexed srcEid, bytes32 indexed sourceEndpoint);
    event TrustedSourceEndpointRemoved(uint32 indexed srcEid, bytes32 indexed sourceEndpoint);
    event MessageQueued(bytes32 indexed messageId, uint32 indexed srcEid, bytes32 indexed srcSender, bytes32 target, bytes payload);
    event MessageRelayed(bytes32 indexed messageId);
    event AuthorizedRelayerSet(address indexed relayer, bool authorized);

    constructor(address endpoint_, address owner_) Ownable(owner_) {
        require(endpoint_ != address(0), "HubInboundInbox: endpoint=0");
        endpoint = ILayerZeroEndpointV2(endpoint_);
    }

    function setTrustedSourceEndpoint(uint32 srcEid, bytes32 sourceEndpoint) external onlyOwner {
        require(sourceEndpoint != bytes32(0), "HubInboundInbox: source=0");
        trustedSourceEndpoints[srcEid] = sourceEndpoint;
        emit TrustedSourceEndpointSet(srcEid, sourceEndpoint);
    }

    function removeTrustedSourceEndpoint(uint32 srcEid) external onlyOwner {
        bytes32 sourceEndpoint = trustedSourceEndpoints[srcEid];
        require(sourceEndpoint != bytes32(0), "HubInboundInbox: source not set");
        delete trustedSourceEndpoints[srcEid];
        emit TrustedSourceEndpointRemoved(srcEid, sourceEndpoint);
    }

    function setAuthorizedRelayer(address relayer, bool authorized) external onlyOwner {
        require(relayer != address(0), "HubInboundInbox: relayer=0");
        authorizedRelayers[relayer] = authorized;
        emit AuthorizedRelayerSet(relayer, authorized);
    }

    function allowInitializePath(Origin calldata origin) external view returns (bool) {
        return trustedSourceEndpoints[origin.srcEid] == origin.sender;
    }

    function nextNonce(uint32, bytes32) external pure returns (uint64) {
        return 0;
    }

    function lzReceive(
        Origin calldata origin,
        bytes32,
        bytes calldata encodedMessage,
        address,
        bytes calldata
    ) external payable nonReentrant {
        require(msg.sender == address(endpoint), "HubInboundInbox: only endpoint");
        require(trustedSourceEndpoints[origin.srcEid] == origin.sender, "HubInboundInbox: untrusted source");

        BridgeCodec.Message memory message = BridgeCodec.decode(encodedMessage);
        require(message.version == BridgeCodec.VERSION, "HubInboundInbox: bad version");
        require(message.messageId != bytes32(0), "HubInboundInbox: messageId=0");
        require(message.srcEid == origin.srcEid, "HubInboundInbox: srcEid mismatch");
        require(message.target != bytes32(0), "HubInboundInbox: target=0");
        require(messages[message.messageId].messageId == bytes32(0), "HubInboundInbox: duplicate message");

        messages[message.messageId] = PendingMessage({
            messageId: message.messageId,
            srcEid: message.srcEid,
            srcSender: message.srcSender,
            target: message.target,
            payload: message.payload,
            relayed: false
        });
        messageIds.push(message.messageId);

        emit MessageQueued(message.messageId, message.srcEid, message.srcSender, message.target, message.payload);
    }

    function decodeMessage(bytes calldata encodedMessage) external pure returns (BridgeCodec.Message memory) {
        return BridgeCodec.decode(encodedMessage);
    }

    function getMessageIds() external view returns (bytes32[] memory) {
        return messageIds;
    }

    function getMessageCount() external view returns (uint256) {
        return messageIds.length;
    }

    function getMessage(bytes32 messageId) external view returns (PendingMessage memory) {
        return messages[messageId];
    }

    function markMessageRelayed(bytes32 messageId) external {
        require(authorizedRelayers[msg.sender], "HubInboundInbox: not authorized relayer");
        require(messages[messageId].messageId != bytes32(0), "HubInboundInbox: message not found");
        require(!messages[messageId].relayed, "HubInboundInbox: already relayed");

        messages[messageId].relayed = true;
        emit MessageRelayed(messageId);
    }

    function isMessageRelayed(bytes32 messageId) external view returns (bool) {
        return messages[messageId].relayed;
    }

    function getPendingMessages() external view returns (
        bytes32[] memory pendingIds,
        PendingMessage[] memory pendingMessages
    ) {
        uint256 pendingCount = 0;
        for (uint256 i = 0; i < messageIds.length; i++) {
            if (!messages[messageIds[i]].relayed) {
                pendingCount++;
            }
        }

        pendingIds = new bytes32[](pendingCount);
        pendingMessages = new PendingMessage[](pendingCount);

        uint256 index = 0;
        for (uint256 i = 0; i < messageIds.length; i++) {
            bytes32 messageId = messageIds[i];
            if (!messages[messageId].relayed) {
                pendingIds[index] = messageId;
                pendingMessages[index] = messages[messageId];
                index++;
            }
        }
    }

    // Compatibility aliases for the previous BridgeReceiver service ABI.
    function setTrustedForwarder(uint32 remoteEid, bytes32 remoteForwarder) external onlyOwner {
        require(remoteForwarder != bytes32(0), "HubInboundInbox: source=0");
        trustedSourceEndpoints[remoteEid] = remoteForwarder;
        emit TrustedSourceEndpointSet(remoteEid, remoteForwarder);
    }

    function removeTrustedForwarder(uint32 remoteEid) external onlyOwner {
        bytes32 sourceEndpoint = trustedSourceEndpoints[remoteEid];
        require(sourceEndpoint != bytes32(0), "HubInboundInbox: source not set");
        delete trustedSourceEndpoints[remoteEid];
        emit TrustedSourceEndpointRemoved(remoteEid, sourceEndpoint);
    }

    function getGenLayerMessageIds() external view returns (bytes32[] memory) {
        return messageIds;
    }

    function getGenLayerMessageCount() external view returns (uint256) {
        return messageIds.length;
    }

    function getGenLayerMessage(bytes32 messageId) external view returns (PendingMessage memory) {
        return messages[messageId];
    }

    function getPendingGenLayerMessages() external view returns (
        bytes32[] memory pendingIds,
        PendingMessage[] memory pendingMessages
    ) {
        return this.getPendingMessages();
    }
}
