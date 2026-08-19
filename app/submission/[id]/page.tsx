"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, RefreshCw, Search, Info } from "lucide-react";
import { ContractGate } from "@/components/ContractGate";
import { SubmissionDetailSkeleton } from "@/components/Skeletons";
import { ErrorState } from "@/components/EmptyState";
import { StatusBadge, ChallengeStatusBadge, BandBadge } from "@/components/Badges";
import { TransactionLifecycle } from "@/components/TransactionLifecycle";
import { WalletPanel } from "@/components/WalletPanel";
import { useWallet } from "@/lib/walletContext";
import { getReadOnlyClient } from "@/lib/genlayerClient";
import {
  getSubmission,
  listChallengesForSubmission,
  previewNearestNeighbor,
  openChallenge,
  resolveChallenge,
} from "@/lib/contractCalls";
import {
  roleFor,
  formatGen,
  bandDescription,
  type Submission,
  type Challenge,
  type NeighborPreview,
} from "@/lib/submission";
import { classifyError } from "@/lib/errors";
import { addPendingTx, pendingTxForSubmission, type PendingTx, type PendingTxArg } from "@/lib/pendingTx";

function numberArg(args: PendingTxArg[] | undefined, i: number): number | null {
  const v = args?.[i];
  return typeof v === "number" ? v : null;
}

function SubmissionDetail({ id }: { id: number }) {
  const { client, address } = useWallet();
  const [sub, setSub] = useState<Submission | null>(null);
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [neighbor, setNeighbor] = useState<NeighborPreview | null>(null);
  const [neighborLoading, setNeighborLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionHash, setActionHash] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [lastAction, setLastAction] = useState<{
    functionName: string;
    args: PendingTxArg[];
    fn: () => Promise<`0x${string}`>;
  } | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    const activeClient = client ?? getReadOnlyClient();
    getSubmission(activeClient, id)
      .then(async (s) => {
        setSub(s);
        const chs = await listChallengesForSubmission(activeClient, id).catch(() => []);
        setChallenges(chs.sort((a, b) => b.id - a.id));
      })
      .catch(() => setError("This submission could not be loaded — it may not exist on this contract."))
      .finally(() => setLoading(false));
  }, [client, id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load() only updates state after its async fetch resolves.
    load();
  }, [load]);

  const loadNeighborPreview = useCallback(() => {
    const activeClient = client ?? getReadOnlyClient();
    setNeighborLoading(true);
    previewNearestNeighbor(activeClient, id)
      .then(setNeighbor)
      .catch(() => setNeighbor(null))
      .finally(() => setNeighborLoading(false));
  }, [client, id]);

  const role = sub ? roleFor(sub, address) : null;
  const openTx = pendingTxForSubmission(id);

  async function runAction(
    functionName: string,
    args: PendingTxArg[],
    fn: () => Promise<`0x${string}`>,
    busyKey = functionName,
    valueWei?: bigint,
  ) {
    setActionError(null);
    setBusy(busyKey);
    setLastAction({ functionName, args, fn });
    try {
      const hash = await fn();
      setActionHash(hash);
      addPendingTx({
        hash,
        functionName,
        args,
        valueWei: valueWei?.toString(),
        submissionId: id,
        challengeId: functionName === "resolve_challenge" ? numberArg(args, 0) : null,
        submittedAt: new Date().toISOString(),
        label: functionName,
      });
    } catch (err) {
      setActionError(classifyError(err).message);
    } finally {
      setBusy(null);
    }
  }

  function retryLastAction() {
    if (!lastAction) return;
    runAction(lastAction.functionName, lastAction.args, lastAction.fn);
  }

  function retryLabelFor(name: string | undefined): string {
    if (!name) return "Retry";
    if (name === "challenge") return "Retry challenge";
    if (name === "resolve_challenge") return "Retry resolution";
    return "Retry";
  }

  function retryStoredTx(tx: PendingTx) {
    if (!client) {
      setActionError("Connect a wallet before retrying this transaction.");
      return;
    }
    if (!tx.args) {
      setActionError(
        "This restored transaction was saved before retry arguments were persisted. Use the visible action controls to submit it again.",
      );
      return;
    }
    switch (tx.functionName) {
      case "challenge": {
        const submissionId = numberArg(tx.args, 0);
        if (submissionId === null || !tx.valueWei) break;
        const value = BigInt(tx.valueWei);
        runAction("challenge", [submissionId], () => openChallenge(client, submissionId, value), "challenge", value);
        return;
      }
      case "resolve_challenge": {
        const challengeId = numberArg(tx.args, 0);
        if (challengeId === null) break;
        runAction(
          "resolve_challenge",
          [challengeId],
          () => resolveChallenge(client, challengeId),
          `resolve_${challengeId}`,
        );
        return;
      }
    }
    setActionError("Stored transaction arguments are incomplete; cannot retry this action.");
  }

  if (loading) return <SubmissionDetailSkeleton />;
  if (error || !sub) {
    return (
      <ErrorState
        title="Couldn't load this submission"
        description={error ?? "Unknown error."}
        action={
          <button
            type="button"
            onClick={load}
            className="flex items-center gap-1.5 rounded-md border border-danger px-3 py-1.5 text-xs font-semibold text-danger"
          >
            <RefreshCw size={13} aria-hidden="true" /> Try again
          </button>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center justify-between">
        <Link href="/submissions" className="flex items-center gap-1.5 text-xs font-medium text-ink-faint hover:text-ink">
          <ArrowLeft size={13} aria-hidden="true" /> Back to submissions
        </Link>
        <button
          type="button"
          onClick={load}
          className="flex items-center gap-1.5 text-xs font-medium text-ink-faint hover:text-ink"
        >
          <RefreshCw size={13} aria-hidden="true" /> Refresh
        </button>
      </div>

      <div>
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <span className="text-xs font-mono text-ink-faint">Submission #{sub.id}</span>
          <StatusBadge status={sub.status} />
        </div>
        <p className="mb-4 whitespace-pre-wrap rounded-lg border border-line bg-bg-raised p-5 text-base leading-relaxed text-ink">
          {sub.text}
        </p>
        <dl className="grid grid-cols-2 gap-4 text-xs text-ink-soft sm:grid-cols-4">
          <div>
            <dt className="text-ink-faint">Submitter</dt>
            <dd className="font-mono text-ink">{sub.submitter.slice(0, 8)}…{sub.submitter.slice(-6)}</dd>
          </div>
          <div>
            <dt className="text-ink-faint">Bond</dt>
            <dd className="text-ink">{formatGen(sub.bond)}</dd>
          </div>
          <div>
            <dt className="text-ink-faint">Challenges</dt>
            <dd className="text-ink">{sub.challenge_count}</dd>
          </div>
          <div>
            <dt className="text-ink-faint">Last updated</dt>
            <dd className="text-ink">{sub.updated_at || "—"}</dd>
          </div>
        </dl>
      </div>

      {/* Nearest-neighbor preview -- surfaced prominently so a would-be
          challenger can see what they'd be betting against before spending GEN. */}
      <div className="rounded-lg border border-line bg-bg-raised p-5">
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink">
          <Search size={15} className="text-accent" aria-hidden="true" />
          Preview nearest neighbor
        </div>
        <p className="mb-3 text-xs text-ink-soft">
          Read-only view of the same deterministic vector search resolve_challenge would run —
          see what a challenge would compare this text against, at zero cost.
        </p>
        {!neighbor && (
          <button
            type="button"
            onClick={loadNeighborPreview}
            disabled={neighborLoading}
            className="rounded-md border border-line px-3 py-1.5 text-xs font-semibold hover:border-accent disabled:opacity-50"
          >
            {neighborLoading ? "Searching corpus…" : "Preview nearest neighbor"}
          </button>
        )}
        {neighbor && !neighbor.found && (
          <p className="text-xs text-ink-soft">
            No other submission exists in the corpus yet — a challenge right now would resolve
            INCONCLUSIVE with no model call spent.
          </p>
        )}
        {neighbor && neighbor.found && (
          <div className="flex flex-col gap-2">
            <p className="text-xs text-ink-faint">
              Nearest stored neighbor: submission{" "}
              <Link href={`/submission/${neighbor.neighbor_id}`} className="text-accent underline underline-offset-2">
                #{neighbor.neighbor_id}
              </Link>
            </p>
            <p className="whitespace-pre-wrap rounded-md border border-line bg-bg p-3 text-sm text-ink-soft">
              {neighbor.neighbor_text}
            </p>
          </div>
        )}
      </div>

      {/* Role-aware actions */}
      {!address && (
        <div className="rounded-lg border border-line bg-bg-raised p-5 text-sm text-ink-soft">
          Connect a wallet to challenge this submission or resolve an open challenge.
          <div className="mt-3">
            <WalletPanel />
          </div>
        </div>
      )}

      {address && role?.canChallenge && client && (
        <ChallengePanel
          submissionId={sub.id}
          bond={sub.bond}
          busy={busy}
          onSubmit={(valueWei) =>
            runAction("challenge", [sub.id], () => openChallenge(client, sub.id, valueWei), "challenge", valueWei)
          }
        />
      )}

      {address && role?.isSubmitter && sub.status === "OPEN" && (
        <div className="flex items-center gap-2 rounded-lg border border-line bg-bg-raised p-4 text-xs text-ink-soft">
          <Info size={14} className="shrink-0 text-accent" aria-hidden="true" />
          You submitted this piece — you can&apos;t challenge your own submission.
        </div>
      )}

      {actionError && <p className="text-sm text-danger">{actionError}</p>}

      {actionHash && (
        <TransactionLifecycle hash={actionHash} onRetry={retryLastAction} retryLabel={retryLabelFor(lastAction?.functionName)} />
      )}

      {openTx.length > 0 && (
        <div className="flex flex-col gap-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
            Resumed in-flight transaction
          </h3>
          <TransactionLifecycle
            hash={openTx[0].hash}
            onRetry={() => retryStoredTx(openTx[0])}
            retryLabel={retryLabelFor(openTx[0].functionName)}
          />
        </div>
      )}

      {/* Challenges list */}
      <div>
        <h2 className="font-display mb-4 text-xl text-ink">
          Challenges {challenges.length > 0 && `(${challenges.length})`}
        </h2>
        {challenges.length === 0 && <p className="text-sm text-ink-soft">No challenges have been opened yet.</p>}
        <div className="flex flex-col gap-4">
          {challenges.map((ch) => (
            <div key={ch.id} className="rounded-lg border border-line bg-bg-raised p-5">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-mono text-ink-faint">Challenge #{ch.id}</span>
                <ChallengeStatusBadge status={ch.status} />
              </div>
              <dl className="mb-3 grid grid-cols-2 gap-3 text-xs text-ink-soft sm:grid-cols-3">
                <div>
                  <dt className="text-ink-faint">Challenger</dt>
                  <dd className="font-mono text-ink">{ch.challenger.slice(0, 8)}…{ch.challenger.slice(-6)}</dd>
                </div>
                <div>
                  <dt className="text-ink-faint">Counter-bond</dt>
                  <dd className="text-ink">{formatGen(ch.counter_bond)}</dd>
                </div>
                {ch.neighbor_submission_id !== null && (
                  <div>
                    <dt className="text-ink-faint">Compared against</dt>
                    <dd>
                      <Link href={`/submission/${ch.neighbor_submission_id}`} className="text-accent underline underline-offset-2">
                        #{ch.neighbor_submission_id}
                      </Link>
                    </dd>
                  </div>
                )}
              </dl>

              {ch.status === "OPEN" && client && (
                <button
                  type="button"
                  onClick={() =>
                    runAction("resolve_challenge", [ch.id], () => resolveChallenge(client, ch.id), `resolve_${ch.id}`)
                  }
                  disabled={busy === `resolve_${ch.id}`}
                  className="bg-cta-gradient rounded-md px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
                >
                  {busy === `resolve_${ch.id}` ? "Resolving…" : "Resolve challenge"}
                </button>
              )}
              {ch.status === "OPEN" && !client && (
                <p className="text-xs text-ink-soft">Connect a wallet to trigger resolution — resolving is permissionless.</p>
              )}

              {ch.status === "RESOLVED" && (
                <div className="flex flex-col gap-2">
                  <BandBadge band={ch.band} />
                  <p className="text-xs leading-relaxed text-ink-soft">{bandDescription(ch.band)}</p>
                  {ch.reason && (
                    <p className="rounded-md border border-line bg-bg p-3 text-xs italic leading-relaxed text-ink-soft">
                      &ldquo;{ch.reason}&rdquo;
                    </p>
                  )}
                  <p className="text-xs text-ink-faint">Resolved {ch.resolved_at}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ChallengePanel({
  submissionId,
  bond,
  busy,
  onSubmit,
}: {
  submissionId: number;
  bond: number;
  busy: string | null;
  onSubmit: (valueWei: bigint) => void;
}) {
  const { client } = useWallet();
  const [neighbor, setNeighbor] = useState<NeighborPreview | null | "loading">(null);

  useEffect(() => {
    if (!client) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- kicking off a new async fetch when submissionId/client changes.
    setNeighbor("loading");
    previewNearestNeighbor(client, submissionId)
      .then(setNeighbor)
      .catch(() => setNeighbor(null));
  }, [client, submissionId]);

  return (
    <div className="rounded-lg border border-accent/40 bg-bg-raised p-5">
      <h3 className="mb-2 text-sm font-semibold text-ink">Challenge this submission</h3>
      <p className="mb-3 text-xs text-ink-soft">
        Opening a challenge requires staking a counter-bond of exactly{" "}
        <strong className="text-ink">{formatGen(bond)}</strong> — the submission&apos;s own bond. If
        resolution finds the text DISTINCT or INCONCLUSIVE, you could lose this stake (DISTINCT)
        or get it back untouched (INCONCLUSIVE).
      </p>
      {neighbor === "loading" && <p className="mb-3 text-xs text-ink-faint">Checking nearest neighbor…</p>}
      {neighbor && neighbor !== "loading" && neighbor.found && (
        <div className="mb-3 rounded-md border border-line bg-bg p-3 text-xs text-ink-soft">
          <span className="font-semibold text-ink-faint">Before you commit:</span> resolution
          would compare this against submission #{neighbor.neighbor_id}, currently reading:
          <p className="mt-1 line-clamp-3 italic text-ink-soft">&ldquo;{neighbor.neighbor_text}&rdquo;</p>
        </div>
      )}
      {neighbor && neighbor !== "loading" && !neighbor.found && (
        <p className="mb-3 text-xs text-ink-soft">
          No other submission exists in the corpus right now — resolving now would settle
          INCONCLUSIVE with no model call.
        </p>
      )}
      <button
        type="button"
        onClick={() => onSubmit(BigInt(bond))}
        disabled={busy === "challenge"}
        className="bg-cta-gradient rounded-md px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
      >
        {busy === "challenge" ? "Sending challenge…" : `Stake ${formatGen(bond)} and challenge`}
      </button>
    </div>
  );
}

export default function SubmissionPage() {
  const params = useParams();
  const idRaw = Array.isArray(params.id) ? params.id[0] : params.id;
  const id = Number(idRaw);

  return (
    <ContractGate>
      <div className="mx-auto w-full max-w-2xl px-6 py-12">
        {Number.isFinite(id) ? (
          <SubmissionDetail id={id} />
        ) : (
          <ErrorState title="Invalid submission id" description="The id in this URL isn't a valid number." />
        )}
      </div>
    </ContractGate>
  );
}
