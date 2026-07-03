---
status: reference
authority_level: reference
owner: compliance
last_reviewed: 2026-07-03
applies_to: dgfy_company_access, invitation_acceptance, company_switching
topic: compliance_impact_declaration
---

# DGFY Business Step-Up Removal Hotfix Compliance Impact

This hotfix removes the extra `dgfy_business_step_up` email-code requirement from routine DGFY company invitation acceptance/rejection and company switch/open-inventory actions.

The change does not weaken the core tenant-access boundary: invitation acceptance still requires an authenticated DGFY account matching the pending explicit `DgfyAccountTenantMembership`, rejection still requires that same pending membership, and switching still requires an accepted active membership. Email or phone matching alone remains insufficient for company access.

Ownership transfer remains protected by business step-up. DGFY account registration, password reset, and legacy-link OTP flows are unchanged.

No payment, checkout, fiscal, or regulated transaction flow is changed.
