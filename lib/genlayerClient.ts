"use client";

// Thin wrapper around genlayer-js's createClient - every call site in the
// app goes through here so there is exactly one place that decides which
// identity is used for reads and writes.

import { createClient, createAccount } from "genlayer-js";
import type { GenLayerClient } from "genlayer-js/types";
import { chain, chainName, type Address } from "./config";

/**
 * Read client for a generated (local) wallet. A generated wallet's account
 * signs both reads and writes locally, so a single client instance already
 * guarantees identity sharing between them.
 */
export function createGeneratedClient(privateKey: `0x${string}`): GenLayerClient<typeof chain> {
  const account = createAccount(privateKey);
  return createClient({ chain, account });
}

/**
 * Client for an injected wallet (MetaMask, Rabby, etc). Per the verified
 * genlayer-js 1.1.8 pattern: pass the wallet's own address as `account`,
 * then call `connect()` so the provider is wired up for signing. The same
 * client instance is used for both `readContract` and `writeContract`, so
 * there is no way for the displayed address and the signing address to
 * drift apart.
 */
export function createInjectedClient(address: Address): GenLayerClient<typeof chain> {
  return createClient({ chain, account: address });
}

export async function connectInjected(client: GenLayerClient<typeof chain>): Promise<void> {
  await client.connect(chainName);
}

let readOnlyClient: GenLayerClient<typeof chain> | null = null;

/**
 * A throwaway-identity client for view calls only, used for read-only
 * browsing before any wallet is connected. Views need no signature, so any
 * valid account will do. Never used for writes.
 */
export function getReadOnlyClient(): GenLayerClient<typeof chain> {
  if (!readOnlyClient) {
    readOnlyClient = createClient({ chain, account: createAccount() });
  }
  return readOnlyClient;
}
