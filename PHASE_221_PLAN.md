# Phase 221 — POS Primary Checkout Route: Restore `affiliate_code` Through the Validator (#1239)

**Issue:** #1239 — *POS in-store affiliate attribution never fires on the primary checkout route
(`affiliate_code` stripped by validator)*
**Epic:** #446 (Affiliate program v2) · **Refs:** #1199 / Phase 220 (the phase that found this,
merged as PR #1242), #450 / Phase 206 (the storefront twin), #1240 and #1241 (the two sibling
defects found alongside it — **not** in this phase, see §10)
**Planned against:** `origin/develop @ f688f941f` (fetched 2026-08-31; worktree HEAD is identical to
`origin/develop`, verified by `git rev-parse`)
**Phase number:** 221 — the next continuous number in
`docs/features/IMPLEMENTATION_PHASE_LEDGER.md`. Highest ledgered is **220** (#1199, line 13922);
Phase 220's own "Next eligible phase" section (line ~14090) already names 221 for this exact issue.
**218 is still an unledgered gap** — do not backfill into it. See J8.
**Status of this document:** plan only. No implementation code was written.

---

## 0. READ FIRST — every open judgment call, and three places this plan contradicts its own brief

Three of the rows below reverse an assumption the task brief and #1239's body both carry. They are
called out first, not buried, because a fixup/review worker who trusts the brief over the verified
code will do the wrong thing:

- **J2** — "match the pattern of the two working schemas" is **not possible**. Neither working
  schema declares an `affiliate_code` key. There is **no explicit `affiliate_code` Joi shape
  anywhere in this repo** to copy. The shape has to be derived from the data and the error
  contract, and this plan derives it.
- **J5** — a compliance impact declaration is **not required** by `scripts/check-compliance-impact.js`
  for this change. Verified empirically, not by reading the rule list. The brief's guess ("this
  probably does too") is wrong, and filing one anyway has a real cost.
- **J7** — the mock-the-repository use-case test pattern the brief points at
  (`posCheckoutAffiliateAttribution.unit.test.js`) **cannot catch this bug and would not have.**
  That file feeds the use case a payload directly, bypassing the validator entirely. Its seven
  tests pass today, on `origin/develop`, while the field is being stripped in production. The
  primary regression test for Phase 221 has to be at the **validator** layer.

| # | Call | Who owns it | This plan's position |
|---|---|---|---|
| **J1** | **The exact Joi shape for `affiliate_code`** | Mine — engineering | **`Joi.string().trim().max(40).allow('', null).optional()`.** No `.uppercase()`, no `.pattern()`, no `.min()`. Each omission is argued in §4.2; each is a place a reasonable reviewer would reach for the wrong thing. |
| **J2** | **Is there an existing `affiliate_code` schema to mirror?** | Mine — engineering, and it corrects the brief | **No — none exists.** The mobile-sync route passes the whole checkout body through as `payload: Joi.object().required().unknown(true)` (`posValidator.js:932`); the split-payment route's `snapshot` is `Joi.object({ lines }).unknown(true)` (`posValidator.js:335-337`), and the field rides inside `snapshot.checkout_payload` as an unvalidated unknown key. Both work by **not validating** the field, not by declaring it. This phase writes the repo's first explicit shape for it. F4. |
| **J3** | **Should a malformed/over-long code 422 at the validator, or fall through to the use case's gate?** | Mine — engineering | **Fall through to the use case.** `posUseCases.js:2985-2990` already hard-rejects an unresolvable code with a purpose-built `422` carrying `details.reason_code: 'AFFILIATE_CODE_INVALID'`. A validator rejection returns a *different* response shape (`buildValidationErrorResponse`, `posValidator.js:1144-1153` — `errors[]`, no `reason_code`). Introducing a second error contract for "bad affiliate code" is a regression in its own right. The validator's whole job here is *bound the field and let it through*. §4.2, T4. |
| **J4** | **Why not just add `.unknown(true)` to `checkoutPosSchema`? It's one word.** | Mine — engineering | **Rejected outright, and it belongs in DO NOT.** `checkoutPosSchema` is the highest-blast-radius money schema in the app — it governs discount mode, discount rate, governed senior/PWD discounts, VAT-affecting fields, and price overrides, all of which the use case cross-validates against a *server-recomputed* total precisely because the client is untrusted. `stripUnknown: true` on this schema is a deliberate tamper boundary, not an accident. Opening it to pass one field would silently re-admit every field the schema exists to reject. Declare the one key. §7 item 1. |
| **J5** | **Is a compliance impact declaration required?** | Mine — verified empirically, and it corrects the brief | **No, and I recommend not filing one.** `scripts/check-compliance-impact.js` matches `^apps/dgfy-api/src/validators/complianceValidator\.js$` only — `posValidator.js` is on no rule. Verified by running the script: `COMPLIANCE_STAGED_FILES="apps/dgfy-api/src/validators/posValidator.js,apps/dgfy-api/tests/…" node scripts/check-compliance-impact.js --staged` → *"No compliance-sensitive changes detected"*, exit 0; the same run with `posUseCases.js` added → exit 1. F6 has the full transcript and the cost argument for not volunteering one. **This is Pat's to override if he disagrees** — §8 gives the exact declaration to write if he does. |
| **J6** | **ADR 0036 amendment?** | Mine | **Yes — one small dated `## Amendments` block, in this PR, but for a reason nobody has named yet.** Phase 220's own amendment (ADR 0036 line 348, added 2026-08-31) contains a bullet titled *"Known limitation … POS's primary checkout route cannot reach this fix today"* (lines ~396-403) describing precisely this bug. Shipping Phase 221 without retiring that bullet leaves an `authority_level: authoritative` ADR asserting something false. ADR 0039 route: `[default]`/untagged — ADR 0036's only `[binding]` clause is Decision 2 (rate snapshotting / integer centavos), untouched. §8. |
| **J7** | **Test level and file** | Mine — engineering, and it corrects the brief | **Two levels, and the *primary* one is the validator, not the use case.** (a) New `apps/dgfy-api/tests/posValidator.affiliateCode.test.js`, mirroring `posValidator.discountPolicy.test.js` — imports `validatePosCheckout` and drives it with a fake `req`/`res`/`next`. That is the test that fails against today's code. (b) One added composition case in the existing `posCheckoutAffiliateAttribution.unit.test.js` that runs the real validator *and then* the real use case, so the end-to-end chain is pinned once. §6. |
| **J8** | **Phase numbering** | Mine | **221.** Ledger's highest is 220; Phase 220's ledger entry already earmarks 221 for #1239. 217 and 219 are ledgered; **218 is a genuine unfilled gap** in the ledger — leave it alone, do not renumber into it (`AGENTS.md`, "Preserve historical phase numbers"). |
| **J9** | **`docs/api/specification.md` update?** | Mine — recommend, low confidence either way | **Yes, one line, optional-if-contested.** The `POST /pos/checkouts` section (line 2674) documents other optional request fields (`payment_handoff_mode`, `discount_beneficiary.*`) but has **no** mention of `affiliate_code` — grep returns zero hits in the whole spec. No automated check enforces this (`check-compliance-api-contracts.js` has no checkout/affiliate rule — F7), so it is hygiene, not a gate. Cheap; do it. §5 step 4. |
| **J10** | **Any frontend change?** | Mine | **None. Zero files under `packages/web-core/` or `apps/dgfy-*/`.** The POS UI has been sending the field correctly the whole time (`usePosCheckoutWorkflow.js:1275`). The bug is entirely server-side. Touching `packages/web-core/src/features/pos/` would pull a `major`/`pos,terminal` compliance declaration and three app builds into a one-line backend change — see §7 item 6. |
| **J11** | **Does this need Pat's product input at all?** | Pat's, but I believe not | **No.** This restores behavior the product already intends, already built a UI for, and already documented in ADR 0036. Nothing about *what* attribution does changes — Phase 220 settled that and is merged. Stated explicitly so it isn't held for a decision that doesn't exist. |

---

## 1. Documentation read before planning (per `AGENTS.md`'s lookup order)

1. `docs/START_HERE.md`, `docs/architecture/ARCHITECTURE_BOUNDARIES.md` — the
   `routes → validators → controllers → usecases → repositories → models` chain. This phase edits
   exactly one layer (validators) and adds no new one.
2. `docs/architecture/ARCHITECTURE_GOVERNANCE.md`, **ADR 0039** (clause strictness tiers) — the
   route J6 uses.
3. **ADR 0036** — *Affiliates Program: Commission Ledger, Attribution, and Cashout*,
   `status: amended`, `authority_level: authoritative`, `last_reviewed: 2026-09-01`,
   `review_by: 2027-01-24` (**not** decayed). Read in full, including all five `## Amendments`
   blocks. The 2026-08-31 block (line 348) is the one this phase must edit — see J6.
4. **ADR 0050** — *Affiliate Buyer-Facing Pricing Rule Engine*, `status: amended`. Read and
   **explicitly not engaged**: a POS in-store affiliate code changes no price (F3), so no pricing
   clause is in play. Same conclusion Phase 220 reached, re-derived rather than inherited.
5. `docs/features/IMPLEMENTATION_PHASE_LEDGER.md` — Phase 220's entry in full plus the `^## Phase`
   headings sweep only (the file is ~14k lines; never read it whole).
6. `docs/compliance/impact-declarations/2026-08-31-pos-affiliate-attribution-commit-time-recheck.md`
   — Phase 220's declaration, read as the structural template *in case* J5 is overridden.
7. `docs/api/specification.md`, the `POST /pos/checkouts` section (line 2674+).
8. `docs/process/ISSUE-TAXONOMY.md` — the `Closes` vs `Refs` rule (§8).
9. `AGENTS.md`, `.agents/skills/implement/SKILL.md`, and `PHASE_220_PLAN.md`, all in full.
10. GitHub: #1239's body; #1240 and #1241's titles/state (both open, both out of scope — §10).

---

## 2. Ground truth — what the code actually does today

Every line number below was re-derived against `origin/develop @ f688f941f` in this worktree.
`PHASE_220_PLAN.md`'s F5 numbers were recorded against `7d31d9923` and **have shifted** — its
`checkoutPosSchema` line (143) still holds, but its `validateSchema` (1155-1159 → still 1155),
`posHandlers.js:863`, and `posUseCases.js` accrual-block numbers all moved when PR #1242 landed.
Do not carry numbers forward from that document.

### F1 — The strip, re-verified end to end

| Point | Location today (`f688f941f`) | What it does |
|---|---|---|
| Schema declaration | `apps/dgfy-api/src/validators/posValidator.js:143`, closing at `:252` | 34 declared keys. **No `affiliate_code`. No `.unknown(true)`.** Ends `.custom(…).messages({ 'any.invalid': '{{#message}}' })` |
| Last two keys before the close | `:190` `governed_discount`, `:191` `lines` | The insertion point (§4.1) |
| The strip itself | `posValidator.js:1155-1167`, `stripUnknown: true` at `:1158` | `schema.validate(req[source], { abortEarly: false, stripUnknown: true })`, then `req[target] = value` at `:1165` |
| Middleware export | `posValidator.js:1169` | `export const validatePosCheckout = validateSchema(checkoutPosSchema, 'body', 'validatedData')` |
| Route wiring | `apps/dgfy-api/src/routes/pos.js:185` | `router.post('/checkouts', checkPermission(…), requirePairedTerminal, validatePosCheckout, requireEmployeeCreditCheckoutPermission, requireActiveOperatorForMutation, posController.checkout)` |
| Handler | `apps/dgfy-api/src/modules/pos/controllers/posHandlers.js:863` | `const payload = req.validatedData \|\| req.body;` — **`req.validatedData` is always set** when the middleware calls `next()`, so the `\|\| req.body` fallback never fires on this route. The stripped object is what proceeds. |
| Use case call | `posHandlers.js:869` | `checkoutPosUseCase({ payload, userId, user, operatorSessionId })` — whole payload, verbatim |
| Where the field would be read | `posUseCases.js:2981` | `const affiliateCodeInput = String(payload.affiliate_code \|\| '').trim();` — the **only** occurrence of the string `affiliate_code` in the entire `apps/dgfy-api/src` tree |
| The gate it feeds | `posUseCases.js:2982-2990` | resolve at `:2983`, `DomainError` 422 `AFFILIATE_CODE_INVALID` at `:2985-2990` |
| Phase 220's commit-time re-verify | `posUseCases.js:4400` (commit), `:4405` (`if (affiliateEnrollment)`), `:4417-4420` (`resolveActiveAffiliateEnrollmentById`), `:4446` (drop warn) | Merged, working, **untouched by this phase** |
| The UI that sends it | `packages/web-core/src/features/pos/hooks/usePosCheckoutWorkflow.js:1275` | `affiliate_code: affiliateCodeInput.trim() \|\| undefined,` — placed between `governed_discount` and `shift_id`, mirroring the schema position §4.1 recommends |

**Net, on `POST /pos/checkouts` today:** the cashier types a valid code, the field is dropped at
`:1158`, `affiliateCodeInput` is `''` at `:2981`, the 422 gate at `:2985` can never fire, and
`affiliateEnrollment` is `null` — so Phase 220's entire re-verify block at `:4405-4460` is dead code
on this route. No attribution row, no commission row, no error, no log line. Silent, total.

**Runtime proof not run in this worktree, and named rather than implied:** `apps/dgfy-api/node_modules`
does not exist here (no `joi`), so the executor should run the two-line proof themselves as the
first thing after `npm install` — see §5 step 0. The static argument above is airtight on its own
(Joi's `stripUnknown: true` deletes any key the schema does not declare, and the schema declares
none), but a failing test is better evidence than a paragraph, and §6 T1 makes it one.

### F2 — Three entry points, one use case; only the primary one is broken

`checkoutPosUseCase` has exactly three callers (`grep -rn "checkoutPosUseCase(" src/`):

| # | Caller | Reaches the use case with a live `affiliate_code`? | Why |
|---|---|---|---|
| 1 | `posHandlers.js:869` — `POST /pos/checkouts` | **No.** | This bug. |
| 2 | `splitPaymentUseCases.js:1170` — split-payment completion | **Yes.** | The field enters at session-create inside `snapshot.checkout_payload`; `createPosPaymentSessionSchema.snapshot` is `Joi.object({ lines }).unknown(true)` (`posValidator.js:335-337`), so `checkout_payload` survives as an unknown key, unvalidated and unstripped. `buildCompletionCheckoutPayload` (`splitPaymentUseCases.js:1031`) then rebuilds the checkout body with `...sourceSnapshot` (`:1076`), carrying the field straight through. **The completion payload is never re-validated by `checkoutPosSchema`** — it goes use-case-to-use-case. |
| 3 | `mobilePosUseCases.js:371` — offline/mobile sync | **Yes.** | `mobilePosCheckoutSyncEntrySchema` is `{ local_transaction_id, payload: Joi.object().required().unknown(true) }` (`posValidator.js:930-933`); the whole offline checkout body passes through untouched. |

Two consequences worth stating rather than assuming:

- **This fix changes nothing for paths 2 and 3.** They do not route through `checkoutPosSchema` and
  never have. Declaring the key adds no second validation to them. T6 pins this.
- **Path 2 already 422s an invalid code at session-create time**, not just at completion: the
  session-create flow calls `quotePosCheckoutUseCase` with `quoteOnly: true`
  (`splitPaymentUseCases.js:483-490`) against the same snapshot, and the `quoteOnly` branch still
  runs the `:2982-2990` gate before returning at `:3851`. So on split-payment the cashier gets the
  "code accepted / code invalid" feedback earlier than on the primary route. After this fix the
  primary route gets that feedback for the first time.

### F3 — On POS the enrollment affects nothing but the commission

Re-verified independently of Phase 220's F2 claim, not inherited: `affiliateEnrollment` appears at
exactly five lines in `posUseCases.js` — `:2982` (assignment), `:2985` (the 422 gate), `:4405`
(the accrual guard), `:4419` (the re-verify's `enrollment_id` argument), `:4451` (the drop-warn
field). It touches no price, no discount, no VAT, no receipt field, no persisted transaction column.

**This is what makes Phase 221 a small change rather than a pricing change.** Restoring the field
cannot move a single peso on the customer's receipt. The only outputs that change are: an
attribution row, a commission row, and — for a bad code — a 422 that could not previously be
reached. That last one is the only user-visible behavior change in the whole phase, and it is
§9's one real risk.

### F4 — There is no existing `affiliate_code` Joi shape in the repo (J2)

`grep -rn "affiliate" apps/dgfy-api/src/validators/` returns **three hits, all in
`adminTenantValidator.js`, all about `max_affiliate_slots`** — an unrelated integer field from
Phase 213 (#1190). Nothing anywhere declares an affiliate code as a validated request field.

So the shape has to be derived. The four facts it is derived from, all verified:

1. **Codes are `AF-` + 6 characters** from `CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'`
   (`dgfyAffiliateRepository.js:45`, generated at `:324` as `` `AF-${generateCodeSuffix(6)}` ``) —
   **9 characters** in practice.
2. **The column is `STRING(16)`** — `short_code` in
   `apps/dgfy-api/src/models/Landlord/DgfyAffiliateEnrollment.js:24-27`, `allowNull: false`, with a
   globally-unique index. **Nothing longer than 16 characters can ever exist in the table.**
3. **Lookup is already case- and whitespace-insensitive.** `findActiveEnrollmentByShareCode`
   (`dgfyAffiliateRepository.js:791-800`) matches on `share_code_hash: hashAffiliateShareCode(code)`,
   and `hashAffiliateShareCode` (`:60-65`) hashes
   `` `${String(code || '').trim().toUpperCase()}:${SECRET}` ``. **The normalization already happens
   in the repository.** Any `.uppercase()` in the validator is redundant — and mutating (J1).
4. **The use case treats blank as "no attribution", never as an error** — `String(payload.affiliate_code || '').trim()`
   at `:2981` maps `undefined`, `null`, `''`, and `'   '` identically to "no code", and the 422 gate
   at `:2985` is guarded by `if (affiliateCodeInput && …)`. So `''` and `null` are semantically
   valid inputs and must not 422.

### F5 — The two frontends disagree about the empty value, and the shape must tolerate both

- Primary route: `usePosCheckoutWorkflow.js:1275` → `affiliateCodeInput.trim() || **undefined**`
  (key omitted after JSON serialization).
- Split-payment snapshot: `POSSplitPaymentWorkflow.jsx:62` → `context.affiliateCodeInput?.trim() || **null**`.

Only the first hits `checkoutPosSchema` today. But the two files are maintained together and the
`null` convention is the one used by every neighboring field in the split builder. `.allow('', null)`
costs nothing and makes a future convergence on `null` a non-event instead of a production 422 on
every affiliate-less sale. §4.2.

### F6 — Compliance: **no declaration is required** (J5), verified by running the script

`scripts/check-compliance-impact.js`'s `COMPLIANCE_SENSITIVE_RULES` (lines 32-193) covers the
`validators/` directory with exactly one rule:

```
{ pattern: /^apps\/dgfy-api\/src\/validators\/complianceValidator\.js$/, surfaces: ['compliance'], minimumClassification: 'regulatory' }
```

`posValidator.js` matches no rule. Neither does `apps/dgfy-api/tests/`. Empirically confirmed via
the script's own `COMPLIANCE_STAGED_FILES` env override:

```
$ COMPLIANCE_STAGED_FILES="apps/dgfy-api/src/validators/posValidator.js,apps/dgfy-api/tests/posValidator.affiliateCode.test.js" \
    node scripts/check-compliance-impact.js --staged
[check:compliance] No compliance-sensitive changes detected.        # exit 0

$ COMPLIANCE_STAGED_FILES="apps/dgfy-api/src/validators/posValidator.js,apps/dgfy-api/src/modules/pos/usecases/posUseCases.js" \
    node scripts/check-compliance-impact.js --staged
[check:compliance] Compliance-sensitive files changed without a declaration file.
[check:compliance] Sensitive files:
  - apps/dgfy-api/src/modules/pos/usecases/posUseCases.js         # exit 1
```

The control run is the point: the harness is working, and it is the *use case* file — not the
validator — that carries the `pos,terminal` rule. Phase 220 needed a declaration because it edited
`posUseCases.js`. **Phase 221 does not edit that file at all** (§7 item 2).

**Recommendation: do not file one.** Reasoning, so this reads as a decision rather than laziness:

- Volunteering a declaration for a path the classifier does not cover trains the next reader to
  believe `validators/` *is* covered, which is exactly the "a rule found only in one place is a bug"
  failure mode `AGENTS.md`'s Surface precedence section names. If `posValidator.js` should be
  covered, the fix is a PR to `check-compliance-impact.js`'s rule list, not a one-off declaration
  that papers over its absence.
- Every `major` declaration carries a `preflight_request_ref` into the promotion batch's compliance
  preflight sweep (`.agents/skills/promoter/SKILL.md`). A `NOT-EXECUTED-*` ref that must be cleared
  before `main` is real recurring cost, paid by whoever runs the next promotion.
- The substantive compliance story — that in-store affiliate commission is money-affecting POS
  logic — was already told, in full, by Phase 220's declaration for the code path this field feeds.

**Counter-argument, stated fairly:** this change turns money-affecting logic from *never runs* to
*runs on the primary POS route*, which is a bigger real-world delta than Phase 220's semantics
tweak, even though it touches a file the classifier ignores. That is a legitimate reading, and it is
Pat's call, not mine. If he takes it, §8 gives the exact file to write. **The classifier will not
tell you either way — it passes silently in both directions.**

### F7 — `check-compliance-api-contracts.js` has no rule that this change trips

The second half of `npm run check:compliance` reads `posValidator.js` and pairs regexes against
`docs/api/specification.md`. Every POS rule in it is anchored to a *named schema* and the string
`idempotency_key` (`DOC-02-POS-SHIFT-OPEN-IDEMPOTENCY`, `-CASH-EVENT-`, `-SHIFT-CLOSE-`,
`-ORDER-STATUS-`, `-REPLAY-METADATA`). `grep -n "checkout\|affiliate" scripts/check-compliance-api-contracts.js`
returns **nothing**. Adding a key to `checkoutPosSchema` cannot break any of them — the schema-body
patterns are `[\s\S]*?` non-greedy and none of them target `checkoutPosSchema`. So the spec update
in J9/§5 step 4 is hygiene, not a gate.

### F8 — Phase 220's tests would not have caught this, and still would not (J7)

`apps/dgfy-api/tests/posCheckoutAffiliateAttribution.unit.test.js` (441 lines, 7 tests, merged in
PR #1242) drives the use case directly:

```js
const result = await runInTenantContext(() => useCase({
    userId: 12, user: { user_id: 12, permissions: [] },
    payload: basePayload({ affiliate_code: 'AFF-CODE' })      // <- hand-built, never validated
}));
```

`validatePosCheckout` is never imported, never invoked. All seven tests pass on `origin/develop`
today, while the field is being stripped in production. **This is the blind spot that let the bug
exist at all**, and repeating that pattern for Phase 221 would produce a green suite that proves
nothing. Hence §6's two-level split, with the validator level as the primary.

Note also: the file's fixture code is `'AFF-CODE'` (8 chars, non-conforming to the real `AF-XXXXXX`
format). Under J1's permissive shape that is fine and stays fine. Under a `.pattern()` shape it
would still be fine *in that file* (the validator is bypassed) but would be a live 422 in
production — a good illustration of why the pattern is rejected in §4.2.

---

## 3. The change, stated in one paragraph

Declare `affiliate_code` on `checkoutPosSchema` as an optional, trimmed, length-bounded string that
also accepts `''` and `null`, so `stripUnknown: true` stops deleting it. Nothing else changes: the
field then reaches `posUseCases.js:2981` exactly as it already does on the split-payment and
mobile-sync routes, and every downstream behavior — the 422 gate, Phase 220's commit-time re-verify,
the accrual, the drop warn — is code that already exists, already shipped, and already has tests.

**One line of production code.** Everything else in this plan is tests, the ADR bullet that goes
stale the moment it ships, and the two sibling defects deliberately left alone.

---

## 4. Design

### 4.1 The edit

`apps/dgfy-api/src/validators/posValidator.js`, inserting a single line between `:190`
(`governed_discount`) and `:191` (`lines`):

```diff
     governed_discount: governedDiscountSchema.optional(),
+    // #1239 (Phase 221): declared so `stripUnknown: true` (see validateSchema below) stops
+    // deleting it. Deliberately permissive - validity is not decided here. posUseCases.js:2982-2990
+    // resolves the code and hard-rejects an unknown one with a reason-coded
+    // 422 AFFILIATE_CODE_INVALID; a stricter shape here would produce a second, different error
+    // contract for the same user mistake. No .uppercase() (hashAffiliateShareCode already
+    // trim/uppercases, dgfyAffiliateRepository.js:60) and no .pattern() (the AF-XXXXXX format is a
+    // generation detail, not a request contract). '' / null are accepted because the use case maps
+    // them to "no attribution", never to an error.
+    affiliate_code: Joi.string().trim().max(40).allow('', null).optional(),
     lines: Joi.array().items(checkoutLineSchema).min(1).required().messages({
```

**Why this position.** It is the last non-`lines` key, and it mirrors where
`usePosCheckoutWorkflow.js:1275` places the field in the outgoing payload (immediately after
`governed_discount`). Diff-order symmetry between the request builder and the schema is worth the
five seconds it costs; there is no functional constraint on position.

**Nothing else in the file changes.** In particular the `.custom(…)` block at `:252` is untouched —
it reads only `discount_*`, `payment_type`, and `employee_credit`, and adding a key to the object
it receives cannot affect it.

### 4.2 Why each part of the shape, and why each omission

| Element | Chosen | Why, and what was rejected |
|---|---|---|
| `Joi.string()` | ✅ | The column is `STRING(16)`; the resolver stringifies anyway. A number `123456` would be coerced by Joi to `'123456'` and hash-miss → `AFFILIATE_CODE_INVALID`, which is the correct outcome. |
| `.trim()` | ✅ | Matches `hashAffiliateShareCode`'s own `.trim()` and the use case's `.trim()` at `:2981`. Redundant twice over, kept because a *validated* value that still carries whitespace is a trap for whatever reads `req.validatedData` next (the split-payment snapshot builder, for one). |
| `.max(40)` | ✅ | Bound the payload without ever rejecting a real code. 40 is comfortably above the 16-char column ceiling — so **no value that could possibly match a row is ever rejected here** — and matches the `buyer_tin: max(40)` neighbor at `:183` rather than inventing a number. **`.max(16)` was considered and rejected**: it is tighter and self-documenting, but it moves the 17+-char case from the reason-coded `AFFILIATE_CODE_INVALID` path onto the generic `Validation failed` path, splitting one error contract into two for no gain (J3). If a reviewer prefers 16, the change is safe and I will not argue hard — but say so explicitly rather than silently tightening it. |
| `.allow('', null)` | ✅ | `''` and `null` are semantically valid "no code" inputs (F4 fact 4), and the two POS frontends disagree about which they send (F5). Without this, a `null` would 422 every affiliate-less sale the day the primary hook converges on its sibling's convention. |
| `.optional()` | ✅ | Explicit, matching every other optional key in the schema. Joi's default is optional; the schema states it anyway on 30+ keys, so omitting it here would be the odd one out. |
| `.uppercase()` | ❌ | Redundant — `hashAffiliateShareCode` (`:60`) already uppercases before hashing, so lookups are already case-insensitive. Worse, it is **mutating**: `stripUnknown`'s sibling behavior is that Joi returns the *converted* value, so `req.validatedData.affiliate_code` would differ from what the cashier typed, and that mutated value is what a future split-payment snapshot or audit trail would persist. The split-payment schemas' `terminal_id` uses `.uppercase()` (`:280`, `:298`, `:325`) because it is compared literally against a terminal registry — but note that `checkoutPosSchema`'s **own** `terminal_id` (`:147`) does **not**, which is the closer precedent. |
| `.pattern(/^AF-[A-Z0-9]{6}$/)` | ❌ | Couples the public request contract to a private generation detail (`dgfyAffiliateRepository.js:324`). Codes minted before or after a format change, or by any future path, would 422 at the edge with no `reason_code`. The `/s/{short_code}` resolver (`findActiveEnrollmentByShortCode`, `:807-816`) hashes arbitrary input for the same reason. Nothing in the system treats the format as a contract; this schema must not be the first thing that does. |
| `.min(3)` or similar | ❌ | Same J3 argument, plus `''` must be allowed anyway, which makes a `min` incoherent without a conditional. |

### 4.3 The call chain after the fix, traced end to end

Confirming J-column "does the use case actually receive and use the code the same way the two
working paths do":

1. `POST /api/v1/pos/checkouts` → `routes/pos.js:185` → `validatePosCheckout`.
2. `validateSchema` (`posValidator.js:1155-1167`) validates with `stripUnknown: true`. **With the
   key declared, `affiliate_code` is now a known key and survives.** `req.validatedData = value`
   at `:1165`.
3. `posHandlers.checkout` (`:863`) reads `req.validatedData` and passes the whole object as
   `payload` to `checkoutPosUseCase` (`:869`).
4. `posUseCases.js:2981` — `String(payload.affiliate_code || '').trim()` now yields the real code
   instead of `''`. **This is byte-for-byte the same expression the split-payment and mobile-sync
   paths already feed** (F2): all three enter the same function body with the same key on the same
   payload object. There is no per-path branch anywhere between the validator and this line.
5. `:2982-2983` — `resolveActiveAffiliateEnrollment({ tenantId, affiliateCode })` →
   `getSettings` (`program_enabled`) → `findActiveEnrollmentByShareCode` (hash lookup, `status: 'active'`).
6. `:2985-2990` — unresolvable → `DomainError` 422 `AFFILIATE_CODE_INVALID`, transaction rolled
   back, nothing written. **Newly reachable on this route.** §9.
7. `:4400` commit → `:4405` `if (affiliateEnrollment)` → `:4417-4420` Phase 220's
   `resolveActiveAffiliateEnrollmentById` re-verify → `:4422` accrue, or `:4446` drop warn.
   **Newly reachable on this route.**

So the answer to "does the use case receive and use it the same way" is **yes, identically, with no
new code path** — which is the whole reason this fix is one line and not a feature.

### 4.4 What deliberately does not change

- `posUseCases.js` — **not touched at all.** Phase 220 is merged and correct; this phase only makes
  it reachable.
- The `stripUnknown: true` behavior of `validateSchema`, for this or any other schema.
- `createPosPaymentSessionSchema` and `mobilePosCheckoutSyncEntrySchema` — both already work (F2).
- Any frontend file (J10).
- The `.custom()` cross-field block, the discount policy, and every other key on the schema.
- Any DB migration, column, index, or persisted shape. Nothing about storage changes.

---

## 5. Implementation order

0. **Prove the bug first, before changing anything.** `npm install` in `apps/dgfy-api` (this
   worktree has no `node_modules`; `joi` is not resolvable, so nothing runs until this happens),
   then write §6's T1 and watch it **fail** on unmodified `develop`. A regression test that was
   never seen red is not a regression test.
1. `apps/dgfy-api/src/validators/posValidator.js` — the one-line key plus its comment (§4.1).
   Confirm T1 now passes.
2. `apps/dgfy-api/tests/posValidator.affiliateCode.test.js` — new (§6, T1-T5).
3. `apps/dgfy-api/tests/posCheckoutAffiliateAttribution.unit.test.js` — one appended composition
   test (§6, T6). **Append only; do not restructure or re-title the existing seven tests** — they
   are Phase 220's evidence artifact, cited by name in its compliance declaration's
   `verification_evidence` front-matter key.
4. `docs/api/specification.md` — one line under `POST /pos/checkouts` (§8, J9).
5. `docs/architecture/adr/0036-affiliates-program-commission-and-cashout.md` — the amendment
   (§8, J6).
6. `docs/features/IMPLEMENTATION_PHASE_LEDGER.md` — Phase 221 entry, `status: in_progress` at
   PR-open.
7. Tier 0 self-verify: `node --check apps/dgfy-api/src/validators/posValidator.js`. No
   `package.json` touched → no lockfile step. (`apps/dgfy-api` has no real build; its `build` script
   is a literal no-op.)
8. Tier 2, and worth it here because both test files are cheap and zero-DB:
   `cd apps/dgfy-api && node --experimental-vm-modules node_modules/jest/bin/jest.js --config jest.config.cjs --runInBand --runTestsByPath tests/posValidator.affiliateCode.test.js tests/posCheckoutAffiliateAttribution.unit.test.js`
9. Branch `fix/1239-pos-checkout-affiliate-code` off **fresh** `origin/develop`; PR into `develop`;
   `Refs #1239` (§8).

Batch the commits by domain per `docs/ai/PR.md`: (a) the validator key, (b) the two test files,
(c) the ADR amendment + API spec + ledger.

---

## 6. Tests

### 6.1 Primary — `apps/dgfy-api/tests/posValidator.affiliateCode.test.js` (new)

**Template:** `apps/dgfy-api/tests/posValidator.discountPolicy.test.js` (459 lines, on `develop`) —
the proven, zero-mock pattern for this exact schema. It imports the middleware directly and drives
it with a hand-built `req`/`res`/`next`:

```js
import { jest } from '@jest/globals';
import { validatePosCheckout } from '../src/validators/posValidator.js';

const mockRes = () => {
    const res = {};
    res.status = jest.fn(() => res);
    res.json = jest.fn(() => res);
    return res;
};
```

**Not** the `jest.unstable_mockModule` repository-mocking pattern — that harness exists to exercise
the *use case*, and using it here would reproduce F8's blind spot rather than close it. `posValidator.js`
imports only `joi` and `../modules/shared/constants/orderMethods.js`, so this file needs no mocks
at all.

Shared minimal valid body (mirroring `discountPolicy`'s own fixture):

```js
const baseBody = (overrides = {}) => ({
    idempotency_key: 'idem-12345678',
    terminal_id: 'TERM-01',
    order_method: 'dine_in',
    payment_type: 'cash',
    lines: [{ item_id: 1, quantity: 1, sale_price: 100 }],
    ...overrides
});
```

| # | Case | Assertions |
|---|---|---|
| **T1** | **The regression.** `affiliate_code: 'AF-9K2XQ7'` | `next` called once; `res.status` not called; **`req.validatedData.affiliate_code === 'AF-9K2XQ7'`**. This is the assertion that fails against unmodified `develop` (`validatedData` has no such key) — the one test that must be seen red first (§5 step 0). |
| **T2** | Whitespace is trimmed | `affiliate_code: '  AF-9K2XQ7  '` → `req.validatedData.affiliate_code === 'AF-9K2XQ7'`. Pins `.trim()`. |
| **T3** | Case is **preserved**, not uppercased | `affiliate_code: 'af-9k2xq7'` → `req.validatedData.affiliate_code === 'af-9k2xq7'`, **not** `'AF-9K2XQ7'`. Pins the deliberate absence of `.uppercase()` (§4.2) against a future "helpful" tightening; the repository's own hash handles case (`dgfyAffiliateRepository.js:60`). |
| **T4** | Blank forms do not 422 | Three sub-cases — key omitted entirely, `affiliate_code: ''`, `affiliate_code: null` — each: `next` called once, `res.status` not called. Pins `.allow('', null).optional()` and F5's two-frontend divergence. |
| **T5** | The bound exists, and rejects at the schema | `affiliate_code: 'X'.repeat(41)` → `next` **not** called; `res.status` called with `422`; the `errors[]` payload names `field: 'affiliate_code'`. Documents J3's boundary honestly: past 40 chars you get the *generic* validation shape, not `AFFILIATE_CODE_INVALID`. Keep this test's name explicit about that, e.g. `'rejects an absurdly long code at the schema (generic 422, not AFFILIATE_CODE_INVALID — see PHASE_221_PLAN.md §4.2)'`. |

Optional sixth, cheap and worth it: assert that a *sibling* key the schema does not declare (e.g.
`totally_unknown_field: 'x'`) is **still stripped** in the same run — proving the fix declared one
key rather than opening the schema (J4). One extra `expect` inside T1, not a separate test.

### 6.2 Secondary — one appended case in `apps/dgfy-api/tests/posCheckoutAffiliateAttribution.unit.test.js`

The composition test that pins the whole chain, which neither existing file covers. Append to the
existing `describe`, or add a second `describe` block below it:

| # | Case | Shape |
|---|---|---|
| **T6** | **Validator → use case, end to end** | Import `validatePosCheckout` at the top of the file (safe: `posValidator.js` has no mocked dependency, so it is unaffected by the file's `unstable_mockModule` calls). Build a raw `req = { body: basePayload({ affiliate_code: 'AF-9K2XQ7' }) }`, run `validatePosCheckout(req, mockRes(), next)`, then feed **`req.validatedData`** — not the hand-built object — into the use case exactly as `posHandlers.js:863` does. Assert `result.success === true`, `findActiveEnrollmentByShareCode` called once, `findEnrollmentById` called once (Phase 220's re-verify fires), and `createEarnedCommissionIfMissing` called once with `enrollmentId === ENROLLMENT_ID`. **This test fails against unmodified `develop` for the right reason** — the field is stripped, so zero lookups happen and no commission accrues. |

`basePayload` in that file already produces a `checkoutPosSchema`-valid body — verified, not
assumed: `idempotency_key` (16 chars, ≥ the `min(8)`), `terminal_id: 'TERM-01'`, `location_id: 3`,
`document_context: 'non_fiscal'`, `payment_type: 'cash'`, `order_method: 'pickup'`, and
`lines: [{ item_id: 1, quantity: 1 }]`, whose missing `sale_price` is fine because
`checkoutLineSchema:40` declares it `.allow(null).optional()`. **Do not edit `basePayload`** — if
T6 ever needs a different body, override locally at the call site; the existing seven tests depend
on it as-is.

**T7 — regression guard for the untouched paths (optional but recommended).** Assert that the split
and mobile paths are unaffected by checking the *schemas* rather than the use case:
`createPosPaymentSessionSchema`'s snapshot and `mobilePosCheckoutSyncEntrySchema`'s payload are not
exported, so this can only be done through their exported middleware
(`validateCreatePosPaymentSession`, and the mobile sync validator) — one assertion each that a body
carrying `affiliate_code` in the right nesting still emerges intact. Skip it if the nesting fixture
turns out to cost more than it proves; say so in the PR rather than dropping it silently.

### 6.3 Tier 0 evidence for the PR body

`node --check apps/dgfy-api/src/validators/posValidator.js`. Post that in `## Testing Evidence` at
PR creation; post the Jest run (Tier 2) as a follow-up PR comment per
`.agents/skills/implement/SKILL.md` step 4.

---

## 7. DO NOT

1. **Do not add `.unknown(true)` to `checkoutPosSchema`** (J4). It is a one-word "fix" that silently
   re-admits every field this schema exists to reject on the app's highest-risk money route —
   discount mode, discount rate, governed senior/PWD amounts, price overrides. `stripUnknown: true`
   here is a tamper boundary, not an oversight. Declare the one key.
2. **Do not touch `apps/dgfy-api/src/modules/pos/usecases/posUseCases.js`.** Not the 422 gate at
   `:2982-2990`, not Phase 220's re-verify at `:4405-4460`, not the drop warn. Beyond being out of
   scope, editing it converts this PR from "no compliance declaration required" to "required"
   (F6) — a real, mechanical consequence, not a stylistic one.
3. **Do not add `.uppercase()` or `.pattern()` to the new key** (§4.2). Both are the obvious
   instinct and both are wrong here, for reasons that are one grep away
   (`dgfyAffiliateRepository.js:60`) but easy to miss under review.
4. **Do not tighten `.max(40)` to `.max(16)` without saying so.** It is a defensible alternative
   (§4.2) — it is not a silent tightening. If a reviewer wants it, change it in a labelled commit
   and update T5.
5. **Do not add `affiliate_code` to `createPosPaymentSessionSchema` or
   `mobilePosCheckoutSyncEntrySchema`.** Both already carry the field correctly via `.unknown(true)`
   (F2). Declaring it there would add a new, *stricter* validation to two paths that work today —
   a pure regression risk for zero benefit.
6. **Do not touch any file under `packages/web-core/` or `apps/dgfy-pos/`** (J10). The UI is already
   correct. `packages/web-core/src/features/pos/` is on the compliance-sensitive list
   (`major`, `pos,terminal`), so one incidental edit there pulls a declaration and three app builds
   into a one-line backend change.
7. **Do not restructure, rename, or re-title the existing seven tests in
   `posCheckoutAffiliateAttribution.unit.test.js`.** That file is named verbatim in Phase 220's
   compliance declaration's `verification_evidence` front matter. Append only.
8. **Do not "fix" #1240 or #1241 along the way** (§10). Both are filed, both are open, both are in
   files this PR must not touch anyway.
9. **Do not remove ADR 0036's 2026-08-31 amendment block or edit its existing bullets in place.**
   Add a new dated block that supersedes the stale "Known limitation" bullet by reference (§8) —
   `AGENTS.md`'s standing rule against rewriting dated historical records.
10. **Do not open this PR against `staging` or `main`.** `develop`, per `docs/ai/PR.md` and
    `.agents/skills/implement/SKILL.md`'s checkpoint table.

---

## 8. Governance

**Compliance impact declaration — NOT required (J5/F6).** No file in this PR matches
`check-compliance-impact.js`. `npm run check:compliance` passes with no declaration; verified by
running it. Do not add one on instinct, and do not let a reviewer add one on instinct either —
point at F6's transcript.

*If Pat overrides this*, the declaration to write is
`docs/compliance/impact-declarations/2026-08-31-pos-checkout-affiliate-code-validator.md`, using
`docs/compliance/impact-declarations/2026-08-31-pos-affiliate-attribution-commit-time-recheck.md`
as the structural template with: `classification: major`, `surfaces: pos,terminal`,
`reason_codes_impacted: AFFILIATE_CODE_INVALID` (**not `none`** — this phase makes that reason code
reachable on a route where it previously could not fire; see §9), `policy_version: 2026.08.31`,
`verification_evidence` naming both test files, and a `rollback_note` stating that reverting the
single key restores the strip with no data cleanup needed (commissions accrued while the key was
present remain valid rows; the change writes no new schema and no new column). A
`preflight_request_ref: NOT-EXECUTED-1239-…` is correct and expected on a `develop`-targeting PR —
`pr-reviewer` must not raise it as a finding (`.agents/skills/pr-reviewer/SKILL.md`, the #884 rule).

**ADR 0036 amendment — required, one dated `## Amendments` block, this PR (J6).** Not optional
paperwork: ADR 0036's 2026-08-31 block (line 348, added by Phase 220) contains a bullet reading
*"Known limitation, named rather than silently absent — POS's primary checkout route cannot reach
this fix today"* (lines ~396-403), which states that `checkoutPosSchema` strips the field and that
"no in-store commission has ever accrued through it." Shipping Phase 221 makes that false, in an
`authority_level: authoritative` document. The new block must record:

- that `affiliate_code` is now a declared key on `checkoutPosSchema`, so the primary
  `POST /pos/checkouts` route reaches the attribution path for the first time;
- that the 2026-08-31 block's "Known limitation" bullet is **retired by this amendment** (name it
  explicitly, by date and by its opening words, so the supersession is greppable);
- that Phase 220's commit-time re-verify semantics are **unchanged** — this phase changes only
  *reachability*, not behavior;
- that the entry-time `422 AFFILIATE_CODE_INVALID` gate is now reachable on this route, and what
  that means for a cashier (§9);
- that the *other* two "Known limitation" bullets in the 2026-08-31 block (the split-payment
  rollback hazard, and the offline-sync hard-reject) are **still open**, as #1241 and #1240 — do
  not let a reader infer that this amendment closed all three.

ADR 0039 route: `[default]`/untagged. ADR 0036's only `[binding]` clause is Decision 2 (integer
centavos / bps / rate snapshotting), untouched. **No new ADR, no tech-lead approval gate.**

**`docs/api/specification.md` — one line, recommended (J9).** Under `POST /pos/checkouts` (line
2674+), alongside the existing "Payment handoff policy" / optional-field notes, document
`affiliate_code` as an optional request field: what it does (in-store affiliate attribution, no
effect on price, VAT, discount, or receipt), and that an unresolvable code returns `422` with
`reason_code: AFFILIATE_CODE_INVALID`. No automated check enforces this (F7); it is the one place a
consumer would look and currently find nothing.

**Phase ledger entry** — all seven fields per `AGENTS.md`'s Continuous Phase Numbering rules;
`status: in_progress` at PR-open, `completed` only once the gates pass. "Next eligible phase" is
**222**; note that **218 remains an unfilled gap** and is not to be backfilled.

**Issue linkage: `Refs #1239`, not `Closes`.** This is behavior that needs deployed verification on
a real POS terminal (a cashier typing a real code and a commission row appearing), so per
`docs/process/ISSUE-TAXONOMY.md`'s linkage rule the issue stays open through merge, `pr-reviewer`
sets `For QA`, and `verifier` closes it.

**Checkpoint review (`.agents/skills/implement/SKILL.md`):** no migration file, no `staging`/`main`
base, no deploy dispatch, no force-push, and — unlike Phase 220 — **no compliance-declaration
checkpoint either** (F6). This phase trips **no** checkpoint rows. Proceed straight through
commit → push → PR.

---

## 9. The one real risk, named rather than buried

**A previously-impossible 422 becomes possible on the busiest POS route.**

Today, on `POST /pos/checkouts`, a cashier can type absolutely anything into the affiliate-code
field — a typo, a competitor's code, a revoked affiliate's code, their own initials — and the sale
completes, because the field never reaches the gate. After this fix, an unresolvable code makes
`posUseCases.js:2985-2990` throw `422 AFFILIATE_CODE_INVALID` and **the whole checkout is rejected**,
transaction rolled back, nothing written.

That is correct, intended behavior (it is what the gate was written for in the first place, and what
the split-payment path already does at session-create time — F2), but it is a **live behavior change
at the counter** on a route that has never exhibited it. Three things follow:

1. **It is not a regression and should not be "fixed" by softening the gate.** Weakening `:2985` to
   silently ignore a bad code would reintroduce exactly the silent-failure class #1239 exists to
   end, and would contradict the gate's own in-code rationale ("an invalid code rejects the checkout
   with clear feedback instead of silently losing the commission"). Out of scope either way.
2. **The error message the cashier sees is worth checking during QA.** The `DomainError` carries
   `'Affiliate code is invalid or the affiliate program is not enabled for this store'` with
   `reason_code: 'AFFILIATE_CODE_INVALID'`. Whether the POS UI surfaces that usefully or shows a
   generic "checkout failed" is **unverified** — `grep -rn "AFFILIATE_CODE_INVALID"` finds **zero**
   hits anywhere in `packages/web-core/` or the three frontend apps; it appears only in `docs/`.
   So the reason code is almost certainly *not* specially handled today. If QA finds the message
   opaque at the counter, that is a **new issue for `pm`** (§10 item 4), not a reason to hold this
   PR — the alternative is continuing to ship a field that does nothing at all.
3. **Blast radius if the code is wrong is bounded and reversible.** Worst case is a rejected
   checkout the cashier immediately retries with the field cleared. Nothing is written on the 422
   path; the transaction rolls back at the same point it already does for a dozen other validation
   failures.

Flag this paragraph in the PR body's `## Summary`, not only here. It is the single thing a reviewer
should think about, and it is the single thing a verifier should exercise on a live terminal.

---

## 10. What this phase does NOT do

Named explicitly, so nothing here reads as an oversight:

1. **#1240 — offline POS sync hard-rejects a whole synced sale when the affiliate was revoked**
   (open). `syncMobilePosCheckouts` (`mobilePosUseCases.js:365-375`) records the entry as
   `status: 'rejected'` and the completed, tendered, receipted offline sale is never created. That
   is a bigger defect than this one, it lives at the *entry gate* rather than the validator, it
   needs a product call ("accept the sale, drop the commission"), and it touches
   `posUseCases.js`/`mobilePosUseCases.js` — files this PR must not touch (§7 item 2). Filed; leave
   it filed.
2. **#1241 — split-payment completion can accrue a commission for a sale that then rolls back**
   (open). `buildCompletePosPaymentSessionUseCase` passes its own transaction into
   `checkoutPosUseCase` (`splitPaymentUseCases.js:1170-1175`), so `ownsTransaction === false`, the
   `:4400` commit is a no-op, and the accrual runs while the outer transaction is still open; the
   caller can still throw `POS_PAYMENT_SESSION_TOTAL_CHANGED` afterwards, and the landlord-DB
   commission/attribution rows do not roll back with the tenant-DB transaction. Pre-existing,
   unrelated to this validator, **and unaffected by this fix** — the split path does not route
   through `checkoutPosSchema` at all (F2). Filed; leave it filed.
3. **Phase 220's re-verification semantics.** Merged in PR #1242 (`f688f941f`). Not reopened, not
   adjusted, not re-tested beyond T6's incidental coverage.
4. **No operator- or merchant-facing surface for a dropped or rejected commission.** Today a
   dropped commission is a `logger.warn` and nothing else; an `AFFILIATE_CODE_INVALID` 422 is
   probably a generic error toast (§9 item 2). If merchants or affiliates are expected to reconcile
   these, that needs a real surface. **Named as a gap for `pm`, not proposed as work here** — and
   it is the natural follow-up if QA finds §9's cashier experience poor.
5. **The `validators/` gap in `check-compliance-impact.js` itself.** F6 shows a money-affecting POS
   request contract can be changed with no declaration required, because only
   `complianceValidator.js` is covered under `validators/`. Whether `posValidator.js` *should* be
   on that list is a real governance question with a cheap fix (one rule entry). **Worth a `pm`
   issue; deliberately not bundled here** — changing the classifier's rule list inside the very PR
   that benefits from its current shape would be the wrong PR to argue it in.
6. **Any storefront path** (`storeUseCases.js`, Phase 206). Untouched.
7. **Any DB migration, column, index, backfill, or historical repair.** In particular: **sales
   completed before this fix that carried an affiliate code are not retroactively commissioned.**
   There is no record of them — the code was stripped at the edge and never persisted anywhere, so
   the data to backfill from does not exist. State this plainly in the PR; someone will ask.
8. **Voids/reversals** (`reverseAffiliateCommissionForOrder`), **online settlement**
   (`settleAffiliateCommissionForOrder`), the **earnings cap** (#449 / Phase 208), the
   **category-rate ladder** (#448 / Phase 209), and **slot enforcement** (#1177 / Phase 198). All
   downstream of the enrollment this phase merely lets through; none change.

---

## 11. Current phase / next eligible phase

**Current:** Phase 221 — POS Primary Checkout Route: Restore `affiliate_code` Through the Validator
(#1239), `planned`.

**Next eligible:** **222.** The strongest candidates are #1240 (the offline-sync hard-reject, the
worst of the three defects Phase 220's verification turned up) and #1241 (the split-payment rollback
hazard). **218 remains an unfilled gap in the ledger and must not be backfilled** — 217, 219, and
220 are all ledgered around it (`AGENTS.md`, "Preserve historical phase numbers").

**After this phase ships, in-store affiliate attribution is live on all three POS entry points for
the first time** — with Phase 220's commit-time re-verify semantics applying to all three, since
they share one use-case body (F2). That is the sentence to put in the ledger's acceptance evidence,
and the thing for `verifier` to actually confirm on a live terminal.
