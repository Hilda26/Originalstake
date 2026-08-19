import Link from "next/link";
import { ShieldCheck, Search, Scale } from "lucide-react";
import { LandingStats } from "@/components/LandingStats";

export default function Home() {
  return (
    <div className="flex flex-col">
      <section className="bg-hero-gradient border-b border-line px-6 py-20">
        <div className="mx-auto max-w-4xl">
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-accent">
            Staked originality market
          </p>
          <h1 className="font-display mb-6 text-4xl leading-tight text-ink sm:text-5xl">
            Prove your work is original — or bet that someone else&apos;s isn&apos;t.
          </h1>
          <p className="mb-8 max-w-2xl text-base leading-relaxed text-ink-soft">
            Writers post a GEN bond and submit a short piece of text — a tagline, a poem, a
            product name. The contract embeds it into its own on-chain vector index. Anyone
            who believes it&apos;s a near-copy of something already stored can open a challenge
            by staking an equal counter-bond. A permissionless resolution step runs a
            deterministic nearest-neighbor search over the contract&apos;s own corpus, then a
            single consensus round compares the two stored texts and decides who keeps the
            stake.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/submit"
              className="bg-cta-gradient rounded-md px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-accent-deep/30 hover:opacity-95"
            >
              Submit a piece
            </Link>
            <Link
              href="/submissions"
              className="rounded-md border border-line px-5 py-3 text-sm font-semibold text-ink hover:border-accent"
            >
              Browse submissions
            </Link>
          </div>
        </div>
      </section>

      <section className="px-6 py-12">
        <div className="mx-auto max-w-4xl">
          <LandingStats />
        </div>
      </section>

      <section className="border-t border-line px-6 py-16">
        <div className="mx-auto grid max-w-4xl gap-8 sm:grid-cols-3">
          <Feature
            icon={<ShieldCheck size={20} aria-hidden="true" />}
            title="Bond both sides"
            body="A submitter's bond and a challenger's counter-bond are always equal. Whoever is wrong loses exactly what the other side risked — no free griefing on either side."
          />
          <Feature
            icon={<Search size={20} aria-hidden="true" />}
            title="Evidence the contract owns"
            body="The nearest-neighbor lookup is a deterministic vector search over the contract's own stored corpus — never a party's claim, never an external fetch."
          />
          <Feature
            icon={<Scale size={20} aria-hidden="true" />}
            title="One consensus round"
            body="A single Intelligent Contract round compares two contract-held texts for substantial reuse of expression, banding the result into four outcomes."
          />
        </div>
      </section>

      <section className="border-t border-line px-6 py-16">
        <div className="mx-auto max-w-4xl">
          <h2 className="font-display mb-4 text-2xl text-ink">Who this is for</h2>
          <p className="max-w-2xl text-sm leading-relaxed text-ink-soft">
            Marketers naming products, indie developers writing taglines, poets, and
            meme-caption writers who submit short high-value text repeatedly — and who have an
            ongoing reason both to prove their own originality and to catch copycats reusing
            their expression. Every read call works without a wallet connected; you only need
            a wallet to submit or challenge.
          </p>
        </div>
      </section>
    </div>
  );
}

function Feature({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="rounded-lg border border-line bg-bg-raised p-5">
      <div className="mb-3 text-accent">{icon}</div>
      <h3 className="mb-2 text-sm font-semibold text-ink">{title}</h3>
      <p className="text-xs leading-relaxed text-ink-soft">{body}</p>
    </div>
  );
}
