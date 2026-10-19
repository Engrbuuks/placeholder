import Link from "next/link";
import { appConfig } from "@/lib/config";
import { ArrowUpRight, Wordmark } from "./Wordmark";

export function SiteNav() {
  const copy = appConfig.landing;
  return (
    <header className="mx-auto max-w-[1200px] px-4 pt-4 sm:px-6">
      <div className="flex items-center justify-between gap-4 rounded-full border border-line bg-surface/80 py-2 pl-4 pr-1.5 backdrop-blur sm:pl-5 sm:pr-2">
        <Wordmark />
        <nav aria-label="Sections" className="hidden rounded-full border border-line px-2 py-1 md:block">
          <ul className="flex">
            {copy.nav.map((item) => (
              <li key={item.href}>
                <a href={item.href} className="block rounded-full px-4 py-1.5 text-sm text-ink hover:bg-mist">
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="flex items-center gap-1">
          <Link href="/login" className="hidden rounded-full px-4 py-2 text-sm hover:bg-mist sm:block">
            Log in
          </Link>
          <Link
            href="/signup"
            className="inline-flex items-center gap-2 whitespace-nowrap rounded-full bg-ink px-3.5 py-2.5 text-[0.8125rem] font-medium text-white hover:bg-ink/85 sm:px-4 sm:text-sm"
          >
            <span className="hidden sm:inline">{copy.navCta}</span>
            <span className="sm:hidden">{copy.navCtaShort}</span>
            <ArrowUpRight className="hidden h-3.5 w-3.5 sm:block" />
          </Link>
        </div>
      </div>
    </header>
  );
}
