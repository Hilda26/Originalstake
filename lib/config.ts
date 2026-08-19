// Single source of truth for chain + contract address configuration.
// Never inline a chain or address anywhere else in the app.

import { studionet, localnet, testnetAsimov, testnetBradbury } from "genlayer-js/chains";

export type Address = `0x${string}`;

const CHAINS = {
  studionet,
  localnet,
  testnetAsimov,
  testnetBradbury,
} as const;

export type ChainName = keyof typeof CHAINS;

function resolveChainName(): ChainName {
  const raw = process.env.NEXT_PUBLIC_GENLAYER_CHAIN?.trim();
  if (raw && raw in CHAINS) return raw as ChainName;
  return "studionet";
}

export const chainName: ChainName = resolveChainName();
export const chain = CHAINS[chainName];

// Left blank until the contract is deployed. The rest of the app must
// render a clean "no contract configured" empty state when this is unset - // never fabricate or hardcode a placeholder address.
const RAW_ADDRESS = process.env.NEXT_PUBLIC_GENLAYER_CONTRACT_ADDRESS?.trim() ?? "";

export const contractAddress: Address | null =
  RAW_ADDRESS.length > 0 && /^0x[a-fA-F0-9]{40}$/.test(RAW_ADDRESS)
    ? (RAW_ADDRESS as Address)
    : null;

export const isContractConfigured = contractAddress !== null;

// genlayer-js's chain definitions don't populate blockExplorers for
// studionet, so this can't be derived from `chain` - hardcode per network.
// explorer-studio.genlayer.com is a distinct site from studio.genlayer.com
// (the IDE); the IDE has no per-address/per-tx routes at all.
const EXPLORER_BASE_URLS: Record<ChainName, string> = {
  studionet: "https://explorer-studio.genlayer.com",
  localnet: "https://explorer-studio.genlayer.com",
  testnetAsimov: "https://explorer.testnet-chain.genlayer.com",
  testnetBradbury: "https://explorer.testnet-chain.genlayer.com",
};

export const explorerBaseUrl = EXPLORER_BASE_URLS[chainName];

export function explorerContractUrl(address: string): string {
  return `${explorerBaseUrl}/address/${address}`;
}

export function explorerTxUrl(hash: string): string {
  return `${explorerBaseUrl}/tx/${hash}`;
}

// Local wallet persistence keys - namespaced so OriginalStake never
// collides with other apps (e.g. project-1/BriefBond) sharing a browser
// profile or domain.
export const LOCAL_WALLET_KEY = "originalstake.generatedWalletPrivateKey.v1";
export const LOCAL_WALLET_ACK_KEY = "originalstake.generatedWalletWarningAcked.v1";
export const WALLET_MODE_KEY = "originalstake.walletMode.v1";
export const PENDING_TX_KEY = "originalstake.pendingTransactions.v1";

export const CONTRACT_METHODS = {
  views: [
    "get_submission",
    "get_submission_count",
    "list_submission_ids",
    "list_submissions_page",
    "get_challenge",
    "get_challenge_count",
    "list_challenge_ids",
    "list_challenges_page",
    "list_challenges_for_submission",
    "preview_nearest_neighbor",
  ],
  writes: ["submit", "challenge", "resolve_challenge"],
} as const;
