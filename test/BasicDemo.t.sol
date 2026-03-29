// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity ^0.8.13;

import "forge-std/Test.sol";
import "../src/Contract.sol";
import "../src/Reactive.sol";

contract BasicDemoTest is Test {
    bytes32 internal constant RECEIVED_EVENT_SIG = keccak256("Received(address,address,uint256)");
    bytes32 internal constant CALLBACK_EVENT_SIG = keccak256("Callback(uint256,address,uint64,bytes)");
    uint256 internal constant ORIGIN_CHAIN_ID = 11155111;
    uint256 internal constant DESTINATION_CHAIN_ID = 84532;
    uint256 internal constant THRESHOLD = 0.001 ether;
    uint64 internal constant GAS_LIMIT = 900000;

    address internal player = makeAddr("player");
    address internal callbackTarget = makeAddr("callbackTarget");

    Contract internal source;
    BasicDemoReactiveContract internal reactive;

    function setUp() public {
        source = new Contract();
        reactive = new BasicDemoReactiveContract(
            ORIGIN_CHAIN_ID, DESTINATION_CHAIN_ID, address(source), uint256(RECEIVED_EVENT_SIG), callbackTarget
        );

        vm.deal(player, 1 ether);
    }

    function testContractReceiveEmitsAndRefundsOrigin() public {
        vm.recordLogs();

        vm.prank(player, player);
        (bool success,) = address(source).call{value: 0.01 ether}("");
        assertTrue(success);

        Vm.Log[] memory logs = vm.getRecordedLogs();
        Vm.Log memory receivedLog = _findLog(logs, RECEIVED_EVENT_SIG);

        assertEq(receivedLog.emitter, address(source));
        assertEq(receivedLog.topics.length, 4);
        assertEq(address(uint160(uint256(receivedLog.topics[1]))), player);
        assertEq(address(uint160(uint256(receivedLog.topics[2]))), player);
        assertEq(uint256(receivedLog.topics[3]), 0.01 ether);
        assertEq(address(source).balance, 0);
    }

    function testReactiveEmitsCallbackWhenTopic3MeetsThreshold() public {
        vm.recordLogs();
        reactive.react(_buildLogRecord(THRESHOLD));

        Vm.Log[] memory logs = vm.getRecordedLogs();
        Vm.Log memory callbackLog = _findLog(logs, CALLBACK_EVENT_SIG);

        uint64 gasLimit = uint64(uint256(callbackLog.topics[3]));
        bytes memory payload = abi.decode(callbackLog.data, (bytes));

        assertEq(callbackLog.emitter, address(reactive));
        assertEq(uint256(callbackLog.topics[1]), DESTINATION_CHAIN_ID);
        assertEq(address(uint160(uint256(callbackLog.topics[2]))), callbackTarget);
        assertEq(gasLimit, GAS_LIMIT);
        assertEq(payload, abi.encodeWithSignature("callback(address)", address(0)));
    }

    function testReactiveDoesNotEmitCallbackBelowThreshold() public {
        vm.recordLogs();
        reactive.react(_buildLogRecord(THRESHOLD - 1));

        Vm.Log[] memory logs = vm.getRecordedLogs();
        assertEq(_countLogs(logs, CALLBACK_EVENT_SIG), 0);
    }

    function testReactiveEmitsCallbackAboveThreshold() public {
        vm.recordLogs();
        reactive.react(_buildLogRecord(THRESHOLD + 1));

        Vm.Log[] memory logs = vm.getRecordedLogs();
        assertEq(_countLogs(logs, CALLBACK_EVENT_SIG), 1);
    }

    function testContractReceiveRefundsExactValueForAnotherSender() public {
        address anotherPlayer = makeAddr("anotherPlayer");
        uint256 amount = 0.002 ether;
        vm.deal(anotherPlayer, 1 ether);

        uint256 balanceBefore = anotherPlayer.balance;
        vm.prank(anotherPlayer, anotherPlayer);
        (bool success,) = address(source).call{value: amount}("");
        assertTrue(success);

        uint256 balanceAfter = anotherPlayer.balance;
        assertEq(address(source).balance, 0);
        assertEq(balanceBefore - balanceAfter, 0);
    }

    function _buildLogRecord(uint256 amount) internal view returns (IReactive.LogRecord memory) {
        return IReactive.LogRecord({
            chain_id: ORIGIN_CHAIN_ID,
            _contract: address(source),
            topic_0: uint256(RECEIVED_EVENT_SIG),
            topic_1: uint256(uint160(player)),
            topic_2: uint256(uint160(player)),
            topic_3: amount,
            data: "",
            block_number: block.number,
            op_code: 0,
            block_hash: uint256(blockhash(block.number - 1)),
            tx_hash: uint256(keccak256("basic-demo-source-tx")),
            log_index: 0
        });
    }

    function _findLog(Vm.Log[] memory logs, bytes32 signature) internal pure returns (Vm.Log memory entry) {
        for (uint256 i = 0; i < logs.length; ++i) {
            if (logs[i].topics.length != 0 && logs[i].topics[0] == signature) {
                return logs[i];
            }
        }

        revert("Log not found");
    }

    function _countLogs(Vm.Log[] memory logs, bytes32 signature) internal pure returns (uint256 count) {
        for (uint256 i = 0; i < logs.length; ++i) {
            if (logs[i].topics.length != 0 && logs[i].topics[0] == signature) {
                count++;
            }
        }
    }
}
