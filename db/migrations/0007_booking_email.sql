-- Round 6: customers book their own appointments, and email becomes a channel.

create table booking_settings (
  workspace_id uuid primary key references workspaces (id) on delete cascade,
  enabled boolean not null default false,
  title text not null default 'Appointment',
  slot_minutes integer not null default 30 check (slot_minutes between 5 and 480),
  buffer_minutes integer not null default 0 check (buffer_minutes between 0 and 240),
  min_notice_hours integer not null default 2 check (min_notice_hours between 0 and 720),
  max_days_ahead integer not null default 30 check (max_days_ahead between 1 and 365),
  capacity integer not null default 1 check (capacity between 1 and 100),
  -- Opening hours by weekday, 0 = Sunday: {"1": ["09:00", "17:00"], ...}. A missing day is closed.
  weekly jsonb not null default '{"1":["09:00","17:00"],"2":["09:00","17:00"],"3":["09:00","17:00"],"4":["09:00","17:00"],"5":["09:00","17:00"]}'::jsonb,
  closed_dates date[] not null default '{}',
  updated_at timestamptz not null default now()
);

create table bookings (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces (id) on delete cascade,
  lead_id uuid not null references leads (id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null check (ends_at > starts_at),
  status text not null default 'confirmed' check (status in ('confirmed', 'cancelled', 'completed', 'no_show')),
  source text not null default 'self' check (source in ('self', 'owner')),
  note text,
  manage_token text not null unique,
  created_at timestamptz not null default now(),
  cancelled_at timestamptz
);
create index bookings_workspace_time on bookings (workspace_id, starts_at) where status = 'confirmed';
create index bookings_lead on bookings (lead_id);

do $$
declare t text;
begin
  foreach t in array array['booking_settings', 'bookings']
  loop
    execute format('alter table %I enable row level security', t);
    execute format(
      'create policy tenant_isolation on %I using (workspace_id = current_workspace_id()) with check (workspace_id = current_workspace_id())',
      t
    );
  end loop;
end $$;
grant select, insert, update, delete on booking_settings, bookings to {{app_role}};

-- A customer's own link: to book from a conversation, to manage a booking, or to stop emails.
alter table leads add column public_token text unique;

-- Email joins the channels, for customers who left an email address and no phone.
alter table leads drop constraint if exists leads_channel_check;
alter table leads add constraint leads_channel_check check (channel in ('webchat', 'whatsapp', 'sms', 'form', 'email'));

-- Public pages arrive with no session; these find the business behind a token and nothing else.
create function booking_by_token(p_token text)
returns table (workspace_id uuid, booking_id uuid) language sql stable security definer set search_path = public as $$
  select workspace_id, id from bookings where manage_token = p_token
$$;
create function lead_by_public_token(p_token text)
returns table (workspace_id uuid, lead_id uuid) language sql stable security definer set search_path = public as $$
  select workspace_id, id from leads where public_token = p_token
$$;
grant execute on function booking_by_token(text), lead_by_public_token(text) to {{app_role}};
