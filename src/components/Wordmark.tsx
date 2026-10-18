import Link from "next/link";
import { appConfig } from "@/lib/config";

export function Wordmark({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="inline-flex items-center gap-2 font-display text-xl font-extrabold text-ink">
      <span aria-hidden className="grid h-7 w-7 place-items-center rounded-full bg-ink">
        <span className="h-2.5 w-2.5 rounded-full bg-sun" />
      </span>
      {appConfig.name}
    </Link>
  );
}
