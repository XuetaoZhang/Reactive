# Lucky Scratch Frontend

This folder contains the static single-page frontend for the scratch demo.

## Files

- `index.html`: game lobby, winner board, and Scratch Card modal
- `styles.css`: visual styling, motion, and ticket presentation
- `app.js`: wallet connection, contract reads and writes, winner board loading, modal control, and scratch interaction
- `config.js`: deployment-specific chain, explorer, and contract configuration

## Required configuration

Update `frontend/config.js` before serving the page:

- `sourceChain.id`
- `destinationChain.id`
- `contracts.source`
- `contracts.game`
- `contracts.reactive`

## Optional configuration

Adjust these only if your environment needs them:

- `sourceChain.rpcUrl`
- `destinationChain.rpcUrl`
- `sourceChain.blockExplorerUrl`
- `destinationChain.blockExplorerUrl`
- `reactiveChain.blockExplorerUrl`
- `reactiveChain.senderAddress`
- `ui.scratchThreshold`
- `prizeTiers`

The checked-in RPC URLs and contract addresses are demo defaults. Replace them with your own values before sharing or reusing this frontend.

## Serve locally

Any static file server works. Examples:

```bash
python -m http.server 4173 -d frontend
```

or

```bash
py -m http.server 4173 -d frontend
```

Then open `http://localhost:4173`.

## Minimal manual validation

After updating the config and serving the page, check the following:

1. The page loads without missing assets.
2. The wallet can connect.
3. The three contract addresses appear in the footer.
4. The status panel reflects the latest ticket state for the connected wallet.
5. The Scratch Card modal opens only after the ticket is ready.
6. Claim stays disabled until the scratch threshold is reached.

This frontend has no build step. Validation is currently manual.
