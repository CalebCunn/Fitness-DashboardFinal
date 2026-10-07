# Apex · going public

Two sites from one codebase:

| | Your site (today) | Public site (new) |
|---|---|---|
| Netlify site | the existing one | a new one |
| `REACT_APP_PUBLIC` | not set | `true` |
| `APEX_PUBLIC` | not set | `true` |
| Data | `user_prefs` / `training_plan` / `chat_history` (user `caleb`) | `apex_data`, one private row per user |
| Coach | access code (`APEX_ACCESS_CODE`) | sign-in + monthly allowance, or the user's own key |

## Step 1 · Secure your current site (do first, today)

1. Anthropic console → Settings → Limits: set a monthly spend limit.
2. Netlify → your current site → Site configuration → Environment variables:
   - Add `APEX_ACCESS_CODE` = a long random phrase only you know.
   - Add `STRAVA_CLIENT_SECRET` and `WHOOP_CLIENT_SECRET` (same values as the `REACT_APP_…` ones), then delete `REACT_APP_STRAVA_CLIENT_SECRET` and `REACT_APP_WHOOP_CLIENT_SECRET`.
3. Merge this branch into `main` and push. Your site behaves exactly as before.
4. On your phone: Customise → Coach and AI → enter the access code once.
5. Your old secrets were public in the website bundle. If Strava/WHOOP let you regenerate the client secret, do it and update the env vars.

## Step 2 · Domain

`apex.run` is taken (parked for sale). Likely free: **apexrunning.app**, apexrun.co.uk, joinapex.run, readthemorning.com.
Buy one (Cloudflare, Namecheap or Netlify Domains, about £10–20 a year). Also run a UK trademark search on “Apex” (gov.uk/search-for-trademark).

## Step 3 · Database (Supabase, about 5 minutes)

1. Supabase → your project → SQL Editor → paste `supabase/001_public_accounts.sql` → Run. It only adds new tables.
2. Authentication → Providers → Email: on. Turn on “Confirm email”.
3. Authentication → Email Templates → “Magic Link”: include the code, e.g. `Your Apex code is {{ .Token }}` (plus the link).
4. Authentication → URL Configuration: Site URL = your new domain; add it to Redirect URLs.
5. Authentication → SMTP: for real users, add a sender (Resend or Postmark free tier). Supabase’s built-in email is rate limited to a few per hour.
6. Project Settings → API: copy the `service_role` key for step 4. Never put it in a `REACT_APP_` variable.

## Step 4 · New Netlify site (public)

1. Netlify → Add new site → Import from Git → this repo → branch `public` (later: `main`).
2. Environment variables:
   - `REACT_APP_PUBLIC=true`, `APEX_PUBLIC=true`
   - `REACT_APP_SUPABASE_URL`, `REACT_APP_SUPABASE_KEY` (the anon key; that’s safe, RLS protects the data)
   - `SUPABASE_SERVICE_ROLE_KEY` (secret, server only)
   - `ANTHROPIC_API_KEY`, optional `APEX_COACH_MODEL`
   - `APEX_FREE_MESSAGES=30`, `APEX_PRO_MESSAGES=400`
   - `REACT_APP_STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`
   - `REACT_APP_WHOOP_CLIENT_ID`, `WHOOP_CLIENT_SECRET`
   - `REACT_APP_CONTACT_EMAIL=hello@yourdomain`
3. Domain management → add your domain.

## Step 5 · Connections

- **Strava** (strava.com/settings/api): set Authorization Callback Domain to the new domain. New apps only allow a handful of athletes until Strava reviews them, so apply for production access with screenshots, the privacy policy URL and a description. Can take weeks; start now.
- **WHOOP** (developer dashboard): add `https://yourdomain` as a redirect URI; apply for production approval.
- **COROS**: connects per user through its own sign-in; check their developer terms for public apps.

## Step 6 · Before inviting people

- Replace the draft privacy policy and terms with checked versions (ApexSignIn.js). The drafts are a sensible start, not legal advice.
- Register with the ICO as a data controller (about £52 a year for small organisations): ico.org.uk/fee.
- Test: sign up with a second email and check you can’t see the first account’s data.

## Later

- **Claude connector (MCP):** users add Apex to their own Claude so their Claude can read their runs and recovery, on their own plan.
- Pro subscriptions (Stripe on web, RevenueCat for iPhone), accounts on the iPhone app, Strava webhooks.
