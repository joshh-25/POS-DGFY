# Repository Agent Rules

These instructions are for any AI agent, IDE assistant, or extension operating in this repository.

## Mandatory Documentation Lookup Order
1. `docs/START_HERE.md`
2. `docs/architecture/ARCHITECTURE_BOUNDARIES.md`
3. `docs/architecture/ARCHITECTURE_GOVERNANCE.md`
4. Relevant ADRs in `docs/architecture/adr/`
5. Domain-specific docs (`docs/features`, `docs/api`, `docs/database`, `docs/testing`)
6. Historical docs only if explicitly marked as needed

## Planning Rules
1. Do not produce an implementation plan until steps 1-4 of the lookup order are read.
2. Every implementation plan must cite authoritative docs used for decisions.
3. If docs conflict:
- `authoritative` overrides `reference`
- `reference` overrides `historical`
- `deprecated` must not be used for new design decisions
4. Cross-boundary changes require ADR update or new ADR.

## Prohibited Behavior
1. Do not treat `docs/archive/**` as a planning source.
2. Do not use deprecated docs when a `superseded_by` target exists.
3. Do not infer architecture rules from code alone when authoritative docs exist.

## Validation Before Finalizing Plan
1. Confirm architecture boundary checks that apply to the planned change.
2. Confirm documentation freshness (`last_reviewed`) for cited authoritative docs.
3. Confirm no unresolved exception/allowlist dependency is introduced without a removal plan.
