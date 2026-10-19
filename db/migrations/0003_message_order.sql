-- Messages written in one transaction (a customer message and the reply to it) used to share the
-- transaction's start time, so their order could flip. clock_timestamp() records the real moment.
alter table messages alter column created_at set default clock_timestamp();
alter table activity alter column created_at set default clock_timestamp();
alter table notifications alter column created_at set default clock_timestamp();

-- Repair existing pairs that share a timestamp: the customer's message comes first.
update messages m set created_at = m.created_at + interval '1 millisecond'
where m.direction = 'out' and exists (
  select 1 from messages i where i.lead_id = m.lead_id and i.direction = 'in' and i.created_at = m.created_at
);
