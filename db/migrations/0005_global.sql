-- Round 4: any country, a time zone and language per business, SMS, and opt outs.

-- Countries now come from config/markets.json; the database only checks the shape of the code.
alter table workspaces drop constraint if exists workspaces_country_check;
alter table workspaces add constraint workspaces_country_check check (country ~ '^[A-Z]{2}$');

-- A business in a country with several time zones (the US, Canada) picks its own. Empty means the market's first zone.
alter table workspaces add column time_zone text;
-- The language of the assistant's fixed messages and the chat window.
alter table workspaces add column language text not null default 'en' check (language ~ '^[a-z]{2}$');

-- SMS joins web chat and WhatsApp.
alter table channel_connections drop constraint if exists channel_connections_channel_check;
alter table channel_connections add constraint channel_connections_channel_check check (channel in ('webchat', 'whatsapp', 'sms'));
alter table leads drop constraint if exists leads_channel_check;
alter table leads add constraint leads_channel_check check (channel in ('webchat', 'whatsapp', 'sms'));

-- A customer who texts STOP (or the same in their language) gets no more automated messages on any channel.
alter table leads add column opted_out_at timestamptz;

-- Public SMS webhooks find the business by the number the customer texted.
-- Returns only the workspace id; the token is then read inside that workspace's tenant transaction.
create function workspace_for_sms(p_number text)
returns uuid language sql stable security definer set search_path = public as $$
  select workspace_id from channel_connections where channel = 'sms' and external_account_id = p_number
$$;
grant execute on function workspace_for_sms(text) to {{app_role}};
