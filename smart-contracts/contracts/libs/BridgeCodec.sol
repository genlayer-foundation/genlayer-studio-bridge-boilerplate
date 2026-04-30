// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title BridgeCodec
 * @notice Canonical cross-VM message envelope used by every bridge leg.
 *
 * EVM addresses are represented as right-aligned bytes32 values:
 *   bytes32(uint256(uint160(account)))
 *
 * Solana pubkeys are represented as their native 32 byte value.
 */
library BridgeCodec {
    uint16 internal constant VERSION = 1;

    struct Message {
        uint16 version;
        bytes32 messageId;
        uint32 srcEid;
        bytes32 srcSender;
        bytes32 target;
        bytes payload;
    }

    function encode(Message memory message) internal pure returns (bytes memory) {
        return abi.encode(
            message.version,
            message.messageId,
            message.srcEid,
            message.srcSender,
            message.target,
            message.payload
        );
    }

    function decode(bytes calldata encoded) internal pure returns (Message memory message) {
        (
            message.version,
            message.messageId,
            message.srcEid,
            message.srcSender,
            message.target,
            message.payload
        ) = abi.decode(encoded, (uint16, bytes32, uint32, bytes32, bytes32, bytes));
    }

    function addressToBytes32(address account) internal pure returns (bytes32) {
        return bytes32(uint256(uint160(account)));
    }

    function bytes32ToAddress(bytes32 value) internal pure returns (address) {
        require(isAddressBytes32(value), "BridgeCodec: not address bytes32");
        return address(uint160(uint256(value)));
    }

    function isAddressBytes32(bytes32 value) internal pure returns (bool) {
        return uint256(value) >> 160 == 0;
    }
}
