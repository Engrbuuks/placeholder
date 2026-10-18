// Proves that one workspace can never read or change another workspace's data,
// using the same database role and code path the app uses.
import "./helpers";
import { uniqueEmail } from "./helpers";
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { getPool, globalQuery, withTenant } from "../src/lib/db";
import { createAccountWithWorkspace } from "../src/lib/workspaces";

let a: { userId: string; workspaceId: string };
let b: { userId: string; workspaceId: string };

before(async () => {
  a = (await createAccountWithWorkspace({ email: uniqueEmail("a"), passwordHash: "x", fullName: "Ada", businessName: "Ada Homes" }))!;
  b = (await createAccountWithWorkspace({ email: uniqueEmail("b"), passwordHash: "x", fullName: "Bayo", businessName: "Bayo Dental" }))!;
  await withTenant(b.workspaceId, (c) =>
    c.query("insert into audit_reports (workspace_id, score, results, facts) values ($1, 50, '[]', '{}')", [b.workspaceId]),
  );
});

after(async () => {
  await getPool().end();
});

describe("tenant isolation", () => {
  test("the app role cannot bypass row level security", async () => {
    const { rows } = await globalQuery<{ rolbypassrls: boolean; rolsuper: boolean; owns: boolean }>(
      `select r.rolbypassrls, r.rolsuper,
              exists (select 1 from pg_tables t where t.tablename = 'workspaces' and t.tableowner = current_user) as owns
       from pg_roles r where r.rolname = current_user`,
    );
    assert.equal(rows[0].rolbypassrls, false);
    assert.equal(rows[0].rolsuper, false);
    assert.equal(rows[0].owns, false);
  });

  test("a workspace sees only its own rows", async () => {
    const seen = await withTenant(a.workspaceId, async (c) => ({
      workspaces: (await c.query("select id from workspaces")).rows.map((r) => r.id),
      brains: (await c.query("select workspace_id from brand_brains")).rows.map((r) => r.workspace_id),
      memberships: (await c.query("select workspace_id from memberships")).rows.map((r) => r.workspace_id),
      audits: (await c.query("select id from audit_reports")).rowCount,
    }));
    assert.deepEqual(seen.workspaces, [a.workspaceId]);
    assert.deepEqual(seen.brains, [a.workspaceId]);
    assert.deepEqual(seen.memberships, [a.workspaceId]);
    assert.equal(seen.audits, 0);
  });

  test("a workspace cannot write rows into another workspace", async () => {
    await assert.rejects(
      withTenant(a.workspaceId, (c) =>
        c.query("insert into audit_reports (workspace_id, score, results, facts) values ($1, 99, '[]', '{}')", [b.workspaceId]),
      ),
      /violates row.level security policy/,
    );
  });

  test("a workspace cannot update or delete another workspace", async () => {
    const changed = await withTenant(a.workspaceId, async (c) => {
      const u = await c.query("update workspaces set name = 'taken' where id = $1", [b.workspaceId]);
      const d = await c.query("delete from brand_brains where workspace_id = $1", [b.workspaceId]);
      return (u.rowCount ?? 0) + (d.rowCount ?? 0);
    });
    assert.equal(changed, 0);
    const name = await withTenant(b.workspaceId, (c) => c.query("select name from workspaces"));
    assert.equal(name.rows[0].name, "Bayo Dental");
  });

  test("queries outside a tenant transaction see no tenant data", async () => {
    const { rowCount } = await globalQuery("select id from workspaces");
    assert.equal(rowCount, 0);
  });

  test("the tenant setting does not leak to the next use of a pooled connection", async () => {
    await withTenant(a.workspaceId, (c) => c.query("select 1"));
    const client = await getPool().connect();
    try {
      const { rows } = await client.query("select current_workspace_id() as id");
      assert.equal(rows[0].id, null);
    } finally {
      client.release();
    }
  });

  test("a user can only list their own workspaces", async () => {
    const { rows } = await globalQuery<{ workspace_id: string }>("select workspace_id from workspaces_for_user($1)", [a.userId]);
    assert.deepEqual(rows.map((r) => r.workspace_id), [a.workspaceId]);
  });

  test("signing up with a taken email creates nothing", async () => {
    const email = uniqueEmail("dup");
    const first = await createAccountWithWorkspace({ email, passwordHash: "x", fullName: "One", businessName: "First" });
    const second = await createAccountWithWorkspace({ email: email.toUpperCase(), passwordHash: "x", fullName: "Two", businessName: "Second" });
    assert.ok(first);
    assert.equal(second, null);
    const users = await globalQuery("select id from users where email = $1", [email]);
    assert.equal(users.rowCount, 1);
  });
});
