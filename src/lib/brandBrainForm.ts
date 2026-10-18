// Reads the brand brain form. Kept separate from the action so it can be tested without a request.
import { brandBrainSchema, missingEssentials, parseFaqLines, parseServiceLines, type BrandBrain } from "./brandBrain";
import { appConfig, type NichePack } from "./config";

export type BrainFormResult = { ok: true; brain: BrandBrain; missing: string[] } | { ok: false; error: string };

const text = (formData: FormData, key: string) => String(formData.get(key) ?? "");

export function brandBrainFromForm(formData: FormData, pack: NichePack): BrainFormResult {
  const tone = text(formData, "tone");
  const answers: Record<string, string> = {};
  for (const field of pack.intake) {
    const value = text(formData, `answer_${field.key}`).trim();
    if (value) answers[field.key] = value;
  }

  const parsed = brandBrainSchema.safeParse({
    businessName: text(formData, "businessName"),
    summary: text(formData, "summary"),
    phone: text(formData, "phone"),
    whatsapp: text(formData, "whatsapp"),
    email: text(formData, "email"),
    address: text(formData, "address"),
    hours: text(formData, "hours"),
    services: parseServiceLines(text(formData, "services")),
    faqs: parseFaqLines(text(formData, "faqs")),
    tone: appConfig.tones.some((t) => t.id === tone) ? tone : "",
    answers,
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: `Check the ${String(issue.path[0] ?? "form")} field: it is too long or incomplete.` };
  }
  return { ok: true, brain: parsed.data, missing: missingEssentials(parsed.data) };
}
