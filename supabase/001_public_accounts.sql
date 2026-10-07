-- APEX · public accounts. Run once in Supabase → SQL Editor.
-- Safe to run on your existing project: it only ADDS new tables. Your current
-- user_prefs / training_plan / chat_history tables (the owner site) are untouched.

-- 1. One private row per user: preferences, training plan, coach chat.
create table if not exists public.apex_data (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  prefs      jsonb,
  plan       jsonb,
  messages   jsonb,
  updated_at timestamptz not null default now()
);
alter table public.apex_data enable row level security;
drop policy if exists "apex_data own select" on public.apex_data;
drop policy if exists "apex_data own insert" on public.apex_data;
drop policy if exists "apex_data own update" on public.apex_data;
drop policy if exists "apex_data own delete" on public.apex_data;
create policy "apex_data own select" on public.apex_data for select to authenticated using (auth.uid() = user_id);
create policy "apex_data own insert" on public.apex_data for insert to authenticated with check (auth.uid() = user_id);
create policy "apex_data own update" on public.apex_data for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "apex_data own delete" on public.apex_data for delete to authenticated using (auth.uid() = user_id);

-- 2. Plan (free / pro). Users can read their own; only the server (service role) changes it.
create table if not exists public.apex_profiles (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  plan       text not null default 'free' check (plan in ('free','pro')),
  created_at timestamptz not null default now()
);
alter table public.apex_profiles enable row level security;
drop policy if exists "apex_profiles own select" on public.apex_profiles;
create policy "apex_profiles own select" on public.apex_profiles for select to authenticated using (auth.uid() = user_id);

-- 3. Monthly AI usage. Users can read their own count; only the server writes it.
create table if not exists public.apex_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  month   date not null,
  coach   int  not null default 0,
  food    int  not null default 0,
  primary key (user_id, month)
);
alter table public.apex_usage enable row level security;
drop policy if exists "apex_usage own select" on public.apex_usage;
create policy "apex_usage own select" on public.apex_usage for select to authenticated using (auth.uid() = user_id);

-- 4. Spend one AI credit if the user has any left this month. Called only by the server.
create or replace function public.use_ai_credit(p_user uuid, p_kind text, p_free int, p_pro int)
returns boolean language plpgsql security definer set search_path = public as $$
declare m date := date_trunc('month', now())::date; lim int; used int;
begin
  insert into apex_profiles(user_id) values (p_user) on conflict do nothing;
  select case when plan = 'pro' then p_pro else p_free end into lim from apex_profiles where user_id = p_user;
  insert into apex_usage(user_id, month) values (p_user, m) on conflict do nothing;
  select coach + food into used from apex_usage where user_id = p_user and month = m for update;
  if used >= lim then return false; end if;
  if p_kind = 'food' then update apex_usage set food = food + 1 where user_id = p_user and month = m;
  else update apex_usage set coach = coach + 1 where user_id = p_user and month = m; end if;
  return true;
end $$;
revoke all on function public.use_ai_credit(uuid, text, int, int) from public, anon, authenticated;
grant execute on function public.use_ai_credit(uuid, text, int, int) to service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- LATER, when you move yourself onto the public site (not before):
--
-- a) Sign up on the public site with your email, then find your id:
--      select id, email from auth.users;
-- b) Copy your existing data into your new account (replace YOUR-ID):
--      insert into public.apex_data (user_id, prefs, plan, messages)
--      select 'YOUR-ID', p.prefs, t.plan, c.messages
--      from user_prefs p, training_plan t, chat_history c
--      where p.user_id = 'caleb' and t.user_id = 'caleb' and c.user_id = 'caleb'
--      on conflict (user_id) do update set prefs = excluded.prefs, plan = excluded.plan, messages = excluded.messages;
--      insert into public.apex_profiles (user_id, plan) values ('YOUR-ID', 'pro') on conflict (user_id) do update set plan = 'pro';
-- c) Then lock the old single-user tables so the public key can't read them
--    (this switches the OLD owner site off — only do it once you've moved over):
--      alter table user_prefs enable row level security;
--      alter table training_plan enable row level security;
--      alter table chat_history enable row level security;
