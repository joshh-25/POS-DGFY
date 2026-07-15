# Phase 5: Compatibility and Backend-First Cutover Seam - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-12
**Phase:** 5-Compatibility and Backend-First Cutover Seam
**Areas discussed:** Deliverable shape, Inventory format, Guardrail enforcement, Acceptance & removal

---

## Deliverable Shape

### What should Phase 5 ship?

| Option | Description | Selected |
|--------|-------------|----------|
| Framework-only | Inventory + governance + guardrail, no adapter (no live cross-path exists) | |
| Framework + reference seam | All of the above plus one concrete reference seam | ✓ |
| Framework + scaffold only | Framework plus a non-wired adapter template | |

**User's choice:** Framework + reference seam.

### Which real path should the reference seam translate?

| Option | Description | Selected |
|--------|-------------|----------|
| Auth / session bridge | Legacy client login/session resolves against new dgfy-api Accounts + activation | |
| Tenant/business resolution | Legacy client resolves tenant DB/business via new registry + activate-session | |
| You describe it | User-specified path | ✓ |

**User's choice (free text):** "Move all transactions into the new API as soon as I prove it working. There's no 'legacy' — all frontends are rewritten inside `apps/*` (e.g. `apps/dgfy-pos`) and communicate with the new API, keeping the backend intact as a developer-manual backup." Then refined: "Ideally the dgfy-api should already have everything it needs — think forward. The backend is just an external backup; migrations occur at DB-level + some scripts to keep the domains intact."

**Notes:** This reframe removed the runtime "legacy-frontend → adapter → new-backend" premise entirely. dgfy-api is self-contained (no runtime legacy dependency either direction); continuity is data-level only.

### Given the reframe, what is the real reference seam?

| Option | Description | Selected |
|--------|-------------|----------|
| DB-continuity seam | DB-level domain-continuity script(s) that keep the legacy backup intact = the reference seam | ✓ |
| Framework-only after all | No new seam artifact; framework stands ready | |
| Still a runtime adapter | A foreseen request-time old↔new touch justifying an API adapter | |

**User's choice:** DB-continuity seam.
**Notes:** The DB-level continuity script is the one real, temporary legacy touch; gets inventory entry + rollback + removal criteria; guardrail keeps it out of canonical dgfy-api domain contracts. No runtime API adapter.

---

## Inventory Format

### What form should the compatibility inventory take?

| Option | Description | Selected |
|--------|-------------|----------|
| Manifest + generated doc | Machine-readable manifest as source of truth; markdown generated from it; Phase 6 consumes manifest | ✓ |
| Markdown doc only | Single living markdown table, human-first | |
| Code annotations | Tag seams in code, scan to generate report | |

**User's choice:** Manifest + generated doc.

### Manifest location and format?

| Option | Description | Selected |
|--------|-------------|----------|
| YAML in docs/architecture | `compatibility-seams.yaml` source + generated `COMPATIBILITY_INVENTORY.md` | ✓ |
| JSON in docs/architecture | Same location, JSON to match config tooling | |
| You decide | Planner picks format/path | |

**User's choice:** YAML in docs/architecture.
**Notes:** JSON at the same path/schema is an accepted fallback if adding a YAML parser dependency is undesirable.

---

## Guardrail Enforcement

### How to enforce SC3 (compat code out of canonical domain contracts)?

| Option | Description | Selected |
|--------|-------------|----------|
| Extend ADR-0004 automation | Confine seam code; domain imports 0 compat; CI fails if code seam has no matching manifest entry | ✓ |
| Dedicated dir + import rules | `compat/` as only legal home, eslint no-restricted-imports | |
| Manual review gate | No new automation, human review only | |

**User's choice:** Extend ADR-0004 automation.

---

## Acceptance & Removal

### What forces rationale/tests/rollback/removal-criteria before merge?

| Option | Description | Selected |
|--------|-------------|----------|
| Manifest-gated in CI | Complete manifest entry + passing referenced tests = accepted; CI is the authority | ✓ |
| PR checklist + review | PR template section, human sign-off | |
| ADR per seam | Each seam gets its own ADR | |

**User's choice:** Manifest-gated in CI.
**Notes:** Same CI check as the guardrail, reading the same manifest — manifest is the spine.

---

## Claude's Discretion

- Concrete internals of the DB-level continuity script(s) (which domains, how reconciled) — for research/planning against the Phase 1–3 runner and `dgfy_*` schema contracts.
- Exact manifest field schema details (enum values, whether `tests` is paths or ids) — planner's call, provided the six core fields are present and machine-validated.
- Exact designated location/path for compat code — planner's call, provided it is outside the canonical domain layer and enforced by the extended compliance check.
- Format fallback (JSON vs YAML) if YAML parser dependency is undesirable.

## Deferred Ideas

- Product / POS / payments / fiscal domain APIs in dgfy-api (post-foundation milestones).
- Frontend migration into `apps/*` surfaces, e.g. `apps/dgfy-pos` (until backend + compatibility evidence exists).
- Wholesale transaction cutover to the new API (future milestone, once new API proven).
- Runtime request-time API adapters (not needed in the self-contained-API target model; framework ready to govern if a cross-path ever emerges).
