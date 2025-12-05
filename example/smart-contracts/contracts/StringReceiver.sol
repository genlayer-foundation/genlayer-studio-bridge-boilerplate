// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IGenLayerBridgeReceiver} from "./interfaces/IGenLayerBridgeReceiver.sol";

/// @title StringReceiver
/// @notice Example: receives string messages from GenLayer via BridgeReceiver.
contract StringReceiver is IGenLayerBridgeReceiver {
    string[] public receivedMessages;
    address public bridgeReceiver;
    address public owner;

    event StringReceived(uint32 indexed sourceChainId, address indexed sourceContract, string message, uint256 messageIndex);
    event BridgeReceiverUpdated(address indexed oldReceiver, address indexed newReceiver);

    error OnlyBridgeReceiver();
    error OnlyOwner();
    error ZeroAddress();

    modifier onlyBridgeReceiver() {
        if (msg.sender != bridgeReceiver) revert OnlyBridgeReceiver();
        _;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert OnlyOwner();
        _;
    }

    constructor(address _bridgeReceiver) {
        if (_bridgeReceiver == address(0)) revert ZeroAddress();
        bridgeReceiver = _bridgeReceiver;
        owner = msg.sender;
    }

    function processBridgeMessage(uint32 _sourceChainId, address _sourceContract, bytes calldata _message) external onlyBridgeReceiver {
        string memory message = abi.decode(_message, (string));
        uint256 messageIndex = receivedMessages.length;
        receivedMessages.push(message);
        emit StringReceived(_sourceChainId, _sourceContract, message, messageIndex);
    }

    function getMessageCount() external view returns (uint256) {
        return receivedMessages.length;
    }

    function getMessage(uint256 index) external view returns (string memory) {
        return receivedMessages[index];
    }

    function getAllMessages() external view returns (string[] memory) {
        return receivedMessages;
    }

    function getLatestMessage() external view returns (string memory) {
        if (receivedMessages.length == 0) return "";
        return receivedMessages[receivedMessages.length - 1];
    }

    function setBridgeReceiver(address _newBridgeReceiver) external onlyOwner {
        if (_newBridgeReceiver == address(0)) revert ZeroAddress();
        address oldReceiver = bridgeReceiver;
        bridgeReceiver = _newBridgeReceiver;
        emit BridgeReceiverUpdated(oldReceiver, _newBridgeReceiver);
    }

    function transferOwnership(address _newOwner) external onlyOwner {
        if (_newOwner == address(0)) revert ZeroAddress();
        owner = _newOwner;
    }
}
