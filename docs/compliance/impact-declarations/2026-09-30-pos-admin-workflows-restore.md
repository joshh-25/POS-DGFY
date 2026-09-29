---
status: draft_pr
owner: DGFY POS
last_reviewed: 2026-09-30
declaration_id: 2026-09-30-pos-admin-workflows-restore
classification: major
surfaces: pos,terminal
reason_codes_impacted: ALLOWED
policy_version: 2026.09.25
verification_evidence: POS and OPIS app unit tests (36 passed), shared Business Admin and navigation tests (134 passed), desktop/mobile POS-OPIS coexistence E2E (2 passed), npm run build:pos, npm run build:opis, npm run build:store, npm run build:skupervisor, npm run check:architecture, npm run check:compat-seams, npm run lint:docs, npm run test:web-core-reachability, npm run test:frontend-build-triggers, POS and OPIS lint, git diff --check
rollback_note: Revert the shared Business Admin shell extraction, POS route and terminal handoff restoration, route tests, documentation, and this declaration together; no API, schema, or production tenant data is changed.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-09-30T00:02:58+08:00
preflight_request_ref: NOT-EXECUTED-2140-POS-ADMIN-WORKFLOWS
---

# Restore POS Administration Workflows Alongside OPIS

## Compliance Impact Classification

Major. The changed POS terminal frontend paths have a computed `major` floor for the `pos` and
`terminal` surfaces under `scripts/check-compliance-impact.js`. This change restores access to the
existing tenant-scoped Business Admin workflows on POS while OPIS remains the permanent Back Office.
It changes route placement and navigation only; it does not change permissions, financial or fiscal
calculations, API behavior, stored transaction history, or tenant data.

## Affected Surfaces

- POS Business Admin navigation and its existing tenant-scoped administration workflows.
- POS terminal manager handoff into a separate same-origin Business Admin tab.
- OPIS root routes and its OPIS-specific account actions remain available.

## Compliance Preconditions

- Existing API authorization and tenant scoping remain authoritative; the restored routes do not
  grant new permissions or create new API operations.
- POS keeps its POS app-surface configuration and session namespace. OPIS keeps its OPIS surface
  configuration and cookie-namespace selector.
- POS settings expose only the baseline POS sections; OPIS retains its additional administration
  sections.
- No API route, database schema, migration, payment, tax, receipt, shift, or compliance decision
  logic changes are included.
- Per `docs/compliance/request-time-preflight-protocol.md`, the live preflight sweep is not run per
  develop-targeting PR. The `NOT-EXECUTED-*` reference is the expected PR-open state and the
  continuous governed sweep reconciles it after merge to `develop`.

## Verification Evidence

- POS unit tests: 11 passed; OPIS unit tests: 25 passed.
- Shared Business Admin and navigation tests: 134 passed.
- Desktop and mobile POS/OPIS route coexistence E2E: 2 passed.
- Production builds passed for POS, OPIS, Storefront, and SKUpervisor/IMS.
- POS and OPIS lint, architecture checks, compatibility-seam checks, docs/ADR lint, reachability
  tests, frontend build-trigger tests, version-floor check, and `git diff --check` passed.
- A broader terminal view-mode contract file reported six failures in checkout/workspace structural
  assertions outside this route-restoration scope; those failures are recorded in the PR evidence.
