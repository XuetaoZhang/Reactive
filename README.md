# Lucky Scratch

Lucky Scratch is a single-page onchain scratch-card game built to demonstrate **Reactive Contracts** in a real playable flow.

The player buys a ticket on the **origin chain**, a **Reactive contract** listens to the purchase event and automatically triggers the ticket creation on the **destination chain**, then **Chainlink VRF** settles the prize, and the player scratches the card in the frontend and claims the reward onchain.

Chinese version: [README_CN.md](./README_CN.md)

demo：`https://luckyscratch-drab.vercel.app/`

## Why This Project Needs Reactive Contracts

This project is not just a Solidity contract deployed on Reactive Network. The reactive layer is part of the business logic:

1. The player purchases a ticket on the origin chain.
2. `ScratchSource` emits `TicketPurchased`.
3. `ScratchReactive` subscribes to that EVM event on Reactive Network.
4. `ScratchReactive` automatically triggers the destination-chain callback.
5. `ScratchGame` opens the ticket, requests VRF randomness, and later settles the prize.

Without the reactive layer, this game would need a centralized backend or bot to:

- watch the origin-chain purchase event,
- relay the purchase to the destination chain,
- keep the flow alive when the frontend is closed.

Reactive Contracts remove that offchain relay dependency from the core cross-chain game loop.

## Repository Contents

### Contracts

- `src/ScratchSource.sol`: origin-chain ticket sale contract
- `src/ScratchReactive.sol`: Reactive Network contract that listens to origin-chain events and relays the callback
- `src/ScratchGame.sol`: destination-chain game contract that opens tickets, requests VRF, settles prizes, and handles claims

### Deployment and Ops Scripts

- `script/DeployScratchSource.s.sol`
- `script/DeployScratchGame.s.sol`
- `script/DeployScratchReactive.s.sol`
- `script/ActivateScratchReactiveSubscription.s.sol`
- `script/BindScratchGameReactive.s.sol`
- `script/ConfigureScratchGameVrf.s.sol`
- `script/ConfigureScratchGameDemo.s.sol`
- `script/FulfillMockScratchRequest.s.sol`

### Frontend

- `frontend/index.html`
- `frontend/styles.css`
- `frontend/app.js`
- `frontend/config.js`

## Problem Statement and Solution

### Problem

The game needs a trust-minimized way to turn a source-chain payment into a destination-chain playable ticket. The user should not depend on a backend service to keep the game moving.

### Solution

- `ScratchSource` records the purchase and emits `TicketPurchased`.
- `ScratchReactive` subscribes to that event on Reactive Network and relays the data to the destination chain.
- `ScratchGame` creates the ticket and requests Chainlink VRF.
- The frontend reads state from chain data only and lets the player scratch and claim directly from their wallet.

## Deployed Contracts

### Current Demo Deployment

| Component | Network | Chain ID | Address | Deployment TX |
| --- | --- | --- | --- | --- |
| ScratchSource | Ethereum Sepolia | `11155111` | `0xc6D1C9500E25ebDd55650Ca04f8C97e6616770C5` | `0x2a442f3880f2c0fa57657f2293c7e79e8ed09ce54b0392e87b0d32a07aa4e462` |
| ScratchGame | Ethereum Sepolia | `11155111` | `0x092B84CAeDe9e1c52C7bACA840372f4c18baA3F1` | `0x4bb046cd95ee09040e3f7fd706892ac3e666f08477b8ddff05c85f36840c9124` |
| ScratchReactive | Reactive Network | `5318007` | `0x4387e5F6C79ae885C9E2AcCB47cD4E31085BaeaF` | `0x16e4bfeb938285a62e60f4594dd8bc0b291d37b0af333cb6d31325e0abb44268` |

### Explorer Bases

- Origin / Destination explorer: `https://sepolia.etherscan.io`
- Reactive explorer: `https://reactscan.net/`

## Post-Deployment Workflow

After deployment, one ticket goes through this exact workflow:

1. The player calls `buyTicket()` on `ScratchSource` on the origin chain.
2. `ScratchSource` emits `TicketPurchased(ticketId, player, roundId, amount)`.
3. `ScratchReactive` listens to that event through Reactive Network.
4. `ScratchReactive` triggers `openTicket()` on `ScratchGame` on the destination chain.
5. `ScratchGame` stores the ticket and emits `TicketOpened`.
6. `ScratchGame` requests Chainlink VRF and emits `RandomnessRequested`.
7. Chainlink VRF fulfills the request and `ScratchGame` emits `RandomnessFulfilled`.
8. The player opens the frontend, scratches the card visually, and calls `claim(ticketId)` on the destination chain if eligible.

## Deployment Guide

Detailed Chinese deployment notes are in [DEPLOY.md](./DEPLOY.md) and [SCRATCH_DEPLOY.md](./SCRATCH_DEPLOY.md). The quick path is below.

### 1. Install Foundry

```bash
curl -L https://foundry.paradigm.xyz | bash
foundryup
forge --version
cast --version
```

### 2. Prepare `.env`

Copy `.env.example` to `.env`, then fill:

- origin RPC / private key
- destination RPC / private key
- Reactive RPC / private key
- destination callback proxy
- VRF config
- deployed contract addresses after each step

### 3. Build

```bash
forge build
```

### 4. Deploy Contracts

Deploy the origin contract:

```bash
forge script script/DeployScratchSource.s.sol:DeployScratchSourceScript \
  --rpc-url "$ORIGIN_RPC_URL" \
  --broadcast
```

Deploy the destination game contract:

```bash
forge script script/DeployScratchGame.s.sol:DeployScratchGameScript \
  --rpc-url "$DESTINATION_RPC_URL" \
  --broadcast
```

Configure VRF on the destination contract:

```bash
forge script script/ConfigureScratchGameVrf.s.sol:ConfigureScratchGameVrfScript \
  --rpc-url "$DESTINATION_RPC_URL" \
  --broadcast
```

Deploy the Reactive contract:

```bash
forge script script/DeployScratchReactive.s.sol:DeployScratchReactiveScript \
  --rpc-url "$REACTIVE_RPC_URL" \
  --broadcast
```

Activate the Reactive subscription:

```bash
forge script script/ActivateScratchReactiveSubscription.s.sol:ActivateScratchReactiveSubscriptionScript \
  --rpc-url "$REACTIVE_RPC_URL" \
  --broadcast
```

Bind the expected Reactive sender on the destination contract:

```bash
forge script script/BindScratchGameReactive.s.sol:BindScratchGameReactiveScript \
  --rpc-url "$DESTINATION_RPC_URL" \
  --broadcast
```

### 5. Add VRF Consumer

After `ScratchGame` is deployed:

1. Open `https://vrf.chain.link/`
2. Select the Sepolia subscription
3. Add `SCRATCH_GAME_ADDR` as consumer

### 6. Frontend Operation

For local preview:

```bash
python -m http.server 4173 -d frontend
```

Then open `http://localhost:4173`.

For Vercel:

1. Import the repository
2. Set the root directory to `frontend`
3. Deploy as a static site

Current frontend config is read from `frontend/config.js`. That file contains public RPC URLs and contract addresses, so do not put private keys or admin secrets there.

## Demo Mode / Guaranteed-Win Switch

The destination contract supports a demo mode for live presentations.

### Enable demo mode

Set in `.env`:

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

### Disable demo mode

Set in `.env`:

```text
DEMO_MODE_ENABLED=false
```

Then run the same script again:

```bash
forge script script/ConfigureScratchGameDemo.s.sol:ConfigureScratchGameDemoScript \
  --rpc-url "$DESTINATION_RPC_URL" \
  --broadcast
```

## Deployment and Configuration Transaction Records

The repository already includes broadcast records for the current demo deployment.

| Step | Network | TX Hash |
| --- | --- | --- |
| Deploy `ScratchSource` | Sepolia | `0x2a442f3880f2c0fa57657f2293c7e79e8ed09ce54b0392e87b0d32a07aa4e462` |
| Deploy `ScratchGame` | Sepolia | `0x4bb046cd95ee09040e3f7fd706892ac3e666f08477b8ddff05c85f36840c9124` |
| Deploy `ScratchReactive` | Reactive Network | `0x16e4bfeb938285a62e60f4594dd8bc0b291d37b0af333cb6d31325e0abb44268` |
| Bind expected Reactive sender | Sepolia | `0xfcec25b5060788a83458c37d0aaf76694ed7b49a6c48cdae338940b28ddf4e23` |
| Set VRF coordinator | Sepolia | `0xcd6575c47ec739f868e1d1a2518fa3f1504b866b11552cfe14294211cd056319` |
| Set VRF config | Sepolia | `0xa7396366d75d4935c48eeda96af9a40e9328cfdd01b49375bddf64e5b9bbb3bd` |
| Enable demo mode (`tier=3`, `remaining=1`) | Sepolia | `0xb9bde61b16f33364ffcb8c1b98ab0e46bd05fea3647d40f101d1102fa36bec4c` |

## End-to-End Runtime Transaction Log

For the final competition submission, replace the placeholders below with the hashes from the recorded demo run used in the submission package.

| Runtime Step | Network | TX Hash |
| --- | --- | --- |
| Origin ticket purchase (`buyTicket`) | Origin chain | `TBD - replace with final demo run hash` |
| Reactive relay / callback execution | Reactive Network | `TBD - replace with reactscan hash` |
| Destination ticket materialization (`openTicket`) | Destination chain | `TBD - replace with final demo run hash` |
| Destination VRF fulfillment | Destination chain | `TBD - replace with final demo run hash` |
| Destination prize claim (`claim`) | Destination chain | `TBD - replace with final demo run hash` |

## Minimum Requirement Mapping

| Requirement | How this repository satisfies it |
| --- | --- |
| Effective use of Reactive Contracts | `src/ScratchReactive.sol` listens to origin-chain EVM events and automatically triggers the destination callback |
| Full contract source code | `src/` contains origin, reactive, and destination contracts |
| Deployment scripts and usage docs | `script/`, `README.md`, `README_CN.md`, `DEPLOY.md`, and `SCRATCH_DEPLOY.md` |
| Origin contract included | `src/ScratchSource.sol` is included and deployed |
| Public deployed addresses | Listed in the `Deployed Contracts` section above |
| Problem explanation and solution | Covered in `Why This Project Needs Reactive Contracts` and `Problem Statement and Solution` |
| Post-deployment workflow explanation | Covered in `Post-Deployment Workflow` |
| Complete transaction hash record | Deployment/configuration hashes are listed above; runtime submission placeholders are explicitly reserved for the final recorded demo run |
