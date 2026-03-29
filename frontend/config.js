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
    id: 5318007,
    name: "Reactive Network",
    currencySymbol: "lREACT",
    blockExplorerUrl: "https://lasna.reactscan.net",
    senderAddress: "0xDFD4AbAf11a1a8773983e708c34A0c8Cf7c41Bd6",
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
    { tier: 0, label: "MISS", accent: "No win this time - grab another one and keep pushing.", multiplier: "0x" },
    { tier: 1, label: "1X BACK", accent: "At least break even - the ticket price is returned.", multiplier: "1x" },
    { tier: 2, label: "SILVER", accent: "A steady 1.5x reward.", multiplier: "1.5x" },
    { tier: 3, label: "GOLD", accent: "5x reward - great for live demos.", multiplier: "5x" },
    { tier: 4, label: "JACKPOT", accent: "Top-tier jackpot - the most explosive hit on stage.", multiplier: "50x" },
  ],
};
