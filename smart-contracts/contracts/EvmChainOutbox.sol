// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ILayerZeroEndpointV2, MessagingParams, MessagingFee} from "@layerzerolabs/lz-evm-protocol-v2/contracts/interfaces/ILayerZeroEndpointV2.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {BridgeCodec} from "./libs/BridgeCodec.sol";

/**
 * @title EvmChainOutbox
 * @notice Source-chain endpoint for EVM/Solidity apps sending messages to GenLayer.
 */
contract EvmChainOutbox is Ownable, ReentrancyGuard {
    ILayerZeroEndpointV2 public immutable endpoint;

    bytes32 public hubInboundInbox;
    uint32 public hubEid;
    uint256 public messageNonce;
    mapping(bytes32 => bool) public messageExists;

    event MessageSentToGenLayer(
        bytes32 indexed messageId,
        uint32 indexed hubEid,
        address indexed sender,
        address targetContract,
        bytes payload,
        uint256 nonce
    );
    event HubInboundInboxUpdated(uint32 indexed hubEid, bytes32 indexed hubInboundInbox);

    constructor(
        address endpoint_,
        address owner_,
        uint32 hubEid_,
        bytes32 hubInboundInbox_
    ) Ownable(owner_) {
        require(endpoint_ != address(0), "EvmChainOutbox: endpoint=0");
        require(hubInboundInbox_ != bytes32(0), "EvmChainOutbox: hub=0");

        endpoint = ILayerZeroEndpointV2(endpoint_);
        hubEid = hubEid_;
        hubInboundInbox = hubInboundInbox_;
    }

    function setHubInboundInbox(uint32 hubEid_, bytes32 hubInboundInbox_) external onlyOwner {
        require(hubInboundInbox_ != bytes32(0), "EvmChainOutbox: hub=0");
        hubEid = hubEid_;
        hubInboundInbox = hubInboundInbox_;
        emit HubInboundInboxUpdated(hubEid_, hubInboundInbox_);
    }

    function sendToGenLayer(
        address targetContract,
        bytes calldata payload,
        bytes calldata options
    ) external payable nonReentrant returns (bytes32 messageId) {
        require(targetContract != address(0), "EvmChainOutbox: target=0");

        uint256 nonce = ++messageNonce;
        messageId = keccak256(abi.encodePacked(endpoint.eid(), address(this), msg.sender, targetContract, payload, nonce));
        messageExists[messageId] = true;

        bytes memory message = BridgeCodec.encode(BridgeCodec.Message({
            version: BridgeCodec.VERSION,
            messageId: messageId,
            srcEid: endpoint.eid(),
            srcSender: BridgeCodec.addressToBytes32(msg.sender),
            target: BridgeCodec.addressToBytes32(targetContract),
            payload: payload
        }));

        MessagingParams memory params = MessagingParams({
            dstEid: hubEid,
            receiver: hubInboundInbox,
            message: message,
            options: options,
            payInLzToken: false
        });

        endpoint.send{value: msg.value}(params, payable(msg.sender));
        emit MessageSentToGenLayer(messageId, hubEid, msg.sender, targetContract, payload, nonce);
    }

    function quoteSendToGenLayer(
        address targetContract,
        bytes calldata payload,
        bytes calldata options
    ) external view returns (uint256 nativeFee, uint256 lzTokenFee) {
        bytes memory message = BridgeCodec.encode(BridgeCodec.Message({
            version: BridgeCodec.VERSION,
            messageId: bytes32(0),
            srcEid: endpoint.eid(),
            srcSender: BridgeCodec.addressToBytes32(msg.sender),
            target: BridgeCodec.addressToBytes32(targetContract),
            payload: payload
        }));

        MessagingParams memory params = MessagingParams({
            dstEid: hubEid,
            receiver: hubInboundInbox,
            message: message,
            options: options,
            payInLzToken: false
        });

        MessagingFee memory fee = endpoint.quote(params, address(this));
        return (fee.nativeFee, fee.lzTokenFee);
    }

    function isMessageSent(bytes32 messageId) external view returns (bool) {
        return messageExists[messageId];
    }
}
