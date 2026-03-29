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
    bytes32 internal constant CALLBACK_EVENT_SIG = keccak256("Callback(uint256,address,uint64,bytes)");
    bytes32 internal constant TICKET_PURCHASED_EVENT_SIG =
        keccak256("TicketPurchased(uint256,address,uint256,uint256)");
    bytes32 internal constant VRF_KEY_HASH =
        bytes32(uint256(0x123456789abcdef123456789abcdef123456789abcdef123456789abcdef1234));

    address internal player = makeAddr("player");
    address internal outsider = makeAddr("outsider");

    ScratchSource internal source;
    ScratchReactive internal reactive;
    ScratchGame internal game;
    MockVRFCoordinatorV2 internal vrfCoordinator;
    MockCallbackProxy internal callbackProxy;

    function setUp() public {
        source = new ScratchSource(TICKET_PRICE, ROUND_ID);
        callbackProxy = new MockCallbackProxy();
        vrfCoordinator = new MockVRFCoordinatorV2();
        game = new ScratchGame(address(callbackProxy), address(vrfCoordinator), VRF_KEY_HASH, 1, 3, 200_000, false);

        reactive = new ScratchReactive(
            ORIGIN_CHAIN_ID, DESTINATION_CHAIN_ID, address(source), uint256(TICKET_PURCHASED_EVENT_SIG), address(game)
        );

        game.setExpectedReactiveSender(address(reactive));

        vm.deal(player, 1 ether);
        vm.deal(outsider, 1 ether);
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
        assertEq(game.totalReservedPrizeAmount(), TICKET_PRICE * 5);

        uint256 balanceBeforeClaim = player.balance;
        vm.prank(player);
        game.claim(ticketId);
        uint256 balanceAfterClaim = player.balance;

        ScratchGame.Ticket memory claimedTicket = game.getTicketState(ticketId);
        assertEq(uint256(claimedTicket.status), uint256(ScratchGame.TicketStatus.Claimed));
        assertEq(balanceAfterClaim - balanceBeforeClaim, TICKET_PRICE * 5);
        assertEq(game.totalReservedPrizeAmount(), 0);
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
        assertEq(game.totalReservedPrizeAmount(), TICKET_PRICE * 50);
    }

    function testMissRangeNowGuaranteesBaseWin() public {
        uint256 ticketId = _buyAndMaterializeTicket();
        ScratchGame.Ticket memory pendingTicket = game.getTicketState(ticketId);

        vrfCoordinator.fulfill(address(game), pendingTicket.requestId, 9_999);

        ScratchGame.Ticket memory readyTicket = game.getTicketState(ticketId);
        assertEq(uint256(readyTicket.status), uint256(ScratchGame.TicketStatus.Ready));
        assertEq(readyTicket.prizeTier, 1);
        assertEq(readyTicket.prizeAmount, TICKET_PRICE);
    }

    function testOpenTicketRequiresExpectedReactiveSenderBinding() public {
        game.setExpectedReactiveSender(address(0));

        vm.prank(address(callbackProxy));
        vm.expectRevert(ScratchGame.ExpectedReactiveSenderNotSet.selector);
        game.openTicket(address(reactive), 1, player, TICKET_PRICE, ROUND_ID, SOURCE_TX_HASH);
    }

    function testOpenTicketRejectsUnexpectedReactiveSender() public {
        address unexpectedReactiveSender = makeAddr("unexpectedReactiveSender");
        game.setExpectedReactiveSender(unexpectedReactiveSender);

        vm.prank(address(callbackProxy));
        vm.expectRevert(abi.encodeWithSelector(ScratchGame.UnexpectedReactiveSender.selector, address(reactive)));
        game.openTicket(address(reactive), 1, player, TICKET_PRICE, ROUND_ID, SOURCE_TX_HASH);
    }

    function testOpenTicketRejectsDuplicateTicketId() public {
        uint256 requestId = _openTicketDirect(game, 1, player, TICKET_PRICE, ROUND_ID, SOURCE_TX_HASH);
        assertEq(requestId, 1);

        vm.prank(address(callbackProxy));
        vm.expectRevert(ScratchGame.TicketAlreadyExists.selector);
        game.openTicket(address(reactive), 1, player, TICKET_PRICE, ROUND_ID, SOURCE_TX_HASH);
    }

    function testClaimRejectsNonOwner() public {
        uint256 ticketId = _buyAndMaterializeTicket();
        ScratchGame.Ticket memory pendingTicket = game.getTicketState(ticketId);
        vrfCoordinator.fulfill(address(game), pendingTicket.requestId, 50);

        vm.prank(outsider);
        vm.expectRevert(ScratchGame.InvalidTicketOwner.selector);
        game.claim(ticketId);
    }

    function testFulfillRevertsWhenPrizePoolCannotReserve() public {
        ScratchGame underfundedGame =
            new ScratchGame(address(callbackProxy), address(vrfCoordinator), VRF_KEY_HASH, 1, 3, 200_000, false);
        underfundedGame.setExpectedReactiveSender(address(reactive));
        vm.deal(address(underfundedGame), TICKET_PRICE);

        uint256 requestId = _openTicketDirect(underfundedGame, 1, player, TICKET_PRICE, ROUND_ID, SOURCE_TX_HASH);

        vm.expectRevert(ScratchGame.PrizePoolTooSmall.selector);
        vrfCoordinator.fulfill(address(underfundedGame), requestId, 50);
    }

    function testFulfillDeletesProcessedRequestMapping() public {
        uint256 ticketId = _buyAndMaterializeTicket();
        ScratchGame.Ticket memory pendingTicket = game.getTicketState(ticketId);

        vrfCoordinator.fulfill(address(game), pendingTicket.requestId, 50);
        assertEq(game.requestToTicketId(pendingTicket.requestId), 0);

        vm.expectRevert(ScratchGame.UnknownRequest.selector);
        vrfCoordinator.fulfill(address(game), pendingTicket.requestId, 50);
    }

    function testReactRejectsUnexpectedSourceChain() public {
        IReactive.LogRecord memory record = _buildManualLogRecord(
            ORIGIN_CHAIN_ID + 1, address(source), uint256(TICKET_PURCHASED_EVENT_SIG), 1, player, ROUND_ID, TICKET_PRICE
        );

        vm.expectRevert(abi.encodeWithSelector(ScratchReactive.UnexpectedSourceChain.selector, ORIGIN_CHAIN_ID + 1));
        reactive.react(record);
    }

    function testReactRejectsUnexpectedSourceContract() public {
        address wrongSource = makeAddr("wrongSource");
        IReactive.LogRecord memory record = _buildManualLogRecord(
            ORIGIN_CHAIN_ID, wrongSource, uint256(TICKET_PURCHASED_EVENT_SIG), 1, player, ROUND_ID, TICKET_PRICE
        );

        vm.expectRevert(abi.encodeWithSelector(ScratchReactive.UnexpectedSourceContract.selector, wrongSource));
        reactive.react(record);
    }

    function testReactRejectsUnexpectedTopic0() public {
        uint256 wrongTopic0 = uint256(keccak256("WrongTopic(uint256)"));
        IReactive.LogRecord memory record =
            _buildManualLogRecord(ORIGIN_CHAIN_ID, address(source), wrongTopic0, 1, player, ROUND_ID, TICKET_PRICE);

        vm.expectRevert(abi.encodeWithSelector(ScratchReactive.UnexpectedTopic0.selector, wrongTopic0));
        reactive.react(record);
    }

    function testReactRejectsZeroPlayer() public {
        IReactive.LogRecord memory record = _buildManualLogRecord(
            ORIGIN_CHAIN_ID, address(source), uint256(TICKET_PURCHASED_EVENT_SIG), 1, address(0), ROUND_ID, TICKET_PRICE
        );

        vm.expectRevert(ScratchReactive.InvalidPlayer.selector);
        reactive.react(record);
    }

    function testReactRejectsZeroAmount() public {
        IReactive.LogRecord memory record = _buildManualLogRecord(
            ORIGIN_CHAIN_ID, address(source), uint256(TICKET_PURCHASED_EVENT_SIG), 1, player, ROUND_ID, 0
        );

        vm.expectRevert(ScratchReactive.InvalidAmount.selector);
        reactive.react(record);
    }

    function _extractCallbackPayload(Vm.Log[] memory logs) internal pure returns (bytes memory payload) {
        Vm.Log memory callbackLog = _findLog(logs, CALLBACK_EVENT_SIG);

        payload = abi.decode(callbackLog.data, (bytes));
    }

    function _buyAndMaterializeTicket() internal returns (uint256 ticketId) {
        vm.recordLogs();
        vm.prank(player);
        ticketId = source.buyTicket{value: TICKET_PRICE}();
        Vm.Log[] memory purchaseLogs = vm.getRecordedLogs();
        Vm.Log memory purchaseLog = _findLog(purchaseLogs, TICKET_PURCHASED_EVENT_SIG);

        vm.recordLogs();
        reactive.react(_buildLogRecord(purchaseLog));
        Vm.Log[] memory reactiveLogs = vm.getRecordedLogs();
        bytes memory callbackPayload = _extractCallbackPayload(reactiveLogs);
        callbackProxy.dispatch(address(game), callbackPayload);
    }

    function _openTicketDirect(
        ScratchGame targetGame,
        uint256 ticketId,
        address ticketPlayer,
        uint256 amountPaid,
        uint256 roundId,
        bytes32 sourceTxHash
    ) internal returns (uint256 requestId) {
        vm.prank(address(callbackProxy));
        targetGame.openTicket(address(reactive), ticketId, ticketPlayer, amountPaid, roundId, sourceTxHash);
        requestId = targetGame.getTicketState(ticketId).requestId;
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

    function _buildManualLogRecord(
        uint256 chainId,
        address sourceContract,
        uint256 topic0,
        uint256 ticketId,
        address ticketPlayer,
        uint256 roundId,
        uint256 amount
    ) internal view returns (IReactive.LogRecord memory) {
        return IReactive.LogRecord({
            chain_id: chainId,
            _contract: sourceContract,
            topic_0: topic0,
            topic_1: ticketId,
            topic_2: uint256(uint160(ticketPlayer)),
            topic_3: roundId,
            data: abi.encode(amount),
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
