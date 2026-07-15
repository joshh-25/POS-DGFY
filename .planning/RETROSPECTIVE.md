# Project Retrospective — DGFY Standalone Refactor

Living retrospective across milestones. Newest milestone first.

## Milestone: v2.1 — Legacy Data Migration

**Shipped:** 2026-07-15
**Phases:** 4 (12, 13, 13.5, 14) | **Plans:** 25

### What Was Built
Legacy product/inventory and POS sales-history data migration into the new `dgfy_*` schema: additive schema extension (Phase 12), product/inventory/embedding mappers with dry-run/apply/idempotency-retry/verify (Phase 13), a tenant-local staff-auth model correction (inserted Phase 13.5), and `pos_transactions`/`pos_transaction_lines` → `availments`/`availment_items` with provenance and exact monetary + void fidelity (Phase 14). Proven end-to-end by a real-volume six-entity rehearsal on a disposable production-parity EC2 (26 tenants), gated by a machine-checkable evidence contract and a blocking operator human-verify checkpoint.

### What Worked
- **Disposable production-parity EC2 rehearsal** (`dgfy-temp`) gave real-volume proof without touching production, sidestepping the arm64/amd64 GHCR-image mismatch that blocked local rehearsal.
- **Machine-checkable evidence + a single shared validator** made the final human checkpoint a focused judgment (one exemption to weigh) rather than a manual audit.
- **Inserting Phase 13.5** to correct the staff-auth model mid-milestone, rather than forcing it into 13 or deferring, kept each phase's scope honest.

### What Was Inefficient
- **Stale HANDOFF/continue-here artifacts** from a token-exhausted pause described 14-05 as in-flight when work had actually reached 14-10; resuming required reconciling against git rather than trusting the handoff. Lesson: on resume, trust git + SUMMARY presence over paused-session handoff files.
- **13-06 left without a SUMMARY** made Phase 13 look incomplete to tooling even though its proof was subsumed by 14-10; a retroactive close was needed at milestone time.

### Patterns Established
- **Source-zero exemption ("empty is truthful," D-14-10-01):** a legitimately empty source entity is accepted as truthfully migrated (0→0) when documented in an `exemptions[]` record, rather than blocking on a strict all-entities-non-vacuous contract.
- **Override closeout with a durable KNOWN-GAPS register:** ship with documented, tracked gaps rather than gold-plating; `.planning/KNOWN-GAPS.md` carries them forward.

### Key Lessons
- A real-data rehearsal will surface truths the fixtures can't (here: production has no embeddings yet) — design the evidence contract to distinguish "empty source" from "failed migration."
- Non-autonomous human checkpoints (14-09 authorization, 14-11 review) earned their keep on genuinely destructive/production-parity work; keep them hard stops.

### Carry-Forward
- G-01/G-02 (compliance-gate demotion + transactional write) are blocking-before-production and most relevant to the upcoming frontend/checkout integration.
- G-04 embedding carry-over remains unproven on real vectors.

---

## Cross-Milestone Trends

_(Populate as more milestones ship.)_
- **Verification rigor:** v2.1 introduced real-volume EC2 rehearsal + blocking human sign-off — the strongest verification in the project to date.
- **Recurring debt theme:** fiscal compliance-gate correctness (FSC-01/G-01) has surfaced across Phase 8 and been carried into v2.1's gap register — a candidate for a dedicated closure phase.
