import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { appConfig, auditConfig, packs } from "@/lib/config";
import { scoreAudit } from "@/lib/audit/score";
import { Wordmark } from "@/components/Wordmark";
import { LeakList, ScoreHeadline } from "@/components/AuditReport";

// A typical small business site, used to show what the audit finds.
const sample = scoreAudit(
  auditConfig,
  { websiteUrl: "https://example.com", instagramUrl: "https://instagram.com/example", googleProfileUrl: null },
  {
    fetched: true,
    https: true,
    responseMs: 3400,
    bytes: 900_000,
    title: "Home",
    description: "",
    viewport: true,
    whatsappNumbers: [],
    phoneNumbers: ["+2348000000000"],
    bookingCta: false,
    hasForm: true,
    socialLinks: ["https://instagram.com/example"],
    hasReviews: false,
    analytics: false,
    ogImage: true,
  },
);

export default async function Home() {
  if (await getSession()) redirect("/dashboard");
  const copy = appConfig.landing;

  return (
    <main>
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-6">
        <Wordmark />
        <Link href="/login" className="font-bold underline underline-offset-4">
          Log in
        </Link>
      </header>

      <section className="mx-auto grid max-w-6xl gap-12 px-5 pb-20 pt-8 lg:grid-cols-[1.1fr_1fr] lg:pt-16">
        <div className="max-w-xl">
          <h1 className="text-5xl font-extrabold sm:text-6xl">{copy.headline}</h1>
          <p className="mt-6 text-xl text-ink-soft">{appConfig.tagline}</p>
          <p className="mt-4 text-lg">{copy.intro}</p>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <Link href="/signup" className="rounded-full bg-ink px-7 py-3.5 text-lg font-bold text-paper hover:bg-ink/90">
              {copy.cta}
            </Link>
            <p className="text-ink-soft">{copy.audience}</p>
          </div>
        </div>

        <div className="rounded-3xl bg-surface p-6 shadow-[0_1px_0_var(--color-line)] sm:p-8">
          <p className="text-ink-soft">{copy.sampleCaption}</p>
          <div className="mt-4">
            <ScoreHeadline score={sample.score} results={sample.results} />
          </div>
          <div className="mt-6">
            <LeakList results={sample.results} limit={3} />
          </div>
        </div>
      </section>

      <section className="border-t-2 border-line bg-surface">
        <div className="mx-auto max-w-6xl px-5 py-16">
          <h2 className="text-3xl font-bold">{copy.packsHeading}</h2>
          <ul className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {packs.map((p) => (
              <li key={p.id}>
                <p className="font-display text-xl font-bold">{p.shortName}</p>
                <p className="mt-1 text-ink-soft">{p.description}</p>
                <p className="mt-2 text-sm">
                  {copy.packGoalPrefix} <span className="font-bold">{p.conversionAction.toLowerCase()}</span>
                </p>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </main>
  );
}
