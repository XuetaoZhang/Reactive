# Local Reactive Demo Deployment Guide

This document explains how to deploy the local Reactive Demo.

This repository is no longer the default Foundry template. The contracts you actually need to deploy are:

- `src/Contract.sol:Contract`
- `src/Callback.sol:Callback`
- `src/Reactive.sol:BasicDemoReactiveContract`

Do not use the leftover template script `script/Counter.s.sol`.

## 1. Install Foundry

On Windows, it is recommended to install via Git Bash or WSL instead of directly using PowerShell.

```bash
curl -L https://foundry.paradigm.xyz | bash
foundryup
forge --version
cast --version
```

## 2. Prepare environment variables

Copy `.env.example` to `.env`, then fill in your own values.

Required fields:

- `ORIGIN_RPC_URL`: Source chain RPC endpoint
- `DESTINATION_RPC_URL`: Destination chain RPC endpoint
- `REACTIVE_RPC_URL`: Reactive Lasna testnet RPC endpoint
- `ORIGIN_PRIVATE_KEY`
- `DESTINATION_PRIVATE_KEY`
- `REACTIVE_PRIVATE_KEY`
- `ORIGIN_CHAIN_ID`
- `DESTINATION_CHAIN_ID`
- `DESTINATION_CALLBACK_PROXY_ADDR`

If you use `Sepolia -> Sepolia`:

- `ORIGIN_CHAIN_ID=11155111`
- `DESTINATION_CHAIN_ID=11155111`
- `DESTINATION_CALLBACK_PROXY_ADDR=0xc9f36411C9897e7F959D99ffca2a0Ba7ee0D7bDA`

If you use `Sepolia -> Base Sepolia`:

- `DESTINATION_CHAIN_ID=84532`
- `DESTINATION_CALLBACK_PROXY_ADDR=0xa6eA49Ed671B8a4dfCDd34E36b7a75Ac79B8A5a6`

## 3. Load environment variables

Git Bash:

```bash
set -a
source .env
set +a
```

PowerShell:

```powershell
Get-Content .env | ForEach-Object {
  if ($_ -match '^\s*#' -or $_ -match '^\s*$') { return }
  $name, $value = $_ -split '=', 2
  [System.Environment]::SetEnvironmentVariable($name, $value, 'Process')
}
```

## 4. Compute `topic_0`

The event emitted by your local source contract is:

```solidity
event Received(address indexed origin, address indexed sender, uint256 indexed value);
```

When the Reactive contract subscribes to source-chain logs, it relies on the event signature hash. In other words, it uses the following signature:

```text
Received(address,address,uint256)
```

Run `keccak256` on it, and the result is `topic_0`.

Compute it with `cast`:

```bash
cast keccak "Received(address,address,uint256)"
```

Then put the resulting `0x...` value into `TOPIC0=` in `.env`.

This command does not create files or modify the project. It only prints a hash value in the terminal.

You can also write the result directly into the current shell session.

Git Bash:

```bash
export TOPIC0=$(cast keccak "Received(address,address,uint256)")
```

PowerShell:

```powershell
$env:TOPIC0 = cast keccak "Received(address,address,uint256)"
```

## 5. Build

```bash
forge build
```

## 6. Deploy the source-chain contract

```bash
forge create src/Contract.sol:Contract \
  --rpc-url "$ORIGIN_RPC_URL" \
  --private-key "$ORIGIN_PRIVATE_KEY"
```

Put the deployed address into `ORIGIN_CONTRACT_ADDR=` in `.env`.

## 7. Deploy the destination-chain callback contract

```bash
forge create src/Callback.sol:Callback \
  --rpc-url "$DESTINATION_RPC_URL" \
  --private-key "$DESTINATION_PRIVATE_KEY" \
  --value 0.01ether \
  --constructor-args "$DESTINATION_CALLBACK_PROXY_ADDR"
```

Put the deployed address into `CALLBACK_ADDR=` in `.env`.

## 8. Deploy the Reactive contract

The `Reactive.sol` constructor in this local repository is not exactly the same as the latest online README. In your local copy, it is:

```solidity
constructor(
    uint256 _originChainId,
    uint256 _destinationChainId,
    address _contract,
    uint256 _topic_0,
    address _callback
) payable
```

Deployment command:

```bash
forge create src/Reactive.sol:BasicDemoReactiveContract \
  --rpc-url "$REACTIVE_RPC_URL" \
  --private-key "$REACTIVE_PRIVATE_KEY" \
  --value 0.1ether \
  --constructor-args \
    "$ORIGIN_CHAIN_ID" \
    "$DESTINATION_CHAIN_ID" \
    "$ORIGIN_CONTRACT_ADDR" \
    "$TOPIC0" \
    "$CALLBACK_ADDR"
```

## 9. Trigger the demo

The logic in this local `Reactive.sol` requires the amount in the source-chain log to be at least `0.001 ether` before it triggers the callback.

Send funds to the source-chain contract:

```bash
cast send "$ORIGIN_CONTRACT_ADDR" \
  --rpc-url "$ORIGIN_RPC_URL" \
  --private-key "$ORIGIN_PRIVATE_KEY" \
  --value 0.01ether
```

Then check the `CallbackReceived` event on the destination chain.

## Additional notes

- `script/Counter.s.sol` and `test/Counter.t.sol` are leftover files from the old template and are unrelated to the current deployment flow.
- `topic_0` changes whenever the event signature changes. Even renaming the event from `ContractReceive` to `Received` will change the hash.
- Since you have already changed it back to `Received(address,address,uint256)`, if it fully matches the event signature in the online README, you can directly use the official README's `topic_0` instead of necessarily running `cast keccak` yourself.
- However, the `_topic_0` parameter itself still needs to be passed to `BasicDemoReactiveContract`. The point is only that “this value can be copied from the official docs,” not that “this parameter is no longer needed.”
- The safest approach is still to run `cast keccak "Received(address,address,uint256)"` yourself, because it computes the hash locally, does not depend on on-chain state, and has no side effects.
