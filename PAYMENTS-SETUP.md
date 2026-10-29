# Apex Pro payments (Stripe) — about 20 minutes

Until step 4 is done, nothing changes in the app. Free accounts stay free.

## 1. Supabase (1 minute)
SQL Editor → New query → paste the contents of `supabase/003_payments.sql` → Run.

## 2. Stripe account (10 minutes)
1. stripe.com → Start now. Sign up with hello@apexrunning.app. You'll add your bank details and ID so Stripe can pay you.
2. **Product catalogue → Add product**
   - Name: `Apex Pro`
   - Description: `More coach messages every month. Founding member price, kept for as long as you stay.`
   - Price: **£3.99**, **Recurring**, **Monthly**. Save.
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
- `REACT_APP_PRO_PRICE` = `£3.99 a month`
- `STRIPE_WEBHOOK_SECRET` = the signing secret (tick "Contains secret values")
Then Deploys → Trigger deploy.

## 5. Test it with a real card on yourself (2 minutes)
Settings → Account → **Go Pro** → pay → you're sent back to Apex and the badge turns **Pro** within a few seconds.
Then **Manage** → cancel → refund yourself in Stripe (Payments → the payment → Refund).
