import Link from "next/link";
import { ModeChip } from "./ModeChip";

export function Nav() {
  return (
    <header className="bg-navy text-cream">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex flex-wrap items-center gap-x-6 gap-y-2">
        <Link href="/" className="font-display text-lg font-semibold tracking-tight whitespace-nowrap">
          Maintenance intake triage
        </Link>
        <div className="ml-auto sm:order-last">
          <ModeChip />
        </div>
        <nav className="basis-full sm:basis-auto flex items-center gap-4 text-sm">
          <Link href="/" className="hover:text-gold whitespace-nowrap">
            Console
          </Link>
          <Link href="/evals" className="hover:text-gold whitespace-nowrap">
            Evals
          </Link>
          <Link href="/how-it-works" className="hover:text-gold whitespace-nowrap">
            How it works
          </Link>
        </nav>
      </div>
    </header>
  );
}
