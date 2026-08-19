"use client";

// The two-wallet system: injected EIP-1193 wallet, or a generated browser
// wallet persisted in localStorage. Whichever mode is active, the SAME
// account/address feeds both the read client and the write client — there
// is exactly one `client` value exposed by this context, used everywhere.
//
// All of this runs client-side only. Nothing here touches window/localStorage
// during render; state starts "unhydrated" and resolves in useEffect, so SSR
// never mismatches the client render.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { generatePrivateKey, createAccount } from "genlayer-js";
import type { GenLayerClient } from "genlayer-js/types";
import { chain, type Address, LOCAL_WALLET_KEY, LOCAL_WALLET_ACK_KEY, WALLET_MODE_KEY } from "./config";
import { createGeneratedClient, createInjectedClient, connectInjected } from "./genlayerClient";

export type WalletMode = "none" | "generated" | "injected";

interface EthereumProvider {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
}

declare global {
  interface Window {
    ethereum?: EthereumProvider;
  }
}

interface WalletState {
  hydrated: boolean;
  mode: WalletMode;
  address: Address | null;
  client: GenLayerClient<typeof chain> | null;
  hasInjectedWallet: boolean;
  needsAck: boolean; // generated wallet exists but warning not yet acknowledged
  privateKey: `0x${string}` | null;
  error: string | null;
}

interface WalletContextValue extends WalletState {
  generateWallet: () => void;
  acknowledgeWarning: () => void;
  importWallet: (privateKey: string) => { ok: boolean; error?: string };
  connectInjectedWallet: () => Promise<void>;
  disconnect: () => void;
}

const WalletContext = createContext<WalletContextValue | null>(null);

function isHexPrivateKey(v: string): v is `0x${string}` {
  return /^0x[0-9a-fA-F]{64}$/.test(v.trim());
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<WalletState>({
    hydrated: false,
    mode: "none",
    address: null,
    client: null,
    hasInjectedWallet: false,
    needsAck: false,
    privateKey: null,
    error: null,
  });

  // Hydrate from localStorage / window.ethereum after mount only.
  useEffect(() => {
    if (typeof window === "undefined") return;

    const hasInjected = typeof window.ethereum !== "undefined";
    const storedMode = window.localStorage.getItem(WALLET_MODE_KEY) as WalletMode | null;
    const storedKey = window.localStorage.getItem(LOCAL_WALLET_KEY) as `0x${string}` | null;
    const acked = window.localStorage.getItem(LOCAL_WALLET_ACK_KEY) === "1";

    if (storedMode === "generated" && storedKey && isHexPrivateKey(storedKey)) {
      const account = createAccount(storedKey);
      const client = createGeneratedClient(storedKey);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time SSR-safe hydration from localStorage on mount.
      setState({
        hydrated: true,
        mode: "generated",
        address: account.address as Address,
        client,
        hasInjectedWallet: hasInjected,
        needsAck: !acked,
        privateKey: storedKey,
        error: null,
      });
      return;
    }

    setState((s) => ({ ...s, hydrated: true, hasInjectedWallet: hasInjected }));
  }, []);

  const generateWallet = useCallback(() => {
    if (typeof window === "undefined") return;
    const pk = generatePrivateKey();
    const account = createAccount(pk);
    window.localStorage.setItem(LOCAL_WALLET_KEY, pk);
    window.localStorage.setItem(WALLET_MODE_KEY, "generated");
    window.localStorage.removeItem(LOCAL_WALLET_ACK_KEY);
    const client = createGeneratedClient(pk);
    setState((s) => ({
      ...s,
      mode: "generated",
      address: account.address as Address,
      client,
      privateKey: pk,
      needsAck: true,
      error: null,
    }));
  }, []);

  const acknowledgeWarning = useCallback(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(LOCAL_WALLET_ACK_KEY, "1");
    setState((s) => ({ ...s, needsAck: false }));
  }, []);

  const importWallet = useCallback((privateKeyInput: string) => {
    const trimmed = privateKeyInput.trim();
    if (!isHexPrivateKey(trimmed)) {
      return { ok: false, error: "Expected a 32-byte hex private key starting with 0x." };
    }
    if (typeof window === "undefined") return { ok: false, error: "Not available server-side." };
    const account = createAccount(trimmed as `0x${string}`);
    window.localStorage.setItem(LOCAL_WALLET_KEY, trimmed);
    window.localStorage.setItem(WALLET_MODE_KEY, "generated");
    window.localStorage.setItem(LOCAL_WALLET_ACK_KEY, "1");
    const client = createGeneratedClient(trimmed as `0x${string}`);
    setState((s) => ({
      ...s,
      mode: "generated",
      address: account.address as Address,
      client,
      privateKey: trimmed as `0x${string}`,
      needsAck: false,
      error: null,
    }));
    return { ok: true };
  }, []);

  const connectInjectedWallet = useCallback(async () => {
    if (typeof window === "undefined" || !window.ethereum) {
      setState((s) => ({ ...s, error: "No injected wallet detected in this browser." }));
      return;
    }
    try {
      const accounts = (await window.ethereum.request({
        method: "eth_requestAccounts",
      })) as string[];
      const address = accounts?.[0];
      if (!address) {
        setState((s) => ({ ...s, error: "Wallet did not return an address." }));
        return;
      }
      const client = createInjectedClient(address as Address);
      await connectInjected(client);
      window.localStorage.setItem(WALLET_MODE_KEY, "injected");
      window.localStorage.removeItem(LOCAL_WALLET_KEY);
      setState((s) => ({
        ...s,
        mode: "injected",
        address: address as Address,
        client,
        privateKey: null,
        needsAck: false,
        error: null,
      }));
    } catch {
      setState((s) => ({ ...s, error: "Could not connect to the injected wallet." }));
    }
  }, []);

  const disconnect = useCallback(() => {
    if (typeof window === "undefined") return;
    window.localStorage.removeItem(WALLET_MODE_KEY);
    window.localStorage.removeItem(LOCAL_WALLET_KEY);
    window.localStorage.removeItem(LOCAL_WALLET_ACK_KEY);
    setState((s) => ({
      ...s,
      mode: "none",
      address: null,
      client: null,
      privateKey: null,
      needsAck: false,
      error: null,
    }));
  }, []);

  const value = useMemo<WalletContextValue>(
    () => ({
      ...state,
      generateWallet,
      acknowledgeWarning,
      importWallet,
      connectInjectedWallet,
      disconnect,
    }),
    [state, generateWallet, acknowledgeWarning, importWallet, connectInjectedWallet, disconnect],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletContextValue {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used within WalletProvider");
  return ctx;
}
