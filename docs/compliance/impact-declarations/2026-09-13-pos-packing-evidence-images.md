---
status: reference
owner: engineering
last_reviewed: 2026-09-13
declaration_id: 2026-09-13-pos-packing-evidence-images
classification: regulatory
surfaces: pos,terminal,inventory,payments,settings,compliance
reason_codes_impacted: ORDER_NOT_PACKED,PACKING_EVIDENCE_LIMIT_EXCEEDED,PACKING_EVIDENCE_IMAGE_REJECTED,NOT_YOUR_PACKING,NOT_PERMITTED
policy_version: 2026.09.13
verification_evidence: focused backend 9/9; focused UI 3/3; route transport 9/9; existing POS packed/balance regressions 31/31; API lint; architecture/compliance gates; POS/IMS/Storefront builds
rollback_note: Reverting the code stops new attachments and reads but does not delete existing private files; rolling back the nullable metadata column can orphan files under POS_PACKING_EVIDENCE_ROOT and requires manual out-of-band cleanup.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-09-13T00:00:00.000Z
preflight_request_ref: PREFLIGHT-1460-LOCAL-NOT-RUN
---

# POS packing evidence images (#1460)

## Compliance Impact Classification

Major. The changed POS routes, POS use cases, private image storage adapter, and POS queue UI
match the repository's `pos`/`terminal` major classification floor. The feature stores and serves
operational order images through authenticated tenant-scoped routes, so the declaration also
records the privacy-sensitive handling explicitly even though it does not create a regulatory
workflow or payment record.

This is ordinary additive `[snapshot]`-tier work under ADR 0039. It does not amend the payment
evidence decision in ADR 0063: packing evidence is order-lifecycle evidence, not proof of payment.

## Affected Surfaces

1. `apps/dgfy-migration-runner/migrations/20260913000001-add-order-packing-evidence-images.cjs`
   and `apps/dgfy-api/scripts/sync-tenant-schemas.js` add the nullable tenant-local metadata
   column with idempotent active-tenant fan-out and startup repair.
2. `apps/dgfy-api/src/models/PosTransaction.js` exposes the JSON field to the tenant model.
3. `apps/dgfy-api/src/modules/pos/repositories/posPackingEvidenceStorage.js` writes normalized,
   EXIF-stripped WebP files under a private tenant/order/UUID path and never uses `/uploads`.
4. `apps/dgfy-api/src/modules/pos/usecases/posUseCases.js`, the POS handlers/controller facade,
   validators, and `routes/pos.js` add the packed-only append/dedupe/list/stream contract.
5. `packages/web-core/src/features/pos/` adds the authenticated client calls and an optional POS
   queue affordance with a six-image client cap and object-URL cleanup.

## Compliance Preconditions

1. No public/static path serves these files. The storage adapter uses a separate private root,
   random UUID filenames, traversal checks, and `Cache-Control: private, no-store` on streams.
2. Uploads are restricted by MIME allowlist, magic-byte validation, a 15 MB source limit, and a
   six-image persisted order cap. Images are rotated/resized to WebP without retaining EXIF/GPS.
3. The routes require tenant authentication and broad POS permissions or narrow
   `orders:pack`; the use case compares narrow callers to the order's existing `packed_by` actor
   and does not reuse the helper that intentionally denies access after `packed_at` is set.
4. Existing order serializers remove the private JSON metadata and expose only
   `packing_evidence_count`; list/read image endpoints expose safe descriptors, never storage
   keys or hashes.
5. The read-modify-write is row-locked, duplicate normalized output hashes are idempotently
   returned, and failed database writes remove newly stored files.
6. No automated retention/purge policy is introduced in this phase. Images remain on the tenant
   volume until a separately authorized retention decision is implemented.

## Verification Evidence

Executed local validation is recorded below. The request-time preflight endpoint was not called
from this local implementation session; the `no_breach` fields above preserve the repository
declaration shape, and this caveat is intentional until the develop-to-staging promotion
preflight runs.

Required evidence includes:

- `apps/dgfy-api/tests/posPackingEvidence.usecase.test.js` covering duplicate retry, narrow-role
  wrong actor and positive self-actor access, missing permission, cross-tenant/unknown image
  reads, zero-image packed orders, not-packed conflict, six-image limit, and magic-byte rejection.
- `packages/web-core/src/features/pos/__tests__/packingEvidence.behavior.test.jsx` covering packed
  gating, optional zero-image rendering, client-side cap, upload state, and authenticated viewer.
- Tier 0 syntax checks, all three consuming frontend app builds, `npm run check:architecture`,
  `npm run check:compliance`, and `node scripts/check-app-version-bump.js`.

Executed results: focused backend tests passed 9/9; route transport tests passed 9/9; focused UI behavior tests passed 3/3; existing
packed-step/balance-payment regressions passed 31/31; API lint passed; architecture and compliance
checks passed; and POS, IMS, and Storefront production builds passed. The broader API suite remains
environment-limited here by missing MySQL credentials and pre-existing repository test doubles
that omit `sequelize.literal`; those failures are unrelated to this feature's focused coverage.

## Residual Risks

1. There is no retention or purge workflow in this phase; images persist for the tenant volume's
   operational lifetime. A future PM/compliance decision must define retention and deletion rules.
2. Rolling back the migration after attachments exist orphans files because schema rollback cannot
   safely infer whether a private file is still needed. Cleanup is manual and out of band.
3. The image is operational evidence only. `packed_by`/`packed_at` remains the sole packing
   transition attribution and the feature does not claim that a photograph is DGFY-verified.
