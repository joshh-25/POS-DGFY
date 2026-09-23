---
status: reference
authority_level: reference
owner: engineering
last_reviewed: 2026-09-23
related_adr: 0086-dedicated-back-office-fourth-frontend-app-opis.md
declaration_id: 2026-09-23-opis-stabilization-phase-464
classification: major
surfaces: pos,terminal
reason_codes_impacted: ALLOWED,UI_LAYOUT
policy_version: 2026.09.23
verification_evidence: dgfy-api pos-module import evaluation (pre-fix ReferenceError reproduced, post-fix IMPORT OK with dummy secrets, no DB); node --check; OPIS suite (27 files, 125 tests, green); build:opis
rollback_note: Revert the Phase 464 commits by domain; the api crash-loop returns if the import line is reverted (DEV 502s resume); OPIS routing/links fall back to the redirect/dead-link behavior with no data migration to undo.
preflight_result: no_breach
preflight_reason_code: OPIS_STABILIZATION
preflight_run_at: 2026-09-23T15:03:52Z
preflight_request_ref: NOT-EXECUTED-OPIS-2052-STABILIZATION-LOCAL-ONLY
---

# OPIS stabilization follow-up — Phase 464

## Compliance Impact Classification

Major because the change touches the POS terminal surface (`apps/dgfy-api/src/modules/pos/`,
`packages/web-core/src/features/pos/`): it restores the intended `posTerminalDeviceService`
wiring (missing import crashing DEV `dgfy-api`), moves the OPIS overview to `/`, and turns
three dead in-app "Open POS terminal" links into real cross-origin POS navigation. It
preserves existing API ownership, permission semantics, tenant/branch boundaries, and the
device-proof contract — it restores intended behavior rather than changing behavior.
`major` (not `regulatory`): no `compliance`-surface file changes.

The `NOT-EXECUTED-*` preflight placeholder above is the accepted norm at this stage
(an intermediate integration-branch PR, not a promotion to `main`): the compliance
preflight sweep reconciles it before any `release/* → main` promotion, and no
`NOT-EXECUTED-*` declaration may reach `main` except under the #1007 override.

## Affected Surfaces

- POS terminal device enrollment wiring: `posTerminalDeviceService` import restored in
  `apps/dgfy-api/src/modules/pos/index.js`; all 8 usage sites (device-proof assertion,
  activation/issue/list/revoke/replace/challenge/verify use cases) resolve again with
  no contract change.
- OPIS presentation routing: `/` renders the Back Office overview directly; every other
  section stays under `/backoffice/*`; `/business-admin/*` remains an alias.
- OPIS-to-POS terminal navigation: dead react-router `<Link to="/terminal">` affordances
  become real cross-origin URLs via a POS-origin builder reusing the existing
  origin-resolution mechanism; the settings dirty-guard (confirm + `onLeave`) contract
  is preserved for guarded sites.

## Compliance Preconditions

- The added import resolves an existing `ReferenceError`; it grants no new authorization,
  changes no permission check, and mutates no tenant, branch, or device state.
- The `buildPosTerminalUrl` builder carries path + query only (no token, no session);
  company switching and auth flows are untouched.
- No migration files, API contract changes, production deployment, transaction,
  account, tenant, ledger, inventory, or external-provider mutation is part of this
  change.
- `infrastructure/nginx-host/*.conf` untouched; the DEV 502 is the backend crashLoop,
  not a routing defect.

## Verification Evidence

- Backend: `node --check apps/dgfy-api/src/modules/pos/index.js` clean; module import
  evaluation with dummy `JWT_SECRET`/`REFRESH_TOKEN_SECRET` (≥32 chars, no DB):
  pre-fix `ReferenceError: posTerminalDeviceService is not defined`, post-fix
  `IMPORT OK`.
- OPIS: full suite green (27 files, 125 tests); `npm run build:opis` passes.
- Web-core: `opisBackOfficeHandoff` suite extended with `buildPosTerminalUrl` cases
  (default path, opis→pos host mapping, localhost dev port, query preservation,
  `VITE_POS_TERMINAL_URL` override).
- Gates: `npm run check:compliance -- --staged`, `npm run check:architecture`,
  `npm run lint:docs`, `git diff --check`, and the pre-commit marker scan clean.
- Live DEV verification (post-push, post-redeploy) recorded in the Phase 464 ledger
  entry: api `RestartCount` stable, `/api/health` 200, no more 502s, `/` renders the
  overview with no redirect flash, `/backoffice/overview` redirects to `/`, POS
  terminal links land on the real POS origin.
