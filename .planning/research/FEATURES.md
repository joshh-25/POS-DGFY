# Feature Research

**Domain:** DGFY database-first migration/refactor milestone
**Researched:** 2026-07-10
**Confidence:** LOW per `classify-confidence` seam for local/curated sources; evidence is repository-authoritative/reference docs read directly.

## Feature Landscape

This milestone is a brownfield foundation milestone, not a product-expansion milestone. The required feature set is the minimum capability surface needed to create a DGFY-owned database foundation, migrate data safely from the IMS-shaped legacy system, and expose first backend APIs for Accounts, Businesses, and Tenancy while preserving current POS and Storefront behavior.

### Table Stakes (Required For Safe Refactor)

Missing any of these makes the database-first refactor unsafe, unverifiable, or likely to regress existing beta/production users.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Dedicated one-shot migration runner container | Schema/data migration must be an explicit deploy artifact, not an API startup side effect. | MEDIUM | One image should support schema migration, data migration, verification, and runbook/rollback-support commands. Long-running API containers must not be the primary migration surface. |
| New `dgfy_*` landlord database foundation | DGFY must stop inheriting account/business/tenant ownership from the IMS-shaped schema. | HIGH | Additive beside legacy by default. Must cover DGFY Accounts, Businesses, Branches, Tenancy registry, and migration metadata before backend APIs depend on it. |
| New tenant foundation for identity and operational ownership | Tenant-local Staff Accounts, Assignments, and Terminal identity are prerequisites for POS and later domain migration. | HIGH | Scope to foundation only. Do not pull in Product, POS checkout, shifts, payments, fiscal, or Storefront domain behavior. |
| Migration metadata, checkpoints, and idempotency | Partial failures must have a clean retry path during rehearsals and eventual cutover. | HIGH | Track migration runs, source/target mappings, per-step completion, verification status, and failure reason. This is a table-stakes safety feature, not polish. |
| Dry-run mode for old-to-new migrations | Operators need evidence before writing target data. | MEDIUM | Dry-run should report planned inserts/updates/skips/conflicts without mutating `dgfy_*` data. |
| Legacy-to-DGFY transformation scripts | The migration is a real transformation, not a raw copy of IMS tables. | HIGH | For this milestone, prioritize account/business/tenancy data and the source-to-target mapping needed by those domains. Finished-item Product migration is later unless needed only as a mapping proof. |
| Verification reports for migration correctness | A migration that runs but cannot prove what moved is not release-ready. | MEDIUM | Emit machine-readable and human-readable evidence: row counts, orphan checks, duplicate/conflict checks, skipped records, tenant coverage, and data-shape warnings. |
| Abort-threshold and rehearsal evidence hooks | Full-stop cutover requires pre-decided abort criteria and realistic rehearsal data. | MEDIUM | The milestone should produce the technical hooks and reports that a later runbook uses, even if final production cutover is deferred. |
| Backend Accounts APIs | First backend surface must prove DGFY-owned identity independent of SKUpervisor redirects. | HIGH | Implement through `routes -> controllers -> usecases -> repositories -> models`. Include registration/login/account lifecycle basics and hardening proof where touched. |
| Backend Businesses APIs | Business ownership and business selection are foundational for every later POS/Storefront capability. | HIGH | Cover business creation/selection and branch registry basics only. Avoid billing, co-ownership UX, back-office, and commercial expansion unless required by current data preservation. |
| Backend Tenancy APIs | Tenant routing and membership/session creation must be stable before later domains move. | HIGH | Preserve the DGFY Account vs Staff Account split. Tenant session creation must require explicit accepted membership/assignment evidence. |
| Compatibility/facade behavior for legacy callers | Existing POS/Storefront behavior must not regress while new foundations are introduced. | HIGH | Use ADR 0003 facade strategy. Legacy code stays live; only approved seams are allowed, such as a future POS API base URL switch or adapter. |
| Architecture guardrail compliance | New backend work must not weaken the modular-monolith boundary contract. | MEDIUM | Controllers stay transport-only; Sequelize access stays in repositories; any cross-boundary exception needs ADR/update and removal plan. |
| Tenant schema drift prevention for new foundations | Existing code already has recurring tenant schema drift risk. | HIGH | New migrations must include coverage checks and repair/verification patterns, not just landlord migration success. |
| Security/session hardening for account and tenancy flows | Account lifecycle, tenant provisioning, and auth are explicitly covered by the governance hardening contract. | HIGH | Include replay rejection, duplicate/conflict paths, logout/session cleanup, deferred-verification honesty, and durable persistence proof. |
| Legacy behavior preservation tests | The milestone must prove existing beta behavior remains available while foundations change. | MEDIUM | Use focused backend tests, migration tests, architecture checks, and targeted smoke/contract checks for touched compatibility seams. |

### Differentiators (Valuable But Not Required Now)

These features improve operator confidence, migration quality, or future scalability, but they are not required to complete the first database-first milestone if time is constrained.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Operator migration dashboard | Makes migration progress and failures easier to inspect without reading raw logs. | MEDIUM | Defer to reports/CLI first. A dashboard is useful after migration metadata stabilizes. |
| Rich source-to-target diff viewer | Helps explain exactly how legacy records transformed into DGFY records. | MEDIUM | Useful for QA and stakeholder review, but report files are enough for this milestone. |
| Automated rollback execution | Reduces pressure during a failed rehearsal or cutover. | HIGH | This milestone should document rollback support and preserve legacy as fallback; automatic rollback can wait until cutover runbook design. |
| Seeded demo tenant on new DGFY schema | Helps frontend/API consumers test against a clean DGFY-owned shape. | LOW | Useful once Accounts/Businesses/Tenancy APIs exist. Keep it clearly separate from migration proof. |
| Compatibility adapter package for old POS response shapes | Could reduce old frontend edits during backend-first cutover. | MEDIUM | Valuable if the team chooses backend-side compatibility. Decision is still open; do not assume until API shape comparison is done. |
| Migration performance benchmark suite | Gives stronger confidence before production cutover. | MEDIUM | Start with runtime reporting in rehearsal scripts; expand into benchmark gates when realistic data snapshots are available. |
| Expanded audit trail UI for account/business/tenant changes | Improves supportability and future compliance posture. | MEDIUM | Persist audit evidence now where security-sensitive; UI can wait. |
| Multi-owner business governance | Co-ownership is anticipated by the domain model and valuable commercially. | HIGH | Not needed for the first backend scope unless existing data already requires it. Governance for irreversible actions needs separate design. |

### Anti-Features (Explicitly Do Not Build Now)

These are tempting because they are adjacent to DGFY's real product goals, but including them now would blur the foundation milestone and increase regression risk.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Product/Availment domain migration | Product/POS behavior is central to DGFY's value. | It depends on stable Accounts/Businesses/Tenancy and has unresolved design decisions around fulfillment status, stock effects, scheduling, and legacy transformations. | Defer until the database foundation and first backend APIs are stable. Capture only source-to-target mapping prerequisites if needed. |
| POS checkout, payment mechanics, discounts, shifts, fiscal compliance | These are visible user workflows and known gaps. | They are large, fragile, and include correctness/security issues such as client-declared payment status and client-side change calculation. | Treat as later domain-specific milestones with their own design and hardening. |
| Storefront frontend or POS frontend migration to new apps | A standalone DGFY frontend suite is the long-term goal. | Frontend migration before database/API foundations creates churn and risks current beta behavior. | Keep existing frontend running. Allow only narrow approved compatibility seams. |
| Big-bang production cutover | It seems faster than running old and new side-by-side. | It violates the accepted facade/Strangler strategy and would lack rehearsal, abort, and rollback evidence. | Build beside legacy; rehearse; cut over only with a separate runbook. |
| Raw-copy legacy schemas into `dgfy_*` | Faster than designing clean DGFY tables. | Preserves the IMS coupling the refactor is meant to remove. | Transform legacy data into DGFY-owned account/business/tenant structures. |
| General legacy cleanup | Code quality concerns are real. | Broad cleanup risks regressions and merge conflicts while the old system must stay live. | Touch legacy only at approved compatibility seams or safety fixes. |
| New architecture allowlist exceptions as a shortcut | Speeds up implementation in the moment. | Existing expired exceptions are already a concern; adding more weakens the migration contract. | Move persistence into repositories and update ADRs only for genuine cross-boundary changes. |
| Full payment gateway or PayMongo readiness automation | Payments are commercially important. | Payment mechanics are out of first backend scope and current PayMongo readiness depends on separate provider evidence. | Defer to payment/fiscal milestone. Preserve existing behavior. |
| Business Back Office split | Separating POS and Back Office is part of the target product shape. | It is frontend/application scope, not database foundation scope. | Keep POS and Back Office behavior as-is until frontend migration phase. |
| Deleting or archiving legacy code immediately | Removes clutter. | Legacy code remains the fallback and parity reference until replacement paths are proven. | Archive only after parity evidence and no active dependency. |

## Feature Dependencies

```text
Architecture/governance docs
    └──requires──> Migration runner container
                       └──requires──> New dgfy_* schema migrations
                                          └──requires──> Migration metadata/checkpoints
                                                             └──requires──> Dry-run + verification reports
                                                                                └──enables──> old-to-new migration rehearsals

New dgfy_* landlord foundation
    ├──enables──> Accounts APIs
    ├──enables──> Businesses APIs
    └──enables──> Tenancy APIs

New tenant foundation
    ├──requires──> landlord tenancy registry
    ├──enables──> Staff Accounts / Assignments / Terminal identity
    └──enables later──> POS/Product/Storefront domain migration

Accounts APIs
    └──requires──> session/security hardening
                       └──requires──> tenant membership/assignment proof

Legacy behavior preservation
    ├──requires──> compatibility/facade seams
    └──blocks──> legacy deletion

Product/POS/payment/fiscal/frontend migration
    └──deferred until──> Accounts + Businesses + Tenancy + migration foundation stable
```

### Dependency Notes

- **Migration runner requires architecture/governance alignment:** It changes deployment and database operations, so it must follow authoritative docs and avoid migrations hidden inside API startup.
- **Backend APIs require stable schema:** Accounts, Businesses, and Tenancy should not be built against provisional tables; the database contract must lead.
- **Tenant foundation requires landlord registry:** Tenant-local Staff Accounts and Assignments only make sense when the landlord can resolve Account-to-Business-to-Branch/Tenant ownership.
- **Migration scripts require metadata before rehearsals:** Without checkpoints and run records, dry-run and retry behavior cannot be trusted.
- **Compatibility seams block broad legacy edits:** ADR 0003 accepts facades during migration, but cleanup waits until parity is proven.
- **Product/POS/payment/fiscal domains depend on tenancy:** Those workflows require stable account, business, branch, staff, and terminal identity first.

## MVP Definition

### Launch With (Milestone v1)

- [ ] Dedicated migration runner container with explicit commands for schema, data, verify, and runbook-support operations.
- [ ] New `dgfy_*` landlord schema foundation for Accounts, Businesses, Branches, Tenancy registry, and migration metadata.
- [ ] New tenant schema foundation for Staff Accounts, Assignments, Terminal identity, and tenant-local ownership records.
- [ ] Idempotent old-to-new migration scripts scoped to the Accounts/Businesses/Tenancy foundation, with dry-run and checkpoint behavior.
- [ ] Verification reports that prove tenant coverage, data mapping, conflict handling, and drift status.
- [ ] Backend Accounts APIs implemented inside the governed route/controller/usecase/repository/model boundary.
- [ ] Backend Businesses APIs for business registration/selection and branch registry basics.
- [ ] Backend Tenancy APIs for tenant lookup, membership/assignment authorization, and tenant session creation.
- [ ] Compatibility/facade seams that preserve existing POS and Storefront behavior.
- [ ] Tests and release evidence: architecture checks, migration tests, tenant drift checks, account/business/tenancy success/failure/conflict tests, and targeted legacy smoke/contract checks.

### Add After Validation (Milestone v1.x)

- [ ] Migration dashboard or richer report viewer once report formats stabilize.
- [ ] Compatibility adapter package if API shape comparison proves old POS needs backend-side translation.
- [ ] Seeded clean DGFY demo tenant for internal QA.
- [ ] Automated rehearsal performance comparison against realistic snapshots.
- [ ] Expanded audit browsing UI for account/business/tenant changes.

### Future Consideration (v2+)

- [ ] Product and Availment database/API migration after account/business/tenancy foundations stabilize.
- [ ] POS checkout, payment mechanics, split payments, and server-side tender verification.
- [ ] Fiscal/compliance policy engine redesign and BIR metadata validation.
- [ ] Shift management and cash drawer audit expansion.
- [ ] Storefront/POS/Business frontend migration into new `apps/dgfy-*` surfaces.
- [ ] Full production cutover runbook with rehearsed abort thresholds.
- [ ] Optional IMS/SKUpervisor integration contract after DGFY owns its core schema.

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Migration runner container | HIGH | MEDIUM | P1 |
| New `dgfy_*` landlord foundation | HIGH | HIGH | P1 |
| New tenant foundation | HIGH | HIGH | P1 |
| Migration metadata/checkpoints | HIGH | HIGH | P1 |
| Dry-run migration mode | HIGH | MEDIUM | P1 |
| Verification reports | HIGH | MEDIUM | P1 |
| Accounts APIs | HIGH | HIGH | P1 |
| Businesses APIs | HIGH | HIGH | P1 |
| Tenancy APIs | HIGH | HIGH | P1 |
| Compatibility/facade preservation | HIGH | HIGH | P1 |
| Architecture guardrail compliance | HIGH | MEDIUM | P1 |
| Security/session hardening | HIGH | HIGH | P1 |
| Migration dashboard | MEDIUM | MEDIUM | P2 |
| Compatibility adapter package | MEDIUM | MEDIUM | P2 |
| Seeded clean DGFY demo tenant | MEDIUM | LOW | P2 |
| Automated rollback execution | MEDIUM | HIGH | P3 |
| Multi-owner business governance | MEDIUM | HIGH | P3 |
| Product/Availment migration | HIGH | HIGH | P3 for this milestone |
| POS/payment/fiscal migration | HIGH | HIGH | P3 for this milestone |
| Frontend migration | HIGH | HIGH | P3 for this milestone |

**Priority key:**
- P1: Must have for this database-first milestone.
- P2: Useful after the foundation validates.
- P3: Valuable but explicitly deferred from this milestone.

## Scope Guardrails For Requirements Definition

- First backend scope is **Accounts + Businesses + Tenancy only**.
- New DGFY schemas are created beside legacy by default; legacy schemas are not mutated as the normal path.
- Existing `backend/*` and `frontend/apps/{store,pos}/*` remain live during the milestone.
- Legacy edits are limited to approved compatibility seams and safety fixes.
- No Product, Inventory, POS checkout, Storefront checkout, payments, discounts, fiscal compliance, shifts, reports, or frontend app migration should enter the first milestone requirements.
- Any cross-boundary design change requires ADR review/update per architecture governance.

## Sources

- `.planning/PROJECT.md` — project context, active requirements, scope, constraints.
- `.planning/codebase/ARCHITECTURE.md` — current component map and architecture pattern context.
- `.planning/codebase/CONCERNS.md` — tenant drift, token/session, migration, and fragile-area risks.
- `.planning/codebase/TESTING.md` — expected verification patterns and release gates.
- `docs/START_HERE.md` — authoritative documentation lookup order.
- `docs/architecture/ARCHITECTURE_BOUNDARIES.md` — authoritative backend boundary contract.
- `docs/architecture/ARCHITECTURE_GOVERNANCE.md` — authoritative governance and hardening contract.
- `docs/architecture/adr/0003-migration-facade-strategy.md` — accepted compatibility facade strategy.
- `refactor/DGFY_Project_Status_and_Proposal.md` — business and product rationale for standalone DGFY.
- `refactor/DGFY_Implementation_Phases.md` — phased scope and explicit deferrals.
- `refactor/DGFY_Legacy_Feature_Inventory.md` — legacy capabilities and gaps to preserve or defer.
- `refactor/DGFY_Plan_vs_Reality_Reconciliation.md` — schema coupling, corrections, and risk findings.
- `refactor/DGFY_Migration_Cutover_Strategy.md` — migration/cutover strategy, backend-first milestone, rehearsal requirements.

---
*Feature research for: DGFY standalone database-first refactor milestone*
*Researched: 2026-07-10*
