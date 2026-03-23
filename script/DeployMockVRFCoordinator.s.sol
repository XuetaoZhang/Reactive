// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity ^0.8.13;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {MockVRFCoordinatorV2} from "../src/mocks/MockVRFCoordinatorV2.sol";

contract DeployMockVRFCoordinatorScript is Script {
    function run() external returns (MockVRFCoordinatorV2 deployed) {
        uint256 deployerPrivateKey = vm.envUint("DESTINATION_PRIVATE_KEY");

        vm.startBroadcast(deployerPrivateKey);
        deployed = new MockVRFCoordinatorV2();
        vm.stopBroadcast();

        console2.log("MockVRFCoordinatorV2 deployed");
        console2.logAddress(address(deployed));
    }
}
