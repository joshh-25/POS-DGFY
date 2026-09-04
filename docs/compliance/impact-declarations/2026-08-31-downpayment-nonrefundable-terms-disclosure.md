---
status: reference
owner: engineering
last_reviewed: 2026-08-31
related_adr: docs/architecture/adr/0070-downpayment-authorization-across-workflow-modes.md
declaration_id: 2026-08-31-downpayment-nonrefundable-terms-disclosure
classification: major
surfaces: payments
reason_codes_impacted: ALLOWED
policy_version: 2026.08.31
verification_evidence: apps/dgfy-storefront/src/__tests__/downpaymentTermsDocument.test.js (5 passed, new -- version identifier pinned, store-cancellation refund carve-out asserted present, pending-legal-review notice asserted present in the internal markdown doc and absent from the customer-facing plain text, and a byte-for-byte sync check between the rendering module and the committed docs/legal draft),apps/dgfy-storefront/src/__tests__/downpaymentTermsDisclosure.test.jsx (4 passed, new -- link shown only when refundable === false, absent when refundable or unknown, dialog opens over a still-mounted checkout step and closes back to it with no review-status banner rendered to the customer, and no checkbox or "I agree" control exists),apps/dgfy-storefront storefrontDownpaymentPresentation.test.js + downpaymentTrackingSummary.test.jsx + useCheckoutTotalsAndGating.downpayment.test.js (34 passed -- unchanged existing downpayment coverage),npm run build:store (real Vite build, succeeded, re-verified independently by the implementing session),npx eslint on every new/changed file (0 errors),npm run check:compliance (PASS -- reports no compliance-sensitive changes; this declaration is voluntary, see below),npm run check:architecture (OK),npm run lint:docs (OK -- 29 governed docs, 84 ADRs)
rollback_note: Revert this PR's diff. No migration, no schema change, no API change, and no backend file touched. The only behavioural change is a storefront link plus an overlay rendering static text, both gated on the pre-existing `refundable === false` condition; reverting restores the Phase 144 (#824) neutral placeholder note exactly as it was, and no persisted state anywhere references the terms version, since recording acceptance is deliberately out of scope (#1086).
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-09-02T03:56:16.394Z
preflight_request_ref: PREFLIGHT-33588602895-2026-08-31-DOWNPAYMENT-NONREFUNDABLE-TERMS-DISCLOSURE
---

# Non-refundable downpayment terms: versioned draft, linked at the downpayment step (#1220)

## Compliance Impact Classification

**Major — declared voluntarily.** `scripts/check-compliance-impact.js` matches no rule against this
diff: every changed code file lives under `apps/dgfy-storefront/src/`, which is not in
`COMPLIANCE_SENSITIVE_RULES`. The gate reports `No compliance-sensitive changes detected`, and this
declaration is filed anyway rather than skipped.

The reason is the substance, not the pattern list. The existing
`docs/compliance/impact-declarations/2026-08-22-downpayment-refund-and-forfeiture.md` classifies
this same money path `major` and states outright that it is *"the first code path in this codebase
where a customer's captured funds are deliberately not returned."* That declaration's Compliance
Precondition 9 recorded the open gap this PR closes: *"the non-refundable disclosure string is
unchanged; #280 (T&C lawyer review) remains open with no Storefront ToS and no refund policy in the
codebase."* Changing what a customer is told, before they fund a forfeitable downpayment, is a
change to that surface's legal disclosure and is treated at the same floor.

## Affected Surfaces

1. `apps/dgfy-storefront/src/shared/model/downpaymentTermsDocument.js` (**new**) — the single
   source of the exact terms text, as plain data (no JSX inside the strings). Exports
   `DOWNPAYMENT_TERMS_VERSION` (`downpayment-nonrefundable-v1`), an effective date, the sections,
   `renderDownpaymentTermsPlainText()` (the form #1086 will hash), and
   `renderDownpaymentTermsMarkdown()` (what the in-repo draft is generated from).
2. `docs/legal/downpayment-nonrefundable-terms-v1.md` (**new**, new `docs/legal/` directory) — the
   reviewable, diffable copy for the CEO/lawyer review Pat is running directly. Generated from (1)
   and pinned byte-for-byte by a test, so the two cannot drift.
3. `apps/dgfy-storefront/src/shared/components/checkout/DownpaymentTermsModal.jsx` (**new**) — the
   overlay that renders the terms over the in-progress checkout step, with the version and
   effective date in its header and the pending-legal-review notice above the body.
4. `apps/dgfy-storefront/src/shared/components/checkout/DownpaymentPaymentCallout.jsx` — the one
   shared callout already rendered by all three checkout modes (Simple, F&B, Retail) gains the
   terms link, on the existing `refundable === false` gate. One gate, not two.
5. `apps/dgfy-storefront/src/shared/model/storefrontDownpaymentPresentation.js` — **comment only**.
   The `NON_REFUNDABLE_DOWNPAYMENT_NOTE` string is unchanged; the comment above it now records that
   the line is the summary rather than the whole disclosure, and that #280 is still its owner.

## Compliance Preconditions

1. **The disclosure is presented before the customer initiates payment**, at the downpayment step
   itself — the callout renders under the payment-method selector on all three modes' payment
   steps, not in a receipt, not post-payment.
2. **It is not a gate, deliberately.** No checkbox, no "I agree" control, no disabled pay action on
   an unread state, and nothing reports back to the caller that the terms were opened. This is
   Pat's explicit scope boundary in #1220; capturing acceptance is #1086's job. Pinned by a test
   asserting no `checkbox` role and no "I agree" text exists.
3. **Opening the terms cannot lose checkout state.** An overlay, not a route — the checkout step
   stays mounted underneath, asserted by a test that the downpayment amounts are still rendered
   while the dialog is open.
4. **The gate matches the mechanism exactly.** The link rides `refundable === false` by strict
   equality — the same condition the forfeiture branch itself uses
   (`commerceOrderLifecycleUseCase.js`, ADR 0069 clause 8 / ADR 0070) and the same condition the
   existing neutral note uses. A `null`/unknown policy shows no terms, because an unknown policy
   refunds.
5. **The terms do not overstate what the store may keep.** They state that only the downpayment is
   affected and that the full order total is never kept or charged for a cancelled order — matching
   ADR 0069 clause 1b `[binding]` and the Phase 141/144 implementation.
6. **The store-side carve-out is disclosed, not hidden.** The terms state that a store-initiated
   reject or cancel refunds in full even at a non-refundable store — which is what the code does.
7. **Versioned from day one.** `downpayment-nonrefundable-v1` ships with the text, so #1086 can
   record which version was shown plus a hash of the exact text without a rewrite. When #280's
   reviewed wording lands, the correct action is a **new version**, not an in-place edit of v1.
8. **The draft/pending-review status is recorded internally, not as a customer-facing banner.**
   Pat's deliberate override of #1220's own instruction (2026-08-31): the modal does **not** show a
   pending-legal-review notice to the customer — that status lives only in the module header
   comment, the `docs/legal/` doc's front matter (`status: draft`,
   `legal_review_status: pending (#280)`), and this PR body. A test pins this: the customer-facing
   plain text and the rendered dialog both assert the absence of review-status language, while the
   internal reviewable markdown doc asserts its presence. This PR does not close #280, and nothing
   downstream should treat this wording as legally cleared.

## Verification Evidence

See the `verification_evidence` front-matter field for the itemized list. Summary: 9 new tests
across two new files, all passing; 34 existing downpayment tests unchanged and passing; a real
`npm run build:store`; eslint clean on every changed file; `check:compliance`,
`check:architecture`, and `lint:docs` all green.

Outstanding before merge:

- **The terms text itself is an unreviewed draft.** Pat reads it himself first, then runs the
  CEO/lawyer review directly. Nothing downstream should treat this wording as cleared.
- **`POST /api/v1/compliance/preflight` has not been executed** — front matter carries
  `NOT-EXECUTED-1220-2026-08-31`, which is expected on a `develop`-targeting PR per
  `docs/compliance/request-time-preflight-protocol.md`; the live sweep runs once per batch at
  promotion time.
- **No live mobile-device pass.** Layout was built mobile-first (full-width overlay capped at
  520px, `85vh` max height with the body scrolling inside it, 44px close target) and verified only
  in jsdom and the Vite build — not on a real handset.
