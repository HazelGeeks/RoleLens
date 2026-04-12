# ADR: Persistent Storage Architecture for Multi-Device Sync

- Status: Proposed for implementation after PoC approval
- Date: 2026-04-13
- Related issue: #2

## Context

Current job tracking data lives in browser localStorage only. This causes:

- Device-bound data silos
- High risk of data loss when storage is cleared
- No reliable multi-device continuity

The product goal is to support personal multi-device tracking with low latency, clear conflict handling, and manageable operating complexity on Cloudflare-friendly infrastructure.

## Decision

Adopt a two-layer architecture:

1. Canonical storage: Cloudflare D1 (SQL)
2. Read/cache acceleration: Cloudflare KV for snapshots/materialized read paths

Concurrency control policy:

- Optimistic concurrency with integer version field on each job record
- PATCH mutation requires expectedVersion for conflict-safe writes
- Server responds with 409 and current record on stale writes

Idempotency policy:

- Create operations accept clientRequestId
- Duplicate retries with same clientRequestId return the original created record

## Why this decision

- D1 provides transactional consistency needed for conflict-safe job mutations.
- KV improves edge-read performance for list/dashboard style queries.
- Architecture remains close to existing Cloudflare deployment model.
- Keeps migration path incremental without rewriting the entire frontend first.

## Alternatives considered

### Cloudflare KV only

- Pros: very fast reads, simple setup
- Cons: eventual consistency writes and limited transactional guarantees
- Result: rejected as sole source of truth

### Supabase Postgres

- Pros: strong SQL + managed operations
- Cons: additional regional/network considerations and another platform dependency
- Result: acceptable fallback, not primary choice

### Firebase Firestore

- Pros: rapid iteration
- Cons: higher lock-in and cost scaling uncertainty for this data pattern
- Result: rejected for now

## Security model (draft)

- Enforce user-scoped access on every CRUD call.
- Require secure transport (HTTPS only).
- Do not allow query-string secrets.
- Mask sensitive fields in logs.
- Production direction: move from PoC header identity to authenticated session/JWT.

## Migration plan

Phase 1: PoC (this issue)

- Add API contract and in-memory adapter with version/conflict behavior.
- Validate two-device sync flow and retry safety through automated tests.

Phase 2: Persistent adapter rollout

- Implement D1 repository and optional KV read cache.
- Enable dual-write mode (local + persistent) behind feature flag.

Phase 3: Cutover and cleanup

- Make persistent API primary.
- Keep local fallback for rollback window.
- Disable legacy local-only write path after stability target is reached.

Rollback policy:

- Feature-flag rollback to local-only write path
- Continue accepting reads from local cache when persistent backend unavailable
- Reconcile pending cloud writes when service recovers

## Go/No-Go checklist

- Storage option comparison approved
- API/data model reviewed
- Auth/authorization draft approved
- Migration and rollback plan reviewed
- PoC test report shows conflict-safe multi-device sync behavior
