---
status: reference
owner: engineering
last_reviewed: 2026-08-31
declaration_id: 2026-08-31-preflight-ephemeral-target
classification: minor
surfaces: compliance
reason_codes_impacted: ALLOWED
policy_version: 2026.08.31
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-09-02T03:56:16.394Z
preflight_request_ref: PREFLIGHT-33588602895-2026-08-31-PREFLIGHT-EPHEMERAL-TARGET
verification_evidence: Live spike (2026-08-31) -- isolated docker network, mysql+redis+dgfy-api provisioned fresh, real provisionTenant() tenant creation, real POST /api/v1/auth/login, real POST /api/v1/compliance/preflight call against a real declaration from the current batch -- result: no_breach can_proceed: true. Repeated against the final production seed-preflight-fixture.js script (not just the throwaway spike version) with the same result. node --test scripts/build-preflight-request.test.js -- 12/12 passing (5 new). node --test scripts/reconcile-preflight-declarations.test.js -- 6/6 passing including that a failing verdict is never reconciled. Manual reconcile run against a real declaration copy confirmed only the two intended front-matter lines changed. node --check on every changed/new .js file. YAML structural validation and bash -n on every run: block in the rewritten workflow. npm run check:compliance confirmed clean (no mechanical requirement for this diff).
rollback_note: Revert .github/workflows/compliance-preflight-sweep.yml, apps/dgfy-api/scripts/seed-preflight-fixture.js, apps/dgfy-api/scripts/teardown-preflight-fixture.js, scripts/reconcile-preflight-declarations.js (+.test.js), the build-preflight-request.js surface-filter/evidence-truncation additions, the tenantModelFactory.js NON_TENANT_MODEL_EXPORTS entry, and the doc/ADR amendments together. Reverting the workflow restores the prior (non-functional, secrets-dependent) sweep exactly as it was -- no cleanup needed on any host, since this change never touches a deployed environment at all. The tenantModelFactory.js fix (#1233) is safe to revert independently or keep regardless of the rest -- it is a pre-existing, unrelated defect this work surfaced, not something this feature depends on for correctness elsewhere. No schema change, no persisted business state, no bot account or secret created anywhere outside this same job's own ephemeral run.
---

# Compliance Preflight Sweep: Ephemeral CI Target, No Secrets, Continuous Trigger (#1163/#1248)

Covers #1248 (`feat(ci): run compliance preflight sweep against an ephemeral instance, no secrets`),
superseding #1163's manual bot-account-provisioning approach.

## Compliance Impact Classification

**Minor.** `scripts/check-compliance-impact.js`'s `COMPLIANCE_SENSITIVE_RULES` patterns don't match
this diff's paths (`.github/workflows/`, `scripts/`, `apps/dgfy-api/scripts/`, `docs/`) — confirmed
empirically (`npm run check:compliance` reports "No compliance-sensitive changes detected"), not
assumed. Filed voluntarily anyway, matching #1121's own precedent for this exact class of change:
this touches the compliance preflight mechanism itself, and #1233's tenantModelFactory.js fix
touches which models sync into every tenant database.

**Why `minor`, not `major`/`regulatory`:** this change does not touch the preflight endpoint's own
decision logic, the policy engine, or any authorization/shift/payment/document-classification path
— it changes only *where* the sweep calls that endpoint from (an ephemeral CI-provisioned instance
instead of a manually provisioned remote bot account) and *when* it runs (continuously on push,
instead of dispatched once per promotion). The endpoint's own behavior, and every declaration's
actual evaluated result, are unchanged. The `tenantModelFactory.js` fix (#1233) makes tenant
provisioning correct — it doesn't grant new authorization, weaken a policy check, or touch a
money/receipt/document path.

## Preflight

`NOT-EXECUTED-*`, disclosed honestly per this repo's own established precedent: this PR is what
*builds* the mechanism that runs live preflight — running it against itself would be circular, the
same reason `check-compliance-impact.js`'s own PRs don't preflight themselves. The mechanism's own
correctness is verified instead by the live spike documented in `verification_evidence` above: a
real declaration from the current batch, run through the real endpoint via this exact pipeline,
returned a real `no_breach`/`can_proceed: true`. Once this PR merges to `develop`, the sweep it adds
will auto-trigger on the very next declaration to land and, from that point on, every future
declaration converts its own `NOT-EXECUTED-*` automatically — this is the last declaration in this
repo's history expected to carry that placeholder by hand.

## Rollback

See `rollback_note` above.
