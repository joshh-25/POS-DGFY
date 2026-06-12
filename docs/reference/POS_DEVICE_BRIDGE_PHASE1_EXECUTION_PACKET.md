---
status: reference
owner: pos-platform
last_reviewed: 2026-06-03
applies_to: pos_device_bridge_phase1
topic: implementation_packet
---

# POS Device Bridge Phase 1 Execution Packet

## 1) Scope

Problem statement:
- The POS surface has receipt-preview and cash-event flows but no production-safe host runtime for physical receipt printing and cash drawer opening.

In-scope changes:
- host-side device bridge scaffold
- receipt printer and drawer runtime contract
- backend-to-bridge orchestration design
- Windows host deployment expectations
- Windows Electron and Android PWA client integration plan

Out-of-scope changes:
- Play Store distribution
- full kiosk controls
- payment terminal support
- bundling MySQL into clients

## 2) Authoritative Documentation Used

- `docs/START_HERE.md`
- `docs/architecture/ARCHITECTURE_BOUNDARIES.md`
- `docs/architecture/ARCHITECTURE_GOVERNANCE.md`
- `docs/templates/IMPLEMENTATION_PLAN_TEMPLATE.md`

ADR references:
- `docs/architecture/adr/0014-multi-template-modes-pos-offline-sync-and-storefront-cache-contracts.md`
- `docs/architecture/adr/0025-pos-application-shells-and-lan-host-runtime.md`

Domain references:
- `docs/deployment/PWA_SURFACE_CONTRACT.md`
- `docs/features/IMS_POS_SALES_UX_JOURNEY.md`
- `docs/features/SETTINGS_INFORMATION_ARCHITECTURE.md`
- `docs/api/specification.md`

## 3) Architecture Impact

Layers affected:
- `frontend/apps/pos`
- `frontend/src/features/pos`
- `backend/src/modules/pos`
- `backend/device-bridge`
- deployment/setup docs

Boundary risk:
- cross-boundary

ADR needed:
- yes

ADR path:
- `docs/architecture/adr/0025-pos-application-shells-and-lan-host-runtime.md`

## 4) Design

### Proposed changes

1. Introduce a dedicated Windows-host device bridge runtime.
2. Keep backend as the owner of transaction truth and authorization.
3. Route print and drawer actions through audited backend orchestration.
4. Keep Android and Windows clients thin.

### Device bridge folder scaffold

```text
backend/
├── src/
├── device-bridge/
│   ├── server.js
│   ├── auth/
│   ├── config/
│   ├── drawer/
│   ├── jobs/
│   ├── logs/
│   ├── printers/
│   └── receipts/
```

### Initial bridge endpoints

- `GET /device/printers`
- `GET /device/status`
- `POST /device/test-print`
- `POST /device/open-drawer`

### Backend orchestration endpoints

- `POST /device/print-receipt`
- `POST /device/open-drawer`
- `GET /device/status`

### Data model impact

Additive only:
- terminal-to-printer mapping
- printer connection profile
- print job audit history
- drawer action audit history

### API impact

Additive only:
- no breaking changes to existing POS checkout APIs

### Backward compatibility

- browser POS continues to work
- receipt preview remains available even if physical print is unavailable

## 5) Verification

### Unit tests

- receipt payload normalization
- printer profile validation
- drawer action authorization
- bridge auth validation

### Integration tests

- checkout success -> print request
- print failure without duplicate transaction
- authorized drawer open
- reprint historical receipt
- multi-terminal host access

### CI checks

- `npm run check:architecture`
- backend tests for new bridge/backend contracts
- `npm run build:pos`

### Monitoring/telemetry checks

- print job success/failure rate
- drawer open audit events
- bridge device status heartbeat

## 6) Rollout & Rollback

### Release strategy

1. Scaffold ADR and bridge folders
2. Prove USB ESC/POS printer on Windows host
3. Prove drawer pulse on mapped printer
4. Add backend orchestration
5. Wire POS UI actions

### Rollback strategy

1. Disable bridge endpoints
2. Keep browser POS + receipt preview live
3. Continue manual receipt fallback if required

### Operational safeguards

- host-only MySQL
- host firewall and allowlist configuration
- no print on unconfirmed offline transactions
- explicit terminal identity per request

## 7) Exception Tracking

Any temporary allowlist/exception:
- none planned

Removal owner/date:
- n/a

## Build Order

1. Create ADR and scaffold folders
2. Install bridge packages
3. Add raw proof scripts for:
   - print receipt
   - open drawer
4. Implement bridge endpoints
5. Implement backend orchestration
6. Connect POS Setup, Terminal Setup, and Checkout flow
