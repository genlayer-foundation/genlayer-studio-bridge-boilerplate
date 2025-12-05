// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IBridgeSender
 * @notice Interface for the BridgeSender contract that sends messages to GenLayer
 */
interface IBridgeSender {
    /**
     * @notice Send a message to a GenLayer intelligent contract
     * @param _targetContract The target contract address on GenLayer
     * @param _data The ABI-encoded message data
     * @param _options LayerZero executor options (gas limit, etc.)
     * @return messageId The unique message identifier
     */
    function sendToGenLayer(
        address _targetContract,
        bytes calldata _data,
        bytes calldata _options
    ) external payable returns (bytes32 messageId);

    /**
     * @notice Get a fee quote for sending a message to GenLayer
     * @param _targetContract The target contract address on GenLayer
     * @param _data The ABI-encoded message data
     * @param _options LayerZero executor options
     * @return nativeFee The native token fee required
     * @return lzTokenFee The LayerZero token fee (if paying in LZ token)
     */
    function quoteSendToGenLayer(
        address _targetContract,
        bytes calldata _data,
        bytes calldata _options
    ) external view returns (uint256 nativeFee, uint256 lzTokenFee);
}
