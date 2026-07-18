# Phase 6: Release Evidence and Rehearsal Gates - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-12
**Phase:** 6-Release Evidence and Rehearsal Gates
**Areas discussed:** Evidence bundle integration, Tenant drift scope, Compatibility seam checks, Trigger point, Tenant selection UX

---

## Evidence Bundle Integration

| Option | Description | Selected |
|--------|-------------|----------|
| Extend existing gate pattern | Add DGFY-specific gates into the same `release_verdict.json` + `gates[]` shape `scripts/gate-release-local.js` already produces | ✓ |
| Separate DGFY-specific bundle | New standalone evidence artifact independent of the legacy release-gate pipeline | |
| Not sure — you decide | Let research/planning investigate both | |

**User's choice:** Extend existing gate pattern.
**Notes:** One release evidence system for the whole platform rather than a parallel DGFY-only one.

---

## Tenant Drift Scope

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-discover all active tenants | Query registry for every active tenant and check automatically, no manual selection | |
| Keep operator-supplied list | Static env-configured target list, as today | |
| Not sure — you decide | Let research determine feasibility | |
| *(free-text alternative)* | Command-driven discovery + operator selection | ✓ |

**User's choice:** Neither pre-set option — user proposed a third path: discover active tenants via a command, then let the operator select which tenants ("businesses") to include for this run.
**Notes:** "I was thinking, we do this not automatically, but executing a command, discovering existing active tenants, and selecting which tenants to migrate; this way, we can safely pick which tenants to be moved into the new system... this helps us filter out businesses that are currently there for testing purposes." Captured as D-02 in CONTEXT.md.

---

## Tenant Selection UX (follow-up)

| Option | Description | Selected |
|--------|-------------|----------|
| List + `--targets` flag | List active tenants, then pass chosen IDs via flag — scriptable/CI-friendly | |
| Interactive terminal prompt | Checklist-style prompt to select tenants inline | ✓ |
| Not sure — you decide | Let research/planning pick based on CLI structure | |

**User's choice:** Interactive terminal prompt.
**Notes:** Human-in-the-loop selection moment, not a purely scriptable flag interface.

---

## Compatibility Seam Checks

| Option | Description | Selected |
|--------|-------------|----------|
| Generic manifest-driven runner | Reads `tests` field from every active manifest entry, scales to future seams | ✓ |
| Specific to verifyContinuity only | Hardcode today's one seam | |
| Not sure — you decide | Let research/planning weigh effort vs. future-proofing | |

**User's choice:** Generic manifest-driven runner.

---

## Trigger Point

| Option | Description | Selected |
|--------|-------------|----------|
| On-demand release gate | Dedicated pre-release/pre-cutover command, not per-PR | ✓ |
| Wired into per-PR CI | Runs automatically on every relevant PR | |
| Both | Lightweight per-PR + full bundle on-demand | |

**User's choice:** On-demand release gate.

---

## Claude's Discretion

- Exact new command name(s)/CLI structure for the tenant-discovery/selection prompt.
- Interactive-prompt library choice (e.g., `inquirer`, `prompts`) if not already a dependency.
- Exact new gate-entry names/detail strings added to `release_verdict.json`'s `gates[]`.
- Report format/location for migration-verification and tenant-drift reports (must fit `.tmp/release-gates/<sha>/` convention).
- Exact "active" entry lookup for the seam-smoke runner, using the manifest's existing `status` field.

## Deferred Ideas

- Auto-discovery/verification of every active tenant with no operator selection step — explicitly rejected in favor of the interactive-selection model, not deferred, just not chosen.
- Wiring release evidence into per-PR CI — explicitly rejected; on-demand gate stays separate from PR checks.
- Cutover rehearsal, backup/restore, abort thresholds — belongs to Phase 7 (CMP-05), out of this phase's scope by roadmap design, not a discussion-time deferral.
