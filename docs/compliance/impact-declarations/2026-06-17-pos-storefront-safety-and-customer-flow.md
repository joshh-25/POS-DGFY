---
status: reference
owner: engineering
last_reviewed: 2026-06-17
related_adr: docs/architecture/adr/0023-front-facing-dgfy-customer-account.md
declaration_id: 2026-06-17-pos-storefront-safety-and-customer-flow
classification: regulatory
surfaces: pos,terminal,settings,storefront,compliance
reason_codes_impacted: ALLOWED,VALIDATION_FAILED,CUSTOMER_ACCESS_MODE_BLOCKED,POS_SHIFT_REQUIRED,POS_PAYMENT_REQUIRED
policy_version: 2026.06.17
verification_evidence: git diff --check,git diff --cached --check,npm run check:architecture,npm run check:compliance
rollback_note: Revert the POS safety, checkout validation, DGFY customer storefront flow, and tenant provisioning updates together to restore the previous POS/storefront behavior.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-06-17T17:45:00+08:00
preflight_request_ref: POS-STOREFRONT-SAFETY-CUSTOMER-FLOW-2026-06-17
---

# POS Storefront Safety and Customer Flow

## Compliance Impact Classification

Regulatory.

This declaration covers the combined POS safety and DGFY storefront customer-flow update. The change is compliance-sensitive because it touches POS sale handling, terminal behavior, settings, customer account routing, storefront checkout/inquiry presentation, and customer-facing DGFY account flows.

## Affected Surfaces

1. POS checkout and terminal components update shift/payment/receipt behavior, manual discount validation, hardware warning presentation, and terminal layout handling.
2. POS backend use cases, repositories, and validators update sale and discount contracts that affect transaction acceptance.
3. Storefront customer pages, checkout components, account routes, tracking drawer, and customer access helpers update customer-facing inquiry/order flow behavior.
4. DGFY authentication and account services update customer session, registration, and company-switching handoff behavior.
5. Tenant provisioning now exposes the DGFY business audit log model as a landlord model so local business account creation can complete without tenant-model lookup failure.
6. Documentation records the current DGFY brand, POS/storefront change summary, and storefront handoff context.

## Compliance Preconditions

1. POS sale acceptance must still require the backend validation path for tenant, branch, shift, payment, stock, and discount rules.
2. Customer-facing storefront checkout must still follow the effective customer access mode returned by backend policy.
3. DGFY customer account routing must not bypass tenant authorization, session issuance, or registration-readiness limits.
4. Storefront inquiry/contact actions must require configured public contact destinations such as phone, email, or Messenger URL.
5. Business account provisioning must keep landlord audit-log models outside tenant model resolution.
6. Rollback must include frontend, backend, test, and documentation changes together because POS and storefront behavior are coupled in this update.

## Verification Evidence

Validation performed for this declaration:

1. `git diff --check`
   - Result: PASS, with line-ending normalization warnings only.
2. `git diff --cached --check`
   - Result: PASS.
3. `npm run check:architecture`
   - Result: PASS during pre-commit guardrails.
4. `npm run check:compliance`
   - Result: PASS.
