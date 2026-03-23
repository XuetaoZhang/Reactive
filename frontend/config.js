export const SCRATCH_CONFIG = {
  appName: "Lucky Flux 刮刮乐",
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
  contracts: {
    source: "0xc6D1C9500E25ebDd55650Ca04f8C97e6616770C5",
    game: "0x092B84CAeDe9e1c52C7bACA840372f4c18baA3F1",
    reactive: "0x4387e5F6C79ae885C9E2AcCB47cD4E31085BaeaF",
  },
  ui: {
    scratchThreshold: 0.45,
  },
  prizeTiers: [
    { tier: 0, label: "谢谢参与", accent: "这次没中，下一张继续。", multiplier: "0x" },
    { tier: 1, label: "回本", accent: "票钱原路返还。", multiplier: "1x" },
    { tier: 2, label: "银奖", accent: "稳定命中 1.5 倍奖励。", multiplier: "1.5x" },
    { tier: 3, label: "金奖", accent: "五倍奖励，适合现场演示。", multiplier: "5x" },
    { tier: 4, label: "头奖", accent: "万里挑一的终极大奖。", multiplier: "50x" },
  ],
};
