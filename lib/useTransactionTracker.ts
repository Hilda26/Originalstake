"use client";

import { useEffect, useRef, useState } from "react";
import type { GenLayerClient, GenLayerTransaction, Hash } from "genlayer-js/types";
import { TransactionStatus } from "genlayer-js/types";
import type { chain } from "./config";

type Client = GenLayerClient<typeof chain>;

const TERMINAL: TransactionStatus[] = [
  TransactionStatus.FINALIZED,
  TransactionStatus.CANCELED,
];

// Statuses that mean "validators could not agree, nothing was written" —
// retryable, never rendered as a hard error.
const RETRYABLE: TransactionStatus[] = [
  TransactionStatus.UNDETERMINED,
  TransactionStatus.VALIDATORS_TIMEOUT,
  TransactionStatus.LEADER_TIMEOUT,
];

export function isRetryableStatus(status: TransactionStatus | null): boolean {
  return !!status && RETRYABLE.includes(status);
}

export interface TrackedTx {
  status: TransactionStatus | null;
  tx: GenLayerTransaction | null;
  polling: boolean;
  elapsedMs: number;
  error: string | null;
}

/** Polls client.getTransaction so the UI can show real consensus stages
 * (proposing/committing/revealing/…) instead of a generic spinner. */
export function useTransactionTracker(client: Client | null, hash: string | null): TrackedTx {
  const [state, setState] = useState<TrackedTx>({
    status: null,
    tx: null,
    polling: false,
    elapsedMs: 0,
    error: null,
  });
  const startRef = useRef<number>(0);

  useEffect(() => {
    if (!client || !hash) return;
    let cancelled = false;
    startRef.current = Date.now();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resetting tracker state when the polled hash changes.
    setState((s) => ({ ...s, polling: true, error: null }));

    async function poll() {
      try {
        const tx = await client!.getTransaction({ hash: hash as Hash });
        if (cancelled) return;
        const status = (tx.statusName ?? null) as TransactionStatus | null;
        setState({
          status,
          tx,
          polling: !status || !TERMINAL.includes(status),
          elapsedMs: Date.now() - startRef.current,
          error: null,
        });
      } catch {
        if (cancelled) return;
        setState((s) => ({ ...s, elapsedMs: Date.now() - startRef.current }));
      }
    }

    poll();
    const interval = setInterval(() => {
      setState((s) => {
        if (!s.polling) return s;
        return s;
      });
      poll();
    }, 4000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [client, hash]);

  return state;
}
