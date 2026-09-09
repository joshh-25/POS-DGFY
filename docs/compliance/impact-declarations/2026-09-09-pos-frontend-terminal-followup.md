---
status: reference
authority_level: reference
owner: engineering
last_reviewed: 2026-09-09
related_adr: docs/architecture/adr/0007-dual-mode-pos-compliance-program.md,docs/architecture/adr/0014-multi-template-modes-pos-offline-sync-and-storefront-cache-contracts.md
declaration_id: 2026-09-09-pos-frontend-terminal-followup
classification: major
surfaces: pos,terminal
reason_codes_impacted: ALLOWED,VALIDATION_FAILED,CONFLICT
policy_version: 2026.09.09
verification_evidence: npx vitest run --maxWorkers=1 ../../packages/web-core/src/features/pos,npm --prefix apps/dgfy-pos run lint,npm --prefix apps/dgfy-pos run build,npm --prefix apps/dgfy-ims run build,npm run lint:docs,npm run check:architecture
rollback_note: Revert the POS-only frontend commits and this declaration together if terminal catalog presentation, checkout payment workflows, operational workspaces, or POS responsive behavior regresses. No backend migration or API rollback is required because this slice does not change backend contracts, fiscal calculations, schemas, or payment settlement logic.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-09-09T23:00:00+08:00
preflight_request_ref: POS-FRONTEND-FOLLOWUP-2026-09-09
---

# POS Frontend Terminal Follow-up

## Compliance Impact Classification

Major.

This update changes the shared POS frontend surface used by the POS terminal and IMS-hosted POS
workspace. The changes refine catalog presentation and responsive image behavior, harden checkout
payment workflow presentation, normalize operational workspace presentation, and restore the POS
elevation/focus token contract. POS and terminal frontend files are compliance-sensitive because
they present and guard fiscal checkout operations, operator controls, payment workflows, and
transaction evidence surfaces.

The update is frontend-only. It does not change backend routes, payment settlement behavior, fiscal
calculation rules, receipt persistence, tenant schemas, authentication, permissions, or migration
logic. The POS frontend continues to call the existing backend contracts and preserves the current
terminal, shift, receipt, and offline-operation boundaries.

## Affected Surfaces

1. POS catalog card presentation, responsive loading behavior, and shared catalog image rendering.
2. POS checkout terminal responsive layout and checkout confirmation interaction surfaces.
3. POS discount and statutory-beneficiary presentation surfaces.
4. POS operational workspace panels, responsive scroll behavior, and focus/elevation styling.
5. POS receipt and hardware-contract frontend tests aligned with the current shared POS surface.
6. POS frontend functional and technical documentation.

## Compliance Preconditions

1. Existing POS terminal identity, shift, cashier, and operating-location controls remain unchanged.
2. Existing payment method validation and checkout submission guards remain authoritative; this slice
   does not bypass or weaken them.
3. Existing fiscal totals, statutory discount calculations, receipt fields, and backend settlement
   contracts remain unchanged.
4. POS catalog image fallbacks must not replace a configured POS image override or leak an unrelated
   storefront gallery image into the terminal catalog.
5. Responsive behavior must preserve usable checkout controls and readable operator actions on
   desktop, tablet, and mobile terminal widths.
6. No customer, payment, or fiscal data is added to browser storage by this frontend-only slice.
7. The POS test suite, POS lint, consuming frontend builds, documentation lint, and architecture
   guardrails must pass before the branch is pushed.

## Verification Evidence

1. `npx vitest run --maxWorkers=1 ../../packages/web-core/src/features/pos` passed: 199 test files
   and 1,264 tests passed.
2. `npm run lint` passed in `apps/dgfy-pos`.
3. `npm run build` passed in `apps/dgfy-pos`.
4. `npm run build` passed in `apps/dgfy-ims`, confirming the shared POS trunk remains consumable by
   the IMS frontend.
5. `npm run lint:docs` passed: 30 governed docs and 89 ADRs validated.
6. `npm run check:architecture` passed: architecture guardrails and controller boundaries passed.
7. `npm run check:compliance` is required as the final declaration-aware gate after this file is
   included.
8. The branch scope audit must show POS shared-trunk files and POS documentation only; no Services
   Storefront files, service-flow code, backend files, migrations, or unrelated frontend surfaces
   are included.
