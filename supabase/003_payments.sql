-- Apex Pro payments (Stripe). Run once in Supabase → SQL Editor.
alter table public.apex_profiles add column if not exists stripe_customer text;
alter table public.apex_profiles add column if not exists stripe_subscription text;
alter table public.apex_profiles add column if not exists pro_since timestamptz;
