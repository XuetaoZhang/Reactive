// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity ^0.8.13;

import "forge-std/Test.sol";
import "../src/ScratchSource.sol";
import "../src/ScratchReactive.sol";
import "../src/ScratchGame.sol";
import "../src/mocks/MockVRFCoordinatorV2.sol";
import "../src/mocks/MockCallbackProxy.sol";

contract ScratchFlowTest is Test {
    uint256 internal constant ORIGIN_CHAIN_ID = 11155111;
    uint256 internal constant DESTINATION_CHAIN_ID = 84532;
    uint256 internal constant TICKET_PRICE = 0.01 ether;
    uint256 internal constant ROUND_ID = 1;
    bytes32 internal constant SOURCE_TX_HASH = keccak256("scratch-source-tx");
    bytes32 internal constant CALLBACK_EVENT_SIG =
        keccak256("Callback(uint256,address,uint64,bytes)");
    bytes32 internal constant TICKET_PURCHASED_EVENT_SIG =
        keccak256("TicketPurchased(uint256,address,uint256,uint256)");
    bytes32 internal constant VRF_KEY_HASH =
        bytes32(uint256(0x123456789abcdef123456789abcdef123456789abcdef123456789abcdef1234));

    address internal player = makeAddr("player");

    ScratchSource internal source;
    ScratchReactive internal reactive;
    ScratchGame internal game;
    MockVRFCoordinatorV2 internal vrfCoordinator;
    MockCallbackProxy internal callbackProxy;

    function setUp() public {
        source = new ScratchSource(TICKET_PRICE, ROUND_ID);
        callbackProxy = new MockCallbackProxy();
        vrfCoordinator = new MockVRFCoordinatorV2();
        game = new ScratchGame(
            address(callbackProxy),
            address(vrfCoordinator),
            VRF_KEY_HASH,
            1,
            3,
            200_000,
            false
        );

        reactive = new ScratchReactive(
            ORIGIN_CHAIN_ID,
            DESTINATION_CHAIN_ID,
            address(source),
            uint256(TICKET_PURCHASED_EVENT_SIG),
            address(game)
        );

        game.setExpectedReactiveSender(address(reactive));

        vm.deal(player, 1 ether);
        vm.deal(address(game), 10 ether);
    }

    function testFullScratchFlowWithPrizeClaim() public {
        vm.recordLogs();
        vm.prank(player);
        uint256 ticketId = source.buyTicket{value: TICKET_PRICE}();
        Vm.Log[] memory purchaseLogs = vm.getRecordedLogs();
        Vm.Log memory purchaseLog = _findLog(purchaseLogs, TICKET_PURCHASED_EVENT_SIG);

        _assertSourcePurchase(ticketId);
        IReactive.LogRecord memory record = _buildLogRecord(purchaseLog);

        vm.recordLogs();
        reactive.react(record);
        Vm.Log[] memory reactiveLogs = vm.getRecordedLogs();
        bytes memory callbackPayload = _extractCallbackPayload(reactiveLogs);

        callbackProxy.dispatch(address(game), callbackPayload);

        ScratchGame.Ticket memory pendingTicket = game.getTicketState(ticketId);
        _assertPendingTicket(pendingTicket);

        vrfCoordinator.fulfill(address(game), pendingTicket.requestId, 50);

        ScratchGame.Ticket memory readyTicket = game.getTicketState(ticketId);
        _assertReadyTicket(readyTicket);

        uint256 balanceBeforeClaim = player.balance;
        vm.prank(player);
        game.claim(ticketId);
        uint256 balanceAfterClaim = player.balance;

        ScratchGame.Ticket memory claimedTicket = game.getTicketState(ticketId);
        assertEq(uint256(claimedTicket.status), uint256(ScratchGame.TicketStatus.Claimed));
        assertEq(balanceAfterClaim - balanceBeforeClaim, TICKET_PRICE * 5);
    }

    function testBuyTicketRequiresExactPrice() public {
        vm.expectRevert(ScratchSource.IncorrectTicketPrice.selector);
        vm.prank(player);
        source.buyTicket{value: TICKET_PRICE - 1}();
    }

    function testDemoModeCanForceNextWinningTicket() public {
        game.configureDemoMode(true, 4, 1);

        vm.recordLogs();
        vm.prank(player);
        uint256 ticketId = source.buyTicket{value: TICKET_PRICE}();
        Vm.Log[] memory purchaseLogs = vm.getRecordedLogs();
        Vm.Log memory purchaseLog = _findLog(purchaseLogs, TICKET_PURCHASED_EVENT_SIG);

        vm.recordLogs();
        reactive.react(_buildLogRecord(purchaseLog));
        Vm.Log[] memory reactiveLogs = vm.getRecordedLogs();
        bytes memory callbackPayload = _extractCallbackPayload(reactiveLogs);
        callbackProxy.dispatch(address(game), callbackPayload);

        ScratchGame.Ticket memory pendingTicket = game.getTicketState(ticketId);
        vrfCoordinator.fulfill(address(game), pendingTicket.requestId, 9_999);

        ScratchGame.Ticket memory readyTicket = game.getTicketState(ticketId);
        assertEq(uint256(readyTicket.status), uint256(ScratchGame.TicketStatus.Ready));
        assertEq(readyTicket.prizeTier, 4);
        assertEq(readyTicket.prizeAmount, TICKET_PRICE * 50);
        assertEq(game.demoRemainingTickets(), 0);
        assertFalse(game.demoModeEnabled());
    }

    function _extractCallbackPayload(Vm.Log[] memory logs) internal pure returns (bytes memory payload) {
        Vm.Log memory callbackLog = _findLog(logs, CALLBACK_EVENT_SIG);

        payload = abi.decode(callbackLog.data, (bytes));
    }

    function _buildLogRecord(Vm.Log memory purchaseLog) internal view returns (IReactive.LogRecord memory) {
        return IReactive.LogRecord({
            chain_id: ORIGIN_CHAIN_ID,
            _contract: purchaseLog.emitter,
            topic_0: uint256(purchaseLog.topics[0]),
            topic_1: uint256(purchaseLog.topics[1]),
            topic_2: uint256(purchaseLog.topics[2]),
            topic_3: uint256(purchaseLog.topics[3]),
            data: purchaseLog.data,
            block_number: block.number,
            op_code: 0,
            block_hash: uint256(blockhash(block.number - 1)),
            tx_hash: uint256(SOURCE_TX_HASH),
            log_index: 0
        });
    }

    function _assertSourcePurchase(uint256 ticketId) internal view {
        assertEq(ticketId, 1);
        assertEq(source.ticketPrice(), TICKET_PRICE);
        assertEq(source.currentRoundId(), ROUND_ID);
        assertEq(source.lastTicketIdByPlayer(player), ticketId);

        (address ticketPlayer, uint256 amount, uint256 roundId, uint256 purchasedAt) = source.ticketReceipts(ticketId);
        assertEq(ticketPlayer, player);
        assertEq(amount, TICKET_PRICE);
        assertEq(roundId, ROUND_ID);
        assertGt(purchasedAt, 0);
    }

    function _assertPendingTicket(ScratchGame.Ticket memory pendingTicket) internal view {
        assertEq(uint256(pendingTicket.status), uint256(ScratchGame.TicketStatus.PendingVRF));
        assertEq(pendingTicket.player, player);
        assertEq(pendingTicket.amountPaid, TICKET_PRICE);
        assertEq(pendingTicket.roundId, ROUND_ID);
        assertEq(pendingTicket.sourceTxHash, SOURCE_TX_HASH);
        assertEq(pendingTicket.requestId, 1);
    }

    function _assertReadyTicket(ScratchGame.Ticket memory readyTicket) internal pure {
        assertEq(uint256(readyTicket.status), uint256(ScratchGame.TicketStatus.Ready));
        assertEq(readyTicket.prizeTier, 3);
        assertEq(readyTicket.prizeAmount, TICKET_PRICE * 5);
        assertEq(readyTicket.randomWord, 50);
    }

    function _findLog(Vm.Log[] memory logs, bytes32 signature) internal pure returns (Vm.Log memory entry) {
        for (uint256 i = 0; i < logs.length; ++i) {
            if (logs[i].topics.length != 0 && logs[i].topics[0] == signature) {
                return logs[i];
            }
        }

        revert("Log not found");
    }
}
