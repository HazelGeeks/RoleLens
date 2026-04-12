# RoleLens Data Reliability Journey

## Primary Persona

Individual frontend engineer tracking high-priority applications daily.

## Journey

1. User opens Jobs page for the first time.
2. App shows empty state instead of seeded data.
3. User saves or syncs postings.
4. App emits a local update event after mutation.
5. Jobs and Dashboard views consume the same updated storage state.
6. User sees latest sync summary with source-level outcomes.

## Failure Journey (Sync)

1. User runs sync.
2. One or more sources fail.
3. App shows:
   - failed source names
   - error messages
   - recovery guidance (retry + verify settings)
4. User retries after correcting configuration.

## Accessibility Notes

- Empty state and sync status use clear, plain-language text.
- Dynamic messages are announced with status/alert semantics where appropriate.
