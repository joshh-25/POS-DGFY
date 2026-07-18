# Phase 2: DGFY Database Foundation - Context

**Gathered:** 2026-07-10
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase delivers the new DGFY database foundation beside the legacy `sku_*` system. It creates the DGFY core database, per-business operational database pattern, minimal landlord/core tables, minimal per-business foundation tables, runner hardening needed before real migrations, and repeatable verification evidence.

**In scope:** additive schema migrations for `dgfy_core`, `dgfy_business_*`, and verification/reporting through the Phase 1 migration runner.

**Out of scope:** product/item migration, promos, POS checkout, inventory, fiscal/compliance operations, Storefront operational migration, old-to-new data migration apply logic, backend Accounts/Businesses/Tenancy APIs, and production cutover.

</domain>

<decisions>
## Implementation Decisions

### Database Names and Layout
- **D-01:** Use `dgfy_core` as the DGFY platform/core database.
- **D-02:** Use per-business operational databases named `dgfy_business_<stable_opaque_suffix>`.
- **D-03:** Do not derive database names from sanitized business display names. Business rebrands must not rename databases or create name mismatches.
- **D-04:** Keep runner metadata separate in `dgfy_migration_meta`; do not fold runner audit/metadata tables into `dgfy_core`.
- **D-05:** Use plain table names inside DGFY-only databases. Do not add redundant `dgfy_` prefixes inside `dgfy_core` or `dgfy_business_*` by default.

### Core Database Responsibilities
- **D-06:** `dgfy_core` owns DGFY accounts, businesses, account-business memberships/ownership, business database registry/pointers, minimal audit, and public discovery/routing projection metadata where needed.
- **D-07:** Include a minimal `business_memberships` table now. Phase 2 behavior can enforce single-owner semantics initially, but the relationship model must support future manager/member roles without a disruptive schema rewrite.
- **D-08:** Use `business_database_registry` as the source of truth for business-to-database mapping. Store the actual `database_name`, stable opaque suffix, status, and verification timestamps there.
- **D-09:** Minimal audit tables should exist now for business creation, ownership/membership changes, business database pointer changes, and migration-sensitive admin actions. Full account/admin lifecycle audit can wait for API phases.

### Branches, Locations, and Discovery
- **D-10:** Canonical branches/locations live inside `dgfy_business_*` databases, not `dgfy_core`.
- **D-11:** `dgfy_core` may keep denormalized read/search/routing projections for public discovery, but these are not canonical branch/location truth.
- **D-12:** Use the explicit table name `storefront_discovery_index` for public Storefront discovery projection. Avoid a vague `discovery_index` name because future DGFY discovery surfaces may include products, services, food, jobs, events, or other marketplace concepts.
- **D-13:** Create a lightweight `storefront_discovery_index` foundation in Phase 2 if the database foundation includes discovery/search metadata. Keep it a projection table only; do not let it define operational branch, product, inventory, promo, or checkout truth.

### Per-Business Database Responsibilities
- **D-14:** The `dgfy_business_*` foundation should include staff/user authorization profiles, DGFY account-to-staff assignment/link metadata, role/permission basics needed for future tenant session checks, terminal identity, and tenant-local audit/ownership metadata.
- **D-15:** Defer products/items, promos, POS checkout, inventory, fiscal/compliance operations, and Storefront operational tables from Phase 2.

### Runner Hardening Before Real Migrations
- **D-16:** Start Phase 2 by hardening the Phase 1 migration runner paths that real schema migrations will rely on.
- **D-17:** Fix pending-only destructive migration detection so a historical destructive migration does not permanently require `--confirm-destructive` for unrelated future additive migrations.
- **D-18:** Ensure command failures reliably mark `command_executions` rows as `failed` rather than leaving them stuck at `running`.
- **D-19:** Ensure human-readable summaries report accurate command status instead of `status=unknown`.
- **D-20:** Set a container-safe report directory default so one-shot container reports persist to the intended mounted location.

### Verification Evidence
- **D-21:** Phase 2 verification must prove expected tables, columns, indexes, constraints, migration metadata records, and coverage for all targeted `dgfy_core` and `dgfy_business_*` schemas.
- **D-22:** Verification must prove migrations are additive and idempotent/re-runnable.
- **D-23:** Verification must include proof that legacy/current `sku_*` schemas were not mutated by Phase 2 schema migrations.
- **D-24:** Verification reports must be machine-readable and human-readable so CI/deploy tooling and operators can both consume the evidence.

### the agent's Discretion
No open implementation discretion was delegated beyond using the recommendations recorded above for discovery projection timing and one-active-operational-DB registry shape.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project and Requirements
- `.planning/PROJECT.md` - database-first DGFY standalone refactor scope, active requirements, constraints, and Phase 1 completion notes.
- `.planning/REQUIREMENTS.md` - DBF-01 through DBF-05 and milestone definition of done.
- `.planning/ROADMAP.md` - Phase 2 goal and success criteria.
- `.planning/STATE.md` - current phase state and carried-forward concerns.

### Architecture Governance
- `docs/START_HERE.md` - canonical documentation lookup order; authoritative, last reviewed 2026-03-06.
- `docs/architecture/ARCHITECTURE_BOUNDARIES.md` - backend boundaries and architecture guardrails; authoritative, last reviewed 2026-03-06.
- `docs/architecture/ARCHITECTURE_GOVERNANCE.md` - ADR requirements, architecture proof, hardening contract, and validation expectations; authoritative, last reviewed 2026-05-21.
- `docs/architecture/adr/0001-modular-monolith-boundaries.md` - modular-monolith boundary decision.
- `docs/architecture/adr/0003-migration-facade-strategy.md` - compatibility facade and Strangler Fig migration strategy.
- `docs/architecture/adr/0004-architecture-compliance-automation.md` - architecture automation and evidence gates.
- `docs/architecture/adr/0032-standalone-dgfy-api-service.md` - standalone DGFY API service boundary and top-level `apps/*` convention.

### Database and Discovery Contracts
- `docs/database/README.md` - database docs usage guidance.
- `docs/database/schema.md` - current legacy/tenant database reference and DGFY-era addenda; reference only for current-state mapping, not as the new canonical DGFY schema.
- `docs/architecture/adr/0010-storefront-discovery-item-match-index-and-union-query.md` - current landlord discovery-index and branch/location metadata projection contract.
- `docs/architecture/adr/0029-catalog-inventory-pos-storefront-ownership-boundaries.md` - defers product, inventory, POS, and Storefront operational ownership from this foundation phase.

### Prior Phase Evidence
- `.planning/phases/01-architecture-and-migration-runner-contract/01-CONTEXT.md` - runner placement, command surface, metadata, destructive-op, and reporting decisions.
- `.planning/phases/01-architecture-and-migration-runner-contract/01-REVIEW.md` - runner warnings to harden before real migrations.
- `.planning/phases/01-architecture-and-migration-runner-contract/01-VERIFICATION.md` - Phase 1 verified runner contract and carried-forward warnings.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `apps/dgfy-migration-runner` - dedicated one-shot migration runner built in Phase 1; Phase 2 should add real schema migrations here after hardening.
- `apps/dgfy-migration-runner/src/metadata/bootstrap.js` - runner metadata bootstrap and `command_executions`/`schema_migrations` audit mechanics.
- `apps/dgfy-migration-runner/src/commands/schema.js` and `src/commands/verify.js` - primary command paths Phase 2 will extend or rely on.
- `backend/src/models/TenantLocation.js` and `backend/migrations/20260330000003-create-tenant-locations.cjs` - current canonical tenant-local location pattern.
- `backend/src/models/Landlord/StorefrontDiscoveryIndex.js` and `backend/migrations/20260331000009-create-storefront-discovery-index.cjs` - current landlord discovery projection pattern.

### Established Patterns
- The current system already separates canonical tenant locations from landlord discovery projection: `tenant_locations` is tenant-local, while `storefront_discovery_index` materializes public search/map metadata in the landlord DB.
- ADR 0010 already requires no query-time tenant fan-out for Storefront discovery. Phase 2 should preserve this read-model pattern in the new DGFY schema.
- Sequelize + MySQL is the existing database access stack; Phase 2 should keep migrations explicit and avoid `sync({ alter: true })` as production strategy.
- Architecture docs require repository-owned Sequelize access for backend/API work, though Phase 2 is primarily migration-runner/schema work rather than API implementation.

### Integration Points
- Phase 2 schema output becomes the contract for Phase 3 old-to-new data migration and Phase 4 Accounts/Businesses/Tenancy APIs.
- Current legacy `sku_*` landlord and tenant schemas are source/compatibility systems only; Phase 2 must verify they are not mutated.
- Future Storefront discovery should project from `dgfy_business_*` canonical operational tables into `dgfy_core.storefront_discovery_index`.

</code_context>

<specifics>
## Specific Ideas

- Core database name: `dgfy_core`.
- Per-business database pattern: `dgfy_business_<stable_opaque_suffix>`.
- Runner metadata database name: `dgfy_migration_meta`.
- Core registry table name: `business_database_registry`.
- Public discovery projection table name: `storefront_discovery_index`.
- Use product/domain language "business database" while acknowledging the runtime architecture is still multi-tenant.

</specifics>

<deferred>
## Deferred Ideas

- Full account/admin lifecycle audit coverage waits for API phases.
- Products/items, promos, checkout, inventory, fiscal/compliance operations, and Storefront operational tables remain deferred from Phase 2.
- Storefront discovery projection can be lightweight in Phase 2; operational Storefront behavior and migration remain later-phase work.

</deferred>

---

*Phase: 2-DGFY Database Foundation*
*Context gathered: 2026-07-10*
