---
status: draft_pr
owner: DGFY Platform
last_reviewed: 2026-10-14
related_adr: docs/architecture/adr/0096-contact-inquiry-provider-configuration.md
declaration_id: 2026-10-14-contact-us-pin4ms-provider-config
classification: regulatory
surfaces: pos,settings,compliance
reason_codes_impacted: ALLOWED
policy_version: 2026.10.14
verification_evidence: 36 API Jest tests; 3 Admin Vitest tests; 5 Storefront Vitest tests; Admin and Storefront production builds; npm run check:architecture; npm run lint:docs; node --check on 21 changed JS/CJS files; changed-file forbidden-marker scan on 41 files; tenantModelFactory contract 14/14; disposable WSL preflight no_breach/ALLOWED (PREFLIGHT-LOCAL-1791973320703-2026-10-14-CONTACT-US-PIN4MS-PROVIDER-CONFIG)
rollback_note: Revert the Contact Us/Admin/API code while retaining the additive provider-config table; any down migration drops the stored encrypted provider key and requires an operator-approved backup and data-loss review.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-10-14T10:24:10.606Z
preflight_request_ref: PREFLIGHT-LOCAL-1791973320703-2026-10-14-CONTACT-US-PIN4MS-PROVIDER-CONFIG
---

# Contact Us and Pin4MS provider configuration (#2480)

## Compliance Impact Classification

The repository path rules require the regulatory floor because this change touches the Platform Admin API service and authentication middleware. Their computed surfaces are `settings`, `compliance`, and `pos`. This is a path-based classification floor; the feature does not change fiscal, tax, payment, or settlement behavior. The implemented provider scope is limited to storing and managing the Pin4MS form API key. Reading or syncing submissions is not included.

## Affected Surfaces

- Platform Admin: permission-gated Contact Inquiries configuration and write-only API-key entry.
- API and landlord database: authenticated configuration endpoints and encrypted provider-key persistence.
- Storefront: public Contact Us route embedding the provider-hosted form; submissions remain with Pin4MS.
- `pos`, `settings`, and `compliance` are included to satisfy the repository's computed path-based compliance floor, not to claim that this feature changes POS or regulatory policy behavior.

## Compliance Preconditions

- The API must have the dedicated 32-byte hexadecimal encryption secret provisioned outside source control before key entry is enabled.
- API-key submission must use HTTPS, except trusted loopback development, and authorization is enforced by the API rather than only by the UI.
- Provider-key status responses and audit data must not reveal the key.
- This change does not retrieve or persist contact submissions. The 60-day active / archived-until-admin-deletion retention decision applies only to a future DGFY-side copy and does not imply deletion from Pin4MS.
- The required request-time preflight passed on 2026-10-14 and was reconciled to `no_breach` / `ALLOWED` under request ref `PREFLIGHT-LOCAL-1791973320703-2026-10-14-CONTACT-US-PIN4MS-PROVIDER-CONFIG`.

## Verification Evidence

The changed-file forbidden-marker scan covered 41 tracked/added source and documentation files and found no markers. API focused Jest tests passed 36/36; Admin Vitest passed 3/3; Storefront Vitest passed 5/5. Admin and Storefront production builds passed using temporary output directories; Storefront emitted the existing large-chunk warning. `npm run check:architecture`, `npm run lint:docs` (35 governed docs and 104 ADRs), and `node --check` for 21 changed JavaScript/CommonJS files passed. In this follow-up, the tenant-model contract test passed 14/14, the architecture check passed, and the disposable WSL preflight passed using Node v22.20.0, MySQL 8.0.46, and Redis 7.4.11. The preflight reconciled this declaration to `no_breach` / `ALLOWED` under request ref `PREFLIGHT-LOCAL-1791973320703-2026-10-14-CONTACT-US-PIN4MS-PROVIDER-CONFIG`; temporary containers were removed afterward. The fix excludes the landlord-owned `ContactInquiryProviderConfig` model from tenant schema cloning. No Pin4MS API key or submission content was used by this preflight.
