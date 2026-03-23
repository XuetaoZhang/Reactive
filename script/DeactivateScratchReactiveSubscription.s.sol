// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity ^0.8.13;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {ScratchReactive} from "../src/ScratchReactive.sol";

contract DeactivateScratchReactiveSubscriptionScript is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("REACTIVE_PRIVATE_KEY");
        address scratchReactiveAddress = vm.envAddress("SCRATCH_REACTIVE_ADDR");

        vm.startBroadcast(deployerPrivateKey);
        ScratchReactive(payable(scratchReactiveAddress)).deactivateSubscription();
        vm.stopBroadcast();

        console2.log("ScratchReactive subscription deactivated");
        console2.logAddress(scratchReactiveAddress);
    }
}
