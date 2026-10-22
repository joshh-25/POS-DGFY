---
status: draft_pr
owner: DGFY POS and OPIS
last_reviewed: 2026-10-22
declaration_id: 2026-10-16-pos-business-admin-catalog-workflows
classification: regulatory
surfaces: pos,terminal,business_admin,inventory,settings,tenant_schema,payments,compliance
reason_codes_impacted: ALLOWED
policy_version: 2026.10.14
verification_evidence: 16 targeted API suites with 244 passing tests, 3 OPIS files with 22 passing tests, 7 shared web-core files with 50 passing tests, changed-source lint, POS/OPIS production builds, architecture checks, repository compliance gate, git diff --check, local landlord plus 17 active tenant schemas verified with tenant_locations.address_details, POS/IMS lint rerun after barcode-save scope fix
rollback_note: Revert the Business Admin attendance and canonical-name workflows, POS cash reconciliation and catalog/settings synchronization, OPIS presentation, inventory editor workflow, additive audit migration, focused tests, and this declaration together; retain existing tenant, shift, audit, and catalog records for governed reconciliation.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-10-16T16:45:00+08:00
preflight_request_ref: NOT-EXECUTED-UPDATES-POS-BUSINESS-ADMIN-CATALOG
---

# POS and OPIS business administration, catalog, and terminal workflow updates

## Compliance Impact Classification

Regulatory because the batch changes shared POS terminal and inventory paths, adds
Business Admin attendance and canonical business-name mutations, and extends
tenant audit-schema compatibility and commerce refund-retry behavior. The server remains authoritative for
branch scope, permissions, shift ownership, cash reconciliation, and tenant
identity; the client does not gain a new financial or authorization bypass.

## Affected Surfaces

- `business_admin` — branch-scoped attendance, controlled end-of-attendance
  shift closure, canonical business-name editing, audit evidence, and related
  OPIS controls.
- `pos` and `terminal` — shift authorization and cash-reconciliation
  composition, catalog/settings change propagation, terminal refresh and
  visibility behavior, and operational POS presentation.
- `inventory` and `settings` — shared item-edit and product-wizard workflow
  presentation plus terminal settings synchronization.
- `tenant_schema` — additive support for the `business_name_update` audit
  action enum value; no existing tenant records are rewritten by the migration.
- `payments` — bounded commerce-payment refund retry state and operational
  recovery remain server-authorized and append-only.
- `compliance` — registration, tenant-admin audit, and governed preflight
  evidence remain covered by the platform compliance boundary.

## Compliance Preconditions

- Business Admin access, capability checks, tenant scope, and assigned-branch
  checks remain server-side; the browser cannot widen access or close a shift
  outside its authorized branch scope.
- Ending another cashier's attendance shift uses the existing POS close-shift
  authority and records the requested X-reading evidence through the existing
  fiscal-event boundary; it does not accept a cashier PIN from the HTTP body.
- Cash reconciliation is derived from persisted cash events and sales; the
  client cannot change drawer totals or financial authority by editing display
  values.
- Canonical business-name updates preserve tenant identity, storefront URLs,
  and QR tokens, record audit context, and treat POS/storefront invalidation as
  best-effort follow-up after the committed name update.
- Catalog and terminal refresh events remain tenant-scoped and additive; the
  existing server authorization and route contracts remain authoritative.
- POS catalog and settings event handling only refreshes the authenticated
  terminal's local presentation and cache; it does not mutate inventory,
  payment, shift, or tenant authority from the browser.
- The migration is additive and guarded by table existence; rollback maps the
  new audit action back to the existing capability action before restoring the
  prior enum set.
- No production deployment, live tenant mutation, or direct merge into
  `develop` is performed by this local transfer.

## Verification Evidence

- Targeted API coverage passed: 16 suites and 244 tests, including the
  Business Admin route/use-case contracts, cash reconciliation, POS catalog
  events, and the existing void/refund regression suites.
- OPIS coverage passed: 3 files and 22 tests. Shared web-core coverage passed:
  7 files and 50 tests covering item editing, product wizard, catalog
  presentation, and POS catalog refresh behavior.
- POS and OPIS production builds passed. Changed API source lint reported zero
  errors and one pre-existing `no-unused-vars` warning in
  `posRepository.js`; architecture, staged compliance, and `git diff --check`
  gates passed.
- The original `updates-pos` worktree changes are preserved in
  `stash@{0}` until the transferred commits and restored batches are verified.

## Amendment — POS UI catalog and settings synchronization

The shared POS UI batch adds the client-side refresh and settings-invalidation
coordination needed to consume the tenant-scoped events above, while retaining
the existing terminal identity, branch scope, and server-authorized mutation
boundaries.

## Amendment — Tenant-location schema drift and item-save lint repair

The additive `address_details` migration and tenant-schema repair path are part
of the same POS/terminal and tenant-schema change set. Local verification
confirmed the landlord schema and all 17 active tenant schemas contain
`tenant_locations.address_details`, and the POS branch-directory smoke test no
longer reports the previous unknown-column errors. The POS item-save success
message now calculates the existing barcode in the same scope used by the save
operation, removing the `existingPrimaryCode` lint/runtime reference error.

**Live request-time compliance preflight was not executed.** This declaration
uses the documented local placeholder and must be reconciled by the governed
preflight process before promotion.
