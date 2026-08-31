## Summary
<!-- Put verified `Opened by (..., role)` output here first; omit it when identity is unproven. -->
- What changed
- Why this change is needed

## Promotion Summary (staging/main base only)
<!-- Required when this PR's base is `staging` or `main` — one row per item this promotion
     bundles, each citing its source issue and/or PR. Leave this whole section out (or mark N/A)
     on an ordinary `develop`-based PR. -->
| Area | Change | Source |
|---|---|---|

## Architecture Impact
- [ ] No architecture impact
- [ ] Within existing module boundary
- [ ] Cross-boundary change (ADR required)
- ADR link (if required):
- Changed layers:

## Architecture Compliance Evidence
- [ ] `npm run check:architecture` passed
- [ ] `npm run lint:docs` passed (if docs changed)
- [ ] Controller/model boundary preserved
- [ ] No new allowlist entry, or removal plan attached
- Validation output summary:

## Compliance Evidence
- [ ] `npm run check:compliance` passed
- [ ] Compliance declaration ID is included in this PR
- Compliance declaration ID:
- Computed classification rationale (path/surface floor):
- Preflight evidence reference (required for `major|regulatory`):
- [ ] Compliance declaration front matter is complete and accurate
- [ ] Declaration surfaces match changed compliance-sensitive files
- [ ] Preflight evidence reference is included (required for `major|regulatory`)
- [ ] Preflight result is `no_breach` (required for `major|regulatory`)
- [ ] Runtime preflight contract updated if API behavior changed

## Testing Evidence
- [ ] Unit tests updated/added
- [ ] Integration tests updated/added
- [ ] Manual verification performed (if applicable)
- Key test command outputs:

## Telemetry And Observability
- [ ] New behavior emits required events/metrics
- [ ] Event schema changes documented
- [ ] Dashboards/alerts updated (if needed)

## Rollout And Safety
- [ ] Migration and rollback steps documented
- [ ] Feature flag/gradual rollout strategy documented (if needed)
- [ ] Backward compatibility validated
- [ ] If this is a promotion PR (base `staging` or `main`), exact source-branch SHA qualification evidence is linked
- [ ] Production deployment is not claimed complete until the exact `main` SHA proof and deployed-change accuracy review are complete
- [ ] Source branch may be deleted after merge, or apply `branch-cleanup:keep` with a reason before merge

## Documentation Citation (Required For Planning/Design Changes)
- Authoritative docs used:
- ADR referenced:
