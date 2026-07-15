---
status: authoritative
authority_level: authoritative
owner: database
last_reviewed: 2026-07-15
applies_to: dgfy_data_migration_rehearsal
topic: dgfy_data_migration_rehearsal
---

# DGFY Data Migration Rehearsal Runbook

This runbook is the authoritative operator contract for proving the v2.1
Legacy Data Migration milestone against a disposable production-parity clone:
dry-run, destructive apply, retry apply, and verify across all six milestone
entity types.

The six VER-01 entity types are:

1. `product_folder`
2. `product`
3. `inventory_movement`
4. `product_embedding`
5. `availment`
6. `availment_item`

This runbook complements `docs/database/dgfy-data-migration-map.md` (source
field mapping, reason-code taxonomy, and verification policy) and
`docs/database/dgfy-foundation.md` (target schema contract).

## Governing Docs and ADRs

- `docs/START_HERE.md` - documentation lookup order.
- `docs/architecture/adr/0003-migration-facade-strategy.md` - beside-legacy
  Strangler Fig migration strategy.
- `docs/architecture/adr/0028-dgfy-account-company-switching.md` - tenant
  local staff authentication and accepted-membership linking contract.
- `docs/architecture/adr/0029-catalog-inventory-pos-storefront-ownership-boundaries.md`
  - accepted v2.1 amendment for additive historical product, inventory, and
  sales migration.
- `docs/database/dgfy-foundation.md` - target `dgfy_core` and
  `dgfy_business_*` schema contract.
- `docs/database/dgfy-data-migration-map.md` - source-to-target mapping,
  reason codes, six-entity verification, exact money policy, and non-blocking
  finding policy.

**ADR impact:** Not needed. This runbook documents the accepted migration
strategy and Phase 14 operator procedure; it adds no new architecture
boundary, live write path, or ownership change.

## 1. Scope and Safety Posture

- Rehearsal runs only through `apps/dgfy-migration-runner`; do not use
  manual SQL as the migration mechanism.
- Rehearsal targets must be disposable or explicitly approved
  production-parity clones. Never run `data apply` against production.
- The operator must review and approve the exact
  `DGFY_MIGRATION_TARGET_MANIFEST` before any destructive command.
- The operator must approve the runtime context before any destructive
  command. Record at minimum: Docker context, source DB host/name, target DB
  host/name, `TARGET_DB_NAME`, `DGFY_BUSINESS_DB_NAMES`, report directory,
  run scope, and migration actor.
- Use the documented Docker/runtime context explicitly. For current
  production-parity rehearsals that context is `lima-dgfy-dev`; do not rely
  on the shell's current Docker context or an implicit default.
- `data apply` is destructive and requires `--confirm-destructive`. The flag
  must be visible in the command invocation and must never be hidden behind a
  weaker wrapper.
- A skipped unit/integration test or a disposable unit-only run does not
  satisfy VER-03. VER-03 requires operator-reviewed production-parity
  dry-run/apply/retry/verify evidence.

## 2. Required Runtime Inputs

In addition to the Phase 01/02 runner env contract (`SOURCE_DB_*`,
`TARGET_DB_*`, `TARGET_DB_NAME`, `DGFY_BUSINESS_DB_NAMES`,
`MIGRATION_ACTOR`, `REPORT_DIR`), v2.1 rehearsal requires:

| Variable/control | Required by | Purpose |
|---|---|---|
| `DGFY_MIGRATION_TARGET_MANIFEST` | `data dry-run`, `data apply`, `verify` | Absolute path to the operator-reviewed manifest. |
| `RUN_SCOPE` or default `data-migration` | metadata reset, dry-run, apply, verify | Keeps `legacy_id_map`, `data_checkpoints`, and `data_quality_findings` scoped to the same rehearsal. |
| Docker context `lima-dgfy-dev` | production-parity rehearsal | Ensures commands run against the approved stack, not the local default context. |
| Approved report directory | all commands | Preserves dry-run/apply/retry/verify JSON and summary evidence without secrets. |

`verify` treats a missing manifest as schema-only verification. That is useful
for foundation checks, but it is not a data migration proof. Once a manifest
is configured, invalid manifest input or any verification error must fail
closed with `data_migration.ok:false`.

## 3. Migration Target Manifest

The manifest is operator-authored or operator-reviewed before use:

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

Every field is required. The runner rejects empty manifests, malformed JSON,
duplicate legacy tenant IDs, duplicate legacy DB names, duplicate target DB
names, legacy-looking target DB names, and target DB names that do not match
`dgfy_business_<stable_opaque_suffix>` before opening DB connections.

## 4. Target and Metadata Reset

Before a clean-slate rehearsal, reset the target business tables and the
matching metadata rows for the rehearsal run scope. The reset must be explicit
and reviewed; do not rely on stale targets to "probably" be clean.

Reset target tables that this milestone writes:

- `product_folders`
- `products`
- `inventory_movements`
- `product_embeddings`
- `availments` rows where `source_system = 'legacy_migration'`
- `availment_items` rows where `source_system = 'legacy_migration'`

Reset metadata rows for the same run scope and tenants:

- `dgfy_migration_meta.legacy_id_map`
- `dgfy_migration_meta.data_checkpoints`
- `dgfy_migration_meta.data_quality_findings`

The reset must include target rows and metadata together. Resetting only
target rows leaves completed checkpoints and existing ID maps that can
short-circuit re-processing; resetting only metadata can duplicate target
rows unless the natural-key reconciliation path catches every row.

## 5. Rehearsal Procedure

1. **Confirm runtime context.** Record Docker context, DB hosts, source DB,
   `TARGET_DB_NAME`, `DGFY_BUSINESS_DB_NAMES`, manifest path, report
   directory, run scope, and actor. The approved context must match the
   command environment before any destructive step.
2. **Apply target schema.** Run `schema migrate --confirm-destructive`
   against `dgfy_core` and every listed `dgfy_business_*` target. The target
   must include the Phase 12 product/inventory extension, Phase 13.5
   `staff_credentials`, and Phase 14 sales-history columns/index:
   `availments.source_system`, `availments.legacy_snapshot`,
   `availments.additional_fees`, `availment_items.source_system`,
   `availment_items.source_reference`,
   `availment_items.legacy_snapshot`, and
   `unique_availment_items_source_reference`.
3. **Dry-run.** Run `data dry-run`. Confirm planned entries include all six
   entity types and that product-domain entries precede sales entries. Dry-run
   must not mutate target data or mark checkpoints.
4. **Apply.** Run `data apply --confirm-destructive`. Confirm the four Phase
   13 checkpoints (`product_folder`, `product`, `inventory_movement`,
   `product_embedding`) complete before sales begins, then confirm
   `availment` and `availment_item` checkpoints complete.
5. **Retry apply.** Re-run `data apply --confirm-destructive` against the
   same manifest, targets, and run scope. Expected result: zero new inserts
   for already-mapped product folders, products, inventory movements,
   product embeddings, availments, and availment items. Existing target rows
   may be reconciled through `legacy_id_map` or natural keys; duplicates are
   a rehearsal failure.
6. **Verify.** Run `verify` with the same manifest and run scope. Inspect
   `data_migration.targets[]`, `data_migration.open_findings`,
   `product_reconciliation`, and `sales_reconciliation`.
7. **Preserve evidence.** Preserve dry-run, first apply, retry apply, verify
   JSON reports, summary text files, command execution rows, exact command
   invocations, environment manifest hash, and operator review notes before
   any cleanup.

Plan 08 must implement this runbook contract for the Phase 14 milestone
harness. Do not assume a not-yet-created Phase 14 harness defines operator
requirements differently; this runbook is the requirement source.

## 5.1 `dgfy-temp` EC2 Rehearsal Template Procedure

The current experimental EC2 rehearsal host is reachable as:

```bash
ssh dgfy-temp
```

On that host, the operator-maintained rehearsal template lives at:

```text
/home/ubuntu/dgfy-rehearsal-template
```

The template is the source of truth for the disposable rehearsal stack. It
contains:

- `baseline.sql` - validated baseline database snapshot.
- `baseline-uploads.tar` - matching uploads snapshot.
- `.env.compose` - local EC2 compose environment; never print or commit its
  values.
- `docker-compose.yml` - MySQL/Redis/app/nginx stack.
- `docker-compose.migration.yml` - one-shot migration-runner service.
- `reset-to-baseline.sh` - destructive reset back to the validated baseline.
- `migration/manifest.json` - reviewed migration target manifest.
- `migration/business-db-names.txt` - comma-separated `dgfy_business_*`
  target list used for `DGFY_BUSINESS_DB_NAMES`.
- `reports/` - durable report/evidence output directory.

Use this concrete procedure when refreshing and running a rehearsal on
`dgfy-temp`:

1. **Sync the current migration-runner source from the active branch.** The
   EC2 `~/dgfy-platform` directory is an image build context, not necessarily
   a git checkout. Refresh only the migration-runner app and its Docker
   packaging; do not overwrite the rehearsal template, `.env.compose`,
   reports, MySQL data, uploads, or nginx/cert assets.

   ```bash
   rsync -az --delete --exclude node_modules --exclude reports \
     apps/dgfy-migration-runner/ \
     dgfy-temp:/home/ubuntu/dgfy-platform/apps/dgfy-migration-runner/

   rsync -az \
     infrastructure/docker/dgfy-migration-runner/ \
     dgfy-temp:/home/ubuntu/dgfy-platform/infrastructure/docker/dgfy-migration-runner/
   ```

2. **Build the updated runner image on EC2.**

   ```bash
   ssh dgfy-temp '
     cd ~/dgfy-rehearsal-template &&
     docker compose -f docker-compose.yml -f docker-compose.migration.yml \
       --env-file .env.compose build migration-runner
   '
   ```

3. **Reset the disposable rehearsal stack.** This is destructive by design
   and must only be run against the EC2 template.

   ```bash
   ssh dgfy-temp '
     cd ~/dgfy-rehearsal-template &&
     ./reset-to-baseline.sh
   '
   ```

4. **Create the approved disposable target databases if the reset removed
   them.** Use only names from `migration/manifest.json` and require the
   `dgfy_business_` prefix.

   ```bash
   ssh dgfy-temp '
     cd ~/dgfy-rehearsal-template &&
     python3 - <<'"'"'PY'"'"' > /tmp/create_dgfy_targets.sql
import json
m = json.load(open("migration/manifest.json"))
for entry in m:
    db = entry["target_business_db_name"]
    if not db.startswith("dgfy_business_"):
        raise SystemExit(f"unexpected target database: {db}")
    print(f"CREATE DATABASE IF NOT EXISTS `{db}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;")
PY
     docker compose --env-file .env.compose exec -T mysql \
       mysql -uroot -p"$MYSQL_ROOT_PASSWORD" < /tmp/create_dgfy_targets.sql
   '
   ```

   If the root password is not exported in the shell, use the template's
   approved local-only root password from `.env.compose` without printing it.

5. **Run schema migration with the business target list explicitly injected.**
   Do not trust the compose-rendered default if it shows
   `DGFY_BUSINESS_DB_NAMES: ""`; that skips every business target.

   ```bash
   ssh dgfy-temp '
     cd ~/dgfy-rehearsal-template &&
     NAMES=$(cat migration/business-db-names.txt) &&
     docker compose -f docker-compose.yml -f docker-compose.migration.yml \
       --env-file .env.compose run --rm \
       -e DGFY_BUSINESS_DB_NAMES="$NAMES" \
       migration-runner node src/cli.js schema migrate
   '
   ```

6. **Run the real sequence with the same manifest, target list, actor, and
   report directory.** The production runner image contains `src/` only, so
   on EC2 the rehearsal is executed through the real CLI commands rather than
   through the Jest harness.

   ```bash
   ssh dgfy-temp '
     cd ~/dgfy-rehearsal-template &&
     NAMES=$(cat migration/business-db-names.txt) &&
     docker compose -f docker-compose.yml -f docker-compose.migration.yml \
       --env-file .env.compose run --rm \
       -e DGFY_BUSINESS_DB_NAMES="$NAMES" \
       -e RUN_PHASE14_MILESTONE_REHEARSAL=true \
       -e DOCKER_CONTEXT=lima-dgfy-dev \
       migration-runner node src/cli.js data dry-run &&
     docker compose -f docker-compose.yml -f docker-compose.migration.yml \
       --env-file .env.compose run --rm \
       -e DGFY_BUSINESS_DB_NAMES="$NAMES" \
       -e RUN_PHASE14_MILESTONE_REHEARSAL=true \
       -e DOCKER_CONTEXT=lima-dgfy-dev \
       migration-runner node src/cli.js data apply --confirm-destructive &&
     docker compose -f docker-compose.yml -f docker-compose.migration.yml \
       --env-file .env.compose run --rm \
       -e DGFY_BUSINESS_DB_NAMES="$NAMES" \
       -e RUN_PHASE14_MILESTONE_REHEARSAL=true \
       -e DOCKER_CONTEXT=lima-dgfy-dev \
       migration-runner node src/cli.js data apply --confirm-destructive &&
     docker compose -f docker-compose.yml -f docker-compose.migration.yml \
       --env-file .env.compose run --rm \
       -e DGFY_BUSINESS_DB_NAMES="$NAMES" \
       -e RUN_PHASE14_MILESTONE_REHEARSAL=true \
       -e DOCKER_CONTEXT=lima-dgfy-dev \
       migration-runner node src/cli.js verify
   '
   ```

7. **Copy back the exact reports for durable evidence.** Preserve the
   successful schema, dry-run, first apply, retry apply, and verify JSON
   reports from `/home/ubuntu/dgfy-rehearsal-template/reports/`, then compute
   local SHA-256 hashes before creating milestone evidence.

Important `dgfy-temp` lessons:

- `~/dgfy-platform` can be stale and may not contain current Phase 14 code.
  Always sync/build before rehearsing.
- `docker-compose.migration.yml` builds `dgfy-rehearsal-migration-runner:latest`
  from `/home/ubuntu/dgfy-platform`.
- `reset-to-baseline.sh` removes disposable target databases; recreate the
  manifest targets before schema migration when needed.
- Compose may render `DGFY_BUSINESS_DB_NAMES` as an empty string. Always
  inject `$(cat migration/business-db-names.txt)` for schema/data/verify.
- A CLI sequence that reports `data_migration_ok=true` is strong evidence,
  but final VER-03 acceptance still depends on the evidence contract: source
  volume must be non-vacuous for each required entity unless the plan
  explicitly accepts a source-zero entity as governed not-applicable.

## 6. Expected Proof

A successful rehearsal must prove:

- The dry-run planned all six entity types:
  `product_folder`, `product`, `inventory_movement`, `product_embedding`,
  `availment`, and `availment_item`.
- The first apply wrote/reconciled the expected six-entity rows and marked
  checkpoints in dependency order.
- The retry apply inserted zero duplicate six-entity rows.
- `verify` reports `data_migration.ok:true`.
- `data_migration.open_findings.blocking_count` is `0`.
- Expected lossy product findings remain visible but non-blocking:
  `lossy_category_collapse` and `folder_nesting_flattened`.
- Staff linkage findings remain visible under `staff_auth` and do not block
  data fidelity unless an existing corrupt assignment violates the accepted
  membership chain.
- Header attribution findings remain visible and non-blocking only for:
  `sale_location_not_mapped`, `sale_terminal_not_mapped`, and
  `sale_cashier_not_mapped`.
- Sales exact sums match by mapped status/source system using fixed-scale
  DECIMAL(14,4) BigInt units.
- `sales_reconciliation.provenance.ok` is true: headers use
  `source_system='legacy_migration'` and `legacy_pos:` references; lines use
  `source_system='legacy_migration'` and `legacy_pos_line:` references.
- `sales_reconciliation.relationships.ok` is true: every migrated line points
  to a migrated availment and a migrated product.
- `sales_reconciliation.void_fidelity.ok` is true: legacy void count equals
  migrated `source_system='legacy_migration' AND status='voided'` count.
- Reports and preserved evidence are redacted: no DB credentials, password
  hashes, POS PIN hashes, invite/reset tokens, terminal secrets, raw snapshot
  values from `legacy_snapshot`, or unredacted customer/payment payloads in
  shared evidence.

Any open blocking finding, exact-total mismatch, missing line FK, missing
product FK, duplicate retry insert, or unreviewed non-blocking finding keeps
the rehearsal incomplete.

## 7. Automated Gated Tests

`apps/dgfy-migration-runner/tests/dataProductRehearsal.test.js` is the
existing Phase 13 analog: it is environment-gated, skips cleanly without
real DB credentials, and drives dry-run/apply/retry/verify against configured
targets when credentials exist.

Phase 14's six-entity harness must follow that pattern but extend it to
sales history. Required assertions include:

- dry-run plans product/inventory before `availment`/`availment_item`;
- apply refuses sales until the four Phase 13 checkpoints are complete;
- retry inserts zero duplicate sales rows;
- verify proves exact sales totals, line provenance, line parent/product FKs,
  void fidelity, zero blocking findings, and reviewed non-blocking findings.

A skipped harness is acceptable for CI health, but it is only a readiness
artifact. It is not VER-03 evidence.

## 8. Secret and Snapshot Handling

- Reports must list database names, run scopes, report paths, counts, reason
  codes, and verdicts only. They must not include credentials.
- Dry-run and apply report entries must not include raw `target_payload`,
  password hashes, POS PIN hashes, terminal passwords, pairing secrets,
  invite/reset tokens, or raw `legacy_snapshot` customer/payment/fiscal values.
- Evidence shared outside the approved operator context must redact source DB
  hostnames if they reveal production infrastructure, customer identifiers,
  payment references, delivery addresses, phone/email values, and fiscal
  snapshots.
- Embedding vectors and product attributes should be summarized by counts or
  hashes unless an approved investigation explicitly requires record-level
  inspection.

## 9. Connection Cleanup

Each runner command must close every connection it opens: landlord source,
legacy tenant source, business target, metadata, and any command-local target
connection. Caller-owned connections remain caller-managed. A rehearsal with
successful data assertions but leaked handles is not complete; preserve the
test output and fix the cleanup issue before using the evidence.

## 10. Evidence Inventory

Preserve these artifacts for the milestone verifier:

- operator-approved manifest path and manifest hash;
- approved runtime context record;
- dry-run JSON and summary reports;
- first apply JSON and summary reports;
- retry apply JSON and summary reports;
- verify JSON and summary reports;
- command execution rows for each run;
- target/reset evidence, including which target tables and metadata rows were
  reset;
- exact command invocations, including `--confirm-destructive`;
- reviewed non-blocking finding decisions;
- final verdict proving all six entity types.

## 11. Rollback Review Notes

`data apply` has no automated rollback command. If a rehearsal must be
discarded, use preserved reports plus `legacy_id_map` rows scoped by run
scope to identify rows written by the run, then reset the disposable target
and metadata together before retrying. Never drop or truncate a shared
`dgfy_core` or `dgfy_business_*` database as a rollback shortcut.

## 12. Production-Parity Gates

Before any real cutover or production-like apply is authorized:

1. The operator-reviewed manifest and runtime context are approved.
2. The target schema is current through Phase 14.
3. Target plus metadata reset is explicit and preserved as evidence.
4. Dry-run, first apply, retry apply, and verify reports are preserved.
5. Retry apply inserts zero duplicate six-entity rows.
6. Verify reports exact product/inventory/sales fidelity with
   `data_migration.ok:true`.
7. Blocking findings are zero.
8. Non-blocking findings are reviewed and documented.
9. Evidence is redacted before wider sharing.
10. `--confirm-destructive` remains explicit in every destructive command.
