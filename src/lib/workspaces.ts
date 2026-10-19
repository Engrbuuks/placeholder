// Tenant scoped data access. Every function here runs inside withTenant.
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { withTenant } from "./db";
import { brandBrainSchema, parseStoredBrandBrain, type BrandBrain, type DraftSource } from "./brandBrain";
import type { MarketCode } from "./config";
import type { AuditOutcome } from "./audit/score";

export type OnboardingStep = "market" | "niche" | "presence" | "brain" | "done";

export type Workspace = {
  id: string;
  name: string;
  country: MarketCode | null;
  nichePack: string | null;
  websiteUrl: string | null;
  instagramUrl: string | null;
  googleProfileUrl: string | null;
  onboardingStep: OnboardingStep;
  createdAt: Date;
};

type WorkspaceRow = {
  id: string;
  name: string;
  country: MarketCode | null;
  niche_pack: string | null;
  website_url: string | null;
  instagram_url: string | null;
  google_profile_url: string | null;
  onboarding_step: OnboardingStep;
  created_at: Date;
};

function toWorkspace(row: WorkspaceRow): Workspace {
  return {
    id: row.id,
    name: row.name,
    country: row.country,
    nichePack: row.niche_pack,
    websiteUrl: row.website_url,
    instagramUrl: row.instagram_url,
    googleProfileUrl: row.google_profile_url,
    onboardingStep: row.onboarding_step,
    createdAt: row.created_at,
  };
}

/**
 * Creates the user, their workspace, the owner membership and an empty brand brain in one transaction,
 * so a failed signup never leaves half an account behind. Returns null when the email is taken.
 */
export async function createAccountWithWorkspace(input: {
  email: string;
  passwordHash: string;
  fullName: string;
  businessName: string;
}): Promise<{ userId: string; workspaceId: string } | null> {
  const workspaceId = randomUUID();
  return withTenant(workspaceId, async (c) => {
    const user = await c.query<{ id: string }>(
      "insert into users (email, password_hash, full_name) values ($1, $2, $3) on conflict (email) do nothing returning id",
      [input.email, input.passwordHash, input.fullName],
    );
    if (!user.rows[0]) return null;
    const userId = user.rows[0].id;
    await c.query("insert into workspaces (id, name) values ($1, $2)", [workspaceId, input.businessName]);
    await c.query("insert into memberships (workspace_id, user_id, role) values ($1, $2, 'owner')", [workspaceId, userId]);
    await c.query("insert into brand_brains (workspace_id, data) values ($1, $2)", [
      workspaceId,
      JSON.stringify({ businessName: input.businessName }),
    ]);
    return { userId, workspaceId };
  });
}

/** Adds a further workspace for an existing user, for example a second business. */
export async function createWorkspaceWithOwner(name: string, ownerUserId: string): Promise<string> {
  const workspaceId = randomUUID();
  await withTenant(workspaceId, async (c) => {
    await c.query("insert into workspaces (id, name) values ($1, $2)", [workspaceId, name]);
    await c.query("insert into memberships (workspace_id, user_id, role) values ($1, $2, 'owner')", [
      workspaceId,
      ownerUserId,
    ]);
    await c.query("insert into brand_brains (workspace_id, data) values ($1, $2)", [
      workspaceId,
      JSON.stringify({ businessName: name }),
    ]);
  });
  return workspaceId;
}

export async function getWorkspace(workspaceId: string): Promise<Workspace | null> {
  return withTenant(workspaceId, async (c) => {
    const { rows } = await c.query<WorkspaceRow>("select * from workspaces where id = $1", [workspaceId]);
    return rows[0] ? toWorkspace(rows[0]) : null;
  });
}

type WorkspaceUpdate = Partial<{
  name: string;
  country: MarketCode;
  nichePack: string;
  websiteUrl: string | null;
  instagramUrl: string | null;
  googleProfileUrl: string | null;
  onboardingStep: OnboardingStep;
}>;

const columnFor: Record<keyof WorkspaceUpdate, string> = {
  name: "name",
  country: "country",
  nichePack: "niche_pack",
  websiteUrl: "website_url",
  instagramUrl: "instagram_url",
  googleProfileUrl: "google_profile_url",
  onboardingStep: "onboarding_step",
};

export async function updateWorkspace(workspaceId: string, update: WorkspaceUpdate): Promise<void> {
  const keys = (Object.keys(update) as (keyof WorkspaceUpdate)[]).filter((k) => update[k] !== undefined);
  if (keys.length === 0) return;
  const sets = keys.map((k, i) => `${columnFor[k]} = $${i + 2}`).join(", ");
  const values = keys.map((k) => update[k]);
  await withTenant(workspaceId, (c) => c.query(`update workspaces set ${sets} where id = $1`, [workspaceId, ...values]));
}

export type StoredBrandBrain = {
  data: BrandBrain;
  draftSource: DraftSource;
  status: "draft" | "confirmed";
  confirmedAt: Date | null;
  updatedAt: Date;
};

export async function getBrandBrain(workspaceId: string): Promise<StoredBrandBrain> {
  return withTenant(workspaceId, async (c) => {
    const { rows } = await c.query<{
      data: unknown;
      draft_source: DraftSource;
      status: "draft" | "confirmed";
      confirmed_at: Date | null;
      updated_at: Date;
    }>("select data, draft_source, status, confirmed_at, updated_at from brand_brains where workspace_id = $1", [
      workspaceId,
    ]);
    const row = rows[0];
    return {
      data: parseStoredBrandBrain(row?.data),
      draftSource: row?.draft_source ?? "manual",
      status: row?.status ?? "draft",
      confirmedAt: row?.confirmed_at ?? null,
      updatedAt: row?.updated_at ?? new Date(),
    };
  });
}

async function upsertBrandBrain(
  c: PoolClient,
  workspaceId: string,
  data: BrandBrain,
  status: "draft" | "confirmed",
  draftSource: DraftSource,
) {
  const clean = brandBrainSchema.parse(data);
  await c.query(
    `insert into brand_brains (workspace_id, data, draft_source, status, confirmed_at, updated_at)
     values ($1, $2, $3, $4, case when $4 = 'confirmed' then now() end, now())
     on conflict (workspace_id) do update set
       data = excluded.data,
       draft_source = excluded.draft_source,
       status = excluded.status,
       confirmed_at = excluded.confirmed_at,
       updated_at = now()`,
    [workspaceId, JSON.stringify(clean), draftSource, status],
  );
}

/** Saves a machine draft. It never overwrites a brain the owner has already confirmed. */
export async function saveDraftBrandBrain(workspaceId: string, data: BrandBrain, source: DraftSource) {
  await withTenant(workspaceId, async (c) => {
    const { rows } = await c.query<{ status: string }>("select status from brand_brains where workspace_id = $1", [
      workspaceId,
    ]);
    if (rows[0]?.status === "confirmed") return;
    await upsertBrandBrain(c, workspaceId, data, "draft", source);
  });
}

/** Saves what the owner typed. Confirming marks these facts as safe for the assistant to use. */
export async function saveOwnerBrandBrain(workspaceId: string, data: BrandBrain, confirm: boolean) {
  await withTenant(workspaceId, (c) => upsertBrandBrain(c, workspaceId, data, confirm ? "confirmed" : "draft", "manual"));
}

export type StoredAudit = AuditOutcome & { id: string; targetUrl: string | null; createdAt: Date };

export async function saveAudit(workspaceId: string, outcome: AuditOutcome, targetUrl: string | null): Promise<string> {
  return withTenant(workspaceId, async (c) => {
    const { rows } = await c.query<{ id: string }>(
      "insert into audit_reports (workspace_id, target_url, score, results, facts) values ($1, $2, $3, $4, $5) returning id",
      [workspaceId, targetUrl, outcome.score, JSON.stringify(outcome.results), JSON.stringify(outcome.facts)],
    );
    await c.query("insert into usage_ledger (workspace_id, kind, units) values ($1, 'audit', 1)", [workspaceId]);
    return rows[0].id;
  });
}

export async function latestAudits(workspaceId: string, limit = 2): Promise<StoredAudit[]> {
  return withTenant(workspaceId, async (c) => {
    const { rows } = await c.query<{
      id: string;
      target_url: string | null;
      score: number;
      results: AuditOutcome["results"];
      facts: AuditOutcome["facts"];
      created_at: Date;
    }>("select id, target_url, score, results, facts, created_at from audit_reports order by created_at desc limit $1", [
      limit,
    ]);
    return rows.map((r) => ({
      id: r.id,
      targetUrl: r.target_url,
      score: r.score,
      results: r.results,
      facts: r.facts,
      createdAt: r.created_at,
    }));
  });
}

export async function recordUsage(workspaceId: string, kind: string, units: number) {
  await withTenant(workspaceId, (c) =>
    c.query("insert into usage_ledger (workspace_id, kind, units) values ($1, $2, $3)", [workspaceId, kind, units]),
  );
}

/** Checks in time order, oldest first. days = 0 means all of them. */
export async function auditHistory(workspaceId: string, days: number, limit = 200): Promise<StoredAudit[]> {
  return withTenant(workspaceId, async (c) => {
    const { rows } = await c.query<{
      id: string;
      target_url: string | null;
      score: number;
      results: AuditOutcome["results"];
      facts: AuditOutcome["facts"];
      created_at: Date;
    }>(
      `select id, target_url, score, results, facts, created_at from (
         select * from audit_reports
         where $1::int = 0 or created_at > now() - make_interval(days => $1::int)
         order by created_at desc limit $2
       ) recent order by created_at asc`,
      [days, limit],
    );
    return rows.map((r) => ({
      id: r.id,
      targetUrl: r.target_url,
      score: r.score,
      results: r.results,
      facts: r.facts,
      createdAt: r.created_at,
    }));
  });
}
