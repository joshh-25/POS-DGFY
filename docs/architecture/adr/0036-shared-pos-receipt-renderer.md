---
status: accepted
owner: architecture
last_reviewed: 2026-07-23
applies_to: pos_receipt_preview_and_print_contract
topic: shared_pos_receipt_renderer
---

# ADR 0036: Shared POS Receipt Renderer

## Context

The browser POS is the receipt UX reference, while the standalone native POS must present the same receipt before optional physical printing. Maintaining two receipt templates would risk divergent fiscal labels, totals, and paper-width behavior.

## Decision

Use the dependency-free private GitHub Package `@sieitzz/pos-receipt` for the escaped receipt HTML and thermal-text projection. Browser POS renders it directly; native POS renders it inside an Expo DOM component. Native controls remain native and printers remain optional adapters.

The package is published only from `develop`. Each receipt-package change explicitly bumps its semantic version; CI verifies the archive and a render/import smoke check, rejects an already-published version, then publishes that immutable version to GitHub Packages. Consumers use exact versions and update intentionally. Scoped `.npmrc` files select GitHub Packages without containing credentials; CI supplies `NODE_AUTH_TOKEN`, and Docker uses a BuildKit secret only while installing dependencies.

`80mm` is the default paper width and `57mm` is an explicit alternative. The device-print API validates and forwards that width to paired bridges, while local hardware adapters receive the same typed job.

## Guardrails

- The package is frontend/mobile-only; backend containers must not import it.
- Dynamic receipt data is HTML-escaped before DOM rendering.
- A missing adapter or paired printer never blocks receipt preview or transaction completion.
- PDF/system printing is not implied by this contract; POS-printer dispatch is explicit.
- The distribution contract is cross-repository: consumers must not use `file:` paths, submodules, or direct source checkouts for this package.
