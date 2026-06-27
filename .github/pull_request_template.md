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

## Batch Inventory And Promotion
- [ ] Batch inventory generated for this candidate
- Inventory artifact:
- [ ] Every changed file belongs to exactly one release batch
- [ ] Excluded work and non-goals are listed
- [ ] All batches are `ship`, or non-ship batches are removed from this PR
- [ ] Payment-sensitive changes are absent, or explicit payment-release approval is linked
- Required command:
```bash
npm run check:batch-inventory -- --base origin/master --head HEAD --write --require-ship
```

## Telemetry And Observability
- [ ] New behavior emits required events/metrics
- [ ] Event schema changes documented
- [ ] Dashboards/alerts updated (if needed)

## Rollout And Safety
- [ ] Migration and rollback steps documented
- [ ] Feature flag/gradual rollout strategy documented (if needed)
- [ ] Backward compatibility validated
- [ ] If this is a `staging -> master` promotion PR, exact staging SHA qualification evidence is linked
- [ ] Production deployment is not claimed complete until exact `origin/master` SHA proof and deployed-change accuracy review are complete

## Merge Adoption Evidence
- [ ] This PR does not require merge-adoption proof
- [ ] Merge-adoption manifest prepared for final master/deploy adoption
- Manifest path:
- Source refs and merge base:
- User-approved merge decisions:
  - If any conflict or semantic conflict affects UI, routing, API payloads, checkout steps, auth flow, customer dashboard data, governed docs, tests, or deployment gates, the AI agent asked the user what should win.
  - Approved decisions are recorded in `semantic_conflict_review.user_approved_decisions`.
- [ ] New PR/branch behavior is proved present in the final tree
- [ ] Preserved master behavior is listed and proved when the resolution combines both sides
- [ ] Rejected files/behavior have explicit reasons
- Required command:
```bash
npm run check:merge-adoption -- --manifest <manifest>
npm run check:merge-adoption-required -- --base origin/master --head HEAD --manifest <manifest>
```

## Documentation Citation (Required For Planning/Design Changes)
- Authoritative docs used:
- ADR referenced:
