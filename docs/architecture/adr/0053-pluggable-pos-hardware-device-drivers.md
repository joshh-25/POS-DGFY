---
status: amended
authority_level: authoritative
owner: architecture
date: 2026-08-04
last_reviewed: 2026-08-11
review_by: 2027-02-04
applies_to: pos_hardware_device_integration
topic: pluggable_pos_hardware_device_drivers
supersedes_in_part: docs/architecture/adr/0025-pos-application-shells-and-lan-host-runtime.md
---

# ADR 0053: Pluggable POS Hardware Device Drivers

## Status

Amended (2026-08-11)

## Context

ADR 0025 modeled POS hardware as `POS Client -> Backend -> Device Bridge ->
Printer -> Drawer`: the backend is the transport to a LAN device-bridge
(`backend/device-bridge`, default `http://127.0.0.1:5101`) that talks to an
ESC/POS USB printer. That topology only works when the backend and the
printer share a LAN host, per ADR 0025's own "Windows Host" diagram. It does
not hold for `pos.dev.dgfy.ph` or any other backend that is not co-located
with the cashier's hardware: `127.0.0.1:5101` is loopback on the API server,
never on the browser tab. In that shape, every terminal without a co-located
bridge produced a `503 SERVICE_UNAVAILABLE` on every `GET
/pos/device/status` call, because absence of a bridge was modeled as a
service failure rather than a normal, supported state.

Separately, three hardware transports already existed with no shared
contract: the HTTP device-bridge above, an iMin/Android WebView bridge
(`window.iMinBridge`, ADR 0043), and a React Native native module
(`mobile/hardware-pos`). Each terminal component picked between them with a
hand-rolled `if (handled) return` cascade, and only the HTTP path produced a
backend audit row — printing or opening the drawer through the iMin bridge
was never recorded, undermining ADR 0025 Guardrail 3 ("cash drawer open
actions must be authorized and auditable") for that path.

This is a cross-boundary change under `docs/architecture/ARCHITECTURE_BOUNDARIES.md`
and follows `docs/START_HERE.md` and `docs/architecture/ARCHITECTURE_GOVERNANCE.md`.
It amends ADR 0025's Hardware Strategy and touches ADR 0043's client-side
hardware ownership.

## Decision

1. POS checkout, shift management, and transaction persistence never depend
   on hardware being present or reachable. Absence of hardware is a normal,
   fully supported terminal state, not a degraded one. `[binding]`
2. Every hardware action that produces a receipt print or a cash drawer
   pulse creates a backend audit record, regardless of which driver executed
   it physically — client-side or server-side. `[binding]`
3. Printing always uses the canonical, server-built transaction/receipt
   payload (`buildReceiptPayload` in `posDeviceUseCases.js` /
   `packages/pos-receipt`), never scraped browser HTML. This carries forward
   ADR 0025 Guardrail 2 unchanged. `[binding]`
4. `GET /pos/device/status` returns `200` with `driver: { id, available }`
   whenever the resolved driver has no physical hardware to report
   (`client_managed` or `none`). It returns `503` only when a driver **is**
   configured (`lan_escpos_bridge`) and genuinely unreachable — a real
   fault, not absence. `[binding]`
5. The backend resolves one server-dispatched device driver per deployment
   from `POS_DEVICE_DRIVER` (`auto` | `none` | `client_managed` |
   `lan_escpos_bridge`) and `DEVICE_BRIDGE_ENABLED`, behind a
   `posDeviceDriver` contract (`getStatus`/`printReceipt`/`openDrawer`,
   `backend/src/modules/pos/contracts/posDeviceDriver.contract.js`).
   `auto` resolves to `lan_escpos_bridge` only when the LAN bridge is
   explicitly enabled, otherwise `client_managed`. This mirrors the
   adapter-factory-plus-registry pattern already used for the external
   product registry (ADR 0038): a `name`/`id`-bearing adapter, injected at
   the module composition root, with a nullable/no-op path built in rather
   than special-cased by callers. `[default]`
6. The frontend resolves one client-side hardware driver per browser tab
   through an ordered registry (`frontend/src/features/pos/hardware/`):
   client-probed drivers first (iMin native — a synchronous, local
   `window.iMinBridge` check, no network call), then the backend-reported
   server driver (fetched once via `/pos/device/status` and memoized, not
   polled), then a `noop` driver that always resolves and never throws.
   Terminal components depend only on `usePosHardware()` and a
   `HardwareCommandResult` — never on a specific driver id. `[default]`
7. A client-side driver that already executed a print/drawer action reports
   its outcome back to the backend via `client_driver_id` +
   `client_result` on the existing `POST /pos/device/print-receipt` and
   `POST /pos/device/open-drawer` requests. The backend skips physical
   dispatch in that case but still runs the shift/idempotency checks and
   writes the audit row — this is what makes clause 2 hold for the iMin
   path, which previously bypassed backend audit entirely. `[default]`
8. New driver failures reuse `DomainErrorCode.SERVICE_UNAVAILABLE` with a
   `details.reason_code` (e.g. `NO_PRINTER_CONFIGURED`,
   `POS_HARDWARE_DISABLED`) rather than adding new `DomainErrorCode` members
   for every hardware condition, following the existing convention in
   `lookupExternalProductUseCase.js`. `[default]`
9. `pos_hardware_profile` is a per-tenant/per-terminal **client-side**
   preference (`driver_preference`, `paper_width`, `auto_open_drawer`),
   validated in `settingsValidator.js` and surfaced through
   `/mobile-pos/bootstrap/settings`. It never overrides which
   server-dispatched driver the backend itself uses — that stays a
   deployment-level setting (`POS_DEVICE_DRIVER`), because one
   backend/device-bridge host still serves one store's LAN, per ADR 0025.
   `[default]`
10. Browser-only POS with no hardware at all remains fully functional: the
    on-screen receipt preview is the deliverable, and print/drawer controls
    stay enabled but report an honest "no printer configured" outcome
    instead of failing as if broken. This is ADR 0025 Rollback Note 3 made
    the default experience rather than a fallback. `[default]`

## New hardware onboarding path

Adding support for a concrete printer or terminal (wired, network, or
Bluetooth) means adding one driver behind the existing contract — it does
not require touching checkout, the use cases, or terminal components:

- A **client-executed** driver (e.g. a future Web Bluetooth ESC/POS printer)
  implements `getStatus`/`printReceipt`/`openDrawer`/`printOrderTicket` in
  `frontend/src/features/pos/hardware/drivers/`, is added to the registry's
  detection chain, and reports outcomes back via `client_driver_id` per
  clause 7.
- A **server-dispatched** driver (e.g. a network/IP ESC/POS printer)
  implements the `posDeviceDriver` contract in
  `backend/src/modules/pos/integrations/` and is added to
  `resolvePosDeviceDriver.js`'s driver map.

## Consequences

- `pos.dev.dgfy.ph` and any cloud-hosted backend can run POS checkout with
  zero physical hardware, with no error-state noise from
  `/pos/device/status`.
- iMin-printed receipts and drawer opens are now audited, closing a real
  compliance gap under ADR 0025 Guardrail 3.
- The LAN device-bridge (`backend/device-bridge`) is unchanged in behavior
  and remains the correct choice for the single-host-per-store topology ADR
  0025 describes; it is now one driver among several rather than the only
  path.
- Bluetooth and other genuinely client-local transports become possible for
  the first time, because the backend is no longer assumed to be
  network-adjacent to the printer.
- `backend/src/services/posDeviceBridgeService.js` becomes an implementation
  detail behind `escposBridgeDeviceDriver.js`; nothing outside the pos
  module composition root references it directly.

## Rollout

1. Backend driver resolution defaults to `client_managed` unless
   `DEVICE_BRIDGE_ENABLED=true` is set — existing LAN-bridge deployments opt
   in explicitly, or set `POS_DEVICE_DRIVER=lan_escpos_bridge` directly.
2. No schema migration. `pos_hardware_profile` is a new, optional settings
   key with safe defaults (`driver_preference: 'auto'`).
3. Frontend driver resolution is additive; the iMin and LAN-bridge code
   paths behave identically to before, now routed through the shared
   contract.

## Rollback

Set `POS_DEVICE_DRIVER=lan_escpos_bridge` and `DEVICE_BRIDGE_ENABLED=true`
to force the pre-ADR-0053 backend-mediated path unconditionally. The
frontend registry still resolves the same way; no client rollback is
required since behavior for existing hardware is unchanged.

## Amendments

### 2026-08-11: Awaited Client-Driver Audit Confirmation

- Clause amended: Decision clause 7 (`default`).
- A client driver that physically executes a receipt print, report print, or drawer pulse must await the backend audit response before returning its final command result. Transient network/server failures may retry the audit request with the same idempotency key; they must never repeat the physical action.
- Physical success and audit confirmation are separate result dimensions. If hardware succeeds but audit confirmation is exhausted, the result keeps `success: true`, sets `auditConfirmed: false`, and shows an actionable warning so the operator retains the physical evidence and reconnects instead of printing again.
- A drawer pulse requires an active shift identifier before the hardware call. Receipt printing may proceed without a drawer pulse, but a requested drawer action with no auditable shift context must fail closed before physical execution.
- A receipt that also opens the drawer produces distinct receipt-print and drawer-open audit records because the two physical actions have separate accountability semantics.
