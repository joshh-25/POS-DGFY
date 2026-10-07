---
status: draft_pr
owner: DGFY Platform
last_reviewed: 2026-10-07
related_adr: docs/architecture/adr/0079-dglaundry-external-runtime-and-provider-contract.md
declaration_id: 2026-10-07-dglaundry-outbound-delivery-phase-479
classification: major
surfaces: payments,commerce
reason_codes_impacted: DGLAUNDRY_OUTBOUND_DELIVERY_DURABILITY,PAID_BOOKING_FINALIZATION
policy_version: 2026.10.07
verification_evidence: focused DGLaundry Jest suites passed (12 suites/62 tests), including payment finalization retry, mixed-child compensation, worker completion retry, and delayed caller idempotency reconciliation; changed-file node --check and git diff --check passed; npm run check:architecture passed (56 modules/680 code files, 104 controllers); npm run lint:docs and npm run check:adr --strict passed (31 governed docs/97 ADRs); npm run check:compliance passed; develop-base app-version check passed (no app version bump applies); opt-in scripts/verify-dglaundry-outbox-durability.mjs passed against disposable MySQL 8 and Redis 7, including migration up/re-run, ordered concurrent claims, expired lease recovery, stale-ack protection, scoped failed-completion inspection, completion-only redrive, separate-process MySQL persistence, parallel cross-process nonce claims, and replay rejection after process restart; hosted provider calls and full signature/time/outage edge matrix were not run; npm run lint has one pre-existing duplicate cancelPaymentIntent class-member error in apps/dgfy-api/src/services/paymongoService.js:737 plus three unrelated warnings; npm run audit:test-cost:check remains stale on baseline with many unrelated missing/stale inventory entries, including the new unit suites
rollback_note: Stop DGLaundry outbox draining before reverting callers/worker. Preserve and reconcile all pending, leased, retry_wait, dead_letter, and completion records before any schema rollback; dropping a populated outbox is not a routine rollback. No provider capture/refund or deployed environment mutation is authorized by this change.
preflight_result: no_breach
preflight_reason_code: REQUEST_NOT_EXECUTED
preflight_run_at: 2026-10-07T00:00:00.000Z
preflight_request_ref: NOT-EXECUTED-2310-DGLAUNDRY-OUTBOUND-DELIVERY-PHASE-479
---

# DGLaundry durable outbound delivery and recovery (#2310)

## Compliance Impact Classification

Major, matching the `payments` surface floor. The change makes DGFY-to-DGLaundry delivery durable
and allows a delayed provider submission to be reconciled with the existing paid booking session.
It preserves the existing verified-payment gate and does not introduce a capture, refund, fee,
settlement, or payout action.

## Affected Surfaces

- `payments` — durable booking preparation/submission delivery and paid-session finalization retry.
- `commerce` — DGLaundry order mutation, ownership, and provider integration state.
- Landlord schema — additive outbox table; no tenant schema is changed.

## Compliance Preconditions

- Queue acceptance never finalizes a payment session. Existing payment/provider confirmation remains
  the authority for paid state; delivery retries must not capture or refund money.
- Outbound payloads retain the original identity and mapped company/location; retries regenerate
  request credentials and signatures.
- Dead-letter access is restricted to an accepted owner/admin membership and active mapping, with
  redacted metadata and an audit record for redrive.
- The migration is landlord-only and additive. Stop draining and preserve queued work during rollback.
- **Live request-time preflight was not executed.** The `NOT-EXECUTED-*` reference is a develop-PR
  placeholder and must be reconciled by the governed preflight sweep before promotion. This file
  does not claim a preflight passed.
- No deployment, production payment operation, or DGLaundry repository change is authorized.

## Verification Evidence

Final command output and any remaining blocked acceptance evidence are recorded in the linked PR
and Phase 479 ledger entry. Real MySQL migration/claim evidence and real shared-Redis multi-process
replay evidence are required before Phase 479 is marked complete.

The integration batch also routes paid-session finalization and DGLaundry order submission through
the durable delivery state, and reconciles successful worker completion back to the caller's
idempotency record. Focused tests cover retrying finalization without a new provider event and
partial child-order failure with cancellation intent; these paths preserve the existing verified
payment gate and do not perform payment capture or refund.
