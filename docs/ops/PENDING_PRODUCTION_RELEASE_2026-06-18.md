---
status: reference
authority_level: reference
owner: operations
last_reviewed: 2026-06-18
applies_to: production_release, dgfy_company_access, dgfy_customer_account, storefront, pos, observability
topic: pending_production_release_inventory
---

# Pending Production Release Inventory - 2026-06-18

This inventory lists changes that are not on production using commit ancestry and production deploy evidence only. Do not use "likely deployed" or "likely not deployed" wording for this release.

## Proof Snapshot

Production proof collected on 2026-06-18:

- Production server `git rev-parse HEAD`: `fe740baa0004bb903f482e1ac403c2e0826a3c92`
- Production `.deploy-state/last_deployed_commit`: `fe740baa0004bb903f482e1ac403c2e0826a3c92`
- Latest production deploy summary: `logs/deploy/deploy_20260617_022915.summary.txt`
- Latest production deploy summary `deployed_head`: `fe740baa0004bb903f482e1ac403c2e0826a3c92`
- Local `origin/master`: `47f884729a165ef67d3d44481b3293815325e269`
- Local hardening head before this traceability pass: `20c3d36f63c6b6cc1a83e15298ddc3e9d401a647`
- Local release-candidate head after this traceability pass: use `git rev-parse HEAD` after committing this inventory, because the inventory commit hash changes when the file is amended.
- Ancestry proof: production is an ancestor of `origin/master`; `origin/master` is not an ancestor of production.
- Public health proof before this traceability pass: `https://skupervisor.dgfy.ph/api/v1/health` and `https://pos.dgfy.ph/api/v1/health` returned healthy production responses but `services.observability.runtime_sha` was empty. This is a traceability defect; release proof must use remote marker and deploy summary until the runtime-SHA fix is deployed.
- Report-mode production observability gate rerun against `https://skupervisor.dgfy.ph` for SHA `fe740baa0004bb903f482e1ac403c2e0826a3c92` recorded current live failures for `trace_context.round_trip` and `health.runtime_sha.present`. The local release candidate includes source and test fixes for those gaps, but production will remain unproven until the candidate is deployed and post-deploy health echoes the target SHA and trace headers.

Commands used:

```bash
ssh -p 64428 root@192.53.116.33 "cd /var/www/skupervisor && git rev-parse HEAD"
ssh -p 64428 root@192.53.116.33 "cd /var/www/skupervisor && cat .deploy-state/last_deployed_commit"
ssh -p 64428 root@192.53.116.33 "cd /var/www/skupervisor && tail -n 80 logs/deploy/deploy_20260617_022915.summary.txt"
git merge-base --is-ancestor 47f884729a165ef67d3d44481b3293815325e269 fe740baa0004bb903f482e1ac403c2e0826a3c92
git merge-base --is-ancestor fe740baa0004bb903f482e1ac403c2e0826a3c92 47f884729a165ef67d3d44481b3293815325e269
git log --oneline --reverse fe740baa0004bb903f482e1ac403c2e0826a3c92..origin/master
git log --oneline --reverse origin/master..HEAD
npm run gate:release:observability -- --base-url https://skupervisor.dgfy.ph --sha fe740baa0004bb903f482e1ac403c2e0826a3c92 --evidence-dir .tmp/release-gates/fe740baa-observability-current-prod-rerun
```

## Pushed To `origin/master` But Not Production

These commits are already on `origin/master` but are not on production because production is still at `fe740baa0004bb903f482e1ac403c2e0826a3c92`.

| Commit | Production status | Release scope |
| --- | --- | --- |
| `bcde3dfe` | Not deployed | Storefront and DGFY switching documentation refresh. |
| `94007f91` | Not deployed | Release evidence gate documentation refresh. |
| `f019d33a` | Not deployed | DGFY company access flows: explicit membership model, invitations, legacy link policy, ownership/switching backend changes, and migration `20260617000002-dgfy-only-company-access.cjs`. |
| `44db56cc` | Not deployed | DGFY company access runtime hardening: tenant-session membership bridge, DGFY POS terminal policy, auth/session/runtime changes. |
| `33f919e6` | Not deployed | DGFY access tests and rendered QA script `scripts/smoke-dgfy-access-ui.js`. |
| `47f88472` | Not deployed | DGFY company access documentation, security control matrix, testing/readiness updates. |

## Local `master` But Not `origin/master` Or Production

These commits are local-only and therefore are not deployable through `scripts/deploy-remote.sh` until pushed. Production deploys pull pushed `master`.

| Commit | Production status | Release scope |
| --- | --- | --- |
| `11021d99` | Not pushed, not deployed | POS safety slice: POS transaction validation, F&B checkout contract tests, sales reconciliation integration updates. |
| `a4dabf57` | Not pushed, not deployed | Merge alignment with upstream master during POS safety work. |
| `58994f05` | Not pushed, not deployed | Merge alignment with upstream master during POS safety work. |
| `f1fd44db` | Not pushed, not deployed | PR #20 POS safety and DGFY Storefront flow: Storefront customer flow, visual Storefront updates, POS shift/manual lock/hardware-message behavior, and related tests. |
| `be591f64` | Not pushed, not deployed | Merge commit for PR #20 POS and Storefront updates. |
| `20c3d36f` | Not pushed, not deployed | Post-merge hardening: DGFY return-target allowlist, no browser-readable customer token drift, no silent same-email store-customer linking, and production-source test anchor cleanup. |
| `HEAD hardening commit` | Not pushed, not deployed | Pending-production proof and hardening: runtime SHA health proof, trace-header CORS exposure, CSRF route mounting, observability gate hardening, official pending-release inventory, and DGFY auth modal asset optimization. |

## Readiness Hardening Added By This Pass

This pass adds production traceability hardening that must be included in the next release candidate:

- Backend health now resolves `services.observability.runtime_sha` from approved release env vars or, in production, `.deploy-state/last_deployed_commit`.
- Backend health now exposes `runtime_sha_present` and `runtime_sha_source`.
- The observability release gate records `health.runtime_sha.present` and `health.runtime_sha.matches_target`.
- The existing CSRF middleware is now mounted before cookie-authenticated unsafe routes, so `/api/v1/auth/refresh-token` requires a matching `x-csrf-token` header when browser session cookies are present.
- CORS now exposes `x-request-id` and `x-trace-id` response headers for browser-readable incident correlation.
- The observability release gate now invokes child processes without shell argument concatenation.
- Ops docs now treat a healthy response with missing runtime SHA as unproven deployment evidence.
- The bundled DGFY auth modal hero image was losslessly optimized while preserving dimensions and mode.
- Unused public duplicate images were removed because runtime references use the bundled asset import path.

## Feature And Surface Inventory Not Yet Production-Live

The diff from proven production SHA `fe740baa0004bb903f482e1ac403c2e0826a3c92` to the local release candidate spans 133 files. The release surfaces are:

- DGFY company access and switching: membership-only authorization, DGFY invitations, owner transfer, legacy link repair, company switcher, POS unlock, DGFY business audit rows, and migration support.
- DGFY customer account and Storefront customer flow: global account entry, absolute return handoff, guest/account checkout chooser, signed-in customer context, saved address behavior, tracking drawer, account page/business actions, and no customer-visible `company_token`.
- Storefront display and cosmetics: discovery/header account entry, F&B detail page, promo/review/footer sections, Solutions page, Storefront styles, optimized modal imagery, country flags, QR/share UI, and Storefront error copy.
- POS safety and operations: persistent terminal lock, DGFY POS unlock, shift open/close safety, opening cash requirement, closed-shift mutation blocking, POS discount validation, hardware message modal/bus, receipt print view updates, iMin bridge messaging, and reconciliation coverage.
- Security and session hardening: HttpOnly browser-session guard coverage, DGFY handoff/return allowlist, DGFY cookie fallback store-auth without silent email claiming, DGFY auth service cookie-session behavior, and token-storage guard expansion.
- Observability and release readiness: runtime SHA health proof, observability gate SHA checks, DGFY rendered UI smoke script, updated production/release docs, and compliance impact declarations.
- Tests and contract coverage: new/updated backend DGFY, POS, Storefront auth, health, release gate, browser session, frontend Storefront, DGFY auth, POS terminal, and rendered QA contracts.

## Release Readiness Rule

This inventory becomes production-ready only after:

1. The readiness hardening is committed.
2. Required local gates pass for the changed surfaces.
3. No-staging release evidence passes for the exact pushed target SHA.
4. Production deploy completes through `scripts/deploy-remote.sh --yes`.
5. Post-deploy proof shows the same SHA in remote `HEAD`, `.deploy-state/last_deployed_commit`, newest deploy summary `deployed_head`, and `/health.services.observability.runtime_sha`.
