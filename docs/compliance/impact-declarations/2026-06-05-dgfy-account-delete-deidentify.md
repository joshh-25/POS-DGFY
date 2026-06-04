---
status: reference
owner: engineering
last_reviewed: 2026-06-05
related_adr: docs/architecture/adr/0022-global-dgfy-account-business-registration.md
declaration_id: 2026-06-05-dgfy-account-delete-deidentify
classification: regulatory
surfaces: admin,authentication,user_registration,database,settings,compliance
reason_codes_impacted: DGFY_ACCOUNT_DELETE_DEIDENTIFY,DGFY_CREDENTIAL_RELEASE,DGFY_ADMIN_AUDIT_RETENTION
policy_version: 2026.06.05
verification_evidence: npm --prefix backend test -- --runTestsByPath tests/dgfyAdminAccountUseCases.test.js tests/dgfyAdminAccountHandlers.transport.test.js,npm --prefix frontend test -- src/pages/__tests__/DgfyAccountManager.integration.test.jsx --run,npm --prefix frontend run build:skupervisor,npm run lint:docs,npm run check:architecture,npm run check:compliance,git diff --check
rollback_note: Revert the DGFY account delete route/use case/UI and migration together if credential release or evidence retention regresses; keep suspend/reactivate lifecycle available.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-06-05T02:00:00+08:00
preflight_request_ref: DGFY-ACCOUNT-DELETE-DEIDENTIFY-2026-06-05
---

# DGFY Account Delete Deidentify

## Compliance Impact Classification

Regulatory.

This declaration covers platform-admin DGFY account delete/deidentify. The change affects account lifecycle, registration credential reuse, landlord database schema, and the shared admin service surface. It does not change fiscal document classification, tax calculation, receipt numbering, payment settlement, compliance activation decisions, or tenant-local staff deletion.

## Affected Surfaces

- Platform admin can call `DELETE /api/v1/dgfy/admin/accounts/:account_id` with a reason and current-email confirmation.
- The delete action deactivates the DGFY account, sets `deleted_at`, clears verification/login timestamps, and replaces email, phone, username, names, and password hash with non-user placeholders.
- Original email, phone, and username values are released for a new DGFY registration.
- Legal acknowledgements, tenant memberships, customer activity, reviews, loyalty, order/history records, and admin audit rows remain preserved.
- Deleted accounts are excluded from default platform-admin lists and normal credential lookup, with a dedicated deleted filter for redacted support review.

## Compliance Preconditions

1. Delete must not physically remove the landlord DGFY account row or evidence-bearing related rows.
2. Delete must require admin authentication, a reason, and exact current-email confirmation.
3. Delete must write `dgfy_account_admin_audit_logs` with safe before/after snapshots and no secrets.
4. Deleted accounts must not be editable, suspendable, reactivatable, or usable for DGFY login.
5. Credential release must only free email, phone, and username by replacing those account fields with non-user placeholders.

## Verification Evidence

Targeted validation for this declaration:

1. `npm --prefix backend test -- --runTestsByPath tests/dgfyAdminAccountUseCases.test.js tests/dgfyAdminAccountHandlers.transport.test.js`
2. `npm --prefix frontend test -- src/pages/__tests__/DgfyAccountManager.integration.test.jsx --run`
3. `npm --prefix frontend run build:skupervisor`
4. `npm run lint:docs`
5. `npm run check:architecture`
6. `npm run check:compliance`
7. `git diff --check`

## Production Verification

Production verification must include:

1. Running landlord migrations and confirming `dgfy_accounts.deleted_at`, `deleted_by`, and `deletion_reason` exist.
2. Deleting a non-production/test DGFY account through platform admin and confirming the original email/phone can register again.
3. Confirming legal acknowledgement, membership, customer activity, and admin audit evidence remains present for the deleted account ID.
4. Confirming deleted account login fails and the default admin list excludes the deleted row unless the deleted filter is selected.
