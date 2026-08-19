"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ContractGate } from "@/components/ContractGate";
import { ErrorState } from "@/components/EmptyState";
import { getReadOnlyClient } from "@/lib/genlayerClient";
import { getTrackRecord } from "@/lib/contractCalls";
import type { TrackRecord } from "@/lib/submission";

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-line bg-bg-raised p-4">
      <dt className="text-xs text-ink-faint">{label}</dt>
      <dd className="font-display mt-1 text-2xl text-ink">{value}</dd>
    </div>
  );
}

function TrackRecordView({ address }: { address: string }) {
  const [rec, setRec] = useState<TrackRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    getTrackRecord(getReadOnlyClient(), address)
      .then(setRec)
      .catch(() => setError("Could not load a track record for this address."))
      .finally(() => setLoading(false));
  }, [address]);

  if (loading) return <p className="text-sm text-ink-soft">Loading track record…</p>;
  if (error || !rec) return <ErrorState title="Couldn't load track record" description={error ?? "Unknown error."} />;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display mb-1 text-2xl text-ink">Track record</h1>
        <p className="font-mono text-xs text-ink-faint">{rec.address}</p>
      </div>
      <p className="max-w-xl text-xs leading-relaxed text-ink-soft">
        This market&apos;s own credibility signal - deterministic counters updated only inside
        resolve_challenge / expire_stale_challenge, with no privileged editor entry point. It is
        not a score, just a plain tally of what this address has actually done on-chain.
      </p>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Submissions made" value={rec.submissions_made} />
        <Stat label="Times flagged as submitter" value={rec.times_flagged} />
        <Stat label="Challenges opened" value={rec.challenges_opened} />
        <Stat label="Challenges won" value={rec.challenges_won} />
        <Stat label="Challenges lost" value={rec.challenges_lost} />
      </dl>
    </div>
  );
}

export default function TrackRecordPage() {
  const params = useParams();
  const addressRaw = Array.isArray(params.address) ? params.address[0] : params.address;

  return (
    <ContractGate>
      <div className="mx-auto w-full max-w-2xl px-6 py-12">
        <Link href="/submissions" className="mb-6 flex items-center gap-1.5 text-xs font-medium text-ink-faint hover:text-ink">
          <ArrowLeft size={13} aria-hidden="true" /> Back to submissions
        </Link>
        {addressRaw ? (
          <TrackRecordView address={addressRaw} />
        ) : (
          <ErrorState title="Invalid address" description="No address was given in this URL." />
        )}
      </div>
    </ContractGate>
  );
}
