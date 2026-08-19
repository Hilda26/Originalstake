# OriginalStake

A staked originality-challenge market for short creative text - settled by GenLayer
validator consensus, not a moderator.

**Live app:** https://originalstake.vercel.app
**Contract (StudioNet):** [`0xE60f324647039470065A263d709550Ec5D07C248`](https://explorer-studio.genlayer.com/address/0xE60f324647039470065A263d709550Ec5D07C248) - public explorer (v2, current deployment)
**Source:** this repo

## What it is

A writer posts a GEN bond and submits a short piece of text - a tagline, a short poem, a
product name. The contract embeds it and inserts it into its own on-chain vector index.
Anyone other than the submitter who believes it's a near-copy of something already stored
can open a challenge by staking a counter-bond exactly equal to the submission's bond. A
permissionless resolution step then deterministically finds the nearest prior submission via
vector search, and a single consensus round compares the two *contract-held* texts for
substantial reuse of creative expression - never just topic or genre. Whoever's wrong loses
their stake to the other side.

## Why this needs GenLayer

Delete GenLayer and someone still has to decide whether a new submission is a genuine
near-copy of existing work. Today that's either nobody (plagiarism goes unchecked) or a
single centralized moderator both sides have to trust blindly. "Did this text substantially
reuse that text's specific expression, not just its subject" is a judgment call - no vector
distance threshold or regex answers it on its own, which is exactly why it's handed to
comparative consensus rather than decided unilaterally by either party or a single model
call.

## How this differs from a delivery-and-judge escrow

There is no client, no freelancer, no delivery step. Both the submitter and the challenger
independently put capital at risk *before* any judgment exists, and either side can be the
one who loses their stake - there's no fixed payer/payee role. The evidence being judged is
never fetched from the outside world: both texts already live in the contract's own storage,
found via a deterministic vector search the contract runs against its own corpus. The
corpus itself is shared, growing state every new submission gets checked against - not an
isolated one-off judgment the way each brief in an escrow-style contract is judged alone.

## How consensus is used

Exactly **one** non-deterministic operation: `gl.nondet.exec_prompt`, wrapped in
`gl.eq_principle.prompt_comparative` - never `prompt_non_comparative`, which would let a
single leader dictate a subjective call unchecked. The judging prompt is a tight rubric
(explicit per-band definitions, explicit "topic isn't infringement" guidance, a locked JSON
contract) so independent validators are likely to converge on their own. Outcomes are banded
into exactly four values, never free-form: `SUBSTANTIALLY_SAME`, `DERIVATIVE`, `DISTINCT`,
`INCONCLUSIVE`. The `VecDB.knn` lookup that finds what gets compared is plain deterministic
vector arithmetic, not part of the nondet budget - a filter, never the verdict.

## Deliberately deterministic

Submission (embed + insert) and challenge (stake validation) are both fully synchronous,
settling in seconds. Only `resolve_challenge` - permissionless, so neither party is ever
blocked waiting on the other - spends the one consensus round. Access control, bond
arithmetic, corpus caps, and pagination are all ordinary deterministic Python; the model is
only ever asked whether two stored texts share expression, never what the contract should do.

## Architecture

```
Next.js (App Router, TypeScript strict, Tailwind)
        │
        │  genlayer-js@1.1.8 - reads and writes share ONE client/identity
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

17 methods (12 view / 5 write). `submit(text)` [payable], `challenge(submission_id)`
[payable, counter-bond must exactly equal the submission's bond], `resolve_challenge(id)`
[permissionless, the single nondet round]. **v2 additions:** `search_similar(query_text, k)`
[view - corpus-wide semantic search for arbitrary text, before you even submit],
`add_bounty(submission_id)` [payable, permissionless - crowdfund an incentive for someone
else to challenge a submission], `expire_stale_challenge(challenge_id)` [permissionless -
deterministically settles a challenge nobody resolved within `MAX_CHALLENGE_AGE_SECONDS` as
`INCONCLUSIVE`], `get_track_record(address)` [view - this market's own deterministic
credibility counters]. Full design rationale, bond/bounty policy, and the exact treatment of
each band: [`CONTRACT_STATUS.md`](CONTRACT_STATUS.md). Idea selection and gate analysis
against 9 candidates, including an explicit confirmation of how this differs in *shape* - not
just label - from this series' first project: [`DECISION_RECORD.md`](DECISION_RECORD.md).
Frontend build notes: [`FRONTEND_STATUS.md`](FRONTEND_STATUS.md).

## Setup

```bash
npm install
cp .env.example .env.local   # set NEXT_PUBLIC_GENLAYER_CONTRACT_ADDRESS
npm run dev
```

With the address unset, every page renders an honest empty state - no faked data.

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

*(the following v1 results were observed on the original deployment,
`0x15d23034427f84caECed16F8f21fB58C15B01BE7`, before the v2 contract below - additive,
same design - was deployed to the address above; the v1 contract's core logic is
unchanged in v2, so these results still hold)*

- **Lint:** clean.
- **Direct tests:** 39 passed, 0 failed.
- **StudioNet integration:** 2 real tests passed against live consensus, plus a full live
  walkthrough on the persistent deployed contract - **12/12 transactions `SUCCESS`/`Accepted`,
  zero errors.** A near-verbatim spelling variant ("harbour" vs "harbor") was challenged and
  resolved **`SUBSTANTIALLY_SAME`**: *"The sentences are identical in wording and structure
  except for the trivial spelling variant 'harbor/harbour'."* Bond moved to the challenger. A
  genuinely unrelated submission (a business-revenue sentence, challenged against the lighthouse
  text) resolved **`DISTINCT`**: *"One is a business revenue statement and the other is
  atmospheric lighthouse imagery, with no shared wording, structure, or expressive details."*
  Both bonds returned to their original owners, as designed. The deterministic no-neighbor path
  also independently confirmed **`INCONCLUSIVE`** with zero nondet spend.

## Measured results - v2 (search, bounties, expiry, track record)

- **Lint:** clean (17 methods, 12 view / 5 write; non-determinism budget reconfirmed at
  exactly 1 - none of the four new methods call any nondet primitive).
- **Direct tests:** 68 passed, 0 failed (up from 39) - full coverage of `search_similar`
  (empty/single/multi-entry corpus, `k` clamping and capping, validation), bounties
  (accumulation, payout-on-win with reset, rollover-on-loss, rollover-on-inconclusive, and
  survival across an `INCONCLUSIVE` round into a later win), `expire_stale_challenge` (tested
  strictly-before/exactly-at/strictly-after the threshold via `warp_to`, permissionless
  caller, already-resolved rejection, bounty rollover), and every track-record counter on
  every real code path plus confirmation `expire_stale_challenge` never moves win/loss counts.
- **StudioNet integration:** a new bounty-payout scenario was added exercising `add_bounty`
  and a real consensus round together.

Real observed result: challenger opened against a near-duplicate ("...breaks" vs "...breaks
softly"), `resolve_challenge` ran a live consensus round and resolved **`SUBSTANTIALLY_SAME`**
(*"trivial difference that does not constitute independent creative expression."*) - the
300-wei crowdfunded bounty was paid to the challenger on top of the forfeited bond,
`bounty_pool` read back as **0**, `bounty_total` stayed at **300**. 1 passed in 313.51s.

### Extended live verification on the deployed v2 contract

Four more real scenarios were run directly against `0xE60f324647039470065A263d709550Ec5D07C248`
to build up an honest transaction history and observe bands not yet seen live:

- **`DERIVATIVE`** observed live for the first time, twice: *"Both texts share the same
  parallel 'follow/chase the sunrise, follow/chase your dreams' structure and the 'don't let
  the moment slip away' closing idea, with only synonym substitutions and minor rephrasing
  rather than independent construction"*, and *"It preserves the same comparative proverb
  structure and imagery - small daily steps versus one giant leap - while mainly swapping in
  close synonyms."*
- **Bounty rollover on a loss**, observed live for the first time: a 150-wei bounty
  crowdfunded onto a submission survived untouched (`bounty_pool` unchanged) after a
  challenge against it resolved `DISTINCT` - proving the rollover policy against real
  consensus, not a mock.
- **A genuine model-judged `INCONCLUSIVE`**, observed live for the first time: two single
  common greeting words ("Hi" / "Hey") were submitted and challenged, and real validator
  consensus resolved **`INCONCLUSIVE`**: *"Both texts are single common greeting words too
  short and generic to assess whether one reuses the creative expression of the other."* An
  earlier attempt with slightly longer phrases resolved a confident `DISTINCT` instead -
  reported here too, since a consensus outcome can't be forced and an honest result includes
  the miss alongside the hit.

**Running total: 38 on-chain transactions on the v2 contract, 100% clean** - every `Call`
shows `SUCCESS`/`Accepted`, every payout `Send` shows `FINALIZED`, zero errors anywhere.
Verifiable directly: [the public explorer](https://explorer-studio.genlayer.com/address/0xE60f324647039470065A263d709550Ec5D07C248).

**All four real outcome bands, plus the deterministic no-neighbor path, have now been
independently observed against real StudioNet consensus** - not just direct-mode mocks.

## Honest limits
- The hosted StudioNet RPC enforces real rate limits (30 requests/minute, 500/hour) that are
  easy to hit while testing or developing against this contract, and dropped a connection
  mid-run once during the v2 pass (a plain network reset, not a contract bug).
- StudioNet balances are simulated - bond/counter-bond settlement arithmetic is proven
  correct in the contract's own state, not against a real EVM value transfer.
- `search_similar` is a similarity heuristic (embedding distance), not a copyright
  determination - the actual originality judgment still only happens inside
  `resolve_challenge`'s nondet round.

## Stack

Next.js (App Router) · TypeScript (strict) · Tailwind · `genlayer-js@1.1.8` · GenLayer
StudioNet · no backend, no database.
