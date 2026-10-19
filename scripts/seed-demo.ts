// Creates a demo business with six weeks of check history, for previews and pilot demos.
// Every score is produced by the real scoring code from a made up website that improves over time.
// Refuses to run in production unless --force is passed.
import { readFileSync } from "node:fs";
import { join } from "node:path";

function loadEnvFile() {
  try {
    const text = readFileSync(join(process.cwd(), ".env"), "utf8");
    for (const line of text.split("\n")) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2];
    }
  } catch {
    // Use the environment as it is.
  }
}

async function main() {
  loadEnvFile();
  if (process.env.NODE_ENV === "production" && !process.argv.includes("--force")) {
    throw new Error("This adds a demo account. Pass --force to run it in production.");
  }

  const { getPool, globalQuery, withTenant } = await import("../src/lib/db");
  const { hashPassword } = await import("../src/lib/auth");
  const { auditConfig } = await import("../src/lib/config");
  const { scoreAudit } = await import("../src/lib/audit/score");
  const { createAccountWithWorkspace } = await import("../src/lib/workspaces");

  const email = "demo@placeholder.test";
  const password = "demo password 2026";
  const existing = await globalQuery<{ id: string }>("select id from users where email = $1", [email]);
  if (existing.rowCount) {
    console.log(`Demo account already exists. Log in as ${email} with "${password}".`);
    await getPool().end();
    return;
  }

  const account = await createAccountWithWorkspace({
    email,
    passwordHash: await hashPassword(password),
    fullName: "Demo Owner",
    businessName: "Lekki Gardens Homes",
  });
  if (!account) throw new Error("Could not create the demo account.");

  const presenceEarly = { websiteUrl: "https://lekkigardens.example", instagramUrl: null, googleProfileUrl: null };
  const presenceLater = { ...presenceEarly, instagramUrl: "https://instagram.com/lekkigardens" };

  // The site gets better step by step, the way a pilot client's would.
  const steps = [
    { daysAgo: 42, presence: presenceEarly, facts: { fetched: true, https: true, responseMs: 4200, bytes: 2_400_000, title: "Home", viewport: false } },
    { daysAgo: 37, presence: presenceEarly, facts: { fetched: true, https: true, responseMs: 3900, bytes: 2_300_000, title: "Home", viewport: true } },
    { daysAgo: 31, presence: presenceEarly, facts: { fetched: false, error: "Your website took too long to respond." } },
    { daysAgo: 28, presence: presenceLater, facts: { fetched: true, https: true, responseMs: 3100, bytes: 1_900_000, title: "Lekki Gardens Homes | Verified plots in Lekki", viewport: true, whatsappNumbers: ["2348000000000"] } },
    { daysAgo: 21, presence: presenceLater, facts: { fetched: true, https: true, responseMs: 2900, bytes: 1_400_000, title: "Lekki Gardens Homes | Verified plots in Lekki", viewport: true, whatsappNumbers: ["2348000000000"], phoneNumbers: ["+2348000000000"], socialLinks: ["https://instagram.com/lekkigardens"] } },
    { daysAgo: 14, presence: presenceLater, facts: { fetched: true, https: true, responseMs: 2200, bytes: 1_200_000, title: "Lekki Gardens Homes | Verified plots in Lekki", description: "Verified plots and duplexes in Lekki with flexible payment plans for buyers at home and abroad.", viewport: true, whatsappNumbers: ["2348000000000"], phoneNumbers: ["+2348000000000"], bookingCta: true, socialLinks: ["https://instagram.com/lekkigardens"] } },
    { daysAgo: 6, presence: presenceLater, facts: { fetched: true, https: true, responseMs: 1900, bytes: 1_100_000, title: "Lekki Gardens Homes | Verified plots in Lekki", description: "Verified plots and duplexes in Lekki with flexible payment plans for buyers at home and abroad.", viewport: true, whatsappNumbers: ["2348000000000"], phoneNumbers: ["+2348000000000"], bookingCta: true, hasForm: true, socialLinks: ["https://instagram.com/lekkigardens"], ogImage: true } },
    { daysAgo: 2, presence: presenceLater, facts: { fetched: true, https: true, responseMs: 1700, bytes: 1_000_000, title: "Lekki Gardens Homes | Verified plots in Lekki", description: "Verified plots and duplexes in Lekki with flexible payment plans for buyers at home and abroad.", viewport: true, whatsappNumbers: ["2348000000000"], phoneNumbers: ["+2348000000000"], bookingCta: true, hasForm: true, socialLinks: ["https://instagram.com/lekkigardens"], ogImage: true, hasReviews: true } },
    { daysAgo: 0.02, presence: presenceLater, facts: { fetched: true, https: true, responseMs: 1500, bytes: 950_000, title: "Lekki Gardens Homes | Verified plots in Lekki", description: "Verified plots and duplexes in Lekki with flexible payment plans for buyers at home and abroad.", viewport: true, whatsappNumbers: ["2348000000000"], phoneNumbers: ["+2348000000000"], bookingCta: true, hasForm: true, socialLinks: ["https://instagram.com/lekkigardens"], ogImage: true, hasReviews: true, mapsLink: "https://maps.app.goo.gl/demo" } },
  ];

  await withTenant(account.workspaceId, async (c) => {
    await c.query(
      `update workspaces set country = 'NG', niche_pack = 'real_estate', website_url = $2, instagram_url = $3, onboarding_step = 'done' where id = $1`,
      [account.workspaceId, presenceLater.websiteUrl, presenceLater.instagramUrl],
    );
    await c.query(
      `update brand_brains set status = 'confirmed', confirmed_at = now(), data = $2 where workspace_id = $1`,
      [
        account.workspaceId,
        JSON.stringify({
          businessName: "Lekki Gardens Homes",
          summary: "We sell verified plots and duplexes in Lekki, with payment plans for buyers at home and abroad.",
          whatsapp: "+2348000000000",
          phone: "+2348000000000",
          hours: "Mon to Sat 9am to 6pm",
          services: [
            { name: "Dry land plot, 500sqm", price: "₦25,000,000" },
            { name: "3 bedroom terrace", price: "₦85,000,000" },
          ],
          faqs: [{ q: "Do you offer virtual inspections?", a: "Yes, by video call any weekday." }],
          tone: "warm",
          answers: { titleDocuments: "C of O", paymentPlans: "30% deposit, balance over 12 months" },
        }),
      ],
    );
    for (const step of steps) {
      const outcome = scoreAudit(auditConfig, step.presence, step.facts);
      await c.query(
        `insert into audit_reports (workspace_id, target_url, score, results, facts, created_at)
         values ($1, $2, $3, $4, $5, now() - make_interval(secs => $6))`,
        [account.workspaceId, step.presence.websiteUrl, outcome.score, JSON.stringify(outcome.results), JSON.stringify(outcome.facts), Math.round(step.daysAgo * 86400)],
      );
    }
  });

  // Real conversations, run through the real engine, so the inbox and automations pages have something to show.
  const { ensureWebchat } = await import("../src/lib/webchat");
  const { handleInbound } = await import("../src/lib/pipeline/engine");
  const { setStage } = await import("../src/lib/pipeline/owner");
  await ensureWebchat(account.workspaceId);
  const { randomUUID } = await import("node:crypto");
  const chat = async (visitor: string, lines: string[]) => {
    let leadId = "";
    for (const text of lines) leadId = (await handleInbound({ workspaceId: account.workspaceId, channel: "webchat", externalId: visitor, text })).leadId ?? leadId;
    return leadId;
  };
  const amaka = await chat(randomUUID(), [
    "Hi, my name is Amaka. How much is the 3 bedroom terrace?",
    "Around 90 million",
    "United Kingdom",
    "To live in when I move back",
    "Within six months",
    "Payment plan",
  ]);
  const booked = new Date(Date.now() + 3 * 24 * 3600_000);
  booked.setUTCHours(10, 0, 0, 0);
  await setStage(account.workspaceId, amaka, "booked", booked);
  await chat(randomUUID(), ["Hello, do you offer virtual inspections?", "I'm Tunde. About 25 million", "Nigeria, Lagos"]);
  await chat(randomUUID(), ["I paid a deposit last month and nobody has called me. I want to speak to a person."]);
  await chat(randomUUID(), ["Is the road to the estate tarred?"]);

  console.log(`Demo business created. Log in as ${email} with "${password}".`);
  await getPool().end();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
