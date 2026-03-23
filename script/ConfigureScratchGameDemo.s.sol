// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity ^0.8.13;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {ScratchGame} from "../src/ScratchGame.sol";

contract ConfigureScratchGameDemoScript is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DESTINATION_PRIVATE_KEY");
        address payable scratchGameAddress = payable(vm.envAddress("SCRATCH_GAME_ADDR"));
        bool enabled = vm.envBool("DEMO_MODE_ENABLED");
        uint8 forcedPrizeTier = uint8(vm.envOr("DEMO_FORCED_PRIZE_TIER", uint256(3)));
        uint256 remainingTickets = vm.envOr("DEMO_REMAINING_TICKETS", uint256(1));

        vm.startBroadcast(deployerPrivateKey);
        ScratchGame(scratchGameAddress).configureDemoMode(enabled, forcedPrizeTier, remainingTickets);
        vm.stopBroadcast();

        console2.log("ScratchGame demo mode updated");
        console2.logAddress(scratchGameAddress);
        console2.log("enabled");
        console2.log(enabled);
        console2.log("forcedPrizeTier");
        console2.logUint(forcedPrizeTier);
        console2.log("remainingTickets");
        console2.logUint(remainingTickets);
    }
}
