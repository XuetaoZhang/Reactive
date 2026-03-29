// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity ^0.8.13;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {ScratchReactive} from "../src/ScratchReactive.sol";

contract ActivateScratchReactiveSubscriptionScript is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("REACTIVE_PRIVATE_KEY");
        address scratchReactiveAddress = vm.envAddress("SCRATCH_REACTIVE_ADDR");
        require(scratchReactiveAddress != address(0), "SCRATCH_REACTIVE_ADDR is not set");

        console2.log("ActivateScratchReactiveSubscriptionScript preflight");
        console2.log("chainId");
        console2.logUint(block.chainid);
        console2.log("scratchReactiveAddress");
        console2.logAddress(scratchReactiveAddress);

        vm.startBroadcast(deployerPrivateKey);
        ScratchReactive(payable(scratchReactiveAddress)).activateSubscription();
        vm.stopBroadcast();

        console2.log("ScratchReactive subscription activated");
        console2.logAddress(scratchReactiveAddress);
    }
}
