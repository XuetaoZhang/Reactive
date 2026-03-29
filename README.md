# Reactive Smart Contract Demos

[Chinese README](README_ch.md)

This repository contains two Foundry-based Solidity demos built around **Reactive Network**:

- **Lucky Scratch**: a multi-chain scratch-card flow with a source-chain purchase, a Reactive Network relay, a destination-chain game contract, and a static frontend.
- **Basic Reactive demo**: a minimal example that subscribes to a source-chain event and triggers a callback on the destination chain.

## Repository Layout

- [src/](src): smart contracts for both demos, plus interfaces, libraries, and test mocks
- [script/](script): Foundry deployment and configuration scripts
- [test/](test): automated tests for the scratch flow and the minimal demo
- [frontend/](frontend): static Lucky Scratch frontend
- [.env.example](.env.example): deployment and demo configuration template
- [DEPLOY.md](DEPLOY.md): deployment guide for the basic demo
- [SCRATCH_DEPLOY.md](SCRATCH_DEPLOY.md): deployment guide for the Lucky Scratch demo
- [frontend/README.md](frontend/README.md): frontend setup notes

The repository also includes generated artifacts under `out/`, `cache/`, and `broadcast/`. Those folders are build and deployment outputs, not the primary source of truth.

## Demo 1: Lucky Scratch

Lucky Scratch is the main end-to-end demo in this repository.

### Contracts

- `src/ScratchSource.sol:ScratchSource`
  - lives on the source chain
  - sells tickets
  - stores ticket receipts
  - emits `TicketPurchased(ticketId, player, roundId, amount)`

- `src/ScratchReactive.sol:ScratchReactive`
  - lives on Reactive Network
  - subscribes to the `TicketPurchased` event
  - validates the incoming log
  - forwards `ticketId`, `player`, `roundId`, `amount`, and `sourceTxHash` to the destination chain

- `src/ScratchGame.sol:ScratchGame`
  - lives on the destination chain
  - receives the callback from Reactive Network
  - opens the ticket
  - requests Chainlink VRF randomness
  - stores the resolved prize tier and payout
  - allows the player to claim the prize

### Frontend

The Lucky Scratch UI is a static single-page app in [frontend/](frontend/):

- [frontend/index.html](frontend/index.html): page structure
- [frontend/styles.css](frontend/styles.css): styling and scratch-card presentation
- [frontend/app.js](frontend/app.js): wallet connection, reads, writes, polling, and scratch interaction
- [frontend/config.js](frontend/config.js): chain metadata, RPC URLs, explorers, addresses, and UI tuning

There is no frontend build step.

### Scratch Flow

1. A player buys a ticket on the source chain.
2. `ScratchSource` emits `TicketPurchased`.
3. `ScratchReactive` receives the source-chain log through Reactive Network and emits a callback payload.
4. `ScratchGame` receives the callback on the destination chain and creates the ticket.
5. `ScratchGame` requests Chainlink VRF randomness.
6. The VRF coordinator fulfills the request and writes the prize result on-chain.
7. The frontend reveals the ticket state and the player claims the prize.

### Scratch Deployment Entry Points

- Full deployment guide: [SCRATCH_DEPLOY.md](SCRATCH_DEPLOY.md)
- Frontend setup: [frontend/README.md](frontend/README.md)

## Demo 2: Basic Reactive Demo

The basic demo is a smaller example intended to show the minimal Reactive pattern without the scratch-card flow.

### Contracts

- `src/Contract.sol:Contract`
  - emits `Received(address origin, address sender, uint256 value)` when it receives ETH
  - refunds the received ETH to `tx.origin`

- `src/Reactive.sol:BasicDemoReactiveContract`
  - subscribes to the `Received` event
  - emits a callback when the logged amount is at least `0.001 ether`

- `src/Callback.sol:Callback`
  - receives the Reactive callback
  - emits `CallbackReceived`

### Basic Deployment Entry Point

- Deployment guide: [DEPLOY.md](DEPLOY.md)

## Prerequisites

- Foundry installed with `forge` and `cast`
- Submodules initialized
- RPC endpoints and funded accounts for the target testnets
- For Lucky Scratch, a valid Chainlink VRF v2.5 subscription on the destination chain

If this is a fresh clone, initialize dependencies first:

```bash
git submodule update --init --recursive
```

## Quick Start

Run these commands from the repository root:

```bash
forge fmt --check
forge build
forge test -vv
```

Useful focused test runs:

```bash
forge test --match-contract BasicDemoTest -vv
forge test --match-contract ScratchFlowTest -vv
```

## Test Coverage

The current test suite covers:

- exact-price validation for scratch-ticket purchases
- the end-to-end scratch flow from purchase to prize claim
- demo-only forced-win behavior
- basic source-contract event emission and refund behavior
- threshold-based callback behavior in the minimal Reactive demo

## Script Index

### Scratch Deployment and Operations

- `script/DeployScratchSource.s.sol`: deploys `ScratchSource`
- `script/DeployScratchGame.s.sol`: deploys `ScratchGame`
- `script/DeployScratchReactive.s.sol`: deploys `ScratchReactive`
- `script/ActivateScratchReactiveSubscription.s.sol`: activates the Reactive subscription
- `script/DeactivateScratchReactiveSubscription.s.sol`: deactivates the Reactive subscription
- `script/BindScratchGameReactive.s.sol`: sets the expected Reactive sender on `ScratchGame`
- `script/ConfigureScratchGameVrf.s.sol`: updates VRF configuration on `ScratchGame`
- `script/ConfigureScratchGameDemo.s.sol`: toggles demo-only forced-win mode

### Local and Mock Helpers

- `script/DeployMockVRFCoordinator.s.sol`: deploys the local mock VRF coordinator used for testing or demo setup
- `script/FulfillMockScratchRequest.s.sol`: fulfills a scratch request through the mock coordinator

## Environment Setup

Copy [.env.example](.env.example) to `.env` and fill in the values for your environment.

Important values include:

- RPC URLs and private keys for origin, destination, and Reactive Network deployments
- `ORIGIN_CHAIN_ID` and `DESTINATION_CHAIN_ID`
- `DESTINATION_CALLBACK_PROXY_ADDR`
- `TOPIC0` for the basic demo
- `TICKET_PURCHASED_TOPIC0` for the scratch demo
- deployed addresses written back into `.env` after each deployment step

Event topics are derived from the Solidity event signatures:

```bash
cast keccak "Received(address,address,uint256)"
cast keccak "TicketPurchased(uint256,address,uint256,uint256)"
```

## Frontend Smoke Test

Before serving the Lucky Scratch frontend:

1. Update [frontend/config.js](frontend/config.js) with the deployed chain IDs and contract addresses.
2. Confirm the configured RPC URLs and explorer URLs match your target environment.
3. Serve the `frontend/` directory with a static file server.

Example:

```bash
py -m http.server 4173 -d frontend
```

Then open `http://localhost:4173`.

## Demo-Only Warning

The scratch demo supports a **demo-only forced-win mode** through:

- `DEMO_MODE_ENABLED`
- `DEMO_FORCED_PRIZE_TIER`
- `DEMO_REMAINING_TICKETS`

This mode is intended only for controlled presentations or rehearsals.

If you want unbiased randomness behavior, or anything closer to a production-like run, keep demo mode disabled.
