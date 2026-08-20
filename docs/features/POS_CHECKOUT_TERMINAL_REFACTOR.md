# POS Checkout Terminal Refactor

Status: completed
Last reviewed: 2026-08-20

## Objective

Decompose the former checkout-terminal monolith into focused modules without
changing the POS public props, rendered behavior, selectors, API payloads,
authorization, shift ownership, idempotency, printer/drawer behavior, or
responsive layout. SKUpervisor was outside the implementation scope.

## Compatibility contract

- `POSCheckoutTerminal.jsx` remains the compatibility shell and public import.
- Existing service and backend API boundaries remain authoritative.
- The original cashier/shift, active terminal/location, offline queue keys,
  checkout idempotency, receipt selectors, and modal actions are preserved.
- Extracted hooks own orchestration; presentation components do not perform
  hidden API, permission, or financial mutations.
- Contract tests compose the shell with the extracted source files instead of
  assuming all behavior remains in one file.

## Refactor sequence

| Slice | Completed responsibility |
| --- | --- |
| R0 | Baseline inventory, behavior freeze, and validation gates. |
| R1 | Pure checkout utilities and modifier helpers. |
| R2 | Catalog loading, search, stock, and pagination workflow. |
| R3 | Current-sale/cart mutation workflow. |
| R4 | Discounts, totals, payment sufficiency, and Employee Credit workflow. |
| R5 | History, search, receipt loading, and accountable void workflow. |
| R6 | Checkout, offline replay, parked sale, and split-payment orchestration. |
| R7 | Receipt, printer, bill request, and cash-drawer workflow. |
| R8 | Presentation view and receipt-dialog extraction; shell reduced to orchestration composition. |
| R9 | Full POS contract, production build, browser, architecture, and compliance hardening. |

## Module ownership

- `POSCheckoutTerminalView.jsx`: presentation and existing DOM/test selectors.
- `POSCheckoutTerminalReceiptDialogs.jsx`: receipt preview and print actions.
- `usePosCatalogWorkflow.js`: catalog state and queries.
- `usePosCartWorkflow.js`: cart and current-sale mutations.
- `usePosFinancialWorkflow.js`: totals, discounts, and payment calculations.
- `usePosEmployeeCreditWorkflow.js`: Employee Credit selection and validation.
- `usePosCheckoutWorkflow.js`: checkout, replay, parked-sale, and split-session orchestration.
- `usePosHistoryVoidWorkflow.js`: history, internal void, and refund follow-up routing.
- `usePosReceiptHardwareWorkflow.js`: receipt, printer, bill, and drawer operations.
- `posCheckoutTerminalUtils.js`, `posCheckoutTerminalModifiers.js`,
  `posCheckoutTerminalQueue.js`, and `posCatalogWorkflow.js`: pure reusable
  policy/format/queue helpers.

## Final evidence

- Full POS/F&B frontend regression: 104 files, 515 tests passed.
- POS production build: 4,072 modules transformed.
- Authenticated state-changing administrator-void/cash-refund E2E: 1 passed.
- Backend refund/void/reporting matrix: 22 suites, 190 tests passed.
- Architecture, compliance, migration, runtime-schema, and tenant-schema gates
  passed on the merged `develop` base.
