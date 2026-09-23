---
status: reference
authority_level: reference
owner: engineering
last_reviewed: 2026-09-23
related_adr: 0086-dedicated-back-office-fourth-frontend-app-opis.md
declaration_id: 2026-09-23-opis-split-back-office-phase-461
classification: major
surfaces: pos,terminal,settings
reason_codes_impacted: ALLOWED,UI_LAYOUT,PERMISSION_BOUNDARY,AUTHORIZATION_FAILED
policy_version: 2026.09.23
verification_evidence: OPIS/cookie-namespace/CSRF/handoff/refresh unit suites; POS/IMS/Storefront/OPIS builds; architecture, compatibility-seam, agent-surface, documentation, hygiene, version, reachability, trigger, and diff checks
rollback_note: Revert the Phase 461 commits by domain; POS Back Office redirect and IMS handoff fall back to in-app/POS targets with no data migration to undo.
preflight_result: no_breach
preflight_reason_code: OPIS_BACKOFFICE_SPLIT
preflight_run_at: 2026-09-23T00:00:00+08:00
preflight_request_ref: NOT-EXECUTED-OPIS-2052-LOCAL-ONLY
---

# OPIS split of the Back Office into a dedicated app — Phase 461

## Compliance Impact Classification

Major because the change touches the browser-session transport (isolated `opis_*`
cookie namespace, CSRF cookie selection, tenant-context reads), POS terminal
presentation (Back Office routes become external OPIS redirects), and shared settings
hydration paths. It preserves existing API ownership, permission semantics, and
tenant/branch boundaries, and introduces no payment settlement, inventory mutation,
tenant-scope, database-schema, or production-data behavior. `major` (not `regulatory`):
no `compliance`-surface file changes.

The `NOT-EXECUTED-*` preflight placeholder above is the accepted norm at this stage
(an intermediate integration-branch PR, not a promotion to `main`): the compliance
preflight sweep reconciles it before any `release/* → main` promotion, and no
`NOT-EXECUTED-*` declaration may reach `main` except under the #1007 override.

## Affected Surfaces

- Browser-session issuance, refresh, CSRF bootstrap/enforcement, and logout for the
  new OPIS namespace; POS/IMS/Storefront session behavior unchanged (namespace
  defaults to `sku_*` when `x-dgfy-app-surface: opis` is absent).
- POS terminal presentation: `/backoffice/*`, `/business-admin/*`, `/sales`, and
  `/reports` redirect to OPIS preserving path and query; terminal, checkout, pairing,
  and shift flows untouched.
- Shared settings hydration: POS revalidates scoped settings on focus/visibility and
  reconnect (coalesced), reusing the existing same-origin refresh tasks.
- IMS retired merchant surfaces retarget their handoff origin from POS to OPIS with
  the same tenant/handoff-token contract.

## Compliance Preconditions

- The `x-dgfy-app-surface: opis` header is a cookie-namespace selector only; it grants
  no authorization. All permission, tenant, branch, and role checks remain server-side
  and unchanged.
- OPIS issuance/refresh/CSRF/clear paths never read, fall back to, or clear the
  legacy `sku_*` POS cookies, including under a shared `SESSION_COOKIE_DOMAIN`.
- No migration files, API contract changes, production deployment, transaction,
  account, tenant, ledger, inventory, or external-provider mutation is part of this
  change.
- Authenticated multi-role and cross-branch browser acceptance remains an explicit
  follow-up (Phase 459's deferred acceptance is unchanged); no repository E2E/company
  credentials are configured locally.

## Verification Evidence

- New suites: OPIS cookie-namespace isolation (issuance/refresh/CSRF/clear/select),
  OPIS handoff URL builders and blocked-popup recovery, focus/reconnect refresh
  triggers and coalescing, OPIS route/manifest canonical and alias coverage.
- Builds: `npm run build:opis`, `build:pos`, `build:skupervisor`, `build:store`.
- Gates: `check:architecture`, `lint:docs`, `check:compat-seams`,
  `check:agent-surfaces`, `check:compliance`, `check:pr-quality-workflow`,
  `check:workspace-hygiene`, `test:web-core-reachability`,
  `test:frontend-build-triggers`, `test:app-versions`, `git diff --check`.
- DNS records remain #2051; TLS and registry-pull prerequisites are recorded, not
  claimed complete.
