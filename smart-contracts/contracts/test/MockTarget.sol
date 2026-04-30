// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IGenLayerBridgeReceiver} from "../interfaces/IGenLayerBridgeReceiver.sol";
import {IBridgeMessageReceiver} from "../interfaces/IBridgeMessageReceiver.sol";

contract MockTarget is IGenLayerBridgeReceiver, IBridgeMessageReceiver {
    uint256 public value;
    bool public called;
    uint32 public lastSrcEid;
    address public lastSrcSender;
    bytes32 public lastSourceSenderBytes32;
    bytes32 public lastMessageId;
    bytes public lastMessage;

    function processBridgeMessage(
        uint32 _srcEid,
        address _srcSender,
        bytes calldata _message
    ) external {
        lastSrcEid = _srcEid;
        lastSrcSender = _srcSender;
        lastMessage = _message;
        called = true;
    }

    function processBridgeMessage(
        bytes32 _messageId,
        uint32 _srcEid,
        bytes32 _srcSender,
        bytes calldata _message
    ) external {
        lastMessageId = _messageId;
        lastSrcEid = _srcEid;
        lastSourceSenderBytes32 = _srcSender;
        lastMessage = _message;
        called = true;
    }

    function setValue(uint256 _value) external {
        value = _value;
    }

    // Function that always reverts for testing
    function alwaysRevert() external pure {
        revert("MockTarget: intentional revert");
    }

    // Allow receiving ETH
    receive() external payable {}
}
