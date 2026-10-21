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
* **Results engine (round 5):** every lead's source and campaign, deal values, a Results page (funnel, speed to lead, after hours leads, revenue by source), a weekly results email, the review engine, reactivation campaigns, missed call text back and a lead form with consent. See **Automations that bring results**.
* **Global (round 4):** 14 countries in config, a time zone and language per business, money in any currency (including lakh and crore) in the price guard, English, French, Spanish and Portuguese, SMS through Twilio, STOP and START on every channel, follow up rules per market, and customer data export and deletion. See **Going global**.
* **Free hosting (round 3):** one command install on Oracle Cloud's free server with the database, an every minute worker, HTTPS, daily backups, deploys from GitHub that keep the site up and roll back on their own, and a monthly AI spending cap per workspace. See **Deploy free on Oracle Cloud**.

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

### The scheduler

Replies to customers are instant everywhere. Timed steps (follow ups, reminders, weekly checks, alert emails) are run by `/api/cron/tick`, which needs `Authorization: Bearer <CRON_SECRET>`.

* **On your own server (recommended, free on Oracle):** the `worker` service calls the tick every minute by itself. Nothing outside is needed.
* **On Vercel:** `vercel.json` calls the tick once a day, which is all the free plan allows. Add a free every minute job at [cron-job.org](https://cron-job.org) for `https://YOUR-APP/api/cron/tick`, with the header `Authorization` set to `Bearer YOUR_CRON_SECRET`.
* Due steps also run for a few seconds after every chat message, and owners can press **Run due steps now** on the Automations page.

### Connecting SMS (Twilio)

Each business uses its own Twilio account and number.

1. In **Channels**, under SMS, enter the Twilio number (with the country code), the Account SID and the auth token. The token is stored encrypted and never shown again.
2. In Twilio, open the number and set **A message comes in** to `https://YOUR-APP/api/webhooks/sms`, HTTP POST.
3. Leave Twilio's Advanced Opt Out on (it is on by default). Twilio then answers STOP, START and HELP itself, and the platform records STOP and START so nothing automatic goes out on any channel to a customer who opted out.

Every text is checked against Twilio's signature with that business's auth token, using `APP_URL` as the address Twilio signed, so `APP_URL` must be the public address. Unsigned, tampered or forged requests get 401.

### Connecting WhatsApp

The platform uses one Meta app; each business connects its own number.

1. In your Meta app, set the webhook address to `https://YOUR-APP/api/webhooks/whatsapp` with the same verify token as `WHATSAPP_VERIFY_TOKEN`, and subscribe to the **messages** field.
2. Set `WHATSAPP_APP_SECRET` (from the app's basic settings) and `ENCRYPTION_KEY` on the server.
3. Each business opens **Channels**, pastes its phone number ID and a permanent access token (stored encrypted, never shown again), and optionally names an approved follow up template whose first variable is the customer's first name.

## Automations that bring results

**Know what works (Results page).** Every lead keeps where it came from: the channel, the page, and the utm_source, utm_medium and utm_campaign of the link (Google and Facebook ad click ids and search referrers are recognised too). When you mark a sale won, add its value. The Results page shows leads, booked, won and revenue against the previous period, the funnel, speed to lead and the share answered within a minute, leads that arrived while you were closed, revenue by source, reviews, and what campaigns brought back. Every week the owner gets the same numbers by email with the weekly check.

**Reviews.** Under Automations, add your review link (on Google: Business Profile, then Ask for reviews) and turn requests on. A set number of hours after a sale is marked won, outside quiet hours, the customer is asked for a rating from 1 to 5. A 4 or 5 gets your review link through a tracked address (`/r/...`), so opened links are counted. 1 to 3 gets an apology and you get an alert, so you can put it right before anything is posted. Each customer is asked once, never after STOP, and by text only where the market allows it or they gave consent.

**Reactivation campaigns.** On Campaigns, pick a group (went quiet for a number of days, lost, past customers, or booked and then nothing), write one short message, and press **Check who gets it**. Each person is checked before anything is sent: opted out, messaged by another campaign in the last 7 days, web chat visitors (who cannot be messaged first), the market's consent rule for texts, and WhatsApp's 24 hour window (outside it, your approved template is sent instead, and the preview says so). The reasons for everyone left out are listed. Sending runs in batches of 25, waits out quiet hours in your time zone, and can be stopped. Replies alert you with the campaign's name, and replies, bookings, sales and revenue within 60 days are counted per campaign. The limits are in `config/automation.json` under `campaigns`, and the suggested messages per group in each language file under `campaignIdeas`.

**Missed call text back.** With SMS connected, set your Twilio number's Voice webhook ("A call comes in") to `https://YOUR-APP/api/webhooks/voice` and, under Channels, give the phone that should ring. Calls ring that phone for 20 seconds. If nobody answers, the caller hears a short message, gets a text at once, and the conversation starts in your inbox; their reply is not greeted a second time. Both voice webhooks check Twilio's signature like the SMS one.

**Lead form.** Every business gets a form at `https://YOUR-APP/f/<key>` (the same key as the web chat), to link from Instagram, Google or a QR code, or embed with the iframe code on Channels. Local phone numbers are turned into international form with the business's country code. With SMS connected, the person gets a text from the assistant within seconds; without it, you are alerted to call them. The consent box records agreement to marketing texts, which allows follow ups even where the law needs consent.

## Going global

Everything about a country lives in `config/markets.json`, and everything about a language in `config/locales/`.

**Add a country:** add an entry with a two letter code (the existing UK entry keeps `UK`), a name, an ISO currency code, a locale such as `en-AU`, the phone prefix, the payment provider, the data law, one or more IANA time zones (the first is the default), the languages offered, and the SMS rule:

```json
"AU": {
  "name": "Australia", "currency": "AUD", "locale": "en-AU", "phonePrefix": "+61", "paymentProvider": "Stripe",
  "dataLaw": "Privacy Act 1988 and the Spam Act for messages",
  "timeZones": ["Australia/Sydney", "Australia/Melbourne", "Australia/Brisbane", "Australia/Adelaide", "Australia/Perth"],
  "languages": ["en"], "smsFollowUps": false,
  "smsNote": "Automated follow up texts are off: the Spam Act needs consent for marketing messages. Replies and booking reminders still go out."
}
```

The app checks every code, currency and time zone when it starts. Money in that currency is recognised by the price guard straight away.

**Add a language:** copy `config/locales/en.json` to, for example, `de.json`, translate every text and phrase list, add the file to the list at the top of `src/lib/config.ts`, and add `"de"` to the markets that should offer it. Handoff phrases and STOP words from every language are always recognised, whatever the business's own language.

**What changes per business:** a business picks its country, time zone (when the country has several) and language during onboarding, and can change the zone and language later under Automations. Quiet hours, follow ups and booking reminders use the business's own time zone.

**Follow up rules per market:** `smsFollowUps` decides whether no reply and won follow ups may go by text. It is off where marketing texts need prior consent (the US under the TCPA, Canada under CASL, the UK and EU under PECR and ePrivacy, India under DLT rules, and others), and on in Nigeria, Ghana, Kenya and Mexico. Replies to a customer's own text and booking reminders always go out. Web chat and WhatsApp are not affected.

**Niche packs:** every pack is offered in every market (`"markets": ["*"]`). A question can be limited to some markets (the dental NHS question is UK only), an ad template too, and `{currency}` in help text becomes the business's currency symbol. Pack questions and follow up messages are written in English for now; translating them is a config change in the pack file.

**Customer data rights:** on any conversation, **Download their data** gives a JSON file of everything held about that customer, and **Delete customer data** (owners and managers, after ticking a confirmation) removes the customer, their messages, scheduled steps, activity and the alerts that named them, leaving one line in the log without their details.

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

## Deploy free on Oracle Cloud (recommended)

Oracle's Always Free plan includes a server (2 ARM cores, 12 GB memory) that allows commercial use and costs nothing while you stay inside the free limits. One `docker compose` stack runs everything on it: Postgres, migrations, the app, the every minute worker, HTTPS through Caddy, and a daily database backup. Every part restarts by itself. The same steps work on any Ubuntu server (Hetzner, for example) when you outgrow it.

### 1. Create the server (in the Oracle console)

1. Sign up at [oracle.com/cloud/free](https://www.oracle.com/cloud/free/). A card is needed to verify you; you are not charged within the free limits. Pick a home region close to your customers; it cannot be changed later.
2. Optional but wise: upgrade the account to **Pay As You Go**. The free allowance stays the same, and Oracle stops reclaiming free servers that look idle. Set a budget alert of 1 dollar so any charge emails you at once.
3. **Compute, Instances, Create instance.** Image: **Ubuntu 24.04**. Shape: **Ampere, VM.Standard.A1.Flex**, 2 OCPUs and 12 GB memory. Keep the public IP. Download the SSH key it offers.
4. Open the instance's **subnet, then its security list**, and add two ingress rules: source `0.0.0.0/0`, TCP, destination ports `80` and `443`.

If the console says it is out of capacity for that shape, try another availability domain or try again later; this is common in busy regions.

### 2. Install (on the server)

Connect with `ssh -i your-key ubuntu@SERVER_IP`, then:

```bash
sudo apt-get update && sudo apt-get install -y git
ssh-keygen -t ed25519 -N "" -f ~/.ssh/id_ed25519 && cat ~/.ssh/id_ed25519.pub
```

Add the printed key to GitHub as a read only deploy key (the repository's **Settings, Deploy keys**), then:

```bash
git clone git@github.com:OWNER/REPO.git placeholder
cd placeholder
sudo bash deploy/install.sh
```

The installer installs Docker, opens ports 80 and 443 inside the server, writes `.env` with fresh random secrets, builds, starts, and waits until the app is healthy. With no domain it gives you a free address made from your IP, such as `https://129-146-10-20.sslip.io`, with a real HTTPS certificate. When you buy a domain, point it at the server and run `sudo DOMAIN=app.yourdomain.com bash deploy/install.sh`; your secrets stay the same.

Optional keys go in `.env` (`ANTHROPIC_API_KEY`, `RESEND_API_KEY`, `WHATSAPP_APP_SECRET`), then run `docker compose up -d`.

### 3. Deploy automatically from GitHub

Every push to `main` runs `.github/workflows/deploy.yml`, which connects to the server and runs `deploy/update.sh`. Add three repository secrets: `SERVER_HOST` (the IP), `SERVER_USER` (`ubuntu`), and `SERVER_SSH_KEY` (a private key whose public half is in `~/.ssh/authorized_keys` on the server). Each deploy uses about one free GitHub minute.

`deploy/update.sh` keeps the site up while it updates:

1. It builds the new version while the current one keeps serving.
2. It runs migrations. If one fails, it stops and the live site is untouched.
3. It switches over and waits for the health check at `/api/health`.
4. If the new version is not healthy within three minutes, it goes back to the previous version by itself.

### Everyday commands (in the project folder)

| Task | Command |
| --- | --- |
| See what is running | `docker compose ps` |
| Read the app's log | `docker compose logs -f app` |
| See the worker's ticks | `docker compose logs -f worker` |
| Update by hand | `sh deploy/update.sh` |
| Restore a backup | `sh deploy/restore.sh backups/placeholder-YYYYMMDD-HHMMSS.dump` |
| Add the demo business | `docker compose run --rm migrate npm run seed:demo -- --force` |

Backups are written to `backups/` straight away and then daily, and 7 days are kept. Copy them off the server now and then (for example with `scp`), since a backup on the same machine does not protect against losing the machine.

### What still costs money

* **AI answers:** Claude is billed per call on any host. The rules answer common questions first, replies use the cheaper model in `config/automation.json` (`ai.replyModel`), and each workspace is capped at `ai.monthlyCallsPerWorkspace` calls a month (2000 by default). At the cap, questions go to the owner and they are told once.
* **WhatsApp:** replying to a customer who wrote first is free; template follow ups after the 24 hour window are charged by Meta.
* **A domain:** optional, about 10 dollars a year.

## Deploy to Vercel with Neon or Supabase (needs Vercel Pro for commercial use)

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
   | `AI_MODEL` | Optional. Model for drafting and niche matching. Defaults to `claude-sonnet-5-5`. |
   | `AI_REPLY_MODEL` | Optional. Overrides `ai.replyModel` in `config/automation.json` for customer replies. |

6. Deploy. Run `npm run migrate` again whenever a new file appears in `db/migrations`.
7. Set up the cron-job.org minute trigger described under **The scheduler**.

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
| Countries, currencies, payment providers, data laws, time zones, languages offered, SMS follow up rules | `config/markets.json` |
| The assistant's fixed messages, review, missed call and form texts, suggested campaign messages, chat window text, handoff phrases, STOP and START words, price and question words, per language | `config/locales/*.json` |
| Audit checks, weights, areas, impact levels, wording, fixes, thresholds | `config/audit.json` |
| Niche packs, including qualifying questions, handoff words, the booking prompt and follow up sequences | `packs/*.json`, listed in `packs/index.ts` |
| Quiet hours, retries, AI cap and reply model, reply length, web chat limits, weekly alert threshold, campaign limits (frequency cap, batch size, audience size, days a sale counts towards a campaign) | `config/automation.json` |
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
Dockerfile         one image for the app, worker and migrations
docker-compose.yml the whole stack on one server
deploy/            installer, safe updates, worker, backups, restore, HTTPS
```
