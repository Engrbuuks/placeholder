import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { appConfig, auditConfig, languageCodes, markets } from "@/lib/config";
import { featureArt } from "@/components/illustrations";
import { scoreAudit } from "@/lib/audit/score";
import { SiteNav } from "@/components/SiteNav";
import { Arrow, Wordmark } from "@/components/Wordmark";
import { LeakList, ScoreHeadline } from "@/components/AuditReport";
import { DunesArt } from "@/components/art";
import { Illustration } from "@/components/Illustration";

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

const serviceIcons = [
  <svg key="a" aria-hidden viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.4">
    <circle cx="9" cy="12" r="5.5" />
    <circle cx="15" cy="12" r="5.5" />
  </svg>,
  <svg key="b" aria-hidden viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round">
    <path d="M12 3l8 4-8 4-8-4 8-4z" />
    <path d="M4 12l8 4 8-4M4 16.5l8 4 8-4" />
  </svg>,
  <svg key="c" aria-hidden viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.4">
    <circle cx="6" cy="17" r="2.5" />
    <circle cx="18" cy="17" r="2.5" />
    <circle cx="12" cy="6" r="2.5" />
    <path d="M10.8 8.2l-3.6 6.6M13.2 8.2l3.6 6.6" />
  </svg>,
];

const serviceStyles = [
  { card: "border border-line bg-surface text-ink", soft: "text-ink-soft", tag: "border border-ink/15 bg-mist" },
  { card: "bg-ink text-white", soft: "text-white/70", tag: "bg-white text-ink" },
  { card: "bg-accent text-ink", soft: "text-ink/75", tag: "bg-white text-ink" },
];

function Connector({ ring }: { ring: "accent" | "ink" }) {
  return (
    <div aria-hidden className="hidden items-center lg:flex">
      <span className="h-px w-4 border-t border-dashed border-ink/40" />
      <span
        className={`grid h-5 w-5 place-items-center rounded-full border-[1.5px] bg-paper ${ring === "accent" ? "border-accent" : "border-ink"}`}
      >
        {ring === "accent" && <span className="h-2 w-2 rounded-full bg-accent" />}
      </span>
      <span className="h-px w-4 border-t border-dashed border-ink/40" />
    </div>
  );
}

export default async function Home() {
  if (await getSession()) redirect("/dashboard");
  const copy = appConfig.landing;

  return (
    <div className="overflow-x-clip">
      <SiteNav />

      <main>
        {/* Hero */}
        <section className="mx-auto max-w-[1200px] px-4 sm:px-6">
          <div className="grid items-center gap-10 pb-10 pt-12 lg:grid-cols-[1fr_1.12fr] lg:gap-6 lg:pt-16">
            <div>
              <p className="label">
                {copy.eyebrow.map((line) => (
                  <span key={line} className="block">
                    {line}
                  </span>
                ))}
              </p>
              <h1 className="mt-6 max-w-[11ch] text-[clamp(2.75rem,6.2vw,4.9rem)]">{copy.headline}</h1>
              <p className="mt-6 max-w-[46ch] font-mono text-[0.875rem] leading-[1.75] text-ink-soft">{copy.intro}</p>
              <div className="mt-8 flex flex-wrap items-center gap-x-7 gap-y-4">
                <Link
                  href="/signup"
                  className="inline-flex items-center gap-2.5 rounded-full bg-accent px-6 py-3 font-medium text-white hover:bg-accent-deep"
                >
                  {copy.cta}
                  <Arrow />
                </Link>
                <a href={copy.secondaryCta.href} className="text-[0.9375rem] font-medium underline decoration-ink/30 underline-offset-[6px] hover:decoration-ink">
                  {copy.secondaryCta.label}
                </a>
              </div>
            </div>
            <div className="lg:-mr-4">
              <Illustration name="hero" alt={copy.heroImageAlt} sizes="(min-width: 1024px) 560px, 100vw" priority className="mx-auto h-auto w-full max-w-[560px] rounded-[28px]" />
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-4 pb-14">
            <div className="flex items-center gap-5">
              <span className="label text-ink">{copy.heroFooterLeft.replace("{countries}", String(Object.keys(markets).length)).replace("{languages}", String(languageCodes.length))}</span>
              <span aria-hidden className="hidden h-px w-40 bg-ink/25 sm:block" />
            </div>
            <p className="label">{copy.heroFooterRight.join("   /   ")}</p>
          </div>
        </section>

        {/* What it does */}
        <section id="features" className="mx-auto max-w-[1200px] scroll-mt-24 border-t border-line px-4 py-16 sm:px-6 sm:py-20">
          <div className="grid items-end gap-8 lg:grid-cols-[1.2fr_1fr_auto]">
            <div>
              <p className="label">{copy.features.kicker}</p>
              <h2 className="mt-3 max-w-[16ch] text-[clamp(2.1rem,4.2vw,3.25rem)]">{copy.features.heading}</h2>
            </div>
            <p className="max-w-[38ch] text-[0.9375rem] text-ink-soft lg:pb-2">{copy.features.intro}</p>
            <dl className="flex gap-0 lg:pb-1">
              <div className="border-l border-line pl-5 pr-7">
                <dt className="sr-only">{copy.features.statCountries}</dt>
                <dd className="text-[2.6rem] font-semibold leading-none tracking-[-0.04em]">{Object.keys(markets).length}</dd>
                <dd className="mt-1 max-w-[9ch] text-sm leading-tight text-ink-soft">{copy.features.statCountries}</dd>
              </div>
              <div className="border-l border-line pl-5">
                <dt className="sr-only">{copy.features.statChecks}</dt>
                <dd className="text-[2.6rem] font-semibold leading-none tracking-[-0.04em]">{auditConfig.checks.length}</dd>
                <dd className="mt-1 max-w-[11ch] text-sm leading-tight text-ink-soft">{copy.features.statChecks}</dd>
              </div>
            </dl>
          </div>

          <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {copy.features.items.map((f) => (
              <li key={f.title} className="flex flex-col overflow-hidden rounded-2xl border border-line bg-surface">
                <div className="bg-mist px-5 pb-2 pt-4">{(() => { const Art = featureArt[f.art]; return <Art />; })()}</div>
                <div className="flex flex-1 flex-col p-5">
                  <h3 className="text-lg tracking-[-0.02em]">{f.title}</h3>
                  <p className="mt-3 text-sm text-ink-soft">{f.body}</p>
                  <p className="label mt-auto pt-6">{f.tag}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        {/* Sample check */}
        <section id="check" className="mx-auto max-w-[1200px] scroll-mt-24 border-t border-line px-4 py-16 sm:px-6 sm:py-20">
          <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr]">
            <div>
              <p className="label">{copy.check.kicker}</p>
              <h2 className="mt-3 text-[clamp(2.1rem,4.2vw,3.25rem)]">{copy.check.heading}</h2>
              <p className="mt-5 max-w-[40ch] text-[0.9375rem] text-ink-soft">{copy.check.intro}</p>
              <Link
                href="/signup"
                className="mt-8 inline-flex items-center gap-2.5 rounded-full bg-ink px-5 py-2.5 text-[0.9375rem] font-medium text-white hover:bg-ink/85"
              >
                {copy.cta}
                <Arrow />
              </Link>
            </div>
            <div className="rounded-3xl border border-line bg-surface p-6 sm:p-8">
              <p className="label">{copy.check.caption}</p>
              <div className="mt-6">
                <ScoreHeadline score={sample.score} results={sample.results} />
              </div>
              <div className="mt-8">
                <LeakList results={sample.results} limit={3} />
              </div>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section id="how" className="mx-auto max-w-[1200px] scroll-mt-24 border-t border-line px-4 py-16 sm:px-6 sm:py-20">
          <div className="grid items-end gap-6 lg:grid-cols-[1.4fr_1fr]">
            <div>
              <p className="label">{copy.services.kicker}</p>
              <h2 className="mt-3 max-w-[16ch] text-[clamp(2.1rem,4.2vw,3.25rem)]">{copy.services.heading}</h2>
            </div>
            <p className="max-w-[44ch] text-[0.9375rem] text-ink-soft lg:pb-2">{copy.services.intro}</p>
          </div>
          <ol className="mt-12 grid gap-4 lg:grid-cols-[1fr_auto_1fr_auto_1fr] lg:gap-0">
            {copy.services.items.map((item, n) => {
              const style = serviceStyles[n];
              return (
                <li key={item.title} className="contents">
                  {n > 0 && <Connector ring={n === 1 ? "accent" : "ink"} />}
                  <div className={`flex min-h-64 flex-col rounded-2xl p-6 ${style.card}`}>
                    <div className="flex items-start justify-between">
                      <span className="font-mono text-sm">{String(n + 1).padStart(2, "0")}</span>
                      {serviceIcons[n]}
                    </div>
                    <h3 className="mt-6 text-[1.6rem] tracking-[-0.03em]">{item.title}</h3>
                    <p className={`mt-3 text-[0.9375rem] ${style.soft}`}>{item.body}</p>
                    <div className="mt-auto pt-8">
                      <span className={`inline-flex rounded-full px-3 py-1 font-mono text-[0.6875rem] uppercase tracking-[0.06em] ${style.tag}`}>
                        {item.tag}
                      </span>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>

        {/* Call to action band */}
        <section className="mx-auto max-w-[1240px] px-2 pb-6 sm:px-4">
          <div className="relative overflow-hidden rounded-[28px] bg-accent px-6 py-12 sm:px-10 lg:py-14">
            <div aria-hidden className="pointer-events-none absolute -right-20 -top-24 h-96 w-96 rounded-full bg-white/20 blur-3xl" />
            <div className="relative grid items-center gap-8 lg:grid-cols-[1.2fr_0.8fr_auto]">
              <div>
                <p className="label text-ink/70">{copy.band.kicker}</p>
                <h2 className="mt-3 max-w-[18ch] text-[clamp(2.1rem,4.4vw,3.4rem)] text-ink">{copy.band.heading}</h2>
                <p className="mt-4 max-w-[46ch] text-[0.9375rem] text-ink/80">{copy.band.body}</p>
                <div className="mt-8 flex flex-wrap items-center gap-5">
                  <Link
                    href="/signup"
                    className="inline-flex items-center gap-2.5 rounded-full bg-ink px-6 py-3 font-medium text-white hover:bg-ink/85"
                  >
                    {copy.band.cta}
                    <Arrow />
                  </Link>
                  <span aria-hidden className="h-6 w-px bg-ink/30" />
                  <span className="font-mono text-xs text-ink/80">{copy.band.note}</span>
                </div>
              </div>
              <div className="mx-auto w-full max-w-sm">
                <Illustration name="band_first_customer" alt={copy.band.imageAlt} sizes="(min-width: 1024px) 380px, 90vw" className="h-auto w-full rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.25)]" />
              </div>
              <div className="hidden lg:block">
                <p className="label text-ink/75">
                  {copy.band.side.map((line) => (
                    <span key={line} className="block">
                      {line}
                    </span>
                  ))}
                </p>
                <span aria-hidden className="mt-6 block h-px w-24 bg-ink/40" />
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="relative mt-2">
        <div className="relative z-10 mx-auto max-w-[1200px] px-4 sm:px-6">
          <div className="rounded-2xl border border-line bg-surface/85 px-6 py-6 backdrop-blur">
            <div className="flex flex-wrap items-center justify-between gap-5">
              <Wordmark />
              <nav aria-label="Footer">
                <ul className="flex flex-wrap gap-x-7 gap-y-2 text-sm">
                  {copy.footer.links.map((l) => (
                    <li key={l.label}>
                      <a href={l.href} className="hover:underline hover:underline-offset-4">
                        {l.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </nav>
              <p className="inline-flex items-center gap-2 text-sm">
                <svg aria-hidden viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.2">
                  <circle cx="8" cy="8" r="6.5" />
                  <path d="M1.5 8h13M8 1.5c2 2 2 11 0 13M8 1.5c-2 2-2 11 0 13" />
                </svg>
                {copy.footer.location}
              </p>
            </div>
            <div className="mt-6 flex justify-between gap-6">
              <p className="label">
                {copy.footer.tagline.map((line) => (
                  <span key={line} className="block">
                    {line}
                  </span>
                ))}
              </p>
              <p className="label text-right">
                {copy.footer.side.map((line) => (
                  <span key={line} className="block">
                    {line}
                  </span>
                ))}
              </p>
            </div>
          </div>
        </div>
        <div className="-mt-10">
          <DunesArt />
        </div>
      </footer>
    </div>
  );
}
