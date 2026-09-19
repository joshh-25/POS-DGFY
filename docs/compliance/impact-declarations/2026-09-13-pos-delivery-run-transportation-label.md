---
status: reference
owner: engineering
last_reviewed: 2026-09-13
declaration_id: 2026-09-13-pos-delivery-run-transportation-label
classification: major
surfaces: pos,terminal
reason_codes_impacted: NONE
policy_version: 2026.09.03
verification_evidence: apps/dgfy-api/tests/deliveryRunTransportationLabel.migration.test.js -- actually executed (Jest),apps/dgfy-api/tests/posValidator.deliveryRun.test.js -- actually executed (Jest),apps/dgfy-api/tests/deliveryRun.usecase.test.js -- actually executed (Jest),apps/dgfy-api/tests/deliveryRunSerializer.test.js -- actually executed (Jest),apps/dgfy-api/tests/deliveryRunDispatch.usecase.test.js -- actually executed (Jest),apps/dgfy-api/tests/deliveryRunWriteThrough.usecase.test.js -- actually executed (Jest),node --check on all changed/new JavaScript files,npm run check:tenant-schema-coverage,npm run check:architecture,npm run check:compliance,npm run lint:docs,node scripts/check-app-version-bump.js
rollback_note: The change is additive. Revert the API/model/serializer wiring after confirming no clients still send the field, then run the migration down() to remove the nullable transportation_label column; existing delivery-run rows are not modified or reinterpreted. No index or enum value is introduced.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-09-13T11:43:13.434Z
preflight_request_ref: PREFLIGHT-34755013653-2026-09-13-POS-DELIVERY-RUN-TRANSPORTATION-LABEL
---

# Optional delivery-run transportation label

## Compliance Impact Classification

Major. The classification floor is mechanical: the diff changes the delivery-run repository,
serializer, and use-case files under `apps/dgfy-api/src/modules/pos/`, which are POS and terminal
surfaces under `scripts/check-compliance-impact.js`. The new field is a nullable, free-text display
label with a 120-character bound; it does not change delivery assignment, dispatch eligibility,
location scoping, status transitions, payment behavior, or completion authority.

`reason_codes_impacted: NONE` is intentional. No reason code, permission slug, route, status value,
or compliance decision path is added or changed. Existing create/update authorization remains the
`TRANSACT_POS` route guard.

`related_adr: none` -- ADR 0034 governs delivery-job/run ownership and lifecycle authority, but this
change adds display data only and does not change who may assign, dispatch, or complete a delivery.

## Affected Surfaces

1. `apps/dgfy-migration-runner/migrations/20260913000001-add-delivery-run-transportation-label.cjs`
   adds the nullable `delivery_runs.transportation_label` column idempotently and removes it only
   when present on rollback.
2. `apps/dgfy-api/scripts/sync-tenant-schemas.js` registers the column for tenant repair and fresh
   provisioning and bumps the schema capability version.
3. `apps/dgfy-api/src/models/DeliveryRun.js`, the delivery-run validator, repository/use-case
   create/update path, serializer, and test harness carry the optional field through the existing
   API contract.
4. The existing POST/PATCH delivery-run routes and `TRANSACT_POS` permission are unchanged.

## Compliance Preconditions

1. The field is optional and nullable at every layer. Omitting it stores and returns `null`; sending
   `null` or an empty string on update clears it; omitting it on PATCH leaves the stored value alone.
2. The field's contents are never read as a decision input. Dispatch and write-through regression
   tests pass with an arbitrary label, and no query, index, enum, or status transition depends on it.
3. The migration is additive and idempotent. The registry's repair SQL and fresh-provision DDL are
   kept in lockstep with the migration's `VARCHAR(120) NULL` shape.

## Verification Evidence

- Focused backend Jest verification passed: 6 suites, 88 tests, including migration contract,
  validator, create/update use-case, serializer, dispatch, and write-through coverage.
- The pre-declaration compliance check correctly failed on the three `modules/pos` files; the
  declaration is the required major POS/terminal response.
- Live MySQL tenant-schema execution was not available locally. The migration is covered through a
  mocked query interface and the registry repair/provisioning SQL is asserted directly.

## Residual Risks

The existing delivery-run test limitation remains: the new migration and use-case tests do not run
against a live tenant MySQL query planner in this environment. A deployed QA pass should confirm
the report/repair path and the POST/PATCH/GET contract against a tenant database before production.

## Preflight Reconciliation

The live compliance preflight endpoint was not executed from this develop-targeting worker session.
The `NOT-EXECUTED-*` reference is intentional and is expected to be reconciled by the promotion-time
compliance sweep against a deployed non-production environment.
