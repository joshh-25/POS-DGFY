---
status: reference
authority_level: reference
owner: release
last_reviewed: 2026-06-18
applies_to: release_management
topic: merge_adoption_gate
---

# Merge Adoption Gate

## Purpose
Prevent a branch or PR from appearing "merged" by commit ancestry while the intended UI, backend behavior, docs, or safety contract is absent from the final production release.

Use this gate when a release adopts work from another branch, PR, or reference handoff such as `merge-docs/`. This is especially important when conflict resolution must combine both sides rather than replace one side wholesale.

## Required Inputs
Create a merge adoption manifest from:

- `docs/templates/MERGE_ADOPTION_MANIFEST_TEMPLATE.json`

For each adopted feature area, record:

1. The intended behavior.
2. Whether the resolution is `adopt`, `combine`, `preserve-master`, or `reject`.
3. Files that must exist or must not exist in the final tree.
4. Strings or code anchors that prove the visible/API behavior is present.
5. Strings or code anchors that prove unsafe or stale behavior is absent.
6. Tests that validate the behavior.
7. Rendered QA or production evidence required before calling the release complete.

The manifest must also include `semantic_conflict_review`. Use `status: "none"` only when the adopting agent reviewed the merge and found no conflict or semantic conflict affecting behavior. Use `status: "user-approved"` when any conflict affects UI, routing, API payloads, checkout steps, auth flow, customer dashboard data, governed docs, tests, or deployment gates. In that case, each entry in `user_approved_decisions` must record the question asked, the selected resolution (`adopt`, `combine`, `preserve-master`, or `reject`), who approved it, and why that resolution is correct.

Mechanical conflicts such as import ordering or formatting can be resolved using repository conventions. Behavioral conflicts must not be resolved silently. The agent must ask the user what should win before editing the final tree, and the chosen decision must be recorded in the manifest.

For `combine` decisions, list `master_behaviors_preserved`. This is the explicit guard against adopting a new screen or backend path while accidentally dropping an older feature that still matters.

## Command
Run the gate directly:

```bash
npm run check:merge-adoption -- --manifest path/to/merge-adoption.json --report .tmp/release-gates/<sha>/merge_adoption_report.json
```

On pull requests, run the required-proof gate as well:

```bash
npm run check:merge-adoption-required -- --base origin/master --head HEAD --manifest path/to/merge-adoption.json
```

`check:merge-adoption-required` fails when high-risk Storefront, checkout, DGFY auth, customer dashboard, Store API, or customer-order paths changed without a merge adoption manifest. If a high-risk PR truly does not adopt branch behavior, the PR can set `MERGE_ADOPTION_NOT_REQUIRED=1`, but the reason must be stated in the PR and the release reviewer remains responsible for confirming this is not a customer-flow adoption.

For no-staging production releases, make it part of the hard release gate:

```bash
MERGE_ADOPTION_MANIFEST=path/to/merge-adoption.json RELEASE_TARGET_SHA=<sha> npm run gate:release:no-staging
```

`scripts/gate-release-no-staging.js` now runs the required-proof gate for every release. If high-risk customer-flow paths changed, the release must provide a manifest and the verdict records the merge adoption report path. If no high-risk paths changed, the verdict may record `merge.adoption.not_required` with the checked base/head detail.

Missing or failing required adoption proof is non-bypassable. Emergency bypass can document incident context, but it cannot make a release deployable when the final tree lacks adoption proof for high-risk Storefront, checkout, DGFY auth, tracking, customer dashboard, Store API, or customer-order changes.

## Source-Added File Check
If the manifest includes `source_refs`, the gate inspects files added by each source branch:

```json
{
  "source_refs": [
    {
      "ref": "origin/pr/20",
      "base": "28a1504feccef3d9a3e48d12d6fbc29f85961abe"
    }
  ]
}
```

Every file added by `base..ref` must either exist in the final tree or be listed in `explicitly_rejected_files` with a reason. This catches the failure mode where a PR-added component, service, migration, or test is silently left behind during merge resolution.

## Production Completion Rule
A merge adoption gate passing locally is not enough to call production complete. Production completion still requires:

1. The release gate verdict for the exact deployed SHA.
2. Frontend asset parity for the served production bundle.
3. Rendered desktop and mobile QA for the affected surface.
4. Backend/API smoke or focused tests for affected server behavior.
5. A note in the release evidence that the adopted feature areas from the manifest were checked live.
6. Production deployment source contract evidence proving Git HEAD, `.deploy-state`, deploy summary, and runtime health SHA all match the target SHA.

## References
- `docs/START_HERE.md`
- `docs/architecture/ARCHITECTURE_BOUNDARIES.md`
- `docs/architecture/ARCHITECTURE_GOVERNANCE.md`
- `docs/ops/NO_STAGING_RELEASE_STANDARD.md`
- `docs/ops/STOREFRONT_PR_ADOPTION_HANDOFF.md`
- `docs/templates/MERGE_ADOPTION_MANIFEST_TEMPLATE.json`
