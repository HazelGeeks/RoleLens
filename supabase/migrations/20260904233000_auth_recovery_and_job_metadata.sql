begin;

alter table public.persistent_jobs add column if not exists meta_json text;

create table if not exists public.auth_password_reset_tokens (
  user_id text primary key references public.auth_users(id) on delete cascade,
  token_hash text not null unique,
  created_at text not null,
  expires_at text not null
);
alter table public.auth_password_reset_tokens enable row level security;
revoke all on table public.auth_password_reset_tokens from anon, authenticated;
grant select, insert, update, delete on public.auth_password_reset_tokens to rolelens_app;
create policy rolelens_app_access on public.auth_password_reset_tokens
  for all to rolelens_app using (true) with check (true);

commit;
