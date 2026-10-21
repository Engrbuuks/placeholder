// The numbers that show whether marketing is working: leads, speed to answer, bookings, sales and revenue,
// where they came from, what the assistant handled out of hours, reviews, and what campaigns brought back.
import { automationConfig } from "./config";
import { withTenant } from "./db";
import { sourceLabel } from "./attribution";

export type Totals = { leads: number; engaged: number; booked: number; won: number; revenue: number };
export type SourceRow = { label: string; leads: number; booked: number; won: number; revenue: number };
export type Results = {
  days: number;
  current: Totals;
  previous: Totals;
  medianFirstReplySeconds: number | null;
  answeredWithinMinute: number; // share of leads, 0 to 1
  afterHours: number; // leads whose first message arrived during quiet hours
  sources: SourceRow[];
  daily: { day: string; leads: number; revenue: number }[];
  reviews: { requested: number; rated: number; average: number | null; happy: number; unhappy: number; clicks: number };
  campaigns: { sent: number; replied: number; won: number; revenue: number };
};

const totalsSql = `
  select
    (select count(*) from leads where created_at >= $1 and created_at < $2)::int as leads,
    (select count(*) from leads l where l.created_at >= $1 and l.created_at < $2
       and (select count(*) from messages m where m.lead_id = l.id and m.direction = 'in') >= 2)::int as engaged,
    -- A sale marked won without a booking first still went through the booked step.
    (select count(*) from leads where coalesce(booked_at, won_at) >= $1 and coalesce(booked_at, won_at) < $2)::int as booked,
    (select count(*) from leads where won_at >= $1 and won_at < $2)::int as won,
    (select coalesce(sum(value), 0) from leads where won_at >= $1 and won_at < $2)::float as revenue`;

export async function resultsFor(workspaceId: string, days: number, timeZone: string): Promise<Results> {
  const now = new Date();
  const start = new Date(now.getTime() - days * 86_400_000);
  const before = new Date(start.getTime() - days * 86_400_000);
  const q = automationConfig.quietHours;
  return withTenant(workspaceId, async (c) => {
    const current = (await c.query<Totals>(totalsSql, [start, now])).rows[0];
    const previous = (await c.query<Totals>(totalsSql, [before, start])).rows[0];

    // Speed to lead: from the customer's first message to the first reply that actually went out.
    const speed = (
      await c.query<{ median: number | null; within: number; total: number }>(
        `with firsts as (
           select l.id,
             (select min(created_at) from messages m where m.lead_id = l.id and m.direction = 'in') as first_in,
             (select min(created_at) from messages m where m.lead_id = l.id and m.direction = 'out' and m.status in ('sent', 'delivered', 'read')) as first_out
           from leads l where l.created_at >= $1 and l.created_at < $2
         )
         select percentile_cont(0.5) within group (order by extract(epoch from first_out - first_in)) as median,
           count(*) filter (where first_out - first_in <= interval '60 seconds')::int as within,
           count(*) filter (where first_in is not null)::int as total
         from firsts where first_in is not null`,
        [start, now],
      )
    ).rows[0];

    // Leads whose first message came while the business was closed, in its own time zone.
    const afterHours = (
      await c.query<{ n: number }>(
        `select count(*)::int as n from leads l
         where l.created_at >= $1 and l.created_at < $2
           and (case when $4::int > $5::int
                  then extract(hour from l.created_at at time zone $3) >= $4 or extract(hour from l.created_at at time zone $3) < $5
                  else extract(hour from l.created_at at time zone $3) >= $4 and extract(hour from l.created_at at time zone $3) < $5 end)`,
        [start, now, timeZone, q.start, q.end],
      )
    ).rows[0].n;

    const sourceRows = (
      await c.query<{ source: string | null; utm_source: string | null; utm_medium: string | null; leads: number; booked: number; won: number; revenue: number }>(
        `select source, utm_source, utm_medium, count(*)::int as leads,
           count(*) filter (where booked_at is not null or won_at is not null)::int as booked,
           count(*) filter (where won_at is not null)::int as won,
           coalesce(sum(value) filter (where won_at is not null), 0)::float as revenue
         from leads where created_at >= $1 and created_at < $2
         group by 1, 2, 3 order by revenue desc, leads desc limit 12`,
        [start, now],
      )
    ).rows;
    const merged = new Map<string, SourceRow>();
    for (const r of sourceRows) {
      const label = sourceLabel(r);
      const m = merged.get(label) ?? { label, leads: 0, booked: 0, won: 0, revenue: 0 };
      m.leads += r.leads;
      m.booked += r.booked;
      m.won += r.won;
      m.revenue += r.revenue;
      merged.set(label, m);
    }

    const daily = (
      await c.query<{ day: string; leads: number; revenue: number }>(
        `with days as (
           select generate_series(date_trunc('day', $1::timestamptz at time zone $3), date_trunc('day', $2::timestamptz at time zone $3), interval '1 day') as d
         )
         select to_char(d, 'YYYY-MM-DD') as day,
           (select count(*) from leads l where date_trunc('day', l.created_at at time zone $3) = d)::int as leads,
           (select coalesce(sum(value), 0) from leads l where date_trunc('day', l.won_at at time zone $3) = d)::float as revenue
         from days order by d`,
        [start, now, timeZone],
      )
    ).rows;

    const reviews = (
      await c.query<Results["reviews"]>(
        `select count(*) filter (where review_requested_at >= $1)::int as requested,
           count(*) filter (where review_status = 'rated' and review_requested_at >= $1)::int as rated,
           round(avg(review_rating) filter (where review_requested_at >= $1), 1)::float as average,
           count(*) filter (where review_rating >= 4 and review_requested_at >= $1)::int as happy,
           count(*) filter (where review_rating <= 3 and review_requested_at >= $1)::int as unhappy,
           count(*) filter (where review_clicked_at >= $1)::int as clicks
         from leads`,
        [start],
      )
    ).rows[0];

    const campaigns = (
      await c.query<Results["campaigns"]>(
        `select count(*)::int as sent,
           count(*) filter (where exists (select 1 from messages m where m.lead_id = r.lead_id and m.direction = 'in' and m.created_at > r.sent_at))::int as replied,
           count(*) filter (where l.won_at > r.sent_at)::int as won,
           coalesce(sum(l.value) filter (where l.won_at > r.sent_at), 0)::float as revenue
         from campaign_recipients r join leads l on l.id = r.lead_id
         where r.status = 'sent' and r.sent_at >= $1`,
        [start],
      )
    ).rows[0];

    return {
      days,
      current,
      previous,
      medianFirstReplySeconds: speed?.median ?? null,
      answeredWithinMinute: speed?.total ? speed.within / speed.total : 0,
      afterHours,
      sources: [...merged.values()].sort((a, b) => b.revenue - a.revenue || b.leads - a.leads),
      daily,
      reviews,
      campaigns,
    };
  });
}

/** "48 seconds", "3 minutes", "2.5 hours". */
export function formatDuration(seconds: number | null): string {
  if (seconds === null) return "No replies yet";
  if (seconds < 90) {
    const n = Math.max(1, Math.round(seconds));
    return `${n} second${n === 1 ? "" : "s"}`;
  }
  if (seconds < 5400) return `${Math.round(seconds / 60)} minutes`;
  return `${Math.round((seconds / 3600) * 10) / 10} hours`;
}

/** The change from one period to the next, as a whole percentage, or null when there was nothing before. */
export function change(now: number, before: number): number | null {
  if (before === 0) return now === 0 ? 0 : null;
  return Math.round(((now - before) / before) * 100);
}
