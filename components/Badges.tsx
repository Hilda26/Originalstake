import type { SubmissionStatus, ChallengeStatus, Band } from "@/lib/submission";
import { statusLabel, challengeStatusLabel, bandLabel } from "@/lib/submission";

export function StatusBadge({ status }: { status: SubmissionStatus }) {
  const styles: Record<SubmissionStatus, string> = {
    OPEN: "bg-success-bg text-success",
    CHALLENGED: "bg-pending-bg text-pending",
    FLAGGED: "bg-danger-bg text-danger",
  };
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${styles[status]}`}>
      {statusLabel(status)}
    </span>
  );
}

export function ChallengeStatusBadge({ status }: { status: ChallengeStatus }) {
  const styles: Record<ChallengeStatus, string> = {
    OPEN: "bg-pending-bg text-pending",
    RESOLVED: "bg-bg text-ink-faint",
  };
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${styles[status]}`}>
      {challengeStatusLabel(status)}
    </span>
  );
}

export function BandBadge({ band }: { band: Band }) {
  if (!band) return <span className="text-xs text-ink-faint">Not yet resolved</span>;
  const styles: Record<string, string> = {
    SUBSTANTIALLY_SAME: "bg-danger-bg text-danger",
    DERIVATIVE: "bg-danger-bg text-danger",
    DISTINCT: "bg-success-bg text-success",
    INCONCLUSIVE: "bg-pending-bg text-pending",
  };
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${styles[band] ?? ""}`}>
      {bandLabel(band)}
    </span>
  );
}
