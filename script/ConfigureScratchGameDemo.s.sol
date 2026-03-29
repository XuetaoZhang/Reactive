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
        require(scratchGameAddress != address(0), "SCRATCH_GAME_ADDR is not set");
        if (enabled) {
            require(forcedPrizeTier != 0 && forcedPrizeTier <= 4, "DEMO_FORCED_PRIZE_TIER must be 1-4");
            require(remainingTickets != 0, "DEMO_REMAINING_TICKETS must be > 0");
        }

        console2.log("ConfigureScratchGameDemoScript preflight");
        console2.log("chainId");
        console2.logUint(block.chainid);
        console2.log("scratchGameAddress");
        console2.logAddress(scratchGameAddress);
        console2.log("enabled");
        console2.log(enabled);

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
