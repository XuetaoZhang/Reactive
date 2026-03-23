// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity ^0.8.13;

import "reactive-lib/src/abstract-base/AbstractCallback.sol";
import "./interfaces/IVRFCoordinatorV2Plus.sol";
import "./libraries/VRFV2PlusClient.sol";

contract ScratchGame is AbstractCallback {
    error Unauthorized();
    error InvalidAddress();
    error InvalidTicketStatus();
    error InvalidTicketOwner();
    error TicketAlreadyExists();
    error UnknownRequest();
    error CoordinatorNotSet();
    error InvalidVrfConfig();
    error InvalidRandomWords();
    error InvalidPrizeTier();
    error PrizePoolTooSmall();

    enum TicketStatus {
        None,
        PendingVRF,
        Ready,
        Claimed
    }

    struct Ticket {
        address player;
        uint256 amountPaid;
        uint256 roundId;
        TicketStatus status;
        uint256 requestId;
        uint256 randomWord;
        uint8 prizeTier;
        uint256 prizeAmount;
        bytes32 sourceTxHash;
    }

    event ExpectedReactiveSenderUpdated(address indexed oldSender, address indexed newSender);
    event RandomnessCoordinatorUpdated(address indexed oldCoordinator, address indexed newCoordinator);
    event VrfConfigUpdated(
        bytes32 keyHash,
        uint256 subId,
        uint16 requestConfirmations,
        uint32 callbackGasLimit,
        bool nativePayment
    );
    event DemoModeConfigured(bool enabled, uint8 forcedPrizeTier, uint256 remainingTickets);
    event DemoOverrideQueued(uint256 indexed requestId, uint8 forcedPrizeTier);
    event DemoOverrideApplied(uint256 indexed requestId, uint256 indexed ticketId, uint8 forcedPrizeTier);
    event PrizePoolFunded(address indexed funder, uint256 amount);
    event TicketOpened(
        uint256 indexed ticketId,
        address indexed player,
        uint256 indexed roundId,
        uint256 amountPaid,
        uint256 requestId
    );
    event RandomnessRequested(uint256 indexed requestId, uint256 indexed ticketId);
    event RandomnessFulfilled(
        uint256 indexed requestId,
        uint256 indexed ticketId,
        uint256 randomWord,
        uint8 prizeTier,
        uint256 prizeAmount
    );
    event PrizeClaimed(uint256 indexed ticketId, address indexed player, uint256 prizeAmount);

    address public owner;
    address public expectedReactiveSender;
    address public randomnessCoordinator;
    bytes32 public vrfKeyHash;
    uint256 public vrfSubscriptionId;
    uint16 public vrfRequestConfirmations;
    uint32 public vrfCallbackGasLimit;
    bool public vrfNativePayment;
    bool public demoModeEnabled;
    uint8 public demoForcedPrizeTier;
    uint256 public demoRemainingTickets;

    uint32 public constant VRF_NUM_WORDS = 1;
    uint8 internal constant MAX_PRIZE_TIER = 4;

    mapping(uint256 => Ticket) public tickets;
    mapping(uint256 => uint256) public requestToTicketId;
    mapping(uint256 => uint8) public demoForcedTierByRequestId;

    constructor(
        address _callbackSender,
        address _randomnessCoordinator,
        bytes32 _vrfKeyHash,
        uint256 _vrfSubscriptionId,
        uint16 _vrfRequestConfirmations,
        uint32 _vrfCallbackGasLimit,
        bool _vrfNativePayment
    )
        AbstractCallback(_callbackSender)
        payable
    {
        owner = msg.sender;
        randomnessCoordinator = _randomnessCoordinator;
        _setVrfConfig(
            _vrfKeyHash,
            _vrfSubscriptionId,
            _vrfRequestConfirmations,
            _vrfCallbackGasLimit,
            _vrfNativePayment
        );
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    modifier onlyCoordinator() {
        if (msg.sender != randomnessCoordinator) revert Unauthorized();
        _;
    }

    modifier onlyExpectedReactiveSender(address reactiveSender) {
        if (expectedReactiveSender != address(0) && expectedReactiveSender != reactiveSender) {
            revert Unauthorized();
        }
        _;
    }

    receive() external payable override {
        emit PrizePoolFunded(msg.sender, msg.value);
    }

    function setExpectedReactiveSender(address newExpectedReactiveSender) external onlyOwner {
        address oldSender = expectedReactiveSender;
        expectedReactiveSender = newExpectedReactiveSender;

        emit ExpectedReactiveSenderUpdated(oldSender, newExpectedReactiveSender);
    }

    function setRandomnessCoordinator(address newCoordinator) external onlyOwner {
        address oldCoordinator = randomnessCoordinator;
        randomnessCoordinator = newCoordinator;

        emit RandomnessCoordinatorUpdated(oldCoordinator, newCoordinator);
    }

    function setVrfConfig(
        bytes32 newKeyHash,
        uint256 newSubscriptionId,
        uint16 newRequestConfirmations,
        uint32 newCallbackGasLimit,
        bool newNativePayment
    ) external onlyOwner {
        _setVrfConfig(
            newKeyHash,
            newSubscriptionId,
            newRequestConfirmations,
            newCallbackGasLimit,
            newNativePayment
        );
    }

    function configureDemoMode(bool enabled, uint8 forcedPrizeTier, uint256 remainingTickets) external onlyOwner {
        if (enabled) {
            if (forcedPrizeTier == 0 || forcedPrizeTier > MAX_PRIZE_TIER) revert InvalidPrizeTier();
            if (remainingTickets == 0) revert InvalidVrfConfig();
        }

        demoModeEnabled = enabled;
        demoForcedPrizeTier = enabled ? forcedPrizeTier : 0;
        demoRemainingTickets = enabled ? remainingTickets : 0;

        emit DemoModeConfigured(demoModeEnabled, demoForcedPrizeTier, demoRemainingTickets);
    }

    function openTicket(
        address reactiveSender,
        uint256 ticketId,
        address player,
        uint256 amountPaid,
        uint256 roundId,
        bytes32 sourceTxHash
    ) external authorizedSenderOnly onlyExpectedReactiveSender(reactiveSender) {
        if (player == address(0)) revert InvalidAddress();
        if (tickets[ticketId].status != TicketStatus.None) revert TicketAlreadyExists();

        uint256 requestId = _requestRandomness(ticketId);
        _queueDemoOverride(requestId);

        tickets[ticketId] = Ticket({
            player: player,
            amountPaid: amountPaid,
            roundId: roundId,
            status: TicketStatus.PendingVRF,
            requestId: requestId,
            randomWord: 0,
            prizeTier: 0,
            prizeAmount: 0,
            sourceTxHash: sourceTxHash
        });

        emit TicketOpened(ticketId, player, roundId, amountPaid, requestId);
    }

    function rawFulfillRandomWords(uint256 requestId, uint256[] calldata randomWords) external onlyCoordinator {
        if (randomWords.length != VRF_NUM_WORDS) revert InvalidRandomWords();

        _fulfillRandomWord(requestId, randomWords[0]);
    }

    function claim(uint256 ticketId) external {
        Ticket storage ticket = tickets[ticketId];
        if (ticket.player != msg.sender) revert InvalidTicketOwner();
        if (ticket.status != TicketStatus.Ready) revert InvalidTicketStatus();
        if (ticket.prizeAmount > address(this).balance) revert PrizePoolTooSmall();

        ticket.status = TicketStatus.Claimed;

        if (ticket.prizeAmount != 0) {
            (bool success, ) = ticket.player.call{value: ticket.prizeAmount}("");
            require(success, "Prize transfer failed");
        }

        emit PrizeClaimed(ticketId, ticket.player, ticket.prizeAmount);
    }

    function getTicketState(uint256 ticketId) external view returns (Ticket memory) {
        return tickets[ticketId];
    }

    function _requestRandomness(uint256 ticketId) internal returns (uint256 requestId) {
        if (randomnessCoordinator == address(0)) revert CoordinatorNotSet();
        if (vrfKeyHash == bytes32(0) || vrfSubscriptionId == 0) revert InvalidVrfConfig();

        requestId = IVRFCoordinatorV2Plus(randomnessCoordinator).requestRandomWords(
            VRFV2PlusClient.RandomWordsRequest({
                keyHash: vrfKeyHash,
                subId: vrfSubscriptionId,
                requestConfirmations: vrfRequestConfirmations,
                callbackGasLimit: vrfCallbackGasLimit,
                numWords: VRF_NUM_WORDS,
                extraArgs: VRFV2PlusClient.argsToBytes(
                    VRFV2PlusClient.ExtraArgsV1({nativePayment: vrfNativePayment})
                )
            })
        );

        emit RandomnessRequested(requestId, ticketId);
        requestToTicketId[requestId] = ticketId;
    }

    function _resolvePrize(uint256 amountPaid, uint256 randomWord)
        internal
        pure
        returns (uint8 prizeTier, uint256 prizeAmount)
    {
        uint256 roll = randomWord % 10_000;

        if (roll == 0) {
            return (4, amountPaid * 50);
        }
        if (roll < 100) {
            return (3, amountPaid * 5);
        }
        if (roll < 1_000) {
            return (2, (amountPaid * 150) / 100);
        }
        if (roll < 3_000) {
            return (1, amountPaid);
        }

        return (0, 0);
    }

    function _prizeForTier(uint256 amountPaid, uint8 prizeTier) internal pure returns (uint256 prizeAmount) {
        if (prizeTier == 4) return amountPaid * 50;
        if (prizeTier == 3) return amountPaid * 5;
        if (prizeTier == 2) return (amountPaid * 150) / 100;
        if (prizeTier == 1) return amountPaid;
        return 0;
    }

    function _fulfillRandomWord(uint256 requestId, uint256 randomWord) internal {
        uint256 ticketId = requestToTicketId[requestId];
        if (ticketId == 0) revert UnknownRequest();

        Ticket storage ticket = tickets[ticketId];
        if (ticket.status != TicketStatus.PendingVRF) revert InvalidTicketStatus();

        (uint8 prizeTier, uint256 prizeAmount) = _resolvePrize(ticket.amountPaid, randomWord);
        uint8 forcedPrizeTier = demoForcedTierByRequestId[requestId];
        if (forcedPrizeTier != 0) {
            prizeTier = forcedPrizeTier;
            prizeAmount = _prizeForTier(ticket.amountPaid, forcedPrizeTier);
            delete demoForcedTierByRequestId[requestId];
            emit DemoOverrideApplied(requestId, ticketId, forcedPrizeTier);
        }

        ticket.randomWord = randomWord;
        ticket.prizeTier = prizeTier;
        ticket.prizeAmount = prizeAmount;
        ticket.status = TicketStatus.Ready;

        emit RandomnessFulfilled(requestId, ticketId, randomWord, prizeTier, prizeAmount);
    }

    function _setVrfConfig(
        bytes32 newKeyHash,
        uint256 newSubscriptionId,
        uint16 newRequestConfirmations,
        uint32 newCallbackGasLimit,
        bool newNativePayment
    ) internal {
        if (newKeyHash == bytes32(0)) revert InvalidVrfConfig();
        if (newSubscriptionId == 0) revert InvalidVrfConfig();
        if (newRequestConfirmations == 0) revert InvalidVrfConfig();
        if (newCallbackGasLimit == 0) revert InvalidVrfConfig();

        vrfKeyHash = newKeyHash;
        vrfSubscriptionId = newSubscriptionId;
        vrfRequestConfirmations = newRequestConfirmations;
        vrfCallbackGasLimit = newCallbackGasLimit;
        vrfNativePayment = newNativePayment;

        emit VrfConfigUpdated(
            newKeyHash,
            newSubscriptionId,
            newRequestConfirmations,
            newCallbackGasLimit,
            newNativePayment
        );
    }

    function _queueDemoOverride(uint256 requestId) internal {
        if (!demoModeEnabled || demoRemainingTickets == 0) return;

        demoForcedTierByRequestId[requestId] = demoForcedPrizeTier;
        demoRemainingTickets -= 1;
        emit DemoOverrideQueued(requestId, demoForcedPrizeTier);

        if (demoRemainingTickets == 0) {
            demoModeEnabled = false;
        }
    }
}
