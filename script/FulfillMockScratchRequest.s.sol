// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity ^0.8.13;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {ScratchGame} from "../src/ScratchGame.sol";
import {MockVRFCoordinatorV2} from "../src/mocks/MockVRFCoordinatorV2.sol";

contract FulfillMockScratchRequestScript is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DESTINATION_PRIVATE_KEY");
        address gameAddress = vm.envAddress("SCRATCH_GAME_ADDR");
        address coordinatorAddress = vm.envAddress("VRF_COORDINATOR_ADDR");
        uint256 ticketId = vm.envUint("MOCK_FULFILL_TICKET_ID");
        uint256 randomWord = vm.envUint("MOCK_RANDOM_WORD");

        ScratchGame game = ScratchGame(payable(gameAddress));
        ScratchGame.Ticket memory ticket = game.getTicketState(ticketId);

        vm.startBroadcast(deployerPrivateKey);
        MockVRFCoordinatorV2(coordinatorAddress).fulfill(gameAddress, ticket.requestId, randomWord);
        vm.stopBroadcast();

        console2.log("Mock randomness fulfilled");
        console2.log("ticketId");
        console2.logUint(ticketId);
        console2.log("requestId");
        console2.logUint(ticket.requestId);
        console2.log("randomWord");
        console2.logUint(randomWord);
    }
}
