// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity ^0.8.13;

contract ScratchSource {
    error IncorrectTicketPrice();
    error InvalidTicketPrice();
    error Unauthorized();
    error InvalidWithdrawalTarget();

    event TicketPurchased(uint256 indexed ticketId, address indexed player, uint256 indexed roundId, uint256 amount);

    event TicketPriceUpdated(uint256 oldPrice, uint256 newPrice);
    event RoundIdUpdated(uint256 oldRoundId, uint256 newRoundId);
    event TreasuryWithdrawal(address indexed to, uint256 amount);

    struct TicketReceipt {
        address player;
        uint256 amount;
        uint256 roundId;
        uint256 purchasedAt;
    }

    address public owner;
    uint256 public currentRoundId;
    uint256 public nextTicketId = 1;
    uint256 public ticketPrice;

    mapping(uint256 => TicketReceipt) public ticketReceipts;
    mapping(address => uint256) public lastTicketIdByPlayer;

    constructor(uint256 _ticketPrice, uint256 _initialRoundId) {
        if (_ticketPrice == 0) revert InvalidTicketPrice();

        owner = msg.sender;
        ticketPrice = _ticketPrice;
        currentRoundId = _initialRoundId;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    receive() external payable {
        _purchase(msg.sender);
    }

    function buyTicket() external payable returns (uint256 ticketId) {
        ticketId = _purchase(msg.sender);
    }

    function setTicketPrice(uint256 newTicketPrice) external onlyOwner {
        if (newTicketPrice == 0) revert InvalidTicketPrice();

        uint256 oldPrice = ticketPrice;
        ticketPrice = newTicketPrice;

        emit TicketPriceUpdated(oldPrice, newTicketPrice);
    }

    function setCurrentRoundId(uint256 newRoundId) external onlyOwner {
        uint256 oldRoundId = currentRoundId;
        currentRoundId = newRoundId;

        emit RoundIdUpdated(oldRoundId, newRoundId);
    }

    function withdraw(address payable to, uint256 amount) external onlyOwner {
        if (to == address(0)) revert InvalidWithdrawalTarget();

        (bool success,) = to.call{value: amount}("");
        require(success, "Withdrawal failed");

        emit TreasuryWithdrawal(to, amount);
    }

    function _purchase(address player) internal returns (uint256 ticketId) {
        if (msg.value != ticketPrice) revert IncorrectTicketPrice();

        ticketId = nextTicketId++;
        ticketReceipts[ticketId] =
            TicketReceipt({player: player, amount: msg.value, roundId: currentRoundId, purchasedAt: block.timestamp});
        lastTicketIdByPlayer[player] = ticketId;

        emit TicketPurchased(ticketId, player, currentRoundId, msg.value);
    }
}
