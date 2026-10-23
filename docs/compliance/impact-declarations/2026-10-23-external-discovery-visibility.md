---
status: draft_pr
owner: DGFY Platform
last_reviewed: 2026-10-23
related_adr: docs/architecture/adr/0047-platform-admin-identity-and-page-rbac.md
declaration_id: 2026-10-23-external-discovery-visibility
classification: regulatory
surfaces: settings,compliance
reason_codes_impacted: AUTHORIZATION_FAILED,VALIDATION_FAILED,RESOURCE_NOT_FOUND
policy_version: 2026.10.16
verification_evidence: API Jest 4 suites/68 tests,Admin Vitest 2 files/53 tests,Admin lint/build and local mocked browser proof,MySQL 8 migration up/up/down/down/up/up,architecture/docs/compliance/version/release-note/syntax/diff-scope/marker gates
rollback_note: Revert the visibility API/Admin behavior and this declaration together; retain the additive show_on_map column if any type visibility state has been saved, and require an explicit data-preserving plan before removing it.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-10-23T06:08:27.116Z
preflight_request_ref: PREFLIGHT-LOCAL-1792735602532-2026-10-23-EXTERNAL-DISCOVERY-VISIBILITY
---

# External discovery visibility controls (#2715, Phase 538)

## Compliance Impact Classification

Regulatory is the computed minimum because `apps/dgfy-admin/src/services/adminService.js` is classified at the `settings,compliance` regulatory floor. The feature adds master-admin operations for external partner-type and pin visibility; it does not change POS, payments, fiscal calculations, checkout, or tenant permissions.

## Affected Surfaces

- `settings`, `compliance` — master-only Admin controls and audited API writes for partner-type and per-pin visibility.
- Public discovery — hidden partner pins are omitted from search, map pins, profile-by-slug reads, and `/e/{slug}` redirects; no customer identity or partner contact data is added.
- Landlord schema — an additive `external_redirect_sites.show_on_map` boolean preserves existing types as shown by default.

## Compliance Preconditions

1. The new write routes remain behind `authenticateAdmin` and `requirePlatformMaster`; the Admin service uses the existing cookie session and CSRF configuration.
2. Both write operations accept only a boolean, update only managed external provider records, and write operator audit rows. A missing site or unmanaged listing is not mutated.
3. The two visibility flags remain independent. Re-seeding does not show an individually hidden pin, and saving a destination does not change a partner's type visibility.
4. Hiding a type or pin does not delete records. The additive migration defaults `show_on_map` to `true`; a pre-migration API fails open for type visibility and logs the lookup error.
5. No deployed database, seed, or environment is changed by this PR. Migration order and the DEV verification are documented for the operator.

## Verification Evidence

Local implementation checks passed before the PR update. The focused API Jest suites passed (4 suites, 68 tests), and the focused Admin Vitest suites passed (2 files, 53 tests). Admin lint and production build passed, including a direct ESLint check of `Pages/ExternalDiscoveryManager.jsx`. Architecture guardrails and controller-boundary checks, governed docs and strict ADR lint, app version and release-note checks, JavaScript syntax checks, `git diff --check`, and the changed-file marker scan passed. The disposable MySQL 8 migration check ran `up/up/down/down/up/up`, confirming the column is present after both `up` passes and removed by both `down` passes.

A local Playwright browser run with mocked Admin and API responses confirmed the type and pin switches, the `Hidden by type` badge, pin Hide/Show while redirects are disabled, and preservation of an unsaved destination draft. The rendered screenshot is retained locally at `.tmp/admin-visibility-rendered.png`; no real partner or production data was used. A storefront screenshot was not produced because no local API-backed partner dataset was configured; public read-path behavior is covered by the focused API tests. No deployed environment or production database was changed.
