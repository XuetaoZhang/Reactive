// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity ^0.8.13;

contract Contract {
    event Received(address indexed origin, address indexed sender, uint256 indexed value);

    receive() external payable {
        emit Received(tx.origin, msg.sender, msg.value);

        (bool success,) = address(tx.origin).call{value: msg.value}("");
        require(success, "Transfer failed");
    }
}
