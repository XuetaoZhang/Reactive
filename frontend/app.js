import { BrowserProvider, Contract, JsonRpcProvider, formatEther } from "https://esm.sh/ethers@6.13.5";
import { SCRATCH_CONFIG } from "./config.js?v=20260324-4";

const SOURCE_ABI = [
  "function buyTicket() payable returns (uint256)",
  "function ticketPrice() view returns (uint256)",
  "function currentRoundId() view returns (uint256)",
  "function lastTicketIdByPlayer(address) view returns (uint256)",
  "function ticketReceipts(uint256) view returns (address player, uint256 amount, uint256 roundId, uint256 purchasedAt)",
];

const GAME_ABI = [
  "function claim(uint256 ticketId)",
  "function getTicketState(uint256 ticketId) view returns ((address player, uint256 amountPaid, uint256 roundId, uint8 status, uint256 requestId, uint256 randomWord, uint8 prizeTier, uint256 prizeAmount, bytes32 sourceTxHash))",
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

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const ZERO_BYTES32 = "0x0000000000000000000000000000000000000000000000000000000000000000";
const WINNER_LOOKBACK_BLOCKS = 120000n;

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
  statusDetail: "连接钱包后即可查看你最近一张 Card 的链上状态。",
  refreshTimer: null,
  scratchRatio: 0,
  isPointerDown: false,
  modalOpen: false,
  hasConfiguration: Boolean(SCRATCH_CONFIG.contracts.source) && Boolean(SCRATCH_CONFIG.contracts.game),
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
  flowProgressFill: document.getElementById("flowProgressFill"),
  flowProgressLabel: document.getElementById("flowProgressLabel"),
  ticketBadge: document.getElementById("ticketBadge"),
  ticketPanelTitle: document.getElementById("ticketPanelTitle"),
  machineTicketTitle: document.getElementById("machineTicketTitle"),
  machineTicketBody: document.getElementById("machineTicketBody"),
  machineStatusPill: document.getElementById("machineStatusPill"),
  machinePrizePill: document.getElementById("machinePrizePill"),
  walletValue: document.getElementById("walletValue"),
  chainValue: document.getElementById("chainValue"),
  ticketPriceValue: document.getElementById("ticketPriceValue"),
  roundValue: document.getElementById("roundValue"),
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
  elements.closeModalButton.addEventListener("click", closeScratchModal);
  elements.modalBackdrop.addEventListener("click", closeScratchModal);

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeScratchModal();
  });

  if (!window.ethereum) return;

  window.ethereum.on("accountsChanged", async (accounts) => {
    state.account = accounts[0] ?? null;
    if (!state.account) {
      resetSession(APP_STATUS.DISCONNECTED, "钱包已断开连接。");
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

async function connectWallet() {
  if (!window.ethereum) {
    setAppStatus(APP_STATUS.ERROR, "未检测到钱包插件，请使用 MetaMask 或其他 EVM 钱包。");
    render();
    return;
  }

  if (!state.hasConfiguration) {
    setAppStatus(APP_STATUS.UNCONFIGURED, "请先在 frontend/config.js 中填入已部署的合约地址。");
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
    setAppStatus(APP_STATUS.ERROR, getErrorMessage(error, "钱包连接失败。"));
    render();
  }
}

async function refreshSession() {
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
      setAppStatus(APP_STATUS.DISCONNECTED, "连接钱包后即可查看你最近一张 Card 的链上状态。");
      state.latestTicketId = null;
      state.sourceReceipt = null;
      state.gameTicket = null;
      state.recentWinners = await fetchRecentWinners();
      render();
      return;
    }

    const latestTicketId = await state.sourceContract.lastTicketIdByPlayer(state.account);
    state.latestTicketId = latestTicketId;

    if (latestTicketId === 0n) {
      state.sourceReceipt = null;
      state.gameTicket = null;
      scratch.revealed = false;
      state.scratchRatio = 0;
      state.recentWinners = await fetchRecentWinners();
      setAppStatus(APP_STATUS.IDLE, "当前钱包还没有购票记录，先买一张票开始本轮游戏。");
      render();
      return;
    }

    const [sourceReceipt, gameTicket, recentWinners] = await Promise.all([
      state.sourceContract.ticketReceipts(latestTicketId),
      state.gameContract.getTicketState(latestTicketId),
      fetchRecentWinners(),
    ]);

    state.sourceReceipt = normalizeSourceReceipt(sourceReceipt);
    state.gameTicket = normalizeGameTicket(gameTicket);
    state.recentWinners = recentWinners;

    deriveAppStatus();
    syncScratchRevealState();
    render();
  }
  catch (error) {
    setAppStatus(APP_STATUS.ERROR, getErrorMessage(error, "刷新合约状态失败。"));
    render();
  }
}

async function fetchRecentWinners() {
  if (!state.gameContract || !state.destinationReadProvider) return [];

  try {
    const latestBlock = await state.destinationReadProvider.getBlockNumber();
    const fromBlock = latestBlock > Number(WINNER_LOOKBACK_BLOCKS)
      ? latestBlock - Number(WINNER_LOOKBACK_BLOCKS)
      : 0;

    const logs = await state.gameContract.queryFilter("RandomnessFulfilled", fromBlock, latestBlock);
    const latestLogs = logs.slice(-8).reverse();

    return await Promise.all(latestLogs.map(async (log, index) => {
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
  }
  catch {
    return [];
  }
}

function deriveAppStatus() {
  if (!state.latestTicketId || state.latestTicketId === 0n) {
    setAppStatus(APP_STATUS.IDLE, "当前钱包还没有购票记录，先买一张票开始本轮游戏。");
    return;
  }

  if (!state.gameTicket || state.gameTicket.player === ZERO_ADDRESS) {
    setAppStatus(APP_STATUS.BRIDGING, "源链已购票，目标链 Scratch Card 正在生成。");
    return;
  }

  if (state.gameTicket.status === TICKET_STATUS.PendingVRF) {
    setAppStatus(APP_STATUS.RANDOMIZING, "Card 已生成，正在等待 Chainlink VRF 返回随机结果。");
    return;
  }

  if (state.gameTicket.status === TICKET_STATUS.Ready) {
    setAppStatus(
      scratch.revealed ? APP_STATUS.REVEALED : APP_STATUS.READY,
      scratch.revealed
        ? "结果已经揭晓，如有中奖可直接领取奖金。"
        : "Card 已经就绪，打开后用鼠标刮开奖面。",
    );
    return;
  }

  if (state.gameTicket.status === TICKET_STATUS.Claimed) {
    scratch.revealed = true;
    setAppStatus(APP_STATUS.FINISHED, "本轮已结算，可以继续购买下一张 Ticket。");
    return;
  }

  setAppStatus(APP_STATUS.ERROR, "当前彩票状态异常，请刷新后重试。");
}

async function buyTicket() {
  if (!state.signer || !state.ticketPrice) return;

  try {
    await ensureChain(SCRATCH_CONFIG.sourceChain);
    const writer = state.sourceContract.connect(state.signer);
    setAppStatus(APP_STATUS.BUYING, "正在发起购票交易。");
    render();

    const tx = await writer.buyTicket({ value: state.ticketPrice });
    setAppStatus(APP_STATUS.BUYING, "购票交易已提交，等待链上确认。");
    render();

    await tx.wait();
    scratch.revealed = false;
    state.scratchRatio = 0;
    closeScratchModal();
    await refreshSession();
  }
  catch (error) {
    setAppStatus(APP_STATUS.ERROR, getErrorMessage(error, "购票交易失败。"));
    render();
  }
}

async function claimPrize() {
  if (!state.signer || !state.gameTicket || !state.latestTicketId || !canClaim()) return;

  try {
    await ensureChain(SCRATCH_CONFIG.destinationChain);
    const writer = state.gameContract.connect(state.signer);
    setAppStatus(APP_STATUS.CLAIMING, "领奖交易已提交，等待链上确认。");
    render();

    const tx = await writer.claim(state.latestTicketId);
    await tx.wait();
    persistScratchReveal(String(state.latestTicketId), true);
    await refreshSession();
  }
  catch (error) {
    setAppStatus(APP_STATUS.ERROR, getErrorMessage(error, "领奖交易失败。"));
    render();
  }
}

async function ensureChain(targetChain) {
  if (!window.ethereum) throw new Error("未检测到钱包提供方。");
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
      setAppStatus(APP_STATUS.REVEALED, "结果已经揭晓，如有中奖可直接领取奖金。");
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
    if (state.appStatus === APP_STATUS.READY) {
      setAppStatus(APP_STATUS.REVEALED, "结果已经揭晓，如有中奖可直接领取奖金。");
    }
  }
  else {
    state.scratchRatio = 0;
    drawScratchLayer();
  }
}

function canScratch() {
  return state.modalOpen && [APP_STATUS.READY, APP_STATUS.REVEALED, APP_STATUS.FINISHED].includes(state.appStatus);
}

function canClaim() {
  return Boolean(state.gameTicket && state.gameTicket.status === TICKET_STATUS.Ready && scratch.revealed);
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

  elements.walletValue.textContent = state.account ? formatAddress(state.account) : "-";
  elements.chainValue.textContent = state.chainId ? `${resolveChainName(state.chainId)} (${state.chainId})` : "-";
  elements.ticketPriceValue.textContent = state.ticketPrice ? `${formatEther(state.ticketPrice)} ${SCRATCH_CONFIG.sourceChain.currencySymbol}` : "-";
  elements.roundValue.textContent = state.currentRoundId ? state.currentRoundId.toString() : "-";

  elements.ticketBadge.textContent = state.latestTicketId && state.latestTicketId !== 0n
    ? `CARD #${state.latestTicketId.toString()}`
    : "NO CARD";
  elements.ticketPanelTitle.textContent = state.latestTicketId && state.latestTicketId !== 0n
    ? `CARD #${state.latestTicketId.toString()} · ${destinationStatusLabel()}`
    : "NO CARD YET";
  elements.machineTicketTitle.textContent = state.latestTicketId && state.latestTicketId !== 0n
    ? `CARD #${state.latestTicketId.toString()}`
    : "NO ACTIVE CARD";
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
    ? `CARD #${state.latestTicketId.toString()}`
    : "CARD LOCKED";
  elements.modalStatusPill.textContent = destinationStatusLabel();
  elements.modalStatusPill.className = `pill ${pillClassForStatus()}`;
  elements.modalScratchLabel.textContent = scratch.revealed
    ? "Card opened. CLAIM is unlocked."
    : `Scratch ${Math.round(SCRATCH_CONFIG.ui.scratchThreshold * 100)}% to unlock CLAIM`;

  const scratchPercent = Math.min(100, Math.round(state.scratchRatio * 100));
  elements.scratchMeterFill.style.width = `${scratchPercent}%`;
  elements.scratchMeterLabel.textContent = `${scratchPercent}%`;

  elements.connectButton.textContent = state.account ? formatAddress(state.account) : "CONNECT";
  elements.buyButton.disabled = !canBuy();
  elements.openScratchButton.disabled = !canOpenScratch();
  elements.claimButton.disabled = !canClaim();
  elements.modalClaimButton.disabled = !canClaim();

  if (scratch.revealed && scratch.ctx) {
    scratch.ctx.clearRect(0, 0, elements.scratchCanvas.width, elements.scratchCanvas.height);
  }

  renderTimeline();
  renderWinnerBoard();
}

function renderTimeline() {
  const items = [
    {
      title: "Ticket Bought",
      body: state.latestTicketId ? "源链支付成功，Ticket ID 已生成。" : "当前还没有源链购票记录。",
      complete: Boolean(state.latestTicketId && state.latestTicketId !== 0n),
      active: state.appStatus === APP_STATUS.BUYING,
    },
    {
      title: "Card Materialized",
      body: state.gameTicket?.player && state.gameTicket.player !== ZERO_ADDRESS
        ? "目标链 Scratch Card 已经写入游戏合约。"
        : "正在等待目标链生成 Scratch Card。",
      complete: Boolean(state.gameTicket?.player && state.gameTicket.player !== ZERO_ADDRESS),
      active: state.appStatus === APP_STATUS.BRIDGING,
    },
    {
      title: "VRF Settled",
      body: state.gameTicket?.status >= TICKET_STATUS.Ready
        ? "随机结果已经上链，本轮奖金已锁定。"
        : "正在等待 Chainlink VRF 返回随机数。",
      complete: Boolean(state.gameTicket?.status >= TICKET_STATUS.Ready),
      active: state.appStatus === APP_STATUS.RANDOMIZING,
    },
    {
      title: "Scratch Opened",
      body: scratch.revealed ? "奖面已打开，可以查看最终结果。" : "打开 Card 后用鼠标拖动刮开奖面。",
      complete: scratch.revealed,
      active: [APP_STATUS.READY, APP_STATUS.REVEALED].includes(state.appStatus),
    },
    {
      title: "Prize Claimed",
      body: state.gameTicket?.status === TICKET_STATUS.Claimed ? "本轮已经完成结算。" : "揭晓结果后可领取奖金。",
      complete: state.gameTicket?.status === TICKET_STATUS.Claimed,
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
    elements.winnerList.innerHTML = '<div class="winner-entry winner-empty"><div class="winner-rank">--</div><div class="winner-meta"><span>BOARD EMPTY</span><strong>当前还没有已开奖的 Card 记录。</strong></div><div class="winner-payout"><span>Payout</span><strong>-</strong></div></div>';
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
          <strong>${formatAddress(winner.player)} · CARD #${winner.ticketId.toString()}</strong>
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
      return "CARD MATERIALIZING";
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
      return "RESULT LOCKED ONCHAIN, OPEN CARD TO SCRATCH";
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
  if (!state.gameTicket || state.gameTicket.player === ZERO_ADDRESS) return "CARD LOCKED";
  if (state.gameTicket.status === TICKET_STATUS.PendingVRF) return "VRF PENDING";
  if (state.gameTicket.status === TICKET_STATUS.Claimed) return "PRIZE SETTLED";
  return scratch.revealed ? "RESULT LIVE" : "SCRATCH TO REVEAL";
}

function resultTitle() {
  if (!state.latestTicketId || state.latestTicketId === 0n) return "BUY YOUR FIRST TICKET";
  if (!state.gameTicket || state.gameTicket.player === ZERO_ADDRESS) return "CARD IS MATERIALIZING";
  if (state.gameTicket.status === TICKET_STATUS.PendingVRF) return "VRF IS ROLLING";
  if (!scratch.revealed) return "SCRATCH TO EXPOSE THE RESULT";
  return tierMeta().label;
}

function resultBody() {
  if (!state.latestTicketId || state.latestTicketId === 0n) {
    return "先购买彩票，系统会在目标链生成对应的彩票并等待开奖。";
  }
  if (!state.gameTicket || state.gameTicket.player === ZERO_ADDRESS) {
    return "购票已经成功，目标链正在创建彩票，保持页面打开即可自动刷新。";
  }
  if (state.gameTicket.status === TICKET_STATUS.PendingVRF) {
    return "彩票已经生成，但最终奖级还在等待 Chainlink VRF 返回随机数。";
  }
  if (!scratch.revealed) {
    return "奖级已经在链上锁定，刮开动作只是把最终结果展示给你。";
  }
  return tierMeta().accent;
}

function machineCopy() {
  if (!state.latestTicketId || state.latestTicketId === 0n) {
    return "Connect wallet and press BUY TICKET to start this run.";
  }
  if (!state.gameTicket || state.gameTicket.player === ZERO_ADDRESS) {
    return "Source buy confirmed. Waiting for the target-chain Card.";
  }
  if (state.gameTicket.status === TICKET_STATUS.PendingVRF) {
    return "Card minted. Chainlink VRF is rolling the result.";
  }
  if (state.gameTicket.status === TICKET_STATUS.Ready && !scratch.revealed) {
    return "Open the Card and scratch with your mouse.";
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
  return CHAIN_LOOKUP.get(chainId)?.name ?? "未知网络";
}

function persistScratchReveal(ticketId, revealed) {
  if (ticketId === "0") return;
  window.localStorage.setItem(`lucky-flux:${ticketId}`, revealed ? "1" : "0");
}

function readScratchReveal(ticketId) {
  return window.localStorage.getItem(`lucky-flux:${ticketId}`) === "1";
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
  state.recentWinners = [];
  state.scratchRatio = 0;
  scratch.revealed = false;
  closeScratchModal();
  setAppStatus(status, detail);
  stopPolling();
}

function getErrorMessage(error, fallback) {
  return error?.shortMessage || error?.reason || error?.message || fallback;
}

