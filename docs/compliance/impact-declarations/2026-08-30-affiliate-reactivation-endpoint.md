---
status: reference
owner: engineering
last_reviewed: 2026-08-30
declaration_id: 2026-08-30-affiliate-reactivation-endpoint
classification: major
surfaces: pos,terminal
reason_codes_impacted: none
policy_version: 2026.08.30
verification_evidence: node --check on all five changed apps/dgfy-api files (syntax-only, no build step exists for this app),npm run build:skupervisor (succeeds),npm run build:pos (succeeds),npm run build:store (succeeds),apps/dgfy-api/tests/dgfyAffiliateReactivationUseCase.unit.test.js (11 passed, new),apps/dgfy-api/tests/dgfyAffiliateEnrollmentUseCases.unit.test.js (11 passed, 3 updated for #1191),apps/dgfy-api/tests/dgfyAffiliateRepository.slotEnforcement.unit.test.js (20 passed, unmodified, regression check)
rollback_note: Revert the new POST /affiliates/affiliates/:enrollment_id/reactivate endpoint (route, controller, use case, repository method), the PATCH status:'active' rejection, and the two packages/web-core files (affiliateService.js, AffiliatesWorkspacePanel.jsx). No schema change, no new column, no persisted state beyond the existing status field. No checkout, payment, receipt, terminal operation, or persisted transaction record is changed by any of it.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-09-02T03:56:16.393Z
preflight_request_ref: PREFLIGHT-33588602895-2026-08-30-AFFILIATE-REACTIVATION-ENDPOINT
---

# Affiliate Reactivation Endpoint with Slot-Cap Enforcement

## Compliance Impact Classification

`major`, `pos,terminal` surfaces, per `scripts/check-compliance-impact.js`'s
`^packages\/web-core\/src\/features\/pos\//` rule (floor `major`, surfaces `pos,terminal`)
regardless of what the change actually does. This is a back-office owner/admin screen (the
affiliates workspace panel) — not part of the checkout, payment, receipt, or terminal-operation
path. Nothing under `apps/dgfy-api/src/modules/dgfy/**` or
`apps/dgfy-api/src/routes/affiliateAdmin.js` is compliance-sensitive on its own; the two
`packages/web-core/src/features/pos/**` files are the sole trigger for this declaration (see
`PHASE_207_PLAN.md` §0.1).

## Affected Surfaces

1. **New backend endpoint** — `POST /api/v1/affiliates/affiliates/:enrollment_id/reactivate`
   (`apps/dgfy-api/src/routes/affiliateAdmin.js`,
   `apps/dgfy-api/src/modules/dgfy/controllers/dgfyAffiliateHandlers.js`,
   `apps/dgfy-api/src/modules/dgfy/usecases/dgfyAffiliateUseCases.js`,
   `apps/dgfy-api/src/modules/dgfy/repositories/dgfyAffiliateRepository.js`,
   `apps/dgfy-api/src/modules/dgfy/index.js`) — the only path that may perform a
   `suspended|revoked -> active` enrollment transition, gated by the existing #1177/Phase 198
   `max_affiliate_slots` cap check (reactivation is the only status change that consumes a slot).
2. **Backend, breaking change (deliberate)** — the generic `PATCH /affiliates/:enrollment_id` now
   rejects `status: 'active'` with `422 AFFILIATE_REACTIVATION_MOVED`. This is the only enforcement
   path for reactivation going forward; `suspended`/`revoked` targets on the PATCH are unaffected.
3. **`packages/web-core/src/features/pos/services/affiliateService.js`** — one new API client
   function, `reactivateAffiliateEnrollment(enrollmentId)`, calling the new endpoint.
4. **`packages/web-core/src/features/pos/components/AffiliatesWorkspacePanel.jsx`** — the existing
   "Reactivate" button (previously `handleStatusChange(affiliate, 'active')`, which would start
   failing with a toast error the moment the backend PATCH restriction above ships) is repointed at
   a new `handleReactivate` handler calling the new endpoint. This is a shared trunk consumed by all
   three frontend apps (`dgfy-ims`, `dgfy-pos`, `dgfy-storefront`) via a `file:` dependency, hence
   the three separate build verifications below.

## Compliance Preconditions

1. **No checkout totals, discounts, taxes, payments, receipts, refunds, voids, or shift cash
   calculations are changed by this commit.** The touched panel is an owner-facing back-office
   affiliate-management screen; it is never rendered or reached from the checkout or POS terminal
   code path.
2. **No POS terminal operation, fiscal document rendering, or persisted transaction record is
   touched.**
3. **The revocation audit columns (`revoked_at`/`revoked_by`/`revocation_reason`) are preserved, not
   cleared, on reactivation** — a decision already ledgered as a shipped Phase 199 acceptance
   criterion (`docs/features/IMPLEMENTATION_PHASE_LEDGER.md`, "Phase 199"), re-verified rather than
   re-opened this phase (`PHASE_207_PLAN.md` §0.2). Nothing in the codebase reads or branches on
   these three columns outside the model, the migration, and Phase 199's own tests — confirmed via
   `grep -rn "revoked_at\|revoked_by\|revocation_reason" apps packages` scoped to
   `dgfy_affiliate_enrollments`.
4. **`activated_at` (the original enrollment date, rendered to the affiliate as "Enrolled &lt;date&gt;"
   in `apps/dgfy-storefront/src/customer-dashboard/components/AffiliateSection.jsx`) is never
   written by the reactivation path** — explicit `DO NOT` in the plan (§0.3), verified in the
   repository method and covered by test 8 in the new test file.
5. **The new endpoint is gated by the same `authenticate` + `MANAGE_AFFILIATES` permission chain**
   already enforced on the existing `PATCH /affiliates/:enrollment_id` route — no new permission
   surface was introduced.
6. **The frontend change is a straight redirect of an existing button's call target** — no new UI
   surface, no new form fields, no new data displayed. The `err?.response?.data?.message` fallback
   already surfaces the backend's message verbatim (including a slot-cap rejection), so no bespoke
   `reason_code` handling was added.

## Verification Evidence

1. `node --check` on all five changed `apps/dgfy-api` files — syntax-only (this app has no real
   build step; its own `build` script is a literal no-op `echo`). All five passed.
2. `npm run build:skupervisor`, `npm run build:pos`, `npm run build:store` — all three succeeded.
   `packages/web-core` is the shared trunk all three frontend apps consume via a `file:` dependency
   with no build step of its own, so all three had to be verified, not just one.
3. `apps/dgfy-api/tests/dgfyAffiliateReactivationUseCase.unit.test.js` (new) — 11/11 passed,
   covering the reactivation use case's slot-cap enforcement (including a concurrency case mirroring
   Phase 198's #1187 RF-1 regression test), the terminal-state guards (already-active,
   not-reactivatable), tenant scoping, and the audit-stamp/`activated_at` preservation.
4. `apps/dgfy-api/tests/dgfyAffiliateEnrollmentUseCases.unit.test.js` — 11/11 passed. Tests 3 and 4
   (previously asserting that `PATCH {status:'active'}` performs a stamp-preserving reactivation)
   were updated to assert the new `422 AFFILIATE_REACTIVATION_MOVED` rejection instead, since that
   behavior moved to the new endpoint this phase; test 8 was retitled per the plan (§3) to reflect
   that the D7 revocation_reason guard is now unreachable for `status: 'active'` bodies.
5. `apps/dgfy-api/tests/dgfyAffiliateRepository.slotEnforcement.unit.test.js` — 20/20 passed,
   unmodified — regression check confirming the pre-existing slot-cap enforcement on
   `createEnrollment`/`createInvite`/`materializeInviteEnrollment` is untouched by this phase.
6. No `AffiliatesWorkspacePanel.jsx` component test exists today (the only test under
   `packages/web-core/src/features/pos/__tests__/` touching this area,
   `affiliatePricingPreview.test.js`, is unrelated) and none was added — out of scope for this issue,
   noted explicitly here and in the PR body rather than left unstated.
7. **Preflight methodology note:** `preflight_request_ref` is `NOT-EXECUTED-PHASE-207` because this
   PR targets `develop`. Per `docs/compliance/request-time-preflight-protocol.md`, the live
   preflight sweep runs once per batch at the `develop → staging` promotion, not per-PR — this is
   expected and not a gap in this declaration.
