// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ILayerZeroEndpointV2, Origin} from "@layerzerolabs/lz-evm-protocol-v2/contracts/interfaces/ILayerZeroEndpointV2.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ILayerZeroReceiver} from "./interfaces/ILayerZeroReceiver.sol";
import {IGenLayerBridgeReceiver} from "./interfaces/IGenLayerBridgeReceiver.sol";

/**
 * @title BridgeReceiver
 * @notice Receives EVM->GenLayer messages via LayerZero and stores them for polling.
 *         Bridge service polls pending messages and relays to GenLayer.
 */
contract BridgeReceiver is ILayerZeroReceiver, Ownable, ReentrancyGuard {
    ILayerZeroEndpointV2 public immutable endpoint;

    mapping(uint32 => bytes32) public trustedForwarders;

    struct GenLayerMessage {
        bytes32 messageId;
        uint32 srcChainId;
        address srcSender;
        address targetContract;
        bytes data;
        bool relayed;
    }

    mapping(bytes32 => GenLayerMessage) public genLayerMessages;
    bytes32[] public genLayerMessageIds;
    mapping(address => bool) public authorizedRelayers;

    event TrustedForwarderSet(uint32 indexed remoteEid, bytes32 indexed remoteForwarder);
    event TrustedForwarderRemoved(uint32 indexed remoteEid, bytes32 indexed remoteForwarder);
    event ForwardCallSuccess(uint32 indexed srcEid, bytes32 indexed srcSender, address localContract, bytes callData);
    event MessageForGenLayer(bytes32 indexed messageId, uint32 srcChainId, address srcSender, address targetContract, bytes data);
    event GenLayerMessageRelayed(bytes32 indexed messageId);
    event AuthorizedRelayerSet(address indexed relayer, bool authorized);

    constructor(address _endpoint, address initialOwner) Ownable(initialOwner) {
        require(_endpoint != address(0), "BridgeReceiver: _endpoint=0");
        endpoint = ILayerZeroEndpointV2(_endpoint);
    }

    function setTrustedForwarder(uint32 _remoteEid, bytes32 _remoteForwarder) external onlyOwner {
        require(_remoteForwarder != bytes32(0), "BridgeReceiver: _remoteForwarder=0");
        trustedForwarders[_remoteEid] = _remoteForwarder;
        emit TrustedForwarderSet(_remoteEid, _remoteForwarder);
    }

    function removeTrustedForwarder(uint32 _remoteEid) external onlyOwner {
        require(trustedForwarders[_remoteEid] != bytes32(0), "BridgeReceiver: no forwarder set");
        emit TrustedForwarderRemoved(_remoteEid, trustedForwarders[_remoteEid]);
        delete trustedForwarders[_remoteEid];
    }

    // ILayerZeroReceiver

    function allowInitializePath(Origin calldata _origin) external view returns (bool) {
        return trustedForwarders[_origin.srcEid] == _origin.sender;
    }

    function nextNonce(uint32, bytes32) external pure returns (uint64) {
        return 0;
    }

    function lzReceive(
        Origin calldata _origin,
        bytes32,
        bytes calldata _message,
        address,
        bytes calldata
    ) external payable nonReentrant {
        require(msg.sender == address(endpoint), "BridgeReceiver: only Endpoint can call");
        require(trustedForwarders[_origin.srcEid] == _origin.sender, "BridgeReceiver: untrusted forwarder");
        _handleGenLayerMessage(_message);
    }

    function decodeGenLayerMessage(bytes calldata _message) external pure returns (
        uint32 srcChainId,
        address srcSender,
        address targetContract,
        bytes memory data,
        bytes32 messageId
    ) {
        return abi.decode(_message, (uint32, address, address, bytes, bytes32));
    }

    function _handleGenLayerMessage(bytes calldata _message) internal {
        (
            uint32 srcChainId,
            address srcSender,
            address targetContract,
            bytes memory data,
            bytes32 messageId
        ) = abi.decode(_message, (uint32, address, address, bytes, bytes32));

        genLayerMessages[messageId] = GenLayerMessage({
            messageId: messageId,
            srcChainId: srcChainId,
            srcSender: srcSender,
            targetContract: targetContract,
            data: data,
            relayed: false
        });
        genLayerMessageIds.push(messageId);

        emit MessageForGenLayer(messageId, srcChainId, srcSender, targetContract, data);
    }

    // Relayer Management

    function setAuthorizedRelayer(address _relayer, bool _authorized) external onlyOwner {
        require(_relayer != address(0), "BridgeReceiver: _relayer=0");
        authorizedRelayers[_relayer] = _authorized;
        emit AuthorizedRelayerSet(_relayer, _authorized);
    }

    // Message Polling

    function getGenLayerMessageIds() external view returns (bytes32[] memory) {
        return genLayerMessageIds;
    }

    function getGenLayerMessageCount() external view returns (uint256) {
        return genLayerMessageIds.length;
    }

    function getGenLayerMessage(bytes32 _messageId) external view returns (GenLayerMessage memory) {
        return genLayerMessages[_messageId];
    }

    function markMessageRelayed(bytes32 _messageId) external {
        require(authorizedRelayers[msg.sender], "BridgeReceiver: not authorized relayer");
        require(genLayerMessages[_messageId].messageId != bytes32(0), "BridgeReceiver: message not found");
        require(!genLayerMessages[_messageId].relayed, "BridgeReceiver: already relayed");

        genLayerMessages[_messageId].relayed = true;
        emit GenLayerMessageRelayed(_messageId);
    }

    function isMessageRelayed(bytes32 _messageId) external view returns (bool) {
        return genLayerMessages[_messageId].relayed;
    }

    function getPendingGenLayerMessages() external view returns (
        bytes32[] memory messageIds,
        GenLayerMessage[] memory messages
    ) {
        uint256 pendingCount = 0;
        for (uint256 i = 0; i < genLayerMessageIds.length; i++) {
            if (!genLayerMessages[genLayerMessageIds[i]].relayed) {
                pendingCount++;
            }
        }

        messageIds = new bytes32[](pendingCount);
        messages = new GenLayerMessage[](pendingCount);

        uint256 index = 0;
        for (uint256 i = 0; i < genLayerMessageIds.length; i++) {
            bytes32 msgId = genLayerMessageIds[i];
            if (!genLayerMessages[msgId].relayed) {
                messageIds[index] = msgId;
                messages[index] = genLayerMessages[msgId];
                index++;
            }
        }

        return (messageIds, messages);
    }
}
