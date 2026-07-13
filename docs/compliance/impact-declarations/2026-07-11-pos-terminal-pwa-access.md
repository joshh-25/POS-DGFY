---
status: reference
owner: engineering
last_reviewed: 2026-07-13
related_adr: 0031-pos-terminal-pairing-and-shift-safe-navigation.md
declaration_id: 2026-07-11-pos-terminal-pwa-access
classification: major
surfaces: pos,terminal,pwa,offline
reason_codes_impacted: ALLOWED
policy_version: 2026.07.11
verification_evidence: POS build,focused terminal tests,Playwright configuration review,manual iPhone Safari input-size verification,architecture and compliance guardrails
rollback_note: Revert the POS terminal shell, offline navigation, and mobile viewport changes together. No fiscal records, payment records, Storefront contracts, or tenant data require rollback.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-07-11T17:55:00+08:00
preflight_request_ref: POS-TERMINAL-PWA-ACCESS-2026-07-11
---

# POS Terminal PWA Access

## Compliance Impact Classification

Major. This changes the POS terminal interface, mobile access behavior, and manual offline synchronization controls. It does not alter the backend fiscal, payment, tax, or Storefront contracts.

## Affected Surfaces

- POS terminal mobile layout, navigation, and shift-gated operations.
- Offline transaction visibility and manual synchronization controls.
- iPhone Safari viewport and input-size behavior.
- Safari/PWA terminal-unlock rendering: the opaque sticky header and full terminal layout remount after unlock so navigation is repainted without a page refresh.
- POS E2E test configuration and local test artifact handling.

## Compliance Preconditions

- Offline transactions remain locally recorded and are synchronized only by an explicit terminal action.
- Online-only settings and Storefront operations remain unavailable when the terminal is offline.
- POS transaction, payment, void, shift, and receipt APIs remain server-authoritative when connectivity exists.
- Mobile quantity gestures must permit native pointer cancellation and scrolling; they must not capture a pointer beyond the control.
- Mobile presentation changes do not alter receipt payloads, fiscal lifecycle state, tax calculation, or payment authorization.
- Terminal unlock rendering does not change authentication, authorization, shift state, or checkout permissions; it only recreates the client layout after the existing unlock state transition.
- POS terminal source-contract tests scope assertions to their relevant control sections so separate diagnostics do not mask terminal safety regressions.

## Verification Evidence

- POS build and focused terminal contract tests.
- Playwright local configuration review with isolated local credentials.
- iPhone Safari verification that inputs, selects, and textareas compute to at least 16px on the POS mobile viewport.
- `npm --prefix backend run check:architecture-guardrails`
- `npm --prefix backend run check:controller-boundaries`
- `npm run check:compliance`
- `npm run lint:docs`
