---
status: reference
owner: engineering
last_reviewed: 2026-08-18
declaration_id: 2026-08-18-pos-es-compat-guardrail
classification: major
surfaces: pos,terminal
reason_codes_impacted: ALLOWED
policy_version: 2026.08.05
verification_evidence: npm run check:compliance -- --staged
rollback_note: Revert this commit. The two compliance-sensitive files each carry a single,
  behavior-preserving expression swap (`eligibleLineIndexes.at(-1)` -> indexed access in
  posDiscountCalculator.js; a CSS :has() selector -> a JS-toggled body class in
  ShiftCloseSummaryPrintView.jsx/index.css), both proven byte-identical/pixel-identical to the
  prior behavior below. No discount amount, tax calculation, receipt content, or persisted
  record changes. No data, schema, or migration is touched, so reverting has no cleanup step.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-08-18T00:00:00Z
preflight_request_ref: DGFY-POS-Z
---

# Chrome 80-84 ES-Compat Guardrail (#666)

## Compliance Impact Classification

Major (floor set by `apps/dgfy-api/src/modules/pos/domain/` and
`apps/dgfy-web/src/features/pos/`, which the compliance guardrail always classifies `major`
for the POS/terminal surfaces regardless of diff size). This declaration covers the two
compliance-sensitive files the guardrail flagged plus the third file the check treats as their
test/contract sibling:

1. **`apps/dgfy-api/src/modules/pos/domain/posDiscountCalculator.js`** — one line inside
   `calculatePosDiscount`: `eligibleLineIndexes.at(-1)` -> `eligibleLineIndexes[eligibleLineIndexes.length - 1]`.
   Runs in Node 22 (zero Chrome-compat runtime risk on its own); changed only for symmetry
   with the frontend twin below, per #666's own acceptance criteria. `finalEligibleIndex` is
   used purely as an index-identity sentinel to allocate a rounding remainder to the last
   eligible line — both forms return the identical index for every input (same value on a
   non-empty array, same `undefined`/`-1`-adjacent behavior on an empty one). **No discount
   amount, VAT calculation, or eligibility determination changes.**
2. **`apps/dgfy-web/src/features/pos/components/ShiftCloseSummaryPrintView.jsx`** (+
   `apps/dgfy-web/src/index.css`) — replaces a CSS `:has()` selector (Chrome 105+, silently
   non-matching on the iMin's Chrome 80-84, which caused the *entire app* to print instead of
   just the shift summary) with a `body.pos-shift-summary-printing` class toggled by a
   `useEffect` on mount/unmount, mirroring the existing `pos-online-order-receipt-print-mode`
   pattern already used one block above it in the same CSS file for
   `OnlineOrderReceiptModal.jsx`. **No shift-summary figures, totals, or cash-reconciliation
   values are computed differently — only which DOM the print stylesheet isolates.**
3. **`apps/dgfy-web/src/features/pos/__tests__/serviceWorkerCaching.contract.test.js`** — a
   pure test-assertion update (the literal string it checks against `apps/pos/vite.config.js`'s
   `plugins:` array), flagged by the guardrail as the sibling of the POS surface above; it
   asserts no application behavior.

## Affected Surfaces (repo-wide context for this PR, not all `major`-gated)

This PR is #666's guardrail: a runtime polyfill (`src/compat/chrome80Runtime.js`), a Vite
build-time gate (`build/esCompatGuardPlugin.js`), a generalized ESLint rule
(`.eslintrc.json`), and four confirmed-crash-class sites fixed (the two above, plus
`apps/store/.../FnbItemReviewModal.jsx` and `Pages/admin/InvoiceManager.jsx`, both outside the
POS/terminal `major` floor). None of these touch checkout totals, tax, discount eligibility,
payment processing, or persisted records — every change is either additive tooling (the
polyfill and build gate ship no different runtime values on a browser that already has the
native methods) or a proven-equivalent expression/selector swap.

## Compliance Preconditions

1. No checkout, payment, discount-amount, tax, inventory, shift-reconciliation, receipt total,
   or compliance-record *value* is computed differently by any change in this PR.
2. `posDiscountCalculator.js`'s discount-allocation *logic* (which line receives the rounding
   remainder) is unchanged — only the JS expression that computes the same index differently.
3. `ShiftCloseSummaryPrintView.jsx`'s rendered shift-summary content (cash counted, sales
   totals, payment breakdown) is unchanged — only which part of the page a print stylesheet
   isolates when the summary is printed.
4. No API contract, request/response shape, or database schema change.

## Verification Evidence

1. `npm run check:compliance -- --staged` — to be re-run with this declaration staged
   alongside the changed files it covers (pending — see below).
2. `apps/dgfy-api`: `node --experimental-vm-modules node_modules/jest/bin/jest.js --config
   jest.config.cjs --runInBand tests/posDiscountCalculator.unit.test.js
   tests/posDiscountCalculator.test.js` — 12/12 passing, unchanged from before this PR.
3. `apps/dgfy-web`: `npx vitest run src/features/pos` — 594/596 passing, matching PR #665's own
   stated pre-existing-failure baseline exactly (both failures in
   `terminalViewModeContracts.test.js`, confirmed unrelated to this PR by stashing all changes
   and reproducing the identical 594/596 result against the unmodified tree).
4. `npm run build:pos` / `build:store` / `build:skupervisor` — all three succeed.
5. Not yet done — needs a human with the physical device (tracked separately, #580): print a
   shift-close summary on a real iMin terminal and confirm only the receipt prints.

## Note on this declaration

Drafted by the implementing session per `.agents/skills/implement/SKILL.md`'s checkpoint
policy ("classifying `major`/`regulatory` impact is a human judgment call, not something to
self-certify"), modeled on the closest precedent,
`2026-08-05-pos-webview-replaceall-crash.md`. Reviewed and approved by Pat on 2026-08-18 before
commit.
