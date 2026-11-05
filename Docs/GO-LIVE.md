# Taking Drezzy live

Do these in order. Never paste a key or password into a chat or an email.

## 1. Save the code to GitHub

In the terminal, run `git push -u origin platform-build`. Enter the username `djangmahprince`. For the password, paste a token from github.com/settings/tokens (classic token, tick `repo`).

Then open the repository on GitHub, create a pull request from `platform-build` into `main`, and merge it.

## 2. Create the database

1. Go to supabase.com and create a project. Region: Europe West, the closest to Ghana.
2. Use a database password with letters and numbers only, and save it somewhere safe.
3. Open `.env.local` in this project. It has four empty lines. Fill them in:

| Line | Where to find it |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Project Settings → Data API → Project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Project Settings → API Keys → Publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | Project Settings → API Keys → Secret key |
| `SUPABASE_DB_URL` | Connect button (top of the page) → Session pooler. Replace `[YOUR-PASSWORD]` with your password |

4. In the terminal, check them: `npm run setup:check`
5. Load the database: `node scripts/db-apply.mjs --apply --seed`

## 3. Switch on sign-in

In Supabase, under Authentication:

1. **Sign In / Providers**: keep Email on, and keep "Allow new users to sign up" on. Customers need it. Staff only get in through the staff list, so this does not open the dashboard.
2. **Multi-Factor**: enable TOTP (authenticator app).
3. **URL Configuration**: for now, set Site URL to `http://localhost:3000`. Change it to your real address in step 5.
4. **Email**: set the password reset link to expire after 3600 seconds.

Supabase's built-in email only sends a few messages an hour. That is fine for testing. Before launch, add your own sender (step 6), or new customers will stop getting confirmation emails.

## 4. Create the first Owner

1. Run: `node scripts/create-owner.mjs you@example.com "Your Name"`. It prints a one-time password, in your terminal only.
2. Restart the site, open http://localhost:3000/login, sign in, and set up 2FA with an authenticator app.
3. In the dashboard:
   - Settings → Staff: add the team. Each person gets a one-time password.
   - Settings → Riders: add every rider and courier with their phone number. Create a login for riders who will use the portal at `/partner`.
   - Settings → Site: enter the logistics line for each branch and its hours.

## 5. Put it online

1. Create an account at vercel.com and import the GitHub repository. Use the **Pro** plan: the site's scheduled jobs run every few minutes, which the free plan does not allow, and the free plan is not for commercial sites.
2. Under Environment Variables, add these from `.env.local`: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`. Do **not** add `SUPABASE_DB_URL` or `DREZZY_DEMO_STAFF`.
3. Add `CRON_SECRET` (any long random text) and `NEXT_PUBLIC_SITE_URL` (your address).
4. Deploy. Connect your domain under Settings → Domains.
5. In Supabase → Authentication → URL Configuration, set Site URL to your real address and add it under Redirect URLs.

## 6. Switch on the rest, as the accounts arrive

| What | Needs | Add to Vercel |
| --- | --- | --- |
| Emails | resend.com account and your domain verified (SPF, DKIM, DMARC). Also add Resend as Custom SMTP in Supabase → Authentication → Emails | `RESEND_API_KEY`, `NOTIFY_FROM` |
| Card and MoMo payments | Paystack approval. Set the webhook to `https://YOUR-DOMAIN/api/payments/paystack/webhook` | `PAYSTACK_SECRET_KEY` |
| Manual MoMo | The number customers pay to | `DREZZY_MOMO_NUMBER`, `DREZZY_MOMO_NAME` |
| SMS | Hubtel account | See `.env.example` |
| WhatsApp messages | WhatsApp Business Platform and approved templates | See `.env.example` |
| Google and phone sign-in | Set up in Supabase → Authentication → Providers | `NEXT_PUBLIC_GOOGLE_AUTH=1`, `NEXT_PUBLIC_PHONE_OTP=1` |

## 7. Before announcing

- Replace the sample prices, sizes and availability in Catalogue and sourcing.
- Add Shoes and Loafers products, and photos of at least 1200 px.
- Place a real test order from start to finish, with a rider.
- Turn on point-in-time recovery in Supabase, and test a restore once.
