begin;

create table if not exists public.resume_profiles (
  user_id text primary key references public.auth_users(id) on delete cascade,
  profile_json text not null,
  version integer not null check (version > 0),
  updated_at text not null
);
alter table public.resume_profiles enable row level security;
revoke all on table public.resume_profiles from anon, authenticated;
grant select, insert, update, delete on public.resume_profiles to rolelens_app;
create policy rolelens_app_access on public.resume_profiles
  for all to rolelens_app using (true) with check (true);

-- Retired goal tables are intentionally retained for recovery.
commit;
