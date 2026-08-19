"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { ContractGate } from "@/components/ContractGate";
import { EmptyState } from "@/components/EmptyState";
import { TransactionLifecycle } from "@/components/TransactionLifecycle";
import { WalletPanel } from "@/components/WalletPanel";
import { useWallet } from "@/lib/walletContext";
import { submitEntry, getSubmissionCount } from "@/lib/contractCalls";
import { validateSubmissionText, validateBondAmount, classifyError } from "@/lib/errors";
import { parseGenToWei, MAX_TEXT_LEN } from "@/lib/submission";
import { addPendingTx, type PendingTxArg } from "@/lib/pendingTx";

// Live preview_nearest_neighbor is only meaningful once the text is
// on-chain — the contract's embedding step only runs once text is stored,
// so there is no honest client-side way to preview a neighbor before
// submitting. Instead this form points the writer at the real
// preview_nearest_neighbor view on the submission-detail page once the
// submission exists, before they'd spend GEN opening a challenge on it.

function SubmitForm() {
  const { client, address } = useWallet();
  const router = useRouter();
  const [text, setText] = useState("");
  const [amount, setAmount] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [hash, setHash] = useState<string | null>(null);
  const [newSubmissionId, setNewSubmissionId] = useState<number | null>(null);
  const [pending, setPending] = useState(false);

  if (!address || !client) {
    return (
      <EmptyState
        title="Connect a wallet to submit"
        description="You'll need a wallet identity to fund the bond — generate a browser wallet in a few seconds, or connect an injected one, from the wallet button above."
        action={<WalletPanel />}
      />
    );
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    setValidationError(null);

    const textError = validateSubmissionText(text);
    if (textError) {
      setValidationError(textError);
      return;
    }
    const weiAmount = parseGenToWei(amount);
    const amountError = validateBondAmount(weiAmount);
    if (amountError) {
      setValidationError(amountError);
      return;
    }

    setPending(true);
    try {
      const countBefore = await getSubmissionCount(client!).catch(() => null);
      const txHash = await submitEntry(client!, text, weiAmount as bigint);
      setHash(txHash);
      const args: PendingTxArg[] = [text];
      addPendingTx({
        hash: txHash,
        functionName: "submit",
        args,
        valueWei: (weiAmount as bigint).toString(),
        submissionId: null,
        challengeId: null,
        submittedAt: new Date().toISOString(),
        label: "Posting submission",
      });
      // The new id is deterministic (next_submission_id at call time), but
      // we don't assume success — only used to build a "view it" link once
      // the write is confirmed to have actually landed, never shown as fact
      // before that.
      if (countBefore !== null) setNewSubmissionId(countBefore);
    } catch (err) {
      setSubmitError(classifyError(err).message);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-12">
      <h1 className="font-display mb-2 text-2xl text-ink">Submit a piece</h1>
      <p className="mb-8 text-sm text-ink-soft">
        Post a short piece of text (max {MAX_TEXT_LEN} characters) with a GEN bond. Anyone other
        than you can later stake an equal counter-bond to challenge it as a near-copy of
        something already stored on the contract.
      </p>

      {!hash && (
        <form onSubmit={onSubmit} className="flex flex-col gap-5">
          <div>
            <label htmlFor="text" className="mb-1.5 block text-sm font-medium text-ink">
              Text
            </label>
            <textarea
              id="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={6}
              maxLength={MAX_TEXT_LEN}
              placeholder='e.g. a tagline, a short poem, a product name'
              className="w-full rounded-md border border-line bg-bg-raised px-3 py-2 text-sm text-ink"
            />
            <div className="mt-1 text-right text-xs text-ink-faint">
              {text.length}/{MAX_TEXT_LEN}
            </div>
          </div>

          <div className="flex items-start gap-2 rounded-md border border-line bg-bg-raised p-3 text-xs text-ink-soft">
            <Search size={14} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" />
            <p>
              This form can&apos;t check your draft against the on-chain corpus before you
              submit — the contract&apos;s embedding step only runs once your text is stored.
              Once it&apos;s posted, use <strong className="text-ink">preview nearest neighbor</strong> on
              the submission page to see what a challenge would compare it against, before
              anyone spends GEN opening one.
            </p>
          </div>

          <div>
            <label htmlFor="amount" className="mb-1.5 block text-sm font-medium text-ink">
              Bond (GEN)
            </label>
            <input
              id="amount"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="1.0"
              className="w-full rounded-md border border-line bg-bg-raised px-3 py-2 text-sm text-ink"
            />
            <p className="mt-1 text-xs text-ink-soft">
              A challenger must post exactly this amount as their counter-bond — set it to
              something you&apos;d be comfortable losing if a challenge succeeds.
            </p>
          </div>

          {validationError && <p className="text-sm text-danger">{validationError}</p>}
          {submitError && <p className="text-sm text-danger">{submitError}</p>}

          <button
            type="submit"
            disabled={pending}
            className="bg-cta-gradient self-start rounded-md px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {pending ? "Sending transaction…" : "Fund and submit"}
          </button>
        </form>
      )}

      {hash && (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-ink-soft">
            Your submission is on its way through consensus. This is a deterministic write (no
            model call) so it typically settles quickly.
          </p>
          <TransactionLifecycle hash={hash} />
          <div className="flex gap-3">
            {newSubmissionId !== null && (
              <button
                type="button"
                onClick={() => router.push(`/submission/${newSubmissionId}`)}
                className="rounded-md border border-line px-4 py-2 text-sm font-semibold hover:border-accent"
              >
                View submission #{newSubmissionId}
              </button>
            )}
            <button
              type="button"
              onClick={() => router.push("/submissions")}
              className="rounded-md border border-line px-4 py-2 text-sm font-semibold hover:border-accent"
            >
              Go to submissions list
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function SubmitPage() {
  return (
    <ContractGate>
      <SubmitForm />
    </ContractGate>
  );
}
