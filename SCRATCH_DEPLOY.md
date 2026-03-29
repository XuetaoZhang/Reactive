# Reactive Scratch Deployment Guide

This document covers deployment for the Reactive scratch-card demo.

This document corresponds to the three core contracts in the current project:

- `src/ScratchSource.sol`
- `src/ScratchReactive.sol`
- `src/ScratchGame.sol`

The complete flow is as follows:

1. The user buys a ticket on the source chain.
2. `ScratchSource` emits the `TicketPurchased` event.
3. `ScratchReactive` subscribes to that event and triggers a destination-chain callback through Reactive Network.
4. `ScratchGame` receives the callback on the destination chain, creates the ticket, and requests Chainlink VRF randomness.
5. Chainlink VRF calls back the destination-chain contract and writes the prize result on-chain.
6. The user scratches the ticket in the frontend and claims the prize.

## I. Contract responsibilities

`ScratchSource`

- Deployed on the source chain.
- Receives the ticket payment.
- Emits the `TicketPurchased(ticketId, player, roundId, amount)` event.

`ScratchReactive`

- Deployed on Reactive Network.
- Listens for the ticket-purchase event from `ScratchSource`.
- Forwards `ticketId`, `player`, `roundId`, `amount`, and `sourceTxHash` to the destination chain.
- After deployment, you must additionally activate the subscription once.

`ScratchGame`

- Deployed on the destination chain.
- Creates the ticket after receiving the Reactive callback.
- Requests Chainlink VRF randomness.
- Settles the prize tier and payout based on the random result.

## II. Constructor parameters

`ScratchSource(uint256 ticketPrice, uint256 initialRoundId)`

`ScratchReactive(
    uint256 originChainId,
    uint256 destinationChainId,
    address sourceContract,
    uint256 ticketPurchasedTopic0,
    address scratchGame
)`

`ScratchGame(
    address callbackSender,
    address randomnessCoordinator,
    bytes32 vrfKeyHash,
    uint256 vrfSubscriptionId,
    uint16 vrfRequestConfirmations,
    uint32 vrfCallbackGasLimit,
    bool vrfNativePayment
)`

## III. Prepare the event topic

`ScratchReactive` needs to subscribe to the following event signature:

```text
TicketPurchased(uint256,address,uint256,uint256)
```

Run:

```bash
cast keccak "TicketPurchased(uint256,address,uint256,uint256)"
```

Put the result into `TICKET_PURCHASED_TOPIC0` in `.env`.

## IV. Deploy `ScratchSource`

Using the script:

```bash
forge script script/DeployScratchSource.s.sol:DeployScratchSourceScript \
  --rpc-url "$ORIGIN_RPC_URL" \
  --broadcast
```

Current default parameters:

- `SCRATCH_TICKET_PRICE=10000000000000000`, which is `0.01 ETH`
- `SCRATCH_INITIAL_ROUND_ID=1`

After deployment, write the address into:

```text
SCRATCH_SOURCE_ADDR=0x...
```

## V. Configure Chainlink VRF

First open the official subscription management page:

- `https://vrf.chain.link/`

You need to prepare:

1. A VRF v2.5 subscription on `Ethereum Sepolia`.
2. Fund the subscription with test assets.
3. After deploying `ScratchGame`, add the `ScratchGame` address as a consumer.

Parameters currently used on Sepolia:

```text
VRF_COORDINATOR_ADDR=0x9DdfaCa8183c41ad55329BdeeD9F6A8d53168B1B
VRF_KEY_HASH=0x787d74caea10b2b357790d5b5247c2f63d1d91572a9846f780606e4d953677ae
VRF_REQUEST_CONFIRMATIONS=3
VRF_CALLBACK_GAS_LIMIT=200000
VRF_NATIVE_PAYMENT=true
```

Fill in your subscription ID here:

```text
VRF_SUBSCRIPTION_ID=<your subscription ID>
```

## VI. Deploy `ScratchGame`

Using the script:

```bash
forge script script/DeployScratchGame.s.sol:DeployScratchGameScript \
  --rpc-url "$DESTINATION_RPC_URL" \
  --broadcast
```

The current script reads:

- `DESTINATION_CALLBACK_PROXY_ADDR`
- `VRF_COORDINATOR_ADDR`
- `VRF_KEY_HASH`
- `VRF_SUBSCRIPTION_ID`
- `VRF_REQUEST_CONFIRMATIONS`
- `VRF_CALLBACK_GAS_LIMIT`
- `VRF_NATIVE_PAYMENT`
- `SCRATCH_GAME_INITIAL_FUNDING`

After deployment:

1. Write the address into `.env`.
2. Go to `vrf.chain.link`.
3. Click `Add consumer` in your subscription.
4. Add `SCRATCH_GAME_ADDR`.

In other words:

```text
SCRATCH_GAME_ADDR=0x...
```

## VII. Deploy `ScratchReactive`

Using the script:

```bash
forge script script/DeployScratchReactive.s.sol:DeployScratchReactiveScript \
  --rpc-url "$REACTIVE_RPC_URL" \
  --broadcast
```

After deployment, write the address into:

```text
SCRATCH_REACTIVE_ADDR=0x...
```

## VIII. Activate the Reactive subscription

After deploying `ScratchReactive`, you must manually activate the listener:

```bash
forge script script/ActivateScratchReactiveSubscription.s.sol:ActivateScratchReactiveSubscriptionScript \
  --rpc-url "$REACTIVE_RPC_URL" \
  --broadcast
```

Or use this directly:

```bash
cast send "$SCRATCH_REACTIVE_ADDR" \
  "activateSubscription()" \
  --private-key "$REACTIVE_PRIVATE_KEY" \
  --rpc-url "$REACTIVE_RPC_URL"
```

## IX. Bind the destination-chain callback sender

`ScratchGame` needs to bind the Reactive callback sender identity.

Note:

- This is not `SCRATCH_REACTIVE_ADDR`.
- Instead, use the actual sender identity recognized by Reactive Network.
- In this project, that is the Reactive deployment wallet address.

Run:

```bash
forge script script/BindScratchGameReactive.s.sol:BindScratchGameReactiveScript \
  --rpc-url "$DESTINATION_RPC_URL" \
  --broadcast
```

Corresponding environment variable:

```text
EXPECTED_REACTIVE_SENDER_ADDR=0x...
```

## X. Ticket purchase test

If you do not use the frontend, you can also buy a ticket manually on the source chain:

```bash
cast send "$SCRATCH_SOURCE_ADDR" \
  --rpc-url "$ORIGIN_RPC_URL" \
  --private-key "$PLAYER_PRIVATE_KEY" \
  --value 0.01ether \
  "buyTicket()"
```

Under normal conditions, a ticket goes through these stages in order:

1. `TicketPurchased`
2. `TicketOpened`
3. `RandomnessRequested`
4. `RandomnessFulfilled`
5. The frontend can open the Scratch Card and claim the prize.

## XI. Demo-only forced-win mode

This section is for live demos only.

> Warning
>
> Forced-win mode is not normal gameplay behavior and should not be used for production-like or unbiased-randomness demonstrations.

After enabling it:

- It still makes real Chainlink VRF requests.
- The random result is still written on-chain for real.
- But the prize tier of the first `N` tickets will be forced to the tier you specify.
- It automatically turns off after those tickets are used up.

Available prize tiers:

- `1`: break even
- `2`: silver prize
- `3`: gold prize
- `4`: jackpot

### 1. Enable forced win

First set the demo-only variables in `.env`:

```text
DEMO_MODE_ENABLED=true
DEMO_FORCED_PRIZE_TIER=3
DEMO_REMAINING_TICKETS=1
```

Then run:

```bash
forge script script/ConfigureScratchGameDemo.s.sol:ConfigureScratchGameDemoScript \
  --rpc-url "$DESTINATION_RPC_URL" \
  --broadcast
```

This means:

- The next ticket will definitely be tier `3`, which is the gold prize.
- It only takes effect once.
- It turns off automatically after use.

### 2. Disable forced win

If you want to restore real probabilities after the demo, set:

```text
DEMO_MODE_ENABLED=false
DEMO_FORCED_PRIZE_TIER=3
DEMO_REMAINING_TICKETS=1
```

Then run the same script:

```bash
forge script script/ConfigureScratchGameDemo.s.sol:ConfigureScratchGameDemoScript \
  --rpc-url "$DESTINATION_RPC_URL" \
  --broadcast
```

After disabling it, later tickets will be settled entirely according to real randomness.

## XII. Claim the prize

Once the ticket status becomes `Ready`, the user can claim the prize on the destination chain:

```bash
cast send "$SCRATCH_GAME_ADDR" \
  --rpc-url "$DESTINATION_RPC_URL" \
  --private-key "$PLAYER_PRIVATE_KEY" \
  "claim(uint256)" \
  "$TICKET_ID"
```

If you are using the frontend, simply click **Claim Prize** after scratching the Scratch Card open.

## XIII. Local testing

Run:

```bash
forge test --match-contract ScratchFlowTest -vv
```

Current test coverage includes:

- Exact ticket price validation
- Full ticket-purchase-to-prize-claim flow
- Demo forced-win mode

## XIV. Recommended demo order

For a live demo, the recommended order is:

1. Open the frontend and connect the wallet.
2. Show the three contract addresses at the bottom.
3. Explain that the user buys a ticket on the source chain first.
4. Wait for the ticket to materialize on the destination chain.
5. Show the real VRF request.
6. Scratch open the Scratch Card.
7. Show the win record and prize claim.

If you want a stable winning demo, keep demo mode enabled only for the specific demo run.
