# Food & Beverage Module

This tenant-local module owns Food & Beverage Mode restaurant workflow APIs.

Boundaries:

- Routes call F&B handlers only.
- Handlers call F&B use cases only.
- Use cases contain lifecycle, modifier, service-charge, and table/check workflow rules.
- Repositories own Sequelize access for F&B tables and F&B-specific settings.
- POS remains the owner of final checkout, fiscal/non-fiscal receipt selection, and stock deduction; it receives additive F&B metadata and immutable snapshots.

The module is guarded by `requireWorkflowCapability('fnbDining')` and follows ADR 0019.
