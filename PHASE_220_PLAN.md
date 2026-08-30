# Phase 220 — POS In-Store Affiliate Attribution: Re-verify Enrollment at Commit Time (#1199)

**Issue:** #1199 — *POS in-store affiliate attribution: decide whether a mid-checkout revocation
should drop the commission or honor the validated code*
**Epic:** #446 (Affiliate program v2) · **Refs:** #450 (decision D2), #1200 / Phase 206 (the
storefront twin of this fix), #449 (Phase 208), #448 (Phase 209)
**Planned against:** `origin/develop @ 7d31d9923` (fetched 2026-08-31)
**Phase number:** 220 — the next continuous number in
`docs/features/IMPLEMENTATION_PHASE_LEDGER.md`. Highest ledgered is 219 (#1220); 217 and 218 are
claimed by in-flight sibling work (a `surebiz-phase217-plan` worktree exists on this machine). See
J8.
**Status of this document:** plan only. No implementation code was written.

---

## 0. READ FIRST — every open judgment call

Pat already made the core product call on #1199 (2026-08-31): *re-verify at commit time; on a
revocation in the window the sale completes normally and no commission accrues.* That question is
closed and is **not** reopened anywhere below. What follows is what is left — almost all of it
implementation detail — plus **one genuinely new finding (J6/F5) that Pat should see**, because it
changes what this phase actually buys until a second, separate defect is fixed.

| # | Call | Who owns it | This plan's position |
|---|---|---|---|
| **J1** | **Re-verify by enrollment id or by affiliate code?** | Mine — engineering | **By id**: `resolveActiveAffiliateEnrollmentById({ tenantId, enrollmentId })`. It pins the *same* enrollment the cashier's code resolved to at entry, mirrors Phase 206 byte-for-byte, and is already exported from the module POS imports from. Re-resolving by code would re-run the lookup and could, in principle, land on a different enrollment. §4.1. |
| **J2** | **Does Phase 206 expose a reusable helper, or does POS need its own?** | Mine — engineering | **Reusable, already.** `resolveActiveAffiliateEnrollmentById` lives in `apps/dgfy-api/src/modules/dgfy/utils/affiliateCommissionAccrual.js` — the same file `posUseCases.js` already imports `accrueEarnedForInStoreSale` and `resolveActiveAffiliateEnrollment` from. **No new helper, no new abstraction, no shared-wrapper refactor.** The POS-specific part is two lines of glue (the guard shape in J3 and the log line), not a function. §3. |
| **J3** | **Guard shape for the drop log** | Mine — engineering | **A bare `else`, not Phase 206's `else if (affiliatePricing?.enrollment)`.** That extra condition exists on storefront solely to avoid logging the common case of an attribution cookie that was *already* stale at pricing time. POS has no such case: an unresolvable code hard-rejects with `422 AFFILIATE_CODE_INVALID` before any write. On POS, a null re-check **is** an in-flight drop, always. §4.2. |
| **J4** | **Where in the transaction does the re-verify go?** | Mine — engineering | **After `transaction.commit()` (`posUseCases.js:4399`), inside the existing `if (affiliateEnrollment) { try { … } }` block, immediately before `accrueEarnedForInStoreSale`.** Not pre-commit: a pre-commit check leaves a residual window *and* invites someone to turn it into a hard failure, which would contradict Pat's decision that the sale completes normally. §4.1, and note the `ownsTransaction === false` caveat in F8. |
| **J5** | **Does a drop surface anything to the cashier (receipt line, response flag, printed warning)?** | Pat's, but already answered | **No.** #1199's decision says the sale "still completes normally." The `ok({...})` payload, the receipt contract, and the transaction row are all untouched. A `logger.warn` is the entire operator-visible footprint (i.e. none, at the counter). Stated explicitly so it isn't quietly added later. |
| **J6** | **F5: `affiliate_code` is stripped by the POS request validator — fix it here?** | **Mine to recommend, Pat's to sequence — and the one thing in this plan worth his attention** | **No — hand to `pm` as its own issue; do not fold into this PR.** `checkoutPosSchema` (`posValidator.js:143`) declares no `affiliate_code` and carries no `.unknown(true)`, and `validateSchema` runs `stripUnknown: true`. The POS UI *does* send the field (`usePosCheckoutWorkflow.js:1275`). So on the primary `POST /pos/checkouts` route the code never reaches the use case and **no in-store commission has ever accrued through it.** Adding the key is a money-affecting feature restoration with its own validation shape, its own tests, and its own blast radius — bundling it with a semantics change would make one PR both "turn attribution on" and "change what attribution does," which is bad to review and worse to revert. **Consequence stated plainly: until that issue ships, Phase 220 only bites on the split-payment and mobile-sync paths (F6).** Phase 220 is still worth shipping first — it puts the correct semantics in place *before* the path is switched on, rather than after. §9 item 1. |
| **J7** | **ADR 0036 amendment?** | Mine | **Yes — one small dated `## Amendments` block, in this PR.** Phase 206 shipped the storefront half without recording it in ADR 0036; this phase completes the rule across both channels, and the ADR currently documents neither. ADR 0039 route: `[default]`/untagged — ADR 0036's only `[binding]` clause is Decision 2 (rate snapshotting/integer centavos), which nothing here touches. §8. |
| **J8** | **Phase numbering** | Mine, needs a sanity check | **220.** Ledger's highest is 219 (#1220). 217/218 are in flight in a sibling worktree and are not ledgered yet — do not reuse them, and do not renumber this to 217 if the ledger still looks empty there when you start. |
| **J9** | **Test approach** | Mine — engineering | **A new file, `apps/dgfy-api/tests/posCheckoutAffiliateAttribution.unit.test.js`.** Mirrors Phase 206's method (mock `dgfyAffiliateRepository` at the module level, real resolver/accrual logic runs) on top of the harness `posCheckoutFnbContracts.usecase.test.js` already proves works for `buildCheckoutPosUseCase` with zero DB. Do **not** extend that 2,253-line FnB file, and do **not** extend `affiliateCommissionAccrual.unit.test.js` — that tests the util, not the POS wiring. §6. |
| **J10** | **Do the split-payment (`ownsTransaction === false`) and mobile-sync paths need separate handling?** | Mine | **No separate code.** Both enter the same `buildCheckoutPosUseCase` body and hit the same accrual block, so one edit covers all three entry points. But F8's pre-existing rollback hazard on the split-payment path is real and is named in §9 rather than silently inherited. |

---

## 1. Documentation read before planning (per `AGENTS.md`'s lookup order)

1. `docs/START_HERE.md`, `docs/architecture/ARCHITECTURE_BOUNDARIES.md` — the
   `routes → controllers → usecases → repositories → models` chain; this phase edits one use case
   and adds no new layer.
2. `docs/architecture/ARCHITECTURE_GOVERNANCE.md`, **ADR 0039** (clause strictness tiers) — the
   route J7 uses.
3. **ADR 0036** — *Affiliates Program: Commission Ledger, Attribution, and Cashout*,
   `status: amended`, `authority_level: authoritative`, `last_reviewed: 2026-09-01`,
   `review_by: 2027-01-24` (**not** decayed). Only `[binding]` clause: **Decision 2** (integer
   centavos, bps, rate snapshotting) — untouched here. Decision 4 ("in-store earns immediately,
   online is pending until settled") is the clause this phase operates under, and it is untagged,
   i.e. `[default]`.
4. **ADR 0050** — *Affiliate Buyer-Facing Pricing Rule Engine*, `status: amended`. Read and
   **explicitly not engaged**: POS in-store affiliate codes do not change price at all (F2), so no
   pricing clause is in play.
5. `docs/features/IMPLEMENTATION_PHASE_LEDGER.md` — Phase 206 entry in full, plus 208/209/219
   headings (`grep '^## Phase'` only; the file is ~13k lines).
6. `docs/compliance/impact-declarations/2026-08-30-affiliate-attribution-commit-time-recheck.md`
   — Phase 206's declaration, the structural template for this phase's (with a different
   classification surface; see F10).
7. `docs/process/ISSUE-TAXONOMY.md` — the `Closes` vs `Refs` rule (§8).
8. `AGENTS.md` and `.agents/skills/implement/SKILL.md`, both in full.
9. GitHub: #1199 body **and its 2026-08-31 decision comment**; PR #1200's full diff.

---

## 2. Ground truth — what the code actually does today

All verified against `origin/develop @ 7d31d9923`, not from #1199's summary. #1199's own line
numbers (`~L2955`, `~L4368`, `~L4375`, recorded against `e6680a5e6`) have all shifted; the numbers
below are current.

### F1 — The exact geometry, re-verified

| Point | Location today | #1199 said |
|---|---|---|
| Import block for the affiliate util | `posUseCases.js:16-21` | — |
| Resolve + hard 422 gate | `posUseCases.js:2977-2990` (`affiliateCodeInput` at 2980, `resolveActiveAffiliateEnrollment` at 2981-2983, `DomainError` 422 `AFFILIATE_CODE_INVALID` at 2984-2990) | ~L2955-2956 |
| The real `transaction.commit()` | `posUseCases.js:4399` | ~L4368 |
| Accrual block | `posUseCases.js:4401-4429` (`if (affiliateEnrollment)` at 4404, `accrueEarnedForInStoreSale` at 4406) | ~L4375 |

There are **three** `if (ownsTransaction) await transaction.commit();` sites in this function, not
one: `:3166` (idempotent replay), `:3850` (`quoteOnly`), and `:4399` (the real checkout). The first
two `return` before the accrual block is ever reached, so **only `:4399` matters** and no second
re-verify site is needed. Note that the `quoteOnly` path still runs the 2977-2990 gate, which is why
the cashier gets "code accepted" feedback at quote time as well as at checkout.

### F2 — On POS, the affiliate enrollment affects **nothing but the commission**

`affiliateEnrollment` appears at exactly four lines in the whole file: 2981 (assignment), 2984 (the
422 gate), 4404 (the accrual guard), 4408 (passed to `accrueEarnedForInStoreSale`). It touches no
price, no discount, no VAT, no receipt field, no persisted transaction column.

This is a real divergence from storefront, and it makes this phase *strictly simpler* than Phase
206: there, the enrollment also drove an ADR 0050 price rule, so the fix had to argue carefully
that buyer pricing stayed untouched. Here there is no pricing entanglement to argue about — the
drop is purely a bookkeeping decision, invisible on the receipt either way.

### F3 — Phase 206's helper is already shared, already imported-adjacent

`resolveActiveAffiliateEnrollmentById` (`affiliateCommissionAccrual.js:418-431`) is exported from
the same module `posUseCases.js` already imports three symbols from. It takes `{ tenantId,
enrollmentId, repository }`, checks `settings.program_enabled`, then `findEnrollmentById`, then
`enrollment?.status === 'active'`, returning `null` otherwise and never throwing. That is exactly
the gate this phase needs, with nothing storefront-specific in it. **J2 is settled by this file, not
by a design preference.**

Its by-code twin `resolveActiveAffiliateEnrollment` (`:253-265`) applies the same two conditions —
`program_enabled` plus a `status: 'active'` filter inside
`findActiveEnrollmentByShareCode` (`dgfyAffiliateRepository.js:791-800`) — so the entry-time gate
and the commit-time gate are semantically identical. Nothing new is being enforced; only *when*.

### F4 — A silent post-commit withhold is already shipped **on this exact POS path**

#1199's objection 1 ("the operator was already told the code was valid, so a silent drop
contradicts that feedback") is already answered by shipped behavior, not by this plan's opinion.
Phase 208 (#449) put a lifetime earnings cap inside `accrueEarnedForInStoreSale`
(`affiliateCommissionAccrual.js:371-380`): when the cap is reached, the sale stands, attribution is
still recorded, the commission is withheld, and a `logger.warn` is emitted. Its own in-code comment
names the convention it follows — *"Same 'silent drop, buyer unaffected' convention as the #450 D2
in-flight attribution drop in `storeUseCases.js`."*

So an in-store sale can *already* be validated at the counter and still accrue zero commission.
Phase 220 adds one more reason to an existing behavior; it does not introduce a new class of it.

### F5 — **New finding: `affiliate_code` is stripped on the primary POS route**

- `checkoutPosSchema` (`apps/dgfy-api/src/validators/posValidator.js:143`, closing at `:252`)
  declares **no** `affiliate_code` key and ends with `.custom(...).messages(...)` — **no
  `.unknown(true)`**.
- `validateSchema` (`posValidator.js:1155-1159`) validates with `stripUnknown: true`.
- `router.post('/checkouts', …, validatePosCheckout, …)` (`apps/dgfy-api/src/routes/pos.js:185`).
- The handler reads `req.validatedData || req.body` (`posHandlers.js:863`) — the stripped object.
- The POS UI **does** send it: `packages/web-core/src/features/pos/hooks/usePosCheckoutWorkflow.js:1275`,
  `affiliate_code: affiliateCodeInput.trim() || undefined`, fed from the code field rendered at
  `POSCheckoutTerminalView.jsx:1217`.

**Net: on `POST /pos/checkouts`, the cashier can type a valid affiliate code, see no error, and no
attribution or commission is ever created.** This is a separate, pre-existing defect from #1199's
subject — and it means #1199's framing ("the cashier is explicitly told the code is valid before the
sale proceeds") does not hold on that route either: the 422 gate at 2977-2990 can never fire there,
because `affiliateCodeInput` is always empty. Handled per J6 / §9 item 1.

### F6 — Two paths that **do** reach the use case with a live `affiliate_code`

1. **Split-payment completion.** `createPosPaymentSessionSchema.snapshot` (`posValidator.js:329-340`) is
   `Joi.object({...}).unknown(true)` (`posValidator.js`), the UI puts `affiliate_code` into that
   snapshot (`POSSplitPaymentWorkflow.jsx:62`), and `buildCompletionCheckoutPayload` rebuilds the
   checkout payload with `{ ...sourceSnapshot, … }` (`splitPaymentUseCases.js:1075-1076`), which
   carries the field straight through. **Live.**
2. **Mobile POS offline sync.** `mobilePosCheckoutSyncEntrySchema` is
   `{ local_transaction_id, payload: Joi.object().required().unknown(true) }`
   (`posValidator.js:930-933`), and `syncMobilePosCheckouts` passes that payload verbatim to
   `checkoutPosUseCase` (`mobilePosUseCases.js:371-375`). **Live.**

### F7 — The mobile-sync path carries a worse failure than the one #1199 asks about

On the sync path the *server-side* resolve and commit are still milliseconds apart, so #1199's
"no external latency" observation survives for the window this phase fixes. But the cashier's code
entry happened offline, at time T0, with **no** server validation at all; the 422 gate first runs at
sync time, T1. If the affiliate was revoked between T0 and T1, **the hard 422 rejects the entire
synced sale** — `syncMobilePosCheckouts` records it as `status: 'rejected'` and the transaction is
never created (`mobilePosUseCases.js`, the `rejectedEntries` branch). A completed, tendered,
receipted offline sale is lost, not merely uncommissioned.

That is a bigger defect than #1199's, it is out of this phase's scope (it lives at the *entry* gate,
not in the resolve→commit window), and it gets its own issue — §9 item 2. Naming it here is
deliberate: this phase makes the resolve→commit window safe and would otherwise read as if the whole
revocation story on POS were now closed. It isn't.

### F8 — On the split-payment path the accrual is **not** actually post-commit

`buildCompletePosPaymentSessionUseCase` passes its own `transaction` into `checkoutPosUseCase`
(`splitPaymentUseCases.js:1170-1175`), so `ownsTransaction === false` and the `:4399` commit is a
no-op. The accrual block therefore runs while the outer transaction is still open, and the caller
can *still* throw `POS_PAYMENT_SESSION_TOTAL_CHANGED` afterwards and roll back
(`splitPaymentUseCases.js:1196-1206`, rollback at `:1213`). Commission and attribution rows live in
the landlord DB on a different connection, so that rollback does not remove them.

Two consequences, both stated rather than assumed away:

- **This is pre-existing** and this phase neither creates nor worsens it. The re-verify can only
  ever *reduce* the number of rows written. §9 item 3 hands it off.
- **The re-verify itself is safe under it.** It reads landlord tables on the default connection,
  never the tenant transaction, so there is no snapshot-isolation or read-your-own-write concern —
  the same reasoning Phase 206 recorded, holding for a different reason (there: the transaction had
  already committed; here: it is a different connection entirely). Phase 198's RF-6 locking finding
  does not apply; **no lock, no `FOR UPDATE`, no transaction handle.**

### F9 — Accrual is already idempotent, so a second lookup adds no race

`accrueEarnedForInStoreSale` writes through `createEarnedCommissionIfMissing`, guarded by the
commission ledger's unique `(tenant_id, order_reference)` index. Re-resolving the enrollment adds one
`SELECT` on `dgfy_affiliate_settings` and one on `dgfy_affiliate_enrollments` per attributed in-store
sale — and only for sales that actually carry a code. Unattributed sales (the overwhelming majority)
add zero queries.

### F10 — Compliance: `major`, surfaces `pos,terminal` — **not** Phase 206's `payments`

`scripts/check-compliance-impact.js:34-38`:
`{ pattern: /^apps\/dgfy-api\/src\/modules\/pos\//, surfaces: ['pos','terminal'], minimumClassification: 'major' }`.
Copying Phase 206's declaration verbatim would fail the classifier's surface check. A declaration
**is** required.

---

## 3. The change, stated in one paragraph

Inside the existing post-commit accrual block, re-resolve the enrollment by id against the database
and accrue against *that* object instead of the entry-time one. If it comes back `null` — revoked,
suspended, or the tenant's program disabled since the cashier typed the code — skip the accrual,
log a warn, and return the successful sale unchanged. Two edits in one file, plus one import.

That is the whole engineering surface. Everything else in this plan is tests, governance paperwork,
and the two out-of-scope defects found while verifying it.

---

## 4. Design

### 4.1 The import and the re-verify call

`posUseCases.js:16-21` — add one named import, alphabetical position matching the existing block:

```
 import {
     accrueEarnedForInStoreSale,
     resolveActiveAffiliateEnrollment,
+    resolveActiveAffiliateEnrollmentById,
     reverseAffiliateCommissionForOrder,
     settleAffiliateCommissionForOrder
 } from '../../dgfy/utils/affiliateCommissionAccrual.js';
```

Then, in the block at `:4401-4429`, immediately after `if (affiliateEnrollment) { try {` and before
`await accrueEarnedForInStoreSale({`:

```
const verifiedEnrollment = await resolveActiveAffiliateEnrollmentById({
    tenantId,
    enrollmentId: affiliateEnrollment.enrollment_id
});
```

…and pass `enrollment: verifiedEnrollment` to `accrueEarnedForInStoreSale`, inside an
`if (verifiedEnrollment) { … } else { … }` (J3).

**Why by id and not by code (J1):** the entry-time resolve already produced the enrollment identity;
re-resolving by code would re-run a `share_code_hash` lookup and, if a code were ever reassigned,
could attribute the sale to a different affiliate than the one the cashier's code named. No
share-code rotation endpoint exists today, so this is defensive rather than live — but by-id costs
nothing, mirrors Phase 206 exactly, and removes the question. It is also *sharper for testing*: the
two lookups hit two different repository methods (`findActiveEnrollmentByShareCode` at entry,
`findEnrollmentById` at re-verify), so a test can pin the new behavior by asserting the second
method is called at all — an assertion that is impossible to satisfy against pre-Phase-220 code
(§6, T1).

### 4.2 The drop branch

```
} else {
    logger.warn('[PosUseCases] Affiliate attribution dropped: enrollment inactive at commit', {
        tenantId,
        posTransactionId,
        enrollment_id: affiliateEnrollment.enrollment_id
    });
}
```

- **A bare `else`, not `else if` (J3).** On storefront, a null re-check is ambiguous between "went
  stale in the window" and "was already stale when the cookie was read"; the `else if` guard
  disambiguated. On POS the entry-time 422 makes the second case unreachable, so every null here is
  the in-flight case worth logging.
- **Field naming:** match the surrounding block's existing keys (`tenantId`, `posTransactionId`
  camelCase, as at `:4423-4427`), not `storeUseCases.js`'s snake_case. Consistency within the file
  wins over consistency with the twin.
- **Message string:** deliberately parallel to storefront's, differing only in the `[PosUseCases]`
  prefix, so both channels' drops are greppable with one pattern.
- Placed **inside** the existing `try`, so the existing `catch` at `:4422-4428` still guarantees
  nothing here can fail a sale that already succeeded.

### 4.3 What deliberately does not change

- The `422 AFFILIATE_CODE_INVALID` gate at `:2977-2990`. An invalid code at *entry* still hard-
  rejects, unchanged — this phase governs only the window after that gate has passed.
- The `ok({...})` response, the receipt contract, and every persisted transaction column.
- The idempotent-replay (`:3142-3184`) and `quoteOnly` (`:3849`) branches — both return before the
  accrual block. A replay must not re-accrue, and does not.
- `accrueEarnedForInStoreSale`'s signature and internals, including the Phase 208 cap and Phase 209
  category ladder. It receives a fresher enrollment object; nothing about how it uses one changes.
- No lock, no `FOR UPDATE`, no transaction handle on the re-verify (F8).

---

## 5. Implementation order

1. `posUseCases.js` — the import (§4.1).
2. `posUseCases.js` — the re-verify + `else` branch (§4.1, §4.2), with a comment citing #1199, its
   2026-08-31 decision, and Phase 206 as the storefront twin.
3. `apps/dgfy-api/tests/posCheckoutAffiliateAttribution.unit.test.js` — new (§6).
4. `docs/compliance/impact-declarations/2026-08-31-pos-affiliate-attribution-commit-time-recheck.md`
   — new, `classification: major`, `surfaces: pos,terminal` (F10).
5. ADR 0036 `## Amendments` block (§8, J7).
6. `docs/features/IMPLEMENTATION_PHASE_LEDGER.md` — Phase 220 entry, `status: in_progress` at
   PR-open.
7. Tier 0 self-verify: `node --check` on `posUseCases.js` (this app has no build step; a full
   `npm test` of the new file is Tier 2 and worth running here because the file is new).
8. Branch `feature/1199-pos-affiliate-commit-time-recheck` off fresh `origin/develop`; PR into
   `develop`; `Refs #1199` (§8).

Batch the commits by domain per `docs/ai/PR.md`: (a) the use-case change, (b) the test, (c) the
compliance declaration + ADR amendment + ledger.

---

## 6. Tests

**File:** `apps/dgfy-api/tests/posCheckoutAffiliateAttribution.unit.test.js`, new.

**Harness (proven, not invented):** `posCheckoutFnbContracts.usecase.test.js` already drives
`buildCheckoutPosUseCase` with zero DB — a hand-built `posRepository` fake, a fake transaction
object with `commit`/`rollback`/`finished`, and `dbStore.run({ tenantId, …, sequelize }, …)`. Copy
that scaffolding.

**Mocking (Phase 206's method):** `jest.unstable_mockModule` on
`../src/modules/dgfy/repositories/dgfyAffiliateRepository.js` **and** `../src/config/logger.js`
before the dynamic `import` of `posUseCases.js`. Because ESM resolution is cached, both
`posUseCases.js` and `affiliateCommissionAccrual.js` receive the same mock — so the real resolvers
and the real accrual logic execute, and only the DB boundary is faked. That is the property that
makes these tests meaningful rather than tautological.

Repo mock needs at minimum: `getSettings`, `findActiveEnrollmentByShareCode`, `findEnrollmentById`,
`recordAttribution`, `createEarnedCommissionIfMissing`, `listActiveCategoryRatesForEnrollment`, and
whatever `evaluateEarningsCap` reads (leave the cap unset so it never trips).

| # | Case | Assertions |
|---|---|---|
| **T1** | Still active at commit | `result.success === true`; `createEarnedCommissionIfMissing` called once with the right `enrollmentId`; **`findActiveEnrollmentByShareCode` called once AND `findEnrollmentById` called once** — the second is the assertion that fails against pre-Phase-220 code, the direct analogue of Phase 206's `toHaveBeenCalledTimes(2)`; no drop warn. |
| **T2** | Revoked between entry and commit (`findEnrollmentById` → `{ …, status: 'revoked' }`) | `result.success === true` and a full transaction object returned; `createEarnedCommissionIfMissing` **not** called; `recordAttribution` **not** called; drop warn fired exactly once with `tenantId` / `posTransactionId` / `enrollment_id`. |
| **T3** | Suspended between entry and commit (`status: 'suspended'`) | Same as T2. Cheap, and it pins that the gate is `status === 'active'` rather than `!== 'revoked'` — the failure mode a careless `!==` would introduce. |
| **T4** | Program disabled between entry and commit | `getSettings.mockResolvedValueOnce(enabled)` then `.mockResolvedValue(disabled)` (Phase 206's exact ordering trick — `getSettings` is read by the entry resolve, the re-verify, *and* the accrual). Same assertions as T2. |
| **T5** | Regression baseline: no `affiliate_code` on the payload | Neither lookup called; no drop warn; sale succeeds. |
| **T6** | Regression baseline: invalid code at **entry** | Still `422` / `reason_code: 'AFFILIATE_CODE_INVALID'`; `findEnrollmentById` never called; transaction rolled back, nothing accrued. Guards the pre-commit gate against being "simplified away" now that a commit-time check exists. |
| **T7** | The sale is unaffected by a drop | On T2's setup, assert `createTransactionWithLines` was called with the same totals as the T1 run and the returned transaction is complete. This is the POS analogue of Phase 206's "buyer still pays the discounted price" test — weaker by construction, because on POS the code never affected price at all (F2), but worth one assertion to make F2 executable rather than a claim in a doc. |

**Tier 0 (`implement`'s required tier):** `node --check apps/dgfy-api/src/modules/pos/usecases/posUseCases.js`.
No `package.json` touched, so no lockfile step. Post Tier 0 in the PR body's `## Testing Evidence`;
post the Jest run (Tier 2) as a PR comment per the skill.

---

## 7. DO NOT

1. **Do not make the commit-time re-check throw, or fail the sale in any way.** Pat's decision is
   explicit: the sale completes normally. A `DomainError` here would invert it.
2. **Do not remove or weaken the entry-time `422 AFFILIATE_CODE_INVALID` gate** at `:2977-2990`.
   Two checks at two times is the design, not redundancy (T6).
3. **Do not add a lock, `FOR UPDATE`, or the tenant `transaction` handle to the re-verify** (F8).
4. **Do not add `affiliate_code` to `checkoutPosSchema`** in this PR (J6/F5). Separate issue.
5. **Do not touch the split-payment or mobile-sync modules.** One edit in `posUseCases.js` covers
   all three entry points (J10); the defects found in those two files are §9's, not this PR's.
6. **Do not copy Phase 206's compliance declaration verbatim** — `surfaces: payments` is wrong for
   `modules/pos/` and will fail `check:compliance` (F10).
7. **Do not use Phase 206's `else if (affiliatePricing?.enrollment)` guard shape** (J3).
8. **Do not add a new shared "re-verify" helper, wrapper, or channel-agnostic abstraction** (J2).
   The existing export is the reuse.
9. **Do not surface the drop in the checkout response, the receipt, or any cashier-facing string**
   (J5).
10. **Do not touch `accrueEarnedForInStoreSale`, the Phase 208 cap, or the Phase 209 category
    ladder.**
11. **Do not add a re-verify to the idempotent-replay or `quoteOnly` branches** — neither reaches
    the accrual (F1).

---

## 8. Governance

**Compliance impact declaration — required.** `classification: major`, `surfaces: pos,terminal`
(F10), following Phase 206's declaration as the structural template but not its classification. It
must state: no pricing/VAT/receipt math changes (F2 makes this trivially true on POS, unlike
storefront); the re-check enforces the *same* gate as entry, only later (F3); accrual stays
best-effort inside the existing `try/catch`; idempotency is unchanged (F9); and — stated rather than
omitted — that the split-payment path runs this block pre-outer-commit (F8) and that F5 limits the
change's live reach today. `preflight_request_ref: NOT-EXECUTED-1199-…` is correct and expected on
a `develop`-targeting PR; do not raise it as a finding.

**ADR 0036 amendment — one dated `## Amendments` block, this PR (J7).** Route: ADR 0039's
`[default]`/untagged tier. ADR 0036's only `[binding]` clause is Decision 2 (rate snapshotting),
untouched; Decision 4 (in-store earns immediately) is untagged. The block should record: that
affiliate enrollment status is re-verified at commit time on **both** channels (storefront since
Phase 206, in-store since this phase); that a revocation inside that window drops the commission
silently while the sale/order stands; that this is the same convention as Phase 208's earnings cap;
and that the entry-time POS 422 gate is unchanged. No new ADR, no tech-lead approval gate.

**Phase ledger entry** — all seven fields per `AGENTS.md`'s Continuous Phase Numbering rules;
`status: in_progress` at PR-open, `completed` only after the gates pass. "Next eligible phase"
should name 221 and flag that 217/218 are claimed in flight (J8).

**Issue linkage: `Refs #1199`, not `Closes`.** This is a behavior change that needs deployed
verification, which per `docs/process/ISSUE-TAXONOMY.md`'s linkage rule means the issue stays open
through merge, `pr-reviewer` sets `For QA`, and `verifier` closes it.

**Checkpoint review (`implement`'s policy):** no migration file, no `staging`/`main` base, no deploy
dispatch, no force-push. The compliance declaration row *is* a named checkpoint — Pat's standing
preference is to skip that confirmation and go straight to PR, so the trigger is named here rather
than silently passed.

---

## 9. Follow-ups for `pm` (file, do not build here)

1. **`affiliate_code` is stripped by `checkoutPosSchema`; in-store attribution is dead on
   `POST /pos/checkouts`** (F5, J6). Highest-value item in this list — the UI has shipped an
   affiliate-code field that has never once produced a commission through the primary route. Fix is
   small (declare the key with a sane length/charset) but it is a money-affecting feature
   restoration and wants its own issue, its own tests, and its own compliance reasoning. Suggest
   sequencing it as Phase 221, immediately after this one. Refs #1199, #446.
2. **An offline sale synced after the affiliate is revoked is rejected outright, not just
   uncommissioned** (F7). `syncMobilePosCheckouts` marks the entry `rejected` and the sale is never
   recorded. Arguably a worse bug than #1199's, at a different point in the flow (the entry gate,
   not the commit window). Needs its own product call — probably "accept the sale, drop the
   commission," i.e. this phase's semantics moved one step earlier for the offline path only.
   Refs #1199, #446.
3. **Split-payment completion can accrue a commission for a sale that then rolls back** (F8).
   `ownsTransaction === false`, so the accrual runs pre-outer-commit and the caller can still throw
   `POS_PAYMENT_SESSION_TOTAL_CHANGED`; the landlord-DB rows survive the tenant-DB rollback.
   Pre-existing, unrelated to #1199, found while verifying it.
4. **Neither `logger.warn` drop (storefront's or this one's) has an operator- or merchant-facing
   surface.** Today a dropped commission is discoverable only in server logs. If merchants or
   affiliates are expected to reconcile these, that needs a real surface. Named as a gap, not
   proposed as work.

---

## 10. Out of scope, named rather than silently absent

- Everything in §9.
- Any frontend change (`packages/web-core/**`, `apps/dgfy-pos/**`) — including so much as reading
  the affiliate-code field. Touching `packages/web-core/src/features/pos/` would pull a second
  `major`/`pos,terminal` declaration and three app builds into a backend-only phase.
- The storefront path (`storeUseCases.js`) — Phase 206 is done and is not re-opened.
- Voids/reversals (`reverseAffiliateCommissionForOrder`) and online settlement
  (`settleAffiliateCommissionForOrder`) — different lifecycle points, untouched.
- Any change to the earnings cap (#449 / Phase 208), the category-rate ladder (#448 / Phase 209),
  or slot enforcement (#1177 / Phase 198).
- Any DB migration, new column, or new persisted record. This phase writes *fewer* rows in the drop
  case and identical rows otherwise.

---

## 11. Current phase / next eligible phase

**Current:** Phase 220 — POS In-Store Affiliate Attribution: Re-verify Enrollment at Commit Time
(#1199), `planned`.

**Next eligible:** 221. The strongest candidate for it is §9 item 1 (F5, the stripped
`affiliate_code`) — without it, this phase's semantics are correct but only reachable on two of
three POS entry points. 217 and 218 are claimed by in-flight non-affiliate work in a sibling
worktree and are not yet ledgered; do not reuse them (J8).
