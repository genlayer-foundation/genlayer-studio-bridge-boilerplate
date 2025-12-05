// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {MessagingParams, MessagingReceipt, MessagingFee, Origin} from "@layerzerolabs/lz-evm-protocol-v2/contracts/interfaces/ILayerZeroEndpointV2.sol";
import {ILayerZeroReceiver} from "../interfaces/ILayerZeroReceiver.sol";

contract MockEndpointWithReceive {
    uint32 public immutable eid;

    constructor() {
        eid = 1; // Local chain ID
    }

    function callLzReceive(
        address _receiver,
        Origin calldata _origin,
        bytes32 _guid,
        bytes calldata _message,
        address _executor,
        bytes calldata _extraData
    ) external payable {
        ILayerZeroReceiver(_receiver).lzReceive{value: msg.value}(
            _origin,
            _guid,
            _message,
            _executor,
            _extraData
        );
    }

    function quote(
        MessagingParams calldata,
        address
    ) external pure returns (MessagingFee memory) {
        return MessagingFee({nativeFee: 1 ether, lzTokenFee: 0}); // Mock fee
    }

    function send(
        MessagingParams calldata,
        address payable
    ) external payable returns (MessagingReceipt memory) {
        return
            MessagingReceipt({
                guid: bytes32(0),
                nonce: 0,
                fee: MessagingFee({nativeFee: 0, lzTokenFee: 0})
            }); // Mock receipt
    }
}
