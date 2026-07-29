---
status: accepted
authority_level: authoritative
owner: architecture
date: 2026-06-03
last_reviewed: 2026-06-03
review_by: 2026-12-03
applies_to: pos_windows_android_clients_and_lan_store_runtime
topic: pos_application_shells_and_lan_host_runtime
---

# ADR 0025: POS Application Shells And LAN Host Runtime

## Status

Accepted (2026-06-03)

## Context

`POS-DGFY` currently ships as a web-based POS surface with governed offline replay, terminal identity, and receipt-preview behavior. The product now needs an application-style runtime for:

- Windows cashier terminals
- Android POS terminals
- multi-terminal LAN operation inside a store
- host-managed physical receipt printer and cash drawer support

The existing backend and MySQL runtime remain the source of truth for sales, inventory, terminal shifts, and transaction history. Device access is not yet isolated into a dedicated runtime.

## Decision

Adopt a `central Windows host + thin POS clients` topology.

### Store Topology

```text
Windows Host
├── Backend
├── MySQL
├── Device Bridge
├── Receipt Printer
└── Cash Drawer

POS Clients
├── Windows Electron
└── Android PWA
```

### Ownership

Backend owns:
- sales
- inventory
- transactions

Device bridge owns:
- receipt printing
- cash drawer opening

Clients own:
- UI
- checkout workflow

### Hardware Strategy

Printer:
- ESC/POS USB printer for Phase 1

Drawer:
- RJ11/RJ12 drawer connected to the printer

Communication:

```text
POS Client -> Backend -> Device Bridge -> Printer -> Drawer
```

## Consequences

1. Backend remains the authoritative store system and does not move into client runtimes.
2. Windows POS can be packaged as an Electron shell without changing backend ownership.
3. Android POS can ship first as a PWA while still using the same LAN host.
4. Device failure or USB-driver issues are isolated to the bridge process instead of the core backend API.
5. Receipt printing and drawer opening become auditable operational actions instead of client-side best-effort UI behavior.

## Guardrails

1. MySQL is installed and managed on the Windows host only; it is not bundled into client apps.
2. Printing must use canonical stored transaction payloads, not scraped browser HTML.
3. Cash drawer open actions must be authorized and auditable.
4. POS offline queue replay must not print until the transaction is confirmed server-side.
5. Existing modular backend boundaries remain intact:
   - `routes -> controllers -> usecases -> repositories -> models`
6. Browser-only POS remains a rollback-safe fallback while app shells mature.

## Rollback Notes

1. Windows and Android clients can fall back to browser POS while keeping the same backend.
2. Device bridge can be disabled without changing sales/inventory persistence contracts.
3. Receipt preview remains available even if physical print paths are temporarily unavailable.

## Phase 1 Execution Scope

1. Add a dedicated `backend/device-bridge/` scaffold and runtime contract.
2. Build printer discovery and test-print support on the Windows host.
3. Prove cash drawer pulse through the mapped printer.
4. Add audited backend orchestration endpoints for print and drawer actions.
5. Wire standalone POS clients after host/device proof is complete.

