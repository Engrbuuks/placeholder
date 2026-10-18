import Link from "next/link";
import { logout } from "@/app/actions/auth";
import { Wordmark } from "./Wordmark";

export function AppHeader({ businessName, active }: { businessName: string; active: "dashboard" | "brain" }) {
  const link = (href: string, label: string, id: typeof active) => (
    <Link
      href={href}
      aria-current={active === id ? "page" : undefined}
      className={`rounded-full px-4 py-2 font-bold ${active === id ? "bg-ink text-paper" : "hover:bg-ink/5"}`}
    >
      {label}
    </Link>
  );
  return (
    <header className="border-b-2 border-line bg-surface">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-4">
        <div className="flex items-center gap-4">
          <Wordmark href="/dashboard" />
          <span className="hidden text-ink-soft sm:inline">{businessName}</span>
        </div>
        <nav className="flex flex-wrap items-center gap-1" aria-label="Main">
          {link("/dashboard", "Overview", "dashboard")}
          {link("/brain", "Brand brain", "brain")}
          <form action={logout}>
            <button type="submit" className="rounded-full px-4 py-2 font-bold hover:bg-ink/5">
              Log out
            </button>
          </form>
        </nav>
      </div>
    </header>
  );
}
