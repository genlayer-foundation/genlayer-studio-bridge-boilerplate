// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ILayerZeroEndpointV2, Origin} from "@layerzerolabs/lz-evm-protocol-v2/contracts/interfaces/ILayerZeroEndpointV2.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ILayerZeroReceiver} from "./interfaces/ILayerZeroReceiver.sol";
import {BridgeCodec} from "./libs/BridgeCodec.sol";
import {IBridgeMessageReceiver} from "./interfaces/IBridgeMessageReceiver.sol";

/**
 * @title EvmChainInbox
 * @notice Destination-chain endpoint for messages originating from GenLayer.
 */
contract EvmChainInbox is ILayerZeroReceiver, Ownable, ReentrancyGuard {
    ILayerZeroEndpointV2 public immutable endpoint;

    mapping(uint32 => bytes32) public trustedHubRouters;
    mapping(bytes32 => bool) public deliveredMessages;

    event TrustedHubRouterSet(uint32 indexed hubEid, bytes32 indexed hubRouter);
    event TrustedHubRouterRemoved(uint32 indexed hubEid, bytes32 indexed hubRouter);
    event MessageDelivered(
        bytes32 indexed messageId,
        uint32 indexed sourceEid,
        bytes32 indexed sourceSender,
        address target,
        bytes payload
    );

    constructor(address endpoint_, address owner_) Ownable(owner_) {
        require(endpoint_ != address(0), "EvmChainInbox: endpoint=0");
        endpoint = ILayerZeroEndpointV2(endpoint_);
    }

    function setTrustedHubRouter(uint32 hubEid, bytes32 hubRouter) external onlyOwner {
        require(hubRouter != bytes32(0), "EvmChainInbox: hub=0");
        trustedHubRouters[hubEid] = hubRouter;
        emit TrustedHubRouterSet(hubEid, hubRouter);
    }

    function removeTrustedHubRouter(uint32 hubEid) external onlyOwner {
        bytes32 hubRouter = trustedHubRouters[hubEid];
        require(hubRouter != bytes32(0), "EvmChainInbox: hub not set");
        delete trustedHubRouters[hubEid];
        emit TrustedHubRouterRemoved(hubEid, hubRouter);
    }

    function allowInitializePath(Origin calldata origin) external view returns (bool) {
        return trustedHubRouters[origin.srcEid] == origin.sender;
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
        require(msg.sender == address(endpoint), "EvmChainInbox: only endpoint");
        require(trustedHubRouters[origin.srcEid] == origin.sender, "EvmChainInbox: untrusted hub");

        BridgeCodec.Message memory message = BridgeCodec.decode(encodedMessage);
        require(message.version == BridgeCodec.VERSION, "EvmChainInbox: bad version");
        require(message.messageId != bytes32(0), "EvmChainInbox: messageId=0");
        require(!deliveredMessages[message.messageId], "EvmChainInbox: already delivered");
        deliveredMessages[message.messageId] = true;

        address target = BridgeCodec.bytes32ToAddress(message.target);
        require(target != address(0), "EvmChainInbox: target=0");

        IBridgeMessageReceiver(target).processBridgeMessage(
            message.messageId,
            message.srcEid,
            message.srcSender,
            message.payload
        );

        emit MessageDelivered(message.messageId, message.srcEid, message.srcSender, target, message.payload);
    }

    function decodeMessage(bytes calldata encodedMessage) external pure returns (BridgeCodec.Message memory) {
        return BridgeCodec.decode(encodedMessage);
    }
}
