---
status: accepted
owner: architecture
last_reviewed: 2026-06-19
applies_to: hardware_pos_android_imin_runtime
topic: standalone_native_hardware_pos_runtime
supersedes_in_part: docs/architecture/adr/0025-pos-application-shells-and-lan-host-runtime.md
---

# ADR 0029: Standalone Native Hardware POS Runtime

## Status

Accepted (2026-06-19)

## Context

`POS-DGFY` currently operates with:

- a browser POS surface
- an Android wrapper that loads the hosted POS
- governed offline replay through browser storage and backend idempotency
- backend/device-bridge printing and drawer orchestration

That shape is adequate for thin clients, but it is not the desired end-state for hardware POS devices. The target hardware experience is now a dedicated iMin/Android cashier application with:

- no WebView-hosted POS UI
- native cashier UI
- offline-first local persistence
- native printer, drawer, and scanner integration
- controlled manual sync behavior

The existing web POS remains an important operator/admin surface and the product UX reference for cashier flow, but it is no longer the implementation runtime for hardware devices.

## Decision

Adopt a `standalone native hardware POS + shared backend authority` topology.

### Store Topology

```text
Backend + MySQL
├── canonical sales, inventory, reporting, compliance
├── mobile bootstrap APIs
└── mobile replay/sync APIs

Hardware POS App (Android / iMin)
├── React Native UI
├── TypeScript cashier workflow
├── SQLite local persistence
├── Kotlin hardware bridge
└── WorkManager sync runner

Web POS
└── remains a separate browser/admin-facing POS surface
```

### Ownership

Backend owns:
- final transaction persistence
- inventory authority
- terminal policy and permissions
- reporting and compliance truth
- replay/idempotency acceptance

Hardware app owns:
- local cashier workflow while offline
- local cart and transaction journal
- local pending history
- local printer, drawer, and scanner integration
- manual sync initiation and local sync-policy enforcement

Web POS owns:
- browser/admin cashier surface
- UX reference contract for the hardware app flow

### Runtime Strategy

Hardware app stack:
- `React Native + TypeScript`
- `Kotlin`
- `SQLite`
- `WorkManager`

Native hardware app flow must mirror the current web POS operator journey, but it must not render the web POS itself.

### Sync Strategy

1. Hardware POS writes local transaction and shift journals first.
2. Hardware POS replays those journals through dedicated `/api/v1/mobile-pos/*` APIs.
3. Backend remains the canonical authority after replay.
4. Sync is manual in Phase 1 and limited to `2` successful full sync runs per device per local business day.
5. Pending local transactions must remain visually distinct from fully synced transactions.

## Consequences

1. Hardware POS becomes a separate app surface, not a browser wrapper.
2. Current web POS remains available and rollback-safe.
3. Mobile/backend contracts must be explicit; browser UI contracts are not sufficient.
4. Sync correctness, checkpointing, and local receipt state become first-class engineering concerns.
5. Android hardware behavior is no longer blocked by browser/WebView limitations.

## Guardrails

1. Existing modular backend boundaries remain intact:
   - `routes -> controllers -> usecases -> repositories -> models`
2. Backend remains canonical for reporting, permissions, inventory, and compliance.
3. Hardware POS must not embed or render the hosted browser POS UI.
4. Hardware POS must preserve the current web POS cashier flow, labels, and operator semantics unless a governed hardware-only divergence is documented.
5. Local print before sync is allowed only when the receipt state clearly remains pending until backend replay completes.
6. Manual sync limit is enforced locally per device and must survive app restart.
7. Browser-only POS remains a rollback-safe fallback during migration.

## Rollback Notes

1. Disable new `/api/v1/mobile-pos/*` clients and fall back to the current web POS/APK shell.
2. Keep backend POS checkout and device-bridge flows unchanged for browser clients.
3. Local hardware app storage can remain on devices without changing backend persistence contracts.

## Phase 1 Execution Scope

1. Add governance docs for hardware POS parity, offline schema, and sync policy.
2. Add dedicated backend mobile POS bootstrap and sync API contracts.
3. Scaffold a standalone hardware app workspace with local schema and sync-policy logic.
4. Reuse the existing web POS flow as the UX parity source of truth.
5. Keep the current Android wrapper as temporary fallback only during migration.
