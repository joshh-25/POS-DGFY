---
status: draft_pr
owner: DGFY POS
last_reviewed: 2026-09-27
declaration_id: 2026-09-27-pos-items-scroll-followup
classification: major
surfaces: pos,terminal
reason_codes_impacted: ALLOWED,IMPACT_DECLARATION_REQUIRED
policy_version: 2026.09.25
verification_evidence: npm run check:architecture,npm run check:compliance,npm run build:pos,npx vitest run packages/web-core/src/features/pos/__tests__/terminalResponsiveScroll.contract.test.js,git diff --check
rollback_note: Revert the three responsive Items scroll changes and this declaration together, then rerun the POS build, compliance check, and focused responsive-scroll contract test. No API, database schema, item data, stock, pricing, checkout, payment, or migration change is included.
preflight_result: no_breach
preflight_reason_code: NOT_EXECUTED_LOCAL_ONLY
preflight_run_at: 2026-09-27T16:02:00+08:00
preflight_request_ref: POS-ITEMS-SCROLL-2026-09-27
---

# POS Items Catalog Scroll Follow-up

## Compliance Impact Classification

Major. This follow-up changes the responsive presentation and scroll ownership of the POS Items/catalog workspace. It is limited to frontend layout classes and focused contract coverage; it does not change fiscal calculations, payment authorization, tenant permissions, audit retention, item persistence, stock, pricing, or backend compliance decisions.

## Affected Surfaces

- POS Items/catalog workspace results region on mobile, tablet, and desktop layouts.
- POS terminal workspace sizing used to provide the Items results region with a bounded scroll container.

## Compliance Preconditions

- Existing POS authorization, tenant scoping, item persistence, filters, categories, pagination, and modal workflows remain unchanged.
- The change must not introduce page-level overflow behavior that hides required actions or alters saved item values.
- The Items workspace remains isolated from checkout/payment state and from non-POS IMS-only screens.
- No database migration, API route, schema, or data change is included.

## Verification Evidence

- `git diff --check` passed.
- `npm run build:pos` passed on the exact clean PR branch.
- `npm run check:architecture` passed.
- `npm run check:compliance` is included as the declaration validation command.
- The focused responsive-scroll contract test passed 8 relevant assertions; 6 pre-existing stale assertions in the same baseline contract file remain documented in the PR and are not caused by this diff.

## Residual Risk

- Browser verification should confirm vertical touch scrolling on mobile and full card visibility on desktop/tablet after the PR is deployed.
- The repository's version gate could not run in the clean worktree because the root dependency `madge` is not installed; no package or lockfile changed.
- The GitHub Project status update may require a token with `read:project` scope.
