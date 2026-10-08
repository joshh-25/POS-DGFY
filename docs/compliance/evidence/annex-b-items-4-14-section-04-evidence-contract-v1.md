# Annex B Items 4-14 — Section 04 Evidence Contract

This contract records the local implementation and verification boundary for Items 4, 5, and 6 in `04_Fiscal_Documents_Adjustments_and_Readings.docx`. It is an internal readiness artifact. It does not claim BIR approval, provider approval, or legal acceptance.

## Scope

- Environment: local only.
- Time zone: `Asia/Manila`.
- Current phases: 354 (receipt evidence), 355 (adjustments and returns), and 356 (X/Z readings).
- Source of truth: server-owned transaction snapshots, append-only adjustment rows, fiscal events, and immutable Z-reading snapshots.
- Renderer: the existing `ReceiptPrintView` and `@sieitzz/pos-receipt` path for browser, 80 mm, and 57 mm projections.

## Implemented runtime contract

1. Fiscal document snapshots include template/version, issue time, seller, terminal, buyer, lines, tax totals, discounts, charges, payment breakdown, and a SHA-256 hash. Print/reprint evidence refuses an absent or tampered fiscal snapshot.
2. Adjustment evidence is labelled explicitly (`VOID`, `REFUND`, `RETURN`, `REPRINT`, or `REVERSAL`) and links to the original document number, date/time, and snapshot hash. The original transaction is not rewritten.
3. Returns are a distinct append-only `return` adjustment. The return records returned lines, reason, operator, shift, terminal, location, signed impact, idempotency hash, audit event, and fiscal reversal event where applicable. Payment refunds and inventory reversals are separate actions and are not silently performed.
4. X and Z readings use `Asia/Manila`, expose counters and reading identifiers, and return a hash of the serialized reading payload. Z close is blocked while branch shifts remain open and records a fiscal `z_reading` event.
5. Report reconciliation discloses transaction, payment, adjustment, reading-snapshot, and closed-shift inputs. Full-day filtered comparisons remain non-comparable rather than being presented as a pass.

## Fixture boundary

The deterministic fixture registry is [annex-b-items-4-14-section-04-fixture-manifest-v1.json](annex-b-items-4-14-section-04-fixture-manifest-v1.json). Regular, senior, PWD, service-charge, and non-fiscal projections are locally verified. Athlete and solo-parent projections remain `REVIEW_REQUIRED` because no authoritative policy/source fixture was supplied. That status is intentional and must not be converted into an unsupported runtime claim.

Return semantics are governed by [annex-b-return-readiness-contract-v0.1.md](annex-b-return-readiness-contract-v0.1.md): a return is not silently converted to a void or refund, and external fiscal treatment remains review-required.

## Verification commands

```text
npm run check:annex-b-section-04
npm run test:annex-b-section-04
npm run test:backend -- --runTestsByPath tests/fiscalEvidenceContract.unit.test.js tests/posReturn.usecase.test.js tests/posReadings.usecase.test.js tests/posReports.repository.test.js tests/posCheckoutFnbContracts.usecase.test.js
```

The execution report is [EXEC-04_Fiscal_Documents_Adjustments_and_Readings.docx](../../../output/plans/POS_BIR_Annex_B_Items_4_to_14_Readiness/execution/EXEC-04_Fiscal_Documents_Adjustments_and_Readings.docx). The machine-readable source and hashes are in [annex-b-items-4-14-section-04-evidence-contract-v1.json](annex-b-items-4-14-section-04-evidence-contract-v1.json).

## Explicit remaining gates

- Authorized fiscal/provider review of the final e-Journal grammar and retention/export rules.
- Authorized policy/source fixtures for athlete and solo-parent treatment, if those benefits are in scope for the merchant.
- Local database migration execution and tenant-schema evidence in an environment with the required MySQL services running.
- Release, rollback, and deployed-environment verification are out of scope for this local-only execution.
