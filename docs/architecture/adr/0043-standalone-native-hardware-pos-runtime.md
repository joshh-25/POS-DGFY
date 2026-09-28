---
status: amended
authority_level: authoritative
owner: architecture
date: 2026-06-19
last_reviewed: 2026-09-17
review_by: 2026-12-19
applies_to: hardware_pos_android_imin_runtime
topic: standalone_native_hardware_pos_runtime
supersedes_in_part: docs/architecture/adr/0025-pos-application-shells-and-lan-host-runtime.md
---

# ADR 0043: Standalone Native Hardware POS Runtime

## Status

Accepted (2026-06-19)
Amended (2026-08-04): ADR 0053 introduces a shared client-side hardware
driver contract on the web POS side; this runtime's native printer/drawer/
scanner integration is a candidate to align to the same contract in a later
phase, without changing this ADR's ownership decision. See Amendments.

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
4. Phase 1 begins with manual sync. The completed runtime also supports
   policy-governed reconnect/foreground replay and paid realtime replay; free
   devices remain limited to `2` successful full sync runs per day.
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

## Amendments

### 2026-09-17 — iMin WebView defers optional operations work

- Clause amended: Guardrail 7 / “Browser-only POS remains a rollback-safe
  fallback” (`default`).
- Change: The temporary Android WebView fallback keeps the checkout workspace
  as its idle warm-up path, but no longer downloads the large operations
  workspace during an unlocked iMin session. Operations, Audit, and optional
  settings/import/modal panels load through the existing retryable lazy-loader
  on the selected view or explicit pointer/focus/press intent. Browser
  sessions retain the existing idle operations warm-up behavior.
- Reason: Avoid competing with initial button, modal, and search interaction
  work on the constrained iMin WebView while preserving the same POS view,
  permission, state, and mutation contracts.
- Boundary: This is a source/build optimization for the browser fallback; it
  does not change the native React Native/Kotlin hardware ownership or create
  a new hardware bridge path. Physical iMin frame and bridge validation remain
  governed by the performance baseline phase.
- See: `packages/web-core/src/features/pos/components/TerminalPageLayout.jsx`,
  `packages/web-core/src/features/pos/components/TerminalWorkspaceSidebar.jsx`,
  `packages/web-core/src/features/pos/components/TerminalOperationsWorkspace.jsx`,
  and `docs/features/POS_IMIN_PERFORMANCE_BASELINE_PHASE_352.md`.

### 2026-09-17 — iMin disabled-card filter is paint-safe

- Clause amended: Guardrail 7 / “Browser-only POS remains a rollback-safe
  fallback” (`default`).
- Change: The existing `dgfy-imin-performance` marker now neutralizes the
  legacy POS catalog card's `blur-[0.5px]` filter for disabled/out-of-stock
  states. Browser rendering and the card's disabled/read-only behavior remain
  unchanged.
- Reason: A CSS filter on every disabled catalog card can add avoidable
  compositing work and preserve the reported blurry-card effect on the fixed
  iMin WebView.
- Boundary: This is an iMin-only CSS paint optimization in the browser
  fallback; it changes no catalog data, availability rule, permission, API,
  or native bridge command and does not claim physical device measurements.
- See: `packages/web-core/src/index.css`,
  `packages/web-core/src/features/pos/components/SkupervisorPOSCheckoutTerminal.jsx`,
  and `docs/features/POS_IMIN_PERFORMANCE_BASELINE_PHASE_352.md`.

### 2026-09-17 — Browser and desktop runtime configuration is explicit

- Clause amended: Runtime Strategy and Guardrail 7 (`default`).
- Change: Shared web-core browser-session CSRF/refresh requests and generated
  export downloads resolve through the canonical runtime API resolver. The
  resolver accepts root-relative API paths and absolute HTTP(S) URLs only,
  prefers the desktop preload runtime when present, and rejects unsupported or
  protocol-relative values. The Electron shell reads optional development
  backend, tenant, and terminal values only from local environment settings;
  it supplies no repository defaults. Packaged launch and saved configuration
  require a valid HTTP(S) backend origin and invalid stored configuration
  returns to setup.
- Reason: Prevent a browser or iMin/Electron shell from sending session or
  generated-download requests to a stale build-time origin or silently
  selecting a repository placeholder tenant/terminal.
- See: `packages/web-core/src/utils/runtimeConfig.js`,
  `packages/web-core/src/services/browserSession.js`,
  `packages/web-core/Components/ai/ExportOptionsDialog.jsx`, and
  `apps/dgfy-pos/desktop/pos-electron/main.cjs`.

### 2026-08-29 — One dependency drain is one successful sync round

- Clause amended: Sync Strategy 4 and Guardrail 6 (`default`).
- Change: one leased mobile outbox drain carries a stable
  `client_sync_run_id` across its dependency waves and endpoint calls. The
  backend enforces the free allowance per tenant/device and reuses the first
  successful round slot for that ID during a bounded 15-minute window. Failed
  validation, authorization, and server attempts do not spend a successful
  slot. Immutable mutation IDs remain the exactly-once effect boundary.
- Reason: a single offline work session can contain shift, checkout, void, and
  order-action dependencies; counting each HTTP request as a full sync made the
  advertised two-round device policy impossible to satisfy.
- See: `docs/api/RATE_LIMITING.md` and mobile
  `docs/architecture/SYNC-ARCHITECTURE.md`.

### 2026-08-04 — Web POS iMin path now audits its own hardware actions
- Clause amended: Guardrail 7 / "Browser-only POS remains a rollback-safe
  fallback" (`default`)
- Change: the Android WebView wrapper this ADR calls a temporary fallback
  (`window.iMinBridge`, still in production use) previously printed receipts
  and pulsed the cash drawer without ever reporting the outcome to the
  backend, so those actions were unaudited. Under ADR 0053, the web POS's
  iMin driver now reports its print/drawer outcome to the backend
  (`client_driver_id` + `client_result` on the existing print-receipt/
  open-drawer requests), which records the same audit row a
  backend-dispatched print would. This ADR's own native RN/Kotlin hardware
  ownership (guardrails 1-6) is unchanged; only the temporary WebView
  fallback's audit behavior changed.
- Reason: close an audit gap on the fallback path while the standalone
  native runtime this ADR describes continues to mature.
- See: ADR 0053.
