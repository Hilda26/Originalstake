# OriginalStake Demo Video Script

Target length: ~2.5-3 minutes. Screen-record at [originalstake.vercel.app](https://originalstake.vercel.app).
Everything referenced here is real, already-observed on-chain data - you can either replay
the flow live or narrate over the existing state (recommended for the consensus-round parts,
since those take minutes for real).

---

## 1. Cold open - the landing page (0:00-0:25)

Load `https://originalstake.vercel.app`. Let the dark navy-to-black gradient register for a
second before talking.

**Say:**
> "This is OriginalStake - a staked originality market for short creative text. Instead of a
> moderator deciding whether something's a copy, two people who've never met each other put
> real money on the line, and GenLayer's validators settle it."

Point at the live stats block (submissions / challenges / resolved counts).

**Say:**
> "Every number here is live - this contract has already run 38 real transactions, and I'm
> going to show you what some of them actually looked like."

---

## 2. Browse a resolved submission (0:25-1:00)

Go to `/submissions`, click into one that's `FLAGGED` (a `SUBSTANTIALLY_SAME` or `DERIVATIVE`
result).

**Say:**
> "Here's a submission that already went through a real dispute."

Scroll to the challenge history and the stored reasoning.

**Say:**
> "This isn't a black box. The validators' actual reasoning is stored on-chain - you can see
> exactly why they ruled the way they did."

Read the real reasoning text on screen (e.g. the "chase the sunrise / follow the sunrise"
DERIVATIVE result, or the spelling-variant SUBSTANTIALLY_SAME one).

---

## 3. The search feature (1:00-1:25)

Go to `/submit`. Connect a wallet (generate one in-browser).

**Say:**
> "Before I even post something, I can check if it's already been done."

Type a few words related to an existing submission (e.g. `"chase your dreams"` if that
submission still exists) and let the live search box surface results.

**Say:**
> "That's a real semantic search over everything ever submitted to this contract - not a
> keyword match, an actual vector search running against the contract's own on-chain index."

---

## 4. Post a real submission (1:25-1:55)

Type a new short piece of text and a bond amount. Submit.

**Say:**
> "I'm locking real GEN against this. If someone successfully proves it's a near-copy of
> something already here, that bond moves to them - not back to me."

Show the transaction lifecycle panel settling quickly (deterministic write, no model call
yet).

---

## 5. Bounties (1:55-2:20)

Navigate to a submission with an existing bounty (or add one to your own).

**Say:**
> "Here's something unique to this project: anyone - not just people directly involved - can
> crowdfund a bounty on a submission to incentivize someone else to go check it. It's a way
> to say 'I think this looks suspicious, here's money for whoever proves it.'"
>
> "And the interesting part: if the challenge fails, the bounty doesn't get refunded or lost
> - it just sits there, waiting for the next person willing to take the bet. I've actually
> proven that live - a bounty survived a losing challenge untouched, on real StudioNet
> consensus, not a test mock."

---

## 6. The consensus round itself (2:20-2:45)

*(Cut to a pre-recorded resolved result rather than waiting live - a real round takes
several minutes.)*

**Say:**
> "When someone actually challenges a submission, here's what happens: the contract
> deterministically finds the closest existing entry using its own on-chain vector search -
> no fetching from outside, the evidence already lives here. Then it asks independent AI
> validators one question: does this substantially reuse the other one's actual expression,
> not just the topic. They have to agree on the exact same answer - one of four bands. I've
> run this for real over a dozen times now and gotten every single one: near-verbatim copies,
> reworded paraphrases, completely unrelated text, and even cases too short and generic for
> the validators to confidently call either way."

Show a resolved challenge with its band and reasoning on screen as you say this.

---

## 7. Close (2:45-3:00)

Cut back to the landing page or the GitHub repo.

**Say:**
> "No backend, no database - the contract is the whole system. Source, the deployed contract
> address, and every one of these real transactions are linked in the README. Thanks for
> watching."

---

## Notes for recording

- **You don't need to wait for a live consensus round on camera.** Cut to an already-resolved
  submission and read its real stored reasoning instead - it's just as real, and it doesn't
  cost you three minutes of dead air.
- Real values already proven to work, if you want to reuse them instead of improvising:
  - A minimal, genuinely ambiguous pair that resolved INCONCLUSIVE live: `"Hi"` vs `"Hey"`
  - A closely-reworded pair that resolved DERIVATIVE live: `"Chase the sunrise, chase your
    dreams, and never let the moment slip away."` vs `"Follow the sunrise, follow your
    dreams -- don't let this moment get away from you."`
- Contract address, if you want to show the explorer directly:
  `0xE60f324647039470065A263d709550Ec5D07C248`
- Explorer link: https://explorer-studio.genlayer.com/address/0xE60f324647039470065A263d709550Ec5D07C248
