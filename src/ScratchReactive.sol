// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity ^0.8.13;

import "reactive-lib/src/interfaces/IReactive.sol";
import "reactive-lib/src/abstract-base/AbstractReactive.sol";

contract ScratchReactive is IReactive, AbstractReactive {
    error InvalidScratchGame();
    error Unauthorized();
    error SubscriptionAlreadyActive();
    error SubscriptionNotActive();
    error UnexpectedSourceChain(uint256 actualChainId);
    error UnexpectedSourceContract(address actualSource);
    error UnexpectedTopic0(uint256 actualTopic0);
    error InvalidPlayer();
    error InvalidAmount();
    
    event SubscriptionActivated(
        uint256 indexed originChainId,
        address indexed sourceContract,
        uint256 indexed ticketPurchasedTopic0
    );
    
    event SubscriptionDeactivated(
        uint256 indexed originChainId,
        address indexed sourceContract,
        uint256 indexed ticketPurchasedTopic0
    );

    event TicketForwarded(
        uint256 indexed ticketId,
        address indexed player,
        uint256 indexed roundId,
        uint256 amount,
        bytes32 sourceTxHash
    );

    uint64 public constant CALLBACK_GAS_LIMIT = 900_000;

    uint256 public immutable originChainId;
    uint256 public immutable destinationChainId;
    uint256 public immutable ticketPurchasedTopic0;

    address public owner;
    address public immutable sourceContract;
    address public immutable scratchGame;
    bool public subscriptionActive;

    constructor(
        uint256 _originChainId,
        uint256 _destinationChainId,
        address _sourceContract,
        uint256 _ticketPurchasedTopic0,
        address _scratchGame
    ) payable {
        if (_scratchGame == address(0)) revert InvalidScratchGame();

        owner = msg.sender;
        originChainId = _originChainId;
        destinationChainId = _destinationChainId;
        sourceContract = _sourceContract;
        ticketPurchasedTopic0 = _ticketPurchasedTopic0;
        scratchGame = _scratchGame;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    function activateSubscription() external rnOnly onlyOwner {
        if (subscriptionActive) revert SubscriptionAlreadyActive();

        service.subscribe(
            originChainId,
            sourceContract,
            ticketPurchasedTopic0,
            REACTIVE_IGNORE,
            REACTIVE_IGNORE,
            REACTIVE_IGNORE
        );

        subscriptionActive = true;
        emit SubscriptionActivated(originChainId, sourceContract, ticketPurchasedTopic0);
    }

    function deactivateSubscription() external rnOnly onlyOwner {
        if (!subscriptionActive) revert SubscriptionNotActive();

        service.unsubscribe(
            originChainId,
            sourceContract,
            ticketPurchasedTopic0,
            REACTIVE_IGNORE,
            REACTIVE_IGNORE,
            REACTIVE_IGNORE
        );

        subscriptionActive = false;
        emit SubscriptionDeactivated(originChainId, sourceContract, ticketPurchasedTopic0);
    }

    function react(LogRecord calldata log) external vmOnly {
        if (log.chain_id != originChainId) revert UnexpectedSourceChain(log.chain_id);
        if (log._contract != sourceContract) revert UnexpectedSourceContract(log._contract);
        if (log.topic_0 != ticketPurchasedTopic0) revert UnexpectedTopic0(log.topic_0);

        uint256 ticketId = log.topic_1;
        address player = address(uint160(log.topic_2));
        uint256 roundId = log.topic_3;
        uint256 amount = abi.decode(log.data, (uint256));

        if (player == address(0)) revert InvalidPlayer();
        if (amount == 0) revert InvalidAmount();

        bytes32 sourceTxHash = bytes32(log.tx_hash);
        bytes memory payload = abi.encodeWithSignature(
            "openTicket(address,uint256,address,uint256,uint256,bytes32)",
            address(this),
            ticketId,
            player,
            amount,
            roundId,
            sourceTxHash
        );

        emit TicketForwarded(ticketId, player, roundId, amount, sourceTxHash);
        emit Callback(destinationChainId, scratchGame, CALLBACK_GAS_LIMIT, payload);
    }
}
