// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity ^0.8.13;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {ScratchGame} from "../src/ScratchGame.sol";

contract BindScratchGameReactiveScript is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DESTINATION_PRIVATE_KEY");
        address payable scratchGameAddress = payable(vm.envAddress("SCRATCH_GAME_ADDR"));
        address expectedReactiveSender = vm.envAddress("EXPECTED_REACTIVE_SENDER_ADDR");
        require(scratchGameAddress != address(0), "SCRATCH_GAME_ADDR is not set");
        require(expectedReactiveSender != address(0), "EXPECTED_REACTIVE_SENDER_ADDR is not set");

        console2.log("BindScratchGameReactiveScript preflight");
        console2.log("chainId");
        console2.logUint(block.chainid);
        console2.log("scratchGameAddress");
        console2.logAddress(scratchGameAddress);
        console2.log("expectedReactiveSender");
        console2.logAddress(expectedReactiveSender);

        vm.startBroadcast(deployerPrivateKey);
        ScratchGame(scratchGameAddress).setExpectedReactiveSender(expectedReactiveSender);
        vm.stopBroadcast();

        console2.log("ScratchGame expectedReactiveSender set");
        console2.logAddress(scratchGameAddress);
        console2.logAddress(expectedReactiveSender);
    }
}
