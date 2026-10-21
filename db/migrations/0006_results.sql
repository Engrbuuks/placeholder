-- Round 5: results tracking, reviews, reactivation campaigns, missed call text back and the lead form.

-- Where each lead came from, and what it was worth.
alter table leads add column source text;                 -- webchat, whatsapp, sms, form, missed_call
alter table leads add column utm_source text;
alter table leads add column utm_medium text;
alter table leads add column utm_campaign text;
alter table leads add column landing_page text;
alter table leads add column referrer text;
alter table leads add column value numeric(14, 2) check (value is null or value >= 0);
alter table leads add column booked_at timestamptz;      -- when it was first marked booked
alter table leads add column won_at timestamptz;
alter table leads add column lost_at timestamptz;
update leads set source = channel where source is null;

-- A customer who ticked the consent box on a form may get follow up texts even where the law needs consent.
alter table leads add column marketing_consent_at timestamptz;

-- Reviews: asked once per customer, after a sale.
alter table leads add column review_status text check (review_status in ('requested', 'rated'));
alter table leads add column review_rating smallint check (review_rating between 1 and 5);
alter table leads add column review_requested_at timestamptz;
alter table leads add column review_token text unique;
alter table leads add column review_clicked_at timestamptz;

-- The lead form is a channel of its own when no text channel can answer it.
alter table leads drop constraint if exists leads_channel_check;
alter table leads add constraint leads_channel_check check (channel in ('webchat', 'whatsapp', 'sms', 'form'));

create index leads_workspace_created on leads (workspace_id, created_at);
create index leads_workspace_won on leads (workspace_id, won_at) where won_at is not null;

alter table automation_settings add column review_enabled boolean not null default false;
alter table automation_settings add column review_link text;
alter table automation_settings add column review_delay_hours integer not null default 24 check (review_delay_hours between 1 and 720);
alter table automation_settings add column missed_call_enabled boolean not null default false;
alter table automation_settings add column forward_to text;   -- the phone a missed call was meant for

-- Reactivation campaigns.
create table campaigns (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces (id) on delete cascade,
  name text not null,
  segment text not null check (segment in ('lost', 'quiet', 'customers', 'booked_no_show')),
  quiet_days integer not null default 30 check (quiet_days between 1 and 3650),
  message text not null,
  status text not null default 'draft' check (status in ('draft', 'sending', 'sent', 'cancelled')),
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);
create index campaigns_workspace on campaigns (workspace_id, created_at desc);

create table campaign_recipients (
  campaign_id uuid not null references campaigns (id) on delete cascade,
  workspace_id uuid not null references workspaces (id) on delete cascade,
  lead_id uuid not null references leads (id) on delete cascade,
  status text not null default 'queued' check (status in ('queued', 'sent', 'skipped', 'failed')),
  reason text,
  message_id uuid references messages (id) on delete set null,
  sent_at timestamptz,
  primary key (campaign_id, lead_id)
);
create index campaign_recipients_lead on campaign_recipients (lead_id);

do $$
declare t text;
begin
  foreach t in array array['campaigns', 'campaign_recipients']
  loop
    execute format('alter table %I enable row level security', t);
    execute format(
      'create policy tenant_isolation on %I using (workspace_id = current_workspace_id()) with check (workspace_id = current_workspace_id())',
      t
    );
  end loop;
end $$;
grant select, insert, update, delete on campaigns, campaign_recipients to {{app_role}};

-- A review link click arrives with no session; this finds the business behind the token and nothing else.
create function review_link_target(p_token text)
returns table (workspace_id uuid, lead_id uuid) language sql stable security definer set search_path = public as $$
  select workspace_id, id from leads where review_token = p_token
$$;
grant execute on function review_link_target(text) to {{app_role}};
