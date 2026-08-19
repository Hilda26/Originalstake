"use client";

import { useEffect, useState } from "react";
import { isContractConfigured, chainName } from "@/lib/config";
import { getReadOnlyClient } from "@/lib/genlayerClient";
import { getSubmissionCount, getChallengeCount, listChallengesPage } from "@/lib/contractCalls";

interface Stats {
  submissions: number;
  challenges: number;
  resolved: number;
}

// Read-only browsing without any wallet connected, per the design spec —
// a visitor should be able to see real on-chain state before connecting.
export function LandingStats() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isContractConfigured) return;
    let cancelled = false;
    const client = getReadOnlyClient();
    (async () => {
      const [submissions, challengeCount] = await Promise.all([
        getSubmissionCount(client),
        getChallengeCount(client),
      ]);
      const challenges = await listChallengesPage(client, 0, 100);
      const resolved = challenges.filter((c) => c.status === "RESOLVED").length;
      if (!cancelled) setStats({ submissions, challenges: challengeCount, resolved });
    })().catch(() => !cancelled && setError("Could not reach the contract right now."));
    return () => {
      cancelled = true;
    };
  }, []);

  if (!isContractConfigured) {
    return (
      <p className="text-sm text-ink-soft">
        No contract is configured for <strong className="text-ink">{chainName}</strong> yet —
        stats will appear here once one is deployed and set in the environment.
      </p>
    );
  }

  if (error) return <p className="text-sm text-danger">{error}</p>;

  if (stats === null) {
    return (
      <div className="flex gap-8" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-10 w-24 animate-pulse rounded-sm bg-line" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-10 text-sm text-ink-soft">
      <Stat label="Submissions on chain" value={stats.submissions} />
      <Stat label="Challenges opened" value={stats.challenges} />
      <Stat label="Challenges resolved" value={stats.resolved} />
      <span className="self-center text-xs text-ink-faint">live from the contract on {chainName}</span>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="font-display text-2xl text-ink">{value}</div>
      <div className="text-xs uppercase tracking-wide text-ink-faint">{label}</div>
    </div>
  );
}
