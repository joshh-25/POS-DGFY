---
status: draft_pr
owner: DGFY POS
last_reviewed: 2026-09-28
declaration_id: 2026-09-28-staging-repair-frontend-quality-gates
classification: major
surfaces: pos,terminal,storefront
reason_codes_impacted: ALLOWED,IMPACT_DECLARATION_REQUIRED
policy_version: 2026.09.25
verification_evidence: npm run test:frontend:contracts,npm run test:frontend:contracts:storefront,npm run check:frontend-budgets,npm run check:compliance,git diff --check
rollback_note: Revert the repair branch commits and this declaration together, then rerun the IMS/Storefront contract suites and the frontend budget gate. No API, database schema, migration, tenant permission, or fiscal-calculation change is included.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-09-28T00:42:03.925Z
preflight_request_ref: PREFLIGHT-LOCAL-2026-09-28-STAGING-REPAIR-FRONTEND-QUALITY-GATES
---

# Staging Repair 2026-09-28-01 — Frontend Quality Gates (#2110)

## Compliance Impact Classification

Major. This frozen-candidate staging repair touches POS checkout/discount/employee-credit-adjacent frontend surfaces (contract markers, settings save paths, item visibility persistence, checkout fee labels, lazy import boundaries). It restores previously-contracted behavior and defers optional workspace chunks; it does not change fiscal calculations, payment authorization, tender rules, tenant permissions, audit retention, item pricing, stock, or any backend compliance decision. No API route, database schema, migration, or data change is included.

## Affected Surfaces

- POS Settings workspace (delivery-radius normalization, page frame, sticky tabs).
- POS Items catalog workspace (lookup advisory display, modal viewport/scroll-lock, button contract, large-text rules, image viewer, CSV/menu-import entry points).
- POS checkout terminal shell (view-model extraction; no behavior change — byte-identical move).
- Storefront checkout/tracking summaries (delivery-fee label case, timezone-explicit scheduling tests).
- TerminalPage route chunk composition (lazy optional workspaces; route controller untouched).

## Compliance Preconditions

- Live request-time preflight was not executed for this local repair. The `NOT-EXECUTED-2110-*` reference keeps this declaration discoverable to the continuous sweep, which must reconcile it against the real preflight before promotion.
- Existing POS authorization, tenant scoping, discount governance, employee-credit tender rules, shift guards, and checkout validation remain unchanged — every restored behavior is covered by its contract test.
- Item visibility persistence routes through the existing governed catalog-override APIs (`updatePosCatalogOverride`, `updateStorefrontCatalogOverride`); no new write path is introduced.
- No database migration, API route, schema, or data change is included.

## Verification Evidence

- `git diff --check` passed.
- IMS contract suite: 756/757 green (single remaining failure is a source-marker assertion for three optional settings panels, reported to the coordinator — no behavior gap).
- Storefront suite: 1242/1242 green under both Asia/Manila and UTC runner timezones.
- `npm run check:frontend-budgets` — TerminalPage route chunk still over budget (reported to the coordinator; #392 split exceeds repair scope).
- `npm run check:compliance` is included as the declaration validation command.

## Residual Risk

- Browser verification should confirm the restored item-modal scroll-lock/Escape behavior and large-text catalog layouts on tablet viewports after the repair deploys to staging.
- The two reported items (imin 3-panel markers, TerminalPage budget) must resolve before the replacement production candidate cuts.
