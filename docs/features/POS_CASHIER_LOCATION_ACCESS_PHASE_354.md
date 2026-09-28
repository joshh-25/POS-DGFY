---
status: authoritative
authority_level: authoritative
owner: architecture
date: 2026-09-14
last_reviewed: 2026-09-14
review_by: 2027-03-14
applies_to: pos, tenant_authorization, catalog_permissions
topic: pos_cashier_location_access
---

# Cashier Location Access — Phase 354 Contract

Phase 354 was explicitly approved on 2026-09-14. This is a documentation-only
contract. Runtime delivery is Phase 355 (backend), Phase 356 (POS UI), and Phase
357 (hardening). No feature flag, account, stored grant, schema, API, APK, or
production configuration is changed by this document.

## Authority and assessment

Read in order: [START_HERE](../START_HERE.md),
[Architecture Boundaries](../architecture/ARCHITECTURE_BOUNDARIES.md),
[Architecture Governance](../architecture/ARCHITECTURE_GOVERNANCE.md),
[ADR 0031](../architecture/adr/0031-pos-terminal-pairing-and-shift-safe-navigation.md),
[ADR 0073](../architecture/adr/0073-pos-cashier-attendance-breaks-and-register-operator-sessions.md),
[ADR 0020](../architecture/adr/0020-mode-aware-rbac-and-role-presets.md), and
[ADR 0029](../architecture/adr/0029-catalog-inventory-pos-storefront-ownership-boundaries.md).
The boundary/governance review dates are 2026-03-06/2026-05-21; ADR 0031 is
reviewed 2026-09-14, ADR 0073 2026-08-26, ADR 0020 refreshed 2026-09-14,
and ADR 0029 2026-07-14. Their applicable ADR review deadlines have not expired.

The permission default changes via a dated ADR 0020 amendment. ADR 0073's
binding operator/attendance/register invariants are preserved. No new layer
exception, allowlist dependency, credential authority, or duplicate ledger is
introduced. Implement business rules in use cases, persistence in repositories,
and request/response mapping in controllers.

## Verified baseline and gaps

| Existing implementation | Reuse / remaining proof |
| --- | --- |
| `apps/dgfy-api/src/modules/pos/usecases/posUseCases.js` checks an owned open shift and terminal home location | Preserve same-terminal resume and cross-terminal conflict; verify interaction with relief operators |
| `apps/dgfy-migration-runner/migrations/20260724000001-enforce-one-open-shift-per-operator.cjs` | Reuse the owned-open-shift constraint; do not reinterpret opening owner as current operator |
| `packages/tenant-bootstrap/migrations/20260824000001-create-pos-cashier-attendance-operator-sessions.cjs` | Reuse unique active user/terminal constraints; verify actual tenant schema and real concurrent requests |
| `apps/dgfy-api/src/modules/pos/usecases/posOperatorAuthorityUseCases.js` | Revalidates scoped authority; has a feature-disabled legacy fallback that needs mixed-location proof |
| `apps/dgfy-api/src/modules/pos/usecases/posCashierLifecycleUseCases.js` | Takeover rejects attendance at another location; preserve atomic handoff and test shift-opening/recovery paths |
| `apps/dgfy-api/src/services/dgfyPosTerminalPolicyService.js` | `pos:switch_location` currently skips a grant check; align ordinary branch access with explicit scope |
| `apps/dgfy-api/src/utils/userPermissions.js` and `src/config/permissions.js` under the API | Currently force/default cashier editing; Phase 355 must change both and inspect stored grants |
| `packages/web-core/src/features/pos/pages/TerminalPage.jsx` | Currently grants editing using `isCashierRole`; remove this shortcut in Phase 356 |
| `apps/dgfy-api/src/routes/items.js` | Existing item mutations require granular permissions; reuse domain routes, do not add an open-shift requirement |

The prior source audit passed six backend suites / 38 tests and architecture
checks. This is baseline evidence, not new-policy acceptance, live schema proof,
or proof of deployed behavior. The worktree contains concurrent changes; inspect
the diff before every implementation step and preserve unrelated work.

## Approved behavior

1. Scope is `(tenant, tenant user)`. A user assigned only Aurora may operate
   Aurora's eligible terminals only. A multi-location user may operate one
   register at a time among authorized locations. Different users may operate
   different terminals at Aurora simultaneously. This does not implement a
   global account lock across independent companies.
2. Keep one active operator session per user and terminal. Keep the existing
   owned-open-shift and attendance constraints. Check their combined state even
   if attendance lifecycle is enabled at one branch and disabled at another.
   Reject a conflicting start with HTTP 409 and a stable reason, leaving the
   existing register and pending work intact. Permission/scope denial is 403.
3. Same-terminal resume must reuse valid existing state. A new browser login,
   terminal selection, screen lock, logout, or browser close is not proof that
   the cashier has ended register/attendance responsibilities. This contract
   does not prohibit multiple authenticated browser sessions for administrative
   work, or add a separate one-browser-per-user session mechanism.
4. Derive transaction cashier and scope from validated server authority; reject
   forged tenant, terminal, location, shift, cashier, and operator-session
   fields. Recheck current membership, active user, permissions and grants on
   protected requests. Do not retain permission authority merely because it
   existed when a token was issued.
5. A parked-sale handoff transfers cart responsibility only. An operator handoff
   revokes outgoing operator authority but preserves the register shift and
   opening owner. Counted custody requires the existing acknowledgements/count.
   Moving branches also requires resolving attendance/break state and any owned
   open shift through existing close/recovery rules. A handoff alone is not a
   universal branch-transfer permission. Never auto-close financial history.
6. `pos:switch_location` permits the governed switching action; for ordinary
   assigned-scope users it must not turn an unassigned branch into an authorized
   one. Preserve existing explicit tenant-wide/master-admin authority. A strict
   device remains bound to its registered terminal/location in either case.
7. Cashier defaults become view-only for catalog maintenance. An authorized
   administrator may explicitly delegate `items:edit`; create/import remain
   separate grants and the existing cashier delete ceiling remains. Admin and
   manager editing requires effective permission, not merely a role label.
8. Item editing/configuration can occur while the user operates a register
   elsewhere when the owning domain permits it. Branch-specific stock and
   availability require branch authorization; shared item identity/base price
   remains tenant-wide catalog data. Warn accurately about shared impact and
   do not create branch-specific copies or prices as part of this work.
9. Device proof stays additive under the
   [device contract](POS_DEVICE_LOCATION_ACCESS_CONTRACT.md). Do not bypass it
   on protected POS routes or apply it wholesale to unrelated account/catalog
   routes. Device administration retains its separately privileged recovery.
10. No new offline login, operator acquisition, branch transfer, or automatic
    conflict takeover. Existing permitted offline work retains its own
    reconciliation contract. Reconnect must reject stale authority for new
    protected work without silently discarding queued evidence. Do not claim
    instantaneous revocation on disconnected devices or guaranteed physical
    exclusivity while offline. Any stronger offline guarantee requires its own
    approved design, not an undocumented lease change.

## Acceptance matrix for runtime phases

| Actor / scenario | Required outcome |
| --- | --- |
| Aurora-only cashier, Aurora | Allowed after normal eligibility, terminal, operator and shift checks |
| Same cashier, unassigned branch | Denied even if caller supplies the branch/terminal ID directly |
| Multi-location cashier already operating Aurora | Second terminal acquisition denied; first session preserved |
| Two different eligible cashiers, separate registers | Both allowed; same occupied register still protected |
| Same user, same terminal reload | Resume without duplicate shift, float, or active operator |
| Default cashier, item update API/UI | Denied after Phase 355/356 rollout; currently permitted in baseline |
| Explicitly edit-enabled employee | Edit permitted within domain scope; no automatic create/delete/import grants |
| Manager or owner, configuration while register active | Allowed with effective permission/scope and applicable device checks |
| Ordinary user with switching permission but no destination grant | Denied; separately authorized tenant-wide owner remains supported |
| Revoked grant, deactivated user, stale handoff token | Next online protected mutation denied; financial history preserved |
| Lifecycle on/on, off/off, on/off, off/on | Same exclusivity outcome; do not silently disable the rule via fallback |
| Concurrent starts, takeover vs checkout, retries | One valid authority; losing transition has no partial financial/stock effects |
| Break, relief, counted handoff, branch move | Preserve attendance and drawer semantics; release each required obligation |
| Offline device and reconnect | No new acquisition offline; retain queued evidence and apply existing reconciliation |

## Delivery sequence

### Phase 355 — Backend authorization and permission reconciliation

Dependency: Phase 354. Reuse existing use cases/repositories/constraints. First
write failing behavioral tests for mixed lifecycle settings, active relief
operators vs legacy shift starts, concurrent acquisition, stale permission and
grant changes. Repair only demonstrated gaps. Use consistent transaction locks
and map uniqueness conflicts to domain responses; do not rely only on prechecks.
Inventory checkout, tender, refund/void, drawer, parked-sale, online collection,
and applicable mobile/sync paths; preserve explicit governed admin exceptions.

Remove the forced edit floor and edit defaults from relevant cashier presets,
including auth/current-user payloads. Inventory saved permissions in a read-only
report; preserve proven delegated grants, and require explicit review of
ambiguous inherited grants. No blanket permission rewrite, new table, or
production migration is authorized by Phase 354. Existing role/location update
and permission-cache behavior must be checked for immediate online enforcement.

Gate: direct-API permission tests plus real database concurrency tests proving
one active authority and no partial sales, tenders, stock effects, or handoffs.
Verify existing indexes in test tenants; add a migration only for an evidenced
gap, with a documented non-destructive data plan.

### Phase 356 — POS access and permission UI

Dependency: Phase 355. Coordinate with Phase 351's workforce/admin work and
Phase 348's device UI; reuse existing assignments, terminal picker and recovery.
Show operating branch separately from read-only monitoring. Provide an
actionable conflict with safe terminal/location context, without auto-closing or
taking over the first session. Use effective item permissions instead of cashier
role shortcuts. Refresh permission state and handle server denial without
losing drafts. Explain shared catalog edits' tenant-wide effects.

Gate: independent authenticated browser contexts at two branches; direct-API
denial, default/explicit-editor/admin states, desktop/mobile rendered evidence,
console/network health, relevant tests and affected app builds.

### Phase 357 — Hardening and acceptance

Dependencies: Phases 355-356. Strict physical-device acceptance additionally
requires relevant Phases 347-350; do not duplicate those implementations.
Exercise every matrix row against disposable test data; record persisted counts,
actor attribution, conflict rollback, reconnect outcomes, actual tenant indexes
and feature settings. Run architecture/docs/ADR and scoped compliance checks,
relevant API/UI tests and affected builds. Document grant-reconciliation results,
recovery instructions and unresolved offline limits before a controlled rollout.
Do not label the initiative production-ready from source tests alone.

## Phase 354 completion gate

This phase is complete when the policy, baseline gaps, permission amendment,
matrix, scope exclusions and dependent ledger entries are consistent and docs,
ADR, architecture and changed-file whitespace checks pass. No runtime test is
new-policy acceptance in this phase. Record gate results in the
[phase ledger](IMPLEMENTATION_PHASE_LEDGER.md); next eligible phase for this
initiative is 355, requiring its own implementation approval.
