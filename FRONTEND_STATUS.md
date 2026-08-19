# Frontend status — OriginalStake

Built against genlayer-js 1.1.8, Next.js 16.3.0 (App Router, TypeScript strict). The contract
is fully built/tested but **not yet deployed** — `NEXT_PUBLIC_GENLAYER_CONTRACT_ADDRESS` is
unset, and every route renders the `ContractGate` empty state rather than faking data.

## Routes

- `/` — landing page. Explains the product in one screen, live stats (`LandingStats`, pulls
  `get_submission_count` / `get_challenge_count` / `list_challenges_page` from the read-only
  client), works with no wallet connected.
- `/submissions` — paginated browse (`list_submissions_page`, page size 12), each row shows
  status, bond, challenge count, submitter. Gated by `ContractGate`.
- `/submission/[id]` — deep-linkable detail: full text, submitter, bond, status; a prominent
  **Preview nearest neighbor** panel (`preview_nearest_neighbor`, zero-cost read) so a would-be
  challenger sees the comparison text before staking; role-aware actions (`challenge`,
  permissionless `resolve_challenge`); the full challenge history for the submission via
  `list_challenges_for_submission`, each with band/reason/resolution once resolved.
- `/submit` — compose form: 400-char cap (`MAX_TEXT_LEN`, read from
  `contract/originalstake.py`, not guessed), bond input, explains why a live embed-preview
  isn't possible client-side (embedding only happens once text is on-chain) and points at the
  real `preview_nearest_neighbor` call once the submission exists.

## Components / lib

`lib/config.ts` (chain + address + explorer URL helper, correct `explorer-studio.genlayer.com`
pattern copied verbatim from project-1's fixed version), `lib/genlayerClient.ts`,
`lib/walletContext.tsx` (two-wallet system), `lib/useTransactionTracker.ts`,
`lib/pendingTx.ts` (persists `{functionName, args, valueWei}` from the first write, so a
resumed transaction always retries with the right method+args — the project-1 bug is not
repeated here since this was built with args-persistence from the start), `lib/errors.ts`
(EXPECTED/EXTERNAL/TRANSIENT/LLM_ERROR classifier), `lib/submission.ts` (types/normalizers
mirroring `Submission`/`Challenge`'s `_to_view()`), `lib/contractCalls.ts` (13 call sites, one
per contract method). Components: `ContractGate`, `EmptyState`/`ErrorState`, `WalletPanel`,
`SiteHeader`, `TransactionLifecycle`, `Skeletons`, `Badges` (status/band), `LandingStats`.

## Visual system — deliberately distinct from project-1

- **Palette**: near-black navy background (`rgb(7,9,16)`), raised surface
  `rgb(14,17,28)`, cool-white ink `rgb(235,238,246)`, single accent `rgb(84,140,255)` used only
  for CTAs/links/active states plus a sparse radial hero glow + gradient CTA button
  (`bg-hero-gradient`, `bg-cta-gradient`) — not smeared across every surface. Semantic colors
  (success `rgb(74,222,165)`, warning `rgb(250,199,92)`, danger `rgb(255,121,121)`, pending
  `rgb(196,165,255)`) each paired with a dark tinted background, checked by eye against the
  `rgb(7,9,16)`/`rgb(14,17,28)` surfaces for AA-range contrast (all foreground colors sit well
  above 4.5:1 against both background tones; no automated contrast tool was run in this
  session — flagging that as a manual gap for follow-up rather than claiming a verified score).
  This is the opposite of project-1's light powder-blue/navy-ink palette by design.
- **Fonts**: body is IBM Plex Sans (technical, engineered feel), display is Source Serif 4 (a
  modern serif used for headings/numerals) — chosen specifically because project-1 pairs a
  humanist sans (Plus Jakarta Sans) with a blunt uppercase grotesk (Archivo Black); a serif
  display face reads as "judgment/filing," matching a product about adjudicating originality
  disputes with real stakes, rather than a startup landing page.
- No purple-blue gradient hero cliché (gradient is a small radial glow, not a full-bleed
  wash), no glassmorphism, no emoji, no untouched shadcn defaults — every component is
  hand-built against the token system in `app/globals.css`.

## Wallet flow

Confirmed via manual dev-server smoke test: unhydrated skeleton → hydrate → "Connect wallet"
button → panel offers injected connect (if `window.ethereum` present) or "Generate a browser
wallet" → acknowledgement gate on a freshly generated key → export/import/upgrade-to-injected
all present, same mechanics as project-1's proven pattern, namespaced under
`originalstake.*` localStorage keys (`lib/config.ts`) so it never collides with
`briefbond.*` on a shared browser profile.

## Empty-state behavior with no contract configured

Verified live: `/`, `/submissions`, `/submit`, and (implicitly, same gate) `/submission/[id]`
all render the `ContractGate` "No contract configured yet" panel — page text captured directly
from the running dev server, not assumed:

```
No contract configured yet
This deployment doesn't have an OriginalStake contract address set for studionet. Set
NEXT_PUBLIC_GENLAYER_CONTRACT_ADDRESS in your environment once the contract is deployed —
nothing here is faked or mocked in the meantime.
```

Landing page's `LandingStats` degrades separately (no wallet/contract needed to render the
rest of the page): "No contract is configured for studionet yet — stats will appear here once
one is deployed and set in the environment."

## Build output (real, from this session)

`npm run build` (Turbopack, default — no native-binary-blocked-by-policy issue was hit in this
environment, so the `--webpack` fallback wasn't needed):

```
> project-2@0.1.0 build
> next build

▲ Next.js 16.3.0 (Turbopack)
- Environments: .env
✓ Running next.config.ts took 84ms
  Creating an optimized production build ...
✓ Compiled successfully in 10.8s
  Running TypeScript ...
  Finished TypeScript in 11.4s ...
  Collecting page data using 7 workers ...
✓ Generating static pages using 7 workers (6/6) in 977ms
  Finalizing page optimization ...

Route (app)
┌ ○ /
├ ○ /_not-found
├ ƒ /submission/[id]
├ ○ /submissions
└ ○ /submit

○  (Static)   prerendered as static content
ƒ  (Dynamic)  server-rendered on demand
```

`npm run lint` — clean, 0 problems, after fixing several `react-hooks/set-state-in-effect`
findings from the newer `eslint-config-next` ruleset (added targeted disable comments where
the pattern is a legitimate one-time hydration/fetch-kickoff, not an accidental render loop —
see `lib/walletContext.tsx`, `lib/useTransactionTracker.ts`, both list pages, and the
submission detail page's neighbor-preview effect).

One fix required beyond copying project-1's patterns: `tsconfig.json`'s `target` was `ES2017`
in the scaffold, which rejects BigInt literals (`0n`, `10n`) used throughout `lib/submission.ts`
/ `lib/contractCalls.ts` / `lib/errors.ts`. Bumped to `ES2020` to match project-1's tsconfig
and genlayer-js's actual runtime requirements.

## Honestly deferred

- No live contract to test read/write flows against — `scripts/verify-schema.ts` is written
  (13 call sites: 10 view + 3 write, matching `contract/originalstake.py`'s public surface
  exactly) but has not been run, since it requires a deployed address.
- No automated accessibility/contrast audit tool was run; contrast choices were reasoned about
  against the exact token values but not machine-verified.
- The submit form's "live preview as you type" requirement from the brief is implemented as
  an honest degradation instead of a fake preview: the contract's embedding step only exists
  once text is actually stored on-chain, so there is no client-side way to compute a real
  nearest-neighbor before submitting. The form explains this and points at the real
  `preview_nearest_neighbor` view on the resulting submission page instead of faking a
  client-side similarity check.
- Vercel deployment and contract deployment are explicitly out of scope for this pass, per the
  instructions.
