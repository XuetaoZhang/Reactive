// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity ^0.8.13;

contract MockCallbackProxy {
    event PayloadDispatched(address indexed target, bytes payload, bytes result);

    function dispatch(address target, bytes calldata payload) external payable returns (bytes memory result) {
        (bool success, bytes memory returnData) = target.call{value: msg.value}(payload);
        require(success, "Dispatch failed");

        emit PayloadDispatched(target, payload, returnData);
        return returnData;
    }
}
