// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ILayerZeroEndpointV2, MessagingParams, MessagingFee} from "@layerzerolabs/lz-evm-protocol-v2/contracts/interfaces/ILayerZeroEndpointV2.sol";
import {AccessControlEnumerable} from "@openzeppelin/contracts/access/extensions/AccessControlEnumerable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {BridgeCodec} from "./libs/BridgeCodec.sol";
import {IBridgeMessageReceiver} from "./interfaces/IBridgeMessageReceiver.sol";

/**
 * @title HubOutboundRouter
 * @notice zkSync hub contract that routes GenLayer-originated messages to destination chains.
 */
contract HubOutboundRouter is AccessControlEnumerable, ReentrancyGuard {
    ILayerZeroEndpointV2 public immutable endpoint;

    bytes32 public constant OWNER_ROLE = keccak256("OWNER_ROLE");
    bytes32 public constant RELAYER_ROLE = keccak256("RELAYER_ROLE");

    mapping(bytes32 => bool) public usedMessageIds;
    mapping(uint32 => bytes32) public destinationEndpoints;

    event DestinationEndpointSet(uint32 indexed eid, bytes32 indexed endpointAddress);
    event LocalMessageDelivered(bytes32 indexed messageId, address indexed target, bytes payload);
    event RemoteMessageSent(bytes32 indexed messageId, uint32 indexed dstEid, bytes32 indexed destinationEndpoint, bytes message);

    constructor(address endpoint_, address owner_, address relayer_) {
        require(endpoint_ != address(0), "HubOutboundRouter: endpoint=0");
        require(owner_ != address(0), "HubOutboundRouter: owner=0");
        require(relayer_ != address(0), "HubOutboundRouter: relayer=0");

        endpoint = ILayerZeroEndpointV2(endpoint_);

        _grantRole(DEFAULT_ADMIN_ROLE, owner_);
        _grantRole(OWNER_ROLE, owner_);
        _grantRole(RELAYER_ROLE, relayer_);
        _setRoleAdmin(RELAYER_ROLE, OWNER_ROLE);
    }

    function updateRelayer(address newRelayer) external onlyRole(OWNER_ROLE) {
        require(newRelayer != address(0), "HubOutboundRouter: relayer=0");

        uint256 relayerCount = getRoleMemberCount(RELAYER_ROLE);
        for (uint256 i = 0; i < relayerCount; i++) {
            address oldRelayer = getRoleMember(RELAYER_ROLE, 0);
            _revokeRole(RELAYER_ROLE, oldRelayer);
        }
        _grantRole(RELAYER_ROLE, newRelayer);
    }

    function setDestinationEndpoint(uint32 eid, bytes32 destinationEndpoint) external onlyRole(OWNER_ROLE) {
        require(destinationEndpoint != bytes32(0), "HubOutboundRouter: destination=0");
        destinationEndpoints[eid] = destinationEndpoint;
        emit DestinationEndpointSet(eid, destinationEndpoint);
    }

    function getDestinationEndpoint(uint32 eid) external view returns (bytes32) {
        bytes32 destinationEndpoint = destinationEndpoints[eid];
        require(destinationEndpoint != bytes32(0), "HubOutboundRouter: destination not set");
        return destinationEndpoint;
    }

    function isMessageUsed(bytes32 messageId) external view returns (bool) {
        return usedMessageIds[messageId];
    }

    function sendMessage(
        bytes32 messageId,
        uint32 dstEid,
        bytes calldata message,
        bytes calldata options
    ) public payable onlyRole(RELAYER_ROLE) nonReentrant {
        require(messageId != bytes32(0), "HubOutboundRouter: messageId=0");
        require(!usedMessageIds[messageId], "HubOutboundRouter: message already used");
        usedMessageIds[messageId] = true;

        BridgeCodec.Message memory decoded = BridgeCodec.decode(message);
        require(decoded.version == BridgeCodec.VERSION, "HubOutboundRouter: bad version");
        require(decoded.messageId == messageId, "HubOutboundRouter: messageId mismatch");

        if (dstEid == endpoint.eid()) {
            address target = BridgeCodec.bytes32ToAddress(decoded.target);
            require(target != address(0), "HubOutboundRouter: target=0");
            IBridgeMessageReceiver(target).processBridgeMessage(
                decoded.messageId,
                decoded.srcEid,
                decoded.srcSender,
                decoded.payload
            );
            emit LocalMessageDelivered(messageId, target, decoded.payload);
            return;
        }

        bytes32 destinationEndpoint = destinationEndpoints[dstEid];
        require(destinationEndpoint != bytes32(0), "HubOutboundRouter: destination not set");

        MessagingParams memory params = MessagingParams({
            dstEid: dstEid,
            receiver: destinationEndpoint,
            message: message,
            options: options,
            payInLzToken: false
        });

        endpoint.send{value: msg.value}(params, payable(msg.sender));
        emit RemoteMessageSent(messageId, dstEid, destinationEndpoint, message);
    }

    function quoteMessage(
        uint32 dstEid,
        bytes calldata message,
        bytes calldata options
    ) public view returns (uint256 nativeFee, uint256 lzTokenFee) {
        if (dstEid == endpoint.eid()) {
            return (0, 0);
        }

        bytes32 destinationEndpoint = destinationEndpoints[dstEid];
        require(destinationEndpoint != bytes32(0), "HubOutboundRouter: destination not set");

        MessagingParams memory params = MessagingParams({
            dstEid: dstEid,
            receiver: destinationEndpoint,
            message: message,
            options: options,
            payInLzToken: false
        });

        MessagingFee memory fee = endpoint.quote(params, address(this));
        return (fee.nativeFee, fee.lzTokenFee);
    }

    // Compatibility aliases for the previous BridgeForwarder service ABI.
    function callRemoteArbitrary(
        bytes32 txHash,
        uint32 dstEid,
        bytes calldata data,
        bytes calldata options
    ) external payable {
        sendMessage(txHash, dstEid, data, options);
    }

    function quoteCallRemoteArbitrary(
        uint32 dstEid,
        bytes calldata data,
        bytes calldata options
    ) external view returns (uint256 nativeFee, uint256 lzTokenFee) {
        return quoteMessage(dstEid, data, options);
    }

    function isHashUsed(bytes32 txHash) external view returns (bool) {
        return usedMessageIds[txHash];
    }
}
