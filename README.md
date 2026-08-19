# OriginalStake

A staked originality-challenge market for short creative text — settled by GenLayer
validator consensus, not a moderator.

**Contract (StudioNet):** [`0x15d23034427f84caECed16F8f21fB58C15B01BE7`](https://explorer-studio.genlayer.com/address/0x15d23034427f84caECed16F8f21fB58C15B01BE7) — public explorer
**Source:** this repo

## What it is

A writer posts a GEN bond and submits a short piece of text — a tagline, a short poem, a
product name. The contract embeds it and inserts it into its own on-chain vector index.
Anyone other than the submitter who believes it's a near-copy of something already stored
can open a challenge by staking a counter-bond exactly equal to the submission's bond. A
permissionless resolution step then deterministically finds the nearest prior submission via
vector search, and a single consensus round compares the two *contract-held* texts for
substantial reuse of creative expression — never just topic or genre. Whoever's wrong loses
their stake to the other side.

## Why this needs GenLayer

Delete GenLayer and someone still has to decide whether a new submission is a genuine
near-copy of existing work. Today that's either nobody (plagiarism goes unchecked) or a
single centralized moderator both sides have to trust blindly. "Did this text substantially
reuse that text's specific expression, not just its subject" is a judgment call — no vector
distance threshold or regex answers it on its own, which is exactly why it's handed to
comparative consensus rather than decided unilaterally by either party or a single model
call.

## How this differs from a delivery-and-judge escrow

There is no client, no freelancer, no delivery step. Both the submitter and the challenger
independently put capital at risk *before* any judgment exists, and either side can be the
one who loses their stake — there's no fixed payer/payee role. The evidence being judged is
never fetched from the outside world: both texts already live in the contract's own storage,
found via a deterministic vector search the contract runs against its own corpus. The
corpus itself is shared, growing state every new submission gets checked against — not an
isolated one-off judgment the way each brief in an escrow-style contract is judged alone.

## How consensus is used

Exactly **one** non-deterministic operation: `gl.nondet.exec_prompt`, wrapped in
`gl.eq_principle.prompt_comparative` — never `prompt_non_comparative`, which would let a
single leader dictate a subjective call unchecked. The judging prompt is a tight rubric
(explicit per-band definitions, explicit "topic isn't infringement" guidance, a locked JSON
contract) so independent validators are likely to converge on their own. Outcomes are banded
into exactly four values, never free-form: `SUBSTANTIALLY_SAME`, `DERIVATIVE`, `DISTINCT`,
`INCONCLUSIVE`. The `VecDB.knn` lookup that finds what gets compared is plain deterministic
vector arithmetic, not part of the nondet budget — a filter, never the verdict.

## Deliberately deterministic

Submission (embed + insert) and challenge (stake validation) are both fully synchronous,
settling in seconds. Only `resolve_challenge` — permissionless, so neither party is ever
blocked waiting on the other — spends the one consensus round. Access control, bond
arithmetic, corpus caps, and pagination are all ordinary deterministic Python; the model is
only ever asked whether two stored texts share expression, never what the contract should do.

## Architecture

```
Next.js (App Router, TypeScript strict, Tailwind)
        │
        │  genlayer-js@1.1.8 — reads and writes share ONE client/identity
        ▼
OriginalStake Intelligent Contract (contract/originalstake.py)
        │
        │  VecDB.knn (deterministic) → gl.eq_principle.prompt_comparative
        ▼
GenLayer StudioNet validators
```

No backend service, no database. The contract is the only source of truth.

## The two-wallet model

Same mechanics as every GenLayer app in this series: an injected wallet (MetaMask/etc.) is
detected automatically, or a browser wallet is generated on first visit and persisted in
`localStorage` under this project's own namespace, with an explicit "not custody-grade"
warning before use, export/import, and an upgrade path to an injected wallet later. There is
exactly one `client` identity used for both reads and writes.

## Contract surface

13 methods (10 view / 3 write). `submit(text)` [payable], `challenge(submission_id)`
[payable, counter-bond must exactly equal the submission's bond], `resolve_challenge(id)`
[permissionless, the single nondet round]. Full design rationale, bond policy, and the exact
treatment of each band: [`CONTRACT_STATUS.md`](CONTRACT_STATUS.md). Idea selection and gate
analysis against 9 candidates, including an explicit confirmation of how this differs in
*shape* — not just label — from this series' first project:
[`DECISION_RECORD.md`](DECISION_RECORD.md). Frontend build notes:
[`FRONTEND_STATUS.md`](FRONTEND_STATUS.md).

## Setup

```bash
npm install
cp .env.example .env.local   # set NEXT_PUBLIC_GENLAYER_CONTRACT_ADDRESS
npm run dev
```

With the address unset, every page renders an honest empty state — no faked data.

```bash
npm run verify-schema   # checks every frontend call site against the deployed schema
```

### Contract

```bash
PYTHONIOENCODING=utf-8 genvm-lint check contract/originalstake.py --json
pytest tests/direct/ -v
gltest tests/integration/ -v -s --network studionet
```

## Measured results (real, not asserted)

- **Lint:** clean.
- **Direct tests:** 39 passed, 0 failed.
- **StudioNet integration:** 2 real tests passed against live consensus. A full-lifecycle
  test found a real stored neighbor via `VecDB.knn` and resolved **`SUBSTANTIALLY_SAME`**,
  with validators correctly identifying a "harbour"/"harbor" spelling variant as
  substantively the same creative expression rather than a false negative. A second test
  confirmed the deterministic no-neighbor path resolves **`INCONCLUSIVE`** with zero nondet
  spend, exactly as designed.

## Honest limits

- Only two real consensus outcomes have been observed live on StudioNet so far
  (`SUBSTANTIALLY_SAME`, and the zero-cost deterministic `INCONCLUSIVE`); `DERIVATIVE`,
  `DISTINCT`, and a genuine model-judged `INCONCLUSIVE` are exercised thoroughly in
  direct-mode tests with mocked responses, not yet independently reproduced live.
- The hosted StudioNet RPC enforces real rate limits (30 requests/minute, 500/hour) that are
  easy to hit while testing or developing against this contract.
- StudioNet balances are simulated — bond/counter-bond settlement arithmetic is proven
  correct in the contract's own state, not against a real EVM value transfer.

## Stack

Next.js (App Router) · TypeScript (strict) · Tailwind · `genlayer-js@1.1.8` · GenLayer
StudioNet · no backend, no database.
