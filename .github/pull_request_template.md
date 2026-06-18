## Summary
- What changed
- Why this change is needed

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

## Merge Adoption Evidence
- [ ] This PR does not require merge-adoption proof
- [ ] Merge-adoption manifest prepared for final master/deploy adoption
- Manifest path:
- Source refs and merge base:
- [ ] New PR/branch behavior is proved present in the final tree
- [ ] Preserved master behavior is listed and proved when the resolution combines both sides
- [ ] Rejected files/behavior have explicit reasons
- Required command:
```bash
npm run check:merge-adoption -- --manifest <manifest>
```

## Documentation Citation (Required For Planning/Design Changes)
- Authoritative docs used:
- ADR referenced:
