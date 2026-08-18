---
status: reference
owner: engineering
last_reviewed: 2026-08-18
declaration_id: 2026-08-18-pos-webview-array-at-crash
classification: regulatory
surfaces: pos,terminal,discounts
reason_codes_impacted: ALLOWED
policy_version: 2026.08.05
verification_evidence: npm run check:compliance -- --staged
rollback_note: Revert this commit. The change is a one-line swap from `eligibleRows.at(-1)` to `eligibleRows[eligibleRows.length - 1]`, plus an explanatory comment -- byte-identical behavior for every input (proven below: same object reference on a non-empty array, same `undefined` on an empty one). No data, schema, or persisted state is touched, so reverting has no migration or cleanup step.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-08-18T07:15:00Z
preflight_request_ref: DGFY-POS-Y
---

# POS WebView `Array.prototype.at` Compatibility Fix

## Compliance Impact Classification

Regulatory (floor set by `apps/dgfy-web/src/features/pos/components/POSCheckoutTerminal.jsx`,
which the compliance guardrail treats as `regulatory` because it computes discount/VAT allocation
feeding BIR-relevant receipt totals). The change is one line inside `calculateGovernedDiscount`:

```diff
-        const lastEligibleLine = eligibleRows.at(-1);
+        // Chrome 80-84 iMin POS WebView has no Array.prototype.at (ES2022 / Chrome 92+). See DGFY-POS-Y (#664).
+        const lastEligibleLine = eligibleRows[eligibleRows.length - 1];
```

`lastEligibleLine` is used exactly once downstream, at line 222, as a **reference-identity
sentinel** (`line === lastEligibleLine`) that makes the last eligible cart line absorb the rounding
remainder (`discountAmount - allocatedDiscount`), so per-line discount allocations sum exactly to
the header discount total -- a property the receipt's line/header reconciliation depends on.

`Array.prototype.at(-1)` and `arr[arr.length - 1]` are equivalent for this call site:

1. **Non-empty array**: both return the same element by reference (not a copy). The identity
   comparison at line 222 is unaffected.
2. **Empty array**: `[].at(-1)` returns `undefined`; `[][-1]` also returns `undefined`. No cart row
   will ever `=== undefined`, so the remainder branch behaves identically (never fires) in both
   forms.

No discount amount, tax computation, reason code, or audit record is read, written, or
reclassified differently by this change.

## Affected Surfaces

1. **Root cause**: `apps/dgfy-web/src/features/pos/components/POSCheckoutTerminal.jsx`'s
   `calculateGovernedDiscount` crashed (Sentry `DGFY-POS-Y`) rendering the checkout terminal's
   discount preview for every non-statutory (percentage or fixed) discount, because the iMin
   Android WebView (Chrome 80-84) has no `Array.prototype.at` (ES2022 / Chrome 92+). Unlike the
   #271 incident (one panel), this crash is caught by the page-level ErrorBoundary, so the entire
   checkout terminal is replaced by the error screen -- cashiers cannot transact at all.
2. **Fix**: the single call site above. No other file changed.

## Compliance Preconditions

None. This is a pure runtime-compatibility fix with proven identical output; no reason-code
routing, audit trail, or filing logic is touched, and no precondition gate needs to change.

## Verification Evidence

- `npm run build:pos` succeeds; the emitted `POSCheckoutTerminal-*.js` chunk contains zero
  occurrences of `.at(-1)` (confirmed via `grep -c ".at(-1)"` against the built artifact).
- `npx eslint src/features/pos/components/POSCheckoutTerminal.jsx` -- 0 errors (8 pre-existing
  warnings, none introduced by this change).
- `npx vitest run src/features/pos` -- 594/596 tests pass; the 2 failures
  (`terminalViewModeContracts.test.js`, receipt PHP-formatting assertions) are pre-existing and
  reproduce identically on unmodified `origin/main` -- confirmed by stashing this change and
  re-running the same suite.
- Manual verification pending on a real iMin device post-deploy: apply both a percentage and a
  fixed-amount discount and confirm the terminal renders totals instead of the error screen, and
  that a multi-line fixed discount's line amounts sum exactly to the header discount.
