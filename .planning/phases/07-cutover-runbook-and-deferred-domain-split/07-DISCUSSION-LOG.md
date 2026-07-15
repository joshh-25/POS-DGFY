# Phase 7: Cutover Runbook and Deferred Domain Split - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-12
**Phase:** 07-cutover-runbook-and-deferred-domain-split
**Areas discussed:** Abort threshold & reopen-on-legacy mechanics (includes a bonus Backup/restore proof question)

**Preamble:** Discussion was triggered after the user asked "did we plan phase 7?" during `/gsd-progress`. Investigation confirmed `07-01-PLAN.md` was imported directly from `refactor-do-not-commit/local-test/REHEARSAL-METHODOLOGY.md` (commit `b15bfe17`) without a discuss-phase step — no `07-CONTEXT.md` or `07-DISCUSSION-LOG.md` existed, unlike every prior phase. User chose "Continue and replan after" when offered the existing-plan-without-context gate.

---

## Abort threshold & reopen-on-legacy mechanics

### Q1: What should the abort criterion for the full-stop cutover window actually be?

| Option | Description | Selected |
|--------|-------------|----------|
| Wall-clock cutoff | Fixed time limit decided in advance; matches strategy doc's own framing | ✓ |
| Data-quality/error threshold | Abort on any open verify findings, regardless of elapsed time | |
| Hybrid | Either tripwire, whichever hits first | |

**User's choice:** Wall-clock cutoff (recommended option).

### Q2: What does "reopen on legacy" concretely mean, given legacy stays fully live throughout?

| Option | Description | Selected |
|--------|-------------|----------|
| Nothing to revert — document the non-event | Legacy never stopped serving traffic; abort = leave things as-is | ✓ |
| There IS a real repoint step to define | Anticipate a future repoint and define its revert now | |
| Scope this out of Phase 7 entirely | Defer to the future full-cutover milestone, no mention here | |

**User's choice:** Nothing to revert — document the non-event (recommended option).

### Q3: Who/what enforces the abort decision during a real cutover attempt?

| Option | Description | Selected |
|--------|-------------|----------|
| Human operator, documented criteria | Mirrors existing human-checkpoint precedent (release-evidence TTY picker, 07-01's loop) | ✓ |
| Automated script halts on threshold breach | Programmatic enforcement, no human judgment call | |

**User's choice:** Human operator, documented criteria (recommended option).

### Q4 (bonus, folded from the Backup/restore proof area): What counts as backup/restore proof — which database(s)?

| Option | Description | Selected |
|--------|-------------|----------|
| dgfy_* target only | New databases going live; legacy non-mutation already proven | ✓ |
| Both sku_* and dgfy_* | Extra safety net for legacy too | |
| Not sure — explore this more | | |

**User's choice:** dgfy_* target only (recommended option).

**Notes:** After this batch, user selected "Next area" (no further questions on this area), then at the end-of-round checkpoint selected "I'm ready for context" rather than exploring the two remaining candidate areas (Deferred-domain-split artifact / Runbook document shape) — both left to Claude's Discretion in CONTEXT.md.

---

## Claude's Discretion

- Backup/restore tooling/mechanism for the dgfy_* proof (mysqldump, snapshot, etc.)
- Whether the SC3 deferred-domain-split artifact is a new document, a cross-reference update to existing REQUIREMENTS.md/PROJECT.md sections, or both
- Whether SC2/SC3 evidence extends 07-01's runbook doc or lives in a separate cutover-runbook doc
- Exact wall-clock cutoff value (operator-set parameter, not hardcoded)

## Deferred Ideas

- A real traffic/DNS/API-base-URL repoint-and-revert mechanism — belongs to the future full-cutover milestone once wholesale cutover to the new API actually happens (Phase 5 D-02), not this phase.
- Legacy (sku_*) backup/restore proof — explicitly rejected in favor of dgfy_*-only scope; legacy non-mutation is already proven by existing fingerprint tooling.
