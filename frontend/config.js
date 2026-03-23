export const SCRATCH_CONFIG = {
  appName: "Reactive Scratch",
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
    { tier: 0, label: "No Prize", accent: "Better luck next block.", multiplier: "0x" },
    { tier: 1, label: "Refund", accent: "Ticket money comes back.", multiplier: "1x" },
    { tier: 2, label: "Silver Hit", accent: "A clean 1.5x payout.", multiplier: "1.5x" },
    { tier: 3, label: "Gold Hit", accent: "Five times the ticket price.", multiplier: "5x" },
    { tier: 4, label: "Jackpot", accent: "One in ten thousand.", multiplier: "50x" },
  ],
};
