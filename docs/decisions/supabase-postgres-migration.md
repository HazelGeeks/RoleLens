# Supabase Postgres Migration

- Status: In progress
- Date: 2026-09-03

## Decision

RoleLens will run on Cloudflare Workers and store canonical application data in
the Hazel Co. Supabase Postgres project. Production database traffic goes
through a Cloudflare Hyperdrive binding named `HYPERDRIVE`.

The existing RoleLens authentication tables and cookie/session contract remain
unchanged for this migration. Supabase Auth is intentionally out of scope so
existing password hashes and sessions can be preserved.

## Security boundary

- Database credentials live only in the Hyperdrive configuration.
- The Worker receives only the Hyperdrive binding; no password is committed.
- Public Supabase Data API roles receive no table grants.
- Row-level security is enabled without public policies.
- Application queries continue to scope user-owned rows by `user_id`.

## Cutover sequence

1. Apply `supabase/migrations/20260903190000_rolelens_initial.sql`.
2. Export the source D1 database immediately before the maintenance window.
3. Convert the Wrangler export with
   `python scripts/convert_d1_export_to_postgres.py <d1.sql> --output <postgres.sql>`.
4. Import tables in parent-before-child order using the generated data-only SQL.
5. Compare source and target row counts for all eight tables.
6. Enable login for the migration-created `rolelens_app` role with a strong password.
7. Configure Hyperdrive against the Supabase direct Postgres endpoint with that role.
8. Add the resulting `HYPERDRIVE` binding ID to `wrangler.toml`.
9. Restore Worker secrets, including the existing `AUTH_PASSWORD_PEPPER`.
10. Deploy to the temporary `workers.dev` URL and run auth/CRUD/feed smoke tests.
11. Cut over the production domain only after verification.

## Rollback

Keep the original Pages deployment and D1 database unchanged during the
validation window. If verification fails, route traffic back to Pages; do not
delete either source resource until the rollback window closes.
