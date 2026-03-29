// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity ^0.8.13;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {ScratchReactive} from "../src/ScratchReactive.sol";

contract DeployScratchReactiveScript is Script {
    function run() external returns (ScratchReactive deployed) {
        uint256 deployerPrivateKey = vm.envUint("REACTIVE_PRIVATE_KEY");
        uint256 originChainId = vm.envUint("ORIGIN_CHAIN_ID");
        uint256 destinationChainId = vm.envUint("DESTINATION_CHAIN_ID");
        address sourceContract = vm.envAddress("SCRATCH_SOURCE_ADDR");
        uint256 ticketPurchasedTopic0 = vm.envUint("TICKET_PURCHASED_TOPIC0");
        address scratchGame = vm.envAddress("SCRATCH_GAME_ADDR");
        uint256 initialFunding = vm.envOr("SCRATCH_REACTIVE_INITIAL_FUNDING", uint256(0));

        vm.startBroadcast(deployerPrivateKey);
        deployed = new ScratchReactive{value: initialFunding}(
            originChainId, destinationChainId, sourceContract, ticketPurchasedTopic0, scratchGame
        );
        vm.stopBroadcast();

        console2.log("ScratchReactive deployed");
        console2.logAddress(address(deployed));
        console2.log("sourceContract");
        console2.logAddress(sourceContract);
        console2.log("scratchGame");
        console2.logAddress(scratchGame);
        console2.log("topic0");
        console2.logUint(ticketPurchasedTopic0);
    }
}
