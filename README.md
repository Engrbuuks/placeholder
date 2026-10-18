# Placeholder

AI marketing platform for owner run businesses in Nigeria and the UK. This is build round 1, the foundation.

## What works in this round

* **Accounts:** sign up, log in, log out. Passwords hashed with Argon2id. Sessions are random tokens in an httpOnly cookie; only a SHA256 hash of each token is stored. Login and signup are rate limited.
* **Multi tenant core:** every business is a workspace. Tenant data is isolated by PostgreSQL row level security, enforced by the database for the role the app connects as.
* **Onboarding in four steps:** where you trade, what you do (pick a niche or describe the business and it is matched), where customers find you, then confirm your details.
* **Niche packs:** real estate, clinics, dental, and a general pack. Each pack sets the intake questions, qualifiers, follow up sequences, content themes, ad templates, compliance rules and KPIs.
* **Website audit:** reads the business website safely and scores 19 checks, from WhatsApp link and tap to call through to page speed and structured data. Every leak comes with a plain language fix.
* **Brand brain:** the facts the assistant is allowed to say. Drafted from the website, then corrected and confirmed by the owner. It cannot be confirmed until the essentials are filled in.
* **Overview page:** score, leaks ordered by impact, brand brain status, setup summary and what comes next.

The assistant itself, WhatsApp, booking and ads come in the next rounds, as set out in the product spec.

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
   | `ANTHROPIC_API_KEY` | Optional. Turns on AI drafting and niche matching. |
   | `AI_MODEL` | Optional. Defaults to `claude-sonnet-5-5`. |

6. Deploy. Run `npm run migrate` again whenever a new file appears in `db/migrations`.

## Tests

```bash
npm test
```

22 tests run against the real database and the real audit code:

* **Tenant isolation:** the app role cannot bypass row level security; a workspace sees only its own rows, cannot write into another workspace, cannot update or delete another workspace; nothing is visible outside a tenant transaction; the tenant setting never leaks between pooled connections; a taken email creates nothing.
* **Audit:** every configured check has a rule; a well built page scores 100; a bare page leaks; drafts read structured data and never overwrite what the owner typed.
* **Address guard:** private, loopback, link local, cloud metadata and IPv4 mapped addresses are refused, both by address and when a hostname resolves to one.
* **Owner input:** website, Instagram and Google links are tidied; niche matching; the brand brain form.

The isolation tests were checked by switching off a policy on purpose: they fail, then pass again once it is restored.

## Where to change things

Nothing a business owner reads is hardcoded in page code.

| What | File |
| --- | --- |
| Product name, tagline, landing copy, tones, rate limits, session length | `config/app.json` |
| Markets, currencies, payment providers | `config/markets.json` |
| Audit checks, weights, wording, fixes, thresholds | `config/audit.json` |
| Niche packs | `packs/*.json`, listed in `packs/index.ts` |
| Database changes | a new numbered file in `db/migrations` |

All config files are validated when the app starts, so a mistake in one shows a clear error instead of a broken page.

## Security notes

* The workspace for every query comes from the session, never from form input.
* Membership is rechecked on every request, so removing someone takes effect immediately.
* The audit fetcher only connects to public addresses on standard ports, checks every redirect hop, caps page size at 2 MB and times out after 8 seconds.
* Website text sent to the AI is treated as untrusted data, and the AI reply is validated before use. AI drafts never overwrite facts the owner has confirmed.
* Security headers are set for every page, including HSTS and frame blocking.

## Project layout

```
config/            editable settings and copy
packs/             niche packs
db/migrations/     SQL schema and row level security
scripts/migrate.ts migration runner
src/app/           pages and server actions
src/components/    interface pieces
src/lib/           database, auth, audit, AI, brand brain
tests/             automated tests
```
