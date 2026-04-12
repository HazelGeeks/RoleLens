# ADR: Local Storage Initialization Policy

## Status

Accepted

## Context

Auto-seeding sample postings on first run causes data trust issues in production-like usage.
Users can mistake sample metrics for real pipeline signals.

## Decision

1. Do not auto-insert sample postings when storage is empty.
2. Initialize the jobs key with an empty array ([]).
3. If storage payload is malformed or non-array, repair it to [] and continue.
4. Emit mutation events only for explicit write actions (save/status/note/follow-up/sync), not for read-time repairs.

## Consequences

- Pros:
  - prevents sample-data contamination in analytics
  - predictable empty-state UX
  - safer recovery from corrupted local state
- Cons:
  - demo experience requires manual input or sync trigger

## Alternatives Considered

1. Keep sample seed in development only
   - rejected for now to minimize branch behavior differences
2. Keep sample seed behind explicit URL flag
   - postponed until dedicated demo mode is required
