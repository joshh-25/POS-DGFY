---
status: reference
owner: engineering
last_reviewed: 2026-09-05
declaration_id: 2026-09-05-pos-checkout-validation-limits
classification: major
surfaces: pos,terminal
reason_codes_impacted: ALLOWED
policy_version: 2026.09.05
verification_evidence: API unit tests 88 passed,frontend unit and rendered component tests 23 passed,IMS POS and Storefront production builds passed
rollback_note: Revert the validation and UI limit changes together; retain existing fiscal records and use a new patch version for any subsequent release. No migration is introduced.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-09-05T07:25:06.470Z
preflight_request_ref: PREFLIGHT-LOCAL-PR1619-1788592930801
---

# POS checkout validation limits

## Compliance Impact Classification

Major, matching the POS and terminal frontend path floor.

## Affected Surfaces

Voucher requests may supply a null method because the server resolves the voucher
benefit. Other discount types retain strict method validation. Senior/PWD input
checks enforce names of 2–120 characters, primary IDs of 2–100 characters,
additional IDs of 2–120 characters, and at most 20 beneficiaries including the
primary beneficiary. Existing API limits, calculations, authorization, item
eligibility, and stored fiscal records remain authoritative.

## Compliance Preconditions

The authenticated `POST /api/v1/compliance/preflight` returned HTTP 200,
`result: no_breach`, `can_proceed: true`, and `reason_code: ALLOWED` on
2026-09-05T07:25:06.470Z. The request and complete response are recorded in
[preflight evidence](../evidence/2026-09-05-pr-1619-preflight.json).

The run used the application at commit
`49964f40e924cc23d19893ae644d64dbc30dc708`, listening on local loopback port
15019, with real authentication and a fresh `provisionTenant()` fixture using
the protocol's non-compliant, premium, active posture. The bot used the real
settings permission path. Startup schedulers were skipped; no route or policy
engine was mocked. The fixture was removed and the temporary API stopped.

The reference is operator-assigned (normalized to uppercase for the declaration
validator), not a server-issued audit ID. This follows
`docs/compliance/request-time-preflight-protocol.md`: the endpoint evaluates
the declaration against the fixture posture, not production checkout behavior.

## Verification Evidence

- API tests exercise the actual Voucher UI payload across all six payment methods
  and confirm that Other discounts still reject null methods.
- Identity-boundary tests cover short and oversized values and the primary-ID limit.
- Rendered component tests cover desktop and tablet layouts, the disabled Add
  button at 20 beneficiaries, and input maxLength attributes.
- All three frontend builds passed; POS and Storefront reported chunk-size warnings.
- No new persistence, replay, authentication, or payment collection behavior is
  introduced. End-to-end tablet checkout remains a release verification
  obligation; the completed local preflight does not establish production or
  APK checkout readiness.

## References

- PR #1619; related issues #1584 and #1101.
- ADR 0033 exact cart-line scope and multi-beneficiary amendments.
- ADR 0081 patch-only main hotfix versioning.
