export const SCRATCH_CONFIG = {
  appName: "Lucky Scratch",
  refreshIntervalMs: 5000,
  sourceChain: {
    id: 11155111,
    name: "Ethereum Sepolia",
    currencySymbol: "ETH",
    rpcUrl: "https://sepolia.infura.io/v3/a741720a2c33491da85d6f877f3cc1ba",
    blockExplorerUrl: "https://sepolia.etherscan.io",
  },
  destinationChain: {
    id: 11155111,
    name: "Ethereum Sepolia",
    currencySymbol: "ETH",
    rpcUrl: "https://sepolia.infura.io/v3/a741720a2c33491da85d6f877f3cc1ba",
    blockExplorerUrl: "https://sepolia.etherscan.io",
  },
  reactiveChain: {
    name: "Reactive Network",
    blockExplorerUrl: "https://reactscan.net",
  },
  contracts: {
    source: "0xc6D1C9500E25ebDd55650Ca04f8C97e6616770C5",
    game: "0x092B84CAeDe9e1c52C7bACA840372f4c18baA3F1",
    reactive: "0x4387e5F6C79ae885C9E2AcCB47cD4E31085BaeaF",
  },
  ui: {
    scratchThreshold: 0.45,
  },
  prizeTiers: [
    { tier: 0, label: "MISS", accent: "这张没中，再来一张继续冲。", multiplier: "0x" },
    { tier: 1, label: "1X BACK", accent: "至少回本，票价原路返还。", multiplier: "1x" },
    { tier: 2, label: "SILVER", accent: "稳定命中 1.5 倍奖励。", multiplier: "1.5x" },
    { tier: 3, label: "GOLD", accent: "五倍奖励，适合现场演示。", multiplier: "5x" },
    { tier: 4, label: "JACKPOT", accent: "最高档大奖，现场最炸裂的一张。", multiplier: "50x" },
  ],
};
