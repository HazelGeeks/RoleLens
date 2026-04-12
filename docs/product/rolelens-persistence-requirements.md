# RoleLens Persistence Requirements (Issue #2)

## 1. Goal

- Transition from browser-only storage to multi-device-capable persistent storage.
- Keep personal job tracking data consistent across devices without data loss.
- Reach a Go/No-Go decision with design + PoC + execution plan artifacts.

## 2. Storage Option Comparison

| Option | Estimated Cost | Latency (Korea/Canada users) | Operational Complexity | Vendor Lock-in | Notes |
| --- | --- | --- | --- | --- | --- |
| Cloudflare D1 | Low to medium | Low for edge-adjacent reads, medium for writes | Medium | Medium | SQL query flexibility, transactional updates, good for canonical records |
| Cloudflare KV | Low | Very low reads, eventual consistency writes | Low | Medium | Best for cache/materialized view, not ideal as single source of truth |
| Supabase Postgres | Medium | Medium (region dependent) | Medium | Medium | Strong relational model and auth integrations, but additional regional tuning required |
| Firebase Firestore | Medium to high | Low to medium | Low to medium | High | Fast start, but query/cost model and lock-in concerns for long-term portability |

Decision for PoC and execution plan:

- Source of truth: Cloudflare D1
- Read acceleration and snapshot cache: Cloudflare KV
- Conflict/version policy: optimistic concurrency control with record versioning

## 3. Target Data Model

Entity: PersistentJob

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| id | string(uuid) | yes | Server-issued job id |
| userId | string | yes | Personal user scope key |
| company | string | yes | Company name |
| title | string | yes | Role title |
| location | string | no | Human-readable location |
| sourceUrl | string(url) | no | External posting url |
| status | enum(JobStatus) | yes | Saved to closed lifecycle status |
| nextAction | string | no | Next explicit action item |
| followUpDate | YYYY-MM-DD | no | Follow-up target date |
| tags | string[] | yes | Search/filter metadata |
| notes | array(note) | yes | Time-ordered notes |
| version | number | yes | Incrementing record version for conflict control |
| createdAt | ISO timestamp | yes | Creation time |
| updatedAt | ISO timestamp | yes | Last updated time |
| updatedByDevice | string | yes | Device id that produced latest mutation |

Entity: PersistentJobNote

- id: string(uuid)
- content: string
- actor: string
- createdAt: ISO timestamp

## 4. API Contract (PoC)

Base headers:

- x-rolelens-user: required user scope
- x-rolelens-device: optional device identifier
- Authorization: optional Bearer token if PERSISTENCE_POC_TOKEN is configured

### 4.1 Create

- POST /api/persistence/jobs
- Body:

```json
{
  "company": "Figma",
  "title": "Frontend Engineer",
  "status": "SAVED",
  "clientRequestId": "device-a-2026-04-13-001"
}
```

- Response 201:

```json
{
  "ok": true,
  "job": {
    "id": "uuid",
    "version": 1
  }
}
```

### 4.2 List

- GET /api/persistence/jobs
- Response 200:

```json
{
  "ok": true,
  "count": 1,
  "jobs": []
}
```

### 4.3 Read one

- GET /api/persistence/jobs/:id

### 4.4 Update/Status/Note patch

- PATCH /api/persistence/jobs/:id
- Operation types:
  - update: partial field update
  - status: status transition with optional note
  - note: append note

Example body:

```json
{
  "op": "status",
  "expectedVersion": 4,
  "status": "APPLIED",
  "note": "Submitted resume and portfolio"
}
```

Conflict response (409):

```json
{
  "ok": false,
  "message": "Version conflict",
  "retryable": true,
  "current": {
    "id": "uuid",
    "version": 5
  }
}
```

## 5. Auth and Authorization Draft (Personal user model)

- Authentication draft:
  - Phase PoC: header-based user scope + optional bearer gate via PERSISTENCE_POC_TOKEN
  - Production target: OAuth session or passkey-backed session token
- Authorization draft:
  - Strict user ownership isolation: user can only read/write records under the same userId
  - No cross-user listing/query allowed
- Transport security:
  - HTTPS only
  - Do not pass secrets in query string
- Logging:
  - Mask tokens and personal notes in logs

## 6. Migration Strategy (localStorage -> persistent)

### 6.1 Backfill

1. Read local jobs from browser localStorage.
2. For each record, call POST/PATCH with a deterministic clientRequestId.
3. Preserve status history and notes ordering.

### 6.2 Duplicate handling

- Use clientRequestId idempotency for network retry duplication.
- Use normalized sourceUrl + company + title as secondary dedupe keys during import.

### 6.3 Rollback

- Keep local mirror write for one release window.
- If persistent writes fail repeatedly, continue local writes and mark cloud sync pending.
- Provide manual re-sync action after service recovery.

## 7. Error Scenarios and Retry Strategy

- Network outage:
  - Queue mutation locally with pending state.
  - Retry with exponential backoff (1s, 2s, 4s, 8s, max 30s) and jitter.
  - Reuse clientRequestId for safe replay.
- Conflict update:
  - Server returns 409 + current document.
  - Client rebases local change on top of current version and retries.
- Data-loss guarantee in PoC scope:
  - No blind overwrite without version check.
  - No duplicate create when clientRequestId is reused.

## 8. PoC Verification Status

- PoC route and store implemented.
- Two-device sync verification automated in tests:
  - Device A create -> Device B read
  - Device B update -> Device A stale update gets 409 -> retry success
  - Retry create with same clientRequestId produces no duplicate

Target interpretation of success metric for PoC:

- In automated test runs, multi-device create/update sync path passes consistently.
- Conflict recovery and retry behavior is deterministic and reproducible.
