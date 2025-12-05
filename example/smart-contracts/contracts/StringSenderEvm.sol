// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IBridgeSender} from "./interfaces/IBridgeSender.sol";

/// @title StringSenderEvm
/// @notice Example: sends strings from EVM to GenLayer via BridgeSender.
contract StringSenderEvm {
    IBridgeSender public bridgeSender;
    address public targetContract;
    address public owner;
    string[] public sentStrings;

    event StringSent(string message, bytes32 messageId);

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    constructor(address _bridgeSender, address _targetContract) {
        require(_bridgeSender != address(0), "Invalid bridge sender");
        bridgeSender = IBridgeSender(_bridgeSender);
        targetContract = _targetContract;
        owner = msg.sender;
    }

    function setBridgeSender(address _bridgeSender) external onlyOwner {
        require(_bridgeSender != address(0), "Invalid bridge sender");
        bridgeSender = IBridgeSender(_bridgeSender);
    }

    function setTargetContract(address _targetContract) external onlyOwner {
        targetContract = _targetContract;
    }

    function sendString(string calldata _message, bytes calldata _options) external payable returns (bytes32 messageId) {
        bytes memory encodedMessage = abi.encode(_message);
        messageId = bridgeSender.sendToGenLayer{value: msg.value}(targetContract, encodedMessage, _options);
        sentStrings.push(_message);
        emit StringSent(_message, messageId);
        return messageId;
    }

    function quoteSendString(string calldata _message, bytes calldata _options) external view returns (uint256 nativeFee, uint256 lzTokenFee) {
        bytes memory encodedMessage = abi.encode(_message);
        return bridgeSender.quoteSendToGenLayer(targetContract, encodedMessage, _options);
    }

    function getSentStrings() external view returns (string[] memory) {
        return sentStrings;
    }

    function getSentCount() external view returns (uint256) {
        return sentStrings.length;
    }
}
