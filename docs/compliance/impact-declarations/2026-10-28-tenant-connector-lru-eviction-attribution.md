---
status: draft_pr
owner: DGFY API / Operations
last_reviewed: 2026-10-28
declaration_id: 2026-10-28-tenant-connector-lru-eviction-attribution
classification: regulatory
surfaces: compliance,payments,pos,settings,terminal
reason_codes_impacted: none
policy_version: 2026.10.28
verification_evidence: focused Jest suites,API JavaScript syntax checks,npm run check:architecture,npm run lint:docs,GITHUB_BASE_REF=develop GITHUB_HEAD_REF=fix/2920-tenant-cache-eviction-attribution node scripts/check-app-version-bump.js,npm run check:compliance
rollback_note: Revert the fixed caller-label arguments, LRU diagnostic, aggregation utility, and this declaration. One-argument getConnection calls remain compatible; cache sizing, connection selection, API responses, and database schema are unchanged.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-10-28T13:21:08Z
preflight_request_ref: NOT-EXECUTED-2920-TENANT-CONNECTOR-LRU-EVICTION-ATTRIBUTION
---

# Tenant Connector LRU eviction attribution (#2920)

## Compliance Impact Classification

Regulatory is the computed path floor because the changed caller in
`adminAssistedProvisioningUseCase.js` is covered by the tenant-intake compliance rule. The other
changed sensitive paths cover payments, POS/terminal, and settings. The implementation adds only
fixed caller labels to existing tenant-connection calls and emits a data-minimal diagnostic; it
does not change authorization, payment, provisioning, tenant-selection, or API behavior.

## Affected Surfaces

- **Payments:** fixed labels at the commerce-payment administrative use case, payment finalization
  use case, and tenant order payment ledger repository.
- **POS and terminal:** fixed label at POS terminal-device enrollment.
- **Settings and compliance:** fixed labels at admin-assisted provisioning and tenant session
  service call sites.
- The diagnostic contains only the event name, UTC timestamp, and fixed component caller label. It
  excludes tenant identifiers, tenant names, database names, and request data.

## Compliance Preconditions

1. Caller labels are code-defined constants; missing, malformed, or overlong values normalize to
   `unknown`.
2. The LRU event is emitted only when an entry is actually removed from the cache. Cleanup,
   shutdown, skipped busy entries, and absent entries do not emit it.
3. No authorization decision, payment state, tenant provisioning state, schema, pool limit,
   connection timeout, or HTTP response changes.

## Verification Evidence

- Focused tenant connector, scheduler, and aggregation Jest suites: 3 suites / 26 tests passed.
- `node --check` passed for all 43 changed JavaScript files.
- `npm run check:architecture` and `npm run lint:docs` passed.
- `node scripts/check-app-version-bump.js` passed; no version floor change applies to ordinary
  `develop` work.
- Direct-call audit confirmed 52 cached tenant-connection call sites use fixed, bounded labels.
- `npm run check:compliance` passed after this declaration was added.
- Full API lint was attempted; it reports pre-existing errors at unchanged lines in
  `dgfyAccountRepository.js` and `staffRoleUseCases.js`.

## Request-Time Preflight Status

The live request-time preflight was not executed in this Worker session. The front-matter
`no_breach` / `ALLOWED` values are the accepted PR-time placeholder shape, not a claim of a policy
engine result. `NOT-EXECUTED-2920-TENANT-CONNECTOR-LRU-EVICTION-ATTRIBUTION` must be reconciled by
the normal continuous `develop` declaration sweep before promotion.

## Rollback Note

Revert the fixed caller-label arguments and diagnostic/aggregation code. The one-argument
`getConnection(tenant)` interface remains compatible; no cache sizing, connection lifecycle,
database schema, or API response change needs a separate rollback.
