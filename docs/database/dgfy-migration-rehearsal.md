---
status: authoritative
authority_level: authoritative
owner: database
last_reviewed: 2026-07-11
applies_to: dgfy_data_migration_rehearsal
topic: dgfy_data_migration_rehearsal
---

# DGFY Data Migration Rehearsal Runbook

This runbook documents how to rehearse the Phase 03 old-to-new data
migration (`apps/dgfy-migration-runner`'s `data dry-run` / `data apply` /
`verify` commands) against **disposable** legacy landlord/tenant and
`dgfy_core`/`dgfy_business_*` schemas — never against production or shared
credentials. It is the MIG-05 evidence artifact for the full dry-run ->
apply -> retry -> verify loop, complementing
`docs/database/dgfy-data-migration-map.md` (source-to-target mapping
evidence) and `docs/database/dgfy-foundation.md` (target schema contract).

## Governing Docs and ADRs

- `docs/START_HERE.md` — documentation lookup order (authoritative).
- `docs/architecture/adr/0003-migration-facade-strategy.md` — beside-legacy Strangler Fig migration strategy this rehearsal follows.
- `docs/architecture/adr/0028-dgfy-account-company-switching.md` — explicit accepted-membership authorization contract; migration must never infer membership from email/phone.
- `docs/database/dgfy-foundation.md` — target `dgfy_core`/`dgfy_business_*` schema contract.
- `docs/database/dgfy-data-migration-map.md` — authoritative source-to-target field mapping and reason-code taxonomy.
- `.planning/phases/02-dgfy-database-foundation/02-VERIFICATION.md` — the idempotency false-clean issue this phase's `verify` fix resolves.

**ADR impact:** Not needed. This runbook documents existing Phase 01/02/03
locked decisions and command contracts; no new architectural decision is
introduced.

## 1. Scope and Safety Posture

- Every command in this runbook operates through the migration runner
  (`apps/dgfy-migration-runner`) — never through `backend/*` or a manual
  SQL client against production.
- `data apply` is a destructive operation and requires the same
  `--confirm-destructive` gate as `schema migrate` (Phase 01 D-09/D-10).
  There is no separate, weaker confirmation path for data migration.
- The migration target list is always an explicit, operator-supplied JSON
  manifest (`DGFY_MIGRATION_TARGET_MANIFEST`) — the runner never
  auto-discovers or migrates "every legacy tenant" on its own (D-01,
  `03-CONTEXT.md`).
- A production-like rehearsal (or any run against real/shared credentials)
  is out of scope for this runbook. Use only disposable, uniquely-suffixed
  schemas created and dropped by the rehearsal itself, exactly as
  `phase02Integration.test.js`/`phase03Integration.test.js` do.

## 2. Required Environment Variables

In addition to the Phase 01/02 env contract (`SOURCE_DB_*`, `TARGET_DB_*`,
`DGFY_BUSINESS_DB_NAMES`, `MIGRATION_ACTOR`, `REPORT_DIR` — see
`apps/dgfy-migration-runner/.env.example`), Phase 03 data commands require:

| Variable | Required by | Purpose |
|----------|-------------|---------|
| `DGFY_MIGRATION_TARGET_MANIFEST` | `data dry-run`, `data apply`, `verify` (when data verification is in scope) | Absolute path to the JSON migration target manifest file (see shape below). Validated before any DB connection is opened. |
| `SOURCE_DB_HOST` / `SOURCE_DB_PORT` / `SOURCE_DB_USER` / `SOURCE_DB_PASSWORD` | legacy landlord + legacy tenant reads | Same credentials are reused for both the legacy landlord database (`SOURCE_DB_NAME`) and every manifest-listed legacy tenant database — only the database name differs per manifest entry. |

`verify` treats a missing `DGFY_MIGRATION_TARGET_MANIFEST` as "data
migration verification not in scope for this run" (`data_migration.skipped:
true, ok:true`) rather than a failure — a schema-only verification run
(Phase 02 style) is unaffected. Once a manifest is configured, `verify`
fails closed: an invalid manifest or a verification error reports
`data_migration.ok:false`.

## 3. Migration Target Manifest Shape

```json
[
  {
    "legacy_tenant_id": "tenant-uuid-1",
    "legacy_tenant_db_name": "sku_tenant_1",
    "target_business_db_name": "dgfy_business_alpha",
    "expected_business_id": "biz-uuid-1",
    "expected_owner_account_id": "acct-uuid-1"
  }
]
```

Every field is required. The manifest is rejected before any DB connection
is opened if it is empty, malformed, has a duplicate `legacy_tenant_id` /
`legacy_tenant_db_name` / `target_business_db_name`, a
`legacy_tenant_db_name` that looks like a `dgfy_*`-owned database, or a
`target_business_db_name` that does not match
`dgfy_business_<stable_opaque_suffix>` (`src/data/targetManifest.js`).

## 4. Rehearsal Steps

1. **Provision disposable schemas.** Create a uniquely-suffixed legacy
   landlord DB, one legacy tenant DB per manifest entry, a disposable
   `dgfy_core_it_*`, and one disposable `dgfy_business_it_*` per manifest
   entry — never reuse a shared or production-named schema. Seed the legacy
   schemas with representative fixture data (see
   `apps/dgfy-migration-runner/tests/fixtures/phase03/legacyRecords.js` for
   the exact field shapes the mappers expect).
2. **Run the target schema foundation.** `schema migrate --confirm-destructive`
   against the disposable `dgfy_core_it_*`/`dgfy_business_it_*` targets —
   `data apply` writes into tables the Phase 02 foundation migration
   creates; it does not create the schema itself.
3. **Dry-run.** `data dry-run` — inspect the JSON report's
   `planned_inserts` / `planned_updates` / `planned_skips` /
   `planned_conflicts` / `orphan_records` / `tenant_coverage` fields. Confirm
   zero rows were written to any `dgfy_core`/`dgfy_business_*` table (dry-run
   never mutates target data — `src/data/dryRun.js` never calls a target
   `bulkInsert`/`bulkUpdate`).
4. **Apply.** `data apply --confirm-destructive` — inspect the report's
   `summary.rows_written` / `rows_skipped` / `rows_conflicted` /
   `checkpoints_marked` fields and the per-row `results` array (which never
   contains raw `target_payload`, password hashes, or terminal secrets).
   Confirm expected rows now exist in the target databases.
5. **Retry.** Re-run `data apply --confirm-destructive` against the exact
   same manifest and targets. Confirm row counts in every target table are
   unchanged from step 4 — no duplicate `accounts`/`businesses`/
   `staff_accounts`/`business_memberships`/`account_staff_assignments`/
   `locations`/`terminal_identities` rows, and no second `legacy_id_map` row
   for the same `(run_scope, legacy_source, legacy_table, legacy_id)`.
6. **Verify.** `verify` — inspect the new `data_migration` report section:
   - `data_migration.targets[].data_counts` — source vs. target entity
     counts (net of this run's own skip/conflict findings).
   - `data_migration.targets[].map_completeness` — every expected legacy
     record has a durable `legacy_id_map` row.
   - `data_migration.targets[].required_relationships` — every
     `account_staff_assignments` row is backed by an accepted
     `business_memberships` row (ADR 0028), and every `terminal_identities`
     row resolves to a migrated `locations` row.
   - `data_migration.open_findings` — must be empty (`ok:true`) for a clean
     rehearsal; any open skip/conflict/orphan finding (including a missing
     accepted membership) keeps `data_migration.ok`/`summary.data_migration_ok`
     `false` until remediated — it is never reported clean.
   - `data_migration.storefront_discovery_projection` — informational only
     (`blocking:false`); never controls `data_migration_ok`.
7. **Preserve evidence, then clean up.** Copy the JSON reports and
   `command_executions` rows out of `REPORT_DIR` before dropping the
   disposable schemas — the reports are the release evidence, not the
   disposable databases themselves.

## 5. Automated Gated Rehearsal Test

`apps/dgfy-migration-runner/tests/phase03Integration.test.js` automates
steps 1-6 above against real, disposable schemas on a real MySQL server. It
is gated behind an explicit opt-in flag and skips cleanly (not a failure)
when that flag is unset or no MySQL server is reachable:

```bash
RUN_PHASE03_INTEGRATION=true npm --prefix apps/dgfy-migration-runner test -- phase03Integration.test.js
```

Optional overrides (falling back to the existing `DB_HOST`/`DB_PORT`/
`DB_USER`/`DB_PASSWORD` convention when unset): `PHASE03_IT_DB_HOST`,
`PHASE03_IT_DB_PORT`, `PHASE03_IT_DB_USER`, `PHASE03_IT_DB_PASSWORD`.

The test creates disposable legacy landlord/tenant schemas plus disposable
`dgfy_core_it_*`/`dgfy_business_it_*` targets, seeds one account/tenant/
accepted-membership/staff-user/location/terminal-registry fixture, runs
`schema migrate` (target foundation), `data dry-run` (asserts zero target
mutation), `data apply --confirm-destructive` (asserts real writes), reruns
`data apply` (asserts no duplicate rows), and `verify` (asserts
`data_migration.ok:true` with zero open findings) — then drops only its own
disposable schemas and target-scoped metadata rows.

## 6. Secret-Handling Checks

- Reports never contain legacy `password_hash`, tenant-local
  `password_hash`/`pos_approval_pin_hash`, terminal `terminal_password_hash`/
  `pairing_version`, `cashier_email`, or legacy `company_token` — the apply
  report's `results` array is stripped to
  `{legacy_tenant_id, entity_type, operation, status, target_table, target_database, dgfy_id}`
  only (see `03-04-SUMMARY.md`).
- `business_database_registry` never stores DB credentials — only
  `database_name`/`stable_opaque_suffix`/`status`/`verified_at` (D-08,
  `docs/database/dgfy-foundation.md`).
- `.env`/`.env.*` files are never committed and never read by this runbook;
  credentials are supplied via process environment only.

## 7. Rollback Review Notes

- `data apply` has no automated rollback command in Phase 03 — rollback is
  a manual, evidence-led review: use the preserved JSON reports plus
  `legacy_id_map` rows (scoped by `run_scope`) to identify every row this
  run wrote, then remove/repair those rows explicitly before re-running.
  Never `DROP`/`TRUNCATE` a shared `dgfy_core`/`dgfy_business_*` database as
  a rollback shortcut.
- A retried `data apply` after a rollback attempt must be re-verified
  (step 6) before being treated as clean — do not assume a manual rollback
  restored `legacy_id_map`/`data_checkpoints`/`data_quality_findings` to a
  consistent state.

## 8. Production-Like Rehearsal Gates

Before any production-like (non-disposable) migration apply is authorized:

1. A clean gated rehearsal (Section 5) must pass against disposable schemas
   with representative data volume and shape.
2. `verify`'s `data_migration.ok` must be `true` with zero open
   `data_quality_findings` for the target scope, or every open finding must
   have an explicit, reviewed remediation decision.
3. The migration target manifest for the real run must be reviewed by an
   operator (not auto-generated) and must list only the tenants explicitly
   in scope for that run (D-01).
4. `--confirm-destructive` is supplied explicitly at invocation time — never
   defaulted, scripted without review, or bypassed.
5. Reports and `command_executions` rows from the rehearsal and the real
   run are both preserved as release evidence.
