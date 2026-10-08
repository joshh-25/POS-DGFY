---
status: draft_pr
owner: DGFY Platform
last_reviewed: 2026-10-08
related_adr: docs/architecture/adr/0079-dglaundry-external-runtime-and-provider-contract.md
declaration_id: 2026-10-08-dglaundry-runtime-attestation-qualification-probes
classification: major
surfaces: payments,commerce
reason_codes_impacted: DGLAUNDRY_RUNTIME_READINESS_ATTESTATION,DGLAUNDRY_SANDBOX_PAYMENT_LIFECYCLE
policy_version: 2026.10.08
verification_evidence: changed-file node --check and git diff --check passed; npm run check:architecture passed (56 modules/698 code files, controller boundaries 105 files); npm run lint:docs and npm run check:adr --strict passed (31 governed docs/97 ADRs); npm run check:compliance passed (3 sensitive files and 10 API contract rules); node scripts/check-app-version-bump.js passed; focused Jest suites could not run because apps/dgfy-api/node_modules/jest/bin/jest.js is not installed
rollback_note: Revert the DGLaundry attestation, specimen-generation, and staging-only qualification-probe code together with the shared booking-expiry and receipt-confirmation changes and this declaration. Preserve any qualification order and provider records created by the staging-only fixture; no production operation or migration is authorized.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-10-08T11:19:59.043Z
preflight_request_ref: PREFLIGHT-37768735501-2026-10-08-DGLAUNDRY-RUNTIME-ATTESTATION-QUALIFICATION-PROBES
---

# DGLaundry runtime attestation and qualification probes (#2306)

## Compliance Impact Classification

Major, matching the `payments` surface floor. This change exposes a signed runtime-readiness
attestation and adds sandbox-only payment lifecycle probes for a dedicated qualification order.
The probes use existing booking cancellation, payment expiry, refund, and receipt-confirmation
paths; they must not authorize live payment activity or weaken payment finalization rules.

## Affected Surfaces

- `payments` — staging/test-mode lifecycle probes for expiry, cancellation, refund, and receipt.
- `commerce` — DGLaundry runtime readiness, event specimens, order ownership, and provider contract.

## Compliance Preconditions

1. Qualification probes are restricted to the reserved qualification order, staging environment,
   and PayMongo test mode. They do not accept arbitrary order references or live payment credentials.
2. Refund and expiry operations use the existing domain/provider paths and their idempotency controls;
   duplicate specimens preserve the original signed event bytes and nonce.
3. Attestation readiness values are derived from runtime configuration and readiness checks. Missing
   registrations or configuration fail closed; they are not represented as ready based on a configured
   boolean alone.
4. No migration, production payment operation, deployment, or change to DGLaundry's repository is
   authorized by this change.
5. Live request-time preflight was not executed in this local Worker session. The `NOT-EXECUTED-*`
   reference is the expected placeholder for a PR targeting `develop`; the compliance sweep
   reconciles it after the declaration reaches `develop`.
6. The exact probe route contract remains subject to DGLaundry confirmation as recorded on issue
   #2306; this PR does not claim provider approval or hosted qualification acceptance.

## Verification Evidence

Validation command results and remaining hosted qualification evidence are recorded in the linked
pull request. Focused Jest suites could not run locally because the API workspace's Jest executable
is not installed. Staging qualification and DGLaundry's hosted validators remain outstanding.
