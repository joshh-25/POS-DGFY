---
status: reference
authority_level: reference
owner: release
last_reviewed: 2026-06-18
applies_to: storefront_prs, customer_flow_prs, release_management
topic: storefront_pr_adoption_handoff
---

# Storefront PR Adoption Handoff

Use this when another developer opens a PR that adopts Storefront, checkout, DGFY auth, tracking, or customer dashboard behavior from another branch.

## Required Developer Sequence

1. Pull latest `master`.
2. Create a fresh branch from latest `master`.
3. Adopt the intended source branch behavior into that branch.
4. Do not wholesale replace current `master` files just to avoid conflicts.
5. If a merge or semantic conflict affects UI, routing, API payloads, checkout steps, auth, customer dashboard data, governed docs, tests, or deployment gates, ask the user what should win before resolving it.
6. Record every user-approved behavior decision in the merge adoption manifest under `semantic_conflict_review.user_approved_decisions`.
7. Add or update `docs/release/merge-adoption/<pr-name>.json`.
8. Run the validation commands below before requesting review.

## Required Commands

```bash
npm run check:merge-adoption -- --manifest docs/release/merge-adoption/<pr-name>.json
npm run check:merge-adoption-required -- --base origin/master --head HEAD --manifest docs/release/merge-adoption/<pr-name>.json
npm run lint:docs
npm run check:architecture
```

For Storefront/customer journey UI changes, also run the relevant frontend/backend tests listed in `docs/features/DGFY_CUSTOMER_ACCOUNT.md` and capture rendered desktop and mobile evidence for the affected flow.

## What Must Be Proved

- The intended PR/source branch UI or behavior exists in the final tree.
- Existing `master` behavior that still matters is preserved.
- Rejected source files or behaviors are explicitly listed with reasons.
- Rendered evidence proves the customer journey, not only that code compiled.
- Production deploy uses the applicable merge adoption manifest, so the release verdict records merge adoption as passing instead of `merge.adoption.not_required`.

## References

- `docs/START_HERE.md`
- `docs/architecture/ARCHITECTURE_BOUNDARIES.md`
- `docs/architecture/ARCHITECTURE_GOVERNANCE.md`
- `docs/ops/MERGE_ADOPTION_GATE.md`
- `docs/templates/MERGE_ADOPTION_MANIFEST_TEMPLATE.json`
