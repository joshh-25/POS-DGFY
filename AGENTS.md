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

## Storefront Frontend Recovery Rule
Use this rule for any large frontend change that affects storefront modes, shared storefront sections, the discovery experience, or shared map behavior.

### Trigger Conditions
Apply this rule when any of the following are true:
1. The change touches `frontend/apps/store/src/StorefrontApp.jsx`.
2. The change touches shared storefront UI used by more than one mode.
3. The change touches discovery map rendering, marker behavior, clustering, or shared map helpers.
4. The change introduces or rewires storefront pages such as product details, solutions, booking, tracking, or account flows.

### Mandatory Working Rules
1. Create a single accepted storefront checkpoint commit immediately after the user confirms the current UI is correct.
2. Track new storefront page files in git immediately. Do not leave new storefront pages untracked across sessions.
3. Prefer extracting mode-specific UI out of `frontend/apps/store/src/StorefrontApp.jsx` instead of extending the monolith further.
4. Do not mix restore work and new feature work in the same pass unless the user explicitly asks for both.
5. When restoring UI, compare against the last accepted storefront checkpoint instead of restoring from memory.

### Mandatory Validation After Each Meaningful Storefront Pass
Run these checks after every meaningful storefront or discovery-map frontend edit:
1. `npm --prefix frontend run build:store`
2. `npm --prefix frontend exec vitest run apps/store/src/__tests__/profileLauncher.integration.test.jsx`
3. `npm --prefix frontend exec vitest run apps/store/src/__tests__/fnbStorefront.contract.test.js`
4. Manual F&B storefront smoke check
5. Manual discovery-map smoke check

### Required Handoff Summary
Every large storefront/discovery-map frontend pass must end with a concise handoff note that lists:
1. The accepted storefront checkpoint commit or the fact that no checkpoint exists yet.
2. The exact storefront files changed.
3. Any new page files created and whether they are tracked.
4. Which validation commands passed.
5. Any known gaps that still differ from the last accepted storefront UI baseline.
