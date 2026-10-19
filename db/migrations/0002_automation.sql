-- Automation pipeline: leads, messages, a job queue, an activity log, notifications and channel settings.
-- Every table is tenant scoped with row level security, like the foundation tables.
-- A few narrow security definer functions let the worker and public webhooks find the right workspace
-- without ever seeing another workspace's data.

-- Settings per workspace.
create table automation_settings (
  workspace_id uuid primary key references workspaces (id) on delete cascade,
  enabled boolean not null default true,
  approval_mode text not null default 'auto' check (approval_mode in ('auto', 'approve')),
  alert_email text,
  weekly_check boolean not null default true,
  updated_at timestamptz not null default now()
);

create table channel_connections (
  workspace_id uuid not null references workspaces (id) on delete cascade,
  channel text not null check (channel in ('webchat', 'whatsapp')),
  public_key text unique,          -- web chat widget key, safe to publish
  external_account_id text unique, -- WhatsApp phone number id
  secret_enc text,                 -- encrypted access token, never returned to the browser
  settings jsonb not null default '{}'::jsonb,
  status text not null default 'active' check (status in ('active', 'paused', 'error')),
  last_event_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  primary key (workspace_id, channel)
);

create table leads (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces (id) on delete cascade,
  channel text not null check (channel in ('webchat', 'whatsapp')),
  external_id text not null,       -- visitor id or WhatsApp number
  name text,
  phone text,
  email text,
  stage text not null default 'new'
    check (stage in ('new', 'qualifying', 'qualified', 'handoff', 'booked', 'won', 'lost')),
  qualifier_index integer not null default 0,
  qualifier_answers jsonb not null default '[]'::jsonb,
  handoff_reason text,
  automation_paused boolean not null default false,
  booked_for timestamptz,
  unread integer not null default 0,
  last_inbound_at timestamptz,
  last_outbound_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, channel, external_id)
);
create index leads_workspace_recent on leads (workspace_id, updated_at desc);

create table messages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces (id) on delete cascade,
  lead_id uuid not null references leads (id) on delete cascade,
  direction text not null check (direction in ('in', 'out')),
  author text not null check (author in ('customer', 'assistant', 'owner', 'automation')),
  body text not null,
  status text not null default 'sent'
    check (status in ('received', 'pending_approval', 'queued', 'sent', 'delivered', 'read', 'failed', 'discarded', 'skipped')),
  channel text not null,
  external_message_id text,
  status_detail text,
  sequence_id text,
  created_at timestamptz not null default now()
);
create index messages_lead_time on messages (lead_id, created_at);
create unique index messages_external_unique on messages (workspace_id, channel, external_message_id)
  where external_message_id is not null;

create table jobs (
  id bigserial primary key,
  workspace_id uuid not null references workspaces (id) on delete cascade,
  kind text not null,
  payload jsonb not null default '{}'::jsonb,
  lead_id uuid references leads (id) on delete cascade,
  run_at timestamptz not null default now(),
  status text not null default 'queued' check (status in ('queued', 'running', 'done', 'failed', 'cancelled')),
  attempts integer not null default 0,
  max_attempts integer not null default 5,
  last_error text,
  dedupe_key text,
  locked_at timestamptz,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create index jobs_due on jobs (run_at) where status = 'queued';
create index jobs_workspace_recent on jobs (workspace_id, created_at desc);
create unique index jobs_dedupe on jobs (workspace_id, dedupe_key) where dedupe_key is not null and status in ('queued', 'running');

create table activity (
  id bigserial primary key,
  workspace_id uuid not null references workspaces (id) on delete cascade,
  lead_id uuid references leads (id) on delete cascade,
  kind text not null,
  summary text not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index activity_workspace_recent on activity (workspace_id, created_at desc);

create table notifications (
  id bigserial primary key,
  workspace_id uuid not null references workspaces (id) on delete cascade,
  kind text not null,
  title text not null,
  body text not null default '',
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_workspace_recent on notifications (workspace_id, created_at desc);

create table email_log (
  id bigserial primary key,
  workspace_id uuid not null references workspaces (id) on delete cascade,
  to_address text not null,
  subject text not null,
  transport text not null check (transport in ('resend', 'logged')),
  status text not null check (status in ('sent', 'failed', 'logged')),
  error text,
  created_at timestamptz not null default now()
);
create index email_log_workspace_recent on email_log (workspace_id, created_at desc);

-- Row level security on every new table.
do $$
declare t text;
begin
  foreach t in array array['automation_settings', 'channel_connections', 'leads', 'messages', 'jobs', 'activity', 'notifications', 'email_log']
  loop
    execute format('alter table %I enable row level security', t);
    execute format(
      'create policy tenant_isolation on %I using (workspace_id = current_workspace_id()) with check (workspace_id = current_workspace_id())',
      t
    );
  end loop;
end $$;

-- Cross tenant functions. Each answers one narrow question and returns only ids the caller needs next.

-- Claims due jobs for the worker. Stuck jobs (running for more than 5 minutes) are released first.
create function claim_jobs(p_limit integer)
returns table (id bigint, workspace_id uuid, kind text, payload jsonb, lead_id uuid, attempts integer, max_attempts integer)
language plpgsql volatile security definer set search_path = public as $$
begin
  update jobs j set status = 'queued', locked_at = null
  where j.status = 'running' and j.locked_at < now() - interval '5 minutes';

  return query
  with due as (
    select j.id from jobs j
    where j.status = 'queued' and j.run_at <= now()
    order by j.run_at
    limit greatest(1, least(p_limit, 100))
    for update skip locked
  )
  update jobs j set status = 'running', locked_at = now(), attempts = j.attempts + 1
  from due where j.id = due.id
  returning j.id, j.workspace_id, j.kind, j.payload, j.lead_id, j.attempts, j.max_attempts;
end $$;

-- Finds the workspace behind a public web chat key.
create function workspace_for_webchat(p_key text)
returns uuid language sql stable security definer set search_path = public as $$
  select workspace_id from channel_connections where channel = 'webchat' and public_key = p_key and status = 'active'
$$;

-- Finds the workspace behind a WhatsApp phone number id.
create function workspace_for_whatsapp(p_phone_number_id text)
returns uuid language sql stable security definer set search_path = public as $$
  select workspace_id from channel_connections where channel = 'whatsapp' and external_account_id = p_phone_number_id
$$;

-- Queues a weekly check for every workspace that wants one and has not been checked in 7 days.
create function enqueue_weekly_checks()
returns integer language plpgsql volatile security definer set search_path = public as $$
declare n integer;
begin
  insert into jobs (workspace_id, kind, dedupe_key)
  select w.id, 'weekly_check', 'weekly_check'
  from workspaces w
  left join automation_settings s on s.workspace_id = w.id
  where w.onboarding_step = 'done'
    and coalesce(s.weekly_check, true)
    and not exists (
      select 1 from audit_reports a where a.workspace_id = w.id and a.created_at > now() - interval '7 days'
    )
  on conflict do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

-- Counts for the health check endpoint, with no tenant data.
create function queue_health()
returns table (queued bigint, due bigint, running bigint, failed_24h bigint)
language sql stable security definer set search_path = public as $$
  select
    count(*) filter (where status = 'queued'),
    count(*) filter (where status = 'queued' and run_at <= now()),
    count(*) filter (where status = 'running'),
    count(*) filter (where status = 'failed' and finished_at > now() - interval '1 day')
  from jobs
$$;

revoke all on function claim_jobs(integer), workspace_for_webchat(text), workspace_for_whatsapp(text), enqueue_weekly_checks(), queue_health() from public;
grant execute on function claim_jobs(integer), workspace_for_webchat(text), workspace_for_whatsapp(text), enqueue_weekly_checks(), queue_health() to {{app_role}};

grant select, insert, update, delete on automation_settings, channel_connections, leads, messages, jobs, activity, notifications, email_log to {{app_role}};
grant usage, select on all sequences in schema public to {{app_role}};
