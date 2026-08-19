// Types and helpers that mirror project-2/contract/originalstake.py exactly.
// Field names below match Submission/Challenge's _to_view() methods in the
// contract — do not rename without updating the contract too.

export type SubmissionStatus = "OPEN" | "CHALLENGED" | "FLAGGED";
export type ChallengeStatus = "OPEN" | "RESOLVED";
export type Band = "SUBSTANTIALLY_SAME" | "DERIVATIVE" | "DISTINCT" | "INCONCLUSIVE" | "";

export interface Submission {
  id: number;
  submitter: string;
  text: string;
  bond: number; // wei-equivalent GEN, u256 -> number
  status: SubmissionStatus;
  created_at: string; // UTC ISO, "Z"-suffixed
  updated_at: string;
  challenge_count: number;
}

export interface Challenge {
  id: number;
  submission_id: number;
  challenger: string;
  counter_bond: number;
  status: ChallengeStatus;
  band: Band;
  neighbor_submission_id: number | null;
  reason: string;
  created_at: string;
  resolved_at: string;
}

export interface NeighborPreview {
  found: boolean;
  neighbor_id: number;
  neighbor_text: string;
}

export const MAX_TEXT_LEN = 400;
export const MAX_REASON_LEN = 300;
export const MAX_PAGE_SIZE = 100;
export const DEFAULT_PAGE_SIZE = 12;

export function normalizeSubmission(raw: unknown): Submission {
  const r = raw as Record<string, unknown>;
  return {
    id: Number(r.id),
    submitter: String(r.submitter ?? ""),
    text: String(r.text ?? ""),
    bond: Number(r.bond ?? 0),
    status: String(r.status ?? "OPEN") as SubmissionStatus,
    created_at: String(r.created_at ?? ""),
    updated_at: String(r.updated_at ?? ""),
    challenge_count: Number(r.challenge_count ?? 0),
  };
}

export function normalizeChallenge(raw: unknown): Challenge {
  const r = raw as Record<string, unknown>;
  return {
    id: Number(r.id),
    submission_id: Number(r.submission_id ?? 0),
    challenger: String(r.challenger ?? ""),
    counter_bond: Number(r.counter_bond ?? 0),
    status: String(r.status ?? "OPEN") as ChallengeStatus,
    band: (r.band === null || r.band === undefined ? "" : String(r.band)) as Band,
    neighbor_submission_id:
      r.neighbor_submission_id === null || r.neighbor_submission_id === undefined
        ? null
        : Number(r.neighbor_submission_id),
    reason: String(r.reason ?? ""),
    created_at: String(r.created_at ?? ""),
    resolved_at: String(r.resolved_at ?? ""),
  };
}

export function normalizeNeighborPreview(raw: unknown): NeighborPreview {
  const r = raw as Record<string, unknown>;
  return {
    found: Boolean(r.found),
    neighbor_id: Number(r.neighbor_id ?? 0),
    neighbor_text: String(r.neighbor_text ?? ""),
  };
}

export function sameAddress(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  return a.toLowerCase() === b.toLowerCase();
}

export interface SubmissionRole {
  isSubmitter: boolean;
  canChallenge: boolean; // connected, not submitter, submission OPEN
}

export function roleFor(sub: Submission, address: string | null): SubmissionRole {
  const isSubmitter = sameAddress(sub.submitter, address);
  return {
    isSubmitter,
    canChallenge: !!address && !isSubmitter && sub.status === "OPEN",
  };
}

export function statusLabel(status: SubmissionStatus): string {
  switch (status) {
    case "OPEN":
      return "Open — challengeable";
    case "CHALLENGED":
      return "Challenge in progress";
    case "FLAGGED":
      return "Flagged — bond forfeited";
  }
}

export function challengeStatusLabel(status: ChallengeStatus): string {
  return status === "OPEN" ? "Awaiting resolution" : "Resolved";
}

// Both SUBSTANTIALLY_SAME and DERIVATIVE mean "challenger wins" per the
// contract's CHALLENGER_WINS_BANDS — kept distinct only for transparency,
// see CONTRACT_STATUS.md and originalstake.py's module docstring.
export const CHALLENGER_WINS_BANDS: Band[] = ["SUBSTANTIALLY_SAME", "DERIVATIVE"];

export function bandLabel(band: Band): string {
  switch (band) {
    case "SUBSTANTIALLY_SAME":
      return "Substantially the same — challenger wins";
    case "DERIVATIVE":
      return "Derivative — challenger wins";
    case "DISTINCT":
      return "Distinct — submitter wins";
    case "INCONCLUSIVE":
      return "Inconclusive — both bonds returned";
    default:
      return "Unresolved";
  }
}

export function bandDescription(band: Band): string {
  switch (band) {
    case "SUBSTANTIALLY_SAME":
      return "The model found the challenged text essentially the same expression as its nearest neighbor. The submitter's bond moves to the challenger; the challenger's counter-bond is returned to them.";
    case "DERIVATIVE":
      return "The model found the challenged text closely reuses the neighbor's specific expression with only partial rewriting. Settlement is identical to SUBSTANTIALLY_SAME: the submitter's bond moves to the challenger.";
    case "DISTINCT":
      return "The model found the challenged text independently written. The challenger's counter-bond moves to the submitter; the submitter's own bond is returned to them.";
    case "INCONCLUSIVE":
      return "The model could not confidently place this pair in any band (or there was no other submission to compare against). Both bonds are returned untouched — neither side is penalized, and the submission stays open to future challenges.";
    default:
      return "";
  }
}

/** wei-like integer -> human GEN string. Contract stores raw u256 amounts. */
export function formatGen(amountWei: number): string {
  const gen = amountWei / 1e18;
  if (amountWei === 0) return "0 GEN";
  if (gen < 0.0001) return `${amountWei} wei`;
  return `${gen.toLocaleString(undefined, { maximumFractionDigits: 4 })} GEN`;
}

export function parseGenToWei(input: string): bigint | null {
  const trimmed = input.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return null;
  const [whole, frac = ""] = trimmed.split(".");
  const fracPadded = (frac + "0".repeat(18)).slice(0, 18);
  try {
    return BigInt(whole) * 10n ** 18n + BigInt(fracPadded || "0");
  } catch {
    return null;
  }
}
