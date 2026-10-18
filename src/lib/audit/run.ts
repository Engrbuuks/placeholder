// Runs a full audit for a workspace: read the site safely, score it, and return facts for drafting.
import { auditConfig } from "../config";
import { analyzeHtml, type PageFacts } from "./analyze";
import { fetchPublicPage, BlockedAddressError } from "./safeFetch";
import { scoreAudit, type AuditOutcome, type PresenceInput } from "./score";

export type AuditRun = { outcome: AuditOutcome; pageText: string };

function friendlyFetchError(error: unknown): string {
  if (error instanceof BlockedAddressError) return error.message;
  const text = error instanceof Error ? `${error.name} ${error.message} ${String((error as { cause?: unknown }).cause ?? "")}` : "";
  if (/timeout|aborted/i.test(text)) return "Your website took too long to respond.";
  if (/ENOTFOUND|EAI_AGAIN/i.test(text)) return "That web address could not be found.";
  if (/certificate|SSL|TLS/i.test(text)) return "Your website's security certificate has a problem.";
  if (/did not return a web page|redirect/i.test(text) && error instanceof Error) return error.message;
  return "Your website could not be reached.";
}

export async function runAudit(presence: PresenceInput): Promise<AuditRun> {
  let facts: PageFacts = { fetched: false };
  let pageText = "";

  if (presence.websiteUrl) {
    try {
      const page = await fetchPublicPage(presence.websiteUrl, auditConfig.fetch);
      if (page.status >= 400) {
        facts = { fetched: false, error: `Your website returned an error (status ${page.status}).` };
      } else {
        const analyzed = analyzeHtml(page.html, page, auditConfig.keywords);
        facts = analyzed.facts;
        pageText = analyzed.text;
      }
    } catch (error) {
      facts = { fetched: false, error: friendlyFetchError(error) };
    }
  }

  return { outcome: scoreAudit(auditConfig, presence, facts), pageText };
}
