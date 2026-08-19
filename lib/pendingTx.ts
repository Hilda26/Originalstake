"use client";

// Persists in-flight transaction state to localStorage so a page refresh
// never loses track of a write that's still going through consensus. The
// {functionName, args} pair is persisted alongside the hash from the
// start (not bolted on later) so a resumed transaction can always be
// retried with the correct method and arguments.

import { PENDING_TX_KEY } from "./config";

export type PendingTxArg = string | number | boolean | null | PendingTxArg[];

export interface PendingTx {
  hash: string;
  functionName: string;
  submissionId: number | null;
  challengeId: number | null;
  args: PendingTxArg[];
  valueWei?: string;
  submittedAt: string; // ISO, browser clock, cosmetic only
  label: string;
}

function readAll(): PendingTx[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(PENDING_TX_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(txs: PendingTx[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(PENDING_TX_KEY, JSON.stringify(txs));
}

export function listPendingTx(): PendingTx[] {
  return readAll();
}

export function addPendingTx(tx: PendingTx): void {
  const all = readAll().filter((t) => t.hash !== tx.hash);
  all.unshift(tx);
  writeAll(all.slice(0, 50));
}

export function removePendingTx(hash: string): void {
  writeAll(readAll().filter((t) => t.hash !== hash));
}

export function pendingTxForSubmission(submissionId: number): PendingTx[] {
  return readAll().filter((t) => t.submissionId === submissionId);
}
