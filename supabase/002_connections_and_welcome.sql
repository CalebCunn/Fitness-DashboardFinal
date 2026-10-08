-- APEX · connections that follow the account, and the one-time welcome email.
-- Run once in Supabase → SQL Editor. Only ADDS columns; nothing is removed.

-- Strava / WHOOP refresh tokens, stored in the user's own private row (same row-level security
-- as their preferences: only they can read or change it).
alter table public.apex_data add column if not exists strava jsonb;
alter table public.apex_data add column if not exists whoop  jsonb;

-- When the welcome email went out (so it's only ever sent once).
alter table public.apex_profiles add column if not exists welcomed_at timestamptz;
