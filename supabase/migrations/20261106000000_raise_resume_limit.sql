begin;

set local lock_timeout = '5s';

alter table public.application_documents
  drop constraint application_documents_slot_check,
  add constraint application_documents_slot_check check (
    (kind = 'resume' and slot between 1 and 20) or
    (kind = 'cover-letter' and slot between 1 and 5)
  );

commit;
