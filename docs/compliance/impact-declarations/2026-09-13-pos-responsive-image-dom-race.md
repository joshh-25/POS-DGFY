---
status: reference
owner: engineering
last_reviewed: 2026-09-13
related_adr: docs/architecture/adr/0071-frontend-split-into-three-apps.md
declaration_id: 2026-09-13-pos-responsive-image-dom-race
classification: regulatory
surfaces: pos,terminal,inventory,payments,settings,compliance
reason_codes_impacted: ALLOWED
policy_version: 2026.09.13
verification_evidence: focused ResponsiveImage and POS contract tests, shared frontend builds, compliance and version gates (see section below)
rollback_note: Plainly revert the shared ResponsiveImage fallback state, the two POS call-site prop changes, and the three consumer version bumps. No endpoint, permission, persisted-data, schema, or migration behavior changes.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-09-13T11:43:13.435Z
preflight_request_ref: PREFLIGHT-34755013653-2026-09-13-POS-RESPONSIVE-IMAGE-DOM-RACE
---

# POS ResponsiveImage DOM race fix (#1880)

## Compliance Impact Classification

Major by the path-based floor in `scripts/check-compliance-impact.js`: the two changed POS
component files match `packages/web-core/src/features/pos/`, which maps to the `pos,terminal`
surfaces. The substantive change is a frontend rendering-stability fix: responsive image fallback
selection and final-error hiding are now React-owned state instead of imperative DOM mutation.

This is not regulatory. It does not change authentication, authorization, payment capture, tax
calculation, compliance policy enforcement, tenant configuration, API contracts, or persisted data.

## Affected Surfaces

1. `packages/web-core/src/components/media/ResponsiveImage.jsx` — shared `<picture>`/`<img>` shell
   now resolves fallback URLs as pure data, removes responsive sources through React state, and
   hides a terminally failed image through a declarative prop.
2. `packages/web-core/src/features/pos/components/TerminalOperationsWorkspace.jsx` — POS item
   thumbnails pass their existing large/icon candidates to the shared shell.
3. `packages/web-core/src/features/pos/components/SkupervisorPOSCheckoutTerminal.jsx` — POS
   catalog cards pass their existing large/icon candidates to the shared shell; the external
   catalog-image error remains represented by existing React state.
4. `packages/web-core/src/utils/assetUrl.js` — the former DOM-mutating fallback helper is replaced
   with a pure next-candidate resolver.
5. `apps/dgfy-ims`, `apps/dgfy-pos`, and `apps/dgfy-storefront` package manifests and lockfiles —
   patch-level fan-out required because all three consume `packages/web-core` as a file dependency;
   no dependency tree changes.

## Compliance Preconditions

1. **Existing image precedence is preserved.** The original image URL is tried first, followed by
   the already-provided configured-large and icon fallback candidates; duplicate candidates are not
   retried.
2. **No new authorization path or API contract.** The change only affects client-side image
   rendering in already-gated POS views. No request, response, permission, or tenant-scope logic is
   changed.
3. **No persisted-data change.** No schema, migration, database, payment, tax, or compliance-policy
   file is touched.
4. **React owns the complete `<picture>` subtree.** Error handling schedules a React rerender and
   never removes `<source>` or mutates `srcset`/`hidden` directly, preserving reconciliation and
   unmount safety.

## Verification Evidence

- Focused shared tests: `ResponsiveImage.test.jsx` and `assetUrl.test.js` — 2 files, 13 tests
  passed.
- Focused POS regression contracts — 4 files, 15 tests passed.
- Targeted ESLint invocation completed with 0 errors; it reported only pre-existing warnings in
  the large POS component files.
- `npm install` completed for all three frontend workspaces with package-lock files synchronized;
  no dependency versions changed.
- `npm run check:compliance`, the three frontend builds, and version validation are captured in the
  PR's final testing evidence.

## Residual Risks

1. The issue's acceptance criterion requiring a full post-deploy Sentry release cycle cannot be
   proven in this implementation session. It is explicitly deferred to the Verifier after merge
   and deployment; the issue remains In Progress until that evidence exists.
2. This declaration covers the POS-sensitive component paths required by the local compliance
   guard. The shared media utility/test changes do not introduce a new regulated data path.

## Preflight Reconciliation

The live `POST /api/v1/compliance/preflight` request was not executed in this local implementation
session. `preflight_request_ref` records that fact explicitly; the normal promotion-time compliance
preflight sweep remains required before release.
