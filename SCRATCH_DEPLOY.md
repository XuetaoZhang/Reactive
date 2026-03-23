# Reactive Scratch Deployment

This document covers the scratch-card flow implemented by:

- `src/ScratchSource.sol`
- `src/ScratchReactive.sol`
- `src/ScratchGame.sol`

The end-to-end flow is:

1. A user buys a ticket on the source chain.
2. `ScratchSource` emits `TicketPurchased`.
3. `ScratchReactive` subscribes to that event and emits a Reactive callback.
4. `ScratchGame` receives the callback on the destination chain and requests VRF randomness.
5. The VRF coordinator calls back with randomness.
6. The player claims the prize on the destination chain.

## Contracts

`ScratchSource`
- Holds ticket revenue on the source chain.
- Emits `TicketPurchased(ticketId, player, roundId, amount)`.

`ScratchReactive`
- Subscribes to `TicketPurchased`.
- Forwards `ticketId`, `player`, `roundId`, `amount`, and `sourceTxHash` to the destination chain.
- Requires a separate activation transaction after deployment to register the subscription.

`ScratchGame`
- Opens tickets on the destination chain.
- Requests randomness from a VRF coordinator.
- Resolves prize tiers and pays prizes from its own prize pool.

## Constructor Args

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

## Step 1: Compute `topic_0`

The `ScratchReactive` contract needs the event signature hash for:

```text
TicketPurchased(uint256,address,uint256,uint256)
```

Use:

```bash
cast keccak "TicketPurchased(uint256,address,uint256,uint256)"
```

## Step 2: Deploy `ScratchSource`

Example:

```bash
forge create src/ScratchSource.sol:ScratchSource \
  --rpc-url "$ORIGIN_RPC_URL" \
  --private-key "$ORIGIN_PRIVATE_KEY" \
  --constructor-args 10000000000000000 1
```

The example above sets:

- `ticketPrice = 0.01 ether`
- `initialRoundId = 1`

Script equivalent:

```bash
forge script script/DeployScratchSource.s.sol:DeployScratchSourceScript \
  --rpc-url "$ORIGIN_RPC_URL" \
  --broadcast
```

## Step 3: Deploy `ScratchGame`

Before this step, prepare:

- a destination-chain callback proxy address for Reactive callbacks
- a Chainlink VRF v2.5 coordinator address on the destination chain
- a valid Chainlink VRF v2.5 key hash
- a Chainlink VRF v2.5 subscription id funded for the destination chain

### Chainlink VRF v2.5 Setup

Use the official VRF Subscription Manager:

- `https://vrf.chain.link/`

Official Chainlink docs:

- create and manage subscriptions: `https://docs.chain.link/vrf/v2-5/subscription/create-manage`
- get a random number with subscription: `https://docs.chain.link/vrf/v2-5/subscription/get-a-random-number`
- supported networks and live coordinator params: `https://docs.chain.link/vrf/v2-5/supported-networks`

For `Ethereum Sepolia`, Chainlink currently lists:

- `VRF_COORDINATOR_ADDR=0x9DdfaCa8183c41ad55329BdeeD9F6A8d53168B1B`
- `VRF_KEY_HASH=0x787d74caea10b2b357790d5b5247c2f63d1d91572a9846f780606e4d953677ae`
- minimum confirmations: `3`

Suggested setup:

1. Open `vrf.chain.link` and connect the wallet that will own the subscription.
2. Create a new VRF v2.5 subscription.
3. Fund it with either:
   - native Sepolia ETH if you plan to use `VRF_NATIVE_PAYMENT=true`
   - testnet LINK if you plan to use `VRF_NATIVE_PAYMENT=false`
4. Copy the subscription id into `.env` as `VRF_SUBSCRIPTION_ID`.
5. Deploy `ScratchGame`.
6. Add the deployed `SCRATCH_GAME_ADDR` as a consumer in the Subscription Manager.

Example:

```bash
forge create src/ScratchGame.sol:ScratchGame \
  --rpc-url "$DESTINATION_RPC_URL" \
  --private-key "$DESTINATION_PRIVATE_KEY" \
  --value 0.2ether \
  --constructor-args \
    "$DESTINATION_CALLBACK_PROXY_ADDR" \
    "$VRF_COORDINATOR_ADDR" \
    "$VRF_KEY_HASH" \
    "$VRF_SUBSCRIPTION_ID" \
    3 \
    200000 \
    true
```

After deployment, fund the prize pool again if needed:

```bash
cast send "$SCRATCH_GAME_ADDR" \
  --rpc-url "$DESTINATION_RPC_URL" \
  --private-key "$DESTINATION_PRIVATE_KEY" \
  --value 1ether
```

Script equivalent:

```bash
forge script script/DeployScratchGame.s.sol:DeployScratchGameScript \
  --rpc-url "$DESTINATION_RPC_URL" \
  --broadcast
```

If you deployed with mock settings first and want to switch the same game contract to real Chainlink VRF later, use:

```bash
forge script script/ConfigureScratchGameVrf.s.sol:ConfigureScratchGameVrfScript \
  --rpc-url "$DESTINATION_RPC_URL" \
  --broadcast
```

### Mock Mode

If you want to demo without Chainlink VRF first, deploy the local mock coordinator to the destination chain and point the game at it.

Deploy the mock:

```bash
forge script script/DeployMockVRFCoordinator.s.sol:DeployMockVRFCoordinatorScript \
  --rpc-url "$DESTINATION_RPC_URL" \
  --broadcast
```

Then set:

```text
VRF_COORDINATOR_ADDR=0x<mock coordinator address>
VRF_KEY_HASH=0x1111111111111111111111111111111111111111111111111111111111111111
VRF_SUBSCRIPTION_ID=1
VRF_REQUEST_CONFIRMATIONS=3
VRF_CALLBACK_GAS_LIMIT=200000
VRF_NATIVE_PAYMENT=false
```

These values only need to be non-zero in mock mode.

## Step 4: Deploy `ScratchReactive`

Example:

```bash
forge create src/ScratchReactive.sol:ScratchReactive \
  --rpc-url "$REACTIVE_RPC_URL" \
  --private-key "$REACTIVE_PRIVATE_KEY" \
  --value 0.1ether \
  --constructor-args \
    "$ORIGIN_CHAIN_ID" \
    "$DESTINATION_CHAIN_ID" \
    "$SCRATCH_SOURCE_ADDR" \
    "$TICKET_PURCHASED_TOPIC0" \
    "$SCRATCH_GAME_ADDR"
```

Script equivalent:

```bash
forge script script/DeployScratchReactive.s.sol:DeployScratchReactiveScript \
  --rpc-url "$REACTIVE_RPC_URL" \
  --broadcast
```

## Step 5: Activate The Reactive Subscription

After deployment, activate the source-chain event subscription:

```bash
forge script script/ActivateScratchReactiveSubscription.s.sol:ActivateScratchReactiveSubscriptionScript \
  --rpc-url "$REACTIVE_RPC_URL" \
  --broadcast
```

## Step 6: Bind `ScratchGame` To The Reactive Contract

Set the expected Reactive sender on the destination chain:

```bash
cast send "$SCRATCH_GAME_ADDR" \
  --rpc-url "$DESTINATION_RPC_URL" \
  --private-key "$DESTINATION_PRIVATE_KEY" \
  "setExpectedReactiveSender(address)" \
  "$EXPECTED_REACTIVE_SENDER_ADDR"
```

`EXPECTED_REACTIVE_SENDER_ADDR` should be the Reactive callback sender identity used by the network for this RVM, not the deployed `SCRATCH_REACTIVE_ADDR` contract address. For this project, that is the Reactive deployer address.

Script equivalent:

```bash
forge script script/BindScratchGameReactive.s.sol:BindScratchGameReactiveScript \
  --rpc-url "$DESTINATION_RPC_URL" \
  --broadcast
```

## Step 6: Buy A Ticket
## Step 7: Buy A Ticket

Example:

```bash
cast send "$SCRATCH_SOURCE_ADDR" \
  --rpc-url "$ORIGIN_RPC_URL" \
  --private-key "$PLAYER_PRIVATE_KEY" \
  --value 0.01ether \
  "buyTicket()"
```

After the source-chain transaction is confirmed:

- `ScratchReactive` should emit a callback
- `ScratchGame` should emit `TicketOpened`
- the VRF coordinator should later trigger `RandomnessFulfilled`

If you are using the mock coordinator, randomness will not arrive automatically. Fulfill it manually with:

```bash
forge script script/FulfillMockScratchRequest.s.sol:FulfillMockScratchRequestScript \
  --rpc-url "$DESTINATION_RPC_URL" \
  --broadcast
```

Before running that script, set:

```text
MOCK_FULFILL_TICKET_ID=<ticket id to resolve>
MOCK_RANDOM_WORD=50
```

Prize examples with the current game logic:

- `0` => jackpot
- `50` => gold hit
- `500` => silver hit
- `5000` => no prize

## Demo Win Mode

For hackathon demos, `ScratchGame` now supports an owner-only one-shot demo override.

It is disabled by default.

When enabled:

- the next `N` tickets still request real VRF randomness
- the returned random word is still stored on-chain
- but the prize tier is force-set to the configured winning tier
- after the queued number of tickets is consumed, demo mode turns itself off

Available forced prize tiers:

- `1` => refund
- `2` => silver hit
- `3` => gold hit
- `4` => jackpot

Configure it with:

```bash
forge script script/ConfigureScratchGameDemo.s.sol:ConfigureScratchGameDemoScript \
  --rpc-url "$DESTINATION_RPC_URL" \
  --broadcast
```

Before running that script, set:

```text
DEMO_MODE_ENABLED=true
DEMO_FORCED_PRIZE_TIER=3
DEMO_REMAINING_TICKETS=1
```

The example above guarantees that the next ticket resolves as a gold hit, then demo mode auto-disables.

## Step 7: Claim The Prize
## Step 8: Claim The Prize

Once the ticket is in `Ready` state, the player claims on the destination chain:

```bash
cast send "$SCRATCH_GAME_ADDR" \
  --rpc-url "$DESTINATION_RPC_URL" \
  --private-key "$PLAYER_PRIVATE_KEY" \
  "claim(uint256)" \
  "$TICKET_ID"
```

## Local Testing

Run:

```bash
forge test --match-contract ScratchFlowTest -vv
```

The local tests use:

- `src/mocks/MockVRFCoordinatorV2.sol`
- `src/mocks/MockCallbackProxy.sol`
- `test/ScratchFlow.t.sol`
