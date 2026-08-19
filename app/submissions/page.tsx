"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { FileText, ChevronLeft, ChevronRight } from "lucide-react";
import { ContractGate } from "@/components/ContractGate";
import { EmptyState, ErrorState } from "@/components/EmptyState";
import { SubmissionListSkeleton } from "@/components/Skeletons";
import { StatusBadge } from "@/components/Badges";
import { useWallet } from "@/lib/walletContext";
import { getReadOnlyClient } from "@/lib/genlayerClient";
import { listSubmissionsPage, getSubmissionCount } from "@/lib/contractCalls";
import { formatGen, DEFAULT_PAGE_SIZE, type Submission } from "@/lib/submission";

function SubmissionsList() {
  const { client } = useWallet();
  const [submissions, setSubmissions] = useState<Submission[] | null>(null);
  const [count, setCount] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    const activeClient = client ?? getReadOnlyClient();
    Promise.all([
      listSubmissionsPage(activeClient, offset, DEFAULT_PAGE_SIZE),
      getSubmissionCount(activeClient),
    ])
      .then(([page, total]) => {
        setSubmissions(page.sort((a, b) => b.id - a.id));
        setCount(total);
      })
      .catch(() => setError("Could not load submissions from the contract."))
      .finally(() => setLoading(false));
  }, [client, offset]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load() only updates state after its async fetch resolves.
    load();
  }, [load]);

  if (loading) return <SubmissionListSkeleton />;
  if (error) {
    return (
      <ErrorState
        title="Couldn't load submissions"
        description={error}
        action={
          <button
            type="button"
            onClick={load}
            className="rounded-md border border-danger px-3 py-1.5 text-xs font-semibold text-danger"
          >
            Try again
          </button>
        }
      />
    );
  }
  if (!submissions || submissions.length === 0) {
    return (
      <EmptyState
        icon={<FileText size={32} aria-hidden="true" />}
        title="No submissions yet"
        description="Nobody has posted a bonded submission on this contract yet. Be the first to submit a short piece of text."
        action={
          <Link href="/submit" className="bg-cta-gradient rounded-md px-4 py-2 text-sm font-semibold text-white">
            Submit a piece
          </Link>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        {submissions.map((sub) => (
          <Link
            key={sub.id}
            href={`/submission/${sub.id}`}
            className="flex flex-col gap-2 rounded-lg border border-line bg-bg-raised p-5 transition-colors hover:border-accent"
          >
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-mono text-ink-faint">#{sub.id}</span>
              <StatusBadge status={sub.status} />
            </div>
            <p className="line-clamp-2 text-sm text-ink">{sub.text}</p>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-faint">
              <span>Bond: {formatGen(sub.bond)}</span>
              <span>Challenges: {sub.challenge_count}</span>
              <span className="font-mono">{sub.submitter.slice(0, 6)}…{sub.submitter.slice(-4)}</span>
            </div>
          </Link>
        ))}
      </div>

      <div className="flex items-center justify-between text-sm text-ink-soft">
        <button
          type="button"
          onClick={() => setOffset((o) => Math.max(0, o - DEFAULT_PAGE_SIZE))}
          disabled={offset === 0}
          className="flex items-center gap-1 rounded-md border border-line px-3 py-1.5 text-xs font-medium disabled:opacity-40"
        >
          <ChevronLeft size={14} aria-hidden="true" /> Previous
        </button>
        <span className="text-xs text-ink-faint">
          {offset + 1}–{Math.min(offset + DEFAULT_PAGE_SIZE, count)} of {count}
        </span>
        <button
          type="button"
          onClick={() => setOffset((o) => o + DEFAULT_PAGE_SIZE)}
          disabled={offset + DEFAULT_PAGE_SIZE >= count}
          className="flex items-center gap-1 rounded-md border border-line px-3 py-1.5 text-xs font-medium disabled:opacity-40"
        >
          Next <ChevronRight size={14} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

export default function SubmissionsPage() {
  return (
    <ContractGate>
      <div className="mx-auto w-full max-w-3xl px-6 py-12">
        <h1 className="font-display mb-2 text-2xl text-ink">Submissions</h1>
        <p className="mb-8 text-sm text-ink-soft">
          Every submission ever posted to this contract, newest first. Reading this page needs
          no wallet.
        </p>
        <SubmissionsList />
      </div>
    </ContractGate>
  );
}
