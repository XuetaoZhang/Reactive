// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity ^0.8.13;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {ScratchSource} from "../src/ScratchSource.sol";

contract DeployScratchSourceScript is Script {
    function run() external returns (ScratchSource deployed) {
        uint256 deployerPrivateKey = vm.envUint("ORIGIN_PRIVATE_KEY");
        uint256 ticketPrice = vm.envUint("SCRATCH_TICKET_PRICE");
        uint256 initialRoundId = vm.envOr("SCRATCH_INITIAL_ROUND_ID", uint256(1));

        vm.startBroadcast(deployerPrivateKey);
        deployed = new ScratchSource(ticketPrice, initialRoundId);
        vm.stopBroadcast();

        console2.log("ScratchSource deployed");
        console2.logAddress(address(deployed));
        console2.log("ticketPrice");
        console2.logUint(ticketPrice);
        console2.log("initialRoundId");
        console2.logUint(initialRoundId);
    }
}
