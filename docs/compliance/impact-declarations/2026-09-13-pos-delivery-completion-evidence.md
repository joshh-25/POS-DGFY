---
status: reference
owner: engineering
last_reviewed: 2026-09-13
related_adr: docs/architecture/adr/0034-manual-delivery-job-foundation.md
declaration_id: 2026-09-13-pos-delivery-completion-evidence
classification: major
surfaces: pos,terminal,settings
reason_codes_impacted: DELIVERY_EVIDENCE_IMAGE_REJECTED,DELIVERY_EVIDENCE_IMAGE_TOO_LARGE,DELIVERY_EVIDENCE_IMAGE_COUNT,DELIVERY_EVIDENCE_SIGNATURE_COUNT,DELIVERY_EVIDENCE_ALREADY_ATTACHED,DELIVERY_JOB_NOT_ATTESTABLE
policy_version: 2026.09.13
verification_evidence: apps/dgfy-api/tests/posDeliveryCompletionEvidence.usecase.test.js,apps/dgfy-api/tests/createDeliveryCompletionEvidence.migration.test.js,apps/dgfy-api/tests/deliveryCompletionEvidenceStorage.test.js,node --check on every changed apps/dgfy-api and migration-runner JavaScript file,npm run check:architecture-guardrails,npm run check:controller-boundaries
rollback_note: Reverting the code removes the evidence routes and model access but does not remove private files already written under storage/delivery-completion-evidence. Rolling back the tenant migration drops the two evidence tables and therefore loses their metadata while also leaving any corresponding private files orphaned; any rollback or purge must be coordinated as an explicit out-of-band operational action.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-09-13T12:00:00+08:00
preflight_request_ref: PREFLIGHT-1462-2026-09-13
---

# Delivery-completion evidence and recipient signature (#1462)

## Compliance Impact Classification

Major. The changed POS use cases, POS routes, private storage adapter, and
assignment authorization surface carry the repository's `major` floor for POS,
terminal, and settings/RBAC behavior. This phase stores and serves handwritten
recipient signatures and address imagery belonging to a non-user third party,
so the classification is an explicit privacy decision rather than a routine
inheritance from ordinary delivery metadata. It is not `regulatory`: the
change adds no fiscal document, tax computation, compliance-policy endpoint, or
tenant-admin compliance workflow.

## Affected Surfaces

1. Tenant-local `delivery_completion_evidence` and
   `delivery_completion_evidence_images` tables, with a one-parent-per-job
   constraint, optional recipient signature metadata, and staff image rows.
2. Private storage under `storage/delivery-completion-evidence/`, normalized to
   WebP and never exposed through the public `/uploads` static mount.
3. Authenticated POS evidence routes and controllers, including metadata and
   image/signature streaming.
4. POS use cases/repository contracts for attach-once behavior, file-digest
   idempotency, audit logging, and response redaction.
5. `assertStaffAssignment` authorization for direct delivery-job assignees and
   delivery-run members, reusing `delivery_runs:act` rather than adding a new
   permission.

## Compliance Preconditions

1. **No unauthenticated access path exists.** All routes run inside the existing
   authenticated, tenant-scoped POS router. Attach requires `pos:transact` or
   `delivery_runs:act`; reads require `pos:view` or
   `delivery_runs:view_assigned`, and narrow staff writes are checked against
   the direct job assignment or run membership.
2. **The files are private.** The storage adapter uses its own configurable
   root outside the Express static `/uploads` mount, a tenant/order path
   segment, UUID filenames, a traversal guard, and exclusive writes.
3. **EXIF/GPS metadata is removed.** Sharp rotates according to source
   orientation and writes a WebP without `.withMetadata()`; the focused test
   suite includes the storage path as an acceptance target, and the runtime
   pipeline is structurally identical to the existing private payment-proof
   adapter.
4. **Source files are validated before storage.** Multer bounds each request;
   the use case re-checks the reported MIME, magic bytes, actual source size,
   image count, and signature count before it calls the private storage
   adapter.
5. **The response and audit trail are redacted.** API metadata exposes only
   IDs/counts/booleans, actor, and timestamp. Audit changes contain event,
   order/job identity, image count, signature presence, and time; they never
   contain storage paths, hashes, or file bytes.
6. **Retries cannot duplicate evidence.** The request fingerprint includes
   raw uploaded-file SHA-256 digests. Same-key/same-content retries replay the
   cached response without writing files or rows; changed content conflicts;
   new submissions are attach-once.
7. **Retention is explicit.** Evidence is retained for the life of the
   tenant/order record in this phase. No automated purge, export, or erasure
   endpoint is introduced; bounded retention and erasure are deferred to #243,
   while manual operational purge remains available out-of-band.
8. **The lifecycle remains additive.** Evidence is not required to mark a job
   delivered or complete an order. Attach is permitted for manual jobs except
   failed/cancelled jobs, and an all-empty submission is a valid recorded
   completion-evidence event.

## Verification Evidence

- `apps/dgfy-api/tests/posDeliveryCompletionEvidence.usecase.test.js` covers
  images plus signature, image-only/empty optionality, idempotent replay,
  changed-payload conflict, magic-byte rejection/temp cleanup, metadata
  redaction, and authenticated stream resolution.
- `apps/dgfy-api/tests/createDeliveryCompletionEvidence.migration.test.js`
  covers tenant fan-out, child-before-parent rollback order, and registry
  lockstep.
- `apps/dgfy-api/tests/deliveryCompletionEvidenceStorage.test.js` covers the
  private storage adapter's WebP normalization and EXIF/orientation removal.
- `node --check` passes on every changed/new JavaScript and CommonJS migration
  file.
- `npm run check:architecture-guardrails` and
  `npm run check:controller-boundaries` pass.
- Focused Jest execution passed: the use-case, migration, and storage suites
  ran successfully with 13 tests passing. Tenant-schema coverage also passed
  after the repository's API dependencies were installed with
  `npm ci --ignore-scripts`.

## Residual Risks

1. **Retention is intentionally not automated.** The life-of-record policy is
   explicit but may exceed proportionality needs until #243 decides a bounded
   window and implements tenant export/erasure controls.
2. **Private-file rollback is manual.** Database rollback cannot discover and
   delete storage objects safely; operations must reconcile orphaned files if a
   rollback is ever required.
3. **Signature provenance remains user-entered evidence.** The API records it
   as recipient-supplied because that is the capture contract, not because DGFY
   independently verifies the signer or the handover.

## Preflight Reconciliation

The live compliance preflight endpoint is not executed against a deployed
environment on a `develop` implementation PR. The declaration records the
approved local classification and the required no-breach preflight token; the
live sweep remains a promotion-stage gate under the request-time preflight
protocol.
