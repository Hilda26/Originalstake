# OriginalStake Contract Status

## Design choices

- **1:1 bond/counter-bond.** A challenger's counter-bond must exactly equal the challenged
  submission's own bond — not a configurable multiplier. This keeps the game symmetric:
  whoever is wrong loses exactly what the other side risked, so neither side can grief the
  other with a token stake or block a legitimate challenge with an unaffordable demand.
- **`SUBSTANTIALLY_SAME` and `DERIVATIVE` settle identically** (challenger wins, submitter's
  bond moves to the challenger, challenger's own counter-bond returned to them). The two
  labels are kept distinct only in the stored `band`/`reason` fields for transparency and
  future extensibility (e.g. a partial slash for `DERIVATIVE` in a later version) — this
  version's payout math does not distinguish them.
- **`INCONCLUSIVE` is explicitly not BriefBond's `UNABLE_TO_VERIFY`.** There is no
  transient-failure mode here — both texts being compared already live in contract storage
  and read identically on every retry. `INCONCLUSIVE` means both bonds are returned
  untouched, the challenge is marked `RESOLVED` (closed, not retryable), and the submission
  returns to `OPEN` so a *different* future challenge can still be opened against it later.
  A second, narrower case resolves as `INCONCLUSIVE` deterministically with zero nondet
  spend at all: if the corpus has no other submission to compare against.

## Non-determinism budget

Exactly **one** nondet operation: `gl.nondet.exec_prompt`, wrapped in
`gl.eq_principle.prompt_comparative`, comparing two texts already held in the contract's own
storage. The `VecDB.knn` neighbor lookup that finds what gets compared is plain deterministic
vector arithmetic — not a nondet call. This is a stronger version of "evidence the contract
fetches itself" than BriefBond's web fetch: there is no external dependency at all.

## Lint

```
PYTHONIOENCODING=utf-8 genvm-lint check contract/originalstake.py --json
```
`{"lint":{"ok":true,"passed":3},"validate":{"ok":true,"contract":"OriginalStake","methods":13,"view_methods":10,"write_methods":3,"ctor_params":0}}`
— clean pass.

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
  with no meaningful change to the creative expression."* — correctly catching a spelling
  variant as substantively the same expression, not a false negative. Submission correctly
  moved to `FLAGGED`.
- **No-neighbor test:** resolved **`INCONCLUSIVE`** deterministically (zero nondet spend, as
  designed) when the corpus had nothing else to compare against.

## Honest limits

- Only two real consensus outcomes have been observed live on StudioNet so far
  (`SUBSTANTIALLY_SAME` and the deterministic no-neighbor `INCONCLUSIVE`); `DERIVATIVE`,
  `DISTINCT`, and a genuine model-judged `INCONCLUSIVE` are exercised in direct-mode tests
  with mocked model responses but not yet independently reproduced against real validator
  judgement on StudioNet in this pass.
- The hosted StudioNet RPC's rate limits (30 req/min, 500/hour) are a real operational
  constraint for anyone running this suite or the frontend against it.
- StudioNet balances are simulated — bond/counter-bond settlement arithmetic is proven
  correct in the contract's own state, not against a real EVM value transfer.
