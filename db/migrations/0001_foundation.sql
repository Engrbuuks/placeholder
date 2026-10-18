-- Foundation schema.
-- Tenant tables carry workspace_id and are protected by row level security.
-- The app connects as {{app_role}}, which does not own these tables, so the policies always apply to it.
-- The current tenant is set per transaction with set_config('app.workspace_id', <uuid>, true).

create extension if not exists citext;

create or replace function current_workspace_id() returns uuid
language sql stable as $$
  select nullif(current_setting('app.workspace_id', true), '')::uuid
$$;

-- Global tables: identity and sessions, not tenant data.

create table users (
  id uuid primary key default gen_random_uuid(),
  email citext not null unique,
  password_hash text not null,
  full_name text not null,
  created_at timestamptz not null default now()
);

create table login_attempts (
  id bigserial primary key,
  attempt_key text not null,
  attempted_at timestamptz not null default now()
);
create index login_attempts_key_time on login_attempts (attempt_key, attempted_at);

-- Tenant tables.

create table workspaces (
  id uuid primary key,
  name text not null,
  country text check (country in ('NG', 'UK')),
  niche_pack text,
  website_url text,
  instagram_url text,
  google_profile_url text,
  onboarding_step text not null default 'market'
    check (onboarding_step in ('market', 'niche', 'presence', 'brain', 'done')),
  created_at timestamptz not null default now()
);

create table memberships (
  workspace_id uuid not null references workspaces (id) on delete cascade,
  user_id uuid not null references users (id) on delete cascade,
  role text not null check (role in ('owner', 'manager', 'agent')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
create index memberships_user on memberships (user_id);

create table sessions (
  id text primary key, -- sha256 of the cookie token; the token itself is never stored
  user_id uuid not null references users (id) on delete cascade,
  workspace_id uuid references workspaces (id) on delete set null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index sessions_user on sessions (user_id);

create table brand_brains (
  workspace_id uuid primary key references workspaces (id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  draft_source text not null default 'manual' check (draft_source in ('manual', 'rules', 'ai')),
  status text not null default 'draft' check (status in ('draft', 'confirmed')),
  confirmed_at timestamptz,
  updated_at timestamptz not null default now()
);

create table audit_reports (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces (id) on delete cascade,
  target_url text,
  score integer not null check (score between 0 and 100),
  results jsonb not null,
  facts jsonb not null,
  created_at timestamptz not null default now()
);
create index audit_reports_workspace_time on audit_reports (workspace_id, created_at desc);

create table usage_ledger (
  id bigserial primary key,
  workspace_id uuid not null references workspaces (id) on delete cascade,
  kind text not null,
  units integer not null check (units >= 0),
  created_at timestamptz not null default now()
);
create index usage_ledger_workspace_time on usage_ledger (workspace_id, created_at);

-- Row level security.

alter table workspaces enable row level security;
create policy tenant_isolation on workspaces
  using (id = current_workspace_id())
  with check (id = current_workspace_id());

alter table memberships enable row level security;
create policy tenant_isolation on memberships
  using (workspace_id = current_workspace_id())
  with check (workspace_id = current_workspace_id());

alter table brand_brains enable row level security;
create policy tenant_isolation on brand_brains
  using (workspace_id = current_workspace_id())
  with check (workspace_id = current_workspace_id());

alter table audit_reports enable row level security;
create policy tenant_isolation on audit_reports
  using (workspace_id = current_workspace_id())
  with check (workspace_id = current_workspace_id());

alter table usage_ledger enable row level security;
create policy tenant_isolation on usage_ledger
  using (workspace_id = current_workspace_id())
  with check (workspace_id = current_workspace_id());

-- At login we need a user's workspaces before any tenant is chosen.
-- This narrow function answers only that question, for one user.
create function workspaces_for_user(p_user uuid)
returns table (workspace_id uuid, role text, workspace_name text)
language sql stable security definer set search_path = public as $$
  select m.workspace_id, m.role, w.name
  from memberships m
  join workspaces w on w.id = m.workspace_id
  where m.user_id = p_user
  order by m.created_at
$$;

-- Grants for the app role.

grant usage on schema public to {{app_role}};
grant select, insert, update, delete on users, login_attempts, sessions to {{app_role}};
grant select, insert, update, delete on workspaces, memberships, brand_brains, audit_reports, usage_ledger to {{app_role}};
grant usage, select on all sequences in schema public to {{app_role}};
revoke all on function workspaces_for_user(uuid) from public;
grant execute on function workspaces_for_user(uuid) to {{app_role}};
grant execute on function current_workspace_id() to {{app_role}};
