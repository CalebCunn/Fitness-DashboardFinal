-- Apex Pro (Stripe) and founding members. Run once in Supabase → SQL Editor.

-- 1. Who pays, and when a free Pro ends (empty = no end, e.g. a paid subscription).
alter table public.apex_profiles add column if not exists stripe_customer text;
alter table public.apex_profiles add column if not exists stripe_subscription text;
alter table public.apex_profiles add column if not exists pro_since timestamptz;
alter table public.apex_profiles add column if not exists pro_until timestamptz;

-- 2. The coach allowance treats an expired free Pro as Free.
create or replace function public.use_ai_credit(p_user uuid, p_kind text, p_free int, p_pro int)
returns boolean language plpgsql security definer set search_path = public as $$
declare m date := date_trunc('month', now())::date; lim int; used int;
begin
  insert into apex_profiles(user_id) values (p_user) on conflict do nothing;
  select case when plan = 'pro' and (pro_until is null or pro_until > now()) then p_pro else p_free end into lim from apex_profiles where user_id = p_user;
  insert into apex_usage(user_id, month) values (p_user, m) on conflict do nothing;
  select coach + food into used from apex_usage where user_id = p_user and month = m for update;
  if used >= lim then return false; end if;
  if p_kind = 'food' then update apex_usage set food = food + 1 where user_id = p_user and month = m;
  else update apex_usage set coach = coach + 1 where user_id = p_user and month = m; end if;
  return true;
end $$;
revoke all on function public.use_ai_credit(uuid, text, int, int) from public, anon, authenticated;
grant execute on function public.use_ai_credit(uuid, text, int, int) to service_role;

-- 3. Founding members: everyone signed up today gets Pro free for 3 months.
insert into public.apex_profiles (user_id) select id from auth.users on conflict do nothing;
update public.apex_profiles set plan = 'pro', pro_since = now(), pro_until = now() + interval '3 months'
 where plan = 'free' and stripe_subscription is null;

-- To give someone Pro by hand later: Table Editor → apex_profiles → set plan to 'pro'
-- (and pro_until to an end date, or leave it empty for no end).
