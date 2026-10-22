# Drezzy Stores

Storefront and staff dashboard for Drezzy Stores, built from `Docs/Drezzy Stores Platform PRD.pdf`.
Next.js 16 (App Router, Cache Components), React 19, Tailwind 4, Supabase (Postgres, Auth).

```bash
npm install
npm run dev      # http://localhost:3000
npm run lint
npm run test:db        # database security rules (no Supabase needed)
npm run test:catalogue # catalogue and spreadsheet-import logic
npm run test:seed      # the seed loads cleanly and matches the demo catalogue
npm test               # every suite: database rules, orders, payments, sourcing, money, catalogue logic
npm run build
```

## Where the project is

| PRD phase | State |
| --- | --- |
| Storefront and dashboard UI | Interactive prototype on sample data (cart, checkout rules, tracker, dispatch board, catalogue, orders) |
| Sprint 1: identity, roles, audit | Built. Needs a Supabase project to run for real (below) |
| Sprint 2: catalogue, variants, suppliers, availability, Excel import | Built. Storefront and dashboard read it from Supabase, or show the sample catalogue until connected |
| Sprint 3/4: orders, payments, tracker, dispatch | Built. Guest checkout and staff orders are priced by the database; Paystack webhook and manual MoMo; public tracker; dispatch board; order detail |
| Sourcing: supplier orders | Built. Order from a supplier after payment, receive, or mark failed; costs hidden from roles without money access |
| Money: ledger, expenses, monthly summary | Built. One ledger over payments, supplier costs and expenses; role category limits |
| Refunds | Built. Support requests, Finance/Admin/Owner approve and pay (not their own request); shown as money out |
| Customer emails | Built. The database queues one email per customer-facing order update; `/api/notifications/run` sends them through Resend every 5 minutes (needs `RESEND_API_KEY`, `NOTIFY_FROM`, `CRON_SECRET`) |
| Delivery zones | Built. Settings edits fee, days, half payment and on/off; the shop, cart and checkout read the database zones |
| Targets, daily reports | Built. Targets are counted from orders, supplier orders and reports; every staff member files a daily report; managers see who has not |
| Analytics | Built. Sales, new vs repeat customers, best sellers, sources, and a funnel from anonymous shop visits to delivery. Money figures hidden from non-money roles |
| Salary records | Built. Owner and Finance only; paid salaries are locked and count as money out |
| Still to build | WhatsApp updates, Drip School CMS, exports, salary records, courier APIs |

## Connecting Supabase (about ten minutes)

1. Create a Supabase project (pick a region close to Ghana).
2. Copy `.env.example` to `.env.local` and fill in the URL, publishable key and secret key. Restart `npm run dev`.
3. Run the files in `supabase/migrations` in order (SQL editor, or `supabase db push`). Optionally run `supabase/seed.sql` to start with the sample catalogue (regenerate it with `npm run seed:generate`).
4. Authentication → Multi-Factor: enable TOTP. Authentication → Sign In: switch off public sign-ups.
5. Create the first Owner: `node scripts/create-owner.mjs you@example.com "Your Name"`.
6. Sign in at `/login`, set up 2FA, then add staff from Settings → Staff.

Until Supabase is connected, `/dashboard` redirects to `/setup`. To preview the dashboard design locally without it,
put `DREZZY_DEMO_STAFF=1` in `.env.local`. That only works in `npm run dev` and is ignored in production builds.

## How access control works

Three layers, so no single bug opens data up:

- **The database decides.** Row-level security and triggers in `supabase/migrations` enforce the permission matrix from PRD
  section 4. Staff data is only readable on a 2FA-verified session. Nobody can raise their own access, only an Owner can
  create Owners or the Finance role (which carries salary access), and the audit log is append-only.
- **The server re-checks.** `src/lib/auth.ts` is the one place that answers "who is this and what may they do". Pages use
  `<Guard module="...">`; server actions call `requireAction(...)` because a client can call an action directly.
- **The menu only reflects it.** Hiding a link is a convenience, not security. `src/proxy.ts` refreshes the session and
  sends signed-out visitors to `/login`; it is not the security boundary.

`npm run test:db` replays the migrations on an in-memory Postgres and acts as each kind of staff member to prove the rules.

## Catalogue

Each size of each colour (and style) is a **variant** with its own price, availability and supplier lead time. Drezzy keeps no
stock, so availability means "a supplier can provide it". New products arrive as drafts with every size Unavailable until a
sourcing officer confirms them, so nothing is offered that has not been checked. Staff edit the grid at
Dashboard → Catalogue, or bring a spreadsheet in at Catalogue → Import from Excel (CSV or .xlsx, template included).
Supplier costs live in their own table that only Owner, Admin, Finance and Sourcing can read.

The storefront reads published products through a cached query tagged `catalogue`; saving in the dashboard expires the tag, so
changes appear immediately. Without Supabase it shows the sample catalogue in `src/lib/catalogue/sample.ts`.

## Things to know

- The service-role key bypasses security. Data writes use the signed-in user's own session so the audit log records who did it.
- Checkout is a demo until Supabase is connected. Once it is, orders are real, and payment options follow the server's settings:
  Paystack (MoMo prompts and cards) when `PAYSTACK_SECRET_KEY` is set, manual MoMo when `DREZZY_MOMO_NUMBER` is set.
  Orders are only marked paid by the signed webhook at `/api/payments/paystack/webhook` (set that URL in the Paystack dashboard)
  or by Finance checking a manual payment. The Paystack request formats were written from its public docs and have not been run
  against a live account: test with a Paystack test key and small real payments before launch (PRD launch checklist).
- The service-role key is used in three places: creating a login, the owner script, and the payment webhook.
- Money is stored as exact decimals in cedis (numeric 12,2) rather than integer pesewas as the PRD suggests. It is equally exact.
- Order lookups and payment retries are rate-limited in memory per server instance: best effort, not a guarantee.
- Prices marked `// sample` and all delivery fees in `src/lib/data.ts` are defaults until the owner confirms them.
