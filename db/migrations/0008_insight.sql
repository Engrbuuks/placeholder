-- Round 7: the assistant reads every conversation. What the customer wants, how urgent it is, their budget,
-- their concerns and buying signals are kept on the lead, with a heat score the owner can sort by.

alter table leads add column insight jsonb;
alter table leads add column insight_source text check (insight_source in ('rules', 'ai'));
alter table leads add column insight_at timestamptz;
alter table leads add column heat smallint not null default 0 check (heat between 0 and 100);
-- Set once, when the lead first crosses the hot line, so the owner is alerted once and not on every message.
alter table leads add column hot_alerted_at timestamptz;
-- Concern types the owner was already told about, so the same concern is not reported twice.
alter table leads add column concerns_alerted text[] not null default '{}';

create index leads_heat_idx on leads (workspace_id, heat desc);

-- Follow ups the AI wrote from the conversation are labelled, so the owner always knows.
alter table messages add column ai_written boolean not null default false;
