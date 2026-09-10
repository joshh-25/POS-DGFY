---
status: reference
owner: engineering
last_reviewed: 2026-09-05
declaration_id: 2026-09-05-pos-items-modal-viewport-hardening
classification: major
surfaces: pos,terminal,inventory,payments
reason_codes_impacted: ALLOWED
policy_version: 2026.09.05
verification_evidence: Focused POS Items modal component and contract tests; desktop, mobile, and reduced-height Playwright checks; POS, IMS, and Storefront production builds; Chrome 80 compatibility build guard
rollback_note: Revert the CSS utility and component class changes. No API, database, inventory, fiscal, payment, or persisted record changes require cleanup.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-09-10T09:13:34.309Z
preflight_request_ref: PREFLIGHT-34459098510-2026-09-05-POS-ITEMS-MODAL-VIEWPORT-HARDENING
---

# POS Items modal viewport hardening (#1629, Phase 292)

## Compliance Impact Classification

Major. The floor is set by changes under `packages/web-core/src/features/pos/`,
which the compliance guardrail classifies as POS and terminal surfaces. The user
approved this classification after the guardrail reported the missing declaration.

## Affected Surfaces

Add Item, Edit Item, Create Service, Edit Service, and the product barcode scanner
receive a shared viewport constraint. Chrome 80 retains the first `vh` declaration;
newer browsers progressively use `dvh`. Form/scanner bodies own vertical scrolling,
while applicable headers and action footers remain outside that scrolling region.

## Compliance Preconditions

- Item, service, barcode, image, permission, submission, and persistence behavior
  remain unchanged.
- Existing iMin animation and backdrop performance guards remain unchanged.
- No API, database, fiscal, payment, receipt, inventory ownership, or Android
  bridge behavior changes.
- Phase 293 retains ownership of nested-dialog body-scroll and focus locking.
- Phase 294 retains ownership of SKU/catalog performance work.

## Verification Evidence

Focused Vitest suites cover the viewport contract and existing Add Item, service,
and scanner behavior. Playwright evidence must check page errors, unexpected console
errors, failed requests, HTTP 5xx responses, nonblank modal identity, scrolling to
the final action, and horizontal overflow at desktop, mobile, and reduced-height
viewports. All shared-code consumer builds must pass.

Live compliance preflight has **not been executed** for this develop-bound change.
The front-matter result and timestamp are schema placeholders, not evidence of a
policy-engine decision. The automated compliance sweep must replace the
`NOT-EXECUTED-*` reference with real evidence before ordinary promotion to main.

Physical APK keyboard behavior remains deferred to Phase 295 final closure and is
not claimed by browser emulation.
