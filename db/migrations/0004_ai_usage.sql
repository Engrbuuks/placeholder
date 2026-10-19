-- Counts Claude calls per workspace per calendar month (UTC), so each workspace has a spending cap.
create table ai_usage (
  workspace_id uuid not null references workspaces (id) on delete cascade,
  month date not null,
  calls integer not null default 0,
  primary key (workspace_id, month)
);

alter table ai_usage enable row level security;
create policy tenant_isolation on ai_usage
  using (workspace_id = current_workspace_id())
  with check (workspace_id = current_workspace_id());

grant select, insert, update on ai_usage to {{app_role}};
