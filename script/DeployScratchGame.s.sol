// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity ^0.8.13;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {ScratchGame} from "../src/ScratchGame.sol";

contract DeployScratchGameScript is Script {
    function run() external returns (ScratchGame deployed) {
        uint256 deployerPrivateKey = vm.envUint("DESTINATION_PRIVATE_KEY");
        address callbackSender = vm.envAddress("DESTINATION_CALLBACK_PROXY_ADDR");
        address randomnessCoordinator = vm.envAddress("VRF_COORDINATOR_ADDR");
        bytes32 vrfKeyHash = vm.envBytes32("VRF_KEY_HASH");
        uint256 vrfSubscriptionId = vm.envUint("VRF_SUBSCRIPTION_ID");
        uint16 vrfRequestConfirmations = uint16(vm.envOr("VRF_REQUEST_CONFIRMATIONS", uint256(3)));
        uint32 vrfCallbackGasLimit = uint32(vm.envOr("VRF_CALLBACK_GAS_LIMIT", uint256(200_000)));
        bool vrfNativePayment = vm.envOr("VRF_NATIVE_PAYMENT", false);
        uint256 initialFunding = vm.envOr("SCRATCH_GAME_INITIAL_FUNDING", uint256(0));

        vm.startBroadcast(deployerPrivateKey);
        deployed = new ScratchGame{value: initialFunding}(
            callbackSender,
            randomnessCoordinator,
            vrfKeyHash,
            vrfSubscriptionId,
            vrfRequestConfirmations,
            vrfCallbackGasLimit,
            vrfNativePayment
        );
        vm.stopBroadcast();

        console2.log("ScratchGame deployed");
        console2.logAddress(address(deployed));
        console2.log("callbackSender");
        console2.logAddress(callbackSender);
        console2.log("randomnessCoordinator");
        console2.logAddress(randomnessCoordinator);
        console2.log("vrfSubscriptionId");
        console2.logUint(vrfSubscriptionId);
        console2.log("vrfNativePayment");
        console2.log(vrfNativePayment);
        console2.log("initialFunding");
        console2.logUint(initialFunding);
    }
}
