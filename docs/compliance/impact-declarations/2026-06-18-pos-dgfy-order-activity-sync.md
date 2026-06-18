---
status: reference
owner: engineering
last_reviewed: 2026-06-18
related_adr: docs/architecture/adr/0023-front-facing-dgfy-customer-account.md,docs/architecture/adr/0026-browser-session-cookie-authority.md
declaration_id: 2026-06-18-pos-dgfy-order-activity-sync
classification: regulatory
surfaces: pos,terminal,storefront,compliance
reason_codes_impacted: ALLOWED,POS_SHIFT_REQUIRED
policy_version: 2026.06.18
verification_evidence: git diff --check,npm run check:architecture,npm run lint:docs,npm --prefix frontend test -- --run apps/store/src/__tests__/discoveryHeaderAccount.integration.test.jsx apps/store/src/__tests__/profileLauncher.integration.test.jsx apps/store/src/__tests__/DgfyCustomerAccountPage.dashboard.test.jsx apps/store/src/__tests__/StorefrontHeaderNav.test.jsx,npm --prefix backend test -- --runTestsByPath tests/posUsecases.applicationResult.test.js tests/customerActivityRecorder.test.js tests/dgfyAuthUseCases.test.js,npm --prefix frontend run build:store,npm run build:skupervisor
rollback_note: Revert the Storefront DGFY handoff/polling changes and POS DGFY activity sync together if account tracking or POS order status visibility regresses.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-06-18T19:38:00+08:00
preflight_request_ref: POS-DGFY-ORDER-ACTIVITY-SYNC-2026-06-18
---

# POS DGFY Order Activity Sync

## Compliance Impact Classification

Regulatory.

This declaration covers POS and Storefront customer-flow hardening that keeps DGFY customer order activity aligned after an already-authorized online POS order status update. The change is compliance-sensitive because it touches POS lifecycle use-case and repository code, but it does not change fiscal receipt content, tax calculation, payment acceptance, stock movement rules, terminal authorization, shift requirements, or compliance-mode enforcement.

## Affected Surfaces

1. POS online order status updates now upsert the linked DGFY customer activity after the tenant POS transaction status changes.
2. POS lifecycle reads include `store_customers.dgfy_account_id` so DGFY activity sync preserves explicit account ownership and does not infer ownership from guest email or phone.
3. Storefront DGFY customer returns consume one-time handoff tokens, clear stale browser-readable DGFY token keys, and validate the HttpOnly cookie session before showing signed-in account state.
4. Storefront account and tracking surfaces short-poll DGFY dashboard/activity endpoints while visible so active orders and history follow POS status changes without a full page reload.

## Compliance Preconditions

1. POS status mutations remain protected by existing terminal, cashier, open-shift, tenant, and transition validation before any DGFY activity sync runs.
2. DGFY customer activity sync is post-status-update visibility work only; it must not approve payment, change stock movement generation, or mutate receipt/fiscal evidence.
3. Signed-in customer activity remains account-owned through explicit `dgfy_account_id`; guest orders must not be adopted into a DGFY account by matching email or phone.
4. Storefront DGFY auth remains cookie-authoritative under ADR 0026, and stale browser-readable token cleanup must not create new persistent token storage.
5. Rollback must include frontend, backend, test, docs, and this declaration together because Storefront polling depends on backend activity freshness.

## Verification Evidence

Validation performed for this declaration:

1. `git diff --check`
   - Result: PASS.
2. `npm run check:architecture`
   - Result: PASS.
3. `npm run lint:docs`
   - Result: PASS.
4. `npm --prefix frontend test -- --run apps/store/src/__tests__/discoveryHeaderAccount.integration.test.jsx apps/store/src/__tests__/profileLauncher.integration.test.jsx apps/store/src/__tests__/DgfyCustomerAccountPage.dashboard.test.jsx apps/store/src/__tests__/StorefrontHeaderNav.test.jsx`
   - Result: PASS, 4 files and 18 tests passed.
5. `npm --prefix backend test -- --runTestsByPath tests/posUsecases.applicationResult.test.js tests/customerActivityRecorder.test.js tests/dgfyAuthUseCases.test.js`
   - Result: PASS, 3 suites and 63 tests passed.
6. `npm --prefix frontend run build:store`
   - Result: PASS.
7. `npm run build:skupervisor`
   - Result: PASS.
