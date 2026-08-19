import Link from "next/link";
import { WalletPanel } from "./WalletPanel";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-10 border-b border-line bg-bg/90 backdrop-blur-sm">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/" className="font-display text-lg tracking-tight text-ink">
          OriginalStake
        </Link>
        <nav className="hidden items-center gap-6 text-sm font-medium text-ink-soft sm:flex">
          <Link href="/submissions" className="hover:text-ink">
            Browse submissions
          </Link>
          <Link href="/submit" className="hover:text-ink">
            Submit text
          </Link>
        </nav>
        <WalletPanel />
      </div>
    </header>
  );
}
