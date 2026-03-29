// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity ^0.8.13;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {ScratchGame} from "../src/ScratchGame.sol";

contract ConfigureScratchGameVrfScript is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DESTINATION_PRIVATE_KEY");
        address payable scratchGameAddress = payable(vm.envAddress("SCRATCH_GAME_ADDR"));
        address randomnessCoordinator = vm.envAddress("VRF_COORDINATOR_ADDR");
        bytes32 vrfKeyHash = vm.envBytes32("VRF_KEY_HASH");
        uint256 vrfSubscriptionId = vm.envUint("VRF_SUBSCRIPTION_ID");
        uint16 vrfRequestConfirmations = uint16(vm.envOr("VRF_REQUEST_CONFIRMATIONS", uint256(3)));
        uint32 vrfCallbackGasLimit = uint32(vm.envOr("VRF_CALLBACK_GAS_LIMIT", uint256(200_000)));
        bool vrfNativePayment = vm.envOr("VRF_NATIVE_PAYMENT", false);
        require(scratchGameAddress != address(0), "SCRATCH_GAME_ADDR is not set");
        require(randomnessCoordinator != address(0), "VRF_COORDINATOR_ADDR is not set");
        require(vrfKeyHash != bytes32(0), "VRF_KEY_HASH is not set");
        require(vrfSubscriptionId != 0, "VRF_SUBSCRIPTION_ID is not set");
        require(vrfRequestConfirmations != 0, "VRF_REQUEST_CONFIRMATIONS must be > 0");
        require(vrfCallbackGasLimit != 0, "VRF_CALLBACK_GAS_LIMIT must be > 0");

        console2.log("ConfigureScratchGameVrfScript preflight");
        console2.log("chainId");
        console2.logUint(block.chainid);
        console2.log("scratchGameAddress");
        console2.logAddress(scratchGameAddress);
        console2.log("randomnessCoordinator");
        console2.logAddress(randomnessCoordinator);
        console2.log("vrfSubscriptionId");
        console2.logUint(vrfSubscriptionId);

        vm.startBroadcast(deployerPrivateKey);
        ScratchGame(scratchGameAddress).setRandomnessCoordinator(randomnessCoordinator);
        ScratchGame(scratchGameAddress)
            .setVrfConfig(vrfKeyHash, vrfSubscriptionId, vrfRequestConfirmations, vrfCallbackGasLimit, vrfNativePayment);
        vm.stopBroadcast();

        console2.log("ScratchGame VRF configured");
        console2.logAddress(scratchGameAddress);
        console2.log("randomnessCoordinator");
        console2.logAddress(randomnessCoordinator);
        console2.log("vrfSubscriptionId");
        console2.logUint(vrfSubscriptionId);
        console2.log("vrfNativePayment");
        console2.log(vrfNativePayment);
    }
}
