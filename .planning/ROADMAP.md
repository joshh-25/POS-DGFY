# Roadmap: DGFY Standalone Refactor

## Overview

DGFY moves from an IMS-backed foundation to standalone `dgfy_*` landlord and tenant databases through a database-first Strangler Fig path, keeping the live legacy POS/Storefront available throughout. Architecture decisions follow `docs/START_HERE.md`, `docs/architecture/ARCHITECTURE_BOUNDARIES.md`, `docs/architecture/ARCHITECTURE_GOVERNANCE.md`, and ADR 0003's compatibility-facade strategy.

Full per-phase detail for shipped milestones lives in `.planning/milestones/`. This file is the navigational overview; carried-forward gaps are tracked in `.planning/KNOWN-GAPS.md`.

## Milestones

- 🚧 **v1.0 Standalone Refactor Foundation** — Phases 1–7 (Phases 1–6 complete; **Phase 7 paused** 2026-07-12 pending real Docker/GHCR rehearsal infra — CMP-05 stays Pending, not archived)
- ✅ **v2.0 Commerce Domain — Product, Checkout & Fulfillment** — Phases 8–11 (shipped 2026-07-14; backend-API-only)
- ✅ **v2.1 Legacy Data Migration** — Phases 12–14 + inserted 13.5 (**shipped 2026-07-15**; see `milestones/v2.1-ROADMAP.md`)
- 📋 **v2.2 Frontend Integration** *(next)* — integrate `apps/dgfy-api` as the live API into the frontend apps once the migration branch merges

## Phases

**Phase numbering:** integer phases are planned milestone work; decimal phases (e.g. 13.5) are urgent insertions marked (INSERTED). Numbering never restarts across milestones.

<details>
<summary>🚧 v1.0 Standalone Refactor Foundation (Phases 1–7) — Phases 1–6 SHIPPED, Phase 7 PAUSED</summary>

- [x] Phase 1: Architecture and Migration Runner Contract (completed 2026-07-10)
- [x] Phase 2: DGFY Database Foundation (completed 2026-07-11)
- [x] Phase 3: Old-to-New Migration Proof (completed 2026-07-11)
- [x] Phase 4: Backend Accounts, Businesses, and Tenancy Foundation (completed 2026-07-11)
- [x] Phase 5: Compatibility and Backend-First Cutover Seam (completed 2026-07-12)
- [x] Phase 6: Release Evidence and Rehearsal Gates (completed 2026-07-12)
- [ ] Phase 7: Cutover Runbook and Deferred Domain Split — **PAUSED 2026-07-12** (needs real Docker/GHCR rehearsal infra + operator-run docker login; can reuse the `dgfy-temp` EC2 approach proven in v2.1. Resume with `/gsd-execute-phase 7`.)

</details>

<details>
<summary>✅ v2.0 Commerce Domain — Product, Checkout & Fulfillment (Phases 8–11) — SHIPPED 2026-07-14</summary>

- [x] Phase 8: Commerce Foundation — Product Catalog, Booking, Shift & Cash Drawer, Compliance Gating (completed 2026-07-13) — ⚠ carries open gap FSC-01/G-01 (see KNOWN-GAPS.md)
- [x] Phase 9: POS Checkout & Payment (completed 2026-07-13)
- [x] Phase 10: Storefront Discovery & Online Ordering (completed 2026-07-13)
- [x] Phase 11: Order Fulfillment & Delivery Coordination (completed 2026-07-14)

</details>

<details>
<summary>✅ v2.1 Legacy Data Migration (Phases 12–14 + 13.5) — SHIPPED 2026-07-15</summary>

- [x] Phase 12: Scope Unblock + Schema Extension (completed 2026-07-14)
- [x] Phase 13: Product & Inventory Migration (completed 2026-07-15; re-rehearsal proof delivered by the Phase 14 full-milestone rehearsal)
- [x] Phase 13.5: Staff Authentication Model Correction (INSERTED) (completed 2026-07-14)
- [x] Phase 14: Sales History Migration & Full Verification (completed 2026-07-15; operator-approved real-volume rehearsal, override closeout — see MILESTONES.md)

Full detail: `.planning/milestones/v2.1-ROADMAP.md`

</details>

### 📋 v2.2 Frontend Integration (next — not yet planned)

- [ ] Integrate `apps/dgfy-api` as the new live API into the frontend apps (dgfy-storefront / pos / business), once the migration branch merges. Surface G-01/G-02 (compliance-gate) early since checkout depends on the compliance gate. Start with `/gsd-new-milestone`.

## Progress

| Milestone | Phases | Status | Completed |
| --------- | ------ | ------ | --------- |
| v1.0 Foundation | 1–6 (7 paused) | 6/6 shipped | 2026-07-12 |
| v2.0 Commerce Domain | 8–11 | Shipped | 2026-07-14 |
| v2.1 Legacy Data Migration | 12–14 + 13.5 | Shipped | 2026-07-15 |
| v2.2 Frontend Integration | TBD | Not started | — |

Per-phase plan/task metrics for shipped milestones are preserved in `.planning/milestones/` and `.planning/RETROSPECTIVE.md`.
