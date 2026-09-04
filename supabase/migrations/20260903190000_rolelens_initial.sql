begin;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'rolelens_app') then
    create role rolelens_app nologin noinherit;
  end if;
end
$$;

create table if not exists public.persistent_jobs (
  id text primary key,
  user_id text not null,
  company text not null,
  title text not null,
  location text,
  source_url text,
  status text not null check (
    status in ('NONE', 'NEW', 'SAVE', 'INTEREST', 'SUBMITTED', 'ARCHIVE')
  ),
  next_action text,
  follow_up_date text,
  tags_json text not null,
  created_at text not null,
  updated_at text not null,
  updated_by_device text not null,
  version integer not null check (version > 0)
);

create index if not exists idx_persistent_jobs_user_updated
  on public.persistent_jobs (user_id, updated_at desc);

create table if not exists public.persistent_job_notes (
  id text primary key,
  job_id text not null references public.persistent_jobs(id) on delete cascade,
  user_id text not null,
  content text not null,
  actor text not null,
  created_at text not null
);

create index if not exists idx_persistent_job_notes_job_created
  on public.persistent_job_notes (user_id, job_id, created_at desc);

create table if not exists public.persistent_job_create_requests (
  user_id text not null,
  client_request_id text not null,
  job_id text not null references public.persistent_jobs(id) on delete cascade,
  created_at text not null,
  primary key (user_id, client_request_id)
);

create index if not exists idx_persistent_create_requests_job
  on public.persistent_job_create_requests (user_id, job_id);

create table if not exists public.auth_users (
  id text primary key,
  email text not null unique,
  name text not null,
  password_hash text not null,
  created_at text not null,
  updated_at text not null
);

create index if not exists idx_auth_users_email
  on public.auth_users (email);

create table if not exists public.auth_sessions (
  id text primary key,
  user_id text not null references public.auth_users(id) on delete cascade,
  token_hash text not null unique,
  created_at text not null,
  expires_at text not null,
  last_seen_at text not null
);

create index if not exists idx_auth_sessions_user
  on public.auth_sessions (user_id);

create index if not exists idx_auth_sessions_expires
  on public.auth_sessions (expires_at);

create table if not exists public.persistent_goals (
  id text primary key,
  user_id text not null,
  company text not null,
  target_role text,
  motivation text,
  created_at text not null,
  updated_at text not null
);

create index if not exists idx_persistent_goals_user_updated
  on public.persistent_goals (user_id, updated_at desc);

create table if not exists public.persistent_goal_followups (
  id text primary key,
  goal_id text not null references public.persistent_goals(id) on delete cascade,
  user_id text not null,
  note text not null,
  next_action_date text,
  created_at text not null
);

create index if not exists idx_persistent_goal_followups_goal_created
  on public.persistent_goal_followups (user_id, goal_id, created_at desc);

create table if not exists public.feed_import_snapshots (
  key text primary key,
  generated_at text not null,
  snapshot_json text not null,
  created_at text not null,
  updated_at text not null
);

create index if not exists idx_feed_import_snapshots_generated
  on public.feed_import_snapshots (generated_at desc);

alter table public.persistent_jobs enable row level security;
alter table public.persistent_job_notes enable row level security;
alter table public.persistent_job_create_requests enable row level security;
alter table public.auth_users enable row level security;
alter table public.auth_sessions enable row level security;
alter table public.persistent_goals enable row level security;
alter table public.persistent_goal_followups enable row level security;
alter table public.feed_import_snapshots enable row level security;

revoke all on table public.persistent_jobs from anon, authenticated;
revoke all on table public.persistent_job_notes from anon, authenticated;
revoke all on table public.persistent_job_create_requests from anon, authenticated;
revoke all on table public.auth_users from anon, authenticated;
revoke all on table public.auth_sessions from anon, authenticated;
revoke all on table public.persistent_goals from anon, authenticated;
revoke all on table public.persistent_goal_followups from anon, authenticated;
revoke all on table public.feed_import_snapshots from anon, authenticated;

grant connect on database postgres to rolelens_app;
grant usage on schema public to rolelens_app;
grant select, insert, update, delete on table
  public.persistent_jobs,
  public.persistent_job_notes,
  public.persistent_job_create_requests,
  public.auth_users,
  public.auth_sessions,
  public.persistent_goals,
  public.persistent_goal_followups,
  public.feed_import_snapshots
to rolelens_app;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'persistent_jobs',
    'persistent_job_notes',
    'persistent_job_create_requests',
    'auth_users',
    'auth_sessions',
    'persistent_goals',
    'persistent_goal_followups',
    'feed_import_snapshots'
  ]
  loop
    if not exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = table_name
        and policyname = 'rolelens_app_access'
    ) then
      execute format(
        'create policy rolelens_app_access on public.%I for all to rolelens_app using (true) with check (true)',
        table_name
      );
    end if;
  end loop;
end
$$;

commit;
