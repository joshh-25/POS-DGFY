# OPIS canonical business name

## Purpose

OPIS is the admin-only home for changing the actual business name shown by the tenant identity. The canonical value is stored on the landlord `tenants.name` record, then synchronized to the tenant POS display setting.

## Behavior

- An admin or master admin can open `Settings → Profile` in OPIS and update the canonical business name.
- The editor is rendered inside the `Profile Setting` pane. OPIS does not expose a second editable business-name control in `POS Setup → Business & Receipts`; that pane is reserved for receipt and fiscal metadata.
- The API validates the name, updates the landlord tenant record, the tenant POS display setting (`pos_business_name`), and its audit row, then refreshes the storefront discovery index.
- Tenant IDs, storefront URLs, QR tokens, products, orders, reports, and branch records are unchanged.
- Registered Name, TIN, branch tax identifiers, and other fiscal/receipt metadata are unchanged.
- Non-admin users can see the current identity but cannot submit a rename.
- Re-saving the current name is a no-op when the POS display name is already synchronized; it does not create an audit row or run a discovery sync.
- After a successful save, OPIS updates its visible business name immediately. An open POS terminal receives a tenant-scoped authenticated settings invalidation and reloads its settings without a page refresh.
- An open Storefront revalidates the public profile while visible (on focus/visibility and on a 30-second interval) and updates the business name in place without reloading the catalog, branch selection, cart, or checkout state.

## Controlled POS synchronization

The rename updates only the POS `pos_business_name` setting because POS uses that value for its business/display name and tenant-facing receipts. It deliberately does not update `pos_registered_name`, `pos_business_style`, `pos_tin_branch`, `pos_fiscal_*`, or other fiscal/receipt fields. The API coordinates the tenant and POS updates with compensation if the landlord transaction fails, so a failed rename does not intentionally leave the two display names split.

The settings invalidation is an event only; it contains no business data. The POS re-reads its authorized settings from the API, which keeps the database as the source of truth and preserves tenant isolation.

## Audit and rollout

Every successful name change creates a `business_name_update` entry in `tenant_admin_audit_logs`. The migration runner migration `20261015000001-extend-tenant-admin-audit-actions-business-name.cjs` must be applied before enabling the write path in an environment.
