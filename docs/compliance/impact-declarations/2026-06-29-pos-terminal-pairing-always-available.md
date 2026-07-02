---
status: reference
owner: pos
last_reviewed: 2026-06-29
declaration_id: 2026-06-29-pos-terminal-pairing-always-available
classification: major
surfaces: pos,terminal,settings,inventory,dgfy
reason_codes_impacted: ALLOWED
policy_version: 2026.06.29
verification_evidence: targeted POS backend/frontend tests,POS and SKUpervisor builds,docs and architecture gates,merge-adoption gate
rollback_note: Revert the three reviewed slices and migration together before staging promotion; do not retain the UI toggles without the backend snapshots and pairing guards.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-06-29T05:00:00+08:00
preflight_request_ref: PR25-POS-SAFE-ADOPTION-2026-06-29
---

# POS Terminal Pairing and Always Available Adoption

## Compliance Impact Classification

Major. This slice adds terminal possession verification, broadens mutation
guards, and introduces an explicit POS stock exemption.

## Affected Surfaces

POS terminal unlock/mutations, Settings terminal registry, POS catalog setup,
checkout transaction-line snapshots, and Inventory stock-effect requests.

## Compliance Preconditions

1. DGFY remains the identity and company-membership authority. PR #25 local
   cashier credentials are explicitly rejected.
2. Terminal passwords are bcrypt-hashed, write-only, redacted from API and
   compliance context, and verified only after user authentication.
3. Pairing uses a dedicated production secret and an HttpOnly cookie. Tenant,
   terminal, location, authorization-profile, membership, and password changes
   invalidate it.
4. Pairing is required for POS mutations but never bypasses permission,
   compliance, location, or open-shift checks.
5. Always Available is independent from visibility. Each exempt sale line
   records its stock-effect decision and generates no Inventory movement.

## Verification Evidence

Seeded human UAT remains required before merge approval for DGFY company
selection, terminal password denial, membership/terminal invalidation, admin
no-shift navigation, cashier restrictions, mixed stock/exempt checkout, and
hardware receipt/drawer behavior.

Automated evidence includes targeted backend/frontend contracts, POS,
SKUpervisor, and Store builds, desktop/tablet/mobile POS smoke, DGFY access
smoke, DB checkout integration, docs/architecture/compliance checks, and merge
adoption validation.
