---
status: reference
owner: engineering
last_reviewed: 2026-10-18
related_adr: 0014-multi-template-modes-pos-offline-sync-and-storefront-cache-contracts.md
declaration_id: 2026-10-18-pos-backend-unreachable-classifier
classification: major
surfaces: pos,terminal
reason_codes_impacted: ALLOWED
policy_version: 2026.10.17
verification_evidence: Four consuming-app production builds, focused web-core tests (9 suites/162 tests), Playwright E2E listing, architecture/docs/compliance checks, app-version-floor check, JavaScript syntax and whitespace checks
rollback_note: Revert the shared classifier and POS integrations together; existing queued checkout intents remain durable and use the existing operator-controlled replay path.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-10-18T16:02:39+08:00
preflight_request_ref: NOT-EXECUTED-1476-2026-10-18
---

# POS backend-unreachable classifier

## Compliance Impact Classification

Major. The changed POS and terminal paths meet the repository's major classification floor.
This change improves outage detection and client-side recovery behavior. It does not change
server-side checkout authorization, tax or fiscal calculations, payment processing, compliance
decisions, or transaction persistence.

## Affected Surfaces

- POS checkout and terminal operation queues.
- POS catalog and incoming-order refresh behavior.
- POS terminal reachability status and transient-failure reporting.

## Compliance Preconditions

- Only eligible cash sales without discounts or resumed parked-sale ownership may be queued from
  the checkout failure path.
- Checkout idempotency keys remain unchanged when a failed first attempt is saved for later replay.
- Queued operations remain durable and replay only through the existing operator-triggered recovery
  flow; online, visibility, polling, and SSE events do not submit queued transactions.
- HTTP 500 and 429 outcomes remain retryable for the individual operation without marking the
  terminal backend unreachable. Replay failures continue through existing manual resolution.
- The reachability snapshot is in-memory and time-bounded; it introduces no customer data storage.

## Verification Evidence

- Focused web-core classifier, API diagnostics, POS checkout/catalog/replay, transient telemetry,
  and catalog-stream suites.
- POS, SKUpervisor, and affected shared-trunk production builds.
- Repository architecture, docs, compliance, and app-version-floor checks.
- The new outage E2E spec is listed successfully; runtime E2E was not run because the local POS
  server and provisioned service stack are unavailable.
- Live request-time preflight was not executed. The accepted `NOT-EXECUTED-*` reference will be
  reconciled by the continuous compliance preflight sweep.
