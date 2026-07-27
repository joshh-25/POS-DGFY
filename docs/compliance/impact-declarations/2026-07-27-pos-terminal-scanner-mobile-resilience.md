---
status: reference
owner: engineering
last_reviewed: 2026-07-27
related_adr: docs/architecture/adr/0025-pos-application-shells-and-lan-host-runtime.md
declaration_id: 2026-07-27-pos-terminal-scanner-mobile-resilience
classification: regulatory
surfaces: pos,terminal,scanner,compliance
reason_codes_impacted: BARCODE_SCAN_ROUTING,POS_TERMINAL_VIEWPORT_RECOVERY,POS_MOBILE_FOCUS_ZOOM
policy_version: 2026.07.27
verification_evidence: targeted_frontend_tests,frontend_pos_build,npm_run_check_architecture,npm_run_check_compliance,git_diff_check
rollback_note: Revert the terminal viewport and scanner UI changes together; terminal authentication, shifts, payment, stock, and receipt contracts remain unchanged.
preflight_result: no_breach
preflight_reason_code: BARCODE_SCAN_ROUTING_GATED
preflight_run_at: 2026-07-27T00:00:00+08:00
preflight_request_ref: POS-TERMINAL-SCANNER-MOBILE-RESILIENCE-2026-07-27
---

# POS Terminal Scanner And Mobile Resilience Compliance Impact

## Compliance Impact Classification

Regulatory. This declaration covers POS scanner and terminal presentation changes that affect how operators access barcode scanning and recover the mobile terminal viewport. The changes do not alter fiscal calculation, payment authorization, stock mutation, receipt issuance, terminal access policy, or shift authority.

## Affected Surfaces

1. POS barcode scanner availability, QR/GTIN validation, and manual fallback.
2. Mobile terminal layout recovery and input zoom prevention.
3. POS checkout and terminal workspace rendering while the authenticated terminal session is restored.

## Compliance Preconditions

1. A scanned barcode remains an identifier only and must pass the existing server-side item, tenant, location, visibility, and stock validation before use.
2. Camera access is requested only after an operator action and only in a secure browser context.
3. Mobile viewport recovery must not create, alter, replay, or hide transactions.
4. Terminal authentication, shift, payment, void, receipt, and stock controls remain server-authoritative.

## Verification Evidence

Required validation includes targeted scanner and terminal tests, POS build, architecture and compliance checks, and `git diff --check`.

## Change Batches

The barcode registry adapter and the product-import route are delivered before the terminal scanner presentation changes. Both batches retain the same server-side validation and tenant-bound inventory contracts.
