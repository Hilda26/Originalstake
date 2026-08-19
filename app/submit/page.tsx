"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Search } from "lucide-react";
import { ContractGate } from "@/components/ContractGate";
import { EmptyState } from "@/components/EmptyState";
import { TransactionLifecycle } from "@/components/TransactionLifecycle";
import { WalletPanel } from "@/components/WalletPanel";
import { useWallet } from "@/lib/walletContext";
import { submitEntry, getSubmissionCount, searchSimilar } from "@/lib/contractCalls";
import { validateSubmissionText, validateBondAmount, classifyError } from "@/lib/errors";
import { parseGenToWei, MAX_TEXT_LEN, type SearchResult } from "@/lib/submission";
import { addPendingTx, type PendingTxArg } from "@/lib/pendingTx";
import { getReadOnlyClient } from "@/lib/genlayerClient";

const SEARCH_DEBOUNCE_MS = 400;
const SEARCH_MIN_CHARS = 4;

function LiveSimilaritySearch({ text }: { text: string }) {
  const { client } = useWallet();
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    const query = text.trim();
    if (query.length < SEARCH_MIN_CHARS) {
      setResults(null);
      return;
    }
    timer.current = setTimeout(() => {
      const activeClient = client ?? getReadOnlyClient();
      setSearching(true);
      searchSimilar(activeClient, query, 5)
        .then(setResults)
        .catch(() => setResults(null))
        .finally(() => setSearching(false));
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [text, client]);

  if (text.trim().length < SEARCH_MIN_CHARS) return null;

  return (
    <div className="rounded-md border border-line bg-bg-raised p-3 text-xs text-ink-soft">
      <div className="mb-1.5 flex items-center gap-1.5 font-semibold text-ink">
        <Search size={13} className="text-accent" aria-hidden="true" />
        Has anything like this already been submitted?
      </div>
      {searching && <p>Searching the corpus…</p>}
      {!searching && results && results.length === 0 && <p>Nothing similar found yet - looks original so far.</p>}
      {!searching && results && results.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {results.map((r) => (
            <li key={r.submission_id}>
              <Link href={`/submission/${r.submission_id}`} className="text-accent underline underline-offset-2">
                #{r.submission_id}
              </Link>{" "}
              <span className="text-ink-faint">({r.status})</span>{" "}
              <span className="line-clamp-1 italic">&ldquo;{r.text}&rdquo;</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Live preview_nearest_neighbor is only meaningful once the text is
// on-chain - the contract's embedding step only runs once text is stored,
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
        description="You'll need a wallet identity to fund the bond - generate a browser wallet in a few seconds, or connect an injected one, from the wallet button above."
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
      // we don't assume success - only used to build a "view it" link once
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

          <LiveSimilaritySearch text={text} />

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
              A challenger must post exactly this amount as their counter-bond - set it to
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
