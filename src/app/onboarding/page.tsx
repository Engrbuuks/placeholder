import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { appConfig, getPack, packsForMarket } from "@/lib/config";
import { exampleConsultationPrice } from "@/lib/marketOptions";
import { marketOptions } from "@/lib/marketOptions";
import { getBrandBrain, getWorkspace, latestAudits, type OnboardingStep } from "@/lib/workspaces";
import { brainFormValues } from "@/lib/brainView";
import { goBack } from "@/app/actions/onboarding";
import { Wordmark } from "@/components/Wordmark";
import { MarketStep, NicheStep, PresenceStep } from "@/components/OnboardingSteps";
import { BrainForm } from "@/components/BrainForm";
import { LeakBar } from "@/components/AuditReport";

export const metadata: Metadata = { title: "Set up your business" };
// The presence step reads the owner's website and may call the AI, so allow it time.
export const maxDuration = 60;

const steps: { id: Exclude<OnboardingStep, "done">; label: string }[] = [
  { id: "market", label: "Where you trade" },
  { id: "niche", label: "What you do" },
  { id: "presence", label: "Where customers find you" },
  { id: "brain", label: "Check your details" },
];

function BackLink({ to, label }: { to: string; label: string }) {
  return (
    <form action={goBack}>
      <input type="hidden" name="to" value={to} />
      <button type="submit" className="text-[0.9375rem] font-medium underline decoration-ink/30 underline-offset-[6px] hover:decoration-ink">
        {label}
      </button>
    </form>
  );
}

export default async function OnboardingPage() {
  const session = await requireSession();
  const workspace = await getWorkspace(session.workspaceId);
  if (!workspace) redirect("/login");
  if (workspace.onboardingStep === "done") redirect("/dashboard");

  const step = workspace.onboardingStep;
  const index = steps.findIndex((s) => s.id === step);
  const pack = getPack(workspace.nichePack, workspace.country);

  let body: React.ReactNode;
  let heading: string;
  let intro: string;

  if (step === "market") {
    heading = "Where does your business trade?";
    intro = "This sets your currency, time zone, language, payments and the data protection rules your assistant follows.";
    body = (
      <MarketStep
        options={marketOptions()}
        current={{ country: workspace.country, timeZone: workspace.chosenTimeZone, language: workspace.language }}
      />
    );
  } else if (step === "niche") {
    heading = "What kind of business do you run?";
    intro = "We set up your assistant, follow ups and content around how your kind of business wins customers.";
    const options = packsForMarket(workspace.country).map((p) => ({ id: p.id, name: p.name, description: p.description }));
    body = <NicheStep options={options} current={workspace.nichePack} />;
  } else if (step === "presence") {
    heading = "Where do customers find you?";
    intro = "We will check each of these for places you may be losing enquiries. Add whatever you have.";
    body = (
      <PresenceStep website={workspace.websiteUrl} instagram={workspace.instagramUrl} google={workspace.googleProfileUrl} />
    );
  } else {
    heading = "Check what your assistant will know";
    const brain = await getBrandBrain(session.workspaceId);
    const [audit] = await latestAudits(session.workspaceId, 1);
    intro =
      brain.draftSource === "manual"
        ? "Fill in what customers ask about most. Your assistant will only use facts you confirm here."
        : "We filled in what we could from your website. Correct anything that is wrong and add what is missing.";
    body = (
      <div className="space-y-10">
        {audit && (
          <div className="rounded-3xl bg-ink p-6 text-white sm:p-8">
            <div className="flex items-end gap-5">
              <p className="text-[4rem] font-semibold leading-[0.8] tracking-[-0.06em]">{audit.score}</p>
              <div>
                <p className="font-mono text-[0.6875rem] uppercase tracking-[0.06em] text-white/60">Your check, out of 100</p>
                <p className="mt-1 text-[0.9375rem] text-white/80">You will see every leak and its fix when you finish.</p>
              </div>
            </div>
            {audit.facts.error && <p className="mt-4 text-[0.9375rem] text-white/80">{audit.facts.error}</p>}
            <div className="mt-6 [&_.bg-ink]:bg-white">
              <LeakBar results={audit.results} label={`Score ${audit.score} out of 100`} />
            </div>
          </div>
        )}
        <BrainForm values={brainFormValues(brain.data)} intake={pack.intake} tones={appConfig.tones} confirmLabel="Confirm and finish" examplePrice={exampleConsultationPrice(workspace.country)} />
      </div>
    );
  }

  const previous = index > 0 ? steps[index - 1] : null;
  const pad = (n: number) => String(n).padStart(2, "0");

  return (
    <div className="mx-auto max-w-[760px] px-4 pb-20 pt-4 sm:px-6">
      <header className="flex items-center justify-between rounded-full border border-line bg-surface/80 py-2.5 pl-5 pr-5 backdrop-blur">
        <Wordmark href="/onboarding" />
        <p className="font-mono text-xs text-ink-soft">
          <span className="text-ink">{pad(index + 1)}</span> / {pad(steps.length)}
        </p>
      </header>

      <main className="pt-12">
        <ol className="grid grid-cols-4 gap-2" aria-label="Setup progress">
          {steps.map((s, i) => (
            <li key={s.id} aria-current={i === index ? "step" : undefined}>
              <span aria-hidden className={`block h-1 rounded-full ${i < index ? "bg-ink" : i === index ? "bg-accent" : "bg-line"}`} />
              <span className={`mt-2 block font-mono text-[0.6875rem] uppercase tracking-[0.06em] ${i === index ? "text-ink" : "text-ink-soft"}`}>
                <span className="sr-only">{i < index ? "Done: " : i === index ? "Current: " : "Next: "}</span>
                <span className="hidden sm:inline">{s.label}</span>
                <span className="sm:hidden">{pad(i + 1)}</span>
              </span>
            </li>
          ))}
        </ol>

        <h1 className="mt-12 max-w-[18ch] text-[clamp(2.1rem,4.2vw,3.1rem)]">{heading}</h1>
        <p className="mt-4 max-w-[56ch] text-ink-soft">{intro}</p>
        <div className="mt-10">{body}</div>

        {previous && (
          <div className="mt-10">
            <BackLink to={previous.id} label={`Back to ${previous.label.toLowerCase()}`} />
          </div>
        )}
      </main>
    </div>
  );
}
