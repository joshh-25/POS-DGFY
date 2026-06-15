---
status: draft
owner: pos-platform
applies_to: backend_device_bridge
topic: receipt_printing_and_cash_drawer_runtime
---

# Device Bridge

This folder is the dedicated host-side runtime for physical POS devices.

It is intentionally separate from the main backend API process.

## Responsibility Split

- Main backend owns:
  - sales
  - inventory
  - transaction persistence
  - shift and cash-event authorization
- Device bridge owns:
  - printer discovery
  - test printing
  - receipt printing
  - cash drawer pulse/open actions
  - device health checks
- POS clients own:
  - UI
  - checkout flow
  - print/open-drawer requests after authorized backend outcomes

## Planned Structure

- `server.js`
  - host-local HTTP API for device actions
- `auth/`
  - bridge authentication and backend trust validation
- `config/`
  - device and runtime configuration loading
- `drawer/`
  - drawer pulse/open logic
- `jobs/`
  - print job state and idempotency helpers
- `logs/`
  - bridge logging helpers
- `printers/`
  - printer discovery and ESC/POS transport adapters
- `receipts/`
  - receipt payload normalization and ESC/POS formatting

## Runtime Scripts

- `npm run start:device-bridge`
- `npm run dev:device-bridge`
- `npm run device:printers`
- `npm run device:test-print`
- `npm run device:open-drawer`

## Runtime Environment

- `DEVICE_BRIDGE_HOST`
  - default: `127.0.0.1`
- `DEVICE_BRIDGE_PORT`
  - default: `5101`
- `DEVICE_BRIDGE_API_KEY`
  - optional shared key for bridge requests
- `DEVICE_BRIDGE_USB_VENDOR_ID`
  - optional numeric vendor id
- `DEVICE_BRIDGE_USB_PRODUCT_ID`
  - optional numeric product id
- `DEVICE_BRIDGE_USB_SERIAL`
  - optional serial selector, preferred over vendor/product
- `DEVICE_BRIDGE_CASHDRAWER_PIN`
  - `2` or `5`, default `2`
- `DEVICE_BRIDGE_PRINTER_ENCODING`
  - default: `GB18030`
- `DEVICE_BRIDGE_PRINTER_WIDTH`
  - default: `48`

## Phase 1 Steps

1. Lock architecture in ADR `0025-pos-application-shells-and-lan-host-runtime.md`.
2. Add bridge runtime config contract.
3. Build raw printer discovery and test-print route.
4. Prove drawer pulse on approved hardware.
5. Add audited backend orchestration endpoints.
6. Wire POS reprint and drawer actions after backend/device proof.

## Current Endpoints

- `GET /health`
- `GET /device/printers`
- `GET /device/status`
- `POST /device/test-print`
- `POST /device/open-drawer`

## Hardware Proof Scripts

- `npm run device:printers`
  - lists detected USB ESC/POS printers
- `npm run device:test-print -- "Your message here"`
  - sends a direct test receipt from Node, without the POS frontend
- `npm run device:open-drawer -- "proof reason"`
  - sends a direct cash drawer pulse through the mapped printer

## Current Scope

- `@node-escpos/core`
- `@node-escpos/usb-adapter`
- later optional: `@node-escpos/network`

This first runtime only supports USB ESC/POS printers. It does not yet:

- persist print jobs
- audit drawer events
- fetch receipt payloads from the main backend
- enforce terminal-level authorization rules
