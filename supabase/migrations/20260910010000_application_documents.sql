begin;

create table if not exists public.application_documents (
  user_id text not null references public.auth_users(id) on delete cascade,
  kind text not null check (kind in ('resume', 'cover-letter')),
  id text not null,
  slot integer not null check (slot between 1 and 5),
  title text not null check (char_length(title) between 1 and 100),
  data_json text not null,
  version integer not null check (version > 0),
  updated_at text not null,
  primary key (user_id, kind, id),
  unique (user_id, kind, slot)
);

alter table public.application_documents enable row level security;
revoke all on table public.application_documents from anon, authenticated;
grant select, insert, update, delete on public.application_documents to rolelens_app;
drop policy if exists rolelens_app_access on public.application_documents;
create policy rolelens_app_access on public.application_documents
  for all to rolelens_app using (true) with check (true);

-- Preserve every existing resume and its optimistic version. Keep the source
-- table for recovery; reruns never overwrite edits in the new workspace.
insert into public.application_documents (user_id, kind, id, slot, title, data_json, version, updated_at)
select user_id, 'resume', 'primary', 1, 'My resume', profile_json, version, updated_at
from public.resume_profiles
on conflict do nothing;

commit;
