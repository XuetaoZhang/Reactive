// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity ^0.8.13;

import "reactive-lib/src/abstract-base/AbstractCallback.sol";

contract Callback is AbstractCallback {
    event CallbackReceived(address indexed origin, address indexed sender, address indexed reactive_sender);

    constructor(address _callback_sender) payable AbstractCallback(_callback_sender) {}

    function callback(address sender) external authorizedSenderOnly rvmIdOnly(sender) {
        emit CallbackReceived(tx.origin, msg.sender, sender);
    }
}
