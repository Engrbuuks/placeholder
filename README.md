# Placeholder

AI marketing platform for owner run businesses in Nigeria and the UK. Build round 2: the automation pipeline on top of the round 1 foundation.

## What works in this round

* **Accounts:** sign up, log in, log out. Passwords hashed with Argon2id. Sessions are random tokens in an httpOnly cookie; only a SHA256 hash of each token is stored. Login and signup are rate limited.
* **Multi tenant core:** every business is a workspace. Tenant data is isolated by PostgreSQL row level security, enforced by the database for the role the app connects as.
* **Onboarding in four steps:** where you trade, what you do (pick a niche or describe the business and it is matched), where customers find you, then confirm your details.
* **Niche packs:** real estate, clinics, dental, and a general pack. Each pack sets the intake questions, qualifiers, follow up sequences, content themes, ad templates, compliance rules and KPIs.
* **Website audit:** reads the business website safely and scores 19 checks, from WhatsApp link and tap to call through to page speed and structured data. Every leak comes with a plain language fix.
* **Brand brain:** the facts the assistant is allowed to say. Drafted from the website, then corrected and confirmed by the owner. It cannot be confirmed until the essentials are filled in.
* **Dashboard:** a black sidebar with the app sections, a readiness score chart over time (1 week to all time, with hover details), four headline numbers with trends, a gauge with a score per area (Reach, Response, Trust, Technical), a breakdown of working, leaking and waiting checks, the next three fixes, and a table of every check with its history.
* **Audit page:** every leak with its fix.

* **Automation pipeline (round 2):** see the next section.

Calendar self booking and ads come in the next rounds, as set out in the product spec.

## The automation pipeline

What happens when a customer messages a business, in order:

1. **Message arrives** on web chat or WhatsApp. It is stored once, even when Meta delivers the same webhook twice, and the conversation is locked so two quick messages are handled in order.
2. **Gates:** nothing is sent if automations are off for the business, the brand brain is not confirmed, the conversation is paused, or a person already owns it. The owner is still told about the message.
3. **Handoff check:** asking for a person, a complaint, a refund, or an emergency word from the niche pack (chest pain at a clinic, a knocked out tooth at a dentist) hands the conversation to the owner at once, with an alert email.
4. **Reply:** a greeting, an answer from the brand brain if they asked something, and the next qualifying question from the niche pack. Answers come from written FAQs, prices, opening hours, address and the niche questions first; Claude is used only when those rules have no answer and a key is set. **The price guard** blocks any AI answer that quotes an amount the business never wrote down. Anything the assistant cannot answer goes to the owner instead of a guess.
5. **Qualified:** when every question is answered, the owner gets an alert with the answers, and the customer is asked for a time. Their reply is handed to the owner to confirm.
6. **Follow ups** go out if the customer goes quiet, on the niche pack's schedule, and are cancelled the moment they reply. Marking a booking schedules reminders before it; marking a sale won sends a thank you and review request. Nothing is sent between 21:00 and 08:00 in the business's own time zone.
7. **Approval:** each business chooses whether follow ups send on their own or wait in the inbox for approval. Instant replies always go straight out.
8. **Delivery and retries:** every send is retried with backoff (2, 4, 8, 16 minutes). If it still fails, the message is marked failed with the reason and the owner is told. On WhatsApp, free text is only sent within 24 hours of the customer's last message; after that the business's approved template is used, or the step is skipped with a clear reason.
9. **Weekly check:** each business is checked again every week, and the owner is alerted if the score drops by 5 or more or a new leak appears.

Every step is written to the activity log on the Automations page.

### Owner screens

* **Inbox:** conversations filtered by Needs you, Open, Booked and Closed; the full thread with who sent each message and whether it was delivered; approve or discard follow ups; reply; mark booked (with date and time), won or lost; pause the assistant or hand the conversation back to it; the qualifying answers so far; what is scheduled next.
* **Automations:** on or off, approval mode, alert email, weekly check; the follow up sequences in plain words; the scheduler's health with a button to run due steps now; failed steps; the activity log; alert emails.
* **Channels:** the web chat code to paste into the business website, a link to try it as a customer, and the WhatsApp connection with a checklist of what the server needs.
* **Notifications bell** and a count of conversations that need the owner.

### The scheduler on Vercel's free plan

Replies to customers are instant on any plan. Timed steps (follow ups, reminders, weekly checks, alert emails) are run by `/api/cron/tick`, which needs `Authorization: Bearer <CRON_SECRET>`.

* **Built in:** `vercel.json` calls the tick once a day, which is all the free plan allows. That alone is a backstop, not enough for follow ups.
* **Every minute, free:** create a free account at [cron-job.org](https://cron-job.org), add a job for `https://YOUR-APP/api/cron/tick`, run it every minute, and under Advanced add the header `Authorization` with the value `Bearer YOUR_CRON_SECRET`.
* **Every five minutes, free:** the GitHub workflow in `.github/workflows/tick.yml` does the same once you add `APP_URL` and `CRON_SECRET` as repository secrets.
* Due steps also run for a few seconds after every chat message, and owners can press **Run due steps now** on the Automations page.

### Connecting WhatsApp

The platform uses one Meta app; each business connects its own number.

1. In your Meta app, set the webhook address to `https://YOUR-APP/api/webhooks/whatsapp` with the same verify token as `WHATSAPP_VERIFY_TOKEN`, and subscribe to the **messages** field.
2. Set `WHATSAPP_APP_SECRET` (from the app's basic settings) and `ENCRYPTION_KEY` on the server.
3. Each business opens **Channels**, pastes its phone number ID and a permanent access token (stored encrypted, never shown again), and optionally names an approved follow up template whose first variable is the customer's first name.

## Run it locally

You need Node 20 or newer and PostgreSQL 14 or newer.

1. Create the database and two roles. The app role must not own the tables, otherwise row level security does not apply to it.

   ```sql
   create role placeholder_owner login password 'choose_one' createdb;
   create role placeholder_app login password 'choose_another';
   create database placeholder owner placeholder_owner;
   ```

2. Copy `.env.example` to `.env` and fill in the two connection strings.
3. Install and migrate:

   ```bash
   npm install
   npm run migrate
   ```

4. Start it with `npm run dev` and open http://localhost:3000.

## Deploy to Vercel with Neon or Supabase

1. Create a Postgres database on Neon or Supabase in a UK or EU region.
2. In its SQL editor, create the app role as above (`placeholder_app`) with a strong password. Keep the default owner role for migrations.
3. Run migrations once from your computer, pointing at the hosted database:

   ```bash
   MIGRATION_DATABASE_URL="postgres://owner:...@host/db?sslmode=require" APP_DB_ROLE=placeholder_app DATABASE_SSL=true npm run migrate
   ```

4. Push this folder to a GitHub repository and import it into Vercel.
5. In Vercel, set these environment variables:

   | Name | Value |
   | --- | --- |
   | `DATABASE_URL` | Connection string for `placeholder_app`. On Neon use the pooled connection string. |
   | `DATABASE_SSL` | `true` |
   | `APP_URL` | The app's public address, for example `https://yourapp.vercel.app`. |
   | `CRON_SECRET` | A long random value. The scheduler must send it. |
   | `ENCRYPTION_KEY` | `openssl rand -base64 32`. Encrypts stored channel tokens. |
   | `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN` | Needed for WhatsApp. See below. |
   | `RESEND_API_KEY`, `EMAIL_FROM` | Optional. Sends alert emails; without them alerts show in the app only. |
   | `ANTHROPIC_API_KEY` | Optional. Turns on AI answers, drafting and niche matching. |
   | `AI_MODEL` | Optional. Defaults to `claude-sonnet-5-5`. |

6. Deploy. Run `npm run migrate` again whenever a new file appears in `db/migrations`.
7. Set up the minute trigger described under **The scheduler on Vercel's free plan**.

## Demo business

To preview the dashboard with six weeks of history, run:

```bash
npm run seed:demo
```

It creates **Lekki Gardens Homes**, a made up real estate business. Log in as `demo@placeholder.test` with the password `demo password 2026`. Its scores come from the real scoring code applied to a made up website that improves over time, and its four conversations were run through the real pipeline: one qualified and booked with reminders scheduled, one part way through qualifying, one complaint handed over, and one question the assistant could not answer. The script refuses to run in production unless you pass `--force`.

## Tests

```bash
npm test
```

67 tests run against the real database, the real pipeline and the real audit code:

* **Tenant isolation:** the app role cannot bypass row level security; a workspace sees only its own rows, cannot write into another workspace, cannot update or delete another workspace; nothing is visible outside a tenant transaction; the tenant setting never leaks between pooled connections; a taken email creates nothing.
* **Audit:** every configured check has a rule; a well built page scores 100; a bare page leaks; drafts read structured data and never overwrite what the owner typed.
* **Address guard:** private, loopback, link local, cloud metadata and IPv4 mapped addresses are refused, both by address and when a hostname resolves to one.
* **Owner input:** website, Instagram and Google links are tidied; niche matching; the brand brain form.
* **Pipeline, end to end:** greeting, answer and first question; duplicate webhooks ignored; every qualifying question then the owner alert; handoff on a request for a person, an emergency, or a question the brand brain cannot answer; silence until the brand brain is confirmed; follow ups sent when due and cancelled when the customer replies; approval mode; booking reminders and stopping everything when lost; pausing and handing back; owner replies; replies always stored after the message they answer.
* **WhatsApp:** signature checks, webhook parsing, text inside the 24 hour window, templates or a clear skip after it, retries with backoff and the final failure alert, encrypted tokens.
* **Assistant rules:** prices, FAQs, niche answers, opening hours, address, refusing to guess, the price guard, quiet hours, booking times in the business's own zone.
* **Dashboard numbers:** every check belongs to an area; bands and impact follow config; website checks wait rather than leak when the site cannot be read; fixes since the last check are detected; brand brain completeness.

Tests were checked by breaking things on purpose: switching off isolation on a table, removing the follow up cancellation, and restoring the old message timestamps each made the matching test fail, then pass again once restored.

## Where to change things

Nothing a business owner reads is hardcoded in page code.

| What | File |
| --- | --- |
| Product name, tagline, landing page copy, sign in page copy, dashboard copy, score bands, sidebar items, tones, rate limits, session length | `config/app.json` |
| Markets, currencies, payment providers, time zones | `config/markets.json` |
| Audit checks, weights, areas, impact levels, wording, fixes, thresholds | `config/audit.json` |
| Niche packs, including qualifying questions, handoff words, the booking prompt and follow up sequences | `packs/*.json`, listed in `packs/index.ts` |
| Assistant wording, handoff phrases, quiet hours, retries, web chat text, weekly alert threshold | `config/automation.json` |
| Database changes | a new numbered file in `db/migrations` |

All config files are validated when the app starts, so a mistake in one shows a clear error instead of a broken page.

## Design

* **Colours** live as tokens at the top of `src/app/globals.css`: warm off white paper, black ink, one orange accent. Change a token and every screen follows.
* **Type** is Geist for text and Geist Mono for the small uppercase labels.
* **Artwork** is drawn in code in `src/components/art.tsx`: the hero (grey blocks turning orange and flowing into a network), the dotted sphere, the dunes footer, and the small block scenes for each niche. There are no image files to manage.
* **Audit colours:** black means working, orange means leaking.

## Security notes

* The workspace for every query comes from the session, never from form input.
* Membership is rechecked on every request, so removing someone takes effect immediately.
* The audit fetcher only connects to public addresses on standard ports, checks every redirect hop, caps page size at 2 MB and times out after 8 seconds.
* Website text sent to the AI is treated as untrusted data, and the AI reply is validated before use. AI drafts never overwrite facts the owner has confirmed.
* Security headers are set for every page, including HSTS and frame blocking. Only the chat window can be shown inside another site, so the widget works on business websites.
* WhatsApp webhooks are rejected unless Meta's signature matches the raw body. The scheduler endpoint needs the cron secret. Web chat is rate limited per visitor and per address.
* Channel tokens are encrypted with AES 256 GCM before storage and are never sent back to the browser.
* The worker finds due jobs across businesses through one narrow database function, then runs each job inside that business's own tenant, so row level security still applies.

## Project layout

```
config/            editable settings and copy
packs/             niche packs
db/migrations/     SQL schema and row level security
scripts/migrate.ts migration runner
src/app/           pages and server actions
src/components/    interface pieces
src/lib/           database, auth, audit, AI, brand brain, queue
src/lib/pipeline/  conversation engine, follow ups, delivery, jobs, worker
src/lib/channels/  WhatsApp and email
tests/             automated tests
```
