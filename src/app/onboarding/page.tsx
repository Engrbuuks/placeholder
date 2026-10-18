import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { appConfig, getPack, markets, packsForMarket, type MarketCode } from "@/lib/config";
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
      <button type="submit" className="font-bold underline underline-offset-4">
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
  const pack = getPack(workspace.nichePack);

  let body: React.ReactNode;
  let heading: string;
  let intro: string;

  if (step === "market") {
    heading = "Where does your business trade?";
    intro = "This sets your currency, payments and data protection rules.";
    const options = (Object.keys(markets) as MarketCode[]).map((code) => ({
      code,
      name: markets[code].name,
      detail: `Prices in ${markets[code].currencySymbol}, payments through ${markets[code].paymentProvider}.`,
    }));
    body = <MarketStep options={options} current={workspace.country} />;
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
          <div className="rounded-2xl bg-surface p-5">
            <p className="font-bold">Your check scored {audit.score} out of 100.</p>
            {audit.facts.error && <p className="text-ink-soft">{audit.facts.error}</p>}
            <div className="mt-3">
              <LeakBar results={audit.results} label={`Score ${audit.score} out of 100`} />
            </div>
            <p className="mt-3 text-sm text-ink-soft">You will see every leak and how to fix it once you finish this step.</p>
          </div>
        )}
        <BrainForm values={brainFormValues(brain.data)} intake={pack.intake} tones={appConfig.tones} confirmLabel="Confirm and finish" />
      </div>
    );
  }

  const previous = index > 0 ? steps[index - 1] : null;

  return (
    <main className="mx-auto max-w-2xl px-5 py-10">
      <Wordmark href="/onboarding" />
      <ol className="mt-10 flex flex-wrap gap-x-6 gap-y-2" aria-label="Setup progress">
        {steps.map((s, i) => (
          <li
            key={s.id}
            aria-current={i === index ? "step" : undefined}
            className={`flex items-center gap-2 ${i === index ? "font-bold text-ink" : i < index ? "text-ink" : "text-ink-soft"}`}
          >
            <span
              aria-hidden
              className={`grid h-7 w-7 place-items-center rounded-full text-sm font-bold ${
                i < index ? "bg-signal text-paper" : i === index ? "bg-ink text-paper" : "border-2 border-line"
              }`}
            >
              {i + 1}
            </span>
            {s.label}
          </li>
        ))}
      </ol>

      <h1 className="mt-10 text-4xl font-extrabold">{heading}</h1>
      <p className="mt-3 text-lg text-ink-soft">{intro}</p>
      <div className="mt-8">{body}</div>

      {previous && (
        <div className="mt-10">
          <BackLink to={previous.id} label={`Back to ${previous.label.toLowerCase()}`} />
        </div>
      )}
    </main>
  );
}
