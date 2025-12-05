// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ILayerZeroEndpointV2, MessagingParams, MessagingReceipt, MessagingFee} from "@layerzerolabs/lz-evm-protocol-v2/contracts/interfaces/ILayerZeroEndpointV2.sol";
import {AccessControlEnumerable} from "@openzeppelin/contracts/access/extensions/AccessControlEnumerable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IGenLayerBridgeReceiver} from "./interfaces/IGenLayerBridgeReceiver.sol";

/**
 * @title BridgeForwarder
 * @notice Forwards GenLayer->EVM messages via LayerZero. Deployed on zkSync.
 *         Can also dispatch locally if destination is the same chain.
 */
contract BridgeForwarder is AccessControlEnumerable, ReentrancyGuard {
    ILayerZeroEndpointV2 public immutable endpoint;

    bytes32 public constant OWNER_ROLE = keccak256("OWNER_ROLE");
    bytes32 public constant CALLER_ROLE = keccak256("CALLER_ROLE");

    mapping(bytes32 => bool) public usedTxHash;
    mapping(uint32 => bytes32) public bridgeAddresses;

    event LocalCallSuccess(address indexed target, bytes data);
    event RemoteBridgeSent(uint32 indexed dstEid, bytes32 indexed dstAddress, bytes data);
    event BridgeAddressUpdated(uint32 indexed eid, bytes32 bridgeAddress);

    constructor(address _endpoint, address _owner, address _caller) {
        require(_endpoint != address(0), "BridgeForwarder: _endpoint=0");
        require(_owner != address(0), "BridgeForwarder: _owner=0");
        require(_caller != address(0), "BridgeForwarder: _caller=0");

        endpoint = ILayerZeroEndpointV2(_endpoint);

        _grantRole(DEFAULT_ADMIN_ROLE, _owner);
        _grantRole(OWNER_ROLE, _owner);
        _grantRole(CALLER_ROLE, _caller);
        _setRoleAdmin(CALLER_ROLE, OWNER_ROLE);
    }

    function updateCaller(address _newCaller) external onlyRole(OWNER_ROLE) {
        require(_newCaller != address(0), "BridgeForwarder: _newCaller=0");

        uint256 callerCount = getRoleMemberCount(CALLER_ROLE);
        for (uint256 i = 0; i < callerCount; i++) {
            address oldCaller = getRoleMember(CALLER_ROLE, 0);
            _revokeRole(CALLER_ROLE, oldCaller);
        }
        _grantRole(CALLER_ROLE, _newCaller);
    }

    function isHashUsed(bytes32 _txHash) external view returns (bool) {
        return usedTxHash[_txHash];
    }

    function setBridgeAddress(uint32 _eid, bytes32 _bridgeAddress) external onlyRole(OWNER_ROLE) {
        require(_bridgeAddress != bytes32(0), "BridgeForwarder: _bridgeAddress=0");
        bridgeAddresses[_eid] = _bridgeAddress;
        emit BridgeAddressUpdated(_eid, _bridgeAddress);
    }

    function getBridgeAddress(uint32 _eid) external view returns (bytes32) {
        bytes32 bridgeAddress = bridgeAddresses[_eid];
        require(bridgeAddress != bytes32(0), "BridgeForwarder: bridge address not set");
        return bridgeAddress;
    }

    /// @notice Send cross-chain or local call. Reverts if txHash already used.
    function callRemoteArbitrary(
        bytes32 _txHash,
        uint32 _dstEid,
        bytes calldata _data,
        bytes calldata _options
    ) external payable onlyRole(CALLER_ROLE) nonReentrant {
        require(!usedTxHash[_txHash], "BridgeForwarder: txHash already used");
        usedTxHash[_txHash] = true;

        // Local call if same chain
        if (_dstEid == endpoint.eid()) {
            (
                uint32 srcChainId,
                address srcSender,
                address localContract,
                bytes memory message
            ) = abi.decode(_data, (uint32, address, address, bytes));
            require(localContract != address(0), "BridgeReceiver: localContract=0");

            IGenLayerBridgeReceiver(localContract).processBridgeMessage(srcChainId, srcSender, message);
            return;
        }

        bytes32 dstBridgeAddress = bridgeAddresses[_dstEid];
        require(dstBridgeAddress != bytes32(0), "BridgeForwarder: bridge address not set");

        MessagingParams memory params = MessagingParams({
            dstEid: _dstEid,
            receiver: dstBridgeAddress,
            message: _data,
            options: _options,
            payInLzToken: false
        });

        endpoint.send{value: msg.value}(params, payable(msg.sender));
        emit RemoteBridgeSent(_dstEid, dstBridgeAddress, _data);
    }

    function quoteCallRemoteArbitrary(
        uint32 _dstEid,
        bytes calldata _data,
        bytes calldata _options
    ) external view returns (uint256 nativeFee, uint256 lzTokenFee) {
        if (_dstEid == endpoint.eid()) {
            return (0, 0);
        }

        bytes32 dstBridgeAddress = bridgeAddresses[_dstEid];
        require(dstBridgeAddress != bytes32(0), "BridgeForwarder: bridge address not set");

        MessagingParams memory params = MessagingParams({
            dstEid: _dstEid,
            receiver: dstBridgeAddress,
            message: _data,
            options: _options,
            payInLzToken: false
        });
        MessagingFee memory fee = endpoint.quote(params, address(this));
        return (fee.nativeFee, fee.lzTokenFee);
    }
}
