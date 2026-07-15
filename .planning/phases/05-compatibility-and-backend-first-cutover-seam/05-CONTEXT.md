# Phase 5: Compatibility and Backend-First Cutover Seam - Context

**Gathered:** 2026-07-12
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase delivers the **governance mechanism and guardrails for temporary compatibility seams** — plus one concrete reference seam — that make a backend-first cutover safe. It is a governance-and-guardrails phase, not a feature build.

Requirements in scope: **CMP-01** (legacy behavior stays available while the new foundation runs beside it), **CMP-02** (every legacy touch has documented rationale, tests, rollback notes, and removal criteria before acceptance), **CMP-03** (compatibility translates at boundaries and never defines canonical DGFY domain contracts).

**IMPORTANT — architectural reframe locked during discussion (supersedes the classic "legacy-frontend → adapter → new-backend" reading of the roadmap):**

- **`apps/dgfy-api` is self-contained.** It has NO runtime dependency on the legacy `backend/` in either direction. Think-forward: the new API owns everything it needs; there is no request-time adapter bridging old↔new.
- **New frontends live under `apps/*`** (e.g. `apps/dgfy-pos`) and talk **directly** to the new dgfy-api (`/v1`). Once the new API is proven, transactions move there wholesale.
- **Legacy `backend/` is a cold external backup / developer-manual reference** — not a live-serving system and not a proxy target.
- **Continuity is data-level, not runtime.** DB-level migrations (the Phase 1–3 migration runner) plus scripts keep the domains intact. This is the only real "legacy touch" that exists in the target model.

**Scouting evidence supporting the reframe:** legacy `backend/src` currently has **zero references to `dgfy-api`**, and `apps/dgfy-api` is a standalone Express service mounted at `/v1` (per ADR 0032). There is no live old-client→new-backend path today, so "adapters, when needed / if required" (SC3) is literal.

**In scope:**
- A machine-readable compatibility-seam **inventory** (source of truth) + a generated human-readable inventory doc.
- The **acceptance/removal governance** that requires each seam to declare rationale, tests, rollback, and removal criteria before it is accepted (enforced in CI).
- The **SC3 guardrail** (extending the existing ADR-0004 architecture-compliance automation) that keeps compatibility/continuity code out of the canonical dgfy-api domain layer.
- **One reference seam:** the DB-level domain-continuity script(s) that keep the legacy backup's domains intact during/after cutover — registered as the first, canonical inventory entry.

**Out of scope (belongs to other phases / milestones):**
- Product / POS / payments / fiscal domain APIs in dgfy-api (deferred to post-foundation milestones).
- Frontend migration into `apps/*` surfaces, e.g. `apps/dgfy-pos` (deferred until backend + compatibility evidence exists).
- Wholesale transaction cutover to the new API (future milestone, once the new API is proven).
- Any request-time runtime adapter (there is no live cross-path to justify one; the target model is self-contained).
- Release-evidence gates and rehearsal (Phase 6, CMP-04/CMP-05) — this phase produces the manifest that Phase 6 *consumes*.

</domain>

<decisions>
## Implementation Decisions

### Deliverable Shape

- **D-01:** **Framework + one reference seam.** Phase 5 ships the full governance framework (inventory + acceptance/removal process + SC3 guardrail) AND one concrete reference seam so the guardrail, the inventory-entry format, and the eventual Phase 6 check all have a real artifact to enforce and validate. (Chosen over framework-only and framework+non-wired-scaffold.)

- **D-02:** **The reference seam is the DB-level domain-continuity script**, NOT a request-time API adapter. Given the self-contained-API reframe, the DB-level continuity script(s) that keep the legacy backup intact during cutover are the one real, temporary legacy touch. This seam gets the first inventory entry with rollback + removal criteria (removed when the legacy backup is decommissioned). No runtime API adapter is built in this phase. (Chosen over auth/session bridge, tenant/business runtime resolution, and framework-only.)

### Compatibility Inventory

- **D-03:** **Manifest as source of truth + generated doc.** A machine-readable manifest is authoritative; a human-readable markdown inventory is generated from it. Each seam entry carries: `id`, `type`, `rationale`, `tests`, `rollback`, `removal_criteria`, `status`. A check script validates the schema and status. Phase 6 (CMP-04) consumes the manifest directly rather than parsing prose. (Chosen over markdown-only and code-annotation-scan approaches.)

- **D-04:** **YAML, under `docs/architecture/`.** Source of truth is `docs/architecture/compatibility-seams.yaml` (comment-friendly, human-editable); the generated human-readable doc is `docs/architecture/COMPATIBILITY_INVENTORY.md`, co-located with the governance docs the roadmap already points to (BOUNDARIES / GOVERNANCE / ADRs). (Chosen over JSON and "you decide". Note: repo currently has no YAML parser dependency in the relevant tooling — researcher/planner should confirm parser availability or select one; if a YAML dep is undesirable, JSON is the accepted fallback with the same schema and location.)

### Guardrail Enforcement (SC3)

- **D-05:** **Extend the existing ADR-0004 architecture-compliance automation** (reuse Phase 4's proven lint/CI harness). The extended checks enforce: (a) compat/continuity code is confined to a designated location and must NOT live in `apps/dgfy-api/src/modules/*/entities|usecases` (the canonical domain layer); (b) the dgfy-api domain layer imports **zero** compat code; (c) CI **fails if a code-level seam has no matching active manifest entry** (code ↔ manifest must reconcile). (Chosen over a dedicated `compat/` dir with import rules only, and over manual-review-only.)

### Acceptance & Removal Governance (SC2)

- **D-06:** **Manifest-gated in CI — CI is the acceptance authority.** A seam is "accepted" only if its manifest entry is complete (all of `rationale`, `tests`, `rollback`, `removal_criteria` non-empty) AND its referenced tests pass. An incomplete or missing entry for a seam present in code = red build. Acceptance is mechanical, not dependent on reviewer memory. This is the *same* CI check as D-05 reading the *same* manifest — the manifest is the spine; the guardrail and the acceptance gate are two facets of one check. (Chosen over PR-checklist+human-review and per-seam ADR ceremony.)

### Claude's Discretion

- The concrete internals of the DB-level continuity script(s) — exactly which domains they reconcile and how — are for research/planning to define against the Phase 1–3 migration runner and the `dgfy_*` schema contracts. The decision here is only that this script is the reference seam and MUST be registered as the first inventory entry with complete governance fields.
- Exact manifest field schema details (e.g. enum values for `type`/`status`, whether `tests` is a list of file paths or test ids) are for the planner, provided the six fields in D-03 are all present and machine-validated.
- Exact designated location/path for compat code (D-05a) is for the planner, provided it is outside the canonical domain layer and enforced by the extended compliance check.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project and Requirements
- `.planning/ROADMAP.md` — Phase 5 goal, success criteria (SC1–SC4), and the database-first Strangler Fig framing. NOTE: read alongside the D-01/D-02 reframe above — the roadmap's "legacy stays live" language predates the self-contained-API decision.
- `.planning/REQUIREMENTS.md` — CMP-01, CMP-02, CMP-03 (this phase); CMP-04/CMP-05 (Phase 6/7) show what downstream gates will consume from this phase's manifest.
- `.planning/PROJECT.md` — standalone refactor scope and milestone definition of done.
- `.planning/STATE.md` — carried-forward Phase 4 concerns (e.g. `business_database_registry.business_id` uniqueness debt; API-02/API-03 pending real-MySQL activation proof).

### Compatibility / Migration Strategy (core to this phase)
- `docs/architecture/adr/0003-migration-facade-strategy.md` — the compatibility-facade strategy: keep legacy intact, remove facade code only after stable green runs, clear cleanup checkpoints per phase. This phase operationalizes ADR 0003's "clear cleanup checkpoints" as the manifest's `removal_criteria`.
- `docs/architecture/adr/0004-architecture-compliance-automation.md` — the architecture-compliance automation this phase EXTENDS for the SC3 guardrail (D-05).
- `docs/architecture/adr/0032-standalone-dgfy-api-service.md` — establishes `apps/dgfy-api` as a standalone, self-contained service (grounds the D-01/D-02 reframe).

### Architecture Governance
- `docs/START_HERE.md` — canonical documentation lookup order (authoritative).
- `docs/architecture/ARCHITECTURE_BOUNDARIES.md` — backend boundaries and guardrails (`routes → controllers → usecases → repositories → models`); defines what "canonical domain contracts" means for the SC3 guardrail.
- `docs/architecture/ARCHITECTURE_GOVERNANCE.md` — ADR requirements, architecture proof, and hardening contract; governs how the extended compliance check must be documented.

### Prior Phase Evidence (locked decisions this phase builds on)
- `.planning/phases/04-backend-accounts-businesses-and-tenancy-foundation/04-CONTEXT.md` — Clean Architecture layering and the architecture-compliance lint already enforced in `apps/dgfy-api`; the activate-tenant CLI handoff that is the current live edge.
- `.planning/phases/01-architecture-and-migration-runner-contract/01-CONTEXT.md` — migration runner env-var contracts (`SOURCE_DB_*`, `TARGET_DB_*`) and destructive-op gating; the runner the DB-continuity reference seam builds on.
- `.planning/phases/03-old-to-new-migration-proof/03-CONTEXT.md` — the proven legacy→DGFY transformation, retry, and verification patterns the continuity script(s) extend.

### Codebase Maps
- `.planning/codebase/ARCHITECTURE.md` — legacy modular-monolith structure and tenant resolution (`tenantHandler.js`, `TenantConnector.js`) — reference for what the cold backup contains.
- `.planning/codebase/CONVENTIONS.md` — coding conventions any Phase 5 tooling/scripts must follow.
- `apps/dgfy-migration-runner/src/schemaContracts/dgfyCoreContract.js`, `apps/dgfy-migration-runner/src/schemaContracts/dgfyBusinessContract.js` — authoritative `dgfy_*` target-schema contracts the DB-continuity seam reconciles against.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **ADR-0004 architecture-compliance automation / lint harness** (already enforced for `apps/dgfy-api` in Phase 4) — extend this for the SC3 guardrail rather than building a new checker (D-05).
- **Phase 1–3 migration runner** (`apps/dgfy-migration-runner`) with env-var contracts, retry, and verification evidence — the DB-level continuity reference seam (D-02) builds directly on this rather than inventing new DB machinery.
- **Existing governance docs location** (`docs/architecture/` with BOUNDARIES / GOVERNANCE / ADRs) — the manifest and generated inventory doc live here (D-04).
- **`eslint no-restricted-imports`** pattern already used to keep controllers from importing models — the same mechanism enforces "domain layer imports zero compat code" (D-05b).

### Established Patterns
- **Self-contained `apps/dgfy-api` mounted at `/v1`** (ADR 0032) — the guardrail must preserve this: no compat/continuity code may enter the canonical domain layer (`apps/dgfy-api/src/modules/*/entities|usecases`).
- **Manifest/contract-as-source-of-truth** — mirrors the migration runner's `schemaContracts/*` approach; the compatibility manifest follows the same "declare it, validate it in CI" philosophy.
- **CI as the enforcement authority** — Phase 4 already gates architecture compliance in CI; D-05 and D-06 are the *same* CI check reading the *same* manifest.

### Integration Points
- **Phase 6 (CMP-04)** consumes `compatibility-seams.yaml` for release evidence / targeted smoke/contract checks on touched seams — the manifest schema must be stable and machine-readable for that hand-off.
- **DB-continuity reference seam** connects to the Phase 1–3 migration runner and the `dgfy_*` schema contracts; its `removal_criteria` ties to legacy-backup decommissioning (a later milestone).

</code_context>

<specifics>
## Specific Ideas

- Manifest path: `docs/architecture/compatibility-seams.yaml`; generated doc: `docs/architecture/COMPATIBILITY_INVENTORY.md`.
- Manifest entry fields (minimum): `id`, `type`, `rationale`, `tests`, `rollback`, `removal_criteria`, `status`.
- The DB-level continuity script is registered as the **first** inventory entry (e.g. `id: db-continuity-<domain>`, `type: db-level`, `status: active`), with `removal_criteria` = "legacy backup decommissioned".
- The extended compliance check does three things: confine seam code to an allowed location, forbid domain-layer imports of compat code, and reconcile code seams ↔ manifest entries (fail build on mismatch or incomplete entry).
- "Accepted" is defined mechanically: complete manifest entry (all governance fields non-empty) + referenced tests pass. No human-signoff step is required for acceptance beyond the CI gate.
- YAML parser availability is unconfirmed in the current tooling — if adding a YAML dependency is undesirable, JSON at the same path/schema is the accepted fallback.

</specifics>

<deferred>
## Deferred Ideas

- **Product / POS / payments / fiscal domain APIs in dgfy-api** — deferred to post-foundation milestones per ROADMAP deferred items. Phase 5 does not build any product domain; it only builds the seam-governance framework + the DB-continuity reference seam.
- **Frontend migration into `apps/*` surfaces (e.g. `apps/dgfy-pos`)** — deferred until backend + compatibility evidence exists. Phase 5 establishes the evidence framework; it does not migrate frontends.
- **Wholesale transaction cutover to the new API** — the user's forward vision (all frontends → new API, legacy as backup) is a future milestone gated on the new API being proven; not Phase 5 work.
- **Runtime request-time API adapters** — explicitly not needed in the self-contained-API target model; if a real cross-path ever emerges, the Phase 5 framework is ready to govern it (new inventory entry + guardrail + CI acceptance).

None — discussion stayed within phase scope; the reframe narrowed scope rather than expanding it.

</deferred>

---

*Phase: 5-Compatibility and Backend-First Cutover Seam*
*Context gathered: 2026-07-12*
