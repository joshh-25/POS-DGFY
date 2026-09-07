---
status: reference
owner: engineering
last_reviewed: 2026-09-07
declaration_id: 2026-09-07-pos-catalog-page-undefined-refs
classification: major
surfaces: pos,terminal
reason_codes_impacted: ALLOWED
policy_version: 2026.09.07
verification_evidence: see "## Verification Evidence" section below (npm run build:pos,
  npm run build:skupervisor, post-build bundle greps confirming the three free identifiers
  are gone, npm run check:compliance)
rollback_note: Plain revert restores the broken pre-fix state (a ReferenceError on every POS
  Items workspace load) -- there is no working behavior to lose. The change is confined to one
  function body in one shared-trunk service file plus three package.json version bumps; no
  endpoint, permission, schema, or settings surface is touched.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-09-07T03:20:00.000Z
preflight_request_ref: NOT-EXECUTED-1698-POS-CATALOG-PAGE-UNDEFINED-REFS
---

# Repair `fetchPosCatalogPage`'s three undefined identifiers, restoring the POS Items workspace (#1698)

## Compliance Impact Classification

Major. Driven entirely by one rule in `scripts/check-compliance-impact.js`'s
`COMPLIANCE_SENSITIVE_RULES`, confirmed by running the check rather than predicted:

- `^packages/web-core/src/features/pos/` — matches
  `packages/web-core/src/features/pos/services/posService.js` → surfaces `pos,terminal`,
  floor `major`.

`apps/dgfy-ims/package.json`, `apps/dgfy-pos/package.json` and
`apps/dgfy-storefront/package.json` (version bumps only, ADR 0081 fan-out) match no rule.

**Not `regulatory`**: nothing here touches `packages/web-core/src/features/compliance/`,
`apps/dgfy-api/src/modules/compliance/`, `routes/compliance.js`, `compliancePolicy.js`,
authentication, or tenant provisioning.

## Affected Surfaces

1. **`packages/web-core/src/features/pos/services/posService.js`** — `fetchPosCatalogPage()`
   only. Three identifiers referenced by that function since commit `92aa57c44` (PR #1679) are
   neither imported nor defined anywhere in the repository, so the function threw
   `ReferenceError: getBrowserSessionSnapshot is not defined` on its very first statement, on
   every call, in every tenant and environment:
   - `getBrowserSessionSnapshot` — exists in `packages/web-core/src/services/browserSession.js`;
     now imported.
   - `coordinateCatalogRead` — does not exist; the wrapper is replaced with the direct
     `api.get('/pos/catalog', { params: pagedParams })` call it was wrapping.
   - `reconcilePosImageUploads` — does not exist; the `void` call is removed.

   No other function in this file is touched. `fetchPosCatalog` (the checkout terminal's own
   non-paged read, unaffected by the defect) is unchanged.

2. **`apps/dgfy-ims/package.json`, `apps/dgfy-pos/package.json`,
   `apps/dgfy-storefront/package.json`** — patch version bumps for the `packages/web-core`
   fan-out (ADR 0081). Required so `deploy-main.yml` can publish new image tags; no code change.

**Explicitly out of scope, confirmed untouched**: the API side
(`apps/dgfy-api/src/modules/pos/**` — the `GET /api/v1/pos/catalog` endpoint, its use case, and
its repository are all healthy and were never reached on the broken path), every other
`packages/web-core` service, and `TerminalOperationsWorkspace.jsx` (its caller is already correct;
the defect was entirely inside the service it calls).

## Compliance Preconditions

1. **No new endpoint, no new request shape.** The repaired function issues exactly the request the
   author intended — `GET /pos/catalog` with `paginate: true` — through the same shared `api`
   axios instance, with the same auth/CSRF/tenant headers every other POS read already uses. No
   new query parameter, no new route.
2. **No new authorization path.** The endpoint's server-side gate
   (`checkPermission(PERMISSIONS.POS.actions.VIEW_POS)`, `apps/dgfy-api/src/routes/pos.js:188`) is
   untouched, as is the client-side `canViewPos` guard in `ItemsWorkspace.loadItems()`.
3. **Cross-tenant read isolation is preserved, not weakened.** The mid-flight company-switch guard
   (`getBrowserSessionSnapshot().generation !== session.generation` → throw) is kept and, for the
   first time, actually executable — before this fix the function threw on the line that captured
   the pre-request snapshot, so the guard never ran at all. Server-side tenant scoping
   (`x-company-token` → `TenantHandler`) was and remains the primary isolation control; this guard
   is the client-side belt-and-braces on top of it.
4. **No data written, no schema change, no migration.** This is a read path only.

## Verification Evidence

- `npm run build:pos` — succeeds (Vite/Rollup, 8.82s).
- `npm run build:skupervisor` — succeeds (16.67s). Both apps ship this shared-trunk file; the
  storefront bundle never contained this code path (`grep -c` = 0 in its deployed bundle) but is
  version-bumped for the fan-out per ADR 0081.
- **Post-build bundle grep, the direct proof the defect is gone**: `coordinateCatalogRead` and
  `reconcilePosImageUploads` now appear **0 times** in `apps/dgfy-pos/dist/assets/*.js`, and
  `getBrowserSessionSnapshot` appears **0 times** as a literal (it minifies now that it resolves
  to a real import). Before the fix, the deployed production bundle
  (`dgfy-platform-dgfy-pos-1:/usr/share/nginx/html/assets/index-BxBMgvap.js`) contained each of
  the three **unminified**, exactly once — Rollup's signature for a free global it could not
  resolve.
- `npm run check:compliance` — confirms this declaration covers every compliance-sensitive file
  in the diff.
- `node scripts/check-app-version-bump.js` — PASS for all five apps.

## Residual Risks

1. **No automated regression test is added by this PR.** `packages/web-core` has no test wiring of
   its own in the consuming apps' `lint`/`test` scripts for this file, and adding one is a larger
   change than a production hotfix should carry. The bundle-grep evidence above is the substitute;
   the durable fix is the lint-coverage follow-up in item 2.
2. **`packages/web-core` has zero ESLint coverage in CI — the actual reason this shipped.** Its
   `.eslintrc.json` does extend `eslint:recommended` (whose `no-undef` would have failed all three
   identifiers as errors), but the package has no `lint` script and no `node_modules` of its own,
   and each consuming app lints only its own `src` tree
   (`apps/dgfy-pos/package.json` → `"lint": "eslint src vitePosOfflinePrecachePlugin.js --ext
   .js,.jsx"`). The shared trunk all three apps depend on is therefore never linted. Tracked as a
   follow-up on #1698; not fixed here, because widening lint scope to a previously unlinted tree
   would surface an unbounded backlog of pre-existing findings mid-incident.
3. **The catalog page read is unbatched and uncoordinated.** `coordinateCatalogRead` appears to
   have been intended as an in-flight request coordinator (deduping concurrent identical reads by
   the `key` the deleted line computed). No such helper was ever written. The repaired function
   issues one request per call, which is what `fetchPosCatalog` — the sibling this path replaced —
   already did. If duplicate-read coordination is genuinely wanted, it is a separate, non-urgent
   change.

## Preflight Reconciliation

`POST /api/v1/compliance/preflight` has not been executed against a live environment —
`preflight_request_ref` is declared `NOT-EXECUTED-1698-POS-CATALOG-PAGE-UNDEFINED-REFS`.

**This PR targets `main` directly as a production hotfix, so the ordinary reconciliation route does
not apply and the gap is stated here rather than left implicit.** Per
`docs/compliance/request-time-preflight-protocol.md`, the continuous
`compliance-preflight-sweep.yml` only reconciles declarations reachable from `develop`, and its
reconciliation PR is hardcoded to `--base develop`. A `main`-based hotfix branch is outside that
loop by construction.

Two ways to close it, both a human's call, neither performed by this PR:

1. Dispatch `compliance-preflight-sweep.yml` and merge its reconciliation PR into `develop` *after*
   this hotfix is back-ported there, so the declaration reaches a real `PREFLIGHT-*` ref on the
   branch the sweep can actually see; or
2. Accept the `NOT-EXECUTED-*` ref reaching `main` under an explicit, logged authorization — the
   same class of decision `docs/ops/RELEASE_CANDIDATE_POLICY.md`'s 2026-08-25 amendment (#1007)
   already defines as the one legitimate way a `NOT-EXECUTED-*` declaration may land on `main`.

The substantive compliance posture is unchanged either way: this is a read-path repair that adds no
endpoint, no permission path, and no data surface (see "Compliance Preconditions" above).
