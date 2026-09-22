# Compatibility Seam Inventory

<!-- GENERATED FILE -- do not hand-edit. -->
<!-- Source of truth: docs/architecture/compatibility-seams.json -->
<!-- Regenerate with: npm run generate:compat-inventory -->

Every legacy compatibility seam approved for the database-first cutover (CMP-02) is declared in the manifest and rendered here for human review. This file is deterministically generated -- edit the manifest, not this document.

| id | type | status | rationale | tests | rollback | removal_criteria |
| --- | --- | --- | --- | --- | --- | --- |
| `db-continuity-legacy-backup` | db-level | removed | Non-destructively verified the legacy backup's (SOURCE_DB) domain tables remained intact during/after the database-first cutover, proving CMP-01 while dgfy-api and dgfy-migration-runner ran beside legacy. Removed: apps/dgfy-migration-runner's from-scratch data-migration CLI (verifyContinuity command and its test) was replaced with a self-contained Sequelize migrate-only runner, which has no continuity-verification surface. | _(none)_ | Seam is read-only; disabling it has no data effect. Revert by removing the command and its manifest entry. | Legacy backup decommissioned (future milestone, CUT-02). |
