# Decision Record — Project 2

## Context

Project 1 (BriefBond) already exists: a two-party escrow where a client funds GEN,
a freelancer delivers a URL, and the contract fetches that URL and judges it
against a written brief via `prompt_comparative`, releasing/splitting/refunding
escrow on a banded outcome. Project 2 must not be that shape wearing a new label.
"Client/party funds X, someone delivers Y, a model judges it, funds move" is
explicitly out of bounds regardless of domain, and so is
`prompt_comparative`-over-a-single-fetched-page as the sole judging primitive.

## Candidates (9, spanning capability surface)

1. **OriginalStake — staked originality-challenge market for short creative
   text.** Writers submit a short piece (tagline, poem, product name, code
   snippet) and post a bond. The contract embeds it and inserts it into an
   on-chain `VecDB`. Anyone may open a challenge against any entry by staking a
   counter-bond. On challenge, the contract runs a deterministic `knn` search
   over its own stored corpus to find the nearest prior entry, then a single
   nondet round asks the model to compare the two *stored, contract-held texts*
   for substantial similarity of creative expression (not topic), banded
   `SUBSTANTIALLY_SAME` / `DERIVATIVE` / `DISTINCT` / `INCONCLUSIVE`. Winner
   takes the loser's bond; `INCONCLUSIVE` returns both, no slashing.
   *Capability: on-chain embeddings/VecDB knn + native GEN staking/slashing.*
2. **Screenshot Compliance Bond.** A site owner stakes GEN promising a visible
   claim ("ad-free", "displays X disclosure"). Anyone can challenge; the
   contract screenshots the live site (`render(mode="screenshot")` +
   `exec_prompt(images=...)`) to verify, slashing the stake on violation.
   *Capability: screenshot evidence + native GEN staking/slashing.* (Already
   P1's runner-up under a different name — kept here for capability coverage,
   explicitly not eligible to win since it was already evaluated once.)
3. **Portfolio-to-Brief Semantic Matcher.** Freelancers register a portfolio;
   clients post briefs; `VecDB.knn` suggests matches by embedding similarity.
   No money, no dispute. *Capability: embeddings only.*
4. **Staked Forecasting Tournament with peer-graded resolution.** N
   participants each stake GEN and submit a private prediction for an
   ambiguous future event. After the event, every participant grades a subset
   of *other* participants' predictions against a contract-stored
   ground-truth description via `prompt_comparative`; graders whose scores
   disagree with the emergent consensus lose part of their stake, correct
   graders split the pool. *Capability: native GEN staking/slashing + N-of-M
   multi-party structure (not a 2-party pair).*
5. **Cross-Contract Market Factory.** A factory contract deploys and tracks
   per-question staking-pool sub-contracts (each internally shaped like
   candidate 1 or 4), giving a directory of live markets.
   *Capability: cross-contract composition/factories.*
6. **Physical-Item Authenticity Marketplace.** Sellers of secondhand goods
   photograph an item; buyers who suspect a stock-photo listing challenge it;
   the contract compares the listing photo against the delivered photo for
   consistency. *Capability: image evidence + GEN escrow.* Rejected up front:
   this is BriefBond's shape (party delivers, model judges, funds move) with
   the domain swapped to "marketplace," exactly the disguised-reskin pattern
   the brief warns against — included only to demonstrate the pattern was
   recognized and excluded, not as a real candidate.
7. **Public-Source Prediction Market.** Bettors stake GEN on opposing sides of
   an event with a citable page (e.g. a race result); the contract fetches
   that page at resolution and pays out. *Capability: web fetch + native GEN.*
   Close to P1's candidate 5 (not built), kept for capability-surface honesty
   but not seriously considered — still fetch-and-decide, the most familiar
   reflex the brief warns against.
8. **Community Jury Content Moderation Bond.** N independent moderators each
   stake GEN and privately vote (via a screenshot + `exec_prompt(images=...)`
   read of the submitted content) on whether it violates a stated rule.
   Moderators whose vote lands outside the eventual majority band lose part of
   their stake to the majority. *Capability: image evidence + GEN
   staking/slashing + N-of-M jury structure.*
9. **On-Chain Glossary Consensus.** Contributors stake GEN to propose a
   definition; challengers dispute using `VecDB.knn` to surface a conflicting
   prior definition, resolved by `prompt_comparative` over the two
   contract-stored definitions. *Capability: embeddings + GEN staking.*
   Structurally near-identical to candidate 1 (originality-challenge over
   stored text via knn + comparative judging) with the domain swapped from
   "creative text" to "glossary term" — flagged as a near-duplicate of #1
   rather than padding the count with a disguised second entry of the same
   idea.

Capabilities represented across the set: on-chain embeddings/VecDB (1, 3, 9),
native GEN staking/slashing (1, 2, 4, 5, 8, 9), image/screenshot evidence
(2, 6, 8), web fetch (7), cross-contract composition (5). That is 5 distinct
capability families, 6 candidates involve native GEN value — comfortably past
the 2-candidate / 3-capability minimum, and none of the winner-eligible
candidates is a web-fetch-and-judge clone of BriefBond.

## Gate analysis — winner: #1, OriginalStake

**Gate A — the counterfactual.** Delete GenLayer: someone has to decide whether
a newly submitted piece of text is a genuine near-copy of something already on
the platform, and today that someone is either nobody (plagiarism goes
unchecked) or a single centralized moderator who can be bribed, biased, or
simply wrong, with the accuser and the accused both stuck trusting that one
party's read of "how similar is too similar." Removing GenLayer removes the
only way for two people who have never met and don't run the platform to get
an outcome neither of them unilaterally controls.

**Gate B — two distrusting parties.** Named: the **submitter**, who wants their
bond back and wants their work recognized as original, and the **challenger**,
who has staked their own GEN on the claim that the submission is a
near-duplicate and profits only if they are right. Neither trusts the other's
self-report — the submitter has every incentive to claim originality
regardless of truth, and a challenger has every incentive to file speculative
challenges if there's no cost to being wrong. The counter-bond on both sides is
what makes the game honest; without it either party could grief the other for
free.

**Gate C — irreducibly semantic.** Vector distance from `knn` is a *filter*,
not the *verdict* — two texts can sit close in embedding space because they
share a topic or genre without being the same creative expression ("a sonnet
about autumn" vs. a specific sonnet about autumn), and two texts can be
substantively the same expression while sitting further apart than a naive
distance threshold would catch (reordered stanzas, synonym substitution). The
actual question — "did the second author substantially reuse the first
author's expression, not just its subject" — cannot be answered by a distance
number or a regex; it requires reading both texts and forming a judgment,
exactly the class of question consensus exists for.

**Gate D — evidence the contract fetches/retrieves itself.** The contract does
not trust either party's claim about how similar the texts are. It runs its
own deterministic `VecDB.knn` search over its own storage to find the
candidate neighbor, then hands both *contract-held* texts (never a
party-submitted screenshot or description of them) to the nondet round. There
is no web dependency at all — the evidence already lives in the contract's own
state, which is a stronger version of Gate D than fetching a live external
page: nothing about the world outside the chain has to be trusted or can go
stale or unreachable.

**Gate E — would a stranger use this twice?** Anyone who writes short,
high-value text repeatedly — marketers naming products, indie developers
writing taglines, poets, meme-caption writers — has an ongoing reason to prove
originality and an ongoing reason to catch copycats; both submitting and
challenging are repeat actions, not one-time events, unlike a single
compliance bond a site owner sets up once.

**Gate F — path beyond submission.** Natural extensions: per-category corpora
(code snippets, product names, headlines) each as their own market instance
via a factory (candidate 5 folds in directly); a public "originality score"
per address built from submission/challenge history; integration as a
pre-publish check for blogging or naming tools via a simple read call before a
human ever pays a filing fee; a public leaderboard of caught copycats becomes
its own trust signal for the ecosystem, similar to how BriefBond's resolved-
dispute directory was framed, but earned through a completely different
mechanic.

**Gate G — latency budget.** Submission (embed + `VecDB.insert`) is fully
deterministic — no nondet call, settles in the normal single-write time.
Opening a challenge triggers exactly one nondet round: one deterministic `knn`
lookup (not a nondet operation) followed by one `exec_prompt` comparison
banded into four outcomes, called from a `resolve_challenge` step that is
permissionless so neither party is ever blocked waiting on the other's gas.
The user who waits (the challenger who just triggered resolution) is not the
user filling out a form (the submitter), matching the "split fast from slow"
requirement.

## Runner-up and why OriginalStake wins

The runner-up was **#4, Staked Forecasting Tournament**. It has a genuinely
different multi-party shape (N graders, not a pair) and a strong native-GEN
story. OriginalStake wins because its evidence model is stronger and cleaner:
forecasting-tournament resolution depends on peer graders reading each other's
predictions against a ground truth the contract itself must also be trusted to
have stated correctly at market creation, which reintroduces a "someone wrote
the correct answer down and everyone trusts that" seam. OriginalStake's
evidence is symmetric and self-contained — both texts being compared were
independently submitted by parties with opposing incentives, with nothing the
contract has to assert unilaterally about the world. It is also a cleaner,
single-round latency story (Gate G) versus the tournament's multi-participant
grading round, which is harder to bound and easier to game via grader
collusion.

## Explicit confirmation: how this differs in shape from BriefBond, not just label

BriefBond's shape is: **one party funds → a second party delivers a single
artifact → the contract fetches that artifact from the outside world → a
model judges the artifact against the first party's stated requirement →
funds move to whichever party the verdict favors.** It is fundamentally a
two-party, one-directional, fund-then-deliver-then-judge pipeline, and the
"evidence" is always something the contract must go get from off-chain.

OriginalStake is a **symmetric adversarial bonding market**, not a
delivery-and-judge pipeline:
- There is no "client" and no "delivery." Both parties independently put
  capital at risk *before* any judgment exists, and either party can be the
  one who loses their stake — there is no fixed "payer" and "payee" role the
  way there is a fixed client and freelancer in BriefBond.
- The evidence being judged is never fetched from the outside world — it is
  two pieces of text that already live in the contract's own storage,
  retrieved via a deterministic vector search the contract runs against
  itself. BriefBond's non-determinism budget is anchored on `web.render`;
  OriginalStake's is anchored on `VecDB.knn` (deterministic) feeding
  `exec_prompt`/`prompt_comparative` (the one nondet call) — a genuinely
  different evidence type and a different reason the outcome can't be known
  in advance.
- The multiplicity is different: any number of challengers can contest any
  submission over its lifetime, and the corpus itself is the growing shared
  state every judgment is checked against — there is no analog to this in
  BriefBond, where each brief is judged in isolation against nothing but its
  own text.
- Nobody in OriginalStake is "delivering a brief's requirement." The question
  is comparative between two peer submissions, not compliance-to-a-spec —
  structurally closer to a duel than an inspection.

## Honest self-audit

- **Distinct capabilities actually represented across the 9:** 5 — embeddings/
  VecDB, native GEN staking/slashing, image/screenshot evidence, web fetch,
  cross-contract composition. The winner itself uses 2 of these
  (embeddings + GEN value) plus the one shared judging primitive
  (`prompt_comparative`) every viable idea in this space eventually needs
  somewhere, since Phase 2's own rules forbid `prompt_non_comparative` for any
  outcome-deciding judgment.
- **Secretly-duplicate candidates:** #9 (glossary consensus) is candidate #1
  wearing a different domain — both are "knn-retrieve a stored neighbor, then
  `prompt_comparative` the two texts, stake decides who's right." I flagged
  this explicitly rather than padding the list with a disguised second
  originality market. #2 and #6 both lean on image evidence with GEN value,
  but they are not the same idea: #2 is self-report-then-audit (compliance),
  #6 is delivery-then-inspect (BriefBond's actual shape, deliberately kept
  in the list as a labeled example of what *not* to pick rather than a real
  contender). Being honest, the count of truly independent underlying
  mechanics here is closer to 7, not 9.
- **What I would have picked without embeddings/VecDB at all:** #4, the
  staked forecasting tournament — the strongest candidate that leans purely
  on GEN staking/slashing and a multi-party structure without needing vector
  search. #8 (jury moderation) would be a close second. This confirms the
  winner wasn't chosen because embeddings were the only interesting tool
  available; a value-flow-only version of "many distrusting parties, no
  single judge role" was independently viable, which is a healthier signal
  than defaulting to whichever capability looked shiniest.
- **What I would have picked if this were graded only on "most different from
  BriefBond," ignoring all other gates:** still #1. The delivery-then-judge
  shape is what OriginalStake removes most completely of anything on this
  list — no delivery step exists at all.

## Chosen idea

**OriginalStake** — a staked originality-challenge market for short creative
text. Writers post a bond and submit a piece, which the contract embeds and
stores in an on-chain vector index. Anyone who believes a submission is a
near-copy of prior work can open a challenge by staking a counter-bond; the
contract deterministically retrieves the nearest stored neighbor via
`VecDB.knn`, then a single Intelligent Contract consensus round compares the
two contract-held texts for substantial reuse of creative expression (not
topic), banded `SUBSTANTIALLY_SAME` / `DERIVATIVE` / `DISTINCT` /
`INCONCLUSIVE`. The losing side's stake moves to the winner; `INCONCLUSIVE`
returns both stakes untouched. No web fetch, no client/freelancer pair, no
delivery-then-judge pipeline — a symmetric bonding game over evidence the
contract already owns.

## Visual direction note (for later phases)

Dark navy-to-black gradient design system, higher contrast and moodier than
Project 1's light powder-blue palette — different type pairing, different
accent color, no reuse of Project 1's palette.
