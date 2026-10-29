# Apex Pro payments (Stripe) — about 20 minutes

Until step 4 is done, nothing is locked: everyone keeps every feature.

**Free:** Today's call, lanes, your day, Strava activity, training plan, one recovery source, check-in, journal, races, shoes, strength, weekly issue and run posters, coach (30 messages a month).
**Pro (£4.99 a month):** everything in Free, plus Performance (race predictor, PB wall, form, pace band), Race day mode, Race your ghost, meal photo estimates, and 400 coach messages a month.
Your own site is always fully unlocked.

## 1. Supabase (1 minute)
SQL Editor → New query → paste the contents of `supabase/003_payments.sql` → Run.
This also makes **everyone already signed up a founding member: Pro free for 3 months**. It ends by itself, and they'll see the date in Settings → Account with a button to keep Pro.

## 2. Stripe account (10 minutes)
1. stripe.com → Start now. Sign up with hello@apexrunning.app. You'll add your bank details and ID so Stripe can pay you.
2. **Product catalogue → Add product**
   - Name: `Apex Pro`
   - Description: `Performance, race day mode, ghost races, meal photos and 400 coach messages a month.`
   - Price: **£4.99**, **Recurring**, **Monthly**. Save.
3. **Payment Links → New** → choose Apex Pro.
   - After payment: **Don't show confirmation page → redirect to** `https://apexrunning.app/?pro=1`
   - Create. Copy the link (starts `https://buy.stripe.com/...`).
4. **Settings → Billing → Customer portal** → Activate. Allow customers to cancel. Copy the **login link** (starts `https://billing.stripe.com/p/login/...`).

## 3. Stripe webhook (3 minutes)
1. **Developers → Webhooks → Add endpoint**
   - URL: `https://apexrunning.app/.netlify/functions/stripe-webhook`
   - Events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`
2. Save, then **Reveal** the **Signing secret** (starts `whsec_`). Copy it.

## 4. Netlify — the public site only (3 minutes)
Environment variables → add:
- `REACT_APP_STRIPE_PAYMENT_LINK` = the payment link
- `REACT_APP_STRIPE_PORTAL_URL` = the customer portal login link
- `REACT_APP_PRO_PRICE` = `£4.99 a month`
- `STRIPE_WEBHOOK_SECRET` = the signing secret (tick "Contains secret values")
Then Deploys → Trigger deploy.

## 5. Test it with a real card on yourself (2 minutes)
Settings → Account → **Go Pro** → pay → you're sent back to Apex and the badge turns **Pro** within a few seconds.
Then **Manage** → cancel → refund yourself in Stripe (Payments → the payment → Refund).

## Giving someone Pro for free
Supabase → Authentication → Users → copy their **User UID**. Then Table Editor → apex_profiles → their row → set `plan` to `pro`.
For a time limit, also set `pro_until` (e.g. `2027-03-01`). Leave it empty for Pro with no end. No row? Insert one with that `user_id`.
