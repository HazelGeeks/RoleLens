# RoleLens Multi-Device Journey (PoC)

## Persona and scenario

- Persona: individual frontend engineer managing applications from multiple devices
- Device A: laptop during daytime
- Device B: tablet or secondary desktop in evening

## Journey flow

1. Device A creates a new job entry.
2. Device B opens the list and sees the same entry without manual export/import.
3. Device B updates status to APPLIED and adds a note.
4. Device A attempts to edit stale data and receives a conflict-safe response.
5. Device A retries with latest version and update succeeds.

Expected UX outcomes:

- No silent overwrite
- No duplicate create on retry
- User can recover from conflicts without data loss

## API interaction map

- Create: POST /api/persistence/jobs
- List: GET /api/persistence/jobs
- Read one: GET /api/persistence/jobs/:id
- Update/Status/Note: PATCH /api/persistence/jobs/:id

Headers:

- x-rolelens-user (required)
- x-rolelens-device (recommended)
- Authorization: Bearer token (required only when PERSISTENCE_POC_TOKEN is set)

## Conflict and retry journey

### Conflict case

1. Device A reads version 1.
2. Device B writes version 2 first.
3. Device A writes expectedVersion 1.
4. Server returns 409 + current document.

### Recovery case

1. Device A merges user intent onto current document.
2. Device A retries with expectedVersion 2.
3. Server accepts and returns version 3.

## Network failure behavior

- Mutation is retried with backoff and jitter.
- Same clientRequestId is reused for create retries.
- User sees sync pending state until success.

## PoC execution checklist (2 environments)

1. Start local server.
2. Simulate Device A create request.
3. Simulate Device B list/read request.
4. Simulate Device B status update.
5. Simulate Device A stale patch and observe 409.
6. Simulate Device A retry with latest version and confirm success.

Automated verification:

- app/api/persistence/jobs/poc-sync.test.ts covers the full sequence above.

## Go/No-Go readiness signals

Go signals:

- Conflict and retry paths are deterministic.
- Data remains consistent across simulated devices.
- No duplicate records from create retries.

No-Go signals:

- Any silent overwrite detected
- Any duplicate record despite repeated clientRequestId
- Any unrecoverable failure after transient network simulation
