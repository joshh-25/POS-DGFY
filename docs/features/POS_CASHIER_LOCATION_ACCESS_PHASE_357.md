---
status: reference
authority_level: reference
owner: engineering
last_reviewed: 2026-09-15
applies_to: pos_cashier_location_access
topic: pos_cashier_location_access_phase_357
---

# Phase 357 — Cashier location hardening and acceptance

## Boundary

Phase 357 hardens and accepts the runtime delivered by Phases 355-356. It does
not add a new authority model, rewrite stored grants, create a production
tenant, or claim that a disconnected browser can enforce physical exclusivity.
The phase is local acceptance-complete for the executable repository contract;
deployed, physical iMin and independent two-cashier browser gates remain open
until their owning phases and environments are available.

The governing behavior is the [Phase 354 contract](POS_CASHIER_LOCATION_ACCESS_PHASE_354.md),
with [ADR 0020](../architecture/adr/0020-mode-aware-rbac-and-role-presets.md),
[ADR 0031](../architecture/adr/0031-pos-terminal-pairing-and-shift-safe-navigation.md),
[ADR 0029](../architecture/adr/0029-catalog-inventory-pos-storefront-ownership-boundaries.md)
and [ADR 0073](../architecture/adr/0073-pos-cashier-attendance-breaks-and-register-operator-sessions.md).
No policy amendment is introduced by this phase.

## Executable acceptance

The disposable database harness creates a uniquely named local MySQL database,
runs the migration runner, exercises tenant models and the production scope /
lifecycle use cases, then closes and drops the database in `afterAll`. It does
not connect to or modify a configured tenant database.

| Acceptance area | Executable evidence |
| --- | --- |
| Exact location grant and feature flag | `apps/dgfy-api/tests/posCashierLocationAccess.phase357.db.integration.test.js` — Aurora is enabled only when listed in the persisted feature setting; direct access to an unassigned East location returns `403 POS_OPERATOR_LOCATION_GRANT_REQUIRED`. |
| One cashier, one active operating scope | The same suite proves same-terminal repeat/open resumes the existing authority; a second terminal returns `409 POS_OPERATOR_ACTIVE_ELSEWHERE` and preserves the first shift, operator and attendance rows. |
| Independent eligible cashiers | The same suite opens separate enabled locations for two eligible users and verifies both persisted authorities are independent. |
| Disabled lifecycle compatibility | The same suite persists a disabled feature setting and verifies legacy shift opening creates no attendance or operator-session row and no authority token. |
| Revocation and fail-closed recovery | The same suite removes a location grant and deactivates the user; each subsequent protected scope check is denied while the original shift/operator history remains unchanged. |
| Concurrent acquisition | The same suite runs two real MySQL transactions against two granted locations for one user; exactly one acquires the open shift, the other receives a conflict, and no extra financial, attendance, operator or handoff row is created. |
| Persisted actor attribution | The same suite verifies shift cashier, operator user, location, terminal and attendance links plus lifecycle audit actor IDs. |
| Schema/index proof | The same suite checks generated active-state columns and all four required unique operating indexes with `showIndex` and `information_schema`. |
| Offline/reconnect retention | `packages/web-core/src/features/pos/__tests__/phase357OfflineReconnect.contract.test.js` proves a reconnect-time `403` moves a queued cash event to manual resolution without deletion, and that a queued shift open is never acquired offline and remains visible for resolution. Existing `offlinePosPersistence.test.js` continues to prove complete tenant/terminal/location/user isolation and pending-record retention. |
| Direct permission/API boundary | Existing `apps/dgfy-api/tests/cashierLocationPermissions.api.test.js` covers default cashier denial, explicit `items:edit` delegation and manager/admin effective-permission outcomes at the Express boundary. |
| Break, relief, counted custody and branch movement | Existing `apps/dgfy-api/tests/posOperatorAuthority.usecases.test.js` and `apps/dgfy-api/tests/posCashierLifecycle.usecases.test.js` remain the owning regression suites; Phase 357 does not duplicate their use cases. |

## Grant reconciliation and read-only tenant audit

Run the following from the repository root when local tenant evidence is
needed:

```text
npm run audit:pos-cashier-location-access
```

The command is loopback-only and scans active, non-test tenant databases. It
performs `SELECT`/metadata reads only and emits JSON containing, per tenant:

- feature-setting presence, enabled state, configured-location count and
  invalid/duplicate location-entry counts;
- open-shift, active-operator, open-attendance and lifecycle-audit counts;
- orphaned actor counts for each persisted operating/audit surface;
- cashier count, active cashier count and ambiguous saved `items:edit` count;
- the exact required index names/columns and any missing index; and
- `automatic_rewrite: false` and `read_only: true` markers.

Stored permission arrays cannot prove whether `items:edit` was inherited or
explicitly delegated. The audit therefore reports those rows for administrator
review and never rewrites or revokes them automatically. Invalid/test database
names are skipped and are not queried.

## Recovery contract

When a conflict or stale authority is found:

1. Preserve the first register, shift, drawer history and queued evidence.
2. Reconnect and refresh the authoritative user, grant, feature and operating
   state.
3. Resolve pending payment/parked-sale work and formally release the active
   operator when the existing workflow permits it.
4. Close the owned shift/attendance through the governed flow if the register
   is finished, then retry only at an assigned destination.

No recovery path auto-closes another shift, transfers drawer custody without
the existing acknowledgement/count flow, or silently discards an offline
queue.

## Validation limits and rollout blockers

The local gates prove source, migrated-schema, transaction and browser-storage
contracts. They do not prove deployed tenant parity, live login/API behavior,
two independently authenticated production-like browsers, or physical iMin
device exclusivity. Those remain explicit rollout gates owned by Phase 356's
browser acceptance and Phases 347-350's device/bridge work. Do not label the
cashier-location initiative production-ready until those gates have terminal
evidence and the request-time compliance preflight has run.

The authoritative status and evidence record is the
[implementation phase ledger](IMPLEMENTATION_PHASE_LEDGER.md).
