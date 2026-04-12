# RoleLens Data Reliability Requirements (Issue #3)

## Objective

Prevent misleading analytics and stale UI after local data mutations or feed sync operations.

## Scope

- localStorage initialization and recovery behavior
- Empty state behavior for Jobs and Dashboard
- post-mutation freshness for dashboard metrics
- sync observability (source-level success/failure and last sync details)

## Functional Requirements

1. First run starts with an empty data set in production-grade behavior.
2. Corrupted localStorage data recovers to a safe empty array.
3. Save/status/note/follow-up/sync mutations emit a shared update signal.
4. Dashboard and Jobs list listen to update signals and refresh without browser reload.
5. Sync feedback includes:
   - last sync timestamp
   - source-level success/failure
   - per-source error text when available
   - user-facing recovery actions

## Non-functional Requirements

- Keep aggregation linear with job count.
- Do not expose secrets or sensitive values in sync errors.
- Ensure empty and status messages are perceivable by assistive technologies.

## QA Scenarios

1. First visit with no localStorage key:
   - Jobs screen shows explicit empty state.
   - Dashboard screen shows explicit empty state.
2. Inject malformed JSON into storage key and reload:
   - App remains usable.
   - storage key is repaired to [] format.
3. Add posting and update status/note/follow-up:
   - Dashboard values reflect latest data on navigation without full page refresh.
4. Run source sync with one failing source:
   - Source-level results appear.
   - Recovery guidance appears.
