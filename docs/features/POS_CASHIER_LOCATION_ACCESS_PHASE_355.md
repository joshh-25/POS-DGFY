---
status: reference
authority_level: reference
owner: engineering
last_reviewed: 2026-09-14
applies_to: pos_cashier_location_backend
---

# Phase 355 — Backend operating scope and cashier permissions

## Authority and scope

Implements the [Phase 354 contract](POS_CASHIER_LOCATION_ACCESS_PHASE_354.md),
[ADR 0020](../architecture/adr/0020-mode-aware-rbac-and-role-presets.md),
[ADR 0031](../architecture/adr/0031-pos-terminal-pairing-and-shift-safe-navigation.md)
and [ADR 0073](../architecture/adr/0073-pos-cashier-attendance-breaks-and-register-operator-sessions.md).
Catalog ownership remains under
[ADR 0029](../architecture/adr/0029-catalog-inventory-pos-storefront-ownership-boundaries.md).
No architecture exception, new table, production migration, user-grant rewrite,
commit or deployment is part of this phase. Concurrent worktree changes are preserved.

## Implementation

- `posUserOperatingScope.js` locks the existing tenant user and checks owned open
  shifts, active operator sessions and open attendance in the caller's transaction.
  Another terminal (including within the same branch) conflicts; same-terminal
  resume does not create another authority. Attendance at another branch must also
  be resolved. Separate tenants and different users retain independent scopes.
- The guard is composed into shift opening, lifecycle opening/resume, operator
  transitions and protected-mutation authorization. The legacy feature-disabled
  path still checks operating scope. Existing generated unique indexes remain the
  final same-table constraint. Duplicate/deadlock/lock-timeout acquisition failures
  return a conflict, not an internal database message.
- Fresh branch grants and active-user status are checked. POS SSO no longer treats
  `pos:switch_location` as a branch grant. Existing master-admin tenant-wide access
  is preserved; ordinary role labels do not create a new tenant-wide exception.
- Required route permissions, including either/or refund permissions and conditional
  employee-credit authorization, are rechecked against the actual operator. Acting
  user payloads replace browser-account permissions/master-admin flags. Scope
  conflict details during takeover are evaluated only after the dedicated PIN check.
- Authenticated mutations re-read the tenant user rather than reuse the short-lived
  read cache. Existing user-update cache invalidation remains. A request already in
  flight is not claimed to be instantaneously cancelled by a later revocation.
- Cashier default/effective permissions no longer add `items:edit`. Explicit edit
  delegation remains; the existing cashier delete ceiling remains. Item/admin
  routes retain their own domain permissions without a blanket open-shift rule.
- Native financial sync entries use the same operating-scope authorization. They
  do not synthesize operator authority from queued IDs. With lifecycle enabled,
  entries without live operator authority are rejected individually through the
  existing sync result contract. With lifecycle disabled, authorized entries
  delegate to the existing replay handlers. Queued evidence is not deleted.

## Protected-path inventory

| Surface | Enforcement / retained boundary |
| --- | --- |
| Checkout, split tender, parked-sale mutations | Existing paired-device and operator middleware; fresh actual-operator permissions |
| Void, cash/external/provider refund, split reversal | Same guard; preserve OR permission alternatives |
| Drawer events, drawer authorization/open | Same guard; drawer-adjust permission remains required |
| Online cash collection and balance payment | Same guard; server-derived operator attribution |
| Shift start/resume and relief/counted takeover | Transactional shared tenant-user guard; existing ownership, attendance, PIN and in-flight-operation checks retained |
| Native checkout/void/refund/cash collection/cash-event sync | Per-entry wrapper; no fabricated authority; legacy replay delegates only after scope authorization |
| Native shift acquisition/switch | Reuses guarded shift/lifecycle use cases |
| Item/catalog administration | Existing item-domain permissions; no register ownership requirement added |
| Monitoring, dispatch, settings, fiscal administration, historical reports | Existing independently governed permissions/scopes; no blanket mutation or shift requirement added |

## Read-only grant and index audit

Run from `apps/dgfy-api`: `node scripts/audit-cashier-item-grants.js`.
It refuses non-loopback database hosts, scans active local tenants without creating
connections through the schema-provisioning path, and executes SELECTs only.
Output excludes names, email addresses, secrets and authentication tokens.

Local run on 2026-09-14: **15 active non-test-prefixed tenant databases, 11 cashier
records, zero ambiguous saved item-edit grants**. All audited tenants had the
required unique shift/operator indexes. The final audit also checks the attendance
unique index. This is not evidence about production databases.

For any future `review_required_ambiguous_edit` row, an administrator must decide
whether to retain or revoke editing using the existing permission-management flow.
A stored array cannot prove inheritance versus explicit delegation. The audit
never proposes or applies an automatic rewrite.

## Validation and rollout limits

- Unit/HTTP permission tests cover default cashier, explicit editor, restricted
  manager, independent admin editing, stale cached user permissions, branch grants,
  active-operator permissions, either/or route metadata and PIN-before-conflict privacy.
- Migrated MySQL tests exercise both acquisition models across all four lifecycle
  configurations, simultaneous requests, one surviving authority, same-terminal
  resume, separate employees, revoked grants, unique indexes, and unchanged sale,
  tender-allocation, stock-movement and handoff counts after rejected acquisition.
- HTTP permission tests use a real Express boundary with a fixture authenticated
  identity; they are not a full deployed login/browser journey. DB concurrency tests
  use the real shared guard/repository and persisted models; the complete rendered
  two-browser journey remains Phase 356/357.
- Architecture, scoped ESLint, docs/ADR, scoped compliance-declaration and whitespace
  results are recorded in the [phase ledger](IMPLEMENTATION_PHASE_LEDGER.md).
- Live compliance preflight remains explicitly NOT-EXECUTED for this local-only
  change; the governed reconciliation gate must run before promotion.
- Phase 356 removes the remaining cashier-role UI edit shortcut and adds conflict
  recovery/permission-refresh UX. Phase 357 covers full deployed acceptance,
  offline/reconnect and applicable physical-device evidence. Do not advertise
  physical exclusivity while disconnected or mark this initiative production-ready.

Recovery: preserve the first register and financial history, resolve pending work,
formally release operator control and close the owned shift/attendance where needed,
then retry at an assigned destination. Do not auto-close, transfer drawer ownership,
or silently discard an offline queue to clear a conflict.
