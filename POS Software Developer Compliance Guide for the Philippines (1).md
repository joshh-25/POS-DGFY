# POS Software Developer Compliance Guide for the Philippines

Last updated: April 7, 2026
Scope: Software-provider obligations for a dual-mode POS (non-compliant operational mode vs compliant fiscal mode)

## 1) Primary Legal and Regulatory Sources (Use These First)
1. BIR Revenue Regulations No. 6-2022 (electronic invoicing/receipting and reporting context)
   - https://bir-cdn.bir.gov.ph/local/pdf/RR%206-2022_copy.pdf
2. BIR RMO 24-2023 Digest (CRM/POS and accreditation-related compliance flow context)
   - https://bir-cdn.bir.gov.ph/local/pdf/RMO%20No.%2024-2023%20Digest%20FINAL.pdf
3. BIR RMC 72-2025 Digest (enhancement/change handling and current BIR implementation guidance context)
   - https://bir-cdn.bir.gov.ph/BIR/pdf/RMC%20No.%2072-2025%20Digest.pdf
4. NPC Circular 2022-04 (registration and annual updates for PIP/PIC context)
   - https://privacy.gov.ph/wp-content/uploads/2023/05/Circular-2022-04.pdf
5. NPC official registration and FAQ pages
   - https://privacy.gov.ph/pips-and-pics/register/
   - https://privacy.gov.ph/pips-and-pics/faqs/
6. BSP Circular No. 1049 (Operator of Payment System framework)
   - https://www.bsp.gov.ph/Regulations/Issuances/2019/c1049.pdf
7. BSP OPS FAQ and Form 1
   - https://www.bsp.gov.ph/PaymentAndSettlement/FAQ_OPS_Registration.pdf
   - https://www.bsp.gov.ph/PaymentAndSettlement/OPS_Registration_Form_1.pdf

## 2) Regulatory Model for This Product
This product supports two tenant modes:
1. `non_compliant_active`
   - Operational POS allowed.
   - Output must be non-fiscal (`non_fiscal_slip`).
2. `compliant_pending`
   - Upgrade state while compliance checklist is completed.
   - Fiscal output remains blocked until activation.
3. `compliant_active`
   - Fiscal behavior allowed, fail-closed on control failures.

Irreversibility policy:
1. Legacy tenants must choose mode once before POS continues.
2. `non_compliant_active -> compliant_pending -> compliant_active` is allowed.
3. Downgrade from compliant states is blocked at API, repository, and DB trigger layers.

## 3) BIR Control Requirements in Software Terms
For compliant fiscal operation, enforce all of the following in code:
1. Fiscal document contract and mandatory fiscal metadata validation.
2. Deterministic lifecycle gate (pending vs active) before fiscal issuance.
3. Verified-only compliance artifacts/peripherals (no self-attestation trust).
4. Terminal-aware accredited peripheral checks with explicit shared-device fallback.
5. Audit logging for blocked operations, mode transitions, and verification actions.

For non-compliant operation:
1. Strictly non-fiscal output.
2. Explicit non-fiscal labeling in receipt rendering.
3. Fiscal-only settings/flows blocked by policy engine.

## 4) NPC (Data Privacy) Controls in Product Terms
Track and gate compliance profile controls at tenant level:
1. DPO identity/contact fields.
2. Registration/renewal evidence fields.
3. Security incident/breach response control confirmation.
4. Evidence-backed audit trail of compliance state changes.

## 5) BSP OPS Controls in Product Terms
Before enabling payment capability paths, evaluate:
1. Whether OPS registration is required for tenant/business model.
2. OPS registration status validity and expiration controls.
3. Payment control review/attestation fields.
4. Deny payment capability enablement when unmet.

## 6) Engineering Guardrails (Permanent)
1. Runtime policy enforcement: fail-closed for compliant mode.
2. DB guardrails: irreversible mode transitions at trigger level.
3. CI/pre-commit guardrails: compliance impact declaration required for sensitive changes.
4. Request-time preflight: block feature implementation when policy result is `breach` or `review_required`.

## 7) Mandatory Evidence Before Release
1. Architecture checks green: `npm run check:architecture`.
2. Compliance checks green: `npm run check:compliance`.
3. Backend/frontend tests for lifecycle, verification, and output contract behavior.
4. Updated declaration file with surfaces, reason codes, evidence, and rollback note.

## 8) Practical Note
This guide is implementation-oriented and policy-driven. Final legal interpretation always follows the latest official issuances and direct regulator guidance. If issuances change, update policy packs and control mapping first, then code gates.
