# Feature Docs

When to use:
1. Feature-level behavior and constraints
2. Functional expectations for implementation/testing
3. Product behavior references by domain

## Current Feature References

1. `docs/features/IMS_POS_SALES_UX_JOURNEY.md`
- Canonical role-based journey for IMS item setup -> POS checkout -> POS history -> Sales export, including workflow-mode and POS readiness gate behavior.
2. `docs/features/POS_STOREFRONT_SOURCE_SEPARATION_CONTRACT.md`
- Canonical source-separation contract for POS in-store vs storefront online transactions across write paths, POS history, and unified sales read model.
3. `docs/features/INVENTORY_FOLDERS.md`
- Folder behavior and visibility semantics across item browsing surfaces.
4. `docs/features/NESTED_PRODUCTS.md`
- Nested product composition behavior and constraints.
5. `docs/features/TENANT_MANAGEMENT.md`
- Tenant lifecycle and management constraints, including isolation and provisioning rules.

## Usage Notes

1. Treat this folder as feature behavior reference, not architecture authority.
2. For cross-feature decisions, reconcile with ADRs before implementation:
- `docs/architecture/adr/0005-unified-sales-read-model.md`
- `docs/architecture/adr/0006-skupervisor-expansion-program-boundaries.md`
- `docs/architecture/adr/0007-dual-mode-pos-compliance-program.md`
- `docs/architecture/adr/0008-tenant-workflow-mode-msme-simplification.md`
