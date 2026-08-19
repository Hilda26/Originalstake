# OriginalStake Contract Status

## Design choices

- **1:1 bond/counter-bond.** A challenger's counter-bond must exactly equal the challenged
  submission's own bond - not a configurable multiplier. This keeps the game symmetric:
  whoever is wrong loses exactly what the other side risked, so neither side can grief the
  other with a token stake or block a legitimate challenge with an unaffordable demand.
- **`SUBSTANTIALLY_SAME` and `DERIVATIVE` settle identically** (challenger wins, submitter's
  bond moves to the challenger, challenger's own counter-bond returned to them). The two
  labels are kept distinct only in the stored `band`/`reason` fields for transparency and
  future extensibility (e.g. a partial slash for `DERIVATIVE` in a later version) - this
  version's payout math does not distinguish them.
- **`INCONCLUSIVE` is explicitly not BriefBond's `UNABLE_TO_VERIFY`.** There is no
  transient-failure mode here - both texts being compared already live in contract storage
  and read identically on every retry. `INCONCLUSIVE` means both bonds are returned
  untouched, the challenge is marked `RESOLVED` (closed, not retryable), and the submission
  returns to `OPEN` so a *different* future challenge can still be opened against it later.
  A second, narrower case resolves as `INCONCLUSIVE` deterministically with zero nondet
  spend at all: if the corpus has no other submission to compare against.

## Non-determinism budget

Exactly **one** nondet operation: `gl.nondet.exec_prompt`, wrapped in
`gl.eq_principle.prompt_comparative`, comparing two texts already held in the contract's own
storage. The `VecDB.knn` neighbor lookup that finds what gets compared is plain deterministic
vector arithmetic - not a nondet call. This is a stronger version of "evidence the contract
fetches itself" than BriefBond's web fetch: there is no external dependency at all.

## Lint

```
PYTHONIOENCODING=utf-8 genvm-lint check contract/originalstake.py --json
```
`{"lint":{"ok":true,"passed":3},"validate":{"ok":true,"contract":"OriginalStake","methods":13,"view_methods":10,"write_methods":3,"ctor_params":0}}` - clean pass.

## Direct tests

```
pytest tests/direct/ -v
```
**39 passed, 0 failed, 6.68s.** Covers: happy-path submission and challenge, access control
(submitter cannot challenge their own submission), counter-bond exact-match validation (both
too-low and too-high rejected), corpus size cap, text length cap (including exactly at the
boundary), all four resolution bands (`SUBSTANTIALLY_SAME`, `DERIVATIVE`, `DISTINCT`,
`INCONCLUSIVE` via both the no-neighbor path and a genuine model `INCONCLUSIVE`), replay
protection (a challenge cannot be resolved twice), a flagged submission cannot be
re-challenged while a fresh distinct/inconclusive one can, malformed/fenced/invalid model
output defensively parsed, `preview_nearest_neighbor` behavior with 0/1/2+ corpus entries,
pagination, and timestamp handling across a `warp_to` cycle.

## Integration tests (real StudioNet)

```
PYTHONIOENCODING=utf-8 gltest tests/integration/ -v -s --network studionet
```
**2 passed in 602.09s (10m02s).**

- **Full lifecycle test:** real `VecDB.knn` lookup found the actual stored neighbor; real
  validator consensus resolved **`SUBSTANTIALLY_SAME`** with the reasoning *"The only
  difference is the spelling of 'harbour' vs. 'harbor', which is a trivial regional variant
  with no meaningful change to the creative expression."* - correctly catching a spelling
  variant as substantively the same expression, not a false negative. Submission correctly
  moved to `FLAGGED`.
- **No-neighbor test:** resolved **`INCONCLUSIVE`** deterministically (zero nondet spend, as
  designed) when the corpus had nothing else to compare against.

## Honest limits (v1)

- Only two real consensus outcomes have been observed live on StudioNet so far
  (`SUBSTANTIALLY_SAME` and the deterministic no-neighbor `INCONCLUSIVE`); `DERIVATIVE`,
  `DISTINCT`, and a genuine model-judged `INCONCLUSIVE` are exercised in direct-mode tests
  with mocked model responses but not yet independently reproduced against real validator
  judgement on StudioNet in this pass.
- The hosted StudioNet RPC's rate limits (30 req/min, 500/hour) are a real operational
  constraint for anyone running this suite or the frontend against it.
- StudioNet balances are simulated - bond/counter-bond settlement arithmetic is proven
  correct in the contract's own state, not against a real EVM value transfer.

=============================================================================

## v2 expansion (search, bounties, expiry, track record)

Added four genuinely new capabilities to differentiate OriginalStake from a thin clone of
this series' first project, while staying true to its own shape (a symmetric staked bonding
market over on-chain vector evidence):

1. **`search_similar(query_text, k) -> list[dict]`** (new view). Embeds arbitrary query text
   not tied to any existing submission id and runs `VecDB.knn` across the whole corpus,
   returning up to `MAX_SEARCH_K` (20) matches as `{submission_id, text, submitter, status}`.
   Lets a writer check "has anything like this already been submitted?" *before* they spend
   GEN submitting - unlike `preview_nearest_neighbor`, which only works on an already-stored
   id. Purely deterministic vector math; not part of judging.
2. **Flag bounties (`add_bounty`, `bounty_pool`/`bounty_total` on `Submission`).** Anyone -
   not just the submitter or a future challenger - may contribute GEN to a per-submission
   pool that sweetens the incentive for someone else to open a challenge. Payout policy: if
   the challenger wins (`SUBSTANTIALLY_SAME`/`DERIVATIVE`), the whole pool is paid to the
   challenger on top of the forfeited bond and reset to zero; if the challenger loses
   (`DISTINCT`) or the result is `INCONCLUSIVE`, the pool is left completely untouched and
   rolls over - it is never refunded to contributors and never silently lost. This is a
   deliberately different native-GEN mechanic from BriefBond's client-funded escrow: a
   crowdfunded incentive pool, not a delivery payment.
3. **`expire_stale_challenge(challenge_id)`** (new permissionless write). An `OPEN` challenge
   nobody ever calls `resolve_challenge` on would otherwise lock both bonds forever. If
   `now - challenge.created_at` strictly exceeds `MAX_CHALLENGE_AGE_SECONDS` (3 days, `P3D`),
   anyone may deterministically settle it as `INCONCLUSIVE` - both bonds returned untouched,
   zero nondet spend, `bounty_pool` left untouched exactly like a judged `INCONCLUSIVE`.
   Time is read via the same `gl.message_raw`/`gl.message.raw` Z-suffixed datetime pattern
   already used for `created_at`/`updated_at`, never `datetime.utcnow()`. This is a different
   mechanic from BriefBond's `reclaim_expired` (refunds an un-delivered brief before
   assignment) - it exists for stale unresolved *judgment*, not a missed pre-work deadline,
   and only ever lands on `INCONCLUSIVE`'s existing settlement path, never a new outcome.
4. **`get_track_record(address) -> dict`** (new view) + internal `TrackRecord` counters:
   `submissions_made`, `times_flagged`, `challenges_opened`, `challenges_won`,
   `challenges_lost`. Updated only from inside `submit`/`challenge`/`resolve_challenge`/
   `expire_stale_challenge` (which deliberately does *not* touch win/loss counters - an
   expired-stale challenge is nobody's win or loss). No privileged editor entry point, same
   non-negotiable rule as reputation elsewhere in this series.

**Non-determinism budget reconfirmed: still exactly 1.** None of the four additions call
`gl.nondet.exec_prompt` or any other nondet primitive - `search_similar` is deterministic
`VecDB.knn`, `add_bounty`/`expire_stale_challenge` are deterministic bookkeeping and time
comparison, `get_track_record` is a pure read of deterministic counters. The single nondet
round inside `resolve_challenge` is untouched.

**All existing method names/signatures unchanged.** `get_submission`'s return dict grew two
new keys (`bounty_pool`, `bounty_total`) but dropped none.

### v2 lint

```
PYTHONIOENCODING=utf-8 genvm-lint check contract/originalstake.py --json
```
`{"lint":{"ok":true,"passed":3},"validate":{"ok":true,"contract":"OriginalStake","methods":17,"view_methods":12,"write_methods":5,"ctor_params":0}}` - clean pass (only informational `I200` "newer runner available" notices, expected since the `Depends` header is intentionally pinned unchanged).

### v2 direct tests

```
pytest tests/direct/ -v
```
**68 passed, 0 failed, ~19s** (up from 39). New coverage: `search_similar` on an empty
corpus, a single entry, multiple entries (ranking sanity), `k` clamped to corpus size, `k`
capped at `MAX_SEARCH_K`, and empty-query/zero-`k` rejection; bounty accumulation across
multiple contributors, payout-on-win with reset, rollover-on-`DISTINCT`, rollover-on-
`INCONCLUSIVE`, and a bounty surviving one `INCONCLUSIVE` round to pay out on a later,
different challenger's win; `expire_stale_challenge` tested strictly-before, exactly-at, and
strictly-after the threshold via the `warp_to` helper, permissionless-caller, already-
resolved rejection, and bounty rollover through expiry; and every track-record counter
(`submissions_made`, `challenges_opened`, `times_flagged`, `challenges_won`,
`challenges_lost`) verified on every real code path, including confirming `expire_stale_challenge`
does *not* move win/loss counters, plus a default-zero-for-unknown-address check.

### v2 integration test (real StudioNet)

```
PYTHONIOENCODING=utf-8 gltest tests/integration/ -v -s --network studionet
```
A new `test_originalstake_bounty_paid_to_winning_challenger_on_studionet` scenario was added:
a third account funds a 300-wei bounty on a near-duplicate submission, a fourth account
challenges it, and `resolve_challenge` runs a real nondet consensus round against the actual
deployed StudioNet validators.

**1 passed in 313.51s (5m13s).** Real observed outcome: the model resolved
**`SUBSTANTIALLY_SAME`** with the reasoning *"The challenged text is word-for-word identical
to the neighbor except for the addition of 'softly' at the end, which is a trivial difference
that does not constitute independent creative expression."* The challenger won, and the
300-wei bounty was correctly paid out on top of the forfeited bond: post-resolution
`bounty_pool` read back as **0** and `bounty_total` stayed at **300** (historical total not
reset) - confirming the payout-and-reset code path against real StudioNet consensus, not a
mock. The submission's status moved to `FLAGGED` as expected.

An earlier full run of the whole integration suite in this pass hit a mid-run
`ConnectionResetError` from the hosted StudioNet RPC partway through the pre-existing v1
lifecycle scenarios (unrelated to this change); the bounty scenario above was re-run in
isolation afterward and passed cleanly on the first retry.

### v2 deployment - extended live verification

After redeploying v2 to `0xE60f324647039470065A263d709550Ec5D07C248`, four more real
scenarios were run directly against the persistent deployment (beyond the integration-suite
run above) specifically to build up a real, honest transaction history and observe bands not
yet seen live:

- **`SUBSTANTIALLY_SAME`** (spelling variant) and **`DISTINCT`** (unrelated topic) -
  reproduced live on the fresh v2 deployment, matching the earlier v1 observations.
- **`DERIVATIVE`** - observed live for the first time, twice, with two independent reworded
  paraphrase pairs. First: *"Both texts share the same parallel 'follow/chase the sunrise,
  follow/chase your dreams' structure and the 'don't let the moment slip away' closing idea,
  with only synonym substitutions and minor rephrasing rather than independent
  construction."* Second: *"It preserves the same comparative proverb structure and imagery
  - small daily steps versus one giant leap - while mainly swapping in close synonyms."*
- **Bounty rollover on a loss** - observed live for the first time: a 150-wei bounty was
  crowdfunded onto a submission, a challenge against it resolved `DISTINCT` (challenger
  lost), and `get_submission` confirmed the bounty was left completely untouched
  (`bounty_pool: 150`, unchanged) rather than refunded or lost - proving the rollover policy
  against real consensus, not just a mock.

A fifth scenario deliberately targeted the last untested path: a genuine model-judged
`INCONCLUSIVE` (as opposed to the already-observed deterministic no-neighbor case). Two
single common greeting words ("Hi" / "Hey") were submitted and challenged - real validator
consensus resolved **`INCONCLUSIVE`**: *"Both texts are single common greeting words too
short and generic to assess whether one reuses the creative expression of the other."* An
earlier attempt with slightly longer phrases ("Rise up." / "Stand tall.") resolved a
confident `DISTINCT` instead - included here rather than discarded, since a consensus
outcome can't be forced either way and an honest report includes the miss, not just the hit.

**Running total: 38 on-chain transactions on the v2 contract, 100% clean** - every `Call`
shows `SUCCESS`/`Accepted`, every `Send` (payout) shows `FINALIZED`, zero error rows anywhere
in the transaction history. Verifiable directly:
https://explorer-studio.genlayer.com/address/0xE60f324647039470065A263d709550Ec5D07C248

**All four real outcome bands (`SUBSTANTIALLY_SAME`, `DERIVATIVE`, `DISTINCT`,
`INCONCLUSIVE`) plus the deterministic no-neighbor `INCONCLUSIVE` path have now been
independently observed against real StudioNet validator consensus**, not just direct-mode
mocks.

### v2 honest limits

- The hosted StudioNet RPC dropped the connection mid-run once during this pass (a plain
  `ConnectionResetError`, not a contract or test bug) - the affected v1 lifecycle scenarios
  were not re-verified live in this same pass, though their code paths are unchanged from the
  already-documented v1 run above and are fully covered in direct-mode.
- `search_similar` ranking is only as good as the underlying MiniLM sentence embedding and
  Euclidean-squared distance; it is a similarity heuristic, not a copyright determination -
  the actual judgment still only happens inside `resolve_challenge`'s nondet round.
- `MAX_CHALLENGE_AGE_SECONDS` (3 days) is a fixed contract constant, not configurable per
  submission or by governance in this version.
