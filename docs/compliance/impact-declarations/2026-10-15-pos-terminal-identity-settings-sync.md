---
status: draft_pr
owner: DGFY POS
last_reviewed: 2026-10-15
declaration_id: 2026-10-15-pos-terminal-identity-settings-sync
classification: major
surfaces: pos,terminal,settings,payments
reason_codes_impacted: ALLOWED
policy_version: 2026.10.07
verification_evidence: POS terminal contract suite (137 tests), POS profile settings behavior test (5 tests), POS API identity synchronization tests (15 tests), POS production build, architecture checks, changed API source lint, git diff --check, repository compliance gate
rollback_note: Revert the POS terminal identity selection, profile email and password synchronization, terminal lock/unlock diagnostics, the focused tests, the lint cleanup, and this declaration together; no database schema or migration is introduced, and existing tenant authorization, payment, fiscal, shift, and transaction boundaries remain authoritative.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-10-15T06:30:21.682Z
preflight_request_ref: PREFLIGHT-38692238771-2026-10-15-POS-TERMINAL-IDENTITY-SETTINGS-SYNC
---

# POS terminal identity and settings synchronization

## Compliance Impact Classification

Major because the changed shared POS terminal and settings paths are classified at the major
floor for the `pos`, `terminal`, and `settings` surfaces. The API changes synchronize an
authenticated tenant user's verified profile identity and password with an accepted DGFY account
membership, while the POS changes improve terminal unlock, company selection, profile verification,
password management, and diagnostics. The change does not introduce a payment, fiscal, inventory,
shift, or transaction-authority path.

## Affected Surfaces

- `pos` — terminal login/company selection, profile email verification, password management, and
  user-facing POS settings.
- `terminal` — terminal lock/unlock lifecycle, selected terminal validation, and unlock diagnostics.
- `settings` — authenticated profile updates, email OTP gating, and password synchronization.

## Compliance Preconditions

1. Existing authentication, tenant membership, active-terminal, location-access, permission, and
   shift checks remain authoritative; the frontend does not grant access by itself.
2. Email changes remain gated by the existing email-change OTP verification flow, and DGFY account
   lookup uses accepted tenant-user membership rather than trusting a mutable email address.
3. Password synchronization copies only an already-hashed password; plaintext credentials never
   cross the tenant/DGFY account boundary.
4. Ownership or membership transfer is limited to the existing master-admin flow and executes
   through the existing repository transaction boundary with rollback handling.
5. Terminal lock/unlock diagnostics and company selection do not create, settle, void, refund, or
   alter payments, fiscal documents, inventory, shifts, or transactions.
6. The preflight values are PR-stage placeholders for the continuous compliance sweep; no live
   production qualification is claimed by this declaration.

## Verification Evidence

- The focused shared POS contract suite passed: 5 files, 137 tests.
- The POS profile settings behavior test passed: 1 file, 5 tests.
- The focused API identity synchronization tests passed: 2 suites, 15 tests.
- The POS production build passed; only existing Vite chunk-placement warnings were emitted.
- Architecture guardrails and controller-boundary checks passed.
- ESLint passed on the changed API source files; the redundant initialization in the SMS redaction
  use case was removed so the full API lint no-useless-assignment error is resolved.
- `git diff --check` passed.
