---
status: authoritative
authority_level: authoritative
owner: product
last_reviewed: 2026-08-10
applies_to: fnb_mode
topic: fnb_operational_readiness_qa
---

# F&B Operational Readiness QA

This is the required QA gate before making final readiness ratings for Food & Beverage Mode. It exists because F&B readiness depends on the whole restaurant flow, not only isolated unit tests.

## Rating Rule

Do not assign final F&B readiness ratings until this command passes:

```bash
npm run qa:fnb-readiness
```

If the command is not run, the assessment must be labeled preliminary. If it fails, the rating must call out the failed step and cannot claim production readiness above controlled-pilot confidence.

## What The Gate Covers

The gate runs:

1. Backend F&B operational QA:
   - recipe ingredient shortfall diagnostics;
   - kitchen-ticket progress syncing check-line statuses;
   - Storefront accepted-order kitchen ticket duplicate protection;
   - POS existing-check ticket creation from persisted check lines.
2. Backend F&B use-case coverage:
   - checks;
   - kitchen tickets;
   - reservations;
   - service charge settings;
   - modifier and route assignments.
3. Backend POS/Storefront checkout coverage:
   - recipe ingredient deduction;
   - recipe shortfall rejection before commit/order creation;
   - F&B modifier validation;
   - Storefront idempotent retry behavior.
4. F&B integrity regression coverage:
   - conditional modifier migration rollback/reapply and index-error propagation;
   - Storefront modifier quantity validation before unknown-key stripping.
5. Frontend contract coverage:
   - kitchen queue display model;
   - POS terminal mode contracts;
   - Storefront customer-safe F&B error messages;
   - F&B route, API, and receipt-context contracts;
   - POS modifier and service-options edit-session isolation contracts.
   - folder inheritance, item precedence, and inherited-group exclusion contracts.
6. Production builds:
   - SKUpervisor;
   - POS;
   - Storefront.
7. Deterministic browser contract:
   - Storefront F&B item detail renders through the real Vite Storefront surface;
   - conditional modifier activation/deactivation works through keyboard input;
   - selected modifier quantity updates the customer-visible total;
   - the contract is checked at desktop and 390px mobile widths;
   - page errors, console errors, failed requests, HTTP 4xx/5xx responses,
     error-boundary text, and blank roots fail the test with retained evidence.
8. Governance gates:
   - architecture guardrails;
   - controller boundaries;
   - governed docs lint;
   - diff whitespace hygiene.

The gate is also executed as a blocking `quality-checks` reusable workflow in
`.github/workflows/pr-checks.yml`. CI additionally runs the complete backend
test matrix, open-handle diagnostics for F&B contracts, a fresh migration
runner schema smoke test, frontend lint/F&B contract tests/builds, the blocking
deterministic browser contract (`npm run test:e2e:fnb-contract`), required-index
auditing, and compatibility-seam validation. The browser contract uses a
dedicated Playwright configuration that starts only the Storefront Vite server;
it does not claim live tenant, payment, or POS lifecycle evidence.

## Manual Live QA Overlay

Automated readiness is required but does not replace operator UAT. Before raising UI or overall production readiness above `9.0/10`, capture manual evidence for:

1. POS F&B checkout with recipe stock available.
2. POS F&B checkout blocked by a named missing ingredient.
3. Storefront F&B quote/checkout with recipe stock available.
4. Storefront F&B quote/checkout blocked by a named missing ingredient.
5. Accepted Storefront order visible in the F&B kitchen queue.
6. Idempotent checkout retry without duplicate transaction, check lines, stock movements, or kitchen ticket.
7. Kitchen ticket progression across refresh:
   - queued/sent;
   - preparing;
   - ready;
   - served.
8. Existing dine-in check payment without duplicate active kitchen ticket.
9. Tablet-width kitchen queue readability.
10. No browser console errors during the above flows.

Use `docs/testing/manual-qa-readiness-runbook-pos-ims-store.md` for the broader IMS/POS/Store execution log format.

## Evidence Standard For Ratings

Use these thresholds when updating F&B ratings:

1. `Preliminary`: code review or partial tests only; `npm run qa:fnb-readiness` was not run.
2. `Controlled pilot`: `npm run qa:fnb-readiness` passes, but manual live QA evidence is incomplete.
3. `Production-ready candidate`: readiness gate passes and manual live QA evidence covers POS, Storefront, kitchen queue, retry/idempotency, and schema/provisioning checks.
4. `Production-ready`: candidate evidence plus production-like runtime smoke and sustained green history.

This prevents ratings from drifting above the evidence actually collected.
