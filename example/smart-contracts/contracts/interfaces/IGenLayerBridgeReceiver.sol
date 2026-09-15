// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IGenLayerBridgeReceiver
 * @notice Interface for contracts that can receive and process bridged messages from GenLayer
 */
interface IGenLayerBridgeReceiver {
    /**
     * @notice Process a bridged message from GenLayer
     * @param _messageId Unique bridge message ID
     * @param _sourceEid Source endpoint/application EID
     * @param _sourceSender Source sender encoded as bytes32
     * @param _message The encoded message data to process
     */
    function processBridgeMessage(
        bytes32 _messageId,
        uint32 _sourceEid,
        bytes32 _sourceSender,
        bytes calldata _message
    ) external;
}
