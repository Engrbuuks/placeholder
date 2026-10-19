import Link from "next/link";
import { logout } from "@/app/actions/auth";
import { Wordmark } from "./Wordmark";

export function AppHeader({ businessName, active }: { businessName: string; active: "dashboard" | "brain" }) {
  const link = (href: string, label: string, id: typeof active) => (
    <li>
      <Link
        href={href}
        aria-current={active === id ? "page" : undefined}
        className={`block rounded-full px-4 py-1.5 text-sm ${active === id ? "bg-ink text-white" : "text-ink hover:bg-mist"}`}
      >
        {label}
      </Link>
    </li>
  );
  return (
    <header className="mx-auto max-w-[1200px] px-4 pt-4 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[28px] border border-line bg-surface/80 py-2 pl-5 pr-2 backdrop-blur sm:rounded-full">
        <div className="flex items-center gap-3">
          <Wordmark href="/dashboard" />
          <span className="hidden rounded-full bg-mist px-3 py-1 font-mono text-xs text-ink-soft sm:inline">{businessName}</span>
        </div>
        <nav aria-label="Main" className="order-last w-full sm:order-none sm:w-auto">
          <ul className="flex rounded-full border border-line p-1">
            {link("/dashboard", "Overview", "dashboard")}
            {link("/brain", "Brand brain", "brain")}
          </ul>
        </nav>
        <form action={logout}>
          <button type="submit" className="rounded-full px-4 py-2 text-sm hover:bg-mist">
            Log out
          </button>
        </form>
      </div>
    </header>
  );
}
