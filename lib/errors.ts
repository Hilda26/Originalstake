// The contract raises gl.vm.UserError with a leading prefix:
// EXPECTED / EXTERNAL / TRANSIENT / LLM_ERROR (see contract/originalstake.py
// - grep for `gl.vm.UserError` there for the exact strings used). The RPC
// error message carries that prefix through to the frontend. Map each to a
// distinct, actionable message rather than one generic failure.
//
// Note: this contract never fetches anything external (no web.render), so
// EXTERNAL/TRANSIENT don't actually occur in this contract's own raises
// today, but the classifier still handles them for forward-compatibility
// and because genlayer-js/RPC-level failures can still surface those shapes.

export type ErrorPrefix = "EXPECTED" | "EXTERNAL" | "TRANSIENT" | "LLM_ERROR" | "UNKNOWN";

export interface ClassifiedError {
  prefix: ErrorPrefix;
  message: string;
  raw: string;
  retryable: boolean;
}

export function classifyError(err: unknown): ClassifiedError {
  const raw = extractMessage(err);

  if (/EXPECTED\s*:/.test(raw)) {
    return { prefix: "EXPECTED", message: stripPrefix(raw, "EXPECTED"), raw, retryable: false };
  }
  if (/EXTERNAL\s*:/.test(raw)) {
    return {
      prefix: "EXTERNAL",
      message: `A dependency outside the contract failed: ${stripPrefix(raw, "EXTERNAL")}`,
      raw,
      retryable: true,
    };
  }
  if (/TRANSIENT\s*:/.test(raw)) {
    return {
      prefix: "TRANSIENT",
      message: `A temporary condition prevented this: ${stripPrefix(raw, "TRANSIENT")}`,
      raw,
      retryable: true,
    };
  }
  if (/LLM_ERROR\s*:/.test(raw)) {
    return {
      prefix: "LLM_ERROR",
      message: `The model's response could not be used: ${stripPrefix(raw, "LLM_ERROR")}`,
      raw,
      retryable: true,
    };
  }
  return { prefix: "UNKNOWN", message: raw || "Something went wrong.", raw, retryable: true };
}

function stripPrefix(raw: string, prefix: string): string {
  const idx = raw.indexOf(`${prefix}:`);
  if (idx === -1) return raw;
  return raw.slice(idx + prefix.length + 1).trim();
}

function extractMessage(err: unknown): string {
  if (typeof err === "string") return err;
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object") {
    const anyErr = err as { message?: unknown; shortMessage?: unknown; details?: unknown };
    return String(anyErr.shortMessage ?? anyErr.message ?? anyErr.details ?? JSON.stringify(err));
  }
  return String(err);
}

// Client-side pre-checks that mirror the contract's EXPECTED guards, so a
// doomed transaction is never sent in the first place. MAX_TEXT_LEN = 400,
// read directly from contract/originalstake.py.
export function validateSubmissionText(text: string): string | null {
  if (text.trim().length === 0) return "Write something before submitting.";
  if (text.length > 400) return "Text exceeds the 400-character max.";
  return null;
}

export function validateBondAmount(weiOrNull: bigint | null): string | null {
  if (weiOrNull === null) return "Enter a valid amount, e.g. 1.0";
  if (weiOrNull <= 0n) return "A submission must be funded with a positive GEN bond.";
  return null;
}
