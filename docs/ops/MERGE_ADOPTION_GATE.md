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

For `combine` decisions, list `master_behaviors_preserved`. This is the explicit guard against adopting a new screen or backend path while accidentally dropping an older feature that still matters.

## Command
Run the gate directly:

```bash
npm run check:merge-adoption -- --manifest path/to/merge-adoption.json --report .tmp/release-gates/<sha>/merge_adoption_report.json
```

For no-staging production releases, make it part of the hard release gate:

```bash
MERGE_ADOPTION_MANIFEST=path/to/merge-adoption.json RELEASE_TARGET_SHA=<sha> npm run gate:release:no-staging
```

`scripts/gate-release-no-staging.js` records the merge adoption report path in `release_verdict.json` when `MERGE_ADOPTION_MANIFEST` is set.

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

## References
- `docs/START_HERE.md`
- `docs/architecture/ARCHITECTURE_BOUNDARIES.md`
- `docs/architecture/ARCHITECTURE_GOVERNANCE.md`
- `docs/ops/NO_STAGING_RELEASE_STANDARD.md`
- `docs/templates/MERGE_ADOPTION_MANIFEST_TEMPLATE.json`
