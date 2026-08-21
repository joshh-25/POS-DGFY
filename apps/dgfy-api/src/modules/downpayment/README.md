# Downpayment Module

Phase 138 (#820) of the #815/#273 downpayment epic: per-tenant config surface (`payment_mode`,
downpayment amount/type, refundability, allowed capture methods). Governed by ADR 0069, clause 5
(config-surface steer) and clause 7 (Retail-only enforcement).

`tenant_downpayment_settings` is a **landlord** table (one row per tenant), not a tenant-DB table
-- see `apps/dgfy-api/src/models/Landlord/TenantDownpaymentSettings.js`.

This module will keep growing through the epic's later phases (capture, refund/forfeiture, balance
settlement) as their own use cases/controllers land here.
