"use client";

import { TransactionStatus } from "genlayer-js/types";
import { CheckCircle2, Loader2, RotateCcw, ExternalLink, AlertTriangle } from "lucide-react";
import { useWallet } from "@/lib/walletContext";
import { useTransactionTracker, isRetryableStatus } from "@/lib/useTransactionTracker";
import { explorerTxUrl } from "@/lib/config";

const STAGES: TransactionStatus[] = [
  TransactionStatus.PENDING,
  TransactionStatus.PROPOSING,
  TransactionStatus.COMMITTING,
  TransactionStatus.REVEALING,
  TransactionStatus.ACCEPTED,
  TransactionStatus.FINALIZED,
];

const STAGE_LABEL: Record<string, string> = {
  UNINITIALIZED: "Submitted",
  PENDING: "Queued",
  PROPOSING: "Leader proposing",
  COMMITTING: "Validators committing votes",
  REVEALING: "Validators revealing votes",
  ACCEPTED: "Accepted (appeal window open)",
  FINALIZED: "Finalized",
  UNDETERMINED: "Undetermined - no majority reached",
  CANCELED: "Canceled",
  VALIDATORS_TIMEOUT: "Validators timed out",
  LEADER_TIMEOUT: "Leader timed out",
  APPEAL_COMMITTING: "Appeal: committing",
  APPEAL_REVEALING: "Appeal: revealing",
  READY_TO_FINALIZE: "Ready to finalize",
};

function stageIndex(status: TransactionStatus | null): number {
  if (!status) return -1;
  return STAGES.indexOf(status);
}

export function TransactionLifecycle({
  hash,
  onRetry,
  retryLabel = "Retry",
}: {
  hash: string;
  onRetry?: () => void;
  retryLabel?: string;
}) {
  const { client } = useWallet();
  const { status, tx, elapsedMs, polling } = useTransactionTracker(client, hash);
  const seconds = Math.floor(elapsedMs / 1000);
  const retryable = isRetryableStatus(status);
  const idx = stageIndex(status);

  const votes = tx?.lastRound?.validatorVotesName;

  return (
    <div className="rounded-lg border border-line bg-bg-raised p-5" aria-live="polite">
      <div className="mb-4 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
          Transaction status
        </span>
        <span className="text-xs text-ink-faint">{polling ? `${seconds}s elapsed` : "settled"}</span>
      </div>

      {!retryable && status !== TransactionStatus.CANCELED && (
        <ol className="mb-4 flex flex-wrap gap-2">
          {STAGES.map((stage, i) => {
            const reached = idx >= i;
            const active = idx === i && polling;
            return (
              <li
                key={stage}
                className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
                  reached ? "bg-accent text-bg" : "bg-bg text-ink-faint"
                }`}
              >
                {active && <Loader2 size={12} className="animate-spin" aria-hidden="true" />}
                {STAGE_LABEL[stage]}
              </li>
            );
          })}
        </ol>
      )}

      {status && (
        <p className="mb-3 flex items-center gap-2 text-sm font-medium text-ink">
          {status === TransactionStatus.FINALIZED && (
            <CheckCircle2 size={16} className="text-success" aria-hidden="true" />
          )}
          {retryable && <AlertTriangle size={16} className="text-pending" aria-hidden="true" />}
          {STAGE_LABEL[status] ?? status}
        </p>
      )}

      {status === TransactionStatus.ACCEPTED && (
        <p className="mb-3 text-xs text-ink-soft">
          Accepted means validators reached consensus, but the result can still change until
          the appeal window closes and it reaches <strong className="text-ink">Finalized</strong>.
        </p>
      )}

      {retryable && (
        <div className="mb-3 rounded-md border border-pending bg-pending-bg p-3 text-pending">
          <p className="text-sm">
            Validators did not reach a majority. <strong>Nothing was written on-chain</strong> - this is a normal, retryable outcome, not an error.
          </p>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="mt-2 flex items-center gap-1.5 rounded-md bg-pending px-3 py-1.5 text-xs font-semibold text-bg"
            >
              <RotateCcw size={13} aria-hidden="true" /> {retryLabel}
            </button>
          )}
        </div>
      )}

      {votes && votes.length > 0 && (
        <div className="mb-3 text-xs text-ink-soft">
          <span className="font-semibold text-ink-faint">Validator votes: </span>
          {votes.join(", ")}
        </div>
      )}

      <a
        href={explorerTxUrl(hash)}
        target="_blank"
        rel="noopener noreferrer"
        className="flex w-fit items-center gap-1 text-xs font-medium text-accent hover:underline"
      >
        View in explorer <ExternalLink size={12} aria-hidden="true" />
      </a>
    </div>
  );
}
