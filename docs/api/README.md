# API Docs

When to use:
1. API contracts and endpoint semantics
2. Request/response format decisions
3. Integration behavior between frontend and backend

## Current Notes
1. Tenant onboarding contract includes advisory questionnaire classification via `step_key=business_classification`.
2. `GET /onboarding/status` exposes `tenant_onboarding_progress.classification_snapshot` (`visibility_mode`, `customer_access_mode`, `inventory_display_mode`, `monetization_tier`, `workflow_mode_recommendation`, `compliance_path_hint`).
3. Onboarding classifier telemetry event keys include `classifier_viewed`, `classifier_saved`, and `classifier_skipped`.
4. Company user invitations are token-first. `POST /auth/accept-invite` resolves tenant context from the landlord invitation registry and returns the same usable auth payload shape as login.
5. Admin user-management invitation actions are documented in `docs/api/specification.md`: create invite, include pending invitations, resend, copy/generate manual link, and cancel.
6. Customer Access Mode and Inventory Display are public Storefront API contracts behind `CUSTOMER_ACCESS_MODES_ENABLED` or `CUSTOMER_ACCESS_MODES_ENABLED_TENANTS`. Discovery/profile/catalog responses expose additive access metadata; quote, checkout, public service booking, and waitlist mutations fail closed with `CUSTOMER_ACCESS_MODE_BLOCKED` when effective mode does not permit the action.
7. Public storefront catalog payloads intentionally omit raw `current_stock` and `cost_per_unit`; clients must use `inventory_display` for customer-facing stock labels and optional public display quantity.
8. Barcode APIs are split by surface: `/items/*/barcodes` manages tenant-local identities and labels, `/pos/scan` applies POS readiness before cart use, and `/store/qr/resolve` exposes only Storefront-safe public QR payloads.
9. Customer-facing sale APIs use `default_sale_price` only. POS, Storefront checkout/QR, Dispatch Orders, and future sale surfaces must reject missing or zero selling price instead of falling back to `cost_per_unit`; internal cost remains for stock movement, valuation, COGS, and profitability reporting only.
