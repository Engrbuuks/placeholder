import Link from "next/link";
import { appConfig } from "@/lib/config";

export function Wordmark({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="inline-flex items-center gap-2 text-[1.05rem] font-bold uppercase tracking-[0.02em] text-ink">
      <svg aria-hidden viewBox="0 0 20 20" className="h-5 w-5">
        <rect x="1" y="1" width="8" height="8" rx="1.5" fill="currentColor" />
        <rect x="11" y="11" width="8" height="8" rx="1.5" fill="var(--color-accent)" />
        <path d="M9 5h4.5a1.5 1.5 0 0 1 1.5 1.5V11" fill="none" stroke="var(--color-accent)" strokeWidth="1.6" />
      </svg>
      {appConfig.name}
    </Link>
  );
}

export function Arrow({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 16 16" className={className} fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M3 8h10M9 4l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ArrowUpRight({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 16 16" className={className} fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M5 11l6-6M6 5h5v5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
