import Link from "next/link";
import { appConfig, markets, type MarketCode } from "@/lib/config";
import { relativeTime } from "@/lib/health";
import { logout } from "@/app/actions/auth";
import { rerunAudit } from "@/app/actions/dashboard";
import { Icon } from "./Icon";
import { Wordmark } from "./Wordmark";
import { RefreshButton } from "./ui";

type Props = {
  active: string;
  title: string;
  subtitle: string;
  businessName: string;
  country: MarketCode | null;
  fullName: string;
  email: string;
  lastChecked: Date | null;
  children: React.ReactNode;
};

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

export function AppShell({ active, title, subtitle, businessName, country, fullName, email, lastChecked, children }: Props) {
  const nav = appConfig.dashboard;
  const market = country ? markets[country] : null;
  const next = appConfig.comingNext[0];

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[244px_minmax(0,1fr)] lg:gap-5 lg:p-4">
      {/* Sidebar */}
      <aside className="sticky top-4 hidden h-[calc(100vh-2rem)] flex-col rounded-[24px] bg-ink p-4 text-white lg:flex">
        <div className="px-2 pt-2">
          <Wordmark href="/dashboard" tone="light" />
          <p className="mt-3 truncate font-mono text-xs text-white/50">{businessName}</p>
        </div>

        <nav aria-label="Main" className="mt-8">
          <ul className="space-y-1">
            {nav.nav.map((item) => {
              const on = item.id === active;
              return (
                <li key={item.id}>
                  <Link
                    href={item.href}
                    aria-current={on ? "page" : undefined}
                    className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors ${
                      on ? "bg-accent text-white" : "text-white/75 hover:bg-white/10 hover:text-white"
                    }`}
                  >
                    <Icon name={item.icon} className="h-[18px] w-[18px]" />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
          <ul className="mt-6 space-y-1 border-t border-white/10 pt-6">
            {nav.soon.map((item) => (
              <li key={item.label} className="flex items-center gap-3 px-3 py-2.5 text-sm text-white/35">
                <Icon name={item.icon} className="h-[18px] w-[18px]" />
                {item.label}
                <span className="ml-auto rounded-full border border-white/15 px-2 py-0.5 font-mono text-[0.625rem] uppercase tracking-[0.06em] text-white/45">
                  {nav.soonLabel}
                </span>
              </li>
            ))}
          </ul>
        </nav>

        {next && (
          <div className="relative mt-auto overflow-hidden rounded-2xl bg-accent p-4 text-ink">
            <div aria-hidden className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-white/30 blur-2xl" />
            <p className="relative font-mono text-[0.625rem] uppercase tracking-[0.06em] text-ink/70">Coming next</p>
            <p className="relative mt-2 text-lg font-semibold leading-tight tracking-[-0.02em]">{next.label}</p>
            <p className="relative mt-1.5 text-[0.8125rem] leading-snug text-ink/80">{next.detail}</p>
          </div>
        )}
      </aside>

      <div className="min-w-0">
        {/* Mobile header */}
        <div className="border-b border-line bg-surface lg:hidden">
          <div className="flex items-center justify-between px-4 py-3">
            <Wordmark href="/dashboard" />
            <span className="max-w-[45%] truncate font-mono text-xs text-ink-soft">{businessName}</span>
          </div>
          <nav aria-label="Main" className="overflow-x-auto px-4 pb-3">
            <ul className="flex gap-1.5">
              {nav.nav.map((item) => (
                <li key={item.id}>
                  <Link
                    href={item.href}
                    aria-current={item.id === active ? "page" : undefined}
                    className={`flex items-center gap-2 whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm ${
                      item.id === active ? "bg-ink text-white" : "border border-line text-ink"
                    }`}
                  >
                    <Icon name={item.icon} className="h-4 w-4" />
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        {/* Top bar */}
        <header className="flex flex-wrap items-start justify-between gap-4 px-4 pb-6 pt-6 sm:px-6 lg:px-2 lg:pt-4">
          <div>
            <h1 className="text-[clamp(1.6rem,2.6vw,2.1rem)] tracking-[-0.035em]">{title}</h1>
            <p className="mt-1.5 text-[0.9375rem] text-ink-soft">{subtitle}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {market && (
              <span className="inline-flex h-10 items-center gap-2 rounded-full border border-line bg-surface px-4 text-sm">
                <Icon name="globe" className="h-4 w-4 text-ink-soft" />
                {market.name}
                <span className="text-ink-soft">{market.currencySymbol}</span>
              </span>
            )}
            {lastChecked && (
              <span className="inline-flex h-10 items-center gap-2 px-2 font-mono text-xs text-ink-soft">
                <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-accent" />
                Checked {relativeTime(lastChecked)}
              </span>
            )}
            <form action={rerunAudit}>
              <RefreshButton label="Check my business again" />
            </form>
            <details className="relative">
              <summary
                aria-label="Account"
                className="grid h-10 w-10 cursor-pointer list-none place-items-center rounded-full bg-ink text-sm font-semibold text-white [&::-webkit-details-marker]:hidden"
              >
                {initials(fullName)}
              </summary>
              <div className="absolute right-0 z-20 mt-2 w-64 rounded-2xl border border-line bg-surface p-2 shadow-[0_12px_32px_rgba(17,17,17,0.12)]">
                <div className="px-3 py-2">
                  <p className="truncate font-medium">{fullName}</p>
                  <p className="truncate font-mono text-xs text-ink-soft">{email}</p>
                </div>
                <form action={logout}>
                  <button type="submit" className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm hover:bg-mist">
                    <Icon name="logout" className="h-4 w-4" />
                    Log out
                  </button>
                </form>
              </div>
            </details>
          </div>
        </header>

        <main className="px-4 pb-16 sm:px-6 lg:px-2">{children}</main>
      </div>
    </div>
  );
}
