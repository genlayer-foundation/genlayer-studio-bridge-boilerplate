// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IBridgeMessageReceiver
 * @notice Interface for destination application contracts receiving bridge messages.
 */
interface IBridgeMessageReceiver {
    function processBridgeMessage(
        bytes32 messageId,
        uint32 sourceEid,
        bytes32 sourceSender,
        bytes calldata payload
    ) external;
}
