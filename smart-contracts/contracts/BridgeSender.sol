// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ILayerZeroEndpointV2, MessagingParams, MessagingReceipt, MessagingFee} from "@layerzerolabs/lz-evm-protocol-v2/contracts/interfaces/ILayerZeroEndpointV2.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title BridgeSender
 * @notice Entry point for EVM->GenLayer messages. Sends to zkSync BridgeReceiver via LayerZero.
 *         Message flow: Base -> LayerZero -> zkSync BridgeReceiver -> Service -> GenLayer
 */
contract BridgeSender is Ownable, ReentrancyGuard {
    ILayerZeroEndpointV2 public immutable endpoint;

    bytes32 public zkSyncBridgeReceiver;
    uint32 public zkSyncEid;
    uint256 public messageNonce;
    mapping(bytes32 => bool) public messageExists;

    event MessageSentToGenLayer(bytes32 indexed messageId, address indexed sender, address targetContract, bytes data, uint256 nonce);
    event ZkSyncBridgeReceiverUpdated(uint32 indexed eid, bytes32 receiver);

    constructor(
        address _endpoint,
        address _owner,
        uint32 _zkSyncEid,
        bytes32 _zkSyncBridgeReceiver
    ) Ownable(_owner) {
        require(_endpoint != address(0), "BridgeSender: _endpoint=0");
        require(_zkSyncBridgeReceiver != bytes32(0), "BridgeSender: _zkSyncBridgeReceiver=0");

        endpoint = ILayerZeroEndpointV2(_endpoint);
        zkSyncEid = _zkSyncEid;
        zkSyncBridgeReceiver = _zkSyncBridgeReceiver;
    }

    function setZkSyncBridgeReceiver(uint32 _zkSyncEid, bytes32 _zkSyncBridgeReceiver) external onlyOwner {
        require(_zkSyncBridgeReceiver != bytes32(0), "BridgeSender: _zkSyncBridgeReceiver=0");
        zkSyncEid = _zkSyncEid;
        zkSyncBridgeReceiver = _zkSyncBridgeReceiver;
        emit ZkSyncBridgeReceiverUpdated(_zkSyncEid, _zkSyncBridgeReceiver);
    }

    /// @notice Send message to GenLayer. Returns unique messageId.
    function sendToGenLayer(
        address _targetContract,
        bytes calldata _data,
        bytes calldata _options
    ) external payable nonReentrant returns (bytes32 messageId) {
        require(_targetContract != address(0), "BridgeSender: _targetContract=0");

        uint256 nonce = ++messageNonce;
        messageId = keccak256(abi.encodePacked(block.chainid, address(this), msg.sender, _targetContract, _data, nonce));
        messageExists[messageId] = true;

        // Format: (srcChainId, srcSender, targetContract, data, messageId)
        bytes memory message = abi.encode(uint32(block.chainid), msg.sender, _targetContract, _data, messageId);

        MessagingParams memory params = MessagingParams({
            dstEid: zkSyncEid,
            receiver: zkSyncBridgeReceiver,
            message: message,
            options: _options,
            payInLzToken: false
        });

        endpoint.send{value: msg.value}(params, payable(msg.sender));
        emit MessageSentToGenLayer(messageId, msg.sender, _targetContract, _data, nonce);

        return messageId;
    }

    function quoteSendToGenLayer(
        address _targetContract,
        bytes calldata _data,
        bytes calldata _options
    ) external view returns (uint256 nativeFee, uint256 lzTokenFee) {
        bytes memory message = abi.encode(uint32(block.chainid), msg.sender, _targetContract, _data, bytes32(0));

        MessagingParams memory params = MessagingParams({
            dstEid: zkSyncEid,
            receiver: zkSyncBridgeReceiver,
            message: message,
            options: _options,
            payInLzToken: false
        });

        MessagingFee memory fee = endpoint.quote(params, address(this));
        return (fee.nativeFee, fee.lzTokenFee);
    }

    function isMessageSent(bytes32 _messageId) external view returns (bool) {
        return messageExists[_messageId];
    }
}
