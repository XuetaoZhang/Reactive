# Lucky Flux Frontend

This folder contains the static single-page game lobby for the scratch-card app.

## Files

- `index.html`: game lobby layout, winner board, and scratch-ticket modal
- `styles.css`: arcade-style visual system, motion, and modal/ticket presentation
- `app.js`: wallet connection, contract reads/writes, winner board loading, modal control, and scratch interaction
- `config.js`: deployment-specific chain and contract config

## Setup

Update `frontend/config.js` with:

- `sourceChain.id`
- `destinationChain.id`
- `contracts.source`
- `contracts.game`
- `contracts.reactive`

If wallet chain auto-add is needed, also set `rpcUrl`.

## Serve Locally

Any static file server works. Examples:

```bash
python -m http.server 4173 -d frontend
```

or

```bash
py -m http.server 4173 -d frontend
```

Then open `http://localhost:4173`.
