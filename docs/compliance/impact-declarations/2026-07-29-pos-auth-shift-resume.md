---
status: reference
owner: engineering
last_reviewed: 2026-07-29
related_adr: 0026-browser-session-cookie-authority.md,0031-pos-terminal-pairing-and-shift-safe-navigation.md
declaration_id: 2026-07-29-pos-auth-shift-resume
classification: regulatory
surfaces: pos,terminal,settings,compliance
reason_codes_impacted: AUTHENTICATION_FAILED,LOCATION_ACCESS_DENIED,CONFLICT,ALLOWED
policy_version: 2026.07.29
verification_evidence: frontend auth and shift tests,backend terminal ownership tests,npm run build:pos,npm run check:architecture
rollback_note: Revert the terminal authentication handoff, shift-entry decision, sanitized occupancy read model, cart draft recovery, POS toast deduplication, and their tests together; retain the existing durable shift ownership invariant.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-07-29T17:55:00+08:00
preflight_request_ref: POS-AUTH-SHIFT-20260729
snapshot_commit: pending-local
---

# POS Authentication And Shift Resume

## Compliance Impact Classification

Regulatory for the combined local release inventory. The POS authentication and
shift-resume change itself does not alter fiscal calculations, receipt numbering,
payment authority, or recorded shift ownership, but it ships alongside governed
settings and compliance-sensitive payment changes and therefore adopts the higher
release classification.

## Affected Surfaces

- POS browser-session activation and bounded 401 recovery.
- Authenticated cashier shift resolution before terminal opening.
- Sanitized terminal occupancy status for a permitted branch.
- Shift-scoped cart draft recovery after the same cashier resumes the same shift.

## Compliance Preconditions

1. The backend remains authoritative for token validation, tenant membership, granular POS permissions, terminal registration, location grants, and shift ownership.
2. A cashier resumes only the open shift owned by their permanent tenant user ID.
3. Another cashier's open shift is never reassigned and its cash totals, opening float, and identity are not exposed through the availability response.
4. Opening a new shift still requires an available active terminal, an authorized branch, opening cash validation, and the existing idempotent backend mutation.
5. Browser cart drafts contain no credentials and are isolated by tenant, terminal, location, user, and durable shift ID. Checkout remains server-authoritative.
6. Refresh is attempted once and the original protected request is retried once; failed refresh clears stale authority and returns to login.

## Verification Evidence

- Frontend targeted suite: 58 tests passed for refresh/retry, DGFY session activation, shift decisions, cart recovery, terminal contracts, and toast deduplication.
- Backend targeted suite: 18 tests passed for terminal availability, shift ownership, concurrent opens, same-cashier resume, and idempotent replay.
- Targeted frontend and backend ESLint completed with no errors.
- `npm run build:pos` completed successfully.
- `npm run check:architecture` completed successfully.
