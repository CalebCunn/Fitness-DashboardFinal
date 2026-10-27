# Oura and Google Health (Fitbit, Pixel Watch) setup

Nothing changes for WHOOP. Each new option only appears in the app once its keys are on Netlify,
so you can do one now and the other later.

**Redirect URL** (both services ask for it). Add both:
- `https://apexrunning.app`
- your personal Apex site's address (the one you use every day), e.g. `https://something.netlify.app`

No slash on the end.

## 1. Supabase (once, 1 minute)
Supabase → SQL Editor → New query → paste this → Run:
```sql
alter table apex_data add column if not exists oura jsonb, add column if not exists google jsonb;
```
This lets an Oura or Google connection follow someone onto their other devices, like Strava and WHOOP do.

## 2. Oura (10 minutes)
1. developer.ouraring.com → sign in → **My Applications** → **Create new application**.
2. Name: Apex. Website: https://apexrunning.app. Privacy: https://apexrunning.app/#privacy. Terms: https://apexrunning.app/#terms.
3. Redirect URIs: the two addresses above.
4. Scopes: tick **daily**, **heartrate**, **personal**.
5. Save. Copy the **Client ID** and **Client Secret**.
6. Netlify, on **both** sites → Environment variables → add:
   - `REACT_APP_OURA_CLIENT_ID` = the Client ID
   - `OURA_CLIENT_SECRET` = the Client Secret (tick "Contains secret values")
7. Deploys → Trigger deploy.

Oura only allows 10 users until you request a production review in the same dashboard. Do that once it works.

## 3. Google Health (Fitbit, Pixel Watch) (15 minutes)
1. console.cloud.google.com → your **Apex** project (the one from Google sign-in is fine).
2. **APIs & Services → Library** → search **Google Health API** → **Enable**.
3. **APIs & Services → OAuth consent screen → Data access → Add or remove scopes** → add:
   - `.../auth/googlehealth.sleep.readonly`
   - `.../auth/googlehealth.health_metrics_and_measurements.readonly`
4. **Credentials → Create credentials → OAuth client ID** → Web application, name "Apex Health".
   - Authorised redirect URIs: the two addresses above.
   - Copy the **Client ID** and **Client secret**.
5. Netlify, on **both** sites → Environment variables → add:
   - `REACT_APP_GOOGLE_HEALTH_CLIENT_ID` = the Client ID
   - `GOOGLE_HEALTH_CLIENT_SECRET` = the Client secret (tick "Contains secret values")
6. Deploys → Trigger deploy.

Health data is "sensitive" to Google. Until Google verifies the app (you apply from the consent screen),
only people you add under **Audience → Test users** can connect, and they'll see an "unverified app" warning.
Add yourself and any testers there first.

## 4. Test
You → Connections → **Connect Oura** (or Google Health) → sign in → you land back on You.
With two connected, choose **Sleep and recovery from** on the same page.
Google Health has no recovery score of its own, so Apex estimates one; it needs about a week of nights first.
