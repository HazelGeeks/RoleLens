begin;

alter table public.persistent_jobs
  drop constraint persistent_jobs_status_check;

alter table public.persistent_jobs
  add constraint persistent_jobs_status_check check (
    status in ('NONE', 'NEW', 'SAVE', 'INTEREST', 'PLANNED',
               'SUBMITTED', 'ON_HOLD', 'NOT_APPLYING', 'EXPIRED', 'ARCHIVE')
  );

commit;
