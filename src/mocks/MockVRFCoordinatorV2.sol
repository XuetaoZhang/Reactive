// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity ^0.8.13;

import "../interfaces/IVRFCoordinatorV2Plus.sol";
import "../libraries/VRFV2PlusClient.sol";

interface IMockVRFConsumer {
    function rawFulfillRandomWords(uint256 requestId, uint256[] calldata randomWords) external;
}

contract MockVRFCoordinatorV2 is IVRFCoordinatorV2Plus {
    event RandomWordsRequested(
        uint256 indexed requestId,
        address indexed requester,
        bytes32 keyHash,
        uint64 subId,
        uint16 minimumRequestConfirmations,
        uint32 callbackGasLimit,
        uint32 numWords
    );

    event RandomWordsFulfilled(uint256 indexed requestId, address indexed consumer, uint256 randomWord);

    struct Request {
        address requester;
        bytes32 keyHash;
        uint64 subId;
        uint16 minimumRequestConfirmations;
        uint32 callbackGasLimit;
        uint32 numWords;
    }

    uint256 public nextRequestId = 1;

    mapping(uint256 => Request) public requests;

    function requestRandomWords(VRFV2PlusClient.RandomWordsRequest calldata request)
        external
        returns (uint256 requestId)
    {
        requestId = nextRequestId++;
        requests[requestId] = Request({
            requester: msg.sender,
            keyHash: request.keyHash,
            subId: uint64(request.subId),
            minimumRequestConfirmations: request.requestConfirmations,
            callbackGasLimit: request.callbackGasLimit,
            numWords: request.numWords
        });

        emit RandomWordsRequested(
            requestId,
            msg.sender,
            request.keyHash,
            uint64(request.subId),
            request.requestConfirmations,
            request.callbackGasLimit,
            request.numWords
        );
    }

    function fulfill(address consumer, uint256 requestId, uint256 randomWord) external {
        Request memory request = requests[requestId];
        require(request.requester == consumer, "Unknown consumer");

        uint256[] memory randomWords = new uint256[](1);
        randomWords[0] = randomWord;

        IMockVRFConsumer(consumer).rawFulfillRandomWords(requestId, randomWords);

        emit RandomWordsFulfilled(requestId, consumer, randomWord);
    }
}
