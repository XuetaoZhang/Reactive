import { BrowserProvider, Contract, JsonRpcProvider, formatEther } from "https://esm.sh/ethers@6.13.5";
import { SCRATCH_CONFIG } from "./config.js?v=20260329-7";

const SOURCE_ABI = [
  "function buyTicket() payable returns (uint256)",
  "function ticketPrice() view returns (uint256)",
  "function currentRoundId() view returns (uint256)",
  "function lastTicketIdByPlayer(address) view returns (uint256)",
  "function ticketReceipts(uint256) view returns (address player, uint256 amount, uint256 roundId, uint256 purchasedAt)",
  "event TicketPurchased(uint256 indexed ticketId, address indexed player, uint256 indexed roundId, uint256 amount)",
];

const GAME_ABI = [
  "function claim(uint256 ticketId)",
  "function getTicketState(uint256 ticketId) view returns ((address player, uint256 amountPaid, uint256 roundId, uint8 status, uint256 requestId, uint256 randomWord, uint8 prizeTier, uint256 prizeAmount, bytes32 sourceTxHash))",
  "event TicketOpened(uint256 indexed ticketId, address indexed player, uint256 indexed roundId, uint256 amountPaid, uint256 requestId)",
  "event RandomnessRequested(uint256 indexed requestId, uint256 indexed ticketId)",
  "event RandomnessFulfilled(uint256 indexed requestId, uint256 indexed ticketId, uint256 randomWord, uint8 prizeTier, uint256 prizeAmount)",
  "event PrizeClaimed(uint256 indexed ticketId, address indexed player, uint256 prizeAmount)",
];

const TICKET_STATUS = {
  None: 0,
  PendingVRF: 1,
  Ready: 2,
  Claimed: 3,
};

const APP_STATUS = {
  DISCONNECTED: "disconnected",
  UNCONFIGURED: "unconfigured",
  IDLE: "idle",
  BUYING: "buying",
  BRIDGING: "bridging",
  RANDOMIZING: "randomizing",
  READY: "ready",
  REVEALED: "revealed",
  CLAIMING: "claiming",
  FINISHED: "finished",
  ERROR: "error",
};

const FLOW_STATUS_ORDER = {
  [APP_STATUS.IDLE]: 0,
  [APP_STATUS.BUYING]: 1,
  [APP_STATUS.BRIDGING]: 2,
  [APP_STATUS.RANDOMIZING]: 3,
  [APP_STATUS.READY]: 4,
  [APP_STATUS.REVEALED]: 5,
  [APP_STATUS.CLAIMING]: 6,
  [APP_STATUS.FINISHED]: 7,
};

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const ZERO_BYTES32 = "0x0000000000000000000000000000000000000000000000000000000000000000";
const WINNER_LOOKBACK_BLOCKS = 120000n;
const TRACE_LOOKBACK_BLOCKS = 120000n;
const MAX_RECENT_WINNER_LOGS = 24;
const WINNER_REFRESH_INTERVAL_MS = Math.max(SCRATCH_CONFIG.refreshIntervalMs * 3, 15000);
const TRACE_REFRESH_INTERVAL_MS = Math.max(SCRATCH_CONFIG.refreshIntervalMs + 3000, 8000);

const state = {
  sourceReadProvider: null,
  destinationReadProvider: null,
  provider: null,
  signer: null,
  account: null,
  chainId: null,
  sourceContract: null,
  gameContract: null,
  ticketPrice: null,
  currentRoundId: null,
  latestTicketId: null,
  sourceReceipt: null,
  gameTicket: null,
  recentWinners: [],
  appStatus: APP_STATUS.DISCONNECTED,
  statusDetail: "Connect your wallet to view the on-chain status of your latest ticket.",
  refreshTimer: null,
  scratchRatio: 0,
  isPointerDown: false,
  modalOpen: false,
  traceOpen: false,
  trace: emptyTrace(),
  hasConfiguration: Boolean(SCRATCH_CONFIG.contracts.source) && Boolean(SCRATCH_CONFIG.contracts.game),
  refreshInFlight: false,
  refreshQueued: false,
  flowTicketKey: null,
  flowStatus: null,
  pendingAction: null,
  sourceEventWatcher: null,
  ticketEventWatchers: [],
  recentWinnerLogs: [],
  recentWinnersLastBlock: null,
  recentWinnersFetchedAt: 0,
  traceCache: new Map(),
};

const scratch = {
  ctx: null,
  revealed: false,
};

const elements = {
  body: document.body,
  connectButton: document.getElementById("connectButton"),
  refreshButton: document.getElementById("refreshButton"),
  buyButton: document.getElementById("buyButton"),
  openScratchButton: document.getElementById("openScratchButton"),
  claimButton: document.getElementById("claimButton"),
  modalClaimButton: document.getElementById("modalClaimButton"),
  closeModalButton: document.getElementById("closeModalButton"),
  modalBackdrop: document.getElementById("modalBackdrop"),
  scratchModal: document.getElementById("scratchModal"),
  statusHeadline: document.getElementById("statusHeadline"),
  statusMessage: document.getElementById("statusMessage"),
  signalLabel: document.getElementById("signalLabel"),
  traceToggleButton: document.getElementById("traceToggleButton"),
  traceAnchor: document.getElementById("traceAnchor"),
  tracePanel: document.getElementById("tracePanel"),
  flowProgressFill: document.getElementById("flowProgressFill"),
  flowProgressLabel: document.getElementById("flowProgressLabel"),
  ticketBadge: document.getElementById("ticketBadge"),
  ticketPanelTitle: document.getElementById("ticketPanelTitle"),
  machineTicketTitle: document.getElementById("machineTicketTitle"),
  machineTicketBody: document.getElementById("machineTicketBody"),
  machineStatusPill: document.getElementById("machineStatusPill"),
  machinePrizePill: document.getElementById("machinePrizePill"),
  ticketIdValue: document.getElementById("ticketIdValue"),
  destinationStatusValue: document.getElementById("destinationStatusValue"),
  requestIdValue: document.getElementById("requestIdValue"),
  sourceTxValue: document.getElementById("sourceTxValue"),
  resultTier: document.getElementById("resultTier"),
  resultPayout: document.getElementById("resultPayout"),
  resultKicker: document.getElementById("resultKicker"),
  resultTitle: document.getElementById("resultTitle"),
  resultBody: document.getElementById("resultBody"),
  resultRandomWord: document.getElementById("resultRandomWord"),
  modalPrizeTier: document.getElementById("modalPrizeTier"),
  modalPrizePayout: document.getElementById("modalPrizePayout"),
  modalTicketTitle: document.getElementById("modalTicketTitle"),
  modalStatusPill: document.getElementById("modalStatusPill"),
  modalScratchLabel: document.getElementById("modalScratchLabel"),
  scratchMeterFill: document.getElementById("scratchMeterFill"),
  scratchMeterLabel: document.getElementById("scratchMeterLabel"),
  timeline: document.getElementById("timeline"),
  winnerCountBadge: document.getElementById("winnerCountBadge"),
  winnerList: document.getElementById("winnerList"),
  sourceAddressValue: document.getElementById("sourceAddressValue"),
  gameAddressValue: document.getElementById("gameAddressValue"),
  reactiveAddressValue: document.getElementById("reactiveAddressValue"),
  scratchCanvas: document.getElementById("scratchCanvas"),
};

const CHAIN_LOOKUP = new Map([
  [SCRATCH_CONFIG.sourceChain.id, SCRATCH_CONFIG.sourceChain],
  [SCRATCH_CONFIG.destinationChain.id, SCRATCH_CONFIG.destinationChain],
]);

boot();

function boot() {
  state.sourceReadProvider = new JsonRpcProvider(SCRATCH_CONFIG.sourceChain.rpcUrl);
  state.destinationReadProvider = new JsonRpcProvider(SCRATCH_CONFIG.destinationChain.rpcUrl);
  state.sourceContract = new Contract(
    SCRATCH_CONFIG.contracts.source,
    SOURCE_ABI,
    state.sourceReadProvider,
  );
  state.gameContract = new Contract(
    SCRATCH_CONFIG.contracts.game,
    GAME_ABI,
    state.destinationReadProvider,
  );

  elements.sourceAddressValue.textContent = formatAddress(SCRATCH_CONFIG.contracts.source || "-");
  elements.gameAddressValue.textContent = formatAddress(SCRATCH_CONFIG.contracts.game || "-");
  elements.reactiveAddressValue.textContent = formatAddress(SCRATCH_CONFIG.contracts.reactive || "-");

  setupScratchCanvas();
  bindEvents();
  render();
}

function bindEvents() {
  elements.connectButton.addEventListener("click", connectWallet);
  elements.refreshButton.addEventListener("click", refreshSession);
  elements.buyButton.addEventListener("click", buyTicket);
  elements.openScratchButton.addEventListener("click", openScratchModal);
  elements.claimButton.addEventListener("click", claimPrize);
  elements.modalClaimButton.addEventListener("click", claimPrize);
  elements.traceToggleButton.addEventListener("click", toggleTracePanel);
  elements.closeModalButton.addEventListener("click", closeScratchModal);
  elements.modalBackdrop.addEventListener("click", closeScratchModal);

  document.addEventListener("click", (event) => {
    if (!state.traceOpen || !elements.traceAnchor) return;
    if (elements.traceAnchor.contains(event.target)) return;
    closeTracePanel();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    closeScratchModal();
    closeTracePanel();
  });

  if (!window.ethereum) return;

  window.ethereum.on("accountsChanged", async (accounts) => {
    state.account = accounts[0] ?? null;
    if (!state.account) {
      resetSession(APP_STATUS.DISCONNECTED, "Wallet disconnected.");
      render();
      return;
    }
    await connectWallet();
  });

  window.ethereum.on("chainChanged", async (hexChainId) => {
    state.chainId = Number.parseInt(hexChainId, 16);
    await refreshSession();
  });
}

function syncEventWatchers() {
  syncSourcePurchaseWatcher();
  syncDestinationTicketWatchers();
}

function syncSourcePurchaseWatcher() {
  const accountKey = state.account?.toLowerCase() ?? null;

  if (state.sourceEventWatcher?.accountKey === accountKey) return;
  clearSourcePurchaseWatcher();

  if (!accountKey || !state.sourceContract) return;

  const filter = state.sourceContract.filters.TicketPurchased(null, state.account);
  const listener = async (ticketId, player) => {
    if (!state.account || player.toLowerCase() !== state.account.toLowerCase()) return;

    const nextTicketId = BigInt(ticketId);
    if (!state.latestTicketId || nextTicketId >= state.latestTicketId) {
      state.latestTicketId = nextTicketId;
      prepareTicketFlow(nextTicketId);
      state.pendingAction = null;
      applyTicketStatus(APP_STATUS.BRIDGING, "Source purchase confirmed; waiting for the destination chain to materialize the Scratch Card.", nextTicketId);
      render();
    }

    await refreshSession();
  };

  state.sourceContract.on(filter, listener);
  state.sourceEventWatcher = { accountKey, filter, listener };
}

function clearSourcePurchaseWatcher() {
  if (!state.sourceEventWatcher || !state.sourceContract) return;
  state.sourceContract.off(state.sourceEventWatcher.filter, state.sourceEventWatcher.listener);
  state.sourceEventWatcher = null;
}

function syncDestinationTicketWatchers() {
  const ticketKey = toTicketKey(state.latestTicketId);

  if (state.ticketEventWatchers.length && state.ticketEventWatchers[0]?.ticketKey === ticketKey) {
    return;
  }

  clearDestinationTicketWatchers();

  if (!ticketKey || !state.gameContract) return;

  const watch = (filter, handler) => {
    const listener = async (...args) => {
      await handler(...args);
    };
    state.gameContract.on(filter, listener);
    state.ticketEventWatchers.push({ ticketKey, filter, listener });
  };

  watch(state.gameContract.filters.TicketOpened(state.latestTicketId), async () => {
    state.pendingAction = null;
    applyTicketStatus(APP_STATUS.RANDOMIZING, "Destination-chain Scratch Card created; requesting Chainlink VRF.", state.latestTicketId);
    render();
    await refreshSession();
  });

  watch(state.gameContract.filters.RandomnessRequested(null, state.latestTicketId), async () => {
    applyTicketStatus(APP_STATUS.RANDOMIZING, "Randomness request sent; waiting for Chainlink VRF fulfillment.", state.latestTicketId);
    render();
    await refreshSession();
  });

  watch(state.gameContract.filters.RandomnessFulfilled(null, state.latestTicketId), async () => {
    applyTicketStatus(APP_STATUS.READY, "Randomness fulfilled; open the Scratch Card to start scratching.", state.latestTicketId);
    render();
    await refreshSession();
  });

  watch(state.gameContract.filters.PrizeClaimed(state.latestTicketId), async () => {
    state.pendingAction = null;
    scratch.revealed = true;
    state.scratchRatio = 1;
    if (state.latestTicketId) persistScratchReveal(String(state.latestTicketId), true);
    applyTicketStatus(APP_STATUS.FINISHED, "Prize claimed; this round is settled.", state.latestTicketId);
    render();
    await refreshSession();
  });
}

function clearDestinationTicketWatchers() {
  if (!state.gameContract || !state.ticketEventWatchers.length) return;

  for (const watcher of state.ticketEventWatchers) {
    state.gameContract.off(watcher.filter, watcher.listener);
  }

  state.ticketEventWatchers = [];
}

async function connectWallet() {
  if (!window.ethereum) {
    setAppStatus(APP_STATUS.ERROR, "No wallet extension detected. Please use MetaMask or another EVM wallet.");
    render();
    return;
  }

  if (!state.hasConfiguration) {
    setAppStatus(APP_STATUS.UNCONFIGURED, "Please fill in the deployed contract addresses in frontend/config.js first.");
    render();
    return;
  }

  try {
    state.provider = new BrowserProvider(window.ethereum);
    await state.provider.send("eth_requestAccounts", []);
    state.signer = await state.provider.getSigner();
    state.account = await state.signer.getAddress();
    const network = await state.provider.getNetwork();
    state.chainId = Number(network.chainId);

    startPolling();
    await refreshSession();
  }
  catch (error) {
    setAppStatus(APP_STATUS.ERROR, getErrorMessage(error, "Wallet connection failed."));
    render();
  }
}

async function refreshSession() {
  state.refreshQueued = true;
  if (state.refreshInFlight) return;

  state.refreshInFlight = true;
  try {
    while (state.refreshQueued) {
      state.refreshQueued = false;
      await runRefreshSession();
    }
  }
  finally {
    state.refreshInFlight = false;
  }
}

async function runRefreshSession() {
  if (!state.sourceContract || !state.gameContract) {
    render();
    return;
  }

  try {
    const [ticketPrice, currentRoundId] = await Promise.all([
      state.sourceContract.ticketPrice(),
      state.sourceContract.currentRoundId(),
    ]);

    state.ticketPrice = ticketPrice;
    state.currentRoundId = currentRoundId;

    if (!state.account) {
      clearTicketFlow();
      setAppStatus(APP_STATUS.DISCONNECTED, "Connect your wallet to view the on-chain status of your latest ticket.");
      state.latestTicketId = null;
      state.sourceReceipt = null;
      state.gameTicket = null;
      state.trace = emptyTrace();
      syncEventWatchers();
      state.recentWinners = await fetchRecentWinners();
      render();
      return;
    }

    const previousTicketKey = toTicketKey(state.latestTicketId);
    const latestTicketId = await state.sourceContract.lastTicketIdByPlayer(state.account);
    const nextTicketKey = toTicketKey(latestTicketId);

    if (isWaitingForNewTicketId(latestTicketId)) {
      state.latestTicketId = null;
      state.sourceReceipt = null;
      state.gameTicket = null;
      state.trace = emptyTrace();
      clearDestinationTicketWatchers();
      syncSourcePurchaseWatcher();
      state.recentWinners = await fetchRecentWinners();
      setAppStatus(APP_STATUS.BUYING, "Purchase transaction submitted; waiting for on-chain confirmation.");
      render();
      return;
    }

    state.latestTicketId = latestTicketId;

    if (state.pendingAction?.type === APP_STATUS.BUYING) {
      state.pendingAction = null;
    }

    if (previousTicketKey !== nextTicketKey) {
      prepareTicketFlow(latestTicketId);
    }

    syncEventWatchers();

    if (latestTicketId === 0n) {
      state.sourceReceipt = null;
      state.gameTicket = null;
      state.trace = emptyTrace();
      clearTicketFlow();
      state.recentWinners = await fetchRecentWinners();
      setAppStatus(APP_STATUS.IDLE, "This wallet has no ticket history yet. Buy one to start the run.");
      render();
      return;
    }

    const previousSourceReceipt = previousTicketKey === nextTicketKey ? state.sourceReceipt : null;
    const previousGameTicket = previousTicketKey === nextTicketKey ? state.gameTicket : null;
    const previousTrace = previousTicketKey === nextTicketKey ? state.trace : emptyTrace();

    const [sourceReceiptResult, gameTicketResult, recentWinnersResult, traceResult] = await Promise.allSettled([
      state.sourceContract.ticketReceipts(latestTicketId),
      state.gameContract.getTicketState(latestTicketId),
      fetchRecentWinners(),
      fetchTicketTrace(latestTicketId),
    ]);

    state.sourceReceipt = sourceReceiptResult.status === "fulfilled"
      ? normalizeSourceReceipt(sourceReceiptResult.value)
      : previousSourceReceipt;
    state.gameTicket = gameTicketResult.status === "fulfilled"
      ? normalizeGameTicket(gameTicketResult.value)
      : previousGameTicket;
    state.recentWinners = recentWinnersResult.status === "fulfilled"
      ? recentWinnersResult.value
      : state.recentWinners;
    state.trace = traceResult.status === "fulfilled"
      ? traceResult.value
      : previousTrace;

    syncScratchRevealState();
    const derivedStatus = deriveAppStatus();
    applyTicketStatus(derivedStatus.status, derivedStatus.detail, latestTicketId);
    render();
  }
  catch (error) {
    if (isTransientRpcReadError(error)) {
      const fallbackStatus = state.appStatus === APP_STATUS.DISCONNECTED
        ? (state.latestTicketId && state.latestTicketId !== 0n ? APP_STATUS.BRIDGING : APP_STATUS.IDLE)
        : state.appStatus;
      setAppStatus(fallbackStatus, "Temporary RPC issue while refreshing. Retrying automatically.");
      render();
      return;
    }

    setAppStatus(APP_STATUS.ERROR, getErrorMessage(error, "Failed to refresh contract state."));
    render();
  }
}


async function fetchRecentWinners() {
  if (!state.gameContract || !state.destinationReadProvider) return [];

  try {
    const now = Date.now();
    if (state.recentWinnersFetchedAt && now - state.recentWinnersFetchedAt < WINNER_REFRESH_INTERVAL_MS) {
      return state.recentWinners;
    }

    const latestBlock = await state.destinationReadProvider.getBlockNumber();
    const fromBlock = state.recentWinnersLastBlock == null
      ? latestBlock > Number(WINNER_LOOKBACK_BLOCKS)
        ? latestBlock - Number(WINNER_LOOKBACK_BLOCKS)
        : 0
      : state.recentWinnersLastBlock + 1;

    const logs = fromBlock <= latestBlock
      ? await state.gameContract.queryFilter("RandomnessFulfilled", fromBlock, latestBlock)
      : [];

    state.recentWinnersLastBlock = latestBlock;
    mergeRecentWinnerLogs(logs);

    const latestLogs = state.recentWinnerLogs.slice(-8).reverse();
    const winners = await Promise.all(latestLogs.map(async (log, index) => {
      const ticketId = log.args.ticketId;
      const ticket = normalizeGameTicket(await state.gameContract.getTicketState(ticketId));
      return {
        rank: index + 1,
        ticketId,
        player: ticket.player,
        prizeTier: ticket.prizeTier,
        prizeAmount: ticket.prizeAmount,
        claimed: ticket.status === TICKET_STATUS.Claimed,
      };
    }));

    state.recentWinnersFetchedAt = now;
    state.recentWinners = winners;
    return winners;
  }
  catch {
    return state.recentWinners;
  }
}

function deriveAppStatus() {
  if (!state.latestTicketId || state.latestTicketId === 0n) {
    return {
      status: APP_STATUS.IDLE,
      detail: "This wallet has no ticket history yet. Buy one to start the run.",
    };
  }

  if (!state.gameTicket || state.gameTicket.player === ZERO_ADDRESS) {
    return {
      status: APP_STATUS.BRIDGING,
      detail: "Ticket bought on the source chain; destination-chain Scratch Card is being created.",
    };
  }

  if (state.gameTicket.status === TICKET_STATUS.PendingVRF) {
    return {
      status: APP_STATUS.RANDOMIZING,
      detail: "Scratch Card created; waiting for Chainlink VRF to return the random result.",
    };
  }

  if (state.gameTicket.status === TICKET_STATUS.Ready) {
    return {
      status: scratch.revealed
        ? state.gameTicket.prizeAmount > 0n ? APP_STATUS.REVEALED : APP_STATUS.FINISHED
        : APP_STATUS.READY,
      detail: scratch.revealed
        ? state.gameTicket.prizeAmount > 0n
          ? "Result revealed. If you won, claim the prize now."
          : "Result revealed. No prize this round. Buy another ticket to start the next run."
        : "Scratch Card is ready. Open it and scratch with your mouse.",
    };
  }

  if (state.gameTicket.status === TICKET_STATUS.Claimed) {
    scratch.revealed = true;
    return {
      status: APP_STATUS.FINISHED,
      detail: "This round is settled. You can buy the next Ticket.",
    };
  }

  return {
    status: APP_STATUS.ERROR,
    detail: "Ticket state is abnormal. Refresh and try again.",
  };
}

function applyTicketStatus(status, detail, ticketId = state.latestTicketId) {
  const ticketKey = toTicketKey(ticketId);

  if (!(status in FLOW_STATUS_ORDER)) {
    if (!ticketKey) clearTicketFlow();
    setAppStatus(status, detail);
    return true;
  }

  if (!ticketKey) {
    setAppStatus(status, detail);
    return true;
  }

  if (state.flowTicketKey !== ticketKey) {
    state.flowTicketKey = ticketKey;
    state.flowStatus = status;
    setAppStatus(status, detail);
    return true;
  }

  const currentRank = FLOW_STATUS_ORDER[state.flowStatus] ?? -1;
  const floorRank = pendingStatusFloor(ticketKey);
  const nextRank = FLOW_STATUS_ORDER[status];

  if (nextRank < Math.max(currentRank, floorRank)) {
    return false;
  }

  state.flowStatus = status;
  setAppStatus(status, detail);
  return true;
}

function pendingStatusFloor(ticketKey) {
  if (!state.pendingAction) return -1;
  if (state.pendingAction.type === APP_STATUS.BUYING) {
    return FLOW_STATUS_ORDER[APP_STATUS.BUYING];
  }
  if (state.pendingAction.type === APP_STATUS.CLAIMING && state.pendingAction.ticketKey === ticketKey) {
    return FLOW_STATUS_ORDER[APP_STATUS.CLAIMING];
  }
  return -1;
}

function prepareTicketFlow(ticketId) {
  state.flowTicketKey = toTicketKey(ticketId);
  state.flowStatus = null;
  state.pendingAction = state.pendingAction?.type === APP_STATUS.CLAIMING ? state.pendingAction : null;
  state.sourceReceipt = null;
  state.gameTicket = null;
  state.trace = emptyTrace();
  scratch.revealed = false;
  state.scratchRatio = 0;
}

function clearTicketFlow() {
  state.flowTicketKey = null;
  state.flowStatus = null;
  state.pendingAction = null;
}

function resetDisplayForNextPurchase() {
  state.latestTicketId = null;
  state.sourceReceipt = null;
  state.gameTicket = null;
  state.trace = emptyTrace();
  state.flowTicketKey = null;
  state.flowStatus = null;
  scratch.revealed = false;
  state.scratchRatio = 0;
  clearDestinationTicketWatchers();
  closeScratchModal();
}

function toTicketKey(ticketId) {
  if (!ticketId || ticketId === 0n) return null;
  return ticketId.toString();
}

function isWaitingForNewTicketId(observedLatestTicketId = state.latestTicketId) {
  if (state.pendingAction?.type !== APP_STATUS.BUYING) return false;

  const previousTicketKey = state.pendingAction.previousTicketKey ?? null;
  const nextTicketKey = toTicketKey(observedLatestTicketId);

  if (!previousTicketKey) {
    return nextTicketKey === null;
  }

  return nextTicketKey === previousTicketKey;
}

async function buyTicket() {
  if (!state.signer || !state.ticketPrice) return;

  try {
    await ensureChain(SCRATCH_CONFIG.sourceChain);
    const writer = state.sourceContract.connect(state.signer);
    state.pendingAction = {
      type: APP_STATUS.BUYING,
      previousTicketKey: toTicketKey(state.latestTicketId),
    };
    applyTicketStatus(APP_STATUS.BUYING, "Submitting ticket purchase transaction.");
    render();

    const tx = await writer.buyTicket({ value: state.ticketPrice });
    resetDisplayForNextPurchase();
    applyTicketStatus(APP_STATUS.BUYING, "Purchase transaction submitted; waiting for on-chain confirmation.");
    render();

    await tx.wait();
    state.pendingAction = null;
    scratch.revealed = false;
    state.scratchRatio = 0;
    closeScratchModal();
    await refreshSession();
  }
  catch (error) {
    state.pendingAction = null;
    setAppStatus(APP_STATUS.ERROR, getErrorMessage(error, "Ticket purchase failed."));
    render();
  }
}

async function claimPrize() {
  if (!state.signer || !state.gameTicket || !state.latestTicketId || !canClaim()) return;

  try {
    await ensureChain(SCRATCH_CONFIG.destinationChain);
    const writer = state.gameContract.connect(state.signer);
    state.pendingAction = {
      type: APP_STATUS.CLAIMING,
      ticketKey: toTicketKey(state.latestTicketId),
    };
    applyTicketStatus(APP_STATUS.CLAIMING, "Prize claim transaction submitted; waiting for on-chain confirmation.", state.latestTicketId);
    render();

    const tx = await writer.claim(state.latestTicketId);
    await tx.wait();
    state.pendingAction = null;
    persistScratchReveal(String(state.latestTicketId), true);
    await refreshSession();
  }
  catch (error) {
    state.pendingAction = null;
    setAppStatus(APP_STATUS.ERROR, getErrorMessage(error, "Prize claim failed."));
    render();
  }
}

async function ensureChain(targetChain) {
  if (!window.ethereum) throw new Error("No wallet provider detected.");
  if (state.chainId === targetChain.id) return;

  const chainHex = `0x${targetChain.id.toString(16)}`;

  try {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: chainHex }],
    });
  }
  catch (switchError) {
    if (switchError.code === 4902 && targetChain.rpcUrl) {
      await window.ethereum.request({
        method: "wallet_addEthereumChain",
        params: [{
          chainId: chainHex,
          chainName: targetChain.name,
          nativeCurrency: {
            name: targetChain.currencySymbol,
            symbol: targetChain.currencySymbol,
            decimals: 18,
          },
          rpcUrls: [targetChain.rpcUrl],
          blockExplorerUrls: targetChain.blockExplorerUrl ? [targetChain.blockExplorerUrl] : [],
        }],
      });
      return;
    }
    throw switchError;
  }

  const network = await state.provider.getNetwork();
  state.chainId = Number(network.chainId);
}

function setupScratchCanvas() {
  scratch.ctx = elements.scratchCanvas.getContext("2d");
  resizeCanvas();
  window.addEventListener("resize", resizeCanvas);

  const start = (event) => {
    if (!canScratch()) return;
    state.isPointerDown = true;
    scratchAtEvent(event);
  };

  const move = (event) => {
    if (!state.isPointerDown || !canScratch()) return;
    scratchAtEvent(event);
  };

  const stop = () => {
    state.isPointerDown = false;
  };

  elements.scratchCanvas.addEventListener("pointerdown", start);
  elements.scratchCanvas.addEventListener("pointermove", move);
  elements.scratchCanvas.addEventListener("pointerup", stop);
  elements.scratchCanvas.addEventListener("pointerleave", stop);
  elements.scratchCanvas.addEventListener("pointercancel", stop);
}

function resizeCanvas() {
  const rect = elements.scratchCanvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  const width = Math.max(320, Math.floor(rect.width * ratio));
  const height = Math.max(320, Math.floor(rect.height * ratio));
  elements.scratchCanvas.width = width;
  elements.scratchCanvas.height = height;
  drawScratchLayer();
}

function drawScratchLayer() {
  if (!scratch.ctx) return;
  const { width, height } = elements.scratchCanvas;

  scratch.ctx.globalCompositeOperation = "source-over";
  scratch.ctx.clearRect(0, 0, width, height);

  const foil = scratch.ctx.createLinearGradient(0, 0, width, height);
  foil.addColorStop(0, "#ffd76a");
  foil.addColorStop(0.35, "#ff7f50");
  foil.addColorStop(0.7, "#ff2e63");
  foil.addColorStop(1, "#29c9ff");
  scratch.ctx.fillStyle = foil;
  scratch.ctx.fillRect(0, 0, width, height);

  scratch.ctx.fillStyle = "rgba(255, 244, 214, 0.88)";
  scratch.ctx.fillRect(width * 0.08, height * 0.12, width * 0.84, height * 0.76);

  scratch.ctx.strokeStyle = "rgba(21, 14, 2, 0.18)";
  scratch.ctx.lineWidth = 2;
  scratch.ctx.setLineDash([12, 12]);
  scratch.ctx.strokeRect(width * 0.11, height * 0.15, width * 0.78, height * 0.7);
  scratch.ctx.setLineDash([]);

  scratch.ctx.fillStyle = "#201404";
  scratch.ctx.textAlign = "center";
  scratch.ctx.font = `${Math.floor(height * 0.12)}px "Luckiest Guy"`;
  scratch.ctx.fillText("SCRATCH", width / 2, height * 0.46);
  scratch.ctx.font = `${Math.floor(height * 0.05)}px "Baloo 2"`;
  scratch.ctx.fillText("DRAG TO REVEAL", width / 2, height * 0.58);
}

function scratchAtEvent(event) {
  if (!scratch.ctx) return;

  const rect = elements.scratchCanvas.getBoundingClientRect();
  const scaleX = elements.scratchCanvas.width / rect.width;
  const scaleY = elements.scratchCanvas.height / rect.height;
  const x = (event.clientX - rect.left) * scaleX;
  const y = (event.clientY - rect.top) * scaleY;
  const radius = Math.max(26, elements.scratchCanvas.width * 0.045);

  scratch.ctx.globalCompositeOperation = "destination-out";
  scratch.ctx.beginPath();
  scratch.ctx.arc(x, y, radius, 0, Math.PI * 2);
  scratch.ctx.fill();

  updateScratchRatio();
}

function updateScratchRatio() {
  if (!scratch.ctx) return;

  const imageData = scratch.ctx.getImageData(0, 0, elements.scratchCanvas.width, elements.scratchCanvas.height).data;
  let cleared = 0;

  for (let i = 3; i < imageData.length; i += 4) {
    if (imageData[i] === 0) cleared += 1;
  }

  state.scratchRatio = cleared / (elements.scratchCanvas.width * elements.scratchCanvas.height);
  if (state.scratchRatio >= SCRATCH_CONFIG.ui.scratchThreshold && !scratch.revealed) {
    scratch.revealed = true;
    if (state.latestTicketId) persistScratchReveal(String(state.latestTicketId), true);
    if (state.gameTicket?.status === TICKET_STATUS.Ready) {
      applyTicketStatus(APP_STATUS.REVEALED, "Result revealed. If you won, claim the prize now.", state.latestTicketId);
    }
  }

  render();
}

function openScratchModal() {
  if (!state.latestTicketId || state.latestTicketId === 0n) return;
  state.modalOpen = true;
  elements.scratchModal.classList.remove("hidden");
  elements.scratchModal.setAttribute("aria-hidden", "false");
  render();
}

function toggleTracePanel() {
  state.traceOpen = !state.traceOpen;
  renderReactiveTrace();
}

function closeTracePanel() {
  if (!state.traceOpen) return;
  state.traceOpen = false;
  renderReactiveTrace();
}


function closeScratchModal() {
  state.modalOpen = false;
  elements.scratchModal.classList.add("hidden");
  elements.scratchModal.setAttribute("aria-hidden", "true");
}

function syncScratchRevealState() {
  if (!state.latestTicketId) return;

  const saved = readScratchReveal(String(state.latestTicketId));
  scratch.revealed = saved || state.gameTicket?.status === TICKET_STATUS.Claimed;

  if (scratch.revealed) {
    state.scratchRatio = 1;
  }
  else {
    state.scratchRatio = 0;
    drawScratchLayer();
  }
}

function canScratch() {
  return state.modalOpen && [APP_STATUS.READY, APP_STATUS.REVEALED, APP_STATUS.FINISHED].includes(state.appStatus);
}

function hasClaimablePrize() {
  return Boolean(
    state.gameTicket &&
    state.gameTicket.status === TICKET_STATUS.Ready &&
    state.gameTicket.prizeAmount > 0n
  );
}

function isMissedTicketSettled() {
  return Boolean(
    state.gameTicket &&
    state.gameTicket.status === TICKET_STATUS.Ready &&
    state.gameTicket.prizeAmount === 0n &&
    scratch.revealed
  );
}

function canClaim() {
  return Boolean(hasClaimablePrize() && scratch.revealed);
}

function canOpenScratch() {
  return Boolean(
    state.latestTicketId &&
    state.latestTicketId !== 0n &&
    state.gameTicket &&
    state.gameTicket.player !== ZERO_ADDRESS
  );
}

function render() {
  elements.body.className = [
    `status-${state.appStatus}`,
    `tier-${Number(state.gameTicket?.prizeTier ?? 0)}`,
    scratch.revealed ? "is-revealed" : "is-concealed",
    canOpenScratch() ? "has-ticket" : "no-ticket",
  ].join(" ");
  const flowPercent = getFlowPercent();
  const activeTier = tierMeta();

  elements.statusHeadline.textContent = headlineForStatus();
  elements.statusMessage.textContent = state.statusDetail;
  elements.signalLabel.textContent = signalCopy();
  elements.flowProgressFill.style.width = `${flowPercent}%`;
  elements.flowProgressLabel.textContent = `${flowPercent}%`;

  elements.ticketBadge.textContent = state.latestTicketId && state.latestTicketId !== 0n
    ? `TICKET #${state.latestTicketId.toString()}`
    : "NO TICKET";
  elements.ticketPanelTitle.textContent = state.latestTicketId && state.latestTicketId !== 0n
    ? `TICKET #${state.latestTicketId.toString()} | ${destinationStatusLabel()}`
    : "NO TICKET YET";
  elements.machineTicketTitle.textContent = state.latestTicketId && state.latestTicketId !== 0n
    ? `TICKET #${state.latestTicketId.toString()}`
    : "NO ACTIVE TICKET";
  elements.machineTicketBody.textContent = machineCopy();
  elements.machineStatusPill.textContent = destinationStatusLabel();
  elements.machineStatusPill.className = `pill ${pillClassForStatus()}`;
  elements.machinePrizePill.textContent = state.gameTicket && state.gameTicket.player !== ZERO_ADDRESS
    ? `${activeTier.label} | ${formatEther(state.gameTicket.prizeAmount)} ETH`
    : "PENDING";
  elements.machinePrizePill.className = `pill tier-pill-${activeTier.tier} ${state.gameTicket?.prizeAmount > 0n ? "pill-gold" : "pill-muted"}`;

  elements.ticketIdValue.textContent = state.latestTicketId && state.latestTicketId !== 0n ? state.latestTicketId.toString() : "-";
  elements.destinationStatusValue.textContent = destinationStatusLabel();
  elements.requestIdValue.textContent = state.gameTicket ? state.gameTicket.requestId.toString() : "-";
  elements.sourceTxValue.textContent = state.gameTicket?.sourceTxHash && state.gameTicket.sourceTxHash !== ZERO_BYTES32
    ? truncateHash(state.gameTicket.sourceTxHash)
    : "-";
  elements.resultTier.textContent = state.gameTicket && state.gameTicket.player !== ZERO_ADDRESS ? `${activeTier.label} (${activeTier.multiplier})` : "-";
  elements.resultPayout.textContent = state.gameTicket && state.gameTicket.player !== ZERO_ADDRESS
    ? `${formatEther(state.gameTicket.prizeAmount)} ETH`
    : "-";
  elements.resultKicker.textContent = resultKicker();
  elements.resultTitle.textContent = resultTitle();
  elements.resultBody.textContent = resultBody();
  elements.resultRandomWord.textContent = state.gameTicket && state.gameTicket.player !== ZERO_ADDRESS
    ? state.gameTicket.randomWord.toString()
    : "-";
  elements.modalPrizeTier.textContent = state.gameTicket && state.gameTicket.player !== ZERO_ADDRESS
    ? `${activeTier.label} (${activeTier.multiplier})`
    : "-";
  elements.modalPrizePayout.textContent = state.gameTicket && state.gameTicket.player !== ZERO_ADDRESS
    ? `${formatEther(state.gameTicket.prizeAmount)} ETH`
    : "-";
  elements.modalTicketTitle.textContent = state.latestTicketId && state.latestTicketId !== 0n
    ? `TICKET #${state.latestTicketId.toString()}`
    : "TICKET LOCKED";
  elements.modalStatusPill.textContent = destinationStatusLabel();
  elements.modalStatusPill.className = `pill ${pillClassForStatus()}`;
  elements.modalScratchLabel.textContent = scratch.revealed
    ? hasClaimablePrize()
      ? "Scratch Card opened. CLAIM is unlocked."
      : "Scratch Card opened. No prize on this ticket."
    : `Scratch ${Math.round(SCRATCH_CONFIG.ui.scratchThreshold * 100)}% to unlock CLAIM`;

  const scratchPercent = Math.min(100, Math.round(state.scratchRatio * 100));
  elements.scratchMeterFill.style.width = `${scratchPercent}%`;
  elements.scratchMeterLabel.textContent = `${scratchPercent}%`;

  elements.connectButton.textContent = state.account ? formatAddress(state.account) : "CONNECT";
  elements.buyButton.disabled = !canBuy();
  elements.openScratchButton.disabled = !canOpenScratch();
  elements.claimButton.hidden = !hasClaimablePrize();
  elements.modalClaimButton.hidden = !hasClaimablePrize();
  elements.claimButton.disabled = !canClaim();
  elements.modalClaimButton.disabled = !canClaim();

  if (scratch.revealed && scratch.ctx) {
    scratch.ctx.clearRect(0, 0, elements.scratchCanvas.width, elements.scratchCanvas.height);
  }

  renderReactiveTrace();
  renderTimeline();
  renderWinnerBoard();
}

function renderReactiveTrace() {
  const isOpen = state.traceOpen;
  elements.traceToggleButton.setAttribute("aria-expanded", isOpen ? "true" : "false");
  elements.traceToggleButton.classList.toggle("is-open", isOpen);
  elements.tracePanel.classList.toggle("hidden", !isOpen);
  elements.tracePanel.setAttribute("aria-hidden", isOpen ? "false" : "true");

  if (!isOpen) return;

  const hasTicket = Boolean(state.latestTicketId && state.latestTicketId !== 0n);
  const hasMaterialized = Boolean(state.gameTicket?.player && state.gameTicket.player !== ZERO_ADDRESS);
  const hasOpened = Boolean(state.trace.openedTxHash);
  const sourceTxHash = state.gameTicket?.sourceTxHash && state.gameTicket.sourceTxHash !== ZERO_BYTES32
    ? state.gameTicket.sourceTxHash
    : null;

  const sourceContractLink = explorerAddressUrl(SCRATCH_CONFIG.sourceChain.blockExplorerUrl, SCRATCH_CONFIG.contracts.source);
  const sourceTxLink = sourceTxHash ? explorerTxUrl(SCRATCH_CONFIG.sourceChain.blockExplorerUrl, sourceTxHash) : null;
  const reactiveSenderAddress = SCRATCH_CONFIG.reactiveChain?.senderAddress ?? SCRATCH_CONFIG.contracts.reactiveSender ?? null;
  const reactiveSenderLink = reactiveRvmUrl(SCRATCH_CONFIG.reactiveChain?.blockExplorerUrl, reactiveSenderAddress);
  const reactiveContractLink = reactiveContractUrl(
    SCRATCH_CONFIG.reactiveChain?.blockExplorerUrl,
    reactiveSenderAddress,
    SCRATCH_CONFIG.contracts.reactive,
  );
  const gameContractLink = explorerAddressUrl(SCRATCH_CONFIG.destinationChain.blockExplorerUrl, SCRATCH_CONFIG.contracts.game);
  const openedTxLink = state.trace.openedTxHash ? explorerTxUrl(SCRATCH_CONFIG.destinationChain.blockExplorerUrl, state.trace.openedTxHash) : null;
  const vrfTxLink = state.trace.randomnessTxHash ? explorerTxUrl(SCRATCH_CONFIG.destinationChain.blockExplorerUrl, state.trace.randomnessTxHash) : null;
  const claimTxLink = state.trace.claimedTxHash ? explorerTxUrl(SCRATCH_CONFIG.destinationChain.blockExplorerUrl, state.trace.claimedTxHash) : null;

  const steps = [
    {
      tone: "source",
      className: hasTicket ? "is-complete" : "",
      badgeClass: hasTicket ? "is-complete" : "",
      badge: hasTicket ? "Seen" : "Waiting",
      kicker: "Purchase Event",
      title: "Source Chain",
      subtitle: "buyTicket()",
      links: [
        linkMarkup(sourceContractLink, "Contract"),
        linkMarkup(sourceTxLink, "Buy TX"),
      ],
    },
    {
      tone: "reactive",
      className: hasMaterialized ? "is-complete" : hasTicket ? "is-active" : "",
      badgeClass: hasMaterialized ? "is-complete" : hasTicket ? "is-active" : "",
      badge: hasMaterialized ? "Relayed" : hasTicket ? "Routing" : "Standby",
      kicker: "Callback Relay",
      title: "Reactive",
      subtitle: "react()",
      links: [
        linkMarkup(reactiveSenderLink, "RVM"),
        linkMarkup(reactiveContractLink, "Contract"),
      ],
      hint: !reactiveSenderLink
        ? "Set reactive senderAddress to jump to the relay sender identity on Reactscan."
        : "RVM opens the deployer-matched ReactVM page. Contract opens the contract view inside that RVM on the configured Reactive explorer.",
    },
    {
      tone: "destination",
      className: hasOpened ? "is-complete" : hasMaterialized ? "is-active" : "",
      badgeClass: hasOpened ? "is-complete" : hasMaterialized ? "is-active" : "",
      badge: hasOpened ? "Opened" : hasMaterialized ? "Minting" : "Standby",
      kicker: "Materialize + Settle",
      title: "Destination",
      subtitle: "openTicket() / VRF / claim()",
      links: [
        linkMarkup(gameContractLink, "Contract"),
        linkMarkup(openedTxLink, "Open TX"),
        linkMarkup(vrfTxLink, "VRF TX"),
        linkMarkup(claimTxLink, "Claim TX"),
      ],
    },
  ];

  elements.tracePanel.innerHTML = `
    <div class="trace-panel-head">
      <span class="trace-kicker">Source -> Reactive -> Destination</span>
      <strong>${hasTicket ? `TICKET #${state.latestTicketId.toString()}` : "NO ACTIVE TICKET"}</strong>
    </div>
    <div class="trace-lane">
      ${steps.map((step, index) => `
        <section class="trace-step trace-step-${step.tone} ${step.className}">
          <div class="trace-step-top">
            <div class="trace-step-head">
              <span class="trace-node">${traceNodeIcon(index)}</span>
              <div class="trace-step-copy">
                <span class="trace-step-kicker">${step.kicker}</span>
                <strong>${step.title}</strong>
                <span class="trace-step-subtitle">${step.subtitle}</span>
              </div>
            </div>
            <span class="trace-badge ${step.badgeClass}">${step.badge}</span>
          </div>
          <div class="trace-links">${step.links.filter(Boolean).join("")}</div>
          ${step.hint ? `<div class="trace-contract-hint">${step.hint}</div>` : ""}
        </section>
      `).join('<div class="trace-arrow" aria-hidden="true"><svg viewBox="0 0 24 24" role="presentation"><path d="M4 12h14"/><path d="M13 7l5 5-5 5"/></svg></div>')}
    </div>
  `;
}

function renderTimeline() {
  const missedTicketSettled = isMissedTicketSettled();

  const items = [
    {
      title: "Ticket Bought",
      body: state.latestTicketId ? "Source-chain payment confirmed; Ticket ID created." : "No source-chain purchase record yet.",
      complete: Boolean(state.latestTicketId && state.latestTicketId !== 0n),
      active: state.appStatus === APP_STATUS.BUYING,
    },
    {
      title: "Scratch Card Materialized",
      body: state.gameTicket?.player && state.gameTicket.player !== ZERO_ADDRESS
        ? "Destination-chain Scratch Card has been written into the game contract."
        : "Waiting for the destination chain to generate the Scratch Card.",
      complete: Boolean(state.gameTicket?.player && state.gameTicket.player !== ZERO_ADDRESS),
      active: state.appStatus === APP_STATUS.BRIDGING,
    },
    {
      title: "VRF Settled",
      body: state.gameTicket?.status >= TICKET_STATUS.Ready
        ? "Random result is on-chain and the prize is now locked in."
        : "Waiting for Chainlink VRF to return randomness.",
      complete: Boolean(state.gameTicket?.status >= TICKET_STATUS.Ready),
      active: state.appStatus === APP_STATUS.RANDOMIZING,
    },
    {
      title: "Scratch Opened",
      body: scratch.revealed ? "The scratch layer is open. You can now view the final result." : "Open the Scratch Card and drag your mouse to scratch the surface.",
      complete: scratch.revealed,
      active: [APP_STATUS.READY, APP_STATUS.REVEALED].includes(state.appStatus),
    },
    {
      title: missedTicketSettled ? "Round Settled" : "Prize Claimed",
      body: state.gameTicket?.status === TICKET_STATUS.Claimed
        ? "This round is fully settled."
        : missedTicketSettled
          ? "No prize this round. Buy another ticket to start the next run."
          : "Claim the prize after revealing the result.",
      complete: state.gameTicket?.status === TICKET_STATUS.Claimed || missedTicketSettled,
      active: state.appStatus === APP_STATUS.CLAIMING,
    },
  ];

  elements.timeline.innerHTML = items.map((item) => `
    <li class="${item.complete ? "is-complete" : ""} ${item.active ? "is-active" : ""}">
      <span class="timeline-marker"></span>
      <div>
        <span class="timeline-title">${item.title}</span>
        <p class="timeline-copy">${item.body}</p>
      </div>
    </li>
  `).join("");
}

function renderWinnerBoard() {
  if (!state.recentWinners.length) {
    elements.winnerCountBadge.textContent = "0 RECORDS";
    elements.winnerList.innerHTML = '<div class="winner-entry winner-empty"><div class="winner-rank">--</div><div class="winner-meta"><span>BOARD EMPTY</span><strong>No scratched/revealed Scratch Card records yet.</strong></div><div class="winner-payout"><span>Payout</span><strong>-</strong></div></div>';
    return;
  }

  elements.winnerCountBadge.textContent = `${state.recentWinners.length} RECORDS`;
  elements.winnerList.innerHTML = state.recentWinners.map((winner) => {
    const tier = SCRATCH_CONFIG.prizeTiers.find((entry) => entry.tier === Number(winner.prizeTier)) ?? SCRATCH_CONFIG.prizeTiers[0];
    return `
      <article class="winner-entry winner-tier-${tier.tier} ${winner.rank === 1 ? "winner-top" : ""}">
        <div class="winner-rank">#${winner.rank}</div>
        <div class="winner-meta">
          <span>${tier.label}</span>
          <strong>${formatAddress(winner.player)} | TICKET #${winner.ticketId.toString()}</strong>
        </div>
        <div class="winner-payout">
          <span>${winner.claimed ? "CLAIMED" : "UNCLAIMED"}</span>
          <strong>${formatEther(winner.prizeAmount)} ETH</strong>
        </div>
      </article>
    `;
  }).join("");
}

function canBuy() {
  return Boolean(state.account && state.ticketPrice && ![APP_STATUS.BUYING, APP_STATUS.CLAIMING].includes(state.appStatus));
}

function headlineForStatus() {
  switch (state.appStatus) {
    case APP_STATUS.UNCONFIGURED:
      return "CONFIG FIRST";
    case APP_STATUS.IDLE:
      return "READY TO PLAY";
    case APP_STATUS.BUYING:
      return "BUYING TICKET";
    case APP_STATUS.BRIDGING:
      return "SCRATCH CARD MATERIALIZING";
    case APP_STATUS.RANDOMIZING:
      return "VRF ROLLING";
    case APP_STATUS.READY:
      return "SCRATCH NOW";
    case APP_STATUS.REVEALED:
      return "RESULT REVEALED";
    case APP_STATUS.CLAIMING:
      return "CLAIMING PRIZE";
    case APP_STATUS.FINISHED:
      return "ROUND CLEARED";
    case APP_STATUS.ERROR:
      return "FLOW INTERRUPTED";
    default:
      return "CONNECT WALLET";
  }
}

async function fetchTicketTrace(ticketId) {
  if (!state.gameContract || !state.destinationReadProvider || !ticketId || ticketId === 0n) {
    return emptyTrace();
  }

  const ticketKey = toTicketKey(ticketId);
  const cached = state.traceCache.get(ticketKey);

  try {
    const now = Date.now();
    if (cached && now - cached.fetchedAt < TRACE_REFRESH_INTERVAL_MS) {
      return cached.trace;
    }

    const latestBlock = await state.destinationReadProvider.getBlockNumber();
    const fromBlock = cached?.lastScannedBlock == null
      ? latestBlock > Number(TRACE_LOOKBACK_BLOCKS)
        ? latestBlock - Number(TRACE_LOOKBACK_BLOCKS)
        : 0
      : cached.lastScannedBlock + 1;

    const [openedLogs, requestLogs, fulfilledLogs, claimedLogs] = fromBlock <= latestBlock
      ? await Promise.all([
        state.gameContract.queryFilter(state.gameContract.filters.TicketOpened(ticketId), fromBlock, latestBlock),
        state.gameContract.queryFilter(state.gameContract.filters.RandomnessRequested(null, ticketId), fromBlock, latestBlock),
        state.gameContract.queryFilter(state.gameContract.filters.RandomnessFulfilled(null, ticketId), fromBlock, latestBlock),
        state.gameContract.queryFilter(state.gameContract.filters.PrizeClaimed(ticketId), fromBlock, latestBlock),
      ])
      : [[], [], [], []];

    const trace = {
      openedTxHash: openedLogs.at(-1)?.transactionHash ?? cached?.trace.openedTxHash ?? null,
      randomnessTxHash:
        requestLogs.at(-1)?.transactionHash
        ?? fulfilledLogs.at(-1)?.transactionHash
        ?? cached?.trace.randomnessTxHash
        ?? null,
      fulfilledTxHash: fulfilledLogs.at(-1)?.transactionHash ?? cached?.trace.fulfilledTxHash ?? null,
      claimedTxHash: claimedLogs.at(-1)?.transactionHash ?? cached?.trace.claimedTxHash ?? null,
    };

    state.traceCache.set(ticketKey, {
      trace,
      fetchedAt: now,
      lastScannedBlock: latestBlock,
    });

    return trace;
  }
  catch {
    return cached?.trace ?? emptyTrace();
  }
}

function signalCopy() {
  switch (state.appStatus) {
    case APP_STATUS.UNCONFIGURED:
      return "FRONTEND CONFIG REQUIRED";
    case APP_STATUS.IDLE:
      return "WAITING FOR NEXT RUN";
    case APP_STATUS.BUYING:
      return "SOURCE TX BROADCASTING";
    case APP_STATUS.BRIDGING:
      return "REACTIVE IS SYNCING THE PURCHASE EVENT";
    case APP_STATUS.RANDOMIZING:
      return "CHAINLINK VRF IS ROLLING THE RESULT";
    case APP_STATUS.READY:
      return "RESULT LOCKED ONCHAIN, OPEN SCRATCH CARD TO SCRATCH";
    case APP_STATUS.REVEALED:
      return "RESULT REVEALED, CLAIM IF YOU HIT";
    case APP_STATUS.CLAIMING:
      return "PRIZE CLAIM TX IN PROGRESS";
    case APP_STATUS.FINISHED:
      return "RUN COMPLETE, PRESS BUY TICKET AGAIN";
    case APP_STATUS.ERROR:
      return "FLOW ERROR, REFRESH AND TRY AGAIN";
    default:
      return "WAITING FOR WALLET";
  }
}

function resultKicker() {
  if (!state.gameTicket || state.gameTicket.player === ZERO_ADDRESS) return "SCRATCH CARD LOCKED";
  if (state.gameTicket.status === TICKET_STATUS.PendingVRF) return "VRF PENDING";
  if (state.gameTicket.status === TICKET_STATUS.Claimed) return "PRIZE SETTLED";
  return scratch.revealed ? "RESULT LIVE" : "SCRATCH TO REVEAL";
}

function resultTitle() {
  if (!state.latestTicketId || state.latestTicketId === 0n) return "BUY YOUR FIRST TICKET";
  if (!state.gameTicket || state.gameTicket.player === ZERO_ADDRESS) return "SCRATCH CARD IS MATERIALIZING";
  if (state.gameTicket.status === TICKET_STATUS.PendingVRF) return "VRF IS ROLLING";
  if (!scratch.revealed) return "SCRATCH TO EXPOSE THE RESULT";
  return tierMeta().label;
}

function resultBody() {
  if (!state.latestTicketId || state.latestTicketId === 0n) {
    return "Buy a ticket first. The system will create the matching Scratch Card on the destination chain and wait for the draw.";
  }
  if (!state.gameTicket || state.gameTicket.player === ZERO_ADDRESS) {
    return "Purchase succeeded. The destination chain is creating the ticket - keep this page open for auto-refresh.";
  }
  if (state.gameTicket.status === TICKET_STATUS.PendingVRF) {
    return "The ticket has been created, but the final prize tier is still waiting for Chainlink VRF randomness.";
  }
  if (!scratch.revealed) {
    return "The prize tier is already locked on-chain; scratching only reveals the final result to you.";
  }
  return tierMeta().accent;
}

function machineCopy() {
  if (!state.latestTicketId || state.latestTicketId === 0n) {
    return "Connect wallet and press BUY TICKET to start this run.";
  }
  if (!state.gameTicket || state.gameTicket.player === ZERO_ADDRESS) {
    return "Source buy confirmed. Waiting for the target-chain Scratch Card.";
  }
  if (state.gameTicket.status === TICKET_STATUS.PendingVRF) {
    return "Scratch Card minted. Chainlink VRF is rolling the result.";
  }
  if (isMissedTicketSettled()) {
    return "Result revealed. No prize this round. Press BUY TICKET for another run.";
  }
  if (state.gameTicket.status === TICKET_STATUS.Ready && !scratch.revealed) {
    return "Open the Scratch Card and scratch with your mouse.";
  }
  if (state.gameTicket.status === TICKET_STATUS.Claimed) {
    return "Prize claimed. Press BUY TICKET for another run.";
  }
  return "Result revealed. If you hit, claim the prize now.";
}

function destinationStatusLabel() {
  if (!state.gameTicket || state.gameTicket.player === ZERO_ADDRESS) return "MINTING";
  switch (state.gameTicket.status) {
    case TICKET_STATUS.PendingVRF:
      return "ROLLING";
    case TICKET_STATUS.Ready:
      return scratch.revealed ? "REVEALED" : "READY";
    case TICKET_STATUS.Claimed:
      return "CLAIMED";
    default:
      return "UNKNOWN";
  }
}

function pillClassForStatus() {
  if (!state.gameTicket || state.gameTicket.player === ZERO_ADDRESS) return "pill-red";
  switch (state.gameTicket.status) {
    case TICKET_STATUS.PendingVRF:
      return "pill-cyan";
    case TICKET_STATUS.Ready:
      return scratch.revealed ? "pill-gold" : "pill-green";
    case TICKET_STATUS.Claimed:
      return "pill-muted";
    default:
      return "pill-red";
  }
}

function tierMeta() {
  return SCRATCH_CONFIG.prizeTiers.find((entry) => entry.tier === Number(state.gameTicket?.prizeTier ?? 0))
    ?? SCRATCH_CONFIG.prizeTiers[0];
}

function getFlowPercent() {
  switch (state.appStatus) {
    case APP_STATUS.BUYING:
      return 18;
    case APP_STATUS.BRIDGING:
      return 38;
    case APP_STATUS.RANDOMIZING:
      return 62;
    case APP_STATUS.READY:
      return 78;
    case APP_STATUS.REVEALED:
      return 90;
    case APP_STATUS.CLAIMING:
      return 96;
    case APP_STATUS.FINISHED:
      return 100;
    default:
      return state.latestTicketId ? 10 : 0;
  }
}

function normalizeSourceReceipt(receipt) {
  return {
    player: receipt.player,
    amount: receipt.amount,
    roundId: receipt.roundId,
    purchasedAt: receipt.purchasedAt,
  };
}

function normalizeGameTicket(ticket) {
  return {
    player: ticket.player,
    amountPaid: ticket.amountPaid,
    roundId: ticket.roundId,
    status: Number(ticket.status),
    requestId: ticket.requestId,
    randomWord: ticket.randomWord,
    prizeTier: Number(ticket.prizeTier),
    prizeAmount: ticket.prizeAmount,
    sourceTxHash: ticket.sourceTxHash,
  };
}

function formatAddress(value) {
  if (!value || value === "-") return "-";
  if (!value.startsWith?.("0x") || value.length < 12) return value;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function truncateHash(value) {
  return `${value.slice(0, 10)}...${value.slice(-8)}`;
}

function resolveChainName(chainId) {
  return CHAIN_LOOKUP.get(chainId)?.name ?? "Unknown network";
}

function emptyTrace() {
  return {
    openedTxHash: null,
    randomnessTxHash: null,
    fulfilledTxHash: null,
    claimedTxHash: null,
  };
}

function explorerTxUrl(baseUrl, txHash) {
  if (!baseUrl || !txHash) return null;
  return `${baseUrl}/tx/${txHash}`;
}

function explorerAddressUrl(baseUrl, address) {
  if (!baseUrl || !address) return null;
  return `${baseUrl}/address/${address}`;
}

function reactiveRvmUrl(baseUrl, address) {
  if (!baseUrl || !address) return null;
  return `${baseUrl}/rvm/${address}`;
}

function mergeRecentWinnerLogs(logs) {
  if (!logs.length) return;

  const merged = new Map(state.recentWinnerLogs.map((log) => [winnerLogKey(log), log]));
  for (const log of logs) {
    merged.set(winnerLogKey(log), log);
  }

  state.recentWinnerLogs = [...merged.values()]
    .sort(compareTraceLogs)
    .slice(-MAX_RECENT_WINNER_LOGS);
}

function winnerLogKey(log) {
  return `${log.transactionHash}:${Number(log.index ?? log.logIndex ?? 0)}`;
}

function compareTraceLogs(left, right) {
  const leftBlock = Number(left.blockNumber ?? 0);
  const rightBlock = Number(right.blockNumber ?? 0);
  if (leftBlock !== rightBlock) return leftBlock - rightBlock;

  const leftIndex = Number(left.index ?? left.logIndex ?? 0);
  const rightIndex = Number(right.index ?? right.logIndex ?? 0);
  return leftIndex - rightIndex;
}

function reactiveContractUrl(baseUrl, senderAddress, contractAddress) {
  if (!baseUrl || !senderAddress || !contractAddress) return null;
  return `${baseUrl}/address/${senderAddress}/contract/${contractAddress}`;
}

function linkMarkup(href, label) {
  if (!href) return "";
  return `<a class="trace-link" href="${href}" target="_blank" rel="noreferrer">${label}</a>`;
}

function traceNodeIcon(index) {
  if (index === 0) {
    return '<svg viewBox="0 0 24 24" role="presentation"><path d="M7 6h10a2 2 0 0 1 2 2v2a2.5 2.5 0 0 0 0 4v2a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-2a2.5 2.5 0 0 0 0-4V8a2 2 0 0 1 2-2Z"/><path d="M9 9h6"/><path d="M9 15h4"/></svg>';
  }
  if (index === 1) {
    return '<svg viewBox="0 0 24 24" role="presentation"><circle cx="12" cy="12" r="3.5"/><path d="M4.5 12H8"/><path d="M16 12h3.5"/><path d="M12 4.5V8"/><path d="M12 16v3.5"/><path d="m6.8 6.8 2.5 2.5"/><path d="m14.7 14.7 2.5 2.5"/><path d="m17.2 6.8-2.5 2.5"/><path d="m9.3 14.7-2.5 2.5"/></svg>';
  }
  return '<svg viewBox="0 0 24 24" role="presentation"><rect x="5" y="5" width="14" height="14" rx="3"/><path d="M9 9h6"/><path d="M9 13h4"/><path d="m15.4 15.4.8 1.7 1.9.3-1.4 1.3.3 1.9-1.6-.9-1.6.9.3-1.9-1.4-1.3 1.9-.3Z"/></svg>';
}

function persistScratchReveal(ticketId, revealed) {
  const storageKey = scratchStorageKey(ticketId);
  if (!storageKey) return;
  window.localStorage.setItem(storageKey, revealed ? "1" : "0");
}

function readScratchReveal(ticketId) {
  const storageKey = scratchStorageKey(ticketId);
  if (!storageKey) return false;
  return window.localStorage.getItem(storageKey) === "1";
}

function scratchStorageKey(ticketId) {
  if (!ticketId || ticketId === "0") return null;

  const sourceChainId = SCRATCH_CONFIG.sourceChain?.id ?? "source";
  const destinationChainId = SCRATCH_CONFIG.destinationChain?.id ?? "destination";
  const gameAddress = (SCRATCH_CONFIG.contracts.game ?? "game").toLowerCase();
  const accountKey = (state.account ?? "anonymous").toLowerCase();
  return `lucky-flux:${sourceChainId}:${destinationChainId}:${gameAddress}:${accountKey}:${ticketId}`;
}

function setAppStatus(status, detail) {
  state.appStatus = status;
  state.statusDetail = detail;
}

function startPolling() {
  stopPolling();
  state.refreshTimer = window.setInterval(refreshSession, SCRATCH_CONFIG.refreshIntervalMs);
}

function stopPolling() {
  if (state.refreshTimer) {
    window.clearInterval(state.refreshTimer);
    state.refreshTimer = null;
  }
}

function resetSession(status, detail) {
  state.provider = null;
  state.signer = null;
  state.account = null;
  state.chainId = null;
  state.ticketPrice = null;
  state.currentRoundId = null;
  state.latestTicketId = null;
  state.sourceReceipt = null;
  state.gameTicket = null;
  state.trace = emptyTrace();
  state.recentWinners = [];
  state.scratchRatio = 0;
  scratch.revealed = false;
  clearTicketFlow();
  clearSourcePurchaseWatcher();
  clearDestinationTicketWatchers();
  closeScratchModal();
  setAppStatus(status, detail);
  stopPolling();
}

function getErrorMessage(error, fallback) {
  return error?.shortMessage || error?.reason || error?.message || fallback;
}

function isTransientRpcReadError(error) {
  const message = `${error?.shortMessage ?? ""} ${error?.reason ?? ""} ${error?.message ?? ""}`.toLowerCase();
  return message.includes("missing response for request")
    || message.includes("timeout")
    || message.includes("network error")
    || message.includes("failed to fetch")
    || message.includes("socket hang up");
}
