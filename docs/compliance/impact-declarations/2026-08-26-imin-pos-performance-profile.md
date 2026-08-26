---
status: reference
owner: engineering
last_reviewed: 2026-08-26
related_adr: 0043-standalone-native-hardware-pos-runtime.md
declaration_id: 2026-08-26-imin-pos-performance-profile
classification: major
surfaces: pos,terminal
reason_codes_impacted: ALLOWED
policy_version: 2026.08.26
verification_evidence: focused iMin performance-profile tests,POS catalog workflow hook test,standalone POS production build,architecture guardrails
rollback_note: Revert the iMin runtime marker, scoped low-effects CSS, and deferred catalog-search query. No API, schema, payment, fiscal calculation, authorization, persistence, or hardware command behavior changes.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-08-26T00:00:00Z
preflight_request_ref: NOT-EXECUTED-1030-IMIN-POS-PERFORMANCE-PROFILE
---

# iMin POS Runtime Performance Profile

## Compliance Impact Classification

Major because the shared POS hook and terminal presentation paths carry the repository's
`pos,terminal` compliance floor. The change is runtime-performance-only: the confirmed iMin
wrapper disables expensive visual compositing effects, and catalog search defers result loading
while preserving the immediate controlled input value.

## Affected Surfaces

- Standalone POS startup installs one iMin-only document marker after the native bridge is
  confirmed and before React mounts.
- Shared POS CSS removes backdrop blur and paint-heavy overlay animation only under that marker.
- POS Catalog keeps typing and deletion urgent while its existing request debounce and result
  rendering follow React's deferred query value.
- Browser POS, IMS, and Storefront keep their existing visual effects and search behavior.

## Compliance Preconditions

- Search text, request parameters, result ordering, availability filtering, page sizing, and
  catalog authorization are unchanged.
- Discount, checkout, parked-sale, payment, receipt, tax, and persistence contracts are unchanged.
- Dark modal overlays, focus management, scroll containment, and dismissal behavior remain.
- No native bridge command is added or invoked during typing, deletion, or modal interaction.

## Verification Evidence

- Focused Vitest coverage passes for the runtime marker, low-effects CSS contract, catalog search
  deferral, shared dialog behavior, checkout dialog behavior, and item customization behavior.
- The standalone POS Vite production build passes with the Chrome 80 compatibility gate enabled.
- Architecture guardrails, controller boundaries, compliance contracts, and `git diff --check`
  pass.

## Preflight Reconciliation

Not executed on this local `develop`-derived implementation branch. The `NOT-EXECUTED-*`
reference is expected until the normal promotion batch performs the live preflight; no live
compliance result is claimed by this declaration.
