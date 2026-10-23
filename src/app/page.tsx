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

  const demo = copy.heroDemo;
  const delay = (ms: number) => ({ "--d": `${ms}ms` }) as React.CSSProperties;

  return (
    <div className="overflow-x-clip">
      <SiteNav />

      <main>
        {/* Hero: the headline asks the question, and the conversation over the picture answers it. */}
        <section className="mx-auto max-w-[1200px] px-4 sm:px-6">
          <div className="grid items-center gap-10 pb-14 pt-10 lg:grid-cols-2 lg:gap-14 lg:pt-14">
            <div>
              <h1 className="hero-in max-w-[12ch] text-[clamp(2.5rem,5.2vw,4.25rem)]" style={delay(0)}>
                {copy.headline}
              </h1>
              <p className="hero-in mt-5 max-w-[44ch] text-[1.0625rem] leading-relaxed text-ink-soft" style={delay(120)}>
                {copy.intro}
              </p>
              <div className="hero-in mt-7 flex flex-wrap items-center gap-x-6 gap-y-3" style={delay(220)}>
                <Link
                  href="/signup"
                  className="group inline-flex items-center gap-2.5 rounded-full bg-accent px-6 py-3 font-medium text-white transition-colors hover:bg-accent-deep"
                >
                  {copy.cta}
                  <span className="transition-transform group-hover:translate-x-0.5">
                    <Arrow />
                  </span>
                </Link>
                <a href={copy.secondaryCta.href} className="text-[0.9375rem] font-medium underline decoration-ink/30 underline-offset-[6px] hover:decoration-ink">
                  {copy.secondaryCta.label}
                </a>
              </div>
              <p className="hero-in mt-6 max-w-[48ch] text-sm text-ink-soft" style={delay(320)}>
                {copy.heroProof.replace("{countries}", String(Object.keys(markets).length)).replace("{languages}", String(languageCodes.length))}
              </p>
            </div>

            <div className="relative mx-auto w-full max-w-[540px]">
              <Illustration name="hero" alt={copy.heroImageAlt} sizes="(min-width: 1024px) 540px, 100vw" priority className="hero-art h-auto w-full rounded-[28px]" />
              <div role="group" aria-label={demo.label} className="absolute inset-x-3 bottom-3 flex flex-col gap-2 sm:inset-x-auto sm:-left-8 sm:bottom-8 sm:w-[19rem]">
                <div className="chip self-start rounded-2xl rounded-bl-md bg-surface px-3.5 py-2.5 text-sm shadow-[0_8px_24px_rgba(17,17,17,0.12)]" style={delay(900)}>
                  {demo.customer}
                  <span className="ml-2 font-mono text-[0.6875rem] text-ink-soft">{demo.customerTime}</span>
                </div>
                <div className="chip relative self-end rounded-2xl rounded-br-md bg-accent px-3.5 py-2.5 text-sm text-white shadow-[0_8px_24px_rgba(217,71,10,0.28)]" style={delay(1500)}>
                  <span aria-hidden className="typing absolute inset-0 flex items-center gap-1 px-3.5">
                    <i />
                    <i />
                    <i />
                  </span>
                  <span className="reply-text block">
                    {demo.reply}
                    <span className="mt-1 block font-mono text-[0.6875rem] text-white/80">
                      {demo.replyNote} / {demo.replyTime}
                    </span>
                  </span>
                </div>
                <div className="chip inline-flex items-center gap-2 self-start rounded-full bg-ink px-3.5 py-2 text-sm font-medium text-white shadow-[0_8px_24px_rgba(17,17,17,0.2)]" style={delay(3000)}>
                  <svg aria-hidden viewBox="0 0 16 16" className="h-4 w-4 text-accent" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3.5 8.5l3 3 6-7" />
                  </svg>
                  {demo.booked}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* What it does */}
        <section id="features" className="mx-auto max-w-[1200px] scroll-mt-24 border-t border-line px-4 py-14 sm:px-6">
          <div className="grid items-end gap-4 lg:grid-cols-[1.1fr_1fr]">
            <h2 className="max-w-[18ch] text-[clamp(1.9rem,3.4vw,2.6rem)]">{copy.features.heading}</h2>
            <p className="max-w-[46ch] text-[0.9375rem] text-ink-soft lg:justify-self-end lg:pb-1">{copy.features.intro}</p>
          </div>
          <ul className="mt-9 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {copy.features.items.map((f) => {
              const Art = featureArt[f.art];
              return (
                <li key={f.title} className="grid grid-cols-[7.5rem_minmax(0,1fr)] overflow-hidden rounded-2xl border border-line bg-surface sm:block">
                  <div className="feature-art grid place-items-center bg-mist px-2 sm:block sm:px-5 sm:pb-1 sm:pt-3">
                    <Art />
                  </div>
                  <div className="p-4 sm:p-5">
                    <h3 className="text-[1.0625rem] tracking-[-0.02em]">{f.title}</h3>
                    <p className="mt-2 text-sm text-ink-soft">{f.body}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        {/* How it works */}
        <section id="how" className="mx-auto max-w-[1200px] scroll-mt-24 border-t border-line px-4 py-14 sm:px-6">
          <div className="grid items-end gap-4 lg:grid-cols-[1.1fr_1fr]">
            <h2 className="max-w-[18ch] text-[clamp(1.9rem,3.4vw,2.6rem)]">{copy.services.heading}</h2>
            <p className="max-w-[46ch] text-[0.9375rem] text-ink-soft lg:justify-self-end lg:pb-1">{copy.services.intro}</p>
          </div>
          <ol className="mt-9 grid gap-4 lg:grid-cols-[1fr_auto_1fr_auto_1fr] lg:gap-0">
            {copy.services.items.map((item, n) => {
              const style = serviceStyles[n];
              return (
                <li key={item.title} className="contents">
                  {n > 0 && <Connector ring={n === 1 ? "accent" : "ink"} />}
                  <div className={`flex flex-col rounded-2xl p-6 ${style.card}`}>
                    <div className="flex items-start justify-between">
                      <span className="font-mono text-sm">{String(n + 1).padStart(2, "0")}</span>
                      {serviceIcons[n]}
                    </div>
                    <h3 className="mt-5 text-[1.375rem] tracking-[-0.03em]">{item.title}</h3>
                    <p className={`mt-2 text-[0.9375rem] ${style.soft}`}>{item.body}</p>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>

        {/* Sample check */}
        <section id="check" className="mx-auto max-w-[1200px] scroll-mt-24 border-t border-line px-4 py-14 sm:px-6">
          <div className="grid items-center gap-8 lg:grid-cols-[0.85fr_1.15fr] lg:gap-12">
            <div>
              <h2 className="text-[clamp(1.9rem,3.4vw,2.6rem)]">{copy.check.heading}</h2>
              <p className="mt-4 max-w-[40ch] text-[0.9375rem] text-ink-soft">{copy.check.intro}</p>
              <Link
                href="/signup"
                className="group mt-6 inline-flex items-center gap-2.5 rounded-full bg-ink px-5 py-2.5 text-[0.9375rem] font-medium text-white transition-colors hover:bg-ink/85"
              >
                {copy.cta}
                <span className="transition-transform group-hover:translate-x-0.5">
                  <Arrow />
                </span>
              </Link>
            </div>
            <div className="rounded-3xl border border-line bg-surface p-6 sm:p-7">
              <p className="text-sm text-ink-soft">{copy.check.caption}</p>
              <div className="mt-4">
                <ScoreHeadline score={sample.score} results={sample.results} />
              </div>
              <div className="mt-6">
                <LeakList results={sample.results} limit={3} />
              </div>
            </div>
          </div>
        </section>

        {/* Call to action band */}
        <section className="mx-auto max-w-[1240px] px-2 pb-6 sm:px-4">
          <div className="relative overflow-hidden rounded-[28px] bg-accent px-6 py-10 sm:px-10">
            <div aria-hidden className="pointer-events-none absolute -right-20 -top-24 h-96 w-96 rounded-full bg-white/20 blur-3xl" />
            <div className="relative grid items-center gap-8 lg:grid-cols-[1.3fr_0.7fr]">
              <div>
                <h2 className="max-w-[20ch] text-[clamp(1.9rem,3.6vw,2.8rem)] text-ink">{copy.band.heading}</h2>
                <p className="mt-4 max-w-[46ch] text-[0.9375rem] text-ink/80">{copy.band.body}</p>
                <div className="mt-7 flex flex-wrap items-center gap-5">
                  <Link
                    href="/signup"
                    className="group inline-flex items-center gap-2.5 rounded-full bg-ink px-6 py-3 font-medium text-white transition-colors hover:bg-ink/85"
                  >
                    {copy.band.cta}
                    <span className="transition-transform group-hover:translate-x-0.5">
                      <Arrow />
                    </span>
                  </Link>
                  <span className="text-sm text-ink/80">{copy.band.note}</span>
                </div>
              </div>
              <div className="mx-auto w-full max-w-[340px]">
                <Illustration name="band_first_customer" alt={copy.band.imageAlt} sizes="(min-width: 1024px) 340px, 90vw" className="h-auto w-full rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.25)]" />
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="relative mt-2">
        <div className="relative z-10 mx-auto max-w-[1200px] px-4 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-5 rounded-2xl border border-line bg-surface/85 px-6 py-5 backdrop-blur">
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
            <p className="text-sm text-ink-soft">{copy.footer.location}</p>
          </div>
        </div>
        <div className="-mt-10">
          <DunesArt />
        </div>
      </footer>
    </div>
  );
}
