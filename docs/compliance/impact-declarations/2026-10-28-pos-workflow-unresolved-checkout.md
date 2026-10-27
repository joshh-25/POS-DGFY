---
status: draft_pr
owner: DGFY Platform
last_reviewed: 2026-10-28
related_adr: docs/architecture/adr/0014-multi-template-modes-pos-offline-sync-and-storefront-cache-contracts.md
declaration_id: 2026-10-28-pos-workflow-unresolved-checkout
classification: major
surfaces: pos,terminal
reason_codes_impacted: NONE
policy_version: 2026.10.16
verification_evidence: Focused POS/settings regression suites passed 135 tests across 13 files, including empty-cache online recovery and cached F&B start. Production builds passed for POS, IMS, and OPIS. Architecture, docs/ADR, compliance, and app-version checks passed on 2026-10-28.
rollback_note: Revert the workflow provenance state, POS reconnect notice and checkout guard, focused regressions, ADR 0014 amendment, and this declaration together. No server record, API contract, or database schema changes.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-10-27T16:39:34.607Z
preflight_request_ref: PREFLIGHT-LOCAL-1793119035405-2026-10-28-POS-WORKFLOW-UNRESOLVED-CHECKOUT
---

# Block new POS checkout while workflow settings are unresolved (#2824)

## Compliance Impact Classification

Major. The reconnect-state UI and its regression coverage live under
`packages/web-core/src/features/pos/`, whose path-based floor is `major` on the
`pos,terminal` surfaces. The client must not offer a guessed order method or
accept a new sale while it has no resolved workflow. This does not change the
server's authorization, payment, fiscal, or data-persistence rules.

## Affected Surfaces

- POS terminal checkout: show a reconnect state instead of Counter order methods
  when workflow settings are unresolved, and prevent new checkout until settings
  load or an existing F&B check supplies its own order method.
- Workflow settings consumers: expose whether the active workflow came from the
  server, the tenant-scoped last-known-good cache, or no resolved source.

## Compliance Preconditions

The local request-time preflight ran against the repository's ephemeral API
fixture on 2026-10-28 PHT and returned `no_breach` with reason `ALLOWED`. The
front matter records the run time and `PREFLIGHT-LOCAL` reference. This client
change adds no API, authorization, payment, fiscal, schema, or server-record
behavior; existing server-side checks remain authoritative.

## Verification Evidence

On 2026-10-28, the focused workflow-provider, POS checkout, readiness, presentation-matrix,
existing-checkout, and workflow-flip regressions passed: 135 tests across 13 files. The empty-cache
recovery test verified that the reconnect state is replaced by F&B checkout with Dine In selected,
Table # and Order Notes visible; the cached-start test verified the same F&B affordances without a
reconnect notice. Production builds passed for `apps/dgfy-pos`, `apps/dgfy-ims`, and `apps/dgfy-opis`.
`npm run check:architecture`, `npm run lint:docs`, `npm run check:compliance`, and
`node scripts/check-app-version-bump.js` passed. The version checker found no changed-app bump
requirement for an ordinary develop PR under ADR 0081.

## Residual Risks

An unresolved workflow delays starting a new sale until the settings request
succeeds or the cashier retries. Existing F&B check settlement and operator-
controlled replay of already queued sales remain available.

## Rollback

Revert the workflow provenance state, POS reconnect notice and checkout guard,
focused regressions, and ADR 0014 amendment together. No data rollback is
required.
