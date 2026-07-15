# Phase 7: Cutover Runbook and Deferred Domain Split - Context

**Gathered:** 2026-07-12
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase delivers **the pre-cutover decision gate**: proof and documentation that production cutover is not scheduled until (SC1) rehearsal runtime + realistic data-volume evidence exists, (SC2) backup/restore proof + a decided abort threshold + reopen-on-legacy steps are documented, and (SC3) Product/POS/payment/fiscal/frontend migration scope is explicitly deferred out of v1 into post-foundation planning. It is a governance/runbook phase — it does not perform an actual production cutover.

Requirement in scope: **CMP-05** (cutover planning captures rehearsal runtime, realistic data-volume evidence, backup/restore proof, abort thresholds, and reopen-on-legacy steps before production cutover is scheduled).

**Existing artifact note:** `07-01-PLAN.md` already exists in this phase directory, imported directly from `refactor-do-not-commit/local-test/REHEARSAL-METHODOLOGY.md` (commit `b15bfe17`) without going through this discuss-phase step. It covers SC1 only. Per user decision, this phase proceeds with discussion now and replans afterward so 07-01 (and new SC2/SC3 plans) reflect the decisions below.

**In scope:**
- The abort-threshold decision and its documentation (SC2).
- Defining what "reopen on legacy" means for this rehearsal-and-runbook phase, given legacy stays fully live throughout (SC2).
- Backup/restore proof for the `dgfy_*` target databases (SC2).
- Explicitly capturing that Product/POS checkout/payment/fiscal/frontend migration scope is deferred into post-foundation planning, not entering v1 implementation (SC3).

**Out of scope (belongs to other phases / milestones):**
- Actually performing a real production cutover — this phase only produces the runbook and evidence that gate the decision to schedule one.
- A real traffic/DNS/API-base-URL repoint mechanism — legacy hasn't been repointed to the new API yet (Phase 5 D-02: wholesale cutover to the new API is a future milestone), so there is nothing to build a revert-repoint step for in this phase.
- Product/Availment/POS/payment/fiscal/frontend implementation itself — only the deferral/scope-split documentation is this phase's job, not building those domains.

</domain>

<decisions>
## Implementation Decisions

### Abort Threshold (SC2)

- **D-01:** **Abort criterion is a wall-clock cutoff**, decided in advance (e.g., "if migration apply + verify isn't clean by a fixed time, abort"), not a data-quality/error threshold and not a hybrid of the two. Matches the strategy doc's own framing (`refactor-do-not-commit/DGFY_Migration_Cutover_Strategy.md` §5.1: "not yet decided... a set time").
- **D-02:** **A human operator enforces the abort decision** against the documented wall-clock threshold — not an automated script that halts programmatically. This mirrors the existing human-checkpoint precedent already established in this project (release-evidence's TTY tenant picker, 07-01's rehearsal loop's own human-action checkpoint).

### Reopen-on-Legacy (SC2)

- **D-03:** **"Reopen on legacy" is documented as a non-event, not a mechanism to build.** Because legacy (`backend/*`, `frontend/apps/{store,pos}/*`) stays fully live and untouched throughout rehearsal and the eventual real cutover window (Strangler Fig — no traffic repoint to the new API has happened yet, per Phase 5 D-02), an abort simply means: don't flip any cutover switch, leave the system exactly as it is, and go fix the migration for a future attempt. The runbook must state this explicitly so it isn't silently assumed or forgotten by a future reader — do not invent a placeholder repoint/revert procedure that doesn't correspond to anything real yet.

### Backup/Restore Proof (SC2)

- **D-04:** **Backup/restore proof scope is the `dgfy_*` target databases only**, not legacy `sku_*`. The migration provably never mutates legacy (beside-legacy fingerprint proof already established in Phase 2/3 verify tooling), so legacy doesn't need new backup/restore proof for this phase. What needs proving is that the new `dgfy_*` databases (post-migration state, the system about to go live) can be backed up and restored cleanly.

### Claude's Discretion

- Exact backup/restore tooling/mechanism (`mysqldump`, filesystem snapshot, or other) for the `dgfy_*` proof — planner's/researcher's call, should fit alongside existing migration-runner and rehearsal-harness conventions rather than inventing a new unrelated toolchain.
- Whether the deferred-domain-split (SC3) artifact is a dedicated new document, an update/cross-reference to the existing `REQUIREMENTS.md` v2 section and `PROJECT.md` Out of Scope section, or both — not discussed in depth; planner's call, but it must make the deferral explicit and traceable, not just implicit in existing docs.
- Whether SC2/SC3 evidence extends the same `docs/database/dgfy-migration-rehearsal-production-volume.md` runbook 07-01 is producing, or lives in a separate `docs/database/dgfy-cutover-runbook.md` that cross-links it — not discussed in depth; planner's call, consistent with the existing "extends, does not restate" cross-linking convention already used between the two rehearsal docs.
- Exact wall-clock cutoff value (D-01) — this is an operator-set parameter (like 07-01's consecutive-clean-attempt count N), not a value to hardcode; planner's call on where/how it's configured.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project and Requirements
- `.planning/ROADMAP.md` — Phase 7 goal, SC1–SC3, dependency on Phase 6.
- `.planning/REQUIREMENTS.md` — CMP-05 (this phase, the only remaining v1 requirement); v2 Requirements section (PRD-01/02/03, CUT-01/02/03) — what SC3 must reference as already-tracked deferred scope.
- `.planning/PROJECT.md` — Out of Scope section (Product/Availment/POS/payment/fiscal/Storefront frontend already listed as deferred); Constraints section ("Deployment: Production cutover requires rehearsal evidence, realistic data volume checks, and pre-decided abort thresholds").
- `.planning/STATE.md` — session history.

### Cutover Strategy (primary source for SC2 — read before planning)
- `refactor-do-not-commit/DGFY_Migration_Cutover_Strategy.md` §5 ("Full-Stop Maintenance Window") and §5.1 ("What the Rehearsals Need to Prove") — the source of the abort-threshold and rehearsal-scale open questions this phase resolves. Note: this file lives in `refactor-do-not-commit/` (not committed) — treat as background/strategy input, not a citable artifact in the committed runbook itself.
- `refactor-do-not-commit/local-test/REHEARSAL-METHODOLOGY.md` — the source 07-01-PLAN.md was imported from; cross-check that 07-01's scope still matches this phase's decisions after replanning.

### Phase 1-6 Evidence (this phase's inputs)
- `docs/database/dgfy-migration-rehearsal.md` — the disposable-schema rehearsal loop (MIG-05); stays authoritative, this phase's production-volume rehearsal doc extends it.
- `docs/database/dgfy-migration-rehearsal-production-volume.md` — 07-01's in-progress output (SC1 rehearsal runtime + data-volume evidence + operator-visible reports).
- `.planning/phases/06-release-evidence-and-rehearsal-gates/06-CONTEXT.md` — explicitly notes Phase 6's evidence is an *input* to this phase's cutover decision, not the cutover itself; also explicitly defers "cutover rehearsal, backup/restore proof, abort thresholds, reopen-on-legacy steps" to this phase.
- `.planning/phases/05-compatibility-and-backend-first-cutover-seam/05-CONTEXT.md` D-02 — confirms wholesale cutover to the new API is a *future* milestone, not yet done — grounds D-03 above (nothing to actually reopen/revert yet).
- `apps/dgfy-migration-runner/src/commands/verify.js` — existing verification machinery (legacy non-mutation fingerprint baseline) that D-04's backup/restore proof should sit alongside, not duplicate.

### Codebase Maps
- `.planning/codebase/ARCHITECTURE.md`, `.planning/codebase/CONVENTIONS.md` — general conventions for any new script/doc this phase adds.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `refactor-do-not-commit/local-test/` rehearsal harness (docker-compose.yml, clone-local-test.sh, gen-manifest.sh) — 07-01 already uses this; a backup/restore proof step (D-04) should reuse the same disposable-clone infrastructure rather than inventing a new one.
- Migration runner's existing `verify.js` legacy-non-mutation fingerprint pattern — a proven pattern for "prove nothing unexpected happened" evidence that a backup/restore verification step can mirror.

### Established Patterns
- **Human-action checkpoint precedent** (release-evidence's TTY tenant picker, 07-01's rehearsal loop) — D-02's human-enforced abort decision follows this same established pattern rather than introducing a new automation-first approach.
- **"Extends, does not restate" cross-linking** between `dgfy-migration-rehearsal.md` and `dgfy-migration-rehearsal-production-volume.md` — the likely pattern for however SC2/SC3 documentation is structured relative to 07-01's runbook (exact shape left to planner per Claude's Discretion).

### Integration Points
- SC2's backup/restore proof is expected to run against the same rehearsal-clone infrastructure 07-01 already builds and verifies, not a separate new environment.
- SC3's deferred-domain documentation should cross-reference (not duplicate) `REQUIREMENTS.md`'s existing v2 section and `PROJECT.md`'s existing Out of Scope section.

</code_context>

<specifics>
## Specific Ideas

- The abort threshold is explicitly a *time* cutoff, not a quality/error-count cutoff — this was a direct, deliberate choice, not a default.
- "Reopen on legacy" must be written as an explicit non-event/no-op statement in the runbook — the risk being called out is a future reader assuming there's a revert mechanism that doesn't actually exist yet.

</specifics>

<deferred>
## Deferred Ideas

- **A real traffic/DNS/API-base-URL repoint-and-revert mechanism** — belongs to the future full-cutover milestone (once wholesale cutover to the new API actually happens, per Phase 5 D-02), not this phase. Explicitly considered and rejected as in-scope here (D-03).
- **Legacy (`sku_*`) backup/restore proof** — considered and explicitly rejected in favor of `dgfy_*`-only scope (D-04); legacy non-mutation is already proven by existing fingerprint tooling.

None beyond the above — discussion stayed within phase scope.

</deferred>

---

*Phase: 7-Cutover Runbook and Deferred Domain Split*
*Context gathered: 2026-07-12*
